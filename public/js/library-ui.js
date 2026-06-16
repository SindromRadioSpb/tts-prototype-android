// library-ui.js — BRR-P0-002 Reading Room surface (Layout A: track tabs +
// vertical shelf stack with horizontal work-card carousels).
//
// Clean discovery surface over the shared OPFS engine. Reuses the existing
// reader by DEEP-LINKING to index.html (#/t/<base64>) rather than embedding
// renderTable (which is tied to 50+ index.html globals) — low-risk first cut.
// All Studio functions stay in index.html and are absent here.
//
// i18n globals (window.t / applyI18n / appSetLocale) come from i18n/index.js,
// loaded before this module; <html dir> flips to rtl for Hebrew automatically.

import * as localDb from '/db/local-db.js';
import * as readerCore from '/js/reader-core.js';

// BRR-P0-002b — the same-document embedded reader (warm-worker open) is the DEFAULT
// Room open: parity-proven (smoke:reader-parity) + prod-verified, warm-open ~24-100ms
// vs ~1s cold deep-link. ?embed=0 forces the legacy cross-document deep-link (escape
// hatch); right-click / middle-click / no-JS still navigate via the card's href.
const EMBED = (() => { try { return new URLSearchParams(location.search).get('embed') !== '0'; } catch (_) { return true; } })();

const TRACKS = ['accessible', 'literary', 'corpus'];
const TAB_ID = { accessible: 'tabAccessible', literary: 'tabLiterary', corpus: 'tabCorpus' };
let activeTrack = 'accessible';
let shelvesByTrack = { accessible: [], literary: [], corpus: [] };
let textByKey = new Map(); // text_key -> { id, title }

// BRR-P0-007 Проход-3 / BRR-P1-015 A3 — the machine-translated full corpus is delivered
// catalog-driven (NOT auto-imported like the curated canon): a work materialises into OPFS
// only when its card is opened (served-on-open). It lives in its OWN "Корпус" track — never
// mixed into the curated canon shelves — and every card is honestly labelled
// (review_status=machine, audio_status=none / "перевод позже"), so the un-graded machine
// corpus is never silently dressed as the curated canon (R8/owner).
//
// A3: the v2 flat-shelf surface is replaced by a Период→Автор→Работа drill (benyehuda.org
// parity). The client reads a THIN root (era taxonomy + manifest map, precached) + a lazy
// sidecar (author index + ready rail + facet histograms, fetched once on first Корпус open)
// + per-era manifest BLOCK(s) on demand (only the block(s) an author lives in — D1/R4 keeps
// the mobile budget to root + 1 active manifest, never the 26K/10MB at once).
const CORPUS_CATALOG_VERSION = 7;
const CORPUS_ROOT_URL = '/data/benyehuda/corpus-catalog-v' + CORPUS_CATALOG_VERSION + '.json';
let corpusRoot = null;          // thin root: { era_taxonomy, manifests, counts, index_file, pointers }
let corpusIndex = null;         // sidecar: { ready:[card], authors:{era:[{name,qid,works,ready,blocks}]}, facets }
let corpusIndexLoading = null;  // single-flight guard for the lazy sidecar fetch
const corpusManifestCache = new Map(); // manifest file path -> works[] (fetched block, cached)
let corpusNav = { level: 'home', era: null, author: null }; // current drill position
let corpusReveal = 0;           // incremental-reveal cursor for the active long list
let corpusRenderToken = 0;      // guards async renders against rapid navigation
let corpusImporting = false;
const CORPUS_PAGE = 60;         // "показать ещё" page size for author/work lists

// A3 Slice 2 — global search + facets, backed by ONE lazy flat index (corpus-search-v3.json,
// ~370KB br, fetched on the FIRST search/facet use only, NOT precached). It powers both the
// title-search and the genre/lang/ready facet filter; a ready hit is opened by joining its id
// to corpusIndex.ready, an unprocessed hit is a display-only row (honest, never openable).
let corpusSearch = null;         // [{id,t,a,e,g,l,r, _n:niqqud-stripped title}] (normalized on load)
let corpusSearchLoading = null;  // single-flight guard
let corpusVocab = null;          // BRR-P1-007 S2: { dict:[pid], works:{id:{ids,tok,m,n,ez}} } (lazy, NOT precached)
let corpusVocabLoading = null;   // single-flight guard
const CORPUS_VOCAB_DATA_REV = 2;  // bump when corpus-vocab sidecar CONTENT changes within a catalog version (S3=ez)
const FTS_DATA_REV = 5;           // BRR-P2-001/006/006a — bump when the FTS index CONTENT/FORMAT changes (rev 5 = 2-level prefix shards)
let corpusFtsSeq = 0;            // BRR-P2-006a — monotonic render token: a superseded FTS query's late results never paint
let corpusReadyById = null;      // Map(id -> full ready card) for opening result rows
let corpusFilter = { q: '', genre: '', lang: '', readyOnly: false }; // active global filter
let corpusL1Body = null;         // ref to the L1 body region (refreshed in place so the
                                 // filter bar — and the search input's focus — survive typing)
let corpusClearChip = null;      // ref to the «✕ Сбросить» chip (shown only when a filter is active)
let corpusAuthorSort = 'graduated'; // L2 author order: 'graduated' (ready-first) | 'alpha'
let corpusWorkSort = 'graded';      // BRR-P2-004 L3 work order: 'graded'(id) | 'alpha' | 'length'
let corpusWorkGenre = '';           // BRR-P2-004 L3 genre filter within the author ('' = all)

const CORPUS_NIQQUD_RE = /[֑-ׇ]/g; // same range as notes-autogen stripNiqqud (single normalizer)
function corpusNrm(s) { return String(s == null ? '' : s).replace(CORPUS_NIQQUD_RE, '').toLowerCase().trim(); }

const $ = (id) => document.getElementById(id);
const tt = (key, fallback) => { try { return (window.t && window.t(key)) || fallback || key; } catch (_) { return fallback || key; } };
const HEBREW_RE = /[֐-׿]/;

// Deep-link payload identical to index.html's router (#/t/<base64url(JSON)>).
function b64url(str) {
  const utf8 = unescape(encodeURIComponent(str));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deepLinkForText(textId) {
  // BRR-P0-002a — `?room=1` BEFORE the hash so index.html boots into room-mode
  // (clean reading view, Studio chrome hidden). Query is outside the base64
  // payload, so the deep-link target {v:1,type:'text',id} stays byte-identical.
  return '/index.html?room=1#/t/' + b64url(JSON.stringify({ v: 1, type: 'text', id: String(textId) }));
}

function el(tag, opts) {
  const e = document.createElement(tag);
  if (opts) {
    if (opts.class) e.className = opts.class;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.i18n) e.setAttribute('data-i18n', opts.i18n);
    if (opts.dir) e.setAttribute('dir', opts.dir);
    if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
  }
  return e;
}

function showState(i18nKey, icon) {
  const main = $('roomContent');
  if (!main) return;
  main.innerHTML = '';
  const box = el('div', { class: 'room-state' });
  if (icon) box.appendChild(el('span', { class: 'room-state-icon', text: icon }));
  box.appendChild(el('span', { i18n: i18nKey, text: tt(i18nKey) }));
  main.appendChild(box);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

function renderWorkCard(textKey) {
  const hit = textByKey.get(textKey);
  if (!hit) {
    // Honest: a member that has no matching text (dangling) is shown disabled,
    // not silently dropped (R8 — no invisible dead-end), and not openable.
    const card = el('div', { class: 'work-card', attrs: { 'aria-disabled': 'true' } });
    card.setAttribute('disabled', '');
    card.appendChild(el('span', { class: 'work-card-title', text: '—' }));
    card.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.unavailable', text: tt('room.work.unavailable') }));
    return card;
  }
  // Semantic anchor: native navigation, keyboard/right-click-open, assertable
  // href. The browser's reader (index.html) resolves the deep-link.
  const card = el('a', { class: 'work-card', attrs: { href: deepLinkForText(hit.id) } });
  const title = hit.title || '';
  const titleEl = el('span', { class: 'work-card-title', text: title });
  if (HEBREW_RE.test(title)) titleEl.setAttribute('dir', 'rtl');
  card.appendChild(titleEl);
  // BRR-P0-005 — honest provenance on the discovery surface: author + the
  // review_status / audio_status labels straight off the corpus metadata. No
  // fabrication — what the bundle declares is what we show (the clickable source
  // link lives in the reader to avoid an invalid <a> inside this card link).
  const corpus = hit.corpus;
  if (corpus) {
    if (corpus.author) {
      const a = el('span', { class: 'work-card-author', text: corpus.author });
      if (HEBREW_RE.test(corpus.author)) a.setAttribute('dir', 'rtl');
      card.appendChild(a);
    }
    // Known enums (corpusMeta) get localized labels + styled chips; an unknown
    // value (only from an un-gated peer bundle) shows the raw claimed value
    // verbatim — honest, and avoids rendering a raw i18n key.
    const RS_KNOWN = { machine: 1, machine_assisted: 1, human_proofread: 1 };
    const AU_KNOWN = { none: 1, tts: 1, human: 1 };
    const meta = el('div', { class: 'work-card-meta' });
    const rs = String(corpus.review_status || 'machine');
    const rsOpts = { class: 'prov-badge rs-' + rs, text: RS_KNOWN[rs] ? tt('room.prov.rs.' + rs) : rs };
    if (RS_KNOWN[rs]) rsOpts.i18n = 'room.prov.rs.' + rs;
    meta.appendChild(el('span', rsOpts));
    const au = String(corpus.audio_status || 'none');
    const auOpts = { class: 'prov-badge audio-' + au, text: AU_KNOWN[au] ? tt('room.prov.audio.' + au) : au };
    if (AU_KNOWN[au]) auOpts.i18n = 'room.prov.audio.' + au;
    meta.appendChild(el('span', auOpts));
    card.appendChild(meta);
  }
  card.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.open', text: tt('room.work.open') }));
  // Embedded warm open (default) — preventDefault keeps the href deep-link as the
  // graceful fallback (right-click/middle-click/no-JS still navigate to the reader;
  // ?embed=0 disables the embed path entirely).
  if (EMBED) card.addEventListener('click', (e) => { e.preventDefault(); openReader(hit.id, title); });
  return card;
}

function renderShelf(shelf) {
  const wrap = el('section', { class: 'shelf' });
  const head = el('div', { class: 'shelf-head' });
  const titleEl = el('h2', { class: 'shelf-title', text: shelf.title || '' });
  if (HEBREW_RE.test(shelf.title || '')) titleEl.setAttribute('dir', 'rtl');
  head.appendChild(titleEl);
  if (shelf.editorial_intro) {
    const introEl = el('p', { class: 'shelf-intro', text: shelf.editorial_intro });
    if (HEBREW_RE.test(shelf.editorial_intro)) introEl.setAttribute('dir', 'rtl');
    head.appendChild(introEl);
  }
  wrap.appendChild(head);
  const rail = el('div', { class: 'shelf-rail' });
  const items = Array.isArray(shelf.items) ? shelf.items : [];
  for (const it of items) {
    // Curated canon shelves (accessible/literary) carry text_key members. The Корпус track
    // is NOT shelf-driven any more (A3): it renders the Период→Автор→Работа drill instead.
    const key = typeof it === 'string' ? it : (it && it.text_key);
    if (key) rail.appendChild(renderWorkCard(key));
  }
  wrap.appendChild(rail);
  return wrap;
}

// A corpus card renders from the catalog (no OPFS row yet). Same DOM + honest provenance
// badges as the canon card, but it is a role=button (served-on-open needs JS — there is
// no no-JS deep-link to a not-yet-imported text; <div role=button> also dodges the mobile
// `button { width:100% }` trap, CLAUDE.md §1). Keyboard-openable (Enter/Space).
function renderCorpusCard(card) {
  if (!card) {
    const dead = el('div', { class: 'work-card', attrs: { 'aria-disabled': 'true' } });
    dead.setAttribute('disabled', '');
    dead.appendChild(el('span', { class: 'work-card-title', text: '—' }));
    dead.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.unavailable', text: tt('room.work.unavailable') }));
    return dead;
  }
  const node = el('div', { class: 'work-card', attrs: { role: 'button', tabindex: '0', 'data-work-id': String(card.id == null ? '' : card.id) } });
  const title = card.title || '';
  const titleEl = el('span', { class: 'work-card-title', text: title });
  if (HEBREW_RE.test(title)) titleEl.setAttribute('dir', 'rtl');
  node.appendChild(titleEl);
  if (card.author) {
    const a = el('span', { class: 'work-card-author', text: card.author });
    if (HEBREW_RE.test(card.author)) a.setAttribute('dir', 'rtl');
    node.appendChild(a);
  }
  const RS_KNOWN = { machine: 1, machine_assisted: 1, human_proofread: 1 };
  const AU_KNOWN = { none: 1, tts: 1, human: 1 };
  const meta = el('div', { class: 'work-card-meta' });
  const rs = String(card.review_status || 'machine');
  const rsOpts = { class: 'prov-badge rs-' + rs, text: RS_KNOWN[rs] ? tt('room.prov.rs.' + rs) : rs };
  if (RS_KNOWN[rs]) rsOpts.i18n = 'room.prov.rs.' + rs;
  meta.appendChild(el('span', rsOpts));
  const au = String(card.audio_status || 'none');
  const auOpts = { class: 'prov-badge audio-' + au, text: AU_KNOWN[au] ? tt('room.prov.audio.' + au) : au };
  if (AU_KNOWN[au]) auOpts.i18n = 'room.prov.audio.' + au;
  meta.appendChild(el('span', auOpts));
  node.appendChild(meta);
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.open', text: tt('room.work.open') }));
  const open = () => openCorpusWork(card);
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  observeCardCoverage(node, card);   // S3: lazy coverage badge (visible cards only — profile-gated, soft estimate)
  return node;
}

function renderTrack() {
  const main = $('roomContent');
  if (!main) return;
  // A3 — the Корпус track is a Период→Автор→Работа drill, not a shelf stack.
  if (activeTrack === 'corpus') { renderCorpus(); return; }
  const shelves = shelvesByTrack[activeTrack] || [];
  const anyShelves = TRACKS.some((t) => (shelvesByTrack[t] || []).length);
  if (!anyShelves) { showState('room.shelf.empty', '📚'); return; }
  if (!shelves.length) { showState('room.shelf.emptyTrack', '📚'); return; }
  main.innerHTML = '';
  for (const shelf of shelves) main.appendChild(renderShelf(shelf));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

function setActiveTrack(track) {
  if (TRACKS.indexOf(track) === -1) return;
  activeTrack = track;
  TRACKS.forEach((t) => {
    const btn = $(TAB_ID[t]);
    if (btn) btn.setAttribute('aria-selected', String(t === track));
  });
  renderTrack();
}

// ── embedded reader (warm-worker open) ───────────────────────────────────────
// Opens a canon text IN THIS DOCUMENT via reader-core, reusing the db worker that
// boot() already warmed — the latency win over the cold deep-link. Reading-aids
// (translit profile + column visibility) re-render from the cached rows, no refetch.
// BRR-P1-006 Scaffolded Reading Console — scaffolding "modes" (not just on/off) so the leves can FADE.
//   niqqudMode: 'full' (all vocalized) | 'adaptive' (de-vocalize words you know) | 'off' (column hidden)
//   ruMode:     'show'  (translation shown) | 'reveal' (blurred, tap a row to reveal) | 'off'
// Persisted to localStorage (loadReaderCfg/saveReaderCfg) so the scaffolding is a JOURNEY, not reset each load.
let readerCfg = { heOn: true, niqqudMode: 'full', translitOn: true, translitProfile: 'sbl', ruMode: 'show' };
function loadReaderCfg() {
  try {
    const he = localStorage.getItem('room.heOn'); if (he != null) readerCfg.heOn = he === '1';
    const nm = localStorage.getItem('room.niqqudMode'); if (nm === 'full' || nm === 'adaptive' || nm === 'off') readerCfg.niqqudMode = nm;
    const tp = localStorage.getItem('room.translitProfile'); if (tp === 'sbl' || tp === 'ru-phonetic') readerCfg.translitProfile = tp;
    const to = localStorage.getItem('room.translitOn'); if (to != null) readerCfg.translitOn = to === '1';
    const rm = localStorage.getItem('room.ruMode'); if (rm === 'show' || rm === 'reveal' || rm === 'off') readerCfg.ruMode = rm;
  } catch (_) {}
}
function saveReaderCfg() {
  try {
    localStorage.setItem('room.heOn', readerCfg.heOn ? '1' : '0');
    localStorage.setItem('room.niqqudMode', readerCfg.niqqudMode);
    localStorage.setItem('room.translitProfile', readerCfg.translitProfile);
    localStorage.setItem('room.translitOn', readerCfg.translitOn ? '1' : '0');
    localStorage.setItem('room.ruMode', readerCfg.ruMode);
  } catch (_) {}
}
function aidsHinted() { try { return localStorage.getItem('room.aidsHinted') === '1'; } catch (_) { return true; } }
function aidsHintedSet() { try { localStorage.setItem('room.aidsHinted', '1'); } catch (_) {} }
let readerRows = [];
let readerAudio = null; // attachRowAudio detach handle
let readerMorph = null; // ReaderMorph attach detach handle
let readerTextId = null; // BRR-P2-002 — local OPFS id of the open text (for progress)
let readerTextTitle = ''; // BRR-P2-003 — title + key of the open text (denormalised into bookmarks)
let readerTextKey = null;
let _bookmarkSet = null;  // Set of bookmarked sentence_ids in the current text

// BYOK GCP TTS key — same localStorage slot index.html uses (v3.gcpTtsApiKey).
// Empty is fine: audio falls back to keyless browser SpeechSynthesis.
function gcpTtsKey() { try { return localStorage.getItem('v3.gcpTtsApiKey') || ''; } catch (_) { return ''; } }

// BRR-P1-009 — word-status colouring (opt-in). The lemmaKey→state map is built once
// per reader session from the user's OPFS notes; enabling the toggle warms the morph
// engine (3.3 MB dict) + paints, so the DEFAULT reader-open stays light + offline-cheap.
let readerWordStates = null; // cached {lemmaKey: state}
let readerWordStatesLoading = null; // single-flight guard (S3: 796 cards call ensureWordStates at once)
function wordStatusEnabled() { try { return localStorage.getItem('room.wordStatus') === '1'; } catch (_) { return false; } }
function wordStatusSet(v) { try { localStorage.setItem('room.wordStatus', v ? '1' : '0'); } catch (_) {} }
// Tier-3 «точный режим» (context mode, opt-in, default OFF). The provider sends the tapped
// word's SENTENCE to Dicta (browser-direct) and returns the context token; reader-morph's
// pickContextReading does the honest disambiguation. Per-sentence promise cache so multiple
// taps in one row = one Dicta call; cleared on (re)attach. Degrade/offline → null (silent).
function contextModeEnabled() { try { return localStorage.getItem('room.contextMode') === '1'; } catch (_) { return false; } }
function contextModeSet(v) { try { localStorage.setItem('room.contextMode', v ? '1' : '0'); } catch (_) {} }
let _ctxCache = new Map();
function makeContextProvider() {
  return async function (sentence, surface) {
    const key = String(sentence || '');
    if (!key || !window.ReaderDicta) return null;
    let p = _ctxCache.get(key);
    if (!p) { p = window.ReaderDicta.analyzeSentence(key).catch(() => null); _ctxCache.set(key, p); }
    const res = await p;
    if (!res || !res.ok || res.degraded || !Array.isArray(res.tokens)) return null;
    const tok = window.ReaderDicta.tokenForSurface(res.tokens, surface);
    return (tok && tok.niqqud) ? { niqqud: tok.niqqud, posDicta: tok.posDicta, lemma: tok.lemma } : null;
  };
}
async function ensureWordStates() {
  if (readerWordStates) return readerWordStates;
  // SINGLE-FLIGHT (critical): S3's per-card coverage badge calls this for EVERY corpus card
  // (the ready rail alone is ~796). Without the guard, 796 concurrent getKnownWordStates()
  // queries flood the OPFS SQLite worker queue and block openCorpusWork's importBundle write
  // → texts won't open (worse with a large note profile, where each query is slow). The guard
  // collapses them to ONE query that every caller awaits.
  if (readerWordStatesLoading) return readerWordStatesLoading;
  readerWordStatesLoading = (async () => {
    // CRITICAL: a transient FIRST getKnownWordStates() failure right after boot (heavy on a 10K-note
    // profile) used to be cached as {} — and `if (readerWordStates)` treats the empty object as
    // "loaded", so it NEVER retried. The reader's whole profile (i+1 rail, coverage badges,
    // word-status) then silently saw an empty profile. Fix: on error leave the cache NULL so the
    // next call retries; only a successful load (even genuinely empty) is cached.
    try { readerWordStates = await localDb.getKnownWordStates(); return readerWordStates; }
    catch (_) { readerWordStates = null; return {}; }
  })();
  try { return await readerWordStatesLoading; } finally { readerWordStatesLoading = null; }
}
// BRR-P1-006/009 — apply BOTH word-status colouring and adaptive niqqud fade in ONE pass
// (reader-morph resolves each word once). States are only fetched when a decoration needs them
// (colour on, or niqqud 'adaptive'); otherwise a cheap clear restores plain/neutral.
async function applyDecorations() {
  const mount = $('roomReaderTable');
  if (!mount || !window.ReaderMorph) return;
  const color = wordStatusEnabled();
  const fadeMode = readerCfg.niqqudMode;            // 'full' | 'adaptive' | 'off'
  const need = color || fadeMode === 'adaptive';
  const states = need ? await ensureWordStates() : {};
  try { await window.ReaderMorph.decorateWords(mount, states, { color, fadeMode }); } catch (_) {}
}

// ── note-formation: turn a tapped word into a word_study note (the «превращение») ──
// Reuses the Studio pipeline (NotesAutoGen.dedupKey + localDb canonical-note API). The
// card (reader-morph) calls lookupNote on open + saveWord on «Сохранить». Idempotent
// (one canonical note per lemma; re-save just adds an occurrence).
function roomNoteBody(card) {
  const body = {
    word: card.word || '', niqqud_variant: card.niqqud || '',
    root: card.root || '', lemma: card.lemma || '',
    pos: card.pos || '', part_of_speech: card.pos || '',
    binyan: card.binyan || '', meaning: card.meaning || '',
  };
  if (card.pealim_id) body.pealim_id = String(card.pealim_id);
  return body;
}
function roomDedupKey(card) {
  try { return window.NotesAutoGen ? window.NotesAutoGen.dedupKey(roomNoteBody(card)) : ''; } catch (_) { return ''; }
}
async function roomLookupNote(card) {
  const dk = roomDedupKey(card);
  if (!dk) return null;
  let note; try { note = await localDb.findNoteByDedupKey(dk); } catch (_) { note = null; }
  if (!note) return null;
  let life = {}; try { life = await localDb.getWordNoteLifecycle([note.id]); } catch (_) {}
  return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || 'created' };
}
async function roomSaveWord(card, occ) {
  const body = roomNoteBody(card);
  const dk = roomDedupKey(card);
  if (!dk) return null;
  let note; try { note = await localDb.findNoteByDedupKey(dk); } catch (_) { note = null; }
  if (!note) {
    try {
      note = await localDb.createCanonicalNote({
        gen_dedup_key: dk, body, title: body.word || '', source: 'curated',
        confidence: typeof card.confidence === 'number' ? card.confidence : null,
        model_version: (window.InflectionDict && window.InflectionDict.MODEL) || null,
        user_touched: 0,
      });
    } catch (e) { try { console.warn('[room] save note failed', e); } catch (_) {} return null; }
  }
  if (note && occ && (occ.text_id || occ.sentence_id)) {
    try { await localDb.addNoteOccurrence(note.id, { text_id: occ.text_id, sentence_id: occ.sentence_id, word_offset: occ.word_offset, surface: occ.surface }); } catch (_) {}
  }
  readerWordStates = null; // saved a note → status map is stale; re-decorate (colour + adaptive fade)
  try { applyDecorations(); } catch (_) {}
  roomToast(tt('room.morph.savedToast', 'Слово сохранено в заметки'));
  if (!note) return { status: 'created' };
  let life = {}; try { life = await localDb.getWordNoteLifecycle([note.id]); } catch (_) {}
  return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || 'created' };
}

