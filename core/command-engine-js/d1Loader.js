/**
 * core/command-engine-js/d1Loader.js — TASK B38
 * ===========================================================================
 * D1 Runtime Loader — biến docs/d1/midi-mapping.xml thành nguồn xác thực cho
 * mapping MIDI thật sự được dispatch (thay vì chỉ là spec không ai đọc, như
 * B33/B34/B36 đã phát hiện).
 *
 * PIPELINE BẮT BUỘC (không đảo thứ tự — B38 mục 4/7):
 *
 *   XML string
 *     -> XML well-formed + XSD structural validation (xmllint-wasm@5.3.0 —
 *        candidate đã chứng minh ở B37, verified Windows real-host)
 *     -> nếu XSD FAIL: FAIL CLOSED ngay, không đọc tiếp
 *     -> Semantic validation (docs/d1/semanticValidate.js — Rule A1/B2/M4/M6,
 *        schemaVersion) — file đó CHỈ được đọc/audit, KHÔNG bị sửa thành
 *        parser hay runtime command engine (đúng ranh giới B36 mục 4C)
 *     -> nếu semantic FAIL: FAIL CLOSED
 *     -> build danh sách capability đã xác thực (id, backend-status,
 *        midi-allowed) — đây là D1 RUNTIME MAPPING INDEX thật.
 *
 * KHÔNG dùng system `xmllint` làm runtime dependency (B38 mục 6) — chỉ dùng
 * `xmllint-wasm`, thuần WASM, đã verified chạy trên Windows thật (ảnh chụp
 * console thật từ Khói, xem báo cáo B37 phần cập nhật Windows verified).
 *
 * KHÔNG mutate file XML nguồn. KHÔNG tự sinh binding. KHÔNG auto-learn.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateXML } = require('xmllint-wasm');

const D1_DIR = path.join(__dirname, '..', '..', 'docs', 'd1');
const D1_XML_PATH = path.join(D1_DIR, 'midi-mapping.xml');
const D1_XSD_PATH = path.join(D1_DIR, 'midi-mapping.xsd');
const D1_SEMANTIC_VALIDATOR_PATH = path.join(D1_DIR, 'semanticValidate.js');

// eslint-disable-next-line global-require
const { validateSemantics, parseMidiMapping } = require(D1_SEMANTIC_VALIDATOR_PATH);

/**
 * TASK B38 mục 5 — Backend metadata: capability id -> {targetId, action}
 * (tên registry action THẬT trong capabilityRegistry.js).
 *
 * ĐÂY KHÔNG PHẢI "D1 mapping thứ hai" / KHÔNG duplicate D1: D1 XML hoàn toàn
 * KHÔNG có field targetId/registryAction nào — D1 chỉ định nghĩa capability
 * id + backend-status + midi-allowed (metadata VỀ capability), không định
 * nghĩa "capability này thực thi bằng driver/action nào trong code". Bảng
 * dưới đây là NƠI DUY NHẤT ánh xạ điều đó — tách biệt rạch ròi với D1:
 *   - D1 XML quyết định: capability này CÓ ĐƯỢC PHÉP dispatch qua MIDI không
 *     (midi-allowed) và CÓ TỒN TẠI/backend-status là gì.
 *   - Bảng này quyết định: NẾU D1 cho phép, thì gọi target/action nào.
 * Nếu ngày mai D1 đổi "daw:play" midi-allowed=false, bảng này VẪN giữ
 * nguyên entry đó nhưng buildD1GatedMapping() bên dưới sẽ TỰ ĐỘNG loại nó ra
 * khỏi mapping thật — KHÔNG cần sửa thêm ở đây. Đây chính là ý nghĩa "D1 là
 * source-of-truth, không phải sửa 2 bảng" của B38 mục 5.
 *
 * Nội dung giữ NGUYÊN VẸN 3 entry cũ (daw:play/stop/record -> studio_one) —
 * đúng những gì capabilityRegistry.js THẬT SỰ có driver (xem B34 daw:save
 * deep audit: driver saveSong chỉ có hotkey, D1 cố ý pending-backend, KHÔNG
 * đưa vào đây, đúng theo D1).
 */
const CAPABILITY_BACKEND_TARGET = {
    'daw:play': { targetId: 'studio_one', action: 'transportPlay' },
    'daw:stop': { targetId: 'studio_one', action: 'transportStop' },
    'daw:record': { targetId: 'studio_one', action: 'transportRecord' },
};

/**
 * loadAndValidateD1(xmlContents, xsdContents) — pipeline đầy đủ, ASYNC (XSD
 * qua xmllint-wasm dùng worker_threads, không thể sync). KHÔNG đọc file —
 * nhận contents làm tham số để dễ test với fixture, không cần mock fs.
 *
 * @returns {Promise<{ok:boolean, stage:string, errors:string[], capabilities:Array|null}>}
 *   stage: 'not-well-formed' | 'xsd' | 'semantic' | 'ok'
 */
