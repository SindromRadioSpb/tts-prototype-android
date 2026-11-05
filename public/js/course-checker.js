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
    for (const entry of entries) {
      for (const form of [entry, ...(entry.forms || [])]) {
        const tags = form.tags || [];
        const gender = tags.includes('f') ? 'f' : tags.includes('m') ? 'm' : form.gender || entry.gender;
        const candidate = { lexId: form.id, baseId: entry.id, gender, tags };
        index.byId.set(form.id, form);
        for (const key of H.formKeys(form.he)) {
          if (!key) continue;
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
      for (let end = start + 1; end <= words.length; end++) {
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
    const state = parse(input, lesson, index);
    const { parsed, occurrences } = state;
    const result = (kind, message, detail) => ({ kind, message: { ru: message },
      ...(detail ? { detail: { ru: detail } } : {}), parsed });
    if (!state.words.length) return result('empty', 'Введите ответ.');
    if (state.conflict || parsed.unknownTokens.length) return result('unknown', UNKNOWN);
    const spec = task.spec;
    if (!spec || !['order', 'short'].includes(spec.kind)) return result('unknown', UNKNOWN);
    const slotById = id => lesson.slots.find(s => s.id === id);
    const label = (id, key) => slotById(id)?.values.find(v => v.key === key)?.label.ru || key;
    for (const [id, expected] of Object.entries(spec.expect)) {
      const got = Object.hasOwn(parsed.slots, id) ? parsed.slots[id] : undefined;
      if (got !== undefined && got !== expected) return result('mismatch', `В задании нужно ${label(id, expected)}, а в ответе — ${label(id, got)}.`);
      if (Object.hasOwn(parsed.negated, id) && parsed.negated[id] === expected) return result('mismatch', `В задании нужно ${label(id, expected)}, а в ответе это отрицается.`);
    }
    const missing = spec.require.filter(id => !Object.hasOwn(parsed.slots, id));
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

