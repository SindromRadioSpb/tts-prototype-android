#!/usr/bin/env node
"use strict";

// corpus-meta-smoke.js — BRR-P0-001 gate. Proves the corpus-metadata contract
// (db/premium/corpusMeta.js) and the bundle v2.1 round-trip end to end, no
// server/browser needed:
//   • buildCorpus → stable shape + honest defaults
//   • content_hash → deterministic + niqqud-insensitive
//   • validateCorpus → R1 honesty gate (rejects MT-as-proofread / TTS-as-native)
//   • bundle v2.1 round-trip → corpus survives OPFS→bundle→OPFS byte-identical
//   • dedup by content_hash + facet filter (R6 discovery primitives)
//
// The round-trip uses corpusMeta's transport mirrors (liftCorpusToBundle /
// mergeCorpusIntoSourceMeta), which public/db/local-db.js replicates inline on
// its export/import paths — keep the two in sync (each cites the other).

const cm = require("../../db/premium/corpusMeta");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log("[corpus-meta-smoke] BRR-P0-001 contract + bundle v2.1");

// ── 1) buildCorpus: shape + honest defaults ──────────────────────────────────
const built = cm.buildCorpus({
  byehuda_id: "p101",
  author: "חיים נחמן ביאליק",
  author_latin: "Hayim Nahman Bialik",
  genre: "poetry",
  era: "tehiya",
  track: "accessible",
  register: "poetic",
  themes: ["childhood", "nature", ""],   // empty dropped
  provenance: { source: "Project Ben-Yehuda", url: "https://benyehuda.org/read/101", license: "public-domain" },
  attribution: "Текст: Проект Бен-Йехуда",
});
test("buildCorpus stamps schema version", built.schema === cm.CORPUS_SCHEMA_VERSION);
test("buildCorpus emits exactly the canonical field set", eq(Object.keys(built).sort(), cm.CORPUS_FIELDS.slice().sort()));
test("honest default review_status=machine", built.review_status === "machine");
test("honest default audio_status=tts", built.audio_status === "tts");
test("honest default orig_language=he", built.orig_language === "he");
test("author_slug derived from latin name", built.author_slug === "hayim-nahman-bialik");
test("themes normalized (empty dropped)", eq(built.themes, ["childhood", "nature"]));
test("difficulty null until Phase 2", built.difficulty === null);

// ── 2) content_hash: deterministic + niqqud-insensitive ───────────────────────
const plain = ["שלום עולם", "מה נשמע"];
const vocalized = ["שָׁלוֹם עוֹלָם", "מַה נִּשְׁמַע"];
const h1 = cm.computeContentHash(plain);
const h2 = cm.computeContentHash(plain);
const h3 = cm.computeContentHash(vocalized);
const h4 = cm.computeContentHash(["שלום עולם", "טקסט אחר"]);
test("content_hash format sha256:<64hex>", /^sha256:[0-9a-f]{64}$/.test(h1));
test("content_hash deterministic", h1 === h2);
test("content_hash niqqud-insensitive (plain == vocalized)", h1 === h3, h1 + " vs " + h3);
test("content_hash differs for different text", h1 !== h4);

// ── 3) validateCorpus: R1 honesty gate ───────────────────────────────────────
const honest = cm.buildCorpus({ byehuda_id: "p1", author: "a", content_hash: h1, provenance: { source: "Project Ben-Yehuda" } });
test("honest corpus validates ok", cm.validateCorpus(honest).ok);

// a free-string proofread claim must be rejected (the whole point: no lying)
const lyingReview = { ...honest, review_status: "вычитано" };
test("R1: free-string review_status rejected", cm.validateCorpus(lyingReview).ok === false);

const lyingAudio = { ...honest, audio_status: "native" };
test("R1: audio_status 'native' rejected", cm.validateCorpus(lyingAudio).ok === false);

const transHe = cm.buildCorpus({ author: "a", translator: "t", orig_language: "he", content_hash: h1 });
test("R1: translator + orig_language=he rejected", cm.validateCorpus(transHe).ok === false);

const transYi = cm.buildCorpus({ author: "Mendele", translator: "t", orig_language: "yi", content_hash: h1, byehuda_id: "p9", provenance: { source: "Project Ben-Yehuda" } });
test("translated work with honest orig_language validates", cm.validateCorpus(transYi).ok);

const badHash = { ...honest, content_hash: "deadbeef" };
test("malformed content_hash rejected", cm.validateCorpus(badHash).ok === false);

const badTrack = { ...honest, track: "premium" };
test("closed enum track rejected when invalid", cm.validateCorpus(badTrack).ok === false);

const noByehuda = cm.buildCorpus({ author: "a", content_hash: h1, provenance: { source: "x" } });
const nbRes = cm.validateCorpus(noByehuda);
test("missing byehuda_id = warning, not error", nbRes.ok && nbRes.warnings.some((w) => /byehuda_id/.test(w)));

