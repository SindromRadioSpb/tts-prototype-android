/* Async lifecycle overlay for a read-only lexical preview report. */
(function (root, factory) {
  const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LexicalResolutionService=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  async function hydrate(report,events,Core){
    if(!report||!report.resolution_queue)throw new Error('LEXICAL_QUEUE_REQUIRED');
    if(!Core||!Core.sourceAnchor)throw new Error('LEXICAL_RESOLUTION_CORE_REQUIRED');
    const items=[]; const byId=new Map(); const stateCounts={unresolved:0,resolved:0,deferred:0,rejected_all:0,stale:0};
    for(const raw of report.resolution_queue.items){
      const item={...raw,text_key:report.text.text_key||''};
      item.source_anchor=await Core.sourceAnchor(item);
      item.candidate_fingerprint=await Core.candidateFingerprint(item);
      const effective=Core.evaluate(item,events||[]);
      const hydrated={...item,resolution_state:effective.state,resolution_event_id:effective.event&&effective.event.id||'',stale_reason:effective.stale_reason||'',effective_analysis:effective.chosen_analysis||null};
      stateCounts[effective.state]=(stateCounts[effective.state]||0)+1; items.push(hydrated); byId.set(hydrated.lp_occurrence_id,hydrated);
    }
    const clusters=report.resolution_queue.clusters.map((cluster)=>{
      const occurrenceIds=cluster.occurrence_ids.filter((id)=>byId.has(id)&&byId.get(id).resolution_state!=='resolved');
      const occurrences=occurrenceIds.map((id)=>byId.get(id));
      const states={}; occurrenceIds.forEach((id)=>{const s=byId.get(id).resolution_state;states[s]=(states[s]||0)+1;});
      return {...cluster,occurrence_ids:occurrenceIds,occurrences,occurrence_count:occurrenceIds.length,state_counts:states,
        batch_review_eligible:cluster.batch_review_eligible&&occurrenceIds.length>1};
    }).filter((cluster)=>cluster.occurrence_count>0);
    const activeItems=items.filter((item)=>item.resolution_state!=='resolved');
    return {...report,counts:{...report.counts,resolution_state_counts:stateCounts,active_resolution_occurrences:activeItems.length,resolved_resolution_occurrences:stateCounts.resolved},
      resolution_queue:{...report.resolution_queue,items:activeItems,clusters,uncertain_occurrences:activeItems.length,queued_uncertain_occurrences:activeItems.length,coverage_pct:100},
      resolution_audit:{schema:'linguistpro-lexical-resolution-audit-v1',state_counts:stateCounts,items}};
  }
  return{hydrate};
});
