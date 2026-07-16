# LinguistPro Wave 2 — S3 CP0 Observe-Only decision packet

**Date:** 2026-07-16
**Status:** `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; S3 design A/A/A/A/A/A/A/A/A and execution A/A/A/A/A/A/A/A/A are implemented in `34a0c2e`. CP0 is deployed default-off; S3-O evidence remains absent, so this is not `OPERATIONALLY_COMPLETE`.
**Authority:** S3 design only. No production observer, tracing table, migration, runtime hook, schema registry, API/UI/config, provider, deployment, enforcement, background job, durable memory or material ingestion is authorized.
**Owner approval:** 2026-07-16 — Decisions 1–9: A/A/A/A/A/A/A/A/A. This closes the S3 design decision only. It does not authorize CP0 implementation/deployment and does not mark S3 `OPERATIONALLY_COMPLETE`; §20 remains the binding execution and evidence gate.
**Repository baseline:** `main` / `3e8a780`; package `3.11.183`; `origin/main` aligned after the owner-approved S2 push.
**Predecessors:** owner-approved S0 B/B/B/B/B, S1 A/A/A/A/A/A/A/A/A and S2 A/A/A/A/A/A/A/A/A.
**S3 exit gate inherited from Wave 2:** existing scenarios are frozen and traced through a CP0 shadow envelope with no behavior change or new authority. Design approval alone does not satisfy the operational evidence gate.

> **Owner execution amendment — 2026-07-16:** the 10,000-run synthetic layer must use deterministic/local provider doubles with hard outbound-network denial and exactly zero real API/provider calls. Because a seven-day owner-live window is not currently available, S3-T/S3-L plus healthy default-off deployment may be recorded as `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; F1 and later AA2 default-off engineering may proceed under their own authorities. This does not equal `OPERATIONALLY_COMPLETE` and does not unblock CP1, a live external-agent connection or an external cohort. When S3-O later becomes feasible, findings are mandatory remediation debt: fix, rerun affected gates and restart the eligible seven-day window where required.

## 1. Executive recommendation

Adopt a **passive CP0 observer** around the existing single-controller runtime:

1. current code remains the only execution and truth path;
2. the observer receives copies of content-free facts after/beside live decisions and computes S1/S2 shadow classifications;
3. a shadow allow/deny/mismatch result is diagnostic only and can never block, retry, reroute, write, deliver, grade or change an API response;
4. raw prompts, selected text, learner answers, submissions, provider bodies, transcripts, API keys and capability tokens never enter the observer;
5. CP0 uses a dedicated user-scoped observation store rather than overloading `audit_log`, stdout or learner truth tables;
6. one bounded start marker and one bounded terminal summary per eligible run are sufficient for CP0; model/canonical/delivery rows are referenced, not copied;
7. observation writes are best-effort and fail-open for the learner path, with explicit drop/coverage accounting;
8. initial proof uses 100% content-free observation, not success-only or error-only sampling;
9. a pressure/leak circuit breaker disables CP0 immediately, but any disabled or materially incomplete interval is ineligible for a parity claim;
10. CP1 enforcement, F1 durable memory and any new role remain separately prohibited until S3 implementation and evidence are explicitly approved and completed.

The recommendation is deliberately not “add logging.” CP0 is a bounded comparison instrument: it must prove that the S1 role/capability map and S2 artifact/context contracts describe real live behavior without changing that behavior.

## 2. Epistemic and completion labels

- **`VERIFIED_LIVE`** — present in current code/schema and reachable now.
- **`VERIFIED_PARTIAL`** — useful telemetry exists but cannot reconstruct the CP0 run envelope.
- **`ABSENT`** — no current implementation was found.
- **`PROPOSED_CONTRACT`** — S3 design only; no implementation authority.
- **`DESIGN_APPROVED`** — owner accepted the S3 direction; no live evidence implied.
- **`OPERATIONALLY_COMPLETE`** — a separately authorized CP0 implementation passed every evidence gate in this packet.
- **`ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`** — CI/fixture, zero-real-provider synthetic, lifecycle and default-off deployment gates passed, but the unavailable owner-live window remains an explicit evidence debt. This state is sufficient for separately authorized F1 and AA2 default-off engineering, not CP1, live Agent Access or external promotion.
- **`PARITY_INELIGIBLE`** — coverage, privacy, load or observer-health evidence is insufficient; enforcement cannot advance.
- **`ZERO_BUDGET_VIOLATION`** — content leak, cross-user scope error, unauthorized canonical write, duplicate grade or deletion resurrection; one occurrence fails the gate.

