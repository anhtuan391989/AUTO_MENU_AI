#Requires AutoHotkey v2
#SingleInstance Force

; Tham số truyền vào: A_Args[1] = số điểm cần lấy, A_Args[2] = đường dẫn file ghi kết quả
pointCount := A_Args.Length >= 1 ? Integer(A_Args[1]) : 1
outputFile := A_Args.Length >= 2 ? A_Args[2] : (A_ScriptDir . "\capture_result.txt")
cancelFile := outputFile . ".cancelled"

; ESC để huỷ bất cứ lúc nào trong lúc đang lấy tọa độ
Esc:: {
    ToolTip()
    try FileAppend("1", cancelFile)
    ExitApp()
}

points := []

Loop pointCount {
    ToolTip("Di chuột tới vị trí điểm " . A_Index . "/" . pointCount . " rồi nhấn F8`n(ESC để huỷ)")
    KeyWait("F8", "D")
    MouseGetPos(&x, &y)
    points.Push(x . "," . y)
    ToolTip("Đã lấy điểm " . A_Index . "/" . pointCount)
    Sleep(300) ; tránh việc giữ phím F8 hơi lâu bị tính thành 2 lần bấm
}

ToolTip()

result := ""
for line in points {
    result .= line . "`n"
}

try FileDelete(outputFile)
FileAppend(result, outputFile)

ExitApp()
