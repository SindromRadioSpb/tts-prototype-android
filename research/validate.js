// research/validate.js — strict schema validator for /api/research/v1/metrics.
//
// Reference: docs/RESEARCH_METRICS_SCHEMA.md §13. Implements the trust-boundary
// guards so server-side enforcement does not depend on client honesty.
//
// All failures throw SchemaViolationError with .code and .field for the route
// handler to translate into 400 SCHEMA_VIOLATION response with field context.

const SCHEMA_FORMAT = "linguistpro-research-v1";
const MAX_PAYLOAD_BYTES = 64 * 1024;

const REQUIRED_TOP_KEYS = [
  "format",
  "student_id",
  "cohort_code",
  "upload_ts",
  "since_ts",
  "consent_version",
  "context",
  "metrics",
];

const ALLOWED_CONTEXT_KEYS = ["app_version", "platform"];
const ALLOWED_PLATFORMS = [
  "web/desktop",
  "web/mobile-ios",
  "web/mobile-android",
  "web/pwa",
];

// Forbidden fields — rejected if present anywhere in the payload.
const FORBIDDEN_FIELDS = new Set([
  "text_content",
  "note_body",
  "search_query",
  "audio_bytes",
  "audio_url",
  "username",
  "email",
  "name",
  "phone",
  "ip",
  "geolocation",
  "latitude",
  "longitude",
  "user_agent",
  "device_id",
  "device_serial",
  // 'timestamp' with sub-day precision is forbidden, but the schema uses
  // 'upload_ts'/'since_ts' for legitimate day-level fields. So we ban literal
  // 'timestamp' to catch sloppy clients adding precise times.
  "timestamp",
]);

// Allowed metric keys per layer (RESEARCH_METRICS_SCHEMA §4-8).
const ALLOWED_METRIC_KEYS = new Set([
  // Layer 1 — Engagement
  "sessions_count",
  "active_minutes_real",
  "active_days_count",
  "time_of_day_histogram",
  // Layer 2 — Volume
  "texts_opened_distinct",
  "texts_opened_total",
  "sentences_read_distinct",
  "sentences_read_total",
  "audio_play_ms_total",
  "words_encountered_total",
  "words_unique_estimate",
  "words_mastered",
  "cards_reviewed",
  "cards_added_to_srs",
  "notes_created",
  "notes_edited",
  "search_queries_count",
  // Layer 3 — Quality
  "cards_correct",
  "cards_again",
  "srs_error_rate",
  "cards_due_completion_ratio",
  "smart_tag_overrides_count",
  // Layer 4 — Hebrew-specific
  "translit_toggles_count",
  "audio_replay_distribution",
  "niqqud_marked_time_ratio",
  "binyan_coverage",
  "root_encounter_diversity",
  // Layer 5 — Outcome (separate one-off uploads)
  "outcome",
]);

const ALLOWED_OUTCOME_KEYS = new Set([
  "post_test_score",
  "pre_test_score",
  "confidence_self_report",
  "outcome_capture_method",
]);

const DATE_ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const COHORT_CODE_RE = /^[A-Z0-9-]{4,16}$/;
const SEMVER_RE = /^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/;

class SchemaViolationError extends Error {
  constructor(field, message) {
    super(`SCHEMA_VIOLATION: ${message}`);
    this.code = "SCHEMA_VIOLATION";
    this.field = field;
  }
}

function violation(field, message) {
  throw new SchemaViolationError(field, message);
}

function isPlainObject(o) {
  return o !== null && typeof o === "object" && !Array.isArray(o);
}

