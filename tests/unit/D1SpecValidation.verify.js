/**
 * ==========================================================
 * D1 Specification Validation (Task B23, hardened B35, PORTABLE hoá Task B)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/D1SpecValidation.verify.js
 *
 * TASK B (Portable Windows) — trước đây file này gọi execFileSync('xmllint', ...)
 * (binary hệ thống Linux/libxml2-utils), khiến TEST 1/2/4/5/7 phụ thuộc 1 công cụ
 * KHÔNG có sẵn trên Windows sạch. Đã thay bằng đúng pipeline PRODUCTION THẬT:
 * core/command-engine-js/d1Loader.js:loadAndValidateD1() — module này tự dùng
 * xmllint-wasm@5.3.0 (thuần WASM, bundle theo npm dependency, không cần cài gì
 * thêm trên máy người dùng — xem package.json). Test này KHÔNG tự viết lại logic
 * XSD nào, chỉ gọi ĐÚNG hàm production thật, nên vừa hết phụ thuộc hệ thống vừa
 * tăng độ tin cậy (test giờ tự động phát hiện nếu d1Loader.js hỏng, trước đây thì
 * không — 2 con đường tách biệt).
 *
 * Bao phủ đủ 7 TEST bắt buộc của đề bài B23 mục 16 (không giảm/bỏ test nào):
 *   TEST 1 — midi-mapping.xml (production, docs/d1/) validate PASS qua
 *            XSD thật (qua d1Loader.js/xmllint-wasm, không phải giả lập).
 *   TEST 2 — capability-ref không tồn tại -> REJECT (XSD keyref).
 *   TEST 3 — binding trỏ tới capability pending-backend (midiAllowed=false,
 *            "daw:save") -> REJECT (Semantic Validator Rule M4 — XSD một
 *            mình KHÔNG bắt được case này, vì capability-ref vẫn tồn tại
 *            hợp lệ về cấu trúc; đây đúng là ranh giới XSD/Semantic đã ghi
 *            trong midi-mapping-rules.md).
 *   TEST 4 — duplicate binding (cùng type+channel+number) -> REJECT (XSD
 *            xs:unique thật).
 *   TEST 5 — Runtime dispatch: mock event note-on ch=2 number=64, có 1
 *            binding TEST-ONLY (không phải production) trỏ tới daw:play,
 *            resolve đúng qua buildBindingIndex() rồi dispatch thật qua
 *            CommandEngine + capabilityRegistry (module thật, core/command-
 *            engine-js/) — đúng kỹ thuật stub-driver đã dùng ở Task B20.
 *   TEST 6 — Mock event KHÔNG có binding nào khớp -> NO ACTION, không crash.
 *   TEST 7 — schemaVersion không được hỗ trợ ("2.0") -> REJECT.
 *   TEST 8 (B35) — Rule A1: Action ID chứa từ khoá MIDI/DAW cụ thể -> REJECT.
 *
 * KHÔNG sửa test A35/ConfidenceV2 nào. KHÔNG đụng core/command-engine-js
 * ngoài việc require() module thật (CommandEngine, capabilityRegistry, d1Loader)
 * để test dispatch — đúng phạm vi "READ ONLY" của B23 với core/command-engine-js/*.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? ` (thực tế: ${JSON.stringify(detail)})` : ''}`); }
}

const repoRoot = path.join(__dirname, '..', '..');
const d1Dir = path.join(repoRoot, 'docs', 'd1');
const xsdPath = path.join(d1Dir, 'midi-mapping.xsd');
const xmlPath = path.join(d1Dir, 'midi-mapping.xml');
const { validateSemantics, buildBindingIndex, findRuleA1Violation } = require(path.join(d1Dir, 'semanticValidate.js'));
const d1Loader = require(path.join(repoRoot, 'core', 'command-engine-js', 'd1Loader.js'));

const xsdContents = fs.readFileSync(xsdPath, 'utf8');

/**
 * xsdOk(xmlContent) — TASK B: thay hoàn toàn cho xmllintSchemaOk() cũ (execFileSync).
 * Gọi ĐÚNG d1Loader.js:loadAndValidateD1() (production thật, dùng xmllint-wasm) và chỉ
 * đọc riêng phần "XSD có PASS hay không" từ result.stage — bỏ qua kết quả Semantic Validator,
 * vì hàm này chỉ trả lời câu hỏi "XSD nói gì", đúng đúng vai trò cũ của xmllintSchemaOk().
 * @returns {Promise<boolean>}
 */
