# LinguistPro Wave 2 — S3 CP0 execution approval packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVAL_REQUIRED`; implementation contract prepared after the owner instruction “Стартуй”.
**Authority:** documentation and execution-adjudication only. Until Decisions 1–9 are explicitly approved, this packet authorizes no migration, runtime hook, CP0 table, feature flag, deployment or live observation.
**Repository baseline:** `main` / `5199d61`; package `3.11.183`; `origin/main` aligned at recon start.
**Predecessors:** owner-approved S0 B/B/B/B/B, S1 A/A/A/A/A/A/A/A/A, S2 A/A/A/A/A/A/A/A/A and S3 design A/A/A/A/A/A/A/A/A.
**Current state:** S3 remains `DESIGN_APPROVED`, not `OPERATIONALLY_COMPLETE`; CP0 implementation and evidence are absent.
**Owner amendment:** 2026-07-16 — the 10,000-run synthetic gate must consume zero real external-provider/API calls, and unavailable live windows are deferred rather than allowed to block downstream engineering. S3-T/S3-L plus healthy default-off deployment may earn `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; this permits separately approved F1 and AA2 default-off engineering to proceed, but not CP1, a live external-agent connection or an external cohort.

## 1. Purpose and recommended authorization

This packet converts the approved S3 design into an exact implementation contract. The recommended authorization is deliberately staged:

1. implement CP0 fixtures, storage, observer and evidence harnesses;
2. prove observer-off/on behavior, provider and canonical-write parity in CI;
3. prove the S0 5×/10,000-run synthetic envelope and lifecycle drills with deterministic/local provider doubles and **zero real external API calls**;
4. deploy the migration and code with CP0 globally **off**;
5. record `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` when S3-T/S3-L and default-off health are green, allowing separately authorized F1 work to proceed;
6. when owner-live evidence becomes feasible, obtain a separate launch approval, collect seven eligible live days in parallel with non-dependent downstream work, remediate any findings and only then adjudicate `OPERATIONALLY_COMPLETE`.

Recommended owner resolution: **A/A/A/A/A/A/A/A/A** in §18.

This packet still does not itself authorize F1, CP1, AA2, a generic event bus or raw debug capture. It defines the evidence state after which F1 and then AA2 default-off engineering may receive their own separate authorities without waiting for the deferred live window.

## 2. Live-code findings that constrain implementation

### 2.1 Existing execution boundaries

- Browser and Mini App agent routes call `agent/runtime.js`; Telegram content reuses the same runtime for plan and history views.
- Review execution is split across `agent/reviewSession.js`, Telegram review adapters, `agent/grader.js`, `agent/reviewer.js` and the canonical learner-log ingest/recompute path.
- Proactive notification policy and daily claim live in `db/nudgeCoordinator.js` and related notification/nudge repositories; delivery is a separate channel step.
- `agent/tools.js` is a closed tool-name router, but several approved roles call repositories directly. CP0 therefore cannot equate “tools observed” with “all capabilities observed.”
- `agent/llmGate.js` is the common managed/BYOK model-call boundary and is the correct place to observe route/attempt receipts without copying prompts or outputs.
- `identityRepo` dynamically exports/deletes every `user_id` table. A dedicated CP0 detail table can inherit that coverage, but must still receive explicit lifecycle, restore and resurrection tests.
- The server currently applies migrations through `db/migrate.js`; the next repository migration number is `039`.
- The current database has one shared Node SQLite connection and one process-local transaction lock. CP0 must remain bounded and fail-open under the S0 thresholds.

### 2.2 Why route-only logging is rejected

A route wrapper alone would miss:

- Mini App/Telegram reuse and background nudges;
- direct repository capabilities bypassing `agent/tools.js`;
- first/repair provider attempts;
- selector → grader → writer lineage;
- delivery after policy/claim;
- crashes between start and terminal persistence.

The implementation must observe at controller boundaries plus a small set of shared capability boundaries. It must never serialize the arguments or return values it observes.

## 3. Exact implementation slice

### 3.1 Proposed production files

| File | Responsibility |
|---|---|
| `migrations/039_cp0_observations.sql` | Dedicated detail and boot-health tables with bounds/indexes; no trigger and no learner-domain mutation |
| `agent/controlPlane/scenarioRegistry.js` | Closed S1 scenario/role/surface/capability/artifact/consent/route expectations |
| `agent/controlPlane/contracts.js` | Closed enums, schema versions, byte bounds and construction-time validators |
| `agent/controlPlane/observer.js` | `AsyncLocalStorage` run context, start/terminal construction, note-only boundary methods, queue and circuit breaker |
| `db/cp0ObservationRepo.js` | CP0-only batch insert, boot checkpoint, purge and evidence queries |
| `agent/runtime.js` | Central wrappers for agent scenarios; no scenario behavior change |
| `agent/tools.js` | Observe tool name/outcome only; never args/result/message |
| `agent/llmGate.js` | Observe provider/route/model/schema-mode/status/unit buckets and existing reservation reference only |
| Selected scenario modules/repositories | Emit closed direct-capability, consent, artifact, canonical-event and delivery codes only |
| `server.js` and Telegram/Mini App/background adapters | Set server-derived surface and invoke eligible wrappers; add flags and bounded sweep integration |

No new package, service, telemetry provider, worker process or network call is permitted.

### 3.2 Proposed evidence files

| File | Gate |
|---|---|
| `scripts/premium/cp0-observer-smoke.js` | schemas, start/terminal, shadow classification, fail-open, content sentinels, off/on parity |
| `scripts/premium/cp0-scenario-parity-smoke.js` | every active S1 scenario and every declared path |
| `scripts/premium/cp0-lifecycle-smoke.js` | export/delete/revoke/purge/backup/restore/no-resurrection |
| `scripts/premium/cp0-load-smoke.js` | 10,000 mixed runs at S0 5× profile, queue/DB/SLO/storage measurements, hard network/provider tripwire and zero real API calls |
| `scripts/premium/cp0-process-failure-smoke.js` | busy/unavailable DB, queue saturation, malformed record, process interruption and circuit breaker |
| `docs/research/cp0/2026-07-16/README.md` | stable evidence manifest, commands, source commit and epistemic labels |

The dated evidence directory is created only when results exist. Raw scratch logs remain outside git; bounded summaries and machine-readable metrics belong in the stable evidence directory.

## 4. Closed scenario registry v1

The initial registry contains these eligible top-level scenarios:

| Scenario ID | Primary role | Surfaces |
|---|---|---|
| `agent.plan` | `mentor.planner` | `pwa`, `miniapp`, `telegram` |
| `agent.explain_sentence` | `mentor.explainer` | `pwa` |
| `agent.explain_word` | `mentor.explainer` | `pwa` |
| `agent.explain_followup` | `mentor.explainer` | `pwa` |
| `agent.comprehension` | `mentor.comprehension_coach` | `pwa` |
| `agent.roleplay_start` / `turn` / `state` / `stop` | `mentor.dialogue_coach` | `pwa` |
| `agent.writing_targets` / `review` | `mentor.dialogue_coach` | `pwa` |
| `agent.study_summary` / `draft_retell` | `mentor.material_advisor` | `pwa` |
| `agent.lesson_build` | `lesson.composer` | `pwa` |
| `agent.next_text_explain` | `reading.recommender` | `pwa` |
| `review.start` | `review.selector` | `pwa`, `miniapp`, `telegram` |
| `review.answer` | `review.grader` + `review.writer` | `pwa`, `miniapp`, `telegram` |
| `review.skip` | `review.grader` + `review.writer` | `miniapp`, `telegram` |
| `review.hint` | `review.selector` | `miniapp` |
| `review.annul` | `review.writer` | `pwa`, `miniapp`, `telegram` where currently live |
| `profile.update` | `profile.editor` | `pwa` |
| `notification.nudge` | `notification.policy` + `notification.delivery` | `background` |
| `provider.byok_check` | `policy.controller` | `pwa` |

Authenticated read-only status/history views are recorded only as aggregate route-health coverage in v1, not as pedagogical runs. Pairing/session/bootstrap/account routes remain identity/audit operations, outside CP0 scenario parity.

Adding or renaming a scenario is a registry-version change and a test failure until its S1/S2 mapping is explicit. `UNCLASSIFIED` can never silently fall back to `ALLOW`.

## 5. Observation architecture

### 5.1 Run wrapper

`observer.observe(ctx, descriptor, execute)` performs this one-way sequence:

1. derive `user_id` and surface from trusted server context;
2. mint `request_id`, `run_id`, sequence and a `RUN_STARTED` record;
3. enter an `AsyncLocalStorage` run context containing IDs and closed counters only;
4. call the original function exactly once with its original arguments;
5. boundary helpers add only enum names, opaque domain references and numeric buckets;
6. derive terminal status from the already-produced result/error without changing it;
7. enqueue `RUN_TERMINAL` best-effort;
8. return or rethrow the original result/error unchanged.

If any observer operation throws, the wrapper disables/no-ops observation as required and still executes/returns the live path unchanged. The observer may not retry `execute`.

### 5.2 Boundary-note API

The only note methods are closed and primitive:

```text
noteCapability(capability_id, outcome_code)
noteConsent(consent_code)
noteRoute(route_ref, model_ref, schema_mode, attempt_code, reservation_ref)
noteArtifact(artifact_type, opaque_ref, publication_code)
noteCanonicalEvent(event_kind, opaque_ref)
noteDelivery(decision_ref, channel_code, outcome_code)
noteDegradation(code)
```

They accept no object payload, text, prompt, answer, provider body, error message or arbitrary metadata.

### 5.3 Actual versus expected capability proof

- `agent/tools.js` records each resolved tool name as `tool:<name>@1`.
- Direct repository paths emit named capability constants at the narrow controller/repository boundary.
- `scenarioRegistry.js` contains the expected role/capability set from S1.
- Terminal construction compares the actually observed set with the expected set.
- Missing, extra, disabled or unregistered capabilities generate stable mismatch codes.
- The comparison result is stored but never read by live control flow.

This is required to expose current direct-repository exceptions honestly; no “everything must become a tool” refactor is authorized.

## 6. Migration 039 contract

### 6.1 `cp0_observations`

Required columns:

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
run_id TEXT NOT NULL
request_id TEXT NOT NULL
parent_run_id TEXT NULL
process_boot_id TEXT NOT NULL
sequence INTEGER NOT NULL
record_kind TEXT NOT NULL CHECK IN (RUN_STARTED, RUN_TERMINAL)
role_id TEXT NOT NULL
scenario_id TEXT NOT NULL
surface TEXT NOT NULL
workflow_version TEXT NOT NULL
role_registry_version TEXT NOT NULL
observer_schema_version TEXT NOT NULL
terminal_status TEXT NULL
live_outcome_code TEXT NULL
shadow_decision TEXT NULL
manifest_json TEXT NOT NULL DEFAULT '{}'
latency_bucket_ms INTEGER NULL
created_at TEXT NOT NULL
expires_at TEXT NOT NULL
```

