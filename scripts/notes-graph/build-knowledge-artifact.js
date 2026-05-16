#!/usr/bin/env node
// scripts/notes-graph/build-knowledge-artifact.js — one-off tool.
//
// NOT a smoke (not wired into all-smoke). Builds a full demonstrable
// "Карта знаний" artifact from the user's real 79-text bundle:
//   1. pre-seeds the server audio cache from the bundle's audio/*.mp3
//      (same end-state a real "Импорт ZIP" produces);
//   2. imports the bundle library + notes via the real ldb.importBundle;
//   3. enriches with notes of ALL 5 types (free, word_study,
//      grammar_rule, translation_discrepancy, pronunciation_note) +
//      explicit note_links + a durable CONFIRMED suggestion layer so
//      the graph shows every node/edge kind;
//   4. exports through the REAL "📚 Библиотека → Экспорт ZIP (с
//      аудио)" feature (v3LibraryExportBundle) and saves the ZIP to
//      Smoke-check/ for owner verification.
//
// Usage: node scripts/notes-graph/build-knowledge-artifact.js

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3240;
const BASE = `http://127.0.0.1:${PORT}`;
const BUNDLE_DIR = path.join(REPO, ".external", "bundle2");
const AUDIO_SRC = path.join(BUNDLE_DIR, "audio");
const AUDIO_CACHE = path.join(REPO, "data", "audio-cache");
const OUT_DIR = path.join(REPO, "Smoke-check");
const OUT_NAME = "knowledge-artifact-allnotetypes-" +
  new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".zip";

function log(m) { console.log("[artifact] " + m); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 1. pre-seed server audio cache (content-addressed; skip existing) ─────
function seedAudio() {
  if (!fs.existsSync(AUDIO_SRC)) { log("no bundle audio dir — skipping seed"); return 0; }
  if (!fs.existsSync(AUDIO_CACHE)) fs.mkdirSync(AUDIO_CACHE, { recursive: true });
  const files = fs.readdirSync(AUDIO_SRC).filter((f) => /\.mp3$/i.test(f));
  let copied = 0;
  for (const f of files) {
    const dst = path.join(AUDIO_CACHE, f);
    if (fs.existsSync(dst)) continue;
    try { fs.copyFileSync(path.join(AUDIO_SRC, f), dst); copied++; } catch (_) {}
  }
  log(`audio: ${files.length} in bundle, ${copied} copied into cache`);
  return files.length;
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (c) => {
    const s = String(c).trim(); if (s) console.error("[srv] " + s);
  });
  return child;
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const ok = await new Promise((res) => {
    const t = setTimeout(() => res(false), 5000);
    child.once("exit", () => { clearTimeout(t); res(true); });
  });
  if (!ok && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}
async function waitReady(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(300);
  }
  return false;
}

