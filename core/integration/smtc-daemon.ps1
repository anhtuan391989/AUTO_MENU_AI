<#
============================================================
AUTO_MENU_AI — core/integration/smtc-daemon.ps1
------------------------------------------------------------
Tiến trình PowerShell SỐNG LÂU DÀI (không bị spawn lại mỗi lần poll).
Node (WindowsMediaSession.js) spawn tiến trình này ĐÚNG 1 LẦN, giữ nó
chạy suốt vòng đời tính năng, đọc từng dòng JSON in ra stdout.

Giao thức (1 dòng JSON / lần, kết thúc bằng \n) — KHÔNG ĐỔI so với
bản trước:
  {"type":"ready","pid":<số>}
      -> in ĐÚNG 1 LẦN, ngay sau khi nạp WinRT thành công.
  {"type":"snapshot","data":{application,title,artist,album,thumbnail,timestamp}}
      -> có bài đang phát.
  {"type":"snapshot","data":null}
      -> không có session nào đang phát.
  {"type":"error","message":"..."}
      -> lỗi tạm thời khi đọc 1 session cụ thể (không dừng vòng lặp).
  {"type":"fatal","message":"..."}
      -> lỗi không thể phục hồi (vd máy không hỗ trợ WinRT SMTC),
         in ra rồi THOÁT HẲN (exit 1). Node không nên tự restart khi
         nhận fatal — restart cũng sẽ lỗi y hệt.

------------------------------------------------------------
CÁC SỬA ĐỔI TRONG LẦN NÀY (dựa trên nghiên cứu thật, có dẫn nguồn ở
báo cáo, KHÔNG suy đoán tuỳ tiện):

1. NGHI VẤN NGUYÊN NHÂN "không bao giờ nhận ready" (mục 3 đề bài):
   powershell.exe mặc định chạy ở apartment STA. Gọi WinRT async rồi
   block đồng bộ bằng Task.Wait() trên 1 console app KHÔNG có Windows
   message loop để "pump" là kiểu deadlock kinh điển đã được ghi nhận
   cho chính lớp bài toán này (xem project `bleak` — thư viện Python
   dùng WinRT — tài liệu troubleshooting của họ mô tả ĐÚNG hiện tượng
   này và khuyến nghị chạy ở MTA). Node giờ spawn kèm cờ `-MTA`.
2. STDOUT BUFFERING (mục 2 đề bài): thay `Write-Output` (đi qua
   pipeline formatting của PowerShell) bằng 1 StreamWriter ghi THẲNG
   vào stdout gốc của tiến trình, AutoFlush=true — đảm bảo mỗi dòng
   JSON được đẩy ra ngay lập tức, không đợi buffer đầy. StreamWriter
   này cũng ép encoding UTF-8 KHÔNG BOM tường minh — sửa luôn rủi ro
   ký tự tiếng Việt (Sơn Tùng, Đêm Trắng...) bị mã hoá sai khi
   PowerShell dùng codepage hệ thống mặc định thay vì UTF-8.
3. KIỂM TRA PHIÊN BẢN (mục 1 đề bài): cú pháp
   `[Type,Assembly,ContentType=WindowsRuntime]` CHỈ hoạt động tin cậy
   trên Windows PowerShell 5.1 (.NET Framework). PowerShell 7/pwsh
   (.NET Core/.NET 5+) đã được ghi nhận nhiều lần lỗi
   "Unable to find type ... ContentType=WindowsRuntime" (xem báo cáo).
   Script giờ tự kiểm tra $PSVersionTable.PSEdition và báo fatal RÕ
   RÀNG ngay từ đầu nếu phát hiện đang chạy trên edition "Core", thay
   vì để lỗi WinRT mơ hồ ở bước sau.
