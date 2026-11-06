/**
 * core/integration/WindowHider.js — HIDE-DAW-01
 * ---------------------------------------------------------------------------
 * ẨN / HIỆN cửa sổ chính của một chương trình ĐANG CHẠY (vd DAW Studio Pro) theo đường dẫn .exe đã cấu hình, bằng Win32 (user32) qua PowerShell.
 * "Ẩn" = SW_HIDE (cửa sổ biến mất khỏi Taskbar/Alt-Tab; tiến trình vẫn chạy bình thường, vẫn nhận MIDI và xử lý audio) — KHÁC với minimize.
 * Module Node THUẦN (không require electron). Trình chạy PowerShell được tiêm vào để test; KHÔNG BAO GIỜ throw — mọi lỗi trả về trong kết quả.
 * Chỉ Windows. Trên hệ khác trả { ok:false, reason:"UNSUPPORTED_PLATFORM" }.
 * A98 (DAW-WINDOW-CONTROLLER-01) — KIỂM CHỨNG SAU KHI THAO TÁC: ẨN xong chờ ~0,25 s rồi kiểm tra cửa sổ thật sự không còn hiện (không báo thành công khi API không có tác dụng);
 * phát hiện cửa sổ đang "Not Responding" (IsHungAppWindow) để báo rõ; HIỆN xong kiểm tra đã hiện, nếu đang minimize thì restore, nếu nằm ngoài mọi màn hình thì đưa về trong màn hình.
 * probe() cho biết DAW đang chạy hay chưa (3 trạng thái ở lớp trên: chưa chạy / đang hiện / đang ẩn).
 * A99 (DAW-RECOGNITION-01) — NHẬN DIỆN TIẾN TRÌNH DÙNG CHUNG cho status/hide/show: đọc ExecutablePath qua CIM Win32_Process (tin cậy hơn Get-Process.Path vốn trả rỗng khi
 * không đọc được MainModule, vd tiến trình chạy quyền cao hơn); dự phòng Get-Process nếu CIM lỗi. So đường dẫn đã chuẩn hóa (GetFullPath, bỏ '\\' cuối), KHÔNG phân biệt hoa/thường.
 * Chỉ nhận tiến trình có ĐÚNG đường dẫn đã cấu hình (không nhận DAW khác chỉ vì trùng tên). Không đọc được đường dẫn / lỗi truy vấn => KHÔNG kết luận "chưa chạy" (trạng thái unknown + lý do).
 * A100 (DAW-HIDE-SHOW-STATE-RECOVERY-FIX-01) — xác minh ẩn/hiện CHỜ TỐI ĐA ~2 s (ShowWindowAsync là bất đồng bộ; bản A98/A99 chỉ chờ 0,25 s nên DAW nặng có thể bị báo
 * "chưa ẩn được" dù cửa sổ ẨN SAU ĐÓ => mất danh sách cửa sổ); kết quả trả thêm attempted (mọi cửa sổ đã gửi lệnh) + diag (hwnd/pid/V|H/tiêu đề) để ghi nhật ký; thêm showAny() khôi phục theo cửa sổ đang ẩn.
 * Quy tắc chọn cửa sổ khi ẨN: cửa sổ top-level của đúng tiến trình, đang hiện, KHÔNG có owner, có tiêu đề, không phải tool-window.
 * (Cửa sổ plugin thường là cửa sổ có owner nên tự ẩn theo cửa sổ chính; việc ẩn riêng plugin là tính năng khác, KHÔNG nằm ở đây.)
 */
'use strict';

const { spawn, spawnSync } = require('child_process');

// A101: nhật ký vết mọi lần chạy PowerShell (DawTray gắn vào bằng setTrace) — để biết chính xác bước nào thất bại.
let trace = () => {};
function setTrace(f) { trace = typeof f === 'function' ? f : () => {}; }
const tr = (m) => { try { trace(m); } catch (e) { /* bỏ qua */ } };

