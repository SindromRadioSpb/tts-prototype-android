"use strict";
// Слой слов Ф3: маршрут /api/word-gloss-ctx и ядро ingest/wordGlossCtx.js. Ключ — BYOK; кэш по строке
// (без офлайн-подсказок, чтобы улучшение словаря не заставляло платить снова); строка, где модель
// ответила не на каждое слово, отклоняется и честно возвращается в rejected.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { registerIngestRoutes } = require("../ingest/routes.js");
const WGC = require("../ingest/wordGlossCtx.js");

function harness(gen) {
  const handlers = new Map();
  const app = { post(route, ...chain) { handlers.set(route, chain[chain.length - 1]); } };
  const geminiCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-wgctx-"));
  registerIngestRoutes(app, { makeRateLimiter: () => (_q, _s, n) => n(), geminiCacheDir, generateGeminiContent: gen });
  return { h: handlers.get("/api/word-gloss-ctx"), dir: geminiCacheDir };
}
async function call(h, body) {
  let status = 200, payload;
  await h({ body }, { status(c) { status = c; return this; }, json(v) { payload = v; return v; } });
  return { status, payload };
}
const KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
const ROWS = [
  { i: 4, he: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי", ru: "я помню, что слышал", words: [{ w: "אֲנִי", hint: "я" }, { w: "זוֹכֵר", hint: "помнит" }, { w: "שֶׁשָּׁמַעְתִּי", hint: "что я слышал(а)" }] },
  { i: 7, he: "בְּמוֹצָאֵי שַׁבָּת", ru: "на исходе субботы", words: [{ w: "בְּמוֹצָאֵי", hint: "" }, { w: "שַׁבָּת", hint: "суббота" }] },
];
const answer = (rows) => JSON.stringify({ rows: rows.map((r) => ({ i: r.i, tokens: r.words.map((_, k) => ({ k, gloss: "г" + k })),
  mwe: r.i === 7 ? [{ from: 0, to: 1, gloss: "исход субботы" }] : [] })) });

test("validation rejects a bad request before any key or model use", async () => {
  let calls = 0;
  const { h, dir } = harness(async () => { calls++; return { text: "" }; });
  try {
    assert.equal((await call(h, { rows: [], geminiApiKey: KEY })).status, 400);
    assert.equal((await call(h, { rows: Array.from({ length: WGC.MAX_ROWS + 1 }, (_, i) => ({ i, he: "א", words: [{ w: "א" }] })), geminiApiKey: KEY })).status, 413);
    assert.equal((await call(h, { rows: ROWS })).status, 401);
    assert.equal((await call(h, { rows: ROWS, geminiApiKey: "nope" })).status, 400);
    assert.equal(calls, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("answers every row, caches per row, and never pays twice for the same sentence", async () => {
  let calls = 0, lastPrompt = "";
  const { h, dir } = harness(async ({ scenario, contents, config }) => {
    calls++; lastPrompt = contents;
    assert.equal(scenario.model, "gemini-3.8-flash");
    assert.equal(config.responseMimeType, "application/json");
    const asked = JSON.parse(contents.slice(contents.indexOf("["))).map((r) => ROWS.find((x) => x.i === r.i));
    return { text: answer(asked), usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 } };
  });
  try {
    const first = await call(h, { rows: ROWS, geminiApiKey: KEY });
    assert.equal(first.status, 200);
    assert.equal(first.payload.ok, true);
    assert.equal(first.payload.rows.length, 2);
    const r7 = first.payload.rows.find((r) => r.i === 7);
    assert.deepEqual(r7.mwe, [{ from: 0, to: 1, gloss: "исход субботы" }]);
    assert.match(lastPrompt, /hint/);
    // same rows, different hints, shifted index → served from cache, no new call
    const again = await call(h, { rows: ROWS.map((r) => Object.assign({}, r, { i: r.i + 100, words: r.words.map((x) => ({ w: x.w, hint: "другое" })) })), geminiApiKey: KEY });
    assert.equal(calls, 1);
    assert.ok(again.payload.rows.every((r) => r.fromCache));
    assert.deepEqual(again.payload.rows.map((r) => r.i).sort(), [104, 107]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a row the model did not fully answer is rejected, not mixed", async () => {
  const { h, dir } = harness(async () => ({ text: JSON.stringify({ rows: [
    { i: 4, tokens: [{ k: 0, gloss: "я" }, { k: 1, gloss: "помню" }] },                    // token 2 missing
    { i: 7, tokens: [{ k: 0, gloss: "на исходе" }, { k: 1, gloss: "שבת" }] },              // Hebrew in a gloss
  ] }) }));
  try {
    const r = await call(h, { rows: ROWS, geminiApiKey: KEY });
    assert.equal(r.payload.ok, false);
    assert.deepEqual(r.payload.rows, []);
    assert.deepEqual(r.payload.rejected.map((x) => x.reason).sort(), ["token-gloss", "token-missing"]);
    assert.deepEqual(fs.readdirSync(dir), []);   // nothing cached
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a Gemini error is classified and the key is never echoed", async () => {
  const { h, dir } = harness(async () => { const e = new Error("API key not valid " + KEY); e.status = 400; throw e; });
  try {
    const r = await call(h, { rows: ROWS, geminiApiKey: KEY });
    assert.notEqual(r.status, 200);
    assert.equal(JSON.stringify(r.payload).includes(KEY), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the prompt asks for the written form in context and carries the offline hint", () => {
  const p = WGC.buildPrompt(ROWS);
  assert.match(p, /THAT written form in THAT sentence/);
  assert.match(p, /wrong_hint/);
  assert.ok(p.includes("שֶׁשָּׁמַעְתִּי") && p.includes("что я слышал(а)"));
});
