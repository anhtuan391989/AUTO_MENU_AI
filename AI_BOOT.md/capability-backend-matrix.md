# capability-backend-matrix.md — D1 Specification (Task B23)

Single Source of Truth cho trạng thái backend của từng capability trong
`midi-mapping.xml`. Mỗi dòng phải có **Evidence** cụ thể — không có dòng
nào được đánh dấu `implemented` chỉ vì "trông có vẻ hoạt động".

**Baseline audit**: `origin/main` SHA `b6a8afc` (Task B23).

**Cách đọc cột Evidence**: mỗi evidence trích dẫn đúng đường dẫn file +
tên hàm/biến thật, có thể tự grep lại để xác minh — không phải diễn giải
chủ quan.

---

| Capability ID | Description | Backend | Backend status | MIDI allowed? | Evidence | Notes |
|---|---|---|---|---|---|---|
| `daw:play` | Transport Play | Studio One, driver `mcu` (note `0x5e`) → fallback `hotkey` (`Space`) | **implemented** | **true** | `core/command-engine-js/runtime.js:33` (`ACTION_TO_CAPABILITY["daw:play"] = {targetId:"studio_one", action:"transportPlay"}`) + `core/command-engine-js/capabilityRegistry.js:34-38` (`registry.studio_one.actions.transportPlay`) + test thật `tests/unit/MidiLearnDispatch.verify.js` SECTION 5/7 (Task B20, PASS) | Chỉ CODE VERIFIED — chưa có bằng chứng Studio One thật nhận đúng note (HARDWARE GAP, đã ghi nhận từ B18/B20, không đổi ở B23) |
| `daw:stop` | Transport Stop | Studio One, `mcu` (note `0x5d`) → `hotkey` (`Space`) | **implemented** | **true** | `runtime.js:34` + `capabilityRegistry.js:39-42` + `MidiLearnDispatch.verify.js` SECTION 5b/7 | Cùng HARDWARE GAP như `daw:play` |
| `daw:record` | Transport Record | Studio One, `mcu` (note `0x5f`) → `hotkey` (`*`) | **implemented** | **true** | `runtime.js:35` + `capabilityRegistry.js:43-46` + `MidiLearnDispatch.verify.js` SECTION 5b/7 | Cùng HARDWARE GAP |
| `daw:save` | Save Song | Studio One, `hotkey` (`Ctrl+S`) — **DUY NHẤT driver, không có `mcu`** | **pending-backend** | **false** | `capabilityRegistry.js:57-59` (`registry.studio_one.actions.saveSong`) — driver CÓ tồn tại. NHƯNG `runtime.js` grep `ACTION_TO_CAPABILITY` → **0 kết quả** cho `"daw:save"` hay bất kỳ entry nào trỏ tới `saveSong` | Đúng cảnh báo mục 11 (đề bài B23): capabilityRegistry có, ACTION_TO_CAPABILITY chưa wire — KHÔNG được tự nâng lên implemented. Chưa có action ID nào trong dropdown Setup thật cho save. |
| `menu:buttonA` | Menu Button A | — (không có) | **not-supported** | **false** | `ui/setup.html` dòng có `<option value="menu:buttonA">` — action ID CÓ trong UI. Grep `capabilityRegistry.js` cho target `"menu"` → 0 kết quả. Grep `runtime.js:ACTION_TO_CAPABILITY` cho `"menu:buttonA"` → 0 kết quả | Capability tồn tại trong UI ≠ backend đã implemented (đúng Principle 2/mục 3 đề bài) |
| `menu:buttonB` | Menu Button B | — (không có) | **not-supported** | **false** | Cùng cách xác nhận như `menu:buttonA` — 0 kết quả cả 2 nơi | — |
| `plugin:retune` | Plugin Retune | — (không có) | **not-supported** | **false** | `ui/setup.html` có `<option value="plugin:retune">`. `capabilityRegistry.js` có `'serum'`/`'legacy-plugin-x'` nhưng đều tự nhận là **"ví dụ"** trong comment (dòng "Plugin ví dụ: có MIDI Learn nhưng không có API" / "hoàn toàn không hỗ trợ automation"), không phải cấu hình sản phẩm thật, và tên action không khớp `retune`. `ACTION_TO_CAPABILITY` không có entry | Không nhầm "có ví dụ minh hoạ trong code" với "có backend thật" |
| `plugin:humanize` | Plugin Humanize | — (không có) | **not-supported** | **false** | Cùng cách xác nhận như `plugin:retune` — 0 kết quả | — |

---

## Phân loại tổng hợp

```
implemented:      3  (daw:play, daw:stop, daw:record)
pending-backend:  1  (daw:save)
blocked:          0
not-supported:    4  (menu:buttonA, menu:buttonB, plugin:retune, plugin:humanize)
────────────────────
TỔNG:             8
```

Không có capability nào ở trạng thái `blocked` trong bản D1 này —
`blocked` (theo định nghĩa ở `midi-mapping-rules.md`) dành cho trường hợp
có backend thật nhưng bị chặn bởi 1 ràng buộc kiến trúc đã biết (ví dụ:
dispatcher thứ 2 đã bị gỡ bỏ có chủ đích ở `actionRegistry.js`, xem
`TASK_B20_RESULT.md` mục 2/7) — hiện tại không có capability nào rơi đúng
tình huống đó trong 8 capability này.

## Nguyên tắc cập nhật matrix này

Chỉ được đổi 1 dòng từ `pending-backend`/`not-supported` sang `implemented`
khi có **cả 2** bằng chứng:
1. `runtime.js:ACTION_TO_CAPABILITY` có entry trỏ đúng action ID đó tới
   1 `{targetId, action}` tồn tại thật trong `capabilityRegistry.js`.
2. Có test thật (không phải suy đoán) xác nhận dispatch đúng qua
   `CommandEngine`/`capabilityRegistry` (theo đúng mẫu
   `tests/unit/MidiLearnDispatch.verify.js` SECTION 5, Task B20).

Thiếu 1 trong 2 điều kiện trên → giữ nguyên `pending-backend`/`not-supported`,
không tự nâng cấp dù trông "có vẻ đã sẵn sàng".
