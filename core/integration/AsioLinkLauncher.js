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
const PICK_TIMEOUT_MS = 30000;
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

// C#: tiện ích Win32 (KHÔNG có dấu nháy đơn vì nằm trong chuỗi PowerShell nháy đơn).
//  Probe : tìm cửa sổ bảng theo tiêu đề (KHÔNG tác động). Front: đưa cửa sổ đang HIỆN SẴN lên trước.
//  Click : bấm chuột trái thật tại (x,y) rồi trả con trỏ về chỗ cũ. Key: gửi 1 phím. Titles: liệt kê tiêu đề để chẩn đoán.
// LƯU Ý: KHÔNG được ép hiện cửa sổ bảng đang ẩn bằng ShowWindow — chương trình chỉ tự vẽ nội dung khi chính nó xử lý cú bấm icon ở khay => ép hiện cho ra cửa sổ TRẮNG XÓA (đã gặp thật).
const AMWIN_CS = [
  'using System;using System.Text;using System.Threading;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Text.RegularExpressions;',
  'public class AmWin{',
  '[StructLayout(LayoutKind.Sequential)] public struct RECT{ public int L,T,R,B; }',
  '[StructLayout(LayoutKind.Sequential)] public struct PT{ public int X,Y; }',
  'public delegate bool EnumProc(IntPtr h, IntPtr l);',
  '[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);',
  '[DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);',
  '[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);',
  '[DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool GetCursorPos(out PT p);',
  '[DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);',
  '[DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);',
  '[DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint fl, UIntPtr ex);',
  'static string Title(IntPtr h){ int n=GetWindowTextLength(h); if(n<=0) return null; StringBuilder sb=new StringBuilder(n+1); GetWindowText(h,sb,sb.Capacity); return sb.ToString(); }',
  'static string ClassOf(IntPtr h){ StringBuilder sb=new StringBuilder(256); GetClassName(h,sb,256); return sb.ToString(); }',
  'static string Rc(IntPtr h){ RECT r; GetWindowRect(h,out r); return r.L+","+r.T+","+r.R+","+r.B; }',
  'static long Area(IntPtr h){ RECT r; GetWindowRect(h,out r); return (long)(r.R-r.L)*(long)(r.B-r.T); }',
  'static IntPtr Pick(string re, out int count){ Regex rx=new Regex(re); List<IntPtr> hs=new List<IntPtr>();',
  ' EnumWindows(delegate(IntPtr h, IntPtr l){ string t=Title(h); if(t!=null && rx.IsMatch(t)) hs.Add(h); return true; }, IntPtr.Zero);',
  ' count=hs.Count; IntPtr best=IntPtr.Zero; long ba=-1; foreach(IntPtr x in hs){ long a=Area(x); if(a>ba){ ba=a; best=x; } } return best; }',
  'public static string Probe(string re){ int n; IntPtr hh=Pick(re,out n); if(hh==IntPtr.Zero) return null;',
  ' return n+"|"+(IsWindowVisible(hh)?"hien":"an")+"|"+(IsIconic(hh)?"thunho":"khongthunho")+"|"+Rc(hh)+"|"+ClassOf(hh)+"|"+Title(hh); }',
  'public static void Front(string re){ int n; IntPtr hh=Pick(re,out n); if(hh==IntPtr.Zero) return; if(IsIconic(hh)) ShowWindow(hh,9);',
  ' keybd_event(0x12,0,0,UIntPtr.Zero); keybd_event(0x12,0,2,UIntPtr.Zero);',
  ' SetWindowPos(hh,(IntPtr)(-1),0,0,0,0,0x43); SetWindowPos(hh,(IntPtr)(-2),0,0,0,0,0x43); BringWindowToTop(hh); SetForegroundWindow(hh); }',
  'public static void Click(int x, int y){ PT old; GetCursorPos(out old); SetCursorPos(x,y); Thread.Sleep(80);',
  ' mouse_event(2,0,0,0,UIntPtr.Zero); Thread.Sleep(40); mouse_event(4,0,0,0,UIntPtr.Zero); Thread.Sleep(200); SetCursorPos(old.X,old.Y); }',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c, string t);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string t);',
  '[DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
  '[DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
  '[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '[DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);',
  '[DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr a, UIntPtr s, uint t, uint pr);',
  '[DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p, IntPtr a, UIntPtr s, uint t);',
  '[DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p, IntPtr a, byte[] b, int n, out IntPtr r);',
  '[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
  'static string WStr(IntPtr hp, long addr){ if(addr<65536) return null; byte[] t=new byte[512]; IntPtr rd; if(!ReadProcessMemory(hp,(IntPtr)addr,t,512,out rd)) return null; int k=0; while(k+1<512 && !(t[k]==0 && t[k+1]==0)) k+=2; return Encoding.Unicode.GetString(t,0,k); }',
  'public static string TrayMsg(string re){ Regex rx=new Regex(re); List<IntPtr> tbs=new List<IntPtr>(); List<string> names=new List<string>(); int total=0;',
  ' IntPtr tr=FindWindow("Shell_TrayWnd",null); if(tr!=IntPtr.Zero){ IntPtr nw=FindWindowEx(tr,IntPtr.Zero,"TrayNotifyWnd",null); if(nw!=IntPtr.Zero){ IntPtr sp=FindWindowEx(nw,IntPtr.Zero,"SysPager",null); IntPtr t1=FindWindowEx(sp!=IntPtr.Zero?sp:nw,IntPtr.Zero,"ToolbarWindow32",null); if(t1!=IntPtr.Zero) tbs.Add(t1); } }',
  ' IntPtr ov=FindWindow("NotifyIconOverflowWindow",null); if(ov!=IntPtr.Zero){ IntPtr t2=FindWindowEx(ov,IntPtr.Zero,"ToolbarWindow32",null); if(t2!=IntPtr.Zero) tbs.Add(t2); }',
  ' foreach(IntPtr tb in tbs){ uint pid; GetWindowThreadProcessId(tb,out pid); IntPtr hp=OpenProcess(0x0438,false,pid); if(hp==IntPtr.Zero) continue;',
  '  IntPtr buf=VirtualAllocEx(hp,IntPtr.Zero,(UIntPtr)4096,0x3000,4);',
  '  try{ int cnt=(int)SendMessage(tb,0x418,IntPtr.Zero,IntPtr.Zero);',
  '   for(int i=0;i<cnt;i++){ if(SendMessage(tb,0x417,(IntPtr)i,buf)==IntPtr.Zero) continue; byte[] b=new byte[32]; IntPtr rd; if(!ReadProcessMemory(hp,buf,b,32,out rd)) continue;',
  '    long dd=BitConverter.ToInt64(b,16); long istr=BitConverter.ToInt64(b,24); string tx=WStr(hp,istr); total++; if(!string.IsNullOrEmpty(tx)) names.Add(tx);',
  '    if(string.IsNullOrEmpty(tx) || !rx.IsMatch(tx) || dd<65536) continue;',
  '    byte[] d=new byte[24]; if(!ReadProcessMemory(hp,(IntPtr)dd,d,24,out rd)) continue;',
  '    long hw=BitConverter.ToInt64(d,0); int uid=BitConverter.ToInt32(d,8); int cbm=BitConverter.ToInt32(d,12); if(hw==0 || cbm==0) continue;',
  '    PostMessage((IntPtr)hw,(uint)cbm,(IntPtr)uid,(IntPtr)0x201); Thread.Sleep(60); PostMessage((IntPtr)hw,(uint)cbm,(IntPtr)uid,(IntPtr)0x202);',
  '    return "OK:"+tx; } }',
  '  finally{ VirtualFreeEx(hp,buf,UIntPtr.Zero,0x8000); CloseHandle(hp); } }',
  ' return "NF:"+tbs.Count+" thanh khay, "+total+" icon: "+string.Join(" | ",names.ToArray()); }',
  '[DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref PT p);',
  '[DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);',
  '[DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);',
  '[DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);',
  '[DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);',
  '[DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);',
  '[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);',
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);',
  'static IntPtr Child(IntPtr d, string cls, string txt){ IntPtr found=IntPtr.Zero; EnumChildWindows(d, delegate(IntPtr h, IntPtr l){ if(ClassOf(h).ToUpper().Contains(cls)){ if(txt==null){ found=h; return false; } string t=Title(h); if(t!=null && t.Replace("&","")==txt){ found=h; return false; } } return true; }, IntPtr.Zero); return found; }',
  'static PT PanelPt(IntPtr hh, double fx, double fy){ RECT c; GetClientRect(hh,out c); double w=c.R-c.L; double s=w>100?w/1007.0:1.0; PT p=new PT(); p.X=(int)(fx*s); p.Y=(int)(fy*s); ClientToScreen(hh,ref p); return p; }',
  'public static string ClickAt(string re, double fx, double fy){ int n; IntPtr hh=Pick(re,out n); if(hh==IntPtr.Zero) return "NOWIN"; PT p=PanelPt(hh,fx,fy); Click(p.X,p.Y); return p.X+","+p.Y; }',
  'public static string Mark(string re, double fx, double fy){ int n; IntPtr hh=Pick(re,out n); if(hh==IntPtr.Zero) return "NOWIN"; PT p=PanelPt(hh,fx,fy); IntPtr dc=GetDC(IntPtr.Zero); uint c=GetPixel(dc,p.X,p.Y); ReleaseDC(IntPtr.Zero,dc); return (int)(c&255)+","+(int)((c>>8)&255)+","+(int)((c>>16)&255); }',
  'public static bool HasDlg(){ int n; return Pick("^Select ASIO Driver$",out n)!=IntPtr.Zero; }',
  'public static string Choose(string name){ int n; IntPtr d=Pick("^Select ASIO Driver$",out n); if(d==IntPtr.Zero) return "NODLG"; IntPtr cb=Child(d,"COMBOBOX",null); if(cb==IntPtr.Zero) return "NOCOMBO";',
  ' string chosen=name; long r=0;',
  ' if(string.IsNullOrEmpty(name)){ int cnt=(int)SendMessage(cb,0x146,IntPtr.Zero,IntPtr.Zero); int cur=(int)SendMessage(cb,0x147,IntPtr.Zero,IntPtr.Zero); List<string> items=new List<string>();',
  '  for(int i=0;i<cnt;i++){ StringBuilder sb=new StringBuilder(256); SendMessage(cb,0x148,(IntPtr)i,sb); items.Add(sb.ToString()); }',
  '  Regex bad=new Regex("ASIO4ALL|ASIO Link|Waves|SoundGrid|Voicemeeter|VB-Audio|Virtual|Generic Low|FL Studio",RegexOptions.IgnoreCase); int pk=-1;',
  '  if(cur>=0 && cur<cnt && !bad.IsMatch(items[cur])) pk=cur; else { for(int i=0;i<cnt;i++){ if(!bad.IsMatch(items[i])){ pk=i; break; } } }',
  '  if(pk<0) return "NOITEM:"+string.Join(" / ",items.ToArray()); SendMessage(cb,0x14E,(IntPtr)pk,IntPtr.Zero); chosen=items[pk]; r=pk; }',
  ' else { r=SendMessage(cb,0x14D,(IntPtr)(-1),name).ToInt64(); if(r<0) return "NOITEM"; }',
  ' int id=GetDlgCtrlID(cb); SendMessage(d,0x111,(IntPtr)((1<<16)|(id&0xFFFF)),cb); Thread.Sleep(200);',
  ' IntPtr ok=Child(d,"BUTTON","OK"); if(ok==IntPtr.Zero) return "NOOK"; PostMessage(ok,0xF5,IntPtr.Zero,IntPtr.Zero); return "OK:"+chosen; }',
  'public static void Key(int vk, bool up){ keybd_event((byte)vk,0,up?(uint)2:(uint)0,UIntPtr.Zero); }',
  'public static string Titles(string re){ Regex rx=new Regex(re); List<string> list=new List<string>();',
  ' EnumWindows(delegate(IntPtr h, IntPtr l){ string t=Title(h); if(t!=null && rx.IsMatch(t)) list.Add((IsWindowVisible(h)?"V:":"H:")+t); return true; }, IntPtr.Zero);',
  ' return string.Join(" | ", list.ToArray()); }',
  '}'
].join(' ');

