/* ==========================================================
   actionRegistry.js — TASK B: CONTROL / MIDI / DAW MAPPING V1
   ----------------------------------------------------------
   File MỚI, KHÔNG đụng renderer.js/keyEngine.js/bpmEngine.js/modEngine.js/Manual/MOD.
   Chạy trong renderer chính (ui/index.html), dùng chung appSettings.js + preload.js
   đã có sẵn — không tạo state trùng (đúng Mục 14 của task).

   Kiến trúc (Mục 5):
       UI BUTTON -> LOGICAL ACTION -> executeAction() -> MIDI (nếu user đã cấu hình)
                                                        -> hoặc Mouse (nếu đã capture toạ độ
                                                           VÀ Mouse Control đang ON)
                                                        -> hoặc NOT_CONFIGURED (không bịa)

   QUAN TRỌNG (Mục 4): core/command-engine-js/ và core/drivers/ vốn được audit là dead code —
   NHƯNG khi bắt tay code lại phát hiện `core/command-engine-js/runtime.js` ĐÃ được một tiến
   trình khác nối thật vào app/main.js (CommandRuntime.start(), dùng Node easymidi, dispatch
   daw:play/stop/record cho Studio One) SAU thời điểm audit trước đó. File này KHÔNG
   require/tích hợp gì từ core/command-engine-js (đúng Mục 4), và KHÔNG tự lắng nghe MIDI
   Input nữa (đã gỡ, xem ghi chú cuối file) để tránh 2 dispatcher cùng khớp 1 mapping.

   QUAN TRỌNG (Mục 14): Mouse Control ON/OFF ở file này KHÔNG đụng, KHÔNG bọc
   window.electronAPI.clickAtPoint() gốc — clickAtPoint() vẫn được vocalCommandRouter.js
   gọi trực tiếp, không qua file này, cho luồng Key/Tone Plugin (2 call site duy nhất,
   đã trace: sendKeyToAutotune() dòng ~118, sendToneStep() dòng ~158). File này chỉ tạo
   thêm 1 lời gọi clickAtPoint() HOÀN TOÀN MỚI, riêng cho DAW mapping, có gate riêng.
   ========================================================== */

