# 18 — Confirmed Contextual Transfer implementation specification

**Status:** PROPOSED DETAILED DESIGN — REQUIRES SCHEMA/PRIVACY REVIEW; NOT IMPLEMENTED OR EDUCATIONALLY VALIDATED
**Source baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`
**Date:** 2026-07-11
**Required lenses:** R2, R3, R8, R9, R11–R17

## Purpose and non-claims

Confirmed Contextual Transfer (CCT) asks whether a learner can independently retrieve/use a previously encountered Hebrew knowledge unit after a delay, in a genuinely new context, on the first scored attempt without answer-revealing assistance.

CCT is not FSRS, a new `review_log.kind`, LLM proof, ordinary completion, engagement, same-context recall or a label inferred from one failure. `review_log` remains review-memory truth; `srs_projections` remains a rebuildable cache. Assignment, exposure, novelty, contamination and causal analysis live in separate experiment tables. A graded probe may append an ordinary `review_log` row with CCT references through the existing reviewer.

Retrieval research supports delayed retention/possible transfer but does not validate this product construct by itself ([Roediger & Karpicke](https://pubmed.ncbi.nlm.nih.gov/16507066/), [Butler](https://pubmed.ncbi.nlm.nih.gov/20804289/)). Missing assigned outcomes must remain visible; excluding them can destroy experimental equivalence ([WWC resources](https://ies.ed.gov/ncee/wwc/Handbooks)).

## Repository contracts reused

- Cloud migrations separate `review_log` from closed-vocabulary `learner_events`.
- `db/learnerLogRepo.js` provides user-scoped/idempotent append and metadata allowlisting.
- `db/learnerProjectionRepo.js` rebuilds derived FSRS state by ordered replay.
- Agent challenge migrations/repos already implement challenge binding, atomic claim, hint latch, surface/manual provenance and terminal replay.
- `agent/reviewer.js` derives expectation server-side, requires attempt idempotency, grades deterministically, demotes assisted evidence, supports annul and recomputes projections.
- `agent/constructs.js` uses a server registry; LLM cannot mint construct truth.

CCT must not create a parallel grader, trust client-supplied arm/unit/novelty/expected answer/grade, or dual-write projections.

## Locked construct

```text
CCT_confirmed = 1 iff
 assignment precedes treatment exposure
 ∧ unit/protocol versions are locked
 ∧ delay is inside the preregistered window
 ∧ source and target pass frozen novelty/contamination rules
 ∧ first scored attempt is unassisted
 ∧ independent locked grader passes the declared evidence scope
 ∧ source/attempt is not annulled.
```

Observed valid failure = `0`; no valid observation = `missing`; `ineligible` is allowed only for a condition fixed before outcome and locked by protocol. Primary ITT never silently drops abandonments, declines, unopened probes or unscorable attempts.

## Knowledge-unit identity

```json
{
  "knowledge_unit_id": "ku:lexeme:he:lemma:<canonical-item-key>",
  "version": 3,
  "kind": "lexeme_receptive_to_productive",
  "construct_id": "construct:hebrew.channel_gap.receptive_to_production",
  "item_key": "<LemmaCanon output>",
  "keyer_version": 1,
  "evidence_scope": "lexeme",
  "spec": {
    "accepted_form_ids": ["..."],
    "forbidden_cues": ["exact_surface", "full_translation"],
    "target_modality": "cloze"
  },
  "content_hash": "sha256(canonical-json)"
}
```

Identity is `(knowledge_unit_id, version)`. Published versions are immutable; changes mint a version. Keyer aliases are explicit and do not rewrite history. Invalidated morphology/sense withdraws the version and appends corrections/annuls affected attempts. Unit scope cannot be finer than evidence.

## Proposed additive data model

```sql
CREATE TABLE cct_protocols (
  protocol_id TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL, -- draft|locked|running|closed|superseded
  title TEXT NOT NULL, config_json TEXT NOT NULL, config_hash TEXT NOT NULL,
  locked_at TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(protocol_id, version)
);

CREATE TABLE cct_knowledge_units (
  knowledge_unit_id TEXT NOT NULL, version INTEGER NOT NULL,
  kind TEXT NOT NULL, construct_id TEXT, item_key TEXT NOT NULL,
  keyer_version INTEGER NOT NULL, evidence_scope TEXT NOT NULL,
  spec_json TEXT NOT NULL, content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY(knowledge_unit_id, version)
);

CREATE TABLE cct_assignments (
  assignment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol_id TEXT NOT NULL, protocol_version INTEGER NOT NULL,
  knowledge_unit_id TEXT NOT NULL, knowledge_unit_version INTEGER NOT NULL,
  arm TEXT NOT NULL, stratum TEXT, randomization_unit TEXT NOT NULL,
  randomization_key TEXT NOT NULL, assigned_at TEXT NOT NULL,
  source_evidence_row_id TEXT, source_context_hash TEXT NOT NULL,
  target_due_not_before TEXT NOT NULL, target_due_not_after TEXT NOT NULL,
  assignment_status TEXT NOT NULL DEFAULT 'assigned', exclusion_reason TEXT,
  UNIQUE(user_id, protocol_id, protocol_version, knowledge_unit_id, knowledge_unit_version)
);

