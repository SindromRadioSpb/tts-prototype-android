#!/usr/bin/env node
"use strict";
// ── R2 — offline proper-name gazetteer producer (dev-only; nothing here ships at runtime) ──
//
// Builds a license-clean, HOMOGRAPH-AWARE gazetteer of Hebrew proper names for the Reading-Room
// tap-morphology resolver (reader-morph.js). Plan: docs/planning/BRR_R2_NAME_GAZETTEER_2026_06_26.md.
//
// Pipeline:
//   1. HARVEST  — corpus skeleton set (+freq +top-niqqud) from baked works (real vocalization).
//   2. PULL     — Wikidata given-names + place-names with Hebrew labels (paginated SPARQL, Node-fetch
//                 NOT curl — Windows curl mangles UTF-8). Cached to the artifact dir.
//   3. INTERSECT— keep only single-token Hebrew name skeletons that actually occur in the corpus
//                 (bounds size, kills foreign-name noise, surfaces literary names).
//   4. SPLIT    — homograph-split via the LIVE in-browser resolver (Playwright + library.html): resolve
//                 each candidate with its CORPUS niqqud. Lands a content «exact»/«likely» (= a real
//                 common word in our dict) → HOMOGRAPH (demote, never assert). Else → UNAMBIGUOUS
//                 (assert propernoun, honest-empty). Already-propernoun (seed) → covered. func-word → skip.
//   5. EMIT     — split lists + raw pull + provenance → docs/research/name-gazetteer/<date>/ (tracked,
//                 Artifact storage rule) + a ready-to-paste JS snippet for reader-morph.js.
//
// Usage:
//   node scripts/premium/build-name-gazetteer.js            # full pipeline (uses cached pull if present)
//   node scripts/premium/build-name-gazetteer.js --refresh  # force re-pull from Wikidata
//   node scripts/premium/build-name-gazetteer.js --no-split  # stop after intersect (skip browser)
//   node scripts/premium/build-name-gazetteer.js --limit=300 # cap candidates sent to the resolver (debug)

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const strip = RM.stripNiqqud;

