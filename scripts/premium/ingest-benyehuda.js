#!/usr/bin/env node
"use strict";

// ingest-benyehuda.js — BRR-P0-004 Reading-Room corpus producer. RUN LOCALLY.
//
// Turns the Project Ben-Yehuda public-domain corpus into an honest bilingual
// (text-only; audio deferred) bundle v2.1 ZIP that fills corpus + shelves and
// imports straight into the OPFS Reading Room. Reuses the SHIPPED engine
// primitives — segmenter, the google-free / gcp translation providers, the
// niqqud gateway (sidecar → Dicta cloud), the transliterator, and the
// corpusMeta / shelfMeta contracts — but stays DB-FREE (no SQLite, no server,
// no lock contention): translation/niqqud are cached on disk for resume.
//
// The translate + niqqud + fetch orchestration now lives in the SHARED
// scripts/premium/lib/ingestCore.js factory (so the full-corpus runner,
// run-corpus-prebake.js, calls the exact same R1 path — zero drift). This file
// keeps the producer-specific selection / manifest / chapter / shelf / gate /
// ZIP-assembly logic.
//
//   node scripts/premium/ingest-benyehuda.js --auto --limit 20 \
//     --provider google-free --out .tmp/benyehuda-pilot.zip
//
// Providers:  google-free (default, free workhorse) · gemini (GEMINI_API_KEY env,
//             quota-limited quality path) · gcp (Cloud Translate BYOK --gcp-key).
// Niqqud:     source-first — authentic source vocalization is PRESERVED; Dicta
//             only fills unvocalized lines (R1: never overwrite real vowels).
// Honesty:    review_status='machine', audio_status='none' (text-only); footer
//             stripped; translated works need orig_language or the build fails.
// Verify:     curl …/sw.js unaffected (producer/data only — no SW bump).

const fs = require("fs");
const path = require("path");

const JSZip = require("../../public/db/jszip.min.js");
const corpusMeta = require("../../db/premium/corpusMeta");
const shelfMeta = require("../../db/premium/shelfMeta");
const by = require("./lib/benyehuda");
const { createIngestCore } = require("./lib/ingestCore");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");
const BY_DIR = path.join(TMP, "benyehuda");
const RAW_BASE = "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master";

// ── args ──────────────────────────────────────────────────────────────────────
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const AUTO = flag("auto");
const MANIFEST = arg("manifest", null) || null; // explicit curation manifest (JSON); overrides auto
const CSV_PATH = String(arg("csv", path.join(BY_DIR, "pseudocatalogue.csv")));
const OUT = String(arg("out", path.join(TMP, "benyehuda-pilot.zip")));
const PROVIDER = String(arg("provider", "google-free"));
const LIMIT = Number(arg("limit", 20)) || 20;
const ACCESSIBLE_MAX = Number(arg("accessible", Math.ceil(LIMIT / 2)));
const LITERARY_MAX = Number(arg("literary", Math.floor(LIMIT / 2)));
const MAX_CHARS = Number(arg("max-chars", 8000));
const MIN_CHARS = Number(arg("min-chars", 40));
const MANIFEST_MAX = Number(arg("manifest-max-chars", 30000)); // skip novellas in curated manifest (R6/R8)
// BRR-P0-008 — canon edition version. Stamped onto every shelf (origin + version)
// and the bundle (library.json.canon_version) so a bump triggers the import-side
// dedup reconcile. Default 2 = the current shipped canon-v2 edition.
const CANON_VERSION = Number(arg("canon-version", 2)) || 2;
const CANON_ORIGIN = "benyehuda-ingest";
const NO_FETCH = flag("no-fetch");
const DRY = flag("dry-run");
const GCP_KEY = String(arg("gcp-key", process.env.GCP_TRANSLATE_API_KEY || ""));
const GEMINI_KEY = String(arg("gemini-key", process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""));
const GEMINI_MODEL = String(arg("gemini-model", "gemini-2.5-flash")); // pinned for predictable cost (owner decision 1)
const GEMINI_TIMEOUT_MS = Number(arg("gemini-timeout", 90000)); // SDK has no request timeout → race it (see ingestCore)
const GEMINI_CHUNK = Number(arg("gemini-chunk", 50));            // segments per Gemini call
const STAMP = new Date().toISOString();

