#!/usr/bin/env node
"use strict";

// pealim-link-inventory.js — full per-note inventory of the «перепроверка (Pealim)»
// link for EVERY word_study note in a bundle. Classifies each note's FINAL link as a
// direct dict page (conforming) or a search fallback (missing direct link), with the
// reason, so we have the complete list of non-conforming / missing Pealim links.
//
//   node scripts/premium/pealim-link-inventory.js [--zip Library/test-enriched.zip]
//
// Outputs:
//   .tmp/pealim-link-inventory.json   — every note: { word, pos, niqqud, meaning,
//                                        text_id, status, reason, pealim_id }
//   docs/PEALIM_LINK_INVENTORY_2026_06.md — human report (counts + distinct missing words)
//
// Status:
//   DIRECT_STORED      note carries a form-disambiguated pealim_id → direct correct page
//   DIRECT_FUNCLINK    function word resolved via the function-links map → direct page
//   MISSING_SEARCH     no direct link → search fallback (reason below)
// Missing reasons:
//   not-in-pealim          word/lemma/root absent from the dataset (loanword/proper/slang)
//   in-pealim-no-target    present in dataset but no form-matched paradigm (homograph/rare form)
//   function-no-invariant  function word without an invariant Pealim entry

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); if (i < 0) return def; const v = process.argv[i + 1]; return v && !v.startsWith("--") ? v : true; }
const ZIP_IN = String(arg("zip", path.join(REPO, "Library", "test-enriched.zip")));
const DICT_GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const FUNC_JSON = path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json");

const NIQ = /[֑-ׇ]/g;
const sp = (s) => String(s == null ? "" : s).replace(NIQ, "").trim();
const normVowels = (s) => String(s == null ? "" : s).normalize("NFC").replace(/[֑-֯]/g, "").replace(/ֽ/g, "").trim();
const FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "negation", "interrogative", "numeral", "interjection"]);

