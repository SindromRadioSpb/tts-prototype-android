// public/js/dictionary-ui.js — «Мой словарь» (Ф4 · Д1): список + фильтры + сортировка + статья слова.
// Спека: docs/planning/word-layer/F4_D1_DICTIONARY_SPEC_2026_10_12.md.
//
// Источники записи — существующие хранилища (word_status, расписание FSRS, канонические заметки «мои
// слова», review_log, word_context); ядро склейки — DictionaryCore (чистое, под тестом). Разбор слова —
// офлайн ReaderMorph.resolveWordLight с проверкой личности: запись получает разбор ТОЛЬКО если lemmaKey
// резолвера совпал с её ключом (R11). Статус пишется тем же MorphHost.markWordStatus, что в тексте.
// Урок O-080: никакого сплошного перебора на главном потоке — разбор порциями с уступками.
import * as localDb from '/db/local-db.js?v=756';

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
  ignore: ['room.morph.status.ignore', 'не учить'], none: ['dictionary.status.none', 'не размечено'],
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
  filters: { q: '', statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0, freq: [], scope: 'mine' },
  sort: 'added', viewMode: 'words', text: null, textList: null, live: {}, schedule: {}, metBuilt: false, metBuilding: false, pauseUntil: 0,
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
const MY_NOTE_SQL = `n.source = 'curated' OR json_extract(n.body_json, '$.meaning_source') = 'user'
  OR (n.user_touched = 1 AND n.gen_dedup_key IS NOT NULL AND n.gen_dedup_key <> '')`;
async function loadSources() {
  const [statuses, statusRows, schedule, noteRows, logRows, ctxRows, ctxSrcRows, textClsRows, noteTextRows] = await Promise.all([
    localDb.getAllWordStatuses().catch(() => ({})),
    q('SELECT lemma_key, updated_at, srs_surface, srs_text_key, srs_order_index FROM word_status'),
    localDb.getSrsSchedule().catch(() => ({})),
    q(`SELECT n.id, n.body_json, n.created_at, COUNT(o.id) AS occ, MAX(o.created_at) AS last_occ
         FROM notes_v2 n LEFT JOIN note_occurrences o ON o.note_id = n.id
        WHERE n.note_type = 'word_study'
          -- «my words» only: «Добавить в мои слова», my own translation, or a canonical note I touched.
          -- Auto-generated notes (source='auto') and bulk-imported notes without a canon key are not mine.
          AND (${MY_NOTE_SQL})
        GROUP BY n.id`),
    q(`SELECT item_key, COUNT(*) AS n, MIN(reviewed_at) AS first, MAX(reviewed_at) AS last,
              SUM(CASE WHEN kind = 'review' AND grade IS NOT NULL AND grade <= 1 THEN 1 ELSE 0 END) AS fails,
              SUM(CASE WHEN kind = 'review' THEN 1 ELSE 0 END) AS reviews,
              MAX(json_extract(meta_json, '$.surface')) AS surface
         FROM review_log WHERE kind IN ('review','mark','seed','skip') AND source <> 'mark-backfill' GROUP BY item_key`),
    q('SELECT lemma_key, COUNT(*) AS occ, COUNT(DISTINCT text_key) AS texts, MAX(surface) AS surface FROM word_context GROUP BY lemma_key'),
    // Д4.3 «где встречалось»: the bank's class + the class of the text holding the mark of a status / my note.
    // A text's class is read ONCE per text (texts × 1), never per joined row: source_meta_json of a book is up to
    // ~1.7 MB, and classifying it per occurrence (160K rows) ran SQLite out of memory — iPhone killed the tab (3.11.760).
    q('SELECT DISTINCT lemma_key AS k, source_class AS c FROM word_context'),
    q(`SELECT t.id, t.text_key, ${TEXT_CLASS_SQL} AS c FROM texts t`),
    q(`SELECT DISTINCT o.note_id AS id, s.text_id AS tid FROM notes_v2 n JOIN note_occurrences o ON o.note_id = n.id
         JOIN sentences s ON s.id = o.sentence_id WHERE n.note_type = 'word_study' AND (${MY_NOTE_SQL})`),
  ]);
  S.schedule = schedule || {};
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
  const src = new Map(), addSrc = (k, c) => { if (!k || !c) return; let x = src.get(k); if (!x) { x = new Set(); src.set(k, x); } x.add(c === 'byehuda' ? 'byehuda' : c); };
  ctxSrcRows.forEach((r) => addSrc(r.k, r.c === 'mytext' || r.c === 'byehuda' || r.c === 'public' || r.c === 'group' ? r.c : 'mytext'));
  const clsById = new Map(), clsByKey = new Map();
  textClsRows.forEach((r) => { clsById.set(r.id, r.c); if (r.text_key) clsByKey.set(r.text_key, r.c); });
  statusRows.forEach((r) => { if (r.srs_text_key) addSrc(r.lemma_key, clsByKey.get(r.srs_text_key)); });
  const noteKey = new Map(notes.map((n) => [n.id, n.key]));
  noteTextRows.forEach((r) => addSrc(noteKey.get(r.id), clsById.get(r.tid)));
  S.srcByKey = src;
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
// an export must not race the background reading pass: the buttons show up before it ends (a fast load clicked
// early handed the Studio words without a headword or Pealim id — half of the deck was dropped, 3.11.760)
async function ensureReadings(list) {
  const todo = list.filter((e) => e.reading === undefined);
  if (todo.length) { try { await resolveReadings(new Map(todo.map((e) => [e.key, e]))); } catch (_) {} }
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
// the classes of texts a word was met in: the bank + marks + notes (S.srcByKey), the scanned «met» texts (my own)
// and the text of the lens
function attachSources(all) {
  const by = S.srcByKey || new Map();
  all.forEach((e) => {
    const c = new Set(by.get(e.key) || []);
    if (e.met) c.add('mytext');
    if (e.inText && e.inText.cls) e.inText.cls.forEach((x) => c.add(x));
    e.srcClasses = c;
  });
}
function applyView() {
  const now = Date.now();
  const all = Array.from(S.entries.values());
  if (S.filters.sources && S.filters.sources.length) attachSources(all);
  S.view = D.sortEntries(all.filter((e) => D.matches(e, S.filters, now)), S.sort, now);
  S.shown = Math.min(S.view.length, Math.max(S.PAGE, S.shown));
  renderCounts(all); renderActive(); renderSavedViews(); renderTrainButton(); renderList();
  const tb = $('dict-textbar'); if (tb && tb.hidden !== (S.filters.scope !== 'text')) renderTextBar();
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
// «в тексте: 5» / a set: «в подборке: 12 · в 3 текстах»
function inTextLabel(e) {
  if (!(S.text && S.text.isSet)) return fill(tt('dictionary.text.inText', 'в тексте: {n}'), { n: e.inText.freq });
  return fill(tt('dictionary.set.inSet', 'в подборке: {n}'), { n: e.inText.freq }) + (e.inText.nTexts > 1 ? ' · ' + fill(tt('dictionary.set.inTexts', 'в {k} текстах'), { k: e.inText.nTexts }) : '');
}
function rowFor(e) {
  const d = D.displayOf(e), mean = D.meaningOf(e);
  const meta = [];
  if (d.pos) meta.push(el('span', { text: posText(d.pos) + (d.binyan ? ' · ' + d.binyan : '') }));
  if (d.root) meta.push(el('span', {}, [tt('dictionary.root', 'корень') + ' ', el('span', { class: 'he', text: d.root })]));
  const inText = S.filters.scope === 'text' && e.inText, st = inText ? D.statusOf(e, 'text') : (e.metOnly ? '' : (e.status || 'new'));
  if (st) meta.push(el('span', { class: st === 'none' ? 'dict-unmarked' : null, text: statusText(st) }));
  if (inText) {
    meta.push(el('span', { text: inTextLabel(e) }));
    if (e.inText.nameSuspect) meta.push(el('span', { class: 'dict-unmarked', text: tt('room.morph.study.nameSuspect', 'возможно имя') }));
  }
  const occ = D.occurrences(e);
  if (occ && !inText) meta.push(el('span', { text: fill(tt('dictionary.occ', 'встреч: {n}'), { n: occ }) }));
  const ml = memLine(e); if (ml) meta.push(ml);
  const he = el('span', { class: 'dict-row-he' + (st ? ' dict-st-' + st : ''), attrs: { lang: 'he', dir: 'rtl' }, text: d.he || (inText && (e.inText.niqqud || e.inText.surface)) || '…' });
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
  const scope = S.filters.scope, c = D.statusCounts(all, scope);
  box.replaceChildren(el('span', { class: 'dict-note', text: fill(scope !== 'text' ? tt('dictionary.total', 'Слов: {n}') : S.text && S.text.isSet ? tt('dictionary.set.total', 'Лемм в подборке: {n}') : tt('dictionary.text.total', 'Лемм в тексте: {n}'), { n: c.total }) }));
  (scope === 'text' ? ['none'].concat(D.STATUSES) : D.STATUSES).forEach((s) => {
    if (!c[s]) return;
    const on = S.filters.statuses.length === 1 && S.filters.statuses[0] === s;
    box.appendChild(el('button', { class: 'dict-chip' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': on ? 'true' : 'false' },
      on: { click: () => { S.filters.statuses = on ? [] : [s]; S.shown = 0; applyView(); } } },
      [el('span', { class: 'dict-dot dict-st-' + s }), statusText(s), el('b', { text: String(c[s]) })]));
  });
}
const MEMORY_OPTS = [['due', 'dictionary.memDue', 'к повторению'], ['overdue', 'dictionary.memOverdue', 'просрочено'], ['hard', 'dictionary.memHard', 'трудные'], ['never', 'dictionary.memNever', 'ещё не повторялось']];
const ADDED_OPTS = [[7, 'dictionary.addedWeek', 'за неделю'], [30, 'dictionary.addedMonth', 'за месяц']];
// Д5.3 the bands of the Room's «Мои слова» (+ «не встречались» outside a lens)
const FREQ_OPTS = [['4plus', 'room.morph.study.band4', 'частые (4+)'], ['2to3', 'room.morph.study.band23', 'средние (2–3)'], ['rare', 'room.morph.study.bandRare', 'редкие (1)'], ['zero', 'dictionary.freqZero', 'не встречались']];
const freqOpt = (b) => FREQ_OPTS.find((x) => x[0] === b);
const freqGroupLabel = (scope) => scope === 'text' ? (S.text && S.text.isSet ? tt('dictionary.fFreqSet', 'Частота в подборке') : tt('dictionary.fFreqText', 'Частота в тексте')) : tt('dictionary.fFreq', 'Частота в моих текстах');
function renderFilters() {
  const box = $('dict-filters'); box.replaceChildren();
  const scope = S.filters.scope;
  const all = Array.from(S.entries.values()).filter((e) => (scope === 'text' ? !!e.inText : scope === 'met' || !e.metOnly));
  const toggle = (arr, v) => (arr.indexOf(v) >= 0 ? arr.filter((x) => x !== v) : arr.concat([v]));
  const group = (label, items) => el('div', { class: 'dict-fgroup' }, [el('span', { text: label }), el('div', { class: 'dict-fopts' }, items)]);
  const chip = (text, on, fn, dot) => el('button', { class: 'dict-chip' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': on ? 'true' : 'false' }, on: { click: () => { fn(); S.shown = 0; applyView(); renderFilters(); } } },
    [dot ? el('span', { class: 'dict-dot ' + dot }) : null, text]);
  box.appendChild(group(tt('dictionary.fStatus', 'Статус'), (scope === 'text' ? ['none'].concat(D.STATUSES) : D.STATUSES).map((s) => chip(statusText(s), S.filters.statuses.indexOf(s) >= 0, () => { S.filters.statuses = toggle(S.filters.statuses, s); }, 'dict-st-' + s))));
  box.appendChild(group(tt('dictionary.fMemory', 'Память'), MEMORY_OPTS.map(([v, k, fb]) => chip(tt(k, fb), S.filters.memory === v, () => { S.filters.memory = S.filters.memory === v ? '' : v; }))));
  const values = (fn) => Array.from(new Set(all.map(fn).filter(Boolean))).sort();
  const posVals = values((e) => D.displayOf(e).pos);
  if (posVals.length) box.appendChild(group(tt('dictionary.fPos', 'Часть речи'), posVals.map((p) => chip(posText(p), S.filters.pos.indexOf(p) >= 0, () => { S.filters.pos = toggle(S.filters.pos, p); }))));
  const binVals = values((e) => D.displayOf(e).binyan);
  if (binVals.length) box.appendChild(group(tt('dictionary.fBinyan', 'Биньян'), binVals.map((b) => chip(b, S.filters.binyan.indexOf(b) >= 0, () => { S.filters.binyan = toggle(S.filters.binyan, b); }))));
  const fq = el('div', { class: 'dict-fgroup' }, [el('span', { text: freqGroupLabel(scope) }), el('div', { class: 'dict-fopts' },
    FREQ_OPTS.filter(([b]) => scope !== 'text' || b !== 'zero').map(([b, k, fb]) => chip(tt(k, fb), (S.filters.freq || []).indexOf(b) >= 0, () => { S.filters.freq = toggle(S.filters.freq || [], b); })))]);
  if (scope !== 'text') fq.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.fFreqNote', 'Число «встреч» в строке: записанные места — тренировки, отметки, заметки. Полный подсчёт по вашим текстам — в «Все встреченные».') }));
  box.appendChild(fq);
  box.appendChild(group(tt('dictionary.fSource', 'Где встречалось'), TEXT_CLASSES.map(([c, k, fb]) => chip(tt(k, fb), (S.filters.sources || []).indexOf(c) >= 0, () => { S.filters.sources = toggle(S.filters.sources || [], c); }))));
  const rootIn = el('input', { attrs: { type: 'text', dir: 'rtl', lang: 'he', 'aria-label': tt('dictionary.fRoot', 'Корень'), placeholder: 'כתב', value: S.filters.root } });
  rootIn.addEventListener('change', () => { S.filters.root = rootIn.value.trim(); S.shown = 0; applyView(); });
  box.appendChild(el('div', { class: 'dict-fgroup dict-froot' }, [el('span', { text: tt('dictionary.fRoot', 'Корень') }), rootIn]));
  box.appendChild(group(tt('dictionary.fMore', 'Ещё'), [
    chip(tt('dictionary.fMine', 'есть мой перевод'), S.filters.hasMine, () => { S.filters.hasMine = !S.filters.hasMine; }),
    ...(scope === 'text' ? [chip(tt('room.morph.study.hideNames', 'Скрыть возможные имена'), !!S.filters.hideNames, () => { S.filters.hideNames = !S.filters.hideNames; })] : []),
    ...ADDED_OPTS.map(([d, k, fb]) => chip(tt(k, fb), S.filters.addedDays === d, () => { S.filters.addedDays = S.filters.addedDays === d ? 0 : d; })),
  ]));
}
// Д2 «Учить эти»: the current filtered view, in its order, goes to the Room's training
function renderTrainButton() {
  const box = $('dict-train'); if (!box) return;
  // in «все встреченные» / the text lens a word may have no mark yet — «Учить эти» then asks (chooseTrain)
  const learnable = S.view.filter((e) => e.status !== 'ignore' && e.textStatus !== 'ignore' && !String(e.key).startsWith('note:'));
  // an open question (mass status change, «учить неразмеченные») survives a repaint — the boot's late readings used to
  // rebuild this box under the learner's click and drop the confirmation they were answering
  const keep = box.querySelector('.dict-choice');
  box.replaceChildren();
  if (keep) queueMicrotask(() => { if (!keep.isConnected) box.appendChild(keep); });
  if (!S.view.length) return;
  if (learnable.length) box.appendChild(el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-train-these' }, text: fill(tt('dictionary.trainThese', 'Учить эти ({n})'), { n: learnable.length }),
    on: { click: () => chooseTrain(learnable) } }));
  // Д3 «Слово в новых предложениях»: the marked words of this view, each in a sentence other than where it was learnt
  const transfer = learnable.filter((e) => !unmarkedOf(e) && !(e.inText && e.textStatus === 'new'));
  if (transfer.length) box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-train-newctx', title: tt('dictionary.newCtxTip', 'Пропуск слова в другом месте ваших текстов — не там, где вы его учили') },
    text: fill(tt('dictionary.newCtx', 'В новых предложениях ({n})'), { n: transfer.length }), on: { click: () => startTrain(transfer, 'newctx') } }));
  // Т2: mark the words of this view that have no mark yet — one by one, or all at once
  const toMark = S.view.filter((e) => unmarkedOf(e) || (e.inText && e.textStatus === 'new'));
  if (toMark.length && (S.filters.scope === 'text' || S.filters.scope === 'met')) {
    box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-triage' }, text: fill(tt('dictionary.triage.btn', 'Разметить ({n})'), { n: toMark.length }), on: { click: () => openTriage(toMark) } }));
    box.appendChild(el('span', { class: 'dict-bulk' }, [el('span', { class: 'dict-note', text: tt('dictionary.bulk.label', 'Все показанные без отметки:') }),
      el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-bulk-known' }, text: fill(tt('dictionary.bulk.known', '✓ знаю ({n})'), { n: toMark.length }), on: { click: () => bulkMark('known', toMark) } }),
      el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-bulk-ignore' }, text: fill(tt('dictionary.bulk.ignore', 'не учить ({n})'), { n: toMark.length }), on: { click: () => bulkMark('ignore', toMark) } })]));
  }
  // Д4.1 any view: change the status of every word shown
  const statusable = S.view.filter((e) => !String(e.key).startsWith('note:'));
  if (statusable.length) box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-bulkst' }, text: fill(tt('dictionary.bulkSt.btn', 'Сменить статус ({n})'), { n: statusable.length }),
    on: { click: () => openBulkStatus(statusable, box) } }));
  // Д2.2+ forms of the words in this view (filter «глагол» + a binyan → that binyan's pattern)
  const forms = S.view.filter(drillable);
  if (forms.length) {
    box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-train-forms' }, text: fill(tt('dictionary.trainForms', 'Тренировать формы ({n})'), { n: Math.min(30, forms.length) }),
      on: { click: () => openSetDrill(forms, { subtitle: activeSummary() }) } }));
  }
  // Д4.5 the set as an Anki deck — built in the Studio by its own word-card builder (equal cards, same guid)
  const ankiable = S.view.filter((e) => e.status !== 'ignore' && !String(e.key).startsWith('note:'));
  if (ankiable.length) box.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-apkg', title: tt('dictionary.apkgTip', 'Колода Anki по этим словам — те же карточки, что экспорт Anki в Студии') },
    text: fill(tt('dictionary.apkgBtn', 'Скачать .apkg ({n})'), { n: ankiable.length }), on: { click: () => exportApkg(ankiable) } }));
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
  (f.sources || []).forEach((c) => { const x = TEXT_CLASSES.find((y) => y[0] === c); if (x) parts.push(tt(x[1], x[2])); });
  (f.freq || []).forEach((b) => { const o = freqOpt(b); if (o) parts.push(tt(o[1], o[2])); });
  if (f.scope === 'text' && S.text) parts.unshift('«' + S.text.title + '»');
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
  (f.freq || []).forEach((b) => { const o = freqOpt(b); if (o) off(freqGroupLabel(f.scope).toLowerCase() + ': ' + tt(o[1], o[2]), () => { f.freq = f.freq.filter((x) => x !== b); }); });
  if (f.keys && f.keys.length) off(fill(tt('dictionary.plan.chip', 'словарик к тексту ({n})'), { n: f.keys.length }), () => { f.keys = null; });
  (f.sources || []).forEach((c) => { const x = TEXT_CLASSES.find((y) => y[0] === c); off(tt(x[1], x[2]), () => { f.sources = f.sources.filter((z) => z !== c); }); });
  if (f.hideNames && f.scope === 'text') off(tt('room.morph.study.hideNames', 'Скрыть возможные имена'), () => { f.hideNames = false; });
  if (hasActiveView()) chips.push(el('button', { class: 'dict-chip dict-chip-save', attrs: { type: 'button', id: 'dict-save-view' }, text: '☆ ' + tt('dictionary.savedViews.saveBtn', 'Сохранить набор'), on: { click: openSaveView } }));
  if (chips.length > 2) chips.push(el('button', { class: 'dict-chip', attrs: { type: 'button' }, text: tt('dictionary.reset', 'Сбросить всё'),
    on: { click: () => { Object.assign(f, { statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0, hideNames: false, keys: null, sources: [], freq: [] }); S.shown = 0; applyView(); if (!$('dict-filters').hidden) renderFilters(); } } }));
  chips.forEach((c) => box.appendChild(c));
}

