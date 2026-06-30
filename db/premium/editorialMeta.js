"use strict";

// editorialMeta.js — BRR Epic-6 · the CURATED editorial namespace (R6/R7/R9).
//
// The build-once "home" where every piece of human curation — an author one-liner
// or bio, a "why read this" note, a curated collection/reading-order — lives as
// DATA keyed to a STABLE id (author Wikidata QID, work id, collection id), in its
// OWN committed file, NEVER mixed into the derived corpus/author metadata. Because
// it is a separate hand-authored store (not regenerated from the CSV), a re-bake of
// the 26K catalog can never clobber it; and because it is merged onto the derived
// authority at render with an explicit precedence (curated > asserted > derived) +
// per-field source tag, a curated value is always distinguishable from a guess (R9
// derived≠asserted≠curated) and always wins. Adding the 1st or the 500th bio is then
// a one-line DATA edit — no code, no schema migration, no UI rework (the build-once
// lever against recurring polish-returns).
//
// Honesty invariants (R1 no fabrication, R9 provenance):
//   • Every curated entry is keyed by a real identity (author = a valid QID).
//   • A curated text field SHOULD carry a `curator` (who authored it) — its
//     evidence/provenance; validateEditorial WARNS when it is missing.
//   • The store ships EMPTY until a human authors content under sign-off; the merge
//     is a no-op on an empty store, so the surfaces render honest derived data and
//     self-hide every absent curated slot (premium at 0% coverage, grows additively).

const authorNodes = require("./authorNodes");
const QID_RE = authorNodes.QID_RE;

const EDITORIAL_SCHEMA_VERSION = 1;

// Suggested era vocab (mirror of corpusMeta.ERA) — a curated era override outside it
// is a WARNING, not a lie (R7 may extend); kept local to avoid a hard import cycle.
const ERA_VOCAB = ["biblical", "rabbinic", "medieval", "haskalah", "tehiya", "mandate", "modern", "contemporary"];

function _str(v) { if (v == null) return null; const s = String(v).trim(); return s.length ? s : null; }
function _strArr(v) { return Array.isArray(v) ? v.map(_str).filter(Boolean) : []; }

// ── normalize a raw store into the canonical, honest-null shape ────────────────
function normalizeAuthorEntry(e) {
  e = e && typeof e === "object" ? e : {};
  return {
    one_line: _str(e.one_line),          // a single editorial line («poet of the national revival»)
    bio_md: _str(e.bio_md),              // a longer markdown bio (optional)
    entry_points: _strArr(e.entry_points), // 2–4 recommended work ids («start here»)
    era: _str(e.era),                    // curated era OVERRIDE (beats the derived floruit era)
    display: _str(e.display),            // curated display-name OVERRIDE (beats the catalogue spelling)
    portrait_url: _str(e.portrait_url),  // optional portrait (e.g. a Commons URL)
    curator: _str(e.curator),            // who authored this curation (R9 evidence)
  };
}
function normalizeWorkEntry(e) {
  e = e && typeof e === "object" ? e : {};
  return { why_read: _str(e.why_read), significance: _str(e.significance), curator: _str(e.curator) };
}
function normalizeCollectionEntry(e) {
  e = e && typeof e === "object" ? e : {};
  return {
    title: _str(e.title), rationale: _str(e.rationale), era: _str(e.era),
    item_ids: _strArr(e.item_ids), curator: _str(e.curator),
  };
}
function normalizeEditorial(input) {
  const i = input && typeof input === "object" ? input : {};
  const authors = {}, works = {}, collections = {};
  for (const k of Object.keys(i.authors || {})) authors[k] = normalizeAuthorEntry(i.authors[k]);
  for (const k of Object.keys(i.works || {})) works[k] = normalizeWorkEntry(i.works[k]);
  for (const k of Object.keys(i.collections || {})) collections[k] = normalizeCollectionEntry(i.collections[k]);
  return { schema: EDITORIAL_SCHEMA_VERSION, version: Number(i.version) || 1, generated_from: "curated", authors, works, collections };
}

