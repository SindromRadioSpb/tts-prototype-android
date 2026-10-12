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
  sort: 'added', metBuilt: false, metBuilding: false, pauseUntil: 0,
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
              SUM(CASE WHEN grade IS NOT NULL AND grade <= 1 THEN 1 ELSE 0 END) AS fails,
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
    logAgg: logRows.map((r) => ({ key: r.item_key, n: Number(r.n) || 0, first: r.first, last: r.last, fails: Number(r.fails) || 0, surface: r.surface || '' })),
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
  if (!learnable.length) return;
  box.appendChild(el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: fill(tt('dictionary.trainThese', 'Учить эти ({n})'), { n: learnable.length }),
    on: { click: () => {
      try { localStorage.setItem('dict.trainSet_v1', JSON.stringify({ at: Date.now(), keys: learnable.slice(0, 200).map((e) => e.key) })); } catch (_) {}
      location.href = '/library.html?review=set&from=dictionary';
    } } }));
  box.appendChild(el('span', { class: 'dict-note', text: tt('dictionary.trainNote', 'Тренировка в Зале по этим словам в текущем порядке; ответы идут в расписание повторения.') }));
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
  document.addEventListener('i18n:changed', () => { applyView(); if (!$('dict-filters').hidden) renderFilters(); if (S.selected) openArticle(S.selected); });
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
  if (S.selected && S.entries.has(S.selected)) openArticle(S.selected);
}
window.LPDictionary = { state: S, reload, openArticle };   // smoke / diagnostics
boot();
