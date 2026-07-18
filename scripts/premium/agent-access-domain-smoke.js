#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const capabilities = require("../../agent/access/capabilities");
const { createAgentAccessService } = require("../../agent/access/service");
const scenarios = require("../../agent/controlPlane/scenarioRegistry");

const NOW = Date.parse("2026-07-17T09:00:00.000Z");
const GENERATED = "2026-07-17T09:00:00.000Z";
const principal = Object.freeze({
  user_id: "owner-1",
  oauth_client_id: "client-hermes-fixture",
  connection_id: "connection-fixture-1",
  external_actor_id: "actor-fixture-1",
  request_id: "request-fixture-1",
  scopes: Object.freeze(Object.values(capabilities.CAPABILITIES).map((x) => x.scope)),
  connection_status: "ACTIVE",
  access_expires_at: "2026-07-17T09:10:00.000Z",
});

const fixtures = Object.freeze({
  get_learning_brief: Object.freeze({
    schema_version: "aa.learning_brief.1.0.0", due_total: 12, urgent_total: 4, scheduled_total: 31,
    estimated_minutes: 9, priority_code: "REVIEW_DUE", unfinished_action_code: "REVIEW_AVAILABLE",
    generated_at: GENERATED, expires_at: "2026-07-17T09:05:00.000Z",
  }),
  get_review_summary: Object.freeze({
    schema_version: "aa.review_summary.1.0.0", due_total: 12, urgent_total: 4, estimated_minutes: 9,
    handoff_eligible: false, handoff_scope_available: false, generated_at: GENERATED, expires_at: "2026-07-17T09:02:00.000Z",
  }),
  search_public_reading_catalog: Object.freeze({
    schema_version: "aa.public_reading_search.1.0.0", catalog_version: "catalog-1",
    results: Object.freeze([Object.freeze({ work_id: "work-1", title: "Public work", author: "Public author", era: "REVIVAL", genre: "PROSE", language: "he", sentence_count: 120, audio_available: false, ready_state: "READY", first_party_path: "/library.html" })]),
    next_cursor: null, generated_at: GENERATED,
  }),
  get_recent_explanation_metadata: Object.freeze({
    schema_version: "aa.explanation_metadata.1.0.0",
    items: Object.freeze([Object.freeze({ explanation_id: "explanation-1", created_at: GENERATED, kind: "word", construct_ids: Object.freeze(["construct-1"]), purge_state: "AVAILABLE" })]),
    next_before: null, generated_at: GENERATED,
  }),
  get_agent_connection: Object.freeze({
    schema_version: "aa.connection.1.0.0", connection_id: principal.connection_id, oauth_client_id: principal.oauth_client_id,
    client_display_name: "Fixture client", connection_status: "ACTIVE", granted_scopes: principal.scopes,
    access_expires_at: principal.access_expires_at, access_lifetime: "PERSISTENT_WINDOW", window_expires_at: null,
    consent_version: "consent-1", capability_version: "aa-v0.1",
    downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO", generated_at: GENERATED,
  }),
  get_due_review_items: Object.freeze({
    schema_version: "aa.due_review_items.1.0.0",
    items: Object.freeze([Object.freeze({ display: "כָּתַב", gloss: "написал", struggle: "high", due_day: "2026-07-17", content_available: true })]),
    due_total: 12, truncated: true, generated_at: GENERATED,
  }),
  get_learner_profile: Object.freeze({
    schema_version: "aa.learner_profile.1.0.0", mode: "coach", language: "ru", depth: "detailed", generated_at: GENERATED,
  }),
});

const validArgs = Object.freeze({
  get_learning_brief: Object.freeze({}),
  get_review_summary: Object.freeze({}),
  search_public_reading_catalog: Object.freeze({ language: "he", audio: "ANY", ready: "ANY", sort: "RELEVANCE", limit: 10 }),
  get_recent_explanation_metadata: Object.freeze({ kinds: Object.freeze(["word"]), limit: 10 }),
  get_agent_connection: Object.freeze({}),
  get_due_review_items: Object.freeze({ limit: 10 }),
  get_learner_profile: Object.freeze({}),
});

function handlers(overrides = {}) {
  return Object.fromEntries(capabilities.capabilityNames().map((name) => [name, overrides[name] || (async () => fixtures[name])]));
}
function service(overrides = {}) {
  return createAgentAccessService({ enabled: true, ownerIds: ["owner-1"], handlers: handlers(), now: () => NOW, ...overrides });
}
async function expectCode(promise, code) {
  const out = await promise;
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.error.code, code);
  assert.deepStrictEqual(Object.keys(out.error).sort(), ["code", "request_id", "retryable", "schema_version"]);
}

