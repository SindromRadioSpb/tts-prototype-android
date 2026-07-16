# LinguistPro — Wave 2 decision packet and scale-ready replan

**Date:** 2026-07-15
**Status:** owner-approved planning revision only; it grants no production implementation authority.
**Live baseline:** main at 7b4d24776853293e49257e340f4c891215907d45; package 3.11.171.
**Scope of this artifact:** no production code, migration, API/UI/config change, commit, push or production operation.
**Review target:** owner decision on the next product slices and the architectural runway that must precede durable memory, material ingestion and autonomous work.

> **Execution delta — 2026-07-16, current routing:** this packet remains the historical dependency/authority decision. G0, C3a, N1 and LB0–LB2 are complete; lesson-quality evidence remains paused at `OPERATIONALLY_COMPLETE / EVIDENCE_DEFERRED`. S0–S2 are owner-approved. S3 CP0 commit `34a0c2e` / package `3.11.184` is deployed default-off and evidenced as `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`: 23 scenarios, 10,000 zero-real-API synthetic runs, 100% start/terminal coverage, zero drops/mismatches/leaks and green lifecycle/restore gates. The unavailable S3-O live window remains parallel remediation debt and gates live promotion, not engineering. The next critical implementation is **F1 correctable continuity**, followed by separately approved **AA2 read-only runtime/MCP → AA3 propose-first → AA4-required S7 → AA4 product engineering**, each default-off until its own launch gate. AA0 packaging/evidence and AA1 OAuth/tool-schema/threat-model work may proceed in parallel. No live Hermes/MCP/OAuth connection or public enablement is implied.

## Executive decision

**Adopt two linked plans, not a single linear queue.**

1. A short path to product value: G0 truth repair, then C3a voice-to-editable-text, N1 deterministic notification selection, and a narrowly bounded Lesson Builder v0.
2. A scale foundation in parallel: S0–S7 contracts for role authority, typed artifacts, context packs, control-plane evolution, durable jobs, storage/database transition, material lifecycle, tenancy and FinOps.

The earlier shorthand G0 → C3a → N1 → CP0 → F1 → F2 → F3 is retained only as a dependency reminder. It is **not** permission to defer platform decisions until after a series of independent features, nor a mandate to build a generic multi-agent platform first.

The governing choice is vertical product slices over a minimal common substrate:

> selected source input → typed, attributable lesson draft → explicit learner publication
> rather than either a universal agent platform or a collection of untraceable AI endpoints.

The research package is **PROPOSAL**, not authorization. It defines the quality bar and owner-decision agenda. It does not select privacy defaults, material rights, schema, database, provider, evaluation, rollout or operational ownership by itself.

## Reconciliation evidence

### Working-tree and source boundary

- At inspection, main and origin/main were aligned at the stated baseline.
- Pre-existing untracked paths included .agents/ and docs/research/edu-quality-agentic/. The research package was read as a decision input; it was not changed, staged or treated as canonical implementation approval.
- No migration was created or run. The server migration series and local OPFS migration series remain untouched.

### Selected live verification already performed

| Check | Result | Planning implication |
|---|---:|---|
| smoke:memory-canon | PASS 79/79 | review_log remains the verified event canon; FSRS state is derived. |
| test:api-smoke | PASS | Existing API and dormant Mini App boundary boot correctly. |
| smoke:agent-roleplay | PASS | Current text-first role-play is a viable bounded reuse surface. |
| smoke:agent-byok | PASS 49/49 | Hybrid BYOK is live; no managed fallback is allowed for own-key failures. |
| smoke:telegram-nudge-skillgap | PASS 19/19 | P7.3d is shipped and is not the next notification slice. |
| smoke:web-push | PASS 21/21 | Shared daily budget, quiet and mute behavior are live. |
| smoke:grader-gold | FAIL 52/58 | G0 blocks every new graded or evidence-bearing authority flow. |

The grader failure is contract drift to adjudicate, not a reason to weaken grading. Four gold cases expect non-strict proclitic acceptance while the harness invokes all as strict dictated typing. The explicit-skip expectation conflicts with current D1 behavior, which maps a production skip on a receptively strong word to Hard(2). R11 and R17 require an independent, channel-by-channel golden matrix before either fixtures or implementation change.

## Inventory

