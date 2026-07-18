"use strict";

const crypto = require("crypto");
const C = require("./oauthContracts");
const { CAPABILITY_VERSION } = require("./capabilities");

const CONSENT_VERSION = "agent-access-consent-v1";
// AA3: bumped so content-class scopes acknowledge the stronger retention framing.
const RETENTION_NOTICE_VERSION = "downstream-retention-v2";
const MAX_PENDING = 100;

// retention_tier drives the consent UI's heightened block. AGGREGATE = counts/
// metadata/public (AA2). CONTENT = learner-specific study data that leaves to the
// external provider and cannot be recalled.
const SCOPE_PRESENTATION = Object.freeze({
  "learning.brief.read": Object.freeze({ capability: "get_learning_brief", purpose: "CURRENT_LEARNING_PRIORITY", data_class: "BOUNDED_AGGREGATE", retention_tier: "AGGREGATE", excludes: "NO_WORDS_ITEMS_ANSWERS_OR_PRIVATE_EVIDENCE", first_party_action: "/index.html" }),
  "review.summary.read": Object.freeze({ capability: "get_review_summary", purpose: "REVIEW_AVAILABILITY_AND_HANDOFF_ELIGIBILITY", data_class: "COUNTS_DURATION_ELIGIBILITY", retention_tier: "AGGREGATE", excludes: "NO_REVIEW_ITEMS_ANSWERS_GRADES_OR_FSRS", first_party_action: "/index.html" }),
  "reading.public.search": Object.freeze({ capability: "search_public_reading_catalog", purpose: "PUBLIC_READING_DISCOVERY", data_class: "PUBLIC_CORPUS_METADATA", retention_tier: "AGGREGATE", excludes: "NO_PRIVATE_TEXT_OR_CORPUS_BODY", first_party_action: "/library.html" }),
  "explanations.metadata.read": Object.freeze({ capability: "get_recent_explanation_metadata", purpose: "EXPLANATION_REVISIT", data_class: "IDS_DATES_KINDS_CONSTRUCT_IDS_PURGE_STATE", retention_tier: "AGGREGATE", excludes: "NO_EXPLANATION_BODY_OR_SOURCE_BODY", first_party_action: "/index.html" }),
  "agent.connection.read": Object.freeze({ capability: "get_agent_connection", purpose: "CONNECTION_SELF_INSPECTION", data_class: "CONNECTION_AND_GRANT_METADATA", retention_tier: "AGGREGATE", excludes: "NO_TOKEN_COOKIE_CSRF_SUBJECT_OR_PRIVATE_DATA", first_party_action: "/agent-access.html" }),
  // AA3 slice-1 content scopes.
  "review.items.read": Object.freeze({ capability: "get_due_review_items", purpose: "DUE_STUDY_WORDS_FOR_DISCUSSION", data_class: "LEARNING_CONTENT_STUDY_WORDS", retention_tier: "CONTENT", excludes: "NO_ACCEPTANCE_SET_EXPECTED_ANSWER_OR_RAW_MEMORY_MODEL", first_party_action: "/index.html" }),
  "profile.read": Object.freeze({ capability: "get_learner_profile", purpose: "LEARNING_PROFILE_CONTEXT", data_class: "COARSE_PROFILE_MODE_LANGUAGE_DEPTH", retention_tier: "CONTENT", excludes: "NO_FREE_TEXT_GOALS_OR_IDENTIFIERS", first_party_action: "/agent-access.html" }),
  "explanations.body.read": Object.freeze({ capability: "get_explanation_body", purpose: "EXPLANATION_BODY_REVISIT", data_class: "MENTOR_EXPLANATION_TEXT", retention_tier: "CONTENT", excludes: "NO_QUOTED_SOURCE_SENTENCE_OR_PURGED_BODY", first_party_action: "/index.html" }),
});

