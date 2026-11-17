"use strict";
/**
 * SILENT-CLICK-01 — "Bấm ngầm" vào 1 điểm trên màn hình mà KHÔNG di chuyển con trỏ chuột.
 * Dùng cho plugin Antares Auto-Key (nút "Send to Auto-Tune"... không cho DAW điều khiển bằng MIDI).
 * Cách làm (chỉ Windows): từ toạ độ màn hình đã lưu ở Setup -> tìm đúng cửa sổ con tại điểm đó
 * (WindowFromPoint + ChildWindowFromPointEx) -> PostMessage WM_LBUTTONDOWN/UP với toạ độ trong cửa sổ đó.
 * Con trỏ thật KHÔNG nhúc nhích, người dùng vẫn dùng chuột bình thường.
 * Giới hạn: cửa sổ plugin phải hiện (không bị cửa sổ khác che đúng điểm đó) và plugin phải nhận được thông điệp chuột.
 * Không dialog/IPC ở đây (việc của app/main.js) để test được bằng Node thuần.
 *
 * AUTOKEY-WINANCHOR-05 — toạ độ THEO CỬA SỔ PLUGIN: lúc "Lấy tọa độ" Auto-Key 1/2, nếu điểm nằm trong cửa sổ có tên kết thúc bằng "Auto-Key"
 * (vd "Beat · Inserts · 5 - Auto-Key") thì lưu thêm { anchor:"Auto-Key", rx, ry } = vị trí TƯƠNG ĐỐI trong cửa sổ đó. Lúc bấm, tìm lại cửa sổ theo tên
 * rồi tính toạ độ màn hình hiện tại => kéo cửa sổ plugin sang chỗ khác vẫn bấm đúng. Toạ độ cũ (không có anchor) chạy y như trước.
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

// ===== AUTOKEY-WINANCHOR-05 =====
const PS_TYPES = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
public static class WinAnchorW {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    // Khớp với AutoHotkey v2 (toạ độ vật lý từng màn hình): ưu tiên Per-Monitor-V2, không được thì System-DPI.
    public static void Aware() { try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); } catch (Exception) { SetProcessDPIAware(); } }
    // Bấm CHUỘT THẬT rất nhanh (~0,25 giây) vào (x,y) rồi trả con trỏ về chỗ cũ. Chỉ bấm khi cửa sổ dưới điểm đó ĐÚNG là cửa sổ có tên kết thúc bằng suffix (không bị che).
    public static string RealClick(int x, int y, string suffix) {
        POINT old; GetCursorPos(out old);
        POINT p = new POINT(); p.X = x; p.Y = y;
        IntPtr h = WindowFromPoint(p);
        if (h == IntPtr.Zero) return "NO_WINDOW";
        IntPtr root = GetAncestor(h, 2); if (root == IntPtr.Zero) root = h;
        string t = TitleOf(root);
        if (!t.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)) return "COVERED\\t" + t;
        SetCursorPos(x, y); Thread.Sleep(60);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(80);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(60);
        SetCursorPos(old.X, old.Y);
        return "OK\\t" + t;
    }
    public static string TitleOf(IntPtr h) { StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
    // Tìm cửa sổ ĐANG HIỆN (không thu nhỏ) có tên kết thúc bằng suffix. Trả "OK<TAB>tên<TAB>left<TAB>top" / "MINIMIZED" / "NOT_FOUND".
    public static string FindByTitleSuffix(string suffix) {
        string res = "NOT_FOUND";
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            string t = TitleOf(h);
            if (t.Length == 0 || !t.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)) return true;
            if (IsIconic(h)) { res = "MINIMIZED"; return true; }
            RECT r; if (!GetWindowRect(h, out r) || (r.Right - r.Left) < 50) return true;
            res = "OK\\t" + t + "\\t" + r.Left + "\\t" + r.Top; return false;
        }, IntPtr.Zero);
        return res;
    }
}
"@
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[WinAnchorW]::Aware()
`;
const PS_DESCRIBE = (x, y) => PS_TYPES + `
$sp = New-Object WinAnchorW+POINT
$sp.X = ${Math.round(x)}
$sp.Y = ${Math.round(y)}
$h = [WinAnchorW]::WindowFromPoint($sp)
if ($h -eq [IntPtr]::Zero) { Write-Output 'NO_WINDOW'; exit 0 }
$root = [WinAnchorW]::GetAncestor($h, 2)
if ($root -eq [IntPtr]::Zero) { $root = $h }
$r = New-Object WinAnchorW+RECT
[void][WinAnchorW]::GetWindowRect($root, [ref]$r)
Write-Output ('OK' + [char]9 + [WinAnchorW]::TitleOf($root) + [char]9 + $r.Left + [char]9 + $r.Top)
`;
const PS_FIND = (suffix) => PS_TYPES + `
Write-Output ([WinAnchorW]::FindByTitleSuffix('${suffix}'))
`;
const PS_REALCLICK = (x, y, suffix) => PS_TYPES + `
Write-Output ([WinAnchorW]::RealClick(${Math.round(x)}, ${Math.round(y)}, '${suffix}'))
`;
const ANCHOR_RX = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,38}$/; // chặn ký tự lạ trước khi nhúng vào script

async function runPs(script, exec) {
    return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encode(script)], 15000, exec);
}

// Cửa sổ nằm dưới điểm (x,y) màn hình: { ok, title, left, top } — hoặc { ok:false, detail }
async function describeWindowAt(x, y, deps = {}) {
    const platform = deps.platform || process.platform, exec = deps.exec || execFile;
    if (platform !== "win32") return { ok: false, detail: "Chỉ chạy trên Windows" };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, detail: "Thiếu toạ độ" };
    const r = await runPs(PS_DESCRIBE(x, y), exec);
    if (r.err) return { ok: false, detail: (r.errText || r.err.message || "lỗi").slice(0, 200) };
    const f = r.out.split("\t");
    if (f[0] !== "OK") return { ok: false, detail: r.out || "không phản hồi" };
    return { ok: true, title: f[1] || "", left: Number(f[2]), top: Number(f[3]) };
}

// Tìm cửa sổ theo đuôi tên (vd "Auto-Key"): { ok, title, left, top } — hoặc { ok:false, detail }
async function findWindowBySuffix(suffix, deps = {}) {
    const platform = deps.platform || process.platform, exec = deps.exec || execFile;
    if (platform !== "win32") return { ok: false, detail: "Chỉ chạy trên Windows" };
    if (typeof suffix !== "string" || !ANCHOR_RX.test(suffix)) return { ok: false, detail: "Tên cửa sổ neo không hợp lệ" };
    const r = await runPs(PS_FIND(suffix), exec);
    if (r.err) return { ok: false, detail: (r.errText || r.err.message || "lỗi").slice(0, 200) };
    const f = r.out.split("\t");
    if (f[0] === "OK") return { ok: true, title: f[1], left: Number(f[2]), top: Number(f[3]) };
    if (f[0] === "MINIMIZED") return { ok: false, detail: "Cửa sổ '" + suffix + "' đang thu nhỏ — hãy mở plugin lên rồi thử lại" };
    return { ok: false, detail: "Không thấy cửa sổ '" + suffix + "' đang mở — hãy mở plugin " + suffix + " lên rồi thử lại" };
}

// Gắn neo cửa sổ vào 1 điểm vừa lấy ở Setup. Chỉ gắn khi điểm nằm trong cửa sổ có tên KẾT THÚC bằng "Auto-Key"; ngược lại giữ nguyên điểm (toạ độ màn hình).
async function anchorPoint(pt, deps = {}) {
    try {
        if (!pt || typeof pt.x !== "number" || typeof pt.y !== "number") return pt;
        const d = await describeWindowAt(pt.x, pt.y, deps);
        if (!d.ok) return pt;
        const m = /auto-?key$/i.exec(d.title.trim());
        if (!m) return pt;
        return Object.assign({}, pt, { anchor: m[0], anchorTitle: d.title, rx: pt.x - d.left, ry: pt.y - d.top });
    } catch (e) { return pt; }
}

// Bấm chuột THẬT nhanh vào (x,y) màn hình rồi trả con trỏ về chỗ cũ; chỉ bấm khi dưới điểm đó đúng là cửa sổ "...suffix". { ok, detail }
async function realClickAt(x, y, suffix, deps = {}) {
    const platform = deps.platform || process.platform, exec = deps.exec || execFile;
    if (platform !== "win32") return { ok: false, detail: "Chỉ chạy trên Windows" };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, detail: "Thiếu toạ độ hợp lệ" };
    if (typeof suffix !== "string" || !ANCHOR_RX.test(suffix)) return { ok: false, detail: "Tên cửa sổ neo không hợp lệ" };
    const r = await runPs(PS_REALCLICK(x, y, suffix), exec);
    if (r.err) return { ok: false, detail: "Bấm lỗi: " + (r.errText || r.err.message || "").slice(0, 200) };
    const f = r.out.split("\t");
    if (f[0] === "OK") return { ok: true, detail: "đã bấm chuột thật nhanh tại (" + Math.round(x) + "," + Math.round(y) + "), con trỏ đã trả về chỗ cũ" };
    if (f[0] === "COVERED") return { ok: false, detail: "Điểm cần bấm đang bị cửa sổ khác che ('" + (f[1] || "?") + "') — đưa cửa sổ " + suffix + " lên trên rồi thử lại" };
    return { ok: false, detail: "Không có cửa sổ tại điểm cần bấm (" + (r.out || "không phản hồi") + ")" };
}

// Bấm 1 điểm đã lưu: CÓ anchor -> tính lại toạ độ màn hình theo vị trí cửa sổ hiện tại rồi bấm CHUỘT THẬT nhanh + trả con trỏ (plugin JUCE bỏ qua thông điệp chuột gửi ngầm —
// Khói thử: "không phản ứng gì"); KHÔNG có anchor (toạ độ cũ) -> bấm ngầm theo toạ độ tuyệt đối như trước.
async function silentClickPoint(pt, deps = {}) {
    if (pt && typeof pt.anchor === "string" && Number.isFinite(pt.rx) && Number.isFinite(pt.ry)) {
        const w = await findWindowBySuffix(pt.anchor, deps);
        if (!w.ok) return { ok: false, detail: w.detail };
        const r = await realClickAt(w.left + pt.rx, w.top + pt.ry, pt.anchor, deps);
        return r.ok ? { ok: true, detail: "theo cửa sổ '" + w.title + "' (" + w.left + "," + w.top + ") — " + r.detail } : r;
    }
    return silentClick(pt && pt.x, pt && pt.y, deps);
}

module.exports = { silentClick, PS_SCRIPT, encode, describeWindowAt, findWindowBySuffix, anchorPoint, silentClickPoint, realClickAt, PS_DESCRIBE, PS_FIND, PS_REALCLICK };