// ── «Слова этого текста» (спека F4_TEXT_LENS): срез словаря по одному моему тексту ─────────────────────
// Слова текста собирает ReaderMorph.scanRows — тот же разбор и тот же ключ статуса, что лист «Мои слова» Зала.
// Статус в срезе — живой (как окрашено в тексте); «знакомо X%» — тот же движок и кэш, что у Зала.
// every text this device holds: my own, and the public ones opened in the Room (Ben-Yehuda, the Mediatheque and other
// public corpora, group corpora) — the same class rule as the context bank (_sourceClassSql in local-db)
const TEXT_CLASS_SQL = `CASE WHEN NOT json_valid(t.source_meta_json) THEN 'mytext'
  WHEN json_type(t.source_meta_json, '$.group_corpus') IS NOT NULL THEN 'group'
  WHEN json_type(t.source_meta_json, '$.public_corpus') IS NOT NULL THEN 'public'
  WHEN json_type(t.source_meta_json, '$.corpus') IS NOT NULL THEN 'byehuda' ELSE 'mytext' END`;
const TEXT_CLASSES = [['mytext', 'dictionary.text.clsMine', 'Мои тексты'], ['byehuda', 'dictionary.text.clsByehuda', 'Проект Бен-Иегуда'],
  ['public', 'dictionary.text.clsPublic', 'Медиатека и общедоступные тексты'], ['group', 'dictionary.text.clsGroup', 'Тексты групп']];
async function myTexts() {
  if (S.textList) return S.textList;
  // the public material identity (slug + work id) maps a Mediatheque reference to the text on this device
  S.textList = await q(`SELECT t.id, t.title, t.text_key, t.updated_at, ${TEXT_CLASS_SQL} AS cls,
      CASE WHEN json_valid(t.source_meta_json) THEN json_extract(t.source_meta_json, '$.public_corpus.slug') END AS pslug,
      CASE WHEN json_valid(t.source_meta_json) THEN json_extract(t.source_meta_json, '$.public_corpus.public_work_id') END AS pwork
    FROM texts t WHERE t.is_archived = 0 ORDER BY t.updated_at DESC`);
  return S.textList;
}
async function refreshLive() { try { S.live = (await localDb.getAllWordStatuses()) || {}; } catch (_) { S.live = S.live || {}; } }