function defaultRunner(script, cb) {
    if (process.platform !== 'win32') { tr('PS bỏ qua: không phải Windows (' + process.platform + ')'); cb(new Error('UNSUPPORTED_PLATFORM'), null); return; }
    let done = false, out = '', errOut = '', ps;
    try { tr('PS spawn, độ dài script=' + script.length); ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }); }
    catch (e) { tr('PS spawn LỖI: ' + (e && e.message)); cb(e, null); return; }
    const timer = setTimeout(() => { if (done) return; done = true; tr('PS QUÁ 15 s — kill. out=' + out.slice(0, 300) + ' err=' + errOut.slice(0, 300)); try { ps.kill(); } catch (e) { /* bỏ qua */ } cb(new Error('TIMEOUT'), null); }, 15000);
    ps.stdout.on('data', (d) => { out += d.toString(); });
    ps.stderr.on('data', (d) => { errOut += d.toString(); });
    ps.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); tr('PS error: ' + (e && e.message)); cb(e, null); });
    ps.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); tr('PS xong code=' + code + ' out=' + out.trim().slice(0, 600).replace(/\s+/g, ' ') + ' | err=' + errOut.trim().slice(0, 600).replace(/\s+/g, ' ')); if (code !== 0 && !out.trim()) cb(new Error(errOut.trim() || ('powershell exit ' + code)), null); else cb(null, out.trim()); });
}

