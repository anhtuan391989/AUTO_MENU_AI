"use strict";

// Knob "Hiệu Ứng" (#fxSoundVolKnob) = âm lượng CHUNG của cả Bảng Hiệu Ứng độc lập.
// Chạy: node tests/unit/EffectsVolumeKnob.verify.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");

let pass = 0;
let fail = 0;
function check(cond, name) {
    if (cond) { pass++; } else { fail++; console.log("FAIL:", name); }
}

const renderer = read("ui/js/renderer.js");

// ---- Trích SoundEffectEngine thật từ renderer.js, chạy với Audio giả ----
const startMarker = "const SoundEffectEngine = (() => {";
const start = renderer.indexOf(startMarker);
const end = renderer.indexOf("\n})();", start);
check(start > 0 && end > start, "tìm thấy SoundEffectEngine trong renderer.js");

class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.loop = false; this.handlers = {}; this.playCalls = 0; }
    addEventListener(ev, cb) { this.handlers[ev] = cb; }
    play() { this.playCalls++; return Promise.resolve(); }
    pause() {}
}
const sandbox = { Audio: FakeAudio, console };
vm.createContext(sandbox);
vm.runInContext(renderer.slice(start, end + 5).replace("const SoundEffectEngine", "var SoundEffectEngine"), sandbox);
const engine = sandbox.SoundEffectEngine;
check(!!engine && typeof engine.setVolume === "function", "SoundEffectEngine nạp được");

// Lấy audio của từng effect: toggle để tạo trạng thái, đọc volume qua đối tượng FakeAudio khởi tạo
const audios = [];
const OrigAudio = FakeAudio;
// (đọc lại bằng cách dựng engine mới với Audio ghi nhớ instance)
const sb2 = { Audio: class extends OrigAudio { constructor(s) { super(s); audios.push(this); } }, console };
vm.createContext(sb2);
vm.runInContext(renderer.slice(start, end + 5).replace("const SoundEffectEngine", "var SoundEffectEngine"), sb2);
const eng2 = sb2.SoundEffectEngine;
check(audios.length === 2, "có đúng 2 hiệu ứng có âm thanh (CLAP, LAUGH)");
const clap = audios.find((a) => /Vo-Tay/i.test(a.src));
const laugh = audios.find((a) => /Cuoi-Deu/i.test(a.src));

eng2.setVolume("ALL", 70);
check(Math.abs(clap.volume - 0.7) < 1e-9 && Math.abs(laugh.volume - 0.7) < 1e-9, "setVolume('ALL', 70) -> cả CLAP và LAUGH = 0.7");
eng2.setVolume("ALL", 0);
check(clap.volume === 0 && laugh.volume === 0, "setVolume('ALL', 0) -> tắt tiếng cả bảng");
eng2.setVolume("ALL", 250);
check(clap.volume === 1 && laugh.volume === 1, "giá trị > 100 bị kẹp về 1");
eng2.setVolume("ALL", -5);
check(clap.volume === 0 && laugh.volume === 0, "giá trị âm bị kẹp về 0");
eng2.setVolume("ALL", "abc");
check(clap.volume === 0 && laugh.volume === 0, "giá trị rác -> 0, không NaN");
eng2.setVolume("CLAP", 30);
check(Math.abs(clap.volume - 0.3) < 1e-9 && laugh.volume === 0, "setVolume riêng lẻ vẫn hoạt động độc lập như cũ");
eng2.setVolume("KHONG_TON_TAI", 80);
check(Math.abs(clap.volume - 0.3) < 1e-9, "effect không tồn tại không làm hỏng gì");
eng2.setVolume("ALL", 55);
eng2.toggle("LAUGH");
check(Math.abs(laugh.volume - 0.55) < 1e-9 && laugh.playCalls === 1, "phát LAUGH sau khi chỉnh knob -> đúng âm lượng 0.55");

// ---- Nối dây tĩnh ----
check(/\{ id: "fxSoundVolKnob", valueId: "fxSoundVolValue", value: 50, defaultValue: 50 \}/.test(renderer), "knobData có fxSoundVolKnob (kéo/lăn/double-click/lưu như knob khác)");
check(/fxSoundVolKnob: "ALL"/.test(renderer), "KNOB_ID_TO_SOUND_EFFECT: fxSoundVolKnob -> ALL");
check(/KNOB_ID_TO_SOUND_EFFECT\[k\.id\] === "ALL"[\s\S]{0,80}SoundEffectEngine\.setVolume/.test(renderer), "đồng bộ âm lượng ngay lúc khởi tạo knob");
check(/onEffectsPlay\?\.\(\(effectId\) =>/.test(renderer) && /effectId !== "CLAP" && effectId !== "LAUGH"/.test(renderer), "renderer nhận effects-play và chỉ chấp nhận CLAP/LAUGH");
check(/SoundEffectEngine\.toggle\(effectId\)/.test(renderer), "effects-play -> SoundEffectEngine.toggle (cùng state machine nút CLAP/LAUGH cũ)");

const preload = read("app/preload.js");
check(preload.includes('playEffect: (effectId) => ipcRenderer.send("effects-play", effectId)'), "preload: playEffect gửi effects-play");
check(preload.includes('onEffectsPlay: (callback) => ipcRenderer.on("effects-play"'), "preload: onEffectsPlay nhận effects-play");

const main = read("app/main.js");
check(/ipcMain\.on\("effects-play"[\s\S]*isFromEffects\(event\.sender\)[\s\S]*effectId !== "CLAP" && effectId !== "LAUGH"[\s\S]*mainWin\.webContents\.send\("effects-play", effectId\)/.test(main), "main: effects-play kiểm tra nguồn + id rồi chuyển cho menu");

const html = read("ui/effects.html");
check(/data-effect="LAUGH"/.test(html) && /data-effect="CLAP"/.test(html), "effects.html: 2 nút có âm thanh gắn data-effect");
check(/api\.playEffect\(btn\.getAttribute\("data-effect"\)\)/.test(html), "effects.html: bấm nút gọi playEffect");
check(/Hiệu ứng 1/.test(html) && /Hiệu ứng 2/.test(html), "effects.html: Hiệu ứng 1/2 vẫn còn");

const index = read("ui/index.html");
check(index.includes('id="fxSoundVolKnob"') && index.includes('id="fxSoundVolValue"'), "index.html có sẵn knob Hiệu Ứng (không sửa HTML)");

console.log(`\nEffectsVolumeKnob: ${pass} đạt, ${fail} lỗi`);
process.exit(fail === 0 ? 0 : 1);
