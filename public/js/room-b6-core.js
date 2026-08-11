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
  sessionTtlMs: 24 * 60 * 60 * 1000,
  diagnosticEntries: 120,
  diagnosticBytes: 64 * 1024,
  diagnosticTtlMs: 7 * 24 * 60 * 60 * 1000,
});

const CURSOR_VERSION = 1;
const PRESENTATION_VERSION = 1;
const SORTS = new Set(['opened_desc', 'updated_desc', 'title_asc', 'title_desc', 'topic_asc']);
const SCOPES = new Set(['texts', 'both', 'rows', 'notes']);
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
  const corpus = boundedString(value, 256);
  if (corpus === 'benyehuda' || corpus === 'mytexts') return corpus;
  if (/^group:[A-Za-z0-9._:-]{1,240}$/.test(corpus)) return corpus;
  return '';
}

function cleanOpaqueId(value, max = 256) {
  const id = boundedString(value, max);
  return id && !/[\u0000-\u001f<>]/.test(id) ? id : '';
}

export function sanitizePresentationState(input = {}) {
  const surface = SURFACES.has(input.surface) ? input.surface : 'hub';
  const corpus = cleanCorpus(input.corpus) || (surface === 'mytexts' ? 'mytexts' : 'benyehuda');
  const drillIn = input.drill && typeof input.drill === 'object' ? input.drill : {};
  const filterIn = input.filters && typeof input.filters === 'object' ? input.filters : {};
  const anchorIn = input.anchor && typeof input.anchor === 'object' ? input.anchor : {};
  const filters = normalizeBrowseFilters(filterIn);
  delete filters.sort;
  filters.sort = SORTS.has(filterIn.sort) ? filterIn.sort : 'opened_desc';
  const state = {
    v: PRESENTATION_VERSION,
    surface,
    corpus,
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

export function presentationHash(input = {}) {
  const state = sanitizePresentationState(input);
  const route = state.surface === 'hub' ? 'hub' : (state.corpus || state.surface);
  return '#room=' + encodeURIComponent(route);
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