let _roomToastEl = null, _roomToastT = null;
function roomToast(msg) {
  try {
    if (!_roomToastEl) { _roomToastEl = el('div', { class: 'room-toast' }); document.body.appendChild(_roomToastEl); }
    _roomToastEl.textContent = msg;
    _roomToastEl.classList.add('show');
    if (_roomToastT) clearTimeout(_roomToastT);
    _roomToastT = setTimeout(() => { if (_roomToastEl) _roomToastEl.classList.remove('show'); }, 2200);
  } catch (_) {}
}

// ── PWA update toast + «О Зале» (premium chrome — the Room registers the SW itself, so an
// update prompt + About surface exist even when the Room is opened directly, not via Studio) ──
let roomWaitingWorker = null, roomReloadingForUpdate = false, roomUpdateToastEl = null, roomAppVersion = '';
function dismissRoomUpdateToast() {
  if (roomUpdateToastEl && roomUpdateToastEl.parentNode) roomUpdateToastEl.parentNode.removeChild(roomUpdateToastEl);
  roomUpdateToastEl = null;
}
function applyRoomUpdate() {
  const w = roomWaitingWorker;
  dismissRoomUpdateToast();
  if (w) {
    // Ask the waiting SW to activate; 'controllerchange' reloads INTO the new shell. Long fallback
    // only covers a dropped message (a short timer reloads onto the old shell on iOS → toast loops).
    w.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => { if (!roomReloadingForUpdate) { roomReloadingForUpdate = true; location.reload(); } }, 3500);
  } else { location.reload(); }
}
function showRoomUpdateToast(worker) {
  roomWaitingWorker = worker || roomWaitingWorker;
  refreshAboutUpdateStatus();
  dismissRoomUpdateToast();
  const box = el('div', { class: 'room-update-toast', attrs: { role: 'status' } });
  box.appendChild(el('span', { text: tt('app.updateAvailable', 'Доступно обновление приложения') }));
  const up = el('button', { class: 'ru-upd', text: tt('app.updateNow', 'Обновить') });
  up.addEventListener('click', applyRoomUpdate);
  const later = el('button', { class: 'ru-later', text: tt('app.updateLater', 'Позже') });
  later.addEventListener('click', dismissRoomUpdateToast);
  box.appendChild(up); box.appendChild(later);
  document.body.appendChild(box);
  roomUpdateToastEl = box;
}
function registerRoomServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (roomReloadingForUpdate) return; roomReloadingForUpdate = true; location.reload();
  });
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showRoomUpdateToast(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showRoomUpdateToast(nw);
      });
    });
    const check = () => { try { reg.update(); } catch (_) {} };
    check();
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch((e) => { try { console.warn('[room] sw register failed', e); } catch (_) {} });
}
async function loadRoomVersion() {
  try {
    const j = await (await fetch('/api/client-config', { cache: 'no-store' })).json();
    if (j && j.version) {
      roomAppVersion = String(j.version);
      const fv = $('roomFooterVersion'); if (fv) fv.textContent = roomAppVersion;
      const av = $('roomAboutVersion'); if (av) av.textContent = roomAppVersion;
    }
  } catch (_) {}
}
function refreshAboutUpdateStatus() {
  const box = $('roomAboutUpdate'); if (!box) return;
  box.innerHTML = '';
  if (roomWaitingWorker) {
    box.appendChild(el('span', { text: tt('room.about.updateAvailable', 'Доступно обновление') + ' ' }));
    const b = el('button', { text: tt('app.updateNow', 'Обновить') });
    b.addEventListener('click', applyRoomUpdate);
    box.appendChild(b);
  } else {
    box.appendChild(el('span', { text: tt('room.about.upToDate', '✓ Актуальная версия') }));
  }
}
function openRoomAbout() { refreshAboutUpdateStatus(); const m = $('roomAbout'); if (m) m.hidden = false; }
function closeRoomAbout() { const m = $('roomAbout'); if (m) m.hidden = true; }

// Theme — shared with Studio via localStorage.appTheme_v1 (light|dark|auto). body.theme-light/
// theme-dark override prefers-color-scheme (CSS already honors them); auto = no class = follow OS.
// A no-flash inline script in library.html applies the class pre-paint; this sets the toggle icon/title.
const THEME_KEY = 'appTheme_v1';
const THEME_ICON = { auto: '🌗', light: '☀️', dark: '🌙' };
function getTheme() { try { const v = localStorage.getItem(THEME_KEY); return (v === 'light' || v === 'dark') ? v : 'auto'; } catch (_) { return 'auto'; } }
function applyTheme(mode) {
  document.body.classList.remove('theme-light', 'theme-dark');
  if (mode === 'light') document.body.classList.add('theme-light');
  else if (mode === 'dark') document.body.classList.add('theme-dark');
  const b = $('roomTheme');
  if (b) {
    b.textContent = THEME_ICON[mode] || THEME_ICON.auto;
    const lbl = tt('room.theme.label', 'Тема') + ': ' + tt('room.theme.' + mode, mode);
    b.setAttribute('title', lbl); b.setAttribute('aria-label', lbl);
  }
}
function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  try { if (next === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (_) {}
  applyTheme(next);
}

// BRR-P1-008b — on-device word-karaoke diagnostic. Open any text with ?wkdebug=1 and play: a small
// overlay shows the live internal state so a device-specific issue (browser-speech vs audio, timing
// not loaded, rAF not ticking, spans missing) can be read off WITHOUT a console (iPhone-friendly).
let _wkBootErr = '';   // captured boot/load error, surfaced in the ?wkdebug overlay (iPhone has no console)
function maybeStartWkDebug() {
  let on = false; try { on = new URLSearchParams(location.search).get('wkdebug') === '1'; } catch (_) {}
  if (!on) return;
  const box = el('div', { attrs: { id: 'wkDebugBox' } });
  box.style.cssText = 'position:fixed;left:6px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:99999;background:rgba(0,0,0,.85);color:#5f5;font:11px/1.45 ui-monospace,monospace;padding:7px 9px;border-radius:7px;max-width:94vw;white-space:pre;pointer-events:none';
  document.body.appendChild(box);
  setInterval(() => {
    let d = null; try { d = (readerAudio && readerAudio.debug) ? readerAudio.debug() : null; } catch (_) {}
    const mount = $('roomReaderTable');
    const rmw = mount ? mount.querySelectorAll('.rm-w').length : 0;
    const speaking = mount ? mount.querySelectorAll('.rm-w-speaking').length : 0;
    box.textContent = 'wk: ' + (d ? ('mode=' + d.mode + ' t=' + d.t + ' tN=' + d.timingN + ' off=' + d.off + ' ticks=' + d.ticks + ' key=' + d.key) : '(not playing)')
      + '\nDOM: rm-w=' + rmw + ' speaking=' + speaking + ' raf=' + (typeof requestAnimationFrame !== 'undefined')
      + (_wkBootErr ? '\nERR: ' + String(_wkBootErr).slice(0, 200) : '');
  }, 250);
}

function readerConfig() {
  return {
    // visibleColumns derived from the scaffolding modes (niqqud/ru 'off' ⇒ column hidden).
    visibleColumns: {
      action: true,
      he: !!readerCfg.heOn,
      niqqud: readerCfg.niqqudMode !== 'off',
      translit: !!readerCfg.translitOn,
      ru: readerCfg.ruMode !== 'off',
    },
    baseWidths: [15, 20, 20, 21, 24],
    translitProfile: readerCfg.translitProfile,
    ideMode: false,
    actionTitle: '▶', // Room hides note/edit → no "📝" in the action header
    t: (k) => tt(k, k),
    hasNote: () => false,
  };
}

// (Re)attach the delegated per-row audio handler to the reader mount. Called after
// every render (open + aids re-render); detaches first so there is exactly one
// listener and playback state resets cleanly.
function attachReaderAudio() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  if (readerAudio) { try { readerAudio.detach(); } catch (_) {} readerAudio = null; }
  readerAudio = readerCore.attachRowAudio(mount, {
    getRow: (i) => readerRows[i],
    rowCount: () => readerRows.length,        // BRR-P1-008 karaoke — bound for auto-advance
    onRowChange: onKaraokeRowChange,          // idx>=0 → auto-scroll; idx<0 → karaoke ended
    profile: { voiceId: '', rate: 1.0, pitch: 0.0 },
    gcpKey: gcpTtsKey,
    t: (k) => tt(k, k),
    // he/niqqud cell taps are reserved for the word-morphology layer below; the ▶ button +
    // translit cell still play the row. In reveal mode the ru cell tap reveals (not audio).
    tapToHearExcludeCols: readerCfg.ruMode === 'reveal' ? ['he', 'niqqud', 'ru'] : ['he', 'niqqud'],
  });
  attachReaderMorph(mount);
  applyReveal(mount);
  attachBookmarks(mount);   // BRR-P2-003 — POST-render ☆/★ per row (Room-only, parity-safe)
  karaokeActive = false; setReadAloudBtn(false);   // a fresh (re)attach resets karaoke state
}

// BRR-P1-008 — continuous read-aloud (karaoke). Reuses the existing per-row .row-playing highlight;
// adds a «Читать вслух» control, auto-advance (in reader-core), and auto-scroll that yields to manual scroll.
let karaokeActive = false, karaokeUserScrolled = false, _karaokeScrollWired = false;
function setReadAloudBtn(active) {
  const m = $('roomReaderTable'); if (m) m.classList.toggle('karaoke-on', !!active);   // stronger current-line during karaoke
  const b = $('roomReadAloud'); if (!b) return;
  b.textContent = active ? '■' : '▶';
  b.setAttribute('aria-pressed', String(!!active));
  const key = active ? 'room.reader.stopAloud' : 'room.reader.readAloud';
  b.setAttribute('data-i18n-title', key);
  b.title = tt(key, active ? 'Стоп' : 'Читать вслух');
}
function onKaraokeRowChange(idx) {
  if (idx < 0) { karaokeActive = false; setReadAloudBtn(false); return; }   // playback ended → keep last marker
  recordProgress(idx);   // BRR-P2-002 — the read-aloud row is a strong progress signal
  // BRR-P2-005.2 — mark the playing row with the jump-highlight: it's MASKED by the blue
  // .row-playing while audio plays (CSS :not(.row-playing)) and stays as the amber «here you
  // stopped» marker once playback ends (single-row end fires no -1; karaoke end leaves the last).
  highlightReaderRow(idx);
  if (!karaokeActive || karaokeUserScrolled) return;
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + idx + '"]');
  if (tr && tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }
}
function wireKaraokeScrollPause() {
  if (_karaokeScrollWired) return; _karaokeScrollWired = true;
  const pause = () => { if (karaokeActive) karaokeUserScrolled = true; };   // user took over → stop fighting scroll
  window.addEventListener('wheel', pause, { passive: true });
  window.addEventListener('touchmove', pause, { passive: true });
}
function toggleReadAloud() {
  if (!readerAudio) return;
  if (karaokeActive) { try { readerAudio.stop(); } catch (_) {} return; }   // stop() → onRowChange(-1) resets UI
  karaokeActive = true; karaokeUserScrolled = false;
  wireKaraokeScrollPause();
  setReadAloudBtn(true);
  try { readerAudio.playAll(0); } catch (_) { karaokeActive = false; setReadAloudBtn(false); }
}
function stopKaraoke() {
  if (karaokeActive && readerAudio) { try { readerAudio.stop(); } catch (_) {} }
  karaokeActive = false; setReadAloudBtn(false);
}

