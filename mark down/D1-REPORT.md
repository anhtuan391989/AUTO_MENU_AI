# D1-REPORT.md — D1 Specification (Task B23)

## A. Baseline

```
git fetch --all
git checkout main       → Already on 'main'
git pull --ff-only      → Already up to date
BASE_SHA (HEAD == origin/main) = b6a8afc7497d860b4fe67885b0b603669d305509
working tree TRƯỚC khi viết: CLEAN (chỉ untracked report B15-B22 + MOD_API_SPEC.md,
                              KHÔNG có tracked modification)
```

## B. Files created

```
docs/d1/midi-mapping.xml               (production spec — 8 capability, 0 binding)
docs/d1/midi-mapping.xsd               (XSD schema)
docs/d1/capability-backend-matrix.md   (Single Source of Truth backend status)
docs/d1/midi-mapping-rules.md          (D1 rules — 3-layer separation, Principle 1-4)
docs/d1/semanticValidate.js            (validator ngữ nghĩa — CHỈ cho D1 artifact,
                                         KHÔNG được require bởi bất kỳ module runtime
                                         nào trong core/command-engine-js/app/*)
D1-REPORT.md                            (báo cáo này)
tests/unit/D1SpecValidation.verify.js  (test — 18 assertion, đủ 7 TEST bắt buộc)
```

**D1 PATH: `docs/d1/`** — dùng nhất quán cho cả 4 artifact kỹ thuật + validator,
không tạo bản duplicate ở thư mục khác. `D1-REPORT.md` đặt ở root repo (giống
các báo cáo Task trước) để dễ tìm.

## C. Capability inventory

**8 capability**, trích xuất từ audit thật `origin/main` SHA `b6a8afc`:

- Đối chiếu: `ui/setup.html` (dropdown `#midiLearnAction`, 10 option thật),
  `core/command-engine-js/runtime.js` (`ACTION_TO_CAPABILITY`, 3 key),
  `core/command-engine-js/capabilityRegistry.js` (`registry.studio_one`).