// ---------------------------------------------------------
// Mục 20 — ACTION REGISTRY: chỉ đúng những action thực sự cần cho phase này.
// KHÔNG đưa Manual/AI/MOD vào đây (Mục 1/2/3 khoá tuyệt đối).
// ---------------------------------------------------------
const ACTIONS = Object.freeze({
    DAW_PLAY: "DAW_PLAY",
    DAW_STOP: "DAW_STOP",
    DAW_RECORD: "DAW_RECORD",
    // Nhóm 2 (Mục 7) — khai báo tên trước cho kiến trúc, nhưng KHÔNG có mapping mặc định
    // nào (status luôn NOT_CONFIGURED cho tới khi user tự Capture/MIDI Learn).
    DAW_PAUSE: "DAW_PAUSE",
    DAW_LOOP: "DAW_LOOP",
    DAW_METRONOME: "DAW_METRONOME",
    DAW_UNDO: "DAW_UNDO",
    DAW_REDO: "DAW_REDO",
    DAW_NEXT_TRACK: "DAW_NEXT_TRACK",
    DAW_PREVIOUS_TRACK: "DAW_PREVIOUS_TRACK",
    // Mục 16/19 — khai báo Logical Action cho preset/clap/laugh để sẵn sàng mapping,
    // KHÔNG kèm backend audio/preset thật (đó là việc của task khác, đúng Mục 16 XIX).
    PRESET_NORM: "PRESET_NORM",
    PRESET_LOFI: "PRESET_LOFI",
    PRESET_RAP: "PRESET_RAP",
    PRESET_REMIX: "PRESET_REMIX",
    PRESET_TUNE_OFF: "PRESET_TUNE_OFF",
    CLAP: "CLAP",
    LAUGH: "LAUGH",
    // MIDI-MASTER-01 / MENU-CONTROL-01 — cùng nhóm "khai báo trước, KHÔNG mapping mặc định"
    // như DAW_PAUSE/DAW_LOOP/... ở trên. mic1Btn/mic2Btn/fxBtn (renderer.js) hiện CHỈ toggle
    // CSS .active, không có bất kỳ audio-routing backend thật nào trong repo (đã grep toàn bộ
    // renderer.js/index.html — không có Web Audio API, không IPC audio-monitor nào tồn tại).
    // Khai báo action ở đây KHÔNG bịa ra hành vi audio thật — chỉ mở đường để executeAction()
    // gửi MIDI/click chuột NẾU user tự cấu hình trong Setup, giống hệt cơ chế DAW_PAUSE.
    MONITOR_MIC1: "MONITOR_MIC1",
    MONITOR_MIC2: "MONITOR_MIC2",
    MONITOR_FX: "MONITOR_FX",
    // TASK B12 — phát hiện mới: "musicBtn" (🎵 MUSIC, ui/index.html) trước đây bị B1 báo cáo
    // nhầm là "MONITOR_BEAT_TOGGLE không có element nào tồn tại" — đã audit lại kỹ, xác nhận
    // ĐÂY chính là element đó (chỉ đặt tên "music" thay vì "beat" trong id, cùng ngữ nghĩa
    // "bật tắt monitor Beat" theo tài liệu xlsx tham chiếu — xem TASK_B6_REPORT.md). Khai báo
    // theo đúng khuôn "trước, không mapping mặc định" như MONITOR_MIC1/2/FX ở trên.
    MONITOR_BEAT_TOGGLE: "MONITOR_BEAT_TOGGLE",
    // TASK B12 — Retune 1/2: target = Auto-Tune Retune Speed (Mic 1/2), đã xác nhận bằng
    // bằng chứng độc lập (tài liệu xlsx + docs/kien-truc-tong-quan.md, xem TASK_B6_REPORT.md
    // và TASK_B8_REPORT.md) — KHÔNG CÓ CC number nào được biết. Khai báo action theo đúng
    // khuôn Beat/Master (B6): sẵn sàng dispatch, KHÔNG tự đặt CC, chờ user cấu hình qua Setup.
    RETUNE_SPEED_MIC1: "RETUNE_SPEED_MIC1",
    RETUNE_SPEED_MIC2: "RETUNE_SPEED_MIC2",
    // TASK AI-FX-01 — FX = các Send (track giọng hát -> bus Reverb / Delay) trên DAW. Khai báo theo khuôn
    // "trước, KHÔNG mapping mặc định": repo KHÔNG chứa bất kỳ CC/Note nào của Send, nên KHÔNG tự đặt —
    // user cấu hình trong Setup (MIDI Output Mapping). MONITOR_FX cũ vẫn giữ làm mapping Send đơn (tương thích).
    FX_SEND_REVERB: "FX_SEND_REVERB",
    FX_SEND_DELAY: "FX_SEND_DELAY",
    // TASK B6 (Beat/Master) — khai báo trước, KHÔNG mapping mặc định, cùng khuôn với
    // MONITOR_* ở trên. QUAN TRỌNG: 2 action này CỐ Ý tách biệt, KHÔNG gộp thành 1 tên
    // "VOLUME" chung — đúng yêu cầu "Beat = INPUT MUSIC LEVEL, Master = FINAL DAW OUTPUT
    // LEVEL", không phải cùng 1 khái niệm. Không tự đặt CC — user tự cấu hình qua Setup
    // (bảng DAW_MIDI_ACTIONS đã mở rộng, xem ui/js/setup.js), giống hệt cơ chế Button.
    BEAT_INPUT_VOLUME: "BEAT_INPUT_VOLUME",
    MASTER_OUTPUT_VOLUME: "MASTER_OUTPUT_VOLUME",
    // MIDI-DAW-CONTROL-01 — TÁM lệnh ĐẶT TRẠNG THÁI ĐÍCH (ON và OFF là hai action RIÊNG, mỗi cái một mapping riêng),
    // thay cho lệnh toggle không xác định. MUSIC = Monitor track "Beat"; MIC1 = Monitor track "Mic"; MIC2 = Monitor
    // track "Không Dây"; FX = Mute bus Delay/Verb ngắn/Verb dài/Com Verb (FX ON = bỏ mute, FX OFF = mute). Không có
    // mapping mặc định — người dùng tự lưu trong Setup (không tự gán CC không có bằng chứng). Các action cũ
    // (MONITOR_BEAT_TOGGLE/MONITOR_MIC1/MONITOR_MIC2/MONITOR_FX) GIỮ NGUYÊN để tương thích ngược.
    MUSIC_ON: "MUSIC_ON",
    MUSIC_OFF: "MUSIC_OFF",
    MIC1_ON: "MIC1_ON",
    MIC1_OFF: "MIC1_OFF",
    MIC2_ON: "MIC2_ON",
    MIC2_OFF: "MIC2_OFF",
    FX_ON: "FX_ON",
    FX_OFF: "FX_OFF",
    // MENU-FIX-02 — lệnh CHỌN TRACK riêng (macro chỉ có "Find Track"), tuỳ chọn. Có mapping thì Menu gửi nó TRƯỚC, chờ track chuyển xong,
    // rồi mới gửi ON/OFF. Chưa lưu => hành vi cũ (một lệnh/cú bấm).
    MUSIC_SELECT: "MUSIC_SELECT",
    MIC1_SELECT: "MIC1_SELECT",
    MIC2_SELECT: "MIC2_SELECT"
});