Database and application constraints:

- unique `(run_id, record_kind)`;
- index `(user_id, created_at)`, `(expires_at)` and `(process_boot_id, sequence)`;
- `manifest_json` UTF-8 length ≤3,072 bytes by application validator and SQLite `CHECK`;
- manifest keys and array values come from closed enums; maximum 64 total list elements and 64-character opaque references;
- no raw `user_id` inside `manifest_json`; relational `user_id` exists only for scoping/export/delete;
- two rows maximum per eligible run.

### 6.2 `cp0_observer_boots`

Content-free operational health:

```text
process_boot_id TEXT PRIMARY KEY
observer_schema_version TEXT NOT NULL
started_at TEXT NOT NULL
last_checkpoint_at TEXT NOT NULL
finished_at TEXT NULL
clean_shutdown INTEGER NOT NULL DEFAULT 0
eligible_runs_total INTEGER NOT NULL DEFAULT 0
start_enqueued_total INTEGER NOT NULL DEFAULT 0
start_persisted_total INTEGER NOT NULL DEFAULT 0
terminal_expected_total INTEGER NOT NULL DEFAULT 0
terminal_enqueued_total INTEGER NOT NULL DEFAULT 0
terminal_persisted_total INTEGER NOT NULL DEFAULT 0
dropped_total INTEGER NOT NULL DEFAULT 0
rejected_total INTEGER NOT NULL DEFAULT 0
circuit_open_total INTEGER NOT NULL DEFAULT 0
counters_json TEXT NOT NULL DEFAULT '{}'
expires_at TEXT NOT NULL
```

