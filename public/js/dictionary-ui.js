// public/js/dictionary-ui.js — «Мой словарь» (Ф4 · Д1): список + фильтры + сортировка + статья слова.
// Спека: docs/planning/word-layer/F4_D1_DICTIONARY_SPEC_2026_10_12.md.
//
// Источники записи — существующие хранилища (word_status, расписание FSRS, канонические заметки «мои
// слова», review_log, word_context); ядро склейки — DictionaryCore (чистое, под тестом). Разбор слова —
// офлайн ReaderMorph.resolveWordLight с проверкой личности: запись получает разбор ТОЛЬКО если lemmaKey
// резолвера совпал с её ключом (R11). Статус пишется тем же MorphHost.markWordStatus, что в тексте.
// Урок O-080: никакого сплошного перебора на главном потоке — разбор порциями с уступками.
import * as localDb from '/db/local-db.js?v=750';

const D = window.DictionaryCore;
const RM = () => window.ReaderMorph;
const $ = (id) => document.getElementById(id);
function tt(key, fb) { try { if (typeof window.t === 'function') { const v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }
function fill(s, vals) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (vals[k] == null ? m : String(vals[k]))); }
function el(tag, opts, kids) {
  const e = document.createElement(tag);
  opts = opts || {};
  if (opts.class) e.className = opts.class;
  if (opts.text != null) e.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) if (v != null) e.setAttribute(k, v);
  if (opts.on) for (const [k, fn] of Object.entries(opts.on)) e.addEventListener(k, fn);
  (kids || []).forEach((c) => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const STATUS_LABEL = {
  new: ['room.morph.status.new', 'новое'], l1: ['room.morph.status.l1', 'незнакомо'], l2: ['room.morph.status.l2', 'узнаю'],
  l3: ['room.morph.status.l3', 'вспоминаю'], l4: ['room.morph.status.l4', 'почти знаю'], known: ['room.morph.status.known', 'знаю'],
  ignore: ['room.morph.status.ignore', 'не учить'],
};
const statusText = (s) => { const x = STATUS_LABEL[s || 'new']; return x ? tt(x[0], x[1]) : s; };
const POS_LABEL = { verb: ['dictionary.pos.verb', 'глагол'], noun: ['dictionary.pos.noun', 'сущ.'], adjective: ['dictionary.pos.adjective', 'прил.'],
  adverb: ['dictionary.pos.adverb', 'нареч.'], preposition: ['dictionary.pos.preposition', 'предлог'], pronoun: ['dictionary.pos.pronoun', 'местоим.'],
  conjunction: ['dictionary.pos.conjunction', 'союз'], particle: ['dictionary.pos.particle', 'частица'], numeral: ['dictionary.pos.numeral', 'числит.'] };
const posText = (p) => { const x = POS_LABEL[p]; return x ? tt(x[0], x[1]) : (p || ''); };

// ── theme (shared with Studio/Room: appTheme_v1) ───────────────────────────────────────────────
try { const th = localStorage.getItem('appTheme_v1'); if (th === 'dark') document.body.classList.add('theme-dark'); else if (th === 'light') document.body.classList.add('theme-light'); } catch (_) {}

// ── state ──────────────────────────────────────────────────────────────────────────────────────
const S = {
  entries: new Map(), cards: new Map(), view: [], shown: 0, PAGE: 60, selected: null,
  filters: { q: '', statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0, scope: 'mine' },
  sort: 'added', viewMode: 'words', metBuilt: false, metBuilding: false, pauseUntil: 0,
};
try { const v = JSON.parse(localStorage.getItem('dict.view_v1') || 'null'); if (v && D.SORTS.indexOf(v.sort) >= 0) S.sort = v.sort; } catch (_) {}
function saveView() { try { localStorage.setItem('dict.view_v1', JSON.stringify({ sort: S.sort })); } catch (_) {} }

// ── reading cache: derived, per device, keyed by resolver revision + surface ───────────────────
let _idb = null;
function idb() {
  if (_idb) return _idb;
  _idb = new Promise((resolve) => {
    try { const rq = indexedDB.open('lp-dictionary-index', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('r'); rq.onsuccess = () => resolve(rq.result); rq.onerror = () => resolve(null); }
    catch (_) { resolve(null); }
  });
  return _idb;
}
async function cacheGet(keys) {
  const db = await idb(); if (!db || !keys.length) return {};
  return new Promise((resolve) => {
    const out = {}; let tx; try { tx = db.transaction('r', 'readonly'); } catch (_) { resolve(out); return; }
    const st = tx.objectStore('r');
    keys.forEach((k) => { const q = st.get(k); q.onsuccess = () => { if (q.result !== undefined) out[k] = q.result; }; });
    tx.oncomplete = () => resolve(out); tx.onerror = () => resolve(out);
  });
}
async function cachePut(pairs) {
  const db = await idb(); if (!db || !pairs.length) return;
  try { const tx = db.transaction('r', 'readwrite'), st = tx.objectStore('r'); pairs.forEach(([k, v]) => st.put(v, k)); } catch (_) {}
}
function pick(card, surface) {
  if (!card) return null;
  return { lemmaKey: card.lemmaKey || '', niqqud: card.niqqud || '', word: card.word || '', lemma: card.lemma || '', meaning: card.meaning || '',
    pos: card.pos || '', binyan: card.binyan || '', root: card.root || '', label: card.label || '', pid: card.pealim_id ? String(card.pealim_id) : '', surface };
}
const strip = (s) => (RM() ? RM().stripNiqqud(s) : String(s || '').replace(/[֑-ׇ]/g, ''));
const hasNiqqud = (s) => /[ְ-ׇ]/.test(String(s || ''));
async function resolveSurfaces(surfaces) {
  const rev = (RM() && RM().RESOLVER_REV) || 'r';
  const keys = surfaces.map((s) => rev + '|' + s);
  const got = await cacheGet(keys);
  const out = new Map(), put = [];
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (Object.prototype.hasOwnProperty.call(got, keys[i])) { out.set(s, got[keys[i]]); continue; }
    let card = null;
    try { card = await RM().resolveWordLight(strip(s), hasNiqqud(s) ? s : ''); } catch (_) { card = null; }
    const p = pick(card, s);
    out.set(s, p); put.push([keys[i], p]);
    if (card) S.cards.set(s, card);
  }
  await cachePut(put);
  return out;
}
async function fullCard(surface) {
  if (S.cards.has(surface)) return S.cards.get(surface);
  let card = null;
  try { card = await RM().resolveWordLight(strip(surface), hasNiqqud(surface) ? surface : ''); } catch (_) { card = null; }
  if (card) S.cards.set(surface, card);
  return card;
}

// ── sources ────────────────────────────────────────────────────────────────────────────────────
const q = (sql, params) => localDb.dbQuery(sql, params || []).then((r) => r || []).catch(() => []);
const PERSONAL = `t.is_archived = 0 AND (NOT json_valid(t.source_meta_json) OR (json_type(t.source_meta_json, '$.corpus') IS NULL
  AND json_type(t.source_meta_json, '$.group_corpus') IS NULL AND json_type(t.source_meta_json, '$.public_corpus') IS NULL))`;
async function loadSources() {
  const [statuses, statusRows, schedule, noteRows, logRows, ctxRows] = await Promise.all([
    localDb.getAllWordStatuses().catch(() => ({})),
    q('SELECT lemma_key, updated_at, srs_surface, srs_text_key, srs_order_index FROM word_status'),
    localDb.getSrsSchedule().catch(() => ({})),
    q(`SELECT n.id, n.body_json, n.created_at, COUNT(o.id) AS occ, MAX(o.created_at) AS last_occ
         FROM notes_v2 n LEFT JOIN note_occurrences o ON o.note_id = n.id
        WHERE n.note_type = 'word_study'
          -- «my words» only: «Добавить в мои слова», my own translation, or a canonical note I touched.
          -- Auto-generated notes (source='auto') and bulk-imported notes without a canon key are not mine.
          AND (n.source = 'curated' OR json_extract(n.body_json, '$.meaning_source') = 'user'
               OR (n.user_touched = 1 AND n.gen_dedup_key IS NOT NULL AND n.gen_dedup_key <> ''))
        GROUP BY n.id`),
    q(`SELECT item_key, COUNT(*) AS n, MIN(reviewed_at) AS first, MAX(reviewed_at) AS last,
              SUM(CASE WHEN kind = 'review' AND grade IS NOT NULL AND grade <= 1 THEN 1 ELSE 0 END) AS fails,
              SUM(CASE WHEN kind = 'review' THEN 1 ELSE 0 END) AS reviews,
              MAX(json_extract(meta_json, '$.surface')) AS surface
         FROM review_log WHERE kind IN ('review','mark','seed','skip') AND source <> 'mark-backfill' GROUP BY item_key`),
    q('SELECT lemma_key, COUNT(*) AS occ, COUNT(DISTINCT text_key) AS texts, MAX(surface) AS surface FROM word_context GROUP BY lemma_key'),
  ]);
  const statusTimes = {}; statusRows.forEach((r) => { statusTimes[r.lemma_key] = r.updated_at; });
  // «новое» is the default state: an explicit 'new' row counts as mine only when I did something with the
  // word (a mark or review of mine, a schedule). A migration backfill alone is not a decision of mine.
  const touched = new Set(logRows.map((r) => r.item_key));
  Object.keys(statuses).forEach((k) => { if (statuses[k] === 'new' && !touched.has(k) && !schedule[k]) delete statuses[k]; });
  // notes are keyed by the SAME canon key the text uses: resolve the saved word (R11 parity)
  const notes = [];
  const noteBodies = noteRows.map((r) => { let b = {}; try { b = JSON.parse(r.body_json || '{}'); } catch (_) {} return { r, b }; });
  // a note that names its Pealim entry IS that entry (the canon key of a Pealim word is pid:N) — no guessing
  const noteSurf = noteBodies.filter(({ b }) => !b.pealim_id).map(({ b }) => b.niqqud_variant || b.word || '').filter(Boolean);
  progress(fill(tt('dictionary.collecting', 'Собираю мои слова: {n}'), { n: noteBodies.length + Object.keys(statuses).length }));
  const res = await resolveSurfaces(Array.from(new Set(noteSurf)));
  noteBodies.forEach(({ r, b }) => {
    const s = b.niqqud_variant || b.word || '';
    const rd = s ? res.get(s) : null;
    const key = b.pealim_id ? 'pid:' + String(b.pealim_id) : ((rd && rd.lemmaKey) || ('note:' + r.id));
    notes.push({ key, id: r.id, word: b.word || '', niqqud: b.niqqud_variant || '', meaning: b.meaning_source === 'user' ? '' : (b.meaning || ''),
      userMeaning: b.meaning_source === 'user' ? (b.meaning || '') : '', pos: b.pos || '', root: b.root || '', binyan: b.binyan || '',
      pid: b.pealim_id || '', created: r.created_at, occ: Number(r.occ) || 0, lastOcc: r.last_occ });
  });
  return D.mergeSources({ statuses, statusTimes, schedule, notes,
    logAgg: logRows.map((r) => ({ key: r.item_key, n: Number(r.n) || 0, first: r.first, last: r.last, fails: Number(r.fails) || 0, reviews: Number(r.reviews) || 0, surface: r.surface || '' })),
    contexts: ctxRows.map((r) => ({ key: r.lemma_key, occ: Number(r.occ) || 0, texts: Number(r.texts) || 0, surface: r.surface || '' })),
    marks: statusRows.filter((r) => r.srs_surface).map((r) => ({ key: r.lemma_key, surface: r.srs_surface, textKey: r.srs_text_key, order: r.srs_order_index })) });
}

// attach a verified reading to every entry, in slices (progress + re-render, never a frozen page)
// A 'pid:N' key IS a Pealim entry: its paradigm is the authoritative reading (R1), no guess involved.
let _eng = null;
async function engine() { if (!_eng) { try { _eng = await RM().ensureEngine(); } catch (_) { _eng = null; } } return _eng; }
function pidParadigm(key) {
  const m = /^pid:(\d+)$/.exec(String(key || ''));
  return m && _eng && _eng.pidMap ? _eng.pidMap.get(m[1]) || null : null;
}
function paradigmForms(p) {
  const out = new Set();
  if (p && p.cells) Object.values(p.cells).forEach((c) => { const f = c && (typeof c === 'string' ? c : c.he); if (f) String(f).split(/[\s,~/]+/).forEach((x) => { const s = strip(x); if (s.length > 1) out.add(s); }); });
  if (p && p.lemma) out.add(strip(p.lemma));
  return Array.from(out);
}
function readingFromParadigm(p, key) {
  return { lemmaKey: key, niqqud: p.lemma_niqqud || p.lemma || '', word: strip(p.lemma || ''), lemma: p.lemma || '', meaning: p.meaning || '',
    pos: p.pos || '', binyan: p.binyan || '', root: p.root || '', label: 'exact', pid: p.pealim_id != null ? String(p.pealim_id) : '', surface: p.lemma_niqqud || p.lemma || '', source: 'pealim' };
}
async function resolveReadings(entries) {
  const list = Array.from(entries.values()).filter((e) => e.reading === undefined);
  await engine();
  let done = 0, lastPaint = performance.now(), t0 = performance.now();
  for (const e of list) {
    const p = pidParadigm(e.key);
    if (p) {   // the Pealim entry itself: authoritative, no resolution needed (a dictionary shows the lemma)
      e.paradigm = p; e.forms = paradigmForms(p); e.reading = readingFromParadigm(p, e.key);
      done++;
      if (performance.now() - t0 > 24) { await yieldNow(); t0 = performance.now(); }
      continue;
    }
    const surfaces = e.surfaces.map((x) => x.s);
    const got = await resolveSurfaces(surfaces);
    for (const s of surfaces) {
      const rd = got.get(s);
      if (rd && rd.lemmaKey === e.key) { e.reading = rd; break; }
    }
    if (!e.reading && p) e.reading = readingFromParadigm(p, e.key);
    if (e.reading === undefined) e.reading = null;   // honest «not confirmed»; the note keeps its own fields (displayOf)
    done++;
    if (performance.now() - t0 > 24) { await yieldNow(); t0 = performance.now(); }
    // the person comes first: while they type or scroll the list, the background analysis waits
    while (performance.now() < S.pauseUntil) { await new Promise((r) => setTimeout(r, 120)); t0 = performance.now(); }
    if (performance.now() - lastPaint > 400) { lastPaint = performance.now(); progress(fill(tt('dictionary.resolving', 'Разбираю слова: {d} из {n}'), { d: done, n: list.length })); renderList(); }
  }
  progress('');
}

// «все встреченные в моих текстах»: lemmas of the rows of my own texts (not the corpus), counted
async function buildMet() {
  if (S.metBuilt || S.metBuilding) return;
  S.metBuilding = true;
  const rows = await q(`SELECT s.text_id, s.he_niqqud, s.he_plain FROM sentences s JOIN texts t ON t.id = s.text_id WHERE ${PERSONAL}`);
  const counts = new Map();   // surface → { occ, texts:Set }
  rows.forEach((r) => {
    const words = RM().words(String(r.he_niqqud || r.he_plain || ''));
    words.forEach((w) => { let c = counts.get(w); if (!c) { c = { occ: 0, texts: new Set() }; counts.set(w, c); } c.occ++; c.texts.add(r.text_id); });
  });
  const surfaces = Array.from(counts.keys());
  const byKey = new Map();
  for (let i = 0; i < surfaces.length; i += 40) {
    const part = surfaces.slice(i, i + 40);
    const got = await resolveSurfaces(part);
    part.forEach((s) => {
      const rd = got.get(s);
      if (!rd || !rd.lemmaKey || !(rd.label === 'exact' || rd.label === 'likely')) return;   // R10: unsure readings are not counted
      let m = byKey.get(rd.lemmaKey); if (!m) { m = { occ: 0, texts: new Set(), reading: rd, surface: s }; byKey.set(rd.lemmaKey, m); }
      const c = counts.get(s); m.occ += c.occ; c.texts.forEach((t) => m.texts.add(t));
    });
    progress(fill(tt('dictionary.metProgress', 'Собираю слова из ваших текстов: {d} из {n}'), { d: Math.min(i + 40, surfaces.length), n: surfaces.length }));
    await yieldNow();
  }
  byKey.forEach((m, key) => {
    let e = S.entries.get(key);
    if (!e) { e = { key, status: '', srs: null, note: null, log: null, ctx: null, surfaces: [{ s: m.surface, from: 'text' }], added: 0, lastSeen: 0, sources: ['text'], metOnly: true, reading: m.reading }; S.entries.set(key, e); }
    e.met = { occ: m.occ, texts: m.texts.size };
  });
  S.metBuilt = true; S.metBuilding = false;
  progress('');
  applyView();
}

// ── list ───────────────────────────────────────────────────────────────────────────────────────
function progress(msg) { const p = $('dict-progress'); if (p) p.textContent = msg || ''; }
function applyView() {
  const now = Date.now();
  const all = Array.from(S.entries.values());
  S.view = D.sortEntries(all.filter((e) => D.matches(e, S.filters, now)), S.sort, now);
  S.shown = Math.min(S.view.length, Math.max(S.PAGE, S.shown));
  renderCounts(all); renderActive(); renderTrainButton(); renderList();
}
function memLine(e) {
  const m = D.memory(e, Date.now());
  if (m.state === 'unscheduled' || m.state === 'ignored') return null;
  const days = Math.round(Math.abs(m.dueIn));
  const txt = m.state === 'overdue' ? fill(tt('dictionary.overdue', 'просрочено {n} дн.'), { n: days })
    : m.state === 'due' ? tt('dictionary.dueToday', 'повторить сегодня')
    : days <= 0 ? tt('dictionary.dueToday', 'повторить сегодня') : fill(tt('dictionary.dueIn', 'через {n} дн.'), { n: days });
  const bar = el('span', { class: 'dict-mem-bar', attrs: { 'aria-hidden': 'true' } }, [el('i', { attrs: { style: 'width:' + Math.round((m.strength == null ? 0 : m.strength) * 100) + '%' } })]);
  return el('span', { class: 'dict-mem ' + m.state, attrs: { title: m.strength == null ? '' : fill(tt('dictionary.strength', 'сила памяти {p}%'), { p: Math.round(m.strength * 100) }) } }, [bar, txt]);
}
function rowFor(e) {
  const d = D.displayOf(e), mean = D.meaningOf(e);
  const meta = [];
  if (d.pos) meta.push(el('span', { text: posText(d.pos) + (d.binyan ? ' · ' + d.binyan : '') }));
  if (d.root) meta.push(el('span', {}, [tt('dictionary.root', 'корень') + ' ', el('span', { class: 'he', text: d.root })]));
  if (!e.metOnly) meta.push(el('span', { text: statusText(e.status || 'new') }));
  const occ = D.occurrences(e);
  if (occ) meta.push(el('span', { text: fill(tt('dictionary.occ', 'встреч: {n}'), { n: occ }) }));
  const ml = memLine(e); if (ml) meta.push(ml);
  const he = el('span', { class: 'dict-row-he' + (e.metOnly ? '' : ' dict-st-' + (e.status || 'new')), attrs: { lang: 'he', dir: 'rtl' }, text: d.he || '…' });
  const mn = el('span', { attrs: { dir: 'auto' }, class: 'dict-row-mean' + (mean.from === 'user' ? ' from-user' : '') + (mean.text ? '' : ' empty'), text: mean.text || (e.reading === undefined ? tt('dictionary.resolvingOne', 'разбираю…') : tt('dictionary.noMeaning', 'перевод не найден офлайн')) });
  const btn = el('button', { class: 'dict-row' + (S.selected === e.key ? ' sel' : ''), attrs: { type: 'button', 'data-key': e.key }, on: { click: () => openArticle(e.key) } },
    [he, mn, el('span', { class: 'dict-row-meta' }, meta)]);
  return el('li', {}, [btn]);
}
function renderList() {
  const list = $('dict-list'); if (!list) return;
  list.replaceChildren();
  if (!S.view.length) {
    const empty = S.entries.size === 0
      ? tt('dictionary.emptyAll', 'Здесь появятся слова, которые вы отметите статусом, добавите в «мои слова» или будете повторять. Откройте текст в Зале и нажмите на слово.')
      : tt('dictionary.emptyFiltered', 'Под эти фильтры слов нет. Измените поиск или сбросьте фильтры.');
    list.appendChild(el('li', { class: 'dict-empty', text: empty }));
  }
  const frag = document.createDocumentFragment();
  S.view.slice(0, S.shown).forEach((e) => frag.appendChild(rowFor(e)));
  list.appendChild(frag);
  const more = $('dict-more'); more.replaceChildren();
  if (S.shown < S.view.length) {
    more.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: fill(tt('dictionary.more', 'Показать ещё ({n})'), { n: S.view.length - S.shown }),
      on: { click: () => { S.shown += S.PAGE; renderList(); } } }));
  }
  if (S.view.length) more.appendChild(el('p', { class: 'dict-note', text: fill(tt('dictionary.shown', 'Показано {a} из {b}'), { a: Math.min(S.shown, S.view.length), b: S.view.length }) }));
}
function renderCounts(all) {
  const box = $('dict-counts'); if (!box) return;
  const c = D.statusCounts(all);
  box.replaceChildren(el('span', { class: 'dict-note', text: fill(tt('dictionary.total', 'Слов: {n}'), { n: c.total }) }));
  D.STATUSES.forEach((s) => {
    if (!c[s]) return;
    const on = S.filters.statuses.length === 1 && S.filters.statuses[0] === s;
    box.appendChild(el('button', { class: 'dict-chip' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': on ? 'true' : 'false' },
      on: { click: () => { S.filters.statuses = on ? [] : [s]; S.shown = 0; applyView(); } } },
      [el('span', { class: 'dict-dot dict-st-' + s }), statusText(s), el('b', { text: String(c[s]) })]));
  });
}
const MEMORY_OPTS = [['due', 'dictionary.memDue', 'к повторению'], ['overdue', 'dictionary.memOverdue', 'просрочено'], ['hard', 'dictionary.memHard', 'трудные'], ['never', 'dictionary.memNever', 'ещё не повторялось']];
const ADDED_OPTS = [[7, 'dictionary.addedWeek', 'за неделю'], [30, 'dictionary.addedMonth', 'за месяц']];
function renderFilters() {
  const box = $('dict-filters'); box.replaceChildren();
  const all = Array.from(S.entries.values()).filter((e) => S.filters.scope === 'met' || !e.metOnly);
  const toggle = (arr, v) => (arr.indexOf(v) >= 0 ? arr.filter((x) => x !== v) : arr.concat([v]));
  const group = (label, items) => el('div', { class: 'dict-fgroup' }, [el('span', { text: label }), el('div', { class: 'dict-fopts' }, items)]);
  const chip = (text, on, fn, dot) => el('button', { class: 'dict-chip' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': on ? 'true' : 'false' }, on: { click: () => { fn(); S.shown = 0; applyView(); renderFilters(); } } },
    [dot ? el('span', { class: 'dict-dot ' + dot }) : null, text]);
  box.appendChild(group(tt('dictionary.fStatus', 'Статус'), D.STATUSES.map((s) => chip(statusText(s), S.filters.statuses.indexOf(s) >= 0, () => { S.filters.statuses = toggle(S.filters.statuses, s); }, 'dict-st-' + s))));
  box.appendChild(group(tt('dictionary.fMemory', 'Память'), MEMORY_OPTS.map(([v, k, fb]) => chip(tt(k, fb), S.filters.memory === v, () => { S.filters.memory = S.filters.memory === v ? '' : v; }))));
  const values = (fn) => Array.from(new Set(all.map(fn).filter(Boolean))).sort();
  const posVals = values((e) => D.displayOf(e).pos);
  if (posVals.length) box.appendChild(group(tt('dictionary.fPos', 'Часть речи'), posVals.map((p) => chip(posText(p), S.filters.pos.indexOf(p) >= 0, () => { S.filters.pos = toggle(S.filters.pos, p); }))));
  const binVals = values((e) => D.displayOf(e).binyan);
  if (binVals.length) box.appendChild(group(tt('dictionary.fBinyan', 'Биньян'), binVals.map((b) => chip(b, S.filters.binyan.indexOf(b) >= 0, () => { S.filters.binyan = toggle(S.filters.binyan, b); }))));
  const rootIn = el('input', { attrs: { type: 'text', dir: 'rtl', lang: 'he', 'aria-label': tt('dictionary.fRoot', 'Корень'), placeholder: 'כתב', value: S.filters.root } });
  rootIn.addEventListener('change', () => { S.filters.root = rootIn.value.trim(); S.shown = 0; applyView(); });
  box.appendChild(el('div', { class: 'dict-fgroup dict-froot' }, [el('span', { text: tt('dictionary.fRoot', 'Корень') }), rootIn]));
  box.appendChild(group(tt('dictionary.fMore', 'Ещё'), [
    chip(tt('dictionary.fMine', 'есть мой перевод'), S.filters.hasMine, () => { S.filters.hasMine = !S.filters.hasMine; }),
    ...ADDED_OPTS.map(([d, k, fb]) => chip(tt(k, fb), S.filters.addedDays === d, () => { S.filters.addedDays = S.filters.addedDays === d ? 0 : d; })),
  ]));
}
// Д2 «Учить эти»: the current filtered view, in its order, goes to the Room's training
function renderTrainButton() {
  const box = $('dict-train'); if (!box) return;
  const learnable = S.view.filter((e) => !e.metOnly && e.status !== 'ignore' && !String(e.key).startsWith('note:'));
  box.replaceChildren();
  if (!S.view.length) return;
  if (learnable.length) box.appendChild(el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: fill(tt('dictionary.trainThese', 'Учить эти ({n})'), { n: learnable.length }),
    on: { click: () => startTrain(learnable) } }));
  // Д2.2+ forms of the words in this view (filter «глагол» + a binyan → that binyan's pattern)
  const forms = S.view.filter(drillable);
  if (forms.length) {
    box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-train-forms' }, text: fill(tt('dictionary.trainForms', 'Тренировать формы ({n})'), { n: Math.min(30, forms.length) }),
      on: { click: () => openSetDrill(forms, { subtitle: activeSummary() }) } }));
  }
  box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-xlsx' }, text: fill(tt('dictionary.xlsxBtn', 'Скачать XLSX ({n})'), { n: S.view.length }),
    on: { click: () => exportXlsx(S.view.slice()) } }));
  if (learnable.length) box.appendChild(el('span', { class: 'dict-note', text: tt('dictionary.trainNote', 'Тренировка в Зале по этим словам в текущем порядке; ответы идут в расписание повторения.') }));
}
// a short line of the active filters for a drill's subtitle («глагол · пиэль»)
function activeSummary() {
  const f = S.filters, parts = [];
  f.pos.forEach((p) => parts.push(posText(p)));
  f.binyan.forEach((b) => parts.push(b));
  f.statuses.forEach((s) => parts.push(statusText(s)));
  if (f.root) parts.push(tt('dictionary.root', 'корень') + ' ' + f.root);
  if (f.q) parts.push('«' + f.q + '»');
  return parts.join(' · ');
}
function renderActive() {
  const box = $('dict-active'); box.replaceChildren();
  const f = S.filters, chips = [];
  const off = (text, fn) => chips.push(el('button', { class: 'dict-chip', attrs: { type: 'button', 'aria-label': fill(tt('dictionary.removeFilter', 'Убрать фильтр «{f}»'), { f: text }) },
    on: { click: () => { fn(); S.shown = 0; applyView(); if (!$('dict-filters').hidden) renderFilters(); } } }, [text, ' ✕']));
  f.statuses.forEach((s) => off(statusText(s), () => { f.statuses = f.statuses.filter((x) => x !== s); }));
  if (f.memory) { const m = MEMORY_OPTS.find((x) => x[0] === f.memory); off(tt(m[1], m[2]), () => { f.memory = ''; }); }
  f.pos.forEach((p) => off(posText(p), () => { f.pos = f.pos.filter((x) => x !== p); }));
  f.binyan.forEach((b) => off(b, () => { f.binyan = f.binyan.filter((x) => x !== b); }));
  if (f.root) off(tt('dictionary.root', 'корень') + ' ' + f.root, () => { f.root = ''; });
  if (f.hasMine) off(tt('dictionary.fMine', 'есть мой перевод'), () => { f.hasMine = false; });
  if (f.addedDays) { const a = ADDED_OPTS.find((x) => x[0] === f.addedDays); off(tt(a[1], a[2]), () => { f.addedDays = 0; }); }
  if (chips.length > 1) chips.push(el('button', { class: 'dict-chip', attrs: { type: 'button' }, text: tt('dictionary.reset', 'Сбросить всё'),
    on: { click: () => { Object.assign(f, { statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0 }); S.shown = 0; applyView(); if (!$('dict-filters').hidden) renderFilters(); } } }));
  chips.forEach((c) => box.appendChild(c));
}

