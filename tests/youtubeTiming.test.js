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

test('partial recovery preserves existing intervals and rejects new overlaps',()=>{
  const saved=[{text:'a',startSec:1,endSec:5},{text:'b',startSec:null,endSec:null},{text:'c',startSec:10,endSec:14}];
  const recovered=[{text:'a',startSec:100,endSec:105},{text:'b',startSec:6,endSec:9},{text:'c',startSec:null,endSec:null}];
  const result=T.mergeRecovered(saved,recovered);assert.deepEqual(result[0],saved[0]);assert.deepEqual(result[2],saved[2]);assert.equal(result[1].startSec,6);
  recovered[1].endSec=11;assert.equal(T.mergeRecovered(saved,recovered)[1].startSec,null);
  recovered[1].endSec=9;recovered[1].startSec=4;assert.equal(T.mergeRecovered(saved,recovered)[1].startSec,null);
  recovered[1].text='different';assert.throws(()=>T.mergeRecovered(saved,recovered),/TEXT_CHANGED/);
  assert.equal(saved[1].startSec,null);
});

test('clipped ASR clocks are normalized per window before stitching',()=>{
  const relative=T.normalizeWindow([{start:0,text:'first'},{start:5,text:'second'}],{startSec:870,endSec:1800});
  assert.equal(relative.kind,'clip-relative');assert.deepEqual(relative.segments.map(s=>s.start),[870,875]);
  const absolute=T.normalizeWindow([{start:1770,text:'first'},{start:1790,text:'second'}],{startSec:1770,endSec:2700});
  assert.equal(absolute.kind,'absolute');assert.deepEqual(absolute.segments.map(s=>s.start),[1770,1790]);
  const uncertain=T.normalizeWindow([{start:880,text:'first'}],{startSec:870,endSec:1800});
  assert.equal(uncertain.kind,'ambiguous');assert.equal(uncertain.segments[0].start,null);
});

test('one equal start loses only that row after three independent clock probes',()=>{
  const evidence=fixture();evidence.timeline.push({...evidence.timeline.at(-1),text:'extra',startSec:evidence.timeline.at(-1).startSec});
  const result=T.diagnose(evidence);
  assert.equal(result.status,'partial');assert.equal(result.reason,'local-range-invalid');
  assert.equal(result.coverage.playable,12);assert.equal(result.segments[12].startSec,null);
  assert.equal(result.segments[6].startSec,evidence.timeline[6].startSec);
});

// Owner run 2026-09-17: a 61-minute video whose ASR clock was right end to end still offered
// playback on 6 of 990 rows. Two separate defects vetoed it; this fixture is that exact run.
test('one edge-straddling probe cannot veto a clock pinned at both ends of a real hour-long run',()=>{
  const evidence=require('./fixtures/youtube-timing-probe-veto.json');
  const r=T.diagnose(evidence);
  assert.equal(r.reports[1].clock,'absolute','speech starting 1s before the clip edge is still this clip');
  assert.equal(r.certifiedWindows,3,'all three checkpoints agree once anchors are read from row starts');
  assert.deepEqual(r.reports.map(x=>x.delta),[0,0,0]);
  assert.ok(r.reports.every(x=>x.spread<=2),'the clock holds to two seconds across the hour');
  assert.equal(r.coverage.total,990);
  assert.equal(r.coverage.playable,985,'only the rows sharing one second stamp stay unplayable');
  assert.equal(r.reason,'local-range-invalid','the clock is certified; those five rows have no usable range');
});

test('speech that straddles a clip edge keeps its probe usable',()=>{
  const win={startSec:1787,endSec:1877};
  assert.equal(T.clock([{startSec:1786,text:'a'},{startSec:1800,text:'b'}],win).kind,'absolute');
  assert.equal(T.clock([{startSec:-1,text:'a'},{startSec:14,text:'b'}],win).kind,'clip-relative');
  // Tolerance is an edge allowance, not an open door: a mark from elsewhere still voids the probe.
  assert.equal(T.clock([{startSec:1700,text:'a'},{startSec:1800,text:'b'}],win).kind,'outside-window');
});

test('a row matched from its first word measures the same boundary as an exact match',()=>{
  const timeline=[{text:'אחת שתיים שלוש ארבע חמש שש',startSec:10,endSec:18}];
  // The probe heard the same opening but transcribed the tail differently: same start, other words.
  const aligned=T.anchors(timeline,[{text:'אחת שתיים שלוש ארבע חמש שבע',startSec:10}]);
  assert.equal(aligned.length,1);assert.equal(aligned[0].aligned,true);assert.equal(aligned[0].exact,false);
  // A match that begins mid-row cannot time the row's own start.
  const inside=T.anchors(timeline,[{text:'שתיים שלוש ארבע חמש',startSec:11}]);
  assert.equal(inside.length,1);assert.equal(inside[0].aligned,false);
});

test('a silent interior probe cannot veto a clock the end probes agree on',()=>{
  const e=fixture();e.probes.splice(1,1);
  const r=T.diagnose(e);
  assert.equal(r.status,'verified');
  assert.equal(r.certifiedWindows,2,'the count of checkpoints that actually certified is reported');
  assert.equal(r.reports.length,3,'the silent window is still listed');
});

test('an interior probe that disagrees still refuses certification',()=>{
  const e=fixture();e.timeline.forEach((s,i)=>{if(i>=4&&i<8){s.startSec+=30;s.endSec+=30;}});
  const r=T.diagnose(e);
  assert.notEqual(r.status,'verified');
  assert.equal(r.reason,'nonuniform-drift');
});