// BRR-P2-002 «Продолжить чтение» — record the reading position (debounced) and restore
// it on the next open. Position = topmost row at the sticky bar OR the karaoke-playing row.
// All DOM/DB; the in-range decision math lives in the pure window.ReaderProgress (gated).
let _progressTimer = null, _scrollTimer = null, _progressScrollWired = false, _sessionMaxRow = -1;
// BRR-P2-005 — record the FURTHEST row reached this session, never a lower one. Fixes the
// «Продолжить» disappearance: playing row N then closing at scroll-top no longer writes 0.
function recordProgress(idx) {
  if (readerTextId == null || idx == null || idx < 0) return;
  _sessionMaxRow = window.ReaderProgress ? window.ReaderProgress.mergeProgress(_sessionMaxRow, idx) : Math.max(_sessionMaxRow, idx);
  const tid = readerTextId, row = _sessionMaxRow;
  if (_progressTimer) clearTimeout(_progressTimer);
  _progressTimer = setTimeout(() => {
    _progressTimer = null;
    try { localDb.setProgress(tid, { last_row_idx: row }); } catch (_) {}
  }, 800);
}
function readerBarOffset() {
  const bar = $('roomReader') && $('roomReader').querySelector('.reader-bar');
  if (!bar) return 0;
  try { return Math.max(0, bar.getBoundingClientRect().bottom); } catch (_) { return 0; }
}
function currentTopRowIdx() {
  const mount = $('roomReaderTable'); if (!mount || !window.ReaderProgress) return null;
  const trs = mount.querySelectorAll('tr[data-row-idx]');
  if (!trs.length) return null;
  const rows = [];
  for (const tr of trs) {
    const rc = tr.getBoundingClientRect();
    rows.push({ idx: Number(tr.getAttribute('data-row-idx')), top: rc.top, bottom: rc.bottom });
  }
  return window.ReaderProgress.topVisibleRowIdx(rows, readerBarOffset());
}
function wireProgressScroll() {
  if (_progressScrollWired) return; _progressScrollWired = true;
  window.addEventListener('scroll', () => {
    if (readerTextId == null) return;
    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => {
      _scrollTimer = null;
      const idx = currentTopRowIdx();
      if (idx != null) recordProgress(idx);
    }, 600);
  }, { passive: true });
}
function scrollToReaderRow(idx) {
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + idx + '"]');
  if (!tr) return;
  if (tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }
  if (window.ReaderProgress) _sessionMaxRow = window.ReaderProgress.mergeProgress(_sessionMaxRow, idx);   // a jump fixes position
  highlightReaderRow(idx);   // BRR-P2-005 — «ты здесь» jump-highlight (resume / bookmark / FTS)
}

// BRR-P2-005 — unified jump-highlight: tint + leading bar on the row we jumped to, persistent
// until the next genuine user interaction (tap / scroll / key). Distinct hue from playback
// (gold) so «куда я прыгнул» never reads as «что играет».
let _jumpClearFn = null;
function clearRowJump() {
  const m = $('roomReaderTable');
  if (m) m.querySelectorAll('tr.rm-row-jump').forEach((t) => t.classList.remove('rm-row-jump'));
  if (_jumpClearFn) { _jumpClearFn(); _jumpClearFn = null; }
}
function highlightReaderRow(idx) {
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + idx + '"]');
  if (!tr) return;
  clearRowJump();
  tr.classList.add('rm-row-jump');
  const onInteract = () => clearRowJump();
  // Wire the dismiss listeners after a tick so the programmatic smooth-scroll settling doesn't
  // instantly dismiss the highlight.
  const t = setTimeout(() => {
    window.addEventListener('wheel', onInteract, { passive: true, once: true });
    window.addEventListener('touchstart', onInteract, { passive: true, once: true });
    window.addEventListener('keydown', onInteract, { once: true });
    if (mount) mount.addEventListener('click', onInteract, true);
  }, 500);
  _jumpClearFn = () => {
    clearTimeout(t);
    window.removeEventListener('wheel', onInteract);
    window.removeEventListener('touchstart', onInteract);
    window.removeEventListener('keydown', onInteract);
    if (mount) mount.removeEventListener('click', onInteract, true);
  };
}
function clearResumeBanner() { const b = $('readerResume'); if (b && b.remove) b.remove(); }
function showResumeBanner(idx) {
  clearResumeBanner();
  const reader = $('roomReader'), tbl = $('roomReaderTable');
  if (!reader || !tbl) return;
  const bar = el('div', { class: 'reader-resume' }); bar.id = 'readerResume';
  bar.appendChild(el('span', { class: 'reader-resume-msg', text: tt('room.resume.fromRow', 'Вы остановились на строке') + ' ' + (idx + 1) }));
  const go = el('button', { class: 'reader-resume-go', i18n: 'room.resume.continue', text: tt('room.resume.continue', 'Продолжить') });
  go.type = 'button';
  go.addEventListener('click', () => { scrollToReaderRow(idx); clearResumeBanner(); });
  const x = el('button', { class: 'reader-resume-x', text: '✕', attrs: { 'aria-label': tt('room.resume.toStart', 'Читать с начала') } });
  x.type = 'button';
  x.title = tt('room.resume.toStart', 'Читать с начала');
  x.addEventListener('click', clearResumeBanner);
  bar.appendChild(go); bar.appendChild(x);
  reader.insertBefore(bar, tbl);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
// After a fresh open: offer (or, for an explicit «Продолжить» tap, perform) the resume.
async function restoreReaderPosition(textId, opts) {
  if (!window.ReaderProgress) return;
  let prog = null;
  try { prog = await localDb.getProgress(textId); } catch (_) { prog = null; }
  if (readerTextId !== textId) return;            // navigated away while awaiting
  const target = window.ReaderProgress.resumeTarget(prog, readerRows.length);
  if (target == null) return;
  if (opts && opts.resume) scrollToReaderRow(target);   // explicit continue-card tap → jump
  else showResumeBanner(target);                        // normal open → non-jumping affordance (R4)
}

// BRR-P2-003 — passage bookmarks. A ☆/★ control is injected per row POST-render on the
// Room mount (the parity-locked reader-core builder is never touched). Bookmarks are keyed
// by sentence_id; the snippet (plain he · ru) is denormalised so the shelf + search are body-free.
async function loadBookmarkSet() {
  _bookmarkSet = new Set();
  if (readerTextId == null) return _bookmarkSet;
  try {
    const rows = await localDb.listBookmarks(readerTextId);
    for (const b of rows) if (b.sentence_id) _bookmarkSet.add(String(b.sentence_id));
  } catch (_) {}
  return _bookmarkSet;
}
async function attachBookmarks(mount) {
  if (!mount) return;
  const set = await loadBookmarkSet();
  if (!mount.isConnected) return;
  mount.querySelectorAll('tr[data-row-idx]').forEach((tr) => {
    const idx = Number(tr.getAttribute('data-row-idx'));
    const row = readerRows[idx];
    if (!row || !row._v3_sentenceId) return;
    const cell = tr.querySelector('.col-action-cell');
    if (!cell || cell.querySelector('.row-bookmark-btn')) return;
    const on = set.has(String(row._v3_sentenceId));
    const btn = el('button', {
      class: 'row-bookmark-btn' + (on ? ' bookmarked' : ''),
      text: on ? '★' : '☆',
      attrs: {
        type: 'button', 'data-row-idx': String(idx), 'aria-pressed': String(on),
        title: tt(on ? 'room.bookmark.remove' : 'room.bookmark.add', on ? 'Убрать закладку' : 'Закладка'),
        'aria-label': tt('room.bookmark.add', 'Закладка'),
      },
    });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleBookmark(idx, btn); });
    const wrap = el('div', { class: 'col-action-row col-action-row-bm' });
    wrap.appendChild(btn);
    cell.appendChild(wrap);
  });
}
async function toggleBookmark(idx, btn) {
  const row = readerRows[idx];
  if (!row || !row._v3_sentenceId || readerTextId == null) return;
  const sid = String(row._v3_sentenceId);
  const on = btn.classList.contains('bookmarked');
  const setOn = (state) => {
    btn.classList.toggle('bookmarked', state);
    btn.textContent = state ? '★' : '☆';
    btn.setAttribute('aria-pressed', String(state));
    btn.title = tt(state ? 'room.bookmark.remove' : 'room.bookmark.add', state ? 'Убрать закладку' : 'Закладка');
  };
  try {
    if (on) {
      await localDb.removeBookmark(readerTextId, sid);
      if (_bookmarkSet) _bookmarkSet.delete(sid);
      setOn(false);
    } else {
      const he = row.he || row.he_niqqud || '', ru = row.ru || '';
      const snippet = (he + (ru ? ' · ' + ru : '')).trim().slice(0, 200);
      await localDb.addBookmark({
        text_id: readerTextId, text_key: readerTextKey, sentence_id: sid,
        order_index: row._v3_orderIndex != null ? row._v3_orderIndex : idx,
        title: readerTextTitle, snippet,
      });
      if (_bookmarkSet) _bookmarkSet.add(sid);
      setOn(true);
      roomToast(tt('room.bookmark.added', 'Закладка добавлена'));
    }
  } catch (_) {}
}

// BRR-P1-006 D2 — progressive translation reveal (active recall). In 'reveal' mode the ru cells
// start blurred (.ru-veiled); a capture-phase tap reveals that row (.ru-revealed). Per-row state is
// DOM-only (resets on rerender/new text — fine for v1; the MODE itself persists). The handler runs
// in capture so it pre-empts reader-core's row-audio delegate (ru is also excluded from audio above).
let revealHandler = null;
function applyReveal(mount) {
  if (!mount) return;
  if (revealHandler) { try { mount.removeEventListener('click', revealHandler, true); } catch (_) {} revealHandler = null; }
  const ruCells = mount.querySelectorAll('#proTable tbody td[data-col="ru"]');
  const on = readerCfg.ruMode === 'reveal';
  ruCells.forEach((td) => { if (on) td.classList.add('ru-veiled'); else td.classList.remove('ru-veiled', 'ru-revealed'); });
  if (!on) return;
  revealHandler = (e) => {
    const td = e.target && e.target.closest ? e.target.closest('td[data-col="ru"]') : null;
    if (td && mount.contains(td)) { e.preventDefault(); e.stopPropagation(); td.classList.toggle('ru-revealed'); }
  };
  mount.addEventListener('click', revealHandler, true);
}

// Attach the light morphology-on-tap layer (reader-morph.js): wraps he/niqqud words
// into tappable spans (post-render, parity-safe — the reader-core builder is untouched)
// → a tap shows a light root/binyan/POS/gloss card with honest provenance. The 3.3 MB
// offline Pealim dataset loads lazily on the FIRST tap, never at text-open.
function attachReaderMorph(mount) {
  if (!mount || !window.ReaderMorph) return;
  if (readerMorph) { try { readerMorph.detach(); } catch (_) {} readerMorph = null; }
  _ctxCache = new Map();   // fresh per (re)attach
  const opts = { getRow: (i) => readerRows[i], saveWord: roomSaveWord, lookupNote: roomLookupNote };
  if (contextModeEnabled()) opts.contextProvider = makeContextProvider();   // Tier-3 opt-in
  try { readerMorph = window.ReaderMorph.attach(mount, opts); } catch (_) {}
  applyDecorations();   // colour (P1-009) + adaptive niqqud fade (P1-006) in one pass
}

function readerStateBox(i18nKey, icon) {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.innerHTML = '';
  const box = el('div', { class: 'room-state' });
  if (icon) box.appendChild(el('span', { class: 'room-state-icon', text: icon }));
  box.appendChild(el('span', { i18n: i18nKey, text: tt(i18nKey) }));
  mount.appendChild(box);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

function rerenderReader() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.innerHTML = readerCore.buildBilingualTableHtml(readerRows, readerConfig());
  attachReaderAudio();
}

