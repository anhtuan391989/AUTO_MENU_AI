// AUTODETECT-MODE-01 — popup chuột phải AUTO DETECT: Tự dò bằng tay / Dò bằng AI (chọn 1), tự ẩn 5 s. Playwright + electronAPI giả.
const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..','..');
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log((c?'  OK   ':'  FAIL ')+m)};
const src=fs.readFileSync(path.join(root,'ui/js/renderer.js'),'utf8');
ok(/function initAutoDetectModePopup/.test(src)&&/initAutoDetectModePopup\(\); \/\/ AUTODETECT-MODE-01/.test(src),'có hàm + được gọi lúc khởi động');
ok(/createPopupAutoHide\(card/.test(src.slice(src.indexOf('function initAutoDetectModePopup'))),'dùng cơ chế tự ẩn 5 s chung (A97)');
(async()=>{
 let chromium;try{({chromium}=require('playwright'))}catch(e){console.log('  (bỏ qua phần trình duyệt: không có playwright)');console.log(p+' PASS / '+f+' FAIL');process.exit(f?1:0)}
 const b=await chromium.launch();const pg=await b.newPage();
 await pg.setContent('<button id="autoDetectBtn" style="margin:80px">AUTO DETECT</button>');
 await pg.evaluate(()=>{window.__store={};window.getSetting=(k,d)=>window.__store[k]!==undefined?window.__store[k]:d;window.setSetting=(k,v)=>{window.__store[k]=v;return true};window.__aiCoreCache={t:5,v:{}};});
 // lấy đúng 2 hàm từ renderer.js
 const grab=(name)=>{const i=src.indexOf(name);let d=0,k=src.indexOf('{',i);const st=i;for(let j=k;j<src.length;j++){if(src[j]==='{')d++;if(src[j]==='}'){d--;if(!d)return src.slice(st,j+1)}}};
 await pg.evaluate(grab('const POPUP_AUTO_HIDE_MS')+';'+grab('function createPopupAutoHide')+';'+grab('function initAutoDetectModePopup')+';initAutoDetectModePopup();');
 const vis=()=>pg.evaluate(()=>getComputedStyle(document.getElementById('autoDetectModeCard')).display!=='none');
 const st=()=>pg.evaluate(()=>({m:document.getElementById('autoDetectManualChk').checked,a:document.getElementById('autoDetectAiChk').checked,cfg:window.__store.autoKeyMode||null,cache:window.__aiCoreCache.t}));
 await pg.click('#autoDetectBtn',{button:'right'});ok(await vis(),'chuột phải: hiện popup');
 let s=await st();ok(!s.m&&s.a,'mặc định: chỉ "Dò bằng AI" được tích');
 await pg.click('#autoDetectManualChk');s=await st();ok(s.m&&!s.a&&s.cfg.enabled===true&&s.cfg.waitSec===8&&s.cache===0,'tích "Tự dò bằng tay": ô AI tự bỏ, lưu enabled=true, giữ waitSec, xoá cache');
 await pg.click('#autoDetectManualChk');s=await st();ok(s.m&&!s.a&&s.cfg.enabled===true,'bỏ tích ô đang chọn: vẫn còn đúng 1 ô (không thể để trống)');
 await pg.click('#autoDetectAiChk');s=await st();ok(!s.m&&s.a&&s.cfg.enabled===false,'tích "Dò bằng AI": ô tay tự bỏ, enabled=false');
 await pg.evaluate(()=>{window.__store.autoKeyMode={enabled:true,waitSec:20}});
 await pg.click('#autoDetectBtn',{button:'right'});ok(!(await vis()),'chuột phải lần nữa: đóng');
 await pg.click('#autoDetectBtn',{button:'right'});s=await st();ok(s.m&&!s.a,'mở lại: đọc đúng trạng thái đã lưu (từ Setup)');
 await pg.click('#autoDetectManualChk');await pg.click('#autoDetectAiChk');s=await st();ok(s.cfg.waitSec===20,'đổi chế độ không làm mất waitSec của Setup');
 await pg.waitForTimeout(5400);ok(!(await vis()),'5 giây không thao tác: tự ẩn');
 await pg.click('#autoDetectBtn',{button:'right'});await pg.mouse.click(400,400);ok(!(await vis()),'bấm ra ngoài: đóng');
 await b.close();console.log(p+' PASS / '+f+' FAIL');process.exit(f?1:0)})();
