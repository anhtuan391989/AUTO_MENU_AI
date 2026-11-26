/* ASIO-LINK-01 — Mở / Khởi động lại phần mềm ASIO Link Pro (O Deus) từ Setup > Audio khi chọn sai driver hoặc mất tiếng.
 * Module Node thuần (KHÔNG phụ thuộc Electron) -> test được bằng hàm giả. Chỉ chạy trên Windows.
 *   validate(p)      : file .exe tồn tại thật (đường dẫn tuyệt đối).
 *   open(p, deps)    : chạy ASIO Link Pro (tách rời, app Menu đóng không làm nó tắt).
 *   restart(p, deps) : đóng tiến trình CÙNG TÊN file với p (taskkill /IM, KHÔNG qua shell) rồi chạy lại.
 * An toàn: từ chối đóng các tiến trình quan trọng (Explorer, DAW Studio One/Pro, Menu...) dù người dùng lỡ chọn nhầm file.
 * Không bao giờ throw: luôn trả { ok, message, ... }.
 */
'use strict';
const nodeFs = require('fs');
const nodePath = require('path');
const childProcess = require('child_process');

const PROTECTED = new Set([
  'explorer.exe', 'svchost.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'wininit.exe', 'winlogon.exe', 'csrss.exe', 'services.exe', 'lsass.exe',
  'studio one.exe', 'studio pro.exe', 'electron.exe', 'automenuai.exe', 'auto menu ai.exe', 'reaper.exe', 'ableton live.exe', 'fl64.exe', 'cubase.exe'
]);
const KILL_TIMEOUT_MS = 8000;
const TRAY_TIMEOUT_MS = 15000;
const AFTER_KILL_WAIT_MS = 1200; // chờ Windows nhả driver trước khi chạy lại

function validate(p, deps) {
  const fsm = (deps && deps.fs) || nodeFs;
  const pathm = (deps && deps.path) || nodePath;
  try {
    if (typeof p !== 'string' || !p.trim()) return { ok: false, reason: 'no-path', message: 'Chưa chọn file ASIO Link Pro (.exe).' };
    const s = p.trim();
    if (!/\.exe$/i.test(s)) return { ok: false, reason: 'not-exe', message: 'File đã chọn không phải .exe.' };
    if (!pathm.isAbsolute(s)) return { ok: false, reason: 'not-absolute', message: 'Đường dẫn phải đầy đủ (có ổ đĩa).' };
    if (!fsm.existsSync(s) || !fsm.statSync(s).isFile()) return { ok: false, reason: 'missing', message: 'Không tìm thấy file: ' + s };
    return { ok: true, path: s, name: pathm.basename(s) };
  } catch (e) { return { ok: false, reason: 'error', message: 'Không kiểm tra được file: ' + ((e && e.message) || e) }; }
}

function isWin(deps) { return ((deps && deps.platform) || process.platform) === 'win32'; }

function spawnDetached(file, deps) {
  const sp = (deps && deps.spawn) || childProcess.spawn;
  const pathm = (deps && deps.path) || nodePath;
  return new Promise((resolve) => {
    try {
      const child = sp(file, [], { detached: true, stdio: 'ignore', cwd: pathm.dirname(file), windowsHide: false });
      let done = false;
      const fin = (r) => { if (!done) { done = true; resolve(r); } };
      if (child && typeof child.on === 'function') child.on('error', (e) => fin({ ok: false, message: 'Không chạy được: ' + ((e && e.message) || e) }));
      if (child && typeof child.unref === 'function') child.unref();
      setTimeout(() => fin({ ok: true }), (deps && deps.spawnWaitMs) != null ? deps.spawnWaitMs : 400); // không có lỗi 'error' sau ~0,4s = đã chạy
    } catch (e) { resolve({ ok: false, message: 'Không chạy được: ' + ((e && e.message) || e) }); }
  });
}