// suggested era vocab → warning, still ok
const oddEra = cm.buildCorpus({ author: "a", content_hash: h1, era: "renaissance", byehuda_id: "p2", provenance: { source: "x" } });
const eRes = cm.validateCorpus(oddEra);
test("unknown era = warning, still valid (R7 extensible)", eRes.ok && eRes.warnings.some((w) => /era/.test(w)));

// ── 4) bundle v2.1 round-trip (OPFS → bundle → OPFS, byte-identical) ──────────
// Mirror of public/db/local-db.js export/import plumbing.
const opfsSourceMeta = { origin: "ingestion", imported_at: "2026-06-08T00:00:00Z", corpus: built };
// export: lift corpus to a first-class top-level bundle field
const bundleItem = {
  text_id: "t1",
  source_meta: opfsSourceMeta,
  corpus: cm.liftCorpusToBundle(opfsSourceMeta),
};
const library = { schema_version: 1, corpus_meta_version: cm.CORPUS_META_VERSION, texts: [bundleItem], audio_assets: [] };
test("bundle v2.1 marker present + canonical", library.corpus_meta_version === cm.CORPUS_META_VERSION && cm.CORPUS_META_VERSION === 1);
test("bundle item carries first-class top-level corpus", eq(bundleItem.corpus, built));
// import: fold corpus back into source_meta (the OPFS home), preserve other keys
const reSourceMeta = cm.mergeCorpusIntoSourceMeta(bundleItem);
test("import preserves non-corpus source_meta keys", reSourceMeta.origin === "ingestion" && reSourceMeta.imported_at === "2026-06-08T00:00:00Z");
test("import round-trips corpus byte-identical", eq(reSourceMeta.corpus, built));
test("full source_meta round-trips byte-identical", eq(reSourceMeta, opfsSourceMeta));
// old importer that only reads source_meta (ignores top-level corpus) still keeps it
const oldImport = bundleItem.source_meta;
test("legacy importer preserves corpus inside source_meta", eq(oldImport.corpus, built));

// ── 5) dedup by content_hash (R6) ─────────────────────────────────────────────
const cA = cm.buildCorpus({ author: "a", content_hash: h1, byehuda_id: "p1" });
const cBsame = cm.buildCorpus({ author: "a-dup", content_hash: h1, byehuda_id: "p1b" });
const cC = cm.buildCorpus({ author: "c", content_hash: h4, byehuda_id: "p2" });
const cNo = cm.buildCorpus({ author: "d" });   // no hash → kept as-is
const dd = cm.dedupeByContentHash([{ corpus: cA }, { corpus: cBsame }, { corpus: cC }, { corpus: cNo }]);
test("dedup keeps first per content_hash", dd.kept.length === 3 && dd.dropped.length === 1);
test("dedup drops the later duplicate", cm.getCorpus(dd.dropped[0]) === cBsame);
test("dedup keeps hash-less unit (no false dedup)", dd.kept.some((u) => cm.getCorpus(u) === cNo));

// ── 6) facet filter (R6 discovery) ────────────────────────────────────────────
const units = [
  { corpus: cm.buildCorpus({ author: "Bialik", era: "tehiya", genre: "poetry", track: "accessible" }) },
  { corpus: cm.buildCorpus({ author: "Mendele", era: "haskalah", genre: "prose", track: "literary" }) },
  { corpus: cm.buildCorpus({ author: "Bialik", era: "tehiya", genre: "essay", track: "literary" }) },
];
test("facet filter by author", cm.filterByFacet(units, "author", "Bialik").length === 2);
test("facet filter by era", cm.filterByFacet(units, "era", "haskalah").length === 1);
test("facet filter by genre", cm.filterByFacet(units, "genre", "poetry").length === 1);
test("facet filter by track", cm.filterByFacet(units, "track", "literary").length === 2);
let threw = false; try { cm.filterByFacet(units, "nonsense", "x"); } catch (_) { threw = true; }
test("unknown facet throws (honest API)", threw);

// ── 7) hardening (post-review) ────────────────────────────────────────────────
// 7a) empty/blank content must NOT hash to the empty-string SHA-256 sentinel
test("content_hash null for [] (no empty-SHA sentinel)", cm.computeContentHash([]) === null);
test("content_hash null for all-blank rows", cm.computeContentHash(["", "  ", ""]) === null);
const EMPTY_SHA = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
test("validateCorpus rejects empty-string SHA sentinel", cm.validateCorpus({ ...honest, content_hash: EMPTY_SHA }).ok === false);
const noContent = cm.buildCorpus({ author: "a", byehuda_id: "p1", provenance: { source: "x" } });
const ncRes = cm.validateCorpus(noContent);
test("content-less work warns, not silently hashed", ncRes.ok && noContent.content_hash == null && ncRes.warnings.some((w) => /content_hash missing/.test(w)));

