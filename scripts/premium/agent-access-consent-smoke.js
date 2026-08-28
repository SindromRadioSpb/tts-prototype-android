#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("./lib/cp0-test-db");
const identity = require("../../db/identityRepo");
const repo = require("../../db/agentAccessOAuthRepo");
const C = require("../../agent/access/oauthContracts");
const { CAPABILITY_VERSION } = require("../../agent/access/capabilities");
const {
  CONSENT_VERSION,
  RETENTION_NOTICE_VERSION,
  createConsentCeremony,
} = require("../../agent/access/consentCeremony");
const { validateBrowserRequest } = require("../../agent/access/requestBoundary");

const ROOT = path.resolve(__dirname, "../..");
const T0 = "2026-07-17T09:00:00.000Z";
const EXPIRES = "2026-07-17T09:09:00.000Z";
const CLIENT = "client-consent-fixture";
const REDIRECT = "http://127.0.0.1:3210/callback";
const RESOURCE = C.RESOURCE_URI;
const SCOPES = ["learning.brief.read", "review.summary.read"];

async function expectCode(value, code) {
  try { await (typeof value === "function" ? value() : value); assert.fail(`expected ${code}`); }
  catch (err) { assert.strictEqual(err.code || err.message, code); }
}
function pending(connectionId, label) {
  return {
    connection_id: connectionId,
    oauth_client_id: CLIENT,
    display_label: label,
    consent_version: CONSENT_VERSION,
    capability_version: CAPABILITY_VERSION,
    retention_notice_version: RETENTION_NOTICE_VERSION,
  };
}
function trusted(requestId, connectionId, scopes = SCOPES, overrides = {}) {
  return {
    request_id: requestId,
    oauth_client_id: CLIENT,
    client_display_name: "Consent fixture client",
    redirect_uri: REDIRECT,
    resource_uri: RESOURCE,
    requested_scopes: scopes,
    pkce_method: "S256",
    connection_id: connectionId,
    consent_version: CONSENT_VERSION,
    capability_version: CAPABILITY_VERSION,
    retention_notice_version: RETENTION_NOTICE_VERSION,
    expires_at: EXPIRES,
    ...overrides,
  };
}

