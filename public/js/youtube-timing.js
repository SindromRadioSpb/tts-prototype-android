// Deterministic clock diagnosis. Provider evidence is separate from playable intervals.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./asr-transcript.js'):root.AsrTranscript);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.YoutubeTiming=api;})(typeof globalThis!=='undefined'?globalThis:this,function(AT){
  'use strict';
  const VERSION='youtube-timing-v1',TOLERANCE=5,MIN_ANCHORS=3,EDGE=2;
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
      rows.forEach((row,i)=>{for(let j=0;j+4<=row.length;j++)if(row.slice(j,j+4).join(' ')===key.join(' ')){matches.push({row:i,at:j});break;}});
      // Repeated speech is not an anchor; first-hit matching can certify a wrong excerpt.
      // `aligned` — the excerpt opens the row, so both transcriptions name the SAME first sound
      // and their marks are comparable. Two independent hearings of one sentence rarely agree
      // word for word, so demanding whole-row equality throws away most honest measurements.
      // `exact` stays for partial recovery, which also needs the row's END to be observed.
      if(matches.length===1)out.push({row:matches[0].row,probe:p,aligned:matches[0].at===0,
        exact:normalized(timeline[matches[0].row].text)===normalized(probe[p].text)});
    }
    return out.filter((a,i)=>out.findIndex(b=>b.row===a.row)===i);
  }
  function clock(probe,win){
    if(!probe.length||probe.some(s=>!finite(s.startSec)))return {kind:'invalid',segments:[]};
    if(probe.some((s,i)=>i&&s.startSec<=probe[i-1].startSec))return {kind:'invalid',segments:[]};
    // Speech straddling a clip edge is reported a beat outside it, and one such mark used to
    // void the whole probe. normalizeWindow already reads window membership with this allowance.
    const span=win.endSec-win.startSec;
    const absolute=probe.every(s=>s.startSec>=win.startSec-EDGE&&s.startSec<win.endSec+EDGE);
    const relative=probe.every(s=>s.startSec>=-EDGE&&s.startSec<span+EDGE);
    if(absolute&&relative&&win.startSec!==0)return {kind:'ambiguous',segments:[]};
    if(!absolute&&!relative)return {kind:'outside-window',segments:[]};
    const offset=absolute?0:win.startSec;
    return {kind:offset?'clip-relative':'absolute',segments:probe.map(s=>({...s,startSec:s.startSec+offset}))};
  }
  // Gemini may timestamp a clipped transcription from zero while adjacent clips use the
  // full video's clock. Normalize each response before the text stitch sees its marks.
  function normalizeWindow(segments,win){
    const list=Array.isArray(segments)?segments:[];
    if(!win||win.startSec===0)return {kind:'absolute',segments:list.map(s=>({...s}))};
    const marks=list.map(s=>s&&s.start).filter(finite),span=win.endSec-win.startSec;
    if(!marks.length)return {kind:'missing',segments:list.map(s=>({...s,start:null}))};
    const absolute=marks.every(t=>t>=win.startSec-2&&t<=win.endSec+2);
    const relative=marks.every(t=>t>=0&&t<=span+2);
    const kind=absolute&&!relative?'absolute':relative&&!absolute?'clip-relative':
      absolute&&relative?'ambiguous':'outside-window';
    return {kind,segments:list.map(s=>({...s,start:finite(s.start)&&
      (kind==='absolute'||kind==='clip-relative')?s.start+(kind==='clip-relative'?win.startSec:0):null}))};
  }
  function diagnose(evidence){
    const timeline=evidence.timeline||[],duration=evidence.source&&evidence.source.durationSec;
    const plan=windows(duration),reports=[],partial=new Map();
    for(const expected of plan){
      const record=(evidence.probes||[]).find(p=>p.window.startSec===expected.startSec&&p.window.endSec===expected.endSec);
      const converted=record?clock(record.segments||[],expected):{kind:'missing',segments:[]};
      const matches=anchors(timeline,converted.segments);
      const differences=matches.filter(a=>a.aligned&&finite(timeline[a.row].startSec)).map(a=>timeline[a.row].startSec-converted.segments[a.probe].startSec);
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
    // Certification pins the clock at both ENDS of the run; between two agreeing edges a
    // uniform drift has nowhere to hide. An interior probe that came back silent — a failed
    // call, music, no uniquely matching speech — asserts nothing and cannot veto the edges.
    // A probe that CONTRADICTS still refuses, with fewer anchors than proof needs (R11).
    const certifies=r=>r.timed>=MIN_ANCHORS&&r.spread<=TOLERANCE;
    const unusable=r=>['invalid','ambiguous','outside-window','missing'].includes(r.clock);
    const deltas=reports.filter(certifies).map(r=>r.delta).filter(finite),offset=median(deltas);
    const conflicts=r=>r.timed>0&&(r.spread>TOLERANCE||finite(r.delta)&&finite(offset)&&Math.abs(r.delta-offset)>TOLERANCE);
    const ends=plan.length?[reports[0],reports[reports.length-1]]:[];
    const enough=plan.length>0&&ends.every(certifies)&&!reports.some(conflicts);
    const consistent=enough&&deltas.length>0&&Math.max(...deltas)-Math.min(...deltas)<=TOLERANCE;
    let reason=ends.some(unusable)?'probe-unusable':
      reports.some(conflicts)||enough&&!consistent?'nonuniform-drift':
      !ends.every(certifies)?'insufficient-anchors':'consistent';
    let segments=timeline.map(s=>({text:s.text,startSec:null,endSec:null})),status='unavailable',correction=null;
    if(consistent&&(plan.length===3||Math.abs(offset)<=TOLERANCE)){
      const shift=Math.abs(offset)<=TOLERANCE?0:offset;
      const candidate=timeline.map((s,i)=>({text:s.text,startSec:finite(s.startSec)?s.startSec-shift:null,
        endSec:finite(s.endSec)?s.endSec-shift:i+1<timeline.length&&finite(timeline[i+1].startSec)?timeline[i+1].startSec-shift:duration}));
      // A few identical second marks or a seam overlap should cost only those rows.
      // A substantial backwards jump means an entire clip may have the wrong clock.
      const backwards=candidate.some((s,i)=>i&&finite(s.startSec)&&finite(candidate[i-1].startSec)&&s.startSec<candidate[i-1].startSec-30);
      if(!backwards){
        let previousEnd=-1;
        segments=candidate.map(s=>{
          if(!finite(s.startSec)||!finite(s.endSec)||s.startSec<0||s.endSec<=s.startSec||
             s.endSec>duration||s.startSec<previousEnd)return {text:s.text,startSec:null,endSec:null};
          previousEnd=s.endSec;return s;
        });
        const playable=segments.filter(s=>finite(s.startSec)).length;
        if(playable===candidate.length){status='verified';correction=shift;reason=shift?'constant-offset':reports.some(r=>r.clock==='clip-relative')?'probe-relative-clock':'clock-consistent';}
        else if(playable){status='partial';reason='local-range-invalid';}
      }else reason='corrected-range-invalid';
    }
    if(status==='unavailable'){
      for(const [i,value]of partial)if(value)segments[i]={text:timeline[i].text,...value};
      // Out-of-order anchors are not usable partial playback.
      let end=-1;for(const s of segments){if(s.startSec==null)continue;if(s.startSec<end){s.startSec=null;s.endSec=null;}else end=s.endSec;}
      if(segments.some(s=>s.startSec!=null))status='partial';
    }
    return {schema:VERSION,status,reason,correctionSec:correction,reports,segments,
      certifiedWindows:reports.filter(certifies).length,plannedWindows:plan.length,
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
  return {VERSION,TOLERANCE,windows,anchors,clock,normalizeWindow,diagnose,fromSubtitles,mergeRecovered};
});
