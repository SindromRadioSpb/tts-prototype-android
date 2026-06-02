"use strict";

// Pealim parser smoke. Offline by default (parses saved fixtures); pass
// --live to also hit www.pealim.com (network-gated, polite single fetches).
//
//   node scripts/premium/pealim-parse-smoke.js
//   node scripts/premium/pealim-parse-smoke.js --live

const fs = require("fs");
const path = require("path");
const P = require("../../db/premium/providers/pealim");

const FX = path.join(__dirname, "fixtures");
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); } }

function testVerb() {
  console.log("VERB fixture — לכתוב (paal):");
  const html = fs.readFileSync(path.join(FX, "pealim-verb-lichtov.html"), "utf8");
  const p = P.parsePealimPage(html);
  ok("parsed", !!p);
  if (!p) return;
  ok("kind=verb", p.kind === "verb", p.kind);
  ok("binyan=paal", p.binyan === "paal", p.binyan);
  ok("root=כתב", p.root === "כתב", p.root);
  ok("present AP-ms present", p.cells["AP-ms"] && p.cells["AP-ms"].he === "כּוֹתֵב", p.cells["AP-ms"] && p.cells["AP-ms"].he);
  ok("AP-ms translit", p.cells["AP-ms"] && /котев/i.test(p.cells["AP-ms"].translit), p.cells["AP-ms"] && p.cells["AP-ms"].translit);
  ok("past PERF-3ms = כתב", p.cells["PERF-3ms"] && P.stripNiqqud(p.cells["PERF-3ms"].he) === "כתב", p.cells["PERF-3ms"] && p.cells["PERF-3ms"].he);
  ok("future IMPF-3ms present", !!p.cells["IMPF-3ms"], JSON.stringify(Object.keys(p.cells).filter(k => k.startsWith("IMPF")).slice(0, 4)));
  ok("imperative IMP-2ms present", !!p.cells["IMP-2ms"]);
  ok("infinitive INF-L present", !!p.cells["INF-L"], p.cells["INF-L"] && p.cells["INF-L"].he);
  ok("≥18 cells", Object.keys(p.cells).length >= 18, String(Object.keys(p.cells).length));
  // v2: stress <b> preserved in translit_html; imperative clean (no &rlm;/!).
  ok("AP-ms translit_html has stress span", p.cells["AP-ms"] && /<b class="v3-conj-stress">/.test(p.cells["AP-ms"].translit_html), p.cells["AP-ms"] && p.cells["AP-ms"].translit_html);
  const imp = p.cells["IMP-2ms"] || {};
  ok("IMP-2ms clean (no &rlm;/&/;/!)", !/[&;!]|rlm/i.test(String(imp.he) + String(imp.translit) + String(imp.translit_html)), JSON.stringify(imp));
}

function testNoun() {
  console.log("NOUN fixture — ספר (sefer):");
  const html = fs.readFileSync(path.join(FX, "pealim-noun-sefer.html"), "utf8");
  const p = P.parsePealimPage(html);
  ok("parsed", !!p);
  if (!p) return;
  ok("kind=noun", p.kind === "noun", p.kind);
  ok("pos=noun", p.pos === "noun", p.pos);
  ok("root=ספר", p.root === "ספר", p.root);
  ok("binyan=null", p.binyan === null, String(p.binyan));
  ok("absolute sg 's'", p.cells["s"] && /סֵפֶר/.test(p.cells["s"].he), p.cells["s"] && p.cells["s"].he);
  ok("absolute pl 'p'", !!p.cells["p"], p.cells["p"] && p.cells["p"].he);
  ok("construct sg 'sc'", !!p.cells["sc"], p.cells["sc"] && p.cells["sc"].he);
  ok("construct pl 'pc'", !!p.cells["pc"]);
  ok("possessive s-P-3ms", !!p.cells["s-P-3ms"], p.cells["s-P-3ms"] && p.cells["s-P-3ms"].he);
  ok("possessive p-P-3ms", !!p.cells["p-P-3ms"]);
}

function testSearch() {
  console.log("SEARCH fixture — כתב:");
  const html = fs.readFileSync(path.join(FX, "pealim-search-ktv.html"), "utf8");
  const links = P.parseSearchLinks(html);
  ok("≥1 dict link", links.length >= 1, String(links.length));
  ok("links have numeric id", links.every((l) => /^\d+$/.test(l.id)));
}