- `ui/js/actionRegistry.js` (namespace `ACTIONS` dạng `DAW_PLAY`/`PRESET_NORM`)
  **KHÔNG** được đưa vào inventory này — đã xác nhận đây là hệ thống hoàn
  toàn tách biệt (renderer-side `executeAction()`, không liên quan MIDI
  Input/MIDI Learn — xem `TASK_B20_RESULT.md` mục 2, "Dual MIDI
  Architecture"). Gộp 2 hệ vào 1 capability set sẽ trộn lẫn 2 kiến trúc khác
  nhau, không đúng evidence.
- `ui/js/vocalCommandRouter.js` (Auto-Tune/SoundShifter, renderer-side Web
  MIDI output) — cũng **KHÔNG** đưa vào, cùng lý do (hệ dispatch khác, đã
  xác nhận từ B21 mục 13 "Dual MIDI Architecture").

8 capability = 5 action ID có thật trong dropdown Setup và dùng đúng
namespace hợp lệ (`daw:play`, `daw:stop`, `daw:record`, `menu:buttonA`,
`menu:buttonB`... — thực ra dropdown có `plugin:retune`/`plugin:humanize`
nữa, tổng 7 action ID dropdown hợp lệ namespace) **cộng thêm** `daw:save`
(chưa có trong dropdown, nhưng có driver một phần trong
`capabilityRegistry.js`, đưa vào theo đúng yêu cầu mục 11 đề bài).

3 action ID có thật trong dropdown nhưng dùng namespace KHÔNG hợp lệ
(`fn:autoDetect`, `preset:load`, `keymod:doTone`) bị loại khỏi capability
set — xem mục G.

## D. Backend classification

```
implemented:      3  (daw:play, daw:stop, daw:record)
pending-backend:  1  (daw:save)
blocked:          0
not-supported:    4  (menu:buttonA, menu:buttonB, plugin:retune, plugin:humanize)
```

Chi tiết + evidence từng dòng: xem `docs/d1/capability-backend-matrix.md`.

## E. MIDI bindings

```
implemented/allowed:  0
pending:               0
blocked:               0
TỔNG:                  0
```

`<bindings>` trong `midi-mapping.xml` **cố ý để rỗng hoàn toàn** — đúng
Rule M3 (`midi-mapping-rules.md`): không tự chọn CC/Note/Channel/Value để
"làm XML trông đầy đủ". Binding thật sẽ do Setup > MIDI Learn tạo ra lúc
runtime (Task B21, chưa triển khai), với `source="midi-learn"`.

## F. 4 Principles — self-audit

```
Principle 1 (Action ID độc lập MIDI):     PASS
  - 8/8 capability ID không chứa note/cc/channel/value/tên DAW cụ thể.
  - XSD enforce được phần "hình dạng + namespace" (pattern).
  - Phần "không chứa từ khoá MIDI/DAW cụ thể" (vd hậu tố "...cc30") KHÔNG
    XSD-enforceable (XML Schema regex không hỗ trợ lookahead — xác nhận
    bằng lỗi thật của xmllint khi thử, xem comment trong midi-mapping.xsd)
    -> đã ghi rõ là Semantic Validator requirement (Rule A1).

Principle 2 (Không giả định backend):     PASS
  - daw:save: capabilityRegistry.js CÓ driver (saveSong, hotkey Ctrl+S)
    nhưng ACTION_TO_CAPABILITY KHÔNG wire -> pending-backend, KHÔNG tự
    nâng lên implemented (đúng cảnh báo mục 11 đề bài).
  - menu:*, plugin:retune/humanize: 0 bằng chứng ở bất kỳ đâu -> not-supported.
  - Không capability nào được đánh dấu implemented chỉ vì có UI dropdown.

Principle 3 (Namespace daw:*/menu:*/plugin:*):  PASS (với 1 exception đã ghi rõ)
  - Cả 8 capability trong midi-mapping.xml đều đúng namespace.
  - 3 action ID thật trong UI (fn:autoDetect, preset:load, keymod:doTone)
    dùng namespace KHÔNG hợp lệ -> KHÔNG đưa vào capability set (không vi
    phạm Principle 3 bằng cách nới lỏng nó), CHỈ ghi nhận là known
    limitation (mục G) — không tự sửa UI, không tự mở rộng namespace.

Principle 4 (Capability không chứa MIDI field): PASS
  - <capability> chỉ có id/backend-status/midi-allowed/<description>.
  - XSD Capability complexType không có attribute/element MIDI nào —
    enforce được 100% bằng cấu trúc, đã test PASS thật.
```

## G. Known limitations

1. **Namespace exception (fn:/preset:/keymod:)** — xem `midi-mapping-rules.md`
   mục "Namespace exceptions". 3 action ID thật trong `ui/setup.html` không
   tương thích Principle 3, chưa có capability trong D1. Cần quyết định kiến
   trúc (đổi tên UI hoặc mở rộng namespace) — B23 không tự chọn.
2. **XSD không enforce được toàn bộ Rule A1/B2/M4/M6** — đã ghi rõ ràng giới
   hạn kỹ thuật thật (XML Schema regex không có lookahead; co-constraint
   giữa 2 attribute độc lập hoặc giữa 2 phần tử khác nhau XSD 1.0 không hỗ
   trợ tốt) — các rule này chuyển cho Semantic Validator
   (`docs/d1/semanticValidate.js`, dùng cho validation D1 artifact, KHÔNG
   phải runtime integration thật — đó là việc của B21).
3. **daw:save chỉ có 1 driver (hotkey), không có `mcu`** — khác với
   play/stop/record (có cả 2). Nếu sau này wire `ACTION_TO_CAPABILITY` cho
   `daw:save`, cần biết trước là sẽ luôn dispatch qua hotkey (Ctrl+S), không
   có đường MCU dự phòng.
4. **HARDWARE GAP không đổi** (kế thừa từ B18/B20) — `daw:play/stop/record`
   chỉ CODE VERIFIED, chưa có bằng chứng Studio One thật nhận đúng note MCU.
5. **`actionRegistry.js`/`vocalCommandRouter.js` KHÔNG nằm trong D1 này** —
   2 hệ dispatch khác (UI-trigger, renderer Web MIDI output), cố ý loại trừ
   để không trộn lẫn kiến trúc, xem mục C.

## H. Self-audit

```
No fake MIDI binding:                YES — <bindings> rỗng hoàn toàn (0 phần tử)
No invented backend:                  YES — mọi backend-status có evidence trích
                                       dẫn cụ thể trong capability-backend-matrix.md;
                                       daw:save KHÔNG bị nâng khống lên implemented
No DAW-specific Action ID:            YES — 8/8 capability ID không chứa tên DAW
                                       (không có reaper:*/studioone:*/ableton:*)
No MIDI fields in capability description: YES — <description> của cả 8 capability
                                       chỉ mô tả hành động bằng lời, không có số
                                       CC/Note/Channel nào
```

## I. Handoff

```
D1 SPECIFICATION = COMPLETE — READY FOR INDEPENDENT AUDIT
```

**Không ghi FROZEN** — đúng yêu cầu mục 14 đề bài, FROZEN chỉ được xác nhận
sau khi Claude C audit độc lập.

---

## Validation thật đã chạy (mục 15/16 đề bài)

```
Structural (well-formed):       xmllint --noout docs/d1/midi-mapping.xml
                                 → PASS
XSD:                             xmllint --noout --schema docs/d1/midi-mapping.xsd
                                 docs/d1/midi-mapping.xml → PASS
Semantic:                        node docs/d1/semanticValidate.js (qua test) → PASS

node tests/unit/D1SpecValidation.verify.js → PASS (18/18)
  TEST 1 (XML valid)                        → PASS
  TEST 2 (invalid capability-ref)           → REJECT đúng (XSD keyref)
  TEST 3 (pending backend, daw:save)        → REJECT đúng (Semantic Rule M4)
  TEST 4 (duplicate binding)                → REJECT đúng (XSD xs:unique)
  TEST 5 (runtime dispatch resolve đúng)    → PASS (CommandEngine thật,
                                                driver mcu note 0x5e đúng)
  TEST 6 (no binding, không crash)          → PASS
  TEST 7 (schemaVersion không hỗ trợ)       → REJECT đúng (Semantic Validator)
```

Full suite (`tests/unit/*.verify.js`, 33 file kể cả file mới):

```
31 PASS
2 PRE-EXISTING FAIL (ConfidenceV2.verify.js, KeyEngineAccuracyA35.verify.js —
  thuộc phạm vi Key/A35, không đổi so với B15-B22, ngoài phạm vi B23)
0 NEW FAIL
0 self-check fail (working tree không có tracked modification nào lúc chạy test)
```

## Repository / Git discipline

```
git diff --check     → (không có gì để check — 0 tracked file bị sửa,
                        chỉ có file mới)
git status --short (SAU khi viết, TRƯỚC khi commit):
  ?? docs/d1/                          (4 file kỹ thuật D1 + validator)
  ?? D1-REPORT.md
  ?? tests/unit/D1SpecValidation.verify.js
  (+ 8 file untracked cũ của B15-B22, KHÔNG thuộc phạm vi B23, không commit
   trong lần này)
```

Không có modification nào ngoài phạm vi B23 (0 file tracked bị sửa — xác
nhận bằng `git diff --stat` rỗng). Không đụng `ui/js/engines/keyEngine.js`,
`ui/js/renderer.js`, `app/main.js`, `app/preload.js`,
`core/command-engine-js/*` (chỉ **đọc** 2 file trong đó —
`commandEngine.js`, `capabilityRegistry.js`, và `runtime.js` — để lấy
evidence + chạy TEST 5, không sửa dòng nào).

---

## Output cuối

```
Claude B : Task B23

STATUS:
COMPLETE

BASE SHA:
b6a8afc7497d860b4fe67885b0b603669d305509

COMMIT SHA:
775f2dd9495b1a7df6658cf20b934897935ae317
(local commit, author "Claude B <claude-b@auto-menu-ai.local>" — đặt danh
 tính riêng, không mượn tên "Khói" dù đó là identity mặc định của các commit
 Auto-sync khác trong repo, để rõ ràng đây là commit do Claude B tạo. CHƯA
 PUSH lên origin/main — đề bài B23 không yêu cầu push, chỉ yêu cầu commit;
 để Khói/Claude C review rồi tự quyết push khi nào.)

D1 PATH:
docs/d1/

FILES CREATED:
docs/d1/midi-mapping.xml
docs/d1/midi-mapping.xsd
docs/d1/capability-backend-matrix.md
docs/d1/midi-mapping-rules.md
docs/d1/semanticValidate.js
D1-REPORT.md
tests/unit/D1SpecValidation.verify.js

CAPABILITY COUNT:
8

BACKEND MATRIX:
implemented=3, pending-backend=1, blocked=0, not-supported=4

MIDI BINDING STATUS:
0 (bindings rỗng hoàn toàn, đúng chủ đích)

XSD VALIDATION:
PASS

SEMANTIC VALIDATION:
PASS

4 PRINCIPLES:
A1 PASS (giới hạn XSD đã ghi rõ, phần còn lại chuyển Semantic Validator)
A2 PASS
A3 PASS
A4 PASS

FAKE BINDING:
NONE

FILES CHANGED:
(không có — 0 file tracked bị sửa, chỉ tạo file mới)

TESTS:
tests/unit/D1SpecValidation.verify.js — 18/18 PASS
Full suite — 31 PASS, 2 pre-existing fail (Key/A35, không đổi), 0 new fail

HANDOFF:
READY FOR CLAUDE C AUDIT
```

Không chuyển sang B21/B24 cho tới khi Claude C hoàn thành D1 audit và xác
nhận FROZEN.
