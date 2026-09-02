/**
 * semanticValidate.js — D1 Specification (Task B23)
 * ====================================================
 * Validator NGỮ NGHĨA cho midi-mapping.xml — chỉ xử lý đúng những rule mà
 * midi-mapping.xsd KHÔNG enforce được (xem midi-mapping-rules.md mục 6):
 *   - schemaVersion có được runtime hỗ trợ hay không (mục 5)
 *   - Rule B2: midi-allowed phải khớp backend-status
 *   - Rule M4: binding chỉ hợp lệ khi capability đích midi-allowed=true
 *   - Rule M6: source="midi-learn" bắt buộc có learned-at
 *
 * ĐÂY LÀ VALIDATION SCRIPT CHO D1 ARTIFACT, KHÔNG PHẢI RUNTIME INTEGRATION —
 * không được require() bởi bất kỳ file nào trong core/command-engine-js/,
 * app/main.js, app/preload.js. Dùng độc lập bởi tests/unit/D1SpecValidation.verify.js
 * và (tuỳ chọn) bởi con người chạy tay để kiểm tra 1 bản midi-mapping.xml khác.
 *
 * Parse bằng regex có kiểm soát — KHÔNG phải parser XML tổng quát, chỉ đúng
 * cho hình dạng cụ thể mà midi-mapping.xsd quy định (phần tử phẳng, thuộc
 * tính dùng dấu nháy kép, không có CDATA/namespace prefix lồng phức tạp).
 * Đủ dùng cho phạm vi D1 (validation script), không dùng làm parser chung.
 */
'use strict';

const SUPPORTED_SCHEMA_VERSIONS = ['1.0'];

function extractAttrs(tag) {
    const attrs = {};
    const re = /([a-zA-Z][\w-]*)="([^"]*)"/g;
    let m;
    while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
    return attrs;
}

function parseMidiMapping(xmlText) {
    const rootMatch = xmlText.match(/<midi-mapping\b([^>]*)>/);
    if (!rootMatch) throw new Error('Không tìm thấy phần tử gốc <midi-mapping>');
    const root = extractAttrs(rootMatch[1]);

    const capabilities = [...xmlText.matchAll(/<capability\b([^>]*?)(?:\/>|>[\s\S]*?<\/capability>)/g)]
        .map((m) => extractAttrs(m[1]));

    const bindings = [...xmlText.matchAll(/<binding\b([^>]*?)\/?>/g)]
        .map((m) => extractAttrs(m[1]));

    return { schemaVersion: root.schemaVersion, mappingVersion: root.mappingVersion, capabilities, bindings };
}

/**
 * @param {string} xmlText
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateSemantics(xmlText) {
    const errors = [];
    let doc;
    try {
        doc = parseMidiMapping(xmlText);
    } catch (e) {
        return { ok: false, errors: [`Parse error: ${e.message}`] };
    }

    // Version check (mục 5 midi-mapping-rules.md)
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc.schemaVersion)) {
        errors.push(`schemaVersion "${doc.schemaVersion}" không được runtime hỗ trợ (hỗ trợ: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')})`);
    }

    const capById = new Map(doc.capabilities.map((c) => [c.id, c]));

    // Rule B2 — midi-allowed phải khớp backend-status
    for (const c of doc.capabilities) {
        const shouldAllow = c['backend-status'] === 'implemented';
        const actualAllow = c['midi-allowed'] === 'true';
        if (shouldAllow !== actualAllow) {
            errors.push(`Capability "${c.id}": midi-allowed="${c['midi-allowed']}" không khớp backend-status="${c['backend-status']}" (Rule B2)`);
        }
    }

    // Rule M4 + M6 — binding eligibility + learned-at bắt buộc khi midi-learn
    for (const b of doc.bindings) {
        const cap = capById.get(b['capability-ref']);
        if (!cap) {
            errors.push(`Binding "${b.id}": capability-ref="${b['capability-ref']}" không tồn tại (đáng lẽ đã bị XSD keyref chặn trước)`);
            continue;
        }
        if (cap['midi-allowed'] !== 'true') {
            errors.push(`Binding "${b.id}": tham chiếu capability "${cap.id}" có midi-allowed="${cap['midi-allowed']}" (backend-status="${cap['backend-status']}") — KHÔNG được phép có binding (Rule M4)`);
        }
        if (b.source === 'midi-learn' && !b['learned-at']) {
            errors.push(`Binding "${b.id}": source="midi-learn" nhưng thiếu learned-at (Rule M6)`);
        }
    }

    return { ok: errors.length === 0, errors, doc };
}

/** Binding index thuần (type:channel:number -> capability-ref), dùng cho TEST 5/6.
 *  KHÔNG phải bản sao của runtime.js:buildMappingIndex() (đó là hàm private của
 *  core/command-engine-js, đây chỉ là hàm phụ trợ đọc XML cho mục đích validate
 *  D1 spec — không được dùng thay thế implementation thật ở B21). */
function buildBindingIndex(doc) {
    const index = new Map();
    for (const b of doc.bindings) {
        index.set(`${b.type}:${b.channel}:${b.number}`, b['capability-ref']);
    }
    return index;
}

module.exports = { validateSemantics, parseMidiMapping, buildBindingIndex, SUPPORTED_SCHEMA_VERSIONS };
