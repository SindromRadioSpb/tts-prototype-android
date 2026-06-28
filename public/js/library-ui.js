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
const TRANSLIT_DATA_REV = 1;     // BRR-S18 — bump when build-translit-index output changes within a catalog version
let corpusFtsSeq = 0;            // BRR-P2-006a — monotonic render token: a superseded FTS query's late results never paint
let corpusReadyById = null;      // Map(id -> full ready card) for opening result rows
let corpusFilter = { q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeEra: '' }; // active global filter (readableOnly = S7 i+1 zone; exactForm = S9 literal-form mode; hasAudio/reviewed = S16 provenance; scopeAuthor/scopeEra = S11 scoped search)
let corpusSearchInputEl = null;     // S12 — ref so recent/suggestion chips can set the query
let corpusRecentsEl = null;         // S12 — recents/suggestions row (under the filter bar)
const RECENTS_KEY = 'corpus_recent_searches_v1';
const CORPUS_SUGGESTIONS = ['אהבה', 'מלך', 'לב', 'חיים', 'שלום', 'ירושלים'];   // S12 cold-start prompts (high-frequency, R7-honest)
// BRR-S13 — saved searches + reading list. localStorage (not the shelves table): a corpus work is
// served-on-open (NOT an OPFS text), so the shelf renderer would show it «unavailable»; localStorage +
// the corpus card flow renders + opens it correctly, device-local, no migration. (Multiple named lists =
// documented follow-up; v1 ships one «Читать позже» list + multiple saved searches.)
const SAVED_SEARCHES_KEY = 'corpus_saved_searches_v1';
const READING_LIST_KEY = 'corpus_reading_list_v1';
const _lsGet = (k) => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const _lsSet = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (_) {} };
function _filtersExpanded() { try { return localStorage.getItem('corpus_filters_expanded') === '1'; } catch (_) { return false; } }   // BRR-P3 «⚙»
function _setFiltersExpanded(v) { try { localStorage.setItem('corpus_filters_expanded', v ? '1' : '0'); } catch (_) {} }
function getSavedSearches() { return _lsGet(SAVED_SEARCHES_KEY); }
function saveCurrentSearch() {
  const f = corpusFilter; const name = corpusFilterSummary();
  const entry = { name: name, f: { q: f.q, genre: f.genre, lang: f.lang, readyOnly: f.readyOnly, readableOnly: f.readableOnly, exactForm: f.exactForm, hasAudio: f.hasAudio, reviewed: f.reviewed, scopeAuthor: f.scopeAuthor, scopeEra: f.scopeEra } };
  const a = getSavedSearches().filter((x) => x.name !== name);   // dedup by human name
  a.unshift(entry); _lsSet(SAVED_SEARCHES_KEY, a.slice(0, 20));
}
function removeSavedSearch(name) { _lsSet(SAVED_SEARCHES_KEY, getSavedSearches().filter((x) => x.name !== name)); }
function restoreSavedSearch(f) {
  corpusFilter = Object.assign({ q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeEra: '' }, f || {});
  if (corpusFilter.readableOnly) { ensureReadableSet().then(() => corpusNavTo('home')).catch(() => corpusNavTo('home')); }
  else corpusNavTo('home');
}
// BRR-P3 — multiple NAMED reading lists. Schema `corpus_reading_lists_v1` = [{id,name,items:[card]}]; the
// v1 flat «Читать позже» (`corpus_reading_list_v1`) is migrated once into a default list. localStorage
// (corpus works are served-on-open, not OPFS texts — see [[project_search_discovery_closure]]).
const READING_LISTS_KEY = 'corpus_reading_lists_v1';
function getReadingLists() {
  let lists = _lsGet(READING_LISTS_KEY);
  if (!lists.length) {
    const old = _lsGet(READING_LIST_KEY);
    lists = [{ id: 'default', name: tt('room.corpus.lists.defaultName', 'Читать позже'), items: old }];
    if (old.length) _lsSet(READING_LISTS_KEY, lists);   // persist only if there was something to migrate
  }
  return lists;
}
function saveReadingLists(lists) { _lsSet(READING_LISTS_KEY, lists); }
function isInAnyList(id) { id = String(id); return getReadingLists().some((L) => (L.items || []).some((x) => String(x.id) === id)); }
// `ready` (optional) is the AUTHORITATIVE readiness flag from the render context (openable). It wins
// over the file&&text_key heuristic so a non-ready work — even one whose catalog card happens to carry
// a file/text_key path before it is baked — is stored honestly as r:false (R8 — never a dead-end open).
function cardToListItem(card, ready) { return { id: card.id, text_key: card.text_key || '', file: card.file || '', title: card.title || '', author: card.author || '', r: ready != null ? !!ready : !!(card.file && card.text_key), era: card.era || '', genre: card.genre || '' }; }
function toggleItemInList(listId, card, ready) {
  const lists = getReadingLists(); const L = lists.find((x) => x.id === listId); if (!L) return false;
  L.items = L.items || []; const id = String(card.id); const i = L.items.findIndex((x) => String(x.id) === id);
  if (i >= 0) { L.items.splice(i, 1); saveReadingLists(lists); return false; }
  L.items.unshift(cardToListItem(card, ready)); if (L.items.length > 300) L.items = L.items.slice(0, 300);
  saveReadingLists(lists); return true;
}
function createReadingList(name) {
  const lists = getReadingLists();
  const L = { id: 'l-' + Date.now() + Math.random().toString(36).slice(2, 6), name: String(name || '').trim() || tt('room.corpus.lists.untitled', 'Список'), items: [] };
  lists.unshift(L); saveReadingLists(lists); return L;
}
function deleteReadingList(listId) { saveReadingLists(getReadingLists().filter((x) => x.id !== listId)); }
function removeItemFromList(listId, id) {
  const lists = getReadingLists(); const L = lists.find((x) => x.id === listId); if (!L) return;
  L.items = (L.items || []).filter((x) => String(x.id) !== String(id)); saveReadingLists(lists);
}
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
// Epic 8a — first-open discoverability tip strip (one-time, localStorage flag).
function readerTipSeen() { try { return localStorage.getItem('room.readerTipSeen') === '1'; } catch (_) { return true; } }
function readerTipSeenSet() { try { localStorage.setItem('room.readerTipSeen', '1'); } catch (_) {} }
// Dismissible, NON-modal strip above the reader naming the Room's core gestures (tap-word→card,
// long-press→status, 📚 Учить, ▶ row-audio) — they have no other affordance. Shown ONCE; reuses
// el()/tt(); reduced-motion-safe. Owner: not a blocking modal (≠ the suppressed Studio modal).
function showReaderTip() {
  const tip = $('readerTip');
  if (!tip) return;
  if (readerTipSeen()) { tip.hidden = true; return; }
  tip.innerHTML = '';
  // Two CONTROLLED lines — group the two reading gestures on line 1, the two study gestures on
  // line 2. Never free-wrap mid-phrase (premium UI: a logical group must not split across lines).
  const txt = el('div', { class: 'reader-tip-txt' });
  txt.appendChild(el('span', { class: 'reader-tip-line', i18n: 'room.onboard.readerTip1', text: tt('room.onboard.readerTip1', '👆 тап — разбор · долгий тап — статус') }));
  txt.appendChild(el('span', { class: 'reader-tip-line', i18n: 'room.onboard.readerTip2', text: tt('room.onboard.readerTip2', '📚 Учить — словарь · ▶ строка — озвучка') }));
  tip.appendChild(txt);
  const x = el('button', { class: 'reader-tip-x', text: '✕', attrs: { type: 'button', 'aria-label': tt('room.morph.close', 'Закрыть') } });
  x.addEventListener('click', () => { tip.hidden = true; readerTipSeenSet(); });
  tip.appendChild(x);
  tip.hidden = false;
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
// Epic 8b — post-render SR/lang tagging of the painted bilingual table (parity-safe: mutates the
// DOM AFTER reader-core paints; the byte-parity builder is untouched). Lets a screen reader switch
// voice per column (Hebrew vs Russian). Idempotent.
function tagReaderTableLang(mount) {
  if (!mount) return;
  mount.querySelectorAll('#proTable tbody td[data-col="he"], #proTable tbody td[data-col="niqqud"]').forEach((td) => td.setAttribute('lang', 'he'));
  mount.querySelectorAll('#proTable tbody td[data-col="ru"]').forEach((td) => td.setAttribute('lang', 'ru'));
  mount.querySelectorAll('#proTable tbody td[data-col="translit"]').forEach((td) => td.setAttribute('lang', 'he-Latn'));
}
// Epic 8b — minimal focus management (WCAG 2.4.3): move focus INTO an opened sheet (its close
// button) and RESTORE it to the trigger on close. Shared by the room sheets (study/consent);
// the morphology card manages its own (reader-morph). Soft (no full trap — v2 backlog).
let _roomFocusReturn = null;
function roomFocusInto(container) {
  try { _roomFocusReturn = document.activeElement; } catch (_) { _roomFocusReturn = null; }
  if (!container) return;
  const f = container.querySelector('button, [tabindex="0"], input, select, a[href]') || container;
  try { if (f && f.focus) f.focus(); } catch (_) {}
}
function roomFocusRestore() {
  try { if (_roomFocusReturn && _roomFocusReturn.focus) _roomFocusReturn.focus(); } catch (_) {}
  _roomFocusReturn = null;
}
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

// Epic-3a — pronounce a single Hebrew word (card headword). BYOK GCP TTS (WaveNet quality) when
// a key is set, else keyless browser SpeechSynthesis. Self-contained (no row timing/caching),
// offline-safe (any GCP failure falls back to browser — no dead-end). Same /api/tts contract as rows.
let _wordAudio = null;
function browserSpeakWord(he) {
  try {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const u = new SpeechSynthesisUtterance(he);
    u.lang = 'he-IL'; u.rate = 0.9;
    try { const v = (window.speechSynthesis.getVoices() || []).find((x) => /^(he|iw)/i.test(x.lang || '')); if (v) u.voice = v; } catch (_) {}
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch (_) {}
}
async function speakWord(text) {
  const he = String(text || '').trim();
  if (!he) return;
  const key = gcpTtsKey();
  if (!key) { browserSpeakWord(he); return; }                 // keyless → browser
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: he, language: 'he-IL', voiceId: '', speakingRate: 0.95, pitch: 0.0, gcpTtsApiKey: key, withTimepoints: false }) });
    if (!r.ok) throw new Error('tts ' + r.status);
    const res = await r.json();
    let src = '';
    if (res && res.assetKey) src = '/api/audio/' + encodeURIComponent(String(res.assetKey).trim());
    else if (res && res.audioContent) { const bytes = Uint8Array.from(atob(res.audioContent), (c) => c.charCodeAt(0)); src = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })); }
    if (!src) throw new Error('no audio');
    if (!_wordAudio) _wordAudio = new Audio();
    try { _wordAudio.pause(); } catch (_) {}
    _wordAudio.src = src; await _wordAudio.play();
  } catch (_) { browserSpeakWord(he); }                       // GCP miss/offline → browser, never a dead-end
}

