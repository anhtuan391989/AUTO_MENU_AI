# AI-ALG-10R-FINAL — Import Source and Complete Reconciliation

**Kết quả: ĐỐI CHIẾU ĐÃ CHẠY TRÊN BẢNG NGUỒN THẬT (20/20 bản ghi). Benchmark vẫn `BLOCKED_NO_AUDIO` — không có accuracy nhạc thật. Không sửa KeyEngine/ModEngine/UI/ngưỡng/profile/trọng số/MIDI/FX/preset.**

## 1. Bằng chứng về bảng nguồn
| Mục | Giá trị |
|---|---|
| Tệp gốc trên GitHub | `20 bai hat .csv` (thư mục gốc repo), thêm bởi auto-sync `357cdde` (17/10/2026 18:38, +0700) |
| `origin/main` sau fetch | `357cdde`; local đã merge (behind=0) |
| Bản chuẩn trong benchmark | `tools/algbench/source/songs_20_source.csv` — chép **nguyên byte** từ tệp gốc (`cmp` giống hệt) |
| SHA-256 | `a230aa71c65badda755f97ad7b24aecaf0137f989c86394ad1dd91ea7e07888f` |
| Định dạng | CSV UTF-8, 6 cột: Tên bài · Key chuẩn đã xác minh · Kết quả Auto Key · Kết quả Menu · Link Youtube · lỗi Menu; 20 dòng dữ liệu |
Nguồn không bị sửa (kể cả typo "A# Minnor"). Lưu ý: tiêu đề cột ghi "Key chuẩn **đã xác minh**", nhưng chưa có nguồn đối chiếu độc lập ⇒ mọi nhãn giữ `UNVERIFIED_REFERENCE` (không tự nâng).

## 2. Kiểm tra bảng nguồn
20/20 bản ghi; cả 6 cột nhận diện; 0 tên trùng; 0 dòng sai số ô. Ô trống: **Link** — Phía Sau Một Cô Gái (không tạo URL); **lỗi Menu** — 17/20 bài (chỉ THƯƠNG EM, Yêu Lại Từ Đầu, họa phận ái lưu có ghi chú). "Viên Đá nhỏ": Key chuẩn = `---` (không có nhãn). Một ô không đọc được: Menu của "giả vờ thương anh được" = `A# Minnor` (typo trong nguồn).

## 3. Kết quả reconcile (dữ liệu thật)
| | Trước đồng bộ manifest | Sau |
|---|---|---|
| Bài nguồn / manifest | 20 / 14 | 20 / 20 |
| Khớp tên | 14 | 20 |
| **Thiếu trong manifest** | **6** | 0 |
| Thừa trong manifest | 0 | 0 |
| Trùng tên/ID (nguồn / manifest) | 0 / 0 | 0 / 0 |
| Lệch trường | 24 | **1** |
| Ô nguồn không đọc được | 1 | 1 |
| Thông tin | 1 | 1 |
CSV: `tools/algbench/reports/AI-ALG-10R-FINAL/diff_BEFORE_manifest_sync.csv` (32 dòng), `.../diff_AFTER_manifest_sync.csv` (3 dòng). Log: `reconcile_AFTER.log/.json`, `run_AFTER.log/.json`; manifest trước: `manifest_BEFORE.json`.

