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

const TRACKS = ['accessible', 'literary'];
let activeTrack = 'accessible';
let shelvesByTrack = { accessible: [], literary: [] };
let textByKey = new Map(); // text_key -> { id, title }

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
    const key = typeof it === 'string' ? it : (it && it.text_key);
    if (key) rail.appendChild(renderWorkCard(key));
  }
  wrap.appendChild(rail);
  return wrap;
}

function renderTrack() {
  const main = $('roomContent');
  if (!main) return;
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
    const btn = $(t === 'accessible' ? 'tabAccessible' : 'tabLiterary');
    if (btn) btn.setAttribute('aria-selected', String(t === track));
  });
  renderTrack();
}

// ── embedded reader (warm-worker open) ───────────────────────────────────────
// Opens a canon text IN THIS DOCUMENT via reader-core, reusing the db worker that
// boot() already warmed — the latency win over the cold deep-link. Reading-aids
// (translit profile + column visibility) re-render from the cached rows, no refetch.
let readerCfg = { visibleColumns: { action: true, he: true, niqqud: true, translit: true, ru: true }, translitProfile: 'sbl' };
let readerRows = [];
let readerAudio = null; // attachRowAudio detach handle

// BYOK GCP TTS key — same localStorage slot index.html uses (v3.gcpTtsApiKey).
// Empty is fine: audio falls back to keyless browser SpeechSynthesis.
function gcpTtsKey() { try { return localStorage.getItem('v3.gcpTtsApiKey') || ''; } catch (_) { return ''; } }

function readerConfig() {
  return {
    visibleColumns: { ...readerCfg.visibleColumns },
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
    profile: { voiceId: '', rate: 1.0, pitch: 0.0 },
    gcpKey: gcpTtsKey,
    t: (k) => tt(k, k),
  });
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
  const profLab = el('label');
  profLab.appendChild(el('span', { i18n: 'room.reader.translit', text: tt('room.reader.translit') }));
  const sel = el('select', { attrs: { 'aria-label': tt('room.reader.translit') } });
  [['sbl', tt('room.reader.profileSbl', 'SBL')], ['ru-phonetic', tt('room.reader.profileRu', 'Рус')]].forEach(([v, label]) => {
    const o = el('option', { text: label, attrs: { value: v } });
    if (v === readerCfg.translitProfile) o.setAttribute('selected', '');
    sel.appendChild(o);
  });
  sel.addEventListener('change', (e) => { readerCfg.translitProfile = e.target.value; rerenderReader(); });
  profLab.appendChild(sel);
  panel.appendChild(profLab);
  [['niqqud', 'room.reader.colNiqqud'], ['translit', 'room.reader.colTranslit'], ['ru', 'room.reader.colRu']].forEach(([col, key]) => {
    const lab = el('label');
    const cb = el('input', { attrs: { type: 'checkbox' } });
    cb.checked = !!readerCfg.visibleColumns[col];
    cb.addEventListener('change', () => { readerCfg.visibleColumns[col] = cb.checked; rerenderReader(); });
    lab.appendChild(cb);
    lab.appendChild(el('span', { i18n: key, text: tt(key) }));
    panel.appendChild(lab);
  });
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

async function openReader(textId, title) {
  const reader = $('roomReader'), content = $('roomContent');
  if (!reader) return;
  if (content) content.hidden = true;
  reader.hidden = false;
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
  if (res && res.ok) attachReaderAudio();
}

function closeReader() {
  if (readerAudio) { try { readerAudio.detach(); } catch (_) {} readerAudio = null; }
  const reader = $('roomReader'), content = $('roomContent');
  if (reader) reader.hidden = true;
  if (content) content.hidden = false;
}

