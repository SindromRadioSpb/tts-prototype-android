// Studio Ingest L3a — provider-neutral promotion/projection layer.
// Pure helpers are Node-testable; browser methods use injected OPFS SQLite/media adapters only.
(function () {
  'use strict';

  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function ms(value) {
    if (value == null || value === '') return null;
    var n = Number(value); return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  function finiteIndex(value, fallback) {
    var n = Number(value); return Number.isInteger(n) && n >= 0 ? n : fallback;
  }
  function compatibilityMedia(media) {
    media = media || {};
    var durationSec = media.durationSec;
    if (durationSec == null && media.duration_ms != null) durationSec = Number(media.duration_ms) / 1000;
    return {
      sha256: media.sha256 || media.media_sha256 || null,
      mime: media.mime || null,
      opfsPath: media.opfsPath || media.opfs_path || null,
      durationSec: durationSec == null ? null : Number(durationSec),
      originalName: media.originalName || media.original_name || null,
      sizeBytes: media.sizeBytes == null ? (media.size_bytes == null ? null : Number(media.size_bytes)) : Number(media.sizeBytes),
      sessionOnly: media.sessionOnly == null ? !!media.session_only : !!media.sessionOnly,
    };
  }
  function getCore() {
    if (typeof window !== 'undefined' && window.MediaPackageCore) return window.MediaPackageCore;
    return require('./media-package-core.js');
  }

  function workspaceViewModel(row, options) {
    if (!row || !row.package_id || !row.corrected_track_id) return null;
    options = options || {};
    var mime = String(row.mime || '');
    return {
      package_id: row.package_id,
      track_id: row.corrected_track_id,
      revision_id: row.current_revision_id,
      revision_sha256: row.current_revision_sha256,
      title: row.original_name || 'Media transcript',
      duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
      media_kind: mime.indexOf('video/') === 0 ? 'video' : (mime.indexOf('audio/') === 0 ? 'audio' : 'captions'),
      revision_no: Number(row.revision_no || 0),
      has_draft: !!row.has_draft,
      media_missing: !!row.media_sha256 && !row.media_available,
      binding_count: Number(row.binding_count || 0),
      stale: !!options.stale,
      active: !!options.active,
      updated_at: row.updated_at || null,
      raw_immutable: true,
    };
  }

  function passportToPromotionInput(holder) {
    holder = holder && holder.source && typeof holder.source === 'object' ? holder.source : (holder || {});
    var isAudio = !!holder.audio;
    var passport = isAudio ? holder.audio : holder.captions;
    if (!passport || !Array.isArray(passport.segments) || !passport.segments.length) {
      var e = new Error('MEDIA_PASSPORT_SEGMENTS_REQUIRED'); e.code = 'MEDIA_PASSPORT_SEGMENTS_REQUIRED'; throw e;
    }
    var mediaSrc = passport.media || {};
    var asr = passport.asr || {};
    var captionMeta = passport.captions || {};
    var durationMs = mediaSrc.durationSec == null ? null : ms(mediaSrc.durationSec);
    var sourceSegments = passport.segments;
    if (!isAudio && passport.rawSource) {
      try { sourceSegments = getCore().parseSubtitles(passport.rawSource, { hint: captionMeta.format }).segments; }
      catch (_) { sourceSegments = passport.segments; }
    }
    var segments = sourceSegments.map(function (segment, index, all) {
      var start = segment.start_ms == null ? ms(segment.start) : Math.round(Number(segment.start_ms));
      var end = segment.end_ms == null ? ms(segment.end) : Math.round(Number(segment.end_ms));
      if (end == null && index + 1 < all.length) end = all[index + 1].start_ms == null ? ms(all[index + 1].start) : Math.round(Number(all[index + 1].start_ms));
      if (end == null && durationMs != null && durationMs > start) end = durationMs;
      return {
        start_ms: start,
        end_ms: end,
        text: String(segment.text == null ? '' : segment.text),
        speaker: segment.speaker == null ? null : String(segment.speaker),
        source_line_index: finiteIndex(segment.source_line_index, finiteIndex(segment.i, index)),
        quality_flags: segment.blind ? ['blind'] : (Array.isArray(segment.quality_flags) ? segment.quality_flags.slice() : []),
      };
    });
    return {
      kind: isAudio ? 'audio' : 'captions',
      format: isAudio ? 'asr' : String(captionMeta.format || 'vtt').toLowerCase(),
      language: isAudio ? (asr.language || 'he') : (captionMeta.language || 'he'),
      provider: isAudio ? (asr.actualProvider || asr.method || holder.method || null) : 'subtitle-import',
      model: isAudio ? (asr.model || holder.model || null) : null,
      model_revision: isAudio ? (asr.modelRevision || asr.runtime && asr.runtime.model_revision || null) : null,
      media: {
        sha256: mediaSrc.sha256 || null, mime: mediaSrc.mime || null, duration_ms: durationMs,
        original_name: mediaSrc.originalName || captionMeta.fileName || null,
        opfs_path: mediaSrc.opfsPath || null, size_bytes: mediaSrc.sizeBytes == null ? null : Number(mediaSrc.sizeBytes),
        session_only: !!mediaSrc.sessionOnly,
        external_ref: passport.video || holder.video || null,
      },
      segments: segments,
      provenance: {
        source_kind: holder.kind || (isAudio ? 'audio' : 'captions'),
        method: holder.method || null, model: holder.model || null, imported_at: holder.at || null,
        asr: isAudio ? copy(asr) : undefined, captions: isAudio ? undefined : copy(captionMeta),
        source_attachment: !isAudio && passport.rawSource ? {
          format: String(captionMeta.format || ''), text: String(passport.rawSource), class: 'C', local_only: true,
        } : undefined,
        warnings: copy(holder.warnings || []), code_version: asr.codeVersion || null,
      },
    };
  }

  function buildCompatibilityProjection(revision, context) {
    context = context || {}; var kind = context.kind === 'captions' ? 'captions' : 'audio';
    var projectionRef = {
      package_id: revision.package_id, track_id: revision.track_id,
      revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256,
      projection_sha256: revision.canonical_sha256, local_only: true,
    };
    var segments = (revision.segments || []).map(function (segment, index) {
      return {
        i: index, start: segment.start_ms / 1000,
        end: segment.end_ms == null ? null : segment.end_ms / 1000,
        text: segment.text, source_segment_id: segment.source_segment_ids && segment.source_segment_ids[0] || null,
        source_segment_ids: (segment.source_segment_ids || []).slice(),
        caption_segment_id: segment.caption_segment_id || null,
        speaker: segment.speaker || null, authority: copy(segment.authority || {}),
        quality_flags: copy(segment.quality_flags || []), blind: (segment.quality_flags || []).indexOf('blind') >= 0,
      };
    });
    var trackProjection = {
      v: 2, projection_of_revision_id: revision.revision_id,
      projection_sha256: revision.canonical_sha256,
      media: compatibilityMedia(context.media), segments: segments, timing: null, timingDropReason: null,
    };
    var out = { media_package_ref: projectionRef };
    out[kind] = trackProjection;
    return out;
  }

  function buildExactBindingPassport(revision, binding, media) {
    if (!revision || !binding || !media) throw new Error('EXACT_BINDING_CONTEXT_REQUIRED');
    if (String(revision.revision_id) !== String(binding.revision_id) || String(revision.track_id) !== String(binding.track_id)) throw new Error('EXACT_BINDING_TARGET_MISMATCH');
    if (String(revision.canonical_sha256) !== String(binding.revision_sha256)) throw new Error('EXACT_BINDING_HASH_MISMATCH');
    if (String(media.package_id) !== String(binding.package_id)) throw new Error('EXACT_BINDING_PACKAGE_MISMATCH');
    var projection = buildCompatibilityProjection({
      package_id: media.package_id, track_id: revision.track_id, revision_id: revision.revision_id,
      canonical_sha256: revision.canonical_sha256, segments: revision.segments || [],
    }, { kind: 'audio', media: media });
    var passport = projection.audio, byCaption = new Map();
    (revision.segments || []).forEach(function (segment) { if (segment && segment.caption_segment_id) byCaption.set(String(segment.caption_segment_id), segment); });
    var mappings = binding.mapping && Array.isArray(binding.mapping.rows) ? binding.mapping.rows.slice() : [];
    mappings.sort(function (a, b) { return finiteIndex(a && a.row_index, 0) - finiteIndex(b && b.row_index, 0); });
    var firstRow = new Map(), rowCaptionIds = [], missing = 0;
    mappings.forEach(function (item) {
      var rowIndex = finiteIndex(item && item.row_index, rowCaptionIds.length), captionId = item && (item.caption_segment_id || item.corrected_caption_segment_id) ? String(item.caption_segment_id || item.corrected_caption_segment_id) : '';
      rowCaptionIds[rowIndex] = captionId || null;
      if (!captionId || !byCaption.has(captionId)) { missing++; return; }
      if (!firstRow.has(captionId)) firstRow.set(captionId, rowIndex);
    });
    var entries = [];
    (revision.segments || []).forEach(function (segment) {
      var captionId = segment && segment.caption_segment_id && String(segment.caption_segment_id), rowIndex = captionId && firstRow.get(captionId);
      if (rowIndex == null || !Number.isFinite(Number(segment.start_ms))) return;
      var entry = { o: rowIndex, t: Number(segment.start_ms) / 1000 };
      if (Number.isFinite(Number(segment.end_ms)) && Number(segment.end_ms) > Number(segment.start_ms)) entry.end = Number(segment.end_ms) / 1000;
      entries.push(entry);
    });
    passport.timing = entries.length ? { entries: entries } : null;
    passport.timingSource = entries.length ? 'studio-exact-binding' : null;
    passport.timingMap = {
      authority: 'studio-exact-binding', revision_id: revision.revision_id,
      revision_sha256: revision.canonical_sha256, row_caption_segment_ids: rowCaptionIds,
      mapped_rows: rowCaptionIds.filter(Boolean).length, missing_rows: missing,
    };
    if (!entries.length) passport.timingDropReason = 'NO_EXACT_SEGMENT_MAPPING';
    return passport;
  }

  function filterForCloudSlim(sourceMeta) {
    var out = copy(sourceMeta || {}), source = out && out.source;
    if (!source || !source.media_package_ref) return out;
    ['audio', 'captions'].forEach(function (key) {
      var value = source[key]; if (!value || typeof value !== 'object') return;
      delete value.segments; delete value.raw; delete value.corrected; delete value.draft;
      delete value.revisions; delete value.timing;
    });
    var ref = source.media_package_ref;
    source.media_package_ref = {
      package_id: ref.package_id, local_only: true, media_included: false,
      revision_sha256: ref.revision_sha256 || ref.projection_sha256 || null,
    };
    return out;
  }

  var repository = null, activeWorkspaceRef = null, activeWorkspaceOptions = {}, workspaceRefreshSerial = 0;
  function browserRepository() {
    if (repository) return repository;
    if (typeof window === 'undefined' || !window.__localDB || !window.MediaPackageRepository) throw new Error('MEDIA_PACKAGE_REPOSITORY_UNAVAILABLE');
    repository = window.MediaPackageRepository.createRepository(window.__localDB, getCore());
    return repository;
  }

  function uiText(key, fallback, vars) {
    var value = key;
    try { value = typeof t === 'function' ? t(key) : key; } catch (_) {}
    if (!value || value === key) value = fallback || key;
    Object.keys(vars || {}).forEach(function (name) { value = String(value).split('{' + name + '}').join(String(vars[name])); });
    return String(value);
  }
  function uiEl(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
  function formatDuration(durationMs) {
    if (durationMs == null || !Number.isFinite(Number(durationMs))) return '';
    var total = Math.max(0, Math.round(Number(durationMs) / 1000));
    var hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
    return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') : minutes + ':' + String(seconds).padStart(2, '0');
  }
  function renderActiveWorkspace(model) {
    var card = uiEl('l3WorkspaceCard'); if (!card) return;
    card.hidden = !model;
    if (!model) return;
    card.dataset.packageId = model.package_id;
    card.dataset.stale = model.stale ? 'true' : 'false';
    var name = uiEl('l3WorkspaceName'); if (name) name.textContent = model.title;
    var revision = uiEl('l3WorkspaceRevision'); if (revision) revision.textContent = uiText('studio.mediaPackage.workspaceRevision', 'Правки · v{n}', { n: model.revision_no });
    var state = uiEl('l3WorkspaceState');
    if (state) {
      state.textContent = model.has_draft
        ? uiText('studio.mediaPackage.workspaceDraft', 'Есть восстановленный черновик')
        : uiText('studio.mediaPackage.workspaceSaved', 'Версия сохранена на этом устройстве');
      state.dataset.kind = model.has_draft ? 'draft' : 'saved';
    }
    var detail = [];
    var duration = formatDuration(model.duration_ms); if (duration) detail.push(duration);
    detail.push(uiText('studio.mediaPackage.workspaceLocalOnly', 'Только на этом устройстве'));
    var meta = uiEl('l3WorkspaceMeta'); if (meta) meta.textContent = detail.join(' · ');
    var missing = uiEl('l3WorkspaceMediaMissing'); if (missing) missing.hidden = !model.media_missing;
    var stale = uiEl('l3WorkspaceStale'); if (stale) stale.hidden = !model.stale;
  }
  function renderWorkspaceShelf(models) {
    var root = uiEl('l3WorkspaceShelf'), list = uiEl('l3WorkspaceShelfList'), empty = uiEl('l3WorkspaceShelfEmpty');
    var entry = uiEl('l3WorkspaceLibraryBtn'), count = uiEl('l3WorkspaceLibraryCount');
    if (entry) entry.hidden = !models.length;
    if (count) count.textContent = String(models.length);
    if (!root || !list || !empty) return;
    root.hidden = false; empty.hidden = !!models.length; list.replaceChildren();
    models.forEach(function (model) {
      var item = document.createElement('article'); item.className = 'l3-workspace-shelf-item';
      item.dataset.active = model.active ? 'true' : 'false';
      item.dataset.packageId = model.package_id;
      item.dataset.trackId = model.track_id;
      var copyBox = document.createElement('div'); copyBox.className = 'l3-workspace-shelf-copy';
      var title = document.createElement('strong'); title.dir = 'auto'; title.textContent = model.title;
      var meta = document.createElement('span');
      var parts = [uiText('studio.mediaPackage.workspaceVersion', 'Версия {n}', { n: model.revision_no })];
      var duration = formatDuration(model.duration_ms); if (duration) parts.push(duration);
      if (model.has_draft) parts.push(uiText('studio.mediaPackage.workspaceDraftShort', 'черновик'));
      if (model.media_missing) parts.push(uiText('studio.mediaPackage.workspaceMediaMissingShort', 'медиа нужно связать'));
      meta.textContent = parts.join(' · '); copyBox.append(title, meta);
      var open = document.createElement('button'); open.type = 'button'; open.className = 'btn-secondary';
      open.textContent = uiText('studio.mediaPackage.workspaceReopen', 'Вернуться к правкам');
      open.addEventListener('click', function () { openWorkspace(model.package_id, model.track_id); });
      item.append(copyBox, open); list.appendChild(item);
    });
  }
  async function refreshWorkspaceUi() {
    if (typeof window === 'undefined') return { active: null, items: [] };
    var serial = ++workspaceRefreshSerial;
    try {
      var repo = browserRepository();
      var ref = activeWorkspaceRef || window.v3LastMediaPackageRef || null;
      var activeRow = ref && ref.package_id ? await repo.getWorkspace(ref.package_id, ref.track_id || null) : null;
      var rows = await repo.listWorkspaces({ limit: 8 });
      if (serial !== workspaceRefreshSerial) return { superseded: true };
      if (ref && !activeRow) { activeWorkspaceRef = null; activeWorkspaceOptions = {}; window.v3LastMediaPackageRef = null; }
      var active = activeRow ? workspaceViewModel(activeRow, Object.assign({}, activeWorkspaceOptions, { active: true })) : null;
      var items = rows.map(function (row) { return workspaceViewModel(row, { active: !!active && row.package_id === active.package_id && row.corrected_track_id === active.track_id }); });
      renderActiveWorkspace(active); renderWorkspaceShelf(items);
      return { active: active, items: items };
    } catch (_) {
      if (serial === workspaceRefreshSerial) { renderActiveWorkspace(null); renderWorkspaceShelf([]); }
      return { active: null, items: [], unavailable: true };
    }
  }
  async function setActiveWorkspace(ref, options) {
    activeWorkspaceRef = ref ? copy(ref) : null; activeWorkspaceOptions = Object.assign({}, options || {});
    if (typeof window !== 'undefined') window.v3LastMediaPackageRef = activeWorkspaceRef ? copy(activeWorkspaceRef) : null;
    renderActiveWorkspace(null);
    return refreshWorkspaceUi();
  }
  function clearActiveWorkspace() {
    activeWorkspaceRef = null; activeWorkspaceOptions = {}; workspaceRefreshSerial++;
    if (typeof window !== 'undefined') window.v3LastMediaPackageRef = null;
    renderActiveWorkspace(null);
    refreshWorkspaceUi();
  }
  async function activatePackage(packageId, options) {
    options = options || {};
    var workspace = await browserRepository().getWorkspace(packageId, options.track_id || null);
    if (!workspace) throw new Error('PACKAGE_NOT_FOUND');
    await setActiveWorkspace({ package_id: workspace.package_id, track_id: workspace.corrected_track_id,
      revision_id: workspace.current_revision_id, revision_sha256: workspace.current_revision_sha256,
      projection_sha256: workspace.current_revision_sha256, local_only: true }, options);
    return workspace;
  }
  async function activateTextBinding(textId) {
    var repo = browserRepository(), binding = await repo.getTextBinding(textId);
    if (!binding) { clearActiveWorkspace(); return { binding: null, stale: false, workspace: null }; }
    var stale = await repo.isTextBindingStale(textId), workspace = await activatePackage(binding.package_id, {
      stale: !!stale.stale, text_id: String(textId), bound_revision_id: binding.revision_id,
    });
    var revision = await repo.getRevision(binding.revision_id), media = await repo.getPackage(binding.package_id);
    var mediaPassport = revision && media ? buildExactBindingPassport(revision, binding, media) : null;
    return { binding: binding, stale: !!stale.stale, workspace: workspace, media_passport: mediaPassport };
  }
  async function openWorkspace(packageId, trackId) {
    var workspace = packageId
      ? await activatePackage(packageId, trackId ? { track_id: String(trackId) } : {})
      : (activeWorkspaceRef && await activatePackage(activeWorkspaceRef.package_id, Object.assign({}, activeWorkspaceOptions, { track_id: activeWorkspaceRef.track_id })));
    if (!workspace) throw new Error('PACKAGE_NOT_FOUND');
    if (typeof window !== 'undefined' && window.StudioImport && typeof window.StudioImport.close === 'function') window.StudioImport.close();
    if (!window.StudioMediaEditor) throw new Error('MEDIA_EDITOR_UNAVAILABLE');
    await window.StudioMediaEditor.open(workspace.corrected_track_id);
    return workspace;
  }
  async function openWorkspaceLibrary() {
    if (typeof window === 'undefined' || !window.StudioImport) return;
    window.StudioImport.open(); window.StudioImport.switchTab('file'); await refreshWorkspaceUi();
  }
  async function notifyRevision(trackId, revision) {
    if (activeWorkspaceRef && activeWorkspaceRef.track_id === trackId && revision) {
      activeWorkspaceRef.revision_id = revision.revision_id;
      activeWorkspaceRef.revision_sha256 = revision.canonical_sha256;
      activeWorkspaceRef.projection_sha256 = revision.canonical_sha256;
      if (activeWorkspaceOptions.bound_revision_id && activeWorkspaceOptions.bound_revision_id !== revision.revision_id) activeWorkspaceOptions.stale = true;
      if (typeof window !== 'undefined') window.v3LastMediaPackageRef = copy(activeWorkspaceRef);
    }
    return refreshWorkspaceUi();
  }

  function reconcileCorrectedPreview(segments, text) {
    var Core = getCore(), next = copy(segments || []), operations = [];
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')
      .map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length || next.map(function (s) { return s.text; }).join('\n') === lines.join('\n')) return { segments: next, operations: operations, changed: false };
    if (lines.length === next.length) {
      lines.forEach(function (line, index) {
        if (line === next[index].text) return;
        var result = Core.applyOperation('user_corrected', next, { type: 'edit_text', caption_segment_id: next[index].caption_segment_id, text: line });
        next = result.segments; operations.push(result.operation);
      });
    } else {
      var replaced = Core.applyOperation('user_corrected', next, { type: 'replace_text_layout', text: lines.join('\n') });
      next = replaced.segments; operations.push(replaced.operation);
    }
    return { segments: next, operations: operations, changed: operations.length > 0 };
  }

  async function createFromImportMeta(meta) {
    var input = passportToPromotionInput(meta), Core = getCore(), repo = browserRepository();
    var raw = await Core.createRawRevision({
      media_sha256: input.media.sha256, format: input.format, language: input.language,
      provider: input.provider, model: input.model, model_revision: input.model_revision,
      segments: input.segments, provenance: input.provenance,
    });
    var created = await repo.createPackage({ media: input.media, language: input.language, raw_revision: raw,
      raw_author_kind: input.format === 'asr' ? 'provider' : 'import' });
    var current = await repo.getCurrentRevision(created.corrected_track_id);
    var preview = reconcileCorrectedPreview(current.segments, meta && meta.textSnapshot);
    if (preview.changed) {
      await repo.saveDraft(created.corrected_track_id, current.revision_id, preview.segments, preview.operations);
      current = await repo.commitDraft(created.corrected_track_id, { author_kind: 'user', provenance: { surface: 'studio-import-preview', preserves_raw: true } });
    }
    var ref = {
      package_id: created.package_id, raw_track_id: created.raw_track_id,
      track_id: created.corrected_track_id, revision_id: current.revision_id,
      revision_sha256: current.canonical_sha256, projection_sha256: current.canonical_sha256,
      local_only: true,
    };
    return { ref: ref, package: created, revision: Object.assign({ package_id: created.package_id }, current), input: input };
  }

  async function promoteLegacy(sourceMeta) {
    var source = sourceMeta && sourceMeta.source && typeof sourceMeta.source === 'object' ? sourceMeta.source : sourceMeta;
    if (source && source.media_package_ref && source.media_package_ref.package_id) {
      var repo = browserRepository(), pkg = await repo.getPackage(source.media_package_ref.package_id);
      if (pkg) return { already_promoted: true, ref: copy(source.media_package_ref) };
    }
    return createFromImportMeta(source || {});
  }

  function setRepositoryForTests(repo) { repository = repo || null; }

  async function buildSlimPackageFiles(snapshot, options) {
    options = options || {}; var Core = getCore();
    var rawJson = JSON.stringify({ schema: 'studio-caption-track-v1', track: snapshot.raw_track, revision: snapshot.raw_revision }, null, 2);
    var correctedJson = JSON.stringify({ schema: 'studio-caption-track-v1', track: snapshot.corrected_track, revision: snapshot.corrected_revision }, null, 2);
    var files = {
      'tracks/raw-original.json': rawJson,
      'tracks/raw-original.vtt': Core.serializeSubtitles('vtt', snapshot.raw_revision.segments),
      'tracks/user-corrected.json': correctedJson,
      'tracks/user-corrected.vtt': Core.serializeSubtitles('vtt', snapshot.corrected_revision.segments),
      'mapping/text-binding.json': JSON.stringify(snapshot.binding || null, null, 2),
      'quality/import-run.json': JSON.stringify({ raw: snapshot.raw_revision.provenance || {}, corrected: snapshot.corrected_revision.provenance || {} }, null, 2),
      'README.txt': 'LinguistPro Correctable Media Package v1\nMedia bytes are not included. Relink the original file; SHA-256 must match exactly.\n',
    };
    var hashes = {};
    for (var path of Object.keys(files)) hashes[path] = await Core.sha256Hex(files[path]);
    var manifest = {
      schema: 'linguistpro-media-package-v1', schema_version: 1,
      package: Object.assign({}, copy(snapshot.package), { opfs_path: null }),
      selected_revision_id: snapshot.corrected_revision.revision_id,
      selected_revision_sha256: snapshot.corrected_revision.canonical_sha256,
      media_included: false, app_version: options.app_version || null,
      exported_at: options.exported_at || new Date().toISOString(), files: hashes,
    };
    files['manifest.json'] = JSON.stringify(manifest, null, 2);
    return files;
  }

  async function verifySlimPackageFiles(files) {
    var Core = getCore(), manifest;
    try { manifest = JSON.parse(files && files['manifest.json']); } catch (_) { throw new Error('PACKAGE_MANIFEST_INVALID'); }
    if (!manifest || manifest.schema !== 'linguistpro-media-package-v1' || manifest.schema_version !== 1) throw new Error('PACKAGE_SCHEMA_UNKNOWN');
    if (manifest.media_included !== false) throw new Error('PACKAGE_MEDIA_POLICY_INVALID');
    for (var path of Object.keys(manifest.files || {})) {
      if (typeof files[path] !== 'string') throw new Error('PACKAGE_FILE_MISSING:' + path);
      if (await Core.sha256Hex(files[path]) !== manifest.files[path]) throw new Error('PACKAGE_CHECKSUM_MISMATCH:' + path);
    }
    var raw, corrected, binding;
    try {
      raw = JSON.parse(files['tracks/raw-original.json']); corrected = JSON.parse(files['tracks/user-corrected.json']);
      binding = JSON.parse(files['mapping/text-binding.json']);
    } catch (_) { throw new Error('PACKAGE_TRACK_INVALID'); }
    if (!raw || !corrected || raw.schema !== 'studio-caption-track-v1' || corrected.schema !== 'studio-caption-track-v1') throw new Error('PACKAGE_TRACK_INVALID');
    if (raw.track.role !== 'raw_original' || corrected.track.role !== 'user_corrected') throw new Error('PACKAGE_TRACK_ROLE_INVALID');
    var rawHash = await Core.revisionHash('raw_original', raw.revision.segments, raw.revision.operations || []);
    var correctedHash = await Core.revisionHash('user_corrected', corrected.revision.segments, corrected.revision.operations || []);
    if (rawHash !== raw.revision.canonical_sha256 || correctedHash !== corrected.revision.canonical_sha256 || correctedHash !== manifest.selected_revision_sha256) throw new Error('PACKAGE_REVISION_HASH_MISMATCH');
    var rawVtt = Core.parseSubtitles(files['tracks/raw-original.vtt'], { hint: 'vtt' });
    var correctedVtt = Core.parseSubtitles(files['tracks/user-corrected.vtt'], { hint: 'vtt' });
    if (await Core.semanticHash(rawVtt.segments) !== await Core.semanticHash(raw.revision.segments) || await Core.semanticHash(correctedVtt.segments) !== await Core.semanticHash(corrected.revision.segments)) throw new Error('PACKAGE_VTT_PARITY_MISMATCH');
    return { manifest: manifest, package: manifest.package, raw_track: raw.track, raw_revision: raw.revision, corrected_track: corrected.track, corrected_revision: corrected.revision, binding: binding };
  }

  async function verifyRelinkBytes(expectedSha, bytes) {
    var input = bytes instanceof Uint8Array ? bytes
      : (typeof ArrayBuffer !== 'undefined' && bytes instanceof ArrayBuffer) ? new Uint8Array(bytes)
      : (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(bytes)) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes;
    var actual = await getCore().sha256Hex(input);
    if (String(actual).toLowerCase() !== String(expectedSha || '').toLowerCase()) {
      var mismatch = new Error('MEDIA_SHA_MISMATCH');
      mismatch.code = 'MEDIA_SHA_MISMATCH'; mismatch.expected_sha = String(expectedSha || '').toLowerCase(); mismatch.actual_sha = String(actual || '').toLowerCase();
      throw mismatch;
    }
    return true;
  }

  async function snapshotForExport(packageId, textId) {
    var repo = browserRepository(), pkg = await repo.getPackage(packageId), tracks = await repo.listTracks(packageId);
    var rawTrack = tracks.find(function (v) { return v.role === 'raw_original'; }), correctedTrack = tracks.find(function (v) { return v.role === 'user_corrected'; });
    if (!pkg || !rawTrack || !correctedTrack) throw new Error('PACKAGE_NOT_FOUND');
    return { package: pkg, raw_track: rawTrack, raw_revision: await repo.getCurrentRevision(rawTrack.track_id), corrected_track: correctedTrack, corrected_revision: await repo.getCurrentRevision(correctedTrack.track_id), binding: textId ? await repo.getTextBinding(textId) : null };
  }
  async function exportSlimZip(packageId, textId) {
    var JSZipCtor = await window.v3LoadJSZip(), files = await buildSlimPackageFiles(await snapshotForExport(packageId, textId), { app_version: window.APP_VERSION || null });
    var zip = new JSZipCtor(); Object.keys(files).forEach(function (path) { zip.file(path, files[path]); });
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  async function importSlimZipFile(file) {
    var JSZipCtor = await window.v3LoadJSZip(), zip = await JSZipCtor.loadAsync(file), files = {};
    for (var path of Object.keys(zip.files)) if (!zip.files[path].dir) files[path] = await zip.files[path].async('string');
    var snapshot = await verifySlimPackageFiles(files), result = await browserRepository().importSnapshot(snapshot);
    result.snapshot = snapshot; return result;
  }
  async function relinkFile(packageId, file) {
    var repo = browserRepository(), pkg = await repo.getPackage(packageId); if (!pkg || !pkg.media_sha256) throw new Error('PACKAGE_MEDIA_SHA_MISSING');
    var bytes = await file.arrayBuffer();
    try { await verifyRelinkBytes(pkg.media_sha256, bytes); } catch (error) { error.file_name = file.name || null; error.file_size = file.size == null ? null : Number(file.size); error.expected_name = pkg.original_name || null; error.expected_size = pkg.size_bytes == null ? null : Number(pkg.size_bytes); throw error; }
    var path = window.MediaStore.mediaFileName(pkg.media_sha256, file.type || pkg.mime, file.name);
    var saved = await window.MediaStore.saveMedia(bytes, path); if (!saved.ok) throw new Error('MEDIA_RELINK_WRITE_FAILED:' + saved.reason);
    return repo.relinkMedia(packageId, { sha256: pkg.media_sha256, mime: file.type || pkg.mime, opfs_path: path, size_bytes: file.size, original_name: file.name });
  }
  async function handleSlimImport(event) {
    var file = event && event.target && event.target.files && event.target.files[0];
    if (event && event.target) event.target.value = '';
    if (!file) return null;
    try {
      var result = await importSlimZipFile(file);
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('studio.mediaPackage.packageImported') : 'Media Package imported', 'success');
      await activatePackage(result.package_id);
      if (window.StudioMediaEditor) await window.StudioMediaEditor.open(result.corrected_track_id);
      return result;
    } catch (e) {
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('studio.mediaPackage.packageImportFailed') : 'Media Package import failed', 'error');
      throw e;
    }
  }
  async function deletePackageAndGc(packageId, confirmed) {
    var receipt = await browserRepository().deletePackage(packageId, { confirm: !!confirmed });
    if (receipt.media_blob_action === 'eligible_for_gc' && receipt.opfs_path && typeof window !== 'undefined' && window.MediaStore && window.MediaStore.deleteMedia) {
      var removed = await window.MediaStore.deleteMedia(receipt.opfs_path);
      receipt.media_blob_removed = !!(removed && removed.ok && removed.removed);
      if (!removed || !removed.ok) receipt.errors.push({ stage: 'media_gc', reason: removed && removed.reason || 'DELETE_FAILED' });
    }
    return receipt;
  }

  var API = {
    passportToPromotionInput: passportToPromotionInput,
    reconcileCorrectedPreview: reconcileCorrectedPreview,
    buildCompatibilityProjection: buildCompatibilityProjection,
    buildExactBindingPassport: buildExactBindingPassport,
    filterForCloudSlim: filterForCloudSlim,
    createFromImportMeta: createFromImportMeta, promoteLegacy: promoteLegacy,
    buildSlimPackageFiles: buildSlimPackageFiles, verifySlimPackageFiles: verifySlimPackageFiles,
    verifyRelinkBytes: verifyRelinkBytes, snapshotForExport: snapshotForExport,
    exportSlimZip: exportSlimZip, importSlimZipFile: importSlimZipFile, relinkFile: relinkFile,
    handleSlimImport: handleSlimImport,
    deletePackageAndGc: deletePackageAndGc,
    workspaceViewModel: workspaceViewModel, refreshWorkspaceUi: refreshWorkspaceUi,
    setActiveWorkspace: setActiveWorkspace, clearActiveWorkspace: clearActiveWorkspace,
    activatePackage: activatePackage, activateTextBinding: activateTextBinding,
    openWorkspace: openWorkspace, openActiveWorkspace: openWorkspace, openWorkspaceLibrary: openWorkspaceLibrary,
    notifyRevision: notifyRevision,
    browserRepository: browserRepository, setRepositoryForTests: setRepositoryForTests,
  };
  if (typeof window !== 'undefined') window.StudioMediaPackage = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
