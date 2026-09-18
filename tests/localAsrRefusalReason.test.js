// tests/localAsrRefusalReason.test.js — a companion that answers must not be reported as one
// that did not.
//
// Owner-live 2026-09-18: a 563 MiB source was refused by the local companion with HTTP 413 and
// the exact detail "source exceeds 300 MiB". localAsrFailure() has branches for OOM, low disk,
// model integrity and port conflicts, but none for size, so the refusal fell through to
// localAsrUnavailable — "Local companion недоступен или отклонил запрос" — while the companion
// was up, idle and answering /v1/capabilities. The wrong name cost a diagnosis, and the user
// was given no way to act on a limit the companion had already stated precisely.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SI = require(path.join(root, "public/js/studio-import.js"));
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");

const httpError = (code, message) => Object.assign(new Error(message), { code });

test("an oversize source is named as oversize, not as an absent companion", () => {
  const failure = SI.localAsrFailure(httpError("LOCAL_ASR_HTTP_413", "source exceeds 300 MiB"));
  assert.equal(failure.reason, "SOURCE_TOO_LARGE");
  assert.equal(failure.key, "studio.import.localAsrSourceTooLarge");
  assert.notEqual(failure.key, "studio.import.localAsrUnavailable");
});

test("the companion's own words carry the limit to the user", () => {
  const failure = SI.localAsrFailure(httpError("LOCAL_ASR_HTTP_413", "source exceeds 700 MiB"));
  assert.match(String(failure.detail), /700 MiB/,
    "the exact limit the companion enforced must survive, whatever it is");
});

test("a job-reported size refusal is recognised the same way", () => {
  const failure = SI.localAsrFailure({ job: { error_code: "SOURCE_TOO_LARGE", error_detail: "source exceeds 700 MiB" } });
  assert.equal(failure.reason, "SOURCE_TOO_LARGE");
});

test("a companion that truly is unreachable still says so", () => {
  const failure = SI.localAsrFailure(new TypeError("Failed to fetch"));
  assert.equal(failure.key, "studio.import.localAsrUnavailable");
});

test("the existing named causes are untouched", () => {
  assert.equal(SI.localAsrFailure(new Error("CUDA out of memory")).reason, "WORKER_OOM");
  assert.equal(SI.localAsrFailure(new Error("MODEL_DISK_LOW")).reason, "MODEL_DISK_LOW");
  assert.equal(SI.localAsrFailure(new Error("PIN_MISMATCH")).reason, "MODEL_INTEGRITY_FAILED");
  assert.equal(SI.localAsrFailure(new Error("PORT_CONFLICT")).reason, "PORT_CONFLICT");
});

test("the run shows the detail, not just the sentence", () => {
  const start = studio.indexOf("async function transcribeAudioLocal()");
  const body = studio.slice(start, studio.indexOf("\n  function cancelLocalAsr", start));
  assert.match(body, /setStatus\(failure\.key,\s*failure\.detail\)/,
    "the refusal detail must reach setStatus, which already appends an extra");
});

test("the oversize message exists in every locale", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = fs.readFileSync(path.join(root, "public/i18n/locales", `${locale}.js`), "utf8");
    assert.match(source, /localAsrSourceTooLarge:\s*"[^"]{20,}"/,
      `${locale} is missing studio.import.localAsrSourceTooLarge`);
  }
});
