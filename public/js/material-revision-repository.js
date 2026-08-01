// Studio Ingest L3a.3 — immutable learning-table revisions over OPFS SQLite.
// Adapter contract: dbQuery(sql, params), dbRun(sql, params), execRaw(sql).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaterialRevisionRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function error(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; return e; }
  function parse(value, fallback) { if (value == null || value === '') return fallback; if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function json(value) { return JSON.stringify(value == null ? null : value); }
  function now() { return new Date().toISOString(); }

  function createRepository(adapter, Core) {
    if (!adapter || !adapter.dbQuery || !adapter.dbRun || !adapter.execRaw) throw error('REPOSITORY_ADAPTER_REQUIRED');
    if (!Core || !Core.createTableSnapshot) throw error('MATERIAL_REVISION_CORE_REQUIRED');
    const q = (sql, params) => adapter.dbQuery(sql, params || []);
    const r = (sql, params) => adapter.dbRun(sql, params || []);
    const x = (sql) => adapter.execRaw(sql);
    const one = async (sql, params) => (await q(sql, params))[0] || null;
    const inject = (actual, expected) => { if (actual && actual === expected) throw error('FAULT_INJECT:' + actual); };

    async function transaction(work) {
      await x('BEGIN;');
      try { const value = await work(); await x('COMMIT;'); return value; }
      catch (e) { try { await x('ROLLBACK;'); } catch (_) {} throw e; }
    }

    async function stableId(prefix, value) { return prefix + ':' + (await Core.sha256Hex(value)).slice(0, 32); }

    function inferFieldMeta(sentence, textMeta) {
      const edit = parse(sentence.edit_meta_json, {}) || {};
      const edited = edit.edited && typeof edit.edited === 'object' ? edit.edited : {};
      const translation = parse(sentence.translation_meta_json, {}) || {};
      const provider = sentence.translation_provider || translation.provider || textMeta.provider || '';
      const model = translation.model || translation.translator_version || textMeta.model || textMeta.translator_version || '';
      const out = {};
      for (const field of Core.FIELD_NAMES) {
        if (edited[field]) out[field] = { authority: 'user', locked: true, status: 'current' };
        else if (field === 'he_plain') out[field] = { authority: 'source', locked: false, status: 'current' };
        else if (String(sentence[field] ?? '') && provider) out[field] = { authority: 'provider', locked: false, status: 'current', provider: String(provider), model: String(model) };
        else out[field] = { authority: 'imported', locked: false, status: 'current' };
      }
      return out;
    }

    function mappingForIndex(binding, index) {
      const mapping = parse(binding && binding.mapping_json, {}) || {};
      const rows = Array.isArray(mapping.rows) ? mapping.rows : [];
      const match = rows.find((row) => Number(row.row_index) === index) || {};
      const captionId = match.corrected_caption_segment_id || match.caption_segment_id || null;
      const sourceIds = match.raw_source_segment_ids || match.source_segment_ids || (match.raw_source_segment_id ? [match.raw_source_segment_id] : []);
      return { caption_segment_id: captionId, source_segment_ids: Array.isArray(sourceIds) ? sourceIds : [], mapping_meta: match.mapping_meta || {} };
    }

    function materialRow(row) {
      return row && { material_id: row.material_id, package_id: row.package_id || null, text_id: row.text_id, portable_text_key: row.portable_text_key || null, current_table_revision_id: row.current_table_revision_id || null, created_at: row.created_at, updated_at: row.updated_at };
    }

    async function getMaterialByText(textId) { return materialRow(await one('SELECT * FROM studio_learning_materials WHERE text_id=?', [textId])); }
    async function getMaterial(materialId) { return materialRow(await one('SELECT * FROM studio_learning_materials WHERE material_id=?', [materialId])); }

    async function revisionRows(tableRevisionId) {
      const rows = await q(`SELECT rv.*,trr.order_index,trr.caption_segment_id,trr.source_segment_ids_json,trr.mapping_meta_json
        FROM studio_table_revision_rows trr JOIN studio_learning_row_versions rv ON rv.row_version_id=trr.row_version_id
        WHERE trr.table_revision_id=? ORDER BY trr.order_index`, [tableRevisionId]);
      return rows.map((row) => Core.normalizeRow({
        stable_row_id: row.stable_row_id, he_plain: row.he_plain, he_niqqud: row.he_niqqud,
        translit: row.translit, translit_ru: row.translit_ru, ru: row.ru,
        field_meta: parse(row.field_meta_json, {}), caption_segment_id: row.caption_segment_id,
        source_segment_ids: parse(row.source_segment_ids_json, []), mapping_meta: parse(row.mapping_meta_json, {}),
      }, Number(row.order_index)));
    }

    async function getRevision(tableRevisionId) {
      const row = await one('SELECT * FROM studio_table_revisions WHERE table_revision_id=?', [tableRevisionId]);
      if (!row) return null;
      return {
        table_revision_id: row.table_revision_id, material_id: row.material_id,
        revision_no: Number(row.revision_no), parent_revision_id: row.parent_revision_id || null,
        bound_caption_revision_id: row.bound_caption_revision_id || null,
        bound_caption_revision_sha256: row.bound_caption_revision_sha256 || null,
        content_sha256: row.content_sha256, mapping_sha256: row.mapping_sha256,
        provider_context: parse(row.provider_context_json, {}), impact: parse(row.impact_json, {}),
        created_at: row.created_at, committed_at: row.committed_at,
        rows: await revisionRows(tableRevisionId),
      };
    }

    async function getCurrentRevision(materialId) {
      const material = await getMaterial(materialId);
      return material && material.current_table_revision_id ? getRevision(material.current_table_revision_id) : null;
    }

    async function listHistory(materialId) {
      const rows = await q('SELECT table_revision_id FROM studio_table_revisions WHERE material_id=? ORDER BY revision_no DESC', [materialId]);
      const out = [];
      for (const row of rows) out.push(await getRevision(row.table_revision_id));
      return out;
    }

    async function insertRevision(snapshot, values) {
      const ts = values.created_at || now();
      const revisionId = await stableId('table-revision', { material_id: values.material_id, revision_no: values.revision_no, parent_revision_id: values.parent_revision_id || null, content_sha256: snapshot.content_sha256, mapping_sha256: snapshot.mapping_sha256 });
      await r(`INSERT INTO studio_table_revisions(table_revision_id,material_id,revision_no,parent_revision_id,bound_caption_revision_id,bound_caption_revision_sha256,content_sha256,mapping_sha256,provider_context_json,impact_json,created_at,committed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [revisionId, values.material_id, values.revision_no, values.parent_revision_id || null, values.bound_caption_revision_id || null, values.bound_caption_revision_sha256 || null, snapshot.content_sha256, snapshot.mapping_sha256, json(snapshot.provider_context), json(values.impact || {}), ts, ts]);
      for (let index = 0; index < snapshot.rows.length; index++) {
        const row = snapshot.rows[index];
        const rowHash = await Core.sha256Hex({ stable_row_id: row.stable_row_id, he_plain: row.he_plain, he_niqqud: row.he_niqqud, translit: row.translit, translit_ru: row.translit_ru, ru: row.ru, field_meta: row.field_meta });
        const rowVersionId = 'row-version:' + rowHash.slice(0, 32);
        await r(`INSERT OR IGNORE INTO studio_learning_row_versions(row_version_id,stable_row_id,content_sha256,he_plain,he_niqqud,translit,translit_ru,ru,field_meta_json,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`, [rowVersionId, row.stable_row_id, rowHash, row.he_plain, row.he_niqqud, row.translit, row.translit_ru, row.ru, json(row.field_meta), ts]);
        await r(`INSERT INTO studio_table_revision_rows(table_revision_id,row_version_id,order_index,caption_segment_id,source_segment_ids_json,mapping_meta_json)
          VALUES(?,?,?,?,?,?)`, [revisionId, rowVersionId, index, row.caption_segment_id, json(row.source_segment_ids), json(row.mapping_meta || {})]);
      }
      return revisionId;
    }

    async function promoteLegacyText(textId) {
      const existing = await getMaterialByText(textId);
      if (existing) return existing;
      const text = await one('SELECT id,text_key,source_meta_json FROM texts WHERE id=?', [textId]);
      if (!text) throw error('TEXT_NOT_FOUND');
      const sentences = await q('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index', [textId]);
      if (!sentences.length) throw error('TEXT_HAS_NO_ROWS');
      const binding = await one('SELECT * FROM studio_text_media_bindings WHERE text_id=?', [textId]);
      const textMeta = parse(text.source_meta_json, {}) || {};
      const legacyRows = sentences.map((sentence, index) => ({
        stable_row_id: String(sentence.id), he_plain: sentence.he_plain, he_niqqud: sentence.he_niqqud,
        translit: sentence.translit, translit_ru: sentence.translit_ru, ru: sentence.ru,
        field_meta: inferFieldMeta(sentence, textMeta), ...mappingForIndex(binding, index),
      }));
      const snapshot = await Core.createTableSnapshot({ rows: legacyRows, provider_context: { provider: textMeta.provider || sentences[0].translation_provider || '', model: textMeta.model || textMeta.translator_version || '' } });
      const materialId = await stableId('material', { text_id: text.id, portable_text_key: text.text_key || null });
      const ts = now();
      return transaction(async () => {
        const raced = await one('SELECT * FROM studio_learning_materials WHERE text_id=?', [textId]);
        if (raced) return materialRow(raced);
        await r(`INSERT INTO studio_learning_materials(material_id,package_id,text_id,portable_text_key,current_table_revision_id,created_at,updated_at)
          VALUES(?,?,?,?,NULL,?,?)`, [materialId, binding && binding.package_id || null, text.id, text.text_key || null, ts, ts]);
        const revisionId = await insertRevision(snapshot, { material_id: materialId, revision_no: 1, bound_caption_revision_id: binding && binding.revision_id, bound_caption_revision_sha256: binding && binding.revision_sha256, impact: { kind: 'legacy_promotion', zero_provider_calls: true }, created_at: ts });
        await r('UPDATE studio_learning_materials SET current_table_revision_id=? WHERE material_id=?', [revisionId, materialId]);
        return getMaterial(materialId);
      });
    }

    function projectionMeta(existingJson, row, materialId, revisionId) {
      const existing = parse(existingJson, {}) || {};
      const edited = { ...(existing.edited || {}) };
      for (const field of Core.FIELD_NAMES) if (row.field_meta[field] && row.field_meta[field].authority === 'user') edited[field] = true;
      return json({ ...existing, edited, _studio_material: { schema: 'material-projection-v1', material_id: materialId, table_revision_id: revisionId, field_meta: row.field_meta } });
    }

    function projectionProvider(row) {
      const providerFields = {};
      for (const field of Core.FIELD_NAMES) {
        const meta = row.field_meta && row.field_meta[field];
        if (meta && meta.authority === 'provider') providerFields[field] = meta;
      }
      const first = Object.values(providerFields)[0] || null;
      return { provider: first && first.provider || null, meta: Object.keys(providerFields).length ? json({ schema: 'material-field-provenance-v1', fields: providerFields }) : null };
    }

    async function projectRows(material, revisionId, rows) {
      const existing = await q('SELECT id,edit_meta_json,created_at FROM sentences WHERE text_id=?', [material.text_id]);
      const byId = new Map(existing.map((row) => [String(row.id), row]));
      const wanted = new Set(rows.map((row) => row.stable_row_id));
      const sentenceColumns = new Set((await q('PRAGMA table_info(sentences)')).map((column) => String(column.name)));
      const clearAudioSql = sentenceColumns.has('audio_asset_key') ? ',audio_asset_key=NULL,audio_tts_profile_json=NULL' : '';
      await r('UPDATE sentences SET order_index=-(order_index+1) WHERE text_id=?', [material.text_id]);
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index], old = byId.get(row.stable_row_id);
        const editMeta = projectionMeta(old && old.edit_meta_json, row, material.material_id, revisionId);
        const provider = projectionProvider(row);
        if (old) {
          await r(`UPDATE sentences SET order_index=?,he_plain=?,he_niqqud=?,translit=?,translit_ru=?,ru=?,edit_meta_json=?,translation_provider=?,translation_meta_json=?${clearAudioSql} WHERE id=? AND text_id=?`,
            [index, row.he_plain, row.he_niqqud, row.translit, row.translit_ru, row.ru, editMeta, provider.provider, provider.meta, row.stable_row_id, material.text_id]);
        } else {
          await r(`INSERT INTO sentences(id,text_id,order_index,he_plain,he_niqqud,translit,translit_ru,ru,meta_json,edit_meta_json,translation_provider,translation_meta_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,NULL,?,?,?,?)`, [row.stable_row_id, material.text_id, index, row.he_plain, row.he_niqqud, row.translit, row.translit_ru, row.ru, editMeta, provider.provider, provider.meta, now()]);
        }
      }
      for (const old of existing) if (!wanted.has(String(old.id))) await r('DELETE FROM sentences WHERE id=? AND text_id=?', [old.id, material.text_id]);
      await r(`UPDATE sentences SET meta_json=json_remove(meta_json,'$.niqqud_derived') WHERE text_id=? AND meta_json IS NOT NULL AND json_valid(meta_json) AND json_type(meta_json,'$.niqqud_derived') IS NOT NULL`, [material.text_id]);
      await r('UPDATE texts SET updated_at=? WHERE id=?', [now(), material.text_id]);
    }

    async function commitRevision(input) {
      const material = await getMaterial(input && input.material_id);
      if (!material) throw error('MATERIAL_NOT_FOUND');
      if (!input.base_table_revision_id) throw error('BASE_TABLE_REVISION_REQUIRED');
      const base = await getRevision(input.base_table_revision_id);
      if (!base || base.material_id !== material.material_id) throw error('TABLE_BASE_INVALID');
      const snapshot = await Core.createTableSnapshot({ rows: input.rows, provider_context: input.provider_context || base.provider_context });
      return transaction(async () => {
        const locked = await one('SELECT * FROM studio_learning_materials WHERE material_id=?', [material.material_id]);
        if (!locked || locked.current_table_revision_id !== input.base_table_revision_id) throw error('TABLE_BASE_STALE');
        const nextNo = Number((await one('SELECT COALESCE(MAX(revision_no),0)+1 AS n FROM studio_table_revisions WHERE material_id=?', [material.material_id])).n);
        const revisionId = await insertRevision(snapshot, { material_id: material.material_id, revision_no: nextNo, parent_revision_id: base.table_revision_id, bound_caption_revision_id: input.bound_caption_revision_id || base.bound_caption_revision_id, bound_caption_revision_sha256: input.bound_caption_revision_sha256 || base.bound_caption_revision_sha256, impact: input.impact || {}, created_at: now() });
        inject(input.fault_inject, 'after_revision_insert');
        await projectRows(material, revisionId, snapshot.rows);
        inject(input.fault_inject, 'after_projection');
        const advanced = await r('UPDATE studio_learning_materials SET current_table_revision_id=?,updated_at=? WHERE material_id=? AND current_table_revision_id=?', [revisionId, now(), material.material_id, input.base_table_revision_id]);
        if (advanced && Number(advanced.changes) === 0) throw error('TABLE_BASE_STALE');
        inject(input.fault_inject, 'before_commit');
        return getRevision(revisionId);
      });
    }

    return { promoteLegacyText, getMaterial, getMaterialByText, getRevision, getCurrentRevision, listHistory, commitRevision };
  }

  return { createRepository };
});
