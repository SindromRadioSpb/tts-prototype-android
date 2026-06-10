#!/usr/bin/env node
"use strict";

// build-corpus-catalog.js — BRR-P0-007 Проход-3 (catalog-driven delivery).
//
// Producer step that turns the runner's per-era shard bundles (.tmp/benyehuda/shards/
// by-era-*.zip — the bulk artifact of the multi-day bake) into the SHIPPED, served-on-
// open delivery layout decided in docs/planning/BEN_YEHUDA_DELIVERY_26K_PLAN.md (D1):
//
//   public/data/benyehuda/
//     corpus-catalog-v<N>.json   ← THIN discovery index: one card per work (title,
//                                   author, era, register, track, genre, segments,
//                                   vocalized_ratio, provenance) + era shelves
//                                   (pointers). NO row bodies → small, mobile-cheap.
//     works/<byehuda_id>.json    ← one work (importBundle Shape A: {library:{texts,
//                                   shelves,audio_assets}}). Fetched ONLY when a card
//                                   is opened, upserted into OPFS by the client.
//
// This is the "publish" half of the producer/publish split (§6 of the delivery plan):
// the runner PRODUCES shards over many days; this step PUBLISHES a tier on demand,
// without re-baking. Library.html lists the catalog and materialises a work into OPFS
// only on open — never an auto-import of the whole corpus (the canon-v3 17s import was
// already a mobile risk at 79 texts; 100+ must not repeat it).
//
// R1 (honesty) gate: every text must be review_status=machine (NEVER human_proofread)
// and audio_status ∈ {none,tts} (NEVER human); validateCorpus must pass. A lie aborts
// the build (exit 1) — a machine-translated corpus is never dressed as human-reviewed.
//
//   node scripts/premium/build-corpus-catalog.js                 # shards → public/data/benyehuda
//   node scripts/premium/build-corpus-catalog.js --dry-run       # report only, write nothing
//   node scripts/premium/build-corpus-catalog.js --catalog-version 2 --shard-dir <dir> --out-dir <dir>

const fs = require("fs");
const path = require("path");
const JSZip = require("../../public/db/jszip.min.js");
const corpusMeta = require("../../db/premium/corpusMeta");
const by = require("./lib/benyehuda"); // BRR-P1-014 A2: parseCsv/cleanGenre/firstQid/eraForAuthor

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const SHARD_DIR = path.resolve(arg("shard-dir", path.join(REPO, ".tmp", "benyehuda", "shards")));
const OUT_DIR = path.resolve(arg("out-dir", path.join(REPO, "public", "data", "benyehuda")));
const CATALOG_VERSION = Number(arg("catalog-version", 2)) || 2;
const DRY = flag("dry-run");
// Read-path needs only the rows (reader-core reads sentences, never source_text); the raw
// blob is reconstructable by joining rows. Strip it by default → ~half-size served-on-open
// files (the mobile fetch the whole catalog model exists to keep cheap). --keep-source-text
// retains it (e.g. if a corpus work must round-trip into the Studio editor).
const KEEP_SOURCE_TEXT = flag("keep-source-text");

// Era display + chronological order (R6 librarian — a route, honest period labels).
const ERA_META = {
  biblical:     { title: "Библейский период",        order: 1 },
  rabbinic:     { title: "Эпоха мудрецов",            order: 2 },
  medieval:     { title: "Средневековье",             order: 3 },
  haskalah:     { title: "Хаскала (Просвещение)",     order: 4 },
  tehiya:       { title: "Тхия (Возрождение)",        order: 5 },
  mandate:      { title: "Подмандатный период",       order: 6 },
  modern:       { title: "Современная литература",     order: 7 },
  contemporary: { title: "Новейшая литература",        order: 8 },
  unknown:      { title: "Период не определён",        order: 90 }, // BRR-P1-014 A2: era not derivable (honest, sorts last)
};
function eraTitle(era) { return (ERA_META[era] && ERA_META[era].title) || ("Эпоха: " + (era || "—")); }
function eraOrder(era) { return (ERA_META[era] && ERA_META[era].order) || 99; }

const NIQQUD_RE = /[֑-ׇ]/;
function vocalizedRatio(rows) {
  const heRows = rows.filter((r) => (r.hebrew_plain || "").trim());
  if (!heRows.length) return 0;
  const voc = heRows.filter((r) => NIQQUD_RE.test(r.hebrew_niqqud || "")).length;
  return Math.round((voc / heRows.length) * 100) / 100;
}

