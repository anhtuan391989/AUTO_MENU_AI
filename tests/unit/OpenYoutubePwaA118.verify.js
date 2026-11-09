// A118 — Mở Youtube dạng PWA (--app=) bằng đúng trình duyệt đã chọn. MÔ PHỎNG (spawn giả) — KHÔNG phải Windows/trình duyệt thật.
const fs=require('fs'),vm=require('vm'),path=require('path'),{EventEmitter}=require('events');const root=path.join(__dirname,'..','..');const src=fs.readFileSync(path.join(root,'app/main.js'),'utf8');
let p=0,f=0;const ok=(c,m,x)=>{c?p++:(f++,console.log('  FAIL',m,x===undefined?'':JSON.stringify(x)));if(c)console.log('  OK  ',m)};
const a=src.indexOf('const OPEN_BUNDLE_LOG'),b=src.indexOf('ipcMain.handle("open-project-bundle"');ok(a>0&&b>a,'tìm thấy khối helper');
const exists=new Set();
function make(world){const calls=[];const ctx={console:{log(){}},process:{platform:'win32'},setTimeout,path,fs:{existsSync:(x)=>exists.has(x),appendFileSync(){}},app:{getPath:()=>'/tmp'},require:(m)=>m==='./Elevation'?{isElevated:()=>world.elevated}:require(m),
 spawn:(cmd,args,o)=>{calls.push({cmd,args,o});const e=new EventEmitter();e.unref=()=>{};setTimeout(()=>e.emit('exit',world.exit&&world.exit[cmd+'|'+args[0]]!=null?world.exit[cmd+'|'+args[0]]:0),5);return e},shell:{openExternal:async()=>{calls.push({cmd:'openExternal'})}}};
 vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);return{ctx,calls,flag:(br)=>vm.runInContext('chromiumAppFlag('+JSON.stringify(br)+',"https://www.youtube.com")',ctx),run:(br,asApp)=>vm.runInContext('__menuElevated=null;openYoutubeRobust("https://www.youtube.com",'+JSON.stringify(br)+','+asApp+')',ctx)}}
(async()=>{
 let m=make({elevated:false});
 console.log('== nhận diện trình duyệt Chromium ==');
 for(const [br,exp] of [['C:\\P\\Google\\Chrome\\Application\\chrome.exe',1],['C:\\P\\Microsoft\\Edge\\Application\\msedge.exe',1],['C:\\P\\BraveSoftware\\brave.exe',1],['C:\\P\\Vivaldi\\vivaldi.exe',1],['C:\\P\\Opera\\opera.exe',1],['C:\\P\\Mozilla Firefox\\firefox.exe',0],['D:\\x\\notepad.exe',0],['',0]]) ok(!!m.flag(br)===!!exp,(exp?'PWA: ':'KHÔNG PWA: ')+(br||'(rỗng)'));
 ok(m.flag('C:\\x\\CHROME.EXE')==='--app=https://www.youtube.com','không phân biệt hoa/thường; cờ đúng dạng --app=<url>');
 console.log('== luồng mở ==');
 exists.add('C:\\B\\msedge.exe');exists.add('C:\\B\\firefox.exe');
 m=make({elevated:false});let r=await m.run('C:\\B\\msedge.exe');
 ok(r.ok&&/PWA/.test(r.via)&&m.calls.length===1&&m.calls[0].cmd==='C:\\B\\msedge.exe'&&m.calls[0].args.length===1&&m.calls[0].args[0]==='--app=https://www.youtube.com','Edge đã chọn: mở bằng chính Edge với --app= (đúng 1 lần gọi)',m.calls);
 m=make({elevated:false});r=await m.run('C:\\B\\firefox.exe');ok(r.ok&&r.via==='trình duyệt đã chọn'&&m.calls[0].args[0]==='https://www.youtube.com','Firefox: không có PWA => mở tab thường bằng Firefox');
 m=make({elevated:false,exit:{'C:\\B\\msedge.exe|--app=https://www.youtube.com':1}});r=await m.run('C:\\B\\msedge.exe');ok(r.ok&&r.via==='trình duyệt đã chọn'&&r.tried[0].endsWith('✗')&&m.calls.length===2,'PWA lỗi => rơi về tab thường của CHÍNH trình duyệt đó (không nhảy sang trình duyệt khác)',r);
 m=make({elevated:false});r=await m.run('C:\\B\\msedge.exe',false);ok(r.ok&&r.via==='trình duyệt đã chọn'&&m.calls[0].args[0]==='https://www.youtube.com','youtubeAsApp=false => tab thường (có công tắc tắt)');
 m=make({elevated:false});r=await m.run('C:\\B\\msedge.exe',undefined);ok(/PWA/.test(r.via),'không nói gì (undefined) => mặc định PWA');
 m=make({elevated:true});r=await m.run('C:\\B\\msedge.exe');ok(r.ok&&/PWA.*hạ quyền/.test(r.via)&&m.calls[0].cmd==='runas'&&m.calls[0].args[1]==='"\\"C:\\B\\msedge.exe\\" --app=https://www.youtube.com"','Menu Administrator: PWA qua runas hạ quyền, đúng cú pháp',m.calls[0]);
 m=make({elevated:false});r=await m.run('');ok(r.ok&&r.via==='shell.openExternal','chưa chọn trình duyệt => trình duyệt mặc định như cũ');
 ok(/youtubeAsApp,?\s*(?:autoStartup)?\s*\n?\s*\} = options/.test(src)&&/openYoutubeRobust\(youtubeUrl \|\| "https:\/\/www\.youtube\.com", browserPath, youtubeAsApp\)/.test(src),'handler nhận youtubeAsApp và truyền xuống');
 console.log(p+' PASS / '+f+' FAIL (MÔ PHỎNG)');process.exit(f?1:0)})();
