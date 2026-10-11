#!/usr/bin/env node
"use strict";
// Word-layer Ф0 probe — measures variant A (Dicta addmorph + offline Pealim) on a real
// learning card against the owner's manual ChatGPT analysis (a SECOND OPINION, not gold).
// Canon: docs/planning/WORD_LAYER_RESEARCH_AND_PLAN_2026_10_11.md
//
// Usage:
//   node scripts/word-layer/f0-probe.cjs --xlsx "<02_Иврит_Подробный_разбор.xlsx>" \
//        [--out docs/planning/word-layer/f0] [--evidence <dir outside the repo>] [--cache <dir>] [--batch 12]
//
// tokens.tsv carries the whole source transcript + the ChatGPT analysis, so it goes to --evidence
// (default: OS temp), NOT into the public repo; only aggregate metrics are written to --out.
//
// Dicta etiquette (feedback_bulk_dicta_bake_ratelimit): concurrency ≤2, circuit-breaker,
// responses cached on disk so a rerun never re-hits Dicta.

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const https = require("https");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { _parseToken, stripNiqqud } = require("../../db/premium/providers/dictaMorph");
// Production resolver (the one behind the tap morph-card / ②-notes), evaluated side by side (Ф1 recon).
const NotesAutoGen = require("../../public/js/notes-autogen.js");

const ROOT = path.resolve(__dirname, "../..");
const DICTA_URL = process.env.DICTA_NAKDAN_URL || "https://nakdan-5-1.loadbalancer.dicta.org.il/api";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const XLSX = arg("xlsx");
const OUT = path.resolve(ROOT, arg("out", "docs/planning/word-layer/f0"));
const CACHE = arg("cache", path.join(os.tmpdir(), "word-layer-f0-cache"));
const BATCH = Number(arg("batch", 12));
const EVIDENCE = arg("evidence", path.join(os.tmpdir(), "word-layer-f0-evidence"));
if (!XLSX) { console.error("--xlsx required"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });

// ── XLSX (inline-string sheets written by the prototype generator) ─────────
function readWorkbook(file) {
  const zip = new AdmZip(file);
  const txt = (p) => zip.readAsText(p, "utf8");
  const wb = txt("xl/workbook.xml");
  const rels = txt("xl/_rels/workbook.xml.rels");
  const relMap = {};
  for (const m of rels.matchAll(/<[^>]*Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]); const t = /Target="([^"]+)"/.exec(m[0]);
    if (id && t) relMap[id[1]] = t[1].replace(/^\//, "").replace(/^(?!xl\/)/, "xl/");
  }
  const sheets = {};
  for (const m of wb.matchAll(/<x:sheet name="([^"]+)" sheetId="\d+" r:id="([^"]+)"/g)) sheets[m[1]] = relMap[m[2]];
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  function rows(name) {
    const x = txt(sheets[name]);
    const out = [];
    for (const rm of x.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)) {
      const row = {};
      for (const cm of rm[1].matchAll(/<x:c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/x:c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(cm[1]);
        const body = cm[2] || "";
        const t = /<x:t[^>]*>([\s\S]*?)<\/x:t>/.exec(body) || /<x:v>([\s\S]*?)<\/x:v>/.exec(body);
        if (ref) row[ref[1]] = t ? unesc(t[1]) : "";
      }
      out.push(row);
    }
    return out;
  }
  return { rows, sheetNames: Object.keys(sheets) };
}

