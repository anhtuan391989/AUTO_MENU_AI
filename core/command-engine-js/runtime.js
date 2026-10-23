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
// TASK B38-FIX — D1 Runtime Loader là NGUỒN MAPPING DUY NHẤT (đã xoá bỏ hoàn toàn
// ACTION_TO_CAPABILITY/buildMappingIndex/mappingIndex hard-code cũ — xem d1Loader.js
// cho CAPABILITY_BACKEND_TARGET, bảng backend metadata hợp lệ theo đúng ranh giới B38-FIX mục 5
// (KHÔNG quyết định MIDI binding, CHỈ mô tả capability -> backend target/action).
const d1Loader = require("./d1Loader");

// TASK B2 Mục 1 — CONTRACT: tên virtual port chính thức, đúng nguyên văn (dấu cách thường,
// không gạch dưới/gạch ngang). Không đổi chuỗi này ở bất kỳ đâu khác trong repo.
const AUTO_MENU_AI_PORT_NAME = "AUTO MENU AI";

let engine = null;
let midiDriverInstance = null;
let midiInput = null;
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
// MIDI-RECOVERY-01 — chi tiết lỗi THEO BƯỚC (giữ nguyên message gốc của easymidi/RtMidi, KHÔNG thay bằng
// câu chung chung). stage: 'detect' (tên không có trong danh sách backend) | 'open' (tạo Input/Output, gồm openPort
// của RtMidi — nơi "Internal RtMidi error" phát sinh) | 'listen' (gắn listener) | 'config' (chưa có tên cổng).
let lastOutputErrorDetail = null; // { stage, message, portName, available, at, attempt } | null
let lastInputErrorDetail = null;
let openInputPortName = null;  // tên cổng mà midiInput ĐANG mở (để biết có cần đóng/mở lại hay không)
let openOutputPortName = null; // tên cổng mà midiDriverInstance ĐANG mở
let connectAttemptSeq = 0;     // tăng mỗi lần THỰC SỰ thử mở 1 cổng (không tăng khi tái sử dụng) — để chẩn đoán mở trùng
let autoConnectStats = { calls: 0, coalesced: 0 };
let lastAutoConnect = null;    // { at, key, result } — gộp các lần gọi dồn dập trong COALESCE_MS
const AUTO_CONNECT_COALESCE_MS = 400;
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
            const o = midiDriverInstance ? "mở" : `ĐÓNG (${lastOutputError || "chưa mở"})`;
            const i = midiInput ? "mở" : `ĐÓNG (${lastInputError || "chưa mở"})`;
            resolve({ verified: false, reason: "NOT_CONNECTED", detail: `Output: ${o}; Input: ${i} — không thể verify.`, output: !!midiDriverInstance, input: !!midiInput });
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
    // XSD+Semantic). Không có bảng hard-code nào chạy song song nữa (đã xoá ở B38-FIX).
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

function makeErrorDetail(stage, message, portName, available) {
    return { stage, message, portName: portName || null, available: Array.isArray(available) ? available.slice() : null, at: Date.now(), attempt: connectAttemptSeq };
}

/**
 * MIDI-RECOVERY-01 — mở MIDI Input. Trả về { ok, reused?, stage?, error? }.
 *  - Cùng cổng + đang mở -> TÁI SỬ DỤNG, KHÔNG đóng/mở lại (trước đây mỗi lần Setup lưu / Auto Connect đều
 *    close()+new Input() => cổng đang tốt bị phá, nếu mở lại lỗi thì midiInput=null và Verify trả NOT_CONNECTED).
 *  - Message lỗi gốc giữ nguyên trong lastInputError; bước lỗi nằm trong lastInputErrorDetail.stage.
 */
