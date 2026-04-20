"use strict";

// Tests for niqqudGateway.js — provider chain: sidecar → Dicta cloud → degraded.
//
// Strategy: mutate pythonClient and dictaCloud singletons before each test
// so the gateway sees stubs without any real network calls.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const pythonClient = require("../../db/premium/pythonClient");
const dictaCloud   = require("../../db/premium/providers/dictaCloud");
const gateway      = require("../../db/premium/niqqudGateway");

// ── Helpers ────────────────────────────────────────────────────────────────────

function sidecarOk(texts) {
  pythonClient.nakdan = async (t) => ({
    ok: true, status: 200,
    body: { results: t.map(x => x + "[niqqud]"), model_version: "sidecar-test" },
  });
}

function sidecarUnreachable() {
  pythonClient.nakdan = async () => ({ ok: false, status: 0, body: null, error: "ECONNREFUSED" });
}

function sidecarError(status = 500) {
  pythonClient.nakdan = async () => ({ ok: false, status, body: null, error: `HTTP ${status}` });
}

function cloudOk(texts) {
  dictaCloud.nakdan = async (t) => ({
    ok: true, status: 200,
    body: { results: t.map(x => x + "[cloud-niqqud]"), model_version: "dicta-cloud-test" },
  });
}

function cloudFail() {
  dictaCloud.nakdan = async () => ({ ok: false, status: 0, body: null, error: "cloud timeout" });
}

// ── Test 1: sidecar success ────────────────────────────────────────────────────

test("fetchNiqqud: sidecar success → uses sidecar, no cloud call", async () => {
  let cloudCalled = false;
  sidecarOk(["שלום"]);
  dictaCloud.nakdan = async (...a) => { cloudCalled = true; return cloudOk(a[0]); };

  const result = await gateway.fetchNiqqud(["שלום", "עולם"]);

  assert.equal(result.provider, "local-sidecar");
  assert.equal(result.degraded, false);
  assert.deepEqual(result.results, ["שלום[niqqud]", "עולם[niqqud]"]);
  assert.equal(cloudCalled, false, "cloud must not be called when sidecar succeeds");
});

// ── Test 2: sidecar unreachable → Dicta cloud fallback ────────────────────────

test("fetchNiqqud: sidecar unreachable → falls back to Dicta cloud", async () => {
  sidecarUnreachable();
  cloudOk(["שלום", "עולם"]);

  const result = await gateway.fetchNiqqud(["שלום", "עולם"]);

  assert.equal(result.provider, "dicta-cloud");
  assert.equal(result.degraded, false);
  assert.deepEqual(result.results, ["שלום[cloud-niqqud]", "עולם[cloud-niqqud]"]);
});

// ── Test 3: sidecar error (non-zero) → no cloud fallback ──────────────────────

test("fetchNiqqud: sidecar HTTP 500 → no cloud fallback, degraded", async () => {
  sidecarError(500);
  let cloudCalled = false;
  dictaCloud.nakdan = async () => { cloudCalled = true; };

  const result = await gateway.fetchNiqqud(["שלום"]);

  assert.equal(result.provider, "none");
  assert.equal(result.degraded, true);
  assert.equal(cloudCalled, false, "cloud must not be called for non-unreachable sidecar errors");
});

// ── Test 4: both providers fail → graceful degradation ────────────────────────

test("fetchNiqqud: sidecar unreachable AND cloud fails → graceful degradation", async () => {
  sidecarUnreachable();
  cloudFail();

  const result = await gateway.fetchNiqqud(["שלום", "עולם"]);

  assert.equal(result.provider, "none");
  assert.equal(result.degraded, true);
  assert.deepEqual(result.results, ["", ""], "empty strings on full failure");
  assert.ok(result.reason, "reason must be set");
});

// ── Test 5: empty input ────────────────────────────────────────────────────────

test("fetchNiqqud: empty texts array → immediate return, no provider called", async () => {
  let anyCalled = false;
  pythonClient.nakdan = dictaCloud.nakdan = async () => { anyCalled = true; };

  const result = await gateway.fetchNiqqud([]);

  assert.equal(result.provider, "none");
  assert.equal(result.degraded, false);
  assert.deepEqual(result.results, []);
  assert.equal(anyCalled, false);
});

// ── Test 6: annotate() returns both translit variants ─────────────────────────

test("annotate: returns sblAcademic and ruPhonetic when niqqud succeeds", async () => {
  // Provide a real niqqud string so transliteration library has something to work with.
  pythonClient.nakdan = async () => ({
    ok: true, status: 200,
    body: { results: ["שָׁלוֹם"], model_version: "sidecar-test" },
  });

  const out = await gateway.annotate("שלום");

  assert.equal(out.ok, true);
  assert.equal(out.niqqud, "שָׁלוֹם");
  assert.equal(out.provider, "local-sidecar");
  assert.equal(out.degraded, false);
  assert.equal(out.warnings.length, 0);
  // Both translit variants must be present (non-empty string or at least a string)
  assert.equal(typeof out.translit.sblAcademic, "string", "sblAcademic must be a string");
  assert.equal(typeof out.translit.ruPhonetic,  "string", "ruPhonetic must be a string");
  assert.ok(out.translit.sblAcademic.length > 0, "SBL Academic translit must be non-empty");
  assert.ok(out.translit.ruPhonetic.length  > 0, "Russian phonetic translit must be non-empty");
});

// ── Test 7: annotate() degraded when niqqud unavailable ───────────────────────

test("annotate: degraded response when all providers fail", async () => {
  sidecarUnreachable();
  cloudFail();

  const out = await gateway.annotate("שלום");

  assert.equal(out.ok, false);
  assert.equal(out.degraded, true);
  assert.equal(out.niqqud, "");
  assert.equal(out.translit.sblAcademic, "");
  assert.equal(out.translit.ruPhonetic, "");
  assert.ok(out.warnings.length > 0, "warnings must be present on degraded");
});

// ── Test 8: google-free provider still gets niqqud ───────────────────────────
// (Simulates pipeline behavior: niqqud is independent of translation provider)

test("niqqud is independent of translation provider (google-free scenario)", async () => {
  // Sidecar unreachable → cloud fallback works
  sidecarUnreachable();
  cloudOk(["שלום", "עולם"]);

  // fetchNiqqud is called with texts regardless of what translation provider is used
  const result = await gateway.fetchNiqqud(["שלום", "עולם"]);

  // Cloud fills niqqud even when local sidecar (used for madlad translate) is down
  assert.equal(result.provider, "dicta-cloud");
  assert.equal(result.degraded, false);
  assert.ok(result.results.every(r => r.length > 0), "all niqqud results must be non-empty");
});