// ── validate (R1 honesty gate) — ERRORS fail the build, WARNINGS flag incompleteness ──
function validateEditorial(store) {
  const errors = [];
  const warnings = [];
  if (!store || typeof store !== "object") return { ok: false, errors: ["editorial store missing/not an object"], warnings: [], stats: {} };
  if (store.schema !== EDITORIAL_SCHEMA_VERSION) {
    if (typeof store.schema !== "number") errors.push("schema must be a number");
    else if (store.schema > EDITORIAL_SCHEMA_VERSION) warnings.push("editorial schema " + store.schema + " newer than this build");
    else errors.push("editorial schema " + store.schema + " older than " + EDITORIAL_SCHEMA_VERSION);
  }
  const A = store.authors || {}, W = store.works || {}, C = store.collections || {};
  let curatedAuthors = 0, missingCurator = 0;
  for (const qid of Object.keys(A)) {
    const e = A[qid] || {};
    if (!QID_RE.test(qid)) errors.push("editorial author key '" + qid + "' is not a real Wikidata QID — curation must key on a stable identity, never Q0/a name");
    if (e.one_line != null && typeof e.one_line !== "string") errors.push("author " + qid + " one_line must be a string");
    if (e.bio_md != null && typeof e.bio_md !== "string") errors.push("author " + qid + " bio_md must be a string");
    if (e.entry_points != null && !Array.isArray(e.entry_points)) errors.push("author " + qid + " entry_points must be an array of work ids");
    if (e.era != null && !ERA_VOCAB.includes(e.era)) warnings.push("author " + qid + " curated era '" + e.era + "' not in suggested vocab");
    const hasText = !!(e.one_line || e.bio_md);
    if (hasText) { curatedAuthors++; if (!e.curator) { missingCurator++; warnings.push("author " + qid + " has curated text but no `curator` — provenance/evidence missing (R9)"); } }
  }
  for (const id of Object.keys(W)) {
    const e = W[id] || {};
    if (!_str(id)) errors.push("editorial work key is empty");
    if (e.why_read != null && typeof e.why_read !== "string") errors.push("work " + id + " why_read must be a string");
    if ((e.why_read || e.significance) && !e.curator) warnings.push("work " + id + " has curated text but no `curator` (R9)");
  }
  for (const id of Object.keys(C)) {
    const e = C[id] || {};
    if (Array.isArray(e.item_ids) && e.item_ids.length && !e.title) errors.push("collection " + id + " has items but no title");
    if (!e.curator && (e.title || (e.item_ids && e.item_ids.length))) warnings.push("collection " + id + " missing `curator` (R9)");
  }
  return {
    ok: errors.length === 0, errors, warnings,
    stats: { authors: Object.keys(A).length, works: Object.keys(W).length, collections: Object.keys(C).length, curated_authors: curatedAuthors, missing_curator: missingCurator },
  };
}

// ── precedence guard — the anti-clobber mechanism (curated > asserted > derived) ──
// Returns { value, source } so every surfaced field is honestly tagged. A null
// curated value defers to asserted, then derived; nothing is fabricated.
function resolveField(opts) {
  const o = opts || {};
  if (o.curated != null) return { value: o.curated, source: "curated" };
  if (o.asserted != null) return { value: o.asserted, source: "asserted" };
  if (o.derived != null) return { value: o.derived, source: "derived" };
  return { value: null, source: null };
}

// Merge a curated author entry ONTO a derived/asserted authority node (Increment 1).
// Curated era/display win (with the prov tag flipped to 'curated'); the additive
// editorial slots (one_line/bio/entry_points/portrait) attach under `node.editorial`
// only when present, carrying source='curated' + curator. Pure (clones the node).
function mergeAuthorNode(node, ed) {
  if (!node) return node;
  if (!ed) return node;
  const out = Object.assign({}, node, { prov: Object.assign({}, node.prov) });
  if (ed.era != null) { out.era = ed.era; out.prov.era = "curated"; }
  if (ed.display != null) { out.display = ed.display; out.prov.display = "curated"; }
  const editorial = {};
  if (ed.one_line) editorial.one_line = ed.one_line;
  if (ed.bio_md) editorial.bio_md = ed.bio_md;
  if (Array.isArray(ed.entry_points) && ed.entry_points.length) editorial.entry_points = ed.entry_points.slice();
  if (ed.portrait_url) editorial.portrait_url = ed.portrait_url;
  if (Object.keys(editorial).length) { editorial.source = "curated"; editorial.curator = ed.curator || null; out.editorial = editorial; }
  return out;
}

// Apply a (normalized) editorial store onto an array of author nodes by QID.
function applyEditorialToAuthors(nodes, store) {
  const A = (store && store.authors) || {};
  return (Array.isArray(nodes) ? nodes : []).map((n) => mergeAuthorNode(n, A[n && n.qid]));
}

module.exports = {
  EDITORIAL_SCHEMA_VERSION,
  ERA_VOCAB,
  normalizeAuthorEntry,
  normalizeWorkEntry,
  normalizeCollectionEntry,
  normalizeEditorial,
  validateEditorial,
  resolveField,
  mergeAuthorNode,
  applyEditorialToAuthors,
};
