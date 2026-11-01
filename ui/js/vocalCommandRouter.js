/* ==========================================================
   VOCAL COMMAND ROUTER
   -----------------------------------------------------------
   Đây chính là "Command Engine" đã bàn ở đầu cuộc trò chuyện, áp vào đúng
   2 hành động thật của app: đổi Key cho Auto-Tune, và dịch Tone theo semitone.

   Nguyên tắc giống hệt lúc đầu:
   1. Ưu tiên MIDI nếu đã cấu hình cổng MIDI ảo (midiOutputPort) trong Setup —
      dùng lại sendMidiNotePulse()/sendMidiCC() đã có sẵn trong appSettings.js.
   2. Nếu không có MIDI, fallback sang click tại toạ độ đã capture ở Setup
      (autotunekey / chromatic) qua window.electronAPI.clickAtPoint().
   3. Nếu cả hai đều chưa cấu hình -> trả lỗi rõ ràng để renderer.js hiển thị,
      không click mò hay gửi MIDI mò.

   LƯU Ý CẦN BẠN KIỂM TRA LẠI (mình không có cách xác nhận từ đây):
   - Mapping note MIDI dưới đây (C=0..B=11) giả định plugin Auto-Tune của bạn
     học phím theo đúng thứ tự đó khi bạn bấm MIDI Learn. Nếu không đúng,
     chỉnh lại NOTE_MAP.
   - Với "chromatic" (2 điểm đã capture ở Setup), mình giả định điểm capture
     ĐẦU là nút tăng semitone (▲), điểm THỨ HAI là nút giảm (▼). Nếu ngược,
     đổi CHROMATIC_UP_INDEX / CHROMATIC_DOWN_INDEX ở dưới.
   ========================================================== */

