"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildOcrDraft,
  writeOcrDraft,
  readOcrDraft,
  discardOcrDraft,
  OCR_DRAFT_KEY,
  OCR_DRAFT_TTL_MS,
} = require("../public/js/studio-import.js");

function storageHarness() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function preview() {
  return {
    kind: "pdf",
    source: "physics-batch-03.pdf",
    method: "gemini-pdf",
    model: "gemini-3.7-flash",
    requestedModel: "gemini-3.7-flash",
    modelVersion: "gemini-3.7-flash-20260813",
    promptId: "ingest-extract-pages-v2",
    schemaId: "ingest-extract-pages-schema-v1",
    fileSha256: "a".repeat(64),
    pages: [{ page_index: 1, text: "שאלה 7.1", sourcePage: 30, sourceSha256: "b".repeat(64) }],
    fromCache: true,
    cacheKey: "cache-key",
    warnings: [],
    text: "שאלה 7.1\nנתון גוף",
    geminiApiKey: "must-never-persist",
  };
}

test("OCR draft is a bounded credential-free recovery artifact", () => {
  const draft = buildOcrDraft(preview(), "שאלה 7.1\nנתון גוף מתוקן", 1_000);
  assert.equal(draft.v, 1);
  assert.equal(draft.expires_at_ms, 1_000 + OCR_DRAFT_TTL_MS);
  assert.equal(draft.reviewed_text, "שאלה 7.1\nנתון גוף מתוקן");
  assert.equal(draft.preview.fileSha256, "a".repeat(64));
  assert.equal(draft.preview.pages[0].sourcePage, 30);
  assert.doesNotMatch(JSON.stringify(draft), /must-never-persist|geminiApiKey/);
});

test("OCR draft survives reload, preserves edits, and expires closed", () => {
  const storage = storageHarness();
  assert.equal(writeOcrDraft(storage, preview(), "исправленный текст", 2_000), true);
  const restored = readOcrDraft(storage, 2_001);
  assert.equal(restored.preview.source, "physics-batch-03.pdf");
  assert.equal(restored.preview.fromCache, true);
  assert.equal(restored.reviewedText, "исправленный текст");
  assert.equal(readOcrDraft(storage, 2_000 + OCR_DRAFT_TTL_MS), null);
  assert.equal(storage.getItem(OCR_DRAFT_KEY), null, "expired draft is removed rather than silently reused");
});

test("OCR draft rejects non-OCR and oversized text, and supports explicit deletion", () => {
  assert.equal(buildOcrDraft({ kind: "url", text: "article" }, "article", 1), null);
  assert.equal(buildOcrDraft({ kind: "pdf", text: "x".repeat(1_000_001) }, "", 1), null);
  const storage = storageHarness();
  writeOcrDraft(storage, preview(), preview().text, 3_000);
  discardOcrDraft(storage);
  assert.equal(storage.getItem(OCR_DRAFT_KEY), null);
});

test("Add Material exposes explicit restore and delete controls with localized labels", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const studio = fs.readFileSync(path.join(root, "public", "js", "studio-import.js"), "utf8");
  assert.match(html, /id="v3ImportOcrDraftBar"[\s\S]*StudioImport\.restoreOcrDraft\(\)[\s\S]*StudioImport\.clearOcrDraft\(\)/);
  assert.match(studio, /refreshOcrDraftUi\(\)[\s\S]*preview\.addEventListener\("input", onOcrPreviewEdited\)/);
  assert.match(studio, /p\.fromCache === true[\s\S]*studio\.import\.provCacheHit/);
});
