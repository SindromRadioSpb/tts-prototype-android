#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("./lib/cp0-test-db");
const identity = require("../../db/identityRepo");
const repo = require("../../db/agentAccessOAuthRepo");
const C = require("../../agent/access/oauthContracts");

const T0 = "2026-07-17T09:00:00.000Z";
const T1 = "2026-07-17T09:01:00.000Z";
const T2 = "2026-07-17T09:02:00.000Z";
const T3 = "2026-07-17T09:03:00.000Z";
const REDIRECT = "http://127.0.0.1:3210/callback";
const CLIENT = "client-fixture";
const C1 = "conn-owner-a";
const C2 = "conn-owner-b";
const C3 = "conn-other-a";
const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64), H4 = "d".repeat(64);
const PKCE = "A".repeat(43);

async function expectCode(promise, code) {
  try { await promise; assert.fail(`expected ${code}`); }
  catch (err) { assert.strictEqual(err.code || err.message, code); }
}
async function consent(userId, connectionId, scope) {
  return identity.recordConsent(userId, C.consentKey(connectionId, scope), true, "aa-consent-v1");
}
function connectionInput(connectionId, label = "Fixture profile") {
  return { connection_id: connectionId, oauth_client_id: CLIENT, display_label: label, consent_version: "aa-consent-v1", capability_version: "aa-v0.1", retention_notice_version: "aa-retention-v1" };
}

