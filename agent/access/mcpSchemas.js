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
const number = (minimum, maximum) => Object.freeze({ type: "number", minimum, maximum });

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
  get_reading_content: closedObject({ work_id: string({ maxLength: 8, pattern: "^\\d{1,8}$" }), text_key: string({ maxLength: 64, pattern: "^[a-f0-9]{16,64}$" }), start: integer(0, 1000000), rows: integer(1, 20) }, ["work_id"]),
  create_reading_handoff: closedObject({ work_id: string({ maxLength: 8, pattern: "^\\d{1,8}$" }), text_key: string({ maxLength: 64, pattern: "^[a-f0-9]{16,64}$" }), order_index: integer(0, 1000000) }, ["work_id"]),
  // Stable superset schema (per-kind oneOf is brittle for schema-caching MCP
  // clients); the server contract validator enforces exact per-kind closedness:
  // open_reading={work_id!,text_key?,order_index?,reason?} note={body!,title?}
  // suggestion={body!}. No dedupe field exists — the server derives idempotency.
  propose_action: closedObject({
    kind: string({ enum: Object.freeze(["open_reading", "note", "suggestion"]) }),
    payload: closedObject({
      work_id: string({ maxLength: 8, pattern: "^\\d{1,8}$" }),
      text_key: string({ maxLength: 64, pattern: "^[a-f0-9]{16,64}$" }),
      order_index: integer(0, 1000000),
      reason: string({ maxLength: 280 }),
      title: string({ maxLength: 160 }),
      body: string({ maxLength: 2000 }),
    }, []),
  }, ["kind", "payload"]),
  get_progress_delta: closedObject({
    since: string({ maxLength: 40, pattern: TIME }),
    top_limit: integer(1, 20),
  }, ["since"]),
  create_review_handoff: closedObject({}, []),
  // S1 — каталог личных текстов (cursor-пагинация; личные ключи ≠ корпусный hex-паттерн).
  list_personal_texts: closedObject({ limit: integer(1, 100), cursor: string({ maxLength: 256, pattern: "^[A-Za-z0-9_.~:@/+\\-=]{1,256}$" }) }, []),
  // S2 — окно тела личного текста (по гранту владельца).
  get_personal_text_content: closedObject({ text_key: string({ maxLength: 200, pattern: "^[A-Za-z0-9._:-]{1,200}$" }), from: integer(0, 1000000), rows: integer(1, 20) }, ["text_key"]),
  get_word_morphology: closedObject({
    word: string({ minLength: 1, maxLength: 40, pattern: "^[֑-ׇא-ת׳״'-]{1,40}$" }),
    context_sentence: string({ maxLength: 280 }),
  }, ["word"]),
  get_text_coverage: closedObject({
    target: closedObject({
      work_id: string({ maxLength: 8, pattern: "^\\d{1,8}$" }),
      text_key: string({ maxLength: 200, pattern: "^[A-Za-z0-9._:-]{1,200}$" }),
    }, []),
    top_unknown_limit: integer(1, 20),
  }, ["target"]),
  search_group_reading_catalog: closedObject({
    corpus_id: string({ maxLength: 128, pattern: "^[A-Za-z0-9_.:-]{1,128}$" }),
    query: string({ maxLength: 160 }),
    level: string({ maxLength: 40 }),
    tag: string({ maxLength: 80 }),
    audio: string({ enum: Object.freeze(["ANY", "AVAILABLE", "UNAVAILABLE"]) }),
    sort: string({ enum: Object.freeze(["RELEVANCE", "POSITION", "TITLE", "ROWS_ASC", "ROWS_DESC"]) }),
    cursor: string({ maxLength: 6, pattern: "^\\d{1,6}$" }),
    limit: integer(1, 20),
  }, ["audio", "sort", "limit"]),
  get_group_reading_content: closedObject({
    corpus_id: string({ maxLength: 128, pattern: "^[A-Za-z0-9_.:-]{1,128}$" }),
    work_id: string({ maxLength: 128, pattern: "^[A-Za-z0-9_.:-]{1,128}$" }),
    start: integer(0, 1000000),
    rows: integer(1, 20),
  }, ["corpus_id", "work_id"]),
  get_group_text_coverage: closedObject({
    corpus_id: string({ maxLength: 128, pattern: "^[A-Za-z0-9_.:-]{1,128}$" }),
    work_id: string({ maxLength: 128, pattern: "^[A-Za-z0-9_.:-]{1,128}$" }),
    top_unknown_limit: integer(1, 20),
  }, ["corpus_id", "work_id"]),
  propose_import_text: closedObject({
    source: closedObject({
      url: string({ maxLength: 500 }), title: string({ maxLength: 200 }), author: string({ maxLength: 120 }),
      origin: string({ enum: Object.freeze(["LRCLIB", "YOUTUBE_TRANSCRIPT", "SEFARIA", "AGENT_COMPOSED", "OWNER_SUPPLIED", "OTHER"]) }),
    }, ["title", "origin"]),
    body_preview: string({ minLength: 1, maxLength: 4000 }), language: string({ const: "he" }),
    niqqud_status: string({ enum: Object.freeze(["NONE", "PARTIAL", "FULL", "MACHINE_ADDED"]) }),
    transformation_disclosure: string({ maxLength: 500 }), reason: string({ minLength: 1, maxLength: 280 }),
  }, ["source", "body_preview", "language", "niqqud_status", "reason"]),
  propose_track_word: closedObject({
    items: Object.freeze({ type: "array", minItems: 1, maxItems: 10, items: closedObject({
      surface: string({ minLength: 1, maxLength: 40 }), lemma_hint: string({ maxLength: 40 }),
      evidence: string({ enum: Object.freeze(["USER_PRODUCED_SPEECH", "USER_PRODUCED_TEXT", "AGENT_SHOWN_ONLY", "USER_ASKED_ABOUT"]) }),
      caveat: Object.freeze({ anyOf: Object.freeze([string({ enum: Object.freeze(["POSSIBLE_ASR_ERROR", "POSSIBLE_MORPH_AMBIGUITY", "STYLE_SUGGESTION"]) }), Object.freeze({ type: "null" })]) }),
      context_snippet: string({ maxLength: 200 }), reason: string({ minLength: 1, maxLength: 200 }),
    }, ["surface", "evidence", "reason"]) }),
  }, ["items"]),
  propose_goal: closedObject({
    statement: string({ minLength: 1, maxLength: 280 }), goal_type: string({ enum: Object.freeze(["PROCESS", "OUTCOME"]) }),
    anchor: string({ maxLength: 280 }), period_days: integer(7, 14), reason: string({ minLength: 1, maxLength: 200 }),
  }, ["statement", "goal_type", "period_days", "reason"]),
  get_current_goal: closedObject({}, []),
  list_published_public_corpora: closedObject({
    cursor: string({ maxLength: 512, pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$" }), limit: integer(1, 20),
  }, []),
  search_published_public_items: closedObject({
    corpus_slug: string({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
    edition_id: string({ maxLength: 128, pattern: ID }), query: string({ maxLength: 160 }),
    cursor: string({ maxLength: 512, pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$" }), limit: integer(1, 20),
  }, ["corpus_slug", "edition_id"]),
  get_published_public_item: closedObject({
    corpus_slug: string({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }), edition_id: string({ maxLength: 128, pattern: ID }),
    edition_item_id: string({ maxLength: 128, pattern: ID }),
  }, ["corpus_slug", "edition_id", "edition_item_id"]),
  list_published_item_resources: closedObject({
    corpus_slug: string({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }), edition_id: string({ maxLength: 128, pattern: ID }),
    edition_item_id: string({ maxLength: 128, pattern: ID }), cursor: string({ maxLength: 512, pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$" }), limit: integer(1, 20),
  }, ["corpus_slug", "edition_id", "edition_item_id"]),
  read_published_text_window: closedObject({
    corpus_slug: string({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }), edition_id: string({ maxLength: 128, pattern: ID }),
    edition_item_id: string({ maxLength: 128, pattern: ID }), start: integer(0, 1000000), rows: integer(1, 20),
  }, ["corpus_slug", "edition_id", "edition_item_id"]),
  read_published_learning_support: closedObject({
    corpus_slug: string({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }), edition_id: string({ maxLength: 128, pattern: ID }),
    edition_item_id: string({ maxLength: 128, pattern: ID }),
  }, ["corpus_slug", "edition_id", "edition_item_id"]),
});

const timestamp = string({ maxLength: 40, pattern: TIME });
const id = string({ maxLength: 128, pattern: ID });
const hash = string({ minLength: 64, maxLength: 64, pattern: "^[0-9a-f]{64}$" });
const nullableId = Object.freeze({ anyOf: Object.freeze([id, Object.freeze({ type: "null" })]) });
const nullableString = maxLength => Object.freeze({ anyOf: Object.freeze([string({ maxLength }), Object.freeze({ type: "null" })]) });
const publicationItem = closedObject({
  corpus_id: id, corpus_slug: string({ maxLength: 80 }), corpus_title: string({ maxLength: 500 }),
  edition_id: id, edition_number: integer(1, 1000000), manifest_sha256: hash,
  edition_item_id: id, public_work_id: string({ maxLength: 160 }), position_no: integer(1, 1000000),
  title: string({ maxLength: 500 }), creator: nullableString(300), snapshot_sha256: hash,
});
// Frozen by the schema-caching contract: get_agent_connection existed before
// H2.1, so its granted_scopes enum cannot grow when a new capability is added.
// New scopes are discoverable through OAuth metadata/consent and their own
// additive tool definitions; mutating this enum breaks already-open clients.
const CONNECTION_SCHEMA_SCOPES = Object.freeze([
  "learning.brief.read", "review.summary.read", "reading.public.search",
  "explanations.metadata.read", "agent.connection.read", "agent.connection.read",
  "review.items.read", "profile.read", "explanations.body.read",
  "reading.corpus.read", "reading.handoff.create", "intent.propose",
  "review.activity.read", "review.handoff.create", "personal.texts.metadata.read",
  "personal.texts.content.read",
]);
const scope = string({ enum: CONNECTION_SCHEMA_SCOPES });
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
  get_reading_content: closedObject({
    schema_version: string({ const: "aa.reading_content.1.0.0" }),
    work: closedObject({ title: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 200 }), Object.freeze({ type: "null" })]) }), author: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 200 }), Object.freeze({ type: "null" })]) }), era: Object.freeze({ anyOf: Object.freeze([string({ enum: Object.freeze(["BIBLICAL", "RABBINIC", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"]) }), Object.freeze({ type: "null" })]) }), license: string({ const: "public-domain" }) }),
    anchor: closedObject({ work_id: string({ maxLength: 8 }), text_key: string({ maxLength: 64 }), start_order_index: integer(0, 1000000), row_count: integer(0, 20) }),
    rows: Object.freeze({ type: "array", maxItems: 20, items: closedObject({ order_index: integer(0, 1000000), he: string({ maxLength: 400 }), ru: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 400 }), Object.freeze({ type: "null" })]) }) }) }),
    available_text_keys: Object.freeze({ type: "array", maxItems: 20, items: string({ maxLength: 64 }) }),
    generated_at: timestamp,
  }),
  create_reading_handoff: closedObject({
    schema_version: string({ const: "aa.reading_handoff.1.0.0" }),
    handoff_url: string({ maxLength: 256 }), expires_in_ms: integer(1, 3600000),
    work_id: string({ maxLength: 8 }), text_key: string({ maxLength: 64 }), action: string({ const: "open_corpus" }), generated_at: timestamp,
  }),
  propose_action: closedObject({
    schema_version: string({ const: "aa.proposal.1.0.0" }),
    proposal_id: string({ maxLength: 40, pattern: "^ap_[a-f0-9]{32}$" }),
    kind: string({ enum: Object.freeze(["open_reading", "note", "suggestion"]) }),
    status: string({ enum: Object.freeze(["PENDING", "DENIED"]) }),
    expires_at: timestamp, generated_at: timestamp,
  }),
  propose_import_text: closedObject({
    schema_version: string({ const: "aa.propose_import_text.1.0.0" }), proposal_id: string({ maxLength: 40, pattern: "^ap_[a-f0-9]{32}$" }),
    status: string({ enum: Object.freeze(["PENDING", "DUPLICATE"]) }), duplicate_of_text_key: string({ maxLength: 200 }), generated_at: timestamp,
  }, ["schema_version", "proposal_id", "status", "generated_at"]),
  propose_track_word: closedObject({
    schema_version: string({ const: "aa.propose_track_word.1.0.0" }), proposal_id: string({ maxLength: 40, pattern: "^ap_[a-f0-9]{32}$" }),
    status: string({ enum: Object.freeze(["PENDING", "DUPLICATE"]) }),
    per_item: Object.freeze({ type: "array", minItems: 1, maxItems: 10, items: closedObject({ surface: string({ maxLength: 40 }), resolution: string({ enum: Object.freeze(["RESOLVED", "UNRESOLVED_IN_DICTIONARY"]) }) }) }), generated_at: timestamp,
  }),
  propose_goal: closedObject({
    schema_version: string({ const: "aa.propose_goal.1.0.0" }), proposal_id: string({ maxLength: 40, pattern: "^ap_[a-f0-9]{32}$" }),
    status: string({ enum: Object.freeze(["PENDING", "DUPLICATE"]) }), generated_at: timestamp,
  }),
  get_current_goal: closedObject({
    schema_version: string({ const: "aa.current_goal.1.0.0" }),
    goal: Object.freeze({ anyOf: Object.freeze([closedObject({ statement: string({ maxLength: 280 }), goal_type: string({ enum: Object.freeze(["PROCESS", "OUTCOME"]) }), anchor: string({ maxLength: 280 }), week_start: string({ maxLength: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), status: string({ enum: Object.freeze(["ACTIVE", "COMPLETED_SELF_REPORT", "DROPPED"]) }), source: string({ enum: Object.freeze(["OWNER", "AGENT_PROPOSED_OWNER_CONFIRMED"]) }) }, ["statement", "goal_type", "week_start", "status", "source"]), Object.freeze({ type: "null" })]) }),
    generated_at: timestamp,
  }),
  list_published_public_corpora: closedObject({
    schema_version: string({ const: "aa.published_public_corpora.1.0.0" }),
    corpora: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      corpus_id: id, slug: string({ maxLength: 80 }), title: string({ maxLength: 500 }), description: string({ maxLength: 4000 }),
      edition_id: id, edition_number: integer(1, 1000000), manifest_sha256: hash,
      item_count: integer(1, 1000000), asset_count: integer(0, 10000000), published_at: timestamp,
    }) }), next_cursor: nullableString(512), generated_at: timestamp,
  }),
  search_published_public_items: closedObject({
    schema_version: string({ const: "aa.published_public_items.1.0.0" }),
    items: Object.freeze({ type: "array", maxItems: 20, items: publicationItem }), next_cursor: nullableString(512), generated_at: timestamp,
  }),
  get_published_public_item: closedObject({
    schema_version: string({ const: "aa.published_public_item.1.0.0" }), item: publicationItem, generated_at: timestamp,
  }),
  list_published_item_resources: closedObject({
    schema_version: string({ const: "aa.published_item_resources.1.0.0" }), edition_id: id, edition_item_id: id,
    resources: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      resource_id: id, resource_kind: string({ enum: Object.freeze(["PUBLICATION_ASSET", "PDF"]) }),
      revision_id: nullableId, asset_key: nullableString(64), bytes: integer(1, 26214400), sha256: hash,
      mime: string({ maxLength: 120 }), url: string({ maxLength: 1000, pattern: "^https://" }),
    }) }), next_cursor: nullableString(512), generated_at: timestamp,
  }),
  read_published_text_window: closedObject({
    schema_version: string({ const: "aa.published_text_window.1.0.0" }), item: publicationItem,
    start_order_index: integer(0, 1000000), rows: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      order_index: integer(0, 1000000), he: string({ maxLength: 800 }), ru: nullableString(800),
    }) }), rows_total: integer(0, 1000000), has_more: Object.freeze({ type: "boolean" }), generated_at: timestamp,
  }),
  read_published_learning_support: closedObject({
    schema_version: string({ const: "aa.published_learning_support.1.0.0" }), item: publicationItem,
    task_number: string({ maxLength: 20 }), locale: string({ const: "ru" }),
    content_markdown: string({ maxLength: 20480 }), derivative_sha256: hash, generated_at: timestamp,
  }),
  get_progress_delta: closedObject({
    schema_version: string({ const: "aa.progress_delta.1.0.0" }),
    since: timestamp,
    reviews_total: integer(0, 1000000), skips_total: integer(0, 1000000),
    distinct_items: integer(0, 1000000), new_items_scheduled: integer(0, 1000000),
    active_days: integer(0, 100),
    by_channel: Object.freeze({ type: "array", maxItems: 8, items: closedObject({ channel: string({ maxLength: 16, pattern: "^[a-z0-9_-]{1,16}$" }), count: integer(1, 1000000) }) }),
    top_items: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      display: string({ maxLength: 64 }),
      gloss: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 120 }), Object.freeze({ type: "null" })]) }),
      times: integer(1, 1000000),
    }) }),
    generated_at: timestamp,
  }),
  create_review_handoff: closedObject({
    schema_version: string({ const: "aa.review_handoff.1.0.0" }),
    handoff_url: string({ maxLength: 256 }), expires_in_ms: integer(1, 3600000),
    action: string({ const: "open_review" }), generated_at: timestamp,
  }),
  // S2 — окно тела личного текста.
  get_personal_text_content: closedObject({
    schema_version: string({ const: "aa.personal_text_content.1.0.0" }),
    text_key: string({ maxLength: 200, pattern: "^[A-Za-z0-9._:-]{1,200}$" }),
    title: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 512 }), Object.freeze({ type: "null" })]) }),
    rows: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      order_index: integer(0, 1000000),
      he: string({ maxLength: 800 }),
      ru: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 800 }), Object.freeze({ type: "null" })]) }),
    }) }),
    rows_total: integer(0, 1000000),
    has_more: Object.freeze({ type: "boolean" }),
    content_updated_at: timestamp, replica_ingested_at: timestamp,
    authority: string({ const: "OWNER_DEVICE_CANONICAL" }),
    generated_at: timestamp,
  }),
  // S1 — каталог личных текстов: title nullable (битый payload = честный NULL одной строки).
  list_personal_texts: closedObject({
    schema_version: string({ const: "aa.personal_texts_list.1.0.0" }),
    items: Object.freeze({ type: "array", maxItems: 100, items: closedObject({
      text_key: string({ maxLength: 200, pattern: "^[A-Za-z0-9._:-]{1,200}$" }),
      title: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 512 }), Object.freeze({ type: "null" })]) }),
      rows_count: Object.freeze({ anyOf: Object.freeze([integer(0, 1000000), Object.freeze({ type: "null" })]) }),
      content_updated_at: timestamp, replica_ingested_at: timestamp,
    }) }),
    total: integer(0, 100000),
    next_cursor: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 256 }), Object.freeze({ type: "null" })]) }),
    authority: string({ const: "OWNER_DEVICE_CANONICAL" }),
    generated_at: timestamp,
  }),
  get_word_morphology: closedObject({
    schema_version: string({ const: "aa.word_morphology.1.0.0" }),
    resolution: string({ enum: Object.freeze(["EXACT", "AMBIGUOUS", "UNRESOLVED"]) }),
    entries: Object.freeze({ type: "array", maxItems: 5, items: closedObject({
      lemma: string({ maxLength: 80 }),
      root: string({ maxLength: 40 }),
      pos: string({ enum: Object.freeze(["adjective", "adverb", "conjunction", "interjection", "noun", "other", "preposition", "pronoun", "verb"]) }),
      binyan: string({ enum: Object.freeze(["hifil", "hitpael", "hufal", "nifal", "paal", "piel", "pual"]) }),
      mishkal: string({ maxLength: 40 }),
      gender: string({ enum: Object.freeze(["MASCULINE", "FEMININE"]) }),
      number: string({ enum: Object.freeze(["SINGULAR", "PLURAL"]) }),
      person: string({ enum: Object.freeze(["1", "2", "3"]) }),
      tense: string({ enum: Object.freeze(["PAST", "PRESENT", "FUTURE", "IMPERATIVE", "INFINITIVE"]) }),
      niqqud_form: string({ maxLength: 80 }),
      gloss_ru: string({ maxLength: 400 }),
      confidence: string({ enum: Object.freeze(["EXACT", "PROBABLE", "POSSIBLE"]) }),
      provenance: string({ const: "PEALIM_OFFLINE_V12" }),
    }, ["lemma", "pos", "confidence", "provenance"]) }),
    unresolved_reason: string({ enum: Object.freeze(["NOT_IN_DICTIONARY", "AMBIGUOUS_WITHOUT_CONTEXT", "NON_HEBREW"]) }),
    resolver_version: string({ maxLength: 80 }),
    dataset_version: string({ const: "pealim-infl-v12" }),
    generated_at: timestamp,
  }, ["schema_version", "resolution", "entries", "resolver_version", "dataset_version", "generated_at"]),
  get_text_coverage: closedObject({
    schema_version: string({ const: "aa.text_coverage.2.0.0" }),
    status: string({ enum: Object.freeze(["AVAILABLE", "AVAILABLE_LIMITED", "NEEDS_PROFILE", "NOT_PREPARED", "PENDING", "STALE", "UNSUPPORTED", "UNAVAILABLE"]) }),
    reason_code: string({ maxLength: 80 }),
    counts: Object.freeze({ anyOf: Object.freeze([closedObject({
      lexical_total: integer(0, 1000000), eligible_denominator: integer(0, 1000000), familiar: integer(0, 1000000),
      explicit_new: integer(0, 1000000), untracked: integer(0, 1000000), unresolved: integer(0, 1000000),
      ignored_excluded: integer(0, 1000000), proper_names_excluded: integer(0, 1000000),
    }), Object.freeze({ type: "null" })]) }),
    recorded_familiar_pct_lower_bound: Object.freeze({ anyOf: Object.freeze([number(0, 100), Object.freeze({ type: "null" })]) }),
    unresolved_uncertainty_pp: Object.freeze({ anyOf: Object.freeze([number(0, 100), Object.freeze({ type: "null" })]) }),
    rank_eligible: Object.freeze({ type: "boolean" }),
    top_unknown: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      lemma: string({ maxLength: 80 }), freq_in_text: integer(1, 1000000), gloss_ru: string({ maxLength: 400 }),
    }, ["lemma", "freq_in_text"]) }),
    learner_projection_version: string({ maxLength: 120 }),
    tokenizer_version: string({ maxLength: 80 }),
    resolver_version: string({ maxLength: 160 }),
    generated_at: timestamp,
  }),
  search_group_reading_catalog: closedObject({
    schema_version: string({ const: "aa.group_reading_search.1.0.0" }),
    results: Object.freeze({ type: "array", maxItems: 20, items: closedObject({
      corpus_id: id, corpus_title: string({ maxLength: 240 }), corpus_version: integer(1, 1000000),
      work_id: id, title: string({ maxLength: 500 }),
      artist: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 300 }), Object.freeze({ type: "null" })]) }),
      position_no: Object.freeze({ anyOf: Object.freeze([integer(0, 1000000), Object.freeze({ type: "null" })]) }),
      rows_count: integer(0, 1000000), audio_available: Object.freeze({ type: "boolean" }),
      level: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 40 }), Object.freeze({ type: "null" })]) }),
      topic: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 200 }), Object.freeze({ type: "null" })]) }),
      tags: Object.freeze({ type: "array", maxItems: 20, uniqueItems: true, items: string({ maxLength: 80 }) }),
      access: string({ const: "GROUP_RESTRICTED" }), first_party_path: string({ const: "/library.html" }),
    }) }),
    next_cursor: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 6, pattern: "^\\d{1,6}$" }), Object.freeze({ type: "null" })]) }),
    generated_at: timestamp,
  }),
  get_group_reading_content: closedObject({
    schema_version: string({ const: "aa.group_reading_content.1.0.0" }),
    corpus: closedObject({ corpus_id: id, title: string({ maxLength: 240 }), version: integer(1, 1000000), access: string({ const: "GROUP_RESTRICTED" }) }),
    work: closedObject({
      work_id: id, title: string({ maxLength: 500 }),
      artist: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 300 }), Object.freeze({ type: "null" })]) }),
      source_url: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 1000 }), Object.freeze({ type: "null" })]) }),
      rights_status: string({ enum: Object.freeze(["REVIEW_REQUIRED", "CLEARED"]) }),
    }),
    anchor: closedObject({ corpus_id: id, work_id: id, start_order_index: integer(0, 1000000), row_count: integer(0, 20) }),
    rows: Object.freeze({ type: "array", maxItems: 20, items: closedObject({ order_index: integer(0, 1000000), he: string({ maxLength: 800 }), ru: Object.freeze({ anyOf: Object.freeze([string({ maxLength: 800 }), Object.freeze({ type: "null" })]) }) }) }),
    rows_total: integer(0, 1000000), has_more: Object.freeze({ type: "boolean" }),
    authority: string({ const: "GROUP_CORPUS_SERVER_CANONICAL" }), generated_at: timestamp,
  }),
  get_group_text_coverage: closedObject({
    schema_version: string({ const: "aa.group_text_coverage.2.0.0" }),
    target: closedObject({ corpus_id: id, work_id: id, title: string({ maxLength: 500 }) }),
    status: string({ enum: Object.freeze(["AVAILABLE", "AVAILABLE_LIMITED", "NEEDS_PROFILE", "NOT_PREPARED", "PENDING", "STALE", "UNSUPPORTED", "UNAVAILABLE"]) }),
    reason_code: string({ maxLength: 80 }),
    counts: Object.freeze({ anyOf: Object.freeze([closedObject({
      lexical_total: integer(0, 1000000), eligible_denominator: integer(0, 1000000), familiar: integer(0, 1000000),
      explicit_new: integer(0, 1000000), untracked: integer(0, 1000000), unresolved: integer(0, 1000000),
      ignored_excluded: integer(0, 1000000), proper_names_excluded: integer(0, 1000000),
    }), Object.freeze({ type: "null" })]) }),
    recorded_familiar_pct_lower_bound: Object.freeze({ anyOf: Object.freeze([number(0, 100), Object.freeze({ type: "null" })]) }),
    unresolved_uncertainty_pp: Object.freeze({ anyOf: Object.freeze([number(0, 100), Object.freeze({ type: "null" })]) }),
    rank_eligible: Object.freeze({ type: "boolean" }),
    top_unknown: Object.freeze({ type: "array", maxItems: 20, items: closedObject({ lemma: string({ maxLength: 80 }), freq_in_text: integer(1, 1000000), gloss_ru: string({ maxLength: 400 }) }, ["lemma", "freq_in_text"]) }),
    learner_projection_version: string({ maxLength: 120 }), tokenizer_version: string({ maxLength: 80 }), resolver_version: string({ maxLength: 160 }), generated_at: timestamp,
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
  get_reading_content: "Return a bounded window of public-domain Reading Room corpus text by work_id (from search_public_reading_catalog). ONLY works with ready_state READY have text — search with ready:\"READY\" first; a METADATA_ONLY work_id returns AA_CORPUS_WORK_NOT_FOUND (not an outage; do not retry). Optional text_key (chapter), start, rows (1-20). Corpus only; never personal texts. available_text_keys lists the work's chapters.",
  create_reading_handoff: "Mint a single-use first-party link that opens a public-domain corpus work in the LinguistPro Reading Room. Input is a catalog work_id (optional text_key/order_index); the work must be READY (search with ready:\"READY\") — a METADATA_ONLY work returns AA_CORPUS_WORK_NOT_FOUND (not an outage; do not retry). Returns handoff_url on the canonical origin only. The owner clicks it — the agent never opens content itself.",
  propose_action: "Create a PENDING action proposal the owner reviews and confirms or denies inside LinguistPro; the agent never executes. kind=open_reading proposes opening a corpus work (payload: work_id required — must be a READY work from search_public_reading_catalog, else AA_PROPOSAL_WORK_NOT_FOUND; optional text_key/order_index/reason); kind=note stores an agent-authored note draft (payload: body required, optional title); kind=suggestion stores a free-form suggestion (payload: body). Identical re-proposals return the same proposal_id; a recently denied identical proposal returns status DENIED. Confirmation state is never returned through this tool.",
  get_progress_delta: "Return the owner's study-ACTIVITY delta since a timestamp (must be within the last 90 days, else AA_ACTIVITY_SINCE_OUT_OF_RANGE — do not retry): review/skip totals, distinct items reviewed, newly scheduled items, active days (owner-local calendar), practice-channel mix, and the most-reviewed words with meanings (top_limit 1-20, default 10). Pure activity — never grades, accuracy, struggle bands, or the raw memory model; days are folded in the owner's timezone (one truth with the in-app heatmap).",
  create_review_handoff: "Mint a single-use first-party link that opens the owner's due-review session in the Reading Room («открой мне повторение»). No input. Refuses with AA_REVIEW_NOTHING_SCHEDULED (do not retry) only when the owner has no scheduled words at all; with zero due-now but scheduled words the link still works — the Room honestly offers ahead-of-schedule training. The owner clicks the link; answers are recorded first-party by LinguistPro and the agent never sees them.",
  list_personal_texts: "List the owner's own synced personal texts (title, size, freshness) from the server replica — a CATALOG only, never text bodies, notes, grades or SRS state. The replica is Last-Write-Wins from the owner's devices (authority OWNER_DEVICE_CANONICAL): it can lag the device and may contain fewer texts than exist locally. Page with limit (1-100) + cursor. Typed refusals (do not retry): AA_PERSONAL_TEXTS_CONSENT_REQUIRED — the owner has not enabled text sync; AA_PERSONAL_TEXTS_RECONSENT_REQUIRED — the owner must re-confirm the updated sync consent card in the Reading Room; AA_PERSONAL_TEXTS_NOT_SYNCED — sync is on but no texts have reached the server yet (or all were deleted).",
  get_personal_text_content: "Read a bounded window (rows 1-20, from = start order_index) of ONE of the owner's own texts by text_key (from list_personal_texts): Hebrew + Russian lines and the title. Requires, beyond the scope, a LIVE owner-issued text grant from the agent-access panel — typed refusals (do not retry): AA_TEXT_ACCESS_NOT_GRANTED / AA_TEXT_ACCESS_EXPIRED — ask the owner to (re)issue the grant in /agent-access.html; AA_PERSONAL_TEXT_NOT_FOUND — no such text in the replica; AA_ARTIFACT_UNREADABLE — the stored copy is malformed (owner should re-sync); consent refusals as in list_personal_texts. Long rows are byte-trimmed and the window may shrink to fit the byte cap — follow has_more with a new `from`. Never returns notes, grades or SRS state; reads are logged as bounded window metadata (30-day exposure ledger, no content) so challenges on sentences the agent actually read are provenance-marked agent-exposed (grading stays first-party).",
  get_word_morphology: "Ground a Hebrew morphology claim in the shipped offline Pealim v12 dataset. Call this BEFORE asserting a lemma, root, binyan, inflected form, gender, number, person, or tense. EXACT is returned only for a decisive unique dataset match; AMBIGUOUS returns the available homograph analyses (up to the contract cap) and must not be collapsed by the agent; UNRESOLVED means the dataset has no answer and the agent must say so rather than generate a paradigm. Optional context_sentence can only disambiguate when it carries a matching vocalized form. No LLM, Dicta request, network call, learner data, or synthesized form is used.",
  get_text_coverage: "Return an auditable lower bound for recorded familiar Hebrew tokens in one complete text. BOTH source classes are supported: target.work_id is baked public-domain Ben-Yehuda; target.text_key is one owner-synced personal text and requires its live per-connection grant. Counts expose the exact familiar/new/untracked/unresolved denominator; ignore and safely identified proper names are excluded. This is observed learner-record coverage, not a promise of comprehension, CEFR level, or a 95-98 readiness band. Ambiguity remains unresolved; no LLM, source-body output, grade, or raw FSRS field is used.",
  search_group_reading_catalog: "Search metadata of server-hosted GROUP_RESTRICTED corpora that the current LinguistPro account can access through ACTIVE group membership. Search title, artist, topic, tags, level or Position; optionally restrict corpus_id. Returns metadata and protected first-party anchors only, never text bodies, audio, learner state or another group's existence. AA_NOT_FOUND means the corpus is absent or membership is inactive; do not infer which.",
  get_group_reading_content: "Read a bounded 1-20 row Hebrew/Russian window from a GROUP_RESTRICTED work returned by search_group_reading_catalog. ACTIVE membership is rechecked on every call, so revocation closes access immediately. The server corpus is authoritative for shared content; personal progress, notes, grades, FSRS and audio bytes are never returned. Do not reproduce or aggregate the complete restricted corpus outside the owner's explicit learning request.",
  get_group_text_coverage: "Return the same auditable recorded-familiarity lower bound for one GROUP_RESTRICTED work. ACTIVE membership is rechecked on every call. Exact counts and unresolved uncertainty may support relative ordering only when rank_eligible=true; they do not promise comprehension or a fixed readiness threshold. Never returns the source body, grades, or raw FSRS fields.",
  propose_import_text: "Create a 14-day PENDING proposal to import one Hebrew text into the owner's personal device library. The agent never imports. The owner sees the complete body, source URL, niqqud and transformation disclosure; after confirmation the first-party browser executes through OPFS and the server confirms only after a receipt. External origins require URL. Identical content returns DUPLICATE with the same proposal_id.",
  propose_track_word: "Create a 14-day PENDING proposal for 1-10 Hebrew words. Each item records whether the user produced, saw or asked about it and any ASR/morphology caveat. The owner confirms words one by one; only dictionary-resolved canonical item keys execute in the first-party browser. No grades, mastery or FSRS state is written by the agent.",
  propose_goal: "Create a 14-day PENDING weekly-goal proposal. The owner reviews statement, PROCESS/OUTCOME type, optional anchor and 7-14 day period. Only owner confirmation writes the server goal store; the agent never marks completion.",
  get_current_goal: "Return the owner's single ACTIVE weekly goal or goal:null. Read-only; completion and deletion are owner-only first-party actions.",
  list_published_public_corpora: "List only current immutable public-corpus editions with an explicit publication-local agent DISCOVER right (or an existing Physics AGENT_READ resource fact). Public browser access alone never authorizes this tool.",
  search_published_public_items: "Search owner-approved items inside one explicitly pinned current edition. The cursor is bound to corpus, edition and query; a new edition is never silently substituted.",
  get_published_public_item: "Return immutable corpus, edition and item identity metadata for one owner-approved published item. No source body, learner state, notes, group data or private data is returned.",
  list_published_item_resources: "Return bounded HTTPS descriptors for owner-approved source resources: stable IDs, MIME, bytes and SHA-256. Binary/base64, previews, server fetches, packages and unapproved derivatives are never returned through MCP.",
  read_published_text_window: "Return at most 20 rows and 16 KiB from an explicitly SOURCE_TEXT-approved immutable publication item. Only library text is projected; notes, progress, bookmarks and review_log are structurally excluded.",
  read_published_learning_support: "Return one owner-reviewed, task-pinned STEM learning derivative only after an explicit DERIVATIVE_TEXT right. The Markdown contains the canonical condition, reviewed solution, checks and provenance; it never contains learner state, grades, notes or private/group data. Use it as the grounding source when explaining the selected task, and do not invent missing facts.",
});

const WRITE_TOOLS = Object.freeze(new Set(["create_reading_handoff", "create_review_handoff", "propose_action", "propose_import_text", "propose_track_word", "propose_goal"]));
// Mint tools are NOT idempotent: an auto-retrying client would mint live tokens
// against the cap + rate limit (adversarial critique). propose_action stays
// idempotent by server-side dedupe.
const MINT_TOOLS = Object.freeze(new Set(["create_reading_handoff", "create_review_handoff"]));
function toolDefinitions() {
  return Object.freeze(Object.keys(CAPABILITIES).map((name) => Object.freeze({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: INPUT_SCHEMAS[name],
    outputSchema: OUTPUT_SCHEMAS[name],
    annotations: Object.freeze({ readOnlyHint: !WRITE_TOOLS.has(name), destructiveHint: false, idempotentHint: !MINT_TOOLS.has(name), openWorldHint: name === "search_public_reading_catalog" }),
  })));
}

module.exports = { INPUT_SCHEMAS, OUTPUT_SCHEMAS, DESCRIPTIONS, WRITE_TOOLS, toolDefinitions };
