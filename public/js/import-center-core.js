// Studio Ingest P4 — pure lifecycle, backup truth and safe-action model.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImportCenterCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CANONICAL_BACKUP_FORMATS = new Set(['full_zip', 'archive_lplp', 'snapshot_lplp', 'text_zip']);
  const HASH = /^[a-f0-9]{64}$/;

  function canonicalJson(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new Error('IMPORT_CENTER_CANONICAL_NUMBER_INVALID');
      return String(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (!value || typeof value !== 'object') throw new Error('IMPORT_CENTER_CANONICAL_VALUE_INVALID');
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }

  async function sha256(value) {
    const text = String(value);
    if (typeof require === 'function') return require('node:crypto').createHash('sha256').update(text, 'utf8').digest('hex');
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function sourceStateDescriptor(value) {
    const input = value || {};
    return {
      portable_scope_id: String(input.portable_scope_id || ''),
      caption_sha256: String(input.caption_sha256 || input.caption_current_sha256 || ''),
      table_content_sha256: String(input.table_content_sha256 || ''),
      table_mapping_sha256: String(input.table_mapping_sha256 || ''),
      media_sha256: String(input.media_sha256 || input.media_expected_sha256 || ''),
    };
  }

  async function sourceStateHash(value) {
    return sha256(canonicalJson(sourceStateDescriptor(value)));
  }

  function projectionState(item) {
    // F2: «материала ещё нет» — не то же самое, что «материал пропал». Первое — обычное состояние
    // карточки, которую ни разу не готовили к переносу; второе — повреждение.
    if (item.import_integrity_state === 'not-promoted') return item.projection_present ? 'present' : 'conflict';
    if (!item.material_id && item.projection_present) return 'conflict';
    if (item.import_integrity_state === 'conflict') return 'conflict';
    if (item.projection_archived) return 'archived';
    if (item.projection_present) return 'present';
    return item.projection_rebuildable ? 'missing-rebuildable' : 'conflict';
  }

  function captionState(item) {
    if (!item.caption_current_revision_id) return item.caption_raw_present ? 'raw-only' : 'missing';
    return item.caption_draft_present ? 'draft' : 'corrected-current';
  }

  function tableState(item) {
    if (!item.table_current_revision_id) return 'missing';
    if (item.table_conflict) return 'conflict';
    const idMismatch = item.caption_current_revision_id && item.table_bound_caption_revision_id &&
      String(item.caption_current_revision_id) !== String(item.table_bound_caption_revision_id);
    const shaMismatch = item.caption_current_sha256 && item.table_bound_caption_revision_sha256 &&
      String(item.caption_current_sha256) !== String(item.table_bound_caption_revision_sha256);
    return idMismatch || shaMismatch ? 'stale' : 'current';
  }

  function mappingState(item) {
    if (item.mapping_invalid) return 'invalid';
    const total = Number(item.mapping_total || 0), mapped = Number(item.mapping_mapped || 0);
    if (!total || !mapped) return 'zero';
    return mapped === total ? 'exact' : 'partial';
  }

  function mediaState(item) {
    if (!item.media_expected_sha256) return 'unverified';
    if (!item.media_present) return 'missing';
    if (item.media_actual_sha256 && String(item.media_actual_sha256).toLowerCase() !== String(item.media_expected_sha256).toLowerCase()) return 'sha-mismatch';
    if (item.media_codec_supported === false) return 'unsupported-codec';
    return 'present';
  }

  function importState(item) {
    const value = String(item.import_integrity_state || 'native');
    if (value === 'not-promoted') return 'not-promoted';
    if (value === 'complete') return 'imported-complete';
    if (value === 'repairable-binding' || value === 'repairable-source') return 'repairable';
    if (value === 'archived') return 'archived';
    if (value === 'conflict') return 'conflict';
    return 'native';
  }

  function backupState(item, receipts) {
    const scope = String(item.portable_scope_id || '');
    const relevant = (receipts || []).filter((receipt) => receipt && receipt.scope_kind === 'material' &&
      String(receipt.portable_scope_id || '') === scope && CANONICAL_BACKUP_FORMATS.has(receipt.format_kind));
    const generated = new Map(relevant.filter((receipt) => receipt.event_kind === 'generated').map((receipt) => [String(receipt.receipt_id), receipt]));
    const saved = relevant.filter((receipt) => receipt.event_kind === 'owner_saved' && generated.has(String(receipt.parent_receipt_id)));
    if (saved.some((receipt) => String(receipt.source_state_sha256) === String(item.source_state_sha256))) return 'current';
    if (saved.length) return 'stale';
    if (generated.size) return 'generated-unconfirmed';
    return 'none';
  }

  function route(item, states) {
    const integrity = String(item.import_integrity_state || 'native');
    // Единственное действие, которое здесь честно: подготовить карточку к переносу. Ни backup, ни
    // recovery для неё не определены — переносить пока нечего.
    if (integrity === 'not-promoted') return ['not-prepared', 'prepare-transfer'];
    if (states.projection_state === 'conflict' || states.table_state === 'conflict' || states.mapping_state === 'invalid' ||
        states.media_state === 'sha-mismatch' || states.import_state === 'conflict') return ['blocked', 'inspect-recovery'];
    if (integrity === 'archived') return ['needs-recovery', 'unarchive'];
    if (integrity === 'repairable-binding') return ['needs-recovery', 'repair-binding'];
    if (integrity === 'repairable-source' || states.projection_state === 'missing-rebuildable') return ['needs-recovery', 'recover-from-package'];
    if (states.caption_state === 'draft') return ['ready', 'continue-correction'];
    if (states.media_state === 'missing') return ['needs-media', 'relink-media'];
    if (states.table_state === 'stale') return ['needs-recovery', 'create-table-revision'];
    if (states.backup_state === 'generated-unconfirmed') return ['needs-backup', 'confirm-backup'];
    if (states.backup_state !== 'current') return ['needs-backup', 'create-backup'];
    return ['ready', 'continue-study'];
  }

  function buildCatalog(inventory, exportReceipts, capabilities, now) {
    return (inventory || []).map((item) => {
      const states = {
        projection_state: projectionState(item),
        caption_state: captionState(item),
        table_state: tableState(item),
        mapping_state: mappingState(item),
        media_state: mediaState(item),
        import_state: importState(item),
      };
      states.backup_state = backupState(item, exportReceipts);
      const [continuity_state, next_action] = route(item, states);
      return {
        ...item,
        ...states,
        // Стабильный адрес карточки в каталоге. Непромоутнутая адресуется по тексту — выдумывать
        // ей material_id значило бы протащить фальшивый идентификатор в пути экспорта.
        catalog_key: item.material_id ? String(item.material_id) : 'text:' + String(item.text_id || ''),
        continuity_state,
        next_action,
        study_without_media: states.media_state === 'missing' && states.table_state !== 'missing',
        capabilities: capabilities || {},
        derived_at: now || null,
      };
    });
  }

  function lifecycleGroup(item) {
    if (item && (item.entity_kind === 'workspace-draft' || item.continuity_state === 'draft')) return 'draft';
    return item && item.continuity_state === 'ready' ? 'ready' : 'attention';
  }

  // B3: one read-only projection over the two existing authorities. A workspace already owned by
  // a learning material is represented by that material only. An unmatched workspace is exposed
  // as a draft address, but no material id, revision or promotion is invented during the read.
  function mergeLifecycleCatalog(materialCatalog, workspaces, now) {
    const canonical = (materialCatalog || []).map((item) => ({
      ...item,
      entity_kind: item.entity_kind || 'learning-material',
      lifecycle_group: lifecycleGroup(item),
    }));
    const representedPackages = new Set(canonical.map((item) => String(item.package_id || '')).filter(Boolean));
    const drafts = [];
    for (const row of (workspaces || [])) {
      const packageId = String(row && row.package_id || '');
      const trackId = String(row && (row.track_id || row.corrected_track_id) || '');
      if (!packageId || !trackId || representedPackages.has(packageId)) continue;
      representedPackages.add(packageId);
      drafts.push({
        entity_kind: 'workspace-draft', lifecycle_group: 'draft', material_id: null,
        catalog_key: `workspace:${packageId}:${trackId}`, package_id: packageId,
        binding_track_id: trackId, track_id: trackId,
        title: row.title || row.original_name || null, original_name: row.original_name || row.title || null,
        mime: row.mime || row.media_kind || null, updated_at: row.updated_at || null,
        projection_state: 'present', caption_state: row.has_draft ? 'draft' : 'corrected-current',
        table_state: 'missing', mapping_state: 'not-applicable',
        media_state: row.media_missing ? 'missing' : 'present', backup_state: 'none', import_state: 'native',
        continuity_state: 'draft', next_action: 'continue-correction', study_without_media: false,
        capabilities: {}, derived_at: now || null,
      });
    }
    return canonical.concat(drafts);
  }

  function filterLifecycleCatalog(catalog, filter) {
    if (!filter || filter === 'all') return (catalog || []).slice();
    return (catalog || []).filter((item) => lifecycleGroup(item) === filter);
  }

  function buildDeletePlan(input) {
    const value = input || {}, referenced = Math.max(0, Number(value.referenced_count || 0));
    const reused = Math.max(0, Number(value.reused_count || 0)), created = Math.max(0, Number(value.created_count || 0));
    return {
      can_delete: referenced === 0,
      next_action: 'export-before-delete',
      delete_created_count: referenced === 0 ? created : 0,
      retain_count: reused + referenced,
      external_files_deleted: false,
    };
  }

  function validateReceiptInput(value) {
    const receipt = value || {};
    if (!['generated', 'owner_saved'].includes(receipt.event_kind)) throw new Error('EXPORT_EVENT_KIND_INVALID');
    if (!['library', 'material', 'text_card'].includes(receipt.scope_kind)) throw new Error('EXPORT_SCOPE_KIND_INVALID');
    if (!['full_zip', 'archive_lplp', 'snapshot_lplp', 'text_zip', 'compatibility_json'].includes(receipt.format_kind)) throw new Error('EXPORT_FORMAT_KIND_INVALID');
    for (const key of ['source_state_sha256', 'artifact_sha256']) if (!HASH.test(String(receipt[key] || ''))) throw new Error('EXPORT_HASH_INVALID:' + key);
    if (!Number.isSafeInteger(Number(receipt.size_bytes)) || Number(receipt.size_bytes) < 0) throw new Error('EXPORT_SIZE_INVALID');
    return true;
  }

  return { CANONICAL_BACKUP_FORMATS, canonicalJson, sha256, sourceStateDescriptor, sourceStateHash,
    buildCatalog, mergeLifecycleCatalog, filterLifecycleCatalog, buildDeletePlan, validateReceiptInput };
});