// ---- Mở bảng xanh: (1) đang HIỆN SẴN -> chỉ đưa lên trước; (2) đang ẩn -> bấm chuột THẬT vào icon xanh ở khay để chính chương trình tự hiện bảng ----
// Icon nằm trong hộp "biểu tượng ẩn" nên: mở hộp bằng Win+B rồi Enter (CHỈ nhấn Enter khi tiêu điểm đang ở tiến trình explorer = thanh tác vụ), quét cửa sổ của explorer tìm nút
// có tên dạng "O Deus ASIO Link Pro 2.4.2.0 - Studio Pro.exe" (KHÔNG khớp icon Tool tím), bấm chuột thật vào giữa nút, trả con trỏ về chỗ cũ.
const TRAY_PS = [
  "$ErrorActionPreference='Stop'",
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
  "try {",
  "Add-Type -TypeDefinition '" + AMWIN_CS + "'",
  "Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes",
  "$AE=[System.Windows.Automation.AutomationElement]; $TS=[System.Windows.Automation.TreeScope]; $all=[System.Windows.Automation.Condition]::TrueCondition",
  "$pat='ASIO\\s*Link'; $want='\\d+(\\.\\d+){2,}\\s*-\\s*\\S.*\\.exe'; $reWin='ASIO\\s*Link\\s*Pro\\s+\\d+(\\.\\d+){2,}\\s*-\\s*\\S.*\\.exe'",
  "$p=[AmWin]::Probe($reWin)",
  "if($p){ $f=$p.Split('|'); $rc=$f[3].Split(','); if($f[1] -eq 'hien' -and $f[2] -eq 'khongthunho' -and (([int]$rc[2]-[int]$rc[0]) -ge 200) -and (([int]$rc[3]-[int]$rc[1]) -ge 100)){ [AmWin]::Front($reWin); 'OK:window:'+$p; exit 0 } }",
  "$tm=[AmWin]::TrayMsg($reWin)",
  "if($tm -like 'OK:*'){ Start-Sleep -Milliseconds 900; $p2=[AmWin]::Probe($reWin); if($p2 -and $p2.Split('|')[1] -eq 'hien'){ [AmWin]::Front($reWin); 'OK:msg:'+$tm.Substring(3); exit 0 }; 'ERR:Đã gửi cú bấm tới icon, nhưng bảng chưa hiện [bảng: '+$(if($p2){$p2}else{'không có cửa sổ'})+']'; exit 0 }",
  "$exp=@(Get-Process explorer -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })",
  "function Get-Tops { $AE::RootElement.FindAll($TS::Children,$all) | Where-Object { ($exp -contains $_.Current.ProcessId) -and (@('Progman','WorkerW','CabinetWClass') -notcontains $_.Current.ClassName) } }",
  "function Find-Icon { foreach($t in @(Get-Tops)){ foreach($b in $t.FindAll($TS::Descendants,$all)){ $nm=$b.Current.Name; if(($nm -match $pat) -and ($nm -match $want)){ return $b } } }; return $null }",
  "$el=Find-Icon; $fp=0; $opened=$false",
  "if(-not $el){ [AmWin]::Key(0x5B,$false); [AmWin]::Key(0x42,$false); [AmWin]::Key(0x42,$true); [AmWin]::Key(0x5B,$true); Start-Sleep -Milliseconds 500; try{ $fp=$AE::FocusedElement.Current.ProcessId }catch{}; if($exp -contains $fp){ [AmWin]::Key(0x0D,$false); [AmWin]::Key(0x0D,$true); $opened=$true; Start-Sleep -Milliseconds 900; $el=Find-Icon } }",
  "if(-not $el){ $tops=@(Get-Tops); $names=@(); $cnt=0; foreach($t in $tops){ foreach($b in $t.FindAll($TS::Descendants,$all)){ $cnt++; if($b.Current.Name){ $names+=$b.Current.Name } } }; 'NOTFOUND:[khay: '+$tm+'] [bảng: '+$(if($p){$p}else{'không có cửa sổ'})+'] [tiêu điểm sau Win+B thuộc explorer='+($exp -contains $fp)+', đã Enter='+$opened+'] [cửa sổ khay='+$tops.Count+', phần tử='+$cnt+'] '+((($names | Select-Object -Unique | Select-Object -First 30)) -join ' | '); exit 0 }",
  "$n=$el.Current.Name; $r=$el.Current.BoundingRectangle",
  "if((-not $r.IsEmpty) -and $r.Width -gt 0 -and $r.Height -gt 0 -and $r.X -gt -10000){ [AmWin]::Click([int]($r.X+$r.Width/2),[int]($r.Y+$r.Height/2)); 'OK:click:'+$n; exit 0 }",
  "try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'OK:invoke:'+$n; exit 0 } catch {}",
  "'ERR:Thấy icon \"'+$n+'\" nhưng không bấm được'",
  "} catch { 'ERR:'+$_.Exception.Message }"
].join('\n');