(async () => {
  const ctx = await T.setup("cp0-agent-access-consent");
  let checks = 0;
  try {
    await repo.registerClientFixture({
      oauth_client_id: CLIENT,
      display_name: "Consent fixture client",
      software_id: "fixture",
      software_version: "1.0.0",
      redirect_uris: [REDIRECT],
      registration_version: "v1",
    }, T0);
    await repo.createSubjectMapping("u1", "subject-consent-owner", "v1", T0);
    await repo.createSubjectMapping("u2", "subject-consent-other", "v1", T0);
    await repo.createPendingConnection("u1", pending("conn-consent-a", "Owner A"), T0);
    await repo.createPendingConnection("u1", pending("conn-consent-b", "Owner B"), T0);
    await repo.createPendingConnection("u1", pending(`ac_${"a".repeat(20)}`, "Physics learning support"), T0);
    await repo.createPendingConnection("u1", pending("conn-consent-deny", "Owner denied"), T0);
    await repo.createPendingConnection("u2", pending("conn-consent-other", "Other user"), T0);
    checks++;

    const ceremony = createConsentCeremony({ oauthRepo: repo, recordConsent: identity.recordConsent, now: () => T0 });
    await ceremony.stageTrustedRequest("u1", trusted("request-consent-a", "conn-consent-a"));
    const preview = ceremony.preview("u1", "request-consent-a");
    assert.deepStrictEqual(preview.requested_scopes.map((x) => x.scope), SCOPES);
    assert.strictEqual(preview.canonical_authority, "LINGUISTPRO_ONLY");
    assert.strictEqual(preview.external_memory_is_learner_truth, false);
    const serializedPreview = JSON.stringify(preview);
    for (const forbidden of ["user_id", "oauth_client_id", "connection_id", "redirect_uri", "pkce", "subject", "token", "cookie", "csrf"]) {
      assert.ok(!serializedPreview.toLowerCase().includes(forbidden), `preview leaked ${forbidden}`);
    }
    checks++;

    await expectCode(() => ceremony.preview("u2", "request-consent-a"), "AA_CONSENT_REQUEST_NOT_FOUND");
    // AA3 R15-F3: строгое ПОДМНОЖЕСТВО запрошенных scope — легально (coarse-without-fine);
    // стейл-ожидание AA_CONSENT_PARTIAL_APPROVAL удалено (смоук был красным на main).
    // Нелегально — scope ВНЕ запрошенного набора (запрос остаётся открытым).
    await expectCode(ceremony.decide("u1", { request_id: "request-consent-a", decision: "approve", selected_scopes: ["reading.corpus.read"], retention_ack: true }), "AA_CONSENT_APPROVAL_INVALID");
    await expectCode(ceremony.decide("u1", { request_id: "request-consent-a", decision: "approve", selected_scopes: SCOPES, retention_ack: true, user_id: "u2" }), "AA_CONSENT_UNKNOWN_FIELD");
    checks++;

    const approved = await ceremony.decide("u1", { request_id: "request-consent-a", decision: "approve", selected_scopes: SCOPES, retention_ack: true });
    assert.strictEqual(approved.connection_id, "conn-consent-a");
    assert.strictEqual((await repo.loadConnection("u1", "conn-consent-a")).status, "ACTIVE");
    assert.strictEqual((await repo.loadConnection("u1", "conn-consent-b")).status, "PENDING_AUTH");
    assert.strictEqual((await identity.listConsents("u1")).history.filter((x) => x.consent_key.startsWith("external_agent_access:")).length, 2);
    await expectCode(ceremony.decide("u1", { request_id: "request-consent-a", decision: "approve", selected_scopes: SCOPES, retention_ack: true }), "AA_CONSENT_REQUEST_NOT_FOUND");
    checks++;

    const physicsConnection = `ac_${"a".repeat(20)}`;
    const physicsScope = "reading.publication.derivative.read";
    const physicsConsentKey = C.consentKey(physicsConnection, physicsScope);
    assert.strictEqual(physicsConsentKey.length, 81);
    await ceremony.stageTrustedRequest("u1", trusted("request-consent-physics", physicsConnection, [physicsScope]));
    await ceremony.decide("u1", { request_id: "request-consent-physics", decision: "approve", selected_scopes: [physicsScope], retention_ack: true });
    assert.strictEqual((await repo.loadConnection("u1", physicsConnection)).status, "ACTIVE");
    assert.ok((await identity.listConsents("u1")).history.some((row) => row.consent_key === physicsConsentKey));
    checks++;

    await ceremony.stageTrustedRequest("u1", trusted("request-consent-b", "conn-consent-b", ["agent.connection.read"]));
    await ceremony.decide("u1", { request_id: "request-consent-b", decision: "approve", selected_scopes: ["agent.connection.read"], retention_ack: true });
    await ceremony.stageTrustedRequest("u1", trusted("request-consent-deny", "conn-consent-deny", ["reading.public.search"]));
    await ceremony.decide("u1", { request_id: "request-consent-deny", decision: "deny", selected_scopes: [], retention_ack: false });
    assert.strictEqual((await repo.loadConnection("u1", "conn-consent-deny")).status, "SUSPENDED");
    checks++;

    const listed = await repo.listConnectionsForUser("u1");
    assert.strictEqual(listed.length, 4);
    const serializedList = JSON.stringify(listed).toLowerCase();
    for (const forbidden of ["user_id", "subject_id", "token_hash", "code_hash", "pkce_challenge", "redirect_uri"]) assert.ok(!serializedList.includes(forbidden));
    assert.ok(!serializedList.includes("conn-consent-other"));
    await repo.revokeConnection("u1", "conn-consent-a", "OWNER_REVOKE", T0);
    assert.strictEqual((await repo.loadConnection("u1", "conn-consent-a")).status, "REVOKED");
    assert.strictEqual((await repo.loadConnection("u1", "conn-consent-b")).status, "ACTIVE");
    await expectCode(repo.revokeConnection("u2", "conn-consent-b", "OWNER_REVOKE", T0), "AA_OAUTH_CONNECTION_NOT_FOUND");
    checks++;

    await repo.deleteConnection("u1", "conn-consent-a", "USER_DELETE", T0);
    assert.strictEqual((await ctx.get("SELECT COUNT(*) c FROM agent_access_erasure_journal WHERE user_id='u1' AND connection_id='conn-consent-a'")).c, 1);
    const exported = JSON.stringify(await repo.exportAgentAccess("u1")).toLowerCase();
    for (const forbidden of ["subject-consent-owner", "token_hash", "code_hash", "pkce_challenge", "redirect_uri"]) assert.ok(!exported.includes(forbidden));
    checks++;

    for (const [input, error] of [
      [{ enabled: "0" }, "AGENT_ACCESS_DISABLED"],
      [{ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "evil.example", protocol: "https", method: "GET" }, "AA_BOUNDARY_BAD_HOST"],
      [{ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "linguistpro.kolosei.com", protocol: "https", method: "POST", content_type: "application/json" }, "AA_BOUNDARY_BAD_ORIGIN"],
      [{ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "linguistpro.kolosei.com", protocol: "http", method: "GET" }, "AA_BOUNDARY_BAD_PROTOCOL"],
      [{ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "linguistpro.kolosei.com", protocol: "http", forwarded_host: "linguistpro.kolosei.com", forwarded_proto: "https", method: "GET" }, "AA_BOUNDARY_UNTRUSTED_FORWARDING"],
      [{ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "linguistpro.kolosei.com", protocol: "https", method: "OPTIONS" }, "AA_BOUNDARY_CORS_DISABLED"],
    ]) assert.strictEqual(validateBrowserRequest(input).error, error);
    assert.strictEqual(validateBrowserRequest({ enabled: "1", canonical_origin: "https://linguistpro.kolosei.com", host: "linguistpro.kolosei.com", protocol: "https", method: "POST", content_type: "application/json", origin: "https://linguistpro.kolosei.com" }).ok, true);
    assert.strictEqual(validateBrowserRequest({ enabled: "1", canonical_origin: "http://127.0.0.1:3210", host: "127.0.0.1:3210", protocol: "http", method: "GET", allow_loopback_fixture: true }).ok, true);
    checks++;

    for (const bad of [
      trusted("bad-client-name", "conn-consent-other", ["learning.brief.read"], { client_display_name: "Wrong" }),
      trusted("bad-redirect", "conn-consent-other", ["learning.brief.read"], { redirect_uri: "http://127.0.0.1:9999/callback" }),
      trusted("bad-resource", "conn-consent-other", ["learning.brief.read"], { resource_uri: "https://wrong.example/resource" }),
      trusted("bad-pkce", "conn-consent-other", ["learning.brief.read"], { pkce_method: "plain" }),
      trusted("bad-version", "conn-consent-other", ["learning.brief.read"], { consent_version: "future" }),
    ]) await expectCode(ceremony.stageTrustedRequest("u2", bad), bad.request_id === "bad-client-name" ? "AA_OAUTH_CLIENT_BINDING_INVALID" : bad.request_id === "bad-redirect" ? "AA_OAUTH_CLIENT_BINDING_INVALID" : bad.request_id === "bad-resource" ? "AA_OAUTH_BAD_RESOURCE" : bad.request_id === "bad-pkce" ? "AA_OAUTH_BAD_PKCE" : "AA_CONSENT_VERSION_MISMATCH");
    checks++;

    const surfaceFiles = ["agent/access/consentCeremony.js", "agent/access/requestBoundary.js", "public/js/agent-access.js"];
    const source = surfaceFiles.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
    assert.ok(!/F1|F2|review_log|fsrs\.write|mastery\.write|provider[-_ ]route/i.test(source));
    const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.ok(!/app\.(?:get|post|use)\(["']\/(?:oauth|mcp)|app\.(?:get|use)\(["']\/\.well-known/.test(server));
    checks++;

    console.log(JSON.stringify({ ok: true, checks, consent_preview_leaks: 0, cross_user_leaks: 0, external_connections: 0, oauth_endpoints: 0, mcp_endpoints: 0, provider_calls: 0 }));
  } finally { await T.cleanup(ctx); }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