`counters_json` is a closed scenario/reason counter map ≤8,192 bytes. It contains no user/domain IDs. Boot health expires after 90 days. A boot without a clean final checkpoint is `PARITY_INELIGIBLE` unless an independent test counter proves its complete denominator.

## 7. Queue and failure limits

Initial fixed bounds:

| Control | v1 value |
|---|---:|
| Queue items | 512 records |
| Queue bytes | 512 KiB |
| Record bytes | ≤4 KiB total; manifest ≤3 KiB |
| Flush batch | ≤64 records |
| Flush cadence | 50 ms or batch full |
| Storage retry | Same batch only; at most 2 retries within 250 ms total |
| Saturation policy | Drop newest observation, increment reason counter, never backpressure live work |
| Boot checkpoint | At least every 1 second or 100 eligible runs, plus clean shutdown |

Automatic circuit-open conditions:

- any content sentinel, secret-pattern or cross-user validation hit;
- any unknown field/enum entering persistence construction;
- queue full or three consecutive flush failures;
- observer exception rate ≥5 in 60 seconds;
- CP0-induced S0 queue/lock/latency threshold breach;
- malformed persisted row or lifecycle failure.

Circuit-open disables new CP0 collection for the affected process, emits only a content-free stable alert code and marks the interval ineligible. It never changes the live response or canonical write.

