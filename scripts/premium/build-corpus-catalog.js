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

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const SHARD_DIR = path.resolve(arg("shard-dir", path.join(REPO, ".tmp", "benyehuda", "shards")));
const OUT_DIR = path.resolve(arg("out-dir", path.join(REPO, "public", "data", "benyehuda")));
const CATALOG_VERSION = Number(arg("catalog-version", 1)) || 1;
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

(async () => {
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