// BRR-P1-009 — word-status colouring (opt-in). The lemmaKey→state map is built once
// per reader session from the user's OPFS notes; enabling the toggle warms the morph
// engine (3.3 MB dict) + paints, so the DEFAULT reader-open stays light + offline-cheap.
let readerWordStates = null; // cached {lemmaKey: state}
let readerWordStatesLoading = null; // single-flight guard (S3: 796 cards call ensureWordStates at once)
function wordStatusEnabled() { try { return localStorage.getItem('room.wordStatus') === '1'; } catch (_) { return false; } }
function wordStatusSet(v) { try { localStorage.setItem('room.wordStatus', v ? '1' : '0'); } catch (_) {} }
// Tier-3 «точный режим» (context disambiguation). Owner choice: AUTO on every tap once the
// user gives a one-time consent (the outbound to Dicta is privacy-sensitive — R5). The
// provider is ALWAYS wired; it gates per-tap on the consent state ('granted'|'declined'|'').
// On the first tap while undecided it resolves OFFLINE and raises a one-time consent prompt.
// Per-sentence promise cache so multiple taps in one row = one Dicta call; cleared on (re)attach.
function contextConsent() {
  try {
    const c = localStorage.getItem('room.contextConsent');
    if (c === 'granted' || c === 'declined') return c;
    if (localStorage.getItem('room.contextMode') === '1') return 'granted';   // migrate legacy opt-in
    return '';
  } catch (_) { return ''; }
}
function contextConsentSet(v) {
  try { localStorage.setItem('room.contextConsent', v); localStorage.setItem('room.contextMode', v === 'granted' ? '1' : '0'); } catch (_) {}
}
let _ctxCache = new Map();
let _ctxConsentAsked = false;          // session debounce for the prompt
function makeContextProvider() {
  return async function (sentence, surface) {
    const consent = contextConsent();
    if (consent === 'declined') return null;
    if (consent !== 'granted') { promptContextConsent(); return null; }   // undecided → ask once, offline this tap
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
// One-time consent prompt (R5): explains the outbound, then auto-fires on every tap if granted.
function promptContextConsent() {
  if (_ctxConsentAsked || contextConsent()) return;
  _ctxConsentAsked = true;
  const overlay = el('div', { class: 'room-consent-overlay' });
  const box = el('div', { class: 'room-consent', attrs: { role: 'dialog', 'aria-modal': 'true' } });
  box.appendChild(el('div', { class: 'room-consent-title', i18n: 'room.morph.consentTitle', text: tt('room.morph.consentTitle', 'Уточнять значения по контексту?') }));
  box.appendChild(el('div', { class: 'room-consent-body', i18n: 'room.morph.consentBody', text: tt('room.morph.consentBody', 'Точный режим отправляет предложение в облако Dicta при каждом тапе по слову, чтобы выбрать значение по контексту (гомографы). Машинный разбор, не носитель. Можно отключить в «Подсказках чтения».') }));
  const actions = el('div', { class: 'room-consent-actions' });
  const no = el('button', { class: 'room-consent-no', i18n: 'room.morph.consentNo', text: tt('room.morph.consentNo', 'Не сейчас') });
  const yes = el('button', { class: 'room-consent-yes', i18n: 'room.morph.consentYes', text: tt('room.morph.consentYes', 'Включить') });
  const finish = (v) => { contextConsentSet(v); try { overlay.remove(); } catch (_) {} };
  no.addEventListener('click', () => finish('declined'));
  yes.addEventListener('click', () => { finish('granted'); roomToast(tt('room.morph.consentOn', 'Точный режим включён')); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { try { overlay.remove(); } catch (_) {} } });   // dismiss = undecided (asks again next session)
  actions.appendChild(no); actions.appendChild(yes); box.appendChild(actions); overlay.appendChild(box);
  document.body.appendChild(overlay);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
// Epic-2 #2 — per-card refine. canRefine() decides whether the card OFFERS the «уточнить»
// button: only when ONLINE and the global auto-mode is OFF (granted users already auto-refine
// every tap, so the button would be redundant). Offline → false → the card hides it (R5: no
// outbound affordance when we couldn't reach Dicta anyway). makeRefineProvider does the ONE-OFF
// Dicta call WITHOUT consulting consent — the explicit per-card confirm is the consent.
function canRefine() { try { return !!navigator.onLine && contextConsent() !== 'granted'; } catch (_) { return false; } }
function makeRefineProvider() {
  return async function (sentence, surface) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;   // never reach out offline
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

// ── Epic 4.3a+ — «📚 Учить» → premium frontier-vocabulary sheet (A+B+C+D) ─────────
// Collect the reader's new words (ReaderMorph.collectNewWords — confident content words still
// new/unset, freq-ranked) into a full vocabulary surface: total count + progressive chunks (A) ·
// scope «весь текст / дальше по тексту» (B) · frequency-band filter + soft «возможно имя» flag +
// hide-names (C) · sort + bulk «видимые → знаю/игнор» (D). One-tap status → setWordStatus →
// repaint (manual-wins, NO flashcard — same word_status store). Self-contained over the morph
// engine + the manual status store; Room-only, parity-safe. Plan: BRR_EPIC4_3A_STUDY_LIST_PREMIUM.
const STUDY_STATUS_OPTS = [
  ['new', 'room.morph.status.new', 'новое'], ['l1', null, '1'], ['l2', null, '2'], ['l3', null, '3'], ['l4', null, '4'],
  ['known', 'room.morph.status.known', 'знаю'], ['ignore', 'room.morph.status.ignore', 'игнор'],
];
// A9 — localized label for a status code (used in the training level-move «новое → 1», not raw codes).
function statusLabel(code) {
  const o = STUDY_STATUS_OPTS.find((x) => x[0] === code);
  return o ? (o[1] ? tt(o[1], o[2]) : o[2]) : String(code || '');
}
const STUDY_CHUNK = 20;   // progressive render batch (A) — 973-word frontiers never blow up the DOM
let _studySheet = null;
let _studyAll = [];       // full collected frontier for the current scope (FIXED until scope change / re-open)
let _studyView = { scope: 'all', sort: 'freq', band: 'all', hideNames: false, shown: STUDY_CHUNK };
let _studyMode = 'list';  // 'list' (📚 collect/mark) | 'train' (🎯 4.3b cloze recall)
let _trainSession = null; // { items, pool, idx, total, correct, levelUps, answered }
function uiDirRoom() { return (document.documentElement && document.documentElement.getAttribute('dir')) || 'ltr'; }

// ── Epic 4.3b Phase D3 — visible due-counter «В работе: N · К повторению: M» ────────────────────
// Makes the (otherwise invisible) SRS schedule legible → closes the feedback loop and gives a reason
// to return. TWO GLOBAL numbers, computed with NO morph scan: «В работе» = words you're actively
// learning (l1–l4, from the already-loaded status map), «К повторению» = SCHEDULED words due now
// (getSrsSchedule overdue, «ignore» excluded). Pure arithmetic lives in ReaderMorph.dueCounts (gated).
// Scope = ALL your words (the daily-review habit is cross-text; serving them in any text is D2).
let _dueCounts = null;
function _dueBadgeEl(extraClass) {
  const box = el('div', { class: 'reader-aids-duebadge' + (extraClass ? ' ' + extraClass : ''), attrs: { 'data-due-badge': '1', dir: uiDirRoom() } });
  box.hidden = true;
  const grp = (labelKey, labelFb, numAttr) => {
    const g = el('span', { class: 'db-group' });
    g.appendChild(el('span', { class: 'db-k', i18n: labelKey, text: tt(labelKey, labelFb) }));
    g.appendChild(el('span', { class: 'db-sep', text: ': ' }));
    g.appendChild(el('b', { class: 'db-n', text: '0', attrs: { [numAttr]: '1' } }));
    return g;
  };
  box.appendChild(grp('room.morph.study.inProgress', 'В работе', 'data-due-inprogress'));
  box.appendChild(grp('room.morph.study.due', 'К повторению', 'data-due-now'));
  return box;
}
function _paintDueBadge(box, c) {
  const show = !!(c && (c.inProgress > 0 || c.dueNow > 0));
  box.hidden = !show;
  if (!show) return;
  const ip = box.querySelector('[data-due-inprogress]'); if (ip) ip.textContent = String(c.inProgress);
  const dn = box.querySelector('[data-due-now]'); if (dn) dn.textContent = String(c.dueNow);
  box.classList.toggle('has-due', c.dueNow > 0);   // accent only when something is actually due now
}
async function refreshDueBadge() {
  if (!window.ReaderMorph || typeof window.ReaderMorph.dueCounts !== 'function') return;
  let states = readerWordStates, schedule = {};
  try { if (!states) states = (await ensureWordStates()) || {}; } catch (_) { states = states || {}; }
  try { schedule = (await localDb.getSrsSchedule()) || {}; } catch (_) { schedule = {}; }
  _dueCounts = window.ReaderMorph.dueCounts(states || {}, schedule, Date.now());
  document.querySelectorAll('[data-due-badge]').forEach((b) => _paintDueBadge(b, _dueCounts));
}
// Humanize a future due-instant → { n, unit:'d'|'h' } for the «next review in …» summary line.
function _humanizeUntil(ms, nowMs) {
  const d = Math.max(0, (Number(ms) || 0) - (Number(nowMs) || 0));
  const days = Math.round(d / 86400000);
  if (days >= 1) return { n: days, unit: 'd' };
  return { n: Math.max(1, Math.round(d / 3600000)), unit: 'h' };
}
function ensureStudySheet() {
  if (_studySheet) return _studySheet;
  const sheet = el('div', { class: 'room-study', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': tt('room.morph.study.title', '📚 Учить новые слова') } });
  sheet.hidden = true;
  const card = el('div', { class: 'room-study-card' });
  card.appendChild(el('button', { class: 'room-study-x', text: '✕', attrs: { type: 'button', 'data-study-close': '1', 'aria-label': tt('room.morph.close', 'Закрыть') } }));
  const head = el('div', { class: 'room-study-head' });
  head.appendChild(el('span', { class: 'room-study-title', i18n: 'room.morph.study.title', text: tt('room.morph.study.title', '📚 Учить новые слова') }));
  head.appendChild(el('span', { class: 'room-study-total' }));   // «Новых слов: N»
  card.appendChild(head);
  card.appendChild(_dueBadgeEl('room-study-duebadge'));   // D3 — «В работе / К повторению» (both modes)
  // 4.3b — «Список / Тренировка» mode toggle (owner decision 4)
  const modeRow = el('div', { class: 'room-study-modetoggle', attrs: { dir: uiDirRoom() } });
  modeRow.appendChild(el('button', { class: 'room-study-seg on', i18n: 'room.morph.study.modeList', text: tt('room.morph.study.modeList', '📋 Список'), attrs: { type: 'button', 'data-study-mode': 'list' } }));
  modeRow.appendChild(el('button', { class: 'room-study-seg', i18n: 'room.morph.study.modeTrain', text: tt('room.morph.study.modeTrain', '🎯 Тренировка'), attrs: { type: 'button', 'data-study-mode': 'train' } }));
  card.appendChild(modeRow);
  card.appendChild(el('div', { class: 'room-study-controls' }));
  card.appendChild(el('div', { class: 'room-study-bulk' }));
  card.appendChild(el('div', { class: 'room-study-count' }));
  card.appendChild(el('div', { class: 'room-study-body' }));
  card.appendChild(el('div', { class: 'room-study-more' }));
  sheet.appendChild(el('div', { class: 'room-study-backdrop', attrs: { 'data-study-close': '1' } }));
  sheet.appendChild(card);
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('[data-study-close]')) { closeStudySheet(); return; }
    const md = t.closest('[data-study-mode]'); if (md) { setStudyMode(md.getAttribute('data-study-mode')); return; }
    const sb = t.closest('[data-study-status]'); if (sb) { onStudyStatusSet(sb); return; }
    const sp = t.closest('[data-study-speak]'); if (sp) { onStudySpeak(sp.closest('.room-study-row')); return; }
    const cd = t.closest('[data-study-card]'); if (cd) { onStudyExpand(cd.closest('.room-study-row')); return; }
    if (t.closest('[data-study-more]')) { _studyView.shown += STUDY_CHUNK; renderStudyBody(); return; }
    const bulk = t.closest('[data-study-bulk]'); if (bulk) { onStudyBulk(bulk.getAttribute('data-study-bulk')); return; }
    // 4.3b training
    const opt = t.closest('[data-train-opt]'); if (opt) { onTrainOption(opt); return; }
    if (t.closest('[data-train-submit]')) { onTrainSubmit(); return; }
    if (t.closest('[data-train-next]')) { onTrainNext(); return; }
    if (t.closest('[data-train-skip]')) { onTrainSkip(); return; }
    const tile = t.closest('[data-train-tile]'); if (tile) { onTrainTile(tile); return; }
    const unb = t.closest('[data-train-unbuild]'); if (unb) { onTrainUnbuild(+unb.getAttribute('data-train-unbuild')); return; }
    if (t.closest('[data-train-again]')) { startTraining(); return; }
    const tsp = t.closest('[data-train-speak]'); if (tsp) { try { speakWord(tsp.getAttribute('data-he') || ''); } catch (_) {} return; }
    if (t.closest('[data-train-rowspeak]')) { try { speakWord((_trainSession && _trainSession._built && _trainSession._built.sentence) || ''); } catch (_) {} return; }
    if (t.closest('[data-train-card]')) { onTrainCard(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (!_studySheet || _studySheet.hidden) return;
    if (e.key === 'Escape') { closeStudySheet(); return; }
    if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('[data-train-input]')) { e.preventDefault(); onTrainSubmit(); }
  });
  _studySheet = sheet;
  return sheet;
}
function closeStudySheet() { if (_studySheet) { _studySheet.hidden = true; _studySheet.classList.remove('room-study-open'); } _trainSession = null; roomFocusRestore(); try { refreshDueBadge(); } catch (_) {} }
// Show/hide the list-only chrome (controls/bulk/count/more) — hidden in «🎯 Тренировка».
function _studyListChrome(show) {
  if (!_studySheet) return;
  ['.room-study-controls', '.room-study-bulk', '.room-study-count', '.room-study-more'].forEach((sel) => {
    const e = _studySheet.querySelector(sel); if (e) e.style.display = show ? '' : 'none';
  });
}
function setStudyMode(mode) {
  _studyMode = mode === 'train' ? 'train' : 'list';
  if (_studySheet) _studySheet.querySelectorAll('[data-study-mode]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-study-mode') === _studyMode));
  _studyListChrome(_studyMode === 'list');
  if (_studyMode === 'list') renderStudyBody();
  else startTraining();
}

// View = filter (C: band + hide-names) then sort (D: freq[default, already freq-desc+stable] | alpha).
function studyFiltered() {
  const v = _studyView;
  let arr = _studyAll.filter((w) => {
    if (v.hideNames && w.nameSuspect) return false;
    if (v.band === '4plus') return w.freq >= 4;
    if (v.band === '2to3') return w.freq >= 2 && w.freq <= 3;
    if (v.band === 'rare') return w.freq === 1;
    return true;
  });
  if (v.sort === 'alpha') arr = arr.slice().sort((a, b) => String(a.surface || '').localeCompare(String(b.surface || ''), 'he'));
  return arr;   // freq → collectNewWords already returns freq-desc + stable tie-break
}
function studyRowEl(w) {
  const cur = w._status || '';
  const row = el('div', { class: 'room-study-row' });
  row.dataset.key = w.lemmaKey; row.dataset.cur = cur;
  row.dataset.he = w.niqqud || w.surface || '';   // vocalized form voiced on 🔊
  row.dataset.surface = w.surface || '';           // consonantal surface for the expand card
  const lead = el('div', { class: 'room-study-lead' });
  // Tap the word / gloss → expand the SAME rich tap-card (form-level analysis: present-tense
  // כּוֹתֵב → verb/paal + conjugation; not just the lemma gloss «писать»). 🔊 is a separate button →
  // pronounce via the wired speakWord (GCP WaveNet → keyless browser). Status buttons stay separate.
  const heWrap = el('div', { class: 'room-study-hewrap', attrs: { 'data-study-card': '1', role: 'button', tabindex: '0', 'aria-label': tt('room.morph.study.expand', 'Подробнее о слове') } });
  heWrap.appendChild(el('span', { class: 'room-study-he', text: w.niqqud || w.surface, attrs: { lang: 'he', dir: 'rtl' } }));
  if (w.nameSuspect) heWrap.appendChild(el('span', { class: 'room-study-nameflag', i18n: 'room.morph.study.nameSuspect', text: tt('room.morph.study.nameSuspect', 'возможно имя') }));
  heWrap.appendChild(el('button', { class: 'room-study-speak', text: '🔊', attrs: { type: 'button', 'data-study-speak': '1', 'aria-label': tt('room.morph.pronounce', 'Произнести') } }));
  lead.appendChild(heWrap);
  const meta = el('div', { class: 'room-study-meta', attrs: { 'data-study-card': '1' } });
  if (w.gloss) meta.appendChild(el('span', { class: 'room-study-gloss', text: w.gloss, attrs: { dir: 'ltr' } }));
  const subParts = [];
  if (w.root) subParts.push(w.root);
  if (w.freq > 1) subParts.push('×' + w.freq);
  if (subParts.length) meta.appendChild(el('span', { class: 'room-study-sub', text: subParts.join(' · '), attrs: { dir: 'rtl', lang: 'he' } }));
  lead.appendChild(meta);
  row.appendChild(lead);
  const sel = el('div', { class: 'rm-status room-study-sel', attrs: { dir: uiDirRoom() } });
  STUDY_STATUS_OPTS.forEach(([val, key, fb]) => {
    const lab = key ? tt(key, fb) : fb;
    const cls = 'rm-status-btn rm-status-' + val + (cur === val ? ' rm-status-active' : '');
    sel.appendChild(el('button', { class: cls, text: lab, attrs: { type: 'button', 'data-study-status': val } }));
  });
  row.appendChild(sel);
  return row;
}
// Rebuild count + list (chunked) + «показать ещё» from _studyAll + _studyView (no re-collect).
function renderStudyBody() {
  if (!_studySheet) return;
  const body = _studySheet.querySelector('.room-study-body');
  const countEl = _studySheet.querySelector('.room-study-count');
  const moreEl = _studySheet.querySelector('.room-study-more');
  const bulkEl = _studySheet.querySelector('.room-study-bulk');
  if (!body) return;
  const filtered = studyFiltered();
  const shown = Math.min(_studyView.shown, filtered.length);
  body.innerHTML = '';
  if (!filtered.length) {
    body.appendChild(el('div', { class: 'room-study-empty', i18n: 'room.morph.study.empty', text: tt('room.morph.study.empty', 'На этом экране нет новых слов для изучения 🎉') }));
  } else {
    for (let i = 0; i < shown; i++) body.appendChild(studyRowEl(filtered[i]));
  }
  if (countEl) countEl.textContent = filtered.length ? (tt('room.morph.study.shown', 'Показано') + ' ' + shown + ' / ' + filtered.length) : '';
  if (moreEl) {
    moreEl.innerHTML = '';
    if (shown < filtered.length) moreEl.appendChild(el('button', { class: 'room-study-morebtn', text: tt('room.morph.study.more', 'Показать ещё') + ' (' + (filtered.length - shown) + ')', attrs: { type: 'button', 'data-study-more': '1' } }));
  }
  if (bulkEl) bulkEl.style.display = filtered.length ? '' : 'none';
}
function renderStudyControls() {
  if (!_studySheet) return;
  const wrap = _studySheet.querySelector('.room-study-controls');
  const bulk = _studySheet.querySelector('.room-study-bulk');
  const total = _studySheet.querySelector('.room-study-total');
  if (total) total.textContent = tt('room.morph.study.total', 'Новых слов') + ': ' + _studyAll.length;
  if (wrap) {
    wrap.innerHTML = '';
    const seg = (key, fb, group, val, cur) => el('button', { class: 'room-study-seg' + (cur === val ? ' on' : ''), i18n: key, text: tt(key, fb), attrs: { type: 'button', ['data-study-' + group]: val } });
    // B — scope
    const scopeRow = el('div', { class: 'room-study-segrow', attrs: { dir: uiDirRoom() } });
    scopeRow.appendChild(seg('room.morph.study.scopeAll', 'Весь текст', 'scope', 'all', _studyView.scope));
    scopeRow.appendChild(seg('room.morph.study.scopeAhead', 'Дальше', 'scope', 'ahead', _studyView.scope));
    wrap.appendChild(scopeRow);
    // D — sort + C — band (selects)
    const mkSel = (labelKey, labelFb, group, opts) => {
      const lab = el('label', { class: 'room-study-sel-lab' });
      lab.appendChild(el('span', { i18n: labelKey, text: tt(labelKey, labelFb) }));
      const s = el('select', { attrs: { 'data-study-select': group, 'aria-label': tt(labelKey, labelFb) } });
      opts.forEach(([v, k, fb]) => { const o = el('option', { i18n: k, text: tt(k, fb), attrs: { value: v } }); if (v === _studyView[group]) o.setAttribute('selected', ''); s.appendChild(o); });
      lab.appendChild(s); return lab;
    };
    const selRow = el('div', { class: 'room-study-selrow', attrs: { dir: uiDirRoom() } });
    selRow.appendChild(mkSel('room.morph.study.sort', 'Сортировка', 'sort', [['freq', 'room.morph.study.sortFreq', 'по частоте'], ['alpha', 'room.morph.study.sortAlpha', 'по алфавиту']]));
    selRow.appendChild(mkSel('room.morph.study.band', 'Частота', 'band', [['all', 'room.morph.study.bandAll', 'все'], ['4plus', 'room.morph.study.band4', 'частые (4+)'], ['2to3', 'room.morph.study.band23', 'средние (2–3)'], ['rare', 'room.morph.study.bandRare', 'редкие (1)']]));
    wrap.appendChild(selRow);
    // C — hide names
    const hn = el('label', { class: 'room-study-check' });
    const cb = el('input', { attrs: { type: 'checkbox', 'data-study-hidenames': '1' } });
    cb.checked = !!_studyView.hideNames;
    hn.appendChild(cb);
    hn.appendChild(el('span', { i18n: 'room.morph.study.hideNames', text: tt('room.morph.study.hideNames', 'Скрыть возможные имена') }));
    wrap.appendChild(hn);
    // wire control changes (delegated change for selects/checkbox)
    wrap.querySelectorAll('[data-study-scope]').forEach((b) => b.addEventListener('click', () => { _studyView.scope = b.getAttribute('data-study-scope'); _studyView.shown = STUDY_CHUNK; recollectStudy(); }));
    wrap.querySelectorAll('[data-study-select]').forEach((s) => s.addEventListener('change', (e) => { _studyView[s.getAttribute('data-study-select')] = e.target.value; _studyView.shown = STUDY_CHUNK; renderStudyBody(); }));
    if (cb) cb.addEventListener('change', () => { _studyView.hideNames = cb.checked; _studyView.shown = STUDY_CHUNK; renderStudyBody(); });
  }
  if (bulk) {
    bulk.innerHTML = '';
    bulk.appendChild(el('span', { class: 'room-study-bulk-k', i18n: 'room.morph.study.bulkLabel', text: tt('room.morph.study.bulkLabel', 'Видимые:') }));
    bulk.appendChild(el('button', { class: 'room-study-bulk-btn', text: tt('room.morph.study.bulkKnown', '✓ знаю'), attrs: { type: 'button', 'data-study-bulk': 'known' } }));
    bulk.appendChild(el('button', { class: 'room-study-bulk-btn', text: tt('room.morph.study.bulkIgnore', '🚫 игнор'), attrs: { type: 'button', 'data-study-bulk': 'ignore' } }));
  }
}
async function onStudyStatusSet(btn) {
  const row = btn.closest ? btn.closest('.room-study-row') : null;
  if (!row) return;
  const lk = row.dataset.key;
  if (!lk) return;
  const val = btn.getAttribute('data-study-status');
  const st = (row.dataset.cur === val) ? '' : val;   // re-tap toggles off (→ new/unset)
  try { await localDb.setWordStatus(lk, st); } catch (_) {}
  row.dataset.cur = st;
  const w = _studyAll.find((x) => x.lemmaKey === lk); if (w) w._status = st;   // keep the row visible w/ new highlight (gentle; re-collect on re-open)
  row.querySelectorAll('.rm-status-btn').forEach((b) => b.classList.toggle('rm-status-active', b.getAttribute('data-study-status') === st));
  readerWordStates = null;
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}   // repaint the text — the wall recolours immediately
  try { refreshDueBadge(); } catch (_) {}    // D3 — «В работе» reflects the new level immediately
}
// 🔊 pronounce a study row's word (reuses the wired speakWord — GCP WaveNet → keyless browser).
function onStudySpeak(row) {
  if (!row) return;
  const he = row.dataset.he || '';
  if (he) { try { speakWord(he); } catch (_) {} }
}
// Expand a study row → the SAME rich tap-card (form-level analysis, conjugation, root family) the
// reader shows, so «писать» on כּוֹתֵב is resolved to its actual form (present m.sg.). Reuses
// ReaderMorph.openWordCard; the card stacks above the study sheet (z-index) and returns on close.
function onStudyExpand(row) {
  if (!row || !window.ReaderMorph || typeof window.ReaderMorph.openWordCard !== 'function') return;
  const surface = row.dataset.surface || row.dataset.he || '';
  const niqqud = row.dataset.he || '';
  if (!surface && !niqqud) return;
  try { window.ReaderMorph.openWordCard(surface, niqqud); } catch (_) {}
}
// D — bulk: set status on every CURRENTLY-VISIBLE word (filtered + shown) at once (fast name pruning).
async function onStudyBulk(status) {
  const filtered = studyFiltered();
  const shown = Math.min(_studyView.shown, filtered.length);
  const targets = filtered.slice(0, shown);
  if (!targets.length) return;
  for (const w of targets) { try { await localDb.setWordStatus(w.lemmaKey, status); } catch (_) {} w._status = status; }
  readerWordStates = null;
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}
  try { refreshDueBadge(); } catch (_) {}   // D3 — bulk mark updates «В работе»
  renderStudyBody();   // reflect the new highlights (rows stay visible)
  roomToast(tt('room.morph.study.bulkDone', 'Отмечено: ') + targets.length);
}
// Collect the frontier for the current scope (B), seed each word's live status, render.
async function recollectStudy() {
  const mount = $('roomReaderTable');
  if (!mount || !window.ReaderMorph || typeof window.ReaderMorph.collectNewWords !== 'function') return;
  const body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (body) { body.innerHTML = ''; body.appendChild(el('div', { class: 'room-study-loading', i18n: 'room.morph.study.loading', text: tt('room.morph.study.loading', 'Собираю новые слова…') })); }
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  let states = {}, words = [];
  try {
    states = (await ensureWordStates()) || {};
    const opts = {};
    if (_studyView.scope === 'ahead') { let top = 0; try { top = currentTopRowIdx() || 0; } catch (_) { top = 0; } opts.rowFrom = top; }
    words = await window.ReaderMorph.collectNewWords(mount, states, opts);   // NO topN → full frontier
  } catch (_) { words = []; }
  if (!_studySheet || _studySheet.hidden || _studyMode !== 'list') return;   // A6 — closed OR switched to Тренировка while collecting → don't clobber
  words.forEach((w) => { w._status = states[w.lemmaKey] || ''; });
  _studyAll = words;
  renderStudyControls();
  renderStudyBody();
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
async function roomOpenStudyList() {
  const mount = $('roomReaderTable');
  if (!mount || !window.ReaderMorph || typeof window.ReaderMorph.collectNewWords !== 'function') return;
  const sheet = ensureStudySheet();
  _studyView = { scope: 'all', sort: 'freq', band: 'all', hideNames: false, shown: STUDY_CHUNK };
  _studyMode = 'list'; _trainSession = null;
  sheet.querySelectorAll('[data-study-mode]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-study-mode') === 'list'));
  _studyListChrome(true);
  sheet.hidden = false; sheet.classList.add('room-study-open');
  roomFocusInto(sheet.querySelector('.room-study-card'));   // WCAG 2.4.3 — focus into the sheet
  try { refreshDueBadge(); } catch (_) {}   // D3 — populate the head badge on open
  await recollectStudy();
}

