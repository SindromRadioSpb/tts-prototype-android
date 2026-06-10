#!/usr/bin/env node
"use strict";

// giant-pass-smoke.js — BRR-P0-006 Проход-2 (giant chapterization pass) gate.
//
// Exercises the PURE pieces of the giant pass offline (inline fixtures, no network,
// no Gemini): the chapterizeGiant cap-invariant (real chapter markers → paragraph
// fallback → pathological segment-grouping; R7 poem protection), series corpus
// metadata (R1), and the ledger giant-lifecycle on an ISOLATED temp ledger — the
// real .tmp/benyehuda/prebake-ledger.json is NEVER touched.
//
// Optional `--real`: additionally loads 2-3 REAL long Ben-Yehuda works (the canon's
// chapterized novels, via the shared ingestCore txt-cache; fetches if uncached) and
// validates the cap invariant on real text with a LOWERED cap. No translation, no
// Gemini quota — chapterization only.

const fs = require("fs");
const path = require("path");
const by = require("./lib/benyehuda");
const L = require("./lib/corpusLedger");
const corpusMeta = require("../../db/premium/corpusMeta");
const { segment } = require("../../db/premium/segmenter");

const REAL = process.argv.includes("--real");
const CAP = 2000;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}
const plainNoWs = (s) => by.stripNiqqud(String(s || "")).replace(/\s+/g, "");

console.log("[giant-pass-smoke] BRR-P0-006 Проход-2 — chapterizeGiant cap-invariant + series + ledger");

// ── 1. marker-structured giant → real chapters win, every part ≤ cap ──────────
function chLines(n, tag) { const a = []; for (let i = 1; i <= n; i++) a.push("שורה " + i + " בפרק " + tag + " של הסיפור הארוך מאוד."); return a.join("\n"); }
const structured = "א\n" + chLines(900, "אלף") + "\n\nב\n" + chLines(900, "בית") + "\n\nג\n" + chLines(900, "גימל");
const segN1 = segment(structured).length;
const g1 = by.chapterizeGiant(structured, { segmenter: segment, giantSegments: CAP });
test("structured fixture is a giant (" + segN1 + " segs > " + CAP + ")", segN1 > CAP);
test("structured → mode=chapters (real markers win over size splits)", g1.mode === "chapters", g1.mode);
test("structured → 3 chapters, not forced", g1.chapters.length === 3 && !g1.forced, g1.chapters.length + " forced=" + g1.forced);
test("structured → every chapter ≤ cap", g1.chapters.every((c) => segment(c.body).length <= CAP));
test("structured → titles from source markers", /א/.test(g1.chapters[0].title || ""), String(g1.chapters[0].title));

// ── 2. huge unstructured prose (> partCeiling) → 'parts' at paragraph bounds ──
function para(i) { const s = []; for (let j = 1; j <= 5; j++) s.push("משפט " + j + " בפסקה " + i + " על הים והרוח בלילה."); return s.join(" "); }
const mono = Array.from({ length: 450 }, (_, i) => para(i + 1)).join("\n\n");
const segN2 = segment(mono).length;
const g2 = by.chapterizeGiant(mono, { segmenter: segment, giantSegments: CAP });
test("monolith fixture sanity (" + segN2 + " segs, " + by.stripNiqqud(mono).length + " ch)", segN2 > CAP && by.stripNiqqud(mono).length > 50000);
test("monolith → parts mode, ≥ 2 parts", g2.mode === "parts" && g2.chapters.length >= 2, g2.mode + " ×" + g2.chapters.length);
test("monolith → every part ≤ cap", g2.chapters.every((c) => segment(c.body).length <= CAP));
test("monolith → neutral 'Часть N' titles (no fabricated chapters — R7)", g2.chapters.every((c, i) => c.title === "Часть " + (i + 1)));
test("monolith → content preserved (R1: paragraph splits lose nothing)", plainNoWs(g2.chapters.map((c) => c.body).join("\n")) === plainNoWs(mono));

