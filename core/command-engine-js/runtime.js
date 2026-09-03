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
// TASK B38 — D1 Runtime Loader (docs/d1/midi-mapping.xml -> XSD -> Semantic -> mapping thật).
// Xem ghi chú chi tiết ở khối "TASK B38" bên dưới cho lý do ACTION_TO_CAPABILITY vẫn còn.
const d1Loader = require("./d1Loader");

// TASK B2 Mục 1 — CONTRACT: tên virtual port chính thức, đúng nguyên văn (dấu cách thường,
// không gạch dưới/gạch ngang). Không đổi chuỗi này ở bất kỳ đâu khác trong repo.
const AUTO_MENU_AI_PORT_NAME = "AUTO MENU AI";

// Chỉ nhóm action đã có thật trong capabilityRegistry cho studio_one, đúng thứ tự
// ưu tiên "Transport trước" — action khác Setup có thể Learn/Save nhưng chưa dispatch.
//
// TASK B38 — GIỮ NGUYÊN 100% KHÔNG ĐỔI (kể cả không rename): tests/unit/MidiLearnDispatch.verify.js
// (SECTION 3/6/7/8, 46 assertion) đọc TRỰC TIẾP object này bằng tham chiếu cứng — kể cả
// đúng-chính-xác-3-key, đúng-y-nguyên-3-object-value — và gọi buildMappingIndex(settings) một
// cách ĐỒNG BỘ (không await). B38 yêu cầu "không được sửa test chỉ để che regression" nên 2 hàm/
// biến này (ACTION_TO_CAPABILITY, buildMappingIndex, mappingIndex bên dưới) được giữ NGUYÊN VẸN,
// nhưng KHÔNG CÒN là đường dispatch THẬT nữa kể từ B38 — xem dispatchFromMidi() đã đổi sang dùng
// d1GatedMappingIndex (D1-gated, xây từ core/command-engine-js/d1Loader.js, nguồn xác thực DUY
// NHẤT của dispatch thật). Coi 3 thứ dưới đây là LEGACY — giữ lại thuần vì lý do backward-compat
// test, đã ghi rõ trong report B38 (không tự ý xoá test, không tự ý đổi hành vi test).
const ACTION_TO_CAPABILITY = {
    "daw:play": { targetId: "studio_one", action: "transportPlay" },
    "daw:stop": { targetId: "studio_one", action: "transportStop" },
    "daw:record": { targetId: "studio_one", action: "transportRecord" },
};

let engine = null;
let midiDriverInstance = null;
let midiInput = null;
let mappingIndex = new Map(); // LEGACY — xem ghi chú TASK B38 ở ACTION_TO_CAPABILITY. Không còn là nguồn dispatch thật.
let started = false;
let deps = null; // { readSettingsFile }
let lastDispatchAt = new Map(); // key -> timestamp, chống double-fire khi connect() gọi nhiều lần

// TASK B38 — D1-gated mapping index: NGUỒN DISPATCH THẬT DUY NHẤT kể từ B38.
// Mặc định RỖNG (fail-closed đúng mục 11 "validation failed -> KHÔNG được vẫn dùng mapping") —
// chỉ được điền khi loadD1AndRebuild() xác nhận D1 XML qua ĐỦ CẢ XSD (xmllint-wasm) lẫn
// Semantic Validator. Nạp bất đồng bộ (xmllint-wasm dùng worker_threads, không thể sync) —
// xem loadD1AndRebuild() bên dưới; trong lúc chưa nạp xong hoặc nạp lỗi, dispatchFromMidi()
// tự động không làm gì (an toàn, không crash, không dispatch nhầm).
let d1GatedMappingIndex = new Map();
let d1State = { ok: false, stage: "not-loaded", errors: [], lastLoadedAt: null };

