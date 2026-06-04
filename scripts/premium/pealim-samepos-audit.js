#!/usr/bin/env node
"use strict";

// pealim-samepos-audit.js — deep dive into the SAME-POS homograph cases left soft by
// pealim-link-audit (H_same_pos_glossconflict). For each one, decide with the RELIABLE
// form-match signal (the online resolver's decisive +20) whether the Pealim link is
// actually WRONG, or merely the SAVED gloss is off (link correct), or there's no form
// signal to judge:
//
//   GLOSS_ERROR_LINK_OK   note's vocalized form IS a cell of the linked paradigm →
//                         the word inflects to it → link correct, saved «Перевод» wrong.
//   WRONG_LINK_FIXABLE    form NOT in the linked paradigm but IS in ANOTHER same-key
//                         paradigm → form-disambiguation would pick that id (fixable).
//   WRONG_LINK_NO_TARGET  form in neither → wrong-ish but no better Pealim page exists.
//   NO_FORM_SIGNAL        note has no niqqud / form not vocalized → cannot judge by form.
//
//   node scripts/premium/pealim-samepos-audit.js [--zip Library/test-enriched.zip] [--json]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); if (i < 0) return def; const v = process.argv[i + 1]; return v && !v.startsWith("--") ? v : true; }
const ZIP_IN = String(arg("zip", path.join(REPO, "Library", "test-enriched.zip")));
const AS_JSON = !!arg("json", false);
const DICT_GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");

const NIQ = /[֑-ׇ]/g;
const sp = (s) => String(s == null ? "" : s).replace(NIQ, "").trim();
// niqqud-sensitive normalize (mirrors pealim.js): drop cantillation + meteg, keep vowels.
const normVowels = (s) => String(s == null ? "" : s).normalize("NFC").replace(/[֑-֯]/g, "").replace(/ֽ/g, "").trim();
const procliticStrip = (s) => String(s == null ? "" : s).replace(/^[והשכלבמ][֑-ׇ]*/, "");
function formVariants(form) { const a = normVowels(form); const b = normVowels(procliticStrip(form)); return b && b !== a ? [a, b] : (a ? [a] : []); }
function formInCells(form, cells) {
  if (!form || !cells) return false;
  const vs = formVariants(form); if (!vs.length) return false;
  for (const k of Object.keys(cells)) { const c = cells[k]; if (c && c.he && vs.indexOf(normVowels(c.he)) >= 0) return true; }
  return false;
}

const CONTENT_POS = new Set(["verb", "noun", "adjective"]);
const v3ConjPosInflects = (pos) => { const p = String(pos || ""); return p === "" || p === "verb" || p === "noun" || p === "adjective" || p === "preposition"; };
const v3ConjQueryLemma = (pos, root, lemma, word, stem) => v3ConjPosInflects(pos) ? (root || lemma || word) : (stem || lemma || word);
const PROCL = "והשכלבמ";

function glossConflict(a, b) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^а-яё\s-]/gi, " ").split(/\s+/).filter((w) => w.length > 2);
  const A = new Set(norm(a)); const B = norm(b);
  if (!A.size || !B.length) return false;
  return !B.some((w) => A.has(w));
}

