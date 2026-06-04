#!/usr/bin/env node
"use strict";

// build-notes-from-bundle.js — exhaustive ② word-note quality test + bundle
// enrichment. Reads an OPFS library ZIP, runs Dicta morphology per sentence
// (context-faithful), resolves each distinct analysis-unit through the SAME
// Pealim resolver the app uses (+ the page-title meaning gloss), then:
//   1) emits word_study notes (with «Перевод») into library/notes_advanced.json
//      and repackages → <out>.zip (importable: notes + Knowledge-Map data),
//   2) writes a QA defect report (PASS / SUSPECT / FAIL by class).
//
//   node scripts/premium/build-notes-from-bundle.js \
//     --zip C:/Users/lletp/Downloads/test.zip --out .tmp/test-enriched.zip \
//     [--limit N] [--dedup word|lemma] [--no-zip]
//
// Politeness: Pealim via the gateway limiter (≤2 concurrent + gap); Dicta via a
// small local pool. Dicta + resolve results are cached on disk for resume.

const fs = require("fs");
const path = require("path");
const JSZip = require("../../public/db/jszip.min.js");
const dicta = require("../../db/premium/providers/dictaMorph");
const { inflect } = require("../../db/premium/inflectionGateway");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");

// ── args ──────────────────────────────────────────────────────────────────
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true) : def; }
const ZIP_IN = String(arg("zip", "C:/Users/lletp/Downloads/test.zip"));
const OUT_ZIP = String(arg("out", path.join(TMP, "test-enriched.zip")));
const LIMIT = Number(arg("limit", 0)) || 0;          // 0 = all texts
const DEDUP = String(arg("dedup", "word"));          // word (per-text) | lemma (global)
const NO_ZIP = !!arg("no-zip", false);
const DICTA_CONC = Number(process.env.DICTA_CONC || 6);

const log = (...a) => console.log("[bundle]", ...a);

