// Studio Ingest P2 — transactional browser-local Portable Learning Package repository.
// Adapter contract: dbQuery(sql, params), dbRun(sql, params), execRaw(sql).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortableLearningPackageRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function failure(code, detail) { const error = new Error(code + (detail ? ':' + detail : '')); error.code = code; return error; }
  function parse(value, fallback) { if (value == null || value === '') return fallback; if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function json(value) { return JSON.stringify(value == null ? null : value); }
  function timestamp() { return new Date().toISOString(); }
  function shortHash(id) { const match = /([a-f0-9]{64})$/.exec(String(id || '')); if (!match) throw failure('PORTABLE_ID_INVALID', id); return match[1]; }

  function createRepository(adapter, Core, ImportCenterCore) {
    if (!adapter || !adapter.dbQuery || !adapter.dbRun || !adapter.execRaw) throw failure('REPOSITORY_ADAPTER_REQUIRED');
    if (!Core || !Core.dryRun || !Core.hashObject) throw failure('PORTABLE_CORE_REQUIRED');
    const q = (sql, params) => adapter.dbQuery(sql, params || []);
    const r = (sql, params) => adapter.dbRun(sql, params || []);
    const x = (sql) => adapter.execRaw(sql);
    const one = async (sql, params) => (await q(sql, params))[0] || null;
    const inject = (actual, expected) => { if (actual === expected) throw failure('FAULT_INJECT', expected); };
    const importCore = ImportCenterCore || (typeof globalThis !== 'undefined' && globalThis.ImportCenterCore) || null;

    async function getReceiptByRoot(packageId, root) {
      const row = await one(`SELECT * FROM studio_portable_import_receipts
        WHERE portable_package_id=? AND content_root_sha256=? ORDER BY created_at DESC LIMIT 1`, [packageId, root]);
      if (!row) return null;
      return { ...row, counts: parse(row.counts_json, {}), id_map: parse(row.id_map_json, {}), rollback: parse(row.rollback_json, {}), missing_media: parse(row.missing_media_json, []) };
    }
    async function getReceipt(receiptId) {
      const row=await one('SELECT * FROM studio_portable_import_receipts WHERE receipt_id=?',[receiptId]);
      return row&&{...row,counts:parse(row.counts_json,{}),id_map:parse(row.id_map_json,{}),rollback:parse(row.rollback_json,{}),missing_media:parse(row.missing_media_json,[])};
    }

    async function inventory() {
      const nodes = {}, texts = {}, media = [];
      const receipts = await q("SELECT id_map_json FROM studio_portable_import_receipts WHERE status='committed'");
      for (const receipt of receipts) {
        const map = parse(receipt.id_map_json, {});
        for (const [id, value] of Object.entries(map.nodes || {})) {
          if (nodes[id] && nodes[id].canonical_hash !== value.canonical_hash) throw failure('LOCAL_PORTABLE_ID_CONFLICT', id);
          nodes[id] = { canonical_hash: value.canonical_hash, local_id: value.local_id };
        }
      }
      for (const row of await q(`SELECT t.text_key,m.current_table_revision_id,r.id_map_json
        FROM texts t LEFT JOIN studio_learning_materials m ON m.text_id=t.id
        LEFT JOIN studio_portable_import_receipts r ON r.status='committed'
          AND json_extract(r.id_map_json,'$.text.local_id')=t.id`)) {
        const map = parse(row.id_map_json, {});
        texts[row.text_key] = { local_id: map.text && map.text.local_id, table_revision_id: map.selected_table_portable_id || null };
      }
      for (const row of await q("SELECT DISTINCT media_sha256 FROM studio_media_packages WHERE media_sha256 IS NOT NULL AND opfs_path IS NOT NULL AND deleted_at IS NULL")) media.push(String(row.media_sha256).toLowerCase());
      return { nodes, texts, media_sha256: media };
    }

    function uniqueSorted(values) { return Array.from(new Set(values.filter(Boolean))).sort(); }

    async function inspectReceiptClosure(receipt, verified) {
      if (!receipt) return { state: 'new', missing: [], conflicts: [], requires_source_package: false, archived: false };
      if (receipt.status !== 'committed') return { state: 'rolled_back', missing: [], conflicts: [], requires_source_package: false, archived: false, receipt_id: receipt.receipt_id };
      const map = receipt.id_map || {}, missing = [], conflicts = [], expected = verified && verified.payload;
      const textId = map.text && map.text.local_id, materialId = map.material && map.material.local_id,
        packageId = map.media_package && map.media_package.local_id;
      const text = textId ? await one('SELECT id,text_key,is_archived FROM texts WHERE id=?', [textId]) : null;
      const material = materialId ? await one('SELECT material_id,text_id,portable_text_key,current_table_revision_id,package_id FROM studio_learning_materials WHERE material_id=?', [materialId]) : null;
      const media = packageId ? await one('SELECT package_id,media_sha256,deleted_at FROM studio_media_packages WHERE package_id=?', [packageId]) : null;
      const binding = textId ? await one('SELECT text_id,package_id,track_id,revision_id,revision_sha256 FROM studio_text_media_bindings WHERE text_id=?', [textId]) : null;
      if (!text) missing.push('text');
      if (!material) missing.push('material');
      if (!media || media.deleted_at) missing.push('media_package');
      if (!binding) missing.push('text_media_binding');
      if (binding) {
        const target = await one(`SELECT r.track_id AS revision_track_id,r.canonical_sha256,t.package_id AS revision_package_id,t.role AS revision_track_role
          FROM studio_caption_revisions r JOIN studio_caption_tracks t ON t.track_id=r.track_id
          WHERE r.revision_id=?`, [binding.revision_id]);
        if (!target) missing.push('caption_revisions');
        else if (String(target.canonical_sha256 || '') !== String(binding.revision_sha256 || '')) conflicts.push({ code: 'TEXT_MEDIA_BINDING_HASH_CONFLICT', id: textId });
        else if (String(target.revision_package_id || '') !== String(binding.package_id || '') || target.revision_track_role !== 'user_corrected') conflicts.push({ code: 'TEXT_MEDIA_BINDING_PACKAGE_CONFLICT', id: textId });
        else if (String(target.revision_track_id) !== String(binding.track_id)) missing.push('text_media_binding_target');
      }
      if (text && expected && String(text.text_key || '') !== String(expected.material.portable_text_key || '')) conflicts.push({ code: 'TEXT_KEY_CONTENT_CONFLICT', id: textId });
      if (material && (String(material.text_id) !== String(textId) || String(material.portable_text_key || '') !== String(expected ? expected.material.portable_text_key : material.portable_text_key || ''))) conflicts.push({ code: 'LEARNING_MATERIAL_ID_CONFLICT', id: materialId });
      if (media && expected && String(media.media_sha256 || '') !== String(verified.manifest.media.sha256 || '')) conflicts.push({ code: 'MEDIA_PACKAGE_ID_CONFLICT', id: packageId });

      if (expected) {
        const tableIds = map.table_revisions || {}, revisionIds = map.caption_revisions || {}, rowIds = map.rows || {};
        for (const doc of expected.caption_revisions || []) {
          const id = revisionIds[doc.portable_revision_id], row = id ? await one('SELECT canonical_sha256 FROM studio_caption_revisions WHERE revision_id=?', [id]) : null;
          if (!row) missing.push('caption_revisions');
          else if (String(row.canonical_sha256) !== String(doc.revision.canonical_sha256)) conflicts.push({ code: 'CAPTION_REVISION_ID_CONFLICT', id });
        }
        for (const doc of expected.table_revisions || []) {
          const id = tableIds[doc.portable_table_revision_id], row = id ? await one('SELECT content_sha256 FROM studio_table_revisions WHERE table_revision_id=?', [id]) : null;
          if (!row) missing.push('table_revisions');
          else {
            if (String(row.content_sha256) !== String(doc.content_sha256)) conflicts.push({ code: 'TABLE_REVISION_ID_CONFLICT', id });
            const linked = await one('SELECT COUNT(*) AS n FROM studio_table_revision_rows WHERE table_revision_id=?', [id]);
            if (Number(linked && linked.n || 0) !== (doc.rows || []).length) conflicts.push({ code: 'TABLE_REVISION_ROWS_INCOMPLETE', id });
          }
        }
        const selected = expected.table_revisions.find((item) => item.portable_table_revision_id === verified.manifest.roots.table_revision);
        if (text && selected) {
          for (const row of selected.rows || []) {
            const sentenceId = rowIds[row.portable_row_id], local = sentenceId ? await one('SELECT he_plain,he_niqqud,translit,translit_ru,ru FROM sentences WHERE id=? AND text_id=?', [sentenceId, textId]) : null;
            if (!local) missing.push('projection_rows');
            else if (String(local.he_plain || '') !== String(row.he_plain || '') || String(local.he_niqqud || '') !== String(row.he_niqqud || '') || String(local.translit || '') !== String(row.translit || '') || String(local.translit_ru || '') !== String(row.translit_ru || '') || String(local.ru || '') !== String(row.ru || '')) conflicts.push({ code: 'TEXT_KEY_CONTENT_CONFLICT', id: sentenceId });
          }
        }
        const expectedTrack = map.nodes && map.nodes[expected.corrected_track.portable_track_id] && map.nodes[expected.corrected_track.portable_track_id].local_id;
        const expectedRevision = revisionIds[verified.manifest.roots.caption_revision];
        if (binding && (String(binding.package_id) !== String(packageId) || String(binding.track_id) !== String(expectedTrack) || String(binding.revision_id) !== String(expectedRevision))) conflicts.push({ code: 'TEXT_MEDIA_BINDING_CONFLICT', id: textId });
      } else {
        const tableIds = Object.values(map.table_revisions || {}), revisionIds = Object.values(map.caption_revisions || {});
        if (tableIds.length) {
          const found = await one(`SELECT COUNT(*) AS n FROM studio_table_revisions WHERE table_revision_id IN (${tableIds.map(() => '?').join(',')})`, tableIds);
          if (Number(found && found.n || 0) !== tableIds.length) missing.push('table_revisions');
        }
        if (revisionIds.length) {
          const found = await one(`SELECT COUNT(*) AS n FROM studio_caption_revisions WHERE revision_id IN (${revisionIds.map(() => '?').join(',')})`, revisionIds);
          if (Number(found && found.n || 0) !== revisionIds.length) missing.push('caption_revisions');
        }
        const selectedRows = Object.values(map.rows || {});
        if (text && selectedRows.length) {
          const found = await one(`SELECT COUNT(*) AS n FROM sentences WHERE text_id=? AND id IN (${selectedRows.map(() => '?').join(',')})`, [textId, ...selectedRows]);
          if (Number(found && found.n || 0) !== selectedRows.length) missing.push('projection_rows');
        }
      }
      const cleanMissing = uniqueSorted(missing), cleanConflicts = conflicts.sort((a, b) => String(a.code + a.id).localeCompare(String(b.code + b.id)));
      const archived = !!(text && Number(text.is_archived));
      return {
        state: cleanConflicts.length ? 'conflict' : cleanMissing.length ? 'repairable' : archived ? 'archived' : 'complete',
        missing: cleanMissing, conflicts: cleanConflicts, archived,
        requires_source_package: cleanMissing.some((item) => item !== 'text_media_binding_target'),
        receipt_id: receipt.receipt_id,
      };
    }

    async function receiptIntegrity(receiptId) {
      const receipt = typeof receiptId === 'string' ? await getReceipt(receiptId) : receiptId;
      if (!receipt) throw failure('RECEIPT_NOT_FOUND');
      return inspectReceiptClosure(receipt, null);
    }

    async function dryRun(verified) {
      const base = await Core.dryRun(verified, await inventory());
      const receipt = await getReceiptByRoot(verified.manifest.portable_package_id, verified.manifest.content_root_sha256);
      const recovery = await inspectReceiptClosure(receipt, verified);
      const conflicts = [...base.conflicts, ...recovery.conflicts];
      const planBase = { ...base, conflicts, recovery, estimated: { ...base.estimated, repair_count: recovery.missing.length } };
      delete planBase.plan_sha256; delete planBase.can_apply;
      return { ...planBase, plan_sha256: await Core.hashObject(planBase), can_apply: conflicts.length === 0 };
    }

    async function assertReusable(table, idColumn, id, hashColumn, expectedHash, conflictCode) {
      const row = await one(`SELECT ${hashColumn} AS hash FROM ${table} WHERE ${idColumn}=?`, [id]);
      if (row && String(row.hash) !== String(expectedHash)) throw failure(conflictCode || 'PORTABLE_ID_HASH_CONFLICT', id);
      return !!row;
    }

    async function applyVerified(verified, options) {
      options = options || {};
      if (!verified || !verified.manifest || !verified.payload) throw failure('VERIFIED_PACKAGE_REQUIRED');
      const currentPlan = await dryRun(verified);
      if (!options.plan_sha256 || options.plan_sha256 !== currentPlan.plan_sha256) throw failure('IMPORT_PLAN_STALE');
      if (!currentPlan.can_apply) throw failure('IMPORT_PLAN_BLOCKED', currentPlan.conflicts[0] && currentPlan.conflicts[0].code);
      const previous = await getReceiptByRoot(verified.manifest.portable_package_id, verified.manifest.content_root_sha256);
      const recovery = currentPlan.recovery || { state: previous && previous.status === 'committed' ? 'complete' : 'new' };
      if (previous && previous.status === 'committed' && recovery.state === 'complete') return { imported: false, repaired: false, duplicate: true, receipt: previous };
      const repairing = !!(previous && previous.status === 'committed' && ['repairable','archived'].includes(recovery.state));

      const p = verified.payload, manifest = verified.manifest, ts = timestamp();
      const derivedPackageId = 'mpkg:portable:' + shortHash(manifest.roots.media_package);
      const packageById = await one('SELECT * FROM studio_media_packages WHERE package_id=?', [derivedPackageId]);
      if (packageById && String(packageById.media_sha256 || '') !== String(manifest.media.sha256 || '')) throw failure('MEDIA_PACKAGE_ID_CONFLICT');
      const packageBySha = manifest.media.sha256 ? await one('SELECT * FROM studio_media_packages WHERE media_sha256=? AND deleted_at IS NULL', [manifest.media.sha256]) : null;
      const previousMap = previous && previous.id_map || {}, previousPackageId = previousMap.media_package && previousMap.media_package.local_id;
      const previousPackage = previousPackageId ? await one('SELECT package_id FROM studio_media_packages WHERE package_id=? AND deleted_at IS NULL', [previousPackageId]) : null;
      const packageId = previousPackage ? String(previousPackage.package_id) : packageById ? derivedPackageId : packageBySha ? String(packageBySha.package_id) : previousPackageId || derivedPackageId;
      const previousNodes = previousMap.nodes || {};
      const trackIds = {
        [p.raw_track.portable_track_id]: previousNodes[p.raw_track.portable_track_id] && previousNodes[p.raw_track.portable_track_id].local_id || 'track:portable:' + shortHash(p.raw_track.portable_track_id),
        [p.corrected_track.portable_track_id]: previousNodes[p.corrected_track.portable_track_id] && previousNodes[p.corrected_track.portable_track_id].local_id || 'track:portable:' + shortHash(p.corrected_track.portable_track_id),
      };
      const revisionIds = {}, tableIds = {}, rowIds = {};
      for (const doc of p.caption_revisions) revisionIds[doc.portable_revision_id] = previousMap.caption_revisions && previousMap.caption_revisions[doc.portable_revision_id] || 'rev:' + shortHash(doc.portable_revision_id);
      for (const doc of p.table_revisions) tableIds[doc.portable_table_revision_id] = previousMap.table_revisions && previousMap.table_revisions[doc.portable_table_revision_id] || 'table-portable:' + shortHash(doc.portable_table_revision_id);
      for (const doc of p.table_revisions) for (const row of doc.rows || []) if (!rowIds[row.portable_row_id]) rowIds[row.portable_row_id] = previousMap.rows && previousMap.rows[row.portable_row_id] || 'sentence-portable:' + shortHash(row.portable_row_id);
      const materialId = previousMap.material && previousMap.material.local_id || 'material-portable:' + shortHash(manifest.roots.learning_material);
      const textId = previousMap.text && previousMap.text.local_id || 'text-portable:' + shortHash(manifest.roots.learning_material);
      const selectedTableId = tableIds[manifest.roots.table_revision];
      const selectedRevisionId = revisionIds[manifest.roots.caption_revision];
      if (!selectedTableId || !selectedRevisionId) throw failure('PACKAGE_ROOT_LOCAL_MAP_MISSING');
      const selectedTable = p.table_revisions.find((item) => item.portable_table_revision_id === manifest.roots.table_revision);
      const artifactById = new Map((verified.graph.artifacts || []).map((node) => [node.id, node]));
      for (const track of [p.raw_track, p.corrected_track]) {
        const candidates = [];
        for (const doc of p.caption_revisions) {
          const artifact = artifactById.get(doc.portable_revision_id), role = artifact && artifact.metadata && artifact.metadata.role;
          if (role !== track.role) continue;
          const existingRevision = await one(`SELECT r.track_id,r.canonical_sha256,t.package_id,t.role,t.language
            FROM studio_caption_revisions r JOIN studio_caption_tracks t ON t.track_id=r.track_id WHERE r.revision_id=?`, [revisionIds[doc.portable_revision_id]]);
          if (!existingRevision) continue;
          if (String(existingRevision.canonical_sha256 || '') !== String(doc.revision.canonical_sha256 || '')) throw failure('CAPTION_REVISION_ID_CONFLICT', revisionIds[doc.portable_revision_id]);
          if (String(existingRevision.package_id || '') !== String(packageId) || existingRevision.role !== track.role || String(existingRevision.language || '') !== String(track.language || '')) throw failure('CAPTION_REVISION_TRACK_CONFLICT', revisionIds[doc.portable_revision_id]);
          candidates.push(String(existingRevision.track_id));
        }
        const reusableTracks = uniqueSorted(candidates);
        if (reusableTracks.length > 1) throw failure('CAPTION_REVISION_TRACK_CONFLICT', track.portable_track_id);
        if (reusableTracks.length === 1) trackIds[track.portable_track_id] = reusableTracks[0];
      }
      const nodeMap = {};
      for (const node of verified.graph.artifacts) nodeMap[node.id] = { canonical_hash: node.canonical_hash, local_id: node.type === 'learning_material' ? materialId : node.type === 'table_revision' ? tableIds[node.id] : node.type === 'learning_row_version' ? rowIds[node.id] : node.type === 'caption_revision' ? revisionIds[node.id] : node.type === 'caption_track' ? trackIds[node.id] : node.type === 'media_package' ? packageId : null };
      const beforeMaterial = await one('SELECT material_id,current_table_revision_id,text_id FROM studio_learning_materials WHERE portable_text_key=?', [p.material.portable_text_key]);
      const beforeBinding = beforeMaterial ? await one('SELECT * FROM studio_text_media_bindings WHERE text_id=?', [beforeMaterial.text_id]) : null;
      const created = { package: false, tracks: [], caption_revisions: [], text: false, material: false, table_revisions: [], row_versions: [] }, removedLegacyTracks = [];

      await x('SAVEPOINT p2_portable_import;');
      try {
        const existingPackage = await one('SELECT package_id,media_sha256 FROM studio_media_packages WHERE package_id=?', [packageId]);
        if (existingPackage && String(existingPackage.media_sha256 || '') !== String(manifest.media.sha256 || '')) throw failure('MEDIA_PACKAGE_ID_CONFLICT');
        if (!existingPackage) {
          await r(`INSERT INTO studio_media_packages(package_id,media_sha256,mime,duration_ms,original_name,opfs_path,size_bytes,external_ref_json,created_at,updated_at,deleted_at)
            VALUES(?,?,?,?,?,NULL,?,?,?, ?,NULL)`, [packageId, manifest.media.sha256 || null, manifest.media.mime || null, manifest.media.duration_ms == null ? null : manifest.media.duration_ms, p.media_ref.original_name || null, manifest.media.size_bytes == null ? null : manifest.media.size_bytes, json({ schema: 'portable-media-ref-v2', missing_media: !!manifest.media.sha256 }), ts, ts]);
          created.package = true;
        }
        inject(options.fault_inject, 'after_package');

        for (const track of [p.raw_track, p.corrected_track]) {
          const localTrack = trackIds[track.portable_track_id], existing = await one('SELECT role,language FROM studio_caption_tracks WHERE track_id=?', [localTrack]);
          if (existing && (existing.role !== track.role || String(existing.language || '') !== String(track.language || ''))) throw failure('CAPTION_TRACK_ID_CONFLICT');
          if (!existing) {
            await r(`INSERT INTO studio_caption_tracks(track_id,package_id,role,language,parent_track_id,current_revision_id,draft_base_revision_id,draft_json,draft_updated_at,created_at,updated_at)
              VALUES(?,?,?,?,?,NULL,NULL,NULL,NULL,?,?)`, [localTrack, packageId, track.role, track.language || null, track.parent_track_id ? trackIds[track.parent_track_id] : null, ts, ts]);
            created.tracks.push(localTrack);
          }
        }
        inject(options.fault_inject, 'after_tracks');

        const orderedCaptions = p.caption_revisions.slice().sort((a, b) => Number(a.revision.revision_no) - Number(b.revision.revision_no));
        for (const doc of orderedCaptions) {
          const revision = doc.revision, localId = revisionIds[doc.portable_revision_id];
          const role = (artifactById.get(doc.portable_revision_id) || { metadata: {} }).metadata.role;
          const track = role === 'raw_original' ? p.raw_track : p.corrected_track;
          const existingRevision = await one('SELECT track_id,canonical_sha256 FROM studio_caption_revisions WHERE revision_id=?', [localId]);
          if (existingRevision && String(existingRevision.canonical_sha256 || '') !== String(revision.canonical_sha256 || '')) throw failure('CAPTION_REVISION_ID_CONFLICT', localId);
          if (existingRevision && String(existingRevision.track_id) !== String(trackIds[track.portable_track_id])) throw failure('CAPTION_REVISION_TRACK_CONFLICT', localId);
          const reused = !!existingRevision;
          if (!reused) {
            const parentPortable = verified.graph.edges.find((e) => e.from === doc.portable_revision_id && e.relation === 'supersedes');
            await r(`INSERT INTO studio_caption_revisions(revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)`, [localId, trackIds[track.portable_track_id], parentPortable ? revisionIds[parentPortable.to] || null : null, Number(revision.revision_no), json(revision.segments || []), json(revision.operations || []), revision.canonical_sha256, revision.author_kind || (role === 'raw_original' ? 'import' : 'user'), json(revision.provenance || {}), revision.created_at || ts]);
            created.caption_revisions.push(localId);
          }
        }
        await r('UPDATE studio_caption_tracks SET current_revision_id=?,updated_at=? WHERE track_id=?', [revisionIds[p.raw_track.current_revision_id], ts, trackIds[p.raw_track.portable_track_id]]);
        await r('UPDATE studio_caption_tracks SET current_revision_id=?,updated_at=? WHERE track_id=?', [revisionIds[p.corrected_track.current_revision_id], ts, trackIds[p.corrected_track.portable_track_id]]);
        inject(options.fault_inject, 'after_caption_revisions');

        const textByKey = await one('SELECT id FROM texts WHERE text_key=?', [p.material.portable_text_key]);
        const effectiveTextId = textByKey ? textByKey.id : textId;
        if (textByKey && !beforeMaterial) {
          const compatibility=await q('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index',[effectiveTextId]);
          if(compatibility.length!==selectedTable.rows.length)throw failure('TEXT_KEY_CONTENT_CONFLICT');
          for(let index=0;index<compatibility.length;index++){const old=compatibility[index],row=selectedTable.rows[index];if(String(old.he_plain||'')!==row.he_plain||String(old.he_niqqud||'')!==row.he_niqqud||String(old.translit||'')!==row.translit||String(old.translit_ru||'')!==row.translit_ru||String(old.ru||'')!==row.ru)throw failure('TEXT_KEY_CONTENT_CONFLICT');rowIds[row.portable_row_id]=String(old.id);}
          for(const node of verified.graph.artifacts)if(node.type==='learning_row_version'&&nodeMap[node.id])nodeMap[node.id].local_id=rowIds[node.id];
        }
        if (!textByKey) {
          const text = p.material.text || {};
          const selectedCaption = p.caption_revisions.find((item) => item.portable_revision_id === manifest.roots.caption_revision);
          const portableSource = { kind: 'portable-package', method: 'verified-package', source: p.media_ref.original_name || text.title || null, at: ts, portable_package_id: manifest.portable_package_id, content_root_sha256: manifest.content_root_sha256, audio: { media: { sha256: manifest.media.sha256 || null, originalName: p.media_ref.original_name || null, durationSec: manifest.media.duration_ms == null ? null : Math.round(Number(manifest.media.duration_ms) / 1000), mime: manifest.media.mime || null, sizeBytes: manifest.media.size_bytes == null ? null : Number(manifest.media.size_bytes) }, segments: selectedCaption ? selectedCaption.revision.segments || [] : [], timing: true } };
          await r(`INSERT INTO texts(id,text_key,title,source_text,level,tags_json,source,topic,source_meta_json,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [textId, p.material.portable_text_key, text.title || '', text.source_text || '', text.level || null, json(text.tags || []), text.source || null, text.topic || null, json({ schema: 'portable-learning-package-v2', portable_material_id: manifest.roots.learning_material, portable_import: { portable_package_id: manifest.portable_package_id, content_root_sha256: manifest.content_root_sha256, imported_at: ts }, source: portableSource }), ts, ts]);
          created.text = true;
        }
        const existingMaterial = await one('SELECT * FROM studio_learning_materials WHERE material_id=? OR text_id=?', [materialId, effectiveTextId]);
        if (existingMaterial && (existingMaterial.material_id !== materialId || String(existingMaterial.portable_text_key || '') !== p.material.portable_text_key)) throw failure('LEARNING_MATERIAL_ID_CONFLICT');
        if (!existingMaterial) {
          await r(`INSERT INTO studio_learning_materials(material_id,package_id,text_id,portable_text_key,current_table_revision_id,created_at,updated_at)
            VALUES(?,?,?,?,NULL,?,?)`, [materialId, packageId, effectiveTextId, p.material.portable_text_key, ts, ts]);
          created.material = true;
        }
        inject(options.fault_inject, 'after_material');

        const orderedTables = p.table_revisions.slice().sort((a, b) => Number(a.revision_no) - Number(b.revision_no));
        for (const table of orderedTables) {
          const localTable = tableIds[table.portable_table_revision_id];
          const reused = await assertReusable('studio_table_revisions', 'table_revision_id', localTable, 'content_sha256', table.content_sha256, 'TABLE_REVISION_ID_CONFLICT');
          if (!reused) {
            await r(`INSERT INTO studio_table_revisions(table_revision_id,material_id,revision_no,parent_revision_id,bound_caption_revision_id,bound_caption_revision_sha256,content_sha256,mapping_sha256,provider_context_json,impact_json,created_at,committed_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [localTable, materialId, Number(table.revision_no), table.parent_table_revision_id ? tableIds[table.parent_table_revision_id] : null, revisionIds[table.bound_caption_revision_id], table.bound_caption_revision_sha256, table.content_sha256, table.mapping_sha256, json(table.provider_context || {}), json(table.impact || {}), ts, ts]);
            created.table_revisions.push(localTable);
            for (const row of table.rows || []) {
              const stableId = rowIds[row.portable_row_id];
              const rowHash = await Core.hashObject({ portable_row_id: row.portable_row_id, he_plain: row.he_plain, he_niqqud: row.he_niqqud, translit: row.translit, translit_ru: row.translit_ru, ru: row.ru, field_meta: row.field_meta });
              const rowVersionId = 'row-version-portable:' + rowHash;
              const existingRow = await one('SELECT content_sha256 FROM studio_learning_row_versions WHERE row_version_id=?', [rowVersionId]);
              if (existingRow && existingRow.content_sha256 !== rowHash) throw failure('ROW_VERSION_ID_CONFLICT');
              if (!existingRow) {
                await r(`INSERT INTO studio_learning_row_versions(row_version_id,stable_row_id,content_sha256,he_plain,he_niqqud,translit,translit_ru,ru,field_meta_json,created_at)
                  VALUES(?,?,?,?,?,?,?,?,?,?)`, [rowVersionId, stableId, rowHash, row.he_plain, row.he_niqqud, row.translit, row.translit_ru, row.ru, json(row.field_meta || {}), ts]);
                created.row_versions.push(rowVersionId);
              }
              await r(`INSERT INTO studio_table_revision_rows(table_revision_id,row_version_id,order_index,caption_segment_id,source_segment_ids_json,mapping_meta_json)
                VALUES(?,?,?,?,?,?)`, [localTable, rowVersionId, Number(row.order_index), row.caption_segment_id || null, json(row.source_segment_ids || []), json(row.mapping_meta || {})]);
            }
          }
        }
        inject(options.fault_inject, 'after_table_revisions');

        const priorProjection=await q('SELECT id FROM sentences WHERE text_id=? ORDER BY order_index',[effectiveTextId]),priorIds=new Set(priorProjection.map(row=>String(row.id))),wantedIds=new Set();
        for (const row of selectedTable.rows || []) {
          const edited = {};
          for (const [field, meta] of Object.entries(row.field_meta || {})) if (meta && meta.authority === 'user' && meta.locked) edited[field] = true;
          const sentenceId=rowIds[row.portable_row_id];wantedIds.add(sentenceId);
          if(priorIds.has(sentenceId))await r(`UPDATE sentences SET order_index=?,he_plain=?,he_niqqud=?,translit=?,translit_ru=?,ru=?,edit_meta_json=?,translation_provider=NULL,translation_meta_json=NULL WHERE id=? AND text_id=?`,[Number(row.order_index),row.he_plain,row.he_niqqud,row.translit,row.translit_ru,row.ru,json({edited,_studio_material:{schema:'material-projection-v1',material_id:materialId,table_revision_id:selectedTableId,field_meta:row.field_meta||{}}}),sentenceId,effectiveTextId]);
          else await r(`INSERT INTO sentences(id,text_id,order_index,he_plain,he_niqqud,translit,translit_ru,ru,meta_json,edit_meta_json,translation_provider,translation_meta_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,NULL,?,?,NULL,?)`, [sentenceId, effectiveTextId, Number(row.order_index), row.he_plain, row.he_niqqud, row.translit, row.translit_ru, row.ru, json({ edited, _studio_material: { schema: 'material-projection-v1', material_id: materialId, table_revision_id: selectedTableId, field_meta: row.field_meta || {} } }), null, ts]);
        }
        for(const old of priorProjection)if(!wantedIds.has(String(old.id)))await r('DELETE FROM sentences WHERE id=? AND text_id=?',[old.id,effectiveTextId]);
        await r('UPDATE texts SET is_archived=0,updated_at=? WHERE id=?', [ts, effectiveTextId]);
        const mapping = { rows: (selectedTable.rows || []).map((row) => ({ row_index: row.order_index, corrected_caption_segment_id: row.caption_segment_id, raw_source_segment_ids: row.source_segment_ids || [], mapping_meta: row.mapping_meta || {} })) };
        await r(`INSERT INTO studio_text_media_bindings(text_id,package_id,track_id,revision_id,revision_sha256,mapping_json,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(text_id) DO UPDATE SET package_id=excluded.package_id,track_id=excluded.track_id,revision_id=excluded.revision_id,revision_sha256=excluded.revision_sha256,mapping_json=excluded.mapping_json,updated_at=excluded.updated_at`, [effectiveTextId, packageId, trackIds[p.corrected_track.portable_track_id], selectedRevisionId, selectedTable.bound_caption_revision_sha256, json(mapping), ts, ts]);
        const priorCreatedTracks = new Set(previous && previous.rollback && previous.rollback.created && previous.rollback.created.tracks || []), activeTracks = new Set(Object.values(trackIds));
        for (const track of [p.corrected_track, p.raw_track]) {
          const oldTrack = previousNodes[track.portable_track_id] && previousNodes[track.portable_track_id].local_id;
          if (!oldTrack || activeTracks.has(String(oldTrack)) || !priorCreatedTracks.has(String(oldTrack))) continue;
          const refs = await one(`SELECT
            (SELECT COUNT(*) FROM studio_caption_revisions WHERE track_id=?) AS revisions,
            (SELECT COUNT(*) FROM studio_text_media_bindings WHERE track_id=?) AS bindings,
            (SELECT COUNT(*) FROM studio_caption_tracks WHERE parent_track_id=?) AS children`, [oldTrack, oldTrack, oldTrack]);
          if (Number(refs.revisions || 0) === 0 && Number(refs.bindings || 0) === 0 && Number(refs.children || 0) === 0) {
            await r('DELETE FROM studio_caption_tracks WHERE track_id=?', [oldTrack]); removedLegacyTracks.push(String(oldTrack));
          }
        }
        await r('UPDATE studio_learning_materials SET package_id=?,current_table_revision_id=?,updated_at=? WHERE material_id=?', [packageId, selectedTableId, ts, materialId]);
        inject(options.fault_inject, 'after_projection');

        const counts = { caption_revisions: p.caption_revisions.length, table_revisions: p.table_revisions.length, rows: selectedTable.rows.length, created_caption_revisions: created.caption_revisions.length, created_table_revisions: created.table_revisions.length, created_row_versions: created.row_versions.length };
        const idMap = { nodes: nodeMap, media_package: { local_id: packageId, created: created.package }, text: { text_key: p.material.portable_text_key, local_id: effectiveTextId, created: created.text }, material: { local_id: materialId, created: created.material }, selected_caption_portable_id: manifest.roots.caption_revision, selected_table_portable_id: manifest.roots.table_revision, caption_revisions: revisionIds, table_revisions: tableIds, rows: rowIds };
        const priorRollback = repairing && previous.rollback || {}, priorCreated = priorRollback.created || {};
        const rollbackCreated = {
          package: !!(priorCreated.package || created.package),
          tracks: uniqueSorted([...(priorCreated.tracks || []), ...created.tracks]).filter((id) => !removedLegacyTracks.includes(id)),
          caption_revisions: uniqueSorted([...(priorCreated.caption_revisions || []), ...created.caption_revisions]),
          text: !!(priorCreated.text || created.text), material: !!(priorCreated.material || created.material),
          table_revisions: uniqueSorted([...(priorCreated.table_revisions || []), ...created.table_revisions]),
          row_versions: uniqueSorted([...(priorCreated.row_versions || []), ...created.row_versions]),
        };
        const rollback = { ...priorRollback, created: rollbackCreated, before_material: priorRollback.before_material || beforeMaterial || null, before_binding: priorRollback.before_binding || beforeBinding || null, binding_created: priorRollback.binding_created == null ? !beforeBinding : !!priorRollback.binding_created, package_id: packageId, text_id: effectiveTextId, material_id: materialId };
        const resultBase = { portable_package_id: manifest.portable_package_id, content_root_sha256: manifest.content_root_sha256, counts, id_map: idMap };
        const resultHash = await Core.hashObject(resultBase), receiptId = 'portable-receipt:' + manifest.content_root_sha256;
        await r(`INSERT INTO studio_portable_import_receipts(receipt_id,portable_package_id,content_root_sha256,manifest_sha256,schema_version,package_mode,status,plan_sha256,result_sha256,counts_json,id_map_json,rollback_json,missing_media_json,created_at,rolled_back_at)
          VALUES(?,?,?,?,?,?,'committed',?,?,?,?,?,?,?,NULL)
          ON CONFLICT(receipt_id) DO UPDATE SET
            portable_package_id=excluded.portable_package_id,
            content_root_sha256=excluded.content_root_sha256,
            manifest_sha256=excluded.manifest_sha256,
            schema_version=excluded.schema_version,
            package_mode=excluded.package_mode,
            status='committed',
            plan_sha256=excluded.plan_sha256,
            result_sha256=excluded.result_sha256,
            counts_json=excluded.counts_json,
            id_map_json=excluded.id_map_json,
            rollback_json=excluded.rollback_json,
            missing_media_json=excluded.missing_media_json,
            created_at=excluded.created_at,
            rolled_back_at=NULL`, [receiptId, manifest.portable_package_id, manifest.content_root_sha256, verified.manifest_sha256, 2, manifest.package_mode, currentPlan.plan_sha256, resultHash, json(counts), json(idMap), json(rollback), json(currentPlan.media.status === 'missing' ? [manifest.media.sha256] : []), ts]);
        inject(options.fault_inject, 'after_receipt');
        await x('RELEASE p2_portable_import;');
        return { imported: !repairing, repaired: repairing, duplicate: false, receipt: await getReceiptByRoot(manifest.portable_package_id, manifest.content_root_sha256) };
      } catch (error) {
        try { await x('ROLLBACK TO p2_portable_import;'); } finally { try { await x('RELEASE p2_portable_import;'); } catch (_) {} }
        throw error;
      }
    }

    async function reverseReferencePlan(receiptId) {
      const receipt=await getReceipt(receiptId);if(!receipt||receipt.status!=='committed')throw failure('RECEIPT_NOT_COMMITTED');
      const rollback=receipt.rollback||{},created=rollback.created||{},blockers=[];
      const tables=(await q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).map(row=>row.name);
      async function external(column,value,allow){if(!value)return;for(const table of tables){const columns=(await q(`PRAGMA table_info(${table})`)).map(row=>row.name);if(!columns.includes(column)||allow.includes(table))continue;const hit=await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`,[value]);if(Number(hit&&hit.n||0)>0)blockers.push({table,column,value,count:Number(hit.n)});}}
      if(created.text){await external('text_id',rollback.text_id,['sentences','studio_learning_materials','studio_text_media_bindings']);for(const sentenceId of Object.values(receipt.id_map.rows||{}))await external('sentence_id',sentenceId,[]);}
      if(created.package)await external('package_id',rollback.package_id,['studio_media_packages','studio_caption_tracks','studio_text_media_bindings','studio_learning_materials']);
      return{receipt_id:receiptId,can_delete:blockers.length===0,blockers,created,media_blob_action:'retained'};
    }

    async function undo(receiptId, options) {
      options = options || {}; if (!options.confirm) throw failure('UNDO_CONFIRM_REQUIRED');
      const receipt = await one('SELECT * FROM studio_portable_import_receipts WHERE receipt_id=?', [receiptId]);
      if (!receipt || receipt.status !== 'committed') throw failure('RECEIPT_NOT_COMMITTED');
      const referencePlan=await reverseReferencePlan(receiptId);if(!referencePlan.can_delete)throw failure('UNDO_EXTERNAL_REFERENCE_CONFLICT');
      const rollback = parse(receipt.rollback_json, {}), created = rollback.created || {};
      await x('SAVEPOINT p2_portable_undo;');
      try {
        if (rollback.before_material) await r('UPDATE studio_learning_materials SET current_table_revision_id=?,updated_at=? WHERE material_id=?', [rollback.before_material.current_table_revision_id, timestamp(), rollback.before_material.material_id]);
        if(rollback.binding_created)await r('DELETE FROM studio_text_media_bindings WHERE text_id=?',[rollback.text_id]);
        else if(rollback.before_binding)await r(`UPDATE studio_text_media_bindings SET package_id=?,track_id=?,revision_id=?,revision_sha256=?,mapping_json=?,updated_at=? WHERE text_id=?`,[rollback.before_binding.package_id,rollback.before_binding.track_id,rollback.before_binding.revision_id,rollback.before_binding.revision_sha256,rollback.before_binding.mapping_json,timestamp(),rollback.text_id]);
        if (created.material) await r('DELETE FROM studio_learning_materials WHERE material_id=?', [rollback.material_id]);
        else for (const id of (created.table_revisions || []).slice().reverse()) await r('DELETE FROM studio_table_revisions WHERE table_revision_id=?', [id]);
        for (const id of (created.row_versions || []).slice().reverse()) await r('DELETE FROM studio_learning_row_versions WHERE row_version_id=? AND NOT EXISTS(SELECT 1 FROM studio_table_revision_rows WHERE row_version_id=?)', [id, id]);
        if (created.text) await r('DELETE FROM texts WHERE id=?', [rollback.text_id]);
        for (const id of (created.caption_revisions || []).slice().reverse()) await r('DELETE FROM studio_caption_revisions WHERE revision_id=? AND NOT EXISTS(SELECT 1 FROM studio_caption_tracks WHERE current_revision_id=?)', [id, id]);
        for (const id of (created.tracks || []).slice().reverse()) await r('DELETE FROM studio_caption_tracks WHERE track_id=?', [id]);
        if (created.package) await r('DELETE FROM studio_media_packages WHERE package_id=?', [rollback.package_id]);
        inject(options.fault_inject, 'before_receipt_update');
        await r("UPDATE studio_portable_import_receipts SET status='rolled_back',rolled_back_at=? WHERE receipt_id=?", [timestamp(), receiptId]);
        const fk = await q('PRAGMA foreign_key_check'); if (fk.length) throw failure('FOREIGN_KEY_CHECK_FAILED');
        await x('RELEASE p2_portable_undo;');
        return { undone: true, receipt_id: receiptId };
      } catch (error) { try { await x('ROLLBACK TO p2_portable_undo;'); } finally { try { await x('RELEASE p2_portable_undo;'); } catch (_) {} } throw error; }
    }

    async function listReceipts() {
      const rows = await q(`SELECT r.receipt_id,r.portable_package_id,r.content_root_sha256,r.package_mode,
        r.status,r.counts_json,r.id_map_json,r.missing_media_json,r.created_at,r.rolled_back_at,
        json_extract(r.id_map_json,'$.material.local_id') AS material_id,t.title
        FROM studio_portable_import_receipts r
        LEFT JOIN studio_learning_materials m
          ON m.material_id=json_extract(r.id_map_json,'$.material.local_id')
        LEFT JOIN texts t ON t.id=m.text_id
        ORDER BY r.created_at DESC`);
      for (const row of rows) {
        row.counts = parse(row.counts_json, {}); row.id_map = parse(row.id_map_json, {}); row.missing_media = parse(row.missing_media_json, []);
        row._integrity = await inspectReceiptClosure(row, null);
      }
      return rows;
    }

    async function restoreLibraryProjection(receiptId) {
      const receipt = await getReceipt(receiptId); if (!receipt || receipt.status !== 'committed') throw failure('RECEIPT_NOT_COMMITTED');
      const integrity = await inspectReceiptClosure(receipt, null);
      if (integrity.state === 'complete') return { restored: false, duplicate: true, integrity };
      if (integrity.state !== 'archived') throw failure('SOURCE_PACKAGE_REQUIRED');
      const textId = receipt.id_map && receipt.id_map.text && receipt.id_map.text.local_id;
      await x('SAVEPOINT p2_restore_projection;');
      try {
        const result = await r('UPDATE texts SET is_archived=0,updated_at=? WHERE id=? AND is_archived=1', [timestamp(), textId]);
        if (result && Number(result.changes) === 0) throw failure('RESTORE_PROJECTION_STALE');
        await x('RELEASE p2_restore_projection;');
        return { restored: true, duplicate: false, integrity: await inspectReceiptClosure(receipt, null) };
      } catch (error) { try { await x('ROLLBACK TO p2_restore_projection;'); } finally { try { await x('RELEASE p2_restore_projection;'); } catch (_) {} } throw error; }
    }

    async function repairTextMediaBinding(receiptId) {
      const receipt = await getReceipt(receiptId);
      if (!receipt || receipt.status !== 'committed') throw failure('RECEIPT_NOT_COMMITTED');
      const map = receipt.id_map || {}, textId = map.text && map.text.local_id, packageId = map.media_package && map.media_package.local_id;
      if (!textId || !packageId) throw failure('RECEIPT_BINDING_MAP_MISSING');
      const binding = await one('SELECT text_id,package_id,track_id,revision_id,revision_sha256 FROM studio_text_media_bindings WHERE text_id=?', [textId]);
      if (!binding) throw failure('TEXT_MEDIA_BINDING_MISSING');
      const target = await one(`SELECT r.track_id,r.canonical_sha256,t.package_id,t.role
        FROM studio_caption_revisions r JOIN studio_caption_tracks t ON t.track_id=r.track_id WHERE r.revision_id=?`, [binding.revision_id]);
      if (!target) throw failure('CAPTION_REVISION_MISSING');
      if (String(target.canonical_sha256 || '') !== String(binding.revision_sha256 || '')) throw failure('TEXT_MEDIA_BINDING_HASH_CONFLICT');
      if (String(binding.package_id) !== String(packageId) || String(target.package_id) !== String(packageId) || target.role !== 'user_corrected') throw failure('TEXT_MEDIA_BINDING_PACKAGE_CONFLICT');
      if (String(target.track_id) === String(binding.track_id)) return { repaired: false, duplicate: true, receipt, integrity: await inspectReceiptClosure(receipt, null) };
      const oldTrack = String(binding.track_id), nextTrack = String(target.track_id), nextMap = parse(json(map), {}), nextRollback = parse(json(receipt.rollback || {}), {});
      await x('SAVEPOINT p2_repair_text_media_binding;');
      try {
        await r('UPDATE studio_text_media_bindings SET track_id=?,updated_at=? WHERE text_id=? AND revision_id=? AND revision_sha256=?', [nextTrack, timestamp(), textId, binding.revision_id, binding.revision_sha256]);
        for (const value of Object.values(nextMap.nodes || {})) if (value && String(value.local_id) === oldTrack) value.local_id = nextTrack;
        const createdTracks = nextRollback.created && Array.isArray(nextRollback.created.tracks) ? nextRollback.created.tracks : [];
        if (createdTracks.includes(oldTrack)) {
          const refs = await one(`SELECT
            (SELECT COUNT(*) FROM studio_caption_revisions WHERE track_id=?) AS revisions,
            (SELECT COUNT(*) FROM studio_text_media_bindings WHERE track_id=?) AS bindings,
            (SELECT COUNT(*) FROM studio_caption_tracks WHERE parent_track_id=?) AS children`, [oldTrack, oldTrack, oldTrack]);
          if (Number(refs.revisions || 0) === 0 && Number(refs.bindings || 0) === 0 && Number(refs.children || 0) === 0) {
            await r('DELETE FROM studio_caption_tracks WHERE track_id=?', [oldTrack]);
            nextRollback.created.tracks = createdTracks.filter((id) => String(id) !== oldTrack);
          }
        }
        const resultBase = { portable_package_id: receipt.portable_package_id, content_root_sha256: receipt.content_root_sha256, counts: receipt.counts || {}, id_map: nextMap };
        await r('UPDATE studio_portable_import_receipts SET id_map_json=?,rollback_json=?,result_sha256=? WHERE receipt_id=?', [json(nextMap), json(nextRollback), await Core.hashObject(resultBase), receiptId]);
        await x('RELEASE p2_repair_text_media_binding;');
      } catch (error) { try { await x('ROLLBACK TO p2_repair_text_media_binding;'); } finally { try { await x('RELEASE p2_repair_text_media_binding;'); } catch (_) {} } throw error; }
      const repairedReceipt = await getReceipt(receiptId);
      return { repaired: true, duplicate: false, receipt: repairedReceipt, integrity: await inspectReceiptClosure(repairedReceipt, null) };
    }

    async function listMaterials() {
      return q(`SELECT m.material_id,m.text_id,m.portable_text_key,t.title,m.updated_at
        FROM studio_learning_materials m JOIN texts t ON t.id=m.text_id ORDER BY m.updated_at DESC`);
    }

    function exportReceipt(row) {
      return row && { ...row, details: parse(row.details_json, {}) };
    }

    async function listExportReceipts(scopeKind, portableScopeId) {
      let sql='SELECT * FROM studio_portable_export_receipts',params=[],where=[];
      if(scopeKind){where.push('scope_kind=?');params.push(scopeKind);}
      if(portableScopeId){where.push('portable_scope_id=?');params.push(portableScopeId);}
      if(where.length)sql+=' WHERE '+where.join(' AND ');
      sql+=' ORDER BY created_at DESC,receipt_id DESC';
      return (await q(sql,params)).map(exportReceipt);
    }

    function cleanExportDetails(value) {
      const input=value&&typeof value==='object'?value:{},out={};
      for(const key of ['history_complete','audio_included','material_count','local_material_id','source_kind'])if(input[key]!==undefined)out[key]=input[key];
      return out;
    }

    async function recordExportGenerated(event, options) {
      options=options||{};const createdAt=event&&event.created_at||timestamp(),value={...(event||{}),event_kind:'generated',parent_receipt_id:null,destination_kind:null,created_at:createdAt};
      if(!importCore||typeof importCore.validateReceiptInput!=='function')throw failure('IMPORT_CENTER_CORE_REQUIRED');
      importCore.validateReceiptInput(value);
      const descriptor={event_kind:'generated',scope_kind:value.scope_kind,portable_scope_id:String(value.portable_scope_id),format_kind:value.format_kind,source_state_sha256:value.source_state_sha256,artifact_sha256:value.artifact_sha256,size_bytes:Number(value.size_bytes),created_at:createdAt};
      const receiptId='export-generated:'+await Core.hashObject(descriptor),details=cleanExportDetails(value.details);
      await x('SAVEPOINT p4_export_receipt;');
      try{
        await r(`INSERT INTO studio_portable_export_receipts(receipt_id,event_kind,parent_receipt_id,scope_kind,portable_scope_id,format_kind,source_state_sha256,artifact_sha256,size_bytes,destination_kind,app_version,details_json,created_at)
          VALUES(?,'generated',NULL,?,?,?,?,?,?,NULL,?,?,?)`,[receiptId,value.scope_kind,String(value.portable_scope_id),value.format_kind,value.source_state_sha256,value.artifact_sha256,Number(value.size_bytes),String(value.app_version||'unknown'),json(details),createdAt]);
        inject(options.fault_inject,'after_export_receipt');
        await x('RELEASE p4_export_receipt;');
      }catch(error){try{await x('ROLLBACK TO p4_export_receipt;');}finally{try{await x('RELEASE p4_export_receipt;');}catch(_){}}throw error;}
      return exportReceipt(await one('SELECT * FROM studio_portable_export_receipts WHERE receipt_id=?',[receiptId]));
    }

    async function confirmExportSaved(generatedReceiptId, destinationKind, options) {
      options=options||{};
      if(!['files_icloud','files_local','share_sheet','other'].includes(destinationKind))throw failure('EXPORT_DESTINATION_INVALID');
      const parent=await one("SELECT * FROM studio_portable_export_receipts WHERE receipt_id=? AND event_kind='generated'",[generatedReceiptId]);
      if(!parent)throw failure('EXPORT_GENERATED_RECEIPT_NOT_FOUND');
      const createdAt=options.created_at||timestamp(),descriptor={event_kind:'owner_saved',parent_receipt_id:generatedReceiptId,destination_kind:destinationKind,created_at:createdAt};
      const receiptId='export-saved:'+await Core.hashObject(descriptor),details=cleanExportDetails(options.details);
      await x('SAVEPOINT p4_export_saved;');
      try{
        await r(`INSERT INTO studio_portable_export_receipts(receipt_id,event_kind,parent_receipt_id,scope_kind,portable_scope_id,format_kind,source_state_sha256,artifact_sha256,size_bytes,destination_kind,app_version,details_json,created_at)
          VALUES(?,'owner_saved',?,?,?,?,?,?,?,?,?,?,?)`,[receiptId,generatedReceiptId,parent.scope_kind,parent.portable_scope_id,parent.format_kind,parent.source_state_sha256,parent.artifact_sha256,Number(parent.size_bytes),destinationKind,String(parent.app_version||'unknown'),json(details),createdAt]);
        inject(options.fault_inject,'after_export_saved');
        await x('RELEASE p4_export_saved;');
      }catch(error){try{await x('ROLLBACK TO p4_export_saved;');}finally{try{await x('RELEASE p4_export_saved;');}catch(_){}}throw error;}
      return exportReceipt(await one('SELECT * FROM studio_portable_export_receipts WHERE receipt_id=?',[receiptId]));
    }

    async function restoreExportReceipts(receipts) {
      const rows=Array.isArray(receipts)?receipts:[],ordered=rows.slice().sort((a,b)=>(a&&a.event_kind==='generated'?0:1)-(b&&b.event_kind==='generated'?0:1));
      if(rows.length>10000)throw failure('EXPORT_RECEIPT_RESTORE_LIMIT');
      const generated=new Set(rows.filter(row=>row&&row.event_kind==='generated').map(row=>String(row.receipt_id)));
      for(const row of rows){
        if(!row||typeof row.receipt_id!=='string'||!row.receipt_id.startsWith(row.event_kind==='generated'?'export-generated:':'export-saved:'))throw failure('EXPORT_RECEIPT_RESTORE_INVALID');
        importCore.validateReceiptInput(row);
        if(row.event_kind==='owner_saved'&&!generated.has(String(row.parent_receipt_id))&&!await one("SELECT receipt_id FROM studio_portable_export_receipts WHERE receipt_id=? AND event_kind='generated'",[row.parent_receipt_id]))throw failure('EXPORT_RECEIPT_PARENT_MISSING');
      }
      await x('SAVEPOINT p4_export_restore;');
      try{
        let restored=0,reused=0;
        for(const row of ordered){
          const existing=await one('SELECT * FROM studio_portable_export_receipts WHERE receipt_id=?',[row.receipt_id]);
          if(existing){
            const same=['event_kind','parent_receipt_id','scope_kind','portable_scope_id','format_kind','source_state_sha256','artifact_sha256','size_bytes','destination_kind','app_version','details_json','created_at'].every(key=>String(existing[key]??'')===String(key==='details_json'?json(cleanExportDetails(row.details)):row[key]??''));
            if(!same)throw failure('EXPORT_RECEIPT_RESTORE_CONFLICT');
            reused++;continue;
          }
          await r(`INSERT INTO studio_portable_export_receipts(receipt_id,event_kind,parent_receipt_id,scope_kind,portable_scope_id,format_kind,source_state_sha256,artifact_sha256,size_bytes,destination_kind,app_version,details_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[row.receipt_id,row.event_kind,row.parent_receipt_id||null,row.scope_kind,String(row.portable_scope_id),row.format_kind,row.source_state_sha256,row.artifact_sha256,Number(row.size_bytes),row.destination_kind||null,String(row.app_version||'unknown'),json(cleanExportDetails(row.details)),row.created_at]);
          restored++;
        }
        await x('RELEASE p4_export_restore;');return{restored,reused,total:rows.length};
      }catch(error){try{await x('ROLLBACK TO p4_export_restore;');}finally{try{await x('RELEASE p4_export_restore;');}catch(_){}}throw error;}
    }

    async function lifecycleInventory() {
      if(!importCore||typeof importCore.sourceStateHash!=='function')throw failure('IMPORT_CENTER_CORE_REQUIRED');
      const rows=await q(`SELECT m.material_id,m.text_id,m.portable_text_key,m.current_table_revision_id,m.package_id,m.updated_at,
        t.title,t.is_archived,tr.bound_caption_revision_id,tr.bound_caption_revision_sha256,tr.content_sha256 AS table_content_sha256,tr.mapping_sha256 AS table_mapping_sha256,
        b.track_id AS binding_track_id,b.revision_id AS binding_revision_id,b.revision_sha256 AS binding_revision_sha256,
        ct.current_revision_id AS caption_current_revision_id,ct.draft_json AS caption_draft_json,cr.canonical_sha256 AS caption_current_sha256,
        br.track_id AS bound_revision_track_id,br.canonical_sha256 AS bound_revision_actual_sha256,
        p.media_sha256,p.opfs_path,p.mime,p.size_bytes,p.duration_ms,p.original_name,
        (SELECT rr.canonical_sha256 FROM studio_caption_tracks rt JOIN studio_caption_revisions rr ON rr.revision_id=rt.current_revision_id WHERE rt.package_id=m.package_id AND rt.role='raw_original' ORDER BY rt.updated_at DESC LIMIT 1) AS raw_revision_sha256,
        (SELECT rt.track_id FROM studio_caption_tracks rt WHERE rt.package_id=m.package_id AND rt.role='raw_original' ORDER BY rt.updated_at DESC LIMIT 1) AS raw_track_id
        FROM studio_learning_materials m JOIN texts t ON t.id=m.text_id
        LEFT JOIN studio_table_revisions tr ON tr.table_revision_id=m.current_table_revision_id
        LEFT JOIN studio_text_media_bindings b ON b.text_id=m.text_id
        LEFT JOIN studio_caption_tracks ct ON ct.track_id=b.track_id
        LEFT JOIN studio_caption_revisions cr ON cr.revision_id=ct.current_revision_id
        LEFT JOIN studio_caption_revisions br ON br.revision_id=tr.bound_caption_revision_id
        LEFT JOIN studio_media_packages p ON p.package_id=m.package_id AND p.deleted_at IS NULL
        ORDER BY m.updated_at DESC`);
      const mappings=new Map((await q(`SELECT tr.table_revision_id,COUNT(*) AS total,SUM(CASE WHEN tr.caption_segment_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped
        FROM studio_table_revision_rows tr GROUP BY tr.table_revision_id`)).map(row=>[String(row.table_revision_id),row]));
      const importRows=await q("SELECT receipt_id,status,id_map_json FROM studio_portable_import_receipts ORDER BY created_at DESC"),imports=new Map();
      for(const receipt of importRows){const map=parse(receipt.id_map_json,{}),local=map.material&&map.material.local_id;if(local&&!imports.has(String(local)))imports.set(String(local),{...receipt,id_map:map});}
      const result=[];
      for(const row of rows){
        const receipt=imports.get(String(row.material_id)),mapping=mappings.get(String(row.current_table_revision_id))||{},nodeEntries=receipt&&receipt.id_map&&receipt.id_map.nodes||{};
        let portableScope=Object.keys(nodeEntries).find(id=>id.startsWith('learning-material:')&&nodeEntries[id]&&String(nodeEntries[id].local_id)===String(row.material_id));
        if(!portableScope&&row.raw_revision_sha256){const mediaPackageHash=await Core.hashObject({media_sha256:row.media_sha256||null,raw_revision_sha256:row.raw_revision_sha256,schema:'media-package-portable-v1'});portableScope='learning-material:sha256:'+await Core.hashObject({text_key:String(row.portable_text_key||''),media_package_id:'media-package:sha256:'+mediaPackageHash});}
        portableScope=portableScope||'local-material:'+String(row.material_id);
        let integrity=receipt?'complete':'native';
        const bindingConflict=row.binding_revision_sha256&&row.bound_revision_actual_sha256&&String(row.binding_revision_sha256)!==String(row.bound_revision_actual_sha256);
        const bindingTargetMismatch=row.binding_track_id&&row.bound_revision_track_id&&String(row.binding_track_id)!==String(row.bound_revision_track_id);
        if(receipt&&Number(row.is_archived))integrity='archived';else if(receipt&&bindingConflict)integrity='conflict';else if(receipt&&!row.binding_track_id)integrity='repairable-source';else if(receipt&&bindingTargetMismatch)integrity='repairable-binding';
        const item={
          material_id:row.material_id,text_id:row.text_id,package_id:row.package_id,binding_track_id:row.binding_track_id,portable_scope_id:portableScope,portable_text_key:row.portable_text_key,title:row.title,updated_at:row.updated_at,
          projection_present:true,projection_archived:!!Number(row.is_archived),projection_rebuildable:!!receipt,
          caption_raw_present:!!row.raw_track_id,caption_current_revision_id:row.caption_current_revision_id||row.binding_revision_id||null,caption_current_sha256:row.caption_current_sha256||row.binding_revision_sha256||null,caption_draft_present:!!String(row.caption_draft_json||'').trim(),
          table_current_revision_id:row.current_table_revision_id||null,table_content_sha256:row.table_content_sha256||null,table_mapping_sha256:row.table_mapping_sha256||null,table_bound_caption_revision_id:row.bound_caption_revision_id||null,table_bound_caption_revision_sha256:row.bound_caption_revision_sha256||null,
          mapping_total:Number(mapping.total||0),mapping_mapped:Number(mapping.mapped||0),mapping_invalid:!!bindingConflict,
          media_expected_sha256:row.media_sha256||null,media_actual_sha256:row.media_sha256||null,media_present:!!row.opfs_path,media_codec_supported:null,mime:row.mime||null,size_bytes:row.size_bytes==null?null:Number(row.size_bytes),duration_ms:row.duration_ms==null?null:Number(row.duration_ms),original_name:row.original_name||null,
          import_integrity_state:integrity,import_receipt_id:receipt&&receipt.receipt_id||null,
        };
        item.source_state_sha256=await importCore.sourceStateHash({portable_scope_id:portableScope,caption_sha256:item.caption_current_sha256,table_content_sha256:item.table_content_sha256,table_mapping_sha256:item.table_mapping_sha256,media_sha256:item.media_expected_sha256});
        result.push(item);
      }
      return result;
    }

    async function mediaForText(textId) {
      return one(`SELECT b.text_id,b.package_id,p.media_sha256,p.mime,p.duration_ms,p.original_name,p.opfs_path,p.size_bytes,
        m.material_id,m.portable_text_key
        FROM studio_text_media_bindings b
        JOIN studio_media_packages p ON p.package_id=b.package_id AND p.deleted_at IS NULL
        LEFT JOIN studio_learning_materials m ON m.text_id=b.text_id
        WHERE b.text_id=?`, [textId]);
    }

    async function mediaForReceipt(receiptId) {
      const receipt = await getReceipt(receiptId), packageId = receipt && receipt.id_map && receipt.id_map.media_package && receipt.id_map.media_package.local_id;
      return packageId ? one(`SELECT p.package_id,p.media_sha256,p.mime,p.duration_ms,p.original_name,p.opfs_path,p.size_bytes
        FROM studio_media_packages p WHERE p.package_id=? AND p.deleted_at IS NULL`, [packageId]) : null;
    }

    async function snapshotForMaterial(materialId) {
      const material = await one(`SELECT m.*,t.text_key,t.title,t.source_text,t.level,t.tags_json,t.source,t.topic,
        t.source_meta_json,t.table_model_meta_json,t.tts_profile_json
        FROM studio_learning_materials m JOIN texts t ON t.id=m.text_id WHERE m.material_id=?`, [materialId]);
      if (!material) throw failure('MATERIAL_NOT_FOUND');
      if (!material.current_table_revision_id) throw failure('MATERIAL_HEAD_MISSING');
      const pkg = await one('SELECT * FROM studio_media_packages WHERE package_id=? AND deleted_at IS NULL', [material.package_id]);
      if (!pkg) throw failure('MEDIA_PACKAGE_NOT_FOUND');
      const tracks = await q('SELECT * FROM studio_caption_tracks WHERE package_id=? ORDER BY role', [pkg.package_id]);
      const rawTrack = tracks.find((item) => item.role === 'raw_original'), correctedTrack = tracks.find((item) => item.role === 'user_corrected');
      if (!rawTrack || !correctedTrack) throw failure('CAPTION_TRACKS_INCOMPLETE');
      async function revisionsFor(trackId) {
        return (await q('SELECT * FROM studio_caption_revisions WHERE track_id=? ORDER BY revision_no', [trackId])).map((row) => ({
          revision_id: row.revision_id, track_id: row.track_id, parent_revision_id: row.parent_revision_id || null,
          revision_no: Number(row.revision_no), segments: parse(row.segments_json, []), operations: parse(row.operations_json, []),
          canonical_sha256: row.canonical_sha256, author_kind: row.author_kind, provenance: parse(row.provenance_json, {}), created_at: row.created_at,
        }));
      }
      const rawRevisions = await revisionsFor(rawTrack.track_id), correctedRevisions = await revisionsFor(correctedTrack.track_id);
      const tableHeaders = await q('SELECT * FROM studio_table_revisions WHERE material_id=? ORDER BY revision_no', [material.material_id]);
      const tableRevisions = [];
      for (const header of tableHeaders) {
        const rows = await q(`SELECT rv.*,tr.order_index,tr.caption_segment_id,tr.source_segment_ids_json,tr.mapping_meta_json
          FROM studio_table_revision_rows tr JOIN studio_learning_row_versions rv ON rv.row_version_id=tr.row_version_id
          WHERE tr.table_revision_id=? ORDER BY tr.order_index`, [header.table_revision_id]);
        tableRevisions.push({ table_revision_id: header.table_revision_id, material_id: header.material_id, revision_no: Number(header.revision_no), parent_revision_id: header.parent_revision_id || null,
          bound_caption_revision_id: header.bound_caption_revision_id, bound_caption_revision_sha256: header.bound_caption_revision_sha256,
          content_sha256: header.content_sha256, mapping_sha256: header.mapping_sha256, provider_context: parse(header.provider_context_json, {}), impact: parse(header.impact_json, {}),
          rows: rows.map((row) => ({ stable_row_id: row.stable_row_id, he_plain: row.he_plain || '', he_niqqud: row.he_niqqud || '', translit: row.translit || '', translit_ru: row.translit_ru || '', ru: row.ru || '', field_meta: parse(row.field_meta_json, {}), caption_segment_id: row.caption_segment_id || null, source_segment_ids: parse(row.source_segment_ids_json, []), mapping_meta: parse(row.mapping_meta_json, {}) })) });
      }
      const selected = tableRevisions.find((item) => item.table_revision_id === material.current_table_revision_id);
      if (!selected) throw failure('MATERIAL_HEAD_INVALID');
      const importedReceipt=await one("SELECT receipt_id,content_root_sha256,id_map_json FROM studio_portable_import_receipts WHERE status='committed' AND json_extract(id_map_json,'$.material.local_id')=? ORDER BY created_at DESC LIMIT 1",[material.material_id]);
      const textCard = { format: 'linguistpro-text-card-v2', exported_at: timestamp(), exported_by_app: null, card: {
        title: material.title || null, level: material.level || null, tags: parse(material.tags_json, []), source_label: null, topic: null, source_text: material.source_text || '',
        rows: selected.rows.map((row,index)=>({ order_index:index, hebrew_plain:row.he_plain, hebrew_niqqud:row.he_niqqud, translit:row.translit, translit_ru:row.translit_ru, russian:row.ru })),
        tts_profile: null, text_audio_asset_key: null, source_meta: null, table_model_meta: null, passport_in: null,
      } };
      return {
        package: { package_id: pkg.package_id, media_sha256: pkg.media_sha256 || null, mime: pkg.mime || null, duration_ms: pkg.duration_ms == null ? null : Number(pkg.duration_ms), original_name: pkg.original_name || null, size_bytes: pkg.size_bytes == null ? null : Number(pkg.size_bytes) },
        raw_track: { track_id: rawTrack.track_id, role: rawTrack.role, language: rawTrack.language || null, current_revision_id: rawTrack.current_revision_id }, raw_revisions: rawRevisions,
        corrected_track: { track_id: correctedTrack.track_id, role: correctedTrack.role, language: correctedTrack.language || null, parent_track_id: correctedTrack.parent_track_id || null, current_revision_id: correctedTrack.current_revision_id }, corrected_revisions: correctedRevisions,
        material: { material_id: material.material_id, text_id: material.text_id, portable_text_key: material.portable_text_key || material.text_key, current_table_revision_id: material.current_table_revision_id, package_id: material.package_id }, table_revisions: tableRevisions,
        selected_caption_revision_id: selected.bound_caption_revision_id, selected_table_revision_id: selected.table_revision_id,
        text: { id: material.text_id, text_key: material.text_key, title: material.title, source_text: material.source_text, level: material.level, tags_json: material.tags_json, source: material.source || null, topic: material.topic || null }, text_card: textCard,
        import_run: parse((rawRevisions[0] && rawRevisions[0].provenance) || {}, {}), quality_report: { ok: true, row_count: selected.rows.length, zero_provider_calls: true },
        _portable_receipt: importedReceipt ? {receipt_id:importedReceipt.receipt_id,content_root_sha256:importedReceipt.content_root_sha256,id_map:parse(importedReceipt.id_map_json,{})} : null,
      };
    }

    return { inventory, dryRun, applyVerified, getReceipt, getReceiptByRoot, receiptIntegrity, restoreLibraryProjection, repairTextMediaBinding, listReceipts, listMaterials, mediaForText, mediaForReceipt, reverseReferencePlan, undo, snapshotForMaterial, listExportReceipts, recordExportGenerated, confirmExportSaved, restoreExportReceipts, lifecycleInventory };
  }

  return { createRepository };
});