S3 may be marked `OPERATIONALLY_COMPLETE` only from witnessed evidence. A committed decision packet is at most `DESIGN_APPROVED`.

## 3. Current observability baseline

| Mechanism | Status | What it proves | What it cannot prove |
|---|---|---|---|
| `llm_usage_ledger` | `VERIFIED_PARTIAL` | Managed pre-call reservation; scenario/provider/status/actual units; BYOK attempts best-effort | No run/role/workflow/route/template/context/output/validator lineage; BYOK rows may be missing |
| `llmGate` return metadata | `VERIFIED_PARTIAL` | Provider, schema mode, latency, output bytes, key source and model output metadata during the call | Mostly transient; reserve ID is not returned to the scenario; no common observation ID |
| Lesson Builder diagnostics | `VERIFIED_PARTIAL` | First/repair outcome, validation codes, schema mode, provider/model and latency/output buckets | Scenario-specific, client-visible draft only; not a general durable run trace |
| `agent_tasks` | `VERIFIED_PARTIAL` | Plan task ID, status and identifier-only payload | No schema/workflow/policy/source/context/model receipt |
| `agent_explanations` | `VERIFIED_PARTIAL` | Explanation ID, model/body and `facts_used`; purge tombstone behavior | Mixed free JSON; may contain source text; cannot be copied into CP0 |
| Review challenge/result | `VERIFIED_PARTIAL` | Challenge/attempt binding, mode/scope, stimulus provenance, deterministic verdict and canonical event ref | No common run envelope; grade candidate is intentionally transient |
| `review_log` | `VERIFIED_LIVE` | Canonical append-only review/skip/annul truth and policy/grader/resolver provenance | Must not become a tracing store or be copied as derived state |
| Notification ledgers | `VERIFIED_PARTIAL` | Deterministic local-day claim, reason/channel and backoff state | No common policy/consent/delivery lineage |
| `bot_action_log` | `VERIFIED_PARTIAL` | Content-free command/status/error/event linkage | Telegram-specific; includes channel coordinates; not a general CP0 schema |
| `audit_log` | `VERIFIED_PARTIAL` | Critical identity/consent/account actions; best-effort and user-scoped | Open `detail_json`, IP field and mixed critical actions make it unsuitable for high-volume CP0 runs |
| Agent stdout/errors | `VERIFIED_PARTIAL` | A few content-safe operational failures | Unstructured, incomplete, no run linkage/TTL/export semantics; must not receive context |
| Agent request/run/trace ID | `ABSENT` | None | No common cross-boundary correlation |
| Role/capability shadow decision | `ABSENT` | None | Cannot compare S1 intended authority with actual calls |
| S2 context/artifact manifest | `ABSENT` | None | Cannot prove scope, source/version or content-safe equality |
| Observer drop/coverage counter | `ABSENT` | None | Missing traces can look like successful parity |

## 4. CP0 authority boundary

### 4.1 What CP0 may do

- mint opaque observation/run IDs from server context;
- accept only a closed allowlist of content-free fields;
- classify actual calls against S1/S2 contracts in shadow;
- record start/terminal status, versions, counts, keyed digests and stable codes;
- link existing reservation, artifact, challenge, command and canonical event IDs;
- produce user-scoped detail and content-free aggregate metrics;
- detect mismatches, missing coverage, observer drops, stale starts and schema drift;
- expose operator-only aggregate evidence in a later separately approved implementation.

### 4.2 What CP0 may never do

- change live input, context, prompt, output, HTTP status/body or user-visible timing decision;
- approve/deny a tool, repository call, model route, publication or write;
- initiate a model/provider/tool call or retry;
- add context, repair output or choose a fallback;
- grade, append, annul, recompute or mutate learner truth;
- persist raw content or arbitrary exception/detail objects;
- authorize CP1, F1 or a reserved role by observation success alone.

The live result and side effects are computed without consulting CP0. Observer data flows one way: live boundary → sanitized observation event.

## 5. Eligible run and correlation model

An eligible CP0 run is one user- or policy-initiated invocation of an approved S1 scenario. Nested provider attempts, tool/repository capabilities and canonical writes belong to that run but are not independent top-level runs.

| Identifier | Contract |
|---|---|
| `observation_id` | Random server ID for the CP0 record family; never supplied by model/client |
| `request_id` | Server-minted per authenticated invocation; an accepted client idempotency key may be linked, never trusted as principal |
| `run_id` | Random server ID joining start and terminal observations |
| `parent_run_id` | Only for an explicitly declared nested workflow; no free role-to-role chain |
| `process_boot_id` | Random per process start; detects stale/incomplete intervals without exposing host identity |
| `sequence` | Monotonic per-process counter used for gap/drop diagnosis, not correctness |
| Existing refs | Reservation/task/explanation/draft/challenge/attempt/review-event/delivery IDs remain owned by their domain |

