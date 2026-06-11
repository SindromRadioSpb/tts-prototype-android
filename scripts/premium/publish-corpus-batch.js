#!/usr/bin/env node
"use strict";

// publish-corpus-batch.js — BRR-P1-015 (skill `publish-corpus-batch`). Automates the
// DETERMINISTIC, reversible, non-secret part of publishing a batch of newly-baked Ben-Yehuda
// corpus works to prod: snapshot+validate the bake shards → build v2 → compute the next catalog
// version → build v(N+1) (root/index/search/manifests) → (under --apply) bump the 3 version sites
// in library-ui.js + sw.js → structural self-check → gates → PRINT the remaining MANUAL commands.
//
// It NEVER does the outward-facing / secret / git steps — those stay manual (owner judgment):
// the bodies push (needs AUDIO_UPLOAD_TOKEN), the allowlisted git add, the commit/push (deploy),
// the prod-verify decision, the bake resume. It NEVER touches public/index.html. It never reads,
// prints, or logs the upload token (prints `<secret>` placeholders only).
//
//   node scripts/premium/publish-corpus-batch.js                # --dry-run (DEFAULT: writes nothing)
//   node scripts/premium/publish-corpus-batch.js --apply        # build into public/data + bump versions
//   node scripts/premium/publish-corpus-batch.js --verify-only  # read-only prod probes (post-deploy)
//
// Why a version bump is mandatory: the lazy catalog files (sidecar/search/manifests/works) are
// fetched with ?v=<CORPUS_CATALOG_VERSION> and served immutable — without bumping the version a
// re-publish is invisible to existing PWA users. The SW CACHE_VERSION bump refreshes the precached
// thin root + library-ui.js in lockstep.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const JSZip = require(path.join(REPO, "public", "db", "jszip.min.js"));

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const APPLY = flag("apply");
const DRY = !APPLY;                       // default: dry-run (writes nothing)
const VERIFY_ONLY = flag("verify-only");
const NO_GATES = flag("no-gates");
const NO_SNAPSHOT = flag("no-snapshot");
const SHARD_DIR = path.resolve(arg("shard-dir", path.join(REPO, ".tmp", "benyehuda", "shards")));
const BASE = String(arg("base", "https://linguistpro.kolosei.com")).replace(/\/+$/, "");
const DATA_DIR = path.join(REPO, "public", "data", "benyehuda");
const LIB_UI = path.join(REPO, "public", "js", "library-ui.js");
const SW = path.join(REPO, "public", "sw.js");
const ERA_MAP = path.join(DATA_DIR, "author-era-map-v1.json");
const NODE = process.execPath;

function die(msg, code) { console.error("\n[publish] ABORT — " + msg); process.exit(code || 1); }
function run(args, opts) { return spawnSync(NODE, args, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26, ...(opts || {}) }); }
function npm(script) { return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 }); }

// ── 1. snapshot + validate shards (mid-flush-safe; the bake may run concurrently) ──────────
async function snapshotShards() {
  if (NO_SNAPSHOT) { console.log("[publish] --no-snapshot → using live shard dir (ensure the bake is PAUSED): " + SHARD_DIR); return SHARD_DIR; }
  if (!fs.existsSync(SHARD_DIR)) die("shard dir not found: " + SHARD_DIR, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snap = path.resolve(arg("snapshot-dir", path.join(REPO, ".tmp", "benyehuda", "shards-snapshot-" + stamp)));
  fs.mkdirSync(snap, { recursive: true });
  const zips = fs.readdirSync(SHARD_DIR).filter((f) => /\.zip$/.test(f));
  if (!zips.length) die("no shard zips in " + SHARD_DIR + " (run a bake first)", 2);
  let bytes = 0;
  for (const f of zips) { fs.copyFileSync(path.join(SHARD_DIR, f), path.join(snap, f)); bytes += fs.statSync(path.join(snap, f)).size; }
  // validate EVERY copied zip (a truncated mid-flush zip → missing works; never ship a partial batch as complete — R1)
  let texts = 0;
  for (const f of zips) {
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(snap, f)));
      const e = zip.files["library/library.json"] || zip.files["library.json"];
      if (!e) throw new Error("no library.json");
      const lib = JSON.parse(await e.async("string"));
      if (!Array.isArray(lib.texts) || !lib.texts.length) throw new Error("empty/invalid texts[]");
      texts += lib.texts.length;
    } catch (err) {
      die("shard failed validation: " + f + " (" + err.message + "). The bake may have been mid-flush — pause it (or wait for the next flush) and re-run.", 3);
    }
  }
  console.log("[publish] snapshot OK: " + zips.length + " shards · " + texts + " texts · " + (bytes / 1024 / 1024).toFixed(1) + "MB → " + path.relative(REPO, snap));
  return snap;
}