const PROVIDERS = new Set(["google-free", "gemini", "gcp"]);
if (!PROVIDERS.has(PROVIDER)) { console.error("[ingest] unsupported provider: " + PROVIDER + " (use google-free|gemini|gcp)"); process.exit(2); }

const log = (...a) => console.log("[ingest]", ...a);

// Shared ingestion core (translate + niqqud + fetch + cache + corpus build). The
// SAME factory the full-corpus runner uses — zero drift, one R1 path.
const core = createIngestCore({
  provider: PROVIDER, geminiKey: GEMINI_KEY, geminiModel: GEMINI_MODEL,
  geminiChunk: GEMINI_CHUNK, geminiTimeout: GEMINI_TIMEOUT_MS, gcpKey: GCP_KEY,
  byDir: BY_DIR, csvPath: CSV_PATH, rawBase: RAW_BASE, noFetch: NO_FETCH,
  stamp: STAMP, log,
});

// ── selection ───────────────────────────────────────────────────────────────
function selectWorks(rows) {
  // originals only (translated works need a curated orig_language — out of auto pilot)
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  // prefer recognizable canon (known-author era map) for a better pilot, then the rest
  const known = originals.filter((r) => by.eraForAuthor(r.authors));
  const rest = originals.filter((r) => !by.eraForAuthor(r.authors));
  return [...known, ...rest];
}