// ── Д5.1 срез по подборке: коллекция / тема моей Медиатеки или выбранные в Студии тексты ─────────────────────────
// A lens id: '<text id>' | '@col:<collection id>' | '@cat:<topic id>' | '@ids:<id>,<id>…' (Studio multi-select).
const isSetId = (id) => /^@(col|cat|ids):/.test(String(id || ''));
async function myMediatheque() {
  if (S.mtq !== undefined) return S.mtq;
  S.mtq = null;
  try {
    const r = (await q('SELECT structure_json FROM mediatheque_personal WHERE singleton = 1'))[0];
    if (r) { const d = JSON.parse(r.structure_json); S.mtq = window.MediathequeCore ? window.MediathequeCore.validate(d) : d; }
  } catch (_) { S.mtq = null; }
  return S.mtq;
}
// the texts of a set that are on this device, in the set's order; the rest is counted, never guessed
function textsOfRefs(refKeys, list) {
  const byKey = new Map(), byWork = new Map();
  list.forEach((t) => { if (!byKey.has(t.text_key)) byKey.set(t.text_key, t); if (t.pslug && t.pwork != null) { const k = t.pslug + '\u0000' + t.pwork; if (!byWork.has(k)) byWork.set(k, t); } });
  const out = [], seen = new Set(); let missing = 0;
  refKeys.forEach((k) => {
    const r = D.parseRefKey(k);
    const t = !r ? null : r.kind === 'personal' ? byKey.get(r.textKey) : byWork.get(r.slug + '\u0000' + r.workId);
    if (!t) { missing++; return; }
    if (!seen.has(String(t.id))) { seen.add(String(t.id)); out.push(t); }
  });
  return { texts: out, missing };
}
// the sets the picker offers: my Mediatheque's collections and topics with at least one text on this device
async function mySets() {
  const [d, list] = await Promise.all([myMediatheque(), myTexts()]);
  const out = [];
  if (d) {
    (d.collections || []).forEach((c) => { const r = textsOfRefs(D.mediathequeMembers(d, 'col', c.id), list); if (r.texts.length) out.push({ id: '@col:' + c.id, kind: 'col', title: c.title, ...r }); });
    (d.categories || []).forEach((c) => { const r = textsOfRefs(D.mediathequeMembers(d, 'cat', c.id), list); if (r.texts.length) out.push({ id: '@cat:' + c.id, kind: 'cat', title: c.title, ...r }); });
  }
  return out;
}
async function resolveLens(id) {
  const list = await myTexts();
  if (!isSetId(id)) { const t = list.find((x) => String(x.id) === String(id)); return t ? { kind: 'text', title: t.title || '', cls: t.cls || 'mytext', texts: [t], missing: 0 } : null; }
  if (/^@ids:/.test(id)) {
    const ids = String(id).slice(5).split(',').filter(Boolean);
    const texts = ids.map((x) => list.find((t) => String(t.id) === x)).filter(Boolean);
    return texts.length ? { kind: 'ids', title: fill(tt('dictionary.set.picked', 'Выбранные тексты ({n})'), { n: texts.length }), texts, missing: ids.length - texts.length } : null;
  }
  const s = (await mySets()).find((x) => x.id === id);
  return s ? { kind: s.kind, title: s.title, texts: s.texts, missing: s.missing } : null;
}
// put the lens's lemmas onto the entries (a word not in my dictionary becomes a «met-only» entry of this text)
function attachText() {
  S.entries.forEach((e) => { delete e.inText; delete e.textStatus; });
  const T = S.text; if (!T || !T.scan) return;
  // in which texts of the set each lemma occurs (occ is capped — the row keys are complete)
  const inTexts = new Map();
  (T.scan.rowKeys || []).forEach((keys, ri) => { const ti = T.rowText[ri]; (keys || []).forEach((k) => { if (!k) return; let s = inTexts.get(k); if (!s) inTexts.set(k, (s = new Set())); s.add(ti); }); });
  T.scan.group.forEach((g, key) => {
    let e = S.entries.get(key);
    if (!e) {
      e = { key, status: '', srs: (S.schedule || {})[key] || null, note: null, log: null, ctx: null, surfaces: [{ s: g.niqqud || g.surface, from: 'text' }],
        added: 0, lastSeen: 0, sources: ['text'], metOnly: true };
      S.entries.set(key, e);
    }
    const ts = inTexts.get(key) || new Set([T.rowText[(g.occ[0] || {}).rowIdx] || 0]);
    e.inText = { freq: g.freq, first: g._i, occ: g.occ, nameSuspect: g.nameSuspect, surface: g.surface, niqqud: g.niqqud, textId: T.id,
      nTexts: ts.size, cls: new Set(Array.from(ts).map((ti) => (T.texts[ti] && T.texts[ti].cls) || 'mytext')) };
    e.textStatus = S.live[key] || '';
  });
}
// the text (of the lens) a scanned row belongs to, and the row's own order index in it
function rowPlace(T, rowIdx) {
  const ti = T.rowText[rowIdx], t = T.texts[ti], row = T.rows[rowIdx];
  if (!t || !row) return null;
  return { t, row, orderIndex: row.order_index != null ? Number(row.order_index) : rowIdx - t.from };
}
let _textEpoch = 0;
async function loadText(id) {
  const my = ++_textEpoch;
  const L = await resolveLens(String(id));
  if (my !== _textEpoch) return;
  if (!L) {
    S.text = null; renderTextBar();
    toast(isSetId(id) ? tt('dictionary.set.notFound', 'В этой подборке нет текстов на устройстве. Откройте их в Зале — и они появятся здесь.')
      : tt('dictionary.text.notFound2', 'Этого текста нет на устройстве. Откройте его в Зале — и он появится здесь.'));
    return;
  }
  S.filters.keys = null;
  const one = L.kind === 'text' ? L.texts[0] : null;
  S.text = { id: String(id), kind: L.kind, isSet: !one, cls: one ? L.cls : null, title: L.title, key: one ? one.text_key : null, updated_at: one ? one.updated_at : null,
    texts: L.texts.map((t) => ({ id: String(t.id), key: t.text_key, title: t.title || '', cls: t.cls || 'mytext', updated_at: t.updated_at, from: 0, n: 0, fit: null })),
    missing: L.missing, rows: [], rowText: [], scan: null, fit: null };
  renderTextBar();
  const T = S.text, rows = [], rowText = [];
  // the rows text by text (never one JOIN over the whole set — the 3.11.760 lesson)
  for (let i = 0; i < T.texts.length; i++) {
    progress(T.isSet ? fill(tt('dictionary.set.reading', 'Читаю тексты подборки: {d} из {n}'), { d: i + 1, n: T.texts.length }) : tt('dictionary.text.reading', 'Читаю текст…'));
    let rs = []; try { rs = (await localDb.getSentences(T.texts[i].id)) || []; } catch (_) { rs = []; }
    if (my !== _textEpoch) return;
    T.texts[i].from = rows.length; T.texts[i].n = rs.length;
    rs.forEach((r) => { rows.push(r); rowText.push(i); });
  }
  T.rows = rows; T.rowText = rowText;
  await refreshLive();
  const scan = await RM().scanRows(rows, { onProgress: (d, n) => progress(fill(T.isSet ? tt('dictionary.set.scanning', 'Разбираю слова подборки: строка {d} из {n}') : tt('dictionary.text.scanning', 'Разбираю слова текста: строка {d} из {n}'), { d, n })) });
  if (my !== _textEpoch) return;
  T.scan = scan;
  attachText();
  progress('');
  S.shown = 0; applyView();
  resolveReadings(S.entries).then(() => { if (my === _textEpoch) applyView(); });
  textFamiliarity();
}
// Д7.4 (owner 2026-10-14) «знакомо X%» and the glossary stand on the keys of the LIST: the lens's own scan → the
// Room's evaluator (evaluateRecordedFamiliarityV2) on those keys. Each text of a set its own number; the set's is the
// same sum (token-weighted). Names and closed-class words are outside, as in the list.
async function textFamiliarity() {
  const T = S.text, C = window.LearningCompassCore; if (!T || !T.scan || !C) return;
  let projection = null; try { projection = await localDb.getLearningCompassProjection(); } catch (_) { projection = null; }
  if (S.text !== T) return;
  const ing = (from, to) => P().scanIngredients({ rowKeys: T.scan.rowKeys, rowStats: T.scan.rowStats, from, to, resolverVersion: C.RESOLVER_VERSION });
  const fitOf = (x) => (projection ? C.evaluateRecordedFamiliarityV2({ ingredients: x, learner_projection: projection }) : { status: 'UNAVAILABLE', recorded_familiar_pct_lower_bound: null });
  T.texts.forEach((t) => { t.fit = fitOf(ing(t.from, t.from + t.n)); });
  T.ingredients = ing(0, T.rows.length);
  T.fit = fitOf(T.ingredients);
  renderTextBar();
  textPlan();
}
// Т4 «словарик к тексту»: the most useful unfamiliar lemmas of the list and the forecast — the same evaluator
let _planEpoch = 0;
async function textPlan() {
  const T = S.text; if (!T || !T.scan || !T.fit || T.fit.recorded_familiar_pct_lower_bound == null || !T.ingredients) return;
  const my = ++_planEpoch, C = window.LearningCompassCore;
  try {
    const projection = await localDb.getLearningCompassProjection();
    if (my !== _planEpoch || S.text !== T || !projection) return;
    const candidates = Array.from(S.entries.values()).filter((e) => e.inText && !(e.inText.nameSuspect)).map((e) => e.key);
    T.plan = P().textPlan({ ingredients: T.ingredients, projection, evaluate: C.evaluateRecordedFamiliarityV2, candidates, sizes: [10, 25, 50], target: 95 });
    if (T.planPick == null && T.plan) T.planPick = 0;
    renderTextBar();
  } catch (_) {}
}
function planOptions(plan) {
  if (!plan) return [];
  const opts = plan.steps.map((st) => ({ n: st.n, pct: st.pct, keys: st.keys }));
  if (plan.toTarget && !opts.some((o) => o.n === plan.toTarget.n)) opts.push({ n: plan.toTarget.n, pct: plan.toTarget.pct, keys: plan.toTarget.keys, target: true });
  return opts.sort((a, b) => a.n - b.n);
}
function renderPlan(box) {
  const T = S.text, plan = T && T.plan; if (!plan || !plan.frontier.length) return;
  const opts = planOptions(plan); if (!opts.length) return;
  const cur = opts[Math.min(T.planPick || 0, opts.length - 1)];
  const entries = cur.keys.map((k) => S.entries.get(k)).filter(Boolean);
  const sec = el('div', { class: 'dict-plan' }, [el('b', { text: T.isSet ? tt('dictionary.plan.titleSet', 'Словарик к подборке') : tt('dictionary.plan.title', 'Словарик к тексту') })]);
  const sel = el('select', { attrs: { 'aria-label': tt('dictionary.plan.size', 'Сколько слов') } }, opts.map((o, i) => el('option', { attrs: { value: String(i) },
    text: (o.target ? fill(tt('dictionary.plan.toTarget', 'до {t}%: {n} сл.'), { t: plan.target, n: o.n }) : fill(tt('dictionary.plan.n', '{n} сл.'), { n: o.n })) })));
  sel.value = String(opts.indexOf(cur));
  sel.addEventListener('change', () => { T.planPick = Number(sel.value); renderTextBar(); });
  sec.appendChild(el('p', { class: 'dict-plan-line' }, [fill(T.isSet ? tt('dictionary.plan.lineSet', 'Выучите самые частые незнакомые слова подборки: знакомость {a}% → {b}%')
    : tt('dictionary.plan.line', 'Выучите самые частые незнакомые слова текста: знакомость {a}% → {b}%'), { a: Math.round(plan.now), b: Math.round(cur.pct) }), ' ', sel]));
  if (!plan.toTarget && plan.now < plan.target) sec.appendChild(el('p', { class: 'dict-note', text: fill(T.isSet ? tt('dictionary.plan.noTargetSet', 'До {t}% только размеченными словами подборки не дойти: часть слов не разобрана или это имена.')
    : tt('dictionary.plan.noTarget', 'До {t}% только размеченными словами текста не дойти: часть слов не разобрана или это имена.'), { t: plan.target }) }));
  sec.appendChild(el('div', { class: 'dict-drill-actions' }, [
    el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-plan-show' }, text: fill(tt('dictionary.plan.show', 'Показать эти ({n})'), { n: entries.length }),
      on: { click: () => { S.filters.keys = cur.keys.slice(); S.sort = 'textFreq'; $('dict-sort').value = 'textFreq'; S.shown = 0; applyView(); } } }),
    el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-plan-learn' }, text: fill(tt('dictionary.plan.learn', 'Отметить незнакомыми и учить ({n})'), { n: entries.length }),
      on: { click: async () => { for (const e of entries) if (!e.textStatus || e.textStatus === 'new') await setStatus(e, 'l1', true); morphHost.invalidateWordStates(); startTrain(entries); } } }),
    el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-plan-xlsx' }, text: tt('dictionary.plan.xlsx', 'XLSX по ним'), on: { click: () => exportXlsx(entries) } }),
  ]));
  box.appendChild(sec);
}
function setScope(scope) {
  S.filters.scope = scope;
  if (scope !== 'text') S.filters.keys = null;
  document.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('on', x.getAttribute('data-scope') === scope));
  const pick = $('dict-text-pick'); if (pick) pick.hidden = scope !== 'text';
  const sbBtn = $('dict-sb-open'); if (sbBtn) sbBtn.hidden = scope !== 'text';
  if (scope !== 'text') closeSetBuilder();
  document.querySelectorAll('#dict-sort option[data-text-sort]').forEach((o) => { o.hidden = scope !== 'text'; o.disabled = scope !== 'text'; });
  if (scope !== 'text' && /^text/.test(S.sort)) { S.sort = 'added'; $('dict-sort').value = S.sort; }
  if (scope === 'text' && !/^text/.test(S.sort)) { S.sort = 'textOrder'; $('dict-sort').value = S.sort; }
  S.shown = 0;
  renderTextBar();
}
async function fillTextPicker() {
  const sel = $('dict-text-sel'); if (!sel) return;
  const [list, sets] = await Promise.all([myTexts(), mySets()]);
  const setLabel = (s) => s.title + ' · ' + fill(tt('dictionary.set.nTexts', 'текстов: {n}'), { n: s.texts.length });
  const setGroup = (kind, k, fb) => { const xs = sets.filter((s) => s.kind === kind); return xs.length ? el('optgroup', { attrs: { label: tt(k, fb) } },
    xs.map((s) => el('option', { attrs: { value: s.id }, text: setLabel(s) }))) : null; };
  // a set opened from the Studio's multi-select (not stored anywhere — it lives in the address / a saved view)
  const adhoc = S.text && /^@ids:/.test(S.text.id) ? el('optgroup', { attrs: { label: tt('dictionary.set.groupPicked', 'Мой набор текстов') } },
    [el('option', { attrs: { value: S.text.id }, text: S.text.title })]) : null;
  sel.replaceChildren(el('option', { attrs: { value: '' }, text: tt('dictionary.text.choose2', 'Выберите текст или подборку…') }),
    ...[adhoc, setGroup('col', 'dictionary.set.groupCol', 'Подборки Медиатеки'), setGroup('cat', 'dictionary.set.groupCat', 'Темы Медиатеки')].filter(Boolean),
    ...TEXT_CLASSES.map(([cls, k, fb]) => { const items = list.filter((t) => (t.cls || 'mytext') === cls); return items.length ? el('optgroup', { attrs: { label: tt(k, fb) } },
      items.map((t) => el('option', { attrs: { value: String(t.id) }, text: t.title || ('#' + t.id) }))) : null; }).filter(Boolean));
  if (S.text) sel.value = S.text.id;
}
// the texts of a set: each one's own familiarity (the Room's number), its lens and the Room
function setTextsList(T) {
  const det = el('details', { class: 'dict-set-texts' }, [el('summary', { text: fill(tt('dictionary.set.texts', 'Тексты подборки: {n}'), { n: T.texts.length }) })]);
  const ul = el('ul', { class: 'dict-set-list' });
  T.texts.forEach((t) => {
    const f = t.fit, p = f && f.recorded_familiar_pct_lower_bound != null ? Math.round(Number(f.recorded_familiar_pct_lower_bound)) + '%' : (f && f.status === 'PENDING') || !f ? '…' : '—';
    ul.appendChild(el('li', {}, [
      el('span', { class: 'dict-set-title', attrs: { dir: 'auto' }, text: t.title || ('#' + t.id) }),
      el('span', { class: 'dict-note', attrs: { title: tt('dictionary.set.textFamTip', 'Знакомо слов этого текста') }, text: p }),
      el('button', { class: 'dict-btn', attrs: { type: 'button', 'data-set-text': t.id }, text: tt('dictionary.set.lensOne', 'Слова текста'),
        on: { click: () => { try { history.replaceState(null, '', '?text=' + encodeURIComponent(t.id)); } catch (_) {} loadText(t.id).then(fillTextPicker); } } }),
      el('a', { attrs: { href: '/library.html?my_text=' + encodeURIComponent(t.id) }, text: tt('dictionary.text.open', 'Открыть текст ›') }),
    ]));
  });
  det.appendChild(ul);
  return det;
}
function renderTextBar() {
  const box = $('dict-textbar'); if (!box) return;
  box.replaceChildren();
  box.hidden = S.filters.scope !== 'text';
  if (box.hidden) return;
  const T = S.text;
  if (!T) { box.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.text.pickHint3', 'Выберите текст или подборку — покажу все слова: размеченные и нет. Здесь ваши тексты, тексты корпусов (Бен-Иегуда, Медиатека и другие), которые вы открывали в Зале, и подборки и темы вашей Медиатеки.') })); return; }
  const clsName = (TEXT_CLASSES.find((c) => c[0] === T.cls) || TEXT_CLASSES[0]);
  const kindName = T.kind === 'col' ? tt('dictionary.set.kindCol', 'подборка Медиатеки') : T.kind === 'cat' ? tt('dictionary.set.kindCat', 'тема Медиатеки') : T.kind === 'ids' ? tt('dictionary.set.kindPicked', 'мой набор') : '';
  box.appendChild(el('div', { class: 'dict-textbar-title' }, [el('span', {}, [el('b', { attrs: { dir: 'auto' }, text: T.title }),
      T.isSet ? el('span', { class: 'dict-note', text: ' · ' + kindName + ' · ' + fill(tt('dictionary.set.nTexts', 'текстов: {n}'), { n: T.texts.length }) })
        : T.cls && T.cls !== 'mytext' ? el('span', { class: 'dict-note', text: ' · ' + tt(clsName[1], clsName[2]) }) : null]),
    !T.isSet ? el('a', { attrs: { href: '/library.html?my_text=' + encodeURIComponent(T.texts[0].id) }, text: tt('dictionary.text.open', 'Открыть текст ›') }) : null]));
  if (T.isSet && T.missing) box.appendChild(el('p', { class: 'dict-note', text: fill(tt('dictionary.set.missing', 'Не на устройстве: {n} — откройте их в Зале, и они войдут в срез.'), { n: T.missing }) }));
  const f = T.fit;
  const pct = f && f.recorded_familiar_pct_lower_bound != null ? Math.round(Number(f.recorded_familiar_pct_lower_bound)) : null;
  // Д7.4 the number of the list's own words (not the Room card's ingredient number — O-083)
  const famText = pct != null ? (T.isSet ? fill(tt('dictionary.set.familiar', 'Знакомо {p}% слов подборки'), { p: pct })
      : fill(tt('dictionary.text.familiarCorpus', 'Знакомо {p}% слов текста'), { p: pct }))
    : f && f.status === 'NEEDS_PROFILE' ? tt('dictionary.text.famNeedsProfile', 'Знакомость появится, когда в словаре будут отмеченные слова.')
    : f ? (T.isSet ? tt('dictionary.set.famUnavailable', 'Знакомость подборки сейчас не посчитана.') : tt('dictionary.text.famUnavailable', 'Знакомость для этого текста сейчас не посчитана.'))
    : tt('dictionary.text.famLoading', 'Считаю знакомость…');
  box.appendChild(el('p', { class: 'dict-textbar-fam' + (pct != null ? '' : ' dict-note') }, [famText]));
  if (pct != null) box.appendChild(el('div', { class: 'dict-fambar', attrs: { role: 'img', 'aria-label': famText } }, [el('i', { attrs: { style: 'width:' + pct + '%' } })]));
  if (pct != null) box.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.text.famBasis', 'Считается по словам этого списка: служебные слова и имена не входят, неразобранные — как незнакомые.') }));
  if (T.isSet) box.appendChild(setTextsList(T));
  if (!T.scan) return;
  renderPlan(box);
  const unsure = Array.from(T.scan.unsure.values()).sort((a, b) => b.freq - a.freq);
  if (unsure.length) {
    // Д7.3 the groups come from what the parse already knows — no manual sorting, no AI
    const det = el('details', { class: 'dict-unsure' }, [el('summary', { text: fill(tt('dictionary.text.unsure2', 'Не разобрано: {n}'), { n: unsure.length }) })]);
    const groups = [
      ['name', tt('dictionary.unsure.names', 'Похоже на имя'), (u) => !!u.nameSuspect],
      ['guess', tt('dictionary.unsure.guess', 'Есть догадка разбора — архаичные и редкие формы'), (u) => !u.nameSuspect && u.label === 'guessed'],
      ['none', tt('dictionary.unsure.none', 'Нет в словаре'), (u) => !u.nameSuspect && u.label !== 'guessed'],
    ];
    groups.forEach(([gid, title, is]) => {
      const items = unsure.filter(is); if (!items.length) return;
      const ul = el('div', { class: 'dict-unsure-list', attrs: { 'data-unsure-group': gid } });
      // every word of the group: a capped list hid 375 of 495 «not in the dictionary» words (owner 2026-10-14)
      items.forEach((u) => ul.appendChild(el('button', { class: 'dict-chip', attrs: { type: 'button', lang: 'he', dir: 'rtl', title: tt('dictionary.text.unsureTip', 'Открыть карточку слова') },
        on: { click: () => { try { RM().openWordCard(u.surface, u.niqqud || ''); } catch (_) {} } } }, [u.niqqud || u.surface, u.freq > 1 ? el('b', { text: String(u.freq) }) : null])));
      det.appendChild(el('div', { class: 'dict-unsure-group' }, [el('p', { class: 'dict-unsure-h', text: title + ' · ' + items.length }), ul]));
    });
    box.appendChild(det);
  }
}

// ── Т2 быстрая разметка: по одному слову (клавиши 1–5) и массово «знаю / не учить» с отменой ──────────────────
// Пишет тот же канон, что тап в тексте (MorphHost.markWordStatus). «Не знаю» / «узнаю» ставят слово в повторение
// (уровень l1–l4 сеет FSRS) — с местом из этого текста, чтобы тренировка взяла это предложение.
// the same palette and order as the status row of a word article (and the tap card in a text): 1–7, 0 = skip
const TRIAGE = [['new', '1'], ['l1', '2'], ['l2', '3'], ['l3', '4'], ['l4', '5'], ['known', '6'], ['ignore', '7'], ['', '0']];
const unmarkedOf = (e) => (e.inText ? !e.textStatus : (e.metOnly && !e.status));
function textSourceOf(e) {
  const T = S.text; if (!T || !e.inText || !e.inText.occ || !e.inText.occ.length) return null;
  const o = e.inText.occ[0], pl = rowPlace(T, o.rowIdx);   // a set: the text of THIS occurrence
  if (!pl) return null;
  return { textKey: pl.t.key, sentenceId: pl.row.id != null ? String(pl.row.id) : null, orderIndex: pl.orderIndex, surface: e.inText.surface };
}
async function setStatus(e, st, withSource) {
  const src = withSource && /^l[1-4]$/.test(st) ? textSourceOf(e) : null;
  try { await morphHost.markWordStatus(e.key, st, src); } catch (_) {}
  S.live[e.key] = st;
  if (e.inText) e.textStatus = st;
  if (st) { e.status = st; e.metOnly = false; } else if (e.metOnly) e.status = '';
  if (/^l[1-4]$/.test(st)) { try { const sch = await localDb.getSrsSchedule(); e.srs = sch[e.key] || e.srs; S.schedule = sch; } catch (_) {} }
}
function afterMarks() {
  morphHost.invalidateWordStates();
  applyView();
  if (S.text) textFamiliarity();   // → onUpdate → textPlan()
}
// the sentence of this text where the word first occurs, the word highlighted
function textSentence(e) {
  const T = S.text; if (!T || !e.inText || !e.inText.occ.length) return null;
  const o = e.inText.occ[0], pl = rowPlace(T, o.rowIdx); if (!pl) return null;
  const row = pl.row, plain = String(row.he_plain || ''), voc = String(row.he_niqqud || '');
  const useVoc = voc && RM().words(voc).length === RM().words(plain).length;
  return { node: highlight(useVoc ? voc : (plain || voc), o.wordOffset), ru: row.ru || '', title: T.isSet ? pl.t.title : '' };
}
async function openTriage(list) {
  const my = ++_articleEpoch;
  S.selected = null;
  const art = $('dict-article'); art.hidden = false; $('dict-root').classList.add('has-article');
  const items = list.slice(), done = new Map();
  let i = 0;
  const back = el('button', { class: 'dict-btn dict-a-back', attrs: { type: 'button' }, text: '‹ ' + tt('dictionary.back', 'К списку'), on: { click: () => { closeArticle(); afterMarks(); } } });
  const head = el('h2', { class: 'dict-set-title', text: fill(tt('dictionary.triage.title', 'Разметка: {n} сл.'), { n: items.length }) });
  const note = el('p', { class: 'dict-note', text: tt('dictionary.triage.note2', 'Уровни от «незнакомо» до «почти знаю» ставят слово в повторение — с этим предложением текста. «Новое», «знаю» и «не учить» расписание не трогают.') });
  const panel = el('div', { class: 'dict-drill dict-triage', attrs: { role: 'group', 'aria-live': 'polite' } });
  art.replaceChildren(back, head, note, panel);
  if (window.matchMedia && window.matchMedia('(max-width: 959px)').matches) art.scrollTop = 0;
  const label = (st) => (st === '' ? tt('dictionary.triage.skip', 'пропустить') : statusText(st));
  async function show() {
    if (my !== _articleEpoch) return;
    if (i >= items.length) return finish();
    const e = items[i];
    if (e.reading === undefined) { try { await resolveReadings(new Map([[e.key, e]])); } catch (_) {} }
    if (my !== _articleEpoch) return;
    const d = D.displayOf(e), mean = D.meaningOf(e), sent = textSentence(e);
    const cur = done.get(e.key);
    panel.setAttribute('data-key', e.key);   // read by the smoke gate
    panel.replaceChildren(...[
      el('div', { class: 'dict-drill-head' }, [el('span', { class: 'dict-note', text: (i + 1) + ' / ' + items.length }),
        e.inText ? el('span', { class: 'dict-note', text: inTextLabel(e) }) : null]),
      el('div', { class: 'dict-triage-word' }, [
        el('button', { class: 'dict-btn', attrs: { type: 'button', 'aria-label': tt('dictionary.speak', 'Озвучить') }, text: '▶', on: { click: () => { try { morphHost.speakWord(d.he); } catch (_) {} } } }),
        el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: d.he || (e.inText && (e.inText.niqqud || e.inText.surface)) || '' })]),
      el('p', { class: 'dict-triage-mean', attrs: { dir: 'auto' }, text: [mean.text || tt('dictionary.noMeaning', 'перевод не найден офлайн'), d.pos ? posText(d.pos) + (d.binyan ? ' · ' + d.binyan : '') : ''].filter(Boolean).join(' — ') }),
      sent ? el('div', { class: 'dict-place dict-triage-sent' }, [sent.node, sent.ru ? el('div', { class: 'ru', attrs: { dir: 'auto' }, text: sent.ru }) : null,
        sent.title ? el('div', { class: 'dict-note', attrs: { dir: 'auto' }, text: sent.title }) : null]) : null,
      cur != null ? el('p', { class: 'dict-note', text: fill(tt('dictionary.triage.was', 'Уже отмечено: {s}'), { s: label(cur) }) }) : null,
    ].filter(Boolean));
    const btns = el('div', { class: 'dict-a-status dict-triage-status', attrs: { role: 'group', 'aria-label': tt('dictionary.fStatus', 'Статус') } },
      TRIAGE.filter(([st]) => st).map(([st, key]) => el('button', { class: 'dict-st-' + st + (cur === st ? ' on' : ''), attrs: { type: 'button', 'data-triage': st, 'aria-keyshortcuts': key },
        on: { click: () => answer(st) } }, [el('kbd', { text: key }), statusText(st)])));
    panel.appendChild(btns);
    panel.appendChild(el('div', { class: 'dict-triage-skip' }, [
      el('button', { class: 'dict-btn', attrs: { type: 'button', 'data-triage': 'skip', 'aria-keyshortcuts': '0' } , on: { click: () => answer('') } }, [el('kbd', { text: '0' }), ' ' + label('')]),
      el('span', { class: 'dict-note', text: tt('dictionary.triage.keys', 'Клавиши 1–7 — статус, 0 — пропустить, ← — назад') })]));
    panel.appendChild(el('div', { class: 'dict-drill-actions' }, [
      i > 0 ? el('button', { class: 'dict-btn', attrs: { type: 'button', 'data-triage': 'back' }, text: '‹ ' + tt('dictionary.triage.prev', 'назад'), on: { click: () => { i--; show(); } } }) : null,
      el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.triage.stop', 'Закончить'), on: { click: () => finish() } }),
    ]));
  }
  let busy = false;
  async function answer(st) {
    if (busy || i >= items.length) return;
    busy = true;
    const e = items[i];
    if (st) await setStatus(e, st, true);
    done.set(e.key, st);
    i++; busy = false;
    show();
  }
  function finish() {
    document.removeEventListener('keydown', onKey);
    const counts = {}; done.forEach((st) => { counts[st] = (counts[st] || 0) + 1; });
    const learn = items.filter((e) => /^l[1-4]$/.test(done.get(e.key) || ''));
    panel.replaceChildren(
      el('p', { class: 'dict-drill-total', text: TRIAGE.filter(([st]) => counts[st]).map(([st]) => label(st) + ': ' + counts[st]).join(' · ') || tt('dictionary.triage.none', 'Ничего не отмечено.') }),
      el('div', { class: 'dict-drill-actions' }, [
        learn.length ? el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: fill(tt('dictionary.triage.learn2', 'Учить отмеченные уровнем ({n})'), { n: learn.length }), on: { click: () => startTrain(learn) } }) : null,
        el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.back', 'К списку'), on: { click: () => { closeArticle(); } } }),
      ]));
    afterMarks();
  }
  function onKey(ev) {
    if (my !== _articleEpoch) { document.removeEventListener('keydown', onKey); return; }
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = TRIAGE.find((x) => x[1] === ev.key);
    if (k) { ev.preventDefault(); answer(k[0]); }
    else if ((ev.key === 'Backspace' || ev.key === 'ArrowLeft') && i > 0) { ev.preventDefault(); i--; show(); }
  }
  document.addEventListener('keydown', onKey);
  show();
}
// mass «знаю» / «не учить» on the unmarked words shown, with undo (no schedule involved)
async function bulkMark(st, list) {
  const targets = list.filter((e) => unmarkedOf(e) || (e.inText && e.textStatus === 'new'));
  if (!targets.length) return;
  const prev = targets.map((e) => [e, e.inText ? e.textStatus || '' : e.status || '']);
  for (const e of targets) await setStatus(e, st, false);
  afterMarks();
  toast(fill(tt('dictionary.bulk.done', 'Отмечено «{s}»: {n}'), { s: statusText(st), n: targets.length }), tt('room.morph.study.undo', 'Отменить'), async () => {
    let restored = 0;
    for (const [e, p] of prev) {
      if ((S.live[e.key] || '') !== st) continue;   // changed again since — leave it
      await setStatus(e, p, false); if (!p && !e.note && !e.srs && !e.log) { e.metOnly = true; e.status = ''; }
      restored++;
    }
    afterMarks();
    toast(fill(tt('dictionary.bulk.undone', 'Отменено: {n}'), { n: restored }));
  });
}
// «Учить эти» with words that have no mark yet: the learner chooses (owner decision 2026-10-13)
function chooseTrain(learnable, host) {
  const unmarked = learnable.filter(unmarkedOf), marked = learnable.filter((e) => !unmarkedOf(e));
  if (!unmarked.length) { startTrain(learnable); return; }
  const box = host || $('dict-train');
  box.querySelectorAll('.dict-choice').forEach((x) => x.remove());
  const ask = el('div', { class: 'dict-choice', attrs: { role: 'group' } }, [
    el('p', { text: fill(tt('dictionary.trainUnmarked', 'В наборе {u} сл. без отметки. Тренировка учит только отмеченные слова.'), { u: unmarked.length }) }),
    el('div', { class: 'dict-drill-actions' }, [
      el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-train-markl1' }, text: fill(tt('dictionary.trainMarkL1', 'Отметить их как «незнакомо» и учить ({n})'), { n: learnable.length }),
        on: { click: async () => { for (const e of unmarked) await setStatus(e, 'l1', true); morphHost.invalidateWordStates(); startTrain(learnable); } } }),
      marked.length ? el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: fill(tt('dictionary.trainMarkedOnly', 'Учить только размеченные ({n})'), { n: marked.length }), on: { click: () => startTrain(marked) } }) : null,
      el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.cancel', 'Отмена'), on: { click: () => ask.remove() } }),
    ]),
  ]);
  box.appendChild(ask);
  try { ask.querySelector('.primary').focus(); } catch (_) {}
}

