#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const { CAPABILITIES, CAPABILITY_VERSION } = require("../../agent/access/capabilities");
const { INPUT_SCHEMAS, OUTPUT_SCHEMAS, toolDefinitions } = require("../../agent/access/mcpSchemas");
const { SCOPE_PRESENTATION } = require("../../agent/access/consentCeremony");
const { TOOL_LIMITS } = require("../../agent/access/mcpRateLimiter");
const { createAgentAccessService } = require("../../agent/access/service");
const { createProductionHandlers } = require("../../agent/access/productionHandlers");

const NOW = Date.parse("2026-07-23T00:00:00.000Z");
const EXPIRY = "2026-07-23T01:00:00.000Z";
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks += 1; }
function eq(actual, expected, message) { assert.strictEqual(actual, expected, message); checks += 1; }

function dependencies() {
  return {
    learnerGraphRepo: { getAgentAccessReviewAggregates: async () => ({ scheduled_total: 0, due_total: 0, urgent_total: 0 }), getDue: async () => [], getActivityDelta: async () => ({ by_channel: [], top: [] }) },
    agentRepo: { getLatestOpenPlanAction: async () => null, listExplanationMetadata: async () => ({ items: [], next_before: null }), getProfile: async () => null, getExplanationById: async () => null },
    oauthRepo: { loadConnection: async () => null, listConnectionsForUser: async () => [] },
    publicCatalog: { isReadable: () => true, search: () => ({ catalog_version: "v1", results: [], next_cursor: null }) },
    keyingService: { displayForItemKey: async () => null, glossForItemKey: async () => null },
    corpusSentenceRepo: { listWorkTexts: () => null, getCorpusLessonWindow: async () => null },
    handoffRepo: { mint: async () => null, countActive: async () => 0 },
    agentProposalsRepo: { create: async () => null },
    personalTextsRepo: { hasConsentVersioned: async () => ({ ok: false }), listWithMeta: async () => [] },
    personalTextsContentRepo: { aaGetPersonalTextWindow: async () => ({ ok: false }) },
    textGrantsRepo: { activeGrant: async () => ({ state: "NONE" }) },
    connectionPersistence: async () => ({ access_lifetime: "TOKEN_ONLY", window_expires_at: null }),
    now: () => NOW,
    principalAccessExpiresAt: () => EXPIRY,
  };
}

function principal(requestId) {
  return {
    user_id: "owner-1", oauth_client_id: "hermes", connection_id: "conn-1",
    external_actor_id: "actor-1", request_id: requestId,
    scopes: ["morphology.read"], connection_status: "ACTIVE", access_expires_at: EXPIRY,
  };
}

async function call(service, requestId, args) {
  return service.execute(principal(requestId), "get_word_morphology", args);
}

