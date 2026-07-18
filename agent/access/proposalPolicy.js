"use strict";

// AA3 commit 3c — single source of truth for the agent-proposal lifecycle
// bounds. Imported by BOTH db/agentProposalsRepo.js (enforcement) and
// agent/access/consentCeremony.js (consent presentation), so the retention
// promise shown at consent time and the sweep that enforces it can never
// drift apart (feedback_config_string_match_by_construction).

const PROPOSAL_KINDS = Object.freeze(["open_reading", "note", "suggestion"]);
const PENDING_TTL_DAYS = 7;          // un-decided proposals expire
const PENDING_CAP = 10;              // live PENDING per user (R17: panel-nag bound)
const DENY_COOLDOWN_DAYS = 7;        // identical re-propose after DENIED returns the denial
const PURGE_DECIDED_DAYS = 90;       // DENIED + EXPIRED rows physically purge
const BLANK_CONFIRMED_DAYS = 180;    // CONFIRMED payload text blanks (skeleton stays)
const PURGE_CONFIRMED_DAYS = 365;    // CONFIRMED skeleton purges

// Shown verbatim in the intent.propose consent card (internal_retention).
const INTERNAL_RETENTION_NOTICE =
  `PENDING_${PENDING_TTL_DAYS}D_DENIED_EXPIRED_PURGE_${PURGE_DECIDED_DAYS}D_CONFIRMED_TEXT_${BLANK_CONFIRMED_DAYS}D_SKELETON_${PURGE_CONFIRMED_DAYS}D`;

module.exports = Object.freeze({
  PROPOSAL_KINDS,
  PENDING_TTL_DAYS,
  PENDING_CAP,
  DENY_COOLDOWN_DAYS,
  PURGE_DECIDED_DAYS,
  BLANK_CONFIRMED_DAYS,
  PURGE_CONFIRMED_DAYS,
  INTERNAL_RETENTION_NOTICE,
});
