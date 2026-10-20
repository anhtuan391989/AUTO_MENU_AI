# AUTO_MENU_AI

**AUTO_MENU_AI** là ứng dụng desktop trên Windows được xây dựng bằng Electron, hướng đến việc hỗ trợ điều khiển âm thanh và DAW, theo dõi tín hiệu audio, phân tích nhạc và tự động hóa một số thao tác phục vụ workflow hát/thu âm.

> **Trạng thái dự án:** Đang phát triển và kiểm chứng. Không phải mọi chức năng đã hoàn thiện hoặc được xác nhận hoạt động trên DAW thật. Các tính năng AI, Key/Modulation, MIDI và preset cần được đánh giá bằng dữ liệu và thử nghiệm thực tế trước khi coi là đạt yêu cầu.

## Mục tiêu

- Gom các công cụ theo dõi âm thanh và điều khiển DAW vào một giao diện Menu.
- Hiển thị thông tin và trạng thái liên quan đến bài nhạc, audio và thiết bị.
- Nghiên cứu cải thiện khả năng nhận diện **Key**, phân biệt **Major/Minor**, **BPM** và phát hiện **Modulation**.
- Từng bước xây dựng điều khiển MIDI và preset theo hướng rõ ràng, có thể kiểm chứng và phù hợp với DAW.
- Hỗ trợ workflow với **Studio One / Fender Studio Pro** và **Steinberg Cubase**; khả năng tương thích cụ thể cần kiểm thử theo phiên bản và cấu hình thực tế.

## Giao diện và các khu vực chính

Tùy theo trạng thái phát triển của từng nhánh, Menu có các khu vực sau:

- **Audio monitoring:** các thanh VU MUSIC, MIC và MASTER để theo dõi mức tín hiệu.
- **Trạng thái hệ thống:** thông tin DAW, Audio Interface, Auto Tune và trạng thái cache.
- **AI music analysis:** khu vực hiển thị Key và thông tin nhận diện liên quan; độ chính xác và độ trễ vẫn cần benchmark trên các bài nhạc thực tế.
- **Preset:** giao diện hiện có các nút NORM, LOFI và RAP. Cơ chế điều khiển preset qua DAW đang được nghiên cứu; không nên hiểu việc nút sáng là bằng chứng DAW đã nhận lệnh. REMIX chưa được tích hợp thành nút/action trong Menu ở trạng thái đã kiểm tra.
- **MIDI / DAW control:** nền tảng mapping MIDI được dùng để nghiên cứu gửi lệnh tới DAW. Mapping phải được cấu hình và xác minh phù hợp với DAW; không mặc định các số CC/Note chưa được kiểm chứng.
- **FX Auto:** khu vực tự động hóa liên quan đến Send hiệu ứng. Điều khiển mức Send và Mute/Unmute kênh FX là hai cơ chế khác nhau, cần được phân biệt khi thiết kế preset.

## Trạng thái phát triển

| Hạng mục | Trạng thái |
|---|---|
| Ứng dụng desktop Electron | Có mã nguồn trong repository |
| Giao diện Menu và các chỉ báo audio | Đang phát triển |
| Phân tích Key / Major–Minor / Modulation | Đang nghiên cứu, cần benchmark thực tế |
| Độ chính xác và tốc độ AI | Chưa được coi là hoàn tất nếu chưa có kết quả kiểm thử đủ bằng chứng |
| MIDI mapping và điều khiển DAW | Có nền tảng mã; mapping và hành vi cần xác minh trên DAW thật |
| Preset NORM / LOFI / RAP | Có nút/action trong Menu; chưa có mapping mặc định được xác minh là hoạt động |
| Preset REMIX | Chưa có nút/action hoàn chỉnh trong Menu tại lần kiểm tra gần nhất |
| Studio One / Fender Studio Pro và Cubase | Cần kiểm thử riêng từng DAW và phiên bản |
| Kiểm thử end-to-end trên Windows với thiết bị audio thật | Phụ thuộc môi trường và thiết bị thực tế; không suy ra từ mô phỏng mã |

Các trạng thái trên phản ánh phạm vi đã kiểm tra, không phải cam kết rằng mọi commit mới hơn đều giữ nguyên trạng thái này. Hãy xem mã và báo cáo mới nhất trên nhánh `main` trước khi triển khai hoặc sử dụng.

## Yêu cầu môi trường

- Windows.
- Node.js và npm tương thích với phiên bản Electron được khai báo trong `package.json`.
- Thiết bị audio và DAW tương ứng nếu muốn kiểm thử luồng âm thanh hoặc điều khiển DAW thực tế.
- Cấu hình MIDI phù hợp nếu thử nghiệm điều khiển DAW qua MIDI.

## Chạy ứng dụng từ mã nguồn

1. Cài Node.js phiên bản phù hợp với dự án.
2. Clone repository và mở terminal tại thư mục dự án:

   ```bash
   git clone https://github.com/anhtuan391989/AUTO_MENU_AI.git
   cd AUTO_MENU_AI
   ```

3. Cài dependencies:

   ```bash
   npm install
   ```

4. Khởi chạy:

   ```bash
   npm start
   ```

**Lưu ý:** Đây là hướng dẫn chạy ứng dụng từ mã nguồn, không đảm bảo mọi tính năng phần cứng, audio, MIDI hoặc tích hợp DAW sẽ hoạt động nếu chưa cấu hình đúng. Hãy sao lưu cấu hình và dự án DAW trước khi thử nghiệm lệnh điều khiển.

## Quy tắc kiểm chứng và đóng góp

Dự án ưu tiên bằng chứng thực tế thay vì suy đoán:

- Phân biệt rõ kết quả đọc mã, mô phỏng/mock và kết quả chạy trên Windows/DAW thật.
- Khi tính năng chưa có dữ liệu hoặc thiết bị để xác minh, ghi rõ `BLOCKED` hoặc `UNKNOWN`; không tuyên bố đã hoàn thành.
- Không tự đặt số MIDI CC/Note hoặc phím tắt cho DAW khi chưa có căn cứ.
- Với thay đổi ảnh hưởng đến audio, MIDI, preset hoặc thuật toán AI, cần có báo cáo kiểm thử và nêu rõ giới hạn.
- Kiểm tra trạng thái mới nhất của nhánh `main` trước khi bắt đầu công việc để tránh ghi đè hoặc áp dụng lại thay đổi cũ.

## Nghiên cứu và báo cáo

Các báo cáo nghiên cứu, benchmark và bằng chứng được lưu trong repository, bao gồm những tài liệu dưới `tools/algbench/reports/` khi có. Đọc báo cáo mới nhất liên quan trước khi thay đổi thuật toán hoặc điều khiển preset.

## Bản quyền và sử dụng

Vui lòng kiểm tra giấy phép của repository và giấy phép của từng dependency hoặc tài nguyên đi kèm trước khi phân phối lại. Không giả định rằng mọi tài nguyên bên thứ ba trong repository đều có cùng giấy phép.
