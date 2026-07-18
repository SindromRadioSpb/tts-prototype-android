"use strict";

const { CAPABILITIES } = require("./capabilities");

const ID = "^[A-Za-z0-9_.:@/-]{1,128}$";
const TIME = "^\\d{4}-\\d{2}-\\d{2}T";
const closedObject = (properties, required = Object.keys(properties)) => Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: Object.freeze(properties),
  required: Object.freeze(required),
});
const string = (options = {}) => Object.freeze({ type: "string", ...options });
const integer = (minimum, maximum) => Object.freeze({ type: "integer", minimum, maximum });

const INPUT_SCHEMAS = Object.freeze({
  get_learning_brief: closedObject({}, []),
  get_review_summary: closedObject({}, []),
  search_public_reading_catalog: closedObject({
    query: string({ maxLength: 160 }),
    era: string({ enum: Object.freeze(["BIBLICAL", "RABBINIC", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"]) }),
    genre: string({ enum: Object.freeze(["PROSE", "POETRY", "ESSAY", "DRAMA", "CHILDREN", "REFERENCE", "OTHER", "UNKNOWN"]) }),
    language: string({ enum: Object.freeze(["he"]) }),
    audio: string({ enum: Object.freeze(["ANY", "AVAILABLE", "UNAVAILABLE"]) }),
    ready: string({ enum: Object.freeze(["ANY", "READY", "METADATA_ONLY"]) }),
    sort: string({ enum: Object.freeze(["RELEVANCE", "TITLE", "AUTHOR", "LENGTH_ASC", "LENGTH_DESC"]) }),
    cursor: string({ maxLength: 256, pattern: "^[A-Za-z0-9_.~:@/+\\-=]{1,256}$" }),
    limit: integer(1, 20),
  }, ["language", "audio", "ready", "sort", "limit"]),
  get_recent_explanation_metadata: closedObject({
    before: string({ maxLength: 40, pattern: TIME }),
    kinds: Object.freeze({ type: "array", maxItems: 4, uniqueItems: true, items: string({ enum: Object.freeze(["sentence", "word", "study_summary", "draft_retell"]) }) }),
    limit: integer(1, 20),
  }, ["kinds", "limit"]),
  get_agent_connection: closedObject({}, []),
  get_access_window: closedObject({}, []),
  get_due_review_items: closedObject({ limit: integer(1, 100), cursor: string({ maxLength: 256, pattern: "^[A-Za-z0-9_.~:@/+\\-=]{1,256}$" }) }, []),
  get_learner_profile: closedObject({}, []),
  get_explanation_body: closedObject({ explanation_id: string({ maxLength: 128, pattern: ID }) }, ["explanation_id"]),
});

const timestamp = string({ maxLength: 40, pattern: TIME });
const id = string({ maxLength: 128, pattern: ID });
const scope = string({ enum: Object.freeze(Object.values(CAPABILITIES).map((entry) => entry.scope)) });
const connectionState = string({ enum: Object.freeze(["ACTIVE", "SCOPE_REDUCED", "SUSPENDED", "REVOKED"]) });

const OUTPUT_SCHEMAS = Object.freeze({
  get_learning_brief: closedObject({
    schema_version: string({ const: "aa.learning_brief.1.0.0" }), due_total: integer(0, 100000), urgent_total: integer(0, 100000),
    scheduled_total: integer(0, 100000), estimated_minutes: integer(0, 120),
    priority_code: string({ enum: Object.freeze(["REVIEW_DUE", "READING_AVAILABLE", "MENTOR_AVAILABLE", "NO_CURRENT_ACTION"]) }),
    unfinished_action_code: string({ enum: Object.freeze(["READING_AVAILABLE", "REVIEW_AVAILABLE", "MENTOR_AVAILABLE", "NONE"]) }),
    generated_at: timestamp, expires_at: timestamp,
  }),
  get_review_summary: closedObject({
    schema_version: string({ const: "aa.review_summary.1.0.0" }), due_total: integer(0, 100000), urgent_total: integer(0, 100000),
    estimated_minutes: integer(0, 120), handoff_eligible: Object.freeze({ type: "boolean", const: false }),
    handoff_scope_available: Object.freeze({ type: "boolean", const: false }), generated_at: timestamp, expires_at: timestamp,
  }),
  search_public_reading_catalog: closedObject({
    schema_version: string({ const: "aa.public_reading_search.1.0.0" }), catalog_version: id,
    results: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      work_id: id, title: string({ maxLength: 240 }), author: string({ maxLength: 200 }),
      era: string({ enum: Object.freeze(["BIBLICAL", "RABBINIC", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"]) }),
      genre: string({ enum: Object.freeze(["PROSE", "POETRY", "ESSAY", "DRAMA", "CHILDREN", "REFERENCE", "OTHER", "UNKNOWN"]) }),
      language: string({ const: "he" }), sentence_count: integer(0, 1000000), audio_available: Object.freeze({ type: "boolean" }),
      ready_state: string({ enum: Object.freeze(["READY", "METADATA_ONLY"]) }), first_party_path: string({ const: "/library.html" }),
    }) }),
    next_cursor: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 256 }), Object.freeze({ type: "null" })]) }), generated_at: timestamp,
  }),
  get_recent_explanation_metadata: closedObject({
    schema_version: string({ const: "aa.explanation_metadata.1.0.0" }),
    items: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      explanation_id: id, created_at: timestamp,
      kind: string({ enum: Object.freeze(["sentence", "word", "study_summary", "draft_retell"]) }),
      construct_ids: Object.freeze({ type: "array", maxItems: 12, uniqueItems: true, items: id }),
      purge_state: string({ enum: Object.freeze(["AVAILABLE", "PURGED", "DELETED"]) }),
    }) }),
    next_before: Object.freeze({ anyOf: Object.freeze([timestamp, Object.freeze({ type: "null" })]) }), generated_at: timestamp,
  }),
  get_agent_connection: closedObject({
    schema_version: string({ const: "aa.connection.1.0.0" }), connection_id: id, oauth_client_id: id,
    client_display_name: string({ maxLength: 120 }), connection_status: connectionState,
    granted_scopes: Object.freeze({ type: "array", maxItems: 16, uniqueItems: true, items: scope }), access_expires_at: timestamp,
    consent_version: id, capability_version: string({ const: "aa-v0.1" }),
    downstream_retention_notice: string({ const: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO" }), generated_at: timestamp,
  }),
  get_access_window: closedObject({
    schema_version: string({ const: "aa.access_window.1.0.0" }),
    access_lifetime: string({ enum: Object.freeze(["PERSISTENT_WINDOW", "TIMED_WINDOW", "TOKEN_ONLY"]) }),
    window_expires_at: Object.freeze({ anyOf: Object.freeze([timestamp, Object.freeze({ type: "null" })]) }),
    access_expires_at: timestamp, generated_at: timestamp,
  }),
  get_due_review_items: closedObject({
    schema_version: string({ const: "aa.due_review_items.1.0.0" }),
    items: Object.freeze({ type: "array", maxItems: 100, items: closedObject({
      display: string({ maxLength: 64 }),
      gloss: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 120 }), Object.freeze({ type: "null" })]) }),
      struggle: string({ enum: Object.freeze(["none", "some", "high"]) }),
      due_day: string({ maxLength: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
      content_available: Object.freeze({ type: "boolean" }),
    }) }),
    due_total: integer(0, 100000),
    next_cursor: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 256 }), Object.freeze({ type: "null" })]) }),
    generated_at: timestamp,
  }),
  get_learner_profile: closedObject({
    schema_version: string({ const: "aa.learner_profile.1.0.0" }),
    mode: string({ enum: Object.freeze(["silent", "coach", "intensive"]) }),
    language: string({ maxLength: 8 }),
    depth: string({ enum: Object.freeze(["brief", "detailed"]) }),
    generated_at: timestamp,
  }),
  get_explanation_body: closedObject({
    schema_version: string({ const: "aa.explanation_body.1.0.0" }),
    explanation_id: id, created_at: timestamp,
    kind: Object.freeze({ anyOf: Object.freeze([string({ enum: Object.freeze(["sentence", "word", "study_summary", "draft_retell"]) }), Object.freeze({ type: "null" })]) }),
    purge_state: string({ enum: Object.freeze(["AVAILABLE", "PURGED"]) }),
    language: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 8 }), Object.freeze({ type: "null" })]) }),
    text: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 6000 }), Object.freeze({ type: "null" })]) }),
    lines: Object.freeze({ anyOf: Object.freeze([Object.freeze({ type: "array", maxItems: 8, items: closedObject({ he: string({ maxLength: 500 }), ru: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 500 }), Object.freeze({ type: "null" })]) }) }) }), Object.freeze({ type: "null" })]) }),
    generated_at: timestamp,
  }),
});