// ── Epic 4.3b — «🎯 Тренировка»: cloze recall in REAL sentences from the open text ──────────────
// Active recall closes the retention loop: a word the learner is studying is blanked in a real
// readerRows sentence → recognize (MC, escalates to typed by level) → gentle level move → repaint.
// Self-contained over ReaderMorph.collectReviewItems/buildCloze/nextLevel/isMcLevel/pickDistractors
// + setWordStatus + openWordCard + speakWord. Deterministic (no Math.random). Plan: BRR_EPIC4_3B.
const TRAIN_N = 12;
function _normHe(s) { return window.ReaderMorph.stripNiqqud(String(s || '')).replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ').trim(); }
// B5 — typed-answer tolerance: drop ONE leading proclitic (ו/ה/ב/כ/ל/ש/מ) so the bare lemma matches a
// proclitic-carrying sentence form and vice-versa. Conservative (single letter, length>2).
function _stripProclitic(s) { return (s && s.length > 2 && /^[והבכלשמ]/.test(s)) ? s.slice(1) : s; }
// Accepted normalized skeletons for a cloze: the inflected sentence form + the lemma, each with/without
// a leading proclitic. The typed/assembled answer is correct if its skeleton (or proclitic-stripped) is here.
function _acceptedSkeletons(answerForm, lemmaSurface) {
  const set = new Set();
  [answerForm, lemmaSurface].forEach((b) => { const n = _normHe(b || ''); if (n) { set.add(n); set.add(_stripProclitic(n)); } });
  return set;
}
// C1 — tap-letters production tier (mobile-friendly Hebrew input, no keyboard). Returns the answer's
// consonantal letters + 2 decoys, deterministically scrambled (seed = item index; NO Math.random).
const HE_LETTERS = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ל','מ','נ','ס','ע','פ','צ','ק','ר','ש','ת'];
function _letterTiles(skel, seed) {
  const base = Array.from(String(skel || ''));
  const decoys = [];
  for (let i = 0; i < HE_LETTERS.length && decoys.length < 2; i++) {
    const c = HE_LETTERS[(i + seed * 5 + 3) % HE_LETTERS.length];
    if (base.indexOf(c) < 0 && decoys.indexOf(c) < 0) decoys.push(c);
  }
  const all = base.concat(decoys);
  // deterministic permutation: stable-sort by a seeded key derived from position + char
  return all
    .map((ch, i) => ({ ch, k: (((i + 1) * 1103515245 + (seed + 1) * 12345 + ch.charCodeAt(0) * 131) >>> 0) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.ch);
}
// Session = learning (l1–l4) + new (active, freq-desc), with ~15% known-refresh interleaved (decision 2).
function buildTrainSession(all, nowMs) {
  const withOcc = (all || []).filter((x) => x.occ && x.occ.length);
  // C2 — time-based spacing: a word answered correctly recently waits its interval (srs_due > now);
  // never-tested or overdue words are DUE. Compose from due; if too few, top up with soonest-due.
  const isDue = (x) => !x._srs || !x._srs.due || x._srs.due <= nowMs;
  const due = withOcc.filter(isDue);
  const notDue = withOcc.filter((x) => !isDue(x)).sort((a, b) => (a._srs.due || 0) - (b._srs.due || 0));
  const learning = due.filter((x) => /^l[1-4]$/.test(x.status));
  const fresh = due.filter((x) => x.status === 'new');
  const known = due.filter((x) => x.status === 'known');
  const kRefresh = Math.min(known.length, Math.max(0, Math.round(TRAIN_N * 0.15)));
  const active = learning.concat(fresh).slice(0, TRAIN_N - kRefresh);
  const refresh = known.slice(0, kRefresh);
  const out = active.slice();
  if (refresh.length) {
    const step = Math.max(1, Math.floor((active.length + refresh.length) / (refresh.length + 1)));
    let pos = step;
    for (const r2 of refresh) { out.splice(Math.min(pos, out.length), 0, r2); pos += step + 1; }
  }
  const session = out.slice(0, TRAIN_N);
  if (session.length < TRAIN_N) {
    const have = new Set(session.map((x) => x.lemmaKey));
    for (const x of notDue) { if (session.length >= TRAIN_N) break; if (!have.has(x.lemmaKey)) session.push(x); }
  }
  return session;
}
async function startTraining() {
  const mount = $('roomReaderTable');
  const body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!mount || !body || !window.ReaderMorph || typeof window.ReaderMorph.collectReviewItems !== 'function') return;
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'room-study-loading', i18n: 'room.morph.study.loading', text: tt('room.morph.study.loading', 'Собираю…') }));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  let states = {}, all = [], schedule = {};
  try {
    states = (await ensureWordStates()) || {};
    schedule = (await localDb.getSrsSchedule()) || {};   // C2 — per-lemma review schedule
    all = await window.ReaderMorph.collectReviewItems(mount, states, {});
  } catch (_) { all = []; }
  if (!_studySheet || _studySheet.hidden || _studyMode !== 'train') return;
  if (_studyView.hideNames) all = all.filter((x) => !x.nameSuspect);   // A10 — honor the list's «скрыть имена» (also keeps names out of the distractor pool)
  all.forEach((x) => { x._srs = schedule[x.lemmaKey] || null; });      // C2 — attach schedule for due-aware composition
  // A3 — pre-build each item's cloze; keep only BUILDABLE ones so «X / N» counts only askable items
  // (a target whose skeleton isn't found in any of its sentences is dropped, not scored as a miss).
  const items = buildTrainSession(all, Date.now()).map((it) => { it._built = _trainBuildCloze(it); return it; }).filter((it) => it._built);
  _trainSession = { items, pool: all, idx: 0, total: items.length, correct: 0, levelUps: 0, answered: false };
  renderTrainItem();
}
// Sentence (he/he_niqqud/ru) for a row — readerRows is the fast path; fall back to the painted DOM
// row so training is self-contained (works even if readerRows is empty/desynced).
function _trainRowData(rowIdx) {
  const r = readerRows[rowIdx];
  if (r) return { he: String(r.he || ''), he_niqqud: String(r.he_niqqud || ''), ru: String(r.ru || '') };
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('#proTable tbody tr[data-row-idx="' + rowIdx + '"]');
  if (!tr) return null;
  const cell = (col) => { const td = tr.querySelector('td[data-col="' + col + '"]'); return td ? td.textContent : ''; };
  return { he: cell('he'), he_niqqud: cell('niqqud') || cell('he'), ru: cell('ru') };
}
// Pick the occurrence with the richest context (most word tokens), tie-break rowIdx asc → cloze.
// A1+A2: blank by SKELETON (buildClozeForTarget) — finds the target by its consonantal form (not the
// HE-column wordOffset, which can drift vs the he_niqqud tokenization) and blanks ALL its copies (no
// repeated-word leak). An occurrence where the target skeleton isn't found is unusable → skipped.
function _trainBuildCloze(item) {
  const R = window.ReaderMorph;
  const targetSkel = R.stripNiqqud(item.surface || item.niqqud || '');
  if (!targetSkel) return null;
  let best = null, bestCount = -1;
  for (const o of (item.occ || [])) {
    const data = _trainRowData(o.rowIdx);
    if (!data) continue;
    const sent = String(data.he_niqqud || data.he || '');
    const cz = R.buildClozeForTarget(R.tokenize(sent), targetSkel);
    if (!cz) continue;   // target not present in this sentence (offset drift / wrong row) → unusable
    const count = R.words(sent).length;
    if (count > bestCount || (count === bestCount && best && o.rowIdx < best.rowIdx)) { best = { cz, ru: data.ru, sentence: sent, rowIdx: o.rowIdx }; bestCount = count; }
  }
  return best;   // { cz:{answer,segments,count}, ru, sentence, rowIdx } | null
}
function renderTrainItem() {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  if (s.idx >= s.total) return renderTrainSummary();
  s.answered = false;
  const item = s.items[s.idx];
  const built = item._built || _trainBuildCloze(item);
  if (!built) { s.idx++; return renderTrainItem(); }   // safety (items were pre-filtered to buildable)
  s._built = built;
  // Escalation ladder: MC (recognition) for new/l1/l2 · tap-letters (assisted production, mobile-OK)
  // for l3/l4 · free typing (top production tier) only for known. A5 — too few honest distractors →
  // fall back to tap-letters (not free typing — keyboard-free on mobile).
  let mode = window.ReaderMorph.isMcLevel(item.status) ? 'mc' : (item.status === 'known' ? 'type' : 'tiles');
  let distractors = [];
  if (mode === 'mc') { distractors = window.ReaderMorph.pickDistractors(item, s.pool, 3); if (distractors.length < 3) mode = 'tiles'; }
  s._mode = mode;
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'room-train-progress', text: (s.idx + 1) + ' / ' + s.total }));
  // cloze sentence (vocalized) — segments blank EVERY copy of the target (A2) + an always-present 🔊
  // row-audio that plays the WHOLE sentence (owner decision A7: full audio incl. the target, as a hint).
  const clozeWrap = el('div', { class: 'room-train-clozewrap' });
  const cloze = el('div', { class: 'room-train-cloze', attrs: { dir: 'rtl', lang: 'he' } });
  (built.cz.segments || []).forEach((seg) => {
    if (seg.blank) cloze.appendChild(el('span', { class: 'room-train-blank', text: ' ____ ', attrs: { 'aria-label': tt('room.morph.study.blank', 'пропуск') } }));
    else cloze.appendChild(el('span', { text: seg.t }));
  });
  clozeWrap.appendChild(cloze);
  clozeWrap.appendChild(el('button', { class: 'room-study-speak room-train-rowspeak', text: '🔊', attrs: { type: 'button', 'data-train-rowspeak': '1', 'aria-label': tt('room.reader.readAloud', 'Озвучить строку') } }));
  body.appendChild(clozeWrap);
  // prompt = lemma gloss (the dictionary/infinitive form) …
  body.appendChild(el('div', { class: 'room-train-prompt', attrs: { dir: 'ltr' }, text: '✎ ' + (item.gloss || tt('room.morph.study.recall', 'вспомни слово')) }));
  // … PLUS the full row translation (context — the word in the sentence may be in a different form
  // than the infinitive gloss; the translation shows which). Owner request.
  if (built.ru) body.appendChild(el('div', { class: 'room-train-ctxq', attrs: { dir: 'ltr' }, text: built.ru }));
  if (mode === 'mc') {
    const opts = [{ key: item.lemmaKey, he: built.cz.answer, correct: true }].concat(
      distractors.map((d) => ({ key: d.lemmaKey, he: d.niqqud || d.surface, correct: false })));
    // deterministic placement: rotate by item index (no Math.random)
    const rot = s.idx % opts.length;
    const ordered = opts.slice(rot).concat(opts.slice(0, rot));
    const grid = el('div', { class: 'room-train-opts', attrs: { dir: 'rtl' } });
    ordered.forEach((o) => grid.appendChild(el('button', { class: 'room-train-opt', attrs: { type: 'button', 'data-train-opt': '1', 'data-correct': o.correct ? '1' : '0', lang: 'he', dir: 'rtl' }, text: o.he })));
    body.appendChild(grid);
  } else if (mode === 'type') {
    const inWrap = el('div', { class: 'room-train-inputwrap' });
    inWrap.appendChild(el('input', { class: 'room-train-input', attrs: { type: 'text', 'data-train-input': '1', dir: 'rtl', lang: 'he', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: tt('room.morph.study.typePlaceholder', 'впиши слово…') } }));
    inWrap.appendChild(el('button', { class: 'room-train-submit', i18n: 'room.morph.study.check', text: tt('room.morph.study.check', 'Проверить'), attrs: { type: 'button', 'data-train-submit': '1' } }));
    body.appendChild(inWrap);
  } else {
    // C1 — tap-letters: assemble the answer from scrambled letter tiles (+2 decoys), no keyboard.
    s._assembled = [];
    const targetSkel = window.ReaderMorph.stripNiqqud(item.surface || built.cz.answer || '');
    body.appendChild(el('div', { class: 'room-train-assemblehint', i18n: 'room.morph.study.assemble', text: tt('room.morph.study.assemble', 'Собери слово из букв') }));
    body.appendChild(el('div', { class: 'room-train-build', attrs: { dir: 'rtl', lang: 'he', 'data-train-build': '1' } }));
    const tilesWrap = el('div', { class: 'room-train-tiles', attrs: { dir: 'rtl' } });
    _letterTiles(targetSkel, s.idx).forEach((ch, i) => tilesWrap.appendChild(el('button', { class: 'room-train-tile', text: ch, attrs: { type: 'button', 'data-train-tile': String(i), lang: 'he' } })));
    body.appendChild(tilesWrap);
    body.appendChild(el('button', { class: 'room-train-submit', i18n: 'room.morph.study.check', text: tt('room.morph.study.check', 'Проверить'), attrs: { type: 'button', 'data-train-submit': '1' } }));
  }
  // B2 — «Не знаю»: reveal without guessing (honest no-recall, soft demotion).
  body.appendChild(el('button', { class: 'room-train-skip', i18n: 'room.morph.study.dontKnow', text: tt('room.morph.study.dontKnow', 'Не знаю'), attrs: { type: 'button', 'data-train-skip': '1' } }));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  if (mode === 'type') { const inp = body.querySelector('[data-train-input]'); if (inp) { try { inp.focus(); } catch (_) {} } }
}
function onTrainOption(btn) {
  if (!_trainSession || _trainSession.answered) return;
  const correct = btn.getAttribute('data-correct') === '1';
  // mark chosen + reveal the correct one
  const grid = btn.closest('.room-train-opts');
  if (grid) grid.querySelectorAll('.room-train-opt').forEach((b) => {
    if (b.getAttribute('data-correct') === '1') b.classList.add('room-train-ok');
    if (b === btn && !correct) b.classList.add('room-train-bad');
    b.disabled = true;
  });
  checkTrainAnswer(correct);
}
function onTrainSubmit() {
  if (!_trainSession || _trainSession.answered) return;
  const built = _trainSession._built, item = _trainSession.items[_trainSession.idx];
  const buildEl = _studySheet && _studySheet.querySelector('[data-train-build]');
  let val, target;
  if (buildEl) {   // C1 — tap-letters: read the assembled string
    val = _normHe((_trainSession._assembled || []).map((a) => a.ch).join(''));
    if (!val) return;
    target = buildEl;
  } else {
    const inp = _studySheet && _studySheet.querySelector('[data-train-input]');
    if (!inp) return;
    val = _normHe(inp.value);
    if (!val) { try { inp.focus(); } catch (_) {} return; }
    inp.disabled = true; target = inp;
  }
  const accepted = _acceptedSkeletons(built.cz.answer, item.surface);   // B5 — form OR lemma, ± proclitic
  const correct = accepted.has(val) || accepted.has(_stripProclitic(val));
  if (target) target.classList.add(correct ? 'room-train-ok' : 'room-train-bad');
  checkTrainAnswer(correct);
}
// C1 — tap-letters interactions: tap a tile → append to the build; tap a built letter → return it.
function _renderBuild() {
  const build = _studySheet && _studySheet.querySelector('[data-train-build]');
  if (!build) return;
  build.innerHTML = '';
  (_trainSession._assembled || []).forEach((a, pos) => build.appendChild(el('span', { class: 'room-train-builtch', text: a.ch, attrs: { 'data-train-unbuild': String(pos), lang: 'he' } })));
}
function onTrainTile(btn) {
  if (!_trainSession || _trainSession.answered || btn.disabled) return;
  _trainSession._assembled = _trainSession._assembled || [];
  _trainSession._assembled.push({ ch: btn.textContent, tileIdx: btn.getAttribute('data-train-tile') });
  btn.disabled = true; btn.classList.add('used');
  _renderBuild();
}
function onTrainUnbuild(pos) {
  if (!_trainSession || _trainSession.answered) return;
  const a = (_trainSession._assembled || [])[pos];
  if (!a) return;
  _trainSession._assembled.splice(pos, 1);
  const tile = _studySheet && _studySheet.querySelector('.room-train-tile[data-train-tile="' + a.tileIdx + '"]');
  if (tile) { tile.disabled = false; tile.classList.remove('used'); }
  _renderBuild();
}
// B2 — «Не знаю»/skip: reveal the answer without a blind guess; soft no-recall (nextLevel(false)),
// never counted correct. Honest "don't know" beats a 25%-lucky MC promotion.
function onTrainSkip() {
  if (!_trainSession || _trainSession.answered) return;
  const grid = _studySheet && _studySheet.querySelector('.room-train-opts');
  if (grid) grid.querySelectorAll('.room-train-opt').forEach((b) => { if (b.getAttribute('data-correct') === '1') b.classList.add('room-train-ok'); b.disabled = true; });
  const inp = _studySheet && _studySheet.querySelector('[data-train-input]');
  if (inp) inp.disabled = true;
  checkTrainAnswer(false, true);
}
async function checkTrainAnswer(correct, skipped) {
  const s = _trainSession; if (!s || s.answered) return;
  s.answered = true;
  const item = s.items[s.idx];
  const next = window.ReaderMorph.nextLevel(item.status, correct);
  const sched = window.ReaderMorph.nextSrs(item._srs, correct, Date.now());   // C2 — schedule the next review
  try { await localDb.setWordStatus(item.lemmaKey, next, sched); } catch (_) {}   // status + schedule in one write
  item._srs = sched;
  if (correct && next !== item.status) { s.correct++; s.levelUps++; }   // A8 — any promotion counts (incl. new→l1)
  else if (correct) { s.correct++; }
  const moved = (next !== item.status) ? (statusLabel(item.status) + ' → ' + statusLabel(next)) : '';   // A9 — localized, not raw codes
  item._from = item.status; item.status = next;
  readerWordStates = null;
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}   // repaint the reader behind
  try { refreshDueBadge(); } catch (_) {}    // D3 — schedule changed → badge + _dueCounts stay fresh for the summary
  renderTrainReveal(correct, moved, skipped);
}
function renderTrainReveal(correct, moved, skipped) {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  const item = s.items[s.idx], built = s._built;
  const cls = skipped ? 'room-train-reveal-skip' : (correct ? 'room-train-reveal-ok' : 'room-train-reveal-bad');
  const rev = el('div', { class: 'room-train-reveal ' + cls });
  rev.appendChild(el('div', { class: 'room-train-verdict', text: skipped ? tt('room.morph.study.skipped', '— Пропущено') : (correct ? tt('room.morph.study.correct', '✓ Верно') : tt('room.morph.study.wrong', '✗ Неверно')) }));
  const ansRow = el('div', { class: 'room-train-ansrow' });
  ansRow.appendChild(el('span', { class: 'room-train-ans', attrs: { lang: 'he', dir: 'rtl' }, text: built.cz.answer }));
  ansRow.appendChild(el('button', { class: 'room-study-speak', text: '🔊', attrs: { type: 'button', 'data-train-speak': '1', 'data-he': built.cz.answer, 'aria-label': tt('room.morph.pronounce', 'Произнести') } }));
  rev.appendChild(ansRow);
  if (item.gloss) rev.appendChild(el('div', { class: 'room-train-ansgloss', attrs: { dir: 'ltr' }, text: item.gloss }));
  if (moved && moved.indexOf('→') >= 0) rev.appendChild(el('div', { class: 'room-train-moved', text: moved }));
  if (built.ru) rev.appendChild(el('div', { class: 'room-train-ctx', attrs: { dir: 'ltr' }, text: built.ru }));
  const actions = el('div', { class: 'room-train-actions' });
  actions.appendChild(el('button', { class: 'room-train-card', i18n: 'room.morph.study.expand', text: tt('room.morph.study.expand', 'Подробнее'), attrs: { type: 'button', 'data-train-card': '1' } }));
  actions.appendChild(el('button', { class: 'room-train-next', text: tt('room.morph.study.next', 'Дальше →'), attrs: { type: 'button', 'data-train-next': '1' } }));
  rev.appendChild(actions);
  body.appendChild(rev);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  try { rev.scrollIntoView({ block: 'nearest' }); } catch (_) {}
}
function onTrainCard() {
  const s = _trainSession; if (!s || !s._built) return;
  const item = s.items[s.idx];
  try { window.ReaderMorph.openWordCard(item.surface || s._built.cz.answer, s._built.cz.answer); } catch (_) {}
}
function onTrainNext() {
  if (!_trainSession) return;
  _trainSession.idx++;
  renderTrainItem();
}
function renderTrainSummary() {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  body.innerHTML = '';
  if (!s.total) {
    body.appendChild(el('div', { class: 'room-study-empty', i18n: 'room.morph.study.trainEmpty', text: tt('room.morph.study.trainEmpty', 'Нет слов для тренировки на этом экране — отметь слова в «Список».') }));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    return;
  }
  const box = el('div', { class: 'room-train-summary' });
  box.appendChild(el('div', { class: 'room-train-score', text: tt('room.morph.study.done', 'Готово') + ': ' + s.correct + ' / ' + s.total }));
  if (s.levelUps) box.appendChild(el('div', { class: 'room-train-levelups', text: '↑ ' + s.levelUps + ' ' + tt('room.morph.study.levelUps', 'уровней') }));
  // D3 — closure feedback: more due right now, else when the next batch returns by the SRS schedule.
  try { refreshDueBadge(); } catch (_) {}   // keep the head badge fresh after the session (fire-and-forget)
  if (_dueCounts) {
    if (_dueCounts.dueNow > 0) {
      box.appendChild(el('div', { class: 'room-train-nextdue', text: tt('room.morph.study.dueMore', 'К повторению ещё') + ': ' + _dueCounts.dueNow }));
    } else if (_dueCounts.nextDue) {
      const h = _humanizeUntil(_dueCounts.nextDue, Date.now());
      const unit = h.unit === 'd' ? tt('room.morph.study.unitDays', 'дн.') : tt('room.morph.study.unitHours', 'ч.');
      box.appendChild(el('div', { class: 'room-train-nextdue', attrs: { dir: uiDirRoom() }, text: tt('room.morph.study.nextReview', 'Следующее повторение через') + ' ' + h.n + ' ' + unit }));
    }
  }
  const actions = el('div', { class: 'room-train-actions' });
  actions.appendChild(el('button', { class: 'room-train-next', i18n: 'room.morph.study.again', text: tt('room.morph.study.again', '🎯 Ещё'), attrs: { type: 'button', 'data-train-again': '1' } }));
  actions.appendChild(el('button', { class: 'room-train-card', i18n: 'room.morph.study.toList', text: tt('room.morph.study.toList', '📋 Список'), attrs: { type: 'button', 'data-study-mode': 'list' } }));
  box.appendChild(actions);
  body.appendChild(box);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
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
  try { invalidateReadableSet(); } catch (_) {}   // S7 — profile changed → recompute «Читаемые для меня»
  try { applyDecorations(); } catch (_) {}
  roomToast(tt('room.morph.savedToast', 'Слово сохранено в заметки'));
  if (!note) return { status: 'created' };
  let life = {}; try { life = await localDb.getWordNoteLifecycle([note.id]); } catch (_) {}
  return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || 'created' };
}
// T-b — manual translation for out-of-dict / unknown words. The card surfaces an editor
// when the resolver has no offline gloss; the user's own meaning lands in the SAME canonical
// word_study note (so it syncs to Anki + counts toward i+1), tagged meaning_source='user' so
// the card can mark it «ваш» (R9 provenance ≠ machine) and the resolver re-surfaces it on
// re-open. The dedup key is meaning-independent (pid:/lemma#pos), so lookup stays stable.
async function roomLookupUserMeaning(card) {
  const dk = roomDedupKey(card);
  if (!dk) return '';
  let note; try { note = await localDb.findNoteByDedupKey(dk); } catch (_) { note = null; }
  if (!note) return '';
  let body = {}; try { body = JSON.parse(note.body_json || '{}'); } catch (_) { body = {}; }
  return (body && body.meaning_source === 'user' && body.meaning) ? String(body.meaning) : '';
}
async function roomSaveUserMeaning(card, occ, meaning) {
  const m = String(meaning || '').trim();
  const dk = roomDedupKey(card);
  if (!dk || !m) return null;
  const body = roomNoteBody(card);
  body.meaning = m;
  body.meaning_source = 'user';   // R9 provenance — user-asserted, never machine
  let note; try { note = await localDb.findNoteByDedupKey(dk); } catch (_) { note = null; }
  if (note) {
    try { await localDb.updateNote(note.id, { body, user_touched: 1 }); } catch (e) { try { console.warn('[room] update meaning failed', e); } catch (_) {} return null; }
  } else {
    try {
      note = await localDb.createCanonicalNote({
        gen_dedup_key: dk, body, title: body.word || '', source: 'curated',
        confidence: typeof card.confidence === 'number' ? card.confidence : null,
        model_version: (window.InflectionDict && window.InflectionDict.MODEL) || null,
        user_touched: 1,
      });
    } catch (e) { try { console.warn('[room] save meaning failed', e); } catch (_) {} return null; }
  }
  if (note && occ && (occ.text_id || occ.sentence_id)) {
    try { await localDb.addNoteOccurrence(note.id, { text_id: occ.text_id, sentence_id: occ.sentence_id, word_offset: occ.word_offset, surface: occ.surface }); } catch (_) {}
  }
  readerWordStates = null;
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}
  roomToast(tt('room.morph.meaningSavedToast', 'Перевод сохранён'));
  return { ok: true };
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
  opts.contextProvider = makeContextProvider();   // always wired; gates per-tap on consent (auto once granted)
  // Epic-2 #2 — per-card one-off refine: a separate provider that does NOT consult the global
  // consent (the per-card confirm IS the consent), and the gate that decides whether to OFFER it.
  opts.refineContext = makeRefineProvider();
  opts.canRefine = canRefine;
  opts.grantContextConsent = () => { contextConsentSet('granted'); roomToast(tt('room.morph.consentOn', 'Точный режим включён')); };
  // Epic-3a — pronounce the headword (GCP→browser) + word-status map for the root-family chips
  // (reuses the single-flight ensureWordStates cache; chips colour known/learning/new).
  opts.speakWord = speakWord;
  opts.getWordStates = ensureWordStates;
  // Epic 4 — one-tap manual status: persist (separate word_status store, no flashcard) then
  // invalidate the cached states + repaint the text so the colour updates immediately.
  opts.getWordStatus = (lk) => localDb.getWordStatus(lk);
  opts.setWordStatus = async (lk, st) => {
    try { await localDb.setWordStatus(lk, st); } catch (_) {}
    readerWordStates = null;
    try { applyDecorations(); } catch (_) {}
  };
  // T-b — manual translation for out-of-dict words: re-surface a saved user-meaning on re-open
  // (lookup) + persist a new one into the canonical word_study note (save, Anki-synced).
  opts.lookupUserMeaning = roomLookupUserMeaning;
  opts.saveUserMeaning = roomSaveUserMeaning;
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
// Epic 8c — corpus-open loading SKELETON (replaces the bare «⏳» text). Shimmer rows preview the
// bilingual table structure; reduced-motion-safe (CSS gates the shimmer). role=status announces it.
function readerSkeleton() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.innerHTML = '';
  const box = el('div', { class: 'reader-skeleton', attrs: { role: 'status', 'aria-live': 'polite', 'aria-label': tt('room.state.loading', 'Загрузка…') } });
  for (let i = 0; i < 7; i++) {
    const row = el('div', { class: 'reader-skeleton-row' });
    row.appendChild(el('div', { class: 'reader-skeleton-bar he' }));
    row.appendChild(el('div', { class: 'reader-skeleton-bar ru' }));
    box.appendChild(row);
  }
  mount.appendChild(box);
}

