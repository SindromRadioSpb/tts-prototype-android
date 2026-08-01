// Studio Ingest L3a — focused-segment Correctable Media Package editor.
// Local-only: no fetch, provider/model call or cloud sync.
(function () {
  'use strict';

  var state = null, objectUrl = null, draftTimer = null, mediaSyncPromise = null;
  function $(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
  function tr(key, fallback) {
    try { var value = typeof t === 'function' ? t(key) : key; return value && value !== key ? value : fallback; }
    catch (_) { return fallback; }
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function focusModel(total, index) {
    total = Math.max(0, Number(total) || 0); index = total ? Math.max(0, Math.min(total - 1, Number(index) || 0)) : 0;
    return { index: index, number: total ? index + 1 : 0, total: total, has_prev: index > 0, has_next: index + 1 < total };
  }
  function canSplitAt(segment, cursorMs) {
    return !!segment && Number.isFinite(Number(cursorMs)) && segment.end_ms != null && Number(cursorMs) > segment.start_ms && Number(cursorMs) < segment.end_ms;
  }
  function cueIndexForTime(segments, cursorMs) {
    if (!Array.isArray(segments) || !segments.length || !Number.isFinite(Number(cursorMs))) return -1;
    var target = Number(cursorMs), lo = 0, hi = segments.length - 1, found = 0;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2), start = Number(segments[mid] && segments[mid].start_ms);
      if (Number.isFinite(start) && start <= target) { found = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return Math.max(0, Math.min(segments.length - 1, found));
  }
  function cueJumpIndex(total, value) {
    var n = Number(value); if (!Number.isFinite(n)) return null;
    return focusModel(total, Math.round(n) - 1).index;
  }
  function formatMs(value) {
    var n = Math.max(0, Math.round(Number(value) || 0));
    var h = Math.floor(n / 3600000); n -= h * 3600000;
    var m = Math.floor(n / 60000); n -= m * 60000;
    var s = Math.floor(n / 1000), ms = n - s * 1000;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
  }
  function parseMs(value) {
    var m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(String(value || '').trim());
    if (!m) return null;
    return (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(String(m[4]).padEnd(3, '0'));
  }
  function repo() { return window.StudioMediaPackage.browserRepository(); }
  function player() { return $('l3MediaPlayer'); }
  function current() { return state && state.segments[state.index]; }
  function getCaptionContext() {
    var segment=current();if(!state||!segment)return null;
    return {caption_segment_id:String(segment.caption_segment_id||''),text:String(segment.text||''),source_segment_ids:(segment.source_segment_ids||[]).map(String),index:state.index,number:state.index+1,total:state.segments.length,order_ids:state.segments.map(function(value){return String(value.caption_segment_id||'');})};
  }
  function publishCaptionSelection() {
    var context=getCaptionContext();if(!context||state.lastPublishedCaptionId===context.caption_segment_id)return;state.lastPublishedCaptionId=context.caption_segment_id;
    if(window.MaterialRevisionWorkspace&&window.MaterialRevisionWorkspace.syncToCaptionSegment)window.MaterialRevisionWorkspace.syncToCaptionSegment(context.caption_segment_id,{number:context.number,total:context.total});
  }
  function setStatus(key, fallback, kind) {
    var el = $('l3EditorStatus'); if (!el) return;
    el.textContent = key ? tr(key, fallback || key) : '';
    el.dataset.kind = kind || 'info'; el.hidden = !key;
  }
  function markDirty() {
    state.dirty = true; $('l3SaveState').textContent = tr('studio.mediaPackage.unsaved', 'Не сохранено');
  }
  function pushHistory() {
    state.undo.push(clone(state.segments)); if (state.undo.length > 50) state.undo.shift(); state.redo = [];
  }
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async function () {
      if (!state || !state.dirty) return;
      try {
        await repo().saveDraft(state.trackId, state.baseRevisionId, state.segments, state.operations);
        setStatus('studio.mediaPackage.draftRecovered', 'Черновик сохранён локально');
        if (window.StudioMediaPackage && window.StudioMediaPackage.refreshWorkspaceUi) window.StudioMediaPackage.refreshWorkspaceUi();
      } catch (e) { setStatus('studio.mediaPackage.draftFailed', 'Черновик не сохранён', 'error'); }
    }, 350);
  }
  function timeline() {
    var s = current(), p = player(), bar = $('l3CueProgress'); if (!s || !bar) return;
    var cursor = p && Number.isFinite(p.currentTime) ? p.currentTime * 1000 : s.start_ms;
    var span = Math.max(1, (s.end_ms || s.start_ms + 1) - s.start_ms);
    var pct = Math.max(0, Math.min(100, (cursor - s.start_ms) / span * 100));
    bar.style.width = pct + '%';
    var split = $('l3SplitBtn'); if (split) split.disabled = !canSplitAt(s, cursor);
  }
  async function syncCueFromPlayer() {
    if (!state || mediaSyncPromise) return mediaSyncPromise;
    var p = player(), idx = p ? cueIndexForTime(state.segments, p.currentTime * 1000) : -1;
    if (idx < 0 || idx === state.index) return null;
    mediaSyncPromise = (async function () {
      if (!await stageFields({ focusText: false })) return;
      if (!state) return;
      state.index = idx; state.replayStopMs = null; render({ focusText: false });
    })().finally(function () { mediaSyncPromise = null; });
    return mediaSyncPromise;
  }
  function onPlayerTimeUpdate() {
    if (!state) return;
    var p = player(), stoppedReplay = false;
    if (p && state.replayStopMs != null && p.currentTime * 1000 >= state.replayStopMs) {
      state.replayStopMs = null; stoppedReplay = true; try { p.pause(); } catch (_) {}
    }
    timeline(); if (!stoppedReplay) syncCueFromPlayer();
  }
  function render(options) {
    options = options || {};
    if (!state) return; var s = current(), fm = focusModel(state.segments.length, state.index); state.index = fm.index;
    $('l3CueCounter').textContent = fm.number + ' / ' + fm.total;
    var jump = $('l3CueJump'); if (jump) { jump.value = String(fm.number); jump.max = String(fm.total); }
    var total = $('l3CueTotal'); if (total) total.textContent = String(fm.total);
    $('l3PrevBtn').disabled = !fm.has_prev; $('l3NextBtn').disabled = !fm.has_next;
    $('l3MergeBtn').disabled = !fm.has_next; $('l3UndoBtn').disabled = !state.undo.length; $('l3RedoBtn').disabled = !state.redo.length;
    $('l3CueText').value = s ? s.text : ''; $('l3CueStart').value = s ? formatMs(s.start_ms) : '';
    $('l3CueEnd').value = s && s.end_ms != null ? formatMs(s.end_ms) : '';
    $('l3CueSpeaker').value = s && s.speaker || '';
    var rawIds = s && s.source_segment_ids || [];
    var rawTexts = state.rawSegments.filter(function (raw) { return rawIds.indexOf(raw.source_segment_id) >= 0; }).map(function (raw) { return raw.text; });
    $('l3RawText').textContent = rawTexts.join(' / ') || tr('studio.mediaPackage.rawUnavailable', 'Исходный сегмент недоступен');
    var flags = s && s.quality_flags || [];
    $('l3CueFlags').textContent = flags.length ? flags.join(' · ') : tr('studio.mediaPackage.noWarnings', 'Без предупреждений');
    $('l3CueFlags').dataset.warn = flags.length ? 'true' : 'false';
    $('l3SaveState').textContent = state.dirty ? tr('studio.mediaPackage.unsaved', 'Не сохранено') : tr('studio.mediaPackage.saved', 'Версия сохранена');
    timeline();publishCaptionSelection(); if (options.focusText !== false) $('l3CueText').focus();
  }
  async function stageFields(options) {
    options = options || {};
    var s = current(); if (!s) return true;
    var text = $('l3CueText').value.trim(), start = parseMs($('l3CueStart').value), endRaw = $('l3CueEnd').value.trim(), end = endRaw ? parseMs(endRaw) : null;
    if (!text || start == null || (endRaw && end == null)) { setStatus('studio.mediaPackage.invalidCue', 'Проверьте текст и время сегмента', 'error'); return false; }
    var speaker = $('l3CueSpeaker').value.trim() || null, changed = false; pushHistory();
    try {
      if (text !== s.text) { var a = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'edit_text', caption_segment_id: s.caption_segment_id, text: text }); state.segments = a.segments; state.operations.push(a.operation); changed = true; s = current(); }
      if (start !== s.start_ms || end !== s.end_ms) { var b = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'edit_timing', caption_segment_id: s.caption_segment_id, start_ms: start, end_ms: end }); state.segments = b.segments; state.operations.push(b.operation); changed = true; s = current(); }
      if (speaker !== s.speaker) { var c = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'edit_speaker', caption_segment_id: s.caption_segment_id, speaker: speaker }); state.segments = c.segments; state.operations.push(c.operation); changed = true; }
    } catch (e) { state.segments = state.undo.pop(); setStatus('studio.mediaPackage.invalidCue', e.code || 'Проверьте сегмент', 'error'); return false; }
    if (!changed) state.undo.pop(); else { markDirty(); scheduleDraft(); }
    render({ focusText: options.focusText !== false }); return true;
  }
  function seekPlayerToCurrent() {
    var s = current(), p = player(); if (!s || !p || !objectUrl) return;
    state.replayStopMs = null; try { p.pause(); p.currentTime = s.start_ms / 1000; } catch (_) {}
  }
  async function selectCue(index) {
    if (!state || !await stageFields({ focusText: false })) return;
    state.index = focusModel(state.segments.length, index).index; seekPlayerToCurrent(); render();
  }
  async function selectCaptionSegment(captionSegmentId) {
    if(!state)return false;var id=String(captionSegmentId||''),index=state.segments.findIndex(function(segment){return String(segment.caption_segment_id||'')===id;});if(index<0)return false;
    if(!await stageFields({focusText:false}))return false;state.index=index;state.replayStopMs=null;seekPlayerToCurrent();render({focusText:false});return true;
  }
  async function move(delta) { if (!state) return; return selectCue(state.index + delta); }
  async function jumpFromInput() {
    if (!state) return;
    var index = cueJumpIndex(state.segments.length, $('l3CueJump') && $('l3CueJump').value);
    if (index == null) { render({ focusText: false }); return; }
    return selectCue(index);
  }
  async function replay() {
    var s = current(), p = player(); if (!s || !p || !objectUrl) { setStatus('studio.mediaPackage.mediaMissing', 'Файл не найден. Выберите Relink media.', 'error'); return; }
    state.replayStopMs = s.end_ms == null ? null : s.end_ms;
    p.currentTime = s.start_ms / 1000; await p.play();
  }
  async function split() {
    var area = $('l3CueText'), cut = area.selectionStart, p = player();
    var at = p && Number.isFinite(p.currentTime) ? Math.round(p.currentTime * 1000) : null;
    if (!await stageFields()) return; var s = current();
    if (!canSplitAt(s, at) || cut <= 0 || cut >= s.text.length) { setStatus('studio.mediaPackage.splitNeedsCursor', 'Поставьте playback-курсор внутри реплики и текстовый курсор между словами', 'error'); return; }
    pushHistory();
    try { var result = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'split', caption_segment_id: s.caption_segment_id, at_ms: at, text_left: s.text.slice(0, cut), text_right: s.text.slice(cut) }); state.segments = result.segments; state.operations.push(result.operation); markDirty(); scheduleDraft(); render(); }
    catch (e) { state.segments = state.undo.pop(); setStatus('studio.mediaPackage.invalidCue', e.code, 'error'); }
  }
  async function mergeNext() {
    if (!await stageFields() || state.index + 1 >= state.segments.length) return; pushHistory();
    try { var ids = [state.segments[state.index].caption_segment_id, state.segments[state.index + 1].caption_segment_id]; var result = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'merge', caption_segment_ids: ids }); state.segments = result.segments; state.operations.push(result.operation); markDirty(); scheduleDraft(); render(); }
    catch (e) { state.segments = state.undo.pop(); setStatus('studio.mediaPackage.invalidCue', e.code, 'error'); }
  }
  async function applyOffset() {
    if (!await stageFields()) return; var delta = Number($('l3OffsetMs').value);
    if (!Number.isFinite(delta) || !delta) { setStatus('studio.mediaPackage.offsetRequired', 'Введите смещение в миллисекундах', 'error'); return; }
    pushHistory();
    try { var result = window.MediaPackageCore.applyOperation('user_corrected', state.segments, { type: 'offset', delta_ms: Math.round(delta), confirm_clamp: true }); state.segments = result.segments; state.operations.push(result.operation); markDirty(); scheduleDraft(); render(); }
    catch (e) { state.segments = state.undo.pop(); setStatus('studio.mediaPackage.invalidCue', e.code, 'error'); }
  }
  function undo() { if (!state.undo.length) return; state.redo.push(clone(state.segments)); state.segments = state.undo.pop(); markDirty(); scheduleDraft(); render(); }
  function redo() { if (!state.redo.length) return; state.undo.push(clone(state.segments)); state.segments = state.redo.pop(); markDirty(); scheduleDraft(); render(); }
  async function saveVersion() {
    if (!await stageFields()) return null;
    if (!state.dirty) return repo().getCurrentRevision(state.trackId);
    var committedOperations = clone(state.operations);
    clearTimeout(draftTimer); await repo().saveDraft(state.trackId, state.baseRevisionId, state.segments, state.operations);
    try {
      var revision = await repo().commitDraft(state.trackId, { author_kind: 'user', provenance: { surface: 'studio-media-editor', code_version: window.APP_VERSION || null } });
      state.baseRevisionId = revision.revision_id; state.baseHash = revision.canonical_sha256; state.operations = []; state.dirty = false; state.undo = []; state.redo = [];
      setStatus('studio.mediaPackage.versionSaved', 'Версия сохранена'); render();
      if (window.StudioMediaPackage && window.StudioMediaPackage.notifyRevision) await window.StudioMediaPackage.notifyRevision(state.trackId, revision);
      if (window.MaterialRevisionWorkspace && window.MaterialRevisionWorkspace.captionRevisionCommitted) await window.MaterialRevisionWorkspace.captionRevisionCommitted(revision, committedOperations);
      return revision;
    } catch (e) { setStatus(e.code === 'DRAFT_BASE_STALE' ? 'studio.mediaPackage.staleDraft' : 'studio.mediaPackage.saveFailed', e.code, 'error'); throw e; }
  }
  async function continueToTable() {
    var revision = await saveVersion(); if (!revision) return;
    var input = $('inputText'); if (input) { input.value = revision.segments.map(function (s) { return s.text; }).join('\n'); input.dispatchEvent(new Event('input', { bubbles: true })); }
    var ref = { package_id: state.packageId, track_id: state.trackId, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256, projection_sha256: revision.canonical_sha256, local_only: true };
    if (window.StudioMediaPackage && window.StudioMediaPackage.setActiveWorkspace) await window.StudioMediaPackage.setActiveWorkspace(ref);
    else window.v3LastMediaPackageRef = ref;
    [window.v3LastImportMeta, window.v3LastGeminiMeta && window.v3LastGeminiMeta.source].forEach(function (holder) {
      if (!holder || typeof holder !== 'object') return;
      holder.media_package_ref = clone(ref);
      var key = holder.audio ? 'audio' : (holder.captions ? 'captions' : null);
      if (key) {
        holder[key].projection_of_revision_id = revision.revision_id;
        holder[key].projection_sha256 = revision.canonical_sha256;
        holder[key].segments = revision.segments.map(function (s, index) { return { i:index, start:s.start_ms/1000, end:s.end_ms==null?null:s.end_ms/1000, text:s.text, caption_segment_id:s.caption_segment_id, source_segment_id:s.source_segment_ids&&s.source_segment_ids[0]||null, source_segment_ids:clone(s.source_segment_ids||[]), speaker:s.speaker||null, authority:clone(s.authority||{}), quality_flags:clone(s.quality_flags||[]) }; });
      }
    });
    close(true);
  }
  async function discardDraft() { await repo().discardDraft(state.trackId); var revision = await repo().getCurrentRevision(state.trackId); state.segments = clone(revision.segments); state.baseRevisionId = revision.revision_id; state.operations = []; state.dirty = false; state.undo = []; state.redo = []; render(); if (window.StudioMediaPackage && window.StudioMediaPackage.refreshWorkspaceUi) await window.StudioMediaPackage.refreshWorkspaceUi(); }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function exportSubtitle(format, raw) {
    var revision;
    if (raw) {
      var tracks = await repo().listTracks(state.packageId), track = tracks.find(function (v) { return v.role === 'raw_original'; });
      revision = await repo().getCurrentRevision(track.track_id);
    } else revision = await saveVersion();
    var text = window.MediaPackageCore.serializeSubtitles(format, revision.segments);
    downloadBlob(new Blob([text], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }), raw ? 'raw-original.vtt' : 'user-corrected.' + format);
  }
  async function exportSlim() { await saveVersion(); downloadBlob(await window.StudioMediaPackage.exportSlimZip(state.packageId, null), 'linguistpro-media-package-v1.zip'); }
  async function relinkSelected(event) {
    var file = event && event.target && event.target.files && event.target.files[0]; if (event && event.target) event.target.value = ''; if (!file) return;
    try { await window.StudioMediaPackage.relinkFile(state.packageId, file); var id = state.trackId; await window.StudioMediaPackage.activatePackage(state.packageId); close(true); await open(id); setStatus('studio.mediaPackage.relinkDone', 'Медиа связано по SHA-256'); }
    catch (e) { setStatus(e && e.message && e.message.indexOf('MEDIA_SHA_MISMATCH') >= 0 ? 'studio.mediaPackage.relinkMismatch' : 'studio.mediaPackage.relinkFailed', e.code || e.message, 'error'); }
  }
  async function deletePackage() {
    if (!window.confirm(tr('studio.mediaPackage.deleteConfirm', 'Удалить пакет, все дорожки и черновики?'))) return;
    try { var packageId = state.packageId; var receipt = await window.StudioMediaPackage.deletePackageAndGc(packageId, true); close(true); if (window.v3LastMediaPackageRef && window.v3LastMediaPackageRef.package_id === packageId && window.StudioMediaPackage.clearActiveWorkspace) window.StudioMediaPackage.clearActiveWorkspace(); else if (window.StudioMediaPackage.refreshWorkspaceUi) window.StudioMediaPackage.refreshWorkspaceUi(); if (typeof showToast === 'function') showToast(tr('studio.mediaPackage.deleted', 'Media Package удалён') + ' · ' + receipt.revisions_removed, 'success'); }
    catch (e) { setStatus('studio.mediaPackage.deleteFailed', e.code || e.message, 'error'); }
  }
  function close(force) {
    if (!state) return;
    if (!force && state.dirty && !window.confirm(tr('studio.mediaPackage.closeDirty', 'Закрыть? Черновик сохранён локально, но новая версия ещё не создана.'))) return;
    clearTimeout(draftTimer); var modal = $('l3MediaEditorModal'); if (modal) modal.classList.add('hidden');
    var p = player(); if (p) { p.pause(); p.ontimeupdate = null; p.onseeked = null; p.removeAttribute('src'); }
    if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; state = null; mediaSyncPromise = null;
    if (window.MaterialRevisionWorkspace && window.MaterialRevisionWorkspace.close) window.MaterialRevisionWorkspace.close();
  }
  async function open(trackId) {
    var repository = repo(), track = await repository.getTrack(trackId); if (!track || track.role !== 'user_corrected') throw new Error('CORRECTED_TRACK_REQUIRED');
    var revision = await repository.getCurrentRevision(trackId), pkg = await repository.getPackage(track.package_id);
    var rawTrackRows = await window.__localDB.dbQuery("SELECT track_id FROM studio_caption_tracks WHERE package_id=? AND role='raw_original' LIMIT 1", [track.package_id]);
    var rawRevision = rawTrackRows.length ? await repository.getCurrentRevision(rawTrackRows[0].track_id) : null;
    var draft = track.draft;
    state = { packageId: track.package_id, trackId: track.track_id, baseRevisionId: draft ? draft.base_revision_id : revision.revision_id, baseHash: revision.canonical_sha256, segments: clone(draft ? draft.segments : revision.segments), operations: clone(draft ? draft.operations || [] : []), rawSegments: clone(rawRevision ? rawRevision.segments : []), index: 0, dirty: !!draft, undo: [], redo: [], replayStopMs: null, lastPublishedCaptionId:null };
    mediaSyncPromise = null;
    var modal = $('l3MediaEditorModal'); modal.classList.remove('hidden'); modal.dir = typeof appGetLocale === 'function' && appGetLocale() === 'he' ? 'rtl' : 'ltr';
    var p = player(); objectUrl = null;
    var desiredTag = String(pkg && pkg.mime || '').startsWith('video/') ? 'video' : 'audio';
    if (p && p.tagName.toLowerCase() !== desiredTag) {
      var replacement = document.createElement(desiredTag); replacement.id = 'l3MediaPlayer'; replacement.controls = true; replacement.preload = 'metadata'; replacement.setAttribute('aria-label', 'Media source'); p.replaceWith(replacement); p = replacement;
    }
    if (pkg && pkg.opfs_path && window.MediaStore) { var blob = await window.MediaStore.readMedia(pkg.opfs_path); if (blob) { objectUrl = URL.createObjectURL(blob); p.src = objectUrl; p.hidden = false; } }
    if (!objectUrl) { p.hidden = true; setStatus('studio.mediaPackage.mediaMissing', 'Медиа отсутствует: relink по SHA-256'); }
    else { p.hidden = false; p.ontimeupdate = onPlayerTimeUpdate; p.onseeked = function () { timeline(); syncCueFromPlayer(); }; setStatus(null); }
    render(); seekPlayerToCurrent();
    if (window.MaterialRevisionWorkspace && window.MaterialRevisionWorkspace.openForTrack) {
      try { await window.MaterialRevisionWorkspace.openForTrack(trackId); }
      catch (e) { setStatus('studio.material.openFailed', e.code || e.message, 'error'); }
    }
  }

  var API = { open: open, close: close, move: move, jumpFromInput: jumpFromInput, stageFields: stageFields, replay: replay, split: split, mergeNext: mergeNext, applyOffset: applyOffset, undo: undo, redo: redo, saveVersion: saveVersion, continueToTable: continueToTable, discardDraft: discardDraft, exportSubtitle: exportSubtitle, exportSlim: exportSlim, relinkSelected: relinkSelected, deletePackage: deletePackage, focusModel: focusModel, cueIndexForTime: cueIndexForTime, cueJumpIndex: cueJumpIndex, canSplitAt: canSplitAt, formatMs: formatMs, parseMs: parseMs, getCaptionContext:getCaptionContext, selectCaptionSegment:selectCaptionSegment };
  if (typeof window !== 'undefined') window.StudioMediaEditor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
