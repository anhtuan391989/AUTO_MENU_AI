/* ============================================================================
   I18N-01 — Ngôn ngữ giao diện: Tiếng Việt / English (Menu + Cài đặt + Bảng Hiệu Ứng).

   CÁCH HOẠT ĐỘNG (không đụng logic các module khác, không đổi HTML/bố cục ngoài 1 dòng nạp file này):
   - Bảng dịch PAIRS = [tiếng Việt, tiếng Anh, [các chuỗi gốc khác]] — mỗi chuỗi trên màn hình
     (chữ tĩnh trong HTML + chữ do JS tạo ra + hộp thoại alert/confirm/prompt) khớp 1 cặp thì được đổi sang
     ngôn ngữ đang chọn. Chuỗi có giá trị chạy thật dùng {0},{1},... (vd "Đã lưu {0} mục").
   - Chữ nào KHÔNG có trong bảng (tên bài hát, tên file, tên thiết bị, dữ liệu người dùng...) giữ nguyên.
   - Tên preset (NORM / LOFI / RAP / REMIX) KHÔNG bao giờ bị dịch vì renderer.js đọc đúng chữ đó làm logic
     (so sánh textContent). Riêng nút TUNE được dịch (TUNE ON <-> BẬT TUNE, TUNE OFF <-> TẮT TUNE): renderer.js nhận
     nút bằng data-tune-btn một lần lúc nạp, không đọc chữ để làm logic nữa.
   - Ngôn ngữ lưu ở appSettings.language ("vi" | "en", mặc định "vi") qua setSetting() — file dùng chung
     nên Menu và Cài đặt luôn cùng 1 ngôn ngữ. Đổi ở ô Language trong Cài đặt -> notifySetupChanged() ->
     Menu tự áp dụng ngay (không cần mở lại app). Bảng Hiệu Ứng cập nhật khi cửa sổ được focus.
   - Muốn thêm/sửa 1 câu: sửa cặp tương ứng trong PAIRS (hoặc thêm cặp mới). Nhãn nào không muốn dịch:
     gắn thuộc tính data-i18n-skip lên phần tử đó.
   ========================================================================== */
