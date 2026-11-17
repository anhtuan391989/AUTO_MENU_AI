# AUTOKEY-PROBE-01 — Dò xem Windows có "nhìn thấy" các nút của plugin Auto-Key (và Auto-Tune) không (UI Automation).
# CHỈ ĐỌC: không bấm, không sửa gì. Ghi kết quả ra file AutoKeyProbe-KETQUA.txt cạnh file này.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$out = Join-Path $PSScriptRoot "AutoKeyProbe-KETQUA.txt"
$nameRx = 'Auto-Key|Auto-Tune|Antares'          # tên cửa sổ plugin
$procRx = 'Studio ?One|Studio ?Pro|Fender'                  # cửa sổ thuộc Studio One / Fender Studio Pro
$maxDepth = 12; $maxPerWindow = 1500
$lines = New-Object System.Collections.Generic.List[string]
function Add-L($s) { $lines.Add($s) | Out-Null; Write-Host $s }

$root = [System.Windows.Automation.AutomationElement]::RootElement
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
Add-L ("Thời điểm: " + (Get-Date) + " — số cửa sổ cấp cao nhất: " + $wins.Count)
Add-L "--- Danh sách TẤT CẢ cửa sổ đang mở (để biết công cụ nhìn thấy gì) ---"
foreach ($x in $wins) { try { $xp = ""; try { $xp = (Get-Process -Id $x.Current.ProcessId -ErrorAction Stop).ProcessName } catch {}; Add-L ("  * '" + $x.Current.Name + "'  (tiến trình: " + $xp + ")") } catch {} }
$summary = @()
foreach ($w in $wins) {
    try {
        $wn = [string]$w.Current.Name
        $pn = ""; try { $pn = (Get-Process -Id $w.Current.ProcessId -ErrorAction Stop).ProcessName } catch {}
        if ($pn -match 'WinRAR|7zFM|explorer|notepad|chrome|msedge') { continue }  # bỏ qua cửa sổ không liên quan (vd gói zip tên Auto-Key)
        if (($wn -notmatch $nameRx) -and ($pn -notmatch $procRx)) { continue }
        Add-L ""; Add-L ("=== CỬA SỔ: '" + $wn + "'  (tiến trình: " + $pn + ", lớp: " + $w.Current.ClassName + ")")
        $script:count = 0; $script:named = 0; $script:invoke = 0
        function Walk($el, $depth) {
            if ($script:count -ge $maxPerWindow -or $depth -gt $maxDepth) { return }
            $script:count++
            $c = $el.Current; $inv = $false
            try { foreach ($p in $el.GetSupportedPatterns()) { if ($p.ProgrammaticName -like '*Invoke*') { $inv = $true } } } catch {}
            if ($c.Name) { $script:named++ }
            if ($inv) { $script:invoke++ }
            $r = $c.BoundingRectangle
            $pad = ('  ' * $depth)
            Add-L ($pad + "[" + $c.ControlType.ProgrammaticName.Replace('ControlType.','') + "] '" + $c.Name + "' id='" + $c.AutomationId + "' class='" + $c.ClassName + "' invoke=" + $inv + " rect=" + [int]$r.X + "," + [int]$r.Y + "," + [int]$r.Width + "x" + [int]$r.Height)
            $ch = $walker.GetFirstChild($el)
            while ($ch -ne $null) { Walk $ch ($depth + 1); $ch = $walker.GetNextSibling($ch) }
        }
        Walk $w 0
        $summary += ("Cửa sổ '" + $wn + "': " + $script:count + " phần tử, " + $script:named + " có tên, " + $script:invoke + " bấm được (Invoke)")
    } catch { Add-L ("(bỏ qua 1 cửa sổ: " + $_.Exception.Message + ")") }
}
Add-L ""; Add-L "===== TÓM TẮT ====="
if ($summary.Count -eq 0) { Add-L "KHÔNG tìm thấy cửa sổ Studio One / Auto-Key / Auto-Tune. Hãy mở Studio One + cửa sổ plugin Auto-Key (không thu nhỏ) rồi chạy lại. Nếu Studio One đang mở mà vẫn không thấy: bấm CHUỘT PHẢI AutoKeyProbe.bat > Run as administrator (Studio One có thể đang chạy quyền Admin)." }
else { $summary | ForEach-Object { Add-L $_ } }
$lines | Out-File -FilePath $out -Encoding UTF8
Write-Host ""; Write-Host ("Đã ghi kết quả vào: " + $out)
