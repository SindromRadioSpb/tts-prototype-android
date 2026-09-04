/* Repository for append-only lexical_resolution_events. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LexicalResolutionRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fail(code) { const e=new Error(code); e.code=code; return e; }
  function parse(value) { try { return value ? JSON.parse(value) : {}; } catch (_) { return {}; } }
  function createRepository(adapter, Core) {
    if (!adapter || !adapter.dbQuery || !adapter.dbRun || !adapter.execRaw) throw fail('LEXICAL_REPOSITORY_ADAPTER_REQUIRED');
    if (!Core || !Core.normalizeEvent) throw fail('LEXICAL_RESOLUTION_CORE_REQUIRED');
    const q=(sql,p=[])=>adapter.dbQuery(sql,p), r=(sql,p=[])=>adapter.dbRun(sql,p), x=(sql)=>adapter.execRaw(sql);
    function fromRow(row) { return row && Core.normalizeEvent({...row, chosen_analysis:parse(row.chosen_json)}); }
    async function append(raw) {
      const e=Core.normalizeEvent(raw);
      const chosen=(e.action==='confirm_candidate'||e.action==='manual_correction') ? JSON.stringify(e.chosen_analysis) : null;
      try {
        await r(`INSERT INTO lexical_resolution_events
          (id,occurrence_id,text_id,sentence_id,word_offset,text_key,order_index,surface_norm,source_anchor,action,chosen_json,candidate_fingerprint,morph_model_version,actor_kind,batch_id,supersedes_id,note,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [e.id,e.occurrence_id,e.text_id,e.sentence_id,e.word_offset,e.text_key,e.order_index,e.surface_norm,e.source_anchor,e.action,chosen,e.candidate_fingerprint,e.morph_model_version||null,e.actor_kind,e.batch_id||null,e.supersedes_id||null,e.note||null,e.created_at]);
        return {inserted:true,event:e};
      } catch (err) {
        const rows=await q('SELECT * FROM lexical_resolution_events WHERE id=?',[e.id]);
        if (!rows.length) throw err;
        const existing=fromRow(rows[0]);
        if (Core.stableStringify(existing)!==Core.stableStringify(e)) throw fail('LEXICAL_EVENT_ID_COLLISION');
        return {inserted:false,event:existing};
      }
    }
    async function appendBatch(rawEvents) {
      const events=(rawEvents||[]).map(Core.normalizeEvent);
      if (!events.length) throw fail('LEXICAL_BATCH_EMPTY');
      if (new Set(events.map((e)=>e.occurrence_id)).size!==events.length) throw fail('LEXICAL_BATCH_DUPLICATE_OCCURRENCE');
      const batchIds=new Set(events.map((e)=>e.batch_id).filter(Boolean));
      if (batchIds.size!==1 || events.some((e)=>!e.batch_id)) throw fail('LEXICAL_BATCH_ID_REQUIRED');
      await x('BEGIN;');
      try { const out=[]; for (const e of events) out.push(await append(e)); await x('COMMIT;'); return out; }
      catch (err) { try { await x('ROLLBACK;'); } catch (_) {} throw err; }
    }
    async function listForText(textId) { return (await q('SELECT * FROM lexical_resolution_events WHERE text_id=? ORDER BY created_at,id',[String(textId)])).map(fromRow); }
    async function listForOccurrence(occurrenceId) { return (await q('SELECT * FROM lexical_resolution_events WHERE occurrence_id=? ORDER BY created_at,id',[String(occurrenceId)])).map(fromRow); }
    return {append,appendBatch,listForText,listForOccurrence};
  }
  return {createRepository};
});
