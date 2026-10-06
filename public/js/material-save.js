// Immutable save intent and storage orchestration. UI/session presentation stays in Studio.
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./material-open') : root.MaterialOpen);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaterialSave = api;
})(typeof globalThis === 'object' ? globalThis : this, function(MaterialOpen) {
  'use strict';
  const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
  const changed = () => Object.assign(new Error('MATERIAL_CONTEXT_CHANGED'), { code: 'MATERIAL_CONTEXT_CHANGED' });
  function capture(readState, targetId) {
    const initial = readState(), operation = initial.operation, originalRows = initial.rows;
    const session = clone(initial.session || {}), sourceText = String(initial.sourceText || '').trim();
    if (operation && (!operation.painted || (session.textId && String(session.textId) !== operation.id))) throw changed();
    MaterialOpen.assertSaveIdentity(targetId, session, originalRows);
    const serializedRows = JSON.stringify(originalRows), serializedSession = JSON.stringify(session);
    const isCurrent = () => {
      const state = readState();
      return state.operation === operation && state.rows === originalRows &&
        String(state.sourceText || '').trim() === sourceText &&
        JSON.stringify(state.session || {}) === serializedSession && JSON.stringify(state.rows) === serializedRows;
    };
    return { session, sourceText, rows: JSON.parse(serializedRows),
      tableModelMeta: clone(initial.tableModelMeta), audio: clone(initial.audio), ttsProfile: clone(initial.ttsProfile),
      isCurrent, assertCurrent() { if (!isCurrent()) throw changed(); } };
  }
  // Prepare synchronously before quota, DB or media resolution can yield to another action.
  function prepare(save, meta, normalizeTags) {
    const options = clone(meta && typeof meta === 'object' ? meta : {}) || {};
    const api = globalThis.BenYehudaLearningNiqqud;
    const rows = clone(save.rows).map(row => api ? api.restoreSource(row) : row);
    const payload = { sourceText: save.sourceText, rows, ttsProfile: clone(save.ttsProfile),
      tableModelMeta: clone(save.tableModelMeta), tags: normalizeTags(options.tags) };
    for (const key of ['title', 'level', 'source', 'topic']) payload[key] = String(options[key] || '').trim() || null;
    return { save, payload, options };
  }
  async function commitCreate(prepared, deps) {
    const { save, options: m } = prepared, payload = clone(prepared.payload);
    const { sourceText, title, level, tags, source, topic } = payload;
    const { localMode, getDb, resolveMedia, mediaPassport, mediaPackage, studioImport, playbackSource,
      revisionRepository, revisionCore, parseJsonObject, translationFields, postJson,
      newId = () => crypto.randomUUID(), onProgress = () => {} } = deps;
    const warnings = [];
    let text;
    if (localMode) {
      const ldb = await getDb();
      // W2: saving performs its own W1 proof. A stale ambient ref is never enough to bind,
      // and a reload between table-build and save cannot turn media loss into silence.
      save.assertCurrent();
      const media = await resolveMedia();
      save.assertCurrent();
      const saveMediaContext = clone(media.context), saveMediaResolution = clone(media.resolution);
      const saveMediaIntended = !!saveMediaContext || !!(saveMediaResolution && saveMediaResolution.media_intended) ||
        !!mediaPassport(payload.tableModelMeta && payload.tableModelMeta.source);
      // W3 timing is an open-time derivation. Keep it live for row provenance below, but never
      // serialize the partial result into the card's canonical passport.
      if (mediaPackage && mediaPackage.withoutDerivedMediaTiming) {
        payload.tableModelMeta = mediaPackage.withoutDerivedMediaTiming(payload.tableModelMeta);
      }
      // The Import Center rebuild route does not run LearningMaterialTask's later
      // bindPlaybackSource step. Promote the YouTube acquisition reference into the card's
      // canonical playback_source while saving, so reopening a Google/Gemini table keeps the
      // embedded player and row playback controls. Never replace an explicit saved choice.
      if (playbackSource && payload.tableModelMeta &&
          !Object.prototype.hasOwnProperty.call(payload.tableModelMeta, 'playback_source')) {
        const importedPlayback = playbackSource.fromLegacy(
          mediaPassport(payload.tableModelMeta && payload.tableModelMeta.source));
        if (importedPlayback) payload.tableModelMeta = Object.assign({}, payload.tableModelMeta, {
          playback_source: importedPlayback,
        });
      }
      const mediaSha = saveMediaContext && saveMediaContext.package && saveMediaContext.package.media_sha256
        ? String(saveMediaContext.package.media_sha256).toLowerCase()
        : (studioImport && studioImport.mediaSourceSha)
        ? studioImport.mediaSourceSha(payload.tableModelMeta && payload.tableModelMeta.source)
        : null;
      const task = m.learningMaterialTask || null;
      if (task && (!/^[0-9a-f-]{36}$/i.test(String(task.id || '')) || !/^[0-9a-f]{64}$/.test(String(task.signature || '')))) throw new Error('TASK_ID_INVALID');
      if (task) {
        const existingTaskText = await ldb.getTextById(task.id);
        if (existingTaskText) {
          const existingTaskMeta = parseJsonObject(existingTaskText.source_meta_json);
          if (!existingTaskMeta || !existingTaskMeta.learning_material_task || existingTaskMeta.learning_material_task.signature !== task.signature) throw new Error('TASK_SAVE_CONFLICT');
          return { text: existingTaskText, existing: true };
        }
        payload.tableModelMeta = Object.assign({}, payload.tableModelMeta || {}, {learning_material_task:{id:task.id,signature:task.signature}});
      }
      if (mediaSha && m.allowDuplicateMedia !== true && typeof ldb.findTextsByMediaSha === "function") {
        const duplicates = await ldb.findTextsByMediaSha(mediaSha);
        save.assertCurrent();
        if (duplicates.length) {
          // Do not silently mint another random text_key for the same physical media. Bind the
          // existing card as an explicit update target; the modal then offers Update or Save as
          // new (the latter passes allowDuplicateMedia=true below).
          const existing = duplicates[0];
          return { reason: 'duplicate-media', existing };
        }
      }
      const newTextId = task ? task.id : newId();
      const textKey = 'text-' + Date.now();
      let mediaBindingOutcome = null;
      save.assertCurrent();
      await ldb.execRaw('BEGIN;');
      try {
        await ldb.createText({
          id: newTextId, text_key: textKey,
          title: title || null, source_text: sourceText,
          level: level || null, tags_json: JSON.stringify(tags || []),
          source: source || null, topic: topic || null,
          tts_profile_json: JSON.stringify(payload.ttsProfile || null),
          source_meta_json: JSON.stringify(payload.tableModelMeta || null),
          table_model_meta_json: JSON.stringify(payload.tableModelMeta || null),
        });
        const l3Rows = [];
        const sentenceRows = [];
        for (const [rowIndex, row] of payload.rows.entries()) {
          const portableEditMeta = (studioImport && studioImport.rowEditMetaForSave)
            ? studioImport.rowEditMetaForSave(row, saveMediaContext && saveMediaContext.passport || null, rowIndex)
            : (row.edit_meta_json || null);
          const translation = translationFields(row, payload.tableModelMeta);
          sentenceRows.push({
            id: newId(),
            he_plain: row.he || '', he_niqqud: row.he_niqqud || '',
            translit: row.translit || '', translit_ru: row.translit_ru || '',
            ru: row.ru || '', edit_meta_json: portableEditMeta,
            translation_provider: translation.translation_provider,
            translation_meta_json: translation.translation_meta_json,
          });
          try { const em = portableEditMeta ? JSON.parse(portableEditMeta) : null; if (em && em._studio_source) l3Rows.push({ row_index: rowIndex, ...em._studio_source }); } catch (_) {}
        }
        onProgress({ phase: 'rows', written: 0, total: sentenceRows.length });
        await ldb.addSentences(newTextId, sentenceRows, {
          onProgress: (written, total) => onProgress({ phase: 'rows', written, total }),
        });
        const l3ref = saveMediaContext && saveMediaContext.ref || null;
        if (saveMediaIntended && mediaPackage) {
          onProgress({ phase: 'media' });
          // F1 (packet 2026-08-06): какому медиа принадлежит карточка, решает провенанс её строк,
          // а не ambient v3LastMediaPackageRef — тот переживает сущность, которую описывает.
          const l3mapping = { schema: 'studio-row-source-v2', rows: l3Rows };
          const l3target = l3ref ? await mediaPackage.resolveBindTarget(l3ref, l3mapping) : null;
          if (l3target) {
            try {
              const binding = await mediaPackage.browserRepository().bindText({
                text_id: newTextId, package_id: l3target.package_id, track_id: l3target.track_id,
                revision_id: l3target.revision_id, revision_sha256: l3target.revision_sha256,
                mapping: l3mapping,
              });
              mediaBindingOutcome = mediaPackage.buildMediaSaveOutcome({ binding, target: l3target });
            } catch (bindError) {
              if (!bindError || bindError.code !== 'BINDING_PROVENANCE_MISMATCH') throw bindError;
              // The card itself remains valid. Only the disputed binding is refused.
              mediaBindingOutcome = mediaPackage.buildMediaSaveOutcome({ reason: bindError.code });
            }
          } else {
            // Текст и таблица сохраняются полностью; молча привязать чужое медиа — нельзя.
            mediaBindingOutcome = mediaPackage.buildMediaSaveOutcome({
              reason: l3ref ? 'PROVENANCE_DISAGREES' : null, resolution: saveMediaResolution,
            });
          }
          const recordedOutcome = Object.assign({}, mediaBindingOutcome, { recorded_at: new Date().toISOString() });
          payload.tableModelMeta = mediaPackage.attachMediaSaveOutcome(payload.tableModelMeta, recordedOutcome);
          await ldb.updateText(newTextId, {
            source_meta_json: JSON.stringify(payload.tableModelMeta),
            table_model_meta_json: JSON.stringify(payload.tableModelMeta),
          });
        }
        onProgress({ phase: 'commit' });
        await ldb.execRaw('COMMIT;');
      } catch (e) { try { await ldb.execRaw('ROLLBACK;'); } catch (_) {} throw e; }
      // §5 acceptance: a newly saved media card is immediately a first-class learning
      // material, not an Import Center `not-prepared` compatibility projection. This is
      // lazy promotion of this one card only — never a bulk rewrite or schema migration.
      if (saveMediaIntended && revisionRepository && revisionCore) {
        try {
          const materialRepo = revisionRepository.createRepository(ldb, revisionCore);
          await materialRepo.promoteLegacyText(newTextId);
        } catch (promotionError) {
          const promotionOutcome = {
            schema: 'studio-learning-material-save-outcome-v1', status: 'not_promoted',
            reason: String((promotionError && (promotionError.code || promotionError.message)) || 'PROMOTION_FAILED'),
            next_action: 'OPEN_IMPORT_CENTER_PREPARE_TRANSFER', recorded_at: new Date().toISOString(),
          };
          payload.tableModelMeta = Object.assign({}, payload.tableModelMeta || {}, { learning_material_outcome: promotionOutcome });
          await ldb.updateText(newTextId, {
            source_meta_json: JSON.stringify(payload.tableModelMeta),
            table_model_meta_json: JSON.stringify(payload.tableModelMeta),
          });
          warnings.push('promotion-failed');
        }
      }
      text = await ldb.getTextById(newTextId);
      // Outside the optional binding branch by design: "no ref" is an outcome, not silence.
      if (mediaBindingOutcome && mediaBindingOutcome.status === "not_bound") {
        warnings.push('media-not-bound');
      }
    } else {
      save.assertCurrent();
      const created = await postJson("/api/library/texts", payload);
      text = created && created.text ? created.text : null;
    }

    return { text, warnings };
  }
  async function commitUpdate(textId, prepared, deps) {
    const { save } = prepared, payload = clone(prepared.payload);
    const { sourceText, title, level, tags, source, topic } = payload;
    const { localMode, getDb, mediaPackage, studioImport, translationFields, putJson,
      newId = () => crypto.randomUUID() } = deps;
    let text;
    if (localMode) {
      const ldb = await getDb();
      // Premium UX: if the target text was deleted (e.g. user bulk-deleted
      // it earlier in the same session) but session still references it,
      // gracefully fall back to "Сохранить как новый" instead of FK-failing
      // on the sentence loop. This is defense-in-depth — the delete paths
      // also clear session pointers via v3SessionForgetTextIfStale, but
      // we double-check here against any race or older code path.
      const stillExists = await ldb.getTextById(textId);
      save.assertCurrent();
      if (!stillExists) return { reason: 'not-found' };
      if (mediaPackage) {
        const l3binding = await mediaPackage.browserRepository().getTextBinding(String(textId));
        if (l3binding) {
          return { reason: 'media-bound' };
        }
      }
      const replacementRows = payload.rows.map((row, rowIndex) => {
        const portableEditMeta = (studioImport && studioImport.rowEditMetaForSave)
          ? studioImport.rowEditMetaForSave(row, save.audio, rowIndex)
          : (row.edit_meta_json || null);
        const translation = translationFields(row, payload.tableModelMeta);
        return {
          id: newId(),
          he_plain: row.he || '', he_niqqud: row.he_niqqud || '',
          translit: row.translit || '', translit_ru: row.translit_ru || '',
          ru: row.ru || '', edit_meta_json: portableEditMeta,
          translation_provider: translation.translation_provider,
          translation_meta_json: translation.translation_meta_json,
        };
      });
      save.assertCurrent();
      text = await ldb.replaceStudioText(textId, {
        expectedUpdatedAt: save.session.baseUpdatedAt,
        fields: {
          title: title || null, level: level || null,
          tags_json: JSON.stringify(tags || []), source: source || null, topic: topic || null,
          tts_profile_json: JSON.stringify(payload.ttsProfile || null),
          table_model_meta_json: JSON.stringify(payload.tableModelMeta || null),
        },
        rows: replacementRows,
      });
    } else {
      save.assertCurrent();
      const updated = await putJson("/api/library/texts/" + encodeURIComponent(String(textId)), payload);
      text = updated && updated.text ? updated.text : null;
    }

    return { text };
  }
  return { capture, prepare, commitCreate, commitUpdate };
});
