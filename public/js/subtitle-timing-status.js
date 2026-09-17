(function(root,factory){
  const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SubtitleTimingStatus=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const hash=value=>/^[a-f0-9]{64}$/.test(String(value||''));
  function inspectHistory(history){
    const revisions=Array.isArray(history)?history:[];
    const original=revisions.find(r=>r?.provenance?.captions?.origin==='container-track');
    if(!original)return null;
    const captions=original.provenance.captions,assessment=captions.subtitle_sync;
    const later=revisions.slice(0,revisions.indexOf(original));
    if(later.some(r=>r.provenance?.schema==='timing-repair-v1'&&r.author_kind==='user'))return {status:'manual_changes'};
    const modified=later.filter(r=>(r.operations||[]).length);
    const bound=a=>a?.schema==='subtitle-speech-sync-v1'&&hash(a.input_sha256)&&
      hash(a.source_sha256)&&a.source_sha256===captions.source_sha256&&
      hash(a.subtitle_sha256)&&a.subtitle_sha256===captions.subtitle_track_sha256&&
      Number.isInteger(a.audio_stream_index)&&a.audio_stream_index===captions.audio_stream_index;
    if(modified.length){
      if(modified.length!==1)return {status:'unverified'};
      const revision=modified[0],a=revision.provenance?.subtitle_sync,delta=a?.apply_offset_ms;
      const segments=revision.segments||[],raw=original.segments||[];
      const exact=segments.length>0&&segments.length===raw.length&&segments.every((s,i)=>
        Number.isFinite(raw[i].start_ms)&&Number.isFinite(raw[i].end_ms)&&
        s.text===raw[i].text&&s.start_ms===raw[i].start_ms+delta&&s.end_ms===raw[i].end_ms+delta);
      if(revision.provenance?.surface==='subtitle-speech-sync'&&bound(a)&&a.status==='correctable'&&
         Number.isInteger(delta)&&Math.abs(delta)>300&&Math.abs(delta)<=1500&&exact)
        return {status:'corrected',offset_ms:delta};
      return {status:'unverified'};
    }
    if(bound(assessment)&&assessment.status==='aligned'&&assessment.apply_offset_ms===0)return {status:'aligned'};
    if(bound(assessment)&&assessment.status==='needs_review')return {status:'needs_review'};
    return {status:'unverified'};
  }
  async function forText(repo,textId){
    const binding=await repo.getTextBinding(String(textId));if(!binding)return null;
    const history=[],seen=new Set();let id=binding.revision_id;
    while(id&&history.length<128&&!seen.has(id)){
      seen.add(id);const revision=await repo.getRevision(id);if(!revision)break;
      history.push(revision);
      if(revision.provenance?.captions?.origin==='container-track')break;
      id=revision.parent_revision_id;
    }
    return inspectHistory(history);
  }
  return {inspectHistory,forText};
});