// ── article ────────────────────────────────────────────────────────────────────────────────────
let morphHost = null, _articleEpoch = 0;
function toast(msg) { const t = $('dict-toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3200); }
function highlight(sentence, offset) {
  const out = el('div', { class: 'he', attrs: { lang: 'he', dir: 'rtl' } });
  let wi = 0;
  RM().tokenize(sentence).forEach((tk) => {
    if (!tk.isWord) { out.appendChild(document.createTextNode(tk.text)); return; }
    out.appendChild(wi === offset ? el('mark', { text: tk.text }) : document.createTextNode(tk.text));
    wi++;
  });
  return out;
}
// every verified place of this lemma in my texts: saved occurrences, the training bank, and a search
async function findPlaces(e, card) {
  const places = new Map();
  const add = (p) => { const k = p.textId + ':' + p.order + ':' + p.offset; if (!places.has(k)) places.set(k, p); };
  if (e.note && e.note.id && !String(e.key).startsWith('note:')) {
    (await q(`SELECT o.word_offset, s.order_index, s.he_niqqud, s.he_plain, s.ru, t.id AS tid, t.title FROM note_occurrences o
               JOIN sentences s ON s.id = o.sentence_id JOIN texts t ON t.id = s.text_id AND t.is_archived = 0 WHERE o.note_id = ?`, [e.note.id]))
      .forEach((r) => add({ textId: r.tid, title: r.title, order: Number(r.order_index), offset: Number(r.word_offset), he: r.he_niqqud || r.he_plain, ru: r.ru, row: r }));
  }
  if (e.mark && e.mark.textKey != null) {
    (await q(`SELECT s.order_index, s.he_niqqud, s.he_plain, s.ru, t.id AS tid, t.title FROM sentences s JOIN texts t ON t.id = s.text_id AND t.is_archived = 0
               WHERE t.text_key = ? AND s.order_index = ?`, [e.mark.textKey, e.mark.order])).forEach((r) => {
      const toks = RM().words(String(r.he_niqqud || r.he_plain || ''));
      const i = toks.findIndex((w) => strip(w) === strip(e.mark.surface));
      if (i >= 0) add({ textId: r.tid, title: r.title, order: Number(r.order_index), offset: i, he: r.he_niqqud || r.he_plain, ru: r.ru, row: r });
    });
  }
  const forms = new Set();
  e.surfaces.forEach((x) => forms.add(strip(x.s)));
  if (card && card.paradigm) paradigmForms(card.paradigm).forEach((f) => forms.add(f));
  const skels = Array.from(forms).filter((x) => x && x.length > 1).slice(0, 48);
  const hits = skels.length ? await localDb.findSentencesForWords(skels, 160).catch(() => []) : [];
  const want = new Set(skels);
  // a form in a text may carry proclitics (שֶׁ+שָּׁמַעְתִּי, וְ+הַ+…): a candidate is any token that IS a wanted form or
  // ends with one behind ≤3 proclitic letters; every candidate is then proven by the resolver (lemmaKey === key)
  const PROC = /^[ובכלמשה]{1,3}$/;
  const candidate = (tok) => { const sk = strip(tok); if (want.has(sk)) return true; for (let n = 1; n <= 3 && n < sk.length - 1; n++) if (PROC.test(sk.slice(0, n)) && want.has(sk.slice(n))) return true; return false; };
  for (const r of hits) {
    if (places.size >= 40) break;
    const text = String(r.he_niqqud || r.he_plain || '');
    const toks = RM().words(text);
    for (let i = 0; i < toks.length; i++) {
      if (!candidate(toks[i])) continue;
      const got = await resolveSurfaces([toks[i]]);
      const rd = got.get(toks[i]);
      if (rd && rd.lemmaKey === e.key) add({ textId: r.text_id, title: r.text_title, order: Number(r.order_index), offset: i, he: text, ru: r.ru, row: r });
    }
  }
  return Array.from(places.values());
}
// ── Д2.2 тренировка форм (FormDrillCore; память по клетке — своя, на устройстве; FSRS леммы не трогается) ──
let _drillDb = null;
function drillDb() {
  if (_drillDb) return _drillDb;
  _drillDb = new Promise((resolve) => { try { const rq = indexedDB.open('lp-form-drill', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('m'); rq.onsuccess = () => resolve(rq.result); rq.onerror = () => resolve(null); } catch (_) { resolve(null); } });
  return _drillDb;
}
async function drillMemory(key) {
  const db = await drillDb(); if (!db) return {};
  return new Promise((resolve) => { try { const r = db.transaction('m', 'readonly').objectStore('m').get(key); r.onsuccess = () => resolve(r.result || {}); r.onerror = () => resolve({}); } catch (_) { resolve({}); } });
}
// every lemma's cell memory (Д2.3 «слабые места — формы»)
async function drillAll() {
  const db = await drillDb(); if (!db) return [];
  return new Promise((resolve) => {
    const out = [];
    try {
      const rq = db.transaction('m', 'readonly').objectStore('m').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (!c) { resolve(out); return; } out.push({ key: String(c.key), mem: c.value || {} }); c.continue(); };
      rq.onerror = () => resolve(out);
    } catch (_) { resolve(out); }
  });
}
async function drillSave(key, mem) { const db = await drillDb(); if (!db) return; try { db.transaction('m', 'readwrite').objectStore('m').put(mem, key); } catch (_) {} }
function markMastered(body, mem) {
  body.querySelectorAll('[data-slot]').forEach((b) => b.classList.toggle('dict-mastered', window.FormDrillCore.mastered(mem[b.getAttribute('data-slot')])));
}
const DRILL_MODES = [['choice', 'dictionary.drillModeChoice', 'Выбор'], ['tiles', 'dictionary.drillModeTiles', 'Плитки'], ['type', 'dictionary.drillModeType', 'Ввод']];
let drillMode = 'choice';
try { const m = localStorage.getItem('dict.drillMode_v1'); if (DRILL_MODES.some((x) => x[0] === m)) drillMode = m; } catch (_) {}
const lemmaOf = (paradigm, fallback) => (paradigm && (paradigm.lemma_niqqud || paradigm.lemma)) || fallback || '';
const ruOf = (paradigm, slot) => (window.WordGloss && window.WordGloss.cellForms ? (window.WordGloss.cellForms(paradigm, [slot]) || {}).text || '' : '');
const askText = (t) => (t.group ? t.group + ' · ' : '') + t.label;

// One round runner for the article (one word) and for a set of words (Д2.2+).
// task = { key, lemma, study, paradigm, target }; mems: Map key → cell memory (saved per word).
function runDrill(panel, makeDeck, mems, opts) {
  const FD = window.FormDrillCore;
  opts = opts || {};
  const res = [];
  let deck = [], i = 0;
  function finish() {
    if (opts.onRound) opts.onRound();
    panel.replaceChildren();
    const right = res.filter(Boolean).length;
    panel.appendChild(el('p', { class: 'dict-drill-total', text: fill(tt('dictionary.drillDone', 'Верно {r} из {n}. {s}.'), { r: right, n: res.length, s: opts.summary() }) }));
    panel.appendChild(el('div', { class: 'dict-drill-actions' }, [
      el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: tt('dictionary.drillAgain', 'Ещё раунд'), on: { click: start } }),
      el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: opts.closeText || tt('dictionary.drillClose', 'К таблице'), on: { click: () => opts.onClose && opts.onClose() } }),
    ]));
    try { panel.querySelector('.primary').focus(); } catch (_) {}
  }
  function start() { deck = makeDeck(); res.length = 0; i = 0; if (!deck.length) { finish(); return; } ask(); }
  function modeBar(rerender) {
    return el('div', { class: 'dict-seg-group dict-drill-modes', attrs: { role: 'group', 'aria-label': tt('dictionary.drillMode', 'Как отвечать') } },
      DRILL_MODES.map(([m, k, fb]) => el('button', { class: 'dict-seg' + (drillMode === m ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': drillMode === m ? 'true' : 'false', 'data-mode': m }, text: tt(k, fb),
        on: { click: () => { if (drillMode === m) return; drillMode = m; try { localStorage.setItem('dict.drillMode_v1', m); } catch (_) {} rerender(); } } })));
  }
  function ask() {
    if (i >= deck.length) { finish(); return; }
    const task = deck[i], target = task.target, mode = drillMode, ru = ruOf(task.paradigm, target.slot);
    let done = false;
    panel.replaceChildren(
      el('div', { class: 'dict-drill-head' }, [el('span', { class: 'dict-note', text: (i + 1) + ' / ' + deck.length }), el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: task.lemma })]),
      modeBar(ask),
      el('p', { class: 'dict-drill-q' }, [el('b', { attrs: { dir: 'auto' }, text: askText(target) }), ru ? ' — ' : null, ru ? el('span', { attrs: { dir: 'auto' }, text: ru }) : null]),
    );
    const area = el('div', { class: 'dict-drill-area', attrs: { 'data-answer': target.he, 'data-mode': mode } });   // read by the smoke gate
    panel.appendChild(area);
    function grade(ok, info) {
      if (done) return; done = true;
      res.push(ok);
      const mem = FD.grade(mems.get(task.key) || {}, target.slot, ok, Date.now(), mode);
      mems.set(task.key, mem); drillSave(task.key, mem);
      area.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      panel.querySelectorAll('.dict-drill-modes button').forEach((b) => { b.disabled = true; });
      const kids = [el('span', { text: ok ? '✓ ' + tt('dictionary.drillRight', 'Верно') : '✗ ' + tt('dictionary.drillWrong', 'Правильно:') + ' ' })];
      // a produced answer is checked by letters: the vowels are always shown, and named when they decide
      if (!ok || mode !== 'choice') kids.push(el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: target.he }));
      if (target.translit) kids.push(el('span', { class: 'dict-note', text: target.translit }));
      kids.push(el('button', { class: 'dict-btn', attrs: { type: 'button', 'aria-label': tt('dictionary.speak', 'Озвучить') }, text: '▶', on: { click: () => { try { morphHost.speakWord(target.he); } catch (_) {} } } }));
      const fb = el('div', { class: 'dict-drill-fb ' + (ok ? 'ok' : 'bad') }, kids);
      if (info && info.other) fb.appendChild(el('p', { class: 'dict-drill-why', text: fill(tt('dictionary.drillOther', 'Вы написали другую форму: {f}.'), { f: askText(info.other) }) }));
      else if (info && info.niqqudAmbiguous) fb.appendChild(el('p', { class: 'dict-drill-why', text: tt('dictionary.drillVowels', 'По буквам верно. Так же пишется ещё одна форма — различает огласовка.') }));
      fb.appendChild(el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: i + 1 < deck.length ? tt('dictionary.drillNext', 'Дальше') : tt('dictionary.drillFinish', 'Итог'), on: { click: () => { i++; ask(); } } }));
      panel.appendChild(fb);
      try { fb.querySelector('.primary').focus(); } catch (_) {}
    }
    if (mode === 'choice') {
      area.classList.add('dict-drill-opts');
      FD.optionsFor(target, task.study, 4, Date.now() % 100000 + i).forEach((o) => {
        area.appendChild(el('button', { class: 'dict-drill-opt', attrs: { type: 'button', lang: 'he', dir: 'rtl', 'data-he': o.he }, text: o.he, on: { click: () => {
          const ok = FD.isCorrect(target, o.he);
          area.querySelectorAll('button').forEach((b) => { const h = b.getAttribute('data-he'); if (h === target.he) b.classList.add('ok'); else if (!ok && h === o.he) b.classList.add('bad'); });
          grade(ok, null);
        } } }));
      });
      try { area.querySelector('button').focus(); } catch (_) {}
    } else if (mode === 'tiles') {
      const tiles = FD.tilesFor(target, task.study, 3, Date.now() % 100000 + i);
      const need = FD.skeleton(target.he).length;
      const picked = [];
      const ans = el('div', { class: 'dict-tiles-ans he', attrs: { lang: 'he', dir: 'rtl', 'aria-label': tt('dictionary.drillYourAnswer', 'Ваш ответ') } });
      const pool = el('div', { class: 'dict-tiles', attrs: { dir: 'rtl' } });
      const paint = () => {
        ans.replaceChildren(...(picked.length ? picked.map((t) => el('button', { class: 'dict-tile in', attrs: { type: 'button', lang: 'he', 'aria-label': fill(tt('dictionary.drillTileBack', 'Убрать букву {c}'), { c: t.ch }) }, text: t.ch,
          on: { click: () => { picked.splice(picked.indexOf(t), 1); paint(); } } })) : [el('span', { class: 'dict-note', text: tt('dictionary.drillTilesHint', 'Нажимайте буквы по порядку') })]));
        pool.replaceChildren(...tiles.map((t) => el('button', { class: 'dict-tile', attrs: { type: 'button', lang: 'he', 'data-ch': t.ch }, text: t.ch, on: { click: () => {
          picked.push(t); paint();
          if (picked.length === need) check();
        } } })).map((b, k) => { if (picked.indexOf(tiles[k]) >= 0) b.disabled = true; return b; }));
      };
      const check = () => { const r = FD.checkTyped(target, task.study, picked.map((t) => t.ch).join('')); grade(r.ok, r); };
      paint();
      area.append(ans, pool, el('div', { class: 'dict-drill-actions' }, [
        el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.drillClear', 'Стереть'), on: { click: () => { picked.length = 0; paint(); } } }),
        el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: tt('dictionary.drillCheck', 'Проверить'), on: { click: () => { if (picked.length) check(); } } }),
      ]));
      try { pool.querySelector('button').focus(); } catch (_) {}
    } else {
      const input = el('input', { class: 'dict-drill-input he', attrs: { type: 'text', lang: 'he', dir: 'rtl', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done',
        'aria-label': tt('dictionary.drillYourAnswer', 'Ваш ответ') } });
      const note = el('p', { class: 'dict-note', text: tt('dictionary.drillTypeHint', 'Без огласовки; полное и краткое написание принимаются.') });
      input.addEventListener('input', () => {
        const r = window.FormDrillCore.fromLayout(input.value);
        if (r.converted) { input.value = r.text; note.textContent = tt('dictionary.drillLayout', 'Набрано не в ивритской раскладке — перевёл по клавишам.'); }
      });
      const form = el('form', { class: 'dict-drill-type', on: { submit: (ev) => { ev.preventDefault(); if (!input.value.trim()) return; const r = FD.checkTyped(target, task.study, input.value); grade(r.ok, r); } } },
        [input, el('button', { class: 'dict-btn primary', attrs: { type: 'submit' }, text: tt('dictionary.drillCheck', 'Проверить') })]);
      area.append(form, note);
      try { input.focus(); } catch (_) {}
    }
  }
  start();
}