// ---------------------------------------------------------------------------
// MIDI-MASTER-01 / Phase 1 — MIDI HEALTH (phía main process).
// CHỈ lưu lại trạng thái THẬT đã biết từ các bước try/catch đã có sẵn ở trên
// (start/openMidiInput) — KHÔNG suy đoán thêm gì, KHÔNG thêm nhánh logic mới nào
// làm thay đổi hành vi dispatch/connect hiện tại. Đây thuần là "đọc lại state nội bộ
// đã tồn tại từ trước" và phơi ra ngoài qua getHealth(), để ui/js/midiHealth.js (renderer)
// có thể hợp nhất với trạng thái Web MIDI (xem Mục 5, 22, 23 của MIDI-MASTER-01).
// ---------------------------------------------------------------------------
let lastOutputError = null; // string | null — lỗi gần nhất khi mở MidiDriver (portName output)
let lastInputError = null;  // string | null — lỗi gần nhất khi mở easymidi.Input
let configuredPortName = null; // portName OUTPUT đọc từ settings tại lần start()/reload gần nhất (giữ tên field cũ — B1 health đã dùng, không đổi shape)
// TASK B2 Mục 4 — tách input khỏi output. configuredInputPortName THEO SAU migration fallback
// (settings.midiInputPort || settings.midiOutputPort) — xem resolveInputPortName().
let configuredInputPortName = null;
let lastPortResolution = null; // kết quả resolvePortSelection() gần nhất — để getHealth()/report biết NGUỒN của port đang dùng (user-selected / auto-menu-ai / fallback / none)

function log(...args) {
    console.log("[CommandRuntime]", ...args);
}

// TASK B2 Mục 4 — Input port MẶC ĐỊNH fallback về Output port cũ (backward compatibility:
// app cũ chỉ có midiOutputPort, không được làm mất cấu hình MIDI hiện có của user).
function resolveInputPortName(settings) {
    return settings?.midiInputPort || settings?.midiOutputPort || null;
}

/**
 * TASK B2 Mục 3 — PORT SELECTION POLICY, hàm THUẦN (không side-effect, không I/O) để
 * LOGIC-TEST được độc lập. Input là dữ liệu ĐÃ discover xong (không tự gọi easymidi ở đây).
 *
 * Priority thật (đúng đề bài):
 *   1. Nếu mode = "manual" (mặc định — giữ đúng hành vi hiện tại của mọi user đã cấu hình
 *      midiOutputPort từ trước) VÀ user đã lưu 1 port cụ thể -> dùng port đó, KHÔNG override
 *      bằng AUTO MENU AI dù nó có tồn tại (đúng "không tự động ghi đè lựa chọn người dùng").
 *   2. Nếu mode = "auto" (user tự bật) -> ưu tiên AUTO MENU AI nếu discover thấy nó tồn tại.
 *   3. Nếu port đã lưu (dù mode nào) không có trong danh sách discover -> fallback: nếu mode
 *      auto và có AUTO MENU AI thì dùng nó; nếu không thì DISCONNECTED (không đoán bừa).
 *   4. Không có gì khớp -> DISCONNECTED (source: "none").
 */
function resolvePortSelection({ mode, savedPortName, discoveredOutputs }) {
    const outputs = Array.isArray(discoveredOutputs) ? discoveredOutputs : [];
    const autoMenuAiAvailable = outputs.includes(AUTO_MENU_AI_PORT_NAME);
    const savedAvailable = !!savedPortName && outputs.includes(savedPortName);

    if (mode === "auto") {
        if (autoMenuAiAvailable) return { portName: AUTO_MENU_AI_PORT_NAME, source: "auto-menu-ai" };
        if (savedAvailable) return { portName: savedPortName, source: "user-selected-fallback" };
        return { portName: null, source: "none" };
    }

    // mode mặc định "manual" — đúng hành vi TRƯỚC B2 (100% backward compatible).
    if (savedAvailable) return { portName: savedPortName, source: "user-selected" };
    if (savedPortName && !savedAvailable) return { portName: null, source: "none" }; // đã chọn nhưng port mất — B1-C, KHÔNG tự fallback sang AUTO MENU AI khi mode=manual (đúng "không ghi đè lựa chọn người dùng")
    return { portName: null, source: "none" };
}

