"use strict";

const CAPABILITY_VERSION = "aa-v0.1";

const CAPABILITIES = Object.freeze({
  get_learning_brief: Object.freeze({ scope: "learning.brief.read", purpose: "EXPLICIT_CURRENT_LEARNING_BRIEF", scenario_id: "agent_access.learning_brief", max_output_bytes: 1024 }),
  get_review_summary: Object.freeze({ scope: "review.summary.read", purpose: "EXPLICIT_REVIEW_AVAILABILITY", scenario_id: "agent_access.review_summary", max_output_bytes: 768 }),
  search_public_reading_catalog: Object.freeze({ scope: "reading.public.search", purpose: "EXPLICIT_PUBLIC_CATALOG_SEARCH", scenario_id: "agent_access.public_reading_search", max_output_bytes: 12288 }),
  get_recent_explanation_metadata: Object.freeze({ scope: "explanations.metadata.read", purpose: "EXPLICIT_EXPLANATION_HISTORY_METADATA", scenario_id: "agent_access.explanation_metadata", max_output_bytes: 8192 }),
  get_agent_connection: Object.freeze({ scope: "agent.connection.read", purpose: "EXPLICIT_CONNECTION_STATUS", scenario_id: "agent_access.connection_read", max_output_bytes: 2048 }),
  get_access_window: Object.freeze({ scope: "agent.connection.read", purpose: "EXPLICIT_ACCESS_WINDOW", scenario_id: "agent_access.access_window", max_output_bytes: 512 }),
  // AA3 slice-1 (owner-approved, single-tenant personal use, deterministic grading kept first-party).
  get_due_review_items: Object.freeze({ scope: "review.items.read", purpose: "EXPLICIT_DUE_REVIEW_ITEMS", scenario_id: "agent_access.due_review_items", max_output_bytes: 24576 }),
  get_learner_profile: Object.freeze({ scope: "profile.read", purpose: "EXPLICIT_LEARNER_PROFILE", scenario_id: "agent_access.learner_profile", max_output_bytes: 512 }),
  // AA3 commit 3: read a single explanation's body (purge-aware).
  get_explanation_body: Object.freeze({ scope: "explanations.body.read", purpose: "EXPLICIT_EXPLANATION_BODY", scenario_id: "agent_access.explanation_body", max_output_bytes: 8192 }),
  // AA3 commit 3b: read public-domain corpus text.
  get_reading_content: Object.freeze({ scope: "reading.corpus.read", purpose: "EXPLICIT_CORPUS_READING", scenario_id: "agent_access.reading_content", max_output_bytes: 16384 }),
  // AA3 commit 3c: write-capability pair (agent initiates, LinguistPro/owner
  // executes). handoff_tokens carries work_id + library-ui handles open_corpus
  // since migration 045, so the hold on create_reading_handoff is lifted.
  create_reading_handoff: Object.freeze({ scope: "reading.handoff.create", purpose: "EXPLICIT_READING_HANDOFF_MINT", scenario_id: "agent_access.reading_handoff", max_output_bytes: 1024 }),
  propose_action: Object.freeze({ scope: "intent.propose", purpose: "EXPLICIT_ACTION_PROPOSAL", scenario_id: "agent_access.propose_action", max_output_bytes: 1024 }),
  // AA4 slice 4a: pure-activity delta («что изменилось») — no grades/accuracy/struggle.
  get_progress_delta: Object.freeze({ scope: "review.activity.read", purpose: "EXPLICIT_PROGRESS_DELTA", scenario_id: "agent_access.progress_delta", max_output_bytes: 8192 }),
  // AA4 slice 4b-final: «открой мне повторение» — anchor-less open_review handoff.
  create_review_handoff: Object.freeze({ scope: "review.handoff.create", purpose: "EXPLICIT_REVIEW_HANDOFF_MINT", scenario_id: "agent_access.review_handoff", max_output_bytes: 512 }),
  // S-пакет S1 — каталог личных текстов из sidecar-меты (PERSONAL_TEXTS_S1S2_DESIGN §1.2).
  // NB: CAPABILITY_VERSION НЕ бампится (критика: пин aa-v0.1 живёт в снапшотах подключений —
  // бамп молча кладёт либо новые подключения, либо старое Hermes; AA3/AA4 тоже не бампили).
  list_personal_texts: Object.freeze({ scope: "personal.texts.metadata.read", purpose: "EXPLICIT_PERSONAL_TEXTS_CATALOG", scenario_id: "agent_access.personal_texts_list", max_output_bytes: 24576 }),
  // S2 — тело личного текста: scope + ЖИВОЙ agent_text_grants владельца (третий слой в хендлере).
  get_personal_text_content: Object.freeze({ scope: "personal.texts.content.read", purpose: "EXPLICIT_PERSONAL_TEXT_BODY", scenario_id: "agent_access.personal_text_content", max_output_bytes: 16384 }),
  // H2.1 — deterministic morphology grounding over the shipped Pealim dataset.
  get_word_morphology: Object.freeze({ scope: "morphology.read", purpose: "EXPLICIT_WORD_MORPHOLOGY_GROUNDING", scenario_id: "agent_access.word_morphology", max_output_bytes: 8192 }),
  // H2.2 — deterministic learner coverage for public Ben-Yehuda works AND
  // consented owner-synced personal texts. No source body is returned.
  get_text_coverage: Object.freeze({ scope: "learner.coverage.read", purpose: "EXPLICIT_TEXT_COVERAGE_AGAINST_LEARNER_STATE", scenario_id: "agent_access.text_coverage", max_output_bytes: 8192 }),
  // Group Song Corpus — restricted server corpus. Catalog/content and learner
  // coverage are separate revocable scopes because the latter reveals the
  // owner's derived learning state in addition to group-restricted content.
  search_group_reading_catalog: Object.freeze({ scope: "reading.group_corpus.read", purpose: "EXPLICIT_GROUP_CORPUS_DISCOVERY", scenario_id: "agent_access.group_reading_search", max_output_bytes: 12288 }),
  get_group_reading_content: Object.freeze({ scope: "reading.group_corpus.read", purpose: "EXPLICIT_GROUP_CORPUS_READING", scenario_id: "agent_access.group_reading_content", max_output_bytes: 16384 }),
  get_group_text_coverage: Object.freeze({ scope: "learner.group_coverage.read", purpose: "EXPLICIT_GROUP_TEXT_COVERAGE_AGAINST_LEARNER_STATE", scenario_id: "agent_access.group_text_coverage", max_output_bytes: 8192 }),
});

function getCapability(name) { return CAPABILITIES[String(name)] || null; }
function capabilityNames() { return Object.keys(CAPABILITIES); }

module.exports = { CAPABILITY_VERSION, CAPABILITIES, getCapability, capabilityNames };