// ── Д3 «Корень как гнездо» (спека F4_D3_CONTEXT_AND_ROOT): the whole Pealim family of the root, my live status on each
// word (the same canonical key the Room paints), the words I know as the support, a practice round that tells the
// relatives apart (no schedule writes), and «Учить гнездо в Зале» for the rest.
function nestOf(e, card) {
  const root = (card && card.paradigm && card.paradigm.root) || D.displayOf(e).root;
  if (!root || !_eng || !_eng.rootIndex) return null;
  const NA = _eng.NA || window.NotesAutoGen;
  const fam = (_eng.rootIndex.get(String(root)) || []).map((x) => {
    let key = '';
    try { key = NA && NA.lemmaKey ? NA.lemmaKey({ pealim_id: x.pid, lemma: x.key, word: x.key, pos: x.pos }) : (x.pid ? 'pid:' + x.pid : ''); } catch (_) { key = x.pid ? 'pid:' + x.pid : ''; }
    return { key, he: x.disp, meaning: x.meaning || '', pos: x.pos || '', pid: x.pid, self: key === e.key, status: (key && S.live[key]) || '' };
  }).filter((x) => x.key);
  return { root, words: fam };
}
// a dictionary entry for a relative (it may not be in my dictionary yet): the Pealim entry is its reading
function nestEntry(w) {
  let e = S.entries.get(w.key);
  if (!e) {
    e = { key: w.key, status: '', srs: (S.schedule || {})[w.key] || null, note: null, log: null, ctx: null, surfaces: [{ s: w.he, from: 'root' }],
      added: 0, lastSeen: 0, sources: ['root'], metOnly: true };
    const p = pidParadigm(w.key);
    if (p) { e.paradigm = p; e.forms = paradigmForms(p); e.reading = readingFromParadigm(p, w.key); }
    S.entries.set(w.key, e);
  }
  return e;
}
const SUPPORT = { l4: 1, known: 1 };
async function renderNest(famSec, e, card) {
  await refreshLive();
  const nest = nestOf(e, card);
  const others = nest ? nest.words.filter((w) => !w.self) : [];
  if (!nest || !others.length) { famSec.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.noFamily', 'Других слов этого корня в словаре нет.') })); return; }
  famSec.querySelector('summary').textContent = fill(tt('dictionary.nest.title', 'Гнездо корня {r}: {n} сл.'), { r: nest.root, n: nest.words.length });
  const support = others.filter((w) => SUPPORT[w.status]);
  if (support.length) famSec.appendChild(el('p', { class: 'dict-nest-support' }, [el('b', { text: tt('dictionary.nest.support', 'Опора — вы знаете:') + ' ' }),
    ...support.slice(0, 8).map((w) => el('span', { class: 'he dict-st-' + w.status, attrs: { lang: 'he', dir: 'rtl' }, text: w.he }))]));
  const box = el('div', { class: 'dict-fam' });
  others.slice(0, 40).forEach((w) => box.appendChild(el('button', { class: w.status ? 'dict-st-' + w.status : 'dict-st-none', attrs: { type: 'button', title: w.status ? statusText(w.status) : statusText('none') },
    on: { click: () => { if (S.entries.has(w.key) && !S.entries.get(w.key).metOnly) openArticle(w.key); else { try { RM().openWordCard(strip(w.he), w.he); } catch (_) {} } } } },
    [el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: w.he }), el('small', { text: w.meaning })])));
  famSec.appendChild(box);
  const withMeaning = nest.words.filter((w) => w.meaning);
  const learnable = nest.words.filter((w) => !SUPPORT[w.status] && w.status !== 'ignore');
  const acts = el('div', { class: 'dict-drill-actions' });
  if (withMeaning.length >= 3) acts.appendChild(el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-nest-drill' }, text: fill(tt('dictionary.nest.drill', 'Тренировать гнездо ({n})'), { n: withMeaning.length }),
    on: { click: () => openNestDrill(nest, withMeaning) } }));
  if (learnable.length) acts.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-nest-learn' }, text: fill(tt('dictionary.nest.learn', 'Учить гнездо в Зале ({n})'), { n: learnable.length }),
    on: { click: () => chooseTrain(learnable.map(nestEntry), acts) } }));
  famSec.appendChild(acts);
  famSec.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.nest.note', 'Тренировка гнезда учит различать слова одного корня; в расписание повторения она не пишет. «Учить в Зале» — обычное повторение незнакомых слов гнезда.') }));
}
// practice: «значение → какое слово корня?» and «слово → какое значение?», the options from the same nest only
function openNestDrill(nest, words) {
  const my = ++_articleEpoch;
  S.selected = null;
  const art = $('dict-article'); art.hidden = false; $('dict-root').classList.add('has-article');
  const back = el('button', { class: 'dict-btn dict-a-back', attrs: { type: 'button' }, text: '‹ ' + tt('dictionary.back', 'К списку'), on: { click: closeArticle } });
  const panel = el('div', { class: 'dict-drill', attrs: { role: 'group', 'aria-live': 'polite' } });
  const support = nest.words.filter((w) => !w.self && SUPPORT[w.status]);   // the relatives I know, not the word itself
  art.replaceChildren(back, el('h2', { class: 'dict-set-title', text: fill(tt('dictionary.nest.drillTitle', 'Гнездо корня {r}'), { r: nest.root }) }),
    ...(support.length ? [el('p', { class: 'dict-nest-support' }, [el('b', { text: tt('dictionary.nest.support', 'Опора — вы знаете:') + ' ' }),
      ...support.slice(0, 8).map((w) => el('span', { class: 'he dict-st-' + w.status, attrs: { lang: 'he', dir: 'rtl' }, text: w.he }))])] : []), panel);
  if (window.matchMedia && window.matchMedia('(max-width: 959px)').matches) art.scrollTop = 0;
  // the words to learn first, then the known ones (a short refresh); up to 10 tasks, the two directions alternate
  const order = words.slice().sort((a, b) => (SUPPORT[a.status] ? 1 : 0) - (SUPPORT[b.status] ? 1 : 0));
  let seed = Date.now() % 100000;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  function start() {
    const tasks = order.slice(0, 10).map((w, i) => ({ w, dir: i % 2 ? 'he2ru' : 'ru2he' }));
    const res = [];
    let i = 0;
    const ask = () => {
      if (my !== _articleEpoch) return;
      if (i >= tasks.length) {
        const right = res.filter(Boolean).length;
        panel.replaceChildren(el('p', { class: 'dict-drill-total', text: fill(tt('dictionary.nest.done', 'Верно {r} из {n}.'), { r: right, n: res.length }) }),
          el('div', { class: 'dict-drill-actions' }, [el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: tt('dictionary.drillAgain', 'Ещё раунд'), on: { click: start } }),
            el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.back', 'К списку'), on: { click: closeArticle } })]));
        return;
      }
      const t = tasks[i], pool = words.filter((x) => x.key !== t.w.key && (t.dir === 'ru2he' ? x.he !== t.w.he : x.meaning !== t.w.meaning));
      const opts = pool.map((x) => ({ x, r: rnd() })).sort((a, b) => a.r - b.r).slice(0, 3).map((o) => o.x).concat([t.w]).map((x) => ({ x, r: rnd() })).sort((a, b) => a.r - b.r).map((o) => o.x);
      const q = t.dir === 'ru2he'
        ? el('p', { class: 'dict-drill-q' }, [el('b', { text: tt('dictionary.nest.qWord', 'Какое слово корня значит') + ' ' }), el('span', { attrs: { dir: 'auto' }, text: '«' + t.w.meaning + '»' }), '?'])
        : el('p', { class: 'dict-drill-q' }, [el('b', { text: tt('dictionary.nest.qMeaning', 'Что значит') + ' ' }), el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: t.w.he }), '?']);
      const area = el('div', { class: 'dict-drill-area dict-drill-opts' + (t.dir === 'he2ru' ? ' dict-nest-ru' : ''), attrs: { 'data-answer': t.w.key } });
      opts.forEach((o) => area.appendChild(el('button', { class: 'dict-drill-opt', attrs: { type: 'button', 'data-key': o.key, lang: t.dir === 'ru2he' ? 'he' : null, dir: t.dir === 'ru2he' ? 'rtl' : 'auto' },
        text: t.dir === 'ru2he' ? o.he : o.meaning, on: { click: () => {
          const ok = o.key === t.w.key;
          res.push(ok);
          area.querySelectorAll('button').forEach((b) => { b.disabled = true; const k = b.getAttribute('data-key'); if (k === t.w.key) b.classList.add('ok'); else if (!ok && k === o.key) b.classList.add('bad'); });
          const fb = el('div', { class: 'dict-drill-fb ' + (ok ? 'ok' : 'bad') }, [
            el('span', { text: ok ? '✓ ' + tt('dictionary.drillRight', 'Верно') : '✗ ' + tt('dictionary.drillWrong', 'Правильно:') + ' ' }),
            el('span', { class: 'he', attrs: { lang: 'he', dir: 'rtl' }, text: t.w.he }), el('span', { attrs: { dir: 'auto' }, text: '— ' + t.w.meaning }),
            el('button', { class: 'dict-btn', attrs: { type: 'button', 'aria-label': tt('dictionary.speak', 'Озвучить') }, text: '▶', on: { click: () => { try { morphHost.speakWord(t.w.he); } catch (_) {} } } }),
            el('button', { class: 'dict-btn primary', attrs: { type: 'button' }, text: i + 1 < tasks.length ? tt('dictionary.drillNext', 'Дальше') : tt('dictionary.drillFinish', 'Итог'), on: { click: () => { i++; ask(); } } })]);
          panel.appendChild(fb);
          try { fb.querySelector('.primary').focus(); } catch (_) {}
        } } })));
      panel.replaceChildren(el('div', { class: 'dict-drill-head' }, [el('span', { class: 'dict-note', text: (i + 1) + ' / ' + tasks.length })]), q, area);
      try { area.querySelector('button').focus(); } catch (_) {}
    };
    ask();
  }
  start();
}

