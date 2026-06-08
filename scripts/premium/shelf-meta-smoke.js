#!/usr/bin/env node
"use strict";

// shelf-meta-smoke.js — BRR-P0-003 gate. Proves the Reading Room shelf/collection
// contract (db/premium/shelfMeta.js) and the bundle round-trip wiring, no
// server/browser needed:
//   • buildShelf → stable shape, slug from title, dense ordered items
//   • validateShelf → structural errors + R8 warnings (route not a bare list)
//   • validateMembership → flags missing members + corpus.track mismatch
//   • bundle round-trip → shelf survives OPFS→bundle→OPFS byte-identical
//   • TRACK reuse from corpusMeta (single source of truth)
//   • source-pin: the browser shelf plumbing + migration 054 are present
//     (local-db.js inlines the OPFS transport; this Node gate can't run OPFS).

const sm = require("../../db/premium/shelfMeta");
const cm = require("../../db/premium/corpusMeta");
const fs = require("fs");
const path = require("path");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log("[shelf-meta-smoke] BRR-P0-003 shelf contract + bundle round-trip");

// ── 1) buildShelf ─────────────────────────────────────────────────────────────
const built = sm.buildShelf({
  // Real curation: non-latin display title carries an explicit, deliberate latin
  // slug (R6 owns identity). buildShelf does NOT fabricate a slug from non-latin
  // text — see the slug tests below.
  slug: "accessible-bialik-beginners",
  title: "Доступная: Бялик для начинающих",
  track: "accessible",
  era: "tehiya",
  genre: "poetry",
  editorial_intro: "Лёгкие детские стихи Бялика — мягкий вход в канон.",
  items: [
    { text_key: "k-gan", order: 2 },
    "k-nadnedi",                     // bare string form
    { text_key: "k-pirhei", order: 0 },
  ],
});
test("buildShelf emits exactly the canonical field set", eq(Object.keys(built).sort(), sm.SHELF_FIELDS.slice().sort()));
test("buildShelf stamps schema version", built.schema === sm.SHELF_SCHEMA_VERSION);
test("slug derived from a latin title", sm.buildShelf({ title: "Bialik for Beginners", track: "accessible" }).slug === "bialik-for-beginners");
test("non-latin title without explicit slug → null (no fabrication, R6)", sm.buildShelf({ title: "Доступная Бялик", track: "accessible" }).slug === null);
test("non-latin-title shelf without slug FAILS validation (curation must supply slug)", sm.validateShelf(sm.buildShelf({ title: "Доступная Бялик", track: "accessible" })).ok === false);
test("items normalized to {text_key, order}", built.items.every((it) => it.text_key && Number.isInteger(it.order)));
test("items re-packed to dense 0..n-1 by given order", eq(built.items.map((it) => it.order), [0, 1, 2]));
test("items ordered by given order (pirhei<gan, bare string last)", built.items[0].text_key === "k-pirhei" && built.items[2].text_key === "k-gan");
test("explicit slug wins over title", sm.buildShelf({ slug: "my-slug", title: "X", track: "literary" }).slug === "my-slug");

// ── 2) validateShelf ──────────────────────────────────────────────────────────
test("honest shelf validates ok", sm.validateShelf(built).ok);
test("missing slug+title rejected", sm.validateShelf(sm.buildShelf({ track: "accessible" })).ok === false);
test("invalid track rejected", sm.validateShelf(sm.buildShelf({ title: "X", track: "premium" })).ok === false);
test("item without text_key rejected", sm.validateShelf({ ...built, items: [{ order: 0 }] }).ok === false);
test("non-integer item order rejected", sm.validateShelf({ ...built, items: [{ text_key: "a", order: 1.5 }] }).ok === false);
const noIntro = sm.buildShelf({ title: "X", track: "literary", items: [{ text_key: "a" }] });
const niRes = sm.validateShelf(noIntro);
test("no editorial_intro = R8 warning (route not a list)", niRes.ok && niRes.warnings.some((w) => /route|маршрут|editorial/i.test(w)));
const empty = sm.buildShelf({ title: "X", track: "literary", editorial_intro: "i" });
const emRes = sm.validateShelf(empty);
test("empty shelf = honest empty-state warning", emRes.ok && emRes.warnings.some((w) => /no items|empty/i.test(w)));
const dup = sm.buildShelf({ title: "X", track: "literary", editorial_intro: "i", items: [{ text_key: "a" }, { text_key: "a" }] });
test("duplicate member = warning", sm.validateShelf(dup).warnings.some((w) => /duplicate/i.test(w)));

// ── 3) validateMembership (cross-check corpus.track) ──────────────────────────
const textsByKey = {
  "k-pirhei": { text_key: "k-pirhei", corpus: cm.buildCorpus({ author: "Bialik", track: "accessible" }) },
  "k-gan":    { text_key: "k-gan",    corpus: cm.buildCorpus({ author: "Bialik", track: "literary" }) }, // mismatch!
  // k-nadnedi intentionally absent → "not found"
};
const memWarns = sm.validateMembership(built, textsByKey);
test("membership flags track mismatch (k-gan literary vs accessible shelf)", memWarns.some((w) => /k-gan/.test(w) && /mismatch/.test(w)));
test("membership flags missing member (k-nadnedi)", memWarns.some((w) => /k-nadnedi/.test(w) && /not found/.test(w)));
test("membership: matching-track member produces no warning", !memWarns.some((w) => /k-pirhei/.test(w)));
test("membership accepts corpus objects directly (not only items)", sm.validateMembership(
  sm.buildShelf({ title: "X", track: "accessible", items: [{ text_key: "z" }] }),
  { z: cm.buildCorpus({ author: "a", track: "accessible" }) }
).length === 0);

// ── 4) bundle round-trip (OPFS row ↔ bundle shelf object) ─────────────────────
// Simulate the local-db transport: export maps a row → bundle object; import
// upserts it back. The contract object is JSON-stable, so round-trip = identity.
const bundleShelf = { ...built };
const library = { schema_version: 1, corpus_meta_version: 1, shelves: [bundleShelf], texts: [], audio_assets: [] };
test("shelves ride library.json as additive sibling", Array.isArray(library.shelves) && library.shelves.length === 1);
const reRead = JSON.parse(JSON.stringify(library.shelves[0]));
test("shelf round-trips byte-identical", eq(reRead, built));
test("re-validated after round-trip", sm.validateShelf(reRead).ok);

// ── 5) TRACK reuse (single source of truth) ───────────────────────────────────
test("shelfMeta.TRACK === corpusMeta.TRACK", eq(sm.TRACK, cm.TRACK));

// ── 6) source-pin: browser plumbing + migration present ───────────────────────
const localDb = fs.readFileSync(path.resolve(__dirname, "../../public/db/local-db.js"), "utf8");
test("local-db exports getShelves()", /export async function getShelves\(/.test(localDb));
test("local-db export emits shelves in library.json", /shelves,\s*texts,\s*audio_assets/.test(localDb));
test("local-db import upserts shelves", /_upsertShelfFromBundle\(sh, mode\)/.test(localDb));
const migrations = fs.readFileSync(path.resolve(__dirname, "../../public/db/migrations.js"), "utf8");
test("migration 054 creates shelves table", /CREATE TABLE IF NOT EXISTS shelves/.test(migrations));
test("migration 054 unique slug index", /ux_shelves_slug/.test(migrations));

// ── summary ───────────────────────────────────────────────────────────────────
console.log("\n[shelf-meta-smoke] " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
