"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEvent,
  anonymousEventKey,
  contractManifest,
  EVENT_NAMES,
  ALLOWED_PROPERTY_KEYS,
} = require("../product-pulse/contract");
const { configFromEnv, safeBaseUrl, buildSendPayloads } = require("../product-pulse/umami");

function validEvent(overrides = {}) {
  return {
    schema_version: 1,
    event_id: "evt-123",
    event_name: "study_engaged",
    occurred_at: "2026-09-22T10:00:00.000Z",
    session_id: "session-456",
    app_version: "3.11.605",
    properties: { surface: "reading_room", duration_bucket: "5_15_min" },
    ...overrides,
  };
}

test("Product Pulse accepts only the canonical privacy-safe event shape", () => {
  const result = normalizeEvent(validEvent(), Date.parse("2026-09-22T10:01:00Z"));
  assert.equal(result.ok, true);
  assert.deepEqual(result.event.properties, { surface: "reading_room", duration_bucket: "5_15_min" });
});

test("machine-readable manifest and validator expose one canonical allowlist", () => {
  const manifest = contractManifest();
  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(manifest.events.map((item) => item.name), [...EVENT_NAMES]);
  assert.deepEqual(manifest.properties.map((item) => item.name), [...ALLOWED_PROPERTY_KEYS]);
  assert.deepEqual(
    manifest.events.filter((item) => item.collection === "automatic").map((item) => item.name),
    ["app_open", "study_started", "study_engaged", "audio_engaged"],
  );
  for (const event of manifest.events) {
    assert.ok(event.definition);
    assert.ok(event.trigger);
    assert.ok(event.properties_used.every((key) => ALLOWED_PROPERTY_KEYS.has(key)));
  }
});

test("Product Pulse rejects arbitrary properties and user content", () => {
  const input = validEvent();
  input.properties.text = "private learning text";
  assert.deepEqual(normalizeEvent(input, Date.parse("2026-09-22T10:01:00Z")), { ok: false, error: "PROPERTY_NOT_ALLOWED" });
});

test("Product Pulse rejects stale replay and unknown event names", () => {
  assert.equal(normalizeEvent(validEvent(), Date.parse("2026-09-24T10:01:00Z")).error, "EVENT_TIME_INVALID");
  assert.equal(normalizeEvent(validEvent({ event_name: "all_clicks" }), Date.parse("2026-09-22T10:01:00Z")).error, "EVENT_NOT_ALLOWED");
});

test("deduplication key is stable without exposing the source identifiers", () => {
  const event = normalizeEvent(validEvent(), Date.parse("2026-09-22T10:01:00Z")).event;
  const key = anonymousEventKey(event);
  assert.equal(key, anonymousEventKey(event));
  assert.equal(key.length, 64);
  assert.equal(key.includes(event.session_id), false);
});

test("Umami remains disabled unless all explicit gates are configured", () => {
  assert.equal(configFromEnv({}).enabled, false);
  assert.equal(configFromEnv({ PRODUCT_PULSE_ENABLED: "1", UMAMI_BASE_URL: "https://analytics.example", UMAMI_WEBSITE_ID: "site-id" }).enabled, true);
});

test("Umami base URL requires HTTPS except for loopback development", () => {
  assert.equal(safeBaseUrl("https://analytics.example/"), "https://analytics.example");
  assert.equal(safeBaseUrl("http://127.0.0.1:3001/"), "http://127.0.0.1:3001");
  assert.equal(safeBaseUrl("http://analytics.example"), "");
});

test("app_open creates both a visit pageview and the canonical named event", () => {
  const event = normalizeEvent(validEvent({ event_name: "app_open", properties: { surface: "studio" } }), Date.parse("2026-09-22T10:01:00Z")).event;
  const payloads = buildSendPayloads({ websiteId: "site-id", hostname: "linguistpro.kolosei.com" }, event);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].payload.name, undefined);
  assert.equal(payloads[1].payload.name, "app_open");
  assert.equal(payloads[0].payload.id, event.session_id);
});

test("non-open product events stay named events without extra pageviews", () => {
  const event = normalizeEvent(validEvent(), Date.parse("2026-09-22T10:01:00Z")).event;
  const payloads = buildSendPayloads({ websiteId: "site-id", hostname: "linguistpro.kolosei.com" }, event);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].payload.name, "study_engaged");
});