function openMidiInput(portName, { force = false } = {}) {
    if (!portName) {
        log("Chưa có midiOutputPort trong settings — bỏ qua mở MIDI Input thật.");
        lastInputError = "Chưa có midiOutputPort trong settings.";
        lastInputErrorDetail = makeErrorDetail("config", lastInputError, null, null);
        return { ok: false, stage: "config", error: lastInputError };
    }
    if (!force && midiInput && openInputPortName === portName) {
        return { ok: true, reused: true };
    }
    let easymidi;
    let inputs = [];
    try {
        // eslint-disable-next-line global-require
        easymidi = require("easymidi");
        inputs = easymidi.getInputs();
    } catch (err) {
        log("Không liệt kê được MIDI Input:", err.message);
        lastInputError = err.message;
        lastInputErrorDetail = makeErrorDetail("detect", err.message, portName, null);
        return { ok: false, stage: "detect", error: err.message };
    }
    if (!inputs.includes(portName)) {
        const detail = `Cổng "${portName}" không có trong danh sách MIDI Input thật (${inputs.join(", ") || "không có cổng nào"}).`;
        log(`${detail} — bỏ qua, không bịa kết nối.`);
        lastInputError = detail;
        lastInputErrorDetail = makeErrorDetail("detect", detail, portName, inputs);
        return { ok: false, stage: "detect", error: detail };
    }
    if (midiInput) {
        try { midiInput.close(); } catch (err) { log("Đóng MIDI Input cũ lỗi (bỏ qua):", err.message); }
        midiInput = null;
        openInputPortName = null;
    }
    connectAttemptSeq += 1;
    let created = null;
    try {
        created = new easymidi.Input(portName); // openPort() của RtMidi chạy ở đây
    } catch (err) {
        log("Không mở được MIDI Input thật:", err.message);
        lastInputError = err.message; // giữ NGUYÊN message gốc (vd "Internal RtMidi error")
        lastInputErrorDetail = makeErrorDetail("open", err.message, portName, inputs);
        midiInput = null;
        openInputPortName = null;
        return { ok: false, stage: "open", error: err.message };
    }
    try {
        created.on("noteon", (m) => dispatchFromMidi({ type: "note", channel: m.channel + 1, number: m.note, value: m.velocity }));
        created.on("cc", (m) => dispatchFromMidi({ type: "cc", channel: m.channel + 1, number: m.controller, value: m.value }));
    } catch (err) {
        log("Mở được Input nhưng gắn listener lỗi:", err.message);
        try { created.close(); } catch { /* bỏ qua */ }
        lastInputError = err.message;
        lastInputErrorDetail = makeErrorDetail("listen", err.message, portName, inputs);
        midiInput = null;
        openInputPortName = null;
        return { ok: false, stage: "listen", error: err.message };
    }
    midiInput = created;
    openInputPortName = portName;
    log(`Đã mở MIDI Input thật: "${portName}".`);
    lastInputError = null; // mở thành công lần này -> xoá lỗi cũ (nếu có) để health phản ánh đúng hiện tại
    lastInputErrorDetail = null;
    return { ok: true };
}

function closeMidiInput() {
    try { midiInput?.close(); } catch { /* bỏ qua */ }
    midiInput = null;
    openInputPortName = null;
}

/**
 * MIDI-RECOVERY-01 — mở MidiDriver OUTPUT (dùng chung cho start()/reopenOutputDriver()/sendMidi()).
 * Giữ NGUYÊN message lỗi gốc; ghi bước lỗi vào lastOutputErrorDetail. Không đổi cách đăng ký driver/alias 'mcu'.
 */