## 8. Feature flags and rollout

Exact configuration contract:

| Variable | Default | Meaning |
|---|---|---|
| `CP0_OBSERVER_ENABLED` | `0` | Global collection switch |
| `CP0_OBSERVER_OWNER_IDS` | empty | Exact server principal allowlist; no wildcard in S3-O |
| `CP0_OBSERVER_SCENARIOS` | empty/all-registry only in fixtures | Optional closed scenario subset; unknown value fails startup validation |

Rules:

- code and migration may deploy with `CP0_OBSERVER_ENABLED=0` only;
- no environment mutation is part of the implementation commit;
- owner-live enablement requires separate approval after S3-T/S3-L evidence;
- a disabled interval is expected but contributes no parity evidence;
- rollback is flag-off; migration is retained and lifecycle-managed, never dropped during incident rollback.

## 9. Content-safety construction

### 9.1 Prohibited at API type level

Observer methods must not accept:

- prompts, context packs, source strings, titles, translations or model outputs;
- learner answers, submissions, transcripts or explanation/lesson bodies;
- exceptions, stack traces, SQL, filesystem paths or raw provider errors;
- emails, IPs, Telegram IDs/message IDs or channel coordinates;
- BYOK/provider keys, tokens, cookies, CSRF, handoff/pairing secrets;
- arbitrary objects or caller-supplied JSON.

### 9.2 Sentinel matrix

Fixtures inject unique Hebrew, Russian and English phrases plus fake key/token/cookie/IP/email/Telegram patterns through every success, validation, provider-failure and canonical-write path. Tests scan:

