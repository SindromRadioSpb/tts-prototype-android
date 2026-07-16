# LinguistPro Wave 2 — bounded next-session / weekly preparation decision packet

**Date:** 2026-07-17
**Status:** `DOCS_ONLY / OWNER_DECISION_REQUIRED / IMPLEMENTATION_NOT_AUTHORIZED`
**Decision surface:** a bounded, deterministic, manually generated and learner-reviewable preparation draft.
**Recommendation:** **Option A**.
**This packet authorizes:** no implementation, migration, route, UI, flag, provider call, production operation, deployment, AA2 connection, or F2 handoff enablement.

## 1. Executive decision

Approve the *target* of Option A, then require a separate execution-approval packet before code.  Option A is a complete small vertical slice: one exact owner principal explicitly asks for a preparation draft; deterministic policy composes a short reading-first set of proposed actions; the learner can accept, edit, remove, reject, delete, or regenerate it.  The draft is a derived, expiring artifact, never learner truth or a hidden canonical writer.

Do **not** wait for the 14-day F2 run to prepare synthetic/default-off engineering once separately approved.  Do wait for its applicable closure evidence before claiming owner-live sufficiency, efficacy, or cohort readiness.  The F2 context/planner handoff remains off until that later approval.

## 2. Terminology and non-goals

| Name | Meaning and status |
|---|---|
| PAS-F3 | Wave-1 explanation follow-up (up to three turns); already shipped.  It is not this work. |
| Bounded preparation | The proposed F2-to-reviewable-action bridge.  It has **no approved F-number**. |
| Wave-2 F3/M1 | Proposed private user learning corpus with material rights, trust/revision/chunk and deletion lineage.  Not authorized. |

This slice is not Wave-2 F3/M1, not PAS-F3, not CP0 live, not an AA2/MCP/OAuth capability, not a provider/LLM planning experiment, not a notification system, and not a second autonomous daily planner.

## 3. Repository-grounded reconciliation

### 3.1 Verified live substrate

- `server.js` exposes the existing provider-capable `POST /api/agent/plan`; its contract is agent planning, not the new deterministic draft.  It must not be duplicated or silently repurposed.
- `review_log` remains the append-only review truth.  `db/learnerProjectionRepo.js` derives `srs_projections` from replay; neither may be written by preparation.
- F1 is implemented as first-party, default-off correctable continuity: `db/learnerMemoryRepo.js` provides explicit declared goals, active unfinished threads, revisions, source links, expiry, export, deletion journal and restore-erasure support.  F1 routes are owner/principal scoped in `server.js`.
- F2 is implemented as deterministic shadow evidence: `agent/evidence/runtime.js`, `db/f2EvidenceRepo.js`, `agent/evidence/shadowReducer.js`, and the Mentor Home UI.  It is exact-allowlisted, consent-gated, manual scan only, public-corpus only, capped at one newly created chain/day and has no provider call.
- F2 submission deterministically creates an evaluation and a shadow decision but its routes explicitly do not write `review_log`, projections, F1 memory, planner tasks, notifications or provider usage.  F2 query receipts and export/delete lifecycle already exist.
- `handoffPreview()` exists only behind **both** `F2_SHADOW_CONTEXT_USE_ENABLED` and `F2_SHADOW_PLANNER_HANDOFF_ENABLED` plus handoff consent.  It currently selects from completed F2 records but is an unapproved preview, not a preparation contract; it remains disabled.
- Mentor Home is the established home for the existing `/plan`, F1 continuity and F2 evidence.  It already has 380x844 owner-live regression evidence for F2 training-dialog reuse and RU/EN/HE fallback protection.

### 3.2 Current factual lifecycle and flags

The F2 owner-run README records: one exact owner, manual/public/no-provider F2 B1/B2 enabled; planner/context, external evaluator, CP0, jobs and notifications off.  Evidence run 1 is `OPEN / OWNER_ONLY / MANUAL_ONLY`; its completion ledger must be calculated only from F2 metadata.  The owner-led regression deleted its synthetic chains, therefore no chain may be inferred as completed from ordinary activity or screenshots.

F1 and F2 are implemented; longitudinal evidence is deferred.  F2's open evidence debt blocks promotion claims, not a separate docs-only decision or future isolated default-off engineering.

### 3.3 Planning/research reconciliation, stale claims, and no-repeat list

