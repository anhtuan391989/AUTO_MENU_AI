/**
 * ==========================================================
 * Auto Menu AI — MIDI Learn Capture -> Save -> Load -> Resolve -> Dispatch
 * (Task B20, viết lại TASK B38-FIX — chuyển từ ACTION_TO_CAPABILITY hard-code
 * sang D1 XML là source-of-truth duy nhất)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/MidiLearnDispatch.verify.js
 *
 * LÝ DO VIẾT LẠI (B38-FIX BLOCKER #1): core/command-engine-js/runtime.js đã XOÁ hoàn toàn
 * ACTION_TO_CAPABILITY/buildMappingIndex()/mappingIndex (bảng hard-code cũ) — không còn tồn tại
 * để require() nữa. File test này trước đây (B20) đọc trực tiếp 3 thứ đó; B38-FIX cho phép sửa
 * test để bám theo kiến trúc mới, với điều kiện KHÔNG giảm coverage. Bản này giữ đúng cấu trúc
 * 10 mục PHẦN 4 gốc của B20, chỉ đổi "đọc mapping ở đâu":
 *
 *   1. Capture MIDI            -> SECTION 1 (không đổi — midiBytesToText() thật)
 *   2. Save mapping             -> SECTION 2 (đối chiếu field-name GHI ở setupMidiInput.js với
 *                                  field-name ĐỌC ở d1Loader.js:buildD1GatedMapping(), thay vì
 *                                  runtime.js:buildMappingIndex() đã bị xoá)
 *   3. Load mapping              -> SECTION 3 (d1Loader.buildD1GatedMapping() thật, dùng
 *                                  capabilities THẬT lấy từ d1Loader.loadAndValidateD1() chạy
 *                                  trên production docs/d1/midi-mapping.xml — không mock D1)
 *   4. Trigger MIDI event        -> SECTION 4 (không đổi — normalizeMidiMessage() thật)
 *   5. Mapping được resolve      -> SECTION 3 + SECTION 8
 *   6. Action được dispatch      -> SECTION 5 (CommandEngine thật + capabilityRegistry thật,
 *                                  input lấy từ d1Loader.CAPABILITY_BACKEND_TARGET — backend
 *                                  metadata THUẦN, không phải mapping MIDI thứ hai, xem SECTION 9
 *                                  mới bên dưới chứng minh rạch ròi ranh giới này)
 *   7. Backend handler gọi đúng  -> SECTION 5 (không đổi logic assert)
 *   8. Unsupported KHÔNG dispatch giả -> SECTION 3 + SECTION 6b + SECTION 8
 *   9. Mapping sai không crash   -> SECTION 6
 *   10. daw:play/stop/record không regression -> SECTION 7 (nay đối chiếu D1 THẬT, không phải
 *                                  hard-code — chứng minh D1 là nguồn quyết định thật, đúng yêu
 *                                  cầu B38-FIX mục 7 "D1 XML source-of-truth proof")
 *
 * MÔI TRƯỜNG: package `easymidi` đã được cài để runtime.js require() được (top-level require),
 * nhưng container audit KHÔNG có thiết bị MIDI/ALSA thật — vẫn KHÔNG gọi runtime.js:start() qua
 * đường easymidi thật, chỉ test trực tiếp các lớp logic thuần (như B20 đã làm), cộng thêm
 * d1Loader.js (I/O đọc file .xml/.xsd thật + xmllint-wasm thật — không phải hardware, không cần
 * device MIDI nào).
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
const d1Loader = require(path.join(repoRoot, 'core', 'command-engine-js', 'd1Loader.js'));
const CommandEngine = require(path.join(repoRoot, 'core', 'command-engine-js', 'commandEngine.js'));
const { registry } = require(path.join(repoRoot, 'core', 'command-engine-js', 'capabilityRegistry.js'));

// ---------------------------------------------------------------------------
// SECTION 1 — Capture MIDI: KHÔNG ĐỔI so với B20 (midiBytesToText() không liên quan D1/mapping).
// ---------------------------------------------------------------------------
console.log('\n== SECTION 1: Capture MIDI — midiBytesToText() thật (ui/js/setupMidiInput.js) ==');
{
    const src = fs.readFileSync(path.join(repoRoot, 'ui', 'js', 'setupMidiInput.js'), 'utf8');
    const fnMatch = src.match(/function midiBytesToText\(data\) \{[\s\S]*?\n    \}/);
    check('Trích xuất được nguyên văn function midiBytesToText() từ source thật', !!fnMatch);

    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${fnMatch[0]}\nthis.midiBytesToText = midiBytesToText;`, sandbox);

    const noteOn = sandbox.midiBytesToText([0x90, 60, 100]);
    check('Note On -> kind=note, number=60, value=100, channel=1', noteOn.kind === 'note' && noteOn.number === 60 && noteOn.value === 100 && noteOn.channel === 1, noteOn);

    const noteOff = sandbox.midiBytesToText([0x80, 60, 0]);
    check('Note Off (0x80) -> kind=noteoff', noteOff.kind === 'noteoff', noteOff);

    const noteOnVel0 = sandbox.midiBytesToText([0x90, 60, 0]);
    check('Note On velocity=0 -> coi là noteoff (đúng chuẩn MIDI)', noteOnVel0.kind === 'noteoff', noteOnVel0);

    const cc = sandbox.midiBytesToText([0xb1, 20, 127]);
    check('CC -> kind=cc, number=20, value=127, channel=2', cc.kind === 'cc' && cc.number === 20 && cc.value === 127 && cc.channel === 2, cc);
}

// ---------------------------------------------------------------------------
// SECTION 2 — Save mapping: đối chiếu field-name THẬT giữa nơi GHI (setupMidiInput.js) và nơi
// ĐỌC (B38-FIX: d1Loader.js:buildD1GatedMapping(), THAY CHO runtime.js:buildMappingIndex() đã xoá).
// ---------------------------------------------------------------------------
console.log('\n== SECTION 2: Save mapping — field-name khớp thật giữa ghi (Setup) và đọc (d1Loader.js) ==');
{
    const setupSrc = fs.readFileSync(path.join(repoRoot, 'ui', 'js', 'setupMidiInput.js'), 'utf8');
    const pushMatch = setupSrc.match(/list\.push\(\{([\s\S]*?)\}\);/);
    check('Trích xuất được object literal thật trong saveLearnedMapping() -> list.push({...})', !!pushMatch);
    const savedFields = pushMatch ? [...pushMatch[1].matchAll(/^\s*(\w+),?\s*$/gm)].map((m) => m[1]) : [];
    check('Object đã lưu có đủ field type/channel/number/action (đúng field d1Loader.js cần)',
        ['type', 'channel', 'number', 'action'].every((f) => savedFields.includes(f)), savedFields);

    const d1LoaderSrc = fs.readFileSync(path.join(repoRoot, 'core', 'command-engine-js', 'd1Loader.js'), 'utf8');
    const readMatch = d1LoaderSrc.match(/if \(!m \|\| (!m\.type[\s\S]*?)\) continue;/);
    check('Trích xuất được đúng điều kiện đọc field trong buildD1GatedMapping() từ source thật', !!readMatch);
    const readsFields = ['type', 'channel', 'number', 'action'].every((f) => readMatch && readMatch[1].includes(`m.${f}`));
    check('buildD1GatedMapping() đọc đúng các field mà Setup đã ghi (m.type/m.channel/m.number/m.action)', readsFields, readMatch && readMatch[1]);
}

async function main() {
    const xsd = fs.readFileSync(d1Loader.D1_XSD_PATH, 'utf8');
    const prodXml = fs.readFileSync(d1Loader.D1_XML_PATH, 'utf8');
    const d1Result = await d1Loader.loadAndValidateD1(prodXml, xsd); // dùng CHUNG 1 lần load cho toàn bộ section dưới — production D1 thật, không mock

    // ---------------------------------------------------------------------------
    // SECTION 3 — Load + resolve mapping: buildD1GatedMapping() THẬT, dùng capabilities THẬT từ
    // production D1 XML (không mock danh sách capability).
    // ---------------------------------------------------------------------------
    console.log('\n== SECTION 3: Load mapping -> d1Loader.buildD1GatedMapping() thật (dùng D1 production thật) ==');
    {
        check('Production D1 load OK trước khi test (tiền đề bắt buộc cho cả SECTION 3)', d1Result.ok === true, d1Result);

        const { mapping: mapA } = d1Loader.buildD1GatedMapping(
            [{ trigger: 'NOTE ON 60', kind: 'note', type: 'note', channel: 1, number: 60, action: 'daw:play', savedAt: '2026-01-01' }],
            d1Result.capabilities
        );
        check('3a. Mapping daw:play hợp lệ -> có trong index đúng key "note:1:60"', mapA.get('note:1:60')?.capabilityId === 'daw:play', [...mapA.entries()]);

        let mapB, threwB = false;
        try { ({ mapping: mapB } = d1Loader.buildD1GatedMapping([{ trigger: 'CC20 = 127 ch1', action: 'daw:stop' }], d1Result.capabilities)); } catch { threwB = true; }
        check('3b. Mapping kiểu cũ (thiếu type/channel/number) -> KHÔNG throw', !threwB);
        check('3b. Mapping kiểu cũ -> KHÔNG vào index (an toàn, không đoán)', mapB && mapB.size === 0, mapB && [...mapB.entries()]);

        const { mapping: mapC, rejected: rejC } = d1Loader.buildD1GatedMapping(
            [{ trigger: 'NOTE ON 40', kind: 'note', type: 'note', channel: 1, number: 40, action: 'khong-ton-tai-trong-D1', savedAt: '2026-01-01' }],
            d1Result.capabilities
        );
        check('3c. Action không tồn tại trong D1 -> KHÔNG vào index dù đủ field cấu trúc', mapC.size === 0 && rejC[0]?.reason === 'UNKNOWN_CAPABILITY_IN_D1', { mapC: [...mapC.entries()], rejC });

        const { mapping: mapC2, rejected: rejC2 } = d1Loader.buildD1GatedMapping(
            [{ type: 'cc', channel: 1, number: 30, action: 'daw:save', savedAt: '2026-01-01' }],
            d1Result.capabilities
        );
        check('3c-2. "daw:save" (CÓ trong D1, nhưng midi-allowed=false) -> bị loại đúng lý do D1_MIDI_NOT_ALLOWED (KHÔNG PHẢI unknown-capability)', mapC2.size === 0 && rejC2[0]?.reason === 'D1_MIDI_NOT_ALLOWED', { mapC2: [...mapC2.entries()], rejC2 });

        let threwD = false;
        try { d1Loader.buildD1GatedMapping([null, undefined, {}, { type: 'cc' }], d1Result.capabilities); } catch { threwD = true; }
        check('3d. Mảng mapping chứa null/undefined/object rỗng -> KHÔNG throw', !threwD);

        let threwE = false;
        try {
            d1Loader.buildD1GatedMapping(undefined, d1Result.capabilities);
            d1Loader.buildD1GatedMapping('not-an-array', d1Result.capabilities);
            d1Loader.buildD1GatedMapping(null, d1Result.capabilities);
        } catch { threwE = true; }
        check('3e. legacyMidiMappings không phải mảng / null / undefined -> KHÔNG throw', !threwE);
    }

    console.log('\n== SECTION 4: Trigger MIDI event -> normalizeMidiMessage() thật ==');
    {
        const noteOn = runtime.normalizeMidiMessage([0x91, 60, 100]);
        check('Note On -> {type:"note", channel:2, number:60, value:100}', noteOn && noteOn.type === 'note' && noteOn.channel === 2 && noteOn.number === 60 && noteOn.value === 100, noteOn);

        const noteOff = runtime.normalizeMidiMessage([0x81, 60, 0]);
        check('Note Off -> null (KHÔNG dispatch)', noteOff === null, noteOff);

        const noteOnVel0 = runtime.normalizeMidiMessage([0x91, 60, 0]);
        check('Note On velocity=0 -> null (tương đương Note Off)', noteOnVel0 === null, noteOnVel0);

        const cc = runtime.normalizeMidiMessage([0xb0, 20, 127]);
        check('CC -> {type:"cc", channel:1, number:20, value:127}', cc && cc.type === 'cc' && cc.channel === 1 && cc.number === 20 && cc.value === 127, cc);

        const pitchBend = runtime.normalizeMidiMessage([0xe0, 0, 64]);
        check('Pitch Bend -> null (chưa wire)', pitchBend === null, pitchBend);

        const programChange = runtime.normalizeMidiMessage([0xc0, 5]);
        check('Program Change -> null (chưa wire)', programChange === null, programChange);
    }

    console.log('\n== SECTION 5: Action dispatch -> CommandEngine + capabilityRegistry thật ==');
    {
        function makeFakeDriver(name, ready) {
            const calls = [];
            return { name, calls, async isReady() { return ready; }, async execute(params) { calls.push(params); return { ok: true }; } };
        }

        {
            const engine = new CommandEngine();
            const mcu = makeFakeDriver('mcu', true);
            const hotkey = makeFakeDriver('hotkey', true);
            engine.registerDriver(mcu);
            engine.registerDriver(hotkey);
            const cap = d1Loader.CAPABILITY_BACKEND_TARGET['daw:play'];
            const result = await engine.dispatch(cap);
            check('5a. daw:play dispatch ok=true, driverUsed=mcu', result.ok === true && result.driverUsed === 'mcu', result);
            check('5a. mcu driver nhận đúng params { note: 0x5e } (94, Mackie Control Play, KHÔNG bịa số)', mcu.calls.length === 1 && mcu.calls[0].note === 0x5e, mcu.calls);
            check('5a. hotkey KHÔNG được gọi (vì mcu đã ready+ok)', hotkey.calls.length === 0, hotkey.calls);
        }

        {
            const engine = new CommandEngine();
            const mcu = makeFakeDriver('mcu', true);
            engine.registerDriver(mcu);
            await engine.dispatch(d1Loader.CAPABILITY_BACKEND_TARGET['daw:stop']);
            await engine.dispatch(d1Loader.CAPABILITY_BACKEND_TARGET['daw:record']);
            check('5b. daw:stop -> note 0x5d, daw:record -> note 0x5f (đúng capabilityRegistry.js, không bịa)',
                mcu.calls[0].note === 0x5d && mcu.calls[1].note === 0x5f, mcu.calls);
        }

        {
            const engine = new CommandEngine();
            const mcu = makeFakeDriver('mcu', false);
            const hotkey = makeFakeDriver('hotkey', true);
            engine.registerDriver(mcu);
            engine.registerDriver(hotkey);
            const result = await engine.dispatch(d1Loader.CAPABILITY_BACKEND_TARGET['daw:play']);
            check('5c. mcu không ready -> fallback đúng sang hotkey', result.driverUsed === 'hotkey', result);
            check('5c. hotkey nhận đúng params { keys: "Space" } (đúng capabilityRegistry.js cho transportPlay)', hotkey.calls[0]?.keys === 'Space', hotkey.calls);
        }

        {
            const engine = new CommandEngine();
            engine.registerDriver(makeFakeDriver('mcu', false));
            engine.registerDriver(makeFakeDriver('hotkey', false));
            const result = await engine.dispatch(d1Loader.CAPABILITY_BACKEND_TARGET['daw:play']);
            check('5d. Không driver nào ready -> ok=false (không bịa thành công)', result.ok === false, result);
        }

        {
            const engine = new CommandEngine();
            const mcu = makeFakeDriver('mcu', true);
            engine.registerDriver(mcu);
            const result = await engine.dispatch({ targetId: 'studio_one', action: 'menuButtonA_KHONG_TON_TAI' });
            check('5e. Action không có capability -> ok=false', result.ok === false, result);
            check('5e. Action không có capability -> KHÔNG driver nào bị gọi (không dispatch giả)', mcu.calls.length === 0, mcu.calls);
        }
    }

    console.log('\n== SECTION 6: Mapping/settings hỏng -> không crash ==');
    {
        let threw = false;
        try {
            d1Loader.buildD1GatedMapping([
                { type: 'note', channel: 'không-phải-số', number: 60, action: 'daw:play' },
                { type: 'note', channel: 1, number: 60, action: 123 },
                { type: 'note', channel: 1, number: 60, action: 'daw:play;DROP TABLE' },
                { type: null, channel: null, number: null, action: 'daw:play' },
            ], d1Result.capabilities);
        } catch { threw = true; }
        check('6. Mapping với field sai kiểu/giá trị bất thường -> KHÔNG throw', !threw);
    }

    console.log('\n== SECTION 7: Regression daw:play/stop/record KHÔNG đổi + chứng minh D1 THẬT SỰ là source-of-truth ==');
    {
        const keys = Object.keys(d1Loader.CAPABILITY_BACKEND_TARGET).sort();
        check('7. CAPABILITY_BACKEND_TARGET đúng CHÍNH XÁC 3 key: daw:play, daw:record, daw:stop (backend metadata, không mở rộng)',
            JSON.stringify(keys) === JSON.stringify(['daw:play', 'daw:record', 'daw:stop']), keys);
        check('7. daw:play -> {studio_one, transportPlay}', JSON.stringify(d1Loader.CAPABILITY_BACKEND_TARGET['daw:play']) === JSON.stringify({ targetId: 'studio_one', action: 'transportPlay' }));
        check('7. daw:stop -> {studio_one, transportStop}', JSON.stringify(d1Loader.CAPABILITY_BACKEND_TARGET['daw:stop']) === JSON.stringify({ targetId: 'studio_one', action: 'transportStop' }));
        check('7. daw:record -> {studio_one, transportRecord}', JSON.stringify(d1Loader.CAPABILITY_BACKEND_TARGET['daw:record']) === JSON.stringify({ targetId: 'studio_one', action: 'transportRecord' }));
        check('7. capabilityRegistry.registry.studio_one.actions còn nguyên transportPlay/Stop/Record với đúng note cũ (0x5e/0x5d/0x5f), không đổi',
            registry.studio_one.actions.transportPlay.mcu.note === 0x5e &&
            registry.studio_one.actions.transportStop.mcu.note === 0x5d &&
            registry.studio_one.actions.transportRecord.mcu.note === 0x5f);

        const fixtureXsd = xsd;
        const fixtureXmlPlayDisabled = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:play" backend-status="not-supported" midi-allowed="false"><description>B38-FIX proof: D1 gia lap tat midi-allowed cho daw:play</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings/>\n' +
'</midi-mapping>';
        const proofResult = await d1Loader.loadAndValidateD1(fixtureXmlPlayDisabled, fixtureXsd);
        check('7-PROOF. Fixture D1 (daw:play midi-allowed=false) load OK', proofResult.ok === true, proofResult);
        check('7-PROOF. CAPABILITY_BACKEND_TARGET["daw:play"] VẪN CÒN NGUYÊN (bảng backend không đổi theo D1)', !!d1Loader.CAPABILITY_BACKEND_TARGET['daw:play']);
        const { mapping: proofMapping, rejected: proofRejected } = d1Loader.buildD1GatedMapping(
            [{ type: 'note', channel: 2, number: 64, action: 'daw:play' }],
            proofResult.capabilities
        );
        check('7-PROOF. Nhưng D1 nói midi-allowed=false -> mapping THẬT KHÔNG cài daw:play (D1 THẮNG, không phải bảng backend)', proofMapping.size === 0 && proofRejected[0]?.reason === 'D1_MIDI_NOT_ALLOWED', { proofMapping: [...proofMapping.entries()], proofRejected });
        check('7-PROOF. Đối chứng: cùng binding đó với D1 production THẬT (midi-allowed=true) -> ĐƯỢC cài', d1Loader.buildD1GatedMapping([{ type: 'note', channel: 2, number: 64, action: 'daw:play' }], d1Result.capabilities).mapping.size === 1);
    }

    console.log('\n== SECTION 8: Toàn bộ action trong dropdown Setup thật -> đối chiếu D1 THẬT ==');
    {
        const setupHtml = fs.readFileSync(path.join(repoRoot, 'ui', 'setup.html'), 'utf8');
        const selectMatch = setupHtml.match(/<select id="midiLearnAction"[\s\S]*?<\/select>/);
        check('Trích xuất được đúng <select id="midiLearnAction"> thật từ setup.html', !!selectMatch);
        const optionValues = selectMatch ? [...selectMatch[0].matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).filter(Boolean) : [];
        check('Tìm được ít nhất 1 action ngoài daw:* trong dropdown thật (để test có ý nghĩa)', optionValues.some((a) => !a.startsWith('daw:')), optionValues);

        const capById = new Map(d1Result.capabilities.map((c) => [c.id, c]));
        function isDispatchable(action) {
            const cap = capById.get(action);
            return !!cap && cap.midiAllowed === true && !!d1Loader.CAPABILITY_BACKEND_TARGET[action];
        }

        const nonDawActions = optionValues.filter((a) => !a.startsWith('daw:'));
        for (const action of nonDawActions) {
            check(`8. "${action}" (dropdown Setup thật) -> KHÔNG dispatchable qua D1 (UNSUPPORTED BY DESIGN)`, !isDispatchable(action));
        }
        const dawActions = optionValues.filter((a) => a.startsWith('daw:'));
        check('8. Toàn bộ daw:* trong dropdown thật đều dispatchable qua D1 (DISPATCHED)',
            dawActions.length > 0 && dawActions.every(isDispatchable), dawActions);
    }

    console.log('\n== SECTION 9: Ranh giới CAPABILITY_BACKEND_TARGET — chứng minh KHÔNG chứa MIDI field nào (không phải mapping thứ 2) ==');
    {
        const values = Object.values(d1Loader.CAPABILITY_BACKEND_TARGET);
        const hasMidiField = values.some((v) => 'type' in v || 'channel' in v || 'number' in v);
        check('9. CAPABILITY_BACKEND_TARGET KHÔNG có bất kỳ entry nào chứa type/channel/number (không phải MIDI mapping)', !hasMidiField, values);
        const keysShape = values.every((v) => Object.keys(v).sort().join(',') === 'action,targetId');
        check('9. Mọi entry CHỈ có đúng 2 field {targetId, action} — thuần backend metadata', keysShape, values);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('TEST CRASH:', err);
    process.exit(1);
});
