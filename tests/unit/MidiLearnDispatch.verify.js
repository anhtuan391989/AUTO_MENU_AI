/**
 * ==========================================================
 * Auto Menu AI — MIDI Learn Capture -> Save -> Load -> Resolve -> Dispatch (Task B20)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/MidiLearnDispatch.verify.js
 *
 * Bao phủ đủ 10 mục PHẦN 4 của đề bài B20:
 *   1. Capture MIDI            -> SECTION 1 (trích xuất + chạy THẬT midiBytesToText()
 *                                  từ ui/js/setupMidiInput.js, đúng kỹ thuật ModDualTarget.verify.js)
 *   2. Save mapping             -> SECTION 2 (đối chiếu field-name THẬT giữa object mà
 *                                  saveLearnedMapping() ghi ra và object mà buildMappingIndex() đọc)
 *   3. Load mapping              -> SECTION 3a/3b (buildMappingIndex() thật, module thật)
 *   4. Trigger MIDI event        -> SECTION 4 (normalizeMidiMessage() thật, byte MIDI thật)
 *   5. Mapping được resolve      -> SECTION 3a + SECTION 8
 *   6. Action được dispatch      -> SECTION 5 (CommandEngine thật + capabilityRegistry thật)
 *   7. Backend handler gọi đúng  -> SECTION 5 (assert đúng params 0x5e/0x5d/0x5f + fallback priority)
 *   8. Unsupported KHÔNG dispatch giả -> SECTION 3c + SECTION 6b + SECTION 8
 *   9. Mapping sai không crash   -> SECTION 6
 *   10. daw:play/stop/record không regression -> SECTION 7
 *
 * MÔI TRƯỜNG: package `easymidi` đã được cài (npm install easymidi --no-save) để runtime.js
 * require() được (top-level require, không lazy) — nhưng container audit KHÔNG có thiết bị
 * MIDI/ALSA sequencer thật (`/dev/snd/seq` không tồn tại — đã xác nhận bằng thực thi thật,
 * xem TASK_B20_RESULT.md mục Root Cause/Hardware). Vì vậy bộ test này KHÔNG gọi
 * runtime.js:start()/dispatch() qua đường easymidi thật (sẽ luôn thất bại ở tầng phần cứng,
 * đúng phân loại HARDWARE GAP, KHÔNG PHẢI lỗi logic) — thay vào đó test TRỰC TIẾP đúng các lớp
 * logic thật (buildMappingIndex/normalizeMidiMessage/ACTION_TO_CAPABILITY — export thật từ
 * runtime.js, KHÔNG viết lại) + CommandEngine/capabilityRegistry thật (không có easymidi bên
 * trong 2 module này), chỉ thay driver 'mcu'/'hotkey' bằng 1 driver TEST DOUBLE tối giản đúng
 * đúng interface {name, isReady(), execute()} mà BaseDriver/CommandEngine đã định nghĩa sẵn —
 * đây là ranh giới test chuẩn (stub đúng lớp I/O phần cứng), KHÔNG PHẢI giả lập backend cho 1
 * action chưa có capability thật.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}

const repoRoot = path.join(__dirname, '..', '..');
const runtime = require(path.join(repoRoot, 'core', 'command-engine-js', 'runtime.js'));
const CommandEngine = require(path.join(repoRoot, 'core', 'command-engine-js', 'commandEngine.js'));
const { getCapability, registry } = require(path.join(repoRoot, 'core', 'command-engine-js', 'capabilityRegistry.js'));

// ---------------------------------------------------------------------------
// SECTION 1 — Capture MIDI: chạy THẬT midiBytesToText() trích xuất nguyên văn từ
// ui/js/setupMidiInput.js (file renderer, không require() thẳng được vì có top-level DOM
// access — dùng đúng kỹ thuật string-extract + vm sandbox mà ModDualTarget.verify.js đã dùng,
// không phải viết lại logic bằng tay).
// ---------------------------------------------------------------------------
console.log('\n== SECTION 1: Capture MIDI — midiBytesToText() thật (ui/js/setupMidiInput.js) ==');
{
    const src = fs.readFileSync(path.join(repoRoot, 'ui', 'js', 'setupMidiInput.js'), 'utf8');
    const fnMatch = src.match(/function midiBytesToText\(data\) \{[\s\S]*?\n    \}/);
    check('Trích xuất được nguyên văn function midiBytesToText() từ source thật', !!fnMatch);

    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${fnMatch[0]}\nthis.midiBytesToText = midiBytesToText;`, sandbox);

    const noteOn = sandbox.midiBytesToText([0x90, 60, 100]); // Note On, ch1, note 60, vel 100
    check('Note On -> kind=note, number=60, value=100, channel=1', noteOn.kind === 'note' && noteOn.number === 60 && noteOn.value === 100 && noteOn.channel === 1, noteOn);

    const noteOff = sandbox.midiBytesToText([0x80, 60, 0]);
    check('Note Off (0x80) -> kind=noteoff', noteOff.kind === 'noteoff', noteOff);

    const noteOnVel0 = sandbox.midiBytesToText([0x90, 60, 0]);
    check('Note On velocity=0 -> coi là noteoff (đúng chuẩn MIDI)', noteOnVel0.kind === 'noteoff', noteOnVel0);

    const cc = sandbox.midiBytesToText([0xb1, 20, 127]); // CC, ch2, controller 20, value 127
    check('CC -> kind=cc, number=20, value=127, channel=2', cc.kind === 'cc' && cc.number === 20 && cc.value === 127 && cc.channel === 2, cc);
}

// ---------------------------------------------------------------------------
// SECTION 2 — Save mapping: đối chiếu field-name THẬT giữa nơi GHI (setupMidiInput.js:
// saveLearnedMapping()) và nơi ĐỌC (runtime.js: buildMappingIndex()) — không đoán tên field,
// trích xuất cả 2 phía từ source thật.
// ---------------------------------------------------------------------------
console.log('\n== SECTION 2: Save mapping — field-name khớp thật giữa ghi (Setup) và đọc (runtime.js) ==');
{
    const setupSrc = fs.readFileSync(path.join(repoRoot, 'ui', 'js', 'setupMidiInput.js'), 'utf8');
    const pushMatch = setupSrc.match(/list\.push\(\{([\s\S]*?)\}\);/);
    check('Trích xuất được object literal thật trong saveLearnedMapping() -> list.push({...})', !!pushMatch);
    const savedFields = pushMatch ? [...pushMatch[1].matchAll(/^\s*(\w+),?\s*$/gm)].map((m) => m[1]) : [];
    check('Object đã lưu có đủ field type/channel/number/action (đúng field buildMappingIndex() cần)',
        ['type', 'channel', 'number', 'action'].every((f) => savedFields.includes(f)), savedFields);

    const runtimeSrc = fs.readFileSync(path.join(repoRoot, 'core', 'command-engine-js', 'runtime.js'), 'utf8');
    const readMatch = runtimeSrc.match(/if \(m && (m\.type[\s\S]*?)\)\s*\{/);
    check('Trích xuất được đúng điều kiện đọc field trong buildMappingIndex() từ source thật', !!readMatch);
    const readsFields = ['type', 'channel', 'number', 'action'].every((f) => readMatch && readMatch[1].includes(`m.${f}`));
    check('buildMappingIndex() đọc đúng các field mà Setup đã ghi (m.type/m.channel/m.number/m.action)', readsFields, readMatch && readMatch[1]);
}

// ---------------------------------------------------------------------------
// SECTION 3 — Load + resolve mapping: buildMappingIndex() THẬT (export từ runtime.js).
// ---------------------------------------------------------------------------
console.log('\n== SECTION 3: Load mapping -> buildMappingIndex() thật ==');
{
    // 3a — mapping hợp lệ cho daw:play PHẢI được resolve vào index.
    const settingsA = { midiMappingsV1: [{ trigger: 'NOTE ON 60', kind: 'note', type: 'note', channel: 1, number: 60, action: 'daw:play', savedAt: '2026-01-01' }] };
    const indexA = runtime.buildMappingIndex(settingsA);
    check('3a. Mapping daw:play hợp lệ -> có trong index đúng key "note:1:60"', indexA.get('note:1:60')?.action === 'daw:play', [...indexA.entries()]);

    // 3b — mapping kiểu CŨ (chỉ có "trigger" chuỗi hiển thị, KHÔNG có type/channel/number — dữ
    // liệu từ trước khi có runtime này) PHẢI bị bỏ qua an toàn, không crash.
    const settingsB = { midiMappingsV1: [{ trigger: 'CC20 = 127 ch1', action: 'daw:stop' }] };
    let indexB, threwB = false;
    try { indexB = runtime.buildMappingIndex(settingsB); } catch { threwB = true; }
    check('3b. Mapping kiểu cũ (thiếu type/channel/number) -> KHÔNG throw', !threwB);
    check('3b. Mapping kiểu cũ -> KHÔNG vào index (an toàn, không đoán)', indexB && indexB.size === 0, indexB && [...indexB.entries()]);

    // 3c (= item 8) — mapping ĐỦ field cấu trúc nhưng action KHÔNG có trong ACTION_TO_CAPABILITY
    // (vd "menu:buttonA", Setup cho Learn/Save tự do) -> PHẢI bị loại, KHÔNG lọt vào index.
    const settingsC = { midiMappingsV1: [{ trigger: 'NOTE ON 40', kind: 'note', type: 'note', channel: 1, number: 40, action: 'menu:buttonA', savedAt: '2026-01-01' }] };
    const indexC = runtime.buildMappingIndex(settingsC);
    check('3c. Action "menu:buttonA" (chưa có capability) -> KHÔNG vào index dù đủ field cấu trúc', indexC.size === 0, [...indexC.entries()]);

    // Mapping rỗng/undefined/null trong mảng -> không crash (thêm rào chắn item 9).
    const settingsD = { midiMappingsV1: [null, undefined, {}, { type: 'cc' /* thiếu channel/number/action */ }] };
    let threwD = false;
    try { runtime.buildMappingIndex(settingsD); } catch { threwD = true; }
    check('3d. Mảng mapping chứa null/undefined/object rỗng -> KHÔNG throw', !threwD);

    // settings.midiMappingsV1 không phải mảng (settings hỏng/rỗng) -> không crash.
    let threwE = false;
    try { runtime.buildMappingIndex({}); runtime.buildMappingIndex({ midiMappingsV1: 'not-an-array' }); runtime.buildMappingIndex(null); } catch { threwE = true; }
    check('3e. settings.midiMappingsV1 không phải mảng / settings=null -> KHÔNG throw', !threwE);
}

