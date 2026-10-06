// One latest-intent boundary for async material opens. No learner-state writes.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MaterialOpen=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function create(options={}) {
    let serial=0, active=null;
    const timings=[];
    const now=options.now||(()=>typeof performance==='object'?performance.now():Date.now());
    return {
      begin(id) {
        const generation=++serial, started=now();
        const op={id:String(id),painted:false,isCurrent:()=>generation===serial,
          mark(phase) { if(!op.isCurrent())return;if(phase==='paint')op.painted=true;const entry={surface:options.surface||'reader',phase,ms:Math.round((now()-started)*100)/100};timings.push(entry);if(timings.length>60)timings.shift(); },
          assertIdentity(text,rows) {
            if(!text||String(text.id)!==op.id||(rows||[]).some(r=>r.text_id!=null&&String(r.text_id)!==op.id))throw new Error('MATERIAL_IDENTITY_MISMATCH');
          }};
        active=op;return op;
      },
      cancel(){serial++;active=null;},
      current(){return active;},
      timings(){return timings.map(row=>({...row}));}
    };
  }
  function sentenceIndex(rows, sentenceId) {
    if (sentenceId == null) return -1;
    return (rows || []).findIndex(row => row &&
      String(row._v3_sentenceId ?? row.id ?? row.sentence_id ?? row.sentenceId) === String(sentenceId));
  }
  // Read model only: no DOM, session changes, progress writes or media activation.
  // All surfaces receive the same validated, ordered data before presenting it.
  async function load(id, options = {}) {
    const isCurrent = options.isCurrent || (() => true);
    const obsolete = () => ({ ok: false, reason: 'superseded' });
    if (!isCurrent()) return obsolete();
    const db = options.localDb;
    if (db && db.isFollower?.() && !db.isProxy?.()) return { ok: false, reason: 'dbBusy' };
    try {
      let text, sentences;
      if (db) {
        [text, sentences] = await Promise.all([db.getTextByIdLite(id), db.getSentences(id)]);
      } else {
        const base = '/api/library/texts/' + encodeURIComponent(id);
        const [meta, rows] = await Promise.all([options.getJson(base), options.getJson(base + '/sentences')]);
        text = meta && (Object.prototype.hasOwnProperty.call(meta, 'text') ? meta.text : meta);
        sentences = rows && (rows.sentences || rows.rows) || [];
      }
      if (!isCurrent()) return obsolete();
      if (!text) return { ok: false, reason: 'notFound' };
      if (String(text.id) !== String(id) || !Array.isArray(sentences) ||
          sentences.some(row => row.text_id != null && String(row.text_id) !== String(id))) {
        return { ok: false, reason: 'identity', error: new Error('MATERIAL_IDENTITY_MISMATCH') };
      }
      let material = { ok: true, text, sentences: sentences.slice().sort((a, b) =>
        Number(a.order_index ?? a.orderIndex ?? 0) - Number(b.order_index ?? b.orderIndex ?? 0)) };
      const prepare = options.prepareMaterial || globalThis.BenYehudaLearningNiqqud?.prepare;
      if (prepare && options.sourceOnly !== true) {
        try { material = await prepare(material, isCurrent); } catch (_) { /* saved source remains available */ }
        if (!isCurrent()) return obsolete();
      }
      return material;
    } catch (error) {
      return isCurrent() ? { ok: false, reason: 'fetch', error } : obsolete();
    }
  }
  // Imports may contain transactions. Queue them while allowing a newer intent
  // to invalidate queued work; a failure must not poison the following import.
  function createSerialQueue() {
    let tail = Promise.resolve();
    return { run(work, isCurrent = () => true) {
      const result = tail.then(() => isCurrent() ? work() : undefined);
      tail = result.catch(() => {});
      return result;
    }};
  }
  function assertSaveIdentity(targetId, session, rows) {
    const activeId = session && (session.baseTextId || session.textId);
    const expected = targetId || activeId;
    if ((targetId && String(targetId) !== String(activeId || '')) ||
        (rows || []).some(row => {
          const id = row._v3_textId || row.text_id;
          return id && expected && String(id) !== String(expected);
        })) throw Object.assign(new Error('MATERIAL_IDENTITY_MISMATCH'), { code: 'MATERIAL_CONTEXT_CHANGED' });
  }
  return {create, load, sentenceIndex, createSerialQueue, assertSaveIdentity};
});