// ── tiny concurrency pool ───────────────────────────────────────────────────
async function pool(items, n, worker, onTick) {
  const out = new Array(items.length);
  let idx = 0, done = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      try { out[i] = await worker(items[i], i); } catch (e) { out[i] = { __err: String(e && e.message || e) }; }
      done++;
      if (onTick && done % 50 === 0) onTick(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

// ── Dicta token → resolution inputs (mirror of client v3MorphTokenToResult) ──
const NIQQUD_RE = /[֑-ׇ]/g;
function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }
const CONTENT_INFLECTS = new Set(["", "verb", "noun", "adjective", "preposition"]);
function queryLemma(pos, root, lemma, stem) {
  return CONTENT_INFLECTS.has(pos) ? (root || lemma || stem) : (stem || lemma);
}

// ── offline Pealim dict → «Перевод» fallback (B0.1) ─────────────────────────
// When the LIVE resolve yields no gloss (transient miss / key the live resolver
// couldn't match but the multi-alias dict can), fill `meaning` from the shipped
// Pealim dataset. Real Pealim glosses only — never fabricated (R1). Keyed by plain
// root / lemma / highlighted form; binyan- then pos-preferred to avoid homograph drift.
function loadOfflineMeaning() {
  const p = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
  const alias = new Map();   // base key (root/lemma/form) → [{ binyan, pos, meaning }]
  const cell = new Map();    // inflected surface form (consonantal) → [{ binyan, pos, meaning }]
  const formIdx = new Map(); // VOCALIZED cell form (normVowels) → [{ binyan, pos, meaning, pealim_id }]
  try {
    const d = JSON.parse(require("zlib").gunzipSync(fs.readFileSync(p)).toString("utf8"));
    const push = (map, kk, par) => {
      if (!kk) return; if (!map.has(kk)) map.set(kk, []);
      const list = map.get(kk);
      if (!list.some((x) => x.binyan === (par.binyan || "") && x.meaning === par.meaning)) list.push({ binyan: par.binyan || "", pos: par.pos || "", meaning: par.meaning });
    };
    const pushForm = (kk, par) => {
      if (!kk) return; if (!formIdx.has(kk)) formIdx.set(kk, []);
      const list = formIdx.get(kk);
      if (!list.some((x) => x.pealim_id === par.pealim_id)) list.push({ binyan: par.binyan || "", pos: par.pos || "", meaning: par.meaning || "", pealim_id: par.pealim_id || null });
    };
    for (const par of d.paradigms || []) {
      if (!par) continue;
      if (par.meaning) { for (const k of [par.root, par.lemma, par.form]) push(alias, stripNiqqud(k), par); }
      // inflected cells: a participle Dicta cross-tags as a noun (כותב, עובד) is the
      // AP-ms cell of its verb paradigm — the cell's gloss IS the right «Перевод».
      if (par.cells) for (const ck of Object.keys(par.cells)) {
        const c = par.cells[ck]; if (!c || !c.he) continue;
        if (par.meaning) push(cell, stripNiqqud(c.he), par);
        // niqqud-preserving form index — the decisive signal for same-spelling homographs
        // (only niqqud / pealim_id can tell מילים «слова» from מילוי «наполнитель»).
        pushForm(normVowels(c.he), par);
      }
    }
  } catch (e) { log("offline-dict meaning load failed:", String(e && e.message || e)); }
  return { alias, cell, formIdx };
}

// Form-first paradigm pick: the unit's VOCALIZED form is a cell of a POS-compatible
// paradigm → that paradigm is the truth (the word literally inflects to it; mirrors the
// resolver's decisive +20 form-match). Returns { meaning, pealim_id } or null. Content
// POS only (function words handled by the runtime function-links map).
const NOUN_KIN = (a, b) => (a === b) || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective"));
function formFirstResolve(maps, u) {
  if (!maps || !maps.formIdx || !u || !u.niqqud) return null;
  const pos = u.pos || "";
  if (!(pos === "verb" || pos === "noun" || pos === "adjective" || pos === "")) return null;
  for (const v of formVariants(u.niqqud)) {
    let arr = maps.formIdx.get(v); if (!arr || !arr.length) continue;
    if (pos) { const f = arr.filter((x) => NOUN_KIN(x.pos, pos)); if (f.length) arr = f; else continue; }
    if (u.binyan) { const f = arr.filter((x) => x.binyan === u.binyan); if (f.length) arr = f; }
    const ids = [...new Set(arr.map((x) => x.pealim_id))];
    const pick = (ids.length === 1) ? arr[0] : arr.find((x) => x.pos === pos) || arr[0];  // unique → sure; else POS-exact, then first
    if (pick && pick.pealim_id) return { meaning: pick.meaning || null, pealim_id: pick.pealim_id };
  }
  return null;
}
function offlineMeaningLookup(maps, u) {
  if (!maps) return null;
  // 1) base-form alias (root/lemma) — most authoritative.
  const aKeys = [stripNiqqud(u.root), stripNiqqud(u.lemma), stripNiqqud(u.stem), stripNiqqud(u.sampleWord), stripNiqqud(u.niqqud)].filter(Boolean);
  for (const k of aKeys) {
    const arr = maps.alias.get(k); if (!arr || !arr.length) continue;
    if (u.binyan) { const m = arr.find((x) => x.binyan === u.binyan); if (m) return m.meaning; }
    if (u.pos) { const m = arr.find((x) => x.pos === u.pos); if (m) return m.meaning; }
    return arr[0].meaning;
  }
  // 2) inflected-cell reverse lookup — ONLY for content / unclassified words (never
  // give a function word a verb's gloss) and ONLY when the gloss is UNAMBIGUOUS after
  // a binyan filter (≥2 distinct meanings → skip, don't guess). R1-honest.
  if (u.pos && FUNCTION_POS.has(u.pos)) return null;
  for (const k of [stripNiqqud(u.sampleWord), stripNiqqud(u.niqqud)].filter(Boolean)) {
    let arr = maps.cell.get(k); if (!arr || !arr.length) continue;
    if (u.binyan) { const f = arr.filter((x) => x.binyan === u.binyan); if (f.length) arr = f; }
    const meanings = [...new Set(arr.map((x) => x.meaning))];
    if (meanings.length === 1) return meanings[0];
    return null;   // ambiguous → honest empty
  }
  return null;
}

// ── QA invariants (condensed from conj-audit.js) ────────────────────────────
const REQUIRED = {
  verb: ["AP-ms", "PERF-3ms", "IMPF-3ms", "INF-L"],
  adjective: ["ms-a", "fs-a", "mp-a", "fp-a"],
  preposition: ["P-1s", "P-3ms"],
};
function normVowels(s) { return String(s == null ? "" : s).normalize("NFC").replace(/[֑-֯]/g, "").replace(/ֽ/g, "").trim(); }
function formVariants(s) { const a = normVowels(s); const b = normVowels(String(s == null ? "" : s).replace(/^[והשכלבמ][֑-ׇ]*/, "")); return b && b !== a ? [a, b] : (a ? [a] : []); }
const FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "interjection", "negation", "numeral", "other", "particle"]);
// piel↔pual / hifil↔hufal share ONE Pealim page (two voices). A pual want that
// resolves to the piel page (with passive-* cells) is CORRECT, not a wrong binyan.
const VOICE_PARTNER = { pual: "piel", piel: "pual", hufal: "hifil", hifil: "hufal" };