// MIDI-DAW-CONTROL-01 — nút Menu -> cặp action ON/OFF + action toggle CŨ (dùng khi người dùng CHƯA cấu hình ON/OFF).
const DAW_STATE_CONTROLS = Object.freeze({
    MUSIC: Object.freeze({ on: "MUSIC_ON", off: "MUSIC_OFF", legacy: "MONITOR_BEAT_TOGGLE", select: "MUSIC_SELECT", label: "MUSIC (Monitor Beat)" }),
    MIC1: Object.freeze({ on: "MIC1_ON", off: "MIC1_OFF", legacy: "MONITOR_MIC1", select: "MIC1_SELECT", label: "MIC 1 (Monitor Mic)" }),
    MIC2: Object.freeze({ on: "MIC2_ON", off: "MIC2_OFF", legacy: "MONITOR_MIC2", select: "MIC2_SELECT", label: "MIC 2 (Monitor Không Dây)" }),
    FX: Object.freeze({ on: "FX_ON", off: "FX_OFF", legacy: "MONITOR_FX", label: "FX (Mute 4 bus)" })
});

// Action nào đã có Mouse Coordinate key tương ứng (Mục 8, ưu tiên DAW Play/Stop/Record —
// Mục 7/24 Phase 3). Khoá lưu vào coordinateProfiles[daw][...] — TÁI SỬ DỤNG đúng cơ chế
// getCoordinateProfile/getCoordinate/setCoordinate đã có sẵn trong appSettings.js (Mục 14
// "không tạo state trùng"), chỉ thêm 3 KEY MỚI, không đụng autokey1/autokey2/autotunekey/
// chromatic (đang phục vụ Key/Tone Plugin, không liên quan DAW).
const ACTION_COORDINATE_KEY = Object.freeze({
    [ACTIONS.DAW_PLAY]: "daw_play",
    [ACTIONS.DAW_STOP]: "daw_stop",
    [ACTIONS.DAW_RECORD]: "daw_record"
});

// MIDI Input Learn (setupMidiInput.js) đang lưu action dưới dạng chuỗi ngắn kiểu "daw:play"
// (đúng options có sẵn trong ui/setup.html #midiLearnAction). Map 1-1 sang ACTIONS ở trên —
// đây chính là "Logical Action" mà Mục 12/13 yêu cầu MIDI Learn phải trỏ vào.
const MIDI_LEARN_ACTION_TO_LOGICAL = Object.freeze({
    "daw:play": ACTIONS.DAW_PLAY,
    "daw:stop": ACTIONS.DAW_STOP,
    "daw:record": ACTIONS.DAW_RECORD
});

// ---------------------------------------------------------
// Mục 22 — DAW PROFILE (đọc/ghi). Danh sách DAW theo đúng Mục 8: Studio One, Ableton
// Live, Cubase, FL Studio, Reaper. Giá trị nội bộ khớp với các option đã có sẵn trong
// ui/setup.html (#dawSelect / selectedDAW) — không tạo danh sách DAW thứ hai.
// ---------------------------------------------------------
const SUPPORTED_DAWS = Object.freeze([
    "studio-one", "ableton", "cubase", "fl-studio", "reaper"
]);

