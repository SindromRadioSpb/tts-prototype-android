'use strict';
// News pack format v1 core (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md): URL identity,
// verbatim-overlap fingerprints (§6) and static article validation (§5, §9). Shared by the
// packer script and the server, so both compute the same fingerprints by construction.
const crypto = require('node:crypto');
const Outlets = require('../public/js/news-outlets');

const SECTIONS = ['news', 'politics', 'security', 'world', 'economy', 'consumer', 'sport', 'culture', 'tech', 'health', 'science', 'local', 'opinion', 'lifestyle', 'other'];
const CONTENT_TYPES = ['news', 'analysis', 'opinion', 'interview', 'live', 'feature'];
const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const SENSITIVE_KINDS = ['war', 'terror', 'violence', 'death', 'abuse', 'disaster'];
const IMAGE_MODES = ['source_link', 'licensed', 'none'];
const KNOWN_FIELDS = ['revision', 'source', 'image', 'learning', 'check', 'prepared', 'quality'];
const SHINGLE = 5, MAX_QUOTE_WORDS = 15, FUTURE_SKEW_MS = 10 * 60 * 1000;
const ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const HEBREW = /[א-ת]/;
const QUOTE_CHARS = '"״”“„«»';
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function normalizeWord(w) {
  return String(w)
    .replace(/[״”“„«»]/g, '"').replace(/[׳‘’`]/g, "'")
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}"']/gu, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[ךםןףץ]/g, ch => FINALS[ch]);
}
function normalizeHebrewText(s) {
  return String(s == null ? '' : s).normalize('NFC')
    .replace(/[־‐-―-]/g, ' ')
    .split(/\s+/).map(normalizeWord).filter(Boolean).join(' ');
}

// Quoted spans [start, end] in the raw text. A quote mark opens at a word start and closes at a
// word end; gershayim inside a word (רה"מ) do neither. Unclosed quotes and quotes longer than
// MAX_QUOTE_WORDS are not spans: a stray mark must not hide copied text.
function isLetter(ch) { return !!ch && /[\p{L}\p{N}]/u.test(ch); }
function quotedSpans(text) {
  const s = String(text || ''), spans = [];
  let open = -1;
  for (let i = 0; i < s.length; i++) {
    if (QUOTE_CHARS.indexOf(s[i]) < 0) continue;
    const prev = s[i - 1], next = s[i + 1];
    const opening = (i === 0 || /[\s(\[]/.test(prev)) && isLetter(next);
    const closing = (isLetter(prev) || /[.,!?;:]/.test(prev || '')) && (next === undefined || /[\s.,!?;:)\]]/.test(next));
    if (open < 0 && opening) open = i;
    else if (open >= 0 && closing) {
      if (s.slice(open, i).trim().split(/\s+/).length <= MAX_QUOTE_WORDS) spans.push([open, i]);
      open = -1;
    }
  }
  return spans;
}
function words(text, skipQuoted) {
  const s = String(text || '').normalize('NFC').replace(/[־‐-―]/g, ' ');
  const spans = skipQuoted ? quotedSpans(s) : [], out = [];
  for (const m of s.matchAll(/\S+/g)) {
    const w = normalizeWord(m[0]);
    if (!w) continue;
    const quoted = spans.some(([a, b]) => m.index >= a && m.index <= b);
    out.push({ w, quoted });
  }
  return out;
}
function windows(text, skipQuoted) {
  const ws = words(text, skipQuoted), out = [];
  for (let i = 0; i + SHINGLE <= ws.length; i++) {
    const win = ws.slice(i, i + SHINGLE);
    if (skipQuoted && win.some(x => x.quoted)) continue;
    out.push(sha256(win.map(x => x.w).join(' ')).slice(0, 16));
  }
  return out;
}
function shingles(text) { return [...new Set(windows(text, false))]; }
function overlapRatio(paraphraseTexts, sourceShingles) {
  const src = new Set(sourceShingles || []);
  let total = 0, hit = 0;
  for (const t of paraphraseTexts || []) for (const h of windows(t, true)) { total++; if (src.has(h)) hit++; }
  return total ? hit / total : 0;
}
function articleOverlap(article) {
  const versions = (article && article.learning && article.learning.versions) || [];
  const src = (article && article.check && article.check.source_shingles) || [];
  return versions.reduce((max, v) => Math.max(max, overlapRatio([(v.rows || []).map(r => r.he_plain).join(' ')], src)), 0);
}

function canonicalizeUrl(url) {
  const u = new URL(String(url));
  u.protocol = 'https:'; u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
  let path = u.pathname.replace(/\/+$/, '') || '/';
  const query = u.searchParams.toString();
  return 'https://' + u.hostname.toLowerCase() + (path === '/' ? '' : path) + (query ? '?' + query : '');
}
function articleKey(outletId, canonicalUrl) {
  return 'na_' + sha256(String(outletId) + '\n' + String(canonicalUrl)).slice(0, 24);
}

const str = v => typeof v === 'string' && v.trim().length > 0;
const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
function httpsUrl(v) { try { return new URL(String(v)).protocol === 'https:'; } catch (_) { return false; } }

function validateArticle(a, { now = Date.now() } = {}) {
  const fail = code => ({ ok: false, code, warnings: [] });
  if (!obj(a) || !Number.isInteger(a.revision) || a.revision < 1 || !obj(a.source) || !obj(a.learning) || !obj(a.image) || !obj(a.prepared)) return fail('SCHEMA_INVALID');
  const s = a.source, l = a.learning;
  if (!str(s.url) || !str(s.canonical_url) || !str(s.section_original_he) || !SECTIONS.includes(s.section) || !CONTENT_TYPES.includes(s.content_type)
    || !str(s.original_title_he) || s.original_title_he.length > 160 || s.language !== 'he'
    || !Array.isArray(l.versions) || !obj(l.sensitive) || typeof l.sensitive.heavy !== 'boolean'
    || !(l.sensitive.kinds || []).every(k => SENSITIVE_KINDS.includes(k))) return fail('SCHEMA_INVALID');
  if (!Outlets.byId(s.outlet_id)) return fail('OUTLET_UNKNOWN');
  let canonical;
  try { canonical = canonicalizeUrl(s.canonical_url); } catch (_) { return fail('URL_DOMAIN_MISMATCH'); }
  if (Outlets.outletForUrl(canonical) !== s.outlet_id || Outlets.outletForUrl(s.url) !== s.outlet_id) return fail('URL_DOMAIN_MISMATCH');
  if (!ISO_TZ.test(String(s.published_at || '')) || !ISO_TZ.test(String(s.retrieved_at || ''))
    || !isFinite(Date.parse(s.published_at)) || !isFinite(Date.parse(s.retrieved_at))) return fail('DATE_MISSING');
  if (Date.parse(s.published_at) > now + FUTURE_SKEW_MS) return fail('DATE_IN_FUTURE');
  const rows = l.versions.flatMap(v => (obj(v) && Array.isArray(v.rows)) ? v.rows : []);
  if (!HEBREW.test(String(l.title_he || '')) || !rows.every(r => obj(r) && HEBREW.test(String(r.he_plain || '')))) return fail('HEBREW_MISSING');
  if (!str(l.title_ru) || !str(l.summary_ru) || !rows.every(r => str(r.ru))) return fail('TRANSLATION_MISSING');
  const levels = new Set();
  if (!l.versions.length || !l.versions.every(v => obj(v) && LEVELS.includes(v.level) && !levels.has(v.level) && levels.add(v.level)
    && Array.isArray(v.rows) && v.rows.length >= 3 && v.rows.length <= 120)) return fail('ROWS_OUT_OF_RANGE');
  const c = a.check;
  if (!obj(c) || !Array.isArray(c.source_shingles) || !c.source_shingles.length || !c.source_shingles.every(h => /^[0-9a-f]{16}$/.test(h))
    || !Number.isInteger(c.source_word_count) || c.source_word_count < 1) return fail('CHECK_MISSING');
  if (normalizeHebrewText(l.title_he) === normalizeHebrewText(s.original_title_he)) return fail('TITLE_COPIES_ORIGINAL');
  const img = a.image;
  if (!IMAGE_MODES.includes(img.mode)) return fail('IMAGE_INVALID');
  if (img.mode === 'source_link' && !httpsUrl(img.url)) return fail('IMAGE_INVALID');
  if (img.mode === 'licensed') {
    if (!/^image\.(jpg|jpeg|png|webp)$/.test(String(img.file || ''))) return fail('IMAGE_INVALID');
    if (!str(img.license) || !str(img.author)) return fail('IMAGE_LICENSE_MISSING');
  }
  const warnings = Object.keys(a).filter(k => !KNOWN_FIELDS.includes(k)).map(k => 'UNKNOWN_FIELD:' + k);
  return { ok: true, warnings };
}

module.exports = {
  SECTIONS, CONTENT_TYPES, LEVELS, SENSITIVE_KINDS, IMAGE_MODES,
  normalizeHebrewText, quotedSpans, shingles, overlapRatio, articleOverlap,
  canonicalizeUrl, articleKey, validateArticle, sha256,
};
