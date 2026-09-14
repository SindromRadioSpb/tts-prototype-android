const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../public/js/youtube-timing');
function fixture(offset=0,relative=false){
  const source={video_id:'cPooKT5rFxc',url:'https://www.youtube.com/watch?v=cPooKT5rFxc',durationSec:600};
  const timeline=[],probes=T.windows(600).map((window,w)=>{
    const segments=[10,25,40,55].map((v,i)=>({text:`שלום עולם משפט ייחודי ${String.fromCharCode(1488+w)}${String.fromCharCode(1488+i)} עכשיו`,startSec:window.startSec+v}));
    // Put unique tokens in the anchor itself, not after its first four words.
    segments.forEach((s,i)=>{s.text=`שלום ${String.fromCharCode(1488+w)}${String.fromCharCode(1488+i)} עולם משפט עכשיו`;timeline.push({...s,startSec:s.startSec+offset,endSec:s.startSec+8+offset});});
    return {window,segments:segments.map(s=>({...s,startSec:s.startSec-(relative?window.startSec:0)}))};
  });return {schema:'youtube-asr-timing-evidence-v2',source,timeline,probes};
}
test('three independent windows recognize a clip-relative probe without shifting correct timeline',()=>{
  const r=T.diagnose(fixture(0,true));assert.equal(r.status,'verified');assert.equal(r.reason,'probe-relative-clock');assert.equal(r.correctionSec,0);assert.equal(r.coverage.playable,12);
});
test('constant shift is corrected only when all three windows agree',()=>{
  const e=fixture(20),r=T.diagnose(e);assert.equal(r.status,'verified');assert.equal(r.correctionSec,20);assert.equal(r.segments[0].startSec,10);assert.equal(e.timeline[0].startSec,30);
});
test('nonuniform drift never becomes a global median shift',()=>{
  const e=fixture();e.timeline.forEach((s,i)=>{s.startSec+=i<4?0:i<8?20:40;s.endSec+=i<4?0:i<8?20:40;});
  const r=T.diagnose(e);assert.equal(r.status,'partial');assert.equal(r.reason,'nonuniform-drift');assert.equal(r.correctionSec,null);assert.equal(r.coverage.playable,9);
});
test('legacy erased timestamps recover exact observed intervals only',()=>{
  const e=fixture(0,true);e.timeline.forEach(s=>{s.startSec=null;s.endSec=null;});const r=T.diagnose(e);
  assert.equal(r.status,'partial');assert.equal(r.coverage.playable,9);assert.equal(r.segments[3].startSec,null,'no invented tail');
});
test('repeated speech and ambiguous probe clocks cannot certify synchronization',()=>{
  const e=fixture();e.timeline.push({...e.timeline[0]});assert.equal(T.anchors(e.timeline,e.probes[0].segments).some(a=>a.row===0),false);
  assert.equal(T.clock([{startSec:60,text:'a'}],{startSec:50,endSec:140}).kind,'ambiguous');
});
test('missing probes and corrected out-of-range timestamps cannot yield full coverage',()=>{
  const e=fixture();e.probes.pop();assert.notEqual(T.diagnose(e).status,'verified');
  const b=fixture(20);b.timeline[0].startSec=1;assert.notEqual(T.diagnose(b).status,'verified');
});
test('subtitles recover whole identical rows only without changing source text',()=>{
  const e=fixture(),cues=e.timeline.map(s=>({text:s.text,start_ms:s.startSec*1000,end_ms:s.endSec*1000}));cues[2].text+=' אחר';
  const r=T.fromSubtitles(e.timeline,cues,600);assert.equal(r[2].startSec,null);assert.equal(r.filter(s=>s.startSec!=null).length,11);
});