// FSP8-MIDI-SYNC-FAST-02 — hiệu chuẩn CHỈ cho núm MUSIC (BEAT_INPUT_VOLUME) khi DAW chọn là "Studio Pro 8".
// Căn cứ: số đo thật của người dùng (CC20 → fader Beat): CC64 = −11,3 dB · CC95 = −0,5 · CC97 = +0,2 · CC98 = +0,5 · CC99 = +0,8 ·
// CC114 = +5,7 · CC127 = +10 dB. Mục tiêu: MUSIC 90 → fader gần 0 dB nhất theo số đo = CC97 (+0,2 dB).
// Điểm neo [MenuMusic, CC]: 50→64 và 100→127 là điểm hiện hành đã đo; 90→97 là LỰA CHỌN hiệu chuẩn (không phải CC "tự nhiên" của 90).
// FSP8-MIDI-SYNC-FAST-03 — số đo sau FAST-02 cho thấy trong CC 81–127 fader FSP8 gần tuyến tính theo dB: dB ≈ 0,3284×CC − 31,71 (13 điểm đo, sai số ≤ 0,05 dB);
// dưới CC81 chỉ có điểm CC64 nên KHÔNG ngoại suy. Đoạn Menu 50→90 giữ nguyên (đo: −5,1 / −3,8 / −2,5 / −1,2 / +0,2 dB ở 70/75/80/85/90, tăng đều ~0,27 dB/bước).
// Đoạn 90→100 (trước FAST-03: 3 CC/bước ≈ 1 dB/bước, 90→95 = +4,9 dB) nay là đường parabol liên tục độ dốc tại 90: CC = 97 + 0,825·t + 0,2175·t² (t = MUSIC − 90), làm tròn;
// vẫn kết thúc đúng MUSIC 100 → CC127. dB tương ứng ở các neo là DỰ ĐOÁN theo công thức tuyến tính-dB nói trên, CHƯA đo.
// Dưới 50: giữ nguyên công thức cũ round(v×127/100) (liên tục tại 50). Giữa các neo: nội suy tuyến tính theo CC — đây chỉ là XẤP XỈ
// theo Menu, KHÔNG phải đường cong thật của FSP8. Các action/DAW khác: công thức cũ, không đổi.
const KNOB_CC_ANCHORS = Object.freeze({
    "Studio Pro 8": Object.freeze({
        BEAT_INPUT_VOLUME: Object.freeze([[50, 64], [90, 97], [91, 98], [92, 100], [93, 101], [94, 104], [95, 107], [96, 110], [97, 113], [98, 118], [99, 122], [100, 127]]),
    }),
});

function knobToCc(action, value, daw) {
    const v = Math.max(0, Math.min(100, Number(value)));
    const linear = Math.round(v * 127 / 100);
    const dawName = daw === undefined ? getSelectedDaw() : daw;
    const anchors = (KNOB_CC_ANCHORS[dawName] || {})[action];
    if (!anchors || v < anchors[0][0]) return linear;
    let cc = anchors[anchors.length - 1][1];
    for (let i = 0; i < anchors.length - 1; i++) {
        const [x0, y0] = anchors[i], [x1, y1] = anchors[i + 1];
        if (v >= x0 && v <= x1) { cc = y0 + (y1 - y0) * (v - x0) / (x1 - x0); break; }
    }
    return Math.max(0, Math.min(127, Math.round(cc)));
}

function getSelectedDaw() {
    return (typeof getSetting === "function" ? getSetting("selectedDAW") : "") || "";
}

// Mục 9 — MIDI OUTPUT mapping đi theo Logical Action, KHÔNG theo DAW cứng trong code.
// Mục 23 — phân biệt DEFAULT (không có, vì không tự bịa CC/note — Mục 8) và USER_DEFINED
// (chỉ tồn tại khi người dùng tự lưu qua UI Setup). Không ghi đè nếu đã có giá trị.
function getMidiOutMapping(action) {
    const daw = getSelectedDaw();
    if (!daw) return null;
    const all = (typeof getSetting === "function" ? getSetting("dawMidiOutMappings") : {}) || {};
    return (all[daw] && all[daw][action]) || null;
}

function setMidiOutMapping(action, mapping) {
    const daw = getSelectedDaw();
    if (!daw) return false;
    const all = (typeof getSetting === "function" ? getSetting("dawMidiOutMappings") : {}) || {};
    if (!all[daw]) all[daw] = {};
    all[daw][action] = mapping ? { ...mapping, source: "USER_DEFINED" } : null;
    if (typeof setSetting === "function") setSetting("dawMidiOutMappings", all);
    return true;
}

function getMouseCoordinate(action) {
    const key = ACTION_COORDINATE_KEY[action];
    if (!key || typeof getCoordinate !== "function") return "";
    return getCoordinate(key);
}

// Mục 8 (v1) / VIII (B2) — trạng thái THẬT của 1 action cho DAW đang chọn, không đoán.
// Dùng CHUNG enum với executeAction() bên dưới (SUCCESS/NOT_CONFIGURED/NO_DEVICE/
// MOUSE_DISABLED/ERROR) để cả 2 nơi luôn nhất quán, không lệch nhau.
const ACTION_STATUS = Object.freeze({
    SUCCESS: "SUCCESS",
    NOT_CONFIGURED: "NOT_CONFIGURED",
    NO_DEVICE: "NO_DEVICE",
    MOUSE_DISABLED: "MOUSE_DISABLED",
    ERROR: "ERROR"
});

