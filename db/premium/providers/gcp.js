"use strict";

// GCP Cloud Translation v3 provider.
//
// Configuration (env):
//   GCP_TRANSLATE_KEY_FILE     — absolute path to a service-account JSON key.
//                                Required; provider is unavailable if missing.
//   GCP_TRANSLATE_PROJECT_ID   — optional override; otherwise read from JSON.
//   GCP_TRANSLATE_LOCATION     — default "global".
//
// Error semantics (per the project's premium policy):
//   - Quota errors (gRPC 7 PERMISSION_DENIED, 8 RESOURCE_EXHAUSTED, HTTP 429/403)
//     surface as `kind: "quota"` and DO NOT trigger fallback. The user may want
//     to upgrade to paid; auto-switching would mask that.
//   - Transient errors (gRPC 4 DEADLINE_EXCEEDED, 13 INTERNAL, 14 UNAVAILABLE,
//     HTTP 5xx, network/timeout) surface as `kind: "transient"` and ARE
//     fallback-eligible (caller decides; pipeline.js does the dispatch).
//   - Anything else → `kind: "unknown"`, not fallback-eligible.

const fs = require("fs");

let _client = null;
let _projectId = null;
let _location = process.env.GCP_TRANSLATE_LOCATION || "global";
let _initError = null;

function isAvailable() {
  return Boolean(process.env.GCP_TRANSLATE_KEY_FILE) && _initError === null;
}

function _readProjectId(keyFile) {
  try {
    const raw = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    return raw.project_id || null;
  } catch (e) {
    throw new Error(`failed to read GCP key file ${keyFile}: ${e.message}`);
  }
}

function _ensureClient() {
  if (_client) return _client;
  if (_initError) throw _initError;

  const keyFile = process.env.GCP_TRANSLATE_KEY_FILE;
  if (!keyFile) {
    _initError = new Error("GCP_TRANSLATE_KEY_FILE is not set");
    throw _initError;
  }
  if (!fs.existsSync(keyFile)) {
    _initError = new Error(`GCP key file not found: ${keyFile}`);
    throw _initError;
  }

  // Lazy require so the SDK doesn't load when GCP isn't enabled.
  const { v3 } = require("@google-cloud/translate");
  _client = new v3.TranslationServiceClient({ keyFilename: keyFile });

  _projectId = process.env.GCP_TRANSLATE_PROJECT_ID || _readProjectId(keyFile);
  if (!_projectId) {
    _client = null;
    _initError = new Error("GCP project_id not found in key or env");
    throw _initError;
  }
  return _client;
}

function _classify(err) {
  // gRPC code (numeric) takes precedence; fall back to HTTP status if present.
  const grpc = typeof err.code === "number" ? err.code : null;
  const http = err.statusCode || err.status || null;

  if (grpc === 7 || grpc === 8 || http === 403 || http === 429) {
    return "quota";
  }
  if (grpc === 4 || grpc === 13 || grpc === 14 || (http && http >= 500)) {
    return "transient";
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "ENOTFOUND") {
    return "transient";
  }
  return "unknown";
}

function _wrapErr(err) {
  const kind = _classify(err);
  const out = new Error(err.message || "GCP translation error");
  out.provider = "gcp";
  out.upstream = "translate";
  out.kind = kind;
  out.fallbackable = kind === "transient";
  out.original = { code: err.code, statusCode: err.statusCode, details: err.details };
  return out;
}

// BYOK: per-request Cloud Translation v2 REST call (supports API-key auth,
// unlike the v3 SDK above which requires a service account). The v2 endpoint
// is sufficient for our simple text-batch workflow; if we ever need glossaries
// or batch jobs we'll have to revisit (those are v3-only).
async function translateBatchWithApiKey(segments, target, apiKey) {
  if (!segments.length) return { results: [], model_version: "gcp-translate-v2-nmt", chars: 0 };
  if (!apiKey || typeof apiKey !== "string") {
    const err = new Error("GCP Translate API key required (BYOK)");
    err.provider = "gcp";
    err.upstream = "translate";
    err.kind = "config";
    err.fallbackable = false;
    throw err;
  }

  const contents = segments.map((s) => s.he);
  const chars = contents.reduce((acc, t) => acc + (t ? t.length : 0), 0);
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;

  let resp, bodyText, parsed;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: contents,
        source: "he",
        target,
        format: "text",
      }),
    });
    bodyText = await resp.text();
    try { parsed = JSON.parse(bodyText); } catch (_) { parsed = null; }
  } catch (e) {
    throw _wrapErr({ message: e.message, code: e.code || "NETWORK", statusCode: 0 });
  }

  if (!resp.ok) {
    const apiErr = parsed && parsed.error ? parsed.error : null;
    const err = new Error((apiErr && apiErr.message) || `Cloud Translation v2 HTTP ${resp.status}`);
    err.code = apiErr && apiErr.status;
    err.statusCode = resp.status;
    err.details = apiErr;
    throw _wrapErr(err);
  }

  const translations = (parsed && parsed.data && parsed.data.translations) || [];
  if (translations.length !== segments.length) {
    const e = new Error(
      `GCP translation count mismatch: got ${translations.length}, want ${segments.length}`
    );
    e.kind = "unknown";
    e.fallbackable = false;
    throw e;
  }

  return {
    results: segments.map((s, i) => ({ index: s.index, ru: translations[i].translatedText })),
    model_version: translations[0].model || "gcp-translate-v2-nmt",
    chars,
  };
}

// segments: [{ index, he }]
// Returns: { results: [{ index, ru }], model_version, chars }
async function translateBatch(segments, target = "ru") {
  if (!segments.length) return { results: [], model_version: "gcp-translate-v3-nmt", chars: 0 };

  const client = _ensureClient();
  const parent = `projects/${_projectId}/locations/${_location}`;
  const contents = segments.map((s) => s.he);
  const chars = contents.reduce((acc, t) => acc + (t ? t.length : 0), 0);

  let resp;
  try {
    [resp] = await client.translateText({
      parent,
      contents,
      mimeType: "text/plain",
      sourceLanguageCode: "he",
      targetLanguageCode: target,
    });
  } catch (e) {
    throw _wrapErr(e);
  }

  const translations = resp.translations || [];
  if (translations.length !== segments.length) {
    const e = new Error(
      `GCP translation count mismatch: got ${translations.length}, want ${segments.length}`
    );
    e.kind = "unknown";
    e.fallbackable = false;
    throw e;
  }

  return {
    results: segments.map((s, i) => ({ index: s.index, ru: translations[i].translatedText })),
    model_version: resp.translations[0]?.model || "gcp-translate-v3-nmt",
    chars,
  };
}

module.exports = {
  isAvailable,
  translateBatch,
  translateBatchWithApiKey,
  // for tests
  _reset() { _client = null; _projectId = null; _initError = null; },
};