| Claim or mechanism | Reconciled state / consequence |
|---|---|
| Earlier sequence treated AA2 as waiting on F2 | Superseded: AA2-B3 D1–D7 is an independently approved default-off parallel line with no F1/F2 payload authority. |
| F2 was described as merely a future decision/schema | Stale: its complete owner-only B1/B2 chain, migration, UI, lifecycle and smoke gates are implemented.  Do not propose them again. |
| `f2_shadow_planner_handoff` is available because F2 exists | False.  Both context and planner flags plus consent are required and are off; its existing preview is not approval to consume F2. |
| F2 response/evaluation is learner truth | False.  It is bounded shadow evidence, with dispute/annul/delete and expiry states; B2 is visibly self-reported retrieval. |
| `/api/agent/plan` is an empty slot for the new feature | False.  It is an existing agent/provider-capable surface.  No second competing `/plan` and no mutation of its authority. |
| F1 is a proposal only | Stale in this checkout: its repo/runtime/UI/smokes exist.  Reuse its explicit goal/thread, provenance, erasure and principal patterns rather than recreate a memory store. |
| F2 UI is a bare card / untested happy path | Stale: it now reuses the training dialog, audio stimulus and terminal invalidation; raw evaluator enums and stale locale keys were remediated. |
| Existing documentation's baseline SHA/package numbers | Historical snapshots, not current worktree truth.  This packet intentionally avoids treating those numbers as a live deploy assertion. |

## 4. Options A/B/C

| Option | Scope | Value | Authority/risk | Decision |
|---|---|---|---|---|
| **A — deterministic, manual, reviewable preparation draft** | Exact owner, explicit tap, bounded daily/weekly draft, eligible F1/canonical facts and terminal valid F2 summaries. | Tests the real F2-to-action bridge end to end without claiming learning truth. | Derived only; no provider/jobs/notifications/canonical write. | **Recommend.** |
| **B — deterministic preparation without F2 input** | Same draft, omits F2 entirely. | Useful incomplete substrate and a fallback when no eligible F2 exists. | Low risk, but cannot prove F2→action handoff and can drift into generic to-do list. | Permit only as explicitly labelled partial mode/substrate, not bridge closure. |
| **C — provider/LLM, background or proactive preparation** | LLM selection/prose, automatic drafts, retry worker/scheduler, notification or planner write. | Potentially richer later. | Opens provider, S4 durable jobs, nuisance, cost, evaluation dependence and higher authority. | Reject for next slice. |

Option A is not a thin demonstration: it includes the full read-only input snapshot, selection policy, learner editing lifecycle, source inspection, expiry, deletion/export/restore semantics, duplicate suppression, isolation and mobile/localization gates.

## 5. Exact Option-A user journey

1. The exact owner opens the established Mentor Home and taps **“Подготовить следующую сессию”** (a new clearly labelled preparation entry, not `/plan`).  No automatic creation occurs.
2. UI states the purpose, bounded duration, selected consented input categories, and that the draft changes nothing until each proposed action is actually completed through its canonical surface.
3. The server snapshots only eligible, source-addressable F1/canonical/F2 summaries and returns one of: `READY`, `EMPTY`, `INSUFFICIENT_EVIDENCE`, `STALE_SOURCE`, `NO_USEFUL_DRAFT`, `DUPLICATE_SUPPRESSED`, or an honest access/consent error.
4. For `READY`, the learner sees a 10–20 minute default draft with at most three actions: first an anchored reading/resume action where available; then due retrieval; and at most one evidence-driven action.  Every item exposes sources, reason codes, uncertainty and omissions.
5. The learner can change bounded duration/order, delete an individual item, reject the complete draft, delete it, or explicitly request a new one.  **Accept** means only “keep/open this proposal”; it never means done.
6. Tapping an action deep-links/opens the already canonical reading, review, or continuity surface.  Only that surface's existing real completion path may write learner state.
7. Before showing or opening an item, the UI revalidates source freshness.  A stale/finished/deleted source is removed and labelled, never shown as current work.

## 6. Input eligibility and provenance matrix

