"use strict";

const VERSION = "role-registry.1.0.0";
const WORKFLOW_VERSION = "cp0-workflow.1.0.0";

// Allowed capability names are diagnostic boundaries, never permissions.
const SCENARIOS = Object.freeze({
  "agent.plan": { role: "mentor.planner", surfaces: ["pwa", "miniapp", "telegram"], capabilities: ["tool:*", "repo:agent_task", "model:generate"] },
  "agent.explain_sentence": { role: "mentor.explainer", surfaces: ["pwa"], capabilities: ["tool:*", "repo:explanation", "model:generate"] },
  "agent.explain_word": { role: "mentor.explainer", surfaces: ["pwa"], capabilities: ["tool:*", "repo:explanation", "model:generate"] },
  "agent.explain_followup": { role: "mentor.explainer", surfaces: ["pwa"], capabilities: ["tool:*", "repo:explanation", "model:generate"] },
  "agent.comprehension": { role: "mentor.comprehension_coach", surfaces: ["pwa"], capabilities: ["tool:*", "model:generate"] },
  "agent.roleplay_start": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: ["repo:scoped_read"] },
  "agent.roleplay_turn": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: ["repo:scoped_read", "model:generate"] },
  "agent.roleplay_state": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: [] },
  "agent.roleplay_stop": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: [] },
  "agent.writing_targets": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: ["repo:scoped_read"] },
  "agent.writing_review": { role: "mentor.dialogue_coach", surfaces: ["pwa"], capabilities: ["repo:scoped_read", "model:generate"] },
  "agent.study_summary": { role: "mentor.material_advisor", surfaces: ["pwa"], capabilities: ["tool:*", "repo:explanation", "model:generate"] },
  "agent.draft_retell": { role: "mentor.material_advisor", surfaces: ["pwa"], capabilities: ["tool:*", "model:generate"] },
  "agent.lesson_build": { role: "lesson.composer", surfaces: ["pwa"], capabilities: ["repo:scoped_read", "model:generate"] },
  "agent.next_text_explain": { role: "reading.recommender", surfaces: ["pwa"], capabilities: ["repo:scoped_read", "model:generate"] },
  "review.start": { role: "review.selector", surfaces: ["miniapp", "telegram"], capabilities: ["repo:challenge"] },
  "review.answer": { role: "review.grader", surfaces: ["miniapp", "telegram", "pwa"], capabilities: ["repo:challenge", "canonical:review_event"] },
  "review.skip": { role: "review.grader", surfaces: ["miniapp", "telegram"], capabilities: ["repo:challenge", "canonical:review_event"] },
  "review.hint": { role: "review.selector", surfaces: ["miniapp"], capabilities: ["repo:challenge"] },
  "review.annul": { role: "review.writer", surfaces: ["miniapp", "telegram", "pwa"], capabilities: ["canonical:review_event"] },
  "profile.update": { role: "profile.editor", surfaces: ["pwa"], capabilities: ["repo:profile"] },
  "notification.nudge": { role: "notification.policy", surfaces: ["background"], capabilities: ["repo:nudge_claim", "delivery:push", "delivery:telegram"] },
  "provider.byok_check": { role: "policy.controller", surfaces: ["pwa"], capabilities: ["model:generate"] },
  "memory.manage": { role: "memory.manager", surfaces: ["pwa"], capabilities: ["repo:memory"] },
  "memory.propose": { role: "memory.manager", surfaces: ["pwa"], capabilities: ["repo:memory"] },
  "memory.context_continue": { role: "memory.manager", surfaces: ["pwa"], capabilities: ["repo:memory_query"] },
  "memory.export": { role: "memory.manager", surfaces: ["pwa"], capabilities: ["repo:memory_export"] },
  "memory.delete": { role: "memory.manager", surfaces: ["pwa"], capabilities: ["repo:memory_delete"] },
  "evidence.scan": { role: "evidence.selector", surfaces: ["pwa"], capabilities: ["repo:evidence_read", "repo:public_corpus_read"] },
  "evidence.manage": { role: "evidence.manager", surfaces: ["pwa"], capabilities: ["repo:evidence"] },
  "evidence.attempt": { role: "evidence.evaluator.deterministic", surfaces: ["pwa"], capabilities: ["repo:evidence", "eval:deterministic"] },
  "evidence.context_offer": { role: "evidence.manager", surfaces: ["pwa"], capabilities: ["repo:evidence_query"] },
  "evidence.handoff_preview": { role: "evidence.reducer.shadow", surfaces: ["pwa"], capabilities: ["repo:evidence_query"] },
  "evidence.export": { role: "evidence.manager", surfaces: ["pwa"], capabilities: ["repo:evidence_export"] },
  "evidence.delete": { role: "evidence.manager", surfaces: ["pwa"], capabilities: ["repo:evidence_delete"] },
  "agent_access.learning_brief": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:bounded_aggregate_read"] },
  "agent_access.review_summary": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:bounded_aggregate_read"] },
  "agent_access.public_reading_search": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:public_corpus_read"] },
  "agent_access.explanation_metadata": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:explanation_metadata_read"] },
  "agent_access.connection_read": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:connection_self_read"] },
  "agent_access.access_window": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:connection_self_read"] },
  "agent_access.due_review_items": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:due_review_items_read"] },
  "agent_access.learner_profile": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:learner_profile_read"] },
  "agent_access.explanation_body": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:explanation_body_read"] },
  "agent_access.reading_content": { role: "agent_access.reader", surfaces: ["external_agent"], capabilities: ["repo:public_corpus_read"] },
  // Write-scenarios: the agent INITIATES, the owner/LinguistPro executes. A mint
  // is a write, so the role is proposer, not reader (R17: the domain smoke derives
  // the expected role per capability and asserts reader-scenarios only read).
  "agent_access.reading_handoff": { role: "agent_access.proposer", surfaces: ["external_agent"], capabilities: ["repo:reading_handoff_mint"] },
  "agent_access.propose_action": { role: "agent_access.proposer", surfaces: ["external_agent"], capabilities: ["repo:proposal_create"] },
});

function get(id) { return SCENARIOS[String(id)] || null; }
function ids() { return Object.keys(SCENARIOS); }

module.exports = { VERSION, WORKFLOW_VERSION, SCENARIOS, get, ids };
