# AI RULES — AUTO_MENU_AI

> Quy tắc bắt buộc cho mọi AI (Claude, ChatGPT, hoặc bất kỳ AI nào khác) làm việc trên dự án
> này. Đọc cùng với `AI_PROJECT_GUIDE.md` trước khi bắt đầu bất kỳ nhiệm vụ nào.

1. **`main` là nhánh duy nhất.** Không tạo `develop` hay bất kỳ branch nào khác cho công việc
   chính thức.
2. **Luôn pull `main` mới nhất trước khi làm:** `git checkout main` + `git pull origin main`
   (hoặc đọc trực tiếp qua GitHub API nếu không có quyền truy cập máy cục bộ) — không dựa vào
   bản nhớ/bản cache cũ của mã nguồn.
3. **Không tạo kiến trúc trùng lặp.** Trước khi tạo file/module mới, kiểm tra xem đã có file
   tương đương chưa (dự án này từng có nhiều lớp trùng lặp — xem `ARCHITECTURE.md` mục "Kiến
   trúc trùng lặp / dead code" — không lặp lại sai lầm đó).
4. **Không duplicate module.** Nếu thấy 2 file có vẻ làm cùng 1 việc, dừng lại và hỏi/báo cáo
   thay vì tạo thêm bản thứ 3.
5. **Không thay đổi UI nếu không được yêu cầu rõ ràng.** Không sửa HTML/CSS trừ khi nhiệm vụ
   nói rõ.
6. **Không thay đổi kiến trúc EventBus** (`core/events/EventBus.js`) — đây là điểm giao tiếp
   trung tâm giữa toàn bộ tầng Core, thay đổi ở đây ảnh hưởng dây chuyền tới mọi module đang
   subscribe.
7. **Luôn giữ backward compatibility.** Hệ Legacy (`vocalCommandRouter.js` + `renderer.js` gửi
   lệnh trực tiếp) đang là đường chạy thật duy nhất được người dùng tin cậy — không được làm
   hỏng đường này khi phát triển hệ Core mới, kể cả khi hệ Core đang bị lỗi/chưa hoàn thiện.
8. **Luôn chạy test liên quan trước khi báo cáo hoàn thành.** Nếu không có test cho phần vừa
   sửa, nói rõ điều đó trong báo cáo thay vì im lặng bỏ qua.
9. **Luôn cập nhật tài liệu khi trạng thái dự án thay đổi.** Sau mỗi nhiệm vụ ảnh hưởng tới
   kiến trúc/trạng thái module, cập nhật `ARCHITECTURE.md`, `KNOWN_LIMITATIONS.md`,
   `VERSION.md`, `TASKS.md`, và ghi lại vào `CHANGELOG_AI.md`.
10. **Không được đoán trạng thái mã nguồn.** Luôn đọc mã nguồn thật (qua file trên máy hoặc
    qua GitHub API) trước khi khẳng định 1 module "đã xong"/"đang chạy". Nếu không chắc, ghi
    rõ "cần xác minh thêm" thay vì khẳng định.
11. **Nếu cần thay đổi kiến trúc, phải giải thích trước và chờ xác nhận.** Không tự ý triển
    khai thay đổi kiến trúc (thêm tầng mới, đổi cách 2 module giao tiếp, đổi cấu trúc dữ liệu
    dùng chung, đổi thuật toán chốt Key/BPM/Mod) rồi mới báo cáo.
12. **Không sửa thuật toán của `keyEngine.js`, `bpmEngine.js`, `modEngine.js`** trừ khi nhiệm
    vụ yêu cầu rõ ràng và đã được xác nhận riêng — đây là phần DSP lõi đã được kiểm chứng
    hoạt động ổn định trong môi trường thật.
