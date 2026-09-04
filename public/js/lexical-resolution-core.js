/* Append-only lexical occurrence decisions. Pure: no DB, DOM, network or SRS. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LexicalResolutionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTIONS = new Set(['confirm_candidate', 'manual_correction', 'reject_all', 'defer', 'clear']);
  const ACTORS = new Set(['owner', 'teacher']);
  const ANALYSIS_FIELDS = ['lemma', 'lp_pos', 'pealim_id', 'root', 'binyan', 'meaning_ru'];

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key] = canonical(value[key]);
      return out;
    }
    return value === undefined ? null : value;
  }
  function stableStringify(value) { return JSON.stringify(canonical(value)); }
  async function sha256Hex(value) {
    const input = typeof value === 'string' ? value : stableStringify(value);
    if (typeof require === 'function') {
      try { return require('node:crypto').createHash('sha256').update(input, 'utf8').digest('hex'); } catch (_) {}
    }
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('SHA256_UNAVAILABLE');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function text(value) { return value == null ? '' : String(value).trim(); }
  function analysis(value) {
    const out = {};
    for (const field of ANALYSIS_FIELDS) out[field] = text(value && value[field]);
    return out;
  }
  async function sourceAnchor(item) {
    return 'sha256:' + await sha256Hex({
      text_key: text(item && item.text_key), order_index: Number(item && item.order_index),
      word_offset: Number(item && item.word_offset),
      surface: text(item && (item.niqqud || item.surface)), sentence: text(item && (item.sentence_he_niqqud || item.sentence_he))
    });
  }
  async function candidateFingerprint(item) {
    const values = (item && item.alternatives || []).concat(item && item.candidate_evidence || [])
      .map((x) => canonical(x)).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return 'sha256:' + await sha256Hex(values);
  }
  function normalizeEvent(raw) {
    const action = text(raw && raw.action);
    const actor = text(raw && raw.actor_kind);
    if (!text(raw && raw.id)) throw new Error('LEXICAL_EVENT_ID_REQUIRED');
    if (!text(raw && raw.occurrence_id)) throw new Error('LEXICAL_OCCURRENCE_ID_REQUIRED');
    if (!text(raw && raw.text_id) || !text(raw && raw.sentence_id) || !text(raw && raw.text_key)) throw new Error('LEXICAL_EVENT_ANCHOR_REQUIRED');
    if (!Number.isInteger(Number(raw && raw.word_offset)) || Number(raw.word_offset) < 0 ||
        !Number.isInteger(Number(raw && raw.order_index)) || Number(raw.order_index) < 0) throw new Error('LEXICAL_EVENT_POSITION_INVALID');
    if (!text(raw && raw.source_anchor) || !text(raw && raw.candidate_fingerprint)) throw new Error('LEXICAL_EVENT_FINGERPRINT_REQUIRED');
    if (!text(raw && raw.created_at)) throw new Error('LEXICAL_EVENT_CREATED_AT_REQUIRED');
    if (!ACTIONS.has(action)) throw new Error('LEXICAL_ACTION_INVALID');
    if (!ACTORS.has(actor)) throw new Error('LEXICAL_ACTOR_INVALID');
    const chosen = analysis(raw && raw.chosen_analysis);
    if ((action === 'confirm_candidate' || action === 'manual_correction') && (!chosen.lemma || !chosen.lp_pos)) {
      throw new Error('LEXICAL_CHOSEN_ANALYSIS_REQUIRED');
    }
    return {
      id: text(raw.id), occurrence_id: text(raw.occurrence_id), text_id: text(raw.text_id),
      sentence_id: text(raw.sentence_id), word_offset: Number(raw.word_offset), text_key: text(raw.text_key),
      order_index: Number(raw.order_index), surface_norm: text(raw.surface_norm),
      source_anchor: text(raw.source_anchor), action, chosen_analysis: chosen,
      candidate_fingerprint: text(raw.candidate_fingerprint), morph_model_version: text(raw.morph_model_version),
      actor_kind: actor, batch_id: text(raw.batch_id), supersedes_id: text(raw.supersedes_id),
      note: text(raw.note), created_at: text(raw.created_at)
    };
  }
  function latest(events, occurrenceId) {
    return (events || []).filter((e) => text(e && e.occurrence_id) === text(occurrenceId))
      .map(normalizeEvent).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).pop() || null;
  }
  function evaluate(item, events) {
    const event = latest(events, item && item.lp_occurrence_id);
    if (!event || event.action === 'clear') return { state: 'unresolved', event, chosen_analysis: null };
    if (!event.source_anchor || event.source_anchor !== text(item && item.source_anchor)) return { state: 'stale', event, chosen_analysis: null, stale_reason: 'source_anchor_changed' };
    if (event.action !== 'manual_correction' && event.candidate_fingerprint !== text(item && item.candidate_fingerprint)) {
      return { state: 'stale', event, chosen_analysis: null, stale_reason: 'candidate_set_changed' };
    }
    if (event.action === 'defer') return { state: 'deferred', event, chosen_analysis: null };
    if (event.action === 'reject_all') return { state: 'rejected_all', event, chosen_analysis: null };
    return { state: 'resolved', event, chosen_analysis: event.chosen_analysis };
  }
  function applyOverlay(item, evaluation) {
    const out = Object.assign({}, item, { resolution_state: evaluation.state, resolution_event_id: evaluation.event && evaluation.event.id || '' });
    if (evaluation.state !== 'resolved') return out;
    Object.assign(out, evaluation.chosen_analysis, {
      ambiguity: false, identity_guard_reason: '', verification_state: evaluation.event.actor_kind + '_confirmed'
    });
    return out;
  }

  return { ACTIONS: Array.from(ACTIONS), ACTORS: Array.from(ACTORS), ANALYSIS_FIELDS, stableStringify, sha256Hex, sourceAnchor, candidateFingerprint, normalizeEvent, latest, evaluate, applyOverlay };
});
