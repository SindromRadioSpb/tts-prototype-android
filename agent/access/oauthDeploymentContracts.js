"use strict";

const C = require("./oauthContracts");

const DEPLOYMENT_VERSION = "aa-oauth-deployment.1.0.0";
const ISSUER = "https://linguistpro.kolosei.com/oauth";
const RESOURCE = C.RESOURCE_URI;
const CANONICAL_ORIGIN = "https://linguistpro.kolosei.com";

const ENDPOINTS = Object.freeze({
  issuer: ISSUER,
  resource: RESOURCE,
  protected_resource_metadata: `${CANONICAL_ORIGIN}/.well-known/oauth-protected-resource/agent-access`,
  authorization_server_metadata: `${CANONICAL_ORIGIN}/.well-known/oauth-authorization-server/oauth`,
  oidc_discovery: `${ISSUER}/.well-known/openid-configuration`,
  authorization_endpoint: `${ISSUER}/auth`,
  token_endpoint: `${ISSUER}/token`,
  revocation_endpoint: `${ISSUER}/token/revocation`,
  jwks_uri: `${ISSUER}/jwks`,
});

const FIXTURE_CLIENTS = Object.freeze([
  Object.freeze({
    client_id: "linguistpro-hermes-owner-v0",
    client_name: "Hermes Agent owner fixture",
    software_id: "nousresearch-hermes-agent",
    software_version: "0.18.2",
    token_endpoint_auth_method: "none",
    grant_types: Object.freeze(["authorization_code", "refresh_token"]),
    response_types: Object.freeze(["code"]),
    redirect_uris: Object.freeze(["http://127.0.0.1:8765/callback"]),
  }),
  Object.freeze({
    client_id: "linguistpro-mcp-inspector-v0",
    client_name: "MCP Inspector fixture",
    software_id: "modelcontextprotocol-inspector",
    software_version: "0.22.0",
    token_endpoint_auth_method: "none",
    grant_types: Object.freeze(["authorization_code", "refresh_token"]),
    response_types: Object.freeze(["code"]),
    redirect_uris: Object.freeze([
      "http://localhost:6274/oauth/callback",
      "http://localhost:6274/oauth/callback/debug",
    ]),
  }),
]);

const TTL = Object.freeze({
  authorization_code_seconds: 300,
  access_token_seconds: 600,
  interaction_seconds: 600,
  refresh_idle_seconds: 30 * 86400,
  refresh_absolute_seconds: 90 * 86400,
  clock_skew_seconds: 60,
});

const RATE_LIMITS = Object.freeze({
  discovery: Object.freeze({ window_ms: 60000, ip: 300 }),
  authorization: Object.freeze({ window_ms: 600000, ip: 30, client: 60, user: 10 }),
  interaction: Object.freeze({ window_ms: 600000, ip: 30, client: 60, user: 20 }),
  token: Object.freeze({ window_ms: 60000, ip: 120, client: 60, connection: 20 }),
  revocation: Object.freeze({ window_ms: 600000, ip: 60, client: 60, user: 20 }),
  resource: Object.freeze({ window_ms: 60000, ip: 300, client: 120, connection: 60, user: 120 }),
});

const PROHIBITED_ENDPOINTS = Object.freeze([
  "registration", "userinfo", "introspection", "device_authorization",
  "backchannel_authentication", "pushed_authorization_request",
]);

function protectedResourceMetadata() {
  return Object.freeze({
    resource: RESOURCE,
    authorization_servers: Object.freeze([ISSUER]),
    bearer_methods_supported: Object.freeze(["header"]),
    scopes_supported: C.SCOPES,
    resource_name: "LinguistPro Agent Access",
  });
}

function authorizationServerMetadata() {
  return Object.freeze({
    issuer: ISSUER,
    authorization_endpoint: ENDPOINTS.authorization_endpoint,
    token_endpoint: ENDPOINTS.token_endpoint,
    revocation_endpoint: ENDPOINTS.revocation_endpoint,
    jwks_uri: ENDPOINTS.jwks_uri,
    response_types_supported: Object.freeze(["code"]),
    grant_types_supported: Object.freeze(["authorization_code", "refresh_token"]),
    token_endpoint_auth_methods_supported: Object.freeze(["none"]),
    code_challenge_methods_supported: Object.freeze(["S256"]),
    scopes_supported: C.SCOPES,
    resource_indicators_supported: true,
  });
}

function openidConfiguration() {
  return Object.freeze({
    issuer: ISSUER,
    authorization_endpoint: ENDPOINTS.authorization_endpoint,
    token_endpoint: ENDPOINTS.token_endpoint,
    revocation_endpoint: ENDPOINTS.revocation_endpoint,
    jwks_uri: ENDPOINTS.jwks_uri,
    response_types_supported: Object.freeze(["code"]),
    response_modes_supported: Object.freeze(["query"]),
    grant_types_supported: Object.freeze(["authorization_code", "refresh_token"]),
    token_endpoint_auth_methods_supported: Object.freeze(["none"]),
    code_challenge_methods_supported: Object.freeze(["S256"]),
    scopes_supported: C.SCOPES,
    subject_types_supported: Object.freeze(["public"]),
    id_token_signing_alg_values_supported: Object.freeze(["ES256"]),
    claims_supported: Object.freeze(["sub"]),
    resource_indicators_supported: true,
  });
}

function validateFixtureClient(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) C.fail("AA_OAUTH_BAD_CLIENT");
  const allowed = ["client_id", "client_name", "software_id", "software_version", "token_endpoint_auth_method", "grant_types", "response_types", "redirect_uris"];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) C.fail("AA_OAUTH_UNKNOWN_FIELD");
  const known = FIXTURE_CLIENTS.find((x) => x.client_id === value.client_id);
  if (!known || JSON.stringify(value) !== JSON.stringify(known)) C.fail("AA_OAUTH_CLIENT_PROFILE_MISMATCH");
  return known;
}

module.exports = {
  DEPLOYMENT_VERSION, ISSUER, RESOURCE, CANONICAL_ORIGIN, ENDPOINTS, FIXTURE_CLIENTS, SCOPES: C.SCOPES,
  TTL, RATE_LIMITS, PROHIBITED_ENDPOINTS, protectedResourceMetadata,
  authorizationServerMetadata, openidConfiguration, validateFixtureClient,
};