// ── Д4.1 массовая смена статуса (спека F4_D4_LIST_TOOLS): любой набор вида → палитра → подтверждение с честным числом
// → пословно тем же каноном (MorphHost.markWordStatus) → сверка с базой → отмена 10 с.
const LEVEL_RE = /^l[1-4]$/;
const liveOf = (e) => S.live[e.key] || '';   // S.live is refreshed from the base before a mass change (openBulkStatus)
async function openBulkStatus(list, host) {
  host.querySelectorAll('.dict-bulkst').forEach((x) => x.remove());
  await refreshLive();   // the «before» of every word (undo) and the «already has it» count come from the base, not a stale cache
  const panel = el('div', { class: 'dict-choice dict-bulkst', attrs: { role: 'group' } });
  const palette = el('div', { class: 'dict-a-status' }, D.STATUSES.map((st) => el('button', { class: 'dict-st-' + st, attrs: { type: 'button', 'data-bulk-status': st },
    on: { click: () => confirm(st) } }, [statusText(st)])));
  panel.append(el('p', { text: fill(tt('dictionary.bulkSt.pick', 'Какой статус поставить {n} показанным словам?'), { n: list.length }) }), palette,
    el('div', { class: 'dict-drill-actions' }, [el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.cancel', 'Отмена'), on: { click: () => panel.remove() } })]));
  host.appendChild(panel);
  function confirm(st) {
    const change = list.filter((e) => liveOf(e) !== st);
    const seeds = LEVEL_RE.test(st) ? change.filter((e) => !(S.schedule || {})[e.key]).length : 0;
    panel.replaceChildren(
      el('p', {}, [fill(tt('dictionary.bulkSt.confirm', 'Поставить «{s}» {n} сл.?'), { s: statusText(st), n: change.length }),
        list.length - change.length ? ' ' + fill(tt('dictionary.bulkSt.already', '(у {k} уже этот статус)'), { k: list.length - change.length }) : '']),
      seeds ? el('p', { class: 'dict-note', text: fill(tt('dictionary.bulkSt.seeds', 'Из них {k} встанут в повторение: уровень заводит расписание. Отмена вернёт статус, но не расписание.'), { k: seeds }) }) : null,
      el('div', { class: 'dict-drill-actions' }, [
        change.length ? el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-bulkst-apply' }, text: fill(tt('dictionary.bulkSt.apply', 'Поставить ({n})'), { n: change.length }), on: { click: () => apply(st, change) } }) : null,
        el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.cancel', 'Отмена'), on: { click: () => panel.remove() } })]),
    );
  }
  async function apply(st, change) {
    panel.replaceChildren(el('p', { class: 'dict-note', text: tt('dictionary.bulkSt.working', 'Ставлю статусы…') }));
    const prev = change.map((e) => [e, liveOf(e)]);
    for (const e of change) { try { await setStatus(e, st, true); } catch (_) {} }   // one failure never stops the rest
    let db = {}; try { db = (await localDb.getAllWordStatuses()) || {}; } catch (_) {}
    const ok = change.filter((e) => (db[e.key] || '') === st).length, failed = change.length - ok;
    panel.remove();
    afterMarks();
    toast(fill(tt('dictionary.bulkSt.done', 'Статус «{s}»: изменено {n}'), { s: statusText(st), n: ok }) + (failed ? ' · ' + fill(tt('dictionary.bulkSt.failed', 'не изменилось {k}'), { k: failed }) : ''),
      tt('room.morph.study.undo', 'Отменить'), async () => {
        let restored = 0;
        for (const [e, p] of prev) {
          if ((S.live[e.key] || '') !== st) continue;   // changed again since — leave it
          await setStatus(e, p, false);
          restored++;
        }
        afterMarks();
        toast(fill(tt('dictionary.bulk.undone', 'Отменено: {n}'), { n: restored }));
      });
  }
}

// ── Д4.2 сохранённые наборы фильтров: на этом устройстве (localStorage), применяются одним тапом ──────────────
const VIEWS_KEY = 'dict.savedViews_v1';
function savedViews() { try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function storeViews(v) { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v.slice(0, 20))); } catch (_) {} }
function currentView() {
  const f = S.filters;
  return { filters: { statuses: f.statuses.slice(), memory: f.memory, pos: f.pos.slice(), binyan: f.binyan.slice(), root: f.root, hasMine: !!f.hasMine,
    addedDays: f.addedDays || 0, hideNames: !!f.hideNames, q: f.q || '', scope: f.scope, sources: (f.sources || []).slice(), freq: (f.freq || []).slice() }, sort: S.sort, textId: f.scope === 'text' && S.text ? S.text.id : null };
}
function hasActiveView() {
  const f = S.filters;
  return !!(f.statuses.length || f.memory || f.pos.length || f.binyan.length || f.root || f.hasMine || f.addedDays || f.q || f.scope !== 'mine' || (f.sources || []).length || (f.freq || []).length);
}
async function applySavedView(v) {
  Object.assign(S.filters, { statuses: [], memory: '', pos: [], binyan: [], root: '', hasMine: false, addedDays: 0, hideNames: false, q: '', keys: null, sources: [], freq: [] }, v.filters || {});
  $('dict-q').value = S.filters.q || '';
  if (v.sort && D.SORTS.indexOf(v.sort) >= 0) { S.sort = v.sort; $('dict-sort').value = v.sort; }
  const scope = S.filters.scope || 'mine';
  setScope(scope);
  if (v.sort && D.SORTS.indexOf(v.sort) >= 0) { S.sort = v.sort; $('dict-sort').value = v.sort; }   // setScope may reset a text sort
  S.shown = 0;
  if (scope === 'met' && !S.metBuilt) await buildMet();
  if (scope === 'text' && v.textId) { if (!S.text || S.text.id !== String(v.textId)) await loadText(v.textId); await fillTextPicker(); }
  applyView();
  if (!$('dict-filters').hidden) renderFilters();
}
function renderSavedViews() {
  const box = $('dict-saved'); if (!box) return;
  const views = savedViews();
  box.replaceChildren();
  if (views.length) {
    box.appendChild(el('span', { class: 'dict-note', text: tt('dictionary.savedViews.mine', 'Мои наборы:') }));
    views.forEach((v, i) => box.appendChild(el('span', { class: 'dict-saved-chip' }, [
      el('button', { class: 'dict-chip', attrs: { type: 'button', 'data-saved-view': String(i) }, text: v.name, on: { click: () => applySavedView(v) } }),
      el('button', { class: 'dict-chip dict-saved-del', attrs: { type: 'button', 'aria-label': fill(tt('dictionary.savedViews.delete', 'Удалить набор «{n}»'), { n: v.name }) }, text: '✕',
        on: { click: () => { const all = savedViews(); all.splice(i, 1); storeViews(all); renderSavedViews(); } } })])));
  }
}
function openSaveView() {
  const box = $('dict-active');
  box.querySelectorAll('.dict-saveview').forEach((x) => x.remove());
  const input = el('input', { attrs: { type: 'text', maxlength: '60', 'aria-label': tt('dictionary.savedViews.name', 'Название набора'), value: activeSummary() || tt('dictionary.savedViews.untitled', 'Мой набор') } });
  const form = el('form', { class: 'dict-saveview', on: { submit: (ev) => {
    ev.preventDefault();
    const name = input.value.trim() || tt('dictionary.savedViews.untitled', 'Мой набор');
    const all = savedViews().filter((v) => v.name !== name);
    all.unshift(Object.assign({ name }, currentView()));
    storeViews(all); form.remove(); renderSavedViews();
    toast(fill(tt('dictionary.savedViews.saved', 'Набор «{n}» сохранён на этом устройстве'), { n: name }));
  } } }, [input, el('button', { class: 'dict-btn primary', attrs: { type: 'submit' }, text: tt('dictionary.savedViews.save', 'Сохранить') }),
    el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.cancel', 'Отмена'), on: { click: () => form.remove() } })]);
  box.appendChild(form);
  try { input.focus(); input.select(); } catch (_) {}
}

// ── article ────────────────────────────────────────────────────────────────────────────────────
let morphHost = null, _articleEpoch = 0;
function toast(msg, actionText, action) {
  const t = $('dict-toast'); if (!t) return;
  t.replaceChildren(document.createTextNode(msg));
  if (actionText && action) t.appendChild(el('button', { class: 'dict-toast-act', attrs: { type: 'button' }, text: actionText, on: { click: () => { t.classList.remove('on'); action(); } } }));
  t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), actionText ? 10000 : 3200);
}
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
const PLACES_BUDGET = 3000, PLACES_PAGE = 20;
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
  // every sentence that may hold a form (no early stop at a fixed number of places — the owner's 2026-10-14 report:
  // «Места · 40» was the cap, not the count); a budget keeps one call bounded and the UI says when it was reached
  const hits = skels.length ? await q(`SELECT s.text_id, s.order_index, s.he_plain, s.he_niqqud, s.ru, t.title AS text_title FROM sentences s
      JOIN texts t ON t.id = s.text_id AND t.is_archived = 0 WHERE (${skels.map(() => 's.he_plain LIKE ?').join(' OR ')}) LIMIT ?`,
    [...skels.map((x) => '%' + x + '%'), PLACES_BUDGET + 1]).catch(() => []) : [];
  const truncated = hits.length > PLACES_BUDGET;
  const want = new Set(skels);
  // a form in a text may carry proclitics (שֶׁ+שָּׁמַעְתִּי, וְ+הַ+…): a candidate is any token that IS a wanted form or
  // ends with one behind ≤3 proclitic letters; every candidate is then proven by the resolver (lemmaKey === key)
  const PROC = /^[ובכלמשה]{1,3}$/;
  const candidate = (tok) => { const sk = strip(tok); if (want.has(sk)) return true; for (let n = 1; n <= 3 && n < sk.length - 1; n++) if (PROC.test(sk.slice(0, n)) && want.has(sk.slice(n))) return true; return false; };
  const found = [], toks = new Set();
  hits.slice(0, PLACES_BUDGET).forEach((r) => {
    const text = String(r.he_niqqud || r.he_plain || '');
    RM().words(text).forEach((tk, i) => { if (candidate(tk)) { found.push([r, text, i, tk]); toks.add(tk); } });
  });
  const got = toks.size ? await resolveSurfaces(Array.from(toks)) : new Map();   // one batch (cached), not one call per token
  found.forEach(([r, text, i, tk]) => { const rd = got.get(tk); if (rd && rd.lemmaKey === e.key) add({ textId: r.text_id, title: r.text_title, order: Number(r.order_index), offset: i, he: text, ru: r.ru, row: r }); });
  // the texts of the current lens first, then each text in reading order
  const lensIds = new Set(S.filters.scope === 'text' && S.text ? S.text.texts.map((t) => String(t.id)) : []);
  const out = Array.from(places.values()).sort((a, b) => (lensIds.has(String(b.textId)) - lensIds.has(String(a.textId)))
    || String(a.title || '').localeCompare(String(b.title || '')) || String(a.textId).localeCompare(String(b.textId)) || a.order - b.order || a.offset - b.offset);
  out.truncated = truncated;
  return out;
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
const SEC_KEY = 'dict.secOpen_v1';
function secOpenState() { try { return JSON.parse(localStorage.getItem(SEC_KEY) || '{}') || {}; } catch (_) { return {}; } }
function foldSec(id, openByDefault, title, children) {
  const st = secOpenState(), open = Object.prototype.hasOwnProperty.call(st, id) ? !!st[id] : openByDefault;
  const d = el('details', { class: 'dict-a-sec', attrs: Object.assign({ 'data-sec': id }, open ? { open: '' } : {}) }, [el('summary', { text: title })].concat(children));
  d.addEventListener('toggle', () => { const x = secOpenState(); x[id] = d.open; try { localStorage.setItem(SEC_KEY, JSON.stringify(x)); } catch (_) {} });
  return d;
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
        e.status = next; e.metOnly = false; S.live[key] = next; if (e.inText) e.textStatus = next;
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
  // the article's sections fold like «Спряжение»; the open/closed choice is remembered on this device for every word
  const placesSec = foldSec('places', true, tt('dictionary.places', 'Места в моих текстах'), [el('p', { class: 'dict-note', text: tt('dictionary.loading', 'Ищу…') })]);
  const conjSec = foldSec('conj', true, tt('dictionary.conj', 'Спряжение / склонение'), [el('p', { class: 'dict-note', text: tt('dictionary.loading', 'Ищу…') })]);
  const famSec = foldSec('family', false, tt('dictionary.family', 'Слова от этого корня'), []);
  const memSec = foldSec('memory', false, tt('dictionary.memory', 'Память'), []);
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
  await renderNest(famSec, e, verified);
  if (my !== _articleEpoch) return;
  // places
  placesSec.lastChild.remove();
  if (!places.length) placesSec.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.noPlaces', 'В ваших сохранённых текстах это слово не найдено.') }));
  const list = el('ul', { class: 'dict-places' });
  const aiSeen = new Map(), mediaTexts = new Map();
  // Д4.4 a text whose media passport has timing (MediaHost — the Room's own reader of the passport); asked per page
  async function mediaOf(ids) {
    const ask = ids.filter((id) => !mediaTexts.has(id));
    if (!ask.length || !window.MediaHost || !window.MediaHost.passportFromTextRow) return;
    try {
      (await q('SELECT id, table_model_meta_json, source_meta_json FROM texts WHERE id IN (' + ask.map(() => '?').join(',') + ')', ask)).forEach((r) => {
        const a = window.MediaHost.passportFromTextRow(r);
        mediaTexts.set(String(r.id), !!(a && a.timing && !a.timingDropReason));
      });
    } catch (_) {}
  }
  const placeItem = async (p) => {
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
      el('a', { attrs: { href: '/library.html?my_text=' + encodeURIComponent(p.textId) + '&at=' + p.order }, text: tt('dictionary.openInText', 'Открыть в тексте') }),
      mediaTexts.get(String(p.textId)) ? el('a', { class: 'dict-media-link', attrs: { href: '/library.html?my_text=' + encodeURIComponent(p.textId) + '&at=' + p.order + '&play=1', title: tt('dictionary.mediaTip', 'Откроет текст на этой строке; ▶ строки запустит видео или аудио с её начала') }, text: '▶ ' + tt('dictionary.mediaHere', 'медиа с этого места') }) : null]));
    return li;
  };
  // every place is reachable: a page at a time, «Показать ещё» for the rest (2026-10-14: «И ещё мест: 20» led nowhere)
  let shownPlaces = 0;
  const moreBox = el('div', { class: 'dict-places-more' });
  async function showPlaces() {
    const page = places.slice(shownPlaces, shownPlaces + PLACES_PAGE);
    await mediaOf(Array.from(new Set(page.map((p) => String(p.textId)))));
    for (const p of page) { const li = await placeItem(p); if (my !== _articleEpoch) return; list.appendChild(li); }
    shownPlaces += page.length;
    moreBox.replaceChildren();
    const rest = places.length - shownPlaces;
    if (rest > 0) moreBox.appendChild(el('button', { class: 'dict-btn', attrs: { type: 'button', id: 'dict-places-more' },
      text: fill(tt('dictionary.morePlacesBtn', 'Показать ещё {k} (осталось {n})'), { k: Math.min(PLACES_PAGE, rest), n: rest }),
      on: { click: async (ev) => { ev.currentTarget.disabled = true; await showPlaces(); } } }));
    if (places.truncated) moreBox.appendChild(el('p', { class: 'dict-note', text: fill(tt('dictionary.placesBudget', 'Поиск просмотрел первые {n} предложений с формами этого слова — в ваших текстах их больше.'), { n: PLACES_BUDGET }) }));
  }
  await showPlaces();
  if (my !== _articleEpoch) return;
  if (places.length) { placesSec.appendChild(list); placesSec.appendChild(moreBox); }
  placesSec.querySelector('summary').textContent = tt('dictionary.places', 'Места в моих текстах') + (places.length ? ' · ' + places.length + (places.truncated ? '+' : '') : '');
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
function startTrain(list, mode) {
  const learnable = list.filter((e) => !e.metOnly && e.status !== 'ignore' && !String(e.key).startsWith('note:'));
  if (!learnable.length) return;
  try { localStorage.setItem('dict.trainSet_v1', JSON.stringify({ at: Date.now(), keys: learnable.slice(0, 200).map((e) => e.key), mode: mode || '' })); } catch (_) {}
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
// Д4.5: each word as the body of a word card (the Studio's own builder takes it from there): my note's id when I have
// a note (its full body, mnemonic included, is used), else the dictionary's own reading; the example from my texts
async function exportApkg(list) {
  progress(tt('dictionary.apkgPreparing', 'Готовлю колоду Anki…'));
  await ensureReadings(list);
  const examples = await examplesFor(list);
  const items = list.slice(0, 2000).map((e) => {
    const d = D.displayOf(e), mean = D.meaningOf(e), p = paradigmOf(e), r = e.reading || {};
    const pid = (p && p.pealim_id != null) ? String(p.pealim_id) : (r.pid || (e.note && e.note.pid) || ((/^pid:(d+)$/.exec(e.key) || [])[1]) || '');
    const body = { word: strip(d.lemma || d.he), niqqud_variant: d.he || '', lemma: d.lemma || '', meaning: mean.text || '', pos: d.pos || '', part_of_speech: d.pos || '',
      binyan: d.binyan || '', root: d.root || '' };
    if (pid) body.pealim_id = pid;
    if (mean.from === 'user') body.meaning_source = 'user';
    const ex = examples.get(e.key) || null;
    return { key: e.key, noteId: e.note && e.note.id ? e.note.id : null, body, example_he: ex ? ex.he : '', example_ru: ex ? ex.ru : '' };
  });
  try { localStorage.setItem('dict.ankiSet_v1', JSON.stringify({ at: Date.now(), items, deck: 'LinguistPro::Words' })); } catch (_) { progress(''); toast(tt('dictionary.apkgFailed', 'Не удалось передать набор в Студию.')); return; }
  progress('');
  const w = window.open('/index.html?anki=dictionary', '_blank');
  if (!w) location.href = '/index.html?anki=dictionary';
  toast(tt('dictionary.apkgOpened', 'Колода собирается в Студии — файл скачается там.'));
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
    await ensureReadings(list);
    const memAll = new Map((await drillAll()).map((r) => [r.key, r.mem]));
    const lens = S.filters.scope === 'text' && S.text && S.text.scan ? S.text : null;
    const examples = await examplesFor(list);
    // the text lens: the example is the word's first sentence in THIS text
    if (lens) list.forEach((e) => {
      if (!e.inText || !e.inText.occ.length) return;
      const o = e.inText.occ[0], pl = rowPlace(lens, o.rowIdx); if (!pl) return;
      const row = pl.row, plain = String(row.he_plain || ''), voc = String(row.he_niqqud || ''), useVoc = voc && RM().words(voc).length === RM().words(plain).length;
      const he = useVoc ? voc : (plain || voc);
      let at = -1, len = 0, pos = 0, w = 0;
      for (const tk of RM().tokenize(he)) { if (tk.isWord) { if (w === o.wordOffset) { at = pos; len = tk.text.length; } w++; } pos += tk.text.length; }
      examples.set(e.key, { he, at, len, ru: row.ru || '', title: pl.t.title });
    });
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
        posText: posText(d.pos), binyan: d.binyan, root: d.root,
        status: lens && e.inText ? (e.textStatus || 'none') : (e.metOnly ? '' : (e.status || 'new')), statusText: lens && e.inText ? statusText(e.textStatus || 'none') : (e.metOnly ? '' : statusText(e.status || 'new')),
        strength: m.strength == null ? null : Math.round(m.strength * 100), due: e.srs && e.srs.due > 0 ? e.srs.due : null, reps: m.reps, lapses: m.lapses,
        occ: lens && e.inText ? e.inText.freq : D.occurrences(e), added: e.added, lastSeen: e.lastSeen, example: examples.get(e.key) || null,
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
    const legend = (lens ? ['none'] : []).concat(D.STATUSES.filter((s) => s !== 'ignore' || c.ignore)).map((s) => ({ key: s, label: statusText(s) }));
    // «Текст» sheet: every line, each word with its lemma key and live status (the same scan as the lens)
    let textData = null;
    if (lens) {
      const f = lens.fit, pct = f && f.recorded_familiar_pct_lower_bound != null ? Math.round(Number(f.recorded_familiar_pct_lower_bound)) : null;
      const rows = [];
      lens.rows.forEach((row, ri) => {
        const pl = rowPlace(lens, ri);
        if (lens.isSet && pl && ri === pl.t.from) rows.push({ heading: pl.t.title || ('#' + pl.t.id) });   // a set: each text under its title
        const keys = lens.scan.rowKeys[ri] || [], plain = String(row.he_plain || ''), voc = String(row.he_niqqud || '');
        const useVoc = voc && RM().words(voc).length === keys.length;
        let w = 0;
        const tokens = RM().tokenize(useVoc ? voc : (plain || voc)).map((tk) => {
          if (!tk.isWord) return { t: tk.text };
          const key = keys[w++] || null, en = key ? S.entries.get(key) : null;
          return { t: tk.text, key, status: key ? (S.live[key] || 'none') : '', lemma: en ? D.displayOf(en).he : '' };
        });
        rows.push({ n: (pl ? pl.orderIndex : ri) + 1, tokens, ru: row.ru || '' });
      });
      textData = { title: lens.title, isSet: !!lens.isSet, rows,
        famText: pct == null ? '' : lens.isSet ? fill(tt('dictionary.set.familiar', 'Знакомо {p}% слов подборки'), { p: pct }) : fill(tt('dictionary.text.familiarCorpus', 'Знакомо {p}% слов текста'), { p: pct }) };
    }
    const book = window.DictionaryWorkbook.build({ now, dateText: new Date(now).toLocaleDateString(document.documentElement.lang || 'ru'), filterText: activeSummary(),
      words, progress: progressBlock, statusLegend: legend, text: textData }, L);
    const zip = new JSZip();
    Object.entries(window.XlsxCore.buildParts(book)).forEach(([k, v]) => zip.file(k, v));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    const slug = lens ? '-' + String(lens.title || 'text').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) : '';
    const name = 'linguistpro-dictionary' + slug + '-' + isoDay(now) + '.xlsx';
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

// ── Д6 «Собрать набор»: тексты устройства + работы каталогов сервера (Бен-Иегуда и любой публичный корпус) ──────
// spec docs/planning/word-layer/F4_D6_CATALOG_SETS_SPEC_2026_10_14.md. Downloads go through CorpusMaterialize — the
// Room's own way (verification, device edition, import); the set opens as the ordinary '@ids:' lens.
const SB = { source: 'device', q: '', picked: new Map(), by: null, pubs: null, pubCat: new Map(), busy: false, epoch: 0, note: '', report: null };
const SB_MAX = 200, SB_SHOW = 100;
const CM = () => window.CorpusMaterialize;
async function sbByCatalog() {
  if (SB.by) return SB.by;
  const v = await (await fetch('/api/corpus-catalog/benyehuda', { cache: 'no-cache' })).json();
  if (!v || !v.ok || !v.version) throw new Error('CATALOG_VERSION_UNAVAILABLE');
  const res = await fetch('/data/benyehuda/' + v.index_file, { cache: 'force-cache' });
  if (!res.ok) throw new Error('index ' + res.status);
  const ix = await res.json();
  SB.by = { version: Number(v.version), cards: Array.isArray(ix.ready) ? ix.ready : [] };   // works with a text only
  return SB.by;
}
async function sbPublicList() {
  if (SB.pubs) return SB.pubs;
  try { const p = await (await fetch('/api/public-corpora', { cache: 'no-cache' })).json(); SB.pubs = (p && Array.isArray(p.corpora) ? p.corpora : []).filter((c) => c && c.slug); }
  catch (_) { SB.pubs = []; }
  return SB.pubs;
}
async function sbPublicCatalog(slug) {
  if (SB.pubCat.has(slug)) return SB.pubCat.get(slug);
  const res = await fetch('/api/public-corpora/' + encodeURIComponent(slug), { cache: 'no-cache' });
  if (!res.ok) throw new Error('catalog ' + res.status);
  const cat = window.PublicCorpusAdapter.normalizeCorpus(await res.json());
  SB.pubCat.set(slug, cat);
  return cat;
}
// the device's copy of a catalog work (the same identities the lens uses: text_key / public slug + work id)
function sbLocalOf(kind, card, slug, list) {
  if (kind === 'by') return list.find((t) => t.text_key === card.text_key) || null;
  return list.find((t) => t.pslug === slug && String(t.pwork) === String(card.public_work_id)) || null;
}
function sbPick(it, on) {
  if (on) { if (SB.picked.size >= SB_MAX && !SB.picked.has(it.key)) { SB.note = fill(tt('dictionary.sb.max', 'В наборе не больше {n} текстов.'), { n: SB_MAX }); return; } SB.picked.set(it.key, it); }
  else SB.picked.delete(it.key);
  SB.note = '';
}
async function openSetBuilder() {
  const box = $('dict-setbuild'); if (!box) return;
  box.hidden = false;
  // a set opened from '@ids:' starts as the current cart
  if (!SB.picked.size && S.text && S.text.kind === 'ids') S.text.texts.forEach((t) => SB.picked.set('local:' + t.id, { key: 'local:' + t.id, kind: 'local', localId: t.id, title: t.title }));
  await renderSetBuilder();
  try { box.querySelector('.dict-sb-q').focus(); } catch (_) {}
}
function closeSetBuilder() { const box = $('dict-setbuild'); if (box) box.hidden = true; SB.epoch++; }
async function renderSetBuilder() {
  const box = $('dict-setbuild'); if (!box || box.hidden) return;
  const my = ++SB.epoch;
  const [list, pubs] = await Promise.all([myTexts(), sbPublicList()]);
  if (my !== SB.epoch) return;
  const sel = el('select', { class: 'dict-sb-src', attrs: { 'aria-label': tt('dictionary.sb.source', 'Источник') } }, [
    el('option', { attrs: { value: 'device' }, text: tt('dictionary.sb.device', 'На устройстве') }),
    el('option', { attrs: { value: 'by' }, text: tt('room.hub.benyehuda.title', 'Библиотека Бен-Иегуды') }),
    ...pubs.map((c) => el('option', { attrs: { value: 'pub:' + c.slug }, text: c.title || c.slug })),
  ]);
  sel.value = SB.source;
  sel.addEventListener('change', () => { SB.source = sel.value; renderSetBuilder(); });
  const qIn = el('input', { class: 'dict-sb-q', attrs: { type: 'search', dir: 'auto', autocomplete: 'off', placeholder: tt('dictionary.sb.searchPh', 'Название или автор'), 'aria-label': tt('dictionary.sb.searchPh', 'Название или автор'), value: SB.q } });
  let qt = 0;
  qIn.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { SB.q = qIn.value; renderResults(); }, 200); });
  const results = el('ul', { class: 'dict-sb-results', attrs: { 'aria-live': 'polite' } });
  const resNote = el('p', { class: 'dict-note' });
  const cart = el('div', { class: 'dict-sb-cart' });
  const status = el('p', { class: 'dict-note dict-sb-status', attrs: { role: 'status' }, text: SB.note });
  const head = el('div', { class: 'dict-sb-head' }, [el('b', { text: tt('dictionary.sb.title', 'Собрать набор') }),
    el('button', { class: 'dict-btn', attrs: { type: 'button', 'aria-label': tt('dictionary.cancel', 'Отмена') }, text: '✕', on: { click: closeSetBuilder } })]);
  box.replaceChildren(head, el('p', { class: 'dict-note', text: tt('dictionary.sb.hint', 'Отметьте тексты устройства и работы каталогов — их слова покажу одним срезом. Работы, которых нет на устройстве, скачаются (как при открытии в Зале).') }),
    el('div', { class: 'dict-sb-row' }, [sel, qIn]), results, resNote, cart, status);
  // one row per text / work: a checkbox, the title, who wrote it, «на устройстве»
  const row = (it, sub, onDevice) => {
    const cb = el('input', { attrs: { type: 'checkbox', 'data-sb-key': it.key } });
    cb.checked = SB.picked.has(it.key);
    cb.addEventListener('change', () => { sbPick(it, cb.checked); if (!SB.picked.has(it.key)) cb.checked = false; renderCart(); });
    return el('li', {}, [el('label', {}, [cb, el('span', { class: 'dict-sb-t', attrs: { dir: 'auto' }, text: it.title || '—' }),
      sub ? el('span', { class: 'dict-note', attrs: { dir: 'auto' }, text: sub }) : null,
      onDevice ? el('span', { class: 'dict-sb-on', text: tt('dictionary.sb.onDevice', 'на устройстве') }) : null])]);
  };
  async function renderResults() {
    const me = SB.epoch;
    results.replaceChildren(); resNote.textContent = tt('dictionary.loading', 'Ищу…');
    try {
      let found, total, rows = [];
      if (SB.source === 'device') {
        const r = CM().searchCards(list, SB.q, ['title'], SB_SHOW); found = r.items; total = r.total;
        const clsName = (t) => { const c = TEXT_CLASSES.find((x) => x[0] === (t.cls || 'mytext')); return c ? tt(c[1], c[2]) : ''; };
        rows = found.map((t) => row({ key: 'local:' + t.id, kind: 'local', localId: String(t.id), title: t.title }, clsName(t), false));
      } else if (SB.source === 'by') {
        resNote.textContent = tt('dictionary.sb.loadingBy', 'Загружаю каталог Бен-Иегуды…');
        const cat = await sbByCatalog(); if (me !== SB.epoch) return;
        const r = CM().searchCards(cat.cards, SB.q, ['title', 'author'], SB_SHOW); found = r.items; total = r.total;
        rows = found.map((c) => { const loc = sbLocalOf('by', c, null, list);
          return row({ key: 'by:' + c.id, kind: 'by', card: c, localId: loc ? String(loc.id) : null, title: c.title }, c.author || '', !!loc); });
      } else {
        const slug = SB.source.slice(4);
        const cat = await sbPublicCatalog(slug); if (me !== SB.epoch) return;
        const r = CM().searchCards(cat.items, SB.q, ['title', 'creator'], SB_SHOW); found = r.items; total = r.total;
        rows = found.map((c) => { const loc = sbLocalOf('pub', c, slug, list);
          return row({ key: 'pub:' + slug + ':' + c.public_work_id, kind: 'pub', slug, card: c, localId: loc ? String(loc.id) : null, title: c.title }, c.creator || '', !!loc); });
      }
      if (me !== SB.epoch) return;
      rows.forEach((r) => results.appendChild(r));
      resNote.textContent = !total ? tt('dictionary.sb.none', 'Ничего не найдено.')
        : total > found.length ? fill(tt('dictionary.sb.shownOf', 'Показано {a} из {b} — уточните поиск.'), { a: found.length, b: total }) : fill(tt('dictionary.sb.found', 'Найдено: {n}'), { n: total });
    } catch (err) {
      if (me !== SB.epoch) return;
      resNote.textContent = tt('dictionary.sb.catalogFailed', 'Каталог сейчас недоступен. Проверьте сеть и попробуйте ещё раз.');
      try { console.warn('[dictionary] catalog', err); } catch (_) {}
    }
  }
  function renderCart() {
    const items = Array.from(SB.picked.values()), toGet = items.filter((x) => !x.localId);
    cart.replaceChildren();
    status.textContent = SB.note;
    if (!items.length) { cart.appendChild(el('p', { class: 'dict-note', text: tt('dictionary.sb.empty', 'Пока ничего не выбрано.') })); return; }
    cart.appendChild(el('p', { class: 'dict-sb-sum', text: fill(tt('dictionary.sb.sum', 'Выбрано: {n} · скачать: {k}'), { n: items.length, k: toGet.length }) }));
    const chips = el('div', { class: 'dict-sb-chips' });
    items.forEach((x) => chips.appendChild(el('button', { class: 'dict-chip', attrs: { type: 'button', dir: 'auto', 'aria-label': fill(tt('dictionary.removeFilter', 'Убрать фильтр «{f}»'), { f: x.title }) },
      on: { click: () => { SB.picked.delete(x.key); const cb = results.querySelector('[data-sb-key="' + CSS.escape(x.key) + '"]'); if (cb) cb.checked = false; renderCart(); } } }, [(x.localId ? '' : '⬇ ') + (x.title || '—'), ' ✕'])));
    cart.appendChild(chips);
    cart.appendChild(el('div', { class: 'dict-drill-actions' }, [
      el('button', { class: 'dict-btn primary', attrs: { type: 'button', id: 'dict-sb-apply' }, text: fill(tt('dictionary.sb.apply', 'Показать слова ({n})'), { n: items.length }),
        on: { click: (ev) => { ev.currentTarget.disabled = true; applySetBuilder(status); } } }),
      el('button', { class: 'dict-btn', attrs: { type: 'button' }, text: tt('dictionary.sb.clear', 'Очистить'), on: { click: () => { SB.picked.clear(); results.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; }); renderCart(); } } }),
    ]));
  }
  renderCart();
  await renderResults();
}
async function applySetBuilder(status) {
  if (SB.busy) return;
  SB.busy = true;
  const items = Array.from(SB.picked.values()), toGet = items.filter((x) => !x.localId);
  const report = { got: 0, failed: [] };
  try {
    if (toGet.length) {
      const by = toGet.some((x) => x.kind === 'by') ? await sbByCatalog() : null;
      const deps = { db: localDb, fetch: (u, o) => fetch(u, o), Edition: window.BenYehudaLearningEdition, Adapter: window.PublicCorpusAdapter, catalogVersion: by ? by.version : null };
      const r = await CM().materializeMany(toGet, (x) => (x.kind === 'by' ? CM().ensureBenYehudaWork(x.card, deps) : CM().ensurePublicWork(x.slug, x.card, deps)), {
        onProgress: (d, n, x) => { status.textContent = x ? fill(tt('dictionary.sb.fetching', 'Скачиваю {d} из {n}: {t}'), { d: d + 1, n, t: x.title || '' }) : ''; } });
      r.ok.forEach((o) => { o.item.localId = String(o.localId); });
      report.got = r.ok.length;
      report.failed = r.failed.map((f) => ({ title: f.item.title, reason: f.reason }));
      S.textList = null;   // the device has new texts
    }
    const ids = items.filter((x) => x.localId).map((x) => x.localId);
    const line = (report.got ? fill(tt('dictionary.sb.got', 'Скачано: {n}.'), { n: report.got }) + ' ' : '')
      + (report.failed.length ? fill(tt('dictionary.sb.failed', 'Не удалось: {n} — {list}.'), { n: report.failed.length, list: report.failed.map((f) => '«' + f.title + '» (' + f.reason + ')').join(', ') }) : '');
    if (!ids.length) { status.textContent = line || tt('dictionary.sb.nothing', 'Ни один текст не удалось получить.'); return; }
    closeSetBuilder();
    const id = '@ids:' + Array.from(new Set(ids)).join(',');
    try { history.replaceState(null, '', '?text=' + encodeURIComponent(id)); } catch (_) {}
    if (S.filters.scope !== 'text') setScope('text');
    await loadText(id); await fillTextPicker();
    if (line) toast(line);
  } catch (err) {
    status.textContent = tt('dictionary.sb.catalogFailed', 'Каталог сейчас недоступен. Проверьте сеть и попробуйте ещё раз.');
    try { console.warn('[dictionary] set builder', err); } catch (_) {}
  } finally {
    SB.busy = false;
    const b = document.getElementById('dict-sb-apply'); if (b) b.disabled = false;
  }
}
window.LPDictionarySetBuilder = SB;   // smoke / diagnostics