async function open(p, deps) {
  try {
    if (!isWin(deps)) return { ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' };
    const v = validate(p, deps);
    if (!v.ok) return v;
    const r = await spawnDetached(v.path, deps);
    return r.ok ? { ok: true, message: 'Đã mở ' + v.name + '.' } : { ok: false, reason: 'spawn-failed', message: r.message };
  } catch (e) { return { ok: false, reason: 'error', message: String((e && e.message) || e) }; }
}

function killByName(name, deps) {
  const ex = (deps && deps.execFile) || childProcess.execFile;
  return new Promise((resolve) => {
    try {
      ex('taskkill', ['/IM', name, '/F', '/T'], { windowsHide: true, timeout: KILL_TIMEOUT_MS }, (err, stdout, stderr) => {
        if (!err) { resolve({ killed: true }); return; }
        const code = err && err.code;
        const txt = String(stdout || '') + String(stderr || '') + String((err && err.message) || '');
        // mã 128 / "not found" = KHÔNG có tiến trình nào tên đó đang chạy -> không phải lỗi
        if (code === 128 || /not found|no running instance|không tìm thấy/i.test(txt)) { resolve({ killed: false }); return; }
        resolve({ killed: false, error: (err && err.message) || String(err) });
      });
    } catch (e) { resolve({ killed: false, error: (e && e.message) || String(e) }); }
  });
}


// ---- Bấm chuột TRÁI icon ASIO Link Pro ở khay hệ thống (góc phải dưới) để hiện bảng (Pick driver...) ----
// PowerShell + UI Automation: tìm nút có tên khớp ASIO Link / O Deus / Link Pro trong thanh tác vụ + khay (kể cả mũi tên ^ "biểu tượng ẩn"), bấm bằng Invoke;
// không Invoke được thì bấm chuột thật vào giữa nút. Ưu tiên nút KHÔNG phải nút cửa sổ "Tool" trên thanh tác vụ.

// C#: tìm CỬA SỔ (kể cả đang ẩn xuống khay) theo tiêu đề rồi bắt hiện lên. Không có dấu nháy đơn trong C# (nằm trong chuỗi PowerShell nháy đơn).
const AMWIN_CS = [
  'using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Text.RegularExpressions;',
  'public class AmWin{',
  '[StructLayout(LayoutKind.Sequential)] public struct RECT{ public int L,T,R,B; }',
  'public delegate bool EnumProc(IntPtr h, IntPtr l);',
  '[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);',
  '[DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);',
  '[DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool rp);',
  '[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);',
  '[DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
  '[DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint fl, UIntPtr ex);',
  'static string Title(IntPtr h){ int n=GetWindowTextLength(h); if(n<=0) return null; StringBuilder sb=new StringBuilder(n+1); GetWindowText(h,sb,sb.Capacity); return sb.ToString(); }',
  'static string ClassOf(IntPtr h){ StringBuilder sb=new StringBuilder(256); GetClassName(h,sb,256); return sb.ToString(); }',
  'static string Rc(IntPtr h){ RECT r; GetWindowRect(h,out r); return r.L+","+r.T+","+r.R+","+r.B; }',
  'static long Area(IntPtr h){ RECT r; GetWindowRect(h,out r); return (long)(r.R-r.L)*(long)(r.B-r.T); }',
  // Chọn cửa sổ trùng tên có diện tích lớn nhất (tránh cửa sổ ẩn nhỏ cùng tên), khôi phục/hiện, kéo vào màn hình nếu nằm ngoài, rồi đưa lên trước mọi cửa sổ.
  'public static string Show(string re){ Regex rx=new Regex(re); List<IntPtr> hs=new List<IntPtr>();',
  ' EnumWindows(delegate(IntPtr h, IntPtr l){ string t=Title(h); if(t!=null && rx.IsMatch(t)) hs.Add(h); return true; }, IntPtr.Zero);',
  ' if(hs.Count==0) return null;',
  ' IntPtr hh=hs[0]; long best=-1; foreach(IntPtr h in hs){ long a=Area(h); if(a>best){ best=a; hh=h; } }',
  ' string before=(IsWindowVisible(hh)?"hien":"an")+"|"+(IsIconic(hh)?"thunho":"khongthunho")+"|"+Rc(hh);',
  ' if(IsIconic(hh)) ShowWindow(hh,9); else if(!IsWindowVisible(hh)) ShowWindow(hh,5);',
  ' RECT r; GetWindowRect(hh,out r); int w=r.R-r.L, ht=r.B-r.T;',
  ' string info=hs.Count+" cua so trung ten|truoc: "+before+"|lop: "+ClassOf(hh)+"|"+Title(hh);',
  ' if(w<200 || ht<100) return "SMALL:"+info+"|sau: "+Rc(hh);',
  ' if(r.R<50 || r.B<50 || r.L>10000 || r.T>10000) MoveWindow(hh,120,120,w,ht,true);',
  ' keybd_event(0x12,0,0,UIntPtr.Zero); keybd_event(0x12,0,2,UIntPtr.Zero);',
  ' SetWindowPos(hh,(IntPtr)(-1),0,0,0,0,0x43); SetWindowPos(hh,(IntPtr)(-2),0,0,0,0,0x43);',
  ' BringWindowToTop(hh); SetForegroundWindow(hh);',
  ' return info+"|sau: "+(IsWindowVisible(hh)?"hien":"an")+"|"+Rc(hh); }',
  'public static string Titles(string re){ Regex rx=new Regex(re); List<string> list=new List<string>();',
  ' EnumWindows(delegate(IntPtr h, IntPtr l){ string t=Title(h); if(t!=null && rx.IsMatch(t)) list.Add((IsWindowVisible(h)?"V:":"H:")+t); return true; }, IntPtr.Zero);',
  ' return string.Join(" | ", list.ToArray()); }',
  '}'
].join(' ');

const TRAY_PS = [
  "$ErrorActionPreference='Stop'",
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
  "try {",
  "Add-Type -TypeDefinition '" + AMWIN_CS + "'",
  // CÁCH 1 (chắc nhất): tìm thẳng cửa sổ bảng xanh "O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe" (ẩn xuống khay vẫn là cửa sổ đang tồn tại) -> bắt hiện + đưa lên trước
  "$w=[AmWin]::Show('ASIO\\s*Link\\s*Pro\\s+\\d+(\\.\\d+){2,}\\s*-\\s*\\S.*\\.exe')",
  "if($w -and -not $w.StartsWith('SMALL:')){ 'OK:window:'+$w; exit 0 }",
  // CÁCH 2 (dự phòng): bấm icon ở khay bằng UI Automation
  "Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes",
  "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class AmTrayClick{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);}'",
  "$AE=[System.Windows.Automation.AutomationElement]; $TS=[System.Windows.Automation.TreeScope]",
  "$pat='ASIO\\s*Link'; $want='\\d+(\\.\\d+){2,}\\s*-\\s*\\S.*\\.exe'", // CHỈ icon bảng xanh: tooltip dạng "O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe" (KHÔNG bấm icon Tool màu tím)
  "$btn=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button); $all=[System.Windows.Automation.Condition]::TrueCondition",
  "function Get-Tops { $AE::RootElement.FindAll($TS::Children,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { @('Shell_TrayWnd','Shell_SecondaryTrayWnd','NotifyIconOverflowWindow','TopLevelWindow','XamlExplorerHostIslandWindow','Windows.UI.Core.CoreWindow') -contains $_.Current.ClassName } }",
  "function Find-Icon { foreach($t in @(Get-Tops)){ foreach($b in $t.FindAll($TS::Descendants,$all)){ $nm=$b.Current.Name; if(($nm -match $pat) -and ($nm -match $want)){ return $b } } }; return $null }",
  "$el=Find-Icon",
  "if(-not $el){ foreach($t in Get-Tops){ foreach($b in $t.FindAll($TS::Descendants,$all)){ if($b.Current.Name -match 'hidden icons|biểu tượng ẩn|Notification Chevron|overflow|Show hidden'){ try{ $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }catch{}; Start-Sleep -Milliseconds 700; $el=Find-Icon; break } }; if($el){ break } } }",
  "if(-not $el){ $tops=@(Get-Tops); $names=@(); $cnt=0; foreach($t in $tops){ foreach($b in $t.FindAll($TS::Descendants,$all)){ $cnt++; if($b.Current.Name){ $names+=$b.Current.Name } } }; $cls=(@($AE::RootElement.FindAll($TS::Children,$all) | ForEach-Object { $_.Current.ClassName } | Where-Object { $_ } | Select-Object -Unique | Select-Object -First 25) -join ','); 'NOTFOUND:'+$(if($w){'[cửa sổ trùng tên nhưng quá nhỏ/không phải bảng: '+$w+'] '})+'[cửa sổ có chữ ASIO/O Deus: '+[AmWin]::Titles('ASIO|O Deus|Link Pro')+'] [cửa sổ khay='+$tops.Count+', phần tử='+$cnt+'] [lớp cửa sổ gốc: '+$cls+'] '+((($names | Select-Object -Unique | Select-Object -First 30)) -join ' | '); exit 0 }",
  "$n=$el.Current.Name",
  "try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'OK:invoke:'+$n; exit 0 } catch {}",
  "$r=$el.Current.BoundingRectangle; $x=[int]($r.X+$r.Width/2); $y=[int]($r.Y+$r.Height/2)",
  "[AmTrayClick]::SetCursorPos($x,$y) | Out-Null; [AmTrayClick]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [AmTrayClick]::mouse_event(4,0,0,0,[UIntPtr]::Zero)",
  "'OK:click:'+$n",
  "} catch { 'ERR:'+$_.Exception.Message }"
].join('\n');

function parseTrayOutput(out) {
  const t = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (/^OK:(window|invoke|click):/.test(t)) return { ok: true, found: true, how: t.split(':')[1], name: t.slice(t.indexOf(':', 3) + 1) };
  if (/^NOTFOUND/.test(t)) return { ok: false, found: false, reason: 'tray-not-found', detail: t.replace(/^NOTFOUND:?/, '').trim() };
  if (/^ERR:/.test(t)) return { ok: false, found: false, reason: 'tray-error', detail: t.slice(4) };
  return { ok: false, found: false, reason: 'tray-unknown', detail: t };
}

function showPanel(deps) {
  const ex = (deps && deps.execFile) || childProcess.execFile;
  return new Promise((resolve) => {
    try {
      if (!isWin(deps)) { resolve({ ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' }); return; }
      const enc = Buffer.from(TRAY_PS, 'utf16le').toString('base64');
      ex('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: TRAY_TIMEOUT_MS }, (err, stdout) => {
        const r = parseTrayOutput(stdout);
        if (r.ok) { resolve({ ok: true, found: true, how: r.how, message: r.how === 'window' ? 'Đã gửi lệnh hiện bảng ASIO Link Pro — chi tiết: ' + r.name + '. Nếu bảng vẫn không hiện, hãy chép dòng này gửi cho Claude C.' : 'Đã bấm icon "' + r.name + '" ở khay — bảng ASIO Link Pro sẽ hiện ra.' }); return; }
        if (err && !stdout) { resolve({ ok: false, found: false, reason: 'tray-error', message: 'Không chạy được PowerShell: ' + ((err && err.message) || err) }); return; }
        if (r.reason === 'tray-not-found') { resolve({ ok: false, found: false, reason: r.reason, message: 'Không thấy bảng ASIO Link Pro (bảng xanh) — bảng này chỉ có khi Studio One đang chạy.' + (r.detail ? ' Các nút thấy được: ' + r.detail : '') }); return; }
        resolve({ ok: false, found: false, reason: r.reason, message: 'Không bấm được icon ở khay' + (r.detail ? ': ' + r.detail : '.') });
      });
    } catch (e) { resolve({ ok: false, found: false, reason: 'tray-error', message: String((e && e.message) || e) }); }
  });
}

// Chờ icon bảng xanh hiện (sau khi khởi động lại chương trình; tối đa ~8 lần x 1s) rồi bấm.
async function pollShow(deps) {
  const sleep = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tries = (deps && deps.pollTries) != null ? deps.pollTries : 8;
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await showPanel(deps);
    if (last.ok || last.reason !== 'tray-not-found') return last;
    await sleep((deps && deps.pollMs) != null ? deps.pollMs : 1000);
  }
  return last || { ok: false, found: false, reason: 'tray-not-found', message: 'Không thấy icon ASIO Link Pro ở khay.' };
}

async function restart(p, deps) {
  try {
    if (!isWin(deps)) return { ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' };
    const v = validate(p, deps);
    if (!v.ok) return v;
    if (PROTECTED.has(v.name.toLowerCase())) return { ok: false, reason: 'protected', message: 'Từ chối: "' + v.name + '" không phải ASIO Link Pro (không được đóng chương trình này). Hãy chọn đúng file ASIO Link Pro.' };
    const k = await killByName(v.name, deps);
    if (k.error) return { ok: false, reason: 'kill-failed', message: 'Không đóng được ' + v.name + ': ' + k.error };
    const sleep = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
    await sleep(AFTER_KILL_WAIT_MS);
    const r = await spawnDetached(v.path, deps);
    if (!r.ok) return { ok: false, reason: 'spawn-failed', message: r.message, killed: k.killed };
    const base = (k.killed ? 'Đã đóng và mở lại ' : 'Chưa chạy sẵn — đã mở ') + v.name + '.';
    if (deps && deps.showAfter) { // mở luôn bảng ở khay sau khi chạy lại
      const sh = await pollShow(deps);
      return { ok: true, killed: k.killed, panel: !!sh.ok, message: base + (sh.ok ? ' ' + sh.message : ' Chưa tự mở được bảng (' + String(sh.message || '').replace(/\.$/, '') + ') — hãy bấm tay icon ở góc màn hình.') };
    }
    return { ok: true, killed: k.killed, message: base };
  } catch (e) { return { ok: false, reason: 'error', message: String((e && e.message) || e) }; }
}

module.exports = { validate, open, restart, killByName, showPanel, pollShow, parseTrayOutput, TRAY_PS, PROTECTED };