| Area | Status | Live evidence or planning conclusion |
|---|---|---|
| review_log, FSRS-6, replay, deterministic reviewer and D1 policy | **VERIFIED_LIVE** | Truth, grading and consent stay deterministic and append-only where applicable. |
| PAS Wave 1 A–D | **VERIFIED_LIVE** | Explanations, follow-up, comprehension, role-play, constrained writing, next-text, scaffold advice, reason-aware nudge and settings are shipped. |
| Hybrid BYOK | **VERIFIED_LIVE** | The single LLM gate preserves no-key persistence and fail-closed own-key behavior. |
| Room due-continuity R1–R4 | **VERIFIED_LIVE** | Do not reopen source-at-mark, unsourced ladder, counters, paradigm heal or sync cadence. |
| Push and Telegram daily claim | **VERIFIED_LIVE** | One user/local-day claim exists and both transports honor quiet/mute. |
| Notification channel alternation | **VERIFIED_PARTIAL** | Mutual exclusion exists, but scheduler timing decides the winner; no policy-selected alternation or delivery semantics exists. |
| Voice output | **VERIFIED_PARTIAL** | Browser speech synthesis/TTS exists; capture, ASR, transcript consent and speech evaluation do not. |
| Current agent user boundary | **VERIFIED_PARTIAL** | Authenticated principal-derived user scope, user-scoped repositories and a closed tool router are valuable foundations. |
| Workflow/policy control plane | **ABSENT** | No run/step/command lifecycle, workflow registry, capability policy, route policy or durable job contract. |
| Correctable learner memory (F1) | **ABSENT** | Profiles, tasks and explanations are adjacent artifacts, not source-linked editable/expiring memory. |
| Evidence requests and independent evaluation (F2) | **ABSENT** | No observation → hypothesis → request → evaluation → rule-governed state chain. |
| Permitted private-material corpus M1 (F3) | **ABSENT** | learner_artifacts is an opaque consented bundle store, not a rights/trust/revision/chunk/deletion-lineage corpus. |
| CCT, Phase-2 control-plane design and F1–F3 research | **PROPOSAL** | Useful design inputs only; no implementation authorization. |

## The decision: three coordinated tracks

### T — Truth and evaluation

| Slice | Outcome | Gate |
|---|---|---|
| T0 / G0 | Resolve grading-contract drift without reducing coverage. | Independent channel matrix, locked gold, D1 decision, MNAR and annul cases retained. |
| T1 | Freeze reusable golden matrices for new lesson/evidence surfaces. | Resolver-backed linguistic facts and a separately governed evaluator oracle. |
| T2 | Define evaluator boundaries. | Tutor never certifies itself; any LLM evaluator is versioned, rubric-bound and shadow-only. |

G0 is a truth gate, not a blanket ban on planning. It blocks new graded or evidence-bearing authority flows. It must be green before Lesson Builder output is allowed to feed a graded/review path, before F2, and before any claim of assessed speaking.

### P — Bounded product value

| Slice | User-visible outcome | Explicit exclusion |
|---|---|---|
| C3a | A spoken role-play turn becomes an editable text draft; the learner explicitly sends it to the existing text role-play. | No auto-send, raw-audio persistence, pronunciation score, review event or learner-truth write. |
| N1 | Push/Telegram is chosen by one deterministic eligibility and alternation policy before the single daily claim. | No second mutable claim writer, timing-based fairness or relaxed quiet/mute rules. |
| LB0 — Lesson Builder | A learner explicitly selects one to three permitted text inputs and receives an editable, attributable lesson draft. | No autonomous publication, automatic cards, FSRS/mastery update, durable personal corpus or claim of longitudinal personalization. |

LB0 is the recommended first material-related product slice. It is a session- or explicitly selected-source feature, not F3/M1. Until M1 is approved, it must not imply a permanent personal library, automatic retrieval over all user materials, cross-session semantic memory or a general upload promise.

### S — Scale and authority foundation