- both CP0 tables;
- captured stdout/stderr;
- user export;
- backup/restore copy;
- evidence summary artifacts.

One match is a `ZERO_BUDGET_VIOLATION`, opens the circuit and fails S3.

## 10. Hook inventory and stop rule

Before editing, the implementation session must produce a checked hook matrix for every scenario in §4:

```text
entry controller
trusted principal/surface source
expected role
direct tool/repository capabilities
consent check locations
model route attempts
derived artifact/write locations
canonical/delivery boundary if any
existing smoke oracle
```

If any active scenario cannot be covered without passing content into CP0 or changing the live controller result, implementation stops and returns to owner adjudication. It may not silently omit that scenario or weaken the denominator.

## 11. CI and parity gates

### 11.1 Required existing suites

At minimum, observer off/on coverage includes all currently declared scripts:

```text
smoke:agent-plan
smoke:agent-explain
smoke:agent-explain-burst
smoke:agent-llm-provider
smoke:agent-review
smoke:agent-explain-corpus
smoke:agent-explain-word
smoke:agent-followup
smoke:agent-comprehension
smoke:agent-material
smoke:agent-roleplay
smoke:agent-writing
smoke:agent-next-text
smoke:agent-profile
smoke:agent-byok
smoke:lesson-builder
smoke:telegram-content
smoke:telegram-review
smoke:telegram-cloze
smoke:telegram-dictate
smoke:telegram-selector
smoke:telegram-nudge
smoke:telegram-nudge-skillgap
smoke:nudge-channel-selector
smoke:miniapp-auth
smoke:miniapp-home
smoke:review-session
smoke:miniapp-review
smoke:miniapp-rollback
```

Unrelated long suites need not be duplicated unless the diff touches their owned boundary.

### 11.2 Independent parity oracle

For identical deterministic fixtures, capture before/after:

- HTTP status and normalized response digest;
- provider call count/order/route/first-repair behavior;
- domain DB diff excluding CP0 tables;
- task/explanation/challenge/review/annul/claim/action counts and opaque IDs;
- canonical `review_log` rows and projections;
- stdout sentinel scan.

The parity harness must compare independent snapshots; CP0 cannot declare its own parity. Probabilistic LLM tests run once and assert pass-through of that exact produced result plus unchanged call/validation lineage, not equality between two separate model generations.

## 12. Synthetic and performance evidence

`cp0-load-smoke.js` must run at least 10,000 deterministic/mock mixed runs representing the S0 5× accepted 100-DAU peak. These are logical scenario invocations, not users and not real model calls. Every LLM/provider branch uses committed deterministic fixtures, the existing local provider shim or a loopback fake server.

The load harness must install a hard outbound-network/provider tripwire before the first run. Any attempt to reach Gemini, OpenRouter, Google TTS/Translate, Dicta or another non-loopback provider fails the gate immediately. Required evidence includes:

```text
logical_runs_total >= 10000
external_provider_calls_total == 0
external_network_attempts_total == 0
managed_quota_reservations_against_real_service == 0
```

This keeps the 10,000-run gate independent of free-tier RPM/RPD/token limits and gives it a reproducible cost of zero external API units. Provider compatibility remains covered separately by bounded contract smokes against fixtures/loopback doubles; an explicitly approved single real-provider probe may diagnose production configuration, but is never multiplied by the synthetic run count and is not required to pass S3-L.

The harness records:

- p50/p95/p99 live-route latency off/on;
- DB transaction queue wait/duration, WAL growth and `SQLITE_BUSY` rate;
- provider/canonical event parity;
- start/terminal persisted coverage and classified gaps;
- queue high-water items/bytes, flush batches/retries/drops;
- rows/run, bytes/run, projected daily/30d/90d storage;
- RSS/CPU and purge/export/delete duration;
- circuit-breaker behavior under DB busy/unavailable and process interruption.

Acceptance remains inherited from S0/S3:

