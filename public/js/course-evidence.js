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

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }

  function progressDigest(progress) { return fnv1a(JSON.stringify(canonical(progress))); }

  function mergeProgress(a, b) {
    if (a.courseId !== b.courseId) throw new Error('COURSE_MISMATCH');
    const attempts = new Map();
    for (const attempt of [...a.attempts, ...b.attempts]) {
      const prior = attempts.get(attempt.id);
      if (!prior || JSON.stringify(canonical(attempt)) < JSON.stringify(canonical(prior))) attempts.set(attempt.id, structuredClone(attempt));
    }
    const mergeMap = (left, right, combine) => {
      const result = {};
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        set(result, key, has(left, key) && has(right, key) ? combine(left[key], right[key]) : structuredClone(has(left, key) ? left[key] : right[key]));
      }
      return result;
    };
    const reader = !a.reader ? b.reader : !b.reader ? a.reader :
      JSON.stringify(canonical(a.reader)) >= JSON.stringify(canonical(b.reader)) ? a.reader : b.reader;
    return {
      courseId: a.courseId, schema: Math.max(a.schema, b.schema),
      attempts: [...attempts.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id)),
      aids: mergeMap(a.aids, b.aids, (x, y) => ({
        hint: Math.max(x.hint, y.hint),
        model: x.model || y.model, transcript: x.transcript || y.transcript, translation: x.translation || y.translation
      })),
      seen: mergeMap(a.seen, b.seen, Math.min),
      firstMet: mergeMap(a.firstMet, b.firstMet, Math.min),
      lessonVersions: mergeMap(a.lessonVersions, b.lessonVersions, Math.max),
      ...(reader ? { reader: structuredClone(reader) } : {})
    };
  }

  function newAttemptId(taskKey, channel, at, input) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return fnv1a(`${taskKey}|${channel}|${at}|${input}`) + '-' + [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  }

  function fingerprint(lessonId, task, variant) {
    const semantic = { lessonId, taskId: task.id, spec: task.spec, model: task.model, variant };
    // Preserve legacy hashes when these optional UI definitions are absent.
    for (const key of ['options', 'correctOption', 'pairs', 'cue', 'audioTurnId']) if (has(task, key)) semantic[key] = task[key];
    const json = JSON.stringify(canonical(semantic));
    // FNV-1a over UTF-8 bytes, identically in Node and the browser.
    return fnv1a(json);
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
    const { lessonId, lessonVersion, task, baseTask, variant, channel, input, result, at } = event;
    const next = structuredClone(progress);
    const taskKey = lessonId + '/' + task.id + (variant?.id ? '@' + variant.id : '');
    const fp = fingerprint(lessonId, task, variant);
    const previous = next.attempts.findLast(a => a.lessonId === lessonId && a.taskId === task.id);
    if (previous && previous.fp === fp && previous.input === String(input).slice(0, 300) && previous.channel === channel &&
        at - previous.at >= 0 && at - previous.at < 1000) {
      return { progress: next, attempt: structuredClone(previous), duplicate: true };
    }
    const first = !has(next.seen, fp);
    const attempt = {
      id: newAttemptId(taskKey, channel, at, input), lessonId, lessonVersion, taskId: task.id,
      fp, baseFp: fingerprint(lessonId, baseTask || task), taskSnapshot: structuredClone(task),
      ...(event.lesson ? { lexIds: touchedLexIds(event.lesson, task) } : {}),
      ...(event.via === 'ai' ? { via: 'ai' } : {}), channel, input: String(input).slice(0, 300), kind: result.kind,
      aids: structuredClone(has(next.aids, taskKey) ? next.aids[taskKey] : emptyAids()), first, at
    };
    if (first) set(next.seen, fp, at);
    next.attempts.push(attempt);
    return { progress: next, attempt: structuredClone(attempt), duplicate: false };
  }

  const BREAK_MS = 20 * 60 * 60 * 1000;

  function markMet(progress, lexIds, at) {
    const next = structuredClone(progress);
    for (const id of lexIds) if (!has(next.firstMet, id)) set(next.firstMet, id, at);
    return next;
  }

  function attemptLevel(attempt) {
    if (attempt.kind !== 'accepted') return 'none';
    const a = attempt.aids;
    const unassisted = a && a.hint === 0 && a.model === false && a.transcript === false && a.translation === false;
    const eligible = ['read', 'listen', 'write_he', 'speech'].includes(attempt.channel) ||
      (attempt.channel === 'ai' && attempt.via === 'ai');
    return attempt.first === true && unassisted && eligible ? 'independent' : 'supported';
  }

  function touchedLexIds(lesson, task) {
    const ids = new Set([...(lesson.introduces?.active || []), ...(lesson.introduces?.receptive || [])]);
    const spec = task.spec || {};
    // Only the required values are evidence, not all alternatives in a slot.
    const requirements = spec.kind === 'confirm' ? [spec.card || {}]
      : spec.kind === 'replacement' ? [spec.next || {}, spec.prev || {}]
      : [Object.fromEntries((spec.require || []).filter(id => has(spec.expect || {}, id)).map(id => [id, spec.expect[id]]))];
    for (const expected of requirements) for (const [slotId, key] of Object.entries(expected)) {
      const slot = (lesson.slots || []).find(s => s.id === slotId);
      for (const value of slot?.values || []) if (value.key === key) for (const id of value.seq) ids.add(id);
    }
    return [...ids];
  }

  function itemStatus(progress, lexId, lessons) {
    const status = { introduced: has(progress.firstMet, lexId), readOk: false, listenOk: false, produced: false, appliedAfterBreak: false };
    for (const attempt of progress.attempts) {
      const lesson = lessons.find(l => l.id === attempt.lessonId);
      const task = attempt.taskSnapshot || lesson?.tasks.find(t => t.id === attempt.taskId);
      const ids = has(attempt, 'lexIds') ? attempt.lexIds : (task && lesson ? touchedLexIds(lesson, task) : []);
      if (!ids.includes(lexId) || attemptLevel(attempt) !== 'independent') continue;
      if (attempt.channel === 'read') status.readOk = true;
      if (attempt.channel === 'listen') status.listenOk = true;
      if (['write_he', 'speech'].includes(attempt.channel) || (attempt.channel === 'ai' && attempt.via === 'ai')) status.produced = true;
      if (task?.transfer === true && status.introduced && Number.isFinite(attempt.at) &&
          Number.isFinite(progress.firstMet[lexId]) && attempt.at - progress.firstMet[lexId] >= BREAK_MS) status.appliedAfterBreak = true;
    }
    return status;
  }

  function lessonSkill(progress, lesson) {
    const tasks = lesson.tasks.filter(t => t.transfer === true);
    const started = progress.attempts.some(a => a.lessonId === lesson.id);
    if (!started) return 'not_started';
    if (!tasks.length) return 'in_progress';
    const latest = tasks.map(task => progress.attempts.findLast(a => a.lessonId === lesson.id && a.taskId === task.id &&
      (a.baseFp || a.fp) === fingerprint(lesson.id, task)));
    if (latest.some(a => a && a.kind !== 'accepted')) return 'needs_review';
    if (latest.some(a => !a)) return 'in_progress';
    return latest.every(a => attemptLevel(a) === 'independent') ? 'independent' : 'supported';
  }

  function dueReturns(progress, lessons, now) {
    const day = 24 * 60 * 60 * 1000;
    const due = [];
    for (const lesson of lessons) {
      const skill = lessonSkill(progress, lesson);
      if (!['independent', 'supported', 'needs_review'].includes(skill)) continue;
      const transfer = new Set(lesson.tasks.filter(task => task.transfer === true).map(task => task.id));
      const attempts = progress.attempts.filter(a => a.lessonId === lesson.id && transfer.has(a.taskId))
        .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      const latest = attempts.at(-1);
      if (!latest) continue;
      const dueAt = latest.at + (latest.fp !== (latest.baseFp || latest.fp) ? 3 * day : day);
      if (skill === 'needs_review') due.push({ lessonId: lesson.id, dueAt: latest.at, reason: 'needs_review' });
      else if (now >= dueAt) due.push({ lessonId: lesson.id, dueAt, reason: 'scheduled' });
    }
    return due.sort((a, b) => a.dueAt - b.dueAt || a.lessonId.localeCompare(b.lessonId));
  }

  function courseCounts(progress, lexicon, lessons) {
    const counts = { introduced: 0, recognized: 0, produced: 0, appliedAfterBreak: 0 };
    // Forms are variants of an entry; do not inflate the language-unit count.
    for (const entry of lexicon.entries) {
      const states = [entry.id, ...(entry.forms || []).map(f => f.id)].map(id => itemStatus(progress, id, lessons));
      if (states.some(s => s.introduced)) counts.introduced++;
      if (states.some(s => s.readOk || s.listenOk)) counts.recognized++;
      if (states.some(s => s.produced)) counts.produced++;
      if (states.some(s => s.appliedAfterBreak)) counts.appliedAfterBreak++;
    }
    return counts;
  }

  function migrate(progress, lesson) {
    const next = structuredClone(progress);
    const changes = [];
    if (has(next.lessonVersions, lesson.id) && next.lessonVersions[lesson.id] === lesson.version) {
      return { progress: next, changes };
    }
    const latest = new Map();
    for (const attempt of next.attempts) if (attempt.lessonId === lesson.id) latest.set(attempt.taskId, attempt);
    const tasks = new Map(lesson.tasks.map(task => [task.id, task]));
    for (const [taskId, attempt] of latest) {
      const task = tasks.get(taskId);
      // Variants are novel situations, not edits to the base task definition.
      const previous = attempt.baseFp || attempt.fp;
      const change = !task ? 'removed' : fingerprint(lesson.id, task) !== previous ? 'spec_changed' : 'unchanged';
      changes.push({ taskId, change });
      if (change !== 'unchanged') delete next.aids[lesson.id + '/' + taskId];
    }
    // Keep seen fingerprints: restoring an older task must not manufacture novelty.
    set(next.lessonVersions, lesson.id, lesson.version);
    return { progress: next, changes };
  }

  const api = { emptyProgress, fingerprint, progressDigest, mergeProgress, openAid, record, BREAK_MS, markMet, attemptLevel, touchedLexIds, itemStatus, lessonSkill, dueReturns, courseCounts, migrate };
  root.CourseEvidence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