// ---- Tự bấm "Pick driver" -> chọn driver theo tên -> OK trong bảng ASIO Link Pro ----
// Toạ độ nút theo ảnh thật của bảng (rộng 1007px vùng client): Pick driver ~(754,10), ô "Enable multi-clients" ~(343,27). Tính theo TỈ LỆ bề rộng nên đúng cả khi Windows phóng to.
// Hộp "Select ASIO Driver" là hộp thoại Windows chuẩn -> chọn thẳng trong ô combo bằng tên (CB_SELECTSTRING) rồi bấm OK, KHÔNG bấm chuột mù.
const DEFAULT_DRIVER = ''; // rỗng = TỰ CHỌN card đang dùng
function safeDriverName(n) { const t = String(n == null ? '' : n).trim(); return /^[A-Za-z0-9 ._()\-]{2,60}$/.test(t) ? t : DEFAULT_DRIVER; }
// Tự chọn (tên rỗng): giữ driver đang được chọn sẵn trong hộp nếu đó là card thật; nếu nó là driver ảo (ASIO4ALL, ASIO Link, Waves SoundGrid, Voicemeeter...) thì lấy card thật đầu tiên trong danh sách.
function pickPs(name) {
  return [
    "$ErrorActionPreference='Stop'",
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "try {",
    "Add-Type -TypeDefinition '" + AMWIN_CS + "'",
    "$reWin='ASIO\\s*Link\\s*Pro\\s+\\d+(\\.\\d+){2,}\\s*-\\s*\\S.*\\.exe'; $drv='" + safeDriverName(name) + "'",
    "$p=[AmWin]::Probe($reWin)",
    "if((-not $p) -or ($p.Split('|')[1] -ne 'hien')){ 'ERR:Bảng ASIO Link Pro chưa hiện ra'; exit 0 }",
    "[AmWin]::Front($reWin); Start-Sleep -Milliseconds 500",
    "$dlg=[AmWin]::HasDlg()",
    "foreach($y in @(10,6,14)){ if($dlg){ break }; [void][AmWin]::ClickAt($reWin,754,$y); for($i=0;$i -lt 10;$i++){ Start-Sleep -Milliseconds 250; if([AmWin]::HasDlg()){ $dlg=$true; break } } }",
    "if(-not $dlg){ 'ERR:Đã bấm Pick driver nhưng hộp \"Select ASIO Driver\" không hiện'; exit 0 }",
    "Start-Sleep -Milliseconds 300",
    "$c=[AmWin]::Choose($drv)",
    "if($c -notlike 'OK:*'){ 'ERR:Không chọn được driver '+$(if($drv){'\"'+$drv+'\"'}else{'(tự chọn)'})+' trong danh sách ('+$c+')'; exit 0 }",
    "Start-Sleep -Milliseconds 1500",
    "$note=''; $m=[AmWin]::Mark($reWin,343,27)",
    "if($m -match '^(\\d+),(\\d+),(\\d+)$'){ if(([int]$Matches[1] -gt [int]$Matches[2]+60)){ [void][AmWin]::ClickAt($reWin,343,27); $note=' Đã bật thêm Enable multi-clients.' } else { $note=' Enable multi-clients đang bật.' } }",
    "'OK:Đã chọn driver \"'+$c.Substring(3)+'\" và bấm OK.'+$note",
    "} catch { 'ERR:'+$_.Exception.Message }"
  ].join('\n');
}
function parsePickOutput(out) {
  const t = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (/^OK:/.test(t)) return { ok: true, message: t.slice(3) };
  if (/^ERR:/.test(t)) return { ok: false, reason: 'pick-failed', message: t.slice(4) };
  return { ok: false, reason: 'pick-unknown', message: t || 'Không có kết quả từ PowerShell.' };
}
async function pickDriver(name, deps) {
  try {
    if (!isWin(deps)) return { ok: false, reason: 'not-windows', message: 'Chỉ chạy được trên Windows.' };
    const sh = await showPanel(deps); // bảng phải đang hiện (tự mở nếu đang ẩn)
    if (!sh.ok) return { ok: false, reason: sh.reason || 'no-panel', message: sh.message };
    const sleep = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
    await sleep((deps && deps.afterShowMs) != null ? deps.afterShowMs : 700);
    const ex = (deps && deps.execFile) || childProcess.execFile;
    const enc = Buffer.from(pickPs(name), 'utf16le').toString('base64');
    return await new Promise((resolve) => {
      ex('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: PICK_TIMEOUT_MS }, (err, stdout) => {
        if (err && !stdout) { resolve({ ok: false, reason: 'pick-error', message: 'Không chạy được PowerShell: ' + ((err && err.message) || err) }); return; }
        resolve(parsePickOutput(stdout));
      });
    });
  } catch (e) { return { ok: false, reason: 'pick-error', message: String((e && e.message) || e) }; }
}