// ── 3. mid-size unstructured giant (≤ partCeiling) → FORCED paragraph split ───
// chapterizeWork alone would keep this single (31K chars ≤ 50K ceiling) — the cap
// enforcement must still split it: a giant NEVER ships as one text.
function microPara(i) { const s = []; for (let j = 1; j <= 5; j++) s.push("עץ ירוק " + i + "-" + j + "."); return s.join(" "); }
const mid = Array.from({ length: 420 }, (_, i) => microPara(i + 1)).join("\n\n");
const segN3 = segment(mid).length;
const plain3 = by.stripNiqqud(mid).length;
const g3 = by.chapterizeGiant(mid, { segmenter: segment, giantSegments: CAP });
test("mid fixture sanity (" + segN3 + " segs, " + plain3 + " ch in 12K..50K)", segN3 > CAP && plain3 > 12000 && plain3 <= 50000);
test("mid → forced parts (≥ 2), single never escapes", g3.mode === "parts" && g3.forced === true && g3.chapters.length >= 2, g3.mode + " forced=" + g3.forced);
test("mid → every part ≤ cap", g3.chapters.every((c) => segment(c.body).length <= CAP));
test("mid → content preserved", plainNoWs(g3.chapters.map((c) => c.body).join("\n")) === plainNoWs(mid));

// ── 4. poetry-shaped giant under the 12K prose gate → segment-group fallback ──
// 2500 one-word lines: > cap segments yet < 12K plain chars (the R7 length gate
// keeps chapterizeWork single) and ZERO paragraph breaks — the pathological path.
const poem = Array.from({ length: 2500 }, () => "עץ").join("\n");
const segN4 = segment(poem).length;
const g4 = by.chapterizeGiant(poem, { segmenter: segment, giantSegments: CAP });
test("poem fixture sanity (" + segN4 + " segs, " + by.stripNiqqud(poem).length + " ch < 12K, no paragraphs)", segN4 > CAP && by.stripNiqqud(poem).length < 12000);
test("poem → forced parts via segment-grouping (≥ 2)", g4.mode === "parts" && g4.forced === true && g4.chapters.length >= 2, g4.mode + " ×" + g4.chapters.length);
test("poem → every part ≤ cap", g4.chapters.every((c) => segment(c.body).length <= CAP));
test("poem → content preserved", plainNoWs(g4.chapters.map((c) => c.body).join("\n")) === plainNoWs(poem));

// ── 5. under-cap work → normal rules untouched (R7 stanza protection) ─────────
const shortPoem = "א\nשיר קצר על אהבה גדולה\n\nב\nשיר קצר על ים כחול";
const g5 = by.chapterizeGiant(shortPoem, { segmenter: segment, giantSegments: CAP });
test("under-cap → single (stanza numerals are NOT chapters; normal gates apply)", g5.mode === "single" && g5.chapters.length === 1, g5.mode + " ×" + g5.chapters.length);

// ── 6. series corpus metadata for a part (R1 gate) ────────────────────────────
let corpus = null, corpusErr = null;
try {
  corpus = by.corpusFromRow(
    { ID: "9999", title: "ספר ארוך", authors: "מנדלי מוכר ספרים", translators: "", original_language: "", genre: "prose", path: "/x", source_edition: "" },
    { track: "literary", register: "literary", era: "haskalah", audio_status: "none",
      series: { work_byehuda_id: "9999", work_title: "ספר ארוך", part: 3, total: 7 } }
  );
} catch (e) { corpusErr = e.message; }
test("part corpus builds with series", !!corpus, corpusErr);
test("series normalized {work_byehuda_id, work_title, part, total}",
  !!corpus && corpus.series && corpus.series.work_byehuda_id === "9999" && corpus.series.part === 3 && corpus.series.total === 7,
  corpus && JSON.stringify(corpus.series));
test("R1 honest defaults on a part (review_status=machine)", !!corpus && corpus.review_status === "machine");
if (corpus) {
  const v = corpusMeta.validateCorpus(corpus);
  const errs = (v && v.errors) || [];
  test("validateCorpus: 0 errors on a series part", errs.length === 0, JSON.stringify(errs));
}

// ── 6b. Russian numeral declension for TOC shelf prose (R4 — shipped UI text) ─
test("ruPlural 1 → глава", by.ruPlural(1, "глава", "главы", "глав") === "глава");
test("ruPlural 2 → главы (paucal, not 'глав')", by.ruPlural(2, "глава", "главы", "глав") === "главы");
test("ruPlural 3 → части", by.ruPlural(3, "часть", "части", "частей") === "части");
test("ruPlural 5 → глав", by.ruPlural(5, "глава", "главы", "глав") === "глав");
test("ruPlural 11 → глав (teen exception)", by.ruPlural(11, "глава", "главы", "глав") === "глав");
test("ruPlural 12 → частей (teen exception)", by.ruPlural(12, "часть", "части", "частей") === "частей");
test("ruPlural 21 → глава", by.ruPlural(21, "глава", "главы", "глав") === "глава");
test("ruPlural 22 → главы", by.ruPlural(22, "глава", "главы", "глав") === "главы");