| Input class | Eligible predicate | Allowed contribution | Explicit exclusions |
|---|---|---|---|
| F1 declared goals | `ACTIVE`, user-declared, use enabled, unexpired, source available | Goal framing or tie-break only | pending/suppressed/expired/annulled/resolved/deleted or opaque content outside F1 payload contract |
| F1 unfinished thread | `ACTIVE`, unexpired, source available, source still resumable | Prefer one meaningful reading/resume action | deleted/revoked/drifted source; a thread is not mastery/diagnosis |
| Canonical due/review facts | Current read-only canonical query, item key and due state revalidated at render/open | Timely retrieval candidate | inferred non-response, stale projections, hidden client cache as truth |
| Canonical reading continuity | Saved reading position/source anchor revalidated against current text and completion state | Reading-first resume/new public reading action | personal uploads and F3/M1 corpus; finished/deleted/unresolvable anchors |
| Explicit effort/time/preferences | Current explicitly consented, bounded facts | Draft duration, ordering and accessibility | inferred behaviour, raw text/transcript, absence as dislike/failure |
| F2 summary | **Terminal `COMPLETED`; evaluation and shadow decision `VALID`; source/status revalidated; no dispute/annul/delete/expiry/suppression; handoff consent and separate execution gate later** | At most one transparent evidence-driven action with uncertainty | `PENDING`, `OFFERED`, `ACCEPTED`, `DEFERRED`, `SKIPPED`, `EXPIRED`, `DISPUTED`, `ANNULLED`, `SUPPRESSED`, deleted, MNAR/no answer; raw answer or evaluator internals |

No absence of a completed F2 attempt, no skipped/deferred request and no missing learner response is a negative learner fact.  F2 contribution neither writes nor implies mastery, grade, diagnosis, word status, FSRS state or a proven learner preference.  The F2 evaluator is never its own planner oracle: the preparation policy sees a fixed, versioned, content-minimized terminal summary and reason-code allowlist, not a free-form evaluator conclusion or raw answer.

## 7. Proposed typed artifact and read-only handoff contract

This is a specification only.  Names are intentionally proposals, not requested routes/tables.

```ts
type PreparationDraftV1 = {
  id: string; user_id: string; state: "ACTIVE"|"REJECTED"|"DELETED"|"EXPIRED";
  cadence: "DAILY"|"WEEKLY"; requested_at: Iso; expires_at: Iso;
  policy_version: "prep-policy-v1"; generation_version: string;
  input_snapshot: { digest: HmacDigest; captured_at: Iso; source_versions: SourceVersion[];
    eligibility_counts: Record<string, number>; exclusions: ReasonCode[] };
  duration_minutes: 10|15|20|30; items: PreparationItem[];
  omissions: Omission[]; uncertainty_codes: ReasonCode[];
  duplicate_of?: string; source_refs: SourceRef[];
};
type PreparationItem = {
  id: string; kind: "READING_RESUME"|"DUE_RETRIEVAL"|"EVIDENCE_GUIDED_RETRIEVAL";
  rank: number; estimated_minutes: number; canonical_target: CanonicalRef;
  reason_codes: ReasonCode[]; uncertainty_codes: ReasonCode[];
  source_refs: SourceRef[]; source_snapshot_digest: HmacDigest;
  learner_status: "PROPOSED"|"REMOVED"; action_status: "NOT_STARTED";
};
type F2HandoffSummaryV1 = {
  contract_version: "f2-preparation-summary-v1"; request_ref: OpaqueRef;
  construct_id: "UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION"|"READING_TO_NEW_CONTEXT_TRANSFER";
  terminal_state: "COMPLETED"; evaluation_status: "VALID"; decision_status: "VALID";
  decision_code: AllowlistedCode; uncertainty_codes: ReasonCode[];
  source_refs: SourceRef[]; source_digest: HmacDigest; completed_at: Iso;
};
```

The generator must produce the `input_snapshot.digest` from a canonical sorted, content-minimized, user-keyed snapshot; persist the policy/generation versions and all source versions; expose opaque IDs/anchors rather than raw private content; and revalidate at display and action-launch.  A changed digest creates a new explicit manual generation, never silent mutation of an accepted draft.

**Read-only F2 contract.** A future adapter may query F2 only with `user_id` derived from authenticated principal, the summary predicate above, a fixed limit of one selected summary, `purpose=PREPARATION_DRAFT`, a receipt/audit record and no write to F2 state.  It must not call F2's scan, offer, action, attempt, evaluator or reducer; must not read answer payloads/expected answer/secret digests; and must fail closed when the designated consent, flag, version or source revalidation is absent.  Existing `handoffPreview` is insufficient and remains disabled pending its replacement or separately approved narrow adaptation.