(async () => {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT_GZ)).toString("utf8"));
  const par = d.paradigms || [], idx = d.index || {};
  const lookup = (c, bn) => { const i = idx[sp(c) + " " + (bn || "")]; return i == null ? null : par[i]; };
  const clientLookup = (lemma, stem, bn) => {
    const cs = []; const push = (k) => { const s = sp(k); if (s && cs.indexOf(s) < 0) cs.push(s); };
    push(lemma); push(stem);
    [lemma, stem].forEach((s) => { let t = String(s || ""); for (let dd = 0; dd < 4 && t.length > 2 && PROCL.indexOf(t[0]) >= 0; dd++) { t = t.slice(1); push(t); } });
    for (const c of cs) { let h = lookup(c, bn || ""); if (!h && bn) h = lookup(c, ""); if (h) return h; }
    return null;
  };
  // cell-index: exact vocalized cell form → paradigms that contain it. This is the
  // real form-disambiguation source (the note's inflected form is usually a CELL of the
  // correct paradigm, not its lemma — מילים is the plural cell of מילה).
  const cellIdx = new Map();
  for (const p of par) { if (!p.cells) continue; for (const k of Object.keys(p.cells)) { const c = p.cells[k]; if (!c || !c.he) continue; const nk = normVowels(c.he); if (!nk) continue; if (!cellIdx.has(nk)) cellIdx.set(nk, []); const a = cellIdx.get(nk); if (a.indexOf(p) < 0) a.push(p); } }
  const byId = new Map(); for (const p of par) if (p.pealim_id) byId.set(String(p.pealim_id), p);  // for stored-id verification
  const altByForm = (form, notePos, hit) => {
    for (const v of formVariants(form)) { const list = cellIdx.get(v); if (!list) continue;
      const same = list.filter((p) => p !== hit && p.pealim_id && (p.pos === notePos || ((notePos === "noun" || notePos === "adjective") && (p.pos === "noun" || p.pos === "adjective"))));
      if (same.length) return same[0];
    }
    return null;
  };

  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const adv = JSON.parse(await (zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json")).async("string"));
  const notes = adv.notes.filter((n) => n.note_type === "word_study");
  const sm = {}; for (const e of (adv.sentence_morph || [])) sm[String(e.sentence_id)] = e.tokens || [];
  const findTok = (toks, w) => { const k = sp(w); return (toks || []).find((t) => sp(t.word) === k) || null; };

  const classes = {}, byPos = {}, examples = {};
  const addEx = (c, s) => { (examples[c] = examples[c] || []); if (examples[c].length < 12) examples[c].push(s); };
  let total = 0;

  for (const n of notes) {
    let b; try { b = JSON.parse(n.body_json); } catch (_) { continue; }
    const sid = String(n.target_id || "").split(":")[0]; const tok = findTok(sm[sid], b.word);
    let pos = b.pos || "", root = b.root || "", binyan = b.binyan || "", lemma = "", stem = "", niq = b.niqqud_variant || "";
    if (tok) {
      const tp = tok.posDicta || ""; if (tp) pos = ({ propernoun: "noun" }[tp] || tp);
      lemma = sp(tok.lemma || ""); stem = sp(tok.stem || tok.word || ""); if (tok.niqqud) niq = tok.niqqud;
      if (pos === "verb" || pos === "noun") root = sp(tok.lemma || "") || root;
      binyan = (pos === "verb") ? (tok.binyan || "") : "";
    }
    if (!lemma) lemma = root || b.word; if (!stem) stem = b.word;
    if (!CONTENT_POS.has(pos)) continue;

    const ql = v3ConjQueryLemma(pos, root, lemma, b.word, stem);
    const hit = clientLookup(ql, stem, binyan);
    if (!hit || !hit.pealim_id) continue;                        // search fallback — not a dict link
    const hp = hit.pos || "";
    const samePos = (hp === pos) || ((pos === "noun" || pos === "adjective") && (hp === "noun" || hp === "adjective"));
    if (!samePos) continue;                                       // cross-POS handled by the guard, not here
    if (!(b.meaning && hit.meaning && glossConflict(b.meaning, hit.meaning))) continue;  // the soft 375 set
    total++; byPos[pos] = (byPos[pos] || 0) + 1;

    // POST-FIX: the note now carries a form-disambiguated pealim_id → the runtime links to
    // THAT page (not the homograph `hit`). Verify it: form ∈ stored paradigm's cells.
    const niqForm = niq || "";
    if (b.pealim_id) {
      const sp2 = byId.get(String(b.pealim_id));
      let scls;
      if (sp2 && niqForm && sp(niqForm) !== niqForm && formInCells(niqForm, sp2.cells)) scls = "STORED_ID_OK";
      else if (sp2 && String(sp2.pealim_id) !== String(hit.pealim_id)) scls = "STORED_ID_OVERRIDES_HOMOGRAPH";  // differs from wrong hit (good), form unverifiable
      else scls = "STORED_ID_SAME_AS_HIT";
      classes[scls] = (classes[scls] || 0) + 1;
      if (scls !== "STORED_ID_OK") addEx(scls, b.word + " [" + pos + "] stored id " + b.pealim_id + " «" + String((sp2 && sp2.meaning) || "").slice(0, 16) + "» vs hit " + hit.pealim_id + " «" + String(hit.meaning).slice(0, 16) + "»");
      continue;   // stored id is authoritative — don't re-classify by the stale runtime hit
    }

    let cls;
    const form = niq || "";
    if (!form || sp(form) === form) cls = "NO_FORM_SIGNAL";       // no niqqud → can't judge by form
    else if (formInCells(form, hit.cells)) cls = "GLOSS_ERROR_LINK_OK";  // word inflects to the linked paradigm → link correct
    else {
      const altHit = altByForm(form, pos, hit);                  // form is a CELL of another same-POS paradigm?
      cls = altHit ? "WRONG_LINK_FIXABLE" : "WRONG_LINK_NO_TARGET";
      if (altHit) addEx(cls, b.word + " [" + pos + "] linked id " + hit.pealim_id + " «" + String(hit.meaning).slice(0, 14) + "» → form fits id " + altHit.pealim_id + " «" + String(altHit.meaning || "").slice(0, 16) + "» (note «" + String(b.meaning).slice(0, 14) + "»)");
    }
    classes[cls] = (classes[cls] || 0) + 1;
    if (cls !== "WRONG_LINK_FIXABLE") addEx(cls, b.word + " [" + pos + "] → id " + hit.pealim_id + " «" + String(hit.meaning).slice(0, 18) + "» (note «" + String(b.meaning).slice(0, 18) + "»)" + (form && sp(form) !== form ? " form=" + form : " (no-niqqud)"));
  }

  const out = { generated_at: new Date().toISOString(), zip_in: ZIP_IN, same_pos_glossconflict_total: total, classes, by_pos: byPos, examples };
  fs.mkdirSync(path.join(REPO, ".tmp"), { recursive: true });
  fs.writeFileSync(path.join(REPO, ".tmp", "pealim-samepos-audit.json"), JSON.stringify(out, null, 2));

  if (AS_JSON) console.log(JSON.stringify(out, null, 2));
  else {
    console.log("\n[pealim-samepos-audit]", path.basename(ZIP_IN), "— same-POS gloss-conflict cases:", total);
    console.log("─".repeat(70));
    const order = ["GLOSS_ERROR_LINK_OK", "WRONG_LINK_FIXABLE", "WRONG_LINK_NO_TARGET", "NO_FORM_SIGNAL"];
    const label = {
      GLOSS_ERROR_LINK_OK: "link CORRECT, saved gloss wrong (form ∈ paradigm)",
      WRONG_LINK_FIXABLE: "WRONG link, form fits another paradigm (fixable: form-disambig)",
      WRONG_LINK_NO_TARGET: "wrong-ish, form in no paradigm (no better Pealim page)",
      NO_FORM_SIGNAL: "no niqqud form → cannot judge by form",
    };
    for (const c of order) console.log("  " + c.padEnd(22) + String(classes[c] || 0).padStart(4) + "  " + label[c]);
    console.log("─".repeat(70));
    for (const c of order) { if (examples[c] && examples[c].length) { console.log("\n  [" + c + "]"); for (const e of examples[c]) console.log("    " + e); } }
    console.log("\n  report → .tmp/pealim-samepos-audit.json");
  }
  process.exit(0);
})().catch((e) => { console.error("[pealim-samepos-audit] fatal:", e); process.exit(1); });
