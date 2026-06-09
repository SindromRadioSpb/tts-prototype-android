#!/usr/bin/env node
// scripts/premium/push-canon-audio.js
// BRR-P0-007 · Slice 4 — push the staged canon MP3s into PROD's audio cache so
// reader-core tier-1 (HEAD/GET /api/audio/:key) serves them KEYLESS to every
// reader. Content-addressed: each file uploads under its own assetKey, so this
// is idempotent (HEAD pre-check skips files already present) and a re-run after a
// partial push completes the rest.
//
//   node scripts/premium/push-canon-audio.js [--base https://linguistpro.kolosei.com]
//                                            [--dir .tmp/benyehuda-audio/audio-cache]
//                                            [--concurrency 6] [--limit N] [--dry-run]
//
// Upload contract: POST /api/audio/cache/upload { assetKey, mp3Base64 }. The
// endpoint is LOCAL_ONLY but honours the `X-Local-Mode: 1` header (same gate the
// localMode browser uses), so no prod env toggle / redeploy is needed. It writes
// audio-cache/<key>.mp3 on the PERSISTENT volume (survives redeploys). Honest:
// failures are counted + listed, never swallowed.
//
// ⚠ OUTWARD-FACING: this publishes audio to the live server. Run only on the
// owner's explicit go. Uploading MP3s alone is harmless until canon-v3.zip ships
// the stamped keys (tier-1 only fires on a stamped audio_asset_key).

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const a = { base: "https://linguistpro.kolosei.com", dir: path.join(ROOT, ".tmp", "benyehuda-audio", "audio-cache"), concurrency: 6, limit: 0, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") a.base = String(argv[++i] || a.base).replace(/\/+$/, "");
    else if (k === "--dir") a.dir = path.resolve(String(argv[++i] || a.dir));
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (k === "--limit") a.limit = Number(argv[++i] || 0);
    else if (k === "--dry-run") a.dryRun = true;
  }
  return a;
}

const KEY_RE = /^[a-f0-9]{64}\.mp3$/;

async function headPresent(base, key) {
  try {
    const r = await fetch(base + "/api/audio/" + key, { method: "HEAD" });
    return r.ok;
  } catch (_) { return false; }
}

async function uploadOne(base, key, filePath, tries = 3) {
  const mp3Base64 = fs.readFileSync(filePath).toString("base64");
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(base + "/api/audio/cache/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Mode": "1" },
        body: JSON.stringify({ assetKey: key, mp3Base64 }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body && body.ok) return { ok: true, alreadyExisted: !!body.alreadyExisted };
      if (r.status === 403) { const e = new Error("LOCAL_ONLY (403) — endpoint refused; X-Local-Mode header rejected or server changed"); e.fatal = true; throw e; }
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) { lastErr = new Error("HTTP " + r.status); }
      else throw new Error("HTTP " + r.status + " " + JSON.stringify(body).slice(0, 120));
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    if (attempt < tries) await new Promise((res) => setTimeout(res, 700 * attempt * attempt));
  }
  throw lastErr || new Error("upload failed");
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  async function lane() { while (true) { const i = idx++; if (i >= items.length) return; await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.dir)) { console.error("ERROR: staging dir not found: " + args.dir + "\nRun bake-canon-audio.js first."); process.exit(2); }
  let files = fs.readdirSync(args.dir).filter((f) => KEY_RE.test(f));
  if (args.limit) files = files.slice(0, args.limit);
  if (!files.length) { console.error("ERROR: no <key>.mp3 files in " + args.dir); process.exit(2); }

  console.log("=== BRR-P0-007 push canon audio → prod ===");
  console.log("base=" + args.base + "  files=" + files.length + "  concurrency=" + args.concurrency + (args.dryRun ? "  [DRY RUN]" : ""));

  let uploaded = 0, already = 0, present = 0, failed = 0, done = 0;
  const failures = [];

  await runPool(files, args.concurrency, async (f) => {
    const key = f.replace(/\.mp3$/, "");
    try {
      if (await headPresent(args.base, key)) { present++; }
      else if (args.dryRun) { /* would upload */ }
      else {
        const res = await uploadOne(args.base, key, path.join(args.dir, f));
        if (res.alreadyExisted) already++; else uploaded++;
      }
    } catch (e) {
      failed++; failures.push({ key, error: (e && e.message) || String(e) });
      if (e && e.fatal) { console.error("\nFATAL: " + e.message); }
    }
    done++;
    if (done % 200 === 0 || done === files.length) {
      process.stdout.write("  " + done + "/" + files.length + "  uploaded=" + uploaded + " present=" + present + " already=" + already + " failed=" + failed + "\r");
    }
  });
  process.stdout.write("\n");

  console.log("\nfiles=" + files.length + "  uploaded=" + uploaded + "  alreadyPresent(HEAD)=" + present + "  alreadyExisted(upload)=" + already + "  failed=" + failed);
  if (failures.length) {
    console.log("\n⚠ " + failures.length + " FAILED (re-run is resumable; HEAD skips done):");
    for (const f of failures.slice(0, 10)) console.log("   " + f.key.slice(0, 12) + "…  " + f.error);
    if (failures.length > 10) console.log("   …and " + (failures.length - 10) + " more.");
    process.exit(1);
  }
  console.log("\n✓ push complete." + (args.dryRun ? " (dry run — nothing uploaded)" : " Prod cache now serves these keyless via /api/audio/:key."));
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