async function mountFormDrill(sec, tableBody, key, card, metSlots, epoch) {
  const FD = window.FormDrillCore, IR = window.InflectionRender;
  if (!FD || !IR || !IR.projectStudyForms) return;
  const study = IR.projectStudyForms(card.paradigm);
  if (!study || FD.formsOf(study).length < 4) return;
  const mems = new Map([[key, await drillMemory(key)]]);
  if (epoch !== _articleEpoch) return;
  markMastered(tableBody, mems.get(key));
  const bar = el('div', { class: 'dict-drill-bar' });
  const sum = () => { const x = FD.summary(study, mems.get(key)); return fill(tt('dictionary.drillSummary', 'Уверенно: {m} из {t} форм'), { m: x.mastered, t: x.total }); };
  const status = el('span', { class: 'dict-note', text: sum() });
  const panel = el('div', { class: 'dict-drill', attrs: { role: 'group', 'aria-live': 'polite' } });
  panel.hidden = true;
  const lemma = card.niqqud || lemmaOf(card.paradigm);
  const start = el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: tt('dictionary.drillStart', 'Тренировать формы'), on: { click: () => {
    tableBody.hidden = true; bar.hidden = true; panel.hidden = false;
    runDrill(panel, () => FD.buildDeck(study, { metSlots, memory: mems.get(key), size: 8 }).map((target) => ({ key, lemma, study, paradigm: card.paradigm, target })), mems, {
      summary: sum,
      onClose: () => { panel.hidden = true; tableBody.hidden = false; bar.hidden = false; status.textContent = sum(); markMastered(tableBody, mems.get(key)); },
    });
  } } });
  bar.append(start, status);
  sec.append(bar, panel);
}