| Slice | Decision or contract | Exit gate before the next dependency |
|---|---|---|
| S0 | Scale assumptions at 20, 100, 1,000 and 10,000 active users: events, writes, jobs, materials, chunks, storage and model calls. | Owner accepts measurable load, latency, deletion and cost assumptions rather than an unbounded growth story. |
| S1 | Logical agent-role and authority registry. | Every role has allowed inputs/outputs/tools/data scope/authority/model route/budget/retention/publication gate/kill switch. |
| S2 | Typed artifact, provenance, context-pack and handoff contracts. | Every proposed handoff is reproducible from IDs and policy versions without persisting raw prompt content. |
| S3 | CP0 observe-only run envelope. | Existing scenarios are frozen and traced in shadow; no behavior changes or new authority. |
| S4 | Durable job/outbox lifecycle. | Idempotent replay, retry, cancel, timeout, worker-crash reclaim, dead-letter and backpressure tests pass. |
| S5 | Database, object-storage and retrieval/index transition decision. | Current load baseline, migration triggers, RLS strategy, dual-run/backfill/reconciliation/rollback plan and restore proof are accepted. |
| S6 | User-material lifecycle contract. | Rights, source/revision/segment/derived-artifact/deletion lineage, quotas and media staging are approved. |
| S7 | Tenant, budget, purge, audit, incident and operational ownership model. | Named accountable owners, kill switches, support/incident paths and per-scope hard stops are accepted. |

S0–S3 are required before durable F1 memory or any multi-role implementation. S4–S7 are required before durable F3 corpus work, background material processing or media ingestion. This is a design/runway requirement, not a request to build all infrastructure before the first small product slice.

## Recommended dependency map

    T0 G0 ────────────────────────────────────────────────┐
                                                         ├── F1 / LM1: correctable continuity
    P0 C3a ── P1 N1 ── P2 LB0 selected-text lesson draft ┤
                                                         └── F2 / ER1: shadow evidence requests

    S0 scale envelope ─ S1 roles ─ S2 artifacts/context ─ S3 CP0
                                      ├─ S4 jobs/outbox ─ S5 DB/storage ─ S6 materials ─ S7 tenancy/FinOps
                                      │                                      └────────── F3 / M1 text corpus
                                      └───────────────────────────────────────────────── CP1–CP4 evolution

F1 remains before F2 for durable learner authority. F3/M1 policy and architecture may progress in parallel with F1/F2, but a persistent corpus cannot start until S4–S7 and material rights decisions are accepted. LB0 deliberately remains outside that durable-corpus promise.

## Target architecture: single controller, artifact-mediated roles

### Target component and data flow

    learner/browser/channel
        → authenticated principal + consent snapshot
        → existing scenario facade
        → CP envelope: policy, budget reservation, allowed route and run trace
        → role invocation with scoped inputs
        → typed output artifact + compact provenance/context manifest
        → policy/publication gate
        → rendered draft or explicit learner action
        → deterministic state reducer only where an authoritative rule permits it
        → canonical event log and derived projections

The controller owns execution policy, not pedagogical truth. Resolver and curated authority sources remain above LLM prose. Raw prompts, transcripts, audio and full material text stay out of operational logs; the auditable manifest carries IDs, hashes/counts, versions, scope, timing, cost and decision codes.

### Role and authority matrix

| Logical role | May read | May create | May never do directly |
|---|---|---|---|
| Tutor | Current session, explicitly selected source, permitted context pack | Advisory response | Change mastery, FSRS, consent or memory truth. |
| Planner / Lesson Composer | Goals, selected material segments, resolver facts, curated pedagogy claims | Plan or lesson draft, exercise specification | Publish without learner gate or assert linguistic facts over resolver. |
| Material Processor | One permitted material revision | Normalized segments, extraction-quality and source-map artifacts | Execute document instructions, cross-user dedupe or disclose content. |
| Memory Extractor | Selected interaction artifacts only | Correctable memory candidate | Confirm memory, alter learner state or retain a full transcript by default. |
| Evidence Selector | Observations, hypotheses and deterministic review facts | Evidence-request candidate | Declare mastery or write FSRS. |
| Independent Evaluator | Submission, rubric and isolated allowed context | Versioned evaluation artifact | Directly write review_log or certify its own tutor output. |
| Notification Composer | Policy-selected purpose and minimal learner context | Advisory message draft | Select a channel, evade fatigue policy or write learner truth. |
| Policy Controller | Consent, scopes, budgets, role/tool policy | Allow/deny decision and audit code | Generate pedagogical content. |
| Authoritative State Reducer | Deterministically eligible evidence and canonical facts | Rule-governed state decision | Treat free LLM prose as evidence. |

