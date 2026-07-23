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

/**
 * Bật/tắt plugin SoundShifter (bypass on/off) qua MIDI CC.
 * Quy ước: value 127 = bật (nhận tín hiệu), value 0 = tắt (bypass).
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
async function setSoundShifterPower(isOn) {
    const midiPort = getSetting("midiOutputPort");
    if (!midiPort) {
        return { ok: false, detail: 'Chưa cấu hình cổng MIDI (Setup > MIDI) — SoundShifter chỉ điều khiển được qua MIDI.' };
    }

    const sent = await sendMidiCC(SOUNDSHIFTER_TOGGLE_CC, isOn ? 127 : 0);
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

/**
 * Đổi key hiện tại trên Auto-Tune sang keyName (vd "C Major", "A# Minor").
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
async function sendKeyToAutotune(keyName) {
    const root = keyName.match(/^[A-G]#?/)?.[0];
    const note = NOTE_MAP[root];

    // --- 1) Ưu tiên MIDI ---
    const midiPort = getSetting("midiOutputPort");
    if (midiPort && note !== undefined) {
        const sent = await sendMidiNotePulse(note);
        if (sent) return { ok: true, driverUsed: "midi" };
        // Nếu gửi lỗi (vd cổng MIDI đã bị rút/đổi tên) -> rơi xuống fallback bên dưới
    }

    // --- 2) Fallback: click tại toạ độ "autotunekey" đã capture ở Setup ---
    const point = parseCapturedPoint(getCoordinate("autotunekey"));
    if (point && window.electronAPI?.clickAtPoint) {
        const result = await window.electronAPI.clickAtPoint(point);
        return { ok: result.ok, driverUsed: "mouse", detail: result.detail };
    }

    return {
        ok: false,
        detail: 'Chưa cấu hình cổng MIDI (Setup > MIDI) hoặc toạ độ "Key Auto-Tune" (Setup > Lấy tọa độ).',
    };
}

/**
 * Dịch tone hiện tại đi `semitoneDelta` nấc (dương = tăng, âm = giảm).
 * @returns {Promise<{ok: boolean, driverUsed?: string, detail?: string}>}
 */
async function sendToneStep(semitoneDelta) {
    if (!semitoneDelta) return { ok: true, driverUsed: "none" };

    const steps = Math.abs(semitoneDelta);
    const goingUp = semitoneDelta > 0;

    // --- 1) Ưu tiên MIDI: gửi 1 nốt/CC đại diện cho hướng, lặp theo số bước ---
    const midiPort = getSetting("midiOutputPort");
    if (midiPort) {
        // CC 20 tăng / CC 21 giảm là VÍ DỤ — đổi theo đúng mapping MIDI Learn thật của plugin bạn.
        const ccNumber = goingUp ? 20 : 21;
        let allSent = true;
        for (let i = 0; i < steps; i++) {
            const sent = await sendMidiCC(ccNumber, 127);
            if (!sent) { allSent = false; break; }
            await delay(CLICK_STEP_DELAY_MS);
        }
        if (allSent) return { ok: true, driverUsed: "midi" };
    }

    // --- 2) Fallback: click nút ▲/▼ đã capture ở "chromatic", lặp theo số bước ---
    const points = parseCapturedPoint(getCoordinate("chromatic"));
    const point = Array.isArray(points) ? points[goingUp ? CHROMATIC_UP_INDEX : CHROMATIC_DOWN_INDEX] : null;

    if (point && window.electronAPI?.clickAtPoint) {
        for (let i = 0; i < steps; i++) {
            const result = await window.electronAPI.clickAtPoint(point);
            if (!result.ok) return { ok: false, driverUsed: "mouse", detail: result.detail };
            await delay(CLICK_STEP_DELAY_MS);
        }
        return { ok: true, driverUsed: "mouse" };
    }

    return {
        ok: false,
        detail: 'Chưa cấu hình cổng MIDI hoặc toạ độ "Chromatic" (Setup > Lấy tọa độ).',
    };
}