4. TIMEOUT CHO TỪNG LỆNH GỌI WinRT (phòng ngừa bổ sung, không phải
   thay thế cho fix #1): `Wait-WinRtOperation` giờ có timeout hữu hạn
   thay vì đợi vô thời hạn (-1) — nếu do bất kỳ nguyên nhân nào khác
   ngoài dự đoán vẫn còn treo, sẽ ném lỗi có thể bắt được sau N giây
   thay vì treo cứng cả tiến trình.

⚠️ VẪN CHƯA ĐƯỢC TỰ KIỂM THỬ TRÊN WINDOWS THẬT — xem báo cáo, mục
"Kết quả kiểm thử thực tế".
============================================================
#>

param(
    [int]$PollIntervalMs = 2000,
    [int]$WinRtCallTimeoutMs = 5000
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------
# BƯỚC 0 — Kiểm tra sớm: đang chạy Windows PowerShell 5.1 hay PowerShell 7 (pwsh)?
# Cú pháp WinRT type accelerator dùng trong script này CHỈ được xác nhận hoạt
# động trên PSEdition "Desktop" (Windows PowerShell 5.1, .NET Framework).
# Báo fatal RÕ RÀNG ngay tại đây thay vì để lỗi khó hiểu ở bước load WinRT.
# ---------------------------------------------------------------
if ($PSVersionTable.PSEdition -eq "Core") {

    $msg = "Dang chay tren PowerShell $($PSVersionTable.PSVersion) (PSEdition=Core, tuc la pwsh, khong phai Windows PowerShell 5.1). " +
           "Cu phap WinRT [Type,Assembly,ContentType=WindowsRuntime] duoc ghi nhan hay loi 'Unable to find type' tren PowerShell 7+. " +
           "Can dam bao Node goi dung 'powershell.exe' (Windows PowerShell 5.1), khong phai 'pwsh.exe'."
    # In thẳng bằng Write-Output vì StreamWriter (Write-JsonLine) chưa được
    # khởi tạo ở bước này — đây là lỗi xảy ra TRƯỚC BƯỚC 0.5.
    Write-Output ('{"type":"fatal","message":"' + ($msg -replace '"', "'") + '"}')
    exit 1

}

# ---------------------------------------------------------------
# BƯỚC 0.5 — StreamWriter ghi thẳng vào stdout, AutoFlush=true, UTF-8 KHÔNG
# BOM. Thay thế hoàn toàn Write-Output cho MỌI dòng thuộc giao thức JSON, để
# đảm bảo: (a) không bị PowerShell buffer, (b) encoding đúng cho tiếng Việt.
#
# PHÒNG THỦ BỔ SUNG (sau khi điều tra lỗi "Chß║»c Chß║»n" — xem báo cáo):
# đã CHỨNG MINH bằng phép decode ngược rằng đây là UTF-8 bytes của "Chắc"
# bị đọc nhầm bằng codepage OEM 437/850/858 (codepage console mặc định của
# Windows, KHÔNG PHẢI cp1252/1258 — đã loại trừ bằng phép tính, xem báo cáo).
# StreamWriter ghi thẳng vào OpenStandardOutput() lẽ ra đã bỏ qua console
# codepage hoàn toàn, NHƯNG để phòng ngừa mọi đường ghi phụ nào đó (nếu có)
# vẫn tham chiếu [Console]::OutputEncoding, đặt luôn giá trị này = UTF-8 và
# ép luôn codepage console về 65001 (UTF-8) ngay từ đầu tiến trình.
# ---------------------------------------------------------------
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

try {
    [Console]::OutputEncoding = $Utf8NoBom
} catch { }

try {
    # chcp 65001: ép codepage console về UTF-8. An toàn dù không có console
    # thật (spawn với windowsHide) — bỏ qua lỗi nếu không áp dụng được.
    $null = (& chcp.com 65001) 2>$null
} catch { }

$StdOutWriter = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $Utf8NoBom)
$StdOutWriter.AutoFlush = $true
[Console]::SetOut($StdOutWriter)

function Write-JsonLine {
    param($Object)

    # -Compress để đảm bảo TOÀN BỘ object nằm gọn trên 1 DÒNG (giao thức
    # yêu cầu 1 JSON / 1 dòng để Node đọc theo line dễ dàng, không cần
    # gộp nhiều dòng lại mới parse được).
    $json = $Object | ConvertTo-Json -Compress -Depth 5
    $StdOutWriter.WriteLine($json)
    $StdOutWriter.Flush() # tường minh, dù AutoFlush đã bật — không tin tưởng ngầm định

}


# ---------------------------------------------------------------
# BƯỚC 1 — Nạp kiểu WinRT. Thất bại ở đây là FATAL (không thể phục hồi
# bằng cách thử lại — máy không hỗ trợ, không phải lỗi tạm thời).
# ---------------------------------------------------------------
try {

    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

} catch {

    $hint = ""
    if ($_.Exception.Message -match "Unable to find type") {
        $hint = " (goi y: co the dang chay sai PowerShell edition, hoac Windows SDK projection assemblies khong co san tren may nay)"
    }

    Write-JsonLine @{ type = "fatal"; message = "Khong nap duoc WinRT Windows.Media.Control: $($_.Exception.Message)$hint" }
    exit 1

}

$AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
})[0]

