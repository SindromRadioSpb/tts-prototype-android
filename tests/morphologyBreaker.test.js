// A sustained load gets this server's IP refused by Dicta (HTTP 503) for every user — after one refusal nobody calls
// Dicta until the cooldown ends (2 min, doubling up to 15), the next call is the probe, a success resets it.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const provPath = require.resolve(path.join(__dirname, "..", "db", "premium", "providers", "dictaMorph.js"));
let calls = 0, mode = "ok";
require.cache[provPath] = { id: provPath, filename: provPath, loaded: true, exports: { MODEL_VERSION: "dicta-morph-v2",
  analyzeSentence: async () => { calls++;
    if (mode === "503") { const e = new Error("Dicta morph: HTTP 503"); e.status = 503; throw e; }
    return { ok: true, tokens: [{ word: "שלום" }], model_version: "dicta-morph-v2", provider: "dicta-morph" }; } } };
const G = require(path.join(__dirname, "..", "db", "premium", "morphologyGateway.js"));

test("503 opens the breaker: no calls during the cooldown, probe after it, doubling, success resets", async () => {
  let now = 1e9; G._breaker.clock = () => now;
  assert.strictEqual((await G.analyze("שלום")).ok, true);
  mode = "503"; calls = 0;
  const a = await G.analyze("שלום");
  assert.deepStrictEqual([a.ok, a.reason, a.retry_after_ms, calls], [false, "rate_limited", 120000, 1]);
  const b = await G.analyze("עולם");
  assert.deepStrictEqual([b.reason, calls], ["rate_limited", 1]);      // not sent
  assert.ok(G.rateLimitedUntil());
  now += 120001;
  const c = await G.analyze("עולם");                                   // the probe, refused again → 4 min
  assert.deepStrictEqual([c.reason, c.retry_after_ms, calls], ["rate_limited", 240000, 2]);
  now += 240001; mode = "ok";
  assert.strictEqual((await G.analyze("עולם")).ok, true);
  assert.strictEqual(G._breaker.ms, 0);
  assert.strictEqual(G.rateLimitedUntil(), 0);
  delete G._breaker.clock;
});