const NOTE_MAP = { "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11 };
const CHROMATIC_UP_INDEX = 0;
const CHROMATIC_DOWN_INDEX = 1;
const CLICK_STEP_DELAY_MS = 90; // khoảng nghỉ giữa các click liên tiếp khi dịch nhiều semitone

/* ==========================================================
   SOUNDSHIFTER (điều khiển hoàn toàn bằng MIDI, không còn click chuột)
   -----------------------------------------------------------
   - Dùng CHUNG cổng MIDI ảo với Auto-Tune (setting "midiOutputPort").
   - SOUNDSHIFTER_STEP_RATIO = 2: đã được người dùng xác nhận trực tiếp bằng tai —
     mỗi 1 bán cung (1 đơn vị trên menu/Auto-Tune) tương ứng 2 đơn vị bên SoundShifter.
     Ví dụ: menu chọn +2 (lên 1 tone, Dm -> Em) -> Auto-Tune nhận +2, SoundShifter nhận +4.
   - CC number dưới đây là VÍ DỤ, PHẢI vào SoundShifter bấm "MIDI Learn" trên chính 2 nút
     ▲/▼ và nút Bypass/Power của nó rồi đối chiếu lại đúng số CC thật, đổi lại ở đây.
   ========================================================== */
const SOUNDSHIFTER_STEP_RATIO = 2; // đã xác nhận với người dùng: 1 bán cung (menu) = 2 đơn vị SoundShifter
const SOUNDSHIFTER_UP_CC = 22;     // TODO: đổi theo đúng CC thật sau khi MIDI Learn nút ▲ của SoundShifter
const SOUNDSHIFTER_DOWN_CC = 23;   // TODO: đổi theo đúng CC thật sau khi MIDI Learn nút ▼ của SoundShifter
const SOUNDSHIFTER_TOGGLE_CC = 24; // TODO: đổi theo đúng CC thật sau khi MIDI Learn nút Bypass/Power
// MOD-BYPASS-01 — CC trên là nút BYPASS của SoundShifter (127 = BYPASS BẬT = plugin bị bỏ qua, 0 = BYPASS TẮT = plugin hoạt động).
// Yêu cầu: MOD ON -> Bypass TẮT (SoundShifter chạy); MOD OFF -> Bypass BẬT (SoundShifter bị bỏ qua). Nên giá trị gửi là NGƯỢC với "bật/tắt".
// Nếu nút học trong DAW là kiểu Power/Enable (127 = chạy) thì đổi hằng này thành false để quay về 127 = bật, 0 = tắt.
const SOUNDSHIFTER_TOGGLE_IS_BYPASS = true;

/**
 * Bật/tắt plugin SoundShifter qua MIDI CC (nút Bypass của plugin).
 * isOn=true (MOD ON)  -> Bypass TẮT -> gửi 0   (SOUNDSHIFTER_TOGGLE_IS_BYPASS = true, mặc định).
 * isOn=false (MOD OFF) -> Bypass BẬT -> gửi 127.
 * Nếu SOUNDSHIFTER_TOGGLE_IS_BYPASS = false (nút kiểu Power/Enable): isOn -> 127, tắt -> 0.
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
async function setSoundShifterPower(isOn) {
    const midiPort = getSetting("midiOutputPort");
    if (!midiPort) {
        return { ok: false, detail: 'Chưa cấu hình cổng MIDI (Setup > MIDI) — SoundShifter chỉ điều khiển được qua MIDI.' };
    }

    const value = (isOn !== SOUNDSHIFTER_TOGGLE_IS_BYPASS) ? 127 : 0; // bypass-kiểu: ON->0, OFF->127 | power-kiểu: ON->127, OFF->0
    const sent = await sendMidiCC(SOUNDSHIFTER_TOGGLE_CC, value);
    return sent
        ? { ok: true, driverUsed: "midi" }
        : { ok: false, driverUsed: "midi", detail: "Gửi MIDI CC thất bại (cổng MIDI có thể đã bị rút/đổi tên)." };
}

/**
 * Dịch tone của SoundShifter đi `semitoneDelta` bán cung THEO ĐÚNG ĐƠN VỊ CỦA MENU/AUTO-TUNE
 * (hàm tự nhân với SOUNDSHIFTER_STEP_RATIO ở bên trong, nơi gọi không cần tự tính lại).
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
async function sendToneStepToSoundShifter(semitoneDelta) {
    if (!semitoneDelta) return { ok: true, driverUsed: "none" };

    const midiPort = getSetting("midiOutputPort");
    if (!midiPort) {
        return { ok: false, detail: 'Chưa cấu hình cổng MIDI (Setup > MIDI) — SoundShifter chỉ điều khiển được qua MIDI.' };
    }

    const steps = Math.abs(semitoneDelta) * SOUNDSHIFTER_STEP_RATIO;
    const goingUp = semitoneDelta > 0;
    const ccNumber = goingUp ? SOUNDSHIFTER_UP_CC : SOUNDSHIFTER_DOWN_CC;

    for (let i = 0; i < steps; i++) {
        const sent = await sendMidiCC(ccNumber, 127);
        if (!sent) {
            return { ok: false, driverUsed: "midi", detail: "Gửi MIDI CC thất bại giữa chừng (SoundShifter)." };
        }
        await delay(CLICK_STEP_DELAY_MS);
    }

    return { ok: true, driverUsed: "midi" };
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCapturedPoint(raw) {
    // setup-capture trả về {x,y} (1 điểm) hoặc [{x,y}, {x,y}] (nhiều điểm) rồi được lưu nguyên vẹn.
    if (!raw) return null;
    return raw;
}

// ---------------------------------------------------------
// (Cập nhật theo yêu cầu Khói) — TRƯỚC ĐÂY nhánh click chuột fallback ở file này (Key
// Auto-Tune + Chromatic) được cố tình để ĐỘC LẬP với công tắc "Mouse Control" (Setup >
// Calibration), chỉ actionRegistry.js (DAW Action Mapping) mới bị gate. Khói xác nhận
// không muốn vậy nữa: tắt Mouse Control phải chặn được CẢ đường click Key/Chromatic này —
// vì thực tế quan sát được là "dò xong bài hát tự ấn luôn" dù đã tắt công tắc.
// Đọc TRỰC TIẾP setting "mouseControlEnabled" tại đây (không gọi qua actionRegistry.js để
// không tạo phụ thuộc chéo file ngoài phạm vi) — cùng key, cùng mặc định ON khi chưa có
// giá trị, giữ đúng hành vi cũ khi công tắc đang bật.
// ---------------------------------------------------------
function isMouseFallbackAllowed() {
    if (typeof getSetting !== "function") return true; // an toàn: mặc định cho phép, giữ hành vi cũ
    const v = getSetting("mouseControlEnabled");
    return v === undefined || v === null || v === "" ? true : !!v;
}

/**
 * KEY-SCALE-CC-01 — gửi SCALE (Major/Minor) của Key xuống Auto-Tune bằng CC RIÊNG (người dùng chọn Scale theo từng bài, nốt MIDI chỉ mang nốt gốc).
 * Dùng ActionRegistry: KEY_SCALE_MAJOR / KEY_SCALE_MINOR — mỗi cái một mapping CC do người dùng lưu ở Setup (không có mặc định ngầm).
 * Chưa lưu mapping => KHÔNG gửi gì (attempted=false), Key vẫn gửi như cũ. Kết quả chỉ để chẩn đoán, không bao giờ làm hỏng việc gửi Key.
 * @returns {Promise<{attempted: boolean, mode?: string, ok?: boolean, status?: string, reason?: string}>}
 */
async function sendKeyScaleToAutotune(keyName) {
    const mode = /minor/i.test(keyName) ? "MINOR" : (/major/i.test(keyName) ? "MAJOR" : null);
    if (!mode) return { attempted: false, reason: "NO_SCALE_IN_KEY" };
    const AR = typeof window !== "undefined" ? window.ActionRegistry : null;
    if (!AR || typeof AR.executeAction !== "function" || !AR.ACTIONS) return { attempted: false, mode, reason: "NO_ACTION_REGISTRY" };
    try {
        const r = await AR.executeAction(mode === "MINOR" ? AR.ACTIONS.KEY_SCALE_MINOR : AR.ACTIONS.KEY_SCALE_MAJOR, { reason: "key-scale" });
        if (r && r.reason === "NOT_CONFIGURED") return { attempted: false, mode, reason: "NOT_CONFIGURED" };
        return { attempted: true, mode, ok: !!(r && r.ok), status: (r && (r.status || r.reason)) || null };
    } catch (e) {
        return { attempted: true, mode, ok: false, status: "ERROR" };
    }
}

/**
 * Đổi key hiện tại trên Auto-Tune sang keyName (vd "C Major", "A# Minor").
 * Gửi Scale (CC riêng, nếu đã cấu hình) TRƯỚC, rồi gửi nốt gốc.
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
// KEY-ROOT-CC-01 — Key gốc gửi bằng 1 CC (Control Link/Macro trong Studio One nối vào ô Key của Auto-Tune, danh sách 12 nấc C…B).
// Giá trị CC = round(nấc × 127 / 11): C=0, C#=12, D=23, D#=35, E=46, F=58, F#=69, G=81, G#=92, A=104, A#=115, B=127 (mỗi giá trị làm tròn ngược đúng về nấc).
function keyRootToCc(noteIndex) { return Math.round((Math.max(0, Math.min(11, noteIndex))) * 127 / 11); }
async function sendKeyRootCcToAutotune(noteIndex) {
    if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex > 11) return { attempted: false, reason: "NO_NOTE_FOR_KEY" };
    const AR = typeof window !== "undefined" ? window.ActionRegistry : null;
    if (!AR || typeof AR.executeAction !== "function" || !AR.ACTIONS || !AR.ACTIONS.KEY_ROOT) return { attempted: false, reason: "NO_ACTION_REGISTRY" };
    const ccValue = keyRootToCc(noteIndex);
    try {
        const r = await AR.executeAction(AR.ACTIONS.KEY_ROOT, { reason: "key-root", value: ccValue });
        if (r && r.reason === "NOT_CONFIGURED") return { attempted: false, reason: "NOT_CONFIGURED" };
        return { attempted: true, ok: !!(r && r.ok), ccValue, status: (r && (r.status || r.reason)) || null };
    } catch (e) { return { attempted: true, ok: false, ccValue, status: "ERROR" }; }
}

async function sendKeyToAutotune(keyName) {
    const root = keyName.match(/^[A-G]#?/)?.[0];
    const note = NOTE_MAP[root];
    // KEY-SCALE-CC-01 — Scale trước, nốt gốc sau; chỉ nghỉ ngắn khi Scale đã gửi thật. Lỗi/chưa cấu hình Scale KHÔNG chặn việc gửi Key.
    let scale = { attempted: false, reason: "NOT_AVAILABLE" };
    if (typeof sendKeyScaleToAutotune === "function") {
        scale = await sendKeyScaleToAutotune(keyName);
        if (scale && scale.attempted && scale.ok && typeof delay === "function") await delay(40);
    }
    // TASK MIDI-01 — chỉ THÊM trường chẩn đoán vào kết quả (không đổi ok/driverUsed/status/detail): midi = {attempted, sent|reason}.
    let midi = { attempted: false, reason: getSetting("midiOutputPort") ? "NO_NOTE_FOR_KEY" : "MIDI_PORT_NOT_SELECTED" };

    // KEY-ROOT-CC-01 — nếu đã cấu hình CC KEY_ROOT (Setup > MIDI) thì Key gốc đi bằng CC; chưa cấu hình/lỗi thì dùng nốt như cũ.
    const keyCc = typeof sendKeyRootCcToAutotune === "function" ? await sendKeyRootCcToAutotune(note) : { attempted: false, reason: "NOT_AVAILABLE" };
    if (keyCc.attempted && keyCc.ok) {
        return { ok: true, driverUsed: "midi", midi: { attempted: true, sent: true, port: getSetting("midiOutputPort"), viaCc: true, ccValue: keyCc.ccValue }, scale, keyCc, confirmation: "MIDI_SENT_UNCONFIRMED" };
    }

    // --- 1) Ưu tiên MIDI ---
    const midiPort = getSetting("midiOutputPort");
    if (midiPort && note !== undefined) {
        const sent = await sendMidiNotePulse(note);
        midi = { attempted: true, sent: !!sent, port: midiPort, note };
        // sent=true chỉ nghĩa là API Web MIDI không ném lỗi (MIDI_SENT_UNCONFIRMED) — KHÔNG xác nhận phía đích đã nhận.
        if (sent) return { ok: true, driverUsed: "midi", midi, scale, confirmation: "MIDI_SENT_UNCONFIRMED" };
        // Nếu gửi lỗi (vd cổng MIDI đã bị rút/đổi tên) -> rơi xuống fallback bên dưới
    }

    // --- 2) Fallback: click tại toạ độ "autotunekey" đã capture ở Setup ---
    const point = parseCapturedPoint(getCoordinate("autotunekey"));
    if (point && window.electronAPI?.clickAtPoint) {
        if (!isMouseFallbackAllowed()) {
            return {
                ok: false,
                driverUsed: "mouse",
                status: "MOUSE_DISABLED",
                midi,
                detail: 'Mouse Control đang TẮT (Setup > Calibration) — không tự click chuột để đổi Key. Bật lại Mouse Control hoặc cấu hình MIDI (Setup > MIDI) để Key tiếp tục gửi tự động.',
            };
        }
        const result = await window.electronAPI.clickAtPoint(point);
        return { ok: result.ok, driverUsed: "mouse", midi, scale, detail: result.detail };
    }

    return {
        ok: false,
        midi,
        scale,
        detail: 'Chưa cấu hình cổng MIDI (Setup > MIDI) hoặc toạ độ "Key Auto-Tune" (Setup > Lấy tọa độ).',
    };
}

// ---------------------------------------------------------
// TASK AI-ALG-04 (D8/D9) — TRẠNG THÁI TONE NỘI BỘ + sendToneStep an toàn khi lỗi giữa chừng.
// QUY ƯỚC: sendToneStep(delta) là lệnh TƯƠNG ĐỐI (nhấn ▲/▼ `delta` lần). toneState.applied = ƯỚC LƯỢNG (nội bộ) tổng số bước
// đã GỬI tới Auto-Tune (+ = lên) — KHÔNG phải trạng thái phần cứng đã xác nhận (Menu không đọc lại được Auto-Tune).
// sendToneTarget(offset) nhận độ lệch TUYỆT ĐỐI so với Key gốc (cùng quy ước với data.semitone của ModEngine) và tự tính
// delta = offset - toneState.applied, nên modulation nối tiếp / quay về Key gốc / khởi động lại watcher không bị cộng dồn sai.
// ---------------------------------------------------------
const toneState = { applied: 0, uncertain: false, lastReason: null, chain: Promise.resolve() }; // chain: hàng đợi tuần tự hoá
function getToneState() { return { applied: toneState.applied, uncertain: toneState.uncertain, lastReason: toneState.lastReason }; }
function resetToneState(reason) { toneState.applied = 0; toneState.uncertain = false; toneState.lastReason = reason || "RESET"; }
// Tuần tự hoá: 2 lệnh dịch tone không bao giờ chạy chồng lên nhau
function _enqueueTone(fn) { const p = toneState.chain.then(fn, fn); toneState.chain = p.then(() => {}, () => {}); return p; }

/**
 * Dịch tone hiện tại đi `semitoneDelta` nấc (dương = tăng, âm = giảm) — TƯƠNG ĐỐI.
 * Kết quả luôn có stepsRequested/stepsSent/stepsRemaining (số bước ĐÃ GỬI, không phải đã xác nhận áp dụng) và uncertain.
 * Quy tắc D9: bước nào đã gửi thì KHÔNG bao giờ gửi lại; fallback chuột chỉ làm phần CÒN LẠI; nếu không biết chắc 1 bước
 * đã tới hay chưa (ngoại lệ) thì DỪNG, báo uncertain, không fallback.
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string, stepsRequested: number, stepsSent: number, stepsRemaining: number, uncertain: boolean}>}
 */
function sendToneStep(semitoneDelta) { return _enqueueTone(() => _sendToneStepNow(semitoneDelta)); }

async function _sendToneStepNow(semitoneDelta) {
    if (!semitoneDelta) return { ok: true, driverUsed: "none", stepsRequested: 0, stepsSent: 0, stepsRemaining: 0, uncertain: false };

    const steps = Math.abs(semitoneDelta);
    const goingUp = semitoneDelta > 0;
    const dir = goingUp ? 1 : -1;
    let sentMidi = 0, sentMouse = 0, uncertain = false;
    const finish = (res) => {
        const sent = sentMidi + sentMouse;
        toneState.applied += dir * sent; // chỉ cộng đúng số bước ĐÃ gửi (kể cả khi thất bại 1 phần)
        if (uncertain) { toneState.uncertain = true; toneState.lastReason = "TONE_STATE_UNCERTAIN"; }
        return { ...res, stepsRequested: steps, stepsSent: sent, stepsRemaining: steps - sent, uncertain };
    };

    // --- 1) Ưu tiên MIDI: gửi 1 nốt/CC đại diện cho hướng, lặp theo số bước ---
    const midiPort = getSetting("midiOutputPort");
    if (midiPort) {
        // CC 20 tăng / CC 21 giảm là VÍ DỤ — đổi theo đúng mapping MIDI Learn thật của plugin bạn.
        const ccNumber = goingUp ? 20 : 21;
        let failedDefinite = false;
        for (let i = 0; i < steps; i++) {
            let sent;
            try { sent = await sendMidiCC(ccNumber, 127); }
            catch (e) { uncertain = true; break; } // ngoại lệ: KHÔNG biết bước này đã tới hay chưa -> dừng, không fallback
            if (!sent) { failedDefinite = true; break; } // sendMidiCC trả false = chắc chắn KHÔNG gửi (cổng đóng / send ném lỗi)
            sentMidi++;
            try { await delay(CLICK_STEP_DELAY_MS); } catch (e) { /* bước đã tính là đã gửi */ }
        }
        if (sentMidi === steps) {
            // allSent=true chỉ nghĩa là API Web MIDI không ném lỗi: UNCONFIRMED (TASK AI-ALG-03 D6).
            return finish({ ok: true, driverUsed: "midi", confirmation: "MIDI_SENT_UNCONFIRMED" });
        }
        if (uncertain) {
            return finish({ ok: false, driverUsed: "midi", status: "TONE_STATE_UNCERTAIN", detail: `MIDI lỗi ở bước ${sentMidi + 1}/${steps} (không rõ đã gửi hay chưa) — KHÔNG fallback để tránh dịch dư; trạng thái tone không chắc chắn.` });
        }
        // failedDefinite: tiếp tục xuống fallback CHỈ cho phần còn lại (steps - sentMidi)
    }

    // --- 2) Fallback: click nút ▲/▼ đã capture ở "chromatic", CHỈ cho số bước còn lại ---
    const remaining = steps - sentMidi;
    const points = parseCapturedPoint(getCoordinate("chromatic"));
    const point = Array.isArray(points) ? points[goingUp ? CHROMATIC_UP_INDEX : CHROMATIC_DOWN_INDEX] : null;
    const partialMidi = sentMidi > 0;

    if (point && window.electronAPI?.clickAtPoint) {
        if (!isMouseFallbackAllowed()) {
            return finish({
                ok: false,
                driverUsed: partialMidi ? "midi" : "mouse",
                status: partialMidi ? "PARTIAL_MIDI_MOUSE_DISABLED" : "MOUSE_DISABLED",
                detail: 'Mouse Control đang TẮT (Setup > Calibration) — không tự click chuột để dịch tone. Bật lại Mouse Control hoặc cấu hình MIDI (Setup > MIDI) để MOD tiếp tục gửi tự động.'
                    + (partialMidi ? ` MIDI đã gửi ${sentMidi}/${steps} bước, còn ${remaining} bước CHƯA gửi.` : ""),
            });
        }
        for (let i = 0; i < remaining; i++) {
            let result;
            try { result = await window.electronAPI.clickAtPoint(point); }
            catch (e) { uncertain = true; return finish({ ok: false, driverUsed: "mouse", status: "TONE_STATE_UNCERTAIN", detail: "Click chuột ném lỗi (không rõ đã click hay chưa) — dừng, trạng thái tone không chắc chắn." }); }
            if (!result || !result.ok) return finish({ ok: false, driverUsed: partialMidi ? "midi+mouse" : "mouse", status: "PARTIAL_SENT", detail: result && result.detail });
            sentMouse++;
            await delay(CLICK_STEP_DELAY_MS);
        }
        return finish({ ok: true, driverUsed: partialMidi ? "midi+mouse" : "mouse", confirmation: partialMidi ? "MIXED_SENT_UNCONFIRMED" : "CLICK_SENT_UNCONFIRMED" });
    }

    return finish({
        ok: false,
        driverUsed: partialMidi ? "midi" : undefined,
        status: partialMidi ? "PARTIAL_MIDI_NO_FALLBACK" : undefined,
        detail: 'Chưa cấu hình cổng MIDI hoặc toạ độ "Chromatic" (Setup > Lấy tọa độ).'
            + (partialMidi ? ` MIDI đã gửi ${sentMidi}/${steps} bước, còn ${remaining} bước CHƯA gửi.` : ""),
    });
}

/**
 * Đưa tone về độ lệch TUYỆT ĐỐI `targetOffset` so với Key gốc (0 = Key gốc). delta = target - toneState.applied.
 * Gọi lại với cùng target khi đã đạt => không gửi gì (idempotent). Tính delta TRONG hàng đợi nên không đua với lệnh khác.
 */
function sendToneTarget(targetOffset) {
    return _enqueueTone(async () => {
        const appliedBefore = toneState.applied;
        const delta = targetOffset - appliedBefore;
        const res = await _sendToneStepNow(delta);
        return { ...res, targetOffset, appliedBefore, delta, appliedAfter: toneState.applied, toneStateUncertain: toneState.uncertain };
    });
}