/**
 * TASK B2 Mục 1/15 — thử tạo/đảm bảo virtual port "AUTO MENU AI".
 *
 * ĐÃ XÁC NHẬN (đọc trực tiếp node_modules/@julusian/midi/README.md, mục "Virtual Ports"):
 * virtual port CHỈ được RtMidi hỗ trợ trên "Mac OS X and Linux with ALSA". README KHÔNG
 * liệt kê Windows. Repo này target Electron + Windows (Studio One là DAW Windows) — nghĩa là
 * trên đúng nền tảng triển khai thật, openVirtualPort() SẼ throw RtMidiError (theo chính
 * source code RtMidi upstream cho WinMM API — hàm này không implement trên Windows).
 *
 * TÔI CHƯA CHẠY ĐƯỢC TRÊN WINDOWS THẬT để xác nhận message lỗi chính xác (môi trường sandbox
 * là Linux) — vì vậy hàm dưới đây KHÔNG giả định message, chỉ bắt lỗi thật và trả về nguyên
 * văn `err.message` cộng với cờ platform rõ ràng. Trên chính sandbox Linux này, virtual port
 * CÓ THỂ tạo được thật (ALSA) — nhưng đó không phải môi trường người dùng cuối sẽ chạy.
 */
function ensureAutoMenuAiPort() {
    // TASK B3-B — SỬA GAP CÓ THẬT phát hiện khi audit lại B2: bản TRƯỚC B3-B trả về
    // PLATFORM_UNSUPPORTED ngay lập tức trên win32 TRƯỚC CẢ KHI kiểm tra port đã tồn tại hay
    // chưa — nghĩa là nếu user đã tự cài loopMIDI và tạo sẵn port "AUTO MENU AI", hàm này vẫn
    // báo sai là "không hỗ trợ", dù việc DISCOVER/REUSE (liệt kê port có sẵn) hoàn toàn hoạt
    // động bình thường trên Windows qua WinMM — chỉ riêng việc TẠO MỚI virtual port mới bị
    // chặn. Việc autoConnect() vẫn chọn đúng port nhờ nó tự discover riêng (không phụ thuộc
    // hàm này) — nhưng field virtualPort trả về cho UI/report bị SAI, gây hiểu lầm khi đọc.
    let existingOutputs = [];
    let existingInputs = [];
    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        existingOutputs = easymidi.getOutputs();
        existingInputs = easymidi.getInputs();
    } catch (err) {
        return { ok: false, reason: "DISCOVERY_FAILED", detail: err.message };
    }

    // Mục 1 — "Nếu port đã tồn tại → reuse, không tạo trùng." ĐÚNG trên MỌI platform, kể cả
    // Windows (đây là bước LIỆT KÊ port có sẵn, không phải TẠO MỚI — WinMM hỗ trợ đầy đủ).
    if (existingOutputs.includes(AUTO_MENU_AI_PORT_NAME) || existingInputs.includes(AUTO_MENU_AI_PORT_NAME)) {
        return { ok: true, reason: "REUSED", detail: `Port "${AUTO_MENU_AI_PORT_NAME}" đã tồn tại (có thể do loopMIDI hoặc driver ảo khác đã tạo) — dùng lại, không tạo mới.` };
    }

    if (process.platform === "win32") {
        // Port CHƯA tồn tại VÀ đang ở Windows -> KHÔNG cố hack RtMidi để tạo (đúng yêu cầu
        // B3-B Mục 1 "Không cố hack RtMidi để tạo virtual port trên Windows"). Đây là ranh
        // giới thật của RtMidi/WinMM, đã xác nhận ở B2 (node_modules/@julusian/midi/README.md).
        return {
            ok: false,
            reason: "PLATFORM_UNSUPPORTED",
            detail: `Port "${AUTO_MENU_AI_PORT_NAME}" chưa tồn tại và RtMidi (backend easymidi dùng) không hỗ trợ tự tạo virtual port trên Windows — chỉ hỗ trợ macOS và Linux/ALSA (xác nhận từ node_modules/@julusian/midi/README.md, mục "Virtual Ports"). Cần cài loopMIDI (Tobias Erichsen) và tự đặt tên port đó thành "${AUTO_MENU_AI_PORT_NAME}" — xem nút "🎹 Cài loopMIDI" trong Setup. Sau khi tạo xong, hệ thống sẽ tự DISCOVER/reuse nó, không cần tạo lại.`,
        };
    }

    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        // ALSA/macOS: tạo Output ảo trước — Input ảo là 1 object RIÊNG (easymidi không có API
        // "1 port song công" — đây là 2 object khác nhau, cùng tên). Không mở Input ảo ở đây vì
        // openMidiInput() sẽ tự làm điều đó ngay sau khi resolvePortSelection() chọn tên này —
        // tránh mở 2 lần cùng 1 port ảo (Mục 11 "không để duplicate Output/Input object").
        const virtualOutput = new easymidi.Output(AUTO_MENU_AI_PORT_NAME, true);
        virtualOutput.close(); // đóng ngay — chỉ dùng để "khai sinh" port ảo cho hệ điều hành biết tới nó; openOutputDriver() thật sẽ mở lại theo đường bình thường (virtual:false, vì port giờ đã "tồn tại" với OS)
        return { ok: true, reason: "CREATED", detail: `Đã tạo virtual port "${AUTO_MENU_AI_PORT_NAME}" (ALSA/CoreMIDI).` };
    } catch (err) {
        return { ok: false, reason: "CREATE_FAILED", detail: err.message };
    }
}

