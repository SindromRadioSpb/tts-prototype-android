# LinguistPro Wave 2 — F2 sufficient shadow evidence-chain sequencing decision

**Date:** 2026-07-16

**Status:** `OWNER_APPROVED / SEQUENCE_CANON`; product sequence and decision-packet scope only.

**Authority:** documentation only. This decision authorizes no F2 production code, migration, API/UI/config change, model/provider call, background job, CP0/live window, commit, push, deploy, AA2 implementation or external connection. F2 implementation still requires a separate owner-approved decision packet and execution approval packet.

**Current baseline:** `main` at `bcf9482`; package/production `3.11.188`. F1 is `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` and technically verified for one exact owner with storage, Continue context and deterministic candidates enabled. It remains bounded continuity, not learner-state authority.

## 1. Owner decision

The approved product sequence is:

```text
F1 documentation/evidence closure
  -> F2 sufficient end-to-end shadow evidence-chain decision packet
  -> separately approved F2 shadow engineering and default-off deployment
  -> bounded next-session/weekly preparation decision and implementation
  -> AA2 read-only Agent Access engineering
  -> AA3 propose-first engineering
  -> AA4-required S7 capabilities
  -> AA4 product engineering and separately gated promotion

parallel, non-runtime path:
AA0 no-secret packaging/evidence
AA1 OAuth/tool-schema/consent/threat-model contract
```

AA1 may proceed in parallel. AA2 remains prohibited until AA1 is approved and a separate AA2 execution packet is approved. The placement of AA2 after F2 and bounded preparation is an owner scheduling priority, not a claim that F2 is an OAuth transport dependency.

## 2. “Sufficient F2 shadow” means a complete governed chain

F2 must not be reduced to one endpoint, one hypothesis fixture or a UI card that never reaches evaluation. The decision packet must define a bounded but complete chain:

```text
eligible canonical observation
  -> typed, falsifiable hypothesis candidate
  -> explicit eligibility/policy/consent decision
  -> smallest useful evidence request
  -> learner accept / skip / defer / expire
  -> typed attempt or explicit missingness
  -> independent deterministic or rubric-bound shadow evaluation
  -> rule-governed shadow state decision
  -> visible rationale, uncertainty and provenance
  -> outcome / correction / annul / expiry / deletion
  -> content-safe audit and later planner handoff contract
```

“Shadow” means the chain may calculate and display what it would recommend, but it may not write or reinterpret `review_log`, FSRS, mastery, grading, linguistic truth, resolver truth, consent or any canonical learner-state projection.

## 3. Required sufficiency floor for the F2 decision packet

The next packet must offer A/B/C options and recommend a bounded complete option whose minimum floor includes:

1. At least two materially different, repository-grounded hypothesis/evidence-request constructs, not two labels over the same fixture.
2. At least one delayed or context-shift request that can resume across sessions without requiring a background notification job.
3. Closed typed artifacts for observation, hypothesis, request, attempt/missingness, evaluation, shadow decision and outcome/audit.
4. Exact provenance to canonical event/task/source IDs and explicit policy, rubric, evaluator and schema versions.
5. Independent evaluation: deterministic oracle where the construct permits it; any LLM evaluator remains separately versioned, rubric-bound, uncertainty-aware, provider-gated and non-authoritative.
6. MNAR handling for skip, defer, timeout, abandonment and unavailable evidence; none may be silently converted into failure or mastery.
7. User-visible “why,” uncertainty, skip/defer, correction/dispute, suppress/annul, expiry and delete semantics appropriate to each artifact.
8. A content-minimized context/output contract that a later bounded planner may consume without treating a hypothesis or shadow decision as canonical truth.
9. Consent, export, delete, restore/anti-resurrection, tenant isolation, audit TTL, caps, flags, exact owner allowlist and rollback contracts.
10. Deterministic synthetic gates with a hard zero-external-provider tripwire, plus optional separately approved bounded evaluator evidence.
11. R1–R17 adversarial review, including evaluator self-certification, nuisance testing, anchoring, source drift, cross-user access, item leakage, fatigue, cost and false-state risks.
12. An evidence plan with eligible-opportunity denominators, offer/accept/complete/skip/defer/expire rates, evaluator agreement/disagreement, correction/dispute rate, delayed/context-shift performance and explicit no-learning-outcome claim until a pre-registered comparison exists.

The packet must choose exact constructs, lifecycle and acceptance thresholds. This sequencing decision deliberately does not pre-authorize those product choices.

## 4. Boundary with F1

- F1 records user declarations and selected unfinished continuity.
- F2 may reference F1 goals/threads as context or an unfinished action, but may not convert them into proof of skill or a diagnosis.
- F2 hypotheses/evaluations are not new F1 memory categories.
- A later planner may receive a typed statement such as “shadow evidence request completed; result uncertain,” never a free-form hidden learner profile.
- F1 correction/delete semantics do not substitute for F2 evidence dispute, evaluation annul or canonical correction routes.

## 5. Boundary with bounded preparation

The later preparation slice is not part of F2 implementation. F2 must only define the reproducible handoff it can safely provide. The subsequent decision must determine how a next-session or weekly draft combines:

- explicit F1 goals and active unfinished threads;
- canonical due/review/reading facts;
- completed F2 evidence and uncertainty;
- learner time/effort/preferences;
- fatigue, cost, consent and provider gates.

No planner may treat pending hypotheses, skipped requests, tutor prose or raw engagement as mastery. Background or retrying A2 preparation reopens S4 durable-job/outbox requirements before implementation.

## 6. Boundary with AA0–AA2 and S4–S7

- AA0 remains no-secret, local and unable to read/write F1 or F2 data.
- AA1 may define future read-only learning-brief vocabulary, but AA2 v0 scopes cannot assume access to F1 payloads, F2 hypotheses, attempts, evaluator artifacts or private source bodies without a later explicit consent/scope amendment.
- No AA2 runtime, OAuth credential/client, MCP endpoint or live connection is authorized here.
- S4 is required if F2 or bounded preparation needs durable background scheduling, retry/outbox, worker leases or notifications. A synchronous visit-time delayed request can remain outside S4 if its persistence/lifecycle is bounded and proven.
- S5–S7 reopen for scale/database transition, private material lifecycle, tenant sharing, public cohorts, quotas/FinOps, support or commercial SLOs.

## 7. Exact next deliverable

Prepare a separate `LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_2026_07_16.md` that:

- reconstructs current code/schema/UI and reconciles it with research and planning canon;
- presents A/B/C product/authority options;
- recommends a sufficient bounded shadow vertical slice;
- locks schemas, lifecycle, evaluation independence, UI, consent, flags, rollback, deterministic gates, R1–R17 review and evidence plan;
- identifies any required migration but creates no migration or production code;
- ends with explicit owner decisions and a separate execution-packet requirement.

The paste-ready next-session contract is stored in `LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_PROMPT_2026_07_16.md`.