// BRR-P0-004 — ship-as-asset: the curated canon ships as a precomputed bundle in
// public/data/benyehuda/ and is auto-imported into OPFS on the first Reading Room
// visit (then it's fully offline). Idempotent: skipped if the canon shelves already
// exist (OPFS truth) — import uses mode:'skip' so a re-run is a no-op anyway.
// canon-v2: now includes chaptered works as their own shelves (by-work-*). Versioned
// filename because /data/** is immutable-cached. The sentinel is a v2-ONLY shelf
// (by-work-95 = the 17-chapter «מהתחלה») so a v1-importer re-imports v2 (mode:'skip'
// dedups unchanged works by text_key; adds the new chapter texts + work-shelves).
const CANON_BUNDLE_URL = '/data/benyehuda/canon-v2.zip';
const CANON_FLAG = 'benyehuda_canon_v2_imported';
// BRR-P0-008 — the canon edition this shipped bundle publishes. Bump in lockstep
// with the producer's --canon-version when shipping a new canon-vN.zip. The import
// is OPFS-truth + version-gated: re-import only when the user is BELOW this version
// (the importBundle reconcile then drops orphans from the prior edition).
const CANON_BUNDLE_VERSION = 2;
const CANON_VERSION_KEY = 'benyehuda_canon_version';

async function autoImportCanon() {
  try {
    // Opt-out for tests/embedders (room-smoke checks Room structure, not the canon
    // publish): ?canon=skip disables the shipped-bundle auto-import.
    try { if (new URLSearchParams(location.search).get('canon') === 'skip') return false; } catch (_) {}
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
    if (haveVer >= CANON_BUNDLE_VERSION) {
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
  shelvesByTrack = { accessible: [], literary: [] };
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

function wireChrome() {
  const lang = $('roomLang');
  if (lang) {
    try { lang.value = (window.appGetLocale && window.appGetLocale()) || 'ru'; } catch (_) {}
    lang.addEventListener('change', (e) => { try { window.appSetLocale && window.appSetLocale(e.target.value); } catch (_) {} });
  }
  TRACKS.forEach((t) => {
    const btn = $(t === 'accessible' ? 'tabAccessible' : 'tabLiterary');
    if (btn) btn.addEventListener('click', () => setActiveTrack(t));
  });
  // Embedded reader chrome.
  const back = $('readerBack');
  if (back) back.addEventListener('click', closeReader);
  const aidsToggle = $('readerAidsToggle');
  if (aidsToggle) aidsToggle.addEventListener('click', () => {
    const panel = $('readerAids');
    if (!panel) return;
    const opening = panel.hidden;
    if (opening) buildAidsPanel();
    panel.hidden = !opening;
    aidsToggle.setAttribute('aria-expanded', String(opening));
  });
  // Re-apply translations to dynamically-built nodes when the language changes; the
  // reader table is built in JS (no data-i18n), so re-render it from cached rows if open.
  document.addEventListener('i18n:changed', () => {
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    try { const r = $('roomReader'); if (r && !r.hidden && readerRows.length) rerenderReader(); } catch (_) {}
    // Aids <option> labels are built once (not data-i18n) — rebuild them on locale change.
    try { const panel = $('readerAids'); if (panel && !panel.hidden) buildAidsPanel(); } catch (_) {}
  });
}

async function boot() {
  wireChrome();
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  try {
    await localDb.initLocalDB();
    if (localDb.isFollower && localDb.isFollower()) { showState('room.state.dbBusy', '📑'); return; }
    await autoImportCanon();   // publish the shipped canon shelf on first visit (idempotent)
    await loadData();
    // Default to the first track that actually has shelves (on-ramp first).
    if (!(shelvesByTrack.accessible || []).length && (shelvesByTrack.literary || []).length) activeTrack = 'literary';
    setActiveTrack(activeTrack);
  } catch (e) {
    if (e instanceof localDb.DbUnavailableError) { showState('room.state.dbBusy', '📑'); return; }
    try { console.error('[room] init failed:', e); } catch (_) {}
    showState('room.state.error', '⚠️');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Exposed for the screenshot/smoke harness to await readiness.
window.__roomReady = true;