// ---------------------------------------------------------------------------
// SECTION 4 — Trigger MIDI event: normalizeMidiMessage() THẬT (export từ runtime.js).
// ---------------------------------------------------------------------------
console.log('\n== SECTION 4: Trigger MIDI event -> normalizeMidiMessage() thật ==');
{
    const noteOn = runtime.normalizeMidiMessage([0x91, 60, 100]); // ch2
    check('Note On -> {type:"note", channel:2, number:60, value:100}', noteOn && noteOn.type === 'note' && noteOn.channel === 2 && noteOn.number === 60 && noteOn.value === 100, noteOn);

    const noteOff = runtime.normalizeMidiMessage([0x81, 60, 0]);
    check('Note Off -> null (KHÔNG dispatch, đúng comment "bỏ note-off")', noteOff === null, noteOff);

    const noteOnVel0 = runtime.normalizeMidiMessage([0x91, 60, 0]);
    check('Note On velocity=0 -> null (tương đương Note Off)', noteOnVel0 === null, noteOnVel0);

    const cc = runtime.normalizeMidiMessage([0xb0, 20, 127]); // ch1
    check('CC -> {type:"cc", channel:1, number:20, value:127}', cc && cc.type === 'cc' && cc.channel === 1 && cc.number === 20 && cc.value === 127, cc);

    const pitchBend = runtime.normalizeMidiMessage([0xe0, 0, 64]);
    check('Pitch Bend -> null (chưa wire, đúng comment "Mục 4")', pitchBend === null, pitchBend);

    const programChange = runtime.normalizeMidiMessage([0xc0, 5]);
    check('Program Change -> null (chưa wire)', programChange === null, programChange);
}