const DESCRIPTIONS = Object.freeze({
  get_learning_brief: "Return a bounded current learning brief with aggregate counts, closed action codes, and expiry only.",
  get_review_summary: "Return bounded review availability counts and duration only; never return review items, answers, or grades.",
  search_public_reading_catalog: "Search public Reading Room metadata only; never return corpus bodies, snippets, or learner-specific ranking.",
  get_recent_explanation_metadata: "Return bounded explanation history metadata only; never return explanation or source content.",
  get_agent_connection: "Return status, grants, and retention notice for the current Agent Access connection only. Note: access_expires_at is a short-lived access token that auto-refreshes; for the real access lifetime call get_access_window instead of treating access_expires_at as the connection expiry.",
  get_access_window: "Return whether access is a persistent window, a timed window (with expiry), or token-only — so the agent does not mistake the short access-token TTL for the connection lifetime.",
  get_due_review_items: "Return a page of the owner's due study words (most overdue first) with meaning and a coarse struggle band, for discussion. Page with limit (1-100) + cursor; next_cursor is null on the last page. Never returns the acceptance set, expected answer, or raw memory model; grading stays in LinguistPro.",
  get_learner_profile: "Return the owner's coarse learning profile (mode, language, depth) only; never free-text goals or identifiers.",
  get_explanation_body: "Return one past explanation's body by explanation_id (from get_recent_explanation_metadata): the mentor's own explanation text or retell lines. Returns purge_state PURGED with no content for revoked explanations; never returns the quoted source sentence.",
});

function toolDefinitions() {
  return Object.freeze(Object.keys(CAPABILITIES).map((name) => Object.freeze({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: INPUT_SCHEMAS[name],
    outputSchema: OUTPUT_SCHEMAS[name],
    annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: name === "search_public_reading_catalog" }),
  })));
}

module.exports = { INPUT_SCHEMAS, OUTPUT_SCHEMAS, DESCRIPTIONS, toolDefinitions };
