#!/usr/bin/env node
"use strict";

// corpus-catalog-smoke.js — BRR-P0-007 Проход-3 gate for the catalog producer.
//
// Builds synthetic era-shard zips in a TEMP dir, runs build-corpus-catalog.js against
// them (isolated --shard-dir/--out-dir; the real public/data is never touched), and
// asserts the published layout: thin catalog shape, per-work Shape-A files (source_text
// stripped), era-shelf grouping + ordering, multi-part grouping, dedup, and the R1
// honesty gate (a lying text must ABORT the build).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const JSZip = require("../../public/db/jszip.min.js");
const corpusMeta = require("../../db/premium/corpusMeta");

// valid `sha256:<64 hex>` (validateCorpus requires the exact shape); same seed → same hash (dup test)
function hash(seed) { return "sha256:" + crypto.createHash("sha256").update(String(seed)).digest("hex"); }

const REPO = path.resolve(__dirname, "..", "..");
const PRODUCER = path.join(REPO, "scripts", "premium", "build-corpus-catalog.js");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}

function mkRows(n, withNiqqud) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      row_id: "r" + i, order_index: i,
      hebrew_plain: "שורה " + i, hebrew_niqqud: withNiqqud ? "שׁוּרָה " + i : "שורה " + i,
      translit: "shura " + i, translit_ru: "шура " + i, russian: "строка " + i,
      edit_meta: null, note: null, note_updated_at: null, audio_asset_key: null,
    });
  }
  return rows;
}
function mkText(opts) {
  const o = opts || {};
  const rows = o.rows || mkRows(o.nRows || 5, o.withNiqqud !== false);
  const corpus = corpusMeta.buildCorpus({
    byehuda_id: o.byehuda_id, content_hash: o.content_hash || hash(o.hashSeed || (String(o.byehuda_id) + "-" + (o.part || 1))),
    author: o.author || "מנדלי", era: o.era || "haskalah", genre: o.genre || "prose",
    register: o.register || "literary", track: o.track || "literary",
    review_status: o.review_status || "machine", audio_status: o.audio_status || "none",
    series: o.series || null,
  });
  return {
    text_id: o.text_id || ("by-" + o.byehuda_id), text_key: o.text_key || ("key-" + (o.text_id || ("by-" + o.byehuda_id))),
    title: o.title || ("יצירה " + o.byehuda_id), level: null, tags: [], source_label: "Project Ben-Yehuda",
    topic: null, source_text: o.source_text != null ? o.source_text : "המקור המלא של היצירה הזאת.",
    source_meta: { origin: "benyehuda-ingest", corpus }, corpus, table_model_meta: null,
    rows, text_audio_asset_key: null, created_at: null, updated_at: null, is_archived: false,
  };
}
async function writeShard(dir, name, texts) {
  const lib = { schema_version: 1, corpus_meta_version: corpusMeta.CORPUS_META_VERSION, shelves: [], texts, audio_assets: [] };
  const zip = new JSZip();
  zip.file("library/library.json", JSON.stringify(lib));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
}
function runProducer(shardDir, outDir, extraArgs) {
  return spawnSync(process.execPath, [PRODUCER, "--shard-dir", shardDir, "--out-dir", outDir].concat(extraArgs || []), { encoding: "utf8" });
}
function tmp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), "corpus-catalog-" + label + "-")); }