(async () => {
  let checks = 0;
  const noNetwork = () => { throw new Error("NETWORK_CALL_FORBIDDEN"); };
  const previousFetch = global.fetch;
  global.fetch = noNetwork;
  try {
    await expectCode(createAgentAccessService({ ownerIds: ["owner-1"], handlers: handlers(), now: () => NOW }).execute(principal, "get_learning_brief", {}), "FEATURE_DISABLED"); checks++;
    await expectCode(service({ ownerIds: ["other-owner"] }).execute(principal, "get_learning_brief", {}), "OWNER_NOT_ALLOWED"); checks++;
    await expectCode(service().execute({ ...principal, connection_status: "REVOKED" }, "get_learning_brief", {}), "CONNECTION_INACTIVE"); checks++;
    await expectCode(service().execute({ ...principal, access_expires_at: GENERATED }, "get_learning_brief", {}), "ACCESS_EXPIRED"); checks++;
    await expectCode(service().execute({ ...principal, scopes: ["review.summary.read"] }, "get_learning_brief", {}), "INSUFFICIENT_SCOPE"); checks++;
    await expectCode(service().execute(principal, "not_a_tool", {}), "UNKNOWN_TOOL"); checks++;
    await expectCode(service().execute(principal, "get_learning_brief", { user_id: "attacker" }), "UNKNOWN_FIELD"); checks++;
    await expectCode(service().execute(principal, "search_public_reading_catalog", { language: "he", audio: "ANY", ready: "ANY", sort: "RELEVANCE", limit: 10, query: "x".repeat(5000) }), "ARGUMENTS_TOO_LARGE"); checks++;
    await expectCode(service().execute({ ...principal, attacker: true }, "get_learning_brief", {}), "UNKNOWN_FIELD"); checks++;
    await expectCode(service({ disabledTools: ["get_learning_brief"] }).execute(principal, "get_learning_brief", {}), "CAPABILITY_DISABLED"); checks++;

    for (const name of capabilities.capabilityNames()) {
      const out = await service().execute(principal, name, validArgs[name]);
      assert.strictEqual(out.ok, true, `${name} failed: ${JSON.stringify(out)}`);
      assert.strictEqual(out.tool, name);
      assert.strictEqual(out.request_id, principal.request_id);
      assert.deepStrictEqual(Object.keys(out).sort(), ["ok", "request_id", "result", "schema_version", "tool"]);
      checks++;
    }

    let capturedContext = null;
    let capturedArgs = null;
    const inspecting = handlers({ get_learning_brief: async (ctx, args) => { capturedContext = ctx; capturedArgs = args; return fixtures.get_learning_brief; } });
    const inspected = await service({ handlers: inspecting }).execute(principal, "get_learning_brief", {});
    assert.strictEqual(inspected.ok, true);
    assert.deepStrictEqual(Object.keys(capturedContext).sort(), ["connection_id", "external_actor_id", "oauth_client_id", "purpose", "request_id", "scenario_id", "user_id"]);
    assert.strictEqual(capturedContext.purpose, "EXPLICIT_CURRENT_LEARNING_BRIEF");
    assert.strictEqual(Object.isFrozen(capturedContext), true);
    assert.strictEqual(Object.isFrozen(capturedArgs), true);
    assert.ok(!Object.prototype.hasOwnProperty.call(capturedContext, "scopes"));
    assert.ok(!Object.prototype.hasOwnProperty.call(capturedContext, "token"));
    checks++;

    const poisoned = handlers({ get_learning_brief: async () => ({ ...fixtures.get_learning_brief, private_body: "secret" }) });
    await expectCode(service({ handlers: poisoned }).execute(principal, "get_learning_brief", {}), "UNKNOWN_FIELD"); checks++;
    const mismatched = handlers({ get_agent_connection: async () => ({ ...fixtures.get_agent_connection, connection_id: "connection-other" }) });
    await expectCode(service({ handlers: mismatched }).execute(principal, "get_agent_connection", {}), "CONNECTION_BINDING_MISMATCH"); checks++;

    const capScenarioIds = Object.values(capabilities.CAPABILITIES).map((x) => x.scenario_id).sort();
    assert.strictEqual(new Set(capScenarioIds).size, capabilities.capabilityNames().length);
    for (const scenarioId of capScenarioIds) {
      const scenario = scenarios.get(scenarioId);
      assert.ok(scenario, `missing CP0 scenario ${scenarioId}`);
      assert.deepStrictEqual(scenario.surfaces, ["external_agent"]);
      assert.strictEqual(scenario.role, "agent_access.reader");
    }
    checks++;

    const root = path.resolve(__dirname, "../..");
    const files = ["agent/access/contracts.js", "agent/access/capabilities.js", "agent/access/service.js"];
    const forbidden = /(server\.js|llmGate|agentRepo|review_log|fsrs|mastery|word_status|consentRepo|identityRepo|sqlite|https?\.request|fetch\s*\()/i;
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      assert.ok(!forbidden.test(source), `forbidden dependency or network call in ${file}`);
    }
    checks++;

    console.log(JSON.stringify({ ok: true, checks, capabilities: capabilities.capabilityNames().length, network_calls: 0, provider_calls: 0, live_data_reads: 0 }));
  } finally {
    global.fetch = previousFetch;
  }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
