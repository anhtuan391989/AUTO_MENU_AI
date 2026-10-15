'use strict';
// Thư viện dùng chung cho benchmark offline: FFT + AnalyserNode giả + sandbox vm với đồng hồ ảo (copy từ bench.js, không đổi hành vi).
const fs=require('fs'),path=require('path'),vm=require('vm');
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


const loadEngine=(REPO,sb,f,name)=>vm.runInContext(fs.readFileSync(path.join(REPO,'ui/js/engines',f),'utf8')+`\nthis.${name}=${name};`,sb);
module.exports={fft,mkAnalyser,sandbox,loadEngine};
