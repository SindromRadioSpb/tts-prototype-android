// Reading Room B6 — pure scale/resilience contracts.
//
// This module deliberately has no storage, DOM, network, learner-state or database
// side effects. Browser adapters in library-ui.js own those boundaries. Keeping the
// policy here pure makes cursor/state/privacy behavior testable without inventing a
// second source of learner truth.

export const ROOM_B6_LIMITS = Object.freeze({
  pageSize: 48,
  apiMax: 96,
  cardPayloadBytes: 256 * 1024,
  presentationBytes: 8 * 1024,
  presentationUrlBytes: 4096,
  presentationPageMax: 100000,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  diagnosticEntries: 120,
  diagnosticBytes: 64 * 1024,
  diagnosticTtlMs: 7 * 24 * 60 * 60 * 1000,
});

const CURSOR_VERSION = 1;
const PRESENTATION_VERSION = 1;
const SORTS = new Set(['opened_desc', 'updated_desc', 'title_asc', 'title_desc', 'topic_asc', 'level_asc']);
const PRESENTATION_SORTS = new Set([...SORTS, 'opened', 'ready', 'alpha', 'length', 'position', 'creator_asc', 'familiar_desc', 'progress']);
const PUBLIC_SORTS = new Set(['ready', 'alpha', 'length', 'position', 'title_asc', 'title_desc', 'creator_asc']);
const SCOPES = new Set(['texts', 'both', 'rows', 'notes']);
const PRESENTATION_SCOPES = new Set([...SCOPES, 'corpus', 'fulltext', 'notes+rows', 'all', 'title', 'creator']);
const PUBLIC_SEARCH_SCOPES = new Set(['texts', 'corpus', 'fulltext', 'all', 'title', 'creator']);
const READING_STATUSES = new Set(['all', 'new', 'reading', 'finished']);
const AUDIO_FILTERS = new Set(['all', 'full', 'partial', 'none', 'complete', 'missing']);
const MODES = new Set(['read', 'explore']);
const ERAS = new Set(['biblical', 'medieval', 'haskalah', 'tehiya', 'mandate', 'modern', 'unknown']);
const GENRES = new Set(['article', 'poetry', 'prose', 'memoir', 'fables', 'letters', 'reference', 'drama', 'lexicon']);
const LENGTHS = new Set(['short', 'medium', 'long', 'unknown']);
const DRILL_LEVELS = new Set(['home', 'era', 'authors', 'works']);
const PUBLIC_FLAGS = ['readyOnly', 'hasAudio', 'reviewed', 'exactForm'];
const TAG_MODES = new Set(['all', 'any']);
const SURFACES = new Set(['hub', 'corpus', 'mytexts', 'group', 'reader']);
const DIAGNOSTIC_KINDS = new Set([
  'room.boot', 'room.open', 'room.return', 'room.page', 'room.search',
  'room.lcp', 'room.inp', 'room.cls', 'room.connection', 'room.update', 'room.error',
]);
const DIAGNOSTIC_FIELDS = new Set([
  'kind', 'ts', 'duration_ms', 'result', 'error_code', 'value', 'bucket',
  'connection', 'display', 'app_version',
]);
const FORBIDDEN_DIAGNOSTIC_KEY = /(user|learner|device|session|text|work|sentence|note|title|source|translation|token|query|tag|url|path|referrer|user.?agent|selector|attribution|message|stack|request|body|grade|status|progress|count|id)/i;