function rerenderReader() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.innerHTML = readerCore.buildBilingualTableHtml(readerRows, readerConfig());
  attachReaderAudio();
  try { refreshFindAfterRerender(); } catch (_) {}   // BRR-S15 — re-apply find marks after a table rebuild
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
  // Epic 4 — VISIBLE status-colour legend (premium + mobile-legible; title tooltips fail @380px).
  const legend = el('div', { class: 'reader-status-legend', attrs: { 'aria-label': tt('room.morph.statusToggle', '🎨 Статус слов') } });
  [['new', tt('room.morph.status.new', 'новое')], ['l1', '1'], ['l2', '2'], ['l3', '3'], ['l4', '4'],
    ['known', tt('room.morph.status.known', 'знаю')], ['ignore', tt('room.morph.status.ignore', 'игнор')]].forEach(([c, l]) => {
    const sw = el('span', { class: 'reader-status-sw' });
    sw.appendChild(el('span', { class: 'reader-status-dot sw-' + c }));
    sw.appendChild(el('span', { text: l }));
    legend.appendChild(sw);
  });
  panel.appendChild(legend);
  panel.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.morph.statusNote', text: tt('room.morph.statusNote', 'Цвет — у уверенно распознанных учебных слов; служебные и не найденные в словаре остаются без цвета.') }));
  // Epic 4.3a — «📚 Учить»: gather THIS screen's new words into a quick study sheet (one-tap mark → recolour).
  const studyBtn = el('button', { class: 'reader-aids-study', i18n: 'room.morph.study.open', text: tt('room.morph.study.open', '📚 Учить новые слова'), attrs: { type: 'button' } });
  studyBtn.addEventListener('click', roomOpenStudyList);
  panel.appendChild(studyBtn);
  panel.appendChild(_dueBadgeEl('reader-aids-duebadge'));   // D3 — due-counter under «📚 Учить» (the return CTA)
  try { refreshDueBadge(); } catch (_) {}
  // R8 on-ramp — one short line teaching the two fading aids.
  panel.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.reader.scaffoldHint', text: tt('room.reader.scaffoldHint', '«По нужде»: огласовка тает на знакомых словах. «По тапу»: перевод скрыт — тапни строку, чтобы открыть.') }));
  // Tier-3 — «точный режим» (context disambiguation via Dicta; auto on every tap once granted).
  // On tap, the sentence is sent to Dicta to pick the contextually-correct homograph. The toggle
  // sets the consent directly (no re-attach needed — the provider gates per-tap on consent).
  const cmLab = el('label', { class: 'reader-aids-status' });
  const cmCb = el('input', { attrs: { type: 'checkbox' } });
  cmCb.checked = contextConsent() === 'granted';
  cmCb.addEventListener('change', () => { contextConsentSet(cmCb.checked ? 'granted' : 'declined'); });
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
      if (s.kind === 'loading') readerSkeleton();
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
    try { tagReaderTableLang(mount); } catch (_) {}      // Epic 8b — sr-only/lang on the painted table (parity-safe)
    try { showReaderTip(); } catch (_) {}                // Epic 8a — first-open gesture hint
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
  clearResumeBanner(); clearRowJump(); closeReaderFind(); _sessionMaxRow = -1; readerTextId = null;   // BRR-P2-002/005/S15 — stop recording + clear find after close
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