function buildAidsPanel() {
  const panel = $('readerAids');
  if (!panel) return;
  panel.innerHTML = '';
  // labeled <select> helper — opts = [[value, i18nKey, fallback]]; onChange(value). Mode changes
  // persist (saveReaderCfg) and rerender the table (column visibility + fresh fade/reveal).
  const addSelect = (labelKey, labelFallback, opts, current, onChange) => {
    const lab = el('label');
    lab.appendChild(el('span', { i18n: labelKey, text: tt(labelKey, labelFallback) }));
    const sel = el('select', { attrs: { 'aria-label': tt(labelKey, labelFallback) } });
    opts.forEach(([v, k, fb]) => {
      const o = el('option', { i18n: k, text: tt(k, fb), attrs: { value: v } });
      if (v === current) o.setAttribute('selected', '');
      sel.appendChild(o);
    });
    sel.addEventListener('change', (e) => onChange(e.target.value));
    lab.appendChild(sel);
    panel.appendChild(lab);
  };
  // plain checkbox helper (NOT .reader-aids-status — that class marks the status/context toggles).
  const addCheck = (key, fallback, checked, onChange) => {
    const lab = el('label');
    const cb = el('input', { attrs: { type: 'checkbox' } });
    cb.checked = !!checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    lab.appendChild(cb);
    lab.appendChild(el('span', { i18n: key, text: tt(key, fallback) }));
    panel.appendChild(lab);
  };
  // Иврит (he-plain column) on/off — so a learner can read translit/niqqud only, or hide the consonantal column.
  addCheck('room.reader.colHe', 'Иврит', readerCfg.heOn, (v) => { readerCfg.heOn = v; saveReaderCfg(); rerenderReader(); });
  // BRR-P1-006 — Огласовка: всегда / по нужде / выкл (adaptive = fade on words you already know).
  addSelect('room.reader.niqqudMode', 'Огласовка', [
    ['full', 'room.reader.niqqudFull', 'всегда'],
    ['adaptive', 'room.reader.niqqudAdaptive', 'по нужде'],
    ['off', 'room.reader.niqqudOff', 'выкл'],
  ], readerCfg.niqqudMode, (v) => { readerCfg.niqqudMode = v; saveReaderCfg(); rerenderReader(); });
  // Транслит — профиль (SBL / Рус) + вкл/выкл.
  addSelect('room.reader.translit', 'Транслит', [
    ['sbl', 'room.reader.profileSbl', 'SBL'],
    ['ru-phonetic', 'room.reader.profileRu', 'Рус'],
  ], readerCfg.translitProfile, (v) => { readerCfg.translitProfile = v; saveReaderCfg(); rerenderReader(); });
  const tLab = el('label');   // plain label (NOT .reader-aids-status — that marks the status/context toggles)
  const tCb = el('input', { attrs: { type: 'checkbox' } });
  tCb.checked = !!readerCfg.translitOn;
  tCb.addEventListener('change', () => { readerCfg.translitOn = tCb.checked; saveReaderCfg(); rerenderReader(); });
  tLab.appendChild(tCb);
  tLab.appendChild(el('span', { i18n: 'room.reader.colTranslit', text: tt('room.reader.colTranslit', 'Транслит') }));
  panel.appendChild(tLab);
  // BRR-P1-006 — Перевод: показан / по тапу / выкл (reveal = active recall).
  addSelect('room.reader.ruMode', 'Перевод', [
    ['show', 'room.reader.ruShow', 'показан'],
    ['reveal', 'room.reader.ruReveal', 'по тапу'],
    ['off', 'room.reader.ruOff', 'выкл'],
  ], readerCfg.ruMode, (v) => { readerCfg.ruMode = v; saveReaderCfg(); rerenderReader(); });
  // BRR-P1-009 — word-status colouring toggle (opt-in; warms the morph engine on enable).
  const statusHint = tt('room.morph.statusHint', 'Подсвечивает слова по твоему статусу: зелёный — знаешь, оранжевый — учишь, синий — новое. Только уверенно распознанные слова.');
  const wsLab = el('label', { class: 'reader-aids-status', attrs: { title: statusHint } });
  const wsCb = el('input', { attrs: { type: 'checkbox' } });
  wsCb.checked = wordStatusEnabled();
  wsCb.addEventListener('change', () => { wordStatusSet(wsCb.checked); applyDecorations(); });
  wsLab.appendChild(wsCb);
  wsLab.appendChild(el('span', { i18n: 'room.morph.statusToggle', text: tt('room.morph.statusToggle', '🎨 Статус слов') }));
  wsLab.appendChild(el('span', { class: 'reader-aids-info', attrs: { title: statusHint, 'aria-hidden': 'true' }, text: 'ⓘ' }));
  panel.appendChild(wsLab);
  // R8 on-ramp — one short line teaching the two fading aids.
  panel.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.reader.scaffoldHint', text: tt('room.reader.scaffoldHint', '«По нужде»: огласовка тает на знакомых словах. «По тапу»: перевод скрыт — тапни строку, чтобы открыть.') }));
  // Tier-3 — «точный режим» (context disambiguation via Dicta; opt-in, online). On tap, the
  // sentence is sent to Dicta to pick the contextually-correct homograph. Honest outbound label.
  const cmLab = el('label', { class: 'reader-aids-status' });
  const cmCb = el('input', { attrs: { type: 'checkbox' } });
  cmCb.checked = contextModeEnabled();
  cmCb.addEventListener('change', () => {
    contextModeSet(cmCb.checked);
    const m = $('roomReaderTable'); if (m) attachReaderMorph(m);   // re-wire with/without provider
  });
  cmLab.appendChild(cmCb);
  cmLab.appendChild(el('span', { i18n: 'room.morph.contextToggle', text: tt('room.morph.contextToggle', '🎯 Точный режим (Dicta)') }));
  panel.appendChild(cmLab);
  panel.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.morph.contextHint', text: tt('room.morph.contextHint', 'Отправляет предложение в Dicta для точного значения в контексте. Машинный разбор, не носитель.') }));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

async function openReader(textId, title, opts) {
  const reader = $('roomReader'), content = $('roomContent');
  if (!reader) return;
  if (content) content.hidden = true;
  reader.hidden = false;
  clearResumeBanner(); clearRowJump();   // BRR-P2-002/005 — never carry a stale banner/jump across opens
  _sessionMaxRow = -1;                  // BRR-P2-005 — furthest-row tracker resets per open
  readerTextId = textId != null ? String(textId) : null;
  const titleEl = $('readerTitle');
  if (titleEl) {
    titleEl.textContent = title || '';
    if (HEBREW_RE.test(title || '')) titleEl.setAttribute('dir', 'rtl'); else titleEl.removeAttribute('dir');
  }
  try { window.scrollTo(0, 0); } catch (_) {}
  const mount = $('roomReaderTable');
  const res = await readerCore.openText(textId, {
    localDb, mount, config: readerConfig(),
    onState: (s) => {
      if (s.kind === 'loading') readerStateBox('room.state.loading', '⏳');
      else if (s.kind === 'dbBusy') readerStateBox('room.state.dbBusy', '📑');
      else if (s.kind === 'notFound' || s.kind === 'error') readerStateBox('room.state.error', '⚠️');
      else if (s.kind === 'empty') readerStateBox('room.reader.empty', '📄');
      // 'ready' → table already painted by openText
    },
  });
  readerRows = res && res.ok ? res.rows : [];
  readerTextTitle = title || (res && res.text && res.text.title) || '';
  readerTextKey = (res && res.text && res.text.text_key) || null;
  if (res && res.ok) {
    attachReaderAudio();
    try { localDb.touchOpened(textId); } catch (_) {}    // recency for the Continue shelf
    wireProgressScroll();
    if (opts && opts.ftsQuery) jumpToFtsMatch(opts.ftsQuery);                     // BRR-P2-005 — FTS hit → matched row
    else if (opts && opts.scrollToSentence) scrollToSentence(opts.scrollToSentence);   // open a bookmark at its row
    else restoreReaderPosition(readerTextId, opts);      // offer/perform resume (R4 reliability)
  }
}

// Jump to the row carrying a given sentence_id (robust to order_index gaps) — used when
// opening a bookmark. Falls back silently if the row is absent.
function scrollToSentence(sid) {
  sid = String(sid);
  const idx = readerRows.findIndex((r) => r && String(r._v3_sentenceId) === sid);
  if (idx >= 0) scrollToReaderRow(idx);
}

// BRR-P2-005/006 — open an FTS hit AT the matched line. For a multi-word query, prefer the row
// carrying the whole PHRASE (consecutive query tokens, firstPhraseRow); fall back to the first row
// containing any query token (firstMatchRow); fall back to normal resume if none is located.
function jumpToFtsMatch(q) {
  let idx = -1;
  try {
    const C = window.CorpusFTS;
    if (C) {
      if (C.firstPhraseRow) idx = C.firstPhraseRow(readerRows, q);
      if (idx < 0 && C.firstMatchRow) idx = C.firstMatchRow(readerRows, q);
    }
  } catch (_) { idx = -1; }
  if (idx >= 0) scrollToReaderRow(idx);
  else restoreReaderPosition(readerTextId, {});
}

async function closeReader() {
  // BRR-P2-002 — flush the current position synchronously BEFORE hiding (the 800ms debounce
  // may not have fired if Back is tapped quickly). Read the top-visible row while the table is
  // still laid out, persist it, then stop recording.
  const tid = readerTextId;
  if (_progressTimer) { clearTimeout(_progressTimer); _progressTimer = null; }
  if (tid != null) {
    // BRR-P2-005 — flush the FURTHEST row reached (max of session-max + current top), NEVER a
    // lower value, and only if > 0. This is the «Продолжить» disappearance fix: playing a row
    // then closing at scroll-top no longer overwrites the position with 0.
    const top = currentTopRowIdx();
    const idx = window.ReaderProgress ? window.ReaderProgress.mergeProgress(_sessionMaxRow, top == null ? -1 : top) : Math.max(_sessionMaxRow, top == null ? -1 : top);
    if (idx > 0) { try { await localDb.setProgress(tid, { last_row_idx: idx }); } catch (_) {} }
  }
  if (readerAudio) { try { readerAudio.detach(); } catch (_) {} readerAudio = null; }
  if (readerMorph) { try { readerMorph.detach(); } catch (_) {} readerMorph = null; }
  karaokeActive = false; setReadAloudBtn(false);   // BRR-P1-008 — reset karaoke on close
  clearResumeBanner(); clearRowJump(); _sessionMaxRow = -1; readerTextId = null;   // BRR-P2-002/005 — stop recording after close
  _bookmarkSet = null; readerTextTitle = ''; readerTextKey = null;   // BRR-P2-003 — reset bookmark state
  const rm = $('roomReaderTable');
  if (rm && revealHandler) { try { rm.removeEventListener('click', revealHandler, true); } catch (_) {} revealHandler = null; }
  const reader = $('roomReader'), content = $('roomContent');
  if (reader) reader.hidden = true;
  if (content) content.hidden = false;
  // Surface the just-read text in «Продолжить чтение» (corpus home only; results / other tabs untouched).
  if (tid != null && activeTrack === 'corpus' && corpusNav.level === 'home' && !corpusFilterActive()) {
    try { corpusRefreshL1Body(); } catch (_) {}
  }
}

// Resolve a stable text_key → the ephemeral local OPFS id (importBundle remaps ids on
// import, so discovery keys on text_key and the reader opens by local id).
async function resolveLocalIdByKey(textKey) {
  try {
    const rows = await localDb.dbQuery('SELECT id FROM texts WHERE text_key = ?', [textKey]);
    return rows && rows[0] ? rows[0].id : null;
  } catch (_) { return null; }
}

// BRR-P0-007 Проход-3 — open a corpus work served-on-open: resolve it in OPFS, and if
// absent, fetch its per-work JSON, importBundle it (mode:'skip' — idempotent), then open
// the warm reader by local id. The work file is fetched with ?v=<catalogVersion> so a
// re-published catalog cache-busts the immutable work payloads.
async function openCorpusWork(card, openOpts) {
  if (!card || corpusImporting) return;
  const reader = $('roomReader'), content = $('roomContent');
  if (content) content.hidden = true;
  if (reader) reader.hidden = false;
  const titleEl = $('readerTitle');
  if (titleEl) {
    titleEl.textContent = card.title || '';
    if (HEBREW_RE.test(card.title || '')) titleEl.setAttribute('dir', 'rtl'); else titleEl.removeAttribute('dir');
  }
  try { window.scrollTo(0, 0); } catch (_) {}
  readerStateBox('room.state.loading', '⏳');
  corpusImporting = true;
  try {
    let localId = await resolveLocalIdByKey(card.text_key);
    if (!localId) {
      const url = '/data/benyehuda/' + card.file + '?v=' + CORPUS_CATALOG_VERSION;
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('fetch ' + res.status);
      const bundle = await res.json(); // { library: { texts:[…], shelves:[], audio_assets:[] } }
      if (!bundle || !bundle.library) throw new Error('malformed work payload');
      await localDb.importBundle(bundle, { mode: 'skip' });
      localId = await resolveLocalIdByKey(card.text_key);
    }
    if (!localId) throw new Error('work not resolvable after import');
    await openReader(localId, card.title, openOpts);
  } catch (e) {
    try { console.warn('[room] open corpus work failed:', e); } catch (_) {}
    readerStateBox('room.state.error', '⚠️');
  } finally {
    corpusImporting = false;
  }
}

// BRR-P0-004 — ship-as-asset: the curated canon ships as a precomputed bundle in
// public/data/benyehuda/ and is auto-imported into OPFS on the first Reading Room
// visit (then it's fully offline). Idempotent: skipped if the canon shelves already
// exist (OPFS truth) — import uses mode:'skip' so a re-run is a no-op anyway.
// canon-v2: now includes chaptered works as their own shelves (by-work-*). Versioned
// filename because /data/** is immutable-cached. The sentinel is a v2-ONLY shelf
// (by-work-95 = the 17-chapter «מהתחלה») so a v1-importer re-imports v2 (mode:'skip'
// dedups unchanged works by text_key; adds the new chapter texts + work-shelves).
// canon-v3 (BRR-P0-007): adds pre-baked WaveNet he-IL audio — every row carries an
// audio_asset_key whose MP3 lives in prod's audio cache, so reader-core tier-1
// streams it KEYLESS (replacing best-effort browser-speech). Same 79 texts/shelves
// as v2 → reconcile finds no orphans; the bump just publishes the audio links.
const CANON_BUNDLE_URL = '/data/benyehuda/canon-v4.zip';
const CANON_FLAG = 'benyehuda_canon_v4_imported';
// BRR-P0-008 — the canon edition this shipped bundle publishes. Bump in lockstep
// with the producer's --canon-version when shipping a new canon-vN.zip. The import
// is OPFS-truth + version-gated: re-import only when the user is BELOW this version
// (the importBundle reconcile then drops orphans from the prior edition).
const CANON_BUNDLE_VERSION = 4;   // BRR-P1-008b canon refresh: bump → stale devices re-import + reconcileAudioLinks re-points default audio to current keys (fixes word-timing 404)
const CANON_VERSION_KEY = 'benyehuda_canon_version';

async function autoImportCanon() {
  try {
    // Opt-out for tests/embedders (room-smoke checks Room structure, not the canon
    // publish): ?canon=skip disables the shipped-bundle auto-import.
    let canonParam = '';
    try { canonParam = new URLSearchParams(location.search).get('canon') || ''; } catch (_) {}
    if (canonParam === 'skip') return false;
    // BRR-P1-008b — ?canon=refresh forces a re-import even when up-to-date, so a stale device
    // (old default audio links → word-timing 404) can be re-aligned on demand via reconcileAudioLinks.
    const forceRefresh = canonParam === 'refresh';
    // OPFS truth: the highest canon_version among existing canon shelves. If the user
    // already has this edition (or newer), nothing to fetch. Legacy v1 shelves have
    // canon_version=null → haveVer 0 → they re-import v2 (reconcile cleans v1 orphans).
    let existing = [];
    try { existing = await localDb.getShelves(); } catch (_) {}
    let haveVer = (existing || []).reduce((m, s) => Math.max(m, (s && Number(s.canon_version)) || 0), 0);
    // Legacy fallback: the unstamped v2 bundle (shipped before P0-008) has
    // canon_version=null but DOES carry the v2-only work-shelf `by-work-95`. Treat
    // its presence as v2 so those already-published users are NOT re-imported every
    // visit — they're superseded normally by the next stamped edition (v>2).
    if (haveVer === 0 && (existing || []).some((s) => s && s.slug === 'by-work-95')) haveVer = 2;
    if (!forceRefresh && haveVer >= CANON_BUNDLE_VERSION) {
      try { localStorage.setItem(CANON_VERSION_KEY, String(haveVer)); localStorage.setItem(CANON_FLAG, '1'); } catch (_) {}
      return false;
    }
    if (typeof window.JSZip === 'undefined') { try { console.warn('[room] JSZip unavailable — skip canon auto-import'); } catch (_) {} return false; }
    showState('room.state.publishing', '📥');
    const res = await fetch(CANON_BUNDLE_URL, { cache: 'force-cache' });
    if (!res.ok) throw new Error('fetch ' + res.status);
    const zip = await window.JSZip.loadAsync(await res.arrayBuffer());
    const libFile = zip.file('library/library.json') || zip.file('library.json');
    if (!libFile) throw new Error('no library.json in canon bundle');
    const library = JSON.parse(await libFile.async('string'));
    // library.canon_version triggers the import-side dedup reconcile (orphans from a
    // prior edition removed; user content untouched).
    const result = await localDb.importBundle({ library }, { mode: 'skip' });
    // BRR-P0-007 — attach the pre-baked audio. importBundle links audio INLINE
    // (within its batched transaction) for every freshly-imported text, so a
    // fresh install needs nothing more. Only an UPGRADING user — whose existing
    // canon texts are mode:'skip' skipped (no inline linking) — needs the
    // backfill. Gate on result.skipped so a fresh install doesn't re-check 6.6K
    // already-present links (~70s of wasted "publishing" time).
    if (result && Number(result.skipped) > 0 && typeof localDb.reconcileAudioLinks === 'function') {
      try {
        const al = await localDb.reconcileAudioLinks({ library });
        try { console.log('[room] canon audio backfill →', JSON.stringify({ created: al && al.linksCreated, already: al && al.linksAlready, matched: al && al.textsMatched })); } catch (_) {}
      } catch (e) { try { console.warn('[room] reconcileAudioLinks failed (non-fatal):', e && e.message); } catch (_) {} }
    }
    try { localStorage.setItem(CANON_VERSION_KEY, String(CANON_BUNDLE_VERSION)); localStorage.setItem(CANON_FLAG, '1'); } catch (_) {}
    try { console.log('[room] canon published →', JSON.stringify({ imported: result && result.imported, skipped: result && result.skipped, reconciled: result && result.reconciled })); } catch (_) {}
    return true;
  } catch (e) {
    // Honest non-fatal: first visit needs network to fetch the shipped shelf; on
    // failure the Room shows its empty-state and retries on the next online visit.
    try { console.warn('[room] canon auto-import failed (will retry next visit):', e); } catch (_) {}
    return false;
  }
}

async function loadData() {
  const shelves = await localDb.getShelves();
  shelvesByTrack = { accessible: [], literary: [], corpus: [] };
  for (const sh of shelves) {
    if (shelvesByTrack[sh.track]) shelvesByTrack[sh.track].push(sh);
  }
  // Resolve members (text_key -> {id, title, corpus}) via the shared query escape
  // hatch. corpus rides source_meta_json.corpus (the canonical OPFS home, per
  // db/premium/corpusMeta.js) — parsed here for the P0-005 provenance badges.
  textByKey = new Map();
  try {
    const rows = await localDb.dbQuery('SELECT id, text_key, title, source_meta_json FROM texts');
    for (const r of (rows || [])) {
      if (!r || !r.text_key) continue;
      let corpus = null;
      try { const sm = r.source_meta_json ? JSON.parse(r.source_meta_json) : null; if (sm && sm.corpus) corpus = sm.corpus; } catch (_) {}
      textByKey.set(String(r.text_key), { id: r.id, title: r.title, corpus });
    }
  } catch (e) { try { console.warn('[room] text resolution failed:', e); } catch (_) {} }
}

// BRR-P1-015 A3 — load the THIN root (era taxonomy + manifest map only; no bodies, no
// author index). This is the only corpus file fetched at boot (precached); the sidecar +
// manifests load lazily on demand. Non-fatal: on failure the Корпус tab stays hidden and
// the curated canon is unaffected.
async function loadCorpusCatalog() {
  try {
    // Opt-out for structural smokes (?corpus=skip), independent of ?canon=skip.
    try { if (new URLSearchParams(location.search).get('corpus') === 'skip') return; } catch (_) {}
    const res = await fetch(CORPUS_ROOT_URL, { cache: 'force-cache' });
    if (!res.ok) return;
    const root = await res.json();
    if (!root || !Array.isArray(root.era_taxonomy)) return;
    corpusRoot = root;
    const tab = $('tabCorpus');
    const hasCorpus = (root.counts && root.counts.works) > 0;
    if (tab) tab.hidden = !hasCorpus;
    // BRR-P2-006a — warm the always-needed FTS layer (manifest + lemma + lemmamap, ~6.5MB) in IDLE
    // so the first corpus search doesn't wait on it (owner choice: warm on Room load). Gated on the
    // corpus being present; requestIdleCallback (setTimeout fallback for iOS Safari) keeps it off the
    // critical path. The letter/prefix shards stay lazy (warmed per query by warmQuery).
    if (hasCorpus && window.CorpusFTS && window.CorpusFTS.warm) {
      const _warm = () => { try { ensureFtsConfigured(); window.CorpusFTS.warm(); } catch (_) {} };
      (window.requestIdleCallback || function (cb) { return setTimeout(cb, 1200); })(_warm);
    }
  } catch (e) { try { console.warn('[room] corpus root load failed (non-fatal):', e); } catch (_) {} }
}

// Lazy sidecar (author index + ready rail + facet histograms) — fetched once, on the first
// Корпус render. ~160KB (≈35KB gz over br) → it replaces parsing the 10MB of manifests for
// L1/L2; NEVER precached (D5). Single-flight so concurrent renders share one request.
async function loadCorpusIndex() {
  if (corpusIndex) return corpusIndex;
  if (corpusIndexLoading) return corpusIndexLoading;
  const file = (corpusRoot && corpusRoot.index_file) || 'corpus-index-v3.json';
  corpusIndexLoading = (async () => {
    const res = await fetch('/data/benyehuda/' + file + '?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
    if (!res.ok) throw new Error('corpus index ' + res.status);
    const json = await res.json();
    corpusIndex = json;
    return json;
  })();
  try { return await corpusIndexLoading; } finally { corpusIndexLoading = null; }
}

// Resolve the manifest file for an era+block from the root map (single-file era → block null).
function corpusManifestFile(era, block) {
  const ms = (corpusRoot && corpusRoot.manifests) || [];
  const m = ms.find((x) => x.era === era && x.block === (block == null ? null : block));
  return m ? m.file : null;
}
// Fetch + cache a manifest block's works[] (a deliberate per-author drill; immutable-cached).
async function fetchCorpusManifest(file) {
  if (corpusManifestCache.has(file)) return corpusManifestCache.get(file);
  const res = await fetch('/data/benyehuda/' + file + '?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
  if (!res.ok) throw new Error('manifest ' + res.status);
  const json = await res.json();
  const works = Array.isArray(json.works) ? json.works : [];
  corpusManifestCache.set(file, works);
  return works;
}

// A3 Slice 2 — lazy global search/facet index (single-flight). Titles are niqqud-normalized
// ONCE on load (`_n`); the query is normalized the same way at match time.
async function loadCorpusSearch() {
  if (corpusSearch) return corpusSearch;
  if (corpusSearchLoading) return corpusSearchLoading;
  const file = (corpusRoot && corpusRoot.search_file) || 'corpus-search-v3.json';
  corpusSearchLoading = (async () => {
    const res = await fetch('/data/benyehuda/' + file + '?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
    if (!res.ok) throw new Error('corpus search ' + res.status);
    const rows = await res.json();
    for (const r of rows) r._n = corpusNrm(r.t);
    corpusSearch = rows;
    return rows;
  })();
  try { return await corpusSearchLoading; } finally { corpusSearchLoading = null; }
}

// BRR-P1-007 S2 — lazy per-work vocab sidecar (single-flight). Loaded on FIRST i+1 need
// (NOT precached) — same budget discipline as corpus-search. The engine (window.CorpusVocab)
// computes coverage CLIENT-SIDE against the live profile; the sidecar ships ingredients,
// never a frozen %. CORPUS_VOCAB_DATA_REV busts force-cache when the sidecar CONTENT changes
// WITHIN a catalog version (e.g. S3 added per-work `ez`) — the catalog `?v=` alone would serve
// a stale immutable copy. BUMP it whenever build-corpus-vocab emits a new field/shape.
async function loadCorpusVocab() {
  if (corpusVocab) return corpusVocab;
  if (corpusVocabLoading) return corpusVocabLoading;
  if (!window.CorpusVocab) return null;
  const url = '/data/benyehuda/corpus-vocab-v' + CORPUS_CATALOG_VERSION + '.json?v=' + CORPUS_CATALOG_VERSION + '.' + CORPUS_VOCAB_DATA_REV;
  corpusVocabLoading = (async () => {
    corpusVocab = await window.CorpusVocab.ensureVocab({ version: CORPUS_CATALOG_VERSION, url: url });
    return corpusVocab;
  })();
  try { return await corpusVocabLoading; } catch (_) { return null; } finally { corpusVocabLoading = null; }
}

// Two-channel i+1 coverage for a work id against the LIVE reader profile, or null when the
// sidecar lacks the work (unbaked / not-yet-profiled) or the engine is absent. Honest empty,
// never a fabricated number. Consumed by S3/S4 badges+rails (exposed on window for those + verify).
async function roomVocabCoverageFor(id) {
  const v = await loadCorpusVocab();
  if (!v || !v.works || !v.works[String(id)]) return null;
  const states = await ensureWordStates();
  return window.CorpusVocab.coverageForWork(v.works[String(id)], v.dict, states || {});
}
if (typeof window !== 'undefined') {
  window.CorpusVocabRoom = { ensure: loadCorpusVocab, coverageFor: roomVocabCoverageFor };
}

// S3 — progressive coverage badge on a rendered corpus card. Fire-and-forget (does not
// block render). HONEST: shows a % ONLY when the reader has a real profile overlap with
// this work (knownDistinct>0) — a 0% against an empty known-set is a lie, so absent ⇒ no
// badge (matches DESIGN D3/R4). The % is a SOFT estimate («≈ по твоим словам»), zone-coloured
// (in 80–95% = sweet spot · easy ≥95% · hard <80%); the load flag «много имён/архаики» fires
// when proper-noun/archaic share is high (the two-channel honesty, DESIGN D2). Ready cards only
// (unbaked works are absent from the sidecar → coverageFor returns null → no badge).
// Compute coverage badges LAZILY — only when a card scrolls near the viewport. A corpus rail
// holds up to ~796 cards but shows ~4 at once; computing all eagerly fanned getKnownWordStates
// out across every card (the S3 regression that jammed text-open). The observer keeps it to the
// handful actually visible. Eager fallback where IntersectionObserver is unavailable.
let _covObserver = null;
function getCovObserver() {
  if (_covObserver !== null) return _covObserver;
  _covObserver = (typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries, obs) => {
        for (const e of entries) if (e.isIntersecting) { obs.unobserve(e.target); enhanceCardWithCoverage(e.target, e.target.__covCard); }
      }, { rootMargin: '300px' })
    : false;
  return _covObserver;
}
function observeCardCoverage(node, card) {
  if (!node || card == null || card.id == null || !window.CorpusVocabRoom) return;
  const obs = getCovObserver();
  if (!obs) { enhanceCardWithCoverage(node, card); return; }
  node.__covCard = card;
  obs.observe(node);
}
function enhanceCardWithCoverage(node, card) {
  if (!node || !card || card.id == null || !window.CorpusVocabRoom) return;
  roomVocabCoverageFor(card.id).then((cov) => {
    if (!cov || cov.knownDistinct === 0) return;
    const meta = node.querySelector('.work-card-meta');
    if (!meta || meta.querySelector('.coverage-badge')) return;
    const pct = Math.round(cov.matchedDrillCov * 100);
    const b = el('span', { class: 'prov-badge coverage-badge coverage-' + cov.zone, text: '≈' + pct + '%' });
    b.title = tt('room.corpus.cov.estimate', 'Оценка знакомых слов по твоим заметкам');
    meta.appendChild(b);
    if (cov.loadFlag) {
      meta.appendChild(el('span', { class: 'prov-badge coverage-load', i18n: 'room.corpus.cov.load', text: tt('room.corpus.cov.load', 'много имён/архаики') }));
    }
  }).catch(() => {});
}

// Build a corpus shelf section (reused by the personal rail + the cold-start rail).
function buildRailSection(cssClass, meta, cards) {
  if (!cards || !cards.length) return null;
  const sec = el('section', { class: 'shelf ' + cssClass });
  const head = el('div', { class: 'shelf-head' });
  const h = el('h2', { class: 'shelf-title' });
  h.textContent = meta.emoji + ' ' + tt(meta.titleKey, meta.titleFallback);
  head.appendChild(h);
  head.appendChild(el('p', { class: 'shelf-intro', i18n: meta.introKey, text: tt(meta.introKey, meta.introFallback) }));
  sec.appendChild(head);
  const rail = el('div', { class: 'shelf-rail' });
  for (const c of cards) rail.appendChild(renderCorpusCard(c));
  sec.appendChild(rail);
  return sec;
}

// S3 — cold-start «С чего начать» rail (profile-FREE): the most accessible ready works by the
// sidecar's intrinsic easiness score (ez). Author-diversity capped. No % badge — absolute
// «короткий · частотная лексика» cues, honest for empty profiles.
function buildColdStartSection(v) {
  const ready = (corpusIndex && corpusIndex.ready) || [];
  const scored = ready
    .map((c) => ({ c: c, ez: (v.works[String(c.id)] || {}).ez || 0 }))
    .filter((x) => x.ez > 0).sort((a, b) => b.ez - a.ez);
  const perAuthor = {}, pick = [];
  for (const x of scored) {
    const a = x.c.author || '?';
    if ((perAuthor[a] || 0) >= 2) continue;
    perAuthor[a] = (perAuthor[a] || 0) + 1; pick.push(x.c);
    if (pick.length >= 12) break;
  }
  return buildRailSection('corpus-coldstart', {
    emoji: '🌱', titleKey: 'room.corpus.coldStartTitle', titleFallback: 'С чего начать',
    introKey: 'room.corpus.coldStartIntro', introFallback: 'Короткие тексты с частотной лексикой — лёгкий вход в иврит.',
  }, pick);
}

// S4 — corpus L1 rail coordinator: ONE rail at the top, chosen by the reader's profile.
// Loads the vocab sidecar + the profile states ONCE (single-flight — NOT a per-card query;
// the S3 stampede lesson [[feedback-test-with-nonempty-profile]]), scores every ready work
// SYNCHRONOUSLY (coverageForWork is pure), and lets the pure engine pickPersonalRail decide:
//   • «🎯 Следующий для тебя» — works in your 80–95% i+1 zone (≥MIN, gentlest first); OR
//   • «🔥 Следующий вызов» — you've outgrown the zone → the closest tractable stretch; OR
//   • neither (too-new) → «🌱 С чего начать» cold-start owns L1.
// When a personal rail shows, the cold-start rail RECEDES (DESIGN D3: Rail-2 fades as Rail-1
// fills). Re-render-guarded; fully try/caught (a rail failure never breaks L1).
// BRR-P2-002 — a «Продолжить чтение» card: an already-imported text the reader left mid-way.
// Tapping resumes straight to the saved row (explicit intent → jump, not the passive banner).
function renderContinueCard(item) {
  const node = el('div', { class: 'work-card continue-card', attrs: { role: 'button', tabindex: '0' } });
  const title = item.title || tt('room.work.untitled', 'Без названия');
  const titleEl = el('span', { class: 'work-card-title', text: title });
  if (HEBREW_RE.test(title)) titleEl.setAttribute('dir', 'rtl');
  node.appendChild(titleEl);
  const pct = window.ReaderProgress ? window.ReaderProgress.continuePercent(item.last_row_idx, item.n_rows) : 0;
  const meta = el('div', { class: 'work-card-meta' });
  meta.appendChild(el('span', { class: 'prov-badge continue-pct', text: pct + '% ' + tt('room.resume.read', 'прочитано') }));
  node.appendChild(meta);
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.resume.continue', text: tt('room.resume.continue', 'Продолжить') }));
  const open = () => openReader(item.id, item.title, { resume: true });
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return node;
}

// Prepend the «Продолжить чтение» shelf above everything (R8 «что дальше»). Guarded against a
// stale/swapped body (a navigation or filter replaced the L1 home while the DB query was in flight).
async function injectContinueReading(body) {
  try {
    let items = [];
    try { items = await localDb.getContinueReading(12); } catch (_) { items = []; }
    if (!items || !items.length || corpusL1Body !== body || corpusFilterActive()) return;
    const sec = el('section', { class: 'shelf corpus-continue' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: '▶ ' + tt('room.resume.shelfTitle', 'Продолжить чтение') }));
    sec.appendChild(head);
    const rail = el('div', { class: 'shelf-rail' });
    for (const it of items) rail.appendChild(renderContinueCard(it));
    sec.appendChild(rail);
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}

// BRR-P2-003 — a «🔖 Закладки» card: the saved passage snippet + its work title; opens the
// text and jumps to the exact bookmarked sentence (robust by sentence_id, not order_index).
function renderBookmarkCard(b) {
  const node = el('div', { class: 'work-card bookmark-card', attrs: { role: 'button', tabindex: '0' } });
  const snip = b.snippet || b.title || b.text_title || '';
  const snEl = el('span', { class: 'work-card-title bookmark-snippet', text: snip });
  if (HEBREW_RE.test(snip)) snEl.setAttribute('dir', 'rtl');
  node.appendChild(snEl);
  const title = b.text_title || b.title || '';
  if (title) {
    const a = el('span', { class: 'work-card-author', text: title });
    if (HEBREW_RE.test(title)) a.setAttribute('dir', 'rtl');
    node.appendChild(a);
  }
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.bookmark.open', text: tt('room.bookmark.open', 'Открыть') }));
  const open = () => openReader(b.text_id, b.text_title || b.title, { scrollToSentence: b.sentence_id });
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return node;
}

// Prepend the «🔖 Закладки» shelf (newest passages across all texts). Same stale-body guard.
async function injectBookmarksShelf(body) {
  try {
    let items = [];
    try { items = await localDb.listBookmarks(null, 16); } catch (_) { items = []; }
    if (!items || !items.length || corpusL1Body !== body || corpusFilterActive()) return;
    const sec = el('section', { class: 'shelf corpus-bookmarks' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: '🔖 ' + tt('room.bookmark.shelfTitle', 'Закладки') }));
    sec.appendChild(head);
    const rail = el('div', { class: 'shelf-rail' });
    for (const b of items) rail.appendChild(renderBookmarkCard(b));
    sec.appendChild(rail);
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}

// Inject the L1 home rails in deterministic top-to-bottom order — because each prepends to
// firstChild, the LAST to run sits highest: Продолжить → 🔖 Закладки → profile rail → ready → периоды.
async function injectHomeRails(body) {
  await injectCorpusRails(body);
  await injectBookmarksShelf(body);
  await injectContinueReading(body);
}

async function injectCorpusRails(body) {
  try {
    const ready = (corpusIndex && corpusIndex.ready) || [];
    if (!ready.length || !window.CorpusVocab) return;
    const v = await loadCorpusVocab();
    if (!v || !v.works) return;
    const states = (await ensureWordStates()) || {};   // ONE shared query (single-flight)
    const cardById = new Map();
    const scored = [];
    for (const c of ready) {
      const w = v.works[String(c.id)];
      if (!w) continue;
      const cov = window.CorpusVocab.coverageForWork(w, v.dict, states);   // pure, no DB query
      if (!cov) continue;
      cardById.set(String(c.id), c);
      scored.push({ id: String(c.id), author: c.author, cov: cov });
    }
    const decision = window.CorpusVocab.pickPersonalRail(scored);
    body.querySelectorAll('.corpus-coldstart, .corpus-nextforyou').forEach((e) => e.remove());
    let sec = null;
    if (decision && decision.kind) {
      const cards = decision.ids.map((id) => cardById.get(String(id))).filter(Boolean);
      const meta = decision.kind === 'challenge'
        ? { emoji: '🔥', titleKey: 'room.corpus.challengeTitle', titleFallback: 'Следующий вызов', introKey: 'room.corpus.challengeIntro', introFallback: 'Ты перерос лёгкое — вот посильный вызов чуть выше твоего уровня.' }
        : { emoji: '🎯', titleKey: 'room.corpus.nextTitle', titleFallback: 'Следующий для тебя', introKey: 'room.corpus.nextIntro', introFallback: 'Тексты, где ты уже знаешь ~80–95% слов — идеальны для роста.' };
      sec = buildRailSection('corpus-nextforyou', meta, cards);
    } else {
      sec = buildColdStartSection(v);   // too-new → cold-start on-ramp
    }
    if (sec) {
      body.insertBefore(sec, body.firstChild);
      try { window.applyI18n && window.applyI18n(); } catch (_) {}
    }
  } catch (_) {}
}
// BRR-P1-007 §7 — on-device real-profile validation, triggered by ?validate=1 so the owner can
// run it on the PHONE (where the profile lives) WITHOUT a console. Privacy-preserving: it reuses
// CorpusVocabRoom.coverageFor (which scores each work against the LIVE getKnownWordStates profile)
// and aggregates ONLY anonymous counts — the known-words never leave the device. Sequential (no
// query stampede). Output goes to a copyable overlay. Turns the 80–95% i+1 band from a
// validate-in-prod hypothesis into a measured fact (matched-only vs all-token vs type denominators,
// distribution + candidate bands for recalibrating CV.CFG, per-era fallback load).
async function runRealProfileValidation() {
  let R = '';
  try {
    const CV = window.CorpusVocab, Room = window.CorpusVocabRoom;
    if (!CV || !Room) { showValidationOverlay('Движок не готов — открой ещё раз library.html?validate=1'); return; }
    const vocab = await Room.ensure();
    if (!vocab || !vocab.works) { showValidationOverlay('vocab-сайдкар не загрузился'); return; }
    let eraById = {};
    try { const s = await (await fetch('/data/benyehuda/corpus-search-v' + CORPUS_CATALOG_VERSION + '.json?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' })).json(); for (const r of s) eraById[String(r.id)] = r.e || 'unknown'; } catch (_) {}
    // FRESH profile with a small retry (the first getKnownWordStates after boot can come back empty
    // transiently on a 10K-note DB). Heal the app cache too.
    let states = {};
    for (let attempt = 0; attempt < 5; attempt++) {
      try { states = await localDb.getKnownWordStates(); } catch (_) { states = {}; }
      if (states && Object.keys(states).length) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (states && Object.keys(states).length) readerWordStates = states;
    // SRS-state distribution — the likely reason engaged=0: saved words sit in 'new' state, and the
    // current CV.CFG.KNOWN_STATES = {known,learning} EXCLUDES 'new', so saved vocab isn't counted.
    const stDist = {}; for (const k in states) stDist[states[k]] = (stDist[states[k]] || 0) + 1;
    // Recompute under BOTH interpretations: current (known+learning) AND saved-as-known (any state).
    const SAVED_CFG = Object.assign({}, CV.CFG, { KNOWN_STATES: { known: 1, learning: 1, new: 1, weak: 1, stale: 1 } });
    const rows = [], rowsSaved = [];
    for (const id of Object.keys(vocab.works)) {
      const w = vocab.works[id]; if (!w) continue;
      const c = window.CorpusVocab.coverageForWork(w, vocab.dict, states);
      if (!c || c.matchedDistinct < 20) continue;
      const cs = window.CorpusVocab.coverageForWork(w, vocab.dict, states, SAVED_CFG);
      rows.push({ mt: c.matchedDrillCov, at: c.totalCov, ty: c.matchedDistinct ? c.knownDistinct / c.matchedDistinct : 0, known: c.knownDistinct, era: eraById[id] || 'unknown' });
      rowsSaved.push({ mt: cs.matchedDrillCov, fb: cs.fallbackShare, known: cs.knownDistinct, era: eraById[id] || 'unknown' });
    }
    const N = rows.length;
    const LO = CV.CFG.ZONE_LO, HI = CV.CFG.ZONE_HI;
    const inB = (arr, k, lo, hi) => arr.filter((r) => r[k] >= lo && r[k] < hi).length;
    const pc = (arr, k) => { const a = arr.map((r) => r[k]).sort((x, y) => x - y); return a.length ? [10, 25, 50, 75, 90].map((p) => a[Math.min(a.length - 1, Math.floor(a.length * p / 100))].toFixed(2)).join('/') : '—'; };
    const bands = [[.80, .95], [.75, .95], [.75, .90], [.70, .90], [.70, .85], [.65, .85]];
    const eras = {}; for (const r of rowsSaved) { const e = eras[r.era] = eras[r.era] || { n: 0, fb: 0, in: 0 }; e.n++; e.fb += r.fb; if (r.mt >= LO && r.mt < HI) e.in++; }
    R += '=== BRR-P1-007 §7 real-profile validation ===\n';
    R += 'scored=' + N + ' · profile states: ' + (Object.keys(stDist).map((s) => s + '=' + stDist[s]).join(' ') || '(empty)') + '\n';
    R += '[known+learning]  engaged=' + rows.filter((r) => r.known > 0).length + ' · in-zone(mt ' + LO + '–' + HI + ')=' + inB(rows, 'mt', LO, HI) + '\n';
    R += '[saved=known]     engaged=' + rowsSaved.filter((r) => r.known > 0).length + ' · in-zone(mt ' + LO + '–' + HI + ')=' + inB(rowsSaved, 'mt', LO, HI) + '\n';
    R += '[saved] mt pct p10/25/50/75/90: ' + pc(rowsSaved, 'mt') + '\n';
    R += '[saved] in-zone @ bands: ' + bands.map(([l, h]) => '[' + l + '-' + h + ']=' + inB(rowsSaved, 'mt', l, h)).join('  ') + '\n';
    R += '[saved] per-era (fb%·in): ' + Object.keys(eras).sort((a, b) => eras[b].n - eras[a].n).map((e) => e + ' n=' + eras[e].n + ' fb=' + (100 * eras[e].fb / eras[e].n).toFixed(0) + '% in=' + eras[e].in).join(' | ') + '\n';
    // PROFILE DIAGNOSTIC — pinpoints why engaged might be 0 (note counts/types + pid presence + corpus join)
    let diag = '--- profile diagnostic ---\n';
    try {
      const tot = await localDb.dbQuery("SELECT COUNT(*) c FROM notes_v2", []);
      const ws = await localDb.dbQuery("SELECT COUNT(*) c FROM notes_v2 WHERE note_type='word_study'", []);
      const wsPid = await localDb.dbQuery("SELECT COUNT(*) c FROM notes_v2 WHERE note_type='word_study' AND COALESCE(json_extract(body_json,'$.pealim_id'),'')!=''", []);
      const types = await localDb.dbQuery("SELECT note_type, COUNT(*) c FROM notes_v2 GROUP BY note_type", []);
      diag += 'notes_v2 total=' + ((tot[0] || {}).c) + ' · word_study=' + ((ws[0] || {}).c) + ' (с pealim_id=' + ((wsPid[0] || {}).c) + ')\n';
      diag += 'note_type: ' + (types || []).map((r) => r.note_type + '=' + r.c).join(' ') + '\n';
    } catch (e) { diag += 'diag-query ERR: ' + (e && e.message || e) + '\n'; }
    try {
      const prof = await localDb.getKnownWordStates();
      const pk = Object.keys(prof || {});
      const pid = pk.filter((k) => k.indexOf('pid:') === 0);
      const dictSet = new Set((vocab.dict || []).map((p) => 'pid:' + p));
      diag += 'getKnownWordStates keys=' + pk.length + ' (pid:' + pid.length + ' · norm#pos:' + (pk.length - pid.length) + ') · pid∩corpus=' + pid.filter((k) => dictSet.has(k)).length + '\n';
      diag += 'sample pid: ' + pid.slice(0, 8).join(',') + '\n';
    } catch (e) { diag += 'kws ERR: ' + (e && e.message || e) + '\n'; }
    showValidationOverlay(diag + '\n' + R);
  } catch (e) { showValidationOverlay('ошибка валидации: ' + (e && e.message || e) + '\n' + R); }
}
function showValidationOverlay(text) {
  const ov = el('div', { attrs: { style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;' } });
  const box = el('div', { attrs: { style: 'background:var(--bg-card,#fff);color:var(--text-primary,#111);max-width:560px;width:100%;border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.3);' } });
  box.appendChild(el('div', { attrs: { style: 'font-weight:700;margin-bottom:8px;' }, text: '§7 валидация — пришли мне этот текст' }));
  const ta = el('textarea', { attrs: { readonly: 'true', style: 'width:100%;height:230px;font:12px/1.4 monospace;white-space:pre;border:1px solid var(--border-soft,#ccc);border-radius:8px;padding:8px;box-sizing:border-box;background:var(--bg-muted,#f6f6f6);color:inherit;' } });
  ta.value = text;
  box.appendChild(ta);
  const btns = el('div', { attrs: { style: 'display:flex;gap:8px;margin-top:10px;' } });
  const copyBtn = el('button', { attrs: { style: 'flex:1;padding:11px;border-radius:8px;border:0;background:var(--accent,#2563eb);color:#fff;font-weight:600;width:auto;' }, text: 'Копировать' });
  copyBtn.addEventListener('click', async () => { try { ta.focus(); ta.select(); await navigator.clipboard.writeText(text); copyBtn.textContent = '✓ Скопировано'; } catch (_) { try { ta.select(); document.execCommand('copy'); copyBtn.textContent = '✓ Скопировано'; } catch (e2) {} } });
  const closeBtn = el('button', { attrs: { style: 'padding:11px 14px;border-radius:8px;border:1px solid var(--border-soft,#ccc);background:transparent;color:inherit;width:auto;' }, text: 'Закрыть' });
  closeBtn.addEventListener('click', () => ov.remove());
  btns.appendChild(copyBtn); btns.appendChild(closeBtn);
  box.appendChild(btns);
  ov.appendChild(box);
  document.body.appendChild(ov);
}
function validateRequested() {
  try { return new URLSearchParams(location.search).get('validate') === '1'; } catch (_) { return false; }
}
function maybeRunValidation() {
  if (!validateRequested()) return;
  setTimeout(() => { try { runRealProfileValidation(); } catch (_) {} }, 500);
}
// Shown when ?validate=1 but the DB is held by ANOTHER tab (the Studio at linguistpro.kolosei.com/) —
// the Room is a follower and can't read the notes. Actionable instead of the silent 📑 dbBusy state.
const VALIDATE_DBBUSY_MSG = '⚠ База данных занята другой вкладкой.\n\nЗакрой ВСЕ вкладки linguistpro.kolosei.com — особенно Студию (адрес БЕЗ /library.html, там твои заметки), и любые другие.\n\nОставь только ЭТУ вкладку, обнови её — и валидация запустится.';

// id -> full ready card (built once from the sidecar) so a search hit that IS ready opens
// via served-on-open; the search index itself stays minimal (no file/text_key per row).
function corpusReadyMap() {
  if (corpusReadyById) return corpusReadyById;
  corpusReadyById = new Map();
  for (const c of ((corpusIndex && corpusIndex.ready) || [])) corpusReadyById.set(String(c.id), c);
  return corpusReadyById;
}
function corpusFilterActive() { const f = corpusFilter; return !!(String(f.q || '').trim() || f.genre || f.lang || f.readyOnly); }
function corpusApplyFilter() {
  const rows = corpusSearch || [];
  const f = corpusFilter; const q = corpusNrm(f.q);
  return rows.filter((row) => {
    if (f.readyOnly && !row.r) return false;
    if (f.genre && row.g !== f.genre) return false;
    if (f.lang && row.l !== f.lang) return false;
    if (q && !(String(row._n || '').includes(q) || corpusNrm(row.a).includes(q))) return false;
    return true;
  });
}
// Language label via the platform's locale-aware display names (he/en/ru), raw code fallback.
function corpusLangLabel(l) {
  if (!l) return '';
  try { const loc = (window.appGetLocale && window.appGetLocale()) || 'ru'; return new Intl.DisplayNames([loc], { type: 'language' }).of(l) || l; } catch (_) { return l; }
}
function corpusFilterSummary() {
  const f = corpusFilter; const parts = [];
  if (String(f.q || '').trim()) parts.push('«' + f.q.trim() + '»');
  if (f.genre) parts.push(corpusGenreLabel(f.genre));
  if (f.lang) parts.push(corpusLangLabel(f.lang));
  if (f.readyOnly) parts.push(tt('room.corpus.facets.ready', 'Готовые'));
  return parts.join(' · ') || tt('room.corpus.search.results', 'Результаты');
}
// BRR-S6 — the results count, split so a «0» can't be misread. `titleN` = title/author matches;
// `ftsN` = in-text matches (null until the async FTS resolves; a trailing «…» marks it still loading).
function corpusCountLabel(titleN, ftsN, done) {
  let s = tt('room.corpus.search.byTitle', 'По названию') + ': ' + titleN;
  if (ftsN != null || done) s += ' · ' + tt('room.corpus.search.inText', 'В тексте') + ': ' + (ftsN == null ? 0 : ftsN) + (done ? '' : '…');
  return s;
}
// Synthesize a minimal card from a search row for a display-only (unprocessed) result row.
function corpusSearchRowToCard(h) {
  return {
    id: h.id, title: h.t, author: h.a, era: h.e, genre: h.g, orig_language: h.l,
    review_status: 'machine', audio_status: 'none',
    coverage: { text: !!h.r, translation: h.r ? 'machine' : 'none' },
  };
}

// "Ready to read" = openable (has body) AND translated. Machine translation still counts as
// readable; the ⚙ badge keeps it honest. Same predicate the producer used (R8 parity).
function corpusIsReady(c) { return !!(c && c.coverage && c.coverage.text && c.coverage.translation && c.coverage.translation !== 'none'); }
function corpusEraTitle(era) { const e = ((corpusRoot && corpusRoot.era_taxonomy) || []).find((x) => x.era === era); return (e && e.title) || era; }
function corpusGenreLabel(g) { return g ? tt('room.corpus.genre.' + g, g) : ''; }
function corpusLengthLabel(c) {
  if (c && c.parts > 1) return c.parts + ' ' + tt('room.corpus.parts', 'ч.');
  if (c && c.segments) return c.segments + ' ' + tt('room.corpus.rows', 'стр.');
  return '';
}
// Honest provenance chip (shared by the ready rail + work rows). Known enums get a localized
// label + styled class; an unknown value is shown verbatim (never a raw i18n key).
function corpusProvBadge(kind, val) {
  const KNOWN = kind === 'audio' ? { none: 1, tts: 1, human: 1 } : { machine: 1, machine_assisted: 1, human_proofread: 1 };
  const v = String(val || (kind === 'audio' ? 'none' : 'machine'));
  const cls = (kind === 'audio' ? 'audio-' : 'rs-') + v;
  const key = (kind === 'audio' ? 'room.prov.audio.' : 'room.prov.rs.') + v;
  const opts = { class: 'prov-badge ' + cls, text: KNOWN[v] ? tt(key) : v };
  if (KNOWN[v]) opts.i18n = key;
  return el('span', opts);
}
function stateBoxNode(i18nKey, icon) {
  const box = el('div', { class: 'room-state' });
  if (icon) box.appendChild(el('span', { class: 'room-state-icon', text: icon }));
  box.appendChild(el('span', { i18n: i18nKey, text: tt(i18nKey) }));
  return box;
}

// Navigate the drill; resets the incremental-reveal cursor + re-renders.
function corpusNavTo(level, era, author) {
  corpusNav = { level: level || 'home', era: era || null, author: author || null };
  corpusReveal = 0;
  renderCorpus();
}

// ↑ breadcrumb. parts = [{label, onClick?}, …]; the leaf is plain text, ancestors are
// buttons. The ← back button goes to the parent (or home).
function corpusCrumb(parts) {
  const bar = el('div', { class: 'corpus-crumb' });
  const back = el('button', { class: 'corpus-back', attrs: { type: 'button', 'aria-label': tt('room.corpus.back', 'Назад') } });
  back.textContent = '←';
  const parent = parts.length >= 2 ? parts[parts.length - 2] : null;
  back.addEventListener('click', () => { if (parent && parent.onClick) parent.onClick(); else corpusNavTo('home'); });
  bar.appendChild(back);
  const trail = el('nav', { class: 'corpus-crumb-trail' });
  parts.forEach((p, i) => {
    if (i) trail.appendChild(el('span', { class: 'corpus-crumb-sep', text: '▸' }));
    const isLeaf = i === parts.length - 1;
    const part = el(isLeaf ? 'span' : 'button', { class: 'corpus-crumb-part' + (isLeaf ? ' leaf' : '') });
    part.textContent = p.label || '';
    if (HEBREW_RE.test(p.label || '')) part.setAttribute('dir', 'rtl');
    if (!isLeaf && p.onClick) { part.setAttribute('type', 'button'); part.addEventListener('click', p.onClick); }
    trail.appendChild(part);
  });
  bar.appendChild(trail);
  return bar;
}

// Drill dispatcher. Lazy-loads the sidecar on first paint; guards async work against rapid
// navigation with a render token.
async function renderCorpus() {
  const main = $('roomContent');
  if (!main) return;
  const token = ++corpusRenderToken;
  if (!corpusRoot) { showState('room.shelf.emptyTrack', '📚'); return; }
  if (!corpusIndex) {
    showState('room.state.loading', '⏳');
    try { await loadCorpusIndex(); } catch (e) { if (token === corpusRenderToken) showState('room.state.error', '⚠️'); return; }
    if (token !== corpusRenderToken) return;
  }
  if (corpusNav.level === 'authors') return renderCorpusAuthors(corpusNav.era, token);
  if (corpusNav.level === 'works') return renderCorpusWorks(corpusNav.era, corpusNav.author, token);
  return renderCorpusHome(token);
}

// L1 — graduated landing with a PERSISTENT global filter bar (search + facets) on top. The
// body below toggles between the home content (ready rail + chronological period grid) and the
// global RESULTS list, driven by corpusFilter — refreshed IN PLACE so the search input never
// loses focus while typing.
function renderCorpusHome(token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  main.innerHTML = '';
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(buildCorpusFilterBar());
  const body = el('div', { class: 'corpus-l1-body' });
  corpusL1Body = body;
  wrap.appendChild(body);
  main.appendChild(wrap);
  corpusRefreshL1Body();
}

// Refresh ONLY the L1 body (the filter bar + its focused input stay put): the global results
// when a filter is active, the home rail + period grid otherwise.
function corpusRefreshL1Body() {
  const body = corpusL1Body;
  if (!body) return;
  // keep the clear chip in sync without rebuilding the bar (preserves input focus)
  if (corpusClearChip) corpusClearChip.hidden = !corpusFilterActive();
  if (corpusFilterActive()) renderResultsInto(body);
  else renderHomeInto(body);
}

function renderHomeInto(body) {
  body.innerHTML = '';
  const ready = (corpusIndex && corpusIndex.ready) || [];
  if (ready.length) {
    const sec = el('section', { class: 'shelf corpus-ready' });
    const head = el('div', { class: 'shelf-head' });
    const h = el('h2', { class: 'shelf-title' });
    h.textContent = '✓ ' + tt('room.corpus.readyTitle', 'Готовы к чтению') + ' (' + ready.length + ')';
    head.appendChild(h);
    head.appendChild(el('p', { class: 'shelf-intro', i18n: 'room.corpus.readyIntro', text: tt('room.corpus.readyIntro') }));
    sec.appendChild(head);
    const rail = el('div', { class: 'shelf-rail' });
    for (const c of ready) rail.appendChild(renderCorpusCard(c));
    sec.appendChild(rail);
    body.appendChild(sec);
  }
  const periods = el('section', { class: 'corpus-periods' });
  const ph = el('div', { class: 'shelf-head' });
  ph.appendChild(el('h2', { class: 'shelf-title', i18n: 'room.corpus.periodsTitle', text: tt('room.corpus.periodsTitle') }));
  periods.appendChild(ph);
  const grid = el('div', { class: 'corpus-period-grid' });
  const eras = ((corpusRoot && corpusRoot.era_taxonomy) || []).slice().sort((a, b) => a.order - b.order);
  for (const e of eras) grid.appendChild(renderPeriodCard(e));
  periods.appendChild(grid);
  body.appendChild(periods);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  injectHomeRails(body);   // S4 personal rail + BRR-P2-002 «Продолжить чтение» (Continue on top)
}

// Global results (search ∪ facets) over the lazy index. Ready hits open via served-on-open
// (joined to the sidecar's full card); unprocessed hits are display-only rows (honest, never
// openable). Async: shows a loading state on first index fetch.
async function renderResultsInto(body) {
  const mySeq = ++corpusFtsSeq;   // BRR-P2-006a — this render owns the FTS slot; a newer query supersedes it
  if (!corpusSearch) {
    body.innerHTML = '';
    body.appendChild(stateBoxNode('room.state.loading', '⏳'));
    try { await loadCorpusSearch(); } catch (e) { if (corpusL1Body === body) { body.innerHTML = ''; body.appendChild(stateBoxNode('room.state.error', '⚠️')); } return; }
    if (corpusL1Body !== body || mySeq !== corpusFtsSeq) return; // a full re-render / newer query replaced this
  }
  if (corpusL1Body !== body) return;
  body.innerHTML = '';
  const hits = corpusApplyFilter();
  const summary = el('div', { class: 'corpus-results-summary' });
  summary.appendChild(el('span', { class: 'corpus-results-label', text: corpusFilterSummary() }));
  // BRR-S6 — when there's a TEXT query, label the count as «По названию: N» so a «0» reads as
  // «no title match», not «nothing found» (the in-text group below carries its own count, merged in
  // after the async FTS resolves). A filter-only view (genre/lang, no query) keeps the plain count.
  const hasQuery = !!String(corpusFilter.q || '').trim();
  const countEl = el('span', { class: 'corpus-results-count', text: hasQuery ? corpusCountLabel(hits.length, null, false) : String(hits.length) });
  summary.appendChild(countEl);
  body.appendChild(summary);
  // Group A — title/author matches (the existing flat list + «показать ещё» pagination). BRR-P2-005.2:
  // thread the query so a title-hit ALSO opens AT the matched body row when the word is in the body
  // (else firstMatchRow → -1 → normal resume/top). Was the «no highlighted row on drill-in» bug.
  if (hits.length) {
    hits.sort((a, b) => (b.r - a.r) || String(a.t).localeCompare(String(b.t)));
    appendPagedWorkRows(body, hits.map((h) => ({ sr: h })), null, { openOpts: { ftsQuery: corpusFilter.q } });
  }
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  // Group B — BRR-P2-001 full-text «в тексте» (async; lazy-loads only the shard(s) a query needs).
  // Shows its own «Ищем в текстах…» placeholder while loading; the seq token drops stale late results.
  await appendFtsGroup(body, corpusFilter.q, hits, mySeq, { countEl, titleN: hits.length });
  // Empty state ONLY once this render is still current AND nothing was found (never mid-load).
  if (corpusL1Body === body && mySeq === corpusFtsSeq && !hits.length && !body.querySelector('.corpus-fts-group')) {
    body.appendChild(stateBoxNode('room.corpus.search.empty', '🔍'));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  }
}

// Shared paged renderer for a list of { sr, r? } work hits (sr = corpus-search row).
// rowOpts (optional) is merged into each row's opts — e.g. { openOpts: { ftsQuery } } so an FTS
// hit opens AT the matched sentence (BRR-P2-005).
function appendPagedWorkRows(container, items, decorate, rowOpts) {
  const list = el('div', { class: 'corpus-work-list' });
  const moreWrap = el('div', { class: 'corpus-more' });
  container.appendChild(list); container.appendChild(moreWrap);
  const readyMap = corpusReadyMap();
  let cursor = 0;
  const slice = () => {
    const upTo = Math.min(items.length, cursor + CORPUS_PAGE);
    for (let i = cursor; i < upTo; i++) {
      const it = items[i], sr = it.sr;
      const full = sr.r ? readyMap.get(String(sr.id)) : null;
      const node = renderCorpusWorkRow(full || corpusSearchRowToCard(sr), !!full, Object.assign({ showAuthor: true }, rowOpts || {}));
      if (decorate) decorate(node, it);
      list.appendChild(node);
    }
    cursor = upTo;
    moreWrap.innerHTML = '';
    if (cursor < items.length) {
      const btn = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' } });
      btn.textContent = tt('room.corpus.showMore', 'Показать ещё') + ' (' + (items.length - cursor) + ')';
      btn.addEventListener('click', () => { slice(); try { window.applyI18n && window.applyI18n(); } catch (_) {} });
      moreWrap.appendChild(btn);
    }
  };
  slice();
}

// ── BRR S1/S2 — result-row bilingual snippet + query <mark> (client-side, body-driven) ──────────
// The FTS index carries no per-line text (offsets are a flat token stream), so the snippet is built
// from the work BODY (works/<id>.json — the very payload the reader opens). A snippet is shown ONLY
// for READY hits (a non-ready hit has no body → honestly no preview, never fabricated). Lazy +
// single-flight + IntersectionObserver: a 60-row result page never fans out 60 body fetches (the S3
// stampede lesson [[feedback-test-with-nonempty-profile]]).
let _ftsQTokCache = { q: null, toks: null };
function ftsQueryTokens(q) {
  if (!q) return [];
  if (_ftsQTokCache.q === q) return _ftsQTokCache.toks;
  let toks = [];
  try { toks = window.CorpusFTS ? window.CorpusFTS.tokenizeText(q).map(window.CorpusFTS.normalizeToken).filter(Boolean) : []; } catch (_) { toks = []; }
  _ftsQTokCache = { q: q, toks: toks };
  return toks;
}
// Append `text` to `parent` with matched query tokens wrapped in <mark> (XSS-safe DOM nodes, not innerHTML).
function appendMarkedHebrew(parent, text, qToks) {
  let segs = null;
  try { segs = (qToks && qToks.length && window.CorpusFTS) ? window.CorpusFTS.markSegments(text, qToks) : null; } catch (_) { segs = null; }
  if (!segs) { parent.appendChild(document.createTextNode(String(text == null ? '' : text))); return; }
  for (const s of segs) {
    if (s.m) parent.appendChild(el('mark', { class: 'fts-mark', text: s.t }));
    else parent.appendChild(document.createTextNode(s.t));
  }
}
const _workBodyCache = new Map();   // card.id → Promise<rows[]> (single-flight; bodies immutable + force-cached)
function loadWorkBodyRows(card) {
  const key = String(card.id);
  if (_workBodyCache.has(key)) return _workBodyCache.get(key);
  const p = (async () => {
    const res = await fetch('/data/benyehuda/' + card.file + '?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
    if (!res.ok) throw new Error('body ' + res.status);
    const bundle = await res.json();
    const texts = bundle && bundle.library && bundle.library.texts;
    return (texts && texts[0] && texts[0].rows) || [];
  })();
  _workBodyCache.set(key, p);
  p.catch(() => { _workBodyCache.delete(key); });   // a failed fetch may retry on a later observe
  return p;
}
let _snipObserver = null;
function getSnipObserver() {
  if (_snipObserver !== null) return _snipObserver;
  _snipObserver = (typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries, obs) => {
        for (const e of entries) if (e.isIntersecting) { obs.unobserve(e.target); fillRowSnippet(e.target); }
      }, { rootMargin: '250px' })
    : false;
  return _snipObserver;
}
function observeRowSnippet(rowNode, card, ftsQuery) {
  if (!rowNode || !card || !card.file || !ftsQuery) return;
  rowNode.__snipCard = card; rowNode.__snipQuery = ftsQuery;
  const obs = getSnipObserver();
  if (!obs) { fillRowSnippet(rowNode); return; }
  obs.observe(rowNode);
}
// Find the matched line in the body and render it bilingually. Honest: a title/author-only match
// (no body line located) shows NO snippet — never a fabricated one.
async function fillRowSnippet(rowNode) {
  const card = rowNode && rowNode.__snipCard, q = rowNode && rowNode.__snipQuery;
  if (!card || !q || !rowNode.isConnected || rowNode.querySelector('.corpus-work-snippet')) return;
  let rows = null;
  try { rows = await loadWorkBodyRows(card); } catch (_) { return; }
  if (!rows || !rows.length || !rowNode.isConnected) return;
  let idx = -1;
  try { const C = window.CorpusFTS; if (C) { idx = C.firstPhraseRow(rows, q); if (idx < 0) idx = C.firstMatchRow(rows, q); } } catch (_) { idx = -1; }
  if (idx < 0) return;
  const row = rows[idx];
  const he = row.hebrew_niqqud || row.hebrew_plain || '', ru = row.russian || '';
  if (!he) return;
  const qToks = ftsQueryTokens(q);
  const snip = el('div', { class: 'corpus-work-snippet' });
  const heEl = el('div', { class: 'corpus-snippet-he', attrs: { dir: 'rtl' } });
  appendMarkedHebrew(heEl, he, qToks);
  snip.appendChild(heEl);
  if (ru) snip.appendChild(el('div', { class: 'corpus-snippet-ru', text: ru }));
  const col = rowNode.querySelector('.corpus-work-col');
  if (col) col.appendChild(snip);
}

let _ftsConfigured = false;
function ensureFtsConfigured() {
  if (_ftsConfigured || !window.CorpusFTS) return;
  window.CorpusFTS.configure({ version: CORPUS_CATALOG_VERSION, dataRev: FTS_DATA_REV, base: '/data/benyehuda/' });
  _ftsConfigured = true;
}
// Render one FTS sub-group section (title + paged work rows). Ready hits open into the bilingual
// reader AT the matched line (ftsQuery → firstPhraseRow/firstMatchRow); non-ready hits are honest
// «найдено · перевод готовится» (display-only).
function appendFtsSection(body, q, label, items) {
  if (!items.length) return;
  const sec = el('section', { class: 'shelf corpus-fts-group' });
  const head = el('div', { class: 'shelf-head' });
  head.appendChild(el('h2', { class: 'shelf-title', text: label + ' (' + items.length + ')' }));
  sec.appendChild(head);
  body.appendChild(sec);
  appendPagedWorkRows(sec, items, null, { openOpts: { ftsQuery: q } });   // BRR-P2-005/006 — opens AT the matched/phrase line
}

// Query the full-text index and render «в тексте» groups for hits NOT already shown in the
// title/author group. BRR-P2-006 — a multi-word query is split into a PHRASE group («🔎 точная
// фраза», positions-verified consecutive words, ranked first) + a scattered «слова в тексте» group;
// a single word stays one «🔎 В тексте» group. The old misleading «по форме слова» badge is gone:
// content words are lemma-only by design, so it lit on every content hit and signalled nothing.
async function appendFtsGroup(body, q, titleHits, seq, summary) {
  if (!window.CorpusFTS || !q || !String(q).trim()) return;
  if (!window.CorpusFTS.tokenizeText(q).length) return;   // index is Hebrew — skip non-Hebrew queries
  ensureFtsConfigured();
  // BRR-P2-006a — show progress IMMEDIATELY (the index lazy-loads shards; without a cue the title-match
  // count «0» reads as «search failed»). role=status/aria-live announces it to assistive tech.
  const loading = el('div', { class: 'corpus-fts-loading', attrs: { role: 'status', 'aria-live': 'polite' } });
  loading.appendChild(el('span', { class: 'corpus-fts-spinner', attrs: { 'aria-hidden': 'true' } }));
  loading.appendChild(el('span', { i18n: 'room.corpus.search.searching', text: tt('room.corpus.search.searching', 'Ищем в текстах…') }));
  body.appendChild(loading);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  const stale = () => corpusL1Body !== body || (seq != null && seq !== corpusFtsSeq);
  const f = corpusFilter;
  const titleIds = new Set((titleHits || []).map((h) => String(h.id)));
  const passFilter = (sr) => !!sr && !(f.readyOnly && !sr.r) && !(f.genre && sr.g !== f.genre) && !(f.lang && sr.l !== f.lang) && !titleIds.has(String(sr.id));
  let ftsCount = 0;
  const bumpCount = (done) => { if (summary && summary.countEl) { try { summary.countEl.textContent = corpusCountLabel(summary.titleN, ftsCount, done); } catch (_) {} } };

  // STAGE 1 (BRR-S3 «прогрессивная фраза») — the «Точная фраза» group painted from the small EXACT
  // prefix shards (~1.3MB) BEFORE the always-loaded lemma layer (~6.5MB) finishes warming. Kills the
  // cold-floor on the first pasted line: the exact phrase appears while «Слова» still resolves.
  let phraseShown = 0;
  try {
    const po = await window.CorpusFTS.phraseOnlySearch(q);
    if (stale()) { try { loading.remove(); } catch (_) {} return; }
    const phraseItems = [];
    for (const r of (po.results || [])) { const sr = corpusSearch[r.w]; if (passFilter(sr)) phraseItems.push({ sr: sr, r: r }); }
    if (phraseItems.length) {
      appendFtsSection(body, q, '🔎 ' + tt('room.corpus.search.phrase', 'Точная фраза'), phraseItems);
      phraseShown = phraseItems.length; ftsCount += phraseShown;
      try { body.appendChild(loading); } catch (_) {}   // keep the spinner BELOW the phrase group while words resolve
      bumpCount(false);
      try { window.applyI18n && window.applyI18n(); } catch (_) {}
    }
  } catch (_) {}

  // STAGE 2 — full search (loads the lemma layer): the scattered «слова в тексте» group. Its phrase
  // hit-set equals stage 1's (same EXACT positional field), so those works are excluded here → no dupes.
  let out = null;
  try { out = await window.CorpusFTS.phraseSearch(q); } catch (_) { try { loading.remove(); } catch (_2) {} return; }
  try { loading.remove(); } catch (_) {}
  if (stale()) return;
  const res = (out && out.results) || [];
  const wordItems = [], latePhrase = [];
  for (const r of res) {
    const sr = corpusSearch[r.w]; if (!passFilter(sr)) continue;
    if (r.phrase) { if (!phraseShown) latePhrase.push({ sr: sr, r: r }); }   // defensive: only if stage 1 produced none
    else wordItems.push({ sr: sr, r: r });
  }
  if (!phraseShown && latePhrase.length) {
    appendFtsSection(body, q, '🔎 ' + tt('room.corpus.search.phrase', 'Точная фраза'), latePhrase);
    phraseShown = latePhrase.length; ftsCount += phraseShown;
  }
  if (wordItems.length) {
    const label = (phraseShown || out.multiToken) ? tt('room.corpus.search.words', 'Слова в тексте') : ('🔎 ' + tt('room.corpus.search.inText', 'В тексте'));
    appendFtsSection(body, q, label, wordItems);
    ftsCount += wordItems.length;
  }
  bumpCount(true);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

// Persistent global filter bar: search input + ✓Готовые toggle + genre/lang selects (counts
// from the root) + a clear chip when any filter is active. Each control refreshes only the L1
// body, so the input focus + select values survive.
function buildCorpusFilterBar() {
  const bar = el('div', { class: 'corpus-filterbar' });
  const inputWrap = el('div', { class: 'corpus-search-wrap' });
  const input = el('input', { class: 'corpus-search-input', attrs: { type: 'search', enterkeyhint: 'search', placeholder: tt('room.corpus.search.placeholder', 'Поиск по корпусу…'), 'aria-label': tt('room.corpus.search.placeholder', 'Поиск') } });
  input.value = corpusFilter.q || '';
  // BRR-S4 — inline ✕ clear (tabindex -1: it's a mouse/touch affordance; Escape clears via keyboard).
  const clearX = el('button', { class: 'corpus-search-clear', attrs: { type: 'button', tabindex: '-1', 'aria-label': tt('room.corpus.search.clearInput', 'Очистить') } });
  clearX.textContent = '✕';
  clearX.hidden = !input.value;
  let deb;
  const applyQuery = () => { corpusFilter.q = input.value; corpusRefreshL1Body(); };
  const doClear = () => { input.value = ''; clearX.hidden = true; clearTimeout(deb); corpusFilter.q = ''; corpusRefreshL1Body(); try { input.focus(); } catch (_) {} };
  input.addEventListener('input', () => {
    // BRR-P2-006a — warm the exact-index shards this query will need IMMEDIATELY (before the debounce):
    // a pasted phrase fires one `input` with the whole line → every prefix-shard starts loading at once,
    // so by the time the debounced search runs they're in flight/cached. Fire-and-forget.
    try { ensureFtsConfigured(); window.CorpusFTS && window.CorpusFTS.warmQuery(input.value); } catch (_) {}
    clearX.hidden = !input.value;
    clearTimeout(deb); deb = setTimeout(applyQuery, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(deb); applyQuery(); }      // BRR-S4 — search now (skip debounce)
    else if (e.key === 'Escape' && input.value) { e.preventDefault(); doClear(); }       // BRR-S4 — Escape clears + keeps focus
  });
  clearX.addEventListener('click', (e) => { e.preventDefault(); doClear(); });
  inputWrap.appendChild(input); inputWrap.appendChild(clearX);
  bar.appendChild(inputWrap);
  const chips = el('div', { class: 'corpus-facets' });
  const ready = el('button', { class: 'corpus-facet-chip' + (corpusFilter.readyOnly ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.readyOnly) } });
  ready.textContent = '✓ ' + tt('room.corpus.facets.ready', 'Готовые');
  ready.addEventListener('click', () => { corpusFilter.readyOnly = !corpusFilter.readyOnly; ready.classList.toggle('on', corpusFilter.readyOnly); ready.setAttribute('aria-pressed', String(corpusFilter.readyOnly)); corpusRefreshL1Body(); });
  chips.appendChild(ready);
  chips.appendChild(buildFacetSelect('genre', 'room.corpus.facets.genre', ((corpusRoot && corpusRoot.counts) || {}).by_genre || {}, corpusGenreLabel));
  chips.appendChild(buildFacetSelect('lang', 'room.corpus.facets.lang', ((corpusRoot && corpusRoot.counts) || {}).by_lang || {}, corpusLangLabel));
  // The clear chip is ALWAYS in the bar (the bar is not rebuilt on filter change to keep the
  // input focused) — its visibility is toggled by corpusRefreshL1Body.
  const clear = el('button', { class: 'corpus-facet-chip clear', attrs: { type: 'button' } });
  clear.textContent = '✕ ' + tt('room.corpus.facets.clear', 'Сбросить');
  clear.hidden = !corpusFilterActive();
  clear.addEventListener('click', () => { corpusFilter = { q: '', genre: '', lang: '', readyOnly: false }; corpusNavTo('home'); });
  corpusClearChip = clear;
  chips.appendChild(clear);
  bar.appendChild(chips);
  return bar;
}

// A facet <select> (native = compact + accessible on mobile); options are the histogram keys
// sorted by count desc, each with its count. The label gets an `on` class when a value is set.
function buildFacetSelect(key, labelKey, counts, labelFn) {
  const wrap = el('label', { class: 'corpus-facet-select' + (corpusFilter[key] ? ' on' : '') });
  const sel = el('select', { attrs: { 'aria-label': tt(labelKey) } });
  sel.appendChild(el('option', { text: tt(labelKey), attrs: { value: '' } }));
  Object.entries(counts).filter(([k]) => k && k !== '(none)').sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    sel.appendChild(el('option', { text: (labelFn(k) || k) + ' (' + n + ')', attrs: { value: k } }));
  });
  sel.value = corpusFilter[key] || '';
  sel.addEventListener('change', () => { corpusFilter[key] = sel.value; wrap.classList.toggle('on', !!sel.value); corpusRefreshL1Body(); });
  wrap.appendChild(sel);
  return wrap;
}

// Period card: title + floruit range + one-line gloss + counts (ready / works / authors).
// "готовы N" is the graduated signal (benyehuda counts + Sefaria gloss); a 0-ready era is
// honestly marked «перевод позже» (R8 — never dressed as readable).
function renderPeriodCard(e) {
  const card = el('div', { class: 'period-card', attrs: { role: 'button', tabindex: '0' } });
  const titlerow = el('div', { class: 'period-card-titlerow' });
  titlerow.appendChild(el('span', { class: 'period-card-title', text: e.title || e.era }));
  if (e.range) titlerow.appendChild(el('span', { class: 'period-card-range', text: e.range }));
  card.appendChild(titlerow);
  if (e.gloss) card.appendChild(el('span', { class: 'period-card-gloss', text: e.gloss }));
  const meta = el('div', { class: 'period-card-meta' });
  if (e.ready_count > 0) meta.appendChild(el('span', { class: 'period-chip ready', text: '✓ ' + tt('room.corpus.readyN', 'готовы') + ' ' + e.ready_count }));
  else meta.appendChild(el('span', { class: 'period-chip later', i18n: 'room.corpus.later', text: tt('room.corpus.later') }));
  meta.appendChild(el('span', { class: 'period-chip muted', text: tt('room.corpus.worksN', 'работ') + ' ' + (e.count || 0) }));
  if (e.author_count) meta.appendChild(el('span', { class: 'period-chip muted', text: tt('room.corpus.authorsN', 'авт.') + ' ' + e.author_count }));
  card.appendChild(meta);
  const open = () => corpusNavTo('authors', e.era);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  return card;
}

// Hebrew alphabet jump-bar (benyehuda א–ת). First-letter key normalizes final forms.
const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
const HEBREW_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function hebFirstLetter(name) {
  const s = String(name || '').replace(/[^א-ת]/g, '');
  const c = s.charAt(0);
  return HEBREW_FINALS[c] || c || '';
}
function buildHebrewJumpBar(listEl, presentSet) {
  const bar = el('div', { class: 'corpus-jumpbar', attrs: { dir: 'rtl', role: 'navigation', 'aria-label': tt('room.corpus.jumpbar', 'Буквы') } });
  for (const L of HEBREW_LETTERS) {
    const has = presentSet.has(L);
    const b = el('button', { class: 'corpus-jump' + (has ? '' : ' off'), attrs: { type: 'button' } });
    b.textContent = L;
    if (has) b.addEventListener('click', () => { const t = listEl.querySelector('[data-letter="' + L + '"]'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    else b.disabled = true;
    bar.appendChild(b);
  }
  return bar;
}

// L2 — lean author list (name + ✓ready + works count). Default order = graduated (ready-first,
// from the sidecar); the sort toggle switches to alphabetical, which adds a Hebrew א–ת jump-bar
// and renders ALL authors (so the letter anchors exist). Rich author detail is deferred
// (benyehuda: lean list → rich page).
function renderCorpusAuthors(era, token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  main.innerHTML = '';
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(corpusCrumb([
    { label: tt('room.tabs.corpus', 'Корпус'), onClick: () => corpusNavTo('home') },
    { label: corpusEraTitle(era) },
  ]));
  const base = (corpusIndex.authors && corpusIndex.authors[era]) || [];
  const alpha = corpusAuthorSort === 'alpha';
  const authors = alpha ? base.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'he')) : base;

  const head = el('div', { class: 'corpus-list-head' });
  head.appendChild(el('span', { class: 'corpus-list-count', text: tt('room.corpus.authorsTitle', 'Авторы') + ' (' + authors.length + ')' }));
  const sortWrap = el('div', { class: 'corpus-sort' });
  [['graduated', 'room.corpus.sort.graduated'], ['alpha', 'room.corpus.sort.alpha']].forEach(([mode, key]) => {
    const b = el('button', { class: 'corpus-sort-btn' + (corpusAuthorSort === mode ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusAuthorSort === mode) } });
    b.textContent = tt(key);
    b.addEventListener('click', () => { if (corpusAuthorSort !== mode) { corpusAuthorSort = mode; corpusReveal = 0; renderCorpusAuthors(era, ++corpusRenderToken); } });
    sortWrap.appendChild(b);
  });
  head.appendChild(sortWrap);
  wrap.appendChild(head);

  const list = el('div', { class: 'corpus-author-list' });
  if (alpha) {
    const present = new Set(authors.map((a) => hebFirstLetter(a.name)).filter(Boolean));
    wrap.appendChild(buildHebrewJumpBar(list, present));
    wrap.appendChild(list);
    for (const a of authors) list.appendChild(renderAuthorRow(era, a)); // all rendered (anchors)
    main.appendChild(wrap);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    return;
  }
  // graduated → incremental reveal
  const moreWrap = el('div', { class: 'corpus-more' });
  wrap.appendChild(list);
  wrap.appendChild(moreWrap);
  const slice = () => {
    const upTo = Math.min(authors.length, corpusReveal + CORPUS_PAGE);
    for (let i = corpusReveal; i < upTo; i++) list.appendChild(renderAuthorRow(era, authors[i]));
    corpusReveal = upTo;
    moreWrap.innerHTML = '';
    if (corpusReveal < authors.length) {
      const btn = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' } });
      btn.textContent = tt('room.corpus.showMore', 'Показать ещё') + ' (' + (authors.length - corpusReveal) + ')';
      btn.addEventListener('click', slice);
      moreWrap.appendChild(btn);
    }
  };
  corpusReveal = 0;
  slice();
  main.appendChild(wrap);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

function renderAuthorRow(era, a) {
  const row = el('div', { class: 'corpus-author-row', attrs: { role: 'button', tabindex: '0' } });
  const L = hebFirstLetter(a.name);
  if (L) row.setAttribute('data-letter', L);
  const name = el('span', { class: 'corpus-author-name', text: a.name || '(без автора)' });
  if (HEBREW_RE.test(a.name || '')) name.setAttribute('dir', 'rtl');
  row.appendChild(name);
  const meta = el('span', { class: 'corpus-author-meta' });
  if (a.ready > 0) meta.appendChild(el('span', { class: 'corpus-author-ready', text: '✓ ' + a.ready }));
  meta.appendChild(el('span', { class: 'corpus-author-works', text: String(a.works) }));
  row.appendChild(meta);
  const open = () => corpusNavTo('works', era, a);
  row.addEventListener('click', open);
  row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  return row;
}

// L3 — an author's works, fetched from ONLY the block(s) they live in (author.blocks), split
// into «✓ Готовы к чтению» (openable rows) and «В каталоге · перевод позже» (disabled rows).
// Each section reveals incrementally so a 1857-work author stays navigable.
async function renderCorpusWorks(era, author, token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  if (!author) return renderCorpusAuthors(era, token);
  main.innerHTML = '';
  corpusWorkGenre = '';   // BRR-P2-004 — genre filter is author-specific; reset on each author (sort persists)
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(corpusCrumb([
    { label: corpusEraTitle(era), onClick: () => corpusNavTo('authors', era) },
    { label: author.name },
  ]));
  const body = el('div', { class: 'corpus-works-body' });
  wrap.appendChild(body);
  main.appendChild(wrap);
  body.appendChild(stateBoxNode('room.state.loading', '⏳'));

  let works = [];
  try {
    const blocks = Array.isArray(author.blocks) && author.blocks.length ? author.blocks : [null];
    const files = blocks.map((b) => corpusManifestFile(era, b)).filter(Boolean);
    const lists = await Promise.all(files.map(fetchCorpusManifest));
    if (token !== corpusRenderToken) return;
    works = [].concat(...lists).filter((w) => (w.author || '(без автора)') === author.name);
  } catch (e) {
    if (token === corpusRenderToken) { body.innerHTML = ''; body.appendChild(stateBoxNode('room.state.error', '⚠️')); }
    return;
  }
  if (token !== corpusRenderToken) return;
  body.innerHTML = '';
  // BRR-P2-004 — L3 sort + genre filter (was: fixed id/title sort, no controls). Re-paints the
  // sections in place over the already-fetched works (no re-fetch). Ready/later split is kept.
  const sectionsWrap = el('div', { class: 'corpus-work-sections' });
  const paint = () => {
    sectionsWrap.innerHTML = '';
    const filtered = corpusWorkGenre ? works.filter((w) => w.genre === corpusWorkGenre) : works;
    const cmp = corpusWorkComparator(corpusWorkSort);
    const ready = filtered.filter(corpusIsReady).sort(cmp);
    const later = filtered.filter((w) => !corpusIsReady(w)).sort(cmp);
    if (ready.length) sectionsWrap.appendChild(corpusWorkSection('room.corpus.sectionReady', '✓', ready, true));
    if (later.length) sectionsWrap.appendChild(corpusWorkSection('room.corpus.sectionLater', '⏳', later, false));
    if (!ready.length && !later.length) sectionsWrap.appendChild(stateBoxNode(corpusWorkGenre ? 'room.corpus.search.empty' : 'room.reader.empty', corpusWorkGenre ? '🔍' : '📄'));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  };
  if (works.length > 1) body.appendChild(buildWorkControls(works, paint));
  body.appendChild(sectionsWrap);
  paint();
}

// L3 work comparator: graded (id order — the producer's graded sequence), alpha (title), length (longest first).
function corpusWorkComparator(mode) {
  if (mode === 'alpha') return (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
  if (mode === 'length') return (a, b) => ((b.segments || 0) - (a.segments || 0)) || String(a.id).localeCompare(String(b.id));
  return (a, b) => String(a.id).localeCompare(String(b.id));
}
// Sort segmented control (reuses the L2 .corpus-sort pattern) + a genre <select> built from the
// genres present in THIS author's works. Both re-paint in place.
function buildWorkControls(works, onChange) {
  const bar = el('div', { class: 'corpus-work-controls' });
  const sortWrap = el('div', { class: 'corpus-sort' });
  [['graded', 'room.corpus.sort.graded', 'По порядку'], ['alpha', 'room.corpus.sort.alpha', 'По алфавиту'], ['length', 'room.corpus.sort.length', 'По длине']]
    .forEach(([mode, key, fb]) => {
      const b = el('button', { class: 'corpus-sort-btn' + (corpusWorkSort === mode ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusWorkSort === mode) } });
      b.textContent = tt(key, fb);
      b.addEventListener('click', () => { if (corpusWorkSort === mode) return; corpusWorkSort = mode; sortWrap.querySelectorAll('.corpus-sort-btn').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); onChange(); });
      sortWrap.appendChild(b);
    });
  bar.appendChild(sortWrap);
  const genres = Array.from(new Set(works.map((w) => w.genre).filter(Boolean))).sort();
  if (genres.length > 1) {
    const sel = el('select', { class: 'corpus-work-genre', attrs: { 'aria-label': tt('room.corpus.facets.genre', 'Жанр') } });
    const all = el('option', { attrs: { value: '' }, text: tt('room.corpus.facets.genre', 'Жанр') }); sel.appendChild(all);
    for (const g of genres) { const o = el('option', { attrs: { value: g }, text: corpusGenreLabel(g) }); if (corpusWorkGenre === g) o.selected = true; sel.appendChild(o); }
    sel.value = corpusWorkGenre;
    sel.addEventListener('change', () => { corpusWorkGenre = sel.value; onChange(); });
    bar.appendChild(sel);
  }
  return bar;
}

function corpusWorkSection(titleKey, icon, works, openable) {
  const sec = el('section', { class: 'corpus-work-section' });
  const head = el('div', { class: 'corpus-section-head' });
  head.appendChild(el('span', { class: 'corpus-section-icon', text: icon }));
  head.appendChild(el('span', { class: 'corpus-section-title', i18n: titleKey, text: tt(titleKey) }));
  head.appendChild(el('span', { class: 'corpus-section-count', text: '(' + works.length + ')' }));
  sec.appendChild(head);
  const list = el('div', { class: 'corpus-work-list' });
  const moreWrap = el('div', { class: 'corpus-more' });
  sec.appendChild(list);
  sec.appendChild(moreWrap);
  let cursor = 0;
  const slice = () => {
    const upTo = Math.min(works.length, cursor + CORPUS_PAGE);
    for (let i = cursor; i < upTo; i++) list.appendChild(renderCorpusWorkRow(works[i], openable));
    cursor = upTo;
    moreWrap.innerHTML = '';
    if (cursor < works.length) {
      const btn = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' } });
      btn.textContent = tt('room.corpus.showMore', 'Показать ещё') + ' (' + (works.length - cursor) + ')';
      btn.addEventListener('click', () => { slice(); try { window.applyI18n && window.applyI18n(); } catch (_) {} });
      moreWrap.appendChild(btn);
    }
  };
  slice();
  return sec;
}

// A dense work ROW (not a card — scannable at scale, benyehuda/Sefaria/Standard Ebooks).
// Baked → ▶ openable (served-on-open). Unprocessed → ⏳ disabled, honest «перевод позже»
// (R8 — visible in the catalog, never dead-ended, never posing as readable).
function renderCorpusWorkRow(card, openable, opts) {
  const row = el('div', { class: 'corpus-work-row' + (openable ? '' : ' is-later') });
  const col = el('div', { class: 'corpus-work-col' });
  // BRR-S2 — in a search context (opts.openOpts.ftsQuery — the same query threaded to the open handler)
  // the matched tokens are <mark>-highlighted in the title + author (niqqud-insensitive, word-level via
  // markSegments); otherwise plain text.
  const ftsQ = (opts && opts.openOpts && opts.openOpts.ftsQuery) || '';
  const qToks = ftsQ ? ftsQueryTokens(ftsQ) : null;
  const title = el('span', { class: 'corpus-work-title' });
  if (qToks && qToks.length) appendMarkedHebrew(title, card.title || '—', qToks); else title.textContent = card.title || '—';
  if (HEBREW_RE.test(card.title || '')) title.setAttribute('dir', 'rtl');
  col.appendChild(title);
  // In cross-author contexts (global results) show the author under the title.
  if (opts && opts.showAuthor && card.author) {
    const a = el('span', { class: 'corpus-work-author' });
    if (qToks && qToks.length) appendMarkedHebrew(a, card.author, qToks); else a.textContent = card.author;
    if (HEBREW_RE.test(card.author)) a.setAttribute('dir', 'rtl');
    col.appendChild(a);
  }
  const meta = el('div', { class: 'corpus-work-meta' });
  const len = corpusLengthLabel(card);
  if (len) meta.appendChild(el('span', { class: 'corpus-work-len', text: len }));
  if (card.genre) meta.appendChild(el('span', { class: 'corpus-work-genre', text: corpusGenreLabel(card.genre) }));
  if (openable) {
    meta.appendChild(corpusProvBadge('rs', card.review_status));
    meta.appendChild(corpusProvBadge('audio', card.audio_status));
  } else {
    meta.appendChild(el('span', { class: 'prov-badge later', i18n: 'room.corpus.later', text: tt('room.corpus.later') }));
  }
  col.appendChild(meta);
  row.appendChild(col);
  const cta = el('span', { class: 'corpus-work-cta', text: openable ? '▶' : '⏳' });
  row.appendChild(cta);
  if (openable) {
    row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0');
    const open = () => openCorpusWork(card, opts && opts.openOpts);   // BRR-P2-005 — FTS: open at matched row
    row.addEventListener('click', open);
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  } else {
    row.setAttribute('aria-disabled', 'true');
  }
  // BRR-S1 — lazy bilingual snippet of the matched line (ready hits in a search context only).
  if (openable && ftsQ && card.file) observeRowSnippet(row, card, ftsQ);
  return row;
}

function wireChrome() {
  const lang = $('roomLang');
  if (lang) {
    try { lang.value = (window.appGetLocale && window.appGetLocale()) || 'ru'; } catch (_) {}
    lang.addEventListener('change', (e) => { try { window.appSetLocale && window.appSetLocale(e.target.value); } catch (_) {} });
  }
  TRACKS.forEach((t) => {
    const btn = $(TAB_ID[t]);
    if (btn) btn.addEventListener('click', () => setActiveTrack(t));
  });
  // Theme toggle (light/dark/auto) — premium parity with Studio.
  const themeBtn = $('roomTheme');
  if (themeBtn) themeBtn.addEventListener('click', cycleTheme);
  applyTheme(getTheme());   // set icon/title (body class already applied no-flash pre-paint)
  // Footer «О Зале» modal: open from the link + version label; close on backdrop/✕/Esc.
  const aboutLink = $('roomAboutLink');
  if (aboutLink) aboutLink.addEventListener('click', (e) => { e.preventDefault(); openRoomAbout(); });
  const verEl = $('roomFooterVersion');
  if (verEl) verEl.addEventListener('click', openRoomAbout);
  const aboutModal = $('roomAbout');
  if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') === '1') closeRoomAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRoomAbout(); });
  // Embedded reader chrome.
  const back = $('readerBack');
  if (back) back.addEventListener('click', closeReader);
  const readAloud = $('roomReadAloud');
  if (readAloud) readAloud.addEventListener('click', toggleReadAloud);   // BRR-P1-008 karaoke
  const aidsToggle = $('readerAidsToggle');
  // BRR-P1-006 — one-time discoverability nudge: pulse the «Аа» button until the reader first
  // opens the aids panel (the scaffolding fade/reveal live there). No dark pattern — pulses, then quiet.
  if (aidsToggle && !aidsHinted()) aidsToggle.classList.add('aids-hint');
  if (aidsToggle) aidsToggle.addEventListener('click', () => {
    const panel = $('readerAids');
    if (!panel) return;
    const opening = panel.hidden;
    if (opening) { buildAidsPanel(); aidsToggle.classList.remove('aids-hint'); aidsHintedSet(); }
    panel.hidden = !opening;
    aidsToggle.setAttribute('aria-expanded', String(opening));
  });
  // Re-apply translations to dynamically-built nodes when the language changes; the
  // reader table is built in JS (no data-i18n), so re-render it from cached rows if open.
  document.addEventListener('i18n:changed', () => {
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    try { applyTheme(getTheme()); } catch (_) {}   // re-localize the theme toggle title
    try { const r = $('roomReader'); if (r && !r.hidden && readerRows.length) rerenderReader(); } catch (_) {}
    // Corpus nav builds dynamic labels (counts, "показать ещё") in JS — re-render it on
    // locale change so they re-translate, but only when the reader isn't covering it.
    try { const rd = $('roomReader'); if (activeTrack === 'corpus' && (!rd || rd.hidden)) renderCorpus(); } catch (_) {}
    // Aids <option> labels are built once (not data-i18n) — rebuild them on locale change.
    try { const panel = $('readerAids'); if (panel && !panel.hidden) buildAidsPanel(); } catch (_) {}
  });
}

async function boot() {
  loadReaderCfg();   // BRR-P1-006 — restore persisted scaffolding modes before any reader render
  wireChrome();
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  registerRoomServiceWorker();   // PWA update toast «Обновить» (works even if opened directly)
  loadRoomVersion();             // footer + «О Зале» version from /api/client-config
  maybeStartWkDebug();           // BRR-P1-008b ?wkdebug=1 on-device karaoke diagnostic
  try {
    await localDb.initLocalDB();
    if (localDb.isFollower && localDb.isFollower()) {
      if (validateRequested()) { showValidationOverlay(VALIDATE_DBBUSY_MSG); return; }
      showState('room.state.dbBusy', '📑'); return;
    }
    await autoImportCanon();   // publish the shipped canon shelf on first visit (idempotent)
    await loadData();
    await loadCorpusCatalog(); // BRR-P0-007 Проход-3 — catalog-driven "Корпус" track (served-on-open)
    // Default to the Корпус (Reading Room) track when its catalog is available — the bilingual
    // canon with morphology-on-tap now leads. Fall back to the on-ramp tracks only if the corpus
    // root didn't load or is empty (mirrors the tabCorpus un-hide condition in loadCorpusCatalog).
    if (corpusRoot && corpusRoot.counts && corpusRoot.counts.works > 0) {
      activeTrack = 'corpus';
    } else if (!(shelvesByTrack.accessible || []).length && (shelvesByTrack.literary || []).length) {
      activeTrack = 'literary';
    }
    setActiveTrack(activeTrack);
    maybeRunValidation();   // BRR-P1-007 §7: ?validate=1 runs on-device real-profile validation
  } catch (e) {
    if (e instanceof localDb.DbUnavailableError) {
      _wkBootErr = 'DbUnavailable: ' + ((e && e.message) || '');
      if (validateRequested()) { showValidationOverlay(VALIDATE_DBBUSY_MSG); return; }
      showState('room.state.dbBusy', '📑'); return;
    }
    _wkBootErr = (e && (e.message || e.name)) ? ((e.name || 'Error') + ': ' + (e.message || '')) : String(e);
    try { console.error('[room] init failed:', e); } catch (_) {}
    showState('room.state.error', '⚠️');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Exposed for the screenshot/smoke harness to await readiness.
window.__roomReady = true;
