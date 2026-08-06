// Studio Ingest L3a — typed repository over the browser OPFS SQLite adapter.
// Adapter contract: dbQuery(sql, params), dbRun(sql, params), execRaw(sql).
(function () {
  'use strict';

  function createError(code, detail) {
    var e = new Error(code + (detail ? ': ' + detail : ''));
    e.code = code;
    return e;
  }
  function parse(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function json(value) { return JSON.stringify(value == null ? null : value); }
  function now() { return new Date().toISOString(); }
  function cleanHash(value) {
    var s = String(value || '').trim().toLowerCase();
    if (s && !/^[a-f0-9]{64}$/.test(s)) throw createError('MEDIA_SHA256_INVALID');
    return s || null;
  }

  function createRepository(adapter, Core) {
    if (!adapter || !adapter.dbQuery || !adapter.dbRun || !adapter.execRaw) throw createError('REPOSITORY_ADAPTER_REQUIRED');
    if (!Core || !Core.revisionHash) throw createError('MEDIA_PACKAGE_CORE_REQUIRED');
    var q = function (sql, params) { return adapter.dbQuery(sql, params || []); };
    var r = function (sql, params) { return adapter.dbRun(sql, params || []); };
    var x = function (sql) { return adapter.execRaw(sql); };

    async function transaction(work) {
      await x('BEGIN;');
      try { var result = await work(); await x('COMMIT;'); return result; }
      catch (e) { try { await x('ROLLBACK;'); } catch (_) {} throw e; }
    }
    function inject(actual, expected) { if (actual && actual === expected) throw createError('FAULT_INJECT:' + actual); }
    async function one(sql, params) { var rows = await q(sql, params); return rows && rows[0] || null; }

    function revisionRow(row) {
      if (!row) return null;
      return {
        revision_id: row.revision_id, track_id: row.track_id,
        parent_revision_id: row.parent_revision_id || null, revision_no: Number(row.revision_no),
        segments: parse(row.segments_json, []), operations: parse(row.operations_json, []),
        canonical_sha256: row.canonical_sha256, author_kind: row.author_kind,
        provenance: parse(row.provenance_json, {}), created_at: row.created_at,
      };
    }
    function trackRow(row) {
      if (!row) return null;
      return {
        track_id: row.track_id, package_id: row.package_id, role: row.role, language: row.language || null,
        parent_track_id: row.parent_track_id || null, current_revision_id: row.current_revision_id || null,
        draft_base_revision_id: row.draft_base_revision_id || null,
        draft: parse(row.draft_json, null), draft_updated_at: row.draft_updated_at || null,
        created_at: row.created_at, updated_at: row.updated_at,
      };
    }
    function workspaceRow(row) {
      if (!row) return null;
      return {
        package_id: row.package_id,
        media_sha256: row.media_sha256 || null,
        mime: row.mime || null,
        duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
        original_name: row.original_name || null,
        opfs_path: row.opfs_path || null,
        size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
        corrected_track_id: row.corrected_track_id,
        current_revision_id: row.current_revision_id,
        current_revision_sha256: row.current_revision_sha256,
        revision_no: Number(row.revision_no || 0),
        has_draft: !!row.draft_json,
        draft_updated_at: row.draft_updated_at || null,
        media_available: !!row.opfs_path,
        binding_count: Number(row.binding_count || 0),
        created_at: row.created_at,
        updated_at: row.track_updated_at || row.updated_at,
      };
    }

    var WORKSPACE_SELECT = `SELECT p.package_id,p.media_sha256,p.mime,p.duration_ms,p.original_name,
      p.opfs_path,p.size_bytes,p.created_at,p.updated_at,t.track_id AS corrected_track_id,
      t.current_revision_id,t.draft_json,t.draft_updated_at,t.updated_at AS track_updated_at,
      r.canonical_sha256 AS current_revision_sha256,r.revision_no,
      (SELECT COUNT(*) FROM studio_text_media_bindings b WHERE b.package_id=p.package_id) AS binding_count
      FROM studio_media_packages p
      JOIN studio_caption_tracks t ON t.package_id=p.package_id AND t.role='user_corrected'
      JOIN studio_caption_revisions r ON r.revision_id=t.current_revision_id
      WHERE p.deleted_at IS NULL`;

    async function getWorkspace(packageId, correctedTrackId) {
      var params = [String(packageId)], exactTrack = correctedTrackId == null ? '' : String(correctedTrackId);
      var sql = WORKSPACE_SELECT + ' AND p.package_id=?';
      if (exactTrack) { sql += ' AND t.track_id=?'; params.push(exactTrack); }
      return workspaceRow(await one(sql + ' LIMIT 1', params));
    }
    async function listWorkspaces(options) {
      options = options || {};
      var limit = Math.max(1, Math.min(50, Math.round(Number(options.limit) || 8)));
      var rows = await q(WORKSPACE_SELECT + ` ORDER BY
        COALESCE(t.draft_updated_at,t.updated_at,p.updated_at,p.created_at) DESC LIMIT ?`, [limit]);
      return rows.map(workspaceRow);
    }

    async function getTrack(trackId) {
      return trackRow(await one('SELECT * FROM studio_caption_tracks WHERE track_id = ? LIMIT 1', [String(trackId)]));
    }
    async function getRevision(revisionId) {
      return revisionRow(await one('SELECT * FROM studio_caption_revisions WHERE revision_id = ? LIMIT 1', [String(revisionId)]));
    }
    async function getCurrentRevision(trackId) {
      var row = await one(`SELECT r.* FROM studio_caption_tracks t
        JOIN studio_caption_revisions r ON r.revision_id = t.current_revision_id
        WHERE t.track_id = ? LIMIT 1`, [String(trackId)]);
      return revisionRow(row);
    }
    async function getPackage(packageId) {
      var row = await one('SELECT * FROM studio_media_packages WHERE package_id = ? AND deleted_at IS NULL LIMIT 1', [String(packageId)]);
      if (!row) return null;
      row.external_ref = parse(row.external_ref_json, null); delete row.external_ref_json;
      row.duration_ms = row.duration_ms == null ? null : Number(row.duration_ms);
      row.size_bytes = row.size_bytes == null ? null : Number(row.size_bytes);
      return row;
    }
    async function listTracks(packageId) {
      var rows = await q('SELECT * FROM studio_caption_tracks WHERE package_id=? ORDER BY role,created_at', [String(packageId)]);
      return rows.map(trackRow);
    }

    async function packageResult(packageId) {
      var tracks = await q('SELECT track_id, role, current_revision_id FROM studio_caption_tracks WHERE package_id = ? ORDER BY role', [packageId]);
      var raw = tracks.find(function (t) { return t.role === 'raw_original'; });
      var corrected = tracks.find(function (t) { return t.role === 'user_corrected'; });
      return { package_id: packageId, raw_track_id: raw && raw.track_id, corrected_track_id: corrected && corrected.track_id, raw_revision_id: raw && raw.current_revision_id, corrected_revision_id: corrected && corrected.current_revision_id };
    }

    async function createPackage(input) {
      input = input || {}; var media = input.media || {}, raw = input.raw_revision;
      if (!raw || raw.role !== 'raw_original' || !Array.isArray(raw.segments)) throw createError('RAW_REVISION_REQUIRED');
      var sha = cleanHash(media.sha256), packageId = sha ? 'mpkg:' + sha : 'mpkg:unbound:' + raw.track_fingerprint;
      var existing = await one('SELECT package_id FROM studio_media_packages WHERE package_id = ? AND deleted_at IS NULL LIMIT 1', [packageId]);
      if (existing) return packageResult(existing.package_id);
      var rawTrackId = 'track:raw:' + raw.track_fingerprint;
      var correctedTrackId = 'track:corrected:' + raw.track_fingerprint;
      var correctedSegments = Core.createCorrectedDraft(raw.segments, { id_factory: (function () { var n = 0; return function () { return 'cseg:' + raw.track_fingerprint.slice(0, 20) + ':' + n++; }; })() });
      var correctedHash = await Core.revisionHash('user_corrected', correctedSegments, []);
      var rawRevisionId = 'rev:' + raw.canonical_sha256;
      var correctedRevisionId = 'rev:' + correctedHash;
      var ts = now();
      return transaction(async function () {
        await r(`INSERT INTO studio_media_packages
          (package_id,media_sha256,mime,duration_ms,original_name,opfs_path,size_bytes,external_ref_json,created_at,updated_at,deleted_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`, [packageId, sha, media.mime || null, media.duration_ms == null ? null : Math.round(Number(media.duration_ms)), media.original_name || null, media.opfs_path || null, media.size_bytes == null ? null : Number(media.size_bytes), json(media.external_ref || null), ts, ts]);
        inject(input.fault_inject, 'after_package');
        await r(`INSERT INTO studio_caption_tracks
          (track_id,package_id,role,language,parent_track_id,current_revision_id,draft_base_revision_id,draft_json,draft_updated_at,created_at,updated_at)
          VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,?,?)`, [rawTrackId, packageId, 'raw_original', input.language || 'he', null, ts, ts]);
        await r(`INSERT INTO studio_caption_revisions
          (revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
          VALUES (?,?,NULL,1,?,?,?,?,?,?)`, [rawRevisionId, rawTrackId, json(raw.segments), json([]), raw.canonical_sha256, input.raw_author_kind || (raw.provenance && raw.provenance.provider ? 'provider' : 'import'), json(raw.provenance || {}), ts]);
        await r('UPDATE studio_caption_tracks SET current_revision_id = ?, updated_at = ? WHERE track_id = ?', [rawRevisionId, ts, rawTrackId]);
        inject(input.fault_inject, 'after_raw_revision');
        await r(`INSERT INTO studio_caption_tracks
          (track_id,package_id,role,language,parent_track_id,current_revision_id,draft_base_revision_id,draft_json,draft_updated_at,created_at,updated_at)
          VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,?,?)`, [correctedTrackId, packageId, 'user_corrected', input.language || 'he', rawTrackId, ts, ts]);
        await r(`INSERT INTO studio_caption_revisions
          (revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
          VALUES (?,?,?,1,?,?,?,?,?,?)`, [correctedRevisionId, correctedTrackId, rawRevisionId, json(correctedSegments), json([]), correctedHash, 'import', json({ copied_from_raw_revision_id: rawRevisionId }), ts]);
        await r('UPDATE studio_caption_tracks SET current_revision_id = ?, updated_at = ? WHERE track_id = ?', [correctedRevisionId, ts, correctedTrackId]);
        inject(input.fault_inject, 'after_corrected_revision'); inject(input.fault_inject, 'before_commit');
        return { package_id: packageId, raw_track_id: rawTrackId, corrected_track_id: correctedTrackId, raw_revision_id: rawRevisionId, corrected_revision_id: correctedRevisionId };
      });
    }

    async function saveDraft(trackId, baseRevisionId, segments, operations) {
      var track = await getTrack(trackId);
      if (!track) throw createError('TRACK_NOT_FOUND');
      if (track.role !== 'user_corrected') throw createError('RAW_IMMUTABLE');
      Core.validateSegments(segments);
      var draft = { schema: 'studio-caption-draft-v1', base_revision_id: String(baseRevisionId), segments: segments, operations: operations || [] };
      var ts = now();
      await r('UPDATE studio_caption_tracks SET draft_base_revision_id=?,draft_json=?,draft_updated_at=?,updated_at=? WHERE track_id=?', [String(baseRevisionId), json(draft), ts, ts, String(trackId)]);
      return draft;
    }
    async function discardDraft(trackId) {
      var track = await getTrack(trackId);
      if (!track) throw createError('TRACK_NOT_FOUND');
      if (track.role !== 'user_corrected') throw createError('RAW_IMMUTABLE');
      await r('UPDATE studio_caption_tracks SET draft_base_revision_id=NULL,draft_json=NULL,draft_updated_at=NULL,updated_at=? WHERE track_id=?', [now(), String(trackId)]);
      return { discarded: true, track_id: String(trackId) };
    }
    async function commitDraft(trackId, options) {
      options = options || {}; var track = await getTrack(trackId);
      if (!track) throw createError('TRACK_NOT_FOUND');
      if (track.role !== 'user_corrected') throw createError('RAW_IMMUTABLE');
      if (!track.draft) throw createError('DRAFT_NOT_FOUND');
      if (track.draft_base_revision_id !== track.current_revision_id) throw createError('DRAFT_BASE_STALE');
      Core.validateSegments(track.draft.segments);
      var current = await getRevision(track.current_revision_id);
      var revisionNo = current.revision_no + 1;
      var hash = await Core.revisionHash('user_corrected', track.draft.segments, track.draft.operations || []);
      var revisionId = 'rev:' + hash; var ts = now();
      return transaction(async function () {
        await r(`INSERT INTO studio_caption_revisions
          (revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [revisionId, track.track_id, current.revision_id, revisionNo, json(track.draft.segments), json(track.draft.operations || []), hash, options.author_kind || 'user', json(options.provenance || {}), ts]);
        inject(options.fault_inject, 'after_revision_insert');
        await r(`UPDATE studio_caption_tracks SET current_revision_id=?,draft_base_revision_id=NULL,draft_json=NULL,
          draft_updated_at=NULL,updated_at=? WHERE track_id=?`, [revisionId, ts, track.track_id]);
        inject(options.fault_inject, 'after_pointer_update'); inject(options.fault_inject, 'before_commit');
        return { revision_id: revisionId, track_id: track.track_id, parent_revision_id: current.revision_id, revision_no: revisionNo, segments: clone(track.draft.segments), operations: clone(track.draft.operations || []), canonical_sha256: hash, author_kind: options.author_kind || 'user', provenance: options.provenance || {}, created_at: ts };
      });
    }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }

    async function bindText(binding) {
      binding = binding || {};
      var revision = await getRevision(binding.revision_id), track = await getTrack(binding.track_id);
      if (!revision || !track || revision.track_id !== track.track_id || track.package_id !== binding.package_id) throw createError('BINDING_TARGET_MISMATCH');
      if (revision.canonical_sha256 !== binding.revision_sha256) throw createError('BINDING_HASH_MISMATCH');
      // F1 (packet 2026-08-06): тройка package↔track↔revision выше может быть безупречно
      // согласованной И ПРИ ЭТОМ описывать ЧУЖОЕ медиа — живой инцидент: 561 строка с провенансом
      // одного видео была привязана к пакету другого, потому что package_id приходил из ambient
      // window.v3LastMediaPackageRef. Строки несут независимый сигнал в той же транзакции; здесь он
      // и становится решающим (R11: источник-истины > самоотчёт вызывающего).
      var mapping = binding.mapping || null;
      if (mapping) {
        var declared = typeof Core.mediaShaSetFromMapping === 'function' ? Core.mediaShaSetFromMapping(mapping) : [];
        var pkg = await getPackage(binding.package_id);
        var actual = pkg && pkg.media_sha256 ? String(pkg.media_sha256).toLowerCase() : null;
        // Пустое множество — «строки ничего не утверждают» (legacy/caption-only): не судим, но и не
        // выдаём за проверенное. Непустое и несовпавшее — отказ без единой записи.
        if (declared.length && (declared.length > 1 || !actual || declared[0] !== actual)) {
          throw createError('BINDING_PROVENANCE_MISMATCH', declared.join(',') + ' vs ' + (actual || 'none'));
        }
        mapping = Object.assign({}, mapping, { provenance_checked: declared.length > 0 });
      }
      var ts = now();
      await r(`INSERT INTO studio_text_media_bindings
        (text_id,package_id,track_id,revision_id,revision_sha256,mapping_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(text_id) DO UPDATE SET package_id=excluded.package_id,track_id=excluded.track_id,
          revision_id=excluded.revision_id,revision_sha256=excluded.revision_sha256,mapping_json=excluded.mapping_json,updated_at=excluded.updated_at`,
        [String(binding.text_id), binding.package_id, binding.track_id, binding.revision_id, binding.revision_sha256, json(mapping), ts, ts]);
      return getTextBinding(binding.text_id);
    }
    // F1: пакет по идентичности медиа. Нужен, потому что package_id НЕ всегда 'mpkg:'+sha —
    // портированные пакеты приходят как 'mpkg:portable:<root>', и вывести sha из имени нельзя.
    async function findPackageByMediaSha(sha) {
      var clean = String(sha || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(clean)) return null;
      var row = await one('SELECT package_id FROM studio_media_packages WHERE media_sha256=? AND deleted_at IS NULL ORDER BY created_at LIMIT 1', [clean]);
      return row ? getPackage(row.package_id) : null;
    }
    async function getTextBinding(textId) {
      var row = await one('SELECT * FROM studio_text_media_bindings WHERE text_id = ? LIMIT 1', [String(textId)]);
      if (row) row.mapping = parse(row.mapping_json, null);
      return row;
    }
    async function isTextBindingStale(textId) {
      var row = await one(`SELECT b.revision_id AS bound_revision_id,b.revision_sha256,t.current_revision_id,
        r.canonical_sha256 AS current_sha256 FROM studio_text_media_bindings b
        JOIN studio_caption_tracks t ON t.track_id=b.track_id
        LEFT JOIN studio_caption_revisions r ON r.revision_id=t.current_revision_id
        WHERE b.text_id=? LIMIT 1`, [String(textId)]);
      if (!row) return { bound: false, stale: false };
      return { bound: true, stale: row.bound_revision_id !== row.current_revision_id || row.revision_sha256 !== row.current_sha256, bound_revision_id: row.bound_revision_id, current_revision_id: row.current_revision_id };
    }

    async function previewDeletePackage(packageId) {
      var pkg = await getPackage(packageId); if (!pkg) throw createError('PACKAGE_NOT_FOUND');
      var counts = await one(`SELECT
        (SELECT COUNT(*) FROM studio_caption_tracks WHERE package_id=?) AS tracks,
        (SELECT COUNT(*) FROM studio_caption_revisions r JOIN studio_caption_tracks t ON t.track_id=r.track_id WHERE t.package_id=?) AS revisions,
        (SELECT COUNT(*) FROM studio_text_media_bindings WHERE package_id=?) AS bindings`, [packageId, packageId, packageId]);
      var materialTable = await one("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_learning_materials' LIMIT 1");
      var materialRows = materialTable ? await q(`SELECT material_id,text_id,portable_text_key
        FROM studio_learning_materials WHERE package_id=? ORDER BY material_id`, [packageId]) : [];
      var materials = materialRows.map(function (row) {
        return { material_id: row.material_id, text_id: row.text_id,
          name: row.portable_text_key || row.text_id || row.material_id };
      });
      return {
        package_id: String(packageId), package_name: pkg.original_name || pkg.package_id,
        media_sha256: pkg.media_sha256 || null, opfs_path: pkg.opfs_path || null,
        tracks_destroyed: Number(counts.tracks || 0),
        caption_revisions_destroyed: Number(counts.revisions || 0),
        bindings_destroyed: Number(counts.bindings || 0),
        materials_losing_source_count: materials.length, materials_losing_source: materials,
        caption_revisions_are_only_timing_copy: true,
        reimport_same_sha_restores_identity: !!pkg.media_sha256,
      };
    }

    async function deletePackage(packageId, options) {
      options = options || {}; if (!options.confirm) throw createError('DELETE_CONFIRM_REQUIRED');
      var preview = await previewDeletePackage(packageId);
      await transaction(async function () { await r('DELETE FROM studio_media_packages WHERE package_id=?', [packageId]); });
      var remaining = preview.media_sha256 ? await one('SELECT COUNT(*) AS n FROM studio_media_packages WHERE media_sha256=? AND deleted_at IS NULL', [preview.media_sha256]) : { n: 0 };
      return { package_id: packageId, packages_removed: 1, tracks_removed: preview.tracks_destroyed,
        revisions_removed: preview.caption_revisions_destroyed, bindings_removed: preview.bindings_destroyed,
        materials_orphaned: preview.materials_losing_source_count, media_sha256: preview.media_sha256,
        opfs_path: preview.opfs_path, remaining_media_references: Number(remaining.n || 0),
        media_blob_action: Number(remaining.n || 0) ? 'retained' : 'eligible_for_gc',
        preview: preview, errors: [] };
    }

    async function relinkMedia(packageId, media) {
      var pkg = await getPackage(packageId); if (!pkg) throw createError('PACKAGE_NOT_FOUND');
      var actual = cleanHash(media && media.sha256);
      if (!pkg.media_sha256 || actual !== pkg.media_sha256) throw createError('MEDIA_SHA_MISMATCH');
      await r('UPDATE studio_media_packages SET mime=?,opfs_path=?,size_bytes=?,original_name=?,updated_at=? WHERE package_id=?', [media.mime || pkg.mime, media.opfs_path || pkg.opfs_path, media.size_bytes == null ? pkg.size_bytes : Number(media.size_bytes), media.original_name || pkg.original_name, now(), packageId]);
      return getPackage(packageId);
    }

    async function importSnapshot(snapshot) {
      var pkg = snapshot && snapshot.package;
      if (!pkg || !pkg.package_id || !snapshot.raw_track || !snapshot.raw_revision || !snapshot.corrected_track || !snapshot.corrected_revision) throw createError('PACKAGE_SNAPSHOT_INVALID');
      var existing = await getPackage(pkg.package_id);
      if (existing) {
        var eraw = await getRevision(snapshot.raw_revision.revision_id), ecorr = await getRevision(snapshot.corrected_revision.revision_id);
        if (eraw && ecorr && eraw.canonical_sha256 === snapshot.raw_revision.canonical_sha256 && ecorr.canonical_sha256 === snapshot.corrected_revision.canonical_sha256) return { imported: false, duplicate: true, package_id: pkg.package_id, corrected_track_id: snapshot.corrected_track.track_id };
        throw createError('PACKAGE_ID_CONFLICT');
      }
      var ts = now();
      return transaction(async function () {
        await r(`INSERT INTO studio_media_packages(package_id,media_sha256,mime,duration_ms,original_name,opfs_path,size_bytes,external_ref_json,created_at,updated_at,deleted_at)
          VALUES(?,?,?,?,?,NULL,?,?,?, ?,NULL)`, [pkg.package_id, cleanHash(pkg.media_sha256), pkg.mime || null, pkg.duration_ms == null ? null : Number(pkg.duration_ms), pkg.original_name || null, pkg.size_bytes == null ? null : Number(pkg.size_bytes), json(pkg.external_ref || null), pkg.created_at || ts, ts]);
        for (var pair of [[snapshot.raw_track, snapshot.raw_revision], [snapshot.corrected_track, snapshot.corrected_revision]]) {
          var track = pair[0], revision = pair[1];
          await r(`INSERT INTO studio_caption_tracks(track_id,package_id,role,language,parent_track_id,current_revision_id,draft_base_revision_id,draft_json,draft_updated_at,created_at,updated_at)
            VALUES(?,?,?,?,?,?,NULL,NULL,NULL,?,?)`, [track.track_id, pkg.package_id, track.role, track.language || null, track.parent_track_id || null, revision.revision_id, track.created_at || ts, ts]);
          await r(`INSERT INTO studio_caption_revisions(revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`, [revision.revision_id, track.track_id, revision.parent_revision_id || null, Number(revision.revision_no), json(revision.segments), json(revision.operations || []), revision.canonical_sha256, revision.author_kind, json(revision.provenance || {}), revision.created_at || ts]);
        }
        return { imported: true, duplicate: false, package_id: pkg.package_id, corrected_track_id: snapshot.corrected_track.track_id };
      });
    }

    return { createPackage: createPackage, getPackage: getPackage, listTracks: listTracks, getTrack: getTrack, getRevision: getRevision, getCurrentRevision: getCurrentRevision, getWorkspace: getWorkspace, listWorkspaces: listWorkspaces, saveDraft: saveDraft, discardDraft: discardDraft, commitDraft: commitDraft, bindText: bindText, getTextBinding: getTextBinding, findPackageByMediaSha: findPackageByMediaSha, isTextBindingStale: isTextBindingStale, previewDeletePackage: previewDeletePackage, deletePackage: deletePackage, relinkMedia: relinkMedia, importSnapshot: importSnapshot };
  }

  var API = { createRepository: createRepository };
  if (typeof window !== 'undefined') window.MediaPackageRepository = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
