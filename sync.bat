@echo off
:: Đường dẫn đến thư mục dự án của bạn trong ổ cứng ngoài
:: Lưu ý: Hãy sửa lại tên ổ đĩa (ví dụ G:\Data) cho đúng với máy của bạn
cd /d "G:\AUTO_MENU_AI"

:: Kiểm tra xem đã khởi tạo Git chưa
if not exist .git (
    echo Khoi tao git...
    git init
    git remote add origin git@github.com:anhtuan391989/AUTO_MENU_AI.git
)

:: Thực hiện đẩy dữ liệu
git add .
git commit -m "Auto-sync %date% %time%"
git push -u origin main

echo Da day du lieu len GitHub!
timeout /t 5