/**
 * TASK B2 Mục 6 — MIDI VERIFICATION foundation. Chỉ có Ý NGHĨA khi input VÀ output đang mở
 * TRÊN CÙNG 1 port name (đúng kiến trúc loopMIDI-style hiện tại của repo — xem ghi chú đầu
 * file midiHealth.js). KHÔNG dùng console.log làm bằng chứng — dùng Promise chờ đúng SỰ KIỆN
 * 'cc' nhận lại từ chính easymidi.Input, có timeout rõ ràng, KHÔNG PASS nếu không nhận được.
 */
function verifyMidiOutput({ timeoutMs = 800 } = {}) {
    return new Promise((resolve) => {
        if (!midiDriverInstance || !midiInput) {
            resolve({ verified: false, reason: "NOT_CONNECTED", detail: "Output hoặc Input chưa mở — không thể verify." });
            return;
        }
        const probeChannel = 16; // channel 16 hiếm khi trùng mapping thật của user — giảm khả năng gây nhiễu dispatch thật trong lúc verify
        const probeCC = 119;     // CC 119 nằm ngoài dải General Purpose thường dùng — chọn để giảm khả năng trùng CC thật đang dùng (không đảm bảo tuyệt đối, ghi rõ trong report)
        const probeValue = 42;
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            midiInput.removeListener("cc", onCc);
            resolve({ verified: false, reason: "TIMEOUT", detail: `Không nhận lại được message trong ${timeoutMs}ms — port có thể không loopback thật (2 thiết bị vật lý khác nhau) hoặc DAW/driver chặn message.` });
        }, timeoutMs);

        function onCc(msg) {
            if (msg.controller === probeCC && msg.value === probeValue && msg.channel + 1 === probeChannel) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                midiInput.removeListener("cc", onCc);
                resolve({ verified: true, reason: "LOOPBACK_CONFIRMED", detail: "Output -> Input loopback nhận đúng message test." });
            }
            // message KHÁC không khớp -> bỏ qua, không tính nhầm thành verified (không đoán).
        }
        midiInput.on("cc", onCc);

        try {
            const sendResult = midiDriverInstance.execute({ cc: probeCC, channel: probeChannel, value: probeValue });
            if (sendResult && typeof sendResult.then === "function") {
                sendResult.then((r) => {
                    if (!settled && r && r.ok === false) {
                        settled = true;
                        clearTimeout(timer);
                        midiInput.removeListener("cc", onCc);
                        resolve({ verified: false, reason: "SEND_FAILED", detail: r.detail });
                    }
                });
            }
        } catch (err) {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                midiInput.removeListener("cc", onCc);
                resolve({ verified: false, reason: "SEND_FAILED", detail: err.message });
            }
        }
    });
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