(async () => {
  const ctx = await T.setup("cp0-agent-access-oauth");
  let checks = 0;
  try {
    await expectCode(repo.registerClientFixture({ oauth_client_id: CLIENT, display_name: "Bad", software_id: "fixture", software_version: "1", redirect_uris: ["http://evil.example/cb"], registration_version: "v1" }, T0), "AA_OAUTH_BAD_REDIRECT_URI"); checks++;
    await repo.registerClientFixture({ oauth_client_id: CLIENT, display_name: "Fixture OAuth client", software_id: "fixture", software_version: "1.0.0", redirect_uris: [REDIRECT], registration_version: "v1" }, T0); checks++;
    await repo.createSubjectMapping("u1", "subject-owner-opaque", "v1", T0);
    await repo.createSubjectMapping("u2", "subject-other-opaque", "v1", T0); checks++;

    await repo.createPendingConnection("u1", connectionInput(C1), T0);
    await repo.createPendingConnection("u1", connectionInput(C2, "Second profile"), T0);
    await repo.createPendingConnection("u2", connectionInput(C3, "Other owner"), T0); checks++;
    await expectCode(repo.activateConnectionWithGrants("u1", C1, ["learning.brief.read"], T1), "AA_OAUTH_CONSENT_REQUIRED"); checks++;
    await consent("u1", C1, "learning.brief.read");
    await consent("u1", C2, "agent.connection.read");
    await consent("u2", C3, "learning.brief.read");
    await repo.activateConnectionWithGrants("u1", C1, ["learning.brief.read"], T1);
    await repo.activateConnectionWithGrants("u1", C2, ["agent.connection.read"], T1);
    await repo.activateConnectionWithGrants("u2", C3, ["learning.brief.read"], T1); checks++;

    await expectCode(repo.loadConnection("u2", C1), "AA_OAUTH_CONNECTION_NOT_FOUND");
    await expectCode(repo.revokeConnection("u2", C1), "AA_OAUTH_CONNECTION_NOT_FOUND");
    assert.strictEqual((await repo.loadConnection("u1", C1)).status, "ACTIVE"); checks++;

    await expectCode(repo.addConnectionGrants("u1", C1, ["review.summary.read"], T2), "AA_OAUTH_CONSENT_REQUIRED");
    await consent("u1", C1, "review.summary.read");
    const widened = await repo.addConnectionGrants("u1", C1, ["review.summary.read"], T2);
    assert.deepStrictEqual(widened.grants.filter((x) => x.status === "ACTIVE").map((x) => x.scope), ["learning.brief.read", "review.summary.read"]); checks++;
    const epochBeforeReduce = widened.security_epoch;
    const reduced = await repo.reduceConnectionScopes("u1", C1, ["learning.brief.read"], T3);
    assert.strictEqual(reduced.status, "SCOPE_REDUCED");
    assert.ok(reduced.security_epoch > epochBeforeReduce);
    await expectCode(repo.validateConnectionSnapshot("u1", C1, { security_epoch: epochBeforeReduce }, T3), "AA_OAUTH_SECURITY_EPOCH_INVALID"); checks++;

    await expectCode(repo.storeAuthorizationCodeHash("u1", { authorization_code_id: "code-bad", oauth_client_id: CLIENT, connection_id: C1, code_hash: H1, redirect_uri: REDIRECT, resource_uri: "https://wrong.example/resource", pkce_method: "S256", pkce_challenge: PKCE, scopes: ["learning.brief.read"], issued_at: T1, expires_at: "2026-07-17T09:06:00.000Z" }), "AA_OAUTH_BAD_RESOURCE"); checks++;
    await repo.storeAuthorizationCodeHash("u1", { authorization_code_id: "code-one", oauth_client_id: CLIENT, connection_id: C1, code_hash: H1, redirect_uri: REDIRECT, resource_uri: C.RESOURCE_URI, pkce_method: "S256", pkce_challenge: PKCE, scopes: ["learning.brief.read"], issued_at: T1, expires_at: "2026-07-17T09:06:00.000Z" });
    const consumed = await repo.consumeAuthorizationCodeHash("u1", { code_hash: H1, oauth_client_id: CLIENT, connection_id: C1, redirect_uri: REDIRECT, resource_uri: C.RESOURCE_URI }, T2);
    assert.strictEqual(consumed.status, "CONSUMED");
    await expectCode(repo.consumeAuthorizationCodeHash("u1", { code_hash: H1, oauth_client_id: CLIENT, connection_id: C1, redirect_uri: REDIRECT, resource_uri: C.RESOURCE_URI }, T2), "AA_OAUTH_CODE_REPLAYED"); checks++;
    await repo.storeAuthorizationCodeHash("u1", { authorization_code_id: "code-expired", oauth_client_id: CLIENT, connection_id: C2, code_hash: H4, redirect_uri: REDIRECT, resource_uri: C.RESOURCE_URI, pkce_method: "S256", pkce_challenge: PKCE, scopes: ["agent.connection.read"], issued_at: T0, expires_at: T1 });
    await expectCode(repo.consumeAuthorizationCodeHash("u1", { code_hash: H4, oauth_client_id: CLIENT, connection_id: C2, redirect_uri: REDIRECT, resource_uri: C.RESOURCE_URI }, T2), "AA_OAUTH_CODE_EXPIRED");
    assert.strictEqual((await ctx.get(`SELECT status FROM agent_authorization_codes WHERE authorization_code_id='code-expired'`)).status, "EXPIRED"); checks++;

    const current = await repo.loadConnection("u1", C1);
    await repo.createTokenFamily("u1", { token_family_id: "family-one", refresh_token_id: "refresh-one", oauth_client_id: CLIENT, connection_id: C1, token_hash: H2, issued_at: T1, expires_at: "2026-08-16T09:00:00.000Z", idle_expires_at: "2026-08-16T09:00:00.000Z", absolute_expires_at: "2026-10-15T09:00:00.000Z" }); checks++;
    const rotated = await repo.rotateRefreshTokenHash("u1", { connection_id: C1, presented_token_hash: H2, new_refresh_token_id: "refresh-two", new_token_hash: H3, new_expires_at: "2026-08-16T09:00:00.000Z", new_idle_expires_at: "2026-08-16T09:00:00.000Z" }, T2);
    assert.strictEqual(rotated.status, "ACTIVE"); checks++;
    await expectCode(repo.rotateRefreshTokenHash("u1", { connection_id: C1, presented_token_hash: H2, new_refresh_token_id: "refresh-three", new_token_hash: H4, new_expires_at: "2026-08-16T09:00:00.000Z", new_idle_expires_at: "2026-08-16T09:00:00.000Z" }, T3), "AA_OAUTH_REFRESH_REUSE_DETECTED");
    assert.strictEqual((await repo.loadConnection("u1", C1)).status, "SUSPENDED");
    assert.strictEqual((await ctx.get(`SELECT status FROM agent_token_families WHERE token_family_id='family-one'`)).status, "REUSE_DETECTED");
    assert.strictEqual((await ctx.get(`SELECT status FROM agent_refresh_tokens WHERE refresh_token_id='refresh-two'`)).status, "REVOKED");
    assert.strictEqual(current.connection_id, C1); checks++;

    const stillIndependent = await repo.validateConnectionSnapshot("u1", C2, { oauth_client_id: CLIENT, scopes: ["agent.connection.read"] }, T3);
    assert.strictEqual(stillIndependent.connection_id, C2); checks++;
    await repo.denyAccessTokenHash("u1", { denial_id: "deny-one", connection_id: C2, token_family_id: null, jti_hash: "e".repeat(64), reason_code: "INCIDENT", expires_at: "2026-07-17T09:10:00.000Z" }, T3); checks++;

    const exported = await repo.exportAgentAccess("u1");
    const identityExport = await identity.exportUserData("u1");
    const serialized = JSON.stringify({ exported, identityExport });
    for (const secret of [H1, H2, H3, H4, "e".repeat(64), PKCE, "subject-owner-opaque"]) assert.ok(!serialized.includes(secret), `secret-like value exported: ${secret.slice(0, 8)}`);
    assert.ok(exported.connections.length === 2 && exported.token_families.length === 1); checks++;

    await repo.deleteConnection("u1", C2, "USER_DELETE", T3);
    await expectCode(repo.loadConnection("u1", C2), "AA_OAUTH_CONNECTION_NOT_FOUND");
    assert.strictEqual((await ctx.get(`SELECT COUNT(*) c FROM agent_access_erasure_journal WHERE user_id='u1' AND connection_id=?`, [C2])).c, 1); checks++;

    await identity.deleteUserData("u2");
    const u2Rows = await identity.countUserRows("u2");
    assert.strictEqual(u2Rows.total, 0); checks++;

    const subjectBefore = await ctx.get(`SELECT security_epoch FROM agent_subject_mappings WHERE user_id='u1'`);
    const subjectAfter = await repo.bumpSubjectSecurityEpoch("u1", "ACCOUNT_SECURITY_ACTION", T3);
    assert.strictEqual(subjectAfter.security_epoch, subjectBefore.security_epoch + 1); checks++;

    await repo.setClientStatus(CLIENT, "REVOKED", T3);
    await expectCode(repo.validateConnectionSnapshot("u1", C1, {}, T3), "AA_OAUTH_CONNECTION_INACTIVE"); checks++;

    const purged = await repo.purgeExpiredSecurityArtifacts("2026-11-01T00:00:00.000Z");
    assert.ok(purged.authorization_codes >= 1 && purged.refresh_tokens >= 2 && purged.token_families >= 1 && purged.access_denials >= 0); checks++;

    const files = ["agent/access/oauthContracts.js", "db/agentAccessOAuthRepo.js"];
    const forbidden = /(server\.js|llmGate|review_log|fsrs|mastery|word_status|https?\.request|fetch\s*\(|bearer|mcp)/i;
    for (const file of files) assert.ok(!forbidden.test(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")), `forbidden import/runtime in ${file}`);
    checks++;

    console.log(JSON.stringify({ ok: true, checks, cross_user_leaks: 0, refresh_reuse_family_revoked: true, raw_secrets_stored: 0, exported_secret_values: 0, oauth_endpoints: 0, provider_calls: 0 }));
  } finally { await T.cleanup(ctx); }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
