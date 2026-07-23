# AUTO MENU AI
## Project Context (Constitution)

Version: 1.0

---

# 1. MISSION

Auto Menu AI là một AI Studio Assistant dành cho Studio One.

Đây KHÔNG phải là một phần mềm điều khiển Auto-Tune.

Đây cũng KHÔNG phải là một phần mềm DJ.

Đây là một hệ thống AI phân tích âm thanh theo thời gian thực (Real-Time Music Analysis Runtime).

Mục tiêu cuối cùng là:

Nghe → Hiểu bài hát → Đưa ra quyết định → Điều khiển Plugin.

Auto-Tune chỉ là một trong những plugin mà hệ thống có thể điều khiển.

---

# 2. CORE GOALS

Thứ tự ưu tiên KHÔNG BAO GIỜ được thay đổi.

1. Detect KEY chính xác nhất.
2. Detect MOD chính xác nhất.
3. Hoạt động realtime.
4. CPU thấp.
5. RAM thấp.
6. Giao diện ổn định.
7. Tính năng mới.

Nếu có xung đột giữa tính năng và độ chính xác của KEY thì luôn ưu tiên KEY.

---

# 3. PROJECT PHILOSOPHY

Auto Menu AI không cố gắng có nhiều tính năng nhất.

Auto Menu AI cố gắng trở thành hệ thống dò Tone tốt nhất cho Studio One.

Mọi quyết định về kiến trúc đều phải phục vụ điều này.

Nếu một thay đổi làm giảm:

- độ chính xác
- tốc độ
- độ ổn định

thì thay đổi đó phải bị từ chối.

---

# 4. UI POLICY

Giao diện HTML hiện tại đã được chốt.

Không được:

- thay đổi layout
- đổi id
- đổi class
- đổi CSS Variable
- tự ý làm đẹp giao diện
- thay framework UI

Được phép:

- thêm logic
- thêm dữ liệu
- thêm animation nhỏ nếu không ảnh hưởng layout

Core phải thích nghi với UI.

UI KHÔNG phải thích nghi với Core.

---

# 5. ARCHITECTURE

Luồng hoạt động chuẩn của hệ thống.

Computer Audio

↓

Audio Capture

↓

Audio Buffer

↓

Fingerprint

↓

KEY Detection

↓

MOD Detection

↓

Song Analysis

↓

Decision

↓

Automation

↓

Drivers

↓

Plugins

↓

UI

Luồng này là kiến trúc chính thức.

Không được thay đổi nếu chưa có quyết định kiến trúc mới.

---

# 6. SINGLE SOURCE OF TRUTH

Toàn bộ hệ thống chỉ được có một nguồn dữ liệu.

SongAnalysis.

Tất cả module đều đọc SongAnalysis.

Ví dụ:

Dashboard

↓

SongAnalysis

AutoTune Driver

↓

SongAnalysis

Cache

↓

SongAnalysis

Database

↓

SongAnalysis

Không được tự tạo object KEY hoặc BPM riêng.

---

# 7. AI RESPONSIBILITY

AI KHÔNG trực tiếp phân tích Audio.

AI KHÔNG trực tiếp detect KEY.

AI KHÔNG trực tiếp detect MOD.

AI chỉ:

- đọc SongAnalysis
- đưa ra quyết định
- chọn Driver
- tối ưu workflow

---

# 8. HTML IS OFFICIAL

File HTML hiện tại là giao diện chính thức.

Claude Code không được:

- refactor HTML
- đổi layout
- thêm framework frontend
- viết lại Dashboard

Mọi thay đổi phải tương thích với HTML hiện tại.

---

# 9. PERFORMANCE TARGET

Không phát nhạc

CPU gần 0%

----------------

Đang phát

CPU mục tiêu dưới 3%

----------------

Đã cache

CPU mục tiêu dưới 1%

RAM mục tiêu

<150MB

Độ trễ càng thấp càng tốt.

---

# 10. DEVELOPMENT PRINCIPLES

Ưu tiên:

Correctness

↓

Stability

↓

Performance

↓

Maintainability

↓

New Features

Không viết code chỉ để đẹp.

Không viết code thừa.

Một file chỉ có một trách nhiệm.

---

# 11. EVENT DRIVEN

Không gọi module trực tiếp nếu có thể dùng EventBus.

Ví dụ:

AudioService

↓

publish(AUDIO_BUFFER_READY)

↓

KeyEngine

↓

publish(KEY_UPDATED)

↓

DecisionEngine

↓

DriverManager

Không tạo dependency chéo.

---

# 12. DRIVER PHILOSOPHY

AI không biết AutoTune.

AI không biết Studio One.

AI chỉ biết Driver.

Ví dụ:

Decision

↓

DriverManager

↓

AutoTuneDriver

hoặc

↓

MelodyneDriver

hoặc

↓

Future Driver

Nhờ vậy hệ thống có thể mở rộng.

---

# 13. CLAUDE CODE RESPONSIBILITIES

Claude Code là Implementation Engineer.

Claude Code phải:

✔ Viết code.
✔ Refactor nhỏ.
✔ Sửa lỗi.
✔ Tuân thủ Architecture.

Claude Code KHÔNG được:

✘ Đổi kiến trúc.
✘ Đổi UI.
✘ Đổi Folder Structure.
✘ Thêm framework.
✘ Đổi Event System.
✘ Đổi Kernel.

Nếu phát hiện vấn đề kiến trúc:

→ Ghi đề xuất.

Không tự sửa.

---

# 14. CURRENT DIRECTION

Hiện tại dự án KHÔNG tập trung vào UI.

Hiện tại dự án tập trung xây dựng Framework.

Thứ tự phát triển:

Foundation

↓

Runtime

↓

Audio Pipeline

↓

Key Engine

↓

MOD Engine

↓

Automation

↓

AI

↓

UI Integration

Không được bỏ qua các bước.

---

# 15. FINAL OBJECTIVE

Auto Menu AI phải trở thành:

Một AI Studio Assistant có khả năng:

• phân tích bài hát theo thời gian thực

• phát hiện KEY

• phát hiện MOD

• điều khiển Plugin

• hỗ trợ Studio One

• hoạt động nhanh

• hoạt động nhẹ

• hoạt động ổn định

Toàn bộ dự án phải luôn hướng tới mục tiêu này.