- DB/WAL queue p95 <50 ms and p99 <250 ms;
- lock errors <0.1%; zero lost/duplicate canonical events;
- deterministic API p95 <1s and p99 <2s;
- observer-on p95 regression ≤5% without breaching absolute SLO;
- ≥99.5% start and ≥99.5% terminal persistence with every gap/drop classified;
- zero content, cross-user or resurrection violation.
- exactly zero real external-provider/network attempts during the 10,000-run workload.

## 13. Lifecycle, backup and restore evidence

The lifecycle gate must prove:

1. `identityRepo.listUserScopedTables()` discovers `cp0_observations` automatically.
2. User export includes only that user's CP0 rows and never secret/raw content.
3. Account delete removes all corresponding detail rows.
4. 30-day detail purge and 90-day boot-health purge are bounded and idempotent.
5. Revoke removes/invalidates private-source digest/reference fields required by S2 without deleting canonical truth.
6. Backup followed by restore preserves valid CP0 rows and schema.
7. Deletion-journal replay after an old backup restore prevents account/CP0 resurrection.
8. Observer-off rollback leaves domain data untouched and CP0 rows under normal TTL.

No production backup or restore drill is authorized by initial execution approval; fixture/local copies prove S3-T/S3-L. Production owner-live rollout needs its own exact operational checklist.

## 14. Evidence stages and completion semantics

| Stage | Authorized after A/A/A/A/A/A/A/A/A? | Exit |
|---|---:|---|
| S3-T implementation/CI | Yes | Hook matrix, all fixture/parity/leak gates green |
| S3-L synthetic/lifecycle | Yes | 10,000-run S0 thresholds/lifecycle green and zero real external API calls |
| Default-off deploy | Yes | Migration/code healthy; flag remains `0`; no observation |
| `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` | Yes, after S3-T/S3-L + deploy health | F1 may proceed under separate authority; deferred evidence debt is recorded |
| S3-O owner-live enable | **No; separate future launch approval; not an F1 blocker** | Seven consecutive eligible days ≥99.5%, zero violation/mismatch after remediation/re-run as needed |
| `OPERATIONALLY_COMPLETE` | **No; separate evidence adjudication** | Owner reviews preserved evidence and records completion |
| F1 | Separate authority after engineering-complete state | Does not wait for S3-O |
| AA2 default-off engineering | Separate AA2 authority after AA1/S3 engineering gates | Does not wait for S3-O |
| CP1/live Agent Access/external cohort | No | Remain blocked on completed relevant live/security evidence and separate authority |

