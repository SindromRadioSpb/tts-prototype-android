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

const NOW = Date.parse("2026-07-23T06:00:00.000Z");
const EXPIRY = "2026-07-23T07:00:00.000Z";
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks += 1; }
function eq(actual, expected, message) { assert.strictEqual(actual, expected, message); checks += 1; }
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function projection(manual = {}) {
  return Object.freeze({
    version: "review-log-keyer-v1+fsrs6-core-v2+stale-engine-filter-v1",
    generated_at_ms: NOW,
    manual: Object.freeze({ ...manual }),
    scheduled: Object.freeze([]),
  });
}

function dependencies({ grant = true, learnerProjection = projection(), corpusRows, personalRows } = {}) {
  return {
    learnerGraphRepo: {
      getAgentAccessReviewAggregates: async () => ({ scheduled_total: 0, due_total: 0, urgent_total: 0 }),
      getDue: async () => [], getActivityDelta: async () => ({ by_channel: [], top: [] }),
      getCoverageProjection: async () => learnerProjection,
    },
    agentRepo: { getLatestOpenPlanAction: async () => null, listExplanationMetadata: async () => ({ items: [], next_before: null }), getProfile: async () => null, getExplanationById: async () => null },
    oauthRepo: { loadConnection: async () => null, listConnectionsForUser: async () => [] },
    publicCatalog: { isReadable: () => true, search: () => ({ catalog_version: "v1", results: [], next_cursor: null }) },
    keyingService: { displayForItemKey: async () => null, glossForItemKey: async () => null },
    corpusSentenceRepo: {
      listWorkTexts: () => null, getCorpusLessonWindow: async () => null,
      getCorpusCoverageText: () => ({ ok: true, rows: corpusRows || [{ he: "לכתוב לכתוב", he_niqqud: "לִכְתּוֹב לִכְתּוֹב" }] }),
    },
    handoffRepo: { mint: async () => null, countActive: async () => 0 },
    agentProposalsRepo: { create: async () => null },
    personalTextsRepo: { hasConsentVersioned: async () => ({ ok: true }), listWithMeta: async () => [] },
    personalTextsContentRepo: {
      aaGetPersonalTextWindow: async () => ({ ok: false }),
      aaGetPersonalCoverageText: async () => ({ ok: true, rows: personalRows || [{ he: "לכתוב", he_niqqud: "לִכְתּוֹב" }] }),
    },
    textGrantsRepo: { activeGrant: async () => grant ? ({ state: "ACTIVE", grant: { connection_id: "conn-1" } }) : ({ state: "NONE" }) },
    connectionPersistence: async () => ({ access_lifetime: "TOKEN_ONLY", window_expires_at: null }),
    now: () => NOW,
    principalAccessExpiresAt: () => EXPIRY,
  };
}

function principal(requestId) {
  return Object.freeze({
    user_id: "owner-1", oauth_client_id: "hermes", connection_id: "conn-1",
    external_actor_id: "actor-1", request_id: requestId,
    scopes: ["learner.coverage.read"], connection_status: "ACTIVE", access_expires_at: EXPIRY,
  });
}

function service(options) {
  const handlers = createProductionHandlers(dependencies(options));
  return createAgentAccessService({ enabled: true, ownerIds: ["owner-1"], handlers, now: () => NOW });
}

async function call(svc, requestId, args) {
  return svc.execute(principal(requestId), "get_text_coverage", args);
}

