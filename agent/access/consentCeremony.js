"use strict";

const crypto = require("crypto");
const C = require("./oauthContracts");
const { CAPABILITY_VERSION } = require("./capabilities");
const PROPOSAL_POLICY = require("./proposalPolicy");

// S1: bumped — PERSONAL-tier scopes (личные тексты владельца) вводят новую, самую сильную
// градацию карты. Equality-гейт версий — только approve-time (проверено критикой): живое
// подключение Hermes НЕ рвётся; re-ceremony нужна лишь для добавления новых scope.
const CONSENT_VERSION = "agent-access-consent-v3";
const RETENTION_NOTICE_VERSION = "downstream-retention-v3";
const MAX_PENDING = 100;

// retention_tier drives the consent UI's heightened block. AGGREGATE = counts/
// metadata/public (AA2). CONTENT = learner-specific study data that leaves to the
// external provider and cannot be recalled. PERSONAL (S1) = собственные тексты
// владельца (класс C) — сильнее CONTENT; порядок AGGREGATE < CONTENT < PERSONAL.
const RETENTION_TIERS = Object.freeze(["AGGREGATE", "CONTENT", "PERSONAL"]);
const tierRank = (t) => RETENTION_TIERS.indexOf(String(t));
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
  "reading.corpus.read": Object.freeze({ capability: "get_reading_content", purpose: "PUBLIC_CORPUS_READING", data_class: "PUBLIC_DOMAIN_CORPUS_TEXT", retention_tier: "AGGREGATE", excludes: "NO_PRIVATE_TEXTS_ONLY_PUBLIC_CORPUS", first_party_action: "/library.html" }),
  // AA3 commit 3c — write-capability pair. Both are AGGREGATE on the EGRESS
  // axis (no learner content leaves through them), but intent.propose is the
  // first scope where the agent writes INTO the account, so its card carries
  // an explicit direction + internal-retention bound (R15: consent must
  // describe the real processing) with a scope-specific downstream line.
  "reading.handoff.create": Object.freeze({ capability: "create_reading_handoff", purpose: "MINT_FIRST_PARTY_READING_LINK", data_class: "SINGLE_USE_LINK_TO_PUBLIC_CORPUS_WORK", retention_tier: "AGGREGATE", excludes: "NO_CONTENT_NO_PERSONAL_TEXTS_OWNER_CLICKS_LINK", first_party_action: "/library.html" }),
  "intent.propose": Object.freeze({
    capability: "propose_action", purpose: "AGENT_PROPOSES_OWNER_CONFIRMS",
    data_class: "PROPOSAL_STATUS_ONLY", retention_tier: "AGGREGATE",
    direction: "AGENT_WRITES_INTO_YOUR_ACCOUNT",
    internal_retention: PROPOSAL_POLICY.INTERNAL_RETENTION_NOTICE,
    downstream_retention_override: "NO_LEARNER_CONTENT_LEAVES_DENY_DECISIONS_VISIBLE_TO_AGENT",
    excludes: "NO_EXECUTION_WITHOUT_OWNER_CONFIRM_NO_LEARNING_TRUTH_WRITE",
    first_party_action: "/agent-access.html",
  }),
  // AA4 slice 4a: PURE activity delta — the excludes claim is enforced by the
  // output validator (no struggle/grades fields exist in the schema).
  "review.activity.read": Object.freeze({ capability: "get_progress_delta", purpose: "STUDY_ACTIVITY_DELTA_FOR_DISCUSSION", data_class: "LEARNING_CONTENT_STUDY_WORDS_ACTIVITY", retention_tier: "CONTENT", excludes: "NO_GRADES_NO_ACCURACY_NO_STRUGGLE_NO_ACCEPTANCE_SET_OR_RAW_MEMORY_MODEL", first_party_action: "/index.html" }),
  // AA4 slice 4b-final: anchor-less «открой повторение» link. The excludes string
  // honestly ADMITS the one bit this scope can disclose (empty-or-not schedule,
  // via the typed refusal) — presentation claims stay true by construction.
  "review.handoff.create": Object.freeze({ capability: "create_review_handoff", purpose: "MINT_FIRST_PARTY_REVIEW_SESSION_LINK", data_class: "SINGLE_USE_LINK_NO_LEARNER_CONTENT", retention_tier: "AGGREGATE", excludes: "NO_DUE_WORDS_NO_ANSWERS_NO_GRADES_ONLY_EMPTY_OR_NOT_OWNER_CLICKS", first_party_action: "/library.html" }),
  // S-пакет — ЛИЧНЫЕ тексты владельца (класс C, PERSONAL-tier). Карта честно называет
  // раскрываемое множество: metadata = названия ВСЕХ синкованных текстов; content = тела
  // (окна строк he+ru) ВКЛЮЧАЯ названия (критика R15: при standing-гранте content-scope
  // раскрывает title и без metadata-scope) — и только по отдельному гранту владельца из
  // панели (S2), поверх этого scope. Excludes истинны by construction: в sidecar и
  // output-схемах физически нет полей заметок/оценок/SRS.
  "personal.texts.metadata.read": Object.freeze({ capability: "list_personal_texts", purpose: "PERSONAL_TEXTS_CATALOG_TITLES_OF_ALL_SYNCED", data_class: "PERSONAL_TEXT_TITLES_SIZES_FRESHNESS", retention_tier: "PERSONAL", excludes: "NO_TEXT_BODY_NO_NOTES_NO_GRADES_NO_SRS", first_party_action: "/library.html" }),
  "personal.texts.content.read": Object.freeze({ capability: "get_personal_text_content", purpose: "PERSONAL_TEXT_BODY_WINDOWS_AFTER_OWNER_GRANT", data_class: "PERSONAL_TEXT_BODY_HE_RU_INCLUDING_TITLES", retention_tier: "PERSONAL", excludes: "NO_NOTES_NO_GRADES_NO_SRS_REQUIRES_SEPARATE_OWNER_GRANT", first_party_action: "/agent-access.html" }),
  "morphology.read": Object.freeze({ capability: "get_word_morphology", purpose: "OFFLINE_WORD_MORPHOLOGY_GROUNDING", data_class: "PUBLIC_DICTIONARY_MORPHOLOGY", retention_tier: "AGGREGATE", excludes: "NO_LEARNER_DATA_NO_LLM_NO_NETWORK_NO_SYNTHESIZED_FORMS", first_party_action: "/agent-access.html" }),
  "learner.coverage.read": Object.freeze({ capability: "get_text_coverage", purpose: "TEXT_DIFFICULTY_AGAINST_YOUR_LEARNER_STATE", data_class: "LEARNER_COVERAGE_PERCENTAGES_BUCKETS_AND_UNKNOWN_LEMMAS_FOR_BEN_YEHUDA_OR_GRANTED_PERSONAL_TEXT", retention_tier: "PERSONAL", excludes: "NO_SOURCE_TEXT_BODY_NO_GRADES_NO_RAW_FSRS_NO_LLM_NO_NETWORK_PERSONAL_TEXT_REQUIRES_LIVE_GRANT", first_party_action: "/agent-access.html" }),
  "reading.group_corpus.read": Object.freeze({ capability: "get_group_reading_content", purpose: "RESTRICTED_GROUP_CORPUS_DISCOVERY_AND_READING", data_class: "GROUP_RESTRICTED_TEXT_TITLES_METADATA_AND_BOUNDED_HE_RU_WINDOWS", retention_tier: "CONTENT", excludes: "NO_OTHER_GROUPS_NO_LEARNER_STATE_NO_GRADES_ACTIVE_MEMBERSHIP_REQUIRED", first_party_action: "/library.html" }),
  "learner.group_coverage.read": Object.freeze({ capability: "get_group_text_coverage", purpose: "GROUP_TEXT_DIFFICULTY_AGAINST_YOUR_LEARNER_STATE", data_class: "GROUP_TEXT_COVERAGE_PERCENTAGES_BUCKETS_AND_UNKNOWN_LEMMAS", retention_tier: "PERSONAL", excludes: "NO_SOURCE_TEXT_BODY_NO_GRADES_NO_RAW_FSRS_NO_LLM_NO_NETWORK_ACTIVE_MEMBERSHIP_REQUIRED", first_party_action: "/agent-access.html" }),
  "intent.import_text.propose": Object.freeze({ capability: "propose_import_text", purpose: "AGENT_PROPOSES_PERSONAL_TEXT_IMPORT_OWNER_EXECUTES", data_class: "FULL_PROPOSED_HEBREW_TEXT_SOURCE_AND_DISCLOSURE", retention_tier: "PERSONAL", direction: "AGENT_WRITES_PROPOSAL_INTO_YOUR_ACCOUNT", internal_retention: PROPOSAL_POLICY.INTERNAL_RETENTION_NOTICE, excludes: "NO_IMPORT_BEFORE_OWNER_CONFIRM_BROWSER_OPFS_EXECUTION_ONLY", first_party_action: "/agent-access.html" }),
  "intent.track_word.propose": Object.freeze({ capability: "propose_track_word", purpose: "AGENT_PROPOSES_WORDS_OWNER_CONFIRMS_EACH", data_class: "WORDS_CONTEXT_EVIDENCE_AND_CAVEATS", retention_tier: "PERSONAL", direction: "AGENT_WRITES_PROPOSAL_INTO_YOUR_ACCOUNT", internal_retention: PROPOSAL_POLICY.INTERNAL_RETENTION_NOTICE, excludes: "NO_MASTERY_NO_GRADE_NO_FSRS_NO_EXECUTION_BEFORE_OWNER_CONFIRM", first_party_action: "/agent-access.html" }),
  "intent.goal.propose": Object.freeze({ capability: "propose_goal", purpose: "AGENT_PROPOSES_WEEKLY_GOAL_OWNER_CONFIRMS", data_class: "GOAL_STATEMENT_TYPE_ANCHOR_PERIOD_REASON", retention_tier: "CONTENT", direction: "AGENT_WRITES_PROPOSAL_INTO_YOUR_ACCOUNT", internal_retention: PROPOSAL_POLICY.INTERNAL_RETENTION_NOTICE, excludes: "NO_GOAL_WRITE_BEFORE_OWNER_CONFIRM_NO_AGENT_COMPLETION", first_party_action: "/agent-access.html" }),
  "goal.read": Object.freeze({ capability: "get_current_goal", purpose: "READ_CURRENT_OWNER_CONFIRMED_WEEKLY_GOAL", data_class: "ACTIVE_GOAL_STATEMENT_TYPE_ANCHOR_AND_STATUS", retention_tier: "CONTENT", excludes: "NO_HISTORY_NO_AGENT_COMPLETION_NO_GRADES", first_party_action: "/agent-access.html" }),
  "reading.publication.catalog.read": Object.freeze({ capability: "list_published_public_corpora", purpose: "DISCOVER_OWNER_APPROVED_PUBLICATION_ITEMS", data_class: "IMMUTABLE_CORPUS_EDITION_AND_ITEM_METADATA", retention_tier: "AGGREGATE", excludes: "NO_PRIVATE_OR_GROUP_CORPORA_NO_LEARNER_STATE_PUBLIC_READ_DOES_NOT_IMPLY_AGENT_ACCESS", first_party_action: "/library.html" }),
  "reading.publication.item.read": Object.freeze({ capability: "read_published_text_window", purpose: "READ_OWNER_APPROVED_PUBLICATION_TEXT_WINDOWS", data_class: "PUBLICATION_TEXT_HE_RU_AND_IMMUTABLE_ANCHORS", retention_tier: "CONTENT", excludes: "NO_NOTES_PROGRESS_STUDY_HISTORY_PRIVATE_OR_GROUP_TEXT_NO_SILENT_EDITION_REBIND", first_party_action: "/library.html" }),
  "reading.publication.resource.read": Object.freeze({ capability: "list_published_item_resources", purpose: "READ_OWNER_APPROVED_RESOURCE_DESCRIPTORS", data_class: "CANONICAL_HTTPS_URL_MIME_BYTES_SHA256_AND_PINNED_RESOURCE_ID", retention_tier: "AGGREGATE", excludes: "NO_BINARY_IN_MCP_NO_SERVER_FETCH_NO_PREVIEW_NO_PACKAGE_OR_DERIVATIVE_WITHOUT_SEPARATE_RIGHT", first_party_action: "/library.html" }),
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
        // Fail-closed: an un-presented scope must never render approvable. S1 (ревизия по критике):
        // tier валидируется по ENUM — «любая непустая строка» открывала тихое занижение карты.
        const presentation = SCOPE_PRESENTATION[scope];
        if (!presentation || !presentation.data_class || tierRank(presentation.retention_tier) < 0) error("AA_CONSENT_SCOPE_UNPRESENTED");
        return Object.freeze({
          scope,
          ...presentation,
          downstream_retention: presentation.downstream_retention_override
            || (presentation.retention_tier === "PERSONAL"
              ? "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO_PERSONAL_TEXTS_IRRECOVERABLE"
              : presentation.retention_tier === "CONTENT"
                ? "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO_CONTENT_IRRECOVERABLE"
                : "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO"),
        });
      })),
      // Roll-up = МАКСИМАЛЬНЫЙ tier (критика: бинарный CONTENT?:AGGREGATE занижал бы карту
      // при PERSONAL-scope — хуже, чем отсутствие карты).
      retention_tier: RETENTION_TIERS[Math.max(0, ...row.requested_scopes.map((scope) => tierRank((SCOPE_PRESENTATION[scope] || {}).retention_tier)))],
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
  RETENTION_TIERS,
  SCOPE_PRESENTATION,
  createConsentCeremony,
  opaqueRequestId,
};
