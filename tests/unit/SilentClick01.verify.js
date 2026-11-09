// SILENT-CLICK-01 — mô-đun bấm ngầm (app/silentClick.js). Giả execFile; KHÔNG chạy PowerShell/click thật.
const S=require('../../app/silentClick');let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log((c?'  OK   ':'  FAIL ')+m)};
(async()=>{
 const win=(out,err)=>({platform:'win32',exec:(file,a,o,cb)=>{win.last={file,a,o};cb(err||null,out,err?'bad':'')}});
 ok(!(await S.silentClick(1,2,{platform:'linux'})).ok,'không phải Windows => báo lỗi rõ ràng');
 ok(!(await S.silentClick('a',2,win('OK'))).ok,'toạ độ không hợp lệ => từ chối');
 let r=await S.silentClick(10.4,20.6,win('OK class=Q hwnd=5 client=3,4\r\n'));ok(r.ok&&/class=Q/.test(r.detail),'OK: trả chi tiết cửa sổ đã bấm');
 const script=Buffer.from(win.last.a[win.last.a.length-1],'base64').toString('utf16le');
 ok(win.last.file==='powershell.exe'&&win.last.a.includes('-EncodedCommand'),'chạy powershell -EncodedCommand');
 ok(/\$sp\.X = 10\b/.test(script)&&/\$sp\.Y = 21\b/.test(script),'toạ độ làm tròn đưa vào script');
 ok(/PostMessage/.test(script)&&/0x0201/.test(script)&&/0x0202/.test(script)&&/WindowFromPoint/.test(script),'dùng PostMessage LBUTTONDOWN/UP vào cửa sổ tại điểm');
 ok(!/SetCursorPos|mouse_event|SendInput|\[Cursor\]/i.test(script),'KHÔNG di chuyển/đụng con trỏ chuột thật');
 r=await S.silentClick(1,2,win('NO_WINDOW'));ok(!r.ok&&/NO_WINDOW/.test(r.detail),'không có cửa sổ tại điểm => báo lỗi');
 r=await S.silentClick(1,2,win('',new Error('boom')));ok(!r.ok&&/Bấm ngầm lỗi/.test(r.detail),'PowerShell lỗi => báo lỗi, không ném ngoại lệ');
 console.log(p+' PASS / '+f+' FAIL');process.exit(f?1:0)})();
