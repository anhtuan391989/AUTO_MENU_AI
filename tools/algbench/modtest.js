const fs=require('fs'),vm=require('vm');const R=process.argv[2];
let t=0;const ints=[];const sb={console,Date:{now:()=>t},setInterval:(f,m)=>{ints.push({f,m,n:m});return ints.length},clearInterval:()=>{}};sb.window=sb;
const feed={root:0,mode:'Major',conf:0.9};
sb.KeyEngine={MIN_CONFIDENCE:0.35,NOTE_NAMES:["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],shortestSemitoneDelta:(a,b)=>{let d=(b-a+12)%12;return d>6?d-12:d},estimateKeyFromChroma:()=>({rootIndex:feed.root,mode:feed.mode,confidence:feed.conf})};
vm.createContext(sb);vm.runInContext(fs.readFileSync(R+'/ui/js/engines/modEngine.js','utf8')+'\nthis.ModEngine=ModEngine;',sb);
const ev=[];sb.ModEngine.start(0,d=>ev.push(d),()=>false,(s,p)=>ev.push('STATE:'+s));
function run(sec){for(let i=0;i<sec;i++){t+=1000;ints.forEach(x=>x.f());}}
console.log('A) C Major -> C Minor (cùng tonic, đổi mode) 10s'); feed.mode='Minor'; run(10); console.log('   sự kiện:',JSON.stringify(ev.filter(e=>typeof e!=='string'||e.includes('DETECTED'))));
ev.length=0; sb.ModEngine.start(0,d=>ev.push(d),()=>false,(s,p)=>ev.push('STATE:'+s)); feed.mode='Major';feed.root=9; feed.mode='Minor';
console.log('B) C Major -> A Minor (tương đối, cùng nốt) 10s'); run(10); console.log('   sự kiện:',JSON.stringify(ev.filter(e=>typeof e!=='string'||e.includes('DETECTED')).map(e=>e.semitone!==undefined?{semitone:e.semitone,targetKey:e.targetKey}:e)));
