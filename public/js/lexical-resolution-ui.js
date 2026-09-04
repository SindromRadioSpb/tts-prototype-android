/* Owner-facing occurrence/cluster morphology review. No automatic decisions. */
(function (root) {
  'use strict';
  const $ = (tag, cls, text) => { const node=document.createElement(tag); if(cls)node.className=cls; if(text!=null)node.textContent=String(text); return node; };
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'lex-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const clean = (value) => value == null ? '' : String(value).trim();
  const uniq = (values) => { const seen=new Set(); return (values||[]).filter((value)=>{const key=JSON.stringify(value||{});if(seen.has(key))return false;seen.add(key);return true;}); };

  function candidateAnalysis(value, Preview) {
    value=value||{};
    return {
      lemma: clean(value.lemma||value.word||value.infinitive),
      lp_pos: Preview.normalizePos(value.lp_pos||value.pos||value.part_of_speech, value.kind),
      pealim_id: clean(value.pealim_id||value.id||value.pid), root: clean(value.root||value.trueRoot),
      binyan: clean(value.binyan), meaning_ru: clean(value.meaning_ru||value.meaning||value.gloss)
    };
  }
  function trap(event, box) {
    const nodes=Array.from(box.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((node)=>!node.hidden);
    if(!nodes.length)return; const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function suspend(overlay) {
    return Array.from(document.body.children).filter((node)=>node!==overlay&&!/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.tagName)).map((node)=>{
      const state={node,inert:node.getAttribute('inert'),aria:node.getAttribute('aria-hidden')}; node.setAttribute('inert','');node.setAttribute('aria-hidden','true');return state;
    });
  }
  function restore(states) { (states||[]).forEach((state)=>{if(!state.node.isConnected)return;if(state.inert==null)state.node.removeAttribute('inert');else state.node.setAttribute('inert',state.inert);if(state.aria==null)state.node.removeAttribute('aria-hidden');else state.node.setAttribute('aria-hidden',state.aria);}); }
  function receiptKey(textId) { return 'linguistpro.obsidian.lexical.receipt.v1.'+textId; }
  function previousReceipt(textId) { try{return JSON.parse(localStorage.getItem(receiptKey(textId))||'null');}catch(_){return null;} }
  function exactImpact(cluster, selectedId, batch) {
    if(batch&&!cluster.batch_review_eligible)throw new Error('LEXICAL_BATCH_NOT_ELIGIBLE');
    const targets=batch?(cluster.occurrences||[]).slice():(cluster.occurrences||[]).filter((occ)=>occ.lp_occurrence_id===selectedId);
    if(!targets.length)throw new Error('LEXICAL_IMPACT_EMPTY');
    return {occurrence_count:targets.length,occurrence_ids:targets.map((occ)=>occ.lp_occurrence_id),contexts:targets.map((occ)=>({lp_occurrence_id:occ.lp_occurrence_id,sentence_he:clean(occ.sentence_he_niqqud||occ.sentence_he),sentence_ru:clean(occ.sentence_ru)})),targets};
  }

  async function buildReport(item, localDb) {
    const Preview=root.ObsidianLexicalPreview, Notes=root.NotesAutoGen;
    if(!Preview||!root.LexicalResolutionCore||!root.LexicalResolutionService)throw new Error('LEXICAL_REVIEW_MODULES_UNAVAILABLE');
    const bundle=await localDb.exportBundle({includeArchived:true,textIds:[String(item.id)]});
    let ambiguityResolver=null,pealimResolver=null,pealimIdentityResolver=null;
    if(root.InflectionDict&&Notes){
      const data=await root.InflectionDict.ensureReady();
      const paradigms=(data&&data.paradigms)||[];
      const maps=Notes.buildResolverMaps(paradigms);
      const pidMap=new Map(paradigms.map((entry)=>[String(entry.pealim_id||entry.id||entry.pid||''),entry]));
      ambiguityResolver=(unit)=>Notes.formFirstResolve(maps,unit);
      pealimResolver=(pid)=>pidMap.get(String(pid))||null;
    }
    if(root.FunctionUsage&&typeof root.FunctionUsage.lookupByPealimId==='function'){
      await root.FunctionUsage.ensureReady();
      pealimIdentityResolver=({pealim_id})=>root.FunctionUsage.lookupByPealimId(pealim_id);
    }
    const raw=Preview.analyzeBundle(bundle,{textId:String(item.id),ambiguityResolver,pealimResolver,pealimIdentityResolver});
    const events=await localDb.listLexicalResolutionEventsForText(String(item.id));
    return root.LexicalResolutionService.hydrate(raw,events,root.LexicalResolutionCore);
  }

  function open(options) {
    options=options||{}; const item=options.item,localDb=options.localDb,t=options.t||((_,fallback)=>fallback);
    const trigger=options.returnFocus||document.activeElement;
    const overlay=$('div','lexres-overlay'); const dialog=$('section','lexres-dialog');
    const titleId='lexres-title-'+Date.now(); dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',titleId);dialog.setAttribute('tabindex','-1');
    const head=$('header','lexres-head'); const titleWrap=$('div','lexres-title-wrap');
    const eyebrow=$('div','lexres-eyebrow',t('room.resolution.eyebrow','Проверка морфологии')); const title=$('h2','lexres-title',t('room.resolution.title','Occurrence и кластеры'));title.id=titleId;
    titleWrap.append(eyebrow,title,$('p','lexres-material',clean(item&&item.title)));
    const close=$('button','lexres-close','×');close.type='button';close.setAttribute('aria-label',t('room.resolution.close','Закрыть'));
    head.append(titleWrap,close); const toolbar=$('div','lexres-toolbar'); const body=$('div','lexres-body');
    dialog.append(head,toolbar,body);overlay.append(dialog);document.body.append(overlay);const bg=suspend(overlay);
    let closed=false, report=null;
    const status=$('p','lexres-status',t('room.resolution.loading','Собираем морфологию и решения…'));status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.append(status);
    const doClose=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKey);overlay.remove();restore(bg);try{trigger&&trigger.focus&&trigger.focus();}catch(_){}};
    const onKey=(event)=>{if(event.key==='Escape'){event.preventDefault();doClose();}else if(event.key==='Tab')trap(event,dialog);};
    close.addEventListener('click',doClose);overlay.addEventListener('click',(event)=>{if(event.target===overlay)doClose();});document.addEventListener('keydown',onKey);dialog.focus();

    const setMessage=(message,state)=>{status.textContent=message;status.dataset.state=state||'';};
    const fill=(form,analysis)=>Object.keys(analysis).forEach((key)=>{const input=form.elements.namedItem(key);if(input)input.value=analysis[key]||'';});
    const formAnalysis=(form)=>({lemma:clean(form.elements.lemma.value),lp_pos:clean(form.elements.lp_pos.value),pealim_id:clean(form.elements.pealim_id.value),root:clean(form.elements.root.value),binyan:clean(form.elements.binyan.value),meaning_ru:clean(form.elements.meaning_ru.value)});
    const makeEvent=(occ,action,analysis,batchId)=>({
      id:uuid(),occurrence_id:occ.lp_occurrence_id,text_id:String(item.id),sentence_id:occ.row_id,word_offset:Number(occ.word_offset),
      text_key:report.text.text_key,order_index:Number(occ.order_index),surface_norm:clean(occ.surface),source_anchor:occ.source_anchor,
      action,chosen_analysis:analysis||{},candidate_fingerprint:occ.candidate_fingerprint,morph_model_version:clean(occ.morph_model_version),
      actor_kind:'owner',batch_id:batchId||'',supersedes_id:clean(occ.resolution_event_id),created_at:new Date().toISOString()
    });

    async function commit(targets,action,analysis,confirmBox) {
      const batchId=targets.length>1?uuid():''; const events=targets.map((occ)=>makeEvent(occ,action,analysis,batchId));
      const button=confirmBox.querySelector('[data-confirm-impact]');button.disabled=true;setMessage(t('room.resolution.saving','Сохраняем append-only решение…'),'working');
      try{
        if(events.length>1)await localDb.appendLexicalResolutionBatch(events);else await localDb.appendLexicalResolutionEvent(events[0]);
        report=await buildReport(item,localDb);render();setMessage(t('room.resolution.saved','Решение сохранено. Очередь и точные счётчики обновлены.'),'ready');
      }catch(error){button.disabled=false;setMessage(t('room.resolution.failed','Не удалось сохранить решение; исходная очередь не изменена.')+' '+clean(error&&error.message),'error');}
    }
    function stage(card,anchor,cluster,selectedId,action,analysis,batch) {
      card.querySelectorAll('.lexres-impact').forEach((node)=>node.remove());
      const exact=exactImpact(cluster,selectedId,batch);const targets=exact.targets;
      const impact=$('section','lexres-impact');impact.setAttribute('role','region');
      impact.append($('h4','lexres-impact-title',t('room.resolution.impactTitle','Точный impact до записи')),
        $('p','lexres-impact-count',t('room.resolution.impactCount','Будет записано решений: {count}').replace('{count}',targets.length)));
      const list=$('ol','lexres-impact-list');targets.forEach((occ)=>{const li=$('li');li.append($('code','',occ.lp_occurrence_id),$('span','',clean(occ.sentence_he_niqqud||occ.sentence_he)),$('small','',clean(occ.sentence_ru)));list.append(li);});impact.append(list);
      const row=$('div','lexres-impact-actions');const cancel=$('button','lexres-button',t('room.resolution.cancel','Отмена'));cancel.type='button';cancel.addEventListener('click',()=>impact.remove());
      const confirm=$('button','lexres-button lexres-primary',t('room.resolution.confirmImpact','Подтвердить точную запись'));confirm.type='button';confirm.dataset.confirmImpact='1';confirm.addEventListener('click',()=>commit(targets,action,analysis,impact));row.append(cancel,confirm);impact.append(row);card.insertBefore(impact,anchor);confirm.focus();
    }
    function clusterCard(cluster,index) {
      const details=$('details','lexres-cluster');if(index===0)details.open=true;
      const summary=$('summary','lexres-cluster-summary');const term=$('span','lexres-term',clean(cluster.niqqud||cluster.surface||'—'));term.dir='rtl';
      summary.append(term,$('span','lexres-badge',cluster.occurrence_count+' ×'),$('span','lexres-reasons',cluster.reasons.join(' · ')));details.append(summary);
      const inner=$('div','lexres-cluster-inner');const editor=$('section','lexres-editor');const contexts=$('fieldset','lexres-contexts');contexts.append($('legend','',t('room.resolution.contexts','Контексты occurrence')));const contextList=$('div','lexres-context-list');contexts.append(contextList);
      let selectedId=cluster.occurrence_ids[0];cluster.occurrences.forEach((occ,occIndex)=>{const label=$('label','lexres-context');const radio=$('input');radio.type='radio';radio.name='lexres-'+cluster.lp_resolution_cluster_id;radio.value=occ.lp_occurrence_id;radio.checked=occIndex===0;radio.addEventListener('change',()=>{selectedId=radio.value;});const copy=$('span');const he=$('bdi','lexres-he',clean(occ.sentence_he_niqqud||occ.sentence_he));he.dir='rtl';copy.append(he,$('small','',clean(occ.sentence_ru)), $('code','',occ.lp_occurrence_id));label.append(radio,copy);contextList.append(label);});
      const candidates=uniq((cluster.alternatives||[]).concat(cluster.candidate_evidence||[]));if(candidates.length){const candidatesBox=$('div','lexres-candidates');candidatesBox.append($('h4','',t('room.resolution.candidates','Кандидаты')));editor.append(candidatesBox);}
      const form=$('form','lexres-form');form.addEventListener('submit',(event)=>event.preventDefault());
      const fields=[['lemma',t('room.resolution.lemma','Лемма')],['lp_pos',t('room.resolution.pos','Часть речи')],['pealim_id','Pealim ID'],['root',t('room.resolution.root','Корень')],['binyan','Binyan'],['meaning_ru',t('room.resolution.meaning','Значение')]];
      fields.forEach(([name,labelText])=>{const label=$('label');label.append($('span','',labelText));const input=$('input');input.name=name;input.autocomplete='off';label.append(input);form.append(label);});
      const seed=cluster.occurrences[0]||cluster;fill(form,{lemma:seed.lemma,lp_pos:seed.lp_pos,pealim_id:seed.pealim_id,root:seed.root,binyan:seed.binyan,meaning_ru:seed.meaning_ru});
      const candidatesBox=editor.querySelector('.lexres-candidates');candidates.forEach((candidate)=>{const a=candidateAnalysis(candidate,root.ObsidianLexicalPreview);const button=$('button','lexres-candidate',(a.lemma||'—')+(a.lp_pos?' · '+a.lp_pos:'')+(a.pealim_id?' · #'+a.pealim_id:''));button.type='button';button.addEventListener('click',()=>fill(form,a));candidatesBox.append(button);});editor.append(form);
      const batchLabel=$('label','lexres-batch');const batch=$('input');batch.type='checkbox';batch.disabled=!cluster.batch_review_eligible;batchLabel.append(batch,$('span','',cluster.batch_review_eligible?t('room.resolution.batch','Применить ко всему кластеру после просмотра всех контекстов'):t('room.resolution.batchUnavailable','Для этого кластера доступно только решение occurrence')));editor.append(batchLabel);
      const actions=$('div','lexres-actions');
      const addAction=(labelText,action,primary)=>{const button=$('button','lexres-button'+(primary?' lexres-primary':''),labelText);button.type='button';button.addEventListener('click',()=>{const analysis=action==='manual_correction'?formAnalysis(form):{};if(action==='manual_correction'&&(!analysis.lemma||!analysis.lp_pos)){setMessage(t('room.resolution.required','Укажите лемму и часть речи.'),'error');return;}stage(inner,contexts,cluster,selectedId,action,analysis,batch.checked);});actions.append(button);};
      addAction(t('room.resolution.resolve','Подтвердить разбор'),'manual_correction',true);addAction(t('room.resolution.defer','Отложить'),'defer');addAction(t('room.resolution.reject','Отклонить кандидатов'),'reject_all');addAction(t('room.resolution.clear','Снять решение'),'clear');editor.append(actions);inner.append(editor,contexts);details.append(inner);return details;
    }
    async function exportObsidian() {
      const button=toolbar.querySelector('[data-export-obsidian]');button.disabled=true;setMessage(t('room.resolution.exporting','Собираем Obsidian ZIP…'),'working');
      try{
        const plan=root.ObsidianLexicalPreview.planObsidianPackage(report,{previousReceipt:previousReceipt(String(item.id))});const zip=new root.JSZip();plan.files.forEach((file)=>zip.file(file.path,file.content));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
        const name='linguistpro-obsidian-'+clean(item.title).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60)+'.zip';
        const result=root.ShareService.saveFile({blob,filename:name});if(!result||result.code!=='SAVE_STARTED')throw new Error('SAVE_NOT_STARTED');
        localStorage.setItem(receiptKey(String(item.id)),JSON.stringify(plan.receipt));setMessage(t('room.resolution.exported','Obsidian ZIP сохранён. Receipt содержит состояния и переходы: {count}.').replace('{count}',plan.receipt.resolution_transitions.length),'ready');
      }catch(error){setMessage(t('room.resolution.exportFailed','Не удалось собрать Obsidian ZIP.')+' '+clean(error&&error.message),'error');}finally{button.disabled=false;}
    }
    function render() {
      toolbar.replaceChildren();body.replaceChildren(status);
      const counts=$('div','lexres-counts');[['active_resolution_occurrences',t('room.resolution.active','В очереди')],['resolved_resolution_occurrences',t('room.resolution.resolved','Решено')]].forEach(([key,label])=>{const box=$('div','lexres-count');box.append($('strong','',report.counts[key]||0),$('span','',label));counts.append(box);});
      const clusters=$('div','lexres-count');clusters.append($('strong','',report.resolution_queue.clusters.length),$('span','',t('room.resolution.clusters','Кластеры')));counts.append(clusters);toolbar.append(counts);
      const exportButton=$('button','lexres-button lexres-export',t('room.resolution.export','Скачать Obsidian ZIP'));exportButton.type='button';exportButton.dataset.exportObsidian='1';exportButton.addEventListener('click',exportObsidian);toolbar.append(exportButton);
      if(!report.resolution_queue.clusters.length)body.append($('div','lexres-empty',t('room.resolution.empty','Активная очередь пуста. Решения сохранены в audit и попадут в receipt.')));
      else report.resolution_queue.clusters.forEach((cluster,index)=>body.append(clusterCard(cluster,index)));
      body.append(status);
    }
    buildReport(item,localDb).then((value)=>{if(closed)return;report=value;render();setMessage(t('room.resolution.ready','Очередь готова. Ни одно решение не применяется автоматически.'),'ready');}).catch((error)=>{if(closed)return;setMessage(t('room.resolution.loadFailed','Не удалось собрать очередь морфологии.')+' '+clean(error&&error.message),'error');});
    return {close:doClose};
  }
  const api={open,exactImpact};root.LexicalResolutionUI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