// ── BRR-S15 — in-reader find (Kindle/Apple-Books table-stakes) ──────────────────────────────
// A find bar over the OPEN text: niqqud-insensitive matches highlighted + «k / N» counter + ↑/↓
// navigation. POST-render on the Room mount (the parity-locked builder is untouched — reader-parity
// stays green): it toggles classes on the already-rendered rows + the morph `.rm-w` spans, never
// rebuilds a cell. Distinct GREEN hue (jump=amber, playback=blue) per the reading-UX palette.
let _findMatches = [], _findCur = -1, _findQuery = '', _findInputEl = null, _findCountEl = null;
function buildFindBar() {
  const bar = $('readerFind'); if (!bar) return;
  bar.innerHTML = '';
  const input = el('input', { class: 'reader-find-input', attrs: { type: 'search', enterkeyhint: 'search', placeholder: tt('room.reader.find.placeholder', 'Найти в тексте…'), 'aria-label': tt('room.reader.find.label', 'Найти в тексте') } });
  const counter = el('span', { class: 'reader-find-count', attrs: { 'aria-live': 'polite' } });
  const prev = el('button', { class: 'reader-find-nav', attrs: { type: 'button', 'aria-label': tt('room.reader.find.prev', 'Предыдущее') } }); prev.textContent = '↑';
  const next = el('button', { class: 'reader-find-nav', attrs: { type: 'button', 'aria-label': tt('room.reader.find.next', 'Следующее') } }); next.textContent = '↓';
  const close = el('button', { class: 'reader-find-close', attrs: { type: 'button', 'aria-label': tt('room.reader.find.close', 'Закрыть поиск') } }); close.textContent = '✕';
  let deb;
  input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => runFind(input.value), 150); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeReaderFind(); }
  });
  prev.addEventListener('click', () => findStep(-1));
  next.addEventListener('click', () => findStep(1));
  close.addEventListener('click', closeReaderFind);
  bar.appendChild(input); bar.appendChild(counter); bar.appendChild(prev); bar.appendChild(next); bar.appendChild(close);
  _findInputEl = input; _findCountEl = counter;
}
function openReaderFind() {
  const bar = $('readerFind'), toggle = $('readerFindToggle');
  if (!bar) return;
  if (!bar.hidden) { closeReaderFind(); return; }   // the 🔍 button toggles
  buildFindBar();
  bar.hidden = false;
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  try { _findInputEl && _findInputEl.focus(); } catch (_) {}
}
function closeReaderFind() {
  const bar = $('readerFind'), toggle = $('readerFindToggle');
  clearFindMarks(); _findMatches = []; _findCur = -1; _findQuery = '';
  if (bar) { bar.hidden = true; bar.innerHTML = ''; }
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  _findInputEl = null; _findCountEl = null;
}
function runFind(q) {
  _findQuery = String(q || '');
  clearFindMarks();
  const C = window.CorpusFTS;
  _findMatches = (C && C.findRows) ? C.findRows(readerRows, _findQuery) : [];
  _findCur = _findMatches.length ? 0 : -1;
  applyFindMarks();
  if (_findCur >= 0) gotoFindMatch(); else updateFindCount();
}
function applyFindMarks() {
  const mount = $('roomReaderTable'); if (!mount) return;
  const qToks = ftsQueryTokens(_findQuery);
  for (const idx of _findMatches) {
    const tr = mount.querySelector('tr[data-row-idx="' + idx + '"]'); if (!tr) continue;
    tr.classList.add('rm-find-row');
    if (qToks.length) tr.querySelectorAll('.rm-w').forEach((w) => {
      let skel = ''; try { skel = window.CorpusFTS.normalizeToken(w.textContent); } catch (_) {}
      if (skel && qToks.some((t) => skel.indexOf(t) >= 0)) w.classList.add('rm-find-word');
    });
  }
}
function clearFindMarks() {
  const mount = $('roomReaderTable'); if (!mount) return;
  mount.querySelectorAll('.rm-find-row-current').forEach((t) => t.classList.remove('rm-find-row-current'));
  mount.querySelectorAll('.rm-find-row').forEach((t) => t.classList.remove('rm-find-row'));
  mount.querySelectorAll('.rm-find-word').forEach((w) => w.classList.remove('rm-find-word'));
}
function gotoFindMatch() {
  const mount = $('roomReaderTable'); if (!mount || _findCur < 0) return;
  mount.querySelectorAll('.rm-find-row-current').forEach((t) => t.classList.remove('rm-find-row-current'));
  const tr = mount.querySelector('tr[data-row-idx="' + _findMatches[_findCur] + '"]');
  if (tr) { tr.classList.add('rm-find-row-current'); if (tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} } }
  updateFindCount();
}
function findStep(dir) {
  if (!_findMatches.length) return;
  _findCur = (_findCur + dir + _findMatches.length) % _findMatches.length;
  gotoFindMatch();
}
function updateFindCount() {
  if (!_findCountEl) return;
  _findCountEl.textContent = _findMatches.length ? ((_findCur + 1) + ' / ' + _findMatches.length) : (String(_findQuery).trim() ? '0' : '');
}
// Re-apply the find decoration after a reader re-render (aids/locale change rebuilt the table).
function refreshFindAfterRerender() {
  if (!$('readerFind') || $('readerFind').hidden || !String(_findQuery).trim()) return;
  runFind(_findQuery);
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
  // refresh() drops the cached profile snapshots (word-states + readable-set) so the next coverage/
  // readability read re-queries the live profile — for when it changed outside the reader's save path.
  window.CorpusVocabRoom = { ensure: loadCorpusVocab, coverageFor: roomVocabCoverageFor, refresh: () => { readerWordStates = null; try { invalidateReadableSet(); } catch (_) {} } };
}