Logical roles are not separate services or separate models in the first step. They are separate contracts and identifiers: role_id, scenario_id, policy version, model route, allowed inputs, allowed outputs, allowed tools, authority level, cost class and retention class. This permits later worker extraction or model substitution without embedding permissions in endpoints.

## Control-plane evolution

| Stage | Scope | Must exist before advancing |
|---|---|---|
| CP0 | Observe-only run envelope around existing flows. | Immutable workflow/role/policy/model versions; consent snapshot; input/output artifact IDs; cost reservation; trace without prompt content. |
| CP1 | Enforce role/tool/capability/model-route policy. | Default-deny validation, action-time consent and scope enforcement, parity window and rollback. |
| CP2 | Durable idempotent commands and background jobs. | Run/step/command IDs, compare-and-set transitions, cancellation, timeout, retry classes, leases, DLQ and replay. |
| CP3 | Controlled A2 preparation. | Consent, budget, change trigger, learner-visible outcome, review/edit gate and kill switch. |
| CP4 | Optional policy-gated A3 publication. | Measured acceptance, correction, learning outcome, fatigue and cost thresholds; owner approval per category. |

For every run, step and command the contract must capture principal/user/tenant scope, scenario and role, policy/model versions, consent snapshot, budget reservation, input/output artifact IDs, idempotency key, status, error class, retry/cancel/timeout data and content-free audit fields.

## Lesson Builder and material roadmap

### LB0 — selected-text lesson draft

The learner selects one to three text inputs, a goal, preferred explanation language, approximate level, lesson duration and a bounded focus such as reading, vocabulary, grammar, writing or dialogue. The output is a typed lesson draft, not merely unstructured Markdown:

    lesson draft
        → source revision or selected-source IDs
        → objective and bounded new-item load
        → source-linked sections and exercise specifications
        → vocabulary and construct candidates
        → resolver/claim provenance
        → model and policy version
        → status: draft

Deterministic preparation extracts source windows, tokens, resolver facts, coverage and available review targets. The LLM may sequence activities, phrase explanations above resolver facts and propose exercises. It may not invent authoritative morphology, grade free output, write FSRS, create persistent memory or add every proposed word to review.

The lesson stays learner-editable and requires an explicit publication/confirmation action. It must preserve source reading and offer a return-to-reading route; it is not a generic drill generator.

### Material lifecycle — target contract before durable M1

    uploaded
      → quarantined
      → scanned
      → rights_confirmed
      → queued
      → parsing
      → parsed
      → chunking
      → indexing
      → ready

Terminal or side states are failed, blocked, superseded, deleting and deleted. Every transition is versioned, idempotent, retryable, cancellable, budgeted, principal/tenant scoped, observable and recoverable after crash.

The required separation is:

| Store | Holds | Must not become |
|---|---|---|
| Metadata database | Ownership, rights, consent, revisions, status, provenance, deletion state and audit references. | A blob store for raw files/OCR or unbounded embeddings. |
| Encrypted object storage | Raw bytes and immutable revision objects, with lifecycle/deletion queue. | An untracked permanent archive. |
| Extracted-text storage | Normalized content with source/page/timestamp maps. | Linguistic authority. |
| Retrieval/index storage | Scoped segment retrieval with source/revision/expiry metadata. | Shared semantic state or a source of truth. |
| Derived artifacts | Lesson drafts, candidate exercises, structures and later memory links. | Orphans after source deletion. |

A shared physical index may be acceptable only after proven logical isolation by tenant_id, user_id, material_revision_id and chunk_id, RLS or equivalent enforcement, and negative tests for retrieval, cache, ranking and semantic-dedup leakage. Cross-user retrieval, cache reuse and training on private materials are prohibited.

### Staged source support

| Stage | Allowed planning scope | Not promised |
|---|---|---|
| M0 / LB0 | Explicitly selected pasted or otherwise permitted text for one editable lesson draft. | Durable library, broad ingestion or autonomous source selection. |
| M1 text-first corpus | User notes and clearly permitted text; only owner-approved parsers for formats such as text-first document import. | Purchased textbook ingestion by default, OCR, broad embedding or reuse. |
| M2 documents | PDF/PPTX/images with page locators and extraction-quality metadata. | Low-confidence OCR as a linguistic fact or opaque automatic publication. |
| M3 media | User-authorized audio/video/subtitles/links with transcript separated from media and timestamp maps. | Indefinite raw-media retention, automatic channel imports or speaking assessment. |