// Д2.2+ the set: words of the current view with a confirmed Pealim table (≥4 forms). The paradigm comes from the
// verified reading's Pealim id (reading.lemmaKey === entry key, R11) or the pid: entry itself.
function paradigmOf(e) {
  if (e.paradigm) return e.paradigm;
  const r = e.reading;
  if (!r || !r.pid || r.lemmaKey !== e.key || !_eng || !_eng.pidMap) return null;
  return _eng.pidMap.get(String(r.pid)) || null;
}
function drillable(e) {
  const p = paradigmOf(e);
  return !!(p && p.cells && Object.keys(p.cells).length >= 4 && e.status !== 'ignore');
}
function metSlotsOf(e, p) {
  const slots = new Set();
  const WG = window.WordGloss;
  if (!WG || !WG.matchCell) return [];
  e.surfaces.forEach((x) => { try { const hm = WG.matchCell(p, x.s); if (hm && !hm.impossible) (hm.slots || []).forEach((sl) => slots.add(sl)); } catch (_) {} });
  return Array.from(slots);
}
async function openSetDrill(entries, opts) {
  opts = opts || {};
  const FD = window.FormDrillCore, IR = window.InflectionRender;
  const my = ++_articleEpoch;
  S.selected = null;
  const items = [];
  for (const e of entries.filter(drillable).slice(0, 30)) {
    const p = paradigmOf(e);
    let study = null; try { study = IR.projectStudyForms(p); } catch (_) { study = null; }
    if (!study || FD.formsOf(study).length < 4) continue;
    items.push({ key: e.key, lemma: lemmaOf(p, D.displayOf(e).he), study, paradigm: p, metSlots: metSlotsOf(e, p) });
  }
  const mems = new Map();
  for (const it of items) mems.set(it.key, await drillMemory(it.key));
  if (my !== _articleEpoch) return;
  const art = $('dict-article'); art.hidden = false; $('dict-root').classList.add('has-article');
  const back = el('button', { class: 'dict-btn dict-a-back', attrs: { type: 'button' }, text: '‹ ' + tt('dictionary.back', 'К списку'), on: { click: closeArticle } });
  const words = items.length;
  const sum = () => {
    let m = 0, t = 0;
    items.forEach((it) => { const x = FD.summary(it.study, mems.get(it.key)); m += x.mastered; t += x.total; });
    return fill(tt('dictionary.drillSetSummary', 'Уверенно в этих словах: {m} из {t} форм'), { m, t });
  };
  const status = el('p', { class: 'dict-note', text: sum() });
  const panel = el('div', { class: 'dict-drill', attrs: { role: 'group', 'aria-live': 'polite' } });
  art.replaceChildren(back,
    el('h2', { class: 'dict-set-title', text: fill(tt('dictionary.drillSetTitle', 'Тренировка форм: {n} сл.'), { n: words }) }),
    ...(opts.subtitle ? [el('p', { class: 'dict-note', text: opts.subtitle })] : []),
    status, panel);
  if (window.matchMedia && window.matchMedia('(max-width: 959px)').matches) art.scrollTop = 0;
  if (!items.length) { panel.replaceChildren(el('p', { class: 'dict-note', text: tt('dictionary.drillSetNone', 'В этом наборе нет слов с подтверждённой таблицей форм.') })); return; }
  runDrill(panel, () => {
    items.forEach((it) => { it.memory = mems.get(it.key); });
    return FD.buildSetDeck(items, { size: 10, focusGroups: opts.focusGroups }).map((x) => ({ key: x.key, lemma: x.lemma, study: x.study, paradigm: x.item.paradigm, target: x.target }));
  }, mems, { summary: sum, onRound: () => { status.textContent = sum(); }, closeText: tt('dictionary.back', 'К списку'), onClose: closeArticle });
}
// a card built from the Pealim entry itself (pid: keys whose text form did not verify)
function synthCard(e) {
  const p = e.paradigm, rd = e.reading || readingFromParadigm(p, e.key);
  const selfKey = strip(p.lemma || '');
  const fam = (_eng && _eng.rootIndex && p.root ? (_eng.rootIndex.get(String(p.root)) || []) : [])
    .filter((x) => !(p.pealim_id != null && x.pid === String(p.pealim_id)) && x.key !== selfKey).slice(0, 16);
  return { lemmaKey: e.key, paradigm: p, niqqud: rd.niqqud, rootFamily: fam, label: 'exact' };
}
async function openArticle(key) {
  const e = S.entries.get(key); if (!e) return;
  const my = ++_articleEpoch;
  S.selected = key;
  document.querySelectorAll('.dict-row.sel').forEach((b) => b.classList.remove('sel'));
  const rowBtn = document.querySelector('.dict-row[data-key="' + CSS.escape(key) + '"]'); if (rowBtn) rowBtn.classList.add('sel');
  const art = $('dict-article'); art.hidden = false; $('dict-root').classList.add('has-article');
  const d = D.displayOf(e), mean = D.meaningOf(e);
  const surface = (e.reading && (e.reading.surface || e.reading.niqqud)) || (e.surfaces[0] && e.surfaces[0].s) || '';
  const back = el('button', { class: 'dict-btn dict-a-back', attrs: { type: 'button' }, text: '‹ ' + tt('dictionary.back', 'К списку'), on: { click: closeArticle } });
  const speak = el('button', { class: 'dict-btn', attrs: { type: 'button', 'aria-label': tt('dictionary.speak', 'Озвучить') }, text: '▶',
    on: { click: () => { try { morphHost.speakWord(d.he || surface); } catch (_) {} } } });
  const sub = [];
  if (d.lemma && strip(d.lemma) !== strip(d.he)) sub.push(el('span', {}, [tt('dictionary.lemma', 'лемма') + ' ', el('span', { class: 'he', text: d.lemma })]));
  if (d.pos) sub.push(el('span', { text: posText(d.pos) + (d.binyan ? ' · ' + d.binyan : '') }));
  if (d.root) sub.push(el('span', {}, [tt('dictionary.root', 'корень') + ' ', el('span', { class: 'he', text: d.root })]));
  if (e.reading && e.reading.label && e.reading.label !== 'exact') sub.push(el('span', { text: '≈ ' + tt('dictionary.likely', 'разбор вероятный') }));
  const head = el('div', { class: 'dict-a-head' }, [el('div', { class: 'dict-a-word' }, [speak, el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: d.he || surface || '—' })]), el('div', { class: 'dict-a-sub' }, sub)]);
  // status: the same canon write as a tap in the text (MorphHost.markWordStatus)
  const statusBox = el('div', { class: 'dict-a-status', attrs: { role: 'group', 'aria-label': tt('dictionary.fStatus', 'Статус') } });
  if (!String(key).startsWith('note:')) D.STATUSES.forEach((s) => {
    const on = (e.status || (e.metOnly ? '' : 'new')) === s;
    statusBox.appendChild(el('button', { class: 'dict-st-' + s + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': on ? 'true' : 'false' }, text: statusText(s),
      on: { click: async () => {
        const next = on && s !== 'new' ? 'new' : s;
        try { await morphHost.markWordStatus(key, next, null); } catch (_) {}
        morphHost.invalidateWordStates();
        e.status = next; e.metOnly = false;
        const sch = await localDb.getSrsSchedule().catch(() => ({})); e.srs = sch[key] || e.srs;
        toast(fill(tt('dictionary.statusSet', 'Статус: {s}'), { s: statusText(next) }));
        applyView(); openArticle(key);
      } } }));
  });
  const meanBox = el('div', { class: 'dict-a-mean' });
  if (e.note && e.note.userMeaning) meanBox.appendChild(el('div', {}, [el('span', { class: 'k', text: tt('dictionary.mine', 'мой перевод') }), el('span', { class: 'user', attrs: { dir: 'auto' }, text: e.note.userMeaning })]));
  const dictMeaning = (e.reading && e.reading.meaning) || (e.note && e.note.meaning) || '';
  meanBox.appendChild(el('div', {}, [el('span', { class: 'k', text: tt('dictionary.dictMeaning', 'словарь') }), el('span', { attrs: { dir: 'auto' }, text: dictMeaning || tt('dictionary.noMeaning', 'перевод не найден офлайн') })]));
  const aiBox = el('div', {}); meanBox.appendChild(aiBox);
  const openCard = el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.openCard', 'Карточка слова: мой перевод, заметка, Pealim'),
    on: { click: () => { try { RM().openWordCard(strip(surface), hasNiqqud(surface) ? surface : ''); } catch (_) {} } } });
  const placesSec = el('section', { class: 'dict-a-sec' }, [el('h3', { text: tt('dictionary.places', 'Места в моих текстах') }), el('p', { class: 'dict-note', text: tt('dictionary.loading', 'Ищу…') })]);
  const conjSec = el('details', { class: 'dict-a-sec', attrs: { open: '' } }, [el('summary', { text: tt('dictionary.conj', 'Спряжение / склонение') }), el('p', { class: 'dict-note', text: tt('dictionary.loading', 'Ищу…') })]);
  const famSec = el('details', { class: 'dict-a-sec' }, [el('summary', { text: tt('dictionary.family', 'Слова от этого корня') })]);
  const memSec = el('details', { class: 'dict-a-sec' }, [el('summary', { text: tt('dictionary.memory', 'Память') })]);
  art.replaceChildren(back, head, statusBox,
    el('section', { class: 'dict-a-sec' }, [el('h3', { text: tt('dictionary.meanings', 'Значения') }), meanBox, el('p', {}, [openCard])]),
    placesSec, conjSec, famSec, memSec);
  if (window.matchMedia && window.matchMedia('(max-width: 959px)').matches) { art.scrollTop = 0; try { back.focus(); } catch (_) {} }

  // memory (synchronous from the entry + the log)
  const m = D.memory(e, Date.now());
  const memList = el('ul', { class: 'dict-hist' });
  memSec.appendChild(el('p', { text: m.state === 'unscheduled' ? tt('dictionary.memNone', 'Слово ещё не в повторении.') :
    fill(tt('dictionary.memLine', 'Сила памяти {p}% · повторений {r} · срывов {l} · следующий срок {d}'), {
      p: m.strength == null ? '—' : Math.round(m.strength * 100), r: m.reps, l: m.lapses,
      d: e.srs && e.srs.due ? new Date(e.srs.due).toLocaleDateString(document.documentElement.lang || 'ru') : '—' }) }));
  memSec.appendChild(memList);
  localDb.getReviewLog(key).then((rows) => {
    if (my !== _articleEpoch) return;
    (rows || []).filter((r) => r.kind === 'review').slice(-10).reverse().forEach((r) => {
      const ok = Number(r.grade) >= 3;
      memList.appendChild(el('li', {}, [el('span', { text: new Date(r.reviewed_at).toLocaleDateString(document.documentElement.lang || 'ru') }),
        el('span', { text: String(r.channel || '') }), el('span', { class: ok ? 'ok' : 'bad', text: ok ? '✓' : '✗' })]));
    });
  }).catch(() => {});

  // card-dependent sections: conjugation, family, places (+ the AI gloss of each place)
  const card = surface ? await fullCard(surface) : null;
  if (my !== _articleEpoch) return;
  const verified = card && card.lemmaKey === key ? card : (e.paradigm ? synthCard(e) : null);
  conjSec.lastChild.remove();
  const places = await findPlaces(e, verified);
  if (my !== _articleEpoch) return;
  if (verified && verified.paradigm && window.InflectionRender && window.InflectionRender.renderParadigm) {
    const slots = new Set();
    places.forEach((p) => {
      const form = RM().words(String(p.he || ''))[p.offset];
      try { const hm = window.WordGloss && window.WordGloss.matchCell ? window.WordGloss.matchCell(verified.paradigm, form) : null; if (hm && !hm.impossible) (hm.slots || []).forEach((sl) => slots.add(sl)); } catch (_) {}
    });
    let tbl = ''; try { tbl = window.InflectionRender.renderParadigm(verified.paradigm, { highlightForm: verified.niqqud, highlightSlots: Array.from(slots) }); } catch (_) { tbl = ''; }
    const body = el('div', { class: 'rm-conj-body' }); body.innerHTML = tbl;
    conjSec.appendChild(tbl ? body : el('p', { class: 'dict-note', text: tt('dictionary.noConj', 'Это слово не изменяется или таблицы для него нет.') }));
    if (slots.size) conjSec.appendChild(el('p', { class: 'dict-note', text: fill(tt('dictionary.conjMet', 'Подсвечены формы, встреченные в ваших текстах: {n}.'), { n: slots.size }) }));
    if (tbl) await mountFormDrill(conjSec, body, key, verified, Array.from(slots), my);
  } else {
    conjSec.appendChild(el('p', { class: 'dict-note', text: verified ? tt('dictionary.noConj', 'Это слово не изменяется или таблицы для него нет.') : tt('dictionary.noReading', 'Разбор слова не подтверждён — таблицу не показываю, чтобы не ошибиться.') }));
  }
  const fam = (verified && verified.rootFamily) || [];
  if (fam.length) {
    const box = el('div', { class: 'dict-fam' });
    fam.slice(0, 24).forEach((x) => box.appendChild(el('button', { attrs: { type: 'button' }, on: { click: () => { try { RM().openWordCard(x.key || strip(x.disp), x.disp || ''); } catch (_) {} } } },
      [el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: x.disp }), el('small', { text: x.meaning || '' })])));
    famSec.appendChild(box);
  } else famSec.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.noFamily', 'Других слов этого корня в словаре нет.') }));
  // places
  placesSec.lastChild.remove();
  if (!places.length) placesSec.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.noPlaces', 'В ваших сохранённых текстах это слово не найдено.') }));
  const list = el('ul', { class: 'dict-places' });
  const aiSeen = new Map();
  for (const p of places.slice(0, 20)) {
    const li = el('li', { class: 'dict-place' }, [highlight(p.he, p.offset)]);
    if (p.ru) li.appendChild(el('div', { class: 'ru', attrs: { dir: 'auto' }, text: p.ru }));
    try {
      const ai = window.WordGlossAI ? await window.WordGlossAI.wordAtData({ he_niqqud: p.row.he_niqqud, he_plain: p.row.he_plain, ru: p.row.ru }, p.offset) : null;
      if (ai && ai.gloss) {
        li.appendChild(el('div', { class: 'ctx' }, [tt(ai.manual ? 'room.morph.aiInContextFixed' : 'room.morph.aiInContext', ai.manual ? 'в контексте (исправлено)' : 'в контексте (ИИ)') + ': ', el('b', { text: ai.gloss }), ai.mwe ? ' · ' + tt('room.morph.aiMwe', 'сочетание') + ': ' + ai.mwe : '']));
        aiSeen.set(ai.gloss, (aiSeen.get(ai.gloss) || 0) + 1);
      }
    } catch (_) {}
    li.appendChild(el('div', { class: 'src' }, [el('span', { text: p.title || '' }),
      el('a', { attrs: { href: '/library.html?my_text=' + encodeURIComponent(p.textId) + '&at=' + p.order }, text: tt('dictionary.openInText', 'Открыть в тексте') })]));
    list.appendChild(li);
    if (my !== _articleEpoch) return;
  }
  if (places.length) placesSec.appendChild(list);
  if (places.length > 20) placesSec.appendChild(el('p', { class: 'dict-note', text: fill(tt('dictionary.morePlaces', 'И ещё мест: {n}'), { n: places.length - 20 }) }));
  if (aiSeen.size) {
    const txt = Array.from(aiSeen.entries()).sort((a, b) => b[1] - a[1]).map(([g, n]) => n > 1 ? g + ' (' + n + ')' : g).join('; ');
    aiBox.replaceChildren(el('span', { class: 'k', text: tt('dictionary.aiMeanings', 'в контексте (ИИ)') }), el('span', { class: 'ai', text: txt }));
  }
}
function closeArticle() {
  _articleEpoch++;
  S.selected = null;
  $('dict-article').hidden = true; $('dict-root').classList.remove('has-article');
  document.querySelectorAll('.dict-row.sel').forEach((b) => b.classList.remove('sel'));
}