// BRR-S7 — «Читаемые для меня»: the set of work ids the reader can read NOW (i+1 zone in/easy against
// the LIVE profile). Computed ONCE from the vocab sidecar + a SINGLE ensureWordStates snapshot (the
// anti-stampede discipline — never a per-row DB query [[feedback-test-with-nonempty-profile]]), cached
// until the profile changes (invalidated on word-save). Honest: only works the reader has real overlap
// with (knownDistinct>0) count; an empty profile → empty set (the filter then shows nothing, not a lie).
let _readableSet = null;
async function ensureReadableSet() {
  if (_readableSet) return _readableSet;
  const set = new Set();
  try {
    const v = await loadCorpusVocab();
    if (v && v.works && window.CorpusVocab) {
      const states = (await ensureWordStates()) || {};
      for (const id in v.works) {
        const cov = window.CorpusVocab.coverageForWork(v.works[id], v.dict, states);
        if (cov && cov.knownDistinct > 0 && (cov.zone === 'in' || cov.zone === 'easy')) set.add(String(id));
      }
    }
  } catch (_) {}
  _readableSet = set;
  return set;
}
function invalidateReadableSet() { _readableSet = null; }

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
    const meta = node.querySelector('.work-card-meta, .corpus-work-meta');   // rail card OR result row (S7)
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

// BRR-S13 — «⭐ Сохранённые поиски» chips (persistent, full-filter) on home. Tap re-runs (restores all
// filters); ✕ deletes. Synchronous (localStorage); guarded against a stale/filtered body.
function injectSavedSearches(body) {
  try {
    const saved = getSavedSearches();
    if (!saved.length || corpusL1Body !== body || corpusFilterActive()) return;
    const sec = el('section', { class: 'shelf corpus-saved' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: '⭐ ' + tt('room.corpus.saved.title', 'Сохранённые поиски') }));
    sec.appendChild(head);
    const chips = el('div', { class: 'corpus-saved-chips' });
    for (const s of saved) {
      const chip = el('div', { class: 'corpus-saved-chip' });
      const run = el('button', { class: 'corpus-saved-run', attrs: { type: 'button' } });
      run.textContent = s.name; if (HEBREW_RE.test(s.name)) run.setAttribute('dir', 'rtl');
      run.addEventListener('click', () => restoreSavedSearch(s.f));
      const x = el('button', { class: 'corpus-saved-del', attrs: { type: 'button', 'aria-label': tt('room.corpus.saved.remove', 'Удалить') } });
      x.textContent = '✕';
      x.addEventListener('click', () => { removeSavedSearch(s.name); corpusRefreshL1Body(); });
      chip.appendChild(run); chip.appendChild(x); chips.appendChild(chip);
    }
    sec.appendChild(chips);
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}
// BRR-P3 — list picker: choose which named list(s) to add a work to, or create a new one inline.
function updateListBtn(btn, card) {
  const on = isInAnyList(card.id);
  // `btn.__iconOnly` (dense work-row button) shows just the glyph; the snippet/picker buttons show the label.
  btn.textContent = btn.__iconOnly ? (on ? '✓' : '➕') : ((on ? '✓ ' : '➕ ') + tt('room.corpus.lists.short', 'В список'));
  btn.setAttribute('aria-pressed', String(on));
}
function openListPicker(card, btn, ready) {
  const ov = el('div', { class: 'list-picker-ov' });
  const box = el('div', { class: 'list-picker' });
  box.appendChild(el('div', { class: 'list-picker-title', text: tt('room.corpus.lists.addTo', 'Добавить в список') }));
  const listsWrap = el('div', { class: 'list-picker-lists' });
  const repaint = () => {
    listsWrap.innerHTML = '';
    for (const L of getReadingLists()) {
      const has = (L.items || []).some((x) => String(x.id) === String(card.id));
      const row = el('button', { class: 'list-picker-row' + (has ? ' on' : ''), attrs: { type: 'button' } });
      row.textContent = (has ? '✓ ' : '＋ ') + L.name + ' (' + ((L.items || []).length) + ')';
      if (HEBREW_RE.test(L.name)) row.setAttribute('dir', 'rtl');
      row.addEventListener('click', () => { const now = toggleItemInList(L.id, card, ready); repaint(); if (btn) updateListBtn(btn, card); roomToast(tt(now ? 'room.corpus.lists.added' : 'room.corpus.lists.removed', now ? 'Добавлено' : 'Убрано')); });
      listsWrap.appendChild(row);
    }
  };
  repaint();
  box.appendChild(listsWrap);
  const createRow = el('div', { class: 'list-picker-create' });
  const inp = el('input', { class: 'list-picker-input', attrs: { type: 'text', placeholder: tt('room.corpus.lists.newName', 'Новый список…'), 'aria-label': tt('room.corpus.lists.newName', 'Новый список') } });
  const add = el('button', { class: 'list-picker-add', attrs: { type: 'button', 'aria-label': tt('room.corpus.lists.create', 'Создать список') } }); add.textContent = '＋';
  const doCreate = () => { const nm = inp.value.trim(); if (!nm) { try { inp.focus(); } catch (_) {} return; } const L = createReadingList(nm); toggleItemInList(L.id, card, ready); inp.value = ''; repaint(); if (btn) updateListBtn(btn, card); roomToast(tt('room.corpus.lists.added', 'Добавлено')); };
  add.addEventListener('click', doCreate);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doCreate(); } });
  createRow.appendChild(inp); createRow.appendChild(add);
  box.appendChild(createRow);
  const done = el('button', { class: 'list-picker-done', attrs: { type: 'button' } }); done.textContent = tt('room.corpus.lists.done', 'Готово');
  const close = () => { try { ov.remove(); } catch (_) {} document.removeEventListener('keydown', onKey); };
  done.addEventListener('click', close);
  box.appendChild(done);
  ov.appendChild(box);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  setTimeout(() => { try { inp.focus(); } catch (_) {} }, 50);
}
// «📚 <list>» shelf card (corpus reading list). Opens ready items via the corpus card flow; non-ready
// items honestly show «перевод позже» (R8 no dead-end). ✕ removes from THIS list. A non-ready item
// AUTO-UPGRADES once the corpus grows (BRR — non-ready add-to-list): readiness is re-derived from the
// LIVE ready index, so a work saved while «перевод готовится» becomes openable the moment it ships — no
// migration, no stale dead state. The live card carries file+text_key even when the saved stub did not.
function renderReadingListCard(listId, it) {
  const node = el('div', { class: 'work-card readinglist-card', attrs: { role: 'button', tabindex: '0' } });
  const title = it.title || tt('room.work.untitled', 'Без названия');
  const t = el('span', { class: 'work-card-title', text: title }); if (HEBREW_RE.test(title)) t.setAttribute('dir', 'rtl'); node.appendChild(t);
  if (it.author) { const a = el('span', { class: 'work-card-author', text: it.author }); if (HEBREW_RE.test(it.author)) a.setAttribute('dir', 'rtl'); node.appendChild(a); }
  const savedReady = !!(it.r && it.file && it.text_key);
  let live = null;
  if (!savedReady) { try { live = corpusReadyMap().get(String(it.id)) || null; } catch (_) { live = null; } }
  const liveReady = !!(live && live.file && live.text_key);
  const meta = el('div', { class: 'work-card-meta' });
  if (!savedReady && !liveReady) meta.appendChild(el('span', { class: 'prov-badge later', i18n: 'room.corpus.later', text: tt('room.corpus.later') }));
  const rm = el('button', { class: 'readinglist-rm', attrs: { type: 'button', 'aria-label': tt('room.corpus.lists.remove', 'Убрать') } });
  rm.textContent = '✕';
  rm.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); removeItemFromList(listId, it.id); corpusRefreshL1Body(); });
  meta.appendChild(rm); node.appendChild(meta);
  const open = () => {
    if (savedReady) { openCorpusWork(it); return; }
    if (liveReady) { openCorpusWork(live); return; }   // shipped since saving → open the live ready card
    roomToast(tt('room.corpus.lists.notReady', 'Перевод готовится'));
  };
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return node;
}
// One shelf per non-empty named list (each prepended → newest list highest). A ✕ on the head deletes the list.
function injectReadingListShelves(body) {
  try {
    const lists = getReadingLists().filter((L) => (L.items || []).length);
    if (!lists.length || corpusL1Body !== body || corpusFilterActive()) return;
    for (const L of lists) {
      const sec = el('section', { class: 'shelf corpus-readinglist' });
      const head = el('div', { class: 'shelf-head corpus-readinglist-head' });
      head.appendChild(el('h2', { class: 'shelf-title', text: '📚 ' + L.name }));
      const del = el('button', { class: 'shelf-list-del', attrs: { type: 'button', 'aria-label': tt('room.corpus.lists.deleteList', 'Удалить список') } });
      del.textContent = '✕';
      del.addEventListener('click', () => { deleteReadingList(L.id); corpusRefreshL1Body(); });
      head.appendChild(del);
      sec.appendChild(head);
      const rail = el('div', { class: 'shelf-rail' });
      for (const it of L.items) rail.appendChild(renderReadingListCard(L.id, it));
      sec.appendChild(rail);
      body.insertBefore(sec, body.firstChild);
    }
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}

// Inject the L1 home rails in deterministic top-to-bottom order — because each prepends to firstChild,
// the LAST to run sits highest: ⭐ Сохранённые поиски → Продолжить → 🔖 Закладки → 📚 Читать позже →
// profile rail → ready → периоды.
async function injectHomeRails(body) {
  await injectCorpusRails(body);
  injectReadingListShelves(body);
  await injectBookmarksShelf(body);
  await injectContinueReading(body);
  injectSavedSearches(body);
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
function corpusFilterActive() { const f = corpusFilter; return !!(String(f.q || '').trim() || f.genre || f.lang || f.readyOnly || f.readableOnly || f.hasAudio || f.reviewed || f.scopeAuthor || f.scopeEra); }
// BRR-S16 — provenance filters (audio / human-reviewed) are properties of the READY card (corpus-search
// rows don't carry them), so they imply readable works: a non-ready row has no card → excluded honestly.
function corpusAdvOk(row, readyMap) {
  const f = corpusFilter;
  if (!f.hasAudio && !f.reviewed) return true;
  const card = readyMap.get(String(row.id));
  if (!card) return false;
  if (f.hasAudio && !(card.audio_status && card.audio_status !== 'none')) return false;
  if (f.reviewed && !(card.review_status === 'human_proofread' || card.review_status === 'machine_assisted')) return false;
  return true;
}
function corpusApplyFilter() {
  const rows = corpusSearch || [];
  const f = corpusFilter; const q = corpusNrm(f.q);
  const readyMap = corpusReadyMap();
  return rows.filter((row) => {
    if (f.readyOnly && !row.r) return false;
    if (f.readableOnly && _readableSet && !_readableSet.has(String(row.id))) return false;   // S7 — i+1 zone only
    if (f.scopeAuthor && row.a !== f.scopeAuthor) return false;                              // S11 — scoped to one author
    if (f.scopeEra && row.e !== f.scopeEra) return false;                                    // S11 — scoped to one period
    if (f.genre && row.g !== f.genre) return false;
    if (f.lang && row.l !== f.lang) return false;
    if ((f.hasAudio || f.reviewed) && !corpusAdvOk(row, readyMap)) return false;             // S16 — provenance
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
  if (f.scopeAuthor) parts.push(tt('room.corpus.scope.inAuthor', 'в авторе') + ': ' + f.scopeAuthor);   // S11
  if (f.scopeEra) parts.push(tt('room.corpus.scope.inEra', 'в периоде') + ': ' + corpusEraTitle(f.scopeEra));
  if (String(f.q || '').trim()) parts.push('«' + f.q.trim() + '»');
  if (f.genre) parts.push(corpusGenreLabel(f.genre));
  if (f.lang) parts.push(corpusLangLabel(f.lang));
  if (f.readyOnly) parts.push(tt('room.corpus.facets.ready', 'Готовые'));
  if (f.readableOnly) parts.push(tt('room.corpus.facets.readable', 'Читаемые для меня'));
  if (f.hasAudio) parts.push(tt('room.corpus.facets.hasAudio', 'С аудио'));
  if (f.reviewed) parts.push(tt('room.corpus.facets.reviewed', 'Проверено'));
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
  if (corpusNav.level === 'concordance') return renderConcordance(token);   // BRR-S8
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
  // S12 — recents/suggestions are a home-only affordance; repaint (history may have grown) + toggle.
  if (corpusRecentsEl) { if (corpusFilterActive()) corpusRecentsEl.hidden = true; else { paintRecents(); corpusRecentsEl.hidden = false; } }
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
  // BRR-S8 — concordance entry (only for a Hebrew query, where the FTS index applies).
  if (hasQuery) {
    let heQ = false; try { heQ = !!(window.CorpusFTS && window.CorpusFTS.tokenizeText(corpusFilter.q).length); } catch (_) {}
    if (heQ) {
      const conc = el('button', { class: 'corpus-concordance-entry', attrs: { type: 'button' } });
      conc.textContent = '📑 ' + tt('room.corpus.concordance.entry', 'Все вхождения (конкорданс)');
      conc.addEventListener('click', () => corpusNavTo('concordance'));
      body.appendChild(conc);
    } else if (/[а-яё]/i.test(corpusFilter.q)) {
      maybeTranslitSuggest(body, corpusFilter.q);   // BRR-S18 — cyrillic query → Hebrew candidates
    }
    // BRR-S13 — save the current search (query + all filters) to re-run later.
    const saveS = el('button', { class: 'corpus-concordance-entry', attrs: { type: 'button' } });
    saveS.textContent = '⭐ ' + tt('room.corpus.saved.save', 'Сохранить поиск');
    saveS.addEventListener('click', () => { saveCurrentSearch(); roomToast(tt('room.corpus.saved.savedToast', 'Поиск сохранён')); });
    body.appendChild(saveS);
  }
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
      const node = renderCorpusWorkRow(full || corpusSearchRowToCard(sr), !!full, Object.assign({ showAuthor: true, showListBtn: true }, rowOpts || {}));
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
  // BRR-S10 — quick capture: save the matched line as a study example (feeds notes → Anki word export).
  const actions = el('div', { class: 'corpus-snippet-actions' });
  const saveBtn = el('button', { class: 'corpus-snippet-save', attrs: { type: 'button', title: tt('room.corpus.search.saveToNotes', 'Сохранить строку в заметки') } });
  saveBtn.textContent = '💾 ' + tt('room.corpus.search.saveToNotes', 'В заметки');
  saveBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); saveSnippetToNotes(saveBtn, q, he, ru, card); });
  actions.appendChild(saveBtn);
  // The «➕ В список» control lives on the work ROW (renderCorpusWorkRow, opts.showListBtn) so it is offered
  // for EVERY result — including non-ready hits (no snippet) and title-only matches — not just ready+matched.
  snip.appendChild(actions);
  const col = rowNode.querySelector('.corpus-work-col');
  if (col) col.appendChild(snip);
}

// BRR-S10 — save a found line as a study artifact. A SINGLE-word query → a word_study note for that
// word, grounded in the authoritative Pealim pid (pidForToken → joins i+1 coverage + the Anki word
// export), with the matched bilingual line as `context` (no fabricated morphology — empty, honestly
// enriched later in the reader). A PHRASE → a free example note (the bilingual line + provenance).
async function saveSnippetToNotes(btn, q, he, ru, card) {
  const qToks = ftsQueryTokens(q);
  const ctx = (String(he || '') + (ru ? ' · ' + ru : '')).trim().slice(0, 600);
  try {
    if (qToks.length <= 1) {
      const segs = (window.CorpusFTS && window.CorpusFTS.markSegments(he, qToks)) || [];
      const niqWord = ((segs.find((s) => s.m) || {}).t || '').trim();
      const word = (niqWord ? corpusNrm(niqWord) : String(q || '').trim());
      const body = { word: word, niqqud_variant: niqWord, meaning: '', root: '', lemma: '', pos: '', binyan: '', context: ctx, examples: ctx };
      let pid = null; try { pid = window.CorpusFTS && window.CorpusFTS.pidForToken ? window.CorpusFTS.pidForToken(word) : null; } catch (_) {}
      if (pid != null) body.pealim_id = String(pid);
      await localDb.createNote({ target_kind: 'word', target_id: null, text_id: null, note_type: 'word_study', title: word, body: body });
    } else {
      const md = String(he || '') + (ru ? '\n' + ru : '') + (card && card.title ? '\n\n— ' + card.title : '');
      await localDb.createNote({ target_kind: 'free', target_id: null, text_id: null, note_type: 'free', title: String(q || '').trim().slice(0, 80), body: md });
    }
    readerWordStates = null; try { invalidateReadableSet(); } catch (_) {}   // S7 — profile grew → recompute coverage
    btn.textContent = '✓ ' + tt('room.corpus.search.savedToNotes', 'Сохранено');
    btn.disabled = true;
    roomToast(tt('room.corpus.search.savedToNotes', 'Сохранено в заметки'));
  } catch (e) { try { console.warn('[room] save snippet failed', e); } catch (_) {} roomToast(tt('room.corpus.search.saveFailed', 'Не удалось сохранить')); }
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
  const advReadyMap = corpusReadyMap();
  const passFilter = (sr) => !!sr && !(f.readyOnly && !sr.r) && !(f.readableOnly && _readableSet && !_readableSet.has(String(sr.id))) && !(f.scopeAuthor && sr.a !== f.scopeAuthor) && !(f.scopeEra && sr.e !== f.scopeEra) && !((f.hasAudio || f.reviewed) && !corpusAdvOk(sr, advReadyMap)) && !(f.genre && sr.g !== f.genre) && !(f.lang && sr.l !== f.lang) && !titleIds.has(String(sr.id));
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
  const exactMode = !!f.exactForm;   // BRR-S9 — literal-form vs «по корню/все формы» (default)
  let out = null;
  try { out = await window.CorpusFTS.phraseSearch(q, { exactOnly: exactMode }); } catch (_) { try { loading.remove(); } catch (_2) {} return; }
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
    const label = exactMode
      ? ('🔎 ' + tt('room.corpus.search.exactWords', 'Точная форма в тексте'))
      : ((phraseShown || out.multiToken) ? tt('room.corpus.search.words', 'Слова в тексте') : ('🔎 ' + tt('room.corpus.search.inText', 'В тексте')));
    appendFtsSection(body, q, label, wordItems);
    ftsCount += wordItems.length;
  }
  bumpCount(true);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

// ── BRR-S12 — recent searches (localStorage) + cold-start suggestions ──────────────
function getRecentSearches() { try { const a = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (_) { return []; } }
function pushRecentSearch(q) {
  q = String(q || '').trim(); if (q.length < 2) return;
  try {
    // prefix-collapse: a typing progression (אהב→אהבה) keeps only the refined query, not every partial
    let a = getRecentSearches().filter((x) => !(q.indexOf(x) === 0 || x.indexOf(q) === 0));
    a.unshift(q);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(a.slice(0, 8)));
  } catch (_) {}
}
function clearRecentSearches() { try { localStorage.removeItem(RECENTS_KEY); } catch (_) {} }
function setSearchQueryFromChip(term) {
  if (corpusSearchInputEl) {
    corpusSearchInputEl.value = term;
    const cx = corpusSearchInputEl.parentNode && corpusSearchInputEl.parentNode.querySelector('.corpus-search-clear');
    if (cx) cx.hidden = false;
  }
  corpusFilter.q = term; pushRecentSearch(term); corpusRefreshL1Body();
  try { ensureFtsConfigured(); window.CorpusFTS && window.CorpusFTS.warmQuery(term); } catch (_) {}
  try { corpusSearchInputEl && corpusSearchInputEl.focus(); } catch (_) {}
}

// ── BRR-S18 — translit helper рус→иврит ──────────────────────────────────────────────────────────
// A non-Hebrew (cyrillic) query can't match the Hebrew corpus → offer authoritative Hebrew candidates
// from the reverse-translit index (built from the bodies' translit_ru). foldCyrLib MUST stay byte-identical
// to build-translit-index.js foldCyr (parity — index keys + query folded the same way). Lazy, single-flight.
let _translitIdx = null, _translitLoading = null;
function foldCyrLib(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^а-яё]/g, '').replace(/ё/g, 'е').replace(/э/g, 'е').replace(/[ъь]/g, '').replace(/(.)\1+/g, '$1'); }
function loadTranslitIndex() {
  if (_translitIdx) return Promise.resolve(_translitIdx);
  if (_translitLoading) return _translitLoading;
  const url = '/data/benyehuda/translit-ru-v' + CORPUS_CATALOG_VERSION + '.json?v=' + CORPUS_CATALOG_VERSION + '.' + TRANSLIT_DATA_REV;
  _translitLoading = fetch(url, { cache: 'force-cache' })
    .then((r) => { if (!r.ok) throw new Error('translit ' + r.status); return r.json(); })
    .then((j) => { _translitIdx = j; return j; })
    .finally(() => { _translitLoading = null; });
  return _translitLoading;
}
// Insert a «Возможно, вы искали: <иврит>» banner for a cyrillic query (fire-and-forget; stale-guarded).
async function maybeTranslitSuggest(body, q) {
  const toks = String(q || '').toLowerCase().match(/[а-яё]+/g) || [];
  if (!toks.length) return;
  let idx = null; try { idx = await loadTranslitIndex(); } catch (_) { return; }
  if (!idx || !idx.cyr || corpusL1Body !== body || corpusFilter.q !== q) return;   // navigated away / query changed
  let chips = [];
  if (toks.length === 1) {
    chips = (idx.cyr[foldCyrLib(toks[0])] || []).slice(0, 3);
  } else {
    const tops = toks.map((t) => (idx.cyr[foldCyrLib(t)] || [])[0]);
    if (tops.every(Boolean)) chips = [tops.join(' ')];                              // whole phrase resolved
    else chips = tops.filter(Boolean).slice(0, 3);                                   // partial → per-word tops
  }
  if (!chips.length) return;
  const sec = el('div', { class: 'corpus-translit-suggest' });
  sec.appendChild(el('span', { class: 'corpus-translit-label', text: tt('room.corpus.translit.maybe', 'Возможно, вы искали') + ':' }));
  for (const heb of chips) {
    const c = el('button', { class: 'corpus-recent-chip', attrs: { type: 'button', dir: 'rtl' } });
    c.textContent = heb;
    c.addEventListener('click', () => setSearchQueryFromChip(heb));
    sec.appendChild(c);
  }
  const summary = body.querySelector('.corpus-results-summary');
  if (summary && summary.nextSibling) body.insertBefore(sec, summary.nextSibling);
  else body.appendChild(sec);
}
// Paint the recents/suggestions row (under the bar, only when no query is active). Recents win;
// an empty history falls back to honest «попробуйте» cold-start prompts.
function paintRecents() {
  const host = corpusRecentsEl; if (!host) return;
  host.innerHTML = '';
  const recents = getRecentSearches();
  const list = recents.length ? recents : CORPUS_SUGGESTIONS;
  host.appendChild(el('span', { class: 'corpus-recents-label', text: recents.length ? tt('room.corpus.search.recent', 'Недавние') : tt('room.corpus.search.try', 'Попробуйте') }));
  const chips = el('div', { class: 'corpus-recents-chips' });
  for (const term of list) {
    const c = el('button', { class: 'corpus-recent-chip', attrs: { type: 'button' } });
    c.textContent = term; if (HEBREW_RE.test(term)) c.setAttribute('dir', 'rtl');
    c.addEventListener('click', () => setSearchQueryFromChip(term));
    chips.appendChild(c);
  }
  host.appendChild(chips);
  if (recents.length) {
    const clr = el('button', { class: 'corpus-recents-clear', attrs: { type: 'button', title: tt('room.corpus.search.clearRecent', 'Очистить историю'), 'aria-label': tt('room.corpus.search.clearRecent', 'Очистить историю') } });
    clr.textContent = '✕';
    clr.addEventListener('click', () => { clearRecentSearches(); paintRecents(); });
    host.appendChild(clr);
  }
}

