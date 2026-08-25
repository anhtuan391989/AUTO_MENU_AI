<#
============================================================
AUTO_MENU_AI - Windows SMTC Feasibility Prototype
------------------------------------------------------------
MỤC ĐÍCH DUY NHẤT: In ra Application / Title / Artist / Album /
HasThumbnail của (các) media session đang hoạt động trên Windows,
để CHỨNG MINH khả thi trước khi quyết định tích hợp vào
AUTO_MENU_AI. Đây KHÔNG phải code sản phẩm.

ĐỘC LẬP HOÀN TOÀN — không đụng, không phụ thuộc bất kỳ file nào của
project AUTO_MENU_AI. Không được merge vào project.

⚠️ CHƯA ĐƯỢC TỰ KIỂM THỬ TRÊN WINDOWS THẬT ⚠️
Script này được viết trong môi trường Linux sandbox (không có
Windows/PowerShell/WinRT để chạy thử). Toàn bộ logic dựa trên tài
liệu công khai của Microsoft và pattern cộng đồng đã được xác minh
qua tìm kiếm (không phải suy đoán):
  - API Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager:
    https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager
  - Pattern "Await" cho WinRT IAsyncOperation trong PowerShell (dùng
    reflection qua System.WindowsRuntimeSystemExtensions.AsTask, vì
    PowerShell không có await/async gốc):
    https://fleexlab.blogspot.com/2018/02/using-winrts-iasyncoperation-in.html
    https://rkeithhill.wordpress.com/2013/09/30/calling-winrt-async-methods-from-windows-powershell/

BẮT BUỘC: Khói (hoặc người có máy Windows 10 1809+/Windows 11) tự
chạy và ghi lại kết quả THẬT — báo cáo đi kèm KHÔNG có "kết quả thực
tế tự kiểm thử" từ tôi vì tôi không có môi trường để chạy.

Cách chạy:
    powershell -ExecutionPolicy Bypass -File .\SmtcPrototype.ps1
    powershell -ExecutionPolicy Bypass -File .\SmtcPrototype.ps1 -Once
    powershell -ExecutionPolicy Bypass -File .\SmtcPrototype.ps1 -IntervalSeconds 3
============================================================
#>

param(
    # -Once: chỉ lấy 1 lần rồi thoát, có đo thời gian (ms) — dùng để tự đánh
    # giá độ trễ thực tế thay vì đoán mò.
    [switch]$Once,

    # Chu kỳ polling (giây) khi chạy vòng lặp liên tục (mặc định 2 giây — xem
    # lý do chọn 2s trong báo cáo, mục "Đánh giá độ trễ").
    [int]$IntervalSeconds = 2
)

# ---------------------------------------------------------------
# BƯỚC 1 — Nạp kiểu WinRT cần dùng (không cần cài package nào, đây là
# API có sẵn trong Windows kể từ bản 1809 trở lên).
# ---------------------------------------------------------------
try {

    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

} catch {

    Write-Host "LỖI: Không nạp được kiểu WinRT Windows.Media.Control. Máy này có thể" -ForegroundColor Red
    Write-Host "không phải Windows 10 1809+/Windows 11, hoặc thiếu Windows SDK projection." -ForegroundColor Red
    Write-Host "Chi tiết lỗi: $($_.Exception.Message)" -ForegroundColor Red
    exit 1

}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# ---------------------------------------------------------------
# BƯỚC 2 — Hàm "Await" cho WinRT IAsyncOperation<T> (PowerShell không có
# await/async gốc — đây là kỹ thuật reflection được cộng đồng dùng phổ
# biến, xem link tham khảo ở đầu file).
# ---------------------------------------------------------------
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

