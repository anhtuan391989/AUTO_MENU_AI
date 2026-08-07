/**
 * core/command-engine-js/runtime.js — MỚI THÊM (task MIDI CONTROL CORE v1.0)
 * -----------------------------------------------------------------------
 * KHÔNG viết lại CommandEngine/capabilityRegistry — chỉ WIRE chúng vào runtime thật.
 *
 * Đường đi:
 *   MIDI Input (easymidi, Node, main process)
 *     -> normalize {type, channel, number, value}
 *     -> Map lookup O(1) (key = "type:channel:number", xây 1 lần khi load mapping)
 *     -> commandEngine.dispatch({ targetId, action })
 *     -> driver ('mcu' = alias của MidiDriver, hoặc 'hotkey' fallback theo đúng
 *        priority đã khai báo sẵn trong capabilityRegistry.js — KHÔNG đổi thứ tự đó)
 *
 * KHÔNG có AI trong đường này — chỉ đọc settings tĩnh + Map lookup + gọi driver.
 *
 * Chỉ wire nhóm Transport (transportPlay/transportStop/transportRecord) cho studio_one,
 * đúng thứ tự ưu tiên "Studio One trước, Transport trước" của Mục 7-8. Các action group
 * khác (Menu/Preset/Key-Mod/Plugin) mà Setup đã cho Learn+Save vẫn được LƯU nguyên vẹn,
 * nhưng KHÔNG được dispatch — coi là "captured, chưa map tới capability nào".
 */

const CommandEngine = require("./commandEngine");
const HotkeyDriver = require("./drivers/hotkeyDriver");
const MidiDriver = require("./drivers/midiDriver");

// Chỉ nhóm action đã có thật trong capabilityRegistry cho studio_one, đúng thứ tự
// ưu tiên "Transport trước" — action khác Setup có thể Learn/Save nhưng chưa dispatch.
const ACTION_TO_CAPABILITY = {
    "daw:play": { targetId: "studio_one", action: "transportPlay" },
    "daw:stop": { targetId: "studio_one", action: "transportStop" },
    "daw:record": { targetId: "studio_one", action: "transportRecord" },
};

let engine = null;
let midiDriverInstance = null;
let midiInput = null;
let mappingIndex = new Map(); // key "type:channel:number" -> { action }
let started = false;
let deps = null; // { readSettingsFile }
let lastDispatchAt = new Map(); // key -> timestamp, chống double-fire khi connect() gọi nhiều lần

function log(...args) {
    console.log("[CommandRuntime]", ...args);
}

function buildMappingIndex(settings) {
    const list = Array.isArray(settings?.midiMappingsV1) ? settings.midiMappingsV1 : [];
    const index = new Map();
    for (const m of list) {
        // Chỉ những mapping có đủ field cấu trúc (type/channel/number) mới vào được index O(1).
        // Mapping cũ dạng chỉ có "trigger" (chuỗi hiển thị, từ bản trước khi có runtime này)
        // bị bỏ qua an toàn — không đoán/parse chuỗi tự do.
        if (m && m.type && m.channel != null && m.number != null && ACTION_TO_CAPABILITY[m.action]) {
            const key = `${m.type}:${m.channel}:${m.number}`;
            index.set(key, { action: m.action });
        }
    }
    return index;
}

function normalizeMidiMessage(bytes) {
    const status = bytes[0];
    const type = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    if (type === 0x90 && bytes[2] > 0) return { type: "note", channel, number: bytes[1], value: bytes[2] };
    if (type === 0x80 || (type === 0x90 && bytes[2] === 0)) return null; // bỏ note-off, không dispatch
    if (type === 0xb0) return { type: "cc", channel, number: bytes[1], value: bytes[2] };
    return null; // Pitch Bend / Program Change: chưa wire theo đúng thứ tự ưu tiên Mục 4
}

async function dispatchFromMidi(msg) {
    const key = `${msg.type}:${msg.channel}:${msg.number}`;
    const mapping = mappingIndex.get(key);
    if (!mapping) return;

    const cap = ACTION_TO_CAPABILITY[mapping.action];
    if (!cap || !engine) return;

    // Chống 1 event bắn nhiều lệnh nếu listener bị gắn trùng (Mục 12 — connect() x3).
    const now = Date.now();
    const lastAt = lastDispatchAt.get(key) || 0;
    if (now - lastAt < 60) return; // debounce 60ms, không phải business logic — chỉ chống double-listener
    lastDispatchAt.set(key, now);

    const result = await engine.dispatch(cap);
    log("dispatch", key, "->", cap.action, result);
}