function tryOpenOutput(portName) {
    connectAttemptSeq += 1;
    try {
        const driver = new MidiDriver(portName, false);
        midiDriverInstance = driver;
        openOutputPortName = portName;
        engine.registerDriver(driver); // đăng ký dưới tên 'midi'
        engine.drivers.set("mcu", driver); // ALIAS — studio_one dùng tên 'mcu'
        lastOutputError = null;
        lastOutputErrorDetail = null;
        return { ok: true };
    } catch (err) {
        midiDriverInstance = null;
        openOutputPortName = null;
        lastOutputError = err.message;
        // easymidi tự kiểm tên và ném "No MIDI output found with name: X" => bước 'detect'; lỗi khác (vd
        // "Internal RtMidi error" từ openPort) => bước 'open'.
        const stage = /^No MIDI output found/i.test(err.message) ? "detect" : "open";
        let available = null;
        try { available = require("easymidi").getOutputs(); } catch { /* bỏ qua */ }
        lastOutputErrorDetail = makeErrorDetail(stage, err.message, portName, available);
        return { ok: false, stage, error: err.message };
    }
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
            // TASK B61.5 — lỗi mở OUTPUT (vd cổng loopMIDI chưa chạy lúc app khởi động) chỉ được
            // ảnh hưởng driver 'mcu'; KHÔNG được nuốt luôn bước nạp D1 + mở MIDI Input ở dưới
            // (2 việc đó không phụ thuộc Output). Trước bản vá này, MidiDriver() throw làm nhảy
            // thẳng xuống catch bên dưới -> d1State kẹt "not-loaded", Input không bao giờ mở.
            const opened = tryOpenOutput(portName);
            if (opened.ok) {
                log(`MidiDriver (mở lại cổng có sẵn "${portName}") sẵn sàng, alias 'mcu'.`);
            } else {
                log("Không mở được MidiDriver OUTPUT lúc start() — driver 'mcu' tạm không sẵn sàng, tự fallback 'hotkey'. Lỗi:", opened.error);
            }
        } else {
            log("Chưa có midiOutputPort đã lưu — driver 'mcu' sẽ không sẵn sàng, capabilityRegistry tự fallback sang 'hotkey'.");
            lastOutputError = "Chưa có midiOutputPort đã lưu.";
            lastOutputErrorDetail = makeErrorDetail("config", lastOutputError, null, null);
        }
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
    // TASK B61.5 — chỉ bỏ qua khi cổng KHÔNG đổi VÀ driver đang thật sự sống (hoặc đã bỏ chọn cổng).
    if (portName === configuredPortName && (midiDriverInstance || !portName)) return { ok: !!midiDriverInstance, reused: true }; // cổng không đổi + driver còn sống -> không đóng/mở lại, tránh nhấp nháy port thật
    configuredPortName = portName || null;

    if (midiDriverInstance) {
        try { midiDriverInstance.close(); } catch (err) { log("Đóng MidiDriver cũ lỗi (bỏ qua):", err.message); }
        midiDriverInstance = null;
        openOutputPortName = null;
        engine.drivers.delete("midi");
        engine.drivers.delete("mcu");
    }

    if (!portName) {
        log("Đã bỏ chọn midiOutputPort — driver 'mcu'/'midi' không còn sẵn sàng cho tới khi chọn lại.");
        lastOutputError = "Chưa có midiOutputPort đã lưu.";
        lastOutputErrorDetail = makeErrorDetail("config", lastOutputError, null, null);
        return { ok: false, stage: "config", error: lastOutputError };
    }

    const opened = tryOpenOutput(portName);
    if (opened.ok) log(`Đã mở lại MidiDriver OUTPUT theo cổng mới "${portName}", alias 'mcu'.`);
    else log(`Không mở lại được MidiDriver OUTPUT cho cổng "${portName}":`, opened.error);
    return opened;
}