function getActionStatus(action) {
    if (!getSelectedDaw()) return { status: ACTION_STATUS.NOT_CONFIGURED, via: null, reason: "NO_DAW_SELECTED" };
    if (getMidiOutMapping(action)) return { status: ACTION_STATUS.SUCCESS, via: "midi" };
    if (getMouseCoordinate(action)) {
        return isMouseControlEnabled()
            ? { status: ACTION_STATUS.SUCCESS, via: "mouse" }
            : { status: ACTION_STATUS.MOUSE_DISABLED, via: "mouse" };
    }
    return { status: ACTION_STATUS.NOT_CONFIGURED, via: null };
}

// ---------------------------------------------------------
// Mục 15 (v1) / VI (B2) — Mouse Control ON/OFF, CHỈ gate nhánh mouse-fallback CỦA RIÊNG
// file này (executeAction bên dưới). KHÔNG liên quan gì tới clickAtPoint() trong
// vocalCommandRouter.js (Key/Tone Plugin) — xem trace ở đầu file. Mặc định ON (Mục VI B2).
// ---------------------------------------------------------
function isMouseControlEnabled() {
    if (typeof getSetting !== "function") return true; // an toàn: mặc định cho phép, giữ hành vi cũ
    const v = getSetting("mouseControlEnabled");
    return v === undefined || v === null || v === "" ? true : !!v;
}

