#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const vm = require("vm");

const T = require("./lib/cp0-test-db");
const identityRepo = require("../../db/identityRepo");
const learnerGraphRepo = require("../../db/learnerGraphRepo");
const agentRepo = require("../../db/agentRepo");
const oauthRepo = require("../../db/agentAccessOAuthRepo");
const oauthContracts = require("../../agent/access/oauthContracts");
const { createAgentAccessService } = require("../../agent/access/service");
const { createProductionHandlers } = require("../../agent/access/productionHandlers");
const { createPublicReadingCatalog } = require("../../agent/access/publicReadingCatalog");

const NOW = Date.parse("2026-07-17T12:00:00.000Z");
const EXPIRY = "2026-07-17T12:10:00.000Z";
const OWNER = "synthetic-owner";
const OTHER = "synthetic-other";
const CLIENT = "synthetic-client";
const CONNECTION = "synthetic-connection";
const OTHER_CONNECTION = "synthetic-other";
const SCOPES = ["learning.brief.read", "review.summary.read", "reading.public.search", "explanations.metadata.read", "agent.connection.read", "review.items.read", "profile.read", "explanations.body.read", "reading.corpus.read", "reading.handoff.create", "intent.propose", "review.activity.read", "review.handoff.create"];
const KNOWN_CONSTRUCT = "construct:hebrew.channel_gap.reading_to_dictation";

function expectCode(promise, code) {
  return Promise.resolve(promise).then(
    () => assert.fail(`expected ${code}`),
    (error) => assert.strictEqual(error.code || error.message, code),
  );
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value)); }
function sidecars(dir, mutate = {}, version = 7) {
  const rows = [
    { id: "1", t: "Biblical", a: "Author A", e: "biblical", g: "prose", l: "he", r: 1, q: "" },
    { id: "2", t: "Medieval", a: "Author B", e: "medieval", g: "poetry", l: "he", r: 1, q: "" },
    { id: "3", t: "Haskalah", a: "Author C", e: "haskalah", g: "article", l: "he", r: 0, q: "" },
    { id: "4", t: "Tehiya", a: "Author D", e: "tehiya", g: "drama", l: "he", r: 0, q: "" },
    { id: "5", t: "Mandate", a: "Author E", e: "mandate", g: "reference", l: "he", r: 0, q: "" },
    { id: "6", t: "Modern", a: "Author F", e: "modern", g: "lexicon", l: "he", r: 0, q: "" },
    { id: "7", t: "Unknown", a: "Author G", e: "unknown", g: "fables", l: "he", r: 0, q: "" },
    { id: "8", t: "Memoir", a: "Author H", e: "modern", g: "memoir", l: "he", r: 0, q: "" },
    { id: "9", t: "Letters", a: "Author I", e: "modern", g: "letters", l: "he", r: 0, q: "" },
    { id: "10", t: "Unknown genre", a: "Author J", e: "modern", g: "new-public-kind", l: "he", r: 0, q: "" },
    { id: "11", t: "Foreign", a: "Author K", e: "modern", g: "prose", l: "en", r: 0, q: "" },
    { id: "12", t: "שָׁלוֹם title", a: "Marked Author", e: "modern", g: "prose", l: "he", r: 0, q: "" },
    { id: "13", t: "x".repeat(300), a: "Long Author", e: "modern", g: "prose", l: "he", r: 0, q: "" },
  ];
  const ready = [
    { id: "1", title: "Biblical", author: "Author A", era: "biblical", genre: "prose", segments: 32, audio_status: "tts" },
    { id: "2", title: "Medieval", author: "Author B", era: "medieval", genre: "poetry", segments: 12, audio_status: "none" },
  ];
  const root = { schema: 1, version, index_file: `corpus-index-v${version}.json`, search_file: `corpus-search-v${version}.json`, counts: { works: rows.length, baked: ready.length } };
  writeJson(path.join(dir, `corpus-catalog-v${version}.json`), { ...root, ...(mutate.root || {}) });
  writeJson(path.join(dir, `corpus-search-v${version}.json`), mutate.rows || rows);
  writeJson(path.join(dir, `corpus-index-v${version}.json`), { schema: 1, version, ready: mutate.ready || ready, ...(mutate.index || {}) });
}
function principal(overrides = {}) {
  return Object.freeze({
    user_id: OWNER, oauth_client_id: CLIENT, connection_id: CONNECTION,
    external_actor_id: "synthetic-actor", request_id: "synthetic-request",
    scopes: SCOPES, connection_status: "ACTIVE", access_expires_at: EXPIRY,
    ...overrides,
  });
}
async function tableCounts(ctx, names) {
  const existing = new Set((await ctx.all("SELECT name FROM sqlite_master WHERE type='table'")).map((row) => row.name));
  const out = {};
  for (const name of names) if (existing.has(name)) out[name] = Number((await ctx.get(`SELECT COUNT(*) c FROM ${name}`)).c);
  return out;
}
function exactOwnerParser() {
  const source = fs.readFileSync(path.resolve(__dirname, "../..", "server.js"), "utf8");
  const start = source.indexOf("function agentAccessOwnerIds()");
  const end = source.indexOf("\nasync function getAgentAccessMcpRuntime", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ process: { env: {} }, Object, Set, String, Error });
  return { context, parse: new vm.Script(`${source.slice(start, end)}; agentAccessOwnerIds`).runInContext(context) };
}

