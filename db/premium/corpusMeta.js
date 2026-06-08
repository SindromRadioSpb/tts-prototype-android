"use strict";

// corpusMeta.js — BRR-P0-001 · canonical corpus-metadata contract (R6-owned).
//
// The Ben-Yehuda Reading Room needs a SCHEMA-FIRST per-work metadata model so
// that curation, discovery (shelves/facets/search), dedup and honest provenance
// all bind to structured data rather than free-form `texts.source/topic`
// strings. Per the owner's decision (storage Option A), the model lives as a
// VERSIONED sub-object `corpus` inside the existing `source_meta_json` column —
// zero DB migration, lossless round-trip through bundle v2 (source_meta is a
// pass-through field), and the `corpus.schema` version makes the descriptive
// fields grow ADDITIVELY forever (R6 red flag: "metadata painful to migrate").
//
// This module is the SINGLE SOURCE OF TRUTH for that contract. It is Node-only
// (producer/Studio + smoke gate). The browser (public/db/local-db.js) only
// TRANSPORTS the object between `source_meta_json.corpus` (OPFS home) and the
// bundle's top-level per-text `corpus` field — see liftCorpusToBundle /
// mergeCorpusIntoSourceMeta below for the exact mirror of that plumbing.
//
// Honesty invariants baked into the schema (R1/R4 — the schema must not be able
// to LIE):
//   • review_status defaults to 'machine' — an MT translation is NEVER labelled
//     'human_proofread' ("вычитано") until a human actually proofreads it.
//   • audio_status defaults to 'tts' — TTS audio is NEVER labelled 'human'
//     ("native").
//   • orig_language is honest — a work translated from Yiddish/German/Russian
//     records its true source language, not 'he'.
// These are ENUM-only fields; free strings like "вычитано" are rejected by
// validateCorpus(), which is the R1 gate the smoke runs (mirrors
// `audit:note-fields`).

const crypto = require("crypto");

// ── Versions ────────────────────────────────────────────────────────────────
// Contract version of the `corpus` object itself (bump additively).
const CORPUS_SCHEMA_VERSION = 1;
// Bundle marker for the additive corpus layer = the doc-level "v2.1". It is a
// purely ADDITIVE SIBLING field on library.json (whose own `schema_version`
// stays 1 and is left untouched). Existing importers ignore unknown fields
// (forward-compatible), so this needs no version bump or compat shim. NOTE: the
// `payloadVer > KNOWN_MAX` guard in local-db.js reads the SEPARATE
// notes_advanced payload, not library.json — corpus_meta_version never
// interacts with it.
const CORPUS_META_VERSION = 1;

// ── Controlled vocabularies ──────────────────────────────────────────────────
// Honesty enums (R1): closed sets. Anything else is an ERROR in validateCorpus.
const REVIEW_STATUS = ["machine", "machine_assisted", "human_proofread"];
const AUDIO_STATUS = ["none", "tts", "human"];
// Audience track (two-shelf model) and register/era are curatorial (R7/R8).
// `track`/`register` are closed; `era` is a SUGGESTED vocab that R7 may extend,
// so an unknown era is a WARNING, not an error (curation must not be blocked).
const TRACK = ["accessible", "literary"];
const REGISTER = ["literary", "spoken", "archaic", "poetic", "mixed"];
const ERA = [
  "biblical", "rabbinic", "medieval",
  "haskalah", "tehiya", "mandate", "modern", "contemporary",
];

// The canonical, ordered field set of the `corpus` object. buildCorpus emits
// exactly these keys so the shape is stable across the corpus.
const CORPUS_FIELDS = [
  "schema",
  "byehuda_id",
  "content_hash",
  "author",
  "author_slug",
  "author_uri",
  "translator",
  "translator_uri",
  "orig_language",
  "era",
  "genre",
  "themes",
  "register",
  "track",
  "difficulty",
  "series",
  "provenance",
  "attribution",
  "review_status",
  "audio_status",
];

// Facets exposed to the Reading Room discovery surface (P0-003). Used by
// filterByFacet so the UI and the smoke share one definition.
const FACET_FIELDS = ["author", "author_slug", "era", "genre", "register", "track", "orig_language"];

