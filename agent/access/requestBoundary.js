"use strict";

function fail(error) { return Object.freeze({ ok: false, error }); }

function singleHeader(value) {
  const text = String(value || "").trim();
  if (!text || text.includes(",") || /\s/.test(text) || text.includes("@")) return null;
  return text.toLowerCase();
}

function exactEnabled(value) { return String(value || "") === "1"; }

function validateBrowserRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("AA_BOUNDARY_BAD_INPUT");
  if (!exactEnabled(input.enabled)) return fail("AGENT_ACCESS_DISABLED");

  let canonical;
  try { canonical = new URL(String(input.canonical_origin || "")); }
  catch (_) { return fail("AA_BOUNDARY_BAD_CANONICAL_ORIGIN"); }
  if (canonical.username || canonical.password || canonical.pathname !== "/" || canonical.search || canonical.hash) {
    return fail("AA_BOUNDARY_BAD_CANONICAL_ORIGIN");
  }

  const allowLoopback = input.allow_loopback_fixture === true
    && canonical.protocol === "http:"
    && canonical.hostname === "127.0.0.1";
  if (canonical.protocol !== "https:" && !allowLoopback) return fail("AA_BOUNDARY_HTTPS_REQUIRED");

  const host = singleHeader(input.host);
  if (!host || host !== canonical.host.toLowerCase()) return fail("AA_BOUNDARY_BAD_HOST");

  let protocol = String(input.protocol || "").trim().toLowerCase().replace(/:$/, "");
  const forwardedHostRaw = String(input.forwarded_host || "").trim();
  const forwardedProtoRaw = String(input.forwarded_proto || "").trim();
  if (forwardedHostRaw || forwardedProtoRaw) {
    if (input.trust_proxy !== true) return fail("AA_BOUNDARY_UNTRUSTED_FORWARDING");
    const forwardedHost = singleHeader(forwardedHostRaw);
    const forwardedProto = singleHeader(forwardedProtoRaw);
    if (!forwardedHost || forwardedHost !== canonical.host.toLowerCase()) return fail("AA_BOUNDARY_BAD_FORWARDED_HOST");
    if (!forwardedProto || !new Set(["https", "http"]).has(forwardedProto)) return fail("AA_BOUNDARY_BAD_FORWARDED_PROTO");
    protocol = forwardedProto;
  }
  if (`${protocol}:` !== canonical.protocol) return fail("AA_BOUNDARY_BAD_PROTOCOL");

  const method = String(input.method || "GET").toUpperCase();
  if (!new Set(["GET", "POST", "DELETE", "OPTIONS"]).has(method)) return fail("AA_BOUNDARY_BAD_METHOD");
  if (method === "OPTIONS") return fail("AA_BOUNDARY_CORS_DISABLED");
  if (method !== "GET") {
    const contentType = String(input.content_type || "").trim().toLowerCase();
    if (!contentType.startsWith("application/json")) return fail("AA_BOUNDARY_JSON_REQUIRED");
    const origin = String(input.origin || "").trim();
    if (!origin || origin !== canonical.origin) return fail("AA_BOUNDARY_BAD_ORIGIN");
  }

  return Object.freeze({ ok: true, canonical_origin: canonical.origin });
}

module.exports = { exactEnabled, validateBrowserRequest };
