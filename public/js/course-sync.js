(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./course-evidence.js') : root.CourseEvidence;
  const cloudCopy = progress => {
    const copy = structuredClone(progress);
    delete copy.reader; // Device-local drafts and position are not cloud evidence.
    return copy;
  };
  function create({ store, courseId, me, consent, fetch: fetcher, now = Date.now, userKey, onStatus, onProgress,
    document: doc = root.document, window: win = root } = {}) {
    let disposed = false, timer = null, status = 'pending';
    const identity = typeof me === 'function' ? me : () => me;
    const allowed = typeof consent === 'function' ? consent : () => consent;
    const originalUser = userKey || (typeof me === 'object' ? me?.user?.id : null);
    const url = '/api/learner/course-progress/' + encodeURIComponent(courseId);
    function setStatus(value) { status = value; onStatus?.(value); return value; }
    async function syncNow({ keepalive = false } = {}) {
      if (disposed) return status;
      let session;
      try { session = await identity(); } catch (_) { return setStatus('local_only'); }
      if (!session?.user?.id || (originalUser && String(session.user.id) !== String(originalUser)) || !await allowed(session)) {
        return setStatus('local_only');
      }
      const headers = { 'Content-Type': 'application/json', 'X-LP-CSRF': session.csrf || '' };
      try {
        const get = await fetcher(url, { method: 'GET', credentials: 'same-origin' });
        if (get.status === 401 || get.status === 403) return setStatus('local_only');
        if (get.status !== 200 && get.status !== 404) return setStatus('error');
        const remote = get.status === 200 ? await get.json() : { payload: E.emptyProgress(courseId), digest: null };
        if (disposed) return status;
        let local = store.load(courseId).progress;
        let merged = E.mergeProgress(cloudCopy(local), remote.payload);
        function saveMerged() {
          const saved = store.save(local.reader ? { ...merged, reader: local.reader } : merged);
          if (!saved.ok) return false;
          onProgress?.(merged);
          return true;
        }
        if (!saveMerged()) return setStatus('error');
        let baseDigest = remote.digest;
        for (let retry = 0; retry < 2; retry++) {
          if (E.progressDigest(merged) === baseDigest) return setStatus('synced');
          const put = await fetcher(url, { method: 'PUT', credentials: 'same-origin', keepalive,
            headers, body: JSON.stringify({ payload: merged, baseDigest }) });
          if (put.status === 401 || put.status === 403) return setStatus('local_only');
          if (put.status === 200) {
            if (E.progressDigest(cloudCopy(store.load(courseId).progress)) !== E.progressDigest(merged)) {
              schedule();
              return 'pending';
            }
            return setStatus('synced');
          }
          if (put.status !== 409 || retry === 1) return setStatus('error');
          const conflict = await put.json();
          local = store.load(courseId).progress;
          merged = E.mergeProgress(cloudCopy(local), conflict.payload);
          if (!saveMerged()) return setStatus('error');
          baseDigest = conflict.digest;
        }
        return setStatus('error');
      } catch (_) { return setStatus('error'); }
    }
    function schedule() {
      if (disposed) return;
      setStatus('pending');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void syncNow(); }, 5000);
    }
    const visibility = () => { if (doc.visibilityState === 'hidden') void syncNow({ keepalive: true }); };
    const online = () => { void syncNow(); };
    doc?.addEventListener?.('visibilitychange', visibility);
    win?.addEventListener?.('online', online);
    function dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      doc?.removeEventListener?.('visibilitychange', visibility);
      win?.removeEventListener?.('online', online);
    }
    return { syncNow, schedule, dispose, get status() { return status; } };
  }
  const api = { create };
  root.CourseSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