function checkPayloadSize(rawBody) {
  if (typeof rawBody === "string") {
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      violation("$", `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }
  } else if (Buffer.isBuffer(rawBody)) {
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      violation("$", `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }
  } else if (isPlainObject(rawBody)) {
    if (Buffer.byteLength(JSON.stringify(rawBody), "utf8") > MAX_PAYLOAD_BYTES) {
      violation("$", `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }
  }
}

function recurseForbidden(obj, pathStr) {
  if (!isPlainObject(obj)) return;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_FIELDS.has(k)) {
      violation(`${pathStr}.${k}`, `forbidden field "${k}" present`);
    }
    recurseForbidden(obj[k], `${pathStr}.${k}`);
  }
}

function ensureIntInRange(val, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(val) || val < min || val > max) {
    violation(field, `expected integer in [${min}, ${max}], got ${JSON.stringify(val)}`);
  }
}

function ensureFloatInRange(val, field, { min = 0.0, max = 1.0 } = {}) {
  if (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max) {
    violation(field, `expected float in [${min}, ${max}], got ${JSON.stringify(val)}`);
  }
}

function validateContext(context) {
  if (!isPlainObject(context)) violation("$.context", "must be an object");
  for (const k of Object.keys(context)) {
    if (!ALLOWED_CONTEXT_KEYS.includes(k)) {
      violation(`$.context.${k}`, `unexpected field "${k}"`);
    }
  }
  if ("app_version" in context) {
    if (typeof context.app_version !== "string" || !SEMVER_RE.test(context.app_version)) {
      violation("$.context.app_version", "must be semver string");
    }
  }
  if ("platform" in context) {
    if (!ALLOWED_PLATFORMS.includes(context.platform)) {
      violation("$.context.platform", `must be one of ${ALLOWED_PLATFORMS.join(", ")}`);
    }
  }
}

function validateTimeOfDayHistogram(histo) {
  if (!isPlainObject(histo)) violation("$.metrics.time_of_day_histogram", "must be object");
  const keys = Object.keys(histo);
  if (keys.length > 24) {
    violation("$.metrics.time_of_day_histogram", `expected ≤ 24 buckets, got ${keys.length}`);
  }
  for (const k of keys) {
    if (!/^\d{1,2}$/.test(k) || Number(k) < 0 || Number(k) > 23) {
      violation(`$.metrics.time_of_day_histogram.${k}`, `bucket key must be hour 0..23`);
    }
    ensureIntInRange(histo[k], `$.metrics.time_of_day_histogram.${k}`);
  }
}

function validateAudioReplayDistribution(dist) {
  if (!isPlainObject(dist)) violation("$.metrics.audio_replay_distribution", "must be object");
  const allowed = new Set(["1", "2", "3", "4plus"]);
  for (const k of Object.keys(dist)) {
    if (!allowed.has(k)) {
      violation(`$.metrics.audio_replay_distribution.${k}`, `bucket key must be 1|2|3|4plus`);
    }
    ensureIntInRange(dist[k], `$.metrics.audio_replay_distribution.${k}`);
  }
}

function validateBinyanCoverage(bc) {
  if (!isPlainObject(bc)) violation("$.metrics.binyan_coverage", "must be object");
  const allowed = new Set(["pa'al", "nif'al", "pi'el", "pu'al", "hif'il", "huf'al", "hitpa'el"]);
  for (const k of Object.keys(bc)) {
    if (!allowed.has(k)) {
      violation(`$.metrics.binyan_coverage.${k}`, `unknown binyan "${k}"`);
    }
    if (typeof bc[k] !== "boolean") {
      violation(`$.metrics.binyan_coverage.${k}`, `must be boolean`);
    }
  }
}

function validateOutcome(out) {
  if (!isPlainObject(out)) violation("$.metrics.outcome", "must be object");
  for (const k of Object.keys(out)) {
    if (!ALLOWED_OUTCOME_KEYS.has(k)) {
      violation(`$.metrics.outcome.${k}`, `unexpected field "${k}"`);
    }
  }
  if ("post_test_score" in out && out.post_test_score !== null) {
    if (typeof out.post_test_score !== "number" || !Number.isFinite(out.post_test_score)) {
      violation("$.metrics.outcome.post_test_score", `must be number or null`);
    }
  }
  if ("pre_test_score" in out && out.pre_test_score !== null) {
    if (typeof out.pre_test_score !== "number" || !Number.isFinite(out.pre_test_score)) {
      violation("$.metrics.outcome.pre_test_score", `must be number or null`);
    }
  }
  if ("confidence_self_report" in out && out.confidence_self_report !== null) {
    if (!Number.isInteger(out.confidence_self_report) ||
        out.confidence_self_report < 1 ||
        out.confidence_self_report > 5) {
      violation("$.metrics.outcome.confidence_self_report", `must be int 1..5 or null`);
    }
  }
  if ("outcome_capture_method" in out) {
    if (out.outcome_capture_method !== "self-report" &&
        out.outcome_capture_method !== "teacher-csv") {
      violation("$.metrics.outcome.outcome_capture_method", `must be self-report or teacher-csv`);
    }
  }
}

function validateMetrics(metrics) {
  if (!isPlainObject(metrics)) violation("$.metrics", "must be an object");
  for (const k of Object.keys(metrics)) {
    if (!ALLOWED_METRIC_KEYS.has(k)) {
      violation(`$.metrics.${k}`, `unexpected field "${k}"`);
    }
  }
  // Integer metrics — range [0, MAX].
  const intMetrics = [
    "sessions_count", "active_minutes_real", "active_days_count",
    "texts_opened_distinct", "texts_opened_total",
    "sentences_read_distinct", "sentences_read_total",
    "audio_play_ms_total", "words_encountered_total", "words_unique_estimate",
    "words_mastered", "cards_reviewed", "cards_added_to_srs",
    "notes_created", "notes_edited", "search_queries_count",
    "cards_correct", "cards_again",
    "smart_tag_overrides_count", "translit_toggles_count",
    "root_encounter_diversity",
  ];
  for (const k of intMetrics) {
    if (k in metrics) ensureIntInRange(metrics[k], `$.metrics.${k}`);
  }
  // Float [0, 1] metrics.
  const ratioMetrics = ["srs_error_rate", "cards_due_completion_ratio", "niqqud_marked_time_ratio"];
  for (const k of ratioMetrics) {
    if (k in metrics) ensureFloatInRange(metrics[k], `$.metrics.${k}`);
  }
  // Compound metrics.
  if ("time_of_day_histogram" in metrics) validateTimeOfDayHistogram(metrics.time_of_day_histogram);
  if ("audio_replay_distribution" in metrics) validateAudioReplayDistribution(metrics.audio_replay_distribution);
  if ("binyan_coverage" in metrics) validateBinyanCoverage(metrics.binyan_coverage);
  if ("outcome" in metrics) validateOutcome(metrics.outcome);
}

function validatePayload(payload, rawBody) {
  // Size cap.
  checkPayloadSize(rawBody != null ? rawBody : payload);

  if (!isPlainObject(payload)) violation("$", "payload must be a JSON object");

  // Format guard.
  if (payload.format !== SCHEMA_FORMAT) {
    violation("$.format", `must equal "${SCHEMA_FORMAT}"`);
  }

  // Required top-level keys.
  for (const k of REQUIRED_TOP_KEYS) {
    if (!(k in payload)) violation(`$.${k}`, `missing required field`);
  }
  // No extra top-level keys.
  for (const k of Object.keys(payload)) {
    if (!REQUIRED_TOP_KEYS.includes(k)) {
      violation(`$.${k}`, `unexpected top-level field`);
    }
  }

  // Identifier shapes.
  if (typeof payload.student_id !== "string" || !UUID_RE.test(payload.student_id)) {
    violation("$.student_id", "must be UUID v4 shape");
  }
  if (typeof payload.cohort_code !== "string" || !COHORT_CODE_RE.test(payload.cohort_code)) {
    violation("$.cohort_code", "must be 4-16 chars [A-Z0-9-]");
  }
  if (typeof payload.upload_ts !== "string" || !DATE_ISO_DAY_RE.test(payload.upload_ts)) {
    violation("$.upload_ts", "must be ISO 8601 day (YYYY-MM-DD)");
  }
  if (typeof payload.since_ts !== "string" || !DATE_ISO_DAY_RE.test(payload.since_ts)) {
    violation("$.since_ts", "must be ISO 8601 day (YYYY-MM-DD)");
  }
  if (payload.since_ts > payload.upload_ts) {
    violation("$.since_ts", "since_ts must be ≤ upload_ts");
  }
  if (typeof payload.consent_version !== "string" || !SEMVER_RE.test(payload.consent_version)) {
    violation("$.consent_version", "must be semver string");
  }

  // Forbidden fields anywhere (deep).
  recurseForbidden(payload, "$");

  validateContext(payload.context);
  validateMetrics(payload.metrics);

  return payload;
}

// Lightweight semver compare suitable for "1.0" vs "1.1.0" — non-semver
// pre-release tags are ignored (we don't ship them for consent versions).
function compareSemver(a, b) {
  const pa = String(a).split(/[-+]/)[0].split(".").map((x) => Number(x) || 0);
  const pb = String(b).split(/[-+]/)[0].split(".").map((x) => Number(x) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  return 0;
}

module.exports = {
  SCHEMA_FORMAT,
  MAX_PAYLOAD_BYTES,
  REQUIRED_TOP_KEYS,
  FORBIDDEN_FIELDS,
  SchemaViolationError,
  validatePayload,
  compareSemver,
};
