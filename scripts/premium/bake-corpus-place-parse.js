#!/usr/bin/env node
"use strict";
// bake-corpus-place-parse.js — Ф4 · Д8-К4 v2: Dicta's raw facts for every sentence of the PUBLIC corpora, one file per
// work, baked on the owner's computer (never from the production server's IP — O-090).
// Plan: docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md (К4.1, К4.2).
//
// Sources (the files a learner downloads): Ben-Yehuda works of the current catalog (/data/benyehuda/…) and public-corpus
// snapshots (/api/public-corpora/<slug>/works/<id>?snapshot=). Personal and group texts are never read.
// Facts: db/premium/providers/dictaMorph.js (the server's own provider, model dicta-morph-v2, genre modern).
// Reuse: the earlier bake's cache (.tmp/benyehuda/proclitic-overlay-dicta-cache.json, read only; tokens WITH niqqud) and
// this bake's cache (.tmp/d8k4/place-cache.json). A row a snapshot already carries a parse for is taken from it.
// Owner's device (decision 2026-10-17): .tmp/d8k4/owner-parse.json — the stored Dicta parse of the owner's own copies of
// the public texts, exported read-only and matched by sha256(hebrew_plain.trim()) (the same facts of the same provider).
// Politeness: ≤ 2 requests at once, ≥ 300 ms between requests; HTTP 503/429 → pause 2 min, doubling to 15 min, the first
// request after a pause is a probe; 3 failed probes in a row → stop (the ledger keeps the place). Other errors: 3 tries
// with backoff, then the row stays unparsed (--retry-missing tries those again).
// Output: .tmp/d8k4/out/by/<id>-<bundle16>.json.gz, .tmp/d8k4/out/pc/<snapshot>.json.gz (format К4.2), ledger
// .tmp/d8k4/ledger.json, run report on stdout.
//
//   node scripts/premium/bake-corpus-place-parse.js --works=by:101,pc:study-songs/work-…  [--retry-missing]
//   node scripts/premium/bake-corpus-place-parse.js --all-by | --all-pc   [--limit=N] [--dry-run]
//   node scripts/premium/bake-corpus-place-parse.js --works-file=<list, one ref per line>
//   node scripts/premium/bake-corpus-place-parse.js --status

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..", "..");
const MAIN_REPO = process.env.D8K4_MAIN_REPO || (REPO.includes(path.sep + ".worktrees" + path.sep) ? path.resolve(REPO, "..", "..") : REPO);
const PROD = process.env.D8K4_PROD || "https://linguistpro.kolosei.com";
const TMP = path.join(REPO, ".tmp", "d8k4");
const OLD_CACHE = path.join(MAIN_REPO, ".tmp", "benyehuda", "proclitic-overlay-dicta-cache.json");
const CACHE = path.join(TMP, "place-cache.json");
const OWNER = path.join(TMP, "owner-parse.json");
const LEDGER = path.join(TMP, "ledger.json");
const LOCK = path.join(TMP, "bake.lock");
const OUT = path.join(TMP, "out");
const dictaMorph = require(path.join(REPO, "db", "premium", "providers", "dictaMorph.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const LIMIT = Number(opt("limit", 0)) || 0, GAP = 300, MAX_PAUSE = 15 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const HEB = /[א-ת]/;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function atomicWrite(file, data) { const t = file + ".tmp-" + process.pid; fs.writeFileSync(t, data); fs.renameSync(t, file); }
function readJson(file, d) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return d; } }
function lock() {
  const cur = readJson(LOCK, null);
  if (cur && cur.pid !== process.pid && Date.now() - cur.ts < 10 * 60 * 1000) throw new Error("another bake holds " + LOCK + " (pid " + cur.pid + ")");
  fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, ts: Date.now() }));
}
function heartbeat() { try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, ts: Date.now() })); } catch (_) {} }   // a long run keeps its lock fresh
function unlock() { const cur = readJson(LOCK, null); if (cur && cur.pid === process.pid) try { fs.unlinkSync(LOCK); } catch (_) {} }