(async () => {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT_GZ)).toString("utf8"));
  const par = d.paradigms || [];
  const plainKeys = new Set();   // any root/lemma/form present in the dataset
  const formKeys = new Set();    // any vocalized cell form present
  for (const p of par) {
    for (const k of [p.root, p.lemma, p.form]) { const kk = sp(k); if (kk) plainKeys.add(kk); }
    if (p.cells) for (const ck of Object.keys(p.cells)) { const c = p.cells[ck]; if (c && c.he) { const nk = normVowels(c.he); if (nk) formKeys.add(nk); plainKeys.add(sp(c.he)); } }
  }
  let funcMap = {}; try { funcMap = (JSON.parse(fs.readFileSync(FUNC_JSON, "utf8")).links) || {}; } catch (_) {}

  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const adv = JSON.parse(await (zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json")).async("string"));
  const notes = adv.notes.filter((n) => n.note_type === "word_study");

  const rows = [];
  const counts = { DIRECT_STORED: 0, DIRECT_FUNCLINK: 0, MISSING_SEARCH: 0 };
  const reasons = {};
  const byPosMissing = {};
  const distinctMissing = new Map();   // word|pos → { count, niqqud, meaning, reason }

  for (const n of notes) {
    let b; try { b = JSON.parse(n.body_json); } catch (_) { continue; }
    const word = b.word || "", pos = b.pos || "", niq = b.niqqud_variant || "", meaning = b.meaning || "";
    let status, reason = "", pid = b.pealim_id || "";

    if (pid) { status = "DIRECT_STORED"; }
    else if (FUNCTION_POS.has(pos)) {
      const fe = funcMap[sp(word)] || funcMap[sp(niq)];
      if (fe && fe.id) { status = "DIRECT_FUNCLINK"; pid = fe.id; }
      else { status = "MISSING_SEARCH"; reason = plainKeys.has(sp(word)) ? "in-pealim-no-target" : "function-no-invariant"; }
    } else {
      status = "MISSING_SEARCH";
      const inData = plainKeys.has(sp(word)) || plainKeys.has(sp(b.root)) || formKeys.has(normVowels(niq));
      reason = inData ? "in-pealim-no-target" : "not-in-pealim";
    }

    counts[status]++;
    if (status === "MISSING_SEARCH") {
      reasons[reason] = (reasons[reason] || 0) + 1;
      byPosMissing[pos || "(empty)"] = (byPosMissing[pos || "(empty)"] || 0) + 1;
      const key = sp(word) + "|" + pos;
      const e = distinctMissing.get(key) || { word, pos, niqqud: niq, meaning, reason, count: 0 };
      e.count++; distinctMissing.set(key, e);
    }
    rows.push({ word, pos, niqqud: niq, meaning, text_id: n.text_id, status, reason, pealim_id: pid });
  }

  const distinct = [...distinctMissing.values()].sort((a, b) => b.count - a.count);
  const out = {
    generated_at: new Date().toISOString(), zip_in: ZIP_IN, notes_total: notes.length,
    counts, missing_reasons: reasons, missing_by_pos: byPosMissing,
    direct_pct: Math.round(1000 * (counts.DIRECT_STORED + counts.DIRECT_FUNCLINK) / notes.length) / 10,
    distinct_missing_count: distinct.length, rows,
  };
  fs.mkdirSync(path.join(REPO, ".tmp"), { recursive: true });
  fs.writeFileSync(path.join(REPO, ".tmp", "pealim-link-inventory.json"), JSON.stringify(out, null, 2));

  // human report (counts + full distinct missing list)
  const md = [];
  md.push("# Инвентаризация Pealim-ссылок в ②-заметках бандла\n");
  md.push("> Сгенерировано `scripts/premium/pealim-link-inventory.js` (`npm run audit:pealim-inventory`).");
  md.push("> Бандл: `" + path.basename(ZIP_IN) + "`, заметок: **" + notes.length + "**. Дата: " + out.generated_at.slice(0, 10) + ".\n");
  md.push("## Итог\n");
  md.push("| статус | кол-во |");
  md.push("|---|---|");
  md.push("| ✅ DIRECT_STORED (прямая ссылка по form-disambig pealim_id) | " + counts.DIRECT_STORED + " |");
  md.push("| ✅ DIRECT_FUNCLINK (прямая ссылка служебного слова) | " + counts.DIRECT_FUNCLINK + " |");
  md.push("| ⚠ MISSING_SEARCH (прямой ссылки нет → поиск Pealim) | " + counts.MISSING_SEARCH + " |");
  md.push("\n**Прямых ссылок: " + out.direct_pct + "%.** Остальное — честный поиск (по причинам ниже).\n");
  md.push("### Причины отсутствия прямой ссылки\n");
  md.push("| причина | кол-во | смысл |");
  md.push("|---|---|---|");
  const reasonLabel = { "not-in-pealim": "слова нет в Pealim (loanword/имя/сленг) — внешний предел", "in-pealim-no-target": "слово есть, но нет form-совпавшей парадигмы (омограф/редкая форма)", "function-no-invariant": "служебное слово без invariant-записи в Pealim" };
  for (const [r, c] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) md.push("| `" + r + "` | " + c + " | " + (reasonLabel[r] || "") + " |");
  md.push("\n### MISSING по части речи\n");
  md.push("| POS | кол-во |"); md.push("|---|---|");
  for (const [p, c] of Object.entries(byPosMissing).sort((a, b) => b[1] - a[1])) md.push("| " + p + " | " + c + " |");
  md.push("\n## Полный перечень слов без прямой ссылки (" + distinct.length + " уникальных)\n");
  md.push("| слово | POS | огласовка | перевод | причина | вхождений |");
  md.push("|---|---|---|---|---|---|");
  for (const e of distinct) md.push("| " + e.word + " | " + e.pos + " | " + e.niqqud + " | " + String(e.meaning).replace(/\|/g, "/").slice(0, 30) + " | " + e.reason + " | " + e.count + " |");
  md.push("\n> Полный машиночитаемый список (все " + notes.length + " заметок) — `.tmp/pealim-link-inventory.json`.");
  fs.writeFileSync(path.join(REPO, "docs", "PEALIM_LINK_INVENTORY_2026_06.md"), md.join("\n") + "\n");

  console.log("[pealim-link-inventory]", notes.length, "notes —",
    "DIRECT_STORED", counts.DIRECT_STORED, "+ DIRECT_FUNCLINK", counts.DIRECT_FUNCLINK,
    "= direct", out.direct_pct + "%; MISSING_SEARCH", counts.MISSING_SEARCH);
  console.log("  missing reasons:", JSON.stringify(reasons));
  console.log("  missing by pos:", JSON.stringify(byPosMissing));
  console.log("  distinct missing words:", distinct.length);
  console.log("  → .tmp/pealim-link-inventory.json + docs/PEALIM_LINK_INVENTORY_2026_06.md");
  process.exit(0);
})().catch((e) => { console.error("[pealim-link-inventory] fatal:", e); process.exit(1); });