// Canonical Hebrew niqqud + cantillation range — identical to the rest of the
// codebase (db/premium/providers/pealim.js:66, dictaMorph.js:69,
// scripts/premium/build-notes-from-bundle.js:56). Reused, not reinvented (R1).
const NIQQUD_RE = /[֑-ׇ]/g;
// Zero-width / bidi-format characters that must not affect content identity.
const FORMAT_RE = /[​-‏‪-‮⁠﻿]/g;

// ── helpers ──────────────────────────────────────────────────────────────────
function _str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function _strArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => _str(x)).filter(Boolean);
}

// Stable latin slug for an author ID-anchor. We do NOT transliterate Hebrew here
// (R1/R3: don't fabricate a lossy latinisation); a slug is produced only from a
// latin name the catalogue supplies, otherwise null. This lays the ID
// foundation so a future graph (R3) can attach authors by id, not by display
// text — without inventing data now.
function authorSlug(latinName) {
  const s = _str(latinName);
  if (!s) return null;
  const slug = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // drop combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length ? slug : null;
}

// Normalize Hebrew for content identity: NFC, strip niqqud/cantillation, strip
// zero-width/format chars, collapse whitespace. Niqqud-INSENSITIVE so the same
// work dedups whether the source happened to be vocalized or plain.
function normalizeForHash(text) {
  return String(text == null ? "" : text)
    .normalize("NFC")
    .replace(NIQQUD_RE, "")
    .replace(FORMAT_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Deterministic content hash over a work's plain Hebrew. `parts` may be the full
// source string or an array of per-row he_plain (preferred: preserves line
// boundaries). Returns 'sha256:<hex>', or NULL for empty/blank content. This is
// the canonical dedup / re-ingest key (R6 "дедуп по content_hash"); the recipe
// is documented so it is honest and reproducible (R3: stable id, not a guess).
function computeContentHash(parts) {
  const arr = Array.isArray(parts) ? parts : [parts];
  const joined = arr.map(normalizeForHash).filter(Boolean).join("\n");
  // Empty / all-blank content must NOT hash to the well-known empty-string
  // SHA-256 — that sentinel passes the format check and would silently collapse
  // every content-less work into one dedup bucket (silent data loss). Return
  // null so the caller leaves content_hash unset (→ 'dedup unavailable'
  // warning) rather than fingerprinting nothing as if it were content.
  if (!joined) return null;
  return "sha256:" + crypto.createHash("sha256").update(joined, "utf8").digest("hex");
}

// difficulty band (BRR-P1-007 computed field) — pinned NOW so inconsistent data
// can't accrete before the computing ticket lands (R6 anti-migration). Integer
// 1..5 or null; anything else coerces to null in buildCorpus and is rejected by
// validateCorpus.
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 5;
function _difficultyBand(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < DIFFICULTY_MIN || n > DIFFICULTY_MAX) return null;
  return n;
}

// Chapter-membership object (BRR-P0-004 A). Normalized to a stable shape or null.
// { work_byehuda_id, work_title, part (1..n), total }. Used by the Reading Room to
// group a multi-part work and label "Глава part/total".
function _series(v) {
  if (!v || typeof v !== "object") return null;
  const part = Number(v.part), total = Number(v.total);
  return {
    work_byehuda_id: _str(v.work_byehuda_id),
    work_title: _str(v.work_title),
    part: Number.isInteger(part) && part > 0 ? part : null,
    total: Number.isInteger(total) && total > 0 ? total : null,
  };
}

// ISO-639 1/3 code shape (optional region/script subtag). Used to flag obvious
// garbage/typos in orig_language (e.g. 'klingon', 'Hebrew') — it is a facet, so
// a typo silently breaks filtering AND the honesty story.
const LANG_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]+)?$/i;

