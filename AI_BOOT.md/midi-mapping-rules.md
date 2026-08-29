# midi-mapping-rules.md — D1 Specification (Task B23)

Quy tắc chính thức chi phối `midi-mapping.xml`/`midi-mapping.xsd`/
`capability-backend-matrix.md`. Mọi implementation sau này (Task B21 —
Runtime Integration) phải tuân thủ đúng các quy tắc dưới đây; nếu code hiện
tại không đáp ứng, phải sửa code, **không sửa quy tắc D1** để "cho khớp"
(đúng nguyên tắc giao việc B21/B23: *"D1 là contract; B21 là implementation.
Không thay đổi contract để phù hợp code"*).

---

## 1. Ba lớp tách biệt (3-layer separation)

```
Action layer          → Action ID (vd "daw:play") — CHỈ có ý nghĩa, không
                          chứa bất kỳ dữ liệu truyền tải nào.
MIDI layer             → type / channel / number / value — CHỈ nằm trong
                          <binding>, không bao giờ trong <capability>.
Backend layer           → implemented / pending-backend / blocked /
                          not-supported — mô tả CÓ module thật thực thi hành
                          động đó hay không, độc lập với việc MIDI binding
                          có tồn tại hay không.
```

3 lớp này **không được trộn lẫn** trong bất kỳ tài liệu D1 nào. Một
capability có thể `implemented` mà chưa có binding nào (đúng — user chưa
Learn); một binding không bao giờ được tồn tại nếu capability đích chưa
`implemented` (xem Rule B2).

---

## 2. Action layer — Principle 1 & Principle 3 (HARD LOCK)

### Rule A1 — Action ID độc lập MIDI (Principle 1)
Action ID KHÔNG được chứa: số CC, số Note, số Channel, MIDI value, hay tên
DAW cụ thể. Enforce bằng XSD (`ActionId` simpleType, pattern namespace) ở
mức cấu trúc (namespace + hình dạng chung); phần "không chứa từ khoá MIDI/
DAW cụ thể" (vd hậu tố `...cc30`) **XSD không enforce được** (XML Schema
regex không hỗ trợ lookahead — đã xác nhận bằng thực thi thật, xem comment
trong `midi-mapping.xsd`) → đây là **Semantic Validator requirement**, danh
sách từ khoá cần chặn tối thiểu: `cc<số>`, `note<số>`, `channel<số>`, và tên
DAW cụ thể (`reaper`, `studioone`, `ableton`, `cubase`, `flstudio`, và các
tên DAW khác nếu phát sinh).

### Rule A2 — Namespace (Principle 3)
Action ID production **chỉ** dùng `daw:*`, `menu:*`, `plugin:*`. Enforce
được bằng XSD (pattern). Không tự tạo namespace mới trong `midi-mapping.xml`.

### Namespace exceptions — đã phát hiện, CHƯA xử lý (không tự quyết)
Audit `ui/setup.html` (dropdown `#midiLearnAction`) tìm thấy **3 action ID
đang tồn tại thật trong UI** nhưng dùng namespace KHÔNG hợp lệ theo Rule A2:

```
fn:autoDetect
preset:load
keymod:doTone
```

Đây là **discrepancy giữa UI hiện có và Principle 3**, không phải lỗi của
D1. B23 **cố ý loại 3 action ID này khỏi `midi-mapping.xml`** (không định
nghĩa capability cho chúng) vì Principle 3 là HARD LOCK — không thể vừa
tuân thủ vừa đưa `fn:*`/`preset:*`/`keymod:*` vào capability set. Hai hướng
xử lý khả dĩ (không tự chọn ở đây, để Khói/Claude C quyết định):

- (a) Đổi tên 3 action ID này trong `ui/setup.html` sang namespace hợp lệ
  (vd `fn:autoDetect` → `menu:autoDetect`) — cần 1 task riêng, ngoài phạm
  vi B23 (B23 chỉ được ghi 5 D1 artifact, không sửa UI).
- (b) Mở rộng Principle 3 để chấp nhận thêm namespace `fn:*`/`preset:*`/
  `keymod:*` — đây là sửa đổi **chính D1 principle**, cần quyết định có chủ
  đích, không phải B tự ý nới lỏng.

Cho tới khi có quyết định, 3 action ID này **không có capability** trong
`midi-mapping.xml` — nếu user Learn MIDI cho chúng qua Setup, mapping vẫn
Save/Load được (không đổi hành vi hiện tại) nhưng **không** dispatch được
qua runtime CommandEngine (đúng thực trạng đã xác nhận từ Task B20).

---

## 3. Backend layer — Principle 2

### Rule B1 — Không giả định backend
`backend-status="implemented"` chỉ được gán khi có **cả 2** bằng chứng nêu
ở `capability-backend-matrix.md` mục "Nguyên tắc cập nhật matrix này". Có
nút UI, có dropdown option, hay có 1 driver "ví dụ" trong
`capabilityRegistry.js` (tự nhận là ví dụ trong comment) đều **không đủ**.

### Rule B2 — `midi-allowed` phụ thuộc `backend-status`
```
backend-status = "implemented"      →  midi-allowed PHẢI = true
backend-status ∈ {pending-backend,
                   blocked,
                   not-supported}    →  midi-allowed PHẢI = false
```
XSD khai báo 2 attribute này độc lập (XML Schema 1.0 co-constraint giữa 2
attribute rất hạn chế) → quan hệ trên **là Semantic Validator requirement**,
không phải XSD-enforceable trực tiếp trong bản schema này.

