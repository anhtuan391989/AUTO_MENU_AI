const Module=require('module');const path='/tmp/km/';
const sent=[];
class Output{constructor(n,v){this.name=n;this.virtual=v}send(t,p){sent.push({port:this.name,t,p})}close(){}}
const fake={Output,Input:class{on(){}close(){}},getOutputs:()=>['AUTO MENU AI'],getInputs:()=>[]};
const o=Module._load;Module._load=function(r){if(r==='easymidi')return fake;return o.apply(this,arguments)};
const o2=Module._load;Module._load=function(r){if(r==='xmllint-wasm')return {};return o2.apply(this,arguments)};const rt=require(path+'core/command-engine-js/runtime.js');
rt.start({readSettingsFile:()=>({midiOutputPort:'AUTO MENU AI'})});
(async()=>{
const prof={BEAT_INPUT_VOLUME:20,MASTER_OUTPUT_VOLUME:21,RETUNE_SPEED_MIC1:22,RETUNE_SPEED_MIC2:23};
const rows=[];
for(const [a,cc] of Object.entries(prof)) for(const k of [0,25,50,75,100]){
 const v=Math.round(Math.max(0,Math.min(100,k))*127/100); // công thức actionRegistry.js
 sent.length=0;
 const r=await rt.sendMidi({kind:'cc',number:cc,value:v,channel:15-1});
 const s=sent[0];
 rows.push(`| ${a} | ${cc} | 15 | 14 | ${k} | ${v} | ${r.ok?'OK':'FAIL'} | ${s.port} | ${s.t} cc=${s.p.controller} v=${s.p.value} ch0=${s.p.channel} | ${r.bytes.map(b=>'0x'+b.toString(16).toUpperCase()).join(' ')} |`);
}
console.log(rows.join('\n'));
})();