async function xsdOk(xmlContent) {
    const result = await d1Loader.loadAndValidateD1(xmlContent, xsdContents);
    if (result.ok) return true; // XSD PASS + Semantic PASS -> chắc chắn XSD PASS
    // ok=false: XSD có thể vẫn PASS (chỉ Semantic FAIL) — phân biệt bằng stage.
    return result.stage !== 'xsd' && result.stage !== 'not-well-formed';
}

async function main() {
    // -----------------------------------------------------------------------
    // TEST 1 — XML production PASS qua XSD thật
    // -----------------------------------------------------------------------
    console.log('\n== TEST 1: midi-mapping.xml (production) valid qua XSD thật (xmllint-wasm qua d1Loader.js) ==');
    {
        const xmlText = fs.readFileSync(xmlPath, 'utf8');
        check('midi-mapping.xml well-formed + validate PASS qua XSD (xmllint-wasm)', await xsdOk(xmlText));
        const result = validateSemantics(xmlText);
        check('midi-mapping.xml PASS luôn Semantic Validator (schemaVersion hỗ trợ, midi-allowed khớp backend-status, 0 binding nên Rule M4/M6 không có gì để vi phạm)', result.ok, result.errors);
        check('8 capability đúng như capability-backend-matrix.md (3 implemented, 1 pending-backend, 4 not-supported)', result.doc.capabilities.length === 8, result.doc.capabilities.length);
        check('0 binding trong bản production (đúng Rule M3 — không tự bịa MIDI mapping)', result.doc.bindings.length === 0, result.doc.bindings.length);
    }

    // -----------------------------------------------------------------------
    // TEST 2 — capability-ref không tồn tại -> REJECT
    // -----------------------------------------------------------------------
    console.log('\n== TEST 2: binding.capability-ref không tồn tại -> REJECT ==');
    {
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:play" backend-status="implemented" midi-allowed="true"><description>x</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings>\n' +
'    <binding id="b1" capability-ref="daw:khongTonTai" type="note-on" channel="1" number="60" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>\n' +
'  </bindings>\n' +
'</midi-mapping>';
        check('XSD (xs:keyref) REJECT capability-ref không tồn tại', (await xsdOk(xml)) === false);
    }

    // -----------------------------------------------------------------------
    // TEST 3 — binding trỏ tới capability pending-backend (midi-allowed=false) -> REJECT
    // -----------------------------------------------------------------------
    console.log('\n== TEST 3: binding -> capability pending-backend (daw:save, midiAllowed=false) -> REJECT ==');
    {
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:save" backend-status="pending-backend" midi-allowed="false"><description>Save Song, chua co entry trong CAPABILITY_BACKEND_TARGET</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings>\n' +
'    <binding id="b1" capability-ref="daw:save" type="cc" channel="1" number="30" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>\n' +
'  </bindings>\n' +
'</midi-mapping>';
        check('XSD một mình KHÔNG bắt được case này (capability-ref vẫn tồn tại hợp lệ về cấu trúc) — đúng ranh giới đã ghi trong midi-mapping-rules.md', (await xsdOk(xml)) === true);
        const result = validateSemantics(xml);
        check('Semantic Validator (Rule M4) REJECT binding trỏ tới capability midi-allowed=false', result.ok === false && result.errors.some((e) => e.includes('Rule M4')), result.errors);
    }

    // -----------------------------------------------------------------------
    // TEST 4 — duplicate binding -> REJECT
    // -----------------------------------------------------------------------
    console.log('\n== TEST 4: duplicate binding (cùng type+channel+number) -> REJECT ==');
    {
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:play" backend-status="implemented" midi-allowed="true"><description>x</description></capability>\n' +
'    <capability id="daw:stop" backend-status="implemented" midi-allowed="true"><description>y</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings>\n' +
'    <binding id="b1" capability-ref="daw:play" type="note-on" channel="1" number="60" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>\n' +
'    <binding id="b2" capability-ref="daw:stop" type="note-on" channel="1" number="60" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>\n' +
'  </bindings>\n' +
'</midi-mapping>';
        check('XSD (xs:unique) REJECT duplicate binding cùng (type,channel,number)', (await xsdOk(xml)) === false);
    }

    // -----------------------------------------------------------------------
    // TEST 5 — Runtime dispatch: mock note-on ch=2 number=64 -> resolve daw:play
    // -> CommandEngine.dispatch() thật (module thật core/command-engine-js/)
    // -----------------------------------------------------------------------
    console.log('\n== TEST 5: Runtime dispatch — mock MIDI event resolve đúng qua CommandEngine thật ==');
    {
        const CommandEngine = require(path.join(repoRoot, 'core', 'command-engine-js', 'commandEngine.js'));

        // Binding TEST-ONLY (không phải production — midi-mapping.xml thật có 0 binding,
        // đúng Rule M3). Dùng để chứng minh CƠ CHẾ resolve+dispatch hoạt động đúng khi
        // user (giả lập) đã MIDI Learn 1 binding thật cho daw:play.
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:play" backend-status="implemented" midi-allowed="true"><description>x</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings>\n' +
'    <binding id="b1" capability-ref="daw:play" type="note-on" channel="2" number="64" source="midi-learn" learned-at="2026-01-01T00:00:00Z"/>\n' +
'  </bindings>\n' +
'</midi-mapping>';
        check('Fixture TEST 5 valid qua XSD thật (điều kiện tiên quyết để test có ý nghĩa)', await xsdOk(xml));
        const result = validateSemantics(xml);
        check('Fixture TEST 5 PASS Semantic Validator', result.ok, result.errors);

        const index = buildBindingIndex(result.doc);
        const mockEvent = { type: 'note-on', channel: 2, number: 64 };
        const capabilityRef = index.get(`${mockEvent.type}:${mockEvent.channel}:${mockEvent.number}`);
        check('Mock event note-on:2:64 resolve đúng ra capability-ref="daw:play"', capabilityRef === 'daw:play', capabilityRef);

        const cap = d1Loader.CAPABILITY_BACKEND_TARGET[capabilityRef];
        check('"daw:play" có entry thật trong d1Loader.js:CAPABILITY_BACKEND_TARGET (module thật, không mock — B38-FIX: thay ACTION_TO_CAPABILITY đã xoá)', !!cap, cap);

        const engine = new CommandEngine();
        const calls = [];
        engine.registerDriver({ name: 'mcu', async isReady() { return true; }, async execute(p) { calls.push(p); return { ok: true }; } });
        const dispatchResult = await engine.dispatch(cap);
        check('CommandEngine.dispatch() thật trả ok=true, driverUsed=mcu', dispatchResult.ok === true && dispatchResult.driverUsed === 'mcu', dispatchResult);
        check('Driver mcu nhận đúng note 0x5e (Mackie Control Play, capabilityRegistry.js thật, không bịa)', calls[0]?.note === 0x5e, calls);

        // -------------------------------------------------------------------
        // TEST 6 — Mock event KHÔNG có binding nào khớp -> NO ACTION, không crash
        // -------------------------------------------------------------------
        console.log('\n== TEST 6: Mock event không có binding khớp -> NO ACTION, không crash ==');
        const unmatchedEvent = { type: 'cc', channel: 5, number: 99 };
        let threw = false;
        let unmatchedRef;
        try {
            unmatchedRef = index.get(`${unmatchedEvent.type}:${unmatchedEvent.channel}:${unmatchedEvent.number}`);
        } catch { threw = true; }
        check('Lookup event không khớp -> KHÔNG throw', !threw);
        check('Lookup event không khớp -> trả undefined (NO ACTION, không tự bịa)', unmatchedRef === undefined, unmatchedRef);
    }

    // -----------------------------------------------------------------------
    // TEST 7 — schemaVersion không được hỗ trợ -> REJECT
    // -----------------------------------------------------------------------
    console.log('\n== TEST 7: schemaVersion không được hỗ trợ ("2.0") -> REJECT ==');
    {
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="2.0" mappingVersion="1.0.0">\n' +
'  <capabilities>\n' +
'    <capability id="daw:play" backend-status="implemented" midi-allowed="true"><description>x</description></capability>\n' +
'  </capabilities>\n' +
'  <bindings/>\n' +
'</midi-mapping>';
        check('XSD vẫn PASS về cấu trúc (schemaVersion chỉ là xs:string tự do ở tầng XSD)', (await xsdOk(xml)) === true);
        const result = validateSemantics(xml);
        check('Semantic Validator REJECT vì schemaVersion="2.0" không nằm trong SUPPORTED_SCHEMA_VERSIONS', result.ok === false && result.errors.some((e) => e.includes('schemaVersion')), result.errors);
    }

    // -----------------------------------------------------------------------
    // TEST 8 (TASK B35) — Rule A1: Action ID không chứa từ khoá MIDI/DAW cụ thể
    // (XSD không enforce được lookahead — xem comment trong midi-mapping.xsd),
    // Semantic Validator PHẢI tự bắt được (midi-mapping-rules.md mục 2 + mục 6).
    // -----------------------------------------------------------------------
    console.log('\n== TEST 8: Rule A1 — Action ID chứa từ khoá MIDI/DAW cụ thể -> REJECT ==');
    {
        const negativeCases = [
            { id: 'daw:playCc30', reason: 'cc<số>' },
            { id: 'daw:note60Trigger', reason: 'note<số>' },
            { id: 'menu:channel1Toggle', reason: 'channel<số>' },
            { id: 'daw:reaperPlay', reason: 'tên DAW "reaper"' },
            { id: 'plugin:studioOneSync', reason: 'tên DAW "studioone" (không phân biệt hoa/thường)' },
            { id: 'daw:abletonLaunch', reason: 'tên DAW "ableton"' },
            { id: 'menu:cubaseA', reason: 'tên DAW "cubase"' },
            { id: 'plugin:flStudioX', reason: 'tên DAW "flstudio" (không phân biệt hoa/thường)' },
        ];
        for (const { id, reason } of negativeCases) {
            const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
`<midi-mapping xmlns="urn:auto-menu-ai:midi-mapping:v1" schemaVersion="1.0" mappingVersion="1.0.0">\n` +
`  <capabilities>\n` +
`    <capability id="${id}" backend-status="not-supported" midi-allowed="false"><description>test</description></capability>\n` +
`  </capabilities>\n` +
`  <bindings/>\n` +
`</midi-mapping>`;
            const result = validateSemantics(xml);
            check(`Rule A1 REJECT "${id}" (${reason})`, result.ok === false && result.errors.some((e) => e.includes('Rule A1')), result.errors);
        }
        check('findRuleA1Violation() KHÔNG throw với input rác (null/undefined)', (() => {
            try { findRuleA1Violation(null); findRuleA1Violation(undefined); return true; } catch { return false; }
        })());

        const positiveIds = ['daw:play', 'daw:stop', 'daw:record', 'daw:save', 'menu:buttonA', 'menu:buttonB', 'plugin:retune', 'plugin:humanize'];
        for (const id of positiveIds) {
            check(`Rule A1 KHÔNG reject nhầm "${id}" (findRuleA1Violation trả null)`, findRuleA1Violation(id) === null, findRuleA1Violation(id));
        }
        const prodXml = fs.readFileSync(xmlPath, 'utf8');
        const prodResult = validateSemantics(prodXml);
        check('midi-mapping.xml (production) PASS Rule A1 cho toàn bộ 8 capability thật', prodResult.ok && !prodResult.errors.some((e) => e.includes('Rule A1')), prodResult.errors);
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('TEST CRASH:', err);
    process.exit(1);
});
