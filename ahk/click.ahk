; click.ahk v2 - click chuột trái tại toạ độ được truyền vào qua tham số dòng lệnh
; Gọi dạng: AutoHotkey64.exe click.ahk <x> <y>
; Dùng MouseGetPos/toàn desktop ảo giống AHK.ahk nên hoạt động đúng với nhiều màn hình.

x := A_Args[1]
y := A_Args[2]

MouseClick "left", x, y
