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
const CACHE = path.join(OUTDIR, "reader-morph-audit-dicta-cache.json");   // scratch/cache → .tmp
const REPORT = path.join(OUTDIR, "reader-morph-audit-report.json");       // scratch → .tmp
// R1.0 gold-eval DELIVERABLES live in a stable, user-visible repo path — NOT .tmp.
// (See "Artifact storage rule" in CLAUDE.md: user-facing artifacts the owner reviews /
// annotates / preserves must be in a tracked folder, never only in gitignored .tmp.)
// Dev-only harness still: never shipped, no SW bump. The Dicta cache + audit report above
// stay scratch in .tmp by design.
const GOLD_DIR = path.join(REPO, "docs", "research", "reader-morph-gold", "2026-06-25");
const WORKSHEET = path.join(GOLD_DIR, "reader-morph-gold-worksheet.tsv");
const WORKSHEET_PREVIEW = path.join(GOLD_DIR, "reader-morph-gold-worksheet-PREVIEW.tsv");
const LEGEND = path.join(GOLD_DIR, "reader-morph-gold-LEGEND.md");
const GOLD_REPORT = path.join(GOLD_DIR, "reader-morph-gold-report.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getNum = (name, def) => { const a = argv.find((x) => x.startsWith("--" + name + "=")); return a ? parseInt(a.split("=")[1], 10) || def : def; };
const TARGET_ROWS = getNum("rows", 300);
const USE_ORACLE = !argv.includes("--no-oracle");
const USE_TIER3 = argv.includes("--tier3");   // simulate the opt-in Tier-3 context path
const KEEP = argv.includes("--keep");
const getStr = (name) => { const a = argv.find((x) => x.startsWith("--" + name + "=")); return a ? a.split("=").slice(1).join("=") : ""; };
// R1.0 gold-eval (measure-before-code; breaks Dicta-silver circularity with HUMAN gold)
const WORKSHEET_N = getNum("worksheet", 0);    // producer: emit a gold TSV of N homograph-focused tokens
const GOLD_FILE = getStr("gold");              // scorer: score a filled worksheet (pure, no browser)
const REGOLD_FILE = getStr("regold");          // regression gate: re-resolve gold tokens LIVE + re-score
const OUT_OVERRIDE = getStr("out");            // override worksheet output path
const FORCE = argv.includes("--force");        // allow overwriting an existing (in-progress) worksheet
// worksheet needs a generous pool so the rare strata (tail/collision) actually fill
const SAMPLE_ROWS = WORKSHEET_N ? getNum("rows", 380) : TARGET_ROWS;

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
      lemma: card.lemma || "", root: card.root || "", ambiguous: !!card.ambiguous,
      alts: (card.alts || []).slice(0, 3).map(function (a) { return { pos: (a && a.pos) || "", meaning: (a && a.meaning) || "", root: (a && a.root) || "" }; }),
      confidence: card.confidence, functionWord: !!card.functionWord, coll });
  }
  return out;
}`;

const PAGE_DICTA = `async (sentence) => {
  if (!window.ReaderDicta) return { ok:false, degraded:true, reason:"no_module" };
  try { return await window.ReaderDicta.analyzeSentence(sentence); }
  catch (e) { return { ok:false, degraded:true, reason:String((e&&e.message)||e) }; }
}`;

// Tier-3 simulation: re-resolve each token WITH the Dicta context (the opt-in «точный
// режим» path). Uses the already-cached Dicta token → no new network. contextUsed reflects
// pickContextReading's CONSERVATIVE accept (only when strictly more decisive + POS agrees).
const PAGE_TIER3 = `async (items) => {
  const R = window.ReaderMorph; const out = [];
  for (const it of items) {
    let c = null; try { c = await R.resolveWordLight(it.surface, it.niqqud, it.ctx); } catch (_) { c = null; }
    out.push(c ? { surface: it.surface, label: c.label, pos: c.pos || "", channel: c.channel, contextUsed: !!c.contextUsed, meaning: (c.meaning||"").slice(0,30) } : { surface: it.surface, label: null });
  }
  return out;
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

// ── R1.0 gold-eval helpers (worksheet producer + scorer) ──────────────────────
// measure-before-code (R10): the resolver's true precision on ARCHAIC vocalized Hebrew is
// unknown — every prior number is vs Dicta SILVER, which is circular and drifts on archaic
// text. These build a homograph-focused worksheet from baked Ben-Yehuda for HUMAN gold, then
// score the resolver against that gold (non-circular). Dev-only; nothing here ships.
const pct = (x) => (x == null || (typeof x === "number" && isNaN(x))) ? "n/a" : (x * 100).toFixed(1) + "%";
const rate = (a, b) => (b ? a / b : null);
const NIQ_RE = /[֑-ׇ]/g;
const stripNiq = (s) => String(s == null ? "" : s).replace(NIQ_RE, "").trim();
const tsvCell = (s) => String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").trim();
function fmtAlts(alts) {
  if (!Array.isArray(alts) || !alts.length) return "";
  return alts.map((a) => ((a.pos || "") + (a.meaning ? (":" + a.meaning) : ""))).filter(Boolean).join(" ¦ ");
}
// Context window CENTERED on the judged token so it is ALWAYS visible. Long baked lines
// otherwise truncate the token off the end of a fixed slice — that made 8 rows of the first
// batch unjudgeable (correctly skipped by the annotator). Falls back to a head-slice if the
// token can't be located in the line.
function ctxWindow(sentence, token, radius) {
  const s = String(sentence || ""), t = String(token || "");
  const idx = t ? s.indexOf(t) : -1;
  if (idx < 0) return s.slice(0, 360);
  const start = Math.max(0, idx - radius), end = Math.min(s.length, idx + t.length + radius);
  return (start > 0 ? "…" : "") + s.slice(start, end) + (end < s.length ? "…" : "");
}
// Gold POS coarse classes — KEEPS propernoun & numeral distinct (unlike audit's coarse(),
// which lumps them into "function"); names matter for F6 and numerals are their own axis.
function coarseGold(pos) {
  pos = String(pos || "").toLowerCase().trim();
  if (!pos) return "";
  if (pos === "verb") return "verb";
  if (pos === "noun" || pos === "adjective" || pos === "adj" || pos === "participle") return "nominal";
  if (pos === "propernoun" || pos === "proper" || pos === "propn" || pos === "name") return "propernoun";
  if (pos === "numeral" || pos === "number" || pos === "num") return "numeral";
  return "function";  // pronoun / adverb / preposition / conjunction / particle / …
}
// Classify a resolved token into ONE sampling stratum (priority order). Homograph-weighted:
// the contested cells (collision/tail/hedged) are what gold must scrutinise; control = the
// "easy" exacts (catch systematic lemma errors); fill = the rest, to round out N.
function stratumOf(t) {
  const exact = t.label === "exact";
  const multi = !!(t.coll && t.coll.located && t.coll.n > 1);
  const disagree = exact && t.oraclePos && coarse(t.oraclePos) && coarse(t.pos) !== coarse(t.oraclePos);
  if (exact && multi) return "collision";                                   // exact sold on a homograph cell
  if (disagree) return "tail";                                              // exact the silver contradicts
  if ((t.label === "likely" || t.label === "guessed") &&
      (t.ambiguous || (t.alts && t.alts.length) || multi)) return "hedged"; // honestly-degraded multi-reading
  if (exact) return "control";                                             // clean exact
  return "fill";
}

const WS_COLS = ["id", "work", "row_id", "surface", "niqqud", "sentence", "offline_pos", "offline_lemma", "offline_root", "offline_meaning", "offline_label", "offline_alts", "nakdan_pos", "stratum", "gold_pos", "gold_lemma", "verdict", "note"];
const WS_QUOTA = { collision: 0.15, tail: 0.25, hedged: 0.30, control: 0.20, fill: 0.10 };
const WS_ORDER = ["collision", "tail", "hedged", "control", "fill"];

function emitWorksheet(tokens, N, outPath, force) {
  if (fs.existsSync(outPath) && !force) {
    console.error("\n⛔ worksheet already exists: " + path.relative(REPO, outPath));
    console.error("   refusing to overwrite an in-progress annotation. Use --force to replace, or --out=<path>.");
    process.exit(2);
  }
  // 1) content tokens only, drop literal (form+sentence) repeats, cap repeats of any one form
  const MAX_PER_FORM = 4;
  const seenRow = new Set(); const perForm = new Map();
  const byStratum = { collision: [], tail: [], hedged: [], control: [], fill: [] };
  for (const t of tokens) {
    if (!t.surface || t.surface.length < 2) continue;
    const dk = (t.niqqud || "") + "|" + (t.sentence || "");
    if (seenRow.has(dk)) continue; seenRow.add(dk);
    const fk = t.niqqud || t.surface;
    const fc = perForm.get(fk) || 0; if (fc >= MAX_PER_FORM) continue; perForm.set(fk, fc + 1);
    byStratum[stratumOf(t)].push(t);
  }
  // 2) quota fill in priority order, then redistribute the deficit to later strata
  const picked = []; let remaining = N; const used = {};
  for (const s of WS_ORDER) {
    const want = Math.round(N * WS_QUOTA[s]);
    const take = Math.min(want, byStratum[s].length, remaining);
    for (let i = 0; i < take; i++) picked.push(byStratum[s][i]);
    used[s] = take; remaining -= take;
  }
  for (const s of WS_ORDER) {
    if (remaining <= 0) break;
    for (let i = used[s]; i < byStratum[s].length && remaining > 0; i++) { picked.push(byStratum[s][i]); remaining--; }
  }
  // 3) emit TSV (UTF-8 BOM so Excel reads Hebrew; the 4 human columns are EMPTY at the end)
  const idSeen = new Map();
  const mkId = (t) => {
    const base = t.work + "::" + (t.row_id || "") + "::" + stripNiq(t.niqqud);
    let id = base, k = 1; while (idSeen.has(id)) id = base + "#" + (++k); idSeen.set(id, true); return id;
  };
  const rowOf = (t) => [
    mkId(t), t.work, t.row_id || "", t.surface, t.niqqud, ctxWindow(t.sentence, t.niqqud, 150),
    t.pos || "", t.lemma || "", t.root || "", String(t.meaning || "").slice(0, 60), t.label || "",
    fmtAlts(t.alts), t.oraclePos || "", stratumOf(t),
    "", "", "", "",            // gold_pos, gold_lemma, verdict, note — for the owner to fill
  ].map(tsvCell).join("\t");
  const head = [
    "# LinguistPro · R1 gold worksheet (reader-morph resolver eval) — fill gold_pos + gold_lemma per row.",
    "# verdict/note optional. ambig = both readings valid · skip = unjudgeable (OCR/garbage). See reader-morph-gold-LEGEND.md.",
    "# Sampling is HOMOGRAPH-WEIGHTED (NOT corpus base-rate) → read results PER-STRATUM.",
    "# nakdan_pos = Dicta SILVER reference only (NOT truth). offline_* = the resolver under test.",
  ].join("\n");
  const lines = picked.map(rowOf);
  try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (_) {}
  try { fs.mkdirSync(path.dirname(WORKSHEET_PREVIEW), { recursive: true }); } catch (_) {}
  const body = "﻿" + head + "\n" + WS_COLS.join("\t") + "\n" + lines.join("\n") + "\n";
  fs.writeFileSync(outPath, body);
  const prevLines = lines.slice(0, 15);
  fs.writeFileSync(WORKSHEET_PREVIEW, "﻿" + head + "\n" + WS_COLS.join("\t") + "\n" + prevLines.join("\n") + "\n");

  const counts = {}; for (const t of picked) counts[stratumOf(t)] = (counts[stratumOf(t)] || 0) + 1;
  console.log("\n══════════ reader-morph-audit · R1 GOLD WORKSHEET ══════════");
  console.log("selected      : " + picked.length + " / N=" + N + " tokens   (from " + tokens.length + " resolved)");
  console.log("strata        : " + WS_ORDER.map((s) => s + "=" + (counts[s] || 0)).join("  "));
  console.log("worksheet     → " + path.relative(REPO, outPath));
  console.log("preview (15)  → " + path.relative(REPO, WORKSHEET_PREVIEW));
  console.log("legend        → " + path.relative(REPO, LEGEND));
  console.log("\n─ preview (first 10; open the TSV in a spreadsheet for true RTL) ─");
  for (const t of picked.slice(0, 10)) {
    console.log("  [" + stratumOf(t) + "] " + t.niqqud + "   pos=" + (t.pos || "–") + " lemma=" + (t.lemma || "–") + " root=" + (t.root || "–") + " label=" + t.label + " nakdan=" + (t.oraclePos || "–"));
    console.log("      ctx: " + String(t.sentence || "").slice(0, 88));
  }
  console.log("\nfill gold_pos + gold_lemma, then:  npm run gold:score");
}

function writeLegend(outPath) {
  const md = [
    "# R1 Gold Worksheet — annotation legend",
    "",
    "Goal: measure the **true** precision of the tap-morphology resolver on **archaic, vocalized**",
    "Hebrew (baked Ben-Yehuda), independent of the Dicta silver oracle (which is circular and",
    "drifts on archaic text). You provide the human gold; the scorer compares the resolver to it.",
    "",
    "## How to fill",
    "Open the `.tsv` in a spreadsheet (Excel/Sheets/LibreOffice) — it's UTF-8 with BOM so Hebrew +",
    "niqqud render correctly, RTL per cell. For each row read `niqqud` (the form being judged) in",
    "the `sentence` context, then fill **only**:",
    "- **gold_pos** — the correct part of speech in context (vocab below). *Required* to score a row.",
    "- **gold_lemma** — the correct dictionary citation form. Niqqud optional (compared",
    "  niqqud-insensitively — only the consonants must be right). For verbs: 3ms past (קָטַל-pattern,",
    "  Pealim convention); for nouns: absolute singular. Leave blank if you only want to judge POS.",
    "- **verdict** / **note** — optional (see below).",
    "",
    "You do NOT need to fill the reference columns (offline_*, nakdan_pos, stratum) — they're the",
    "machine guesses you're adjudicating. Annotate in any order / in batches; the scorer counts only",
    "filled rows and reports coverage X/N.",
    "",
    "## gold_pos vocabulary (controlled)",
    "Write the precise tag; the scorer also coarsens it for the headline.",
    "",
    "| tag | coarse class |",
    "|---|---|",
    "| `verb` | verb |",
    "| `noun` | nominal |",
    "| `adjective` | nominal |",
    "| `participle` | nominal *(beinoni; tag the surface category — Dicta cross-tags these)* |",
    "| `propernoun` | propernoun *(personal/place name — kept distinct, matters for F6)* |",
    "| `numeral` | numeral |",
    "| `pronoun` | function |",
    "| `adverb` | function |",
    "| `preposition` | function |",
    "| `conjunction` | function |",
    "| `particle` | function *(article, question/negation/relativizer, etc.)* |",
    "",
    "The **headline** precision compares at the coarse level (verb / nominal / propernoun / numeral /",
    "function) — the axis the «точно» badge actually hinges on. A separate strict-string POS match is",
    "also reported.",
    "",
    "## verdict (optional — leave blank for normal rows)",
    "- *(blank)* — scorer derives correctness from gold_pos (+ gold_lemma). Use this for most rows.",
    "- **ambig** — *first-class*: both readings are genuinely valid in this context. The resolver is",
    "  then expected to **hedge** (not say «точно»). A hedged card on an `ambig` token = correct honesty;",
    "  an «exact» card on it = false certainty.",
    "- **skip** — *first-class*: unjudgeable (OCR garbage, truncated form, not really Hebrew). Excluded",
    "  from all rates; counted separately in coverage.",
    "- **ok** / **badpos** / **badlemma** / **badboth** — optional manual overrides if you'd rather state",
    "  the verdict directly than have it derived.",
    "",
    "## What the scorer reports (`gold:score`)",
    "- **precision of «exact»** — of cards labeled «точно», fraction actually correct vs gold. The headline.",
    "- **honest-degradation recall** — of wrong/ambiguous tokens, fraction the resolver did NOT call «точно».",
    "- **over-hedge rate** — of hedged cards, fraction that were actually *uniquely* correct (= moat value we",
    "  left on the table by hedging). Only gold can measure this.",
    "- **lemma accuracy** — POS-right-but-lemma-wrong still gives the wrong root family/table (R1).",
    "  Verb-citation-aware: the resolver cites the INFINITIVE (ללכת) while you cite 3ms-past (הלך);",
    "  verbs are matched on ROOT (bidirectional subsequence, weak-letter tolerant) so the convention",
    "  gap isn't mis-scored. A strict-string lemma rate is also reported for transparency.",
    "- **Nakdan-silver ↔ gold agreement** — quantifies how trustworthy Dicta is on archaic Hebrew, i.e.",
    "  retroactively validates/discounts every prior silver-based number (incl. Epic 1's 90.3%).",
    "- per-stratum + per-label breakdown; list of «exact» cards gold contradicts.",
    "",
    "## Columns",
    "`id` stable join key · `work`/`row_id` source · `surface` consonantal · `niqqud` vocalized form judged ·",
    "`sentence` vocalized context line · `offline_*` the resolver's reading (pos/lemma/root/meaning/label) ·",
    "`offline_alts` other readings it considered (`pos:meaning`) · `nakdan_pos` Dicta silver (reference, NOT",
    "truth) · `stratum` which sampling bucket · `gold_pos`/`gold_lemma`/`verdict`/`note` ← you fill.",
    "",
    "## Strata (why a row was picked)",
    "- **collision** — «exact» sitting on a multi-id homograph cell (should be ~0 post-Epic-1; verify).",
    "- **tail** — «exact» that the silver contradicts (content→function / participle→noun / name).",
    "- **hedged** — «вероятно»/guessed multi-reading cells (calibration: are we right to hedge?).",
    "- **control** — clean «exact» (catch systematic lemma errors on easy cases).",
    "- **fill** — remainder, to round out N.",
    "",
    "> Sampling is deliberately homograph-weighted, so the overall numbers are NOT corpus base-rates —",
    "> read precision **per stratum**.",
    "",
  ].join("\n");
  fs.writeFileSync(outPath, md);
}

// Verb citation convention: the resolver cites the INFINITIVE lemma (ללכת) while human gold
// cites the 3ms-past (הלך) — the SAME lexeme, two valid conventions. Compare verbs on the
// resolver's ROOT under weak-letter (אהוי) tolerance so the convention gap isn't mis-scored as
// a lexeme error (verified: it accounted for 18/18 of the POS-matching "lemma mismatches", all
// same-lexeme). Non-verbs use niqqud-insensitive lemma strings. Blank gold_lemma = POS-only.
const weakStrip = (s) => stripNiq(s).replace(/[אהוי]/g, "");
const isSubseq = (a, b) => { let i = 0; for (const ch of b) { if (a[i] === ch) i++; } return a.length > 0 && i === a.length; };
function lexemeMatch(coarsePos, offLemma, offRoot, goldLemma) {
  if (!goldLemma) return true;
  const ol = stripNiq(offLemma), gl = stripNiq(goldLemma);
  if (ol === gl) return true;
  if (coarsePos === "verb") {
    // The resolver cites the INFINITIVE / triliteral root; gold cites the 3ms-past, which may
    // carry a binyan prefix (נ niphal / ה hifil / ת hitpael) and weak-letter elisions. Same
    // lexeme ⇒ root consonants subsume — or are subsumed by — the past-form consonants.
    // Bidirectional subsequence handles strong (הלך), all-weak (היה), elided-weak (קום↔קם),
    // and prefixed (עור↔ניעור) verbs without merging distinct roots.
    const r = stripNiq(offRoot);
    if (r && (isSubseq(r, gl) || isSubseq(gl, r))) return true;
    if (weakStrip(r) && weakStrip(r) === weakStrip(gl)) return true;
    if (weakStrip(gl) && weakStrip(ol.replace(/^ל/, "")) === weakStrip(gl)) return true;
  }
  return false;
}

// Parse a (BOM/comment-tolerant) gold TSV → { col, rows, gv }. rows = arrays of cells.
function parseGoldTsv(file) {
  let raw; try { raw = fs.readFileSync(file, "utf8"); } catch (e) { console.error("cannot read gold file: " + file + " — " + e.message); process.exit(1); }
  raw = raw.replace(/^﻿/, "");
  let header = null; const rows = [];
  for (const ln of raw.split(/\r?\n/)) {
    if (!ln.trim() || ln.startsWith("#")) continue;
    if (!header) { header = ln.split("\t").map((s) => s.trim()); continue; }
    rows.push(ln.split("\t"));
  }
  if (!header) { console.error("no header row found in " + file); process.exit(1); }
  const col = {}; header.forEach((h, i) => (col[h] = i));
  for (const c of ["offline_pos", "offline_label", "gold_pos"]) if (!(c in col)) { console.error("gold file missing required column: " + c); process.exit(1); }
  const gv = (r, name) => { const i = col[name]; return i == null ? "" : String(r[i] == null ? "" : r[i]).trim(); };
  return { col, rows, gv };
}

// Build scoring records from parsed TSV rows. offline_* may be OVERRIDDEN (for --regold, where
// we re-resolve live with the current resolver while keeping the human gold columns).
function recordsFromTsv(rows, gv, overrideByIdx) {
  return rows.map((r, i) => {
    const o = (overrideByIdx && overrideByIdx[i]) || null;
    return {
      niqqud: gv(r, "niqqud"), stratum: gv(r, "stratum") || "?",
      label: o ? o.label : gv(r, "offline_label"),
      offPos: o ? o.pos : gv(r, "offline_pos"),
      offLemma: o ? o.lemma : gv(r, "offline_lemma"),
      offRoot: o ? o.root : gv(r, "offline_root"),
      goldPos: gv(r, "gold_pos"), goldLemma: gv(r, "gold_lemma"),
      nak: gv(r, "nakdan_pos"), verdict: gv(r, "verdict").toLowerCase(),
    };
  });
}

// Score records against human gold (verb-citation-aware). Pure — shared by --gold and --regold.
const HEDGED_LABELS = new Set(["likely", "guessed"]);
function computeMetrics(records) {
  let N = 0, annotated = 0, skipped = 0, ambig = 0;
  let exactN = 0, exactOK = 0, wrongN = 0, wrongHedged = 0, hedgedN = 0, hedgedUnique = 0;
  let lemmaN = 0, lemmaOK = 0, lemmaStrictOK = 0, lemmaVerbN = 0, lemmaVerbOK = 0, lemmaNonVerbN = 0, lemmaNonVerbOK = 0;
  let nakN = 0, nakOK = 0, posStrictN = 0, posStrictOK = 0;
  const byStratum = {}, byLabel = {}; const falseExacts = [];
  for (const rec of records) {
    N++;
    const { goldPos, verdict } = rec;
    if (!goldPos && !verdict) continue;             // unannotated
    if (verdict === "skip") { skipped++; continue; }
    annotated++;
    const { label, stratum, offPos, offLemma, offRoot, goldLemma, nak } = rec;
    const isAmbig = verdict === "ambig"; if (isAmbig) ambig++;
    let offlineCorrect;
    if (verdict === "ok") offlineCorrect = true;
    else if (verdict === "bad" || verdict === "badpos" || verdict === "badlemma" || verdict === "badboth") offlineCorrect = false;
    else if (isAmbig) offlineCorrect = false;       // not UNIQUELY correct
    else { const cg = coarseGold(goldPos); offlineCorrect = (coarseGold(offPos) === cg) && lexemeMatch(cg, offLemma, offRoot, goldLemma); }
    if (label === "exact") { exactN++; if (offlineCorrect && !isAmbig) exactOK++; }
    if (!offlineCorrect || isAmbig) {
      wrongN++; if (label !== "exact") wrongHedged++;
      else if (falseExacts.length < 40) falseExacts.push({ niqqud: rec.niqqud, offPos, goldPos, offLemma, goldLemma, verdict: verdict || "(derived)", stratum });
    }
    if (HEDGED_LABELS.has(label)) { hedgedN++; if (offlineCorrect && !isAmbig) hedgedUnique++; }
    if (goldLemma) {
      lemmaN++;
      const cg = coarseGold(goldPos);
      const lm = lexemeMatch(cg, offLemma, offRoot, goldLemma);
      if (lm) lemmaOK++;
      if (stripNiq(offLemma) === stripNiq(goldLemma)) lemmaStrictOK++;
      if (cg === "verb") { lemmaVerbN++; if (lm) lemmaVerbOK++; } else { lemmaNonVerbN++; if (lm) lemmaNonVerbOK++; }
    }
    if (nak && goldPos) { nakN++; if (coarseGold(nak) === coarseGold(goldPos)) nakOK++; }
    if (goldPos) { posStrictN++; if (offPos.toLowerCase() === goldPos.toLowerCase()) posStrictOK++; }
    const bs = byStratum[stratum] || (byStratum[stratum] = { n: 0, exactN: 0, exactOK: 0, wrong: 0 });
    bs.n++; if (label === "exact") { bs.exactN++; if (offlineCorrect && !isAmbig) bs.exactOK++; } if (!offlineCorrect || isAmbig) bs.wrong++;
    byLabel[label] = (byLabel[label] || 0) + 1;
  }
  return { N, annotated, skipped, ambig, exactN, exactOK, wrongN, wrongHedged, hedgedN, hedgedUnique,
    lemmaN, lemmaOK, lemmaStrictOK, lemmaVerbN, lemmaVerbOK, lemmaNonVerbN, lemmaNonVerbOK,
    nakN, nakOK, posStrictN, posStrictOK, byStratum, byLabel, falseExacts };
}

function buildReport(m, file, generatedFor) {
  return {
    generated_for: generatedFor,
    file: path.relative(REPO, path.resolve(file)),
    coverage: { totalRows: m.N, annotated: m.annotated, skipped: m.skipped, unannotated: m.N - m.annotated - m.skipped },
    headline: {
      precisionOfExact: rate(m.exactOK, m.exactN), exactN: m.exactN,
      honestDegradationRecall: rate(m.wrongHedged, m.wrongN), wrongN: m.wrongN,
      overHedgeRate: rate(m.hedgedUnique, m.hedgedN), hedgedN: m.hedgedN,
      lemmaAccuracy: rate(m.lemmaOK, m.lemmaN), lemmaN: m.lemmaN,
      lemmaAccuracyStrictString: rate(m.lemmaStrictOK, m.lemmaN),
      lemmaAccuracyVerb: rate(m.lemmaVerbOK, m.lemmaVerbN), lemmaVerbN: m.lemmaVerbN,
      lemmaAccuracyNonVerb: rate(m.lemmaNonVerbOK, m.lemmaNonVerbN), lemmaNonVerbN: m.lemmaNonVerbN,
      posStrictMatch: rate(m.posStrictOK, m.posStrictN),
    },
    silver: { nakdanGoldAgreement: rate(m.nakOK, m.nakN), nakN: m.nakN, genuineAmbiguityRate: rate(m.ambig, m.annotated), ambig: m.ambig },
    byStratum: m.byStratum, byLabel: m.byLabel, falseExactOffenders: m.falseExacts,
    caveat: "precision/recall/lemma use a VERB-CITATION-AWARE lexeme match (resolver infinitive lemma vs gold 3ms-past compared on root, weak-letter tolerant). Sampling is HOMOGRAPH-WEIGHTED — read precision PER STRATUM: control ≈ representative clean «exact»; tail = deliberately oversampled vocalized homographs.",
  };
}

function renderMetrics(m, file, reportPath, title) {
  console.log("\n══════════ reader-morph-audit · " + title + " ══════════");
  console.log("file          : " + path.relative(REPO, path.resolve(file)));
  console.log("coverage      : " + m.annotated + " scored + " + m.skipped + " skipped = " + (m.annotated + m.skipped) + " / " + m.N + " rows   (" + (m.N - m.annotated - m.skipped) + " unannotated)");
  if (!m.annotated) { console.log("\nno annotated rows yet — fill gold_pos (+ gold_lemma) and re-run.\nreport → " + path.relative(REPO, reportPath)); return; }
  console.log("⚠ HOMOGRAPH-WEIGHTED sample → read PER-STRATUM below (control≈representative, tail=oversampled hard cases); blended headline is NOT a corpus base-rate.");
  console.log("─ headline (vs HUMAN gold — non-circular) ─");
  console.log("  precision of «exact»        : " + pct(rate(m.exactOK, m.exactN)) + "  (" + m.exactOK + "/" + m.exactN + ")   ← true trust of «точно»");
  console.log("  honest-degradation recall   : " + pct(rate(m.wrongHedged, m.wrongN)) + "  (" + m.wrongHedged + "/" + m.wrongN + ")   ← of wrong/ambig, NOT «точно»");
  console.log("  over-hedge rate             : " + pct(rate(m.hedgedUnique, m.hedgedN)) + "  (" + m.hedgedUnique + "/" + m.hedgedN + ")   ← hedged but actually unique");
  console.log("  lemma/lexeme accuracy       : " + pct(rate(m.lemmaOK, m.lemmaN)) + "  (" + m.lemmaOK + "/" + m.lemmaN + ")   verb-citation-aware  (strict-string " + pct(rate(m.lemmaStrictOK, m.lemmaN)) + ")");
  console.log("    └ verb " + pct(rate(m.lemmaVerbOK, m.lemmaVerbN)) + " (" + m.lemmaVerbOK + "/" + m.lemmaVerbN + ")    non-verb " + pct(rate(m.lemmaNonVerbOK, m.lemmaNonVerbN)) + " (" + m.lemmaNonVerbOK + "/" + m.lemmaNonVerbN + ")");
  console.log("  POS strict-string match     : " + pct(rate(m.posStrictOK, m.posStrictN)) + "  (" + m.posStrictOK + "/" + m.posStrictN + ")");
  console.log("─ silver validation (how much to trust Dicta on archaic) ─");
  console.log("  Nakdan-silver ↔ gold agree  : " + pct(rate(m.nakOK, m.nakN)) + "  (" + m.nakOK + "/" + m.nakN + ")");
  console.log("  genuine ambiguity rate      : " + pct(rate(m.ambig, m.annotated)) + "  (" + m.ambig + "/" + m.annotated + ")");
  console.log("─ per-stratum (precision of «exact») ─");
  for (const s of WS_ORDER.concat(Object.keys(m.byStratum).filter((k) => WS_ORDER.indexOf(k) < 0))) {
    const b = m.byStratum[s]; if (!b) continue;
    console.log("  " + (s + "          ").slice(0, 11) + "n=" + b.n + "  exact " + b.exactOK + "/" + b.exactN + " (" + pct(rate(b.exactOK, b.exactN)) + ")  wrong=" + b.wrong);
  }
  console.log("label dist    : " + Object.entries(m.byLabel).map(([k, v]) => k + "=" + v).join("  "));
  if (m.falseExacts.length) {
    console.log("─ «exact» contradicted by gold (top) ─");
    for (const o of m.falseExacts.slice(0, 12)) console.log("  " + o.niqqud + "  off=" + o.offPos + "/" + (o.offLemma || "–") + " gold=" + o.goldPos + "/" + (o.goldLemma || "–") + " [" + o.verdict + "]");
  }
  console.log("report → " + path.relative(REPO, reportPath));
}

async function runGold(file) {
  const { rows, gv } = parseGoldTsv(file);
  const m = computeMetrics(recordsFromTsv(rows, gv, null));
  try { fs.mkdirSync(path.dirname(GOLD_REPORT), { recursive: true }); } catch (_) {}
  fs.writeFileSync(GOLD_REPORT, JSON.stringify(buildReport(m, file, "R1 gold eval (HUMAN gold vs resolver — non-circular)"), null, 2));
  renderMetrics(m, file, GOLD_REPORT, "R1 GOLD SCORE");
}

// Re-resolve each annotated gold token LIVE with the CURRENT resolver (offline only — no Dicta),
// keep the human gold columns, re-score. Turns the gold set into a fixed before/after REGRESSION
// gate for the tail-fix levers (control must not regress; tail precision + honest-recall rise).
const PAGE_RERESOLVE = `async (items) => {
  const RM = window.ReaderMorph; await RM.ensureEngine();
  const out = [];
  for (const it of items) {
    let c = null; try { c = await RM.resolveWordLight(it.surface, it.niqqud); } catch (_) { c = null; }
    out.push(c ? { label: c.label, pos: c.pos || "", lemma: c.lemma || "", root: c.root || "" } : { label: "", pos: "", lemma: "", root: "" });
  }
  return out;
}`;

async function runRegold(file) {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const { rows, gv } = parseGoldTsv(file);
  // only annotated rows need re-resolution; map back by index
  const todo = [];
  rows.forEach((r, i) => { const gp = gv(r, "gold_pos"), v = gv(r, "verdict").toLowerCase(); if ((gp || v) && v !== "skip") todo.push({ i, surface: gv(r, "surface"), niqqud: gv(r, "niqqud") }); });
  console.log("reader-morph-audit [REGOLD]: re-resolving " + todo.length + " annotated tokens live (offline, no Dicta)");

  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const overrideByIdx = {};
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.InflectionDict && !!window.NotesAutoGen && !!window.PealimFunctionLinks, { timeout: 25000 });
    await pg.evaluate(async () => { await window.ReaderMorph.ensureEngine(); });
    const BATCH = 60;
    for (let s = 0; s < todo.length; s += BATCH) {
      const items = todo.slice(s, s + BATCH);
      let res = []; try { res = await pg.evaluate("(" + PAGE_RERESOLVE + ")(" + JSON.stringify(items.map((t) => ({ surface: t.surface, niqqud: t.niqqud }))) + ")"); } catch (_) { res = []; }
      items.forEach((t, k) => { if (res[k]) overrideByIdx[t.i] = res[k]; });
      process.stdout.write("\r  re-resolved " + Math.min(s + BATCH, todo.length) + "/" + todo.length + "   ");
    }
    process.stdout.write("\n");
    if (pageErrors.length) console.error("page errors: " + pageErrors.slice(0, 3).join(" | "));
  } finally { if (!KEEP) await b.close(); await stop(srv.c); }

  const m = computeMetrics(recordsFromTsv(rows, gv, overrideByIdx));
  const REGOLD_REPORT = path.join(OUTDIR, "reader-morph-gold-regold-report.json");
  try { fs.mkdirSync(path.dirname(REGOLD_REPORT), { recursive: true }); } catch (_) {}
  fs.writeFileSync(REGOLD_REPORT, JSON.stringify(buildReport(m, file, "REGOLD — current resolver re-scored vs human gold (regression gate)"), null, 2));
  renderMetrics(m, file, REGOLD_REPORT, "REGOLD (current resolver vs gold)");
  // before/after vs the committed R1.0 baseline report
  let base = null; try { base = JSON.parse(fs.readFileSync(GOLD_REPORT, "utf8")); } catch (_) {}
  if (base && base.byStratum) {
    const d = (a, bb) => (a == null || bb == null) ? "n/a" : (((a - bb) * 100 >= 0 ? "+" : "") + ((a - bb) * 100).toFixed(1) + "pp");
    const bs = (s, r) => (r.byStratum[s] ? r.byStratum[s].exactOK + "/" + r.byStratum[s].exactN : "–");
    console.log("─ Δ vs R1.0 baseline (reader-morph-gold-report.json) ─");
    console.log("  control precision : " + bs("control", base) + " → " + bs("control", m) + "   (must NOT drop)");
    console.log("  tail precision    : " + bs("tail", base) + " → " + bs("tail", m) + "   " + d(rate((m.byStratum.tail || {}).exactOK, (m.byStratum.tail || {}).exactN), rate((base.byStratum.tail || {}).exactOK, (base.byStratum.tail || {}).exactN)));
    console.log("  honest-degr recall: " + pct(base.headline.honestDegradationRecall) + " → " + pct(rate(m.wrongHedged, m.wrongN)) + "   " + d(rate(m.wrongHedged, m.wrongN), base.headline.honestDegradationRecall));
  }
}