// ── Д2.3 «Прогресс словаря» (DictionaryProgress: статусы из журнала отметок, слабые места) ─────────
const P = () => window.DictionaryProgress;
const TENSE_LABEL = { present: ['dictionary.tense.present', 'настоящее'], past: ['dictionary.tense.past', 'прошедшее'], future: ['dictionary.tense.future', 'будущее'],
  imperative: ['dictionary.tense.imperative', 'повелительное'], infinitive: ['dictionary.tense.infinitive', 'инфинитив'] };
function tenseText(t) {
  const passive = /^passive_/.test(t), x = TENSE_LABEL[t.replace(/^passive_/, '')];
  const base = x ? tt(x[0], x[1]) : t;
  return passive ? tt('dictionary.tense.passive', 'страдат.') + ' · ' + base : base;
}
const pct = (r) => Math.round(r * 100) + '%';
const dateShort = (t) => new Date(t).toLocaleDateString(document.documentElement.lang || 'ru', { day: 'numeric', month: 'short' });
// «Учить эти» on any list of entries (the same hand-off as the button over the list)
function startTrain(list) {
  const learnable = list.filter((e) => !e.metOnly && e.status !== 'ignore' && !String(e.key).startsWith('note:'));
  if (!learnable.length) return;
  try { localStorage.setItem('dict.trainSet_v1', JSON.stringify({ at: Date.now(), keys: learnable.slice(0, 200).map((e) => e.key) })); } catch (_) {}
  location.href = '/library.html?review=set&from=dictionary';
}
function setView(v) {
  S.viewMode = v;
  document.querySelectorAll('[data-view]').forEach((b) => { const on = b.getAttribute('data-view') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  $('dict-words-view').hidden = v !== 'words';
  $('dict-prog-view').hidden = v !== 'progress';
  if (v === 'progress') renderProgress();
}
function showWords(filters) {
  Object.assign(S.filters, { statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0, q: '' }, filters || {});
  $('dict-q').value = '';
  S.shown = 0; setView('words'); applyView();
  if (!$('dict-filters').hidden) renderFilters();
}
let _progEpoch = 0;
async function progressData(now) {
  const mine = Array.from(S.entries.values()).filter((e) => !e.metOnly);
  const [marks, days, drill] = await Promise.all([
    q(`SELECT item_key, reviewed_at, json_extract(meta_json, '$.status') AS status FROM review_log WHERE kind = 'mark'`),
    q(`SELECT substr(reviewed_at, 1, 10) AS day, COUNT(*) AS n, SUM(CASE WHEN grade <= 1 THEN 1 ELSE 0 END) AS fails
         FROM review_log WHERE kind = 'review' AND reviewed_at >= ? GROUP BY day`, [new Date(now - 60 * 86400000).toISOString()]),
    drillAll(),
  ]);
  const dyn = P().dynamics(mine.map((e) => ({ key: e.key, status: e.status || 'new', added: e.added })),
    marks.map((m) => ({ key: m.item_key, at: m.reviewed_at, status: m.status || '' })), now);
  return { mine, dyn, days, drill };
}
async function renderProgress() {
  const box = $('dict-prog-view'); if (!box) return;
  const my = ++_progEpoch;
  box.replaceChildren(el('p', { class: 'dict-note', text: tt('dictionary.loading', 'Ищу…') }));
  const now = Date.now();
  const { mine, dyn, days, drill } = await progressData(now);
  if (my !== _progEpoch) return;
  const kids = [];

  // now: one stacked bar + legend with numbers (each opens the list filtered by that status)
  const c = dyn.now, order = D.STATUSES.filter((s) => c[s]);
  kids.push(el('h3', { text: fill(tt('dictionary.progNow', 'Сейчас: {n} слов'), { n: c.total }) }));
  if (c.total) {
    kids.push(el('div', { class: 'dict-pbar', attrs: { role: 'img', 'aria-label': order.map((s) => statusText(s) + ' ' + c[s]).join(', ') } },
      order.map((s) => el('i', { class: 'dict-st-' + s, attrs: { style: 'flex-grow:' + c[s], title: statusText(s) + ': ' + c[s] } }))));
    kids.push(el('div', { class: 'dict-plegend' }, order.map((s) => el('button', { class: 'dict-chip', attrs: { type: 'button' }, on: { click: () => showWords({ statuses: [s] }) } },
      [el('span', { class: 'dict-dot dict-st-' + s }), statusText(s), el('b', { text: String(c[s]) })]))));
  } else kids.push(el('p', { class: 'dict-note', text: tt('dictionary.emptyAll', 'Здесь появятся слова, которые вы отметите статусом, добавите в «мои слова» или будете повторять. Откройте текст в Зале и нажмите на слово.') }));

  // change: headline per period + table now / a week ago / a month ago
  kids.push(el('h3', { text: tt('dictionary.progChange', 'Как менялось') }));
  [['week', 'dictionary.progWeek', 'За неделю'], ['month', 'dictionary.progMonth', 'За месяц']].forEach(([p, k, fb]) => {
    const x = dyn.periods[p];
    kids.push(el('p', { class: 'dict-pline' }, [el('b', { text: tt(k, fb) + ': ' }),
      fill(tt('dictionary.progLine', 'стало «знаю» +{k} · поднялись по шкале {u} · новых слов {a}'), { k: x.known, u: x.up, a: x.added })]));
  });
  const delta = (a, b) => { const d = a - b; return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; };
  const rowsSt = D.STATUSES.filter((s) => c[s] || dyn.periods.week.then[s] || dyn.periods.month.then[s]);
  if (rowsSt.length) {
    kids.push(el('div', { class: 'dict-ptable-wrap' }, [el('table', { class: 'dict-ptable' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: tt('dictionary.fStatus', 'Статус') }), el('th', { text: tt('dictionary.progColNow', 'Сейчас') }),
        el('th', { text: tt('dictionary.progWeek', 'За неделю') }), el('th', { text: tt('dictionary.progMonth', 'За месяц') })])]),
      el('tbody', {}, rowsSt.map((s) => el('tr', {}, [el('th', {}, [el('span', { class: 'dict-dot dict-st-' + s }), statusText(s)]), el('td', { text: String(c[s]) }),
        el('td', {}, [el('bdi', { attrs: { dir: 'ltr' }, text: delta(c[s], dyn.periods.week.then[s]) })]), el('td', {}, [el('bdi', { attrs: { dir: 'ltr' }, text: delta(c[s], dyn.periods.month.then[s]) })])]))),
    ])]));
  }
  if (dyn.noHistory) kids.push(el('p', { class: 'dict-note', text: fill(tt('dictionary.progNoHistory', 'Слов без журнала отметок: {n}. Они считаются в нынешнем статусе с даты добавления.'), { n: dyn.noHistory }) }));

  // reviews per week (one series: count; the fail share in the tooltip and the caption)
  const wk = P().weekly(days, now, 8), maxN = Math.max(1, ...wk.map((w) => w.n)), last = wk[wk.length - 1];
  kids.push(el('h3', { text: tt('dictionary.progReviews', 'Повторения по неделям') }));
  kids.push(el('div', { class: 'dict-pweeks', attrs: { role: 'list' } }, wk.map((w, i) => {
    const label = dateShort(w.from) + '–' + dateShort(w.to) + ': ' + fill(tt('dictionary.progWeekTip', '{n} повторений, срывов {f}'), { n: w.n, f: w.fails });
    return el('div', { class: 'dict-pweek', attrs: { role: 'listitem', title: label, 'aria-label': label, tabindex: '0' } }, [
      el('span', { class: 'v', text: i === wk.length - 1 || w.n === maxN ? String(w.n) : '' }),
      el('i', { attrs: { style: 'height:' + Math.max(w.n ? 4 : 0, Math.round(w.n / maxN * 100)) + '%' } }),
      el('span', { class: 'd', text: dateShort(w.to) })]);
  })));
  kids.push(el('p', { class: 'dict-note', text: last.n ? fill(tt('dictionary.progLastWeek', 'Последние 7 дней: {n} повторений, точность {p}.'), { n: last.n, p: pct(1 - last.fails / last.n) }) : tt('dictionary.progNoReviews', 'За последние 7 дней повторений не было.') }));

  // weak spots — word memory (fail share of reviews) by part of speech and binyan
  kids.push(el('h3', { text: tt('dictionary.progWeakWords', 'Слабые места — память слов') }));
  const rows = (dim) => mine.filter((e) => e.status !== 'ignore').map((e) => ({ value: D.displayOf(e)[dim], reviews: (e.log && e.log.reviews) || 0, fails: (e.log && e.log.fails) || 0 }));
  let anyWeak = false;
  [['pos', 'dictionary.fPos', 'Часть речи', posText], ['binyan', 'dictionary.fBinyan', 'Биньян', (b) => b]].forEach(([dim, k, fb, lab]) => {
    const r = P().weakSpots(rows(dim));
    if (!r.groups.length) return;
    anyWeak = true;
    kids.push(el('p', { class: 'dict-psub' }, [el('b', { text: tt(k, fb) }), ' · ' + fill(tt('dictionary.progAvg', 'в среднем срывов {p}'), { p: pct(r.overall.rate) })]));
    kids.push(el('ul', { class: 'dict-pweak' }, r.groups.slice(0, 6).map((g) => {
      const list = mine.filter((e) => D.displayOf(e)[dim] === g.value && e.status !== 'ignore');
      return el('li', { class: g.weak ? 'weak' : '' }, [
        el('div', {}, [el('b', { text: lab(g.value) }), g.weak ? el('span', { class: 'dict-pflag', text: tt('dictionary.progWeakFlag', 'слабое место') }) : null]),
        el('div', { class: 'dict-note', text: fill(tt('dictionary.progWeakLine', 'срывов {f} из {r} ({p}) · слов {w}'), { f: g.fails, r: g.reviews, p: pct(g.rate), w: g.words }) }),
        el('div', { class: 'dict-pacts' }, [
          el('button', { class: 'dict-btn' + (g.weak ? ' primary' : ''), attrs: { type: 'button' }, text: tt('dictionary.progTrainThis', 'Тренировать это'), on: { click: () => startTrain(D.sortEntries(list, 'weak', Date.now())) } }),
          el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.progShowWords', 'Показать слова'), on: { click: () => { showWords(dim === 'pos' ? { pos: [g.value] } : { binyan: [g.value] }); S.sort = 'weak'; $('dict-sort').value = 'weak'; applyView(); } } }),
        ]),
      ]);
    })));
  });
  if (!anyWeak) kids.push(el('p', { class: 'dict-note', text: tt('dictionary.progWeakFew', 'Пока мало данных: группе нужно хотя бы 3 слова и 8 повторений.') }));

  // weak spots — forms (cell memory of the form drill) by binyan and tense
  kids.push(el('h3', { text: tt('dictionary.progWeakForms', 'Слабые места — формы') }));
  const recs = drill.map((r) => { const e = S.entries.get(r.key); return { key: r.key, binyan: e ? D.displayOf(e).binyan : '', mem: r.mem }; });
  const fw = P().formWeakSpots(recs);
  const formRows = [].concat(fw.binyan.slice(0, 4).map((g) => ['binyan', g]), fw.tense.slice(0, 4).map((g) => ['tense', g]));
  if (!formRows.length) kids.push(el('p', { class: 'dict-note', text: tt('dictionary.progFormsFew', 'Пока мало ответов в тренировке форм: нужно хотя бы 6 ответов в группе.') }));
  else {
    kids.push(el('p', { class: 'dict-psub', text: fill(tt('dictionary.progFormsAvg', 'в среднем ошибок {p}'), { p: pct(fw.overall.rate) }) }));
    kids.push(el('ul', { class: 'dict-pweak' }, formRows.map(([kind, g]) => {
      const list = kind === 'binyan' ? Array.from(S.entries.values()).filter((e) => D.displayOf(e).binyan === g.value) : g.keys.map((k) => S.entries.get(k)).filter(Boolean);
      const name = kind === 'binyan' ? tt('dictionary.fBinyan', 'Биньян') + ' ' + g.value : tenseText(g.value);
      return el('li', { class: g.weak ? 'weak' : '' }, [
        el('div', {}, [el('b', { text: name }), g.weak ? el('span', { class: 'dict-pflag', text: tt('dictionary.progWeakFlag', 'слабое место') }) : null]),
        el('div', { class: 'dict-note', text: fill(tt('dictionary.progFormsLine', 'ошибок {f} из {r} ({p}) · слов {w}'), { f: g.wrong, r: g.seen, p: pct(g.rate), w: g.words }) }),
        el('div', { class: 'dict-pacts' }, [el('button', { class: 'dict-btn' + (g.weak ? ' primary' : ''), attrs: { type: 'button' }, text: tt('dictionary.drillStart', 'Тренировать формы'),
          on: { click: () => openSetDrill(list, { subtitle: name, focusGroups: kind === 'tense' ? [g.value] : null }) } })]),
      ]);
    })));
  }
  box.replaceChildren(...kids);
}

