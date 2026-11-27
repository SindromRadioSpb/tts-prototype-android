// «Разложить» из «Видео дня» (docs/superpowers/specs/2026-11-28-mediatheque-daily-sorting-design.md).
// Pure structure helpers, shared by the page and the server: where a material is placed, placing it, the 5-day sweep.
// «Видео дня» and «Нераспределённые» are inboxes, never places: they do not make a material «разложенный».
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MediathequePlacement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAILY_ID = 'm_daily_video';
  const UNSORTED = Object.freeze({ id: 'm_unsorted_video', title: 'Нераспределённые' });
  const INBOX_IDS = Object.freeze([DAILY_ID, UNSORTED.id]);
  const DAY_MS = 86400000;
  const fail = code => { throw Object.assign(new Error(code), { code, status: 400 }); };
  const inbox = id => INBOX_IDS.includes(id);
  const listOf = (s, type) => type === 'category' ? s.categories : type === 'collection' ? s.collections : null;

  // → [{ type, id, title }] in structure order, topics first.
  function placesOf(s, key) {
    return [...s.categories.filter(c => !inbox(c.id) && c.items.includes(key)).map(c => ({ type: 'category', id: c.id, title: c.title })),
      ...s.collections.filter(c => c.items.includes(key)).map(c => ({ type: 'collection', id: c.id, title: c.title }))];
  }
  const topicPath = (s, id) => {
    const out = [], seen = new Set();
    for (let c = s.categories.find(x => x.id === id); c && !seen.has(c.id); c = s.categories.find(x => x.id === c.parentId)) { seen.add(c.id); out.unshift(c.title); }
    return out.join(' / ');
  };
  // «C14 / Интервью разные, כאן 11»: a collection with its topic; a topic its collection already names is not repeated.
  function placeLabel(s, key) {
    const parts = [], shown = new Set();
    for (const coll of s.collections.filter(c => c.items.includes(key))) {
      const topic = coll.categoryId && s.categories.some(c => c.id === coll.categoryId) ? coll.categoryId : null;
      if (topic) shown.add(topic);
      parts.push({ order: topic ? s.categories.findIndex(c => c.id === topic) : Infinity, text: (topic ? topicPath(s, topic) + ' / ' : '') + coll.title });
    }
    s.categories.forEach((c, i) => { if (!inbox(c.id) && !shown.has(c.id) && c.items.includes(key)) parts.push({ order: i, text: topicPath(s, c.id) }); });
    return parts.sort((a, b) => a.order - b.order).map(p => p.text).join(', ');
  }

  // places: the whole wanted set [{type,id}]; create: [{tempId,type,title,categoryId?}] (categoryId may be a tempId).
  // options: { publicOnly, newId(tempId) → id, skipUnknown } — the draft may lack a place the edition has.
  function place(structure, ref, { places = [], create = [] } = {}, C, options = {}) {
    const o = { publicOnly: !!options.publicOnly };
    const key = C.refKey(ref), ids = new Map();
    let s = structure;
    for (const c of create) {
      const title = String(c && c.title || '').trim();
      if (!title || title.length > 200 || !['category', 'collection'].includes(c.type) || !c.tempId) fail('MEDIATHEQUE_PLACE_INVALID');
      ids.set(c.tempId, options.newId ? options.newId(c.tempId) : c.tempId);
    }
    for (const c of create) if (c.type === 'category') s = C.command(s, { type: 'category.create', id: ids.get(c.tempId), title: c.title.trim(), parentId: null }, o);
    for (const c of create) if (c.type === 'collection') {
      const topic = c.categoryId ? ids.get(c.categoryId) || c.categoryId : null;
      s = C.command(s, { type: 'collection.create', id: ids.get(c.tempId), title: c.title.trim(), categoryId: topic && s.categories.some(x => x.id === topic) ? topic : null }, o);
    }
    const wanted = [];
    for (const p of places) {
      const id = ids.get(p && p.id) || (p && p.id), list = p && listOf(s, p.type);
      if (!list || inbox(id) || !list.some(x => x.id === id)) { if (options.skipUnknown) continue; fail('MEDIATHEQUE_PLACE_UNKNOWN'); }
      if (!wanted.some(w => w.type === p.type && w.id === id)) wanted.push({ type: p.type, id });
    }
    const has = (list, p) => list.some(x => x.type === p.type && x.id === p.id);
    const current = placesOf(s, key);
    for (const p of current) if (!has(wanted, p)) s = C.command(s, { type: 'items.remove', target: p.type, id: p.id, keys: [key] }, o);
    for (const p of wanted) if (!has(current, p)) s = C.command(s, { type: 'items.add', target: p.type, id: p.id, references: [ref] }, o);
    const unsorted = s.categories.find(c => c.id === UNSORTED.id);
    if (wanted.length && unsorted && unsorted.items.includes(key)) s = C.command(s, { type: 'items.remove', target: 'category', id: UNSORTED.id, keys: [key] }, o);
    return s;
  }

  // firstSeen: Map<key, ms since epoch>. Older than `days` leave «Видео дня»; the unplaced ones go to «Нераспределённые».
  function sweep(structure, firstSeen, now, C, days = 5) {
    const daily = structure.categories.find(c => c.id === DAILY_ID);
    const limit = now - days * DAY_MS;
    const expired = daily ? daily.items.filter(k => firstSeen.has(k) && firstSeen.get(k) <= limit) : [];
    if (!expired.length) return { structure, expired: [], unsorted: [] };
    const o = { publicOnly: true };
    const unsorted = expired.filter(k => !placesOf(structure, k).length);
    let s = structure;
    if (unsorted.length) {
      if (!s.categories.some(c => c.id === UNSORTED.id)) s = C.command(s, { type: 'category.create', id: UNSORTED.id, title: UNSORTED.title, parentId: null }, o);
      const refs = unsorted.map(k => s.references.find(r => C.refKey(r) === k)).filter(Boolean);
      if (refs.length) s = C.command(s, { type: 'items.add', target: 'category', id: UNSORTED.id, references: refs }, o);
    }
    s = C.command(s, { type: 'items.remove', target: 'category', id: DAILY_ID, keys: expired }, o);
    return { structure: s, expired, unsorted };
  }

  return Object.freeze({ DAILY_ID, UNSORTED, INBOX_IDS, DAY_MS, placesOf, placeLabel, place, sweep });
});