// ---------------------------------------------------------
// Mục 21 (v1) / VIII (B2) — ACTION EXECUTOR: nơi DUY NHẤT quyết định MIDI hay Mouse cho 1
// Logical Action. UI button/MIDI dispatcher KHÔNG được tự biết CC hay toạ độ — chỉ gọi
// executeAction(). Luôn trả { ok, status, via, ... } với status thuộc đúng 5 giá trị
// ACTION_STATUS ở trên (Mục VIII B2: "Action phải có trạng thái SUCCESS/NOT_CONFIGURED/
// NO_DEVICE/MOUSE_DISABLED/ERROR").
// ---------------------------------------------------------
async function executeAction(action, context = {}) {
    const reason = context.reason || action;
    const log = (status, extra) => console.log(`[ActionExecutor] ${action} (${reason}) -> ${status}`, extra ?? "");

    const midiMap = getMidiOutMapping(action);
    if (midiMap && midiMap.kind && Number.isFinite(midiMap.number)) {
        try {
            let sent = false;
            // TASK B6 (Beat/Master) — cho phép value ĐỘNG từ caller (vd giá trị Knob 0-100)
            // ghi đè value TĨNH đã cấu hình trong Setup. Backward-compatible: nếu caller
            // KHÔNG truyền context.value (mọi Button hiện có — CLAP/LAUGH/PRESET_*/MONITOR_*/
            // DAW_*), hành vi giữ NGUYÊN 100% như trước (dùng đúng midiMap.value/velocity tĩnh
            // đã lưu). Chỉ áp dụng khi context.value là number hợp lệ — không đổi field CC/
            // channel/kind nào, chỉ đổi phần VALUE gửi đi mỗi lần gọi.
            const dynamicValue = Number.isFinite(context.value) ? context.value : undefined;
            // MENU-KNOB-MIDI-COMPLETION-01 — 4 Knob MIDI (Beat/Master/Retune 1/Retune 2) có thang UI 0–100 nhưng CC chuẩn là 0–127:
            // đổi TUYẾN TÍNH ccValue = round(clamp(v,0,100) × 127 / 100) (0→0, 25→32, 50→64, 75→95, 100→127). CHỈ áp dụng khi caller là Knob
            // (context.reason === "knob") VÀ action thuộc 4 Knob này VÀ mapping là CC; mọi Action khác dùng context.value như cũ (không đổi).
            // Không gửi lặp: nếu cùng action + cùng mapping (kind/kênh/số) + cùng ccValue với lần gửi THÀNH CÔNG gần nhất thì bỏ qua (trả ok, skipped).
            // Lần gửi lỗi thì xoá bộ nhớ đệm để lần sau gửi lại. Không gửi gì lúc khởi động/khôi phục giá trị đã lưu (chỉ handler Knob gọi hàm này).
            const isKnobCc = midiMap.kind === "cc" && dynamicValue !== undefined && context.reason === "knob"
                && (action === ACTIONS.BEAT_INPUT_VOLUME || action === ACTIONS.MASTER_OUTPUT_VOLUME
                    || action === ACTIONS.RETUNE_SPEED_MIC1 || action === ACTIONS.RETUNE_SPEED_MIC2);
            if (isKnobCc && typeof sendMidiCC === "function") {
                const ccValue = knobToCc(action, dynamicValue);
                const sig = `${midiMap.kind}|${midiMap.channel || 1}|${midiMap.number}`;
                const cache = (window.__knobLastCc = window.__knobLastCc || {});
                if (cache[action] && cache[action].sig === sig && cache[action].cc === ccValue) {
                    log(ACTION_STATUS.SUCCESS, `bỏ qua: giá trị CC ${ccValue} không đổi`);
                    return { ok: true, status: ACTION_STATUS.SUCCESS, via: "midi", skipped: "DUPLICATE_VALUE", ccValue };
                }
                sent = await sendMidiCC(midiMap.number, ccValue, (midiMap.channel || 1) - 1);
                if (sent) cache[action] = { sig, cc: ccValue }; else delete cache[action];
                if (sent) { log(ACTION_STATUS.SUCCESS, `knob ${dynamicValue} -> CC ${ccValue}`); return { ok: true, status: ACTION_STATUS.SUCCESS, via: "midi", ccValue }; }
            } else if (midiMap.kind === "cc" && typeof sendMidiCC === "function") {
                sent = await sendMidiCC(midiMap.number, dynamicValue ?? midiMap.value ?? 127, (midiMap.channel || 1) - 1);
            } else if (midiMap.kind === "note" && typeof sendMidiNotePulse === "function") {
                sent = await sendMidiNotePulse(midiMap.number, dynamicValue ?? midiMap.velocity ?? 100, (midiMap.channel || 1) - 1);
            } else {
                throw new Error("Mapping MIDI không hợp lệ (thiếu hàm gửi tương ứng)");
            }
            // sendMidiCC/sendMidiNotePulse (appSettings.js) trả về false (KHÔNG throw) khi
            // chưa chọn/không mở được cổng MIDI output — đây chính là ca NO_DEVICE thật,
            // phải tự kiểm tra return value, không thể chỉ dựa vào try/catch.
            if (!sent) {
                log(ACTION_STATUS.NO_DEVICE, "getSelectedMidiOutput() không tìm thấy cổng đã cấu hình");
                return { ok: false, status: ACTION_STATUS.NO_DEVICE, via: "midi" };
            }
            log(ACTION_STATUS.SUCCESS);
            return { ok: true, status: ACTION_STATUS.SUCCESS, via: "midi" };
        } catch (err) {
            console.error(`[ActionExecutor] ${action} (${reason}) -> ${ACTION_STATUS.ERROR}:`, err);
            return { ok: false, status: ACTION_STATUS.ERROR, via: "midi", error: String(err) };
        }
    }

    const coordKey = ACTION_COORDINATE_KEY[action];
    const point = coordKey ? getMouseCoordinate(action) : "";
    if (point) {
        if (!isMouseControlEnabled()) {
            log(ACTION_STATUS.MOUSE_DISABLED);
            return { ok: false, status: ACTION_STATUS.MOUSE_DISABLED, via: "mouse" };
        }
        if (!window.electronAPI?.clickAtPoint) {
            log(ACTION_STATUS.NO_DEVICE, "clickAtPoint không khả dụng (không phải môi trường Electron?)");
            return { ok: false, status: ACTION_STATUS.NO_DEVICE, via: "mouse" };
        }
        try {
            const result = await window.electronAPI.clickAtPoint(point);
            log(ACTION_STATUS.SUCCESS, result);
            return { ok: true, status: ACTION_STATUS.SUCCESS, via: "mouse", result };
        } catch (err) {
            console.error(`[ActionExecutor] ${action} (${reason}) -> ${ACTION_STATUS.ERROR}:`, err);
            return { ok: false, status: ACTION_STATUS.ERROR, via: "mouse", error: String(err) };
        }
    }

    log(ACTION_STATUS.NOT_CONFIGURED, `(chưa có MIDI mapping lẫn toạ độ cho DAW "${getSelectedDaw() || "(chưa chọn)"}")`);
    return { ok: false, reason: "NOT_CONFIGURED" };
}