## 8. Deterministic selection and prioritization

1. Reject unauthorised principal, missing preparation consent, stale sources and ineligible inputs; record counts/reason codes but do not turn omission into learner fact.
2. Build candidates in fixed classes: one resumable reading thread (highest), due retrieval, then one eligible F2-guided retrieval.  Prefer explicit goal alignment only as a tie-breaker.
3. Enforce 10–30 minutes, maximum three items, one item per canonical target, **maximum one F2-derived item**, no duplicate target and no item whose source is not launchable now.
4. Sort deterministically: reading-resume availability; due urgency; explicit user goal/thread priority; source recency; stable opaque-ID tie-break.  F2 cannot override an available meaningful reading-first item merely because its code has a higher score.
5. Return `NO_USEFUL_DRAFT` rather than padding with generic drills.  Return `INSUFFICIENT_EVIDENCE` if only F2 bridge contribution is missing; Option A may still show a transparently labelled non-F2 partial draft only if the owner chooses that UX policy.

**Cadence/duplicates.** Default daily request produces a 20-minute draft with 24-hour TTL; weekly request produces a 30-minute draft with 7-day TTL.  One active draft per `(user, cadence)` is returned unchanged only when its snapshot digest and policy version match.  A manual “new draft” replaces no record silently: it first expires/rejects/deletes per the learner's explicit choice, then generates exactly one new snapshot.  A completed canonical action invalidates matching proposal items on revalidation; accepted never equals completed.

## 9. Lifecycle, privacy, export, delete and restore

```text
manual request -> READY ACTIVE -> accept/view (still ACTIVE) -> item remove / whole reject
                 |                   |                         |
                 v                   v                         v
       EMPTY / INSUFFICIENT /   source drift => STALE_SOURCE   REJECTED
       NO_USEFUL / DUPLICATE                         |
                                                     v
ACTIVE -- TTL --> EXPIRED -- retention purge --> deletion journal
ACTIVE/REJECTED/EXPIRED -- explicit delete --> DELETED + erasure journal
```

- Creation requires a dedicated purpose consent; F1 and F2 consents are necessary but not sufficient.  Revocation stops generation, hides active drafts and deletes drafts plus their content-safe receipts according to the agreed lifecycle.
- Store no private uploaded material, raw F2 answer, evaluator prose, full personal text or hidden behavioural inference.  Store only minimal typed targets, opaque source refs, reason/uncertainty codes, digests, versions and learner edits.
- Export includes draft metadata, state transitions, item/source refs, versions, snapshots/digests, omissions and deletion lineage; it excludes secrets and raw F2 answers.  F1/F2 existing exports remain separate.
- Restore is structural and erase-aware: a draft/item listed in an erasure journal cannot resurrect; restored source refs must revalidate before display.  Restore cannot recreate an expired, deleted, revoked or stale proposal as active.
- Tenant isolation is enforced in every read/write by authenticated principal only; client `user_id` fields are forbidden; negative tests cover another exact owner, wildcard/malformed allowlist and guessed draft/item/source IDs.

## 10. API/UI/flag proposals (specification only)

Use a distinct `preparation` namespace, not `/api/agent/plan`, and do not add it before separate approval.  Candidate endpoints are `POST .../preparation/drafts` (explicit create), `GET .../preparation/drafts/current`, `POST .../preparation/drafts/:id/action` (only `REMOVE_ITEM`, `REJECT`, `DELETE`, never `COMPLETE`), `GET .../export`, and a purpose-scoped delete.  All mutating calls require CSRF and must reject client principal fields.

Proposed default-off gates: `BOUNDED_PREPARATION_ENABLED=0`, `BOUNDED_PREPARATION_OWNER_IDS=`, `BOUNDED_PREPARATION_F1_INPUT_ENABLED=0`, `BOUNDED_PREPARATION_F2_READONLY_INPUT_ENABLED=0`, `BOUNDED_PREPARATION_DAILY_ENABLED=0`, `BOUNDED_PREPARATION_WEEKLY_ENABLED=0`.  An exact non-wildcard one-principal allowlist, separate digest secret/policy version and a kill switch are required.  No CP0 live registration; CP0 remains off.