// ── XLSX «Мой словарь»: текущий вид (фильтры + сортировка) → учебная книга (DictionaryWorkbook, спека F4_XLSX_PREMIUM) ──
let _zipLib = null;
function zipLib() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!_zipLib) _zipLib = new Promise((resolve, reject) => {
    const sc = document.createElement('script'); sc.src = '/db/jszip.min.js';
    sc.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip'))); sc.onerror = () => { _zipLib = null; reject(new Error('JSZip')); };
    document.head.appendChild(sc);
  });
  return _zipLib;
}
const isoDay = (t) => { if (!t) return ''; const d = new Date(t); return Number.isFinite(d.getTime()) ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : ''; };
// one example sentence per word from MY texts: the training bank, a saved occurrence of «my word», the place a
// status was set — the word's offset in the sentence is found by its surface (bold in the book)
async function examplesFor(list) {
  const want = new Set(list.map((e) => e.key)), out = new Map();
  const put = (key, he, surface, ru, title) => {
    if (!want.has(key) || out.has(key) || !he) return;
    let at = -1, len = 0, pos = 0;
    try {
      for (const tk of RM().tokenize(he)) {
        if (tk.isWord && at < 0 && surface && strip(tk.text) === strip(surface)) { at = pos; len = tk.text.length; }
        pos += tk.text.length;
      }
    } catch (_) {}
    out.set(key, { he, at, len, ru: ru || '', title: title || '' });
  };
  (await q(`SELECT wc.lemma_key, wc.surface, s.he_niqqud, s.he_plain, s.ru, t.title FROM word_context wc
             JOIN texts t ON t.text_key = wc.text_key AND t.is_archived = 0 JOIN sentences s ON s.text_id = t.id AND s.order_index = wc.order_index
            WHERE wc.source_class = 'mytext' ORDER BY wc.verified_at DESC`)).forEach((r) => put(r.lemma_key, r.he_niqqud || r.he_plain, r.surface, r.ru, r.title));
  const byNote = new Map(); list.forEach((e) => { if (e.note && e.note.id && !out.has(e.key)) byNote.set(e.note.id, e.key); });
  if (byNote.size) {
    (await q(`SELECT o.note_id, o.word_offset, s.he_niqqud, s.he_plain, s.ru, t.title FROM note_occurrences o JOIN sentences s ON s.id = o.sentence_id
               JOIN texts t ON t.id = s.text_id AND t.is_archived = 0`)).forEach((r) => {
      const key = byNote.get(r.note_id); if (!key) return;
      const he = r.he_niqqud || r.he_plain || '', w = RM().words(he)[Number(r.word_offset)];
      put(key, he, w, r.ru, r.title);
    });
  }
  for (const e of list) {
    if (out.has(e.key) || !e.mark || e.mark.textKey == null) continue;
    const r = (await q(`SELECT s.he_niqqud, s.he_plain, s.ru, t.title FROM sentences s JOIN texts t ON t.id = s.text_id AND t.is_archived = 0
                         WHERE t.text_key = ? AND s.order_index = ?`, [e.mark.textKey, e.mark.order]))[0];
    if (r) put(e.key, r.he_niqqud || r.he_plain, e.mark.surface, r.ru, r.title);
  }
  return out;
}
// the lemma's own transliteration: the paradigm cell spelled like the lemma (infinitive, singular…)
function lemmaTranslit(p) {
  if (!p || !p.cells) return '';
  const want = strip(p.lemma_niqqud || p.lemma || '');
  for (const c of Object.values(p.cells)) if (c && c.he && strip(c.he) === want && c.translit) return c.translit;
  return '';
}
let _exporting = false;
async function exportXlsx(list) {
  if (_exporting || !list.length) return;
  _exporting = true;
  const FD = window.FormDrillCore, IR = window.InflectionRender, now = Date.now();
  const L = (k, fb) => tt(k, fb);
  try {
    progress(fill(tt('dictionary.xlsxPreparing', 'Готовлю таблицу: {d} из {n}'), { d: 0, n: list.length }));
    const JSZip = await zipLib();
    const memAll = new Map((await drillAll()).map((r) => [r.key, r.mem]));
    const examples = await examplesFor(list);
    const words = [];
    let t0 = performance.now();
    for (let i = 0; i < list.length; i++) {
      const e = list[i], d = D.displayOf(e), m = D.memory(e, now);
      const p = paradigmOf(e);
      let study = null; if (p) { try { study = IR.projectStudyForms(p); } catch (_) { study = null; } }
      const mem = memAll.get(e.key) || {};
      let table = null, total = 0, mastered = 0;
      if (study && FD.formsOf(study).length) {
        const met = new Set(metSlotsOf(e, p));
        table = { groups: study.groups.map((g) => ({ key: g.key, label: g.label, forms: (g.forms || []).filter((f) => f && f.he && f.slot).map((f) => {
          const c = mem[f.slot] || {}, done = FD.mastered(c);
          total++; if (done) mastered++;
          return { slot: f.slot, label: f.label || f.slot, he: f.he, translit: f.translit || '', ru: ruOf(p, f.slot), met: met.has(f.slot), mastered: done, seen: Number(c.seen) || 0, right: Number(c.right) || 0 };
        }) })).filter((g) => g.forms.length) };
      }
      words.push({ key: e.key, he: d.he || (p && (p.lemma_niqqud || p.lemma)) || '', translit: lemmaTranslit(p),
        meaning: (e.reading && e.reading.meaning) || (e.note && e.note.meaning) || '', mine: (e.note && e.note.userMeaning) || '',
        posText: posText(d.pos), binyan: d.binyan, root: d.root, status: e.metOnly ? '' : (e.status || 'new'), statusText: e.metOnly ? '' : statusText(e.status || 'new'),
        strength: m.strength == null ? null : Math.round(m.strength * 100), due: e.srs && e.srs.due > 0 ? e.srs.due : null, reps: m.reps, lapses: m.lapses,
        occ: D.occurrences(e), added: e.added, lastSeen: e.lastSeen, example: examples.get(e.key) || null,
        pealimUrl: (p && p.pealim_url) || '', appUrl: location.origin + '/dictionary.html?word=' + encodeURIComponent(e.key),
        table, formsTotal: total, formsMastered: mastered });
      if (performance.now() - t0 > 30) { progress(fill(tt('dictionary.xlsxPreparing', 'Готовлю таблицу: {d} из {n}'), { d: i + 1, n: list.length })); await yieldNow(); t0 = performance.now(); }
    }
    // progress: the same numbers as the Progress tab, over all my words (not just this view)
    const pd = await progressData(now), c = pd.dyn.now, W = pd.dyn.periods;
    const statuses = D.STATUSES.filter((s) => c[s] || W.week.then[s] || W.month.then[s]).map((s) => ({ key: s, label: statusText(s), now: c[s], dWeek: c[s] - W.week.then[s], dMonth: c[s] - W.month.then[s] }));
    const lineOf = (x) => fill(tt('dictionary.progLine', 'стало «знаю» +{k} · поднялись по шкале {u} · новых слов {a}'), { k: x.known, u: x.up, a: x.added });
    const weak = [];
    [['pos', tt('dictionary.fPos', 'Часть речи'), posText], ['binyan', tt('dictionary.fBinyan', 'Биньян'), (b) => b]].forEach(([dim, dimLabel, labf]) => {
      P().weakSpots(pd.mine.filter((e) => e.status !== 'ignore').map((e) => ({ value: D.displayOf(e)[dim], reviews: (e.log && e.log.reviews) || 0, fails: (e.log && e.log.fails) || 0 })))
        .groups.forEach((g) => weak.push({ dim: dimLabel, label: labf(g.value), fails: g.fails, of: g.reviews, rate: g.rate, words: g.words, weak: g.weak }));
    });
    const fw = P().formWeakSpots(pd.drill.map((r) => { const en = S.entries.get(r.key); return { key: r.key, binyan: en ? D.displayOf(en).binyan : '', mem: r.mem }; }));
    const formsDim = tt('dictionary.progWeakForms', 'Слабые места — формы');
    fw.binyan.forEach((g) => weak.push({ dim: formsDim, label: tt('dictionary.fBinyan', 'Биньян') + ' ' + g.value, fails: g.wrong, of: g.seen, rate: g.rate, words: g.words, weak: g.weak }));
    fw.tense.forEach((g) => weak.push({ dim: formsDim, label: tenseText(g.value), fails: g.wrong, of: g.seen, rate: g.rate, words: g.words, weak: g.weak }));
    const weekly = P().weekly(pd.days, now, 8).map((w) => ({ label: dateShort(w.from) + '–' + dateShort(w.to), n: w.n, fails: w.fails }));
    const progressBlock = { statuses, maxStatus: Math.max(1, ...statuses.map((s) => s.now)),
      lines: [[tt('dictionary.progWeek', 'За неделю'), lineOf(W.week)], [tt('dictionary.progMonth', 'За месяц'), lineOf(W.month)]],
      noHistory: pd.dyn.noHistory ? fill(tt('dictionary.progNoHistory', 'Слов без журнала отметок: {n}. Они считаются в нынешнем статусе с даты добавления.'), { n: pd.dyn.noHistory }) : '',
      weekly, maxWeek: Math.max(1, ...weekly.map((w) => w.n)), weak };
    const legend = D.STATUSES.filter((s) => s !== 'ignore' || c.ignore).map((s) => ({ key: s, label: statusText(s) }));
    const book = window.DictionaryWorkbook.build({ now, dateText: new Date(now).toLocaleDateString(document.documentElement.lang || 'ru'), filterText: activeSummary(),
      words, progress: progressBlock, statusLegend: legend }, L);
    const zip = new JSZip();
    Object.entries(window.XlsxCore.buildParts(book)).forEach(([k, v]) => zip.file(k, v));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    const name = 'linguistpro-dictionary-' + isoDay(now) + '.xlsx';
    window.LPDictionary.lastExport = { name, size: blob.size, words: words.length, forms: book.meta.forms, tests: book.meta.tests, blob };   // smoke / diagnostics
    const url = URL.createObjectURL(blob), a = el('a', { attrs: { href: url, download: name } });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    progress('');
    toast(fill(tt('dictionary.xlsxDone', 'Таблица готова: {w} слов, {f} форм'), { w: words.length, f: book.meta.forms }));
  } catch (err) {
    progress('');
    toast(tt('dictionary.xlsxFailed', 'Не удалось собрать таблицу. Попробуйте ещё раз.'));
    try { console.warn('[dictionary] xlsx', err); } catch (_) {}
  } finally { _exporting = false; }
}