// ── sources ────────────────────────────────────────────────────────────────
async function getText(url, file) {
  const p = path.join(TMP, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url);
    if (r.ok) { const t = await r.text(); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); return t; }
    if (r.status === 404) return null;
    await sleep(1500 * (i + 1));
  }
  return null;
}
async function byCatalog() {
  const root = JSON.parse(await getText(PROD + "/data/benyehuda/corpus-catalog-v8.json", "corpus-catalog-v8.json"));
  return (JSON.parse(await getText(PROD + "/data/benyehuda/" + root.index_file, root.index_file)).ready || []);
}
async function loadWork(ref, byIndex) {
  const [kind, rest] = [ref.slice(0, 2), ref.slice(3)];
  if (kind === "by") {
    const w = byIndex.get(rest); if (!w) throw new Error("not in catalog: " + ref);
    const txt = await getText(PROD + "/data/benyehuda/" + w.file, "by/" + w.file.replace(/^works\//, ""));
    const rows = (((JSON.parse(txt).library || {}).texts || [])[0] || {}).rows || [];
    const edition = w.bundle_sha256 || sha(txt);
    return { ref, kind, id: w.id, edition, era: w.era, rows, shipped: new Map(), out: path.join(OUT, "by", w.id + "-" + edition.slice(0, 16) + ".json.gz") };
  }
  const [slug, wid] = rest.split("/");
  const cat = JSON.parse(await getText(PROD + "/api/public-corpora/" + encodeURIComponent(slug), "pc/" + slug + ".json"));
  const it = (cat.items || []).find((x) => x.public_work_id === wid); if (!it) throw new Error("not in corpus: " + ref);
  const txt = await getText(PROD + "/api/public-corpora/" + encodeURIComponent(slug) + "/works/" + encodeURIComponent(wid) + "?snapshot=" + it.snapshot_sha256,
    "pc/" + slug + "/" + wid + "-" + it.snapshot_sha256.slice(0, 12) + ".json");
  const snap = (JSON.parse(txt).item || {}).snapshot || {};
  const rows = (((snap.library || {}).texts || [])[0] || {}).rows || [];
  const shipped = new Map(((snap.notes_advanced || {}).sentence_morph || []).filter((m) => m && Array.isArray(m.tokens) && m.tokens.length).map((m) => [String(m.sentence_id), m.tokens]));
  return { ref, kind, id: slug + "/" + wid, edition: it.snapshot_sha256, rows, shipped, out: path.join(OUT, "pc", it.snapshot_sha256 + ".json.gz") };
}

// ── facts ──────────────────────────────────────────────────────────────────
// the stored-row shape (the same as /api/morphology/batch → sentence_morph)
const fromOld = (t) => ({ word: t.word, prefix: t.pre || "", stem: t.stem || "", lemma: t.lem || "", lemmas: t.lems || [], niqqud: t.nq || "", posDicta: t.pos || "", binyan: t.bin || null });
const fromProvider = (t) => ({ word: t.word, prefix: t.prefix || "", stem: t.stem || "", lemma: t.lemma || "", lemmas: t.lemmas || [], niqqud: t.niqqud || "", posDicta: t.posDicta || "", binyan: t.binyan || null });
const unpack = (a) => ({ word: a[0], lemma: a[1], lemmas: [a[1]].concat(a[2] || []).filter(Boolean), posDicta: a[3], niqqud: a[4], binyan: a[5] || null, prefix: a[6] || "", stem: "" });
const pack = (t) => [t.word, t.lemma || "", (t.lemmas || []).filter((x) => x !== t.lemma), t.posDicta || "", t.niqqud || "", t.binyan || "", t.prefix || ""];

const breaker = { pauseMs: 0, until: 0, failedProbes: 0, stopped: false, refusals: 0 };
let lastStart = 0, inFlight = 0;
async function ask(sentence) {
  for (let attempt = 0; attempt < 3; attempt++) {
    while (breaker.until > Date.now()) await sleep(Math.min(5000, breaker.until - Date.now()));
    if (breaker.stopped) return null;
    while (inFlight >= 2 || Date.now() - lastStart < GAP) await sleep(50);
    inFlight++; lastStart = Date.now();
    try {
      const r = await dictaMorph.analyzeSentence(sentence, "modern");
      breaker.pauseMs = 0; breaker.failedProbes = 0;
      if (r && r.ok && Array.isArray(r.tokens) && (r.tokens.length || !HEB.test(sentence))) return r.tokens.map(fromProvider);
    } catch (e) {
      if (e && (e.status === 503 || e.status === 429)) {
        breaker.refusals++;
        const probe = breaker.pauseMs > 0;
        if (probe && ++breaker.failedProbes >= 3) { breaker.stopped = true; log("✋ Dicta refused 3 probes in a row — stopping; rerun later continues from the ledger"); return null; }
        breaker.pauseMs = breaker.pauseMs ? Math.min(MAX_PAUSE, breaker.pauseMs * 2) : 2 * 60 * 1000;
        breaker.until = Date.now() + breaker.pauseMs;
        log("⏸ Dicta HTTP " + e.status + " — pause " + Math.round(breaker.pauseMs / 1000) + " s");
        attempt--; continue;                       // a refusal is not one of the row's tries
      }
    } finally { inFlight--; }
    await sleep(800 * Math.pow(2, attempt));
  }
  return null;
}

async function bakeWork(w, caches, stats) {
  const rows = [], todo = [];
  let missing = 0, fromCache = 0, fromSnapshot = 0, fromOwner = 0, fetched = 0;
  for (const r of w.rows) {
    const plain = String(r.hebrew_plain || "").trim();
    if (!plain || !HEB.test(plain)) continue;
    const entry = { hash: sha(plain).slice(0, 16), order: r.order_index, plain, toks: null };
    const sh = w.shipped.get(String(r.row_id));
    if (sh) { entry.toks = sh.map(fromProvider); fromSnapshot++; }
    else if (caches.place[plain]) { entry.toks = caches.place[plain]; fromCache++; }
    else if (caches.owner[entry.hash]) { entry.toks = caches.owner[entry.hash].map(unpack); fromOwner++; }
    else if (caches.old[plain] && caches.old[plain].every((t) => t.nq !== undefined)) { entry.toks = caches.old[plain].map(fromOld); fromCache++; }
    else todo.push(entry);
    rows.push(entry);
  }
  if (has("dry-run")) { stats.toFetch += todo.length; return { rows: rows.length, toFetch: todo.length, fromCache, fromSnapshot, fromOwner }; }
  let dirty = 0;
  await Promise.all([0, 1].map(async (lane) => {
    for (let i = lane; i < todo.length; i += 2) {
      if (breaker.stopped) return;
      const toks = await ask(todo[i].plain);
      if (toks) { todo[i].toks = toks; caches.place[todo[i].plain] = toks; fetched++; if (++dirty >= 25) { atomicWrite(CACHE, JSON.stringify(caches.place)); heartbeat(); dirty = 0; } }
    }
  }));
  atomicWrite(CACHE, JSON.stringify(caches.place));
  const packed = rows.filter((e) => e.toks && e.toks.length).map((e) => [e.hash, e.order, e.toks.map(pack)]);
  missing = rows.length - packed.length;
  const file = { v: 1, model: dictaMorph.MODEL_VERSION, src: { kind: w.kind, id: w.id, edition: w.edition }, rows: packed, missing };
  fs.mkdirSync(path.dirname(w.out), { recursive: true });
  atomicWrite(w.out, zlib.gzipSync(Buffer.from(JSON.stringify(file), "utf8"), { level: 9 }));
  stats.fetched += fetched;
  return { rows: rows.length, parsed: packed.length, missing, fromCache, fromSnapshot, fromOwner, fetched, bytes: fs.statSync(w.out).size, file: path.relative(REPO, w.out) };
}

async function main() {
  const ledger = readJson(LEDGER, { works: {} });
  if (has("status")) {
    const v = Object.values(ledger.works);
    console.log({ works: v.length, done: v.filter((x) => x.status === "done").length, partial: v.filter((x) => x.status === "partial").length,
      missingRows: v.reduce((a, x) => a + (x.missing || 0), 0) });
    return;
  }
  lock();
  try {
    const cat = await byCatalog();
    const byIndex = new Map(cat.map((w) => [String(w.id), w]));
    let refs = (opt("works", "") || "").split(",").filter(Boolean);
    if (opt("works-file", "")) refs = refs.concat(fs.readFileSync(opt("works-file", ""), "utf8").split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean));
    if (has("all-by")) refs = refs.concat(cat.map((w) => "by:" + w.id));
    if (has("all-pc")) {
      const corp = JSON.parse(await getText(PROD + "/api/public-corpora", "public-corpora.json")).corpora || [];
      for (const c of corp) {
        const x = JSON.parse(await getText(PROD + "/api/public-corpora/" + encodeURIComponent(c.slug), "pc/" + c.slug + ".json"));
        (x.items || []).forEach((it) => refs.push("pc:" + c.slug + "/" + it.public_work_id));
      }
    }
    if (has("retry-missing")) refs = refs.length ? refs : Object.keys(ledger.works).filter((k) => ledger.works[k].missing > 0);
    else refs = refs.filter((r) => !(ledger.works[r] && ledger.works[r].status === "done"));
    if (LIMIT) refs = refs.slice(0, LIMIT);
    const caches = { old: readJson(OLD_CACHE, {}), place: readJson(CACHE, {}), owner: (readJson(OWNER, {}) || {}).rows || {} };
    log("works " + refs.length + " · old cache " + Object.keys(caches.old).length + " · place cache " + Object.keys(caches.place).length + " · owner " + Object.keys(caches.owner).length);
    const stats = { fetched: 0, toFetch: 0 }, t0 = Date.now();
    for (const ref of refs) {
      if (breaker.stopped) break;
      let w; try { w = await loadWork(ref, byIndex); } catch (e) { ledger.works[ref] = { status: "failed", reason: e.message, at: new Date().toISOString() }; log("✗ " + ref + " " + e.message); continue; }
      const r = await bakeWork(w, caches, stats);
      log((r.missing ? "◐ " : "✓ ") + ref + " " + JSON.stringify(r));
      if (!has("dry-run")) {
        ledger.works[ref] = Object.assign({ status: r.missing ? "partial" : "done", at: new Date().toISOString(), edition: w.edition }, r);
        atomicWrite(LEDGER, JSON.stringify(ledger, null, 1));
      }
    }
    log("run: fetched " + stats.fetched + (has("dry-run") ? " · to fetch " + stats.toFetch : "") + " · refusals " + breaker.refusals +
      (breaker.stopped ? " · STOPPED by Dicta" : "") + " · " + Math.round((Date.now() - t0) / 1000) + " s");
  } finally { unlock(); }
}
main().catch((e) => { console.error(e); unlock(); process.exit(1); });