/**
 * TASK B38 — loadD1AndRebuild(settings): pipeline THẬT (XSD -> Semantic -> gated mapping).
 * Bất đồng bộ (không thể sync vì xmllint-wasm dùng worker_threads). Gọi "bắn rồi quên"
 * (fire-and-forget, có .catch()) từ start()/reloadMappings() — KHÔNG làm start()/reloadMappings()
 * phải trở thành async (tránh phải sửa app/main.js, ngoài Scope Lock B38 trừ khi chứng minh bắt
 * buộc — ở đây không bắt buộc vì cách này vẫn đạt fail-closed đúng yêu cầu).
 *
 * Trong lúc Promise này chưa resolve (vài chục-vài trăm ms lúc khởi động), d1GatedMappingIndex
 * vẫn giữ giá trị RỖNG mặc định (hoặc giá trị hợp lệ gần nhất nếu đây là 1 lần reload) — không
 * có khoảng hở "dùng tạm mapping cũ không qua D1" nào.
 */
async function loadD1AndRebuild(settings) {
    const result = await d1Loader.loadD1FromDisk();
    if (!result.ok) {
        log(`[D1] Validate THẤT BẠI (stage=${result.stage}) — mapping D1-gated bị RỖNG (fail-closed, không dispatch qua MIDI cho tới khi D1 hợp lệ trở lại).`, result.errors);
        d1State = { ok: false, stage: result.stage, errors: result.errors, lastLoadedAt: Date.now() };
        d1GatedMappingIndex = new Map(); // fail-closed — KHÔNG giữ mapping cũ nếu lần load lại này fail
        return;
    }
    const { mapping, rejected } = d1Loader.buildD1GatedMapping(settings?.midiMappingsV1, result.capabilities);
    d1GatedMappingIndex = mapping;
    d1State = { ok: true, stage: "ok", errors: [], lastLoadedAt: Date.now(), capabilityCount: result.capabilities.length, mappingCount: mapping.size, rejectedCount: rejected.length };
    log(`[D1] Validate PASS — ${result.capabilities.length} capability, ${mapping.size} binding được cài vào mapping thật, ${rejected.length} binding bị loại (xem lý do trong rejected).`, rejected);
}

async function dispatchFromMidi(msg) {
    const key = `${msg.type}:${msg.channel}:${msg.number}`;
    // TASK B38 — nguồn dispatch thật DUY NHẤT: d1GatedMappingIndex (xây từ D1 XML đã qua
    // XSD+Semantic). KHÔNG còn đọc mappingIndex/ACTION_TO_CAPABILITY (legacy) ở đây nữa.
    const target = d1GatedMappingIndex.get(key);
    if (!target || !engine) return;

    // Chống 1 event bắn nhiều lệnh nếu listener bị gắn trùng (Mục 12 — connect() x3).
    const now = Date.now();
    const lastAt = lastDispatchAt.get(key) || 0;
    if (now - lastAt < 60) return; // debounce 60ms, không phải business logic — chỉ chống double-listener
    lastDispatchAt.set(key, now);

    const result = await engine.dispatch({ targetId: target.targetId, action: target.action });
    log("dispatch", key, "->", target.capabilityId, "(" + target.action + ")", result);
}