// Owner run 2026-09-17 (video eKUFzdGd9r8): the closing ASR window [2670,3411] is 741s long and
// the model timed its speech 0:00–12:44, so three tail marks overshot the clip by 23s. Voiding
// the window for that cost 96 of 428 rows their timestamps — 22% of the material went untimed
// BEFORE any verification could look at it.
test('a few overshooting tail marks cost their own rows, not the whole ASR window',()=>{
  const win={startSec:2670,endSec:3411};
  const marks=[0,4,8,13,14,24,700,730,740,752,757,764];
  const result=T.normalizeWindow(marks.map(start=>({start,text:'t'+start})),win);
  assert.equal(result.kind,'clip-relative','the clip clock explains 9 of 12 marks and must be named');
  assert.deepEqual(result.segments.slice(0,6).map(s=>s.start),[2670,2674,2678,2683,2684,2694]);
  assert.deepEqual(result.segments.slice(-3).map(s=>s.start),[null,null,null],'marks past the clip end stay untimed');
  assert.equal(result.segments[8].start,3410,'the last mark inside the clip survives');
});

test('a window whose marks mostly fall outside it still claims no clock',()=>{
  const win={startSec:2670,endSec:3411};
  const scattered=[0,5,4000,4200,4400,4600,4800].map(start=>({start,text:'t'+start}));
  const result=T.normalizeWindow(scattered,win);
  assert.equal(result.kind,'outside-window');
  assert.deepEqual(result.segments.map(s=>s.start),new Array(7).fill(null));
});

// Per-window verdicts (owner decision 2026-09-18). Recognition timestamps drift PER ASR WINDOW —
// video eKUFzdGd9r8 was exact for 2700s and 27s late in its closing window — but the verdict used
// to cover the whole video, so one drifted window cost every row its playback.
function windowFixture(offsets){
  const duration=3411,asr=[{startSec:0,endSec:900},{startSec:870,endSec:1800},
    {startSec:1770,endSec:2700},{startSec:2670,endSec:3411}];
  const spans=T.spanPlan(duration,asr),timeline=[],probes=[];
  spans.forEach((span,w)=>{
    const drift=offsets[w]||0;
    span.probes.forEach((probe,p)=>{
      const heard=[6,25,44,63].map((v,i)=>({startSec:probe.startSec+v,
        text:`שלום ${String.fromCharCode(1488+w)}${String.fromCharCode(1488+p)}${String.fromCharCode(1488+i)} עולם משפט עכשיו`}));
      probes.push({window:probe,state:'complete',segments:heard});
      // The row carries the model's own mark, which is the truth plus this window's drift.
      heard.forEach(s=>timeline.push({text:s.text,startSec:s.startSec+drift,endSec:s.startSec+drift+8}));
    });
  });
  timeline.sort((a,b)=>a.startSec-b.startSec);
  return {schema:'youtube-asr-timing-evidence-v2',source:{video_id:'eKUFzdGd9r8',
    url:'https://www.youtube.com/watch?v=eKUFzdGd9r8',durationSec:duration},spans,timeline,probes};
}

test('the probe plan follows the windows recognition actually produced',()=>{
  const asr=[{startSec:0,endSec:900},{startSec:870,endSec:1800},{startSec:1770,endSec:2700},{startSec:2670,endSec:3411}];
  const spans=T.spanPlan(3411,asr);
  assert.equal(spans.length,4,'one verdict per window the model timed on its own clock');
  assert.deepEqual(spans.map(s=>[s.startSec,s.endSec]),[[0,870],[870,1770],[1770,2670],[2670,3411]]);
  assert.deepEqual(spans[0].probes,[{startSec:0,endSec:90}]);
  // The closing window is listened to at BOTH ends: an offset measured only at its start would
  // be carried across the whole tail and internal drift would never surface.
  assert.deepEqual(spans[3].probes,[{startSec:2670,endSec:2760},{startSec:3321,endSec:3411}]);
  assert.equal(T.spanPlan(600,[{startSec:0,endSec:600}]),null,'a single recognition pass keeps the three-point plan');
});

test('a window drifting on its own clock is corrected by its own measurement',()=>{
  const evidence=windowFixture([0,0,0,27]),r=T.diagnose(evidence);
  assert.equal(r.coverage.playable,r.coverage.total,'the sound rows keep playing and the late window is put back in time');
  assert.deepEqual(r.spans.map(s=>s.correctionSec),[0,0,0,27]);
  assert.deepEqual(r.spans.map(s=>s.certified),[true,true,true,true]);
  // The late window is moved by ITS OWN measurement; the untouched windows keep their own marks.
  assert.equal(r.segments.at(-1).startSec,evidence.timeline.at(-1).startSec-27);
  assert.equal(r.segments[0].startSec,evidence.timeline[0].startSec);
  assert.equal(r.correctionSec,null,'no single global shift is claimed for a video that never had one');
});

test('a window whose two ends disagree loses only its own rows',()=>{
  const evidence=windowFixture([0,0,0,0]);
  // Same closing window, but the model drifted INSIDE it: its start reads true, its tail is 40s late.
  evidence.timeline.forEach(s=>{if(s.startSec>=3321){s.startSec+=40;s.endSec+=40;}});
  const r=T.diagnose(evidence);
  assert.equal(r.spans[3].certified,false);
  assert.deepEqual(r.spans.slice(0,3).map(s=>s.certified),[true,true,true]);
  assert.ok(r.coverage.playable>=12,'the first three windows keep every row they earned');
  assert.ok(r.segments.slice(-4).every(s=>s.startSec==null),'no row of a self-contradicting window plays');
});