// Coverage spine (BRR-P1-007 / Путь А) for a BAKED work (rows present). The producer
// computes it honestly from the corpus metadata + rows; the client filters and the owner
// fill-queue read it. (Unprocessed CSV-only cards — BRR-P1-014 — set their own coverage
// with text:false / tier:"unprocessed".) review_status drives the translation flag so a
// machine_assisted edition still reads as machine-translated, never as human-reviewed (R1).
function coverageFor(corpus, rows) {
  const c = corpus || {};
  const hasRu = (rows || []).some((r) => (r.russian || "").trim());
  const audio = c.audio_status === "tts" || c.audio_status === "human" ? c.audio_status : "none";
  const eraKnown = !!c.era;
  return {
    text: (rows || []).length > 0,
    niqqud: vocalizedRatio(rows || []),
    translation: hasRu ? (c.review_status === "machine_assisted" ? "machine_assisted" : "machine") : "none",
    audio,
    era_known: eraKnown,
    tier: eraKnown ? "machine-known" : "machine-rest",
  };
}

async function readShards() {
  if (!fs.existsSync(SHARD_DIR)) { console.error("[catalog] shard dir not found: " + SHARD_DIR); process.exit(2); }
  const files = fs.readdirSync(SHARD_DIR).filter((f) => /\.zip$/.test(f)).sort();
  if (!files.length) { console.error("[catalog] no shard zips in " + SHARD_DIR); process.exit(2); }
  const texts = [];
  let cmVersion = corpusMeta.CORPUS_META_VERSION;
  for (const f of files) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(SHARD_DIR, f)));
    const entry = zip.files["library/library.json"] || zip.files["library.json"];
    if (!entry) { console.error("[catalog] shard " + f + " has no library/library.json"); process.exit(3); }
    const lib = JSON.parse(await entry.async("string"));
    if (lib.corpus_meta_version) cmVersion = lib.corpus_meta_version;
    for (const t of (lib.texts || [])) texts.push(t);
    console.log(`  [catalog] read ${f}: ${(lib.texts || []).length} texts`);
  }
  return { texts, cmVersion };
}

