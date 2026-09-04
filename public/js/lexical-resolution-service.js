/* Async lifecycle overlay for a read-only lexical preview report. */
(function (root, factory) {
  const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LexicalResolutionService=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  function occurrenceId(occurrence){
    if(occurrence&&occurrence.lp_occurrence_id)return String(occurrence.lp_occurrence_id);
    if(!occurrence||occurrence.text_id==null||occurrence.sentence_id==null||!Number.isInteger(Number(occurrence.word_offset)))return'';
    return'lpro:'+String(occurrence.text_id)+':'+String(occurrence.sentence_id)+':'+Number(occurrence.word_offset);
  }
  async function projectExactOccurrence(occurrence,events,Core){
    if(!Core||!Core.sourceAnchor||!Core.evaluate)return null;
    const id=occurrenceId(occurrence);if(!id)return null;
    const item={...occurrence,lp_occurrence_id:id};
    item.source_anchor=await Core.sourceAnchor(item);
    // The reader has no current resolver candidate set. A manual correction is
    // still safe because Core.evaluate deliberately keys it only to the exact
    // source anchor; candidate confirmations remain fail-closed here.
    item.candidate_fingerprint='';
    const latest=Core.latest(events||[],id);
    if(!latest||latest.action!=='manual_correction')return null;
    const effective=Core.evaluate(item,events||[]);
    if(effective.state!=='resolved')return null;
    return{state:'resolved',analysis:effective.chosen_analysis,event_id:latest.id,actor_kind:latest.actor_kind,created_at:latest.created_at};
  }
  async function lookupExactOccurrence(occurrence,repository,Core){
    const id=occurrenceId(occurrence);if(!id||!repository)return null;
    let events=[];
    // Prefer the bounded indexed read. Older cached LocalDb module instances may
    // not expose it yet while the already-established per-text reader remains
    // available. The compatibility path stays exact: it filters by the same
    // occurrence id before source-anchor validation in projectExactOccurrence.
    if(typeof repository.listLexicalResolutionEventsForOccurrence==='function'){
      try{events=await repository.listLexicalResolutionEventsForOccurrence(id)||[];}catch(_){events=[];}
    }
    if(!events.length&&occurrence&&occurrence.text_id!=null&&typeof repository.listLexicalResolutionEventsForText==='function'){
      const textEvents=await repository.listLexicalResolutionEventsForText(String(occurrence.text_id))||[];
      events=textEvents.filter((event)=>String(event&&event.occurrence_id||'')===id);
    }
    return projectExactOccurrence(occurrence,events,Core);
  }
  async function hydrate(report,events,Core){
    if(!report||!report.resolution_queue)throw new Error('LEXICAL_QUEUE_REQUIRED');
    if(!Core||!Core.sourceAnchor)throw new Error('LEXICAL_RESOLUTION_CORE_REQUIRED');
    const items=[]; const byId=new Map(); const stateCounts={unresolved:0,resolved:0,deferred:0,rejected_all:0,stale:0};
    for(const raw of report.resolution_queue.items){
      const item={...raw,text_key:report.text.text_key||''};
      item.source_anchor=await Core.sourceAnchor(item);
      item.candidate_fingerprint=await Core.candidateFingerprint(item);
      const effective=Core.evaluate(item,events||[]);
      const hydrated={...item,resolution_state:effective.state,resolution_event_id:effective.event&&effective.event.id||'',stale_reason:effective.stale_reason||'',effective_analysis:effective.chosen_analysis||null,
        effective_event_created_at:effective.event&&effective.event.created_at||'',effective_event_actor:effective.event&&effective.event.actor_kind||''};
      stateCounts[effective.state]=(stateCounts[effective.state]||0)+1; items.push(hydrated); byId.set(hydrated.lp_occurrence_id,hydrated);
    }
    const clusters=report.resolution_queue.clusters.map((cluster)=>{
      const clusterItems=cluster.occurrence_ids.filter((id)=>byId.has(id)).map((id)=>byId.get(id));
      const prior=cluster.batch_review_eligible?clusterItems.filter((item)=>item.resolution_state==='resolved'&&item.effective_analysis)
        .sort((a,b)=>String(a.effective_event_created_at).localeCompare(String(b.effective_event_created_at))||String(a.resolution_event_id).localeCompare(String(b.resolution_event_id))).pop():null;
      const occurrenceIds=cluster.occurrence_ids.filter((id)=>byId.has(id)&&byId.get(id).resolution_state!=='resolved');
      const occurrences=occurrenceIds.map((id)=>byId.get(id));
      const states={}; occurrenceIds.forEach((id)=>{const s=byId.get(id).resolution_state;states[s]=(states[s]||0)+1;});
      return {...cluster,occurrence_ids:occurrenceIds,occurrences,occurrence_count:occurrenceIds.length,state_counts:states,
        prior_analysis:prior&&prior.effective_analysis||null,prior_analysis_actor:prior&&prior.effective_event_actor||'',
        batch_review_eligible:cluster.batch_review_eligible&&occurrenceIds.length>1};
    }).filter((cluster)=>cluster.occurrence_count>0);
    const activeItems=items.filter((item)=>item.resolution_state!=='resolved');
    return {...report,counts:{...report.counts,resolution_state_counts:stateCounts,active_resolution_occurrences:activeItems.length,resolved_resolution_occurrences:stateCounts.resolved},
      resolution_queue:{...report.resolution_queue,items:activeItems,clusters,uncertain_occurrences:activeItems.length,queued_uncertain_occurrences:activeItems.length,coverage_pct:100},
      resolution_audit:{schema:'linguistpro-lexical-resolution-audit-v1',state_counts:stateCounts,items}};
  }
  return{hydrate,projectExactOccurrence,lookupExactOccurrence};
});
