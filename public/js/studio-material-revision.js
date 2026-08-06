// Studio Ingest L3a.3 — the learning-table layer of the two-layer Material Workspace.
// Opening and saving are strictly local. Provider calls happen only from the two explicit
// regeneration actions and are validated for exact subset cardinality; there is no fallback.
(function () {
  'use strict';
  var repository = null, state = null;
  var REVIEW_PREFS_KEY = 'studio_material_playback_review_v1';
  var $ = function (id) { return typeof document === 'undefined' ? null : document.getElementById(id); };
  var clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  function tr(key, fallback) { try { var value = typeof t === 'function' ? t(key) : key; return value && value !== key ? value : fallback; } catch (_) { return fallback; } }
  function setStatus(text, kind) { var el = $('l3MaterialStatus'); if (!el) return; el.textContent = text || ''; el.dataset.kind = kind || 'info'; el.hidden = !text; }
  function repo() {
    if (!repository) {
      if (!window.__localDB) throw new Error('LOCAL_DB_REQUIRED');
      repository = window.MaterialRevisionRepository.createRepository(window.__localDB, window.MaterialRevisionCore);
    }
    return repository;
  }

  function fieldLabel(field) { return { he_plain:'עברית',he_niqqud:'ניקוד',translit:'Translit',translit_ru:'Транслит',ru:'Русский' }[field] || field; }
  function authorityLabel(meta) {
    if (!meta) return tr('studio.material.authorityImported','Импортировано');
    if (meta.authority === 'user') return tr('studio.material.authorityUser','Исправлено вручную · защищено');
    if (meta.status === 'invalidated') return tr('studio.material.invalidated','Требует обновления') + ' · ' + ([meta.provider,meta.model].filter(Boolean).join(' · ') || tr('studio.material.authorityProvider','Провайдер'));
    if (meta.authority === 'provider') return [meta.provider,meta.model].filter(Boolean).join(' · ') || tr('studio.material.authorityProvider','Провайдер');
    if (meta.authority === 'source') return tr('studio.material.authoritySource','Источник');
    return tr('studio.material.authorityImported','Импортировано');
  }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function mappingLabel(row) {
    if (!row.caption_segment_id) return '0 · ' + tr('studio.material.unmapped','нет связи');
    var n = Math.max(1, (row.source_segment_ids || []).length);
    return (n > 1 ? 'N (' + n + ')' : '1') + ' · ' + escapeHtml(row.caption_segment_id);
  }

  function readReviewPrefs() {
    var fallback={follow_enabled:true,review_mode:'all',custom_fields:window.MaterialRevisionCore.FIELD_NAMES.slice(),text_scale:'115',density:'comfortable',show_provenance:true};
    try {
      var parsed=JSON.parse(localStorage.getItem(REVIEW_PREFS_KEY)||'null');if(!parsed)return fallback;
      var mode=['all','he','niqqud','latin','ru-translit','translation','custom'].includes(parsed.review_mode)?parsed.review_mode:'all';
      return {follow_enabled:parsed.follow_enabled!==false,review_mode:mode,custom_fields:window.MaterialRevisionCore.fieldsForReviewMode('custom',parsed.custom_fields),text_scale:['100','115','130'].includes(String(parsed.text_scale))?String(parsed.text_scale):'115',density:parsed.density==='overview'?'overview':'comfortable',show_provenance:parsed.show_provenance!==false};
    } catch(_){return fallback;}
  }
  function saveReviewPrefs() {
    if(!state)return;try{localStorage.setItem(REVIEW_PREFS_KEY,JSON.stringify({follow_enabled:state.followEnabled,review_mode:state.reviewMode,custom_fields:state.customFields,text_scale:state.textScale,density:state.density,show_provenance:state.showProvenance}));}catch(_){}
  }
  function visibleFields(){return window.MaterialRevisionCore.fieldsForReviewMode(state&&state.reviewMode,state&&state.customFields);}
  function fieldDir(field){return field.indexOf('he_')===0?'rtl':(field==='translit'?'ltr':'auto');}
  function currentCaptionContext(){try{return window.StudioMediaEditor&&window.StudioMediaEditor.getCaptionContext?window.StudioMediaEditor.getCaptionContext():null;}catch(_){return null;}}

  function hasMappingConflict(){return !!(state&&state.mappingRepair&&state.mappingRepair.conflict_count>0);}
  function playbackRows(){return hasMappingConflict()?[]:(state&&state.rows||[]);}
  function hasAnyMapping(){return !!(state&&!hasMappingConflict()&&state.rows.some(function(row){return !!row.caption_segment_id;}));}
  function applyReviewPresentation(){
    var layer=$('l3MaterialLayer');if(!layer||!state)return;
    layer.dataset.density=state.density;layer.dataset.showProvenance=state.showProvenance?'true':'false';
    layer.style.setProperty('--l3-review-scale',String(Number(state.textScale||115)/100));
    var scale=$('l3MaterialTextScale');if(scale)scale.value=state.textScale;
    var density=$('l3MaterialDensity');if(density)density.value=state.density;
    var provenance=$('l3MaterialProvenance');if(provenance)provenance.checked=!!state.showProvenance;
  }

  function fitTextarea(input){if(!input)return;input.style.height='auto';input.style.height=Math.min(240,Math.max(48,input.scrollHeight||48))+'px';}
  function renderCompactField(row,field){return '<span class="l3-material-compact-field" data-field="'+field+'"><b>'+fieldLabel(field)+'</b><span dir="'+fieldDir(field)+'">'+escapeHtml(row[field]||'')+'</span></span>';}
  function suppressLayoutScroll(){if(!state)return;state.positioning=true;state.positioningToken=(state.positioningToken||0)+1;var token=state.positioningToken;requestAnimationFrame(function(){requestAnimationFrame(function(){if(state&&state.positioningToken===token)state.positioning=false;});});}

  function renderPlaybackState() {
    if(!state)return;var conflict=hasMappingConflict(),focus=state.playbackFocus||{row_ids:[],mapping_count:0,selected_position:0},ids=new Set(conflict?[]:(focus.row_ids||[])),host=$('l3MaterialRows'),mappingAvailable=hasAnyMapping();
    if(host)host.querySelectorAll('.l3-material-row').forEach(function(card){var rowId=card.dataset.rowId,isPlaying=ids.has(rowId),isSelected=rowId===state.selectedRowId;card.classList.toggle('is-playback',isPlaying);card.classList.toggle('is-selected',isSelected);card.classList.toggle('is-playback-sibling',isPlaying&&!isSelected);if(isPlaying&&isSelected)card.setAttribute('aria-current','true');else card.removeAttribute('aria-current');});
    var mapping=$('l3MaterialMappingStatus');if(mapping){mapping.textContent=conflict?tr('studio.material.mappingConflictStatus','Связи требуют исправления'):(focus.mapping_count>1?tr('studio.material.mappingPosition','Строка')+' '+focus.selected_position+' '+tr('studio.material.mappingOf','из')+' '+focus.mapping_count:(focus.mapping_count===1?tr('studio.material.oneMappedRow','Связана 1 строка'):tr('studio.material.noMappedRows','Нет связанной учебной строки')));mapping.dataset.kind=conflict?'warning':(focus.mapping_count?'mapped':'empty');}
    var empty=$('l3MaterialNoMapping');if(empty)empty.hidden=conflict||!mappingAvailable||focus.mapping_count!==0||!focus.caption_segment_id;
    var resume=$('l3MaterialResume');if(resume){resume.hidden=conflict||!(state.followEnabled&&state.followPaused&&focus.caption_segment_id);resume.textContent=tr('studio.material.resumeFollow','Вернуться к реплике')+(state.playbackNumber?' '+state.playbackNumber:'');}
    var toggle=$('l3MaterialFollow');if(toggle){toggle.checked=!!state.followEnabled;toggle.disabled=!mappingAvailable;}
    var followState=$('l3MaterialFollowState');if(followState){followState.dataset.state=conflict?'conflict':(!mappingAvailable?'unavailable':(!state.followEnabled?'off':(state.followPaused?'paused':'on')));followState.textContent=conflict?tr('studio.material.followConflict','Следование недоступно: исправьте связи'):(!mappingAvailable?tr('studio.material.followUnavailable','Следование недоступно: нет точных связей'):(!state.followEnabled?tr('studio.material.followOff','Следование выключено'):(state.followPaused?tr('studio.material.followPaused','Следование приостановлено'):tr('studio.material.followOn','Следование включено'))));}
  }

  function renderMappingRepair(){
    var banner=$('l3MaterialMappingRepair');if(!banner||!state)return;
    var text=$('l3MaterialMappingRepairText'),button=$('l3MaterialMappingRepairButton'),candidate=state.mappingRepair;
    var conflict=!!(candidate&&candidate.conflict_count);banner.hidden=!candidate&&!state.mappingRepairError;banner.dataset.kind=candidate?(conflict?'conflict':'ready'):'blocked';
    if(text)text.textContent=candidate
      ? tr('studio.material.mappingRepairReady','Можно безопасно восстановить связи')+': '+candidate.mapped_count+'/'+state.rows.length+' · '+tr('studio.material.mappingMissing','без связи')+': '+candidate.missing_count+' · '+tr('studio.material.mappingConflicts','конфликтов')+': '+candidate.conflict_count+' · '+tr('studio.material.localZeroModel','локально · 0 вызовов модели')
      : tr('studio.material.mappingRepairBlocked','Автоматическое восстановление недоступно')+' · '+String(state.mappingRepairError||'');
    if(button){button.hidden=!candidate;button.disabled=!!state.dirty;button.textContent=conflict?tr('studio.material.mappingRepairConflictAction','Исправить связи'):tr('studio.material.mappingRepairAction','Восстановить связи');}
  }

  function anchorSelected(behavior) {
    if(!state||!state.followEnabled||state.followPaused||!state.selectedRowId)return;var host=$('l3MaterialRows'),card=host&&Array.from(host.querySelectorAll('.l3-material-row')).find(function(value){return value.dataset.rowId===state.selectedRowId;});if(!host||!card)return;
    var previous=card.previousElementSibling,cr=host.getBoundingClientRect(),rr=card.getBoundingClientRect(),previousHeight=previous&&previous.classList.contains('l3-material-row')?previous.getBoundingClientRect().height:0;
    var target=window.MaterialRevisionCore.computeContextScrollTop({scroll_top:host.scrollTop,container_top:cr.top,container_height:host.clientHeight,row_top:rr.top,previous_row_height:previousHeight,gap:10,max_scroll_top:Math.max(0,host.scrollHeight-host.clientHeight),anchor_slot:'first'});
    suppressLayoutScroll();host.dataset.followScrolls=String((Number(host.dataset.followScrolls)||0)+1);
    if(typeof host.scrollTo==='function')host.scrollTo({top:target,behavior:behavior==='smooth'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'});else host.scrollTop=target;
  }

  function pauseFollow() {
    if(!state||!state.followEnabled||state.followPaused)return;state.followPaused=true;renderPlaybackState();
  }

  function bindReviewGestures() {
    var host=$('l3MaterialRows');if(!host)return;
    host.onwheel=pauseFollow;host.ontouchstart=pauseFollow;
    host.onpointerdown=function(event){if(event.target===host||event.target.closest('textarea'))pauseFollow();};
    host.onfocusin=function(event){if(event.target.closest('textarea'))pauseFollow();};
    host.onscroll=function(){if(state&&!state.positioning&&state.followEnabled)pauseFollow();};
  }

  function renderRows(rows, readOnly) {
    var host = $('l3MaterialRows'); if (!host) return;
    suppressLayoutScroll();
    if (!rows.length) { host.innerHTML = '<p class="l3-material-empty">' + escapeHtml(tr('studio.material.empty','Таблица ещё не сохранена.')) + '</p>'; return; }
    var fields=visibleFields(),selectedId=state&&state.selectedRowId;
    host.innerHTML = rows.map(function (row, index) {
      var selected=String(row.stable_row_id)===String(selectedId||''),playback=!!(state&&state.playbackFocus&&state.playbackFocus.row_ids.includes(String(row.stable_row_id)));
      var editorFields = fields.map(function (field) {
        var meta = row.field_meta && row.field_meta[field];
        return '<label class="l3-material-field" data-field="' + field + '" data-authority="' + escapeHtml(meta && meta.authority || 'imported') + '">' +
          '<span><b>' + fieldLabel(field) + '</b><small>' + escapeHtml(authorityLabel(meta)) + '</small></span>' +
          '<textarea rows="1" data-row="' + index + '" data-field="' + field + '" dir="' + fieldDir(field) + '" ' + (readOnly ? 'readonly' : '') + '>' + escapeHtml(row[field]) + '</textarea></label>';
      }).join('');
      var compact=fields.map(function(field){return renderCompactField(row,field);}).join('');
      var controls = readOnly||!selected ? '' : '<span class="l3-material-row-actions"><button type="button" data-row-action="up" data-index="'+index+'" aria-label="Move up">↑</button><button type="button" data-row-action="down" data-index="'+index+'" aria-label="Move down">↓</button><button type="button" data-row-action="delete" data-index="'+index+'" aria-label="Delete">×</button></span>';
      var classes='l3-material-row'+(selected?' is-selected':'')+(playback?' is-playback':'')+(playback&&!selected?' is-playback-sibling':'');
      var body=selected?'<div class="l3-material-fields">'+editorFields+'</div>':'<button type="button" class="l3-material-context" data-select-row="'+escapeHtml(row.stable_row_id)+'"><span class="l3-material-compact-grid" data-field-count="'+fields.length+'">'+compact+'</span></button>';
      return '<article class="'+classes+'" data-row-id="' + escapeHtml(row.stable_row_id) + '"'+(playback&&selected?' aria-current="true"':'')+'><header><strong>#' + (index+1) + '</strong><span class="l3-mapping-pill">' + mappingLabel(row) + '</span><code>' + escapeHtml(row.stable_row_id) + '</code>'+controls+'</header>'+body+'</article>';
    }).join('');
    if (!readOnly) host.querySelectorAll('textarea[data-field]').forEach(function (input) {
      fitTextarea(input);
      input.addEventListener('input', function () {
        var row = state.rows[Number(input.dataset.row)], field = input.dataset.field;
        if (!row || row[field] === input.value) return;
        row[field] = input.value; row.field_meta = { ...(row.field_meta || {}) };
        row.field_meta[field] = { authority:'user', locked:true, status:'current' };
        state.dirty = true; renderHeader();
        var small = input.parentElement.querySelector('small'); if (small) small.textContent = authorityLabel(row.field_meta[field]);
        input.parentElement.dataset.authority = 'user';
        fitTextarea(input);
      });
    });
    host.querySelectorAll('[data-select-row]').forEach(function(button){button.addEventListener('click',function(){selectLearningRow(button.dataset.selectRow);});});
    if (!readOnly) host.querySelectorAll('[data-row-action]').forEach(function(button){button.addEventListener('click',function(){mutateRow(Number(button.dataset.index),button.dataset.rowAction);});});
    bindReviewGestures();renderPlaybackState();renderMappingRepair();applyReviewPresentation();
  }

  function mutateRow(index, action) {
    if(!state||index<0||index>=state.rows.length)return;
    if(action==='delete')state.rows.splice(index,1);
    else {var target=action==='up'?index-1:index+1;if(target<0||target>=state.rows.length)return;var row=state.rows[index];state.rows[index]=state.rows[target];state.rows[target]=row;}
    state.dirty=true;if(state.selectedRowId&&!state.rows.some(function(row){return row.stable_row_id===state.selectedRowId;}))state.selectedRowId=null;renderRows(state.rows,false);renderHeader();anchorSelected('auto');
  }

  function addRow() {
    if(!state)return;var id=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():'row-'+Date.now();
    state.rows.push({stable_row_id:id,he_plain:'',he_niqqud:'',translit:'',translit_ru:'',ru:'',caption_segment_id:null,source_segment_ids:[],field_meta:{}});
    state.selectedRowId=id;state.followPaused=true;state.dirty=true;renderRows(state.rows,false);renderHeader();
  }

  function addRowForCurrentCaption(){
    if(!state)return;var context=currentCaptionContext();if(!context||!context.caption_segment_id)return addRow();var id=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():'row-'+Date.now();
    var row={stable_row_id:id,he_plain:String(context.text||''),he_niqqud:'',translit:'',translit_ru:'',ru:'',caption_segment_id:String(context.caption_segment_id),source_segment_ids:(context.source_segment_ids||[]).map(String),field_meta:{he_plain:{authority:'source',locked:false,status:'current'}}};
    var order=new Map((context.order_ids||[]).map(function(value,index){return[String(value),index];})),insert=state.rows.findIndex(function(existing){return order.has(String(existing.caption_segment_id||''))&&order.get(String(existing.caption_segment_id))>Number(context.index);});
    if(insert<0)insert=state.rows.length;state.rows.splice(insert,0,row);state.dirty=true;state.selectedRowId=id;state.playbackFocus=window.MaterialRevisionCore.buildPlaybackFocus({rows:state.rows,caption_segment_id:context.caption_segment_id,selected_row_id:id});renderRows(state.rows,false);renderHeader();anchorSelected('auto');
  }

  function renderHeader() {
    if (!state) return;
    var rev = $('l3MaterialRevision'); if (rev) rev.textContent = 'v' + state.base.revision_no + (state.dirty ? ' · ' + tr('studio.material.unsaved','не сохранено') : '');
    var save = $('l3MaterialSave'); if (save) save.disabled = !state.dirty && !state.pendingCaptionRevision;
    var update = $('l3MaterialUpdate'); if (update) update.disabled = !(state.impact && state.impact.impacted.length) || !!(state.impact && state.impact.conflicts.length);
    var impact = $('l3MaterialImpact');
    if (impact) {
      var n = state.impact ? state.impact.impacted.length : 0, c = state.impact ? state.impact.conflicts.length : 0;
      impact.textContent = c ? tr('studio.material.mappingConflict','Нужно вручную проверить mapping') + ': ' + c : (n ? tr('studio.material.affected','Затронуто строк') + ': ' + n : tr('studio.material.current','Таблица актуальна'));
      impact.dataset.kind = c ? 'warning' : (n ? 'changed' : 'ok');
    }
    renderMappingRepair();
  }

  async function renderHistory() {
    var select = $('l3MaterialHistory'); if (!select || !state) return;
    var history = await repo().listHistory(state.material.material_id);
    select.innerHTML = history.map(function (revision) { var date=new Date(revision.committed_at),stamp=Number.isFinite(date.getTime())?date.toLocaleString([],{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):revision.committed_at;return '<option title="'+escapeHtml(revision.committed_at)+'" value="' + revision.table_revision_id + '">v' + revision.revision_no + ' · ' + escapeHtml(stamp) + '</option>'; }).join('');
    select.value = state.base.table_revision_id;
  }

  function renderReviewControls(){
    if(!state)return;var mode=$('l3MaterialReviewMode');if(mode)mode.value=state.reviewMode;var fields=new Set(state.customFields||[]);document.querySelectorAll('#l3MaterialFieldPicker input[data-material-field]').forEach(function(input){input.checked=fields.has(input.dataset.materialField);});applyReviewPresentation();renderPlaybackState();renderMappingRepair();
  }

  function setPresentation(name,value){
    if(!state)return;
    if(name==='textScale')state.textScale=['100','115','130'].includes(String(value))?String(value):'115';
    else if(name==='density')state.density=String(value)==='overview'?'overview':'comfortable';
    else if(name==='showProvenance')state.showProvenance=!!value;
    saveReviewPrefs();applyReviewPresentation();
  }

  function syncToCaptionSegment(captionSegmentId,options){
    if(!state)return null;options=options||{};var id=String(captionSegmentId||''),preferred=state.selectedRowId;
    var focus=window.MaterialRevisionCore.buildPlaybackFocus({rows:playbackRows(),caption_segment_id:id,selected_row_id:preferred});
    var changed=!state.playbackFocus||state.playbackFocus.caption_segment_id!==focus.caption_segment_id||state.playbackFocus.selected_row_id!==focus.selected_row_id||state.playbackFocus.mapping_count!==focus.mapping_count;
    state.playbackFocus=focus;state.playbackNumber=Number(options.number)||0;
    var active=document.activeElement,typing=!!(active&&active.closest&&active.closest('#l3MaterialRows textarea'));
    if(typing)pauseFollow();
    if(state.followEnabled&&!state.followPaused){state.selectedRowId=focus.selected_row_id;if(changed){renderRows(state.rows,false);requestAnimationFrame(function(){anchorSelected('auto');});}else renderPlaybackState();}
    else renderPlaybackState();
    return focus;
  }

  function resumeFollow(){
    if(!state)return;state.followEnabled=true;state.followPaused=false;state.selectedRowId=state.playbackFocus&&state.playbackFocus.selected_row_id||null;saveReviewPrefs();renderRows(state.rows,false);renderReviewControls();requestAnimationFrame(function(){anchorSelected('auto');});
  }

  function setFollowEnabled(enabled){
    if(!state)return;state.followEnabled=!!enabled;state.followPaused=false;if(state.followEnabled)state.selectedRowId=state.playbackFocus&&state.playbackFocus.selected_row_id||state.selectedRowId;saveReviewPrefs();renderRows(state.rows,false);renderReviewControls();if(state.followEnabled)requestAnimationFrame(function(){anchorSelected('auto');});
  }

  function setReviewMode(mode){
    if(!state)return;state.reviewMode=['all','he','niqqud','latin','ru-translit','translation','custom'].includes(String(mode))?String(mode):'all';saveReviewPrefs();renderRows(state.rows,false);renderReviewControls();requestAnimationFrame(function(){anchorSelected('auto');});
  }

  function setCustomField(field,enabled){
    if(!state||!window.MaterialRevisionCore.FIELD_NAMES.includes(field))return;var next=new Set(state.customFields||[]);if(enabled)next.add(field);else next.delete(field);if(!next.size){next.add(field);var input=document.querySelector('#l3MaterialFieldPicker input[data-material-field="'+field+'"]');if(input)input.checked=true;setStatus(tr('studio.material.oneFieldRequired','Оставьте хотя бы одно поле.'),'error');}
    state.customFields=window.MaterialRevisionCore.FIELD_NAMES.filter(function(name){return next.has(name);});state.reviewMode='custom';saveReviewPrefs();renderRows(state.rows,false);renderReviewControls();requestAnimationFrame(function(){anchorSelected('auto');});
  }

  async function selectLearningRow(rowId){
    if(!state)return;var row=state.rows.find(function(value){return String(value.stable_row_id)===String(rowId);});if(!row)return;state.selectedRowId=String(row.stable_row_id);state.followPaused=false;
    if(!hasMappingConflict()&&row.caption_segment_id&&window.StudioMediaEditor&&window.StudioMediaEditor.selectCaptionSegment){await window.StudioMediaEditor.selectCaptionSegment(String(row.caption_segment_id));}
    state.playbackFocus=window.MaterialRevisionCore.buildPlaybackFocus({rows:playbackRows(),caption_segment_id:String(row.caption_segment_id||''),selected_row_id:state.selectedRowId});renderRows(state.rows,false);renderReviewControls();requestAnimationFrame(function(){anchorSelected('auto');});
  }

  // F2 (packet 2026-08-06): трек может обслуживать НЕСКОЛЬКО карточек. Прежний 'LIMIT 1' по
  // updated_at делал вторую карточку непромоутиваемой навсегда — а значит невидимой для
  // Import Center и непереносимой. Контекст берём из воркспейса (кем он открыт), не из
  // «текущего текста студии»; без контекста и при двух кандидатах — спрашиваем, а не гадаем.
  async function openForTrack(trackId, textId) {
    var panel = $('l3MaterialLayer'); if (!panel) return;
    panel.hidden = false; setStatus(tr('studio.material.loading','Загрузка локальной таблицы…'));
    var bindings = await window.__localDB.dbQuery('SELECT text_id FROM studio_text_media_bindings WHERE track_id=? ORDER BY updated_at DESC',[trackId]);
    if (!bindings.length) {
      state = null; renderRows([], true); setStatus(tr('studio.material.saveTableFirst','Сначала соберите и сохраните таблицу: после этого она появится здесь.'));
      return;
    }
    var context = textId != null ? textId
      : (window.StudioMediaPackage && typeof window.StudioMediaPackage.activeWorkspaceTextId === 'function'
        ? window.StudioMediaPackage.activeWorkspaceTextId() : null);
    var picked = window.MaterialRevisionCore.pickTextForTrack(bindings, context);
    if (!picked.text_id) {
      state = null; renderRows([], true);
      setStatus(tr('studio.material.trackSharedByCards','Этот транскрипт используют несколько карточек. Откройте нужную карточку — её таблица подтянется сюда.'));
      return;
    }
    var material = await repo().promoteLegacyText(picked.text_id);
    var base = await repo().getCurrentRevision(material.material_id);
    var prefs=readReviewPrefs(),context=currentCaptionContext();
    state = { trackId:String(trackId), material:material, base:base, rows:clone(base.rows), dirty:false, impact:{conflicts:[],impacted:[],reason:'CURRENT'},followEnabled:prefs.follow_enabled,followPaused:false,reviewMode:prefs.review_mode,customFields:prefs.custom_fields,textScale:prefs.text_scale,density:prefs.density,showProvenance:prefs.show_provenance,positioning:false,playbackNumber:context&&context.number||0,mappingRepair:null,mappingRepairError:null };
    await prepareMappingRepair();
    state.playbackFocus=window.MaterialRevisionCore.buildPlaybackFocus({rows:playbackRows(),caption_segment_id:context&&context.caption_segment_id});state.selectedRowId=state.playbackFocus.selected_row_id||(state.rows[0]&&state.rows[0].stable_row_id)||null;
    renderRows(state.rows, false); renderHeader(); renderReviewControls(); await renderHistory(); setStatus(null);requestAnimationFrame(function(){anchorSelected('auto');});
  }

  async function prepareMappingRepair(){
    if(!state)return;state.mappingRepair=null;state.mappingRepairError=null;
    var missing=state.rows.filter(function(row){return !row.caption_segment_id;}).length;
    if(!missing)return;
    var revisionId=state.base&&state.base.bound_caption_revision_id,revisionSha=state.base&&state.base.bound_caption_revision_sha256;
    if(!revisionId||!revisionSha){state.mappingRepairError='BOUND_CAPTION_REVISION_REQUIRED';return;}
    try{
      var mediaRepo=window.StudioMediaPackage&&window.StudioMediaPackage.browserRepository?window.StudioMediaPackage.browserRepository():null;
      if(!mediaRepo)throw new Error('MEDIA_PACKAGE_REPOSITORY_REQUIRED');
      var revision=await mediaRepo.getRevision(revisionId);
      if(!revision||String(revision.canonical_sha256)!==String(revisionSha))throw new Error('BOUND_CAPTION_REVISION_MISMATCH');
      var AT=window.AsrTranscript;if(!AT||typeof AT.alignRowsToSegments!=='function')throw new Error('ALIGNER_REQUIRED');
      var alignment=AT.alignRowsToSegments(state.rows.map(function(row){return String(row.he_plain||'');}),revision.segments||[]);
      if(!alignment.ok)throw new Error('ALIGN_'+String(alignment.reason||'FAILED'));
      var inputHash=await window.MaterialRevisionCore.sha256Hex({rows:state.rows.map(function(row){return row.he_plain;}),segments:(revision.segments||[]).map(function(segment){return{caption_segment_id:segment.caption_segment_id,text:segment.text};})});
      var proof={authority:'aligned-offline',algorithm_version:AT.ALIGN_VERSION||'unknown',bound_caption_revision_id:revisionId,bound_caption_revision_sha256:revisionSha,input_sha256:inputHash};
      var mapped=window.MaterialRevisionCore.planExactAlignedMappingRepair({rows:state.rows,segments:revision.segments||[],row_segment_indexes:alignment.rowSegIdx,provenance:proof});
      if(mapped.missing_count||mapped.conflict_count)state.mappingRepair={rows:mapped.rows,mapped_count:mapped.mapped_count,caption_count:mapped.caption_count,missing_count:mapped.missing_count,conflict_count:mapped.conflict_count,unchanged_count:mapped.unchanged_count,conflict_row_ids:mapped.conflict_row_ids,proof:proof,alignment:{aligned_rows:alignment.alignedRows,aligned_segments:alignment.alignedSegments}};
    }catch(e){state.mappingRepairError=e.code||e.message||String(e);}
  }

  async function repairMapping(){
    if(!state||!state.mappingRepair)return null;
    if(state.dirty){setStatus(tr('studio.material.mappingRepairSaveFirst','Сначала сохраните текущие ручные правки.'),'error');return null;}
    var candidate=state.mappingRepair;
    if(!window.confirm(tr('studio.material.mappingRepairConfirm','Создать новую локальную версию с доказанными связями?')+'\n'+candidate.mapped_count+'/'+state.rows.length+' · '+tr('studio.material.mappingMissing','без связи')+': '+candidate.missing_count+' · '+tr('studio.material.mappingConflicts','конфликтов')+': '+candidate.conflict_count+'\n'+tr('studio.material.localZeroModel','локально · 0 вызовов модели')))return null;
    try{
      var committed=await repo().commitRevision({material_id:state.material.material_id,base_table_revision_id:state.base.table_revision_id,rows:candidate.rows,provider_context:state.base.provider_context,bound_caption_revision_id:state.base.bound_caption_revision_id,bound_caption_revision_sha256:state.base.bound_caption_revision_sha256,impact:{kind:'mapping_repair',zero_provider_calls:true,proof:candidate.proof,aligned_rows:candidate.alignment.aligned_rows,aligned_segments:candidate.alignment.aligned_segments,missing_count:candidate.missing_count,conflict_count:candidate.conflict_count,unchanged_count:candidate.unchanged_count}});
      state.base=committed;state.rows=clone(committed.rows);state.mappingRepair=null;state.mappingRepairError=null;state.dirty=false;
      var context=currentCaptionContext();state.playbackFocus=window.MaterialRevisionCore.buildPlaybackFocus({rows:state.rows,caption_segment_id:context&&context.caption_segment_id});state.selectedRowId=state.playbackFocus.selected_row_id||(state.rows[0]&&state.rows[0].stable_row_id)||null;
      renderRows(state.rows,false);renderHeader();renderReviewControls();await renderHistory();setStatus(tr('studio.material.mappingRepairSaved','Связи восстановлены локально · 0 вызовов модели'),'success');requestAnimationFrame(function(){anchorSelected('auto');});return committed;
    }catch(e){setStatus(e.code==='TABLE_BASE_STALE'?tr('studio.material.stale','Другая вкладка уже создала новую версию. Перезагрузите Workspace.'):e.message,'error');throw e;}
  }

  function close() { state = null; repository = null; var panel=$('l3MaterialLayer'); if(panel) panel.hidden=true; showLayer('caption'); }

  function showLayer(layer) {
    layer=layer==='table'?'table':'caption';var body=document.querySelector('#l3MediaEditorPanel .l3-editor-body');if(body)body.dataset.layer=layer;
    var caption=$('l3CaptionTab'),table=$('l3TableTab');if(caption)caption.setAttribute('aria-selected',layer==='caption'?'true':'false');if(table)table.setAttribute('aria-selected',layer==='table'?'true':'false');
    var title=$('l3EditorTitle');if(title)title.textContent=layer==='table'?tr('studio.material.workspaceTitle','Редактирование материала'):tr('studio.mediaPackage.title','Исправление транскрипта');if(layer==='table')requestAnimationFrame(function(){anchorSelected('auto');});
  }

  async function saveLocal() {
    if (!state || (!state.dirty && !state.pendingCaptionRevision)) return state && state.base;
    try {
      var pendingImpact=state.impact, pendingCaption=state.pendingCaptionRevision;
      var committed = await repo().commitRevision({ material_id:state.material.material_id, base_table_revision_id:state.base.table_revision_id, rows:state.rows, provider_context:state.base.provider_context, bound_caption_revision_id:pendingCaption&&pendingCaption.revision_id, bound_caption_revision_sha256:pendingCaption&&pendingCaption.canonical_sha256, impact:{kind:pendingCaption?'caption_zero_call':'manual',zero_provider_calls:true,details:pendingImpact} });
      state.base=committed; state.rows=clone(committed.rows); state.dirty=false; state.pendingCaptionRevision=null;
      state.impact=(pendingImpact&&pendingImpact.impacted&&pendingImpact.impacted.length)?pendingImpact:{conflicts:[],impacted:[],reason:'CURRENT'};
      renderRows(state.rows,false); renderHeader(); renderReviewControls(); await renderHistory(); setStatus(tr('studio.material.savedLocal','Сохранено локально · 0 вызовов модели'),'success'); return committed;
    } catch (e) { setStatus(e.code === 'TABLE_BASE_STALE' ? tr('studio.material.stale','Другая вкладка уже создала новую версию. Перезагрузите Workspace.') : e.message,'error'); throw e; }
  }

  function captionChange(operations) {
    var textIds=[], mappingIds=[], hasLanguage=false;
    (operations || []).forEach(function(op){
      if (op.type === 'edit_text') { textIds.push(op.caption_segment_id); hasLanguage=true; }
      else if (op.type === 'split' || op.type === 'merge') { (op.caption_segment_ids || [op.caption_segment_id]).filter(Boolean).forEach(function(id){mappingIds.push(id);}); }
    });
    if (mappingIds.length) return {kind:'mapping',caption_segment_ids:[...new Set(mappingIds)],mapping:'split_merge'};
    if (hasLanguage) return {kind:'caption_text',caption_segment_ids:[...new Set(textIds)]};
    return {kind:'caption_timing',caption_segment_ids:[]};
  }

  async function captionRevisionCommitted(revision, operations) {
    if (!state) return;
    var change=captionChange(operations), impact=window.MaterialRevisionCore.analyzeImpact({rows:state.rows,change:change});
    if(change.kind==='caption_text'){
      var byCaption=new Map((revision.segments||[]).map(function(segment){return[String(segment.caption_segment_id),segment];}));
      impact.impacted.forEach(function(item){var row=state.rows.find(function(value){return value.stable_row_id===item.stable_row_id;}),segment=row&&byCaption.get(String(row.caption_segment_id||''));if(!row||!segment)return;row.field_meta={...(row.field_meta||{})};item.fields.forEach(function(field){var prior=row.field_meta[field]||{authority:'imported',locked:false};if(field==='he_plain'){row.he_plain=String(segment.text||'');row.field_meta[field]={authority:'source',locked:false,status:'current'};}else row.field_meta[field]={...prior,status:'invalidated'};});});
      state.dirty=impact.impacted.length>0;
    }
    state.impact=impact; state.pendingCaptionRevision=revision; renderRows(state.rows,false); renderHeader();renderReviewControls();
    setStatus(impact.impacted.length ? tr('studio.material.captionSaved','Транскрипт сохранён отдельно. Выберите действие для таблицы.') : tr('studio.material.timingOnly','Изменения времени/говорящего не требуют обновления языковых полей.'));
  }

  async function providerRequest(impact) {
    var provider = typeof getSelectedProvider === 'function' ? getSelectedProvider() : '';
    if (!['gcp','madlad','google-free','gemini'].includes(provider)) throw new Error('TARGETED_PROVIDER_UNSUPPORTED:' + provider);
    var items=impact.impacted.map(function(item){return {item:item,row:state.rows.find(function(row){return row.stable_row_id===item.stable_row_id;})};});
    var text=items.map(function(x){return x.row.he_plain;}).join('\n');
    var profileEl=$('translitProfileSelect'), profile=profileEl ? profileEl.value || 'sbl' : 'sbl';
    var premium=provider!=='gemini', endpoint=premium?'/api/translate-table-v2':'/api/translate-table';
    var payload=premium?{text:text,provider:provider,target_lang:'ru',translit_profile:profile}:{text:text,geminiApiKey:typeof geminiKeyGet==='function'?geminiKeyGet():'',direction:typeof getTableDirection==='function'?getTableDirection():'he-ru',segments:items.map(function(x,index){return{start:index*2,end:index*2+1,text:x.row.he_plain};})};
    if(provider==='gcp' && typeof gcpTranslateKeyGet==='function') payload.gcpTranslateApiKey=gcpTranslateKeyGet();
    var response;
    if(provider==='madlad'){
      if(!window.LocalMtClient||!window.LocalMtTable)throw new Error('LOCAL_MT_BROWSER_MODULE_UNAVAILABLE');
      var readiness=await window.refreshLocalMtReadiness();
      if(!readiness||readiness.state!=='ready')throw new Error('LOCAL_MT_NOT_READY:'+((readiness&&readiness.state)||'error'));
      var segments=items.map(function(x,index){return{index:index,source_line_index:index,text:x.row.he_plain};});
      var translated=await window.LocalMtTable.translateSegments({client:new window.LocalMtClient.Client(),segments:segments,sourceLang:'he',targetLang:'ru'});
      response={rows:translated.rows,provenance:{provider:'madlad',actual_provider:'madlad',translator_version:translated.result&&translated.result.model&&translated.result.model.identity,model_revision:translated.result&&translated.result.model&&translated.result.model.revision,local_execution:true}};
    }else{
      response=await apiCall(endpoint,payload);
    }
    var resultRows=Array.isArray(response.rows)?response.rows:[];
    if(resultRows.length!==items.length) throw new Error('REGEN_CARDINALITY_MISMATCH');
    var byIndex=new Map(); resultRows.forEach(function(row,index){var explicit=premium?row.source_line_index:row.segment_index,n=Number.isInteger(explicit)?explicit:index;if(byIndex.has(n)||n<0||n>=items.length)throw new Error('REGEN_SOURCE_INDEX_MISMATCH');byIndex.set(n,row);});
    if(byIndex.size!==items.length) throw new Error('REGEN_SOURCE_INDEX_MISMATCH');
    var candidates=[];for(var index=0;index<items.length;index++){var x=items[index],row=byIndex.get(index),fields={};x.item.fields.forEach(function(field){if(field==='he_plain')fields[field]=x.row.he_plain;else if(field in row)fields[field]=row[field];else if(field==='he_niqqud'&&'he_nikud' in row)fields[field]=row.he_nikud;else throw new Error('REGEN_FIELD_MISSING:'+field);});candidates.push({request_id:'regen:'+x.row.stable_row_id,fields:fields,provenance:{provider:provider,model:String((response.provenance&&response.provenance.translator_version)||response.model||provider),model_revision:String(response.provenance&&response.provenance.model_revision||''),local_execution:response.provenance&&response.provenance.local_execution===true,quality_positioning:provider==='madlad'?'LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION':'',profile:profile,input_sha256:await window.MaterialRevisionCore.sha256Hex(x.row.he_plain)}});}return candidates;
  }

  async function regenerate(whole) {
    if (!state) return;
    var impact=whole ? window.MaterialRevisionCore.analyzeImpact({rows:state.rows,change:{kind:'provider',fields:window.MaterialRevisionCore.FIELD_NAMES}}) : state.impact;
    if (impact.conflicts && impact.conflicts.length) { setStatus(tr('studio.material.resolveMapping','Сначала разрешите mapping-конфликты вручную.'),'error'); return; }
    var provider=typeof getSelectedProvider==='function'?getSelectedProvider():'', model=provider;
    // MADLAD is an MT provider, not a niqqud/transliteration authority. Preserve
    // those invalidated fields honestly and regenerate only the unlocked RU field.
    if(provider==='madlad')impact={...impact,impacted:impact.impacted.map(function(item){return{...item,fields:item.fields.filter(function(field){return field==='ru';})};}).filter(function(item){return item.fields.length;})};
    var preview=window.MaterialRevisionCore.buildRegenerationPreflight({rows:state.rows,impact:impact,provider:provider,model:model});
    var chars=impact.impacted.reduce(function(n,item){var row=state.rows.find(function(r){return r.stable_row_id===item.stable_row_id;});return n+(row?row.he_plain.length:0);},0);
    if (!window.confirm(tr('studio.material.costPreview','Подтвердите вызов провайдера')+'\n'+preview.row_count+' rows · '+preview.field_count+' fields · '+chars+' chars\n'+provider+' · fallback: OFF')) return;
    try {
      setStatus(tr('studio.material.regenerating','Обновление выбранных строк…'));
      var candidates=await providerRequest(impact);
      var actualProvenance=candidates[0]&&candidates[0].provenance||{};
      state.rows=window.MaterialRevisionCore.applyProviderCandidates({rows:state.rows,impact:impact,candidates:candidates}); state.dirty=true;
      var committed=await repo().commitRevision({material_id:state.material.material_id,base_table_revision_id:state.base.table_revision_id,rows:state.rows,provider_context:{provider:provider,model:String(actualProvenance.model||model),model_revision:String(actualProvenance.model_revision||''),local_execution:actualProvenance.local_execution===true,quality_positioning:String(actualProvenance.quality_positioning||'')},bound_caption_revision_id:state.pendingCaptionRevision&&state.pendingCaptionRevision.revision_id,bound_caption_revision_sha256:state.pendingCaptionRevision&&state.pendingCaptionRevision.canonical_sha256,impact:{kind:whole?'full_rebuild':'targeted',preflight:preview}});
      state.base=committed;state.rows=clone(committed.rows);state.dirty=false;state.impact={conflicts:[],impacted:[],reason:'CURRENT'};
      renderRows(state.rows,false);renderHeader();renderReviewControls();await renderHistory();setStatus(tr('studio.material.regenerated','Новая версия сохранена; предыдущая доступна в истории.'),'success');
    } catch(e){setStatus(e.message,'error');throw e;}
  }

  async function showHistory() {
    if(!state)return;var id=$('l3MaterialHistory').value, revision=await repo().getRevision(id);
    var current=id===state.base.table_revision_id;renderRows(revision.rows,!current);$('l3MaterialCompare').textContent=current?'':tr('studio.material.comparePrevious','Просмотр immutable v')+revision.revision_no+' · '+revision.content_sha256.slice(0,12);
  }

  async function commitInlineCell(textId,sentenceId,field,value) {
    var material=await repo().getMaterialByText(String(textId)); if(!material)return null;
    var base=await repo().getCurrentRevision(material.material_id), rows=clone(base.rows), row=rows.find(function(x){return x.stable_row_id===String(sentenceId);}); if(!row)throw new Error('PROMOTED_ROW_NOT_FOUND');
    row[field]=String(value??'');row.field_meta={...(row.field_meta||{})};row.field_meta[field]={authority:'user',locked:true,status:'current'};
    var committed=await repo().commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:rows,impact:{kind:'inline_manual',stable_row_id:String(sentenceId),field:field,zero_provider_calls:true}});
    return {sentence:committed.rows.find(function(x){return x.stable_row_id===String(sentenceId);})};
  }

  var API={openForTrack:openForTrack,close:close,showLayer:showLayer,saveLocal:saveLocal,addRow:addRow,addRowForCurrentCaption:addRowForCurrentCaption,repairMapping:repairMapping,regenerateAffected:function(){return regenerate(false);},rebuildAll:function(){return regenerate(true);},showHistory:showHistory,captionRevisionCommitted:captionRevisionCommitted,commitInlineCell:commitInlineCell,syncToCaptionSegment:syncToCaptionSegment,resumeFollow:resumeFollow,setFollowEnabled:setFollowEnabled,setReviewMode:setReviewMode,setCustomField:setCustomField,setPresentation:setPresentation,selectLearningRow:selectLearningRow};
  if(typeof window!=='undefined')window.MaterialRevisionWorkspace=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})();