Mobile UX is one-column and tap-safe at **380×844**: duration and action count visible above the fold; each item has a clear source/reason disclosure; deletion/reject regeneration are reachable without a dead end; empty/insufficient/stale/no-useful messages name the recovery action.  Contracted translations are RU/EN/HE, with RTL layout and Hebrew target text/direction tested independently.  Use graceful fallback copy if an old locale bundle returns a dotted key.

## 11. No-canonical-write proof and `/plan` boundary

| Operation | Permitted side effect | Forbidden side effect |
|---|---|---|
| Generate / edit / reject / delete draft | Only preparation artifact, receipt and deletion journal | `review_log`, FSRS/projection, mastery, grade, word status, F1 memory, canonical planner/task, F2 state |
| Accept draft | Mark no action as completed; optionally retain as viewed | Any learner-state write or due-date change |
| Open a proposed action | Navigation/deep link only | Completion assertion |
| Complete real action | Existing canonical surface's normal write path only | Preparation writer impersonating canonical path |

The existing `/api/agent/plan` remains an agent runtime command with a distinct provider/provenance contract.  The new surface is a deterministic stored draft, not a plan endpoint, not a replacement for Telegram `/plan`, and not a way to smuggle F2/F1 context into agent tools.  Shared Mentor Home location is allowed only as a visual entry point; authority and data contracts remain separate.

## 12. Rollback, gates and owner-live evidence

**Kill switch / rollback:** disable the global preparation gate; hide the entry point; reject creation; preserve or delete drafts according to owner-selected consent semantics; do not touch F1/F2/canonical data.  Immediate stop for tenant leak, canonical write, accept-as-complete bug, F2 invalid-state inclusion, raw/private-content persistence, provider/network attempt, stale action launch, AA2 file-authority conflict, or misleading learner copy.

**Deterministic synthetic gates before any owner enablement:**

- exact-principal positive and cross-tenant/guessed-ID/wildcard negative gates;
- input matrix fixtures for every eligible and forbidden F2 lifecycle state, including MNAR;
- no-provider/network tripwire and no CP0/job/scheduler/notification tripwire;
- SQL/write spies proving no writes to `review_log`, projections, F1, F2 or agent tasks;
- reproducible snapshot/digest, stable ordering, cap, duplicate, TTL and re-generation fixtures;
- export/delete/revoke/restore no-resurrection tests; stale source and canonical-completed invalidation;
- load/limit test for bounded principal-scoped reads; 380×844 RU/EN/HE/RTL screenshots and keyboard/touch regression;
- `git diff --check`, narrow staging and a fresh worktree proof that AA2-B3 files are absent.

**Owner-live evidence (not efficacy):** exact owner makes explicit daily/weekly requests against fixtures and naturally available sources, verifies empty/insufficient/stale/no-useful as well as ready/edit/delete/reject/regenerate, launches one real action through its canonical path, and confirms accept itself did nothing.  Record denominators from draft metadata: requests, eligibility/exclusions, F2 contribution count, stale invalidations, canonical-write/provider/tenant incidents (all zero required), and learner-reported usefulness.  This is not a claim that F2 causes learning; cohort/effectiveness promotion remains blocked by corresponding evidence.

## 13. R1–R17 adversarial critique

| Roles | Threat | Required response |
|---|---|---|
| R1 / R10 | A vocabulary/drill target without linguistic source validity | Canonical anchored public reading/review refs only; no free-text target invention. |
| R2 / R5 | Generic drill list crowds out meaningful reading | Reading-first ordering, small timebox, `NO_USEFUL_DRAFT` rather than padding. |
| R3 | Derived draft is misread as a learner-knowledge graph fact | Explicit artifact class, source lineage and no mastery/diagnosis authority. |
| R4 / R8 | Mobile/RTL clutter, ambiguous status or dead end | 380×844, RU/EN/HE/RTL, learner copy and recovery-state gates. |
| R9 / R11 / R17 | F2 evaluator becomes planner oracle; accept/draft writes hidden authority | Fixed valid terminal summary only; independent policy; no canonical-write proof and action-state separation. |
| R12 / R13 | Dual-write and premature durable-job architecture | One derived store, no sync writer/jobs; schema/migration only after approval. |
| R14 | Principal spoofing or AA2 data widening | Server-derived exact principal, negative isolation tests, AA2 receives no payload. |
| R15 | Raw private materials or deleted data return | Minimal typed storage, purpose consent, export/delete/restore no-resurrection. |
| R16 | Provider/job/notification cost and nuisance | Manual deterministic zero-provider slice, caps, no scheduler/retry/notification. |

