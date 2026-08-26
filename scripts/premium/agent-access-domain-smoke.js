#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const capabilities = require("../../agent/access/capabilities");
const { createAgentAccessService } = require("../../agent/access/service");
const { SCOPE_PRESENTATION } = require("../../agent/access/consentCeremony");
const scenarios = require("../../agent/controlPlane/scenarioRegistry");
const { TOOL_LIMITS } = require("../../agent/access/mcpRateLimiter");
const mcpSchemas = require("../../agent/access/mcpSchemas");

const NOW = Date.parse("2026-07-17T09:00:00.000Z");
const GENERATED = "2026-07-17T09:00:00.000Z";
const principal = Object.freeze({
  user_id: "owner-1",
  oauth_client_id: "client-hermes-fixture",
  connection_id: "connection-fixture-1",
  external_actor_id: "actor-fixture-1",
  request_id: "request-fixture-1",
  scopes: Object.freeze([...new Set(Object.values(capabilities.CAPABILITIES).map((x) => x.scope))]),
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
    client_display_name: "Fixture client", connection_status: "ACTIVE", granted_scopes: Object.freeze(principal.scopes.filter((scope) => !new Set(["morphology.read","learner.coverage.read","reading.group_corpus.read","learner.group_coverage.read","intent.import_text.propose","intent.track_word.propose","intent.goal.propose","goal.read","reading.publication.catalog.read","reading.publication.item.read","reading.publication.resource.read"]).has(scope))),
    access_expires_at: principal.access_expires_at, consent_version: "consent-1", capability_version: "aa-v0.1",
    downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO", generated_at: GENERATED,
  }),
  get_access_window: Object.freeze({
    schema_version: "aa.access_window.1.0.0", access_lifetime: "PERSISTENT_WINDOW", window_expires_at: null,
    access_expires_at: principal.access_expires_at, generated_at: GENERATED,
  }),
  get_due_review_items: Object.freeze({
    schema_version: "aa.due_review_items.1.0.0",
    items: Object.freeze([Object.freeze({ display: "כָּתַב", gloss: "написал", struggle: "high", due_day: "2026-07-17", content_available: true })]),
    due_total: 12, next_cursor: null, generated_at: GENERATED,
  }),
  get_learner_profile: Object.freeze({
    schema_version: "aa.learner_profile.1.0.0", mode: "coach", language: "ru", depth: "detailed", generated_at: GENERATED,
  }),
  get_explanation_body: Object.freeze({
    schema_version: "aa.explanation_body.1.0.0", explanation_id: "explanation-1", created_at: GENERATED,
    kind: "word", purge_state: "AVAILABLE", language: "ru", text: "fixture explanation body", lines: null, generated_at: GENERATED,
  }),
  get_reading_content: Object.freeze({
    schema_version: "aa.reading_content.1.0.0",
    work: Object.freeze({ title: "Fixture work", author: "Fixture author", era: "REVIVAL", license: "public-domain" }),
    anchor: Object.freeze({ work_id: "42", text_key: "a1b2c3d4e5f60718", start_order_index: 0, row_count: 1 }),
    rows: Object.freeze([Object.freeze({ order_index: 0, he: "בְּרֵאשִׁית", ru: "В начале" })]),
    available_text_keys: Object.freeze(["a1b2c3d4e5f60718"]), generated_at: GENERATED,
  }),
  create_reading_handoff: Object.freeze({
    schema_version: "aa.reading_handoff.1.0.0", handoff_url: "https://linguistpro.kolosei.com/library.html?handoff=abcdefABCDEF0123456789_-xy",
    expires_in_ms: 300000, work_id: "42", text_key: "a1b2c3d4e5f60718", action: "open_corpus", generated_at: GENERATED,
  }),
  propose_action: Object.freeze({
    schema_version: "aa.proposal.1.0.0", proposal_id: "ap_0123456789abcdef0123456789abcdef",
    kind: "note", status: "PENDING", expires_at: "2026-07-24T09:00:00.000Z", generated_at: GENERATED,
  }),
  get_progress_delta: Object.freeze({
    schema_version: "aa.progress_delta.1.0.0", since: "2026-07-10T00:00:00.000Z",
    reviews_total: 12, skips_total: 1, distinct_items: 7, new_items_scheduled: 3, active_days: 4,
    by_channel: Object.freeze([Object.freeze({ channel: "read", count: 8 }), Object.freeze({ channel: "cloze", count: 4 })]),
    top_items: Object.freeze([Object.freeze({ display: "כָּתַב", gloss: "написал", times: 3 })]),
    generated_at: GENERATED,
  }),
  create_review_handoff: Object.freeze({
    schema_version: "aa.review_handoff.1.0.0", handoff_url: "https://linguistpro.kolosei.com/library.html?handoff=abcdefABCDEF0123456789_-xy",
    expires_in_ms: 300000, action: "open_review", generated_at: GENERATED,
  }),
  list_personal_texts: Object.freeze({
    schema_version: "aa.personal_texts_list.1.0.0",
    items: Object.freeze([Object.freeze({ text_key: "text-1783830247939-hpbn", title: "Мой текст", rows_count: 12, content_updated_at: GENERATED, replica_ingested_at: GENERATED })]),
    total: 1, next_cursor: null, authority: "OWNER_DEVICE_CANONICAL", generated_at: GENERATED,
  }),
  get_personal_text_content: Object.freeze({
    schema_version: "aa.personal_text_content.1.0.0", text_key: "text-1783830247939-hpbn", title: "Мой текст",
    rows: Object.freeze([Object.freeze({ order_index: 0, he: "שלום עולם", ru: "Привет мир" })]),
    rows_total: 12, has_more: true, content_updated_at: GENERATED, replica_ingested_at: GENERATED,
    authority: "OWNER_DEVICE_CANONICAL", generated_at: GENERATED,
  }),
  get_word_morphology: Object.freeze({
    schema_version: "aa.word_morphology.1.0.0", resolution: "EXACT",
    entries: Object.freeze([Object.freeze({
      lemma: "לכתוב", root: "כתב", pos: "verb", binyan: "paal", tense: "INFINITIVE",
      niqqud_form: "לִכְתּוֹב", gloss_ru: "писать", confidence: "EXACT", provenance: "PEALIM_OFFLINE_V12",
    })]),
    resolver_version: "word-morphology-resolver-v1", dataset_version: "pealim-infl-v12", generated_at: GENERATED,
  }),
  get_text_coverage: Object.freeze({
    schema_version: "aa.text_coverage.2.0.0", status: "AVAILABLE", reason_code: "RECORDED_FAMILIARITY_READY",
    counts: Object.freeze({ lexical_total: 10, eligible_denominator: 10, familiar: 9, explicit_new: 0, untracked: 1, unresolved: 0, ignored_excluded: 0, proper_names_excluded: 0 }),
    recorded_familiar_pct_lower_bound: 90, unresolved_uncertainty_pp: 0, rank_eligible: true,
    top_unknown: Object.freeze([Object.freeze({ lemma: "מילה", freq_in_text: 1, gloss_ru: "слово" })]),
    learner_projection_version: "fixture-projection-v1",
    tokenizer_version: "reader-morph-tokenizer-v1", resolver_version: "recorded-familiarity-v2+fixture",
    generated_at: GENERATED,
  }),
  search_group_reading_catalog: Object.freeze({
    schema_version:"aa.group_reading_search.1.0.0",results:Object.freeze([Object.freeze({corpus_id:"fixture-corpus",corpus_title:"Учебные песни",corpus_version:1,work_id:"song-pos-001",title:"כולם גנבים",artist:"אושר כהן",position_no:1,rows_count:42,audio_available:true,level:"A2",topic:"songs",tags:Object.freeze(["fixture"]),access:"GROUP_RESTRICTED",first_party_path:"/library.html"})]),next_cursor:null,generated_at:GENERATED,
  }),
  get_group_reading_content: Object.freeze({
    schema_version:"aa.group_reading_content.1.0.0",corpus:Object.freeze({corpus_id:"fixture-corpus",title:"Учебные песни",version:1,access:"GROUP_RESTRICTED"}),work:Object.freeze({work_id:"song-pos-001",title:"כולם גנבים",artist:"אושר כהן",source_url:null,rights_status:"REVIEW_REQUIRED"}),anchor:Object.freeze({corpus_id:"fixture-corpus",work_id:"song-pos-001",start_order_index:0,row_count:1}),rows:Object.freeze([Object.freeze({order_index:0,he:"לִכְתּוֹב",ru:"писать"})]),rows_total:42,has_more:true,authority:"GROUP_CORPUS_SERVER_CANONICAL",generated_at:GENERATED,
  }),
  get_group_text_coverage: Object.freeze({
    schema_version:"aa.group_text_coverage.2.0.0",target:Object.freeze({corpus_id:"fixture-corpus",work_id:"song-pos-001",title:"כולם גנבים"}),status:"AVAILABLE",reason_code:"RECORDED_FAMILIARITY_READY",counts:Object.freeze({lexical_total:10,eligible_denominator:10,familiar:9,explicit_new:0,untracked:1,unresolved:0,ignored_excluded:0,proper_names_excluded:0}),recorded_familiar_pct_lower_bound:90,unresolved_uncertainty_pp:0,rank_eligible:true,top_unknown:Object.freeze([Object.freeze({lemma:"מילה",freq_in_text:1,gloss_ru:"слово"})]),learner_projection_version:"fixture-projection-v1",tokenizer_version:"reader-morph-tokenizer-v1",resolver_version:"recorded-familiarity-v2+fixture",generated_at:GENERATED,
  }),
  propose_import_text: Object.freeze({schema_version:"aa.propose_import_text.1.0.0",proposal_id:"ap_0123456789abcdef0123456789abcdef",status:"PENDING",generated_at:GENERATED}),
  propose_track_word: Object.freeze({schema_version:"aa.propose_track_word.1.0.0",proposal_id:"ap_0123456789abcdef0123456789abcdef",status:"PENDING",per_item:Object.freeze([Object.freeze({surface:"מילה",resolution:"RESOLVED"})]),generated_at:GENERATED}),
  propose_goal: Object.freeze({schema_version:"aa.propose_goal.1.0.0",proposal_id:"ap_0123456789abcdef0123456789abcdef",status:"PENDING",generated_at:GENERATED}),
  get_current_goal: Object.freeze({schema_version:"aa.current_goal.1.0.0",goal:null,generated_at:GENERATED}),
  list_published_public_corpora: Object.freeze({schema_version:"aa.published_public_corpora.1.0.0",corpora:Object.freeze([Object.freeze({corpus_id:"pc-songs",slug:"study-songs",title:"Study Songs",description:"Public songs",edition_id:"ed-songs-1",edition_number:1,manifest_sha256:"a".repeat(64),item_count:77,asset_count:100,published_at:GENERATED})]),next_cursor:null,generated_at:GENERATED}),
  search_published_public_items: Object.freeze({schema_version:"aa.published_public_items.1.0.0",items:Object.freeze([Object.freeze({corpus_id:"pc-songs",corpus_slug:"study-songs",corpus_title:"Study Songs",edition_id:"ed-songs-1",edition_number:1,manifest_sha256:"a".repeat(64),edition_item_id:"ei-song-1",public_work_id:"song-1",position_no:1,title:"Song",creator:"Author",snapshot_sha256:"b".repeat(64)})]),next_cursor:null,generated_at:GENERATED}),
  get_published_public_item: Object.freeze({schema_version:"aa.published_public_item.1.0.0",item:Object.freeze({corpus_id:"pc-songs",corpus_slug:"study-songs",corpus_title:"Study Songs",edition_id:"ed-songs-1",edition_number:1,manifest_sha256:"a".repeat(64),edition_item_id:"ei-song-1",public_work_id:"song-1",position_no:1,title:"Song",creator:"Author",snapshot_sha256:"b".repeat(64)}),generated_at:GENERATED}),
  list_published_item_resources: Object.freeze({schema_version:"aa.published_item_resources.1.0.0",edition_id:"ed-songs-1",edition_item_id:"ei-song-1",resources:Object.freeze([Object.freeze({resource_id:"ea-song-1",resource_kind:"PUBLICATION_ASSET",revision_id:null,asset_key:"c".repeat(64),bytes:12345,sha256:"d".repeat(64),mime:"audio/mpeg",url:`https://linguistpro.kolosei.com/api/public-corpora/study-songs/assets/${"c".repeat(64)}`})]),next_cursor:null,generated_at:GENERATED}),
  read_published_text_window: Object.freeze({schema_version:"aa.published_text_window.1.0.0",item:Object.freeze({corpus_id:"pc-songs",corpus_slug:"study-songs",corpus_title:"Study Songs",edition_id:"ed-songs-1",edition_number:1,manifest_sha256:"a".repeat(64),edition_item_id:"ei-song-1",public_work_id:"song-1",position_no:1,title:"Song",creator:"Author",snapshot_sha256:"b".repeat(64)}),start_order_index:0,rows:Object.freeze([Object.freeze({order_index:0,he:"שלום",ru:"Привет"})]),rows_total:1,has_more:false,generated_at:GENERATED}),
});

