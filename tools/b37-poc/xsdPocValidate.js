/**
 * tools/b37-poc/xsdPocValidate.js — TASK B37 Technology Spike
 * ---------------------------------------------------------------------------
 * POC ĐỘC LẬP — KHÔNG gọi runtime.js, KHÔNG dispatch command, KHÔNG sửa
 * runtime mapping. Chỉ chứng minh pipeline kỹ thuật:
 *
 *   XML string
 *     -> xmllint-wasm (parse + validate theo docs/d1/midi-mapping.xsd)
 *     -> nếu XSD PASS: chạy tiếp docs/d1/semanticValidate.js (Rule A1/B2/M4/M6)
 *
 * Dependency dùng: xmllint-wasm@5.3.0 (MIT, 0 runtime dependency, thuần
 * WASM — KHÔNG native binding, KHÔNG cần compile, KHÔNG cần xmllint hệ
 * thống). Đây CHỈ LÀ POC — KHÔNG phải quyết định production cuối cùng
 * (xem B37 report để biết ai quyết định điều đó).
 *
 * Chạy: node tools/b37-poc/xsdPocValidate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateXML } = require('xmllint-wasm');

const repoRoot = path.join(__dirname, '..', '..');
const xsdPath = path.join(repoRoot, 'docs', 'd1', 'midi-mapping.xsd');
const prodXmlPath = path.join(repoRoot, 'docs', 'd1', 'midi-mapping.xml');
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures');

const { validateSemantics } = require(path.join(repoRoot, 'docs', 'd1', 'semanticValidate.js'));

const xsdContents = fs.readFileSync(xsdPath, 'utf8');

let pass = 0, fail = 0;
function assert(cond, label, detail) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function xsdValidate(xmlContents, fileNameForErrors) {
    const result = await validateXML({
        xml: [{ fileName: fileNameForErrors, contents: xmlContents }],
        schema: [{ fileName: 'midi-mapping.xsd', contents: xsdContents }],
    });
    return result; // { valid, errors, rawOutput }
}

async function main() {
    console.log('===== B37 POC — XML/XSD/Semantic pipeline (xmllint-wasm) =====\n');

    // --- Case A: production XML hiện tại phải parse + XSD PASS ---
    console.log('== Case A: docs/d1/midi-mapping.xml (production, <bindings/> rỗng) ==');
    {
        const xml = fs.readFileSync(prodXmlPath, 'utf8');
        const xsdResult = await xsdValidate(xml, 'midi-mapping.xml');
        assert(xsdResult.valid === true, 'Production XML: XSD PASS', xsdResult.errors);
        const semResult = validateSemantics(xml);
        assert(semResult.ok === true, 'Production XML: Semantic PASS', semResult.errors);
    }

    // --- Case B: capability-ref không tồn tại -> XSD FAIL (xs:keyref) ---
    console.log('\n== Case B: capability-ref trỏ tới capability không tồn tại ==');
    {
        const xml = fs.readFileSync(path.join(fixturesDir, 'b37-invalid-capability-ref.xml'), 'utf8');
        const xsdResult = await xsdValidate(xml, 'b37-invalid-capability-ref.xml');
        assert(xsdResult.valid === false, 'XSD FAIL đúng như kỳ vọng (xs:keyref)', xsdResult.errors);
        assert(xsdResult.errors.some((e) => /keyref|key/i.test(e.message)), 'Lỗi thật sự nhắc tới key/keyref (không phải lỗi khác trùng hợp)', xsdResult.errors);
    }

    // --- Case C: duplicate binding (type,channel,number) -> XSD FAIL (xs:unique) ---
    console.log('\n== Case C: 2 binding trùng (type,channel,number) ==');
    {
        const xml = fs.readFileSync(path.join(fixturesDir, 'b37-duplicate-binding.xml'), 'utf8');
        const xsdResult = await xsdValidate(xml, 'b37-duplicate-binding.xml');
        assert(xsdResult.valid === false, 'XSD FAIL đúng như kỳ vọng (xs:unique)', xsdResult.errors);
        assert(xsdResult.errors.some((e) => /unique|duplicate/i.test(e.message)), 'Lỗi thật sự nhắc tới unique/duplicate', xsdResult.errors);
    }

    // --- Case D: Rule A1 violation -> XSD có thể PASS, Semantic PHẢI FAIL ---
    console.log('\n== Case D: capability id "daw:reaperPlay" (Rule A1) ==');
    {
        const xml = fs.readFileSync(path.join(fixturesDir, 'b37-rule-a1-violation.xml'), 'utf8');
        const xsdResult = await xsdValidate(xml, 'b37-rule-a1-violation.xml');
        assert(xsdResult.valid === true, 'XSD PASS (đúng như dự đoán — XSD không enforce được lookahead Rule A1)', xsdResult.errors);
        const semResult = validateSemantics(xml);
        assert(semResult.ok === false, 'Semantic Validator FAIL (Rule A1 bắt được, đúng ranh giới 2 tầng)', semResult.errors);
        assert(semResult.errors.some((e) => e.includes('Rule A1')), 'Lỗi thật sự do Rule A1, không phải rule khác trùng hợp', semResult.errors);
    }

    // --- Case E: hợp lệ hoàn toàn (XSD + Semantic đều PASS) ---
    console.log('\n== Case E: D1 hợp lệ có 1 binding test-only ==');
    {
        const xml = fs.readFileSync(path.join(fixturesDir, 'b37-valid-with-binding.xml'), 'utf8');
        const xsdResult = await xsdValidate(xml, 'b37-valid-with-binding.xml');
        assert(xsdResult.valid === true, 'XSD PASS', xsdResult.errors);
        const semResult = validateSemantics(xml);
        assert(semResult.ok === true, 'Semantic PASS', semResult.errors);
    }

    // --- Case bổ sung: XML không well-formed (không phải lỗi XSD, mà lỗi parse cơ bản) ---
    console.log('\n== Case bổ sung: XML không well-formed (thiếu thẻ đóng) ==');
    {
        const xml = fs.readFileSync(path.join(fixturesDir, 'b37-malformed-xml.xml'), 'utf8');
        const xsdResult = await xsdValidate(xml, 'b37-malformed-xml.xml');
        assert(xsdResult.valid === false, 'Reject đúng — không well-formed thì không thể "PASS giả"', xsdResult.errors);
    }

    // --- Xác nhận production XML không hề bị đụng trong suốt POC này ---
    console.log('\n== Xác nhận production XML không đổi ==');
    {
        const xml = fs.readFileSync(prodXmlPath, 'utf8');
        assert(/<bindings\s*\/>/.test(xml) || /<bindings>\s*<!--[\s\S]*?-->\s*<\/bindings>/.test(xml), 'docs/d1/midi-mapping.xml vẫn <bindings/> rỗng (không bị POC ghi đè)');
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('POC CRASH:', err);
    process.exit(1);
});
