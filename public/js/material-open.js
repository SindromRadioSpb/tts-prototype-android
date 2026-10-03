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
  return {create, createSerialQueue, assertSaveIdentity};
});