// ── BRR-P1-014 A2.1/A2.2 — full coverage-aware catalog (era-primary + author-block) ──
// Distinct from the v2 path above: reads the ENTIRE pseudocatalogue.csv (~26K) for the
// full listing, derives era from the committed Wikidata era-map (A2.0), and OVERLAYS the
// baked coverage from the existing v2 catalog (committed → reproducible, no shard re-read).
// Emits a THIN root index + per-era manifests (oversized era → author-block split @cap),
// v3 ALONGSIDE the live v2 (the Корпус tab stays on v2 until A3 switches the client).
// Unprocessed (CSV-only) works carry coverage{text:false,tier:"unprocessed"} and NO work_ref
// → honest "перевод позже" (not openable). R1: a baked overlay claiming human review/audio aborts.
function qidNum(uri) { const m = /\/(Q\d+)\b/.exec(String(uri || "")); return m ? m[1] : null; }
async function buildFullCatalog() {
  const V = Number(arg("catalog-version", 3)) || 3;
  const CAP = Number(arg("shard-cap", 2000)) || 2000;
  const CSV = path.resolve(arg("csv", path.join(REPO, ".tmp", "benyehuda", "pseudocatalogue.csv")));
  const ERA_MAP_PATH = path.resolve(arg("era-map", path.join(OUT_DIR, "author-era-map-v1.json")));
  const BAKED_FROM = path.resolve(arg("baked-from", path.join(OUT_DIR, "corpus-catalog-v2.json")));
  console.log(`[full] BRR-P1-014 A2 · csv=${path.relative(REPO, CSV)} · era-map=${path.relative(REPO, ERA_MAP_PATH)} · baked=${path.relative(REPO, BAKED_FROM)} · v${V} · cap=${CAP}${DRY ? " (dry-run)" : ""}`);
  if (!fs.existsSync(CSV)) { console.error("[full] CSV not found: " + CSV); process.exit(2); }
  const { rows } = by.parseCsv(fs.readFileSync(CSV, "utf8"));
  const eraMap = fs.existsSync(ERA_MAP_PATH) ? JSON.parse(fs.readFileSync(ERA_MAP_PATH, "utf8")) : { authors: {} };
  const baked = new Map();
  if (fs.existsSync(BAKED_FROM)) { const v2 = JSON.parse(fs.readFileSync(BAKED_FROM, "utf8")); for (const c of (v2.works || [])) baked.set(String(c.id), c); }
  else console.warn("[full] WARNING: baked catalog not found (" + BAKED_FROM + ") → all cards unprocessed");

  const cards = [];
  const lies = [];
  const seenId = new Set();
  for (const r of rows) {
    const id = by.cleanField(r.ID); if (!id || seenId.has(id)) continue; seenId.add(id);
    const qid = qidNum(by.firstQid(r.author_uris));
    const eraFromMap = qid && eraMap.authors && eraMap.authors[qid] ? eraMap.authors[qid].era : null;
    const b = baked.get(id);
    const era = eraFromMap || (b && b.era) || by.eraForAuthor(r.authors) || null;
    const genre = by.cleanGenre(r.genre) || (b && b.genre) || null;
    const origLang = by.cleanField(r.original_language) || "he";
    const title = by.cleanField(r.title) || (b && b.title) || "";
    const author = by.cleanField(r.authors) || (b && b.author) || null;
    if (b) {
      if (b.review_status && b.review_status !== "machine" && b.review_status !== "machine_assisted") lies.push(id + ": review_status=" + b.review_status);
      if (b.audio_status === "human") lies.push(id + ": audio_status=human");
      cards.push({
        id, title, author, author_qid: qid, era, register: b.register || null, track: b.track || "literary",
        genre, orig_language: origLang, parts: b.parts || 1, segments: b.segments || 0, vocalized_ratio: b.vocalized_ratio || 0,
        review_status: b.review_status || "machine", audio_status: b.audio_status || "none",
        file: b.file || ("works/" + id + ".json"),
        coverage: { ...(b.coverage || {}), era_known: !!era },
      });
    } else {
      cards.push({
        id, title, author, author_qid: qid, era, register: null, track: "literary", genre, orig_language: origLang,
        parts: 0, segments: 0, vocalized_ratio: 0, review_status: "machine", audio_status: "none",
        coverage: { text: false, niqqud: 0, translation: "none", audio: "none", era_known: !!era, tier: "unprocessed" },
      });
    }
  }
  if (lies.length) { console.error(`[full] ✗ R1 GATE FAILED — ${lies.length} honesty violation(s); nothing written:`); for (const l of lies.slice(0, 20)) console.error("   " + l); process.exit(1); }

  // group by era → manifests (author-block split when an era exceeds CAP)
  const byEra = new Map();
  for (const c of cards) { const e = c.era || "unknown"; if (!byEra.has(e)) byEra.set(e, []); byEra.get(e).push(c); }
  const manifests = [], eraTaxonomy = [], writes = [];
  for (const era of Array.from(byEra.keys()).sort((a, b) => eraOrder(a) - eraOrder(b))) {
    const list = byEra.get(era);
    list.sort((a, b) => String(a.author || "").localeCompare(String(b.author || "")) || String(a.id).localeCompare(String(b.id)));
    const readyCount = list.filter((c) => c.coverage.text && c.coverage.translation !== "none").length;
    eraTaxonomy.push({ era, title: eraTitle(era), order: eraOrder(era), count: list.length, ready_count: readyCount });
    if (list.length <= CAP) {
      const rel = "catalog/era-" + era + "-v" + V + ".json";
      writes.push({ rel, json: { schema: 1, version: V, era, block: null, count: list.length, works: list } });
      manifests.push({ era, block: null, file: rel, count: list.length });
    } else {
      for (let i = 0, blk = 0; i < list.length; i += CAP, blk++) {
        const chunk = list.slice(i, i + CAP), bb = String(blk).padStart(2, "0");
        const rel = "catalog/era-" + era + "-b" + bb + "-v" + V + ".json";
        writes.push({ rel, json: { schema: 1, version: V, era, block: bb, count: chunk.length, works: chunk } });
        manifests.push({ era, block: bb, file: rel, count: chunk.length });
      }
    }
  }

  const byEraCount = {}, byGenre = {}, byLang = {}, byTier = {}; let bakedCount = 0;
  for (const c of cards) {
    byEraCount[c.era || "unknown"] = (byEraCount[c.era || "unknown"] || 0) + 1;
    byGenre[c.genre || "(none)"] = (byGenre[c.genre || "(none)"] || 0) + 1;
    byLang[c.orig_language || "he"] = (byLang[c.orig_language || "he"] || 0) + 1;
    byTier[(c.coverage && c.coverage.tier) || (c.coverage && c.coverage.text ? "baked" : "?")] = (byTier[(c.coverage && c.coverage.tier) || (c.coverage && c.coverage.text ? "baked" : "?")] || 0) + 1;
    if (c.coverage && c.coverage.text) bakedCount++;
  }
  const root = {
    schema: 1, version: V, corpus_meta_version: corpusMeta.CORPUS_META_VERSION,
    origin: "benyehuda-ingest", generated_from: "csv+era-map+baked",
    counts: { works: cards.length, baked: bakedCount, by_era: byEraCount, by_genre: byGenre, by_lang: byLang, by_tier: byTier },
    era_taxonomy: eraTaxonomy,
    manifests,
    pointers: { ready: cards.filter((c) => c.coverage && c.coverage.text).map((c) => c.id) },
  };

  const rootBytes = Buffer.byteLength(JSON.stringify(root));
  let manBytes = 0, maxMan = 0; for (const w of writes) { const b = Buffer.byteLength(JSON.stringify(w.json)); manBytes += b; if (b > maxMan) maxMan = b; }
  console.log(`[full] works ${cards.length} · baked ${bakedCount} · eras ${eraTaxonomy.length} · manifests ${writes.length} · R1 clean`);
  console.log(`[full] by_tier: ${Object.entries(byTier).map(([k, v]) => k + " " + v).join(" · ")}`);
  console.log(`[full] by_era: ${eraTaxonomy.map((t) => t.era + " " + t.count + "(ready " + t.ready_count + ")").join(" · ")}`);
  console.log(`[full] root ${(rootBytes / 1024).toFixed(0)}KB · manifests total ${(manBytes / 1024 / 1024).toFixed(1)}MB · largest ${(maxMan / 1024).toFixed(0)}KB`);
  if (DRY) { console.log("[full] dry-run — nothing written"); return; }
  fs.mkdirSync(path.join(OUT_DIR, "catalog"), { recursive: true });
  for (const w of writes) fs.writeFileSync(path.join(OUT_DIR, w.rel), JSON.stringify(w.json));
  fs.writeFileSync(path.join(OUT_DIR, "corpus-catalog-v" + V + ".json"), JSON.stringify(root));
  console.log(`[full] wrote corpus-catalog-v${V}.json + ${writes.length} manifests → ${path.relative(REPO, OUT_DIR)}`);
  console.log(`[full] NOTE: bump --catalog-version on re-publish; v2 stays live until A3 switches the client to v3.`);
}