// ── normalization ──────────────────────────────────────────────────────────
const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const letters = (s) => String(s || "").normalize("NFC").replace(/[״"׳']/g, "").replace(/[^א-תA-Za-z0-9]/g, "");
const cons = (s) => letters(stripNiqqud(s)).replace(/[ךםןףץ]/g, (c) => FINALS[c]);
const loose = (s) => { const c = cons(s); const l = c.replace(/[וי]/g, ""); return l.length >= 2 ? l : c; };
// vocalized comparison: drop dagesh/meteg/rafe/shin-sin dots + qamats-qatan variants, keep vowels
const voc = (s) => String(s || "").normalize("NFD").replace(/[ּֽֿׁׂ֑-֯|־]/g, "")
  .replace(/ׇ/g, "ָ").replace(/[^ְ-ֻא-ת]/g, "").replace(/[ךםןףץ]/g, (c) => FINALS[c]);

// ── Dicta (batched, cached, ≤2 concurrency, breaker) ───────────────────────
function post(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(DICTA_URL, { method: "POST", timeout: 30000, headers: {
      "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "User-Agent": "Mozilla/5.0" } }, (res) => {
      let d = ""; res.setEncoding("utf8"); res.on("data", (c) => (d += c));
      res.on("end", () => { if (res.statusCode >= 400) return reject(Object.assign(new Error("HTTP " + res.statusCode), { status: res.statusCode }));
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("bad JSON")); } });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(payload); req.end();
  });
}
let consecutiveFail = 0;
async function dicta(text) {
  const key = crypto.createHash("sha256").update("modern\0" + text).digest("hex").slice(0, 32);
  const f = path.join(CACHE, key + ".json.gz");
  if (fs.existsSync(f)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8"));
  for (let attempt = 0; attempt < 4; attempt++) {
    if (consecutiveFail >= 5) throw new Error("circuit open: Dicta failing repeatedly");
    try {
      const data = await post({ task: "nakdan", genre: "modern", data: text, addmorph: true, keepqq: false });
      if (!Array.isArray(data)) throw new Error("non-array");
      consecutiveFail = 0;
      fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(data)));
      return data;
    } catch (e) {
      consecutiveFail++;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  throw new Error("Dicta failed after retries");
}
async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}

// ── Pealim join v2 (F0 finding: v1 loose/POS-blind join caused most wrong paradigms) ──
// Rules: exact consonant key first; a loose (ktiv male/haser) key is accepted ONLY with cell
// evidence (a paradigm cell spelled like the token stem); POS-gated; Dicta's ל״ה verb lemmas end
// in י (ראי = ראה); hufal/pual live as `passive-*` cells of the hifil/piel paradigm; personal
// pronouns are canonicalised by Dicta to אני/הוא, so the learner-facing lemma is the stem itself.
function loadPealim() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
  const P = d.paradigms.filter((p) => !/^Conjugation of/.test(p.lemma || ""));
  const ix = { exact: new Map(), loose: new Map(), formExact: new Map() };
  const add = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  P.forEach((p, i) => {
    const keys = [p.lemma, p.lemma_niqqud];
    if (p.kind === "verb") { if (p.root) keys.push(p.root); if (p.cells && p.cells["PERF-3ms"]) keys.push(p.cells["PERF-3ms"].he); }
    for (const k of new Set(keys.map(cons))) add(ix.exact, k, i);
    for (const k of new Set(keys.map(loose))) add(ix.loose, k, i);
    for (const [ck, cv] of Object.entries(p.cells || {})) add(ix.formExact, cons(cv.he), [i, ck]);
  });
  return { P, ix, model: d.model_version, raw: d };
}
const PASSIVE_OF = { hufal: "hifil", pual: "piel" };
const CLOSED = new Set(["pronoun", "adverb", "preposition", "conjunction", "interrogative", "negation"]);
// Pealim table types: prepositions keep a suffix table (P-1s…), personal pronouns a pronoun set (1s…).
const tableType = (p) => { const k = Object.keys(p.cells || {}); if (!k.length) return "invariant";
  if (k.every((c) => /^P-/.test(c))) return "prep-suffix"; if (k.includes("1s") && !k.includes("s")) return "pronoun-set"; return p.kind; };
