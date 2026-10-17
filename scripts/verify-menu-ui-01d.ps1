<#
 verify-menu-ui-01d.ps1  -  MENU-UI-01D
 Chay tren Windows PowerShell 5.1 hoac PowerShell 7. File nay chi chua ky tu ASCII (de tranh loi ma hoa).
 CACH CHAY (trong thu muc du an):
     powershell -ExecutionPolicy Bypass -File scripts\verify-menu-ui-01d.ps1
 SCRIPT NAY:
   - Chay kiem tra TU DONG (node --check, test mock/tinh, git diff --check).
   - KHONG chay giao dien Electron va KHONG tu dien PASS cho muc runtime A1-D.
   - Muc runtime chi duoc tinh khi BAN tu sua file artifacts\MENU-UI-01D\RUNTIME-CHECKLIST.md
     (doi dong "KET_QUA: NOT RUN" thanh PASS hoac FAIL sau khi tu thu tren Windows that).
 KET QUA ghi vao: artifacts\MENU-UI-01D\run-<thoi-gian>\results.md va results.log
#>
$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$OutDir = Join-Path $RepoRoot ("artifacts/MENU-UI-01D/run-" + $Stamp)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$LogFile = Join-Path $OutDir 'results.log'
$MdFile  = Join-Path $OutDir 'results.md'
$Checklist = Join-Path $RepoRoot 'artifacts/MENU-UI-01D/RUNTIME-CHECKLIST.md'

function Log([string]$Text) {
    Write-Host $Text
    Add-Content -Path $LogFile -Value $Text -Encoding UTF8
}

$Rows = New-Object System.Collections.ArrayList

