#!/usr/bin/env node
// scripts/premium/bake-and-push-timing.js
// BRR-P1-008b · Re-bake canon rows WITH SSML <mark> timepoints and push to prod:
//   <assetKey>.mp3 (overwrite — the served clip must match the timepoints) + <assetKey>.timing.json.
// Voice MUST equal the canon-v3 voice (he-IL-Wavenet-A) so assetKey == the client's stamped key.
//
//   GCP_TTS_API_KEY=AIza... AUDIO_UPLOAD_TOKEN=... node scripts/premium/bake-and-push-timing.js --limit 1
//
// Resumable: --skip-existing-timing HEADs prod /api/audio/<key>/timing and skips done clips.
// Honest: failures counted+listed; per-clip timepoint coverage (got/n) reported (R10 — truncation watch).
// Secrets from env only — never written to disk/code.
//
// Flags: --voice <v> (default he-IL-Wavenet-A) · --limit <N texts> (0=all) · --concurrency <N> (default 3)
//        · --prod-base <url> · --dry-run (synth only, no push) · --skip-existing-timing

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const tb = require("./lib/ttsBake");

const ROOT = path.resolve(__dirname, "..", "..");
const CANON_ZIP = path.join(ROOT, "public", "data", "benyehuda", "canon-v3.zip");

function parseArgs(argv) {
  const a = { voice: "he-IL-Wavenet-A", limit: 0, concurrency: 3, dryRun: false, skipExisting: false, prodBase: "https://linguistpro.kolosei.com" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--voice") a.voice = String(argv[++i] || a.voice);
    else if (k === "--limit") a.limit = Number(argv[++i] || 0);
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 3));
    else if (k === "--prod-base") a.prodBase = String(argv[++i] || a.prodBase).replace(/\/$/, "");
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--skip-existing-timing") a.skipExisting = true;
  }
  return a;
}

async function loadTexts() {
  const zip = await JSZip.loadAsync(fs.readFileSync(CANON_ZIP));
  const lib = JSON.parse(await zip.file("library/library.json").async("string"));
  return Array.isArray(lib.texts) ? lib.texts : [];
}

function buildWorkList(texts, profile, limit) {
  const byKey = new Map();
  let textCount = 0, rowCount = 0, empty = 0;
  for (const t of texts) {
    if (limit && textCount >= limit) break;
    textCount++;
    for (const r of (t.rows || t.sentences || [])) {
      rowCount++;
      const text = tb.rowText(r);
      if (!text) { empty++; continue; }
      const key = tb.keyForText(text, profile);
      if (!byKey.has(key)) byKey.set(key, { key, text });
    }
  }
  return { work: Array.from(byKey.values()), stats: { textCount, rowCount, empty, unique: byKey.size } };
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  async function lane() { while (true) { const i = idx++; if (i >= items.length) return; await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

async function headTimingExists(base, key) {
  try { const r = await fetch(base + "/api/audio/" + key + "/timing", { method: "HEAD" }); return !!(r && r.ok); } catch (_) { return false; }
}

async function pushClip(base, token, key, mp3, timing) {
  const r = await fetch(base + "/api/audio/cache/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": token },
    body: JSON.stringify({ assetKey: key, mp3Base64: mp3.toString("base64"), timingJson: timing, overwrite: true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { const e = new Error("push HTTP " + r.status + " " + (j.error || "")); e.status = r.status; throw e; }
  return j;
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = String(process.env.GCP_TTS_API_KEY || "").trim();
  const token = String(process.env.AUDIO_UPLOAD_TOKEN || "").trim();
  if (!apiKey || !apiKey.startsWith("AIza")) { console.error("ERROR: GCP_TTS_API_KEY (AIza...) required in env."); process.exit(2); }
  if (!args.dryRun && !token) { console.error("ERROR: AUDIO_UPLOAD_TOKEN required in env (or --dry-run)."); process.exit(2); }

  const profile = tb.defaultProfile(args.voice);
  const texts = await loadTexts();
  const { work, stats } = buildWorkList(texts, profile, args.limit);
  console.log("=== BRR-P1-008b bake+push timing ===");
  console.log("voice=" + args.voice + "  texts=" + stats.textCount + "  rows=" + stats.rowCount + "  uniqueClips=" + stats.unique + (args.dryRun ? "  [DRY RUN]" : ""));
  console.log("prod=" + args.prodBase + "\n");

  let pushed = 0, skipped = 0, failed = 0, totalWords = 0, gotWords = 0, truncated = 0;
  const failures = [], samples = [];
  await runPool(work, args.concurrency, async (w) => {
    try {
      if (args.skipExisting && !args.dryRun && (await headTimingExists(args.prodBase, w.key))) { skipped++; return; }
      const { mp3, timing } = await tb.synthesizeWithTimepoints(apiKey, w.text, profile);
      totalWords += timing.n; gotWords += timing.got;
      if (timing.got < timing.n) { truncated++; }
      if (!args.dryRun) await pushClip(args.prodBase, token, w.key, mp3, timing);
      pushed++;
      if (samples.length < 3) samples.push({ key: w.key.slice(0, 12), n: timing.n, got: timing.got, t0: timing.words[0] && timing.words[0].t });
    } catch (e) {
      failed++; failures.push({ key: w.key.slice(0, 12), preview: w.text.slice(0, 40), err: (e && e.message) || String(e) });
    }
  });

  console.log("pushed=" + pushed + "  skipped=" + skipped + "  failed=" + failed);
  console.log("R10 coverage: words " + gotWords + "/" + totalWords + " (" + (totalWords ? (100 * gotWords / totalWords).toFixed(1) : 0) + "%) · clips truncated(got<n)=" + truncated);
  console.log("samples:", JSON.stringify(samples));
  if (failures.length) { console.log("\n⚠ failures:"); for (const f of failures.slice(0, 8)) console.log("  " + f.key + "… " + f.preview + " — " + f.err); }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
