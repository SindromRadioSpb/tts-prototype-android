// O-090 follow-up: niqqud calls the same Dicta address as morphology, and Dicta's ban is per server IP. One breaker
// covers every path — batch niqqud (dictaCloud), on-demand niqqud and morphology: a refusal to any of them stops
// all of them until the cooldown ends.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");

const premium = path.join(__dirname, "..", "db", "premium");
const morphPath = require.resolve(path.join(premium, "providers", "dictaMorph.js"));
let morphCalls = 0;
require.cache[morphPath] = { id: morphPath, filename: morphPath, loaded: true, exports: { MODEL_VERSION: "dicta-morph-v2",
  analyzeSentence: async () => { morphCalls++; return { ok: true, tokens: [{ word: "שלום" }], model_version: "dicta-morph-v2", provider: "dicta-morph" }; } } };

// Fake Dicta over https.request: `status` decides the answer; every request is counted.
let dictaCalls = 0, status = 200;
https.request = (options, onResponse) => {
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = () => {};
  req.end = () => setImmediate(() => {
    dictaCalls++;
    const res = new EventEmitter();
    res.statusCode = status;
    res.setEncoding = () => {};
    onResponse(res);
    res.emit("data", status === 200 ? JSON.stringify([{ word: "שלום", options: [["שָׁלוֹם", 1]] }]) : "busy");
    res.emit("end");
  });
  return req;
};

const breaker = require(path.join(premium, "dictaBreaker.js"));
const dictaCloud = require(path.join(premium, "providers", "dictaCloud.js"));
const pythonClient = require(path.join(premium, "pythonClient.js"));
const gateway = require(path.join(premium, "niqqudGateway.js"));
const morphology = require(path.join(premium, "morphologyGateway.js"));
const onDemand = require(path.join(premium, "nakdanOnDemand.js"));
pythonClient.nakdan = async () => ({ ok: false, status: 0, body: null, error: "ECONNREFUSED" });   // prod: no sidecar

let now = 1e9;
function reset() { now = 1e9; breaker._state.clock = () => now; breaker._state.until = 0; breaker._state.ms = 0; dictaCalls = 0; morphCalls = 0; status = 200; }

test("a bulk niqqud stops at the first refusal: the rest of the batch is not sent", async () => {
  reset(); status = 503;
  const texts = ["שלום", "עולם", "אני", "לומד", "עברית", "היום", "מחר", "תמיד"];
  const r = await dictaCloud.nakdan(texts);
  assert.strictEqual(dictaCalls, 2);                        // only the first pair was in flight (concurrency 2)
  assert.strictEqual(r.body.rate_limited, true);
  assert.strictEqual(r.body.retry_after_ms, 120000);       // two parallel refusals count once — no doubling
  assert.strictEqual(r.body.errors.length, texts.length);
  assert.ok(r.body.errors.slice(2).every((e) => e.rate_limited && e.status === 0));
  assert.deepStrictEqual(r.body.results, texts.map(() => ""));
});

test("while paused, the niqqud gateway and /api/niqqud say rate_limited without calling Dicta", async () => {
  reset(); status = 503;
  await dictaCloud.nakdan(["שלום"]);
  dictaCalls = 0;
  const g = await gateway.fetchNiqqud(["שלום", "עולם"]);
  assert.deepStrictEqual([g.degraded, g.reason, g.rate_limited, g.retry_after_ms, dictaCalls], [true, "rate_limited", true, 120000, 0]);
  const a = await gateway.annotate("שלום");
  assert.deepStrictEqual([a.ok, a.reason, a.rate_limited, a.warnings[0], dictaCalls], [false, "rate_limited", true, "Dicta asked for a pause", 0]);
});

test("a niqqud refusal pauses morphology, and a morphology refusal pauses niqqud — one ban, one breaker", async () => {
  reset(); status = 503;
  await gateway.fetchNiqqud(["שלום"]);
  const m = await morphology.analyze("שלום עולם");
  assert.deepStrictEqual([m.reason, morphCalls], ["rate_limited", 0]);

  reset();
  breaker.noteRefusal(429, "morphology");
  const g = await gateway.fetchNiqqud(["שלום"]);
  assert.deepStrictEqual([g.reason, dictaCalls], ["rate_limited", 0]);
});

test("on-demand niqqud obeys the shared pause and trips it on its own refusal", async () => {
  reset(); status = 503;
  await dictaCloud.nakdan(["שלום"]);
  await assert.rejects(onDemand.vocalize("שלום עולם"),
    (e) => e.code === "NAKDAN_UNAVAILABLE" && e.retry_after_ms === 120000);

  reset();
  let fetched = 0;
  const client = onDemand.createNakdanClient({ breaker, now: () => now, sleep: async () => {},
    fetchImpl: async () => { fetched++; return { ok: false, status: 503 }; } });
  await assert.rejects(client.vocalize("שלום"), (e) => e.code === "NAKDAN_UNAVAILABLE" && e.retry_after_ms === 120000);
  assert.ok(breaker.openUntil());
  await assert.rejects(client.vocalize("עולם"), (e) => e.code === "NAKDAN_UNAVAILABLE");
  assert.strictEqual(fetched, 1);                           // the second text was not sent
  const g = await gateway.fetchNiqqud(["שלום"]);
  assert.deepStrictEqual([g.reason, dictaCalls], ["rate_limited", 0]);
});

test("after the cooldown the next call is the probe: a refusal doubles the pause, a success resets it", async () => {
  reset(); status = 503;
  await dictaCloud.nakdan(["שלום"]);
  now += 120001;
  const probe = await dictaCloud.nakdan(["שלום", "עולם", "אני"]);
  assert.deepStrictEqual([dictaCalls, probe.body.retry_after_ms], [3, 240000]);
  now += 240001; status = 200;
  const ok = await gateway.fetchNiqqud(["שלום"]);
  assert.deepStrictEqual([ok.degraded, ok.provider, ok.results[0], ok.rate_limited], [false, "dicta-cloud", "שָׁלוֹם", undefined]);
  assert.deepStrictEqual([breaker._state.ms, breaker.openUntil()], [0, 0]);
});