// Wikidata QID URL shape (BRR-P0-004). The Project Ben-Yehuda catalogue supplies
// author_uris / translator_uris as Wikidata entity URLs (e.g.
// https://wikidata.org/wiki/Q1376036). We store them as a STABLE external
// identity anchor (R3: attach by id, not display text) — better than a fabricated
// slug. Shape is WARNING-only (an odd/multi-value URI must not block curation).
const WIKIDATA_QID_RE = /^https?:\/\/(www\.)?wikidata\.org\/wiki\/Q\d+$/i;

// ── builder ──────────────────────────────────────────────────────────────────
// Produce a normalized, defaulted `corpus` object from a loose input (e.g. a
// pseudocatalogue.csv row + computed fields). Honest defaults are applied; the
// shape is stable (exactly CORPUS_FIELDS). Population of the descriptive fields
// from the real catalogue is BRR-P0-004 — buildCorpus is the building block.
function buildCorpus(input) {
  const i = input && typeof input === "object" ? input : {};
  const provenanceIn = i.provenance && typeof i.provenance === "object" ? i.provenance : {};
  const corpus = {
    schema: CORPUS_SCHEMA_VERSION,
    byehuda_id: _str(i.byehuda_id),
    content_hash: _str(i.content_hash),
    author: _str(i.author),
    author_slug: _str(i.author_slug) || authorSlug(i.author_latin),
    // Wikidata QID URL = stable author/translator identity anchor (R3/R6), from
    // the catalogue's author_uris / translator_uris. Honest null when absent;
    // never fabricated. Validated WARNING-only (see WIKIDATA_QID_RE).
    author_uri: _str(i.author_uri),
    translator: _str(i.translator),
    translator_uri: _str(i.translator_uri),
    // Honest default: original Hebrew unless the catalogue says otherwise.
    orig_language: _str(i.orig_language) || "he",
    era: _str(i.era),
    genre: _str(i.genre),
    themes: _strArray(i.themes),
    register: _str(i.register),
    track: _str(i.track),
    // difficulty is a Phase-2 computed field (BRR-P1-007), null until then.
    // Type is pinned now (integer 1..5 or null); garbage coerces to null.
    difficulty: _difficultyBand(i.difficulty),
    // BRR-P0-004 A — chapter membership for a multi-part work (a long work split into
    // chapters → its own shelf=TOC). null for standalone works. Additive, nullable.
    series: _series(i.series),
    provenance: {
      source: _str(provenanceIn.source),
      url: _str(provenanceIn.url),
      license: _str(provenanceIn.license),
      // Evidence anchors for human claims (R1): a named reviewer / timestamp
      // lets a 'human_proofread' claim be trusted instead of warned. null until
      // R7 actually proofreads (BRR-P0-005 owns the audio side).
      reviewer: _str(provenanceIn.reviewer),
      reviewed_at: _str(provenanceIn.reviewed_at),
    },
    attribution: _str(i.attribution),
    // Honest defaults — see module header. Never silently upgrade to a
    // human/proofread claim.
    review_status: REVIEW_STATUS.includes(i.review_status) ? i.review_status : "machine",
    audio_status: AUDIO_STATUS.includes(i.audio_status) ? i.audio_status : "tts",
  };
  return corpus;
}