(async () => {
  fs.mkdirSync(BY_DIR, { recursive: true });
  const csvText = await core.loadOrFetchCsv();
  const parsed = by.parseCsv(csvText);
  log("csv rows:", parsed.rows.length, "| provider:", PROVIDER, MANIFEST ? "| manifest: " + MANIFEST : "| auto limit " + LIMIT + " (acc " + ACCESSIBLE_MAX + " / lit " + LITERARY_MAX + ")");

  const texts = [];
  const reportRows = [];
  let shelves = [];

  if (MANIFEST) {
    // ── explicit curation (R6/R7): manifest works + manifest shelves ──────────
    const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    const byId = new Map(); for (const r of parsed.rows) if (by.cleanField(r.ID)) byId.set(String(r.ID), r);
    const shelfItems = {}; // slug → [text_key]
    const workShelves = []; // BRR-P0-004 A — auto "work" shelves (TOC) for chaptered works
    for (const w of (man.works || [])) {
      const r = byId.get(String(w.byehuda_id));
      if (!r) { console.error("[ingest] manifest byehuda_id not in CSV: " + w.byehuda_id); process.exit(5); }
      let raw; try { raw = await core.fetchTxt(r.path); } catch (e) { console.error("[ingest] txt fetch failed for " + w.byehuda_id + ": " + e.message); process.exit(6); }
      const { body } = by.stripFooter(raw);
      if (!body) { console.error("[ingest] empty body for " + w.byehuda_id); process.exit(6); }
      const plainLen = by.stripNiqqud(body).length;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      const derivedBase = { track: w.track, register: w.register, era: w.era, themes: w.themes || [], orig_language: w.orig_language || undefined, review_status: w.review_status || undefined, audio_status: "none" };
      // BRR-P0-004 A — a long work with clear chapter structure becomes a multi-part
      // "work" (its OWN shelf = table of contents); short / single-flow works stay one
      // text. Replaces the old novella-skip — nothing dropped (owner: "process, don't skip").
      const chap = by.chapterizeWork(body);
      if (chap.mode === "single") {
        log("→ [" + r.ID + "] " + (by.cleanField(r.title) || "?") + " — " + (by.cleanField(r.authors) || "?") + " (" + w.track + "/" + w.register + ", " + lineCount + " lines, " + plainLen + " ch)");
        const built = await core.translateAndBuild(r, body, derivedBase, plainLen);
        if (!built) { console.error("[ingest] curated work " + w.byehuda_id + " failed corpus build (R1) — not silently dropped"); process.exit(3); }
        texts.push(built.textItem); reportRows.push(built.reportRow);
        const slug = w.shelf || ("by-" + built.corpus.track);
        (shelfItems[slug] = shelfItems[slug] || []).push(built.textKey);
      } else {
        const workTitle = by.cleanField(r.title) || ("Произведение #" + r.ID);
        const total = chap.chapters.length;
        log("→ [" + r.ID + "] " + workTitle + " — " + (by.cleanField(r.authors) || "?") + " (" + chap.mode + " ×" + total + " → work-shelf, " + plainLen + " ch)");
        const items = [];
        for (let ci = 0; ci < chap.chapters.length; ci++) {
          const c = chap.chapters[ci];
          const cDerived = { ...derivedBase, series: { work_byehuda_id: r.ID, work_title: workTitle, part: ci + 1, total } };
          const cTitle = c.title ? (workTitle + " · " + c.title) : (workTitle + " · " + (ci + 1));
          const built = await core.translateAndBuild(r, c.body, cDerived, by.stripNiqqud(c.body).length, { textId: "by-" + r.ID + "-c" + (ci + 1), title: cTitle });
          if (!built) { console.error("[ingest] chapter " + (ci + 1) + "/" + total + " of " + w.byehuda_id + " failed corpus build (R1)"); process.exit(3); }
          texts.push(built.textItem); reportRows.push(built.reportRow);
          items.push(built.textKey);
        }
        // the work's own shelf = its table of contents (R8: a route, not a flat list)
        workShelves.push(shelfMeta.buildShelf({
          slug: "by-work-" + r.ID, title: workTitle, track: w.track, era: w.era,
          genre: by.cleanGenre(r.genre) || undefined,
          editorial_intro: "Многоглавное произведение — " + (by.cleanField(r.authors) || "") + ". " + total + " " + (chap.mode === "chapters" ? "глав" : "частей") + "; читайте по порядку.",
          items, order: 100 + workShelves.length,
        }));
      }
    }
    shelves = (man.shelves || []).map((s) => shelfMeta.buildShelf({ slug: s.slug, title: s.title, track: s.track, era: s.era, genre: s.genre, editorial_intro: s.editorial_intro, items: shelfItems[s.slug] || [], order: s.order })).concat(workShelves);
    log("manifest:", texts.length, "texts (incl. chapters),", shelves.length, "shelves (" + workShelves.length + " work-shelves)");
  } else if (AUTO) {
    // ── heuristic auto-select (originals; known-canon first) ──────────────────
    const candidates = selectWorks(parsed.rows);
    log("candidates (originals):", candidates.length, "| known-canon first:", candidates.filter((r) => by.eraForAuthor(r.authors)).length);
    const shelfItems = { accessible: [], literary: [] };
    let accN = 0, litN = 0, scanned = 0;
    for (const r of candidates) {
      if (accN >= ACCESSIBLE_MAX && litN >= LITERARY_MAX) break;
      if (texts.length >= LIMIT) break;
      scanned++;
      let raw; try { raw = await core.fetchTxt(r.path); } catch (e) { continue; }
      const { body } = by.stripFooter(raw);
      if (!body) continue;
      const plainLen = by.stripNiqqud(body).length;
      if (plainLen < MIN_CHARS || plainLen > MAX_CHARS) continue;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      const cls = by.classifyWork({ genre: r.genre, author: r.authors, shape: { lineCount, charCount: plainLen } });
      if (cls.track === "accessible" && accN >= ACCESSIBLE_MAX) continue;
      if (cls.track === "literary" && litN >= LITERARY_MAX) continue;
      log("→ [" + r.ID + "] " + (by.cleanField(r.title) || "?") + " — " + (by.cleanField(r.authors) || "?") + " (" + cls.track + "/" + cls.register + ", " + lineCount + " lines, " + plainLen + " ch)");
      const built = await core.translateAndBuild(r, body, { ...cls, audio_status: "none" }, plainLen);
      if (!built) continue;
      texts.push(built.textItem); reportRows.push(built.reportRow);
      shelfItems[built.corpus.track].push(built.textKey);
      if (built.corpus.track === "accessible") accN++; else litN++;
    }
    log("selected:", texts.length, "(accessible " + accN + " / literary " + litN + ") from", scanned, "scanned");
    if (shelfItems.accessible.length) shelves.push(shelfMeta.buildShelf({ slug: "by-accessible", title: "Доступная полка", track: "accessible", editorial_intro: "Короткие стихи и простые тексты — мягкий вход в чтение на иврите. (Автоподборка пилота; кураторский маршрут — на этапе bulk.)", items: shelfItems.accessible, order: 0 }));
    if (shelfItems.literary.length) shelves.push(shelfMeta.buildShelf({ slug: "by-literary", title: "Литературная полка", track: "literary", editorial_intro: "Канонические тексты для уверенного чтения с морфо-опорой. (Автоподборка пилота; кураторский маршрут — на этапе bulk.)", items: shelfItems.literary, order: 1 }));
  } else {
    console.error("[ingest] pass --manifest <path> (curated) or --auto (heuristic)"); process.exit(2);
  }

  if (!texts.length) { console.error("[ingest] no works selected — check manifest/--limit/--max-chars or fetch"); process.exit(4); }

  // BRR-P0-008 — every producer shelf is canon: stamp origin + canon_version so the
  // import-side reconcile can refresh/dedup them on a version bump without touching
  // user-curated shelves. (Texts are already canon-identifiable via corpus.byehuda_id.)
  for (const sh of shelves) { sh.origin = CANON_ORIGIN; sh.canon_version = CANON_VERSION; }

  const lib = by.buildLibraryJson({ texts, shelves, canonVersion: CANON_VERSION });

  // ── R1 honesty gate ──────────────────────────────────────────────────────
  const gate = by.validateLibrary(lib);
  log("R1 gate:", JSON.stringify(gate.classes), "| errors:", gate.errors.length, "| warnings:", gate.warnings.length);
  for (const w of gate.warnings) log("  warn [" + (w.text_id || w.slug || "?") + "]: " + w.warning);
  const accCount = texts.filter((t) => (corpusMeta.getCorpus(t) || {}).track === "accessible").length;
  const report = { generated_at: STAMP, provider: PROVIDER, mode: MANIFEST ? "manifest" : "auto", selected: texts.length, accessible: accCount, literary: texts.length - accCount, classes: gate.classes, errors: gate.errors, warnings: gate.warnings, works: reportRows };
  const reportPath = path.join(TMP, "benyehuda-ingest-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log("QA report →", reportPath);
  if (!gate.ok) {
    console.error("[ingest] R1 honesty gate FAILED:");
    for (const e of gate.errors) console.error("  " + (e.text_id || e.slug) + ": " + (e.errors || []).join("; "));
    process.exit(3);
  }

  if (DRY) { log("dry-run — no ZIP written"); return; }

  const zip = new JSZip();
  const rowCount = texts.reduce((a, t) => a + t.rows.length, 0);
  zip.file("manifest.json", JSON.stringify(by.buildManifest({ textCount: texts.length, rowCount, noteCount: 0, createdAt: STAMP }), null, 2));
  zip.file("library/library.json", JSON.stringify(lib));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  log("bundle →", OUT, "(" + Math.round(buf.length / 1024) + " KB, " + texts.length + " texts, " + rowCount + " rows, " + shelves.length + " shelves)");
  log("next: import into the OPFS Reading Room and open @380px RTL (both tracks).");
})().catch((e) => { console.error("[ingest] fatal:", e); process.exit(1); });