// 7b) difficulty pinned (integer 1..5 or null)
test("buildCorpus coerces garbage difficulty to null", cm.buildCorpus({ difficulty: "banana" }).difficulty === null);
test("buildCorpus keeps in-band difficulty", cm.buildCorpus({ difficulty: 3 }).difficulty === 3);
test("buildCorpus drops out-of-band difficulty", cm.buildCorpus({ difficulty: 9 }).difficulty === null);
test("validateCorpus rejects out-of-band difficulty", cm.validateCorpus({ ...honest, difficulty: 9 }).ok === false);
test("validateCorpus rejects non-integer difficulty", cm.validateCorpus({ ...honest, difficulty: "banana" }).ok === false);

// 7c) human claims need evidence (the structured-enum lie, not just free-string)
const proofNoEvidence = cm.buildCorpus({ author: "a", byehuda_id: "p1", content_hash: h1, provenance: { source: "x" }, review_status: "human_proofread" });
const pnRes = cm.validateCorpus(proofNoEvidence);
test("human_proofread w/o reviewer = warning (not silently trusted)", pnRes.ok && pnRes.warnings.some((w) => /human_proofread/.test(w)));
const proofWithEvidence = cm.buildCorpus({ author: "a", byehuda_id: "p1", content_hash: h1, provenance: { source: "x", reviewer: "R7", reviewed_at: "2026-06-08" }, review_status: "human_proofread" });
test("human_proofread WITH reviewer = no warning", cm.validateCorpus(proofWithEvidence).warnings.every((w) => !/human_proofread/.test(w)));
const audioHuman = cm.buildCorpus({ author: "a", byehuda_id: "p1", content_hash: h1, provenance: { source: "x" }, audio_status: "human" });
test("audio_status=human = warning (verify not TTS)", cm.validateCorpus(audioHuman).warnings.some((w) => /human audio|real human/i.test(w)));

// 7d) orig_language sanity
test("garbage orig_language warns", cm.validateCorpus(cm.buildCorpus({ author: "a", orig_language: "klingon", content_hash: h1 })).warnings.some((w) => /orig_language/.test(w)));
test("valid ISO orig_language = no lang warning", cm.validateCorpus(cm.buildCorpus({ author: "a", translator: "t", orig_language: "yi", content_hash: h1 })).warnings.every((w) => !/orig_language/.test(w)));

// 7f) author_uri / translator_uri (BRR-P0-004 additive identity anchors)
const withUri = cm.buildCorpus({ author: "a", author_uri: "https://wikidata.org/wiki/Q1376036", translator: "t", translator_uri: "https://www.wikidata.org/wiki/Q380425", orig_language: "yi", content_hash: h1, byehuda_id: "p1", provenance: { source: "x" } });
test("buildCorpus carries author_uri/translator_uri", withUri.author_uri === "https://wikidata.org/wiki/Q1376036" && withUri.translator_uri === "https://www.wikidata.org/wiki/Q380425");
test("author_uri/translator_uri in canonical field set", cm.CORPUS_FIELDS.includes("author_uri") && cm.CORPUS_FIELDS.includes("translator_uri"));
test("valid Wikidata QID URLs = no uri warning", cm.validateCorpus(withUri).warnings.every((w) => !/uri/i.test(w)));
const badUri = cm.buildCorpus({ author: "a", author_uri: "not-a-qid", content_hash: h1, byehuda_id: "p1", provenance: { source: "x" } });
const buRes = cm.validateCorpus(badUri);
test("malformed author_uri = warning, not error (curation not blocked)", buRes.ok && buRes.warnings.some((w) => /author_uri/.test(w)));
test("absent author_uri = honest null (never fabricated)", cm.buildCorpus({ author: "a" }).author_uri === null);

// 7e) producer path: getCorpus must read the canonical source_meta.corpus home
const smOnly = { source_meta: { origin: "ingested", corpus: cm.buildCorpus({ author: "a", content_hash: h1, byehuda_id: "p1" }) } };
test("getCorpus reads source_meta.corpus when no top-level mirror", cm.getCorpus(smOnly) === smOnly.source_meta.corpus);
const lyingNested = { source_meta: { corpus: { ...honest, review_status: "вычитано" } } };
test("validating via getCorpus catches a lie hidden in source_meta", cm.validateCorpus(cm.getCorpus(lyingNested)).ok === false);

// ── 8) transport drift pin (finding #6) ───────────────────────────────────────
// The browser (public/db/local-db.js) cannot require() this Node module, so it
// inlines the lift/merge transport. Pin those inline blocks structurally so an
// accidental removal/rename is caught by this Node gate (the canonical functions
// are behaviourally tested in section 4 above).
const fs = require("fs");
const path = require("path");
const localDb = fs.readFileSync(path.resolve(__dirname, "../../public/db/local-db.js"), "utf8");
test("local-db export emits top-level corpus mirror", /corpus:\s*_corpus/.test(localDb));
test("local-db export stamps corpus_meta_version", /corpus_meta_version:\s*1/.test(localDb));
test("local-db import folds item.corpus into source_meta", /if\s*\(item\.corpus[\s\S]{0,40}_sm\.corpus\s*=\s*item\.corpus/.test(localDb));

// ── summary ───────────────────────────────────────────────────────────────────
console.log("\n[corpus-meta-smoke] " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
