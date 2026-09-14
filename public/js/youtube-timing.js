// Deterministic clock diagnosis. Provider evidence is separate from playable intervals.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./asr-transcript.js'):root.AsrTranscript);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.YoutubeTiming=api;})(typeof globalThis!=='undefined'?globalThis:this,function(AT){
  'use strict';
  const VERSION='youtube-timing-v1',TOLERANCE=5,MIN_ANCHORS=3;
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const words=s=>AT.stitchNormalizeWords(String(s||''));
  const normalized=s=>words(s).join(' ');
  const median=a=>{const b=a.slice().sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};
  function windows(duration){
    if(!finite(duration)||duration<=0)return [];
    if(duration<=9)return [{startSec:0,endSec:duration}];
    const span=Math.min(90,Math.floor(duration/3));
    return [0,Math.round((duration-span)/2),duration-span].map(startSec=>({startSec,endSec:startSec+span}));
  }
  function anchors(timeline,probe){
    const rows=timeline.map(s=>words(s.text));const out=[];
    for(let p=0;p<probe.length;p++){
      const key=words(probe[p].text).slice(0,4);if(key.length<4)continue;
      const matches=[];
      rows.forEach((row,i)=>{for(let j=0;j+4<=row.length;j++)if(row.slice(j,j+4).join(' ')===key.join(' ')){matches.push(i);break;}});
      // Repeated speech is not an anchor; first-hit matching can certify a wrong excerpt.
      if(matches.length===1)out.push({row:matches[0],probe:p,exact:normalized(timeline[matches[0]].text)===normalized(probe[p].text)});
    }
    return out.filter((a,i)=>out.findIndex(b=>b.row===a.row)===i);
  }
  function clock(probe,win){
    if(!probe.length||probe.some(s=>!finite(s.startSec)))return {kind:'invalid',segments:[]};
    if(probe.some((s,i)=>i&&s.startSec<=probe[i-1].startSec))return {kind:'invalid',segments:[]};
    const absolute=probe.every(s=>s.startSec>=win.startSec&&s.startSec<win.endSec);
    const relative=probe.every(s=>s.startSec>=0&&s.startSec<win.endSec-win.startSec);
    if(absolute&&relative&&win.startSec!==0)return {kind:'ambiguous',segments:[]};
    if(!absolute&&!relative)return {kind:'outside-window',segments:[]};
    const offset=absolute?0:win.startSec;
    return {kind:offset?'clip-relative':'absolute',segments:probe.map(s=>({...s,startSec:s.startSec+offset}))};
  }
  function diagnose(evidence){
    const timeline=evidence.timeline||[],duration=evidence.source&&evidence.source.durationSec;
    const plan=windows(duration),reports=[],partial=new Map();
    for(const expected of plan){
      const record=(evidence.probes||[]).find(p=>p.window.startSec===expected.startSec&&p.window.endSec===expected.endSec);
      const converted=record?clock(record.segments||[],expected):{kind:'missing',segments:[]};
      const matches=anchors(timeline,converted.segments);
      const differences=matches.filter(a=>a.exact&&finite(timeline[a.row].startSec)).map(a=>timeline[a.row].startSec-converted.segments[a.probe].startSec);
      const delta=median(differences),spread=delta==null?null:Math.max(...differences.map(v=>Math.abs(v-delta)));
      reports.push({window:expected,clock:converted.kind,matched:matches.length,timed: differences.length,delta,spread});
      // Only exact whole-row speech, with an independently observed next boundary, can
      // supply partial timing. No interpolation over unmatched text or extrapolated tail.
      for(const a of matches){const s=converted.segments[a.probe],next=converted.segments[a.probe+1];
        if(a.exact&&next&&next.startSec>s.startSec&&next.startSec<=expected.endSec){
          const value={startSec:s.startSec,endSec:next.startSec};const old=partial.get(a.row);
          if(old&&(Math.abs(old.startSec-value.startSec)>TOLERANCE||Math.abs(old.endSec-value.endSec)>TOLERANCE))partial.set(a.row,null);
          else if(old!==null)partial.set(a.row,value);
        }
      }
    }
    const enough=plan.length>0&&reports.every(r=>r.timed>=MIN_ANCHORS&&r.spread<=TOLERANCE);
    const deltas=reports.map(r=>r.delta).filter(finite),offset=median(deltas);
    const consistent=enough&&Math.max(...deltas)-Math.min(...deltas)<=TOLERANCE;
    let reason=reports.some(r=>['invalid','ambiguous','outside-window','missing'].includes(r.clock))?'probe-unusable':
      !enough?'insufficient-anchors':!consistent?'nonuniform-drift':'consistent';
    let segments=timeline.map(s=>({text:s.text,startSec:null,endSec:null})),status='unavailable',correction=null;
    if(consistent&&(plan.length===3||Math.abs(offset)<=TOLERANCE)){
      const shift=Math.abs(offset)<=TOLERANCE?0:offset;
      const candidate=timeline.map((s,i)=>({text:s.text,startSec:finite(s.startSec)?s.startSec-shift:null,
        endSec:finite(s.endSec)?s.endSec-shift:i+1<timeline.length&&finite(timeline[i+1].startSec)?timeline[i+1].startSec-shift:duration}));
      if(candidate.every((s,i)=>finite(s.startSec)&&finite(s.endSec)&&s.startSec>=0&&s.endSec>s.startSec&&s.endSec<=duration&&(!i||s.startSec>=candidate[i-1].endSec))){
        segments=candidate;status='verified';correction=shift;reason=shift?'constant-offset':reports.some(r=>r.clock==='clip-relative')?'probe-relative-clock':'clock-consistent';
      }else reason='corrected-range-invalid';
    }
    if(status!=='verified'){
      for(const [i,value]of partial)if(value)segments[i]={text:timeline[i].text,...value};
      // Out-of-order anchors are not usable partial playback.
      let end=-1;for(const s of segments){if(s.startSec==null)continue;if(s.startSec<end){s.startSec=null;s.endSec=null;}else end=s.endSec;}
      if(segments.some(s=>s.startSec!=null))status='partial';
    }
    return {schema:VERSION,status,reason,correctionSec:correction,reports,segments,
      coverage:{playable:segments.filter(s=>s.startSec!=null).length,total:segments.length}};
  }
  function fromSubtitles(timeline,cues,duration){
    const usable=cues.map(c=>({text:c.text,startSec:c.start_ms/1000,endSec:c.end_ms/1000}));
    const matched=anchors(timeline,usable),segments=timeline.map(s=>({text:s.text,startSec:null,endSec:null}));
    let end=-1;
    for(const a of matched.sort((a,b)=>a.row-b.row)){const c=usable[a.probe];if(a.exact&&finite(c.startSec)&&finite(c.endSec)&&c.startSec>=end&&c.endSec>c.startSec&&c.endSec<=duration){segments[a.row]=c;end=c.endSec;}}
    return segments;
  }
  // Recovery may add observed intervals, but must never erase existing playback.
  function mergeRecovered(saved,recovered){
    if(saved.length!==recovered.length||saved.some((s,i)=>s.text!==recovered[i].text))throw new Error('TIMING_REPAIR_TEXT_CHANGED');
    const out=saved.map(s=>({...s}));
    for(let i=0;i<out.length;i++){
      if(finite(out[i].startSec)&&finite(out[i].endSec))continue;
      const candidate=recovered[i];if(!finite(candidate.startSec)||!finite(candidate.endSec)||candidate.startSec<0||candidate.endSec<=candidate.startSec)continue;
      let previous=null,next=null;
      for(let j=i-1;j>=0;j--)if(finite(out[j].endSec)){previous=out[j];break;}
      for(let j=i+1;j<out.length;j++)if(finite(out[j].startSec)){next=out[j];break;}
      if(previous&&candidate.startSec<previous.endSec||next&&candidate.endSec>next.startSec)continue;
      out[i]={...out[i],startSec:candidate.startSec,endSec:candidate.endSec};
    }
    return out;
  }
  return {VERSION,TOLERANCE,windows,anchors,clock,diagnose,fromSubtitles,mergeRecovered};
});
