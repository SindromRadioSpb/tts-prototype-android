/* Owner-facing occurrence/cluster morphology review. No automatic decisions. */
(function (root) {
  'use strict';
  const $ = (tag, cls, text) => { const node=document.createElement(tag); if(cls)node.className=cls; if(text!=null)node.textContent=String(text); return node; };
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'lex-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const clean = (value) => value == null ? '' : String(value).trim();
  const uniq = (values) => { const seen=new Set(); return (values||[]).filter((value)=>{const key=JSON.stringify(value||{});if(seen.has(key))return false;seen.add(key);return true;}); };
  const POS_VALUES = ['verb','noun','adjective','participle','propernoun','numeral','pronoun','adverb','preposition','conjunction','particle','interjection','other'];
  const REASON_VALUES = ['identity_guarded','ambiguous','unknown_pos','collision','skipped_token'];
  let tooltipSequence=0;

  const interpolate = (template, values) => Object.keys(values||{}).reduce((text,key)=>String(text).replaceAll('{'+key+'}',String(values[key])),String(template));
  const searchText = (value) => clean(value).toLocaleLowerCase().replace(/[֑-ׇ]/g,'');
  function reasonInfo(reason,t) {
    const fallback={
      identity_guarded:['Нужно подтвердить значение','Форма похожа на другое слово или имя. Система не подставляет словарное значение без проверки контекста.'],
      ambiguous:['Несколько вариантов','Для этой формы найдено несколько возможных разборов. Выберите вариант по смыслу предложения.'],
      unknown_pos:['Не определена часть речи','Автоматический анализ не смог надёжно определить часть речи.'],
      collision:['Данные расходятся','Для одинаковой словарной записи обнаружены несовместимые разборы. Проверьте примеры отдельно.'],
      skipped_token:['Нужно проверить написание','Форма могла разделиться на части неверно или содержать особое написание.']
    }[reason]||['Требуется проверка','Автоматического анализа недостаточно для безопасного решения.'];
    return {code:reason,label:t('room.resolution.reason.'+reason+'.label',fallback[0]),help:t('room.resolution.reason.'+reason+'.help',fallback[1])};
  }
  function matchesClusterFilter(cluster,query,reason) {
    if(reason&&reason!=='all'&&!(cluster.reasons||[]).includes(reason))return false;
    const needle=searchText(query);if(!needle)return true;
    const values=[cluster.surface,cluster.niqqud,cluster.lemma,cluster.lp_pos];
    (cluster.occurrences||[]).forEach((occ)=>values.push(occ.surface,occ.niqqud,occ.lemma,occ.meaning_ru,occ.sentence_he,occ.sentence_he_niqqud,occ.sentence_ru));
    return searchText(values.filter(Boolean).join(' ')).includes(needle);
  }
  function explain(node,text,label) {
    if(!text)return {wrap:node,node};
    const wrap=$('span','lexres-tip-wrap');const id='lexres-tip-'+(++tooltipSequence);
    const tip=$('span','lexres-tooltip',text);tip.id=id;tip.setAttribute('role','tooltip');
    node.setAttribute('aria-describedby',id);node.setAttribute('title',text);if(label)node.setAttribute('aria-label',label);
    wrap.append(node,tip);return {wrap,node,tip};
  }
  function helpLabel(labelText,helpText,t) {
    const row=$('span','lexres-label-row');row.append($('span','',labelText));
    const button=$('button','lexres-help','?');button.type='button';button.setAttribute('aria-label',interpolate(t('room.resolution.helpAbout','Что означает «{label}»'),{label:labelText}));
    row.append(explain(button,helpText).wrap);return row;
  }
  function fieldLabel(id,labelText,helpText,t) {
    const row=$('div','lexres-label-row');const label=$('label','',labelText);label.htmlFor=id;row.append(label);
    const button=$('button','lexres-help','?');button.type='button';button.setAttribute('aria-label',interpolate(t('room.resolution.helpAbout','Что означает «{label}»'),{label:labelText}));
    row.append(explain(button,helpText).wrap);return row;
  }

  function parsePealimId(value) {
    const raw=clean(value);if(/^\d+$/.test(raw))return raw;
    let url;try{url=new URL(raw);}catch(_){return '';}
    if(!/(^|\.)pealim\.com$/i.test(url.hostname))return '';
    const match=url.pathname.match(/\/(?:[a-z]{2}\/)?dict\/(\d+)(?:[-/]|$)/i);
    return match?match[1]:'';
  }
  function pealimUrl(value) {
    const id=parsePealimId(value);return id?'https://www.pealim.com/ru/dict/'+id+'/':'';
  }

  function candidateAnalysis(value, Preview) {
    value=value||{};
    const pealimId=parsePealimId(value.pealim_id||value.id||value.pid||value.pealim_url);
    return {
      lemma: clean(value.lemma||value.word||value.infinitive),
      lp_pos: Preview.normalizePos(value.lp_pos||value.pos||value.part_of_speech, value.kind),
      pealim_id: pealimId, pealim_url: pealimUrl(pealimId), root: clean(value.root||value.trueRoot),
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
  function exactImpact(cluster, selected, selectAll) {
    const occurrences=(cluster&&cluster.occurrences)||[];
    const requested=selectAll?occurrences.map((occ)=>occ.lp_occurrence_id):(Array.isArray(selected)?selected:[selected]);
    const selectedIds=new Set(requested.map(clean).filter(Boolean));
    const targets=occurrences.filter((occ)=>selectedIds.has(clean(occ.lp_occurrence_id)));
    if(targets.length>1&&!cluster.batch_review_eligible)throw new Error('LEXICAL_BATCH_NOT_ELIGIBLE');
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
    if(root.PealimIdentityOverrides&&typeof root.PealimIdentityOverrides.lookupByPealimId==='function')await root.PealimIdentityOverrides.ensureReady();
    if(root.FunctionUsage&&typeof root.FunctionUsage.lookupByPealimId==='function'){
      await root.FunctionUsage.ensureReady();
      pealimIdentityResolver=(input)=>{
        const override=root.PealimIdentityOverrides&&root.PealimIdentityOverrides.lookupByPealimId(input.pealim_id);if(override)return override;
        if(input.pealim_id){const exact=root.FunctionUsage.lookupByPealimId(input.pealim_id);return exact&&exact.lexical_pos===input.context_pos?Object.assign({},exact,{context_pos:input.context_pos}):exact;}
        const entry=root.FunctionUsage.lookup(input.surface,{stem:input.lemma,lemma:input.lemma});
        return entry&&entry.identity_safe===true?Object.assign({allow_surface_identity:true},entry):null;
      };
    }else if(root.PealimIdentityOverrides){pealimIdentityResolver=(input)=>root.PealimIdentityOverrides.lookupByPealimId(input.pealim_id);}
    const raw=Preview.analyzeBundle(bundle,{textId:String(item.id),ambiguityResolver,pealimResolver,pealimIdentityResolver});
    const events=await localDb.listLexicalResolutionEventsForText(String(item.id));
    return root.LexicalResolutionService.hydrate(raw,events,root.LexicalResolutionCore);
  }

  function open(options) {
    options=options||{}; const item=options.item,localDb=options.localDb,t=options.t||((_,fallback)=>fallback);
    const trigger=options.returnFocus||document.activeElement;
    const overlay=$('div','lexres-overlay'); const dialog=$('section','lexres-dialog');
    const titleId='lexres-title-'+Date.now(),introId='lexres-intro-'+Date.now(); dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',titleId);dialog.setAttribute('aria-describedby',introId);dialog.setAttribute('tabindex','-1');
    const head=$('header','lexres-head'); const titleWrap=$('div','lexres-title-wrap');
    const eyebrow=$('div','lexres-eyebrow',t('room.resolution.eyebrow','Проверка морфологии')); const title=$('h2','lexres-title',t('room.resolution.title','Слова, требующие проверки'));title.id=titleId;
    titleWrap.append(eyebrow,title,$('p','lexres-material',clean(item&&item.title)));
    const close=$('button','lexres-close','×');close.type='button';close.setAttribute('aria-label',t('room.resolution.close','Закрыть'));
    head.append(titleWrap,close);
    const intro=$('section','lexres-intro');intro.id=introId;
    intro.append($('p','lexres-intro-copy',t('room.resolution.intro','Здесь собраны только формы, которые программа не может определить без вашего контекста. Ничего не меняется автоматически.')));
    const steps=$('ol','lexres-steps');[
      [t('room.resolution.stepOpen','Откройте слово'),t('room.resolution.stepOpenHelp','Посмотрите, почему оно требует внимания.')],
      [t('room.resolution.stepCompare','Сверьте примеры'),t('room.resolution.stepCompareHelp','Значение и часть речи могут отличаться в разных предложениях.')],
      [t('room.resolution.stepDecide','Сохраните решение'),t('room.resolution.stepDecideHelp','Подтвердите только уверенный разбор или вернитесь к нему позже.')]
    ].forEach((step)=>{const li=$('li');li.append($('strong','',step[0]),$('span','',step[1]));steps.append(li);});intro.append(steps);
    const toolbar=$('div','lexres-toolbar'); const body=$('div','lexres-body');
    dialog.append(head,intro,toolbar,body);overlay.append(dialog);document.body.append(overlay);const bg=suspend(overlay);
    let closed=false, report=null,filterQuery='',filterReason='all';
    const status=$('p','lexres-status',t('room.resolution.loading','Собираем морфологию и решения…'));status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.append(status);
    const doClose=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKey);overlay.remove();restore(bg);try{trigger&&trigger.focus&&trigger.focus();}catch(_){}};
    const onKey=(event)=>{if(event.key==='Escape'){event.preventDefault();doClose();}else if(event.key==='Tab')trap(event,dialog);};
    close.addEventListener('click',doClose);overlay.addEventListener('click',(event)=>{if(event.target===overlay)doClose();});document.addEventListener('keydown',onKey);dialog.focus();

    const setMessage=(message,state)=>{status.textContent=message;status.dataset.state=state||'';};
    const posLabel=(pos)=>t('room.morph.pos.'+pos,pos);
    const syncPealimLink=(form)=>{const ref=form.elements.namedItem('pealim_ref');const link=form.querySelector('[data-pealim-open]');const id=parsePealimId(ref&&ref.value);if(link){link.href=id?pealimUrl(id):'#';link.hidden=!id;}};
    const fill=(form,analysis)=>{Object.keys(analysis||{}).forEach((key)=>{let input=form.elements.namedItem(key);if(key==='pealim_id'||key==='pealim_url')input=form.elements.namedItem('pealim_ref');if(input)input.value=(key==='pealim_id'?pealimUrl(analysis[key]):analysis[key])||'';});syncPealimLink(form);};
    const formAnalysis=(form)=>({lemma:clean(form.elements.lemma.value),lp_pos:clean(form.elements.lp_pos.value),pealim_id:parsePealimId(form.elements.pealim_ref.value),root:clean(form.elements.root.value),binyan:clean(form.elements.binyan.value),meaning_ru:clean(form.elements.meaning_ru.value)});
    const makeEvent=(occ,action,analysis,batchId)=>({
      id:uuid(),occurrence_id:occ.lp_occurrence_id,text_id:String(item.id),sentence_id:occ.row_id,word_offset:Number(occ.word_offset),
      text_key:report.text.text_key,order_index:Number(occ.order_index),surface_norm:clean(occ.surface),source_anchor:occ.source_anchor,
      action,chosen_analysis:analysis||{},candidate_fingerprint:occ.candidate_fingerprint,morph_model_version:clean(occ.morph_model_version),
      actor_kind:'owner',batch_id:batchId||'',supersedes_id:clean(occ.resolution_event_id),created_at:new Date().toISOString()
    });

    async function commit(targets,action,analysis,confirmBox) {
      const batchId=targets.length>1?uuid():''; const events=targets.map((occ)=>makeEvent(occ,action,analysis,batchId));
      const button=confirmBox.querySelector('[data-confirm-impact]');button.disabled=true;setMessage(t('room.resolution.saving','Сохраняем решение…'),'working');
      try{
        if(events.length>1)await localDb.appendLexicalResolutionBatch(events);else await localDb.appendLexicalResolutionEvent(events[0]);
        report=await buildReport(item,localDb);render();setMessage(t('room.resolution.saved','Решение сохранено. Список и счётчики обновлены.'),'ready');
      }catch(error){button.disabled=false;setMessage(t('room.resolution.failed','Не удалось сохранить решение; исходный список не изменён.')+' '+clean(error&&error.message),'error');}
    }
    function stage(card,anchor,cluster,selectedIds,action,analysis) {
      card.querySelectorAll('.lexres-impact').forEach((node)=>node.remove());
      const exact=exactImpact(cluster,selectedIds,false);const targets=exact.targets;
      const impact=$('section','lexres-impact');impact.setAttribute('role','region');impact.setAttribute('tabindex','-1');const impactTitle=$('h4','lexres-impact-title',t('room.resolution.impactTitle','Что изменится'));const impactTitleId='lexres-impact-title-'+Date.now();impactTitle.id=impactTitleId;impact.setAttribute('aria-labelledby',impactTitleId);
      impact.append(impactTitle,$('p','lexres-impact-count',interpolate(t('room.resolution.impactCount','Будет сохранено решений: {count}'),{count:targets.length})),$('p','lexres-impact-help',t('room.resolution.impactHelp','Проверьте список: изменения будут применены только к этим примерам.')));
      const list=$('ol','lexres-impact-list');targets.forEach((occ)=>{const li=$('li');li.append($('span','',clean(occ.sentence_he_niqqud||occ.sentence_he)),$('small','',clean(occ.sentence_ru)));const tech=$('details','lexres-technical');tech.append($('summary','',t('room.resolution.technical','Технические данные')),$('code','',occ.lp_occurrence_id));li.append(tech);list.append(li);});impact.append(list);
      const row=$('div','lexres-impact-actions');const cancel=$('button','lexres-button',t('room.resolution.cancel','Вернуться к проверке'));cancel.type='button';cancel.addEventListener('click',()=>impact.remove());
      const confirm=$('button','lexres-button lexres-primary',t('room.resolution.confirmImpact','Сохранить изменения'));confirm.type='button';confirm.dataset.confirmImpact='1';confirm.addEventListener('click',()=>commit(targets,action,analysis,impact));row.append(explain(cancel,t('room.resolution.cancelHelp','Закрыть предварительный просмотр без сохранения.')).wrap,explain(confirm,t('room.resolution.confirmImpactHelp','Записать только перечисленные выше решения.')).wrap);impact.append(row);card.insertBefore(impact,anchor);impact.focus();
    }
    function clusterCard(cluster,index) {
      const details=$('details','lexres-cluster');if(index===0)details.open=true;
      const summary=$('summary','lexres-cluster-summary');const term=$('span','lexres-term',clean(cluster.niqqud||cluster.surface||'—'));term.dir='rtl';
      const reasonList=$('span','lexres-reasons');(cluster.reasons||[]).map((reason)=>reasonInfo(reason,t)).forEach((info)=>{const chip=$('span','lexres-reason',info.label);chip.setAttribute('title',info.help);chip.setAttribute('aria-label',info.label+'. '+info.help);reasonList.append(chip);});
      const count=$('span','lexres-badge',interpolate(t('room.resolution.inTextCount','В тексте: {count}'),{count:cluster.occurrence_count}));summary.append(term,count,reasonList);details.append(summary);
      const inner=$('div','lexres-cluster-inner');
      const why=$('section','lexres-why');why.append($('h3','',t('room.resolution.whyReview','Почему нужна проверка')));const whyList=$('ul');(cluster.reasons||[]).map((reason)=>reasonInfo(reason,t)).forEach((info)=>{const li=$('li');li.append($('strong','',info.label),$('span','',info.help));whyList.append(li);});why.append(whyList);inner.append(why);
      const editor=$('section','lexres-editor');editor.append($('h3','lexres-editor-title',t('room.resolution.analysisTitle','Проверенный разбор')),$('p','lexres-editor-copy',t('room.resolution.analysisHelp','Сверьте предложенный вариант с примерами. Исправьте только те поля, в которых уверены.')));
      const contexts=$('fieldset','lexres-contexts');contexts.append($('legend','',t('room.resolution.contexts','Примеры из текста')),$('p','lexres-context-help',cluster.batch_review_eligible?t('room.resolution.contextsHelpMulti','Отметьте один или несколько примеров с одинаковым разбором. Перед сохранением вы увидите точный список изменений.'):t('room.resolution.contextsHelpSingle','Эти примеры могут различаться по смыслу, поэтому их нужно проверять по одному.')));
      let selectedIds=new Set(cluster.occurrence_ids.length?[cluster.occurrence_ids[0]]:[]),clearButton=null,selectAll=null,selectedCount=null;
      const contextList=$('div','lexres-context-list'),contextInputs=[];
      const updateSelectionState=()=>{
        const count=selectedIds.size,total=(cluster.occurrences||[]).length;
        if(selectedCount)selectedCount.textContent=interpolate(t('room.resolution.selectedCount','Выбрано: {selected} из {total}'),{selected:count,total});
        if(selectAll){selectAll.checked=total>0&&count===total;selectAll.indeterminate=count>0&&count<total;}
        contextInputs.forEach(({input,label})=>{input.checked=selectedIds.has(input.value);label.classList.toggle('is-selected',input.checked);});
        if(!clearButton)return;const chosen=(cluster.occurrences||[]).filter((occ)=>selectedIds.has(occ.lp_occurrence_id));const available=chosen.length>0&&chosen.every((occ)=>occ.resolution_event_id);clearButton.setAttribute('aria-disabled',available?'false':'true');clearButton.classList.toggle('is-disabled',!available);
      };
      const selectionBar=$('div','lexres-selection-bar');selectedCount=$('strong','lexres-selected-count');selectedCount.setAttribute('role','status');selectedCount.setAttribute('aria-live','polite');selectionBar.append(selectedCount);
      const allLabel=$('label','lexres-select-all');selectAll=$('input');selectAll.type='checkbox';selectAll.disabled=!cluster.batch_review_eligible;const allCopy=$('span','',cluster.batch_review_eligible?t('room.resolution.selectAll','Выбрать все примеры'):t('room.resolution.singleOnly','Только один пример за раз'));allLabel.append(selectAll,allCopy);selectionBar.append(explain(allLabel,cluster.batch_review_eligible?t('room.resolution.selectAllHelp','Отметить все оставшиеся примеры этой группы. Можно снять отметки с отдельных предложений.'):t('room.resolution.singleOnlyHelp','Общее решение отключено, потому что примеры могут требовать разных разборов.')).wrap);contexts.append(selectionBar,contextList);
      selectAll.addEventListener('change',()=>{selectedIds=selectAll.checked?new Set(cluster.occurrence_ids):new Set();updateSelectionState();});
      cluster.occurrences.forEach((occ,occIndex)=>{const label=$('label','lexres-context');const checkbox=$('input');checkbox.type='checkbox';checkbox.name='lexres-'+cluster.lp_resolution_cluster_id;checkbox.value=occ.lp_occurrence_id;checkbox.checked=occIndex===0;checkbox.addEventListener('change',()=>{if(checkbox.checked){if(!cluster.batch_review_eligible)selectedIds.clear();selectedIds.add(checkbox.value);}else selectedIds.delete(checkbox.value);updateSelectionState();});const copy=$('span');const he=$('bdi','lexres-he',clean(occ.sentence_he_niqqud||occ.sentence_he));he.dir='rtl';copy.append(he,$('small','',clean(occ.sentence_ru)));const tech=$('details','lexres-technical');tech.append($('summary','',t('room.resolution.technical','Технические данные')),$('code','',occ.lp_occurrence_id));copy.append(tech);label.append(checkbox,copy);contextInputs.push({input:checkbox,label});contextList.append(label);});
      const candidates=uniq((cluster.alternatives||[]).concat(cluster.candidate_evidence||[]));if(candidates.length){const candidatesBox=$('div','lexres-candidates');candidatesBox.append($('h4','',t('room.resolution.candidates','Предложенные варианты')),$('p','',t('room.resolution.candidatesHelp','Нажмите на вариант, чтобы перенести его в форму. Это ещё не сохраняет решение.')));editor.append(candidatesBox);}
      const form=$('form','lexres-form');form.addEventListener('submit',(event)=>event.preventDefault());
      const fields=[
        ['lemma',t('room.resolution.lemma','Лемма'),t('room.resolution.lemmaHelp','Словарная форма слова, по которой объединяются его формы.')],
        ['lp_pos',t('room.resolution.pos','Часть речи'),t('room.resolution.posHelp','Роль слова в выбранном предложении: глагол, существительное, предлог и т. д.')],
        ['pealim_ref',t('room.resolution.pealimLink','Ссылка Pealim'),t('room.resolution.pealimHelp','Ссылка на словарную карточку Pealim для сверки и последующего открытия.')],
        ['root',t('room.resolution.root','Корень'),t('room.resolution.rootHelp','Корневые согласные без огласовок. Оставьте поле пустым, если не уверены.')],
        ['binyan',t('room.resolution.binyan','Биньян'),t('room.resolution.binyanHelp','Модель образования глагола. Для неглагольных слов поле обычно не требуется.')],
        ['meaning_ru',t('room.resolution.meaning','Значение'),t('room.resolution.meaningHelp','Значение именно в выбранном предложении, а не все словарные переводы.')]
      ];
      fields.forEach(([name,labelText,helpText])=>{const field=$('div','lexres-field');const inputId='lexres-field-'+name+'-'+uuid();field.append(fieldLabel(inputId,labelText,helpText,t));let input;if(name==='lp_pos'){input=$('select');input.append(new Option(t('room.resolution.posChoose','Выберите часть речи'),''));POS_VALUES.forEach((pos)=>input.append(new Option(posLabel(pos),pos)));}else{input=$('input');input.autocomplete='off';}input.id=inputId;input.name=name;if(name==='pealim_ref'){input.inputMode='url';input.placeholder='https://www.pealim.com/ru/dict/6014-le/';input.addEventListener('input',()=>syncPealimLink(form));const help=$('small','lexres-field-help',t('room.resolution.pealimFieldNote','Можно вставить ссылку целиком — выделять номер не нужно.'));const openLink=$('a','lexres-pealim-open',t('room.resolution.pealimOpen','Открыть в Pealim'));openLink.target='_blank';openLink.rel='noopener';openLink.dataset.pealimOpen='1';openLink.hidden=true;field.append(input,help,openLink);}else field.append(input);form.append(field);});
      const analysisMap=new Map();candidates.map((candidate)=>candidateAnalysis(candidate,root.ObsidianLexicalPreview)).forEach((analysis)=>{const key=analysis.pealim_id||[analysis.lemma,analysis.lp_pos].join('#');const current=analysisMap.get(key)||{};analysisMap.set(key,Object.keys(analysis).reduce((out,field)=>{out[field]=analysis[field]||current[field]||'';return out;},{}));});const analyses=Array.from(analysisMap.values());
      const seed=cluster.occurrences[0]||cluster;const seedAnalysis=candidateAnalysis(seed,root.ObsidianLexicalPreview);
      // A sole candidate may prefill the draft editor, but is never written until
      // the owner reviews exact impact and confirms the append-only event.
      let initial=(!seedAnalysis.pealim_id&&analyses.length===1)?Object.assign({},seedAnalysis,analyses[0]):seedAnalysis;
      if(cluster.prior_analysis){initial=Object.assign({},initial,cluster.prior_analysis);const prior=$('p','lexres-prior-analysis',cluster.prior_analysis_actor==='teacher'?t('room.resolution.priorAnalysisTeacher','Форма заполнена последним разбором преподавателя для этой группы. Проверьте выбранные примеры перед сохранением.'):t('room.resolution.priorAnalysis','Форма заполнена вашим последним сохранённым разбором для этой группы. Проверьте выбранные примеры перед сохранением.'));prior.dataset.priorAnalysis='1';editor.append(prior);}
      fill(form,initial);
      const candidatesBox=editor.querySelector('.lexres-candidates');analyses.forEach((a)=>{const button=$('button','lexres-candidate',(a.lemma||'—')+(a.lp_pos?' · '+posLabel(a.lp_pos):'')+(a.pealim_id?' · '+pealimUrl(a.pealim_id):''));button.type='button';button.setAttribute('title',t('room.resolution.useCandidateHelp','Перенести этот вариант в форму для проверки.'));button.setAttribute('aria-label',t('room.resolution.useCandidate','Использовать вариант')+': '+button.textContent);button.addEventListener('click',()=>fill(form,a));candidatesBox.append(button);});editor.append(form);
      const actions=$('div','lexres-actions');
      const addAction=(labelText,action,helpText,primary)=>{const button=$('button','lexres-button'+(primary?' lexres-primary':''),labelText);button.type='button';button.addEventListener('click',()=>{const selected=(cluster.occurrences||[]).filter((occ)=>selectedIds.has(occ.lp_occurrence_id));if(!selected.length){setMessage(t('room.resolution.selectRequired','Отметьте хотя бы один пример.'),'error');return;}if(action==='clear'&&!selected.every((occ)=>occ.resolution_event_id)){setMessage(t('room.resolution.clearUnavailable','Не для всех выбранных примеров есть сохранённое решение.'),'error');return;}const analysis=action==='manual_correction'?formAnalysis(form):{};if(action==='manual_correction'&&(!analysis.lemma||!analysis.lp_pos)){setMessage(t('room.resolution.required','Укажите лемму и часть речи.'),'error');return;}if(action==='manual_correction'&&clean(form.elements.pealim_ref.value)&&!analysis.pealim_id){setMessage(t('room.resolution.pealimInvalid','Укажите корректную ссылку Pealim или числовой ID.'),'error');return;}stage(inner,contexts,cluster,Array.from(selectedIds),action,analysis);});actions.append(explain(button,helpText).wrap);return button;};
      addAction(t('room.resolution.resolve','Сохранить этот разбор'),'manual_correction',t('room.resolution.resolveHelp','Показать точный список затронутых примеров перед сохранением.'),true);
      addAction(t('room.resolution.defer','Вернуться позже'),'defer',t('room.resolution.deferHelp','Оставить пример в списке без выбора разбора.'));
      addAction(t('room.resolution.reject','Ни один вариант не подходит'),'reject_all',t('room.resolution.rejectHelp','Отметить, что предложенные варианты неверны. Пример останется видимым для ручного разбора.'));
      clearButton=addAction(t('room.resolution.clear','Отменить прежнее решение'),'clear',t('room.resolution.clearHelp','Убрать ранее сохранённое решение и снова показать пример как непроверенный.'));updateSelectionState();
      editor.append(actions);inner.append(editor,contexts);details.append(inner);return details;
    }
    async function exportObsidian() {
      const button=toolbar.querySelector('[data-export-obsidian]');button.disabled=true;setMessage(t('room.resolution.exporting','Собираем ZIP для Obsidian…'),'working');
      try{
        const plan=root.ObsidianLexicalPreview.planObsidianPackage(report,{previousReceipt:previousReceipt(String(item.id))});const zip=new root.JSZip();plan.files.forEach((file)=>zip.file(file.path,file.content));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
        const name='linguistpro-obsidian-'+clean(item.title).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60)+'.zip';
        const result=root.ShareService.saveFile({blob,filename:name});if(!result||result.code!=='SAVE_STARTED')throw new Error('SAVE_NOT_STARTED');
        localStorage.setItem(receiptKey(String(item.id)),JSON.stringify(plan.receipt));setMessage(interpolate(t('room.resolution.exported','ZIP для Obsidian сохранён. В отчёте зафиксировано переходов: {count}.'),{count:plan.receipt.resolution_transitions.length}),'ready');
      }catch(error){setMessage(t('room.resolution.exportFailed','Не удалось собрать ZIP для Obsidian.')+' '+clean(error&&error.message),'error');}finally{button.disabled=false;}
    }
    function render() {
      toolbar.replaceChildren();body.replaceChildren();
      const counts=$('div','lexres-counts');counts.setAttribute('role','group');counts.setAttribute('aria-label',t('room.resolution.summary','Сводка проверки'));
      const addCount=(value,label,help)=>{const box=$('div','lexres-count');box.append($('strong','',value||0),helpLabel(label,help,t));counts.append(box);};
      addCount(report.counts.active_resolution_occurrences,t('room.resolution.active','Нужно проверить'),t('room.resolution.activeHelp','Количество отдельных мест в тексте, где программе недостаточно данных для надёжного разбора.'));
      addCount(report.counts.resolved_resolution_occurrences,t('room.resolution.resolved','Проверено'),t('room.resolution.resolvedHelp','Количество мест, для которых вы уже сохранили решение.'));
      addCount(report.resolution_queue.clusters.length,t('room.resolution.clusters','Группы слов'),t('room.resolution.clustersHelp','Похожие случаи собраны вместе, чтобы можно было сравнить их и при необходимости обработать одним решением.'));
      toolbar.append(counts);
      const exportBox=$('div','lexres-export-box');const exportCopy=$('span');exportCopy.append($('strong','',t('room.resolution.exportTitle','Экспорт для Obsidian')),$('small','',t('room.resolution.exportHelp','Скачивает безопасный ZIP со словарём текста, решениями и отчётом об изменениях. Ваш vault не изменяется автоматически.')));
      const exportButton=$('button','lexres-button lexres-export',t('room.resolution.export','Скачать ZIP'));exportButton.type='button';exportButton.dataset.exportObsidian='1';exportButton.addEventListener('click',exportObsidian);exportBox.append(exportCopy,explain(exportButton,t('room.resolution.exportTooltip','Собрать текущую проверенную проекцию для импорта в Obsidian.')).wrap);toolbar.append(exportBox);
      if(!report.resolution_queue.clusters.length){body.append($('div','lexres-empty',t('room.resolution.empty','Все доступные случаи обработаны. Сохранённые решения войдут в следующий экспорт Obsidian.')),status);return;}
      const filters=$('section','lexres-filters');filters.setAttribute('aria-label',t('room.resolution.filters','Поиск и фильтры'));
      const searchLabel=$('label','lexres-filter');searchLabel.append($('span','lexres-filter-label',t('room.resolution.searchLabel','Найти слово или пример')));const search=$('input');search.type='search';search.value=filterQuery;search.placeholder=t('room.resolution.searchPlaceholder','Введите слово, лемму или перевод');search.autocomplete='off';searchLabel.append(search);
      const reasonLabel=$('label','lexres-filter');reasonLabel.append($('span','lexres-filter-label',t('room.resolution.filterLabel','Причина проверки')));const select=$('select');select.append(new Option(t('room.resolution.filterAll','Все причины'),'all'));const availableReasons=REASON_VALUES.filter((reason)=>report.resolution_queue.clusters.some((cluster)=>(cluster.reasons||[]).includes(reason)));availableReasons.forEach((reason)=>select.append(new Option(reasonInfo(reason,t).label,reason)));select.value=availableReasons.includes(filterReason)?filterReason:'all';filterReason=select.value;reasonLabel.append(select);
      const shown=$('p','lexres-shown');shown.setAttribute('role','status');shown.setAttribute('aria-live','polite');filters.append(searchLabel,reasonLabel,shown);body.append(filters);
      const list=$('div','lexres-list');body.append(list,status);
      const paint=()=>{const filtered=report.resolution_queue.clusters.filter((cluster)=>matchesClusterFilter(cluster,filterQuery,filterReason));shown.textContent=interpolate(t('room.resolution.shown','Показано групп: {shown} из {total}'),{shown:filtered.length,total:report.resolution_queue.clusters.length});list.replaceChildren();if(!filtered.length)list.append($('div','lexres-empty',t('room.resolution.noMatches','Ничего не найдено. Измените запрос или причину проверки.')));else filtered.forEach((cluster,index)=>list.append(clusterCard(cluster,index)));};
      search.addEventListener('input',()=>{filterQuery=search.value;paint();});select.addEventListener('change',()=>{filterReason=select.value;paint();});paint();
    }
    buildReport(item,localDb).then((value)=>{if(closed)return;report=value;render();setMessage(t('room.resolution.ready','Список готов. Ни одно решение не применяется автоматически.'),'ready');}).catch((error)=>{if(closed)return;setMessage(t('room.resolution.loadFailed','Не удалось подготовить список слов.')+' '+clean(error&&error.message),'error');});
    return {close:doClose};
  }
  const api={open,exactImpact,parsePealimId,pealimUrl,candidateAnalysis,reasonInfo,matchesClusterFilter};root.LexicalResolutionUI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
