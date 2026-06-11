"use strict";
// BRR-P1-011 · S0 gate — reader-morph offline resolver core, run in Node against the
// REAL shipped Pealim dataset (public/data/inflection/pealim-infl-v12.json.gz). Proves
// the Reading-Room light-morphology spine: tokenize/align + form-first resolution +
// R1-honest provenance (never fabricate). Pairs with browser smoke:reader-morph (S2).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const RM = require(path.join(ROOT, "public", "js", "reader-morph.js"));
const NA = require(path.join(ROOT, "public", "js", "notes-autogen.js"));

// Build the resolver engine once (Node substitute for ReaderMorph.ensureEngine).
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(
  path.join(ROOT, "public", "data", "inflection", "pealim-infl-v12.json.gz"))).toString("utf8"));
const maps = NA.buildResolverMaps(ds.paradigms);
const pidMap = new Map();
for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
const lookup = (k, b) => { const i = ds.index[String(k) + " " + String(b || "")]; return i != null ? ds.paradigms[i] : null; };
const eng = { NA, maps, lookup, pidMap };

// ── pure: tokenizer ──────────────────────────────────────────────────────────
test("tokenize splits on whitespace and keeps niqqud with its letters", () => {
  const w = RM.words("שָׁלוֹם עוֹלָם");
  assert.strictEqual(w.length, 2);
  assert.strictEqual(RM.stripNiqqud(w[0]), "שלום");
  assert.strictEqual(RM.stripNiqqud(w[1]), "עולם");
});

test("maqaf is a separator — compounds split into individual words", () => {
  assert.strictEqual(RM.words("עַל־כֵּן").length, 2);          // maqaf U+05BE between
  assert.strictEqual(RM.words("אֱלֹהֵי־הָאָרֶץ").length, 2);
});

test("tokenize is lossless (words + separators reconstruct the input)", () => {
  const s = "שלום, עולם! 123";
  const joined = RM.tokenize(s).map((t) => t.text).join("");
  assert.strictEqual(joined, s);
});

// ── pure: alignment ──────────────────────────────────────────────────────────
test("alignSurfaceNiqqud pairs consonantal he with its vocalized form", () => {
  const out = RM.alignSurfaceNiqqud("שלום עולם", "שָׁלוֹם עוֹלָם");
  assert.deepStrictEqual(out, [
    { surface: "שלום", niqqud: "שָׁלוֹם" },
    { surface: "עולם", niqqud: "עוֹלָם" },
  ]);
});

test("alignSurfaceNiqqud degrades to empty niqqud when missing (no crash)", () => {
  const out = RM.alignSurfaceNiqqud("שלום עולם", "");
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].niqqud, "");
});

// ── pure: wrap (parity-safe, escaping) ───────────────────────────────────────
test("wrapCellHtml wraps words, escapes HTML, preserves exact text", () => {
  const html = RM.wrapCellHtml("שלום A<b>", null);
  assert.ok(/<span class="rm-w"/.test(html), "word is wrapped in rm-w span");
  assert.ok(html.includes("&lt;b&gt;"), "HTML specials escaped");
  assert.ok(!/<b>/.test(html), "no raw tags injected");
  // textContent (strip tags) must equal the original characters
  const text = html.replace(/<[^>]+>/g, "");
  assert.strictEqual(text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), "שלום A<b>");
});

// ── pure: provenance buckets (R1) ────────────────────────────────────────────
test("provenanceLabel maps channel/confidence to honest buckets", () => {
  assert.strictEqual(RM.provenanceLabel({ channel: "form-first", confidence: 0.92, status: "ok", meaning: "x" }, "noun"), "exact");
  assert.strictEqual(RM.provenanceLabel({ channel: "paradigm", confidence: 0.85, status: "ok", meaning: "x" }, "verb"), "exact");
  assert.strictEqual(RM.provenanceLabel({ channel: "paradigm", confidence: 0.65, status: "ok", meaning: "x" }, "verb"), "likely");
  assert.strictEqual(RM.provenanceLabel({ channel: "meaning-fallback", confidence: 0.6, status: "review", meaning: "x" }, "verb"), "guessed");
  assert.strictEqual(RM.provenanceLabel({ channel: "none", confidence: 0.3, status: "review", meaning: "" }, ""), "unknown");
  assert.strictEqual(RM.provenanceLabel(null, ""), "unknown");
});

