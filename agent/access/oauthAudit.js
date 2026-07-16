"use strict";

const crypto = require("crypto");
const C = require("./oauthContracts");
const { DEPLOYMENT_VERSION } = require("./oauthDeploymentContracts");

const ROUTES = new Set(["discovery", "authorization", "interaction", "token", "revocation", "resource"]);
const DIMENSIONS = new Set(["ip", "client", "user", "connection", "global", "none"]);
function error(code) { const e = new Error(code); e.code = code; throw e; }
function digest(key, value) {
  if (typeof key !== "string" || key.length < 32) error("AA_OAUTH_AUDIT_KEY_INVALID");
  if (value == null) return null;
  const text = C.bounded(String(value), 256, "AA_OAUTH_AUDIT_VALUE_INVALID");
  return crypto.createHmac("sha256", key).update(text).digest("hex");
}

function createContentSafeOAuthAudit({ key, now = () => new Date().toISOString(), emit = () => {} } = {}) {
  if (typeof emit !== "function") error("AA_OAUTH_AUDIT_EMITTER_INVALID");
  digest(key, "key-check");
  function record(input) {
    const allowed = ["event_type", "route_class", "result_code", "oauth_client_id", "scopes", "connection_id", "request_id", "jti", "security_epoch", "rate_dimension", "kid", "deployment_revision"];
    const x = C.closed(input, allowed, ["event_type", "route_class", "result_code"]);
    if (!ROUTES.has(x.route_class)) error("AA_OAUTH_AUDIT_ROUTE_INVALID");
    const scopes = x.scopes === undefined ? [] : C.scopes(x.scopes, { allowEmpty: true });
    const dimension = x.rate_dimension === undefined ? "none" : String(x.rate_dimension);
    if (!DIMENSIONS.has(dimension)) error("AA_OAUTH_AUDIT_DIMENSION_INVALID");
    const row = Object.freeze({
      schema_version: "aa.oauth.audit.1.0.0",
      deployment_version: DEPLOYMENT_VERSION,
      event_type: C.safeId(x.event_type, 64),
      route_class: x.route_class,
      result_code: C.safeId(x.result_code, 64),
      oauth_client_id: x.oauth_client_id ? C.safeId(x.oauth_client_id) : null,
      scopes,
      connection_digest: digest(key, x.connection_id),
      request_digest: digest(key, x.request_id),
      jti_digest: digest(key, x.jti),
      security_epoch: x.security_epoch == null ? null : Number(x.security_epoch),
      rate_dimension: dimension,
      kid: x.kid ? C.safeId(x.kid, 64) : null,
      timestamp: C.iso(now()),
      deployment_revision: x.deployment_revision ? C.safeId(x.deployment_revision, 64) : null,
      cp0_eligible: false,
      cp0_scenario: null,
    });
    if (row.security_epoch !== null && (!Number.isInteger(row.security_epoch) || row.security_epoch < 0)) error("AA_OAUTH_AUDIT_EPOCH_INVALID");
    emit(row);
    return row;
  }
  return Object.freeze({ record });
}

module.exports = { createContentSafeOAuthAudit };