// ── wiring ─────────────────────────────────────────────────────────────────────────────────────
function wire() {
  let qt = 0;
  $('dict-q').addEventListener('input', (ev) => { S.pauseUntil = performance.now() + 600; clearTimeout(qt); qt = setTimeout(() => { S.filters.q = ev.target.value; S.shown = 0; applyView(); }, 150); });
  $('dict-sort').value = S.sort;
  $('dict-sort').addEventListener('change', (ev) => { S.sort = ev.target.value; saveView(); S.shown = 0; applyView(); });
  $('dict-filter-btn').addEventListener('click', () => {
    const box = $('dict-filters'), open = box.hidden;
    box.hidden = !open; $('dict-filter-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderFilters();
  });
  document.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    S.filters.scope = b.getAttribute('data-scope');
    document.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('on', x === b));
    S.shown = 0;
    if (S.filters.scope === 'met' && !S.metBuilt) buildMet(); else applyView();
  }));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.getAttribute('data-view'))));
  document.addEventListener('i18n:changed', () => { applyView(); if (S.viewMode === 'progress') renderProgress(); if (!$('dict-filters').hidden) renderFilters(); if (S.selected) openArticle(S.selected); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('dict-article').hidden && !document.querySelector('.rm-sheet.rm-open')) closeArticle(); });
}