// ── in-page: import bundle then enrich with all 5 note types ─────────────
async function importAndEnrich(page, lib) {
  return page.evaluate(async (libObj) => {
    const ldb = window.__localDB;
    if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
    // 2. real import core
    const imp = await ldb.importBundle(libObj, { mode: "skip" });

    // pick real anchors
    const texts = await ldb.dbQuery(
      "SELECT id, title FROM texts WHERE is_archived = 0 ORDER BY id LIMIT 8", []);
    const t = texts.map((x) => x.id);
    async function sents(textId, n) {
      const rows = await ldb.dbQuery(
        "SELECT id FROM sentences WHERE text_id = ? ORDER BY id LIMIT ?", [textId, n]);
      return rows.map((r) => r.id);
    }
    const s0 = await sents(t[0], 6);
    const s1 = await sents(t[1], 4);

    const made = [];
    const mk = async (o) => { const row = await ldb.createNote(o); made.push(row); return row; };

    // 3a. word_study — shared roots (כתב×3, אהב×2) + binyan paal → clusters
    const W = await mk({ target_kind: "word", target_id: "כתב", text_id: t[0],
      note_type: "word_study", title: "כתב",
      body: { kind: "word_study", word: "לכתוב", niqqud_variant: "לִכְתּוֹב",
              root: "כתב", binyan: "paal", meaning: "писать" } });
    const W2 = await mk({ target_kind: "word", target_id: "מכתב", text_id: t[1],
      note_type: "word_study", title: "מכתב",
      body: { kind: "word_study", word: "מכתב", niqqud_variant: "מִכְתָּב",
              root: "כתב", binyan: "paal", meaning: "письмо" } });
    const W3 = await mk({ target_kind: "word", target_id: "כותב", text_id: t[2],
      note_type: "word_study", title: "כותב",
      body: { kind: "word_study", word: "כותב", niqqud_variant: "כּוֹתֵב",
              root: "כתב", binyan: "paal", meaning: "пишущий" } });
    const A1 = await mk({ target_kind: "word", target_id: "אוהב", text_id: t[0],
      note_type: "word_study", title: "אוהב",
      body: { kind: "word_study", word: "אוהב", niqqud_variant: "אוֹהֵב",
              root: "אהב", binyan: "paal", meaning: "любит" } });
    const A2 = await mk({ target_kind: "word", target_id: "אהבה", text_id: t[3],
      note_type: "word_study", title: "אהבה",
      body: { kind: "word_study", word: "אהבה", niqqud_variant: "אַהֲבָה",
              root: "אהב", binyan: "paal", meaning: "любовь" } });

    // 3b. grammar_rule (carries root/binyan so it joins the כתב cluster)
    const G = await mk({ target_kind: "sentence", target_id: s0[0],
      note_type: "grammar_rule", title: "Биньян paal",
      body: { kind: "grammar_rule", rule_title: "Паттерн paal",
              rule_body: "Базовый биньян; корень כתב в настоящем времени.",
              root: "כתב", binyan: "paal", examples: "כותב / כותבת" } });

    // 3c. translation_discrepancy (root אהב → joins that cluster)
    const TD = await mk({ target_kind: "sentence", target_id: s0[1],
      note_type: "translation_discrepancy", title: "Оттенок אהב",
      body: { kind: "translation_discrepancy", source_text: "אני אוהב",
              translation_suggested: "мне нравится / я люблю",
              reasoning: "Контекстный оттенок корня אהב.", root: "אהב" } });

    // 3d. pronunciation_note (root שלם)
    const P = await mk({ target_kind: "word", target_id: "שלום", text_id: t[1],
      note_type: "pronunciation_note", title: "שלום",
      body: { kind: "pronunciation_note", word: "שלום", ipa: "ʃaˈlom",
              common_mistakes: "ударение на последний слог", root: "שלם" } });

    // 3e. free notes anchored to sentences (auto_text backbone)
    const F1 = await mk({ target_kind: "sentence", target_id: s0[2],
      note_type: "free", title: "",
      body: "Свободная заметка о строке — связана с корнем [[כתב]]." });
    const F2 = await mk({ target_kind: "sentence", target_id: s1[0],
      note_type: "free", title: "",
      body: "Наблюдение по второму тексту." });

    // 3f. explicit note_links (manual link layer): note→note, note→text,
    // note→root.
    const L = [];
    async function link(from, kind, id, alias) {
      try { await ldb.addNoteLink(from, { to_kind: kind, to_id: id, link_alias: alias || null }); L.push([from, kind, id]); }
      catch (_) {}
    }
    await link(F1.id, "note", W.id, "корень כתב");
    await link(G.id,  "note", W.id, "пример paal");
    await link(W.id,  "text", t[0], "источник");
    await link(W.id,  "root", "כתב", "כתב");
    await link(A1.id, "root", "אהב", "אהב");

    // 3g. durable CONFIRMED suggestion layer (Phase 4): persist a
    // confirmed decision AND the real note_links row, so the artifact
    // demonstrates the learner-confirmed connection class too.
    async function confirm(from, to, reason, evidence) {
      try {
        if (typeof ldb.upsertSuggestion === "function") {
          await ldb.upsertSuggestion({ from: from, to: to, to_kind: "note",
            reason_code: reason, evidence: evidence, score: 3,
            state: "confirmed" });
        }
        await ldb.addNoteLink(from, { to_kind: "note", to_id: to, link_alias: evidence });
      } catch (_) {}
    }
    await confirm(W2.id, W.id, "shared_root", "כתב");
    await confirm(W3.id, W.id, "shared_root", "כתב");
    await confirm(A2.id, A1.id, "shared_root", "אהב");

    const counts = await ldb.dbQuery(
      "SELECT note_type, COUNT(*) AS c FROM notes_v2 GROUP BY note_type", []);
    const links = await ldb.dbQuery("SELECT COUNT(*) AS c FROM note_links", []);
    return {
      imported: imp && imp.imported,
      added: made.length,
      links: L.length,
      noteTypes: counts,
      totalLinks: links[0] && links[0].c,
      texts: t.length,
    };
  }, lib);
}