function Invoke-Step {
    param([string]$Id, [string]$Kind, [string]$Exe, [string[]]$Arguments, [string]$Note = '')
    $cmdText = $Exe + ' ' + ($Arguments -join ' ')
    Log ''
    Log ('>>> [' + $Id + '] ' + $cmdText)
    $out = ''
    $code = -1
    try {
        $out = (& $Exe @Arguments 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } catch {
        $out = 'KHONG CHAY DUOC LENH: ' + $_.Exception.Message
        $code = -1
    }
    $lines = @($out -split "`r?`n" | Where-Object { $_ -ne '' })
    $tail = $lines | Select-Object -Last 12
    foreach ($l in $tail) { Log ('    ' + $l) }
    $status = 'FAIL'
    if ($code -eq 0) { $status = 'PASS' }
    Log ('<<< [' + $Id + '] exit=' + $code + ' -> ' + $status)
    [void]$Rows.Add([pscustomobject]@{ Id = $Id; Kind = $Kind; Command = $cmdText; Exit = $code; Status = $status; Note = $Note })
    return $status
}

Log '=== MENU-UI-01D verify ==='
Log ('Thoi gian : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Log ('Thu muc   : ' + $RepoRoot)

# ---- 1. Repo / commit / working tree ----
$commit = (& git rev-parse HEAD 2>&1 | Out-String).Trim()
$branch = (& git rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim()
$dirty  = @(& git status --porcelain 2>&1)
$treeClean = ($dirty.Count -eq 0)
Log ('Commit    : ' + $commit)
Log ('Nhanh     : ' + $branch)
if ($treeClean) { Log 'Working tree: SACH' } else {
    Log ('Working tree: CO ' + $dirty.Count + ' thay doi chua commit:')
    $dirty | Select-Object -First 15 | ForEach-Object { Log ('    ' + $_) }
}

# ---- 2. Moi truong ----
$nodeVer = (& node -v 2>&1 | Out-String).Trim()
$npmVer  = (& npm -v 2>&1 | Out-String).Trim()
Log ('Node      : ' + $nodeVer)
Log ('npm       : ' + $npmVer)
$hasModules  = Test-Path (Join-Path $RepoRoot 'node_modules')
$hasElectron = Test-Path (Join-Path $RepoRoot 'node_modules/electron')
Log ('node_modules: ' + $hasModules + ' | electron: ' + $hasElectron + '  (neu False: chay "npm install" truoc khi "npm start")')

# ---- 3. Kiem tra tu dong (MOCK / TINH - KHONG phai runtime Electron) ----
$jsFiles = @('app/main.js', 'app/preload.js', 'ui/js/renderer.js')
foreach ($f in $jsFiles) {
    [void](Invoke-Step -Id ('SYNTAX ' + $f) -Kind 'tinh' -Exe 'node' -Arguments @('--check', $f))
}
[void](Invoke-Step -Id 'GIT DIFF CHECK' -Kind 'tinh' -Exe 'git' -Arguments @('diff', '--check'))

$tests = @('AlwaysOnTopMenuUi01B', 'MenuMinimizeRuntime', 'AutoSongCollector', 'NowPlayingResolver')
foreach ($t in $tests) {
    $note = 'test mock/tinh'
    if (($t -eq 'AutoSongCollector' -or $t -eq 'NowPlayingResolver') -and -not $treeClean) {
        $note = 'test mock/tinh; test nay can working tree SACH - neu FAIL, hay commit roi chay lai'
    }
    [void](Invoke-Step -Id ('TEST ' + $t) -Kind 'mock' -Exe 'node' -Arguments @('tests/unit/' + $t + '.verify.js') -Note $note)
}

# ---- 4. Runtime that: doc checklist do NGUOI DUNG tu dien ----
$ids = @('A1','A2','A3','A4','A5','A6','B1','B2','B3','C1','C2','C3','C4','D')
$runtime = @{}
foreach ($i in $ids) { $runtime[$i] = 'NOT RUN' }
if (Test-Path $Checklist) {
    $cur = $null
    foreach ($line in (Get-Content -Path $Checklist -Encoding UTF8)) {
        if ($line -match '^###\s+(A[1-6]|B[1-3]|C[1-4]|D)\b') { $cur = $Matches[1]; continue }
        if ($cur -and $line -match '^KET_QUA:\s*(PASS|FAIL|NOT RUN)\s*$') { $runtime[$cur] = $Matches[1]; $cur = $null }
    }
} else {
    Log ('CANH BAO: khong thay ' + $Checklist)
}
Log ''
Log '--- Runtime Electron that (doc tu RUNTIME-CHECKLIST.md, script KHONG tu dien) ---'
foreach ($i in $ids) { Log ('    ' + $i + ' : ' + $runtime[$i]) }

# ---- 5. Tong ket ----
$autoFail = @($Rows | Where-Object { $_.Status -ne 'PASS' }).Count
$rtPass   = @($ids | Where-Object { $runtime[$_] -eq 'PASS' }).Count
$rtFail   = @($ids | Where-Object { $runtime[$_] -eq 'FAIL' }).Count
$rtNotRun = @($ids | Where-Object { $runtime[$_] -eq 'NOT RUN' }).Count

if ($autoFail -gt 0 -or $rtFail -gt 0) { $overall = 'FAIL' }
elseif ($rtNotRun -gt 0) { $overall = 'BLOCKED (chua co ket qua runtime Windows that cho ' + $rtNotRun + '/14 muc)' }
else { $overall = 'RELEASE READY (theo checklist runtime do NGUOI DUNG tu xac nhan; script khong tu kiem chung giao dien)' }

Log ''
Log ('TONG KET: ' + $overall)
Log ('  Tu dong (mock/tinh): ' + ($Rows.Count - $autoFail) + ' PASS / ' + $autoFail + ' FAIL')
Log ('  Runtime that       : ' + $rtPass + ' PASS / ' + $rtFail + ' FAIL / ' + $rtNotRun + ' NOT RUN')

# ---- 6. Bao cao Markdown ----
$md = New-Object System.Collections.ArrayList
[void]$md.Add('# MENU-UI-01D - Ket qua chay script')
[void]$md.Add('')
[void]$md.Add('- Thoi gian: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
[void]$md.Add('- Commit: `' + $commit + '` (nhanh `' + $branch + '`)')
[void]$md.Add('- Working tree: ' + $(if ($treeClean) { 'SACH' } else { 'CO THAY DOI CHUA COMMIT (' + $dirty.Count + ')' }))
[void]$md.Add('- Node: ' + $nodeVer + ' | npm: ' + $npmVer + ' | node_modules: ' + $hasModules + ' | electron: ' + $hasElectron)
[void]$md.Add('- **Tong ket: ' + $overall + '**')
[void]$md.Add('')
[void]$md.Add('## Kiem tra tu dong (mock/tinh - KHONG phai runtime Electron)')
[void]$md.Add('')
[void]$md.Add('| Buoc | Loai | Lenh | Exit | Ket qua | Ghi chu |')
[void]$md.Add('|---|---|---|---|---|---|')
foreach ($r in $Rows) { [void]$md.Add('| ' + $r.Id + ' | ' + $r.Kind + ' | `' + $r.Command + '` | ' + $r.Exit + ' | ' + $r.Status + ' | ' + $r.Note + ' |') }
[void]$md.Add('')
[void]$md.Add('## Runtime Windows that (do nguoi dung tu dien trong RUNTIME-CHECKLIST.md)')
[void]$md.Add('')
[void]$md.Add('| Muc | Ket qua |')
[void]$md.Add('|---|---|')
foreach ($i in $ids) { [void]$md.Add('| ' + $i + ' | ' + $runtime[$i] + ' |') }
[void]$md.Add('')
[void]$md.Add('Script khong chay giao dien Electron va khong tu dien PASS cho cac muc tren.')
Set-Content -Path $MdFile -Value $md -Encoding UTF8
Log ''
Log ('Da ghi: ' + $MdFile)
Log ('Da ghi: ' + $LogFile)

if ($autoFail -gt 0 -or $rtFail -gt 0) { exit 1 } else { exit 0 }