For a video/link pilot, the safer first contract is user-selected and permitted transcript text plus source URL/timestamps, not automatic remote fetching, storage or channel-wide ingestion. A later provider integration requires a separate rights, terms, region, retention, cost and failure-mode decision.

### Methodological sources are a different namespace

Learner materials provide content to practise. Methodological and educational sources may only inform a curated pedagogical claim registry: claim, source, applicability, contraindications, confidence, version and allowed scenario. They are not an unrestricted RAG corpus and do not become executable instructions.

## Learner-memory lifecycle and context discipline

### F1 memory lifecycle — target contract

    selected source interaction
        → memory candidate with source link and policy
        → learner-kept or policy-accepted structured memory record
        → corrected / contradicted / suppressed / expired
        → purge job and zero-reference reconciliation

Every durable record needs user scope, immutable ID, source links, status, evidence/provenance, policy/model version, creation/review/expiry time, correction lineage and deletion lineage. Structured fields are the first retrieval mechanism. Full transcripts and embeddings are not defaults.

Use a source-to-derived dependency index, expiry/status/user indexes, incremental purge workers, partitioned reconciliation, retry/DLQ, policy/model-version revalidation, hot/cold retention and content-free completion counters. A nightly full scan may remain a backstop for a small deployment; it is not the only scalable deletion mechanism.

### Context-pack contract

Each scenario receives the minimum reproducible, policy-filtered package:

1. curated pedagogical claims;
2. resolver or other authoritative Hebrew facts;
3. explicitly selected permitted material fragments;
4. allowlisted learner memory types;
5. current session and task.

The manifest records context_pack_id, principal scope, policy/model versions, claim/item/material/memory IDs, trust decisions, retrieval scores where used, token budget, generated/expiry time and explanation trace. It excludes raw class-D prompt content unless a separately approved consent/TTL category permits it.

Role-play receives only the current source, goal and unfinished line where allowed; it does not receive notification history or unrelated semantic profile. Weekly planning may receive goals, evaluated skill summary and unfinished tasks; it does not receive full transcripts by default.

## Database, storage and scale gates

SQLite remains acceptable for G0, C3a, N1 and non-durable LB0. The present architecture must not be silently extended under assumptions that a single process, lock or local disk remains sufficient.

Before CP1, durable A2 jobs, F1 at scale, M1 persistent material storage or any M2/M3 media ingestion, prepare and approve a DB Scale Decision containing:

- current read/write/lock/DB-size/storage baseline;
- projections for 20, 100, 1,000 and 10,000 active users;
- database write and background-job contention model;
- Postgres/RLS migration triggers and a portable repository contract;
- object-storage boundary and retrieval/index boundary;
- dual-run, backfill, reconciliation, rollback and delete/restore proof;
- encrypted backup, incident and restore responsibilities.

Existing canon already calls for a Postgres decision at an external pilot beyond roughly 20–50 active users, high-frequency agent writeback, write-lock impact on UX, teacher/organization accounts or horizontal-scale need. The Phase-2 capacity proposal further requires 5× expected-peak load with failure injection before 100 MAU, and before 1,000 MAU removes correctness dependence on process-local locks/limiters, separates workers and proves durable idempotency/backpressure. These are planning gates, not a command to migrate now.

New contracts must be portable: repositories remain the only writer abstraction, SQLite-specific single-writer behavior is not a product guarantee, and no workflow code writes directly to a database.

## Durable jobs, tenancy and FinOps

### S4 job/outbox model

Jobs are only for background work such as purge, evaluation candidates, indexing and material processing. Interactive correctness is not moved to a queue.

    queued → running → succeeded
                  ├→ failed → retryable queued
                  ├→ cancelled
                  └→ dead-letter

Each job/command has a type, principal/user/tenant scope, input/output artifact IDs, idempotency key, state version, lease, retry class/count, next availability, timeout, cancellation reason, cost reservation, error code and content-free audit trace. Required tests cover duplicate delivery, worker crash/reclaim, retry, cancellation, stale lease, saturation, provider outage/rate limit and dead-letter replay.

### Tenancy model

Do not add tenant_id indiscriminately to every existing table. Define and test the target relationships before expanding authority:

