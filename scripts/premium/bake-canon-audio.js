#!/usr/bin/env node
// scripts/premium/bake-canon-audio.js
// BRR-P0-007 · Slice 2 — resumable offline GCP-TTS bake of the WHOLE curated
// canon. Reads public/data/benyehuda/canon-v2.zip, synthesizes every row's
// vocalised text in the chosen WaveNet voice, writes content-addressed MP3s to a
// local staging cache, and emits a stamp-manifest for Slice 3 (build-canon-v3).
//
//   GCP_TTS_API_KEY=AIza... node scripts/premium/bake-canon-audio.js --voice he-IL-Wavenet-D
//
// Resumable & idempotent: re-running skips keys whose MP3 already exists (so a
// rotated key, an interrupted run, or a re-bake is a no-op for done rows). Keys
// are computed with db/premium/ttsAssetKey.js (== server) so the MP3s are valid
// on prod under their key. Honest: synth failures are counted and listed, never
// silently swallowed. Key from env only — never written to disk/code.
//
// Flags:
//   --voice <he-IL-Wavenet-X>   REQUIRED — the narrator voice.
//   --limit <N>                 process only the first N unique texts (testing).
//   --concurrency <N>           parallel synth calls (default 4).
//   --dry-run                   compute keys + cost, NO synthesis/network.
//   --out-dir <path>            staging dir (default .tmp/benyehuda-audio).

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const tb = require("./lib/ttsBake");
const { getAudioRelativePath } = require("../../db/premium/ttsAssetKey");

const ROOT = path.resolve(__dirname, "..", "..");
const CANON_ZIP = path.join(ROOT, "public", "data", "benyehuda", "canon-v2.zip");

function parseArgs(argv) {
  const a = { voice: "", limit: 0, concurrency: 4, dryRun: false, outDir: path.join(ROOT, ".tmp", "benyehuda-audio") };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--voice") a.voice = String(argv[++i] || "");
    else if (k === "--limit") a.limit = Number(argv[++i] || 0);
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 4));
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--out-dir") a.outDir = path.resolve(String(argv[++i] || a.outDir));
  }
  return a;
}

async function loadLibrary() {
  const zip = await JSZip.loadAsync(fs.readFileSync(CANON_ZIP));
  const f = zip.file("library/library.json");
  if (!f) throw new Error("library/library.json not found in " + CANON_ZIP);
  return JSON.parse(await f.async("string"));
}

// Build the work list: unique (key → {text, chars, eras:Set}) across all rows.
// Dedup by key so identical phrases synthesize once.
function buildWorkList(lib, profile, limit) {
  const texts = Array.isArray(lib.texts) ? lib.texts : [];
  const byKey = new Map();
  let textCount = 0, rowCount = 0, emptyRows = 0;
  for (const t of texts) {
    if (limit && textCount >= limit) break;
    textCount++;
    const era = (t.corpus && t.corpus.era) || "unknown";
    const rows = t.rows || t.sentences || [];
    for (const r of rows) {
      rowCount++;
      const text = tb.rowText(r);
      if (!text) { emptyRows++; continue; }
      const key = tb.keyForText(text, profile);
      let e = byKey.get(key);
      if (!e) { e = { key, text, chars: text.length, eras: new Set() }; byKey.set(key, e); }
      e.eras.add(era);
    }
  }
  return { byKey, stats: { textCount, rowCount, emptyRows, uniqueKeys: byKey.size } };
}