Retries remain attempts under one run when live code already treats them as one logical scenario. A new explicit user action creates a new run. CP0 does not invent idempotency semantics that live code lacks.

## 6. Observation record shape

S3 recommends two bounded record kinds.

### 6.1 Start marker

```json
{
  "record_kind": "RUN_STARTED",
  "run_id": "run_opaque",
  "request_id": "req_opaque",
  "process_boot_id": "boot_opaque",
  "sequence": 42,
  "role_id": "mentor.explainer",
  "scenario_id": "explain_sentence",
  "surface": "pwa",
  "workflow_version": "1.0.0",
  "role_registry_version": "1.0.0",
  "observer_schema_version": "1.0.0",
  "started_at": "2026-07-16T00:00:00.000Z"
}
```

### 6.2 Terminal summary

```json
{
  "record_kind": "RUN_TERMINAL",
  "run_id": "run_opaque",
  "terminal_status": "SUCCEEDED",
  "live_outcome_code": "OK",
  "shadow_decision": "ALLOW",
  "shadow_mismatch_codes": [],
  "capabilities_observed": ["get_sentence_context_if_available@1", "create_explanation@1"],
  "artifact_refs": ["context_manifest_ref", "explanation_ref"],
  "consent_check_codes": ["CLOUD_TEXTS_GRANTED", "AGENT_READ_TEXTS_GRANTED"],
  "route_ref": "mentor_advisory.1.0.0",
  "model_attempt_refs": ["llm_reservation_ref"],
  "canonical_event_refs": [],
  "publication_code": "USER_RESPONSE_AND_DERIVED_HISTORY",
  "latency_bucket_ms": 1000,
  "finished_at": "2026-07-16T00:00:00.800Z"
}
```

Actual implementation schemas must be closed, byte-bounded and use enums/IDs only. The examples create no registry file or table.

### 6.3 Why two records

- A start without a terminal record makes crash/timeout/observer-loss visible.
- A terminal-only record would hide processes that died before flush.
- Per-step durable rows would multiply SQLite writes before their value is proven.
- A bounded terminal list can reference existing domain rows without copying their content.

The target is at most two CP0 detail records per eligible run. Provider attempts already represented by ledger/domain diagnostics are linked; CP0 must not duplicate their bodies.

## 7. Shadow comparison dimensions

| Dimension | Actual fact | S1/S2 shadow expectation | Example mismatch |
|---|---|---|---|
| Role/scenario | Live facade/endpoint and caller module | Registered role/scenario pair | `ROLE_SCENARIO_UNREGISTERED` |
| Principal/surface | Authenticated server context | Allowed surface and principal binding | `SURFACE_SCOPE_MISMATCH` |
| Capability | Tool name or direct repository capability | S1 role allowlist | `CAPABILITY_NOT_ALLOWED_SHADOW` |
| Data class/scope | Context kind, rows/items/bytes and source type | S1 data boundary + S2 source/context contract | `DATA_SCOPE_MISMATCH` |
| Consent | Action-time result codes/snapshot ref | Exact required keys and timing | `CONSENT_CHECK_MISSING` |
| Route/model | Actual managed/BYOK/provider/model/schema mode | Registered route class and no-fallback rule | `ROUTE_POLICY_MISMATCH` |
| Budget | Reservation/ref or deterministic zero | S1 budget class and reserve-before-call | `BUDGET_RESERVATION_MISSING` |
| Artifact | Actual output/domain ID | S2 artifact type/schema/retention/publication | `ARTIFACT_CONTRACT_MISMATCH` |
| Canonical write | Challenge/attempt/verdict/command/event refs | Selector→grader→writer separation | `CANONICAL_LINEAGE_MISMATCH` |
| Delivery | Deterministic decision/claim and adapter outcome | Bound channel and action-time consent | `DELIVERY_LINEAGE_MISMATCH` |
| Retention/purge | Artifact class/tombstone code | S1 retention + S2 privacy tombstone | `RETENTION_CLASS_MISMATCH` |

Shadow outcomes are `ALLOW`, `DENY`, `MISMATCH` or `UNCLASSIFIED`. They never affect the live outcome. `UNCLASSIFIED` is not parity success.

## 8. Content-safety contract

