"use strict";

const { CAPABILITIES, CAPABILITY_VERSION } = require("./capabilities");

const REVIEW_ACTIONS = new Set(["fresh_struggles", "production_gap", "due"]);
const KNOWN_SCOPES = new Set(Object.values(CAPABILITIES).map((entry) => entry.scope));

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function fixedNow(now) {
  const value = Number(now());
  if (!Number.isFinite(value)) fail("AA_PRODUCTION_HANDLER_CLOCK_INVALID");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("AA_PRODUCTION_HANDLER_CLOCK_INVALID");
  return Object.freeze({ ms: value, iso: date.toISOString() });
}
function plusMs(value, delta) { return new Date(value + delta).toISOString(); }
function validateAggregate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("AA_REVIEW_AGGREGATE_INVALID");
  const keys = ["scheduled_total", "due_total", "urgent_total"];
  if (Object.keys(value).sort().join(",") !== keys.sort().join(",")) fail("AA_REVIEW_AGGREGATE_INVALID");
  for (const key of keys) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100000) fail("AA_REVIEW_AGGREGATE_OVERFLOW");
  if (value.urgent_total > value.due_total || value.due_total > value.scheduled_total) fail("AA_REVIEW_AGGREGATE_INVALID");
  return value;
}
function estimatedMinutes(due) { return Math.min(120, Math.ceil(due * 45 / 60)); }
function unfinishedAction(plan) {
  if (plan == null) return "NONE";
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || Object.keys(plan).length !== 1 || typeof plan.section_id !== "string") fail("AA_PLAN_METADATA_INVALID");
  if (REVIEW_ACTIONS.has(plan.section_id)) return "REVIEW_AVAILABLE";
  if (plan.section_id === "read") return "READING_AVAILABLE";
  fail("AA_PLAN_METADATA_ACTION_UNKNOWN");
}