// ── 2/4. invoke the existing producer (keeps its R1 abort/exit-code contract) ───────────────
function buildV2(snap, outDir) {
  console.log("[publish] build v2 (shards → catalog + works)…");
  const r = run([path.join("scripts", "premium", "build-corpus-catalog.js"), "--shard-dir", snap, "--out-dir", outDir]);
  process.stdout.write(r.stdout || ""); if (r.status !== 0) { process.stderr.write(r.stderr || ""); die("build-corpus-catalog (v2) exited " + r.status, r.status || 1); }
  const m = (r.stdout || "").match(/works\s+(\d+)\s+·\s+texts\s+\d+.*R1 clean/);
  return { baked: m ? Number(m[1]) : null };
}
function buildVNext(next, outDir, bakedFrom, eraMap) {
  console.log("[publish] build v" + next + " (--full --catalog-version " + next + ")…");
  const r = run([path.join("scripts", "premium", "build-corpus-catalog.js"), "--full", "--catalog-version", String(next),
    "--out-dir", outDir, "--baked-from", bakedFrom, "--era-map", eraMap]);
  process.stdout.write(r.stdout || ""); if (r.status !== 0) { process.stderr.write(r.stderr || ""); die("build-corpus-catalog (--full v" + next + ") exited " + r.status, r.status || 1); }
  const m = (r.stdout || "").match(/baked\s+(\d+)/);
  return { baked: m ? Number(m[1]) : null };
}

// ── 3. version source-of-truth (same constant the version-agnostic smokes read) ─────────────
function readCorpusVersion() {
  const src = fs.readFileSync(LIB_UI, "utf8");
  const all = src.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/g) || [];
  if (all.length !== 1) die("expected exactly 1 CORPUS_CATALOG_VERSION in library-ui.js, found " + all.length, 1);
  return Number(all[0].match(/(\d+)/)[1]);
}
// ── 5. proposed CACHE_VERSION — bump patch, version-scoped suffix (no collision with feature suffixes) ──
function computeCacheVersion(next) {
  const override = arg("cache-version", null); if (override) return override;
  const src = fs.readFileSync(SW, "utf8");
  const m = src.match(/\bconst CACHE_VERSION\s*=\s*"([^"]+)"/); // \bconst → not GRAPH_CACHE_VERSION
  if (!m) die("CACHE_VERSION not found in sw.js", 1);
  const cur = m[1]; const v = cur.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!v) die("CACHE_VERSION not vMAJOR.MINOR.PATCH: " + cur, 1);
  return "v" + v[1] + "." + v[2] + "." + (Number(v[3]) + 1) + "-corpus-v" + next;
}