// ── integration: form-first resolution against the real dataset ──────────────
test("resolveCore — content words resolve with root + gloss (form-first, exact)", async () => {
  const shalom = await RM.resolveCore(eng, "שלום", "שָׁלוֹם");
  assert.strictEqual(shalom.root, "שלם");
  assert.strictEqual(shalom.pos, "noun");
  assert.match(shalom.meaning, /мир/);
  assert.strictEqual(shalom.channel, "form-first");
  assert.strictEqual(shalom.label, "exact");
  assert.strictEqual(shalom.pealim_id, "3126");

  const katav = await RM.resolveCore(eng, "כתב", "כָּתַב");
  assert.strictEqual(katav.root, "כתב");
  assert.strictEqual(katav.binyan, "paal");
  assert.strictEqual(katav.pos, "verb");
  assert.match(katav.meaning, /писать/);
  assert.strictEqual(katav.label, "exact");
});

test("resolveCore — niqqud disambiguates homographs (the moat)", async () => {
  const sefer = await RM.resolveCore(eng, "ספר", "סֵפֶר");   // book
  const safar = await RM.resolveCore(eng, "ספר", "סָפַר");   // count (paal)
  const siper = await RM.resolveCore(eng, "ספר", "סִפֵּר");  // tell (piel)
  assert.strictEqual(sefer.pos, "noun");
  assert.match(sefer.meaning, /книг/);
  assert.strictEqual(safar.pos, "verb");
  assert.strictEqual(safar.binyan, "paal");
  assert.strictEqual(siper.pos, "verb");
  assert.strictEqual(siper.binyan, "piel");
  // distinct senses → distinct Pealim entries, all decisive
  const ids = new Set([sefer.pealim_id, safar.pealim_id, siper.pealim_id]);
  assert.strictEqual(ids.size, 3, "three distinct pealim_ids for the three vocalizations");
  for (const c of [sefer, safar, siper]) assert.strictEqual(c.label, "exact");
});

// ── integration: R1 honesty — never fabricate ────────────────────────────────
test("resolveCore — proper nouns / unknown words return honest empty", async () => {
  for (const [surf, niq] of [["אברהם", "אַבְרָהָם"], ["xyz", "xyz"]]) {
    const c = await RM.resolveCore(eng, surf, niq);
    assert.strictEqual(c.meaning, "", surf + " must have no fabricated gloss");
    assert.strictEqual(c.label, "unknown", surf + " must be labelled unknown");
  }
});

test("resolveCore — definite article הַ resolves correctly (the #1 Hebrew pattern)", async () => {
  // הַ geminates the next consonant with a dagesh; reader-morph strips the article +
  // that dagesh so the bare cell matches form-first (correct reading, not a homograph).
  const king = await RM.resolveCore(eng, "המלך", "הַמֶּלֶךְ");
  assert.strictEqual(king.root, "מלך");
  assert.match(king.meaning, /царь|король/);
  assert.strictEqual(king.label, "exact");
  const dawn = await RM.resolveCore(eng, "השחר", "הַשַּׁחַר");
  assert.match(dawn.meaning, /рассвет|заря/, "the dawn — not the 'blacken' homograph");
  assert.strictEqual(dawn.label, "exact");
});

test("resolveCore — article variant only wins when more decisive; ה-root words unharmed", async () => {
  // הָר / הָיָה begin with a ROOT ה (not the article) — the original form must win, so
  // the meaning stays correct (mountain / to be), proving no false article-strip.
  const har = await RM.resolveCore(eng, "הר", "הָר");
  assert.match(har.meaning, /гор/, "הָר must stay 'mountain', not be mis-stripped");
  const haya = await RM.resolveCore(eng, "היה", "הָיָה");
  assert.strictEqual(haya.root, "היה");
});

test("resolveCore — a still-heuristic gloss is labelled, never claimed exact (R1)", async () => {
  // הָאָרֶץ yields a real gloss but not via a decisive cell match → must stay < exact.
  const c = await RM.resolveCore(eng, "הארץ", "הָאָרֶץ");
  assert.notStrictEqual(c.label, "exact", "heuristic resolution must not claim certainty");
});

test("resolveCore — R1 invariant: 'exact' only for form-first or paradigm≥0.85", async () => {
  const samples = ["שָׁלוֹם", "כָּתַב", "מֶלֶךְ", "סֵפֶר", "סָפַר", "גָּדוֹל", "בַּיִת", "הָלַךְ", "הַמֶּלֶךְ", "אַבְרָהָם", "יוֹם", "טוֹב"];
  for (const niq of samples) {
    const c = await RM.resolveCore(eng, RM.stripNiqqud(niq), niq);
    if (c.label === "exact") {
      assert.ok(c.channel === "form-first" || (c.channel === "paradigm" && c.confidence >= 0.85),
        `${niq}: exact must be backed by form-first/paradigm≥0.85 (got ${c.channel}/${c.confidence})`);
    }
    if (c.label === "unknown") assert.strictEqual(c.meaning, "", `${niq}: unknown must have empty gloss`);
  }
});
