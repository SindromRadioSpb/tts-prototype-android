"use strict";

const { randomBytes } = require("crypto");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const { capabilityNames } = require("./capabilities");
const { validateOAuthHttpRequest } = require("./oauthHttpBoundary");
const { toolDefinitions } = require("./mcpSchemas");

const MCP_PATH = "/agent-access/mcp";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MAX_BODY_BYTES = 16 * 1024;
const TOOL_NAMES = new Set(capabilityNames());

function send(res, status, body, headers = {}) {
  res.status(status);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.json(body);
}
function jsonRpcError(code, message, id = null) {
  return { jsonrpc: "2.0", error: { code, message }, id };
}
function requestId() { return `mcp_${randomBytes(12).toString("hex")}`; }
function requestIp(req) { return String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 256); }
function acceptsMcp(value) {
  const types = String(value || "").toLowerCase().split(",").map((item) => item.split(";", 1)[0].trim());
  return types.includes("application/json") && types.includes("text/event-stream");
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) { const error = new Error("AA_MCP_BODY_TOO_LARGE"); error.code = "AA_MCP_BODY_TOO_LARGE"; throw error; }
    chunks.push(chunk);
  }
  if (!size) { const error = new Error("AA_MCP_BODY_REQUIRED"); error.code = "AA_MCP_BODY_REQUIRED"; throw error; }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (_) { const error = new Error("AA_MCP_JSON_INVALID"); error.code = "AA_MCP_JSON_INVALID"; throw error; }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    const error = new Error("AA_MCP_BATCH_FORBIDDEN"); error.code = "AA_MCP_BATCH_FORBIDDEN"; throw error;
  }
  return value;
}
function validateProtocol(body, header) {
  if (body.method === "initialize") {
    if (body.params?.protocolVersion !== MCP_PROTOCOL_VERSION) return false;
  } else if (String(header || "") !== MCP_PROTOCOL_VERSION) return false;
  return true;
}
function safeAudit(audit, input) {
  try { audit?.record(input); } catch (_) {}
}
function bearerChallenge() {
  return `Bearer resource_metadata="https://linguistpro.kolosei.com/.well-known/oauth-protected-resource/agent-access"`;
}