// ── 6. the 3 anchored, asserted-unique edits (only --apply) ─────────────────────────────────
function applyVersionBumps(base, next, cacheVer) {
  console.log((DRY ? "[publish] proposed version bumps (dry-run — not written):" : "[publish] applying version bumps:"));
  // library-ui.js CORPUS_CATALOG_VERSION = base → next
  bumpField(LIB_UI, new RegExp("(CORPUS_CATALOG_VERSION\\s*=\\s*)" + base + "\\b"), "$1" + next, "CORPUS_CATALOG_VERSION", base, next);
  // sw.js CACHE_VERSION (anchor on `const ` so it can't also match GRAPH_CACHE_VERSION)
  bumpField(SW, /(const CACHE_VERSION\s*=\s*")([^"]+)(")/, "$1" + cacheVer + "$3", "CACHE_VERSION", null, cacheVer);
  // sw.js precache root literal corpus-catalog-v<base>.json → v<next>
  bumpField(SW, new RegExp('("/data/benyehuda/corpus-catalog-v)' + base + '(\\.json")'), "$1" + next + "$2", "precache root", base, next);
}
function bumpField(file, re, repl, label, from, to) {
  const src = fs.readFileSync(file, "utf8");
  const hits = src.match(new RegExp(re.source, "g")) || [];
  if (hits.length !== 1) die("anchor '" + label + "' matched " + hits.length + " (expected 1) in " + path.basename(file) + " — bump manually", 1);
  const before = hits[0].trim();
  const out = src.replace(re, repl);
  const after = (out.match(new RegExp(re.source, "g")) || [])[0];
  console.log("   " + (DRY ? "[dry] " : "") + label + ": " + before + "  →  " + (after ? after.trim() : ("v" + to)));
  if (!DRY) fs.writeFileSync(file, out);
}

// ── 7. structural self-check on the freshly built v(next) (smoke:full-catalog is v3-pinned) ──
function selfCheck(outDir, next, expectBaked) {
  const rootP = path.join(outDir, "corpus-catalog-v" + next + ".json");
  if (!fs.existsSync(rootP)) die("self-check: " + rootP + " missing", 1);
  const root = JSON.parse(fs.readFileSync(rootP, "utf8"));
  const ok = [];
  ok.push(["version===" + next, root.version === next]);
  if (expectBaked != null) ok.push(["counts.baked===" + expectBaked, root.counts && root.counts.baked === expectBaked]);
  ok.push(["pointers.ready===counts.baked", root.pointers && root.counts && root.pointers.ready.length === root.counts.baked]);
  ok.push(["index_file present", typeof root.index_file === "string"]);
  ok.push(["search_file present", typeof root.search_file === "string"]);
  ok.push(["sidecar exists", fs.existsSync(path.join(outDir, root.index_file || ""))]);
  ok.push(["search exists", fs.existsSync(path.join(outDir, root.search_file || ""))]);
  ok.push(["all manifests on disk", (root.manifests || []).every((m) => fs.existsSync(path.join(outDir, m.file)))]);
  if (APPLY) { // anti-drift: sw precache literal must match the client version after the bump
    const sw = fs.readFileSync(SW, "utf8"), lui = fs.readFileSync(LIB_UI, "utf8");
    const cv = Number((lui.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1]);
    ok.push(["sw precache matches client v" + cv, new RegExp('corpus-catalog-v' + cv + '\\.json').test(sw)]);
  }
  console.log("[publish] self-check (v" + next + "):");
  let bad = 0; for (const [name, pass] of ok) { console.log("   " + (pass ? "✓" : "✗") + " " + name); if (!pass) bad++; }
  if (bad) die("self-check failed (" + bad + ") — do NOT publish", 1);
}

// ── 8. gates ────────────────────────────────────────────────────────────────────────────────
function runGates() {
  if (NO_GATES) { console.log("[publish] --no-gates → skipping (run manually: npm run smoke:full-catalog && smoke:corpus-room && smoke:corpus-nav && probe:niqqud)"); return; }
  console.log("[publish] gates (room/nav read the LIVE CORPUS_CATALOG_VERSION; full-catalog is v3-PINNED — self-check covers v" + "N):");
  for (const s of ["smoke:full-catalog", "smoke:corpus-room", "smoke:corpus-nav", "probe:niqqud"]) {
    let r = npm(s);
    // Retry once: these gates run producers/Playwright that can transiently fail when the
    // bake is concurrently mid-flush (a shard being written). A clean retry resolves it; a
    // genuine failure fails twice.
    if (r.status !== 0) { console.log("   ↻ " + s + " failed — retry once (transient? concurrent bake may have been mid-flush)…"); r = npm(s); }
    const pass = r.status === 0;
    console.log("   " + (pass ? "✓" : "✗") + " npm run " + s);
    if (!pass) { process.stdout.write((r.stdout || "").split("\n").slice(-6).join("\n") + "\n"); die("gate failed (after retry): " + s, 1); }
  }
}

// ── verify-only: read-only prod probes ───────────────────────────────────────────────────────
async function verifyOnly() {
  const cv = readCorpusVersion();
  console.log("[publish] --verify-only against " + BASE + " (live client version = v" + cv + ")");
  let ok = true;
  // SW CACHE_VERSION
  const sw = await fetch(BASE + "/sw.js?cb=" + Date.now()).then((r) => r.text()).catch(() => "");
  const swv = (sw.match(/CACHE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  console.log("   sw CACHE_VERSION: " + (swv || "?"));
  // catalog root baked count
  const root = await fetch(BASE + "/data/benyehuda/corpus-catalog-v" + cv + ".json?cb=" + Date.now()).then((r) => r.ok ? r.json() : null).catch(() => null);
  const baked = root && root.counts && root.counts.baked;
  console.log("   corpus-catalog-v" + cv + ".json: " + (root ? "OK baked=" + baked : "FAIL")); if (!root) ok = false;
  // a sample ready body
  const sampleId = root && root.pointers && root.pointers.ready[root.pointers.ready.length - 1];
  if (sampleId) { const c = await fetch(BASE + "/data/benyehuda/works/" + sampleId + ".json", { method: "HEAD" }).then((r) => r.status).catch(() => 0); console.log("   works/" + sampleId + ".json (sample ready body): " + c); if (c !== 200) ok = false; }
  console.log(ok ? "[publish] verify-only: PROD OK ✓" : "[publish] verify-only: ✗ a probe FAILED");
  process.exit(ok ? 0 : 1);
}

function printManualBlock(next, baked) {
  const tag = "\n========================  REMAINING MANUAL STEPS (the script does NOT do these)  ========================";
  console.log(tag);
  console.log("# 1) PUSH BODIES FIRST (volume — never mark cards ready before the body is on prod / R1):");
  console.log("    $env:AUDIO_UPLOAD_TOKEN='<secret>'; node scripts/premium/push-corpus-works.js --skip-existing");
  console.log("# 2) GIT ADD — ALLOWLIST ONLY (never `git add -A`, never works/, never index.html):");
  console.log("    git add public/data/benyehuda/corpus-catalog-v2.json \\");
  console.log("            public/data/benyehuda/corpus-catalog-v" + next + ".json \\");
  console.log("            public/data/benyehuda/corpus-index-v" + next + ".json \\");
  console.log("            public/data/benyehuda/corpus-search-v" + next + ".json \\");
  console.log("            public/data/benyehuda/catalog/era-*-v" + next + ".json \\");
  console.log("            public/js/library-ui.js public/sw.js");
  console.log("    git status --short    # MUST show only the above. If any works/*.json → git restore --staged public/data/benyehuda/works/");
  console.log("# 3) COMMIT + PUSH (gates green first; push → Coolify deploy):");
  console.log("    git commit -m \"feat(corpus): publish batch — " + (baked != null ? baked : "<baked>") + " ready (catalog v" + next + ")\" && git push");
  console.log("# 4) PROD-VERIFY (after deploy settles):");
  console.log("    node scripts/premium/publish-corpus-batch.js --verify-only --base " + BASE);
  console.log("# 5) RESUME the bake only if you PAUSED it (the snapshot path needs no resume).");
  console.log("=========================================================================================================\n");
}

async function main() {
  if (VERIFY_ONLY) return verifyOnly();
  console.log("=== BRR-P1-015 publish-corpus-batch · " + (APPLY ? "APPLY (writes artifacts + version bumps)" : "DRY-RUN (writes nothing)") + " ===");
  const snap = await snapshotShards();
  const base = readCorpusVersion();
  const next = Number(arg("catalog-version", base + 1)) || base + 1;
  if (next <= base) die("next version (" + next + ") must be > current (" + base + ")", 1);
  const outDir = APPLY ? DATA_DIR : (() => { const d = path.join(REPO, ".tmp", "benyehuda", "publish-out-v" + next); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(ERA_MAP, path.join(d, "author-era-map-v1.json")); return d; })();
  const eraMapForRun = APPLY ? ERA_MAP : path.join(outDir, "author-era-map-v1.json");

  const v2 = buildV2(snap, outDir);
  const bakedFrom = path.join(outDir, "corpus-catalog-v2.json");
  // buildVNext reads era-map from outDir in dry-run (copied there), real DATA_DIR in apply.
  const vn = buildVNext(next, outDir, bakedFrom, eraMapForRun);

  const cacheVer = computeCacheVersion(next);
  console.log("\n[publish] version: live v" + base + " → publish v" + next + " · proposed CACHE_VERSION = " + cacheVer);
  applyVersionBumps(base, next, cacheVer);
  selfCheck(outDir, next, vn.baked);
  runGates();

  console.log("\n[publish] " + (APPLY ? "APPLIED" : "DRY-RUN complete (nothing written)") + " · v" + next + " · baked " + vn.baked + " · CACHE_VERSION " + cacheVer);
  if (!APPLY) console.log("[publish] re-run with --apply to write the artifacts + version bumps, then:");
  printManualBlock(next, vn.baked);
}
main().catch((e) => { console.error("[publish] fatal", e); process.exit(1); });