### 8.1 Closed allowlist

CP0 may persist only:

- opaque user-scoped/domain IDs;
- role/scenario/workflow/schema/policy/route/provider/model/validator versions;
- enum status, decision, failure and mismatch codes;
- context/source kinds, counts, row/byte/unit buckets and per-user keyed digests;
- timestamps/durations/buckets;
- process boot ID/sequence and observer health counters.

### 8.2 Prohibited values

- source sentences, windows, digests, titles or translations;
- prompt templates rendered with data, model responses or repair candidates;
- learner answers, writing, role-play messages or transcript digests after their consent scope is purged;
- explanation/lesson bodies or `facts_used` copied from current free JSON;
- raw `user_id` inside the observation payload or exported telemetry, plus email, IP and Telegram chat/user/message coordinates anywhere in CP0 detail/aggregates; the dedicated SQLite row still requires its separate relational `user_id` scope column for export/delete and never exposes it as an observed field;
- BYOK/provider keys, webhook secrets, capability/handoff/pairing tokens;
- raw exception messages, SQL, filesystem paths or provider error bodies.

The observer uses a construction-time allowlist, not “serialize then redact.” Unknown fields reject the observation record, increment a content-safe rejection counter and leave the live scenario untouched.

### 8.3 Leak gates

Fixtures inject unique Hebrew/Russian/English sentinels, fake API-key shapes, raw user IDs, Telegram coordinates and prompt markers. After every run, scans cover the CP0 store, stdout capture, exports, backups and error paths. Any sentinel or secret-pattern match is a `ZERO_BUDGET_VIOLATION`.

## 9. Storage and lifecycle recommendation

Use a **dedicated user-scoped CP0 observation store** in the existing database for the bounded single-process pilot, only after a separately approved migration and S0 load/restore/delete proof.

| Store choice | Decision |
|---|---|
| `audit_log` | Reject for CP0 volume: mixed critical actions, open detail JSON and IP semantics |
| stdout/container logs | Reject as primary evidence: incomplete correlation, weak export/delete/TTL and higher leak risk |
| learner/canonical tables | Prohibited: telemetry is not learner truth |
| new external telemetry platform | Premature provider/infrastructure expansion outside S3 |
| dedicated user-scoped SQLite table | Recommended for owner/20→100 DAU proof while S0 SQLite thresholds remain green |

Conceptual storage rules:

- detail rows include `user_id` for dynamic export/delete but exported telemetry uses an opaque scoped reference;
- two record kinds, strict enums and a bounded manifest payload; no arbitrary JSON;
- detailed observations expire after **30 days**, matching the S1 operational class;
- content-free daily aggregates without user/domain IDs may remain **90 days** for trend/parity comparison; rare cells are suppressed or merged so scenario/surface combinations cannot re-identify a learner;
- revoke purges affected private-content digests/context refs according to S2; account delete removes all user-scoped details;
- backup/restore/export/delete evidence must include the new store before CP0 is operationally complete;
- no migration number or SQL is selected in S3 design.

## 10. Collection, buffering and failure semantics

1. Observation construction is synchronous and content-free; storage is outside the learner result decision.
2. A bounded in-process queue may batch CP0 writes; it is telemetry transport, not a durable job queue.
3. The queue has explicit item/byte caps and drops newest records on saturation; it never backpressures the learner request.
4. Every drop increments a content-free counter by reason and scenario class.
5. DB unavailable/busy, schema rejection or observer exception cannot change live output, provider count or canonical writes.
6. A process crash may lose the bounded tail; start/terminal gaps and boot IDs make the interval incomplete rather than silently green.
7. CP0 never retries a model/tool/domain action. Storage flush may retry only the same observation batch within a short bounded window.
8. Replayed observation insert uses its own stable record ID and cannot duplicate domain side effects.
9. Observation health has a global kill switch plus scenario switches, all default off until separately authorized.

Fail-open protects the learner path; it does not convert missing evidence into success.

## 11. Sampling and coverage

The initial CP0 proof observes **100% of eligible runs content-free**. Success-only, error-only and random low-rate sampling are rejected because they cannot prove role/capability parity.

| Metric | Gate |
|---|---:|
| Fixture/golden coverage | 100% start + terminal for every declared path |
| Canonical-write fixture coverage | 100%; zero missing challenge/attempt/event linkage |
| Synthetic mixed-load observation coverage | ≥99.5% start and ≥99.5% terminal; every gap/drop classified |
| Owner-live observation coverage | ≥99.5%; no unclassified successful path at closure |
| Zero-budget paths | 100% negative-test coverage; zero violation |

