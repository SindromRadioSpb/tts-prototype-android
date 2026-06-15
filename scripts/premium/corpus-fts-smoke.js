#!/usr/bin/env node
"use strict";
// smoke:corpus-fts — BRR-P2-001 full-text index producer gate.
// Builds the inverted index over a tiny synthetic corpus (real Pealim dict) and asserts the
// invariants that keep search honest + correct + reproducible:
//   • every work with a body is indexed; manifest shape + version lockstep;
//   • LEMMA COLLAPSE (Dicta-class recall): «המלך» and «מלכים» land on the SAME pid → one work
//     each in that pid's postings; the bare lemma «מלך» resolves via the shipped dict-form map;
//   • postings decode losslessly (delta + tf); determinism: rebuild → byte-identical artifacts.
const fs = require("fs");
const os = require("os");
const path = require("path");

const FTS = require(path.resolve(__dirname, "../../public/js/corpus-fts.js"));
const { buildCorpusFts } = require(path.resolve(__dirname, "build-corpus-fts.js"));

let pass = 0, fail = 0;
function ok(cond, msg, extra) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg + (extra ? " — " + extra : "")); } }

function mkWork(id, plain, niqqud) {
  // niqqud (optional) goes in hebrew_niqqud — the build reads it first, so an index built from
  // voweled text must still match an un-voweled query (the niqqud-insensitivity promise).
  return { library: { schema_version: 1, texts: [{ text_id: "t" + id, rows: (niqqud || plain).split("\n").map((h, i) => ({ row_id: "r" + i, order_index: i, hebrew_niqqud: niqqud ? h : "", hebrew_plain: plain.split("\n")[i] || "" })) }] } };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fts-smoke-"));
  const worksDir = path.join(dir, "works");
  fs.mkdirSync(worksDir, { recursive: true });
  // ordinals: 0=work1, 1=work2, 2=work3
  const search = [
    { id: "1", t: "א", a: "x", e: "modern", g: "prose", l: "he", r: 1 },
    { id: "2", t: "ב", a: "y", e: "modern", g: "prose", l: "he", r: 1 },
    { id: "3", t: "ג", a: "z", e: "modern", g: "prose", l: "he", r: 0 },
  ];
  fs.writeFileSync(path.join(dir, "corpus-search-v1.json"), JSON.stringify(search));
  fs.writeFileSync(path.join(worksDir, "1.json"), JSON.stringify(mkWork("1", "שלום מלכים")));
  fs.writeFileSync(path.join(worksDir, "2.json"), JSON.stringify(mkWork("2", "מלכים אהבה")));
  fs.writeFileSync(path.join(worksDir, "3.json"), JSON.stringify(mkWork("3", "שלום עולם", "שָׁלוֹם עוֹלָם")));

  const opts = { outDir: dir, byDir: dir, catalogVersion: 1, dataRev: 1, worksDir: worksDir, noFetch: true, quiet: true };
  const res = await buildCorpusFts(opts);

  // structure + counts
  ok(res.manifest.schema === 1 && res.manifest.version === 1, "manifest schema/version");
  ok(res.manifest.works_file === "corpus-search-v1.json", "manifest points at the works table");
  ok(JSON.stringify(res.manifest.fields) === JSON.stringify(["exact", "lemma"]), "dual fields declared");
  ok(Array.isArray(res.manifest.lemma_files) && res.manifest.lemma_files.length >= 1, "lemma index is sharded (lemma_files[])");
  ok(res.stats.indexed === 3, "all 3 works indexed", "indexed=" + res.stats.indexed);
  ok(res.stats.collisions === 0, "no skeleton→pid collisions");

  // resolve helper: query word → its lemma postings (works), via the shipped skeleton→pid map
  function worksFor(word) {
    const pid = res.lemmaMapObj[FTS.normalizeToken(word)];
    if (pid == null) return null;
    return FTS.decodePostings(res.lemmaObj[pid] || []).map((p) => p.w).sort();
  }

  // «מלכים» appears (same surface form) in works 0 & 1 → one pid, both works in its postings
  const wMelachim = worksFor("מלכים");
  ok(wMelachim != null, "«מלכים» resolves to a pid");
  ok(wMelachim && wMelachim.length === 2 && wMelachim[0] === 0 && wMelachim[1] === 1, "«מלכים» postings = works 0 & 1", "got " + JSON.stringify(wMelachim));

  // NIQQUD-INSENSITIVITY — work2's body is VOWELED («שָׁלוֹם»), the query is not; «שלום» must still
  // find work0 (plain) AND work2 (voweled).
  const wShalom = worksFor("שלום");
  ok(wShalom && wShalom.indexOf(0) >= 0 && wShalom.indexOf(2) >= 0, "«שלום» finds plain (0) AND voweled (2) bodies", "got " + JSON.stringify(wShalom));
  ok(worksFor("שָׁלוֹם") && JSON.stringify(worksFor("שָׁלוֹם")) === JSON.stringify(wShalom), "voweled query == unvoweled query");

  // dict-form expansion ran (the skeleton→pid map carries more than just the corpus's own forms,
  // so out-of-corpus inflections of a present paradigm still resolve)
  ok(Object.keys(res.lemmaMapObj).length > 20, "lemmamap expanded with dictionary forms", "keys=" + Object.keys(res.lemmaMapObj).length);

  // firstMatchRow (BRR-P2-005 — FTS hit opens AT the matched sentence)
  const rows = [
    { he: 'בראשית ברא' },
    { he: 'מלכים רבים בארץ' },
    { he_niqqud: 'אַהֲבָה רַבָּה' },     // voweled — niqqud-insensitive match must still work
    { he: 'מלחמת השחרור הגדולה' },     // contains שחרור — substring of the query «שחר»
  ];
  ok(FTS.firstMatchRow(rows, 'מלכים') === 1, "firstMatchRow: whole-token → row 1", "got " + FTS.firstMatchRow(rows, 'מלכים'));
  ok(FTS.firstMatchRow(rows, 'אהבה') === 2, "firstMatchRow: voweled row matched by unvoweled query", "got " + FTS.firstMatchRow(rows, 'אהבה'));
  ok(FTS.firstMatchRow(rows, 'שחר') === 3, "firstMatchRow: substring (שחר ∈ שחרור) → row 3", "got " + FTS.firstMatchRow(rows, 'שחר'));
  ok(FTS.firstMatchRow(rows, 'zzzнет') === -1, "firstMatchRow: no match → -1");
  ok(FTS.firstMatchRow([], 'מלך') === -1, "firstMatchRow: no rows → -1");
  // lemma path: inject a lemmamap so an inflection in the row resolves to the query's pid
  FTS._setLemmaMapForTest({ [FTS.normalizeToken('מלכים')]: '6002', [FTS.normalizeToken('מלך')]: '6002' });
  ok(FTS.firstMatchRow([{ he: 'מלכים' }], 'מלך') === 0, "firstMatchRow: lemma pid match (query מלך → row מלכים)");
  FTS._setLemmaMapForTest(null);

  // determinism — rebuild → byte-identical artifacts
  const res2 = await buildCorpusFts(opts);
  const norm = (r) => JSON.stringify({ m: r.manifest, b: r.buckets, l: r.lemmaObj, lm: r.lemmaMapObj });
  ok(norm(res) === norm(res2), "rebuild is byte-identical (deterministic)");

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log(`smoke:corpus-fts — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
