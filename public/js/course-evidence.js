(function (root) {
  'use strict';

  const has = (object, key) => Object.hasOwn(object, key);
  const set = (object, key, value) => Object.defineProperty(object, key, {
    value, enumerable: true, writable: true, configurable: true
  });
  const emptyAids = () => ({ hint: 0, model: false, transcript: false, translation: false });

  function emptyProgress(courseId) {
    return { courseId, schema: 1, attempts: [], aids: {}, seen: {}, firstMet: {}, lessonVersions: {} };
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const sorted = {};
      for (const key of Object.keys(value).sort()) set(sorted, key, canonical(value[key]));
      return sorted;
    }
    return value;
  }

  function fingerprint(lessonId, task, variant) {
    const json = JSON.stringify(canonical({ lessonId, taskId: task.id, spec: task.spec, model: task.model, variant }));
    // FNV-1a over UTF-8 bytes, identically in Node and the browser.
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(json)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }

  function openAid(progress, taskKey, aid, at) {
    const next = structuredClone(progress);
    if (!['hint', 'model', 'transcript', 'translation'].includes(aid)) return next;
    const aids = has(next.aids, taskKey) ? next.aids[taskKey] : emptyAids();
    if (aid === 'hint') aids.hint++;
    else aids[aid] = true;
    set(next.aids, taskKey, aids);
    return next;
  }

  function record(progress, event) {
    const { lessonId, lessonVersion, task, variant, channel, input, result, at } = event;
    const next = structuredClone(progress);
    const taskKey = lessonId + '/' + task.id;
    const previous = next.attempts.findLast(a => a.lessonId === lessonId && a.taskId === task.id);
    if (previous && previous.input === input && previous.channel === channel &&
        at - previous.at >= 0 && at - previous.at < 1000) {
      return { progress: next, attempt: structuredClone(previous), duplicate: true };
    }
    const fp = fingerprint(lessonId, task, variant);
    const first = !has(next.seen, fp);
    const attempt = {
      id: `${taskKey}/${at}/${next.attempts.length}`, lessonId, lessonVersion, taskId: task.id,
      fp, channel, input, kind: result.kind,
      aids: structuredClone(has(next.aids, taskKey) ? next.aids[taskKey] : emptyAids()), first, at
    };
    if (first) set(next.seen, fp, at);
    next.attempts.push(attempt);
    return { progress: next, attempt: structuredClone(attempt), duplicate: false };
  }

  const api = { emptyProgress, fingerprint, openAid, record };
  root.CourseEvidence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