/** reloadMappings() — gọi lại khi Setup lưu mapping/port mới (hook vào ipcMain.on("setup-changed")). */
function reloadMappings() {
    if (!started || !deps) return;
    try {
        const settings = deps.readSettingsFile() || {};
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
/**
 * MIDI-RECOVERY-01 — trạng thái kết nối THEO TỪNG BACKEND (hàm THUẦN, test trực tiếp được).
 *   CONNECTED    : Output VÀ Input đều mở thật.
 *   OUTPUT_READY : chỉ Output mở (Input lỗi/chưa mở)  -> partial.
 *   INPUT_READY  : chỉ Input mở (Output lỗi/chưa mở)  -> partial.
 *   ERROR        : không phía nào mở được dù đã resolve được tên cổng và có lỗi cụ thể.
 *   DISCONNECTED : không phía nào mở và không có cổng/lỗi cụ thể để kết luận ERROR.
 * "Tìm thấy tên cổng" KHÔNG BAO GIỜ đủ để lên CONNECTED.
 */
function deriveBackendStatus({ outputReady, inputOpen, outputError, inputError, resolvedPortName }) {
    const o = !!outputReady;
    const i = !!inputOpen;
    if (o && i) return { status: "CONNECTED", partial: false };
    if (o) return { status: "OUTPUT_READY", partial: true };
    if (i) return { status: "INPUT_READY", partial: true };
    if (resolvedPortName && (outputError || inputError)) return { status: "ERROR", partial: false };
    return { status: "DISCONNECTED", partial: false };
}

function sideReport(ready, port, error, detail) {
    return { ready: !!ready, port: port || null, error: error || null, detail: detail || null };
}

/**
 * MIDI-RECOVERY-01 — danh sách cổng THẬT mà backend gửi/nhận (easymidi/RtMidi, main process) nhìn thấy.
 * Đây mới là danh sách đúng cho Output vì MidiDriver (easymidi) là bên gửi; Web MIDI của Chromium có thể
 * không liệt kê cùng tập cổng (bằng chứng 23/10/2026: Web MIDI outputs thiếu "AUTO MENU AI").
 */
function listPorts() {
    try {
        // eslint-disable-next-line global-require
        const easymidi = require("easymidi");
        return { ok: true, outputs: easymidi.getOutputs(), inputs: easymidi.getInputs(), error: null };
    } catch (err) {
        return { ok: false, outputs: [], inputs: [], error: err.message };
    }
}

function autoConnect({ mode = "manual" } = {}) {
    if (!started || !deps) {
        return { ok: false, resolved: false, status: "DISCONNECTED", connected: false, partial: false, detail: "CommandRuntime chưa start()." };
    }
    autoConnectStats.calls += 1;
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

    const settings = deps.readSettingsFile() || {};

    // MIDI-RECOVERY-01 — GỘP các lần gọi dồn dập (nhấn đúp / phím lặp): cùng mode + cùng cấu hình + cùng danh sách
    // cổng + cùng trạng thái mở và vừa chạy xong < AUTO_CONNECT_COALESCE_MS => trả lại kết quả vừa có, KHÔNG thử
    // mở lại cổng. Khác bất kỳ yếu tố nào (vd cổng vừa xuất hiện) => chạy thật.
    const key = JSON.stringify([mode, settings.midiOutputPort || null, settings.midiInputPort || null, discoveredOutputs, discoveredInputs, !!midiDriverInstance, !!midiInput, discoveryError]);
    if (lastAutoConnect && lastAutoConnect.key === key && Date.now() - lastAutoConnect.at < AUTO_CONNECT_COALESCE_MS) {
        autoConnectStats.coalesced += 1;
        return { ...lastAutoConnect.result, coalesced: true, health: getHealth() };
    }

    const virtualPortResult = ensureAutoMenuAiPort();
    // Nếu vừa tạo/xác nhận virtual port thành công, danh sách discover CŨ có thể chưa thấy nó -> discover lại 1 lần.
    if (virtualPortResult.ok && !discoveryError) {
        try {
            // eslint-disable-next-line global-require
            const easymidi = require("easymidi");
            discoveredOutputs = easymidi.getOutputs();
            discoveredInputs = easymidi.getInputs();
        } catch { /* giữ danh sách cũ nếu discover lại lỗi */ }
    }

    const resolution = resolvePortSelection({
        mode,
        savedPortName: settings.midiOutputPort || null,
        discoveredOutputs,
    });
    lastPortResolution = resolution;

    reopenOutputDriver(resolution.portName);
    // Input: dùng ĐÚNG midiInputPort nếu user đã chọn riêng (KHÔNG bị ghi đè bằng tên Output); chỉ khi chưa cấu hình
    // Input riêng mới fallback theo tên Output đã resolve (tương thích cũ).
    const inputCandidate = settings.midiInputPort || resolution.portName || null;
    configuredInputPortName = inputCandidate;
    openMidiInput(inputCandidate);

    const health = getHealth();
    const { status, partial } = deriveBackendStatus({
        outputReady: health.outputReady,
        inputOpen: health.inputOpen,
        outputError: health.lastOutputError,
        inputError: health.lastInputError,
        resolvedPortName: resolution.portName || inputCandidate,
    });
    const result = {
        // `ok` GIỮ NGUYÊN nghĩa cũ (chỉ "đã phân giải được tên cổng") để không phá consumer cũ — KHÔNG dùng làm
        // bằng chứng đã kết nối. Dùng `connected`/`status`/`output.ready`/`input.ready` bên dưới.
        ok: !!resolution.portName,
        resolved: !!resolution.portName,
        status,
        partial,
        connected: status === "CONNECTED",
        output: sideReport(health.outputReady, health.configuredPortName, health.lastOutputError, health.lastOutputErrorDetail),
        input: sideReport(health.inputOpen, health.configuredInputPortName, health.lastInputError, health.lastInputErrorDetail),
        resolution,
        virtualPort: virtualPortResult,
        discoveredOutputs,
        discoveredInputs,
        discoveryError,
        coalesced: false,
        health,
    };
    lastAutoConnect = { at: Date.now(), key: JSON.stringify([mode, settings.midiOutputPort || null, settings.midiInputPort || null, discoveredOutputs, discoveredInputs, !!midiDriverInstance, !!midiInput, discoveryError]), result };
    return result;
}

/**
 * MIDI-RECOVERY-01 — ĐƯỜNG GỬI MIDI CÓ THẨM QUYỀN DUY NHẤT cho Note/CC từ renderer (Setup Test, actionRegistry,
 * vocalCommandRouter): gửi bằng MidiDriver (easymidi) ở main process — cùng backend/cùng cổng với dispatch thật và
 * Verify. Trả { ok, via, port, bytes?, delivery, reason?, detail? }. ok=true CHỈ nghĩa "output.send() không ném";
 * delivery:"UNCONFIRMED" (không có xác nhận phía DAW/loopMIDI).
 * Tham số khớp byte-for-byte sender Web MIDI cũ: status|channel&0x0f, number&0x7f, value&0x7f; channel 0-based.
 */
async function sendMidi({ kind, number, value = 127, channel = 0 } = {}) {
    const via = "main-midi-driver";
    if (!started || !engine) return { ok: false, via, reason: "NOT_STARTED", detail: "CommandRuntime chưa start()." };
    if (!["cc", "noteon", "noteoff"].includes(kind) || !Number.isFinite(number) || !Number.isFinite(value) || !Number.isFinite(channel)) {
        return { ok: false, via, reason: "INVALID_PARAMS", detail: "Cần kind ∈ {cc,noteon,noteoff}, number/value/channel là số." };
    }
    const num = number & 0x7f;
    const val = value & 0x7f;
    const ch = channel & 0x0f;

    // Output chưa mở (vd loopMIDI khởi động sau app) -> thử mở theo cổng ĐÃ LƯU, 1 lần cho mỗi lệnh gửi.
    if (!midiDriverInstance) {
        const savedPort = (deps?.readSettingsFile?.() || {}).midiOutputPort || null;
        if (savedPort) reopenOutputDriver(savedPort);
    }
    if (!midiDriverInstance) {
        return { ok: false, via, reason: "OUTPUT_NOT_OPEN", port: configuredPortName, detail: lastOutputError || "Output chưa mở.", errorDetail: lastOutputErrorDetail };
    }

    const params = kind === "cc"
        ? { cc: num, value: val, channel: ch + 1 }
        : kind === "noteon"
            ? { note: num, velocity: val, channel: ch + 1 }
            : { noteoff: num, velocity: val, channel: ch + 1 };
    const bytes = [(kind === "cc" ? 0xb0 : kind === "noteon" ? 0x90 : 0x80) | ch, num, val];
    const r = await midiDriverInstance.execute(params);
    if (!r || r.ok !== true) {
        return { ok: false, via, reason: "SEND_FAILED", port: openOutputPortName, bytes, detail: r && r.detail, delivery: "NOT_SENT" };
    }
    return { ok: true, via, port: openOutputPortName, bytes, delivery: "UNCONFIRMED" };
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
        // MIDI-RECOVERY-01 — lỗi gốc + BƯỚC phát sinh, cổng thực sự đang mở, thống kê Auto Connect
        lastOutputErrorDetail,
        lastInputErrorDetail,
        openOutputPortName,
        openInputPortName,
        connectAttempts: connectAttemptSeq,
        autoConnectStats: { ...autoConnectStats },
        mappingCount: d1GatedMappingIndex.size, // TASK B38-FIX — trỏ thẳng D1-gated (nguồn mapping duy nhất, không còn field legacy riêng)
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
    start, stop, dispatch, reloadMappings, getHealth, autoConnect, verifyMidiOutput, sendMidi, listPorts, deriveBackendStatus,
    // Xuất thêm các hàm THUẦN (không I/O) để LOGIC-TEST trực tiếp, không cần mock easymidi
    // cho riêng phần policy — xem tests/unit/PortSelectionPolicy.verify.js.
    resolvePortSelection, resolveInputPortName,
    AUTO_MENU_AI_PORT_NAME,
    // TASK B20 — normalizeMidiMessage() (hàm thuần, không I/O) vẫn export để test trực tiếp
    // (tests/unit/MidiLearnDispatch.verify.js SECTION 4). buildMappingIndex()/ACTION_TO_CAPABILITY
    // đã XOÁ hoàn toàn ở TASK B38-FIX (không còn source-of-truth mapping thứ hai — xem
    // core/command-engine-js/d1Loader.js cho pipeline D1 thật thay thế).
    normalizeMidiMessage,
    // TASK B38 — export thêm để test integration có thể chờ D1 nạp xong (async) và đọc lại
    // d1GatedMappingIndex/d1State mà không cần đợi timer đoán mò. KHÔNG export dispatchFromMidi()
    // (vẫn giữ nguyên lý do cũ — side-effect trên state module-private).
    loadD1AndRebuild,
    getD1GatedMapping: () => d1GatedMappingIndex,
    getD1State: () => d1State,
};