// ── validator (R1 honesty gate) ───────────────────────────────────────────────
// Returns { ok, errors, warnings }. ERRORS = the schema would LIE or is
// structurally broken → the smoke gate fails the build (mirrors
// audit:note-fields). WARNINGS = curation is incomplete but honest.
function validateCorpus(corpus, opts) {
  const o = opts || {};
  const errors = [];
  const warnings = [];
  if (!corpus || typeof corpus !== "object") {
    return { ok: false, errors: ["corpus is missing or not an object"], warnings: [] };
  }
  // schema
  if (corpus.schema !== CORPUS_SCHEMA_VERSION) {
    if (typeof corpus.schema !== "number") errors.push("schema must be a number");
    else if (corpus.schema > CORPUS_SCHEMA_VERSION) warnings.push("corpus.schema " + corpus.schema + " is newer than this build (" + CORPUS_SCHEMA_VERSION + ")");
    else errors.push("corpus.schema " + corpus.schema + " is older than current " + CORPUS_SCHEMA_VERSION + " — re-run buildCorpus");
  }
  // honesty enums — ERRORS (the lie-prevention invariant)
  if (!REVIEW_STATUS.includes(corpus.review_status)) errors.push("review_status '" + corpus.review_status + "' not in [" + REVIEW_STATUS.join(", ") + "] — an MT text must not be labelled proofread");
  if (!AUDIO_STATUS.includes(corpus.audio_status)) errors.push("audio_status '" + corpus.audio_status + "' not in [" + AUDIO_STATUS.join(", ") + "] — TTS must not be labelled native");
  // closed curatorial enums — ERRORS when present-but-invalid
  if (corpus.track != null && !TRACK.includes(corpus.track)) errors.push("track '" + corpus.track + "' not in [" + TRACK.join(", ") + "]");
  if (corpus.register != null && !REGISTER.includes(corpus.register)) errors.push("register '" + corpus.register + "' not in [" + REGISTER.join(", ") + "]");
  // suggested vocab — WARNING (R7 may extend)
  if (corpus.era != null && !ERA.includes(corpus.era)) warnings.push("era '" + corpus.era + "' not in suggested vocab [" + ERA.join(", ") + "]");
  // content_hash format — also reject the empty-string SHA-256 sentinel, which
  // is well-formed but means "no content" (content-less work mislabelled).
  if (corpus.content_hash != null && !/^sha256:[0-9a-f]{64}$/.test(corpus.content_hash)) errors.push("content_hash '" + corpus.content_hash + "' is not 'sha256:<64 hex>'");
  if (corpus.content_hash === "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") errors.push("content_hash is the empty-string SHA-256 — the work has no Hebrew content (mis-extracted?)");
  // difficulty — integer band or null (pinned now so bad data can't accrete).
  if (corpus.difficulty != null && !(Number.isInteger(corpus.difficulty) && corpus.difficulty >= DIFFICULTY_MIN && corpus.difficulty <= DIFFICULTY_MAX)) errors.push("difficulty must be an integer " + DIFFICULTY_MIN + ".." + DIFFICULTY_MAX + " or null");
  // honesty cross-check: a translated work cannot have Hebrew as its original
  // language (R1) — surface as an error so curation can't silently mislabel.
  if (corpus.translator && corpus.orig_language === "he") errors.push("translator set but orig_language='he' — a translated work's orig_language must be the true source language");
  // orig_language sanity — flag obvious garbage/typos (it is a facet; a typo
  // breaks filtering and the honesty story). WARNING, not error (open vocab).
  if (corpus.orig_language != null && !LANG_CODE_RE.test(String(corpus.orig_language))) warnings.push("orig_language '" + corpus.orig_language + "' is not an ISO-639 code");
  // author_uri / translator_uri shape — WARNING only (BRR-P0-004). A malformed or
  // multi-value URI must not block curation, but a non-Wikidata string breaks the
  // identity-anchor story, so surface it for a spot-check.
  if (corpus.author_uri != null && !WIKIDATA_QID_RE.test(String(corpus.author_uri))) warnings.push("author_uri '" + corpus.author_uri + "' is not a Wikidata QID URL");
  if (corpus.translator_uri != null && !WIKIDATA_QID_RE.test(String(corpus.translator_uri))) warnings.push("translator_uri '" + corpus.translator_uri + "' is not a Wikidata QID URL");
  // human claims need evidence (R1): the enum PERMITS human_proofread/human,
  // but an unverified human claim on otherwise-machine data is exactly the lie
  // this module exists to prevent. Warn (so a reviewer spot-checks) unless a
  // named reviewer / evidence is attached. A free-string lie ('вычитано') is
  // already an enum ERROR above; this catches the structured-enum lie.
  if (corpus.review_status === "human_proofread" && !(corpus.provenance && (corpus.provenance.reviewer || corpus.provenance.reviewed_at))) warnings.push("review_status='human_proofread' without provenance.reviewer/reviewed_at — verify a human actually proofread this, do not self-assert");
  if (corpus.audio_status === "human") warnings.push("audio_status='human' — verify this is real human audio, not TTS (audio provenance lands in BRR-P0-005)");
  // themes must be a string array
  if (corpus.themes != null && !(Array.isArray(corpus.themes) && corpus.themes.every((t) => typeof t === "string"))) errors.push("themes must be an array of strings");
  // completeness warnings (not lies, just incomplete curation)
  if (!corpus.byehuda_id) warnings.push("byehuda_id missing — re-ingest idempotency degraded to content_hash only");
  if (!corpus.content_hash) warnings.push("content_hash missing — dedup unavailable for this work");
  if (!corpus.author) warnings.push("author missing");
  if (!corpus.provenance || !corpus.provenance.source) warnings.push("provenance.source missing — attribution required by the public-domain license (R6)");
  if (o.requireAttribution && !corpus.attribution) warnings.push("attribution missing");
  return { ok: errors.length === 0, errors, warnings };
}

