@echo off
cd /d "G:\AUTO_MENU_AI"

:: 0. Tắt bước Git tự dọn dẹp ("gc") — ổ G: (hoặc phần mềm diệt virus) không cho xoá vài file tạm của Git,
::    Git cứ hỏi "Should I try again? (y/n)" liên tục. KHÔNG xoá được mấy file đó không sao cả (chỉ là file
::    trùng đã gộp xong), nhưng tắt hẳn bước này đi cho khỏi bị hỏi nữa — không ảnh hưởng gì tới việc đồng bộ.
git config gc.auto 0

:: 1. Lấy code mới nhất từ GitHub về để tránh lỗi "rejected"
git pull origin main

:: 2. Thêm và lưu thay đổi vào nhánh main
git add .
git commit -m "Auto-sync %date% %time%"

:: 3. Đẩy thẳng lên nhánh main trên GitHub
git push -u origin main

echo Da day du lieu len nhanh main thanh cong!
timeout /t 10