async function main() {
  process.env.CORPUS_WORKS_DEV_FALLBACK = "1";
  const realCorpus = require("../../db/corpusSentenceRepo").getCorpusCoverageText("10");
  ok(realCorpus.ok && realCorpus.source === "BEN_YEHUDA_BAKED_CORPUS", "real baked Ben-Yehuda source unavailable");
  ok(realCorpus.rows.length > 0 && realCorpus.rows.every((row) => Object.keys(row).sort().join(",") === "he,he_niqqud"), "real corpus source shape invalid");

  // Canonical acceptance 1/5: a complete baked Ben-Yehuda work is a supported source.
  const corpus = await call(service({ learnerProjection: projection({ "pid:1": "known" }) }), "req-corpus", { target: { work_id: "10" } });
  ok(corpus.ok, JSON.stringify(corpus));
  eq(corpus.result.status, "AVAILABLE");
  eq(corpus.result.recorded_familiar_pct_lower_bound, 100);
  eq(corpus.result.counts.familiar, corpus.result.counts.eligible_denominator);
  eq(corpus.result.schema_version, "aa.text_coverage.2.0.0");

  // 2/5: a complete synced personal text is equally supported when its live grant exists.
  const personal = await call(service({ learnerProjection: projection({ "pid:1": "known" }) }), "req-personal", { target: { text_key: "owner-text-1" } });
  ok(personal.ok, JSON.stringify(personal));
  eq(personal.result.status, "AVAILABLE");
  eq(personal.result.counts.familiar, 1);

  // 3/5: personal coverage fails closed without the same per-connection grant as S2 content.
  const denied = await call(service({ grant: false }), "req-no-grant", { target: { text_key: "owner-text-1" } });
  eq(denied.ok, false);
  eq(denied.error.code, "AA_TEXT_ACCESS_NOT_GRANTED");

  // 4/5: a specific body with no Hebrew tokens returns honest unavailability, not fake zeroes.
  const unavailable = await call(service({ corpusRows: [{ he: "123 !!!", he_niqqud: "" }] }), "req-no-hebrew", { target: { work_id: "10" } });
  ok(unavailable.ok, JSON.stringify(unavailable));
  eq(unavailable.result.status, "UNSUPPORTED");
  eq(unavailable.result.reason_code, "NO_HEBREW_TOKENS");
  eq(unavailable.result.recorded_familiar_pct_lower_bound, null);

  // 5/5: an empty learner projection asks for a profile; it is not a fabricated 0%.
  const empty = await call(service(), "req-empty-projection", { target: { work_id: "10" }, top_unknown_limit: 5 });
  ok(empty.ok, JSON.stringify(empty));
  eq(empty.result.status, "NEEDS_PROFILE");
  eq(empty.result.counts, null);
  eq(empty.result.recorded_familiar_pct_lower_bound, null);
  ok(!Object.prototype.hasOwnProperty.call(empty.result, "recommendation_band"), "threshold band leaked into v2");

  // Closed input: neither or both source identifiers are typed invalid input.
  for (const target of [{}, { work_id: "10", text_key: "owner-text-1" }]) {
    const invalid = await call(service(), `req-invalid-${checks}`, { target });
    eq(invalid.ok, false); eq(invalid.error.code, "AA_INVALID_INPUT");
  }

  eq(CAPABILITY_VERSION, "aa-v0.1");
  eq(CAPABILITIES.get_text_coverage.scope, "learner.coverage.read");
  eq(TOOL_LIMITS.get_text_coverage.minute, 6); eq(TOOL_LIMITS.get_text_coverage.day, 200);
  eq(SCOPE_PRESENTATION["learner.coverage.read"].retention_tier, "PERSONAL");
  ok(toolDefinitions().length >= 18, "coverage tool disappeared from additive catalog");
  ok(INPUT_SCHEMAS.get_text_coverage && OUTPUT_SCHEMAS.get_text_coverage, "coverage schemas missing");
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.2/schema-before-sha256.json"), "utf8"));
  eq(before.tool_count, 17);
  for (const [name, hashes] of Object.entries(before.tools)) {
    eq(sha(INPUT_SCHEMAS[name]), hashes.input_sha256, `${name} input schema mutated`);
    eq(sha(OUTPUT_SCHEMAS[name]), hashes.output_sha256, `${name} output schema mutated`);
  }
  ok(toolDefinitions().filter((tool) => !before.tools[tool.name]).map((tool) => tool.name).includes("get_text_coverage"), "coverage addition disappeared");

  const ui = fs.readFileSync(path.join(ROOT, "public/js/agent-access.js"), "utf8");
  ok(/"learner\.coverage\.read":\{ru:"[^"]+",en:"[^"]+",he:"[^"]+"\}/.test(ui), "ru/en/he scope label missing");
  const resolver = fs.readFileSync(path.join(ROOT, "agent/access/textCoverageResolver.js"), "utf8");
  ok(!/\b(fetch|https?\.request|generateContent|openai|gemini)\s*\(/i.test(resolver), "network/LLM call in resolver path");
  const migration = fs.readFileSync(path.join(ROOT, "migrations/055_agent_access_coverage_scope.sql"), "utf8");
  ok(migration.includes("'learner.coverage.read'"), "migration omits coverage scope");
  ok(!/^\s*(BEGIN|COMMIT)\b/im.test(migration), "migration owns transaction boundary");
  const sourceContract = fs.readFileSync(path.join(ROOT, "docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.2/SOURCE_VISIBILITY_CONTRACT.md"), "utf8");
  ok(/both source classes/i.test(sourceContract) && /work_id/.test(sourceContract) && /text_key/.test(sourceContract), "durable two-source contract missing");
  const policy = fs.readFileSync(path.join(ROOT, "docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/h2.2/TEXT_COVERAGE_ADDENDUM.md"), "utf8");
  ok(/must call.*get_text_coverage/is.test(policy), "Hermes policy does not require coverage call");

  console.log(`[agent-text-coverage] PASS ${checks} checks; acceptance 5/5; both source classes verified; additive catalog preserved`);
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