async function main() {
  if (!fs.existsSync(path.join(BUNDLE_DIR, "library", "library.json"))) {
    console.error("[artifact] bundle2 not unpacked at " + BUNDLE_DIR);
    process.exit(1);
  }
  const lib = JSON.parse(fs.readFileSync(
    path.join(BUNDLE_DIR, "library", "library.json"), "utf8"));
  try {
    const adv = JSON.parse(fs.readFileSync(
      path.join(BUNDLE_DIR, "library", "notes_advanced.json"), "utf8"));
    if (adv && typeof adv === "object") lib.notes_advanced = adv;
  } catch (_) {}

  seedAudio();
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[artifact] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitReady())) { console.error("[artifact] server failed"); await stopServer(srv); process.exit(1); }
  log("server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => console.error("[pageerror] " + (e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1200);

    log("importing bundle + enriching with all 5 note types …");
    const stat = await importAndEnrich(pg, lib);
    log("import/enrich: " + JSON.stringify(stat));

    log("exporting via real v3LibraryExportBundle (с аудио) — may take a few minutes …");
    const [download] = await Promise.all([
      pg.waitForEvent("download", { timeout: 600000 }),
      pg.evaluate(() => window.v3LibraryExportBundle()),
    ]);
    const out = path.join(OUT_DIR, OUT_NAME);
    await download.saveAs(out);
    const sz = fs.statSync(out).size;
    log(`saved → ${out} (${(sz / 1048576).toFixed(1)} MB)`);

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv);
  }

  // 4. verify the produced artifact
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(path.join(OUT_DIR, OUT_NAME));
  const man = JSON.parse(zip.getEntry("manifest.json").getData().toString("utf8"));
  const advE = zip.getEntry("library/notes_advanced.json");
  const adv = advE ? JSON.parse(advE.getData().toString("utf8")) : { notes: [], links: [] };
  const tb = {};
  for (const n of (adv.notes || [])) tb[n.note_type] = (tb[n.note_type] || 0) + 1;
  const audioEntries = zip.getEntries().filter((e) => /^audio\/.+\.mp3$/.test(e.entryName)).length;
  console.log("\n[artifact] VERIFY");
  console.log("  manifest: texts=%d rows=%d audio=%d missing=%d",
    man.text_count, man.row_count, man.audio_count, man.missing_audio_count);
  console.log("  notes_advanced: notes=%d links=%d note_types=%s",
    (adv.notes || []).length, (adv.links || []).length, JSON.stringify(tb));
  console.log("  audio entries in zip: %d", audioEntries);
  const allTypes = ["free", "word_study", "grammar_rule",
    "translation_discrepancy", "pronunciation_note"];
  const haveAll = allTypes.every((k) => (tb[k] || 0) > 0);
  const ok = haveAll && (adv.links || []).length > 0 &&
    man.text_count > 0 && audioEntries > 0;
  console.log(ok
    ? "\n[artifact] ✓ full Knowledge-Graph artifact ready (all 5 note types + links + audio)"
    : "\n[artifact] ✗ artifact incomplete — see above");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("[artifact] fatal:", e); process.exit(1); });
