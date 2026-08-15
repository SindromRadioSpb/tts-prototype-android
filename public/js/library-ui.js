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
import { CORPORA, CAPABILITY_BADGES, corpusById } from '/js/corpus-registry.js';
import { adaptBenYehudaItem, adaptMyTextItem, adaptGroupCorpusItem, learningSignals } from '/js/corpus-item-presenter.js';
import * as roomB6 from '/js/room-b6-core.js';

// Studio exposes the same adapter for repository-backed media bindings. Room
// reuses it read-only so exact timing survives a cold open without duplicating
// any canonical tables or package state.
window.__localDB = localDb;

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
let corpusNav = { corpus: 'hub', level: 'home', era: null, author: null }; // drill position; corpus: 'hub' (L0 витрина) | 'benyehuda' | 'mytexts'
let corpusReveal = 0;           // incremental-reveal cursor for the active long list
let corpusRenderToken = 0;      // guards async renders against rapid navigation
let corpusImporting = false;
let groupCorpora = [];          // membership-filtered server catalogs (401 => absent, never public)
const groupCatalogs = new Map();// corpus_id -> {corpus,works}
const groupCorpusStates = new Map(); // per-corpus view state; never learner truth
let readerGroupCorpusId = null; // selects protected audio transport for the open work
const CORPUS_PAGE = 60;         // native Ben-Yehuda author/result page size
const ROOM_PREVIEW = 12;        // hard shelf/ready-preview DOM bound (Option B)
const ROOM_PROFILE_FIT_PREVIEW = 4; // quiet, actionable alternatives before the corpus catalog
const ROOM_BROWSE_PAGE = roomB6.ROOM_B6_LIMITS.pageSize; // B0 DOM ceiling stays fixed in B6

// B7 Learning Compass 2.0 — one shared ruleset, one existing learner truth, local aggregates only.
const learningCompass = window.LearningCompassCore;
const LEARNING_CALIBRATION_KEY = 'room.learningCompass.calibration.v2';
const LEARNING_CALIBRATION_DISABLED_KEY = 'room.learningCompass.calibrationDisabled.v2';
const _compassPage = new Map();
let _compassProjection = null;
let _compassProjectionLoading = null;
let _compassJobSeq = 0;
const _compassWorkerSlots = [];
const _compassWorkerQueue = [];
// Cold personal libraries are prepared once, incrementally, without requiring
// Reader opens. Five thousand is the already-verified B6 catalog scale; public
// and protected corpora use prebuilt aggregate sidecars instead of body scans.
const COMPASS_FULL_CATALOG_MAX = 5000;
const _compassBuildQueue = [];
const _compassBuildJobs = new Map();
let _compassBuildActive = null;
let _compassBuildScheduled = false;
let _compassBuildScheduleHandle = null;
let _compassBuildScheduleKind = '';
let _compassProgressTimer = null;
let _personalCompassSweep = null;
const _groupLearningIndexes = new Map();
const _groupLearningIndexLoading = new Map();
const _learningIndexStates = new Map();
let _benFamiliarityScores = null;
let _benFamiliarityLoading = null;
let _readingCalibrationSession = null;
let _readingAudioActive = 0;

function readCalibrationLedger() {
  if (!learningCompass) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNING_CALIBRATION_KEY) || 'null');
    return parsed && parsed.schema_version === learningCompass.CALIBRATION_SCHEMA ? parsed : learningCompass.emptyCalibrationLedger();
  } catch (_) { return learningCompass.emptyCalibrationLedger(); }
}

function writeCalibrationLedger(ledger) {
  if (!learningCompass) return;
  try {
    const encoded = JSON.stringify(ledger);
    if (new TextEncoder().encode(encoded).byteLength <= learningCompass.CALIBRATION_MAX_BYTES) localStorage.setItem(LEARNING_CALIBRATION_KEY, encoded);
  } catch (_) {}
}

function readingCalibrationDisabled() {
  try { return localStorage.getItem(LEARNING_CALIBRATION_DISABLED_KEY) === '1'; } catch (_) { return false; }
}

function repaintCalibrationState(status) {
  for (const [key, context] of _compassPage.entries()) {
    _compassPage.set(key, { ...context, readingTime: { status, min_minutes: null, max_minutes: null } });
    repaintPreparedCompass(key);
  }
  try { refreshCovChip(); } catch (_) {}
}

function resetLearningCalibration() {
  if (!learningCompass) return;
  writeCalibrationLedger(learningCompass.resetCalibrationLedger());
  repaintCalibrationState(readingCalibrationDisabled() ? 'DISABLED' : 'NEEDS_CALIBRATION');
  roomToast(tt('room.compass.calibrationReset', 'Локальная калибровка времени чтения сброшена'));
}

function toggleLearningCalibration() {
  const disable = !readingCalibrationDisabled();
  try {
    if (disable) localStorage.setItem(LEARNING_CALIBRATION_DISABLED_KEY, '1');
    else localStorage.removeItem(LEARNING_CALIBRATION_DISABLED_KEY);
  } catch (_) {}
  if (disable) writeCalibrationLedger(learningCompass.resetCalibrationLedger());
  repaintCalibrationState(disable ? 'DISABLED' : 'NEEDS_CALIBRATION');
  roomToast(disable
    ? tt('room.compass.calibrationDisabledToast', 'Учёт времени чтения отключён на этом устройстве')
    : tt('room.compass.calibrationEnabledToast', 'Учёт времени чтения включён на этом устройстве'));
  return disable;
}

function learningCalibrationToggle() {
  const disabled = readingCalibrationDisabled();
  const button = el('button', { class: 'learning-calibration-toggle', attrs: { type: 'button' },
    text: disabled ? tt('room.compass.enableCalibration', 'Включить учёт времени чтения') : tt('room.compass.disableCalibration', 'Не учитывать время чтения') });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    const nowDisabled = toggleLearningCalibration();
    button.textContent = nowDisabled ? tt('room.compass.enableCalibration', 'Включить учёт времени чтения') : tt('room.compass.disableCalibration', 'Не учитывать время чтения');
  });
  return button;
}

async function ensureLearningCompassProjection(force) {
  if (!learningCompass) return null;
  if (force) { _compassProjection = null; _compassProjectionLoading = null; }
  if (_compassProjection) return _compassProjection;
  if (_compassProjectionLoading) return _compassProjectionLoading;
  _compassProjectionLoading = localDb.getLearningCompassProjection().then((value) => (_compassProjection = value));
  try { return await _compassProjectionLoading; }
  catch (_) { return null; }
  finally { _compassProjectionLoading = null; }
}

async function familiaritySortProfileAvailable() {
  let projection = null;
  try { projection = await ensureLearningCompassProjection(); } catch (_) {}
  if (projection && Number(projection.tracked_lexeme_count || 0) > 0) return true;
  roomToast(tt('room.mytexts.sortFamiliarNeedsProfile', 'Сначала отметьте несколько знакомых слов.'));
  return false;
}

function reliableFamiliarityCount(values) {
  let count = 0;
  for (const fit of (values || [])) if (fit && fit.status === 'AVAILABLE' && fit.rank_eligible) count += 1;
  return count;
}

function explainNoReliableFamiliaritySort() {
  roomToast(tt('room.compass.sortNoReliable', 'Пока нет текстов с достаточно достоверной оценкой для сортировки.'));
}

function compassWorkerLimit() {
  try { return matchMedia('(max-width: 700px)').matches ? 1 : 2; } catch (_) { return 1; }
}

function pumpCompassWorkers() {
  if (typeof Worker === 'undefined') {
    while (_compassWorkerQueue.length) _compassWorkerQueue.shift().reject(new Error('WORKER_UNAVAILABLE'));
    return;
  }
  while (_compassWorkerSlots.length < compassWorkerLimit()) {
    let worker;
    try { worker = new Worker('/js/learning-compass-worker.js'); }
    catch (_) {
      while (_compassWorkerQueue.length) _compassWorkerQueue.shift().reject(new Error('WORKER_UNAVAILABLE'));
      return;
    }
    const slot = { worker, job: null };
    worker.onmessage = ({ data }) => {
      const job = slot.job; if (!job || !data || data.id !== job.id) return;
      slot.job = null;
      if (data.ok) job.resolve(data.ingredients); else job.reject(new Error(data.error || 'ANALYSIS_FAILED'));
      pumpCompassWorkers();
    };
    worker.onerror = () => {
      const job = slot.job; slot.job = null;
      if (job) job.reject(new Error('ANALYSIS_WORKER_FAILED'));
      try { worker.terminate(); } catch (_) {}
      const index = _compassWorkerSlots.indexOf(slot); if (index >= 0) _compassWorkerSlots.splice(index, 1);
      pumpCompassWorkers();
    };
    _compassWorkerSlots.push(slot);
  }
  for (const slot of _compassWorkerSlots) {
    if (slot.job || !_compassWorkerQueue.length) continue;
    const job = _compassWorkerQueue.shift(); slot.job = job;
    slot.worker.postMessage({ id: job.id, type: 'analyze', ...job.payload });
  }
}

function analyzeLearningRows(payload, options) {
  return new Promise((resolve, reject) => {
    const job = { id: 'lc-' + (++_compassJobSeq), payload, resolve, reject };
    if (options && options.foreground) _compassWorkerQueue.unshift(job);
    else _compassWorkerQueue.push(job);
    pumpCompassWorkers();
  });
}

function compassStatusContext(status, reasonCode) {
  const compass = {
    schema_version: learningCompass && learningCompass.COVERAGE_SCHEMA,
    status, reason_code: reasonCode, counts: null,
    recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null,
    rank_eligible: false, learner_projection_version: _compassProjection && _compassProjection.version || null,
    resolver_version: learningCompass && learningCompass.RESOLVER_VERSION,
  };
  return { compass, readingTime: null, primaryReason: 'NEUTRAL' };
}

function compassFailureContext(error) {
  const code = String(error && error.message || error || 'ANALYSIS_FAILED');
  const unsupported = /TOKEN_LIMIT|TYPE_LIMIT|PACKET_LIMIT|NO_HEBREW_TOKENS/.test(code);
  return compassStatusContext(unsupported ? 'UNSUPPORTED' : 'UNAVAILABLE', code.slice(0, 80));
}

function myCompassDescriptor(item) {
  if (!item || item.id == null) return null;
  return {
    cache_key: 'mytext:' + String(item.id), source_class: 'mytext', source_key: String(item.text_key || item.id),
    local_id: String(item.id), content_revision: String(item.updated_at || 'unknown'), content_sha256: '',
    entitlement_revision: null, resolver_version: learningCompass && learningCompass.RESOLVER_VERSION,
  };
}

function groupCompassDescriptor(corpusId, work, localRow) {
  if (!work || !work.bundle_sha256) return null;
  let edition = '';
  try { edition = localStorage.getItem('room.groupCorpus.edition.' + corpusId + '.' + work.work_id) || ''; } catch (_) {}
  return {
    cache_key: 'group:' + String(corpusId) + ':' + String(work.work_id), source_class: 'group',
    source_key: String(work.text_key || work.work_id),
    content_revision: String(work.bundle_sha256), content_sha256: '',
    entitlement_revision: String(work.bundle_sha256), resolver_version: learningCompass && learningCompass.RESOLVER_VERSION,
    local_id: localRow && edition === String(work.bundle_sha256) ? String(localRow.id) : null,
  };
}

function contextFromIngredients(ingredients, projection, primaryFlags) {
  if (!learningCompass) return { compass: null, readingTime: null, primaryReason: 'NEUTRAL' };
  // A missing projection is an availability failure, not an empty profile and not an
  // unprepared text. A tiny synthetic ingredient exists only to let the shared ruleset
  // express that status; it is never cached, rendered as content, or scored.
  const evaluatedIngredients = !projection && !ingredients ? {
    schema_version: learningCompass.INGREDIENTS_SCHEMA,
    resolver_version: learningCompass.RESOLVER_VERSION,
    key_frequencies: [{ key: '__projection_probe__', token_count: 1 }],
    unresolved_token_count: 0, proper_name_token_count: 0, total_token_count: 1,
  } : ingredients;
  const compass = learningCompass.evaluateRecordedFamiliarityV2({ ingredients: evaluatedIngredients, learner_projection: projection });
  const readingTime = ingredients && compass.status !== 'UNSUPPORTED'
    ? readingCalibrationDisabled() ? { status: 'DISABLED', min_minutes: null, max_minutes: null }
      : learningCompass.estimateReadingRange(ingredients.total_token_count, readCalibrationLedger()) : null;
  return {
    compass, readingTime,
    primaryReason: learningCompass.choosePrimaryReason({ ...(primaryFlags || {}), recorded_familiarity: compass }),
  };
}

function learningCompassContext(cacheKey, primaryFlags) {
  const found = cacheKey && _compassPage.get(String(cacheKey));
  if (found) return { ...found, primaryReason: learningCompass.choosePrimaryReason({ ...(primaryFlags || {}), recorded_familiarity: found.compass }) };
  return contextFromIngredients(null, _compassProjection, primaryFlags);
}

function repaintPreparedCompass(cacheKey) {
  try {
    document.querySelectorAll('[data-compass-key="' + CSS.escape(String(cacheKey)) + '"]').forEach((node) => {
      if (typeof node.__compassRepaint === 'function') node.__compassRepaint();
    });
  } catch (_) {}
}

async function buildAndCacheCompassDescriptor(descriptor, rows) {
  if (!descriptor || !learningCompass) return null;
  const ingredients = await analyzeLearningRows({
    rows, source_class: descriptor.source_class, source_key: descriptor.source_key,
    content_revision: descriptor.content_revision, entitlement_revision: descriptor.entitlement_revision,
  });
  await localDb.putLearningCompassIngredients({ ...descriptor, ingredients, content_sha256: ingredients.content_sha256 });
  const projection = await ensureLearningCompassProjection();
  const context = contextFromIngredients(ingredients, projection);
  // Off-screen sweep entries persist in the bounded DB cache, not in an unbounded
  // page-lifetime map. A visible/current descriptor already has a page entry.
  if (_compassPage.has(descriptor.cache_key)) {
    _compassPage.set(descriptor.cache_key, context);
    repaintPreparedCompass(descriptor.cache_key);
  }
  return ingredients;
}

function cancelCompassBuildSchedule() {
  if (!_compassBuildScheduled) return;
  try {
    if (_compassBuildScheduleKind === 'idle' && typeof cancelIdleCallback === 'function') cancelIdleCallback(_compassBuildScheduleHandle);
    else clearTimeout(_compassBuildScheduleHandle);
  } catch (_) {}
  _compassBuildScheduled = false;
  _compassBuildScheduleHandle = null;
  _compassBuildScheduleKind = '';
}

function scheduleCompassProgressPaint(immediate) {
  if (_compassProgressTimer) clearTimeout(_compassProgressTimer);
  _compassProgressTimer = setTimeout(async () => {
    _compassProgressTimer = null;
    const nodes = document.querySelectorAll('[data-learning-index-status="mytexts"]');
    if (!nodes.length || !learningCompass || typeof localDb.getPersonalTextCompassProgress !== 'function') return;
    let progress;
    try { progress = await localDb.getPersonalTextCompassProgress(learningCompass.RESOLVER_VERSION); }
    catch (_) { return; }
    const ready = Math.max(0, Number(progress && progress.prepared || 0));
    const total = Math.max(0, Number(progress && progress.total || 0));
    const complete = total > 0 && ready >= total;
    const copy = (complete
      ? tt('room.compass.libraryReady', 'Подбор по знакомости готов · {total} текстов')
      : tt('room.compass.libraryPreparing', 'Готовим подбор: {ready}/{total}'))
      .replace('{ready}', ready.toLocaleString()).replace('{total}', total.toLocaleString());
    nodes.forEach((node) => {
      node.setAttribute('data-state', complete ? 'ready' : 'preparing');
      const label = node.querySelector('[data-learning-index-copy]'); if (label) label.textContent = copy;
      const meter = node.querySelector('progress');
      if (meter) { meter.max = Math.max(1, total); meter.value = Math.min(ready, Math.max(1, total)); }
    });
  }, immediate ? 0 : 650);
}

function paintCorpusLearningIndexState(scope, next) {
  const key = String(scope || '');
  const state = { state: 'preparing', prepared: 0, total: 0, unsupported: 0, ...(next || {}) };
  _learningIndexStates.set(key, state);
  document.querySelectorAll('[data-learning-index-status="' + CSS.escape(key) + '"]').forEach((node) => {
    const total = Math.max(0, Number(state.total || 0));
    const prepared = Math.max(0, Number(state.prepared || 0));
    const unsupported = Math.max(0, Number(state.unsupported || 0));
    let copy;
    if (state.state === 'ready' && unsupported) {
      copy = tt('room.compass.corpusReadyLimited', 'Подбор готов: {ready}/{total} · без оценки: {unsupported}')
        .replace('{ready}', prepared.toLocaleString()).replace('{total}', total.toLocaleString()).replace('{unsupported}', unsupported.toLocaleString());
    } else if (state.state === 'ready') {
      copy = tt('room.compass.corpusReady', 'Подбор по знакомости готов · {total} текстов').replace('{total}', total.toLocaleString());
    } else if (state.state === 'error') {
      copy = tt('room.compass.corpusUnavailable', 'Подбор по знакомости временно недоступен');
    } else {
      copy = tt('room.compass.corpusPreparing', 'Готовим подбор: {ready}/{total}')
        .replace('{ready}', prepared.toLocaleString()).replace('{total}', total.toLocaleString());
    }
    node.setAttribute('data-state', state.state);
    const label = node.querySelector('[data-learning-index-copy]'); if (label) label.textContent = copy;
    const meter = node.querySelector('progress');
    if (meter) { meter.hidden = state.state === 'ready' || state.state === 'error'; meter.max = Math.max(1, total); meter.value = Math.min(prepared, Math.max(1, total)); }
  });
}

function corpusLearningIndexStatusNode(scope, total) {
  const key = String(scope || '');
  const status = el('div', { class: 'learning-index-status', attrs: { 'data-learning-index-status': key, role: 'status', 'aria-live': 'polite' } });
  status.appendChild(el('span', { attrs: { 'data-learning-index-copy': '' }, text: tt('room.compass.corpusPreparing', 'Готовим подбор: {ready}/{total}').replace('{ready}', '0').replace('{total}', Number(total || 0).toLocaleString()) }));
  const meter = document.createElement('progress'); meter.max = Math.max(1, Number(total) || 1); meter.value = 0; meter.setAttribute('aria-hidden', 'true'); status.appendChild(meter);
  setTimeout(() => paintCorpusLearningIndexState(key, _learningIndexStates.get(key) || { state: 'preparing', prepared: 0, total: Number(total) || 0 }), 0);
  return status;
}

function scheduleCompassBuildPump(urgent) {
  if (_compassBuildActive || !_compassBuildQueue.length) return;
  if (_compassBuildScheduled) {
    if (!urgent || _compassBuildScheduleKind === 'urgent') return;
    cancelCompassBuildSchedule();
  }
  _compassBuildScheduled = true;
  const start = () => {
    _compassBuildScheduled = false;
    _compassBuildScheduleHandle = null;
    _compassBuildScheduleKind = '';
    pumpCompassBuilds();
  };
  if (urgent) {
    _compassBuildScheduleKind = 'urgent';
    _compassBuildScheduleHandle = setTimeout(start, 0);
  } else if (typeof requestIdleCallback === 'function') {
    _compassBuildScheduleKind = 'idle';
    _compassBuildScheduleHandle = requestIdleCallback(start, { timeout: 2500 });
  } else {
    _compassBuildScheduleKind = 'timeout';
    _compassBuildScheduleHandle = setTimeout(start, 300);
  }
}

async function pumpCompassBuilds() {
  if (_compassBuildActive || !_compassBuildQueue.length) return;
  if (document.visibilityState === 'hidden' || document.body.classList.contains('room-reading')) return;
  const job = _compassBuildQueue.shift();
  _compassBuildActive = job;
  try {
    const rows = await localDb.getSentences(job.descriptor.local_id);
    await buildAndCacheCompassDescriptor(job.descriptor, rows);
    job.resolve({ ok: true, cache_key: job.descriptor.cache_key });
  } catch (error) {
    _compassPage.set(job.descriptor.cache_key, compassFailureContext(error));
    repaintPreparedCompass(job.descriptor.cache_key);
    job.resolve({ ok: false, cache_key: job.descriptor.cache_key, error: String(error && error.message || error) });
  } finally {
    _compassBuildJobs.delete(job.descriptor.cache_key);
    _compassBuildActive = null;
    scheduleCompassProgressPaint(false);
    if (_compassBuildQueue.length) scheduleCompassBuildPump(!!_compassBuildQueue[0].urgent);
  }
}

function enqueueCompassBuild(descriptor, urgent) {
  if (!descriptor || !descriptor.local_id || !descriptor.cache_key) return Promise.resolve({ ok: false, skipped: true });
  const key = String(descriptor.cache_key);
  const existing = _compassBuildJobs.get(key);
  if (existing) {
    if (urgent && !existing.urgent && existing !== _compassBuildActive) {
      const index = _compassBuildQueue.indexOf(existing);
      if (index >= 0) _compassBuildQueue.splice(index, 1);
      existing.urgent = true; _compassBuildQueue.unshift(existing);
      scheduleCompassBuildPump(true);
    }
    return existing.promise;
  }
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  const job = { descriptor, urgent: !!urgent, resolve, promise };
  _compassBuildJobs.set(key, job);
  if (urgent) _compassBuildQueue.unshift(job); else _compassBuildQueue.push(job);
  if (_compassPage.has(key)) {
    _compassPage.set(key, compassStatusContext('PENDING', 'LOCAL_ANALYSIS_PENDING'));
    repaintPreparedCompass(key);
  }
  scheduleCompassBuildPump(!!urgent);
  return promise;
}

function scheduleCompassIdleBuild(descriptors, options) {
  const urgent = !!(options && options.urgent);
  const list = (descriptors || []).filter((item) => item && item.local_id);
  // unshift would reverse a visible page; enqueue from the tail to preserve its scan order.
  const ordered = urgent ? list.slice().reverse() : list;
  const promises = ordered.map((descriptor) => enqueueCompassBuild(descriptor, urgent));
  return Promise.all(promises);
}

async function missingCompassDescriptors(descriptors) {
  const list = (descriptors || []).filter(Boolean).slice(0, ROOM_BROWSE_PAGE);
  if (!list.length) return [];
  let batch = { entries: {}, stale_keys: [], invalid_keys: [] };
  try { batch = await localDb.getLearningCompassIngredientsBatch(list); } catch (_) {}
  const cached = batch && batch.entries || {};
  return list.filter((descriptor) => !cached[descriptor.cache_key]);
}

async function runPersonalCompassSweep() {
  let cursor = null, scanned = 0, scheduled = 0;
  while (scanned < COMPASS_FULL_CATALOG_MAX) {
    const page = await localDb.listPersonalTextsPage({ limit: ROOM_BROWSE_PAGE, sort: 'updated_desc', cursor });
    const descriptors = (page.items || []).map(myCompassDescriptor).filter(Boolean);
    if (!descriptors.length) break;
    const missing = await missingCompassDescriptors(descriptors);
    const allowance = Math.max(0, COMPASS_FULL_CATALOG_MAX - scanned);
    const selected = missing.slice(0, allowance);
    if (selected.length) {
      scheduled += selected.length;
      await scheduleCompassIdleBuild(selected, { urgent: false });
    }
    scanned += descriptors.length;
    if (selected.length < missing.length || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  scheduleCompassProgressPaint(true);
  return { scanned, scheduled };
}

function startPersonalCompassSweep() {
  if (_personalCompassSweep || !learningCompass) return _personalCompassSweep;
  _personalCompassSweep = runPersonalCompassSweep().catch(() => null);
  return _personalCompassSweep;
}

async function loadPersonalFamiliarityRanking(options) {
  const projection = await ensureLearningCompassProjection();
  if (!projection || Number(projection.tracked_lexeme_count || 0) <= 0) return { status: 'NEEDS_PROFILE', items: [], matchedTotal: 0 };
  const all = [];
  let cursor = null, matchedTotal = 0;
  do {
    const page = await localDb.listPersonalTextsPage({ ...(options || {}), sort: 'updated_desc', limit: ROOM_BROWSE_PAGE, cursor });
    if (!matchedTotal) matchedTotal = Number(page.matchedTotal || 0);
    if (matchedTotal > COMPASS_FULL_CATALOG_MAX) return { status: 'TOO_LARGE', items: [], matchedTotal };
    const descriptors = (page.items || []).map(myCompassDescriptor);
    const batch = await localDb.getLearningCompassIngredientsBatch(descriptors);
    for (let index = 0; index < page.items.length; index += 1) {
      const item = page.items[index], descriptor = descriptors[index];
      const ingredients = batch.entries && batch.entries[descriptor.cache_key];
      if (!ingredients) return { status: 'PREPARING', items: [], matchedTotal };
      const context = contextFromIngredients(ingredients, projection);
      _compassPage.set(descriptor.cache_key, context);
      const fit = context.compass;
      all.push({ item, ordinal: all.length, fit });
    }
    cursor = page.nextCursor;
  } while (cursor && all.length < COMPASS_FULL_CATALOG_MAX);
  all.sort((a, b) => {
    const ar = !!(a.fit && a.fit.status === 'AVAILABLE' && a.fit.rank_eligible);
    const br = !!(b.fit && b.fit.status === 'AVAILABLE' && b.fit.rank_eligible);
    if (ar !== br) return ar ? -1 : 1;
    if (ar && br) {
      const delta = Number(b.fit.recorded_familiar_pct_lower_bound || 0) - Number(a.fit.recorded_familiar_pct_lower_bound || 0);
      if (delta) return delta;
    }
    return a.ordinal - b.ordinal;
  });
  return { status: 'AVAILABLE', items: all.map((entry) => entry.item), matchedTotal,
    rankEligibleTotal: reliableFamiliarityCount(all.map((entry) => entry.fit)) };
}

function personalCompassProgressNode() {
  const status = el('div', { class: 'learning-index-status', attrs: { 'data-learning-index-status': 'mytexts', role: 'status', 'aria-live': 'polite' } });
  status.appendChild(el('span', { attrs: { 'data-learning-index-copy': '' }, text: tt('room.compass.libraryChecking', 'Готовим подбор по знакомости…') }));
  const meter = document.createElement('progress'); meter.max = 1; meter.value = 0; meter.setAttribute('aria-hidden', 'true'); status.appendChild(meter);
  scheduleCompassProgressPaint(true);
  return status;
}

async function prepareLearningCompassPage(descriptors) {
  if (!learningCompass) return;
  const list = (descriptors || []).filter(Boolean).slice(0, ROOM_BROWSE_PAGE);
  const projection = await ensureLearningCompassProjection();
  let batch = { entries: {}, stale_keys: [], invalid_keys: [] };
  try { batch = await localDb.getLearningCompassIngredientsBatch(list); } catch (_) {}
  const cached = batch && batch.entries || {};
  const stale = new Set(batch && batch.stale_keys || []), invalid = new Set(batch && batch.invalid_keys || []);
  const missing = [];
  for (const descriptor of list) {
    const ingredients = cached[descriptor.cache_key] || null;
    const context = ingredients ? contextFromIngredients(ingredients, projection)
      : stale.has(descriptor.cache_key) ? compassStatusContext('STALE', 'INGREDIENTS_REVISION_MISMATCH')
        : invalid.has(descriptor.cache_key) ? compassStatusContext('UNAVAILABLE', 'INGREDIENT_CACHE_INVALID')
          : contextFromIngredients(null, projection);
    _compassPage.set(descriptor.cache_key, context);
    if (!ingredients) missing.push(descriptor);
  }
  // Every card in the active bounded page must become useful without a Reader open.
  // The catalog-wide sweep below remains lower priority and session-bounded.
  scheduleCompassIdleBuild(missing, { urgent: true });
}

function calibrationEligibilityActive() {
  return !readingCalibrationDisabled() && document.visibilityState === 'visible' && _readingAudioActive <= 0;
}

function tickReadingCalibration() {
  const session = _readingCalibrationSession;
  if (!session) return;
  const now = performance.now();
  if (session.active_since != null) session.foreground_ms += Math.max(0, now - session.active_since);
  session.active_since = calibrationEligibilityActive() ? now : null;
}

function beginReadingCalibration(meta, rows) {
  tickReadingCalibration();
  const descriptor = {
    source_class: meta.source_class, source_key: meta.source_key,
    content_revision: meta.content_revision, entitlement_revision: meta.entitlement_revision || null,
  };
  let ingredientsPromise = analyzeLearningRows({ rows, ...descriptor }, { foreground: true });
  if (meta.cache_descriptor) {
    ingredientsPromise = ingredientsPromise.then(async (ingredients) => {
      try {
        await localDb.putLearningCompassIngredients({ ...meta.cache_descriptor, ingredients, content_sha256: ingredients.content_sha256 });
        const projection = await ensureLearningCompassProjection();
        _compassPage.set(meta.cache_descriptor.cache_key, contextFromIngredients(ingredients, projection));
      } catch (_) {}
      return ingredients;
    });
  }
  _readingCalibrationSession = {
    text_id: String(meta.text_id || ''), descriptor, foreground_ms: 0,
    active_since: calibrationEligibilityActive() ? performance.now() : null,
    ingredients_promise: ingredientsPromise,
  };
}

async function completeReadingCalibration(tid) {
  const session = _readingCalibrationSession;
  if (!session || String(session.text_id) !== String(tid) || !learningCompass || readingCalibrationDisabled()) return;
  tickReadingCalibration();
  try {
    const ingredients = await session.ingredients_promise;
    const qualified = learningCompass.qualifyReadingSample({
      content_revision: ingredients.content_revision, content_sha256: ingredients.content_sha256,
      resolver_version: ingredients.resolver_version, token_count: ingredients.total_token_count,
      elapsed_foreground_ms: Math.round(session.foreground_ms), completed_explicitly: true,
    });
    if (qualified.accepted) {
      const ledger = learningCompass.appendCalibrationSample(readCalibrationLedger(), qualified.sample);
      writeCalibrationLedger(ledger);
    }
  } catch (_) {}
}

document.addEventListener('visibilitychange', () => {
  tickReadingCalibration();
  if (document.visibilityState === 'visible') scheduleCompassBuildPump(!!(_compassBuildQueue[0] && _compassBuildQueue[0].urgent));
});
document.addEventListener('play', () => { _roomReaderPresentationReadOnly = false; _readingAudioActive += 1; tickReadingCalibration(); }, true);
document.addEventListener('pause', () => { _readingAudioActive = Math.max(0, _readingAudioActive - 1); tickReadingCalibration(); }, true);
document.addEventListener('ended', () => { _readingAudioActive = Math.max(0, _readingAudioActive - 1); tickReadingCalibration(); }, true);

// B6.2/B6.4 browser adapters. The pure module owns allowlists and bounds; this
// file only bridges them to same-tab history/session and localStorage. None of
// these paths writes progress, grades, review events or a network endpoint.
const ROOM_PRESENTATION_KEY = 'room.presentation.v1';
const ROOM_DIAGNOSTIC_KEY = 'room.diagnostics.local.v1';
let _roomRestoringHistory = false;
let _roomPresentationReady = false;
let _roomInitialState = null;
let _roomHistoryFallbackNotice = false;
// History/reload presentation restoration is read-only until a genuine learner action.
// A time window was insufficient: a late media scroller can continue emitting settling
// scroll events after the deadline and falsely replace the restored working row.
let _roomReaderPresentationReadOnly = false;

function roomDiagRead() {
  try { const value = JSON.parse(localStorage.getItem(ROOM_DIAGNOSTIC_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch (_) { return []; }
}
function roomDiagPush(event) {
  try {
    const ring = roomB6.appendLocalDiagnostic(roomDiagRead(), event, Date.now());
    localStorage.setItem(ROOM_DIAGNOSTIC_KEY, JSON.stringify(ring));
  } catch (_) {}
}
function exportRoomDiagnostics() {
  try {
    const payload = roomB6.sanitizeDiagnosticExport(roomDiagRead(), Date.now());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'linguistpro-room-local-diagnostics.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    roomToast(tt('room.diagnostics.exported', 'Локальная диагностика экспортирована'));
  } catch (_) { roomToast(tt('room.diagnostics.exportFailed', 'Не удалось экспортировать диагностику')); }
}
function installRoomPerformanceDiagnostics() {
  roomDiagPush({ kind: 'room.boot', result: 'started', display: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser' });
  if (!('PerformanceObserver' in window)) return;
  try {
    let lastLcp = null;
    const observer = new PerformanceObserver((list) => { const entries = list.getEntries(); if (entries.length) lastLcp = entries[entries.length - 1]; });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    addEventListener('pagehide', () => { if (lastLcp) roomDiagPush({ kind: 'room.lcp', value: lastLcp.startTime, result: 'observed' }); }, { once: true });
  } catch (_) {}
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration) roomDiagPush({ kind: 'room.inp', value: entry.duration, result: 'observed' });
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 40 });
  } catch (_) {}
  try {
    let cls = 0;
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value || 0; });
    observer.observe({ type: 'layout-shift', buffered: true });
    addEventListener('pagehide', () => roomDiagPush({ kind: 'room.cls', bucket: cls < 0.1 ? 'good' : (cls < 0.25 ? 'needs-improvement' : 'poor'), result: 'observed' }), { once: true });
  } catch (_) {}
}

function roomAuthorId(author) {
  if (!author) return '';
  if (typeof author === 'string') return author;
  return author.qid ? String(author.qid) : '';
}
function roomCurrentPresentationState(overrides = {}) {
  const readerOpen = !!($('roomReader') && !$('roomReader').hidden && readerTextId != null);
  const corpus = corpusNav.corpus === 'hub' ? 'benyehuda' : (corpusNav.corpus || 'benyehuda');
  const surface = readerOpen ? 'reader' : (corpusNav.corpus === 'hub' ? 'hub' : (corpus === 'mytexts' ? 'mytexts' : (String(corpus).startsWith('group:') ? 'group' : 'corpus')));
  const sourceFilters = corpus === 'mytexts' ? myCorpusState : {
    q: corpusFilter.q || '', level: '', tags: [], tagMode: 'all', scope: 'texts', sort: corpusL1Sort || 'opened_desc', smart: corpusFilter.smart || '',
  };
  return roomB6.sanitizePresentationState({
    v: 1, surface, corpus,
    drill: { level: corpusNav.level || 'home', eraId: corpusNav.era || '', authorId: roomAuthorId(corpusNav.author), workId: '' },
    filters: sourceFilters, visible: ROOM_BROWSE_PAGE,
    anchor: overrides.anchor || { itemId: readerOpen ? String(readerTextId) : '', rowIndex: 0 },
    ...overrides,
  });
}
function roomStateUrl(state) {
  return location.pathname + location.search + roomB6.presentationHash(state);
}
function roomStorePresentation(state) {
  try { sessionStorage.setItem(ROOM_PRESENTATION_KEY, roomB6.encodeSessionMirror(state, Date.now())); } catch (_) {}
}
function roomCommitPresentation(mode, overrides = {}) {
  if (!_roomPresentationReady || _roomRestoringHistory) return;
  const state = roomCurrentPresentationState(overrides);
  try { history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', roomStateUrl(state)); } catch (_) {}
  roomStorePresentation(state); _roomInitialState = state;
}
function roomPushPresentationState(overrides) { roomCommitPresentation('push', overrides); }
function roomReplacePresentationState(item, rowIndex) {
  roomCommitPresentation('replace', { anchor: { itemId: item && item.id ? String(item.id) : '', rowIndex: Math.max(0, Number(rowIndex) || 0) } });
}
function roomInitialMyTextsAnchor() {
  const state = _roomInitialState;
  return state && state.corpus === 'mytexts' && state.anchor ? { itemId: state.anchor.itemId || '', rowIndex: Number(state.anchor.rowIndex) || 0 } : null;
}
function roomDecodeInitialPresentation() {
  if (location.hash === '#mentor' || location.hash === '#lesson-builder') return null;
  const explicitHashState = roomB6.presentationStateFromHash(location.hash);
  const hasExplicitRoomHash = String(location.hash || '').startsWith('#room=');
  if (hasExplicitRoomHash && !explicitHashState) {
    _roomHistoryFallbackNotice = true;
    return null;
  }
  if (explicitHashState && history.state && history.state.v === 1
    && roomB6.presentationStateMatchesHash(history.state, location.hash)) {
    return roomB6.sanitizePresentationState(history.state);
  }
  let mirrored = null;
  try { mirrored = roomB6.decodeSessionMirror(sessionStorage.getItem(ROOM_PRESENTATION_KEY), Date.now()); } catch (_) {}
  if (explicitHashState) {
    if (mirrored && roomB6.presentationStateMatchesHash(mirrored, location.hash)) return mirrored;
    return explicitHashState;
  }
  if (history.state && history.state.v === 1) return roomB6.sanitizePresentationState(history.state);
  if (mirrored) return mirrored;
  return null;
}
function roomApplyStateFields(state) {
  const safe = roomB6.sanitizePresentationState(state || {});
  _roomInitialState = safe;
  activeTrack = 'corpus';
  if (safe.corpus === 'mytexts') {
    myCorpusState = { ...myCorpusState, ...safe.filters, tags: (safe.filters.tags || []).slice() };
    corpusNav = { corpus: 'mytexts', level: 'home', era: null, author: null };
  } else if (String(safe.corpus).startsWith('group:')) {
    corpusNav = { corpus: safe.corpus, level: 'home', era: null, author: null };
  } else if (safe.surface === 'hub') {
    corpusNav = { corpus: 'hub', level: 'home', era: null, author: null };
  } else {
    corpusFilter.q = safe.filters.q || ''; corpusFilter.smart = safe.filters.smart || '';
    corpusNav = { corpus: 'benyehuda', level: safe.drill.level || 'home', era: safe.drill.eraId || null, author: safe.drill.authorId || null };
  }
  return safe;
}
async function roomApplyHistoryState(rawState) {
  const state = roomApplyStateFields(rawState);
  TRACKS.forEach((track) => { const button = $(TAB_ID[track]); if (button) button.setAttribute('aria-selected', String(track === 'corpus')); });
  const reader = $('roomReader');
  if (state.surface === 'reader' && state.anchor.itemId) {
    if (!reader || reader.hidden || String(readerTextId || '') !== String(state.anchor.itemId)) {
      await openReader(state.anchor.itemId, '', { presentationRestore: true, resume: true });
    }
  } else if (reader && !reader.hidden) {
    await closeReader({ presentationRestore: true, presentationReturnContext: { nav: { ...corpusNav }, scrollX: 0, scrollY: 0, anchorTop: null, continuityKey: '', focusAction: '', focusKey: '', disclosures: [] } });
  } else await renderCorpus();
  roomStorePresentation(state);
}

// A3 Slice 2 — global search + facets, backed by ONE lazy flat index (corpus-search-v3.json,
// ~370KB br, fetched on the FIRST search/facet use only, NOT precached). It powers both the
// title-search and the genre/lang/ready facet filter; a ready hit is opened by joining its id
// to corpusIndex.ready, an unprocessed hit is a display-only row (honest, never openable).
let corpusSearch = null;         // [{id,t,a,e,g,l,r, _n:niqqud-stripped title}] (normalized on load)
let corpusSearchLoading = null;  // single-flight guard
let corpusVocab = null;          // BRR-P1-007 S2: { dict:[pid], works:{id:{ids,tok,m,n,ez}} } (lazy, NOT precached)
let corpusVocabLoading = null;   // single-flight guard
const CORPUS_VOCAB_DATA_REV = 2;  // bump when corpus-vocab sidecar CONTENT changes within a catalog version (S3=ez)
const CORPUS_SEARCH_DATA_REV = 1; // bump when corpus-search sidecar CONTENT changes within a catalog version (Epic-6=author qid `q`)
const CORPUS_AUTHORS_DATA_REV = 2; // bump when corpus-authors OR corpus-editorial CONTENT changes within a catalog version (rev2 = first approved author bios); keeps force-cache (offline-first) fresh
const FTS_DATA_REV = 5;           // BRR-P2-001/006/006a — bump when the FTS index CONTENT/FORMAT changes (rev 5 = 2-level prefix shards)
const TRANSLIT_DATA_REV = 1;     // BRR-S18 — bump when build-translit-index output changes within a catalog version
let corpusFtsSeq = 0;            // BRR-P2-006a — monotonic render token: a superseded FTS query's late results never paint
let corpusReadyById = null;      // Map(id -> full ready card) for opening result rows
let corpusReadyByKey = null;     // Map(text_key -> full ready card) — W4: resolve the OPEN work's sidecar coverage
let corpusFilter = { q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeAuthorQid: '', scopeEra: '', smart: '' }; // active global filter (readableOnly = B7 valid exact profile count; exactForm = S9 literal-form mode; hasAudio/reviewed = S16 provenance; scopeAuthor/scopeEra = S11 scoped search; smart = uniform personal smart-chip)
// ── Uniform retrieval contract (BRR_MULTI_CORPUS_DESIGN §5): PERSONAL dimensions for the
// Ben-Yehuda corpus — the same smart-chips / #tag semantics as «Мои тексты», driven by the SAME
// localDb sets, applied to works MATERIALIZED on this device (an un-opened catalog work has no
// personal state — honest scope, hinted in the UI). Cached single-flight; invalidated when a
// work materializes (openCorpusWork).
let _personalSets = null, _personalSetsLoading = null;
function invalidatePersonalSets() { _personalSets = null; _personalSetsLoading = null; }
async function ensurePersonalSets() {
  if (_personalSets) return _personalSets;
  if (_personalSetsLoading) return _personalSetsLoading;
  _personalSetsLoading = (async () => {
    const out = { idByKey: new Map(), lastOpenedByKey: new Map(), tagsByKey: new Map(),
      smart: { struggling: new Set(), mastered: new Set(), fresh: new Set(), 'with-note': new Set(), 'audio-noted': new Set(), 'srs-noted': new Set(), templated: new Set() } };
    try {
      const rows = await localDb.dbQuery('SELECT id, text_key, last_opened_at, tags_json FROM texts WHERE is_archived = 0');
      for (const r of (rows || [])) {
        if (!r || !r.text_key) continue;
        out.idByKey.set(String(r.text_key), String(r.id));
        if (r.last_opened_at) out.lastOpenedByKey.set(String(r.text_key), r.last_opened_at);
        try { const t = r.tags_json ? JSON.parse(r.tags_json) : []; if (Array.isArray(t) && t.length) out.tagsByKey.set(String(r.text_key), t.map(String)); } catch (_) {}
      }
    } catch (_) {}
    // personal OVERLAY tags/meta (corpus texts; mig 061) override/extend the row tags
    try { for (const m of (await localDb.listTextUserMeta() || [])) { try { const t = m.tags_json ? JSON.parse(m.tags_json) : []; if (Array.isArray(t) && t.length) out.tagsByKey.set(String(m.text_key), t.map(String)); } catch (_) {} } } catch (_) {}
    try { for (const id of (await localDb.getStrugglingTexts({}) || [])) out.smart.struggling.add(String(id)); } catch (_) {}
    try { for (const id of (await localDb.getMasteredTexts() || [])) out.smart.mastered.add(String(id)); } catch (_) {}
    try {
      const lastVisit = localStorage.getItem('roomMyTextsLastVisit_v1') || '';
      if (lastVisit && typeof localDb.getTextsCreatedAfter === 'function') for (const id of (await localDb.getTextsCreatedAfter(lastVisit) || [])) out.smart.fresh.add(String(id));
    } catch (_) {}
    for (const kind of ['with-note', 'audio-noted', 'srs-noted', 'templated']) {
      try { for (const id of (await localDb.getTextIdsForNotesSmartChip(kind) || [])) out.smart[kind].add(String(id)); } catch (_) {}
    }
    _personalSets = out;
    return out;
  })();
  return _personalSetsLoading;
}
// #tag / tag: syntax (the SAME parse as «Мои тексты» — uniform PRO query line). Memoized per raw q.
let _pqCache = { raw: null, textQ: '', tags: [] };
function corpusPersonalQuery(raw) {
  const s = String(raw || '');
  if (_pqCache.raw === s) return _pqCache;
  const textTokens = [], tags = [];
  for (const p of s.trim().split(/\s+/).filter(Boolean)) {
    if (p[0] === '#') { const t2 = p.slice(1).trim(); if (t2) tags.push(t2); }
    else if (/^tag:/i.test(p)) { const t2 = p.slice(4).trim(); if (t2) tags.push(t2); }
    else textTokens.push(p);
  }
  _pqCache = { raw: s, textQ: textTokens.join(' '), tags };
  return _pqCache;
}
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
  const entry = { name: name, f: { q: f.q, genre: f.genre, lang: f.lang, readyOnly: f.readyOnly, readableOnly: f.readableOnly, exactForm: f.exactForm, hasAudio: f.hasAudio, reviewed: f.reviewed, scopeAuthor: f.scopeAuthor, scopeAuthorQid: f.scopeAuthorQid, scopeEra: f.scopeEra } };
  const a = getSavedSearches().filter((x) => x.name !== name);   // dedup by human name
  a.unshift(entry); _lsSet(SAVED_SEARCHES_KEY, a.slice(0, 20));
}
function removeSavedSearch(name) { _lsSet(SAVED_SEARCHES_KEY, getSavedSearches().filter((x) => x.name !== name)); }
function restoreSavedSearch(f) {
  corpusFilter = Object.assign({ q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeAuthorQid: '', scopeEra: '' }, f || {});
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
function renameReadingList(listId, name) {
  const nextName = String(name || '').trim().slice(0, 120);
  if (!nextName) return false;
  const lists = getReadingLists();
  const list = lists.find((item) => item.id === listId);
  if (!list) return false;
  list.name = nextName;
  saveReadingLists(lists);
  return true;
}
function deleteReadingList(listId) { saveReadingLists(getReadingLists().filter((x) => x.id !== listId)); }
function removeItemFromList(listId, id) {
  const lists = getReadingLists(); const L = lists.find((x) => x.id === listId); if (!L) return;
  L.items = (L.items || []).filter((x) => String(x.id) !== String(id)); saveReadingLists(lists);
}
function restoreItemToList(listId, item, index) {
  const lists = getReadingLists(); const L = lists.find((x) => x.id === listId); if (!L || !item) return false;
  L.items = (L.items || []).filter((x) => String(x.id) !== String(item.id));
  L.items.splice(Math.max(0, Math.min(Number(index) || 0, L.items.length)), 0, item);
  if (L.items.length > 300) L.items = L.items.slice(0, 300);
  saveReadingLists(lists); return true;
}
let corpusL1Body = null;         // ref to the L1 body region (refreshed in place so the
                                 // filter bar — and the search input's focus — survive typing)
let corpusClearChip = null;      // ref to the «✕ Сбросить» chip (shown only when a filter is active)
let corpusAuthorSort = 'graduated'; // L2 author order: 'graduated' (ready-first) | 'alpha'
let corpusWorkSort = 'graded';      // BRR-P2-004 L3 work order: 'graded'(id) | 'alpha' | 'length'
let corpusWorkGenre = '';           // BRR-P2-004 L3 genre filter within the author ('' = all)
let corpusL1Sort = 'ready';         // FB-9 L1 results order: 'ready'(ready-first+alpha) | 'alpha' | 'length'
let corpusFilterChromeRefresh = null; // B3: keeps the compact filter summary honest without rebuilding search

const CORPUS_NIQQUD_RE = /[֑-ׇ]/g; // same range as notes-autogen stripNiqqud (single normalizer)
function corpusNrm(s) { return String(s == null ? '' : s).replace(CORPUS_NIQQUD_RE, '').toLowerCase().trim(); }

const $ = (id) => document.getElementById(id);
const tt = (key, fallback) => {
  try {
    const translated = window.t && window.t(key);
    // A stale service-worker locale returns the key itself. Dynamic UI does
    // not pass through applyI18n(), so preserve its explicit fallback until
    // the refreshed locale bundle arrives instead of exposing raw keys.
    return translated && translated !== key ? translated : (fallback || key);
  } catch (_) { return fallback || key; }
};
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

function deepLinkForCorpusWork(workId) {
  return '/library.html?corpus_work=' + encodeURIComponent(String(workId));
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

// ROOM-UX-VF1 — fallback-first icon adoption for the Room shell/L0/corpora.
// The existing Unicode glyph remains visible until the already-vendored,
// same-origin sprite is confirmed available. A stale SW therefore cannot
// create a blank icon-only control, and this path never writes app state.
const ROOM_ICON_SPRITE = '/icons/linguistpro-ui.svg';
let _roomIconSpritePromise = null;
let _roomIconSpriteReady = false;
function ensureRoomIconSprite() {
  if (_roomIconSpriteReady) return Promise.resolve(true);
  if (_roomIconSpritePromise) return _roomIconSpritePromise;
  _roomIconSpritePromise = fetch(ROOM_ICON_SPRITE, { cache: 'force-cache', credentials: 'same-origin' })
    .then((response) => {
      const type = String(response.headers.get('content-type') || '').toLowerCase();
      if (!response.ok || !type.includes('image/svg+xml')) return false;
      _roomIconSpriteReady = true;
      return true;
    })
    .catch(() => false);
  return _roomIconSpritePromise;
}

function hydrateRoomIconSlot(slot) {
  if (!slot || slot.getAttribute('data-room-icon-ready') === 'true') return;
  const symbol = String(slot.getAttribute('data-room-icon') || '');
  if (!/^lp-(?:icon|mark)-[a-z0-9-]+$/.test(symbol)) return;
  const paint = () => {
    if (slot.getAttribute('data-room-icon') !== symbol) return;
    if (slot.getAttribute('data-room-icon-ready') === 'true') return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lp-icon room-svg-icon');
    if (slot.classList.contains('room-icon-directional')) svg.classList.add('lp-icon--directional');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', ROOM_ICON_SPRITE + '#' + symbol);
    svg.appendChild(use);
    const fallback = slot.querySelector('.room-icon-fallback');
    slot.insertBefore(svg, fallback || slot.firstChild);
    if (fallback) fallback.hidden = true;
    slot.setAttribute('data-room-icon-ready', 'true');
  };
  if (_roomIconSpriteReady) paint();
  else ensureRoomIconSprite().then((ready) => { if (ready) paint(); });
}

function hydrateRoomIcons(root) {
  if (!root) return;
  if (root.matches && root.matches('[data-room-icon]')) hydrateRoomIconSlot(root);
  if (root.querySelectorAll) root.querySelectorAll('[data-room-icon]').forEach(hydrateRoomIconSlot);
}

function roomIcon(symbol, fallback, className) {
  const slot = el('span', {
    class: 'room-icon-slot' + (className ? ' ' + className : ''),
    attrs: { 'data-room-icon': symbol, 'aria-hidden': 'true' },
  });
  slot.appendChild(el('span', { class: 'room-icon-fallback', text: fallback || '•', attrs: { 'aria-hidden': 'true' } }));
  hydrateRoomIconSlot(slot);
  return slot;
}

function setRoomIcon(target, symbol, fallback, className) {
  if (!target) return;
  target.removeAttribute('data-room-icon');
  target.removeAttribute('data-room-icon-ready');
  target.replaceChildren(roomIcon(symbol, fallback, className));
}

function appendRoomIconText(target, symbol, fallback, text, className) {
  if (!target) return;
  target.replaceChildren(roomIcon(symbol, fallback, className), el('span', { text: text }));
}

function roomCorpusIconSpec(corpus) {
  const id = String(corpus && corpus.id || '');
  if (id === 'benyehuda') return { symbol: 'lp-mark-room', fallback: corpus.icon || '◇' };
  if (id === 'mytexts') return { symbol: 'lp-mark-studio', fallback: corpus.icon || '📖' };
  if (id.startsWith('group:')) return { symbol: 'lp-icon-audio', fallback: corpus.icon || '♪' };
  return { symbol: 'lp-mark-room', fallback: corpus && corpus.icon || '◇' };
}

function markRoomTextLanguage(node, value) {
  if (!node) return node;
  if (HEBREW_RE.test(String(value || ''))) {
    node.setAttribute('lang', 'he');
    node.setAttribute('dir', 'rtl');
  }
  return node;
}

function roomNumber(value) {
  const locale = (() => { try { return (window.appGetLocale && window.appGetLocale()) || 'ru'; } catch (_) { return 'ru'; } })();
  try { return new Intl.NumberFormat(locale).format(Number(value) || 0); } catch (_) { return String(Number(value) || 0); }
}

// B4 Learning Compass: localized copy enters the pure adapters as data. The adapters
// never reach into i18n, LocalDb or the DOM, so they remain a projection rather than a
// second readiness/progress authority.
function corpusItemCopy() {
  const replace = (key, fallback, token, value) => tt(key, fallback).replace(token, String(value));
  return {
    untitled: tt('room.work.untitled', 'Без названия'),
    ownText: tt('room.shell.ownText', 'Ваш текст'),
    assigned: tt('room.compass.assigned', 'назначено группе'),
    finished: tt('room.groupCorpus.finished', 'Прочитано'),
    continuePercent: (value) => replace('room.compass.continuePercent', 'Продолжить · {value}%', '{value}', value),
    continueRow: (value) => replace('room.compass.continueRow', 'Продолжить · строка {value}', '{value}', value),
    studioLevelReason: tt('room.compass.studioLevelReason', 'Уровень указан в Студии'),
    groupLevelReason: tt('room.compass.groupLevelReason', 'Уровень указан владельцем корпуса'),
    familiarityReason: tt('room.compass.familiarityReason', 'Зафиксированное совпадение с вашим профилем слов'),
    intrinsicReason: tt('room.compass.intrinsicReason', 'Приблизительная сложность по частотности лексики'),
    assignedReason: tt('room.compass.assignedReason', 'Назначено вашей учебной группе'),
    partialAudio: tt('room.compass.partialAudio', 'Аудио доступно частично'),
    personalProvenance: tt('room.compass.personalProvenance', 'Ваш текст · уровень указан в Студии'),
    personalProvenanceUnknown: tt('room.compass.personalProvenanceUnknown', 'Ваш текст · уровень не указан'),
    benProvenance: tt('room.compass.benProvenance', 'Сложность — по частотности; знакомые слова — только по реальному профилю'),
    groupProvenance: (revision) => replace('room.compass.groupProvenance', 'Учебная группа · TTS · редакция аудио {value}', '{value}', revision),
    groupProvenanceUnknown: tt('room.compass.groupProvenanceUnknown', 'Учебная группа · источник и редакция аудио не подтверждены'),
    groupNotPreparedAction: tt('room.compass.groupNotPreparedAction', 'Откройте для анализа'),
    groupNotPreparedDetail: tt('room.compass.groupNotPreparedDetail', 'Анализ выполнится локально после первого открытия текста.'),
    limitedFamiliarityDetail: tt('room.compass.limitedFamiliarityDetail', 'Неоднозначность слишком велика для сортировки; показана только нижняя граница.'),
  };
}

function learningSignalKindLabel(kind) {
  const map = {
    familiarity: ['room.compass.kindFamiliarity', 'Знакомые слова'],
    'reading-time': ['room.compass.kindReadingTime', 'Время чтения'],
    level: ['room.compass.kindLevel', 'Уровень'],
    audio: ['room.compass.kindAudio', 'Аудио'],
  };
  const entry = map[String(kind)] || ['room.compass.kindUnknown', 'Сигнал'];
  return tt(entry[0], entry[1]);
}

function learningProvenanceTypeLabel(type) {
  const map = {
    curated: ['room.compass.provCurated', 'проверено'],
    asserted: ['room.compass.provAsserted', 'указано владельцем'],
    derived: ['room.compass.provDerived', 'вычислено'],
    unknown: ['room.compass.provUnknown', 'не подтверждено'],
  };
  const entry = map[String(type)] || map.unknown;
  return tt(entry[0], entry[1]);
}

function learningMediaLabel(media) {
  if (!media || !media.kind) return '';
  if (media.kind !== 'audio') return '';
  const key = media.coverage === 'full' ? 'room.compass.audioFull'
    : media.coverage === 'partial' ? 'room.compass.audioPartial'
      : media.coverage === 'none' ? 'room.compass.audioNone' : 'room.compass.audioPresent';
  const fallback = media.coverage === 'full' ? 'Аудио полностью'
    : media.coverage === 'partial' ? 'Аудио частично'
      : media.coverage === 'none' ? 'Аудио отсутствует' : 'Аудио';
  return tt(key, fallback) + (media.countLabel ? ' ' + media.countLabel : '');
}

function learningReadingTimeCopy(value) {
  const readingTime = value || {};
  if (readingTime.status === 'AVAILABLE' && Number.isFinite(Number(readingTime.min_minutes)) && Number.isFinite(Number(readingTime.max_minutes))) {
    return tt('room.compass.readingRange', '{min}–{max} мин')
      .replace('{min}', String(readingTime.min_minutes)).replace('{max}', String(readingTime.max_minutes));
  }
  if (readingTime.status === 'DISABLED') return tt('room.compass.timeDisabled', 'Учёт времени отключён');
  return tt('room.compass.timeNeedsCalibration', 'Время — после 5 завершённых чтений');
}

function renderLearningCompass(item, options) {
  const row = el('div', { class: 'learning-compass work-card-difficulty' });
  paintLearningCompass(row, item, options);
  return row;
}

const DISMISSIBLE_DETAILS_SELECTOR = '.learning-compass-details[open], .room-study-total-help[open]';
let dismissibleDetailsBound = false;
function bindDismissibleDetails() {
  if (dismissibleDetailsBound) return;
  dismissibleDetailsBound = true;
  document.addEventListener('pointerdown', (event) => {
    const inside = event.target && event.target.closest ? event.target.closest(DISMISSIBLE_DETAILS_SELECTOR) : null;
    document.querySelectorAll(DISMISSIBLE_DETAILS_SELECTOR).forEach((details) => {
      if (details !== inside) details.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const opened = document.querySelectorAll(DISMISSIBLE_DETAILS_SELECTOR);
    const details = opened.length ? opened[opened.length - 1] : null;
    if (!details) return;
    event.preventDefault(); details.open = false;
    const summary = details.querySelector('summary'); if (summary) summary.focus();
  });
}

function wireDismissibleDetails(details) {
  if (!details) return details;
  bindDismissibleDetails();
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    document.querySelectorAll(DISMISSIBLE_DETAILS_SELECTOR).forEach((peer) => { if (peer !== details) peer.open = false; });
  });
  return details;
}

function paintLearningCompass(target, item, options) {
  if (!target || !item) return;
  const opts = options || {};
  const readiness = item.readiness || {};
  const state = item.learnerState || {};
  target.textContent = '';
  target.classList.add('learning-compass', 'work-card-difficulty');
  target.setAttribute('data-confidence', readiness.confidence || 'unknown');
  target.setAttribute('aria-label', tt('room.compass.label', 'Ориентир для чтения'));
  if (target.closest('.room-text-row')) target.closest('.room-text-row').setAttribute('data-state', state.state || 'new');
  for (const signal of learningSignals(item)) {
    if (signal.kind === 'level') {
      const band = readiness.band || '';
      const node = el('span', { class: 'learning-signal learning-level diff-band' + (band ? ' diff-' + band : ''), text: signal.label || signal.value });
      target.appendChild(node);
    } else if (signal.kind === 'familiarity') {
      const value = signal.value && typeof signal.value === 'object' ? signal.value : { status: 'AVAILABLE', lower_bound_pct: signal.value };
      let copy = '';
      if ((value.status === 'AVAILABLE' || value.status === 'AVAILABLE_LIMITED') && Number.isFinite(Number(value.lower_bound_pct))) {
        copy = Number(value.uncertainty_pp) > 0
          ? tt('room.compass.recordedFamiliarLowerBound', 'Не менее {value}% знакомы').replace('{value}', String(Math.round(Number(value.lower_bound_pct))))
          : Math.round(Number(value.lower_bound_pct)) + '% ' + tt('room.compass.recordedFamiliar', 'знакомы');
      } else if (value.status === 'NEEDS_PROFILE') copy = tt('room.compass.needsProfile', 'Нужен профиль слов');
      else if (value.status === 'NOT_PREPARED') copy = value.action_label || tt('room.compass.notPrepared', 'Анализ не подготовлен');
      else if (value.status === 'PENDING') copy = tt('room.compass.preparing', 'Анализ готовится');
      else if (value.status === 'STALE') copy = tt('room.compass.stale', 'Нужно обновить анализ');
      else if (value.status === 'UNSUPPORTED') copy = tt('room.compass.unsupported', 'Анализ недоступен');
      else copy = tt('room.compass.unavailable', 'Оценка недоступна');
      const node = el('span', { class: 'learning-signal learning-familiar coverage-badge coverage-' + String(value.status || 'unavailable').toLowerCase(), text: copy });
      target.appendChild(node);
    } else if (signal.kind === 'reading-time') {
      const value = signal.value || {};
      // Before calibration this repeated card-level chip crowds out the more
      // important familiarity fact on a phone. Keep the exact state in the
      // accessible details; show a card chip only when a real range exists.
      if (value.status === 'AVAILABLE') target.appendChild(el('span', { class: 'learning-signal learning-reading-time', text: learningReadingTimeCopy(value) }));
    }
  }
  if (state.state === 'reading' && state.resumeLabel) target.appendChild(el('span', { class: 'learner-state-chip is-reading', text: state.resumeLabel }));
  else if (state.state === 'finished') target.appendChild(el('span', { class: 'learner-state-chip is-finished', text: state.resumeLabel || tt('room.groupCorpus.finished', 'Прочитано') }));
  let mediaDetailLabel = '';
  if (opts.showMedia) {
    if (item.media && item.media.videoAvailable) {
      target.appendChild(el('span', { class: 'learning-media media-video', text: '🎬 ' + tt('room.compass.video', 'Видео') }));
    }
    const mediaLabel = learningMediaLabel(item.media);
    mediaDetailLabel = mediaLabel;
    if (mediaLabel) target.appendChild(el('span', { class: 'learning-media media-' + ((item.media && item.media.coverage) || 'present'), text: mediaLabel }));
  }
  if (opts.showTags) for (const tag of (item.tags || []).slice(0, 1)) target.appendChild(el('span', { class: 'learning-tag', text: '#' + tag }));
  for (const caveat of (readiness.caveats || []).slice(0, 1)) target.appendChild(el('span', { class: 'learning-caveat diff-archaica', text: caveat }));
  const detailLines = [readiness.reason].concat(readiness.caveats || [], item.provenanceSummary || []).filter(Boolean);
  if (mediaDetailLabel) detailLines.push(mediaDetailLabel);
  for (const signal of (item.signals || [])) {
    const provenance = signal.provenance || { type: 'unknown' };
    if (signal.kind === 'familiarity' && signal.value && signal.value.counts) {
      const c = signal.value.counts;
      detailLines.push(tt('room.compass.auditMeaning', '{pct}% — нижняя граница по вхождениям слов, а не оценка понимания.')
        .replace('{pct}', String(Math.round(Number(signal.value.lower_bound_pct) || 0))));
      detailLines.push(tt('room.compass.auditCounts', 'Знакомые вхождения: {f} из {d}; новые: {n}; без отметки: {u}; неоднозначные: {x}; исключены: {e}')
        .replace('{f}', String(c.familiar)).replace('{d}', String(c.eligible_denominator))
        .replace('{n}', String(c.explicit_new)).replace('{u}', String(c.untracked)).replace('{x}', String(c.unresolved))
        .replace('{e}', String((Number(c.ignored_excluded) || 0) + (Number(c.proper_names_excluded) || 0))));
    }
    if (signal.kind === 'level' && signal.value != null) {
      detailLines.push(learningSignalKindLabel('level') + ': ' + String(signal.value));
    }
    if (signal.kind === 'reading-time') detailLines.push(learningReadingTimeCopy(signal.value));
    detailLines.push(tt('room.compass.provenanceLine', '{kind}: {type} · {source}')
      .replace('{kind}', learningSignalKindLabel(signal.kind)).replace('{type}', learningProvenanceTypeLabel(provenance.type))
      .replace('{source}', String(provenance.source || tt('room.compass.sourceUnknown', 'источник не указан'))));
    for (const detailLabel of (signal.detail_labels || [])) if (detailLabel) detailLines.push(String(detailLabel));
  }
  if (opts.showDetails !== false && detailLines.length) {
    const details = wireDismissibleDetails(el('details', { class: 'learning-compass-details' }));
    details.appendChild(el('summary', { attrs: { 'aria-label': tt('room.compass.details', 'Почему подходит и откуда данные') }, text: 'ⓘ' }));
    const panel = el('div', { class: 'learning-compass-panel' });
    const seen = new Set();
    for (const line of detailLines) if (!seen.has(String(line))) { seen.add(String(line)); panel.appendChild(el('p', { text: String(line) })); }
    const ledger = readCalibrationLedger();
    if (ledger && Array.isArray(ledger.samples) && ledger.samples.length) {
      const reset = el('button', { class: 'learning-calibration-reset', attrs: { type: 'button' }, text: tt('room.compass.resetCalibration', 'Сбросить моё время чтения') });
      reset.addEventListener('click', (event) => { event.preventDefault(); resetLearningCalibration(); });
      panel.appendChild(reset);
    }
    panel.appendChild(learningCalibrationToggle());
    details.appendChild(panel); target.appendChild(details);
  }
  target.hidden = !target.children.length;
}

function showState(i18nKey, icon) {
  const main = $('roomContent');
  if (!main) return;
  main.innerHTML = '';
  main.appendChild(stateBoxNode(i18nKey, icon));
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
  const titleEl = markRoomTextLanguage(el('bdi', { class: 'work-card-title', text: title }), title);
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
// PC-4 — display-clean: peel ONLY a TRAILING editorial variant-note bracket containing «נוסח» (e.g.
// «… [נוסח 'שירים']») off the headline into {title, note}; the note becomes a muted sub-line (preserved,
// never discarded — it can disambiguate). Conservative / do-no-harm (R6): does NOT touch disambiguator
// brackets, whole-string incipits «[…]», trailing «…» incipits, or gershayim «"». Whole-title incipits
// and disambiguator-as-subline are a producer-side follow-up; this client pass fixes the «[נוסח …]» leak.
function corpusTitleParts(raw) {
  const s = String(raw || '');
  const m = s.match(/^([\s\S]*?\S)\s*([\[(][^\])]*נוסח[^\])]*[\])])\s*$/);
  if (m) return { title: m[1], note: m[2] };
  return { title: s, note: '' };
}
function renderCorpusCard(card) {
  if (!card) {
    const dead = el('div', { class: 'work-card', attrs: { 'aria-disabled': 'true' } });
    dead.setAttribute('disabled', '');
    dead.appendChild(el('span', { class: 'work-card-title', text: '—' }));
    dead.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.unavailable', text: tt('room.work.unavailable') }));
    return dead;
  }
  const node = el('article', { class: 'work-card', attrs: { 'data-work-id': String(card.id == null ? '' : card.id), 'data-continuity-key': continuityKey('benyehuda', card.id) } });
  const openLink = el('a', { class: 'work-card-open', attrs: { href: deepLinkForCorpusWork(card.id), 'data-continuity-action': 'open' } });
  const parts = corpusTitleParts(card.title);
  const titleEl = el('span', { class: 'work-card-title', text: parts.title });
  if (card.title) titleEl.title = card.title;   // PC-4 — full original (incl. the variant note) on hover/long-press
  if (HEBREW_RE.test(parts.title)) titleEl.setAttribute('dir', 'rtl');
  openLink.appendChild(titleEl);
  if (parts.note) {   // PC-4 — the «[נוסח …]» editorial variant note → muted sub-line (preserved, не выброшено)
    const n = el('span', { class: 'work-card-note', text: parts.note });
    if (HEBREW_RE.test(parts.note)) n.setAttribute('dir', 'rtl');
    openLink.appendChild(n);
  }
  node.appendChild(openLink);
  if (card.author) {
    // PC-9 — tappable author drill «ещё у автора» (mirrors the search-row pattern); stopPropagation so it
    // never opens the work; keyboard-operable. Consistent rail-card ↔ search-row behaviour.
    const a = el('button', { class: 'work-card-author corpus-work-author-link', attrs: { type: 'button', title: tt('room.corpus.search.moreByAuthor', 'Ещё у автора') } });
    a.textContent = card.author;
    if (HEBREW_RE.test(card.author)) a.setAttribute('dir', 'rtl');
    const goAuthor = (ev) => { ev.preventDefault(); corpusNavToAuthor(card.era, card.author); };
    a.addEventListener('click', goAuthor);
    node.appendChild(a);
  }
  const RS_KNOWN = { machine: 1, machine_assisted: 1, human_proofread: 1 };
  const AU_KNOWN = { none: 1, tts: 1, human: 1 };
  // PC-2 — de-noise: the whole ready/cold-start rail is review_status='machine' + audio_status='none', so
  // a per-card «Машинный перевод»/«Без озвучки» pill is constant noise (the machine-translation provenance
  // is stated once in the rail intro, PC-6). Show the rs pill ONLY when it DIFFERS from the machine default;
  // show the audio pill ONLY when audio actually EXISTS (positive affordance, never «Без озвучки» on every card).
  const meta = el('div', { class: 'work-card-meta' });
  const len = corpusLengthLabel(card);   // PC-11 — neutral «сколько» length caption (distinct from the learning cluster)
  if (len) meta.appendChild(el('span', { class: 'work-card-len', text: len }));
  const rs = String(card.review_status || 'machine');
  if (rs !== 'machine') {
    const rsOpts = { class: 'prov-badge rs-' + rs, text: RS_KNOWN[rs] ? tt('room.prov.rs.' + rs) : rs };
    if (RS_KNOWN[rs]) rsOpts.i18n = 'room.prov.rs.' + rs;
    meta.appendChild(el('span', rsOpts));
  }
  const au = String(card.audio_status || 'none');
  if (au === 'tts' || au === 'human') {
    meta.appendChild(el('span', { class: 'prov-badge audio-' + au, i18n: 'room.prov.audio.' + au, text: tt('room.prov.audio.' + au) }));
  }
  if (meta.children.length) node.appendChild(meta);   // never mount an empty provenance row
  // PC-5 — reserve the LEARNING row EAGERLY (empty, with a CSS min-height) so the lazy difficulty/coverage
  // append FILLS it instead of GROWING the card after first paint (no layout-shift / rail re-inflation).
  node.appendChild(el('div', { class: 'work-card-difficulty' }));
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.work.open', text: tt('room.work.open') }));
  const open = () => openCorpusWork(card);
  openLink.addEventListener('click', (event) => { event.preventDefault(); open(); });
  // Compatibility for legacy programmatic row clicks; the user-facing control is the real link.
  node.addEventListener('click', (event) => { if (event.target === node) open(); });
  observeCardCoverage(node, card);   // S3: lazy coverage badge (visible cards only — profile-gated, soft estimate)
  return node;
}

function renderTrack() {
  const main = $('roomContent');
  if (!main) return;
  // A3 — the Корпус track is a Период→Автор→Работа drill, not a shelf stack.
  if (activeTrack === 'corpus') return renderCorpus();
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
  return renderTrack();
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
// ── Учебный режим: ширины колонок Зала (спека 2026-08-05) ────────────────────
// Хранятся ОТДЕЛЬНО от Студии (её ключ ttsDashboard_table_settings_v1 не трогаем):
// поверхности разные, и учебная раскладка не должна утаскивать за собой Студию.
// Массив позиционно выровнен к TABLE_COL_ORDER = [action, he, niqqud, translit, ru].
const ROOM_WIDTHS_KEY = 'room.table.widths.v1';
const ROOM_WIDTHS_DEFAULT = [15, 20, 20, 21, 24];
let roomTableWidths = ROOM_WIDTHS_DEFAULT.slice();
function loadRoomTableWidths() {
  try {
    const raw = localStorage.getItem(ROOM_WIDTHS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.baseWidths) || parsed.baseWidths.length !== 5) return;
    const nums = parsed.baseWidths.map((n) => Number(n));
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return;
    roomTableWidths = nums;
  } catch (_) {}
}
function saveRoomTableWidths() {
  try { localStorage.setItem(ROOM_WIDTHS_KEY, JSON.stringify({ baseWidths: roomTableWidths })); } catch (_) {}
}
function roomResetColWidths() {
  roomTableWidths = ROOM_WIDTHS_DEFAULT.slice();
  saveRoomTableWidths();
  roomPaintColWidths();
}

// ── Учебный режим (спека 2026-08-05) ─────────────────────────────────────────
// Включается ТОЛЬКО вручную из панели «Аа» (решение владельца D5) — никакого
// автовключения для медиа-материалов. Класс body.room-study живёт лишь пока открыт
// ридер: он прячет шапку и футер, а на домашнем экране это было бы тупиком.
const STUDY_MODE_KEY = 'room.studyMode';
const ACTION_COL_KEY = 'room.actionColMode';
const ACTION_COL_MODES = ['full', 'rail', 'hidden'];
function studyModeOn() { try { return localStorage.getItem(STUDY_MODE_KEY) === '1'; } catch (_) { return false; } }
function actionColMode() {
  try {
    const v = localStorage.getItem(ACTION_COL_KEY);
    return ACTION_COL_MODES.indexOf(v) >= 0 ? v : 'rail';   // D4 — дефолт «Рельс»
  } catch (_) { return 'rail'; }
}
function actionColModeSet(mode) {
  const m = ACTION_COL_MODES.indexOf(mode) >= 0 ? mode : 'rail';
  try { localStorage.setItem(ACTION_COL_KEY, m); } catch (_) {}
  applyStudyModeClass();
  rerenderReader();          // 'hidden' меняет НАБОР колонок → нужна пересборка таблицы
}
function studyModeSet(on) {
  try { localStorage.setItem(STUDY_MODE_KEY, on ? '1' : '0'); } catch (_) {}
  // первое включение фиксирует дефолтный «Рельс», чтобы состояние было явным
  try { if (on && !localStorage.getItem(ACTION_COL_KEY)) localStorage.setItem(ACTION_COL_KEY, 'rail'); } catch (_) {}
  applyStudyModeClass();
  rerenderReader();
}
function applyStudyModeClass() {
  const readerOpen = !!($('roomReader') && !$('roomReader').hidden);
  const on = readerOpen && studyModeOn();
  document.body.classList.toggle('room-study', on);
  document.body.classList.toggle('study-rail', on && actionColMode() === 'rail');
  // Окно таблицы становится собственным скроллером и БЕЗ медиа (обычное чтение тоже
  // должно занимать экран), поэтому раскладку пересобираем на каждое переключение.
  try { roomMediaApplyLayout(); } catch (_) {}
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
// button) and RESTORE it to the trigger on close. The study sheet additionally owns a bounded
// focus trap while open; the morphology card manages its own lifecycle (reader-morph).
let _roomFocusReturn = null, _roomFocusReturnId = '', _roomFocusReturnKey = '';
function roomFocusInto(container) {
  try {
    _roomFocusReturn = document.activeElement;
    _roomFocusReturnId = (_roomFocusReturn && _roomFocusReturn.id) || '';
    _roomFocusReturnKey = (_roomFocusReturn && _roomFocusReturn.getAttribute && _roomFocusReturn.getAttribute('data-focus-key')) || '';
  } catch (_) { _roomFocusReturn = null; _roomFocusReturnId = ''; _roomFocusReturnKey = ''; }
  if (!container) return;
  const f = container.querySelector('button, [tabindex="0"], input, select, a[href]') || container;
  try { if (f && f.focus) f.focus(); } catch (_) {}
}
function roomFocusRestore() {
  let target = _roomFocusReturn;
  // B2 Learning Home can be rebuilt by a live locale switch while the modal is open.
  // Restore to the equivalent fresh trigger, not to a detached button (which drops focus to body).
  try {
    if (!target || !target.isConnected) {
      if (_roomFocusReturnKey) target = document.querySelector('[data-focus-key="' + _roomFocusReturnKey + '"]');
      if ((!target || !target.isConnected) && _roomFocusReturnId) target = document.getElementById(_roomFocusReturnId);
    }
    if (target && target.focus) target.focus();
  } catch (_) {}
  _roomFocusReturn = null; _roomFocusReturnId = ''; _roomFocusReturnKey = '';
}
function roomFocusTrap(e, container) {
  if (!e || e.key !== 'Tab' || !container) return;
  const nodes = Array.from(container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'))
    .filter((n) => !n.hidden && n.getAttribute('aria-hidden') !== 'true' && n.getClientRects().length);
  if (!nodes.length) { e.preventDefault(); try { container.focus(); } catch (_) {} return; }
  const first = nodes[0], last = nodes[nodes.length - 1], active = document.activeElement;
  if (e.shiftKey && (active === first || !container.contains(active))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}
let readerRows = [];
let readerAudio = null; // attachRowAudio detach handle
let readerMorph = null; // ReaderMorph attach detach handle
let readerTextId = null; // BRR-P2-002 — local OPFS id of the open text (for progress)
let readerTextTitle = ''; // BRR-P2-003 — title + key of the open text (denormalised into bookmarks)
let readerTextKey = null;
let readerIsOwnText = false; // CLG-P6.2 — личный explain-путь (двойной consent)
let readerCorpusWorkId = null;      // PAS-A1 — byehuda_id открытой корпусной работы (null для личных; сброс в closeReader)
let readerCorpusExplainOk = false;  // PAS-A1 — HEAD-probe: works-файл опубликован на сервере (26/57 canon — нет)
let _bookmarkSet = null;  // Set of bookmarked sentence_ids in the current text
let readerReturnRoute = null;       // LB1: exact anchor drill-down must return to the active lesson, not strand on shelves
let readerReturnContext = null;     // B5: ephemeral catalog place (nav + scroll + focus), never learner truth
let readerOpenEpoch = 0;            // B5: invalidates late import/open completions after Back

function continuityKey(scope, id) {
  return String(scope || 'room') + ':' + String(id == null ? '' : id);
}

// B5 — capture the exact place that launched Reader. This lives only for the current
// in-page Reader session: filters remain owned by their existing view-state objects and
// progress remains owned by LocalDb. Opening a handoff text from inside Reader deliberately
// keeps the original catalog context instead of replacing it with an end-card control.
function captureReaderReturnContext() {
  if (readerReturnContext) return readerReturnContext;
  let active = null, identity = null, focusKey = '', focusAction = '', disclosures = [];
  try {
    active = document.activeElement;
    identity = active && active.closest ? active.closest('[data-continuity-key]') : null;
    const keyed = active && active.closest ? active.closest('[data-focus-key]') : null;
    focusKey = keyed ? String(keyed.getAttribute('data-focus-key') || '') : '';
    focusAction = active && active.getAttribute ? String(active.getAttribute('data-continuity-action') || '') : '';
    const content = $('roomContent');
    disclosures = content ? Array.from(content.querySelectorAll('details[id]')).map((node) => ({ id: node.id, open: !!node.open })) : [];
  } catch (_) {}
  readerReturnContext = {
    nav: { corpus: corpusNav.corpus, level: corpusNav.level, era: corpusNav.era, author: corpusNav.author },
    scrollX: Math.max(0, Number(window.scrollX || window.pageXOffset) || 0),
    scrollY: Math.max(0, Number(window.scrollY || window.pageYOffset) || 0),
    anchorTop: identity ? Number(identity.getBoundingClientRect().top) : null,
    continuityKey: identity ? String(identity.getAttribute('data-continuity-key') || '') : '',
    focusAction,
    focusKey,
    disclosures,
  };
  return readerReturnContext;
}

function readerReturnNode(attribute, value) {
  if (!value) return null;
  try {
    return Array.from(document.querySelectorAll('[' + attribute + ']'))
      .find((node) => String(node.getAttribute(attribute) || '') === String(value)) || null;
  } catch (_) { return null; }
}

async function restoreReaderReturnContext(context) {
  if (!context) return;
  await new Promise((resolve) => {
    let done = false, layoutQueued = false;
    const startedAt = Date.now();
    const restore = () => {
      if (done) return;
      for (const disclosure of (context.disclosures || [])) {
        try { const node = document.getElementById(disclosure.id); if (node && node.tagName === 'DETAILS') node.open = !!disclosure.open; } catch (_) {}
      }
      const identity = readerReturnNode('data-continuity-key', context.continuityKey);
      // Ben-Yehuda's filtered body is populated by a guarded async sub-render. Wait for
      // the stable identity instead of restoring focus to a fallback one frame too early.
      if (context.continuityKey && !identity && Date.now() - startedAt < 1500) {
        setTimeout(restore, 40);
        return;
      }
      if (identity && !layoutQueued) {
        layoutQueued = true;
        try { requestAnimationFrame(() => requestAnimationFrame(restore)); } catch (_) { setTimeout(restore, 0); }
        return;
      }
      done = true;
      let target = null;
      if (identity && context.focusAction) {
        try {
          target = Array.from(identity.querySelectorAll('[data-continuity-action]'))
            .find((node) => String(node.getAttribute('data-continuity-action') || '') === String(context.focusAction)) || null;
        } catch (_) { target = null; }
      }
      if (!target && identity) target = identity.matches('a,button,[tabindex]') ? identity : identity.querySelector('a[href],button,[tabindex="0"]');
      if (!target) target = readerReturnNode('data-focus-key', context.focusKey);
      if (!target) target = document.querySelector('.corpus-next-cta, .learning-home-primary, .corpus-back, [role="tab"][aria-selected="true"]');
      let returnY = Number(context.scrollY) || 0;
      if (identity && Number.isFinite(Number(context.anchorTop))) {
        try { returnY = Math.max(0, (Number(window.scrollY || window.pageYOffset) || 0) + identity.getBoundingClientRect().top - Number(context.anchorTop)); } catch (_) {}
      }
      try { window.scrollTo({ top: returnY, left: Number(context.scrollX) || 0, behavior: 'auto' }); } catch (_) { try { window.scrollTo(Number(context.scrollX) || 0, returnY); } catch (_) {} }
      try { if (target && target.focus) target.focus({ preventScroll: true }); } catch (_) { try { if (target && target.focus) target.focus(); } catch (_) {} }
      resolve();
    };
    setTimeout(restore, 0);
  });
}

function setReaderReturnRoute(route) {
  readerReturnRoute = route || null;
  const back = $('readerBack'); if (!back) return;
  const key = readerReturnRoute === 'lesson-builder' ? 'room.lesson.backToLesson' : 'room.reader.back';
  back.setAttribute('data-i18n', key);
  back.textContent = readerReturnRoute === 'lesson-builder'
    ? tt(key, '← К уроку') : tt(key, '← Полки');
}

// BYOK GCP TTS key — same localStorage slot index.html uses (v3.gcpTtsApiKey).
// Empty is fine: audio falls back to keyless browser SpeechSynthesis.
function gcpTtsKey() { try { return localStorage.getItem('v3.gcpTtsApiKey') || ''; } catch (_) { return ''; } }

// ── MorphHost — ОБЩИЙ хост памяти слова (Зал+Студия, одна реализация, форк запрещён) ──
// Канон метки/оценки/заметок/consent/кэша статусов переехал в /js/morph-host.js;
// здесь остаются тонкие делегаты с прежними именами. env-замыкания читают
// поверхностные зависимости ЛЕНИВО (на вызове), поэтому объявление сверху безопасно.
const morphHost = window.MorphHost.createHost({
  ldb: async () => localDb,
  getTextKey: async () => readerTextKey || null,
  toast: (m) => roomToast(m),
  onProfileChanged: () => {
    // объединённый хук поверхности: исходные пути имели подмножества этих действий
    // (save: invalidateReadableSet+applyDecorations; grade: _asdCache+applyDecorations+
    // refreshDueBadge; mark-обёртка добавляла своё) — объединение корректно, лишние
    // инвалидации только к ленивым пересчётам
    _asdCache = null;
    _compassProjection = null; _compassProjectionLoading = null; _compassPage.clear();
    _groupLearningIndexes.clear(); _benFamiliarityScores = null; _benFamiliarityLoading = null;
    try { invalidateReadableSet(); } catch (_) {}
    try { applyDecorations(); } catch (_) {}
    try { refreshDueBadge(); } catch (_) {}
  },
  getTtsKey: () => gcpTtsKey(),
  dayStr: () => _localDayStr(),
  getDueNowCount: () => (_dueCounts && _dueCounts.dueNow) || 0,
  getContextOverlay: () => _ctxOverlay,
  applyI18n: () => { try { window.applyI18n && window.applyI18n(); } catch (_) {} },
});

// Epic-3a — pronounce a single Hebrew word (card headword). BYOK GCP TTS (WaveNet quality) when
// a key is set, else keyless browser SpeechSynthesis. Self-contained (no row timing/caching),
// offline-safe (any GCP failure falls back to browser — no dead-end). Same /api/tts contract as rows.
// Тело переехало в morph-host.js (аудио-синглтон живёт там же — один <audio> на поверхность).
async function speakWord(text) { return morphHost.speakWord(text); }
// D6/D2 — play a cloze SENTENCE's audio for the «🎧 Аудио» channel from the built item (source-agnostic:
// open-text rows AND cross-text due items both carry built.audioAssetKey). tier-1 baked/cached asset
// (keyless /api/audio/<assetKey>, the always-available canon path) → else speakWord the sentence text
// (BYOK GCP → browser voice). Reuses the morph-host audio singleton; reader-core (parity-locked) untouched.
async function _playSentenceAudio(built) {
  if (!built) return;
  const ak = String(built.audioAssetKey || '').trim();
  if (ak) {
    try {
      const h = await fetch('/api/audio/' + encodeURIComponent(ak), { method: 'HEAD' });
      if (h && h.ok) {
        await morphHost.playUrl('/api/audio/' + encodeURIComponent(ak)); return;
      }
    } catch (_) {}
  }
  // fallback — TTS the sentence text (needs a key or a browser Hebrew voice; gated by availableChannels)
  try { speakWord(String(built.sentence || '')); } catch (_) {}
}
// D6 — stop any in-flight word/row audio (so switching channel or advancing never overlaps playback).
function _stopTrainAudio() { morphHost.stopAudio(); }
// D6 — training extraction CHANNEL (device-local view pref, like the streak off-switch). 'read' default.
function trainChannel() { try { return localStorage.getItem('room.trainChannel') || 'read'; } catch (_) { return 'read'; } }
function trainChannelSet(c) { try { localStorage.setItem('room.trainChannel', c); } catch (_) {} }
// D6 — does the browser expose a Hebrew (he/iw) speech-synthesis voice? (getVoices can be empty until
// 'voiceschanged'; we probe best-effort — a BYOK GCP key is the reliable path, this is the keyless one.)
function _heVoiceAvailable() {
  try { return !!(window.speechSynthesis && (window.speechSynthesis.getVoices() || []).some((v) => /^(he|iw)/i.test(v.lang || ''))); } catch (_) { return false; }
}
// D6 — audio capabilities for availableChannels(): a BYOK key, a browser Hebrew voice, and whether EVERY
// session item's cloze row carries a baked/cached asset → «🎧 Аудио» plays keyless for ALL of them. We
// require ALL rows baked (not «any row»): under partial baking with NO key/voice, an un-baked item would
// fall to a silent browser-TTS — so listen is only offered when all-baked OR a key/voice covers the gap (R10).
function _trainAudioCaps(items) {
  let bakedAll = false;
  try {
    const list = items || [];
    bakedAll = list.length > 0 && list.every((it) => !!(it && it._built && it._built.audioAssetKey));
  } catch (_) {}
  return { hasGcpKey: !!gcpTtsKey(), hasHeVoice: _heVoiceAvailable(), rowHasBakedAudio: bakedAll };
}
// Warm the speech-synthesis voice list early (getVoices() is often empty until 'voiceschanged') so the
// keyless he-voice probe is reliable by the time training opens. Best-effort; a BYOK key is the sure path.
try { if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.getVoices(); } catch (_) {}

// BRR-P1-009 — word-status colouring (opt-in). Кэш statuses живёт в morphHost
// (single-flight, референс-стабильный) — здесь только делегаты с прежними именами.
function wordStatusEnabled() { try { return localStorage.getItem('room.wordStatus') === '1'; } catch (_) { return false; } }
function wordStatusSet(v) { try { localStorage.setItem('room.wordStatus', v ? '1' : '0'); } catch (_) {} }
// Tier-3 «точный режим» — consent-состояние/диалог/провайдеры в morphHost (ОБЩИЕ
// localStorage-ключи room.contextConsent/room.contextMode на обеих поверхностях).
const contextConsent = () => morphHost.contextConsent();
const contextConsentSet = (v) => morphHost.contextConsentSet(v);
// Context-overlay (strategic #1, recon §3.3/§10): the open work's BAKED context sidecar.
// Set on work open (loadContextOverlay), reset on every open — never leaks across works.
let _ctxOverlay = null;
function setContextOverlay(ov) { _ctxOverlay = (ov && typeof ov === 'object') ? ov : null; }
// Провайдеры Tier-3 / refine / consent-диалог / single-flight кэш статусов — morphHost.
const makeContextProvider = () => morphHost.makeContextProvider();
const promptContextConsent = () => morphHost.promptContextConsent();
const canRefine = () => morphHost.canRefine();
const makeRefineProvider = () => morphHost.makeRefineProvider();
const ensureWordStates = () => morphHost.ensureWordStates();
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
  // Retention P5 (recon §6.1) — the quiet due-marker set: schedule → due-now keys (ignore
  // excluded), keyed by the SAME statusKeyForCard bytes the paint uses. Rides the status-axis
  // toggle: markers (and the recall tap, via getDueSchedule) exist only when the axis is visible.
  let dueSet = null;
  if (color && typeof window.ReaderMorph.dueSetFromSchedule === 'function') {
    try { dueSet = window.ReaderMorph.dueSetFromSchedule((await localDb.getSrsSchedule()) || {}, states || {}, Date.now()); } catch (_) { dueSet = null; }
  }
  try { await window.ReaderMorph.decorateWords(mount, states, { color, fadeMode, dueSet }); } catch (_) {}
  // suppressed-marker tally → per-day MAX (repaints of the same text must not inflate it); the
  // P6 retention-report reads this as the «lost recall opportunities» floor (recon §6.1/§7).
  try {
    if (dueSet && typeof window.ReaderMorph.dueMarkStats === 'function') {
      const st = window.ReaderMorph.dueMarkStats();
      const day = _localDayStr();
      const prev = JSON.parse(localStorage.getItem('room.dueMarker.day') || '{}');
      const rec = (prev && prev.day === day) ? prev : { day, marked: 0, suppressed: 0 };
      rec.marked = Math.max(Number(rec.marked) || 0, st.marked);
      rec.suppressed = Math.max(Number(rec.suppressed) || 0, st.suppressed);
      localStorage.setItem('room.dueMarker.day', JSON.stringify(rec));
    }
  } catch (_) {}
  try { refreshCovChip(); } catch (_) {}   // W4 — keep the in-reader coverage chip in sync on open / status / config change
}

// B7 — in-reader Learning Compass chip. The already-running local Worker supplies content-free
// ingredients for every source; the same shared core used on cards and by Agent Access supplies
// exact counts. No comprehension band, fixed WPM, or empty-profile zero is inferred here.
function _covChipMount() {
  const reader = $('roomReader'); if (!reader) return null;
  const bar = reader.querySelector('.reader-bar'); if (!bar) return null;
  let chip = $('readerCovChip');
  if (!chip) {
    chip = el('button', { class: 'reader-cov-chip', attrs: { type: 'button' } });
    chip.id = 'readerCovChip'; chip.hidden = true;
    chip.title = tt('room.corpus.cov.chipAria', 'Зафиксированные знакомые слова — открыть «Учить»');
    chip.addEventListener('click', () => { try { roomOpenStudyList(); } catch (_) {} });
    bar.appendChild(chip);   // last child → wraps to its own full-width row (flex-basis:100%)
  }
  return chip;
}
function clearCovChip() { const c = $('readerCovChip'); if (c) { c.hidden = true; try { roomUpdateTheadTop(); } catch (_) {} } }
let _covChipBusy = false, _covChipDirty = false, _covChipCache = null;
async function refreshCovChip() {
  const tid = readerTextId; if (tid == null) return;
  if (_covChipBusy) { _covChipDirty = true; return; }   // coalesce: re-run once after the in-flight pass (no missed refresh)
  _covChipBusy = true;
  try {
    const session = _readingCalibrationSession;
    if (!session || String(session.text_id) !== String(tid) || !learningCompass) return;
    const [ingredients, projection] = await Promise.all([session.ingredients_promise, ensureLearningCompassProjection()]);
    if (readerTextId !== tid) return;
    const fit = learningCompass.evaluateRecordedFamiliarityV2({ ingredients, learner_projection: projection });
    _covChipCache = { tid, fit };
    const chip = _covChipMount(); if (!chip) return;
    chip.className = 'reader-cov-chip cov-' + String(fit.status || 'unavailable').toLowerCase();
    chip.textContent = '';
    const lead = el('span', { class: 'cov-chip-pct' });
    if (fit.status === 'AVAILABLE' || fit.status === 'AVAILABLE_LIMITED') {
      lead.textContent = '📖 ' + (Number(fit.unresolved_uncertainty_pp) > 0
        ? tt('room.compass.recordedFamiliarLowerBound', 'Не менее {value}% знакомы').replace('{value}', String(Math.round(Number(fit.recorded_familiar_pct_lower_bound))))
        : Math.round(Number(fit.recorded_familiar_pct_lower_bound)) + '% ' + tt('room.compass.recordedFamiliar', 'знакомы'));
    } else if (fit.status === 'NEEDS_PROFILE') lead.textContent = '📖 ' + tt('room.compass.needsProfile', 'Нужен профиль слов');
    else lead.textContent = '📖 ' + tt('room.compass.unavailable', 'Оценка недоступна');
    chip.appendChild(lead);
    if (fit.counts) chip.appendChild(el('span', { class: 'cov-chip-new', text: ' · ' + fit.counts.familiar + '/' + fit.counts.eligible_denominator }));
    chip.hidden = false;
    try { roomUpdateTheadTop(); } catch (_) {}
  } catch (_) {
    if (readerTextId === tid) {
      const chip = _covChipMount();
      if (chip) {
        chip.className = 'reader-cov-chip cov-unavailable';
        chip.textContent = '📖 ' + tt('room.compass.unavailable', 'Оценка недоступна');
        chip.hidden = false;
        try { roomUpdateTheadTop(); } catch (_) {}
      }
    }
  } finally {
    _covChipBusy = false;
    if (_covChipDirty) { _covChipDirty = false; try { refreshCovChip(); } catch (_) {} }   // run the coalesced request
  }
}

// ── PAS-D2b Scaffold-советник (обобщение BRR Epic 5 W5) — «леса сходят ТОЛЬКО по предложению» ──
// Решение «что предлагать» — pure-модуль public/js/scaffold-advisor.js (node-гейт):
//   N (W5, гейт fadeGraduationReady НЕ менялся): огласовка full→adaptive;
//   R (новое): перевод show→reveal — corpus-текст в зоне in/easy БЕЗ loadFlag (второй канал
//     честности: текстам с именами/архаикой «читать по-иврит-ски» не предлагаем).
// Механика: не-модальный бар (1 предложение за сессию чтения, приоритет N>R внутри advise),
// [Попробовать] → применить + undo-toast 10с (undo восстанавливает cfg, offered-ключ НЕ снимает —
// не переспрашиваем), [✕] → dismissed-ключ. НИКОГДА auto-flip (R5); гейт уверенности N не
// ослаблен (R9/R11). agent_ux feature=scaffold_advisor.
function clearFadeGradNudge() { const b = $('readerFadeGrad'); if (b && b.remove) b.remove(); }
async function maybeOfferScaffoldAdvice() {
  try {
    if (!window.ScaffoldAdvisor) return;
    const tid = readerTextId;
    // входы правила N (дорогая часть — только когда мод full и ключ не стоит)
    let fadeReady = false;
    if (readerCfg.niqqudMode === 'full' && localStorage.getItem('room.fadeGradOffered') !== '1'
        && window.ReaderMorph && typeof window.ReaderMorph.fadeGraduationReady === 'function') {
      const states = (await ensureWordStates()) || {};
      if (readerTextId !== tid) return;                              // navigated away while loading
      fadeReady = !!window.ReaderMorph.fadeGraduationReady(states);
    }
    const advice = window.ScaffoldAdvisor.advise({
      niqqudMode: readerCfg.niqqudMode, ruMode: readerCfg.ruMode,
      fadeReady,
      fadeGradOffered: localStorage.getItem('room.fadeGradOffered') === '1',
      // B7: recorded familiarity is not a promise of comprehension, so it cannot auto-qualify
      // the translation-removal recommendation. The niqqud rule keeps its independent evidence.
      ruRevealOffered: true,
      coverage: null,
    });
    if (advice) showScaffoldAdviceBar(advice.rule);
  } catch (_) {}
}
function showScaffoldAdviceBar(rule) {
  const reader = $('roomReader'); if (!reader || $('readerFadeGrad')) return;
  const isN = rule === 'N';
  const offeredKey = isN ? 'room.fadeGradOffered' : 'room.ruRevealOffered';
  const bar = el('div', { class: 'reader-fadegrad' }); bar.id = 'readerFadeGrad';
  const msg = isN
    ? { i18n: 'room.reader.fadeGrad.msg', fb: '🎯 Ты уже знаешь много слов — убрать огласовку со знакомых?' }
    : { i18n: 'room.reader.advisor.ruMsg', fb: '📖 Этот текст тебе по силам — скрывать перевод до тапа? Действует во всех текстах; вернуть можно в ⚙ или кнопкой «Вернуть».' };
  bar.appendChild(el('span', { class: 'reader-fadegrad-msg', i18n: msg.i18n, text: tt(msg.i18n, msg.fb) }));
  const actions = el('div', { class: 'reader-fadegrad-actions' });
  const dismiss = (emit) => {
    try { localStorage.setItem(offeredKey, '1'); } catch (_) {}
    if (emit !== false) { try { agentUx('scaffold_advisor', 'dismissed'); } catch (_) {} }
    clearFadeGradNudge();
  };
  const go = el('button', {
    class: 'reader-fadegrad-go',
    i18n: isN ? 'room.reader.fadeGrad.on' : 'room.reader.advisor.try',
    text: isN ? tt('room.reader.fadeGrad.on', 'Включить') : tt('room.reader.advisor.try', 'Попробовать'),
  });
  go.type = 'button';
  go.addEventListener('click', () => {
    const prev = isN ? readerCfg.niqqudMode : readerCfg.ruMode;
    if (isN) readerCfg.niqqudMode = 'adaptive'; else readerCfg.ruMode = 'reveal';
    try { saveReaderCfg(); } catch (_) {}
    try { rerenderReader(); } catch (_) { try { applyDecorations(); } catch (_) {} }
    try { agentUx('scaffold_advisor', 'accepted'); } catch (_) {}
    // undo-toast 10с: возврат прежнего cfg БЕЗ повторного показа (offered-ключ уже стоит)
    try {
      roomToast(
        isN ? tt('room.reader.fadeGrad.done', 'Адаптивная огласовка включена — сходит со знакомых слов')
            : tt('room.reader.advisor.ruOn', 'Перевод скрыт до тапа — во всех текстах'),
        tt('room.reader.advisor.undo', 'Вернуть'),
        () => {
          if (isN) readerCfg.niqqudMode = prev; else readerCfg.ruMode = prev;
          try { saveReaderCfg(); } catch (_) {}
          try { rerenderReader(); } catch (_) { try { applyDecorations(); } catch (_) {} }
          try { agentUx('scaffold_advisor', 'dismissed'); } catch (_) {}
          try { roomToast(tt('room.reader.advisor.undone', 'Возвращено')); } catch (_) {}
        },
        10000);
    } catch (_) {}
    dismiss(false);   // offered-ключ ставим, dismissed НЕ эмитим (accepted уже ушёл)
  });
  const x = el('button', { class: 'reader-fadegrad-x', text: '✕', attrs: { 'aria-label': tt('room.reader.fadeGrad.dismiss', 'Не сейчас') } });
  x.type = 'button'; x.title = tt('room.reader.fadeGrad.dismiss', 'Не сейчас');
  x.addEventListener('click', () => dismiss());
  actions.appendChild(go); actions.appendChild(x);
  bar.appendChild(actions);
  const tbl = $('roomReaderTable');
  if (tbl && tbl.parentNode === reader) reader.insertBefore(bar, tbl);
  else reader.appendChild(bar);
  try { agentUx('scaffold_advisor', 'offered'); } catch (_) {}
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
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
let _streakView = null;   // D7 — last computed streak/goal (pure ReaderMorph.streakView over study_day)
// D7 — TODAY as a LOCAL calendar day-string ('YYYY-MM-DD'). Computed in the UI layer ONLY (the engine
// stays Date-free for determinism, invariant #5); injected into the pure streak fold.
function _localDayStr(d) {
  const x = d || new Date();
  const m = String(x.getMonth() + 1).padStart(2, '0'), dd = String(x.getDate()).padStart(2, '0');
  return x.getFullYear() + '-' + m + '-' + dd;
}
// D7 — the off-switch (the premium «no dark patterns» signal): a device-local view pref (like the other
// Room prefs), NOT the streak DATA (that lives durably in OPFS, owner's choice).
function streakHidden() { try { return localStorage.getItem('room.streakHidden') === '1'; } catch (_) { return false; } }
function streakHiddenSet(v) { try { localStorage.setItem('room.streakHidden', v ? '1' : '0'); } catch (_) {} }
function _dueBadgeEl(extraClass) {
  const box = el('div', { class: 'reader-aids-duebadge' + (extraClass ? ' ' + extraClass : ''), attrs: { 'data-due-badge': '1', dir: uiDirRoom() } });
  box.hidden = true;
  const grp = (labelKey, labelFb, numAttr) => {
    const g = el('span', { class: 'db-group', attrs: { 'data-due-pair': '1' } });
    g.appendChild(el('span', { class: 'db-k', i18n: labelKey, text: tt(labelKey, labelFb) }));
    g.appendChild(el('span', { class: 'db-sep', text: ': ' }));
    g.appendChild(el('b', { class: 'db-n', text: '0', attrs: { [numAttr]: '1' } }));
    return g;
  };
  box.appendChild(grp('room.morph.study.inProgress', 'В работе', 'data-due-inprogress'));
  box.appendChild(grp('room.morph.study.due', 'К повторению', 'data-due-now'));
  // P5.7 Т3 — when nothing is due NOW, tell the user WHEN words return (trust: the queue is alive).
  // One nowrap unit; shown only with a future due and something in progress (never over-claims).
  const ng = el('span', { class: 'db-group db-next', attrs: { 'data-due-next': '1' } });
  ng.hidden = true;
  ng.appendChild(el('span', { class: 'db-k', i18n: 'room.morph.study.nextDue', text: tt('room.morph.study.nextDue', 'ближайший повтор') }));
  ng.appendChild(el('span', { class: 'db-sep', text: ': ' }));
  ng.appendChild(el('b', { class: 'db-n', attrs: { 'data-due-nextval': '1' }, text: '' }));
  box.appendChild(ng);
  // D7 — calm streak/goal group (one nowrap unit → breaks only at the logical boundary, invariant #7).
  // «🔥 N · сегодня k/g» — secondary to the due counts, never a loud always-on flame.
  const sg = el('span', { class: 'db-group db-streak', attrs: { 'data-streak-group': '1', role: 'button', tabindex: '0', 'aria-label': tt('room.morph.study.heatTitle', 'Календарь активности') } });
  sg.hidden = true;
  sg.appendChild(el('span', { class: 'db-streak-flame', text: '🔥 ' }));
  sg.appendChild(el('b', { class: 'db-n', text: '0', attrs: { 'data-streak-cur': '1' } }));
  sg.appendChild(el('span', { class: 'db-streak-goal', attrs: { 'data-streak-goal': '1' }, text: '' }));
  sg.appendChild(el('span', { class: 'db-streak-cal', text: ' 📅' }));   // D7.1 — affordance: tap the streak → activity heatmap
  // R3.2 — instant tooltip for the flame (a new user has no idea what «🔥 2» means); the full
  // typology lives one tap away in the ⓘ sheet.
  sg.title = tt('room.morph.stats.streakTip', 'Стрик: дней подряд с выполненной целью. «сегодня N/M» — прогресс дневной цели (все поверхности: Зал + Telegram). Тап — календарь.');
  sg.addEventListener('click', (e) => { e.stopPropagation(); openStudyHeatmap(); });
  sg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openStudyHeatmap(); } });
  box.appendChild(sg);
  // R3.2 (owner 2026-07-11) — ⓘ: one tap explains EVERY counter (badge + Mini App share the
  // typology; the numbers themselves must never need reverse-engineering).
  const info = el('button', { class: 'db-info', text: 'ⓘ', attrs: { type: 'button', 'aria-label': tt('room.morph.stats.title', 'Мои показатели'), title: tt('room.morph.stats.title', 'Мои показатели') } });
  info.addEventListener('click', (e) => { e.stopPropagation(); openStatsInfo(); });
  box.appendChild(info);
  return box;
}
// R3.2 — «Мои показатели»: the counter typology, one definition per number, cross-surface scope
// spelled out (Зал + Telegram). Values are computed FRESH on open (not the possibly-stale badge
// paint); «Сделано сегодня» uses the same canon as the Mini App tile (countTodayAllReviews).
let _statsSheetOpen = false;
async function openStatsInfo() {
  if (_statsSheetOpen) return; _statsSheetOpen = true;
  try {
    let schedTotal = 0, todayAll = 0;
    try { schedTotal = Number((await localDb.dbQuery("SELECT COUNT(*) c FROM word_status WHERE srs_due IS NOT NULL", []))[0].c) || 0; } catch (_) {}
    try {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      todayAll = await localDb.countTodayAllReviews(d.toISOString());
    } catch (_) {}
    const c = _dueCounts || { dueNow: 0, inProgress: 0 };
    const sv = _streakView;
    const ov = el('div', { class: 'list-picker-ov heatmap-sheet-ov' });
    const box = el('div', { class: 'list-picker heatmap-sheet room-stats-sheet' });
    box.appendChild(el('div', { class: 'list-picker-title', text: 'ⓘ ' + tt('room.morph.stats.title', 'Мои показатели') }));
    const body = el('div', { class: 'room-stats-body', attrs: { dir: uiDirRoom() } });
    const row = (num, labelKey, labelFb, expKey, expFb) => {
      const r = el('div', { class: 'room-stats-row' });
      r.appendChild(el('div', { class: 'room-stats-head', text: String(num) + ' — ' + tt(labelKey, labelFb) }));
      r.appendChild(el('div', { class: 'room-stats-exp', text: tt(expKey, expFb) }));
      return r;
    };
    body.appendChild(row(c.dueNow || 0, 'room.morph.study.due', 'К повторению',
      'room.morph.stats.dueExp', 'Слова, чей срок повторения наступил. Одна и та же цифра в Зале и в Telegram-наставнике.'));
    body.appendChild(row(todayAll, 'room.morph.stats.todayAll', 'Сделано сегодня',
      'room.morph.stats.todayAllExp', 'Повторения за сегодня на всех поверхностях (Зал + Telegram), после синхронизации. Пропуски «Не знаю» не считаются.'));
    body.appendChild(row(c.inProgress || 0, 'room.morph.study.inProgress', 'В работе',
      'room.morph.stats.inprogExp', 'Слова с вашей отметкой уровня (1–4) — активный набор, который вы учите.'));
    body.appendChild(row(schedTotal, 'room.morph.stats.sched', 'В расписании',
      'room.morph.stats.schedExp', 'Все слова с расписанием повторений — включая выученные и импортированные из Anki.'));
    body.appendChild(row('🔥 ' + ((sv && sv.cur) || 0), 'room.morph.stats.streak', 'Стрик',
      'room.morph.stats.streakExp', 'Дней подряд с выполненной дневной целью. «сегодня N/M» рядом — прогресс цели (M повторений в день) на всех поверхностях: Зал + Telegram.'));
    box.appendChild(body);
    const close = () => { _statsSheetOpen = false; try { ov.remove(); } catch (_) {} document.removeEventListener('keydown', onKey); };
    const done = el('button', { class: 'list-picker-done', attrs: { type: 'button' } }); done.textContent = tt('room.corpus.lists.done', 'Готово');
    done.addEventListener('click', close);
    box.appendChild(done);
    ov.appendChild(box);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    try { done.focus(); } catch (_) {}
  } catch (_) { _statsSheetOpen = false; }
}
function _paintDueBadge(box, c) {
  const dueShow = !!(c && (c.inProgress > 0 || c.dueNow > 0));
  box.querySelectorAll('[data-due-pair]').forEach((g) => { g.hidden = !dueShow; });   // due numbers hide together
  if (dueShow) {
    const ip = box.querySelector('[data-due-inprogress]'); if (ip) ip.textContent = String(c.inProgress);
    const dn = box.querySelector('[data-due-now]'); if (dn) dn.textContent = String(c.dueNow);
  }
  // P5.7 Т3 — «ближайший повтор: через ~N дн.» when nothing is due now but words are scheduled.
  const ng = box.querySelector('[data-due-next]');
  if (ng) {
    const showNext = !!(c && c.dueNow === 0 && c.nextDue != null && c.inProgress > 0);
    ng.hidden = !showNext;
    if (showNext) {
      const u = _humanizeUntil(c.nextDue, Date.now());
      const val = ng.querySelector('[data-due-nextval]');
      if (val) val.textContent = (u.unit === 'd')
        ? tt('room.morph.study.inDays', 'через ~{n} дн.').replace('{n}', String(u.n))
        : tt('room.morph.study.inHours', 'через ~{n} ч.').replace('{n}', String(u.n));
    }
  }
  box.classList.toggle('has-due', !!(c && c.dueNow > 0));   // accent only when something is actually due now
  // D7 — streak/goal group (off-switch respected; shown once there is a streak or progress today).
  const sg = box.querySelector('[data-streak-group]');
  const sv = _streakView;
  let streakShow = false;
  if (sg) {
    streakShow = !streakHidden() && !!sv && (sv.cur > 0 || sv.todayRecalls > 0);
    sg.hidden = !streakShow;
    if (streakShow) {
      const cn = sg.querySelector('[data-streak-cur]'); if (cn) cn.textContent = String(sv.cur);
      const g = sg.querySelector('[data-streak-goal]');
      if (g) {
        if (sv.todayRest) g.textContent = ' · ' + tt('room.morph.study.streakRestShort', 'отдых ✓');
        else g.textContent = ' · ' + tt('room.morph.study.today', 'сегодня') + ' ' + sv.todayRecalls + '/' + (sv.todayGoal > 0 ? sv.todayGoal : sv.cap);
      }
      sg.classList.toggle('db-streak-done', !!sv.todayQualified);
    }
  }
  box.hidden = !(dueShow || streakShow);
}
// R3.3 (owner 2026-07-11: all-surface стрик) — the study-day rows the streak/heatmap folds consume,
// merged with the per-local-day review count from the LOG (which carries down-synced Telegram/Mini
// App rows): recalls/available = max(device ledger, log count). A Telegram-only day thus qualifies
// the daily goal honestly (reviews done ARE evidence work was available); a pure local rest day is
// untouched. TTL-cached — refreshDueBadge fires on every answer, the log scan shouldn't.
let _asdCache = null;
async function _allSurfaceStudyDays() {
  if (_asdCache && (Date.now() - _asdCache.at) < 4000) return _asdCache.rows;
  let sd = [], byDay = {};
  try { sd = (await localDb.getStudyDays()) || []; } catch (_) { sd = []; }
  try { byDay = (typeof localDb.countReviewsByLocalDay === 'function' ? (await localDb.countReviewsByLocalDay()) : {}) || {}; } catch (_) { byDay = {}; }
  const map = new Map();
  for (const r of sd) { if (r && r.day) map.set(String(r.day), { day: String(r.day), recalls: Number(r.recalls) || 0, available: Number(r.available) || 0 }); }
  for (const day of Object.keys(byDay)) {
    const n = Number(byDay[day]) || 0;
    const row = map.get(day) || { day, recalls: 0, available: 0 };
    row.recalls = Math.max(row.recalls, n);
    row.available = Math.max(row.available, n);
    map.set(day, row);
  }
  const rows = Array.from(map.values());
  _asdCache = { at: Date.now(), rows };
  return rows;
}
async function refreshDueBadge() {
  if (!window.ReaderMorph || typeof window.ReaderMorph.dueCounts !== 'function') return;
  let states = morphHost.peekWordStates(), schedule = {};
  try { if (!states) states = (await ensureWordStates()) || {}; } catch (_) { states = states || {}; }
  try { schedule = (await localDb.getSrsSchedule()) || {}; } catch (_) { schedule = {}; }
  _dueCounts = window.ReaderMorph.dueCounts(states || {}, schedule, Date.now());
  // D7 — streak/goal folded from the study_day ledger (today injected from the LOCAL date).
  if (typeof window.ReaderMorph.streakView === 'function' && typeof localDb.getStudyDays === 'function') {
    try { _streakView = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), window.ReaderMorph.STREAK_GOAL_CAP, _localDayStr()); }   // R3.3 all-surface
    catch (_) { _streakView = null; }
  }
  document.querySelectorAll('[data-due-badge]').forEach((b) => _paintDueBadge(b, _dueCounts));
  _paintDueCTA();
}
// D2 — the home «🔁 К повторению: N» CTA (cross-text daily-review entry). Shown only on the home (reader
// closed) when scheduled words are DUE now (dueCounts.dueNow). Tapping → startDueReview (no open text needed).
function _paintDueCTA() {
  const cta = document.getElementById('roomDueCta'); if (!cta) return;
  const reader = $('roomReader');
  const mentor = $('roomMentorView');   // P9 — дом наставника тоже «не home»: CTA не поверх вида
  const lesson = $('roomLessonView');
  // R3 (ROOM_DUE_CONTINUITY §3) — ONE number everywhere: the CTA shows the SAME schedule-due count
  // as the badge (shared predicate: due<=now, ignore excluded — dueCounts == getDueWithSource by
  // construction). The old sourced-only count under-claimed after R2 (the ladder serves unsourced
  // words too) and HID the CTA entirely for a fully-unsourced backlog — itself a dead end. The
  // honest-residue guarantee moved to click-time: a due word that still can't be assembled gets
  // the R2 «нельзя собрать на этом устройстве» empty-state, never a silent dead end.
  const n = (_dueCounts && _dueCounts.dueNow) || 0;
  // B2 — the same canonical count is projected inside Learning Home's «Сегодня» zone.
  // It is never copied into a second store and disappears when the shared schedule reaches zero.
  document.querySelectorAll('[data-learning-due]').forEach((action) => {
    action.hidden = !(n > 0);
    const count = action.querySelector('[data-learning-due-count]');
    if (count) count.textContent = String(n);
  });
  const learningHomeOpen = activeTrack === 'corpus' && corpusNav.corpus === 'hub';
  const show = n > 0 && !learningHomeOpen && !!(reader && reader.hidden) && !(mentor && !mentor.hidden) && !(lesson && !lesson.hidden);   // home only — not while reading/working
  cta.hidden = !show;
  if (show) {
    cta.replaceChildren(
      roomIcon('lp-icon-train', '🔁'),
      el('span', { class: 'room-due-label', text: tt('room.morph.study.due', 'К повторению') + ': ' + roomNumber(n) }),
      roomIcon('lp-icon-chevron-right', '→', 'room-icon-directional'),
    );
  }
}
// AA4-4b — pending agent-proposal chip (count ONLY — agent text never renders on
// this surface; the enforced-CSP agent-access page is the sole text surface).
// Quiet-fail: 401/403/404/network → stay hidden. Hidden-at-zero == hidden-on-error
// is a considered decision (the chip may under-claim, never over-claim — the
// panel remains reachable through its normal entry). Refetches when the tab
// becomes visible again (long-lived PWA tabs; return from the panel).
async function refreshAgentProposalsChip() {
  const chip = document.getElementById('roomAgentProposals');
  if (!chip) return;
  let n = 0;
  try {
    const r = await fetch('/api/agent-access/proposals/summary', { credentials: 'same-origin' });
    if (r.ok) { const j = await r.json(); n = (j && j.ok && Number(j.pending_total)) || 0; }
  } catch (_) { n = 0; }
  chip.hidden = !(n > 0);
  if (n > 0) chip.textContent = '🤝 ' + tt('room.agent.proposalsChip', 'Предложения агента') + ': ' + n + ' →';
}
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAgentProposalsChip();
  });
  window.addEventListener('pageshow', () => refreshAgentProposalsChip());
} catch (_) {}

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
  const totalWrap = el('span', { class: 'room-study-total-wrap' });
  totalWrap.appendChild(el('span', { class: 'room-study-total' }));   // «Новых слов: N»
  const totalHelp = wireDismissibleDetails(el('details', { class: 'learning-compass-details room-study-total-help' }));
  totalHelp.appendChild(el('summary', { text: 'ⓘ', attrs: { 'aria-label': tt('room.morph.study.countHelpLabel', 'Что означает число новых слов') } }));
  const totalHelpPanel = el('div', { class: 'learning-compass-panel room-study-total-help-panel' });
  totalHelpPanel.appendChild(el('p', { text: tt('room.morph.study.countHelp', 'Это разные уверенно распознанные словарные леммы со статусом «новое»; повторы одного слова объединены. Число не является остатком от процента знакомых слов.') }));
  totalHelp.appendChild(totalHelpPanel); totalWrap.appendChild(totalHelp); head.appendChild(totalWrap);
  // D7.1 — always-visible entry to the activity heatmap (findable even with no streak → honest empty state)
  const calBtn = el('button', { class: 'room-study-cal', attrs: { type: 'button', 'aria-label': tt('room.morph.study.heatTitle', 'Календарь активности'), title: tt('room.morph.study.heatTitle', 'Календарь активности') } });
  calBtn.textContent = '📅';
  calBtn.addEventListener('click', () => openStudyHeatmap());
  head.appendChild(calBtn);
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
    if (t.closest('[data-train-teach-done]')) { onTrainTeachDone(); return; }
    if (t.closest('[data-train-leech]')) { onTrainLeechIgnore(t.closest('.room-train-leech')); return; }
    if (t.closest('[data-train-skip]')) { onTrainSkip(); return; }
    const tile = t.closest('[data-train-tile]'); if (tile) { onTrainTile(tile); return; }
    const unb = t.closest('[data-train-unbuild]'); if (unb) { onTrainUnbuild(+unb.getAttribute('data-train-unbuild')); return; }
    if (t.closest('[data-train-again]')) { restartTraining(); return; }
    if (t.closest('[data-streak-toggle]')) { streakHiddenSet(!streakHidden()); try { refreshDueBadge(); } catch (_) {} renderTrainSummary(); return; }   // D7 — premium off-switch
    if (t.closest('[data-heatmap-toggle]')) { openStudyHeatmap(); return; }   // D7.1 — tap the streak → activity heatmap sheet
    const chSeg = t.closest('[data-train-channel]'); if (chSeg) { onTrainChannel(chSeg.getAttribute('data-train-channel')); return; }   // D6 — channel
    if (t.closest('[data-train-listen-row]')) { try { _playSentenceAudio(_trainSession && _trainSession._built); } catch (_) {} return; }   // D6 — replay sentence
    if (t.closest('[data-train-listen-word]')) { const b = _trainSession && _trainSession._built, it = _trainSession && _trainSession.items[_trainSession.idx]; try { speakWord((b && b.cz && b.cz.answer) || (it && (it.niqqud || it.surface)) || ''); } catch (_) {} return; }   // D6 — replay word (sentence-inflected form)
    const tsp = t.closest('[data-train-speak]'); if (tsp) { try { speakWord(tsp.getAttribute('data-he') || ''); } catch (_) {} return; }
    if (t.closest('[data-train-rowspeak]')) { try { speakWord((_trainSession && _trainSession._built && _trainSession._built.sentence) || ''); } catch (_) {} return; }
    if (t.closest('[data-train-card]')) { onTrainCard(); return; }
    if (t.closest('[data-train-source]')) { onTrainSource(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (!_studySheet || _studySheet.hidden) return;
    // a layered sheet (heatmap / list-picker) on top owns Escape first — don't also close the study sheet under it
    if (e.key === 'Escape') { if (document.querySelector('.list-picker-ov')) return; closeStudySheet(); return; }
    if (e.key === 'Tab') { roomFocusTrap(e, _studySheet.querySelector('.room-study-card')); return; }
    const channelTab = e.target && e.target.closest && e.target.closest('[data-train-channel]');
    if (channelTab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
      const tabs = Array.from(_studySheet.querySelectorAll('[data-train-channel]:not([disabled])'));
      const at = tabs.indexOf(channelTab); if (at < 0 || !tabs.length) return;
      e.preventDefault();
      const nextAt = e.key === 'Home' ? 0 : (e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
      tabs[nextAt].focus(); tabs[nextAt].click();
      return;
    }
    if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('[data-train-input]')) { e.preventDefault(); onTrainSubmit(); return; }
    // D7.1 — keyboard-activate the streak/heatmap toggle (div[role=button] doesn't synthesize click on Enter/Space)
    const hk = e.target && e.target.closest && e.target.closest('[data-heatmap-toggle]');
    if (hk && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hk.click(); }
  });
  _studySheet = sheet;
  return sheet;
}
function _studySetTitle(key, fallback) {
  if (!_studySheet) return;
  const value = tt(key, fallback);
  _studySheet.setAttribute('data-i18n-aria-label', key);
  _studySheet.setAttribute('aria-label', value);
  const title = _studySheet.querySelector('.room-study-title');
  if (title) { title.setAttribute('data-i18n', key); title.textContent = value; }
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
  if (_studyMode === 'list') { _studySetTitle('room.morph.study.title', '📚 Учить новые слова'); renderStudyBody(); }
  else { _studySetTitle('room.morph.study.trainTitle', 'Тренировка'); startTraining(); }
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
  let res = null;
  try { res = await markWordStatus(lk, st); } catch (_) {}   // P5.6 R-2(a): l1–l4 mark seeds the schedule
  try { if (res && res.dueMs) roomToast('🔁 ' + _dueWhenText(res.dueMs)); } catch (_) {}   // P5.7 Т1 — closure in the study list
  row.dataset.cur = st;
  const w = _studyAll.find((x) => x.lemmaKey === lk); if (w) w._status = st;   // keep the row visible w/ new highlight (gentle; re-collect on re-open)
  row.querySelectorAll('.rm-status-btn').forEach((b) => b.classList.toggle('rm-status-active', b.getAttribute('data-study-status') === st));
  morphHost.invalidateWordStates();
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
  for (const w of targets) { try { await markWordStatus(w.lemmaKey, status); } catch (_) {} w._status = status; }   // P5.6 R-2(a)
  morphHost.invalidateWordStates();
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
  _studySetTitle('room.morph.study.title', '📚 Учить новые слова');
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
const LEECH_LAPSES = 4;   // D4 — after this many misses on a word, gently offer «отметить ignore?» (leech)
function _normHe(s) { return window.ReaderMorph.stripNiqqud(String(s || '')).replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ').trim(); }
// R2 source scan helper: match a sentence token to an identity needle ± one leading proclitic.
// Answer grading no longer uses this heuristic (Wave-2 G0 uses ReaderMorph channel policies).
function _stripProclitic(s) { return (s && s.length > 2 && /^[והבכלשמ]/.test(s)) ? s.slice(1) : s; }
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
  // D4 — weakness-weighting: surface words you fail more often (srs lapses) first within the due pool.
  // Stable: ties keep the learning-before-fresh + freq order; all-zero lapses → unchanged (no regression).
  const pool = learning.concat(fresh);
  const ranked = (window.ReaderMorph && window.ReaderMorph.rankByWeakness) ? window.ReaderMorph.rankByWeakness(pool) : pool;
  const active = ranked.slice(0, TRAIN_N - kRefresh);
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
  // D2 — persist the SOURCE occurrence of each item (text_key + sentence_id + order_index + surface) so the
  // cross-text «due today» queue can re-cloze this word later WITHOUT opening its text. Data already in hand.
  items.forEach((it) => {
    const r = it._built && readerRows[it._built.rowIdx];
    it._source = r ? { textKey: readerTextKey, sentenceId: r._v3_sentenceId, orderIndex: r._v3_orderIndex, surface: it.surface, title: readerTextTitle || null } : null;
  });
  await _launchTrainSession(items, { pool: all });
}
function restartTraining() {
  const s = _trainSession;
  return s && s.cross ? startDueReview() : startTraining();
}
// Shared session launch (open-text AND cross-text D2): D1 MC pre-compute → audio caps/channels → session →
// D7 ledger → render. `items` already carry _built (cloze) + _source. opts.pool = distractor pool (B1);
// opts.cross = D2 cross-text session (no open reader behind).
async function _launchTrainSession(items, opts) {
  opts = opts || {};
  // Replay the exercise ladder from the append-only log. Older sessions materialized their stage
  // as a `mark`; premium sessions put `training_stage` on the grade row. Because rows are already
  // ordered by (reviewed_at,id), any later manual mark is an explicit override.
  try {
    let rows = await localDb.getTrainingStageRows(items.map((item) => item.lemmaKey));
    if (window.FsrsCore && window.FsrsCore.withoutAnnulled) rows = window.FsrsCore.withoutAnnulled(rows);
    const stages = Object.create(null), valid = { new: 1, l1: 1, l2: 1, l3: 1, l4: 1, known: 1, ignore: 1 };
    for (const row of (rows || [])) {
      const key = row && row.item_key ? String(row.item_key) : '';
      if (!key) continue;
      let meta = {}; try { meta = JSON.parse(row.meta_json || '{}'); } catch (_) {}
      const candidate = row.kind === 'mark' ? meta.status
        : ((row.kind === 'review' || row.kind === 'skip') ? meta.training_stage : null);
      if (candidate && valid[candidate]) stages[key] = candidate;
    }
    items.forEach((item) => { item._trainingStage = stages[item.lemmaKey] || item.status || 'new'; });
  } catch (_) { items.forEach((item) => { item._trainingStage = item.status || 'new'; }); }
  // D1 — pre-compute slot-inflected MC options for MC-eligible items (R10 moat): resolve the answer to its
  // paradigm → buildMcSlotOptions (proclitic-aware slot + dict bank + L4 semantic). null → render falls back
  // to the B1 distractors (R11 no-regress). Async, ≤N items, offline.
  if (typeof window.ReaderMorph.buildMcSlotOptions === 'function') {
    for (const it of items) {
      if (!window.ReaderMorph.isMcLevel(it._trainingStage || it.status)) continue;
      if (it._wordOnly) continue;   // R2: slot-MC bank is gloss-collision-prone without a sentence — render uses B1+veto
      try {
        const ans = it._card || await window.ReaderMorph.resolveWordLight(it.surface, it.niqqud);   // D2 reuses its resolved card
        if (ans) { if (!ans.gloss) ans.gloss = it.gloss; const o = await window.ReaderMorph.buildMcSlotOptions(ans, 3); if (o && o.options && o.options.length >= 3) it._mcOptions = o; }
      } catch (_) {}
    }
  }
  if (!_studySheet || _studySheet.hidden || _studyMode !== 'train') return;   // re-check after the await fan-out
  // D7 — «available work today» = GENUINELY due/new items only (not-yet-due padding excluded — R2/honest rest-credit).
  const _nowDue = Date.now();
  const dueAvail = items.filter((it) => !it._srs || !it._srs.due || it._srs.due <= _nowDue).length;
  // D6 — extraction channels: probe audio caps → which of read/listen/reverse/dictate are offerable.
  const caps = _trainAudioCaps(items);
  const channels = (window.ReaderMorph.availableChannels ? window.ReaderMorph.availableChannels(caps) : { read: true, reverse: true, listen: false, dictate: false });
  let channel = trainChannel(); if (!channels[channel]) channel = 'read';
  _trainSession = {
    items, pool: opts.pool || items, idx: 0, total: items.length, plannedTotal: items.length,
    retryQueue: [], retryPhase: false, retryStart: -1,
    dueAvail: dueAvail, channel: channel, channels: channels, correct: 0,
    answered: false, cross: !!opts.cross,
  };
  try { localDb.noteAvailable(_localDayStr(), dueAvail); } catch (_) {}   // dueAvail==0 → honest rest-credit
  try { refreshDueBadge(); } catch (_) {}   // reflect today's goal denominator before the first question
  renderTrainItem();
}
// D2 — cross-text «due today» session: scheduled-due words across ALL read texts (getDueWithSource),
// re-clozed from their stored SOURCE sentence (re-fetched cross-text, re-anchored by text_key+order_index).
// Reuses the whole training UI (channels D6, streak D7); needs NO open reader. A due word whose sentence is
// gone (deleted / re-import mismatch / never-sourced legacy) is SKIPPED — never a fabricated cloze (R11).
async function startDueReview() {
  ensureStudySheet();
  _studySheet.hidden = false; _studySheet.classList.add('room-study-open');
  _studyMode = 'train'; _trainSession = null;
  _studySetTitle('room.morph.study.reviewTitle', 'Повторение');
  roomFocusInto(_studySheet.querySelector('.room-study-card'));
  try { _studySheet.querySelectorAll('[data-study-mode]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-study-mode') === 'train')); } catch (_) {}
  try { _studyListChrome(false); } catch (_) {}
  const body = _studySheet.querySelector('.room-study-body');
  if (!body || !window.ReaderMorph) return;
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'room-study-loading', i18n: 'room.morph.study.loading', text: tt('room.morph.study.loading', 'Собираю…') }));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  let due = [];
  try { due = (await localDb.getDueWithSource(Date.now())) || []; } catch (_) { due = []; }
  const items = await _buildDueSourcedItems(due, { scanBudget: 12 });
  if (!_studySheet || _studySheet.hidden) return;
  const R = window.ReaderMorph;
  const ranked = (R.rankByWeakness ? R.rankByWeakness(items) : items).slice(0, TRAIN_N);
  if (!ranked.length) {
    body.innerHTML = '';
    // R2 — HONEST empty copy: with a live due backlog that couldn't be assembled the old «нет слов
    // к повторению» would be a lie under a badge saying N (critика r4-3). Distinct states.
    if (due.length) {
      // dynamic {n} → no data-i18n attr (a locale switch would clobber the substituted count)
      body.appendChild(el('div', { class: 'room-study-empty',
        text: tt('room.morph.study.dueUnservable', 'Слова ждут повторения ({n}), но их пока нельзя собрать на этом устройстве — открой их тексты в Зале.').replace('{n}', String(due.length)) }));
    } else {
      body.appendChild(el('div', { class: 'room-study-empty', i18n: 'room.morph.study.dueEmpty', text: tt('room.morph.study.dueEmpty', 'Нет слов к повторению сегодня — открой текст и потренируй новые слова.') }));
    }
    // Owner-директива 2026-07-11 (непрерывное обучение): due-на-сегодня исчерпан → явная опция
    // продолжить БЛИЖАЙШИМИ словами «в работе» (расписание в будущем, earliest-first). FSRS
    // считает ранний повтор нативно (elapsed-time в fsrsStep) — «зубрёжка вперёд» честна для
    // памяти. Тот же sourced-конвейер (несорсованные — отдельный слайс Room-continuity).
    try {
      let ahead = [];
      try { ahead = (await localDb.getDueWithSource(Date.now() + 400 * 86400000)) || []; } catch (_) { ahead = []; }
      const now2 = Date.now();
      // R2: unsourced words join the ahead pool too — the builder's ladder serves or honestly skips them.
      ahead = ahead.filter((d) => d && d.srs && d.srs.due > now2)
                   .sort((a, b) => a.srs.due - b.srs.due);
      if (ahead.length) {
        const btn = el('button', { class: 'room-study-aheadbtn', attrs: { type: 'button' },
          i18n: 'room.morph.study.aheadBtn', text: tt('room.morph.study.aheadBtn', '▶ Продолжить: слова в работе') });
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const aheadItems = await _buildDueSourcedItems(ahead, { scanBudget: 6 });
          const aheadRanked = aheadItems.slice(0, TRAIN_N);   // earliest-due порядок (не weakness: пул будущий)
          if (!aheadRanked.length) {
            // R2 — the button must not silently evaporate (critique r4-6): say why nothing came.
            btn.hidden = true;
            body.appendChild(el('div', { class: 'room-study-aheadnote', i18n: 'room.morph.study.aheadUnservable',
              text: tt('room.morph.study.aheadUnservable', 'Эти слова пока нельзя собрать на этом устройстве — открой их тексты в Зале.') }));
            try { window.applyI18n && window.applyI18n(); } catch (_) {}
            return;
          }
          await _launchTrainSession(aheadRanked, { cross: true });
        });
        body.appendChild(btn);
        body.appendChild(el('div', { class: 'room-study-aheadnote', i18n: 'room.morph.study.aheadNote',
          text: tt('room.morph.study.aheadNote', 'Повторение раньше срока — расписание пересчитается честно.') }));
      }
    } catch (_) {}
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    return;
  }
  await _launchTrainSession(ranked, { cross: true });
}
// ── R2 serve-unsourced helpers (ROOM_DUE_CONTINUITY §3, критика wf_d242bed2) ─────────────────────
// Surface derivation for an unsourced scheduled word: the most recent NON-annulled log row that
// actually CARRIES meta.surface (mark/seed rows don't — critique r11-2), else the '<skel>#pos' key
// parse; a pid: key with no logged surface → null (honest skip — the key alone names no form).
async function _r2DeriveSurface(lemmaKey) {
  const R = window.ReaderMorph;
  try {
    let rows = await localDb.getReviewLog(lemmaKey);
    try { if (window.FsrsCore && window.FsrsCore.withoutAnnulled) rows = window.FsrsCore.withoutAnnulled(rows); } catch (_) {}
    for (let i = rows.length - 1; i >= 0; i--) {
      let m = null;
      try { m = rows[i].meta_json ? JSON.parse(rows[i].meta_json) : (rows[i].meta || null); } catch (_) { m = null; }
      const s = m && m.surface ? R.stripNiqqud(String(m.surface)).trim() : '';
      if (s) return s;
    }
  } catch (_) {}
  const k = String(lemmaKey || '');
  if (k.startsWith('pid:')) return null;
  const h = k.lastIndexOf('#');
  const skel = (h > 0 ? k.slice(0, h) : k).trim();
  return /[א-ת]/.test(skel) ? skel : null;
}
// R2.1 — pid:-keyed word → its paradigm entry in the shipped offline dict (eng.pidMap): lemma +
// vocalization + R1-verified gloss. For a pid: key the IDENTITY is given by construction (the mark
// was keyed to this exact paradigm at tap time) — no resolver round-trip needed or wanted (live
// measure: resolveWordLight('להיגרע') labels the dict's own citation form 'guessed').
async function _r2PidEntry(lemmaKey) {
  const k = String(lemmaKey || '');
  if (!k.startsWith('pid:')) return null;
  try {
    const eng = await window.ReaderMorph.ensureEngine();
    const pid = k.slice(4);
    const e = (eng && eng.pidMap && (eng.pidMap.get(pid) || eng.pidMap.get(Number(pid)))) || null;
    return (e && (e.lemma || e.lemma_niqqud)) ? e : null;
  } catch (_) { return null; }
}
// R4a — the needle SET for a word: the logged surface + citation skeleton + the paradigm CELL
// skeletons from the shipped dict (a word marked in text was almost always an INFLECTED form —
// the citation-lemma needle alone misses it; live measure: 179 unsourced words whose contexts
// sit in 14.7K local sentences). Bounded; the identity gate downstream carries ALL the honesty.
function _r4NeedlesFor(needle, pidEntry) {
  const R = window.ReaderMorph, set = [];
  const add = (s) => { const sk = R.stripNiqqud(String(s || '')).trim(); if (sk && sk.length >= 2 && /[א-ת]/.test(sk) && set.indexOf(sk) < 0 && set.length < 12) set.push(sk); };
  add(needle);
  if (pidEntry) {
    add(pidEntry.lemma || pidEntry.lemma_niqqud);
    const cells = pidEntry.cells && typeof pidEntry.cells === 'object' ? pidEntry.cells : null;
    if (cells) for (const k of Object.keys(cells)) { add(cells[k] && cells[k].he); if (set.length >= 12) break; }
  }
  return set;
}
// Day-keyed negative scan cache: a WORD that scanned dry is not re-scanned for 7 days, so a
// permanently-unhealable prefix can't monopolize the per-session scan budget (critique r4-1/r11-5).
// v3 (R4a): keyed by lemmaKey — the needle SET is derived, per-needle keys would leak budget.
const R2_MISS_KEY = 'room.r2.scanMiss.v3', R2_MISS_MS = 7 * 86400000;
function _r2MissGet() { try { return JSON.parse(localStorage.getItem(R2_MISS_KEY) || '{}'); } catch (_) { return {}; } }
function _r2MissFresh(cache, skel) { const t = Number(cache[skel]) || 0; return !!t && (Date.now() - t) < R2_MISS_MS; }
function _r2MissMark(cache, skel) { cache[skel] = Date.now(); try { localStorage.setItem(R2_MISS_KEY, JSON.stringify(cache)); } catch (_) {} }
// RU-gloss token overlap — word-only MC distractor veto (a distractor that is ALSO a plausible
// translation of the gloss-question would be a false negative — critique r17-5).
function _r2GlossOverlap(a, b) {
  const tok = (s) => String(s || '').toLowerCase().split(/[^a-zа-яё]+/).filter((w) => w.length >= 4);
  const B = new Set(tok(b));
  return tok(a).some((w) => B.has(w));
}
const _HEB_VOWELED_RE = /[֑-ׇ]/;
// Verify one scan candidate for one word: token-in-sentence (± proclitic) + cloze + the SAME
// canonical-keyer identity gate the whole product keys on (BLOCKER r11-1/r17-1: skeleton presence
// proves orthography, not lemma — a homograph sentence must never be served or healed onto this
// word's schedule key). Returns {cz, tskel, card, heN} or null.
async function _r2VerifyCandidate(R, d, needles, sent) {
  const heN = String(sent.he_niqqud || sent.he_plain || sent.he || '');
  if (!heN) return null;
  const nset = Array.isArray(needles) ? needles : [needles];   // R4a: a needle SET (paradigm cells)
  const tokens = R.tokenize(heN);   // token objects {text, start, end, isWord} — NOT strings (R2.1 live-found fix)
  let tskel = '';
  for (const t of tokens) {
    if (!t || !t.isWord) continue;
    const sk = R.stripNiqqud(String(t.text || ''));
    if (nset.indexOf(sk) >= 0 || nset.indexOf(_stripProclitic(sk)) >= 0) { tskel = sk; break; }
  }
  if (!tskel) return null;
  const cz = R.buildClozeForTarget(tokens, tskel);
  if (!cz) return null;
  let card = null;
  try { card = await R.resolveWordLight(tskel, cz.answer); } catch (_) { card = null; }
  if (!card || !card.lemmaKey || card.lemmaKey !== d.lemmaKey) return null;
  // unvocalized sentence → no niqqud discriminator for homographs → require a decisive resolve
  if (!_HEB_VOWELED_RE.test(cz.answer || '') && card.label !== 'exact') return null;
  return { cz, tskel, card, heN };
}
// Общая сборка кросс-текстовых айтемов из source-якорных строк (вынесено из startDueReview
// без изменения поведения; используется и P6.5 startPlanSectionTraining). R11: слово без
// якоря/предложения/cloze — честный skip, никогда не сфабрикованное задание.
// R2 (opts.ladder): слово без ОБСЛУЖИВАЕМОГО якоря идёт в лестницу heal-first: (1) батч-скан OPFS
// sentences → верифицированное предложение → полный контекстный айтем + write-back heal;
// (2) word-only fallback (независим от скан-бюджета — критика r4-1). opts: {ladder=true,
// scanBudget=12}. Каждый ярус под identity-гейтом канон-кейера; ничего не фабрикуется.
async function _buildDueSourcedItems(due, opts) {
  opts = opts || {};
  const ladder = opts.ladder !== false;
  const scanBudget = Number.isFinite(opts.scanBudget) ? opts.scanBudget : 12;
  const R = window.ReaderMorph, items = [], laddered = [];
  for (const d of due) {
    if (items.length >= TRAIN_N * 2) break;   // bound the fetch work; weakness-rank + slice below
    if (!d.source || !d.source.surface) { if (ladder) laddered.push(d); continue; }   // never-sourced → R2 ladder
    let sent = null;
    try { sent = await localDb.getSentenceForReview(d.source.sentenceId, d.source.textKey, d.source.orderIndex); } catch (_) { sent = null; }
    if (!sent) { if (ladder) laddered.push(d); continue; }   // dead anchor (deleted / re-import) → R2 ladder (re-heal)
    const heN = String(sent.he_niqqud || sent.he_plain || sent.he || '');
    if (!heN) { if (ladder) laddered.push(d); continue; }
    const cz = R.buildClozeForTarget(R.tokenize(heN), R.stripNiqqud(d.source.surface));
    if (!cz) { if (ladder) laddered.push(d); continue; }   // re-anchor mismatch → R2 ladder (re-heal)
    let card = null;
    try { card = await R.resolveWordLight(R.stripNiqqud(d.source.surface), cz.answer); } catch (_) {}
    // R11: a stored anchor is not exempt from the canonical identity gate. A stale anchor or
    // homograph must enter the same verified recovery ladder as a missing anchor.
    if (!card || card.lemmaKey !== d.lemmaKey || (!_HEB_VOWELED_RE.test(cz.answer || '') && card.label !== 'exact')) {
      if (ladder) laddered.push(d);
      continue;
    }
    items.push({
      lemmaKey: d.lemmaKey, surface: d.source.surface, niqqud: (card && card.niqqud) || cz.answer || '',
      gloss: (card && (card.meaning || card.gloss)) || '', root: (card && card.root) || '', pos: (card && card.pos) || '',
      status: d.status, _srs: d.srs, _source: d.source, _card: card || null,   // reuse in the D1 MC pre-compute
      _built: { cz, ru: sent.ru || '', sentence: heN, audioAssetKey: String(sent.audio_asset_key || ''), rowIdx: null },
    });
  }
  if (!ladder || !laddered.length) return items;
  // ── R2 ladder ────────────────────────────────────────────────────────────────────────────────
  const miss = _r2MissGet();
  const cand = [];   // {d, needle, needles[], pidEntry, scanned}
  for (const d of laddered) {
    if (cand.length >= TRAIN_N * 2) break;
    // R2.1: a pid: key names its paradigm in the shipped dict — the entry supplies the scan needles
    // AND a by-construction-honest word-only card (lemma+gloss+niqqud).
    const pidEntry = await _r2PidEntry(d.lemmaKey);
    const needle = (await _r2DeriveSurface(d.lemmaKey)) || (pidEntry ? R.stripNiqqud(String(pidEntry.lemma || pidEntry.lemma_niqqud || '')).trim() : null);
    if (needle || pidEntry) cand.push({ d, needle, needles: _r4NeedlesFor(needle, pidEntry), pidEntry, scanned: false });
  }
  // ONE batched prefilter pass; budget counts WORDS (their needle SETS ride in one 96-cap call — R4a)
  const scanNeedles = [];
  let scanWords = 0;
  for (const c of cand) {
    if (scanWords >= scanBudget || scanNeedles.length >= 90) break;
    if (!c.needles.length || _r2MissFresh(miss, c.d.lemmaKey)) continue;
    c.scanned = true; scanWords++;
    for (const n of c.needles) if (scanNeedles.indexOf(n) < 0) scanNeedles.push(n);
  }
  let scanRows = [];
  if (scanNeedles.length) { try { scanRows = (await localDb.findSentencesForWords(scanNeedles, 400)) || []; } catch (_) { scanRows = []; } }
  for (const c of cand) {
    if (items.length >= TRAIN_N * 2) break;
    const d = c.d, needle = c.needle;
    let served = null;
    // tier 1 — re-source scan: verified sentence → full contextual item + write-back heal
    if (c.scanned) {
      let hit = null;
      for (const row of scanRows) {
        const hp = String(row.he_plain || '');
        if (!c.needles.some((n) => hp.indexOf(n) >= 0)) continue;
        try { hit = await _r2VerifyCandidate(R, d, c.needles, row); } catch (_) { hit = null; }
        if (hit) { hit.row = row; break; }
      }
      if (hit) {
        // fillOnly for the never-sourced; a PROVEN-dead anchor is replaced outright (R11: verified > dead)
        const src = { textKey: hit.row.text_key || null, sentenceId: hit.row.id != null ? String(hit.row.id) : null,
          orderIndex: hit.row.order_index != null ? Number(hit.row.order_index) : null, surface: hit.tskel,
          fillOnly: !(d.source && d.source.surface) };
        try { await localDb.updateSrsSource(d.lemmaKey, src); } catch (_) {}
        served = {
          lemmaKey: d.lemmaKey, surface: hit.tskel, niqqud: hit.card.niqqud || hit.cz.answer || '',
          gloss: (hit.card.meaning || hit.card.gloss) || '', root: hit.card.root || '', pos: hit.card.pos || '',
          status: d.status, _srs: d.srs, _card: hit.card,
          _source: { textKey: src.textKey, sentenceId: src.sentenceId, orderIndex: src.orderIndex, surface: hit.tskel, title: hit.row.text_title || null },
          _built: { cz: hit.cz, ru: hit.row.ru || '', sentence: hit.heN, audioAssetKey: String(hit.row.audio_asset_key || ''), rowIdx: null },
        };
      } else { _r2MissMark(miss, d.lemmaKey); }   // v3: per-WORD miss (the needle set is derived)
    }
    // tier 2 — word-only fallback: independent of the scan budget (critique r4-1). _source pinned
    // to null (critique r11-4). Two honest identities:
    //   • pid: key → the shipped-dict paradigm entry IS the identity (marked to this exact pid at
    //     tap time); lemma + R1-verified gloss + vocalization come straight from the dataset (R2.1).
    //   • skel key → canonical-key round-trip + confident resolve ('exact' or the resolver's own
    //     confident 'function' class for particles — live-found R2.1) + non-empty gloss (r17-3).
    if (!served && c.pidEntry) {
      const e = c.pidEntry;
      const skel = R.stripNiqqud(String(e.lemma || e.lemma_niqqud || '')).trim();
      const gloss = String(e.meaning || '');
      if (skel && gloss) {
        served = {
          lemmaKey: d.lemmaKey, surface: skel, niqqud: e.lemma_niqqud || '',
          gloss, root: e.root || '', pos: e.pos || '',
          status: d.status, _srs: d.srs, _card: null, _source: null, _wordOnly: true,
          _built: { cz: { answer: e.lemma_niqqud || skel, segments: null }, ru: '', sentence: '', audioAssetKey: '', rowIdx: null },
        };
      }
    }
    if (!served && needle) {
      let card = null;
      try { card = await R.resolveWordLight(needle, ''); } catch (_) { card = null; }
      const gloss = card ? String(card.meaning || card.gloss || '') : '';
      if (card && card.lemmaKey === d.lemmaKey && (card.label === 'exact' || card.label === 'function') && gloss) {
        served = {
          lemmaKey: d.lemmaKey, surface: needle, niqqud: card.niqqud || '',
          gloss, root: card.root || '', pos: card.pos || '',
          status: d.status, _srs: d.srs, _card: card, _source: null, _wordOnly: true,
          _built: { cz: { answer: card.niqqud || needle, segments: null }, ru: '', sentence: '', audioAssetKey: '', rowIdx: null },
        };
      }
    }
    if (served) items.push(served);
  }
  return items;
}
// P6.5 (owner 2026-07-06: «работать по плану невозможно») — запуск тренировки ПО СЕКЦИИ
// плана наставника: те же кросс-текстовые механики, что startDueReview, но пул = item_keys
// секции (due-фильтра нет: gap-слова могут быть не просрочены), канал = рекомендация
// секции (если предложен капсами — иначе тренер честно откатится на 'read').
async function startPlanSectionTraining(itemKeys, channel) {
  ensureStudySheet();
  _studySheet.hidden = false; _studySheet.classList.add('room-study-open');
  _studyMode = 'train'; _trainSession = null;
  _studySetTitle('room.morph.study.trainTitle', 'Тренировка');
  roomFocusInto(_studySheet.querySelector('.room-study-card'));
  try { _studySheet.querySelectorAll('[data-study-mode]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-study-mode') === 'train')); } catch (_) {}
  try { _studyListChrome(false); } catch (_) {}
  const body = _studySheet.querySelector('.room-study-body');
  if (!body || !window.ReaderMorph) return;
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'room-study-loading', i18n: 'room.morph.study.loading', text: tt('room.morph.study.loading', 'Собираю…') }));
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  const keySet = new Set((itemKeys || []).map(String));
  let rows = [];
  // «все якорные слова расписания» = getDueWithSource с горизонтом-в-будущее (due<=горизонт)
  try { rows = (await localDb.getDueWithSource(Date.now() + 10 * 365 * 24 * 3600 * 1000)) || []; } catch (_) { rows = []; }
  // R2: ladder OFF — the plan section keeps its own honest anchor-less empty-state, and the section's
  // recommended channel assumed sentence context (gate-consumers-sweep, critique r11-5).
  const items = await _buildDueSourcedItems(rows.filter((d) => keySet.has(String(d.lemmaKey))), { ladder: false });
  if (!_studySheet || _studySheet.hidden) return;
  if (!items.length) {
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'room-study-empty', text: tt('room.cloud.planNoAnchors', 'У этих слов нет якорных предложений на этом устройстве — потренируйте их в своём тексте.') }));
    return;
  }
  if (channel) { try { trainChannelSet(channel); } catch (_) {} }
  await _launchTrainSession(items.slice(0, TRAIN_N), { cross: true });
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
  // Collect ALL buildable occurrences, richest-context first (token count desc, rowIdx asc) —
  // the previous behavior kept only the richest one.
  const cands = [];
  for (const o of (item.occ || [])) {
    const data = _trainRowData(o.rowIdx);
    if (!data) continue;
    const sent = String(data.he_niqqud || data.he || '');
    const cz = R.buildClozeForTarget(R.tokenize(sent), targetSkel);
    if (!cz) continue;   // target not present in this sentence (offset drift / wrong row) → unusable
    const ak = (readerRows[o.rowIdx] && readerRows[o.rowIdx]._v3_audioAssetKey) || '';   // D6/D2 — baked row audio
    cands.push({ cz, ru: data.ru, sentence: sent, rowIdx: o.rowIdx, audioAssetKey: ak, _count: R.words(sent).length });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b._count - a._count || a.rowIdx - b.rowIdx);
  // Retention P2 — anchor ROTATION (recon §6.5, R2 M4/encoding-specificity): serving the SAME
  // sentence on every review makes success measure sentence-memory, not word knowledge. Rotate
  // deterministically by reps: reps=0 keeps the richest context (unchanged first encounter),
  // each later review cycles to the next buildable occurrence. Single-occurrence words unchanged.
  const reps = (item._srs && Number(item._srs.reps)) || 0;
  return cands[reps % cands.length];   // { cz:{answer,segments,count}, ru, sentence, rowIdx, audioAssetKey } | null
}
function _trainProgressEl(s) {
  const retry = !!(s && s.retryPhase && s.idx >= s.retryStart);
  const current = retry ? (s.idx - s.retryStart + 1) : (s.idx + 1);
  const total = retry ? Math.max(1, s.total - s.retryStart) : Math.max(1, s.plannedTotal || s.total);
  const label = retry ? (tt('room.morph.study.reinforce', 'Закрепление') + ': ' + current + ' / ' + total) : (current + ' / ' + total);
  return el('div', { class: 'room-train-progress', text: label, attrs: {
    role: 'progressbar', 'aria-live': 'polite', 'aria-valuemin': '1', 'aria-valuemax': String(total),
    'aria-valuenow': String(current), 'aria-label': label, 'data-reinforcement': retry ? '1' : '0', dir: retry ? uiDirRoom() : 'ltr',
  } });
}
// D5 — light first-encounter teach panel. Writes NOTHING (not counted as recall); just seeds the word
// before its first scored test. Word + gloss + 🔊 + the word in its sentence (target VISIBLE) +
// «Подробнее» (reuses openWordCard) + «Понятно, проверь меня» (→ onTrainTeachDone → the scored test).
function renderTrainTeach(item) {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  const built = s._built;
  body.innerHTML = '';
  body.appendChild(_trainProgressEl(s));
  const box = el('div', { class: 'room-train-teach' });
  box.appendChild(el('div', { class: 'room-train-teach-tag', i18n: 'room.morph.study.teachNew', text: tt('room.morph.study.teachNew', '✦ Новое слово') }));
  const wordRow = el('div', { class: 'room-train-teach-wordrow' });
  wordRow.appendChild(el('span', { class: 'room-train-teach-word', attrs: { lang: 'he', dir: 'rtl' }, text: item.niqqud || item.surface }));
  wordRow.appendChild(el('button', { class: 'room-study-speak', text: '🔊', attrs: { type: 'button', 'data-train-speak': '1', 'data-he': item.niqqud || item.surface, 'aria-label': tt('room.morph.pronounce', 'Произнести') } }));
  box.appendChild(wordRow);
  if (item.gloss) box.appendChild(el('div', { class: 'room-train-teach-gloss', attrs: { dir: 'ltr' }, text: item.gloss }));
  if (built && built.sentence) {
    // sentence with its own 🔊 (plays the WHOLE sentence — reuses the data-train-rowspeak handler),
    // alongside the word-level 🔊 above. Owner request 2026-06-29.
    const ctxRow = el('div', { class: 'room-train-teach-ctxrow' });
    ctxRow.appendChild(el('span', { class: 'room-train-teach-ctx', attrs: { lang: 'he', dir: 'rtl' }, text: built.sentence }));
    ctxRow.appendChild(el('button', { class: 'room-study-speak room-train-rowspeak', text: '🔊', attrs: { type: 'button', 'data-train-rowspeak': '1', 'aria-label': tt('room.reader.readAloud', 'Озвучить строку') } }));
    box.appendChild(ctxRow);
  }
  if (built && built.ru) box.appendChild(el('div', { class: 'room-train-teach-ru', attrs: { dir: 'ltr' }, text: built.ru }));
  const actions = el('div', { class: 'room-train-actions' });
  actions.appendChild(el('button', { class: 'room-train-card', i18n: 'room.morph.study.expand', text: tt('room.morph.study.expand', 'Подробнее'), attrs: { type: 'button', 'data-train-card': '1' } }));
  actions.appendChild(el('button', { class: 'room-train-next', i18n: 'room.morph.study.teachReady', text: tt('room.morph.study.teachReady', 'Понятно, проверь меня'), attrs: { type: 'button', 'data-train-teach-done': '1' } }));
  box.appendChild(actions);
  body.appendChild(box);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
function onTrainTeachDone() {
  const s = _trainSession; if (!s) return;
  const item = s.items[s.idx]; if (!item) return;
  item._taught = true;   // seed shown → now render the scored test for this same word
  renderTrainItem();
}
// D6 — extraction-channel selector (📖 read · 🎧 listen · 🔤 reverse RU→HE · ✍️ dictate). A segment is
// disabled (with an honest hint) when its audio can't play (availableChannels). Auto-width buttons
// (escape the global button{width:100%} trap). i18n labels via tt().
const _TRAIN_CHANNELS = [
  { ch: 'read', key: 'room.morph.study.chRead', fb: '📖 Чтение' },
  { ch: 'listen', key: 'room.morph.study.chListen', fb: '🎧 Аудио' },
  { ch: 'reverse', key: 'room.morph.study.chReverse', fb: '🔤 RU→HE' },
  { ch: 'dictate', key: 'room.morph.study.chDictate', fb: '✍️ Диктант' },
];
function _trainChannelBar() {
  const s = _trainSession;
  const bar = el('div', { class: 'room-train-channels', attrs: { dir: uiDirRoom(), role: 'tablist' } });
  _TRAIN_CHANNELS.forEach((c) => {
    const avail = !s.channels || s.channels[c.ch];
    const b = el('button', { class: 'room-train-chseg' + (s.channel === c.ch ? ' on' : '') + (avail ? '' : ' disabled'),
      i18n: c.key, text: tt(c.key, c.fb), attrs: { type: 'button', 'data-train-channel': c.ch, role: 'tab',
        'aria-selected': String(s.channel === c.ch), tabindex: s.channel === c.ch ? '0' : '-1' } });
    if (!avail) { b.disabled = true; b.title = tt('room.morph.study.chNoAudio', 'Нужен голос иврита или ключ TTS'); }
    bar.appendChild(b);
  });
  return bar;
}
function onTrainChannel(c) {
  const s = _trainSession; if (!s) return;
  if (s.channels && !s.channels[c]) return;   // disabled channel — ignore
  if (s.channel === c) return;
  // Switching the task while the same answer is still live exposes a second prompt modality.
  // Preserve that provenance so a later typed dictation cannot be recorded as unsupported
  // production after the learner has already seen the written/context-supported prompt.
  if (!s.answered) s._crossChannelExposure = true;
  s.channel = c; trainChannelSet(c);
  _stopTrainAudio();   // don't let the previous channel's audio keep playing
  // Re-pose the CURRENT word in the new channel ONLY if it hasn't been answered yet — re-rendering an
  // already-answered item would reset `answered` and let it be scored twice (double-counting recall +
  // the D7 streak). After an answer, the new channel simply takes effect from the NEXT item.
  if (!s.answered) renderTrainItem();
}
function renderTrainItem() {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  if (s.idx >= s.total) return renderTrainSummary();
  _stopTrainAudio();   // D6 — a new question must not overlap the previous item's audio
  s.answered = false;
  const item = s.items[s.idx];
  if (s._exposureItemIdx !== s.idx) {
    s._exposureItemIdx = s.idx;
    s._crossChannelExposure = false;
  }
  const built = item._built || _trainBuildCloze(item);
  if (!built) { s.idx++; return renderTrainItem(); }   // safety (items were pre-filtered to buildable)
  s._built = built;
  // D5 — teach-before-test: a NEW word never recall-tested (no srs row) gets a brief teach FIRST (form +
  // gloss + 🔊 + the word in its sentence) so the first encounter isn't a cold guess. The show writes
  // NOTHING (R2: not counted as recall); the following test scores normally. _taught guards re-render.
  if (item.status === 'new' && !item._srs && !item._taught) { return renderTrainTeach(item); }
  // R2 word-only (no context sentence on this device): the sentence-dependent channels can't pose
  // this item — read/listen degrade to the reverse prompt (gloss = question), dictate stays ONLY
  // when the answer is vocalized (TTS of a bare skeleton could voice a different homograph —
  // critique r4-4). The EFFECTIVE channel is per-item state so the review_log row and the D1
  // grade policy describe what actually happened (R17), not what the bar shows.
  const wordOnly = !!item._wordOnly;
  let channel = s.channel || 'read';
  if (wordOnly && (channel === 'read' || channel === 'listen')) channel = 'reverse';
  if (wordOnly && channel === 'dictate' && !/[֑-ׇ]/.test(String(built.cz.answer || ''))) channel = 'reverse';
  s._effChannel = channel;
  // Escalation ladder: MC (recognition) for new/l1/l2 · tap-letters (assisted production, mobile-OK)
  // for l3/l4 · free typing (top production tier) only for known. A5 — too few honest distractors →
  // fall back to tap-letters (not free typing — keyboard-free on mobile).
  const trainingStage = item._trainingStage || item.status || 'new';
  let mode = window.ReaderMorph.isMcLevel(trainingStage) ? 'mc' : (trainingStage === 'known' ? 'type' : 'tiles');
  // R2 word-only: free typing rejects valid paradigm forms the gloss-only prompt licenses (an
  // infinitive answer to a verb gloss — critique r17-4) → tiles steer to the target's own letters.
  // A bare (unvocalized) answer among vocalized MC options is a visual tell → tiles (critique r4-5).
  if (wordOnly && mode === 'type') mode = 'tiles';
  if (wordOnly && mode === 'mc' && !/[֑-ׇ]/.test(String(built.cz.answer || ''))) mode = 'tiles';
  let distractors = [];
  // R2 word-only: the slot-MC bank ranks same-root/gloss-near rivals FIRST — with no sentence to
  // disambiguate, a rival that also translates the gloss is a false negative → skip slotMc and use
  // the B1 pool with an RU-gloss-overlap veto (critique r17-5).
  const slotMc = (mode === 'mc' && !wordOnly && item._mcOptions && item._mcOptions.options && item._mcOptions.options.length >= 3) ? item._mcOptions : null;
  if (mode === 'mc' && !slotMc) {
    distractors = window.ReaderMorph.pickDistractors(item, s.pool, 3);
    if (wordOnly) distractors = distractors.filter((dd) => !_r2GlossOverlap(item.gloss, dd.gloss));
    if (distractors.length < 3) mode = 'tiles';
  }
  // D6 — extraction channels share the answer/grading machinery; ONLY the PROMPT differs. Dictation
  // (hear → write) is inherently production → never MC (drop to tap-letters even for a fresh word).
  if (channel === 'dictate' && mode === 'mc') mode = 'tiles';
  s._mode = mode;
  s._questionShownAt = Date.now();
  body.innerHTML = '';
  body.appendChild(_trainChannelBar());   // D6 — read/listen/reverse/dictate selector (availability-gated)
  if (s._saveError) {
    body.appendChild(el('div', { class: 'room-train-saveerror', attrs: { role: 'alert' },
      i18n: 'room.morph.study.saveError', text: tt('room.morph.study.saveError', 'Не удалось сохранить ответ. Проверь соединение с локальной памятью и попробуй ещё раз.') }));
    s._saveError = false;
  }
  // R2 word-only: the bar may show 📖/🎧 while this item poses as RU→HE — say WHY per-item, so a
  // silent modality flip never reads as «audio is broken» (critique r4-4).
  if (wordOnly) {
    body.appendChild(el('div', { class: 'room-train-wordonly-note', attrs: { dir: uiDirRoom() }, i18n: 'room.morph.study.wordOnlyNote',
      text: tt('room.morph.study.wordOnlyNote', '🔤 Без контекста: у этого слова пока нет предложения на этом устройстве — оно появится после чтения его текста.') }));
  }
  body.appendChild(_trainProgressEl(s));
  // ── per-channel PROMPT ────────────────────────────────────────────────────────────────────────────
  if (channel === 'listen') {
    // hear the sentence (baked audio when present, else TTS), NO written Hebrew → map sound to form.
    const au = el('div', { class: 'room-train-audioprompt' });
    au.appendChild(el('button', { class: 'room-train-bigplay', text: '🔊', attrs: { type: 'button', 'data-train-listen-row': '1', 'aria-label': tt('room.morph.study.replay', 'Прослушать ещё раз') } }));
    au.appendChild(el('span', { class: 'room-train-audiohint', i18n: 'room.morph.study.listenHint', text: tt('room.morph.study.listenHint', '🎧 Прослушай предложение') }));
    body.appendChild(au);
    try { _playSentenceAudio(built); } catch (_) {}   // auto-play once on render (baked asset → TTS fallback)
  } else if (channel === 'dictate') {
    // hear the ISOLATED word (vocalized TTS) → write it. Pure listening + spelling.
    const au = el('div', { class: 'room-train-audioprompt' });
    au.appendChild(el('button', { class: 'room-train-bigplay', text: '🔊', attrs: { type: 'button', 'data-train-listen-word': '1', 'aria-label': tt('room.morph.study.replay', 'Прослушать ещё раз') } }));
    au.appendChild(el('span', { class: 'room-train-audiohint', i18n: 'room.morph.study.dictateHint', text: tt('room.morph.study.dictateHint', '✍️ Прослушай и впиши слово') }));
    body.appendChild(au);
    // play the sentence-INFLECTED vocalized form (built.cz.answer) — it matches what the reveal shows and
    // what the guarded read-answer path grades against (item.niqqud can differ / be empty).
    try { speakWord(built.cz.answer || item.niqqud || item.surface || ''); } catch (_) {}   // auto-play once
  } else if (channel === 'reverse') {
    // RU→HE production: the meaning is the question, NO Hebrew shown → produce/recognize the Hebrew. NOTE:
    // MC distractors are the sentence-slot morpho-honest set; a distractor that is ALSO a valid translation
    // of the gloss would be a synonym false-negative — bounded (same root/POS) + the reveal is honest (R11).
    body.appendChild(el('div', { class: 'room-train-reverseprompt', i18n: 'room.morph.study.reverseHint', text: tt('room.morph.study.reverseHint', '🔤 Вспомни слово на иврите') }));
  } else {
    // read (default) — cloze sentence (vocalized), blank EVERY copy of the target (A2) + 🔊 row-audio
    // playing the WHOLE sentence (owner decision A7: full audio incl. the target, as a hint).
    const clozeWrap = el('div', { class: 'room-train-clozewrap' });
    const cloze = el('div', { class: 'room-train-cloze', attrs: { dir: 'rtl', lang: 'he' } });
    (built.cz.segments || []).forEach((seg) => {
      if (seg.blank) cloze.appendChild(el('span', { class: 'room-train-blank', text: ' ____ ', attrs: { 'aria-label': tt('room.morph.study.blank', 'пропуск') } }));
      else cloze.appendChild(el('span', { text: seg.t }));
    });
    clozeWrap.appendChild(cloze);
    clozeWrap.appendChild(el('button', { class: 'room-study-speak room-train-rowspeak', text: '🔊', attrs: { type: 'button', 'data-train-rowspeak': '1', 'aria-label': tt('room.reader.readAloud', 'Озвучить строку') } }));
    body.appendChild(clozeWrap);
  }
  // prompt = lemma gloss (the meaning anchor — for 'reverse' this IS the question) …
  body.appendChild(el('div', { class: 'room-train-prompt', attrs: { dir: 'ltr' }, text: '✎ ' + (item.gloss || tt('room.morph.study.recall', 'вспомни слово')) }));
  // … PLUS the full row translation (sense context; for reverse it disambiguates which Hebrew word; for
  // listen/dictate it anchors meaning→form). The Hebrew form itself is never leaked here.
  if (built.ru) body.appendChild(el('div', { class: 'room-train-ctxq', attrs: { dir: 'ltr' }, text: built.ru }));
  if (mode === 'mc') {
    // D1 — when slot-inflected options exist, ALL 4 are bare slot forms (correct + distractors), so no
    // proclitic/inflection tell; correctness is flagged (data-correct), not string-matched. Else B1.
    const opts = slotMc
      ? [{ he: slotMc.correctHe, correct: true }].concat(slotMc.options.slice(0, 3).map((he) => ({ he, correct: false })))
      : [{ key: item.lemmaKey, he: built.cz.answer, correct: true }].concat(
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
  checkTrainAnswer(correct, false, 'mc');
}
async function onTrainSubmit() {
  if (!_trainSession || _trainSession.answered || _trainSession._checking) return;
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
  // Wave-2 G0: read remains proclitic-tolerant, but only behind resolver-backed SAME-lemma
  // identity. The old unconditional one-letter strip accepted lexical collisions (כלב→לב).
  // Fail closed when resolver/key is unavailable; every non-read typed channel is strict here too.
  _trainSession._checking = true;
  let correct = false;
  try {
    const family = String(_trainSession._effChannel || _trainSession.channel || 'read');
    correct = family === 'read'
      ? !!(window.ReaderMorph && window.ReaderMorph.acceptReadAnswer &&
          await window.ReaderMorph.acceptReadAnswer([built.cz.answer, item.surface, item.niqqud], val, item.lemmaKey))
      : !!(window.ReaderMorph && window.ReaderMorph.acceptStrictAnswer &&
          window.ReaderMorph.acceptStrictAnswer(built.cz.answer, val));
  } catch (_) { correct = false; }
  finally { if (_trainSession) _trainSession._checking = false; }
  if (target) target.classList.add(correct ? 'room-train-ok' : 'room-train-bad');
  checkTrainAnswer(correct, false, buildEl ? 'tiles' : 'typed');
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
  if (!_trainSession || _trainSession.answered || _trainSession._checking) return;
  const grid = _studySheet && _studySheet.querySelector('.room-train-opts');
  if (grid) grid.querySelectorAll('.room-train-opt').forEach((b) => { if (b.getAttribute('data-correct') === '1') b.classList.add('room-train-ok'); b.disabled = true; });
  const inp = _studySheet && _studySheet.querySelector('[data-train-input]');
  if (inp) inp.disabled = true;
  checkTrainAnswer(false, true);
}
async function checkTrainAnswer(correct, skipped, mode) {
  const s = _trainSession; if (!s || s.answered) return;
  s.answered = true;
  const item = s.items[s.idx];
  const now = Date.now();   // ONE timestamp for schedule + log — the log row must describe exactly this step
  // D1 (CLG-P6 prep, AI_MENTOR_RECON §14): channel-aware грейд — production-провал
  // (dictate/reverse) на рецептивно-сильном слове = Hard(2), не Again(1). Решение ДО шага
  // планировщика; schedule И log-строка используют ОДИН policy-грейд (иначе оракул
  // replay==stored разошёлся бы). Политика детерминированная (grade-policy.js, общая с
  // сервером); explicit production skip на receptively-strong слове = Hard(2), а отсутствие
  // ответа/timeout остаётся MNAR и сюда не попадает (owner G0-D1, 2026-07-15).
  // R2: the EFFECTIVE channel (word-only items degrade read/listen→reverse at render) — the log
  // row and the D1 policy must describe the modality that actually posed the question (R17).
  const actualMode = String(mode || s._mode || 'unknown');
  const effectiveChannel = String(s._effChannel || s.channel || 'read');
  const trainChannel = effectiveChannel + ':' + actualMode;
  let evidenceScope = item._wordOnly ? 'lexeme'
    : (window.GradePolicy && window.GradePolicy.evidenceScopeFor
      ? window.GradePolicy.evidenceScopeFor(effectiveChannel, actualMode)
      : 'context_supported');
  if (s._crossChannelExposure && evidenceScope === 'unsupported_production') evidenceScope = 'context_supported';
  let d1 = null, logRows = [];
  if (window.GradePolicy) {
    try { logRows = await localDb.getReviewLog(item.lemmaKey); } catch (_) {}
    // P7.0a: аннулированные строки — не свидетельство для D1 (иначе отменённый
    // production-успех навсегда отключал бы Hard-смягчение, а write-time порча
    // ложилась бы в append-only лог неисправимо — критика wf_1bf34023).
    try { if (window.FsrsCore && window.FsrsCore.withoutAnnulled) logRows = window.FsrsCore.withoutAnnulled(logRows); } catch (_) {}
    d1 = window.GradePolicy.decideGrade({ correct, skipped, channel: trainChannel, evidenceScope, prevState: item._srs, rows: logRows });
  }
  // Retention P2 — FSRS is the scheduler (owner go after the P1.5 shadow-diff): the ONE handover
  // step resumes an fsrs-owned word or lazy-seeds a legacy SM2 row (seed materialized in the log
  // below). If FsrsCore didn't load, fall back to legacy SM2-lite — the row honestly stays
  // scheme=sm2-lite, nothing half-converts (и D1-грейд тогда честно не применяется: у SM2 нет Hard).
  const fs = window.ReaderMorph.fsrsStep ? window.ReaderMorph.fsrsStep(window.FsrsCore, item._srs, d1 ? d1.grade : correct, now) : null;
  const grade = (fs && d1) ? d1.grade : (correct ? 3 : 1);
  const sched = fs ? fs.sched : window.ReaderMorph.nextSrs(item._srs, correct, now);
  // The exercise ladder is replayable evidence state, not a hidden mutation of the user's manual
  // word mark. Legacy training emitted a following `mark` row; new training records its stage on
  // the grade event itself. A later manual mark wins in the ordered fold at session load.
  const trainingStage = window.ReaderMorph.nextLevel(item._trainingStage || item.status || 'new', !!correct);
  // R12 premium-release write: event + projection + source are one local transaction. The asserted
  // manual status is deliberately untouched; a training answer is not a user-authored mark.
  const LC = window.LemmaCanon;
  let commitResult = { committed: false, error: 'REVIEW_COMMIT_UNAVAILABLE' };
  if (LC && item.lemmaKey && localDb.commitReviewAttempt) {
    const row = {
      item_key: item.lemmaKey,
      kind: skipped ? 'skip' : 'review',
      reviewed_at: new Date(now).toISOString(),
      grade,
      source: s.cross ? 'room-due-queue' : 'room-recall',
      channel: trainChannel,
      latency_ms: Math.max(0, now - (Number(s._questionShownAt) || now)),
      meta: {
        surface: item.surface || undefined,
        pos: item.pos || undefined,
        keyer_version: LC.KEYER_VERSION,
        scheduler: fs
          ? { scheme: 'fsrs', engine_version: window.FsrsCore.ENGINE_VERSION, request_retention: window.FsrsCore.REQUEST_RETENTION }
          : { scheme: 'sm2-lite' },
        postTeach: item._taught ? 1 : undefined,
        word_only: item._wordOnly ? 1 : undefined,
        evidence_scope: evidenceScope,
        training_stage: trainingStage,
        ...((fs && d1 && d1.applied) ? window.GradePolicy.policyMeta(d1) : {}),
      },
    };
    row.id = LC.reviewId(row);
    let seedRow = null;
    if (fs && fs.seeded) {
      const seedMeta = { ...fs.seedMeta, keyer_version: LC.KEYER_VERSION };
      seedRow = {
        id: LC.seedId ? LC.seedId(item.lemmaKey, seedMeta) : ('seed:' + item.lemmaKey),
        item_key: item.lemmaKey, kind: 'seed', reviewed_at: new Date(now - 1).toISOString(),
        grade: null, source: 'seed-sm2', meta: seedMeta,
      };
    }
    try { commitResult = await localDb.commitReviewAttempt({ row, seedRow, sched, source: item._source || null }); }
    catch (_) { commitResult = { committed: false, error: 'REVIEW_COMMIT_FAILED' }; }
  }
  if (!commitResult || !commitResult.committed) {
    s.answered = false;
    s._saveError = true;
    renderTrainItem();
    return;
  }
  item._srs = sched;
  item._trainingStage = trainingStage;
  if (correct) s.correct++;
  const moved = '';
  if ((!correct || skipped) && !item._retryAttempt && !item._retryQueued) {
    item._retryQueued = true;
    s.retryQueue.push(item);
  }
  // D7 — count this as a GENUINE recall toward today's goal/streak. A retrieval ATTEMPT counts whether
  // right or wrong (a failed attempt still aids memory — testing effect); only a SKIP (refusing to try) is
  // a soft no-recall and earns nothing (reuses «show≠recall»; teach-views write nothing either). Pass the
  // genuinely-due count (NOT s.total) so the per-day MAX never re-inflates available with padding. Awaited
  // so the session-summary's fresh ledger read can't race a step behind this write.
  if (!skipped) { try { await localDb.recordRecall(_localDayStr(), s.dueAvail || 0); } catch (_) {} }
  _asdCache = null;   // R3.3 — the merged streak fold must see THIS answer immediately
  morphHost.invalidateWordStates();
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}   // repaint the reader behind
  try { refreshDueBadge(); } catch (_) {}    // D3/D7 — schedule + ledger changed → badge + streak stay fresh for the summary
  // D4 — leech: this word has now been missed enough times → gently offer «отметить ignore?» (not yet ignored).
  const isLeech = !!(sched && (Number(sched.lapses) || 0) >= LEECH_LAPSES) && item.status !== 'ignore';
  renderTrainReveal(correct, moved, skipped, isLeech);
}
function renderTrainReveal(correct, moved, skipped, isLeech) {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  const item = s.items[s.idx], built = s._built;
  const cls = skipped ? 'room-train-reveal-skip' : (correct ? 'room-train-reveal-ok' : 'room-train-reveal-bad');
  const rev = el('div', { class: 'room-train-reveal ' + cls, attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  rev.appendChild(el('div', { class: 'room-train-verdict', text: skipped ? tt('room.morph.study.skipped', '— Пропущено') : (correct ? tt('room.morph.study.correct', '✓ Верно') : tt('room.morph.study.wrong', '✗ Неверно')) }));
  const ansRow = el('div', { class: 'room-train-ansrow' });
  ansRow.appendChild(el('span', { class: 'room-train-ans', attrs: { lang: 'he', dir: 'rtl' }, text: built.cz.answer }));
  ansRow.appendChild(el('button', { class: 'room-study-speak', text: '🔊', attrs: { type: 'button', 'data-train-speak': '1', 'data-he': built.cz.answer, 'aria-label': tt('room.morph.pronounce', 'Произнести') } }));
  rev.appendChild(ansRow);
  if (item.gloss) rev.appendChild(el('div', { class: 'room-train-ansgloss', attrs: { dir: 'ltr' }, text: item.gloss }));
  // D6 — for audio/reverse channels the Hebrew sentence wasn't shown in the question; reveal it now so the
  // learner sees the word in its context (read mode already showed it, so skip there to avoid repetition).
  if (s.channel && s.channel !== 'read' && built && built.sentence) {
    rev.appendChild(el('div', { class: 'room-train-revealsent', attrs: { dir: 'rtl', lang: 'he' }, text: built.sentence }));
  }
  if (moved && moved.indexOf('→') >= 0) rev.appendChild(el('div', { class: 'room-train-moved', text: moved }));
  if (built.ru) rev.appendChild(el('div', { class: 'room-train-ctx', attrs: { dir: 'ltr' }, text: built.ru }));
  if (item._source && item._source.textKey && item._source.orderIndex != null) {
    const sourceBox = el('div', { class: 'room-train-source', attrs: { dir: uiDirRoom() } });
    sourceBox.appendChild(el('span', { class: 'room-train-source-label', text: tt('room.morph.study.sourceFrom', 'Источник') + (item._source.title ? ': ' + item._source.title : '') }));
    sourceBox.appendChild(el('button', { class: 'room-train-source-open', i18n: 'room.morph.study.openSource',
      text: tt('room.morph.study.openSource', 'Открыть в тексте'), attrs: { type: 'button', 'data-train-source': '1' } }));
    rev.appendChild(sourceBox);
  }
  // D4 — leech nudge: soft, opt-in (reuses setWordStatus; never auto-ignores).
  if (isLeech) {
    const leech = el('div', { class: 'room-train-leech', attrs: { dir: uiDirRoom() } });
    leech.appendChild(el('span', { class: 'room-train-leech-k', i18n: 'room.morph.study.leechHint', text: tt('room.morph.study.leechHint', 'Часто ошибаешься в этом слове.') }));
    leech.appendChild(el('button', { class: 'room-train-leech-btn', i18n: 'room.morph.study.leechIgnore', text: tt('room.morph.study.leechIgnore', '🚫 Игнорировать'), attrs: { type: 'button', 'data-train-leech': '1' } }));
    rev.appendChild(leech);
  }
  const actions = el('div', { class: 'room-train-actions' });
  actions.appendChild(el('button', { class: 'room-train-card', i18n: 'room.morph.study.expand', text: tt('room.morph.study.expand', 'Подробнее'), attrs: { type: 'button', 'data-train-card': '1' } }));
  actions.appendChild(el('button', { class: 'room-train-next', text: tt('room.morph.study.next', 'Дальше →'), attrs: { type: 'button', 'data-train-next': '1' } }));
  rev.appendChild(actions);
  body.appendChild(rev);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  try { rev.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  const nextButton = rev.querySelector('[data-train-next]');
  if (nextButton) { try { nextButton.focus(); } catch (_) {} }
}
// D4 — leech: user accepted the nudge → mark the word «ignore» (reuses setWordStatus; plain set keeps any
// srs schedule via UPSERT). Repaints the wall + refreshes the due badge; the nudge becomes a confirmation.
async function onTrainLeechIgnore(box) {
  const s = _trainSession; if (!s) return;
  const item = s.items[s.idx]; if (!item) return;
  try { await localDb.setWordStatus(item.lemmaKey, 'ignore'); } catch (_) {}
  item.status = 'ignore';
  morphHost.invalidateWordStates();
  try { invalidateReadableSet(); } catch (_) {}
  try { applyDecorations(); } catch (_) {}
  try { refreshDueBadge(); } catch (_) {}
  if (box) { box.innerHTML = ''; box.appendChild(el('span', { class: 'room-train-leech-done', i18n: 'room.morph.study.leechDone', text: tt('room.morph.study.leechDone', 'Отмечено: игнор') })); }
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
function onTrainCard() {
  const s = _trainSession; if (!s || !s._built) return;
  const item = s.items[s.idx];
  try { window.ReaderMorph.openWordCard(item.surface || s._built.cz.answer, s._built.cz.answer); } catch (_) {}
}
async function onTrainSource() {
  const s = _trainSession, item = s && s.items[s.idx], src = item && item._source;
  if (!src || !src.textKey || src.orderIndex == null) return;
  let row = null;
  try {
    const rows = await localDb.dbQuery('SELECT id, title FROM texts WHERE text_key = ? LIMIT 1', [String(src.textKey)]);
    row = rows && rows[0];
  } catch (_) {}
  if (!row) { roomToast(tt('room.morph.study.sourceMissing', 'Исходный текст недоступен на этом устройстве.')); return; }
  closeStudySheet();
  openReader(row.id, row.title, { scrollToOrderIndex: Number(src.orderIndex) });
}
function onTrainNext() {
  if (!_trainSession) return;
  _trainSession.idx++;
  if (_trainSession.idx >= _trainSession.items.length && !_trainSession.retryPhase && _trainSession.retryQueue.length) {
    const retries = _trainSession.retryQueue.splice(0);
    retries.forEach((item) => { item._retryAttempt = true; item._retryQueued = false; });
    _trainSession.retryPhase = true;
    _trainSession.retryStart = _trainSession.items.length;
    _trainSession.items = _trainSession.items.concat(retries);
    _trainSession.total = _trainSession.items.length;
  }
  renderTrainItem();
}
function renderTrainSummary() {
  const s = _trainSession, body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!s || !body) return;
  if (!s._completionSyncQueued) {
    s._completionSyncQueued = true;
    try { roomCloudMaybeResync(true); } catch (_) {}
  }
  body.innerHTML = '';
  if (!s.total) {
    body.appendChild(el('div', { class: 'room-study-empty', i18n: 'room.morph.study.trainEmpty', text: tt('room.morph.study.trainEmpty', 'Нет слов для тренировки на этом экране — отметь слова в «Список».') }));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    return;
  }
  const box = el('div', { class: 'room-train-summary' });
  box.appendChild(el('div', { class: 'room-train-score', text: tt('room.morph.study.done', 'Готово') + ': ' + s.correct + ' / ' + s.total }));
  if (s.retryStart >= 0) box.appendChild(el('div', { class: 'room-train-levelups', text: tt('room.morph.study.reinforced', 'Повторно закреплено') + ': ' + (s.total - s.retryStart) }));
  // D7 — soft streak / daily-goal payoff (the emotional reward only for users who engaged). Filled async
  // from the study_day ledger; respects the off-switch. Groups are nowrap → break only at the logical
  // boundary (invariant #7). Plain textContent so applyI18n never clobbers the numbers.
  const streakSlot = el('div', { class: 'room-train-streakslot' });
  box.appendChild(streakSlot);
  (async () => {
    try {
      if (streakHidden() || !window.ReaderMorph || !window.ReaderMorph.streakView || !localDb.getStudyDays) return;
      if (!streakSlot.isConnected) return;
      const sv = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), window.ReaderMorph.STREAK_GOAL_CAP, _localDayStr());   // R3.3 all-surface
      if (!streakSlot.isConnected || !sv || (!sv.cur && !sv.todayRecalls)) return;
      const line = el('div', { class: 'room-train-streak', attrs: { dir: uiDirRoom(), role: 'button', tabindex: '0', 'data-heatmap-toggle': '1', 'aria-label': tt('room.morph.study.heatToggle', 'Календарь активности') } });
      const g1 = el('span', { class: 'rts-g rts-flame' }); g1.textContent = '🔥 ' + sv.cur + ' ' + tt('room.morph.study.streakDays', 'дн.'); line.appendChild(g1);
      const g2 = el('span', { class: 'rts-g' });
      if (sv.todayRest) g2.textContent = tt('room.morph.study.streakRest', 'день отдыха — зачтено ✓');
      else if (sv.todayQualified) g2.textContent = tt('room.morph.study.goalDone', 'цель дня выполнена ✓');
      else g2.textContent = tt('room.morph.study.today', 'сегодня') + ' ' + sv.todayRecalls + '/' + (sv.todayGoal > 0 ? sv.todayGoal : sv.cap);
      line.appendChild(g2);
      if (sv.best > sv.cur) { const g3 = el('span', { class: 'rts-g rts-best' }); g3.textContent = tt('room.morph.study.streakBest', 'рекорд') + ': ' + sv.best; line.appendChild(g3); }
      line.appendChild(el('span', { class: 'rts-g rts-cal', text: '📅' }));   // D7.1 — tap → activity heatmap sheet
      streakSlot.appendChild(line);
    } catch (_) {}
  })();
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
  // D7 — premium off-switch (always reachable from the summary): hide the streak entirely for learners
  // who find streak pressure counterproductive (the Anki crowd) — the visible opt-out IS the anti-dark-pattern.
  box.appendChild(el('button', { class: 'room-train-streaktoggle', attrs: { type: 'button', 'data-streak-toggle': '1' },
    text: streakHidden() ? tt('room.morph.study.streakShow', '🔥 Показать стрик') : tt('room.morph.study.streakHide', '🔥 Скрыть стрик') }));
  body.appendChild(box);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

// D7.1 — month/contribution heatmap (GitHub-style: 7 weekday rows × week columns) of study-day activity
// via the pure ReaderMorph.studyHeatmap fold. Honest: rest-days (engaged, nothing due) marked distinctly,
// never as 0; today ringed. The grid builder is reused by the bottom-sheet below.
function buildHeatmapGrid(hm) {
  const wrap = el('div', { class: 'room-heatmap' });
  const grid = el('div', { class: 'room-heatmap-grid' });
  if (hm.cells.length) for (let p = 0; p < hm.cells[0].dow; p++) grid.appendChild(el('span', { class: 'rhm-cell rhm-pad' }));   // align col 1 to the first cell's weekday
  for (const c of hm.cells) {
    const cell = el('span', { class: 'rhm-cell rhm-l' + c.level + (c.isToday ? ' rhm-today' : '') + (c.rest ? ' rhm-rest' : '') });
    cell.title = c.day + (c.active ? ' · ' + c.recalls : (c.rest ? ' · ' + tt('room.morph.study.heatRest', 'отдых') : ''));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  const sum = el('div', { class: 'room-heatmap-sum', attrs: { dir: uiDirRoom() } });
  sum.textContent = hm.activeDays + ' ' + tt('room.morph.study.heatActiveDays', 'активных дней') + ' · ' + hm.totalRecalls + ' ' + tt('room.morph.study.heatRecalls', 'повторений');
  wrap.appendChild(sum);
  const leg = el('div', { class: 'room-heatmap-legend' });
  leg.appendChild(el('span', { class: 'rhm-leg-t', text: tt('room.morph.study.heatLess', 'меньше') }));
  for (let l = 0; l <= 3; l++) leg.appendChild(el('span', { class: 'rhm-cell rhm-l' + l }));
  leg.appendChild(el('span', { class: 'rhm-leg-t', text: tt('room.morph.study.heatMore', 'больше') }));
  wrap.appendChild(leg);
  return wrap;
}
// D7.1 — premium bottom-sheet for the activity heatmap. Reachable from the streak (home + study sheet)
// AND the «📚 Учить» header (always, even with no streak → honest empty state). Mirrors openFinishedAllSheet.
let _heatmapSheetOpen = false;
async function openStudyHeatmap() {
  if (_heatmapSheetOpen) return; _heatmapSheetOpen = true;
  try {
  let rows = [];
  try { rows = await _allSurfaceStudyDays(); } catch (_) { rows = []; }   // R3.3 — the calendar shows EVERY surface's days
  const hm = (window.ReaderMorph && typeof window.ReaderMorph.studyHeatmap === 'function')
    ? window.ReaderMorph.studyHeatmap(rows, _localDayStr(), 84)
    : { cells: [], activeDays: 0, totalRecalls: 0 };
  const ov = el('div', { class: 'list-picker-ov heatmap-sheet-ov' });
  const box = el('div', { class: 'list-picker heatmap-sheet' });
  box.appendChild(el('div', { class: 'list-picker-title', text: '📅 ' + tt('room.morph.study.heatTitle', 'Календарь активности') }));
  const bodyWrap = el('div', { class: 'heatmap-sheet-body' });
  if (!hm.activeDays) bodyWrap.appendChild(el('div', { class: 'heatmap-empty', attrs: { dir: uiDirRoom() }, text: tt('room.morph.study.heatEmpty', 'Пока нет занятий. Пройди тренировку «🎯» — и дни активности появятся здесь календарём.') }));
  else bodyWrap.appendChild(buildHeatmapGrid(hm));
  box.appendChild(bodyWrap);
  const close = () => { _heatmapSheetOpen = false; try { ov.remove(); } catch (_) {} document.removeEventListener('keydown', onKey); };
  const done = el('button', { class: 'list-picker-done', attrs: { type: 'button' } }); done.textContent = tt('room.corpus.lists.done', 'Готово');
  done.addEventListener('click', close);
  box.appendChild(done);
  ov.appendChild(box);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  try { done.focus(); } catch (_) {}
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) { _heatmapSheetOpen = false; }   // build failed before the sheet wired its close → never wedge the guard
}

// ── note-formation: turn a tapped word into a word_study note (the «превращение») ──
// Reuses the Studio pipeline (NotesAutoGen.dedupKey + localDb canonical-note API). The
// card (reader-morph) calls lookupNote on open + saveWord on «Сохранить». Idempotent
// (one canonical note per lemma; re-save just adds an occurrence).
// Тела заметочного глю переехали в morph-host.js (одна реализация на обе поверхности).
const roomNoteBody = (card) => morphHost.noteBody(card);
const roomDedupKey = (card) => morphHost.dedupKey(card);
const roomLookupNote = (card) => morphHost.lookupNote(card);
const roomLoadWordNote = (card) => morphHost.loadWordNote(card);
const roomSaveWord = (card, occ) => morphHost.saveWord(card, occ);
// T-b — manual translation for out-of-dict / unknown words. The card surfaces an editor
// when the resolver has no offline gloss; the user's own meaning lands in the SAME canonical
// word_study note (so it syncs to Anki + counts toward i+1), tagged meaning_source='user' so
// the card can mark it «ваш» (R9 provenance ≠ machine) and the resolver re-surfaces it on
// re-open. The dedup key is meaning-independent (pid:/lemma#pos), so lookup stays stable.
const roomLookupUserMeaning = (card) => morphHost.lookupUserMeaning(card);
const roomSaveUserMeaning = (card, occ, meaning) => morphHost.saveUserMeaning(card, occ, meaning);
const roomSaveWordPersonal = (card, occ, fields) => morphHost.saveWordPersonal(card, occ, fields);

let _roomToastEl = null, _roomToastT = null;
// roomToast(msg) — plain transient toast. roomToast(msg, actionLabel, actionFn) — FB-4: an
// «Отменить»-style action (reversible destructive ops). With an action the toast lingers longer
// (5s) so the user can reach it; tapping runs actionFn then dismisses. The element is rebuilt only
// when its shape changes (plain↔action) to avoid a stale button leaking across calls.
function roomToast(msg, actionLabel, actionFn, ttlMs) {
  try {
    if (!_roomToastEl) { _roomToastEl = el('div', { class: 'room-toast' }); document.body.appendChild(_roomToastEl); }
    _roomToastEl.innerHTML = '';
    _roomToastEl.appendChild(el('span', { class: 'room-toast-msg', text: msg }));
    const hide = () => { if (_roomToastEl) _roomToastEl.classList.remove('show'); };
    if (actionLabel && typeof actionFn === 'function') {
      const btn = el('button', { class: 'room-toast-action', attrs: { type: 'button' } });
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => { try { actionFn(); } catch (_) {} hide(); });
      _roomToastEl.appendChild(btn);
    }
    _roomToastEl.classList.add('show');
    if (_roomToastT) clearTimeout(_roomToastT);
    _roomToastT = setTimeout(hide, Number.isFinite(ttlMs) ? ttlMs : (actionLabel ? 5000 : 2200));
  } catch (_) {}
}

// ── PWA update toast + «О Зале» (premium chrome — the Room registers the SW itself, so an
// update prompt + About surface exist even when the Room is opened directly, not via Studio) ──
let roomWaitingWorker = null, roomReloadingForUpdate = false, roomUpdateActivationRequested = false, roomUpdateToastEl = null, roomAppVersion = '';
let roomConnectionState = 'online', roomReconnectPromise = null;
function setRoomConnectionState(next) {
  roomConnectionState = next || roomConnectionState;
  const box = $('roomConnectionStatus'), text = $('roomConnectionText'), retry = $('roomConnectionRetry');
  if (!box || !text) return;
  const labels = {
    online: ['room.connection.online', 'Сеть доступна'],
    'offline-ready': ['room.connection.offlineReady', 'Офлайн: локальные тексты и чтение доступны'],
    'offline-partial': ['room.connection.offlinePartial', 'Офлайн: сетевой материал временно недоступен; локальные данные сохранены'],
    reconnecting: ['room.connection.reconnecting', 'Связь восстановлена — обновляем сетевые данные…'],
    'degraded-error': ['room.connection.degradedError', 'Сеть появилась, но обновить сетевые данные не удалось'],
    'update-ready': ['room.connection.updateReady', 'Обновление загружено и ждёт вашего подтверждения'],
    'update-deferred-reader': ['room.connection.updateDeferredReader', 'Сохраняем позицию чтения перед обновлением…'],
  };
  const label = labels[roomConnectionState] || labels.online;
  text.textContent = tt(label[0], label[1]); box.dataset.state = roomConnectionState;
  box.hidden = roomConnectionState === 'online';
  if (retry) retry.hidden = roomConnectionState !== 'degraded-error' && roomConnectionState !== 'offline-partial';
  roomDiagPush({ kind: 'room.connection', connection: roomConnectionState, result: roomConnectionState === 'degraded-error' ? 'error' : 'ok' });
}
function roomOfflineHasLocalTruth() {
  const protectedSurface = !!readerGroupCorpusId || String(corpusNav.corpus || '').startsWith('group:');
  return !!(localDb.isReady && localDb.isReady()) && !protectedSurface;
}
async function reconnectRoomNetwork() {
  if (roomReconnectPromise) return roomReconnectPromise;
  setRoomConnectionState(roomB6.nextConnectionState(roomConnectionState, 'online'));
  roomReconnectPromise = (async () => {
    try {
      // A unique probe key prevents the SW network-first config cache from
      // turning a previous success into a false-positive reconnect.
      const response = await fetch('/api/client-config?room_reconnect=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('RECONNECT_HTTP_' + response.status);
      await response.json();
      await loadGroupCorpora({ strictNetwork: true });
      if (activeTrack === 'corpus' && (!$('roomReader') || $('roomReader').hidden)) await renderCorpus();
      setRoomConnectionState(roomB6.nextConnectionState('reconnecting', 'probe-ok'));
    } catch (_) { setRoomConnectionState(roomB6.nextConnectionState('reconnecting', 'probe-failed')); }
    finally { roomReconnectPromise = null; }
  })();
  return roomReconnectPromise;
}
function wireRoomConnection() {
  addEventListener('offline', () => setRoomConnectionState(roomB6.nextConnectionState(roomConnectionState, 'offline', { localReady: roomOfflineHasLocalTruth() })));
  addEventListener('online', reconnectRoomNetwork);
  const retry = $('roomConnectionRetry'); if (retry) retry.addEventListener('click', reconnectRoomNetwork);
  if (!navigator.onLine) setRoomConnectionState(roomB6.nextConnectionState('online', 'offline', { localReady: roomOfflineHasLocalTruth() }));
}
function dismissRoomUpdateToast() {
  if (roomUpdateToastEl && roomUpdateToastEl.parentNode) roomUpdateToastEl.parentNode.removeChild(roomUpdateToastEl);
  roomUpdateToastEl = null;
}
async function applyRoomUpdate() {
  const w = roomWaitingWorker;
  if (w) {
    const readerOpen = !!($('roomReader') && !$('roomReader').hidden && readerTextId != null);
    try {
      if (readerOpen) {
        setRoomConnectionState(roomB6.nextConnectionState(roomConnectionState, 'update-flush'));
        await flushReaderProgress({ readBack: true });
      }
    } catch (_) {
      setRoomConnectionState('update-ready');
      roomToast(tt('room.connection.updateFlushFailed', 'Позиция чтения не подтверждена — обновление отложено'));
      return;
    }
    dismissRoomUpdateToast();
    roomUpdateActivationRequested = true;
    w.postMessage({ type: 'SKIP_WAITING' });
    roomDiagPush({ kind: 'room.update', result: readerOpen ? 'progress-flushed' : 'safe-point' });
    // A dropped message must not reload into the old shell. Re-send only while
    // the same worker is still waiting; controllerchange owns the one reload.
    setTimeout(async () => {
      if (roomReloadingForUpdate) return;
      try { const reg = await navigator.serviceWorker.getRegistration('/'); if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
      catch (_) {}
    }, 3500);
  } else { reconnectRoomNetwork(); }
}
function showRoomUpdateToast(worker) {
  roomWaitingWorker = worker || roomWaitingWorker;
  setRoomConnectionState(roomB6.nextConnectionState(roomConnectionState, 'update-waiting'));
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
    if (!roomUpdateActivationRequested || roomReloadingForUpdate) return;
    roomReloadingForUpdate = true; location.reload();
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
      if (navigator.onLine && roomConnectionState !== 'update-ready') setRoomConnectionState('online');
    }
  } catch (_) {
    setRoomConnectionState(navigator.onLine ? 'degraded-error' : roomB6.nextConnectionState('online', 'offline', { localReady: roomOfflineHasLocalTruth() }));
  }
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

// ── CLG-P3.2 — «☁ Синхронизация» (AI_MENTOR_RECON §9 CLG-P3, Tier 2) ─────────────────────────
// Owner-only bootstrap login + двусторонний review_log-синк (движок cloud-sync.js, DORMANT без
// логина — Tier 1 не тронут). Честные состояния (R4): выключено → форма логина; подключено →
// последний синк + счётчики локально/в облаке + [Синхронизировать][Выйти]; ошибки — строкой,
// никогда не молча. После логина живая сессия => авто-fullSync на буте (durable-согласие).
function _cloudEls() {
  return {
    modal: $('roomCloudModal'), status: $('roomCloudStatus'), loginBox: $('roomCloudLoginBox'),
    secret: $('roomCloudSecret'), loginBtn: $('roomCloudLoginBtn'), panel: $('roomCloudPanel'),
    info: $('roomCloudInfo'), syncBtn: $('roomCloudSyncBtn'), logoutBtn: $('roomCloudLogoutBtn'),
    textsCb: $('roomCloudTexts'),
    pushState: $('roomCloudPushState'), pushOn: $('roomCloudPushOn'),
    pushTest: $('roomCloudPushTest'), pushOff: $('roomCloudPushOff'),
    role: $('roomCloudRole'), groupAccess: $('roomCloudGroupAccess'), accountHelp: $('roomCloudAccountHelpBody'),
  };
}
const CLOUD_ACCOUNT_BINDING_KEY = 'cloud.account_user_id';
function roomCloudAccountBinding(userId, establish = true) {
  const uid = String(userId || ''); if (!uid) return { ok:false };
  let bound = ''; try { bound = localStorage.getItem(CLOUD_ACCOUNT_BINDING_KEY) || ''; } catch (_) {}
  if (bound && bound !== uid) return { ok:false, bound };
  if (!bound && establish) try { localStorage.setItem(CLOUD_ACCOUNT_BINDING_KEY, uid); } catch (_) {}
  return { ok:true, bound:uid };
}
// CLG-P9: «🧭 План на сегодня», consent агента и строка «🤖 Наставник» ПЕРЕЕХАЛИ в дом
// наставника (mentor-home.js, вид #roomMentorView) — ☁-модал вернулся к синку/пушу/аккаунту.
// CLG-P4.5 — Web Push блок ☁-модала. Honest states: unsupported (нет SW/PushManager —
// в т.ч. iPhone-браузер без установки на «Домой») / denied / off / on-this-device.
function _pushB64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function _pushReg() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch (_) { return null; }
}
async function _cloudRenderPush() {
  const els = _cloudEls();
  if (!els.pushState) return;
  const setState = (txt) => { els.pushState.textContent = txt || ''; };
  const show = (on, test, off) => {
    if (els.pushOn) els.pushOn.hidden = !on;
    if (els.pushTest) els.pushTest.hidden = !test;
    if (els.pushOff) els.pushOff.hidden = !off;
  };
  const reg = await _pushReg();
  if (!reg) { setState(tt('room.cloud.pushUnsupported', 'недоступен в этом браузере')); show(false, false, false); return; }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    setState(tt('room.cloud.pushDenied', 'уведомления запрещены в браузере')); show(false, false, false); return;
  }
  let sub = null;
  try { sub = await reg.pushManager.getSubscription(); } catch (_) {}
  if (sub) { setState('✓ ' + tt('room.cloud.pushOn', 'включён на этом устройстве')); show(false, true, true); }
  else { setState(''); show(true, false, false); }
}
async function _cloudPushEnable() {
  const els = _cloudEls();
  try {
    const reg = await _pushReg(); if (!reg) return;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { await _cloudRenderPush(); return; }
    const vk = await fetch('/api/push/vapid-key', { credentials: 'same-origin' }).then((r) => r.json());
    if (!vk || !vk.ok) { _cloudStatus('✗ ' + ((vk && vk.error) || 'PUSH_UNAVAILABLE'), 'err'); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _pushB64ToU8(vk.key) });
    const r = await fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!r.ok) { try { await sub.unsubscribe(); } catch (_) {} _cloudStatus('✗ ' + tt('room.cloud.err', 'Ошибка синхронизации'), 'err'); }
  } catch (e) { _cloudStatus('✗ ' + String(e && e.message || e), 'err'); }
  await _cloudRenderPush();
}
async function _cloudPushDisable() {
  try {
    const reg = await _pushReg(); if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch (_) {}
      await fetch('/api/push/unsubscribe', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
        body: JSON.stringify({ endpoint }) });
    }
  } catch (_) {}
  await _cloudRenderPush();
}
async function _cloudPushTest() {
  try {
    const r = await fetch('/api/push/test', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' }, body: '{}' }).then((x) => x.json());
    _cloudStatus(r && r.ok ? '✓ ' + tt('room.cloud.pushSent', 'Нудж отправлен') + ' (due: ' + (r.due != null ? r.due : '?') + ')' : '✗ ' + ((r && r.error) || '?'), r && r.ok ? 'ok' : 'err');
  } catch (e) { _cloudStatus('✗ ' + String(e && e.message || e), 'err'); }
}
function _cloudStatus(text, cls) {
  const e = _cloudEls().status; if (!e) return;
  e.textContent = text || ''; e.className = 'room-cloud-status' + (cls ? ' ' + cls : '');
}
async function _cloudRender() {
  const els = _cloudEls(); if (!els.modal) return;
  const CS = window.CloudSync; if (!CS) return;
  let session = null;
  try { session = await CS.me(); } catch (_) {}
  if (!session) {
    els.loginBox.hidden = false; els.panel.hidden = true;
    _cloudStatus(tt('room.cloud.off', 'Не подключено. Локальный режим работает как обычно.'));
    return;
  }
  const binding = roomCloudAccountBinding(session.user && session.user.id);
  if (!binding.ok) {
    els.loginBox.hidden = true; els.panel.hidden = false;
    if (els.role) els.role.textContent = tt('room.groupAccess.profileMismatch', 'Этот профиль браузера уже связан с другим аккаунтом. Выйдите и откройте приложение в отдельном профиле.');
    if (els.groupAccess) els.groupAccess.hidden = true;
    _cloudStatus('✗ ' + tt('room.groupAccess.profileMismatchShort', 'Профиль браузера принадлежит другому аккаунту'), 'err');
    return;
  }
  els.loginBox.hidden = true; els.panel.hidden = false;
  _cloudStatus('✓ ' + tt('room.cloud.connected', 'Подключено'), 'ok');
  const isOwner = String(session.user && session.user.role || '').toLowerCase() === 'owner';
  if (els.role) els.role.innerHTML = '<strong>' + (isOwner ? tt('room.groupAccess.ownerRole','Вы вошли как владелец') : tt('room.groupAccess.memberRole','Вы вошли как участник')) + '</strong>';
  if (els.accountHelp) els.accountHelp.textContent = isOwner
    ? tt('room.groupAccess.ownerHelp','JOIN-ссылка создаёт нового участника. «Новая ссылка входа» сохраняет существующий аккаунт и прогресс. Каждая ссылка одноразовая и действует 24 часа. «Отозвать доступ» немедленно закрывает корпус во всех сессиях участника.')
    : tt('room.groupAccess.memberHelp','Корпус и общее аудио доступны только участникам. Ваш прогресс, память слов и личные пометки не видны другим участникам. Для входа на новом устройстве попросите владельца прислать новую одноразовую ссылку входа — она откроет тот же аккаунт.');
  if (els.groupAccess) { els.groupAccess.hidden = !groupCorpora.length; els.groupAccess.textContent = isOwner ? tt('room.groupAccess.manage','Участники и приглашения') : tt('room.groupAccess.open','Доступ к учебной группе'); }
  try { await _cloudRenderPush(); } catch (_) {}   // CLG-P4.5 — push-блок (честные состояния)
  // Consent-переключатель класса C отражает СЕРВЕРНУЮ истину (consent_records).
  // P1: галочка «включена» только при АКТУАЛЬНОЙ версии карты; грант старой версии —
  // снятая галочка + амбер re-consent-строка (не переносится молча — решение владельца).
  const _ctVer = (window.CloudSync && window.CloudSync.CLOUD_TEXTS_CONSENT_VERSION) || 'v2';
  {
    const c = (session.consents || {}).cloud_texts;
    const current = !!(c && c.granted === true && String(c.version || '') === _ctVer);
    if (els.textsCb) els.textsCb.checked = current;
    const rc = $('roomCloudReconsent');
    if (rc) rc.hidden = !(c && c.granted === true && !current);
  }
  const lines = [];
  const hintRow = (hintKey, html) => '<span data-cloud-hint="' + hintKey + '">' + html + '<span class="room-cloud-i" aria-hidden="true">ⓘ</span></span>';
  try {
    const last = await localDb.getSyncState('last_sync_at');
    lines.push(tt('room.cloud.lastSync', 'Последний синк') + ': <b>' + (last ? new Date(last).toLocaleString() : tt('room.cloud.never', 'ещё не было')) + '</b>');
    const localN = await localDb.countReviewLog();
    let cloudN = '—';
    try { const c = await fetch('/api/learner/counts', { credentials: 'same-origin' }).then((r) => r.json()); if (c && c.ok) cloudN = c.review_log; } catch (_) {}
    lines.push(hintRow('events', tt('room.cloud.counts', 'События памяти') + ': ' + tt('room.cloud.countLocal', 'на устройстве') + ' <b>' + localN + '</b> · ' + tt('room.cloud.countCloud', 'в облаке') + ' <b>' + cloudN + '</b>'));
    // P5.5 — «Мои тексты»: сверяемые числа на устройстве/в облаке (или честное «выключено»)
    try {
      const _ct = (session.consents || {}).cloud_texts;
      const consented = !!(_ct && _ct.granted === true && String(_ct.version || '') === _ctVer);
      if (consented) {
        const ownTexts = await localDb.listOwnTextsForSync();
        let cloudT = '—';
        try { const a = await fetch('/api/learner/artifacts', { credentials: 'same-origin' }).then((r) => r.json()); if (a && a.ok) cloudT = (a.rows || []).length; } catch (_) {}
        lines.push(hintRow('texts', tt('room.cloud.textsLine', 'Мои тексты') + ': ' + tt('room.cloud.countLocal', 'на устройстве') + ' <b>' + ownTexts.length + '</b> · ' + tt('room.cloud.countCloud', 'в облаке') + ' <b>' + cloudT + '</b>'));
      } else {
        lines.push(hintRow('texts', tt('room.cloud.textsLine', 'Мои тексты') + ': <b>' + tt('room.cloud.textsOff', 'синк выключен') + '</b>'));
      }
    } catch (_) {}
    // CLG-P4 — живой оракул на РЕАЛЬНОМ профиле: fresh replay(лог) == ingest-maintained серверные
    // проекции. missing>0 = проекции ещё не строились для до-P4 строк → разовый rebuild.
    try {
      const oFetch = () => fetch('/api/learner/oracle?sample=300', { credentials: 'same-origin' }).then((r) => r.json());
      let o = await oFetch();
      // P7.0a: rebuild и на mismatched>0 (не только missing) — смена семантики фолда
      // (annul-aware engine v2) делает старые stored-проекции ключей с annul-строками
      // честно«diverged»; rebuild = пересчёт из лога, лог — истина.
      if (o && o.ok && (o.missing > 0 || o.mismatched > 0)) {
        await fetch('/api/learner/projections/rebuild', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' } });
        o = await oFetch();
      }
      if (o && o.ok) {
        lines.push(hintRow('oracle', o.mismatched === 0
          ? tt('room.cloud.oracleOk', 'Облачные проекции (оракул)') + ': <b>✓ ' + o.checked + '</b>'
          : tt('room.cloud.oracleBad', 'Облачные проекции: расхождения') + ': <b>' + o.mismatched + '</b>'));
      }
    } catch (_) {}
    // CLG-P9: статус/лимиты наставника переехали в дом наставника (🤖 в шапке).
  } catch (_) {}
  if (els.info) els.info.innerHTML = lines.join('<br>');
}
async function _cloudRunSync(auto) {
  const CS = window.CloudSync; if (!CS) return;
  const els = _cloudEls();
  try { const s=await CS.me(); if(!s||!roomCloudAccountBinding(s.user&&s.user.id).ok){if(!auto)_cloudStatus('✗ '+tt('room.groupAccess.profileMismatchShort','Профиль браузера принадлежит другому аккаунту'),'err');return {ok:false,error:'ACCOUNT_PROFILE_MISMATCH'};} } catch (_) { return {ok:false,error:'UNAUTHENTICATED'}; }
  if (els.syncBtn) els.syncBtn.disabled = true;
  if (!auto) _cloudStatus(tt('room.cloud.syncing', 'Синхронизация…'));
  let res = null;
  try { res = await CS.fullSync(localDb, { auto: !!auto }); } catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
  if (els.syncBtn) els.syncBtn.disabled = false;
  if (res && res.ok) {
    const up = res.up || {}, down = res.down || {};
    let line = '✓ ' + tt('room.cloud.done', 'Готово') + ' · ↑' + (up.new || 0) + ' · ↓' + (down.pulled || 0);
    const a = res.artifacts;
    let artErr = false;
    if (a && a.ok && !a.skipped && (a.uploaded || a.downloaded || a.updated)) {
      line += ' · 📄 ↑' + (a.uploaded || 0) + ' ↓' + ((a.downloaded || 0) + (a.updated || 0));
    }
    // P1 — синк текстов приостановлен до re-consent: видимый маркер (амбер-строка в модале)
    if (a && a.skipped === 'reconsent_required') line += ' · 📄⏸';
    // P0 — приближение к капу артефакта НЕ молчит (урок §3.4: тикающий отказ был невидим)
    if (a && a.nearCap) line += ' · 📄⚠' + a.nearCap;
    // провал state-синка виден так же, как провалы текстов
    if (a && a.state && a.state.ok === false) line += ' · 🗂✗';
    // провалы текстов НИКОГДА не молчат (урок: «в облаке 0» без единой видимой ошибки)
    if (a && ((a.failed && a.failed.length) || a.ok === false)) {
      artErr = true;
      const n = (a.failed && a.failed.length) || 0;
      line += ' · 📄✗' + (n || '') + (a.error ? ' ' + a.error : '');
      const box = $('roomCloudExplain');
      if (box) {
        const first = a.failed && a.failed[0];
        box.textContent = tt('room.cloud.textsFail', 'Часть текстов не синхронизировалась') + ': '
          + (first ? '«' + (first.title || first.key) + '» — ' + first.error + (n > 1 ? ' (+' + (n - 1) + ')' : '') : (a.error || '?'));
        box.hidden = false;
      }
    }
    _cloudStatus(line, artErr ? 'err' : 'ok');
    // fresh foreign rows may recolour words / move the due ring — repaint like §4.3 demands
    morphHost.invalidateWordStates();
    _compassPage.clear(); _groupLearningIndexes.clear(); _benFamiliarityScores = null; _benFamiliarityLoading = null;
    try { await ensureLearningCompassProjection(true); } catch (_) {}
    try { invalidateReadableSet(); } catch (_) {}
    try { applyDecorations(); } catch (_) {}
    try { refreshDueBadge(); } catch (_) {}
  } else if (!auto || (res && res.error === 'INGEST_REJECTED')) {
    _cloudStatus('✗ ' + tt('room.cloud.err', 'Ошибка синхронизации') + ': ' + ((res && res.error) || '?'), 'err');
  }
  try { await _cloudRender(); } catch (_) {}
  return res;
}
// Room↔Studio cross-nav (owner iPhone repro 2026-07-05): a bare `<a href="/">` hard-navigation
// raced this page's worker teardown against Studio's fresh DB open, producing a raw
// SQLITE_CANTOPEN ("unable to open database file") and, on one occasion, Studio landing on a
// DIFFERENT (empty) VFS backend. Close our own connection gracefully FIRST, then navigate.
// Modified clicks (ctrl/cmd/shift/middle-click — "open in new tab") are left alone: a NEW tab
// is the pre-existing, already-correct multi-tab scenario (Web-Locks owner/follower).
function _roomStudioNavInit() {
  const wire = (el) => {
    if (!el) return;
    el.addEventListener('click', (ev) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      const url = el.getAttribute('href') || '/';
      (async () => { try { await localDb.closeLocalDB(); } catch (_) {} location.href = url; })();
    });
  };
  wire($('roomStudioLink'));
  wire($('roomFooterStudioLink'));
}
function roomCloudInit() {
  const btn = $('roomCloud'); const els = _cloudEls();
  if (!btn || !els.modal) return;
  btn.addEventListener('click', () => { els.modal.hidden = false; _cloudRender(); });
  // PAS-B1 — deep-link #cloud (лестница Студии шлёт сюда за входом/тумблером; паттерн
  // #mentor): открыть ☁-модал по хэшу и снять хэш из URL, чтобы reload не переоткрывал.
  const openCloudByHash = () => {
    if (location.hash !== '#cloud') return;
    els.modal.hidden = false; _cloudRender();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  };
  window.addEventListener('hashchange', openCloudByHash);
  openCloudByHash();
  els.modal.addEventListener('click', (e) => { if (e.target && e.target.getAttribute && e.target.getAttribute('data-cloud-close') === '1') els.modal.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.modal.hidden) els.modal.hidden = true; });
  if (els.loginBtn) els.loginBtn.addEventListener('click', async () => {
    const CS = window.CloudSync; if (!CS) return;
    const secret = (els.secret && els.secret.value) || '';
    if (!secret) return;
    els.loginBtn.disabled = true;
    _cloudStatus(tt('room.cloud.loggingIn', 'Вход…'));
    const r = await CS.login(secret, (navigator.platform || 'device') + ' · ' + tt('room.header.title', 'Читальный зал'));
    els.loginBtn.disabled = false;
    if (r && r.ok) {
      if (els.secret) els.secret.value = '';
      await _cloudRender();
      _cloudRunSync(false);   // первый синк сразу после входа (cutover + backfill пометок)
    } else {
      const code = (r && r.error) || '?';
      const msg = code === 'BAD_SECRET' ? tt('room.cloud.badSecret', 'Неверный секрет')
        : code === 'TOO_MANY_AUTH_FAILURES' ? tt('room.cloud.tooMany', 'Слишком много попыток — подождите 10 минут')
        : code === 'AUTH_DISABLED' ? tt('room.cloud.disabled', 'Вход выключен на сервере')
        : code;
      _cloudStatus('✗ ' + msg, 'err');
    }
  });
  if (els.secret) els.secret.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); els.loginBtn && els.loginBtn.click(); } });
  if (els.syncBtn) els.syncBtn.addEventListener('click', () => _cloudRunSync(false));
  // CLG-P5.5 — класс B: галочка пишет consent-запись (append-only история) и сразу синкает
  if (els.textsCb) els.textsCb.addEventListener('change', async () => {
    const granted = !!els.textsCb.checked;
    // P2-hardening (live-инцидент 2026-07-18): снятие галочки = НЕМЕДЛЕННЫЙ purge всех облачных
    // копий (обещание карты). Случайный тап по уже-включённой галочке трижды покруживал
    // purge→полная перезаливка и съел tombstone удаления — теперь снятие требует подтверждения.
    if (!granted) {
      const okRevoke = window.confirm(tt('room.cloud.revokeConfirm',
        'Выключить синхронизацию? Облачные копии всех текстов будут УДАЛЕНЫ с сервера немедленно (локальные останутся). Повторное включение зальёт всё заново.'));
      if (!okRevoke) { els.textsCb.checked = true; return; }
    }
    try {
      const r = await fetch('/api/auth/consent', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
        // P1: версия карты — из константы CloudSync (единственный источник, никаких литералов)
        body: JSON.stringify({ key: 'cloud_texts', granted, version: (window.CloudSync && window.CloudSync.CLOUD_TEXTS_CONSENT_VERSION) || 'v2' }) });
      if (!r.ok) { els.textsCb.checked = !granted; _cloudStatus('✗ ' + tt('room.cloud.err', 'Ошибка синхронизации'), 'err'); return; }
      if (granted) _cloudRunSync(false);
    } catch (_) { els.textsCb.checked = !granted; }
  });
  if (els.logoutBtn) els.logoutBtn.addEventListener('click', async () => {
    const CS = window.CloudSync; if (!CS) return;
    const protectedIds = groupCorpora.map((item) => String(item && item.corpus_id || '')).filter(Boolean);
    try { await CS.logout(); } catch (_) {}
    groupCorpora = []; groupCatalogs.clear();
    for (const id of protectedIds) { try { await localDb.deleteLearningCompassGroupCorpus(id); } catch (_) {} }
    await _cloudRender();
  });
  if (els.groupAccess) els.groupAccess.addEventListener('click', () => {
    const corpus = groupCorpora.find((c) => c && (c.role === 'OWNER' || c.role === 'MEMBER'));
    if (corpus) openGroupAccess(corpus.corpus_id);
  });
  // CLG-P4.5 — push controls
  if (els.pushOn) els.pushOn.addEventListener('click', _cloudPushEnable);
  if (els.pushOff) els.pushOff.addEventListener('click', _cloudPushDisable);
  if (els.pushTest) els.pushTest.addEventListener('click', _cloudPushTest);
  // тап по строке с ⓘ → пояснение под инфо-блоком (title-тултипы не работают @380px);
  // повторный тап той же строки — скрыть
  if (els.info) els.info.addEventListener('click', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('[data-cloud-hint]') : null;
    if (!row) return;
    const key = row.getAttribute('data-cloud-hint');
    const box = $('roomCloudExplain'); if (!box) return;
    const texts = {
      events: tt('room.cloud.hintEvents', 'Каждый ответ в тренировке или чтении записывается как событие — это журнал вашей памяти слов. После синхронизации числа на всех устройствах должны совпадать.'),
      oracle: tt('room.cloud.hintOracle', 'Сервер пересчитал расписание повторений из журнала и сверил с сохранённым. «✓ N» — проверено N слов, расхождений нет.'),
      texts: tt('room.cloud.hintTexts', 'Собственные тексты из «Мои тексты» (корпус не передаётся). После синхронизации числа на устройстве и в облаке должны совпадать.'),
    };
    const next = texts[key] || '';
    if (!box.hidden && box.getAttribute('data-for') === key) { box.hidden = true; return; }
    box.textContent = next; box.setAttribute('data-for', key); box.hidden = !next;
  });
}

// ── Restricted-group invitations and role help ──────────────────────────────
let _groupAccessCorpusId = '';
let _groupJoinToken = '';
let _groupJoinPreview = null;
function groupAccessStatus(text, cls='') { const e=$('roomGroupAccessStatus'); if(e){e.textContent=text||'';e.className='group-access-status'+(cls?' '+cls:'');} }
function groupJoinStatus(text, cls='') { const e=$('roomGroupJoinStatus'); if(e){e.textContent=text||'';e.className='group-access-status'+(cls?' '+cls:'');} }
async function groupAccessApi(path, options={}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null) { headers['Content-Type']='application/json'; headers['X-LP-CSRF']=localStorage.getItem('cloud.csrf')||''; }
  const isGet=!options.method||String(options.method).toUpperCase()==='GET';
  const requestPath=isGet?path+(path.includes('?')?'&':'?')+'_fresh='+Date.now():path;
  const r=await fetch(requestPath,{...options,headers,credentials:'same-origin',cache:isGet?'no-store':options.cache});let j=null;try{j=await r.json();}catch(_){}
  if(!r.ok)throw new Error((j&&j.error)||('HTTP '+r.status));return j;
}
function groupAccessActionButton(label, fn, danger=false){const b=el('button',{class:'group-admin-action'+(danger?' danger':''),attrs:{type:'button'},text:label});b.addEventListener('click',fn);return b;}
function groupAccessDate(value){if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'';}
function groupAccessBadge(label,state){return el('span',{class:'group-access-badge '+state,text:label});}
function groupAccessStat(value,label){const box=el('div',{class:'group-access-stat'});box.append(el('strong',{text:String(value)}),el('span',{text:label}));return box;}
function showGroupInviteTicket(created, title){
  const ticket=$('roomGroupInviteTicket'),input=$('roomGroupInviteLink'),expiry=$('roomGroupInviteExpiry'),head=$('roomGroupInviteTicketTitle');
  if(head)head.textContent=title;if(input)input.value=created.invite_url||'';if(expiry)expiry.textContent=tt('room.groupAccess.expires','Действует до')+': '+new Date(created.expires_at).toLocaleString();if(ticket)ticket.hidden=false;
}
async function copyGroupInvite(){const input=$('roomGroupInviteLink');if(!input||!input.value)return;try{await navigator.clipboard.writeText(input.value);groupAccessStatus('✓ '+tt('room.groupAccess.copied','Ссылка скопирована'),'ok');}catch(_){input.focus();input.select();groupAccessStatus(tt('room.groupAccess.copyManual','Скопируйте выделенную ссылку вручную'));}}
async function renderGroupAccessOwner(){
  const box=$('roomGroupAccessOwner'),memberBox=$('roomGroupMembers'),inviteBox=$('roomGroupInvites'),summary=$('roomGroupAccessSummary'),refreshed=$('roomGroupAccessRefreshed');if(!box)return;box.hidden=false;$('roomGroupAccessMember').hidden=true;groupAccessStatus(tt('room.groupAccess.loading','Загрузка…'));
  try{
    const data=await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/access');groupAccessStatus('');memberBox.textContent='';inviteBox.textContent='';if(summary)summary.textContent='';
    const members=data.members||[],invites=data.invites||[],activeMembers=members.filter((m)=>m.role==='MEMBER'&&m.status==='ACTIVE').length,revokedMembers=members.filter((m)=>m.role==='MEMBER'&&m.status==='REVOKED').length,pendingInvites=invites.filter((i)=>i.status==='ACTIVE'&&Date.parse(i.expires_at)>Date.now()).length;
    if(summary)summary.append(groupAccessStat(activeMembers,tt('room.groupAccess.activeMembers','с активным доступом')),groupAccessStat(revokedMembers,tt('room.groupAccess.revokedMembers','доступ отозван')),groupAccessStat(pendingInvites,tt('room.groupAccess.pendingInvites','ожидают принятия')));
    if(refreshed)refreshed.textContent=tt('room.groupAccess.refreshed','Обновлено')+': '+groupAccessDate(data.refreshed_at||new Date().toISOString());
    for(const m of members){
      const row=el('div',{class:'group-access-row'+(m.status==='REVOKED'?' is-revoked':'')}),main=el('div',{class:'group-access-row-main'}),title=el('div',{class:'group-access-row-title',text:m.display_name||m.user_id});title.appendChild(groupAccessBadge(m.role==='OWNER'?tt('room.groupAccess.owner','владелец'):tt('room.groupAccess.memberBadge','участник'),m.status==='ACTIVE'?'active':'revoked'));main.appendChild(title);
      const dates=[tt('room.groupAccess.added','Добавлен')+': '+groupAccessDate(m.created_at)];if(m.role==='MEMBER')dates.push(tt('room.groupAccess.lastSignIn','Последний вход')+': '+(m.last_sign_in_at?groupAccessDate(m.last_sign_in_at):tt('room.groupAccess.neverSignedIn','ещё не входил')));main.appendChild(el('div',{class:'group-access-row-meta',text:dates.join(' · ')}));main.appendChild(el('div',{class:'group-access-row-meta',text:m.status==='ACTIVE'?tt('room.groupAccess.active','доступ активен'):tt('room.groupAccess.revoked','доступ отозван')}));row.appendChild(main);
      if(m.role==='MEMBER'){
        const actions=el('div',{class:'group-access-actions'});
        if(m.status==='ACTIVE'){
          actions.appendChild(groupAccessActionButton(tt('room.groupAccess.newLogin','Новая ссылка входа'),async()=>{try{const j=await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/invites',{method:'POST',body:JSON.stringify({target_user_id:m.user_id})});showGroupInviteTicket(j,tt('room.groupAccess.loginTicket','Ссылка входа для')+' '+(m.display_name||''));await renderGroupAccessOwner();}catch(e){groupAccessStatus(String(e.message||e),'err');}}));
          actions.appendChild(groupAccessActionButton(tt('room.groupAccess.revokeMember','Отозвать доступ'),async()=>{if(!confirm(tt('room.groupAccess.revokeConfirm','Отозвать доступ к корпусу у этого участника? Открытые сессии сразу перестанут видеть корпус.')))return;try{await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/members/'+encodeURIComponent(m.user_id)+'/status',{method:'POST',body:JSON.stringify({status:'REVOKED'})});await renderGroupAccessOwner();}catch(e){groupAccessStatus(String(e.message||e),'err');}},true));
        } else actions.appendChild(groupAccessActionButton(tt('room.groupAccess.restoreMember','Вернуть доступ'),async()=>{try{await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/members/'+encodeURIComponent(m.user_id)+'/status',{method:'POST',body:JSON.stringify({status:'ACTIVE'})});await renderGroupAccessOwner();}catch(e){groupAccessStatus(String(e.message||e),'err');}}));
        if(m.status==='ACTIVE')actions.appendChild(el('div',{class:'group-access-row-note',text:tt('room.groupAccess.loginDoesNotCreate','Открывает этот аккаунт; нового участника не создаёт.')}));row.appendChild(actions);
      }memberBox.appendChild(row);
    }
    if(!invites.length)inviteBox.appendChild(el('div',{class:'group-access-row-meta',text:tt('room.groupAccess.noHistory','История пока пуста')}));
    const names=new Map(members.map((m)=>[String(m.user_id),m.display_name||m.user_id]));
    for(const inv of invites.slice(0,20)){const expired=inv.status==='ACTIVE'&&Date.parse(inv.expires_at)<=Date.now(),state=expired?'EXPIRED':inv.status,statusKey=state==='ACTIVE'?'inviteActive':state==='USED'?'inviteUsed':state==='REVOKED'?'inviteRevoked':'inviteExpired',statusText=tt('room.groupAccess.'+statusKey,state);const subject=inv.kind==='LOGIN'?(names.get(String(inv.target_user_id))||tt('room.groupAccess.unknownMember','неизвестный участник')):(inv.used_by_user_id?(names.get(String(inv.used_by_user_id))||tt('room.groupAccess.newMember','новый участник')):tt('room.groupAccess.newMember','новый участник'));const row=el('div',{class:'group-access-row is-'+state.toLowerCase()}),main=el('div',{class:'group-access-row-main'}),title=el('div',{class:'group-access-row-title',text:(inv.kind==='JOIN'?tt('room.groupAccess.joinKind','Создание нового участника'):tt('room.groupAccess.loginKind','Вход в существующий аккаунт'))+' · '+subject});title.appendChild(groupAccessBadge(statusText,state.toLowerCase()));main.appendChild(title);const meta=[tt('room.groupAccess.created','Создана')+': '+groupAccessDate(inv.created_at)];if(inv.used_at)meta.push(tt('room.groupAccess.usedAt','Использована')+': '+groupAccessDate(inv.used_at));else if(state==='ACTIVE')meta.push(tt('room.groupAccess.expires','Действует до')+': '+groupAccessDate(inv.expires_at));else if(inv.revoked_at)meta.push(tt('room.groupAccess.revokedAt','Отозвана')+': '+groupAccessDate(inv.revoked_at));main.appendChild(el('div',{class:'group-access-row-meta',text:meta.join(' · ')}));row.appendChild(main);if(state==='ACTIVE')row.appendChild(groupAccessActionButton(tt('room.groupAccess.revokeInvite','Отозвать ссылку'),async()=>{try{await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/invites/'+encodeURIComponent(inv.invite_id)+'/revoke',{method:'POST',body:'{}'});await renderGroupAccessOwner();}catch(e){groupAccessStatus(String(e.message||e),'err');}},true));inviteBox.appendChild(row);}
  }catch(e){groupAccessStatus(String(e.message||e),'err');}
}
function openGroupAccess(corpusId){
  const corpus=groupCorpora.find((c)=>String(c.corpus_id)===String(corpusId));if(!corpus)return;_groupAccessCorpusId=String(corpusId);const modal=$('roomGroupAccessModal');if(!modal)return;modal.hidden=false;$('roomGroupInviteTicket').hidden=true;
  if(corpus.role==='OWNER')renderGroupAccessOwner();else{$('roomGroupAccessOwner').hidden=true;$('roomGroupAccessMember').hidden=false;groupAccessStatus('');}
}
function closeGroupAccess(){const m=$('roomGroupAccessModal');if(m)m.hidden=true;const input=$('roomGroupInviteLink');if(input)input.value='';}
async function previewGroupJoin(){
  const modal=$('roomGroupJoinModal');if(!modal||!_groupJoinToken)return;modal.hidden=false;groupJoinStatus(tt('room.groupAccess.checking','Проверяем приглашение…'));$('roomGroupJoinAccept').disabled=true;
  try{
    const current=window.CloudSync&&await window.CloudSync.me();let bound='';try{bound=localStorage.getItem(CLOUD_ACCOUNT_BINDING_KEY)||'';}catch(_){}
    const r=await fetch('/api/group-invites/preview',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:_groupJoinToken})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));_groupJoinPreview=j;
    const mismatch=current||(bound&&(j.kind==='JOIN'||(j.target_user_id&&bound!==j.target_user_id)));
    $('roomGroupJoinDescription').textContent=j.kind==='JOIN'?tt('room.groupAccess.joinDescription','Вас приглашают в корпус «{title}». Укажите имя и подтвердите создание отдельного аккаунта.').replace('{title}',j.corpus_title):tt('room.groupAccess.loginDescription','Одноразовый вход в существующий аккаунт «{name}» для корпуса «{title}».').replace('{name}',j.target_display_name||'').replace('{title}',j.corpus_title);
    $('roomGroupJoinName').hidden=j.kind!=='JOIN';
    if(mismatch){groupJoinStatus(tt('room.groupAccess.useCleanProfile','Этот профиль уже связан с аккаунтом. Откройте ссылку в инкогнито, отдельном профиле браузера или на устройстве участника.'),'err');return;}
    groupJoinStatus(tt('room.groupAccess.ready','Приглашение действительно до')+' '+new Date(j.expires_at).toLocaleString(),'ok');$('roomGroupJoinAccept').disabled=false;
  }catch(e){groupJoinStatus(tt('room.groupAccess.invalid','Ссылка недействительна, отозвана или уже использована.')+' '+String(e.message||''),'err');}
}
async function redeemGroupJoin(){
  if(!_groupJoinToken||!_groupJoinPreview)return;const btn=$('roomGroupJoinAccept');btn.disabled=true;groupJoinStatus(tt('room.groupAccess.joining','Подключаем…'));
  try{const body={token:_groupJoinToken,device_label:(navigator.platform||'device')+' · '+tt('room.header.title','Читальный зал')};if(_groupJoinPreview.kind==='JOIN')body.display_name=$('roomGroupJoinName').value||'';
    const r=await fetch('/api/group-invites/redeem',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));const binding=roomCloudAccountBinding(j.user&&j.user.id);if(!binding.ok)throw new Error('ACCOUNT_PROFILE_MISMATCH');localStorage.setItem('cloud.csrf',j.csrf||'');_groupJoinToken='';history.replaceState(null,'',location.pathname+location.search);location.replace('/library.html?joined='+encodeURIComponent(j.corpus.corpus_id));
  }catch(e){btn.disabled=false;groupJoinStatus(String(e.message||e)==='GROUP_INVITE_DISPLAY_NAME_INVALID'?tt('room.groupAccess.badName','Введите имя от 1 до 80 символов'):tt('room.groupAccess.invalid','Ссылка недействительна, отозвана или уже использована.'),'err');}
}
function groupAccessInit(){
  const modal=$('roomGroupAccessModal');if(modal){modal.addEventListener('click',(e)=>{if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-group-access-close')==='1')closeGroupAccess();});}
  const create=$('roomGroupInviteCreate');if(create)create.addEventListener('click',async()=>{try{const j=await groupAccessApi('/api/group-corpora/'+encodeURIComponent(_groupAccessCorpusId)+'/invites',{method:'POST',body:'{}'});showGroupInviteTicket(j,tt('room.groupAccess.joinTicket','Приглашение для нового участника'));await renderGroupAccessOwner();}catch(e){groupAccessStatus(String(e.message||e),'err');}});
  const refresh=$('roomGroupAccessRefresh');if(refresh)refresh.addEventListener('click',()=>renderGroupAccessOwner());
  const copy=$('roomGroupInviteCopy');if(copy)copy.addEventListener('click',copyGroupInvite);
  const accept=$('roomGroupJoinAccept');if(accept)accept.addEventListener('click',redeemGroupJoin);const cancel=$('roomGroupJoinCancel');if(cancel)cancel.addEventListener('click',()=>{_groupJoinToken='';history.replaceState(null,'',location.pathname+location.search);$('roomGroupJoinModal').hidden=true;});
  if(location.hash.startsWith('#join=')){try{_groupJoinToken=decodeURIComponent(location.hash.slice(6));}catch(_){_groupJoinToken='';}if(_groupJoinToken)previewGroupJoin();}
}
// Boot auto-sync: ONLY when a live session already exists (прежний явный вход владельца =
// durable-согласие Tier 2). Без сессии — один same-origin me() (401, кука HttpOnly и не
// читается из JS), никаких данных не уходит; Tier 1 остаётся честно-локальным.
async function roomCloudAutoSync() {
  // Boot uses the same single-flight path as foreground/session completion so two
  // lifecycle signals cannot race separate fullSync transactions.
  return roomCloudMaybeResync(true);
}
// R4b (owner 2026-07-11: «Мои показатели синхронизированы ПК↔Telegram») — the boot-only sync left
// the counters stale for a whole tab lifetime: reviews done in Telegram reached the Зал (and vice
// versa) only after a reload. Re-sync at the NATURAL cross-surface moments — returning to the tab
// and finishing a session — throttled to one run per 90s; a successful pull already refreshes the
// badge/streak via _cloudRunSync (asd-cache reset below).
let _cloudLastAutoAt = 0;
let _cloudSyncInFlight = null;
let _cloudForcedSyncPending = false;
async function roomCloudMaybeResync(force = false) {
  if (_cloudSyncInFlight) {
    if (force) _cloudForcedSyncPending = true;
    return _cloudSyncInFlight;
  }
  if (!force && Date.now() - _cloudLastAutoAt < 90000) return;
  if (new URLSearchParams(location.search).has('nocloudauto')) return;
  const run = (async () => {
    try {
      const CS = window.CloudSync; if (!CS) return;
      const session = await CS.me(); if (!session) return;
      if (!roomCloudAccountBinding(session.user && session.user.id).ok) return;
      _cloudLastAutoAt = Date.now();
      await _cloudRunSync(true);
      _asdCache = null;                          // merged streak fold must see pulled rows
      try { refreshDueBadge(); } catch (_) {}    // counters/streak reflect the fresh log now
    } catch (_) {}
  })();
  _cloudSyncInFlight = run;
  try { return await run; }
  finally {
    if (_cloudSyncInFlight === run) _cloudSyncInFlight = null;
    if (_cloudForcedSyncPending) {
      _cloudForcedSyncPending = false;
      roomCloudMaybeResync(true);
    }
  }
}
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') roomCloudMaybeResync(true);
  });
  window.addEventListener('pageshow', () => roomCloudMaybeResync(true));
  window.addEventListener('online', () => roomCloudMaybeResync(true));
  window.addEventListener('focus', () => roomCloudMaybeResync());
} catch (_) {}

// ── CLG-P9 — «Дом наставника» (MENTOR_HOME_P9_DECISION_2026_07_06) ───────────────────────────
// Полноэкранный вид ВНУТРИ Зала: 🤖 в шапке ↔ hash #mentor, паттерн roomContent↔roomReader
// (НЕ страница — DB-teardown урок v3.11.101; НЕ drawer). Логика/данные — в mentor-home.js
// (API-only, скелет Mini App P8); Зал отдаёт host-adapter действий: тренер P6.5, возврат в
// чтение, открытие текста на якоре (OPFS-резолв text_key→id — это СТОРОНА ХОСТА, не модуля).
// PAS-D0.2 — лёгкая телеметрия агент-фич (agent_ux, чартер §6): in-memory очередь +
// батч-flush fire-and-forget в /api/learner/ingest. ТОЛЬКО при живой cloud-сессии
// (нет CSRF → честная потеря; телеметрия non-gating, провенанс-оговорка R17 в спеке:
// эмитят лишь cloud-авторизованные). НИКАКОГО контента — feature/action = закрытые
// enum'ы, сервер валидирует по значению (learnerLogRepo). Ничего не гейтит.
let _uxQueue = [];
let _uxTimer = null;
function _uxUuid() {
  try { return crypto.randomUUID(); } catch (_) { return 'ux' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); }
}
function agentUx(feature, action, latencyMs) {
  try {
    _uxQueue.push({
      id: _uxUuid(), type: 'agent_ux', created_at_client: new Date().toISOString(),
      payload: { feature: String(feature), action: String(action),
        ...(latencyMs != null && isFinite(latencyMs) ? { latency_ms: Math.min(600000, Math.max(0, Math.round(latencyMs))) } : {}) },
    });
    if (_uxQueue.length >= 20) { flushAgentUx(); return; }
    if (!_uxTimer) _uxTimer = setTimeout(flushAgentUx, 30000);
  } catch (_) {}
}
function flushAgentUx() {
  if (_uxTimer) { clearTimeout(_uxTimer); _uxTimer = null; }
  const batch = _uxQueue; _uxQueue = [];
  if (!batch.length) return;
  let csrf = '';
  try { csrf = localStorage.getItem('cloud.csrf') || ''; } catch (_) {}
  if (!csrf) return;
  try {
    fetch('/api/learner/ingest', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': csrf },
      body: JSON.stringify({ idempotency_key: 'ux-' + batch[0].id, schema_version: 1, learner_events: batch }),
    }).catch(() => {});
  } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAgentUx(); });

// PAS-F1 — BYOK-ключ агента (гибрид: серверная базовая квота + свой ключ снимает лимит).
// Ключ живёт ТОЛЬКО в localStorage браузера и передаётся per-request в body LLM-тратящих
// агент-запросов; сервер его не хранит и не логирует. Литералы — const'ы (критика UX-6:
// копия в studio-agent.js обязана быть байт-равной — гейт сверяет).
const BYOK_LS_PROVIDER = 'agent.byok.provider';
const BYOK_LS_KEY = 'agent.byok.key';
function agentByok() {
  try {
    const provider = localStorage.getItem(BYOK_LS_PROVIDER) || '';
    const key = (localStorage.getItem(BYOK_LS_KEY) || '').trim();
    // null ТОЛЬКО при полной валидности обоих полей — деградат не отправляется вовсе
    // (сервер отверг бы 400; молчаливый серверный путь при «установленном» ключе запрещён)
    if ((provider !== 'openrouter' && provider !== 'gemini') || key.length < 20) return null;
    return { provider: provider, key: key };
  } catch (_) { return null; }
}

// Этикет R17 §2.3: вид открывается ТОЛЬКО явным тапом или deep-link #mentor (пуш) — никаких
// автооткрытий.
let _mentorMounted = false;
let _lessonMounted = false;
function _mentorHost() {
  return {
    t: tt,
    icon: (symbol, fallback, className) => roomIcon(symbol, fallback, className),
    language: () => String(document.documentElement.lang || 'ru').toLowerCase(),
    csrf: () => { try { return localStorage.getItem('cloud.csrf') || ''; } catch (_) { return ''; } },
    runTrainer: (itemKeys, channel) => { try { startPlanSectionTraining(itemKeys, channel); } catch (_) {} },
    openReading: () => closeMentorView(),
    openLessonStudio: () => openLessonStudio(),
    // PAS-D1 — capability пиков «что читать дальше» (движок/снапшот = рельса Зала) +
    // открытие пика ИЗ mentor-view (критика: openCorpusWork сам вид не закрывает —
    // зеркалим openTextAt: сперва closeMentorView) + телеметрия agent_ux.
    nextTextPicks: () => buildNextTextPicks(),
    // LB0 source catalog stays a host capability: MentorHome remains API-only
    // and receives identifiers/metadata, never direct OPFS access.
    lessonSources: async (request) => {
      const opts = request && typeof request === 'object' ? request : { query: request };
      const q = String(opts.query || '').trim().toLocaleLowerCase();
      const kind = ['all', 'personal', 'corpus'].includes(String(opts.kind)) ? String(opts.kind) : 'all';
      const offset = Math.max(0, Number(opts.offset) || 0);
      const limit = Math.max(1, Math.min(50, Number(opts.limit) || 20));
      const personal = [], corpus = [];
      try {
        const rows = await localDb.dbQuery(
          `SELECT t.id, t.text_key, t.title, t.source_meta_json, t.last_opened_at,
                  COUNT(s.id) AS sentence_count
             FROM texts t LEFT JOIN sentences s ON s.text_id = t.id
            WHERE t.is_archived = 0
            GROUP BY t.id, t.text_key, t.title, t.source_meta_json, t.last_opened_at
            ORDER BY (t.last_opened_at IS NULL), t.last_opened_at DESC, t.title COLLATE NOCASE`, []);
        for (const r of (rows || [])) {
          if (!r || isCorpusTextRow(r) || !r.text_key) continue;
          const title = String(r.title || r.text_key);
          if (q && !title.toLocaleLowerCase().includes(q)) continue;
          personal.push({ kind: 'personal', text_key: String(r.text_key), title: title,
            sentence_count: Math.max(0, Number(r.sentence_count) || 0) });
        }
      } catch (_) {}
      try {
        // The corpus sidecar is lazy. Lesson Builder can be the first surface
        // that needs it, so await it instead of freezing an early empty map.
        await loadCorpusIndex();
        if (corpusReadyById && corpusReadyById.size === 0) corpusReadyById = null;
        for (const c of corpusReadyMap().values()) {
          if (!c || !c.text_key || c.id == null) continue;
          const title = String(c.title || c.t || c.text_key), author = String(c.author || c.a || '');
          if (q && !(title + ' ' + author).toLocaleLowerCase().includes(q)) continue;
          corpus.push({ kind: 'corpus', work_id: String(c.id), text_key: String(c.text_key), title: title, author: author,
            sentence_count: Math.max(0, Number(c.segments || c.rows || 0) || 0) });
        }
      } catch (_) {}
      const all = kind === 'personal' ? personal : kind === 'corpus' ? corpus : personal.concat(corpus);
      return { items: all.slice(offset, offset + limit), total: all.length, offset, limit,
        hasMore: offset + limit < all.length };
    },
    openLessonSource: async (ref, orderIndex) => {
      if (!ref) return;
      if (ref.kind === 'corpus') {
        let card = null; try { card = corpusReadyMap().get(String(ref.work_id)) || null; } catch (_) {}
        if (!card) { roomToast(tt('room.mentor.corpusTextMissing', 'Работа не найдена на устройстве — откройте её во вкладке «Корпус».')); return; }
        setReaderReturnRoute('lesson-builder');
        closeAgentViews(); await openCorpusWork(card, { scrollToOrderIndex: Number(orderIndex) || 0, returnToLesson: true }); return;
      }
      return _mentorHost().openTextAt(ref.text_key, Number(orderIndex) || 0, 'personal', true);
    },
    openCorpusPick: (pick) => {
      try { closeAgentViews(); } catch (_) {}
      try { if (pick && pick.card) openCorpusWork(pick.card); } catch (_) {}
    },
    agentUx: (feature, action, latencyMs) => { try { agentUx(feature, action, latencyMs); } catch (_) {} },
    // PAS-F1 — BYOK-capability для mentor-home (данные-portable модуль localStorage не трогает)
    agentByok: () => agentByok(),
    agentByokSet: (provider, key) => {
      try {
        if (provider && key) { localStorage.setItem(BYOK_LS_PROVIDER, String(provider)); localStorage.setItem(BYOK_LS_KEY, String(key)); }
        else { localStorage.removeItem(BYOK_LS_PROVIDER); localStorage.removeItem(BYOK_LS_KEY); }   // «Убрать» = обе записи атомарно
        return true;
      } catch (_) { return false; }
    },
    openTextAt: async (textKey, orderIndex, source, returnToLesson) => {
      let row = null;
      try {
        const rows = await localDb.dbQuery('SELECT id, title FROM texts WHERE text_key = ? LIMIT 1', [String(textKey)]);
        row = rows && rows[0];
      } catch (_) {}
      // R11: якорь может указывать на текст, которого нет НА ЭТОМ устройстве — честный тост
      // вместо тихого no-op. PAS-A1: для корпус-якоря совет «синхронизируйте Мои тексты» был
      // бы ложной диагностикой (public-domain работа) — своя копия.
      if (!row) {
        roomToast(source === 'corpus'
          ? tt('room.mentor.corpusTextMissing', 'Работа не найдена на устройстве — откройте её во вкладке «Корпус».')
          : tt('room.mentor.textMissing', 'Текст не найден на этом устройстве — синхронизируйте «Мои тексты» в ☁.'));
        return;
      }
      if (returnToLesson) setReaderReturnRoute('lesson-builder');
      closeAgentViews();
      openReader(row.id, row.title, { scrollToOrderIndex: Number(orderIndex), returnToLesson: !!returnToLesson });
    },
  };
}
function _mountMentorHome() {
  const mount = $('roomMentorMount');
  if (!mount || !window.MentorHome) return;
  if (_mentorMounted) { try { window.MentorHome.refresh(); } catch (_) {} return; }
  _mentorMounted = true;
  try { window.MentorHome.mount(mount, _mentorHost()); } catch (_) {}
}
function openMentorView() {
  const view = $('roomMentorView'); if (!view || !view.hidden) return;
  // открытая читалка закрывается ШТАТНО (flush прогресса) — не просто прячется
  try { const rd = $('roomReader'); if (rd && !rd.hidden) closeReader(); } catch (_) {}
  const content = $('roomContent'); if (content) content.hidden = true;
  const lesson = $('roomLessonView'); if (lesson) lesson.hidden = true;
  view.hidden = false;
  try { window.scrollTo(0, 0); } catch (_) {}
  // replaceState — без мусора в истории и без hashchange-петли; hash = deep-link контракт (пуши)
  if (location.hash !== '#mentor') { try { history.replaceState(null, '', '#mentor'); } catch (_) {} }
  _mountMentorHome();
}
function _mountLessonStudio() {
  const mount = $('roomLessonMount');
  if (!mount || !window.MentorHome || typeof window.MentorHome.mountLessonStudio !== 'function') return;
  _lessonMounted = true;
  try { window.MentorHome.mountLessonStudio(mount, _mentorHost()); } catch (_) {}
}
function openLessonStudio() {
  const view = $('roomLessonView'); if (!view || !view.hidden) return;
  try { const rd = $('roomReader'); if (rd && !rd.hidden) closeReader(); } catch (_) {}
  const content = $('roomContent'); if (content) content.hidden = true;
  const mentor = $('roomMentorView'); if (mentor) mentor.hidden = true;
  view.hidden = false;
  try { window.scrollTo(0, 0); } catch (_) {}
  if (location.hash !== '#lesson-builder') { try { history.replaceState(null, '', '#lesson-builder'); } catch (_) {} }
  _mountLessonStudio();
}
function closeLessonStudio(returnToMentor) {
  const view = $('roomLessonView'); if (!view || view.hidden) return;
  view.hidden = true;
  const content = $('roomContent'); if (content) content.hidden = false;
  if (location.hash === '#lesson-builder') { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
  if (returnToMentor) { openMentorView(); return; }
  try { refreshDueBadge(); } catch (_) {}
}
function closeAgentViews() {
  try { closeMentorView(); } catch (_) {}
  try { closeLessonStudio(); } catch (_) {}
}
function closeMentorView() {
  const view = $('roomMentorView'); if (!view || view.hidden) return;
  view.hidden = true;
  const content = $('roomContent'); if (content) content.hidden = false;
  if (location.hash === '#mentor') { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
  try { refreshDueBadge(); } catch (_) {}
}
function roomMentorInit() {
  const btn = $('roomMentor');
  if (btn) btn.addEventListener('click', openMentorView);
  const back = $('mentorBack');
  if (back) back.addEventListener('click', closeMentorView);
  const lessonBack = $('lessonBack');
  if (lessonBack) lessonBack.addEventListener('click', () => closeLessonStudio(true));
  // deep-link при УЖЕ открытой странице (notificationclick focus-existing меняет hash)
  window.addEventListener('hashchange', () => {
    if (location.hash === '#mentor') openMentorView();
    else if (location.hash === '#lesson-builder') openLessonStudio();
  });
  if (location.hash === '#lesson-builder') openLessonStudio();
}

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
    setRoomIcon(b, 'lp-icon-theme', THEME_ICON[mode] || THEME_ICON.auto);
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
      // «Скрыта» убирает колонку из НАБОРА — это легальный вход parity-залоченного
      // билдера (Студия делает так же), а не косметика поверх готовой таблицы.
      action: actionColMode() !== 'hidden',
      he: !!readerCfg.heOn,
      niqqud: readerCfg.niqqudMode !== 'off',
      translit: !!readerCfg.translitOn,
      ru: readerCfg.ruMode !== 'off',
    },
    // ЖИВОЙ массив, а не литерал: билдер нормализует его на месте (контракт
    // normalizeVisibleBaseWidthsTo100), и результат drag'а переживает пересборку таблицы.
    baseWidths: roomTableWidths,
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
  const audioProfile = { language: 'he-IL', voiceName: '', speakingRate: 1.0, pitch: 0.0 };
  const audioIndicatorLabels = {
    ready: tt('room.reader.audio.ready', 'Аудио готово'),
    readyUnknown: tt('room.reader.audio.readyUnknown', 'Аудио готово (профиль не задан)'),
    missing: tt('room.reader.audio.missing', 'Аудио не создано. Нажмите ▶, чтобы озвучить строку.'),
    mismatch: tt('room.reader.audio.mismatch', 'Аудио создано для другого профиля голоса.'),
    cachedProfile: tt('room.reader.audio.cachedProfile', 'В кэше'),
    currentProfile: tt('room.reader.audio.currentProfile', 'Сейчас'),
  };
  const paintAudioIndicator = (idx) => readerCore.paintRowAudioIndicator(
    mount, idx, readerRows[idx], audioProfile, audioIndicatorLabels
  );
  readerAudio = readerCore.attachRowAudio(mount, {
    getRow: (i) => readerRows[i],
    rowCount: () => readerRows.length,        // BRR-P1-008 karaoke — bound for auto-advance
    onRowChange: onKaraokeRowChange,          // idx>=0 → auto-scroll; idx<0 → karaoke ended
    profile: { voiceId: '', rate: 1.0, pitch: 0.0 },
    gcpKey: gcpTtsKey,
    audioUrlForAssetKey: readerGroupCorpusId
      ? (key, row) => row && row._roomPublicAudioAssetKey === key
        ? '/api/audio/' + encodeURIComponent(key)
        : '/api/group-corpora/' + encodeURIComponent(readerGroupCorpusId) + '/audio/' + encodeURIComponent(key)
      : undefined,
    timingUrlForAssetKey: readerGroupCorpusId
      ? (key, row) => row && row._roomPublicAudioAssetKey === key
        ? '/api/audio/' + encodeURIComponent(key) + '/timing'
        : '/api/group-corpora/' + encodeURIComponent(readerGroupCorpusId) + '/audio/' + encodeURIComponent(key) + '/timing'
      : undefined,
    onAssetReady: async ({ rowIdx, row, assetKey, profile }) => {
      paintAudioIndicator(rowIdx);   // immediate Studio-parity feedback
      if (!row || !row._v3_sentenceId || !assetKey) return;
      const audioId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
        : ('aa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
      const profileJson = JSON.stringify(profile || audioProfile);
      const asset = await localDb.upsertAudioAsset({
        id: audioId, asset_key: String(assetKey), asset_type: 'row',
        relative_path: 'audio-cache/' + String(assetKey) + '.mp3',
        mime: 'audio/mpeg', tts_profile_json: profileJson,
      });
      if (asset && asset.id) await localDb.linkSentenceAudio(String(row._v3_sentenceId), asset.id, 1);
    },
    t: (k) => tt(k, k),
    // he/niqqud cell taps are reserved for the word-morphology layer below; the ▶ button +
    // translit cell still play the row. In reveal mode the ru cell tap reveals (not audio).
    tapToHearExcludeCols: readerCfg.ruMode === 'reveal' ? ['he', 'niqqud', 'ru'] : ['he', 'niqqud'],
  });
  readerRows.forEach((_, idx) => paintAudioIndicator(idx));
  attachReaderMorph(mount);
  applyReveal(mount);
  attachBookmarks(mount);   // BRR-P2-003 — POST-render ☆/★ per row (Room-only, parity-safe)
  attachExplainButtons(mount);   // CLG-P6.2 — POST-render 🤖 per row (только свои тексты)
  attachRoomColResize();   // ресайз колонок переживает пересборку таблицы
  roomPaintColWidths();    // ширины из persisted-состояния
  try { applyStudyModeClass(); } catch (_) {}   // режим + скролл-окно после каждого рендера
  try { roomPlaceProvNote(); } catch (_) {}       // дисклеймер — последним в окне таблицы
  try { if (_sessionLastRow >= 0) setCurrentWorkingRow(_sessionLastRow); } catch (_) {}   // rerender keeps the derived working-row projection
  try { roomSyncActionOverlay(); } catch (_) {}   // пересборка таблицы уносит оверлей
  karaokeActive = false; setReadAloudBtn(false);   // a fresh (re)attach resets karaoke state
}

// BRR-P1-008 — continuous read-aloud (karaoke). Reuses the existing per-row .row-playing highlight;
// adds a «Читать вслух» control, auto-advance (in reader-core), and auto-scroll that yields to manual scroll.
let karaokeActive = false, karaokeUserScrolled = false, _karaokeScrollWired = false, _karaokeLeftBand = false;
function setReadAloudBtn(active) {
  const m = $('roomReaderTable'); if (m) m.classList.toggle('karaoke-on', !!active);   // stronger current-line during karaoke
  const b = $('roomReadAloud'); if (!b) return;
  b.textContent = active ? '■' : '▶';
  b.setAttribute('aria-pressed', String(!!active));
  const key = active ? 'room.reader.stopAloud' : 'room.reader.readAloud';
  b.setAttribute('data-i18n-title', key);
  b.title = tt(key, active ? 'Стоп' : 'Читать вслух');
}
// Re-engage signal: the playing row sits in the central band of the viewport → the user is
// following playback again, so auto-centering should resume (vs. dying for the rest of the session).
function _karaokeRowFollowable(tr) {
  try {
    const r = tr.getBoundingClientRect();
    // В учебном/медиа-режиме прокручивается ОКНО ТАБЛИЦЫ, а не страница: полосу «человек
    // следит за воспроизведением» надо мерить от того же скроллера, иначе «уступи ручному
    // скроллу / вернись» срабатывает не там, куда смотрит человек.
    const mount = $('roomReaderTable');
    const inWindow = mount && mount.classList.contains('room-media-scroll');
    const box = inWindow ? mount.getBoundingClientRect() : null;
    const top = box ? box.top : 0;
    const height = box ? box.height : (window.innerHeight || document.documentElement.clientHeight || 0);
    if (!height) return false;
    const center = (r.top + r.bottom) / 2;
    return center > top + height * 0.15 && center < top + height * 0.85;
  } catch (_) { return false; }
}
function onKaraokeRowChange(idx) {
  if (idx < 0) { karaokeActive = false; setReadAloudBtn(false); return; }   // playback ended → keep last marker
  _roomReaderPresentationReadOnly = false;   // an actually sounding TTS row is genuine learner activity
  // media player: TTS реально заиграл → глушим ИГРАЮЩЕЕ медиа (isActive-guard сохраняет позицию
  // паузы — остановка bound-но-паузного медиа была бы потерей места без нужды).
  try { if (window.StudioMediaKaraoke && window.StudioMediaKaraoke.isActive()) window.StudioMediaKaraoke.stop(); } catch (_) {}
  recordProgress(idx);   // BRR-P2-002 — the read-aloud row is a strong progress signal
  // ROW-HIGHLIGHT B — recordProgress already projects this as the durable warm working row.
  // .row-playing contributes only the blue playback rail; when audio ends the warm base remains.
  if (!karaokeActive) return;
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + idx + '"]');
  // BRR-P1-008 re-engage fix — auto-scroll yields to a manual scroll, then RESUMES once playback's
  // current row is centrally back in view, instead of staying off until the user presses ▶ again.
  // Hysteresis (no yank on a small peek-ahead): re-arm ONLY after the playing row has actually LEFT
  // the central band since the pause (user read elsewhere / playback drifted) and then returned —
  // a tiny flick that keeps the row central never triggers a re-center.
  if (karaokeUserScrolled) {
    if (!(tr && _karaokeRowFollowable(tr))) { _karaokeLeftBand = true; return; }   // off-band → note it, stay out of the way
    if (!_karaokeLeftBand) return;                                                 // small peek (still central) → don't yank back
    karaokeUserScrolled = false; _karaokeLeftBand = false;                         // left then returned to band → resume centering
  }
  if (tr && tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }
  try { roomSyncActionOverlay(); } catch (_) {}   // активная строка сменилась → оверлей за ней
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
  _roomReaderPresentationReadOnly = false;
  try { if (window.StudioMediaKaraoke) window.StudioMediaKaraoke.stop(); } catch (_) {}   // media player: «Читать вслух» глушит медиа
  karaokeActive = true; karaokeUserScrolled = false; _karaokeLeftBand = false;
  wireKaraokeScrollPause();
  setReadAloudBtn(true);
  try { readerAudio.playAll(0); } catch (_) { karaokeActive = false; setReadAloudBtn(false); }
}
function stopKaraoke() {
  if (karaokeActive && readerAudio) { try { readerAudio.stop(); } catch (_) {} }
  karaokeActive = false; setReadAloudBtn(false);
}

// ── Room media player (spec 2026-08-04): оригинал аудио/видео для медиа-материалов ──────────
// Всё — post-render chrome над parity-locked таблицей; данные и DOM-хелперы — общий MediaHost
// (media-host.js, тот же, что в Студии). Honesty-состояния (noTiming/fileMissing) обязательны.
let roomMediaAudio = null;   // активный паспорт; timing.entries — ОДНА ссылка (контракт karaoke)
let roomMediaStage = null, roomMediaResolver = null;
let roomMediaYtAdapter = null, roomMediaYtVideoId = null, roomMediaYtCreating = null;
let _roomMediaWired = false;
let roomMediaSetupSerial = 0;

function roomMediaStopOthers() {   // media → TTS направление взаимоисключения
  try { stopKaraoke(); } catch (_) {}
  try { if (readerAudio) readerAudio.stop(); } catch (_) {}
}
function roomMediaResolverInst() {
  // Session-blob (window.v3SessionMediaBlob) живёт только в документе Студии — Зал честно
  // видит такой паспорт как fileMissing (спека, ловушка №8).
  if (!roomMediaResolver && window.MediaHost) roomMediaResolver = window.MediaHost.createBlobResolver({ getSessionBlob: () => null });
  return roomMediaResolver;
}
function roomMediaStageInst() {
  if (!roomMediaStage && window.MediaHost) roomMediaStage = window.MediaHost.createStage({
    stageId: 'roomMediaLocalStage', playerId: 'roomMediaLocalPlayer',
    t: (k) => tt(k, k), ariaKey: 'studio.media.sourcePlayer',
    getRowCount: () => readerRows.length,
    onRangeChange: roomMediaFollowRange,
    stopOtherAudio: roomMediaStopOthers,
  });
  return roomMediaStage;
}
// Sticky-шапка таблицы: reader-core.css даёт th sticky top:0, но Зал скроллит ОКНО, и шапка
// заезжала под sticky .reader-bar. Отступ = живая высота бара (меняется: перенос строк,
// cov-chip) → CSS-переменная, обновляемая на открытии/ресайзе/追 следовании.
let _roomTheadResizeWired = false, _roomTheadResizeObserver = null, _roomTheadObservedBar = null;
function roomApplyTheadTop() {
  const bar = document.querySelector('#roomReader .reader-bar');
  const h = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().height)) : 0;
  try { document.documentElement.style.setProperty('--room-thead-top', h + 'px'); } catch (_) {}
  return h;
}
function roomUpdateTheadTop() {
  const bar = document.querySelector('#roomReader .reader-bar');
  const h = roomApplyTheadTop();
  // B7 coverage/status chips can change the bar height after async local work.
  // Observe the actual box instead of guessing when that work will settle.
  if (bar && typeof ResizeObserver === 'function' && _roomTheadObservedBar !== bar) {
    try { if (_roomTheadResizeObserver) _roomTheadResizeObserver.disconnect(); } catch (_) {}
    _roomTheadResizeObserver = new ResizeObserver(() => { try { roomApplyTheadTop(); } catch (_) {} });
    _roomTheadResizeObserver.observe(bar);
    _roomTheadObservedBar = bar;
  }
  if (!_roomTheadResizeWired) {
    _roomTheadResizeWired = true;
    window.addEventListener('resize', () => { try { roomUpdateTheadTop(); } catch (_) {} }, { passive: true });
  }
  return h;
}

// МЕДИА-РЕЖИМ РАЗМЕТКИ: пока медиа видно (стейдж или YouTube), таблица живёт в собственном
// скролл-окне под закреплённым плеером — зеркало #tableContainer Студии. Видео не уходит
// с экрана: скроллится ТАБЛИЦА, а не страница. Без медиа — обычное полностраничное чтение.
function roomMediaApplyLayout() {
  const wrap = $('roomReaderTable'); if (!wrap) return;
  const stage = $('roomMediaLocalStage'), yt = $('roomMediaYtMount');
  const mediaVisible = (stage && !stage.hidden) || (yt && !yt.hidden);
  const wasMediaScroll = wrap.classList.contains('room-media-scroll');
  const preserveWorkingRow = () => {
    if (wasMediaScroll || !wrap.classList.contains('room-media-scroll') || _sessionLastRow < 0) return;
    const textId = readerTextId, rowIdx = _sessionLastRow;
    _programmaticProgressUntil = Date.now() + 1500;
    const restore = () => {
      if (readerTextId !== textId || _sessionLastRow !== rowIdx || !wrap.classList.contains('room-media-scroll')) return;
      positionReaderRow(rowIdx, 'auto');
    };
    try { requestAnimationFrame(restore); } catch (_) { setTimeout(restore, 0); }
  };
  // Учебный режим: окно таблицы — flex-остаток, считать нечего. Но КЛАСС обязан
  // остаться: по нему roomMediaFollowRange решает, какой скроллер двигать, и без него
  // слежение караоке ушло бы в ветку страничного скролла (спека 2026-08-05, ловушка).
  if (document.body.classList.contains('room-study')) {
    wrap.classList.add('room-media-scroll');
    wrap.style.maxHeight = '';
    preserveWorkingRow();
    return;
  }
  if (mediaVisible) {
    wrap.classList.add('room-media-scroll');
    // высота окна таблицы = остаток вьюпорта под плеером (rect.top меряется при странице
    // вверху — openReader всегда стартует с scrollTo(0,0); отрицательный top клампится)
    const h = Math.max(220, window.innerHeight - Math.max(0, wrap.getBoundingClientRect().top) - 10);
    wrap.style.maxHeight = h + 'px';
    // Media resolution is asynchronous. Resume may already have positioned the page-level
    // scroller; when this inner scroller appears, carry the same logical row into it.
    preserveWorkingRow();
  } else {
    wrap.classList.remove('room-media-scroll');
    wrap.style.maxHeight = '';
  }
}

// Скролл-слежение — yield ручному скроллу + re-engage (контракт TTS-караоке BRR-P1-008), а
// ПОЗИЦИЯ — как в Студии: активная строка — ВТОРАЯ видимая (над ней уже прошедшая строка,
// под ней — будущее; человек держит контекст, глядя на видео). Формула ОБЩАЯ —
// MaterialRevisionCore.computeContextScrollTop. В медиа-режиме скроллится СОБСТВЕННОЕ окно
// таблицы (зеркало v3MediaFollowTableRange Студии — та же геометрия контейнера, мгновенный
// scrollTop); в обычном режиме (нет медиа) — окно страницы.
function roomMediaFollowRange(range) {
  if (!range) return;
  try { if (window.StudioMediaKaraoke && window.StudioMediaKaraoke.isActive()) _roomReaderPresentationReadOnly = false; } catch (_) {}
  recordProgress(range.rowStart);
  try { roomSyncActionOverlay(); } catch (_) {}   // медиа-караоке ведёт активную строку
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + String(range.rowStart) + '"]');
  if (!tr) return;
  if (karaokeUserScrolled) {
    if (!_karaokeRowFollowable(tr)) { _karaokeLeftBand = true; return; }
    if (!_karaokeLeftBand) return;
    karaokeUserScrolled = false; _karaokeLeftBand = false;
  }
  const MRC = window.MaterialRevisionCore;
  const prev = range.rowStart > 0 ? mount.querySelector('tr[data-row-idx="' + String(range.rowStart - 1) + '"]') : null;
  const prevH = prev ? prev.getBoundingClientRect().height : 0;
  if (mount.classList.contains('room-media-scroll')) {
    // страница могла быть прокручена (плеер выше вьюпорта) — вернуть плеер в кадр
    const bar = $('roomMediaBar');
    if (bar && bar.getBoundingClientRect().top < 0) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {} }
    if (MRC && typeof MRC.computeContextScrollTop === 'function') {
      const cRect = mount.getBoundingClientRect();
      mount.scrollTop = MRC.computeContextScrollTop({
        scroll_top: mount.scrollTop,
        container_top: cRect.top,
        container_height: mount.clientHeight,
        row_top: tr.getBoundingClientRect().top,
        previous_row_height: prevH,
        gap: 2,
        max_scroll_top: Math.max(0, mount.scrollHeight - mount.clientHeight),
      });
    } else {
      try { tr.scrollIntoView({ block: 'center' }); } catch (_) {}
    }
    return;
  }
  if (MRC && typeof MRC.computeContextScrollTop === 'function') {
    const scroller = document.scrollingElement || document.documentElement;
    const barH = roomUpdateTheadTop();
    const thead = mount.querySelector('#proTable thead');
    const occl = barH + (thead ? thead.getBoundingClientRect().height : 0);
    const target = MRC.computeContextScrollTop({
      scroll_top: scroller.scrollTop,
      container_top: occl,
      container_height: Math.max(0, window.innerHeight - occl),
      row_top: tr.getBoundingClientRect().top,
      previous_row_height: prevH,
      gap: 2,
      max_scroll_top: Math.max(0, scroller.scrollHeight - window.innerHeight),
    });
    try { window.scrollTo({ top: target, behavior: 'smooth' }); } catch (_) { scroller.scrollTop = target; }
  } else {
    try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
  }
}
function roomMediaTeardown() {
  roomMediaSetupSerial++;
  try { if (window.StudioMediaKaraoke) window.StudioMediaKaraoke.stop(); } catch (_) {}
  try { if (roomMediaStage) roomMediaStage.destroy(); } catch (_) {}
  // YT-адаптер привязан к КОНКРЕТНОМУ videoId (спека, ловушка №9) — при смене текста/закрытии
  // обязан быть уничтожен, иначе плеер управляет видео A при таблице B.
  if (roomMediaYtAdapter && window.StudioYtPlayer) { try { window.StudioYtPlayer.destroy(roomMediaYtAdapter); } catch (_) {} }
  roomMediaYtAdapter = null; roomMediaYtVideoId = null; roomMediaYtCreating = null;
  roomMediaAudio = null;
  if (roomMediaResolver) { try { roomMediaResolver.clear(); } catch (_) {} }
  for (const id of ['roomMediaBar', 'roomMediaYtMount', 'roomMediaStudioLink']) { const n = $(id); if (n) n.hidden = true; }
  try { roomMediaApplyLayout(); } catch (_) {}   // выключить скролл-окно таблицы (медиа скрыто)
}
async function roomMediaSetup(textRow, textId) {
  roomMediaTeardown();
  if (!window.MediaHost || !window.StudioMediaKaraoke) return;   // офлайн до precache → фичи честно нет
  const serial = ++roomMediaSetupSerial;
  let audio = window.MediaHost.passportFromTextRow(textRow);
  if (audio) try { window.MediaHost.restoreForRows(audio, readerRows); } catch (_) {}   // K1-карантин + K3-довыравнивание
  if (window.StudioMediaPackage && typeof window.StudioMediaPackage.activateTextBinding === 'function' && textId != null) {
    try {
      const activation = await window.StudioMediaPackage.activateTextBinding(String(textId));
      if (serial !== roomMediaSetupSerial || String(readerTextId) !== String(textId)) return;
      audio = window.MediaHost.pickExactBindingPassport(audio, activation && activation.media_passport, readerRows.length);
    } catch (_) { /* legacy/non-package cards keep their saved passport */ }
  }
  if (!audio || serial !== roomMediaSetupSerial) return;
  try { window.MediaHost.restoreForRows(audio, readerRows); } catch (_) {}
  roomMediaAudio = audio;
  const bar = $('roomMediaBar'); if (!bar) return;
  bar.hidden = false;
  roomMediaWireOnce();
  roomMediaRefresh();
}
function roomMediaRefresh() {
  const audio = roomMediaAudio; if (!audio) return;
  const note = $('roomMediaBarNote'), btn = $('roomMediaPlayBtn'), link = $('roomMediaStudioLink');
  // Причина отсутствия караоке словами — та же реализация, что в Студии (MediaHost).
  if (note) {
    let why = '';
    if (!audio.timing) { try { why = window.MediaHost.timingDropExplain(audio, (k) => tt(k, k)); } catch (_) {} }
    note.textContent = audio.timing ? '' : (why || tt('studio.media.noTiming', 'Караоке недоступно для этого импорта'));
  }
  const res = roomMediaResolverInst();
  (res ? res.resolve(audio) : Promise.resolve(null)).then((blob) => {
    if (roomMediaAudio !== audio) return;   // текст сменился, пока резолвили
    const hasVideo = !!(audio.video && audio.video.videoId && window.StudioYtPlayer && window.StudioYtPlayer.capability().supported);
    if (btn) { btn.hidden = !!blob; btn.disabled = !blob && !hasVideo; }
    if (!blob && !hasVideo) {
      if (note) note.textContent = tt('studio.media.fileMissing', 'Аудио-файл не найден в этом браузере');
      if (link && readerTextId != null) { link.href = deepLinkForText(readerTextId); link.hidden = false; }
    } else if (!blob && hasVideo && note) { note.textContent = tt('studio.media.viaYouTube', 'Воспроизведение через YouTube'); }
    if (blob) { const st = roomMediaStageInst(); if (st) st.ensure(audio, blob); }
    else if (roomMediaStage) roomMediaStage.destroy();
    roomMediaAugment();
    roomMediaApplyLayout();   // стейдж определился → включить/выключить скролл-окно таблицы
  }).catch(() => {});
}
function roomMediaAugment() {
  const mount = $('roomReaderTable');
  const table = mount && mount.querySelector('#proTable');
  if (!table || !window.MediaHost) return;
  const res = roomMediaResolverInst();
  window.MediaHost.augmentRows({
    table, audio: roomMediaAudio,
    resolveBlob: (a) => (res ? res.resolve(a) : Promise.resolve(null)),
    t: (k) => tt(k, k),
    stillActive: (a) => roomMediaAudio === a,
    onReplay: async (rowIdx, audio, blob) => {
      const st = roomMediaStageInst(); if (!st) return;
      const player = st.ensure(audio, blob);   // bind внутри дергает stopOtherAudio при fresh-run
      if (player) window.StudioMediaKaraoke.playSegment(rowIdx);
    },
  });
}
async function roomMediaPlayOriginal() {
  const audio = roomMediaAudio; if (!audio || !window.StudioMediaKaraoke) return;
  const entries = audio.timing ? audio.timing.entries : null;   // ссылка, не копия (контракт resume)
  const res = roomMediaResolverInst();
  const blob = res ? await res.resolve(audio) : null;
  if (roomMediaAudio !== audio) return;
  if (blob) {
    const st = roomMediaStageInst(); if (!st) return;
    const player = st.ensure(audio, blob);
    await window.StudioMediaKaraoke.start({ media: player || blob, entries, rowCount: readerRows.length, onRangeChange: roomMediaFollowRange, stopOtherAudio: roomMediaStopOthers });
    return;
  }
  if (!audio.video || !audio.video.videoId) return;
  if (!window.StudioYtPlayer || !window.StudioYtPlayer.capability().supported) return;
  if (!roomMediaYtAdapter) {
    // Re-entrancy guard — зеркало CRITICAL 2 Студии (index.html v3MediaPlayOriginal): два быстрых
    // клика не должны создать два адаптера в один маунт (осиротевший играющий iframe).
    if (!roomMediaYtCreating) {
      const mountEl = $('roomMediaYtMount'); if (!mountEl) return;
      mountEl.hidden = false;
      const wantedVideoId = audio.video.videoId;
      roomMediaYtCreating = window.StudioYtPlayer.create(mountEl, wantedVideoId)
        .then((adapter) => {
          const stillWanted = roomMediaAudio && roomMediaAudio.video && roomMediaAudio.video.videoId === wantedVideoId;
          if (!stillWanted) { window.StudioYtPlayer.destroy(adapter); mountEl.hidden = true; return null; }
          roomMediaYtAdapter = adapter; roomMediaYtVideoId = wantedVideoId;
          return adapter;
        })
        .catch((e) => { mountEl.hidden = true; throw e; })
        .finally(() => { roomMediaYtCreating = null; });
    }
    try { await roomMediaYtCreating; } catch (_) { return; }
    if (!roomMediaYtAdapter) return;
  }
  roomMediaApplyLayout();   // YT-маунт показан → скролл-окно таблицы
  // Per-row replay на адаптер НЕ подключён — ловушка асинхронного seekTo (karaoke.js IMPORTANT 3).
  await window.StudioMediaKaraoke.start({ media: roomMediaYtAdapter, entries, rowCount: readerRows.length, onRangeChange: roomMediaFollowRange, stopOtherAudio: roomMediaStopOthers });
}
function roomMediaWireOnce() {
  if (_roomMediaWired) return; _roomMediaWired = true;
  const btn = $('roomMediaPlayBtn');
  if (btn) btn.addEventListener('click', () => { roomMediaPlayOriginal(); });
  // Tap-seek: делегат на СТАБИЛЬНОМ #roomReaderTable (innerHTML пересобирается ВНУТРИ него).
  // Интерактивные цели Зала (морфология .rm-w, кнопки, ссылки) не перехватываются — тап по
  // слову остаётся морфологией, тап по «пустому» месту строки во время playback = перемотка.
  const mount = $('roomReaderTable');
  if (mount) mount.addEventListener('click', (e) => {
    try {
      if (!window.StudioMediaKaraoke || !window.StudioMediaKaraoke.getAudioEl()) return;
      if (e.target && e.target.closest && e.target.closest('button, a, .rm-w, select, input')) return;
      const tr = e.target && e.target.closest ? e.target.closest('tr[data-row-idx]') : null;
      if (!tr) return;
      const idx = Number(tr.getAttribute('data-row-idx'));
      if (Number.isFinite(idx) && idx >= 0) window.StudioMediaKaraoke.seekToRow(idx);
    } catch (_) {}
  });
  wireKaraokeScrollPause();   // yield-скролл единый для TTS- и медиа-караоке
  // Высота окна таблицы считалась ОДНАЖДЫ при scrollY=0, когда 176px шапки Зала ещё в
  // потоке — прокрутив шапку прочь, пользователь эти пиксели таблице не возвращал.
  // Пересчёт на скролле/повороте (через rAF, чтобы не дёргать layout на каждом кадре).
  let _layoutRaf = null;
  const relayout = () => {
    if (_layoutRaf != null) return;
    _layoutRaf = requestAnimationFrame(() => { _layoutRaf = null; try { roomMediaApplyLayout(); } catch (_) {} });
  };
  window.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('orientationchange', relayout, { passive: true });
  window.addEventListener('scroll', relayout, { passive: true });
}

// BRR-P2-002 «Продолжить чтение» — record the deliberate working row (debounced) and
// restore it on the next open. Passive context browsing is not a position decision:
// pointer/focus row engagement, explicit navigation and playback are the writers.
// All DOM/DB; the in-range decision math lives in the pure window.ReaderProgress (gated).
let _progressTimer = null, _scrollTimer = null, _progressScrollWired = false;
let _sessionLastRow = -1, _sessionFurthestRow = -1;
let _programmaticProgressUntil = 0;
// ROW-HIGHLIGHT B — a Room-only PRESENTATION of the existing canonical working position.
// There is intentionally no second state variable and no writer here: `_sessionLastRow` is the
// in-memory mirror of text_progress.last_row_idx, while the DOM class + aria-current are derived.
function clearCurrentWorkingRow() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.querySelectorAll('tr.rm-row-current, tr[aria-current="location"]').forEach((tr) => {
    tr.classList.remove('rm-row-current');
    if (tr.getAttribute('aria-current') === 'location') tr.removeAttribute('aria-current');
  });
}
function setCurrentWorkingRow(idx) {
  const mount = $('roomReaderTable');
  const row = Math.floor(Number(idx));
  if (!mount || !Number.isFinite(row) || row < 0) return false;
  const tr = mount.querySelector('tr[data-row-idx="' + String(row) + '"]');
  if (!tr) return false;
  clearCurrentWorkingRow();
  tr.classList.add('rm-row-current');
  tr.setAttribute('aria-current', 'location');
  try { roomSyncActionOverlay(); } catch (_) {}
  return true;
}
// B8-D2 owner-live correction: durable Continue follows the LAST row where the learner
// worked, even when study moves backwards. Furthest remains a separate session-only signal
// for the manual end-of-text prompt; it is never persisted as the resume anchor.
function recordProgress(idx) {
  if (readerTextId == null || idx == null || idx < 0) return;
  // History/reload presentation restore is intentionally read-only, but it still
  // needs an in-memory working row. Async media resolution may switch the table
  // from page scrolling to its own scroller after restore; roomMediaApplyLayout()
  // uses this session anchor to keep the restored row visible. Only the durable
  // write is suppressed during the read-only window.
  _sessionLastRow = window.ReaderProgress ? window.ReaderProgress.latestProgress(_sessionLastRow, idx) : Math.floor(Number(idx));
  _sessionFurthestRow = window.ReaderProgress ? window.ReaderProgress.mergeProgress(_sessionFurthestRow, idx) : Math.max(_sessionFurthestRow, idx);
  setCurrentWorkingRow(_sessionLastRow);
  if (_roomReaderPresentationReadOnly) return;
  const tid = readerTextId, row = _sessionLastRow;
  if (_progressTimer) clearTimeout(_progressTimer);
  _progressTimer = setTimeout(() => {
    _progressTimer = null;
    try { Promise.resolve(localDb.setProgress(tid, { last_row_idx: row })).catch(() => {}); } catch (_) {}
  }, 800);
}

async function flushReaderProgress(options = {}) {
  const tid = readerTextId;
  if (_progressTimer) { clearTimeout(_progressTimer); _progressTimer = null; }
  if (tid == null) return { ok: true, textId: null, rowIndex: -1 };
  // Scroll is presentation/context browsing, not a working-row writer. Cancel only
  // its pending end-of-text observation; flush the latest deliberate interaction.
  if (_scrollTimer) { clearTimeout(_scrollTimer); _scrollTimer = null; }
  const idx = _sessionLastRow;
  // Row 0 is a real last-worked position too: persisting it intentionally
  // clears an older deeper Continue anchor (the home projection then omits
  // Continue because reopening at the beginning needs no resume affordance).
  if (idx < 0) return { ok: true, textId: String(tid), rowIndex: idx };
  await localDb.setProgress(tid, { last_row_idx: idx });
  if (options.readBack) {
    const saved = await localDb.getProgress(tid);
    if (!saved || Number(saved.last_row_idx) !== idx) throw new Error('ROOM_PROGRESS_READBACK_FAILED');
  }
  return { ok: true, textId: String(tid), rowIndex: idx };
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
  let offset = readerBarOffset();
  try { if (mount.classList.contains('room-media-scroll')) offset = Math.max(offset, mount.getBoundingClientRect().top); } catch (_) {}
  return window.ReaderProgress.topVisibleRowIdx(rows, offset);
}
function wireProgressScroll() {
  if (_progressScrollWired) return; _progressScrollWired = true;
  const onUserTakeover = () => { _programmaticProgressUntil = 0; _roomReaderPresentationReadOnly = false; };
  const onScrollKey = (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) onUserTakeover();
  };
  const onScroll = () => {
    if (readerTextId == null) return;
    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => {
      _scrollTimer = null;
      if (_roomReaderPresentationReadOnly) return;
      if (Date.now() < _programmaticProgressUntil) return;
      // Passive scrolling may inspect neighbouring paragraphs without choosing a
      // new working row. It only contributes the honest end-of-text visibility signal.
      maybeShowEndOfText();   // Epic-5 W1 — last row in view → «✓ Прочитано» card
    }, 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const mount = $('roomReaderTable'); if (mount) mount.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onUserTakeover, { passive: true });
  window.addEventListener('touchmove', onUserTakeover, { passive: true });
  const onRowEngage = (event) => {
    onUserTakeover();
    const tr = event.target && event.target.closest ? event.target.closest('tr[data-row-idx]') : null;
    if (!tr || !mount || !mount.contains(tr)) return;
    const idx = Number(tr.getAttribute('data-row-idx'));
    if (Number.isFinite(idx) && idx >= 0) recordProgress(idx);
  };
  if (mount) {
    mount.addEventListener('pointerdown', onRowEngage, { passive: true });
    mount.addEventListener('focusin', onRowEngage);
  }
  window.addEventListener('keydown', onScrollKey);
}
function positionReaderRow(idx, behavior) {
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + idx + '"]');
  if (!tr) return false;
  if (mount.classList.contains('room-media-scroll')) {
    const prev = idx > 0 ? mount.querySelector('tr[data-row-idx="' + String(idx - 1) + '"]') : null;
    const MRC = window.MaterialRevisionCore;
    if (MRC && typeof MRC.computeContextScrollTop === 'function') {
      const cRect = mount.getBoundingClientRect();
      mount.scrollTop = MRC.computeContextScrollTop({
        scroll_top: mount.scrollTop,
        container_top: cRect.top,
        container_height: mount.clientHeight,
        row_top: tr.getBoundingClientRect().top,
        previous_row_height: prev ? prev.getBoundingClientRect().height : 0,
        gap: 2,
        max_scroll_top: Math.max(0, mount.scrollHeight - mount.clientHeight),
      });
    } else {
      const top = mount.scrollTop + tr.getBoundingClientRect().top - mount.getBoundingClientRect().top;
      mount.scrollTop = Math.max(0, Math.min(mount.scrollHeight - mount.clientHeight, top - Math.max(0, (mount.clientHeight - tr.offsetHeight) / 2)));
    }
    return true;
  }
  if (tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: behavior || 'smooth' }); } catch (_) {} }
  return true;
}
function scrollToReaderRow(idx) {
  if (!positionReaderRow(idx, 'smooth')) return;
  _programmaticProgressUntil = Date.now() + 1500;
  recordProgress(idx);   // explicit Continue/bookmark/FTS jump is the new working position
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
// Load the durable last working row without seeding session-furthest state. The chosen
// route below decides whether normal Continue or an explicit bookmark/FTS anchor becomes
// the working position.
async function loadReaderResumeProgress(textId) {
  if (!window.ReaderProgress) return { progress: null, target: null };
  let prog = null;
  try { prog = await localDb.getProgress(textId); } catch (_) { prog = null; }
  if (readerTextId !== textId) return { progress: null, target: null }; // navigated away while awaiting
  const target = window.ReaderProgress.resumeTarget(prog, readerRows.length);
  const workingTarget = typeof window.ReaderProgress.workingTarget === 'function'
    ? window.ReaderProgress.workingTarget(prog, readerRows.length) : target;
  return { progress: prog, target, workingTarget };
}

// After a fresh open: offer (or, for an explicit «Продолжить» tap, perform) the resume.
function restoreReaderPosition(textId, opts, loaded) {
  if (!window.ReaderProgress || readerTextId !== textId) return;
  const target = loaded && loaded.target != null
    ? Number(loaded.target)
    : window.ReaderProgress.resumeTarget(loaded && loaded.progress, readerRows.length);
  const workingTarget = loaded && loaded.workingTarget != null
    ? Number(loaded.workingTarget)
    : (typeof window.ReaderProgress.workingTarget === 'function'
      ? window.ReaderProgress.workingTarget(loaded && loaded.progress, readerRows.length) : target);
  if (target == null) {
    if (workingTarget == null) return;
    // Row 0 is a valid explicit working position but needs no «Продолжить» banner.
    // Repaint it after normal open/reload without creating a write or completion claim.
    _sessionLastRow = workingTarget;
    setCurrentWorkingRow(workingTarget);
    if (opts && opts.resume) positionReaderRow(workingTarget, 'auto');
    return;
  }
  if (opts && opts.resume) scrollToReaderRow(target);   // explicit continue-card tap → jump
  else {
    // Normal open keeps R4's non-jumping resume banner, but the saved row is still the
    // semantic working location. Seed only the session mirror so rerenders retain it;
    // no progress write and no completion/furthest claim are created here.
    _sessionLastRow = target;
    setCurrentWorkingRow(target);
    showResumeBanner(target);
  }
}

// ── BRR Epic 5 W1 — continue-mark-read: end-of-text «✓ Прочитано» auto-prompt ─────────────
// When the furthest row reached is the final row (ReaderProgress.atTextEnd), an end-of-text card
// surfaces with a one-tap «✓ Прочитано». MANUAL mark only — never auto-set (karaoke autoplay /
// scroll-to-end must not falsely complete a text, R4 honesty). Marking writes the durable finished_at
// (localDb.setTextFinished) so the «Продолжить чтение» shelf drops it. POST-render Room DOM (mounted
// after the parity-locked table) — this card is also the mount point the Epic-5 W2 handoff extends.
let _endCardFor = null;   // textId the end card is shown for this open (idempotent per open)
function removeEndCard() { const c = $('readerEndCard'); if (c && c.remove) c.remove(); }
function resetEndCard() { removeEndCard(); _endCardFor = null; }
// True once the reader has reached the end of the text. TWO honest signals: (a) the furthest tracked
// row is the last row (karaoke auto-scroll / resume-to-end set _sessionFurthestRow to it), or (b) the last
// rendered row is visible in the viewport (plain scroll reading — topVisibleRowIdx never reports the
// last idx at document-bottom, so this is the real scroll-to-end trigger, and it also covers a
// single-screen text whose whole body is visible on open).
function readerAtEnd() {
  if (!window.ReaderProgress || !readerRows.length) return false;
  if (window.ReaderProgress.atTextEnd(_sessionFurthestRow, readerRows.length)) return true;
  const mount = $('roomReaderTable'); if (!mount) return false;
  const trs = mount.querySelectorAll('tr[data-row-idx]');
  if (!trs.length) return false;
  const rows = [];
  for (const tr of trs) { const rc = tr.getBoundingClientRect(); rows.push({ idx: Number(tr.getAttribute('data-row-idx')), top: rc.top, bottom: rc.bottom }); }
  return window.ReaderProgress.lastRowVisible(rows, window.innerHeight || 0, 60);
}
function maybeShowEndOfText() {
  if (readerTextId == null || !readerRows.length) return;
  if (!readerAtEnd()) return;
  if (_endCardFor === readerTextId) return;
  _endCardFor = readerTextId;
  renderEndOfTextCard(readerTextId);
}
async function renderEndOfTextCard(tid) {
  const reader = $('roomReader');
  if (!reader || readerTextId !== tid) return;
  let finished = false;
  try { const p = await localDb.getProgress(tid); finished = !!(p && p.finished_at); } catch (_) {}
  if (readerTextId !== tid) return;   // navigated away while awaiting
  removeEndCard();
  const card = el('div', { class: 'reader-end' }); card.id = 'readerEndCard';
  card.appendChild(el('div', { class: 'reader-end-head', i18n: 'room.resume.endOfText', text: tt('room.resume.endOfText', '— конец текста —') }));
  const actions = el('div', { class: 'reader-end-actions' });
  if (finished) {
    actions.appendChild(el('span', { class: 'reader-end-done', i18n: 'room.resume.readDone', text: tt('room.resume.readDone', '✓ прочитано') }));
    const undo = el('button', { class: 'reader-end-undo', i18n: 'room.resume.unmark', text: tt('room.resume.unmark', 'снять отметку') });
    undo.type = 'button';
    undo.addEventListener('click', async () => { try { await localDb.clearTextFinished(tid); } catch (_) {} invalidateFinishedSet(); renderEndOfTextCard(tid); });
    actions.appendChild(undo);
  } else {
    const mark = el('button', { class: 'reader-end-mark', i18n: 'room.resume.markRead', text: tt('room.resume.markRead', '✓ Прочитано') });
    mark.type = 'button';
    mark.addEventListener('click', async () => {
      mark.disabled = true;
      try { await localDb.setTextFinished(tid); } catch (_) {}
      try { completeReadingCalibration(tid).catch(() => {}); } catch (_) {}
      invalidateFinishedSet();
      try { roomToast(tt('room.resume.markedRead', 'Отмечено: прочитано')); } catch (_) {}
      renderEndOfTextCard(tid);   // flip to the finished state (offers «снять отметку»)
    });
    actions.appendChild(mark);
  }
  card.appendChild(actions);
  // B5 — one bounded result-choice row at the finish moment. Review stays in the
  // current text; Home performs the normal progress flush and returns to Learning Home.
  const paths = el('div', { class: 'reader-end-paths' });
  const review = el('button', { class: 'reader-end-review', i18n: 'room.resume.reviewWords', text: tt('room.resume.reviewWords', '🔁 Повторить слова') });
  review.type = 'button';
  review.addEventListener('click', () => { try { startTextReviewFromHandoff(); } catch (_) {} });
  paths.appendChild(review);
  const home = el('button', { class: 'reader-end-home', i18n: 'room.resume.backHome', text: tt('room.resume.backHome', 'На главную') });
  home.type = 'button';
  home.addEventListener('click', async () => { home.disabled = true; await closeReader({ returnHome: true }); });
  paths.appendChild(home);
  card.appendChild(paths);
  const provNote = $('readerProvNote');
  if (provNote && provNote.parentNode === reader) reader.insertBefore(card, provNote);
  else reader.appendChild(card);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  // B7: append the relative recorded-familiarity fan async (reuses the home-rail engine;
  // cached single-flight states → fast). Fire-and-forget so the mark/review row shows immediately.
  appendHandoffPicks(card, tid);
}

// ── B7 end-of-text handoff: relative recorded familiarity + review words ──────────
// Order ready works with the same shared comparator as the home rail, excluding the just-read text.
// Empty/unavailable profiles use the profile-free intrinsic cold start; no readiness threshold is inferred.
async function buildHandoffPicks(excludeTextKey) {
  try {
    const ready = (corpusIndex && corpusIndex.ready) || [];
    if (!ready.length || !window.CorpusVocab) return null;
    const v = await loadCorpusVocab();
    if (!v || !v.works) return null;
    const scored = await scoreReadyByRecordedFamiliarity(ready, v, excludeTextKey);
    const cards = scored.slice(0, 3).map((item) => item.card).filter(Boolean);
    if (cards.length) return { kind: 'recorded', cards };
    // cold-start fallback (profile-free intrinsic easiness ez), author-capped, top 3 — R8 no dead-end.
    const cold = ready
      .filter((c) => !(excludeTextKey && c.text_key === excludeTextKey))
      .map((c) => ({ c: c, ez: (v.works[String(c.id)] || {}).ez || 0 }))
      .filter((x) => x.ez > 0).sort((a, b) => b.ez - a.ez);
    const per = {}, pick = [];
    for (const x of cold) { const a = x.c.author || '?'; if ((per[a] || 0) >= 2) continue; per[a] = (per[a] || 0) + 1; pick.push(x.c); if (pick.length >= 3) break; }
    if (pick.length) return { kind: 'coldstart', cards: pick };
    return null;
  } catch (_) { return null; }
}

// PAS-D1 — пики «что читать дальше» для дома наставника: ТОТ ЖЕ движок и тот же снапшот
// профиля, что рельса 🎯/🔥/🌱 и handoff (R11: согласованность рекомендаций между
// поверхностями — по построению; зеркало buildHandoffPicks). Возврат:
//   { kind:'recorded', picks:[{work_id, card, title, author, familiar, denominator, load_flag,
//     frontier_pids, frontier_count}] } — exact content-free counts;
//   { kind:'coldstart', picks:[{work_id, card, title, author}] } — profile-free ez, БЕЗ
//     familiarity-полей (empty profile never becomes a fabricated zero);
//   { error:'data' } — каталог/сайдкар НЕ загрузились (НЕ путать с пустым профилем —
//     «тихий 0 ≠ реальный 0»); null — и coldstart пуст.
async function buildNextTextPicks() {
  let ready = null, v = null;
  try {
    // критика: наследовать index-дефолт v3 при отсутствии corpusRoot ЗАПРЕЩЕНО — честная ошибка
    if (!corpusRoot || !corpusRoot.index_file || !window.CorpusVocab) return { error: 'data' };
    await loadCorpusIndex();
    ready = (corpusIndex && corpusIndex.ready) || [];
    v = await loadCorpusVocab();
    if (!ready.length || !v || !v.works) return { error: 'data' };
  } catch (_) { return { error: 'data' }; }
  // A dead LocalDb is data-unavailable, never an empty learner profile.
  const projectionRaced = await Promise.race([
    ensureLearningCompassProjection().catch(() => null),
    new Promise((r) => setTimeout(() => r('__timeout__'), 8000)),
  ]);
  if (projectionRaced === '__timeout__' || !projectionRaced) return { error: 'data' };
  const scored = await scoreReadyByRecordedFamiliarity(ready, v);
  if (scored.length) {
    const picks = scored.slice(0, 3).map((item) => {
      const c = item.card, fit = item.recorded_familiarity;
      return {
        work_id: String(c.id), card: c, title: c.title, author: c.author,
        cov: Number(fit.recorded_familiar_pct_lower_bound) / 100,
        familiar: Number(fit.counts && fit.counts.familiar) || 0,
        denominator: Number(fit.counts && fit.counts.eligible_denominator) || 0,
        unresolved: Number(fit.counts && fit.counts.unresolved) || 0,
        load_flag: !!(window.CorpusVocab && window.CorpusVocab.loadFlagFor && window.CorpusVocab.loadFlagFor(item.work)),
        frontier_pids: (fit.top_unknown || []).slice(0, 8).map((row) => Number(String(row.key || '').replace(/^pid:/, ''))).filter((n) => Number.isInteger(n) && n > 0),
        frontier_count: (fit.top_unknown || []).length,
      };
    });
    return { kind: 'recorded', picks };
  }
  // cold-start: profile-free ez (зеркало buildHandoffPicks) — без cov-полей
  const cold = ready
    .map((c) => ({ c, ez: (v.works[String(c.id)] || {}).ez || 0 }))
    .filter((x) => x.ez > 0).sort((a, b) => b.ez - a.ez);
  const per = {}, picks = [];
  for (const x of cold) {
    const a = x.c.author || '?';
    if ((per[a] || 0) >= 2) continue;
    per[a] = (per[a] || 0) + 1;
    picks.push({ work_id: String(x.c.id), card: x.c, title: x.c.title, author: x.c.author });
    if (picks.length >= 3) break;
  }
  return picks.length ? { kind: 'coldstart', picks } : null;
}

// Append the «что дальше» fan to the end-card (async, guarded against navigation away).
async function appendHandoffPicks(card, tid) {
  let picks = null;
  try { picks = await buildHandoffPicks(readerTextKey); } catch (_) { picks = null; }
  if (!picks || !picks.cards.length) return;
  if (readerTextId !== tid || !card.isConnected) return;   // navigated away / card replaced while scoring
  if (card.querySelector('.reader-end-next')) return;       // idempotent
  const meta = picks.kind === 'challenge'
    ? { emoji: '🔥', key: 'room.corpus.challengeTitle', fb: 'Следующий вызов' }
    : picks.kind === 'coldstart'
      ? { emoji: '🌱', key: 'room.corpus.coldStartTitle', fb: 'С чего начать' }
      : { emoji: '🎯', key: 'room.corpus.nextTitle', fb: 'Следующий для тебя' };
  const sec = el('div', { class: 'reader-end-next' });
  // Emoji as a TEXT NODE (applyI18n only rewrites the [data-i18n] child span, so the 🎯/🔥/🌱 kind-signal
  // survives every re-localize — the home-rail title drops i18n entirely; this keeps live language-switch too).
  const head = el('div', { class: 'reader-end-next-head' });
  head.appendChild(document.createTextNode(meta.emoji + ' '));
  head.appendChild(el('span', { i18n: meta.key, text: tt(meta.key, meta.fb) }));
  sec.appendChild(head);
  const rail = el('div', { class: 'reader-end-next-rail' });
  for (const c of picks.cards) rail.appendChild(renderCorpusCard(c));   // tap → openCorpusWork (the next text)
  sec.appendChild(rail);
  card.appendChild(sec);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

// «🔁 Повторить слова»: open the study sheet in train mode and launch the in-text cloze training over
// the currently-open text's words (reuse startTraining — same flow as the «🎯 Тренировка» toggle).
// Mirrors startDueReview's sheet setup, but trains on THIS text (not the cross-text due queue).
async function startTextReviewFromHandoff() {
  if (typeof ensureStudySheet === 'function') ensureStudySheet();
  if (!_studySheet) return;
  _studySheet.hidden = false; _studySheet.classList.add('room-study-open');
  _studyMode = 'train'; _trainSession = null;
  try { _studySheet.querySelectorAll('[data-study-mode]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-study-mode') === 'train')); } catch (_) {}
  try { _studyListChrome(false); } catch (_) {}
  try { await startTraining(); } catch (_) {}
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

// ============================================================================
// CLG-P6.2 — «🤖 Объяснить предложение» (/api/agent/explain). Решение владельца
// 2026-07-06: scope СТРОГО sentence_only; consent = отдельный durable agent_read_texts
// + разовый first-use confirm ЗДЕСЬ (situated consent); сервер проверяет ОБА согласия
// на каждый вызов (fail-closed) — клиентские проверки только для честных сообщений.
// LLM-текст рендерится ТОЛЬКО textContent; деградация подписывается честно (R16/R11).
// ============================================================================
function _explainEls() {
  return {
    modal: $('roomExplainModal'), sentence: $('roomExplainSentence'),
    consent: $('roomExplainConsent'), allow: $('roomExplainAllow'), cancel: $('roomExplainCancel'),
    corpusAck: $('roomExplainCorpusAck'), corpusOk: $('roomExplainCorpusOk'), corpusCancel: $('roomExplainCorpusCancel'),
    body: $('roomExplainBody'), constructs: $('roomExplainConstructs'), meta: $('roomExplainMeta'),
    followup: $('roomExplainFollowup'), turns: $('roomExplainTurns'), q: $('roomExplainQ'), ask: $('roomExplainAsk'),
  };
}
// PAS-A2 — состояние follow-up текущего объяснения (эфемерно, живёт до нового explainRow)
let _followupCtx = null;   // { explanationId, left, baseText }
let _followupBusy = false;
function _followupSetup(r) {
  const els = _explainEls();
  if (!els.followup) return;
  if (!r || !r.explanation_id || r.followups_left == null) { els.followup.hidden = true; _followupCtx = null; return; }
  _followupCtx = { explanationId: r.explanation_id, left: Number(r.followups_left) || 0, baseText: (els.body && els.body.textContent) || '' };
  els.followup.hidden = false;
  if (els.q) { els.q.value = ''; els.q.placeholder = tt('room.explain.askPh', 'Спросить о предложении…'); }
  _followupPaintTurns();
}
function _followupPaintTurns() {
  const els = _explainEls();
  if (!els.turns || !_followupCtx) return;
  const n = _followupCtx.left;
  const out = n <= 0;
  els.turns.textContent = out
    ? tt('room.explain.turnsOut', 'Вопросы по этому объяснению исчерпаны.')
    : tt('room.explain.turnsLeft', 'Осталось вопросов') + ': ' + n + '/3';
  if (els.q) els.q.disabled = out;
  if (els.ask) els.ask.disabled = out;
}
// PAS-A3 — «проверь меня по абзацу» (advisory: НЕ оценка, память не пишется).
// Корпус — public domain; СВОЙ текст — owner 2026-07-12: окно ≤5 строк за двойным
// consent + разовое first-use раскрытие («уйдёт до 5 предложений»).
let _explainSpeakText = '';
let _compCtx = null;   // { workId|null, textKey, orderIndex, corpus }
let _compBusy = false;
function _compSetup(o, textKey, orderIndex) {
  // PAS-C1 extras-ряд: контейнеров больше нет — кнопка прячется/кажется сама
  const out = $('roomExplainCompOut'), btn = $('roomExplainCompBtn');
  if (!btn) return;
  const isCorpus = !!(o && o.corpus);
  if (!textKey || orderIndex == null) { btn.hidden = true; _compCtx = null; return; }
  _compCtx = { workId: isCorpus ? o.workId : null, textKey, orderIndex, corpus: isCorpus };
  btn.hidden = false;
  if (out) { out.hidden = true; out.textContent = ''; }
  btn.disabled = false; btn.textContent = '🧠 ' + tt('room.explain.compBtn', 'Проверь меня по абзацу');
}
async function _compRun() {
  if (_compBusy || !_compCtx) return;
  const out = $('roomExplainCompOut'), btn = $('roomExplainCompBtn');
  if (!out) return;
  // Свой текст: first-use раскрытие объёма (окно до 5 предложений уходит внешнему LLM)
  if (!_compCtx.corpus) {
    let acked = false;
    try { acked = localStorage.getItem('room.ownCompAck') === '1'; } catch (_) {}
    if (!acked) {
      out.hidden = false; out.textContent = '';
      out.appendChild(el('div', { class: 'room-comp-plate', text: tt('room.explain.ownCompAck', 'Наставник отправит внешнему LLM до 5 предложений этого текста (начиная с выбранного) и потратит 1 вызов из дневного лимита. Продолжить?') }));
      const row = el('div', { class: 'room-cloud-actions' });
      const okB = el('button', { attrs: { type: 'button' }, text: tt('room.explain.corpusAckBtn', 'Понятно, объяснить') });
      okB.addEventListener('click', () => { try { localStorage.setItem('room.ownCompAck', '1'); } catch (_) {} out.textContent = ''; _compRun(); });
      const noB = el('button', { class: 'room-cloud-ghost', attrs: { type: 'button' }, text: tt('room.explain.cancel', 'Отмена') });
      noB.addEventListener('click', () => { out.hidden = true; out.textContent = ''; });
      row.appendChild(okB); row.appendChild(noB);
      out.appendChild(row);
      return;
    }
  }
  _compBusy = true;
  if (btn) btn.disabled = true;
  out.hidden = false; out.textContent = tt('room.explain.loading', 'Наставник думает…');
  let r = null;
  try {
    const body = { text_key: _compCtx.textKey, order_index: _compCtx.orderIndex };
    if (_compCtx.corpus) { body.source = 'corpus'; body.work_id = _compCtx.workId; }
    r = await fetch('/api/agent/comprehension', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify(_withByok(body)) }).then((x) => x.json());
  } catch (_) {}
  _compBusy = false;
  if (btn) btn.disabled = false;
  if (!r || !r.ok || !Array.isArray(r.questions)) {
    const code = (r && r.error) || '';
    out.textContent = code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT'
      ? tt('room.mentor.planLimit', 'дневной лимит LLM исчерпан')
      : code === 'CLOUD_TEXTS_CONSENT_REQUIRED' ? tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.')
      : code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED' ? tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).')
      : code === 'TEXT_NOT_IN_CLOUD' ? tt('room.explain.notInCloud', 'Текст ещё не синхронизирован — запустите синк в ☁ и повторите.')
      : tt('room.explain.compFail', 'Не получилось составить вопросы — попробуйте ещё раз.');
    return;
  }
  out.textContent = '';
  // Плашка честности рендерится ВМЕСТЕ с вопросами, ДО ответа (R17: не оценка)
  out.appendChild(el('div', { class: 'room-comp-plate', text: '🧠 ' + tt('room.explain.compPlate', 'Понимание · проверка наставником, не оценка — в память не записывается.') }));
  r.questions.forEach((q) => {
    out.appendChild(el('div', { class: 'room-comp-q', text: q.question }));
    const opts = el('div', { class: 'room-comp-opts' });
    q.options.forEach((optText, oi) => {
      const b = el('button', { attrs: { type: 'button' }, text: optText });
      b.addEventListener('click', () => {
        opts.querySelectorAll('button').forEach((x, xi) => {
          x.disabled = true;
          if (xi === q.correct_index) x.classList.add('comp-right');
        });
        if (oi !== q.correct_index) b.classList.add('comp-wrong');
      });
      opts.appendChild(b);
    });
    out.appendChild(opts);
  });
  if (r.usage && r.usage.limit) out.appendChild(el('div', { class: 'room-comp-plate', text: tt('room.explain.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit + (r.key_source === 'byok' ? ' · 🤖 ' + tt('room.cloud.byokProvenance', 'ваш ключ') : '') }));
}
// PAS-B3 — «упрощённый пересказ» окна ≤5 строк (producer) → в Студию (приёмник).
// Источники: корпус И — owner-фидбэк 2026-07-12 — ЛИЧНЫЕ тексты (тот же физический
// window_5, двойной consent сервером). Приёмник — НЕСОХРАНЁННАЯ таблица через ШТАТНЫЙ
// пайплайн Студии (handoff в композер + translateTable; owner: «как дефолтная карточка»),
// НЕ прямой createText. Переход в ПОЛНУЮ Студию БЕЗ ?room=1 (room-mode прячет
// перевод-пайплайн — критика wf_7f300c39) с закрытием БД перед навигацией
// (SQLITE_CANTOPEN-race, паттерн _roomStudioNavInit).
const DRAFT_HANDOFF_KEY = 'studio.agentDraftHandoff';   // consumer: studio-agent.js (TTL 10 мин)
let _draftCtx = null;   // { workId|null, textKey, orderIndex }
let _draftBusy = false;
function _draftSetup(o, textKey, orderIndex) {
  const out = $('roomExplainDraftOut'), btn = $('roomExplainDraftBtn');
  if (!btn) return;
  const isCorpus = !!(o && o.corpus);
  if (!textKey || orderIndex == null) { btn.hidden = true; _draftCtx = null; return; }
  _draftCtx = { workId: isCorpus ? o.workId : null, textKey, orderIndex };
  btn.hidden = false;
  if (out) { out.hidden = true; out.textContent = ''; }
  btn.disabled = false; btn.textContent = '✍️ ' + tt('room.explain.draftBtn', 'Пересказ проще');
}
async function _draftRun() {
  if (_draftBusy || !_draftCtx) return;
  const out = $('roomExplainDraftOut'), btn = $('roomExplainDraftBtn');
  if (!out) return;
  _draftBusy = true;
  if (btn) btn.disabled = true;
  out.hidden = false; out.textContent = tt('room.explain.loading', 'Наставник думает…');
  let r = null;
  try {
    const body = { text_key: _draftCtx.textKey, order_index: _draftCtx.orderIndex };
    if (_draftCtx.workId) body.work_id = _draftCtx.workId;   // корпус; без него — личный путь
    r = await fetch('/api/agent/draft-retell', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify(_withByok(body)) }).then((x) => x.json());
  } catch (_) {}
  _draftBusy = false;
  if (btn) btn.disabled = false;
  if (!r || !r.ok || !r.draft || !Array.isArray(r.draft.lines)) {
    const code = (r && r.error) || '';
    out.textContent = byokErrMsg(code, r && r.provider_error) ? byokErrMsg(code, r && r.provider_error)
      : code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT' ? tt('room.mentor.planLimit', 'дневной лимит LLM исчерпан')
      : code === 'LLM_UNAVAILABLE' ? tt('room.explain.noLlm', 'без AI: перевод и морфология офлайн')
      : code === 'DRAFT_INVALID' ? tt('room.explain.draftInvalid', 'Пересказ не получился — попробуйте ещё раз.')
      : code === 'CLOUD_TEXTS_CONSENT_REQUIRED' ? tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.')
      : code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED' ? tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).')
      : code === 'TEXT_NOT_IN_CLOUD' ? tt('room.explain.notInCloud', 'Текст ещё не синхронизирован — запустите синк в ☁ и повторите.')
      : '✗ ' + tt('room.explain.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
    return;
  }
  out.textContent = '';
  // Плашка честности ДО контента: что это и что сделает кнопка (R9-провенанс)
  out.appendChild(el('div', { class: 'room-comp-plate', text: '✍️ ' + tt('room.explain.draftPlate', 'Черновик наставника — простой пересказ отрывка. «Открыть в Студии» вставит его в редактор как несохранённый текст (сборка таблицы штатным путём).') }));
  r.draft.lines.forEach((l) => {
    out.appendChild(el('div', { class: 'room-draft-he', dir: 'rtl', attrs: { lang: 'he' }, text: l.he }));
    if (l.ru) out.appendChild(el('div', { class: 'room-cloud-hint', text: l.ru }));
  });
  const metaBits = [];
  if (r.from_history) metaBits.push(tt('room.explain.fromHistory', 'из истории — без нового вызова'));
  if (r.llm_used) metaBits.push('🤖 ' + (r.key_source === 'byok' ? tt('room.cloud.byokProvenance', 'ваш ключ') + ' · ' : '') + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
  if (r.usage && r.usage.limit) metaBits.push(tt('room.explain.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
  if (metaBits.length) out.appendChild(el('div', { class: 'room-cloud-hint', text: metaBits.join(' · ') }));
  const row = el('div', { class: 'room-cloud-actions' });
  const openB = el('button', { attrs: { type: 'button' }, text: tt('room.explain.draftOpen', 'Открыть в Студии') });
  openB.addEventListener('click', () => { openB.disabled = true; _draftOpenInStudio(r); });
  row.appendChild(openB);
  out.appendChild(row);
}
async function _draftOpenInStudio(r) {
  // Owner-фидбэк 2026-07-12: драфт = НЕСОХРАНЁННАЯ карточка через ШТАТНЫЙ пайплайн
  // Студии (композер → «Собрать таблицу» → огласовки/транслит/перевод), без прямого
  // создания в библиотеке. Handoff — localStorage (same-origin, TTL у consumer'а);
  // библиотека не трогается, пока пользователь сам не нажмёт «Сохранить».
  try {
    const payload = {
      v: 1, ts: Date.now(),
      title: tt('room.explain.draftTitle', 'Черновик 🤖') + ((r.work && r.work.title) ? ' · ' + r.work.title : ''),
      source_text: r.draft.lines.map((l) => l.he).join('\n'),
      agent: { scenario: 'draft_retell', provider: r.provider || null, model: r.model || null, anchor: r.anchor || null },
    };
    localStorage.setItem(DRAFT_HANDOFF_KEY, JSON.stringify(payload));
    // ПОЛНАЯ Студия (room-режим прятал бы перевод-пайплайн); закрыть БД до перехода
    try { await localDb.closeLocalDB(); } catch (_) {}
    location.href = '/index.html';
  } catch (_) {
    const out = $('roomExplainDraftOut');
    if (out) out.appendChild(el('div', { class: 'room-cloud-hint', text: '✗ ' + tt('room.explain.draftCreateFail', 'Не удалось создать черновик в библиотеке') }));
  }
}
// ============================================================================
// PAS-C1 — «Обсудить прочитанное»: grounded-диалог по фрагменту (спека
// PAS_SLICE_C_SPEC_2026_07_12 v2). Сессия — СЕРВЕРНАЯ эфемерная (класс D):
// клиент держит только session_id; транскрипт приходит с сервера в каждом
// ответе (ре-синк после сетевого обрыва бесплатен через GET state). Скрытие
// шита (✕/Escape/backdrop) НЕ завершает сессию — она живёт до TTL 30 мин,
// повторный тап 💬 восстанавливает ленту; завершение — ТОЛЬКО явной кнопкой
// с подтверждением при потраченных ходах (критика wf_5ea38001: случайный
// backdrop-тап не должен терять оплаченные ходы). Ack-ключи РАЗДЕЛЬНЫ
// по источнику (паттерн corpusExplainAck/ownCompAck). Всё — textContent.
// ============================================================================
const TALK_ACK_CORPUS = 'room.talkAck';
const TALK_ACK_OWN = 'room.ownTalkAck';
let _talkSheet = null;
let _talkCtx = null;   // { corpus, workId|null, textKey, orderIndex, rowId|null, sessionId|null, turnsUsed, turnsLeft, busy }
let _talkVoice = null; // Wave 2 C3a — DOM-only voice draft controller; never owns Send/API.

function _talkSetup(o, textKey, orderIndex, rowId) {
  const btn = $('roomExplainTalkBtn');
  if (!btn) return;
  if (!textKey || orderIndex == null) { btn.hidden = true; return; }
  const isCorpus = !!(o && o.corpus);
  const workId = isCorpus ? (o.workId || null) : null;
  // живая сессия того же якоря переживает закрытие модала/шита — контекст не сбрасываем
  if (!_talkCtx || _talkCtx.textKey !== textKey || _talkCtx.orderIndex !== orderIndex || _talkCtx.workId !== workId) {
    _talkCtx = { corpus: isCorpus, workId, textKey, orderIndex, rowId: rowId || null, sessionId: null, turnsUsed: 0, turnsLeft: null, busy: false };
  }
  btn.hidden = false; btn.disabled = false;
  btn.textContent = '💬 ' + tt('room.talk.btn', 'Обсудить прочитанное');
}
function _talkEls() {
  const s = _talkSheet;
  return s ? {
    sheet: s, feed: s.querySelector('.room-talk-feed'), err: s.querySelector('.room-talk-err'),
    passage: s.querySelector('.room-talk-passage-body'), status: s.querySelector('.room-talk-status'),
    input: s.querySelector('.room-talk-input'), send: s.querySelector('.room-talk-send'),
    voice: s.querySelector('.room-talk-voice'), voiceStatus: s.querySelector('.room-talk-voice-status'),
    ack: s.querySelector('.room-talk-ack'), confirm: s.querySelector('.room-talk-confirm'),
  } : {};
}
function ensureTalkSheet() {
  if (_talkSheet) return _talkSheet;
  const sheet = el('div', { class: 'room-talk', attrs: { id: 'roomTalkSheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': tt('room.talk.title', 'Разговор о прочитанном') } });
  sheet.hidden = true;
  sheet.appendChild(el('div', { class: 'room-talk-backdrop', attrs: { 'data-talk-hide': '1' } }));
  const card = el('div', { class: 'room-talk-card' });
  const head = el('div', { class: 'room-talk-head' });
  head.appendChild(el('span', { class: 'room-talk-title', text: '💬 ' + tt('room.talk.title', 'Разговор о прочитанном') }));
  head.appendChild(el('button', { class: 'room-talk-end', text: tt('room.talk.stop', 'Завершить'), attrs: { type: 'button', 'data-talk-end': '1' } }));
  head.appendChild(el('button', { class: 'room-talk-x', text: '✕', attrs: { type: 'button', 'data-talk-hide': '1', 'aria-label': tt('room.morph.close', 'Закрыть') } }));
  card.appendChild(head);
  const det = el('details', { class: 'room-talk-passage' });
  det.appendChild(el('summary', { text: '📖 ' + tt('room.talk.passage', 'Отрывок') }));
  det.appendChild(el('div', { class: 'room-talk-passage-body' }));
  card.appendChild(det);
  // Плашка честности: advisory + класс D + AI-генерация иврита (R1-критика)
  card.appendChild(el('div', { class: 'room-comp-plate room-talk-plate', text: '💬 ' + tt('room.talk.plate', 'Не оценка — в память не записывается, реплики не сохраняются. Иврит наставника сгенерирован ИИ и может содержать ошибки.') }));
  const feed = el('div', { class: 'room-talk-feed' });
  card.appendChild(feed);
  const err = el('div', { class: 'room-talk-err' }); err.hidden = true;
  card.appendChild(err);
  const ack = el('div', { class: 'room-talk-ack' }); ack.hidden = true;
  card.appendChild(ack);
  const conf = el('div', { class: 'room-talk-confirm' }); conf.hidden = true;
  conf.appendChild(el('div', { class: 'room-cloud-hint', text: tt('room.talk.confirmStop', 'Завершить диалог? Ходы не вернутся.') }));
  const confRow = el('div', { class: 'room-cloud-actions' });
  const confYes = el('button', { attrs: { type: 'button' }, text: tt('room.talk.confirmYes', 'Завершить') });
  confYes.addEventListener('click', () => { conf.hidden = true; _talkStop(); });
  const confNo = el('button', { class: 'room-cloud-ghost', attrs: { type: 'button' }, text: tt('room.talk.confirmNo', 'Продолжить диалог') });
  confNo.addEventListener('click', () => { conf.hidden = true; });
  confRow.appendChild(confYes); confRow.appendChild(confNo);
  conf.appendChild(confRow);
  card.appendChild(conf);
  const row = el('div', { class: 'room-talk-inputrow' });
  const inp = el('input', { class: 'room-talk-input', attrs: { type: 'text', maxlength: '400', dir: 'auto', lang: 'he', autocomplete: 'off', placeholder: tt('room.talk.inputPh', 'Ваша реплика (лучше на иврите)…') } });
  const voice = el('button', { class: 'room-talk-voice', text: '🎙', attrs: { type: 'button', hidden: 'hidden' } });
  const send = el('button', { class: 'room-talk-send', text: '➤', attrs: { type: 'button', 'aria-label': tt('room.talk.send', 'Отправить') } });
  send.addEventListener('click', () => _talkSend());
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _talkSend(); } });
  inp.addEventListener('focus', () => { try { inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} });
  row.appendChild(inp); row.appendChild(voice); row.appendChild(send);
  card.appendChild(row);
  const voiceStatus = el('div', { class: 'room-talk-voice-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  card.appendChild(voiceStatus);
  card.appendChild(el('div', { class: 'room-talk-status room-cloud-hint' }));
  sheet.appendChild(card);
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('[data-talk-hide]')) { _talkHide(); return; }
    if (t.closest('[data-talk-end]')) { _talkEndClick(); return; }
  });
  // Escape = скрыть (НЕ-деструктивно: сессия живёт) — layered-guard не нужен
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _talkSheet && !_talkSheet.hidden) _talkHide();
  });
  _talkSheet = sheet;
  const VD = window.LinguistProVoiceDraft;
  if (VD && typeof VD.create === 'function') {
    _talkVoice = VD.create({
      input: inp, button: voice, status: voiceStatus, language: 'he-IL',
      messages: {
        micLabel: tt('room.talk.voiceMic', 'Произнести реплику на иврите'),
        stopLabel: tt('room.talk.voiceStop', 'Остановить запись'),
        listening: tt('room.talk.voiceListening', 'Слушаю иврит… Нажмите стоп для отмены.'),
        ready: tt('room.talk.voiceReady', 'Речь добавлена как черновик. Проверьте текст и отправьте сами.'),
        cancelled: tt('room.talk.voiceCancelled', 'Запись отменена — можно продолжить печатать.'),
        timeout: tt('room.talk.voiceTimeout', 'Время ожидания истекло — можно продолжить печатать.'),
        denied: tt('room.talk.voiceDenied', 'Доступ к микрофону недоступен — можно продолжить печатать.'),
        error: tt('room.talk.voiceError', 'Речь не распознана — можно продолжить печатать.'),
        privacy: tt('room.talk.voicePrivacy', 'Речь распознаёт браузер; приложение не получает и не хранит аудио.'),
      },
    });
  }
  return sheet;
}
// C3a visual gate hook: opens the real Room sheet without creating a role-play
// session. It carries no data/API authority and is used by the 380x844 oracle.
try { window.__c3aEnsureRoomTalkSheet = ensureTalkSheet; } catch (_) {}
function _talkHide() {
  if (_talkVoice) _talkVoice.cancel(true);
  if (_talkSheet) _talkSheet.hidden = true;
}
function _talkErr(msg) {
  const els = _talkEls(); if (!els.err) return;
  els.err.textContent = msg || ''; els.err.hidden = !msg;
}
// PAS-F1 — общие копии BYOK-ошибок (критика UX-1: постоянная мисконфигурация ключа не
// должна выглядеть транзиентной; UX-2: 401/403 «ключ не принят» ≠ 429 «квота ключа»).
function byokErrMsg(code, providerError) {
  if (code === 'BYOK_INVALID') return tt('room.cloud.byokInvalid', 'Ваш ключ не подходит выбранному провайдеру — проверьте его в «⚙ Наставник».');
  if (code === 'BYOK_FAILED') {
    const pe = String(providerError || '');
    if (pe === '429') return tt('room.cloud.byokQuota', 'У вашего ключа закончилась квота провайдера на сегодня.');
    if (pe === '401' || pe === '403') return tt('room.cloud.byokRejected', 'Ключ не принят провайдером — проверьте его в «⚙ Наставник».');
    return tt('room.cloud.byokFailed', 'Вызов на вашем ключе не прошёл — проверьте ключ в «⚙ Наставник».') + (pe ? ' (' + pe + ')' : '');
  }
  return null;
}
function _talkErrMsg(code, providerError) {
  const bk = byokErrMsg(code, providerError);
  if (bk) return bk;
  if (code === 'SESSION_NOT_FOUND') return tt('room.talk.expired', 'Сессия завершена (истекла или начата новая).');
  if (code === 'TURN_IN_FLIGHT') return tt('room.talk.busy', 'Наставник ещё отвечает…');
  if (code === 'TURNS_LIMIT') return tt('room.talk.turnsOut', 'Ходы этой сессии исчерпаны — завершите и начните новую.');
  if (code === 'ROLEPLAY_DAILY_LIMIT') return tt('room.talk.dailyOut', 'Дневной лимит диалогов исчерпан — продолжите завтра.');
  if (code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT') return tt('room.mentor.planLimit', 'дневной лимит LLM исчерпан');
  if (code === 'LLM_UNAVAILABLE') return tt('room.explain.noLlm', 'без AI: перевод и морфология офлайн');
  if (code === 'ROLEPLAY_INVALID') return tt('room.talk.invalid', 'Ответ не получился — попробуйте ещё раз (вызов учтён).');
  if (code === 'TEXT_NOT_IN_CLOUD' || code === 'SENTENCE_NOT_FOUND') return tt('room.talk.anchorLost', 'Текст изменился или недоступен — начните новую сессию.');
  if (code === 'CLOUD_TEXTS_CONSENT_REQUIRED') return tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.');
  if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') return tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).');
  if (code === 'CORPUS_WORK_NOT_FOUND' || code === 'CORPUS_SENTENCE_NOT_FOUND' || code === 'CORPUS_WORK_TOO_LARGE')
    return tt('room.explain.corpusUnavailable', 'Эта работа ещё не опубликована на сервере — объяснение недоступно.');
  return '✗ ' + tt('room.explain.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
}
// Коды, после которых серверная сессия гарантированно мертва — чистим клиентский id
const _TALK_FATAL = { SESSION_NOT_FOUND: 1, TEXT_NOT_IN_CLOUD: 1, SENTENCE_NOT_FOUND: 1,
  CLOUD_TEXTS_CONSENT_REQUIRED: 1, AGENT_READ_TEXTS_CONSENT_REQUIRED: 1,
  CORPUS_WORK_NOT_FOUND: 1, CORPUS_SENTENCE_NOT_FOUND: 1 };
function _talkRenderPassage(rows) {
  const els = _talkEls(); if (!els.passage) return;
  els.passage.textContent = '';
  (rows || []).forEach((r) => {
    els.passage.appendChild(el('div', { class: 'room-draft-he', dir: 'rtl', attrs: { lang: 'he' }, text: r.he }));
    if (r.ru) els.passage.appendChild(el('div', { class: 'room-cloud-hint', text: r.ru }));
  });
}
function _talkRenderFeed(transcript, openingText) {
  const els = _talkEls(); if (!els.feed) return;
  els.feed.textContent = '';
  if (openingText) els.feed.appendChild(el('div', { class: 'room-talk-op', text: '🤖 ' + openingText }));
  (transcript || []).forEach((t) => {
    if (t.who === 'mentor') {
      els.feed.appendChild(el('div', { class: 'room-talk-m', dir: 'rtl', attrs: { lang: 'he' }, text: t.he || '' }));
      if (t.ru) els.feed.appendChild(el('div', { class: 'room-talk-mru', text: t.ru }));
    } else {
      els.feed.appendChild(el('div', { class: 'room-talk-l', dir: 'auto', text: t.text || '' }));
    }
  });
  try { els.feed.scrollTop = els.feed.scrollHeight; } catch (_) {}
}
function _talkRenderStatus(usage) {
  const els = _talkEls(); if (!els.status || !_talkCtx) return;
  const bits = [];
  if (_talkCtx.turnsLeft != null) bits.push(tt('room.talk.turns', 'Ходы') + ': ' + _talkCtx.turnsUsed + '/' + (_talkCtx.turnsUsed + _talkCtx.turnsLeft));
  if (usage && usage.limit) bits.push(tt('room.explain.usage', 'AI сегодня') + ': ' + usage.user_llm_calls + '/' + usage.limit);
  // PAS-F1 (критика UX-4): диалог — самый call-тяжёлый byok-поток; провенанс в статус-строке
  if (_talkCtx.lastKeySource === 'byok') bits.push('🤖 ' + tt('room.cloud.byokProvenance', 'ваш ключ'));
  els.status.textContent = bits.join(' · ');
}
// PAS-F1: byok вплетается в body LLM-тратящих запросов (turn; start/state/stop LLM не зовут,
// но лишний byok безвреден — сервер валидирует и игнорирует на не-LLM путях... нет: start
// LLM-тратящим не является и _agentByokCtx там не зовётся — byok прикладываем ТОЛЬКО к turn).
function _withByok(body) { const b = agentByok(); return b ? { ...body, byok: b } : body; }
async function _talkFetch(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' } };
  if (body != null) opts.body = JSON.stringify(/\/turn$/.test(url) ? _withByok(body) : body);
  return fetch(url, opts).then((x) => x.json());
}
async function _talkOpen() {
  if (!_talkCtx) return;
  const mEls = _explainEls();
  if (mEls.modal) mEls.modal.hidden = true;   // модал уступает место шиту
  const sheet = ensureTalkSheet();
  sheet.hidden = false;
  _talkErr('');
  const els = _talkEls();
  if (els.confirm) els.confirm.hidden = true;
  if (_talkCtx.sessionId) { await _talkResync(); return; }
  _talkAckFlow();
}
function _talkAckFlow() {
  const key = _talkCtx.corpus ? TALK_ACK_CORPUS : TALK_ACK_OWN;
  let acked = false;
  try { acked = localStorage.getItem(key) === '1'; } catch (_) {}
  if (acked) { _talkStart(); return; }
  const els = _talkEls(); if (!els.ack) return;
  els.ack.textContent = '';
  els.ack.appendChild(el('div', { text: _talkCtx.corpus
    ? tt('room.talk.ack', 'Наставник отправит внешнему LLM до 5 предложений фрагмента и ваши реплики; 1 вызов из дневного лимита за каждый ход диалога. Продолжить?')
    : tt('room.talk.ownAck', 'Наставник отправит внешнему LLM до 5 предложений вашего текста и ваши реплики; 1 вызов из дневного лимита за каждый ход диалога. Продолжить?') }));
  const rowA = el('div', { class: 'room-cloud-actions' });
  const okB = el('button', { attrs: { type: 'button' }, text: tt('room.talk.start', 'Начать разговор') });
  okB.addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch (_) {} els.ack.hidden = true; _talkStart(); });
  const noB = el('button', { class: 'room-cloud-ghost', attrs: { type: 'button' }, text: tt('room.explain.cancel', 'Отмена') });
  noB.addEventListener('click', () => { els.ack.hidden = true; _talkHide(); });
  rowA.appendChild(okB); rowA.appendChild(noB);
  els.ack.appendChild(rowA);
  els.ack.hidden = false;
}
async function _talkStart() {
  if (!_talkCtx || _talkCtx.busy) return;
  _talkErr('');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _talkErr(tt('room.explain.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.')); return;
  }
  const CS = window.CloudSync;
  let session = null;
  try { session = CS ? await CS.me() : null; } catch (_) {}
  if (!session) { _talkErr(tt('room.explain.needLogin', 'Для объяснений нужен вход в облако — откройте ☁ в шапке.')); return; }
  _talkCtx.busy = true;
  _talkRenderFeed([], tt('room.explain.loading', 'Наставник думает…'));
  let r = null;
  try {
    const body = { text_key: _talkCtx.textKey, order_index: _talkCtx.orderIndex };
    if (_talkCtx.corpus) body.work_id = _talkCtx.workId;
    else if (_talkCtx.rowId) body.sentence_row_id = _talkCtx.rowId;
    r = await _talkFetch('POST', '/api/agent/roleplay/start', body);
  } catch (_) {}
  _talkCtx.busy = false;
  if (!r || !r.ok) {
    _talkRenderFeed([], null);
    _talkErr(_talkErrMsg((r && r.error) || ''));
    return;
  }
  _talkCtx.sessionId = r.session_id;
  _talkCtx.turnsUsed = r.turns_used || 0;
  _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
  _talkRenderPassage(r.passage);
  _talkRenderFeed([], r.opening && r.opening.text);
  _talkRenderStatus(r.usage);
  const els = _talkEls();
  if (els.input) { try { els.input.focus(); } catch (_) {} }
}
async function _talkResync() {
  if (!_talkCtx || !_talkCtx.sessionId) { _talkAckFlow(); return; }
  let r = null;
  try { r = await fetch('/api/agent/roleplay/state?session_id=' + encodeURIComponent(_talkCtx.sessionId), { credentials: 'same-origin' }).then((x) => x.json()); } catch (_) {}
  if (!r || !r.ok) {
    const code = (r && r.error) || '';
    _talkCtx.sessionId = null;
    if (code === 'SESSION_NOT_FOUND') { _talkAckFlow(); return; }   // TTL/замена/деплой — новая сессия (start бесплатен)
    _talkErr(_talkErrMsg(code, r && r.provider_error));
    return;
  }
  _talkCtx.turnsUsed = r.turns_used || 0;
  _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
  _talkRenderPassage(r.passage);
  _talkRenderFeed(r.transcript, r.opening && r.opening.text);
  _talkRenderStatus(r.usage);
}
async function _talkSend() {
  if (_talkVoice) _talkVoice.cancel(true);
  const els = _talkEls();
  const msg = (els.input && els.input.value || '').trim();
  if (!msg || !_talkCtx || _talkCtx.busy || !_talkCtx.sessionId) return;
  _talkCtx.busy = true;
  _talkErr('');
  if (els.send) els.send.disabled = true;
  // оптимистичная реплика + «думает…» (сервер-авторитетный транскрипт заменит ленту)
  if (els.feed) {
    els.feed.appendChild(el('div', { class: 'room-talk-l', dir: 'auto', text: msg }));
    els.feed.appendChild(el('div', { class: 'room-talk-op', text: tt('room.explain.loading', 'Наставник думает…') }));
    try { els.feed.scrollTop = els.feed.scrollHeight; } catch (_) {}
  }
  let r = null;
  try { r = await _talkFetch('POST', '/api/agent/roleplay/turn', { session_id: _talkCtx.sessionId, message: msg }); } catch (_) {}
  _talkCtx.busy = false;
  if (els.send) els.send.disabled = false;
  if (!r || !r.ok) {
    const code = (r && r.error) || '';
    // реплика в input НЕ очищается (критика: текст переживает ошибку и «начать заново»)
    if (_TALK_FATAL[code]) _talkCtx.sessionId = null;
    // сетевой обрыв: серверный ход мог доехать — ре-синк state вместо слепого ретрая;
    // мёртвая сессия — restart-подсказка (внутри _talkResyncAfterError)
    await _talkResyncAfterError(code);
    _talkErr(_talkErrMsg(code, r && r.provider_error));
    return;
  }
  if (els.input) els.input.value = '';
  _talkCtx.turnsUsed = r.turns_used || 0;
  _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
  _talkCtx.lastKeySource = r.key_source === 'byok' ? 'byok' : 'agent';   // PAS-F1 провенанс
  _talkRenderFeed(r.transcript, null);
  _talkRenderStatus(r.usage);
}
// после ошибки хода лента могла разойтись с сервером (оптимистичная реплика) —
// перерисовать из state, если сессия ещё жива; иначе показать restart-подсказку
async function _talkResyncAfterError(code) {
  if (_talkCtx && _talkCtx.sessionId) { await _talkResync(); return; }
  const els = _talkEls();
  if (!els.feed) return;
  const rowR = el('div', { class: 'room-cloud-actions' });
  const rb = el('button', { attrs: { type: 'button' }, text: tt('room.talk.restart', 'Начать заново') });
  rb.addEventListener('click', () => { _talkErr(''); _talkAckFlow(); });
  rowR.appendChild(rb);
  els.feed.appendChild(rowR);
  try { els.feed.scrollTop = els.feed.scrollHeight; } catch (_) {}
}
function _talkEndClick() {
  const els = _talkEls();
  if (_talkCtx && _talkCtx.sessionId && _talkCtx.turnsUsed > 0) {
    if (els.confirm) els.confirm.hidden = false;
    return;
  }
  _talkStop();
}
async function _talkStop() {
  const sid = _talkCtx && _talkCtx.sessionId;
  if (sid) { try { await _talkFetch('POST', '/api/agent/roleplay/stop', { session_id: sid }); } catch (_) {} }
  if (_talkCtx) { _talkCtx.sessionId = null; _talkCtx.turnsUsed = 0; _talkCtx.turnsLeft = null; }
  const els = _talkEls();
  if (els.feed) els.feed.textContent = '';
  if (els.passage) els.passage.textContent = '';
  _talkErr('');
  _talkHide();
}

async function _followupSend() {
  const els = _explainEls();
  const q = (els.q && els.q.value || '').trim();
  if (!q || _followupBusy || !_followupCtx || _followupCtx.left <= 0) return;
  _followupBusy = true;
  if (els.ask) els.ask.disabled = true;
  if (els.body) {
    els.body.textContent = _followupCtx.baseText + '\n\n❓ ' + q + '\n' + tt('room.explain.loading', 'Наставник думает…');
    try { els.body.scrollTop = els.body.scrollHeight; } catch (_) {}
  }
  let r = null;
  try {
    r = await fetch('/api/agent/explain/followup', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify(_withByok({ explanation_id: _followupCtx.explanationId, question: q })) }).then((x) => x.json());
  } catch (_) {}
  _followupBusy = false;
  if (!r || !r.ok) {
    const code = (r && r.error) || '';
    let msg;
    const bkF = byokErrMsg(code, r && r.provider_error);
    if (bkF) msg = bkF;
    else if (code === 'FOLLOWUP_LIMIT') { _followupCtx.left = 0; msg = tt('room.explain.turnsOut', 'Вопросы по этому объяснению исчерпаны.'); }
    else if (code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT') msg = tt('room.mentor.planLimit', 'дневной лимит LLM исчерпан');
    else if (code === 'LLM_UNAVAILABLE') msg = tt('room.explain.noLlm', 'без AI: перевод и морфология офлайн');
    else if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') msg = tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).');
    else msg = '✗ ' + tt('room.explain.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
    if (els.body) els.body.textContent = _followupCtx.baseText + '\n\n❓ ' + q + '\n' + msg;
    _followupPaintTurns();
    return;
  }
  _followupCtx.baseText = _followupCtx.baseText + '\n\n❓ ' + q + '\n💬 ' + (r.text || '');
  _followupCtx.left = Number(r.turns_left) || 0;
  if (els.body) { els.body.textContent = _followupCtx.baseText; try { els.body.scrollTop = els.body.scrollHeight; } catch (_) {} }
  if (els.q) els.q.value = '';
  _followupPaintTurns();
}
let _explainPending = null;   // { textKey, orderIndex } — ждёт first-use подтверждения
function roomExplainInit() {
  const els = _explainEls(); if (!els.modal) return;
  els.modal.addEventListener('click', (e) => {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-explain-close') === '1') { els.modal.hidden = true; _explainPending = null; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.modal.hidden) { els.modal.hidden = true; _explainPending = null; } });
  if (els.cancel) els.cancel.addEventListener('click', () => { els.modal.hidden = true; _explainPending = null; });
  if (els.allow) els.allow.addEventListener('click', async () => {
    const p = _explainPending; _explainPending = null;
    if (els.consent) els.consent.hidden = true;
    if (!p) { els.modal.hidden = true; return; }
    // Разовое подтверждение → durable consent (дальше без вопросов, отзыв — чекбоксом в ☁)
    try {
      const r = await fetch('/api/auth/consent', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
        body: JSON.stringify({ key: 'agent_read_texts', granted: true, version: 'v1' }) });
      if (!r.ok) { _explainShowMeta(tt('room.cloud.err', 'Ошибка синхронизации')); return; }
    } catch (_) { _explainShowMeta(tt('room.cloud.err', 'Ошибка синхронизации')); return; }
    _explainRequest(p.textKey, p.orderIndex, { rowIdx: p.rowIdx });
  });
  // PAS-A1 — first-use подтверждение корпусного пути: durable-consent НЕ включается
  // (классы B/C не участвуют), запоминается локальный ack-флаг
  // PAS-A-полировка — 🔊 предложения в модале
  const spkBtn = $('roomExplainSpeak');
  if (spkBtn) spkBtn.addEventListener('click', () => { try { if (_explainSpeakText) speakWord(_explainSpeakText); } catch (_) {} });
  // PAS-A3 — «проверь меня по абзацу»
  const compBtn = $('roomExplainCompBtn');
  if (compBtn) compBtn.addEventListener('click', () => { _compRun(); });
  // PAS-B3 — «пересказ проще» (corpus-only)
  const draftBtn = $('roomExplainDraftBtn');
  if (draftBtn) draftBtn.addEventListener('click', () => { _draftRun(); });
  // PAS-C1 — «обсудить прочитанное» → шит grounded-диалога
  const talkBtn = $('roomExplainTalkBtn');
  if (talkBtn) talkBtn.addEventListener('click', () => { _talkOpen(); });
  // PAS-A2 — follow-up: клик/Enter; фокус подтягивает input в видимую зону (мобильная клавиатура)
  if (els.ask) els.ask.addEventListener('click', () => { _followupSend(); });
  if (els.q) {
    els.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _followupSend(); } });
    els.q.addEventListener('focus', () => { try { els.q.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} });
  }
  if (els.corpusCancel) els.corpusCancel.addEventListener('click', () => { els.modal.hidden = true; _explainPending = null; });
  if (els.corpusOk) els.corpusOk.addEventListener('click', () => {
    const p = _explainPending; _explainPending = null;
    if (els.corpusAck) els.corpusAck.hidden = true;
    if (!p || !p.corpus) { els.modal.hidden = true; return; }
    try { localStorage.setItem('room.corpusExplainAck', '1'); } catch (_) {}
    _explainRequest(p.textKey, p.orderIndex, { corpus: true, workId: p.workId, rowIdx: p.rowIdx });
  });
}
function _explainShowMeta(text) {
  const els = _explainEls(); if (!els.meta) return;
  els.meta.textContent = text || ''; els.meta.hidden = !text;
}
// PAS-A1 — разовый HEAD-probe опубликованности works-файла: кнопка 🤖 не вешается на
// работы без файла на сервере (26/57 canon живут только в canon-zip — тупика нет).
const _corpusProbeCache = {};   // workId → true|false (память вкладки)
async function probeCorpusExplain(workId) {
  if (_corpusProbeCache[workId] == null) {
    let ok = false;
    try { const r = await fetch('/data/benyehuda/works/' + encodeURIComponent(workId) + '.json', { method: 'HEAD' }); ok = !!r.ok; } catch (_) {}
    _corpusProbeCache[workId] = ok;
  }
  if (readerCorpusWorkId !== workId) return;   // читалка уже на другом тексте
  readerCorpusExplainOk = _corpusProbeCache[workId];
  if (readerCorpusExplainOk) { try { attachExplainButtons($('roomReaderTable')); } catch (_) {} }
}
function attachExplainButtons(mount) {
  // личные тексты — сразу; корпус — после успешного probe (PAS-A1)
  const corpusOk = !readerIsOwnText && !!readerCorpusWorkId && readerCorpusExplainOk;
  if (!mount || (!readerIsOwnText && !corpusOk)) return;
  mount.querySelectorAll('tr[data-row-idx]').forEach((tr) => {
    const idx = Number(tr.getAttribute('data-row-idx'));
    const row = readerRows[idx];
    if (!row || !(row.he || row.he_niqqud)) return;
    const cell = tr.querySelector('.col-action-cell');
    if (!cell || cell.querySelector('.row-explain-btn')) return;
    const btn = el('button', {
      class: 'row-explain-btn', text: '🤖',
      attrs: { type: 'button', 'data-row-idx': String(idx),
        title: tt('room.explain.btn', 'Объяснить предложение (наставник)'),
        'aria-label': tt('room.explain.btn', 'Объяснить предложение (наставник)') },
    });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); explainRow(idx); });
    const wrap = el('div', { class: 'col-action-row col-action-row-explain' });
    wrap.appendChild(btn);
    cell.appendChild(wrap);
  });
}
async function explainRow(idx) {
  if (_explainInFlight) return;   // P6.3 — тап по другой строке при живом запросе не перерисовывает модал
  const row = readerRows[idx];
  if (!row || !readerTextKey) return;
  const isCorpus = !readerIsOwnText && !!readerCorpusWorkId;   // PAS-A1
  const orderIndex = row._v3_orderIndex != null ? Number(row._v3_orderIndex) : idx;
  const els = _explainEls(); if (!els.modal) return;
  els.modal.hidden = false;
  if (els.sentence) els.sentence.textContent = row.he_niqqud || row.he || '';
  // PAS-A-полировка (owner 2026-07-12): 🔊 предложения (speakWord — тот же путь, что Тренировка)
  // + перевод из табличной колонки — контекст и полнота картины прямо в модале.
  _explainSpeakText = row.he_niqqud || row.he || '';
  const spk = $('roomExplainSpeak'); if (spk) spk.hidden = !_explainSpeakText;
  const ruEl = $('roomExplainRu');
  if (ruEl) { const ru = String(row.ru || '').trim(); ruEl.textContent = ru; ruEl.hidden = !ru; }
  if (els.body) { els.body.hidden = true; els.body.textContent = ''; }
  if (els.constructs) { els.constructs.hidden = true; els.constructs.textContent = ''; }
  if (els.consent) els.consent.hidden = true;
  if (els.corpusAck) els.corpusAck.hidden = true;
  if (els.followup) els.followup.hidden = true;   // PAS-A2 — новый тап = новый контекст
  _followupCtx = null;
  // PAS-C1 extras-ряд: кнопки/outputs сбрасываются поимённо (контейнеров больше нет)
  const compBtn0 = $('roomExplainCompBtn'); if (compBtn0) compBtn0.hidden = true; _compCtx = null;   // PAS-A3
  const compOut0 = $('roomExplainCompOut'); if (compOut0) { compOut0.hidden = true; compOut0.textContent = ''; }
  const draftBtn0 = $('roomExplainDraftBtn'); if (draftBtn0) draftBtn0.hidden = true; _draftCtx = null;   // PAS-B3
  const draftOut0 = $('roomExplainDraftOut'); if (draftOut0) { draftOut0.hidden = true; draftOut0.textContent = ''; }
  // PAS-C1 — диалог доступен с ОТКРЫТИЯ модала: не зависит от исхода и цены explain
  // (критика wf_5ea38001); личный текст даёт стабильный row_id-якорь (реордер-дрейф).
  _talkSetup({ corpus: isCorpus, workId: readerCorpusWorkId }, readerTextKey, orderIndex,
    !isCorpus && row._v3_sentenceId ? String(row._v3_sentenceId) : null);
  _explainShowMeta('');
  // PAS-A1 — Зал offline-first, наставник онлайн: честное состояние вместо ложного «войдите в ☁»
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _explainShowMeta(tt('room.explain.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.'));
    return;
  }
  const CS = window.CloudSync;
  let session = null;
  try { session = CS ? await CS.me() : null; } catch (_) {}
  if (!session) { _explainShowMeta(tt('room.explain.needLogin', 'Для объяснений нужен вход в облако — откройте ☁ в шапке.')); return; }
  if (isCorpus) {
    // корпус: consent-классы B/C не участвуют (public domain), но first-use раскрытие
    // learner-фактов честное (критика wf_35f46603 — «ничего личного» было бы ложью)
    let acked = false;
    try { acked = localStorage.getItem('room.corpusExplainAck') === '1'; } catch (_) {}
    if (!acked) {
      _explainPending = { corpus: true, workId: readerCorpusWorkId, textKey: readerTextKey, orderIndex, rowIdx: idx };
      if (els.corpusAck) els.corpusAck.hidden = false;
      return;
    }
    _explainRequest(readerTextKey, orderIndex, { corpus: true, workId: readerCorpusWorkId, rowIdx: idx });
    return;
  }
  const consents = session.consents || {};
  if (!(consents.cloud_texts && consents.cloud_texts.granted === true)) {
    _explainShowMeta(tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.'));
    return;
  }
  if (!(consents.agent_read_texts && consents.agent_read_texts.granted === true)) {
    // first-use situated consent: показываем ЧТО будет отправлено, прежде чем включить durable
    _explainPending = { textKey: readerTextKey, orderIndex };
    if (els.consent) els.consent.hidden = false;
    return;
  }
  _explainRequest(readerTextKey, orderIndex, { rowIdx: idx });
}
// P6.3 — duplicate-tap guard: ОДИН explain-запрос в полёте на всю читалку (мобильный
// паттерн «тапнул → не дождался → тапнул ещё» не должен жечь ledger повторно; серверный
// pre-call reserve — вторая линия, эта — первая). Повторный тап при живом запросе
// игнорируется молча: модал уже показывает «Наставник думает…».
let _explainInFlight = false;
const _stripNiq = (s) => String(s || '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();
async function _explainRequest(textKey, orderIndex, opts) {
  if (_explainInFlight) return;
  _explainInFlight = true;
  const o = opts || {};
  const els = _explainEls();
  if (els.body) { els.body.hidden = false; els.body.textContent = tt('room.explain.loading', 'Наставник думает…'); }
  _explainShowMeta('');
  // PAS-A1 — таймаут/abort: «думает…» не бесконечен; закрытие модала гасит fetch
  // (серверный вызов может доехать и лечь в историю — dedupe отдаст его без нового расхода)
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch (_) {} }, 30000) : null;
  let r = null, aborted = false;
  try {
    const body = { text_key: textKey, order_index: orderIndex, scope_level: 'sentence_only' };
    if (o.corpus) { body.source = 'corpus'; body.work_id = String(o.workId || ''); }
    r = await fetch('/api/agent/explain', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify(_withByok(body)), ...(ac ? { signal: ac.signal } : {}) }).then((x) => x.json());
  } catch (e) { aborted = !!(e && e.name === 'AbortError'); }
  finally { _explainInFlight = false; if (timer) clearTimeout(timer); }
  if (!r || !r.ok) {
    const code = (r && r.error) || '';
    let msg;
    if (aborted) msg = tt('room.explain.timeout', 'Наставник не успел ответить — попробуйте ещё раз (вызов мог быть учтён).');
    else if (!r && typeof navigator !== 'undefined' && navigator.onLine === false) msg = tt('room.explain.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.');
    else if (code === 'CORPUS_WORK_NOT_FOUND' || code === 'CORPUS_SENTENCE_NOT_FOUND' || code === 'CORPUS_WORK_TOO_LARGE')
      msg = tt('room.explain.corpusUnavailable', 'Эта работа ещё не опубликована на сервере — объяснение недоступно.');
    else if (code === 'TEXT_NOT_IN_CLOUD' || code === 'SENTENCE_NOT_FOUND') msg = tt('room.explain.notInCloud', 'Текст ещё не синхронизирован — запустите синк в ☁ и повторите.');
    else if (code === 'CLOUD_TEXTS_CONSENT_REQUIRED') msg = tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.');
    else if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') msg = tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).');
    else msg = '✗ ' + tt('room.explain.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
    if (els.body) { els.body.hidden = false; els.body.textContent = msg; }
    return;
  }
  // LLM/фолбэк-текст — СТРОГО textContent (никогда не HTML)
  let bodyText = r.text || '';
  // PAS-A1 — skeleton-сверка: OPFS-издание могло отстать от тома → честная приписка вместо
  // молчаливого объяснения другого предложения (критика: silent wrongness)
  if (o.rowIdx != null && r.sentence && r.sentence.he) {
    const local = readerRows[o.rowIdx];
    const localHe = local ? (local.he || local.he_niqqud || '') : '';
    if (localHe && _stripNiq(localHe) !== _stripNiq(r.sentence.he)) {
      bodyText += '\n\n⚠ ' + tt('room.explain.editionMismatch', 'Текст работы обновился — объяснение может не совпадать с показанной строкой.');
    }
  }
  if (els.body) { els.body.hidden = false; els.body.textContent = bodyText; }
  // P6.4 — детерминированные construct-титулы сервера (видны ВСЕГДА, не только в fallback)
  if (els.constructs && Array.isArray(r.constructs) && r.constructs.length) {
    els.constructs.textContent = '⚙ ' + r.constructs.map((c) => c && c.title).filter(Boolean).join(' · ');
    els.constructs.hidden = false;
  }
  // PAS-A1 — мета: провенанс источника + provider + видимость квоты в точке трат (R16)
  const metaParts = [];
  if (r.source === 'corpus') metaParts.push(tt('room.explain.srcCorpus', 'Источник: корпус Бен-Иегуды · public domain'));
  if (r.from_history) metaParts.push(tt('room.explain.fromHistory', 'из истории — без нового вызова'));
  if (r.llm_used) metaParts.push('🤖 ' + (r.key_source === 'byok' ? tt('room.cloud.byokProvenance', 'ваш ключ') + ' · ' : '') + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
  else if (!r.from_history) metaParts.push((byokErrMsg(r.degraded_reason === 'BYOK_FAILED' ? 'BYOK_FAILED' : '', r.provider_error) || (tt('room.explain.noLlm', 'без AI: перевод и морфология офлайн') + (r.degraded_reason ? ' (' + r.degraded_reason + ')' : ''))));
  if (r.usage && r.usage.limit) metaParts.push(tt('room.explain.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
  _explainShowMeta(metaParts.join(' · '));
  _followupSetup(r);   // PAS-A2 — вопросы к этому объяснению (≤3, серверный лимит)
  _compSetup(o, textKey, orderIndex);   // PAS-A3 — corpus-only «проверь меня»
  _draftSetup(o, textKey, orderIndex);  // PAS-B3 — corpus-only «пересказ проще»
}

// PAS-A4 — host-обвязка word-explain для tap-карточки: источник (корпус/личный), честные
// offline/consent-состояния, таймаут; ответ карточке = {ok, text, meta} | {ok:false, message}.
async function explainWordFromCard(p) {
  if (!p || !p.surface || p.orderIndex == null || !readerTextKey) {
    return { ok: false, message: tt('room.explain.err', 'Не удалось получить объяснение') };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, message: tt('room.explain.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.') };
  }
  const isCorpus = !readerIsOwnText && !!readerCorpusWorkId;
  if (isCorpus) {
    let acked = false;
    try { acked = localStorage.getItem('room.corpusExplainAck') === '1'; } catch (_) {}
    if (!acked) return { ok: false, message: tt('room.explain.corpusAckFirst', 'Сначала подтвердите корпус-объяснения: тапните 🤖 у строки (разовое подтверждение).') };
  }
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch (_) {} }, 30000) : null;
  let r = null;
  try {
    const body = { surface: p.surface, text_key: readerTextKey, order_index: p.orderIndex, displayed: p.displayed || null };
    if (isCorpus) { body.source = 'corpus'; body.work_id = readerCorpusWorkId; }
    r = await fetch('/api/agent/explain-word', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify(_withByok(body)), ...(ac ? { signal: ac.signal } : {}) }).then((x) => x.json());
  } catch (_) {}
  finally { if (timer) clearTimeout(timer); }
  if (!r || !r.ok) {
    const code = (r && r.error) || '';
    let message;
    if (code === 'CLOUD_TEXTS_CONSENT_REQUIRED') message = tt('room.explain.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.');
    else if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') message = tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).');
    else if (code === 'CORPUS_WORK_NOT_FOUND' || code === 'CORPUS_SENTENCE_NOT_FOUND' || code === 'CORPUS_WORK_TOO_LARGE')
      message = tt('room.explain.corpusUnavailable', 'Эта работа ещё не опубликована на сервере — объяснение недоступно.');
    else if (!r && typeof navigator !== 'undefined' && navigator.onLine === false)
      message = tt('room.explain.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.');
    else message = '✗ ' + tt('room.explain.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
    return { ok: false, message };
  }
  const metaParts = [];
  if (r.source === 'corpus') metaParts.push(tt('room.explain.srcCorpus', 'Источник: корпус Бен-Иегуды · public domain'));
  if (r.from_history) metaParts.push(tt('room.explain.fromHistory', 'из истории — без нового вызова'));
  if (r.llm_used) metaParts.push('🤖 ' + (r.key_source === 'byok' ? tt('room.cloud.byokProvenance', 'ваш ключ') + ' · ' : '') + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
  else if (!r.from_history) metaParts.push((byokErrMsg(r.degraded_reason === 'BYOK_FAILED' ? 'BYOK_FAILED' : '', r.provider_error) || (tt('room.explain.noLlm', 'без AI: перевод и морфология офлайн') + (r.degraded_reason ? ' (' + r.degraded_reason + ')' : ''))));
  if (r.usage && r.usage.limit) metaParts.push(tt('room.explain.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
  return { ok: true, text: r.text || '', meta: metaParts.join(' · ') };
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

// Retention P5.6 — owner fork R-2(a), 2026-07-02: a MANUAL level mark (l1–l4) seeds the FSRS
// schedule, so the reading-native loop engages without the trainer (the owner's לגור case:
// mark-only words previously never earned a ring). known/ignore/new do NOT seed (known =
// cleared). Oracle-clean by construction: the seed row (kind='seed', source='seed-manual')
// replays through the SAME seedFromSm2 path as SM2 handover seeds — stored projection ==
// replay(log) byte-for-byte. Seed-once by PK (`seed:<key>`); a word already scheduled (or ever
// seeded before) is left untouched — its truth already lives in the log/schedule.
// Returns the effective schedule for the in-card closure (P5.7 Т1): { dueMs } for an l1–l4 mark
// (whether freshly seeded or already scheduled — do-no-harm), null otherwise. The caller shows
// «✓ В повторении · вернётся <when>» from it, so the loop closes at the moment of action.
// R1 source-at-mark (ROOM_DUE_CONTINUITY §3) — canonical source {textKey, sentenceId, orderIndex,
// surface} from a tap occurrence, VERIFIED resolvable (getSentenceForReview) before it is ever
// written: corpus works have no OPFS sentences (R4 re-anchors them later) → an unresolvable occ
// writes NOTHING, so «sourced» keeps meaning «servable» (no new §1 contradiction class).
// Тела канона (source-at-mark + метка с FSRS-посевом) — в morph-host.js.
const occToVerifiedSource = (occ) => morphHost.occToVerifiedSource(occ);
const markWordStatus = (lemmaKey, status, source) => morphHost.markWordStatus(lemmaKey, status, source);
// R3.1 (ROOM_DUE_CONTINUITY, live-диагноз 2026-07-11) — зомби-класс: слова, размеченные l1–l4 ДО
// P5.6 (метка тогда НЕ сеяла расписание) — в логе только mark-строки, srs_due NULL: «В работе» по
// ярлыку, но невидимы ЛЮБОЙ очереди на ЛЮБОЙ поверхности, навсегда (live-замер owner: 60+ из 229).
// Идемпотентный boot-sweep: каждое такое слово проходит ТОТ ЖЕ канонический markWordStatus-путь
// (seed kind='seed'/'seed-manual' → oracle-clean replay; исторический seed без расписания →
// restore). Повторная запись того же статуса mark-строку НЕ минтит (_emitMarkRow guard). После
// первого прохода запрос пуст — постоянный self-heal, не одноразовая миграция. Fire-and-forget
// после первой отрисовки; сеянные слова уходят на сервер обычным cloud-sync.
async function backfillZombieMarkSeeds() {
  try {
    const rows = await localDb.dbQuery(
      "SELECT lemma_key, status FROM word_status WHERE status IN ('l1','l2','l3','l4') AND srs_due IS NULL LIMIT 300", []);
    if (!rows || !rows.length) return;
    let seeded = 0;
    for (const r of rows) {
      try { const res = await markWordStatus(String(r.lemma_key), String(r.status)); if (res && res.dueMs) seeded++; } catch (_) {}
    }
    if (seeded) {
      try { console.info('[room] R3.1 zombie-mark backfill: seeded', seeded, 'of', rows.length); } catch (_) {}
      try { refreshDueBadge(); } catch (_) {}
    }
    return seeded;
  } catch (_) { return 0; }
}
// Gate hook (smoke:memory-canon): cross-page OPFS navigation silently lands on the fallback VFS
// in headless Playwright, so the sweep is asserted same-page through this handle instead.
try { window.__r31BackfillZombieSeeds = backfillZombieMarkSeeds; } catch (_) {}
// R4a — boot-time HEAL DRAIN: the unsourced backlog (live measure: 179 scheduled words whose
// contexts sit in local sentences under INFLECTED forms) is healed in the background, budget
// 48 words per boot — no item building, just verify+write через ТОТ ЖЕ identity-гейт
// (_r2VerifyCandidate) и updateSrsSource fillOnly. Misses are day-cached (.v3) so successive
// boots advance through the backlog instead of re-scanning the same dead prefix.
async function r4HealDrain() {
  try {
    const R = window.ReaderMorph; if (!R) return;
    let pool = [];
    try { pool = (await localDb.getDueWithSource(Date.now() + 400 * 86400000)) || []; } catch (_) { pool = []; }
    const uns = pool.filter((d) => !(d.source && d.source.surface));
    if (!uns.length) return;
    const miss = _r2MissGet();
    const cand = [];
    for (const d of uns) {
      if (cand.length >= 48) break;
      if (_r2MissFresh(miss, d.lemmaKey)) continue;
      const pidEntry = await _r2PidEntry(d.lemmaKey);
      const needle = (await _r2DeriveSurface(d.lemmaKey)) || (pidEntry ? R.stripNiqqud(String(pidEntry.lemma || pidEntry.lemma_niqqud || '')).trim() : null);
      const needles = _r4NeedlesFor(needle, pidEntry);
      if (needles.length) cand.push({ d, needles });
    }
    if (!cand.length) return;
    let healed = 0;
    // chunk the union of needle sets under the 96-needle cap → a few batched passes, not N scans
    for (let i = 0; i < cand.length;) {
      const chunk = []; const needles = [];
      while (i < cand.length && needles.length + cand[i].needles.length <= 90) {
        for (const n of cand[i].needles) if (needles.indexOf(n) < 0) needles.push(n);
        chunk.push(cand[i]); i++;
      }
      if (!chunk.length) break;
      let rows = [];
      try { rows = (await localDb.findSentencesForWords(needles, 400)) || []; } catch (_) { rows = []; }
      for (const c of chunk) {
        let hit = null;
        for (const row of rows) {
          const hp = String(row.he_plain || '');
          if (!c.needles.some((n) => hp.indexOf(n) >= 0)) continue;
          try { hit = await _r2VerifyCandidate(R, c.d, c.needles, row); } catch (_) { hit = null; }
          if (hit) { hit.row = row; break; }
        }
        if (hit) {
          try {
            await localDb.updateSrsSource(c.d.lemmaKey, { textKey: hit.row.text_key || null,
              sentenceId: hit.row.id != null ? String(hit.row.id) : null,
              orderIndex: hit.row.order_index != null ? Number(hit.row.order_index) : null,
              surface: hit.tskel, fillOnly: true });
            healed++;
          } catch (_) {}
        } else { _r2MissMark(miss, c.d.lemmaKey); }
      }
    }
    if (healed) {
      try { console.info('[room] R4a heal-drain: sourced', healed, 'of', cand.length, 'scanned (' + uns.length + ' backlog)'); } catch (_) {}
      try { refreshDueBadge(); } catch (_) {}
    }
  } catch (_) {}
}
try { window.__r4HealDrain = r4HealDrain; } catch (_) {}   // gate hook (same-page, как __r31)
// P5.7 Т1/Т3 — humanize a future due into «сегодня»/«через ~N дн.»/«через ~N ч.» for closures + badge.
function _dueWhenText(dueMs) {
  const d = (Number(dueMs) || 0) - Date.now();
  if (d <= 0) return tt('room.morph.mark.returnsToday', 'вернётся сегодня');
  const days = Math.round(d / 86400000);
  if (days >= 1) return tt('room.morph.mark.returnsIn', 'вернётся через ~{n} дн.').replace('{n}', String(days));
  return tt('room.morph.mark.returnsInH', 'вернётся через ~{n} ч.').replace('{n}', String(Math.max(1, Math.round(d / 3600000))));
}

// Retention P5 — shown-vs-graded tally for the reveal-then-grade card (MNAR control, recon §6.2):
// reading-tap enters the P6 calibration/weight-fit ONLY when abandonment (shown−graded)/shown is
// below the precommitted threshold. Device-local diagnostics (like the marker tally) — counters,
// not reviews; the review truth stays in review_log.
const bumpTapStat = (kind) => morphHost.bumpTapStat(kind);
// Retention P5 — THE write step of a reading-tap grade. Mirrors checkTrainAnswer's sequence
// exactly (seed-row@now−1ms → review-row → setWordStatus(sched)) with two deliberate deltas:
//   • D8(a): the manual level is NOT moved — nextLevel is NOT called; a self-report must not
//     retire a word from i+1/sessions/the production tier. The stored status is re-written AS-IS
//     (setWordStatus needs a status; '' would DELETE the row — hence the guard). A word with NO
//     manual status persists its schedule srs-only via updateSrsState (P4.1) — the oracle
//     replay(log)==stored holds for Anki-carrier ('') and never-tracked words too.
//   • source='reading-tap', channel='reading:tap' — its own stratum for P6 (recon §4.4/§6.8:
//     excluded from weight fitting until the abandonment gate passes; demotion threshold 15 п.п.
//     precommitted). study_day: a post-reveal grade IS a genuine retrieval attempt → recordRecall
//     (a tap without reveal+grade never reaches here — the streak can't be tapped for free).
// Тело write-step'а — в morph-host.js (канал reading:tap, D8a/P4.1 без изменений).
const gradeReadingTap = (card, occ, correct, prev) => morphHost.gradeReadingTap(card, occ, correct, prev);

// Attach the light morphology-on-tap layer (reader-morph.js): wraps he/niqqud words
// into tappable spans (post-render, parity-safe — the reader-core builder is untouched)
// → a tap shows a light root/binyan/POS/gloss card with honest provenance. The 3.3 MB
// offline Pealim dataset loads lazily on the FIRST tap, never at text-open.
function attachReaderMorph(mount) {
  if (!mount || !window.ReaderMorph) return;
  if (readerMorph) { try { readerMorph.detach(); } catch (_) {} readerMorph = null; }
  morphHost.clearCtxCache();   // fresh per (re)attach
  const opts = {
    getRow: (i) => readerRows[i],
    saveWord: roomSaveWord,
    lookupNote: roomLookupNote,
    loadWordNote: roomLoadWordNote,
    saveWordPersonal: roomSaveWordPersonal,
  };
  opts.contextProvider = makeContextProvider();   // always wired; gates per-tap on consent (auto once granted)
  // Epic-2 #2 — per-card one-off refine: a separate provider that does NOT consult the global
  // consent (the per-card confirm IS the consent), and the gate that decides whether to OFFER it.
  opts.refineContext = makeRefineProvider();
  opts.canRefine = canRefine;
  opts.grantContextConsent = () => morphHost.grantContextConsent();
  // Epic-3a — pronounce the headword (GCP→browser) + word-status map for the root-family chips
  // (reuses the single-flight ensureWordStates cache; chips colour known/learning/new).
  opts.speakWord = speakWord;
  opts.getWordStates = ensureWordStates;
  // Epic 4 — one-tap manual status: persist (separate word_status store, no flashcard) then
  // invalidate the cached states + repaint the text so the colour updates immediately.
  opts.getWordStatus = (lk) => localDb.getWordStatus(lk);
  opts.setWordStatus = async (lk, st, occ) => {
    let res = null;
    // R1 source-at-mark: the tap/long-press occurrence (additive 3rd arg from reader-morph) becomes
    // a verified source, so a fresh mark is immediately visible to the sourced-due queue/ahead pool.
    let source = null;
    try { source = await occToVerifiedSource(occ); } catch (_) {}
    try { res = await markWordStatus(lk, st, source); } catch (_) {}   // P5.6 R-2(a): l1–l4 mark seeds the schedule
    morphHost.invalidateWordStates();
    try { applyDecorations(); } catch (_) {}
    try { refreshDueBadge(); } catch (_) {}   // seeding may change the future-due horizon
    // P5.7 Т1 — closure for the LONG-PRESS popover path (no card open to show the in-card confirm):
    // a quiet toast. The card path returns `res` so ReaderMorph renders its richer in-card banner.
    try {
      const cardOpen = !!document.querySelector('.rm-sheet.rm-open');
      if (!cardOpen && res && res.dueMs) roomToast('🔁 ' + _dueWhenText(res.dueMs));
    } catch (_) {}
    return res;
  };
  // T-b — manual translation for out-of-dict words: re-surface a saved user-meaning on re-open
  // (lookup) + persist a new one into the canonical word_study note (save, Anki-synced).
  opts.lookupUserMeaning = roomLookupUserMeaning;
  opts.saveUserMeaning = roomSaveUserMeaning;
  // Retention P5 — reading-native retrieval glue (recon §6, D4(b)+D8(a)): getDueSchedule feeds the
  // recall-mode gate with the SAME extended rows fsrsStep resumes from, and rides the status-axis
  // toggle so a hidden marker never springs a surprise recall card; noteRecallShown/gradeReadingTap
  // own the shown-vs-graded tally + the one write step (review_log + FSRS; level untouched).
  opts.getDueSchedule = async () => {
    if (!wordStatusEnabled()) return null;
    try { return (await localDb.getSrsSchedule()) || {}; } catch (_) { return null; }
  };
  opts.noteRecallShown = () => bumpTapStat('shown');
  opts.gradeReadingTap = gradeReadingTap;
  // PAS-A4 — «🤖 Объяснить (наставник)» на карточке: слово В ЭТОМ предложении. Источник
  // (личный/корпус) и все честные состояния решает host; reader-morph только рендерит.
  opts.explainWord = explainWordFromCard;
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

// Перекрасить <col> без пересборки таблицы. ВАЖНО: билдер пишет ширины ИНЛАЙНОМ
// (style="width:…%"), поэтому CSS-правилом их не задать — проверено, `!important`
// проигрывает инлайну при table-layout: fixed. Значит ширины всегда назначаются
// здесь, в JS, после рендера.
// Ширина рельса. Замер живого DOM 2026-08-05: содержимое action-ячейки занимает 57px
// при колонке 85px, а ▶ и сегодня показывается только на активной строке — колонка была
// широкой не из-за иконок, а из-за доли. 34px хватает на ▶ 26x26 плюс рамки.
const ROOM_RAIL_PX = 34;
function roomPaintColWidths() {
  const mount = $('roomReaderTable');
  const table = mount && mount.querySelector('#proTable');
  if (!table) return;
  const visible = readerConfig().visibleColumns;
  const eff = readerCore.computeEffectiveWidths(visible, roomTableWidths);
  const cols = [...table.querySelectorAll('colgroup col[data-col]')];
  if (!cols.length) return;
  const total = table.getBoundingClientRect().width;
  const railOn = studyModeOn() && actionColMode() === 'rail' && visible.action && total > 0
    && cols.some((c) => c.getAttribute('data-col') === 'action');
  if (railOn) {
    // Пересчёт ПОСЛЕ нормализации: доля action фиксируется в пикселях, остальное делится
    // между содержательными колонками пропорционально их базам. Иначе доля action снова
    // уплывёт при смене набора колонок — корень исходной жалобы (15% → 25.4%).
    const railPct = Math.min(40, (ROOM_RAIL_PX / total) * 100);
    const rest = 100 - railPct;
    let sum = 0;
    cols.forEach((c) => { const k = c.getAttribute('data-col'); if (k !== 'action') sum += Number(eff[k] || 0); });
    if (sum <= 0) sum = 1;
    cols.forEach((c) => {
      const k = c.getAttribute('data-col');
      const pct = k === 'action' ? railPct : (Number(eff[k] || 0) / sum) * rest;
      c.style.width = pct.toFixed(6) + '%';
    });
    return;
  }
  cols.forEach((c) => {
    const k = c.getAttribute('data-col');
    c.style.width = Number(eff[k] || 0).toFixed(6) + '%';
  });
}
// «Скрыта»: служебной колонки нет, поэтому кнопки строки всплывают на АКТИВНОЙ строке —
// той, что уже подсвечена воспроизведением или караоке. Новых жестов не вводим: тап по
// строке и так перематывает медиа, а значит делает её активной.
// ⚠ Проксировать клик на «настоящие» кнопки строки НЕЛЬЗЯ: ☆ и 🤖 инжектятся в
// .col-action-cell, которой в этом режиме не существует. Поэтому оверлей зовёт те же
// обработчики напрямую — одна логика, без второй копии поведения.
let _overlayRowIdx = -1;
function roomSyncActionOverlay() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  let box = $('roomRowActions');
  if (actionColMode() !== 'hidden' || !studyModeOn()) { if (box) box.hidden = true; return; }
  const tr = mount.querySelector('#proTable tbody tr.row-playing, #proTable tbody tr.smk-row-active, #proTable tbody tr.rm-row-current');
  if (!tr) { if (box) box.hidden = true; return; }
  _overlayRowIdx = Number(tr.getAttribute('data-row-idx'));
  if (!box) {
    box = el('div', { class: 'room-row-actions', attrs: { id: 'roomRowActions', role: 'toolbar', 'aria-label': tt('room.study.actionCol', 'Служебная колонка') } });
    const mk = (act, label, title, onClick) => {
      const b = el('button', { text: label, attrs: { type: 'button', 'data-act': act, title: title, 'aria-label': title } });
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (_overlayRowIdx >= 0) onClick(_overlayRowIdx, b); });
      box.appendChild(b);
      return b;
    };
    mk('tts', '▶', tt('room.reader.readAloud', 'Озвучить строку'),
      (i) => { try { if (readerAudio && readerAudio.play) readerAudio.play(i); } catch (_) {} });
    mk('bookmark', '☆', tt('room.bookmark.add', 'Закладка'), (i, b) => toggleBookmark(i, b));
    mk('explain', '🤖', tt('room.explain.btn', 'Объяснить предложение (наставник)'), (i) => explainRow(i));
    mount.appendChild(box);
  }
  // 🤖 доступна по тем же правилам, что и в колонке: свои тексты сразу, корпус — после probe.
  const explainOk = readerIsOwnText || (!!readerCorpusWorkId && readerCorpusExplainOk);
  const explainBtn = box.querySelector('button[data-act="explain"]');
  if (explainBtn) explainBtn.hidden = !explainOk;
  // ☆ отражает реальное состояние закладки этой строки (иначе оверлей врал бы).
  const bmBtn = box.querySelector('button[data-act="bookmark"]');
  const row = readerRows[_overlayRowIdx];
  if (bmBtn && row) {
    const on = !!(_bookmarkSet && row._v3_sentenceId && _bookmarkSet.has(String(row._v3_sentenceId)));
    bmBtn.classList.toggle('bookmarked', on);
    bmBtn.textContent = on ? '★' : '☆';
    bmBtn.setAttribute('aria-pressed', String(on));
  }
  const rr = tr.getBoundingClientRect(), mr = mount.getBoundingClientRect();
  box.hidden = false;
  box.style.top = (rr.top - mr.top + mount.scrollTop) + 'px';
  box.style.left = (rr.left - mr.left) + 'px';
}
window.roomSyncActionOverlay = roomSyncActionOverlay;   // гейт дергает синхронизацию явно

// Дисклеймер «Перевод и огласовка — машинные» переезжает в КОНЕЦ окна таблицы: он честен
// и обязан остаться (R9), но 17px постоянной служебной строки посреди учебного экрана —
// плата ни за что. В конце материала он виден ровно тогда, когда дочитали.
// ВАЖНО: rerenderReader делает mount.innerHTML = …, поэтому перенос повторяется после
// каждого рендера — тем же паттерном, что медиа-бар и закладки.
// ⚠ Узел живёт ВНУТРИ mount, а rerenderReader делает mount.innerHTML = … — то есть
// уничтожает его насовсем. Поэтому функция самовосстанавливающаяся: нет узла — создаём
// заново с тем же id и data-i18n (перенос «сохрани ссылку и верни обратно» здесь не
// работает, ссылка указывает на уже удалённый элемент).
function roomPlaceProvNote() {
  const wrap = $('roomReaderTable');
  if (!wrap) return;
  let note = $('readerProvNote');
  if (!note) {
    note = el('p', {
      class: 'reader-prov-note',
      i18n: 'room.prov.note',
      text: tt('room.prov.note', 'Перевод и огласовка — машинные, не вычитаны.'),
      attrs: { id: 'readerProvNote', dir: 'auto' },
    });
  }
  if (note.parentElement !== wrap || note.nextElementSibling) wrap.appendChild(note);
}

let roomColResize = null;
function attachRoomColResize() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  if (roomColResize) { try { roomColResize.detach(); } catch (_) {} roomColResize = null; }
  roomColResize = readerCore.attachColumnResize(mount, {
    getState: () => ({ visibleColumns: readerConfig().visibleColumns, baseWidths: roomTableWidths }),
    onLiveUpdate: () => roomPaintColWidths(),
    onCommit: () => saveRoomTableWidths(),
    onResetPair: (leftKey, rightKey) => {
      const order = readerCore.TABLE_COL_ORDER;
      roomTableWidths[order.indexOf(leftKey)] = ROOM_WIDTHS_DEFAULT[order.indexOf(leftKey)];
      roomTableWidths[order.indexOf(rightKey)] = ROOM_WIDTHS_DEFAULT[order.indexOf(rightKey)];
      readerCore.normalizeVisibleBaseWidthsTo100(readerConfig().visibleColumns, roomTableWidths);
      saveRoomTableWidths();
      roomPaintColWidths();
    },
  });
}

function rerenderReader() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  mount.innerHTML = readerCore.buildBilingualTableHtml(readerRows, readerConfig());
  attachReaderAudio();
  try { refreshFindAfterRerender(); } catch (_) {}   // BRR-S15 — re-apply find marks after a table rebuild
  try { roomMediaRefresh(); } catch (_) {}   // media player: re-bind стейджа + re-инъекция ▶︎ после пересборки таблицы
  try { roomUpdateTheadTop(); } catch (_) {}   // sticky-шапка: высота бара могла измениться
}

function buildAidsPanel() {
  const panel = $('readerAids');
  if (!panel) return;
  panel.innerHTML = '';
  // ── Блок учебного режима — ПЕРВЫМ в панели (решение D2: новых кнопок в баре нет) ──
  const studyBlock = el('div', { class: 'reader-study-block', attrs: { id: 'roomStudyBlock' } });
  const studyLab = el('label', { class: 'reader-study-toggle' });
  const studyCb = el('input', { attrs: { type: 'checkbox', id: 'roomStudyToggle' } });
  studyCb.checked = studyModeOn();
  studyCb.addEventListener('change', () => studyModeSet(studyCb.checked));
  studyLab.appendChild(studyCb);
  studyLab.appendChild(el('span', { i18n: 'room.study.toggle', text: tt('room.study.toggle', '🎬 Учебный режим') }));
  studyBlock.appendChild(studyLab);
  studyBlock.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.study.hint', text: tt('room.study.hint', 'Экран отдаётся видео и таблице') }));

  // Служебная колонка: Полная / Рельс / Скрыта. Видимость СОДЕРЖАТЕЛЬНЫХ колонок уже
  // управляется элементами ниже — не дублируем; без переключателя была только эта.
  const segRow = el('div', { class: 'reader-study-row' });
  segRow.appendChild(el('span', { i18n: 'room.study.actionCol', text: tt('room.study.actionCol', 'Служебная колонка') }));
  const seg = el('div', { class: 'reader-study-seg', attrs: { id: 'roomActionColSeg', role: 'radiogroup', 'aria-label': tt('room.study.actionCol', 'Служебная колонка') } });
  [['full', 'room.study.actionFull', 'Полная'], ['rail', 'room.study.actionRail', 'Рельс'], ['hidden', 'room.study.actionHidden', 'Скрыта']]
    .forEach(([mode, key, fb]) => {
      const b = el('button', { i18n: key, text: tt(key, fb), attrs: { type: 'button', 'data-mode': mode, role: 'radio' } });
      b.setAttribute('aria-checked', String(actionColMode() === mode));
      b.addEventListener('click', () => {
        actionColModeSet(mode);
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute('data-mode') === mode)));
      });
      seg.appendChild(b);
    });
  segRow.appendChild(seg);
  studyBlock.appendChild(segRow);

  const wRow = el('div', { class: 'reader-study-row' });
  wRow.appendChild(el('span', { i18n: 'room.study.widths', text: tt('room.study.widths', 'Ширины колонок') }));
  const wReset = el('button', { i18n: 'room.study.widthsReset', text: tt('room.study.widthsReset', '↺ Сброс'), attrs: { type: 'button', id: 'roomWidthsReset' } });
  wReset.addEventListener('click', roomResetColWidths);
  wRow.appendChild(wReset);
  studyBlock.appendChild(wRow);
  studyBlock.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.study.widthsHint', text: tt('room.study.widthsHint', 'Тяните ‖ между заголовками; двойной тап — сброс пары') }));
  panel.appendChild(studyBlock);
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
  const wsCb = el('input', { attrs: { type: 'checkbox', id: 'readerWordStatusToggle' } });
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

// ── Epic-6 W1-a — reader source attribution + header context (R6/R9) ──────────────
// Honest surfacing of ALREADY-stored corpus metadata (source_meta_json.corpus, which
// readerCore.openText already returns as res.text): author · era · register · the
// per-work source link. Self-hides for personal/non-corpus texts and for every absent
// field — never fabricates (R9 derived≠asserted). Post-render chrome (sibling of .reader-bar,
// under #readerTitle); the parity-locked table builder is untouched (smoke:reader-parity green).
const REGISTER_ENUM = ['literary', 'spoken', 'archaic', 'poetic', 'mixed'];   // mirror of corpusMeta.js REGISTER — gate the chip (R9)
function readerCorpusMeta(textRow) {
  if (!textRow) return null;
  let sm = textRow.source_meta_json;
  if (typeof sm === 'string') { try { sm = JSON.parse(sm); } catch (_) { return null; } }
  return sm && typeof sm === 'object' && sm.corpus && typeof sm.corpus === 'object' ? sm.corpus : null;
}
function setReaderSubtitle(textRow) {
  const box = $('readerSubtitle');
  if (!box) return;
  box.innerHTML = '';
  const c = readerCorpusMeta(textRow);
  if (!c) { box.hidden = true; return; }
  let any = false;
  const author = (c.author || '').trim();
  if (author) {
    box.appendChild(el('span', { class: 'reader-sub-author', text: author, dir: HEBREW_RE.test(author) ? 'rtl' : 'ltr' }));
    any = true;
  }
  // miss-safe label — tt() returns the raw KEY on a missing locale entry (e.g. a stale SW serving an
  // older locale); guard v!==key so a chip/link can never surface a raw i18n key string.
  const lbl = (key, fb) => { const v = tt(key); return (v && v !== key) ? v : fb; };
  // era — data-driven title from era_taxonomy; honest skip on unknown/absent OR an unresolved raw slug
  // (taxonomy fetch failed → corpusRoot null → corpusEraTitle returns the slug; never print the machine slug).
  if (c.era && c.era !== 'unknown') {
    const etitle = corpusEraTitle(c.era);
    if (etitle && etitle !== c.era) { box.appendChild(el('span', { class: 'reader-sub-chip', text: etitle })); any = true; }
  }
  // register — closed curatorial enum (mirror of corpusMeta.js REGISTER); skip when absent / out-of-enum.
  // corpusMeta stores register as a FREE string, so an out-of-enum value is structurally reachable — gate it
  // so it can never paint a raw key or a fabricated label (R9 derived≠asserted).
  if (REGISTER_ENUM.includes(c.register)) {
    box.appendChild(el('span', { class: 'reader-sub-chip', text: lbl('room.corpus.register.' + c.register, c.register) }));
    any = true;
  }
  // per-work source link — the SPECIFIC work's page (R9 honest provenance), distinct from the global footer.
  const url = c.provenance && c.provenance.url ? String(c.provenance.url).trim() : '';
  if (/^https?:\/\//i.test(url)) {
    const link = el('a', { class: 'reader-sub-source', attrs: { href: url, target: '_blank', rel: 'noopener' } });
    link.textContent = lbl('room.reader.context.source', 'Источник') + ': ' + lbl('room.reader.context.sourceName', 'Проект Бен-Иегуда') + ' ↗';
    box.appendChild(link); any = true;
  }
  box.hidden = !any;
}

// Phase-3 — fetch the open work's Dicta proclitic overlay from the volume and hand it to
// reader-morph. Best-effort + progressive: an un-baked work (404) or offline leaves the detector
// on its offline-only (hedged) tier. Keyed by byehuda_id (== works/<id>.json == overlay filename).
async function loadProcliticOverlay(textId, text) {
  if (!(window.ReaderMorph && window.ReaderMorph.setProcliticOverlay)) return;
  let bid = (text && (text.byehuda_id || (text.corpus && text.corpus.byehuda_id))) || '';
  if (!bid) { const m = String(textId == null ? '' : textId).match(/(\d+)/); bid = m ? m[1] : ''; }
  if (!bid) return;
  const tid = textId;
  try {
    const res = await fetch('/data/benyehuda/proclitic/' + encodeURIComponent(bid) + '.json?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
    if (!res.ok) return;                              // un-baked work → offline fallback (no chip tint)
    const j = await res.json();
    if (readerTextId !== tid) return;                 // navigated away while fetching
    if (j && j.overlay && typeof j.overlay === 'object') window.ReaderMorph.setProcliticOverlay(j.overlay);
  } catch (_) { /* offline / no overlay → detector hedges honestly */ }
}

// Context-overlay — fetch the open work's baked context sidecar (strategic #1) and hand it to
// the provider chain. Best-effort: an un-baked work (404) or offline leaves the live+consent
// path exactly as before. Keyed by byehuda_id, like the proclitic overlay above.
async function loadContextOverlay(textId, text) {
  let bid = (text && (text.byehuda_id || (text.corpus && text.corpus.byehuda_id))) || '';
  if (!bid) { const m = String(textId == null ? '' : textId).match(/(\d+)/); bid = m ? m[1] : ''; }
  if (!bid) return;
  const tid = textId;
  try {
    const res = await fetch('/data/benyehuda/context/' + encodeURIComponent(bid) + '.json?v=' + CORPUS_CATALOG_VERSION, { cache: 'force-cache' });
    if (!res.ok) return;                              // un-baked work → live+consent path unchanged
    const j = await res.json();
    if (readerTextId !== tid) return;                 // navigated away while fetching
    if (j && j.ctx && Array.isArray(j.sents)) setContextOverlay(j);
  } catch (_) { /* offline / no sidecar → live path (honest un-baked semantics) */ }
}

async function openReader(textId, title, opts) {
  const reader = $('roomReader'), content = $('roomContent');
  if (!reader) return;
  const presentationRestore = !!(opts && opts.presentationRestore);
  const openStartedAt = performance.now();
  // Queue the one intentional recency write before any Reader/background reads.
  // With B7 cold-cache work active, deferring this fire-and-forget write until
  // after paint allowed Back/Forward probes to overtake it. Presentation restore
  // still remains strictly read-only.
  let touchOpenedPromise = null;
  if (!presentationRestore) {
    try { touchOpenedPromise = Promise.resolve(localDb.touchOpened(textId)).catch(() => false); } catch (_) {}
  }
  _roomReaderPresentationReadOnly = presentationRestore;
  if (!presentationRestore) roomPushPresentationState({ surface: 'reader', anchor: { itemId: String(textId == null ? '' : textId), rowIndex: 0 } });
  const requestedEpoch = opts && Number(opts._readerOpenEpoch);
  const openEpoch = Number.isInteger(requestedEpoch) && requestedEpoch > 0 ? requestedEpoch : ++readerOpenEpoch;
  if (openEpoch !== readerOpenEpoch) return;
  const back = $('readerBack'); if (back) back.disabled = false;
  captureReaderReturnContext();
  setReaderReturnRoute(opts && opts.returnToLesson ? 'lesson-builder' : null);
  if (content) content.hidden = true;
  reader.hidden = false;
  cancelCompassBuildSchedule();
  try { document.body.classList.add('room-reading'); } catch (_) {}   // шапка сайта не липнет при чтении (sticky-шапка таблицы)
  try { applyStudyModeClass(); } catch (_) {}   // учебный режим живёт только внутри ридера
  try { refreshDueBadge(); } catch (_) {}   // D2 — entering the reader hides the home «🔁 К повторению» CTA
  clearResumeBanner(); clearCurrentWorkingRow(); resetEndCard(); clearCovChip(); clearFadeGradNudge();   // never carry a stale working-row/end-card/cov-chip/fade-nudge across opens
  try { roomMediaTeardown(); } catch (_) {}   // media player: паспорт/стейдж/YT прошлого текста не переживают открытие
  try { window.ReaderMorph && window.ReaderMorph.setProcliticOverlay(null); } catch (_) {}   // Phase-3 — drop the previous work's proclitic overlay (never leak across works)
  setContextOverlay(null);              // context-overlay — same never-leak rule
  _sessionLastRow = -1; _sessionFurthestRow = -1; _programmaticProgressUntil = 0;
  readerTextId = textId != null ? String(textId) : null;
  const titleEl = $('readerTitle');
  if (titleEl) {
    titleEl.textContent = title || '';
    if (HEBREW_RE.test(title || '')) titleEl.setAttribute('dir', 'rtl'); else titleEl.removeAttribute('dir');
  }
  setReaderSubtitle(null);   // Epic-6 W1-a — clear any prior byline until res arrives (no stale flash)
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
  if (openEpoch !== readerOpenEpoch) return;   // Back won while ReaderCore was resolving
  readerRows = res && res.ok ? res.rows : [];
  readerTextTitle = title || (res && res.text && res.text.title) || '';
  if (titleEl && !title) {
    titleEl.textContent = readerTextTitle;
    if (HEBREW_RE.test(readerTextTitle)) titleEl.setAttribute('dir', 'rtl'); else titleEl.removeAttribute('dir');
  }
  readerTextKey = (res && res.text && res.text.text_key) || null;
  // CLG-P6.2 — own vs corpus (то же правило, что listOwnTextsForSync/maybeNudgeNiqqud):
  // корпусные работы не живут в artifact-store → объяснение наставника недоступно by-design.
  readerIsOwnText = false;
  readerCorpusWorkId = null; readerCorpusExplainOk = false;   // безусловный сброс (singleton-reset)
  readerGroupCorpusId = null;
  try {
    const meta = res && res.text && res.text.source_meta_json ? JSON.parse(res.text.source_meta_json) : null;
    const groupMeta = meta && meta.group_corpus;
    readerGroupCorpusId = groupMeta && groupMeta.corpus_id ? String(groupMeta.corpus_id) : null;
    readerIsOwnText = !!readerTextKey && !(meta && (meta.corpus || meta.group_corpus));
    // PAS-A1 — id работы: та же фолбэк-цепочка, что loadProcliticOverlay (ранние импорты
    // могли не иметь поля в source_meta_json)
    if (!readerIsOwnText && !readerGroupCorpusId && readerTextKey) {
      const t0 = res.text || {};
      let bid = (t0.byehuda_id || (t0.corpus && t0.corpus.byehuda_id) || (meta && meta.corpus && meta.corpus.byehuda_id)) || '';
      if (!bid) { const m = String(textId == null ? '' : textId).match(/(\d+)/); bid = m ? m[1] : ''; }
      readerCorpusWorkId = bid ? String(bid) : null;
      if (readerCorpusWorkId) probeCorpusExplain(readerCorpusWorkId);
    }
  } catch (_) { readerIsOwnText = !!readerTextKey; }
  try { setReaderSubtitle(res && res.ok && res.text ? res.text : null); } catch (_) {}   // Epic-6 W1-a — per-work source/context
  if (res && res.ok) {
    let calibrationSource = null;
    if (readerIsOwnText) {
      const cacheDescriptor = myCompassDescriptor({ ...res.text, id: textId });
      calibrationSource = { text_id: textId, source_class: 'mytext', source_key: String(readerTextKey || textId),
        content_revision: String((res.text && res.text.updated_at) || 'unknown'), cache_descriptor: cacheDescriptor };
    } else if (readerGroupCorpusId) {
      const groupCatalog = groupCatalogs.get(String(readerGroupCorpusId));
      const groupWork = groupCatalog && groupCatalog.works && groupCatalog.works.find((work) => String(work.text_key) === String(readerTextKey));
      const cacheDescriptor = groupWork ? groupCompassDescriptor(readerGroupCorpusId, groupWork, { id: textId }) : null;
      calibrationSource = { text_id: textId, source_class: 'group', source_key: String(readerTextKey || textId),
        content_revision: String(groupWork && groupWork.bundle_sha256 || 'unknown'), entitlement_revision: groupWork && groupWork.bundle_sha256 || null,
        cache_descriptor: cacheDescriptor };
    } else {
      calibrationSource = { text_id: textId, source_class: 'benyehuda', source_key: String(readerTextKey || readerCorpusWorkId || textId),
        content_revision: 'catalog-v' + CORPUS_CATALOG_VERSION };
    }
    try { beginReadingCalibration(calibrationSource, readerRows); refreshCovChip(); } catch (_) {}
    attachReaderAudio();
    Promise.resolve(roomMediaSetup(res.text, textId)).catch(() => {});   // saved passport + canonical exact Studio binding
    try { roomUpdateTheadTop(); setTimeout(() => { try { roomUpdateTheadTop(); } catch (_) {} }, 600); } catch (_) {}   // sticky-шапка: бар мог дорасти (cov-chip)
    if (!readerGroupCorpusId) {
      try { loadProcliticOverlay(readerTextId, res.text); } catch (_) {}   // Phase-3 — this work's Dicta proclitic overlay (best-effort)
      try { loadContextOverlay(readerTextId, res.text); } catch (_) {}     // context-overlay — this work's baked context facts (best-effort)
    }
    if (touchOpenedPromise) await touchOpenedPromise;    // recency for the Continue shelf; already queued before Reader reads
    try { tagReaderTableLang(mount); } catch (_) {}      // Epic 8b — sr-only/lang on the painted table (parity-safe)
    try { showReaderTip(); } catch (_) {}                // Epic 8a — first-open gesture hint
    wireProgressScroll();
    const loadedProgress = await loadReaderResumeProgress(readerTextId);
    if (openEpoch !== readerOpenEpoch) return;
    if (opts && opts.ftsQuery) jumpToFtsMatch(opts.ftsQuery, loadedProgress);                     // BRR-P2-005 — FTS hit → matched row
    else if (opts && opts.scrollToSentence) scrollToSentence(opts.scrollToSentence);   // open a bookmark at its row
    else if (opts && opts.scrollToOrderIndex != null) scrollToOrderIdx(opts.scrollToOrderIndex);   // P9 — якорь объяснения (text_key+order_index)
    else restoreReaderPosition(readerTextId, opts, loadedProgress);      // offer/perform resume (R4 reliability)
    // Epic-5 W1 — a resumed-to-end / single-screen text reaches the end without a scroll event;
    // check once after layout settles so the «✓ Прочитано» card can surface (readerAtEnd handles
    // both the «last row visible» and the resume/karaoke-latch cases).
    try { setTimeout(() => { try { maybeShowEndOfText(); } catch (_) {} }, 450); } catch (_) {}
    try { maybeOfferScaffoldAdvice(); } catch (_) {}   // PAS-D2b — scaffold-советник (W5-fade + reveal-предложение)
    if (!presentationRestore) { try { maybeNudgeNiqqud(res.text); } catch (_) {} }   // P5.6 R-6 — unvocalized own text → one-time hint
  }
  roomDiagPush({ kind: 'room.open', duration_ms: performance.now() - openStartedAt, result: res && res.ok ? 'ok' : 'error' });
}

// Retention P5.6 R-6 (owner 2026-07-02) — an OWN text without vocalization degrades the whole
// premium loop (resolver confidence → status colouring → due rings → recall cards), not just
// reading comfort. Nudge ONCE per text (quiet toast) when an own text (no corpus provenance) is
// mostly unvocalized. Corpus works are always baked-vocalized — never nudged.
function maybeNudgeNiqqud(text) {
  if (!text || !Array.isArray(readerRows) || readerRows.length < 4) return;
  try { const meta = text.source_meta_json ? JSON.parse(text.source_meta_json) : null; if (meta && (meta.corpus || meta.group_corpus)) return; } catch (_) {}
  const NIQ = /[֑-ׇ]/;
  const voc = readerRows.filter((r) => r && NIQ.test(String(r.he_niqqud || ''))).length;
  if (voc / readerRows.length >= 0.5) return;
  const tk = String(readerTextKey || text.text_key || text.id || '');
  if (!tk) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('room.niqqudNudge.seen') || '{}'); } catch (_) {}
  if (seen[tk]) return;
  seen[tk] = 1;
  try { localStorage.setItem('room.niqqudNudge.seen', JSON.stringify(seen)); } catch (_) {}
  roomToast(tt('room.reader.niqqudNudge', 'Совет: добавьте огласовку в Студии — статусы слов и повторение станут точнее'));
}

// Jump to the row carrying a given sentence_id (robust to order_index gaps) — used when
// opening a bookmark. Falls back silently if the row is absent.
function scrollToSentence(sid) {
  sid = String(sid);
  const idx = readerRows.findIndex((r) => r && String(r._v3_sentenceId) === sid);
  if (idx >= 0) scrollToReaderRow(idx);
}

// P9 — jump by order_index (the explanation-anchor contract: text_key + order_index).
// Fallback mirrors explainRow's anchor mint (order_index ?? row idx): a row without
// _v3_orderIndex was anchored by its index.
function scrollToOrderIdx(oi) {
  oi = Number(oi);
  if (!Number.isFinite(oi)) return;
  let idx = readerRows.findIndex((r) => r && r._v3_orderIndex != null && Number(r._v3_orderIndex) === oi);
  if (idx < 0 && oi >= 0 && oi < readerRows.length && readerRows[oi] && readerRows[oi]._v3_orderIndex == null) idx = oi;
  if (idx >= 0) scrollToReaderRow(idx);
}

// BRR-P2-005/006 — open an FTS hit AT the matched line. For a multi-word query, prefer the row
// carrying the whole PHRASE (consecutive query tokens, firstPhraseRow); fall back to the first row
// containing any query token (firstMatchRow); fall back to normal resume if none is located.
function jumpToFtsMatch(q, loadedProgress) {
  let idx = -1;
  try {
    const C = window.CorpusFTS;
    if (C) {
      if (C.firstPhraseRow) idx = C.firstPhraseRow(readerRows, q);
      if (idx < 0 && C.firstMatchRow) idx = C.firstMatchRow(readerRows, q);
    }
  } catch (_) { idx = -1; }
  if (idx >= 0) scrollToReaderRow(idx);
  else restoreReaderPosition(readerTextId, {}, loadedProgress);
}

async function closeReader(options) {
  // BRR-P2-002 — flush the last deliberate working position synchronously BEFORE hiding
  // (the 800ms debounce may not have fired if Back is tapped quickly), then stop recording.
  const tid = readerTextId;
  tickReadingCalibration(); _readingCalibrationSession = null;
  const presentationRestore = !!(options && options.presentationRestore);
  const returnStartedAt = performance.now();
  readerOpenEpoch++;   // pending served-on-open import / ReaderCore completion loses UI authority
  const returnRoute = readerReturnRoute;
  const returnHome = !!(options && options.returnHome === true);
  const returnContext = options && options.presentationReturnContext ? options.presentationReturnContext : (returnHome
    ? { nav: { corpus: 'hub', level: 'home', era: null, author: null }, scrollX: 0, scrollY: 0, anchorTop: null, continuityKey: '', focusAction: '', focusKey: 'learning-home-feature-open', disclosures: [] }
    : readerReturnContext);
  const back = $('readerBack'); if (back) back.disabled = true;
  if (presentationRestore) { if (_progressTimer) { clearTimeout(_progressTimer); _progressTimer = null; } }
  else { try { await flushReaderProgress(); } catch (_) {} }
  invalidateCorpusPresentationProgress();
  if (readerAudio) { try { readerAudio.detach(); } catch (_) {} readerAudio = null; }
  if (readerMorph) { try { readerMorph.detach(); } catch (_) {} readerMorph = null; }
  karaokeActive = false; setReadAloudBtn(false);   // BRR-P1-008 — reset karaoke on close
  try { roomMediaTeardown(); } catch (_) {}   // media player: stop + revoke URL + скрыть бар
  clearResumeBanner(); clearCurrentWorkingRow(); resetEndCard(); clearCovChip(); clearFadeGradNudge(); closeReaderFind(); _sessionLastRow = -1; _sessionFurthestRow = -1; _programmaticProgressUntil = 0; _roomReaderPresentationReadOnly = false; readerTextId = null;   // stop recording + clear derived working row/find/end-card/cov-chip/fade-nudge after close
  _bookmarkSet = null; readerTextTitle = ''; readerTextKey = null; readerIsOwnText = false;   // BRR-P2-003 — reset bookmark state
  readerCorpusWorkId = null; readerCorpusExplainOk = false; readerGroupCorpusId = null;   // singleton-reset
  try { setReaderSubtitle(null); } catch (_) {}   // Epic-6 W1-a — drop the per-work byline on close
  const rm = $('roomReaderTable');
  if (rm && revealHandler) { try { rm.removeEventListener('click', revealHandler, true); } catch (_) {} revealHandler = null; }
  const reader = $('roomReader'), content = $('roomContent');
  if (content) content.setAttribute('aria-busy', 'true');
  setReaderReturnRoute(null);
  readerReturnContext = null;
  if (returnRoute === 'lesson-builder') {
    if (reader) reader.hidden = true;
    if (content) { content.hidden = false; content.removeAttribute('aria-busy'); }
    if (back) back.disabled = false;
    try { document.body.classList.remove('room-reading'); document.body.classList.remove('room-study'); } catch (_) {}
    scheduleCompassBuildPump(!!(_compassBuildQueue[0] && _compassBuildQueue[0].urgent));
    openLessonStudio();
    return;
  }
  // B5 — all normalized corpora repaint from their existing canonical adapters after
  // the progress flush. Their in-memory filter objects remain intact, while rows,
  // Learning Home and Continue state stop being stale. No second state writer is added.
  if (returnHome) {
    activeTrack = 'corpus';
    TRACKS.forEach((track) => { const button = $(TAB_ID[track]); if (button) button.setAttribute('aria-selected', String(track === activeTrack)); });
  }
  if (activeTrack === 'corpus') {
    if (returnContext && returnContext.nav) corpusNav = { ...returnContext.nav };
    try { await renderCorpus(); } catch (_) {}
  }
  // Atomic surface swap: the old reader remains the only interactive surface while
  // the hidden catalog repaints, so a fast next tap cannot target a stale row.
  if (reader) reader.hidden = true;
  if (content) { content.hidden = false; content.removeAttribute('aria-busy'); }
  if (back) back.disabled = false;
  try { document.body.classList.remove('room-reading'); } catch (_) {}   // вернуть sticky шапке сайта вне ридера
  try { document.body.classList.remove('room-study'); } catch (_) {}     // домашний экран без шапки был бы тупиком
  scheduleCompassBuildPump(!!(_compassBuildQueue[0] && _compassBuildQueue[0].urgent));
  try { refreshDueBadge(); } catch (_) {}   // D2 — back on the home → surface the «🔁 К повторению» CTA
  await restoreReaderReturnContext(returnContext);
  if (!presentationRestore) roomReplacePresentationState(null, 0);
  roomDiagPush({ kind: 'room.return', duration_ms: performance.now() - returnStartedAt, result: presentationRestore ? 'history' : 'ok' });
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
  const openEpoch = ++readerOpenEpoch;
  captureReaderReturnContext();
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
    if (openEpoch !== readerOpenEpoch) return;
    await openReader(localId, card.title, Object.assign({}, openOpts || {}, { _readerOpenEpoch: openEpoch }));
  } catch (e) {
    if (openEpoch !== readerOpenEpoch) return;
    try { console.warn('[room] open corpus work failed:', e); } catch (_) {}
    readerStateBox('room.state.error', '⚠️');
  } finally {
    corpusImporting = false;
    invalidatePersonalSets();   // a work may have just materialized → personal chips see it fresh
  }
}

// Restricted group corpus uses the same OPFS reader model, but its transport is
// authenticated and never static. The source marker prevents cloud artifact
// sync and switches row audio to the protected endpoint.
async function loadGroupCorpora(options = {}) {
  const previousIds = new Set(groupCorpora.map((item) => String(item && item.corpus_id || '')).filter(Boolean));
  groupCorpora = [];
  try {
    const res = await fetch('/api/group-corpora', { cache: 'no-store' });
    if (!res.ok) {
      // Signed-out is a valid empty projection, not a connectivity failure.
      if (res.status === 401 || res.status === 403) {
        for (const id of previousIds) {
          groupCatalogs.delete(id); _groupLearningIndexes.delete(id); _groupLearningIndexLoading.delete(id); _learningIndexStates.delete('group:' + id);
          try { await localDb.deleteLearningCompassGroupCorpus(id); } catch (_) {}
        }
        return { ok: true, signedOut: true };
      }
      if (options.strictNetwork) throw new Error('GROUP_CORPORA_HTTP_' + res.status);
      return { ok: false };
    }
    const j = await res.json();
    groupCorpora = j && Array.isArray(j.corpora) ? j.corpora : [];
    const currentIds = new Set(groupCorpora.map((item) => String(item && item.corpus_id || '')).filter(Boolean));
    for (const id of previousIds) if (!currentIds.has(id)) {
      groupCatalogs.delete(id); _groupLearningIndexes.delete(id); _groupLearningIndexLoading.delete(id); _learningIndexStates.delete('group:' + id);
      try { await localDb.deleteLearningCompassGroupCorpus(id); } catch (_) {}
    }
    return { ok: true, signedOut: false };
  } catch (error) {
    groupCorpora = [];
    if (options.strictNetwork) throw error;
    return { ok: false };
  }
}

async function ensureGroupCatalog(corpusId) {
  const id = String(corpusId || '');
  if (groupCatalogs.has(id)) return groupCatalogs.get(id);
  const res = await fetch('/api/group-corpora/' + encodeURIComponent(id) + '/works', { cache: 'no-store' });
  if (!res.ok) throw new Error('group catalog ' + res.status);
  const j = await res.json();
  if (!j || !j.ok || !Array.isArray(j.works)) throw new Error('malformed group catalog');
  groupCatalogs.set(id, j);
  return j;
}

function yieldLearningIndexWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function evaluateFamiliarityItems(items, projection, ingredientFor) {
  const scores = new Map();
  const list = Array.isArray(items) ? items : [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index], ingredients = ingredientFor(item);
    if (ingredients) scores.set(String(item.work_id != null ? item.work_id : item.id), contextFromIngredients(ingredients, projection).compass);
    if (index && index % 16 === 0) await yieldLearningIndexWork();
  }
  return scores;
}

async function ensureGroupLearningIndex(corpusId, catalog) {
  const id = String(corpusId || '');
  if (_groupLearningIndexes.has(id)) return _groupLearningIndexes.get(id);
  if (_groupLearningIndexLoading.has(id)) return _groupLearningIndexLoading.get(id);
  const scope = 'group:' + id;
  const total = Array.isArray(catalog && catalog.works) ? catalog.works.length : 0;
  paintCorpusLearningIndexState(scope, { state: 'preparing', prepared: 0, total });
  const job = (async () => {
    const projection = await ensureLearningCompassProjection();
    const byId = new Map((catalog.works || []).map((work) => [String(work.work_id), work]));
    const items = [], seen = new Set();
    const cursors = new Set();
    let cursor = null, indexRevision = null, successfulSeen = 0, unsupportedSeen = 0, pageCount = 0;
    do {
      const cursorKey = cursor || '__first__';
      if (cursors.has(cursorKey) || ++pageCount > total + 1) throw new Error('group learning index cursor loop');
      cursors.add(cursorKey);
      const query = new URLSearchParams({ limit: '16' }); if (cursor) query.set('cursor', cursor);
      const response = await fetch('/api/group-corpora/' + encodeURIComponent(id) + '/learning-index?' + query.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('group learning index ' + response.status);
      const rawPacket = await response.text();
      if (new TextEncoder().encode(rawPacket).byteLength > 256 * 1024) throw new Error('group learning index packet limit');
      const packet = JSON.parse(rawPacket);
      if (!packet || !packet.ok || packet.schema_version !== 'group_learning_index.1.0.0'
          || packet.resolver_version !== learningCompass.RESOLVER_VERSION || !Array.isArray(packet.items)
          || Number(packet.matched_total) !== total) throw new Error('malformed group learning index');
      if (indexRevision && indexRevision !== String(packet.index_revision)) throw new Error('group learning index changed during read');
      indexRevision = String(packet.index_revision || '');
      const writes = [];
      for (const item of packet.items) {
        const work = item && byId.get(String(item.work_id));
        if (!work || seen.has(String(item.work_id)) || String(item.text_key) !== String(work.text_key)
            || String(item.bundle_sha256) !== String(work.bundle_sha256)) throw new Error('group learning index mismatch');
        seen.add(String(item.work_id)); items.push(item);
        const descriptor = groupCompassDescriptor(id, work, null);
        if (item.status === 'PREPARED' && item.ingredients && descriptor) {
          successfulSeen += 1;
          writes.push({ ...descriptor, ingredients: item.ingredients, content_sha256: String(item.ingredients.content_sha256 || '') });
          _compassPage.set(descriptor.cache_key, contextFromIngredients(item.ingredients, projection));
        } else {
          unsupportedSeen += 1;
          if (descriptor) _compassPage.set(descriptor.cache_key, compassStatusContext('UNSUPPORTED', String(item.reason_code || 'GROUP_INDEX_UNSUPPORTED')));
        }
      }
      if (writes.length) {
        try {
          if (typeof localDb.putLearningCompassIngredientsBatch === 'function') await localDb.putLearningCompassIngredientsBatch(writes);
          else for (const write of writes) await localDb.putLearningCompassIngredients(write);
        } catch (_) {}
      }
      paintCorpusLearningIndexState(scope, { state: 'preparing', prepared: successfulSeen, total, unsupported: unsupportedSeen });
      cursor = packet.next_cursor || null;
      if (cursor && !packet.items.length) throw new Error('group learning index empty page');
    } while (cursor && items.length <= total);
    if (seen.size !== total || items.length !== total) throw new Error('incomplete group learning index');
    const fits = await evaluateFamiliarityItems(items.filter((item) => item.status === 'PREPARED'), projection, (item) => item.ingredients);
    const ready = { index_revision: indexRevision, items, fits, prepared: successfulSeen, unsupported: unsupportedSeen, total };
    _groupLearningIndexes.set(id, ready);
    paintCorpusLearningIndexState(scope, { state: 'ready', prepared: successfulSeen, total, unsupported: unsupportedSeen });
    for (const work of (catalog.works || [])) repaintPreparedCompass('group:' + id + ':' + String(work.work_id));
    return ready;
  })().catch((error) => {
    paintCorpusLearningIndexState(scope, { state: 'error', prepared: 0, total });
    throw error;
  }).finally(() => _groupLearningIndexLoading.delete(id));
  _groupLearningIndexLoading.set(id, job);
  return job;
}

async function openGroupCorpusWork(corpusId, card, openOpts = {}) {
  if (!card || corpusImporting) return;
  const openEpoch = ++readerOpenEpoch;
  corpusImporting = true;
  try {
    let localId = await resolveLocalIdByKey(card.text_key);
    const editionKey = 'room.groupCorpus.edition.' + corpusId + '.' + card.work_id;
    let haveEdition = ''; try { haveEdition = localStorage.getItem(editionKey) || ''; } catch (_) {}
    const wantEdition = String(card.bundle_sha256 || '');
    // Fetch on first materialisation OR when the server publishes a new immutable
    // bundle/audio edition. importBundle keeps the text; reconcileAudioLinks flips
    // only default sentence audio by stable order_index.
    if (!localId || !wantEdition || haveEdition !== wantEdition) {
      const url = '/api/group-corpora/' + encodeURIComponent(corpusId) + '/works/' + encodeURIComponent(card.work_id);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('group work ' + res.status);
      const bundle = await res.json();
      if (!bundle || !bundle.library) throw new Error('malformed group work');
      const imported = await localDb.importBundle(bundle, { mode: 'skip' });
      localId = await resolveLocalIdByKey(card.text_key);
      if (localId && imported && Number(imported.skipped) > 0 && typeof localDb.reconcileAudioLinks === 'function') {
        const rec = await localDb.reconcileAudioLinks(bundle);
        if (rec && Array.isArray(rec.errors) && rec.errors.length) throw new Error('audio reconcile failed');
      }
      if (localId && wantEdition) { try { localStorage.setItem(editionKey, wantEdition); } catch (_) {} }
    }
    if (!localId) throw new Error('group work not resolvable after import');
    if (openEpoch !== readerOpenEpoch) return;
    await openReader(localId, card.title, Object.assign({}, openOpts, { _readerOpenEpoch: openEpoch }));
  } catch (e) {
    if (openEpoch !== readerOpenEpoch) return;
    try { console.warn('[room] open group corpus work failed:', e); } catch (_) {}
    roomToast(tt('room.state.error', 'Не получилось открыть текст'));
  } finally { corpusImporting = false; invalidatePersonalSets(); }
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
// ── BRR Epic-6 — author authority + curated editorial (the build-once surface) ──────
// Lazy-load the QID-keyed author authority sidecar (corpus-authors-v<N>.json, Increment 1)
// merged with the curated editorial store (corpus-editorial-v1.json, Increment 2) into a
// qid→node Map. Loaded once on first author drill (NOT precached), like the index. The merge
// applies curated overrides with precedence (curated>asserted>derived) — a no-op while the
// editorial store is empty, so surfaces render honest derived authority + self-hide every
// absent curated slot (premium at 0% coverage; bios/intros drop in later as data, no code).
let corpusAuthorsMap = null, corpusAuthorsLoading = null;
const AUTHOR_QID_RE = /^Q[1-9]\d*$/;   // a real Wikidata QID (excludes the Q0 sentinel)

// Browser mirror of editorialMeta.mergeAuthorNode (the precedence guard). Pure.
function _mergeAuthorEditorial(node, ed) {
  if (!node || !ed) return node;
  const out = Object.assign({}, node, { prov: Object.assign({}, node.prov) });
  if (ed.era != null) { out.era = ed.era; out.prov.era = 'curated'; }
  if (ed.display != null) { out.display = ed.display; out.prov.display = 'curated'; }
  const editorial = {};
  if (ed.one_line) editorial.one_line = ed.one_line;
  if (ed.bio_md) editorial.bio_md = ed.bio_md;
  if (Array.isArray(ed.entry_points) && ed.entry_points.length) editorial.entry_points = ed.entry_points.slice();
  if (ed.portrait_url) editorial.portrait_url = ed.portrait_url;
  if (Object.keys(editorial).length) { editorial.source = 'curated'; editorial.curator = ed.curator || null; out.editorial = editorial; }
  return out;
}
async function loadCorpusAuthors() {
  if (corpusAuthorsMap) return corpusAuthorsMap;
  if (corpusAuthorsLoading) return corpusAuthorsLoading;
  const ver = CORPUS_CATALOG_VERSION;
  const authorsFile = (corpusRoot && corpusRoot.authors_file) || ('corpus-authors-v' + ver + '.json');
  corpusAuthorsLoading = (async () => {
    const rev = ver + '.' + CORPUS_AUTHORS_DATA_REV;   // force-cache (offline-first) busted on content change within the catalog version
    const [auth, ed] = await Promise.all([
      fetch('/data/benyehuda/' + authorsFile + '?v=' + rev, { cache: 'force-cache' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/data/benyehuda/corpus-editorial-v1.json?v=' + rev, { cache: 'force-cache' }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (!auth) throw new Error('corpus authors fetch failed');   // don't cache a transient failure → retry next drill (mirror loadCorpusIndex)
    const edAuthors = (ed && ed.authors) || {};   // a failed editorial fetch is non-fatal → empty store, no-op merge
    const map = new Map();
    for (const n of auth.authors || []) map.set(n.qid, _mergeAuthorEditorial(n, edAuthors[n.qid]));
    corpusAuthorsMap = map;
    return map;
  })();
  try { return await corpusAuthorsLoading; } finally { corpusAuthorsLoading = null; }
}
function corpusAuthorNode(qid) { return (qid && corpusAuthorsMap) ? corpusAuthorsMap.get(qid) : null; }

// BRR Epic-6 — collapse the name-keyed per-era author index into ONE entry per real QID (display from
// the authority node = the author's primary name, never an «A; B» composite, and the 14 fragmented
// QIDs merge into one row). Works/ready summed, blocks unioned → renderCorpusWorks fetches the union
// and filters by QID. Name-only / Q0 rows are kept as-is (honest — no stable identity to merge on).
function collapseEraAuthors(era) {
  const rows = (corpusIndex && corpusIndex.authors && corpusIndex.authors[era]) || [];
  const byQid = new Map();
  const out = [];
  for (const r of rows) {
    if (r && r.qid && AUTHOR_QID_RE.test(r.qid)) {
      let m = byQid.get(r.qid);
      if (!m) { m = { qid: r.qid, name: r.name, works: 0, ready: 0, blocks: new Set() }; byQid.set(r.qid, m); out.push(m); }
      m.works += r.works || 0; m.ready += r.ready || 0;
      for (const b of (Array.isArray(r.blocks) && r.blocks.length ? r.blocks : [null])) m.blocks.add(b);
    } else {
      out.push({ qid: null, name: r.name, works: r.works || 0, ready: r.ready || 0, blocks: Array.isArray(r.blocks) && r.blocks.length ? r.blocks.slice() : [null] });
    }
  }
  for (const m of out) {
    if (m.blocks instanceof Set) m.blocks = [...m.blocks];
    if (m.qid) { const node = corpusAuthorNode(m.qid); if (node && node.display) m.name = node.display; }
  }
  return out;
}

// Honest life-year formatting (R9: only what the authority actually has; negative = BCE).
function corpusYear(y) { return Number(y) < 0 ? (Math.abs(Number(y)) + ' ' + tt('room.corpus.author.bce', 'до н.э.')) : String(y); }
function corpusLifeYears(node) {
  if (!node) return '';
  if (node.birth != null && node.death != null) return corpusYear(node.birth) + '–' + corpusYear(node.death);
  if (node.birth != null) return tt('room.corpus.author.born', 'р.') + ' ' + corpusYear(node.birth);
  if (node.death != null) return tt('room.corpus.author.died', 'ум.') + ' ' + corpusYear(node.death);
  return '';
}

// L3 author-landing header (R6/R9): display · era-chip · life-years · counts · curated
// editorial slot (self-hiding) · discreet Wikidata authority link. Pure surfacing of the node.
function buildAuthorHeader(node, author) {
  const h = el('div', { class: 'corpus-author-header' });
  // The name inherits the UI direction (left-aligned in the ru/en UI to match the era/years/counts
  // meta + the L2 rows; right-aligned in the he UI) while the Hebrew still renders RTL internally —
  // a coherent header block, not a name split off to the opposite side of its own metadata.
  const name = el('h2', { class: 'corpus-author-h-name', text: node.display || '' });
  h.appendChild(name);
  const meta = el('div', { class: 'corpus-author-h-meta' });
  if (node.era && node.era !== 'unknown') { const et = corpusEraTitle(node.era); if (et && et !== node.era) meta.appendChild(el('span', { class: 'corpus-author-h-chip', text: et })); }
  const years = corpusLifeYears(node);
  if (years) meta.appendChild(el('span', { class: 'corpus-author-h-years', text: years }));
  // Counts come from the CLICKED L2 row (= exactly what the works body below lists), NOT the QID
  // aggregate: a fragmented author (Bialik solo vs «ביאליק; רבניצקי») must not show a header total
  // the page can't reach. era/dates/QID/editorial stay from the node (the stable identity).
  const cw = author && author.works != null ? author.works : node.works;
  const cr = author && author.ready != null ? author.ready : node.ready;
  meta.appendChild(el('span', { class: 'corpus-author-h-counts', text: cw + ' ' + tt('room.corpus.worksN', 'работ') }));
  if (cr > 0) meta.appendChild(el('span', { class: 'corpus-author-h-ready', text: '✓ ' + cr + ' ' + tt('room.corpus.readyN', 'готовы') }));
  h.appendChild(meta);
  // curated editorial slot — self-hides when absent (content drops in as data later)
  if (node.editorial && node.editorial.one_line) {
    h.appendChild(el('p', { class: 'corpus-author-h-oneline', text: node.editorial.one_line, dir: 'auto' }));
  }
  if (node.editorial && node.editorial.bio_md) {
    h.appendChild(el('p', { class: 'corpus-author-h-bio', text: node.editorial.bio_md, dir: 'auto' }));
  }
  if (AUTHOR_QID_RE.test(node.qid || '')) {
    const wd = el('a', { class: 'corpus-author-h-wd', attrs: { href: 'https://www.wikidata.org/wiki/' + node.qid, target: '_blank', rel: 'noopener' } });
    wd.textContent = tt('room.corpus.author.wikidata', 'Wikidata') + ' ↗';
    h.appendChild(wd);
  }
  return h;
}
// L2 — decorate the (sync-rendered) author rows with life-years once the sidecar is loaded
// (the index has no dates; the node does). Idempotent post-pass, mirrors decorateFinishedBadges.
function decorateAuthorRows(container) {
  if (!corpusAuthorsMap || !container) return;
  container.querySelectorAll('.corpus-author-row[data-qid]:not([data-author-dated])').forEach((row) => {
    const node = corpusAuthorsMap.get(row.getAttribute('data-qid'));
    row.setAttribute('data-author-dated', '1');
    const years = node ? corpusLifeYears(node) : '';
    if (!years) return;
    const meta = row.querySelector('.corpus-author-meta');
    if (meta) meta.insertBefore(el('span', { class: 'corpus-author-years', text: years }), meta.firstChild);
  });
}

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
    // ?v includes CORPUS_SEARCH_DATA_REV so adding the author `q` (Epic-6) busts force-cache for
    // returning users WITHIN catalog v7 (the catalog `?v=` alone would serve a stale no-q copy).
    const res = await fetch('/data/benyehuda/' + file + '?v=' + CORPUS_CATALOG_VERSION + '.' + CORPUS_SEARCH_DATA_REV, { cache: 'force-cache' });
    if (!res.ok) throw new Error('corpus search ' + res.status);
    const rows = await res.json();
    for (const r of rows) r._n = corpusNrm(r.t);
    corpusSearch = rows;
    return rows;
  })();
  try { return await corpusSearchLoading; } finally { corpusSearchLoading = null; }
}

// BRR-P1-007 S2 / B7 — lazy per-work vocab sidecar (single-flight). Loaded on the first
// recorded-familiarity need
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

function recordedFitForBen(work, vocab, projection, workId) {
  if (!learningCompass || !work || !vocab || !projection) return null;
  const ingredients = learningCompass.ingredientsFromBenV7(work, vocab.dict, {
    source_key: 'benyehuda:' + String(workId), content_revision: 'catalog-v' + CORPUS_CATALOG_VERSION,
    content_sha256: '',
  });
  return learningCompass.evaluateRecordedFamiliarityV2({ ingredients, learner_projection: projection });
}

async function ensureBenFamiliarityScores() {
  if (_benFamiliarityScores) return _benFamiliarityScores;
  if (_benFamiliarityLoading) return _benFamiliarityLoading;
  const scope = 'benyehuda';
  const ready = (corpusIndex && corpusIndex.ready) || [];
  paintCorpusLearningIndexState(scope, { state: 'preparing', prepared: 0, total: ready.length });
  _benFamiliarityLoading = (async () => {
    const vocab = await loadCorpusVocab();
    const projection = await ensureLearningCompassProjection();
    if (!vocab || !vocab.works || !projection) throw new Error('BEN_FAMILIARITY_UNAVAILABLE');
    const scores = new Map();
    let prepared = 0, unsupported = 0;
    for (let index = 0; index < ready.length; index += 1) {
      const card = ready[index], work = vocab.works[String(card.id)];
      if (work) { scores.set(String(card.id), recordedFitForBen(work, vocab, projection, card.id)); prepared += 1; }
      else unsupported += 1;
      if (index && index % 16 === 0) {
        paintCorpusLearningIndexState(scope, { state: 'preparing', prepared, total: ready.length, unsupported });
        await yieldLearningIndexWork();
      }
    }
    _benFamiliarityScores = scores;
    paintCorpusLearningIndexState(scope, { state: 'ready', prepared, total: ready.length, unsupported });
    return scores;
  })().catch((error) => {
    paintCorpusLearningIndexState(scope, { state: 'error', prepared: 0, total: ready.length });
    throw error;
  }).finally(() => { _benFamiliarityLoading = null; });
  return _benFamiliarityLoading;
}

async function scoreReadyByRecordedFamiliarity(ready, vocab, excludeTextKey) {
  if (!learningCompass || !vocab || !vocab.works) return [];
  const scores = await ensureBenFamiliarityScores();
  const scored = [];
  for (const card of (ready || [])) {
    if (excludeTextKey && String(card.text_key) === String(excludeTextKey)) continue;
    const work = vocab.works[String(card.id)]; if (!work) continue;
    const fit = scores.get(String(card.id));
    if (!fit || fit.status !== 'AVAILABLE' || !fit.rank_eligible) continue;
    scored.push({ id: String(card.id), card, work, recorded_familiarity: fit });
  }
  return learningCompass.pickByRecordedFamiliarity(scored, scored.length || 12);
}

// B7 compatibility surface for older callers: return the shared exact recorded-familiarity
// contract, not the retired i+1 band. No work/profile overlap is fabricated.
async function roomVocabCoverageFor(id) {
  const v = await loadCorpusVocab();
  if (!v || !v.works || !v.works[String(id)]) return null;
  const projection = await ensureLearningCompassProjection();
  return recordedFitForBen(v.works[String(id)], v, projection, id);
}
if (typeof window !== 'undefined') {
  // refresh() drops the cached profile snapshots (word-states + readable-set) so the next coverage/
  // readability read re-queries the live profile — for when it changed outside the reader's save path.
  window.CorpusVocabRoom = { ensure: loadCorpusVocab, coverageFor: roomVocabCoverageFor, refresh: () => { morphHost.invalidateWordStates(); try { invalidateReadableSet(); } catch (_) {} } };
}

// B7 compatibility name, new semantics: works whose exact recorded-familiarity result is rank-eligible.
// This is a relative-profile filter, never a claim that a text is comprehensible or ready to read.
// It is computed from one projection snapshot and cached until learner truth changes.
let _readableSet = null;
async function ensureReadableSet() {
  if (_readableSet) return _readableSet;
  const set = new Set();
  try {
    const scores = await ensureBenFamiliarityScores();
    for (const [id, fit] of scores.entries()) if (fit && fit.status === 'AVAILABLE' && fit.rank_eligible) set.add(String(id));
  } catch (_) {}
  _readableSet = set;
  return set;
}
function invalidateReadableSet() { _readableSet = null; }

// FB-20 — recognition: which corpus works has the reader already finished, by CATALOG id. finished_at
// lives in the DB keyed by local text_id; corpus cards are keyed by catalog id — bridged via the work's
// text_key → corpusReadyKeyMap → ready card → card.id (the W4 text_key↔id pattern, done right). A finished
// NON-ready work (no translation → absent from the ready index) simply won't resolve → no badge (honest;
// never a wrong-id badge). Single-flight cache; invalidated whenever finished state changes.
let _finishedSet = null;
let _corpusPresentationProgress = null;
let _corpusPresentationProgressLoading = null;
function invalidateCorpusPresentationProgress() { _corpusPresentationProgress = null; _corpusPresentationProgressLoading = null; }
async function ensureCorpusPresentationProgress() {
  if (_corpusPresentationProgress) return _corpusPresentationProgress;
  if (_corpusPresentationProgressLoading) return _corpusPresentationProgressLoading;
  _corpusPresentationProgressLoading = (async () => {
    const map = new Map();
    try {
      const rows = await localDb.dbQuery(`SELECT t.text_key,t.last_opened_at,tp.last_row_idx,tp.finished_at,
        (SELECT COUNT(*) FROM sentences s WHERE s.text_id=t.id) AS n_rows
        FROM texts t LEFT JOIN text_progress tp ON tp.text_id=t.id WHERE t.is_archived=0`);
      for (const row of (rows || [])) if (row && row.text_key) map.set(String(row.text_key), row);
    } catch (_) {}
    _corpusPresentationProgress = map;
    return map;
  })();
  try { return await _corpusPresentationProgressLoading; }
  finally { _corpusPresentationProgressLoading = null; }
}
async function ensureFinishedSet() {
  if (_finishedSet) return _finishedSet;
  const set = new Set();
  try {
    const items = await localDb.getFinishedTexts(500);
    const keyMap = corpusReadyKeyMap();
    for (const it of (items || [])) {
      const card = it && it.text_key != null ? keyMap.get(String(it.text_key)) : null;
      if (card && card.id != null) set.add(String(card.id));
    }
  } catch (_) {}
  _finishedSet = set;
  return set;
}
function invalidateFinishedSet() { _finishedSet = null; }
// Paint a muted «✓ прочитано» badge on an already-read card/row. Idempotent; no-op until the set loads.
// Used BOTH as a per-row decorate (covers «показать ещё» pagination) AND as a post-pass (covers rows that
// existed before the async set resolved, + the later FTS «в тексте» group). recognition-over-recall.
function _finishedBadgeNode(node) {
  if (!_finishedSet || !_finishedSet.size || !node || !node.getAttribute) return;
  const id = node.getAttribute('data-work-id');
  if (!id || !_finishedSet.has(String(id)) || node.querySelector('.finished-read-badge')) return;
  const badge = el('span', { class: 'prov-badge finished-read-badge', text: '✓ ' + tt('room.resume.read', 'прочитано') });
  (node.querySelector('.work-card-meta') || node.querySelector('.corpus-work-meta') || node).appendChild(badge);
}
function decorateFinishedBadges(container) {
  if (!container || !_finishedSet || !_finishedSet.size) return;
  container.querySelectorAll('.work-card[data-work-id], .corpus-work-row[data-work-id]').forEach(_finishedBadgeNode);
}

// B7 — progressive Learning Compass on a rendered corpus card. Fire-and-forget: Ben-Yehuda's
// aggregate sidecar and one learner projection produce exact numerator/denominator/unresolved
// counts. No comprehension threshold or colour-coded readiness zone is rendered.
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
// Find-or-create the card's LEARNING row: intrinsic lexical load plus recorded familiarity,
// separate from source/media provenance. Surface-aware placement keeps scanning compact.
function _cardLearnRow(node) {
  let row = node.querySelector('.work-card-difficulty');
  if (row) { row.classList.add('learning-compass'); return row; }
  row = el('div', { class: 'work-card-difficulty learning-compass' });
  const col = node.querySelector('.corpus-work-col');   // S7 result row → stack inside the text column
  const cta = node.querySelector('.work-card-cta');     // rail/grid card → before the «Открыть» CTA
  if (col) col.appendChild(row);
  else if (cta && cta.parentNode === node) node.insertBefore(row, cta);
  else node.appendChild(row);
  return row;
}
async function enhanceCardWithCoverage(node, card) {
  if (!node || !card || card.id == null || !window.CorpusVocabRoom) return;
  let vocab = null, progress = null, projection = null;
  try { vocab = await loadCorpusVocab(); } catch (_) {}
  const work = vocab && vocab.works && vocab.works[String(card.id)];
  try { projection = await ensureLearningCompassProjection(); } catch (_) {}
  try { progress = (await ensureCorpusPresentationProgress()).get(String(card.text_key)) || null; } catch (_) {}
  if (!node.isConnected) return;
  const band = work && window.CorpusVocab && window.CorpusVocab.difficultyBand ? window.CorpusVocab.difficultyBand(work.ez) : null;
  const bandLabel = band ? tt('room.corpus.diff.' + band, band === 'easy' ? 'легче' : band === 'mid' ? 'средне' : 'сложнее') : null;
  const caveats = work && window.CorpusVocab && window.CorpusVocab.loadFlagFor && window.CorpusVocab.loadFlagFor(work)
    ? [tt('room.corpus.cov.load', 'много имён/архаики')] : [];
  const ingredients = work && learningCompass ? learningCompass.ingredientsFromBenV7(work, vocab.dict, {
    source_key: 'benyehuda:' + String(card.id), content_revision: 'catalog-v' + CORPUS_CATALOG_VERSION,
    content_sha256: String(card.bundle_sha256 || ''),
  }) : null;
  const compassContext = contextFromIngredients(ingredients, projection, {
    continue_reading: !!(progress && Number(progress.last_row_idx) > 0), derived_lexical_load: caveats.length > 0,
  });
  const view = adaptBenYehudaItem(card, {
    copy: corpusItemCopy(), difficultyBand: band, difficultyLabel: bandLabel,
    ...compassContext, catalogRevision: 'catalog-v' + CORPUS_CATALOG_VERSION,
    caveats, progress, savedState: isInAnyList(card.id) ? 'reading-list' : null,
  });
  const learnRow = _cardLearnRow(node); if (!learnRow) return;
  paintLearningCompass(learnRow, view, { showMedia: true, showDetails: true });
  const primary = node.querySelector('.room-text-primary');
  if (primary) primary.textContent = view.primaryAction === 'continue' ? tt('room.resume.continue', 'Продолжить') : tt('room.mytexts.read', 'Читать');
}

// W3 (Epic 5 difficulty-signal) — profile-FREE intrinsic ez band («легче/средне/сложнее») + «много имён/
// архаики» load tag, into the shared LEARNING row. Outline-styled (PC-1) so it never reads as a filled
// provenance pill. Lazy, idempotent (guard on the band chip), fire-and-forget. Unbaked → no band (R1/R9).
async function appendDifficultyRow(node, card) {
  return enhanceCardWithCoverage(node, card);
}

// One disclosure contract for every long corpus section. State is deliberately
// presentation-only and content-free, while corpus/progress stores stay canonical.
// localStorage is required here (rather than an in-memory Map/sessionStorage): the
// owner's normal workflow includes F5 and closing/reopening the browser tab.
const ROOM_LONG_LIST_STORAGE_KEY = 'room.longListDisclosure.v1';
const ROOM_LONG_LIST_MAX_KEYS = 96;
const ROOM_LONG_LIST_MAX_KEY_LENGTH = 160;
const ROOM_LONG_LIST_COOKIE_KEY = 'roomLongListDisclosureV1';
const ROOM_LONG_LIST_COOKIE_MAX_AGE = 31536000;
function roomLongListToken(value) {
  // Two independent 32-bit hashes keep the emergency cookie compact and
  // content-free without depending on BigInt support in older Safari builds.
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function loadRoomLongListCookieTokens() {
  try {
    const prefix = ROOM_LONG_LIST_COOKIE_KEY + '=';
    const raw = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    if (!raw) return null;
    const value = raw.slice(prefix.length);
    if (!value.startsWith('v1.')) return null;
    return new Set(value.slice(3).split('.').filter((token) => /^[0-9a-f]{16}$/.test(token)).slice(-ROOM_LONG_LIST_MAX_KEYS));
  } catch (_) { return null; }
}
function clearRoomLongListCookie() {
  try { document.cookie = ROOM_LONG_LIST_COOKIE_KEY + '=; Path=/; Max-Age=0; SameSite=Lax'; } catch (_) {}
}
function persistRoomLongListCookie(tokens) {
  try {
    const value = 'v1.' + Array.from(tokens).slice(-ROOM_LONG_LIST_MAX_KEYS).join('.');
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = ROOM_LONG_LIST_COOKIE_KEY + '=' + value + '; Path=/; Max-Age=' + ROOM_LONG_LIST_COOKIE_MAX_AGE + '; SameSite=Lax' + secure;
  } catch (_) {}
}
function loadRoomLongListState() {
  const state = new Map();
  try {
    const parsed = JSON.parse(localStorage.getItem(ROOM_LONG_LIST_STORAGE_KEY) || 'null');
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.collapsed)) return state;
    for (const rawKey of parsed.collapsed.slice(0, ROOM_LONG_LIST_MAX_KEYS)) {
      const key = typeof rawKey === 'string' ? rawKey.trim() : '';
      if (!key || key.length > ROOM_LONG_LIST_MAX_KEY_LENGTH) continue;
      state.set(key, false);
    }
  } catch (_) {}
  return state;
}
const roomLongListState = loadRoomLongListState();
const loadedRoomLongListCookieTokens = loadRoomLongListCookieTokens();
let roomLongListCookieAuthoritative = loadedRoomLongListCookieTokens !== null;
const roomLongListCookieTokens = loadedRoomLongListCookieTokens || new Set();
if (roomLongListCookieAuthoritative) roomLongListState.clear();
else for (const key of roomLongListState.keys()) roomLongListCookieTokens.add(roomLongListToken(key));
function persistRoomLongListState() {
  if (roomLongListCookieAuthoritative) {
    persistRoomLongListCookie(roomLongListCookieTokens);
    return;
  }
  let primarySaved = false;
  try {
    const collapsed = Array.from(roomLongListState.entries())
      .filter(([, open]) => open === false)
      .map(([key]) => key)
      .filter((key) => typeof key === 'string' && key.length > 0 && key.length <= ROOM_LONG_LIST_MAX_KEY_LENGTH)
      .slice(-ROOM_LONG_LIST_MAX_KEYS);
    localStorage.setItem(ROOM_LONG_LIST_STORAGE_KEY, JSON.stringify({ v: 1, collapsed }));
    primarySaved = true;
  } catch (_) {}
  if (primarySaved) {
    roomLongListCookieAuthoritative = false;
    clearRoomLongListCookie();
  } else {
    roomLongListCookieAuthoritative = true;
    persistRoomLongListCookie(roomLongListCookieTokens);
  }
}
let roomLongListSerial = 0;
function attachRoomLongListDisclosure(section, head, nodes, stateKey, options = {}) {
  if (!section || !head || !Array.isArray(nodes) || !nodes.length) return null;
  const title = head.querySelector('h1,h2,h3,.shelf-title,.corpus-section-title,.corpus-list-count');
  const fallbackLabel = String((title && title.textContent) || tt('room.corpus.sectionMaterials', 'Учебные материалы')).trim();
  const currentLabel = () => String(
    (typeof options.label === 'function' ? options.label() : options.label) ||
    (title && title.textContent) || fallbackLabel
  ).trim();
  const stableKey = String(stateKey || '').trim().slice(0, ROOM_LONG_LIST_MAX_KEY_LENGTH);
  if (!stableKey) return null;
  const bodyId = 'roomLongListBody' + (++roomLongListSerial);
  const body = el('div', { class: 'room-long-list-body', attrs: { id: bodyId, role: 'region', 'aria-label': currentLabel() } });
  nodes.filter(Boolean).forEach((node) => body.appendChild(node));
  section.insertBefore(body, head.nextSibling);
  head.classList.add('room-long-list-head');
  if (title) title.classList.add('room-long-list-title');
  const toggle = el('button', { class: 'room-section-toggle', attrs: {
    type: 'button', 'aria-expanded': 'true', 'aria-controls': bodyId, 'data-disclosure-key': stableKey,
  } });
  const paint = (open) => {
    const label = currentLabel();
    body.hidden = !open;
    body.setAttribute('aria-label', label);
    toggle.setAttribute('aria-expanded', String(open));
    const action = tt(open ? 'room.corpus.sectionCollapse' : 'room.corpus.sectionExpand', open ? 'Свернуть' : 'Развернуть');
    toggle.setAttribute('aria-label', action + ': ' + label);
    toggle.textContent = (open ? '⌃ ' : '⌄ ') + action;
  };
  toggle.__roomDisclosureRepaint = () => paint(toggle.getAttribute('aria-expanded') === 'true');
  const stableToken = roomLongListToken(stableKey);
  const open = roomLongListCookieAuthoritative
    ? !roomLongListCookieTokens.has(stableToken)
    : (roomLongListState.has(stableKey) ? roomLongListState.get(stableKey) : true);
  paint(open);
  toggle.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-expanded') !== 'true';
    if (next) {
      roomLongListState.delete(stableKey);
      roomLongListCookieTokens.delete(stableToken);
    } else {
      roomLongListState.set(stableKey, false);
      roomLongListCookieTokens.add(stableToken);
    }
    persistRoomLongListState();
    paint(next);
  });
  // Keep visual and accessibility order aligned: primary title, optional
  // secondary action(s), disclosure, then explanatory copy on row two.
  const intro = Array.from(head.children).find((node) => node.classList && node.classList.contains('shelf-intro'));
  if (intro) head.insertBefore(toggle, intro); else head.appendChild(toggle);
  return { body, toggle };
}

function repaintRoomDisclosureLocale() {
  document.querySelectorAll('.room-section-toggle').forEach((toggle) => {
    try { if (typeof toggle.__roomDisclosureRepaint === 'function') toggle.__roomDisclosureRepaint(); } catch (_) {}
  });
}

// Repeated material collections share one vertical, scan-first row grammar. Their
// truth-specific copy stays in renderCorpusWorkRow/Learning Compass; only structure
// and interaction are unified here.
function buildMaterialRowSection(cssClass, meta, cards) {
  if (!cards || !cards.length) return null;
  const sec = el('section', { class: 'shelf ' + cssClass });
  const head = el('div', { class: 'shelf-head' });
  const h = el('h2', { class: 'shelf-title' });
  h.textContent = meta.emoji + ' ' + tt(meta.titleKey, meta.titleFallback);
  head.appendChild(h);
  head.appendChild(el('p', { class: 'shelf-intro', i18n: meta.introKey, text: tt(meta.introKey, meta.introFallback) }));
  sec.appendChild(head);
  const list = el('div', { class: 'corpus-work-list room-preview-list' });
  for (const c of cards) list.appendChild(renderCorpusWorkRow(c, true, {
    compact: true, showAuthor: true, showListBtn: true, materialKind: 'recommendation',
  }));
  sec.appendChild(list);
  attachRoomLongListDisclosure(sec, head, [list], 'ben:rail:' + cssClass);
  return sec;
}

// ROOM-CORPUS-DISCOVERY: shared structure, typed rows. The section never owns
// recommendation truth; each corpus passes rows rendered from its existing reader.
function buildProfileFitSection(scope, rows) {
  const materialRows = (rows || []).filter(Boolean).slice(0, ROOM_PROFILE_FIT_PREVIEW);
  if (materialRows.length < 2) return null;
  const sec = el('section', { class: 'shelf corpus-profile-fit corpus-profile-fit-' + String(scope || 'corpus') });
  const head = el('div', { class: 'shelf-head' });
  const h = el('h2', { class: 'shelf-title', i18n: 'room.corpus.profileFitTitle', text: tt('room.corpus.profileFitTitle', 'Подходит по вашему профилю слов') });
  head.appendChild(h);
  head.appendChild(el('p', { class: 'shelf-intro', i18n: 'room.corpus.profileFitIntro', text: tt('room.corpus.profileFitIntro', 'Материалы с наибольшей подтверждённой долей знакомых слов. Это нижняя граница по вашему профилю, а не оценка понимания текста.') }));
  sec.appendChild(head);
  const list = el('div', { class: 'corpus-work-list room-preview-list' });
  for (const row of materialRows) {
    row.setAttribute('data-profile-fit', 'true');
    list.appendChild(row);
  }
  sec.appendChild(list);
  attachRoomLongListDisclosure(sec, head, [list], String(scope || 'corpus') + ':profile-fit');
  return sec;
}

function corpusCatalogRegion(scope) {
  const key = String(scope || 'corpus').replace(/[^a-z0-9_-]+/gi, '-');
  const titleId = 'corpusCatalogTitle-' + key;
  const region = el('section', { class: 'corpus-catalog-region corpus-catalog-' + key, attrs: { 'aria-labelledby': titleId } });
  const head = el('div', { class: 'corpus-catalog-head' });
  head.appendChild(el('h2', { class: 'corpus-catalog-title', i18n: 'room.corpus.catalogTitle', text: tt('room.corpus.catalogTitle', 'Каталог корпуса'), attrs: { id: titleId } }));
  head.appendChild(el('p', { class: 'corpus-catalog-intro', i18n: 'room.corpus.catalogIntro', text: tt('room.corpus.catalogIntro', 'Поиск охватывает весь доступный каталог. Фильтры и сортировка меняют только список ниже.') }));
  region.appendChild(head);
  return region;
}

// S3 — cold-start «С чего начать» rail (profile-FREE): the most accessible ready works by the
// sidecar's intrinsic easiness score (ez). Author-diversity capped. No % badge — absolute
// «короткий · частотная лексика» cues, honest for empty profiles.
function buildColdStartSection(v, excludeIds) {
  const ready = (corpusIndex && corpusIndex.ready) || [];
  const scored = ready
    .map((c) => ({ c: c, ez: (v.works[String(c.id)] || {}).ez || 0 }))
    .filter((x) => x.ez > 0 && !(excludeIds && excludeIds.has(String(x.c.id)))).sort((a, b) => b.ez - a.ez);
  const perAuthor = {}, pick = [];
  for (const x of scored) {
    const a = x.c.author || '?';
    if ((perAuthor[a] || 0) >= 2) continue;
    perAuthor[a] = (perAuthor[a] || 0) + 1; pick.push(x.c);
    if (pick.length >= ROOM_PROFILE_FIT_PREVIEW) break;
  }
  return buildMaterialRowSection('corpus-coldstart', {
    emoji: '🌱', titleKey: 'room.corpus.coldStartTitle', titleFallback: 'С чего начать',
    introKey: 'room.corpus.coldStartIntro', introFallback: 'Короткие тексты с частотной лексикой — лёгкий вход в иврит.',
  }, pick);
}

// B7 corpus L1 coordinator: a valid profile may order candidates only relative to one another.
// If the projection or exact ingredients are unavailable, the profile-free curated start rail owns L1.
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
  meta.appendChild(el('span', { class: 'prov-badge continue-pct', text: tt('room.resume.positionPercent', 'позиция · {value}%').replace('{value}', String(pct)) }));
  node.appendChild(meta);
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.resume.continue', text: tt('room.resume.continue', 'Продолжить') }));
  const open = () => openReader(item.id, item.title, { resume: true });
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  // Epic-5 W1 — dismiss ✓: mark this text read straight from the shelf (clears a finished/near-done
  // text without reopening). stopPropagation so it never triggers the card's open handler.
  const done = el('button', { class: 'continue-done', text: '✓', attrs: { 'aria-label': tt('room.resume.markReadTip', 'Отметить прочитанным') } });
  done.type = 'button';
  done.title = tt('room.resume.markReadTip', 'Отметить прочитанным');
  done.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  done.addEventListener('click', async (e) => {
    e.stopPropagation(); e.preventDefault();
    done.disabled = true;
    try { await localDb.setTextFinished(item.id); } catch (_) {}
    invalidateFinishedSet();
    // FB-4 — capture the card's position so «Отменить» can restore it (reversible destructive action).
    const rail = node.parentNode;
    const sib = node.nextSibling;
    const sec = rail && rail.closest ? rail.closest('.corpus-continue') : null;
    const secParent = sec ? sec.parentNode : null;
    const secSib = sec ? sec.nextSibling : null;
    if (node.remove) node.remove();
    if (rail && !rail.children.length && sec && sec.remove) sec.remove();
    const undo = async () => {
      try { await localDb.clearTextFinished(item.id); } catch (_) {}
      invalidateFinishedSet();
      done.disabled = false;
      try {
        if (rail) rail.insertBefore(node, sib);                                      // re-home the card
        if (sec && !sec.isConnected && secParent) secParent.insertBefore(sec, secSib); // re-attach an emptied shelf
      } catch (_) {}   // DOM moved on → the card reappears on the next home render (clearTextFinished persisted)
    };
    try { roomToast(tt('room.resume.markedRead', 'Отмечено: прочитано'), tt('room.resume.undo', 'Отменить'), undo); } catch (_) {}
  });
  node.appendChild(done);
  return node;
}

// Prepend the «Продолжить чтение» shelf above everything (R8 «что дальше»). Guarded against a
// stale/swapped body (a navigation or filter replaced the L1 home while the DB query was in flight).
async function injectContinueReading(body) {
  try {
    const sec = await buildContinueRailSection(12);
    if (!sec || corpusL1Body !== body || corpusFilterActive()) return;
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}
// Shared builder: the Continue rail is CROSS-corpus by nature (one localDb, one reading life) —
// the hub (L0) shows it above the corpus витрина, the Ben-Yehuda home keeps its copy.
async function buildContinueRailSection(limit) {
  let items = [];
  try { items = await localDb.getContinueReading(limit || 12); } catch (_) { items = []; }
  if (!items || !items.length) return null;
  const sec = el('section', { class: 'shelf corpus-continue' });
  const head = el('div', { class: 'shelf-head' });
  head.appendChild(el('h2', { class: 'shelf-title', text: '▶ ' + tt('room.resume.shelfTitle', 'Продолжить чтение') }));
  sec.appendChild(head);
  const rail = el('div', { class: 'shelf-rail' });
  for (const it of items) rail.appendChild(renderContinueCard(it));
  sec.appendChild(rail);
  attachRoomLongListDisclosure(sec, head, [rail], 'ben:continue');
  return sec;
}

// FB-3 — honest read-label for a finished text. finished_at is set by the end-card «✓ Прочитано» AND
// by the Continue dismiss-✓ at ANY progress, so «прочитано» is asserted ONLY at a true end-reach
// (≥95% of rows); a dismissed-early text reads «отмечено · N%» — never overclaimed as fully read.
function finishedReadBadge(item) {
  const pct = window.ReaderProgress ? window.ReaderProgress.continuePercent(item.last_row_idx, item.n_rows) : 0;
  if (pct >= 95) return el('span', { class: 'prov-badge finished-done', i18n: 'room.resume.readDone', text: tt('room.resume.readDone', '✓ прочитано') });
  return el('span', { class: 'prov-badge finished-partial', text: tt('room.resume.markedPartial', 'отмечено') + ' · ' + pct + '%' });
}

// FB-1 — a «✓ Прочитанные» card: a text the reader MARKED finished. Opens by its live local id
// (resume to where they left). «↩ снять отметку» (clearTextFinished) returns it to «Продолжить».
function renderFinishedCard(item) {
  const node = el('div', { class: 'work-card finished-card', attrs: { role: 'button', tabindex: '0' } });
  const title = item.title || tt('room.work.untitled', 'Без названия');
  const titleEl = el('span', { class: 'work-card-title', text: title });
  if (HEBREW_RE.test(title)) titleEl.setAttribute('dir', 'rtl');
  node.appendChild(titleEl);
  const meta = el('div', { class: 'work-card-meta' });
  meta.appendChild(finishedReadBadge(item));
  node.appendChild(meta);
  node.appendChild(el('span', { class: 'work-card-cta', i18n: 'room.bookmark.open', text: tt('room.bookmark.open', 'Открыть') }));
  const open = () => openReader(item.id, item.title, { resume: true });
  node.addEventListener('click', open);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  // ↩ un-mark — a corner control mirroring the Continue dismiss-✓ (fits the 132px rail card; the full
  // «снять отметку» label lives in the «Показать все» sheet + the end-card). aria-label carries intent.
  const un = el('button', { class: 'finished-unmark', text: '↩', attrs: { type: 'button', 'aria-label': tt('room.resume.unmark', 'снять отметку') } });
  un.title = tt('room.resume.unmark', 'снять отметку');
  un.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  un.addEventListener('click', async (e) => {
    e.stopPropagation(); e.preventDefault();
    un.disabled = true;
    try { await localDb.clearTextFinished(item.id); } catch (_) {}
    invalidateFinishedSet();
    const rail = node.parentNode;
    if (node.remove) node.remove();
    if (rail && !rail.children.length) { const sec = rail.closest ? rail.closest('.corpus-finished') : null; if (sec && sec.remove) sec.remove(); }
    try { roomToast(tt('room.resume.unmarked', 'Отметка снята — снова в «Продолжить»')); } catch (_) {}
  });
  node.appendChild(un);
  return node;
}

// ── Эпик B «Мои тексты» — the user's OWN Studio texts as a native Room shelf ─────────────────
// The storage is ALREADY shared (one OPFS localDb): corpus works and Studio texts live in the
// same `texts` table. A text is CORPUS iff source_meta_json.corpus is set (the canonical
// discriminator, db/premium/corpusMeta.js) — «Мои тексты» = NOT corpus AND NOT archived.
// Opening uses the SAME byte-parity Room reader; morphology-on-tap works offline on any text;
// context/proclitic overlays are absent for own texts → the P4 provider chain falls to honest
// un-baked semantics (live Tier-3 + consent) with no extra code. Management (edit/enrich/delete/
// export) deliberately stays in the Studio — a premium reading surface is not a management
// console; the expanded view links there instead. ONE listTexts query, zero per-item fan-out
// (feedback_test_with_nonempty_profile).
function isCorpusTextRow(r) {
  try { const sm = r && r.source_meta_json ? JSON.parse(r.source_meta_json) : null; return !!(sm && (sm.corpus || sm.group_corpus)); } catch (_) { return false; }
}
function myTextTags(r) {
  try { const t = r && r.tags_json ? JSON.parse(r.tags_json) : null; return Array.isArray(t) ? t.filter(Boolean).map(String) : []; } catch (_) { return []; }
}
async function addMachineNiqqud(item, button) {
  button.disabled = true;
  try {
    const local = await localDb.getNiqqudRequestForText(item.id);
    if (local.state === 'ASSERTED') {
      roomToast(tt('room.nakdan.protected', 'Пользовательский или выверенный никуд сохранён без изменений.'));
      button.textContent = tt('room.nakdan.protectedShort', 'Никуд защищён');
      return;
    }
    if (local.state === 'DERIVED_CACHE') {
      roomToast(tt('room.nakdan.cached', 'Машинный никуд уже в кеше для неизменённого текста.'));
      button.textContent = '✓ ' + tt('room.nakdan.derivedShort', 'машинный никуд');
      return;
    }
    if (!local.body || !local.row_count) throw new Error('NAKDAN_INVALID_INPUT');
    if (!window.confirm(tt('room.nakdan.consent', 'Отправить этот личный текст в Dicta Nakdan? Результат будет сохранён только как производный машинный слой.'))) {
      button.disabled = false;
      return;
    }
    button.textContent = tt('room.nakdan.loading', 'Добавляем никуд…');
    const response = await fetch('/api/niqqud/on-demand', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': localStorage.getItem('cloud.csrf') || '' },
      body: JSON.stringify({ text: local.body, purpose: 'LIBRARY_OWNER' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || ('HTTP_' + response.status));
    await localDb.saveDerivedNiqqud(item.id, result);
    button.textContent = '✓ ' + tt('room.nakdan.derivedShort', 'машинный никуд');
    roomToast(tt('room.nakdan.ready', 'Машинный никуд добавлен как производный слой · {provenance}').replace('{provenance}', result.niqqud_provenance || 'DICTA_NAKDAN'));
  } catch (error) {
    const code = String(error && error.message || error);
    button.disabled = false;
    button.textContent = tt('room.nakdan.add', 'Добавить никуд');
    if (code === 'NAKDAN_UNAVAILABLE') roomToast(tt('room.nakdan.unavailable', 'Dicta сейчас недоступна. Текст остаётся доступен без никуда.'));
    else if (code === 'UNAUTHENTICATED' || code === 'BAD_CSRF') roomToast(tt('room.nakdan.signIn', 'Войдите в аккаунт, чтобы запросить машинный никуд.'));
    else if (code === 'NIQQUD_ASSERTED_PROTECTED') roomToast(tt('room.nakdan.protected', 'Пользовательский или выверенный никуд сохранён без изменений.'));
    else roomToast(tt('room.nakdan.failed', 'Не удалось добавить никуд: {code}').replace('{code}', code));
  }
}
function renderMyTextCard(item, vertical) {
  const node = el('article', { class: 'corpus-work-row room-text-row room-material-row mytext-card' + (vertical ? ' mytext-card-v' : ''), attrs: { 'data-material-kind': 'mytext', 'data-continuity-key': continuityKey('mytexts', item.id) } });
  const col = el('div', { class: 'corpus-work-col' });
  const totalRows = Math.max(0, Number(item && item.rows_count) || 0);
  const hasBoundMedia = !!(item && (item.media_kind === 'audio' || item.media_kind === 'video'));
  const mappedRows = Math.max(0, Math.min(totalRows, Number(item && item.audio_count) || (hasBoundMedia ? totalRows : 0)));
  const audioCoverage = !hasBoundMedia || mappedRows <= 0 ? 'none' : totalRows > 0 && mappedRows >= totalRows ? 'full' : 'partial';
  const media = {
    kind: 'audio', coverage: audioCoverage, humanOrTts: null,
    countLabel: mappedRows > 0 && totalRows > 0 ? mappedRows + '/' + totalRows : null,
    videoAvailable: !!(item && item.media_kind === 'video'),
  };
  const descriptor = myCompassDescriptor(item);
  const makeView = () => adaptMyTextItem(item, {
    copy: corpusItemCopy(), media, mediaProvenance: { type: 'derived', source: 'local-media-passport', revision: item.updated_at || null },
    ...learningCompassContext(descriptor && descriptor.cache_key, { continue_reading: Number(item.last_row_idx) > 0, asserted_level: !!item.level }),
  });
  let view = makeView();
  const title = view.title;
  const openLink = el('a', { class: 'room-text-title-link mytext-open', attrs: { href: deepLinkForText(item.id), 'data-continuity-action': 'open' } });
  const titleCopy = el('span', { class: 'room-item-title-copy' });
  const titleEl = markRoomTextLanguage(el('bdi', { class: 'work-card-title', text: title }), title);
  titleCopy.appendChild(titleEl);
  if (view.secondaryIdentity) titleCopy.appendChild(el('span', { class: 'item-secondary-identity', text: view.secondaryIdentity }));
  openLink.appendChild(titleCopy);
  openLink.appendChild(el('span', { class: 'room-text-primary', text: view.primaryAction === 'continue' ? tt('room.resume.continue', 'Продолжить') : tt('room.mytexts.read', 'Читать') }));
  col.appendChild(openLink);
  const compassRow = renderLearningCompass(view, { showMedia: true, showTags: false, showDetails: true });
  if (descriptor) {
    compassRow.setAttribute('data-compass-key', descriptor.cache_key);
    compassRow.__compassRepaint = () => { view = makeView(); paintLearningCompass(compassRow, view, { showMedia: true, showTags: false, showDetails: true }); };
  }
  col.appendChild(compassRow);
  node.appendChild(col);
  // B3: enrichment is useful, but it is not the reading action. Keep it in a per-row
  // disclosure so a scan remains title/progress-first and the consent boundary is unchanged.
  const secondary = el('details', { class: 'mytext-secondary' });
  secondary.appendChild(el('summary', { class: 'room-row-more', attrs: { 'aria-label': tt('room.shell.moreActions', 'Другие действия') }, text: '•••' }));
  const secondaryPanel = el('div', { class: 'mytext-secondary-panel' });
  if (view.provenanceSummary) secondaryPanel.appendChild(el('p', { class: 'room-item-provenance', text: view.provenanceSummary }));
  const nakdan = el('button', { class: 'mytext-nakdan', attrs: { type: 'button' }, text: 'אְ ' + tt('room.nakdan.add', 'Добавить никуд') });
  nakdan.addEventListener('click', () => addMachineNiqqud(item, nakdan));
  secondaryPanel.appendChild(nakdan); secondary.appendChild(secondaryPanel); node.appendChild(secondary);
  const open = () => openReader(item.id, item.title, { resume: view.learnerState.state !== 'new' });
  if (EMBED) openLink.addEventListener('click', (event) => { event.preventDefault(); open(); });
  // Compatibility for callers that programmatically click the row in legacy smokes. The article
  // itself is not focusable/announced as a control; user-facing activation belongs to the link.
  node.addEventListener('click', (event) => { if (event.target === node) open(); });
  return node;
}

async function paintMyTextsProfileFit(host, token, heroItemId) {
  try {
    if (!host || token !== corpusRenderToken || !host.isConnected) return;
    await startPersonalCompassSweep();
    const ranked = await loadPersonalFamiliarityRanking({ q: '', level: '', tags: [], tagMode: 'all', scope: 'texts', smart: '', smartIds: [] });
    if (ranked.status !== 'AVAILABLE' || Number(ranked.rankEligibleTotal || 0) < 2) return;
    const excludeIds = new Set(heroItemId == null ? [] : [String(heroItemId)]);
    const eligible = ranked.items.slice(0, Number(ranked.rankEligibleTotal || 0)).filter((item) => (
      item && !item.finished_at && !excludeIds.has(String(item.id))
    ));
    if (token !== corpusRenderToken || !host.isConnected || eligible.length < 2) return;
    const section = buildProfileFitSection('mytexts', eligible.slice(0, ROOM_PROFILE_FIT_PREVIEW).map((item) => renderMyTextCard(item, true)));
    host.replaceChildren(...(section ? [section] : []));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}
// Legacy reusable own-text rail. It is intentionally not mounted inside Ben-Yehuda;
// the full owner corpus lives at L0 / its own corpus surface.
async function injectMyTexts(body) {
  try {
    let page = { items: [], matchedTotal: 0 };
    try { page = await localDb.listPersonalTextsPage({ limit: ROOM_PREVIEW, sort: 'opened_desc' }); } catch (_) {}
    const mine = page.items || [];
    if (!mine.length || corpusL1Body !== body || corpusFilterActive()) return;   // self-hides: corpus-only users see no dead shelf
    await prepareLearningCompassPage(mine.map(myCompassDescriptor));
    if (corpusL1Body !== body || corpusFilterActive()) return;
    const sec = el('section', { class: 'shelf corpus-continue mytexts-shelf' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: '📖 ' + tt('room.mytexts.shelfTitle', 'Мои тексты') }));
    const goCorpus = el('button', { class: 'mytexts-toggle', attrs: { type: 'button' } });
    goCorpus.textContent = tt('room.mytexts.wholeCorpus', 'Весь корпус') + ' (' + Number(page.matchedTotal || 0) + ') →';
    goCorpus.addEventListener('click', () => corpusNavToCorpus('mytexts'));
    head.appendChild(goCorpus);
    sec.appendChild(head);
    const rail = el('div', { class: 'shelf-rail' });
    for (const it of mine.slice(0, ROOM_PREVIEW)) rail.appendChild(renderMyTextCard(it, false));
    sec.appendChild(rail);
    attachRoomLongListDisclosure(sec, head, [rail], 'mytexts:preview');
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}

// FB-1 — the «✓ Прочитанные» shelf, directly below «Продолжить чтение». Self-hides when empty
// (a new profile gets no dead-end). Fetches one over the rail cap so «Показать все» appears ONLY when
// there genuinely are more than the rail shows. Same stale-body + filter-active guards as Continue.
async function injectFinishedReading(body) {
  try {
    const RAIL = 12;
    let items = [];
    try { items = await localDb.getFinishedTexts(RAIL + 1); } catch (_) { items = []; }
    if (!items || !items.length || corpusL1Body !== body || corpusFilterActive()) return;
    const hasMore = items.length > RAIL;
    const shown = items.slice(0, RAIL);
    const sec = el('section', { class: 'shelf corpus-finished' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: '✓ ' + tt('room.resume.finishedShelf', 'Прочитанные') }));
    if (hasMore) {
      const all = el('button', { class: 'shelf-showall', attrs: { type: 'button' } });
      all.textContent = tt('room.resume.showAll', 'Показать все') + ' →';
      all.addEventListener('click', () => openFinishedAllSheet());
      head.appendChild(all);
    }
    sec.appendChild(head);
    const rail = el('div', { class: 'shelf-rail' });
    for (const it of shown) rail.appendChild(renderFinishedCard(it));
    sec.appendChild(rail);
    attachRoomLongListDisclosure(sec, head, [rail], 'ben:finished');
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}

// FB-1 (fork ①) — «Показать все» beyond the rail: a DB-backed bottom-sheet listing every finished
// text (NOT a corpusSearch filter — finished-ness can't ride the catalog). Each row opens or un-marks.
async function openFinishedAllSheet() {
  let items = [];
  try { items = await localDb.getFinishedTexts(500); } catch (_) { items = []; }
  const ov = el('div', { class: 'list-picker-ov finished-sheet-ov' });
  const box = el('div', { class: 'list-picker finished-sheet' });
  const titleEl = el('div', { class: 'list-picker-title' });
  box.appendChild(titleEl);
  const listWrap = el('div', { class: 'finished-sheet-list' });
  const close = () => { try { ov.remove(); } catch (_) {} document.removeEventListener('keydown', onKey); };
  const repaint = () => {
    titleEl.textContent = '✓ ' + tt('room.resume.finishedShelf', 'Прочитанные') + ' (' + items.length + ')';   // keep the count live after an in-sheet un-mark
    listWrap.innerHTML = '';
    if (!items.length) { listWrap.appendChild(el('div', { class: 'finished-sheet-empty', text: tt('room.resume.finishedEmpty', 'Пока нет прочитанных текстов.') })); return; }
    for (const it of items) {
      const row = el('div', { class: 'finished-sheet-row' });
      const main = el('button', { class: 'finished-sheet-open', attrs: { type: 'button' } });
      const t = el('span', { class: 'finished-sheet-title', text: it.title || tt('room.work.untitled', 'Без названия') });
      if (HEBREW_RE.test(it.title || '')) t.setAttribute('dir', 'rtl');
      main.appendChild(t);
      main.appendChild(finishedReadBadge(it));
      main.addEventListener('click', () => { close(); openReader(it.id, it.title, { resume: true }); });
      row.appendChild(main);
      const un = el('button', { class: 'finished-sheet-unmark', attrs: { type: 'button', 'aria-label': tt('room.resume.unmark', 'снять отметку') } });
      un.textContent = '↩';
      un.addEventListener('click', async () => { try { await localDb.clearTextFinished(it.id); } catch (_) {} invalidateFinishedSet(); items = items.filter((x) => x.id !== it.id); repaint(); });
      row.appendChild(un);
      listWrap.appendChild(row);
    }
  };
  repaint();
  box.appendChild(listWrap);
  const done = el('button', { class: 'list-picker-done', attrs: { type: 'button' } }); done.textContent = tt('room.corpus.lists.done', 'Готово');
  done.addEventListener('click', close);
  box.appendChild(done);
  ov.appendChild(box);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
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
    attachRoomLongListDisclosure(sec, head, [rail], 'ben:bookmarks');
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
      setRoomIcon(x, 'lp-icon-close', '✕');
      x.addEventListener('click', () => { removeSavedSearch(s.name); corpusRefreshL1Body(); });
      chip.appendChild(run); chip.appendChild(x); chips.appendChild(chip);
    }
    sec.appendChild(chips);
    attachRoomLongListDisclosure(sec, head, [chips], 'ben:saved-searches');
    body.insertBefore(sec, body.firstChild);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}
// BRR-P3 — list picker: choose which named list(s) to add a work to, or create a new one inline.
function updateListBtn(btn, card) {
  const on = isInAnyList(card.id);
  // `btn.__iconOnly` (dense work-row button) shows just the glyph; the snippet/picker buttons show the label.
  const symbol = on ? 'lp-icon-success' : 'lp-icon-list-add';
  const fallback = on ? '✓' : '➕';
  if (btn.__iconOnly) setRoomIcon(btn, symbol, fallback);
  else appendRoomIconText(btn, symbol, fallback, tt('room.corpus.lists.short', 'В список'));
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
function readingListLiveItem(item) {
  let live = null;
  try { live = corpusReadyMap().get(String(item && item.id)) || null; } catch (_) { live = null; }
  const savedReady = !!(item && item.r && item.file && item.text_key);
  const liveReady = !!(live && live.file && live.text_key);
  return { card: liveReady ? live : item, openable: liveReady || savedReady };
}

function renderReadingListMaterialRow(listId, item, index, onChanged) {
  const resolved = readingListLiveItem(item);
  const row = renderCorpusWorkRow(resolved.card || item, resolved.openable, {
    compact: true, showAuthor: true, materialKind: 'reading-list',
  });
  row.classList.add('reading-list-material-row');
  row.setAttribute('data-material-kind', 'reading-list');
  // The work-opening action may be unavailable, but list management is still
  // valid. Do not let the row-level catalog aria-disabled state disable the
  // labelled Remove control in its accessibility subtree.
  if (!resolved.openable) row.removeAttribute('aria-disabled');
  const remove = el('button', {
    class: 'reading-list-remove room-text-secondary',
    attrs: { type: 'button', 'aria-label': tt('room.corpus.lists.removeFromList', 'Убрать из списка') },
    text: tt('room.corpus.lists.removeFromList', 'Убрать из списка'),
  });
  remove.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    removeItemFromList(listId, item.id);
    if (onChanged) onChanged();
    roomToast(
      tt('room.corpus.lists.removed', 'Убрано из списка'),
      tt('room.corpus.lists.undo', 'Отменить'),
      () => { if (restoreItemToList(listId, item, index) && onChanged) onChanged(); },
    );
  });
  const cta = row.querySelector('.corpus-work-cta');
  row.insertBefore(remove, cta || null);
  return row;
}

function readingListDialogShell(title, trigger) {
  const overlay = el('div', { class: 'list-picker-ov reading-list-dialog-ov' });
  const dialogId = 'readingListDialog' + (++roomLongListSerial);
  const dialog = el('div', { class: 'list-picker reading-list-dialog', attrs: {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': dialogId,
  } });
  const head = el('div', { class: 'reading-list-dialog-head' });
  const heading = el('h2', { class: 'list-picker-title', attrs: { id: dialogId }, text: title });
  const closeButton = el('button', {
    class: 'reading-list-dialog-close', attrs: { type: 'button', 'aria-label': tt('room.corpus.lists.close', 'Закрыть') }, text: '×',
  });
  head.appendChild(heading); head.appendChild(closeButton); dialog.appendChild(head); overlay.appendChild(dialog);
  const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    try { overlay.remove(); } catch (_) {}
    if (trigger && trigger.isConnected) trigger.focus();
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  return { overlay, dialog, heading, closeButton, close };
}

function openReadingListManager(listId, trigger, onChanged) {
  const list = getReadingLists().find((item) => item.id === listId);
  if (!list) return;
  const shell = readingListDialogShell(tt('room.corpus.lists.manage', 'Действия со списком'), trigger);
  const form = el('form', { class: 'reading-list-manage-form' });
  const label = el('label', { class: 'reading-list-name-label', text: tt('room.corpus.lists.nameLabel', 'Название списка') });
  const input = el('input', { class: 'reading-list-name-input', attrs: {
    type: 'text', maxlength: '120', value: list.name, autocomplete: 'off',
  } });
  label.appendChild(input); form.appendChild(label);
  const actions = el('div', { class: 'reading-list-manage-actions' });
  const save = el('button', { class: 'reading-list-save', attrs: { type: 'submit' }, text: tt('room.corpus.lists.saveName', 'Сохранить название') });
  const remove = el('button', { class: 'reading-list-delete-action', attrs: { type: 'button' }, text: tt('room.corpus.lists.deleteAction', 'Удалить список…') });
  actions.appendChild(save); actions.appendChild(remove); form.appendChild(actions); shell.dialog.appendChild(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!renameReadingList(listId, input.value)) { input.focus(); return; }
    if (onChanged) onChanged();
    roomToast(tt('room.corpus.lists.renamed', 'Название сохранено'));
    shell.close();
  });
  remove.addEventListener('click', () => {
    const count = (list.items || []).length;
    const message = tt('room.corpus.lists.deleteConfirm', 'Удалить список «{name}» и убрать из него {count} материалов?')
      .replace('{name}', list.name).replace('{count}', String(count));
    if (!window.confirm(tt('room.corpus.lists.deleteConfirm', message).replace('{name}', list.name).replace('{count}', String(count)))) return;
    deleteReadingList(listId);
    if (onChanged) onChanged();
    roomToast(tt('room.corpus.lists.deleted', 'Список удалён'));
    shell.close();
  });
  setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 0);
}

function openReadingListDetail(listId, trigger, onChanged) {
  const initial = getReadingLists().find((item) => item.id === listId);
  if (!initial) return;
  const shell = readingListDialogShell(initial.name, trigger);
  const boundary = el('p', { class: 'reading-list-device-copy', text: tt('room.corpus.lists.deviceOnly', 'Этот список хранится только на этом устройстве.') });
  const listNode = el('div', { class: 'corpus-work-list reading-list-detail-list room-preview-list' });
  const pager = el('nav', { class: 'learning-journey-pager reading-list-pager', attrs: { 'aria-label': tt('room.corpus.lists.pages', 'Страницы списка') } });
  shell.dialog.appendChild(boundary); shell.dialog.appendChild(listNode); shell.dialog.appendChild(pager);
  let activeOffset = 0;
  const repaint = () => {
    const current = getReadingLists().find((item) => item.id === listId);
    if (!current) { shell.close(); if (onChanged) onChanged(); return; }
    const items = Array.isArray(current.items) ? current.items : [];
    if (activeOffset >= items.length && activeOffset > 0) activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE);
    shell.heading.textContent = current.name + ' (' + items.length + ')';
    listNode.replaceChildren();
    const pageItems = items.slice(activeOffset, activeOffset + ROOM_BROWSE_PAGE);
    for (let index = 0; index < pageItems.length; index += 1) {
      listNode.appendChild(renderReadingListMaterialRow(listId, pageItems[index], activeOffset + index, () => { repaint(); if (onChanged) onChanged(); }));
    }
    if (!pageItems.length) listNode.appendChild(el('p', { class: 'learning-home-journey-empty', text: tt('room.corpus.lists.empty', 'В этом списке пока нет материалов.') }));
    pager.replaceChildren();
    if (activeOffset > 0 || activeOffset + ROOM_BROWSE_PAGE < items.length) {
      const previous = el('button', { class: 'learning-journey-page', attrs: { type: 'button' }, text: tt('room.corpus.lists.previous', 'Назад') });
      previous.disabled = activeOffset <= 0;
      previous.addEventListener('click', () => { activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE); repaint(); listNode.querySelector('a,button')?.focus(); });
      const page = el('span', { class: 'learning-journey-page-label', text: tt('room.corpus.lists.page', 'Страница {n}').replace('{n}', String(Math.floor(activeOffset / ROOM_BROWSE_PAGE) + 1)) });
      const next = el('button', { class: 'learning-journey-page', attrs: { type: 'button' }, text: tt('room.corpus.lists.next', 'Дальше') });
      next.disabled = activeOffset + ROOM_BROWSE_PAGE >= items.length;
      next.addEventListener('click', () => { activeOffset += ROOM_BROWSE_PAGE; repaint(); listNode.querySelector('a,button')?.focus(); });
      pager.appendChild(previous); pager.appendChild(page); pager.appendChild(next);
    }
  };
  repaint();
  setTimeout(() => { try { shell.closeButton.focus(); } catch (_) {} }, 0);
}

function learningHomeReadingLists() {
  const section = el('section', { class: 'learning-home-reading-lists', attrs: { 'aria-labelledby': 'learningHomeReadingListsTitle' } });
  const head = el('div', { class: 'learning-home-section-head' });
  const title = el('h2', { class: 'learning-home-section-title', attrs: { id: 'learningHomeReadingListsTitle' }, text: tt('room.corpus.lists.moduleTitle', 'Списки для чтения') });
  const count = el('span', { class: 'reading-lists-count' });
  const intro = el('p', { class: 'shelf-intro', text: tt('room.corpus.lists.moduleIntro', 'Именованные подборки материалов Бен-Иегуды.') });
  head.appendChild(title); head.appendChild(count); head.appendChild(intro); section.appendChild(head);
  const overview = el('div', { class: 'reading-lists-overview' });
  const repaint = () => {
    const lists = getReadingLists();
    count.textContent = String(lists.length);
    overview.replaceChildren();
    for (const list of lists) {
      const items = Array.isArray(list.items) ? list.items : [];
      const row = el('article', { class: 'reading-list-summary-row' });
      const copy = el('div', { class: 'reading-list-summary-copy' });
      const name = el('h3', { class: 'reading-list-summary-title', text: list.name || tt('room.corpus.lists.untitled', 'Список') });
      if (HEBREW_RE.test(list.name || '')) name.setAttribute('dir', 'rtl');
      copy.appendChild(name);
      copy.appendChild(el('p', { class: 'reading-list-summary-meta', text: tt('room.corpus.lists.materialCount', '{count} материалов').replace('{count}', String(items.length)) }));
      row.appendChild(copy);
      const actions = el('div', { class: 'reading-list-summary-actions' });
      const open = el('button', { class: 'reading-list-open', attrs: { type: 'button' }, text: tt('room.corpus.lists.openList', 'Открыть список') });
      const manage = el('button', { class: 'reading-list-manage', attrs: { type: 'button' }, text: tt('room.corpus.lists.manage', 'Действия') });
      open.addEventListener('click', () => openReadingListDetail(list.id, open, repaint));
      manage.addEventListener('click', () => openReadingListManager(list.id, manage, repaint));
      actions.appendChild(open); actions.appendChild(manage); row.appendChild(actions); overview.appendChild(row);
    }
  };
  repaint();
  attachRoomLongListDisclosure(section, head, [overview], 'library:reading-lists', { label: () => title.textContent });
  return section;
}

// Ben now owns only corpus-local browse and discovery. Global Continue,
// Finished, Bookmarks and named lists live on the Library/L0 surface.
function injectBenHomeRails(body) {
  injectSavedSearches(body);
}

async function paintBenProfileFit(host, token) {
  try {
    if (!host || token !== corpusRenderToken || !host.isConnected) return;
    const ready = (corpusIndex && corpusIndex.ready) || [];
    if (!ready.length || !window.CorpusVocab) return;
    const [v, finished, continuationRows] = await Promise.all([
      loadCorpusVocab(), ensureFinishedSet(), localDb.getContinueReading(50).catch(() => []),
    ]);
    if (!v || !v.works) return;
    const excludeIds = new Set(Array.from(finished || []).map(String));
    const current = (continuationRows || []).find((row) => row && row.text_key && corpusReadyKeyMap().has(String(row.text_key)));
    const currentCard = current && corpusReadyKeyMap().get(String(current.text_key));
    if (currentCard && currentCard.id != null) excludeIds.add(String(currentCard.id));
    const candidates = ready.filter((card) => !excludeIds.has(String(card.id)));
    const scored = await scoreReadyByRecordedFamiliarity(candidates, v);
    if (token !== corpusRenderToken || !host.isConnected) return;
    let sec = null;
    if (scored.length >= 2) {
      const rows = scored.slice(0, ROOM_PROFILE_FIT_PREVIEW).map((item) => renderCorpusWorkRow(item.card, true, {
        compact: true, showAuthor: true, showListBtn: true, materialKind: 'profile-fit',
      }));
      sec = buildProfileFitSection('benyehuda', rows);
    } else {
      sec = buildColdStartSection(v, excludeIds); // profile-free on-ramp, still distinct from the catalog
    }
    host.replaceChildren(...(sec ? [sec] : []));
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
  } catch (_) {}
}
// B7 owner diagnostic, triggered by ?validate=1 on the device that holds the profile.
// It reports only aggregate contract states and exact counts; no learner keys, content,
// threshold bands, or comprehension claims leave the device.
async function runRealProfileValidation() {
  let R = '';
  try {
    const Room = window.CorpusVocabRoom;
    if (!learningCompass || !Room) { showValidationOverlay('Learning Compass не готов — открой ещё раз library.html?validate=1'); return; }
    const vocab = await Room.ensure();
    if (!vocab || !vocab.works) { showValidationOverlay('vocab-сайдкар не загрузился'); return; }
    const projection = await ensureLearningCompassProjection(true);
    if (!projection) { showValidationOverlay('Профиль недоступен: это UNAVAILABLE, а не 0%.'); return; }
    const statuses = {}, totals = { works: 0, familiar: 0, denominator: 0, unresolved: 0, rankEligible: 0 };
    for (const id of Object.keys(vocab.works)) {
      const w = vocab.works[id]; if (!w) continue;
      const fit = recordedFitForBen(w, vocab, projection, id);
      if (!fit) continue;
      statuses[fit.status] = (statuses[fit.status] || 0) + 1;
      totals.works += 1;
      if (fit.rank_eligible) totals.rankEligible += 1;
      if (fit.counts) {
        totals.familiar += Number(fit.counts.familiar) || 0;
        totals.denominator += Number(fit.counts.eligible_denominator) || 0;
        totals.unresolved += Number(fit.counts.unresolved) || 0;
      }
    }
    const calibration = learningCompass.calibrationState(readCalibrationLedger());
    R += '=== B7 Learning Compass 2.0 local aggregate ===\n';
    R += 'schema=' + learningCompass.COVERAGE_SCHEMA + ' · resolver=' + learningCompass.RESOLVER_VERSION + '\n';
    R += 'profile version=' + String(projection.version || 'unknown') + ' · tracked lexemes=' + Number(projection.tracked_lexeme_count || 0) + '\n';
    R += 'works=' + totals.works + ' · statuses=' + (Object.keys(statuses).sort().map((s) => s + '=' + statuses[s]).join(' ') || 'none') + '\n';
    R += 'rank eligible=' + totals.rankEligible + ' · aggregate familiar/denominator=' + totals.familiar + '/' + totals.denominator + ' · unresolved=' + totals.unresolved + '\n';
    R += 'reading calibration=' + calibration.status + ' · observations=' + calibration.observation_count + ' · revisions=' + calibration.revision_count + ' · tokens=' + calibration.token_count + '\n';
    R += 'No comprehension/readiness threshold is inferred from these counts.\n';
    showValidationOverlay(R);
  } catch (e) { showValidationOverlay('ошибка валидации: ' + (e && e.message || e) + '\n' + R); }
}
function showValidationOverlay(text) {
  const ov = el('div', { attrs: { style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;' } });
  const box = el('div', { attrs: { style: 'background:var(--bg-card,#fff);color:var(--text-primary,#111);max-width:560px;width:100%;border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.3);' } });
  box.appendChild(el('div', { attrs: { style: 'font-weight:700;margin-bottom:8px;' }, text: 'B7 · локальная агрегатная проверка' }));
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
// W4 — the OPEN reader knows the work by text_key (64-hex content hash), but the vocab sidecar is keyed
// by the small catalog id. Memoized text_key→ready-card map so refreshCovChip can resolve the card (and
// thus its catalog id) on every repaint without an O(ready) scan. Same session-stable lifecycle as corpusReadyMap.
function corpusReadyKeyMap() {
  if (corpusReadyByKey) return corpusReadyByKey;
  corpusReadyByKey = new Map();
  for (const c of ((corpusIndex && corpusIndex.ready) || [])) if (c.text_key != null) corpusReadyByKey.set(String(c.text_key), c);
  return corpusReadyByKey;
}
function corpusFilterActive() { const f = corpusFilter; return !!(String(f.q || '').trim() || f.genre || f.lang || f.readyOnly || f.readableOnly || f.hasAudio || f.reviewed || f.scopeAuthor || f.scopeAuthorQid || f.scopeEra || f.smart); }
// BRR Epic-6 — scoped-search by author: match by QID when we have one (catches every name-variant /
// co-authored work of that author, the L2-collapse payoff), else fall back to the exact author string.
function corpusScopeAuthorPass(sr, f) {
  if (f.scopeAuthorQid) return sr && sr.q === f.scopeAuthorQid;
  if (f.scopeAuthor) return (sr && sr.a || '') === f.scopeAuthor;
  return true;
}
// BRR-S16 — provenance filters (audio / human-reviewed) are properties of the READY card (corpus-search
// rows don't carry them), so they imply materialized works: a non-ready row has no card → excluded honestly.
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
  const f = corpusFilter;
  const pq = corpusPersonalQuery(f.q);          // #tag tokens ride the SAME query line (uniform contract)
  const q = corpusNrm(pq.textQ);
  const readyMap = corpusReadyMap();
  const ps = _personalSets;                     // renderResultsInto awaits ensurePersonalSets() when needed
  const keyOf = (row) => { const c = readyMap.get(String(row.id)); return c ? String(c.text_key || '') : ''; };
  return rows.filter((row) => {
    if (f.readyOnly && !row.r) return false;
    if (f.readableOnly && _readableSet && !_readableSet.has(String(row.id))) return false;   // B7 — valid exact profile count only
    if (!corpusScopeAuthorPass(row, f)) return false;                                        // S11 — scoped to one author (by QID when available)
    if (f.scopeEra && row.e !== f.scopeEra) return false;                                    // S11 — scoped to one period
    if (f.genre && row.g !== f.genre) return false;
    if (f.lang && row.l !== f.lang) return false;
    if ((f.hasAudio || f.reviewed) && !corpusAdvOk(row, readyMap)) return false;             // S16 — provenance
    // uniform PERSONAL dimensions (materialized works only — honest device scope)
    if (f.smart) {
      if (!ps) return false;
      const key = keyOf(row);
      if (f.smart === 'recent') {
        const lo = key && ps.lastOpenedByKey.get(key);
        if (!lo || Date.parse(lo) < Date.now() - 7 * 24 * 3600 * 1000) return false;
      } else {
        const lid = key && ps.idByKey.get(key);
        if (!lid || !(ps.smart[f.smart] && ps.smart[f.smart].has(lid))) return false;
      }
    }
    if (pq.tags.length) {
      if (!ps) return false;
      const key = keyOf(row);
      const mine = ((key && ps.tagsByKey.get(key)) || []).map((x) => x.toLowerCase());
      if (!pq.tags.every((t2) => mine.includes(t2.toLowerCase()))) return false;   // ALL semantics (uniform default)
    }
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
  if (f.readableOnly) parts.push(tt('room.corpus.facets.readable', 'С валидным профилем слов'));
  if (f.hasAudio) parts.push(tt('room.corpus.facets.hasAudio', 'С аудио'));
  if (f.reviewed) parts.push(tt('room.corpus.facets.reviewed', 'Проверено'));
  if (f.smart) { const c = CORPUS_SMART_CHIPS.find((x) => x[0] === f.smart); if (c) parts.push(tt(c[1], c[2])); }
  for (const tg of corpusPersonalQuery(f.q).tags) parts.push('#' + tg);
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
const ROOM_STATE_PRESENTATION = Object.freeze({
  'room.state.loading': { kind: 'info', symbol: 'lp-icon-loading', fallback: '⏳', spin: true },
  'room.home.loading': { kind: 'info', symbol: 'lp-icon-loading', fallback: '⏳', spin: true },
  'room.state.publishing': { kind: 'info', symbol: 'lp-icon-loading', fallback: '📥', spin: true },
  'room.state.dbBusy': { kind: 'warning', symbol: 'lp-icon-warning', fallback: '📑' },
  'room.state.error': { kind: 'error', symbol: 'lp-icon-error', fallback: '⚠️' },
  'room.connection.offlinePartial': { kind: 'warning', symbol: 'lp-icon-offline', fallback: '↯' },
  'room.corpus.search.empty': { kind: 'neutral', symbol: 'lp-icon-search', fallback: '🔍' },
  'room.corpus.search.emptyReadable': { kind: 'info', symbol: 'lp-mark-room', fallback: '🌱' },
  'room.reader.empty': { kind: 'neutral', symbol: 'lp-icon-info', fallback: '📄' },
  'room.shelf.empty': { kind: 'neutral', symbol: 'lp-icon-info', fallback: '📚' },
  'room.shelf.emptyTrack': { kind: 'neutral', symbol: 'lp-icon-info', fallback: '📚' },
});
function stateBoxNode(i18nKey, icon) {
  const spec = ROOM_STATE_PRESENTATION[i18nKey] || { kind: 'neutral', symbol: 'lp-icon-info', fallback: icon || 'ⓘ' };
  const box = el('div', {
    class: 'room-state lp-state',
    attrs: { 'data-kind': spec.kind, role: spec.kind === 'error' ? 'alert' : 'status', 'aria-live': spec.kind === 'error' ? 'assertive' : 'polite' },
  });
  box.appendChild(roomIcon(spec.symbol, icon || spec.fallback, 'room-state-icon lp-state__icon' + (spec.spin ? ' lp-icon--spin' : '')));
  const body = el('div', { class: 'lp-state__body' });
  body.appendChild(el('span', { class: 'lp-state__title', i18n: i18nKey, text: tt(i18nKey) }));
  box.appendChild(body);
  return box;
}

// Navigate the drill; resets the incremental-reveal cursor + re-renders.
function corpusNavTo(level, era, author) {
  // era/author drills are Ben-Yehuda-native → a deep nav call implies that corpus; a plain
  // 'home' keeps the current corpus (the hub included — its home IS the L0 витрина).
  const corpus = (level && level !== 'home') ? 'benyehuda' : (corpusNav.corpus || 'hub');
  corpusNav = { corpus, level: level || 'home', era: era || null, author: author || null };
  corpusReveal = 0;
  roomPushPresentationState();
  renderCorpus();
}
// Multi-corpus (B+C «витрина + линза», BRR_MULTI_CORPUS_DESIGN_2026_07_02.md): lateral switch.
function corpusNavToCorpus(id) {
  corpusNav = { corpus: id, level: 'home', era: null, author: null };
  corpusReveal = 0;
  roomPushPresentationState();
  renderCorpus();
  // A corpus entry is often activated after the Learning Home has scrolled it into view.
  // The new surface is a new place, not a continuation of that old scroll coordinate.
  try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) { try { window.scrollTo(0, 0); } catch (_) {} }
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
// navigation with a render token. Multi-corpus: 'hub' = the L0 corpora showcase; 'mytexts' =
// the user's own-texts corpus (LocalDb-backed); default drill = Ben-Yehuda (baked catalog).
async function renderCorpus() {
  const main = $('roomContent');
  if (!main) return;
  const token = ++corpusRenderToken;
  if (corpusNav.corpus === 'hub') return renderCorpusHub(token);
  if (corpusNav.corpus === 'mytexts') return renderMyTextsCorpus(token);
  if (String(corpusNav.corpus || '').startsWith('group:')) return renderGroupCorpus(String(corpusNav.corpus).slice(6), token);
  if (!corpusRoot) { showState('room.shelf.emptyTrack', '📚'); return; }
  if (!corpusIndex) {
    showState('room.state.loading', '⏳');
    try { await loadCorpusIndex(); } catch (e) { if (token === corpusRenderToken) showState('room.state.error', '⚠️'); return; }
    if (token !== corpusRenderToken) return;
  }
  if (corpusNav.level === 'authors') return renderCorpusAuthors(corpusNav.era, token);
  if (corpusNav.level === 'works') {
    if (typeof corpusNav.author === 'string') {
      const candidate = collapseEraAuthors(corpusNav.era).find((item) => String(item.qid || '') === corpusNav.author);
      if (!candidate) {
        corpusNav = { corpus: 'benyehuda', level: 'authors', era: corpusNav.era, author: null };
        roomToast(tt('room.history.parentFallback', 'Точное место больше недоступно — открыт ближайший раздел'));
        return renderCorpusAuthors(corpusNav.era, token);
      }
      corpusNav.author = candidate;
    }
    return renderCorpusWorks(corpusNav.era, corpusNav.author, token);
  }
  if (corpusNav.level === 'concordance') return renderConcordance(token);   // BRR-S8
  return renderCorpusHome(token);
}

async function paintGroupProfileFit(host, token, corpusId, catalog, heroWorkId, byKey, renderRow) {
  if (!host || token !== corpusRenderToken) return;
  let groupIndex;
  try { groupIndex = await ensureGroupLearningIndex(corpusId, catalog); }
  catch (_) { return; }
  if (token !== corpusRenderToken) return;
  const excludeIds = new Set(heroWorkId == null ? [] : [String(heroWorkId)]);
  const rows = (catalog.works || []).filter((work) => {
    if (!work || excludeIds.has(String(work.work_id))) return false;
    const progress = byKey.get(String(work.text_key));
    const fit = groupIndex && groupIndex.fits && groupIndex.fits.get(String(work.work_id));
    return !(progress && progress.finished_at) && fit && fit.status === 'AVAILABLE' && fit.rank_eligible;
  }).sort((a, b) => {
    const af = groupIndex.fits.get(String(a.work_id));
    const bf = groupIndex.fits.get(String(b.work_id));
    const delta = Number(bf.recorded_familiar_pct_lower_bound || 0) - Number(af.recorded_familiar_pct_lower_bound || 0);
    return delta || (Number(a.position_no) || 9999) - (Number(b.position_no) || 9999);
  }).slice(0, ROOM_PROFILE_FIT_PREVIEW).map(renderRow);
  const section = buildProfileFitSection('group-' + corpusId, rows);
  if (section) host.replaceChildren(section);
}

async function renderGroupCorpus(corpusId, token) {
  const main = $('roomContent'); if (!main || token !== corpusRenderToken) return;
  showState('room.state.loading', '⏳');
  let catalog;
  try { catalog = await ensureGroupCatalog(corpusId); }
  catch (_) {
    if (token === corpusRenderToken) {
      if (!navigator.onLine) {
        setRoomConnectionState('offline-partial');
        showState('room.connection.offlinePartial', '↯');
      } else showState('room.state.error', '⚠️');
    }
    return;
  }
  if (token !== corpusRenderToken) return;
  main.innerHTML = '';
  const wrap = el('div', { class: 'corpus-nav group-corpus' });
  const descriptor = authorizedCorpusById('group:' + corpusId) || {
    id: 'group:' + corpusId, icon: '♪', title: { key: '', fb: (catalog.corpus && catalog.corpus.title) || 'Учебные песни' },
    desc: { key: 'room.groupCorpus.hubDesc', fb: 'Закрытый учебный корпус вашей группы' },
  };
  wrap.appendChild(corpusSwitcherBar('group:' + corpusId));
  const groupRole = catalog.corpus && catalog.corpus.role === 'OWNER'
    ? tt('room.groupCorpus.owner', 'владелец') : tt('room.groupCorpus.member', 'участник');
  wrap.appendChild(corpusShellHeader(descriptor, {
    countText: catalog.works.length + ' ' + tt('room.hub.textsN', 'текст(ов)'),
    description: tt('room.groupCorpus.privateDesc', 'Закрытый учебный корпус вашей группы · доступ только участникам'),
    authority: '🔒 ' + tt('room.shell.membersOnly', 'Только участникам') + ' · ' + groupRole,
    capabilityText: tt('room.shell.groupCapabilities', 'Тексты и общее аудио группы · личный прогресс и заметки остаются вашими'),
  }));
  const management = corpusSecondaryDisclosure(
    catalog.corpus && catalog.corpus.role === 'OWNER' ? tt('room.shell.manageCorpus', 'Управление корпусом') : tt('room.groupAccess.open', 'Доступ к учебной группе'),
    catalog.corpus && catalog.corpus.role === 'OWNER'
      ? tt('room.shell.manageGroupNote', 'Участники, приглашения и резервные копии — отдельно от учебной полки.')
      : tt('room.shell.memberPrivacy', 'Ваш прогресс, память слов и личные заметки не видны другим участникам.'),
  );
  if (catalog.corpus && catalog.corpus.role === 'OWNER') {
    const admin=el('div',{class:'group-corpus-admin',attrs:{'aria-label':tt('room.groupCorpus.backupTools','Резервная копия корпуса')}});
    const download=(kind)=>{const a=document.createElement('a');a.href='/api/group-corpora/'+encodeURIComponent(corpusId)+'/export/'+kind;a.download='';document.body.appendChild(a);a.click();a.remove();};
    const adminBtn=(label,fn)=>{const b=el('button',{class:'group-admin-action',attrs:{type:'button'},text:label});b.addEventListener('click',fn);return b;};
    admin.appendChild(adminBtn('👥 '+tt('room.groupAccess.manage','Участники и приглашения'),()=>openGroupAccess(corpusId)));
    admin.appendChild(adminBtn('📤 '+tt('room.groupCorpus.exportJson','Экспорт JSON'),()=>download('catalog')));
    admin.appendChild(adminBtn('📤 '+tt('room.groupCorpus.exportZip','Экспорт ZIP (с аудио)'),()=>download('backup')));
    const fileInput=el('input',{attrs:{type:'file',hidden:'',accept:'.json,.zip,application/json,application/zip'}});
    const choose=(kind)=>{fileInput.value='';fileInput.dataset.kind=kind;fileInput.accept=kind==='catalog'?'.json,application/json':'.zip,application/zip';fileInput.click();};
    admin.appendChild(adminBtn('📥 '+tt('room.groupCorpus.importJson','Импорт JSON'),()=>choose('catalog')));
    admin.appendChild(adminBtn('📥 '+tt('room.groupCorpus.importZip','Импорт ZIP (с аудио)'),()=>choose('backup')));
    fileInput.addEventListener('change',async()=>{const file=fileInput.files&&fileInput.files[0];if(!file)return;
      if(!confirm(tt('room.groupCorpus.importConfirm','Импортировать выбранную резервную копию в этот серверный корпус? Личный прогресс участников не изменится.')))return;
      const kind=fileInput.dataset.kind;try{let body,headers={};if(kind==='catalog'){body=await file.text();headers['Content-Type']='application/json';}else{body=await file.arrayBuffer();headers['Content-Type']='application/zip';}
        try { headers['X-LP-CSRF']=localStorage.getItem('cloud.csrf')||''; } catch (_) {}
        const res=await fetch('/api/group-corpora/'+encodeURIComponent(corpusId)+'/import/'+kind,{method:'POST',headers,body});const j=await res.json().catch(()=>({}));if(!res.ok)throw new Error(j.error||('HTTP '+res.status));
        groupCatalogs.delete(corpusId);roomToast(tt('room.groupCorpus.importDone','Импорт завершён и проверен'));renderCorpus();
      }catch(e){roomToast(tt('room.groupCorpus.importFailed','Импорт не выполнен')+': '+String(e&&e.message||e));}});
    admin.appendChild(fileInput); management.__panel.appendChild(admin);
  } else {
    const access=el('div',{class:'group-corpus-admin'});
    access.appendChild(groupAccessActionButton('ⓘ '+tt('room.groupAccess.open','Доступ к учебной группе'),()=>openGroupAccess(corpusId)));
    management.__panel.appendChild(access);
  }
  let state = groupCorpusStates.get(corpusId);
  if (!state) { state = { q:'', status:'all', audio:'all', sort:'position', tags:[], smart:'' }; groupCorpusStates.set(corpusId, state); }
  let local = [];
  try {
    local = await localDb.dbQuery(`SELECT t.id,t.text_key,t.last_opened_at,t.created_at,t.updated_at,
      tp.last_row_idx,tp.finished_at,(SELECT COUNT(*) FROM sentences s WHERE s.text_id=t.id) AS n_rows
      FROM texts t LEFT JOIN text_progress tp ON tp.text_id=t.id WHERE t.is_archived=0`);
  } catch (_) { local = []; }
  let personal=null; try { personal=await ensurePersonalSets(); } catch (_) {}
  if (token !== corpusRenderToken) return;
  const byKey = new Map((local || []).filter((r) => r && r.text_key).map((r) => [String(r.text_key), r]));
  const workStatus=(p)=>p && p.finished_at ? 'finished' : (p && Number(p.last_row_idx)>0 ? 'reading' : 'new');
  const workAudio=(w)=>Number(w.audio_count)<=0?'none':(Number(w.audio_count)>=Number(w.rows_count)&&Number(w.rows_count)>0?'full':'partial');
  const progressPct=(w,p)=>p&&Number(p.last_row_idx)>0&&Number(w.rows_count)>0?Math.min(100,Math.round((Number(p.last_row_idx)+1)*100/Number(w.rows_count))):0;
  const nextWork = catalog.works.find((work) => workStatus(byKey.get(String(work.text_key))) === 'reading') || catalog.works[0];
  if (nextWork) {
    const nextProgress = byKey.get(String(nextWork.text_key));
    const nextView = adaptGroupCorpusItem(nextWork, { corpusId, progress: nextProgress, copy: corpusItemCopy() });
    wrap.appendChild(corpusNextAction({
      kind: nextView.primaryAction, title: nextView.title,
      kicker: nextView.primaryAction === 'continue' ? tt('room.home.continueKicker', 'Продолжить') : tt('room.home.startKicker', 'С чего начать'),
      meta: [nextView.creator, nextView.learnerState.resumeLabel || nextView.readiness.reason].filter(Boolean).join(' · '),
      label: nextView.primaryAction === 'continue' ? tt('room.resume.continue', 'Продолжить') : tt('room.home.startAction', 'Начать читать'),
      onOpen: () => openGroupCorpusWork(corpusId, nextWork, { resume: nextView.learnerState.state === 'reading' }),
    }));
  }
  const groupProfileFitHost = el('div', { class: 'corpus-profile-fit-host group-profile-fit-host' });
  wrap.appendChild(groupProfileFitHost);
  const groupCatalogRegion = corpusCatalogRegion('group-' + corpusId);
  const controls = el('div', { class: 'group-corpus-controls' });
  const searchField = el('label', { class: 'room-field room-field-wide group-corpus-search-field', attrs: { for: 'roomGroupCorpusSearch' } });
  searchField.appendChild(el('span', { class: 'room-field-label', text: tt('room.corpus.search.placeholder', 'Поиск') }));
  const search = el('input', { class: 'corpus-search-input group-corpus-search', attrs: { id:'roomGroupCorpusSearch', name:'room-group-corpus-search', type:'search',
    placeholder:tt('room.groupCorpus.search','Поиск: название, исполнитель или тег'),
    'aria-label':tt('room.groupCorpus.search','Поиск: название, исполнитель или тег') } });
  search.value = state.q; searchField.appendChild(search);
  let filterChrome = null;
  const mkSelect = (id, items, value, label, onChange) => {
    const field=el('label',{class:'room-field',attrs:{for:id}});
    field.appendChild(el('span',{class:'room-field-label',text:label}));
    const s = el('select', { class:'mytexts-select', attrs:{ id, name:id, 'aria-label':label } });
    for (const [v, txt] of items) { const o=document.createElement('option'); o.value=v; o.textContent=txt; s.appendChild(o); }
    s.value=value; s.addEventListener('change',async()=>{try{await onChange(s.value,s);}finally{if(filterChrome)filterChrome.refresh();}}); field.appendChild(s); return field;
  };
  controls.appendChild(mkSelect('roomGroupStatus',[
    ['all',tt('room.groupCorpus.statusAll','Все статусы')],['new',tt('room.groupCorpus.statusNew','Не начаты')],
    ['reading',tt('room.groupCorpus.statusReading','Читаю')],['finished',tt('room.groupCorpus.statusFinished','Прочитаны')],
  ],state.status,tt('room.groupCorpus.statusLabel','Статус'),(v)=>{state.status=v;paint();}));
  controls.appendChild(mkSelect('roomGroupAudio',[
    ['all',tt('room.groupCorpus.audioAll','Любое аудио')],['full',tt('room.groupCorpus.audioFull','Озвучено полностью')],
    ['partial',tt('room.groupCorpus.audioPartial','Озвучено частично')],['none',tt('room.groupCorpus.audioNone','Без аудио')],
  ],state.audio,tt('room.groupCorpus.audioLabel','Аудио'),(v)=>{state.audio=v;paint();}));
  const sortField = mkSelect('roomGroupSort',[
    ['position',tt('room.groupCorpus.sortPosition','Порядок библиотеки')],['recent',tt('room.groupCorpus.sortRecent','Последние открытые')],
    ['progress',tt('room.groupCorpus.sortProgress','По прогрессу')],['title',tt('room.groupCorpus.sortTitle','Название А–Я')],
    ['familiar_desc',tt('room.compass.sortFamiliar','Сначала достоверно знакомые')],
  ],state.sort,tt('room.corpus.sort.label','Сортировка'),async(v,select)=>{
    if(v==='familiar_desc'&&!await familiaritySortProfileAvailable()){select.value=state.sort;return;}
    if(v==='familiar_desc'){
      try {
        const ready=await ensureGroupLearningIndex(corpusId,catalog);
        if(!reliableFamiliarityCount(ready&&ready.fits&&ready.fits.values())){select.value=state.sort;explainNoReliableFamiliaritySort();return;}
      } catch(_){select.value=state.sort;roomToast(tt('room.compass.corpusUnavailable','Подбор по знакомости временно недоступен'));return;}
    }
    state.sort=v;paint();
  });
  const smartRail=el('div',{class:'corpus-sort mytexts-smart group-corpus-smart',attrs:{title:tt('room.corpus.personalHint','Фильтры по вашей активности — работы, открытые на этом устройстве')}});
  const SMART=[
    ['recent','room.mytexts.smartRecent','⏱ Недавние'],['struggling','room.mytexts.smartStruggling','🔥 Сложные'],
    ['mastered','room.mytexts.smartMastered','✓ Освоено'],['fresh','room.mytexts.smartNew','✨ Новые'],
    ['with-note','room.mytexts.smartWithNote','📝 С заметкой'],['audio-noted','room.mytexts.smartAudio','📍 Audio-noted'],
    ['srs-noted','room.mytexts.smartSrs','🎯 SRS-noted'],['templated','room.mytexts.smartTemplated','⭐ Templated'],
  ];
  const renderSmart=()=>{smartRail.textContent='';for(const [key,i18nKey,fb] of SMART){const active=state.smart===key,b=el('button',{class:'corpus-sort-btn'+(active?' on':''),attrs:{type:'button','aria-pressed':String(active),'data-smart':key},text:tt(i18nKey,fb)});b.addEventListener('click',()=>{state.smart=active?'':key;renderSmart();paint();if(filterChrome)filterChrome.refresh();});smartRail.appendChild(b);}};
  renderSmart(); controls.appendChild(smartRail);
  const tagCounts = new Map();
  for (const w of catalog.works) for (const tag of (w.tags || [])) tagCounts.set(String(tag),(tagCounts.get(String(tag))||0)+1);
  const tagRail = el('div',{class:'corpus-sort group-corpus-tags'});
  for (const [tag,count] of Array.from(tagCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,12)) {
    const active=state.tags.includes(tag); const b=el('button',{class:'corpus-sort-btn'+(active?' on':''),attrs:{type:'button','aria-pressed':String(active)}});
    b.textContent='#'+tag+' · '+count; b.addEventListener('click',()=>{state.tags=active?state.tags.filter((x)=>x!==tag):state.tags.concat(tag);renderTags();paint();if(filterChrome)filterChrome.refresh();}); tagRail.appendChild(b);
  }
  const renderTags=()=>{ const fresh=tagRail.cloneNode(false); for (const [tag,count] of Array.from(tagCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,12)) { const active=state.tags.includes(tag); const b=el('button',{class:'corpus-sort-btn'+(active?' on':''),attrs:{type:'button','aria-pressed':String(active)}}); b.textContent='#'+tag+' · '+count; b.addEventListener('click',()=>{state.tags=active?state.tags.filter((x)=>x!==tag):state.tags.concat(tag);renderTags();paint();if(filterChrome)filterChrome.refresh();}); fresh.appendChild(b); } tagRail.replaceChildren(...fresh.childNodes); };
  if (tagCounts.size) controls.appendChild(tagRail);
  filterChrome = corpusFilterChrome('roomGroupCorpus', searchField, controls, sortField, () => {
    const selectedText=(id)=>{const select=controls.querySelector('#'+id);return select&&select.selectedOptions&&select.selectedOptions[0]?select.selectedOptions[0].textContent:'';};
    const labels=[]; if(state.status!=='all')labels.push(selectedText('roomGroupStatus')||state.status);
    if(state.audio!=='all')labels.push(selectedText('roomGroupAudio')||state.audio);
    if(state.smart)labels.push((SMART.find((item)=>item[0]===state.smart)||[])[2]||state.smart);
    for(const tag of state.tags)labels.push('#'+tag);
    return {count:(state.status!=='all'?1:0)+(state.audio!=='all'?1:0)+(state.smart?1:0)+state.tags.length,labels};
  });
  groupCatalogRegion.appendChild(filterChrome.node);
  groupCatalogRegion.appendChild(corpusLearningIndexStatusNode('group:' + corpusId, catalog.works.length));
  const listSection = el('section', { class: 'room-primary-list group-corpus-list-section' });
  const listHead = el('div', { class: 'corpus-list-head' });
  listHead.appendChild(el('h2', { class: 'corpus-list-count', text: tt('room.corpus.sectionMaterials', 'Учебные материалы') }));
  listSection.appendChild(listHead);
  const resultLine=el('div',{class:'group-corpus-results room-browse-summary'}); listSection.appendChild(resultLine);
  const grid = el('div', { class: 'group-corpus-grid corpus-work-list' }); listSection.appendChild(grid);
  const moreWrap=el('div',{class:'corpus-more group-corpus-more'});listSection.appendChild(moreWrap);
  attachRoomLongListDisclosure(listSection, listHead, [resultLine, grid, moreWrap], 'group:' + corpusId + ':materials');
  groupCatalogRegion.appendChild(listSection);
  wrap.appendChild(groupCatalogRegion);wrap.appendChild(management);main.appendChild(wrap);
  function shareWork(work) {
    const u=new URL(location.href); u.search=''; u.hash=''; u.searchParams.set('group_corpus',corpusId); u.searchParams.set('group_work',work.work_id);
    const data={title:work.title||'',text:tt('room.groupCorpus.shareText','Текст из закрытого учебного корпуса'),url:u.toString()};
    if (navigator.share) navigator.share(data).catch(()=>{});
    else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data.url).then(()=>roomToast(tt('room.groupCorpus.linkCopied','Защищённая ссылка скопирована'))).catch(()=>roomToast(data.url));
    else roomToast(data.url);
  }
  function renderCard(work) {
    const p=byKey.get(String(work.text_key));
    const descriptor=groupCompassDescriptor(corpusId,work,p);
    const assertedAudioKind = work.audio_kind === 'tts' || work.audio_kind === 'human' ? work.audio_kind : null;
    const makeView=()=>adaptGroupCorpusItem(work,{
      corpusId,progress:p,copy:corpusItemCopy(),humanOrTts:assertedAudioKind,
      audioProvenance: assertedAudioKind ? {type:'asserted',source:'group-corpus-catalog',revision:work.audio_revision||null} : {type:'unknown'},
      catalogRevision:work.bundle_sha256||null,
      ...learningCompassContext(descriptor&&descriptor.cache_key,{continue_reading:p&&Number(p.last_row_idx)>0,group_assignment:true,asserted_level:!!work.level,audio_or_length:Number(work.audio_count)>0}),
    });
    let view=makeView();
    const card=el('article',{class:'group-work-card room-text-row room-material-row',attrs:{'data-material-kind':'study','data-status':view.learnerState.state,'data-state':view.learnerState.state,'data-continuity-key':continuityKey('group:' + corpusId,work.work_id)}});
    const pos=el('span',{class:'group-work-position',text:work.position_no==null?'—':String(work.position_no),attrs:{title:view.secondaryIdentity||''}}); card.appendChild(pos);
    const identity=el('div',{class:'group-work-identity corpus-work-col'});
    const href='/library.html?group_corpus='+encodeURIComponent(corpusId)+'&group_work='+encodeURIComponent(work.work_id);
    const open=el('a',{class:'room-text-title-link group-action'+(view.primaryAction==='continue'?' primary':''),attrs:{href,'data-continuity-action':'open'}});
    const titleCopy=el('span',{class:'room-item-title-copy'});
    const title=el('span',{class:'group-work-title',text:view.title});
    if(HEBREW_RE.test(view.title))title.setAttribute('dir','rtl');titleCopy.appendChild(title);
    if(view.creator&&!String(view.title).startsWith(view.creator)){const artist=el('span',{class:'group-work-artist item-secondary-identity',text:view.creator});if(HEBREW_RE.test(view.creator))artist.setAttribute('dir','rtl');titleCopy.appendChild(artist);}
    open.appendChild(titleCopy);
    open.appendChild(el('span',{class:'room-text-primary',text:view.primaryAction==='continue'?tt('room.resume.continue','Продолжить'):tt('room.mytexts.read','Читать')}));
    open.addEventListener('click',(event)=>{event.preventDefault();openGroupCorpusWork(corpusId,work,{resume:view.learnerState.state==='reading'});});
    identity.appendChild(open);
    const compassRow=renderLearningCompass(view,{showMedia:true,showDetails:true});
    if(descriptor){compassRow.setAttribute('data-compass-key',descriptor.cache_key);compassRow.__compassRepaint=()=>{view=makeView();paintLearningCompass(compassRow,view,{showMedia:true,showDetails:true});};}
    identity.appendChild(compassRow);card.appendChild(identity);
    const share=el('button',{class:'group-action quiet room-text-secondary',attrs:{type:'button','aria-label':tt('room.groupCorpus.share','Поделиться'),title:tt('room.groupCorpus.share','Поделиться')},text:'🔗'});share.addEventListener('click',()=>shareWork(work));card.appendChild(share);return card;
  }
  let groupBrowseOffset=0,groupPaintSequence=0;
  async function paint(resetPage=true){
    const sequence=++groupPaintSequence;
    if(resetPage)groupBrowseOffset=0;
    const q=String(state.q||'').trim().toLocaleLowerCase(); let found=catalog.works.filter((w)=>{
      const p=byKey.get(String(w.text_key)); if(state.status!=='all'&&workStatus(p)!==state.status)return false;
      if(state.audio!=='all'&&workAudio(w)!==state.audio)return false;
      if(state.tags.length&&!state.tags.every((t)=>(w.tags||[]).map(String).includes(t)))return false;
      if(state.smart){const id=personal&&personal.idByKey.get(String(w.text_key));if(!id)return false;if(state.smart==='recent'){const opened=personal.lastOpenedByKey.get(String(w.text_key));if(!opened||Date.parse(opened)<Date.now()-7*24*3600*1000)return false;}else if(!(personal.smart[state.smart]&&personal.smart[state.smart].has(String(id))))return false;}
      if(!q)return true; return [w.title,w.artist,w.topic,w.level,(w.tags||[]).join(' '),w.position_no].join(' ').toLocaleLowerCase().includes(q);
    });
    const opened=(w)=>{const p=byKey.get(String(w.text_key));return Date.parse(p&&p.last_opened_at||'')||0;};
    const groupIndex = _groupLearningIndexes.get(corpusId);
    const familiarity = (work) => groupIndex && groupIndex.fits && groupIndex.fits.get(String(work.work_id));
    const familiarComparator = (a,b) => {
      const af=familiarity(a),bf=familiarity(b),ar=!!(af&&af.status==='AVAILABLE'&&af.rank_eligible),br=!!(bf&&bf.status==='AVAILABLE'&&bf.rank_eligible);
      if(ar!==br)return ar?-1:1;
      if(ar&&br){const delta=Number(bf.recorded_familiar_pct_lower_bound||0)-Number(af.recorded_familiar_pct_lower_bound||0);if(delta)return delta;}
      return (Number(a.position_no)||9999)-(Number(b.position_no)||9999);
    };
    found=found.slice().sort(state.sort==='familiar_desc'?familiarComparator:state.sort==='recent'?(a,b)=>opened(b)-opened(a):state.sort==='progress'?(a,b)=>progressPct(b,byKey.get(String(b.text_key)))-progressPct(a,byKey.get(String(a.text_key))):state.sort==='title'?(a,b)=>String(a.title||'').localeCompare(String(b.title||''),'he'):(a,b)=>(Number(a.position_no)||9999)-(Number(b.position_no)||9999));
    if(groupBrowseOffset>=found.length&&groupBrowseOffset>0)groupBrowseOffset=Math.max(0,Math.floor(Math.max(0,found.length-1)/ROOM_BROWSE_PAGE)*ROOM_BROWSE_PAGE);
    const shown=found.slice(groupBrowseOffset,groupBrowseOffset+ROOM_BROWSE_PAGE);
    await prepareLearningCompassPage(shown.map((work)=>groupCompassDescriptor(corpusId,work,byKey.get(String(work.text_key)))));
    if(sequence!==groupPaintSequence||token!==corpusRenderToken)return;
    grid.textContent='';for(const work of shown)grid.appendChild(renderCard(work));if(!found.length)grid.appendChild(el('div',{class:'mytexts-empty',text:tt('room.mytexts.empty','Ничего не найдено')}));
    const rangeStart=shown.length?groupBrowseOffset+1:0,rangeEnd=groupBrowseOffset+shown.length;
    resultLine.textContent=tt('room.groupCorpus.found','Найдено')+': '+rangeStart+'–'+rangeEnd+' / '+found.length;
    moreWrap.replaceChildren();
    if(groupBrowseOffset>0||groupBrowseOffset+ROOM_BROWSE_PAGE<found.length){
      const previous=el('button',{class:'corpus-more-btn',attrs:{type:'button'},text:tt('room.corpus.lists.previous','Назад')});previous.disabled=groupBrowseOffset<=0;previous.addEventListener('click',()=>{groupBrowseOffset=Math.max(0,groupBrowseOffset-ROOM_BROWSE_PAGE);paint(false).then(()=>grid.querySelector('a,button')?.focus());});
      const page=el('span',{class:'learning-journey-page-label',text:tt('room.corpus.lists.page','Страница {n}').replace('{n}',String(Math.floor(groupBrowseOffset/ROOM_BROWSE_PAGE)+1))});
      const next=el('button',{class:'corpus-more-btn',attrs:{type:'button'},text:tt('room.corpus.lists.next','Дальше')});next.disabled=groupBrowseOffset+ROOM_BROWSE_PAGE>=found.length;next.addEventListener('click',()=>{groupBrowseOffset+=ROOM_BROWSE_PAGE;paint(false).then(()=>grid.querySelector('a,button')?.focus());});
      moreWrap.appendChild(previous);moreWrap.appendChild(page);moreWrap.appendChild(next);
    }
  }
  let timer=null; search.addEventListener('input',()=>{state.q=search.value||'';if(timer)clearTimeout(timer);timer=setTimeout(paint,120);}); paint();
  ensureGroupLearningIndex(corpusId,catalog).then(()=>{
    if(token===corpusRenderToken){
      paint(false);
      paintGroupProfileFit(groupProfileFitHost, token, corpusId, catalog, nextWork && nextWork.work_id, byKey, renderCard);
    }
  }).catch(()=>{});
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

// ── Multi-corpus surface (owner-approved B+C: hub-витрина + switcher-линза) ─────────────────
function corpusTitleOf(c) { return tt(c.title.key, c.title.fb); }
function authorizedCorpusOptions() {
  const options = CORPORA.slice();
  for (const group of groupCorpora) {
    if (!group || group.corpus_id == null) continue;
    options.push({
      id: 'group:' + String(group.corpus_id), icon: '♪', kind: 'group-restricted',
      title: { key: '', fb: String(group.title || tt('room.home.groupAction', 'Учебный корпус')) },
      desc: { key: 'room.groupCorpus.hubDesc', fb: 'Закрытый учебный корпус вашей группы' },
      role: group.role || 'MEMBER',
    });
  }
  return options;
}
function authorizedCorpusById(id) {
  return authorizedCorpusOptions().find((corpus) => corpus.id === id) || null;
}
function corpusShellHeader(corpus, options) {
  const opts = options || {};
  const head = el('header', { class: 'corpus-shell-head' });
  const identity = el('div', { class: 'corpus-shell-identity' });
  const title = el('h2', { class: 'corpus-shell-title' });
  const iconSpec = roomCorpusIconSpec(corpus);
  title.appendChild(roomIcon(iconSpec.symbol, iconSpec.fallback, 'corpus-shell-icon'));
  const corpusTitle = corpusTitleOf(corpus);
  title.appendChild(markRoomTextLanguage(el('bdi', { text: corpusTitle }), corpusTitle));
  identity.appendChild(title);
  if (opts.countText) identity.appendChild(el('span', { class: 'corpus-shell-count', text: opts.countText }));
  head.appendChild(identity);
  const description = opts.description || (corpus.desc && tt(corpus.desc.key, corpus.desc.fb));
  if (description) head.appendChild(el('p', { class: 'corpus-shell-description', text: description }));
  const trust = el('div', { class: 'corpus-shell-trust' });
  if (opts.authority) trust.appendChild(el('span', { class: 'corpus-shell-authority', text: opts.authority }));
  const capabilityText = opts.capabilityText || (corpus.capabilities || []).map((key) => {
    const badge = CAPABILITY_BADGES[key];
    return badge ? badge.icon + ' ' + tt(badge.key, badge.fb) : '';
  }).filter(Boolean).join(' · ');
  if (capabilityText) {
    const disclosure = el('details', { class: 'corpus-capability-disclosure' });
    disclosure.appendChild(el('summary', { text: tt('room.shell.capabilities', 'Что доступно здесь') }));
    disclosure.appendChild(el('p', { text: capabilityText }));
    trust.appendChild(disclosure);
  }
  if (trust.children.length) head.appendChild(trust);
  return head;
}
function corpusSecondaryDisclosure(label, description) {
  const details = el('details', { class: 'corpus-management' });
  details.appendChild(el('summary', { text: label }));
  const panel = el('div', { class: 'corpus-management-panel' });
  if (description) panel.appendChild(el('p', { class: 'corpus-management-note', text: description }));
  details.appendChild(panel);
  details.__panel = panel;
  return details;
}
function corpusNextAction(options) {
  const opts = options || {};
  const feature = el('section', { class: 'corpus-next-action', attrs: { 'data-next-kind': opts.kind || 'start' } });
  const copy = el('div', { class: 'corpus-next-copy' });
  copy.appendChild(el('span', { class: 'corpus-next-kicker', text: opts.kicker || tt('room.shell.next', 'Следующий шаг') }));
  const title = el('h3', { class: 'corpus-next-title', text: opts.title || tt('room.home.untitled', 'Текст без названия') });
  if (HEBREW_RE.test(opts.title || '')) title.setAttribute('dir', 'rtl');
  copy.appendChild(title);
  if (opts.meta) copy.appendChild(el('p', { class: 'corpus-next-meta', text: opts.meta }));
  feature.appendChild(copy);
  const action = el(opts.href ? 'a' : 'button', { class: 'corpus-next-cta', attrs: opts.href ? { href: opts.href, 'data-focus-key': 'corpus-next-open' } : { type: 'button', 'data-focus-key': 'corpus-next-open' }, text: opts.label || tt('room.home.startAction', 'Начать читать') });
  if (opts.onOpen) action.addEventListener('click', (event) => {
    if (opts.href && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (opts.href) event.preventDefault();
    opts.onOpen();
  });
  feature.appendChild(action);
  return feature;
}
function corpusFilterChrome(id, searchField, filterPanel, sortField, stateReader) {
  const shell = el('section', { class: 'corpus-browse-tools', attrs: { 'aria-label': tt('room.shell.browse', 'Поиск и фильтры') } });
  const primary = el('div', { class: 'corpus-browse-primary' });
  primary.appendChild(searchField);
  const disclosure = el('details', { class: 'corpus-filter-disclosure', attrs: { id: id + 'Filters' } });
  disclosure.open = window.innerWidth > 760;
  const summary = el('summary', { class: 'corpus-filter-summary' });
  const panel = el('div', { class: 'corpus-filter-panel' });
  panel.appendChild(filterPanel);
  disclosure.appendChild(summary); disclosure.appendChild(panel);
  primary.appendChild(disclosure);
  if (sortField) { sortField.classList.add('corpus-browse-sort'); primary.appendChild(sortField); }
  shell.appendChild(primary);
  const active = el('div', { class: 'corpus-active-filters', attrs: { 'aria-live': 'polite' } });
  shell.appendChild(active);
  const refresh = () => {
    const state = (stateReader && stateReader()) || { count: 0, labels: [] };
    const count = Number(state.count) || 0;
    summary.textContent = tt('room.shell.filters', 'Фильтры') + (count ? ' · ' + count : '');
    summary.setAttribute('aria-label', tt('room.shell.filters', 'Фильтры') + (count ? ', ' + tt('room.corpus.facets.activeCount', 'активно') + ': ' + count : ''));
    active.textContent = '';
    for (const label of (state.labels || [])) active.appendChild(el('span', { class: 'corpus-active-chip', text: label }));
    active.hidden = !active.children.length;
  };
  refresh();
  return { node: shell, refresh, disclosure };
}
// Breadcrumb with the corpus switcher pill: «← | Библиотека ▸ ⟨🏛 Бен-Иегуда ▾⟩». The pill is
// the LEAF (the current corpus) and opens a lateral menu — no climb back to L0 needed (the C
// half of the hybrid). ← and «Библиотека» both go to the hub (the B half).
function corpusSwitcherBar(currentId) {
  const bar = el('div', { class: 'corpus-crumb corpus-switchbar' });
  const back = el('button', { class: 'corpus-back room-vf1-focus', attrs: { type: 'button', 'aria-label': tt('room.corpus.back', 'Назад') } });
  setRoomIcon(back, 'lp-icon-chevron-left', '←', 'room-icon-directional');
  back.addEventListener('click', () => corpusNavToCorpus('hub'));
  bar.appendChild(back);
  const trail = el('nav', { class: 'corpus-crumb-trail' });
  const lib = el('button', { class: 'corpus-crumb-part', attrs: { type: 'button' } });
  lib.textContent = tt('room.hub.crumb', 'Библиотека');
  lib.addEventListener('click', () => corpusNavToCorpus('hub'));
  trail.appendChild(lib);
  trail.appendChild(roomIcon('lp-icon-chevron-right', '▸', 'corpus-crumb-sep room-icon-directional'));
  const cur = authorizedCorpusById(currentId);
  const wrap = el('span', { class: 'corpus-switch' });
  const pill = el('button', { class: 'corpus-switch-pill room-vf1-focus', attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' } });
  const currentIcon = roomCorpusIconSpec(cur || { id: currentId, icon: '◇' });
  pill.appendChild(roomIcon(currentIcon.symbol, currentIcon.fallback));
  pill.appendChild(markRoomTextLanguage(el('bdi', { class: 'corpus-switch-label', text: cur ? corpusTitleOf(cur) : currentId }), cur ? corpusTitleOf(cur) : currentId));
  pill.appendChild(roomIcon('lp-icon-chevron-down', '▾', 'corpus-switch-chevron'));
  const menu = el('div', { class: 'corpus-switch-menu', attrs: { role: 'menu' } });
  menu.hidden = true;
  for (const c of authorizedCorpusOptions()) {
    const item = el('button', { class: 'corpus-switch-item room-vf1-focus' + (c.id === currentId ? ' on' : ''), attrs: { type: 'button', role: 'menuitem' } });
    const itemIcon = roomCorpusIconSpec(c);
    item.appendChild(roomIcon(itemIcon.symbol, itemIcon.fallback));
    item.appendChild(markRoomTextLanguage(el('bdi', { class: 'corpus-switch-label', text: corpusTitleOf(c) }), corpusTitleOf(c)));
    if (c.id === currentId) item.appendChild(roomIcon('lp-icon-success', '✓', 'corpus-switch-current'));
    item.addEventListener('click', () => { if (c.id !== currentId) corpusNavToCorpus(c.id); });
    menu.appendChild(item);
  }
  const close = () => { menu.hidden = true; pill.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', away, true); };
  const away = (e) => { if (!wrap.contains(e.target)) close(); };
  pill.addEventListener('click', () => {
    if (menu.hidden) { menu.hidden = false; pill.setAttribute('aria-expanded', 'true'); document.addEventListener('click', away, true); }
    else close();
  });
  pill.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wrap.appendChild(pill); wrap.appendChild(menu);
  trail.appendChild(wrap);
  bar.appendChild(trail);
  return bar;
}
// B2 — Learning Home is a read-only projection over the existing LocalDb progress ledger.
// Unlike getContinueReading (the canon-only shelf), L0 follows the learner across every locally
// materialized source: own, Ben-Yehuda and an authorized group work. No new store or writer.
async function getLearningHomeContinue() {
  try {
    const rows = await localDb.dbQuery(
      `SELECT t.id, t.text_key, t.title, t.source_meta_json, t.last_opened_at,
              tp.last_row_idx, tp.updated_at,
              (SELECT COUNT(*) FROM sentences s WHERE s.text_id = t.id) AS n_rows
         FROM text_progress tp JOIN texts t ON t.id = tp.text_id
        WHERE COALESCE(t.is_archived, 0) = 0
          AND tp.last_row_idx > 0 AND tp.finished_at IS NULL
        ORDER BY COALESCE(t.last_opened_at, tp.updated_at) DESC, tp.updated_at DESC
        LIMIT 20`, []);
    for (const row of (rows || [])) {
      let source = null; try { source = row.source_meta_json ? JSON.parse(row.source_meta_json) : null; } catch (_) { source = null; }
      const protectedId = source && source.group_corpus && source.group_corpus.corpus_id;
      // A previously materialized protected work is not a current entitlement. Surface it only
      // while the membership-filtered server catalog still authorizes that corpus.
      if (protectedId && !groupCorpora.some((item) => String(item.corpus_id || '') === String(protectedId))) continue;
      return row;
    }
    return null;
  } catch (_) { return null; }
}

async function getLearningHomeOwnCount() {
  try {
    return Math.max(0, Number(await localDb.countPersonalTextsExact()) || 0);
  } catch (_) { return null; }
}

function learningHomeSource(row) {
  let source = null;
  try { source = row && row.source_meta_json ? JSON.parse(row.source_meta_json) : null; } catch (_) { source = null; }
  if (source && source.group_corpus) {
    const id = String(source.group_corpus.corpus_id || '');
    const group = groupCorpora.find((item) => String(item.corpus_id || '') === id);
    return (group && group.title) || tt('room.home.groupSource', 'Учебный корпус');
  }
  if (source && source.corpus) return corpusTitleOf(corpusById('benyehuda'));
  return corpusTitleOf(corpusById('mytexts'));
}

function learningHomePlainClick(event, action) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

function learningHomeForwardArrow() { return document.documentElement.dir === 'rtl' ? '←' : '→'; }
function learningHomeBackArrow() { return document.documentElement.dir === 'rtl' ? '→' : '←'; }

function learningHomeFeature(continueRow, nextPicks) {
  const feature = el('article', { class: 'learning-home-feature' });
  if (continueRow) {
    feature.setAttribute('data-feature-kind', 'continue');
    feature.appendChild(el('div', { class: 'learning-home-kicker', text: tt('room.home.continueKicker', 'Продолжить') }));
    const title = String(continueRow.title || tt('room.home.untitled', 'Текст без названия'));
    const heading = markRoomTextLanguage(el('h2', { class: 'learning-home-feature-title', text: title }), title);
    feature.appendChild(heading);
    const total = Math.max(0, Number(continueRow.n_rows) || 0);
    const row = Math.max(0, Number(continueRow.last_row_idx) || 0);
    const pct = total > 0 ? Math.min(99, Math.max(1, Math.round((row + 1) / total * 100))) : null;
    const meta = el('p', { class: 'learning-home-feature-meta' });
    meta.textContent = learningHomeSource(continueRow) + ' · ' + (pct == null
      ? tt('room.resume.fromRow', 'Вы остановились на строке') + ' ' + (row + 1)
      : tt('room.resume.positionPercent', 'позиция · {value}%').replace('{value}', String(pct)));
    feature.appendChild(meta);
    if (pct != null) {
      feature.appendChild(el('div', { class: 'learning-home-progress', attrs: { role: 'meter', 'aria-label': tt('room.home.readingPosition', 'Позиция в тексте'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) } }));
      feature.lastChild.style.setProperty('--learning-progress', pct + '%');
    }
    const open = el('a', { class: 'learning-home-primary', attrs: { href: deepLinkForText(continueRow.id), 'data-focus-key': 'learning-home-feature-open' }, text: tt('room.home.continueAction', 'Продолжить чтение') + ' ' + learningHomeForwardArrow() });
    if (EMBED) open.addEventListener('click', (event) => learningHomePlainClick(event, () => openReader(continueRow.id, title, { resume: true })));
    feature.appendChild(open);
    return feature;
  }

  const pick = nextPicks && Array.isArray(nextPicks.picks) ? nextPicks.picks[0] : null;
  if (pick && pick.card) {
    feature.setAttribute('data-feature-kind', nextPicks.kind === 'coldstart' ? 'start' : 'recommended');
    const kicker = nextPicks.kind === 'challenge'
      ? tt('room.home.challengeKicker', 'Следующий вызов')
      : nextPicks.kind === 'coldstart'
        ? tt('room.home.startKicker', 'С чего начать')
        : tt('room.home.fitKicker', 'Подходит сейчас');
    feature.appendChild(el('div', { class: 'learning-home-kicker', text: kicker }));
    const title = String(pick.title || pick.card.title || tt('room.home.untitled', 'Текст без названия'));
    const heading = markRoomTextLanguage(el('h2', { class: 'learning-home-feature-title', text: title }), title);
    feature.appendChild(heading);
    if (pick.author || pick.card.author) {
      const author = String(pick.author || pick.card.author);
      feature.appendChild(markRoomTextLanguage(el('p', { class: 'learning-home-feature-author', text: author }), author));
    }
    const reason = Number.isFinite(Number(pick.familiar)) && Number(pick.denominator) > 0
      ? String(pick.familiar) + '/' + String(pick.denominator) + ' ' + tt('room.home.recordedFamiliarWords', 'зафиксировано знакомыми')
      : tt('room.home.coldReason', 'Хороший первый текст · частотная лексика');
    feature.appendChild(el('p', { class: 'learning-home-feature-meta', text: reason }));
    const open = el('a', { class: 'learning-home-primary', attrs: { href: deepLinkForCorpusWork(pick.card.id), 'data-focus-key': 'learning-home-feature-open' }, text: tt('room.home.startAction', 'Начать читать') + ' ' + learningHomeForwardArrow() });
    open.addEventListener('click', (event) => learningHomePlainClick(event, () => openCorpusWork(pick.card)));
    feature.appendChild(open);
    return feature;
  }

  // Data can be temporarily unavailable. The feature remains useful but explicitly stops
  // claiming personalization; it routes to the real catalog instead of inventing a fit score.
  feature.setAttribute('data-feature-kind', 'browse');
  feature.appendChild(el('div', { class: 'learning-home-kicker', text: tt('room.home.libraryKicker', 'Библиотека') }));
  feature.appendChild(el('h2', { class: 'learning-home-feature-title', text: tt('room.home.browseTitle', 'Выберите следующий текст') }));
  feature.appendChild(el('p', { class: 'learning-home-feature-meta', text: tt('room.home.browseReason', 'Каталог доступен; персональная оценка сейчас не рассчитана.') }));
  const browse = el('button', { class: 'learning-home-primary', attrs: { type: 'button', 'data-focus-key': 'learning-home-feature-open' }, text: tt('room.home.browseAction', 'Открыть каталог') + ' ' + learningHomeForwardArrow() });
  browse.addEventListener('click', () => corpusNavToCorpus('benyehuda'));
  feature.appendChild(browse);
  return feature;
}

function learningHomeToday(readyCards) {
  const section = el('section', { class: 'learning-home-today', attrs: { 'aria-labelledby': 'learningHomeTodayTitle' } });
  const head = el('div', { class: 'learning-home-section-head' });
  const title = el('h2', { class: 'learning-home-section-title', text: tt('room.home.todayTitle', 'Сегодня') });
  title.id = 'learningHomeTodayTitle'; head.appendChild(title);
  head.appendChild(el('p', { class: 'learning-home-section-note', text: tt('room.home.todayNote', 'Небольшой следующий шаг') }));
  section.appendChild(head);
  const actions = el('div', { class: 'learning-home-actions' });
  const dueNow = (_dueCounts && _dueCounts.dueNow) || 0;
  if (dueNow > 0) {
    const due = el('button', { class: 'learning-home-action room-vf1-focus', attrs: { type: 'button', 'data-learning-due': '', 'data-focus-key': 'room-due-review' } });
    due.appendChild(roomIcon('lp-icon-train', '↻', 'learning-home-action-icon'));
    const copy = el('span', { class: 'learning-home-action-copy' });
    copy.appendChild(el('span', { class: 'learning-home-action-title', text: tt('room.home.reviewAction', 'Повторить слова') }));
    const meta = el('span', { class: 'learning-home-action-meta' });
    meta.appendChild(el('span', { attrs: { 'data-learning-due-count': '' }, text: String(dueNow) }));
    meta.appendChild(document.createTextNode(' ' + tt('room.home.dueNow', 'готово к повторению')));
    copy.appendChild(meta); due.appendChild(copy);
    due.addEventListener('click', () => startDueReview());
    actions.appendChild(due);
  }
  const shortCard = (readyCards || []).filter((card) => Number.isFinite(Number(card.segments)) && Number(card.segments) > 0)
    .sort((a, b) => Number(a.segments) - Number(b.segments))[0];
  if (shortCard) {
    const short = el('a', { class: 'learning-home-action', attrs: { href: deepLinkForCorpusWork(shortCard.id) } });
    short.appendChild(el('span', { class: 'learning-home-action-icon', text: 'א', attrs: { 'aria-hidden': 'true' } }));
    const copy = el('span', { class: 'learning-home-action-copy' });
    copy.appendChild(el('span', { class: 'learning-home-action-title', text: tt('room.home.shortAction', 'Короткий текст') }));
    copy.appendChild(el('span', { class: 'learning-home-action-meta', text: Number(shortCard.segments) + ' ' + tt('room.home.rows', 'строк') }));
    short.appendChild(copy);
    short.addEventListener('click', (event) => learningHomePlainClick(event, () => openCorpusWork(shortCard)));
    actions.appendChild(short);
  }
  if (groupCorpora.length) {
    const group = groupCorpora[0];
    const assigned = el('button', { class: 'learning-home-action', attrs: { type: 'button' } });
    assigned.appendChild(roomIcon('lp-icon-audio', '♪', 'learning-home-action-icon'));
    const copy = el('span', { class: 'learning-home-action-copy' });
    copy.appendChild(el('span', { class: 'learning-home-action-title', text: String(group.title || tt('room.home.groupAction', 'Учебный корпус')) }));
    if (group.works_count != null && Number.isFinite(Number(group.works_count))) {
      copy.appendChild(el('span', { class: 'learning-home-action-meta', text: Number(group.works_count) + ' ' + tt('room.hub.textsN', 'текст(ов)') }));
    }
    assigned.appendChild(copy);
    assigned.addEventListener('click', () => corpusNavToCorpus('group:' + group.corpus_id));
    actions.appendChild(assigned);
  }
  section.appendChild(actions);
  return section;
}

function learningHomeCorpusEntry(corpus, countText) {
  const entry = el('button', { class: 'learning-corpus-entry room-vf1-focus room-vf1-lift', attrs: { type: 'button', 'data-corpus': corpus.id } });
  entry.appendChild(el('span', { class: 'learning-corpus-edge', attrs: { 'aria-hidden': 'true' } }));
  const iconSpec = roomCorpusIconSpec(corpus);
  entry.appendChild(roomIcon(iconSpec.symbol, iconSpec.fallback, 'learning-corpus-icon'));
  const copy = el('span', { class: 'learning-corpus-copy' });
  const title = corpus.title && corpus.title.key ? corpusTitleOf(corpus) : String(corpus.title && corpus.title.fb || '');
  const desc = corpus.desc && corpus.desc.key ? tt(corpus.desc.key, corpus.desc.fb) : String(corpus.desc && corpus.desc.fb || '');
  copy.appendChild(markRoomTextLanguage(el('bdi', { class: 'learning-corpus-title', text: title }), title));
  copy.appendChild(el('span', { class: 'learning-corpus-desc', text: desc }));
  entry.appendChild(copy);
  if (countText) entry.appendChild(el('span', { class: 'learning-corpus-count', text: countText }));
  entry.appendChild(roomIcon('lp-icon-chevron-right', '›', 'learning-corpus-arrow room-icon-directional'));
  entry.addEventListener('click', () => corpusNavToCorpus(corpus.id));
  return entry;
}

function readingJourneyAuthorizedGroupIds() {
  return groupCorpora.map((item) => String(item && item.corpus_id || '')).filter(Boolean);
}

// D1 typed work identity. This is a pure presentation adapter, never a store:
// passage bookmarks, finished state and notes keep their existing canonical writers.
function journeyWorkRef(row) {
  return Object.freeze({
    sourceKind: ['mytext', 'benyehuda', 'group'].includes(String(row && row.source_kind)) ? String(row.source_kind) : 'mytext',
    textKey: String(row && row.text_key || ''),
    sourceScope: String(row && row.source_scope || ''),
    sourceWorkId: String(row && row.source_work_id || ''),
    localTextId: String(row && row.id || ''),
  });
}

function journeySourceLabel(row) {
  const ref = journeyWorkRef(row);
  if (ref.sourceKind === 'group') {
    const group = groupCorpora.find((item) => String(item.corpus_id || '') === ref.sourceScope);
    return String(group && group.title || tt('room.home.groupSource', 'Учебный корпус'));
  }
  if (ref.sourceKind === 'benyehuda') return corpusTitleOf(corpusById('benyehuda'));
  return corpusTitleOf(corpusById('mytexts'));
}

function renderReadingJourneyItem(row) {
  const kind = String(row && row.journey_kind || '');
  const ref = journeyWorkRef(row);
  const button = el('button', {
    class: 'learning-journey-item room-material-row',
    attrs: {
      type: 'button',
      'data-journey-kind': kind,
      'data-work-source': ref.sourceKind,
      'data-work-key': ref.textKey,
    },
  });
  const copy = el('span', { class: 'learning-journey-item-copy' });
  const title = String(row && row.title || tt('room.home.untitled', 'Текст без названия'));
  const titleEl = markRoomTextLanguage(el('bdi', { class: 'learning-journey-item-title', text: title }), title);
  copy.appendChild(titleEl);
  const detail = kind === 'bookmark'
    ? tt('room.home.journeyBookmarkKind', 'Закладка в тексте')
    : kind === 'finished'
      ? tt('room.home.journeyFinishedKind', 'Отмечено как прочитанное')
      : tt('room.home.journeyNotesKind', 'Есть заметки') + (Number(row && row.note_count) > 0 ? ' · ' + Number(row.note_count) : '');
  copy.appendChild(el('span', { class: 'learning-journey-item-meta', text: journeySourceLabel(row) + ' · ' + detail }));
  if (kind === 'bookmark' && row && row.snippet) {
    const snippet = markRoomTextLanguage(el('bdi', { class: 'learning-journey-item-snippet', text: String(row.snippet) }), row.snippet);
    copy.appendChild(snippet);
  }
  button.appendChild(copy);
  button.appendChild(roomIcon('lp-icon-chevron-right', '›', 'learning-journey-item-arrow room-icon-directional'));
  button.addEventListener('click', () => {
    if (!ref.localTextId) return;
    const opts = kind === 'bookmark'
      ? { scrollToSentence: row.sentence_id || null, scrollToOrderIndex: row.order_index }
      : { resume: Number(row.last_row_idx) > 0 };
    openReader(ref.localTextId, title, opts);
  });
  return button;
}

// D4: one calm, lazy, bounded projection in the existing Learning Home. Buttons
// disclose canonical lists in place; viewing/filtering writes no learner state.
function learningHomeJourney(summary) {
  const section = el('section', { class: 'learning-home-journey', attrs: { 'aria-labelledby': 'learningHomeJourneyTitle' } });
  const head = el('div', { class: 'learning-home-section-head' });
  const title = el('h2', { class: 'learning-home-section-title', text: tt('room.home.journeyTitle', 'Сохранённое и завершённое') });
  title.id = 'learningHomeJourneyTitle'; head.appendChild(title); section.appendChild(head);
  section.appendChild(el('p', { class: 'learning-home-journey-boundary', text: tt('room.home.journeyDevice', 'Прогресс Бен-Иегуды и учебных корпусов хранится на этом устройстве. Мои тексты синхронизируются только при включённом согласии.') }));
  section.appendChild(el('p', { class: 'learning-home-journey-types', text: tt('room.home.journeyTypes', 'Закладка — место в тексте; «Читать позже» — отдельный список на этом устройстве.') }));

  const controls = el('div', { class: 'learning-home-journey-controls', attrs: { role: 'group', 'aria-label': tt('room.home.journeyViews', 'Представления вашего чтения') } });
  const panelId = 'learningHomeJourneyPanel';
  const panel = el('div', { class: 'learning-home-journey-panel', attrs: { id: panelId, role: 'region', 'aria-labelledby': 'learningHomeJourneyTitle' } });
  panel.hidden = true;
  let activeKind = '', activeSource = '', activeOffset = 0, activeButton = null, requestSeq = 0;
  const closePanel = (returnFocus) => {
    activeKind = ''; activeSource = ''; activeOffset = 0; panel.hidden = true; panel.innerHTML = ''; requestSeq += 1;
    for (const item of controls.querySelectorAll('.learning-home-journey-view')) { item.setAttribute('aria-expanded', 'false'); item.setAttribute('aria-pressed', 'false'); }
    if (returnFocus && activeButton && activeButton.isConnected) activeButton.focus();
    activeButton = null;
  };
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closePanel(true); } });
  const values = summary || { bookmarks: 0, finished: 0, notes: 0 };
  const specs = [
    ['bookmark', 'lp-icon-bookmark', '🔖', 'room.home.journeyBookmarks', 'Закладки', Number(values.bookmarks) || 0],
    ['finished', 'lp-icon-success', '✓', 'room.home.journeyFinished', 'Закончено', Number(values.finished) || 0],
    ['note', 'lp-icon-note', '✍', 'room.home.journeyNotes', 'С заметками', Number(values.notes) || 0],
  ];
  const sourceSpecs = [
    ['', 'room.home.journeySourceAll', 'Все источники'],
    ['mytext', 'room.home.journeySourceMy', 'Мои тексты'],
    ['benyehuda', 'room.home.journeySourceBen', 'Бен-Иегуда'],
    ['group', 'room.home.journeySourceStudy', 'Учебные корпуса'],
  ];
  const loadPanel = async (kind, sourceKind = '', offset = 0, focusAfter = '') => {
    activeKind = kind; activeSource = sourceKind; activeOffset = Math.max(0, Number(offset) || 0);
    panel.hidden = false; panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'learning-home-journey-loading', attrs: { role: 'status' }, text: tt('room.home.journeyLoading', 'Загружаем…') }));
    const seq = ++requestSeq;
    let result = { items: [], hasMore: false, hasPrevious: activeOffset > 0, offset: activeOffset };
    try {
      result = await localDb.listReadingJourneyItems(kind, {
        limit: ROOM_BROWSE_PAGE,
        offset: activeOffset,
        sourceKind: activeSource,
        authorizedGroupIds: readingJourneyAuthorizedGroupIds(),
      });
    } catch (_) {}
    if (seq !== requestSeq || !panel.isConnected || activeKind !== kind || activeSource !== sourceKind) return;
    activeOffset = Math.max(0, Number(result && result.offset) || 0);
    panel.innerHTML = '';
    const filters = el('div', { class: 'learning-journey-filters', attrs: { role: 'group', 'aria-label': tt('room.home.journeySourceFilters', 'Фильтр по источнику') } });
    for (const [source, key, fallback] of sourceSpecs) {
      const filter = el('button', {
        class: 'learning-journey-filter',
        attrs: { type: 'button', 'data-journey-source': source || 'all', 'aria-pressed': String(activeSource === source) },
        text: tt(key, fallback),
      });
      filter.addEventListener('click', () => loadPanel(kind, source, 0, 'filter'));
      filters.appendChild(filter);
    }
    panel.appendChild(filters);
    const items = Array.isArray(result && result.items) ? result.items : [];
    if (!items.length) panel.appendChild(el('p', { class: 'learning-home-journey-empty', text: tt('room.home.journeyEmpty', 'Здесь пока ничего нет.') }));
    else {
      const list = el('div', { class: 'learning-home-journey-list' });
      for (const row of items) list.appendChild(renderReadingJourneyItem(row));
      panel.appendChild(list);
    }
    if (result.hasPrevious || result.hasMore) {
      const pager = el('nav', { class: 'learning-journey-pager', attrs: { 'aria-label': tt('room.home.journeyPages', 'Страницы результатов') } });
      const previous = el('button', {
        class: 'learning-journey-page',
        attrs: result.hasPrevious ? { type: 'button' } : { type: 'button', disabled: '' },
        text: learningHomeBackArrow() + ' ' + tt('room.home.journeyPrevious', 'Назад'),
      });
      previous.addEventListener('click', () => loadPanel(kind, activeSource, Math.max(0, activeOffset - ROOM_BROWSE_PAGE), 'item'));
      const pageNumber = Math.floor(activeOffset / ROOM_BROWSE_PAGE) + 1;
      pager.appendChild(previous);
      pager.appendChild(el('span', { class: 'learning-journey-page-label', text: tt('room.home.journeyPage', 'Страница {n}').replace('{n}', String(pageNumber)) }));
      const next = el('button', {
        class: 'learning-journey-page',
        attrs: result.hasMore ? { type: 'button' } : { type: 'button', disabled: '' },
        text: tt('room.home.journeyNext', 'Дальше') + ' ' + learningHomeForwardArrow(),
      });
      next.addEventListener('click', () => loadPanel(kind, activeSource, activeOffset + ROOM_BROWSE_PAGE, 'item'));
      pager.appendChild(next); panel.appendChild(pager);
    }
    if (focusAfter === 'filter') panel.querySelector(`.learning-journey-filter[data-journey-source="${activeSource || 'all'}"]`)?.focus();
    else if (focusAfter === 'item') panel.querySelector('.learning-journey-item, .learning-home-journey-empty')?.focus();
  };
  for (const [kind, symbol, iconFallback, key, fallback, count] of specs) {
    const button = el('button', {
      class: 'learning-home-journey-view',
      attrs: { type: 'button', 'data-journey-kind': kind, 'aria-controls': panelId, 'aria-expanded': 'false', 'aria-pressed': 'false' },
    });
    button.appendChild(roomIcon(symbol, iconFallback, 'learning-home-journey-icon'));
    button.appendChild(el('span', { class: 'learning-home-journey-label', text: tt(key, fallback) }));
    button.appendChild(el('span', { class: 'learning-home-journey-count', text: String(count) }));
    button.addEventListener('click', async () => {
      if (activeKind === kind && !panel.hidden) {
        closePanel(true); return;
      }
      activeKind = kind; activeButton = button;
      for (const item of controls.querySelectorAll('.learning-home-journey-view')) {
        const on = item === button; item.setAttribute('aria-expanded', String(on)); item.setAttribute('aria-pressed', String(on));
      }
      await loadPanel(kind, '', 0);
    });
    controls.appendChild(button);
  }
  section.appendChild(controls); section.appendChild(panel);
  return section;
}

// The L0 hub is now the Learning Home: one featured next action, bounded Today actions,
// a short ready shelf, then compact corpus doors. Corpus storage remains visible but no
// longer dictates the first-screen hierarchy.
async function renderCorpusHub(token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  main.innerHTML = '';
  const loading = stateBoxNode('room.home.loading', '⏳');
  loading.classList.add('learning-home-loading');
  main.appendChild(loading);
  const [continueRow, nextPicks, ownCount, journeySummary] = await Promise.all([
    getLearningHomeContinue(),
    buildNextTextPicks(),
    getLearningHomeOwnCount(),
    typeof localDb.getReadingJourneySummary === 'function'
      ? localDb.getReadingJourneySummary(readingJourneyAuthorizedGroupIds()).catch(() => ({ bookmarks: 0, finished: 0, notes: 0 }))
      : Promise.resolve({ bookmarks: 0, finished: 0, notes: 0 }),
    refreshDueBadge().catch(() => null),
  ]);
  if (token !== corpusRenderToken) return;
  const ready = ((corpusIndex && corpusIndex.ready) || []).slice();
  const featuredId = nextPicks && nextPicks.picks && nextPicks.picks[0] && nextPicks.picks[0].card
    ? String(nextPicks.picks[0].card.id) : '';
  const ordered = [], seen = new Set();
  for (const pick of ((nextPicks && nextPicks.picks) || [])) {
    if (!pick || !pick.card || String(pick.card.id) === featuredId) continue;
    const id = String(pick.card.id); if (!seen.has(id)) { seen.add(id); ordered.push(pick.card); }
  }
  for (const card of ready) {
    const id = String(card.id); if (id === featuredId || seen.has(id)) continue;
    seen.add(id); ordered.push(card);
  }
  const readyCards = ordered.slice(0, 4);
  const wrap = el('div', { class: 'corpus-nav learning-home' });
  const intro = el('header', { class: 'learning-home-intro' });
  intro.appendChild(el('p', { class: 'learning-home-overline', text: tt('room.home.overline', 'Ваше чтение') }));
  intro.appendChild(el('h1', { class: 'learning-home-title', text: tt('room.home.title', 'Продолжим с нужного места') }));
  intro.appendChild(el('p', { class: 'learning-home-subtitle', text: tt('room.home.subtitle', 'Один следующий шаг — и вся библиотека рядом.') }));
  wrap.appendChild(intro);
  const lead = el('div', { class: 'learning-home-lead' });
  lead.appendChild(learningHomeFeature(continueRow, nextPicks));
  lead.appendChild(learningHomeToday(ready));
  wrap.appendChild(lead);
  wrap.appendChild(learningHomeJourney(journeySummary));
  wrap.appendChild(learningHomeReadingLists());

  if (readyCards.length) {
    const shelf = el('section', { class: 'learning-home-ready', attrs: { 'aria-labelledby': 'learningHomeReadyTitle' } });
    const head = el('div', { class: 'learning-home-section-head' });
    const title = el('h2', { class: 'learning-home-section-title', text: tt('room.home.readyTitle', 'Готово к чтению') });
    title.id = 'learningHomeReadyTitle'; head.appendChild(title);
    const all = el('button', { class: 'learning-home-all', attrs: { type: 'button' }, text: tt('room.home.allReady', 'Все готовые') + ' ' + learningHomeForwardArrow() });
    all.addEventListener('click', () => { corpusFilter.readyOnly = true; corpusL1Sort = 'ready'; corpusNavToCorpus('benyehuda'); });
    head.appendChild(all); shelf.appendChild(head);
    const list = el('div', { class: 'learning-home-ready-list' });
    for (const card of readyCards) list.appendChild(renderCorpusWorkRow(card, true, { compact: true, showAuthor: true, materialKind: 'ready' }));
    shelf.appendChild(list); wrap.appendChild(shelf);
  }

  const corpora = el('section', { class: 'learning-home-corpora', attrs: { 'aria-labelledby': 'learningHomeCorporaTitle' } });
  const corporaHead = el('div', { class: 'learning-home-section-head' });
  const corporaTitle = el('h2', { class: 'learning-home-section-title', text: tt('room.home.corporaTitle', 'Все библиотеки') });
  corporaTitle.id = 'learningHomeCorporaTitle'; corporaHead.appendChild(corporaTitle); corpora.appendChild(corporaHead);
  const list = el('div', { class: 'learning-corpus-list' });
  for (const corpus of CORPORA) {
    let count = '';
    if (corpus.id === 'benyehuda') {
      const total = Number(corpusRoot && corpusRoot.counts && corpusRoot.counts.works) || 0;
      count = roomNumber(ready.length) + ' ' + tt('room.hub.ready', 'готово') + (total ? ' · ' + roomNumber(total) + ' ' + tt('room.hub.total', 'всего') : '');
    } else if (corpus.id === 'mytexts' && ownCount != null) count = ownCount + ' ' + tt('room.hub.textsN', 'текст(ов)');
    list.appendChild(learningHomeCorpusEntry(corpus, count));
  }
  for (const group of groupCorpora) {
    const corpus = {
      id: 'group:' + group.corpus_id, icon: '♪',
      title: { key: '', fb: String(group.title || tt('room.home.groupAction', 'Учебный корпус')) },
      desc: { key: 'room.groupCorpus.hubDesc', fb: 'Закрытый учебный корпус вашей группы' },
    };
    const role = group.role === 'OWNER' ? tt('room.groupCorpus.owner', 'владелец') : tt('room.groupCorpus.member', 'участник');
    const count = group.works_count != null && Number.isFinite(Number(group.works_count))
      ? Number(group.works_count) + ' ' + tt('room.hub.textsN', 'текст(ов)') + ' · ' + role
      : role;
    list.appendChild(learningHomeCorpusEntry(corpus, count));
  }
  corpora.appendChild(list); wrap.appendChild(corpora);
  // Roadmap promise is an aside, visually and semantically outside the authorized corpus list.
  wrap.appendChild(el('aside', { class: 'learning-home-teaser', text: '🔬 ' + tt('room.hub.soon', 'Скоро: тематические корпуса') }));
  main.innerHTML = '';
  main.appendChild(wrap);
  _paintDueCTA();
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}
// «Мои тексты» as a FULL corpus (LocalDb-backed): identity header + native facets (level / tags /
// sort) + client search + vertical grid. One listTexts query; facets computed in memory.
let myCorpusState = { q: '', level: '', tags: [], tagMode: 'all', scope: 'texts', sort: 'opened_desc', smart: '' };
// B6.1 — DB-first personal corpus. The B5 card/shell grammar stays unchanged,
// but truth no longer comes from a capped 500-row client array. Every paint is
// one exact-count keyset page and replaces the previous 48-card DOM window.
async function renderMyTextsCorpus(token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  const startedAt = performance.now();
  let facetsData = { total: 0, levels: [], tags: [], smartCounts: {} };
  let defaultPage = { items: [], matchedTotal: 0 };
  try {
    [facetsData, defaultPage] = await Promise.all([
      localDb.getPersonalTextFacets(),
      localDb.listPersonalTextsPage({ limit: 1, sort: 'opened_desc' }),
    ]);
  } catch (_) {}
  if (token !== corpusRenderToken) return;

  main.innerHTML = '';
  const corpus = corpusById('mytexts');
  const wrap = el('div', { class: 'corpus-nav mytexts-corpus' });
  wrap.appendChild(corpusSwitcherBar('mytexts'));
  wrap.appendChild(corpusShellHeader(corpus, {
    countText: roomNumber(facetsData.total) + ' ' + tt('room.hub.textsN', 'текст(ов)'),
    authority: '◉ ' + tt('room.shell.onDevice', 'На этом устройстве'),
    capabilityText: tt('room.shell.myTextsCapabilities', 'Морфология и чтение офлайн · ваши переводы и медиа · никуд по отдельному согласию'),
  }));
  const management = corpusSecondaryDisclosure(
    tt('room.shell.manageTexts', 'Добавление и управление текстами'),
    tt('room.shell.manageTextsNote', 'Импорт, редактирование и удаление остаются в Студии; Читальный зал сохраняет фокус на чтении.'),
  );
  const manage = el('div', { class: 'mytexts-controls corpus-management-actions' });
  manage.appendChild(el('a', { class: 'hub-cta', attrs: { href: '/' }, text: tt('room.hub.addText', '+ Добавить текст') }));
  manage.appendChild(el('a', { class: 'mytexts-manage', attrs: { href: '/' }, text: tt('room.mytexts.manage', 'Управлять — в Студии') }));
  management.__panel.appendChild(manage);

  if (!Number(facetsData.total || 0)) {
    wrap.appendChild(corpusNextAction({
      kind: 'add', title: tt('room.shell.firstOwnText', 'Добавьте первый учебный текст'),
      kicker: tt('room.home.startKicker', 'С чего начать'),
      meta: tt('room.mytexts.corpusEmpty', 'Здесь появятся ваши тексты из Студии — создайте или импортируйте первый.'),
      label: tt('room.hub.addText', '+ Добавить текст'), href: '/',
    }));
    wrap.appendChild(el('div', { class: 'mytexts-empty', text: tt('room.mytexts.corpusEmpty', 'Здесь появятся ваши тексты из Студии — создайте или импортируйте первый.') }));
    wrap.appendChild(management); main.appendChild(wrap);
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    roomDiagPush({ kind: 'room.page', duration_ms: performance.now() - startedAt, result: 'empty' });
    return;
  }

  const nextMine = defaultPage.items && defaultPage.items[0];
  if (nextMine) {
    const started = nextMine.last_row_idx != null && Number(nextMine.last_row_idx) > 0;
    wrap.appendChild(corpusNextAction({
      kind: started ? 'continue' : 'start', title: nextMine.title,
      kicker: started ? tt('room.home.continueKicker', 'Продолжить') : tt('room.home.startKicker', 'С чего начать'),
      meta: started ? tt('room.mytexts.progressRow', 'строка') + ' ' + (Number(nextMine.last_row_idx) + 1) : tt('room.shell.ownText', 'Ваш текст'),
      label: started ? tt('room.resume.continue', 'Продолжить') : tt('room.home.startAction', 'Начать читать'),
      href: deepLinkForText(nextMine.id), onOpen: () => openReader(nextMine.id, nextMine.title, { resume: started }),
    }));
  }
  const myProfileFitHost = el('div', { class: 'corpus-profile-fit-host mytexts-profile-fit-host' });
  wrap.appendChild(myProfileFitHost);
  const myCatalogRegion = corpusCatalogRegion('mytexts');

  let filterChrome = null;
  const controls = el('div', { class: 'mytexts-controls mytexts-filter-controls' });
  const searchField = el('label', { class: 'room-field room-field-wide', attrs: { for: 'roomMyTextsSearch' } });
  searchField.appendChild(el('span', { class: 'room-field-label', text: tt('room.corpus.search.placeholder', 'Поиск') }));
  const input = el('input', { class: 'corpus-search-input mytexts-search', attrs: {
    id: 'roomMyTextsSearch', name: 'room-mytexts-search', type: 'search',
    placeholder: tt('room.mytexts.searchPro', 'Поиск (PRO): название / тема / уровень / #тег'),
    'aria-label': tt('room.mytexts.searchPro', 'Поиск (PRO): название / тема / уровень / #тег'),
  } });
  input.value = myCorpusState.q; searchField.appendChild(input);
  const makeSelect = (id, options, value, label, onChange) => {
    const field = el('label', { class: 'room-field', attrs: { for: id } });
    field.appendChild(el('span', { class: 'room-field-label', text: label }));
    const select = el('select', { class: 'mytexts-select', attrs: { id, name: id, 'aria-label': label } });
    for (const [optionValue, key, fallback] of options) {
      const option = document.createElement('option'); option.value = optionValue; option.textContent = tt(key, fallback); select.appendChild(option);
    }
    select.value = value;
    select.addEventListener('change', () => { onChange(select.value, select); filterChrome && filterChrome.refresh(); });
    field.appendChild(select); return field;
  };
  controls.appendChild(makeSelect('roomMyTextsScope', [
    ['texts', 'room.mytexts.scopeTexts', 'Поиск: тексты'],
    ['both', 'room.mytexts.scopeBoth', 'Поиск: тексты+строки+заметки'],
    ['rows', 'room.mytexts.scopeRows', 'Поиск: только строки'],
    ['notes', 'room.mytexts.scopeNotes', 'Поиск: только заметки'],
  ], myCorpusState.scope, tt('room.mytexts.scopeLabel', 'Область поиска'), (value) => { myCorpusState.scope = value; schedulePaint(); }));
  const sortField = makeSelect('roomMyTextsSort', [
    ['opened_desc', 'room.mytexts.sortOpened', 'Последние открытые'],
    ['updated_desc', 'room.mytexts.sortUpdated', 'Последние изменённые'],
    ['title_asc', 'room.mytexts.sortAZ', 'А–Я'],
    ['title_desc', 'room.mytexts.sortZA', 'Я–А'],
    ['topic_asc', 'room.mytexts.sortTopic', 'Тема А–Я'],
    ['familiar_desc', 'room.compass.sortFamiliar', 'Сначала достоверно знакомые'],
  ], myCorpusState.sort, tt('room.corpus.sort.label', 'Сортировка'), async (value, select) => {
    if (value === 'familiar_desc' && !await familiaritySortProfileAvailable()) { select.value = myCorpusState.sort; return; }
    myCorpusState.sort = value; paint({ reset: true });
  });

  const smartDefinitions = [
    ['recent', 'room.mytexts.smartRecent', '⏱ Недавние'],
    ['struggling', 'room.mytexts.smartStruggling', '🔥 Сложные'],
    ['mastered', 'room.mytexts.smartMastered', '✓ Освоено'],
    ['fresh', 'room.mytexts.smartNew', '✨ Новые'],
    ['with-note', 'room.mytexts.smartWithNote', '📝 С заметкой'],
    ['audio-noted', 'room.mytexts.smartAudio', '📍 Audio-noted'],
    ['srs-noted', 'room.mytexts.smartSrs', '🎯 SRS-noted'],
    ['templated', 'room.mytexts.smartTemplated', '⭐ Templated'],
  ];
  const smartRail = el('div', { class: 'corpus-sort mytexts-smart' });
  const buildSmart = () => {
    smartRail.textContent = '';
    for (const [key, i18nKey, fallback] of smartDefinitions) {
      const active = myCorpusState.smart === key;
      const button = el('button', { class: 'corpus-sort-btn' + (active ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(active), 'data-smart': key } });
      button.textContent = tt(i18nKey, fallback);
      const count = Number(facetsData.smartCounts && facetsData.smartCounts[key] || 0);
      if (count) button.appendChild(el('span', { class: 'mytexts-smart-badge', text: String(count) }));
      button.addEventListener('click', () => {
        myCorpusState.smart = active ? '' : key; buildSmart(); paint({ reset: true }); filterChrome && filterChrome.refresh();
      });
      smartRail.appendChild(button);
    }
  };
  controls.appendChild(smartRail);

  const levels = (facetsData.levels || []).map((item) => String(item.value || '')).filter(Boolean);
  const tags = (facetsData.tags || []).map((item) => String(item.value || '')).filter(Boolean).slice(0, 8);
  const facets = el('div', { class: 'mytexts-facets' });
  const facetButton = (label, active, onClick) => {
    const button = el('button', { class: 'corpus-sort-btn' + (active ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(active) }, text: label });
    button.addEventListener('click', onClick); return button;
  };
  const buildFacets = () => {
    facets.textContent = '';
    if (levels.length) {
      const levelRail = el('div', { class: 'corpus-sort' });
      for (const level of levels) levelRail.appendChild(facetButton(level, myCorpusState.level === level, () => {
        myCorpusState.level = myCorpusState.level === level ? '' : level; buildFacets(); paint({ reset: true }); filterChrome && filterChrome.refresh();
      }));
      facets.appendChild(levelRail);
    }
    if (tags.length) {
      const tagRail = el('div', { class: 'corpus-sort' });
      if (myCorpusState.tags.length >= 2) {
        tagRail.appendChild(facetButton(tt('room.mytexts.tagsAll', 'Теги: ALL'), myCorpusState.tagMode === 'all', () => { myCorpusState.tagMode = 'all'; buildFacets(); paint({ reset: true }); }));
        tagRail.appendChild(facetButton(tt('room.mytexts.tagsAny', 'Теги: ANY'), myCorpusState.tagMode === 'any', () => { myCorpusState.tagMode = 'any'; buildFacets(); paint({ reset: true }); }));
      }
      for (const tag of tags) {
        const active = myCorpusState.tags.includes(tag);
        tagRail.appendChild(facetButton('#' + tag, active, () => {
          myCorpusState.tags = active ? myCorpusState.tags.filter((item) => item !== tag) : myCorpusState.tags.concat([tag]);
          buildFacets(); paint({ reset: true }); filterChrome && filterChrome.refresh();
        }));
      }
      facets.appendChild(tagRail);
    }
  };
  controls.appendChild(facets);
  filterChrome = corpusFilterChrome('roomMyTexts', searchField, controls, sortField, () => {
    const labels = [];
    if (myCorpusState.scope !== 'texts') labels.push(tt('room.mytexts.scopeLabel', 'Область поиска'));
    if (myCorpusState.level) labels.push(myCorpusState.level);
    if (myCorpusState.smart) labels.push((smartDefinitions.find((item) => item[0] === myCorpusState.smart) || [])[2] || myCorpusState.smart);
    for (const tag of myCorpusState.tags) labels.push('#' + tag);
    return { count: (myCorpusState.scope !== 'texts' ? 1 : 0) + (myCorpusState.level ? 1 : 0) + (myCorpusState.smart ? 1 : 0) + myCorpusState.tags.length, labels };
  });
  myCatalogRegion.appendChild(filterChrome.node);

  const listSection = el('section', { class: 'room-primary-list mytexts-list-section' });
  const listHead = el('div', { class: 'corpus-list-head' });
  listHead.appendChild(el('h2', { class: 'corpus-list-count', text: tt('room.corpus.sectionMaterials', 'Учебные материалы') }));
  listSection.appendChild(listHead);
  const resultLine = el('div', { class: 'room-browse-summary mytexts-results', attrs: { 'aria-live': 'polite' } });
  const grid = el('div', { class: 'mytexts-grid corpus-work-list' });
  const pager = el('nav', { class: 'corpus-more mytexts-more mytexts-pager', attrs: { 'aria-label': tt('room.mytexts.pagination', 'Страницы текстов') } });
  listSection.appendChild(resultLine); listSection.appendChild(grid); listSection.appendChild(pager);
  attachRoomLongListDisclosure(listSection, listHead, [resultLine, grid, pager], 'mytexts:materials');
  myCatalogRegion.appendChild(personalCompassProgressNode());
  myCatalogRegion.appendChild(listSection);
  wrap.appendChild(myCatalogRegion); wrap.appendChild(management); main.appendChild(wrap);

  const freshSince = (() => { try { return localStorage.getItem('roomMyTextsLastVisit_v1') || ''; } catch (_) { return ''; } })();
  if (!_roomRestoringHistory) { try { localStorage.setItem('roomMyTextsLastVisit_v1', new Date().toISOString()); } catch (_) {} }
  let currentPage = null, currentStart = 0, paintSequence = 0, lastSnapshot = '';
  let smartIdCache = { key: '', ids: [] };
  const selectedSmartIds = async () => {
    const key = myCorpusState.smart;
    if (key !== 'struggling' && key !== 'mastered') return [];
    if (smartIdCache.key === key) return smartIdCache.ids;
    let ids = [];
    try { ids = key === 'struggling' ? await localDb.getStrugglingTexts({}) : await localDb.getMasteredTexts(); } catch (_) {}
    smartIdCache = { key, ids: (ids || []).map(String) }; return smartIdCache.ids;
  };
  const restoreAnchor = roomInitialMyTextsAnchor();
  async function paint(options = {}) {
    const sequence = ++paintSequence;
    if (options.reset) { currentStart = Math.max(0, Number(options.start) || 0); lastSnapshot = ''; }
    if (Number.isFinite(Number(options.familiarStart))) currentStart = Math.max(0, Number(options.familiarStart));
    const requestStarted = performance.now();
    grid.setAttribute('aria-busy', 'true');
    let page;
    try {
      const smartIds = await selectedSmartIds();
      if (myCorpusState.sort === 'familiar_desc') {
        const ranked = await loadPersonalFamiliarityRanking({ ...myCorpusState, smartIds, freshSince });
        if (ranked.status !== 'AVAILABLE' || !ranked.rankEligibleTotal) {
          myCorpusState.sort = 'opened_desc';
          const select = sortField.querySelector('select'); if (select) select.value = myCorpusState.sort;
          if (ranked.status === 'AVAILABLE') { explainNoReliableFamiliaritySort(); return paint({ reset: true }); }
          const key = ranked.status === 'NEEDS_PROFILE' ? 'room.mytexts.sortFamiliarNeedsProfile'
            : ranked.status === 'TOO_LARGE' ? 'room.mytexts.sortFamiliarLimit' : 'room.mytexts.sortFamiliarPreparing';
          const fallback = ranked.status === 'NEEDS_PROFILE' ? 'Сначала отметьте несколько знакомых слов.'
            : ranked.status === 'TOO_LARGE' ? 'Сортировка доступна для библиотеки до 5 000 текстов.'
              : 'Подождите завершения локального анализа библиотеки.';
          roomToast(tt(key, fallback));
          return paint({ reset: true });
        }
        const items = ranked.items.slice(currentStart, currentStart + ROOM_BROWSE_PAGE);
        page = { items, matchedTotal: ranked.matchedTotal, nextCursor: currentStart + items.length < ranked.matchedTotal ? 'familiar-next' : null,
          snapshot: ['familiar', ranked.matchedTotal, _compassProjection && _compassProjection.version || ''].join(':') };
      } else {
        page = await localDb.listPersonalTextsPage({
          ...myCorpusState, limit: ROOM_BROWSE_PAGE,
          cursor: options.cursor || null,
          anchorId: options.anchorId || null,
          beforeAnchorId: options.beforeAnchorId || null,
          smartIds, freshSince,
        });
      }
    } catch (error) {
      if (sequence !== paintSequence) return;
      grid.removeAttribute('aria-busy'); grid.textContent = '';
      grid.appendChild(el('div', { class: 'mytexts-empty', text: tt('room.state.error', 'Не удалось загрузить') }));
      roomDiagPush({ kind: 'room.error', error_code: error && error.message === 'CURSOR_MISMATCH' ? 'cursor_mismatch' : 'page_failed', result: 'error' });
      return;
    }
    if (sequence !== paintSequence || token !== corpusRenderToken) return;
    await prepareLearningCompassPage(page.items.map(myCompassDescriptor));
    if (sequence !== paintSequence || token !== corpusRenderToken) return;
    if (lastSnapshot && page.snapshot !== lastSnapshot && !options.reset) {
      roomToast(tt('room.mytexts.changedRestart', 'Библиотека изменилась — список обновлён с первой страницы'));
      return paint({ reset: true });
    }
    lastSnapshot = page.snapshot; currentPage = page;
    if (myCorpusState.sort !== 'familiar_desc') {
      if (options.beforeAnchorId) currentStart = Math.max(0, currentStart - ROOM_BROWSE_PAGE);
      else if (options.advance) currentStart += Number(options.advance) || ROOM_BROWSE_PAGE;
      else if (options.reset) currentStart = Math.max(0, Number(options.start) || 0);
    }
    if (!page.items.length && page.matchedTotal > 0 && (options.cursor || options.anchorId || options.beforeAnchorId)) return paint({ reset: true });
    grid.removeAttribute('aria-busy'); grid.textContent = '';
    for (const item of page.items) grid.appendChild(renderMyTextCard(item, true));
    if (!page.items.length) grid.appendChild(el('div', { class: 'mytexts-empty', text: tt('room.mytexts.empty', 'Ничего не найдено') }));
    const first = page.items.length ? currentStart + 1 : 0;
    const last = currentStart + page.items.length;
    resultLine.textContent = tt('room.groupCorpus.found', 'Найдено') + ': ' + roomNumber(first) + '–' + roomNumber(last) + ' / ' + roomNumber(page.matchedTotal);
    pager.textContent = '';
    const previous = el('button', { class: 'corpus-more-btn mytexts-page-prev', attrs: { type: 'button' }, text: '← ' + tt('room.mytexts.previousPage', 'Предыдущие') });
    previous.disabled = currentStart <= 0 || !page.items.length;
    previous.addEventListener('click', () => myCorpusState.sort === 'familiar_desc'
      ? paint({ familiarStart: Math.max(0, currentStart - ROOM_BROWSE_PAGE) })
      : paint({ beforeAnchorId: page.items[0].id }));
    const next = el('button', { class: 'corpus-more-btn mytexts-page-next', attrs: { type: 'button' }, text: tt('room.mytexts.nextPage', 'Следующие') + ' →' });
    next.disabled = !page.nextCursor;
    next.addEventListener('click', () => myCorpusState.sort === 'familiar_desc'
      ? paint({ familiarStart: currentStart + page.items.length })
      : paint({ cursor: page.nextCursor, advance: page.items.length }));
    pager.appendChild(previous); pager.appendChild(next);
    roomReplacePresentationState(page.items[0] || null, currentStart);
    roomDiagPush({ kind: myCorpusState.q ? 'room.search' : 'room.page', duration_ms: performance.now() - requestStarted, result: 'ok' });
  }
  let paintTimer = null;
  const schedulePaint = () => { if (paintTimer) clearTimeout(paintTimer); paintTimer = setTimeout(() => paint({ reset: true }), 200); };
  input.addEventListener('input', () => { myCorpusState.q = input.value || ''; schedulePaint(); filterChrome && filterChrome.refresh(); });
  buildSmart(); buildFacets(); filterChrome.refresh();
  await paint({ reset: true, anchorId: restoreAnchor && restoreAnchor.itemId, start: restoreAnchor && restoreAnchor.rowIndex });
  // Lower-priority continuation covers the rest of the recent personal library after
  // the visible page has been enqueued. It never blocks browsing or Reader opening.
  startPersonalCompassSweep();
  paintMyTextsProfileFit(myProfileFitHost, token, nextMine && nextMine.id);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  roomDiagPush({ kind: 'room.page', duration_ms: performance.now() - startedAt, result: 'ready' });
}

// L1 — graduated landing with a PERSISTENT global filter bar (search + facets) on top. The
// body below toggles between the home content (ready rail + chronological period grid) and the
// global RESULTS list, driven by corpusFilter — refreshed IN PLACE so the search input never
// loses focus while typing.
// Uniform retrieval contract — the personal smart-chips rail, IDENTICAL labels/semantics to the
// «Мои тексты» corpus (same i18n keys, same localDb sets). Scope is honest: chips act on works
// materialized on THIS device (hinted via title). Single-select toggle.
const CORPUS_SMART_CHIPS = [
  ['recent', 'room.mytexts.smartRecent', '⏱ Недавние'],
  ['struggling', 'room.mytexts.smartStruggling', '🔥 Сложные'],
  ['mastered', 'room.mytexts.smartMastered', '✓ Освоено'],
  ['fresh', 'room.mytexts.smartNew', '✨ Новые'],
  ['with-note', 'room.mytexts.smartWithNote', '📝 С заметкой'],
  ['audio-noted', 'room.mytexts.smartAudio', '📍 Audio-noted'],
  ['srs-noted', 'room.mytexts.smartSrs', '🎯 SRS-noted'],
  ['templated', 'room.mytexts.smartTemplated', '⭐ Templated'],
];
function buildCorpusSmartRail() {
  const rail = el('div', { class: 'corpus-sort mytexts-smart corpus-smart-rail', attrs: { title: tt('room.corpus.personalHint', 'Фильтры по вашей активности — работы, открытые на этом устройстве') } });
  for (const [key, i18nKey, fb] of CORPUS_SMART_CHIPS) {
    const on = corpusFilter.smart === key;
    const b = el('button', { class: 'corpus-sort-btn' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(on), 'data-smart': key } });
    b.textContent = tt(i18nKey, fb);
    b.addEventListener('click', () => {
      corpusFilter.smart = on ? '' : key;
      ensurePersonalSets().then(() => { corpusRefreshL1Body(); paintCorpusSmartRail(); }).catch(() => { corpusRefreshL1Body(); paintCorpusSmartRail(); });
    });
    rail.appendChild(b);
  }
  return rail;
}
let _corpusSmartRailEl = null;
function paintCorpusSmartRail() {
  if (!_corpusSmartRailEl || !_corpusSmartRailEl.isConnected) return;
  const fresh = buildCorpusSmartRail();
  _corpusSmartRailEl.replaceWith(fresh);
  _corpusSmartRailEl = fresh;
}
async function paintBenCorpusNext(host, token) {
  if (!host || token !== corpusRenderToken) return;
  const ready = (corpusIndex && corpusIndex.ready) || [];
  const fallback = ready[0];
  if (fallback) host.replaceChildren(corpusNextAction({
    kind: 'start', title: fallback.title,
    kicker: tt('room.home.startKicker', 'С чего начать'),
    meta: [fallback.author, fallback.segments ? fallback.segments + ' ' + tt('room.home.rows', 'строк') : ''].filter(Boolean).join(' · '),
    label: tt('room.home.startAction', 'Начать читать'), href: deepLinkForCorpusWork(fallback.id),
    onOpen: () => openCorpusWork(fallback),
  }));
  try {
    const rows = await localDb.getContinueReading(50);
    const current = (rows || []).find((row) => row && row.text_key && corpusReadyKeyMap().has(String(row.text_key)));
    if (!current || token !== corpusRenderToken || !host.isConnected) return;
    const pct = window.ReaderProgress ? window.ReaderProgress.continuePercent(current.last_row_idx, current.n_rows) : 0;
    host.replaceChildren(corpusNextAction({
      kind: 'continue', title: current.title,
      kicker: tt('room.home.continueKicker', 'Продолжить'),
      meta: tt('room.resume.positionPercent', 'позиция · {value}%').replace('{value}', String(pct)),
      label: tt('room.resume.continue', 'Продолжить'), href: deepLinkForText(current.id),
      onOpen: () => openReader(current.id, current.title, { resume: true }),
    }));
  } catch (_) {}
}
async function renderCorpusHome(token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  main.innerHTML = '';
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(corpusSwitcherBar('benyehuda'));   // «Библиотека ▸ ⟨🏛 … ▾⟩» (B+C hybrid)
  const corpus = corpusById('benyehuda');
  const total = Number(corpusRoot && corpusRoot.counts && corpusRoot.counts.works) || 0;
  wrap.appendChild(corpusShellHeader(corpus, {
    countText: total ? roomNumber(total) + ' ' + tt('room.corpus.worksN', 'работ') : '',
    authority: '◇ ' + tt('room.shell.publicCatalog', 'Публичный каталог'),
  }));
  const nextHost = el('div', { class: 'corpus-next-host' }); wrap.appendChild(nextHost);
  paintBenCorpusNext(nextHost, token);
  const profileFitHost = el('div', { class: 'corpus-profile-fit-host' }); wrap.appendChild(profileFitHost);
  const filterChrome = buildCorpusFilterBar();
  _corpusSmartRailEl = buildCorpusSmartRail();
  const filterPanel = filterChrome.querySelector('.corpus-filterbar');
  if (filterPanel) filterPanel.appendChild(_corpusSmartRailEl);
  const catalogRegion = corpusCatalogRegion('benyehuda');
  catalogRegion.appendChild(filterChrome);
  const readyTotal = Number(corpusIndex && corpusIndex.ready && corpusIndex.ready.length || 0);
  catalogRegion.appendChild(corpusLearningIndexStatusNode('benyehuda', readyTotal));
  const body = el('div', { class: 'corpus-l1-body' });
  corpusL1Body = body;
  catalogRegion.appendChild(body);
  wrap.appendChild(catalogRegion);
  const about = corpusSecondaryDisclosure(
    tt('room.shell.aboutCorpus', 'О корпусе и данных'),
    tt('room.shell.benProvenance', 'Каталог проекта Бен‑Иегуды. Переводы, огласовка, аудио и оценки сложности показываются только там, где соответствующие данные действительно доступны.'),
  );
  wrap.appendChild(about);
  main.appendChild(wrap);
  paintBenProfileFit(profileFitHost, token);
  ensureBenFamiliarityScores().then(() => { if (token === corpusRenderToken && corpusL1Sort === 'familiar_desc') corpusRefreshL1Body(); }).catch(() => {});
  await corpusRefreshL1Body();
}

// Refresh ONLY the L1 body (the filter bar + its focused input stay put): the global results
// when a filter is active, the home rail + period grid otherwise.
async function corpusRefreshL1Body() {
  const body = corpusL1Body;
  if (!body) return;
  if (corpusFilterChromeRefresh) corpusFilterChromeRefresh();
  // keep the clear chip in sync without rebuilding the bar (preserves input focus)
  if (corpusClearChip) corpusClearChip.hidden = !corpusFilterActive();
  // S12 — recents/suggestions are a home-only affordance; repaint (history may have grown) + toggle.
  if (corpusRecentsEl) { if (corpusFilterActive()) corpusRecentsEl.hidden = true; else { paintRecents(); corpusRecentsEl.hidden = false; } }
  if (corpusFilterActive()) return renderResultsInto(body);
  return renderHomeInto(body);
}

function renderHomeInto(body) {
  body.innerHTML = '';
  const ready = (corpusIndex && corpusIndex.ready) || [];
  if (ready.length) {
    const sec = el('section', { class: 'shelf corpus-ready' });
    const head = el('div', { class: 'shelf-head' });
    const h = el('h2', { class: 'shelf-title' });
    h.textContent = '✓ ' + tt('room.corpus.readyTitle', 'Готовы к чтению') + ' — ' + ready.length + ' ' + tt('room.corpus.worksN', 'работ');   // PC-12 — framed count, not a bare «(796)»
    head.appendChild(h);
    const all = el('button', { class: 'shelf-showall room-ready-all', attrs: { type: 'button' } });
    all.textContent = tt('room.resume.showAll', 'Показать все') + ' ' + ready.length + ' →';
    all.addEventListener('click', () => {
      corpusFilter.readyOnly = true;
      corpusL1Sort = 'ready';
      corpusRefreshL1Body();
    });
    head.appendChild(all);
    head.appendChild(el('p', { class: 'shelf-intro', i18n: 'room.corpus.readyIntro', text: tt('room.corpus.readyIntro') }));
    sec.appendChild(head);
    const rail = el('div', { class: 'corpus-work-list room-preview-list' });
    for (const c of corpusSortedReadyPreview(ready).slice(0, ROOM_PREVIEW)) rail.appendChild(renderCorpusWorkRow(c, true, { showAuthor: true, showListBtn: true, compact: true }));
    sec.appendChild(rail);
    attachRoomLongListDisclosure(sec, head, [rail], 'ben:ready');
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
  attachRoomLongListDisclosure(periods, ph, [grid], 'ben:periods');
  body.appendChild(periods);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  injectBenHomeRails(body);   // reading-life rails only; owner corpus remains a separate L1 surface
}

// FB-9 — L1 results order. 'ready' keeps the readiness-first + alpha default; 'alpha' sorts by title;
// 'length' sorts longest-first using the READY card's segment count (search rows carry no length, so a
// non-ready hit has no measurable length → 0 → it sorts after the measured ones, then alpha; honest —
// never a fabricated length ranking among unknowns, R10).
function corpusL1Len(h, readyMap) { const c = readyMap.get(String(h.id)); return (c && (c.segments || 0)) || 0; }
function corpusL1Comparator(mode, readyMap) {
  if (mode === 'familiar_desc') return (a, b) => {
    const af = _benFamiliarityScores && _benFamiliarityScores.get(String(a.id));
    const bf = _benFamiliarityScores && _benFamiliarityScores.get(String(b.id));
    const ar = !!(af && af.status === 'AVAILABLE' && af.rank_eligible);
    const br = !!(bf && bf.status === 'AVAILABLE' && bf.rank_eligible);
    if (ar !== br) return ar ? -1 : 1;
    if (ar && br) {
      const delta = Number(bf.recorded_familiar_pct_lower_bound || 0) - Number(af.recorded_familiar_pct_lower_bound || 0);
      if (delta) return delta;
    }
    return (b.r - a.r) || String(a.t || '').localeCompare(String(b.t || ''));
  };
  if (mode === 'alpha') return (a, b) => String(a.t || '').localeCompare(String(b.t || ''));
  if (mode === 'length') return (a, b) => (corpusL1Len(b, readyMap) - corpusL1Len(a, readyMap)) || String(a.t || '').localeCompare(String(b.t || ''));
  if (mode === 'opened') {
    // uniform-contract sort: recently opened first (materialized works; the rest keep ready order)
    const lo = (x) => { const c = readyMap.get(String(x.id)); const k = c && String(c.text_key || ''); const v = k && _personalSets && _personalSets.lastOpenedByKey.get(k); const t2 = v ? Date.parse(v) : 0; return Number.isFinite(t2) ? t2 : 0; };
    return (a, b) => (lo(b) - lo(a)) || (b.r - a.r) || String(a.t || '').localeCompare(String(b.t || ''));
  }
  return (a, b) => (b.r - a.r) || String(a.t || '').localeCompare(String(b.t || ''));   // 'ready' (default)
}
function corpusSortedReadyPreview(ready) {
  const map = corpusReadyMap();
  const comparator = corpusL1Comparator(corpusL1Sort, map);
  return (ready || []).slice().sort((a, b) => comparator(
    { id: a.id, t: a.title || '', r: 1 },
    { id: b.id, t: b.title || '', r: 1 },
  ));
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
  // uniform personal dimensions need the localDb sets loaded BEFORE the sync filter runs
  if (corpusFilter.smart || corpusPersonalQuery(corpusFilter.q).tags.length) {
    try { await ensurePersonalSets(); } catch (_) {}
    if (corpusL1Body !== body || mySeq !== corpusFtsSeq) return;
  }
  const hits = corpusApplyFilter();
  const summary = el('div', { class: 'corpus-results-summary' });
  summary.appendChild(el('span', { class: 'corpus-results-label', text: corpusFilterSummary() }));
  // BRR-S6 — when there's a TEXT query, label the count as «По названию: N» so a «0» reads as
  // «no title match», not «nothing found» (the in-text group below carries its own count, merged in
  // after the async FTS resolves). A filter-only view (genre/lang, no query) keeps the plain count.
  const hasQuery = !!String(corpusFilter.q || '').trim();
  // FB-14 — «N из M» scale feedback when a non-query facet narrows the (un-scoped) corpus, so the user
  // can see how much was excluded. M = all searchable works. Scoped/query views keep their own labels.
  const facetNarrows = !hasQuery && !corpusFilter.scopeAuthor && !corpusFilter.scopeEra &&
    !!(corpusFilter.genre || corpusFilter.lang || corpusFilter.readyOnly || corpusFilter.readableOnly || corpusFilter.hasAudio || corpusFilter.reviewed);
  const totalM = (corpusSearch || []).length;
  const countText = hasQuery ? corpusCountLabel(hits.length, null, false)
    : (facetNarrows && totalM ? (hits.length + ' ' + tt('room.corpus.ofTotal', 'из') + ' ' + totalM) : String(hits.length));
  const countEl = el('span', { class: 'corpus-results-count', text: countText });
  summary.appendChild(countEl);
  body.appendChild(summary);
  // FB-9 — a real sort control for browse (filter-only) views; a query keeps relevance/ready order and
  // its own FTS «в тексте» group, so the control would mis-imply it reorders those — show it only here.
  // B3: sorting lives in the persistent shared browse toolbar, not in a second results-only row.
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
    // The persistent visible sort owns the title/author result group as well as
    // the default Ready preview. Full-text hits retain their explicitly labelled
    // phrase/word grouping below instead of pretending to be one flat list.
    hits.sort(corpusL1Comparator(corpusL1Sort, corpusReadyMap()));
    // FB-20 — the per-row decorate badges read works AS they render (covers «показать ещё» pagination
    // once the set is loaded); the post-pass below covers page-1 rows that pre-date the async set load.
    const sec = el('section', { class: 'shelf corpus-title-results' });
    const head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { class: 'shelf-title', text: tt('room.corpus.search.byTitle', 'По названию') + ' (' + hits.length + ')' }));
    sec.appendChild(head); body.appendChild(sec);
    appendPagedWorkRows(sec, hits.map((h) => ({ sr: h })), (node) => _finishedBadgeNode(node), { openOpts: { ftsQuery: corpusFilter.q } });
    attachRoomLongListDisclosure(sec, head, Array.from(sec.children).filter((node) => node !== head), 'ben:results:title');
    ensureFinishedSet().then(() => { if (corpusL1Body === body) decorateFinishedBadges(body); }).catch(() => {});
  }
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  // Group B — BRR-P2-001 full-text «в тексте» (async; lazy-loads only the shard(s) a query needs).
  // Shows its own «Ищем в текстах…» placeholder while loading; the seq token drops stale late results.
  await appendFtsGroup(body, corpusFilter.q, hits, mySeq, { countEl, titleN: hits.length });
  // FB-20 — the FTS «в тексте» rows arrive after the title group; re-run the idempotent badge pass so a
  // read work surfaced only as an in-text hit also shows «✓ прочитано» (adversarial-caught inconsistency).
  ensureFinishedSet().then(() => { if (corpusL1Body === body) decorateFinishedBadges(body); }).catch(() => {});
  // Empty state ONLY once this render is still current AND nothing was found (never mid-load).
  if (corpusL1Body === body && mySeq === corpusFtsSeq && !hits.length && !body.querySelector('.corpus-fts-group')) {
    // B7 — an empty profile yields no rank-eligible works. Explain the boundary instead of
    // presenting missing learner truth as a real zero.
    if (corpusFilter.readableOnly && _readableSet && _readableSet.size === 0) {
      body.appendChild(stateBoxNode('room.corpus.search.emptyReadable', '🌱'));
    } else {
      body.appendChild(stateBoxNode('room.corpus.search.empty', '🔍'));
    }
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
  let activeOffset = 0;
  const paintPage = (focusFirst) => {
    if (activeOffset >= items.length && activeOffset > 0) activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE);
    const upTo = Math.min(items.length, activeOffset + ROOM_BROWSE_PAGE);
    list.replaceChildren();
    for (let i = activeOffset; i < upTo; i++) {
      const it = items[i], sr = it.sr;
      const full = sr.r ? readyMap.get(String(sr.id)) : null;
      const node = renderCorpusWorkRow(full || corpusSearchRowToCard(sr), !!full, Object.assign({ showAuthor: true, showListBtn: true, materialKind: 'result' }, rowOpts || {}));
      if (decorate) decorate(node, it);
      list.appendChild(node);
    }
    moreWrap.replaceChildren();
    if (activeOffset > 0 || upTo < items.length) {
      const previous = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' }, text: tt('room.corpus.lists.previous', 'Назад') });
      previous.disabled = activeOffset <= 0;
      previous.addEventListener('click', () => { activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE); paintPage(true); });
      const page = el('span', { class: 'learning-journey-page-label', text: tt('room.corpus.lists.page', 'Страница {n}').replace('{n}', String(Math.floor(activeOffset / ROOM_BROWSE_PAGE) + 1)) });
      const next = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' }, text: tt('room.corpus.lists.next', 'Дальше') });
      next.disabled = upTo >= items.length;
      next.addEventListener('click', () => { activeOffset += ROOM_BROWSE_PAGE; paintPage(true); });
      moreWrap.appendChild(previous); moreWrap.appendChild(page); moreWrap.appendChild(next);
    }
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    if (focusFirst) list.querySelector('a,button')?.focus();
  };
  paintPage(false);
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
    morphHost.invalidateWordStates(); try { invalidateReadableSet(); } catch (_) {}   // S7 — profile grew → recompute coverage
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
function appendFtsSection(body, q, label, items, disclosureKey) {
  if (!items.length) return;
  const sec = el('section', { class: 'shelf corpus-fts-group' });
  const head = el('div', { class: 'shelf-head' });
  head.appendChild(el('h2', { class: 'shelf-title', text: label + ' (' + items.length + ')' }));
  sec.appendChild(head);
  body.appendChild(sec);
  appendPagedWorkRows(sec, items, null, { openOpts: { ftsQuery: q } });   // BRR-P2-005/006 — opens AT the matched/phrase line
  attachRoomLongListDisclosure(sec, head, Array.from(sec.children).filter((node) => node !== head), 'ben:results:fts:' + disclosureKey);
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
  const passFilter = (sr) => !!sr && !(f.readyOnly && !sr.r) && !(f.readableOnly && _readableSet && !_readableSet.has(String(sr.id))) && corpusScopeAuthorPass(sr, f) && !(f.scopeEra && sr.e !== f.scopeEra) && !((f.hasAudio || f.reviewed) && !corpusAdvOk(sr, advReadyMap)) && !(f.genre && sr.g !== f.genre) && !(f.lang && sr.l !== f.lang) && !titleIds.has(String(sr.id));
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
      appendFtsSection(body, q, '🔎 ' + tt('room.corpus.search.phrase', 'Точная фраза'), phraseItems, 'phrase-ready');
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
    appendFtsSection(body, q, '🔎 ' + tt('room.corpus.search.phrase', 'Точная фраза'), latePhrase, 'phrase-later');
    phraseShown = latePhrase.length; ftsCount += phraseShown;
  }
  if (wordItems.length) {
    const label = exactMode
      ? ('🔎 ' + tt('room.corpus.search.exactWords', 'Точная форма в тексте'))
      : ((phraseShown || out.multiToken) ? tt('room.corpus.search.words', 'Слова в тексте') : ('🔎 ' + tt('room.corpus.search.inText', 'В тексте')));
    appendFtsSection(body, q, label, wordItems, 'words');
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
  // FB-6 — clarify these are recent SEARCHES, not filter/sort tabs: a 🕘 history label (only over real
  // history; cold-start suggestions are «Популярные запросы», no clock). The glyph carries no data-i18n.
  const recLabel = recents.length ? ('🕘 ' + tt('room.corpus.search.recent', 'Недавние запросы')) : tt('room.corpus.search.try', 'Популярные запросы');
  host.appendChild(el('span', { class: 'corpus-recents-label', text: recLabel }));
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
    clr.addEventListener('click', () => {
      const prev = getRecentSearches();   // FB-17 — clearing history is reversible («Отменить»)
      clearRecentSearches(); paintRecents();
      try {
        roomToast(tt('room.corpus.search.historyCleared', 'История очищена'), tt('room.resume.undo', 'Отменить'),
          () => { try { localStorage.setItem(RECENTS_KEY, JSON.stringify(prev)); } catch (_) {} paintRecents(); });
      } catch (_) {}
    });
    host.appendChild(clr);
  }
}

// BRR-S14 — «ещё у автора»: jump to the author's full works list (the existing Период→Автор→Работа
// drill). Robust to a missing era on the card by scanning the author index across all eras.
function corpusNavToAuthor(era, name) {
  if (!name) return;
  Promise.all([loadCorpusIndex(), loadCorpusAuthors().catch(() => null)]).then(() => {
    const authors = (corpusIndex && corpusIndex.authors) || {};
    const eras = era ? [era] : Object.keys(authors);
    for (const e of eras) {
      const raw = (authors[e] || []).find((x) => x.name === name);
      if (!raw) continue;
      // Epic-6 — navigate to the COLLAPSED entry (union blocks + node display + QID) so the works view
      // gathers every name-variant by identity; fall back to the raw row for a name-only author.
      const collapsed = collapseEraAuthors(e);
      const entry = (raw.qid && AUTHOR_QID_RE.test(raw.qid) && collapsed.find((c) => c.qid === raw.qid)) || collapsed.find((c) => c.name === raw.name) || raw;
      corpusNavTo('works', e, entry);
      return;
    }
  }).catch(() => {});
}

// BRR-S11 — enter a scoped search: set the author/era scope, go to the L1 results surface, focus the
// input. The query (corpusFilter.q) persists across the drill, so an in-flight search re-runs scoped.
function corpusScopeTo(opts) {
  corpusFilter.scopeAuthor = (opts && opts.author) || '';
  corpusFilter.scopeAuthorQid = (opts && opts.authorQid) || '';   // Epic-6 — scope by identity (catches name-variants)
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
  const searchField = el('label', { class: 'room-field room-field-wide', attrs: { for: 'roomCorpusSearch' } });
  searchField.appendChild(el('span', { class: 'room-field-label', text: tt('room.corpus.search.placeholder', 'Поиск') }));
  const inputWrap = el('div', { class: 'corpus-search-wrap' });
  const input = el('input', { class: 'corpus-search-input', attrs: { id: 'roomCorpusSearch', name: 'room-corpus-search', type: 'search', enterkeyhint: 'search', placeholder: tt('room.corpus.search.placeholder', 'Поиск по корпусу…'), 'aria-label': tt('room.corpus.search.placeholder', 'Поиск') } });
  input.value = corpusFilter.q || '';
  corpusSearchInputEl = input;   // S12 — recents/suggestion chips set the query through this ref
  // BRR-S4 — inline ✕ clear (tabindex -1: it's a mouse/touch affordance; Escape clears via keyboard).
  const clearX = el('button', { class: 'corpus-search-clear', attrs: { type: 'button', tabindex: '-1', 'aria-label': tt('room.corpus.search.clearInput', 'Очистить') } });
  setRoomIcon(clearX, 'lp-icon-close', '✕');
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
  inputWrap.appendChild(roomIcon('lp-icon-search', '⌕', 'corpus-search-icon'));
  inputWrap.appendChild(input); inputWrap.appendChild(clearX);
  searchField.appendChild(inputWrap);
  // B3 keeps search permanently visible; facets move behind one mobile disclosure.
  // FB-6 — search history sits directly under the input (the universal position), ABOVE the filter facets,
  // so a row of recent-QUERY chips is never read as filter/sort tabs (the owner's «блок сортировки» misread).
  corpusRecentsEl = el('div', { class: 'corpus-recents' });
  bar.appendChild(corpusRecentsEl);
  paintRecents();
  corpusRecentsEl.hidden = corpusFilterActive();
  // FB-12 — group semantics so a screen reader announces «Фильтры корпуса», not a bare button stream.
  const chips = el('div', { class: 'corpus-facets', attrs: { role: 'group', 'aria-label': tt('room.corpus.facets.groupLabel', 'Фильтры корпуса') } });
  // BRR-S11 — when a scope is active, a removable «✕ в авторе/периоде: X» chip leads the row (honest,
  // explicit scope; clearing it returns to global search). The bar is rebuilt on home render, so the
  // chip appears/disappears with the scope.
  if (corpusFilter.scopeAuthor || corpusFilter.scopeEra) {
    const label = corpusFilter.scopeAuthor
      ? (tt('room.corpus.scope.inAuthor', 'в авторе') + ': ' + corpusFilter.scopeAuthor)
      : (tt('room.corpus.scope.inEra', 'в периоде') + ': ' + corpusEraTitle(corpusFilter.scopeEra));
    const sc = el('button', { class: 'corpus-facet-chip on corpus-scope-chip', attrs: { type: 'button', title: tt('room.corpus.scope.clear', 'Искать по всему корпусу') } });
    // FB-18 — the ✕ is a SEPARATE LTR span, the label dir-isolated: packing «✕ »+Hebrew into one RTL text
    // node placed the remove glyph ambiguously on scoped Hebrew-author searches (bidi). Now each is isolated.
    sc.appendChild(roomIcon('lp-icon-close', '✕', 'scope-x'));
    const scLbl = el('span', { class: 'scope-label', text: label });
    if (HEBREW_RE.test(label)) scLbl.setAttribute('dir', 'rtl');
    sc.appendChild(scLbl);
    sc.addEventListener('click', () => { corpusFilter.scopeAuthor = ''; corpusFilter.scopeAuthorQid = ''; corpusFilter.scopeEra = ''; renderCorpus(); });
    chips.appendChild(sc);
  }
  const ready = el('button', { class: 'corpus-facet-chip' + (corpusFilter.readyOnly ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.readyOnly), title: tt('room.corpus.facets.readyHint', 'С переводом — можно открыть и читать') } });
  appendRoomIconText(ready, 'lp-icon-success', '✓', tt('room.corpus.facets.ready', 'Готовые'));
  ready.addEventListener('click', () => { corpusFilter.readyOnly = !corpusFilter.readyOnly; ready.classList.toggle('on', corpusFilter.readyOnly); ready.setAttribute('aria-pressed', String(corpusFilter.readyOnly)); corpusRefreshL1Body(); });
  chips.appendChild(ready);
  // B7 — valid exact-count filter. One projection snapshot prevents per-card DB fan-out;
  // compact copy preserves the one-line 380px filter row without claiming comprehension.
  const readable = el('button', { class: 'corpus-facet-chip' + (corpusFilter.readableOnly ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.readableOnly), 'aria-label': tt('room.corpus.facets.readable', 'С валидным профилем слов'), title: tt('room.corpus.facets.readableHint', 'Тексты с валидным точным подсчётом; это не оценка понимания') } });
  appendRoomIconText(readable, 'lp-mark-room', '📖', tt('room.corpus.facets.readableShort', 'По профилю слов'));
  readable.addEventListener('click', async () => {
    corpusFilter.readableOnly = !corpusFilter.readableOnly;
    readable.classList.toggle('on', corpusFilter.readableOnly);
    readable.setAttribute('aria-pressed', String(corpusFilter.readableOnly));
    if (corpusFilter.readableOnly) { readable.disabled = true; try { await ensureReadableSet(); } catch (_) {} readable.disabled = false; }
    corpusRefreshL1Body();
  });
  chips.appendChild(readable);
  // BRR-P3/B7 — keep the primary chips (Готовые/По профилю слов) in the lean main row,
  // collapse the advanced filters (точная форма · аудио · проверено · жанр · язык) into a second row that
  // the gear toggles. Persisted; AUTO-expands when any advanced filter is active (active filters stay
  // visible); the gear shows «•» when advanced filters are on. Tames the @380px chip density (R4).
  const advWrap = el('div', { class: 'corpus-facets-advanced' });
  const advCount = (corpusFilter.exactForm ? 1 : 0) + (corpusFilter.hasAudio ? 1 : 0) + (corpusFilter.reviewed ? 1 : 0) + (corpusFilter.genre ? 1 : 0) + (corpusFilter.lang ? 1 : 0);
  const advActive = advCount > 0;
  let advExpanded = advActive || _filtersExpanded();
  // FB-11 — the gear is icon-only; give AT a real name + the active count, and replace the decorative «•»
  // with a numeric badge «⚙ 2» so sighted users see how many advanced filters hide here.
  const gearLabel = tt('room.corpus.facets.more', 'Ещё фильтры');
  const gear = el('button', { class: 'corpus-facet-chip corpus-facets-gear' + (advActive ? ' on' : ''), attrs: { type: 'button', 'aria-expanded': String(advExpanded), 'aria-controls': 'corpusFacetsAdv', title: gearLabel, 'aria-label': gearLabel + (advCount ? (', ' + tt('room.corpus.facets.activeCount', 'активно') + ': ' + advCount) : '') } });
  appendRoomIconText(gear, 'lp-icon-settings', '⚙', advCount ? String(advCount) : '');
  // The bar is NOT rebuilt when an advanced filter toggles (corpusRefreshL1Body re-renders only the body),
  // so the gear must sync from the LIVE corpusFilter — else its count/.on stay stale and FB-8 reads a stale
  // advActive and could collapse the row over a just-enabled filter (adversarial-caught). Returns isActive.
  const syncGear = () => {
    const n = (corpusFilter.exactForm ? 1 : 0) + (corpusFilter.hasAudio ? 1 : 0) + (corpusFilter.reviewed ? 1 : 0) + (corpusFilter.genre ? 1 : 0) + (corpusFilter.lang ? 1 : 0);
    appendRoomIconText(gear, 'lp-icon-settings', '⚙', n ? String(n) : '');
    gear.classList.toggle('on', n > 0);
    gear.setAttribute('aria-label', gearLabel + (n ? (', ' + tt('room.corpus.facets.activeCount', 'активно') + ': ' + n) : ''));
    return n > 0;
  };
  gear.addEventListener('click', () => {
    // FB-8 — active advanced filters must never be hidden behind the gear: while any is on, the row stays
    // open (collapsing it would hide an applied filter → results look wrong with no visible cause).
    const active = syncGear();
    advExpanded = active ? true : !advExpanded;
    advWrap.hidden = !advExpanded;
    gear.setAttribute('aria-expanded', String(advExpanded));
    if (!active) _setFiltersExpanded(advExpanded);
  });
  chips.appendChild(gear);
  advWrap.id = 'corpusFacetsAdv';
  advWrap.setAttribute('role', 'group');
  advWrap.setAttribute('aria-label', tt('room.corpus.facets.advGroupLabel', 'Дополнительные фильтры'));
  // BRR-S9 — «🔤 Точная форма»: default search is lemma-tolerant («по корню» — all forms of the root);
  // ON restricts the in-text «слова» group to the LITERAL consonantal form (Reverso-class exact toggle).
  const exactChip = el('button', { class: 'corpus-facet-chip' + (corpusFilter.exactForm ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter.exactForm), title: tt('room.corpus.search.exactFormHint', 'Только точная форма слова, без других форм корня') } });
  exactChip.textContent = '🔤 ' + tt('room.corpus.search.exactForm', 'Точная форма');
  exactChip.addEventListener('click', () => { corpusFilter.exactForm = !corpusFilter.exactForm; exactChip.classList.toggle('on', corpusFilter.exactForm); exactChip.setAttribute('aria-pressed', String(corpusFilter.exactForm)); corpusRefreshL1Body(); syncGear(); });
  advWrap.appendChild(exactChip);
  // BRR-S16 — provenance filters (data-feasible from ready cards; imply readable works). A simple toggle
  // chip each: 🔊 has-audio, ✍ human-reviewed. (Length is covered by the L3 length-sort; niqqud-ratio
  // would need a new corpus-search field — deferred, see the impl doc.)
  const mkProvChip = (key, symbol, emoji, i18nKey, fb) => {
    const c = el('button', { class: 'corpus-facet-chip' + (corpusFilter[key] ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusFilter[key]) } });
    appendRoomIconText(c, symbol, emoji, tt(i18nKey, fb));
    c.addEventListener('click', () => { corpusFilter[key] = !corpusFilter[key]; c.classList.toggle('on', corpusFilter[key]); c.setAttribute('aria-pressed', String(corpusFilter[key])); corpusRefreshL1Body(); syncGear(); });
    return c;
  };
  advWrap.appendChild(mkProvChip('hasAudio', 'lp-icon-audio', '🔊', 'room.corpus.facets.hasAudio', 'С аудио'));
  advWrap.appendChild(mkProvChip('reviewed', 'lp-icon-note', '✍', 'room.corpus.facets.reviewed', 'Проверено'));
  advWrap.appendChild(buildFacetSelect('genre', 'room.corpus.facets.genre', ((corpusRoot && corpusRoot.counts) || {}).by_genre || {}, corpusGenreLabel, syncGear));
  advWrap.appendChild(buildFacetSelect('lang', 'room.corpus.facets.lang', ((corpusRoot && corpusRoot.counts) || {}).by_lang || {}, corpusLangLabel, syncGear));
  advWrap.hidden = !advExpanded;
  // The clear chip is ALWAYS in the bar (the bar is not rebuilt on filter change to keep the
  // input focused) — its visibility is toggled by corpusRefreshL1Body.
  const clear = el('button', { class: 'corpus-facet-chip clear', attrs: { type: 'button' } });
  clear.textContent = '✕ ' + tt('room.corpus.facets.clear', 'Сбросить');
  clear.hidden = !corpusFilterActive();
  clear.addEventListener('click', () => { corpusFilter = { q: '', genre: '', lang: '', readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false, scopeAuthor: '', scopeAuthorQid: '', scopeEra: '' }; corpusNavTo('home'); });
  corpusClearChip = clear;
  chips.appendChild(clear);
  bar.appendChild(chips);
  bar.appendChild(advWrap);
  const sortField = el('label', { class: 'room-field corpus-browse-sort', attrs: { for: 'roomCorpusSort' } });
  sortField.appendChild(el('span', { class: 'room-field-label', text: tt('room.corpus.sort.label', 'Сортировка') }));
  const sortSelect = el('select', { class: 'mytexts-select', attrs: { id: 'roomCorpusSort', name: 'room-corpus-sort', 'aria-label': tt('room.corpus.sort.label', 'Сортировка') } });
  for (const [mode,key,fb] of [['ready','room.corpus.sort.readyFirst','Сначала готовые'],['familiar_desc','room.compass.sortFamiliar','Сначала достоверно знакомые'],['opened','room.mytexts.sortOpened','Последние открытые'],['alpha','room.corpus.sort.alpha','По алфавиту'],['length','room.corpus.sort.length','По длине']]) {
    sortSelect.appendChild(el('option', { text: tt(key,fb), attrs: { value: mode } }));
  }
  sortSelect.value=corpusL1Sort;
  sortSelect.addEventListener('change',async()=>{
    const nextSort=sortSelect.value;
    if(nextSort==='familiar_desc'&&!await familiaritySortProfileAvailable()){sortSelect.value=corpusL1Sort;return;}
    if(nextSort==='familiar_desc'){
      let scores=null;try{scores=await ensureBenFamiliarityScores();}catch(_){sortSelect.value=corpusL1Sort;roomToast(tt('room.compass.corpusUnavailable','Подбор по знакомости временно недоступен'));return;}
      if(!reliableFamiliarityCount(scores&&scores.values())){sortSelect.value=corpusL1Sort;explainNoReliableFamiliaritySort();return;}
    }
    corpusL1Sort=nextSort;
    if(corpusL1Sort==='opened')ensurePersonalSets().then(()=>corpusRefreshL1Body()).catch(()=>corpusRefreshL1Body());
    else corpusRefreshL1Body();
  });
  sortField.appendChild(sortSelect);
  const chrome = corpusFilterChrome('roomBenYehuda', searchField, bar, sortField, () => {
    const labels=[];
    if(corpusFilter.readyOnly)labels.push(tt('room.corpus.facets.ready','Готовые'));
    if(corpusFilter.readableOnly)labels.push(tt('room.corpus.facets.readableShort','По профилю слов'));
    if(corpusFilter.exactForm)labels.push(tt('room.corpus.search.exactForm','Точная форма'));
    if(corpusFilter.hasAudio)labels.push(tt('room.corpus.facets.hasAudio','С аудио'));
    if(corpusFilter.reviewed)labels.push(tt('room.corpus.facets.reviewed','Проверено'));
    if(corpusFilter.genre)labels.push(corpusGenreLabel(corpusFilter.genre)||corpusFilter.genre);
    if(corpusFilter.lang)labels.push(corpusLangLabel(corpusFilter.lang)||corpusFilter.lang);
    if(corpusFilter.smart){const smart=CORPUS_SMART_CHIPS.find((item)=>item[0]===corpusFilter.smart);labels.push(smart?tt(smart[1],smart[2]):corpusFilter.smart);}
    if(corpusFilter.scopeAuthor)labels.push(tt('room.corpus.scope.inAuthor','в авторе')+': '+corpusFilter.scopeAuthor);
    else if(corpusFilter.scopeEra)labels.push(tt('room.corpus.scope.inEra','в периоде')+': '+corpusEraTitle(corpusFilter.scopeEra));
    return {count:labels.length,labels};
  });
  corpusFilterChromeRefresh=chrome.refresh;
  return chrome.node;
}

// A facet <select> (native = compact + accessible on mobile); options are the histogram keys
// sorted by count desc, each with its count. The label gets an `on` class when a value is set.
function buildFacetSelect(key, labelKey, counts, labelFn, onChange) {
  const wrap = el('label', { class: 'corpus-facet-select' + (corpusFilter[key] ? ' on' : '') });
  const facetId = 'roomCorpusFacet' + String(key || '').replace(/[^a-z0-9]+/gi, '-');
  const sel = el('select', { attrs: { id: facetId, name: 'room-corpus-facet-' + String(key || ''), 'aria-label': tt(labelKey) } });
  sel.appendChild(el('option', { text: tt(labelKey), attrs: { value: '' } }));
  Object.entries(counts).filter(([k]) => k && k !== '(none)').sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    sel.appendChild(el('option', { text: (labelFn(k) || k) + ' (' + n + ')', attrs: { value: k } }));
  });
  sel.value = corpusFilter[key] || '';
  sel.addEventListener('change', () => { corpusFilter[key] = sel.value; wrap.classList.toggle('on', !!sel.value); corpusRefreshL1Body(); if (onChange) onChange(); });
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
async function renderCorpusAuthors(era, token) {
  const main = $('roomContent');
  if (!main || token !== corpusRenderToken) return;
  main.innerHTML = '';
  // Epic-6 — the QID-collapse needs the authority sidecar (display names + merge). Brief loading state
  // on first author-list open (cached after); degrade to raw index names if the sidecar fetch fails.
  if (!corpusAuthorsMap) { main.appendChild(stateBoxNode('room.state.loading', '⏳')); try { window.applyI18n && window.applyI18n(); } catch (_) {} await loadCorpusAuthors().catch(() => {}); if (token !== corpusRenderToken) return; main.innerHTML = ''; }
  const wrap = el('div', { class: 'corpus-nav' });
  wrap.appendChild(corpusCrumb([
    { label: tt('room.tabs.corpus', 'Корпус'), onClick: () => corpusNavTo('home') },
    { label: corpusEraTitle(era) },
  ]));
  wrap.appendChild(buildScopeSearchRow({ era }));   // BRR-S11 — «🔍 искать в периоде»
  const base = collapseEraAuthors(era);   // Epic-6 — one entry per human (QID-collapsed, display from node)
  const alpha = corpusAuthorSort === 'alpha';
  // graduated re-sorts by the COLLAPSED totals (the merge changed each entry's ready/works, so the
  // producer's pre-collapse order would be slightly off) — ready desc, then works desc, then name.
  const authors = alpha
    ? base.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'))
    : base.slice().sort((a, b) => (b.ready - a.ready) || (b.works - a.works) || String(a.name).localeCompare(String(b.name), 'he'));

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
  const listSection = el('section', { class: 'corpus-author-section' });
  listSection.appendChild(head);
  wrap.appendChild(listSection);

  const list = el('div', { class: 'corpus-author-list' });
  if (alpha) {
    const present = new Set(authors.map((a) => hebFirstLetter(a.name)).filter(Boolean));
    const jumpBar = buildHebrewJumpBar(list, present);
    listSection.appendChild(jumpBar);
    listSection.appendChild(list);
    for (const a of authors) list.appendChild(renderAuthorRow(era, a)); // all rendered (anchors)
    attachRoomLongListDisclosure(listSection, head, [jumpBar, list], 'ben:authors:' + era + ':alpha');
    main.appendChild(wrap);
    loadCorpusAuthors().then(() => { if (token === corpusRenderToken) decorateAuthorRows(list); }).catch(() => {});   // Epic-6 — life-years
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    return;
  }
  // graduated → incremental reveal
  const moreWrap = el('div', { class: 'corpus-more' });
  listSection.appendChild(list);
  listSection.appendChild(moreWrap);
  const slice = () => {
    const upTo = Math.min(authors.length, corpusReveal + CORPUS_PAGE);
    for (let i = corpusReveal; i < upTo; i++) list.appendChild(renderAuthorRow(era, authors[i]));
    corpusReveal = upTo;
    if (corpusAuthorsMap) decorateAuthorRows(list);   // Epic-6 — date the just-revealed rows
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
  attachRoomLongListDisclosure(listSection, head, [list, moreWrap], 'ben:authors:' + era + ':graduated');
  main.appendChild(wrap);
  loadCorpusAuthors().then(() => { if (token === corpusRenderToken) decorateAuthorRows(list); }).catch(() => {});   // Epic-6 — life-years
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
}

function renderAuthorRow(era, a) {
  const row = el('div', { class: 'corpus-author-row', attrs: { role: 'button', tabindex: '0' } });
  const L = hebFirstLetter(a.name);
  if (L) row.setAttribute('data-letter', L);
  if (a.qid) row.setAttribute('data-qid', a.qid);   // Epic-6 — anchor for the life-years decorate pass
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
  // Epic-6 — author-landing header (era · life-years · QID · counts · curated intro slot). Async-filled
  // from the authority sidecar; self-omits when the author has no resolvable QID node (honest).
  const authorHeaderSlot = el('div', { class: 'corpus-author-header-slot' });
  wrap.appendChild(authorHeaderSlot);
  loadCorpusAuthors().then((map) => {
    if (token !== corpusRenderToken) return;
    const node = author.qid ? map.get(author.qid) : null;
    if (node) authorHeaderSlot.appendChild(buildAuthorHeader(node, author));
  }).catch(() => {});
  wrap.appendChild(buildScopeSearchRow({ author: author.name, era, authorQid: author.qid }));   // BRR-S11 — «🔍 искать у автора» (by QID)
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
    // Epic-6 — a collapsed author has a QID → gather ALL its works by IDENTITY (incl. co-authored
    // «A; B» rows under a different name), not by the single clicked name. Name-only authors: by name.
    works = [].concat(...lists).filter((w) => author.qid ? (w.author_qid === author.qid) : ((w.author || '(без автора)') === author.name));
  } catch (e) {
    if (token === corpusRenderToken) { body.innerHTML = ''; body.appendChild(stateBoxNode('room.state.error', '⚠️')); }
    return;
  }
  if (token !== corpusRenderToken) return;
  if (corpusWorkSort === 'familiar_desc') {
    try { await ensureBenFamiliarityScores(); } catch (_) {}
    if (token !== corpusRenderToken) return;
  }
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
  if (mode === 'familiar_desc') return (a, b) => {
    const af=_benFamiliarityScores&&_benFamiliarityScores.get(String(a.id)),bf=_benFamiliarityScores&&_benFamiliarityScores.get(String(b.id));
    const ar=!!(af&&af.status==='AVAILABLE'&&af.rank_eligible),br=!!(bf&&bf.status==='AVAILABLE'&&bf.rank_eligible);
    if(ar!==br)return ar?-1:1;
    if(ar&&br){const delta=Number(bf.recorded_familiar_pct_lower_bound||0)-Number(af.recorded_familiar_pct_lower_bound||0);if(delta)return delta;}
    return String(a.id).localeCompare(String(b.id));
  };
  if (mode === 'alpha') return (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
  if (mode === 'length') return (a, b) => ((b.segments || 0) - (a.segments || 0)) || String(a.id).localeCompare(String(b.id));
  return (a, b) => String(a.id).localeCompare(String(b.id));
}
// Sort segmented control (reuses the L2 .corpus-sort pattern) + a genre <select> built from the
// genres present in THIS author's works. Both re-paint in place.
function buildWorkControls(works, onChange) {
  const bar = el('div', { class: 'corpus-work-controls' });
  const sortWrap = el('div', { class: 'corpus-sort' });
  [['graded', 'room.corpus.sort.graded', 'По порядку'], ['familiar_desc', 'room.compass.sortFamiliar', 'Сначала достоверно знакомые'], ['alpha', 'room.corpus.sort.alpha', 'По алфавиту'], ['length', 'room.corpus.sort.length', 'По длине']]
    .forEach(([mode, key, fb]) => {
      const b = el('button', { class: 'corpus-sort-btn' + (corpusWorkSort === mode ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(corpusWorkSort === mode) } });
      b.textContent = tt(key, fb);
      b.addEventListener('click', async () => { if (corpusWorkSort === mode) return; if(mode==='familiar_desc'&&!await familiaritySortProfileAvailable())return; corpusWorkSort = mode; sortWrap.querySelectorAll('.corpus-sort-btn').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); if(mode==='familiar_desc')ensureBenFamiliarityScores().then(onChange).catch(onChange);else onChange(); });
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
  // W1-d — honest roadmap framing under the «перевод позже» section: explain WHY (batched rollout) +
  // the offline-first moat, so a not-yet-ready work doesn't read as broken (R5 framing, R9 honest).
  const note = !openable ? el('div', { class: 'corpus-section-note', i18n: 'room.corpus.laterRoadmap', text: tt('room.corpus.laterRoadmap', 'Перевод и огласовка добавляются партиями — скоро дойдут и сюда. Оригинал уже в каталоге и читается офлайн.') }) : null;
  if (note) sec.appendChild(note);
  const list = el('div', { class: 'corpus-work-list' });
  const moreWrap = el('div', { class: 'corpus-more' });
  sec.appendChild(list);
  sec.appendChild(moreWrap);
  let activeOffset = 0;
  const paintPage = (focusFirst) => {
    if (activeOffset >= works.length && activeOffset > 0) activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE);
    const upTo = Math.min(works.length, activeOffset + ROOM_BROWSE_PAGE);
    list.replaceChildren();
    for (let i = activeOffset; i < upTo; i++) list.appendChild(renderCorpusWorkRow(works[i], openable, { showListBtn: true, materialKind: openable ? 'ready' : 'catalog' }));
    moreWrap.replaceChildren();
    if (activeOffset > 0 || upTo < works.length) {
      const previous = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' }, text: tt('room.corpus.lists.previous', 'Назад') });
      previous.disabled = activeOffset <= 0;
      previous.addEventListener('click', () => { activeOffset = Math.max(0, activeOffset - ROOM_BROWSE_PAGE); paintPage(true); });
      const page = el('span', { class: 'learning-journey-page-label', text: tt('room.corpus.lists.page', 'Страница {n}').replace('{n}', String(Math.floor(activeOffset / ROOM_BROWSE_PAGE) + 1)) });
      const next = el('button', { class: 'corpus-more-btn', attrs: { type: 'button' }, text: tt('room.corpus.lists.next', 'Дальше') });
      next.disabled = upTo >= works.length;
      next.addEventListener('click', () => { activeOffset += ROOM_BROWSE_PAGE; paintPage(true); });
      moreWrap.appendChild(previous); moreWrap.appendChild(page); moreWrap.appendChild(next);
    }
    try { window.applyI18n && window.applyI18n(); } catch (_) {}
    if (focusFirst) list.querySelector('a,button')?.focus();
  };
  paintPage(false);
  attachRoomLongListDisclosure(sec, head, [note, list, moreWrap].filter(Boolean), 'ben:works:' + titleKey);
  return sec;
}

// A dense work ROW (not a card — scannable at scale, benyehuda/Sefaria/Standard Ebooks).
// Baked → ▶ openable (served-on-open). Unprocessed → ⏳ disabled, honest «перевод позже»
// (R8 — visible in the catalog, never dead-ended, never posing as readable).
function renderCorpusWorkRow(card, openable, opts) {
  const row = el('article', { class: 'corpus-work-row room-text-row room-material-row' + (openable ? '' : ' is-later'), attrs: { 'data-material-kind': String(opts && opts.materialKind || (openable ? 'ready' : 'catalog')), 'data-work-id': String(card && card.id != null ? card.id : ''), 'data-continuity-key': continuityKey('benyehuda', card && card.id) } });
  const col = el('div', { class: 'corpus-work-col' });
  // BRR-S2 — in a search context (opts.openOpts.ftsQuery — the same query threaded to the open handler)
  // the matched tokens are <mark>-highlighted in the title + author (niqqud-insensitive, word-level via
  // markSegments); otherwise plain text.
  const ftsQ = (opts && opts.openOpts && opts.openOpts.ftsQuery) || '';
  const qToks = ftsQ ? ftsQueryTokens(ftsQ) : null;
  const _tp = corpusTitleParts(card.title || '—');   // PC-4 — clean the «[נוסח …]» off the search/author-row headline too
  const title = el('bdi', { class: 'corpus-work-title' });
  if (qToks && qToks.length) appendMarkedHebrew(title, _tp.title, qToks); else title.textContent = _tp.title;
  if (card.title) title.title = card.title;
  markRoomTextLanguage(title, _tp.title);
  let openLink = null;
  if (openable) {
    openLink = el('a', { class: 'room-text-title-link corpus-work-open', attrs: { href: deepLinkForCorpusWork(card.id), 'data-continuity-action': 'open' } });
    openLink.appendChild(title);
    openLink.appendChild(el('span', { class: 'room-text-primary', text: tt('room.work.open', 'Читать') }));
    col.appendChild(openLink);
  } else {
    col.appendChild(title);
  }
  if (_tp.note) { const _n = el('span', { class: 'corpus-work-note', text: _tp.note }); if (HEBREW_RE.test(_tp.note)) _n.setAttribute('dir', 'rtl'); col.appendChild(_n); }
  // In cross-author contexts (global results) show the author under the title. BRR-S14 — the author is a
  // tappable «ещё у автора» link → the author's full works drill (stopPropagation so it never opens the work).
  if (opts && opts.showAuthor && card.author) {
    const a = el('button', { class: 'corpus-work-author corpus-work-author-link', attrs: { type: 'button', title: tt('room.corpus.search.moreByAuthor', 'Ещё у автора') } });
    if (qToks && qToks.length) appendMarkedHebrew(a, card.author, qToks); else a.textContent = card.author;
    if (HEBREW_RE.test(card.author)) a.setAttribute('dir', 'rtl');
    const goAuthor = (ev) => { ev.preventDefault(); corpusNavToAuthor(card.era, card.author); };
    a.addEventListener('click', goAuthor);
    col.appendChild(a);
  }
  const meta = el('div', { class: 'corpus-work-meta' });
  const len = corpusLengthLabel(card);
  if (!opts || !opts.compact) {
    if (len) meta.appendChild(el('span', { class: 'corpus-work-len', text: len }));
    if (card.genre) meta.appendChild(el('span', { class: 'corpus-work-genre', text: corpusGenreLabel(card.genre) }));
  }
  if (openable && (!opts || !opts.compact)) {
    meta.appendChild(corpusProvBadge('rs', card.review_status));
    meta.appendChild(corpusProvBadge('audio', card.audio_status));
  } else {
    if (!openable) meta.appendChild(el('span', { class: 'prov-badge later', i18n: 'room.corpus.later', text: tt('room.corpus.later') }));
  }
  if (meta.children.length) col.appendChild(meta);
  // B5 continuity / CLS: result rows receive the same eager empty Learning Compass
  // slot as rail cards. The derived signals remain lazy, but their arrival can no
  // longer move the restored work (or every row below it) after Reader closes.
  if (openable) col.appendChild(el('div', { class: 'work-card-difficulty learning-compass' }));
  row.appendChild(col);
  // BRR — «➕ В список» on the work row (search results + author drill). Offered for non-ready works too:
  // the reading list honestly stores them as r:false (← openable) and auto-upgrades them once they ship.
  // Icon-only to stay compact at 380px; stopPropagation so it never opens the work.
  if (opts && opts.showListBtn && card.id != null) {
    const listBtn = el('button', { class: 'corpus-work-listbtn room-vf1-focus', attrs: { type: 'button', title: tt('room.corpus.lists.add', 'В список чтения'), 'aria-label': tt('room.corpus.lists.add', 'В список чтения') } });
    listBtn.__iconOnly = true;
    updateListBtn(listBtn, card);
    listBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openListPicker(card, listBtn, openable); });
    row.appendChild(listBtn);
  }
  const cta = openable
    ? roomIcon('lp-icon-chevron-right', '›', 'corpus-work-cta room-icon-directional')
    : el('span', { class: 'corpus-work-cta', text: '⏳', attrs: { 'aria-hidden': 'true' } });
  row.appendChild(cta);
  if (openable) {
    const open = () => openCorpusWork(card, (opts && opts.openOpts) || (row.getAttribute('data-state') === 'reading' ? { resume: true } : undefined));   // BRR-P2-005 — FTS: open at matched row
    openLink.addEventListener('click', (event) => { event.preventDefault(); open(); });
  } else {
    row.setAttribute('aria-disabled', 'true');
  }
  // BRR-S1 — lazy bilingual snippet of the matched line (ready hits in a search context only).
  if (openable && ftsQ && card.file) observeRowSnippet(row, card, ftsQ);
  // B7 — exact recorded-familiarity signal on ready result rows. Result rows are the
  // showAuthor=true (cross-author) context.
  if (openable && card.id != null) observeCardCoverage(row, card);
  return row;
}

function wireChrome() {
  hydrateRoomIcons(document);
  const lang = $('roomLang');
  if (lang) {
    try { lang.value = (window.appGetLocale && window.appGetLocale()) || 'ru'; } catch (_) {}
    lang.addEventListener('change', (e) => {
      try { window.appSetLocale && window.appSetLocale(e.target.value); } catch (_) {}
      requestAnimationFrame(() => {
        repaintRoomDisclosureLocale();
        try { _paintDueCTA(); } catch (_) {}
      });
    });
  }
  TRACKS.forEach((t) => {
    const btn = $(TAB_ID[t]);
    if (btn) btn.addEventListener('click', () => { setActiveTrack(t); if (t === 'corpus') roomPushPresentationState(); });
  });
  // Theme toggle (light/dark/auto) — premium parity with Studio.
  const themeBtn = $('roomTheme');
  if (themeBtn) themeBtn.addEventListener('click', cycleTheme);
  applyTheme(getTheme());   // set icon/title (body class already applied no-flash pre-paint)
  // i18n's DOMContentLoaded pass is registered before this module and restores
  // the generic translated label. Re-apply once afterward so the native name
  // retains the translated current mode (for example, "Theme: dark").
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyTheme(getTheme()), { once: true });
  // Footer «О Зале» modal: open from the link + version label; close on backdrop/✕/Esc.
  const aboutLink = $('roomAboutLink');
  if (aboutLink) aboutLink.addEventListener('click', (e) => { e.preventDefault(); openRoomAbout(); });
  const verEl = $('roomFooterVersion');
  if (verEl) verEl.addEventListener('click', openRoomAbout);
  const aboutModal = $('roomAbout');
  if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') === '1') closeRoomAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRoomAbout(); });
  const diagnosticExport = $('roomDiagnosticExport');
  if (diagnosticExport) diagnosticExport.addEventListener('click', exportRoomDiagnostics);
  addEventListener('popstate', (event) => {
    if (!event.state || event.state.v !== 1) return;
    _roomRestoringHistory = true;
    Promise.resolve(roomApplyHistoryState(event.state)).catch(() => {
      _roomHistoryFallbackNotice = true;
      return roomApplyHistoryState({ surface: 'hub', corpus: 'benyehuda' });
    }).finally(() => { _roomRestoringHistory = false; });
  });
  addEventListener('pagehide', () => {
    try { roomStorePresentation(roomCurrentPresentationState()); } catch (_) {}
  });
  roomCloudInit();   // CLG-P3.2 — «☁ Синхронизация» (dormant without login)
  groupAccessInit(); // passwordless MEMBER invite/login + durable role help
  roomExplainInit(); // CLG-P6.2 — модал «Объяснить предложение» (dormant без сессии)
  roomMentorInit();  // CLG-P9 — «Дом наставника» (открытие только тапом/deep-link — R17 §2.3)
  _roomStudioNavInit();   // Room↔Studio cross-nav: graceful DB close before hard navigation
  // Embedded reader chrome.
  const back = $('readerBack');
  if (back) back.addEventListener('click', closeReader);
  const dueCta = document.getElementById('roomDueCta');   // D2 — cross-text «due today» entry
  if (dueCta) dueCta.addEventListener('click', () => { try { startDueReview(); } catch (_) {} });
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
    // P9 — дом наставника строит блоки в JS (host.t на рендере) → refresh на смене языка
    try { const mv = $('roomMentorView'); if (_mentorMounted && mv && !mv.hidden) window.MentorHome.refresh(); } catch (_) {}
  });
}

// STUDIO-SRS-TRAINER-REPLACEMENT — consume an identifier-only Studio command once.
// replaceState preserves the Studio→Room history entry while removing the command before
// opening the sheet, so close→refresh cannot auto-open or append a review.
function consumeDueReviewHandoff() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('review') !== 'due' || url.searchParams.get('from') !== 'studio') return false;
    url.searchParams.delete('review');
    url.searchParams.delete('from');
    const next = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
    history.replaceState(history.state, '', next);
    return true;
  } catch (_) { return false; }
}

async function boot() {
  const initialPresentation = roomDecodeInitialPresentation();
  loadReaderCfg();   // BRR-P1-006 — restore persisted scaffolding modes before any reader render
  loadRoomTableWidths();   // ширины колонок Зала — до первого рендера таблицы
  wireChrome();
  wireRoomConnection();
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  registerRoomServiceWorker();   // PWA update toast «Обновить» (works even if opened directly)
  loadRoomVersion();             // footer + «О Зале» version from /api/client-config
  maybeStartWkDebug();           // BRR-P1-008b ?wkdebug=1 on-device karaoke diagnostic
  try {
    await localDb.initLocalDB();
    if (!navigator.onLine) setRoomConnectionState(roomB6.nextConnectionState('online', 'offline', { localReady: roomOfflineHasLocalTruth() }));
    // P0-1 v2: a follower WITH a live proxy route is fully functional (queries go to the owner
    // tab's single OPFS connection) — only a proxy-less follower still dead-ends on «БД занята».
    if (localDb.isFollower && localDb.isFollower() && !(localDb.isProxy && localDb.isProxy())) {
      if (validateRequested()) { showValidationOverlay(VALIDATE_DBBUSY_MSG); return; }
      showState('room.state.dbBusy', '📑'); return;
    }
    // R11 honesty guard (owner iPhone repro 2026-07-05): this boot landed on a DIFFERENT storage
    // backend than last time — the real library is very likely in the OTHER (unrelated) backend,
    // not deleted. Warn loudly so an empty-looking corpus is never mistaken for a wiped profile.
    try {
      if (typeof localDb.vfsBackendChanged === 'function' && localDb.vfsBackendChanged()) {
        roomToast('⚠ Хранилище браузера временно переключилось в резервный режим — «Мои тексты» может выглядеть пустым, но ничего не удалено. Перезагрузите страницу; сообщите разработчику, если повторится.', null, null, 60000);
      }
    } catch (_) {}
    await autoImportCanon();   // publish the shipped canon shelf on first visit (idempotent)
    await loadData();
    await loadCorpusCatalog(); // BRR-P0-007 Проход-3 — catalog-driven "Корпус" track (served-on-open)
    await loadGroupCorpora();  // authenticated; silently absent for signed-out/non-members
    // Default to the Корпус (Reading Room) track when its catalog is available — the bilingual
    // canon with morphology-on-tap now leads. Fall back to the on-ramp tracks only if the corpus
    // root didn't load or is empty (mirrors the tabCorpus un-hide condition in loadCorpusCatalog).
    if (initialPresentation) {
      roomApplyStateFields(initialPresentation);
    } else if (corpusRoot && corpusRoot.counts && corpusRoot.counts.works > 0) {
      activeTrack = 'corpus';
    } else if (!(shelvesByTrack.accessible || []).length && (shelvesByTrack.literary || []).length) {
      activeTrack = 'literary';
    }
    _roomRestoringHistory = !!initialPresentation;
    await setActiveTrack(activeTrack);
    if (initialPresentation && initialPresentation.surface === 'reader' && initialPresentation.anchor && initialPresentation.anchor.itemId) {
      await openReader(initialPresentation.anchor.itemId, '', { presentationRestore: true, resume: true });
    }
    _roomRestoringHistory = false;
    _roomPresentationReady = true;
    // Every in-app entry must have a versioned state before the first Reader
    // push. Otherwise Back from a freshly loaded #room route lands on a null
    // state and cannot restore the catalog surface.
    roomCommitPresentation('replace');
    if (_roomHistoryFallbackNotice) roomToast(tt('room.history.parentFallback', 'Точное место больше недоступно — открыт ближайший раздел'));
    const dueReviewHandoff = consumeDueReviewHandoff();
    // Protected group-corpus deep link. The URL carries identifiers only; both
    // catalog and bundle requests still require a live session + ACTIVE group
    // membership. Unknown/inaccessible ids deliberately collapse to one generic
    // message so corpus membership cannot be enumerated.
    try {
      const qp = new URLSearchParams(location.search);
      const groupCorpusId = qp.get('group_corpus');
      const groupWorkId = qp.get('group_work');
      if (groupCorpusId && groupWorkId) {
        const allowed = groupCorpora.some((c) => String(c.corpus_id) === String(groupCorpusId));
        if (!allowed) roomToast(tt('room.groupCorpus.linkUnavailable', 'Ссылка недоступна: войдите как участник учебной группы'));
        else {
          activeTrack = 'corpus'; setActiveTrack(activeTrack);
          corpusNavToCorpus('group:' + groupCorpusId);
          const groupCatalog = await ensureGroupCatalog(groupCorpusId);
          const groupWork = groupCatalog.works.find((w) => String(w.work_id) === String(groupWorkId));
          if (groupWork) await openGroupCorpusWork(groupCorpusId, groupWork, { resume:true });
          else roomToast(tt('room.groupCorpus.linkUnavailable', 'Ссылка недоступна: войдите как участник учебной группы'));
        }
      }
    } catch (_) {}
    // Semantic title links for baked works remain useful in a new tab/no warm Room: resolve the
    // stable catalog id only after the catalog and LocalDb are ready, then use the canonical
    // served-on-open path. No alternate progress or import truth is introduced.
    try {
      const bakedWorkId = new URLSearchParams(location.search).get('corpus_work');
      if (bakedWorkId) {
        const target = ((corpusIndex && corpusIndex.ready) || []).find((card) => String(card.id) === String(bakedWorkId));
        if (target) await openCorpusWork(target, { resume: true });
        else roomToast(tt('room.work.unavailable', 'Текст пока недоступен'));
      }
    } catch (_) {}
    try { refreshDueBadge(); } catch (_) {}   // D2 — surface the «🔁 К повторению» home CTA on first load
    if (dueReviewHandoff) await startDueReview();
    refreshAgentProposalsChip();   // AA4-4b — pending agent proposals (quiet-fail without a session)
    backfillZombieMarkSeeds().then(() => r4HealDrain());   // R3.1 seeds → R4a heals (fire-and-forget chain)
    roomCloudAutoSync();   // CLG-P3.2 — fire-and-forget; no-op (single 401) without a live session
    maybeRunValidation();   // BRR-P1-007 §7: ?validate=1 runs on-device real-profile validation
    // Studio↔Room compat Ф1 — deep-link «Открыть в Зале»: ?open=<text_key> resolves a locally
    // MATERIALIZED text (own or corpus) and opens the Room reader. Unknown key → stay on home
    // (honest no-op; the Studio only links texts it just listed from the same OPFS).
    try {
      const openKey = new URLSearchParams(location.search).get('open');
      if (openKey) {
        const rows = await localDb.dbQuery('SELECT id, title FROM texts WHERE text_key = ? LIMIT 1', [String(openKey)]);
        if (rows && rows[0]) openReader(rows[0].id, rows[0].title, { resume: true });
      }
      // CLG-P8.5 — reading-handoff из Mini App: ?handoff=<opaque одноразовый токен> → redeem
      // (сервер отдаёт ТОЛЬКО указатели) → открыть текст на предложении. URL чистится СРАЗУ
      // (токен не должен жить в history); все отказы — честный тост, не тихий no-op (R11).
      const handoffTok = new URLSearchParams(location.search).get('handoff');
      if (handoffTok) {
        try { history.replaceState(null, '', location.pathname); } catch (_) {}
        let hj = null;
        try { hj = await (await fetch('/api/reading-handoffs/redeem?t=' + encodeURIComponent(handoffTok))).json(); } catch (_) {}
        if (hj && hj.ok) {
          const hAction = String(hj.action || 'open_reader');
          // Local-first resolver: a materialized text (personal OR an already-imported
          // corpus work) opens directly by text_key on either anchor branch.
          const openLocal = async () => {
            if (!hj.text_key) return false;
            const hrows = await localDb.dbQuery('SELECT id, title FROM texts WHERE text_key = ? LIMIT 1', [String(hj.text_key)]);
            if (hrows && hrows[0]) { openReader(hrows[0].id, hrows[0].title, { scrollToOrderIndex: Number(hj.order_index) }); return true; }
            return false;
          };
          if (hAction === 'open_review') {
            // AA4-4b — agent-minted «открой мне повторение»: same entry as the due-CTA.
            // Guarded + честный тост: startDueReview would show a visibly EMPTY sheet if
            // ReaderMorph is missing (partial SW cache), and the outer catch is silent.
            if (window.ReaderMorph && typeof localDb.getDueWithSource === 'function') {
              try { await startDueReview(); }
              catch (_) { roomToast(tt('room.handoff.reviewFailed', 'Не получилось открыть повторение — обновите страницу и нажмите «🔁 К повторению».')); }
            } else {
              roomToast(tt('room.handoff.reviewFailed', 'Не получилось открыть повторение — обновите страницу и нажмите «🔁 К повторению».'));
            }
          } else if (hj.text_key && hAction === 'open_corpus') {
            // AA3-3c — corpus handoff (agent-minted, owner-clicked): resolve the ready
            // card by work_id. The corpus index sidecar is LAZY — await it here or the
            // map is deterministically empty on a cold boot (R11: a false «не найдена»
            // toast for a present work). Mirrors openLessonSource (see ~line 3066).
            let card = null;
            if (hj.work_id) {
              try { await loadCorpusIndex(); } catch (_) {}
              if (corpusReadyById && corpusReadyById.size === 0) corpusReadyById = null;
              try { card = corpusReadyMap().get(String(hj.work_id)) || null; } catch (_) {}
            }
            if (card) {
              // Chapter tokens carry a chapter text_key ≠ the card's first-chapter key;
              // the work bundle contains all chapters, so override the resolve key.
              const target = (hj.text_key && String(hj.text_key) !== String(card.text_key))
                ? { ...card, text_key: String(hj.text_key) } : card;
              await openCorpusWork(target, { scrollToOrderIndex: Number(hj.order_index) || 0 });
            } else if (!(await openLocal())) {
              roomToast(tt('room.handoff.corpusMissing', 'Работа не найдена в каталоге Зала — обновите страницу и откройте вкладку «Корпус».'));
            }
          } else if (hj.text_key && hAction === 'open_reader') {
            if (!(await openLocal())) roomToast(tt('room.mentor.textMissing', 'Текст не найден на этом устройстве — синхронизируйте «Мои тексты» в ☁.'));
          } else {
            // Unknown future action: honest stop, never fall through to a wrong opener.
            roomToast(tt('room.handoff.unknown', 'Ссылка не поддерживается этой версией приложения — обновите страницу.'));
          }
        } else {
          roomToast(tt('room.handoff.expired', 'Ссылка устарела или уже использована — откройте её заново.'));
        }
      }
    } catch (_) {}
    // CLG-P9 — deep-link #mentor (пуш/закладка): открыть дом наставника. Это ЯВНОЕ
    // намерение пользователя (URL), не автооткрытие — этикет R17 §2.3 соблюдён.
    try { if (location.hash === '#mentor') openMentorView(); } catch (_) {}
    // B6 diagnostics are buffered observers, not a critical-render dependency.
    // Install them only after the canonical Room boot/render path has settled;
    // LCP/CLS/event observers use buffered entries, so early evidence is retained
    // without adding instrumentation pressure to the cold startup task.
    // Keep diagnostics off the canonical boot task entirely. Buffered Web
    // Vitals entries still preserve the early evidence, while a separate
    // macrotask prevents observer setup/localStorage bookkeeping from turning
    // a borderline cold parse/render task into a >50 ms release-gate failure.
    setTimeout(installRoomPerformanceDiagnostics, 0);
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
