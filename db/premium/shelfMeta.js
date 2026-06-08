"use strict";

// shelfMeta.js — BRR-P0-003 · Reading Room shelf/collection contract (R6/R8).
//
// A shelf is a CURATED, ORDERED list of works in ONE track (accessible|literary)
// with a title + editorial intro — a pedagogical ROUTE, not a flat list (R8).
// Storage Option A (owner-approved): an OPFS `shelves` table (migration 054)
// that round-trips through the bundle (`library.json.shelves[]`), mirroring how
// texts/corpus ride the bundle. Members reference texts by **text_key** — the
// only id that survives a bundle import (the text `id` is regenerated; see
// public/db/local-db.js importBundle). This is a Node-only contract (producer +
// smoke); the browser (local-db.js) transports rows ↔ bundle shelf objects.
//
// The TRACK enum is REUSED from corpusMeta (single source of truth) so a shelf's
// track and a text's corpus.track can be cross-checked (validateMembership).

const corpusMeta = require("./corpusMeta");

const SHELF_SCHEMA_VERSION = 1;
const TRACK = corpusMeta.TRACK; // ["accessible", "literary"]

// Canonical, ordered field set of a shelf object (what buildShelf emits).
const SHELF_FIELDS = ["schema", "slug", "title", "track", "era", "genre", "editorial_intro", "items", "order"];

function _str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function _int(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// Stable latin slug = the shelf's portable identity (its "text_key"): survives a
// round-trip and is the upsert key on import. Derived from an explicit slug or
// from the title.
function slugify(s) {
  const t = _str(s);
  if (!t) return null;
  const slug = t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length ? slug : null;
}

// Normalize a member list to an ordered, dense [{text_key, order}]. Accepts bare
// "text_key" strings or {text_key, order} objects; drops entries with no
// text_key (can't reference a work honestly); sorts by given order then input
// position and re-packs order to contiguous 0..n-1.
function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  const out = [];
  arr.forEach((it, i) => {
    const tk = it && (typeof it === "string" ? _str(it) : _str(it.text_key));
    if (!tk) return;
    const givenOrder = it && typeof it === "object" && it.order != null ? _int(it.order) : null;
    out.push({ text_key: tk, order: givenOrder == null ? i : givenOrder, _pos: i });
  });
  out.sort((a, b) => (a.order - b.order) || (a._pos - b._pos));
  return out.map((it, i) => ({ text_key: it.text_key, order: i }));
}

// Build a normalized, defaulted shelf from a loose input (curation row). Stable
// shape = exactly SHELF_FIELDS.
function buildShelf(input) {
  const i = input && typeof input === "object" ? input : {};
  return {
    schema: SHELF_SCHEMA_VERSION,
    slug: _str(i.slug) || slugify(i.title),
    title: _str(i.title),
    track: _str(i.track),
    era: _str(i.era),
    genre: _str(i.genre),
    editorial_intro: _str(i.editorial_intro),
    items: normalizeItems(i.items),
    order: _int(i.order),
  };
}

// Validate a shelf. ERRORS = structurally broken (would corrupt discovery).
// WARNINGS = curation is incomplete but honest (e.g. no intro — R8 wants a route,
// not a bare list; empty shelf — ensure the empty-state is honest).
function validateShelf(shelf) {
  const errors = [];
  const warnings = [];
  if (!shelf || typeof shelf !== "object") return { ok: false, errors: ["shelf missing or not an object"], warnings: [] };
  if (shelf.schema !== SHELF_SCHEMA_VERSION) {
    if (typeof shelf.schema !== "number") errors.push("schema must be a number");
    else if (shelf.schema > SHELF_SCHEMA_VERSION) warnings.push("shelf.schema " + shelf.schema + " is newer than this build (" + SHELF_SCHEMA_VERSION + ")");
    else errors.push("shelf.schema " + shelf.schema + " is older than current " + SHELF_SCHEMA_VERSION + " — re-run buildShelf");
  }
  if (!shelf.slug) errors.push("slug required — stable shelf id that survives a bundle round-trip");
  if (!shelf.title) errors.push("title required");
  if (!TRACK.includes(shelf.track)) errors.push("track '" + shelf.track + "' not in [" + TRACK.join(", ") + "]");
  if (!Array.isArray(shelf.items)) {
    errors.push("items must be an array");
  } else {
    shelf.items.forEach((it, idx) => {
      if (!it || typeof it !== "object" || !it.text_key) errors.push("items[" + idx + "] missing text_key");
      else if (it.order != null && !Number.isInteger(it.order)) errors.push("items[" + idx + "].order must be an integer");
    });
    const keys = shelf.items.map((it) => it && it.text_key).filter(Boolean);
    if (new Set(keys).size !== keys.length) warnings.push("duplicate text_key in items");
  }
  if (shelf.order != null && !Number.isInteger(shelf.order)) errors.push("order must be an integer or null");
  if (!shelf.editorial_intro) warnings.push("editorial_intro missing — a shelf is a pedagogical route, not a bare list (R8)");
  if (Array.isArray(shelf.items) && shelf.items.length === 0) warnings.push("shelf has no items — ensure the empty-state is honest, not a dead-end (R8)");
  return { ok: errors.length === 0, errors, warnings };
}

// Cross-check membership against member texts. `textsByKey` is a Map or object of
// text_key -> (bundle text item | corpus object). Returns warnings for members
// not present in the bundle, or members whose corpus.track disagrees with the
// shelf's track (a curation error — surfaced, not hidden).
function validateMembership(shelf, textsByKey) {
  const warnings = [];
  const get = (k) => (textsByKey instanceof Map ? textsByKey.get(k) : (textsByKey || {})[k]);
  for (const it of (shelf && shelf.items) || []) {
    const unit = get(it.text_key);
    if (unit == null) { warnings.push("member '" + it.text_key + "' not found in this bundle"); continue; }
    let corpus = corpusMeta.getCorpus(unit);
    if (!corpus && unit && unit.track) corpus = unit; // unit IS a corpus object
    if (corpus && corpus.track && shelf.track && corpus.track !== shelf.track) {
      warnings.push("member '" + it.text_key + "' corpus.track=" + corpus.track + " != shelf.track=" + shelf.track + " (curation mismatch)");
    }
  }
  return warnings;
}

module.exports = {
  SHELF_SCHEMA_VERSION,
  TRACK,
  SHELF_FIELDS,
  slugify,
  normalizeItems,
  buildShelf,
  validateShelf,
  validateMembership,
};
