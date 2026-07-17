"use strict";

const { validateOAuthHttpRequest } = require("./oauthHttpBoundary");
const { protectedResourceMetadata, authorizationServerMetadata, openidConfiguration } = require("./oauthDeploymentContracts");

function routeClass(path, method) {
  const pathname = String(path || "").split("?", 1)[0];
  if ([
    "/.well-known/oauth-protected-resource/agent-access",
    "/.well-known/oauth-authorization-server/oauth",
    "/oauth/.well-known/openid-configuration",
    "/oauth/jwks",
  ].includes(pathname)) return "discovery";
  if (pathname === "/oauth/token/revocation") return "revocation";
  if (pathname === "/oauth/token") return "token";
  if (/^\/oauth\/interaction\/[A-Za-z0-9_-]+$/.test(pathname)) return "interaction";
  if (pathname === "/oauth/auth") return "authorization";
  return null;
}

function createOAuthDefaultOffGate({ getRuntime = async () => null, limiter = null } = {}) {
  if (typeof getRuntime !== "function") throw new TypeError("AA_OAUTH_GATE_BAD_RUNTIME_PROVIDER");
  return async function oauthDefaultOffGate(req, res) {
    const kind = routeClass(String(req.originalUrl || req.url || ""), String(req.method || "GET").toUpperCase());
    if (!kind) return res.status(404).json({ error: "not_found" });
    const verdict = validateOAuthHttpRequest({
      enabled: process.env.AGENT_ACCESS_OAUTH_ENABLED,
      agent_access_enabled: process.env.AGENT_ACCESS_UI_ENABLED,
      clients_enabled: process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED,
      host: req.headers.host,
      socket_protocol: req.socket && req.socket.encrypted ? "https" : "http",
      forwarded_host: req.headers["x-forwarded-host"],
      forwarded_proto: req.headers["x-forwarded-proto"],
      trust_proxy: String(process.env.AGENT_ACCESS_OAUTH_TRUST_PROXY || "") === "1",
      route_class: kind,
      method: req.method,
      content_type: req.headers["content-type"],
      cookie: req.headers.cookie,
      origin: req.headers.origin,
    });
    if (!verdict.ok) return res.status(verdict.status || 400).json({ error: verdict.error });
    if (limiter) {
      const requestUrl = new URL(String(req.originalUrl || req.url || ""), "https://linguistpro.kolosei.com");
      const dimensions = { ip: String(req.socket && req.socket.remoteAddress || "unknown") };
      if (kind === "authorization" && requestUrl.searchParams.get("client_id")) dimensions.client = requestUrl.searchParams.get("client_id");
      const quota = limiter.take(kind, dimensions);
      if (!quota.ok) {
        if (typeof res.setHeader === "function") res.setHeader("Retry-After", String(Math.max(1, Math.ceil(Number(quota.retry_after_ms || 1000) / 1000))));
        return res.status(429).json({ error: "AA_OAUTH_RATE_LIMITED" });
      }
    }
    let runtime;
    try { runtime = await getRuntime(); }
    catch (_) { return res.status(503).json({ error: "AA_OAUTH_RUNTIME_NOT_CONFIGURED" }); }
    if (!runtime || typeof runtime.nodeHandler !== "function") return res.status(503).json({ error: "AA_OAUTH_RUNTIME_NOT_CONFIGURED" });
    const path = String(req.originalUrl || req.url || "").split("?", 1)[0];
    if (path === "/.well-known/oauth-protected-resource/agent-access") return res.json(protectedResourceMetadata());
    if (path === "/.well-known/oauth-authorization-server/oauth") return res.json(authorizationServerMetadata());
    if (path === "/oauth/.well-known/openid-configuration") return res.json(openidConfiguration());
    if (!path.startsWith("/oauth/")) return res.status(404).json({ error: "not_found" });
    req.url = req.url.slice("/oauth".length) || "/";
    return runtime.nodeHandler(req, res);
  };
}

module.exports = { createOAuthDefaultOffGate, routeClass };
