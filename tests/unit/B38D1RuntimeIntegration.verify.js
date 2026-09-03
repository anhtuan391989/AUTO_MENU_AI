/**
 * B38D1RuntimeIntegration.verify.js — TASK B38
 * ===========================================================================
 * Chứng minh pipeline production THẬT (không mock logic):
 *
 *   XML -> xmllint-wasm (XSD) -> docs/d1/semanticValidate.js (Semantic)
 *        -> core/command-engine-js/d1Loader.js:buildD1GatedMapping()
 *        -> CommandEngine (thật) + capabilityRegistry (thật) -> driver
 *
 * Bao phủ đủ Case A-G (B38 mục 10) + test matrix mục 17 + fail-closed mục 11.
 *
 * KHÔNG mock d1Loader/semanticValidate/CommandEngine/capabilityRegistry — chỉ thay
 * driver bằng test double tối giản (đúng interface BaseDriver, giống hệt kỹ thuật
 * SECTION 5 của MidiLearnDispatch.verify.js đã dùng cho ACTION_TO_CAPABILITY).
 *
 * Chạy: node tests/unit/B38D1RuntimeIntegration.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const repoRoot = path.join(__dirname, '..', '..');
const d1Loader = require(path.join(repoRoot, 'core', 'command-engine-js', 'd1Loader.js'));
const CommandEngine = require(path.join(repoRoot, 'core', 'command-engine-js', 'commandEngine.js'));
const runtime = require(path.join(repoRoot, 'core', 'command-engine-js', 'runtime.js'));

function makeFakeDriver(name, ready) {
    const calls = [];
    return { name, calls, async isReady() { return ready; }, async execute(params) { calls.push(params); return { ok: true }; } };
}

async function dispatchThroughRealBoundary(target) {
    // Mô phỏng CHÍNH XÁC những gì dispatchFromMidi() thật làm ở bước cuối — dùng
    // CommandEngine + capabilityRegistry THẬT (require thật, không mock), chỉ thay driver.
    const engine = new CommandEngine();
    const mcu = makeFakeDriver('mcu', true);
    const hotkey = makeFakeDriver('hotkey', true);
    engine.registerDriver(mcu);
    engine.registerDriver(hotkey);
    engine.drivers.set('mcu', mcu); // alias giống runtime.js thật (dòng "engine.drivers.set('mcu', ...)")
    const result = await engine.dispatch({ targetId: target.targetId, action: target.action });
    return { result, mcu, hotkey };
}

async function main() {
    const xsd = fs.readFileSync(d1Loader.D1_XSD_PATH, 'utf8');
    const prodXml = fs.readFileSync(d1Loader.D1_XML_PATH, 'utf8');

    console.log('== Case A: Production D1 XML — XSD PASS + Semantic PASS, dispatch note-on ch2/64 -> daw:play tới capability registry/CommandEngine/driver thật ==');
    {
        const result = await d1Loader.loadAndValidateD1(prodXml, xsd);
        check('A1. Production XML: loadAndValidateD1 ok=true, stage=ok', result.ok === true && result.stage === 'ok', result);

        const { mapping, rejected } = d1Loader.buildD1GatedMapping(
            [{ type: 'note', channel: 2, number: 64, action: 'daw:play' }],
            result.capabilities
        );
        const msg = runtime.normalizeMidiMessage([0x91, 64, 100]); // note-on channel 2 (0x91 = 0x90|1), number 64, velocity 100
        check('A2. normalizeMidiMessage(note-on ch2 num64) -> {type:note, channel:2, number:64}', msg && msg.type === 'note' && msg.channel === 2 && msg.number === 64, msg);
        const key = `${msg.type}:${msg.channel}:${msg.number}`;
        const target = mapping.get(key);
        check('A3. D1-gated mapping resolve đúng capability-ref=daw:play', target && target.capabilityId === 'daw:play', target);
        check('A4. rejected rỗng (binding hợp lệ, không bị loại)', rejected.length === 0, rejected);

        const { result: dispatchResult, mcu } = await dispatchThroughRealBoundary(target);
        check('A5. Dispatch qua CommandEngine+capabilityRegistry THẬT: ok=true, driverUsed=mcu', dispatchResult.ok === true && dispatchResult.driverUsed === 'mcu', dispatchResult);
        check('A6. Driver thật nhận đúng note 0x5e (Mackie Control Play, từ capabilityRegistry.js thật, không bịa)', mcu.calls.length === 1 && mcu.calls[0].note === 0x5e, mcu.calls);
    }

    console.log('\n== Case B: Unmatched MIDI event (cc:5:99) -> undefined, không dispatch, không crash ==');
    {
        const result = await d1Loader.loadAndValidateD1(prodXml, xsd);
        const { mapping } = d1Loader.buildD1GatedMapping([{ type: 'note', channel: 2, number: 64, action: 'daw:play' }], result.capabilities);
        const msg = runtime.normalizeMidiMessage([0xb4, 5, 99]); // cc channel 5, controller 5, value 99
        const key = `${msg.type}:${msg.channel}:${msg.number}`;
        const target = mapping.get(key);
        check('B1. cc:5:99 không có trong mapping -> undefined (NO ACTION)', target === undefined, target);
    }

    console.log('\n== Case C: Rule A1 (daw:reaperPlay) -> Semantic Validator reject, mapping KHÔNG được install ==');
    {
        const fixtureXml = fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'b37-rule-a1-violation.xml'), 'utf8');
        const result = await d1Loader.loadAndValidateD1(fixtureXml, xsd);
        check('C1. XSD PASS (đúng dự đoán B37 — XSD không enforce được lookahead)', result.stage !== 'xsd' && result.stage !== 'not-well-formed', result);
        check('C2. Nhưng ok=false, stage=semantic (Rule A1 chặn ở tầng Semantic)', result.ok === false && result.stage === 'semantic', result);
        check('C3. capabilities=null -> KHÔNG build được runtime mapping nào từ fixture này', result.capabilities === null, result.capabilities);
        check('C4. Lỗi thật sự do Rule A1', result.errors.some((e) => e.includes('Rule A1')), result.errors);
    }

    console.log('\n== Case D: M4 — capability pending-backend/midi-allowed=false có binding trỏ vào -> reject ==');
    {
        // daw:save trong production D1 CHÍNH LÀ case này (pending-backend, midi-allowed=false) —
        // dùng fixture riêng để binding trỏ thẳng vào nó, không đụng production XML.
        const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">
  <capabilities>
    <capability id="daw:save" backend-status="pending-backend" midi-allowed="false"><description>test</description></capability>
  </capabilities>
  <bindings>
    <binding id="b1" capability-ref="daw:save" type="cc" channel="1" number="30" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>
  </bindings>
</midi-mapping>`;
        const result = await d1Loader.loadAndValidateD1(fixtureXml, xsd);
        check('D1. XSD/Semantic FAIL đúng — Rule M4 chặn binding trỏ vào capability midi-allowed=false', result.ok === false, result);
        check('D2. Lỗi thật sự do Rule M4', result.errors.some((e) => /M4/i.test(e)), result.errors);

        // Đồng thời xác nhận buildD1GatedMapping() cũng tự loại daw:save NGAY CẢ KHI D1 hợp lệ
        // (dùng production capabilities thật) — vì midi-allowed=false, phòng trường hợp code khác
        // gọi thẳng buildD1GatedMapping() mà bỏ qua bước loadAndValidateD1() (defense-in-depth).
        const prodResult = await d1Loader.loadAndValidateD1(prodXml, xsd);
        const { rejected } = d1Loader.buildD1GatedMapping([{ type: 'cc', channel: 1, number: 30, action: 'daw:save' }], prodResult.capabilities);
        check('D3. buildD1GatedMapping() cũng tự reject daw:save (D1_MIDI_NOT_ALLOWED) — 2 lớp bảo vệ độc lập', rejected.length === 1 && rejected[0].reason === 'D1_MIDI_NOT_ALLOWED', rejected);
    }

    console.log('\n== Case E: capability-ref không tồn tại -> XSD/keyref FAIL, không tạo được runtime mapping ==');
    {
        const fixtureXml = fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'b37-invalid-capability-ref.xml'), 'utf8');
        const result = await d1Loader.loadAndValidateD1(fixtureXml, xsd);
        check('E1. stage=xsd, ok=false (xs:keyref chặn)', result.ok === false && result.stage === 'xsd', result);
        check('E2. capabilities=null', result.capabilities === null);
    }

    console.log('\n== Case F: Duplicate binding (cùng type+channel+number) -> XSD/xs:unique FAIL ==');
    {
        const fixtureXml = fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'b37-duplicate-binding.xml'), 'utf8');
        const result = await d1Loader.loadAndValidateD1(fixtureXml, xsd);
        check('F1. stage=xsd, ok=false (xs:unique chặn)', result.ok === false && result.stage === 'xsd', result);
    }
    {
        // Bổ sung: duplicate key ở TẦNG RUNTIME (2 entry settings.midiMappingsV1 khác nhau nhưng
        // trỏ cùng key type:channel:number) — buildD1GatedMapping() tự bảo vệ độc lập với XSD,
        // đúng mục 8 "reject duplicate runtime keys".
        const prodResult = await d1Loader.loadAndValidateD1(prodXml, xsd);
        const { mapping, rejected } = d1Loader.buildD1GatedMapping([
            { type: 'note', channel: 2, number: 64, action: 'daw:play' },
            { type: 'note', channel: 2, number: 64, action: 'daw:stop' }, // cùng key, action khác
        ], prodResult.capabilities);
        check('F2. Runtime-level duplicate key -> entry đầu được giữ, entry sau bị reject (không ghi đè âm thầm)', mapping.get('note:2:64').capabilityId === 'daw:play' && rejected.some((r) => r.reason === 'DUPLICATE_RUNTIME_KEY'), { mapping: [...mapping.entries()], rejected });
    }

    console.log('\n== Case G: XML không well-formed -> loader fail-closed, không throw ra ngoài ==');
    {
        const fixtureXml = fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'b37-malformed-xml.xml'), 'utf8');
        let threw = false;
        let result;
        try { result = await d1Loader.loadAndValidateD1(fixtureXml, xsd); } catch (e) { threw = true; }
        check('G1. loadAndValidateD1() KHÔNG throw ra ngoài dù XML hỏng', threw === false);
        // xmllint-wasm xử lý "not well-formed" NGAY TRONG bước XSD (trả valid:false + parser error
        // thật, không throw exception riêng) — nên stage thực tế là 'xsd', không phải nhánh catch
        // 'not-well-formed' riêng của d1Loader.js (nhánh đó vẫn giữ để phòng trường hợp xmllint-wasm
        // tương lai đổi hành vi throw thay vì trả valid:false). Điều quan trọng nhất vẫn đúng: ok=false.
        check('G2. ok=false (fail-closed đúng, dù stage cụ thể là "xsd")', result && result.ok === false && (result.stage === 'not-well-formed' || result.stage === 'xsd'), result);
        check('G3. Lỗi thật sự là parser error (mismatch tag), đúng bản chất "không well-formed"', result.errors.some((e) => /mismatch|parser error/i.test(e)), result.errors);
    }

    console.log('\n== Fail-closed mục 11: file D1 thiếu/không đọc được -> loadD1FromDisk() fail-closed, không crash ==');
    {
        let threw = false;
        let result;
        try {
            result = await d1Loader.loadD1FromDisk(
                path.join(repoRoot, 'tests', 'fixtures', 'khong-ton-tai-file-nay.xml'),
                d1Loader.D1_XSD_PATH
            );
        } catch (e) { threw = true; }
        check('File thiếu -> KHÔNG throw', threw === false);
        check('File thiếu -> ok=false, stage=file-read-error', result && result.ok === false && result.stage === 'file-read-error', result);
    }

    console.log('\n== Runtime integration: runtime.start() thật -> D1 tự nạp bất đồng bộ -> getD1State()/getD1GatedMapping() phản ánh đúng production ==');
    {
        // KHÔNG có easymidi/thiết bị thật trong môi trường audit — start() đã tự try/catch an toàn
        // theo đúng thiết kế cũ (xem comment "Không bao giờ throw ra ngoài"), chỉ cần xác nhận
        // KHÔNG throw và D1 tự nạp đúng bằng dữ liệu production thật.
        let threw = false;
        try {
            runtime.start({ readSettingsFile: () => ({ midiMappingsV1: [{ type: 'note', channel: 2, number: 64, action: 'daw:play' }] }) });
        } catch (e) { threw = true; }
        check('start() không throw dù chưa có MIDI port nào cấu hình', threw === false);

        // loadD1AndRebuild() bên trong start() là fire-and-forget — đợi 1 nhịp event loop rồi mới đọc.
        // Gọi TRỰC TIẾP loadD1AndRebuild() (đã export) để có Promise thật chờ được, thay vì đoán thời gian.
        await runtime.loadD1AndRebuild({ midiMappingsV1: [{ type: 'note', channel: 2, number: 64, action: 'daw:play' }] });
        const state = runtime.getD1State();
        const mapping = runtime.getD1GatedMapping();
        check('D1 state ok=true sau khi loadD1AndRebuild() thật resolve', state.ok === true, state);
        check('D1 gated mapping có đúng 1 entry (daw:play) từ settings test', mapping.size === 1 && mapping.get('note:2:64')?.capabilityId === 'daw:play', [...mapping.entries()]);
        runtime.stop();
    }

    console.log('\n== Production <bindings/> vẫn rỗng — B38 không tự thêm binding production ==');
    {
        check('docs/d1/midi-mapping.xml vẫn <bindings/> rỗng', /<bindings\s*\/>/.test(prodXml) || /<bindings>\s*<!--[\s\S]*?-->\s*<\/bindings>/.test(prodXml));
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('TEST CRASH:', err);
    process.exit(1);
});
