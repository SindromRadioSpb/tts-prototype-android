"use strict";

const SCHEMA_VERSION = "cp0-observer.1.0.0";
const RECORD_KINDS = new Set(["RUN_STARTED", "RUN_TERMINAL"]);
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "DEGRADED"]);
const SHADOW = new Set(["ALLOW", "MISMATCH", "UNCLASSIFIED"]);
const SURFACES = new Set(["pwa", "miniapp", "telegram", "background"]);
const MAX_MANIFEST_BYTES = 3072;
const MAX_LIST_ITEMS = 64;
const SAFE = /^[A-Za-z0-9_.:@/-]{1,96}$/;

function safeCode(v, nullable = false) {
  if (v == null && nullable) return null;
  const s = String(v || "");
  if (!SAFE.test(s)) throw new Error("CP0_UNSAFE_CODE");
  return s;
}

function safeList(value) {
  const arr = Array.isArray(value) ? value : [];
  if (arr.length > MAX_LIST_ITEMS) throw new Error("CP0_LIST_TOO_LARGE");
  return [...new Set(arr.map((v) => safeCode(v)))].sort();
}

function buildManifest(input) {
  const x = input || {};
  const allowed = new Set(["capabilities", "artifacts", "consents", "model_attempts", "canonical_events", "deliveries", "mismatches", "degradations"]);
  for (const k of Object.keys(x)) if (!allowed.has(k)) throw new Error("CP0_UNKNOWN_MANIFEST_FIELD");
  const out = {};
  for (const k of allowed) {
    const list = safeList(x[k]);
    if (list.length) out[k] = list;
  }
  const json = JSON.stringify(out);
  if (Buffer.byteLength(json, "utf8") > MAX_MANIFEST_BYTES) throw new Error("CP0_MANIFEST_TOO_LARGE");
  return json;
}

function validateRecord(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("CP0_BAD_RECORD");
  const allowed = new Set(["id", "user_id", "run_id", "request_id", "parent_run_id", "process_boot_id", "sequence", "record_kind", "role_id", "scenario_id", "surface", "workflow_version", "role_registry_version", "observer_schema_version", "terminal_status", "live_outcome_code", "shadow_decision", "manifest_json", "latency_bucket_ms", "created_at", "expires_at"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) throw new Error("CP0_UNKNOWN_RECORD_FIELD");
  for (const k of ["id", "run_id", "request_id", "process_boot_id", "role_id", "scenario_id", "workflow_version", "role_registry_version", "observer_schema_version"]) safeCode(r[k]);
  if (!RECORD_KINDS.has(r.record_kind)) throw new Error("CP0_BAD_RECORD_KIND");
  if (!SURFACES.has(r.surface)) throw new Error("CP0_BAD_SURFACE");
  if (r.record_kind === "RUN_TERMINAL") {
    if (!TERMINAL.has(r.terminal_status)) throw new Error("CP0_BAD_TERMINAL");
    if (!SHADOW.has(r.shadow_decision)) throw new Error("CP0_BAD_SHADOW");
    safeCode(r.live_outcome_code);
  }
  if (!Number.isInteger(r.sequence) || r.sequence < 0) throw new Error("CP0_BAD_SEQUENCE");
  if (Buffer.byteLength(String(r.manifest_json || ""), "utf8") > MAX_MANIFEST_BYTES) throw new Error("CP0_MANIFEST_TOO_LARGE");
  const parsedManifest = JSON.parse(r.manifest_json || "{}");
  buildManifest(parsedManifest);
  return r;
}

function normalizeSurface(v) {
  const s = String(v || "pwa");
  if (s === "telegram_miniapp") return "miniapp";
  if (s === "telegram_bot") return "telegram";
  return SURFACES.has(s) ? s : "pwa";
}

module.exports = { SCHEMA_VERSION, MAX_MANIFEST_BYTES, buildManifest, validateRecord, normalizeSurface, safeCode };