(async () => {
  if (flag("full")) { await buildFullCatalog(); return; } // BRR-P1-014 A2: full coverage catalog (v3)
  console.log(`[catalog] BRR-P0-007 Проход-3 · shards → ${path.relative(REPO, OUT_DIR)} · catalog v${CATALOG_VERSION}${DRY ? " (dry-run)" : ""}`);
  const { texts, cmVersion } = await readShards();

  // ── dedup by content_hash (a work must never appear twice across shards) ──────
  const seen = new Map(); // content_hash → text
  let dupes = 0;
  for (const t of texts) {
    const h = t.corpus && t.corpus.content_hash;
    const key = h || t.text_key;
    if (seen.has(key)) { dupes++; continue; }
    seen.set(key, t);
  }
  const uniq = Array.from(seen.values());

  // ── group texts by work (byehuda_id) — future-proof for chaptered giants ─────
  const works = new Map(); // byehuda_id → [texts]
  for (const t of uniq) {
    const bid = (t.corpus && t.corpus.byehuda_id) || t.text_id;
    if (!works.has(bid)) works.set(bid, []);
    works.get(bid).push(t);
  }

  // ── R1 honesty gate + card build ─────────────────────────────────────────────
  const cards = [];
  const workFiles = []; // { rel, json }
  const lies = [];
  for (const [bid, parts] of works) {
    // chapter order within a work (series.part) so a multi-part file reads in order
    parts.sort((a, b) => ((a.corpus && a.corpus.series && a.corpus.series.part) || 0) - ((b.corpus && b.corpus.series && b.corpus.series.part) || 0));
    const head = parts[0];
    const c = head.corpus || {};
    for (const p of parts) {
      const pc = p.corpus || {};
      if (pc.review_status && pc.review_status !== "machine" && pc.review_status !== "machine_assisted") lies.push(`${p.text_id}: review_status=${pc.review_status}`);
      if (pc.audio_status === "human") lies.push(`${p.text_id}: audio_status=human`);
      const v = corpusMeta.validateCorpus(pc);
      if (v && v.errors && v.errors.length) lies.push(`${p.text_id}: ${v.errors.join("; ")}`);
    }
    const totalSegments = parts.reduce((a, p) => a + (p.rows || []).length, 0);
    const allRows = parts.flatMap((p) => p.rows || []);
    const rel = "works/" + String(bid) + ".json";
    const outParts = KEEP_SOURCE_TEXT ? parts : parts.map((p) => ({ ...p, source_text: "" }));
    workFiles.push({
      rel,
      json: { library: { schema_version: 1, corpus_meta_version: cmVersion, texts: outParts, shelves: [], audio_assets: [] } },
    });
    cards.push({
      id: String(bid),
      text_key: head.text_key,
      file: rel,
      title: head.title,
      author: c.author || null,
      era: c.era || null,
      register: c.register || null,
      track: c.track || "literary",
      genre: c.genre || null,
      parts: parts.length,
      segments: totalSegments,
      vocalized_ratio: vocalizedRatio(allRows),
      review_status: c.review_status || "machine",
      audio_status: c.audio_status || "none",
      // BRR-P1-007 coverage spine (Путь А): the normalized filter/fill model. For a baked
      // work `text` is true (rows materialised), `translation` reflects whether RU is filled,
      // `audio` honestly tracks published voicing. Unprocessed (CSV-only, BRR-P1-014) cards
      // will carry text:false / tier:"unprocessed".
      coverage: coverageFor(c, allRows),
    });
  }
  if (lies.length) {
    console.error(`[catalog] ✗ R1 GATE FAILED — ${lies.length} honesty violation(s); nothing written:`);
    for (const l of lies.slice(0, 20)) console.error("   " + l);
    process.exit(1);
  }

  // ── era shelves (pointers — items are work ids, no bodies) ────────────────────
  const byEra = new Map();
  for (const card of cards) { const e = card.era || "unknown"; if (!byEra.has(e)) byEra.set(e, []); byEra.get(e).push(card.id); }
  const shelves = Array.from(byEra.entries())
    .sort((a, b) => eraOrder(a[0]) - eraOrder(b[0]))
    .map(([era, ids], i) => ({
      slug: "corpus-era-" + era,
      title: eraTitle(era),
      track: "literary",
      era,
      origin: "benyehuda-ingest",
      editorial_intro: "Автособранный срез корпуса по эпохе. Машинный перевод (Gemini) + Dicta-никуд; провенанс на каждой карточке (review_status=machine).",
      items: ids,
      order: 300 + i,
    }));

  const eraCounts = {}; for (const [e, ids] of byEra) eraCounts[e] = ids.length;
  const catalog = {
    schema: 1,
    version: CATALOG_VERSION,
    corpus_meta_version: cmVersion,
    origin: "benyehuda-ingest",
    generated_from: "shards",
    counts: { works: cards.length, texts: uniq.length, dupes_skipped: dupes, eras: eraCounts },
    shelves,
    works: cards,
  };

  // ── report ───────────────────────────────────────────────────────────────────
  const catalogBytes = Buffer.byteLength(JSON.stringify(catalog));
  let worksBytes = 0; for (const w of workFiles) worksBytes += Buffer.byteLength(JSON.stringify(w.json));
  console.log(`[catalog] works ${cards.length} · texts ${uniq.length} · dupes skipped ${dupes} · R1 clean`);
  console.log(`[catalog] eras: ${Object.entries(eraCounts).map(([e, n]) => e + " " + n).join(" · ")}`);
  console.log(`[catalog] catalog ${(catalogBytes / 1024).toFixed(0)} KB · works total ${(worksBytes / 1024 / 1024).toFixed(1)} MB (${workFiles.length} files)`);

  if (DRY) { console.log("[catalog] dry-run — nothing written"); return; }

  // ── write ──────────────────────────────────────────────────────────────────
  fs.mkdirSync(path.join(OUT_DIR, "works"), { recursive: true });
  for (const w of workFiles) fs.writeFileSync(path.join(OUT_DIR, w.rel), JSON.stringify(w.json));
  const catalogName = "corpus-catalog-v" + CATALOG_VERSION + ".json";
  fs.writeFileSync(path.join(OUT_DIR, catalogName), JSON.stringify(catalog));
  console.log(`[catalog] wrote ${catalogName} + ${workFiles.length} work files → ${path.relative(REPO, OUT_DIR)}`);
  console.log(`[catalog] NOTE: bump --catalog-version on any re-publish so the client cache-busts (works/*.json are fetched with ?v=<version>).`);
})().catch((e) => { console.error("[catalog] fatal:", (e && e.stack) || e); process.exit(1); });
