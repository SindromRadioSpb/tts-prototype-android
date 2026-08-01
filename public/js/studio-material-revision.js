// Studio Ingest L3a.3 — the learning-table layer of the two-layer Material Workspace.
// Opening and saving are strictly local. Provider calls happen only from the two explicit
// regeneration actions and are validated for exact subset cardinality; there is no fallback.
(function () {
  'use strict';
  var repository = null, state = null;
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

  function renderRows(rows, readOnly) {
    var host = $('l3MaterialRows'); if (!host) return;
    if (!rows.length) { host.innerHTML = '<p class="l3-material-empty">' + escapeHtml(tr('studio.material.empty','Таблица ещё не сохранена.')) + '</p>'; return; }
    host.innerHTML = rows.map(function (row, index) {
      var fields = window.MaterialRevisionCore.FIELD_NAMES.map(function (field) {
        var meta = row.field_meta && row.field_meta[field];
        return '<label class="l3-material-field" data-authority="' + escapeHtml(meta && meta.authority || 'imported') + '">' +
          '<span><b>' + fieldLabel(field) + '</b><small>' + escapeHtml(authorityLabel(meta)) + '</small></span>' +
          '<textarea data-row="' + index + '" data-field="' + field + '" dir="' + (field.indexOf('he_') === 0 ? 'rtl' : 'auto') + '" ' + (readOnly ? 'readonly' : '') + '>' + escapeHtml(row[field]) + '</textarea></label>';
      }).join('');
      var controls = readOnly ? '' : '<span class="l3-material-row-actions"><button type="button" data-row-action="up" data-index="'+index+'" aria-label="Move up">↑</button><button type="button" data-row-action="down" data-index="'+index+'" aria-label="Move down">↓</button><button type="button" data-row-action="delete" data-index="'+index+'" aria-label="Delete">×</button></span>';
      return '<article class="l3-material-row" data-row-id="' + escapeHtml(row.stable_row_id) + '"><header><strong>#' + (index+1) + '</strong><span class="l3-mapping-pill">' + mappingLabel(row) + '</span><code>' + escapeHtml(row.stable_row_id) + '</code>'+controls+'</header><div class="l3-material-fields">' + fields + '</div></article>';
    }).join('');
    if (!readOnly) host.querySelectorAll('textarea[data-field]').forEach(function (input) {
      input.addEventListener('input', function () {
        var row = state.rows[Number(input.dataset.row)], field = input.dataset.field;
        if (!row || row[field] === input.value) return;
        row[field] = input.value; row.field_meta = { ...(row.field_meta || {}) };
        row.field_meta[field] = { authority:'user', locked:true, status:'current' };
        state.dirty = true; renderHeader();
        var small = input.parentElement.querySelector('small'); if (small) small.textContent = authorityLabel(row.field_meta[field]);
        input.parentElement.dataset.authority = 'user';
      });
    });
    if (!readOnly) host.querySelectorAll('[data-row-action]').forEach(function(button){button.addEventListener('click',function(){mutateRow(Number(button.dataset.index),button.dataset.rowAction);});});
  }

  function mutateRow(index, action) {
    if(!state||index<0||index>=state.rows.length)return;
    if(action==='delete')state.rows.splice(index,1);
    else {var target=action==='up'?index-1:index+1;if(target<0||target>=state.rows.length)return;var row=state.rows[index];state.rows[index]=state.rows[target];state.rows[target]=row;}
    state.dirty=true;renderRows(state.rows,false);renderHeader();
  }

  function addRow() {
    if(!state)return;var id=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():'row-'+Date.now();
    state.rows.push({stable_row_id:id,he_plain:'',he_niqqud:'',translit:'',translit_ru:'',ru:'',caption_segment_id:null,source_segment_ids:[],field_meta:{}});
    state.dirty=true;renderRows(state.rows,false);renderHeader();
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
  }

  async function renderHistory() {
    var select = $('l3MaterialHistory'); if (!select || !state) return;
    var history = await repo().listHistory(state.material.material_id);
    select.innerHTML = history.map(function (revision) { return '<option value="' + revision.table_revision_id + '">v' + revision.revision_no + ' · ' + escapeHtml(revision.committed_at) + '</option>'; }).join('');
    select.value = state.base.table_revision_id;
  }

  async function openForTrack(trackId) {
    var panel = $('l3MaterialLayer'); if (!panel) return;
    panel.hidden = false; setStatus(tr('studio.material.loading','Загрузка локальной таблицы…'));
    var bindings = await window.__localDB.dbQuery('SELECT text_id FROM studio_text_media_bindings WHERE track_id=? ORDER BY updated_at DESC LIMIT 1',[trackId]);
    if (!bindings.length) {
      state = null; renderRows([], true); setStatus(tr('studio.material.saveTableFirst','Сначала соберите и сохраните таблицу: после этого она появится здесь.'));
      return;
    }
    var material = await repo().promoteLegacyText(String(bindings[0].text_id));
    var base = await repo().getCurrentRevision(material.material_id);
    state = { trackId:String(trackId), material:material, base:base, rows:clone(base.rows), dirty:false, impact:{conflicts:[],impacted:[],reason:'CURRENT'} };
    renderRows(state.rows, false); renderHeader(); await renderHistory(); setStatus(null);
  }

  function close() { state = null; repository = null; var panel=$('l3MaterialLayer'); if(panel) panel.hidden=true; showLayer('caption'); }

  function showLayer(layer) {
    layer=layer==='table'?'table':'caption';var body=document.querySelector('#l3MediaEditorPanel .l3-editor-body');if(body)body.dataset.layer=layer;
    var caption=$('l3CaptionTab'),table=$('l3TableTab');if(caption)caption.setAttribute('aria-selected',layer==='caption'?'true':'false');if(table)table.setAttribute('aria-selected',layer==='table'?'true':'false');
    var title=$('l3EditorTitle');if(title)title.textContent=layer==='table'?tr('studio.material.workspaceTitle','Редактирование материала'):tr('studio.mediaPackage.title','Исправление транскрипта');
  }

  async function saveLocal() {
    if (!state || (!state.dirty && !state.pendingCaptionRevision)) return state && state.base;
    try {
      var pendingImpact=state.impact, pendingCaption=state.pendingCaptionRevision;
      var committed = await repo().commitRevision({ material_id:state.material.material_id, base_table_revision_id:state.base.table_revision_id, rows:state.rows, provider_context:state.base.provider_context, bound_caption_revision_id:pendingCaption&&pendingCaption.revision_id, bound_caption_revision_sha256:pendingCaption&&pendingCaption.canonical_sha256, impact:{kind:pendingCaption?'caption_zero_call':'manual',zero_provider_calls:true,details:pendingImpact} });
      state.base=committed; state.rows=clone(committed.rows); state.dirty=false; state.pendingCaptionRevision=null;
      state.impact=(pendingImpact&&pendingImpact.impacted&&pendingImpact.impacted.length)?pendingImpact:{conflicts:[],impacted:[],reason:'CURRENT'};
      renderRows(state.rows,false); renderHeader(); await renderHistory(); setStatus(tr('studio.material.savedLocal','Сохранено локально · 0 вызовов модели'),'success'); return committed;
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
    state.impact=impact; state.pendingCaptionRevision=revision; renderRows(state.rows,false); renderHeader();
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
    var response=await apiCall(endpoint,payload), resultRows=Array.isArray(response.rows)?response.rows:[];
    if(resultRows.length!==items.length) throw new Error('REGEN_CARDINALITY_MISMATCH');
    var byIndex=new Map(); resultRows.forEach(function(row,index){var explicit=premium?row.source_line_index:row.segment_index,n=Number.isInteger(explicit)?explicit:index;if(byIndex.has(n)||n<0||n>=items.length)throw new Error('REGEN_SOURCE_INDEX_MISMATCH');byIndex.set(n,row);});
    if(byIndex.size!==items.length) throw new Error('REGEN_SOURCE_INDEX_MISMATCH');
    var candidates=[];for(var index=0;index<items.length;index++){var x=items[index],row=byIndex.get(index),fields={};x.item.fields.forEach(function(field){if(field==='he_plain')fields[field]=x.row.he_plain;else if(field in row)fields[field]=row[field];else if(field==='he_niqqud'&&'he_nikud' in row)fields[field]=row.he_nikud;else throw new Error('REGEN_FIELD_MISSING:'+field);});candidates.push({request_id:'regen:'+x.row.stable_row_id,fields:fields,provenance:{provider:provider,model:String((response.provenance&&response.provenance.translator_version)||response.model||provider),profile:profile,input_sha256:await window.MaterialRevisionCore.sha256Hex(x.row.he_plain)}});}return candidates;
  }

  async function regenerate(whole) {
    if (!state) return;
    var impact=whole ? window.MaterialRevisionCore.analyzeImpact({rows:state.rows,change:{kind:'provider',fields:window.MaterialRevisionCore.FIELD_NAMES}}) : state.impact;
    if (impact.conflicts && impact.conflicts.length) { setStatus(tr('studio.material.resolveMapping','Сначала разрешите mapping-конфликты вручную.'),'error'); return; }
    var provider=typeof getSelectedProvider==='function'?getSelectedProvider():'', model=provider;
    var preview=window.MaterialRevisionCore.buildRegenerationPreflight({rows:state.rows,impact:impact,provider:provider,model:model});
    var chars=impact.impacted.reduce(function(n,item){var row=state.rows.find(function(r){return r.stable_row_id===item.stable_row_id;});return n+(row?row.he_plain.length:0);},0);
    if (!window.confirm(tr('studio.material.costPreview','Подтвердите вызов провайдера')+'\n'+preview.row_count+' rows · '+preview.field_count+' fields · '+chars+' chars\n'+provider+' · fallback: OFF')) return;
    try {
      setStatus(tr('studio.material.regenerating','Обновление выбранных строк…'));
      var candidates=await providerRequest(impact);
      state.rows=window.MaterialRevisionCore.applyProviderCandidates({rows:state.rows,impact:impact,candidates:candidates}); state.dirty=true;
      var committed=await repo().commitRevision({material_id:state.material.material_id,base_table_revision_id:state.base.table_revision_id,rows:state.rows,provider_context:{provider:provider,model:model},bound_caption_revision_id:state.pendingCaptionRevision&&state.pendingCaptionRevision.revision_id,bound_caption_revision_sha256:state.pendingCaptionRevision&&state.pendingCaptionRevision.canonical_sha256,impact:{kind:whole?'full_rebuild':'targeted',preflight:preview}});
      state.base=committed;state.rows=clone(committed.rows);state.dirty=false;state.impact={conflicts:[],impacted:[],reason:'CURRENT'};
      renderRows(state.rows,false);renderHeader();await renderHistory();setStatus(tr('studio.material.regenerated','Новая версия сохранена; предыдущая доступна в истории.'),'success');
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

  var API={openForTrack:openForTrack,close:close,showLayer:showLayer,saveLocal:saveLocal,addRow:addRow,regenerateAffected:function(){return regenerate(false);},rebuildAll:function(){return regenerate(true);},showHistory:showHistory,captionRevisionCommitted:captionRevisionCommitted,commitInlineCell:commitInlineCell};
  if(typeof window!=='undefined')window.MaterialRevisionWorkspace=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})();