async function loadAndValidateD1(xmlContents, xsdContents) {
    let xsdResult;
    try {
        xsdResult = await validateXML({
            xml: [{ fileName: 'midi-mapping.xml', contents: xmlContents }],
            schema: [{ fileName: 'midi-mapping.xsd', contents: xsdContents }],
        });
    } catch (err) {
        // xmllint-wasm tự throw khi XML không well-formed (không parse được) — đây
        // KHÔNG phải lỗi hệ thống, là kết quả hợp lệ của "XML invalid" (B38 mục 11).
        return { ok: false, stage: 'not-well-formed', errors: [String(err && err.message || err)], capabilities: null };
    }
    if (!xsdResult.valid) {
        return { ok: false, stage: 'xsd', errors: (xsdResult.errors || []).map((e) => e.message || String(e)), capabilities: null };
    }

    // Rule A1/B2/M4/M6 + schemaVersion — CHỈ chạy SAU KHI XSD đã PASS, đúng thứ tự
    // bắt buộc mục 7. semanticValidate.js không bị sửa thành parser (chỉ require()
    // các hàm thuần đã có sẵn, đúng ranh giới B36).
    let semResult;
    try {
        semResult = validateSemantics(xmlContents);
    } catch (err) {
        return { ok: false, stage: 'semantic-crash', errors: [String(err && err.message || err)], capabilities: null };
    }
    if (!semResult.ok) {
        return { ok: false, stage: 'semantic', errors: semResult.errors, capabilities: null };
    }

    const doc = parseMidiMapping(xmlContents);
    const capabilities = doc.capabilities.map((c) => ({
        id: c.id,
        backendStatus: c['backend-status'],
        midiAllowed: c['midi-allowed'] === 'true',
    }));
    return { ok: true, stage: 'ok', errors: [], capabilities };
}

/** Đọc 2 file thật (docs/d1/midi-mapping.xml + .xsd) rồi chạy loadAndValidateD1(). */
async function loadD1FromDisk(xmlPath = D1_XML_PATH, xsdPath = D1_XSD_PATH) {
    let xmlContents;
    let xsdContents;
    try {
        xmlContents = fs.readFileSync(xmlPath, 'utf8');
        xsdContents = fs.readFileSync(xsdPath, 'utf8');
    } catch (err) {
        // File thiếu/không đọc được -> fail-closed, KHÔNG throw ra ngoài (B38 mục 11:
        // "XML missing -> loader phải làm gì" — trả lời: NOT READY, không crash app).
        return { ok: false, stage: 'file-read-error', errors: [String(err && err.message || err)], capabilities: null };
    }
    return loadAndValidateD1(xmlContents, xsdContents);
}

/**
 * buildD1GatedMapping(legacyMidiMappings, d1Capabilities) — hàm THUẦN, không I/O.
 *
 * Đây là "runtime mapping index" thật (B38 mục 4, sau bước "Runtime Mapping
 * Loader"): kết hợp binding đã lưu qua MIDI Learn (settings.midiMappingsV1 —
 * xem B36 mục 16, coi đây là "input/migration data", KHÔNG phải source-of-
 * truth của việc "action này có được phép dispatch không") với D1 (nguồn xác
 * thực capability nào tồn tại + midi-allowed) và CAPABILITY_BACKEND_TARGET
 * (nguồn xác thực capability đó gọi driver/action nào).
 *
 * 1 binding chỉ được đưa vào mapping thật khi ĐỦ CẢ 3 điều kiện:
 *   1. capability-ref (field "action" trong object đã lưu — xem B33 tìm ra
 *      chỗ lệch tên field này) tồn tại trong D1 VÀ midi-allowed=true;
 *   2. có entry trong CAPABILITY_BACKEND_TARGET (có driver thật);
 *   3. key "type:channel:number" chưa từng xuất hiện (chống duplicate runtime
 *      key — B38 mục 8 "reject duplicate runtime keys").
 *
 * @param {Array} legacyMidiMappings  settings.midiMappingsV1 (có thể undefined)
 * @param {Array} d1Capabilities      capabilities đã validate từ loadAndValidateD1()
 * @returns {{ mapping: Map<string,{targetId:string,action:string,capabilityId:string}>, rejected: Array }}
 */
function buildD1GatedMapping(legacyMidiMappings, d1Capabilities) {
    const capById = new Map((d1Capabilities || []).map((c) => [c.id, c]));
    const mapping = new Map();
    const rejected = [];
    const list = Array.isArray(legacyMidiMappings) ? legacyMidiMappings : [];

    for (const m of list) {
        if (!m || !m.type || m.channel == null || m.number == null || !m.action) continue; // giữ đúng guard cũ của buildMappingIndex() — không parse chuỗi tự do
        const key = `${m.type}:${m.channel}:${m.number}`;
        const cap = capById.get(m.action);
        if (!cap) { rejected.push({ key, action: m.action, reason: 'UNKNOWN_CAPABILITY_IN_D1' }); continue; }
        if (cap.midiAllowed !== true) { rejected.push({ key, action: m.action, reason: 'D1_MIDI_NOT_ALLOWED', backendStatus: cap.backendStatus }); continue; }
        const target = CAPABILITY_BACKEND_TARGET[m.action];
        if (!target) { rejected.push({ key, action: m.action, reason: 'NO_BACKEND_TARGET' }); continue; }
        if (mapping.has(key)) { rejected.push({ key, action: m.action, reason: 'DUPLICATE_RUNTIME_KEY' }); continue; }
        mapping.set(key, { targetId: target.targetId, action: target.action, capabilityId: m.action });
    }
    return { mapping, rejected };
}

module.exports = {
    loadAndValidateD1,
    loadD1FromDisk,
    buildD1GatedMapping,
    CAPABILITY_BACKEND_TARGET,
    D1_XML_PATH,
    D1_XSD_PATH,
};