// BRR-S14 — «ещё у автора»: jump to the author's full works list (the existing Период→Автор→Работа
// drill). Robust to a missing era on the card by scanning the author index across all eras.
function corpusNavToAuthor(era, name) {
  if (!name) return;
  loadCorpusIndex().then(() => {
    const authors = (corpusIndex && corpusIndex.authors) || {};
    const eras = era ? [era] : Object.keys(authors);
    for (const e of eras) { const a = (authors[e] || []).find((x) => x.name === name); if (a) { corpusNavTo('works', e, a); return; } }
  }).catch(() => {});
}

// BRR-S11 — enter a scoped search: set the author/era scope, go to the L1 results surface, focus the
// input. The query (corpusFilter.q) persists across the drill, so an in-flight search re-runs scoped.
function corpusScopeTo(opts) {
  corpusFilter.scopeAuthor = (opts && opts.author) || '';
  corpusFilter.scopeEra = (opts && opts.era) || '';
  corpusNavTo('home');
  setTimeout(() => { try { corpusSearchInputEl && corpusSearchInputEl.focus(); } catch (_) {} }, 60);
}
// A «🔍 искать у автора / в периоде» entry shown on the L2/L3 headers.
function buildScopeSearchRow(opts) {
  const row = el('div', { class: 'corpus-scope-search' });
  const b = el('button', { class: 'corpus-scope-search-btn', attrs: { type: 'button' } });
  b.textContent = '🔍 ' + (opts.author ? tt('room.corpus.scope.searchAuthor', 'Искать у автора') : tt('room.corpus.scope.searchEra', 'Искать в периоде'));
  b.addEventListener('click', () => corpusScopeTo(opts));
  row.appendChild(b);
  return row;
}