function kindOk(p, dpos, binyan) {
  const t = tableType(p);
  if (dpos === "verb") return p.kind === "verb" && (!binyan || p.binyan === (PASSIVE_OF[binyan] || binyan));
  if (dpos === "noun") return t === "noun" && p.pos === "noun";
  if (dpos === "adjective") return t === "noun" && p.pos === "adjective";
  if (dpos === "numeral") return t === "invariant";
  if (dpos === "propernoun") return false;
  if (dpos === "preposition" || dpos === "negation") return t === "prep-suffix" || t === "invariant";
  if (dpos === "pronoun") return t === "pronoun-set" || t === "invariant" || t === "prep-suffix";
  if (CLOSED.has(dpos)) return t === "invariant";
  return true;
}
// Unmapped Dicta POS codes (inferred from F0 examples; dictaMorphId.js does not name them yet):
// 12 abbreviation · 16 interjection · 18 quantifier/determiner · 19 existential יש/אין ·
// 20 modal יכול/צריך/אפשר · 21 particle אי · 26 participle-like · 27 copula היה · 29 title מר/רב.
function codeOk(p, code) {
  const t = tableType(p);
  if (code === 12) return false;
  if (code === 27) return p.kind === "verb";
  if (code === 20) return p.kind === "verb" || p.pos === "adjective" || t === "invariant";
  if (code === 26) return p.kind === "verb" || p.pos === "adjective";
  if (code === 29) return t === "noun";
  return t === "invariant" || t === "prep-suffix" || t === "pronoun-set"; // 16 18 19 21
}
function featKey(f, passive) {
  if (!f || !f.tense) return null;
  const T = { past: "PERF", future: "IMPF", imperative: "IMP", infinitive: "INF", present: "AP" }[f.tense];
  if (!T) return null;
  const pre = passive ? "passive-" : "";
  if (T === "INF") return "INF-L";
  if (T === "AP") return `${pre}AP-${f.gender === "f" ? "f" : "m"}${f.number === "pl" ? "p" : "s"}`;
  const pn = `${f.person || ""}${f.person === "1" ? "" : (f.gender === "f" ? "f" : "m")}${f.number === "pl" ? "p" : "s"}`;
  return `${pre}${T}-${pn}`;
}
const PERSONAL = new Set(["אני", "הוא", "את", "אתה"]);
function displayLemma(tok) {
  if (cons(tok.prefix).endsWith("ש") && cons(tok.lemma) === "ל" && tok.posDicta === "preposition") return "של";
  if (tok.posDicta === "pronoun" && PERSONAL.has(cons(tok.lemma)) && cons(tok.stem) !== cons(tok.lemma)) return stripNiqqud(tok.stem);
  return tok.lemma;
}
function resolve(pe, tok) {
  if (!tok || !tok.lemma) return { method: "none" };
  const dpos = tok.posDicta;
  const stemC = displayLemma(tok) === "של" ? cons("ש" + tok.stem) : cons(tok.stem);
  const passive = !!PASSIVE_OF[tok.binyan];
  const niqStem = voc(String(tok.niqqudRaw || tok.niqqud).split("|").pop());
  const want = featKey(tok.feats, passive);
  const lem = displayLemma(tok);
  const keys = [cons(lem)];
  if (CLOSED.has(dpos) && cons(tok.stem) !== cons(lem)) keys.push(cons(tok.stem)); // lexicalised באמת/בעצם/בכלל
  if (dpos === "verb" && /י$/.test(cons(lem))) keys.push(cons(lem).replace(/י$/, "ה"));
  const stemLoose = loose(tok.stem);
  const cellEvidence = (i) => {
    let best = null;
    for (const [ck, cv] of Object.entries(pe.P[i].cells || {})) {
      const c = cons(cv.he).replace(/־$/, "");
      // loose (ktiv male/haser) spelling is weak evidence: only for content words, never for suffix tables
      const weakOk = tableType(pe.P[i]) === "noun" || pe.P[i].kind === "verb";
      const lvl = voc(cv.he) === niqStem ? 3 : c === stemC ? 2 : (weakOk && loose(cv.he) === stemLoose) ? 1 : 0;
      if (!lvl) continue;
      const sc = lvl + (ck === want ? 0.5 : 0);
      if (!best || sc > best.sc) best = { ck, lvl, sc };
    }
    return best;
  };
  const code = tok.morphId ? Number((BigInt(tok.morphId) >> 16n) & 0x1Fn) : 0;
  const gate = (i) => (dpos ? kindOk(pe.P[i], dpos, tok.binyan) : codeOk(pe.P[i], code));
  const closedLike = CLOSED.has(dpos) || dpos === "numeral" || (!dpos && code !== 27 && code !== 20 && code !== 26);
  const exact = new Set(keys.flatMap((k) => pe.ix.exact.get(k) || []).filter(gate));
  const looseC = keys.flatMap((k) => pe.ix.loose.get(loose(k)) || []).filter(gate);
  // a loose-key candidate needs cell evidence, or must be an invariant closed-class word
  // a loose-key candidate needs STRONG cell evidence (exact spelling or vocalization), or must be invariant closed-class
  const pool = new Set([...exact, ...looseC.filter((i) => (cellEvidence(i) || {}).lvl >= 2 || (tableType(pe.P[i]) === "invariant" && closedLike))]);
  let method = "lemma";
  let cands = [...pool];
  if (!cands.length && dpos === "adverb") { // adverb with only an adjective entry (פשוט «просто») → related, flagged
    method = "related-adjective";
    cands = [...new Set(keys.flatMap((k) => pe.ix.exact.get(k) || []))].filter((i) => pe.P[i].pos === "adjective");
  }
  if (!cands.length && dpos !== "propernoun" && !closedLike) { // form-first: vocalization must match exactly
    method = "form-exact";
    cands = [...new Set((pe.ix.formExact.get(stemC) || []).map(([i]) => i))].filter(gate).filter((i) => (cellEvidence(i) || {}).lvl === 3);
    if (!cands.length && dpos === "adjective") { // lexicalised participle → verb AP cell
      method = "participle-ap";
      cands = [...new Set((pe.ix.formExact.get(stemC) || []).filter(([, ck]) => /AP-/.test(ck)).map(([i]) => i))];
    }
  }
  if (!cands.length) return { method: "none", lemmaOut: lem };
  let pick = null;
  for (const i of cands) {
    const c = cellEvidence(i);
    const s = (c ? c.sc * 10 : 0) + (exact.has(i) ? 1 : 0);
    if (!pick || s > pick.s) pick = { i, s, c };
  }
  if (method === "lemma") method = exact.has(pick.i) ? "lemma-exact" : "lemma-loose+cell";
  const p = pe.P[pick.i];
  if (pick.c && tableType(p) === "prep-suffix" && cons(p.lemma) === stemC) pick.c = null; // bare preposition = base form
  const hasCells = Object.keys(p.cells || {}).length > 0;
  return { method, lemmaOut: lem, ambiguous: cands.length > 1, pid: p.pealim_id, plemma: p.lemma, p3ms: p.cells && p.cells["PERF-3ms"] ? p.cells["PERF-3ms"].he : "",
    pkind: p.kind, ppos: p.pos, pbinyan: p.binyan || "", meaning: p.meaning || "", cell: pick.c ? pick.c.ck : "",
    cellLevel: pick.c ? (pick.c.lvl === 3 ? "vocalized" : pick.c.lvl === 2 ? "consonantal" : "loose")
      : !hasCells ? "invariant" : (cons(p.lemma) === stemC || tableType(p) === "prep-suffix") ? "base" : "not-found",
    featAgree: pick.c && want ? pick.c.ck === want : null };
}