// ---------------------------------------------------------
// MIDI-DAW-CONTROL-01 — ĐẶT TRẠNG THÁI ĐÍCH (ON/OFF) cho 4 nút Menu.
//
// Quy tắc (đã kiểm bằng test):
//  * `targetOn` là trạng thái ĐÍCH SAU cú bấm (renderer đọc class SAU khi toggle), KHÔNG phải trạng thái trước.
//  * Chế độ "explicit": nếu người dùng đã lưu ÍT NHẤT MỘT trong hai mapping ON/OFF của nút -> chỉ gửi đúng mapping của
//    chiều đích. Thiếu mapping chiều đó => NOT_CONFIGURED (KHÔNG rơi xuống lệnh toggle cũ — toggle không xác định
//    sẽ đảo ngược trạng thái). Mỗi cú bấm gửi ĐÚNG MỘT lệnh; lặp ON/ON hay OFF/OFF đều gửi lại lệnh đích.
//  * Chế độ "legacy": chưa cấu hình ON/OFF nào -> hành vi CŨ giữ nguyên 100% (executeAction lệnh toggle cũ).
//  * Không có phản hồi từ Studio One: kết quả `ok` chỉ nghĩa "lệnh đã được đưa vào MIDI Output" (delivery UNCONFIRMED),
//    KHÔNG BAO GIỜ là DAW_CONFIRMED. Lịch sử kết quả: window.__dawStateLast[control].
// ---------------------------------------------------------
function isMidiMappingConfigured(action) {
    const m = getMidiOutMapping(action);
    return !!(m && m.kind && Number.isFinite(m.number));
}

function getDawStateMode(control) {
    const def = DAW_STATE_CONTROLS[control];
    if (!def) return "legacy";
    return (isMidiMappingConfigured(def.on) || isMidiMappingConfigured(def.off)) ? "explicit" : "legacy";
}

function describeDawStateResult(control, targetOn, res, mode) {
    const def = DAW_STATE_CONTROLS[control];
    const dir = targetOn ? "ON" : "OFF";
    if (mode === "legacy") {
        if (res && res.ok) return `đã GỬI lệnh toggle cũ (${def.legacy}) — DAW chưa xác nhận; chưa cấu hình ON/OFF riêng`;
        if (res && (res.reason === "NOT_CONFIGURED" || res.status === "NOT_CONFIGURED")) return `CHƯA cấu hình ${def.label} ON/OFF trong Setup — DAW KHÔNG nhận lệnh`;
        return `gửi lệnh toggle cũ (${def.legacy}) LỖI${res && res.status ? " (" + res.status + ")" : ""}`;
    }
    if (res && res.ok) return `đã GỬI lệnh ${def.label} ${dir} — DAW chưa xác nhận (Menu không đọc được trạng thái Studio One)`;
    if (res && (res.reason === "NOT_CONFIGURED" || res.status === "NOT_CONFIGURED")) return `CHƯA cấu hình lệnh ${def.label} ${dir} trong Setup — DAW KHÔNG nhận lệnh`;
    return `gửi lệnh ${def.label} ${dir} LỖI${res && res.status ? " (" + res.status + ")" : ""} — DAW KHÔNG nhận lệnh`;
}

// MENU-FIX-02 — macro Monitor của Studio Pro là lệnh ĐẢO chạy lên track ĐANG CHỌN (INFERRED từ triệu chứng + mô tả macro "State rỗng"):
// nếu Find Track chưa kịp chuyển track thì lệnh đảo rơi vào track CŨ (bấm MIC 2 làm MIC 1 đảo theo). Giải pháp: gửi CHỌN TRACK trước,
// chờ ngắn, rồi mới gửi ON/OFF — mỗi cú bấm đúng MỘT lệnh Monitor, trên đúng track. Các chuỗi "chọn → chờ → ON/OFF" xếp hàng tuần tự
// toàn cục để hai nút bấm sát nhau không xen lẫn. KHÔNG bao giờ gửi lại lệnh Monitor (sẽ đảo lần nữa).
const DAW_SELECT_SETTLE_DEFAULT_MS = 300;
function getDawSelectSettleMs() {
    const v = typeof getSetting === "function" ? getSetting("dawSelectSettleMs") : undefined;
    if (v === undefined || v === null || v === "") return DAW_SELECT_SETTLE_DEFAULT_MS;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return DAW_SELECT_SETTLE_DEFAULT_MS;
    return Math.min(n, 2000);
}
let dawSequenceChain = Promise.resolve();
function runDawSequence(fn) {
    const p = dawSequenceChain.then(fn, fn);
    dawSequenceChain = p.catch(() => {});
    return p;
}