function utf8ToBase64Url(value) {
  const text = String(value);
  let base64;
  if (typeof Buffer !== 'undefined') base64 = Buffer.from(text, 'utf8').toString('base64');
  else {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUtf8(value) {
  const raw = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('CURSOR_INVALID');
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4);
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (_) { throw new Error('CURSOR_INVALID'); }
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(String(value));
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function boundedString(value, max = 256) {
  return Array.from(String(value == null ? '' : value).trim()).slice(0, max).join('');
}

export function normalizeBrowseFilters(input = {}) {
  const tags = Array.isArray(input.tags) ? input.tags : [];
  return {
    q: boundedString(input.q != null ? input.q : input.query, 256),
    level: boundedString(input.level, 64),
    tags: Array.from(new Set(tags.map((tag) => boundedString(tag, 64)).filter(Boolean))).slice(0, 12).sort(),
    tagMode: TAG_MODES.has(input.tagMode) ? input.tagMode : 'all',
    scope: SCOPES.has(input.scope) ? input.scope : 'texts',
    sort: SORTS.has(input.sort) ? input.sort : 'opened_desc',
    smart: boundedString(input.smart, 48),
    ...(input.provider ? { provider: boundedString(input.provider, 64) } : {}),
  };
}

export async function fingerprintBrowseFilters(input = {}) {
  const stable = JSON.stringify(normalizeBrowseFilters(input));
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
    return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return 'fnv1a-' + fnv1a(stable);
  }
}

export function encodeBrowseCursor({ fingerprint, sort, values }) {
  if (!fingerprint || !SORTS.has(sort) || !Array.isArray(values) || values.length < 2) throw new Error('CURSOR_INVALID');
  const body = { v: CURSOR_VERSION, f: String(fingerprint), s: sort, x: values };
  const signed = { ...body, h: fnv1a(JSON.stringify(body)) };
  return utf8ToBase64Url(JSON.stringify(signed));
}

export function decodeBrowseCursor(cursor, expected = {}) {
  let decoded;
  try {
    const json = base64UrlToUtf8(cursor);
    decoded = JSON.parse(json);
    if (utf8ToBase64Url(json) !== String(cursor)) throw new Error('CURSOR_INVALID');
  } catch (_) { throw new Error('CURSOR_INVALID'); }
  if (!decoded || decoded.v !== CURSOR_VERSION || !SORTS.has(decoded.s) || !Array.isArray(decoded.x) || decoded.x.length < 2) throw new Error('CURSOR_INVALID');
  const body = { v: decoded.v, f: decoded.f, s: decoded.s, x: decoded.x };
  if (decoded.h !== fnv1a(JSON.stringify(body))) throw new Error('CURSOR_INVALID');
  if (expected.fingerprint && decoded.f !== expected.fingerprint) throw new Error('CURSOR_MISMATCH');
  if (expected.sort && decoded.s !== expected.sort) throw new Error('CURSOR_MISMATCH');
  return { version: decoded.v, fingerprint: decoded.f, sort: decoded.s, values: decoded.x.slice() };
}

function cleanCorpus(value) {
  const corpus = String(value == null ? '' : value).trim();
  if (corpus === 'benyehuda' || corpus === 'mytexts') return corpus;
  if (/^public:[a-z0-9][a-z0-9-]{0,119}$/.test(corpus)) return corpus;
  if (/^group:[A-Za-z0-9._:-]{1,240}$/.test(corpus)) return corpus;
  return '';
}

function cleanOpaqueId(value, max = 256) {
  const id = boundedString(value, max);
  return id && !/[\u0000-\u001f<>]/.test(id) ? id : '';
}

export function sanitizePresentationState(input = {}) {
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const surface = SURFACES.has(input.surface) ? input.surface : 'hub';
  // A generic group route carries no group identity. Only same-tab state may
  // restore that identity; the host must show its chooser if it is absent.
  const corpus = cleanCorpus(input.corpus) || (surface === 'group' ? '' : surface === 'mytexts' ? 'mytexts' : 'benyehuda');
  const drillIn = input.drill && typeof input.drill === 'object' ? input.drill : {};
  const filterIn = input.filters && typeof input.filters === 'object' ? input.filters : {};
  const anchorIn = input.anchor && typeof input.anchor === 'object' ? input.anchor : {};
  const filters = normalizeBrowseFilters(filterIn);
  filters.sort = PRESENTATION_SORTS.has(filterIn.sort) ? filterIn.sort : 'opened_desc';
  filters.scope = PRESENTATION_SCOPES.has(filterIn.scope) ? filterIn.scope : 'texts';
  for (const key of ['genre', 'lang', 'length', 'theme', 'scopeAuthor', 'scopeAuthorQid', 'scopeEra']) {
    if (filterIn[key]) filters[key] = boundedString(filterIn[key], key === 'scopeAuthor' ? 256 : 64);
  }
  for (const key of [...PUBLIC_FLAGS, 'readableOnly']) {
    if (typeof filterIn[key] === 'boolean') filters[key] = filterIn[key];
  }
  // Existing public/group widgets retain these only in history/session. In
  // particular, a reading status is personal state and never a public facet.
  if (READING_STATUSES.has(filterIn.status)) filters.status = filterIn.status;
  if (AUDIO_FILTERS.has(filterIn.audio)) filters.audio = filterIn.audio;
  const section = String(filterIn.section == null ? '' : filterIn.section);
  if (section === 'all' || /^[1-9]\d{0,3}$/.test(section)) filters.section = section;
  const state = {
    v: PRESENTATION_VERSION,
    surface,
    corpus,
    mode: MODES.has(input.mode) ? input.mode : 'read',
    page: cleanPage(input.page),
    drill: {
      level: boundedString(drillIn.level, 32),
      eraId: cleanOpaqueId(drillIn.eraId, 128),
      authorId: cleanOpaqueId(drillIn.authorId, 256),
      workId: cleanOpaqueId(drillIn.workId, 256),
    },
    filters,
    visible: ROOM_B6_LIMITS.pageSize,
    anchor: {
      itemId: cleanOpaqueId(anchorIn.itemId, 256),
      rowIndex: Number.isInteger(Number(anchorIn.rowIndex)) ? Math.max(0, Math.min(10000000, Number(anchorIn.rowIndex))) : 0,
    },
  };
  if (byteLength(JSON.stringify(state)) > ROOM_B6_LIMITS.presentationBytes) {
    state.filters.q = '';
    state.filters.tags = [];
  }
  return state;
}

// A history entry is a complete view, never a patch over the current controls.
// Keep the v1 wire sanitizer compatible while supplying explicit empty facets
// for browser adapters that replace their source-specific browse state.
export function presentationFiltersForRestore(input = {}) {
  const safe = sanitizePresentationState(input);
  const defaults = {
    q: '', level: '', tags: [], tagMode: 'all', scope: 'texts', sort: 'opened_desc', smart: '', provider: '',
    genre: '', lang: '', length: '', theme: '', scopeAuthor: '', scopeAuthorQid: '', scopeEra: '',
    readyOnly: false, readableOnly: false, exactForm: false, hasAudio: false, reviewed: false,
  };
  if (safe.corpus === 'benyehuda') { defaults.scope = 'corpus'; defaults.sort = 'ready'; }
  if (safe.corpus.startsWith('public:')) {
    Object.assign(defaults, { scope: 'all', sort: 'position', status: 'all', audio: 'all', section: 'all' });
  } else if (safe.corpus.startsWith('group:')) {
    Object.assign(defaults, { sort: 'position', status: 'all', audio: 'all' });
  }
  const filters = { ...defaults, ...safe.filters, tags: safe.filters.tags.slice(), start: (safe.page - 1) * ROOM_B6_LIMITS.pageSize };
  const supplied = input && typeof input.filters === 'object' && input.filters ? input.filters : {};
  if (!Object.prototype.hasOwnProperty.call(supplied, 'scope')) filters.scope = defaults.scope;
  if (!Object.prototype.hasOwnProperty.call(supplied, 'sort')) filters.sort = defaults.sort;
  return filters;
}

export function clampBrowsePage(page, totalItems) {
  const total = Number.isFinite(Number(totalItems)) ? Math.max(0, Math.floor(Number(totalItems))) : 0;
  const lastPage = Math.max(1, Math.ceil(total / ROOM_B6_LIMITS.pageSize));
  const currentPage = Math.min(cleanPage(page), lastPage);
  const start = (currentPage - 1) * ROOM_B6_LIMITS.pageSize;
  return { page: currentPage, lastPage, start, end: Math.min(total, start + ROOM_B6_LIMITS.pageSize), total };
}

export function presentationHash(input = {}) {
  return publicPresentationHash(sanitizePresentationState(input));
}

export function presentationStateFromHash(hash) {
  const raw = String(hash || '');
  if (!raw.startsWith('#room=') || byteLength(raw) > ROOM_B6_LIMITS.presentationUrlBytes) return null;
  let params;
  try {
    // URLSearchParams alone silently accepts malformed percent encoding.
    decodeURIComponent(raw.slice(1));
    params = new URLSearchParams(raw.slice(1));
  } catch (_) { return null; }
  for (const key of new Set(params.keys())) if (params.getAll(key).length !== 1) return null;
  if (params.has('rv') && params.get('rv') !== '2') return null;
  const route = params.get('room');
  let input;
  if (route === 'hub') input = { surface: 'hub', corpus: 'benyehuda' };
  else if (route === 'mytexts') input = { surface: 'mytexts', corpus: 'mytexts' };
  else if (route === 'group') input = { surface: 'group', corpus: '' };
  else if (route === 'benyehuda' || isPublicCorpus(route)) input = { surface: 'corpus', corpus: route };
  else if (cleanCorpus(route).startsWith('group:')) input = { surface: 'group', corpus: route }; // v1 decode only
  else return null;
  if (!isPublicCorpus(input.corpus) || input.surface === 'hub') return sanitizePresentationState(input);
  const filters = {};
  if (GENRES.has(params.get('genre'))) filters.genre = params.get('genre');
  if (cleanLanguage(params.get('lang'))) filters.lang = cleanLanguage(params.get('lang'));
  if (LENGTHS.has(params.get('length'))) filters.length = params.get('length');
  if (cleanFacetId(params.get('theme'))) filters.theme = cleanFacetId(params.get('theme'));
  if (PUBLIC_SORTS.has(params.get('sort'))) filters.sort = params.get('sort');
  if (PUBLIC_SEARCH_SCOPES.has(params.get('scope'))) filters.scope = params.get('scope');
  for (const key of PUBLIC_FLAGS) if (params.get(key) === '1' || params.get(key) === '0') filters[key] = params.get(key) === '1';
  const authorId = cleanQid(params.get('author'));
  const eraId = ERAS.has(params.get('era')) ? params.get('era') : '';
  if (authorId) filters.scopeAuthorQid = authorId;
  if (eraId) filters.scopeEra = eraId;
  const sharedSearch = params.get('share') === '1'
    && (!params.has('scope') || PUBLIC_SEARCH_SCOPES.has(params.get('scope')))
    && !['tags', 'tag', 'smart', 'note', 'notes', 'profile', 'readableOnly', 'status', 'audio', 'section'].some(key => params.has(key));
  if (sharedSearch && !hasTagQuery(params.get('q'))) filters.q = boundedString(params.get('q'), 256);
  const state = sanitizePresentationState({ ...input, mode: params.get('mode'), page: params.get('page'), filters,
    drill: { authorId, eraId, level: DRILL_LEVELS.has(params.get('view')) ? params.get('view') : 'home' } });
  return sharedSearch ? { ...state, sharedSearch: true } : state;
}

export function presentationStateMatchesHash(input, hash) {
  const explicit = presentationStateFromHash(hash);
  if (!explicit) return false;
  const local = sanitizePresentationState(input);
  if (explicit.corpus.startsWith('group:') && local.corpus !== explicit.corpus) return false;
  // v1 links named only their route; their tab-local drill/filter detail was
  // deliberately absent. Continue restoring that detail for those old links.
  const params = new URLSearchParams(String(hash).slice(1));
  if (params.size === 1) {
    const routeOnly = state => publicPresentationHash(sanitizePresentationState({
      surface: state.surface === 'reader' ? 'corpus' : state.surface, corpus: state.corpus,
    }));
    return routeOnly(local) === routeOnly(explicit);
  }
  return presentationHash(local) === presentationHash(explicit);
}

function cleanPage(value) {
  const text = String(value == null ? '' : value);
  if (!/^\d{1,6}$/.test(text)) return 1;
  const page = Number(text);
  return page >= 1 && page <= ROOM_B6_LIMITS.presentationPageMax ? page : 1;
}

function cleanQid(value) { return /^Q[1-9]\d{0,17}$/.test(String(value || '')) ? String(value) : ''; }
function cleanLanguage(value) { return /^(?:[a-z]{2,3}(?:-[A-Za-z]{2,8})?|unk)$/.test(String(value || '')) ? String(value) : ''; }
function cleanFacetId(value) { return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(String(value || '')) ? String(value) : ''; }
function isPublicCorpus(value) { return value === 'benyehuda' || /^public:[a-z0-9][a-z0-9-]{0,119}$/.test(String(value || '')); }
// These are application tag-filter operators, not a guess about the privacy of
// arbitrary words. Tag queries always remain local, including on explicit share.
function hasTagQuery(value) { return /(?:^|\s)(?:#|tag:)/i.test(String(value || '')); }

function publicPresentationHash(state, sharedQuery) {
  const route = state.surface === 'hub' ? 'hub' : state.surface === 'mytexts' ? 'mytexts'
    : state.surface === 'group' || state.corpus.startsWith('group:') ? 'group' : state.corpus;
  const params = new URLSearchParams();
  params.set('room', route || 'hub');
  if (isPublicCorpus(route)) {
    const filters = state.filters;
    if (state.mode !== 'read') params.set('mode', state.mode);
    const author = cleanQid(filters.scopeAuthorQid) || cleanQid(state.drill.authorId);
    const era = ERAS.has(filters.scopeEra) ? filters.scopeEra : ERAS.has(state.drill.eraId) ? state.drill.eraId : '';
    if (author) params.set('author', author);
    if (era) params.set('era', era);
    if (DRILL_LEVELS.has(state.drill.level) && state.drill.level !== 'home') params.set('view', state.drill.level);
    if (GENRES.has(filters.genre)) params.set('genre', filters.genre);
    if (cleanLanguage(filters.lang)) params.set('lang', filters.lang);
    if (LENGTHS.has(filters.length)) params.set('length', filters.length);
    if (cleanFacetId(filters.theme)) params.set('theme', filters.theme);
    if (PUBLIC_SORTS.has(filters.sort)) params.set('sort', filters.sort);
    if (PUBLIC_SEARCH_SCOPES.has(filters.scope) && filters.scope !== 'texts') params.set('scope', filters.scope);
    for (const key of PUBLIC_FLAGS) if (typeof filters[key] === 'boolean') params.set(key, filters[key] ? '1' : '0');
    if (state.page > 1) params.set('page', String(state.page));
    if (sharedQuery !== undefined) { params.set('share', '1'); params.set('q', sharedQuery); }
    if (params.size > 1) params.set('rv', '2');
  }
  const hash = '#' + params.toString();
  return byteLength(hash) <= ROOM_B6_LIMITS.presentationUrlBytes ? hash : null;
}

// Only an explicit Share action calls this helper. Normal history commits must
// use presentationHash, which never serializes query text. No personal or group
// scope can be shared, even if another corpus field claims to be public.
export function sharedSearchHash(input = {}) {
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const state = sanitizePresentationState(input);
  const filters = state.filters;
  const rawFilters = input.filters && typeof input.filters === 'object' ? input.filters : {};
  const rawScope = rawFilters.scope;
  // Sharing a narrower local view as an unfiltered public query would be
  // misleading. Until these facets have a public contract, refuse that share.
  const unsharedFacet = ['status', 'audio', 'section'].some(key =>
    rawFilters[key] != null && rawFilters[key] !== '' && rawFilters[key] !== 'all');
  if (!isPublicCorpus(input.corpus) || !['corpus', 'reader'].includes(state.surface)
    || (rawScope != null && !PUBLIC_SEARCH_SCOPES.has(rawScope))
    || !PUBLIC_SEARCH_SCOPES.has(filters.scope) || filters.tags.length || filters.smart
    || filters.readableOnly || unsharedFacet || hasTagQuery(filters.q)) return null;
  return publicPresentationHash(state, filters.q);
}

// The host supplies history.state and a sessionStorage string. This helper only
// chooses bounded presentation; it performs no storage or canonical data writes.
export function restorePresentationState({ hash = '', historyState = null, sessionMirror = null } = {}, now = Date.now()) {
  const explicit = presentationStateFromHash(hash);
  if (String(hash || '').startsWith('#room=') && !explicit) return null;
  // A shared search is an explicit new navigation, not a request to resurrect
  // the previous tab's personal filters or reader anchor.
  if (explicit && explicit.sharedSearch) return sanitizePresentationState(explicit);
  const history = historyState && historyState.v === PRESENTATION_VERSION ? sanitizePresentationState(historyState) : null;
  const mirror = decodeSessionMirror(sessionMirror, now);
  const local = [history, mirror].find(state => state && (!explicit || presentationStateMatchesHash(state, hash)));
  if (local) return local;
  // A generic group fragment has no identity when opened in another tab.
  if (explicit && explicit.surface === 'group' && !explicit.corpus) return sanitizePresentationState({ surface: 'hub' });
  return explicit || null;
}

export function encodeSessionMirror(input, now = Date.now()) {
  const envelope = { v: PRESENTATION_VERSION, savedAt: Number(now), state: sanitizePresentationState(input) };
  const raw = JSON.stringify(envelope);
  if (byteLength(raw) > ROOM_B6_LIMITS.presentationBytes) throw new Error('PRESENTATION_STATE_TOO_LARGE');
  return raw;
}

export function decodeSessionMirror(raw, now = Date.now()) {
  try {
    if (!raw || byteLength(String(raw)) > ROOM_B6_LIMITS.presentationBytes) return null;
    const envelope = JSON.parse(String(raw));
    if (!envelope || envelope.v !== PRESENTATION_VERSION || !Number.isFinite(envelope.savedAt)) return null;
    if (Number(now) - envelope.savedAt < 0 || Number(now) - envelope.savedAt > ROOM_B6_LIMITS.sessionTtlMs) return null;
    return sanitizePresentationState(envelope.state);
  } catch (_) { return null; }
}

export function nextConnectionState(current, event, context = {}) {
  if (event === 'offline') return context.localReady ? 'offline-ready' : 'offline-partial';
  if (event === 'online') return 'reconnecting';
  if (event === 'probe-ok') return 'online';
  if (event === 'probe-failed') return 'degraded-error';
  if (event === 'remote-missing') return 'offline-partial';
  if (event === 'update-waiting') return 'update-ready';
  if (event === 'update-flush') return 'update-deferred-reader';
  return current || 'online';
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}

function sanitizeDiagnostic(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('DIAGNOSTIC_INVALID');
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_DIAGNOSTIC_KEY.test(key) || !DIAGNOSTIC_FIELDS.has(key)) throw new Error('DIAGNOSTIC_FIELD_FORBIDDEN');
    const value = input[key];
    if (value && typeof value === 'object') throw new Error('DIAGNOSTIC_FIELD_FORBIDDEN');
  }
  if (!DIAGNOSTIC_KINDS.has(input.kind)) throw new Error('DIAGNOSTIC_KIND_INVALID');
  const out = { kind: input.kind, ts: Math.max(0, Math.floor(Number(now))) };
  for (const key of DIAGNOSTIC_FIELDS) {
    if (key === 'kind' || key === 'ts' || input[key] == null) continue;
    if (typeof input[key] === 'number') out[key] = Number.isFinite(input[key]) ? Math.round(input[key] * 1000) / 1000 : 0;
    else if (typeof input[key] === 'boolean') out[key] = input[key];
    else out[key] = boundedString(input[key], 64);
  }
  return out;
}

export function appendLocalDiagnostic(existing, input, now = Date.now()) {
  const cutoff = Number(now) - ROOM_B6_LIMITS.diagnosticTtlMs;
  const ring = (Array.isArray(existing) ? existing : []).filter((item) => item && Number(item.ts) >= cutoff);
  ring.push(sanitizeDiagnostic(input, now));
  while (ring.length > ROOM_B6_LIMITS.diagnosticEntries) ring.shift();
  while (ring.length && byteLength(JSON.stringify(ring)) > ROOM_B6_LIMITS.diagnosticBytes) ring.shift();
  return ring;
}

export function sanitizeDiagnosticExport(existing, now = Date.now()) {
  const cutoff = Number(now) - ROOM_B6_LIMITS.diagnosticTtlMs;
  const events = [];
  for (const item of (Array.isArray(existing) ? existing : [])) {
    if (!item || Number(item.ts) < cutoff) continue;
    try { events.push(sanitizeDiagnostic(item, item.ts)); } catch (_) {}
  }
  return { schema_version: 1, surface: 'room', exported_at: new Date(Number(now)).toISOString(), events };
}
