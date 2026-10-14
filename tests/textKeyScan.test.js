// O-083: one scan of a text on the dictionary's list keys — the dictionary and the own-text cards share it.
const test = require("node:test");
const assert = require("node:assert");
const TKS = require("../public/js/text-key-scan.js");
const DP = require("../public/js/dictionary-progress-core.js");
const LTF = require("../public/js/local-text-familiarity.js");
const C = require("../public/js/learning-compass-core.js");

const scan = { rowKeys: [["pid:1", "pid:2"], ["pid:1"], []], rowStats: [{ u: 1, n: 0 }, { u: 2, n: 1 }, { u: 0, n: 0 }] };

test("list ingredients: keyed + unresolved + names = total (the evaluator's invariant); the dictionary uses the same function", () => {
  const ing = TKS.listIngredients({ ...scan, resolverVersion: C.RESOLVER_VERSION });
  assert.deepStrictEqual(ing.key_frequencies, [["pid:1", 2], ["pid:2", 1]]);
  assert.deepStrictEqual([ing.unresolved_token_count, ing.proper_name_token_count, ing.total_token_count], [2, 1, 6]);
  assert.deepStrictEqual(DP.scanIngredients({ ...scan, resolverVersion: C.RESOLVER_VERSION }), ing);
  assert.deepStrictEqual(TKS.listIngredients({ ...scan, from: 1, to: 2 }).key_frequencies, [["pid:1", 1]]);
  // the evaluator accepts it (closed-class words are outside, as in the list)
  const fit = C.evaluateRecordedFamiliarityV2({ ingredients: ing, learner_projection: { state_by_key: { "pid:1": "known" }, scheduled_keys: [], tracked_lexeme_count: 1 } });
  assert.strictEqual(fit.recorded_familiar_pct_lower_bound, 40);   // 2 familiar of 5 (the name leaves the denominator)
});

test("text_token_count counts every Hebrew word of the rows (the reading-time measure)", () => {
  const rows = [{ he_niqqud: "שָׁלוֹם לְךָ, חָבֵר" }, { he_plain: "את הספר" }, { he_plain: "123" }];
  assert.strictEqual(TKS.textTokenCount(rows, 0, rows.length), 5);
  assert.strictEqual(TKS.textTokenCount(rows, 1, 2), 2);
});

test("own-text card descriptor carries the keys generation; without it — the B7 version as before", () => {
  const item = { id: "t1", text_key: "k1", updated_at: "2026-10-15T00:00:00.000Z" };
  assert.strictEqual(LTF.descriptor(item, C).resolver_version, C.RESOLVER_VERSION);
  const d = LTF.descriptor(item, C, "list-keys-scan-v1:120:7:2");
  assert.strictEqual(d.resolver_version, C.RESOLVER_VERSION + "|keys:list-keys-scan-v1:120:7:2");
  assert.strictEqual(d.content_revision, item.updated_at);   // the STALE check still compares the text's own revision
});
