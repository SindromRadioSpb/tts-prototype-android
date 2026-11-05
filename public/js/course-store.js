(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./course-evidence.js') : root.CourseEvidence;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = value => typeof value === 'string';
  const aidsValid = a => object(a) && Number.isInteger(a.hint) && a.hint >= 0 &&
    ['model', 'transcript', 'translation'].every(k => typeof a[k] === 'boolean');
  const mapValid = (map, valid) => object(map) && Object.values(map).every(valid);
  const channels = ['read', 'listen', 'write_he', 'cards', 'translit', 'speech', 'self', 'ai'];
  const kinds = ['empty', 'accepted', 'form', 'partial', 'mismatch', 'unknown'];
  function validProgress(p, courseId) {
    return object(p) && p.schema === 1 && text(p.courseId) && p.courseId === courseId &&
      Array.isArray(p.attempts) && p.attempts.every(a => object(a) &&
        ['id', 'lessonId', 'taskId', 'fp', 'input'].every(k => text(a[k])) &&
        Number.isInteger(a.lessonVersion) && a.lessonVersion >= 1 &&
        channels.includes(a.channel) && kinds.includes(a.kind) && aidsValid(a.aids) &&
        typeof a.first === 'boolean' && finite(a.at) &&
        (a.baseFp === undefined || text(a.baseFp)) &&
        (a.taskSnapshot === undefined || (object(a.taskSnapshot) && text(a.taskSnapshot.id))) &&
        (a.via === undefined || a.via === 'ai')) &&
      mapValid(p.aids, aidsValid) && mapValid(p.seen, finite) && mapValid(p.firstMet, finite) &&
      mapValid(p.lessonVersions, v => Number.isInteger(v) && v >= 1);
  }
  const keyFor = id => `lp.course.${id}.v1`;
  const reset = id => ({ progress: E.emptyProgress(id), notice: 'reset_corrupt' });
  const unavailable = () => ({ ok: false, reason: 'unavailable' });
  function encode(progress) {
    if (!validProgress(progress, progress?.courseId)) throw new Error('Invalid course progress');
    return JSON.stringify(progress);
  }
  function memoryStore() {
    const values = new Map();
    return {
      load(courseId) {
        try { return { progress: values.has(courseId) ? JSON.parse(values.get(courseId)) : E.emptyProgress(courseId) }; }
        catch (_) { return reset(courseId); }
      },
      save(progress) {
        try { const encoded = encode(progress); values.set(progress.courseId, encoded); return { ok: true }; }
        catch (_) { return unavailable(); }
      }
    };
  }
  function localStore(storage) {
    let failed = false;
    // Access the browser getter inside the guard, not in a default parameter.
    try { if (storage === undefined) storage = globalThis.localStorage; if (!storage) failed = true; }
    catch (_) { failed = true; }
    return {
      load(courseId) {
        if (failed) return reset(courseId);
        let raw, key;
        try { key = keyFor(courseId); raw = storage.getItem(key); }
        catch (_) { failed = true; return reset(courseId); }
        if (raw === null || raw === undefined) return { progress: E.emptyProgress(courseId) };
        try {
          const progress = JSON.parse(raw);
          if (validProgress(progress, courseId)) return { progress };
        } catch (_) { /* Preserve the exact unreadable bytes below. */ }
        try {
          let backup = `${key}:corrupt:${Date.now()}`, suffix = 0;
          // Never overwrite another corrupt snapshot made in the same millisecond.
          while (storage.getItem(backup) != null) backup = `${key}:corrupt:${Date.now()}:${++suffix}`;
          storage.setItem(backup, raw);
        } catch (_) { failed = true; /* Do not allow a later save to erase the only recoverable copy. */ }
        return reset(courseId);
      },
      save(progress) {
        if (failed) return unavailable();
        try { storage.setItem(keyFor(progress?.courseId), encode(progress)); return { ok: true }; }
        catch (error) {
          if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') return { ok: false, reason: 'quota' };
          return unavailable();
        }
      }
    };
  }
  const api = { memoryStore, localStore };
  root.CourseStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
