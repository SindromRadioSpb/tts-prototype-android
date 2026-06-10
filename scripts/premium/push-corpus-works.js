#!/usr/bin/env node
// scripts/premium/push-corpus-works.js
// BRR-P1-014 A4 — push per-work corpus bundle JSONs (works/<id>.json) into PROD's
// persistent volume so the Reading Room serves them at /data/benyehuda/works/<id>.json
// WITHOUT bloating git with the ~26K corpus tail (only the thin catalog index ships in
// the repo). The static mount in server.js serves the volume copy first; this script is
// how the volume gets populated.
//
//   node scripts/premium/push-corpus-works.js [--base https://linguistpro.kolosei.com]
//                                             [--dir public/data/benyehuda/works]
//                                             [--concurrency 6] [--limit N]
//                                             [--skip-existing] [--dry-run]
//
// Upload contract (mirror of push-canon-audio.js): POST /api/benyehuda/works/upload
// { id, json }. AUTH (BRR-P0-010, owner decision 2026-06-10 — shared owner-upload secret):
// send header X-Audio-Upload-Token = process.env.AUDIO_UPLOAD_TOKEN (must match the server's
// env). So the prod env var MUST be set first (set it in Coolify, then deploy, then run this).
// Unlike content-addressed audio, a work body is RE-PUBLISHABLE (re-bake changes it), so the
// server overwrites atomically; this script uploads by default (use --skip-existing to skip
// works already present on the volume — for a resumable first push). Honest: failures are
// counted + listed, never swallowed; 403 (bad token) / 503 (token unset) abort fatally.
//
// ⚠ OUTWARD-FACING: this publishes to the live server. Run only on the owner's explicit go.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TOKEN = process.env.AUDIO_UPLOAD_TOKEN || ""; // BRR-P0-010 shared owner-token (must match server env)

function parseArgs(argv) {
  const a = {
    base: "https://linguistpro.kolosei.com",
    dir: path.join(ROOT, "public", "data", "benyehuda", "works"),
    concurrency: 6, limit: 0, skipExisting: false, dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") a.base = String(argv[++i] || a.base).replace(/\/+$/, "");
    else if (k === "--dir") a.dir = path.resolve(String(argv[++i] || a.dir));
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (k === "--limit") a.limit = Number(argv[++i] || 0);
    else if (k === "--skip-existing") a.skipExisting = true;
    else if (k === "--dry-run") a.dryRun = true;
  }
  return a;
}

const FILE_RE = /^([A-Za-z0-9_-]{1,40})\.json$/;

async function alreadyServed(base, id) {
  try {
    const r = await fetch(base + "/data/benyehuda/works/" + id + ".json", { method: "HEAD" });
    return r.ok;
  } catch (_) { return false; }
}

async function uploadOne(base, id, filePath, tries = 3) {
  let json;
  try { json = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { const err = new Error("unreadable/invalid JSON: " + (e && e.message)); err.fatal = false; throw err; }
  if (!json || !json.library || !Array.isArray(json.library.texts)) {
    const err = new Error("payload is not { library:{ texts:[…] } }"); throw err;
  }
  const payload = JSON.stringify({ id, json });
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(base + "/api/benyehuda/works/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": TOKEN },
        body: payload,
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body && body.ok) return { ok: true, bytes: body.bytes };
      if (r.status === 403) { const e = new Error("403 BAD_UPLOAD_TOKEN — X-Audio-Upload-Token missing/wrong (does AUDIO_UPLOAD_TOKEN match the server?)"); e.fatal = true; throw e; }
      if (r.status === 503) { const e = new Error("503 UPLOAD_DISABLED — server has no AUDIO_UPLOAD_TOKEN set; set it in the prod env first"); e.fatal = true; throw e; }
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) { lastErr = new Error("HTTP " + r.status); }
      else throw new Error("HTTP " + r.status + " " + JSON.stringify(body).slice(0, 160));
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
  if (!TOKEN && !args.dryRun) {
    console.error("ERROR: AUDIO_UPLOAD_TOKEN is not set (BRR-P0-010). Export the same token the server has, then re-run.\n" +
      "  PowerShell:  $env:AUDIO_UPLOAD_TOKEN = '<token>'\n" +
      "  bash:        export AUDIO_UPLOAD_TOKEN=<token>\n" +
      "  (--dry-run needs no token: it only HEAD-checks what would upload.)");
    process.exit(2);
  }
  if (!fs.existsSync(args.dir)) { console.error("ERROR: works dir not found: " + args.dir + "\nRun build-corpus-catalog.js first."); process.exit(2); }
  let files = fs.readdirSync(args.dir).filter((f) => FILE_RE.test(f));
  if (args.limit) files = files.slice(0, args.limit);
  if (!files.length) { console.error("ERROR: no <id>.json work files in " + args.dir); process.exit(2); }

  console.log("=== BRR-P1-014 A4 push corpus works → prod volume ===");
  console.log("base=" + args.base + "  files=" + files.length + "  concurrency=" + args.concurrency +
    (args.skipExisting ? "  [skip-existing]" : "") + (args.dryRun ? "  [DRY RUN]" : ""));

  let uploaded = 0, skipped = 0, failed = 0, done = 0;
  const failures = [];

  await runPool(files, args.concurrency, async (f) => {
    const id = f.replace(/\.json$/, "");
    try {
      if (args.skipExisting && await alreadyServed(args.base, id)) { skipped++; }
      else if (args.dryRun) { /* would upload */ }
      else { await uploadOne(args.base, id, path.join(args.dir, f)); uploaded++; }
    } catch (e) {
      failed++; failures.push({ id, error: (e && e.message) || String(e) });
      if (e && e.fatal) { console.error("\nFATAL: " + e.message); }
    }
    done++;
    if (done % 50 === 0 || done === files.length) {
      process.stdout.write("  " + done + "/" + files.length + "  uploaded=" + uploaded + " skipped=" + skipped + " failed=" + failed + "\r");
    }
  });
  process.stdout.write("\n");

  console.log("\nfiles=" + files.length + "  uploaded=" + uploaded + "  skipped(existing)=" + skipped + "  failed=" + failed);
  if (failures.length) {
    console.log("\n⚠ " + failures.length + " FAILED (re-run is resumable; --skip-existing skips done):");
    for (const f of failures.slice(0, 10)) console.log("   " + f.id + "  " + f.error);
    if (failures.length > 10) console.log("   …and " + (failures.length - 10) + " more.");
    process.exit(1);
  }
  console.log("\n✓ push complete." + (args.dryRun ? " (dry run — nothing uploaded)" : " Prod volume now serves these at /data/benyehuda/works/<id>.json."));
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