// Đường dẫn .exe phải là chuỗi Windows hợp lệ, không ký tự điều khiển / ký tự cấm — vì sẽ nằm trong chuỗi PowerShell (đã nhân đôi dấu ' nhưng vẫn chặn từ đầu).
function validateExePath(p) {
    if (typeof p !== 'string' || !p.trim()) return false;
    if (/[\u0000-\u001f"<>|*?]/.test(p)) return false;
    return /\.exe$/i.test(p.trim());
}
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const CSHARP = [
    'using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;',
    'public static class HW {',
    '  delegate bool EnumProc(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);',
    '  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);',
    '  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);',
    '  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);',
    '  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);',
    '  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int n);',
    '  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool IsHungAppWindow(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);',
    '  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);',
    '  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }',
    '  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  static string Clean(string s) { var b = new StringBuilder(); foreach (var c in s) { if (b.Length >= 40) break; b.Append((c == \';\' || c == \'|\' || c == \'~\' || c == \',\' || c < \' \') ? \' \' : c); } return b.ToString(); }',
    '  static string Diag(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); var t = new StringBuilder(256); GetWindowText(h, t, 256); return h.ToInt64() + "/" + pid + "/" + (IsWindowVisible(h) ? "V" : "H") + "/" + Clean(t.ToString()); }',
    '  static bool Settled(List<IntPtr> l, bool wantVisible) { foreach (var h in l) { if (IsWindowVisible(h) != wantVisible) return false; } return true; }',
    '  static string Report(List<IntPtr> all, bool wantVisible, bool hung) {',
    '    var okS = new StringBuilder(); var badS = new StringBuilder(); var allS = new StringBuilder(); var dS = new StringBuilder();',
    '    foreach (var h in all) { var t = (IsWindowVisible(h) == wantVisible) ? okS : badS; if (t.Length > 0) t.Append(","); t.Append(h.ToInt64());',
    '      if (allS.Length > 0) allS.Append(","); allS.Append(h.ToInt64()); if (dS.Length > 0) dS.Append("~"); dS.Append(Diag(h)); }',
    '    return okS.ToString() + ";F:" + badS.ToString() + (hung ? ";HUNG" : "") + ";A:" + allS.ToString() + ";D:" + dS.ToString(); }',
    '  public static string Hide(uint[] pids) {',
    '    var found = new List<IntPtr>(); var set = new HashSet<uint>(pids);',
    '    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);',
    '      if (set.Contains(pid) && IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero && GetWindowTextLength(h) > 0 && (GetWindowLong(h, -20) & 0x80) == 0) found.Add(h); return true; }, IntPtr.Zero);',
    '    bool hung = false; foreach (var h in found) { if (IsHungAppWindow(h)) hung = true; ShowWindowAsync(h, 0); }',
    '    for (int i = 0; i < 20; i++) { System.Threading.Thread.Sleep(100); if (Settled(found, false)) break; }',
    '    return Report(found, false, hung); }',
    '  static string Bring(List<IntPtr> good, bool hung) {',
    '    foreach (var h in good) { if (IsHungAppWindow(h)) hung = true; ShowWindowAsync(h, IsIconic(h) ? 9 : 5); }',
    '    for (int i = 0; i < 20; i++) { System.Threading.Thread.Sleep(100); if (Settled(good, true)) break; }',
    '    IntPtr first = IntPtr.Zero;',
    '    foreach (var h in good) { if (IsWindowVisible(h)) { if (MonitorFromWindow(h, 0) == IntPtr.Zero) SetWindowPos(h, IntPtr.Zero, 100, 100, 0, 0, 0x5); if (first == IntPtr.Zero) first = h; } }',
    '    if (first != IntPtr.Zero) SetForegroundWindow(first);',
    '    return Report(good, true, hung); }',
    '  public static string Show(long[] handles, uint[] pids) {',
    '    var set = new HashSet<uint>(pids); var good = new List<IntPtr>();',
    '    foreach (var v in handles) { var h = new IntPtr(v); if (!IsWindow(h)) continue; uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) continue; good.Add(h); }',
    '    return Bring(good, false); }',
    '  public static string ShowHidden(uint[] pids) {',
    '    var set = new HashSet<uint>(pids); IntPtr best = IntPtr.Zero; long bestArea = 0;',
    '    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); RECT r;',
    '      if (set.Contains(pid) && !IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero && GetWindowTextLength(h) > 0 && (GetWindowLong(h, -20) & 0x80) == 0 && GetWindowRect(h, out r) && (r.R - r.L) >= 200 && (r.B - r.T) >= 150) {',
    '        long a = (long)(r.R - r.L) * (long)(r.B - r.T); if (a > bestArea) { bestArea = a; best = h; } } return true; }, IntPtr.Zero);',
    '    var good = new List<IntPtr>(); if (best != IntPtr.Zero) good.Add(best);',
    '    return Bring(good, false); }',
    '}'
].join('\n');

// Quy tắc nhận diện DÙNG CHUNG (status/hide/show). Đặt: $pids (uint32[] khớp ĐÚNG đường dẫn), $info (chuỗi chẩn đoán), $st = OK | NOPROC | UNREADABLE | MISMATCH | ERR.
//   NOPROC     : không có tiến trình nào cùng TÊN file .exe.
//   UNREADABLE : có tiến trình cùng tên nhưng KHÔNG đọc được đường dẫn (không được coi là "chưa chạy").
//   MISMATCH   : có tiến trình cùng tên nhưng ở đường dẫn KHÁC đường dẫn đã cấu hình (không nhận nhầm DAW khác).
//   ERR        : truy vấn tiến trình lỗi (cả CIM lẫn Get-Process).
// A102 — nhận diện tiến trình DAW theo ĐƯỜNG DẪN (không bao giờ chỉ theo tên). Với mỗi tiến trình trùng tên, đường dẫn được lấy lần lượt từ:
//   1) CIM Win32_Process.ExecutablePath  2) Get-Process .Path (MainModule)  3) QueryFullProcessImageName (quyền PROCESS_QUERY_LIMITED_INFORMATION — đọc được cả khi 1)/2) bị từ chối).
// CIM thoát mã 0 KHÔNG có nghĩa là đã có đường dẫn (log thật: ST=UNREADABLE|U=19308|SRC=CIM). Tiến trình đã thoát (HasExited) không tính là đang chạy.
// Vẫn chỉ nhận khi đường dẫn ĐẦY ĐỦ trùng đường dẫn đã chọn; hết cách đọc => UNREADABLE kèm PID + nguồn đã thử (T=), KHÔNG ép ẩn theo tên.
const PS_IMG_TYPE = '[DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool i, uint pid); '
    + '[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint f, System.Text.StringBuilder s, ref uint n); '
    + '[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h); '
    + 'public static string ImagePath(uint pid, out int err) { err = 0; IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) { err = Marshal.GetLastWin32Error(); return ""; } '
    + 'try { var sb = new System.Text.StringBuilder(1024); uint n = (uint)sb.Capacity; if (!QueryFullProcessImageName(h, 0, sb, ref n)) { err = Marshal.GetLastWin32Error(); return ""; } return sb.ToString(); } finally { CloseHandle(h); } }';

function pidScript(exePath) {
    return '$target = [IO.Path]::GetFullPath(' + psq(exePath.trim()) + ').TrimEnd([char]92); $leaf = [IO.Path]::GetFileName($target); $src = "CIM"; $qerr = ""; $list = @(); '
        + 'function Norm($v) { try { return [IO.Path]::GetFullPath([string]$v).TrimEnd([char]92) } catch { return ([string]$v).TrimEnd([char]92) } } '
        + 'function Msg($e) { $m = ($e.Exception.Message -replace "[\\r\\n|;]+", " "); if ($m.Length -gt 50) { $m = $m.Substring(0, 50) }; return $m } '
        + 'try { $list = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object { $_.Name -ieq $leaf } | ForEach-Object { [pscustomobject]@{ Id = [uint32]$_.ProcessId; Path = [string]$_.ExecutablePath } }) } '
        + 'catch { $src = "PS"; try { $list = @(Get-Process -ErrorAction Stop | Where-Object { ($_.ProcessName + ".exe") -ieq $leaf } | ForEach-Object { [pscustomobject]@{ Id = [uint32]$_.Id; Path = [string]$_.Path } }) } catch { $src = "NONE"; $qerr = ($_.Exception.Message -replace "[\\r\\n|]+", " ") } } '
        + '$match = @(); $unread = @(); $other = @(); $dead = @(); $tried = @(); $apiReady = 0; '
        + 'foreach ($x in $list) { $p = $null; $how = $src; $notes = ""; if ($x.Path) { $p = Norm $x.Path } else { $notes = $src + "=empty" } '
        + 'if (-not $p -and $src -ne "PS") { try { $gp = Get-Process -Id $x.Id -ErrorAction Stop; if ($gp.Path) { $p = Norm $gp.Path; $how = "PS" } else { $notes += ",PS=empty" }; try { if ($gp.HasExited) { $notes += ",EXITED"; $dead += $x.Id } } catch { $notes += ",HasExited=?" } } catch { $notes += ",PS=err:" + (Msg $_) } } '
        + 'if (-not $p -and $dead -notcontains $x.Id) { try { if ($apiReady -eq 0) { Add-Type -Namespace Amw -Name ProcImg -MemberDefinition ' + psq(PS_IMG_TYPE) + ' -ErrorAction Stop; $apiReady = 1 }; $ec = 0; $q = [Amw.ProcImg]::ImagePath([uint32]$x.Id, [ref]$ec); if ($q) { $p = Norm $q; $how = "API" } else { $notes += ",API=err" + $ec } } catch { $notes += ",API=ex:" + (Msg $_) } } '
        + 'if ($p) { if ($p -ieq $target) { $match += $x.Id; $tried += ("" + $x.Id + ":OK via " + $how) } else { $other += $p; $tried += ("" + $x.Id + ":OTHER via " + $how) } } '
        + 'elseif ($dead -contains $x.Id) { $tried += ("" + $x.Id + ":" + $notes) } else { $unread += $x.Id; $tried += ("" + $x.Id + ":" + $notes) } } '
        + '$pids = [uint32[]]$match; '
        + 'if ($src -eq "NONE") { $st = "ERR" } elseif ($match.Count -gt 0) { $st = "OK" } elseif ($unread.Count -gt 0) { $st = "UNREADABLE" } elseif ($other.Count -gt 0) { $st = "MISMATCH" } else { $st = "NOPROC" } '
        + '$info = "INFO|ST=" + $st + "|R=" + ($match -join ",") + "|U=" + ($unread -join ",") + "|O=" + ((@($other) | Select-Object -Unique) -join ";;") + "|SRC=" + $src + "|T=" + ($tried -join ";;") + "|ERR=" + $qerr; ';
}
// Đọc chuỗi chẩn đoán từ PowerShell. Tương thích bản cũ: "NOPROC" trơn = không có tiến trình.
function parseInfo(out) {
    const t = String(out || '');
    const m = /INFO\|ST=(OK|NOPROC|UNREADABLE|MISMATCH|ERR)\|R=([\d,]*)\|U=([\d,]*)\|O=([^|\r\n]*)\|SRC=(\w*)(?:\|T=([^|\r\n]*))?\|ERR=([^\r\n]*)/.exec(t);
    if (!m) return /^\s*NOPROC\s*$/.test(t) ? { st: 'NOPROC', running: [], unreadable: [], others: [], src: '', tried: [], err: '' } : null;
    return { st: m[1], running: parseHandles(m[2]), unreadable: parseHandles(m[3]), others: m[4] ? m[4].split(';;').filter(Boolean) : [], src: m[5], tried: m[6] ? m[6].split(';;').filter(Boolean) : [], err: m[7].trim() };
}
// Đổi kết quả nhận diện "không chạy tiếp được" thành mã lỗi thống nhất cho hide/show. Trả null nếu st === OK.
function identityFailure(info) {
    if (!info) return null;
    if (info.st === 'NOPROC') return { state: 'not_found', reason: 'PROCESS_NOT_RUNNING' };
    if (info.st === 'UNREADABLE') return { state: 'failed', reason: 'PROCESS_PATH_UNREADABLE', unreadable: info.unreadable, tried: info.tried, src: info.src };
    if (info.st === 'MISMATCH') return { state: 'failed', reason: 'DAW_AT_DIFFERENT_PATH', others: info.others };
    if (info.st === 'ERR') return { state: 'failed', reason: 'PROCESS_QUERY_FAILED', detail: info.err };
    return null;
}
// Phần chạy sau khi nhận diện: nếu không có tiến trình khớp thì in $info (kèm lý do) và dừng; có thì chạy đoạn thao tác.
const guarded = (body) => 'if ($st -ne "OK") { $info } else { ' + body + ' }';

function loadType() { return 'Add-Type -TypeDefinition @\'\n' + CSHARP + '\n\'@; '; }

// Kết quả C#: "<danh sách thành công>;F:<danh sách thất bại>[;HUNG]". Bản cũ chỉ có danh sách thành công vẫn đọc được.
function parseOutcome(out, tag) {
    const body = String(out || '').replace(new RegExp('^[\\s\\S]*?' + tag + ':'), '');
    const parts = body.split(';');
    const pick = (p) => (parts.find((x) => x.indexOf(p) === 0) || '').slice(p.length);
    return { ok: parseHandles(parts[0]), failed: parseHandles(pick('F:')), attempted: parseHandles(pick('A:')), diag: pick('D:'), hung: parts.includes('HUNG') };
}

function parseHandles(out) {
    return String(out || '').split(/[\s,]+/).filter((x) => /^\d+$/.test(x)).map((x) => Number(x)).filter((n) => Number.isSafeInteger(n) && n > 0);
}

/** Ẩn cửa sổ chính của chương trình exePath. callback(result): { ok, state, handles, reason } — state: "hidden" | "not_found" | "failed". */
function hide(exePath, cb, runner) {
    if (!validateExePath(exePath)) { cb({ ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' }); return; }
    const run = runner || defaultRunner;
    const script = pidScript(exePath) + guarded(loadType() + '"H:" + [HW]::Hide([uint32[]]$pids)');
    run(script, (err, out) => {
        if (err) { cb({ ok: false, state: 'failed', handles: [], reason: err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err) }); return; }
        const idf = identityFailure(parseInfo(out)); if (idf) { cb({ ok: false, handles: [], ...idf }); return; }
        const o = parseOutcome(out, 'H');
        const handles = o.ok;
        if (!/H:/.test(String(out)) || (!handles.length && !o.failed.length)) { cb({ ok: false, state: 'failed', handles: [], reason: 'NO_WINDOW_FOUND' }); return; }
        if (!handles.length) { cb({ ok: false, state: 'failed', handles: [], failed: o.failed, attempted: o.attempted, diag: o.diag, reason: o.hung ? 'DAW_NOT_RESPONDING' : 'HIDE_NOT_APPLIED' }); return; } // gọi ẩn nhưng cửa sổ vẫn hiện -> KHÔNG báo thành công
        cb({ ok: true, state: 'hidden', handles, failed: o.failed, attempted: o.attempted, diag: o.diag, reason: null });
    });
}

/** Hiện lại các cửa sổ đã ẩn (handles) của chương trình exePath. callback(result): { ok, state, handles, reason } — state: "visible" | "not_found" | "failed". */
function show(exePath, handles, cb, runner) {
    if (!validateExePath(exePath)) { cb({ ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' }); return; }
    const hs = (Array.isArray(handles) ? handles : []).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (!hs.length) { cb({ ok: false, state: 'not_found', handles: [], reason: 'NO_SAVED_WINDOW' }); return; }
    const run = runner || defaultRunner;
    const script = pidScript(exePath) + guarded(loadType() + '"S:" + [HW]::Show([int64[]](' + hs.join(',') + '), [uint32[]]$pids)');
    run(script, (err, out) => {
        if (err) { cb({ ok: false, state: 'failed', handles: [], reason: err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err) }); return; }
        const idf = identityFailure(parseInfo(out)); if (idf) { cb({ ok: false, handles: [], ...idf }); return; }
        const o = parseOutcome(out, 'S'); const shown = o.ok;
        if (!shown.length && o.failed.length) { cb({ ok: false, state: 'failed', handles: [], failed: o.failed, reason: o.hung ? 'DAW_NOT_RESPONDING' : 'SHOW_NOT_APPLIED' }); return; }
        if (!shown.length) { cb({ ok: false, state: 'not_found', handles: [], reason: 'WINDOW_GONE' }); return; }
        cb({ ok: true, state: 'visible', handles: shown, failed: o.failed, diag: o.diag, reason: null });
    });
}

/** KHÔI PHỤC khi mất danh sách cửa sổ đã ẩn (handle cũ không còn / state bị mất): tìm trong tiến trình DAW đúng đường dẫn cửa sổ top-level đang ẨN (có tiêu đề, không owner, không tool-window, >=200x150) và hiện CỬA SỔ LỚN NHẤT.
 *  callback: { ok, state: 'visible'|'not_found'|'failed', handles, reason } — not_found + reason PROCESS_NOT_RUNNING (DAW không chạy) | NO_HIDDEN_WINDOW (DAW chạy nhưng không có cửa sổ nào đang ẩn). */
function showAny(exePath, cb, runner) {
    if (!validateExePath(exePath)) { cb({ ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' }); return; }
    const run = runner || defaultRunner;
    run(pidScript(exePath) + guarded(loadType() + '"S:" + [HW]::ShowHidden([uint32[]]$pids)'), (err, out) => {
        if (err) { cb({ ok: false, state: 'failed', handles: [], reason: err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err) }); return; }
        const idf = identityFailure(parseInfo(out)); if (idf) { cb({ ok: false, handles: [], ...idf }); return; }
        const o = parseOutcome(out, 'S');
        if (!/S:/.test(String(out)) || !o.attempted.length) { cb({ ok: false, state: 'not_found', handles: [], reason: 'NO_HIDDEN_WINDOW' }); return; }
        if (!o.ok.length) { cb({ ok: false, state: 'failed', handles: [], failed: o.failed, diag: o.diag, reason: o.hung ? 'DAW_NOT_RESPONDING' : 'SHOW_NOT_APPLIED' }); return; }
        cb({ ok: true, state: 'visible', handles: o.ok, diag: o.diag, reason: null });
    });
}

/** Bản ĐỒNG BỘ của show() — chỉ dùng lúc thoát app để không bỏ lại DAW đang ẩn. Trả { ok, state, handles, reason }. */
function showSync(exePath, handles) {
    if (process.platform !== 'win32') return { ok: false, state: 'failed', handles: [], reason: 'UNSUPPORTED_PLATFORM' };
    if (!validateExePath(exePath)) return { ok: false, state: 'failed', handles: [], reason: 'INVALID_PATH' };
    const hs = (Array.isArray(handles) ? handles : []).filter((n) => Number.isSafeInteger(n) && n > 0);
    const runSync = (body) => {
        const script = pidScript(exePath) + guarded(loadType() + body);
        const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
        return parseOutcome(r.stdout, 'S').ok;
    };
    try {
        let shown = hs.length ? runSync('"S:" + [HW]::Show([int64[]](' + hs.join(',') + '), [uint32[]]$pids)') : [];
        if (!shown.length) shown = runSync('"S:" + [HW]::ShowHidden([uint32[]]$pids)'); // handle cũ không còn dùng được => tìm cửa sổ ẩn của DAW (lúc thoát Menu)
        return shown.length ? { ok: true, state: 'visible', handles: shown, reason: null } : { ok: false, state: 'not_found', handles: [], reason: 'WINDOW_GONE' };
    } catch (e) { return { ok: false, state: 'failed', handles: [], reason: String((e && e.message) || e) }; }
}

/** Nhận diện DAW (đúng file .exe) bằng CÙNG quy tắc với hide/show. callback({ ok, state, running, pids, unreadable, others, reason, detail }).
 *  state: "running" | "not_running" | "path_mismatch" | "unknown". KHÔNG BAO GIỜ trả "not_running" khi chưa xác minh được (không đọc được đường dẫn / PowerShell lỗi => "unknown" + lý do). */
function probe(exePath, cb, runner) {
    const unk = (reason, extra) => cb({ ok: false, state: 'unknown', running: null, pids: [], unreadable: [], others: [], reason, ...(extra || {}) });
    if (!validateExePath(exePath)) { unk('INVALID_PATH'); return; }
    const run = runner || defaultRunner;
    run(pidScript(exePath) + '$info', (err, out) => {
        if (err) { unk(err.message === 'UNSUPPORTED_PLATFORM' ? 'UNSUPPORTED_PLATFORM' : String(err.message || err)); return; }
        const t = String(out || '').trim();
        if (/^RUN:\d+$/.test(t)) { cb({ ok: true, state: 'running', running: true, pids: [], unreadable: [], others: [], reason: null }); return; } // tương thích bản cũ
        const info = parseInfo(out);
        if (!info) { unk('UNKNOWN_OUTPUT'); return; }
        const base = { pids: info.running, unreadable: info.unreadable, others: info.others, tried: info.tried, src: info.src };
        if (info.st === 'OK') cb({ ok: true, state: 'running', running: true, reason: null, ...base });
        else if (info.st === 'NOPROC') cb({ ok: true, state: 'not_running', running: false, reason: null, ...base });
        else if (info.st === 'MISMATCH') cb({ ok: true, state: 'path_mismatch', running: null, reason: 'DAW_AT_DIFFERENT_PATH', ...base });
        else if (info.st === 'UNREADABLE') cb({ ok: false, state: 'unknown', running: null, reason: 'PROCESS_PATH_UNREADABLE', ...base });
        else cb({ ok: false, state: 'unknown', running: null, reason: 'PROCESS_QUERY_FAILED', detail: info.err, ...base });
    });
}

module.exports = { setTrace, hide, show, showAny, showSync, probe, validateExePath, parseHandles, _scriptsForTest: { pidScript, CSHARP, parseInfo, PS_IMG_TYPE } };