(async () => {
  // R1.0 scorer is a PURE file pass — no server/browser. Branch out before anything boots.
  if (GOLD_FILE) { return runGold(GOLD_FILE); }
  // REGOLD boots its own server+browser (re-resolve gold tokens live) — branch before the audit boot.
  if (REGOLD_FILE) { return runRegold(REGOLD_FILE); }
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  try { fs.mkdirSync(OUTDIR, { recursive: true }); } catch (_) {}
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (_) { cache = {}; }
  const saveCache = () => { try { fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch (_) {} };

  const rows = sampleRows(SAMPLE_ROWS);
  if (!rows.length) { console.error("no sample rows found under " + WORKS); process.exit(1); }
  const workSpan = new Set(rows.map((r) => r.work)).size;
  const modeLabel = WORKSHEET_N ? "WORKSHEET (gold producer, N=" + WORKSHEET_N + ")" : "AUDIT";
  console.log("reader-morph-audit [" + modeLabel + "]: sampled " + rows.length + " rows across " + workSpan + " works (pool " + SAMPLE_ROWS + "); oracle=" + (USE_ORACLE ? "Dicta" : "off"));

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
      // attach oracle POS to each token by surface match (+ collect ctx for Tier-3)
      const t3items = [];
      for (const r of recs) {
        let ot = null;
        if (oracleTokens) {
          const surf = r.surface;
          ot = oracleTokens.find((t) => String(t.stem || "").replace(/[֑-ׇ]/g, "") === surf || String(t.word || "").replace(/[֑-ׇ]/g, "") === surf);
        }
        r._oraclePos = (ot && ot.posDicta) || null;
        if (USE_TIER3 && ot && ot.niqqud) t3items.push({ surface: r.surface, niqqud: r.niqqud, ctx: { niqqud: ot.niqqud, posDicta: ot.posDicta, lemma: ot.lemma } });
      }
      let t3map = {};
      if (USE_TIER3 && t3items.length) {
        let t3 = []; try { t3 = await pg.evaluate("(" + PAGE_TIER3 + ")(" + JSON.stringify(t3items) + ")"); } catch (_) { t3 = []; }
        for (const x of (t3 || [])) if (x && x.surface) t3map[x.surface] = x;
      }
      for (const r of recs) tokens.push({ ...r, work: row.work, row_id: row.row_id, sentence: row.he_niqqud, sentencePlain: row.he, oraclePos: r._oraclePos, tier3: t3map[r.surface] || null });
      if ((i + 1) % 25 === 0 || i === rows.length - 1) process.stdout.write("\r  resolved " + (i + 1) + "/" + rows.length + " rows, " + tokens.length + " tokens   ");
    }
    process.stdout.write("\n");
    saveCache();
    if (pageErrors.length) console.error("page errors: " + pageErrors.slice(0, 3).join(" | "));
  } finally { if (!KEEP) await b.close(); await stop(srv.c); }

  // ── R1.0 worksheet producer — emit gold TSV + legend, then stop (skip audit metrics) ──
  if (WORKSHEET_N) {
    try { fs.mkdirSync(GOLD_DIR, { recursive: true }); } catch (_) {}
    writeLegend(LEGEND);
    emitWorksheet(tokens, WORKSHEET_N, OUT_OVERRIDE || WORKSHEET, FORCE);
    return;
  }

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

  // ── Tier-3 simulation (opt-in context path) — tail COVERAGE + REGRESSION guard ──
  let tier3M = null;
  if (USE_TIER3) {
    const wT3 = tokens.filter((t) => t.tier3 && t.tier3.label);
    const ctxAccepted = wT3.filter((t) => t.tier3.contextUsed);
    // tail = offline false-exact (label exact but POS disagrees with Dicta context)
    const tail = wT3.filter((t) => t.label === "exact" && t.oraclePos && coarse(t.oraclePos) && coarse(t.pos) !== coarse(t.oraclePos));
    const tailFixed = tail.filter((t) => coarse(t.tier3.pos) === coarse(t.oraclePos));
    // "honest" = Tier-3 either FIXED the POS or SOFTENED off «точно» (participle-soften) → no
    // remaining false certainty. Softened = still POS-disagree but label no longer exact.
    const tailSoftened = tail.filter((t) => coarse(t.tier3.pos) !== coarse(t.oraclePos) && t.tier3.label && t.tier3.label !== "exact");
    const tailHonest = tail.filter((t) => coarse(t.tier3.pos) === coarse(t.oraclePos) || (t.tier3.label && t.tier3.label !== "exact"));
    // regression (NON-circular) = offline-correct exact that Tier-3 flips to disagree with Dicta
    const okExact = wT3.filter((t) => t.label === "exact" && t.oraclePos && coarse(t.pos) === coarse(t.oraclePos));
    const regressed = okExact.filter((t) => t.tier3.contextUsed && coarse(t.tier3.pos) && coarse(t.tier3.pos) !== coarse(t.oraclePos));
    // ambiguous «вероятно» (form-first likely) cards Tier-3 upgrades to a context reading
    const ambCards = wT3.filter((t) => t.label === "likely" && t.channel === "form-first");
    const ambUpgraded = ambCards.filter((t) => t.tier3.contextUsed);
    const tailMiss = tail.filter((t) => coarse(t.tier3.pos) !== coarse(t.oraclePos)).slice(0, 20)
      .map((t) => ({ niqqud: t.niqqud, offline: t.pos, dicta: t.oraclePos, tier3: t.tier3.pos, tier3label: t.tier3.label }));
    tier3M = {
      evaluated: wT3.length, contextAccepted: ctxAccepted.length,
      tailFalseExact: tail.length, tailFixed: tailFixed.length, tailFixRate: tail.length ? tailFixed.length / tail.length : null,
      tailSoftened: tailSoftened.length, tailHonest: tailHonest.length, tailHonestRate: tail.length ? tailHonest.length / tail.length : null,
      offlineCorrectExact: okExact.length, regressed: regressed.length,
      ambiguousCards: ambCards.length, ambiguousUpgraded: ambUpgraded.length, tailMissSample: tailMiss,
      caveat: "Tier-3 USES Dicta → precision-vs-Dicta is circular; the honest signals are COVERAGE (tailFixRate, conservative pickContextReading accept) + REGRESSION (regressed, non-circular).",
    };
  }

  // worst structural offenders (exact on multi-id cell) — for the report
  const collOffenders = ffCollision.slice(0, 25).map((t) => ({ surface: t.surface, niqqud: t.niqqud, pos: t.pos, pealim_id: t.pealim_id, meaning: t.meaning, idsCount: t.coll.n, oraclePos: t.oraclePos || null }));

  const labelDist = {};
  for (const t of tokens) labelDist[t.label] = (labelDist[t.label] || 0) + 1;

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
    tier3: tier3M,
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
  if (tier3M) {
    console.log("─ Tier-3 simulation (opt-in context path; uses cached Dicta, no new network) ─");
    console.log("  tokens re-resolved w/ context : " + tier3M.evaluated + "  (context accepted: " + tier3M.contextAccepted + ")");
    console.log("  TAIL false-exact fixed        : " + tier3M.tailFixed + "/" + tier3M.tailFalseExact + "  (" + pct(tier3M.tailFixRate) + ")   ← POS corrected");
    console.log("  TAIL made HONEST (fix+soften) : " + tier3M.tailHonest + "/" + tier3M.tailFalseExact + "  (" + pct(tier3M.tailHonestRate) + ")   ← no false «точно» (soften " + tier3M.tailSoftened + ")");
    console.log("  ⚠ REGRESSIONS (broke good)    : " + tier3M.regressed + "/" + tier3M.offlineCorrectExact + "   ← must stay ~0 (non-circular)");
    console.log("  «вероятно» cards upgraded     : " + tier3M.ambiguousUpgraded + "/" + tier3M.ambiguousCards);
    if (tier3M.tailMissSample.length) {
      console.log("  ─ tail STILL missed by Tier-3 (sample) ─");
      for (const m of tier3M.tailMissSample.slice(0, 8)) console.log("    " + m.niqqud + "  off=" + m.offline + " dicta=" + m.dicta + " → tier3=" + m.tier3 + " (" + m.tier3label + ")");
    }
  }
  if (collOffenders.length) {
    console.log("─ top structural offenders (exact sold on a multi-id cell) ─");
    for (const o of collOffenders.slice(0, 8)) console.log("  " + o.niqqud + "  pos=" + o.pos + " ids=" + o.idsCount + " → «" + (o.meaning || "").slice(0, 24) + "»" + (o.oraclePos ? " [Dicta:" + o.oraclePos + "]" : ""));
  }
  console.log("report → " + path.relative(REPO, REPORT));
  console.log("P1.0 is measurement only — no floor enforced (exit 0). Numbers set the P1.1 floor (D2).");
})().catch((e) => { console.error("fatal", e); process.exit(1); });
