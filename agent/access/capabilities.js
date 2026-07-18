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
});

function getCapability(name) { return CAPABILITIES[String(name)] || null; }
function capabilityNames() { return Object.keys(CAPABILITIES); }

module.exports = { CAPABILITY_VERSION, CAPABILITIES, getCapability, capabilityNames };
