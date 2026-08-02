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

  function createRepository(adapter, Core) {
    if (!adapter || !adapter.dbQuery || !adapter.dbRun || !adapter.execRaw) throw failure('REPOSITORY_ADAPTER_REQUIRED');
    if (!Core || !Core.dryRun || !Core.hashObject) throw failure('PORTABLE_CORE_REQUIRED');
    const q = (sql, params) => adapter.dbQuery(sql, params || []);
    const r = (sql, params) => adapter.dbRun(sql, params || []);
    const x = (sql) => adapter.execRaw(sql);
    const one = async (sql, params) => (await q(sql, params))[0] || null;
    const inject = (actual, expected) => { if (actual === expected) throw failure('FAULT_INJECT', expected); };

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

    async function dryRun(verified) { return Core.dryRun(verified, await inventory()); }

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
      if (previous && previous.status === 'committed') return { imported: false, duplicate: true, receipt: previous };

      const p = verified.payload, manifest = verified.manifest, ts = timestamp();
      const packageId = 'mpkg:portable:' + shortHash(manifest.roots.media_package);
      const trackIds = { [p.raw_track.portable_track_id]: 'track:portable:' + shortHash(p.raw_track.portable_track_id), [p.corrected_track.portable_track_id]: 'track:portable:' + shortHash(p.corrected_track.portable_track_id) };
      const revisionIds = {}, tableIds = {}, rowIds = {};
      for (const doc of p.caption_revisions) revisionIds[doc.portable_revision_id] = 'rev:' + shortHash(doc.portable_revision_id);
      for (const doc of p.table_revisions) tableIds[doc.portable_table_revision_id] = 'table-portable:' + shortHash(doc.portable_table_revision_id);
      for (const doc of p.table_revisions) for (const row of doc.rows || []) if (!rowIds[row.portable_row_id]) rowIds[row.portable_row_id] = 'sentence-portable:' + shortHash(row.portable_row_id);
      const materialId = 'material-portable:' + shortHash(manifest.roots.learning_material);
      const textId = 'text-portable:' + shortHash(manifest.roots.learning_material);
      const selectedTableId = tableIds[manifest.roots.table_revision];
      const selectedRevisionId = revisionIds[manifest.roots.caption_revision];
      if (!selectedTableId || !selectedRevisionId) throw failure('PACKAGE_ROOT_LOCAL_MAP_MISSING');
      const selectedTable = p.table_revisions.find((item) => item.portable_table_revision_id === manifest.roots.table_revision);
      const nodeMap = {};
      for (const node of verified.graph.artifacts) nodeMap[node.id] = { canonical_hash: node.canonical_hash, local_id: node.type === 'learning_material' ? materialId : node.type === 'table_revision' ? tableIds[node.id] : node.type === 'learning_row_version' ? rowIds[node.id] : node.type === 'caption_revision' ? revisionIds[node.id] : node.type === 'caption_track' ? trackIds[node.id] : node.type === 'media_package' ? packageId : null };
      const beforeMaterial = await one('SELECT material_id,current_table_revision_id,text_id FROM studio_learning_materials WHERE portable_text_key=?', [p.material.portable_text_key]);
      const beforeBinding = beforeMaterial ? await one('SELECT * FROM studio_text_media_bindings WHERE text_id=?', [beforeMaterial.text_id]) : null;
      const created = { package: false, tracks: [], caption_revisions: [], text: false, material: false, table_revisions: [], row_versions: [] };

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
          const reused = await assertReusable('studio_caption_revisions', 'revision_id', localId, 'canonical_sha256', revision.canonical_sha256, 'CAPTION_REVISION_ID_CONFLICT');
          if (!reused) {
            const role = (verified.graph.artifacts.find((n) => n.id === doc.portable_revision_id) || { metadata: {} }).metadata.role;
            const track = role === 'raw_original' ? p.raw_track : p.corrected_track;
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
          await r(`INSERT INTO texts(id,text_key,title,source_text,level,tags_json,source,source_meta_json,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`, [textId, p.material.portable_text_key, text.title || '', text.source_text || '', text.level || null, json(text.tags || []), 'portable-learning-package-v2', json({ schema: 'portable-learning-package-v2', portable_material_id: manifest.roots.learning_material }), ts, ts]);
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
        const mapping = { rows: (selectedTable.rows || []).map((row) => ({ row_index: row.order_index, corrected_caption_segment_id: row.caption_segment_id, raw_source_segment_ids: row.source_segment_ids || [], mapping_meta: row.mapping_meta || {} })) };
        await r(`INSERT INTO studio_text_media_bindings(text_id,package_id,track_id,revision_id,revision_sha256,mapping_json,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(text_id) DO UPDATE SET package_id=excluded.package_id,track_id=excluded.track_id,revision_id=excluded.revision_id,revision_sha256=excluded.revision_sha256,mapping_json=excluded.mapping_json,updated_at=excluded.updated_at`, [effectiveTextId, packageId, trackIds[p.corrected_track.portable_track_id], selectedRevisionId, selectedTable.bound_caption_revision_sha256, json(mapping), ts, ts]);
        await r('UPDATE studio_learning_materials SET package_id=?,current_table_revision_id=?,updated_at=? WHERE material_id=?', [packageId, selectedTableId, ts, materialId]);
        inject(options.fault_inject, 'after_projection');

        const counts = { caption_revisions: p.caption_revisions.length, table_revisions: p.table_revisions.length, rows: selectedTable.rows.length, created_caption_revisions: created.caption_revisions.length, created_table_revisions: created.table_revisions.length, created_row_versions: created.row_versions.length };
        const idMap = { nodes: nodeMap, media_package: { local_id: packageId, created: created.package }, text: { text_key: p.material.portable_text_key, local_id: effectiveTextId, created: created.text }, material: { local_id: materialId, created: created.material }, selected_caption_portable_id: manifest.roots.caption_revision, selected_table_portable_id: manifest.roots.table_revision, caption_revisions: revisionIds, table_revisions: tableIds, rows: rowIds };
        const rollback = { created, before_material: beforeMaterial || null, before_binding: beforeBinding || null, binding_created: !beforeBinding, package_id: packageId, text_id: effectiveTextId, material_id: materialId };
        const resultBase = { portable_package_id: manifest.portable_package_id, content_root_sha256: manifest.content_root_sha256, counts, id_map: idMap };
        const resultHash = await Core.hashObject(resultBase), receiptId = 'portable-receipt:' + manifest.content_root_sha256;
        await r(`INSERT INTO studio_portable_import_receipts(receipt_id,portable_package_id,content_root_sha256,manifest_sha256,schema_version,package_mode,status,plan_sha256,result_sha256,counts_json,id_map_json,rollback_json,missing_media_json,created_at,rolled_back_at)
          VALUES(?,?,?,?,?,?,'committed',?,?,?,?,?,?,?,NULL)`, [receiptId, manifest.portable_package_id, manifest.content_root_sha256, verified.manifest_sha256, 2, manifest.package_mode, currentPlan.plan_sha256, resultHash, json(counts), json(idMap), json(rollback), json(currentPlan.media.status === 'missing' ? [manifest.media.sha256] : []), ts]);
        inject(options.fault_inject, 'after_receipt');
        await x('RELEASE p2_portable_import;');
        return { imported: true, duplicate: false, receipt: await getReceiptByRoot(manifest.portable_package_id, manifest.content_root_sha256) };
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
      return q('SELECT receipt_id,portable_package_id,content_root_sha256,package_mode,status,created_at,rolled_back_at FROM studio_portable_import_receipts ORDER BY created_at DESC');
    }

    async function listMaterials() {
      return q(`SELECT m.material_id,m.portable_text_key,t.title,m.updated_at
        FROM studio_learning_materials m JOIN texts t ON t.id=m.text_id ORDER BY m.updated_at DESC`);
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
        text: { id: material.text_id, text_key: material.text_key, title: material.title, source_text: material.source_text, level: material.level, tags_json: material.tags_json }, text_card: textCard,
        import_run: parse((rawRevisions[0] && rawRevisions[0].provenance) || {}, {}), quality_report: { ok: true, row_count: selected.rows.length, zero_provider_calls: true },
        _portable_receipt: importedReceipt ? {receipt_id:importedReceipt.receipt_id,content_root_sha256:importedReceipt.content_root_sha256,id_map:parse(importedReceipt.id_map_json,{})} : null,
      };
    }

    return { inventory, dryRun, applyVerified, getReceipt, getReceiptByRoot, listReceipts, listMaterials, reverseReferencePlan, undo, snapshotForMaterial };
  }

  return { createRepository };
});