const validArgs = Object.freeze({
  get_learning_brief: Object.freeze({}),
  get_review_summary: Object.freeze({}),
  search_public_reading_catalog: Object.freeze({ language: "he", audio: "ANY", ready: "ANY", sort: "RELEVANCE", limit: 10 }),
  get_recent_explanation_metadata: Object.freeze({ kinds: Object.freeze(["word"]), limit: 10 }),
  get_agent_connection: Object.freeze({}),
  get_access_window: Object.freeze({}),
  get_due_review_items: Object.freeze({ limit: 10 }),
  get_learner_profile: Object.freeze({}),
  get_explanation_body: Object.freeze({ explanation_id: "explanation-1" }),
  get_reading_content: Object.freeze({ work_id: "42" }),
  create_reading_handoff: Object.freeze({ work_id: "42" }),
  propose_action: Object.freeze({ kind: "note", payload: Object.freeze({ body: "fixture note body" }) }),
  get_progress_delta: Object.freeze({ since: "2026-07-10T00:00:00.000Z", top_limit: 10 }),
  create_review_handoff: Object.freeze({}),
  list_personal_texts: Object.freeze({ limit: 10 }),
  get_personal_text_content: Object.freeze({ text_key: "text-1783830247939-hpbn", rows: 5 }),
  get_word_morphology: Object.freeze({ word: "לכתוב" }),
  get_text_coverage: Object.freeze({ target: Object.freeze({ work_id: "42" }), top_unknown_limit: 10 }),
  search_group_reading_catalog: Object.freeze({ audio:"ANY",sort:"POSITION",limit:10 }),
  get_group_reading_content: Object.freeze({ corpus_id:"fixture-corpus",work_id:"song-pos-001",rows:5 }),
  get_group_text_coverage: Object.freeze({ corpus_id:"fixture-corpus",work_id:"song-pos-001",top_unknown_limit:10 }),
  propose_import_text: Object.freeze({source:Object.freeze({title:"טקסט",origin:"OWNER_SUPPLIED"}),body_preview:"שלום",language:"he",niqqud_status:"NONE",reason:"ללמוד"}),
  propose_track_word: Object.freeze({items:Object.freeze([Object.freeze({surface:"מילה",evidence:"USER_ASKED_ABOUT",reason:"ללמוד"})])}),
  propose_goal: Object.freeze({statement:"Read daily",goal_type:"PROCESS",period_days:7,reason:"weekly reflection"}),
  get_current_goal: Object.freeze({}),
  list_published_public_corpora: Object.freeze({limit:10}),
  search_published_public_items: Object.freeze({corpus_slug:"study-songs",edition_id:"ed-songs-1",query:"Song",limit:10}),
  get_published_public_item: Object.freeze({corpus_slug:"study-songs",edition_id:"ed-songs-1",edition_item_id:"ei-song-1"}),
  list_published_item_resources: Object.freeze({corpus_slug:"study-songs",edition_id:"ed-songs-1",edition_item_id:"ei-song-1",limit:10}),
  read_published_text_window: Object.freeze({corpus_slug:"study-songs",edition_id:"ed-songs-1",edition_item_id:"ei-song-1",start:0,rows:10}),
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

    // Independent oracle (R15-F1 fail-closed): every capability scope must have a
    // consent presentation entry with data_class + retention_tier, or the consent
    // preview fails closed (AA_CONSENT_SCOPE_UNPRESENTED) and the scope is unusable.
    // Tier-enum из ЕДИНОГО источника (ceremony.RETENTION_TIERS — S1 добавил PERSONAL);
    // третья копия списка в смоуке была бы config-string-drift.
    const TIERS = require("../../agent/access/consentCeremony.js").RETENTION_TIERS;
    for (const scope of new Set(Object.values(capabilities.CAPABILITIES).map((x) => x.scope))) {
      const p = SCOPE_PRESENTATION[scope];
      assert.ok(p && p.data_class && TIERS.includes(p.retention_tier), `scope ${scope} missing consent presentation`);
    }
    checks++;
    // S1: roll-up-порядок tier'ов — PERSONAL сильнее CONTENT сильнее AGGREGATE (критика:
    // бинарный roll-up занижал бы карту при PERSONAL-scope).
    assert.deepStrictEqual([...TIERS], ["AGGREGATE", "CONTENT", "PERSONAL"], "tier order must be A<C<P");
    checks++;

    // Role assertion with teeth (R17): the expected role is DERIVED per
    // capability from the write-tool set — a loose 2-role allowlist would let
    // any future scenario pick either role freely. Reader scenarios may only
    // hold *_read capabilities; proposer scenarios only the known write repos.
    const WRITE_TOOLS = mcpSchemas.WRITE_TOOLS;
    assert.deepStrictEqual([...WRITE_TOOLS].sort(), ["create_reading_handoff", "create_review_handoff", "propose_action", "propose_goal", "propose_import_text", "propose_track_word"]);
    // Mint tools must NOT advertise idempotency — a retrying client would mint
    // live tokens against the cap + rate limit (adversarial critique 4b-final).
    for (const def of mcpSchemas.toolDefinitions()) {
      const expectIdem = !["create_reading_handoff", "create_review_handoff"].includes(def.name);
      assert.strictEqual(def.annotations.idempotentHint, expectIdem, `${def.name} idempotentHint`);
      assert.strictEqual(def.annotations.readOnlyHint, !WRITE_TOOLS.has(def.name), `${def.name} readOnlyHint`);
    }
    const PROPOSER_CAPS = new Set(["repo:reading_handoff_mint", "repo:proposal_create"]);
    const capScenarioIds = Object.values(capabilities.CAPABILITIES).map((x) => x.scenario_id).sort();
    assert.strictEqual(new Set(capScenarioIds).size, capabilities.capabilityNames().length);
    for (const [toolName, cap] of Object.entries(capabilities.CAPABILITIES)) {
      const scenario = scenarios.get(cap.scenario_id);
      assert.ok(scenario, `missing CP0 scenario ${cap.scenario_id}`);
      assert.deepStrictEqual(scenario.surfaces, ["external_agent"]);
      const expectedRole = WRITE_TOOLS.has(toolName) ? "agent_access.proposer" : "agent_access.reader";
      assert.strictEqual(scenario.role, expectedRole, `${toolName} scenario role`);
      if (expectedRole === "agent_access.reader") {
        assert.ok(scenario.capabilities.every((c) => /_read$/.test(c)), `reader scenario ${cap.scenario_id} holds a non-read capability`);
      } else {
        assert.ok(scenario.capabilities.every((c) => PROPOSER_CAPS.has(c)), `proposer scenario ${cap.scenario_id} holds an unknown capability`);
      }
    }
    checks++;

    // Registry key-parity (R14): a tool present in one registry but missing in
    // another is UNKNOWN_TOOL / AA_MCP_UNKNOWN_TOOL / schema-less at runtime.
    const toolNames = capabilities.capabilityNames().slice().sort();
    for (const [label, keys] of [
      ["TOOL_LIMITS", Object.keys(TOOL_LIMITS)],
      ["INPUT_SCHEMAS", Object.keys(mcpSchemas.INPUT_SCHEMAS)],
      ["OUTPUT_SCHEMAS", Object.keys(mcpSchemas.OUTPUT_SCHEMAS)],
      ["DESCRIPTIONS", Object.keys(mcpSchemas.DESCRIPTIONS)],
    ]) {
      assert.deepStrictEqual(keys.slice().sort(), toolNames, `${label} keys diverge from CAPABILITIES`);
    }
    for (const name of toolNames) {
      assert.strictEqual(typeof validArgs[name], "object", `smoke validArgs missing ${name}`);
      assert.strictEqual(typeof fixtures[name], "object", `smoke fixtures missing ${name}`);
    }
    checks++;

    // Deny-cooldown transparency shape: propose output may be DENIED, never CONFIRMED.
    const deniedOut = await service({ handlers: handlers({ propose_action: async () => ({ ...fixtures.propose_action, status: "DENIED" }) }) })
      .execute(principal, "propose_action", validArgs.propose_action);
    assert.strictEqual(deniedOut.ok, true); assert.strictEqual(deniedOut.result.status, "DENIED");
    await expectCode(service({ handlers: handlers({ propose_action: async () => ({ ...fixtures.propose_action, status: "CONFIRMED" }) }) })
      .execute(principal, "propose_action", validArgs.propose_action), "OUTPUT_SCHEMA_INVALID"); checks++;
    // Per-kind closedness (R14): cross-kind field bleed must be UNKNOWN_FIELD-rejected.
    await expectCode(service().execute(principal, "propose_action", { kind: "note", payload: { body: "x", work_id: "42" } }), "UNKNOWN_FIELD");
    await expectCode(service().execute(principal, "propose_action", { kind: "open_reading", payload: { work_id: "42", body: "smuggled" } }), "UNKNOWN_FIELD");
    await expectCode(service().execute(principal, "propose_action", { kind: "suggestion", payload: { body: "x", title: "t" } }), "UNKNOWN_FIELD");
    await expectCode(service().execute(principal, "propose_action", { kind: "note", payload: { body: "x", dedupe_key: "attacker" } }), "UNKNOWN_FIELD");
    checks++;

    const root = path.resolve(__dirname, "../..");
    const files = ["agent/access/contracts.js", "agent/access/capabilities.js", "agent/access/service.js"];
    const forbidden = /(server\.js|llmGate|agentRepo|review_log|fsrs|mastery|word_status|consentRepo|identityRepo|sqlite|https?\.request|fetch\s*\()/i;
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      assert.ok(!forbidden.test(source), `forbidden dependency or network call in ${file}`);
    }
    checks++;

    // W0 static oracle over the file that actually holds live repos (R17): the
    // handlers must never touch learning truth, raw SQL, or the network, and the
    // ONLY write-repo methods reachable from agent/access are the two known ones.
    const handlersRaw = fs.readFileSync(path.join(root, "agent/access/productionHandlers.js"), "utf8");
    // Scan CODE only (comments legitimately document what is excluded, e.g. «raw FSRS floats»).
    const handlersSource = handlersRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
    const w0Forbidden = /(review_log|word_status|\bmastery\b|\bfsrs\b|updateSrs|recordReview|appendReview|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|require\(["'][^"']*sqlite|https?\.request|fetch\s*\()/i;
    assert.ok(!w0Forbidden.test(handlersSource), "W0/SQL/network pattern in productionHandlers.js");
    const writeCalls = handlersSource.match(/\b(?:handoffRepo|proposalsRepo)\.(\w+)\s*\(/g) || [];
    const allowedWrites = new Set(["handoffRepo.mint(", "handoffRepo.countActive(", "proposalsRepo.create("]);
    for (const call of writeCalls) assert.ok(allowedWrites.has(call.replace(/\s+/g, "")), `unexpected write-repo call ${call}`);
    // Read-back fence: proposals are terminal artifacts — no agent-access read
    // tool may serve them back (anti-circularity, R17).
    assert.ok(!/proposalsRepo\.(listPending|getPending|decide|deleteProposal)/.test(handlersSource), "agent_proposals read-back in handlers");
    checks++;

    // Panel rendering discipline (R14): the enforced-CSP agent-access shell must
    // paint agent-authored strings inertly — no HTML-injection sinks at all.
    const panelSource = fs.readFileSync(path.join(root, "public/js/agent-access.js"), "utf8");
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(panelSource), "HTML-injection sink in agent-access.js");
    assert.ok(/propProvenance/.test(panelSource), "proposal provenance label missing from panel");
    checks++;

    // Existing connection schema is intentionally frozen. H2+ scopes are
    // additive tools and OAuth metadata, never a mutation of this old enum.
    assert.strictEqual(mcpSchemas.OUTPUT_SCHEMAS.get_agent_connection.properties.granted_scopes.maxItems, 16);
    assert.strictEqual(mcpSchemas.OUTPUT_SCHEMAS.get_agent_connection.properties.granted_scopes.items.enum.length, 16);
    checks++;

    // Consent convenience remains explicit and auditable: the bulk action only
    // checks the visible requested scopes; it never checks the retention ack.
    const panelHtml = fs.readFileSync(path.join(root, "public/agent-access.html"), "utf8");
    const deployVersion = require(path.join(root, "package.json")).version.replace(/\./g, "\\.");
    assert.ok(/id="selectAllScopes"[^>]+type="button"/.test(panelHtml), "select-all scope control missing");
    assert.ok(new RegExp(`agent-access\\.js\\?v=${deployVersion}`).test(panelHtml)
      && new RegExp(`agent-access\\.css\\?v=${deployVersion}`).test(panelHtml), "consent assets must be deploy-versioned");
    assert.ok(/selectedScopes/.test(panelSource) && /function selectAllScopes\(\)/.test(panelSource), "select-all state/count logic missing");
    assert.ok(!/selectAllScopes[^}]+retentionAck[^}]+checked=true/.test(panelSource), "select-all must not accept retention on the owner's behalf");
    for (const locale of ["ru", "en", "he"]) assert.ok(new RegExp(`Object\\.assign\\(TEXT\\.${locale},\\{selectAll:`).test(panelSource), `select-all ${locale} locale missing`);
    checks++;

    const swSource = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
    for (const authAsset of ["/agent-access.html", "/js/agent-access.js", "/css/agent-access.css"]) {
      assert.ok(swSource.includes(`url.pathname === "${authAsset}"`), `${authAsset} must bypass SW caches`);
    }
    checks++;

    console.log(JSON.stringify({ ok: true, checks, capabilities: capabilities.capabilityNames().length, network_calls: 0, provider_calls: 0, live_data_reads: 0 }));
  } finally {
    global.fetch = previousFetch;
  }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