async function main() {
  const handlers = createProductionHandlers(dependencies());
  const service = createAgentAccessService({ enabled: true, ownerIds: ["owner-1"], handlers, now: () => NOW });

  // Canonical acceptance 1/5: decisive exact dictionary form.
  const exact = await call(service, "req-exact", { word: "לכתוב" });
  ok(exact.ok, JSON.stringify(exact));
  eq(exact.result.resolution, "EXACT");
  eq(exact.result.entries.length, 1);
  eq(exact.result.entries[0].lemma, "לכתוב");
  eq(exact.result.entries[0].confidence, "EXACT");
  eq(exact.result.dataset_version, "pealim-infl-v12");
  eq(exact.result.schema_version, "aa.word_morphology.1.0.0");

  // 2/5: homograph — preserve alternatives; never promote one to EXACT.
  const homograph = await call(service, "req-homograph", { word: "בא" });
  ok(homograph.ok, JSON.stringify(homograph));
  eq(homograph.result.resolution, "AMBIGUOUS");
  ok(homograph.result.entries.length >= 2 && homograph.result.entries.length <= 5, JSON.stringify(homograph.result));
  ok(homograph.result.entries.some((entry) => entry.lemma === "לבוא"), "verb alternative missing");
  ok(homograph.result.entries.some((entry) => entry.lemma === "בא"), "adjective alternative missing");
  ok(homograph.result.entries.every((entry) => entry.confidence !== "EXACT"), "ambiguous result claimed EXACT");

  // 3/5: stacked כ+ש proclitic via the existing precision-first pure-core FSA.
  const proclitic = await call(service, "req-proclitic", { word: "כשתבוא" });
  ok(proclitic.ok, JSON.stringify(proclitic));
  eq(proclitic.result.resolution, "EXACT");
  eq(proclitic.result.entries[0].lemma, "לבוא");
  eq(proclitic.result.entries[0].confidence, "PROBABLE");
  eq(proclitic.result.entries[0].tense, "FUTURE");

  // 4/5: malformed/non-Hebrew is a typed client fault, not INTERNAL_ERROR.
  const junk = await call(service, "req-junk", { word: "garbage" });
  eq(junk.ok, false);
  eq(junk.error.code, "AA_INVALID_INPUT");
  eq(junk.error.retryable, false);

  // 5/5: a well-formed unknown Hebrew word is honest UNRESOLVED, not an error.
  const unknown = await call(service, "req-oov", { word: "זזזזזז" });
  ok(unknown.ok, JSON.stringify(unknown));
  eq(unknown.result.resolution, "UNRESOLVED");
  eq(unknown.result.unresolved_reason, "NOT_IN_DICTIONARY");
  eq(unknown.result.entries.length, 0);

  // Additive-only schema proof: every prior input/output schema hashes byte-for-byte
  // to the snapshot captured at source HEAD. Later additive tools may coexist.
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.1/schema-before-sha256.json"), "utf8"));
  eq(before.tool_count, 16);
  for (const [name, hashes] of Object.entries(before.tools)) {
    eq(sha(INPUT_SCHEMAS[name]), hashes.input_sha256, `${name} input schema mutated`);
    eq(sha(OUTPUT_SCHEMAS[name]), hashes.output_sha256, `${name} output schema mutated`);
  }
  const tools = toolDefinitions();
  ok(tools.length >= 17, "morphology tool disappeared from additive catalog");
  ok(tools.some((tool) => tool.name === "get_word_morphology"), "get_word_morphology missing");
  eq(CAPABILITY_VERSION, "aa-v0.1");
  eq(CAPABILITIES.get_word_morphology.scope, "morphology.read");
  eq(TOOL_LIMITS.get_word_morphology.minute, 6);
  eq(TOOL_LIMITS.get_word_morphology.day, 200);
  eq(SCOPE_PRESENTATION["morphology.read"].retention_tier, "AGGREGATE");

  const ui = fs.readFileSync(path.join(ROOT, "public/js/agent-access.js"), "utf8");
  ok(/"morphology\.read":\{ru:"[^"]+",en:"[^"]+",he:"[^"]+"\}/.test(ui), "ru/en/he scope label missing");
  const resolverSource = fs.readFileSync(path.join(ROOT, "agent/access/wordMorphologyResolver.js"), "utf8");
  ok(!/\b(fetch|https?\.request|generateContent|openai|gemini)\s*\(/i.test(resolverSource), "network/LLM call in resolver path");
  const migration = fs.readFileSync(path.join(ROOT, "migrations/054_agent_access_morphology_scope.sql"), "utf8");
  ok(migration.includes("'morphology.read'"), "migration omits morphology scope");
  ok(!/^\s*(BEGIN|COMMIT)\b/im.test(migration), "migration owns transaction boundary");
  const policy = fs.readFileSync(path.join(ROOT, "docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.1/MORPHOLOGY_GROUNDING_ADDENDUM.md"), "utf8");
  ok(/Before asserting[\s\S]+call `mcp__linguistpro__get_word_morphology`/.test(policy), "policy does not require a preceding call");
  ok(/UNRESOLVED[\s\S]+Не найдено в офлайн-словаре; проверь в приложении/.test(policy), "policy lacks honest UNRESOLVED response");
  ok(/Violation:[\s\S]+without a successful immediately relevant `get_word_morphology` call/.test(policy), "policy violation rule missing");

  console.log(`[agent-word-morphology] PASS ${checks} checks; acceptance 5/5; morphology remains additive; existing schema hashes unchanged`);
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