// ── wiring ─────────────────────────────────────────────────────────────────────────────────────
function wire() {
  $('dict-sb-open').addEventListener('click', () => { const b = $('dict-setbuild'); if (b && !b.hidden) closeSetBuilder(); else openSetBuilder(); });
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
    setScope(b.getAttribute('data-scope'));
    if (S.filters.scope === 'met' && !S.metBuilt) buildMet();
    else if (S.filters.scope === 'text') { fillTextPicker(); applyView(); }
    else applyView();
  }));
  $('dict-text-sel').addEventListener('change', (ev) => { if (ev.target.value) { try { history.replaceState(null, '', '?text=' + encodeURIComponent(ev.target.value)); } catch (_) {} loadText(ev.target.value); } });
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
  // «Слова этого текста»: dictionary.html?text=<id> (from the Room / Studio) opens the text lens
  // Д5.2 dictionary.html?texts=<id>,<id> (the Studio's multi-select «Слова выбранных») opens the lens of those texts
  try {
    const qs = new URLSearchParams(location.search), ids = (qs.get('texts') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200);
    const tx = ids.length ? '@ids:' + ids.join(',') : qs.get('text');
    // the picker first (the lens title + groups are shown while the words are being parsed), again for a Studio set
    if (tx) { setScope('text'); await fillTextPicker(); $('dict-text-sel').value = tx; await loadText(tx); if (isSetId(tx)) await fillTextPicker(); }
  } catch (_) {}
}
let _reloadT = 0;
function reloadSoon() { clearTimeout(_reloadT); _reloadT = setTimeout(() => reload(), 300); }
async function reload() {
  const fresh = await loadSources();
  // keep readings and «met» entries already computed
  S.entries.forEach((old, k) => { const e = fresh.get(k); if (e && old.reading !== undefined) { e.reading = old.reading; e.paradigm = old.paradigm; e.forms = old.forms; } if (!e && old.metOnly) fresh.set(k, old); else if (e && old.met) e.met = old.met; });
  S.entries = fresh;
  if (S.text && S.text.scan) { await refreshLive(); attachText(); }
  applyView();
  await resolveReadings(S.entries);
  applyView();
  if (S.viewMode === 'progress') renderProgress();
  if (S.selected && S.entries.has(S.selected)) openArticle(S.selected);
}
window.LPDictionary = { state: S, reload, openArticle, setView };   // smoke / diagnostics
boot();