function openMidiInput(portName) {
    if (!portName) {
        log("Chưa có midiOutputPort trong settings — bỏ qua mở MIDI Input thật.");
        lastInputError = "Chưa có midiOutputPort trong settings.";
        return;
    }
    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        const inputs = easymidi.getInputs();
        if (!inputs.includes(portName)) {
            const detail = `Cổng "${portName}" không có trong danh sách MIDI Input thật (${inputs.join(", ") || "không có cổng nào"}).`;
            log(`${detail} — bỏ qua, không bịa kết nối.`);
            lastInputError = detail;
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
        lastInputError = null; // mở thành công lần này -> xoá lỗi cũ (nếu có) để health phản ánh đúng hiện tại
    } catch (err) {
        log("Không mở được MIDI Input thật:", err.message);
        lastInputError = err.message;
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
        configuredPortName = portName || null;
        if (portName) {
            midiDriverInstance = new MidiDriver(portName, false);
            engine.registerDriver(midiDriverInstance); // đăng ký dưới tên 'midi'
            engine.drivers.set("mcu", midiDriverInstance); // ALIAS — studio_one dùng tên 'mcu', không phải 'midi'
            log(`MidiDriver (mở lại cổng có sẵn "${portName}") sẵn sàng, alias 'mcu'.`);
            lastOutputError = null;
        } else {
            log("Chưa có midiOutputPort đã lưu — driver 'mcu' sẽ không sẵn sàng, capabilityRegistry tự fallback sang 'hotkey'.");
            lastOutputError = "Chưa có midiOutputPort đã lưu.";
        }
        mappingIndex = buildMappingIndex(settings); // LEGACY — giữ cho backward-compat test, không dùng để dispatch thật (xem TASK B38)
        // TASK B38 — nạp D1 THẬT, bất đồng bộ, không chặn start(). Fail-closed mặc định
        // (d1GatedMappingIndex đã khởi tạo rỗng ở khai báo biến) cho tới khi Promise này resolve.
        loadD1AndRebuild(settings).catch((err) => log("[D1] loadD1AndRebuild() lỗi không mong đợi:", err.message));
        const inputPortName = resolveInputPortName(settings); // TASK B2 Mục 4 — migration fallback
        configuredInputPortName = inputPortName;
        openMidiInput(inputPortName);
    } catch (err) {
        log("Không khởi tạo được MidiDriver — driver 'mcu' sẽ không sẵn sàng, tự fallback 'hotkey'. Lỗi:", err.message);
        lastOutputError = err.message;
        midiDriverInstance = null;
    }

    log("CommandRuntime start() hoàn tất. Drivers sẵn sàng (không đảm bảo isReady()=true):", [...engine.drivers.keys()]);
}

/**
 * MIDI-MASTER-01 Phase 1 — mở lại MidiDriver OUTPUT khi portName trong settings đổi khác
 * configuredPortName đã dùng lần start()/reload gần nhất. TRƯỚC bản vá này, reloadMappings()
 * chỉ mở lại Input — Output (midiDriverInstance, alias 'mcu') vẫn trỏ vào cổng CŨ cho tới khi
 * app restart. Đây là gap có thật đã ghi trong báo cáo audit A3 (mục "2 hệ thống MIDI output
 * độc lập") — vá tại đây, không đổi bất kỳ CC/Note/action mapping nào (đúng Mục 2.1).
 */
function reopenOutputDriver(portName) {
    if (portName === configuredPortName) return; // không đổi cổng -> không đóng/mở lại, tránh nhấp nháy port thật
    configuredPortName = portName || null;

    if (midiDriverInstance) {
        try { midiDriverInstance.close(); } catch (err) { log("Đóng MidiDriver cũ lỗi (bỏ qua):", err.message); }
        midiDriverInstance = null;
        engine.drivers.delete("midi");
        engine.drivers.delete("mcu");
    }

    if (!portName) {
        log("Đã bỏ chọn midiOutputPort — driver 'mcu'/'midi' không còn sẵn sàng cho tới khi chọn lại.");
        lastOutputError = "Chưa có midiOutputPort đã lưu.";
        return;
    }

    try {
        midiDriverInstance = new MidiDriver(portName, false);
        engine.registerDriver(midiDriverInstance);
        engine.drivers.set("mcu", midiDriverInstance);
        log(`Đã mở lại MidiDriver OUTPUT theo cổng mới "${portName}", alias 'mcu'.`);
        lastOutputError = null;
    } catch (err) {
        log(`Không mở lại được MidiDriver OUTPUT cho cổng "${portName}":`, err.message);
        lastOutputError = err.message;
        midiDriverInstance = null;
    }
}

