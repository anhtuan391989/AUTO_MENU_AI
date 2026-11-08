"use strict";
/**
 * app/companion.js — COMPANION-01
 * ===========================================================================
 * Quản lý DAW + YouTube "mở kèm Menu":
 *   1) shouldSkipYoutube(): KHÔNG mở lại YouTube khi mở lại Menu nếu lần trước Menu đã mở YouTube và phiên đó
 *      còn sống (DAW đang chạy; nếu không cấu hình DAW thì dựa vào trình duyệt đã chọn).
 *   2) closeCompanions(): khi Menu thoát (tuỳ chọn "Đóng DAW và Youtube cùng Menu") -> đóng DAW (hộp thoại hỏi
 *      lưu project luôn chọn "No / Don't Save", mặc định KHÔNG lưu) và đóng tab YouTube do Menu mở.
 * Mọi thao tác Windows (tasklist/PowerShell) đi qua hàm tiêm `run`, nên logic test được bằng Node thuần.
 * KHÔNG ép tắt (kill) DAW: nếu DAW không tự đóng trong thời gian chờ thì để nguyên và báo lại.
 */
const path = require("path");
const fs = require("fs");

const STATE_FILE = "companion-state.json";
const exeOf = (p) => (p ? path.win32.basename(String(p)) : ""); // đường dẫn Windows (cả "\\" lẫn "/")

function readState(dir) {
    try { const j = JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), "utf8")); return j && typeof j === "object" ? j : null; } catch (e) { return null; }
}
function writeState(dir, state) {
    try { fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(state), "utf8"); return true; } catch (e) { return false; }
}
function clearState(dir) { try { fs.unlinkSync(path.join(dir, STATE_FILE)); } catch (e) { /* chưa có */ } }

// run(cmd, args) -> Promise<{ code, stdout }>  (tiêm vào để test)
async function isProcessRunning(exe, run) {
    if (!exe) return false;
    try {
        const r = await run("tasklist", ["/FI", "IMAGENAME eq " + exe, "/NH", "/FO", "CSV"]);
        return String(r.stdout || "").toLowerCase().includes('"' + exe.toLowerCase() + '"');
    } catch (e) { return false; }
}

// Trả { skip, reason }. State do chính Menu ghi lúc mở YouTube thành công.
async function shouldSkipYoutube({ state, dawPath, browserPath, run }) {
    if (!state || !state.youtubeOpenedAt) return { skip: false, reason: "chưa từng mở YouTube" };
    const exe = exeOf(dawPath) || exeOf(browserPath);
    if (!exe) return { skip: false, reason: "không biết tiến trình để kiểm tra phiên cũ" };
    const alive = await isProcessRunning(exe, run);
    return alive ? { skip: true, reason: exe + " vẫn đang chạy từ lần trước" } : { skip: false, reason: exe + " không còn chạy (phiên mới)" };
}

// PowerShell: đóng DAW bằng CloseMainWindow; nếu hiện hộp thoại hỏi lưu (có nút Save/Lưu/Yes/Có) thì bấm nút No/Don't Save/Không.
// KHÔNG bao giờ bấm Save/Yes/Cancel. Không kill tiến trình.
const PS_CLOSE_DAW = String.raw`
param([string]$Exe, [int]$TimeoutSec = 25)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$name = [IO.Path]::GetFileNameWithoutExtension($Exe)
if (-not (Get-Process -Name $name)) { 'NOT_RUNNING'; exit 0 }
Get-Process -Name $name | ForEach-Object { [void]$_.CloseMainWindow() }
$no  = @('No', "Don't Save", 'Do not save', 'Dont Save', 'Discard', 'Không', 'Không lưu', 'Khong', 'Khong luu')
$yes = @('Save', 'Yes', 'Lưu', 'Có', 'Luu', 'Co')
$clicked = $false
$end = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $end) {
  if (-not (Get-Process -Name $name)) { if ($clicked) { 'CLOSED_NO_SAVE' } else { 'CLOSED' }; exit 0 }
  $root = [Windows.Automation.AutomationElement]::RootElement
  foreach ($p in (Get-Process -Name $name)) {
    $pc = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    foreach ($w in $root.FindAll([Windows.Automation.TreeScope]::Children, $pc)) {
      $bc = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)
      $btns = $w.FindAll([Windows.Automation.TreeScope]::Descendants, $bc)
      $names = @(); foreach ($b in $btns) { $names += $b.Current.Name }
      $hasYes = $false; foreach ($n in $names) { if ($yes -contains $n) { $hasYes = $true } }
      if (-not $hasYes) { continue }
      foreach ($b in $btns) {
        if ($no -contains $b.Current.Name) {
          try { $b.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke(); $clicked = $true } catch {}
        }
      }
    }
  }
  Start-Sleep -Milliseconds 400
}
if (Get-Process -Name $name) { if ($clicked) { 'STILL_RUNNING_AFTER_NO' } else { 'STILL_RUNNING_NO_DIALOG_BUTTON' } } else { 'CLOSED' }
`;

