<#
============================================================
AUTO_MENU_AI — core/integration/smtc-daemon.ps1
------------------------------------------------------------
Tiến trình PowerShell SỐNG LÂU DÀI (không bị spawn lại mỗi lần poll).
Node (WindowsMediaSession.js) spawn tiến trình này ĐÚNG 1 LẦN, giữ nó
chạy suốt vòng đời tính năng, đọc từng dòng JSON in ra stdout.

Giao thức (1 dòng JSON / lần, kết thúc bằng \n):
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

⚠️ Kế thừa nguyên trạng thái CHƯA ĐƯỢC TỰ KIỂM THỬ từ báo cáo nghiên
cứu khả thi trước đó (Claude không có môi trường Windows để chạy thử).
Logic dựa trên tài liệu chính thức Windows.Media.Control (WinRT) +
pattern PowerShell "Await" cho WinRT IAsyncOperation, đã dẫn nguồn ở
prototype trước. Bản này CHỈ khác prototype ở chỗ: in JSON theo dòng
thay vì bảng, chọn ĐÚNG 1 session "tốt nhất" thay vì liệt kê tất cả
(theo đúng contract output của WindowsMediaSession.js).
============================================================
#>

param(
    [int]$PollIntervalMs = 2000
)

$ErrorActionPreference = "Stop"

function Write-JsonLine {
    param($Object)

    # -Compress để đảm bảo TOÀN BỘ object nằm gọn trên 1 DÒNG (giao thức
    # yêu cầu 1 JSON / 1 dòng để Node đọc theo line dễ dàng, không cần
    # gộp nhiều dòng lại mới parse được).
    $json = $Object | ConvertTo-Json -Compress -Depth 5
    Write-Output $json
}

# ---------------------------------------------------------------
# BƯỚC 1 — Nạp kiểu WinRT. Thất bại ở đây là FATAL (không thể phục hồi
# bằng cách thử lại — máy không hỗ trợ, không phải lỗi tạm thời).
# ---------------------------------------------------------------
try {

    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

} catch {

    Write-JsonLine @{ type = "fatal"; message = "Khong nap duoc WinRT Windows.Media.Control: $($_.Exception.Message)" }
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
    $netTask.Wait(-1) | Out-Null
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
