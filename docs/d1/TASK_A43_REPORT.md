Claude A : Task A43 — D1 VALIDATION PATH + D1 FREEZE PREPARATION

STATUS:
PARTIAL

(Lý do PARTIAL thay vì PASS: toàn bộ blocker kỹ thuật đã xử lý xong và PASS thật — XEM chi
tiết bên dưới — nhưng phát hiện thêm 1 vấn đề "duplicate source of truth" mà A43 KHÔNG tự
sửa vì nằm ngoài đúng 5 file D1 được giao (xem mục ZERO-BINDING/FREEZE READINESS). Theo đúng
tinh thần "không được ghi PASS nếu bất kỳ blocker nào FAIL", A43 báo cáo trung thực PARTIAL
thay vì tự nới lỏng tiêu chí để có PASS đẹp.)

BASELINE:
HEAD:         2707d0adec6beb5020ee8c537d330f8bc2da65ae
origin/main:  2707d0adec6beb5020ee8c537d330f8bc2da65ae (khớp)

PRE-CONDITION:
A42 confirmed on origin/main: YES — A42 không có code change nào cần push (audit-only, tự
xác nhận trong chính báo cáo A42). `origin/main` đã tiến thêm đúng 1 commit không liên quan
kể từ lúc A42 audit (3 file test Setup persistence, do người khác thêm) — không ảnh hưởng
phạm vi A43, đã xác nhận finding P0 của A42 (D1SpecValidation crash) vẫn còn nguyên trước khi
bắt đầu sửa.

D1 PATH:
Đã xác định **Single Source of Truth = `docs/d1/`** (không phải `docs/`) — bằng chứng RÕ
RÀNG, không suy đoán: chính `tests/unit/D1SpecValidation.verify.js` (comment header) VÀ
`D1-REPORT.md` (12+ chỗ tham chiếu) đều nhất quán dùng `docs/d1/` làm đường dẫn thiết kế gốc
của Task B23. 5 file kỹ thuật D1 đã bị đặt SAI vị trí (`docs/` phẳng) khi đưa vào `main` — đây
là lỗi vị trí lúc merge, KHÔNG PHẢI lỗi thiết kế của B23. Đã sửa bằng cách DI CHUYỂN (git mv,
KHÔNG đổi 1 byte nội dung nào) 5 file về đúng `docs/d1/`.

FILES:
```
docs/midi-mapping.xml              -> docs/d1/midi-mapping.xml
docs/midi-mapping.xsd              -> docs/d1/midi-mapping.xsd
docs/semanticValidate.js           -> docs/d1/semanticValidate.js
docs/capability-backend-matrix.md  -> docs/d1/capability-backend-matrix.md
docs/midi-mapping-rules.md         -> docs/d1/midi-mapping-rules.md
```
`docs/kien-truc-tong-quan.md` (không thuộc D1) GIỮ NGUYÊN tại `docs/` — xác nhận đây là file
duy nhất khác trong `docs/`, không liên quan D1, không bị đụng tới.

Đã xác nhận TRƯỚC khi di chuyển: **không có bất kỳ file nào khác trong repo tham chiếu tới
đường dẫn phẳng cũ** (`docs/midi-mapping.xml` v.v.) — nên việc di chuyển không làm gãy gì
khác ngoài đúng chỗ cần sửa.

VALIDATION:
```
XML:      well-formed — xác nhận ĐỘC LẬP bằng `xmllint --noout docs/d1/midi-mapping.xml`
          (không chỉ tin theo test) → PASS
XSD:      well-formed (tự nó là 1 XML hợp lệ) + validate XML qua XSD ĐỘC LẬP bằng
          `xmllint --noout --schema docs/d1/midi-mapping.xsd docs/d1/midi-mapping.xml`
          → "docs/d1/midi-mapping.xml validates" → PASS
          Đã đọc trực tiếp XSD, xác nhận CÓ THẬT cơ chế `xs:key`/`xs:keyref`/`xs:unique`
          (không phải test tự bịa ra khẳng định) → PASS
Semantic: `docs/d1/semanticValidate.js` chạy thật qua test, REJECT đúng các case sai (capability-
          ref không tồn tại, binding trỏ capability pending-backend, duplicate binding,
          schemaVersion không hỗ trợ) → PASS
Test:     `node tests/unit/D1SpecValidation.verify.js` → **18 PASS, 0 FAIL, exit code 0**
          (trước đây: CRASH, exit code 1, không chạy được dòng nào) → PASS
```

