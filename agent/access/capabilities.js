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
});

function getCapability(name) { return CAPABILITIES[String(name)] || null; }
function capabilityNames() { return Object.keys(CAPABILITIES); }

module.exports = { CAPABILITY_VERSION, CAPABILITIES, getCapability, capabilityNames };