function error(code) { const e = new Error(code); e.code = code; throw e; }
function closed(value, allowed, required = allowed) {
  const x = C.plain(value, "AA_CONSENT_BAD_OBJECT");
  for (const key of Object.keys(x)) if (!allowed.includes(key)) error("AA_CONSENT_UNKNOWN_FIELD");
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(x, key)) error("AA_CONSENT_MISSING_FIELD");
  return x;
}
function requestId(value) { return C.safeId(value, 96); }

function createConsentCeremony({ oauthRepo, recordConsent, now = () => new Date().toISOString() }) {
  if (!oauthRepo || typeof oauthRepo.loadClientForAuthorization !== "function"
    || typeof oauthRepo.loadConnection !== "function"
    || typeof oauthRepo.activateConnectionWithGrants !== "function"
    || typeof oauthRepo.suspendConnection !== "function"
    || typeof recordConsent !== "function") error("AA_CONSENT_BAD_DEPENDENCY");

  const pending = new Map();

  function prune() {
    const at = Date.parse(now());
    for (const [id, row] of pending) {
      if (row.status !== "OPEN" || Date.parse(row.expires_at) <= at) pending.delete(id);
    }
  }

  async function stageTrustedRequest(userId, input) {
    prune();
    if (pending.size >= MAX_PENDING) error("AA_CONSENT_PENDING_LIMIT");
    const keys = ["request_id", "oauth_client_id", "client_display_name", "redirect_uri", "resource_uri", "requested_scopes", "pkce_method", "connection_id", "consent_version", "capability_version", "retention_notice_version", "expires_at"];
    const x = closed(input, keys);
    const uid = C.safeId(userId);
    const id = requestId(x.request_id);
    if (pending.has(id)) error("AA_CONSENT_REQUEST_EXISTS");
    const clientId = C.safeId(x.oauth_client_id);
    const connectionId = C.connectionId(x.connection_id);
    const redirectUri = C.redirectUri(x.redirect_uri);
    const scopes = C.scopes(x.requested_scopes);
    const expiresAt = C.iso(x.expires_at);
    if (x.pkce_method !== "S256") error("AA_OAUTH_BAD_PKCE");
    C.resourceUri(x.resource_uri);
    if (x.consent_version !== CONSENT_VERSION
      || x.capability_version !== CAPABILITY_VERSION
      || x.retention_notice_version !== RETENTION_NOTICE_VERSION) error("AA_CONSENT_VERSION_MISMATCH");
    const ttl = Date.parse(expiresAt) - Date.parse(now());
    if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 10 * 60 * 1000) error("AA_CONSENT_REQUEST_EXPIRED");

    const client = await oauthRepo.loadClientForAuthorization(clientId);
    if (!client || client.status !== "ACTIVE") error("AA_OAUTH_CLIENT_INACTIVE");
    if (client.display_name !== C.bounded(x.client_display_name, 120)
      || !client.redirect_uris.includes(redirectUri)) error("AA_OAUTH_CLIENT_BINDING_INVALID");
    const connection = await oauthRepo.loadConnection(uid, connectionId);
    if (connection.oauth_client_id !== clientId || connection.status !== "PENDING_AUTH") error("AA_OAUTH_CONNECTION_INACTIVE");
    if (connection.consent_version !== CONSENT_VERSION
      || connection.capability_version !== CAPABILITY_VERSION
      || connection.retention_notice_version !== RETENTION_NOTICE_VERSION) error("AA_CONSENT_VERSION_MISMATCH");

    pending.set(id, Object.freeze({
      request_id: id,
      user_id: uid,
      oauth_client_id: clientId,
      client_display_name: client.display_name,
      connection_id: connectionId,
      connection_label: connection.display_label,
      requested_scopes: scopes,
      expires_at: expiresAt,
      status: "OPEN",
    }));
    return id;
  }

  function getOpen(userId, id) {
    const row = pending.get(requestId(id));
    if (!row || row.user_id !== C.safeId(userId)) error("AA_CONSENT_REQUEST_NOT_FOUND");
    if (row.status !== "OPEN") error("AA_CONSENT_REQUEST_REPLAYED");
    if (Date.parse(row.expires_at) <= Date.parse(now())) {
      pending.delete(row.request_id);
      error("AA_CONSENT_REQUEST_EXPIRED");
    }
    return row;
  }

  function preview(userId, id) {
    const row = getOpen(userId, id);
    return Object.freeze({
      schema_version: "aa.consent.preview.1.0.0",
      request_id: row.request_id,
      client_display_name: row.client_display_name,
      connection_label: row.connection_label,
      requested_scopes: Object.freeze(row.requested_scopes.map((scope) => {
        // Fail-closed: an un-presented scope must never render approvable.
        const presentation = SCOPE_PRESENTATION[scope];
        if (!presentation || !presentation.data_class || !presentation.retention_tier) error("AA_CONSENT_SCOPE_UNPRESENTED");
        return Object.freeze({
          scope,
          ...presentation,
          downstream_retention: presentation.retention_tier === "CONTENT"
            ? "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO_CONTENT_IRRECOVERABLE"
            : "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO",
        });
      })),
      retention_tier: row.requested_scopes.some((scope) => (SCOPE_PRESENTATION[scope] || {}).retention_tier === "CONTENT") ? "CONTENT" : "AGGREGATE",
      consent_version: CONSENT_VERSION,
      capability_version: CAPABILITY_VERSION,
      retention_notice_version: RETENTION_NOTICE_VERSION,
      expires_at: row.expires_at,
      canonical_authority: "LINGUISTPRO_ONLY",
      external_memory_is_learner_truth: false,
    });
  }

  async function decide(userId, input) {
    const x = closed(input, ["request_id", "decision", "selected_scopes", "retention_ack"]);
    const row = getOpen(userId, x.request_id);
    if (!new Set(["approve", "deny"]).has(x.decision)) error("AA_CONSENT_BAD_DECISION");
    const selected = C.scopes(x.selected_scopes, { allowEmpty: x.decision === "deny" });
    if (x.decision === "deny") {
      if (selected.length || x.retention_ack !== false) error("AA_CONSENT_DENY_SHAPE_INVALID");
      pending.set(row.request_id, Object.freeze({ ...row, status: "PROCESSING" }));
      try {
        await oauthRepo.suspendConnection(row.user_id, row.connection_id, "USER_DENIED_CONSENT", now());
        pending.delete(row.request_id);
        return Object.freeze({ ok: true, decision: "denied" });
      } catch (e) {
        pending.set(row.request_id, row);
        throw e;
      }
    }

    // AA3 (R15-F3): allow a strict SUBSET of the requested scopes so the owner
    // can take coarse-without-fine (e.g. review.summary.read without
    // review.items.read). Selected must be non-empty and ⊆ requested.
    const requestedSet = new Set(row.requested_scopes);
    if (x.retention_ack !== true || !selected.length
      || new Set(selected).size !== selected.length
      || selected.some((scope) => !requestedSet.has(scope))) error("AA_CONSENT_APPROVAL_INVALID");

    pending.set(row.request_id, Object.freeze({ ...row, status: "PROCESSING" }));
    try {
      for (const scope of selected) {
        await recordConsent(row.user_id, C.consentKey(row.connection_id, scope), true, CONSENT_VERSION);
      }
      await oauthRepo.activateConnectionWithGrants(row.user_id, row.connection_id, selected, now());
      pending.delete(row.request_id);
      return Object.freeze({ ok: true, decision: "approved", connection_id: row.connection_id, granted_scopes: selected });
    } catch (e) {
      pending.set(row.request_id, row);
      throw e;
    }
  }

  return Object.freeze({ stageTrustedRequest, preview, decide, prune, pendingCount: () => pending.size });
}

function opaqueRequestId() { return `aar_${crypto.randomBytes(16).toString("hex")}`; }

module.exports = {
  CONSENT_VERSION,
  RETENTION_NOTICE_VERSION,
  SCOPE_PRESENTATION,
  createConsentCeremony,
  opaqueRequestId,
};
