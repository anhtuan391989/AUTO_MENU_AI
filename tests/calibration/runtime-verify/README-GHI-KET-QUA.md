# Hướng dẫn ghi kết quả kiểm thử 13 bài (S01–S13)

**File kết quả DUY NHẤT:** `tests/calibration/runtime-verify/results.csv`
(Các file `results.csv` / `results_template.csv` ở thư mục gốc là bản CŨ — không dùng nữa, không xoá.)

Menu **không tự ghi** file này (đã kiểm tra: không có mã nào trong `app/`, `ui/`, `core/` ghi CSV; log telemetry không có BPM).
Vì vậy phải có một bước ghi sau MỖI bài.

## CÁCH NHANH NHẤT (khuyến nghị) — bấm đúp, không cần gõ lệnh
Sau mỗi bài, khi Menu đã hiện Key, **chưa chuyển sang bài khác**:
1. Bấm đúp `tests\calibration\runtime-verify\GHI-KET-QUA.bat`.
2. Nhập mã bài (S01…S13) rồi nhập BPM Menu đang hiện.
3. Công cụ tự lấy **Key, thời gian LOCK, tín hiệu** từ log mới nhất (log được ghi ngay từng dòng nên có sẵn). Nó in ra những gì đã lưu — **đối chiếu với Menu**; nếu khác thì sửa bằng lệnh `set ... --force` bên dưới.
- Phải ghi **ngay sau bài đó**: công cụ lấy *phiên cuối cùng có LOCK* của log mới nhất. Nếu đã phát bài kế tiếp thì sẽ lấy nhầm bài.
- Nếu phiên cuối không có LOCK, công cụ **không điền Key** và báo cảnh báo (không đoán).
- Tương đương dòng lệnh: `node tests\calibration\runtime-verify\record_result.js capture S01 --bpm 169`

## Cách thủ công (nếu không dùng log)
Mở cửa sổ lệnh (CMD) tại `G:\AUTO_MENU_AI` rồi làm theo.

## Mỗi bài nhạc (làm 13 lần: S01 → S13)
1. Phát bài (xem tên bài/ID trong `ground_truth.csv`), chờ Menu hiện Key/BPM.
2. Gõ (thay bằng số liệu bạn đọc được):

```
node tests\calibration\runtime-verify\record_result.js set S01 --key "A major" --bpm 169 --lock 4.4 --level yes --notes "ghi chú nếu có"
```

- `--key`  Key Menu hiển thị (ví dụ `A major`, `F# minor`, `Bb major`). Bỏ trống nếu Menu không ra Key.
- `--bpm`  BPM Menu hiển thị (log KHÔNG ghi BPM nên phải nhập tay).
- `--lock` số giây từ lúc phát đến lúc Menu khoá Key (không bắt buộc).
- `--level` `yes` nếu âm thanh vào bình thường, `no` nếu nguồn quá nhỏ / không có tín hiệu.
- `--session N` (tuỳ chọn) số thứ tự phiên trong log; xem bước "Nối với log" bên dưới.

Menu không ra gì? Vẫn ghi: `set S03 --level no --notes "không có tín hiệu"` (khác với "chưa thử").

## Kiểm tra tiến độ
```
node tests\calibration\runtime-verify\record_result.js status
```

## Chấm điểm
```
node tests\calibration\runtime-verify\score_runtime_verify.js --truth tests\calibration\runtime-verify\ground_truth.csv --results tests\calibration\runtime-verify\results.csv --out bao-cao-cham.md
```
Bài chưa ghi = "CHƯA KIỂM THỬ", không bị tính đúng hay sai.

## Nối với log (tuỳ chọn, để lấy Key/LOCK từ telemetry)
```
node tests\calibration\runtime-verify\score_runtime_verify.js --list-sessions logs\<ten-file>.jsonl
```
Log chia nhiều phiên hơn số bài (ví dụ 19 phiên cho 13 bài) nên **bạn phải tự chọn** phiên của từng bài, rồi `set S01 --session 3`.

## An toàn dữ liệu
- Ghi lại bài đã có dữ liệu sẽ bị CHẶN. Muốn sửa: thêm `--force` (bản cũ tự sao lưu thành `results.csv.bak-...`).
- Chuyển file cũ (cột tiếng Việt) sang file chuẩn, không xoá file cũ, chỉ điền hàng còn trống:
  `node tests\calibration\runtime-verify\record_result.js import-legacy results.csv`
  (Lưu ý: dữ liệu trong `results.csv` gốc hiện KHÔNG khớp đáp án, ví dụ S01; hãy xác nhận đó là số thật trước khi chuyển.)
