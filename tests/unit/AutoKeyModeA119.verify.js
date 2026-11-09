// A119 — Chế độ Auto-Key (Tự dò riêng). MÔ PHỎNG (ActionRegistry/MIDI giả, đồng hồ thật rút ngắn) — KHÔNG gửi MIDI/Auto-Key thật. AUTOKEY-MIDI-01: không còn dùng chuột.
const fs=require('fs'),path=require('path'),vm=require('vm');const root=path.join(__dirname,'..','..');const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
let p=0,f=0;const ok=(c,m,x)=>{if(c){p++;console.log('  OK  ',m)}else{f++;console.log('  FAIL',m,x===undefined?'':JSON.stringify(x))}};
const src=rd('ui/js/renderer.js');
const dm=/const __AI_CORE_DEFAULT[\s\S]*?try \{ setInterval/.exec(src);const am=/const __autoKeyRun[\s\S]*?\nfunction restartAiForNewSong/.exec(src);ok(!!dm&&!!am,'tìm thấy cấu hình + hàm runAutoKeyDetect');
const gi=src.indexOf('__aiCoreCfg().autoKeyMode) {');ok(gi>0,'có cổng chặn gửi Key AI khi Auto-Key BẬT');
function make(o){const clicks=[],mouse=[];let t=0;const sleepLog=[];const RealDate=Date;const FakeDate=function(){return new RealDate()};FakeDate.now=()=>ctx.t;const ctx={Date:FakeDate,t:100000,console:{log(){}},window:{electronAPI:{loadSettingsSync:()=>o.st,clickAtPoint:async(q)=>{mouse.push(q);return{ok:true}},clickAtPointSilent:async(q)=>{const k=clicks.length+1;if(o.failOn===k){return{ok:false,detail:'x'}}clicks.push(q);return{ok:true}}}},
 getCoordinate:(k)=>(o.coords||{})[k]||"",isMouseFallbackAllowed:()=>o.mouse!==false,getActiveSourceName:()=>o.src||'ai',KeyEngine:{setTuning(){return{}}},
 setTimeout:(fn,ms)=>{sleepLog.push(ms);return setTimeout(fn,0)}};
 vm.createContext(ctx);vm.runInContext(dm[0].replace(/try \{ setInterval$/,'')+'\n'+am[0].replace(/\nfunction restartAiForNewSong$/,'')+';this.run=runAutoKeyDetect;this.cfg=__aiCoreCfg;this.st=__autoKeyRun;',ctx);return{ctx,clicks,sleepLog,mouse}}
const P1={x:10,y:20},P2={x:30,y:40};
(async()=>{
 console.log('== cấu hình ==');
 let m=make({st:{},coords:{}});ok(m.ctx.cfg().autoKeyMode===false&&m.ctx.cfg().autoKeyWait===8,'mặc định: TẮT, chờ 8s');
 m=make({st:{autoKeyMode:{enabled:true,waitSec:15}},coords:{}});ok(m.ctx.cfg().autoKeyMode===true&&m.ctx.cfg().autoKeyWait===15,'đọc đúng BẬT + 15s');
 m=make({st:{autoKeyMode:{enabled:true,waitSec:999}},coords:{}});ok(m.ctx.cfg().autoKeyWait===60,'chờ kẹp ≤ 60s');
 m=make({st:{autoKeyMode:{enabled:true,waitSec:0}},coords:{}});ok(m.ctx.cfg().autoKeyWait===1,'chờ kẹp ≥ 1s');
 m=make({st:{autoKeyMode:{enabled:"true"}},coords:{}});ok(m.ctx.cfg().autoKeyMode===false,'giá trị không phải true thật => TẮT');
 console.log('== chạy (bấm ngầm) ==');
 const on={autoKeyMode:{enabled:true,waitSec:2}};
 const P={autokey1:[P1],autokey2:[P2]};
 m=make({st:{},coords:P});let r=await m.ctx.run('t');ok(r.why==='mode-off'&&m.clicks.length===0,'chế độ TẮT => không bấm gì');
 m=make({st:on,coords:P});r=await m.ctx.run('t');ok(r.ran&&r.sent&&JSON.stringify(m.clicks)===JSON.stringify([P1,P2])&&m.mouse.length===0,'BẬT: bấm ngầm điểm dò rồi Send; KHÔNG dùng clickAtPoint (con trỏ không di chuyển)');
 ok(m.sleepLog.includes(2000),'chờ đúng số giây cài đặt (2s)',m.sleepLog);
 m=make({st:on,coords:{autokey1:[P1]}});r=await m.ctx.run('t');ok(r.why==='no-coords'&&m.clicks.length===0&&/toạ độ/.test(m.ctx.st.status),'thiếu toạ độ => dừng, báo trạng thái');
 m=make({st:on,coords:P,failOn:1});r=await m.ctx.run('t');ok(r.why==='click-fail'&&m.clicks.length===0&&/dò Key không được/.test(m.ctx.st.status),'bấm điểm dò lỗi => không Send, báo trạng thái');
 m=make({st:on,coords:P,failOn:2});r=await m.ctx.run('t');ok(r.ran&&r.sent===false&&m.clicks.length===1,'bấm Send lỗi => báo chưa Send');
 m=make({st:on,coords:P,mouse:false});r=await m.ctx.run('t');ok(r.sent&&m.clicks.length===2,'công tắc Mouse Control không còn ảnh hưởng (không dùng chuột thật)');
 m=make({st:on,coords:P,src:'manual'});r=await m.ctx.run('t');ok(r.why==='manual'&&m.clicks.length===0,'đang Dò tay (chọn Key) => không chạy');
 m=make({st:on,coords:P,src:'songDb'});r=await m.ctx.run('t');ok(r.why==='song-db'&&m.clicks.length===0,'bài có Key Song Database => không chạy');
 m=make({st:on,coords:P});await m.ctx.run('a');r=await m.ctx.run('b');ok(r.why==='cooldown'&&m.clicks.length===2,'gọi lại trong 8s => bị chặn');
 m=make({st:on,coords:P});const pa=m.ctx.run('a');const rb=await m.ctx.run('b');ok(rb.why==='busy','đang chạy mà gọi tiếp => bỏ qua');await pa;
 console.log('== ngắt giữa chừng ==');
 let n=0;const o3={coords:P};o3.st=new Proxy({},{get:(t,k)=>k==='autoKeyMode'?(n++<1?{enabled:true,waitSec:1}:{enabled:false}):undefined});m=make(o3);
 const origRun=m.ctx.run;const res=await (async()=>{const pr3=origRun('t');const iv=setInterval(()=>{m.ctx.t+=3000},1);const rr=await pr3;clearInterval(iv);return rr})();
 ok(res.ran&&res.sent===false&&res.why==='aborted'&&m.clicks.length===1,'tắt chế độ trong lúc chờ => KHÔNG bấm Send',[res,m.clicks.length]);
 console.log('== bấm ngầm không đụng chuột ==');
 ok(!/[^a-zA-Z]clickAtPoint\(/.test(am[0])&&/clickAtPointSilent/.test(am[0]),'runAutoKeyDetect chỉ gọi clickAtPointSilent');
 const sc=rd('app/silentClick.js');ok(/WindowFromPoint/.test(sc)&&/WM|0x0201/.test(sc)&&!/SetCursorPos|mouse_event|SendInput/.test(sc),'dùng PostMessage vào cửa sổ, không SetCursorPos/SendInput');
 ok(/click-at-point-silent/.test(rd('app/main.js'))&&/clickAtPointSilent/.test(rd('app/preload.js')),'có IPC + preload');
 ok(/btnTestSilentAk1/.test(rd('ui/js/setup.js'))&&/btnTestSilentAk2/.test(rd('ui/js/setup.js')),'có 2 nút thử trong Setup (tạo bằng JS)');
 console.log('== gate gửi Key AI ==');
 const blk=src.slice(gi-120,gi+330);ok(/source === "ai"/.test(blk)&&/return;/.test(blk),'chỉ chặn nguồn AI (Dò tay/Song DB vẫn gửi bình thường)');
 const ap=src.slice(src.indexOf('function applyActiveKeyToPlugin'));const send=ap.indexOf('sendKeyToAutotune(sendValue)');ok(ap.indexOf('autoKeyMode')<send&&ap.indexOf('autoKeyMode')>0,'cổng nằm trước lệnh gửi Plugin');
 const hook=src.indexOf('runAutoKeyDetect("AUTO DETECT")');ok(hook>0&&/autoDetectBtn/.test(src.slice(hook-250,hook)),'nút AUTO DETECT (kể cả bấm tự động khi đổi bài) kích hoạt Auto-Key');
 ok(/__dbBypass/.test(src)&&/AUTO-RELISTEN-01/.test(src),'giữ nguyên phần AUTO-RELISTEN-01 của task khác');
 console.log('== Setup ==');
 const {chromium}=require('playwright');const b=await chromium.launch();const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.addInitScript(()=>{window.electronAPI=new Proxy({},{get:(t,k)=>k==='loadSettingsSync'?()=>({}):(async()=>({}))});});
 await pg.goto('file://'+path.join(root,'ui/setup.html'));await pg.waitForTimeout(400);
 const res2=await pg.evaluate(()=>{const store={autoKeyMode:{enabled:true,waitSec:12}},saved=[];window.getSetting=(k,d)=>k in store?store[k]:d;window.setSetting=(k,v)=>{store[k]=v;saved.push(JSON.parse(JSON.stringify(v)))};window.setupAutoKey.init();
  const en=document.getElementById('autoKeyModeEnable'),wt=document.getElementById('autoKeyWaitSec');const init=[en.checked,wt.value];
  en.checked=false;en.dispatchEvent(new Event('change'));wt.value='99';wt.dispatchEvent(new Event('change'));return{init,saved:saved[saved.length-1],wt:wt.value,hint:document.getElementById('autoKeyModeHint').textContent.length>50,inCalib:!!document.getElementById('autoKeyModeBlock').closest('#panel-calibration')}});
 ok(JSON.stringify(res2.init)==='[true,"12"]','Setup hiện đúng giá trị đã lưu',res2.init);
 ok(res2.saved&&res2.saved.enabled===false&&res2.saved.waitSec===60&&res2.wt==='60','đổi => lưu đúng; chờ 99 bị kẹp 60',res2);
 ok(res2.hint&&res2.inCalib,'có dòng giải thích và nằm trong tab Calibration (cạnh toạ độ Auto-Key)');
 ok(errs.length===0,'không lỗi JS',errs);await b.close();
 const i18n=rd('ui/js/i18n.js');ok(/\["Chế độ Auto-Key \(Plugin tự dò\)", "Auto-Key mode/.test(i18n)&&/\["Chờ dò xong \(giây\)"/.test(i18n)&&/Khi BẬT: Menu không gửi Key AI xuống Auto-Tune/.test(i18n),'i18n có cặp dịch EN');
 console.log(p+' PASS / '+f+' FAIL (MÔ PHỎNG)');process.exit(f?1:0)})();
