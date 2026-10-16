#!/usr/bin/env node
"use strict";
// push-corpus-place-parse.js — Ф4 · Д8-К4 v2: upload the baked per-work Dicta facts (bake-corpus-place-parse.js) onto
// PROD's volume without a deploy. Plan: docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md (К4.2).
//
// Ben-Yehuda: named by the edition's text_key (what the device knows of its copy) → /data/corpus-parse/by/<text_key>.json.
// Mediatheque: named by the snapshot → served by /api/public-corpora/<slug>/works/<id>/parse?snapshot= (read right checked).
// Only works the ledger marks done or partial; a work whose stratum did not pass the blind examiner is not pushed
// (--exclude-era). Each file is re-validated before upload (v1, edition = name).
//
//   AUDIO_UPLOAD_TOKEN=… node scripts/premium/push-corpus-place-parse.js [--base https://linguistpro.kolosei.com]
//        [--only=by|pc] [--exclude-era=haskalah,tehiya] [--skip-existing] [--limit=N] [--dry-run]
//
// ⚠ OUTWARD-FACING: publishes to the live server.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp", "d8k4");
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const BASE = opt("base", "https://linguistpro.kolosei.com");
const TOKEN = process.env.AUDIO_UPLOAD_TOKEN || "";
const ONLY = opt("only", ""), EXCLUDE = new Set(opt("exclude-era", "").split(",").filter(Boolean)), LIMIT = Number(opt("limit", 0)) || 0;

async function main() {
  if (!TOKEN && !has("dry-run")) throw new Error("AUDIO_UPLOAD_TOKEN is not set");
  const ledger = JSON.parse(fs.readFileSync(path.join(TMP, "ledger.json"), "utf8")).works;
  const index = JSON.parse(fs.readFileSync(path.join(TMP, "corpus-index-v8.json"), "utf8")).ready;
  const byId = new Map(index.map((w) => [String(w.id), w]));
  const jobs = [];
  for (const ref of Object.keys(ledger)) {
    const L = ledger[ref];
    if (!L.file || !(L.status === "done" || L.status === "partial")) continue;
    if (ref.startsWith("by:")) {
      if (ONLY && ONLY !== "by") continue;
      const w = byId.get(ref.slice(3)); if (!w) continue;
      if (EXCLUDE.has(w.era)) continue;
      jobs.push({ ref, kind: "by", name: String(w.text_key).toLowerCase(), file: path.join(REPO, L.file), check: `${BASE}/data/corpus-parse/by/${w.text_key}.json` });
    } else {
      if (ONLY && ONLY !== "pc") continue;
      jobs.push({ ref, kind: "pc", name: String(L.edition).toLowerCase(), file: path.join(REPO, L.file), check: null });
    }
  }
  const list = LIMIT ? jobs.slice(0, LIMIT) : jobs;
  console.log("[push] " + list.length + " files" + (has("dry-run") ? " (dry run)" : ""));
  const stats = { ok: 0, skipped: 0, failed: [], bytes: 0 };
  for (const j of list) {
    const gz = fs.readFileSync(j.file);
    const f = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
    // the file's edition is how the bake named it; the server checks src.edition = name, so restate it under the name
    // the device knows (Ben-Yehuda: text_key)
    f.src.edition = j.name;
    const body = zlib.gzipSync(Buffer.from(JSON.stringify(f), "utf8"), { level: 9 });
    if (has("dry-run")) { stats.ok++; stats.bytes += body.length; continue; }
    if (has("skip-existing") && j.check) {
      try { const h = await fetch(j.check, { method: "HEAD" }); if (h.ok) { stats.skipped++; continue; } } catch (_) {}
    }
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const r = await fetch(BASE + "/api/corpus-parse/upload", { method: "POST", headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": TOKEN },
          body: JSON.stringify({ kind: j.kind, name: j.name, gz_b64: body.toString("base64") }) });
        const out = await r.json().catch(() => ({}));
        if (r.ok && out.ok) { done = true; stats.ok++; stats.bytes += body.length; }
        else if (r.status === 400) { stats.failed.push({ ref: j.ref, error: out.error || r.status }); break; }
      } catch (_) {}
      if (!done) await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
    if (!done && !stats.failed.find((x) => x.ref === j.ref)) stats.failed.push({ ref: j.ref, error: "unreachable" });
  }
  console.log(JSON.stringify(stats, null, 1));
  if (stats.failed.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