4 PRINCIPLES (đọc trực tiếp `docs/d1/midi-mapping.xml`, không suy đoán):
```
P1 (Action ID độc lập MIDI Binding):
   Toàn bộ 8 action ID (daw:play/stop/record/save, menu:buttonA/buttonB,
   plugin:retune/humanize) — KHÔNG action ID nào chứa Note/CC/Channel/Value/tên DAW.
   → PASS

P2 (Không assumption Backend):
   Mỗi capability có backend-status rõ ràng (3 implemented, 1 pending-backend,
   4 not-supported) kèm bằng chứng cụ thể trong comment/description — không có capability
   nào được gắn "implemented" mà thiếu bằng chứng.
   → PASS

P3 (Namespace daw:*/menu:*/plugin:*):
   Cả 8 capability đều đúng 1 trong 3 namespace. 3 action ID có thật trong Setup nhưng SAI
   namespace (fn:autoDetect, preset:load, keymod:doTone) đã bị CỐ Ý LOẠI khỏi D1 — đúng
   nguyên tắc, không lách luật bằng cách đổi tên chúng.
   → PASS

P4 (Capability không chứa MIDI fields):
   Đọc từng <description> — không có Note/CC/Channel/MIDI-value nào xuất hiện trong mô tả
   capability. `midi-allowed` chỉ là cờ true/false (đủ điều kiện MIDI hay không), không phải
   giá trị MIDI cụ thể — không vi phạm P4.
   → PASS
```

ZERO-BINDING:
`<bindings>` rỗng hoàn toàn (xác nhận qua đếm phần tử `<binding` thật, loại trừ nhầm khớp với
tag `<bindings>` container — đã kiểm tra kỹ dòng cụ thể, không phải đếm ẩu). Test 1 xác nhận
lại đúng "0 binding trong bản production". → **PASS**

⚠️ **PHÁT HIỆN THÊM — Duplicate Source of Truth (ngoài phạm vi 5 file D1 chính, nhưng liên
quan trực tiếp tiêu chí mục 6 đề bài):**
Tìm thấy `AI_BOOT.md/capability-backend-matrix.md` và `AI_BOOT.md/midi-mapping-rules.md` —
**2 bản sao Y HỆT byte-for-byte** (đã `diff`, exit code 0, không khác 1 ký tự) so với bản
chính thức mới ở `docs/d1/`. Không có file nào trong repo tham chiếu tới 2 bản sao này (đã
grep xác nhận). Đây LÀ duplicate source of truth thật, nhưng **A43 KHÔNG tự xoá** vì:
(a) nằm ngoài đúng phạm vi "5 D1 artifact" được giao trong task này,
(b) `AI_BOOT.md/` là thư mục tài liệu chung, không phải khu vực D1 riêng,
(c) đúng tinh thần mục 8 "phát hiện vấn đề ngoài scope → ghi nhận, không tự sửa".
**Khuyến nghị:** Khói xác nhận có nên xoá 2 file này (an toàn — không ai tham chiếu) trong 1
task dọn dẹp riêng, hoặc giữ lại làm bản lưu trữ lịch sử (archival copy) — A43 không tự quyết.

FREEZE READINESS:

| Check | Result |
|---|---|
| D1 path consistency | PASS |
| XML well-formed | PASS |
| XSD validation | PASS |
| Semantic validation | PASS |
| Principle 1 | PASS |
| Principle 2 | PASS |
| Principle 3 | PASS |
| Principle 4 | PASS |
| Capability Matrix | PASS |
| Zero-binding rule | PASS |
| Unit test | PASS (18/18, exit 0) |
| Broken references | PASS (không còn reference gãy tới path cũ) |
| Duplicate source of truth | **FAIL** — 2 bản sao y hệt trong `AI_BOOT.md/` (xem chi tiết trên) |

**D1 STATUS: KHÔNG THỂ ghi "READY FOR FREEZE" tuyệt đối** vì đúng 1/13 mục checklist FAIL.
Tuy nhiên cần nói rõ: **toàn bộ phần KỸ THUẬT của D1 (XML/XSD/validator/test) đã sạch, nhất
quán, PASS 100%** — vấn đề duy nhất còn lại là 2 file MARKDOWN trùng lặp trong 1 thư mục
KHÁC (`AI_BOOT.md/`), không ảnh hưởng gì tới việc XML/XSD/validator hoạt động đúng. Khói có
thể coi đây là "READY FOR FREEZE về mặt kỹ thuật, cần 1 quyết định dọn dẹp nhỏ trước khi
FREEZE chính thức" — A43 để nguyên FAIL trên bảng, không tự nới lỏng để ghi PASS.