function struggleBand(lapses) {
  const n = Number(lapses) || 0;
  if (n >= 3) return "high";
  if (n >= 1) return "some";
  return "none";
}
function dueDay(due) {
  const s = String(due || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function createProductionHandlers(options = {}) {
  const learnerRepo = options.learnerGraphRepo;
  const agentRepo = options.agentRepo;
  const oauthRepo = options.oauthRepo;
  const publicCatalog = options.publicCatalog;
  const keyingService = options.keyingService; // AA3: derives content from the shared public lexicon
  const connectionPersistence = options.connectionPersistence; // AA3: control-plane window state
  const now = options.now || Date.now;
  const principalAccessExpiresAt = options.principalAccessExpiresAt;
  if (!learnerRepo || typeof learnerRepo.getAgentAccessReviewAggregates !== "function" || typeof learnerRepo.getDue !== "function"
    || !agentRepo || typeof agentRepo.getLatestOpenPlanAction !== "function" || typeof agentRepo.listExplanationMetadata !== "function" || typeof agentRepo.getProfile !== "function"
    || !oauthRepo || typeof oauthRepo.loadConnection !== "function" || typeof oauthRepo.listConnectionsForUser !== "function"
    || !publicCatalog || typeof publicCatalog.isReadable !== "function" || typeof publicCatalog.search !== "function"
    || !keyingService || typeof keyingService.displayForItemKey !== "function" || typeof keyingService.glossForItemKey !== "function"
    || typeof connectionPersistence !== "function"
    || typeof now !== "function" || typeof principalAccessExpiresAt !== "function") fail("AA_PRODUCTION_HANDLER_DEPENDENCY_INVALID");

  async function get_learning_brief(context) {
    const clock = fixedNow(now);
    const aggregate = validateAggregate(await learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }));
    const plan = await agentRepo.getLatestOpenPlanAction(context.user_id);
    let priority = "REVIEW_DUE";
    if (aggregate.due_total === 0) priority = publicCatalog.isReadable() ? "READING_AVAILABLE" : "NO_CURRENT_ACTION";
    return Object.freeze({
      schema_version: "aa.learning_brief.1.0.0",
      due_total: aggregate.due_total,
      urgent_total: aggregate.urgent_total,
      scheduled_total: aggregate.scheduled_total,
      estimated_minutes: estimatedMinutes(aggregate.due_total),
      priority_code: priority,
      unfinished_action_code: unfinishedAction(plan),
      generated_at: clock.iso,
      expires_at: plusMs(clock.ms, 5 * 60 * 1000),
    });
  }

  async function get_review_summary(context) {
    const clock = fixedNow(now);
    const aggregate = validateAggregate(await learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }));
    return Object.freeze({
      schema_version: "aa.review_summary.1.0.0",
      due_total: aggregate.due_total,
      urgent_total: aggregate.urgent_total,
      estimated_minutes: estimatedMinutes(aggregate.due_total),
      handoff_eligible: false,
      handoff_scope_available: false,
      generated_at: clock.iso,
      expires_at: plusMs(clock.ms, 2 * 60 * 1000),
    });
  }

  async function search_public_reading_catalog(_context, args) {
    const clock = fixedNow(now);
    const page = publicCatalog.search(args);
    return Object.freeze({
      schema_version: "aa.public_reading_search.1.0.0",
      catalog_version: page.catalog_version,
      results: page.results,
      next_cursor: page.next_cursor,
      generated_at: clock.iso,
    });
  }

  async function get_recent_explanation_metadata(context, args) {
    const clock = fixedNow(now);
    const page = await agentRepo.listExplanationMetadata(context.user_id, args);
    if (!page || typeof page !== "object" || !Array.isArray(page.items) || !(page.next_before == null || typeof page.next_before === "string")) {
      fail("AA_EXPLANATION_METADATA_INVALID");
    }
    return Object.freeze({
      schema_version: "aa.explanation_metadata.1.0.0",
      items: page.items,
      next_before: page.next_before,
      generated_at: clock.iso,
    });
  }

  // AA3: due study words with meaning + a COARSE struggle band. Deliberately
  // omits the acceptance set (alts), the expected answer, and the raw FSRS
  // floats — grading stays deterministic and first-party in LinguistPro.
  async function get_due_review_items(context, args) {
    const clock = fixedNow(now);
    const limit = Math.max(1, Math.min(20, Number(args && args.limit) || 20));
    const [aggregate, due] = await Promise.all([
      learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }).then(validateAggregate),
      learnerRepo.getDue(context.user_id, { nowMs: clock.ms, limit }),
    ]);
    const rows = Array.isArray(due) ? due.slice(0, limit) : [];
    const items = [];
    for (const row of rows) {
      let display = String(row.item_key || "");
      let gloss = null;
      try { display = String(await keyingService.displayForItemKey(row.item_key)).slice(0, 64) || display.slice(0, 64); } catch (_) {}
      try { const g = await keyingService.glossForItemKey(row.item_key); gloss = g && g.gloss ? String(g.gloss).slice(0, 120) : null; } catch (_) { gloss = null; }
      const day = dueDay(row.due) || clock.iso.slice(0, 10);
      items.push(Object.freeze({ display: display.slice(0, 64) || "?", gloss, struggle: struggleBand(row.lapses), due_day: day, content_available: gloss !== null }));
    }
    return Object.freeze({
      schema_version: "aa.due_review_items.1.0.0",
      items: Object.freeze(items),
      due_total: aggregate.due_total,
      truncated: aggregate.due_total > items.length,
      generated_at: clock.iso,
    });
  }

  async function get_learner_profile(context) {
    const clock = fixedNow(now);
    const profile = (await agentRepo.getProfile(context.user_id)) || {};
    const mode = ["silent", "coach", "intensive"].includes(profile.mode) ? profile.mode : "silent";
    const language = (String(profile.language || "ru").slice(0, 8)) || "ru";
    let depth = "brief";
    try { const g = profile.goals_json ? JSON.parse(profile.goals_json) : null; if (g && g.depth === "detailed") depth = "detailed"; } catch (_) {}
    return Object.freeze({ schema_version: "aa.learner_profile.1.0.0", mode, language, depth, generated_at: clock.iso });
  }

  async function get_agent_connection(context) {
    const clock = fixedNow(now);
    const [connection, listed] = await Promise.all([
      oauthRepo.loadConnection(context.user_id, context.connection_id),
      oauthRepo.listConnectionsForUser(context.user_id),
    ]);
    if (!connection || connection.connection_id !== context.connection_id || connection.user_id !== context.user_id
      || connection.oauth_client_id !== context.oauth_client_id || !["ACTIVE", "SCOPE_REDUCED"].includes(connection.status)) {
      fail("AA_CONNECTION_BINDING_MISMATCH");
    }
    const matches = (listed || []).filter((row) => row && row.connection_id === context.connection_id);
    if (matches.length !== 1 || typeof matches[0].client_display_name !== "string" || !matches[0].client_display_name
      || matches[0].status !== connection.status) fail("AA_CONNECTION_BINDING_MISMATCH");
    const activeFromConnection = (connection.grants || []).filter((grant) => grant && grant.status === "ACTIVE").map((grant) => String(grant.scope)).sort();
    const activeFromList = (matches[0].grants || []).filter((grant) => grant && grant.status === "ACTIVE").map((grant) => String(grant.scope)).sort();
    if (activeFromConnection.some((scope) => !KNOWN_SCOPES.has(scope)) || activeFromList.some((scope) => !KNOWN_SCOPES.has(scope))
      || activeFromConnection.length !== new Set(activeFromConnection).size || activeFromConnection.join("\n") !== activeFromList.join("\n")) {
      fail("AA_CONNECTION_GRANTS_INVALID");
    }
    const accessExpiresAt = principalAccessExpiresAt(context);
    const expiry = new Date(String(accessExpiresAt));
    if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== String(accessExpiresAt) || expiry.getTime() <= clock.ms) fail("AA_CONNECTION_EXPIRY_INVALID");
    if (connection.capability_version !== CAPABILITY_VERSION) fail("AA_CONNECTION_CAPABILITY_INVALID");
    // AA3: report the real access window (control-plane) so the agent stops
    // mistaking the short access-token TTL for the connection lifetime.
    const persistence = await connectionPersistence();
    const lifetime = persistence && ["PERSISTENT_WINDOW", "TIMED_WINDOW", "TOKEN_ONLY"].includes(persistence.access_lifetime) ? persistence.access_lifetime : "TOKEN_ONLY";
    let windowExpiresAt = null;
    if (lifetime === "TIMED_WINDOW") {
      const w = new Date(String(persistence.window_expires_at));
      if (!Number.isFinite(w.getTime()) || w.toISOString() !== String(persistence.window_expires_at)) fail("AA_CONNECTION_PERSISTENCE_INVALID");
      windowExpiresAt = w.toISOString();
    }
    return Object.freeze({
      schema_version: "aa.connection.1.0.0",
      connection_id: context.connection_id,
      oauth_client_id: context.oauth_client_id,
      client_display_name: matches[0].client_display_name,
      connection_status: connection.status,
      granted_scopes: Object.freeze(activeFromConnection),
      access_expires_at: String(accessExpiresAt),
      access_lifetime: lifetime,
      window_expires_at: windowExpiresAt,
      consent_version: connection.consent_version,
      capability_version: connection.capability_version,
      downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO",
      generated_at: clock.iso,
    });
  }

  return Object.freeze({
    get_learning_brief,
    get_review_summary,
    search_public_reading_catalog,
    get_recent_explanation_metadata,
    get_agent_connection,
    get_due_review_items,
    get_learner_profile,
  });
}

module.exports = { createProductionHandlers };
