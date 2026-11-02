#!/usr/bin/env node
"use strict";
// Atlas P4 W2 — Dicta's raw facts for every Hebrew block of the engineering atlas, baked once on the owner's computer
// (never from the production server's IP — O-090), one file per section next to the section on the data volume:
//   <data>/atlas/a97002/parse/<section>.json  { v:1, model, atlas, section, content_pack_sha256, rows:[[blockId, hash16, tokens]] }
// A token is packed as in the corpus bake (scripts/premium/bake-corpus-place-parse.js): [word, lemma, lemmas, pos,
// niqqud, binyan, prefix]. A row binds by its block id AND sha256(he.trim()) — a corrected text gets no old facts.
// Politeness (O-090, feedback_bulk_dicta_bake_ratelimit): ≤ 2 requests at once, ≥ 300 ms apart; HTTP 503/429 → pause
// 2 min doubling to 15 min; 3 failed probes in a row or 6 refusals in 30 min → stop (the cache keeps every answer,
// a rerun continues). Facts: db/premium/providers/dictaMorph.js (the server's own provider, dicta-morph-v2, modern).
//   node scripts/atlas/bake-atlas-parse.cjs [--data=data/atlas/a97002] [--sections=s02-rivets,…] [--dry-run]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const DATA = path.resolve(REPO, opt("data", "data/atlas/a97002"));
const TMP = path.join(REPO, ".tmp", "atlas-parse");
const CACHE = path.join(TMP, "cache.json");
const GAP = 300, MAX_PAUSE = 15 * 60 * 1000;
const HEB = /[א-ת]/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function atomicWrite(file, data) { const t = file + ".tmp-" + process.pid; fs.writeFileSync(t, data); fs.renameSync(t, file); }
function readJson(file, d) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return d; } }

const fromProvider = (t) => ({ word: t.word, prefix: t.prefix || "", lemma: t.lemma || "", lemmas: t.lemmas || [], niqqud: t.niqqud || "", posDicta: t.posDicta || "", binyan: t.binyan || null });
const pack = (t) => [t.word, t.lemma || "", (t.lemmas || []).filter((x) => x !== t.lemma), t.posDicta || "", t.niqqud || "", t.binyan || "", t.prefix || ""];

const breaker = { pauseMs: 0, until: 0, failedProbes: 0, stopped: false, refusals: 0, okRun: 0, recent: [] };
let lastStart = 0, inFlight = 0, dicta = null;
async function ask(sentence) {
  for (let attempt = 0; attempt < 3; attempt++) {
    while (breaker.until > Date.now()) await sleep(Math.min(5000, breaker.until - Date.now()));
    if (breaker.stopped) return null;
    while (inFlight >= 2 || Date.now() - lastStart < GAP) await sleep(50);
    inFlight++; lastStart = Date.now();
    try {
      const r = await dicta.analyzeSentence(sentence, "modern");
      breaker.failedProbes = 0;
      if (++breaker.okRun >= 20) breaker.pauseMs = 0;
      if (r && r.ok && Array.isArray(r.tokens) && r.tokens.length) return r.tokens.map(fromProvider);
    } catch (e) {
      if (e && (e.status === 503 || e.status === 429)) {
        breaker.refusals++; breaker.okRun = 0;
        if (breaker.until > Date.now()) { attempt--; continue; }
        const now = Date.now();
        breaker.recent = breaker.recent.filter((t) => now - t < 30 * 60 * 1000).concat(now);
        if ((breaker.pauseMs > 0 && ++breaker.failedProbes >= 3) || breaker.recent.length >= 6) {
          breaker.stopped = true; log("✋ Dicta keeps refusing — stopping; a rerun continues from the cache"); return null;
        }
        breaker.pauseMs = breaker.pauseMs ? Math.min(MAX_PAUSE, breaker.pauseMs * 2) : 2 * 60 * 1000;
        breaker.until = Date.now() + breaker.pauseMs;
        log("⏸ Dicta HTTP " + e.status + " — pause " + Math.round(breaker.pauseMs / 1000) + " s");
        attempt--; continue;
      }
    } finally { inFlight--; }
    await sleep(800 * Math.pow(2, attempt));
  }
  return null;
}

async function main() {
  const index = readJson(path.join(DATA, "index.json"), null);
  if (!index) throw new Error("no atlas index in " + DATA);
  const only = (opt("sections", "") || "").split(",").filter(Boolean);
  const sections = index.sections.map((s) => s.id).filter((id) => !only.length || only.includes(id));
  const cache = readJson(CACHE, {});
  fs.mkdirSync(TMP, { recursive: true });
  if (!has("dry-run")) { dicta = require(path.join(REPO, "db", "premium", "providers", "dictaMorph.js")); fs.mkdirSync(path.join(DATA, "parse"), { recursive: true }); }
  const t0 = Date.now(), report = [];
  let fetched = 0, dirty = 0;
  for (const sid of sections) {
    if (breaker.stopped) break;
    const data = readJson(path.join(DATA, "sections", sid + ".json"), null);
    if (!data) { log("✗ " + sid + " missing"); continue; }
    const rows = [];
    for (const p of data.pages || []) for (const it of p.items || []) {
      const plain = String(it.he || "").trim();
      if (it.id && plain && HEB.test(plain)) rows.push({ id: String(it.id), plain, hash: sha(plain).slice(0, 16) });
    }
    const todo = Array.from(new Set(rows.filter((r) => !cache[r.plain]).map((r) => r.plain)));
    if (has("dry-run")) { report.push({ sid, rows: rows.length, toFetch: todo.length }); continue; }
    await Promise.all([0, 1].map(async (lane) => {
      for (let i = lane; i < todo.length; i += 2) {
        if (breaker.stopped) return;
        const toks = await ask(todo[i]);
        if (toks) { cache[todo[i]] = toks; fetched++; if (++dirty >= 25) { atomicWrite(CACHE, JSON.stringify(cache)); dirty = 0; } }
      }
    }));
    atomicWrite(CACHE, JSON.stringify(cache));
    const packed = rows.filter((r) => cache[r.plain]).map((r) => [r.id, r.hash, cache[r.plain].map(pack)]);
    const file = { v: 1, model: dicta.MODEL_VERSION, atlas: index.atlas_id || "a97002", section: sid,
      content_pack_sha256: data.content_pack_sha256 || "", built_at: new Date().toISOString(), rows: packed, missing: rows.length - packed.length };
    const out = path.join(DATA, "parse", sid + ".json");
    atomicWrite(out, JSON.stringify(file));
    const r = { sid, rows: rows.length, parsed: packed.length, missing: file.missing, bytes: fs.statSync(out).size };
    report.push(r);
    log((r.missing ? "◐ " : "✓ ") + JSON.stringify(r));
  }
  log("run: fetched " + fetched + " · refusals " + breaker.refusals + (breaker.stopped ? " · STOPPED by Dicta" : "") + " · " + Math.round((Date.now() - t0) / 1000) + " s");
  if (has("dry-run")) console.log(JSON.stringify({ sections: report.length, rows: report.reduce((a, x) => a + x.rows, 0), toFetch: report.reduce((a, x) => a + x.toFetch, 0) }));
  else atomicWrite(path.join(TMP, "last-run.json"), JSON.stringify({ at: new Date().toISOString(), fetched, refusals: breaker.refusals, stopped: breaker.stopped, report }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