| Concern | Target rule |
|---|---|
| Learner/data owner | Personal memory and learner evidence belong to the learner. |
| Tenant/billing owner | May pay for a scope; does not acquire learner memory automatically. |
| Membership/role | Grants are explicit, revocable and auditable. |
| Teacher/admin access | Scoped grant only; enrollment is not consent. |
| Material owner | Personal material stays private; assigned material has a separately declared owner/access policy. |
| Shared content | Curated common content is separate from private learner material. |
| Cross-learner data | No shared private memory, retrieval or semantic profile. |

### FinOps and fairness

Budget policy must be explicit at global, tenant, user, scenario, role, provider, job, daily and monthly scopes. It requires reserve-before-call, final reconciliation, provider rate-limit handling, circuit breaker, concurrency caps, priority policy, per-tenant fairness, backpressure, watchdog, hard stop and fail-closed BYOK without managed fallback.

Every optional model call must degrade honestly to deterministic/local value where possible. Examples: a Lesson Builder failure returns selected-source preparation and an explicit retry path; it never fabricates a completed lesson. A Material Processor does not retry indefinitely or make unseen paid calls after cancellation.

## Evidence, scale and safety gates

| Area | Mandatory gate |
|---|---|
| Truth | G0 green; golden channel matrix; independent evaluator protocol before any authority. |
| Isolation | Cross-user/tenant negative tests for read, write, retrieval, cache, rank and delete. |
| Idempotency | Concurrent claims/writes, duplicate command delivery and job replay create one logical outcome. |
| Recovery | Worker crash, timeout, retry, cancellation, queue saturation and provider outage leave no ambiguous state. |
| Material safety | Oversize/parser bomb/malware/password-protected input, prompt injection and low-confidence extraction tests fail closed. |
| Lifecycle | Raw/revision/chunk/index/derived-memory deletion cascade; restore never resurrects deleted content. |
| Versioning | Parser, policy, model and embedding version migration/rebuild has reconciliation and rollback evidence. |
| Load | Tier-specific load profiles; bounded queue age, DB lock time, disk growth, cost and provider-error behavior. |
| Privacy | No prompt/audio/material content in operational logs; consent/revoke blocks access immediately. |
| Pedagogy | Resolver wins for linguistic truth; transfer/delayed evidence is measured with MNAR visible; no tutor self-certification. |
| UX | ru/en/he and RTL where relevant; Playwright inspection at 380×844; text fallback and no dead-end. |

## Rollout and rollback sequence

1. **Freeze truth:** decide G0 semantics; create cross-channel gold and retain negative/MNAR coverage.
2. **Write decision records:** C3, N1, LB0/M0, scale assumptions, material rights, A0–A4 autonomy, DB triggers and accountable owners.
3. **Adversarial critique:** run R1–R17 against each individual slice; resolve red flags before substantial code.
4. **Ship bounded P slices separately:** C3a, N1 and LB0 each have their own feature flag, golden fixtures, no-content-log proof, ru/en/he and 380×844 evidence.
5. **Shadow S0–S3:** freeze contracts, role registry, typed artifact/context manifest and CP0 observation without authority change.
6. **Approve persistence boundary:** accept S4–S7 before M1 or durable F1; run data migration and restore design reviews before creating persistent schemas.
7. **Introduce durable work incrementally:** CP1 enforcement, then CP2 jobs, then F1/LM1, F2 shadow evaluation and M1 text corpus only when their separate gates pass.
8. **Expand media and autonomy last:** M2/M3 and CP3/A2 only after lifecycle, provider, rights, capacity and learner-control proofs. CP4/A3 needs a separate owner decision.

Rollback always prefers: feature flag off → stop new calls/jobs → revoke access at policy boundary → preserve canonical learner truth → reconcile/tombstone derived artifacts → restore only content allowed by the deletion journal. No rollback may recreate deleted private material or mutate review_log outside its correction/annul route.

## Owner decisions required

