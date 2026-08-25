; main.ahk - AHK service chạy nền, lắng nghe lệnh qua TCP socket cục bộ
; Yêu cầu: thư viện Socket cho AHK (vd: AutoHotSocket hoặc tương đương)
; Đây là bản rút gọn minh hoạ luồng xử lý, cần thay bằng lib socket thực tế khi triển khai.

#Persistent
#SingleInstance Force

Port := 6789
; Giả định có hàm Socket_Listen()/Socket_Accept()/Socket_Recv()/Socket_Send()
; do thư viện socket cung cấp. Vòng lặp dưới đây minh hoạ ý tưởng, không phải
; API AHK socket có sẵn (AHK cần lib ngoài hoặc named pipe để làm việc này).

server := Socket_Listen(Port)

Loop {
    client := Socket_Accept(server)
    raw := Socket_Recv(client)

    ; raw dạng: {"type":"send_keys","keys":"^{F5}"}
    cmd := JSON_Parse(raw)

    if (cmd.type = "send_keys") {
        Send, % cmd.keys
        response := "{""status"":""ok"",""message"":""sent""}"
    } else {
        response := "{""status"":""error"",""message"":""unknown_command""}"
    }

    Socket_Send(client, response)
    Socket_Close(client)
}
return