/** reloadMappings() — gọi lại khi Setup lưu mapping/port mới (hook vào ipcMain.on("setup-changed")). */
function reloadMappings() {
    if (!started || !deps) return;
    try {
        const settings = deps.readSettingsFile() || {};
        mappingIndex = buildMappingIndex(settings); // LEGACY — xem TASK B38
        loadD1AndRebuild(settings).catch((err) => log("[D1] loadD1AndRebuild() (reload) lỗi không mong đợi:", err.message)); // TASK B38
        const portName = settings.midiOutputPort;
        // Output: chỉ đóng/mở lại nếu portName THẬT SỰ đổi (so với configuredPortName) — Phase 1.
        reopenOutputDriver(portName);
        // Input: TASK B2 — dùng resolveInputPortName() (fallback midiInputPort -> midiOutputPort),
        // openMidiInput() tự đóng input cũ trước khi mở cái mới (hành vi cũ giữ nguyên).
        const inputPortName = resolveInputPortName(settings);
        configuredInputPortName = inputPortName;
        openMidiInput(inputPortName);
        log("Đã nạp lại mapping + MIDI Input/Output theo settings mới nhất.");
    } catch (err) {
        log("reloadMappings lỗi:", err.message);
    }
}

/**
 * TASK B2 Mục 2/3/10 — AUTO CONNECT: discover (easymidi thật) -> ensureAutoMenuAiPort()
 * (platform-gated) -> resolvePortSelection() -> mở lại Output/Input theo kết quả. Gọi từ
 * IPC "midi-auto-connect" (nút "🔄 Auto Connect" trong Setup UI). KHÔNG restart Electron,
 * KHÔNG restart CommandRuntime — chỉ đóng/mở lại driver như reloadMappings() đã làm.
 *
 * mode: "manual" (mặc định, giữ nguyên hành vi trước B2) | "auto" (user tự bật trong Setup —
 * CHƯA có UI bật/tắt mode này ở B2, xem Remaining Risks trong báo cáo — hàm nhận tham số để
 * sẵn sàng, không tự quyết định mode).
 */
function autoConnect({ mode = "manual" } = {}) {
    if (!started || !deps) {
        return { ok: false, detail: "CommandRuntime chưa start()." };
    }
    let discoveredOutputs = [];
    let discoveredInputs = [];
    let discoveryError = null;
    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        discoveredOutputs = easymidi.getOutputs();
        discoveredInputs = easymidi.getInputs();
    } catch (err) {
        discoveryError = err.message;
    }

    const virtualPortResult = ensureAutoMenuAiPort();
    // Nếu vừa tạo/xác nhận virtual port thành công, danh sách discover CŨ (lấy trước đó) có thể
    // chưa thấy nó -> discover lại 1 lần nữa cho chắc (chỉ khi platform hỗ trợ và không lỗi).
    if (virtualPortResult.ok && !discoveryError) {
        try {
            // eslint-disable-next-line global-require
            const easymidi = require("easymidi");
            discoveredOutputs = easymidi.getOutputs();
            discoveredInputs = easymidi.getInputs();
        } catch { /* giữ danh sách cũ nếu discover lại lỗi */ }
    }

    const settings = deps.readSettingsFile() || {};
    const resolution = resolvePortSelection({
        mode,
        savedPortName: settings.midiOutputPort || null,
        discoveredOutputs,
    });
    lastPortResolution = resolution;

    reopenOutputDriver(resolution.portName);
    const inputCandidate = resolution.portName; // TASK B2: auto-connect coi input/output cùng tên khi ở mode auto/đã resolve (đúng kiến trúc 1-cổng hiện tại)
    configuredInputPortName = inputCandidate;
    openMidiInput(inputCandidate);

    return {
        ok: !!resolution.portName,
        resolution,
        virtualPort: virtualPortResult,
        discoveredOutputs,
        discoveredInputs,
        discoveryError,
        health: getHealth(),
    };
}

/**
 * MIDI-MASTER-01 Phase 1 — getHealth(): nguồn sự thật phía MAIN PROCESS, để renderer
 * (ui/js/midiHealth.js) hợp nhất với trạng thái Web MIDI phía renderer (Mục 5, 22, 23).
 * CHỈ đọc lại state nội bộ đã có (không đoán, không tự gọi lại easymidi.getOutputs() ở đây
 * vì đó là việc của Discovery — Phase 2, chưa làm ở Phase 1).
 */
