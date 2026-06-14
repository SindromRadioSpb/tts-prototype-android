#!/usr/bin/env node
// scripts/premium/push-corpus-fts.js — BRR-P2-001.
// Push the full-text index shards (public/data/benyehuda/fts/*.json) into PROD's persistent
// volume so the Reading Room serves them at /data/benyehuda/fts/<file> WITHOUT bloating git
// with the tens-of-MB index. The thin manifest (corpus-fts-v<N>.json) ships in the repo; this
// pushes the per-letter exact shards + lemma index + lemmamap.
//
//   node scripts/premium/push-corpus-fts.js [--base https://linguistpro.kolosei.com]
//                                           [--dir public/data/benyehuda/fts]
//                                           [--concurrency 4] [--dry-run]
//
// Upload contract: POST /api/benyehuda/fts/upload { file, json }. AUTH (BRR-P0-010 shared
// owner-token): header X-Audio-Upload-Token = process.env.AUDIO_UPLOAD_TOKEN (must match the
// server env — set it in Coolify + deploy FIRST). Atomic overwrite (re-publishable). Failures
// are counted + listed, never swallowed; 403/503 abort fatally.
//
// ⚠ OUTWARD-FACING: publishes to the live server. Run only on the owner's explicit go.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TOKEN = process.env.AUDIO_UPLOAD_TOKEN || "";
const FTS_FILE_RE = /^((ex-[א-ת]+|lemma|lemmamap)-v\d+\.json)$/;

function parseArgs(argv) {
  const a = { base: "https://linguistpro.kolosei.com", dir: path.join(ROOT, "public", "data", "benyehuda", "fts"), concurrency: 4, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") a.base = String(argv[++i] || a.base).replace(/\/+$/, "");
    else if (k === "--dir") a.dir = path.resolve(String(argv[++i] || a.dir));
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 4));
    else if (k === "--dry-run") a.dryRun = true;
  }
  return a;
}

async function uploadOne(base, file, filePath, tries = 3) {
  let json;
  try { json = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { throw new Error("unreadable/invalid JSON: " + (e && e.message)); }
  const payload = JSON.stringify({ file, json });
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(base + "/api/benyehuda/fts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": TOKEN },
        body: payload,
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body && body.ok) return { ok: true, bytes: body.bytes };
      if (r.status === 403) { const e = new Error("403 BAD_UPLOAD_TOKEN — does AUDIO_UPLOAD_TOKEN match the server?"); e.fatal = true; throw e; }
      if (r.status === 503) { const e = new Error("503 UPLOAD_DISABLED — server has no AUDIO_UPLOAD_TOKEN; set it in prod env first"); e.fatal = true; throw e; }
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) lastErr = new Error("HTTP " + r.status);
      else throw new Error("HTTP " + r.status + " " + JSON.stringify(body).slice(0, 160));
    } catch (e) { if (e.fatal) throw e; lastErr = e; }
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
  if (!TOKEN && !args.dryRun) {
    console.error("ERROR: AUDIO_UPLOAD_TOKEN is not set. Export the same token the server has, then re-run.\n" +
      "  bash:        export AUDIO_UPLOAD_TOKEN=<token>\n  (--dry-run needs no token.)");
    process.exit(2);
  }
  if (!fs.existsSync(args.dir)) { console.error("ERROR: fts dir not found: " + args.dir + "\nRun build-corpus-fts.js first."); process.exit(2); }
  const files = fs.readdirSync(args.dir).filter((f) => FTS_FILE_RE.test(f));
  if (!files.length) { console.error("ERROR: no fts shard files in " + args.dir); process.exit(2); }

  console.log("=== BRR-P2-001 push corpus-fts shards → prod volume ===");
  console.log("base=" + args.base + "  files=" + files.length + "  concurrency=" + args.concurrency + (args.dryRun ? "  [DRY RUN]" : ""));

  let uploaded = 0, failed = 0, done = 0, bytes = 0;
  const failures = [];
  await runPool(files, args.concurrency, async (f) => {
    try {
      if (args.dryRun) { /* would upload */ }
      else { const r = await uploadOne(args.base, f, path.join(args.dir, f)); uploaded++; bytes += r.bytes || 0; }
    } catch (e) {
      failed++; failures.push({ file: f, error: (e && e.message) || String(e) });
      if (e && e.fatal) console.error("\nFATAL: " + e.message);
    }
    done++;
    process.stdout.write("  " + done + "/" + files.length + "  uploaded=" + uploaded + " failed=" + failed + "\r");
  });
  process.stdout.write("\n");

  console.log("\nfiles=" + files.length + "  uploaded=" + uploaded + "  failed=" + failed + "  (" + (bytes / 1048576).toFixed(1) + "MB)");
  if (failures.length) {
    console.log("\n⚠ " + failures.length + " FAILED (re-run is resumable):");
    for (const f of failures.slice(0, 10)) console.log("   " + f.file + "  " + f.error);
    process.exit(1);
  }
  console.log("\n✓ push complete." + (args.dryRun ? " (dry run)" : " Prod volume now serves these at /data/benyehuda/fts/<file>."));
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
