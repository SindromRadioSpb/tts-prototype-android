// Bounded, expiring read-only projection between isolated storage and ordinary video screen.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StudyVideoTransfer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DB = 'linguistpro-study-video-v1', TTL = 86400000, LIMIT = 5, MAX_BYTES = 5 * 1024 * 1024;
  const ID = /^[a-f0-9]{32}$/;
  function validate(input) {
    if (!input || input.schema !== 1 || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 50000) throw new Error('STUDY_VIDEO_INVALID');
    if (!/^[A-Za-z0-9_-]{11}$/.test(input.video_id || '')) throw new Error('STUDY_VIDEO_INVALID');
    // Project an allowlist. Never carry source metadata, profile, provider config or credentials.
    const out = {schema:1,title:String(input.title || '').slice(0,500),video_id:input.video_id,
      locale:['ru','en','he'].includes(input.locale) ? input.locale : 'ru',
      return_path: /^\/(?:index|library)\.html(?:[?#].*)?$/.test(input.return_path || '') ? input.return_path : '/index.html',
      reason:String(input.reason || '').slice(0,80), rows:input.rows.map(row => ({
        he:String(row.he || '').slice(0,20000),ru:String(row.ru || '').slice(0,20000),tr:String(row.tr || '').slice(0,20000)
      })), entries:null};
    if (input.entries != null) {
      const P = typeof require === 'function' ? require('./playback-source') : globalThis.PlaybackSource;
      out.entries = P.safeEntries({timing:{entries:input.entries}},out.rows.length);
      if (!out.entries) throw new Error('STUDY_VIDEO_INVALID_TIMING');
    }
    if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_BYTES) throw new Error('STUDY_VIDEO_TOO_LARGE');
    return out;
  }
  function open() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(DB,1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots',{keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transact(mode, operation) {
    const db = await open();
    try { return await new Promise((resolve,reject) => {
      const tx = db.transaction('snapshots',mode), store = tx.objectStore('snapshots');
      let result;
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('STUDY_VIDEO_STORAGE'));
      operation(store, value => {result=value;});
    }); } finally {db.close();}
  }
  async function put(input) {
    const value = validate(input), now = Date.now();
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
    await transact('readwrite',(store,done) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const alive = request.result.filter(item => item.created_at > now-TTL).sort((a,b) => b.created_at-a.created_at);
        const keep = new Set(alive.slice(0,LIMIT-1).map(item => item.id));
        request.result.forEach(item => {if (!keep.has(item.id)) store.delete(item.id);});
        store.put({id,created_at:now,value}); done(id);
      };
    });
    return id;
  }
  async function get(id) {
    if (!ID.test(id || '')) return null;
    return transact('readwrite',(store,done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const item = request.result;
        if (!item || item.created_at <= Date.now()-TTL) {if(item) store.delete(id); done(null); return;}
        try {done(validate(item.value));} catch (_) {store.delete(id); done(null);}
      };
    });
  }
  return {validate,put,get,TTL,LIMIT,MAX_BYTES};
});