If the store cannot sustain 100% bounded observation at the accepted tier, S3 remains `PARITY_INELIGIBLE`; the response is to reduce observer overhead or stay at a smaller tier, not silently sample away the problem.

### 11.1 Coverage denominator

Coverage is not “rows found divided by rows found.” At the first eligible-run hook, CP0 increments an independent per-process `eligible_runs_total`; separate counters track start enqueued/persisted, terminal expected/enqueued/persisted and drops by stable reason/scenario class. A content-free boot heartbeat/checkpoint carries the last sequence and these counters outside the detail queue.

If a process boot has no clean final checkpoint, its unflushed tail is unknown. That boot interval is `PARITY_INELIGIBLE` unless an independent start/route counter proves the denominator. S3 must never infer that an absent run did not happen.

## 12. Parity evidence gates

### 12.1 Behavior and side effects

Run every current agent/Lesson Builder/Telegram/Mini App/notification smoke with observer off and on against identical fixtures:

- HTTP/status/error code and normalized user-visible output digest are identical for deterministic/mock fixture replays; for live probabilistic calls, the observer must pass through the one produced output unchanged and parity compares call/route/validation/side-effect lineage rather than demanding two independent model calls generate identical prose;
- provider/model call count, order, route and first/repair behavior are identical;
- DB/domain diff is identical after excluding CP0 tables and observer-health counters;
- task/explanation/challenge/review/annul/notification IDs and counts are identical;
- MNAR, consent revoke, BYOK failure, limits, kill switches and deterministic fallbacks are unchanged;
- no observer result is read by live control flow.

Any canonical write divergence, duplicate grade, changed provider call or response difference fails the gate.

### 12.2 Contract parity

- 100% of active S1 scenarios resolve to one registered role/scenario pair;
- every observed tool/direct repository capability is classified;
- every context class/source maps to an S2 manifest field or an explicit `UNCLASSIFIED` failure;
- every model attempt links route/template/context/validator/budget metadata without raw content;
- every derived/canonical/delivery output has the correct artifact/publication/retention classification;
- shadow `DENY|MISMATCH|UNCLASSIFIED` rates reach zero on golden fixtures before any CP1 proposal.

Live owner/pilot mismatches are investigated, not blocked by CP0. A residual mismatch prevents completion.

### 12.3 Performance and storage

- run the S0-approved 5× 100-DAU synthetic mix with CP0 off/on;
- DB/WAL queue p95 remains <50 ms and p99 <250 ms; lock errors remain <0.1%; zero lost/duplicate canonical events;
- deterministic interactive API remains p95 <1s and p99 <2s;
- observer-on route p95 regression is ≤5% relative and does not breach the absolute S0 SLO;
- observation queue does not exceed its bound; drop rate remains within the ≥99.5% coverage gate;
- measure rows/run, bytes/run, daily growth, purge duration, export RSS/delete lock and backup/restore impact;
- observer circuit-breaker drills leave the live scenario correct and mark the interval ineligible.

The relative 5% threshold is a proposed instrumentation budget, not a current measurement.

## 13. Evidence windows

S3 operational completion requires all three layers:

1. **CI/fixtures:** every active scenario, success/failure/degradation/consent/canonical-write path and leak sentinel.
2. **Synthetic:** at least 10,000 mixed runs at the S0 5× accepted-pilot peak, including DB unavailable/busy, process interruption and observer saturation. All provider/model behavior is fixture/local/loopback; hard network/provider tripwires must prove `external_provider_calls_total == 0` and `external_network_attempts_total == 0`, so free-tier API limits and cost are not consumed.
3. **Owner-only live, deferrable:** at least seven consecutive eligible days with ≥99.5% coverage, zero content leaks/behavior divergence and no unresolved active-scenario mismatch. Rare/destructive paths remain fixture-proven rather than manufactured on the owner profile. Its current unavailability does not block F1 after the engineering-complete gate, but does block full S3 completion and dependent promotions.

Any later owner-live defect creates a tracked corrective slice. Relevant CI/parity/sentinel/lifecycle/load gates are rerun after the fix; authority/privacy/canonical-write defects block CP1/AA2 live promotion and the affected rollout, and the seven-day window restarts when continuity was invalidated.

Before any later CP1 enforcement proposal at an external controlled pilot, require a separate 14-day/≥1,000-run content-free parity window at the accepted tier. Owner-only S3 completion does not automatically authorize CP1 rollout.

## 14. Rollout and rollback contract

