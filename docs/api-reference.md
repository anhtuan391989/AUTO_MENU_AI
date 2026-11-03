# Tài liệu API — AUTO_MENU_AI Key Server

Base URL: `https://menu-key-server.<tên-miền>.workers.dev`

Tất cả response đều có CORS headers (`Access-Control-Allow-Origin: *`), gọi từ MENU/browser được luôn.

---

## 1. GET /init — Tạo bảng dữ liệu

Chỉ gọi 1 lần đầu tiên. Tự động tạo 2 bảng `song_info` và `song_key_segments`.

**Response:** `{ "ok": true, "message": "Da tao bang thanh cong!" }`

---

## 2. GET / — Trang giao diện quản lý

Trả về HTML trang quản lý (tìm bài, xem tất cả bài, tra khóa tại giây).

---

## 3. POST /set-song-info — Lưu/cập nhật thông tin bài

**Body (JSON):**
```json
{
  "songId": "wHLNh9qFgU8",
  "title": "Thuong Em",
  "totalDurationSec": 290,
  "note": "ghi chu tuy chon"
}
```

**Response:** `{ "ok": true, "message": "da cap nhat thong tin" }`

---

## 4. POST /add-segment — Thêm 1 đoạn khóa

**Body (JSON):**
```json
{
  "songId": "wHLNh9qFgU8",
  "startSec": 0,
  "endSec": 185,
  "key": "D",
  "mode": "major",
  "weight": 1.0
}
```
- `mode`: `"major"` hoặc `"minor"` (bắt buộc tiếng Anh)
- `weight`: tùy chọn, mặc định 1.0

**Response:** `{ "ok": true, "message": "da them doan", "baiDaBiet": false, "segment": {...} }`

**Quy tắc (A83):**
- Bài **mới** (chưa có đoạn Key): lưu ngay, không cần mật khẩu.
- Bài **đã biết** (đã có đoạn Key quá 30 phút): thêm/sửa bằng tay cần mật khẩu quản trị — header `Authorization: Bearer <ADMIN_TOKEN>`. Thiếu → `401 can_mat_khau_admin`; sai → `401 sai_mat_khau`; server chưa cài ADMIN_TOKEN → `403`.
- Trong 30 phút đầu sau khi bài được tạo vẫn nhập tiếp các đoạn sau không cần mật khẩu.
- `key` nhập tự do (`Am`, `Eb`, `F#m`, `Bb minor`...) được chuẩn hoá về `C..B` (dấu thăng) + `major`/`minor`; không hiểu → `400 key_khong_hop_le`.
- Cùng `songId` + `startSec`: thay đoạn cũ, không nhân đôi.
- `/set-song-info` cũng cần mật khẩu với bài đã biết.

---

## 5. GET /song-full?id=VIDEO_ID — Xem đầy đủ 1 bài

**Response:**
```json
{
  "songId": "wHLNh9qFgU8",
  "thongTin": { "songId": "...", "title": "Thuong Em", "totalSec": 290 },
  "tongDoan": 2,
  "doans": [
    { "startSec": 0, "endSec": 185, "tu": "00:00", "den": "03:05", "khoa": "D", "mode": "major", "cheDo": "Truong" },
    { "startSec": 186, "endSec": 290, "tu": "03:06", "den": "04:50", "khoa": "Eb", "mode": "major", "cheDo": "Truong" }
  ],
  "chuyenTong": [
    { "timeSec": 186, "timeFormat": "03:06", "fromKey": "D", "fromMode": "major", "toKey": "Eb", "toMode": "major", "fromDisplay": "D Truong", "toDisplay": "Eb Truong" }
  ]
}
```

---

## 6. GET /key-at?id=VIDEO_ID&sec=N — Tra khóa tại giây N (Auto-Tune)

**Response (tìm thấy):**
```json
{
  "found": true,
  "giay": 200,
  "thoiGian": "03:20",
  "key": "Eb",
  "mode": "major",
  "modeDisplay": "Truong",
  "startSec": 186,
  "endSec": 290
}
```

**Response (không tìm thấy):** `{ "found": false, "giay": 200 }`

> Dành cho Auto-Tune/DAW gọi liên tục mỗi giây. Dùng `key` + `mode` (tiếng Anh) đặt trực tiếp.

---

## 7. GET /list — Danh sách tất cả bài

**Response:**
```json
{
  "tongBai": 1,
  "danhSach": [
    { "songId": "wHLNh9qFgU8", "title": "Thuong Em", "tongThoiLuong": "04:50", "soDoan": 2 }
  ]
}
```

---

## Mã lỗi

| HTTP | Nguyên nhân |
|---|---|
| 400 | Thiếu tham số bắt buộc (songId, startSec, endSec, key) |
| 404 | Đường dẫn không tồn tại |
| 500 | Lỗi server (thường do binding DB sai hoặc bảng chưa tạo) |

## [A88] Thời lượng bài hát theo ID

| Route | Quyền | Việc làm |
|---|---|---|
| `GET /song-duration?id=<ID YouTube>` | công khai | Có thời lượng trên server -> trả luôn (`source:"server"`). Chưa có -> server tự lấy từ YouTube rồi lưu (`source:"youtube"`). ID `app_xxx` không phải YouTube -> 404 `chua_co_thoi_luong`. YouTube chặn -> 502 `khong_lay_duoc_tu_youtube`. |
| `GET /song-duration?id=...&refresh=1` | mật khẩu admin nếu bài đã có thời lượng | Lấy lại từ YouTube và ghi đè. |
| `POST /set-duration` `{songId, totalDurationSec}` | thời lượng đang trống: công khai; đã có: **mật khẩu admin** | Chỉ đổi thời lượng (giữ tên + đoạn Key). Hợp lệ 1–86400 giây. |
| `POST /refresh-durations` `{limit?}` | **mật khẩu admin** | Điền thời lượng cho các bài đã có trên server mà chưa có (mặc định 10, tối đa 20 bài/lần). Trả `conLai`; gọi lại tới khi = 0. Không ghi đè thời lượng đã có. |

Mật khẩu: header `Authorization: Bearer <ADMIN_TOKEN>`.
