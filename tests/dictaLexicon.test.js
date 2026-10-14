// Ф4 · Д8-К — the device's Dicta lexicon (spelling → Dicta lemma), the identity of a word Pealim does not read.
// Spec: docs/planning/word-layer/F4_D8K_ROLE_CRITIQUE_2026_10_14.md («Архитектура реализации»).
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const DL = require(path.join(__dirname, "..", "public", "js", "dicta-lexicon.js"));

const tok = (word, lemma, pos, extra) => Object.assign({ word, lemma, posDicta: pos, prefix: "", niqqud: "" }, extra || {});

test("classes: content / function / name by Dicta's part of speech", () => {
  assert.strictEqual(DL.classOf("noun"), "content");
  assert.strictEqual(DL.classOf("verb"), "content");
  assert.strictEqual(DL.classOf("adverb"), "content");
  assert.strictEqual(DL.classOf("numeral"), "content");
  assert.strictEqual(DL.classOf(null), "content");          // a lemma without a part of speech is still a word
  assert.strictEqual(DL.classOf("pronoun"), "function");
  assert.strictEqual(DL.classOf("preposition"), "function");
  assert.strictEqual(DL.classOf("negation"), "function");
  assert.strictEqual(DL.classOf("propernoun"), "name");
});

test("skeleton: letters only, finals folded, geresh/apostrophe/dots dropped", () => {
  assert.strictEqual(DL.skeleton("בְּאוֹקְטוֹבֶּר"), "באוקטובר");
  assert.strictEqual(DL.skeleton("ג'יהאד"), "גיהאד");
  assert.strictEqual(DL.skeleton("ג׳יהאד"), "גיהאד");
  assert.strictEqual(DL.skeleton("שָׁלוֹם"), "שלומ");
});

test("observe: the first reading of a spelling is kept; another reading only marks it ambiguous (append-only)", () => {
  const lex = new Map();
  const ch1 = DL.observe(lex, [tok("פודקאסט", "פודקאסט", "noun"), tok("בפודקאסט", "פודקאסט", "noun", { prefix: "ב" })], "t1");
  assert.strictEqual(ch1.length, 2);
  const e = lex.get("פודקאסט");
  assert.deepStrictEqual([e.lemma, e.pos, e.cls, e.n, e.amb], ["פודקאסט", "noun", "content", 1, false]);
  assert.strictEqual(lex.get("בפודקאסט").prefix, "ב");
  DL.observe(lex, [tok("פודקאסט", "פודקאסט", "noun")]);
  assert.strictEqual(lex.get("פודקאסט").n, 2);
  // a different lemma for the same spelling: the key stays the first one, the entry is marked
  DL.observe(lex, [tok("פודקאסט", "פודקסט", "verb")]);
  const e2 = lex.get("פודקאסט");
  assert.strictEqual(DL.keyOf(e2), "dl:פודקאסט#noun");
  assert.strictEqual(e2.amb, true);
  assert.strictEqual(e2.altN, 1);
});

test("observe: one-letter tokens, empty tokens and lemma-less function words are not entries", () => {
  const lex = new Map();
  DL.observe(lex, [tok("ב", "ב", "preposition"), tok("שלום", "", "noun"), tok("לו", "", "preposition", { stem: "לו" }), { word: "" }]);
  assert.strictEqual(lex.size, 0);
});

test("observe: a word Dicta knows no lemma for takes its stem, marked noLemma", () => {
  const lex = new Map();
  DL.observe(lex, [tok("פודקאסט", "", "noun", { stem: "פודקאסט" }), tok("החות'ים", "", "noun", { stem: "החות'ים" })]);
  const e = lex.get("פודקאסט");
  assert.deepStrictEqual([e.lemma, e.noLemma, DL.keyOf(e)], ["פודקאסט", true, "dl:פודקאסט#noun"]);
  assert.strictEqual(lex.get("החותימ").lemma, "החותים");
  assert.strictEqual(DL.fromRows([DL.toRow(e)]).get("פודקאסט").noLemma, true);
});

test("keyOf: only a content entry has a dictionary key; it never looks like a Pealim key", () => {
  assert.strictEqual(DL.keyOf({ cls: "content", lemma: "אוקטובר", pos: "noun" }), "dl:אוקטובר#noun");
  assert.strictEqual(DL.keyOf({ cls: "content", lemma: "היי", pos: "" }), "dl:היי#");
  assert.strictEqual(DL.keyOf({ cls: "name", lemma: "חמאס", pos: "propernoun" }), "");
  assert.strictEqual(DL.keyOf({ cls: "function", lemma: "זה", pos: "pronoun" }), "");
  assert.ok(!/^pid:/.test(DL.keyOf({ cls: "content", lemma: "pid", pos: "noun" })));
});

test("keyLemma / isDictaKey: the readable half of a dl: key", () => {
  assert.strictEqual(DL.isDictaKey("dl:אוקטובר#noun"), true);
  assert.strictEqual(DL.isDictaKey("אוקטובר#noun"), false);
  assert.deepStrictEqual(DL.parseKey("dl:אוקטובר#noun"), { lemma: "אוקטובר", pos: "noun" });
  assert.strictEqual(DL.parseKey("pid:12"), null);
});

test("rows ↔ entries round-trip (the stored form)", () => {
  const lex = new Map();
  DL.observe(lex, [tok("חמאס", "חמאס", "propernoun"), tok("פודקאסט", "פודקאסט", "noun", { niqqud: "פּוֹדְקַאסְט" })]);
  const rows = Array.from(lex.values()).map(DL.toRow);
  const back = DL.fromRows(rows);
  assert.deepStrictEqual(back.get("פודקאסט"), lex.get("פודקאסט"));
  assert.strictEqual(back.get("חמאס").cls, "name");
});

test("refresh: folds only new sentence_morph rows; a stored entry keeps its first reading", async () => {
  const store = { rows: new Map(), last: 0, morph: [] };
  const ldb = {
    getDictaLexiconRows: async () => Array.from(store.rows.values()),
    getDictaLexiconState: async () => ({ lastRowid: store.last }),
    listSentenceMorphSince: async (after, limit) => store.morph.filter((m) => m.rid > after).slice(0, limit),
    saveDictaLexicon: async (rows, last) => {
      rows.forEach((r) => { const old = store.rows.get(r.skeleton); store.rows.set(r.skeleton, old ? Object.assign({}, old, { n: r.n, alt_n: r.alt_n }) : r); });
      store.last = last;
    },
  };
  store.morph.push({ rid: 1, tokens_json: JSON.stringify([tok("חמאס", "חמאס", "propernoun"), tok("פודקאסט", "", "noun", { stem: "פודקאסט" })]) });
  let lex = await DL.refresh(ldb);
  assert.strictEqual(lex.size, 2);
  assert.strictEqual(store.last, 1);
  // a later text reads פודקאסט differently: the key stays, the entry is ambiguous; the old row is not re-read
  store.morph.push({ rid: 2, tokens_json: JSON.stringify([tok("פודקאסט", "פודקסט", "verb")]) });
  lex = await DL.refresh(ldb);
  assert.strictEqual(DL.keyOf(lex.get("פודקאסט")), "dl:פודקאסט#noun");
  assert.strictEqual(lex.get("פודקאסט").amb, true);
  assert.strictEqual(store.rows.get("פודקאסט").lemma, "פודקאסט");
  assert.strictEqual(store.rows.get("פודקאסט").alt_n, 1);
  assert.strictEqual(store.last, 2);
  // nothing new: no write, same lexicon
  lex = await DL.refresh(ldb);
  assert.strictEqual(lex.get("חמאס").n, 1);
});