function testBinyanMap() {
  console.log("Binyan map (Pealim RU → app):");
  const cases = [["ПААЛЬ", "paal"], ["НИФЪАЛЬ", "nifal"], ["ПИЭЛЬ", "piel"], ["ПУАЛЬ", "pual"], ["hИФЪИЛЬ", "hifil"], ["hУФЪАЛЬ", "hufal"], ["hИТПАЭЛЬ", "hitpael"]];
  for (const [ru, want] of cases) ok(ru + "→" + want, P.pealimBinyanToApp(ru) === want, P.pealimBinyanToApp(ru));
}

async function testLive() {
  console.log("LIVE — resolveLemma(כתב, paal):");
  try {
    const r = await P.resolveLemma("כתב", { pos: "verb", binyan: "paal", root: "כתב" });
    ok("ok", r.ok, r.reason);
    ok("verb kind", r.ok && r.paradigm.kind === "verb");
    ok("disambig match", r.ok && r.paradigm.disambig === "match", r.ok && r.paradigm.disambig);
    ok("has present", r.ok && !!r.paradigm.cells["AP-ms"]);
  } catch (e) { ok("live no throw", false, e.message); }
  // POS-dominant homograph disambiguation: שבת as a NOUN must pick shabat
  // (id 5078), NOT the verb לשבות (id 2139) — both share root שבת. The noun is
  // the 4th search result, so this also guards the candidate-scan depth.
  try {
    const n = await P.resolveLemma("שבת", { pos: "noun", root: "שבת" });
    ok("שבת noun → noun kind", n.ok && n.paradigm.kind === "noun", n.ok && n.paradigm.kind);
    ok("שבת noun → id 5078 (shabat, not 2139 lishbot)", n.ok && String(n.paradigm.pealim_id) === "5078", n.ok && n.paradigm.pealim_id);
    const v = await P.resolveLemma("שבת", { pos: "verb", binyan: "paal", root: "שבת" });
    ok("שבת verb → verb kind id 2139 (lishbot)", v.ok && v.paradigm.kind === "verb" && String(v.paradigm.pealim_id) === "2139", v.ok && (v.paradigm.kind + ":" + v.paradigm.pealim_id));
  } catch (e) { ok("homograph live no throw", false, e.message); }
  // POS audit matrix: content words have a forms table; function words don't
  // (Pealim has no conj-td cells → resolveLemma ok:false). The client gates the
  // accordion by POS so these never reach resolveLemma, but we pin the data fact.
  try {
    console.log("POS audit matrix (live):");
    const content = [["כתב", { pos: "verb", binyan: "paal", root: "כתב" }], ["ספר", { pos: "noun", root: "ספר" }], ["יפה", { pos: "adjective", root: "יפה" }]];
    for (const [w, o] of content) { const r = await P.resolveLemma(w, o); ok("  content " + w + " → has table", r.ok && r.paradigm && Object.keys(r.paradigm.cells).length > 0, r.ok ? "ok" : r.reason); }
    // Function words don't inflect → invariant single-form profile (not a table).
    for (const w of ["מה", "אז"]) { const r = await P.resolveLemma(w, {}); ok("  function " + w + " → invariant profile", r.ok && r.paradigm.kind === "invariant" && !!r.paradigm.form, r.ok ? ("kind=" + r.paradigm.kind) : r.reason); }
    // בטח adverb (בֶּטַח): no paradigm, but a single-form "invariant" profile —
    // NEVER the verb homograph בָּטַח. (Profile: vocalized form + stress translit.)
    for (const o of [{ pos: "adverb" }, {}]) {
      const r = await P.resolveLemma("בטח", o);
      const inv = r.ok && r.paradigm.kind === "invariant" && r.paradigm.form && /<b class="v3-conj-stress">/.test(r.paradigm.form.translit_html || "");
      ok("  בטח pos=" + JSON.stringify(o.pos || "") + " → invariant profile (not verb)", inv, r.ok ? ("kind=" + r.paradigm.kind + " id=" + r.paradigm.pealim_id) : r.reason);
    }
    // Function-word ("other") must pick its OWN entry, not a content homograph:
    // אבל is the conjunction aval (4642), NOT the noun evel (3195) on the same root.
    { const r = await P.resolveLemma("אבל", { pos: "other" }); ok("  אבל pos=other → conjunction aval (4642), not noun evel", r.ok && r.paradigm.kind === "invariant" && String(r.paradigm.pealim_id) === "4642", r.ok ? ("kind=" + r.paradigm.kind + " id=" + r.paradigm.pealim_id) : r.reason); }
    // Prepositions DO decline with pronoun suffixes (P-1s…) → have a table.
    for (const w of ["את", "על"]) { const r = await P.resolveLemma(w, { pos: "preposition" }); ok("  preposition " + w + " → declined table (P-*)", r.ok && r.paradigm && !!r.paradigm.cells["P-1s"], r.ok ? "ok" : r.reason); }
    // Declined preposition whose Pealim HEADWORD ≠ surface lemma: אחרי declines off
    // the base אַחַר, so its page lemma is "אחר" ≠ "אחרי" and neither POS class
    // (wantClass(preposition)=null) nor exact-lemma fires. The structural P-1s
    // signal must still resolve it (regression guard for the audit fix).
    { const r = await P.resolveLemma("אחרי", { pos: "preposition" }); ok("  אחרי (headword≠surface) → declined table via P-* signal", r.ok && r.paradigm && !!r.paradigm.cells["P-1s"] && !!r.paradigm.cells["P-3ms"], r.ok ? ("id=" + r.paradigm.pealim_id) : r.reason); }
    // Enh: ktiv haser→male tolerant lemma match — the defective spelling מאד must
    // resolve to the invariant profile whose headword is the male spelling מאוד.
    { const r = await P.resolveLemma("מאד", { pos: "adverb" }); ok("  מאד (ktiv haser) → invariant profile (matched מאוד)", r.ok && r.paradigm.kind === "invariant" && !!r.paradigm.form, r.ok ? ("kind=" + r.paradigm.kind) : r.reason); }
    // Enh: proclitic stripping — a raw surface with stacked proclitics resolves to
    // the stem; shallow-first peel must NOT over-strip (המים→מים water, not ים sea).
    { const r = await P.resolveLemma("וכשהמלך", { pos: "noun", root: "מלך" }); ok("  וכשהמלך (4 proclitics) → noun מלך", r.ok && r.paradigm.kind === "noun" && P.stripNiqqud(r.paradigm.lemma) === "מלך", r.ok ? ("lemma=" + r.paradigm.lemma) : r.reason); }
    { const r = await P.resolveLemma("המים", { pos: "noun" }); ok("  המים → מים (NOT over-peeled to ים)", r.ok && P.stripNiqqud(r.paradigm.lemma) === "מים", r.ok ? ("lemma=" + r.paradigm.lemma) : r.reason); }
    // Function-word base form ≠ root: the adverb בחוץ is its OWN Pealim entry
    // (bachutz 6551), while its root חוץ is the NOUN. The client must query the
    // Dicta BASE form for function words, not the root (else wrong word + link).
    { const r = await P.resolveLemma("בחוץ", { pos: "adverb" }); ok("  בחוץ adverb → invariant bachutz (id 6551), NOT the noun root חוץ", r.ok && r.paradigm.kind === "invariant" && String(r.paradigm.pealim_id) === "6551", r.ok ? ("kind=" + r.paradigm.kind + " id=" + r.paradigm.pealim_id) : r.reason); }
    { const r = await P.resolveLemma("חוץ", { pos: "adverb" }); ok("  חוץ as adverb → no_confident_match (it's the NOUN; justifies base-form query)", !r.ok && r.reason === "no_confident_match", r.ok ? ("wrongly ok id=" + r.paradigm.pealim_id) : r.reason); }
    // Binyan-homograph disambiguation (root גלה): paal לִגְלוֹת (333, תִּגְלִי) vs piel
    // לְגַלּוֹת (331, תְּגַלִּי). (a) a binyan hint must win past the early-exit; (b) the
    // text's vocalized form alone (no binyan) must pick the right verb.
    { const r = await P.resolveLemma("גלה", { pos: "verb", binyan: "piel", root: "גלה" }); ok("  גלה+piel → לְגַלּוֹת (id 331, not paal 333) — binyan-gated early-exit", r.ok && String(r.paradigm.pealim_id) === "331", r.ok ? ("id=" + r.paradigm.pealim_id + " binyan=" + r.paradigm.binyan) : r.reason); }
    { const r = await P.resolveLemma("גלה", { pos: "verb", form: "תְּגַלִּי" }); ok("  גלה+form תְּגַלִּי → piel 331 (niqqud picks verb, no binyan)", r.ok && String(r.paradigm.pealim_id) === "331", r.ok ? ("id=" + r.paradigm.pealim_id) : r.reason); }
    { const r = await P.resolveLemma("גלה", { pos: "verb", form: "תִּגְלִי" }); ok("  גלה+form תִּגְלִי → paal 333 (niqqud picks the other verb)", r.ok && String(r.paradigm.pealim_id) === "333", r.ok ? ("id=" + r.paradigm.pealim_id) : r.reason); }
    // Inflected-surface fallback: Pealim doesn't index the hitpael לְהִסְתַּכֵּל under
    // the bare root סכל (search סכל → only the piel 1351). Dicta hands lemma=סכל, so
    // the right verb is found only by re-searching the niqqud-stripped surface תסתכלי.
    { const r = await P.resolveLemma("סכל", { pos: "verb", binyan: "hitpael", root: "סכל", form: "תִּסְתַּכְּלִי" }); ok("  סכל+hitpael+form תִּסְתַּכְּלִי → hitpael להסתכל (1352), not piel 1351 — surface fallback", r.ok && String(r.paradigm.pealim_id) === "1352" && r.paradigm.binyan === "hitpael", r.ok ? ("id=" + r.paradigm.pealim_id + " binyan=" + r.paradigm.binyan) : r.reason); }
    // Corpus-sweep fixes (v10): noun↔adjective kinship — Dicta tags עשיר as "noun"
    // but its Pealim entry is pos=adjective; must resolve, not −100 reject.
    { const r = await P.resolveLemma("עשיר", { pos: "noun", root: "עשיר", form: "עֲשִׁירִים" }); ok("  עשיר pos=noun → resolves (Pealim adjective, noun↔adj kin)", r.ok && r.paradigm.pos === "adjective", r.ok ? ("id=" + r.paradigm.pealim_id + " pos=" + r.paradigm.pos) : r.reason); }
    // Surface-fallback fires on a WRONG-binyan form hit: נִמְצָא is paal future-1pl
    // AND nifal present; want=nifal must reach the nifal (1084), not stop on paal.
    { const r = await P.resolveLemma("מצא", { pos: "verb", binyan: "nifal", root: "מצא", form: "נִמְצָא" }); ok("  מצא+nifal+form נִמְצָא → nifal 1084 (not paal 1083)", r.ok && String(r.paradigm.pealim_id) === "1084" && r.paradigm.binyan === "nifal", r.ok ? ("id=" + r.paradigm.pealim_id + " binyan=" + r.paradigm.binyan) : r.reason); }
    // Proclitic-stacked verb surface (v11): שֶׁלְּהַחֲלִים = ש+ל+הַחֲלִים — search(שלהחלים)
    // is empty, but the hifil לְהַחְלִים (606) is found by peeling proclitics off the
    // surface form in the fallback. The bare root חלם search alone misses the hifil.
    { const r = await P.resolveLemma("חלם", { pos: "verb", binyan: "hifil", root: "חלם", form: "שֶׁלְּהַחֲלִים" }); ok("  חלם+hifil+form שֶׁלְּהַחֲלִים → hifil להחלים (606) via proclitic-peel surface", r.ok && String(r.paradigm.pealim_id) === "606" && r.paradigm.binyan === "hifil", r.ok ? ("id=" + r.paradigm.pealim_id + " binyan=" + r.paradigm.binyan) : r.reason); }
  } catch (e) { ok("pos-matrix live no throw", false, e.message); }
}

(async () => {
  testVerb(); testNoun(); testSearch(); testBinyanMap();
  if (process.argv.includes("--live")) await testLive();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