### Rule B3 — 4 trạng thái, định nghĩa rõ ràng
```
implemented       Có driver thật trong capabilityRegistry.js VÀ có entry
                   trong ACTION_TO_CAPABILITY VÀ có test xác nhận dispatch
                   đúng (không chỉ đọc code).
pending-backend    Có MỘT PHẦN bằng chứng (vd driver tồn tại trong
                   capabilityRegistry.js) nhưng thiếu wiring
                   (ACTION_TO_CAPABILITY) hoặc thiếu test xác nhận.
blocked            Có backend thật nhưng bị 1 ràng buộc kiến trúc đã biết
                   ngăn không cho wire an toàn ngay bây giờ (vd tránh tái
                   tạo dual-dispatch — xem TASK_B20_RESULT.md mục 2/7 làm
                   ví dụ về LOẠI ràng buộc này, dù hiện tại không có
                   capability nào trong 8 capability của bản D1 này rơi
                   đúng trạng thái blocked).
not-supported      Không có bằng chứng backend nào, ở bất kỳ đâu trong repo
                   (0 driver, 0 wiring) — không phải "đang làm dở", mà là
                   "chưa từng có gì".
```

---

## 4. MIDI layer — Principle 4

### Rule M1 — Capability không chứa MIDI field
`<capability>` chỉ có `id`, `backend-status`, `midi-allowed`, và
`<description>` (mô tả hành động bằng lời, không phải bằng số MIDI). Enforce
bằng XSD (`Capability` complexType không có attribute/element nào cho
type/channel/number/value).

### Rule M2 — Binding tách riêng, tham chiếu bằng ID
`<binding>` chỉ chứa dữ liệu truyền tải MIDI + `capability-ref` (tham chiếu
ngược, không copy lại mô tả capability). Toàn vẹn tham chiếu enforce bằng
XSD (`xs:key`/`xs:keyref`, đã test PASS/FAIL thật — xem D1-REPORT.md).

### Rule M3 — Không fake binding (Principle 2 + mục 9 đề bài B23)
Không được tự chọn CC/Note/Channel/Value để lấp chỗ trống hay "cho XML đẹp".
Nếu chưa có mapping evidence thật (chưa qua MIDI Learn), **không tạo
`<binding>`** — không có trạng thái "binding rỗng/pending" ở mức phần tử,
chỉ đơn giản là KHÔNG XUẤT HIỆN trong `<bindings>`. Bản D1 hiện tại:
`<bindings>` rỗng hoàn toàn (0 phần tử `<binding>`).

### Rule M4 — Binding chỉ hợp lệ khi capability cho phép
```
binding.capability-ref → capability.midi-allowed PHẢI = true
```
Tương đương: capability có `backend-status ≠ implemented` thì KHÔNG được
có binding nào tham chiếu tới nó. Đây là **Semantic Validator requirement**
(XSD không biết được relationship "nếu X thì Y bị cấm" giữa 2 phần tử khác
nhau theo kiểu điều kiện này).

### Rule M5 — Duplicate binding
2 binding không được trùng bộ `(type, channel, number)` — enforce được bằng
XSD (`xs:unique`, đã test FAIL thật khi trùng — xem D1-REPORT.md). Không
silently overwrite.

### Rule M6 — MIDI Learn binding
Binding tạo bởi MIDI Learn (runtime, ngoài phạm vi B23) bắt buộc có
`source="midi-learn"` và `learned-at="<ISO 8601 timestamp>"`. Không được
bypass Semantic Validator (Rule M4/M5 vẫn áp dụng đầy đủ cho binding do
MIDI Learn tạo ra, không có ngoại lệ).

---

## 5. Version check

Runtime (Task B21, chưa triển khai) phải kiểm tra
`midi-mapping/@schemaVersion` và `midi-mapping/@mappingVersion` trước khi
nạp — nếu `schemaVersion` không khớp phiên bản XSD mà runtime hỗ trợ, phải
từ chối nạp (REJECT), không cố đọc "best-effort". Bản D1 hiện tại:
`schemaVersion="1.0"`, `mappingVersion="1.0.0"`.

---

## 6. Semantic Rules — tổng hợp (những gì XSD KHÔNG enforce được)

Danh sách đầy đủ, không được bỏ sót khi implement Semantic Validator ở B21:

1. Action ID không chứa từ khoá MIDI/DAW cụ thể (Rule A1, phần lookahead).
2. `midi-allowed` khớp đúng `backend-status` (Rule B2).
3. Binding chỉ hợp lệ khi capability đích cho phép (Rule M4).
4. Không đánh dấu `implemented` khi thiếu 1 trong 2 bằng chứng bắt buộc
   (Rule B3 — đây là quy tắc biên soạn D1, không phải business rule runtime
   validate được, nhưng vẫn cần ghi rõ ở đây làm chuẩn tham chiếu).
5. `learned-at` bắt buộc có mặt khi `source="midi-learn"` (Rule M6 — XSD chỉ
   khai báo optional vì không co-constraint theo giá trị attribute khác
   được).

Những gì XSD **CÓ** enforce được (không cần Semantic Validator xử lý lại):
namespace + hình dạng chung Action ID (Rule A2), capability không chứa MIDI
field (Rule M1), toàn vẹn `capability-ref` (Rule M2), duplicate binding theo
`(type, channel, number)` (Rule M5), ràng buộc số channel (1-16)/number-value
(0-127), enum `backend-status`/`type`/`source` hợp lệ.