// PowerShell: đóng TAB YouTube (không đóng cả cửa sổ trình duyệt): đưa cửa sổ lên trước, XÁC NHẬN cửa sổ trước mặt đúng là YouTube, rồi Ctrl+W.
const PS_CLOSE_YOUTUBE = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class W32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); }
"@
Add-Type -AssemblyName System.Windows.Forms
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'YouTube' -and $_.ProcessName -match 'chrome|msedge|brave|firefox|opera|browser|coccoc' }
if (-not $procs) { 'NO_YOUTUBE_WINDOW'; exit 0 }
$n = 0
foreach ($p in $procs) {
  [void][W32]::SetForegroundWindow($p.MainWindowHandle)
  Start-Sleep -Milliseconds 400
  $sb = New-Object System.Text.StringBuilder 512
  [void][W32]::GetWindowText([W32]::GetForegroundWindow(), $sb, 512)
  if ($sb.ToString() -match 'YouTube') { [System.Windows.Forms.SendKeys]::SendWait('^w'); $n++; Start-Sleep -Milliseconds 300 }
}
if ($n -gt 0) { "CLOSED_TAB:$n" } else { 'FOREGROUND_MISMATCH' }
`;

function psArgs(script, extra) {
    const enc = Buffer.from(script, "utf16le").toString("base64");
    return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc].concat(extra || []);
}

async function closeDaw({ dawPath, run }) {
    const exe = exeOf(dawPath);
    if (!exe) return { ok: false, detail: "Chưa có đường dẫn DAW." };
    // Tham số script đưa qua biến đầu script (EncodedCommand không nhận tham số rời) -> nhúng giá trị đã escape.
    const safe = exe.replace(/'/g, "''");
    const script = PS_CLOSE_DAW.replace("param([string]$Exe, [int]$TimeoutSec = 25)", "$Exe = '" + safe + "'; $TimeoutSec = 25");
    const r = await run("powershell.exe", psArgs(script), { timeoutMs: 45000 });
    const out = String(r.stdout || "").trim().split(/\r?\n/).pop();
    return { ok: /^(CLOSED|CLOSED_NO_SAVE|NOT_RUNNING)$/.test(out), detail: out || ("mã " + r.code) };
}
async function closeYoutube({ run }) {
    const r = await run("powershell.exe", psArgs(PS_CLOSE_YOUTUBE), { timeoutMs: 20000 });
    const out = String(r.stdout || "").trim().split(/\r?\n/).pop();
    return { ok: /^(CLOSED_TAB:\d+|NO_YOUTUBE_WINDOW)$/.test(out), detail: out || ("mã " + r.code) };
}

// Đóng cả hai (YouTube trước, DAW sau). Không ném lỗi.
async function closeCompanions({ dawPath, closeDawToo = true, closeYoutubeToo = true, run, log = () => {} }) {
    const res = { daw: null, youtube: null };
    try { if (closeYoutubeToo) { res.youtube = await closeYoutube({ run }); log("đóng YouTube: " + JSON.stringify(res.youtube)); } } catch (e) { res.youtube = { ok: false, detail: String(e.message || e) }; }
    try { if (closeDawToo && dawPath) { res.daw = await closeDaw({ dawPath, run }); log("đóng DAW: " + JSON.stringify(res.daw)); } } catch (e) { res.daw = { ok: false, detail: String(e.message || e) }; }
    return res;
}

module.exports = { STATE_FILE, readState, writeState, clearState, isProcessRunning, shouldSkipYoutube, closeCompanions, closeDaw, closeYoutube, PS_CLOSE_DAW, PS_CLOSE_YOUTUBE, exeOf };