TEST INVENTORY:
```
PASS:     38 (toàn bộ tests/unit/*.verify.js, đếm ĐÚNG phương pháp: kiểm tra exit code
          KHÔNG chỉ grep "❌" — đúng yêu cầu mục 7 đề bài)
FAIL:     0
CRASH:    0 (D1SpecValidation không còn crash — đây chính là mục tiêu P0 của task)
SKIPPED:  0
```
Lưu ý: tổng test tăng từ 35 (lúc A42) lên 38 — do 3 file mới (`DawSetupPersistence`,
`SettingsFileIO`, `SoundcardSetupPersistence`) được thêm bởi người khác giữa A42 và A43,
không liên quan A43, đã chạy chung và xác nhận PASS, không phải A43 tạo ra.

REGRESSION:
Đã chạy riêng 13 file test MIDI/D1 liên quan trực tiếp (`D1SpecValidation`,
`MidiLearnDispatch`, `PortSelectionPolicy`, `KnobDynamicValue`, `MonitorBeatRetuneBackend`,
`MidiHealth`, `KnobBeatMaster`, `KnobMappingIsolation`, `MonitorBeatToggle`,
`MouseControlGate`, `ModDualTarget`, `CommandRuntimeHealth`, `PluginCommandBridge`) — **13/13
PASS**, không regression nào từ việc di chuyển file.

CHANGED FILES:
```
docs/capability-backend-matrix.md -> docs/d1/capability-backend-matrix.md  (di chuyển, nội
docs/midi-mapping-rules.md        -> docs/d1/midi-mapping-rules.md         dung KHÔNG đổi,
docs/midi-mapping.xml             -> docs/d1/midi-mapping.xml              xác nhận bằng git
docs/midi-mapping.xsd             -> docs/d1/midi-mapping.xsd              diff: 0 dòng
docs/semanticValidate.js          -> docs/d1/semanticValidate.js           thêm/xoá nội dung)
```
KHÔNG sửa `tests/unit/D1SpecValidation.verify.js` (test tự nó đã đúng, chỉ vị trí file production
sai — sửa vị trí, không sửa test, đúng khuyến nghị A42).

PROTECTED AREAS:
Xác nhận KHÔNG đụng: `ui/js/engines/keyEngine.js`, AI Key/Manual Key state, Menu UI, Setup UI,
MIDI bindings, MIDI Dispatcher behavior, `ACTION_TO_CAPABILITY`, D1→Runtime Loader, WASAPI,
dead-code cleanup, refactor kiến trúc ngoài D1 path.

OUT-OF-SCOPE FINDINGS (ghi nhận, KHÔNG tự sửa):
1. 2 file duplicate trong `AI_BOOT.md/` (xem mục ZERO-BINDING/FREEZE READINESS ở trên).
2. D1 vẫn CHƯA có Loader nối vào Runtime thật — đúng như A42 đã ghi nhận, KHÔNG thuộc phạm
   vi A43 (task đã nói rõ "A43 KHÔNG phải task tích hợp D1 vào Runtime").
3. Claude C vẫn chưa từng audit độc lập D1 (điều kiện B23 tự đặt ra để FREEZE chính thức) —
   A43 chỉ chuẩn bị D1 ở trạng thái sẵn sàng về mặt kỹ thuật, không thay thế được bước audit
   độc lập đó.

FILES DELIVERED TO KHÔI:
5 file tại vị trí MỚI (`docs/d1/`) — nội dung giữ nguyên 100% so với bản cũ, chỉ đổi thư mục
chứa:
- docs_d1/midi-mapping.xml
- docs_d1/midi-mapping.xsd
- docs_d1/semanticValidate.js
- docs_d1/capability-backend-matrix.md
- docs_d1/midi-mapping-rules.md

Cách áp dụng: tạo thư mục `G:\AUTO_MENU_AI\docs\d1\` (nếu chưa có), copy 5 file trên vào đúng
thư mục đó, sau đó **XOÁ 5 file cũ tương ứng ở `G:\AUTO_MENU_AI\docs\`** (KHÔNG giữ cả 2 nơi —
đúng nguyên tắc "không duplicate"), rồi `git add -A && git commit && git push` như các lần
trước.

NEXT:
STOP — chờ task tiếp theo. Không tự chuyển A44, không tự làm D1 Loader, không tự đụng
WASAPI/duplicate KeyEngine/dead-code cleanup.