A successful implementation commit alone is not even engineering completion. S3-T/S3-L evidence plus a healthy default-off deployment may establish `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, but not `OPERATIONALLY_COMPLETE`. An owner-live interval with a drop, leak, unresolved mismatch or incomplete boot triggers a corrective slice and restarts the eligible window after correction.

Deferred live findings are binding engineering debt, not optional feedback. A future S3-O evidence packet must list every finding, severity, affected downstream epic and disposition. Any fix reruns the relevant scenario parity, sentinel, lifecycle and load subsets; a foundational authority/privacy/canonical-write finding blocks CP1 and AA2 live promotion and pauses the affected downstream rollout until corrected. Previously completed F1/AA engineering is regression-tested against the fix but is not automatically discarded when the finding is unrelated.

## 15. R1–R17 pre-code adversarial critique

| Lens | Execution attack | Locked response |
|---|---|---|
| R1 | Trace “success” could legitimize invented morphology. | CP0 observes authority/version codes only; linguistic correctness remains resolver/oracle work. |
| R2 | Coverage becomes a learning KPI. | S3 evidence proves safety/contract parity only, never learning efficacy. |
| R3 | Free run references form a false graph. | Closed parent/domain ref types; no raw/free edges. |
| R4 | Observer error changes response latency or creates a dead end. | Fail-open bounded queue; live output never reads shadow state. |
| R5 | CP0 grows into a generic orchestration platform. | Two rows/run, no worker/event bus/new provider/enforcement. |
| R6 | Source refs imply a material archive. | Content prohibited; private immutable revision storage remains blocked. |
| R7 | Model drift hides behind `OK`. | Route/model/schema/attempt codes observed at `llmGate`. |
| R8 | Lesson content/scaffolding leaks into trace. | Only artifact type/ref and validation/publication codes. |
| R9 | Shadow `ALLOW` is treated as asserted authority. | Diagnostic only; no live consumer may import observer output. |
| R10 | Missing runs disappear from denominator. | Independent eligible/expected counters and incomplete-boot ineligibility. |
| R11 | Observer self-certifies its own parity. | Independent response/provider/DB snapshot oracle and sentinel scans. |
| R12 | Telemetry becomes a second learner-state writer. | Dedicated references-only store; no domain writes or copied truth body. |
| R13 | Migration/rollback damages live writes. | Default-off deploy, separate table, disable-only rollback, no migration drop. |
| R14 | IDs leak across users. | Server-derived scope, relational user ownership, guessed-ID negatives and no raw IDs in manifests/aggregates. |
| R15 | Debug convenience defeats TTL/delete. | Closed primitive API, 30d/90d purge, export/delete/restore proof and zero leak budget. |
| R16 | Instrumentation consumes SQLite budget. | Fixed row/queue bounds, no provider calls, 5× load gate and pressure circuit. |
| R17 | Grade trace becomes a second review event. | Only challenge/attempt/event refs; grade body/candidate never persists in CP0. |

### Synthesis

The highest-risk false shortcut is route-level JSON logging. It appears observable but misses direct capabilities and can leak the exact content S2 forbids. The selected design uses narrow primitive notes and an independent denominator, accepting more implementation work in exchange for evidence that has architectural teeth.

## 16. Required implementation workflow after approval

1. Re-read this packet and the S0–S3 packets; verify `HEAD`, package version and next migration number.
2. Produce the hook matrix before code and stop on any unresolved active scenario.
3. Add independent failing tests/fixtures first, including sentinel and domain-diff oracles.
4. Implement migration/repository/contracts/registry/observer with CP0 default off.
5. Instrument one scenario family at a time and keep existing suites green off/on.
6. Run the complete §11 matrix and post-implementation R1–R17 diff critique.
7. Run lifecycle/failure injection and 10,000-run synthetic evidence with hard outbound-network denial and zero external provider calls.
8. Preserve bounded results under `docs/research/cp0/2026-07-16/`.
9. Stage only S3 files, run `git diff --check`, commit and push.
10. Verify normal production health after default-off deployment without enabling CP0.
11. Present S3-T/S3-L evidence for `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; proceed to separately authorized F1. Request S3-O only when a seven-day owner-live window becomes feasible.

## 17. Stop conditions

Stop implementation and return to the owner if:

- the next migration is no longer `039` or overlapping CP0 work appeared;
- unrelated tracked changes overlap any target file;
- an active scenario lacks a trustworthy principal/surface or independent parity oracle;
- coverage requires raw content, arbitrary errors or a second canonical writer;
- observer off/on changes a response, provider attempt, grade, canonical row, notification claim or delivery;
- load/lifecycle evidence breaches S0 thresholds;
- production enablement would be required to finish S3-T/S3-L;
- any real external API/provider/network attempt occurs in the 10,000-run harness;
- any secret/content/cross-user/deletion-resurrection sentinel appears.

## 18. Owner decisions

### Decision 1 — authorized slice

- **A — authorize S3-T + S3-L implementation/evidence and default-off deployment; keep S3-O separately gated (recommended).**
- **B — authorize code/tests only, no migration deployment:** safer production boundary but delays real migration compatibility proof.
- **C — treat “Стартуй” as authority for immediate owner-live collection:** skips required evidence; reject.

### Decision 2 — observer structure

- **A — central `AsyncLocalStorage` run wrapper plus primitive boundary notes (recommended).**
- **B — route middleware only:** incomplete capabilities/background coverage.
- **C — pass mutable trace objects through every domain function:** invasive and easier to leak content.