(function () {
    "use strict";

    var HAS_WIN = typeof window !== "undefined";
    var G = HAS_WIN ? window : globalThis;
    if (G.I18N) return;

    // [vi, en, [chuỗi gốc khác (tuỳ chọn)], 1 nếu là MẢNH ghép (code nối nhiều mảnh thành 1 câu)]
    var PAIRS = [
    ["Cấu hình: Chờ backend", "Config: Pending backend", ["Cấu hình: Pending backend"]],
    ["với minimize xuống Taskbar. DAW phải là process thật, tiếp tục mở đúng project/session, tiếp tục nhận MIDI và xử lý audio/plugin khi ở trạng thái hidden. Nút", "minimizing to the Taskbar. The DAW must be a real process that keeps the right project/session open and keeps receiving MIDI and processing audio/plugins while hidden. The"],
    ["Ẩn DAW / Hiện DAW", "Hide DAW / Show DAW"],
    ["bên dưới là chức năng thật (ẩn xuống khay thông báo cạnh đồng hồ Windows; bấm đúp hoặc chuột phải > \"Hiện DAW\" để hiện lại; thoát Menu khi DAW đang ẩn thì DAW tự hiện lại). DAW lấy từ file đã chọn ở", "button below is a real feature (hides the DAW to the notification tray next to the Windows clock; double-click or right-click > \"Show DAW\" to bring it back; quitting the Menu while the DAW is hidden shows it again automatically). The DAW comes from the file chosen in"],
    [". Các ô cấu hình dưới đây vẫn chỉ là khung, chưa có hành vi runtime.", ". The configuration fields below are still just a skeleton with no runtime behavior."],
    ["Các ô cấu hình ở trên chưa có backend nên vẫn khoá (đúng nguyên tắc A54). Ẩn/Hiện DAW đã có backend thật nên mới có nút (A105 — gộp từ tab \"Công cụ & Sửa lỗi\" cũ).", "The configuration fields above have no backend yet, so they stay locked (per rule A54). Hide/Show DAW has a real backend, so it has buttons (A105 — merged from the old \"Tools & Troubleshooting\" tab)."],
    ["Luôn ở phía trên", "Always on Top", ["Always on Top — Luôn ở phía trên"], 1],
    ["Lỗi:", "Error:", [], 1],
    ["không rõ", "unknown", [], 1],
    ["Không đọc được trạng thái", "Cannot read status", [], 1],
    ["với minimize xuống Taskbar. DAW vẫn là process thật, tiếp tục mở đúng project/session, nhận MIDI và xử lý audio/plugin khi đang ẩn. Khi ẩn, biểu tượng chấm tròn xanh hiện cạnh đồng hồ Windows: bấm đúp hoặc chuột phải > \"Hiện DAW\" để hiện lại. Thoát Menu khi DAW đang ẩn thì DAW tự hiện lại. DAW lấy từ file đã chọn ở", "minimizing to the Taskbar. The DAW stays a real process, keeps the right project/session open, receives MIDI and processes audio/plugins while hidden. When hidden, a green dot icon appears next to the Windows clock: double-click or right-click > \"Show DAW\" to bring it back. Quitting the Menu while the DAW is hidden shows it again automatically. The DAW comes from the file chosen in"],
    ["Đường dẫn & khởi động", "Paths & startup"],
    ["— tức là đã nạp xong VST và đã mở xong project (tiêu đề cửa sổ có tên project đã chọn ở", "— meaning the VSTs have loaded and the project has opened (the window title contains the project chosen in"],
    ["Mở kèm Project", "Open with Project"],
    [", DAW phản hồi, CPU thấp ổn định ~8 giây). Chưa chắc DAW xong thì KHÔNG ẩn; quá 5 phút chưa xong thì bỏ cuộc và để DAW hiện bình thường.", ", the DAW responds, and CPU stays low for ~8 seconds). If it is not certain the DAW has finished, it is NOT hidden; after 5 minutes without finishing it gives up and leaves the DAW visible."],
    ["NHẠC ({0})", "MUSIC ({0})"],
    ["HIỆU ỨNG ({0})", "EFFECTS ({0})"],
    ["KHÔNG CÓ SYSTEM AUDIO", "NO SYSTEM AUDIO"],
    ["CHƯA CẤU HÌNH", "NOT CONFIGURED"],
    ["CHƯA CHỌN", "NOT SELECTED"],
    ["CHƯA CALIBRATE", "NOT CALIBRATED"],
    ["Chưa có nguồn âm thanh", "No audio source"],
    ["Lỗi nguồn âm thanh", "Audio source error"],
    ["Không có tín hiệu âm thanh", "No audio signal"],
    ["Chọn nguồn ở Setup > Âm thanh (System Audio).", "Select a source in Setup > Audio (System Audio)."],
    ["⚠ Thiết bị đã lưu không còn", "⚠ The saved device is no longer available"],
    ["Thiết bị:", "Device:", [], 1],
    ["Chưa chọn nguồn", "No source selected"],
    ["Không dùng loopback (đang dùng thiết bị khác)", "Not using loopback (another device is in use)"],
    ["Chưa đọc được Menu chính", "Cannot read the main Menu yet"],
    ["Cửa sổ Menu chính chưa sẵn sàng.", "The main Menu window is not ready."],
    ["Đã dò:", "Detected:", [], 1],
    ["Thiếu nguồn âm thanh", "Missing audio source"],
    ["Sẵn sàng — AI đã dò được", "Ready — AI has detected"],
    ["Phiên bản: không đọc được (thiếu IPC)", "Version: cannot read (IPC missing)"],
    ["Phiên bản: không đọc được", "Version: cannot read"],
    ["Phiên bản:", "Version:", [], 1],
    ["· bản dựng", "· build", [], 1],
    ["· (không phải git repo — không cập nhật được)", "· (not a git repo — cannot update)"],
    ["❌ Thiếu kênh IPC cập nhật.", "❌ Update IPC channel missing."],
    ["Không kiểm tra được.", "Cannot check."],
    ["✅ Bạn đang dùng bản mới nhất", "✅ You are on the latest version"],
    ["🆕 Có bản mới: hơn bản hiện tại", "🆕 New version available: ahead of the current one by"],
    ["thay đổi (mới nhất", "changes (latest", [], 1],
    ["thay đổi.", "changes.", [], 1],
    ["⚠ Máy bạn có thay đổi chưa đẩy lên GitHub — nếu git từ chối, hãy chạy sync.bat trước.", "⚠ Your machine has changes not yet pushed to GitHub — if git refuses, run sync.bat first."],
    ["Cập nhật app lên bản mới nhất từ GitHub?\\nSau khi xong bạn cần khởi động lại app.", "Update the app to the latest version from GitHub?\\nAfter it finishes you need to restart the app."],
    ["Cập nhật thất bại.", "Update failed."],
    ["Đã là bản mới nhất.", "Already on the latest version."],
    ["✅ Đã tải bản mới (", "✅ New version downloaded (", [], 1],
    ["), nhưng bản này đổi thư viện: hãy đóng app, chạy 'npm install' trong thư mục app rồi mở lại. (Không khởi động lại tự động.)", "), but this version changes libraries: close the app, run 'npm install' in the app folder, then open it again. (No automatic restart.)"],
    ["✅ Đã cập nhật lên", "✅ Updated to", [], 1],
    [". Bấm nút bên dưới để khởi động lại.", ". Click the button below to restart."],
    [", DAW phản hồi, tải CPU đã ổn định ~10 giây). Chưa chắc DAW xong thì KHÔNG ẩn; quá 5 phút chưa xong thì bỏ cuộc và để DAW hiện bình thường.", ", the DAW responds, and CPU load has stabilized for ~10 seconds). If it is not certain the DAW has finished, it is NOT hidden; after 5 minutes without finishing it gives up and leaves the DAW visible."],
    ["🔄 Phiên bản / Cập nhật", "🔄 Version / Update"],
    ["🔁 Khởi động lại để dùng bản mới", "🔁 Restart to use the new version"],
    ["Cập nhật = lấy bản mới nhất của nhánh", "Update = fetch the latest version of the branch"],
    ["trên GitHub về thư mục app (cần cài git và thư mục app là bản clone từ GitHub). Git chỉ nhận bản mới khi không đè lên thay đổi chưa lưu của bạn — nếu có xung đột sẽ báo lỗi và KHÔNG ghi đè gì.", "from GitHub into the app folder (requires git, and the app folder must be a clone from GitHub). Git only accepts the new version when it does not overwrite your unsaved changes — if there is a conflict it reports an error and overwrites NOTHING."],
    ["License / kích hoạt", "License / activation"],
    ["Sắp ra mắt — chưa có hệ thống license trong project", "Coming soon — the project has no license system yet"],
    ["Đã nối IPC", "IPC connected"],
    ["Chưa có IPC", "No IPC"],
    ["Dữ liệu thật nằm ở data/songs.json. Số liệu đọc trực tiếp từ file — chưa có bài thì hiện 0, không bịa số.", "Real data lives in data/songs.json. Figures are read directly from the file — with no songs it shows 0, no made-up numbers."],
    ["{0}/{1} có Key", "{0}/{1} with Key"],
    ["{0}/{1} · TB {2}", "{0}/{1} · avg {2}"],
    ["{0}/{1} có BPM", "{0}/{1} with BPM"],
    ["Key nhiều nhất: {0} ({1} bài)", "Most common Key: {0} ({1} songs)"],
    ["Chưa có dữ liệu", "No data yet"],
    ["Lỗi: {0}", "Error: {0}"],
    ["Không đọc được dữ liệu.", "Cannot read the data."],
    ["Không thực hiện được.", "Could not complete the action."],
    ["Không kết nối được với app (thiếu IPC).", "Cannot reach the app (IPC missing)."],
    ["Đã hủy.", "Cancelled."],
    ["Đã nhập: thêm {0}, trùng {1}, lỗi {2}.", "Imported: {0} added, {1} duplicate, {2} invalid."],
    ["Đã xuất {0} bài ra file.", "Exported {0} songs to file."],
    ["Dựng lại Database? App sẽ bỏ bản ghi sai/trùng và lưu bản sao songs.json.bak.", "Rebuild the Database? The app will drop invalid/duplicate records and save a copy as songs.json.bak."],
    ["Dựng lại xong: {0} → {1} bài (bỏ {2} bản sai, {3} bản trùng).", "Rebuild done: {0} → {1} songs (removed {2} invalid, {3} duplicate)."],
    ["Dữ liệu đã sạch, không có gì cần dựng lại.", "The data is already clean, nothing to rebuild."],
    ["Đã xóa {0} mục bộ nhớ đệm.", "Cleared {0} cache items."],
    ["Không được phép", "Not allowed"],
    ["Lệnh không hợp lệ", "Invalid command"],
    ["Không đọc được file (không phải JSON hợp lệ).", "Cannot read the file (not valid JSON)."],
    ["File phải chứa một mảng (danh sách) bài hát.", "The file must contain an array (list) of songs."],
    ["{0} mục trong bộ nhớ đệm", "{0} items in cache"],
    ["ĐANG PHÁT:", "NOW PLAYING:"],
    ["Không khả dụng", "Unavailable"],
    ["NHẠC", "MUSIC"],
    ["TỔNG", "MASTER"],
    ["✨ Hỗ trợ kỹ thuật: Khói Studio | Thời hạn Key dịch vụ: Vĩnh viễn (Pro Active) | Liên hệ Zalo: 0349.644.194 ✨", "✨ Tech support: Khói Studio | Service Key validity: Lifetime (Pro Active) | Contact Zalo: 0349.644.194 ✨"],
    ["GIỜ", "TIME"],
    ["Chưa Chọn...", "Not Selected..."],
    ["CARD ÂM THANH", "AUDIO INTERFACE"],
    ["BỘ NHỚ ĐỆM", "CACHE"],
    ["Sẵn sàng", "Ready"],
    ["MỞ RỘNG", "EXPAND"],
    ["ĐANG NGHE", "LISTENING"],
    ["ĐANG DÙNG: AI DETECT", "ACTIVE: AI DETECT"],
    ["Tự dò", "Auto Detect"],
    ["AI Dò Key: ĐANG NGHE", "AI Key Detect: LISTENING"],
    ["AI Dò Key", "AI Key Detect"],
    ["GỬI", "SEND"],
    ["Độ tin cậy 98%", "Confidence 98%"],
    ["TẮT", "OFF"],
    ["ĐẶT", "SET"],
    ["⭕ TỰ DÒ", "⭕ AUTO DETECT"],
    ["🎵 NHẠC", "🎵 MUSIC"],
    ["Bảng HIỆU ỨNG Độc Lập", "Standalone EFFECT Panel", ["Bảng EFFECT Độc Lập"]],
    ["Đường dẫn âm thanh tự cài đặt sẵn trong cài đặt :", "Audio path preset in Settings :"],
    ["😂 Tiếng Cười", "😂 Laugh"],
    ["👏 Tiếng Vỗ Tay", "👏 Applause"],
    ["Luôn luôn hiển thị trên màn hình", "Always show on screen"],
    ["Xoay dọc Menu (Kiểu PDL)", "Rotate Menu vertically (PDL style)"],
    ["Cài đặt (Khóa toàn bộ)", "Settings (Lock all)"],
    ["Bảng Hiệu Ứng", "Effects Panel"],
    ["✨ Bảng Hiệu Ứng", "✨ Effects Panel"],
    ["Luôn Hiện", "Always Show"],
    ["SỬA", "EDIT"],
    ["HIỆU ỨNG", "EFFECTS"],
    ["Dừng", "Stop"],
    ["Đóng (Esc)", "Close (Esc)"],
    ["Mở Cài đặt để thêm, đổi tên, thay file", "Open Settings to add, rename, replace files"],
    ["Dừng mọi âm thanh đang phát", "Stop all playing audio"],
    ["Always on Top — Luôn ở phía trên", "Always on Top"],
    ["BẬT TUNE", "TUNE ON"],
    ["TẮT TUNE", "TUNE OFF"], // TASK VI-LABELS-01: nút TUNE đang tắt hiện "TẮT TUNE" khi ngôn ngữ Việt (renderer nhận nút bằng data-tune-btn, không còn đọc chữ)
    ["HIỆU ỨNG", "EFFECT"], // nút/nhãn EFFECT trên Menu -> "HIỆU ỨNG" khi ngôn ngữ Việt
    ["BẬT", "ON"], // chữ ON/OFF đứng một mình -> BẬT/TẮT khi ngôn ngữ Việt
    ["ÂM LƯỢNG MIC 1", "MIC 1 VOLUME"],
    ["ÂM LƯỢNG MIC 2", "MIC 2 VOLUME"],
    ["Auto bật FX khi có nhạc", "Auto-enable FX when music plays"],
    ["Tự dò bằng tay", "Manual detect (plugin)"],
    ["Dò bằng AI", "Detect with AI"],
    ["🧪 Thử bấm ngầm Auto-Key 1 (dò Key)", "🧪 Test silent click Auto-Key 1 (detect)"],
    ["🧪 Thử bấm ngầm Auto-Key 2 (Send)", "🧪 Test silent click Auto-Key 2 (Send)"],
    ["BÁN ÂM", "SEMITONES"],
    ["⚠️ Lỗi gửi Mod ({0})", "⚠️ MOD send error ({0})"],
    ["ĐANG DÙNG:", "ACTIVE:"],
    ["Tự dò · {0}", "Auto Detect · {0}"],
    ["Tự dò ({0}% tin cậy)", "Auto Detect ({0}% confidence)", ["Auto Detect ({0}% tin cậy)"]],
    ["Key Thủ Công", "Manual Key"],
    ["Key Thủ Công ({0})", "Manual Key ({0})"],
    ["Lỗi gửi Key", "Key send error"],
    ["Mic đã chọn — đang hoạt động", "Selected mic — active"],
    ["Mic mặc định hệ thống — đang hoạt động", "System default mic — active"],
    ["Đang mở mic...", "Opening mic..."],
    ["Lỗi mở mic", "Mic open error"],
    ["Mic đã chọn hiện không khả dụng", "Selected mic is currently unavailable"],
    ["Chưa khởi động mic (chưa tương tác với app)", "Mic not started (no interaction with the app yet)"],
    ["Đang tắt SoundShifter & trả quyền cho AI...", "Turning off SoundShifter & handing control back to AI..."],
    ["⚠️ Lỗi trả quyền cho AI — kiểm tra Auto-Tune/SoundShifter", "⚠️ Error handing control back to AI — check Auto-Tune/SoundShifter"],
    ["⚠️ Lỗi bật SoundShifter", "⚠️ SoundShifter enable error"],
    ["⚠️ Lỗi gửi Mod (AI)", "⚠️ MOD send error (AI)"],
    ["AI Dò Key: ĐANG NGHE", "AI Detect: LISTENING"],
    ["THỜI LƯỢNG BÀI", "SONG DURATION"],
    ["Nguồn nhạc này chưa báo thời lượng bài cho Windows", "This music source has not reported the song duration to Windows"],
    ["Thời gian bài đang phát / thời lượng", "Current song time / duration"],
    ["Đang tạm dừng", "Paused"],
    ["Chưa chọn SYSTEM_AUDIO (Setup)", "SYSTEM_AUDIO not selected (Setup)"],
    ["Lỗi thiết bị SYSTEM_AUDIO", "SYSTEM_AUDIO device error"],
    ["(không có tên)", "(no name)"],
    ["MIDI : Đã cấu hình", "MIDI : Configured"],
    ["MIDI : Chưa cấu hình", "MIDI : Not configured"],
    ["🟢 HỆ THỐNG SẴN SÀNG", "🟢 SYSTEM READY"],
    ["Trung tâm hệ thống — AUTO MENU AI", "System Center — AUTO MENU AI"],
    ["⚙ Trung tâm hệ thống", "⚙ System Center"],
    ["Hoàn thành: 0 / 10", "Completed: 0 / 10"],
    ["Bảng điều khiển", "Dashboard"],
    ["Âm thanh", "Audio"],
    ["Hiệu Ứng", "Effects"],
    ["Cơ sở dữ liệu", "Database"],
    ["Hiệu chỉnh", "Calibration"],
    ["Sao lưu", "Backup"],
    ["Hệ thống", "System"],
    ["Công cụ & Sửa lỗi", "Tools & Troubleshooting"],
    ["📊 Trạng thái hệ thống", "📊 System Status"],
    ["Đọc trực tiếp từ cấu hình đã lưu (dữ liệu thật). AI = đã chọn nguồn System Audio cho Key/BPM/Mod; Database = Key Server (Cloudflare) có trả lời hay không.", "Read directly from the saved configuration (real data). AI = System Audio source selected for Key/BPM/Mod; Database = whether the Key Server (Cloudflare) responds."],
    ["⚡ Thao tác nhanh", "⚡ Quick Actions"],
    ["💾 Lưu Preset", "💾 Save Preset"],
    ["📂 Tải Preset", "📂 Load Preset"],
    ["⌨ Phím tắt điều khiển", "⌨ Control shortcuts"],
    ["Chế độ hát thường", "Normal singing mode"],
    ["Chế độ Lofi", "Lofi mode"],
    ["Chế độ Remix", "Remix mode"],
    ["Chế độ Rap", "Rap mode"],
    ["Dò tone", "Key detect"],
    ["⟲ Xóa hết", "⟲ Clear all"],
    ["💾 Lưu", "💾 Save"],
    ["🎛 DAW ẩn", "🎛 Hidden DAW"],
    ["Chờ backend", "Pending backend"],
    ["Ẩn", "Hidden"],
    ["không đồng nghĩa", "does not mean"],
    ["với minimize xuống Taskbar. DAW phải là process thật, tiếp tục mở đúng project/session, tiếp tục nhận MIDI và xử lý audio/plugin khi ở trạng thái hidden. Backend kiểm tra process thật, System Tray/Notification Area, và Show/Hide DAW thật", "minimizing to the Taskbar. The DAW must be a real process, keep the correct project/session open, keep receiving MIDI and keep processing audio/plugins while hidden. The backend checks the real process, the System Tray/Notification Area, and a real Show/Hide DAW"],
    ["chưa tồn tại", "does not exist yet"],
    ["trong repo — khối dưới đây chỉ là khung cấu hình đúng khái niệm, chưa có hành vi runtime nào.", "in the repo — the block below is only a configuration skeleton matching the concept, with no runtime behavior yet."],
    ["Bật DAW ẩn", "Enable Hidden DAW"],
    ["Bật", "Enable"],
    ["Ứng dụng DAW", "DAW Application"],
    ["Chưa chọn", "Not selected"],
    ["Đường dẫn file chạy DAW", "DAW Executable Path"],
    ["Đường dẫn Project/Session", "Project/Session Path"],
    ["Tự mở khi khởi động", "Auto Launch on Startup"],
    ["Khởi động ở chế độ ẩn", "Start Hidden"],
    ["Chính sách vòng đời DAW", "DAW Lifecycle Policy"],
    ["Để DAW tiếp tục chạy khi đóng Menu", "Leave DAW running when Menu closes"],
    ["Chỉ đóng DAW khi được yêu cầu rõ ràng", "Close DAW only when explicitly requested"],
    ["Show DAW / Hide DAW chưa được tạo ở đây vì chưa có backend Tray/Background hỗ trợ (đúng nguyên tắc A54 — không tạo control khi chưa có implementation tương ứng).", "Show DAW / Hide DAW is not created here because there is no Tray/Background backend to support it yet (per principle A54 — no control is created without a matching implementation)."],
    ["📁 Khởi động & Đường dẫn", "📁 Startup & Paths"],
    ["Chưa cấu hình", "Not configured"],
    ["TASK A55: cấu hình bên dưới đã có backend thật (lưu qua file dùng chung", "TASK A55: the configuration below has a real backend (saved via the shared file"],
    [", ghi an toàn ở main process — xem app/main.js). Giá trị", ", written safely in the main process — see app/main.js). Values"],
    ["không", "do not"],
    ["tự ghi đè cho tới khi bấm Save,", "auto-overwrite until you click Save,"],
    ["hard-code đường dẫn của bất kỳ máy nào, và", "hard-code the path of any machine, and"],
    ["chứa password. A55 chỉ LƯU cấu hình —", "contain a password. A55 only SAVES the configuration —"],
    ["không tự khởi chạy DAW", "does not auto-launch the DAW"],
    ["dù bạn bật \"Auto Start\" hay điền path (việc khởi chạy thật thuộc task sau).", "even if you turn on \"Auto Start\" or fill in a path (actual launching belongs to a later task)."],
    ["Tự khởi động AUTO MENU AI cùng Windows", "Auto Start AUTO MENU AI cùng Windows"],
    ["Đường dẫn Project/Session của DAW", "DAW Project/Session Path"],
    ["Đường dẫn cấu hình MIDI", "MIDI Configuration Path"],
    ["Đường dẫn cấu hình âm thanh", "Audio Configuration Path"],
    ["Đường dẫn Logs / Chẩn đoán", "Logs / Diagnostics Path"],
    ["Lưu", "Save"],
    ["🧠 Cấu hình AI / Mức sẵn sàng", "🧠 AI Configuration / Readiness"],
    ["Chờ xác minh backend", "Pending backend verification"],
    ["Key / BPM / Mod được lấy từ", "Key / BPM / Mod are taken from"],
    ["Âm thanh hệ thống (WASAPI Loopback)", "System Audio (WASAPI Loopback)"],
    ["không phải Microphone", "not Microphone"],
    ["Key AI", "AI Key"],
    ["và", "and"],
    ["Key thủ công", "Manual Key"],
    ["là hai state độc lập — AI không bao giờ ghi vào Manual Key. Khu vực này chỉ hiển thị trạng thái, không có dropdown hay nút SEND nào cho Manual Key.", "are two independent states — AI never writes to Manual Key. This area only displays status; there is no dropdown or SEND button for Manual Key."],
    ["Dò Key bằng AI", "AI Key Detection"],
    ["Dò BPM", "BPM Detection"],
    ["Dò Mod", "Mod Detection"],
    ["Nguồn âm thanh", "Audio Source"],
    ["Âm thanh hệ thống / WASAPI Loopback", "System Audio / WASAPI Loopback"],
    ["Mức sẵn sàng của AI (tổng thể)", "AI Readiness (overall)"],
    ["Mức sẵn sàng: Chờ xác minh backend", "Readiness: Pending backend verification"],
    ["🤖 Lõi AI", "🤖 AI Core"],
    ["Chưa có kênh IPC — không xoá, chỉ disable", "No IPC channel yet — not removed, only disabled"],
    ["Đã nối thật cả 12 núm (lưu vào cài đặt; Menu tự đọc lại sau tối đa ~2 giây; mặc định = như cũ). Thời gian thực: tắt = dò Key 1 lần rồi dừng. Dò tức thì: tắt = bỏ đường khoá nhanh. Dò khóa: tắt = Key đã chốt đổi nhanh hơn (ít \"cứng\"). Tốc độ phản ứng: Nhanh/Trung bình/Chậm = thời gian chờ chốt Key. Ngưỡng = mức tin cậy tối thiểu để chấp nhận một Key; Độ tin cậy = mức chắc chắn cần để chốt Key (giữa thanh = 50 = mặc định). Dự đoán: tắt = không hiện Key tạm \"(đang dò...)\". Học: bật = nhớ Key AI đã chốt theo bài và hiện lại làm Key tạm lần sau (không tự gửi Plugin); Bộ nhớ = số bài nhớ tối đa. Hiệu chỉnh: mở tab Calibration. Tự áp dụng: tắt = chỉ hiển thị Key AI, không gửi Plugin. Gỡ lỗi: bật log debug ra console.", "All 12 controls are wired (saved to settings; Menu re-reads within ~2 seconds; defaults = as before). Realtime: off = detect the Key once then stop. Instant Detect: off = skip the fast lock path. Locked Detect: off = a locked Key changes faster (less \"sticky\"). Reaction Speed: Fast/Medium/Slow = how long to wait before locking a Key. Threshold = minimum confidence to accept a Key; Confidence = certainty needed to lock a Key (middle of bar = 50 = default). Prediction: off = hide the provisional \"(detecting...)\" Key. Learning: on = remember the Key the AI locked per song and show it again as a provisional Key next time (never auto-sent to the plugin); Memory = max songs remembered. Calibration: opens the Calibration tab. Auto Apply: off = only display the AI Key, do not send it to the plugin. Debug: print debug logs to the console.", ["core/ai (ConfidenceEngine, DecisionEngine, RuleEngine...) chưa expose IPC nào cho Setup đọc/ghi. Toàn bộ khối dưới đây là khung giao diện đúng khái niệm thật trong Core, để sẵn vị trí — chỉ cần nối IPC sau này, không phải sửa UI.", "Đã nối thật 4 núm: Tự áp dụng, Gỡ lỗi, Ngưỡng, Độ tin cậy (lưu vào cài đặt; Menu tự đọc lại sau tối đa ~2 giây). Ngưỡng = mức tin cậy tối thiểu để bộ dò chấp nhận một Key; Độ tin cậy = mức chắc chắn cần để chốt Key. Giữa thanh (50) = mặc định, không đổi gì. 8 núm còn lại là khung chờ — chưa có code tương ứng trong Core nên vẫn khoá.", "Đã nối thật 7 núm: Chế độ thời gian thực (tắt = dò 1 lần rồi dừng), Dò tức thì (tắt = bỏ đường khoá nhanh), Tốc độ phản ứng (Nhanh/Trung bình/Chậm = thời gian chờ chốt Key), Ngưỡng, Độ tin cậy, Tự áp dụng, Gỡ lỗi (lưu vào cài đặt; Menu tự đọc lại sau tối đa ~2 giây). Ngưỡng = mức tin cậy tối thiểu để bộ dò chấp nhận một Key; Độ tin cậy = mức chắc chắn cần để chốt Key. Mặc định (giữa thanh = 50, Trung bình, Bật) không đổi gì. 5 núm còn lại (Dò khóa, Dự đoán, Học, Bộ nhớ, Hiệu chỉnh) chưa có tính năng tương ứng trong Core nên vẫn khoá."]],
    ["Chế độ thời gian thực", "Realtime mode"],
    ["Dò tức thì", "Instant Detect"],
    ["Dò khóa", "Locked Detect"],
    ["Độ tin cậy", "Confidence"],
    ["Ngưỡng", "Threshold"],
    ["Tốc độ phản ứng", "Reaction Speed"],
    ["Trung bình", "Medium"],
    ["Nhanh", "Fast"],
    ["Chế độ Auto-Key (Plugin tự dò)", "Auto-Key mode (plugin detects)"],
    ["Chờ dò xong (giây)", "Wait for detection (seconds)"],
    ["Khi BẬT: Menu không gửi Key AI xuống Auto-Tune nữa; thay vào đó mỗi lần đổi bài / bấm AUTO DETECT, Menu bấm \"điểm dò Key\" (Auto-Key 1), chờ số giây bên dưới, rồi bấm \"Send Auto-Tune\" (Auto-Key 2). Menu vẫn hiển thị Key do AI của Menu dò (Menu không đọc được Key mà Auto-Key dò). Không chạy khi đang Dò tay hoặc bài có trong Song Database; cần bật Mouse Control và đã lấy đủ toạ độ Auto-Key 1 và 2.", "When ON: the Menu no longer sends the AI Key to Auto-Tune; instead, on every song change / AUTO DETECT press, the Menu clicks the \"detect Key point\" (Auto-Key 1), waits the seconds below, then clicks \"Send to Auto-Tune\" (Auto-Key 2). The Menu still displays the Key detected by its own AI (it cannot read the Key Auto-Key detects). Does not run while in Manual mode or when the song is in the Song Database; requires Mouse Control ON and both Auto-Key 1 and 2 coordinates captured."],
    ["Ít (20 bài)", "Few (20 songs)"],
    ["Nhiều (200 bài)", "Many (200 songs)"],
    ["Chậm", "Slow"],
    ["Dự đoán", "Prediction"],
    ["Học", "Learning"],
    ["Bộ nhớ", "Memory"],
    ["Mặc định", "Default"],
    ["Tự áp dụng", "Auto Apply"],
    ["Chạy Calibration AI", "Run AI Calibration"],
    ["Gỡ lỗi", "Debug"],
    ["Bật log debug", "Enable debug log"],
    ["🚀 Mở kèm Project / Youtube", "🚀 Open with Project / Youtube"],
    ["Mở Project", "Open Project"],
    ["Tạo bản COPY", "Make a COPY"],
    ["Mở Youtube", "Open Youtube"],
    ["Chưa chọn project", "No project selected"],
    ["Chọn PJ", "Select PJ"],
    ["Lưu PJ đang mở", "Save open PJ"],
    ["🚀 Mở kèm ngay", "🚀 Open now"],
    ["📁 Đường dẫn & khởi động", "📁 Paths & startup"],
    ["📁 Đường dẫn DAW", "📁 DAW path"],
    ["❌ Chưa thiết lập", "❌ Not set up"],
    ["📂 Chọn đường dẫn DAW", "📂 Select DAW path"],
    ["🚀 Mở DAW cùng Menu", "🚀 Open DAW with Menu"],
    ["🎙 Microphone (Thiết bị đầu vào)", "🎙 Microphone (Input Device)"],
    ["Đang hoạt động", "Active"],
    ["Chưa chọn soundcard nào", "No soundcard selected"],
    ["⚠ Chưa chọn Audio Interface", "⚠ No Audio Interface selected"],
    ["Chọn Soundcard...", "Select Soundcard..."],
    ["Chọn Soundcard", "Select Soundcard"],
    ["Xóa cảnh báo", "Clear warning"],
    ["Thật — đo trực tiếp mic đang chọn", "Live — measures the selected mic directly"],
    ["Đo mức tín hiệu micro bằng Web Audio API ngay trong Setup (không qua Engine của app) — dùng để kiểm tra nhanh mic có bắt tiếng hay không trước khi biểu diễn.", "Measures the mic signal level using the Web Audio API right inside Setup (not through the app Engine) — use it to quickly check whether the mic picks up sound before performing."],
    ["▶ Bắt đầu đo", "▶ Start measuring"],
    ["■ Dừng đo", "■ Stop measuring"],
    ["Chưa đo.", "Not measured yet."],
    ["Chưa kiểm tra tín hiệu", "Signal not checked yet"],
    ["🎤 Đầu vào MIC", "🎤 MIC Input"],
    ["Nguồn cho MIC VU", "Source for MIC VU"],
    ["Thiết bị micro thật sự được Menu dùng để đo MIC VU —", "The actual microphone device Menu uses to measure MIC VU —"],
    ["TÁCH BIỆT hoàn toàn", "completely SEPARATE"],
    ["khỏi \"Audio Interface\" ở trên (2 cấu hình độc lập, không dùng chung key). Chọn \"None\" để giữ hành vi mặc định: dùng mic mặc định của hệ điều hành.", "from \"Audio Interface\" above (2 independent configs, no shared key). Choose \"None\" to keep the default behavior: use the operating system default mic."],
    ["⚠ Dùng mic mặc định hệ thống", "⚠ Using system default mic"],
    ["— None / Dùng mic mặc định hệ thống —", "— None / Use system default mic —"],
    ["Chọn MIC Input", "Select MIC Input"],
    ["Đặt về None", "Reset to None"],
    ["Trạng thái kết nối thực tế (cập nhật trực tiếp từ cửa sổ Menu chính — chỉ có ý nghĩa khi Menu đang mở):", "Actual connection status (updated live from the main Menu window — only meaningful while Menu is open):"],
    ["🎵 Đầu vào SYSTEM_AUDIO", "🎵 SYSTEM_AUDIO Input"],
    ["Nguồn cho BPM / Key / Mod", "Source for BPM / Key / Mod"],
    ["Chọn thiết bị đầu vào mang tín hiệu nhạc/beat —", "Select the input device carrying the music/beat signal —"],
    ["khỏi Microphone ở trên (2 cấu hình độc lập, không dùng chung). Chưa chọn = BPM/Key/Mod sẽ không chạy (đúng chủ ý, không tự động dùng tạm Microphone thay thế).", "from Microphone above (2 independent configs, not shared). Not selected = BPM/Key/Mod will not run (intentional; Microphone is not used as an automatic substitute)."],
    ["⚠ Chưa chọn SYSTEM_AUDIO", "⚠ SYSTEM_AUDIO not selected"],
    ["— None / Chưa chọn thiết bị —", "— None / No device selected —"],
    ["Chọn SYSTEM_AUDIO", "Select SYSTEM_AUDIO"],
    ["Lưu ý: RUNNING chỉ xác nhận thiết bị đã mở thành công, KHÔNG đồng nghĩa đã có tín hiệu nhạc hợp lệ hay BPM đã tính được — xem A70-REPORT.md/A67-REPORT.md nếu cần kiểm chứng nội dung tín hiệu.", "Note: RUNNING only confirms the device opened successfully; it does NOT mean a valid music signal is present or BPM has been computed — see A70-REPORT.md/A67-REPORT.md if you need to verify the signal content."],
    ["🔈 Đầu ra âm thanh", "🔈 Audio Output"],
    ["Thật — setSinkId cho hiệu ứng CLAP/LAUGH", "Live — setSinkId for CLAP/LAUGH effects"],
    ["Chọn thiết bị phát cho âm thanh do", "Select the playback device for sound played by"],
    ["chính app", "the app itself"],
    ["phát (Clap/Laugh — Internal Audio Backend).", "(Clap/Laugh — Internal Audio Backend)."],
    ["KHÔNG", "DOES NOT"],
    ["điều khiển đường phát của DAW/nhạc,", "control the playback path of the DAW/music,"],
    ["đổi output mặc định của Windows, không đụng Speakers 01. \"None\" = dùng output mặc định của hệ điều hành.", "change the Windows default output, or touch Speakers 01. \"None\" = use the operating system default output."],
    ["⚠ Dùng output mặc định hệ thống", "⚠ Using system default output"],
    ["— None / Output mặc định hệ thống —", "— None / System default output —"],
    ["Chọn Audio Output", "Select Audio Output"],
    ["Kết quả áp dụng THẬT (setSinkId, báo về từ cửa sổ Menu — chỉ có ý nghĩa khi Menu đang mở):", "ACTUAL applied result (setSinkId, reported from the Menu window — only meaningful while Menu is open):"],
    ["CHƯA XÁC NHẬN", "UNCONFIRMED"],
    ["Lưu ý: APPLIED chỉ xác nhận trình phát của app đã nhận thiết bị này. Việc âm thanh thực sự phát ra đúng loa vật lý cần nghe kiểm tra trên máy thật.", "Note: APPLIED only confirms the app player has received this device. Whether sound actually comes out of the correct physical speaker must be verified by listening on the real machine."],
    ["Chưa có Engine", "No engine yet"],
    ["Tần số lấy mẫu", "Sample Rate"],
    ["Kích thước bộ đệm", "Buffer size"],
    ["Độ trễ", "Latency"],
    ["— chưa đo được", "— not measurable yet"],
    ["Kiểm tra âm thanh", "Audio Test"],
    ["▶ Thử", "▶ Test"],
    ["Chạy Calibration Audio", "Run Audio Calibration"],
    ["MIDI là phương thức điều khiển DAW/Plugin CHÍNH của AUTO MENU AI.", "MIDI is the MAIN way AUTO MENU AI controls the DAW/Plugin."],
    ["Chuột (mục Calibration) chỉ là phương án dự phòng khi một DAW/plugin cụ thể chưa hỗ trợ MIDI, phím tắt hoặc API.", "The mouse (Calibration section) is only a fallback when a specific DAW/plugin does not yet support MIDI, hotkeys or an API."],
    ["🎹 Thiết bị / Output / Kênh / Clock", "🎹 Device / Output / Channel / Clock"],
    ["Chọn cổng MIDI ảo (vd tạo bằng loopMIDI)", "Select a virtual MIDI port (e.g. created with loopMIDI)"],
    ["Chọn cổng MIDI...", "Select MIDI port..."],
    ["🔄 Làm mới / Kết nối lại", "🔄 Refresh / Reconnect"],
    ["⚡ Tự kết nối (AUTO MENU AI)", "⚡ Auto Connect (AUTO MENU AI)"],
    ["🎹 Cài loopMIDI (Virtual Port)", "🎹 Install loopMIDI (Virtual Port)"],
    ["💾 Lưu cổng MIDI", "💾 Save MIDI port"],
    ["🧪 Verify (loopback thật)", "🧪 Verify (real loopback)"],
    ["Status: chưa chọn cổng.", "Status: no port selected."],
    ["Verification: chưa chạy.", "Verification: not run yet."],
    ["Kênh (Input)", "Channel (Input)"],
    ["Tất cả (Omni)", "All (Omni)"],
    ["Sắp ra mắt", "Coming Soon"],
    ["Thật — Web MIDI API", "Live — Web MIDI API"],
    ["Phát hiện thiết bị Input thật đang cắm, trạng thái Connected/Disconnected đọc trực tiếp từ hệ thống (", "Detects real Input devices currently plugged in; the Connected/Disconnected state is read directly from the system ("],
    ["), tự cập nhật khi cắm/rút dây (", "), updates automatically when cables are plugged/unplugged ("],
    ["Chọn cổng MIDI Input...", "Select MIDI Input port..."],
    ["Đang dò MIDI Input...", "Detecting MIDI Input..."],
    ["Thật — đọc tín hiệu Input thật", "Live — reads real Input signals"],
    ["Bấm Learn rồi xoay Knob / bấm phím trên controller — hệ thống đọc đúng Note/CC/Channel/Value thật gửi về.", "Press Learn, then turn a Knob / press a key on the controller — the system reads the real Note/CC/Channel/Value sent back."],
    ["Lưu Mapping chỉ LƯU trigger → tên action", "Save Mapping only SAVES the trigger → action name"],
    [", chưa THỰC THI hành động thật (xem ghi chú Command Engine ở mục DAW).", ", it does not yet actually EXECUTE the action (see the Command Engine note in the DAW section)."],
    ["✖ Hủy", "✖ Cancel"],
    ["⟲ Xóa", "⟲ Clear"],
    ["Chưa Learn.", "Not learned yet."],
    ["Gán vào Action", "Assign to Action"],
    ["Chọn nhóm action...", "Select action group..."],
    ["Nút A", "Button A"],
    ["Nút B", "Button B"],
    ["Tải Preset", "Load Preset"],
    ["Dò Tone", "Detect Tone"],
    ["Phát", "Play"],
    ["Ghi", "Record"],
    ["💾 Lưu Mapping", "💾 Save Mapping"],
    ["📋 Mapping đã lưu", "📋 Saved Mappings"],
    ["Thật — đọc/ghi settings thật", "Live — reads/writes real settings"],
    ["Chưa có Mapping nào được lưu.", "No Mapping has been saved yet."],
    ["🧪 Thử & Giám sát", "🧪 Test & Monitor"],
    ["Realtime — echo lệnh vừa gửi", "Realtime — echoes the command just sent"],
    ["Gửi Note", "Send Note"],
    ["CC / Giá trị", "CC / Value"],
    ["Gửi CC", "Send CC"],
    ["Chưa có tín hiệu nào được gửi.", "No signal has been sent yet."],
    ["Chỉ NOTE ON và CC có nút gửi thật ở trên (echo thật khi bấm). Pitch Bend / Program Change chưa có hàm gửi trong", "Only NOTE ON and CC have real send buttons above (real echo when pressed). Pitch Bend / Program Change have no send function yet in"],
    ["— đặt vị trí, chưa hoạt động.", "— placeholders only, not functional yet."],
    ["MIDI Learn (mục lưu trữ cũ)", "MIDI Learn (old archived section)"],
    ["Đã gộp vào panel \"MIDI Learn\" phía trên", "Merged into the \"MIDI Learn\" panel above"],
    ["A29 — text cũ ở đây ghi \"chưa có Engine Input\" ĐÃ LỖI THỜI: từ Task A26, Setup đã có Driver lắng nghe MIDI Input thật (Web MIDI API), đọc đúng Note/CC/Channel/Value khi xoay Knob — xem panel \"🎯 MIDI Learn\" ngay phía trên (badge \"Thật — đọc tín hiệu Input thật\"), đó là nơi duy nhất còn hoạt động. Nút bên dưới đây chưa từng được nối vào bất kỳ handler nào (không có id, không được backend dùng) nên giữ nguyên trạng thái disabled, không tự bật lên giả PASS — chỉ sửa lại text cho đúng sự thật, không xoá control.", "A29 — the old text here saying \"no Input Engine yet\" is OUTDATED: since Task A26, Setup has a Driver that listens to real MIDI Input (Web MIDI API) and reads the exact Note/CC/Channel/Value when a Knob is turned — see the \"🎯 MIDI Learn\" panel right above (badge \"Live — reads real Input signals\"), which is the only place still working. The button below was never wired to any handler (it has no id and is not used by the backend), so it stays disabled and does not fake a PASS — only the text was corrected to match reality, the control was not removed."],
    ["🎯 (Đã thay thế bởi panel phía trên)", "🎯 (Replaced by the panel above)"],
    ["Chọn DAW ở mục \"Thiết lập AutoMenu\" trước. Bấm \"Capture toạ độ\" rồi click đúng vị trí nút tương ứng trên DAW — AUTO_MENU_AI sẽ tự click lại đúng chỗ đó khi có nơi gọi", "Select a DAW in the \"AutoMenu Setup\" section first. Click \"Capture position\", then click the exact spot of the matching button on the DAW — AUTO_MENU_AI will click that same spot again whenever something calls"],
    ["trực tiếp (vd nút bấm ở menu chính, nếu có ở phase sau). Đây là lối dự phòng bằng CHUỘT,", "directly (e.g. a button in the main menu, if added in a later phase). This is a MOUSE fallback,"],
    ["độc lập", "independent of"],
    ["với đường MIDI Input → Studio One Transport đã có sẵn ở mục \"MIDI Input\"/\"Sơ đồ nhóm Mapping\" phía trên (đường đó không đi qua Capture toạ độ này). Nếu đã cấu hình MIDI Output riêng cho action này (chưa có UI ở bản này), MIDI sẽ được ưu tiên dùng trước, chuột chỉ là dự phòng.", "the MIDI Input → Studio One Transport path already available in the \"MIDI Input\"/\"Mapping Groups Overview\" sections above (that path does not go through this Capture position). If a separate MIDI Output has been configured for this action (no UI for it in this version yet), MIDI is used first and the mouse is only a fallback."],
    ["Công tắc bật/tắt tính năng click chuột này (Mouse Control) đã được chuyển sang mục \"Calibration\"", "The on/off switch for this mouse-click feature (Mouse Control) has been moved to the \"Calibration\" section"],
    ["(A29) — vì đó là nơi quản lý toạ độ/click point, không còn nằm ở mục MIDI.", "(A29) — because that is where coordinates/click points are managed, so it no longer lives in the MIDI section."],
    ["🎯 Capture toạ độ", "🎯 Capture position"],
    ["Chưa capture toạ độ nào.", "No position captured yet."],
    ["Chưa chọn DAW", "No DAW selected"],
    ["Gửi CC/Note MIDI Output ra DAW khi bấm nút UI trong menu chính (qua", "Sends CC/Note MIDI Output to the DAW when a UI button in the main menu is pressed (via"],
    ["khác", "different"],
    ["với MIDI Input ở trên (điều khiển NGƯỢC LẠI, từ controller vào app). Mapping lưu riêng theo từng DAW, đổi DAW không mất mapping DAW khác.", "from the MIDI Input above (the REVERSE direction, from the controller into the app). Mappings are saved separately per DAW; switching DAW does not lose another DAW's mappings."],
    ["📋 Mapping Overview (DAW đang chọn)", "📋 Mapping Overview (selected DAW)"],
    ["Sơ đồ nhóm Mapping (khái niệm)", "Mapping Groups Overview (concept)"],
    ["Chỉ nhóm \"DAW Control: Play/Stop/Record\" đã nối thật", "Only the \"DAW Control: Play/Stop/Record\" group is truly wired"],
    ["Mapping thật (Learn + Lưu +", "Real mapping (Learn + Save +"],
    ["dispatch thật tới Studio One", "real dispatch to Studio One"],
    ["qua Command Engine) đã có ở Mapping đã lưu bên trên, nhưng chỉ 3 action", "via Command Engine) already exists in the Saved Mappings above, but only 3 actions"],
    ["có capability thật trong", "have a real capability in"],
    ["(nối thật qua", "(truly wired via"],
    ["ở main process — xem panel \"Command Engine\" ở tab Chọn DAW để biết trạng thái test). Các nhóm còn lại (Menu/Preset/Key-Mod/Plugin) vẫn Learn+Save được nhưng KHÔNG dispatch — bảng dưới chỉ minh hoạ khái niệm.", "in the main process — see the \"Command Engine\" panel in the Select DAW tab for test status). The remaining groups (Menu/Preset/Key-Mod/Plugin) can still be Learned+Saved but are NOT dispatched — the table below only illustrates the concept."],
    ["Task B bổ sung thêm", "Task B additionally adds"],
    ["(không thay thế đường trên): mục \"DAW Action Mapping\" phía trên dùng", "(does not replace the path above): the \"DAW Action Mapping\" section above uses"],
    ["làm lối gọi TRỰC TIẾP (vd nút UI trong menu chính) với chuột làm dự phòng khi chưa cấu hình MIDI Output cho action đó — độc lập hoàn toàn với đường MIDI Input ở trên, không tranh chấp (không có 2 dispatcher cùng nghe 1 mapping — đã audit kỹ, xem báo cáo Task B2).", "as a DIRECT call path (e.g. UI buttons in the main menu), with the mouse as a fallback when no MIDI Output is configured for that action — completely independent of the MIDI Input path above, with no conflict (no 2 dispatchers listen to the same mapping — carefully audited, see the Task B2 report)."],
    ["Chưa gán", "Unassigned"],
    ["Nút A / Nút B", "Button A / Button B"],
    ["Phát / Dừng / Ghi", "Play / Stop / Record"],
    ["Hoàn tác / Làm lại / Marker", "Undo / Redo / Marker"],
    ["Lặp / Metronome", "Loop / Metronome"],
    ["Chưa có Engine thực thi chuỗi action", "No Engine to execute action chains yet"],
    ["1 MIDI → nhiều Action nối tiếp (Action 1 → Action 2 → Action 3). Command Engine hiện chỉ dispatch 1 action/lần (không có khái niệm chuỗi) — cần thêm logic riêng, giới hạn rõ số bước tối đa (đề xuất ≤5 action/macro) để tránh loop. Chưa làm ở task này vì Transport đơn lẻ (Mục 8) phải ổn định trước.", "1 MIDI → multiple Actions in sequence (Action 1 → Action 2 → Action 3). The Command Engine currently dispatches only 1 action at a time (no concept of chains) — separate logic is needed, with a clearly limited maximum number of steps (suggested ≤5 actions/macro) to avoid loops. Not done in this task because single Transport (Section 8) must be stable first."],
    ["Bộ điều khiển", "Controller"],
    ["⚡ Ưu tiên MIDI", "⚡ MIDI Priority"],
    ["Thời gian thực", "Realtime"],
    ["Độ trễ cực thấp", "Ultra Low Latency"],
    ["Không đệm", "No Buffer"],
    ["Không xếp hàng", "No Queue"],
    ["Triết lý hệ thống: mọi lệnh MIDI gửi thẳng ra Output ngay khi bấm, không xếp hàng, không đệm — đúng cách", "System philosophy: every MIDI command is sent straight to Output the moment it is pressed, with no queue and no buffer — exactly how"],
    ["đang hoạt động (thông tin mô tả, không phải công tắc bật/tắt).", "are working (descriptive information, not an on/off switch)."],
    ["🎹 Điều khiển DAW theo thời gian thực (Transport/Mixer/Automation...) nên cấu hình ở mục", "🎹 Real-time DAW control (Transport/Mixer/Automation...) should be configured in the"],
    [". Các mục dưới đây chỉ là lựa chọn DAW đang dùng. (Đường dẫn DAW & khởi động cùng Menu đã chuyển sang mục", ". The sections below only select the DAW in use. (The DAW path & start-with-Menu have moved to the"],
    ["Đã nối Transport — chưa test phần cứng/DAW thật", "Transport wired — not yet tested on real hardware/DAW"],
    ["không viết lại", "not rewritten"],
    [", chỉ wire) nay đã được khởi tạo thật trong", ", only wired) is now actually initialized in"],
    ["lúc app khởi động, đăng ký", "when the app starts, registering"],
    ["— đúng tên driver", "— the exact driver name"],
    ["khai báo trong registry, đã vá 1 dòng vì registry dùng", "declared in the registry, patched with 1 line because the registry uses"],
    ["còn driver gốc chỉ đăng ký tên", "while the original driver only registers the name"],
    ["). MIDI Input thật (Node,", "). Real MIDI Input (Node,"],
    [") đọc đúng cổng đã chọn ở mục MIDI, tra Mapping đã Learn+Save theo O(1), gọi thẳng", ") reads the exact port selected in the MIDI section, looks up the Learned+Saved Mapping in O(1), and directly calls"],
    ["khi khớp CC/Note —", "when CC/Note matches —"],
    ["chỉ nhóm Transport", "only the Transport group"],
    [", đúng thứ tự ưu tiên \"Studio One trước, Transport trước\".", ", following the priority order \"Studio One first, Transport first\"."],
    ["✅ Đã test được (static, trong sandbox không có ALSA/MIDI subsystem): khởi động không crash, tự fallback đúng thứ tự", "✅ Tested (static, in a sandbox without ALSA/MIDI subsystem): startup does not crash, falls back automatically in the correct order"],
    [", không báo \"thành công\" giả khi driver thật sự thất bại, mapping cũ dạng chuỗi (không có type/channel/number) bị bỏ qua an toàn.", ", does not report a fake \"success\" when the driver really fails, and old string-style mappings (without type/channel/number) are safely ignored."],
    ["Chưa test được", "Not yet tested"],
    [": cắm controller MIDI thật, mở Studio One thật, xác nhận transportPlay/Stop/Record thật sự chạy — không được gọi READY cho tới khi có kết quả này.", ": plug in a real MIDI controller, open real Studio One, and confirm transportPlay/Stop/Record really run — it must not be called READY until this result exists."],
    ["🎛 DAW đang dùng", "🎛 DAW in use"],
    ["Đã cấu hình", "Configured"],
    ["Studio One / Cubase (chọn phiên bản)", "Studio One / Cubase (select version)"],
    ["💾 Lưu DAW:", "💾 Save DAW:"],
    ["· Trạng thái:", "· Status:"],
    ["(không phải health-check) · Driver:", "(not a health check) · Driver:"],
    ["MIDI/MCU → Hotkey dự phòng", "MIDI/MCU → Hotkey fallback"],
    ["(Transport only, chưa test phần cứng)", "(Transport only, hardware not tested yet)"],
    ["(thư mục khác, cũ) chỉ có", "(another, older folder) contains only"],
    ["— KHÔNG liên quan tới", "— NOT related to"],
    ["ở trên. Cubase trong danh sách chỉ dùng để chọn hồ sơ toạ độ/phím tắt, chưa có driver điều khiển riêng trong cả 2 thư mục.", "above. Cubase in the list is only used to pick a coordinate/hotkey profile; neither folder has a dedicated control driver for it yet."],
    ["💾 Lưu Auto-Key:", "💾 Save Auto-Key:"],
    ["⚙ Cài đặt jBridge cho Studio One", "⚙ jBridge Settings for Studio One"],
    ["🕑 DAW khác", "🕑 Other DAWs"],
    ["Vị trí đã đặt sẵn — chỉ cần bổ sung Driver, không cần sửa UI này.", "Slot reserved — just add a Driver, no need to change this UI."],
    ["Hồ sơ toạ độ có sẵn ở trên — chưa có Driver điều khiển", "Coordinate profile available above — no control Driver yet"],
    ["🎧 Quản lý Bảng Hiệu Ứng", "🎧 Manage Effects Board"],
    ["Thêm, đổi tên, thay file âm thanh hoặc xoá nút. Bảng Hiệu Ứng trên menu tự cập nhật ngay. Nhận file mp3, wav, ogg, m4a — file được sao chép vào ứng dụng nên không mất khi bạn xoá file gốc.", "Add, rename, replace the audio file or delete buttons. The Effects board on the menu updates instantly. Accepts mp3, wav, ogg, m4a files — files are copied into the app, so nothing is lost if you delete the original."],
    ["➕ Thêm vào HIỆU ỨNG", "➕ Add to EFFECTS"],
    ["➕ Thêm vào NHẠC", "➕ Add to MUSIC"],
    ["⟲ Khôi phục mặc định", "⟲ Restore defaults"],
    ["🎙 Giọng hát", "🎙 Vocals"],
    ["💾 Lưu Auto-Tune:", "💾 Save Auto-Tune:"],
    ["⚙ Cài bộ Plugin Auto-Tune 11", "⚙ Install Auto-Tune 11 Plugin Pack"],
    ["Cấu hình khả dụng", "Available configuration"],
    ["Cách thức tạo bè", "Harmony method"],
    ["🎹 Plugin Auto-Tune 11", "🎹 Auto-Tune 11 Plugin"],
    ["⚙ Track \"Bè\" riêng", "⚙ Separate \"Harmony\" track"],
    ["💾 Lưu cách tạo bè", "💾 Save harmony method"],
    ["Phương thức fix méo", "Pitch-fix method"],
    ["☲ Chuyển Tone", "☲ Transpose"],
    ["💾 Lưu cách fix méo", "💾 Save pitch-fix method"],
    ["Cài đặt khả dụng — chưa nối Mapping", "Setup available — Mapping not connected yet"],
    ["⚙ Cài đặt Plugins VST2", "⚙ VST2 Plugins Setup"],
    ["Installer thật (tải & cài bundle), nhưng plugin cài xong chưa được điều khiển qua MIDI Mapping như Auto-Tune.", "Real installer (downloads & installs the bundle), but once installed the plugins are not yet controlled via MIDI Mapping like Auto-Tune."],
    ["— (điều khiển thô qua MIDI CC, xem mục MIDI)", "— (raw control via MIDI CC, see the MIDI section)"],
    ["Chưa có IPC", "No IPC yet"],
    ["Dữ liệu tồn tại thật ở", "Data really exists at"],
    [", nhưng Setup chưa có kênh đọc/ghi. Không bịa số — mọi ô hiện \"—\" cho tới khi có IPC thật.", ", but Setup has no read/write channel yet. No made-up numbers — every field shows \"—\" until a real IPC exists."],
    ["Bài hát", "Songs"],
    ["Ca sĩ", "Artists"],
    ["Bộ nhớ đệm", "Cache"],
    ["Thống kê", "Statistics"],
    ["📥 Nhập", "📥 Import"],
    ["📤 Xuất", "📤 Export"],
    ["🔁 Dựng lại", "🔁 Rebuild"],
    ["🧹 Xóa đệm", "🧹 Cache"],
    ["Calibration (chuột) là phương án DỰ PHÒNG", "Calibration (mouse) is a FALLBACK option"],
    ["— chỉ dùng khi DAW/plugin cụ thể chưa hỗ trợ MIDI, phím tắt hoặc API. Ưu tiên cấu hình ở mục", "— use only when a specific DAW/plugin does not yet support MIDI, hotkeys or an API. Prefer configuring in the"],
    ["trước. Không popup.", "section first. No popups."],
    ["Công tắc này CHỈ áp dụng cho \"DAW Action Mapping\" ở mục", "This switch applies ONLY to \"DAW Action Mapping\" in the"],
    ["(Play/Stop/ Record bằng cách tự click chuột theo toạ độ đã capture bên dưới).", "section (Play/Stop/Record by auto-clicking the mouse at the coordinates captured below)."],
    ["Không ảnh hưởng", "Does not affect"],
    ["tới đường click chuột dự phòng sẵn có của Auto-Tune/Key/Manual (đường đó độc lập hoàn toàn, luôn hoạt động bất kể công tắc này ON hay OFF).", "the existing fallback mouse-click path of Auto-Tune/Key/Manual (that path is fully independent and always works whether this switch is ON or OFF)."],
    ["Tắt Mouse Control", "Turn off Mouse Control"],
    ["⏳ Đang dò AutoHotkey...", "⏳ Detecting AutoHotkey..."],
    ["📥 Tải & Cài AutoHotkey", "📥 Download & Install AutoHotkey"],
    ["📂 Chọn đường dẫn AutoHotkey (nếu đã cài sẵn)", "📂 Select AutoHotkey path (if already installed)"],
    ["✢ Lấy tọa độ Auto-Key (2 điểm)", "✢ Capture Auto-Key coordinates (2 points)"],
    ["✢ Lấy tọa độ Auto-Key 2 (2 điểm)", "✢ Capture Auto-Key 2 coordinates (2 points)"],
    ["✢ Lấy tọa độ Key Auto-Tune (1 điểm)", "✢ Capture Auto-Tune Key coordinates (1 point)"],
    ["✢ Lấy tọa độ Chromatic (2 điểm)", "✢ Capture Chromatic coordinates (2 points)"],
    ["ℹ️ SoundShifter điều khiển bằng MIDI (không cần lấy tọa độ chuột). Trạng thái:", "ℹ️ SoundShifter is controlled via MIDI (no mouse coordinates needed). Status:"],
    ["Chưa hiệu chỉnh", "Not calibrated"],
    ["(chưa có toạ độ nào) →", "(no coordinates yet) →"],
    ["Một phần", "Partial"],
    ["(thiếu một số toạ độ) →", "(some coordinates missing) →"],
    ["Đã hiệu chỉnh", "Calibrated"],
    ["(đủ 4 toạ độ đã lưu). \"Verified\" cần Engine xác minh lại — chưa có, không tự gắn nhãn Verified.", "(all 4 coordinates saved). \"Verified\" requires an Engine to re-verify — none yet, so the Verified label is never set automatically."],
    ["Độ phân giải / Tỉ lệ / Xác minh / Xác minh Plugin / Kiểm tra", "Resolution / Scaling / Verify / Plugin Verify / Test"],
    ["Chưa có Engine kiểm tra lại toạ độ đã capture, phát hiện đổi độ phân giải/tỉ lệ màn hình, hay xác minh plugin đúng vị trí. Vị trí đặt sẵn, chỉ cần bổ sung Engine.", "No Engine yet to re-check captured coordinates, detect screen resolution/scaling changes, or verify the plugin is at the right position. Slot reserved — just add an Engine."],
    ["🙈 Ẩn DAW xuống khay thông báo", "🙈 Hide DAW to the system tray"],
    ["Ẩn cửa sổ DAW đang chạy (không còn trên Taskbar). DAW", "Hide the running DAW window (no longer on the Taskbar). The DAW"],
    ["vẫn chạy bình thường", "keeps running normally"],
    [", vẫn nhận MIDI và xử lý audio. Biểu tượng chấm tròn xanh hiện cạnh đồng hồ Windows: bấm đúp hoặc chuột phải > \"Hiện DAW\" để hiện lại. Thoát Menu khi DAW đang ẩn thì DAW tự hiện lại. DAW lấy từ file đã chọn ở", ", still receives MIDI and processes audio. A green dot icon appears next to the Windows clock: double-click or right-click > \"Show DAW\" to bring it back. Quitting the Menu while the DAW is hidden restores it automatically. The DAW is taken from the file selected in"],
    ["AI > Đường dẫn & khởi động", "AI > Paths & startup"],
    ["🙈 Ẩn DAW", "🙈 Hide DAW"],
    ["👁 Hiện DAW", "👁 Show DAW"],
    ["💾 Sao lưu / Phục hồi / Xuất / Nhập", "💾 Backup / Restore / Export / Import"],
    ["Sao lưu / phục hồi toàn bộ cài đặt hiện tại — đổi tên hoàn toàn khỏi \"LinkPro\" theo đúng yêu cầu. Logic export/import giữ nguyên 100%, không đổi. Backup = Export, Restore = Import (cùng một cơ chế, không có 2 cặp nút riêng vì Engine chỉ có 1 cặp thật).", "Back up / restore all current settings — fully renamed away from \"LinkPro\" as requested. Export/import logic is kept 100% unchanged. Backup = Export, Restore = Import (same mechanism, no 2 separate button pairs because the Engine only has 1 real pair)."],
    ["Phân biệt với Preset (mục Dashboard):", "Differs from Preset (Dashboard section):"],
    ["Preset chỉ lưu 10 field chọn lọc (DAW/Auto-Key/Auto-Tune/Browser/Soundcard/toạ độ/launchDAW).", "Preset saves only 10 selected fields (DAW/Auto-Key/Auto-Tune/Browser/Soundcard/coordinates/launchDAW)."],
    ["Backup lưu toàn bộ", "Backup saves the entire"],
    ["(gọi", "(calls"],
    ["nguyên object) — đã xác nhận đúng trong code, không phải chỉ vài field như Preset.", "on the whole object) — confirmed in the code, not just a few fields like Preset."],
    ["Validation trước Restore:", "Validation before Restore:"],
    ["hiện Restore chỉ có", "currently Restore only has a"],
    ["cảnh báo ghi đè, chưa kiểm tra cấu trúc file trước khi merge. Thêm validation cần sửa handler", "overwrite warning and does not check the file structure before merging. Adding validation requires changing the handler"],
    ["trong", "in"],
    ["— không tự làm ở đây để tránh phá luồng Restore đang chạy ổn định (rủi ro tương thích), báo cáo để bạn quyết định.", "— not done here to avoid breaking the stable Restore flow (compatibility risk); reported for you to decide."],
    ["📤 Sao lưu", "📤 Backup"],
    ["📥 Phục hồi", "📥 Restore"],
    ["Tự động Restore khi mở DAW", "Auto Restore when opening DAW"],
    ["🌐 Trình duyệt", "🌐 Browser"],
    ["Đã hỗ trợ", "Supported"],
    ["auto-dò: chưa hỗ trợ", "auto-detect: not supported"],
    ["Đường dẫn trình duyệt (.exe):", "Browser path (.exe):"],
    ["📂 Chọn đường dẫn trình duyệt", "📂 Select browser path"],
    ["💾 Lưu trình duyệt", "💾 Save browser"],
    ["🌐 Cài Brave không quảng cáo", "🌐 Install ad-free Brave"],
    ["🎨 Giao diện / Ngôn ngữ", "🎨 Theme / Language"],
    ["Giao diện", "Theme"],
    ["Tối (mặc định)", "Dark (default)"],
    ["Ngôn ngữ", "Language"],
    ["📈 Nhật ký", "📈 Log"],
    ["Thật", "Live"],
    ["Log thật đang được ghi tại thư mục", "Real logs are being written to the folder"],
    ["(qua", "(via"],
    ["). Chưa có trình xem log ngay trong Setup.", "). There is no log viewer inside Setup yet."],
    ["Phiên bản / Cập nhật / Giấy phép", "Version / Update / License"],
    ["Chưa có kênh IPC đọc version/build động, chưa có Engine kiểm tra cập nhật, chưa có hệ thống license/activation trong project. Để trống thay vì bịa số liệu — chỉ cần bổ sung Engine sau này, không cần sửa layout.", "No IPC channel to read the version/build dynamically, no update-check Engine, and no license/activation system in the project. Left blank instead of making up data — just add an Engine later, no layout change needed."],
    ["☎ Liên hệ", "☎ Contact"],
    ["☎ 𝓚𝓱𝓸́𝓲 (bấm để copy số điện thoại)", "☎ 𝓚𝓱𝓸́𝓲 (click to copy phone number)"],
    ["Nhấn phím...", "Press a key..."],
    ["Đường dẫn file project/session", "Project/session file path"],
    ["Mỗi dòng 1 đường dẫn plugin", "One plugin path per line"],
    ["Đường dẫn file cấu hình MIDI", "MIDI config file path"],
    ["Đường dẫn file cấu hình Audio", "Audio config file path"],
    ["Đường dẫn thư mục logs/diagnostics", "Logs/diagnostics folder path"],
    ["(file không còn tồn tại — hãy chọn lại)", "(file no longer exists — please select again)"],
    ["⏳ Đang dò đường dẫn...", "⏳ Detecting path..."],
    ["❌ Không tự tìm thấy — hãy bấm \"Chọn đường dẫn trình duyệt\" bên dưới", "❌ Not found automatically — click \"Select browser path\" below"],
    ["Chức năng chọn file chưa khả dụng", "File selection is not available"],
    ["Đã lưu trình duyệt, nhưng CHƯA có đường dẫn — Browser sẽ chưa tính là \"xong\" trong Trạng thái Setup cho tới khi có đường dẫn (tự dò hoặc chọn tay).", "Browser saved, but there is NO path yet — Browser will not count as \"done\" in Setup Status until a path is set (auto-detect or select manually)."],
    ["Chưa có link file .zip VST2 — gửi link cho Claude để hoàn thiện nút này.", "No VST2 .zip link yet — send the link to Claude to finish this button."],
    ["Chức năng tải VST2 chưa khả dụng", "VST2 download is not available"],
    ["Tải và cài Plugins VST2 vào C:\\\\Program Files\\\\VstPlugins?\\nSẽ có popup xin quyền Admin, bấm Yes để tiếp tục.", "Download and install VST2 Plugins to C:\\\\Program Files\\\\VstPlugins?\\nAn Admin permission popup will appear, click Yes to continue."],
    ["⏳ Đang tải VST2...", "⏳ Downloading VST2..."],
    ["Đã cài xong VST2 vào:\\n", "VST2 installed to:\\n"],
    ["Có lỗi xảy ra khi tải/cài VST2", "An error occurred while downloading/installing VST2"],
    ["Chức năng tải Brave chưa khả dụng", "Brave download is not available"],
    ["Tải và cài Brave (trình duyệt không quảng cáo)?", "Download and install Brave (ad-free browser)?"],
    ["⏳ Đang tải Brave...", "⏳ Downloading Brave..."],
    ["Đã tải xong, trình cài đặt Brave đang mở — làm theo hướng dẫn trên màn hình.", "Download complete, the Brave installer is opening — follow the on-screen instructions."],
    ["Có lỗi xảy ra khi tải Brave", "An error occurred while downloading Brave"],
    ["Chức năng mở trang tải chưa khả dụng", "Opening the download page is not available"],
    ["Mở trang tải loopMIDI (phần mềm tạo cổng MIDI ảo, miễn phí)?\\nSau khi trang mở ra, bấm \"Download\" trên đó rồi tự cài như bình thường.", "Open the loopMIDI download page (free virtual MIDI port software)?\\nOnce the page opens, click \"Download\" there and install as usual."],
    ["Đã copy số điện thoại:", "Phone number copied:"],
    ["Số điện thoại:", "Phone number:"],
    ["Đang thực hiện...", "Working..."],
    ["Chức năng tải & cài đặt chưa khả dụng", "Download & install is not available"],
    ["Tải và cài \"{0}\"?", "Download and install \"{0}\"?"],
    ["⏳ Đang tải...", "⏳ Downloading..."],
    ["Đã tải xong, trình cài đặt đang mở — làm theo hướng dẫn trên màn hình.", "Download complete, the installer is opening — follow the on-screen instructions."],
    ["Có lỗi xảy ra khi tải/cài đặt", "An error occurred while downloading/installing"],
    ["Hãy chọn DAW ở mục \"Thiết lập AutoMenu\" trước — tọa độ được lưu riêng theo từng DAW.", "Select a DAW in \"AutoMenu Setup\" first — coordinates are saved separately for each DAW."],
    ["Không lấy được tọa độ", "Could not get coordinates"],
    ["Đã lưu tọa độ \"{0}\" cho {1}", "Saved coordinates \"{0}\" for {1}"],
    ["Bật Mouse Control", "Turn on Mouse Control"],
    ["REMIX — plugin Group Mic 1 (bypass: 0 = bật, 127 = tắt)", "REMIX — Group Mic 1 plugin (bypass: 0 = on, 127 = off)"],
    ["REMIX — plugin Group Mic 2 (bypass: 0 = bật, 127 = tắt)", "REMIX — Group Mic 2 plugin (bypass: 0 = on, 127 = off)"],
    ["MIC 1 VOLUME (fader Mic)", "MIC 1 VOLUME (Mic fader)"],
    ["MIC 2 VOLUME (fader Không Dây)", "MIC 2 VOLUME (Wireless fader)"],
    ["FX BUS DELAY VOLUME (fader bus Delay)", "FX BUS DELAY VOLUME (Delay bus fader)"],
    ["FX BUS VERB NGẮN VOLUME (fader bus Verb ngắn)", "FX BUS SHORT VERB VOLUME (Short Verb bus fader)"],
    ["FX BUS VERB DÀI VOLUME (fader bus Verb dài)", "FX BUS LONG VERB VOLUME (Long Verb bus fader)"],
    ["FX BUS COM VERB VOLUME (fader bus Com Verb)", "FX BUS COM VERB VOLUME (Com Verb bus fader)"],
    ["MUSIC ON (Monitor Beat bật)", "MUSIC ON (Monitor Beat on)"],
    ["MUSIC OFF (Monitor Beat tắt)", "MUSIC OFF (Monitor Beat off)"],
    ["MIC 1 ON (Monitor Mic bật)", "MIC 1 ON (Monitor Mic on)"],
    ["MIC 1 OFF (Monitor Mic tắt)", "MIC 1 OFF (Monitor Mic off)"],
    ["MIC 2 ON (Monitor Không Dây bật)", "MIC 2 ON (Monitor Wireless on)"],
    ["MIC 2 OFF (Monitor Không Dây tắt)", "MIC 2 OFF (Monitor Wireless off)"],
    ["FX ON (bỏ Mute 4 bus)", "FX ON (unmute 4 buses)"],
    ["FX OFF (Mute 4 bus)", "FX OFF (mute 4 buses)"],
    ["TUNE ON/OFF — BYPASS Auto-Tune 1 (127 = bypass bật, 0 = tắt)", "TUNE ON/OFF — BYPASS Auto-Tune 1 (127 = bypass on, 0 = off)"],
    ["TUNE ON/OFF — BYPASS Auto-Tune 2 (nút TUNE gửi cả 4)", "TUNE ON/OFF — BYPASS Auto-Tune 2 (TUNE button sends all 4)"],
    ["TUNE ON/OFF — BYPASS Auto-Tune 3 (nút TUNE gửi cả 4)", "TUNE ON/OFF — BYPASS Auto-Tune 3 (TUNE button sends all 4)"],
    ["TUNE ON/OFF — BYPASS Auto-Tune 4 (nút TUNE gửi cả 4)", "TUNE ON/OFF — BYPASS Auto-Tune 4 (TUNE button sends all 4)"],
    ["LOFI ON/OFF kiểu bypass (nút sáng = LOFI bật = gửi 0; tắt = gửi 127) — kết hợp với preset khác", "LOFI ON/OFF bypass-style (lit button = LOFI on = sends 0; off = sends 127) — combine with other presets"],
    ["AUDIO CHILL — nút ON/OFF kiểu bypass (nút sáng = bật = gửi 0; tắt = gửi 127)", "AUDIO CHILL — ON/OFF button, bypass-style (lit = on = sends 0; off = sends 127)", ["AUDIO CHILL — nút ON/OFF (sáng = bật = gửi 127; tắt = gửi 0)"]],
    ["AUDIO CHILL — knob điều khiển 1 VST (CC 0..127)", "AUDIO CHILL — knob controlling 1 VST (CC 0..127)"],
    ["MUSIC CHỌN TRACK (Find Track Beat — gửi trước ON/OFF)", "MUSIC SELECT TRACK (Find Track Beat — sent before ON/OFF)"],
    ["MIC 1 CHỌN TRACK (Find Track Mic — gửi trước ON/OFF)", "MIC 1 SELECT TRACK (Find Track Mic — sent before ON/OFF)"],
    ["MIC 2 CHỌN TRACK (Find Track Không Dây — gửi trước ON/OFF)", "MIC 2 SELECT TRACK (Find Track Không Dây — sent before ON/OFF)"],
    ["Chưa chọn DAW ở tab \"Chọn DAW\" — chưa thể cấu hình MIDI Output.", "No DAW selected in the \"Select DAW\" tab — cannot configure MIDI Output yet."],
    ["Cần chọn DAW trước khi điền bộ CC gợi ý.", "Select a DAW before filling in the suggested CC set."],
    ["Chưa có bộ CC gợi ý cho DAW này — hãy cấu hình mapping thủ công.", "No suggested CC set for this DAW yet — configure the mapping manually."],
    ["Không lưu bộ gợi ý (bộ CC lỗi):", "Suggested set not saved (CC set error):"],
    ["Đã cấu hình ({0})", "Configured ({0})"],
    ["Key Server trả lời (HTTP", "Key Server responded (HTTP"],
    ["Key Server không trả lời:", "Key Server not responding:"],
    ["Chưa lưu — có đường dẫn không hợp lệ, xem trạng thái từng trường phía trên.", "Not saved — some paths are invalid, see each field's status above."],
    ["Lưu thất bại — vui lòng thử lại.", "Save failed — please try again."],
    ["❌ Chưa chọn file chạy của DAW (AI > Đường dẫn & khởi động)", "❌ DAW executable not selected (AI > Paths & startup)"],
    ["·  bản", "·  version"],
    ["CHƯA XÁC MINH", "UNVERIFIED"],
    ["SAI ĐƯỜNG DẪN DAW", "WRONG DAW PATH"],
    ["DAW CHƯA CHẠY", "DAW NOT RUNNING"],
    ["ĐANG ẨN", "HIDDEN"],
    ["ĐANG HIỆN", "SHOWN"],
    ["⚠ Menu (main process) đang chạy bản CŨ — chưa có A101. Hãy THOÁT HẲN mọi cửa sổ/tiến trình AUTO MENU AI (kể cả dưới khay / Task Manager) rồi mở lại.", "⚠ Menu (main process) is running an OLD version — A101 is missing. FULLY QUIT every AUTO MENU AI window/process (including the tray / Task Manager), then reopen."],
    ["Không đọc được trạng thái:", "Cannot read status:"],
    ["Xoá nút \\\"", "Delete button \\\""],
    ["Khôi phục toàn bộ danh sách hiệu ứng về mặc định? Các nút bạn đã thêm/đổi sẽ mất.", "Restore the whole effects list to default? Buttons you added/changed will be lost."],
    ["❌ Không tìm thấy getMidiAccess() (appSettings.js chưa tải xong).", "❌ getMidiAccess() not found (appSettings.js has not finished loading)."],
    ["Không phát hiện MIDI Input nào đang cắm.", "No MIDI Input detected."],
    ["Phát hiện {0} input, {1} đang Connected.", "Detected {0} inputs, {1} Connected."],
    ["❌ Lỗi truy cập MIDI Input (có thể do trình duyệt chặn quyền).", "❌ MIDI Input access error (the browser may have blocked permission)."],
    ["⚠ Chọn cổng MIDI Input trước khi Learn.", "⚠ Select a MIDI Input port before Learn."],
    ["❌ Không mở được cổng Input đã chọn.", "❌ Cannot open the selected Input port."],
    ["🎯 Đang chờ tín hiệu... (xoay/bấm controller)", "🎯 Waiting for signal... (turn/press the controller)"],
    ["Đang lắng nghe MIDI Input thật...", "Listening to real MIDI Input..."],
    ["✅ Đã nhận: {0}", "✅ Received: {0}"],
    ["❌ Không bắt đầu Learn được.", "❌ Could not start Learn."],
    ["Đã huỷ Learn.", "Learn cancelled."],
    ["Chưa có Mapping nào được lưu.", "No Mapping saved yet."],
    ["Chưa Learn tín hiệu MIDI nào.", "No MIDI signal learned yet."],
    ["Chọn Action muốn gán trước khi Lưu.", "Select the Action to assign before Save."],
    ["✅ Đã nhận:", "✅ Received:"],
    ["⚠ Đã huỷ lưu — trùng tín hiệu với \"{0}\".", "⚠ Save cancelled — signal conflicts with \"{0}\"."],
    ["💾 Đã lưu", "💾 Saved"],
    ["{0} {1} → ✅ SUCCESS (API send OK, DAW chưa xác nhận đã nhận){2}{3}", "{0} {1} → ✅ SUCCESS (API send OK, DAW receipt not confirmed){2}{3}", ["{0} {1} → ✅ SUCCESS (API send OK, chưa xác nhận DAW nhận){2}{3}"]],
    ["Trạng thái: MidiHealth chưa tải xong.", "Status: MidiHealth has not finished loading.", ["Status: MidiHealth chưa tải xong."]],
    ["Trạng thái: đang kiểm tra...", "Status: checking...", ["Status: đang kiểm tra..."]],
    ["Trạng thái: {0}", "Status: {0}"],
    ["Trạng thái: lỗi khi kiểm tra ({0}).", "Status: error while checking ({0}).", ["Status: lỗi khi kiểm tra ({0})."]],
    ["Auto Connect chưa khả dụng (không phải Electron renderer?).", "Auto Connect unavailable (not an Electron renderer?)."],
    ["⏳ Đang dò tìm...", "⏳ Scanning..."],
    ["· bước {0}", "· step {0}"],
    ["Verify chưa khả dụng (không phải Electron renderer?).", "Verify unavailable (not an Electron renderer?)."],
    ["⏳ Đang gửi + chờ phản hồi...", "⏳ Sending + waiting for response..."],
    ["Verification: đang chạy...", "Verification: running..."],
    ["Verification: lỗi ({0}).", "Verification: error ({0})."],
    ["Đã dừng.", "Stopped."],
    ["Chưa kiểm tra tín hiệu", "Signal not checked"],
    ["⏳ Đang xin quyền micro...", "⏳ Requesting mic permission..."],
    ["⏳ Đang kiểm tra tín hiệu...", "⏳ Checking signal..."],
    ["🎙 Đang đo mic đang chọn (VuMeter thật).", "🎙 Measuring the selected mic (real VuMeter)."],
    ["❌ Không mở được mic — kiểm tra quyền micro / soundcard đã chọn.", "❌ Cannot open mic — check mic permission / the selected soundcard."],
    ["⚠ NO AUDIO SIGNAL (không mở được thiết bị)", "⚠ NO AUDIO SIGNAL (cannot open device)"],
    ["Vui lòng nhập password.", "Please enter the password."],
    ["Mật khẩu không đúng", "Incorrect password"],
    ["Lỗi hệ thống, thử lại.", "System error, please try again."],
    ["Mật khẩu hiện tại", "Current password", ["Password hiện tại"]],
    ["Mật khẩu mới", "New password", ["Password mới"]],
    ["Xác nhận mật khẩu mới", "Confirm new password", ["Xác nhận password mới"]],
    ["Vui lòng nhập đủ 3 trường.", "Please fill in all 3 fields."],
    ["Xác nhận mật khẩu mới không khớp.", "New password confirmation does not match.", ["Xác nhận password mới không khớp."]],
    ["Đổi mật khẩu thành công.", "Password changed successfully.", ["Đổi password thành công."]],
    ["Đổi mật khẩu thất bại.", "Failed to change password.", ["Đổi password thất bại."]],
    ["Không lưu bộ gợi ý: CC/Note đã dùng cho action khác —", "Suggested set not saved: CC/Note already used by another action —"],
    [". Đổi mapping của action kia trước.", ". Change the other action's mapping first."],
    ["Chưa có mapping ON/OFF nào để xoá.", "No ON/OFF mapping to delete."],
    ["Xoá {0} mapping ON/OFF? Các nút MUSIC/MIC/FX sẽ quay về lệnh toggle cũ (nếu bạn đã cấu hình), mapping cũ không bị đụng.", "Delete {0} ON/OFF mappings? MUSIC/MIC/FX buttons will revert to the old toggle command (if you configured one); old mappings are untouched."],
    ["Giá trị/Vel", "Value/Vel"],
    ["Vui lòng nhập Số (CC number / Note number).", "Please enter a Number (CC number / Note number)."],
    ["Không lưu: {0} {1} kênh {2} đã dùng cho {3}. Mỗi lệnh ON/OFF phải có CC/Note riêng.", "Not saved: {0} {1} channel {2} is already used for {3}. Each ON/OFF command needs its own CC/Note."],
    ["Chưa chọn DAW.", "DAW not selected."],
    ["Chưa chọn DAW ở mục \\\"Thiết lập AutoMenu\\\" — chưa thể capture toạ độ.", "DAW not selected in \\\"AutoMenu Setup\\\" — cannot capture coordinates yet."],
    ["Đã lưu phím tắt", "Shortcut saved"],
    ["Chưa có project nào. Hãy dùng \"Chọn PJ\" trước.", "No project yet. Use \"Select PJ\" first."],
    ["Đã lưu project hiện tại", "Current project saved"],
    ["Hãy tick \"Mở Project\" hoặc \"Mở Youtube\" trước.", "Tick \"Open Project\" or \"Open Youtube\" first."],
    ["Chưa chọn Project. Hãy dùng \"Chọn PJ\" trước.", "No Project selected. Use \"Select PJ\" first."],
    ["Có lỗi xảy ra:\\n", "An error occurred:\\n"],
    ["Đã mở kèm Project/Youtube", "Project/Youtube opened too"],
    ["Speaker01 (loopback – đường âm thanh DAW)", "Speaker01 (loopback – DAW audio path)"],
    ["(Đã lưu trước đó) {0}", "(Previously saved) {0}"],
    ["⚠ Chưa chọn Audio Interface", "⚠ Audio Interface not selected"],
    ["● Đã chọn Audio Interface", "● Audio Interface selected"],
    ["⚠ Audio Interface không khả dụng", "⚠ Audio Interface unavailable"],
    ["(Đã lưu trước đó)", "(Previously saved)"],
    ["Vui lòng chọn 1 cổng MIDI trước.", "Please select a MIDI port first."],
    ["✅ Đã lưu", "✅ Saved"],
    ["Chọn cổng MIDI trước khi test.", "Select a MIDI port before testing."],
    ["Không gửi được", "Could not send"],
    ["— xem dòng log trong Monitor để biết tầng lỗi.", "— see the log line in Monitor to find the failing layer."],
    ["Vui lòng chọn một soundcard trước.", "Please select a soundcard first."],
    ["Đã lưu soundcard", "Soundcard saved"],
    ["● Đã chọn SYSTEM_AUDIO", "● SYSTEM_AUDIO selected"],
    ["⚠ SYSTEM_AUDIO đã chọn không còn khả dụng", "⚠ Selected SYSTEM_AUDIO is no longer available"],
    ["Đã lưu SYSTEM_AUDIO.", "SYSTEM_AUDIO saved."],
    ["Đã đặt SYSTEM_AUDIO về None (NO_DEVICE).", "SYSTEM_AUDIO set to None (NO_DEVICE)."],
    ["● Đã chọn MIC Input", "● MIC Input selected"],
    ["⚠ MIC đã chọn không còn khả dụng", "⚠ Selected MIC is no longer available"],
    ["Đã lưu MIC Input.", "MIC Input saved."],
    ["Đã đặt MIC về None (dùng mic mặc định hệ thống).", "MIC set to None (using system default mic)."],
    ["● Đã chọn Audio Output", "● Audio Output selected"],
    ["⚠ Output đã chọn không còn khả dụng", "⚠ Selected Output is no longer available"],
    ["Đã lưu Audio Output.", "Audio Output saved."],
    ["Đã đặt Audio Output về None (output mặc định hệ thống).", "Audio Output set to None (system default output)."],
    ["Chức năng Backup chưa khả dụng", "Backup is unavailable"],
    ["Không đọc được cài đặt mới nhất — chưa tạo Backup", "Cannot read the latest settings — Backup not created"],
    ["Đã backup vào:\\n", "Backed up to:\\n"],
    ["Backup thất bại", "Backup failed"],
    ["Chức năng Restore chưa khả dụng", "Restore is unavailable"],
    ["Restore sẽ ghi đè toàn bộ cài đặt hiện tại. Tiếp tục?", "Restore will overwrite all current settings. Continue?"],
    ["File backup không hợp lệ", "Invalid backup file"],
    ["Không đọc được cài đặt mới nhất — chưa Restore để tránh ghi đè", "Cannot read the latest settings — not restored, to avoid overwriting"],
    ["Restore thất bại (không ghi được file cài đặt)", "Restore failed (cannot write the settings file)"],
    ["Restore thất bại", "Restore failed"],
    ["❌ Chưa cài AutoHotkey — bấm \"Tải & Cài AutoHotkey\" bên dưới", "❌ AutoHotkey not installed — click \"Download & Install AutoHotkey\" below"],
    ["Chức năng tải AutoHotkey chưa khả dụng", "AutoHotkey download is unavailable"],
    ["Tải và cài AutoHotkey v2 (bắt buộc để dùng tính năng \"Lấy tọa độ\")?", "Download and install AutoHotkey v2 (required for the \"Get coordinates\" feature)?"],
    ["Đã tải xong, trình cài đặt AutoHotkey đang mở — cài xong thì bấm lại nút này (hoặc mở lại Setup) để app tự nhận diện.", "Download finished, the AutoHotkey installer is open — after installing, click this button again (or reopen Setup) so the app detects it."],
    ["Có lỗi xảy ra khi tải AutoHotkey", "An error occurred while downloading AutoHotkey"],
    ["⚠ Chưa chọn DAW — chọn DAW trước khi lấy tọa độ", "⚠ DAW not selected — select a DAW before getting coordinates"],
    ["📍 Đang thiết lập tọa độ cho: {0}", "📍 Setting up coordinates for: {0}"],
    ["Không đọc được cài đặt mới nhất — chưa lưu Preset để tránh ghi đè", "Cannot read the latest settings — Preset not saved, to avoid overwriting"],
    ["Lưu Preset thất bại (không ghi được file cài đặt)", "Save Preset failed (cannot write the settings file)"],
    ["Đã lưu Preset", "Preset saved"],
    ["Không đọc được cài đặt mới nhất — chưa tải Preset để tránh ghi đè", "Cannot read the latest settings — Preset not loaded, to avoid overwriting"],
    ["Chưa có Preset", "No Preset yet"],
    ["Preset bị hỏng, không thể tải", "Preset is corrupted and cannot be loaded"],
    ["Preset trùng cấu hình hiện tại — không có gì thay đổi", "Preset matches the current configuration — nothing changed"],
    ["Tải Preset thất bại (không ghi được file cài đặt)", "Load Preset failed (cannot write the settings file)"],
    ["Đã tải Preset (", "Preset loaded ("],
    ["mục thay đổi). Mở lại Setup để thấy các ô được cập nhật.", "items changed). Reopen Setup to see the updated fields."],
    ["❌ Lưu thất bại", "❌ Save failed"],
    ["MIC 2 (Monitor Không Dây)", "MIC 2 (Wireless Monitor)"],
    ["TUNE (ON = Bypass TẮT, OFF = Bypass BẬT — cả 4 plugin Auto-Tune)", "TUNE (ON = Bypass OFF, OFF = Bypass ON — all 4 Auto-Tune plugins)"],
    ["LOFI (ON/OFF độc lập, kết hợp được với preset khác)", "LOFI (independent ON/OFF, can be combined with other presets)"],
    ["AUDIO CHILL (ON/OFF kiểu bypass: sáng = BẬT = gửi 0; tắt = TẮT = gửi 127; độc lập với knob)", "AUDIO CHILL (ON/OFF bypass-style: lit = ON = sends 0; off = OFF = sends 127; independent of the knob)", ["AUDIO CHILL (ON/OFF: sáng = BẬT = gửi 127; tắt = TẮT = gửi 0; độc lập với knob)"]],
    ["đã GỬI lệnh toggle cũ ({0}) — DAW chưa xác nhận; chưa cấu hình ON/OFF riêng", "sent legacy toggle command ({0}) — DAW has not confirmed; separate ON/OFF not configured"],
    ["CHƯA cấu hình {0} ON/OFF trong Setup — DAW KHÔNG nhận lệnh", "{0} ON/OFF NOT configured in Setup — DAW will NOT receive the command"],
    ["gửi lệnh toggle cũ ({0}) LỖI{1}", "legacy toggle command ({0}) send FAILED{1}"],
    ["đã GỬI lệnh {0} {1} — DAW chưa xác nhận (Menu không đọc được trạng thái Studio One)", "SENT command {0} {1} — DAW has not confirmed (Menu cannot read Studio One state)"],
    ["CHƯA cấu hình lệnh {0} {1} trong Setup — DAW KHÔNG nhận lệnh", "command {0} {1} NOT configured in Setup — DAW will NOT receive the command"],
    ["gửi lệnh {0} {1} LỖI{2} — DAW KHÔNG nhận lệnh", "send command {0} {1} FAILED{2} — DAW will NOT receive the command"],
    ["gửi lệnh CHỌN TRACK ({0}) LỖI — KHÔNG gửi lệnh Monitor (tránh đảo nhầm track khác)", "SELECT TRACK command ({0}) FAILED — Monitor command NOT sent (to avoid toggling the wrong track)"],
    ["[đã chọn track trước, chờ {0} ms]", "[track selected first, waited {0} ms]", [], 1],
    ["Verb dài trả về", "Long reverb return"],
    ["trả về", "returned", [], 1],
    ["Verb dài TẮT", "Long reverb OFF"],
    ["ĐỔI PASSWORD ADMIN", "CHANGE ADMIN PASSWORD"],
    ["web-midi (fallback, không có main IPC)", "web-midi (fallback, no main IPC)"],
    ["⚠ Cổng MIDI không khả dụng", "⚠ MIDI port unavailable"],
    ["Cổng đã lưu (", "Saved port (", [], 1],
    [") hiện không có trong danh sách MIDI thật — vào Setup > MIDI để chọn lại.", ") is not in the real MIDI list — go to Setup > MIDI to select again.", [], 1],
    ["electronAPI.openProjectBundle không khả dụng", "electronAPI.openProjectBundle is unavailable"],
    ["Không có HTMLAudioElement khả dụng (không phải môi trường renderer/browser).", "No HTMLAudioElement available (not a renderer/browser environment)."],
    ["Chưa có đường dẫn file audio cho {0}.", "No audio file path for {0}."],
    ["{0}: {1} (đường dẫn đang dùng: \"{2}\")", "{0}: {1} (path in use: \"{2}\")"],
    ["Master VU sẽ giữ NO_DEVICE. Xem B58-REPORT.md mục DAW_MASTER status.", "Master VU will stay at NO_DEVICE. See B58-REPORT.md, section DAW_MASTER status."],
    ["khoá qua đường: fast-path (A35+modal+stability)", "locked via path: fast-path (A35+modal+stability)"],
    ["dưới MIN_CONFIDENCE", "below MIN_CONFIDENCE"],
    ["khoá qua đường: {0}", "locked via path: {0}"],
    ["getMidiAccess() không tồn tại (appSettings.js chưa tải).", "getMidiAccess() does not exist (appSettings.js not loaded)."],
    ["electronAPI.getMainMidiHealth không tồn tại (không phải Electron renderer?).", "electronAPI.getMainMidiHealth does not exist (not an Electron renderer?)."],
    ["electronAPI.autoConnectMidi không tồn tại (không phải Electron renderer?).", "electronAPI.autoConnectMidi does not exist (not an Electron renderer?)."],
    ["electronAPI.verifyMidiOutput không tồn tại.", "electronAPI.verifyMidiOutput does not exist."],
    ["Không có audio element nào để áp dụng", "No audio element to apply to"],
    ["— ĐANG BẬT (bấm để tắt)", "— ON (click to turn off)", [], 1],
    ["— ĐANG TẮT (bấm để bật)", "— OFF (click to turn on)", [], 1],
    ["— đang kiểm tra...", "— checking...", [], 1],
    ["— không xác định", "— unknown", [], 1],
    ["electronAPI không khả dụng", "electronAPI is unavailable"],
    ["Không đọc được trạng thái", "Cannot read state"],
    ["Thao tác thất bại", "Operation failed"],
    ["Phản hồi không hợp lệ từ main process", "Invalid response from main process"],
    ["đang gửi lệnh Send — CHƯA có phản hồi, chưa đồng bộ", "sending Send command — NO response yet, not synced"],
    ["đã GỬI lệnh Send Reverb/Delay — DAW chưa xác nhận (không có phản hồi)", "SENT Send Reverb/Delay command — DAW has not confirmed (no response)"],
    ["CHƯA cấu hình Send Reverb/Delay trong Setup — DAW KHÔNG nhận lệnh", "Send Reverb/Delay NOT configured in Setup — DAW will NOT receive the command"],
    ["lệnh Send KHÔNG phản hồi (hết thời gian) — DAW có thể chưa đồng bộ", "Send command got NO response (timed out) — DAW may be out of sync"],
    ["— DAW có thể chưa đồng bộ", "— DAW may be out of sync", [], 1],
    ["đang gửi lệnh FX ON/OFF (mute 4 bus) — CHƯA có phản hồi", "sending FX ON/OFF command (mute 4 buses) — NO response yet"],
    ["đã GỬI lệnh FX ON/OFF (mute 4 bus) — DAW chưa xác nhận", "SENT FX ON/OFF command (mute 4 buses) — DAW has not confirmed"],
    ["CHƯA cấu hình FX ON/OFF (mute 4 bus) trong Setup — DAW KHÔNG nhận lệnh (FX Auto không dùng Send)", "FX ON/OFF (mute 4 buses) NOT configured in Setup — DAW will NOT receive the command (FX Auto does not use Send)"],
    ["lệnh FX ON/OFF KHÔNG phản hồi (hết thời gian) — DAW có thể chưa đồng bộ", "FX ON/OFF command got NO response (timed out) — DAW may be out of sync"],
    ["— DAW KHÔNG nhận lệnh", "— DAW will NOT receive the command", [], 1],
    ["FX THỦ CÔNG (Auto nhường quyền", "FX MANUAL (Auto yields control for", [], 1],
    ["chưa có kết quả gửi", "no send result yet", [], 1],
    ["FX Auto: nguồn nhạc (SYSTEM_AUDIO) không khả dụng — giữ nguyên trạng thái", "FX Auto: music source (SYSTEM_AUDIO) unavailable — keeping current state"],
    ["(trạng thái nút = mặc định lúc mở/yêu cầu; Send DAW CHƯA được xác nhận)", "(button state = default at open/request; DAW Send NOT confirmed)", [], 1],
    ["đang theo dõi nhạc nền", "following background music", [], 1],
    ["Đang gửi...", "Sending..."],
    ["AI Detect: {0} (đang dò...)", "AI Detect: {0} (detecting...)"],
    ["[Audio][B71] SYSTEM_AUDIO chưa được cấu hình (selectedSystemAudioDeviceId rỗng) ->", "[Audio][B71] SYSTEM_AUDIO is not configured (selectedSystemAudioDeviceId is empty) ->", [], 1],
    ["KHÔNG khởi tạo Key/BPM/MOD (không dùng selectedSoundcardId/MIC làm SYSTEM_AUDIO).", "NOT initializing Key/BPM/MOD (selectedSoundcardId/MIC is not used as SYSTEM_AUDIO).", [], 1],
    ["Cấu hình tại Setup > Audio > \\\"SYSTEM_AUDIO Input\\\".", "Configure it at Setup > Audio > \\\"SYSTEM_AUDIO Input\\\".", [], 1],
    ["[Audio] Thiết bị SYSTEM_AUDIO đã cấu hình không còn khả dụng hoặc lỗi khởi tạo -- sẽ tự thử lại", "[Audio] The configured SYSTEM_AUDIO device is no longer available or failed to initialize -- will silently retry", [], 1],
    ["ngầm khi thiết bị quay lại (không cần reload).", "when the device comes back (no reload needed).", [], 1],
    ["sinkId thực tế không khớp thiết bị đã chọn", "Actual sinkId does not match the selected device"],
    ["Ứng dụng", "Application"],
    ["Bộ CC gợi ý của AUTO_MENU_AI (LIVE-MIDI-FSP8-02 / MENU-KNOB-MIDI-COMPLETION-01). Cần gán CC vào macro/fader trong Control Surface (MIDI Learn).", "Suggested CC set from AUTO_MENU_AI (LIVE-MIDI-FSP8-02 / MENU-KNOB-MIDI-COMPLETION-01). Assign the CCs to macros/faders in the Control Surface (MIDI Learn)."],
    ["DAW nền của project; CC Knob CHƯA kiểm chứng gán trong DAW", "The project's base DAW; Knob CC assignment in the DAW NOT yet verified"],
    ["UNVERIFIED (cùng bộ CC với Studio One 6/7; chưa có bằng chứng riêng cho bản 5)", "UNVERIFIED (same CC set as Studio One 6/7; no separate evidence for version 5)"],
    ["UNVERIFIED (cùng bộ CC với Studio Pro 8; chưa kiểm chứng gán Knob trong DAW)", "UNVERIFIED (same CC set as Studio Pro 8; Knob assignment in the DAW not verified)"],
    ["CHỌN TRACK", "SELECT TRACK"],
    ["Quy ước CC gợi ý của AUTO_MENU_AI — KHÔNG phải mặc định của Cubase (tránh CC 7/10/12/13/23/24/64 đã thấy trong Generic Remote/MIDI Remote). Cubase không tự nhận: phải gán trong MIDI Remote hoặc Generic Remote.", "Suggested CC convention from AUTO_MENU_AI — NOT Cubase defaults (avoids CC 7/10/12/13/23/24/64 seen in Generic Remote/MIDI Remote). Cubase does not detect it automatically: assign it in MIDI Remote or Generic Remote."],
    ["CHỈ CÓ BẰNG CHỨNG FILE, CHƯA CHẠY THẬT", "FILE EVIDENCE ONLY, NOT TESTED LIVE"],
    ["Bộ CC thiếu hoặc hỏng.", "CC set is missing or corrupted."],
    ["Số mapping ({0}) khác khai báo ({1}).", "Mapping count ({0}) differs from the declared count ({1})."],
    ["Action không tồn tại: {0}.", "Action does not exist: {0}."],
    ["{0}: kind không hợp lệ.", "{0}: invalid kind."],
    ["{0}: kênh phải 1–16.", "{0}: channel must be 1–16."],
    ["{0}: số phải 0–127.", "{0}: number must be 0–127."],
    ["{0}: giá trị phải 0–127.", "{0}: value must be 0–127."],
    ["{0} trùng {1} (cùng {2} {3} kênh {4}).", "{0} conflicts with {1} (same {2} {3} on channel {4})."],
    ["Không có bộ CC này cho DAW đã chọn.", "No such CC set for the selected DAW."],
    ["Lưu {0} mapping {1} gợi ý cho {2} ({3})? Chỉ lưu mapping Menu MIDI Output — bạn vẫn phải gán từng CC trong DAW.", "Save {0} suggested {1} mappings for {2} ({3})? This only saves the Menu MIDI Output mappings — you still need to assign each CC in the DAW."],
    ["\\nSẽ GHI ĐÈ {0} mapping đã lưu: {1}.", "\\nThis will OVERWRITE {0} saved mappings: {1}.", [], 1],
    ["— chưa Learn", "— not learned"],
    ["— chưa cấu hình", "— not configured"],
    ["— chưa capture", "— not captured"],
    ["ĐÃ LƯU (MIDI) — chỉ gửi lệnh, DAW chưa xác nhận", "SAVED (MIDI) — command only, DAW has not confirmed"],
    ["kiểm tra lại cổng MIDI đã chọn", "check the selected MIDI port again"],
    ["Chọn loopMIDI.exe", "Select loopMIDI.exe"],
    ["Chương trình", "Program"],
    ["Chọn Studio One.exe", "Select Studio One.exe"],
    ["Không thực hiện được.", "Action failed."],
    ["Không thực hiện được:", "Action failed:", [], 1],
    ["Chọn file âm thanh khác cho nút này", "Choose a different audio file for this button"],
    ["Đổi file", "Replace file"],
    ["Xoá nút này", "Delete this button"],
    ["Xóa", "Delete"],
    ["Chưa có nút nào.", "No buttons yet."],
    ["Đã nối Command Engine (Studio One Transport)", "Connected to Command Engine (Studio One Transport)"],
    ["Đã lưu — chưa nối capability nào", "Saved — no capability connected yet"],
    ["⚠ Tín hiệu MIDI này ({0}) đã được gán cho \"{1}\".\\n", "⚠ This MIDI signal ({0}) is already assigned to \"{1}\".\\n", [], 1],
    ["Nếu tiếp tục, mapping cũ sẽ bị XOÁ để tránh 2 Function cùng khớp 1 tín hiệu", "If you continue, the old mapping will be DELETED so that 2 Functions don't match the same signal", [], 1],
    ["(1 trong 2 sẽ bị ghi đè âm thầm lúc thực thi nếu để cả hai).\\n\\n", "(one of them would be silently overridden at runtime if both are kept).\\n\\n", [], 1],
    ["Xoá mapping cũ và gán cho \"{0}\" thay vào đó?", "Delete the old mapping and assign it to \"{0}\" instead?", [], 1],
    ["● Có cổng khả dụng, chưa chọn (đang ở bước dò tìm).", "● Ports available, none selected (in discovery step)."],
    ["⚠ Cổng đã lưu KHÔNG có trong danh sách thật (mất/đổi tên/rút dây).", "⚠ The saved port is NOT in the real list (missing/renamed/unplugged)."],
    ["◐ Cổng tồn tại, đang xác nhận kết nối thật (renderer/main)...", "◐ Port exists, confirming the real connection (renderer/main)..."],
    ["● CONNECTED — output đã xác nhận mở ở cả renderer và main process.", "● CONNECTED — output confirmed open in both renderer and main process."],
    ["● CONFIGURED — đã kết nối và có mapping đã lưu.", "● CONFIGURED — connected and has saved mappings."],
    ["◐ OUTPUT_READY — Output đã mở (main process), Input CHƯA mở (xem lỗi Input bên dưới).", "◐ OUTPUT_READY — Output is open (main process), Input NOT open (see the Input error below)."],
    ["◐ INPUT_READY — Input đã mở, Output CHƯA mở (xem lỗi Output bên dưới).", "◐ INPUT_READY — Input is open, Output NOT open (see the Output error below)."],
    ["❌ ERROR — xem chi tiết bên dưới.", "❌ ERROR — see details below."],
    ["[main-process health không khả dụng]", "[main-process health unavailable]", [], 1],
    ["[gộp: lần bấm dồn dập, không mở lại]", "[merged: rapid clicks, not reopened]", [], 1],
    ["AUTO CONNECT → ⚠ {0} (một phía) \"{1}\" — {2}{3}", "AUTO CONNECT → ⚠ {0} (one side) \"{1}\" — {2}{3}"],
    ["— không tìm thấy port khả dụng.", "— no available port found.", [], 1],
    ["AUTO CONNECT → ⚠ đã phân giải tên \"{0}\" nhưng KHÔNG có xác nhận mở cổng (main cũ).", "AUTO CONNECT → ⚠ resolved name \"{0}\" but NO confirmation that the port opened (old main)."],
    ["AUTO CONNECT → ❌ KHÔNG kết nối được — không tìm thấy port khả dụng.", "AUTO CONNECT → ❌ could NOT connect — no available port found."],
    ["{0} path không hợp lệ", "{0} invalid paths"],
    ["Chức năng này chỉ có trong app Menu (Electron).", "This feature is only available in the Menu app (Electron)."],
    ["Đã nhận lệnh bấm", "Received click command:", [], 1],
    ["Đang xử lý thao tác trước, đợi xong rồi bấm lại.", "Still processing the previous action, wait until it finishes and click again."],
    ["Không có kênh nối tới Menu (window.electronAPI trống) — hãy mở Setup từ app Menu.", "No channel to Menu (window.electronAPI is empty) — open Setup from the Menu app."],
    ["Menu đang chạy là bản CŨ: thiếu kênh", "Menu is running an OLD version: missing channel", [], 1],
    [". Thoát hẳn mọi tiến trình AUTO MENU AI rồi mở lại.", ". Fully quit all AUTO MENU AI processes and reopen.", [], 1],
    ["Đang", "Working:", [], 1],
    ["Menu không trả lời sau 30 giây (kênh IPC treo hoặc đang chạy bản cũ). Xem daw-hide-diagnostic.log.", "Menu did not respond after 30 seconds (IPC channel hung or running an old version). See daw-hide-diagnostic.log."],
    ["Đã lưu: Start Hidden BẬT — lần mở DAW tới, Menu sẽ tự ẩn DAW sau khi DAW nạp xong VST + project.", "Saved: Start Hidden ON — next time DAW opens, Menu will hide the DAW automatically after it finishes loading VSTs + project."],
    ["Đã lưu: Start Hidden TẮT.", "Saved: Start Hidden OFF."],
    ["Không lưu được Start Hidden:", "Could not save Start Hidden:", [], 1],
    ["Chưa cấu hình cổng MIDI (Setup > MIDI) — SoundShifter chỉ điều khiển được qua MIDI.", "MIDI port not configured (Setup > MIDI) — SoundShifter can only be controlled via MIDI."],
    ["Gửi MIDI CC thất bại giữa chừng (SoundShifter).", "MIDI CC send failed midway (SoundShifter)."],
    ["Gửi MIDI CC thất bại (cổng MIDI có thể đã bị rút/đổi tên).", "MIDI CC send failed (the MIDI port may have been unplugged/renamed)."],
    ["Mouse Control đang TẮT (Setup > Calibration) — không tự click chuột để đổi Key. Bật lại Mouse Control hoặc cấu hình MIDI (Setup > MIDI) để Key tiếp tục gửi tự động.", "Mouse Control is OFF (Setup > Calibration) — Key will not auto-click the mouse. Turn Mouse Control back on or configure MIDI (Setup > MIDI) so Key keeps sending automatically."],
    ["Chưa cấu hình cổng MIDI (Setup > MIDI) hoặc toạ độ \"Key Auto-Tune\" (Setup > Lấy tọa độ).", "MIDI port or \"Key Auto-Tune\" coordinates (Setup > Get coordinates) not configured."],
    ["MIDI lỗi ở bước {0}/{1} (không rõ đã gửi hay chưa) — KHÔNG fallback để tránh dịch dư; trạng thái tone không chắc chắn.", "MIDI error at step {0}/{1} (unknown whether sent) — NO fallback to avoid over-shifting; tone state is uncertain."],
    ["Mouse Control đang TẮT (Setup > Calibration) — không tự click chuột để dịch tone. Bật lại Mouse Control hoặc cấu hình MIDI (Setup > MIDI) để MOD tiếp tục gửi tự động.", "Mouse Control is OFF (Setup > Calibration) — tone will not auto-click the mouse. Turn Mouse Control back on or configure MIDI (Setup > MIDI) so MOD keeps sending automatically."],
    ["MIDI đã gửi {0}/{1} bước, còn {2} bước CHƯA gửi.", "MIDI sent {0}/{1} steps, {2} steps NOT sent.", [], 1],
    ["Click chuột ném lỗi (không rõ đã click hay chưa) — dừng, trạng thái tone không chắc chắn.", "Mouse click threw an error (unknown whether it clicked) — stopped, tone state is uncertain."],
    ["Chưa cấu hình cổng MIDI hoặc toạ độ \"Chromatic\" (Setup > Lấy tọa độ).", "MIDI port or \"Chromatic\" coordinates (Setup > Get coordinates) not configured."],
    ["Trạng thái Always on Top cho bảng hiệu ứng:", "Always on Top status for the effects panel:", [], 1],
    ["Bật (Luôn nổi)", "On (Always on top)", [], 1],
    ["Không kết nối được với ứng dụng.", "Cannot connect to the app."],
    ["Chưa có hiệu ứng. Bấm EDIT để thêm.", "No effects yet. Click EDIT to add."],
    ["Ứng dụng chưa nạp bản mới. Hãy tắt hẳn AUTO MENU AI (kể cả dưới khay hệ thống) rồi mở lại.", "The app has not loaded the new version. Fully quit AUTO MENU AI (including the system tray) and reopen it."],
    ["— không tìm thấy file âm thanh", "— audio file not found", [], 1],
    ["Không áp dụng được.", "Could not apply."],
    ["Điền + lưu bộ LIVE gợi ý", "Fill + save suggested LIVE set"],
    ["Điền + lưu bộ KNOB gợi ý", "Fill + save suggested KNOB set"],
    ["Cần chọn DAW trước khi điền bộ CC gợi ý.", "Select a DAW before filling the suggested CC set."],
    ["8 lệnh ON/OFF điều khiển DAW (MUSIC / MIC 1 / MIC 2 / FX):", "8 ON/OFF commands that control the DAW (MUSIC / MIC 1 / MIC 2 / FX):", [], 1],
    ["ở cuối danh sách. Mỗi nút Menu gửi lệnh theo", "at the bottom of the list. Each Menu button sends the command for the", [], 1],
    ["trạng thái đích sau cú bấm", "target state after the click", [], 1],
    ["Menu chỉ", "Menu only", [], 1],
    ["gửi", "sends", [], 1],
    ["lệnh —", "commands —", [], 1],
    ["không đọc được trạng thái thật", "cannot read the real state", [], 1],
    ["của DAW, nên lúc mở app hoặc khi bạn đổi trực tiếp trong DAW, nút Menu có thể lệch DAW.", "of the DAW, so when the app opens or when you change it directly in the DAW, Menu buttons may be out of sync with the DAW.", [], 1],
    ["Bộ gợi ý:", "Suggested set:", [], 1],
    ["Điền ở đây chỉ LƯU mapping của Menu — DAW chưa được điều khiển cho đến khi bạn gán trong DAW.", "Filling here only SAVES the Menu mapping — the DAW is not controlled until you assign it in the DAW.", [], 1],
    ["Điền + lưu bộ LIVE gợi ý — {0}", "Fill + save suggested LIVE set — {0}"],
    ["Điền + lưu bộ KNOB gợi ý — {0}", "Fill + save suggested KNOB set — {0}"],
    ["Điền + lưu bộ CHỌN TRACK gợi ý — {0}", "Fill + save suggested SELECT TRACK set — {0}"],
    ["Điền + lưu bộ TUNE BYPASS gợi ý — {0}", "Fill + save suggested TUNE BYPASS set — {0}"],
    ["Điền + lưu bộ LOFI ON/OFF gợi ý — {0}", "Fill + save suggested LOFI ON/OFF set — {0}"],
    ["Điền + lưu bộ MIC VOLUME gợi ý — {0}", "Fill + save suggested MIC VOLUME set — {0}"],
    ["Điền + lưu bộ PRESET (NORM/LOFI/RAP/REMIX) gợi ý — {0}", "Fill + save suggested PRESET (NORM/LOFI/RAP/REMIX) set — {0}"],
    ["Điền + lưu bộ FX BUS VOLUME gợi ý — {0}", "Fill + save suggested FX BUS VOLUME set — {0}"],
    ["Điền + lưu bộ KEY + SCALE gợi ý — {0}", "Fill + save suggested KEY + SCALE set — {0}"],
    ["Chưa có bộ CC gợi ý cho DAW này — hãy cấu hình mapping thủ công.", "No suggested CC set for this DAW — configure the mapping manually."],
    ["Xoá 8 mapping ON/OFF (quay về lệnh toggle cũ)", "Delete the 8 ON/OFF mappings (revert to legacy toggle commands)"],
    ["Số", "Number"],
    ["Đã lưu — chỉ gửi lệnh, DAW chưa xác nhận", "Saved — command only, DAW has not confirmed"],
    ["🔄 Đồng bộ", "🔄 Sync"],
    ["Đang đồng bộ với server…", "Syncing with the server…"],
    ["Đồng bộ server: chưa chạy lần nào (tự chạy sau khi mở app và mỗi 10 phút).", "Server sync: has not run yet (runs automatically after the app opens and every 10 minutes)."],
    ["Đồng bộ server lúc {0}: kéo về {1} bài, điền Key {2}, đẩy lên {3}.", "Server sync at {0}: pulled {1} songs, filled {2} Keys, pushed {3}."],
    ["Đồng bộ server lúc {0} lỗi: {1}", "Server sync at {0} failed: {1}"],
    ["Đồng bộ xong: kéo về {0} bài, điền Key {1}, đẩy lên {2}.", "Sync done: pulled {0} songs, filled {1} Keys, pushed {2}."],
    ["Đồng bộ đang TẮT (keyServerAutoSync=false).", "Sync is OFF (keyServerAutoSync=false)."],
    ["Không kết nối được server ({0}).", "Cannot reach the server ({0})."],
    ["Đang đồng bộ, vui lòng chờ.", "Sync in progress, please wait."],
    ["không rõ", "unknown"],
    ["Kênh {0}", "Channel {0}"],
    ["Gửi Program", "Send Program"],
    ["Gửi Pitch Bend", "Send Pitch Bend"],
    ["NOTE ON, CC, Program Change và Pitch Bend đều có nút gửi thật ở trên (echo thật khi bấm). Gửi thành công chỉ có nghĩa lệnh đã được đưa tới cổng MIDI — chưa xác nhận DAW đã nhận.", "NOTE ON, CC, Program Change and Pitch Bend all have real send buttons above (real echo when pressed). A successful send only means the command reached the MIDI port — it does not confirm the DAW received it."],
    ["Điền + lưu preset toàn bộ gợi ý", "Fill + save the full suggested preset"],
    ["Điền + lưu preset toàn bộ — {0} ({1} mapping)", "Fill + save the full preset — {0} ({1} mappings)"],
    ["Xoá toàn bộ preset {0}", "Delete the whole {0} preset"],
    ["Chưa có mapping nào của preset này để xoá.", "No mapping from this preset to delete."],
    ["Xoá {0} mapping của preset {1}? Mapping khác (PLAY/STOP/RECORD...) không bị đụng.", "Delete {0} mappings of the {1} preset? Other mappings (PLAY/STOP/RECORD...) are not touched."],
    ["Đóng DAW và Youtube cùng Menu (DAW hỏi lưu project → tự chọn No, không lưu)", "Close the DAW and YouTube together with the Menu (if the DAW asks to save the project → automatically choose No, do not save)"]
    ];

    // renderer.js đọc đúng các chữ này từ textContent để làm logic -> không được dịch.
    var PROTECT = { "NORM": 1, "LOFI": 1, "RAP": 1, "REMIX": 1,
        "PRESET NORM": 1, "PRESET LOFI": 1, "PRESET RAP": 1, "PRESET REMIX": 1, "PRESET TUNE OFF": 1 };

    var LETTER = /[A-Za-zÀ-ỹ]/;
    var PH = /\{(\d+)\}/g;
    var exact = new Map();   // chuỗi đã chuẩn hoá -> cặp [vi, en]
    var tpls = [];           // mẫu có {n}: { re, idx, pair, weight }
    var fragVi = [], fragEn = []; // mảnh ghép: thay thẳng trong câu dài
    var lang = "vi";

    function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
    function unesc(s) {
        return s.replace(/\\(n|t|"|'|\\)/g, function (m, c) { return c === "n" ? "\n" : c === "t" ? "\t" : c; });
    }
    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function addKey(key, pair) {
        var k = norm(key);
        if (!k || PROTECT[k] || !LETTER.test(k)) return;
        if (!/\{\d+\}/.test(k)) { if (!exact.has(k)) exact.set(k, pair); return; }
        var parts = k.split(PH), pattern = "^", idx = [], letters = 0;
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 0) { pattern += escRe(parts[i]); letters += (parts[i].match(/[A-Za-zÀ-ỹ]/g) || []).length; }
            else { pattern += "([\\s\\S]+?)"; idx.push(parts[i]); }
        }
        if (letters < 4) return; // mẫu quá lỏng dễ khớp nhầm -> bỏ
        tpls.push({ re: new RegExp(pattern + "$"), idx: idx, pair: pair, weight: letters });
    }

    function addFrag(vi, en, auto) {
        var MIN = auto ? 12 : 4;   // câu dài tự động thành mảnh; câu ngắn chỉ khi được đánh dấu
        var pairs = [[vi, en]];
        if (unesc(vi) !== vi || unesc(en) !== en) pairs.push([unesc(vi), unesc(en)]);
        pairs.forEach(function (p) {
            if (/\{\d+\}/.test(p[0]) || /\{\d+\}/.test(p[1])) return;     // mảnh có {n} chỉ khớp theo mẫu
            if (p[0].trim().length >= MIN && p[0] !== p[1] && p[1].indexOf(p[0]) < 0) fragVi.push({ from: p[0], to: p[1] });
            if (p[1].trim().length >= MIN && p[0] !== p[1] && p[0].indexOf(p[1]) < 0) fragEn.push({ from: p[1], to: p[0] });
        });
    }

    (function build() {
        for (var i = 0; i < PAIRS.length; i++) {
            var raw = PAIRS[i], extra = raw[2] || [];
            addFrag(raw[0], raw[1], !raw[3]);
            var variants = [[raw[0], raw[1], extra]];
            var u = [unesc(raw[0]), unesc(raw[1]), extra.map(unesc)];
            if (u[0] !== raw[0] || u[1] !== raw[1] || u[2].join("\u0001") !== extra.join("\u0001")) variants.push(u);
            for (var v = 0; v < variants.length; v++) {
                var pr = [variants[v][0], variants[v][1]];
                addKey(pr[0], pr); addKey(pr[1], pr);
                for (var j = 0; j < variants[v][2].length; j++) addKey(variants[v][2][j], pr);
            }
        }
        tpls.sort(function (a, b) { return b.weight - a.weight; });
        var byLen = function (a, b) { return b.from.length - a.from.length; };
        fragVi.sort(byLen); fragEn.sort(byLen);
    })();

    function pick(pair) { return pair[lang === "en" ? 1 : 0]; }

    // Trả về chuỗi đã dịch, hoặc null nếu không có bản dịch / không cần đổi.
    function translate(text) {
        if (typeof text !== "string" || !text) return null;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        var core = norm(m[2]);
        if (!core || !LETTER.test(core)) return null;
        var pair = exact.get(core), out = null;
        if (pair) out = pick(pair);
        else {
            for (var i = 0; i < tpls.length; i++) {
                var mm = tpls[i].re.exec(core);
                if (!mm) continue;
                var vals = {};
                for (var g = 0; g < tpls[i].idx.length; g++) vals[tpls[i].idx[g]] = mm[g + 1];
                out = pick(tpls[i].pair).replace(PH, function (x, n) { return vals[n] !== undefined ? vals[n] : x; });
                break;
            }
        }
        if (out !== null && norm(out) !== core) return m[1] + out + m[3];
        // Không khớp cả câu (hoặc khớp mẫu nhưng không đổi chữ): thử thay các MẢNH ghép trong câu dài.
        var list = lang === "en" ? fragVi : fragEn, res = text, hit = false;
        for (var f = 0; f < list.length; f++) {
            if (res.indexOf(list[f].from) >= 0) { res = res.split(list[f].from).join(list[f].to); hit = true; }
        }
        return hit && res !== text ? res : null;
    }

    // ---------------------------------------------------------------- Phần DOM (chỉ chạy trong trình duyệt)
    var ATTRS = ["title", "placeholder", "aria-label"];
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 }; // TEXTAREA vẫn dịch: chỉ đổi khi trùng ĐÚNG câu giao diện trong bảng

    function skipped(el) {
        if (!el || el.nodeType !== 1) return false;
        if (SKIP_TAGS[el.tagName]) return true;
        return !!(el.closest && el.closest("[data-i18n-skip],[contenteditable='true']"));
    }
    var ver = 0;                         // tăng mỗi lần đổi ngôn ngữ
    var wText = new WeakMap();           // text node -> { v: chữ do I18N vừa ghi, ver }
    var wAttr = new WeakMap();           // element -> { tên attr: { v, ver } }
    function fixText(n) {
        var d = n.data;
        if (!d || !LETTER.test(d)) return;
        var w = wText.get(n);
        if (w && w.v === d && w.ver === ver) return;   // chữ này do chính I18N ghi -> không dịch lại
        if (skipped(n.parentNode)) return;
        var t = translate(d);
        if (t !== null && t !== d) { n.data = t; wText.set(n, { v: t, ver: ver }); }
    }
    function fixAttr(el, name) {
        var v = el.getAttribute(name);
        if (!v) return;
        var rec = wAttr.get(el) || {};
        if (rec[name] && rec[name].v === v && rec[name].ver === ver) return;
        if (skipped(el)) return;
        var t = translate(v);
        if (t !== null && t !== v) { el.setAttribute(name, t); rec[name] = { v: t, ver: ver }; wAttr.set(el, rec); }
    }
    function walk(node) {
        if (node.nodeType === 3) { fixText(node); return; }
        if (node.nodeType !== 1 || skipped(node)) return;
        for (var a = 0; a < ATTRS.length; a++) if (node.hasAttribute(ATTRS[a])) fixAttr(node, ATTRS[a]);
        for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
    }

    function readStored(fresh) {
        var v = "";
        try {
            if (fresh && G.electronAPI && typeof G.electronAPI.loadSettingsSync === "function") {
                var s = G.electronAPI.loadSettingsSync();
                if (s && typeof s === "object") v = s.language || "";
            } else if (typeof G.getSetting === "function") {
                v = G.getSetting("language", "");
            }
            if (!v && G.electronAPI && typeof G.electronAPI.loadSettingsSync === "function") {
                var s2 = G.electronAPI.loadSettingsSync();
                if (s2 && typeof s2 === "object") v = s2.language || "";
            }
        } catch (e) { /* đọc lỗi -> dùng mặc định "vi" */ }
        return v === "en" ? "en" : "vi";
    }

    function bindSelect() {
        var sel = document.getElementById("languageSelect");
        if (!sel) return;
        sel.value = lang;
        if (sel.__i18nBound) return;
        sel.__i18nBound = true;
        sel.addEventListener("change", function () { setLang(sel.value); });
    }

    function applyAll() {
        if (typeof document === "undefined" || !document.documentElement) return;
        document.documentElement.setAttribute("lang", lang);
        walk(document.documentElement);
        bindSelect();
    }

    function setLang(next) {
        next = next === "en" ? "en" : "vi";
        var changed = next !== lang;
        lang = next; ver++;
        try { if (typeof G.setSetting === "function") G.setSetting("language", lang); } catch (e) { /* lưu lỗi: vẫn đổi tại chỗ */ }
        try { if (G.electronAPI && typeof G.electronAPI.notifySetupChanged === "function") G.electronAPI.notifySetupChanged(); } catch (e) { /* bỏ qua */ }
        if (changed) applyAll();
        return lang;
    }

    // Đồng bộ khi cửa sổ khác đổi ngôn ngữ.
    function syncFromStore() {
        var next = readStored(true);
        if (next !== lang) { lang = next; ver++; applyAll(); }
    }

    var api = {
        get lang() { return lang; },
        setLang: setLang,
        t: function (s) { var r = translate(s); return r === null ? s : r; },
        translate: translate,
        apply: applyAll,
        _size: function () { return { exact: exact.size, templates: tpls.length, pairs: PAIRS.length }; }
    };
    G.I18N = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;

    lang = readStored(false);

    if (typeof document !== "undefined" && HAS_WIN) {
        // Hộp thoại hệ thống cũng theo ngôn ngữ đang chọn.
        ["alert", "confirm", "prompt"].forEach(function (fn) {
            var orig = G[fn];
            if (typeof orig !== "function") return;
            G[fn] = function (msg) {
                var a = Array.prototype.slice.call(arguments);
                if (typeof a[0] === "string") { var t = translate(a[0]); if (t !== null) a[0] = t; }
                return orig.apply(this, a);
            };
        });

        applyAll();
        document.addEventListener("DOMContentLoaded", applyAll);
        if (typeof MutationObserver === "function") {
            new MutationObserver(function (recs) {
                for (var i = 0; i < recs.length; i++) {
                    var r = recs[i];
                    if (r.type === "childList") { for (var k = 0; k < r.addedNodes.length; k++) walk(r.addedNodes[k]); }
                    else if (r.type === "characterData") fixText(r.target);
                    else if (r.type === "attributes") fixAttr(r.target, r.attributeName);
                }
            }).observe(document.documentElement, {
                subtree: true, childList: true, characterData: true,
                attributes: true, attributeFilter: ATTRS
            });
        }
        if (G.electronAPI && typeof G.electronAPI.onSetupChanged === "function") G.electronAPI.onSetupChanged(syncFromStore);
        G.addEventListener("focus", syncFromStore);
    }
})();