// ── 7. ledger giant-lifecycle on an ISOLATED temp ledger ──────────────────────
const REPO = path.resolve(__dirname, "..", "..");
const tmpDir = path.join(REPO, ".tmp", "giant-pass-smoke");
fs.mkdirSync(tmpDir, { recursive: true });
const ledgerPath = path.join(tmpDir, "ledger.json");
const REAL_LEDGER = path.join(REPO, ".tmp", "benyehuda", "prebake-ledger.json");
test("isolated ledger path ≠ real bake ledger", path.resolve(ledgerPath) !== path.resolve(REAL_LEDGER));
const led = L.emptyLedger();
L.seedLedger(led, [{ id: "g1", tier: "known-era" }, { id: "n1", tier: "rest" }]);
L.markDeferredGiant(led, "g1", { segments: 5200 }, "2026-06-10");
test("giantWorks picks only the deferred giant", JSON.stringify(L.giantWorks(led, ["n1", "g1"])) === JSON.stringify(["g1"]));
test("normal pass never sees the giant", JSON.stringify(L.pendingWorks(led, ["n1", "g1"])) === JSON.stringify(["n1"]));
L.markDeferredGiant(led, "g1", { segments: 5200, error: "giant:gemini-quota" }, "2026-06-10");
test("failed giant attempt stays deferred (error recorded, retry next pass)", led.works.g1.status === "deferred-giant" && /quota/.test(led.works.g1.error));
L.markDone(led, "g1", { tier: "literary", segments: 5180, parts: 4, reqs: 110, ru_filled: 5180 }, "2026-06-10");
L.saveLedger(ledgerPath, led);
const led2 = L.loadLedger(ledgerPath);
test("round-trip: parts + done survive save/load", led2.works.g1.parts === 4 && led2.works.g1.status === "done");
const st = L.stats(led2);
test("stats: done 1 · deferred 0 · parts 4", st.done === 1 && st.deferredGiant === 0 && st.parts === 4, JSON.stringify(st));
test("completed giant leaves both work lists", L.giantWorks(led2, ["g1"]).length === 0 && L.pendingWorks(led2, ["g1"]).length === 0);

// ── 8. (--real) cap invariant on real Ben-Yehuda long works ───────────────────
async function realCheck() {
  const { createIngestCore } = require("./lib/ingestCore");
  const BY_DIR = path.join(REPO, ".tmp", "benyehuda");
  const CSV_PATH = path.join(BY_DIR, "pseudocatalogue.csv");
  if (!fs.existsSync(CSV_PATH)) { test("--real: pseudocatalogue.csv present", false, CSV_PATH); return; }
  const core = createIngestCore({
    provider: "google-free", byDir: BY_DIR, csvPath: CSV_PATH,
    rawBase: "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master",
    noFetch: false, stamp: new Date().toISOString(), log: () => {},
  });
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const byId = new Map(); for (const r of rows) { const id = by.cleanField(r.ID); if (id) byId.set(String(id), r); }
  const REAL_CAP = 200; // lowered cap makes these real novels exercise the giant path
  for (const id of ["413", "49", "95"]) { // canon's chapterized novels (Peretz, Brenner ×2)
    const r = byId.get(id);
    if (!r) { test("--real: work " + id + " in CSV", false); continue; }
    let raw;
    try { raw = await core.fetchTxt(r.path); }
    catch (e) { test("--real: work " + id + " txt available", false, e.message); continue; }
    const { body } = by.stripFooter(raw);
    const orig = segment(body).length;
    const g = by.chapterizeGiant(body, { segmenter: segment, giantSegments: REAL_CAP });
    const partSegs = g.chapters.map((c) => segment(c.body).length);
    const sum = partSegs.reduce((a, b) => a + b, 0);
    test("real " + id + " «" + (by.cleanField(r.title) || "?") + "» → ≥2 parts (" + g.mode + " ×" + g.chapters.length + ", " + orig + " segs)", g.chapters.length >= 2);
    test("real " + id + ": every part ≤ cap " + REAL_CAP, partSegs.every((n) => n <= REAL_CAP), JSON.stringify(partSegs));
    test("real " + id + ": segments preserved within 5% (" + sum + "/" + orig + ")", sum >= orig * 0.95 && sum <= orig * 1.05);
  }
}

(async () => {
  if (REAL) await realCheck();
  console.log("\n[giant-pass-smoke] " + passed + " passed, " + failed + " failed" + (REAL ? " (incl. --real)" : ""));
  process.exit(failed ? 1 : 0);
})();