# ---------------------------------------------------------------
# BƯỚC 3 — Đọc 1 "lát cắt" (snapshot) toàn bộ media session đang có trên
# Windows tại thời điểm gọi.
# ---------------------------------------------------------------
function Get-SmtcSnapshot {

    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
    $managerOperation = $managerType::RequestAsync()
    $manager = Wait-WinRtOperation -WinRtTask $managerOperation -ResultType $managerType

    # GetSessions()/GetCurrentSession() là hàm ĐỒNG BỘ (không async) theo
    # đúng tài liệu Microsoft — chỉ TryGetMediaPropertiesAsync() là async.
    $allSessions = $manager.GetSessions()
    $currentSession = $manager.GetCurrentSession()
    $currentAppId = if ($currentSession) { $currentSession.SourceAppUserModelId } else { $null }

    $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
    $results = @()

    foreach ($session in $allSessions) {

        $appId = $session.SourceAppUserModelId

        try {

            $propsOperation = $session.TryGetMediaPropertiesAsync()
            $props = Wait-WinRtOperation -WinRtTask $propsOperation -ResultType $propsType

            $hasThumbnail = $false
            try { $hasThumbnail = ($null -ne $props.Thumbnail) } catch { $hasThumbnail = $false }

            $results += [PSCustomObject]@{
                Application  = $appId
                IsCurrent    = ($appId -eq $currentAppId)
                Title        = $props.Title
                Artist       = $props.Artist
                Album        = $props.AlbumTitle
                PlaybackType = $props.PlaybackType
                HasThumbnail = $hasThumbnail
            }

        } catch {

            # 1 session lỗi không được làm hỏng cả snapshot — ghi nhận lỗi
            # riêng cho session đó, các session khác vẫn đọc bình thường.
            $results += [PSCustomObject]@{
                Application  = $appId
                IsCurrent    = ($appId -eq $currentAppId)
                Title        = "(lỗi đọc metadata: $($_.Exception.Message))"
                Artist       = $null
                Album        = $null
                PlaybackType = $null
                HasThumbnail = $false
            }

        }

    }

    return $results

}

# ---------------------------------------------------------------
# BƯỚC 4 — Chế độ -Once: đo thời gian thực tế 1 lần gọi (phục vụ đánh giá
# độ trễ THẬT thay vì ước lượng).
# ---------------------------------------------------------------
if ($Once) {

    $elapsed = Measure-Command { $script:snapshot = Get-SmtcSnapshot }

    Write-Host "=== SMTC Snapshot (1 lần) ===" -ForegroundColor Cyan
    Write-Host "Thời gian lấy dữ liệu: $([math]::Round($elapsed.TotalMilliseconds, 1)) ms`n"

    if ($snapshot.Count -eq 0) {
        Write-Host "(Không có media session nào đang hoạt động)"
    } else {
        $snapshot | Format-Table Application, IsCurrent, Title, Artist, Album, HasThumbnail -AutoSize
    }

    exit 0

}

# ---------------------------------------------------------------
# BƯỚC 5 — Chế độ polling liên tục (mặc định) — Ctrl+C để dừng.
# ---------------------------------------------------------------
Write-Host "=== AUTO_MENU_AI - SMTC Prototype ===" -ForegroundColor Cyan
Write-Host "Polling mỗi $IntervalSeconds giây. Nhấn Ctrl+C để dừng.`n"

while ($true) {

    try {

        $elapsed = Measure-Command { $script:snapshot = Get-SmtcSnapshot }

        Clear-Host
        Write-Host "=== SMTC Snapshot - $(Get-Date -Format 'HH:mm:ss') (mất $([math]::Round($elapsed.TotalMilliseconds,1)) ms) ===" -ForegroundColor Cyan

        if ($snapshot.Count -eq 0) {
            Write-Host "(Không có media session nào đang hoạt động)"
        } else {
            $snapshot | Format-Table Application, IsCurrent, Title, Artist, Album, HasThumbnail -AutoSize
        }

    } catch {

        Write-Host "LỖI khi lấy snapshot: $($_.Exception.Message)" -ForegroundColor Red

    }

    Start-Sleep -Seconds $IntervalSeconds

}
