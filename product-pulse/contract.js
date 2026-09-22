"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const EVENT_NAMES = new Set([
  "app_open",
  "material_open",
  "study_started",
  "study_engaged",
  "study_completed",
  "audio_engaged",
  "operation_result",
]);
const SURFACES = new Set(["studio", "reading_room", "mediatheque", "study_video", "unknown"]);
const RESULTS = new Set(["success", "failure", "cancelled"]);
const DURATION_BUCKETS = new Set(["lt_30_sec", "30_sec_2_min", "2_5_min", "5_15_min", "15_30_min", "30_min_plus"]);
const ALLOWED_PROPERTY_KEYS = new Set(["surface", "result", "duration_bucket", "operation", "media_kind"]);

function cleanToken(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > maxLength || !/^[a-z0-9][a-z0-9_.-]*$/i.test(text)) return "";
  return text;
}

function normalizeEvent(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "INVALID_EVENT" };
  }
  const eventName = cleanToken(input.event_name, 50);
  if (!EVENT_NAMES.has(eventName)) return { ok: false, error: "EVENT_NOT_ALLOWED" };
  if (Number(input.schema_version) !== SCHEMA_VERSION) return { ok: false, error: "SCHEMA_VERSION_UNSUPPORTED" };

  const eventId = cleanToken(input.event_id, 80);
  const sessionId = cleanToken(input.session_id, 80);
  if (!eventId || !sessionId) return { ok: false, error: "IDENTIFIER_INVALID" };

  const occurredAtMs = Date.parse(String(input.occurred_at || ""));
  if (!Number.isFinite(occurredAtMs) || Math.abs(now - occurredAtMs) > 24 * 60 * 60 * 1000) {
    return { ok: false, error: "EVENT_TIME_INVALID" };
  }

  const properties = {};
  const source = input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)
    ? input.properties : {};
  for (const key of Object.keys(source)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) return { ok: false, error: "PROPERTY_NOT_ALLOWED" };
  }

  const surface = cleanToken(source.surface || input.surface || "unknown", 32) || "unknown";
  if (!SURFACES.has(surface)) return { ok: false, error: "SURFACE_INVALID" };
  properties.surface = surface;

  if (source.result != null) {
    const result = cleanToken(source.result, 16);
    if (!RESULTS.has(result)) return { ok: false, error: "RESULT_INVALID" };
    properties.result = result;
  }
  if (source.duration_bucket != null) {
    const bucket = cleanToken(source.duration_bucket, 24);
    if (!DURATION_BUCKETS.has(bucket)) return { ok: false, error: "DURATION_BUCKET_INVALID" };
    properties.duration_bucket = bucket;
  }
  for (const key of ["operation", "media_kind"]) {
    if (source[key] != null) {
      const value = cleanToken(source[key], 40);
      if (!value) return { ok: false, error: `${key.toUpperCase()}_INVALID` };
      properties[key] = value;
    }
  }

  return {
    ok: true,
    event: {
      schema_version: SCHEMA_VERSION,
      event_id: eventId,
      event_name: eventName,
      occurred_at: new Date(occurredAtMs).toISOString(),
      session_id: sessionId,
      app_version: cleanToken(input.app_version, 32) || "unknown",
      properties,
    },
  };
}

function anonymousEventKey(event) {
  return crypto.createHash("sha256").update(`${event.session_id}:${event.event_id}`, "utf8").digest("hex");
}

module.exports = {
  SCHEMA_VERSION,
  EVENT_NAMES,
  ALLOWED_PROPERTY_KEYS,
  normalizeEvent,
  anonymousEventKey,
};