// ── gold (ChatGPT second opinion) mapping ──────────────────────────────────
const POS_RU = { "Глагол": "verb", "Существительное": "noun", "Прилагательное": "adjective", "Наречие": "adverb",
  "Предлог": "preposition", "Местоимение": "pronoun", "Союз": "conjunction", "Имя собственное": "propernoun",
  "Числительное": "numeral", "Частица": "particle", "Определитель": "determiner", "Междометие": "interjection" };
const BIN_RU = { "Пааль": "paal", "Нифъаль": "nifal", "Пиэль": "piel", "Пуаль": "pual", "Хифъиль": "hifil", "Хуфъаль": "hufal", "Хитпаэль": "hitpael" };
const goldPrefix = (s) => [...String(s || "").matchAll(/([א-ת]+)[־-]/g)].map((m) => m[1]).join("");

// ── production resolver (NotesAutoGen core, dataset-index lookup == InflectionDict.lookup) ──
let _maps = null, _byPid = null;
async function prodResolve(pe, tok) {
  if (!_maps) {
    _maps = NotesAutoGen.buildResolverMaps(pe.raw.paradigms);
    _byPid = new Map(pe.raw.paradigms.map((p) => [String(p.pealim_id), p]));
  }
  const unit = NotesAutoGen.dictaTokenToUnit(Object.assign({}, tok, { niqqud: tok.niqqudRaw ? String(tok.niqqudRaw).replace(/\|/g, "") : tok.niqqud }));
  if (!unit) return { pid: "", lemma: "", meaning: "", channel: "skip", status: "", conf: "", ambiguous: false };
  const lookup = (key, binyan) => { const i = pe.raw.index[String(key) + " " + String(binyan || "")]; return i != null ? pe.raw.paradigms[i] : null; };
  const base = await NotesAutoGen.pickBaseParadigm(unit, lookup);
  const res = NotesAutoGen.resolveContentUnit(_maps, unit, base);
  const p = res.pealim_id ? _byPid.get(String(res.pealim_id)) : null;
  return { pid: res.pealim_id || "", lemma: p ? p.lemma : "", meaning: res.meaning || "", channel: res.channel, status: res.status, conf: res.confidence, ambiguous: res.ambiguous };
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  const wb = readWorkbook(XLSX);
  const src = wb.rows("Исходник").filter((r) => /^\d+$/.test(r.A || "")).map((r) => ({ n: +r.A, he: r.B || "" }));
  const gold = wb.rows("Разбор").filter((r) => /^R\d{4}W\d{3}$/.test(r.Q || "")).map((r) => ({
    id: r.Q, line: +r.Q.slice(1, 5), w: +r.Q.slice(6), surface: r.C || "", goldNiq: r.D || "", ctx: r.F || "",
    lemma: r.G || "", pos: r.H || "", binyan: r.I || "", morph: r.K || "", prefix: r.L || "", status: r.N || "" }));
  const pe = loadPealim();
  console.log(`source lines ${src.length}, gold tokens ${gold.length}, pealim paradigms ${pe.P.length}`);

  // batches of lines joined by \n (context across ASR line breaks, fewer requests)
  const batches = [];
  for (let i = 0; i < src.length; i += BATCH) batches.push(src.slice(i, i + BATCH));
  let done = 0;
  const perLine = new Map();
  await pool(batches, 2, async (b) => {
    const data = await dicta(b.map((l) => l.he.replace(/\n/g, " ")).join("\n"));
    let li = 0; let cur = [];
    for (const t of data) {
      const nl = t.sep ? (String(t.word).match(/\n/g) || []).length : 0;
      if (nl) {
        perLine.set(b[li].n, cur);
        for (let k = 1; k < nl && li + k < b.length; k++) perLine.set(b[li + k].n, []); // blank lines
        li += nl; cur = [];
        continue;
      }
      cur.push(t);
    }
    if (li < b.length) perLine.set(b[li].n, cur);
    for (const l of b) if (!perLine.has(l.n)) perLine.set(l.n, []);
    if (++done % 10 === 0) console.log(`dicta ${done}/${batches.length}`);
  });

  // align gold whitespace tokens ↔ Dicta pieces by letter stream, per line
  const rows = [];
  const byLine = new Map();
  for (const g of gold) { if (!byLine.has(g.line)) byLine.set(g.line, []); byLine.get(g.line).push(g); }
  for (const [ln, gtoks] of byLine) {
    const pieces = (perLine.get(ln) || []).map((t) => ({ t, L: letters(stripNiqqud(t.word)) })).filter((p) => p.L);
    let pi = 0;
    for (const g of gtoks) {
      const want = letters(stripNiqqud(g.surface));
      let acc = "", used = [];
      while (pi < pieces.length && acc.length < want.length) { acc += pieces[pi].L; used.push(pieces[pi]); pi++; }
      const aligned = acc === want;
      if (!aligned) { // resync: rewind and search forward for the token
        pi -= used.length; used = []; acc = "";
        const j = pieces.findIndex((p, k) => k >= pi && p.L === want);
        if (j >= 0) { pi = j + 1; used = [pieces[j]]; acc = want; }
      }
      const analyzed = used.filter((u) => !u.t.sep);
      const tok = analyzed.length === 1 ? _parseToken(analyzed[0].t) : null;
      if (tok) tok.niqqudRaw = analyzed[0].t.options && analyzed[0].t.options[0] ? analyzed[0].t.options[0][0] : "";
      const r = tok ? resolve(pe, tok) : { method: "none" };
      r.prod = tok ? await prodResolve(pe, tok) : null;
      rows.push({ g, aligned: acc === want, pieces: used.length, tok, r });
    }
  }

  // ── metrics ─────────────────────────────────────────────────────────────
  const M = {}; const inc = (k, by = 1) => (M[k] = (M[k] || 0) + by);
  const strat = {};
  const sInc = (s, k) => { strat[s] = strat[s] || {}; strat[s][k] = (strat[s][k] || 0) + 1; };
  for (const x of rows) {
    const { g, tok, r } = x;
    const gpos = POS_RU[g.pos] || (g.pos ? "other:" + g.pos : "none");
    const S = gpos;
    inc("tokens"); sInc(S, "tokens");
    if (x.aligned) inc("aligned");
    if (!tok) { inc("no_dicta_analysis"); sInc(S, "no_dicta_analysis"); continue; }
    inc("analyzed"); sInc(S, "analyzed");
    // prefix
    const gp = goldPrefix(g.prefix), dp = cons(tok.prefix);
    if (gp === dp) inc("prefix_agree"); else if (!gp && dp === "ה") inc("prefix_article_only_dicta");
    // lemma
    const gl = new Set(g.lemma.split("/").map((s) => loose(s)).filter(Boolean));
    const lemmaRaw = gl.has(loose(tok.lemma));
    const lemmaAgree = lemmaRaw || gl.has(loose(r.lemmaOut || "")) || (r.plemma && (gl.has(loose(r.plemma)) || gl.has(loose(r.p3ms || ""))));
    if (gl.size && lemmaRaw) inc("lemma_agree_raw_dicta");
    if (r.plemma && gl.size) { inc("pealim_vs_gold_compared"); if (gl.has(loose(r.plemma)) || gl.has(loose(r.p3ms || ""))) inc("pealim_lemma_matches_gold"); }
    if (gl.size) { inc("gold_has_lemma"); sInc(S, "gold_has_lemma"); if (lemmaAgree) { inc("lemma_agree"); sInc(S, "lemma_agree"); } }
    // pos
    if (gpos !== "none") { inc("pos_compared"); if (gpos === tok.posDicta) inc("pos_agree"); }
    // binyan
    if (BIN_RU[g.binyan]) { inc("binyan_compared"); if (BIN_RU[g.binyan] === tok.binyan) inc("binyan_agree"); }
    // pealim
    if (r.method !== "none") { inc("pealim_paradigm"); sInc(S, "pealim_paradigm"); inc("pealim_by_" + r.method); }
    if (r.cell) { inc("pealim_cell"); sInc(S, "pealim_cell"); inc("pealim_cell_" + r.cellLevel); }
    if (r.cellLevel === "invariant") { inc("pealim_invariant"); sInc(S, "pealim_cell"); }
    if (r.featAgree === true) inc("cell_feat_agree"); if (r.featAgree === false) inc("cell_feat_disagree");
    if (r.meaning) inc("ru_meaning");
  }
  M.elapsed_s = Math.round((Date.now() - t0) / 1000);
  M.dicta_requests = batches.length;
  M.pealim_model = pe.model;
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ M, strat }, null, 2));

  // per-token TSV (evidence)
  const H = ["token_id", "line", "w", "surface", "aligned", "gold_lemma", "gold_pos", "gold_binyan", "gold_prefix", "gold_ctx", "gold_status",
    "dicta_niqqud", "dicta_prefix", "dicta_lemma", "dicta_morph_id", "dicta_pos_code", "dicta_pos", "dicta_binyan", "dicta_feats", "display_lemma", "pealim_method", "pealim_id", "pealim_lemma",
    "pealim_meaning", "pealim_cell", "cell_level", "cell_feat_agree",
    "prod_pid", "prod_lemma", "prod_meaning", "prod_channel", "prod_status", "prod_conf", "prod_ambiguous"];
  const esc = (v) => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
  const lines = [H.join("\t")];
  for (const { g, aligned, tok, r } of rows) {
    lines.push([g.id, g.line, g.w, g.surface, aligned ? 1 : 0, g.lemma, g.pos, g.binyan, goldPrefix(g.prefix), g.ctx, g.status,
      tok ? tok.niqqudRaw : "", tok ? cons(tok.prefix) : "", tok ? tok.lemma : "", tok ? tok.morphId : "",
      tok && tok.morphId ? Number((BigInt(tok.morphId) >> 16n) & 0x1Fn) : "", tok ? tok.posDicta : "", tok ? tok.binyan : "",
      tok && tok.feats ? Object.values(tok.feats).filter(Boolean).join(",") : "", r.lemmaOut || "", r.method, r.pid || "", r.plemma || "", r.meaning || "",
      r.cell || "", r.cellLevel || "", r.featAgree == null ? "" : r.featAgree ? 1 : 0,
      ...(r.prod ? [r.prod.pid, r.prod.lemma, r.prod.meaning, r.prod.channel, r.prod.status, r.prod.conf, r.prod.ambiguous ? 1 : 0]
        : ["", "", "", "", "", "", ""])].map(esc).join("\t"));
  }
  fs.writeFileSync(path.join(EVIDENCE, "tokens.tsv"), lines.join("\n") + "\n");
  console.log("evidence: " + path.join(EVIDENCE, "tokens.tsv"));

  console.log(JSON.stringify(M, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