1. **G0 grading:** desired explicit-skip/D1 behavior and strict/non-strict proclitic handling by channel.
2. **C3 scope:** browser-local advisory voice only, or a separately authorized cloud-ASR provider/region/retention/benchmark decision; confirm no v1 speech grade or raw-audio retention.
3. **N1 fairness:** alternate last claimed or last delivered; behavior when only one channel is eligible; retain exact one-per-day or approve another budget.
4. **LB0 product promise:** eligible source types, learner edit/publish point, maximum source count/size/new-item load and whether any selected text is retained after the draft.
5. **Material rights:** permitted text types; treatment of purchased/copyrighted material; declaration/legal-review route; regions; whether links, OCR, audio, video and embeddings are deferred.
6. **F1 privacy:** memory categories, default/opt-in retention, raw-source retention, correction/suppression, export/delete SLA and accountable privacy owner.
7. **F2 evaluation:** eligible scope/cadence, independent reviewer/oracle, rubric/gold threshold, MNAR policy, delayed-transfer outcome and stop condition.
8. **Scale/database:** operating thresholds, Postgres/RLS decision trigger, object-storage/index boundary, backup/restore owner and acceptable migration window.
9. **Tenant model:** learner, organization, teacher and billing-owner relationship; access grants; assigned-material and private-memory rules.
10. **Economics/autonomy:** managed budget and currency ceiling, BYOK boundary, per-scope caps, A0/A1/A2 default, A3 prohibition/gate and fatigue stop-loss.
11. **Operations:** named privacy/security, platform, education-quality and incident/support accountable owners; kill-switch authority and escalation route.

## Explicit DO NOT BUILD list

- No generic MCP, A2A or free agent-to-agent conversation platform.
- No agent that grants capabilities, selects another agent’s authority or writes arbitrary state.
- No default full transcript, shared semantic memory, cross-user retrieval, private-material model training or cache reuse.
- No broad textbook/PDF/OCR/media ingestion promise before rights, lifecycle, queue and storage gates.
- No raw OCR, audio, video, full transcripts or unbounded embeddings inside opaque learner_artifacts.
- No LLM-only linguistic truth, grading, mastery update or FSRS write.
- No autonomous lesson publication, card creation, weekly program or notification beyond an approved policy gate.
- No second writer for the notification daily budget or duplicate learner-state truth beside review_log.
- No premature Postgres migration merely for C3a/N1/LB0; no SQLite single-writer assumption beyond the approved transition gate.

## R1–R17 synthesis

- **R1/R10/R11:** Resolver and independent evidence remain above LLM prose. M2 OCR and M3 transcripts are source artifacts, never linguistic truth; measure benefits and regressions with an independent oracle.
- **R2/R4/R5:** Lesson work must create an actionable reading-first path, bounded cognitive load, editable provenance and a 380×844 mobile/RTL escape route back to source text.
- **R3/R6–R9:** Materials, memories, claims and derived artifacts are typed and provenance-visible. Private sources never become common corpus truth.
- **R12/R13:** One event/projection/artifact path; repositories are single writer abstraction; migrations need dry-run, replay, reconciliation and reversible rollout.
- **R14/R15:** Principal-derived access, action-time consent, user/tenant isolation, TTL, export/delete/revoke, deletion lineage and restore-without-resurrection are mandatory.
- **R16:** Role/scenario/provider/job budgets reserve before calls, reconcile afterward and degrade honestly; BYOK never silently becomes managed spend.
- **R17:** Deterministic-first grading, grader provenance, correction/annul, MNAR no-write, independent evaluator and transfer-based outcomes remain non-negotiable.

## Authority boundary

### May start after this approval, still as small separately approved slices

- G0 specification, independent cross-surface gold and the smallest repair that restores the gate.
- C3a, N1 and LB0 slice specifications, including adversarial critique and acceptance fixtures.
- S0–S3 architecture/contract work, role matrix, context/artifact schemas on paper and CP0 observation design.
- F1/F2/F3 and material-policy design records, evaluator protocols, rights analysis and scale/load test plans.

### Must not start without the additional listed decisions and gates

- Cloud ASR, stored audio/transcripts, pronunciation scoring or any voice-originated review event.
- Persistent personal material ingestion, OCR, video/audio/link processing, embedding/index work or background processors.
- Durable F1 memory, F2 authority, CP1/CP2, background A2, CP4/A3 or a broader tenant/teacher offering.
- Any generic multi-agent framework, cross-user/private-material reuse, default full transcript or LLM-only education authority.

## Source and review note

This document reconciles live code/migrations/tests with the owner-approved strategic interpretation of the research package. It is a decision-ready plan, not an implementation spec. Before each substantial implementation: create the slice spec, run adversarial R1–R17 review, lock gates and owner decisions, implement incrementally, verify ru/en/he plus Playwright at 380×844, and seek separate authority for any commit/push or production operation.
