// Organization only. Materials, playback passports and learning state stay in their own stores.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MediathequeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'linguistpro-mediatheque-v1';
  const LIMITS = Object.freeze({ categories: 2000, collections: 2000, views: 200, references: 30000, bytes: 8000000, depth: 12 });
  const SORTS = Object.freeze(['position', 'added_desc', 'added_asc', 'title', 'duration', 'opened_desc', 'original_desc']);
  const SECTIONS = Object.freeze(['continue', 'pinned', 'recent', 'topics']);
  const clone = x => JSON.parse(JSON.stringify(x));
  const normalize = x => String(x == null ? '' : x).normalize('NFKC').replace(/[\u0591-\u05bd\u05bf-\u05c7]/g, '').toLocaleLowerCase().trim();
  const unique = xs => Array.from(new Set(xs));
  function fail(code = 'MEDIATHEQUE_INVALID') { const e = new Error(code); e.code = code; e.status = code === 'MEDIATHEQUE_CONFLICT' ? 409 : 400; throw e; }
  function exact(x, fields) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !fields.includes(k))) fail();
  }
  function string(x, max, required = true) {
    if (typeof x !== 'string' || x.length > max || (required && !x.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)) fail();
    return x;
  }
  function identifier(x) { string(x, 100); if (!/^[a-zA-Z0-9_-]+$/.test(x)) fail(); return x; }
  function list(x, max) { if (!Array.isArray(x) || x.length > max) fail(); return x; }
  function keyList(x, max = LIMITS.references) { list(x, max).forEach(k => string(k, 2000)); if (new Set(x).size !== x.length) fail(); return x; }
  function reference(raw) {
    if (raw && raw.kind === 'personal') {
      exact(raw, ['kind', 'textKey']); string(raw.textKey, 1000);
      return { kind: 'personal', textKey: raw.textKey };
    }
    exact(raw, ['kind', 'slug', 'workId', 'snapshotHash']);
    if (raw.kind !== 'public' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug) || String(raw.slug).length > 80
      || !/^[A-Za-z0-9_.:-]{1,160}$/.test(raw.workId) || !/^[a-f0-9]{64}$/.test(raw.snapshotHash)) fail();
    return { kind: 'public', slug: raw.slug, workId: raw.workId, snapshotHash: raw.snapshotHash };
  }
  function refKey(raw) {
    const r = reference(raw);
    return r.kind === 'personal' ? 'my/' + encodeURIComponent(r.textKey)
      : 'public/' + r.slug + '/' + encodeURIComponent(r.workId) + '/' + r.snapshotHash;
  }
  function empty() {
    return { schema: SCHEMA, references: [], saved: [], categories: [], collections: [], views: [], annotations: [],
      home: { title: '', description: '', featured: null, sections: SECTIONS.slice() } };
  }
  function filters(raw = {}) {
    exact(raw, ['q', 'category', 'collection', 'kind', 'source', 'genre', 'language', 'maxDuration', 'progress', 'translation', 'captions', 'uncategorized', 'tags', 'sort', 'layout']);
    const out = { q: '', category: '', collection: '', kind: '', source: '', genre: '', language: '', maxDuration: null,
      progress: '', translation: false, captions: false, uncategorized: false, tags: [], sort: 'position', layout: 'cards', ...clone(raw) };
    ['q', 'category', 'collection', 'source', 'genre', 'language'].forEach(k => string(out[k], k === 'q' ? 500 : 200, false));
    if (!['', 'video', 'audio', 'text'].includes(out.kind) || !['', 'not_started', 'in_progress', 'finished'].includes(out.progress)
      || !SORTS.includes(out.sort) || !['cards', 'list'].includes(out.layout)) fail();
    if (out.maxDuration !== null && (!Number.isFinite(out.maxDuration) || out.maxDuration <= 0 || out.maxDuration > 86400)) fail();
    ['translation', 'captions', 'uncategorized'].forEach(k => { if (typeof out[k] !== 'boolean') fail(); });
    list(out.tags, 30).forEach(t => string(t, 80)); out.tags = unique(out.tags);
    return out;
  }
  function validate(raw, options = {}) {
    exact(raw, ['schema', 'references', 'saved', 'categories', 'collections', 'views', 'annotations', 'home']);
    if (raw.schema !== SCHEMA || JSON.stringify(raw).length > LIMITS.bytes) fail();
    const d = clone(raw), refs = new Set();
    list(d.references, LIMITS.references).forEach(r => {
      const key = refKey(r); if (refs.has(key) || (options.publicOnly && r.kind !== 'public')) fail('MEDIATHEQUE_PRIVATE_REFERENCE'); refs.add(key);
    });
    const members = xs => { keyList(xs); xs.forEach(k => { if (!refs.has(k)) fail('MEDIATHEQUE_REFERENCE_MISSING'); }); };
    members(d.saved); if (options.publicOnly && d.saved.length) fail('MEDIATHEQUE_PRIVATE_REFERENCE');
    const ids = new Set();
    const entities = (xs, max, type) => list(xs, max).forEach(e => {
      exact(e, type === 'category' ? ['id', 'title', 'description', 'parentId', 'items'] : ['id', 'title', 'description', 'pinned', 'items']);
      identifier(e.id); if (ids.has(e.id)) fail(); ids.add(e.id);
      string(e.title, 200); string(e.description, 2000, false); members(e.items);
      if (type === 'category' && e.parentId !== null) identifier(e.parentId);
      if (type === 'collection' && typeof e.pinned !== 'boolean') fail();
    });
    entities(d.categories, LIMITS.categories, 'category'); entities(d.collections, LIMITS.collections, 'collection');
    const parents = new Map(d.categories.map(c => [c.id, c.parentId]));
    for (const c of d.categories) {
      const seen = new Set([c.id]); let p = c.parentId;
      while (p !== null) {
        if (!parents.has(p)) fail('MEDIATHEQUE_PARENT_MISSING');
        if (seen.has(p)) fail('MEDIATHEQUE_CYCLE');
        seen.add(p); if (seen.size > LIMITS.depth) fail('MEDIATHEQUE_DEPTH'); p = parents.get(p);
      }
    }
    list(d.views, LIMITS.views).forEach(v => {
      exact(v, ['id', 'title', 'filters']); identifier(v.id); if (ids.has(v.id)) fail(); ids.add(v.id); string(v.title, 200); v.filters = filters(v.filters);
      if (v.filters.category && !parents.has(v.filters.category)) fail('MEDIATHEQUE_PARENT_MISSING');
      if (v.filters.collection && !d.collections.some(c => c.id === v.filters.collection)) fail('MEDIATHEQUE_PARENT_MISSING');
    });
    const annotated = new Set();
    list(d.annotations, LIMITS.references).forEach(a => {
      exact(a, ['key', 'tags', 'genre', 'language']); if (!refs.has(a.key) || annotated.has(a.key)) fail(); annotated.add(a.key);
      list(a.tags, 30).forEach(t => string(t, 80)); a.tags = unique(a.tags); string(a.genre, 100, false); string(a.language, 40, false);
    });
    exact(d.home, ['title', 'description', 'featured', 'sections']); string(d.home.title, 200, false); string(d.home.description, 2000, false);
    if (d.home.featured !== null && !refs.has(d.home.featured)) fail('MEDIATHEQUE_REFERENCE_MISSING');
    keyList(d.home.sections, SECTIONS.length); if (d.home.sections.some(s => !SECTIONS.includes(s))) fail();
    return d;
  }
  function descendants(d, id) {
    if (!d.categories.some(c => c.id === id)) return new Set();
    const children = new Map();
    for (const c of d.categories) { if (!children.has(c.parentId)) children.set(c.parentId, []); children.get(c.parentId).push(c.id); }
    const found = new Set(), queue = [id];
    for (let i = 0; i < queue.length; i++) { const next = queue[i]; if (found.has(next)) continue; found.add(next); queue.push(...children.get(next) || []); }
    return found;
  }
  function categoryPath(d, id) {
    const byId = new Map(d.categories.map(c => [c.id, c])); const out = [], seen = new Set();
    while (id && byId.has(id) && !seen.has(id)) { seen.add(id); const c = byId.get(id); out.unshift(c); id = c.parentId; }
    return out;
  }
  function command(raw, cmd, options = {}) {
    const d = validate(raw, options); if (!cmd || typeof cmd.type !== 'string') fail();
    const get = (kind, id) => { const e = d[kind].find(c => c.id === id); if (!e) fail('MEDIATHEQUE_NOT_FOUND'); return e; };
    const register = incoming => {
      const existing = new Set(d.references.map(refKey));
      return list(incoming, LIMITS.references).map(r => { const safe = reference(r), k = refKey(safe); if (!existing.has(k)) { d.references.push(safe); existing.add(k); } return k; });
    };
    const reorder = (xs, ids) => {
      keyList(ids); if (xs.length !== ids.length || xs.some(x => !ids.includes(x.id))) fail();
      const map = new Map(xs.map(x => [x.id, x])); return ids.map(id => map.get(id));
    };
    const remapViews = (field, from, to) => { for (const v of d.views) if (v.filters[field] === from) v.filters[field] = to || ''; };
    switch (cmd.type) {
      case 'category.create':
        d.categories.push({ id: cmd.id, title: cmd.title, description: cmd.description || '', parentId: cmd.parentId || null, items: [] }); break;
      case 'category.update': {
        const e = get('categories', cmd.id); e.title = cmd.title; e.description = cmd.description || ''; break;
      }
      case 'category.move': get('categories', cmd.id).parentId = cmd.parentId || null; break;
      case 'category.order': {
        const siblings = d.categories.filter(c => c.parentId === (cmd.parentId || null));
        const ordered = reorder(siblings, cmd.ids); let i = 0;
        d.categories = d.categories.map(c => c.parentId === (cmd.parentId || null) ? ordered[i++] : c); break;
      }
      case 'category.remove': {
        const e = get('categories', cmd.id);
        if (cmd.children !== 'lift' && cmd.children !== 'subtree') fail();
        const removed = cmd.children === 'subtree' ? descendants(d, e.id) : new Set([e.id]);
        d.categories = d.categories.filter(c => !removed.has(c.id));
        for (const c of d.categories) if (c.parentId === e.id) c.parentId = e.parentId;
        removed.forEach(id => remapViews('category', id, null)); break;
      }
      case 'category.merge': {
        const from = get('categories', cmd.id), to = get('categories', cmd.targetId);
        if (descendants(d, from.id).has(to.id)) fail('MEDIATHEQUE_CYCLE');
        to.items = unique(to.items.concat(from.items));
        for (const c of d.categories) if (c.parentId === from.id) c.parentId = to.id;
        d.categories = d.categories.filter(c => c.id !== from.id); remapViews('category', from.id, to.id); break;
      }
      case 'collection.create': d.collections.push({ id: cmd.id, title: cmd.title, description: cmd.description || '', pinned: false, items: [] }); break;
      case 'collection.update': {
        const e = get('collections', cmd.id); e.title = cmd.title; e.description = cmd.description || ''; e.pinned = cmd.pinned === true; break;
      }
      case 'collection.remove': get('collections', cmd.id); d.collections = d.collections.filter(c => c.id !== cmd.id); remapViews('collection', cmd.id, null); break;
      case 'collection.order': d.collections = reorder(d.collections, cmd.ids); break;
      case 'items.add': {
        const key = cmd.target === 'category' ? 'categories' : cmd.target === 'collection' ? 'collections' : null; if (!key) fail();
        const target = get(key, cmd.id), keys = register(cmd.references);
        if (cmd.fromId) { const from = get(key, cmd.fromId); if (from === target) fail(); from.items = from.items.filter(k => !keys.includes(k)); }
        target.items = unique(target.items.concat(keys));
        if (!options.publicOnly) d.saved = unique(d.saved.concat(keys.filter(k => k.startsWith('public/')))); break;
      }
      case 'items.remove': {
        const key = cmd.target === 'category' ? 'categories' : cmd.target === 'collection' ? 'collections' : null; if (!key) fail();
        const target = get(key, cmd.id); keyList(cmd.keys); target.items = target.items.filter(k => !cmd.keys.includes(k)); break;
      }
      case 'items.order': {
        const key = cmd.target === 'category' ? 'categories' : cmd.target === 'collection' ? 'collections' : null; if (!key) fail();
        const target = get(key, cmd.id); keyList(cmd.keys);
        if (target.items.length !== cmd.keys.length || target.items.some(k => !cmd.keys.includes(k))) fail(); target.items = cmd.keys.slice(); break;
      }
      case 'reference.save': {
        if (options.publicOnly) fail(); d.saved = unique(d.saved.concat(register(cmd.references))); break;
      }
      case 'reference.forget': {
        keyList(cmd.keys); const keys = new Set(cmd.keys);
        d.saved = d.saved.filter(k => !keys.has(k)); d.references = d.references.filter(r => !keys.has(refKey(r)));
        for (const c of [...d.categories, ...d.collections]) c.items = c.items.filter(k => !keys.has(k));
        d.annotations = d.annotations.filter(a => !keys.has(a.key)); if (keys.has(d.home.featured)) d.home.featured = null; break;
      }
      case 'annotation.set': {
        const keys = register(cmd.references);
        for (const key of keys) {
          const previous = d.annotations.find(a => a.key === key) || { key, tags: [], genre: '', language: '' };
          const next = { ...previous, tags: cmd.tags == null ? previous.tags : unique(cmd.tags),
            genre: cmd.genre == null ? previous.genre : cmd.genre, language: cmd.language == null ? previous.language : cmd.language };
          d.annotations = d.annotations.filter(a => a.key !== key); d.annotations.push(next);
        }
        break;
      }
      case 'view.save': {
        const next = { id: cmd.id, title: cmd.title, filters: filters(cmd.filters) };
        const i = d.views.findIndex(v => v.id === cmd.id); if (i >= 0) d.views[i] = next; else d.views.push(next); break;
      }
      case 'view.remove': get('views', cmd.id); d.views = d.views.filter(v => v.id !== cmd.id); break;
      case 'home.update':
        if (cmd.reference) register([cmd.reference]);
        d.home = { title: cmd.title || '', description: cmd.description || '', featured: cmd.reference ? refKey(cmd.reference) : null, sections: cmd.sections }; break;
      default: fail();
    }
    return validate(d, options);
  }
  function prepare(d, materials) {
    const annotations = new Map(d.annotations.map(a => [a.key, a]));
    const byKey = new Map();
    for (const item of materials) {
      const key = refKey(item.ref), annotation = annotations.get(key);
      const material = { ...item, key, tags: unique([...(item.tags || []), ...(annotation && annotation.tags || [])]),
        genre: annotation && annotation.genre || item.genre || '', language: annotation && annotation.language || item.language || '' };
      material.search = normalize([material.title, material.description, material.source, material.genre, material.language, ...material.tags].join(' '));
      byKey.set(key, material);
    }
    return { byKey, items: Array.from(byKey.values()) };
  }
  function query(d, prepared, rawFilters = {}) {
    const f = filters(rawFilters), categoryIds = f.category ? descendants(d, f.category) : null;
    const included = categoryIds ? new Set(d.categories.filter(c => categoryIds.has(c.id)).flatMap(c => c.items)) : null;
    const collection = f.collection ? d.collections.find(c => c.id === f.collection) : null;
    const collectionKeys = f.collection ? new Set(collection ? collection.items : []) : null;
    const categorized = f.uncategorized ? new Set(d.categories.flatMap(c => c.items)) : null;
    const tokens = normalize(f.q).split(/\s+/).filter(Boolean), tags = f.tags.map(normalize);
    let items = prepared.items.filter(i => (!included || included.has(i.key)) && (!collectionKeys || collectionKeys.has(i.key))
      && (!categorized || !categorized.has(i.key)) && (!f.kind || i.kind === f.kind) && (!f.source || i.source === f.source)
      && (!f.genre || i.genre === f.genre) && (!f.language || i.language === f.language)
      && (!f.progress || (i.progressKnown !== false && i.progress === f.progress))
      && (f.maxDuration === null || (i.durationSeconds != null && Number.isFinite(i.durationSeconds) && i.durationSeconds <= f.maxDuration))
      && (!f.translation || i.hasTranslation === true) && (!f.captions || i.hasCaptions === true)
      && tokens.every(t => i.search.includes(t)) && tags.every(t => i.tags.some(tag => normalize(tag) === t)));
    const orderedKeys = collection ? collection.items : f.category ? d.categories.find(c => c.id === f.category)?.items || [] : [];
    const positions = new Map(orderedKeys.map((k, i) => [k, i]));
    const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const date = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    items.sort((a, b) => {
      let result = 0;
      if (f.sort === 'position') result = (positions.get(a.key) ?? 1e9) - (positions.get(b.key) ?? 1e9) || (Number(a.position) || 0) - (Number(b.position) || 0);
      if (f.sort === 'title') result = normalize(a.title).localeCompare(normalize(b.title));
      if (f.sort === 'duration') result = (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity);
      if (f.sort === 'added_desc' || f.sort === 'added_asc') result = (date(b.addedAt) - date(a.addedAt)) * (f.sort === 'added_asc' ? -1 : 1);
      if (f.sort === 'opened_desc') result = date(b.openedAt) - date(a.openedAt);
      if (f.sort === 'original_desc') result = date(b.originalDate) - date(a.originalDate);
      return result || cmp(a.key, b.key);
    });
    return items;
  }
  function navigationMatches(d, text) {
    const tokens = normalize(text).split(/\s+/).filter(Boolean); if (!tokens.length) return [];
    return [...d.categories.map(c => ({ ...c, type: 'category', path: categoryPath(d, c.id).map(x => x.title).join(' / ') })),
      ...d.collections.map(c => ({ ...c, type: 'collection', path: c.title }))]
      .filter(c => tokens.every(t => normalize(c.title + ' ' + c.description + ' ' + c.path).includes(t)));
  }
  function exportStructure(d, now = new Date().toISOString()) { return { schema: 'linguistpro-mediatheque-export-v1', exportedAt: now, structure: validate(d) }; }
  function sameFilters(a, b) {
    const left = filters(a), right = filters(b);
    left.tags.sort(); right.tags.sort();
    return Object.keys(left).every(k => JSON.stringify(left[k]) === JSON.stringify(right[k]));
  }
  function durationSummary(items) {
    const out = { seconds: 0, known: 0, unknown: 0, unavailable: 0, total: items.length };
    for (const item of items) {
      if (item.available === false) { out.unavailable++; continue; }
      if (Number.isFinite(item.durationSeconds) && item.durationSeconds >= 0) { out.seconds += item.durationSeconds; out.known++; }
      else out.unknown++;
    }
    return out;
  }
  // Stable IDs, not array offsets, define entity changes. Insertions are not reorders.
  function structureChanges(before, after) {
    const a = validate(before), b = validate(after), changes = [];
    const sequence = (left = [], right = []) => {
      const l = new Set(left), r = new Set(right);
      return { added: right.filter(k => !l.has(k)), removed: left.filter(k => !r.has(k)),
        reordered: JSON.stringify(left.filter(k => r.has(k))) !== JSON.stringify(right.filter(k => l.has(k))) };
    };
    for (const type of ['categories', 'collections', 'views', 'annotations']) {
      const key = e => type === 'annotations' ? e.key : e.id;
      const left = new Map(a[type].map(e => [key(e), e])), right = new Map(b[type].map(e => [key(e), e]));
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const old = left.get(id), next = right.get(id);
        if (!old || !next) { changes.push({ type, id, kind: old ? 'removed' : 'added', title: (next || old).title || id,
          fields: [], added: next?.items || [], removed: old?.items || [], reordered: false }); continue; }
        const fields = Object.keys(next).filter(k => !['id','key','items'].includes(k) &&
          (k === 'filters' ? !sameFilters(old[k], next[k]) : JSON.stringify(old[k]) !== JSON.stringify(next[k])));
        const membership = sequence(old.items, next.items);
        if (fields.length || membership.added.length || membership.removed.length || membership.reordered)
          changes.push({ type, id, kind: 'changed', title: next.title || id, previousTitle: old.title || '', fields, ...membership,
            before: Object.fromEntries(fields.map(k => [k, old[k]])), after: Object.fromEntries(fields.map(k => [k, next[k]])) });
      }
      if (type !== 'annotations' && sequence([...left.keys()], [...right.keys()]).reordered)
        changes.push({ type, kind: 'order', fields: [], added: [], removed: [], reordered: true });
    }
    for (const type of ['references', 'saved']) {
      const s = sequence(type === 'references' ? a.references.map(refKey) : a.saved, type === 'references' ? b.references.map(refKey) : b.saved);
      if (s.added.length || s.removed.length) changes.push({ type, kind: 'changed', fields: [], ...s, reordered: false });
    }
    const fields = Object.keys(b.home).filter(k => JSON.stringify(a.home[k]) !== JSON.stringify(b.home[k]));
    if (fields.length) changes.push({ type: 'home', kind: 'changed', fields, added: [], removed: [], reordered: false,
      before: Object.fromEntries(fields.map(k => [k, a.home[k]])), after: Object.fromEntries(fields.map(k => [k, b.home[k]])) });
    return changes;
  }
  function importStructure(value, options = {}) {
    exact(value, ['schema', 'exportedAt', 'structure']); if (value.schema !== 'linguistpro-mediatheque-export-v1') fail(); string(value.exportedAt, 40);
    return validate(value.structure, options);
  }
  return Object.freeze({ SCHEMA, LIMITS, SORTS, SECTIONS, empty, validate, reference, refKey, filters, normalize, descendants, categoryPath,
    command, prepare, query, navigationMatches, exportStructure, importStructure, sameFilters, durationSummary, structureChanges });
});