(async () => {
  console.log("[corpus-catalog-smoke] BRR-P0-007 Проход-3 — producer gate");

  // ── happy path: 2 eras, a multi-part work, a dup ─────────────────────────────
  const shardDir = tmp("in");
  const outDir = tmp("out");
  await writeShard(shardDir, "by-era-haskalah-1.zip", [
    mkText({ byehuda_id: "10", title: "חצי נחמה", author: "מנדלי", era: "haskalah", nRows: 7, withNiqqud: true }),
    mkText({ byehuda_id: "11", title: "ספר ב", author: "סמולנסקין", era: "haskalah", nRows: 4, withNiqqud: false }),
  ]);
  await writeShard(shardDir, "by-era-tehiya-1.zip", [
    mkText({ byehuda_id: "20", text_id: "by-20", text_key: "key-by-20", title: "שיר", author: "ביאליק", era: "tehiya", nRows: 6, withNiqqud: true, hashSeed: "20" }),
    // multi-part work 21 (two chapters) — emitted OUT OF ORDER to test series sort
    mkText({ byehuda_id: "21", text_id: "by-21-c2", text_key: "key-by-21-c2", title: "רומן · ב", era: "tehiya", nRows: 5, hashSeed: "21-2", series: { work_byehuda_id: "21", work_title: "רומן", part: 2, total: 2 } }),
    mkText({ byehuda_id: "21", text_id: "by-21-c1", text_key: "key-by-21-c1", title: "רומן · א", era: "tehiya", nRows: 5, hashSeed: "21-1", series: { work_byehuda_id: "21", work_title: "רומן", part: 1, total: 2 } }),
    // exact dup of work 20 (same content_hash) → must be skipped
    mkText({ byehuda_id: "20", text_id: "by-20-dup", text_key: "key-by-20-dup", title: "שיר (дубль)", era: "tehiya", nRows: 6, hashSeed: "20" }),
  ]);

  const r = runProducer(shardDir, outDir, ["--catalog-version", "1"]);
  test("producer exits 0", r.status === 0, (r.stderr || "").slice(0, 300));

  const catalogPath = path.join(outDir, "corpus-catalog-v1.json");
  test("corpus-catalog-v1.json written", fs.existsSync(catalogPath));
  let cat = null; try { cat = JSON.parse(fs.readFileSync(catalogPath, "utf8")); } catch (e) {}
  test("catalog parses with schema/version/counts/shelves/works", !!cat && cat.schema === 1 && cat.version === 1 && cat.counts && Array.isArray(cat.shelves) && Array.isArray(cat.works), cat && JSON.stringify(cat.counts));

  // 4 distinct works: 10, 11, 20, 21 (21 = 2 parts grouped, one dup of 20 skipped)
  test("counts.works = 4 (multi-part grouped, dup skipped)", cat && cat.counts.works === 4, cat && cat.counts.works);
  test("counts.dupes_skipped = 1", cat && cat.counts.dupes_skipped === 1, cat && cat.counts.dupes_skipped);
  test("counts.texts = 5 (10,11,20,21c1,21c2)", cat && cat.counts.texts === 5, cat && cat.counts.texts);

  const card = cat && cat.works.find((w) => w.id === "10");
  test("card has all render fields", !!card && card.text_key && card.file && card.title && card.author && card.era && card.track && card.segments > 0 && card.vocalized_ratio >= 0 && card.review_status && card.audio_status, JSON.stringify(card));
  test("card 10 vocalized_ratio = 1 (all niqqud)", card && card.vocalized_ratio === 1, card && card.vocalized_ratio);
  const card11 = cat && cat.works.find((w) => w.id === "11");
  test("card 11 vocalized_ratio = 0 (no niqqud)", card11 && card11.vocalized_ratio === 0, card11 && card11.vocalized_ratio);

  // ── coverage spine (BRR-P1-007 / Путь А) ─────────────────────────────────────
  const cov = card && card.coverage;
  test("card carries coverage{} spine", !!cov && typeof cov === "object", JSON.stringify(cov));
  test("coverage.text true for a baked work", cov && cov.text === true);
  test("coverage.niqqud mirrors vocalized_ratio (1)", cov && cov.niqqud === 1, cov && cov.niqqud);
  test("coverage.translation = machine (RU filled, review_status=machine)", cov && cov.translation === "machine", cov && cov.translation);
  test("coverage.audio = none (not voiced)", cov && cov.audio === "none", cov && cov.audio);
  test("coverage.era_known true (era set)", cov && cov.era_known === true);
  test("coverage.tier = machine-known (era known)", cov && cov.tier === "machine-known", cov && cov.tier);

  // multi-part work 21
  const card21 = cat && cat.works.find((w) => w.id === "21");
  test("work 21 grouped: parts = 2", card21 && card21.parts === 2, card21 && card21.parts);
  test("work 21 segments summed (10)", card21 && card21.segments === 10, card21 && card21.segments);

  // per-work files
  test("every card.file exists on disk", cat && cat.works.every((w) => fs.existsSync(path.join(outDir, w.file))));
  let w21 = null; try { w21 = JSON.parse(fs.readFileSync(path.join(outDir, "works", "21.json"), "utf8")); } catch (e) {}
  test("work file is importBundle Shape A", w21 && w21.library && Array.isArray(w21.library.texts) && Array.isArray(w21.library.shelves) && Array.isArray(w21.library.audio_assets));
  test("work 21 file has 2 texts in series order (c1 then c2)", w21 && w21.library.texts.length === 2 && w21.library.texts[0].text_id === "by-21-c1" && w21.library.texts[1].text_id === "by-21-c2", w21 && w21.library.texts.map((t) => t.text_id).join(","));
  test("source_text stripped by default", w21 && w21.library.texts.every((t) => t.source_text === ""));
  test("rows preserved in work file", w21 && w21.library.texts[0].rows.length === 5);

  // era shelves
  test("2 era shelves", cat && cat.shelves.length === 2, cat && cat.shelves.length);
  test("shelves ordered haskalah → tehiya", cat && cat.shelves[0].era === "haskalah" && cat.shelves[1].era === "tehiya", cat && cat.shelves.map((s) => s.era).join(","));
  test("era titles are display names (Хаскала/Тхия)", cat && /Хаскала/.test(cat.shelves[0].title) && /Тхия/.test(cat.shelves[1].title), cat && cat.shelves.map((s) => s.title).join(" | "));
  test("haskalah shelf items = [10,11]", cat && JSON.stringify(cat.shelves[0].items.sort()) === JSON.stringify(["10", "11"]), cat && JSON.stringify(cat.shelves[0].items));
  test("tehiya shelf items = [20,21]", cat && JSON.stringify(cat.shelves[1].items.sort()) === JSON.stringify(["20", "21"]), cat && JSON.stringify(cat.shelves[1].items));
  test("shelf items resolve to catalog works (no dangling)", cat && cat.shelves.every((s) => s.items.every((id) => cat.works.some((w) => w.id === id))));

  // ── R1 honesty gate: a lying text aborts the build ───────────────────────────
  const shardDir2 = tmp("lie-in");
  const outDir2 = tmp("lie-out");
  await writeShard(shardDir2, "by-era-haskalah-1.zip", [
    mkText({ byehuda_id: "99", title: "ложь", era: "haskalah", review_status: "human_proofread" }), // the lie
  ]);
  const r2 = runProducer(shardDir2, outDir2, ["--catalog-version", "1"]);
  test("R1 gate: human_proofread lie aborts (exit 1)", r2.status === 1, "status=" + r2.status);
  test("R1 gate: nothing written on abort", !fs.existsSync(path.join(outDir2, "corpus-catalog-v1.json")));
  test("R1 gate: reports the violation", /R1 GATE FAILED|review_status=human_proofread/.test((r2.stdout || "") + (r2.stderr || "")));

  // ── dry-run writes nothing ───────────────────────────────────────────────────
  const outDir3 = tmp("dry-out");
  const r3 = runProducer(shardDir, outDir3, ["--dry-run"]);
  test("dry-run exits 0", r3.status === 0);
  test("dry-run writes nothing", !fs.existsSync(path.join(outDir3, "corpus-catalog-v1.json")));

  // cleanup temp dirs
  for (const d of [shardDir, outDir, shardDir2, outDir2, outDir3]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }

  console.log("\n[corpus-catalog-smoke] " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("[corpus-catalog-smoke] fatal:", (e && e.stack) || e); process.exit(1); });
