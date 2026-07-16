"use strict";

const { CANONICAL_ORIGIN } = require("./oauthDeploymentContracts");

function failure(error, status = 400) { return Object.freeze({ ok: false, error, status }); }
function one(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text.includes(",") || /\s|@/.test(text)) return null;
  return text;
}

function validateOAuthHttpRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failure("AA_OAUTH_BOUNDARY_BAD_INPUT");
  if (String(input.enabled || "") !== "1") return failure("AGENT_ACCESS_OAUTH_DISABLED", 404);
  if (String(input.agent_access_enabled || "") !== "1") return failure("AGENT_ACCESS_DISABLED", 404);

  const fixture = input.allow_loopback_fixture === true;
  const canonical = fixture ? new URL(String(input.fixture_origin || "")) : new URL(CANONICAL_ORIGIN);
  if (fixture && (canonical.protocol !== "http:" || canonical.hostname !== "127.0.0.1")) return failure("AA_OAUTH_BOUNDARY_BAD_FIXTURE_ORIGIN");

  const host = one(input.host);
  if (!host || host !== canonical.host.toLowerCase()) return failure("AA_OAUTH_BOUNDARY_BAD_HOST");
  let protocol = one(input.socket_protocol);
  const forwardedHostRaw = String(input.forwarded_host || "").trim();
  const forwardedProtoRaw = String(input.forwarded_proto || "").trim();
  if (forwardedHostRaw || forwardedProtoRaw) {
    if (input.trust_proxy !== true) return failure("AA_OAUTH_BOUNDARY_UNTRUSTED_FORWARDING");
    const forwardedHost = one(forwardedHostRaw);
    const forwardedProto = one(forwardedProtoRaw);
    if (forwardedHost !== canonical.host.toLowerCase()) return failure("AA_OAUTH_BOUNDARY_BAD_FORWARDED_HOST");
    if (forwardedProto !== canonical.protocol.slice(0, -1)) return failure("AA_OAUTH_BOUNDARY_BAD_FORWARDED_PROTO");
    protocol = forwardedProto;
  }
  if (protocol !== canonical.protocol.slice(0, -1)) return failure("AA_OAUTH_BOUNDARY_BAD_PROTOCOL");

  const routeClass = String(input.route_class || "");
  if (!["discovery", "authorization", "interaction", "token", "revocation", "resource"].includes(routeClass)) return failure("AA_OAUTH_BOUNDARY_BAD_ROUTE");
  // Discovery/JWKS may be deployed and verified before any client can start an
  // authorization flow. A client row alone must never activate OAuth access.
  if (routeClass !== "discovery" && String(input.clients_enabled || "") !== "1") {
    return failure("AGENT_ACCESS_OAUTH_CLIENTS_DISABLED", 404);
  }
  const method = String(input.method || "GET").toUpperCase();
  if (method === "OPTIONS") return failure("AA_OAUTH_CORS_DISABLED", 404);
  if (String(input.origin || "") && routeClass !== "interaction") return failure("AA_OAUTH_CORS_DISABLED", 403);
  if (["discovery", "authorization"].includes(routeClass) && method !== "GET") return failure("AA_OAUTH_METHOD_NOT_ALLOWED", 405);
  if (["token", "revocation"].includes(routeClass)) {
    if (method !== "POST") return failure("AA_OAUTH_METHOD_NOT_ALLOWED", 405);
    if (!String(input.content_type || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return failure("AA_OAUTH_FORM_REQUIRED", 415);
    if (String(input.cookie || "")) return failure("AA_OAUTH_COOKIE_FORBIDDEN", 400);
  }
  return Object.freeze({ ok: true, canonical_origin: canonical.origin, route_class: routeClass });
}

module.exports = { validateOAuthHttpRequest };
