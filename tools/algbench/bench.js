'use strict';
// Benchmark offline: chạy keyEngine.js / bpmEngine.js THẬT (nạp bằng vm) trên PCM tổng hợp có đáp án.
const fs=require('fs'),path=require('path'),vm=require('vm');
const REPO=process.argv[2];
const {render}=require(path.join(REPO,'tests/helpers/synthMusic.js'));
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
for(let l=2;l<=n;l<<=1){const a=-2*Math.PI/l,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=l){let cr=1,ci=0;for(let k=0;k<l/2;k++){const u=i+k,v=i+k+l/2;const tr=re[v]*cr-im[v]*ci,ti=re[v]*ci+im[v]*cr;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
function mkAnalyser(pcm,sr,fftSize,clock,t0){
  const win=new Float32Array(fftSize);for(let i=0;i<fftSize;i++)win[i]=0.42-0.5*Math.cos(2*Math.PI*i/fftSize)+0.08*Math.cos(4*Math.PI*i/fftSize);
  const re=new Float64Array(fftSize),im=new Float64Array(fftSize);
  function frame(){const end=Math.floor((clock.t-t0)/1000*sr);const st=Math.max(0,end-fftSize);for(let i=0;i<fftSize;i++){const k=st+i;re[i]=(k<pcm.length?pcm[k]:0)*win[i];im[i]=0;}fft(re,im);}
  return {fftSize,frequencyBinCount:fftSize/2,smoothingTimeConstant:0,_prevMag:null,
    getFloatFrequencyData(a){frame();for(let i=0;i<fftSize/2;i++){const m=Math.hypot(re[i],im[i])/fftSize;a[i]=m>0?20*Math.log10(m):-Infinity;}},
    getByteFrequencyData(a){frame();const N=fftSize/2;if(!this._prevMag)this._prevMag=new Float64Array(N);for(let i=0;i<N;i++){const m=Math.hypot(re[i],im[i])/fftSize;this._prevMag[i]=0.8*this._prevMag[i]+0.2*m;const db=this._prevMag[i]>0?20*Math.log10(this._prevMag[i]):-100;a[i]=Math.max(0,Math.min(255,Math.floor(255*(db+100)/70)));}},
    getByteTimeDomainData(a){const end=Math.floor((clock.t-t0)/1000*sr);for(let i=0;i<a.length;i++){const k=end-a.length+i;a[i]=Math.max(0,Math.min(255,Math.round(128+128*(k>=0&&k<pcm.length?pcm[k]:0))));}}};
}
function sandbox(clock,analyserFactory,sr){
  const raf=[],ints=[];let iid=0;
  const sb={console:{log(){},warn(){},error(){}},Math,Array,Float32Array,Uint8Array,Object,Number,JSON,Date:{now:()=>clock.t},
   requestAnimationFrame:cb=>{raf.push(cb);return raf.length},cancelAnimationFrame:()=>{},
   setInterval:(fn,ms)=>{ints.push({id:++iid,fn,ms,next:clock.t+ms});return iid},clearInterval:id=>{const i=ints.findIndex(x=>x.id===id);if(i>=0)ints.splice(i,1)},
   setTimeout:(fn,ms)=>{ints.push({id:++iid,fn,ms,next:clock.t+ms,once:1});return iid},clearTimeout:()=>{},performance:{now:()=>clock.t}};
  sb.window=sb;vm.createContext(sb);
  const ctx={sampleRate:sr,createAnalyser:()=>analyserFactory()};
  return {sb,ctx,raf,ints,step(ms,frameMs=1000/60){const end=clock.t+ms;let acc=0;while(clock.t<end){clock.t+=1;acc+=1;if(acc>=frameMs){acc-=frameMs;raf.splice(0).forEach(cb=>cb());}
     for(const it of ints.slice()){if(it.next<=clock.t&&ints.includes(it)){if(it.once)ints.splice(ints.indexOf(it),1);else it.next+=it.ms;it.fn();}}}}};
}
const load=(sb,f,name)=>vm.runInContext(fs.readFileSync(path.join(REPO,'ui/js/engines',f),'utf8')+`\nthis.${name}=${name};`,sb);
const NOTE=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function runKey(spec,secs){
  const sr=22050,r=render(Object.assign({sr,seconds:secs+2},spec));const clock={t:1000};
  let an;const S=sandbox(clock,()=>an=mkAnalyser(r.pcm,sr,8192,clock,1000),sr);load(S.sb,'keyEngine.js','KeyEngine');
  const K=S.sb.KeyEngine;K.init(S.ctx,{connect(){}});
  let lock=null,lockT=null;K.watchContinuous(res=>{if(!lock){lock=res.key;lockT=(clock.t-1000)/1000;}});
  const snaps=[];
  for(let s=0;s<secs;s+=1){S.step(1000);if(s===4||s===9||s===secs-1){const e=K.estimateKeyFromChroma();snaps.push(e.key+'@'+(s+1)+'s');}}
  const fin=K.estimateKeyFromChroma();K.stop();
  return {truth:`${NOTE[r.truth.root]} ${r.truth.mode==='minor'?'Minor':'Major'}`,final:fin.key,lock,lockT,margin:fin.margin,snaps};
}
function runBpm(spec,secs){
  const sr=22050,r=render(Object.assign({sr,seconds:secs+2},spec));const clock={t:1000};
  const S=sandbox(clock,()=>mkAnalyser(r.pcm,sr,2048,clock,1000),sr);load(S.sb,'bpmEngine.js','BPMEngine');
  const B=S.sb.BPMEngine;B.init(S.ctx,{connect(){}});let first=null;const ups=[];
  B.onUpdate(b=>{if(first===null)first=(clock.t-1000)/1000;ups.push(b);});
  S.step(secs*1000);const cur=B.getCurrentBpm(),cand=B.getCandidateBpm(),conf=B.getConfidence();B.stop();
  return {truth:spec.bpm,confirmed:cur,cand,firstConfirmS:first,nUpdates:ups.length,distinct:[...new Set(ups)].slice(0,6),cv:conf?+conf.intervalCV.toFixed(3):null};
}
const mode=process.argv[3];
if(mode==='key'){
  const cases=[];for(const prog of ['major','minor','popLoop'])for(let root=0;root<12;root+=1)cases.push({prog,root,seed:root+1});
  const out=[];let ok=0,rel=0,par=0,fifth=0,none=0;
  for(const c of cases){const t0=Date.now();const x=runKey(c,25);const truthKey=x.truth;const f=x.final;
    // popLoop: nhãn "tonic" của synth = C-type progression Am F C G: chấp nhận C Major hoặc A Minor (tương đối) → ghi nhận riêng
    out.push({prog:c.prog,root:c.root,truth:truthKey,final:f,lock:x.lock,lockT:x.lockT,snaps:x.snaps.join(' '),ms:Date.now()-t0});}
  fs.writeFileSync(process.argv[4],JSON.stringify(out,null,1));console.log('done',out.length);
}else if(mode==='bpm'){
  const out=[];for(const bpm of [70,80,90,100,110,120,128,140,150,160,170,180]){for(const drums of [true]){const x=runBpm({bpm,drums,prog:'major',root:0,seed:3},40);out.push(x);}}
  // nhịp yếu: nhiễu cao
  for(const bpm of [90,120,140]){out.push(Object.assign({note:'noise0.05'},runBpm({bpm,drums:true,noise:0.05,seed:5},40)));}
  fs.writeFileSync(process.argv[4],JSON.stringify(out,null,1));console.log('done',out.length);
}
if(mode==='hard'){
  const conds={tune40:{tuningCents:40},tune_m45:{tuningCents:-45},noise08:{noise:0.08},nobass:{bass:false},noise08_nobass:{noise:0.08,bass:false}};
  const N2=NOTE;const rows=[];
  for(const [cn,co] of Object.entries(conds))for(const prog of ['major','minor'])for(const root of [0,3,6,9]){
    const x=runKey(Object.assign({prog,root,seed:root+7},co),20);rows.push({cond:cn,prog,truth:x.truth,final:x.final,lock:x.lock,lockT:x.lockT});}
  fs.writeFileSync(process.argv[4],JSON.stringify(rows,null,1));
  const g={};rows.forEach(r=>{g[r.cond]=g[r.cond]||{n:0,ok:0,lockedWrong:0,bad:[]};g[r.cond].n++;if(r.final===r.truth)g[r.cond].ok++;else g[r.cond].bad.push(r.truth+'->'+r.final);if(r.lock&&r.lock!==r.truth)g[r.cond].lockedWrong++;});
  console.log(JSON.stringify(g,null,1));
}
// ===== AI-ALG-03: BPM pattern benchmark =====
function drumTrack(pcm,sr,bpm,pattern,seed){
  const R=(function(){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})();
  const beat=60/bpm,N=pcm.length,secs=N/sr;
  const kick=(t,a)=>{const i0=Math.floor(t*sr);for(let i=0;i<0.12*sr&&i0+i<N;i++){const tt=i/sr;pcm[i0+i]+=a*Math.sin(2*Math.PI*(55+80*Math.exp(-tt*40))*tt)*Math.exp(-tt*25);}};
  const snare=(t,a)=>{const i0=Math.floor(t*sr);for(let i=0;i<0.1*sr&&i0+i<N;i++){const tt=i/sr;pcm[i0+i]+=a*(R()*2-1)*Math.exp(-tt*30);}};
  const hat=(t,a)=>{const i0=Math.floor(t*sr);for(let i=0;i<0.03*sr&&i0+i<N;i++){const tt=i/sr;pcm[i0+i]+=a*(R()*2-1)*Math.exp(-tt*120);}};
  const nb=Math.floor(secs/beat);
  for(let b=0;b<nb;b++){const t=b*beat;
    if(pattern==='every'){ if(b%2===0)kick(t,0.5); else snare(t,0.25); hat(t+beat/2,0.1); }
    else if(pattern==='kick2'){ if(b%2===0)kick(t,0.5); }
    else if(pattern==='nohat'){ if(b%2===0)kick(t,0.5); else snare(t,0.25); }
    else if(pattern==='eighths'){ if(b%4===0)kick(t,0.5); hat(t,0.3); hat(t+beat/2,0.3); }          // xung 8th mạnh, kick chỉ 1/bar
    else if(pattern==='sparse'){ if(b%2===0)kick(t,0.5); else snare(t,0.12); hat(t+beat/2,0.05); }   // kick mỗi 2 beat, snare/hat nhẹ
    else if(pattern==='sync'){ const m=b%4; if(m===0||m===3)kick(t,0.5); if(m===1)snare(t,0.25); hat(t+beat/2,0.1); } // bất đồng bộ nhẹ
  }
}
function runBpm2(bpm,pattern,secs,noise){
  const sr=22050;const r=render({sr,seconds:secs+2,bpm,drums:false,prog:'major',root:0,seed:3});
  drumTrack(r.pcm,sr,bpm,pattern,7); if(noise){let s=11;for(let i=0;i<r.pcm.length;i++){s=(s*1664525+1013904223)>>>0;r.pcm[i]+=noise*(s/4294967296*2-1);}}
  let mx=0;for(let i=0;i<r.pcm.length;i++)mx=Math.max(mx,Math.abs(r.pcm[i]));if(mx>0.95)for(let i=0;i<r.pcm.length;i++)r.pcm[i]*=0.95/mx;
  const clock={t:1000};const S=sandbox(clock,()=>mkAnalyser(r.pcm,sr,2048,clock,1000),sr);load(S.sb,'bpmEngine.js','BPMEngine');
  const B=S.sb.BPMEngine;B.init(S.ctx,{connect(){}});let first=null;const ups=[];B.onUpdate(b=>{if(first===null)first=(clock.t-1000)/1000;ups.push(b);});
  S.step(secs*1000);const cur=B.getCurrentBpm(),cand=B.getCandidateBpm();B.stop();
  return {bpm,pattern,confirmed:cur,cand,firstS:first,n:ups.length};
}
if(mode==='bpm2'){
  const BPMS=[60,70,80,89,90,100,120,140,160,170,179,180,200,240];const pats=(process.argv[5]||'every,eighths,sparse,sync').split(',');
  const rows=[];for(const p of pats)for(const b of BPMS)rows.push(runBpm2(b,p,40,0));
  fs.writeFileSync(process.argv[4],JSON.stringify(rows,null,1));console.log('done',rows.length);
}

if(mode==='hard2'){
  const tunes=[-45,-40,-30,-20,-10,0,10,20,30,40,45];const rows=[];
  for(const tc of tunes)for(const prog of ['major','minor'])for(const root of [0,3,6,9]){const x=runKey({prog,root,seed:root+7,tuningCents:tc},20);rows.push({tc,prog,truth:x.truth,final:x.final,lock:x.lock});}
  const g={};rows.forEach(r=>{g[r.tc]=g[r.tc]||{n:0,ok:0,lockedWrong:0};g[r.tc].n++;if(r.final===r.truth)g[r.tc].ok++;if(r.lock&&r.lock!==r.truth)g[r.tc].lockedWrong++;});
  fs.writeFileSync(process.argv[4],JSON.stringify(rows));console.log(Object.entries(g).map(([k,v])=>`${k}c: ${v.ok}/${v.n} lockSai=${v.lockedWrong}`).join(' | '));
}
if(mode==='cost'){const t0=process.hrtime.bigint();for(let i=0;i<4;i++)runKey({prog:'major',root:i,seed:i+1},20);const ms=Number(process.hrtime.bigint()-t0)/1e6;console.log((ms/4).toFixed(0)+' ms / 20 s audio (gồm cả FFT mô phỏng)');}