function createProtocolServer(runtime, trusted) {
  const server = new Server(
    { name: "linguistpro-agent-access", version: "aa-mcp.1.0.0" },
    { capabilities: { tools: { listChanged: false } } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = String(request.params?.name || "");
    const args = request.params?.arguments === undefined ? {} : request.params.arguments;
    const envelope = await runtime.service.execute(trusted.principal, name, args);
    safeAudit(runtime.audit, { event_type: "mcp_tool_result", route_class: "resource", result_code: envelope.ok ? "SUCCESS" : envelope.error.code, oauth_client_id: trusted.audit.oauth_client_id, scopes: trusted.audit.scopes, connection_id: trusted.audit.connection_id, request_id: trusted.principal.request_id, jti: trusted.audit.jti, security_epoch: trusted.audit.security_epoch, rate_dimension: "none", kid: trusted.audit.kid });
    if (!envelope.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
    return { content: [{ type: "text", text: JSON.stringify(envelope) }], structuredContent: envelope.result };
  });
  return server;
}

function createMcpDefaultOffGate({ getRuntime = async () => null } = {}) {
  if (typeof getRuntime !== "function") throw new TypeError("AA_MCP_GATE_BAD_RUNTIME_PROVIDER");
  return async function mcpDefaultOffGate(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    if (String(process.env.AGENT_ACCESS_MCP_ENABLED || "") !== "1") return send(res, 404, { error: "AGENT_ACCESS_MCP_DISABLED" });

    const verdict = validateOAuthHttpRequest({
      enabled: process.env.AGENT_ACCESS_OAUTH_ENABLED,
      agent_access_enabled: process.env.AGENT_ACCESS_UI_ENABLED,
      clients_enabled: process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED,
      host: req.headers.host,
      socket_protocol: req.socket?.encrypted ? "https" : "http",
      forwarded_host: req.headers["x-forwarded-host"],
      forwarded_proto: req.headers["x-forwarded-proto"],
      trust_proxy: String(process.env.AGENT_ACCESS_OAUTH_TRUST_PROXY || "") === "1",
      allow_loopback_fixture: process.env.NODE_ENV === "test" && String(process.env.AGENT_ACCESS_LOOPBACK_FIXTURE || "") === "1",
      fixture_origin: process.env.AGENT_ACCESS_CANONICAL_ORIGIN,
      route_class: "resource",
      method: req.method,
      content_type: req.headers["content-type"],
      cookie: req.headers.cookie,
      origin: req.headers.origin,
    });
    if (!verdict.ok) return send(res, verdict.status || 400, { error: verdict.error });

    const url = new URL(String(req.originalUrl || req.url || ""), "https://linguistpro.kolosei.com");
    if (url.pathname !== MCP_PATH) return send(res, 404, { error: "not_found" });
    if (url.search) return send(res, 400, { error: "AA_MCP_QUERY_FORBIDDEN" });
    if (req.headers.cookie) return send(res, 400, { error: "AA_MCP_COOKIE_FORBIDDEN" });
    if (req.headers["mcp-session-id"]) return send(res, 400, jsonRpcError(-32600, "MCP session IDs are disabled."));
    if (String(req.method || "").toUpperCase() !== "POST") return send(res, 405, jsonRpcError(-32000, "Method not allowed."), { Allow: "POST" });
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return send(res, 415, jsonRpcError(-32600, "application/json is required."));
    if (!acceptsMcp(req.headers.accept)) return send(res, 406, jsonRpcError(-32600, "Accept must include application/json and text/event-stream."));

    let runtime;
    try { runtime = await getRuntime(); }
    catch (_) { return send(res, 503, { error: "AA_MCP_RUNTIME_NOT_CONFIGURED" }); }
    if (!runtime?.validator || !runtime?.service || !runtime?.limiter) return send(res, 503, { error: "AA_MCP_RUNTIME_NOT_CONFIGURED" });

    const correlation = requestId();
    let trusted;
    try {
      trusted = await runtime.validator.validate(req.headers.authorization, correlation);
    } catch (_) {
      const quota = runtime.limiter.takeAuthFailure(requestIp(req));
      safeAudit(runtime.audit, { event_type: "mcp_auth_denied", route_class: "resource", result_code: "AA_MCP_BEARER_INVALID", request_id: correlation, rate_dimension: quota.dimension || "ip" });
      if (!quota.ok) return send(res, 429, { error: "AA_MCP_RATE_LIMITED" }, { "Retry-After": String(Math.max(1, Math.ceil(quota.retry_after_ms / 1000))) });
      return send(res, 401, { error: "AA_MCP_BEARER_INVALID" }, { "WWW-Authenticate": bearerChallenge() });
    }

    let body;
    try { body = await readJson(req); }
    catch (error) {
      const status = error.code === "AA_MCP_BODY_TOO_LARGE" ? 413 : 400;
      return send(res, status, jsonRpcError(-32700, "Invalid MCP JSON request."));
    }
    if (!validateProtocol(body, req.headers["mcp-protocol-version"])) return send(res, 400, jsonRpcError(-32600, "Unsupported MCP protocol version.", body.id ?? null));
    const toolName = body.method === "tools/call" ? String(body.params?.name || "") : null;
    const quota = runtime.limiter.takeRequest(trusted.principal, requestIp(req), TOOL_NAMES.has(toolName) ? toolName : null);
    if (!quota.ok) {
      safeAudit(runtime.audit, { event_type: "mcp_request_denied", route_class: "resource", result_code: "AA_MCP_RATE_LIMITED", oauth_client_id: trusted.audit.oauth_client_id, scopes: trusted.audit.scopes, connection_id: trusted.audit.connection_id, request_id: trusted.principal.request_id, jti: trusted.audit.jti, security_epoch: trusted.audit.security_epoch, rate_dimension: quota.dimension || "global", kid: trusted.audit.kid });
      return send(res, 429, jsonRpcError(-32000, "Rate limited.", body.id ?? null), { "Retry-After": String(Math.max(1, Math.ceil(quota.retry_after_ms / 1000))) });
    }

    const authenticated = Object.freeze({ ...trusted, ip: requestIp(req) });
    const server = createProtocolServer(runtime, authenticated);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    };
    res.once("close", close);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (_) {
      if (!res.headersSent) send(res, 500, jsonRpcError(-32603, "Internal MCP error.", body.id ?? null));
    } finally {
      if (res.writableEnded) close();
    }
  };
}

module.exports = { MCP_PATH, MCP_PROTOCOL_VERSION, MAX_BODY_BYTES, createMcpDefaultOffGate };
