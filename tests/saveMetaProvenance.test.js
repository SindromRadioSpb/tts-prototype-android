// tests/saveMetaProvenance.test.js — a material with its own file provenance must never
// inherit the previous material's source.
//
// Regression (2026-09-18, live): a card built from a local-companion ASR import of
// "<hebrew interview>-720.mp4" opened the save dialog with ИСТОЧНИК pre-filled as
// "Fauda.S05E11.1080p.WEB-DL.RGzsRutracker-mobile-ready.mp4" — the sticky default left by an
// earlier, unrelated save. The override that prevents this already existed, but was keyed to
// provider === "subtitle-track" only, so every other media import fell through to the default.
// The draft header had the same wrong source, because the import session reset clears `title`
// but not `source`.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SI = require(path.join(root, "public/js/studio-import.js"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

const LOCAL_ASR_IMPORT = {
  kind: "audio",
  source: "interview-720.mp4",
  media_package_ref: { package_id: "mpkg:5900c11f", revision_id: "rev:0202bc3a" },
};

test("import session reset clears the previous material's source, not only its title", () => {
  const patch = SI.importSessionResetPatch();
  assert.equal(patch.title, null, "title reset is the existing contract");
  assert.equal(patch.source, null,
    "a new import must not keep the previous material's source in the draft header");
});

test("a media import supplies its own file source instead of the sticky default", () => {
  assert.equal(
    SI.saveMetaSourcePrefill({
      existingSource: null,
      geminiMeta: null,
      importMeta: LOCAL_ASR_IMPORT,
      stickyDefault: "Fauda.S05E11.1080p.WEB-DL.RGzsRutracker-mobile-ready.mp4",
    }),
    "interview-720.mp4"
  );
});

test("the subtitle-track provenance path keeps working", () => {
  assert.equal(
    SI.saveMetaSourcePrefill({
      existingSource: null,
      geminiMeta: { provider: "subtitle-track", source: { source: "lecture.mkv" } },
      importMeta: null,
      stickyDefault: "previous.mp4",
    }),
    "lecture.mkv"
  );
});

test("hand-typed text with no provenance of its own still gets the sticky default", () => {
  assert.equal(
    SI.saveMetaSourcePrefill({
      existingSource: null,
      geminiMeta: null,
      importMeta: null,
      stickyDefault: "новости",
    }),
    "новости"
  );
});

test("an import without bound media cannot hijack the sticky default", () => {
  // No media_package_ref: this is not proof that the loose meta describes the current text,
  // so the user's remembered default stays in charge.
  assert.equal(
    SI.saveMetaSourcePrefill({
      existingSource: null,
      geminiMeta: null,
      importMeta: { kind: "text", source: "leftover.mp4" },
      stickyDefault: "новости",
    }),
    "новости"
  );
});

test("a saved card's own stored source outranks every candidate", () => {
  assert.equal(
    SI.saveMetaSourcePrefill({
      existingSource: "stored.mp4",
      geminiMeta: { provider: "subtitle-track", source: { source: "lecture.mkv" } },
      importMeta: LOCAL_ASR_IMPORT,
      stickyDefault: "новости",
    }),
    "stored.mp4"
  );
});

test("own provenance is reported as a fact the topic prefill can use", () => {
  // The dialog also refuses to hand a remembered TOPIC to a material that came with its own
  // file. That decision needs the same provenance fact, not a second private copy of it.
  assert.equal(SI.materialOwnSource(null, LOCAL_ASR_IMPORT), "interview-720.mp4");
  assert.equal(
    SI.materialOwnSource({ provider: "subtitle-track", source: { source: "lecture.mkv" } }, null),
    "lecture.mkv"
  );
  assert.equal(SI.materialOwnSource(null, null), "");
  assert.equal(SI.materialOwnSource(null, { kind: "text", source: "leftover.mp4" }), "");
});

test("the save dialog routes its source prefill through the shared rule", () => {
  // Guards against the inline dialog quietly growing a second, divergent copy of the rule.
  assert.match(html, /saveMetaSourcePrefill\(/,
    "index.html must call the shared prefill rule");
  assert.doesNotMatch(html, /provider === "subtitle-track"\s*\n?\s*\?\s*String\(v3LastGeminiMeta/,
    "the provider-specific override must be gone from the dialog");
});
