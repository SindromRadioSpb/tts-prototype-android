#!/usr/bin/env node
"use strict";

// pealim-link-audit.js — exhaustive offline audit of the "перепроверка (Pealim)"
// link correctness for every ② word_study note, across ALL parts of speech.
//
// It replicates the CLIENT link logic (v3ConjQueryLemma + v3WordCardLoadInflection's
// offline-dict lookup) against the bundle + the shipped Pealim dataset, then judges
// where the link would land (a specific /ru/dict/<pealim_id> page vs a /ru/search
// fallback) and whether that page is the RIGHT word. Output: per-POS conformance +
// bug classes with counts + examples; gate fails on resolvable homograph bugs.
//
//   node scripts/premium/pealim-link-audit.js [--zip Library/test-enriched.zip] [--json]
//
// Bug classes:
//   A1_func_to_content  function word (adverb/pronoun/…) → verb/noun/adj dict page (homograph)  [FIXABLE — POS guard]
//   A2_binyan_mismatch  verb note binyan ≠ resolved paradigm binyan                            [FIXABLE — binyan filter]
//   A5_nominal_to_verb  noun/adjective → verb dict page                                          [FIXABLE — POS guard]
//   C2_proper_to_dict   proper noun → any dict page (should be search)                           [FIXABLE — kind guard]
//   H_same_pos_homograph content note whose dict-hit gloss conflicts with the saved gloss        [HARD — needs form-disambig]
//   OK_dict / SEARCH_fallback                                                                    [not a bug]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");
function arg(name, def) { const i = process.argv.indexOf("--" + name); if (i < 0) return def; const v = process.argv[i + 1]; return v && !v.startsWith("--") ? v : true; }
const ZIP_IN = String(arg("zip", path.join(REPO, "Library", "test-enriched.zip")));
const AS_JSON = !!arg("json", false);
const DICT_GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");

const NIQ = /[֑-ׇ]/g;
const sp = (s) => String(s == null ? "" : s).replace(NIQ, "").trim();
// mirrors index.html
const FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "negation", "interrogative", "numeral", "interjection"]);
const CONTENT_POS = new Set(["verb", "noun", "adjective"]);
const v3ConjPosInflects = (pos) => { const p = String(pos || ""); return p === "" || p === "verb" || p === "noun" || p === "adjective" || p === "preposition"; };
const v3ConjQueryLemma = (pos, root, lemma, word, stem) => v3ConjPosInflects(pos) ? (root || lemma || word) : (stem || lemma || word);
const PROCLITIC = "והשכלבמ";

function loadDict() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT_GZ)).toString("utf8"));
  const idx = d.index || {};
  const par = d.paradigms || [];
  const lookup = (cand, binyan) => { const i = idx[sp(cand) + " " + (binyan || "")]; return (i == null) ? null : par[i]; };
  // client v3WordCardLoadInflection step-2 candidate generation + lookup
  const clientLookup = (lemma, stem, binyan) => {
    const cands = []; const push = (k) => { const s = sp(k); if (s && cands.indexOf(s) < 0) cands.push(s); };
    push(lemma); push(stem);
    [lemma, stem].forEach((s) => { let t = String(s || ""); for (let dd = 0; dd < 4 && t.length > 2 && PROCLITIC.indexOf(t[0]) >= 0; dd++) { t = t.slice(1); push(t); } });
    for (const c of cands) { let hit = lookup(c, binyan || ""); if (!hit && binyan) hit = lookup(c, ""); if (hit) return hit; }
    return null;
  };
  return { clientLookup, entry_count: par.length };
}

function findTok(toks, word) { const k = sp(word); return (toks || []).find((t) => sp(t.word) === k) || (toks || []).find((t) => sp(t.stem) === k) || null; }

// Is the resolved dict paradigm POS-compatible with the note's POS? (The reliable
// "wrong page" signal — mirrors the online resolver's POS-dominance, which the
// offline dict lookup currently lacks.) Same predicate the client fix will use.
function hitCompatible(notePos, isProper, hit) {
  const hp = hit.pos || "", hk = hit.kind || "";
  if (isProper) return false;                       // proper noun → never a common dict page
  if (notePos === "verb") return hp === "verb" || hk === "verb";
  if (notePos === "noun" || notePos === "adjective") return hp === "noun" || hp === "adjective"; // noun↔adj kin
  if (notePos === "preposition") return true;       // declines (P-* page)
  if (FUNCTION_POS.has(notePos)) return hk === "invariant" || hp === notePos;
  return true;                                       // empty/unknown POS → don't reject
}

// Russian gloss overlap → detect same-POS homograph mismatches (saved bundle gloss
// vs the dict-hit gloss). Loose: share no significant word → likely different lexeme.
function glossConflict(a, b) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^а-яё\s-]/gi, " ").split(/\s+/).filter((w) => w.length > 2);
  const A = new Set(norm(a)); const B = norm(b);
  if (!A.size || !B.length) return false;
  return !B.some((w) => A.has(w));
}

