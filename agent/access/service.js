"use strict";

const C = require("./contracts");
const registry = require("./capabilities");

const ERROR_SCHEMA_VERSION = "aa.error.1.0.0";
const SUCCESS_SCHEMA_VERSION = "aa.result.1.0.0";

// Client-addressable handler failures (bad work_id, missing explanation, caps).
// Surfaced with their own code + retryable:false so an agent reads them as
// «my input / current state», not «backend down» — a generic INTERNAL_ERROR
// makes clients retry and misdiagnose an un-baked work as an outage
// (Hermes-observed, same lesson as the 3b cursor fix). Fail-closed: any code
// NOT in this allowlist still collapses to INTERNAL_ERROR.
const CLIENT_FAULT_CODES = new Set([
  "AA_CORPUS_WORK_NOT_FOUND", "AA_CORPUS_TEXT_NOT_FOUND",
  "AA_PROPOSAL_WORK_NOT_FOUND", "AA_PROPOSAL_TEXT_NOT_FOUND",
  "AA_EXPLANATION_NOT_FOUND", "AA_PROPOSAL_PENDING_LIMIT", "AA_HANDOFF_ACTIVE_LIMIT",
]);

function errorEnvelope(requestId, code, retryable = false) {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      schema_version: ERROR_SCHEMA_VERSION,
      request_id: requestId || "unbound",
      code,
      retryable: Boolean(retryable),
    }),
  });
}

function createAgentAccessService(options = {}) {
  const enabled = options.enabled === true;
  const ownerIds = new Set(Array.isArray(options.ownerIds) ? options.ownerIds.map(String) : []);
  const disabledTools = new Set(Array.isArray(options.disabledTools) ? options.disabledTools.map(String) : []);
  const handlers = options.handlers && typeof options.handlers === "object" ? options.handlers : {};
  const now = typeof options.now === "function" ? options.now : Date.now;

  async function execute(principalInput, toolName, argumentInput) {
    let principal;
    try {
      principal = C.validatePrincipal(principalInput);
      if (!enabled) throw new C.AgentAccessError("FEATURE_DISABLED");
      if (!ownerIds.has(principal.user_id)) throw new C.AgentAccessError("OWNER_NOT_ALLOWED");
      if (!new Set(["ACTIVE", "SCOPE_REDUCED"]).has(principal.connection_status)) throw new C.AgentAccessError("CONNECTION_INACTIVE");
      if (Date.parse(principal.access_expires_at) <= Number(now())) throw new C.AgentAccessError("ACCESS_EXPIRED");

      const capability = registry.getCapability(toolName);
      if (!capability) throw new C.AgentAccessError("UNKNOWN_TOOL");
      if (disabledTools.has(toolName)) throw new C.AgentAccessError("CAPABILITY_DISABLED");
      if (!principal.scopes.includes(capability.scope)) throw new C.AgentAccessError("INSUFFICIENT_SCOPE");

      const args = C.validateInput(toolName, argumentInput);
      const handler = handlers[toolName];
      if (typeof handler !== "function") throw new C.AgentAccessError("CAPABILITY_UNAVAILABLE");

      const handlerContext = Object.freeze({
        user_id: principal.user_id,
        oauth_client_id: principal.oauth_client_id,
        connection_id: principal.connection_id,
        external_actor_id: principal.external_actor_id,
        request_id: principal.request_id,
        purpose: capability.purpose,
        scenario_id: capability.scenario_id,
      });
      const raw = await handler(handlerContext, args);
      const result = C.validateOutput(toolName, raw);
      if (toolName === "get_agent_connection" && (result.connection_id !== principal.connection_id || result.oauth_client_id !== principal.oauth_client_id)) {
        throw new C.AgentAccessError("CONNECTION_BINDING_MISMATCH");
      }
      return Object.freeze({
        ok: true,
        schema_version: SUCCESS_SCHEMA_VERSION,
        request_id: principal.request_id,
        tool: toolName,
        result,
      });
    } catch (err) {
      if (err instanceof C.AgentAccessError) return errorEnvelope(principal && principal.request_id, err.code, err.retryable);
      if (err && CLIENT_FAULT_CODES.has(err.code)) return errorEnvelope(principal && principal.request_id, err.code, false);
      return errorEnvelope(principal && principal.request_id, "INTERNAL_ERROR", false);
    }
  }

  return Object.freeze({ execute, enabled, capability_version: registry.CAPABILITY_VERSION });
}

module.exports = { ERROR_SCHEMA_VERSION, SUCCESS_SCHEMA_VERSION, createAgentAccessService };