// ---- Liệt kê card âm thanh ASIO có trên máy (Registry HKLM\SOFTWARE\ASIO, cả WOW6432Node) để chọn ngay trong Setup ----
const VIRTUAL_RE = /ASIO4ALL|ASIO Link|Waves|SoundGrid|Voicemeeter|VB-Audio|Virtual|Generic Low|FL Studio/i;
function parseRegDrivers(text) {
  const out = []; const seen = new Set();
  String(text || '').split(/\r?\n/).forEach((ln) => {
    const m = /^\s*HKEY_LOCAL_MACHINE\\SOFTWARE\\(?:WOW6432Node\\)?ASIO\\(.+?)\s*$/i.exec(ln);
    if (m && m[1] && m[1].indexOf('\\') < 0 && !seen.has(m[1].toLowerCase())) { seen.add(m[1].toLowerCase()); out.push({ name: m[1], virtual: VIRTUAL_RE.test(m[1]) }); }
  });
  out.sort((a, b) => (a.virtual === b.virtual ? a.name.localeCompare(b.name) : (a.virtual ? 1 : -1))); // card thật lên trước
  return out;
}
function listDrivers(deps) {
  const ex = (deps && deps.execFile) || childProcess.execFile;
  const q = (key) => new Promise((resolve) => {
    try { ex('reg.exe', ['query', key], { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(String(stdout || ''))); } catch (e) { resolve(''); }
  });
  return (async () => {
    try {
      if (!isWin(deps)) return { ok: false, reason: 'not-windows', drivers: [], message: 'Chỉ chạy được trên Windows.' };
      const t = (await q('HKLM\\SOFTWARE\\ASIO')) + '\n' + (await q('HKLM\\SOFTWARE\\WOW6432Node\\ASIO'));
      const drivers = parseRegDrivers(t);
      return drivers.length ? { ok: true, drivers, message: 'Tìm thấy ' + drivers.length + ' driver ASIO.' } : { ok: false, reason: 'none', drivers: [], message: 'Không thấy driver ASIO nào trong máy.' };
    } catch (e) { return { ok: false, reason: 'error', drivers: [], message: String((e && e.message) || e) }; }
  })();
}

function parseTrayOutput(out) {
  const t = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (/^OK:(window|invoke|click|msg):/.test(t)) return { ok: true, found: true, how: t.split(':')[1], name: t.slice(t.indexOf(':', 3) + 1) };
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
        if (r.ok) { resolve({ ok: true, found: true, how: r.how, message: r.how === 'window' ? 'Bảng ASIO Link Pro đang hiện sẵn — đã đưa lên trước (' + r.name + ').' : 'Đã bấm icon "' + r.name + '" ở khay — bảng ASIO Link Pro sẽ hiện ra.' }); return; }
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

module.exports = { validate, open, restart, killByName, showPanel, pollShow, parseTrayOutput, pickDriver, listDrivers, parseRegDrivers, pickPs, parsePickOutput, safeDriverName, DEFAULT_DRIVER, TRAY_PS, PROTECTED };