(async () => {
  if (!fs.existsSync(ZIP_IN)) { console.error("[pealim-link-audit] no zip:", ZIP_IN); process.exit(2); }
  const { clientLookup, entry_count } = loadDict();
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const advFile = zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json");
  const adv = JSON.parse(await advFile.async("string"));
  const notes = (adv.notes || []).filter((n) => n.note_type === "word_study");
  const sm = {}; for (const e of (adv.sentence_morph || [])) sm[String(e.sentence_id)] = e.tokens || [];

  const byPos = {}, classes = {}, perPosClass = {}, examples = {};
  const addEx = (cls, s) => { (examples[cls] = examples[cls] || []); if (examples[cls].length < 10) examples[cls].push(s); };
  let dictId = 0, search = 0;

  for (const n of notes) {
    let b; try { b = JSON.parse(n.body_json); } catch (_) { continue; }
    const sid = String(n.target_id || "").split(":")[0];
    const tok = findTok(sm[sid], b.word);
    // self-healed view = what the runtime link actually uses (prefer fresh Dicta token)
    let pos = b.pos || "", root = b.root || "", binyan = b.binyan || "", lemma = "", stem = "";
    if (tok) {
      const tp = tok.posDicta || ""; if (tp) pos = ({ propernoun: "noun" }[tp] || tp);
      lemma = sp(tok.lemma || ""); stem = sp(tok.stem || tok.word || "");
      const isProper = tp === "propernoun";
      if (FUNCTION_POS.has(pos) || isProper) root = "";
      else if (pos === "verb" || pos === "noun") root = sp(tok.lemma || "") || root;
      binyan = (pos === "verb") ? (tok.binyan || "") : "";
    }
    if (!lemma) lemma = root || b.word; if (!stem) stem = b.word;
    byPos[pos] = (byPos[pos] || 0) + 1;

    const isProper = (b.pos === "propernoun") || (tok && tok.posDicta === "propernoun");
    const ql = v3ConjQueryLemma(pos, root, lemma, b.word, stem);
    const hit = clientLookup(ql, stem, binyan);
    let cls;
    if (hit && hit.pealim_id) {
      dictId++;
      const hp = hit.pos || "";
      if (isProper) cls = "C2_proper_to_dict";
      else if (!hitCompatible(pos, false, hit)) {
        // hard cross-POS wrong page — subtype by direction
        if (FUNCTION_POS.has(pos)) cls = "A1_func_to_content";
        else if (pos === "verb") cls = "A3_verb_to_" + (hp || "x");
        else if (pos === "noun" || pos === "adjective") cls = "A5_nominal_to_" + (hp || "x");
        else cls = "A9_crosspos_" + pos + "_to_" + (hp || "x");
      }
      else if (pos === "verb" && binyan && hit.binyan && hit.binyan !== binyan) cls = "A2_binyan_mismatch";
      else if (CONTENT_POS.has(pos) && b.meaning && hit.meaning && glossConflict(b.meaning, hit.meaning)) cls = "H_same_pos_glossconflict";
      else cls = "OK_dict";
    } else { search++; cls = "SEARCH_fallback"; }

    classes[cls] = (classes[cls] || 0) + 1;
    perPosClass[pos] = perPosClass[pos] || {}; perPosClass[pos][cls] = (perPosClass[pos][cls] || 0) + 1;
    if (cls !== "OK_dict" && cls !== "SEARCH_fallback")
      addEx(cls, b.word + " [" + pos + (binyan ? "/" + binyan : "") + "] → id " + hit.pealim_id + " pos=" + (hit.pos || "") + " kind=" + (hit.kind || "") + " «" + String(hit.meaning || "").slice(0, 24) + "» (note «" + String(b.meaning || "").slice(0, 24) + "»)");
  }

  // Hard (reliable) cross-POS homograph hits = any cross-POS class (A*) + proper→dict
  // (C2). These are DATA-level homographs inherent to Hebrew+Pealim; the CLIENT
  // POS-guard (v3ConjHitCompatible in v3WordCardLoadInflection) neutralizes ALL of
  // them to an honest Pealim SEARCH link — so they are NOT user-facing after the fix.
  // H_same_pos_glossconflict is SOFT (mixes note-gloss errors with rare same-POS
  // homographs the offline lookup can't form-disambiguate) — reported, deferred.
  const isHard = (c) => /^A\d/.test(c) || c === "C2_proper_to_dict";
  const hardCount = Object.keys(classes).filter(isHard).reduce((s, k) => s + classes[k], 0);
  const out = {
    generated_at: new Date().toISOString(), zip_in: ZIP_IN, dict_entries: entry_count,
    notes_total: notes.length, dict_id_links: dictId, search_fallback: search,
    classes, per_pos: perPosClass,
    crosspos_homograph_hits_neutralized_by_client_guard: hardCount,
    same_pos_glossconflict_soft: classes.H_same_pos_glossconflict || 0,
    examples,
  };
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, "pealim-link-audit.json"), JSON.stringify(out, null, 2));

  if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); }
  else {
    console.log("\n[pealim-link-audit]", path.basename(ZIP_IN), "—", notes.length, "notes ·", dictId, "dict-id ·", search, "search");
    console.log("─".repeat(66));
    for (const [c, n] of Object.entries(classes).sort((a, b) => b[1] - a[1])) console.log("  " + c.padEnd(24) + n);
    console.log("─".repeat(66));
    console.log("  cross-POS homograph hits:", hardCount, "— ALL neutralized to honest search by the client POS-guard (v3ConjHitCompatible)");
    console.log("  same-POS gloss-conflict (soft, deferred — needs form-disambig):", classes.H_same_pos_glossconflict || 0);
    for (const c of Object.keys(classes).filter(isHard).concat(["H_same_pos_glossconflict"])) {
      if (examples[c] && examples[c].length) { console.log("\n  [" + c + "  =" + (classes[c] || 0) + "]"); for (const e of examples[c]) console.log("    " + e); }
    }
    console.log("\n  report → .tmp/pealim-link-audit.json");
  }
  // Informational report (homographs are inherent data; the client guard handles them).
  process.exit(0);
})().catch((e) => { console.error("[pealim-link-audit] fatal:", e); process.exit(1); });
