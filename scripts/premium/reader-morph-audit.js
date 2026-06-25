#!/usr/bin/env node
"use strict";
// smoke:reader-morph:audit — Epic 1 (Resolver Honesty) · P1.0 MEASUREMENT harness.
// R10 norm: measure-before-code. This script changes NOTHING in the shipped resolver;
// it only OBSERVES it against a real corpus sample and a silver oracle, so we can decide
// the precision floor (D2) from data instead of guessing.
//
// THE QUESTION (owner): the "точно/exact" badge of the tap-morphology moat — is it spent
// on undisambiguated readings as a 0.1% tail, or a 5% systemic leak?
//
// HOW (boots library.html in a real browser, SW blocked, locale ru, 380x844):
//   Layer A — STRUCTURAL baseline (deterministic, NO network, always runs):
//     For every tapped (surface, niqqud) the resolver labels via ReaderMorph.resolveWordLight,
//     we reproduce formFirstResolve's multi-id check using the REAL exported helpers
//     (NotesAutoGen.unitFormVariants + ReaderMorph.ensureEngine().maps.formIdx). An "exact"
//     form-first badge whose winning vocalized cell carries >1 distinct pealim_id is a
//     GUESS sold as certainty — the exact bug (notes-autogen.js:143). We count it.
//     → headline: % of "exact" badges sitting on a multi-id (homograph) cell.
//   Layer B — Dicta SILVER oracle (graceful-skip + on-disk cache, opt-out via --no-oracle):
//     We feed the UNVOCALIZED sentence (hebrew_plain) to ReaderDicta.analyzeSentence — a
//     real browser→Dicta-Nakdan call — so Dicta's CONTEXT vocalization/POS is independent of
//     the corpus niqqud (a true silver signal). For each "exact" token we compare the
//     resolver's POS to Dicta's context POS → precision-"exact". silver≠gold (Dicta drifts
//     on archaic Hebrew) — reported with a caveat, never a hard floor in P1.0.
//
// Output: console summary + .tmp/benyehuda/reader-morph-audit-report.json. P1.0 enforces
// NO floor (exit 0); the numbers set the floor for P1.1. Deterministic sample = reproducible
// before/after comparison once F1–F3 land.
//
// Run:  node scripts/premium/reader-morph-audit.js [--rows=300] [--no-oracle] [--keep]

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3289, BASE = "http://127.0.0.1:" + PORT;
const WORKS = path.join(REPO, "public", "data", "benyehuda", "works");
const OUTDIR = path.join(REPO, ".tmp", "benyehuda");
const CACHE = path.join(OUTDIR, "reader-morph-audit-dicta-cache.json");
const REPORT = path.join(OUTDIR, "reader-morph-audit-report.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getNum = (name, def) => { const a = argv.find((x) => x.startsWith("--" + name + "=")); return a ? parseInt(a.split("=")[1], 10) || def : def; };
const TARGET_ROWS = getNum("rows", 300);
const USE_ORACLE = !argv.includes("--no-oracle");
const KEEP = argv.includes("--keep");

// ── server lifecycle (mirror of reader-morph-smoke) ───────────────────────────
function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

// ── deterministic stratified sample over baked works ──────────────────────────
// Stride across the sorted work files so the sample spans many authors/periods (R10
// representativeness), taking the first niqqud-bearing rows of each visited work.
function sampleRows(target) {
  let files;
  try { files = fs.readdirSync(WORKS).filter((f) => /\.json$/.test(f)).sort(); }
  catch (e) { console.error("cannot read works dir " + WORKS + ": " + e.message); return []; }
  if (!files.length) return [];
  const wantWorks = Math.min(files.length, 60);
  const stride = Math.max(1, Math.floor(files.length / wantWorks));
  const perWork = Math.max(2, Math.ceil(target / wantWorks));
  const rows = [];
  const seen = new Set();
  const takeFrom = (file, cap) => {
    let added = 0;
    let work; try { work = JSON.parse(fs.readFileSync(path.join(WORKS, file), "utf8")); } catch (_) { return 0; }
    const texts = (work && work.library && work.library.texts) || [];
    for (const t of texts) {
      for (const r of (t.rows || [])) {
        if (added >= cap || rows.length >= target) return added;
        const he = String(r.hebrew_plain || "").trim();
        const niq = String(r.hebrew_niqqud || "").trim();
        if (!he || !niq) continue;
        if ((he.match(/[א-ת]+/g) || []).length < 3) continue;  // >=3 Hebrew words
        const key = file + "#" + (r.row_id || rows.length);
        if (seen.has(key)) continue; seen.add(key);
        rows.push({ work: file.replace(/\.json$/, ""), row_id: r.row_id || "", he, he_niqqud: niq });
        added++;
      }
    }
    return added;
  };
  // pass 1: strided visit
  for (let i = 0; i < files.length && rows.length < target; i += stride) takeFrom(files[i], perWork);
  // pass 2: fill from any remaining file if tiny works left us short
  for (let i = 0; i < files.length && rows.length < target; i++) takeFrom(files[i], perWork);
  return rows;
}

// ── in-page offline resolution (per row) ──────────────────────────────────────
// Returns one record per tapped content/word token: the resolver's label + a faithful
// reproduction of formFirstResolve's multi-id collision check for "exact" form-first cards.
const PAGE_RESOLVE = `async (row) => {
  const RM = window.ReaderMorph, NA = window.NotesAutoGen;
  const eng = await RM.ensureEngine();
  const maps = eng.maps;
  // MIRROR of reader-morph.js articleStrippedForm (dev-only; ה-prefixed words). Keep in sync.
  function articleStrippedForm(niqqud){
    var s = String(niqqud||"");
    if (s.charCodeAt(0) !== 0x05d4) return "";
    var i = 1;
    while (i < s.length && s.charCodeAt(i) >= 0x0591 && s.charCodeAt(i) <= 0x05c7) i++;
    if (i >= s.length) return "";
    var rest = s.slice(i).replace(/^([\\u05d0-\\u05ea])([\\u0591-\\u05c7]*)/, function(_,cons,marks){ return cons + marks.replace(/\\u05bc/, ""); });
    return rest && rest !== s ? rest : "";
  }
  // Reproduce formFirstResolve's distinct-pealim_id count for the winning cell (pos="" as
  // _resolveVariant builds it). located=false → could not attribute (e.g. variant drift).
  function collisionFor(niqqud, surface, winningPid){
    var cands = [niqqud]; var alt = articleStrippedForm(niqqud); if (alt) cands.push(alt);
    for (var ci=0; ci<cands.length; ci++){
      var u = { pos:"", binyan:"", lemma:"", stem:"", root:null, niqqud:cands[ci], sampleWord:surface, kind:null };
      var vs = NA.unitFormVariants(u);
      for (var vi=0; vi<vs.length; vi++){
        var arr = maps.formIdx.get(vs[vi]); if (!arr || !arr.length) continue;
        var ids = Array.from(new Set(arr.map(function(x){ return String(x.pealim_id); })));
        if (ids.indexOf(String(winningPid)) >= 0) return { located:true, n:ids.length, ids:ids };
      }
    }
    return { located:false, n:0, ids:[] };
  }
  const pairs = RM.alignSurfaceNiqqud(row.he, row.he_niqqud);
  const out = [];
  for (const p of pairs){
    const surf = RM.stripNiqqud(p.surface || "");
    if (!surf || surf.length < 2) continue;
    let card; try { card = await RM.resolveWordLight(surf, p.niqqud || ""); } catch(_) { card = null; }
    if (!card) continue;
    let coll = null;
    if (card.channel === "form-first") coll = collisionFor(p.niqqud || "", surf, card.pealim_id);
    out.push({ surface: surf, niqqud: p.niqqud || "", label: card.label, channel: card.channel,
      pos: card.pos || "", pealim_id: String(card.pealim_id || ""), meaning: card.meaning || "",
      confidence: card.confidence, functionWord: !!card.functionWord, coll });
  }
  return out;
}`;

const PAGE_DICTA = `async (sentence) => {
  if (!window.ReaderDicta) return { ok:false, degraded:true, reason:"no_module" };
  try { return await window.ReaderDicta.analyzeSentence(sentence); }
  catch (e) { return { ok:false, degraded:true, reason:String((e&&e.message)||e) }; }
}`;

// ── POS coarse classes (resolver pos vs Dicta context pos) ────────────────────
const CONTENT = new Set(["verb", "noun", "adjective"]);
function coarse(pos) {
  pos = String(pos || "").toLowerCase();
  if (pos === "noun" || pos === "adjective") return "nominal";   // Dicta cross-tags participles
  if (pos === "verb") return "verb";
  if (!pos) return "";
  return "function";   // adverb/pronoun/conjunction/preposition/particle/…
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  try { fs.mkdirSync(OUTDIR, { recursive: true }); } catch (_) {}
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (_) { cache = {}; }
  const saveCache = () => { try { fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch (_) {} };

  const rows = sampleRows(TARGET_ROWS);
  if (!rows.length) { console.error("no sample rows found under " + WORKS); process.exit(1); }
  const workSpan = new Set(rows.map((r) => r.work)).size;
  console.log("reader-morph-audit: sampled " + rows.length + " rows across " + workSpan + " works (target " + TARGET_ROWS + "); oracle=" + (USE_ORACLE ? "Dicta" : "off"));

  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const tokens = [];                 // flat per-token records
  let oracleOn = USE_ORACLE, degradedStreak = 0, oracleSkipReason = "";
  let dictaHits = 0, dictaCalls = 0;
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.InflectionDict && !!window.NotesAutoGen && !!window.PealimFunctionLinks, { timeout: 25000 });
    if (USE_ORACLE) { try { await pg.addScriptTag({ path: path.join(REPO, "public", "js", "reader-dicta.js") }); await pg.waitForFunction(() => !!window.ReaderDicta, { timeout: 5000 }); } catch (_) {} }
    await pg.evaluate(async () => { await window.ReaderMorph.ensureEngine(); });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Layer A/offline: resolve every token of the row.
      let recs = [];
      try { recs = await pg.evaluate("(" + PAGE_RESOLVE + ")(" + JSON.stringify(row) + ")"); } catch (e) { recs = []; }
      if (!Array.isArray(recs)) recs = [];
      // Layer B/oracle: Dicta context tokens for this sentence (cached, graceful-skip).
      let oracleTokens = null;
      if (oracleOn) {
        const key = row.he;
        if (cache[key]) { oracleTokens = cache[key]; dictaHits++; }
        else {
          dictaCalls++;
          let res = null; try { res = await pg.evaluate("(" + PAGE_DICTA + ")(" + JSON.stringify(row.he) + ")"); } catch (_) { res = null; }
          if (res && res.ok && !res.degraded && Array.isArray(res.tokens) && res.tokens.length) {
            oracleTokens = res.tokens.map((t) => ({ word: t.word, niqqud: t.niqqud, stem: t.stem, lemma: t.lemma, posDicta: t.posDicta, binyan: t.binyan }));
            cache[key] = oracleTokens; degradedStreak = 0;
            if (dictaCalls % 20 === 0) saveCache();
          } else {
            degradedStreak++; oracleSkipReason = (res && res.reason) || "unreachable";
            if (degradedStreak >= 3) { oracleOn = false; }   // Dicta down → stop trying, Layer A still runs
          }
        }
      }
      // attach oracle POS to each token by surface match
      for (const r of recs) {
        let oraclePos = null;
        if (oracleTokens) {
          const surf = r.surface;
          const ot = oracleTokens.find((t) => String(t.stem || "").replace(/[֑-ׇ]/g, "") === surf || String(t.word || "").replace(/[֑-ׇ]/g, "") === surf);
          if (ot && ot.posDicta) oraclePos = ot.posDicta;
        }
        tokens.push({ ...r, work: row.work, oraclePos });
      }
      if ((i + 1) % 25 === 0 || i === rows.length - 1) process.stdout.write("\r  resolved " + (i + 1) + "/" + rows.length + " rows, " + tokens.length + " tokens   ");
    }
    process.stdout.write("\n");
    saveCache();
    if (pageErrors.length) console.error("page errors: " + pageErrors.slice(0, 3).join(" | "));
  } finally { if (!KEEP) await b.close(); await stop(srv.c); }

  // ── metrics ─────────────────────────────────────────────────────────────────
  const isContent = (t) => CONTENT.has(String(t.pos).toLowerCase()) || t.channel === "form-first";
  const exact = tokens.filter((t) => t.label === "exact");
  const formFirst = tokens.filter((t) => t.channel === "form-first");
  const ffExact = formFirst.filter((t) => t.label === "exact");
  const ffCollision = ffExact.filter((t) => t.coll && t.coll.located && t.coll.n > 1);
  const ffUnlocated = ffExact.filter((t) => t.coll && !t.coll.located);

  // Layer A headline: share of "exact" badges sitting on a multi-id (homograph) cell.
  const collOverExact = exact.length ? (ffCollision.length / exact.length) : 0;
  const collOverContent = tokens.filter(isContent).length ? (ffCollision.length / tokens.filter(isContent).length) : 0;
  // honest-degradation recall on multi-id cells (structural, no oracle): of tokens that
  // form-first resolved on a multi-id cell, how many were NOT sold as "exact". Pre-fix ~0;
  // P1.1 must lift this. (Denominator = located multi-id form-first tokens, any label.)
  const multiIdAll = formFirst.filter((t) => t.coll && t.coll.located && t.coll.n > 1);
  const degradedHonestly = multiIdAll.filter((t) => t.label !== "exact");
  const degradeRecall = multiIdAll.length ? (degradedHonestly.length / multiIdAll.length) : null;

  // Layer B precision (only over exact tokens with an oracle POS).
  const exactWithOracle = exact.filter((t) => t.oraclePos);
  let confirmed = 0, contradicted = 0; const offenders = [];
  // composition of false-exacts: which fix bucket addresses each (P1.1 multi-id vs the tail).
  const comp = { multiId: 0, singleId: 0, toFunction: 0, toContent: 0, toProper: 0 };
  for (const t of exactWithOracle) {
    const co = coarse(t.pos), oo = coarse(t.oraclePos);
    if (!oo) continue;
    if (co === oo || (co === "nominal" && oo === "nominal")) confirmed++;
    else {
      contradicted++;
      const multi = !!(t.coll && t.coll.located && t.coll.n > 1);
      if (multi) comp.multiId++; else comp.singleId++;
      const op = String(t.oraclePos).toLowerCase();
      if (op === "propernoun") comp.toProper++;
      else if (oo === "function") comp.toFunction++;
      else comp.toContent++;
      if (offenders.length < 25) offenders.push({ surface: t.surface, niqqud: t.niqqud, resolverPos: t.pos, oraclePos: t.oraclePos, meaning: t.meaning, collN: t.coll ? t.coll.n : null });
    }
  }
  const precisionExact = (confirmed + contradicted) ? confirmed / (confirmed + contradicted) : null;

  // worst structural offenders (exact on multi-id cell) — for the report
  const collOffenders = ffCollision.slice(0, 25).map((t) => ({ surface: t.surface, niqqud: t.niqqud, pos: t.pos, pealim_id: t.pealim_id, meaning: t.meaning, idsCount: t.coll.n, oraclePos: t.oraclePos || null }));

  const labelDist = {};
  for (const t of tokens) labelDist[t.label] = (labelDist[t.label] || 0) + 1;

  const pct = (x) => x == null ? "n/a" : (x * 100).toFixed(1) + "%";
  const report = {
    generated_for: "Epic 1 P1.0 baseline (measure-before-code)",
    sample: { rows: rows.length, works: workSpan, tokens: tokens.length, contentTokens: tokens.filter(isContent).length },
    labelDistribution: labelDist,
    layerA_structural: {
      exactTotal: exact.length,
      formFirstExact: ffExact.length,
      exactOnMultiIdCell: ffCollision.length,
      exactFormFirstUnlocated: ffUnlocated.length,
      headline_collisionShareOfExact: collOverExact,
      collisionShareOfContent: collOverContent,
      honestDegradationRecall_onMultiIdCells: degradeRecall,
      multiIdFormFirstTokens: multiIdAll.length,
    },
    layerB_dicta: {
      enabled: USE_ORACLE, active: USE_ORACLE && (dictaHits + dictaCalls > 0) && (exactWithOracle.length > 0),
      skipReason: oracleOn ? "" : oracleSkipReason, cacheHits: dictaHits, liveCalls: dictaCalls,
      exactWithOraclePos: exactWithOracle.length, confirmed, contradicted,
      precisionExact, falseExactComposition: comp,
      caveat: "silver≠gold — Dicta drifts on archaic Hebrew; POS-only comparison, coarse classes",
    },
    collisionOffenders: collOffenders,
    posContradictionOffenders: offenders,
  };
  try { fs.writeFileSync(REPORT, JSON.stringify(report, null, 2)); } catch (_) {}

  // ── console summary ───────────────────────────────────────────────────────────
  console.log("\n══════════ reader-morph-audit · Epic 1 P1.0 BASELINE ══════════");
  console.log("sample        : " + rows.length + " rows / " + workSpan + " works → " + tokens.length + " tokens (" + report.sample.contentTokens + " content)");
  console.log("label dist    : " + Object.entries(labelDist).map(([k, v]) => k + "=" + v).join("  "));
  console.log("─ Layer A (structural, deterministic) ─");
  console.log("  exact badges total            : " + exact.length);
  console.log("  └ via form-first              : " + ffExact.length + "  (unlocated cell: " + ffUnlocated.length + ")");
  console.log("  ⚑ exact ON multi-id homograph : " + ffCollision.length + "   ← the bug");
  console.log("  HEADLINE collision/exact      : " + pct(collOverExact) + "   (collision/content " + pct(collOverContent) + ")");
  console.log("  honest-degradation recall     : " + pct(degradeRecall) + "   (on " + multiIdAll.length + " multi-id form-first tokens; P1.1 must lift)");
  console.log("─ Layer B (Dicta silver oracle) ─");
  if (!report.layerB_dicta.active) {
    console.log("  SKIPPED — " + (USE_ORACLE ? ("Dicta " + (oracleSkipReason || "unreachable") + " (graceful-skip; Layer A is the headline)") : "--no-oracle"));
  } else {
    console.log("  exact tokens w/ oracle POS    : " + exactWithOracle.length + "  (cache " + dictaHits + " / live " + dictaCalls + ")");
    console.log("  precision of 'exact' vs Dicta : " + pct(precisionExact) + "   (confirmed " + confirmed + " / contradicted " + contradicted + ")");
    console.log("  false-exact composition       : multi-id=" + comp.multiId + " (→P1.1)  single-id=" + comp.singleId + " (→tail: function=" + comp.toFunction + " content=" + comp.toContent + " proper=" + comp.toProper + ")");
    console.log("  caveat: silver≠gold (Dicta archaic drift; coarse POS only)");
  }
  if (collOffenders.length) {
    console.log("─ top structural offenders (exact sold on a multi-id cell) ─");
    for (const o of collOffenders.slice(0, 8)) console.log("  " + o.niqqud + "  pos=" + o.pos + " ids=" + o.idsCount + " → «" + (o.meaning || "").slice(0, 24) + "»" + (o.oraclePos ? " [Dicta:" + o.oraclePos + "]" : ""));
  }
  console.log("report → " + path.relative(REPO, REPORT));
  console.log("P1.0 is measurement only — no floor enforced (exit 0). Numbers set the P1.1 floor (D2).");
})().catch((e) => { console.error("fatal", e); process.exit(1); });