function Wait-WinRtOperation {
    param($WinRtTask, [type]$ResultType)

    $asTaskSpecific = $AsTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTaskSpecific.Invoke($null, @($WinRtTask))

    # Timeout HỮU HẠN thay vì Wait(-1) — phòng ngừa bổ sung: nếu vẫn treo vì
    # lý do nào đó ngoài dự đoán (xem mục 1 ở đầu file), ném lỗi bắt được
    # được thay vì treo cứng vĩnh viễn cả tiến trình.
    $completed = $netTask.Wait($WinRtCallTimeoutMs)

    if (-not $completed) {
        throw "WinRT operation timeout sau ${WinRtCallTimeoutMs}ms (nghi ngo deadlock hoac SMTC khong phan hoi)"
    }

    return $netTask.Result
}

function Get-UnixTimeMs {
    return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

# ---------------------------------------------------------------
# BƯỚC 2 — Chọn ĐÚNG 1 session "tốt nhất" trong số nhiều session có thể
# đang tồn tại. Ưu tiên:
#   1. Session đang PlaybackStatus = Playing VÀ trùng GetCurrentSession()
#   2. Bất kỳ session nào đang PlaybackStatus = Playing
#   3. GetCurrentSession() dù không rõ trạng thái Playing
#   4. null (không có gì đáng tin để trả về)
# Đây là heuristic để giảm rủi ro "chọn nhầm app" đã nêu trong báo cáo
# nghiên cứu trước — không có cách nào chắc chắn 100% từ SMTC.
# ---------------------------------------------------------------
function Select-BestSession {
    param($AllSessions, $CurrentSession)

    $currentAppId = if ($CurrentSession) { $CurrentSession.SourceAppUserModelId } else { $null }
    $playingSessions = @()

    foreach ($s in $AllSessions) {

        try {

            $playbackInfo = $s.GetPlaybackInfo()

            if ($playbackInfo -and $playbackInfo.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {

                $playingSessions += $s

            }

        } catch { }

    }

    if ($currentAppId) {

        $match = $playingSessions | Where-Object { $_.SourceAppUserModelId -eq $currentAppId } | Select-Object -First 1
        if ($match) { return $match }

    }

    if ($playingSessions.Count -gt 0) { return $playingSessions[0] }

    if ($CurrentSession) { return $CurrentSession }

    return $null

}

# ---------------------------------------------------------------
# BƯỚC 3 — Lấy 1 snapshot, đúng contract output của WindowsMediaSession.js.
# Thumbnail: CHƯA đọc nội dung ảnh thật (đọc IRandomAccessStreamReference
# rồi encode base64 là thao tác nhị phân phức tạp, không thể kiểm thử
# trong môi trường hiện tại của Claude) — trả về null, đúng ví dụ mẫu
# trong đề bài ("thumbnail": null). Đây là giới hạn CÓ CHỦ ĐÍCH, không
# phải quên làm — xem báo cáo.
# ---------------------------------------------------------------
function Get-Snapshot {

    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
    $managerOperation = $managerType::RequestAsync()
    $manager = Wait-WinRtOperation -WinRtTask $managerOperation -ResultType $managerType

    $allSessions = $manager.GetSessions()

    if (-not $allSessions -or $allSessions.Count -eq 0) {
        return $null
    }

    $currentSession = $null
    try { $currentSession = $manager.GetCurrentSession() } catch { }

    $best = Select-BestSession -AllSessions $allSessions -CurrentSession $currentSession

    if (-not $best) { return $null }

    $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
    $propsOperation = $best.TryGetMediaPropertiesAsync()
    $props = Wait-WinRtOperation -WinRtTask $propsOperation -ResultType $propsType

    if (-not $props -or (-not $props.Title -and -not $props.Artist)) {
        # Có session nhưng không có metadata gì hữu ích -> coi như không có
        # gì đáng tin để trả, KHÔNG bịa title rỗng.
        return $null
    }

    return @{
        application = $best.SourceAppUserModelId
        title       = $props.Title
        artist      = $props.Artist
        album       = $props.AlbumTitle
        thumbnail   = $null
        timestamp   = Get-UnixTimeMs
    }

}

# ---------------------------------------------------------------
# BƯỚC 4 — Báo sẵn sàng, rồi vào vòng lặp polling sống lâu dài.
# ---------------------------------------------------------------
Write-JsonLine @{ type = "ready"; pid = $PID }

while ($true) {

    try {

        $snapshot = Get-Snapshot
        Write-JsonLine @{ type = "snapshot"; data = $snapshot }

    } catch {

        # Lỗi khi đọc snapshot lần này -> báo lỗi TẠM THỜI, KHÔNG thoát
        # tiến trình, KHÔNG throw ra ngoài — vòng lặp vẫn tiếp tục ở lần
        # poll kế tiếp.
        Write-JsonLine @{ type = "error"; message = $_.Exception.Message }

    }

    Start-Sleep -Milliseconds $PollIntervalMs

}