| Stage | Scope | Entry gate | Exit/stop condition |
|---|---|---|---|
| S3-D | Decision/design only | S2 approved | Owner approves this packet; no runtime change |
| S3-T | CI/fixture implementation | Separate execution authority | Full behavior/write/provider/leak parity |
| S3-L | Synthetic load/failure proof | S3-T green | S0 thresholds/coverage green; zero real external API calls |
| S3-E | Engineering-complete checkpoint | S3-T/S3-L green + default-off deploy healthy | Record `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; separately authorize F1 |
| S3-O | Owner-only live, global flag + owner allowlist | Separate future launch authority and rollback rehearsal | Seven-day evidence window green after any remediation/restart |
| S3-P | 20-DAU proof, then bounded 100-DAU CP0 only | Separate owner launch decision | External 14-day parity gate; still no enforcement |

Rollback is observation-only:

1. disable the CP0 global switch;
2. stop accepting new observations and discard/drain the bounded queue safely;
3. do not roll back or edit any learner/domain/canonical row;
4. retain/purge CP0 rows under their lifecycle policy; never drop a migration during incident rollback;
5. verify live scenario/provider/write parity with observer off;
6. mark the disabled interval `PARITY_INELIGIBLE`.

## 15. Circuit breakers and alerts

CP0 disables itself and emits a content-free operator alert when any occurs:

- allowlist/schema rejection suggests possible content leakage;
- secret/sentinel scanner matches;
- observer queue is full or repeated flush failures breach coverage;
- CP0 writes contribute to S0 DB queue/lock/latency thresholds;
- CP0 storage/retention/purge exceeds the approved bound;
- cross-user reference validation fails;
- observer exception rate crosses the configured threshold.

Accountable functions inherited from S1:

| Function | S3 responsibility |
|---|---|
| Product owner | Approve scenarios, evidence window and promotion/stop decisions |
| Platform/security owner | Observer implementation, leak gates, flags, load and rollback |
| Privacy/lifecycle owner | Field allowlist, TTL, export/delete/revoke and aggregate safety |
| Education-quality owner | Confirm parity does not become self-certification or learning-outcome evidence |

One person may hold several functions, but evidence and decisions remain separately named.

## 16. Test and failure-injection matrix

Required later implementation evidence includes:

- every existing `scripts/premium/agent-*-smoke.js` family plus Lesson Builder, review-session, Mini App, Telegram review/content/nudge and web-push smokes;
- observer off/on golden response and DB diffs;
- cross-user guessed run/artifact IDs and surface-binding negatives;
- `user_id`/`userId` in tool args remains a hard reject;
- consent missing/revoked before read, during provider call and before write/delivery;
- raw Hebrew/Russian prompt/answer/API-key/Telegram sentinel scans;
- managed/BYOK success/failure, reservation denial, kill switch, first/repair and no silent fallback;
- deterministic grade, explicit skip, MNAR no-write, challenge replay, duplicate attempt and annul;
- notification at-most-once claim and failed delivery;
- observer DB unavailable, `SQLITE_BUSY`, malformed record, full queue and process crash between start/terminal;
- export/delete/restore with zero resurrection and no orphan user-scoped observations;
- 5× 100-DAU synthetic load and circuit-breaker rehearsal.

No owner-live test may intentionally expose private content or manufacture a destructive canonical failure when a fixture can prove it.

## 17. R1–R17 adversarial critique

| Role lens | Attack on S3 | Required resolution |
|---|---|---|
| R1 | A green trace may hide that derived prose overrode resolver authority. | Observe item authority/resolver versions and artifact classification; parity is not linguistic correctness proof. |
| R2 | Instrumentation coverage can become a vanity KPI detached from learning. | Coverage only licenses safety/contract claims; no engagement or learning-outcome claim follows. |
| R3 | Run IDs can form an untyped graph with false relationships. | Closed parent/domain reference types; cross-scope/orphan checks; no free role chaining. |
| R4 | Observer failures might surface as user dead ends. | Live path never reads observer decisions; observer failure is operator-only and fail-open. |
| R5 | CP0 tables/hooks can grow into a generic orchestration platform. | Two records/run, existing controller, no event bus/worker/agent society or enforcement. |
| R6 | Observing source refs could be mistaken for material lifecycle support. | Private revisions remain blocked; CP0 stores no material body and grants no ingestion promise. |
| R7 | Provider/model drift may look like parity if only success code is compared. | Observe route/model/template/validator versions and exact call/repair count. |
| R8 | Lesson traces could persist scaffolding or evaluator content. | Only IDs/codes/buckets; lesson/context/body/shadow text prohibited. |
| R9 | Shadow `ALLOW` can be promoted to truth/permission. | Shadow outcome is diagnostic with no authority; only live deterministic/canonical paths matter. |
| R10 | Missing observations can be silently counted as green. | Explicit denominator/drop/gap accounting; incomplete intervals are `PARITY_INELIGIBLE`. |
| R11 | Same-process observer and fixtures can self-certify architecture. | Independent DB diff/leak/load/failure oracles; production-like fault injection; parity does not prove educational quality. |
| R12 | Copying domain data into CP0 creates a second truth path. | Store references, never copied canonical/derived bodies; `review_log` remains canon. |
| R13 | Observer migration/rollback can corrupt or delay live writes. | Separate store, fail-open queue, S0 load gate, disable-only rollback and no migration drop. |
| R14 | Run IDs/digests/log fields can leak identity across tenants. | Server scope, per-user keyed digests, no raw IDs/coordinates in exports/aggregates, negative tests. |
| R15 | “Debugging” can defeat revoke/delete and raw-content promises. | Construction-time allowlist, no raw debug capture, revoke/delete/export/restore proof and zero leak budget. |
| R16 | CP0 overhead can consume the very SQLite/provider budget it measures. | No extra provider calls, bounded two-record design, queue/drop counters, 5× load and circuit breaker. |
| R17 | A grade trace can become an alternate review record. | Grade candidate remains transient; CP0 stores only challenge/attempt/event refs and cannot write/replay a verdict. |

### Synthesis

CP0 is useful only if it is less authoritative than the code it observes, less content-bearing than the product artifacts it references and honest about every missing observation.

## 18. Owner decisions

### Decision 1 — CP0 authority

- **A — passive one-way observer; live path remains sole authority (recommended).**
- **B — let shadow denials block clearly unsafe calls immediately:** this is CP1 enforcement and outside S3.
- **C — observer may repair/reroute failures:** creates new behavior/provider authority; reject.

### Decision 2 — storage boundary

- **A — dedicated user-scoped bounded CP0 store in current SQLite for the accepted pilot, gated by S0 load/restore/delete evidence (recommended).**
- **B — reuse `audit_log`:** mixes critical actions with high-volume open-detail telemetry.
- **C — stdout/external telemetry only:** weak lifecycle/correlation or premature infrastructure/provider choice.

### Decision 3 — record granularity

- **A — at most one start plus one terminal summary per run, referencing existing domain rows (recommended).**
- **B — durable row for every internal step/tool:** higher load before demonstrated value.
- **C — terminal summary only:** hides crash/incomplete starts.

### Decision 4 — content policy

- **A — construction-time closed allowlist; raw content/debug capture prohibited; unknown fields drop the observation and trip health evidence (recommended).**
- **B — serialize then redact:** one missed field leaks before/through redaction.
- **C — encrypted 24h raw capture:** requires separate evidence-capture authority and is not needed for CP0 parity.

### Decision 5 — sampling and coverage

- **A — 100% content-free observation for initial proof; ≥99.5% measured start/terminal coverage; incomplete intervals cannot pass (recommended).**
- **B — random 10% sample:** can miss rare authority/canonical paths.
- **C — errors only:** cannot prove successful-path parity.

### Decision 6 — retention

- **A — user-scoped detail 30d; content-free non-user aggregates 90d; revoke/delete rules from S2 (recommended).**
- **B — detail 7d:** smaller footprint but weak for seven/14-day windows and incident comparison.
- **C — retain detail for account lifetime:** contradicts bounded operational telemetry.

### Decision 7 — evidence gate

- **A — CI fixtures + 10,000-run 5× synthetic proof + seven owner-live days; separate 14-day/1,000-run external window before CP1 proposal (recommended).**
- **B — unit/smoke tests only:** cannot prove load, observer loss, restore/delete or live integration.
- **C — live owner use only:** sparse/destructive paths remain untested and same-profile evidence is weak.

### Decision 8 — failure and rollback

- **A — observer always fail-open; global/scenario switches and automatic pressure/leak circuit breaker; disabled interval is parity-ineligible (recommended).**
- **B — block requests when observation fails:** telemetry becomes availability authority.
- **C — keep observer running through leak/pressure alarms:** unacceptable privacy/correctness risk.

### Decision 9 — promotion boundary

- **A — approving this packet grants design status only; separate execution/deploy authority and witnessed evidence are required for `OPERATIONALLY_COMPLETE`; CP1/F1 remain separate (recommended).**
- **B — design approval authorizes implementation/deploy:** skips migration/load/privacy/rollback adjudication.
- **C — green CP0 automatically enables CP1/F1:** observation cannot self-authorize new authority.

## 19. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A**:

1. CP0 is passive and one-way.
2. Use a dedicated bounded user-scoped observation store, conditionally within current SQLite.
3. Store at most a start marker and terminal summary per run.
4. Enforce a construction-time content-free allowlist; no raw debug capture.
5. Observe 100% initially and require measured ≥99.5% coverage.
6. Retain user detail 30d and safe non-user aggregates 90d.
7. Require fixtures, 10,000-run synthetic load and seven owner-live days; external CP1 proposal needs its own 14-day window.
8. Observer failures are fail-open for users but fail the parity claim; leak/pressure trips the observer off.
9. Packet approval is design-only; implementation, deployment, completion, CP1 and F1 require later authority.

## 20. Exact gates after S3 design approval

### 20.1 To authorize S3 implementation

A separate execution prompt/owner approval must lock:

1. exact closed schemas/field allowlists and mismatch enums;
2. migration/storage design, row/byte caps, indexes and purge implementation;
3. instrumentation hook locations and proof that live code never reads shadow results;
4. queue/circuit-breaker limits and observer health denominator;
5. CI/synthetic/owner rollout commands, rollback steps and evidence artifact paths;
6. export/delete/backup/restore coverage;
7. exact feature flags/allowlist and no production enablement by default;
8. test matrix and stop conditions.

### 20.2 To mark S3 operationally complete

All of the following must be witnessed:

1. behavior/output/provider/domain-write parity with observer off/on;
2. zero unresolved S1/S2 mismatch or unclassified active scenario;
3. zero content/secret/cross-user/deletion-resurrection violations;
4. coverage and drop/gap evidence meets §11;
5. S0 load/SQLite/SLO/storage thresholds remain green;
6. purge/export/delete/backup/restore and observer rollback drills pass;
7. CI, zero-real-provider 10,000-run synthetic and seven-day owner evidence packets are preserved; the first two may support the explicit deferred-live intermediate state but not full completion;
8. owner explicitly records `OPERATIONALLY_COMPLETE` only after the later live evidence and required remediation.

Only then is the S0→S1→S2→S3 foundation fully operationally complete. Under the owner amendment, `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` may separately unblock F1 and AA2 default-off engineering before that point; it still does not authorize CP1 enforcement, live Agent Access, S4 jobs or external pilot expansion.

## 21. Explicitly prohibited by this S3 packet

- No production observer, runtime hook, tracing table or migration.
- No raw prompt/context/answer/transcript/provider body/debug capture.
- No role/tool/capability/route enforcement or behavior change.
- No extra provider/model/tool call, repair or fallback.
- No canonical write, grade, mastery, FSRS, consent/profile or delivery authority.
- No generic event bus, workflow engine, agent framework, durable queue or second writer.
- No new telemetry provider, database or object store.
- No S3 deployment, owner-live flag enablement or external cohort.
- No CP1, F1, reserved role, durable lesson/material/memory implementation.
- No commit/push until owner approval of this packet.

## 22. Source map

Primary sources inspected:

- `CLAUDE.md`; `docs/PROJECT_ROLES.md`.
- `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S0_SCALE_ENVELOPE_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S1_ROLE_AUTHORITY_REGISTRY_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/LINGUISTPRO_WAVE2_S2_TYPED_ARTIFACT_CONTEXT_HANDOFF_DECISION_PACKET_2026_07_16.md`.
- `docs/planning/ai_agent_education_strategy_2026_07_11/19_AGENT_CONTROL_PLANE_DESIGN.md`.
- Live `agent/runtime.js`, `agent/tools.js`, `agent/llmGate.js`, Lesson Builder, reviewer, grader, review-session, Telegram/Mini App and notification paths.
- Live `db/agentRepo.js`, challenge, learner-log/projection, identity/audit, handoff, notification and channel repositories.
- `migrations/020_identity.sql`, `026_agent_runtime.sql`, `027_telegram_channels.sql`, `028_agent_challenges.sql`, `032_notification_prefs_nudge_ledger.sql`, `033_nudge_state_snooze.sql` and `038_reading_handoff.sql`.
- Existing agent/Lesson Builder/review/Telegram/Mini App/notification smoke scripts under `scripts/premium/`.

No `.claude/PROD_OPS_PRIVATE.md` or private production data was opened. Unrelated `.agents/` and `docs/research/edu-quality-agentic/` remain untouched.
