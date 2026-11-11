# CHANGELOG (AI) — AUTO_MENU_AI

> Mỗi mục thêm theo format dưới đây, mới nhất ở trên cùng. Chỉ ghi nhiệm vụ có ảnh hưởng thật
> tới mã nguồn hoặc trạng thái dự án (không ghi các lần chỉ đọc/audit không sửa gì, trừ khi
> audit đó tạo ra tài liệu mới như lần này).

```
## <ngày, YYYY-MM-DD> — <tên nhiệm vụ ngắn gọn>
- Thực hiện bởi: <Claude / ChatGPT / Developer>
- Completed: <mô tả>
- Files created: <danh sách>
- Files modified: <danh sách>
- Architecture impact: <None / mô tả>
- Verification: <đã kiểm chứng gì, bằng cách nào>
- Commit hash: <sha>
```

---

## 2026-11-11 — LICENSE-01: kích hoạt bằng key (1 key = 1 mã máy, thời hạn 3 ngày / 3 tháng / 6 tháng / 1 năm)

- Thực hiện bởi: Claude (Claude A)
- Completed: hệ thống License. Server riêng (Cloudflare Worker + D1) cấp/thu hồi/đổi máy cho key; app lấy mã máy, kích hoạt, lưu license đã
  ký Ed25519, kiểm tra lại với server mỗi 6 giờ, cho dùng offline tối đa 72 giờ, phát hiện lùi đồng hồ. Chưa kích hoạt / hết hạn / thu hồi /
  thiếu khoá công khai => `main.js` KHÔNG khởi động bất kỳ tính năng nào, chỉ hiện màn hình kích hoạt `ui/license.html`.
- Files created: `app/LicenseManager.js`, `ui/license.html`, `ui/js/licenseGate.js`, `ui/js/setupLicense.js`,
  `MENU-LICENSE-SERVER/{worker.js,schema.sql,tao-khoa.html,tao-key.html,HUONG-DAN-LICENSE.md}`,
  `tests/unit/{LicenseServer01,LicenseManager01,LicenseGate01}.verify.js`
- Files modified: `app/main.js` (khối LICENSE-01 trước `app.whenReady` + cổng đầu callback + 4 IPC `license-*` + chặn 2 khối whenReady phụ),
  `app/preload.js` (4 hàm `license*`), `ui/setup.html` (chỉ ô "License / kích hoạt": thêm id + nạp `setupLicense.js`),
  `ui/js/i18n.js` (cặp dịch cho ô License), `tests/unit/AppUpdater01.verify.js` (không còn kiểm tra chữ "Sắp ra mắt")
- Architecture impact: CÓ (đã được Developer xác nhận trước khi làm): thêm cổng license ở khởi động `main.js` + 1 server ngoài (MENU-LICENSE-SERVER,
  độc lập với server Key). Không đụng EventBus, keyEngine/bpmEngine/modEngine, giao diện Menu, CSS.
- Verification: `LicenseServer01` 40/40, `LicenseManager01` 36/36, `LicenseGate01` 32/32 (trích code thật của main.js chạy trong vm); toàn bộ
  tests/unit: không có test nào đạt trên `main` gốc mà lỗi trên bản này. Chưa chạy Electron/Cloudflare thật (cần Khói làm theo HUONG-DAN-LICENSE.md).
- Commit hash: chưa push (Khói copy vào G:\AUTO_MENU_AI và auto-sync); base `8ea56d5`

---

## 2026-07-21 — Chuẩn hoá GitHub `main` thành Single Source of Truth

- Thực hiện bởi: Claude
- Completed: Tạo bộ tài liệu chuẩn ở thư mục gốc để `main` trở thành nguồn dữ liệu duy nhất
  cho Developer/Claude/ChatGPT cùng đọc. Không sửa bất kỳ file mã nguồn sản phẩm nào.