// Classify the resolution of one analysis-unit. Returns {status, cls, reason}.
function checkUnit(u, r) {
  const pos = u.pos || "";
  const isFunction = FUNCTION_POS.has(pos);
  if (!r || !r.ok || !r.paradigm) {
    const reason = (r && r.reason) || "no_result";
    if (isFunction) return { status: "PASS", cls: "function-no-table", reason };          // gated/honest
    if (u.kind === "propernoun") return { status: "PASS", cls: "propernoun-no-table", reason };
    if (pos === "verb" || pos === "noun" || pos === "adjective") return { status: "FAIL", cls: "content-no-table", reason };
    return { status: "SUSPECT", cls: "unresolved", reason };
  }
  const p = r.paradigm;
  const cells = p.cells || {};
  // binyan mismatch (wrong verb) — but the two-voice page (piel↔pual/hifil↔hufal)
  // legitimately serves both voices, so a pual→piel resolution with passive cells is OK.
  if (pos === "verb" && u.binyan && p.binyan && p.binyan !== u.binyan) {
    const twoVoice = VOICE_PARTNER[u.binyan] === p.binyan && Object.keys(cells).some((k) => /^passive-/.test(k));
    if (!twoVoice) return { status: "FAIL", cls: "wrong-binyan", reason: "got " + p.binyan + " want " + u.binyan + " (id " + p.pealim_id + ")" };
  }
  // structural completeness
  if (pos === "verb" && p.kind !== "invariant") { const miss = REQUIRED.verb.filter((k) => !(cells[k] && cells[k].he)); if (miss.length) return { status: "FAIL", cls: "missing-slots", reason: "verb missing " + miss.join(",") }; }
  // Nominal completeness — validate against what Pealim ACTUALLY returned (Dicta
  // cross-tags noun↔adjective): a nominal is "thin" only when it has NEITHER a
  // noun absolute (s/p) NOR adjective gender×number forms (ms-a…). עשיר resolves
  // to an adjective page (ms-a, no s/p); ענן to a noun page (s/p, no ms-a) — both OK.
  const rpos = p.pos || pos;
  if ((rpos === "noun" || rpos === "adjective") && p.kind !== "verb" && p.kind !== "invariant") {
    const hasNoun = (cells.s && cells.s.he) || (cells.p && cells.p.he);
    const hasAdj = REQUIRED.adjective.some((k) => cells[k] && cells[k].he);
    const hasPrep = cells["P-1s"] && cells["P-1s"].he;            // declined preposition (לי/את/על) parses as a noun page with P-* cells
    if (!hasNoun && !hasAdj && !hasPrep) return { status: "SUSPECT", cls: "nominal-thin", reason: "no nominal forms (id " + p.pealim_id + ")" };
  }
  // form highlight match (the text's vocalized form should appear in the paradigm)
  let formHit = null;
  if (u.niqqud && p.cells) {
    const vs = formVariants(u.niqqud);
    formHit = Object.keys(p.cells).some((k) => p.cells[k] && p.cells[k].he && vs.indexOf(normVowels(p.cells[k].he)) >= 0);
    if (!formHit && (pos === "verb")) return { status: "SUSPECT", cls: "form-unmatched", reason: "form " + u.niqqud + " not in paradigm (id " + p.pealim_id + ")" };
  }
  // meaning presence (for the «Перевод» field)
  if (!p.meaning && (pos === "verb" || pos === "noun" || pos === "adjective")) return { status: "SUSPECT", cls: "no-meaning", reason: "content word w/o Pealim gloss (id " + p.pealim_id + ")" };
  return { status: "PASS", cls: p.disambig === "best-effort" ? "best-effort" : "ok", reason: "" };
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  log("reading", ZIP_IN);
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const libFile = zip.file("library/library.json") || zip.file("library.json");
  if (!libFile) { console.error("no library.json in zip"); process.exit(2); }
  const lib = JSON.parse(await libFile.async("string"));
  let texts = Array.isArray(lib.texts) ? lib.texts : [];
  if (LIMIT) texts = texts.slice(0, LIMIT);
  log("texts:", texts.length, "(limit " + LIMIT + ")");

  // ── 1) Dicta pass (context-faithful), cached on disk for resume ──────────
  const dictaCachePath = path.join(TMP, "bundle-dicta-cache.json");
  let dcache = {};
  try { dcache = JSON.parse(fs.readFileSync(dictaCachePath, "utf8")); } catch (_) {}
  const sentences = [];
  for (const t of texts) for (const row of (t.rows || [])) {
    // Dicta's morphology analyzer expects PLAIN (unvocalized) Hebrew — it does
    // its OWN vocalization + analysis. Feeding pre-vocalized text (the bundle's
    // source niqqud) biases/breaks it: «הַחֹרֶף» (noun "winter") gets mis-read as
    // the hufal verb הָחֳרֵף. The app passes plain; we must too. Prefer hebrew_plain,
    // else niqqud-strip the vocalized form.
    const he = String(row.hebrew_plain || stripNiqqud(row.hebrew_niqqud) || "").trim();
    if (he) sentences.push({ textId: t.text_id, rowId: row.row_id, he, plainKey: stripNiqqud(he) });
  }
  log("sentences:", sentences.length, "→ Dicta (conc " + DICTA_CONC + ")");
  const need = sentences.filter((s) => !dcache[s.plainKey]);
  log("dicta cache hits:", sentences.length - need.length, "to fetch:", need.length);
  let saved = 0;
  await pool(need, DICTA_CONC, async (s) => {
    const res = await dicta.analyzeSentence(s.he);
    dcache[s.plainKey] = (res && res.tokens) ? res.tokens.map((t) => ({ word: t.word, pos: t.posDicta, binyan: t.binyan, lemma: t.lemma, niqqud: t.niqqud, prefix: t.prefix, stem: t.stem, kind: t.kind })) : [];
    if (++saved % 200 === 0) { fs.writeFileSync(dictaCachePath, JSON.stringify(dcache)); log("  dicta", saved + "/" + need.length); }
  }, (d, tot) => log("  dicta", d + "/" + tot));
  fs.writeFileSync(dictaCachePath, JSON.stringify(dcache));
  log("dicta done");

  // ── 2) collect distinct analysis-units + per-(word,text) first occurrence ─
  const units = new Map();   // key lemma|binyan|pos → {pos,binyan,root,lemma,stem,niqqud,sampleWord}
  const noteSeeds = [];      // {textId, rowId, offset, word, niqqud, lemma, root, pos, binyan, kind, unitKey}
  const seenWordPerText = new Set();
  const seenLemmaGlobal = new Set();
  for (const s of sentences) {
    const toks = dcache[s.plainKey] || [];
    for (let off = 0; off < toks.length; off++) {
      const tk = toks[off];
      const word = stripNiqqud(tk.word || "");
      if (!word || word.length < 2) continue;
      const lemma = stripNiqqud(tk.lemma || tk.stem || "");
      const stem = stripNiqqud(tk.stem || "");
      const binyan = tk.binyan || "";
      let pos = tk.pos || "";
      // pos inference (B0.2): Dicta sometimes emits a binyan but no POS for inflected/
      // present-tense verbs (מגהץ piel, מציירות piel). A binyan is a verb-only feature →
      // treat it as Dicta's own verb signal (not a guess). Require a lemma so the verb
      // still gets a root (keeps R1-3). No binyan → leave POS empty (honest).
      if (!pos && binyan && lemma) pos = "verb";
      // root only for content verb/noun; NEVER for function words / proper nouns
      // (R1-1 / R1-4 guard — defensive against a mis-tagged pos leaking a lemma as root).
      const root = (FUNCTION_POS.has(pos) || tk.kind === "propernoun") ? null
        : ((pos === "verb" || pos === "noun") ? lemma : null);
      const ukey = (lemma || word) + "|" + binyan + "|" + pos;
      if (!units.has(ukey)) units.set(ukey, { pos, binyan, root, lemma, stem, niqqud: tk.niqqud || "", sampleWord: word, kind: tk.kind });
      // note dedup
      const dedupKey = DEDUP === "lemma" ? ukey : (s.textId + "|" + word);
      const seen = DEDUP === "lemma" ? seenLemmaGlobal : seenWordPerText;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      noteSeeds.push({ textId: s.textId, rowId: s.rowId, offset: off, word, niqqud: tk.niqqud || "", lemma, root, pos, binyan, kind: tk.kind, unitKey: ukey });
    }
  }
  log("distinct units:", units.size, "| note seeds:", noteSeeds.length, "(dedup " + DEDUP + ")");

  // ── 3) resolve each distinct unit via the gateway (limiter + cache) ──────
  const offlineMeaning = loadOfflineMeaning();
  log("offline-dict meaning keys: alias", offlineMeaning.alias.size, "cell", offlineMeaning.cell.size);
  const unitList = [...units.entries()];
  const resolved = new Map();
  let ri = 0, meaningFallbacks = 0, formOverrides = 0;
  for (const [ukey, u] of unitList) {
    const q = queryLemma(u.pos, u.root, u.lemma, u.stem);
    let r = null;
    try { r = await inflect(q, { pos: u.pos || undefined, binyan: u.binyan || undefined, root: u.root || undefined, form: u.niqqud || undefined }); }
    catch (e) { r = { ok: false, reason: String(e && e.message || e) }; }
    let meaning = (r && r.ok && r.paradigm) ? (r.paradigm.meaning || null) : null;
    let pid = (r && r.ok && r.paradigm) ? r.paradigm.pealim_id : null;
    // Form-first override: the unit's VOCALIZED form is a cell of a POS-compatible
    // paradigm → that's the truth (decisive form-match). Corrects same-spelling
    // homographs the lemma-query resolved to the wrong sense (מילים «слова» not «наполнитель»;
    // ללמוד «учить» not «измерять») — fixes both the stored meaning and the link's pealim_id.
    const ff = formFirstResolve(offlineMeaning, u);
    if (ff && ff.pealim_id && String(ff.pealim_id) !== String(pid || "")) { pid = ff.pealim_id; if (ff.meaning) meaning = ff.meaning; formOverrides++; }
    // B0.1: still no gloss → offline dict fallback (real glosses only, never fabricated).
    if (!meaning) { const fb = offlineMeaningLookup(offlineMeaning, u); if (fb) { meaning = fb; meaningFallbacks++; } }
    resolved.set(ukey, { r, check: checkUnit(u, r), meaning, pid });
    if (++ri % 50 === 0) log("  resolve", ri + "/" + unitList.length);
  }
  log("resolve done; meaning fallbacks:", meaningFallbacks, "| form-first overrides:", formOverrides);

  // ── 4) build notes_advanced + defect report ──────────────────────────────
  const notes = [];
  const stamp = new Date("2026-06-02T00:00:00.000Z").toISOString();
  for (let i = 0; i < noteSeeds.length; i++) {
    const ns = noteSeeds[i];
    const res = resolved.get(ns.unitKey) || {};
    const meaning = res.meaning || "";
    // `pos` is the kmap/json_extract key; `part_of_speech` is the note-editor
    // form key (V3_NOTES_TPL_FIELDS) — emit both so POS hydrates in the editor.
    const body = { word: ns.word, niqqud_variant: ns.niqqud || "", root: ns.root || "", pos: ns.pos || "", part_of_speech: ns.pos || "", binyan: ns.binyan || "", meaning };
    // Form-disambiguated Pealim page id → the word card links straight to THIS sense's
    // page (not a same-spelling homograph the runtime lemma-lookup would hit). Empty when
    // no form-target (loanword/rare) → runtime keeps its search/dict fallback.
    if (res.pid) body.pealim_id = String(res.pid);
    notes.push({
      id: "gen-" + ns.textId + "-" + ns.rowId + "-" + ns.offset,
      target_kind: "word",
      target_id: String(ns.rowId) + ":" + ns.offset,
      text_id: String(ns.textId),
      note_type: "word_study",
      title: ns.word,
      body_json: JSON.stringify(body),
      audio_anchor_ms: null,
      audio_asset_key: null,
      srs_card_id: null,
      created_at: stamp,
      updated_at: stamp,
    });
  }

  // defect tally
  const byStatus = {}, byClass = {}, fails = [];
  for (const [ukey, u] of unitList) {
    const c = (resolved.get(ukey) || {}).check || { status: "SUSPECT", cls: "unknown", reason: "" };
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byClass[c.cls] = (byClass[c.cls] || 0) + 1;
    if (c.status !== "PASS") fails.push({ unit: ukey, word: u.sampleWord, pos: u.pos, binyan: u.binyan, niqqud: u.niqqud, status: c.status, cls: c.cls, reason: c.reason, pid: (resolved.get(ukey) || {}).pid });
  }
  const withMeaning = notes.filter((n) => { try { return !!JSON.parse(n.body_json).meaning; } catch (_) { return false; } }).length;
  const report = {
    generated_at: stamp, zip_in: ZIP_IN, texts: texts.length, sentences: sentences.length,
    distinct_units: units.size, notes: notes.length, notes_with_meaning: withMeaning,
    meaning_rate: notes.length ? Math.round(100 * withMeaning / notes.length) : 0,
    by_status: byStatus, by_class: byClass, fails: fails.sort((a, b) => (a.cls < b.cls ? -1 : 1)),
  };
  const reportPath = path.join(TMP, "bundle-defects.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log("REPORT", JSON.stringify({ by_status: byStatus, distinct_units: units.size, notes: notes.length, meaning_rate: report.meaning_rate + "%" }));
  log("top classes:", JSON.stringify(Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 12)));
  log("report →", reportPath);

  // ── 5) repackage enriched bundle ──────────────────────────────────────────
  if (!NO_ZIP) {
    // Per-sentence Dicta morphology → offline auto-fill of POS / root-hint in
    // the word_study editor (no live "Уточнить корень" needed). Map the cached
    // tokens to the app's token shape (posDicta is the field v3MorphTokenToResult
    // reads). Keyed by sentence_id = row_id (remapped on import).
    const DICTA_MORPH_MODEL = "dicta-morph-v2";
    const sentenceMorph = [];
    for (const s of sentences) {
      const toks = dcache[s.plainKey] || [];
      if (!toks.length) continue;
      sentenceMorph.push({
        sentence_id: String(s.rowId), text_id: String(s.textId),
        model_version: DICTA_MORPH_MODEL, provider: "dicta-morph",
        tokens: toks.map((t) => ({ word: t.word, posDicta: t.pos || null, binyan: t.binyan || null, lemma: t.lemma || null, niqqud: t.niqqud || null, prefix: t.prefix || null, stem: t.stem || null, kind: t.kind || null })),
      });
    }
    log("sentence_morph entries:", sentenceMorph.length);
    const advanced = { schema_version: 1, exported_at: stamp, app_id: "linguist-pro-web", format: "linguistpro-notes-advanced-v1", notes, versions: [], links: [], roots: [], sentence_morph: sentenceMorph };
    zip.file("library/notes_advanced.json", JSON.stringify(advanced));
    // flip manifest flag
    try { const mf = zip.file("manifest.json"); if (mf) { const m = JSON.parse(await mf.async("string")); m.notes_advanced_present = true; m.notes_count = notes.length; zip.file("manifest.json", JSON.stringify(m, null, 2)); } } catch (_) {}
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    fs.mkdirSync(path.dirname(OUT_ZIP), { recursive: true });
    fs.writeFileSync(OUT_ZIP, buf);
    log("enriched bundle →", OUT_ZIP, "(" + Math.round(buf.length / 1024 / 1024 * 10) / 10 + " MB,", notes.length, "notes)");
  }
  log("done.");
})().catch((e) => { console.error(e); process.exit(1); });
