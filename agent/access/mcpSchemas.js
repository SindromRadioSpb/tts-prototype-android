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
});

const timestamp = string({ maxLength: 40, pattern: TIME });
const id = string({ maxLength: 128, pattern: ID });
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
});

const WRITE_TOOLS = Object.freeze(new Set(["create_reading_handoff", "create_review_handoff", "propose_action"]));
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