- Files created: `AI_PROJECT_GUIDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `AI_RULES.md`,
  `DECISIONS.md`, `KNOWN_LIMITATIONS.md`, `VERSION.md`, `TASKS.md`, `CODE_STANDARDS.md`,
  `PERFORMANCE_TARGET.md`, `CHANGELOG_AI.md` (file này).
- Files modified: `README.md`.
- Architecture impact: None (chỉ tài liệu).
- Verification: Đọc trực tiếp mã nguồn thật trên `main` qua GitHub API (không dùng bản nhớ
  cache) cho các file trọng yếu: `app/main.js`, `core/ai/AIBootstrap.js`, `core/ai/AIContext.js`,
  `core/ai/workflow/TaskQueue.js`, `core/shared/ControlSource.js`, `ui/js/vocalCommandRouter.js`,
  `ui/js/renderer.js`, `package.json`, `README.md` cũ. Xác nhận bằng `node --check` rằng
  `AIBootstrap.js`/`AIContext.js`/`core/ai/kernel/*` có lỗi cú pháp thật (SyntaxError), và bằng
  `git show HEAD:<file>` rằng lỗi này đã nằm trong chính commit HEAD, không phải lỗi cục bộ.
  Trước đó cũng đã thực hiện 1 audit kỹ thuật đầy đủ (10 mục: Key Engine, Core AI Pipeline,
  TaskQueue, EventBus, Plugin Controller, Telemetry, Tests, Performance, Kiến trúc, Adaptive
  Lock) làm nền tảng nội dung cho các file tài liệu này.
- Commit hash: *(điền sau khi push xong)*

## DB-COMPETE-01 — AI tự cạnh tranh với Key Database/Server (không cần bấm Auto Detect)
- Files modified: `ui/js/renderer.js` (1 khối nhỏ trong callback `KeyEngine.detectOnce` + 1 điều kiện hiển thị dòng "AI Detect").
- Files created: `tests/unit/DbCompete01.verify.js`.
- Hành vi: bài có Key Database/Server -> vẫn hiện `ACTIVE: DATABASE - <tone>` và gửi Key đó xuống Auto-Tune; AI vẫn dò liên tục. Mỗi Key AI CHỐT được so với Database bằng luật `__aiBeatsDatabase` có sẵn (khác Key, tin cậy >= 0.85, không phải láng giềng cách 5). Đạt -> AI thay Database cho bài này. Manual vẫn cao nhất. Không ghi gì lên Key Server.
- Dòng "AI Detect" ở nguồn Database hiện LISTENING cho tới khi AI dò được thật (trước đây hiện Key hạt giống).
- Architecture impact: None (dùng đúng cơ chế `__dbBypass` có sẵn). Không đụng KeyEngine/BPM/MOD, HTML, CSS.
- Verification: `DbCompete01.verify.js` 12 PASS / 0 FAIL; 94 test có nhắc `renderer` cho kết quả y hệt trước/sau sửa.
- Commit hash: *(chưa commit — giao dạng patch)*

## DB-MATCH-STRICT-01 — Key Server chỉ khớp MỜ tên thì không dùng làm Key bài đang phát
- Files modified: `core/integration/KeyServerSync.js` (option mới `strictTitle`, 1 khối trong `lookup()`), `app/main.js` (1 dòng bật `strictTitle: true`).
- Files created: `tests/unit/KeyServerStrict01.verify.js`.
- Lỗi gốc: route `/find` của Server khớp mờ tên (>=80% số từ trùng, hoặc chứa nhau) nên các bản khác nhau của cùng 1 bài (MV / Karaoke / Lyrics, có thể khác tone) bị coi là MỘT bài -> dùng chung tone; và `submit()` bị chặn "server đã có" nên bản thứ hai không bao giờ có Key riêng.
- Hành vi mới: `/find` trả tên Server KHÁC tên đang phát (sau chuẩn hoá) -> `lookup()` trả `{found:false, similar:{key,songId,title}}`: Menu không dùng làm DATABASE, AI dò, rồi tự gửi Key riêng của bản này lên Server. Khớp đúng tên/ID, hoặc Server không trả title: giữ như cũ. Mặc định `strictTitle` tắt (tương thích ngược), chỉ main.js bật.
- Architecture impact: None (không đổi Server, UI, KeyEngine, luồng IPC). Hệ quả đã biết: bài chỉ khớp mờ phải chờ AI dò vài giây như bài mới; "Sửa Key trên Server" (keyCorrect) báo "not-on-server" với bài chỉ khớp mờ.
- Verification: `KeyServerStrict01.verify.js` 10 PASS / 0 FAIL; 58 test liên quan (KeyServerSync/main/SongDb/keyCorrect/worker) cho kết quả y hệt trước/sau sửa.
- Commit hash: *(chưa commit — giao dạng patch)*

## DB-SYNC-02 — Xoá/thêm trên Server thì data Menu (songs.json) đổi theo
- Files modified: `core/integration/SongDbServerSync.js`. Files created: `tests/unit/DbSync02.verify.js`.
- Lỗi gốc: đồng bộ chỉ THÊM, không XOÁ; còn ĐẨY ngược mọi bài máy có mà `/list` (chỉ 100 bài mới nhất) không thấy -> bài đã xoá trên Server bị Menu đẩy lên làm SỐNG LẠI, và không có cách nào xoá bài khỏi data Menu.
- Hành vi mới: bài "từ Server" (có `songId` hoặc ghi chú `nguồn: server`) mà `/list` không thấy -> hỏi Server từng bài (`/song-full?id=` rồi `/find` theo tên); CHỈ khi Server trả lời rõ là không còn -> xoá khỏi songs.json, chép sang `data/songs.removed-by-sync.json` (giữ BPM chỉ có ở máy). Lỗi mạng/5xx/Server cũ = giữ bài. Bài chỉ có ở máy (chưa có songId) vẫn đẩy lên như cũ; bài từ Server không bao giờ bị đẩy ngược.
- An toàn: mỗi lượt kiểm tối đa 30 bài; không xoá quá 50% kho trong một lượt (khi > 10 bài) -> chống Server rỗng/nhầm Server.
- Kết quả `run()` thêm `removed`, `removeBlocked`, `verifyLeft` (UI hiện tại chưa hiển thị — không đổi giao diện).
- Không đổi: ghi đè Key đã có trên máy (vẫn KHÔNG ghi đè), UI, KeyEngine, Server.
- Architecture impact: None. Verification: `DbSync02.verify.js` 15 PASS / 0 FAIL; 11 test liên quan (SongDb/KeyServerSync/songs.json) cho kết quả y hệt trước/sau.
- Commit hash: *(chưa commit — giao dạng patch)*

## DB-MATCH-ID-02 — Menu nhận biết ĐÚNG BẢN THU đang phát (không chỉ khớp tên)
- Files modified: `core/integration/KeyServerSync.js`, `core/integration/SongDbServerSync.js`, `core/reference/SongMatcher.js`, `app/main.js`.
- Files created: `core/reference/RecordingDuration.js`, `tests/unit/DbMatchId02.verify.js`.
- Lỗi gốc: Menu thấy CÙNG TÊN bài trên Server/Database là ném thẳng Key vào, dù là bản thu khác (MV / Karaoke / Lyrics / Live) thường KHÁC tone. Tên là căn cứ duy nhất; Menu không biết ID video và Server không có ca sĩ.
- Hành vi mới: so thêm ĐỘ DÀI bài. Bài đang phát (từ Windows/MPC-HC) và bản ghi (Database `durationSec`, hoặc Server `total_duration_sec`) cùng biết độ dài mà lệch > 3 giây -> coi là bản thu khác, KHÔNG dùng Key đó, AI dò, rồi Menu gửi Key riêng lên Server. Thiếu độ dài ở một bên -> giữ cách khớp theo tên như cũ (không đủ căn cứ để bác).
- Gửi Key bản thu thứ hai: nếu ID theo tên đã có bản KHÁC độ dài trên Server -> dùng ID riêng `makeSongId(title, artist, durationSec)`; không ghi đè bản kia (Server cũng chặn ghi đè bài đã có Key khi không có mật khẩu). Bộ nhớ đệm và danh sách "đã gửi" tách theo độ dài.
- Đồng bộ: kéo `tongThoiLuong` (mm:ss) từ `/list`, và học độ dài của bài ngoài `/list` qua lượt kiểm từng bài (DB-SYNC-02) -> lưu `durationSec` vào songs.json (trường mới, tuỳ chọn).
- Ngưỡng 3 giây là GIÁ TRỊ TẠM (hằng `DURATION_TOLERANCE_SEC`) — cần chỉnh theo dữ liệu thật. Hạn chế đã biết: nếu lúc bài vừa bắt đầu Windows chưa báo độ dài thì lượt đó vẫn khớp theo tên như cũ.
- Architecture impact: None (không đổi Server, UI, KeyEngine; không đổi chữ ký hàm cũ — `durationResolver` là option mới, mặc định tắt).
- Verification: `DbMatchId02.verify.js` 23 PASS / 0 FAIL; 63 test liên quan cho kết quả y hệt trước/sau sửa (các lỗi còn lại đã có sẵn trên main, vd KeyServerSyncC).
- Commit hash: *(chưa commit — giao dạng patch)*
