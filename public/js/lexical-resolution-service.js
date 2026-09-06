/* Async lifecycle overlay for a read-only lexical preview report. */
(function (root, factory) {
  const api=factory(root); if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LexicalResolutionService=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){'use strict';
  function occurrenceId(occurrence){
    if(occurrence&&occurrence.lp_occurrence_id)return String(occurrence.lp_occurrence_id);
    if(!occurrence||occurrence.text_id==null||occurrence.sentence_id==null||!Number.isInteger(Number(occurrence.word_offset)))return'';
    return'lpro:'+String(occurrence.text_id)+':'+String(occurrence.sentence_id)+':'+Number(occurrence.word_offset);
  }
  function canonicallyEquivalentMarkOrders(value,limit){
    const input=String(value||'');const groups=[];let current='';
    for(const char of Array.from(input)){
      if(/\p{M}/u.test(char)&&current)current+=char;
      else{if(current)groups.push(current);current=char;}
    }
    if(current)groups.push(current);
    let variants=[''];const cap=Number.isInteger(limit)&&limit>0?limit:64;
    for(const group of groups){
      const chars=Array.from(group),base=chars.shift()||'',marks=chars;
      let orders=[marks.join('')];
      if(marks.length>1){
        const found=new Set();
        const visit=(left,prefix)=>{if(found.size>=cap)return;if(!left.length){found.add(prefix);return;}for(let i=0;i<left.length;i++)visit(left.slice(0,i).concat(left.slice(i+1)),prefix+left[i]);};
        visit(marks,'');orders=Array.from(found);
      }
      const next=[];for(const prefix of variants){for(const order of orders){next.push(prefix+base+order);if(next.length>=cap)break;}if(next.length>=cap)break;}variants=next;
    }
    return Array.from(new Set(variants));
  }
  async function matchSourceAnchor(item,event,Core){
    const direct=await Core.sourceAnchor(item);if(direct===event.source_anchor)return direct;
    // Older resolver exports could preserve a non-canonical order of Hebrew
    // combining marks in the token while the reader DOM canonicalised that
    // same token. Prove equivalence without weakening the anchor: only
    // permutations of the exact same marks are tried, and one must reproduce
    // the stored SHA-256 exactly. Letters, sentence, coordinates and text key
    // remain unchanged; any real source edit therefore still fails closed.
    const token=String(item.niqqud||item.surface||'');
    for(const variant of canonicallyEquivalentMarkOrders(token,64)){
      if(variant===token)continue;
      const candidate=await Core.sourceAnchor({...item,niqqud:variant});
      if(candidate===event.source_anchor)return candidate;
    }
    return'';
  }
  async function projectExactOccurrence(occurrence,events,Core){
    if(!Core||!Core.sourceAnchor||!Core.evaluate)return null;
    const id=occurrenceId(occurrence);if(!id)return null;
    const item={...occurrence,lp_occurrence_id:id};
    const latest=Core.latest(events||[],id);
    if(!latest||latest.action!=='manual_correction')return null;
    item.source_anchor=await matchSourceAnchor(item,latest,Core);
    if(!item.source_anchor)return null;
    // The reader has no current resolver candidate set. A manual correction is
    // still safe because Core.evaluate deliberately keys it only to the exact
    // source anchor; candidate confirmations remain fail-closed here.
    item.candidate_fingerprint='';
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
  async function hydrate(report,events,Core,options){
    // A refresh/clear must fold over the machine source, not the previous
    // effective projection. This is explicit and survives JSON round-trips.
    report=report&&report.source_projection||report;
    if(!report||!report.resolution_queue)throw new Error('LEXICAL_QUEUE_REQUIRED');
    if(!Core||!Core.sourceAnchor)throw new Error('LEXICAL_RESOLUTION_CORE_REQUIRED');
    const items=[]; const byId=new Map(); const stateCounts={unresolved:0,resolved:0,deferred:0,rejected_all:0,stale:0};
    const queueItems=report.resolution_queue.items.slice();
    const knownIds=new Set(queueItems.map(item=>item.lp_occurrence_id));
    const extraClusters=[];
    const eventIds=new Set((events||[]).map(event=>event.occurrence_id));
    for(const lexeme of report.lexemes||[])for(const occ of lexeme.occurrences||[]){
      const id=occurrenceId({...occ,sentence_id:occ.row_id});
      if(!eventIds.has(id)||knownIds.has(id))continue;
      const item={...occ,lp_occurrence_id:id,lp_lexeme_id:lexeme.lp_lexeme_id,
        conflicts:lexeme.conflicts||[],reasons:['reviewed_occurrence']};
      queueItems.push(item);knownIds.add(id);
      extraClusters.push({lp_resolution_cluster_id:'review:'+id,cluster_signature:'review:'+id,
        surface:occ.surface,niqqud:occ.niqqud,lemma:occ.lemma,lp_pos:occ.lp_pos,
        reasons:item.reasons,alternatives:occ.alternatives||[],candidate_evidence:occ.candidate_evidence||[],
        occurrence_ids:[id],occurrences:[item],occurrence_count:1,batch_review_eligible:false,auto_apply_allowed:false});
    }
    for(const raw of queueItems){
      const item={...raw,text_key:report.text.text_key||''};
      item.source_anchor=await Core.sourceAnchor(item);
      const latest=Core.latest(events||[],item.lp_occurrence_id);
      if(latest&&latest.action==='manual_correction')item.source_anchor=await matchSourceAnchor(item,latest,Core)||item.source_anchor;
      item.candidate_fingerprint=await Core.candidateFingerprint(item);
      const effective=Core.evaluate(item,events||[]);
      const hydrated={...item,resolution_state:effective.state,resolution_event_id:effective.event&&effective.event.id||'',stale_reason:effective.stale_reason||'',effective_analysis:effective.chosen_analysis||null,
        effective_event_created_at:effective.event&&effective.event.created_at||'',effective_event_actor:effective.event&&effective.event.actor_kind||''};
      if(effective.state==='resolved')hydrated.analysis_identity=await Core.sha256Hex(Core.stableStringify([effective.chosen_analysis,hydrated.effective_event_actor]));
      stateCounts[effective.state]=(stateCounts[effective.state]||0)+1; items.push(hydrated); byId.set(hydrated.lp_occurrence_id,hydrated);
    }
    const clusters=report.resolution_queue.clusters.concat(extraClusters).map((cluster)=>{
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
    const Preview=typeof module==='object'&&module.exports?require('./obsidian-lexical-preview.js'):root.ObsidianLexicalPreview;
    if(report.lexemes&&(!Preview||!Preview.projectResolvedLexemes))throw new Error('LEXICAL_EFFECTIVE_PROJECTOR_REQUIRED');
    const projected=report.lexemes?Preview.projectResolvedLexemes(report,items,options):report;
    const reasonCounts={};
    for(const item of activeItems)for(const reason of item.reasons||[])reasonCounts[reason]=(reasonCounts[reason]||0)+1;
    return {...projected,source_projection:report,counts:{...projected.counts,resolution_state_counts:stateCounts,
      uncertain_occurrences:activeItems.length,queued_uncertain_occurrences:activeItems.length,resolution_clusters:clusters.length,
      resolution_queue_coverage_pct:100,active_resolution_occurrences:activeItems.length,resolved_resolution_occurrences:stateCounts.resolved},
      resolution_queue:{...report.resolution_queue,items:activeItems,clusters,reason_counts:reasonCounts,uncertain_occurrences:activeItems.length,queued_uncertain_occurrences:activeItems.length,coverage_pct:100},
      resolution_audit:{schema:'linguistpro-lexical-resolution-audit-v1',state_counts:stateCounts,items}};
  }
  return{hydrate,projectExactOccurrence,lookupExactOccurrence,canonicallyEquivalentMarkOrders};
});