function fmtUsd(chars) {
  // GCP WaveNet: 4M chars/month FREE, then $16 / 1M chars.
  const free = 4_000_000;
  const billable = Math.max(0, chars - free);
  return { freeTierCovers: chars <= free, estUsd: (billable / 1_000_000) * 16 };
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const results = new Array(items.length);
  async function lane() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

async function synthWithRetry(apiKey, text, profile, tries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await tb.synthesizeMp3(apiKey, text, profile); }
    catch (e) {
      lastErr = e;
      const status = e && e.status;
      const transient = status === 429 || (status >= 500 && status < 600) || status == null;
      if (!transient || attempt === tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt * attempt)); // 0.8s, 3.2s
    }
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.voice) { console.error("ERROR: --voice <he-IL-Wavenet-X> is required."); process.exit(2); }
  const apiKey = String(process.env.GCP_TTS_API_KEY || process.env.GCP_TTS_KEY || "").trim();
  if (!args.dryRun) {
    if (!apiKey) { console.error("ERROR: set GCP_TTS_API_KEY in env (or use --dry-run)."); process.exit(2); }
    if (!apiKey.startsWith("AIza")) { console.error("ERROR: key must start with 'AIza'."); process.exit(2); }
  }

  const profile = tb.defaultProfile(args.voice);
  const lib = await loadLibrary();
  const { byKey, stats } = buildWorkList(lib, profile, args.limit);
  const work = Array.from(byKey.values());
  const totalChars = work.reduce((s, w) => s + w.chars, 0);
  const cost = fmtUsd(totalChars);

  const cacheDir = path.join(args.outDir, "audio-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = (key) => path.join(args.outDir, getAudioRelativePath(key)); // .../audio-cache/<key>.mp3

  console.log("=== BRR-P0-007 canon audio bake ===");
  console.log("voice=" + args.voice + "  engine=gcp-tts-v1  concurrency=" + args.concurrency + (args.dryRun ? "  [DRY RUN]" : ""));
  console.log("texts=" + stats.textCount + "  rows=" + stats.rowCount + "  emptyRows=" + stats.emptyRows + "  uniqueClips=" + stats.uniqueKeys);
  console.log("billable chars=" + totalChars + "  → " + (cost.freeTierCovers ? "$0 (within WaveNet 4M/mo free tier)" : "~$" + cost.estUsd.toFixed(2) + " over free tier"));

  // Resume: which unique clips already have a staged MP3.
  let already = 0;
  for (const w of work) { if (fs.existsSync(cachePath(w.key))) { w.cached = true; already++; } }
  const todo = work.filter((w) => !w.cached);
  console.log("staged already=" + already + "  to synthesize=" + todo.length + "\n");

  const failures = [];
  let done = 0, synthBytes = 0;
  if (!args.dryRun && todo.length) {
    await runPool(todo, args.concurrency, async (w) => {
      try {
        const mp3 = await synthWithRetry(apiKey, w.text, profile);
        if (!mp3 || !mp3.length) throw new Error("empty audio");
        // atomic-ish write: tmp then rename
        const tmp = cachePath(w.key) + ".part";
        fs.writeFileSync(tmp, mp3);
        fs.renameSync(tmp, cachePath(w.key));
        w.cached = true; w.bytes = mp3.length; synthBytes += mp3.length;
      } catch (e) {
        failures.push({ key: w.key, error: (e && e.message) || String(e), status: e && e.status, preview: w.text.slice(0, 40) });
      }
      done++;
      if (done % 250 === 0 || done === todo.length) {
        process.stdout.write("  synthesized " + done + "/" + todo.length + " (" + (synthBytes / 1048576).toFixed(1) + " MB, " + failures.length + " failed)\r");
      }
    });
    process.stdout.write("\n");
  }

  // Build the stamp-manifest from whatever is staged on disk (truth = the files).
  const assets = {};
  let stagedTotalBytes = 0, stagedCount = 0;
  for (const w of work) {
    const p = cachePath(w.key);
    if (fs.existsSync(p)) {
      const sz = fs.statSync(p).size;
      assets[w.key] = { chars: w.chars, bytes: sz, eras: Array.from(w.eras) };
      stagedTotalBytes += sz; stagedCount++;
    }
  }
  const manifest = {
    brr: "P0-007",
    engine: "gcp-tts-v1",
    voiceName: args.voice,
    profile,
    builtFrom: "canon-v2.zip",
    stats: { ...stats, uniqueClipsStaged: stagedCount, totalChars, stagedMB: +(stagedTotalBytes / 1048576).toFixed(2), failures: failures.length },
    assets, // key → { chars, bytes, eras[] }
  };
  const manifestPath = path.join(args.outDir, "stamp-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Per-era QA sample: a few keys per era for the owner to spot-listen.
  const byEra = {};
  for (const w of work) { for (const era of w.eras) { (byEra[era] = byEra[era] || []).push(w); } }
  const qa = {};
  for (const era of Object.keys(byEra)) {
    qa[era] = byEra[era].slice(0, 3).map((w) => ({ key: w.key, preview: w.text.slice(0, 50), mp3: fs.existsSync(cachePath(w.key)) }));
  }
  fs.writeFileSync(path.join(args.outDir, "qa-sample.json"), JSON.stringify(qa, null, 2));

  console.log("\nstaged clips=" + stagedCount + "/" + stats.uniqueKeys + "  total=" + (stagedTotalBytes / 1048576).toFixed(1) + " MB");
  console.log("manifest → " + path.relative(ROOT, manifestPath));
  console.log("qa sample → " + path.relative(ROOT, path.join(args.outDir, "qa-sample.json")));
  if (failures.length) {
    console.log("\n⚠ " + failures.length + " FAILED (re-run to retry; resumable):");
    for (const f of failures.slice(0, 10)) console.log("   " + (f.status || "?") + "  " + f.key.slice(0, 12) + "…  " + f.preview + "  — " + f.error);
    if (failures.length > 10) console.log("   …and " + (failures.length - 10) + " more.");
    process.exit(1);
  }
  if (!args.dryRun && stagedCount < stats.uniqueKeys) {
    console.log("\n⚠ staged < unique — some clips missing; re-run to complete.");
    process.exit(1);
  }
  console.log("\n✓ bake complete." + (args.dryRun ? " (dry run — no audio written)" : ""));
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
