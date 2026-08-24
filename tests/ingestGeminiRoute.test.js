"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { registerIngestRoutes } = require("../ingest/routes.js");

function makeHarness(generateGeminiContent) {
  const handlers = new Map();
  const app = {
    post(route, ...chain) { handlers.set(route, chain[chain.length - 1]); },
  };
  const geminiCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-gemini-route-"));
  registerIngestRoutes(app, {
    makeRateLimiter: () => (_req, _res, next) => next(),
    geminiCacheDir,
    generateGeminiContent,
  });
  return { handlers, geminiCacheDir };
}

async function invoke(handler, body) {
  let statusCode = 200;
  let payload;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; },
  };
  await handler({ body }, res);
  return { statusCode, payload };
}

test("OCR route writes model-aware cache and attaches request-local source-page provenance", async (t) => {
  let calls = 0;
  const harness = makeHarness(async ({ scenario }) => {
    calls += 1;
    assert.equal(scenario.model, "gemini-3.7-flash");
    return {
      text: JSON.stringify({
        pages: [{ page_index: 1, text: "עמוד אחד" }, { page_index: 2, text: "עמוד שתיים" }],
        language: "he",
        warnings: [],
      }),
      requestedModel: scenario.model,
      modelVersion: "gemini-3.7-flash-20260813",
      responseId: "response-fixture",
      usageMetadata: null,
    };
  });
  t.after(() => fs.rmSync(harness.geminiCacheDir, { recursive: true, force: true }));
  const handler = harness.handlers.get("/api/ingest/extract-file");
  const base = {
    kind: "pdf",
    mimeType: "application/pdf",
    dataBase64: Buffer.from("same-pdf").toString("base64"),
    geminiApiKey: "AIza" + "x".repeat(30),
  };
  const first = await invoke(handler, {
    ...base,
    pageManifest: [
      { pageIndex: 1, sourceFilename: "page-05.png", sourceSha256: "1".repeat(64), sourcePage: 5 },
      { pageIndex: 2, sourceFilename: "page-06.png", sourceSha256: "2".repeat(64), sourcePage: 6 },
    ],
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.model, "gemini-3.7-flash");
  assert.equal(first.payload.modelVersion, "gemini-3.7-flash-20260813");
  assert.equal(first.payload.promptId, "ingest-extract-pages-v2");
  assert.equal(first.payload.fromCache, false);
  assert.deepEqual(first.payload.pages.map((page) => page.sourcePage), [5, 6]);
  assert.match(first.payload.fileSha256, /^[a-f0-9]{64}$/);

  const second = await invoke(handler, {
    ...base,
    pageManifest: [
      { pageIndex: 1, sourceFilename: "renamed-05.png", sourceSha256: "a".repeat(64), sourcePage: 105 },
      { pageIndex: 2, sourceFilename: "renamed-06.png", sourceSha256: "b".repeat(64), sourcePage: 106 },
    ],
  });
  assert.equal(second.payload.fromCache, true);
  assert.deepEqual(second.payload.pages.map((page) => page.sourcePage), [105, 106]);
  assert.equal(calls, 1, "request-local manifest must not cause a second paid model call");

  const cacheFiles = fs.readdirSync(harness.geminiCacheDir);
  assert.equal(cacheFiles.length, 1);
  const cached = JSON.parse(fs.readFileSync(path.join(harness.geminiCacheDir, cacheFiles[0]), "utf8"));
  assert.equal(cached.model, "gemini-3.7-flash");
  assert.equal(cached.promptId, "ingest-extract-pages-v2");
  assert.equal(cached.schemaId, "ingest-extract-pages-schema-v1");
  assert.equal(JSON.stringify(cached).includes("renamed-05.png"), false, "source filenames stay outside shared server cache");
});

test("bad page manifest fails before a provider call", async (t) => {
  let calls = 0;
  const harness = makeHarness(async () => { calls += 1; throw new Error("must not run"); });
  t.after(() => fs.rmSync(harness.geminiCacheDir, { recursive: true, force: true }));
  const result = await invoke(harness.handlers.get("/api/ingest/extract-file"), {
    kind: "pdf",
    mimeType: "application/pdf",
    dataBase64: Buffer.from("pdf").toString("base64"),
    geminiApiKey: "AIza" + "x".repeat(30),
    pageManifest: [{ pageIndex: 1, sourceFilename: "page.png", sourceSha256: "bad" }],
  });
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.error_code, "BAD_PAGE_MANIFEST");
  assert.equal(calls, 0);
});
