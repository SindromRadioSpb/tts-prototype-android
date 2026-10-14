// Ф4 · Д8-К (К-4): parsing a text through Dicta — consent, politeness, honest outcome.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

function storage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
global.localStorage = storage();
const DE = require(path.join(__dirname, "..", "public", "js", "dicta-enrich.js"));

function fakeLdb(sentences, have) {
  const saved = [];
  return { saved,
    getSentences: async () => sentences,
    getSentenceMorphForText: async () => have || {},
    saveSentenceMorph: async (tid, sid, model, tokens, provider) => saved.push({ tid, sid, model, n: tokens.length, provider }),
    dbQuery: async () => [{ id: "t1", title: "T", n: sentences.length, have: Object.keys(have || {}).length }] };
}
function okFetch(calls) {
  return async (url, init) => { const b = JSON.parse(init.body); calls.push(b.sentences.length);
    return { json: async () => ({ results: b.sentences.map(() => ({ ok: true, tokens: [{ word: "x" }] })) }) }; };
}

test("consent: the automatic parse needs its own consent on top of the Studio's", () => {
  global.localStorage = storage();
  assert.strictEqual(DE.hasConsent(), false);
  DE.grant({ auto: false });
  assert.strictEqual(DE.hasConsent(), true);
  assert.strictEqual(DE.hasAuto(), false);
  DE.grant({ auto: true });
  assert.strictEqual(DE.hasAuto(), true);
  DE.revokeAuto();
  assert.strictEqual(DE.hasAuto(), false);
});

test("enrichText: only sentences without a parse, 40 per request, saved under the Studio's model", async () => {
  const sents = Array.from({ length: 90 }, (_, i) => ({ id: "s" + i, he_plain: "שלום " + i }));
  const ldb = fakeLdb(sents, { s0: {}, s1: {} });
  const calls = [];
  const r = await DE.enrichText(ldb, "t1", { fetch: okFetch(calls) });
  assert.deepStrictEqual(calls, [40, 40, 8]);
  assert.deepStrictEqual([r.total, r.enriched, r.failed], [88, 88, 0]);
  assert.strictEqual(ldb.saved[0].model, "dicta-morph-v1");
});

test("enrichText: offline stops honestly with the count not sent", async () => {
  const ldb = fakeLdb([{ id: "a", he_plain: "שלום" }]);
  const r = await DE.enrichText(ldb, "t1", { fetch: async () => { throw new Error("offline"); } });
  assert.deepStrictEqual([r.enriched, r.failed], [0, 1]);
  assert.match(r.error, /offline/);
});

test("autoEnrich: does nothing without the automatic consent; within a budget with it", async () => {
  global.localStorage = storage();
  const sents = Array.from({ length: 30 }, (_, i) => ({ id: "s" + i, he_plain: "מילה" }));
  const ldb = fakeLdb(sents);
  assert.deepStrictEqual(await DE.autoEnrich(ldb, { fetch: okFetch([]) }), { ran: false });
  DE.grant({ auto: true });
  const calls = [];
  const r = await DE.autoEnrich(ldb, { fetch: okFetch(calls), budget: 25 });
  assert.strictEqual(r.ran, true);
  assert.strictEqual(r.enriched, 25);
  assert.deepStrictEqual(calls, [25]);
});
