(function (root) {
  'use strict';
  const KEY = /^[a-f0-9]{64}$/;
  function create(opts = {}) {
    const fetcher = opts.fetch || root.fetch.bind(root);
    const AudioCtor = opts.AudioCtor || root.Audio;
    const base = (opts.base || '/data/course').replace(/\/$/, '');
    let manifest = {}, rate = 1, audio = null, cleanup = null, controller = null, generation = 0, sequence = 0;
    let pending = null;
    function stop() {
      sequence++;
      halt();
      const resolve = pending; pending = null; resolve?.(false);
    }
    function halt() {
      generation++;
      controller?.abort();
      controller = null;
      if (cleanup) cleanup();
      cleanup = null;
      if (audio) {
        try { audio.pause(); audio.removeAttribute('src'); } catch (_) {}
        audio = null;
      }
    }
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal, ticket = generation;
      manifest = {};
      try {
        const response = await fetcher(base + '/' + encodeURIComponent(opts.courseId) + '/audio/' + encodeURIComponent(opts.lessonId) + '.json', { signal, cache: 'no-cache' });
        if (!response.ok) return;
        const value = await response.json();
        if (ticket !== generation || signal.aborted || !value || typeof value !== 'object' || Array.isArray(value)) return;
        manifest = Object.fromEntries(Object.entries(value).filter(([, key]) => typeof key === 'string' && KEY.test(key)));
      } catch (_) { /* Missing or unavailable clips have no play button. */ }
    }
    function has(id) { return Object.hasOwn(manifest, id) && KEY.test(manifest[id]); }
    function setRate(value) {
      if (![1, .85, .75].includes(value)) return;
      rate = value;
      if (audio) audio.playbackRate = rate;
    }
    async function play(id) {
      sequence++;
      const resolve = pending; pending = null; resolve?.(false);
      return start(id);
    }
    async function start(id, onDone) {
      if (!has(id) || typeof AudioCtor !== 'function') return false;
      halt();
      const ticket = generation;
      try {
        const next = new AudioCtor('/api/audio/' + manifest[id]);
        audio = next;
        next.playbackRate = rate;
        const ended = () => { if (audio === next && ticket === generation) { opts.onEnded?.(id); onDone?.(); } };
        next.addEventListener('ended', ended);
        cleanup = () => next.removeEventListener('ended', ended);
        await next.play();
        return audio === next && ticket === generation;
      } catch (_) {
        if (ticket === generation) stop();
        return false;
      }
    }
    // Plays clips one after another; turns without a clip are announced and skipped.
    async function playSequence(ids, { onTurn } = {}) {
      const token = ++sequence;
      for (const id of ids) {
        if (token !== sequence) return false;
        onTurn?.(id);
        if (!has(id)) continue;
        const finished = await new Promise(resolve => {
          pending = resolve;
          start(id, () => resolve(true)).then(ok => { if (!ok) resolve(false); });
        });
        pending = null;
        if (!finished || token !== sequence) return false;
      }
      return token === sequence;
    }
    return { load, has, play, playSequence, setRate, stop };
  }
  const api = { create };
  root.CourseAudio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