// ---------------------------------------------------------------------------
// SECTION 5 — Action dispatch + backend handler: CommandEngine THẬT + capabilityRegistry THẬT,
// chỉ thay driver 'mcu'/'hotkey' bằng test double tối giản (đúng interface BaseDriver).
// (bọc trong async IIFE vì dùng await — tránh lẫn top-level await với require() trong 1 file)
// ---------------------------------------------------------------------------
async function runSection5() {
console.log('\n== SECTION 5: Action dispatch -> CommandEngine + capabilityRegistry thật ==');
{
    function makeFakeDriver(name, ready) {
        const calls = [];
        return {
            name,
            calls,
            async isReady() { return ready; },
            async execute(params) { calls.push(params); return { ok: true }; },
        };
    }

    // 5a — daw:play dispatch đúng qua 'mcu', đúng params 0x5e (Mackie Control Play), không qua hotkey.
    {
        const engine = new CommandEngine();
        const mcu = makeFakeDriver('mcu', true);
        const hotkey = makeFakeDriver('hotkey', true);
        engine.registerDriver(mcu);
        engine.registerDriver(hotkey);
        const cap = runtime.ACTION_TO_CAPABILITY['daw:play'];
        const result = await engine.dispatch(cap);
        check('5a. daw:play dispatch ok=true, driverUsed=mcu', result.ok === true && result.driverUsed === 'mcu', result);
        check('5a. mcu driver nhận đúng params { note: 0x5e } (94, Mackie Control Play, KHÔNG bịa số)', mcu.calls.length === 1 && mcu.calls[0].note === 0x5e, mcu.calls);
        check('5a. hotkey KHÔNG được gọi (vì mcu đã ready+ok)', hotkey.calls.length === 0, hotkey.calls);
    }

    // 5b — daw:stop / daw:record đúng note tương ứng.
    {
        const engine = new CommandEngine();
        const mcu = makeFakeDriver('mcu', true);
        engine.registerDriver(mcu);
        await engine.dispatch(runtime.ACTION_TO_CAPABILITY['daw:stop']);
        await engine.dispatch(runtime.ACTION_TO_CAPABILITY['daw:record']);
        check('5b. daw:stop -> note 0x5d, daw:record -> note 0x5f (đúng capabilityRegistry.js, không bịa)',
            mcu.calls[0].note === 0x5d && mcu.calls[1].note === 0x5f, mcu.calls);
    }

    // 5c — Fallback: mcu KHÔNG ready -> phải rơi xuống hotkey (đúng priority ['mcu','hotkey'] trong capabilityRegistry.js).
    {
        const engine = new CommandEngine();
        const mcu = makeFakeDriver('mcu', false); // không ready
        const hotkey = makeFakeDriver('hotkey', true);
        engine.registerDriver(mcu);
        engine.registerDriver(hotkey);
        const result = await engine.dispatch(runtime.ACTION_TO_CAPABILITY['daw:play']);
        check('5c. mcu không ready -> fallback đúng sang hotkey', result.driverUsed === 'hotkey', result);
        check('5c. hotkey nhận đúng params { keys: "Space" } (đúng capabilityRegistry.js cho transportPlay)', hotkey.calls[0]?.keys === 'Space', hotkey.calls);
    }

    // 5d — Cả 2 driver đều không ready -> {ok:false}, KHÔNG bịa kết quả thành công.
    {
        const engine = new CommandEngine();
        engine.registerDriver(makeFakeDriver('mcu', false));
        engine.registerDriver(makeFakeDriver('hotkey', false));
        const result = await engine.dispatch(runtime.ACTION_TO_CAPABILITY['daw:play']);
        check('5d. Không driver nào ready -> ok=false (không bịa thành công)', result.ok === false, result);
    }

    // 5e (= item 8, ở tầng dispatch) — targetId/action KHÔNG có trong capabilityRegistry
    // (vd action Setup cho Learn nhưng chưa có capability) -> {ok:false}, KHÔNG driver nào được gọi.
    {
        const engine = new CommandEngine();
        const mcu = makeFakeDriver('mcu', true);
        engine.registerDriver(mcu);
        const result = await engine.dispatch({ targetId: 'studio_one', action: 'menuButtonA_KHONG_TON_TAI' });
        check('5e. Action không có capability -> ok=false', result.ok === false, result);
        check('5e. Action không có capability -> KHÔNG driver nào bị gọi (không dispatch giả)', mcu.calls.length === 0, mcu.calls);
    }
}
} // end runSection5()