async function boot() {
  wire();
  try { if (localDb.initLocalDB) await localDb.initLocalDB(); } catch (_) {}
  morphHost = window.MorphHost.createHost({
    ldb: async () => localDb, getTextKey: async () => null, verifyOccurrence: async () => null, toast,
    onProfileChanged: () => { reloadSoon(); },
    getTtsKey: () => { try { return localStorage.getItem('v3.gcpTtsApiKey') || ''; } catch (_) { return ''; } },
    dayStr: () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    getDueNowCount: () => 0, getContextOverlay: () => null, applyI18n: () => { try { window.applyI18n && window.applyI18n(); } catch (_) {} },
  });
  // the canonical tap card (my meaning, note, Pealim) for «Карточка слова»; no table to wrap here
  try {
    window.ReaderMorph.attach(document.body, {
      cellSelector: '.dict-no-cells', getRow: () => null, getTextKey: () => null,
      saveWord: (c, o) => morphHost.saveWord(c, o), lookupNote: (c) => morphHost.lookupNote(c), loadWordNote: (c) => morphHost.loadWordNote(c),
      saveWordPersonal: (c, o, f) => morphHost.saveWordPersonal(c, o, f), speakWord: (t) => morphHost.speakWord(t),
      getWordStates: () => morphHost.ensureWordStates(), getWordStatus: (lk) => localDb.getWordStatus(lk),
      setWordStatus: async (lk, st) => { const r = await morphHost.markWordStatus(lk, st, null); morphHost.invalidateWordStates(); reloadSoon(); return r; },
      lookupUserMeaning: (c) => morphHost.lookupUserMeaning(c), saveUserMeaning: async (c, o, v) => { const r = await morphHost.saveUserMeaning(c, o, v); reloadSoon(); return r; },
    });
  } catch (_) {}
  progress(tt('dictionary.loading', 'Ищу…'));
  await reload();
  $('dict-root').setAttribute('aria-busy', 'false');
  // «Открыть в LinguistPro ↗» from the XLSX book: dictionary.html?word=<key> opens that word's article
  try { const w = new URLSearchParams(location.search).get('word'); if (w && S.entries.has(w)) openArticle(w); } catch (_) {}
}
let _reloadT = 0;
function reloadSoon() { clearTimeout(_reloadT); _reloadT = setTimeout(() => reload(), 300); }
async function reload() {
  const fresh = await loadSources();
  // keep readings and «met» entries already computed
  S.entries.forEach((old, k) => { const e = fresh.get(k); if (e && old.reading !== undefined) { e.reading = old.reading; e.paradigm = old.paradigm; e.forms = old.forms; } if (!e && old.metOnly) fresh.set(k, old); else if (e && old.met) e.met = old.met; });
  S.entries = fresh;
  applyView();
  await resolveReadings(S.entries);
  applyView();
  if (S.viewMode === 'progress') renderProgress();
  if (S.selected && S.entries.has(S.selected)) openArticle(S.selected);
}
window.LPDictionary = { state: S, reload, openArticle, setView };   // smoke / diagnostics
boot();