function getHealth() {
    return {
        started,
        configuredPortName,        // output port name (giữ tên field cũ, không phá shape B1)
        configuredInputPortName,   // TASK B2 — có thể khác configuredPortName nếu user cấu hình midiInputPort riêng
        outputReady: !!midiDriverInstance,
        inputOpen: !!midiInput,
        lastOutputError,
        lastInputError,
        mappingCount: mappingIndex.size, // LEGACY (xem TASK B38) — giữ field cũ, không đổi shape health cũ
        driversRegistered: engine ? [...engine.drivers.keys()] : [],
        lastPortResolution, // { portName, source } từ autoConnect() gần nhất, null nếu chưa gọi lần nào
        autoMenuAiPortName: AUTO_MENU_AI_PORT_NAME,
        // TASK B38 — trạng thái D1 Runtime Loader thật (nguồn dispatch thật kể từ B38).
        d1: { ...d1State, mappingCount: d1GatedMappingIndex.size },
    };
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
    // TASK B2 Mục 12 — SHUTDOWN SAFETY: TRƯỚC bản vá này, stop() chỉ đóng Input — Output
    // (midiDriverInstance/alias 'mcu') KHÔNG được đóng, có thể để RtMidi port treo tới khi
    // process Electron main bị kill cứng. Xác nhận bằng đọc lại code cũ (chỉ có closeMidiInput()).
    closeMidiInput();
    try { midiDriverInstance?.close(); } catch (err) { log("Đóng MidiDriver output lúc stop() lỗi (bỏ qua):", err.message); }
    midiDriverInstance = null;
    if (engine) {
        engine.drivers.delete("midi");
        engine.drivers.delete("mcu");
    }
    started = false;
}

module.exports = {
    start, stop, dispatch, reloadMappings, getHealth, autoConnect, verifyMidiOutput,
    // Xuất thêm các hàm THUẦN (không I/O) để LOGIC-TEST trực tiếp, không cần mock easymidi
    // cho riêng phần policy — xem tests/unit/PortSelectionPolicy.verify.js.
    resolvePortSelection, resolveInputPortName,
    AUTO_MENU_AI_PORT_NAME,
    // -- TASK B20 — cùng tinh thần trên: xuất thêm buildMappingIndex()/normalizeMidiMessage()
    //    (2 hàm THUẦN, không I/O, không đụng easymidi) + ACTION_TO_CAPABILITY (đọc, để test xác
    //    nhận đúng contract hiện có mà KHÔNG tự mở rộng nó) — để tests/unit/MidiLearnDispatch.verify.js
    //    kiểm được thật lớp "mapping đã lưu -> có được resolve đúng action/bị loại đúng lý do
    //    không" (không phụ thuộc easymidi — package này KHÔNG có trong môi trường audit/test hiện
    //    tại, xem ROOT CAUSE trong TASK_B20_RESULT.md). KHÔNG export dispatchFromMidi() (có side-
    //    effect trên state module-private engine/lastDispatchAt) — lớp "dispatch thật -> driver
    //    nào được gọi" được test trực tiếp qua CommandEngine + capabilityRegistry (đã export sẵn,
    //    không cần đụng gì thêm ở đây), dùng đúng object ACTION_TO_CAPABILITY xuất ra từ đây làm
    //    input, nên vẫn là test dùng đúng contract thật, không phải viết lại logic riêng.
    buildMappingIndex, normalizeMidiMessage, ACTION_TO_CAPABILITY,
    // TASK B38 — export thêm để test integration có thể chờ D1 nạp xong (async) và đọc lại
    // d1GatedMappingIndex/d1State mà không cần đợi timer đoán mò. KHÔNG export dispatchFromMidi()
    // (vẫn giữ nguyên lý do cũ — side-effect trên state module-private).
    loadD1AndRebuild,
    getD1GatedMapping: () => d1GatedMappingIndex,
    getD1State: () => d1State,
};