async function main() {
    await runSection5();

    // ---------------------------------------------------------------------------
    // SECTION 6 — Crash safety tổng hợp (item 9): dữ liệu mapping/settings hỏng theo nhiều kiểu.
    // ---------------------------------------------------------------------------
    console.log('\n== SECTION 6: Mapping/settings hỏng -> không crash ==');
    {
        let threw = false;
        try {
            runtime.buildMappingIndex({ midiMappingsV1: [
                { type: 'note', channel: 'không-phải-số', number: 60, action: 'daw:play' }, // channel sai kiểu
                { type: 'note', channel: 1, number: 60, action: 123 },                      // action sai kiểu
                { type: 'note', channel: 1, number: 60, action: 'daw:play;DROP TABLE' },    // action lạ/injection-style string
                { type: null, channel: null, number: null, action: 'daw:play' },
            ] });
        } catch { threw = true; }
        check('6. Mapping với field sai kiểu/giá trị bất thường -> KHÔNG throw', !threw);
    }

    // ---------------------------------------------------------------------------
    // SECTION 7 — Regression: daw:play/stop/record KHÔNG bị đổi (item 10) — khoá cứng đúng 3
    // action, đúng targetId/action, KHÔNG mở rộng thêm (đúng yêu cầu "Không mở rộng
    // ACTION_TO_CAPABILITY").
    // ---------------------------------------------------------------------------
    console.log('\n== SECTION 7: Regression — ACTION_TO_CAPABILITY đúng NGUYÊN 3 action cũ, không mở rộng ==');
    {
        const keys = Object.keys(runtime.ACTION_TO_CAPABILITY).sort();
        check('7. ACTION_TO_CAPABILITY đúng CHÍNH XÁC 3 key: daw:play, daw:record, daw:stop (không thêm/bớt)',
            JSON.stringify(keys) === JSON.stringify(['daw:play', 'daw:record', 'daw:stop']), keys);
        check('7. daw:play -> {studio_one, transportPlay}', JSON.stringify(runtime.ACTION_TO_CAPABILITY['daw:play']) === JSON.stringify({ targetId: 'studio_one', action: 'transportPlay' }));
        check('7. daw:stop -> {studio_one, transportStop}', JSON.stringify(runtime.ACTION_TO_CAPABILITY['daw:stop']) === JSON.stringify({ targetId: 'studio_one', action: 'transportStop' }));
        check('7. daw:record -> {studio_one, transportRecord}', JSON.stringify(runtime.ACTION_TO_CAPABILITY['daw:record']) === JSON.stringify({ targetId: 'studio_one', action: 'transportRecord' }));
        check('7. capabilityRegistry.registry.studio_one.actions còn nguyên transportPlay/Stop/Record với đúng note cũ (0x5e/0x5d/0x5f), không đổi',
            registry.studio_one.actions.transportPlay.mcu.note === 0x5e &&
            registry.studio_one.actions.transportStop.mcu.note === 0x5d &&
            registry.studio_one.actions.transportRecord.mcu.note === 0x5f);
    }

    // ---------------------------------------------------------------------------
    // SECTION 8 — Xác nhận bằng thực thi: MỌI action khác trong dropdown MIDI Learn thật
    // (ui/setup.html) đều KHÔNG có capability -> đúng phân loại "UNSUPPORTED BY DESIGN", không
    // phải bỏ sót ngẫu nhiên. Trích xuất option value THẬT từ setup.html, không gõ tay danh sách.
    // ---------------------------------------------------------------------------
    console.log('\n== SECTION 8: Toàn bộ action khác trong dropdown Setup thật -> xác nhận UNSUPPORTED BY DESIGN ==');
    {
        const setupHtml = fs.readFileSync(path.join(repoRoot, 'ui', 'setup.html'), 'utf8');
        const selectMatch = setupHtml.match(/<select id="midiLearnAction"[\s\S]*?<\/select>/);
        check('Trích xuất được đúng <select id="midiLearnAction"> thật từ setup.html', !!selectMatch);
        const optionValues = selectMatch ? [...selectMatch[0].matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).filter(Boolean) : [];
        check('Tìm được ít nhất 1 action ngoài daw:* trong dropdown thật (để test có ý nghĩa)', optionValues.some((a) => !a.startsWith('daw:')), optionValues);

        const nonDawActions = optionValues.filter((a) => !a.startsWith('daw:'));
        for (const action of nonDawActions) {
            check(`8. "${action}" (dropdown Setup thật) -> KHÔNG có trong ACTION_TO_CAPABILITY (UNSUPPORTED BY DESIGN, đúng B18/B20 audit)`,
                runtime.ACTION_TO_CAPABILITY[action] === undefined);
        }
        const dawActions = optionValues.filter((a) => a.startsWith('daw:'));
        check('8. Toàn bộ daw:* trong dropdown thật đều CÓ trong ACTION_TO_CAPABILITY (DISPATCHED)',
            dawActions.length > 0 && dawActions.every((a) => runtime.ACTION_TO_CAPABILITY[a] !== undefined), dawActions);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
}

main();