### 3.1 Sáu bài thiếu trong manifest (đã thêm, nhãn UNVERIFIED)
| Tên bài (nguồn) | track_id | Key chuẩn | Auto | Menu | split |
|---|---|---|---|---|---|
| VU QUY | vu-quy | B Minor | B minor | B Minor | dev |
| GIÁ NHƯ ANH LÀ EM | gia-nhu-anh-la-em | B Minor | B Minor | B Minor | test |
| Từng Yêu | tung-yeu | F Minor | F Minor | F Minor | test |
| Người Lạ Thoáng Qua | nguoi-la-thoang-qua | E Minor | E Minor | E Minor | dev |
| NGÀY MAI NGƯỜI TA LẤY CHỒNG | ngay-mai-nguoi-ta-lay-chong | Bb Minor (≡ A# minor) | Bb Minor | A# Minor | test |
| chờ em trong đêm | cho-em-trong-dem | A Minor | A Minor | A Minor | test |

### 3.2 Chênh lệch trường của 14 bài cũ (trước đồng bộ) và cách xử lý
| Loại | Số | Bài / trường | Xử lý |
|---|---|---|---|
| Nguồn có, manifest trống | 14 | `source_url` của 12 bài (mọi bài trừ Phía Sau Một Cô Gái và THƯƠNG EM); Viên Đá nhỏ: Auto `F# Major`, Menu `B Major` | điền từ nguồn |
| Manifest chỉ có placeholder "khớp nhãn" | 7 | Auto Key của THƯƠNG EM, Yêu Lại Từ Đầu (`D Major - Eb Major`), Mê Em, đừng quên tên anh, sau này em cưới ai, lưu niên, Đêm trắng | thay bằng giá trị nguồn; giữ chữ cũ ở `raw_earlier_report` |
| Ghi chú khác | 2 | THƯƠNG EM: nguồn "chỉ hiện listenning k hiện Key và Mod - 1p22s mới hiện Key"; Yêu Lại Từ Đầu: "lại nhầm rồi" (manifest chỉ có diễn giải trong đề) | điền nguyên văn vào `observations.menu_error_note`; ghi chú cũ giữ nguyên |
| Nguồn typo | 1 | giả vờ thương anh được, Menu: nguồn `A# Minnor`, manifest `A# minor` (theo đề AI-ALG-09) | **KHÔNG sửa**: giữ cả hai (`source_cell_raw`); còn là 1 lệch trong CSV sau |
| Link khác dạng, cùng video | 1 | THƯƠNG EM: manifest `…v=wHLNh9qFgU8`, nguồn thêm `&list=…&index=3` | thông tin, không phải lệch |
Cột **Key chuẩn** khớp 14/14 bài cũ (kể cả enharmonic `Db Major` ≡ C#, và chuyển tone `D Major - Eb Major`). Không giá trị có sẵn nào bị ghi đè.

## 4. THƯƠNG EM — 1:22 và 3:08
- **1:22 (82 s)**: nguồn ghi "chỉ hiện listenning k hiện Key và Mod – **1p22s mới hiện Key**" ⇒ thời điểm Menu **bắt đầu hiển thị Key** (độ trễ hiển thị, quan sát của người kiểm thử).
- **3:08 (188 s)**: Khói viết (AI-ALG-07): modulation D → Eb tại 03:08 ⇒ **vị trí modulation trong bài**.
- Kết luận có bằng chứng: hai đại lượng khác nhau, không loại trừ nhau. Cả hai vẫn chưa kiểm chứng độc lập (chưa có audio); **không giá trị nào dùng làm ground truth**. `data_conflicts` đổi UNRESOLVED → RESOLVED kèm lý do; giữ nguyên cả hai giá trị + nguồn. Chưa biết 1:22 tính từ đầu bài hay từ lúc bấm chạy (nguồn không nói).

## 5. Các bài đặc biệt (không nâng nhãn)
- Viên Đá nhỏ: `NO_REFERENCE` (Key chuẩn `---`), không chấm; Auto F# Major / Menu B Major chỉ để tham chiếu.
- họa phận ái lưu: E minor; Auto = Menu = E minor; ghi chú "sai tone" ⇒ `NEEDS_CLARIFICATION`.
- Chuyển tone "D Major - Eb Major" (THƯƠNG EM, Yêu Lại Từ Đầu): chỉ là nhãn người dùng; THƯƠNG EM có mốc 188 s (người dùng), Yêu Lại Từ Đầu **chưa có mốc thời gian**. Phía Sau Một Cô Gái: nguồn ghi F Minor, không nói chuyển tone; diễn biến chuyển tone chưa xác minh.
- 0 bài `VERIFIED_INDEPENDENT`; Auto Key là quan sát, không phải ground truth độc lập.

## 6. Quan sát MÔ TẢ (nhãn chưa xác minh, KHÔNG phải accuracy)
So với nhãn người dùng (19 bài có nhãn; so cả tonic và mode, relative KHÔNG tính là đúng):
| | Giống nhãn | Relative của nhãn | Khác |
|---|---|---|---|
| Auto Key | 15 (13 chính xác + 2 bài chuyển tone khớp chuỗi) | 2 (Đớn Đau Vô Cùng, Anh không tha thứ) | 2 (Anh Khác hay em khác, giả vờ thương anh được) |
| Menu | 10 | 3 (THƯƠNG EM, Yêu Lại Từ Đầu, sau này em cưới ai) | 6 (Mê Em, đừng quên tên anh, lưu niên, Đêm trắng, Anh Khác hay em khác, giả vờ thương anh được) |
Gợi ý để điều tra KHI có audio (chưa kết luận): trong 6 lỗi "khác" của Menu, 3 bài lệch đúng +7 bán cung cùng mode (Mê Em C→G, lưu niên B→F#, Đêm trắng D#→A#). Cảnh báo: nhãn do người dùng đặt, có thể được xây từ Auto Key; mẫu nhỏ; không có audio ⇒ không kết luận Menu hay Auto kém/hơn.

## 7. Benchmark
`run.js` trên manifest 20 bài: HỢP LỆ; `status=BLOCKED_NO_AUDIO`; audio=0, verified=0, evaluated=0; đủ điều kiện chấm **0/20**; 20 bài bị loại, lý do: `BLOCKED_NO_AUDIO` + `LABEL_NOT_VERIFIED` (+ `NO_REFERENCE_LABEL` Viên Đá nhỏ; `LABEL_NEEDS_CLARIFICATION` họa phận ái lưu). Chia tập (quy tắc cố định sha256(track_id)[0]%10<3 → test): dev 12 / test 8. SHA-256 audio = 0 (không tạo), segment = 0, mốc chuyển tone có bằng chứng độc lập = 0. Không chạy final test; không công bố accuracy/precision/recall/F1.

## 8. Thay đổi trong repo
| File | Thay đổi |
|---|---|
| `tools/algbench/source/songs_20_source.csv` | MỚI — bản chuẩn của bảng nguồn (nguyên byte) |
| `tools/algbench/manifest/real_music_manifest.json` | 14 → 20 bài; điền URL/Auto/Menu/ghi chú từ nguồn (chỉ bổ sung); THƯƠNG EM conflict RESOLVED |
| `tools/algbench/realbench/reconcile.js` | bí danh cột tiếng Việt thật; ô nhiều key; so URL theo video id; kiểm tra 6 trường; `--csv-out`; phân loại `kind` (lần chạy đầu bị 52 "lệch" giả do chưa nhận cột — đã sửa trước khi lấy kết quả) |
| `tools/algbench/realbench/import_source.js` | MỚI — nhập chỉ-bổ-sung, dry-run mặc định, idempotent, không VERIFIED |
| `tools/algbench/realbench/schema.js` | kiểm tra `observations.chain` |
| `tools/algbench/reports/AI-ALG-10R-FINAL.md` + `AI-ALG-10R-FINAL/*` | báo cáo, 2 CSV chênh lệch, log, JSON, manifest trước |
| `tests/unit/RealBenchA08.verify.js`, `RealBenchA10.verify.js` | cập nhật kỳ vọng theo manifest 20 bài/THƯƠNG EM; +7 nhóm test trên bảng nguồn thật và bộ nhập |
Không đụng `ui/`, KeyEngine/ModEngine, ngưỡng/profile/trọng số, MIDI, FX, preset.

## 9. Test
`node --check` (realbench + 2 test): OK. `RealBenchA10.verify.js` 18/18; `RealBenchA08.verify.js` 17/17; `git diff --check` sạch. Toàn bộ `tests/unit`: xem dòng "Toàn bộ test" trong chat. `reconcile.js` exit=1 CÓ CHỦ ĐÍCH vì còn 1 lệch (typo nguồn) — không tuyên bố khớp hoàn toàn.

## 10. Git
`origin/main` = `357cdde` (auto-sync 18:38, chứa bảng nguồn). Local đã merge `origin/main`; các commit AI-ALG-08…10R-FINAL của tôi chưa có trên origin (auto-sync của Khói chỉ nhận file được bàn giao). `git push` từ phiên này bị 403 (GitHub App của Claude chưa được cài) ⇒ **chưa push**; Khói đưa lên qua quy trình auto-push hiện có từ ZIP bàn giao. ZIP: `/tmp/claude-0/-home-claude/bf04ef9d-67c9-58e1-943d-1aa94e433ea5/scratchpad/AI-ALG-10R-FINAL.zip`.

## 11. Còn chặn / dữ liệu cần Khói
1. File audio hợp lệ từng bài + sha256.
2. Nhãn xác minh độc lập (lead sheet / người chú thích thứ hai), ranh giới đoạn key, mốc chuyển tone (đặc biệt Yêu Lại Từ Đầu, Phía Sau Một Cô Gái).
3. Xác nhận ô `A# Minnor` (giả vờ thương anh được) có phải `A# Minor`; làm rõ "sai tone" của họa phận ái lưu; "1:22" tính từ đâu.
4. Link Youtube cho Phía Sau Một Cô Gái (nếu có).

---
Claude A : Task A: AI-ALG-10R-FINAL
1. File đã sửa: tạo `tools/algbench/source/songs_20_source.csv`, `tools/algbench/realbench/import_source.js`, `tools/algbench/reports/AI-ALG-10R-FINAL.md` + thư mục `AI-ALG-10R-FINAL/` (2 CSV chênh lệch, log, JSON, manifest trước); sửa `real_music_manifest.json` (14→20 bài), `reconcile.js`, `schema.js`, `RealBenchA08/A10.verify.js`. Không sửa runtime/thuật toán.
2. Vì sao: nhận đúng bảng nguồn 20 bài, chạy reconcile thật (thiếu 6 bài, 24 lệch trường → còn 1 lệch do typo nguồn), đồng bộ manifest chỉ-bổ-sung, giữ mọi nhãn chưa xác minh, làm rõ 1:22 vs 3:08.
3. Ảnh hưởng module: không (công cụ offline + dữ liệu + test).
4. Còn lại: audio + sha256, nhãn xác minh độc lập, mốc chuyển tone, xác nhận typo/ghi chú; push lên GitHub bị 403 (cần auto-push của Khói).