const WORKS = path.join(REPO, "public", "data", "benyehuda", "works");
const DATE = "2026-06-26";
const OUTDIR = path.join(REPO, "docs", "research", "name-gazetteer", DATE);
const RAW_PULL = path.join(OUTDIR, "wikidata-names-raw.json");
const PORT = 3291, BASE = "http://127.0.0.1:" + PORT;
const UA = "LinguistPro-research/1.0 (educational; Hebrew morphology gazetteer; contact sindromradiospb@gmail.com)";
const SPARQL = "https://query.wikidata.org/sparql";

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes("--" + f);
const numArg = (f, d) => { const a = ARGS.find((x) => x.startsWith("--" + f + "=")); return a ? parseInt(a.split("=")[1], 10) : d; };
const REFRESH = has("refresh"), NO_SPLIT = has("no-split"), LIMIT = numArg("limit", 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. corpus harvest: skeleton → {freq, niqqud(top)} ─────────────────────────
function harvestCorpus() {
  const files = fs.readdirSync(WORKS).filter((f) => /\.json$/.test(f)).sort();
  const skel = new Map(); // skeleton → Map(niqqud → count)
  for (const f of files) {
    let w; try { w = JSON.parse(fs.readFileSync(path.join(WORKS, f), "utf8")); } catch (_) { continue; }
    for (const t of ((w.library && w.library.texts) || [])) {
      for (const r of (t.rows || [])) {
        const he = String(r.hebrew_plain || ""), niq = String(r.hebrew_niqqud || "");
        if (!he) continue;
        let pairs = []; try { pairs = RM.alignSurfaceNiqqud(he, niq); } catch (_) { pairs = []; }
        for (const p of pairs) {
          const s = strip(p.surface || ""); if (s.length < 2) continue;
          if (!skel.has(s)) skel.set(s, new Map());
          const m = skel.get(s), nq = p.niqqud || p.surface || "";
          m.set(nq, (m.get(nq) || 0) + 1);
        }
      }
    }
  }
  const out = new Map();
  for (const [s, m] of skel) {
    let freq = 0, top = "", topc = 0;
    for (const [nq, c] of m) { freq += c; if (c > topc) { topc = c; top = nq; } }
    out.set(s, { freq, niqqud: top });
  }
  return { files: files.length, skel: out };
}

// ── 2. Wikidata pull (paginated SPARQL) ───────────────────────────────────────
async function sparql(query) {
  const url = SPARQL + "?format=json&query=" + encodeURIComponent(query);
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/sparql-results+json" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 160));
  return (await r.json()).results.bindings;
}
// Pull all he-labelled items of one P31 type, paginated by OFFSET (whole-COUNT times out).
async function pullType(qid, label, pageSize) {
  const seen = new Set();
  let offset = 0;
  for (;;) {
    const q = `SELECT ?he WHERE { ?n wdt:P31 wd:${qid} ; rdfs:label ?he . FILTER(LANG(?he)="he") }
               ORDER BY ?n LIMIT ${pageSize} OFFSET ${offset}`;
    let rows;
    try { rows = await sparql(q); }
    catch (e) { process.stdout.write("\n  ! " + label + " page@" + offset + " failed: " + e.message.slice(0, 80) + " — retry in 5s\n"); await sleep(5000); try { rows = await sparql(q); } catch (e2) { console.log("  ! " + label + " page@" + offset + " gave up"); break; } }
    if (!rows.length) break;
    for (const b of rows) seen.add(b.he.value);
    offset += pageSize;
    process.stdout.write("\r  " + label + ": " + seen.size + " (offset " + offset + ")   ");
    await sleep(250); // be polite to WDQS
    if (offset > 200000) break; // safety
  }
  process.stdout.write("\n");
  return [...seen];
}
async function pullWikidata() {
  // given-name types + a few clean place types. Human-settlement (Q486972) is intentionally
  // omitted (millions of rows); the corpus intersection bounds the result anyway.
  const types = [
    ["Q12308941", "male-given", 2500],
    ["Q11879590", "female-given", 2500],
    ["Q3409032", "unisex-given", 2500],
    ["Q202444", "given-name", 2500],
    ["Q6256", "country", 1000],
    ["Q515", "city", 2000],
    ["Q5119", "capital", 1000],
    ["Q3624078", "sovereign-state", 1000],
  ];
  const byType = {};
  for (const [qid, label, ps] of types) {
    byType[label] = await pullType(qid, label, ps);
  }
  return byType;
}

// normalize a raw Wikidata label → consonantal skeleton, or null if not a single Hebrew token.
function normLabel(lbl) {
  let s = String(lbl || "").trim();
  if (/[\s ]/.test(s)) return null;           // single token only (per-word tap)
  s = strip(s);                                     // drop any niqqud/cantillation
  if (!/^[א-ת]{2,}$/.test(s)) return null; // Hebrew letters only, len ≥ 2
  return s;
}

// ── 4. homograph split via the live in-browser resolver ───────────────────────
const PAGE_CLASSIFY = `async (items) => {
  const RM = window.ReaderMorph;
  await RM.ensureEngine();
  const out = [];
  for (const it of items) {
    let c = null;
    try { c = await RM.resolveWordLight(it.skel, it.niqqud || ""); } catch (_) { c = null; }
    out.push(c ? { skel: it.skel, label: c.label, pos: c.pos || "", func: !!c.functionWord,
      meaning: (c.meaning || "").slice(0, 24), channel: c.channel } : { skel: it.skel, label: null });
  }
  return out;
}`;

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stopServer(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function serverReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function classifyInBrowser(candidates) {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const srv = startServer();
  if (!(await serverReady())) { console.error("server failed to start\n" + srv.logs.join("")); await stopServer(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const results = [];
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.InflectionDict && !!window.NotesAutoGen && !!window.PealimFunctionLinks, { timeout: 25000 });
    await pg.evaluate(async () => { await window.ReaderMorph.ensureEngine(); });
    const BATCH = 80;
    for (let s = 0; s < candidates.length; s += BATCH) {
      const items = candidates.slice(s, s + BATCH).map((c) => ({ skel: c.skel, niqqud: c.niqqud }));
      let res = [];
      try { res = await pg.evaluate("(" + PAGE_CLASSIFY + ")(" + JSON.stringify(items) + ")"); } catch (e) { res = items.map((i) => ({ skel: i.skel, label: null })); }
      res.forEach((r) => results.push(r));
      process.stdout.write("\r  resolved " + Math.min(s + BATCH, candidates.length) + "/" + candidates.length + "   ");
    }
    process.stdout.write("\n");
    if (pageErrors.length) console.error("page errors: " + pageErrors.slice(0, 3).join(" | "));
  } finally { await b.close(); await stopServer(srv.c); }
  return results;
}

// classify one resolver result → bucket.
const CONTENT = new Set(["verb", "noun", "adjective"]);
function bucketOf(r) {
  if (!r || r.label == null) return "err";
  if (r.func && r.pos === "propernoun") return "seed";        // already asserted by NAME_PROPER seed
  if (r.func) return "function";                              // also a function word → leave function gate
  if ((r.label === "exact" || r.label === "likely") && CONTENT.has(r.pos)) return "homograph";
  return "unambiguous";                                       // unknown/guessed/no content reading → safe to assert
}

// ── main ──────────────────────────────────────────────────────────────────────
(async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  console.log("══════════ build-name-gazetteer (R2) ══════════");

  console.log("1. harvesting corpus skeletons …");
  const { files, skel } = harvestCorpus();
  console.log("   " + files + " works · " + skel.size + " distinct skeletons");

  let pull;
  if (!REFRESH && fs.existsSync(RAW_PULL)) {
    pull = JSON.parse(fs.readFileSync(RAW_PULL, "utf8"));
    console.log("2. Wikidata pull: using cached " + path.relative(REPO, RAW_PULL) + " (--refresh to re-pull)");
  } else {
    console.log("2. pulling Wikidata names (Node-fetch, paginated) …");
    const byType = await pullWikidata();
    pull = { generated: DATE, source: "Wikidata SPARQL (he labels)", byType };
    fs.writeFileSync(RAW_PULL, JSON.stringify(pull, null, 1));
    console.log("   saved raw pull → " + path.relative(REPO, RAW_PULL));
  }

  // 3. normalize + dedup + intersect with corpus
  console.log("3. normalize + intersect with corpus …");
  const nameSkel = new Map(); // skeleton → Set(typeLabels)
  let rawCount = 0;
  for (const [label, arr] of Object.entries(pull.byType)) {
    for (const lbl of arr) {
      rawCount++;
      const s = normLabel(lbl);
      if (!s) continue;
      if (!nameSkel.has(s)) nameSkel.set(s, new Set());
      nameSkel.get(s).add(label);
    }
  }
  let candidates = [];
  for (const [s, types] of nameSkel) {
    const cs = skel.get(s);
    if (!cs) continue; // not in corpus → drop
    candidates.push({ skel: s, niqqud: cs.niqqud, freq: cs.freq, types: [...types] });
  }
  candidates.sort((a, b) => b.freq - a.freq);
  console.log("   raw labels=" + rawCount + " · distinct name-skeletons=" + nameSkel.size +
    " · in-corpus candidates=" + candidates.length);
  if (LIMIT && candidates.length > LIMIT) { candidates = candidates.slice(0, LIMIT); console.log("   (capped to --limit=" + LIMIT + ")"); }

  if (NO_SPLIT) {
    fs.writeFileSync(path.join(OUTDIR, "candidates.json"), JSON.stringify(candidates, null, 1));
    console.log("--no-split: wrote candidates.json, stopping before browser split.");
    return;
  }

  // 4. homograph split via live resolver
  console.log("4. homograph-split via live in-browser resolver …");
  const res = await classifyInBrowser(candidates);
  const byBucket = { unambiguous: [], homograph: [], seed: [], function: [], err: [] };
  const resBySkel = new Map(res.map((r) => [r.skel, r]));
  for (const c of candidates) {
    const r = resBySkel.get(c.skel) || { skel: c.skel, label: null };
    const bucket = bucketOf(r);
    byBucket[bucket].push({ ...c, label: r.label, pos: r.pos, meaning: r.meaning, channel: r.channel });
  }
  const counts = Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, v.length]));
  console.log("   buckets: " + JSON.stringify(counts));

  // 5. emit
  const unambiguous = byBucket.unambiguous.map((x) => x.skel).sort();
  const homograph = byBucket.homograph.map((x) => x.skel).sort();
  const emit = {
    generated: DATE, source: pull.source, corpus_works: files,
    counts, unambiguous, homograph,
    detail: byBucket,
  };
  fs.writeFileSync(path.join(OUTDIR, "gazetteer-split.json"), JSON.stringify(emit, null, 1));

  // ready-to-paste JS literals for reader-morph.js
  const fmt = (arr) => {
    const lines = []; let line = "    ";
    for (const w of arr) { const tok = '"' + w + '": 1, '; if ((line + tok).length > 110) { lines.push(line.replace(/\s+$/, "")); line = "    "; } line += tok; }
    if (line.trim()) lines.push(line.replace(/\s+$/, ""));
    return lines.join("\n");
  };
  const snippet =
    "// R2 gazetteer — UNAMBIGUOUS (assert propernoun). Source: Wikidata he-labels ∩ baked corpus,\n" +
    "// homograph-split via live resolver. Producer: scripts/premium/build-name-gazetteer.js (" + DATE + ").\n" +
    "var NAME_PROPER_R2 = {\n" + fmt(unambiguous) + "\n  };\n\n" +
    "// R2 gazetteer — HOMOGRAPH names (also common words → DEMOTE «точно»→«вероятно», never assert).\n" +
    "var NAME_HOMOGRAPH = {\n" + fmt(homograph) + "\n  };\n";
  fs.writeFileSync(path.join(OUTDIR, "gazetteer-snippet.js"), snippet);

  console.log("\n══════════ done ══════════");
  console.log("  unambiguous (assert): " + unambiguous.length);
  console.log("  homograph  (demote) : " + homograph.length);
  console.log("  artifact → " + path.relative(REPO, OUTDIR));
  console.log("  ship snippet → " + path.relative(REPO, path.join(OUTDIR, "gazetteer-snippet.js")));
  // quick sanity print of the gold homograph names
  for (const g of ["שלום", "הלל"]) console.log("  gold-check " + g + " → " + (homograph.includes(strip(g)) ? "HOMOGRAPH ✓" : unambiguous.includes(strip(g)) ? "unambiguous" : "(other)"));
})().catch((e) => { console.error(e); process.exit(1); });