function openMidiInput(portName) {
    if (!portName) {
        log("Chưa có midiOutputPort trong settings — bỏ qua mở MIDI Input thật.");
        return;
    }
    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        const inputs = easymidi.getInputs();
        if (!inputs.includes(portName)) {
            log(`Cổng "${portName}" không có trong danh sách MIDI Input thật (${inputs.join(", ") || "không có cổng nào"}) — bỏ qua, không bịa kết nối.`);
            return;
        }
        if (midiInput) {
            midiInput.close();
            midiInput = null;
        }
        midiInput = new easymidi.Input(portName);
        midiInput.on("noteon", (m) => dispatchFromMidi({ type: "note", channel: m.channel + 1, number: m.note, value: m.velocity }));
        midiInput.on("cc", (m) => dispatchFromMidi({ type: "cc", channel: m.channel + 1, number: m.controller, value: m.value }));
        log(`Đã mở MIDI Input thật: "${portName}".`);
    } catch (err) {
        log("Không mở được MIDI Input thật:", err.message);
        midiInput = null;
    }
}

function closeMidiInput() {
    try { midiInput?.close(); } catch { /* bỏ qua */ }
    midiInput = null;
}

/**
 * start({ readSettingsFile }) — gọi 1 LẦN lúc app.whenReady(), trong try/catch ở main.js.
 * Không bao giờ throw ra ngoài — mọi lỗi tự log và để CommandEngine ở trạng thái "không driver
 * MIDI/hotkey nào sẵn sàng" thay vì làm crash app.
 */
function start({ readSettingsFile }) {
    if (started) return;
    started = true;
    deps = { readSettingsFile };

    engine = new CommandEngine();
    engine.on("feedback", (entry) => log("feedback", JSON.stringify(entry)));

    // HotkeyDriver: không phụ thuộc npm package ngoài `net` (Node builtin) — luôn an toàn require.
    try {
        const hotkey = new HotkeyDriver();
        engine.registerDriver(hotkey);
    } catch (err) {
        log("Không khởi tạo được HotkeyDriver:", err.message);
    }

    // MidiDriver: cần easymidi (đã có trong package.json/node_modules — xác nhận qua audit).
    // Mở lại ĐÚNG cổng loopMIDI người dùng đã chọn trong Setup (virtual:false) thay vì tạo
    // cổng ảo thứ hai — tránh sinh hệ thống MIDI song song (đúng yêu cầu Mục 1/9 của task).
    try {
        const settings = readSettingsFile() || {};
        const portName = settings.midiOutputPort;
        if (portName) {
            midiDriverInstance = new MidiDriver(portName, false);
            engine.registerDriver(midiDriverInstance); // đăng ký dưới tên 'midi'
            engine.drivers.set("mcu", midiDriverInstance); // ALIAS — studio_one dùng tên 'mcu', không phải 'midi'
            log(`MidiDriver (mở lại cổng có sẵn "${portName}") sẵn sàng, alias 'mcu'.`);
        } else {
            log("Chưa có midiOutputPort đã lưu — driver 'mcu' sẽ không sẵn sàng, capabilityRegistry tự fallback sang 'hotkey'.");
        }
        mappingIndex = buildMappingIndex(settings);
        openMidiInput(portName);
    } catch (err) {
        log("Không khởi tạo được MidiDriver — driver 'mcu' sẽ không sẵn sàng, tự fallback 'hotkey'. Lỗi:", err.message);
    }

    log("CommandRuntime start() hoàn tất. Drivers sẵn sàng (không đảm bảo isReady()=true):", [...engine.drivers.keys()]);
}

/** reloadMappings() — gọi lại khi Setup lưu mapping/port mới (hook vào ipcMain.on("setup-changed")). */
function reloadMappings() {
    if (!started || !deps) return;
    try {
        const settings = deps.readSettingsFile() || {};
        mappingIndex = buildMappingIndex(settings);
        const portName = settings.midiOutputPort;
        // Chỉ mở lại Input nếu người dùng đổi cổng — tránh đóng/mở liên tục không cần thiết.
        openMidiInput(portName);
        log("Đã nạp lại mapping + MIDI Input theo settings mới nhất.");
    } catch (err) {
        log("reloadMappings lỗi:", err.message);
    }
}

/** dispatch(payload) — dùng cho ipcMain.handle("ai-command", ...). preload.js hiện gọi
 * sendCommand(text) với text dạng chuỗi tự do (dành cho hướng "voice -> command" sau này,
 * xem Mục 13) — CHƯA có NLP nào để tự diễn giải chuỗi đó, nên nếu payload không phải object
 * {targetId, action} thì trả lỗi rõ ràng, không đoán/không giả lập kết quả thành công. */
async function dispatch(payload) {
    if (!engine) return { ok: false, detail: "CommandRuntime chưa start()." };
    if (typeof payload !== "object" || payload === null || !payload.targetId || !payload.action) {
        return { ok: false, detail: "Cần { targetId, action } — dạng chuỗi tự do (voice command) chưa có NLP diễn giải." };
    }
    return engine.dispatch(payload);
}

function stop() {
    closeMidiInput();
    started = false;
}

module.exports = { start, stop, dispatch, reloadMappings };
