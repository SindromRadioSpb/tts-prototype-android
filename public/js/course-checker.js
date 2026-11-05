(function (root) {
  'use strict';
  const H = typeof module !== 'undefined' && module.exports ? require('./course-hebrew.js') : root.CourseHebrew;
  const UNKNOWN = 'Этот вариант не удаётся надёжно проверить автоматически. Сравните с образцом.';

  function buildIndex(entries) {
    const index = new Map();
    index.multiword = new Map();
    index.byId = new Map();
    // Callers supply course.preknown here; the persisted lesson stays unchanged.
    index.preknown = [];
    index.maxSeqWords = 0;
    for (const entry of entries) {
      for (const form of [entry, ...(entry.forms || [])]) {
        const tags = form.tags || [];
        const gender = tags.includes('f') ? 'f' : tags.includes('m') ? 'm' : form.gender || entry.gender;
        const candidate = { lexId: form.id, baseId: entry.id, gender, tags };
        index.byId.set(form.id, form);
        for (const key of H.formKeys(form.he)) {
          if (!key) continue;
          index.maxSeqWords = Math.max(index.maxSeqWords, key.split(' ').length);
          const map = key.includes(' ') ? index.multiword : index;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(candidate);
        }
      }
    }
    return index;
  }

  function parse(input, lesson, index) {
    const words = H.tokens(input);
    const allowed = new Set([...(lesson.introduces?.active || []), ...(lesson.introduces?.receptive || []),
      ...(lesson.reviews || []), ...(lesson.frame || []), ...(index.preknown || [])]);
    const at = words.map(() => []);
    const known = words.map(() => false);
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= Math.min(words.length, start + index.maxSeqWords); end++) {
        const key = words.slice(start, end).join(' ');
        const candidates = (end === start + 1 ? index : index.multiword).get(key) || [];
        for (const candidate of candidates.filter(c => allowed.has(c.lexId))) {
          at[start].push({ ...candidate, start, end });
          for (let n = start; n < end; n++) known[n] = true;
        }
      }
    }
    function match(seq, start) {
      if (!seq.length) return [];
      let paths = [{ end: start, candidates: [] }];
      for (const id of seq) paths = paths.flatMap(p => (at[p.end] || [])
        .filter(c => c.lexId === id).map(c => ({ end: c.end, candidates: [...p.candidates, c] })));
      return paths;
    }
    const occurrences = [];
    for (let start = 0; start < words.length;) {
      const matches = [];
      for (const slot of lesson.slots || []) for (const value of slot.values) {
        for (const found of match(value.seq, start)) matches.push({ slotId: slot.id, key: value.key,
          label: value.label.ru, start, ...found, negated: words[start - 1] === 'לא' });
      }
      if (!matches.length) { start++; continue; }
      const longest = Math.max(...matches.map(m => m.end));
      // Keep equally long candidates: ambiguity must never depend on lexicon order.
      occurrences.push(...matches.filter(m => m.end === longest));
      start = longest;
    }
    const slots = {}, negated = {};
    let conflict = false;
    for (const occurrence of occurrences) {
      const dest = occurrence.negated ? negated : slots;
      if (Object.hasOwn(dest, occurrence.slotId) && dest[occurrence.slotId] !== occurrence.key) conflict = true;
      Object.defineProperty(dest, occurrence.slotId, { value: occurrence.key, enumerable: true, configurable: true, writable: true });
    }
    for (const id of Object.keys(slots)) if (Object.hasOwn(negated, id) && slots[id] === negated[id]) conflict = true;
    return { words, at, match, occurrences, conflict,
      parsed: { slots, negated, unknownTokens: words.filter((_, i) => !known[i]) } };
  }

  function assess(input, task, lesson, index) {
    const spec = task.spec;
    // Initial 'no' in a confirmation is a discourse correction, not slot negation.
    const words = H.tokens(input);
    if (words.length > 60) return { kind: 'unknown',
      message: { ru: 'Ответ слишком длинный для автоматической проверки. Сравните с образцом.' },
      parsed: { slots: {}, negated: {}, unknownTokens: [] } };
    const state = parse(spec?.kind === 'confirm' && words[0] === 'לא' && words.length > 1
      ? words.slice(1).join(' ') : input, lesson, index);
    const { parsed, occurrences } = state;
    const result = (kind, message, detail) => ({ kind, message: { ru: message },
      ...(detail ? { detail: { ru: detail } } : {}), parsed });
    if (!state.words.length) return result('empty', 'Введите ответ.');
    if (parsed.unknownTokens.length || (state.conflict && spec?.kind !== 'replacement')) return result('unknown', UNKNOWN);
    if (!spec) return result('unknown', UNKNOWN);
    const slotById = id => lesson.slots.find(s => s.id === id);
    const label = (id, key) => slotById(id)?.values.find(v => v.key === key)?.label.ru || key;
    if (spec.kind === 'confirm') {
      // A missing card value gives no evidence to verify that part of a claim.
      const cardIds = Object.keys(spec.card), claimIds = Object.keys(spec.claim);
      if (cardIds.length !== claimIds.length || cardIds.some(id => !Object.hasOwn(spec.claim, id))) return result('unknown', UNKNOWN);
      const different = Object.keys(spec.card).filter(id => spec.card[id] !== spec.claim[id]);
      const agrees = words[0] !== 'לא' && ['כן', 'בסדר', 'תודה', 'כן תודה'].includes(state.words.join(' '));
      if (agrees) {
        if (!different.length) return result('accepted', 'Смысл передан.');
        return result('mismatch', different.map(id => `Вы согласились: ${label(id, spec.claim[id])}. По карточке нужно: ${label(id, spec.card[id])}.`).join(' '));
      }
      for (const [id, expected] of Object.entries(spec.card)) {
        if ((Object.hasOwn(parsed.slots, id) && parsed.slots[id] !== expected) ||
            (Object.hasOwn(parsed.negated, id) && parsed.negated[id] === expected)) {
          return result('mismatch', `По карточке нужно: ${label(id, expected)}.`);
        }
      }
      if (different.length && different.every(id => Object.hasOwn(parsed.slots, id) && parsed.slots[id] === spec.card[id])) return result('accepted', 'Смысл передан.');
      return result('mismatch', different.length ? 'Исправьте подтверждение по карточке.' : 'Подтверждение было верным.');
    }
    if (spec.kind === 'repeat') {
      const frame = new Set(lesson.frame || []);
      const isFrame = (start, end) => {
        const reachable = new Set([start]);
        for (let n = start; n < end; n++) if (reachable.has(n)) {
          for (const c of state.at[n]) if (frame.has(c.lexId) && c.end <= end) reachable.add(c.end);
        }
        return reachable.has(end);
      };
      for (const seq of lesson.repeatForms || []) for (let start = 0; start < state.words.length; start++) {
        if (state.match(seq, start).some(m => isFrame(0, start) && isFrame(m.end, state.words.length))) return result('accepted', 'Смысл передан.');
      }
      return result('unknown', UNKNOWN);
    }
    if (spec.kind === 'replacement') {
      const markers = state.at.flat().filter(c => c.lexId === spec.via);
      if (markers.length !== 1) return result(markers.length ? 'unknown' : 'mismatch', markers.length ? UNKNOWN : 'Сначала назовите то, что хотите получить теперь.');
      const marker = markers[0];
      const before = parse(state.words.slice(0, marker.start).join(' '), lesson, index);
      const after = parse(state.words.slice(marker.end).join(' '), lesson, index);
      if (before.conflict || after.conflict) return result('unknown', UNKNOWN);
      const matches = (part, expected) => Object.entries(expected).every(([id, key]) =>
        Object.hasOwn(part.parsed.slots, id) && part.parsed.slots[id] === key &&
        !(Object.hasOwn(part.parsed.negated, id) && part.parsed.negated[id] === key));
      return matches(before, spec.next) && matches(after, spec.prev)
        ? result('accepted', 'Смысл передан.')
        : result('mismatch', 'Сначала назовите то, что хотите получить теперь.');
    }
    if (!['order', 'short'].includes(spec.kind)) return result('unknown', UNKNOWN);
    for (const [id, expected] of Object.entries(spec.expect)) {
      const got = Object.hasOwn(parsed.slots, id) ? parsed.slots[id] : undefined;
      if (got !== undefined && got !== expected) return result('mismatch', `В задании нужно ${label(id, expected)}, а в ответе — ${label(id, got)}.`);
      if (Object.hasOwn(parsed.negated, id) && parsed.negated[id] === expected) return result('mismatch', `В задании нужно ${label(id, expected)}, а в ответе это отрицается.`);
    }
    const missing = spec.require.filter(id => !Object.hasOwn(parsed.slots, id));
    const indirect = missing.find(id => Object.hasOwn(parsed.negated, id) &&
      Object.hasOwn(spec.expect, id) && parsed.negated[id] !== spec.expect[id]);
    if (indirect !== undefined) return result('unknown', `Скажите условие прямо: ${label(indirect, spec.expect[indirect])}.`);
    if (missing.length) return result('partial', `Добавьте: ${missing.map(id => slotById(id)?.label.ru || id).join(', ')}.`);
    for (const rule of lesson.orderRules || []) {
      const heads = occurrences.filter(o => o.slotId === rule.head && !o.negated);
      const dependents = occurrences.filter(o => o.slotId === rule.dependent && !o.negated);
      for (const dep of dependents) {
        const adjacent = heads.filter(head => head.end === dep.start);
        const agreed = adjacent.some(head => {
          const hg = head.candidates.find(c => c.gender)?.gender;
          const dg = dep.candidates.find(c => c.gender)?.gender;
          return !hg || !dg || hg === dg;
        });
        if (heads.length && !agreed) return result('form', `Для ${slotById(rule.head).label.ru} ${slotById(rule.dependent).label.ru} стоит сразу после названия и согласуется с его родом.`);
      }
    }
    const preferred = spec.preferFrame || [];
    if (preferred.length && !state.at.some(items => items.some(c => preferred.includes(c.lexId)))) {
      const frame = index.byId.get(preferred[0])?.he.plain || preferred[0];
      return result('accepted', 'Смысл передан.', `Так заказать можно. Теперь попробуйте тот же заказ с ${frame}.`);
    }
    return result('accepted', 'Смысл передан.');
  }
  const api = { buildIndex, assess };
  root.CourseChecker = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
