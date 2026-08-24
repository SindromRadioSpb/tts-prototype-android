"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const policy = require("../ingest/geminiPolicy.js");
const extract = require("../ingest/geminiExtract.js");

test("Studio BYOK scenarios pin the approved current model without an implicit fallback", () => {
  for (const scenario of ["ocr", "table-he-ru", "table-any-he", "table-seg-he-ru", "retell"]) {
    const selected = policy.getGeminiScenario(scenario);
    assert.equal(selected.model, "gemini-3.7-flash");
    assert.equal(selected.fallbackModel, null);
    assert.ok(selected.promptId);
    assert.ok(selected.schemaId);
  }
  assert.equal(policy.GEMINI_ECONOMY_MODEL, "gemini-3.5-flash-lite");
});

test("usage UI reports the pinned model and does not guess the BYOK billing tier", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const shell = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(server, /geminiModelName:\s*GEMINI_STUDIO_MODEL/);
  assert.match(server, /geminiBillingTier:\s*"byok"/);
  assert.match(shell, /data\.geminiModelName \|\| "gemini-3\.7-flash"/);
  assert.match(shell, /geminiBillingTier === "byok"[^\n]+tierLabel = "BYOK"/);
  assert.doesNotMatch(shell, /geminiModelName \|\| "Gemini 2\.5 Flash"/);
});

test("cache identity changes with model, prompt and schema", () => {
  const base = { model: "gemini-3.7-flash", promptId: "prompt-v1", schemaId: "schema-v1", contentSha256: "a".repeat(64) };
  const first = policy.buildGeminiCacheKey(base);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, policy.buildGeminiCacheKey({ ...base, model: "gemini-3.5-flash-lite" }));
  assert.notEqual(first, policy.buildGeminiCacheKey({ ...base, promptId: "prompt-v2" }));
  assert.notEqual(first, policy.buildGeminiCacheKey({ ...base, schemaId: "schema-v2" }));
});

test("cached provenance is accepted only for the exact requested identity", () => {
  const scenario = policy.getGeminiScenario("ocr");
  const good = { model: scenario.model, promptId: scenario.promptId, schemaId: scenario.schemaId };
  assert.equal(policy.cacheMatchesScenario(good, scenario), true);
  assert.equal(policy.cacheMatchesScenario({ ...good, model: "gemini-flash-latest" }, scenario), false);
  assert.equal(policy.cacheMatchesScenario({ ...good, promptId: "old" }, scenario), false);
  assert.equal(policy.cacheMatchesScenario({ text: "legacy cache" }, scenario), false);
});

test("page manifest is strict, SHA-bound and never changes the model cache identity", () => {
  const source = Buffer.from("fixture-pdf");
  const fileSha256 = crypto.createHash("sha256").update(source).digest("hex");
  const manifest = extract.validatePageManifest([
    { pageIndex: 1, sourceFilename: "page-05.png", sourceSha256: "1".repeat(64), sourcePage: 5 },
    { pageIndex: 2, sourceFilename: "page-06.png", sourceSha256: "2".repeat(64), sourcePage: 6 },
  ]);
  assert.equal(manifest.ok, true);
  const merged = extract.mergePageProvenance(
    [{ pageIndex: 1, text: "עמוד ראשון" }, { pageIndex: 2, text: "עמוד שני" }],
    manifest.value,
    fileSha256,
  );
  assert.deepEqual(merged.pages.map((p) => p.sourcePage), [5, 6]);
  assert.deepEqual(merged.pages.map((p) => p.sourceSha256), ["1".repeat(64), "2".repeat(64)]);
  assert.equal(merged.fileSha256, fileSha256);
  assert.equal(merged.text, "עמוד ראשון\n\nעמוד שני");

  assert.equal(extract.validatePageManifest([
    { pageIndex: 1, sourceFilename: "a.png", sourceSha256: "1".repeat(64) },
    { pageIndex: 1, sourceFilename: "b.png", sourceSha256: "2".repeat(64) },
  ]).ok, false);
  assert.equal(extract.validatePageManifest([
    { pageIndex: 1, sourceFilename: "a.png", sourceSha256: "not-a-sha" },
  ]).ok, false);
});

test("missing OCR page text remains explicit instead of losing its source identity", () => {
  const manifest = extract.validatePageManifest([
    { pageIndex: 1, sourceFilename: "page-05.png", sourceSha256: "1".repeat(64), sourcePage: 5 },
    { pageIndex: 2, sourceFilename: "page-06.png", sourceSha256: "2".repeat(64), sourcePage: 6 },
  ]).value;
  const merged = extract.mergePageProvenance([{ pageIndex: 1, text: "טקסט" }], manifest, "f".repeat(64));
  assert.equal(merged.pages.length, 2);
  assert.equal(merged.pages[1].text, "");
  assert.ok(merged.warnings.includes("PAGE_TEXT_MISSING"));
});