// ── BRR-S8 — KWIC / concordance («все вхождения слова по корпусу») ─────────────────────────────
// Frequency + per-work counts across ALL indexed works (from the index); KWIC context LINES for READY
// works only (lazy body-fetch + findRows — the index has counts, not per-line text); non-ready works are
// honest count-only «перевод позже». A generic lazy observer (rootMargin 300px) drives the per-work fills.
let _lazyObserver = null;
function getLazyObserver() {
  if (_lazyObserver !== null) return _lazyObserver;
  _lazyObserver = (typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries, obs) => { for (const e of entries) if (e.isIntersecting) { obs.unobserve(e.target); try { e.target.__lazyFill && e.target.__lazyFill(); } catch (_) {} } }, { rootMargin: '300px' })
    : false;
  return _lazyObserver;
}
async function renderConcordance(token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  const q = corpusFilter.q;
  main.innerHTML = '';
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(corpusCrumb([
    { label: tt('room.tabs.corpus', 'Корпус'), onClick: () => corpusNavTo('home') },
    { label: '📑 ' + tt('room.corpus.concordance.title', 'Конкорданс') },
  ]));
  const body = el('div', { class: 'corpus-concordance' });
  wrap.appendChild(body);
  main.appendChild(wrap);
  body.appendChild(stateBoxNode('room.state.loading', '⏳'));
  if (!corpusSearch) { try { await loadCorpusSearch(); } catch (_) {} }
  if (token !== corpusRenderToken) return;
  ensureFtsConfigured();
  let out = null;
  try { out = await window.CorpusFTS.concordance(q); } catch (_) { out = { total: 0, works: [] }; }
  if (token !== corpusRenderToken) return;
  body.innerHTML = '';
  const works = (out.works || []).filter((x) => corpusSearch[x.w]);
  const head = el('div', { class: 'corpus-concordance-head' });
  head.appendChild(el('span', { class: 'corpus-concordance-q', text: '«' + String(q || '').trim() + '»' }));
  if (HEBREW_RE.test(q || '')) head.lastChild.setAttribute('dir', 'rtl');
  head.appendChild(el('span', { class: 'corpus-concordance-stat', text: tt('room.corpus.concordance.occurrences', 'вхождений') + ': ' + out.total + ' · ' + tt('room.corpus.concordance.texts', 'текстов') + ': ' + works.length }));
  body.appendChild(head);
  if (!works.length) { body.appendChild(stateBoxNode('room.corpus.search.empty', '🔍')); try { window.applyI18n && window.applyI18n(); } catch (_) {} return; }
  const list = el('div', { class: 'corpus-concordance-list' });
  const moreWrap = el('div', { class: 'corpus-more' });
  body.appendChild(list); body.appendChild(moreWrap);
  const readyMap = corpusReadyMap();
  let cursor = 0;
  const slice = () => {
    const upTo = Math.min(works.length, cursor + 24);
    for (let i = cursor; i < upTo; i++) {
      const x = works[i], sr = corpusSearch[x.w];
      const full = sr.r ? readyMap.get(String(sr.id)) : null;
      list.appendChild(renderConcordanceWork(sr, full, x.count, q));
    }
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
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
function renderConcordanceWork(sr, full, count, q) {
  const sec = el('section', { class: 'corpus-concordance-work' });
  const head = el('div', { class: 'corpus-concordance-work-head' });
  const col = el('div', { class: 'corpus-concordance-work-col' });
  const title = el('span', { class: 'corpus-concordance-work-title', text: sr.t || '—' });
  if (HEBREW_RE.test(sr.t || '')) title.setAttribute('dir', 'rtl');
  col.appendChild(title);
  if (sr.a) { const a = el('span', { class: 'corpus-work-author', text: sr.a }); if (HEBREW_RE.test(sr.a)) a.setAttribute('dir', 'rtl'); col.appendChild(a); }
  head.appendChild(col);
  head.appendChild(el('span', { class: 'corpus-concordance-count', text: String(count) }));
  sec.appendChild(head);
  if (full && full.file) {
    const linesWrap = el('div', { class: 'corpus-concordance-lines' });
    sec.appendChild(linesWrap);
    linesWrap.__lazyFill = () => fillConcordanceLines(linesWrap, full, q);
    const obs = getLazyObserver();
    if (!obs) linesWrap.__lazyFill(); else obs.observe(linesWrap);
  } else {
    const later = el('div', { class: 'corpus-concordance-later' });
    later.appendChild(el('span', { class: 'prov-badge later', i18n: 'room.corpus.later', text: tt('room.corpus.later') }));
    sec.appendChild(later);
  }
  return sec;
}
async function fillConcordanceLines(node, card, q) {
  if (!node.isConnected) return;
  let rows = null; try { rows = await loadWorkBodyRows(card); } catch (_) { return; }
  if (!rows || !rows.length || !node.isConnected) return;
  const matchIdx = (window.CorpusFTS && window.CorpusFTS.findRows) ? window.CorpusFTS.findRows(rows, q) : [];
  const qToks = ftsQueryTokens(q);
  const K = 5;
  for (let i = 0; i < Math.min(matchIdx.length, K); i++) {
    const row = rows[matchIdx[i]];
    const he = row.hebrew_niqqud || row.hebrew_plain || '', ru = row.russian || '';
    const line = el('div', { class: 'corpus-concordance-line', attrs: { role: 'button', tabindex: '0' } });
    const heEl = el('div', { class: 'corpus-snippet-he', attrs: { dir: 'rtl' } });
    appendMarkedHebrew(heEl, he, qToks); line.appendChild(heEl);
    if (ru) line.appendChild(el('div', { class: 'corpus-snippet-ru', text: ru }));
    const open = () => openCorpusWork(card, { ftsQuery: q });
    line.addEventListener('click', open);
    line.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    node.appendChild(line);
  }
  if (matchIdx.length > K) {
    const more = el('button', { class: 'corpus-concordance-more', attrs: { type: 'button' } });
    more.textContent = '+' + (matchIdx.length - K) + ' ' + tt('room.corpus.concordance.moreLines', 'ещё в этом тексте');
    more.addEventListener('click', () => openCorpusWork(card, { ftsQuery: q }));
    node.appendChild(more);
  }
}

// Persistent global filter bar: search input + ✓Готовые toggle + genre/lang selects (counts
// from the root) + a clear chip when any filter is active. Each control refreshes only the L1
// body, so the input focus + select values survive.
function buildCorpusFilterBar() {
  const bar = el('div', { class: 'corpus-filterbar' });
  const inputWrap = el('div', { class: 'corpus-search-wrap' });
  const input = el('input', { class: 'corpus-search-input', attrs: { type: 'search', enterkeyhint: 'search', placeholder: tt('room.corpus.search.placeholder', 'Поиск по корпусу…'), 'aria-label': tt('room.corpus.search.placeholder', 'Поиск') } });
  input.value = corpusFilter.q || '';
  corpusSearchInputEl = input;   // S12 — recents/suggestion chips set the query through this ref
  // BRR-S4 — inline ✕ clear (tabindex -1: it's a mouse/touch affordance; Escape clears via keyboard).
  const clearX = el('button', { class: 'corpus-search-clear', attrs: { type: 'button', tabindex: '-1', 'aria-label': tt('room.corpus.search.clearInput', 'Очистить') } });
  clearX.textContent = '✕';
  clearX.hidden = !input.value;
  let deb;
  const applyQuery = () => { corpusFilter.q = input.value; pushRecentSearch(input.value); corpusRefreshL1Body(); };   // S12 — record the search
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
  // BRR-S11 — when a scope is active, a removable «✕ в авторе/периоде: X» chip leads the row (honest,
  // explicit scope; clearing it returns to global search). The bar is rebuilt on home render, so the
  // chip appears/disappears with the scope.
  if (corpusFilter.scopeAuthor || corpusFilter.scopeEra) {
    const label = corpusFilter.scopeAuthor
      ? (tt('room.corpus.scope.inAuthor', 'в авторе') + ': ' + corpusFilter.scopeAuthor)
      : (tt('room.corpus.scope.inEra', 'в периоде') + ': ' + corpusEraTitle(corpusFilter.scopeEra));
    const sc = el('button', { class: 'corpus-facet-chip on corpus-scope-chip', attrs: { type: 'button', title: tt('room.corpus.scope.clear', 'Искать по всему корпусу') } });
    sc.textContent = '✕ ' + label;
    if (HEBREW_RE.test(label)) sc.setAttribute('dir', 'rtl');
    sc.addEventListener('click', () => { corpusFilter.scopeAuthor = ''; corpusFilter.scopeEra = ''; renderCorpus(); });
    chips.appendChild(sc);
  }
  const ready = el('button', { class: 'corpus-facet-chip' + (corpusFilter.readyOnly ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.readyOnly) } });
  ready.textContent = '✓ ' + tt('room.corpus.facets.ready', 'Готовые');
  ready.addEventListener('click', () => { corpusFilter.readyOnly = !corpusFilter.readyOnly; ready.classList.toggle('on', corpusFilter.readyOnly); ready.setAttribute('aria-pressed', String(corpusFilter.readyOnly)); corpusRefreshL1Body(); });
  chips.appendChild(ready);
  // BRR-S7 — «Читаемые для меня»: i+1 readability filter (zone in/easy vs the live profile). Loads the
  // readable-set once (anti-stampede) before refreshing; an empty profile honestly yields no readable hits.
  const readable = el('button', { class: 'corpus-facet-chip' + (corpusFilter.readableOnly ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.readableOnly) } });
  readable.textContent = '📖 ' + tt('room.corpus.facets.readable', 'Читаемые для меня');
  readable.addEventListener('click', async () => {
    corpusFilter.readableOnly = !corpusFilter.readableOnly;
    readable.classList.toggle('on', corpusFilter.readableOnly);
    readable.setAttribute('aria-pressed', String(corpusFilter.readableOnly));
    if (corpusFilter.readableOnly) { readable.disabled = true; try { await ensureReadableSet(); } catch (_) {} readable.disabled = false; }
    corpusRefreshL1Body();
  });
  chips.appendChild(readable);
  // BRR-P3 — «⚙» progressive disclosure: keep the primary chips (Готовые/Читаемые) in the lean main row,
  // collapse the advanced filters (точная форма · аудио · проверено · жанр · язык) into a second row that
  // the gear toggles. Persisted; AUTO-expands when any advanced filter is active (active filters stay
  // visible); the gear shows «•» when advanced filters are on. Tames the @380px chip density (R4).
  const advWrap = el('div', { class: 'corpus-facets-advanced' });
  const advActive = !!(corpusFilter.exactForm || corpusFilter.hasAudio || corpusFilter.reviewed || corpusFilter.genre || corpusFilter.lang);
  let advExpanded = advActive || _filtersExpanded();
  const gear = el('button', { class: 'corpus-facet-chip corpus-facets-gear' + (advActive ? ' on' : ''), attrs: { type: 'button', 'aria-expanded': String(advExpanded), 'aria-controls': 'corpusFacetsAdv', title: tt('room.corpus.facets.more', 'Ещё фильтры') } });
  gear.textContent = '⚙' + (advActive ? ' •' : '');
  gear.addEventListener('click', () => { advExpanded = !advExpanded; advWrap.hidden = !advExpanded; gear.setAttribute('aria-expanded', String(advExpanded)); _setFiltersExpanded(advExpanded); });
  chips.appendChild(gear);
  advWrap.id = 'corpusFacetsAdv';
  // BRR-S9 — «🔤 Точная форма»: default search is lemma-tolerant («по корню» — all forms of the root);
  // ON restricts the in-text «слова» group to the LITERAL consonantal form (Reverso-class exact toggle).
  const exactChip = el('button', { class: 'corpus-facet-chip' + (corpusFilter.exactForm ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.exactForm), title: tt('room.corpus.search.exactFormHint', 'Только точная форма слова, без других форм корня') } });
  exactChip.textContent = '🔤 ' + tt('room.corpus.search.exactForm', 'Точная форма');
  exactChip.addEventListener('click', () => { corpusFilter.exactForm = !corpusFilter.exactForm; exactChip.classList.toggle('on', corpusFilter.exactForm); exactChip.setAttribute('aria-pressed', String(corpusFilter.exactForm)); corpusRefreshL1Body(); });
  advWrap.appendChild(exactChip);
  // BRR-S16 — provenance filters (data-feasible from ready cards; imply readable works). A simple toggle
  // chip each: 🔊 has-audio, ✍ human-reviewed. (Length is covered by the L3 length-sort; niqqud-ratio
  // would need a new corpus-search field — deferred, see the impl doc.)
  const mkProvChip = (key, emoji, i18nKey, fb) => {
    const c = el('button', { class: 'corpus-facet-chip' + (corpusFilter[key] ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter[key]) } });
    c.textContent = emoji + ' ' + tt(i18nKey, fb);
    c.addEventListener('click', () => { corpusFilter[key] = !corpusFilter[key]; c.classList.toggle('on', corpusFilter[key]); c.setAttribute('aria-pressed', String(corpusFilter[key])); corpusRefreshL1Body(); });
    return c;
  };
  advWrap.appendChild(mkProvChip('hasAudio', '🔊', 'room.corpus.facets.hasAudio', 'С аудио'));
  advWrap.appendChild(mkProvChip('reviewed', '✍', 'room.corpus.facets.reviewed', 'Проверено'));
  advWrap.appendChild(buildFacetSelect('genre', 'room.corpus.facets.genre', ((corpusRoot && corpusRoot.counts) || {}).by_genre || {}, corpusGenreLabel));
  advWrap.appendChild(buildFacetSelect('lang', 'room.corpus.facets.lang', ((corpusRoot && corpusRoot.counts) || {}).by_lang || {}, corpusLangLabel));
  advWrap.hidden = !advExpanded;
  // The clear chip is ALWAYS in the bar (the bar is not rebuilt on filter change to keep the
  // input focused) — its visibility is toggled by corpusRefreshL1Body.
  const clear = el('button', { class: 'corpus-facet-chip clear', attrs: { type: 'button' } });
  clear.textContent = '✕ ' + tt('room.corpus.facets.clear', 'Сбросить');
  clear.hidden = !corpusFilterActive();
  clear.addEventListener('click', () => { corpusFilter = { q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeEra: '' }; corpusNavTo('home'); });
  corpusClearChip = clear;
  chips.appendChild(clear);
  bar.appendChild(chips);
  bar.appendChild(advWrap);
  // BRR-S12 — recents/suggestions row (shown only when no query is active; toggled in corpusRefreshL1Body).
  corpusRecentsEl = el('div', { class: 'corpus-recents' });
  bar.appendChild(corpusRecentsEl);
  paintRecents();
  corpusRecentsEl.hidden = corpusFilterActive();
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
  wrap.appendChild(buildScopeSearchRow({ era }));   // BRR-S11 — «🔍 искать в периоде»
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
  wrap.appendChild(buildScopeSearchRow({ author: author.name, era }));   // BRR-S11 — «🔍 искать у автора»
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
    for (let i = cursor; i < upTo; i++) list.appendChild(renderCorpusWorkRow(works[i], openable, { showListBtn: true }));
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
  // In cross-author contexts (global results) show the author under the title. BRR-S14 — the author is a
  // tappable «ещё у автора» link → the author's full works drill (stopPropagation so it never opens the work).
  if (opts && opts.showAuthor && card.author) {
    const a = el('span', { class: 'corpus-work-author corpus-work-author-link', attrs: { role: 'button', tabindex: '0', title: tt('room.corpus.search.moreByAuthor', 'Ещё у автора') } });
    if (qToks && qToks.length) appendMarkedHebrew(a, card.author, qToks); else a.textContent = card.author;
    if (HEBREW_RE.test(card.author)) a.setAttribute('dir', 'rtl');
    const goAuthor = (ev) => { ev.preventDefault(); ev.stopPropagation(); corpusNavToAuthor(card.era, card.author); };
    a.addEventListener('click', goAuthor);
    a.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') goAuthor(ev); });
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
  // BRR — «➕ В список» on the work row (search results + author drill). Offered for non-ready works too:
  // the reading list honestly stores them as r:false (← openable) and auto-upgrades them once they ship.
  // Icon-only to stay compact at 380px; stopPropagation so it never opens the work.
  if (opts && opts.showListBtn && card.id != null) {
    const listBtn = el('button', { class: 'corpus-work-listbtn', attrs: { type: 'button', title: tt('room.corpus.lists.add', 'В список чтения'), 'aria-label': tt('room.corpus.lists.add', 'В список чтения') } });
    listBtn.__iconOnly = true;
    updateListBtn(listBtn, card);
    listBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openListPicker(card, listBtn, openable); });
    row.appendChild(listBtn);
  }
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
  // BRR-S7 — «≈N% тебе по силам» readability badge on ready result rows (lazy; honest — absent when
  // the reader has no profile overlap). Result rows are the showAuthor=true (cross-author) context.
  if (openable && opts && opts.showAuthor && card.id != null) observeCardCoverage(row, card);
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
  const findToggle = $('readerFindToggle');
  if (findToggle) findToggle.addEventListener('click', openReaderFind);   // BRR-S15 in-reader find
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
