"use strict";
/**
 * SILENT-CLICK-01 — "Bấm ngầm" vào 1 điểm trên màn hình mà KHÔNG di chuyển con trỏ chuột.
 * Dùng cho plugin Antares Auto-Key (nút "Send to Auto-Tune"... không cho DAW điều khiển bằng MIDI).
 * Cách làm (chỉ Windows): từ toạ độ màn hình đã lưu ở Setup -> tìm đúng cửa sổ con tại điểm đó
 * (WindowFromPoint + ChildWindowFromPointEx) -> PostMessage WM_LBUTTONDOWN/UP với toạ độ trong cửa sổ đó.
 * Con trỏ thật KHÔNG nhúc nhích, người dùng vẫn dùng chuột bình thường.
 * Giới hạn: cửa sổ plugin phải hiện (không bị cửa sổ khác che đúng điểm đó) và plugin phải nhận được thông điệp chuột.
 * Không dialog/IPC ở đây (việc của app/main.js) để test được bằng Node thuần.
 */
const { execFile } = require("child_process");

const PS_SCRIPT = (x, y) => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SilentClickW {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr h, POINT p, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
}
"@
$dpi = [SilentClickW]::SetProcessDPIAware()
$scr = [SilentClickW]::GetSystemMetrics(0).ToString() + 'x' + [SilentClickW]::GetSystemMetrics(1).ToString()
$sp = New-Object SilentClickW+POINT
$sp.X = ${Math.round(x)}
$sp.Y = ${Math.round(y)}
$h = [SilentClickW]::WindowFromPoint($sp)
if ($h -eq [IntPtr]::Zero) { Write-Output ('NO_WINDOW x=' + $sp.X + ' y=' + $sp.Y + ' manHinh=' + $scr + ' dpiAware=' + $dpi); exit 0 }
for ($i = 0; $i -lt 12; $i++) {
    $cp = New-Object SilentClickW+POINT
    $cp.X = $sp.X; $cp.Y = $sp.Y
    [void][SilentClickW]::ScreenToClient($h, [ref]$cp)
    $c = [SilentClickW]::ChildWindowFromPointEx($h, $cp, 5)
    if ($c -eq [IntPtr]::Zero -or $c -eq $h) { break }
    $h = $c
}
$cc = New-Object SilentClickW+POINT
$cc.X = $sp.X; $cc.Y = $sp.Y
[void][SilentClickW]::ScreenToClient($h, [ref]$cc)
$lp = [IntPtr](($cc.Y -shl 16) -bor ($cc.X -band 0xFFFF))
$sb = New-Object System.Text.StringBuilder 256
[void][SilentClickW]::GetClassName($h, $sb, 256)
[void][SilentClickW]::PostMessage($h, 0x0200, [IntPtr]::Zero, $lp)
Start-Sleep -Milliseconds 40
[void][SilentClickW]::PostMessage($h, 0x0201, [IntPtr]1, $lp)
Start-Sleep -Milliseconds 70
[void][SilentClickW]::PostMessage($h, 0x0202, [IntPtr]::Zero, $lp)
Write-Output ('OK class=' + $sb.ToString() + ' hwnd=' + $h.ToInt64() + ' client=' + $cc.X + ',' + $cc.Y + ' manHinh=' + $scr)
`;

function encode(script) { return Buffer.from(script, "utf16le").toString("base64"); }

function run(file, args, timeoutMs, exec) {
    return new Promise((resolve) => {
        exec(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
            resolve({ err, out: String(stdout || "").trim(), errText: String(stderr || "").trim() });
        });
    });
}

// Trả { ok, detail }. deps.exec / deps.platform dùng cho test.
async function silentClick(x, y, deps = {}) {
    const platform = deps.platform || process.platform;
    const exec = deps.exec || execFile;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, detail: "Thiếu toạ độ x/y hợp lệ" };
    }
    if (platform !== "win32") return { ok: false, detail: "Bấm ngầm chỉ chạy trên Windows" };
    const r = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encode(PS_SCRIPT(x, y))], 15000, exec);
    if (r.err) return { ok: false, detail: "Bấm ngầm lỗi: " + (r.errText || r.err.message || "").slice(0, 300) };
    if (!r.out.startsWith("OK")) return { ok: false, detail: "Không có cửa sổ tại điểm này (" + (r.out || "không phản hồi") + ")" };
    return { ok: true, detail: r.out };
}

module.exports = { silentClick, PS_SCRIPT, encode };