### Decision 3 — storage

- **A — migration 039 with dedicated bounded detail and boot-health tables (recommended).**
- **B — reuse `audit_log`:** mixed semantics and open detail JSON.
- **C — stdout/external telemetry:** lifecycle/denominator gaps or provider expansion.

### Decision 4 — schema and content

- **A — closed primitive API, ≤3 KiB manifest, two rows/run, raw content structurally prohibited (recommended).**
- **B — serialize and redact:** leak-prone.
- **C — encrypted raw debug window:** separate authority and unnecessary for parity.

### Decision 5 — queue and failure policy

- **A — fixed §7 bounds, drop-newest, fail-open and automatic circuit-open (recommended).**
- **B — synchronous writes on every boundary:** adds availability/latency authority.
- **C — unbounded queue:** violates S0/R16.

### Decision 6 — coverage

- **A — 100% initial observation with explicit boot denominator and ≥99.5% persisted coverage (recommended).**
- **B — sampled runs:** cannot prove rare canonical/authority paths.
- **C — successful runs only:** hides failure behavior.

### Decision 7 — evidence

- **A — independent off/on snapshots, full scenario matrix, lifecycle/failure gates and 10,000-run 5× load with hard zero-real-provider/network proof (recommended).**
- **B — new CP0 unit smoke only:** self-consistent implementation can still alter live behavior.
- **C — owner-live evidence only:** destructive and sparse paths remain unproved.

### Decision 8 — rollout and deferred live evidence

- **A — deploy default off; record engineering-complete/live-evidence-deferred when green; let separately authorized F1 proceed; run owner-only evidence later under separate approval (recommended).**
- **B — enable owner automatically after push:** conflates deployment with evidence launch.
- **C — enable a 20-user cohort immediately:** S3-O and S3-P gates skipped.

### Decision 9 — completion, remediation and next track

- **A — S3-T/S3-L + default-off health permit `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, F1 and later separately approved AA2 default-off engineering; S3-O findings require tracked remediation/relevant gate reruns before final completion or live promotion (recommended).**
- **B — green CI/synthetic evidence marks full `OPERATIONALLY_COMPLETE`:** erases the deferred live-evidence distinction.
- **C — successful CP0 automatically starts CP1/AA2:** observation cannot self-authorize new authority.

## 19. Recommended owner resolution

Approve **S3 execution A/A/A/A/A/A/A/A/A**. This authorizes implementation, local/CI/synthetic evidence and default-off deployment only. The 10,000-run gate must make zero real external API calls. Green S3-T/S3-L plus deployment health establish `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, making F1 and subsequently AA2 default-off engineering eligible for their own approvals without waiting seven days. It does not authorize the production flag/environment change, owner-live observation, full `OPERATIONALLY_COMPLETE`, CP1, F1 or Agent Access implementation by itself.

After approval, the next executable work is S3-T/S3-L. After those gates pass, the agent returns with engineering evidence and the F1 gate. The S3-O launch request is deferred until the owner can provide a seven-day window; its eventual findings must be remediated and relevant gates rerun before final S3 completion or dependent promotion.

## 20. Source map

Read and reconciled:

- `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`.
- `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md` plus local `.remember` and available Claude project-memory index.
- `docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md`.
- S0, S1, S2 and S3 decision packets dated 2026-07-16.
- Agent Access/Hermes decision packet dated 2026-07-16 for roadmap ordering only.
- Live agent runtime, tools, model gate, lesson, review, Telegram, Mini App, notification, identity, migration, backup/restore and lifecycle paths.
- Existing agent/Lesson Builder/review/Telegram/Mini App/nudge smoke scripts and package commands.

No `.claude/PROD_OPS_PRIVATE.md`, production secret or private user content was opened. Unrelated `.agents/` and `docs/research/edu-quality-agentic/` remain outside this packet.