// ── facets & dedup (discovery primitives, R6) ─────────────────────────────────
// Read the corpus object off a unit that may carry it top-level (bundle item) or
// nested in source_meta (OPFS export item).
function getCorpus(unit) {
  if (!unit || typeof unit !== "object") return null;
  if (unit.corpus && typeof unit.corpus === "object") return unit.corpus;
  if (unit.source_meta && typeof unit.source_meta === "object" && unit.source_meta.corpus) return unit.source_meta.corpus;
  return null;
}

function readFacet(corpus, facet) {
  if (!corpus) return null;
  const v = corpus[facet];
  return v == null ? null : v;
}

// Filter a list of units (bundle items / export texts) by a facet value.
function filterByFacet(units, facet, value) {
  if (!FACET_FIELDS.includes(facet)) throw new Error("unknown facet: " + facet);
  return (Array.isArray(units) ? units : []).filter((u) => readFacet(getCorpus(u), facet) === value);
}

// Dedup by content_hash: keep the FIRST unit per hash. Units without a hash are
// kept as-is (can't be deduped honestly). Returns { kept, dropped }.
function dedupeByContentHash(units) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  for (const u of Array.isArray(units) ? units : []) {
    const c = getCorpus(u);
    const h = c && c.content_hash ? String(c.content_hash) : null;
    if (h && seen.has(h)) { dropped.push(u); continue; }
    if (h) seen.add(h);
    kept.push(u);
  }
  return { kept, dropped };
}

// ── transport mirror (spec for public/db/local-db.js plumbing) ────────────────
// EXPORT side: given an OPFS text's parsed source_meta, return the value to emit
// as the bundle item's top-level `corpus` field (first-class for R6/discovery
// and the Android validator). The object also remains inside source_meta on
// export, so even an old importer preserves it inside the blob (robust round-
// trip through any app version).
function liftCorpusToBundle(sourceMeta) {
  return sourceMeta && typeof sourceMeta === "object" && sourceMeta.corpus ? sourceMeta.corpus : null;
}

// IMPORT side: given a bundle item, return the source_meta object to persist in
// OPFS (the single home is source_meta_json.corpus). Prefer the first-class
// top-level `corpus`, fall back to a nested one, preserve all other source_meta.
function mergeCorpusIntoSourceMeta(item) {
  const base = item && item.source_meta && typeof item.source_meta === "object" ? { ...item.source_meta } : {};
  const corpus = (item && item.corpus && typeof item.corpus === "object")
    ? item.corpus
    : (base.corpus && typeof base.corpus === "object" ? base.corpus : null);
  if (corpus) base.corpus = corpus;
  return Object.keys(base).length ? base : null;
}

module.exports = {
  CORPUS_SCHEMA_VERSION,
  CORPUS_META_VERSION,
  REVIEW_STATUS,
  AUDIO_STATUS,
  TRACK,
  REGISTER,
  ERA,
  CORPUS_FIELDS,
  FACET_FIELDS,
  authorSlug,
  normalizeForHash,
  computeContentHash,
  buildCorpus,
  validateCorpus,
  getCorpus,
  readFacet,
  filterByFacet,
  dedupeByContentHash,
  liftCorpusToBundle,
  mergeCorpusIntoSourceMeta,
};