async function setDawControlState(control, targetOn, context = {}) {
    const def = DAW_STATE_CONTROLS[control];
    if (!def) return { ok: false, reason: "UNKNOWN_CONTROL", control };
    const mode = getDawStateMode(control);
    const reason = context.reason || "menu-button";
    let res;
    let action;
    if (mode === "explicit") {
        action = targetOn ? def.on : def.off;
        if (!isMidiMappingConfigured(action)) {
            res = { ok: false, status: ACTION_STATUS.NOT_CONFIGURED, reason: "NOT_CONFIGURED" };
        } else if (def.select && isMidiMappingConfigured(def.select)) {
            // MENU-FIX-02 — CHỌN TRACK -> chờ -> ON/OFF. Chọn lỗi => KHÔNG gửi Monitor (tránh đảo nhầm track cũ).
            res = await runDawSequence(async () => {
                const sel = await executeAction(def.select, { reason: `${reason}-select` });
                if (!sel || !sel.ok) return { ...(sel || {}), ok: false, selectFailed: true };
                const wait = getDawSelectSettleMs();
                if (wait > 0) await new Promise((r) => setTimeout(r, wait));
                const r2 = await executeAction(action, { reason });
                return { ...r2, selectUsed: def.select, selectWaitMs: wait };
            });
        } else {
            res = await executeAction(action, { reason });
        }
    } else {
        action = def.legacy;
        res = await executeAction(action, { reason });
    }
    const out = {
        ...res,
        control,
        target: targetOn ? "ON" : "OFF",
        mode,
        action,
        delivery: res && res.ok ? "UNCONFIRMED" : "NOT_SENT",
        dawConfirmed: false, // không có phản hồi từ Studio One => KHÔNG BAO GIỜ true
        text: describeDawStateResult(control, targetOn, res, mode)
    };
    if (res && res.selectFailed) out.text = `gửi lệnh CHỌN TRACK (${def.select}) LỖI — KHÔNG gửi lệnh Monitor (tránh đảo nhầm track khác)`;
    else if (res && res.selectUsed) out.text += ` [đã chọn track trước, chờ ${res.selectWaitMs} ms]`;
    // Lỗi gửi: nêu tầng + lỗi gốc của đường gửi main-process (appSettings.js::getLastMidiSendResult), không che.
    if (!out.ok && out.status === ACTION_STATUS.NO_DEVICE && typeof window !== "undefined" && typeof window.getLastMidiSendResult === "function") { // chỉ khi THỰC SỰ đã thử gửi (không dùng kết quả cũ cho NOT_CONFIGURED)
        const lr = window.getLastMidiSendResult();
        if (lr && lr.reason) { out.sendError = { reason: lr.reason, detail: lr.detail || null }; out.text += ` [${lr.reason}${lr.detail ? ": " + lr.detail : ""}]`; }
    }
    if (typeof window !== "undefined") {
        window.__dawStateLast = window.__dawStateLast || {};
        window.__dawStateLast[control] = { target: out.target, ok: !!out.ok, mode, action, status: out.status || out.reason || null, text: out.text, at: Date.now() };
    }
    console.log(`[DawState] ${control} -> ${out.target} (${mode}, ${action}): ${out.text}`);
    return out;
}

// ==========================================================
// GHI CHÚ QUAN TRỌNG (đã tự sửa lại sau khi phát hiện trùng lặp — xem báo cáo Task B V1):
// File này BAN ĐẦU có thêm 1 dispatcher lắng nghe MIDI Input (Web MIDI, renderer) để tự gọi
// executeAction() khi khớp mapping đã Learn — nhưng khi audit lại main.js phát hiện
// core/command-engine-js/runtime.js (CommandRuntime, chạy ở main process bằng Node
// easymidi) ĐÃ làm ĐÚNG việc này rồi (start() trong app/main.js, đọc cùng
// midiMappingsV1, dispatch daw:play/stop/record qua MidiDriver/HotkeyDriver cho
// Studio One) — nên đã GỠ phần đó khỏi file này để không tạo 2 dispatcher cùng nghe
// 1 mapping (2 lệnh bắn cùng lúc cho 1 lần bấm controller là lỗi thật, không phải
// vô hại). executeAction() ở trên vẫn hữu ích như 1 lối gọi TRỰC TIẾP (vd nút UI
// trong menu chính bấm thẳng, không qua MIDI Input) — bổ sung, không trùng, vì
// CommandRuntime không có nhánh "click chuột tại toạ độ đã capture" như executeAction()
// có ở trên.
// ==========================================================

// Expose cho renderer.js (Phase 3: nối nút UI, nếu có) và cho DevTools Console debug —
// không export gì liên quan Manual/AI/MOD/Key/BPM (đúng phạm vi khoá của task).
window.ActionRegistry = {
    ACTIONS,
    ACTION_STATUS,
    SUPPORTED_DAWS,
    executeAction,
    getActionStatus,
    getMidiOutMapping,
    setMidiOutMapping,
    getMouseCoordinate,
    isMouseControlEnabled,
    // MIDI-DAW-CONTROL-01
    DAW_STATE_CONTROLS,
    getDawStateMode,
    setDawControlState
};