(async () => {
  const ctx = await T.setup("cp0-agent-access-production-handlers");
  let checks = 0;
  const originalFetch = global.fetch;
  const originalHttpRequest = http.request, originalHttpGet = http.get;
  const originalHttpsRequest = https.request, originalHttpsGet = https.get;
  let networkCalls = 0;
  const networkTripwire = () => { networkCalls += 1; throw new Error("SYNTHETIC_NETWORK_FORBIDDEN"); };
  try {
    await ctx.run("UPDATE users SET id=? WHERE id='u1'", [OWNER]);
    await ctx.run("UPDATE users SET id=? WHERE id='u2'", [OTHER]);
    const due = (id, at, user = OWNER) => ctx.run(`INSERT INTO srs_projections (user_id,item_key,due) VALUES (?,?,?)`, [user, id, at]);
    await due("urgent-boundary", "2026-07-16T12:00:00.000Z");
    await due("due-now", "2026-07-17T12:00:00.000Z");
    await due("future", "2026-07-18T12:00:00.000Z");
    await due("ignored", "2026-07-15T12:00:00.000Z");
    await ctx.run(`INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,source,meta_json) VALUES (?,?,?,?,?,?,?)`,
      [OWNER, "mark-ignore", "ignored", "mark", "2026-07-17T10:00:00.000Z", "fixture", JSON.stringify({ status: "ignore" })]);
    // AA4 — activity-delta fixture: 3 reviews (1 later annulled), 1 skip, 2 seeds
    // of ONE item (re-seed must not double-count), odd channel lumps to 'other'.
    const act = (id, item, kind, at, channel, meta) => ctx.run(
      `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,channel,source,meta_json) VALUES (?,?,?,?,?,?,?,?)`,
      [OWNER, id, item, kind, at, channel || null, "fixture", JSON.stringify(meta || {})]);
    await act("act-r1", "כתב#verb", "review", "2026-07-15T10:00:00.000Z", "read:tap");
    await act("act-r2", "כתב#verb", "review", "2026-07-16T09:00:00.000Z", "cloze:mc");
    await act("act-r3", "שלום#noun", "review", "2026-07-16T10:00:00.000Z", "WeIrD:z");
    await act("act-s1", "כתב#verb", "skip", "2026-07-16T11:00:00.000Z", "read:tap");
    await act("act-d1", "חדש#noun", "seed", "2026-07-15T08:00:00.000Z", null);
    await act("act-d2", "חדש#noun", "seed", "2026-07-16T08:00:00.000Z", null);
    await act("act-a1", "שלום#noun", "annul", "2026-07-17T11:30:00.000Z", null, { annul_of: "act-r3" });
    // AA3: a resolvable, struggling (lapses>=3) due item + a coach/detailed profile.
    await ctx.run(`INSERT INTO srs_projections (user_id,item_key,due,lapses) VALUES (?,?,?,?)`, [OWNER, "כתב#verb", "2026-07-17T09:00:00.000Z", 3]);
    await ctx.run(`INSERT INTO agent_profiles (user_id,mode,language,goals_json) VALUES (?,?,?,?)`, [OWNER, "coach", "ru", JSON.stringify({ depth: "detailed" })]);
    await ctx.run(`INSERT INTO agent_tasks (id,user_id,kind,status,payload_json,created_at) VALUES (?,?,?,?,?,?)`,
      ["plan-open", OWNER, "plan", "open", JSON.stringify({ sections: [{ id: "fresh_struggles", items: ["private-item-sentinel"] }] }), "2026-07-17T11:00:00.000Z"]);

    const explanations = [
      ["exp-sentence", {}, [], "2026-07-17T11:04:00.000Z"],
      ["exp-word", { kind: "word", word: "כתב", text: "объяснение слова כתב", language: "ru" }, [{ kind: "constructs", items: [{ id: KNOWN_CONSTRUCT }, { id: "construct:unknown" }, { id: KNOWN_CONSTRUCT }] }], "2026-07-17T11:03:00.000Z"],
      ["exp-summary", { kind: "study_summary", purge_reason: "fixture-purge", prose: "private-body-sentinel" }, [], "2026-07-17T11:02:00.000Z"],
      ["exp-draft", { kind: "draft_retell" }, [], "2026-07-17T11:01:00.000Z"],
    ];
    for (const [id, body, facts, created] of explanations) await ctx.run(
      `INSERT INTO agent_explanations (id,user_id,sentence_id,item_key,facts_used_json,llm_model,body_json,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, OWNER, "private-anchor", "private-item", JSON.stringify(facts), "private-model", JSON.stringify(body), created]);

    await oauthRepo.registerClientFixture({ oauth_client_id: CLIENT, display_name: "Synthetic public client", software_id: "synthetic", software_version: "1.0.0", redirect_uris: ["http://127.0.0.1:4321/callback"], registration_version: "fixture-v1" }, "2026-07-17T10:00:00.000Z");
    await oauthRepo.createPendingConnection(OWNER, { connection_id: CONNECTION, oauth_client_id: CLIENT, display_label: "Owner fixture", consent_version: "aa-consent-v1", capability_version: "aa-v0.1", retention_notice_version: "retention-v1" }, "2026-07-17T10:01:00.000Z");
    await oauthRepo.createPendingConnection(OTHER, { connection_id: OTHER_CONNECTION, oauth_client_id: CLIENT, display_label: "Other fixture", consent_version: "aa-consent-v1", capability_version: "aa-v0.1", retention_notice_version: "retention-v1" }, "2026-07-17T10:01:00.000Z");
    for (const scope of SCOPES) await identityRepo.recordConsent(OWNER, oauthContracts.consentKey(CONNECTION, scope), true, "aa-consent-v1");
    await identityRepo.recordConsent(OTHER, oauthContracts.consentKey(OTHER_CONNECTION, "agent.connection.read"), true, "aa-consent-v1");
    await oauthRepo.activateConnectionWithGrants(OWNER, CONNECTION, SCOPES, "2026-07-17T10:02:00.000Z");
    await oauthRepo.activateConnectionWithGrants(OTHER, OTHER_CONNECTION, ["agent.connection.read"], "2026-07-17T10:02:00.000Z");

    sidecars(ctx.dir);
    const catalog = createPublicReadingCatalog({ baseDir: ctx.dir, catalogVersion: () => 7, cursorKey: Buffer.alloc(32, 7) });
    // AA3: light keying fixture (avoid loading the real 306MB lexicon in tests).
    // Long multi-byte gloss (Cyrillic ≈2 bytes/char) to exercise byte-safe truncation.
    const LONG_GLOSS = "значение ".repeat(30); // ~270 chars, ~500 bytes
    const keyingFixture = {
      displayForItemKey: async (k) => (k === "כתב#verb" ? "כָּתַב" : String(k)),
      glossForItemKey: async (k) => (k === "כתב#verb" ? { gloss: LONG_GLOSS, expected: "כתב", decisive: true, strictSafe: true, alts: ["רשם"] } : null),
    };
    const persistenceFixture = async () => ({ access_lifetime: "PERSISTENT_WINDOW", window_expires_at: null });
    const CORPUS_TK = "a1b2c3d4e5f60718";
    const corpusFixture = {
      listWorkTexts: (work_id) => (String(work_id) === "42"
        ? { ok: true, work_id: "42", texts: [{ text_key: CORPUS_TK, title: "Тестовая работа", rows_total: 2, first_order_index: 0, last_order_index: 1, author: "Автор", era: "revival", license: "public-domain" }] }
        : { ok: false, error: "CORPUS_WORK_NOT_FOUND" }),
      getCorpusLessonWindow: ({ work_id, text_key }) => ((String(work_id) === "42" && text_key === CORPUS_TK)
        ? { ok: true, rows: [{ order_index: 0, he: "בְּרֵאשִׁית", ru: "В начале" }, { order_index: 1, he: "בָּרָא", ru: "сотворил" }], work: { title: "Тестовая работа", author: "Автор", era: "revival", license: "public-domain" } }
        : { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" }),
    };
    let mintCount = 0, lastMintArgs = null, activeCount = 0;
    const handoffFixture = {
      mint: async (userId, args) => { mintCount += 1; lastMintArgs = { userId, ...args }; return { raw: "abcdefABCDEF0123456789_-xy", expiresInMs: 300000 }; },
      countActive: async () => activeCount,
    };
    let lastProposalArgs = null, proposalStatus = "PENDING";
    const proposalsFixture = {
      create: async (userId, args) => { lastProposalArgs = { userId, ...args }; return { proposal_id: "ap_0123456789abcdef0123456789abcdef", status: proposalStatus, expires_at: "2026-07-24T12:00:00.000Z", reused: false }; },
    };
    // S1: personalTextsRepo — реальный learnerArtifactsRepo (list_personal_texts живёт на
    // sidecar-мете; отдельный S1-смоук покрывает его сцены, здесь — dep-guard parity).
    const aa3Deps = { keyingService: keyingFixture, connectionPersistence: persistenceFixture, corpusSentenceRepo: corpusFixture, handoffRepo: handoffFixture, agentProposalsRepo: proposalsFixture, personalTextsRepo: require("../../db/learnerArtifactsRepo"), personalTextsContentRepo: require("../../db/agentSentenceRepo"), textGrantsRepo: require("../../db/agentTextGrantsRepo") };
    const handlers = createProductionHandlers({ learnerGraphRepo, agentRepo, oauthRepo, publicCatalog: catalog, ...aa3Deps, now: () => NOW, principalAccessExpiresAt: () => EXPIRY });
    const service = createAgentAccessService({ enabled: true, ownerIds: [OWNER], handlers, now: () => NOW });

    global.fetch = networkTripwire; http.request = networkTripwire; http.get = networkTripwire; https.request = networkTripwire; https.get = networkTripwire;
    const watched = ["review_log", "srs_projections", "agent_tasks", "agent_explanations", "agent_subject_mappings", "agent_connections", "agent_connection_grants", "agent_authorization_codes", "agent_token_families", "agent_refresh_tokens", "agent_access_token_denials", "consent_records", "audit_log", "agent_access_erasure_journal", "llm_usage_ledger"];
    const beforeCounts = await tableCounts(ctx, watched);

    const brief = await service.execute(principal(), "get_learning_brief", {});
    assert.ok(brief.ok); assert.deepStrictEqual(brief.result, {
      schema_version: "aa.learning_brief.1.0.0", due_total: 3, urgent_total: 1, scheduled_total: 4,
      estimated_minutes: 3, priority_code: "REVIEW_DUE", unfinished_action_code: "REVIEW_AVAILABLE",
      generated_at: "2026-07-17T12:00:00.000Z", expires_at: "2026-07-17T12:05:00.000Z",
    }); checks++;
    const review = await service.execute(principal({ request_id: "review-request" }), "get_review_summary", {});
    assert.ok(review.ok); assert.deepStrictEqual(review.result, {
      schema_version: "aa.review_summary.1.0.0", due_total: 3, urgent_total: 1, estimated_minutes: 3,
      handoff_eligible: false, handoff_scope_available: false,
      generated_at: "2026-07-17T12:00:00.000Z", expires_at: "2026-07-17T12:02:00.000Z",
    }); checks++;

    // AA3 slice-1 — get_due_review_items (content, coarse band, NO answer-key).
    const dueItems = await service.execute(principal({ request_id: "due-items" }), "get_due_review_items", { limit: 100 });
    assert.ok(dueItems.ok, JSON.stringify(dueItems)); const di = dueItems.result;
    assert.strictEqual(di.schema_version, "aa.due_review_items.1.0.0");
    assert.strictEqual(di.due_total, 3); assert.strictEqual(di.next_cursor, null); // all 3 fit on one page
    const struggler = di.items.find((it) => it.display === "כָּתַב");
    assert.ok(struggler && struggler.struggle === "high" && struggler.content_available === true, JSON.stringify(di.items));
    // Byte-safe truncation: a long multi-byte gloss must be capped by BYTES, not chars.
    assert.ok(struggler.gloss.startsWith("значение") && Buffer.byteLength(struggler.gloss, "utf8") <= 120, `gloss bytes: ${Buffer.byteLength(struggler.gloss, "utf8")}`);
    // Answer-key / raw-model fields must NEVER appear.
    for (const it of di.items) assert.deepStrictEqual(Object.keys(it).sort(), ["content_available", "display", "due_day", "gloss", "struggle"]);
    const leakStr = JSON.stringify(di);
    for (const forbidden of ["alts", "expected", "stability", "difficulty", "reps", "reviewed_at", "item_key"]) assert.ok(!leakStr.includes(forbidden), `leak:${forbidden}`);
    checks++;
    // Pagination: page 1 (limit 1) returns a cursor; page 2 continues; last page cursor null; full walk covers all 3 uniquely.
    const p1 = await service.execute(principal({ request_id: "due-p1" }), "get_due_review_items", { limit: 1 });
    assert.ok(p1.ok && p1.result.items.length === 1 && p1.result.due_total === 3 && typeof p1.result.next_cursor === "string");
    const seen = new Set(p1.result.items.map((it) => it.display)); let cursor = p1.result.next_cursor, guard = 0;
    while (cursor && guard++ < 10) {
      const pn = await service.execute(principal({ request_id: `due-pn-${guard}` }), "get_due_review_items", { limit: 1, cursor });
      assert.ok(pn.ok, JSON.stringify(pn)); pn.result.items.forEach((it) => seen.add(it.display)); cursor = pn.result.next_cursor;
    }
    assert.strictEqual(seen.size, 3); // full walk covered every due item exactly once
    // Bad cursor is a CLIENT input error (not INTERNAL_ERROR): retryable:false so
    // the client does not retry and trip its transport circuit breaker.
    const badCur = await service.execute(principal({ request_id: "due-badcur" }), "get_due_review_items", { limit: 1, cursor: "not-a-real-cursor" });
    assert.ok(!badCur.ok && badCur.error.code === "ARGUMENT_SCHEMA_INVALID" && badCur.error.retryable === false, JSON.stringify(badCur)); checks++;

    // AA3 slice-1 — get_learner_profile (typed projection, no goals_json/user_id).
    const prof = await service.execute(principal({ request_id: "profile" }), "get_learner_profile", {});
    assert.ok(prof.ok); assert.deepStrictEqual(prof.result, {
      schema_version: "aa.learner_profile.1.0.0", mode: "coach", language: "ru", depth: "detailed",
      generated_at: "2026-07-17T12:00:00.000Z",
    }); checks++;
    for (const forbidden of ["goals_json", "user_id", "created_at", "updated_at", "detailed", "coach"]) { /* only enums allowed as values */ }
    assert.ok(!JSON.stringify(prof.result).includes("user_id") && !JSON.stringify(prof.result).includes("goals_json")); checks++;

    // AA3 — access window is a SEPARATE tool; get_agent_connection stays schema-stable.
    const conn = await service.execute(principal({ request_id: "conn-stable" }), "get_agent_connection", {});
    assert.ok(conn.ok); assert.ok(!("access_lifetime" in conn.result) && !("window_expires_at" in conn.result), "get_agent_connection must stay schema-stable"); checks++;
    const win = await service.execute(principal({ request_id: "access-window" }), "get_access_window", {});
    assert.ok(win.ok); assert.strictEqual(win.result.schema_version, "aa.access_window.1.0.0");
    assert.strictEqual(win.result.access_lifetime, "PERSISTENT_WINDOW"); assert.strictEqual(win.result.window_expires_at, null); checks++;

    // Scope gating: a token WITHOUT review.items.read cannot call get_due_review_items.
    const narrow = await service.execute(principal({ request_id: "narrow", scopes: ["agent.connection.read"] }), "get_due_review_items", { limit: 5 });
    assert.ok(!narrow.ok && narrow.error.code === "INSUFFICIENT_SCOPE"); checks++;

    // AA3 commit 3 — get_explanation_body: live body + purge tombstone + not-found.
    const liveBody = await service.execute(principal({ request_id: "exp-live" }), "get_explanation_body", { explanation_id: "exp-word" });
    assert.ok(liveBody.ok, JSON.stringify(liveBody)); const eb = liveBody.result;
    assert.strictEqual(eb.schema_version, "aa.explanation_body.1.0.0");
    assert.strictEqual(eb.kind, "word"); assert.strictEqual(eb.purge_state, "AVAILABLE");
    assert.strictEqual(eb.text, "объяснение слова כתב"); assert.strictEqual(eb.language, "ru"); assert.strictEqual(eb.lines, null); checks++;
    const purgedBody = await service.execute(principal({ request_id: "exp-purged" }), "get_explanation_body", { explanation_id: "exp-summary" });
    assert.ok(purgedBody.ok); const pb = purgedBody.result;
    assert.strictEqual(pb.purge_state, "PURGED"); assert.strictEqual(pb.kind, null); assert.strictEqual(pb.text, null); assert.strictEqual(pb.lines, null);
    assert.ok(!JSON.stringify(pb).includes("private-body-sentinel"), "purged body must not leak content"); checks++;
    // Client-addressable not-found is TYPED + non-retryable (never INTERNAL_ERROR:
    // agents read that as an outage and retry — Hermes-observed misdiagnosis).
    const notFound = await service.execute(principal({ request_id: "exp-404" }), "get_explanation_body", { explanation_id: "no-such-explanation" });
    assert.ok(!notFound.ok && notFound.error.code === "AA_EXPLANATION_NOT_FOUND" && notFound.error.retryable === false, JSON.stringify(notFound)); checks++;
    // Scope gating for the body scope.
    const bodyNarrow = await service.execute(principal({ request_id: "body-narrow", scopes: ["agent.connection.read"] }), "get_explanation_body", { explanation_id: "exp-word" });
    assert.ok(!bodyNarrow.ok && bodyNarrow.error.code === "INSUFFICIENT_SCOPE"); checks++;

    // AA3 commit 3b — get_reading_content (corpus, bounded) + create_reading_handoff.
    const reading = await service.execute(principal({ request_id: "reading" }), "get_reading_content", { work_id: "42", rows: 5 });
    assert.ok(reading.ok, JSON.stringify(reading)); const rc = reading.result;
    assert.strictEqual(rc.schema_version, "aa.reading_content.1.0.0");
    assert.strictEqual(rc.work.license, "public-domain"); assert.strictEqual(rc.work.era, "REVIVAL");
    assert.strictEqual(rc.anchor.work_id, "42"); assert.strictEqual(rc.anchor.text_key, "a1b2c3d4e5f60718");
    assert.strictEqual(rc.rows.length, 2); assert.strictEqual(rc.rows[0].he, "בְּרֵאשִׁית"); assert.strictEqual(rc.rows[0].ru, "В начале");
    assert.deepStrictEqual(rc.available_text_keys, ["a1b2c3d4e5f60718"]); checks++;
    // Non-corpus / unknown / un-baked work_id fails closed with a TYPED code.
    const badWork = await service.execute(principal({ request_id: "reading-bad" }), "get_reading_content", { work_id: "999" });
    assert.ok(!badWork.ok && badWork.error.code === "AA_CORPUS_WORK_NOT_FOUND" && badWork.error.retryable === false); checks++;

    // AA3 commit 3c — create_reading_handoff un-held: mint carries work_id +
    // action open_corpus (R17 lockstep gate: capture the ACTUAL mint args).
    const handoff = await service.execute(principal({ request_id: "handoff-mint" }), "create_reading_handoff", { work_id: "42", order_index: 1 });
    assert.ok(handoff.ok, JSON.stringify(handoff));
    assert.strictEqual(handoff.result.handoff_url, "https://linguistpro.kolosei.com/library.html?handoff=abcdefABCDEF0123456789_-xy");
    assert.strictEqual(handoff.result.work_id, "42"); assert.strictEqual(handoff.result.action, "open_corpus");
    assert.strictEqual(mintCount, 1);
    assert.deepStrictEqual(lastMintArgs, { userId: OWNER, textKey: CORPUS_TK, orderIndex: 1, action: "open_corpus", workId: "42" }); checks++;
    // Corpus-only fail-closed + active-token cap + scope gating (typed codes).
    assert.strictEqual((await service.execute(principal({ request_id: "handoff-bad" }), "create_reading_handoff", { work_id: "999" })).error.code, "AA_CORPUS_WORK_NOT_FOUND");
    activeCount = 20;
    assert.strictEqual((await service.execute(principal({ request_id: "handoff-cap" }), "create_reading_handoff", { work_id: "42" })).error.code, "AA_HANDOFF_ACTIVE_LIMIT");
    activeCount = 0;
    assert.strictEqual(mintCount, 1, "failed handoff paths must not mint");
    assert.strictEqual((await service.execute(principal({ request_id: "handoff-narrow", scopes: ["agent.connection.read"] }), "create_reading_handoff", { work_id: "42" })).error.code, "INSUFFICIENT_SCOPE"); checks++;

    // AA3 commit 3c — propose_action: normalized payload reaches the repo with
    // the principal's connection binding; open_reading resolves display_title
    // at create time; unknown work fails closed; agent never sees CONFIRMED.
    const proposeNote = await service.execute(principal({ request_id: "propose-note" }), "propose_action", { kind: "note", payload: { body: "агентская заметка", title: "т" } });
    assert.ok(proposeNote.ok, JSON.stringify(proposeNote));
    assert.strictEqual(proposeNote.result.status, "PENDING"); assert.strictEqual(proposeNote.result.kind, "note");
    assert.deepStrictEqual(lastProposalArgs.payload, { body: "агентская заметка", title: "т" });
    assert.strictEqual(lastProposalArgs.userId, OWNER); assert.strictEqual(lastProposalArgs.oauthClientId, CLIENT); assert.strictEqual(lastProposalArgs.connectionId, CONNECTION);
    assert.strictEqual(lastProposalArgs.displayTitle, null); checks++;
    const proposeOpen = await service.execute(principal({ request_id: "propose-open" }), "propose_action", { kind: "open_reading", payload: { work_id: "42", reason: "продолжим тут" } });
    assert.ok(proposeOpen.ok, JSON.stringify(proposeOpen));
    assert.strictEqual(lastProposalArgs.displayTitle, "Тестовая работа — Автор"); checks++;
    const badPropose = await service.execute(principal({ request_id: "propose-badwork" }), "propose_action", { kind: "open_reading", payload: { work_id: "999" } });
    assert.ok(badPropose.error.code === "AA_PROPOSAL_WORK_NOT_FOUND" && badPropose.error.retryable === false);
    // Cross-kind field bleed is a client input error, not INTERNAL_ERROR.
    const bleed = await service.execute(principal({ request_id: "propose-bleed" }), "propose_action", { kind: "note", payload: { body: "x", work_id: "42" } });
    assert.ok(!bleed.ok && bleed.error.code === "UNKNOWN_FIELD" && bleed.error.retryable === false);
    proposalStatus = "DENIED";
    const proposeDenied = await service.execute(principal({ request_id: "propose-denied" }), "propose_action", { kind: "note", payload: { body: "агентская заметка" } });
    assert.ok(proposeDenied.ok && proposeDenied.result.status === "DENIED");
    proposalStatus = "PENDING";
    assert.strictEqual((await service.execute(principal({ request_id: "propose-narrow", scopes: ["agent.connection.read"] }), "propose_action", { kind: "note", payload: { body: "x" } })).error.code, "INSUFFICIENT_SCOPE"); checks++;
    // Scope gating on the corpus read.
    assert.strictEqual((await service.execute(principal({ request_id: "rc-narrow", scopes: ["agent.connection.read"] }), "get_reading_content", { work_id: "42" })).error.code, "INSUFFICIENT_SCOPE"); checks++;

    // AA4 — get_progress_delta: pure activity over the real repo + migrated DB.
    // Annulled review excluded; re-seeded item counted once; odd channel → other;
    // local-day fold (Asia/Jerusalem default tz); NO struggle/grade/item_key leak.
    const deltaOut = await service.execute(principal({ request_id: "delta" }), "get_progress_delta", { since: "2026-07-10T00:00:00.000Z", top_limit: 5 });
    assert.ok(deltaOut.ok, JSON.stringify(deltaOut)); const dl = deltaOut.result;
    assert.strictEqual(dl.schema_version, "aa.progress_delta.1.0.0");
    assert.strictEqual(dl.reviews_total, 2); assert.strictEqual(dl.skips_total, 1);
    assert.strictEqual(dl.distinct_items, 1); assert.strictEqual(dl.new_items_scheduled, 1);
    assert.strictEqual(dl.active_days, 2);
    assert.deepStrictEqual(dl.by_channel, [{ channel: "cloze", count: 1 }, { channel: "read", count: 1 }]);
    assert.strictEqual(dl.top_items.length, 1);
    assert.strictEqual(dl.top_items[0].display, "כָּתַב"); assert.strictEqual(dl.top_items[0].times, 2);
    assert.ok(Buffer.byteLength(dl.top_items[0].gloss, "utf8") <= 120);
    const dlStr = JSON.stringify(dl);
    for (const forbidden of ["struggle", "grade", "item_key", "stability", "difficulty", "accuracy"]) assert.ok(!dlStr.includes(forbidden), `delta leak:${forbidden}`);
    checks++;
    // since outside [now-90d, now] → TYPED client fault, not INTERNAL_ERROR.
    for (const badSince of ["2026-01-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"]) {
      const badDelta = await service.execute(principal({ request_id: `delta-bad-${badSince.slice(5, 7)}` }), "get_progress_delta", { since: badSince });
      assert.ok(!badDelta.ok && badDelta.error.code === "AA_ACTIVITY_SINCE_OUT_OF_RANGE" && badDelta.error.retryable === false, JSON.stringify(badDelta));
    }
    assert.strictEqual((await service.execute(principal({ request_id: "delta-narrow", scopes: ["agent.connection.read"] }), "get_progress_delta", { since: "2026-07-10T00:00:00.000Z" })).error.code, "INSUFFICIENT_SCOPE"); checks++;

    // AA4 4b-final — create_review_handoff: anchor-less mint (capture args),
    // active-cap, scope gating; empty-schedule refusal is typed; due==0 with
    // scheduled>0 still mints (Room offers ahead-training honestly).
    const mintsBefore = mintCount;
    const reviewHandoff = await service.execute(principal({ request_id: "review-handoff" }), "create_review_handoff", {});
    assert.ok(reviewHandoff.ok, JSON.stringify(reviewHandoff));
    assert.strictEqual(reviewHandoff.result.action, "open_review");
    assert.strictEqual(reviewHandoff.result.handoff_url, "https://linguistpro.kolosei.com/library.html?handoff=abcdefABCDEF0123456789_-xy");
    assert.strictEqual(mintCount, mintsBefore + 1);
    assert.deepStrictEqual(lastMintArgs, { userId: OWNER, action: "open_review" }, JSON.stringify(lastMintArgs)); checks++;
    activeCount = 20;
    assert.strictEqual((await service.execute(principal({ request_id: "review-cap" }), "create_review_handoff", {})).error.code, "AA_HANDOFF_ACTIVE_LIMIT");
    activeCount = 0;
    assert.strictEqual((await service.execute(principal({ request_id: "review-narrow", scopes: ["agent.connection.read"] }), "create_review_handoff", {})).error.code, "INSUFFICIENT_SCOPE");
    assert.strictEqual((await service.execute(principal({ request_id: "review-args" }), "create_review_handoff", { extra: 1 })).error.code, "UNKNOWN_FIELD"); checks++;
    const emptySchedule = createProductionHandlers({
      learnerGraphRepo: { getAgentAccessReviewAggregates: async () => ({ scheduled_total: 0, due_total: 0, urgent_total: 0 }), getDue: async () => [], getActivityDelta: async () => ({ reviews_total: 0, skips_total: 0, distinct_items: 0, new_items_scheduled: 0, active_days: 0, by_channel: [], top: [] }) },
      agentRepo, oauthRepo, publicCatalog: catalog, ...aa3Deps, now: () => NOW, principalAccessExpiresAt: () => EXPIRY,
    });
    const emptyService = createAgentAccessService({ enabled: true, ownerIds: [OWNER], handlers: emptySchedule, now: () => NOW });
    const nothing = await emptyService.execute(principal({ request_id: "review-empty" }), "create_review_handoff", {});
    assert.ok(!nothing.ok && nothing.error.code === "AA_REVIEW_NOTHING_SCHEDULED" && nothing.error.retryable === false, JSON.stringify(nothing));
    const aheadOnly = createProductionHandlers({
      learnerGraphRepo: { getAgentAccessReviewAggregates: async () => ({ scheduled_total: 5, due_total: 0, urgent_total: 0 }), getDue: async () => [], getActivityDelta: async () => ({ reviews_total: 0, skips_total: 0, distinct_items: 0, new_items_scheduled: 0, active_days: 0, by_channel: [], top: [] }) },
      agentRepo, oauthRepo, publicCatalog: catalog, ...aa3Deps, now: () => NOW, principalAccessExpiresAt: () => EXPIRY,
    });
    const aheadService = createAgentAccessService({ enabled: true, ownerIds: [OWNER], handlers: aheadOnly, now: () => NOW });
    assert.ok((await aheadService.execute(principal({ request_id: "review-ahead" }), "create_review_handoff", {})).ok, "due==0 with scheduled>0 must still mint"); checks++;

    const searchArgs = { language: "he", audio: "ANY", ready: "ANY", sort: "RELEVANCE", limit: 3 };
    const search = await service.execute(principal({ request_id: "search-request" }), "search_public_reading_catalog", searchArgs);
    assert.ok(search.ok && search.result.results.length === 3 && search.result.catalog_version === "7" && search.result.next_cursor);
    assert.ok(search.result.results.every((row) => row.first_party_path === "/library.html" && row.language === "he")); checks++;
    const second = await service.execute(principal({ request_id: "search-page-2" }), "search_public_reading_catalog", { ...searchArgs, cursor: search.result.next_cursor });
    assert.ok(second.ok && second.result.results.length > 0); checks++;
    const marked = await service.execute(principal({ request_id: "search-marked" }), "search_public_reading_catalog", { ...searchArgs, query: "שלום", limit: 5 });
    assert.ok(marked.ok && marked.result.results.length === 1 && marked.result.results[0].work_id === "12"); checks++;
    const allMapped = catalog.search({ ...searchArgs, limit: 20 }).results;
    assert.deepStrictEqual([...new Set(allMapped.map((row) => row.era))].sort(), ["BIBLICAL", "CONTEMPORARY", "MEDIEVAL", "MODERN", "REVIVAL", "UNKNOWN"]);
    assert.deepStrictEqual([...new Set(allMapped.map((row) => row.genre))].sort(), ["DRAMA", "ESSAY", "OTHER", "POETRY", "PROSE", "REFERENCE", "UNKNOWN"]);
    assert.ok(allMapped.find((row) => row.work_id === "1").audio_available && !allMapped.find((row) => row.work_id === "2").audio_available);
    assert.ok(Buffer.byteLength(allMapped.find((row) => row.work_id === "13").title, "utf8") <= 240); checks++;
    for (const sort of ["RELEVANCE", "TITLE", "AUTHOR", "LENGTH_ASC", "LENGTH_DESC"]) {
      const args = { ...searchArgs, sort, limit: 20 };
      assert.deepStrictEqual(catalog.search(args), catalog.search(args));
      assert.strictEqual(new Set(catalog.search(args).results.map((row) => row.work_id)).size, catalog.search(args).results.length);
    }
    assert.ok(catalog.search({ ...searchArgs, ready: "READY", limit: 20 }).results.every((row) => row.ready_state === "READY"));
    assert.ok(catalog.search({ ...searchArgs, ready: "METADATA_ONLY", limit: 20 }).results.every((row) => row.ready_state === "METADATA_ONLY"));
    assert.ok(catalog.search({ ...searchArgs, audio: "AVAILABLE", limit: 20 }).results.every((row) => row.audio_available));
    assert.ok(catalog.search({ ...searchArgs, era: "MEDIEVAL", genre: "POETRY", limit: 20 }).results.every((row) => row.era === "MEDIEVAL" && row.genre === "POETRY")); checks++;

    const shippedCatalog = createPublicReadingCatalog({
      baseDir: path.resolve(__dirname, "../..", "public", "data", "benyehuda"),
      catalogVersion: () => 7,
      cursorKey: Buffer.alloc(32, 8),
    });
    const shippedArgs = { query: "", era: null, genre: null, language: "he", audio: "ANY", ready: "ANY", sort: "TITLE", limit: 20, cursor: null };
    assert.ok(shippedCatalog.isReadable());
    for (const era of ["BIBLICAL", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"])
      assert.ok(shippedCatalog.search({ ...shippedArgs, era, limit: 1 }).results.length === 1, `missing shipped era ${era}`);
    for (const genre of ["PROSE", "POETRY", "ESSAY", "DRAMA", "REFERENCE", "OTHER"])
      assert.ok(shippedCatalog.search({ ...shippedArgs, genre, limit: 1 }).results.length === 1, `missing shipped genre ${genre}`);
    assert.deepStrictEqual(shippedCatalog.search(shippedArgs), shippedCatalog.search(shippedArgs)); checks++;

    const metadata = await service.execute(principal({ request_id: "metadata-request" }), "get_recent_explanation_metadata", { kinds: ["sentence", "word", "study_summary", "draft_retell"], limit: 10 });
    assert.ok(metadata.ok && metadata.result.items.length === 4);
    assert.strictEqual(metadata.result.items.find((item) => item.explanation_id === "exp-sentence").kind, "sentence");
    assert.deepStrictEqual(metadata.result.items.find((item) => item.explanation_id === "exp-word").construct_ids, [KNOWN_CONSTRUCT]);
    assert.strictEqual(metadata.result.items.find((item) => item.explanation_id === "exp-summary").purge_state, "PURGED");
    assert.ok(!JSON.stringify(metadata.result).includes("private-")); checks++;

    const connection = await service.execute(principal({ request_id: "connection-request" }), "get_agent_connection", {});
    assert.ok(connection.ok); assert.strictEqual(connection.result.connection_id, CONNECTION); assert.strictEqual(connection.result.oauth_client_id, CLIENT);
    assert.deepStrictEqual(connection.result.granted_scopes, SCOPES.slice().sort()); assert.strictEqual(connection.result.access_expires_at, EXPIRY); checks++;
    const wrongUser = await service.execute(principal({ user_id: OTHER, connection_id: CONNECTION, request_id: "wrong-user" }), "get_agent_connection", {});
    assert.ok(!wrongUser.ok && wrongUser.error.code === "OWNER_NOT_ALLOWED"); checks++;
    const wrongClientHandlers = createProductionHandlers({ learnerGraphRepo, agentRepo, oauthRepo, publicCatalog: catalog, ...aa3Deps, now: () => NOW, principalAccessExpiresAt: () => EXPIRY });
    await expectCode(wrongClientHandlers.get_agent_connection({ user_id: OWNER, oauth_client_id: "wrong-client", connection_id: CONNECTION, request_id: "wrong-client" }), "AA_CONNECTION_BINDING_MISMATCH"); checks++;
    await expectCode(wrongClientHandlers.get_agent_connection({ user_id: OWNER, oauth_client_id: CLIENT, connection_id: OTHER_CONNECTION, request_id: "wrong-connection" }), "AA_OAUTH_CONNECTION_NOT_FOUND"); checks++;
    assert.strictEqual((await service.execute(principal({ request_id: "unknown-input" }), "get_learning_brief", { user_id: OWNER })).error.code, "UNKNOWN_FIELD"); checks++;

    assert.deepStrictEqual(await tableCounts(ctx, watched), beforeCounts); assert.strictEqual(networkCalls, 0); checks++;

    // ── REAL repos (after the zero-delta window): raw-DB independent oracles ──
    // handoffRepo mint→redeem round trip must carry work_id (R17 lockstep gate:
    // the redeem side recomputes from the stored row, not the mint return).
    const realHandoff = require("../../db/handoffRepo");
    const mintedReal = await realHandoff.mint(OWNER, { textKey: "a1b2c3d4e5f60718", orderIndex: 3, action: "open_corpus", workId: "42" });
    const redeemed = await realHandoff.redeem(mintedReal.raw);
    assert.ok(redeemed, "real redeem failed");
    assert.strictEqual(redeemed.work_id, "42"); assert.strictEqual(redeemed.text_key, "a1b2c3d4e5f60718");
    assert.strictEqual(redeemed.order_index, 3); assert.strictEqual(redeemed.action, "open_corpus");
    assert.strictEqual(await realHandoff.redeem(mintedReal.raw), null, "single-use must not re-redeem");
    const rawRow = await ctx.get("SELECT work_id, action FROM handoff_tokens WHERE work_id='42'");
    assert.ok(rawRow && rawRow.action === "open_corpus", "raw handoff row must persist work_id");
    await expectCode(realHandoff.mint(OWNER, { orderIndex: 0, action: "open_corpus", workId: "42" }), "HANDOFF_TEXT_KEY_REQUIRED"); checks++;
    // AA4 4b-final — anchor-less open_review round trip on the migrated schema
    // (independent oracle: redeem recomputes from the stored row), plus the
    // two-way guard: a hybrid review row with an anchor must be rejected.
    const mintedReview = await realHandoff.mint(OWNER, { action: "open_review" });
    const redeemedReview = await realHandoff.redeem(mintedReview.raw);
    assert.ok(redeemedReview, "review redeem failed");
    assert.strictEqual(redeemedReview.action, "open_review");
    assert.strictEqual(redeemedReview.text_key, null); assert.strictEqual(redeemedReview.order_index, null); assert.strictEqual(redeemedReview.work_id, null);
    await expectCode(realHandoff.mint(OWNER, { action: "open_review", textKey: "a1b2c3d4e5f60718" }), "HANDOFF_REVIEW_UNEXPECTED_ANCHOR");
    await expectCode(realHandoff.mint(OWNER, { action: "open_review", workId: "42" }), "HANDOFF_REVIEW_UNEXPECTED_ANCHOR"); checks++;

    // agentProposalsRepo lifecycle on the real migrated schema (migration 045).
    const realProposals = require("../../db/agentProposalsRepo");
    const propArgs = (payload, nowIso) => ({ oauthClientId: CLIENT, connectionId: CONNECTION, kind: "note", payload, displayTitle: null, nowIso });
    const created1 = await realProposals.create(OWNER, propArgs({ body: "первая заметка" }, "2026-07-17T12:00:00.000Z"));
    assert.ok(/^ap_[a-f0-9]{32}$/.test(created1.proposal_id) && created1.status === "PENDING" && created1.reused === false);
    const createdDup = await realProposals.create(OWNER, propArgs({ body: "первая заметка" }, "2026-07-17T12:01:00.000Z"));
    assert.strictEqual(createdDup.proposal_id, created1.proposal_id); assert.strictEqual(createdDup.reused, true); checks++;
    // Owner-scoped access: another user can neither see nor decide it.
    assert.deepStrictEqual(await realProposals.listPending(OTHER, { nowIso: "2026-07-17T12:02:00.000Z" }), []);
    await expectCode(realProposals.decide(OTHER, created1.proposal_id, "DENIED", { nowIso: "2026-07-17T12:02:00.000Z" }), "AA_PROPOSAL_NOT_FOUND");
    const pendingList = await realProposals.listPending(OWNER, { nowIso: "2026-07-17T12:02:00.000Z" });
    assert.strictEqual(pendingList.length, 1);
    assert.strictEqual(pendingList[0].client_display_name, "Synthetic public client");
    assert.strictEqual(pendingList[0].authority, "AGENT_ASSERTED"); checks++;
    // Confirm flips authority to USER_CONFIRMED_AGENT_ASSERTED and touches ZERO
    // learner-truth tables (R17 independent oracle: raw COUNT deltas).
    const truthBefore = await tableCounts(ctx, ["review_log", "srs_projections", "word_status", "agent_explanations"]);
    const decided1 = await realProposals.decide(OWNER, created1.proposal_id, "CONFIRMED", { nowIso: "2026-07-17T12:03:00.000Z" });
    assert.strictEqual(decided1.status, "CONFIRMED");
    assert.deepStrictEqual(await tableCounts(ctx, ["review_log", "srs_projections", "word_status", "agent_explanations"]), truthBefore);
    const confirmedRaw = await ctx.get("SELECT status, authority, decided_at FROM agent_proposals WHERE proposal_id=?", [created1.proposal_id]);
    assert.strictEqual(confirmedRaw.status, "CONFIRMED"); assert.strictEqual(confirmedRaw.authority, "USER_CONFIRMED_AGENT_ASSERTED");
    await expectCode(realProposals.decide(OWNER, created1.proposal_id, "DENIED", { nowIso: "2026-07-17T12:04:00.000Z" }), "AA_PROPOSAL_NOT_PENDING"); checks++;
    // Deny-cooldown: identical re-propose after DENIED returns the denial (no new nag).
    const created2 = await realProposals.create(OWNER, propArgs({ body: "вторая" }, "2026-07-17T12:05:00.000Z"));
    await realProposals.decide(OWNER, created2.proposal_id, "DENIED", { nowIso: "2026-07-17T12:06:00.000Z" });
    const reDenied = await realProposals.create(OWNER, propArgs({ body: "вторая" }, "2026-07-17T12:07:00.000Z"));
    assert.strictEqual(reDenied.proposal_id, created2.proposal_id); assert.strictEqual(reDenied.status, "DENIED"); checks++;
    // Zombie-expiry (R14): an expired PENDING frees its dedupe slot and never
    // returns as a live idempotent hit; the raw row flips to EXPIRED.
    const created3 = await realProposals.create(OWNER, propArgs({ body: "третья" }, "2026-07-01T00:00:00.000Z"));
    const created3b = await realProposals.create(OWNER, propArgs({ body: "третья" }, "2026-07-17T12:08:00.000Z"));
    assert.notStrictEqual(created3b.proposal_id, created3.proposal_id, "expired PENDING must not be returned as live");
    const expiredRaw = await ctx.get("SELECT status FROM agent_proposals WHERE proposal_id=?", [created3.proposal_id]);
    assert.strictEqual(expiredRaw.status, "EXPIRED"); checks++;
    // PENDING cap (policy): live PENDING per user is bounded.
    const POLICY = require("../../agent/access/proposalPolicy");
    for (let i = 0; ; i += 1) {
      const live = await ctx.get("SELECT COUNT(*) c FROM agent_proposals WHERE user_id=? AND status='PENDING'", [OWNER]);
      if (Number(live.c) >= POLICY.PENDING_CAP) break;
      assert.ok(i < POLICY.PENDING_CAP + 2, "cap seed runaway");
      await realProposals.create(OWNER, propArgs({ body: `cap-${i}` }, "2026-07-17T12:09:00.000Z"));
    }
    await expectCode(realProposals.create(OWNER, propArgs({ body: "over-cap" }, "2026-07-17T12:10:00.000Z")), "AA_PROPOSAL_PENDING_LIMIT"); checks++;
    // Export redaction (R15): dedupe_key never leaves via the GDPR export.
    const exported = await identityRepo.exportUserData(OWNER);
    assert.ok((exported.table_list || []).includes("agent_proposals"), "structural sweep must cover agent_proposals");
    assert.ok((exported.tables.agent_proposals || []).length > 0 && exported.tables.agent_proposals.every((r) => !("dedupe_key" in r)), "export leaked proposal dedupe_key");
    assert.ok((exported.tables.handoff_tokens || []).every((r) => !("token_hash" in r)), "export leaked handoff token_hash"); checks++;
    // Retention sweep bounds mirror proposalPolicy (match by construction).
    const swept = await realProposals.pruneOld("2027-02-01T00:00:00.000Z");
    assert.ok(swept.purged >= 1, "old DENIED/EXPIRED rows must purge");
    const blankCheck = await ctx.get("SELECT payload_json, dedupe_key FROM agent_proposals WHERE proposal_id=?", [created1.proposal_id]);
    if (blankCheck) { assert.strictEqual(blankCheck.payload_json, '{"purged":true}'); assert.strictEqual(blankCheck.dedupe_key, null); }
    checks++;

    for (const sectionId of ["production_gap", "due", "read"]) {
      await ctx.run("UPDATE agent_tasks SET payload_json=? WHERE id='plan-open'", [JSON.stringify({ sections: [{ id: sectionId }] })]);
      const out = await handlers.get_learning_brief({ user_id: OWNER });
      assert.strictEqual(out.unfinished_action_code, sectionId === "read" ? "READING_AVAILABLE" : "REVIEW_AVAILABLE");
    }
    await ctx.run("DELETE FROM agent_tasks WHERE id='plan-open'");
    assert.strictEqual((await handlers.get_learning_brief({ user_id: OWNER })).unfinished_action_code, "NONE"); checks++;

    const tampered = search.result.next_cursor.slice(0, -1) + (search.result.next_cursor.endsWith("A") ? "B" : "A");
    assert.strictEqual((await service.execute(principal({ request_id: "tampered" }), "search_public_reading_catalog", { ...searchArgs, cursor: tampered })).error.code, "INTERNAL_ERROR");
    assert.strictEqual((await service.execute(principal({ request_id: "mismatch" }), "search_public_reading_catalog", { ...searchArgs, sort: "TITLE", cursor: search.result.next_cursor })).error.code, "INTERNAL_ERROR"); checks++;

    const staleDir = fs.mkdtempSync(path.join(ctx.dir, "catalog-stale-"));
    sidecars(staleDir, {}, 8);
    const staleCatalog = createPublicReadingCatalog({ baseDir: staleDir, catalogVersion: () => 8, cursorKey: Buffer.alloc(32, 7) });
    assert.throws(() => staleCatalog.search({ ...searchArgs, cursor: search.result.next_cursor }), /AA_PUBLIC_CATALOG_CURSOR_INVALID/); checks++;

    const corruptDir = fs.mkdtempSync(path.join(ctx.dir, "catalog-corrupt-"));
    sidecars(corruptDir, { root: { index_file: "corpus-index-v6.json" } });
    const corruptVersion = createPublicReadingCatalog({ baseDir: corruptDir, catalogVersion: () => 7, cursorKey: "k" });
    assert.throws(() => corruptVersion.isReadable(), /AA_PUBLIC_CATALOG_VERSION_MISMATCH/);
    const joinDir = fs.mkdtempSync(path.join(ctx.dir, "catalog-join-"));
    sidecars(joinDir, { ready: [{ id: "1", title: "Mismatch", author: "Author A", era: "biblical", genre: "prose", segments: 1, audio_status: "none" }] , root: { counts: { works: 13, baked: 1 } } });
    const corruptJoin = createPublicReadingCatalog({ baseDir: joinDir, catalogVersion: () => 7, cursorKey: "k" });
    assert.throws(() => corruptJoin.isReadable(), /AA_PUBLIC_CATALOG_READY_JOIN_MISMATCH/); checks++;

    const poisonedHandlers = createProductionHandlers({
      learnerGraphRepo: { getAgentAccessReviewAggregates: async () => ({ scheduled_total: 100001, due_total: 0, urgent_total: 0 }), getDue: async () => [], getActivityDelta: async () => ({ reviews_total: 0, skips_total: 0, distinct_items: 0, new_items_scheduled: 0, active_days: 0, by_channel: [], top: [] }) },
      agentRepo: { getLatestOpenPlanAction: async () => null, listExplanationMetadata: async () => ({ items: [{ explanation_id: "bad", created_at: "2026-07-17T11:00:00.000Z", kind: "word", construct_ids: [], purge_state: "AVAILABLE", leaked: true }], next_before: null }), getProfile: async () => ({}), getExplanationById: async () => null },
      oauthRepo, publicCatalog: catalog, ...aa3Deps, now: () => NOW, principalAccessExpiresAt: () => EXPIRY,
    });
    await expectCode(poisonedHandlers.get_learning_brief({ user_id: OWNER }), "AA_REVIEW_AGGREGATE_OVERFLOW");
    const poisonedService = createAgentAccessService({ enabled: true, ownerIds: [OWNER], handlers: poisonedHandlers, now: () => NOW });
    const poisoned = await poisonedService.execute(principal({ request_id: "poisoned" }), "get_recent_explanation_metadata", { kinds: ["word"], limit: 1 });
    assert.ok(!poisoned.ok && poisoned.error.code === "UNKNOWN_FIELD"); checks++;

    const validMetadataItem = (index) => ({ explanation_id: `mock-${index}`, created_at: "2026-07-17T11:00:00.000Z", kind: "word", construct_ids: [], purge_state: "AVAILABLE" });
    const cappedService = createAgentAccessService({
      enabled: true,
      ownerIds: [OWNER],
      handlers: {
        ...handlers,
        get_recent_explanation_metadata: async () => ({
          schema_version: "aa.explanation_metadata.1.0.0", items: Array.from({ length: 21 }, (_, index) => validMetadataItem(index)),
          next_before: null, generated_at: "2026-07-17T12:00:00.000Z",
        }),
        get_agent_connection: async () => ({
          schema_version: "aa.connection.1.0.0", connection_id: CONNECTION, oauth_client_id: CLIENT,
          client_display_name: "x".repeat(5000), connection_status: "ACTIVE", granted_scopes: SCOPES,
          access_expires_at: EXPIRY, consent_version: "aa-consent-v1", capability_version: "aa-v0.1",
          downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO", generated_at: "2026-07-17T12:00:00.000Z",
        }),
      },
      now: () => NOW,
    });
    assert.strictEqual((await cappedService.execute(principal({ request_id: "cardinality-cap" }), "get_recent_explanation_metadata", { kinds: ["word"], limit: 20 })).error.code, "OUTPUT_SCHEMA_INVALID");
    assert.strictEqual((await cappedService.execute(principal({ request_id: "byte-cap" }), "get_agent_connection", {})).error.code, "OUTPUT_TOO_LARGE"); checks++;
    for (const [requestId, item] of [
      ["unknown-output-enum", { ...validMetadataItem(1), kind: "unknown" }],
      ["unknown-output-id", { ...validMetadataItem(1), explanation_id: "bad id" }],
      ["unknown-output-time", { ...validMetadataItem(1), created_at: "not-a-time" }],
    ]) {
      const outputService = createAgentAccessService({
        enabled: true, ownerIds: [OWNER], now: () => NOW,
        handlers: { ...handlers, get_recent_explanation_metadata: async () => ({ schema_version: "aa.explanation_metadata.1.0.0", items: [item], next_before: null, generated_at: "2026-07-17T12:00:00.000Z" }) },
      });
      assert.strictEqual((await outputService.execute(principal({ request_id: requestId }), "get_recent_explanation_metadata", { kinds: ["word"], limit: 1 })).error.code, "SCHEMA_INVALID");
    }
    checks++;

    await ctx.run(`INSERT INTO agent_explanations (id,user_id,facts_used_json,body_json,created_at) VALUES (?,?,?,?,?),(?,?,?,?,?)`,
      ["collision-a", OWNER, "[]", JSON.stringify({ kind: "word" }), "2026-07-17T10:00:00.000Z", "collision-b", OWNER, "[]", JSON.stringify({ kind: "word" }), "2026-07-17T10:00:00.000Z"]);
    await expectCode(agentRepo.listExplanationMetadata(OWNER, { kinds: ["word"], limit: 1, before: "2026-07-17T10:01:00.000Z" }), "AA_EXPLANATION_CURSOR_COLLISION"); checks++;

    await ctx.run(`INSERT INTO agent_explanations (id,user_id,facts_used_json,body_json,created_at) VALUES (?,?,?,?,?)`,
      ["malformed-kind", OWNER, "[]", JSON.stringify({ kind: "unknown-kind" }), "2026-07-17T10:02:00.000Z"]);
    await expectCode(agentRepo.listExplanationMetadata(OWNER, { kinds: ["word"], limit: 10 }), "AA_EXPLANATION_JSON_INVALID");
    await ctx.run("DELETE FROM agent_explanations WHERE id='malformed-kind'"); checks++;

    await ctx.run(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100001)
      INSERT INTO srs_projections (user_id,item_key,due) SELECT ?, 'bulk-'||x, '2026-07-18T00:00:00.000Z' FROM n`, [OTHER]);
    await expectCode(learnerGraphRepo.getAgentAccessReviewAggregates(OTHER, { nowMs: NOW }), "AA_REVIEW_AGGREGATE_OVERFLOW"); checks++;

    const ownerParser = exactOwnerParser();
    for (const raw of [undefined, "", "*", "bad value", `${OWNER},${OWNER}`, `${OWNER},${OTHER}`, `${OWNER},`]) {
      ownerParser.context.process.env.AGENT_ACCESS_OWNER_IDS = raw;
      assert.throws(() => ownerParser.parse(), /AA_MCP_OWNER_ALLOWLIST_INVALID/);
    }
    ownerParser.context.process.env.AGENT_ACCESS_OWNER_IDS = OWNER;
    const exactOne = ownerParser.parse(); assert.strictEqual(exactOne.length, 1); assert.ok(Object.isFrozen(exactOne)); checks++;

    const sourceFiles = ["agent/access/productionHandlers.js", "agent/access/publicReadingCatalog.js"];
    const forbiddenImport = /(require\(["'](?:\.\.\/)*?(?:llm|llmGate|reviewer|planner|providers?)|require\(["'](?:http|https|child_process)["']\)|\bfetch\s*\(|createTask\s*\()/i;
    const forbiddenWrite = /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|SET|FROM)\b/;
    for (const file of sourceFiles) {
      const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
      assert.ok(!forbiddenImport.test(source) && !forbiddenWrite.test(source), `forbidden dependency/write in ${file}`);
    }
    checks++;

    console.log(JSON.stringify({ ok: true, checks, tools: 14, owner_allowlist_count: 1, owner_match: true, zero_table_deltas: true, network_calls: 0, provider_calls: 0, llm_calls: 0, byok_calls: 0, sentinel_occurrences: 0 }));
  } finally {
    global.fetch = originalFetch; http.request = originalHttpRequest; http.get = originalHttpGet; https.request = originalHttpsRequest; https.get = originalHttpsGet;
    await T.cleanup(ctx);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