## 14. Parallel boundaries and stop conditions

AA2-B3 D1–D7 is concurrent, independent and must receive no F1/F2/private payload.  This packet does not modify AA2/OAuth/MCP runtime, dependencies, package files, `server.js`, identity, token/key, proxy or production configuration.  Before eventual implementation, owner must assign exclusive file ownership; if `server.js`, package/security/identity/consent/export/delete or shared planning documents overlap AA2-B3, stop and return the conflict rather than resolving it opportunistically.

F3/M1 remains private corpus work; no personal uploads, material rights, corpus chunks, embedding or F3/M1 schema enter this slice.  F2 remains defect-hardening/evidence-run only; no construct expansion, provider evaluator, planner write or public rollout follows from Option A.

Stop implementation planning/execution and return to owner if Option A needs provider/LLM, any background mechanism, notification, CP0 live, an AA2 connection, personal material/F3 corpus, more than one F2 action without fresh rationale, nonterminal F2 data, non-reproducible input, canonical writes, or a shared-file conflict.

## 15. Owner decisions and required sequence

1. **Product option:** A (recommended: bounded deterministic reviewable bridge); B (explicitly incomplete non-F2 substrate); C (defer/reject next slice).  **Recommendation: A.**
2. **F2 contribution:** A1 one valid terminal summary maximum (recommended); A2 zero until F2 run closes; A3 higher cap only with a new evidence/rationale packet.  **Recommendation: A1.**
3. **Cadence/TTL:** A1 daily 20m/24h plus weekly 30m/7d (recommended); A2 daily only; A3 weekly only.  **Recommendation: A1.**
4. **Partial state:** A1 honest reading/F1/canonical draft labelled “without F2 contribution” (recommended); A2 `INSUFFICIENT_EVIDENCE` with no draft; A3 defer all creation.  **Recommendation: A1, never call it F2 bridge closure.**
5. **Consent/lifecycle:** A1 dedicated preparation purpose consent and delete-on-revoke (recommended); A2 F1/F2 consents only (reject: purpose is widened); A3 no persistence (reconsider product value).  **Recommendation: A1.**
6. **Existing F2 handoff:** A1 keep off and build a separately approved read-only adapter (recommended); A2 enable current preview (reject); A3 omit F2 as Option B.  **Recommendation: A1.**
7. **Execution:** A1 approve this packet only, then request a bounded execution-approval packet after AA2 file ownership is clear (recommended); A2 authorize code now (not authorized by this packet); A3 defer.  **Recommendation: A1.**

### Separate execution-approval requirement

No implementation may start until the owner accepts the decisions above **and** a new execution packet specifies exact files, migration/no-migration choice, source adapters, consent wording, API/UI contracts, flag/allowlist, ownership with AA2-B3, synthetic fixtures, gates, rollback and owner-live exit criteria.  That packet must recheck live code, schema, git status and AA2 ownership immediately before code; it cannot infer authority from F1/F2 or this document.

## 16. Source map

- `docs/planning/LINGUISTPRO_WAVE2_F2_F3_AA2_PARALLEL_ROUTING_2026_07_17.md`
- `docs/planning/LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_2026_07_16.md`
- `docs/planning/LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_EXECUTION_APPROVAL_PACKET_2026_07_16.md`
- `docs/planning/LINGUISTPRO_WAVE2_F2_OWNER_LIVE_APPROVAL_PACKET_2026_07_16.md`
- `docs/planning/LINGUISTPRO_WAVE2_F2_LESSONS_LEARNED_2026_07_17.md`
- `docs/planning/LINGUISTPRO_WAVE2_F1_CORRECTABLE_CONTINUITY_DECISION_PACKET_2026_07_16.md`
- `docs/research/edu-quality-agentic/2026-07-13/13_EXECUTIVE_RECOMMENDATION.md`
- `docs/research/edu-quality-agentic/2026-07-13/04_AUTONOMY_AND_PROACTIVE_MENTOR.md`
- `docs/research/f2-shadow-evidence/2026-07-17-owner-run/README.md`