CREATE TABLE cct_probe_instances (
  probe_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES cct_assignments(assignment_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT UNIQUE, target_text_key TEXT, target_sentence_id TEXT,
  target_order_index INTEGER, target_context_hash TEXT NOT NULL,
  novelty_version TEXT NOT NULL, novelty_json TEXT NOT NULL,
  contamination_status TEXT NOT NULL,
  contamination_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'scheduled', scheduled_at TEXT NOT NULL,
  offered_at TEXT, opened_at TEXT, first_attempt_at TEXT, closed_at TEXT, close_reason TEXT
);

CREATE TABLE cct_attempts (
  cct_attempt_id TEXT PRIMARY KEY,
  probe_id TEXT NOT NULL REFERENCES cct_probe_instances(probe_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_ordinal INTEGER NOT NULL, client_nonce_hash TEXT,
  review_row_id TEXT, grader_id TEXT NOT NULL, grader_version TEXT NOT NULL,
  gold_version TEXT, decision TEXT NOT NULL, score REAL,
  assisted INTEGER NOT NULL DEFAULT 0,
  hint_kinds_json TEXT NOT NULL DEFAULT '[]', annulled INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER, submitted_at TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(probe_id, attempt_ordinal), UNIQUE(probe_id, client_nonce_hash)
);

CREATE TABLE cct_contamination_events (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES cct_assignments(assignment_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, occurred_at TEXT NOT NULL,
  source TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE cct_outcomes (
  assignment_id TEXT PRIMARY KEY REFERENCES cct_assignments(assignment_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome_version TEXT NOT NULL,
  status TEXT NOT NULL, -- confirmed|failed|missing|ineligible|annulled
  value INTEGER, missing_reason TEXT, first_valid_attempt_id TEXT,
  computed_at TEXT NOT NULL, computation_hash TEXT NOT NULL
);
```

`cct_outcomes` is disposable/rebuildable. All user-owned rows carry `user_id`; every child row cascades from assignment/probe. Schema review must choose and test the repository's actual SQLite FK policy before migration. If foreign keys are disabled in the current runtime, account deletion uses one explicit `withTxnLock` transaction in child-first order (`cct_attempts` → `cct_probe_instances`/`cct_contamination_events`/`cct_outcomes` → `cct_assignments`) and an orphan oracle must gate migration/restore. Composite protocol/unit version references are either real composite FKs or fail-closed repository checks plus integrity oracle—this choice cannot remain implicit at implementation. Add indexes on every `user_id`, due assignments, probe state and protocol/arm extracts.

## Lifecycle

```text
candidate → assigned → source_exposed → waiting_delay → probe_scheduled
→ offered → opened → processing
→ observed_pass | observed_fail | abstained | unscorable
→ outcome_computed

pre-attempt → expired_missing | consent_revoked | protocol_withdrawn
observed attempt → annulled → projections/outcome recomputed
```

Assignment is immutable and precedes exposure. Server alone offers/binds a probe. Opening is telemetry, not outcome. Atomic claim permits one primary attempt. Same nonce replays; another nonce cannot overwrite. Hint is latched before response. Decline, expiry, technical failure and abandonment remain distinct missing reasons. Outcome mapping occurs in the locked analysis layer.

## Eligibility

Evaluate from pre-treatment facts only: research/context consent; active locked unit; non-annulled anchored source evidence/introduction; valid canonical key; target available and unseen within lookback; feasible delay; no duplicate assignment/prior scored CCT for unit/version. Post-treatment engagement/success is never an eligibility requirement. FSRS due may be a covariate/stratum but cannot redefine outcome.

## Novelty and contamination

V1 hard gates: different text and sentence/context hash; target not displayed during treatment/review; source sentence not copied; answer not visible outside blank; translation/gloss does not uniquely reveal it; target frozen before grading. Record normalized token/Jaccard and character n-gram overlap, shared content lemmas, visible answer occurrences, translation leak, prior exposures and policy version. Similarity thresholds are calibration parameters; borderline cases abstain or receive blinded pre-assignment adjudication.

Contamination includes target shown on any surface, answer hint, same-unit review in the locked window, near-duplicate source/target, staff/model leakage or grader treatment-arm access. Report by arm. Confirmed contamination invalidates per-protocol transfer while ITT retains assignment under the preregistered policy.

## Scheduler

Pilot proposal: primary day 7, window days 6–9; secondary day 21, window 18–25; maximum one primary CCT probe/user/day. Inputs are consent, locked window/arm, source time, exposure ledger, surface/challenge availability and operational quota. Stable hash tie-breaks. FSRS collision policy is identical across arms unless preregistered.

## Attempt, hints, missingness and annul

Only ordinal 1 is primary. Explicit “I don’t know” is either a declared observed failure or separate observed outcome—owner decides before lock. Empty/unsupported/technical/declined/abandoned are distinct. Any answer-revealing hint before attempt sets `assisted=1` and prevents unassisted confirmation; reveal follows durable terminal recording. Raw answers remain off by default; a separately consented gold study may store encrypted TTL-bound data.

Annul is append-only, user-scoped and recomputes CCT/FSRS projections. A review row from a probe carries allowlisted CCT IDs/version metadata only after privacy review.

## Independent grading and gold

Order: locked deterministic normalizer/resolver → accepted variants/scope → decision → abstain on ambiguity → blinded human adjudication for evaluation subset. Persist grader/normalizer/resolver/policy versions, expected form ID, matched variant, raw decision, assistance and binding. LLM cannot grade its own treatment/target.

Gold includes frozen source/target, unit/version, accepted alternatives, near-miss taxonomy, novelty/contamination judgments, two blinded Hebrew/SLA reviewers and adjudicator, provenance/hash/source commit. Keep near-duplicate families in one split; hide treatment/model/user. Proposed confirmation precision gate ≥99%, zero known answer leaks, abstention allowed; exact threshold is an owner/evaluator decision.

## ITT queries

```sql
SELECT a.assignment_id, a.user_id, a.arm, a.assigned_at,
       o.status, o.value, o.missing_reason
FROM cct_assignments a
LEFT JOIN cct_outcomes o ON o.assignment_id=a.assignment_id
WHERE a.protocol_id=:protocol AND a.protocol_version=:version
  AND a.assignment_status <> 'pre_assignment_ineligible';
```

```sql
SELECT arm, COUNT(*) assigned_n,
       SUM(CASE WHEN o.value=1 THEN 1 ELSE 0 END) confirmed_n,
       SUM(CASE WHEN o.status='missing' THEN 1 ELSE 0 END) missing_n
FROM cct_assignments a LEFT JOIN cct_outcomes o USING(assignment_id)
WHERE protocol_id=:protocol AND protocol_version=:version
GROUP BY arm;
```

Never headline `AVG(value)` over non-null outcomes. Report assigned/observed/missing/confirmed, risk difference and interval, SRM, contamination/deviation, ITT primary and complete-case/conservative sensitivities. Cluster repeated units by learner.

## Power and pilot claim

Lock randomization/analysis unit, baseline probability, minimum useful risk difference, units/learner, ICC, missingness, alpha/power and multiplicity. Simulate repeated-unit designs with saved code/seed/assumptions. Twenty users generally test feasibility, contamination, missingness, latency and grader reliability—not a small educational effect.

## Server-only boundaries

```text
cctProtocolRepo.lock
cctEligibility.evaluate
cctAssignment.assignEligible
cctScheduler.listDue
cctProbeBuilder.build
cctProbeRepo.bindChallenge
cctAttemptRecorder.recordFromReviewer
cctCorrectionRepo.annul
cctOutcomeProjector.rebuild
cctOracle.verify
```

Clients never provide trusted arm, answer, unit, novelty, contamination, eligibility, grade or outcome. Existing reviewer is the only review-write bridge. Use one transaction/outbox boundary or repairable `review committed / CCT projection pending` state.

## Migration, privacy and rollback

Add tables; do not rebuild existing truth. Historical reviews cannot become CCT because they lack prospective assignment/frozen novelty/contamination. They may estimate candidate volume only. Extend export/delete and consent-revoke cancellation/purge. Keyer changes use aliases/oracle, not rewrites. Repair completed challenges missing a CCT projection. Rollback disables assignment/probe flags while append-only history stays exportable/rebuildable.

## Acceptance suite

- Protocol/unit mutation after lock and duplicate assignment fail.
- Outcome projection deletes/rebuilds byte-equivalently.
- Assignment precedes exposure; allocator is stable; biased allocator triggers SRM.
- Same sentence/text, visible answer, translation leak and prior target exposure fail novelty.
- Concurrent attempts produce one score; same nonce replays; hints/reveal ordering is enforced.
- Decline/expiry/abandonment/technical failure remain distinct missing states.
- Client grade/answer/arm fields are ignored/rejected; model outage does not block deterministic grade.
- False-confirmation fixture fails build; evaluator is blinded.
- ITT denominator equals assignments; analysis gate detects complete-case deletion.
- Cross-user access fails; raw answers/content absent by default; export/delete/revoke/TTL cover all tables.

## Rollout and owner decisions

R0 protocol review; R1 shadow candidate/novelty audit; R2 gold/calibration; R3 internal A/A; R4 owner operational verification; R5 20-user feasibility; R6 powered experiment.

Before implementation decide randomization unit, primary delay/window, v1 transfer scope, same-work rule (recommend no), missingness policy, explicit-don’t-know mapping, reviewer qualifications, raw-answer policy (recommend off), SESOI and maximum probe frequency/collision with ordinary FSRS.

Stop on answer leakage, cross-user access, unrebuildable state, false confirmation beyond gate, SRM/differential missingness/contamination, raw class-C retention or review/CCT reconciliation divergence.

This detailed design identifies an implementable path but is not implementation authorization. It requires schema, migration, privacy and scientific review. It does not establish that LinguistPro improves transfer; that requires locked gold, A/A/feasibility and a sufficiently powered prospective experiment.
