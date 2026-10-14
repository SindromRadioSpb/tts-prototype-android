// Ф4 · Д8-К + O-084: the server keyer reads dl: keys honestly and never borrows another word's gloss.
const test = require("node:test");
const assert = require("node:assert");
const KS = require("../db/keyingService.js");

test("a Dicta-lexicon key has no Pealim gloss and shows its lemma", async () => {
  assert.strictEqual(await KS.glossForItemKey("dl:בר#noun"), null);
  assert.strictEqual(await KS.displayForItemKey("dl:פודקאסט#noun"), "פודקאסט");
  assert.strictEqual(await KS.clozeFormsForItemKey("dl:בר#noun"), null);
});

test("O-084: a spelling key with a part of speech Pealim lacks gets no borrowed gloss", async () => {
  assert.strictEqual(await KS.glossForItemKey("אין#particle"), null);
  assert.strictEqual(await KS.glossForItemKey("אירופה#propernoun"), null);
});

test("O-084: a spelling key without a part of speech keeps an unambiguous Pealim gloss", async () => {
  const g = await KS.glossForItemKey("שלום#");
  assert.ok(g && g.gloss, "שלום# should still resolve");
  KS.unloadNow();
});
