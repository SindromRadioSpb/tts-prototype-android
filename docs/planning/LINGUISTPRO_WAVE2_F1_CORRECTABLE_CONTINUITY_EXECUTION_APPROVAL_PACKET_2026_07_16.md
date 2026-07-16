# LinguistPro Wave 2 — F1 correctable continuity execution approval packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED`; Decisions 1–10 A/A/A/A/A/A/A/A/A/A approved 2026-07-16.
**Authority:** this packet authorizes no production code, migration, API/UI/config change, provider call, CP0 enablement, owner-live window, commit, push, deploy or production operation until the decisions in §18 are explicitly approved.
**Owner approval:** 2026-07-16 — Decisions 1–10: A/A/A/A/A/A/A/A/A/A. This authorizes the bounded implementation, migration 040, deterministic evidence, scoped commit/push and default-off deployment described here; it does not authorize F1/CP0 enablement or owner-live collection.
**Repository baseline:** `main` / `ad9be2e`; package `3.11.184`; `origin/main` aligned at inspection.
**Contract:** `LINGUISTPRO_WAVE2_F1_CORRECTABLE_CONTINUITY_DECISION_PACKET_2026_07_16.md`, owner-approved A/A/A/A/A/A/A/A/A/A/A/A on 2026-07-16.
**Predecessor state:** S3 CP0 is `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, deployed default-off. CP0 remains off and S3-O is not part of this execution.

## 1. Recommended execution authorization

Authorize a single bounded F1 engineering slice:

1. add migration 040 and a dedicated user-scoped memory repository;
2. implement closed memory/source/query contracts and deterministic candidate selection;
3. add authenticated first-party APIs and Mentor Home Memory UI;
4. extend export/delete/restore erasure guarantees;
5. add F1 scenarios to the content-free CP0 registry while leaving CP0 disabled;
6. prove schema, authority, lifecycle, isolation, canonical parity, restore and mobile UI locally;
7. run at least 10,000 deterministic local operations with a hard external-network/provider tripwire;
8. preserve bounded evidence in the stable F1 research directory;
9. commit/push and deploy code+migration with every F1 flag off;
10. verify ordinary production health only, without enabling F1 or CP0;
11. return with `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` evidence and a separate owner-live launch request.

Recommended owner resolution: **A/A/A/A/A/A/A/A/A/A** in §18.

## 2. Entry-state verification

Verified before preparing this packet:

- `main == origin/main == ad9be2e`; package `3.11.184`.
- migration 039 is the current highest migration; 040 is free at inspection.
- existing untracked `.agents/` and `docs/research/edu-quality-agentic/` are unrelated and must remain untouched.
- the only new task artifact is the owner-approved F1 decision packet.
- no F1 tables, repository, API, UI, consent key, context query or erasure journal exists.
- Mentor Home is API-only and already owns the appropriate first-party UI surface.
- the hourly ops sweep, dynamic user-table export/delete and restore-erasure replay are live extension points.
- CP0 is default-off, exact-owner allowlisted and content-free; adding registry scenarios does not enable collection.

Implementation stops if any of these facts changes before coding.

## 3. Exact implementation files

### 3.1 New production files

| File | Responsibility |
|---|---|
| `migrations/040_f1_correctable_continuity.sql` | Five bounded F1 tables, checks, FKs and indexes |
| `db/learnerMemoryRepo.js` | Single SQLite writer abstraction for records/revisions/sources/query receipts/purge/export |
| `agent/memory/contracts.js` | Closed enums, per-kind payload validators, limits, stable codes and canonical digests |
| `agent/memory/sourceAdapters.js` | Strict adapters over existing task/explanation/personal/public source readers |
| `agent/memory/candidates.js` | Explicitly triggered deterministic ≤3 proposal scan; no provider/model |
| `agent/memory/contextQuery.js` | First-party deterministic Continue selection and content-free audit receipt |
| `agent/memory/runtime.js` | Controller joining principal, consent, flags, repository and typed responses |

No new package, service, queue, vector store, telemetry provider or network client is permitted.

### 3.2 Modified production files

| File | Change boundary |
|---|---|
| `server.js` | Flags, rate limits, routes, consent revoke cascade and bounded hourly purge call |
| `db/identityRepo.js` | Explicit erasure-journal exemption; redacted export; account-delete ownership transfer |
| `db/restoreErasureReplay.js` | Replay still-retained per-memory erasures after old-backup restore |
| `agent/controlPlane/scenarioRegistry.js` | Register F1 scenario IDs/capabilities only; CP0 remains diagnostic/off |
| `public/js/mentor-home.js` | Memory block, cards, controls, exact API adapter and no mount-time writes |
| `public/library.html` | Memory block styles/mobile rules only; no new standalone page |
| `public/i18n/locales/{ru,en,he}.js` | Complete F1 copy and states in all locales |
| `public/sw.js` | Package-aligned cache bump for precached shell/locales/module |
| `public/index.html` | Locale script cache-bust bump required by shared locale files |
| `package.json` | Package version and F1 smoke commands |

No change to `review_log`, FSRS reducers, grader, reviewer, resolver, learner projection, Lesson Builder, AA/OAuth/MCP code or provider routing is permitted.

### 3.3 Evidence files

| File | Gate |
|---|---|
| `scripts/premium/f1-memory-contract-smoke.js` | Schema, validators, API shapes, flags and authority |
| `scripts/premium/f1-memory-lifecycle-smoke.js` | Correction/suppression/expiry/annul/resolve/delete/consent |
| `scripts/premium/f1-memory-isolation-smoke.js` | Cross-user reads/writes/sources/queries/export/delete negatives |
| `scripts/premium/f1-memory-restore-smoke.js` | Old-backup per-memory and account zero-resurrection |
| `scripts/premium/f1-memory-ui-smoke.js` | Mentor Home states, locales, no mount write and browser behavior |
| `scripts/premium/f1-memory-load-smoke.js` | ≥10,000 mixed operations, S0 measurements and zero network/provider attempts |
| `docs/research/f1-correctable-continuity/2026-07-16/README.md` | Stable evidence summary, commands, source commit and epistemic labels |
| `docs/research/f1-correctable-continuity/2026-07-16/metrics.json` | Bounded scored gate metrics only |

Disposable databases, screenshots under active iteration and verbose logs remain in OS temp/scratch. Final screenshot evidence is copied into the stable directory.

## 4. Logical roles and CP0 scenarios

### 4.1 Role delta

Add one deterministic logical role to the S1 registry:

```text
role_id: memory.manager
authority: READ_SCOPED, USER_ASSERTED_WRITE, POLICY_DECIDE
model_route: NONE_DETERMINISTIC
budget_class: ZERO
allowed inputs: authenticated principal, F1 consent snapshot, typed source refs, direct user actions
allowed outputs: pending candidate, user-declared/confirmed record, lifecycle receipt, context selection
forbidden: provider/model call, canonical event append, profile/consent mutation, grading, source-body retention
kill switch: F1_MEMORY_ENABLED plus exact owner allowlist
```

`memory.extractor` remains `RESERVED_DISABLED` with no tools, route, budget or publication authority. This prevents a deterministic candidate rule from silently activating a future model extractor.

### 4.2 Scenario registry additions

| Scenario ID | Surface | Capabilities | Canonical write? |
|---|---|---|---:|
| `memory.manage` | `pwa` | `repo:memory`, `repo:memory_source` | No; user-declared memory only |
| `memory.propose` | `pwa` | `repo:memory`, `repo:memory_source` | No; pending candidate only |
| `memory.context_continue` | `pwa` | `repo:memory_query` | No |
| `memory.export` | `pwa` | `repo:memory_export` | No |
| `memory.delete` | `pwa` | `repo:memory_delete` | No; privacy erasure only |

CP0 receives codes/opaque refs only if it is enabled in a future separately approved interval. F1 implementation does not change `CP0_OBSERVER_ENABLED`, its allowlist or S3-O status.

## 5. Migration 040 contract

### 5.1 `learner_memory_records`

Required columns:

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
kind TEXT NOT NULL CHECK IN (declared_goal, unfinished_thread)
authority_class TEXT NOT NULL CHECK IN (USER_DECLARED, DERIVED_CANDIDATE, USER_CONFIRMED_DERIVED)
status TEXT NOT NULL CHECK IN (PENDING, ACTIVE, SUPPRESSED, EXPIRED, ANNULLED, RESOLVED)
use_enabled INTEGER NOT NULL CHECK IN (0,1)
priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 9)
current_revision_id TEXT
dedupe_key TEXT
schema_version TEXT NOT NULL
policy_version TEXT NOT NULL
consent_snapshot_ref TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
review_at TEXT
expires_at TEXT NOT NULL
```

Indexes:

- `(user_id, status, kind, expires_at)`;
- `(user_id, use_enabled, status, priority, updated_at)`;
- unique non-null `(user_id, dedupe_key)` for non-terminal pending/active/suppressed records through a partial index.

Application-enforced bounds: ≤100 non-purged records/user, ≤20 active/kind and ≤10 pending/user.

### 5.2 `learner_memory_revisions`

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
memory_id TEXT NOT NULL REFERENCES learner_memory_records(id) ON DELETE CASCADE
ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 16)
operation TEXT NOT NULL CHECK IN (CREATE, KEEP, CORRECT, SUPPRESS, UNSUPPRESS, RECONFIRM, RESOLVE, ANNUL)
actor_class TEXT NOT NULL CHECK IN (USER, DETERMINISTIC_POLICY)
payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) <= 2048)
payload_digest TEXT NOT NULL
reason_code TEXT
created_at TEXT NOT NULL
UNIQUE(memory_id, ordinal)
```

Payload schemas use `additionalProperties=false` in `contracts.js`. A DB byte check does not replace application validation.

### 5.3 `learner_memory_source_links`

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
memory_id TEXT NOT NULL REFERENCES learner_memory_records(id) ON DELETE CASCADE
revision_id TEXT NOT NULL REFERENCES learner_memory_revisions(id) ON DELETE CASCADE
source_kind TEXT NOT NULL
relation_kind TEXT NOT NULL
source_ref TEXT NOT NULL
source_revision_ref TEXT
source_authority TEXT NOT NULL
anchor_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(anchor_json AS BLOB)) <= 1024)
keyed_digest TEXT
source_status TEXT NOT NULL CHECK IN (AVAILABLE, DRIFTED, REVOKED, PURGED)
created_at TEXT NOT NULL
```

Maximum five source links/revision. Closed source/relation/authority values are enforced by `contracts.js` and fixture checks.

### 5.4 `memory_context_queries`

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
purpose TEXT NOT NULL CHECK IN (MENTOR_HOME_CONTINUE, MEMORY_MANAGEMENT_VIEW)
surface TEXT NOT NULL CHECK IN (pwa)
policy_version TEXT NOT NULL
consent_snapshot_ref TEXT NOT NULL
eligible_count INTEGER NOT NULL CHECK(eligible_count BETWEEN 0 AND 100)
selected_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(length(CAST(selected_ids_json AS BLOB)) <= 1024)
exclusion_counts_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(exclusion_counts_json AS BLOB)) <= 2048)
source_checks_json TEXT NOT NULL DEFAULT '{}' CHECK(length(CAST(source_checks_json AS BLOB)) <= 1024)
terminal_code TEXT NOT NULL
created_at TEXT NOT NULL
expires_at TEXT NOT NULL
```

No memory payload, source text, prompt, provider output or free error is allowed.

### 5.5 `memory_erasure_journal`

```text
user_id TEXT NOT NULL
memory_id TEXT NOT NULL
deleted_at TEXT NOT NULL
reason_code TEXT NOT NULL
PRIMARY KEY(user_id, memory_id, deleted_at)
```

This table deliberately has no FK and is added to `identityRepo.SWEEP_EXEMPT`. It contains no memory content, source/digest, email, channel ID or provider data. Entries remain beyond the oldest retained backup; the initial engineering fixture uses 30 days and must compare that value with the live backup-retention contract before launch.

## 6. Repository transaction rules

1. Every public repository method accepts `userId` from the authenticated controller; no payload `user_id` is accepted.
2. Create/Keep/Correct/Suppress/Unsuppress/Reconfirm/Resolve/Annul/Delete are each one `withTxnLock` + `BEGIN IMMEDIATE` transaction.
3. A mutation carries an idempotency key or expected current revision. Same key/digest replays; same key/different digest returns `IDEMPOTENCY_CONFLICT`.
4. Record row, revision row, current revision pointer and source links commit together.
5. Delete inserts the erasure journal before deleting the record cascade in the same transaction.
6. Query-time status/expiry/consent filtering is authoritative; cleanup timing cannot reactivate a record.
7. Repository methods never call a model, resolver, provider, external agent or source parser outside the named adapters.
8. No method writes `review_log`, projections, `agent_profiles`, `agent_tasks`, `agent_explanations` or consent rows.

## 7. Source adapter matrix

| Adapter | Reads | Valid result | Failure behavior |
|---|---|---|---|
| `USER_ACTION` | Server request/action receipt | Authenticated surface, action and timestamp | Missing receipt rejects mutation |
| `AGENT_TASK` | Exact user-scoped task row | Allowlisted kind plus named closed payload adapter and live action anchor | Unknown/free payload is ineligible; never copy it |
| `AGENT_EXPLANATION` | Exact user-scoped explanation row | Unpurged explanation with typed source fact/anchor | Purged/malformed/missing becomes unavailable |
| `PUBLIC_CORPUS_ANCHOR` | `corpusSentenceRepo` | Exact corpus/work/text/order and current corpus revision | Missing/revision mismatch fails; no fuzzy work selection |
| `PERSONAL_TEXT_ANCHOR` | `agentSentenceRepo`/consented artifact path | Current consent, exact row/order, `updated_at` and per-user keyed digest match | Revoke/missing/drift marks source unusable; no retained body |
| `PROFILE_FIELD` | Exact `agent_profiles` field | Virtual display only | Never creates a memory row |
| `CANONICAL_EVENT_REF` | User-scoped `review_log` event reference | ID/version reference only | Never reads it into a skill/mastery statement |

All adapter results are typed projections. Consumers cannot receive the original repository object or source body.

## 8. Deterministic candidate algorithm

Candidate creation requires all of:

- explicit `POST /api/agent/memory/proposals` from a user tap;
- global, owner allowlist and candidate flags on;
- live `mentor_memory_store` and `mentor_memory_candidates` grants;
- no candidate scan already in flight for that user;
- pending count below 10.

The algorithm:

1. inspect at most 20 recent rows/source family within a seven-day lookback;
2. accept only named source adapters;
3. form a closed `unfinished_thread` next-action code and source refs;
4. dedupe by per-user keyed source+action digest;
5. sort newest eligible action, then stable source ID;
6. write at most three `DERIVED_CANDIDATE/PENDING/use_enabled=0` records;
7. set expiry to seven days;
8. return typed summaries without source bodies.

No ordinary Mentor Home mount, history view, app boot, scheduler or ops sweep generates candidates. No goal or preference is inferred.

## 9. API contract

All routes require authenticated first-party PWA session. Every mutation requires CSRF and a dedicated rate limiter. Unknown fields reject.

| Route | Method | Purpose |
|---|---|---|
| `/api/agent/memory` | GET | Cursor-paginated management view; max five/page |
| `/api/agent/memory` | POST | Direct `declared_goal` or explicit `unfinished_thread` save |
| `/api/agent/memory/proposals` | POST | Explicit deterministic scan |
| `/api/agent/memory/:id/action` | POST | Closed action enum with expected revision/idempotency |
| `/api/agent/memory/continue` | GET | One first-party Continue item plus “why” codes |
| `/api/agent/memory/export` | GET | Deterministic redacted memory-only export |
| `/api/agent/memory/delete-all` | POST | Typed confirmation + synchronous category/global erase |

Action enum:

```text
KEEP, CORRECT, SUPPRESS, UNSUPPRESS, RECONFIRM, RESOLVE, ANNUL, DELETE
```

Stable response/error codes include:

```text
F1_DISABLED, F1_NOT_ALLOWLISTED, CONSENT_REQUIRED, CATEGORY_DISABLED,
MEMORY_NOT_FOUND, MEMORY_LIMIT, PENDING_LIMIT, REVISION_LIMIT,
ACTION_INVALID, STATE_CONFLICT, IDEMPOTENCY_CONFLICT,
SOURCE_UNAVAILABLE, SOURCE_DRIFT, SOURCE_REVOKED,
CONTEXT_EXPIRED, PURGE_FAILED, EXPORT_FAILED
```

The client never sends a user ID, arbitrary source body, model output, free-form authority/status or raw digest.

## 10. Consent and revoke execution

Reuse append-only `consent_records` with exact versioned keys:

```text
mentor_memory_store
mentor_memory_unfinished
mentor_memory_candidates
```

Rules:

- direct Save may show situated copy and then call the existing consent endpoint before retrying the save;
- `mentor_memory_candidates` revoke hard-deletes pending candidates only;
- `mentor_memory_unfinished` revoke hard-deletes unfinished-thread records and prevents Continue queries;
- `mentor_memory_store` revoke hard-deletes all F1 memory and query receipts while retaining the content-free erasure journal;
- purge happens synchronously for the bounded owner slice; failure is visible, audit-coded and context use remains blocked;
- no F1 action writes consent on behalf of a model or external client;
- existing `cloud_texts`/`agent_read_texts` revoke additionally makes dependent personal source links unusable immediately; it does not delete canonical truth.

## 11. Context query execution

Initial live purpose is only `MENTOR_HOME_CONTINUE`:

1. derive principal and current consent snapshot;
2. filter `ACTIVE`, `use_enabled=1`, unexpired `unfinished_thread` rows;
3. revalidate every source link;
4. exclude drift/revoke/missing sources and record closed counts;
5. sort direct user saves over confirmed candidates, then priority, newest unresolved source action and stable record ID;
6. return at most one item and ≤1,024 payload bytes;
7. write one content-free 30-day query receipt;
8. provide a first-party action target only; no arbitrary URL.

The management-view purpose may audit filter/selection behavior but cannot influence the Continue ranking. Declared goals are stored and manageable in F1 but are not injected into existing planner/model prompts until a later separately approved scenario contract.

## 12. Export, delete and restore implementation

### 12.1 Memory-only export

Return deterministic canonical JSON containing records, current and historical revisions, learner-safe source locators/statuses, consents and retained query receipts. Omit session secrets, raw/private digests and source bodies.

### 12.2 Structural account lifecycle

- Four F1 user-scoped tables are auto-discovered by account export/delete.
- `memory_erasure_journal` is explicitly exempt, redacted into export and managed manually.
- During account deletion, per-memory erasure rows are removed only inside the same transaction that writes the account `deletion_journal`; account erasure then owns resurrection prevention.
- Post-delete completeness checks include the explicit journal rule.

### 12.3 Restore replay

`replayDeletionJournal` reads the automatic pre-restore snapshot and replays:

1. account erasures as today;
2. retained per-memory erasures for accounts that still exist;
3. erasure journal rows idempotently;
4. zero-reference reconciliation.

Failure leaves the restored database unusable for normal startup/adjudication and reports a stable content-free error. The restore smoke proves a deleted memory stays absent, an undeleted memory and another user survive, and `review_log` replay remains identical.

## 13. UI implementation

Mentor Home order becomes:

```text
status -> plan/reading/writing/lesson -> Telegram -> settings -> Memory -> explanation history -> constructs
```

The Memory block contains:

- global/category switches and exact consent copy;
- Add goal and explicit Find possible continuations actions;
- Active / Proposals / Hidden / History filters;
- one card component with authority/source/use/expiry labels;
- Keep/Edit/Not true/Stop using/Use again/Resolve/Delete/Open source actions as valid;
- deterministic “Why this?” disclosure and “Used by” receipts;
- Export memory and Delete all memory;
- honest empty, disabled, offline, source-drift, revoke-purge-failed and limit states.

Mount and refresh remain read-only. Dynamic memory/source text uses `textContent`. The block must not auto-open, auto-save, auto-call proposals or auto-query a provider.

New CSS must explicitly defeat the repository's mobile full-width button trap where the compact segmented/action controls require it. All strings land in ru/en/he; shared locale and SW cache versions are bumped together.

## 14. Flags and rollback

Exact defaults:

```text
F1_MEMORY_ENABLED=0
F1_MEMORY_OWNER_IDS=
F1_MEMORY_CANDIDATES_ENABLED=0
F1_MEMORY_CONTEXT_USE_ENABLED=0
```

- Unknown/malformed allowlist values fail startup validation.
- No wildcard is accepted in the owner stage.
- No environment change is part of the implementation commit.
- Default-off deploy is the only deployment authorized by recommended Decision 1.
- Export/delete remain reachable for already stored F1 data even when creation/context flags are off.
- Rollback order: context off -> candidates off -> global off; retain migration/data and permit lifecycle operations.
- CP0 remains off and receives no owner ID/configuration from F1.

## 15. Required gates and commands

New commands:

```text
npm run smoke:f1
npm run smoke:f1:load
```

`smoke:f1` composes contract, lifecycle, isolation, restore and UI gates. `smoke:f1:load` runs ≥10,000 local operations under a hard non-loopback network/provider tripwire.

Required existing regression commands:

```text
npm run smoke:memory-canon
npm run smoke:fsrs
npm run smoke:agent-profile
npm run smoke:mentor-home
npm run smoke:agent-plan
npm run smoke:agent-explain
npm run smoke:cp0
npm run test:api-smoke
```

Additional targeted suites are added if the actual diff reaches their owned boundary. `npm test` is run and any pre-existing baseline failure is recorded without unrelated repair.

Acceptance:

- zero cross-user reads/writes/source links/query receipts/export/delete;
- zero pending/suppressed/expired/annulled/resolved/external item in Continue output;
- zero `review_log`, FSRS projection, profile or consent mutation outside the explicit user consent endpoint;
- zero source fuzzy re-anchor;
- zero hard-deleted memory resurrection after restore;
- zero content/secret sentinel in operational audit, CP0 or stdout/stderr;
- exactly zero real external provider/network attempts in load work;
- S0 DB/WAL wait p95 <50 ms, p99 <250 ms; lock errors <0.1%; deterministic API p95 <1s, p99 <2s;
- ru/en/he complete; RTL and 380×844 screenshots reviewed;
- default-off and non-allowlisted behavior proven.

## 16. Evidence and completion

Local/fixture evidence may establish `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` only after:

1. all new and required regression gates pass;
2. default-off deployment is healthy;
3. no F1/CP0 environment variable is enabled;
4. bounded evidence is preserved under the stable path;
5. post-diff R1–R17 review has no unresolved blocker;
6. the owner reviews the evidence state.

It does not establish live usefulness or `OPERATIONALLY_COMPLETE`. A future owner-live packet must select exact flags, consent copy, test profile, rollback and evidence window. Unavailable live evidence is recorded as debt and does not automatically block separately approved AA2 default-off engineering; authority/privacy/canonical findings do block affected promotion.

## 17. Pre-code R1–R17 critique

| Lens | Execution attack | Required implementation response |
|---|---|---|
| R1 | Goal/note accepts Hebrew claims and later surfaces them as facts | Payload is a declaration label only; no linguistic claim kind; resolver remains separate |
| R2 | Continue ranking becomes engagement optimization | One explicit unfinished action; no click-based inference or notification |
| R3 | Free source refs create false edges | Closed adapters, user scope, revisions/digests and orphan gate |
| R4 | Memory controls overwhelm mobile Mentor Home | Progressive block, compact filters, valid-state actions and 380px proof |
| R5 | Feature is marketed as hidden AI understanding | Copy says user-controlled continuity; proposals are visibly inactive |
| R6 | Personal source pointer becomes corpus ingestion | Anchor/digest only; no body/revision/index store |
| R7 | Paraphrase alters register or intent | No model paraphrase; correction is direct user text/action |
| R8 | Old scaffolding persists forever | 7/30/90d thread TTL, resolve and one-card cap |
| R9 | Keep promotes derived candidate to asserted truth | `USER_CONFIRMED_DERIVED` remains distinct and non-transitive |
| R10 | Self-generated tests certify educational value | Gates prove contracts only; later live outcome has separate denominator |
| R11 | Current LWW source silently replaces old source | Keyed digest equality or `SOURCE_DRIFT`; independent source fixture |
| R12 | Memory/query audit duplicates learner/profile truth | Two stored memory kinds only; virtual profile; query receipts non-authoritative |
| R13 | Restore or rollback resurrects/deletes wrong data | Pre-restore journal replay, unaffected-user proof and disable-only rollback |
| R14 | Route/model supplies user/source scope | Principal-derived user; server adapters; guessed-ID negatives |
| R15 | Revoke/delete is delayed or cosmetic | Immediate fail-closed context, synchronous bounded purge, erasure journal |
| R16 | Candidate scan or tests consume provider quota | `NONE_DETERMINISTIC`, zero budget and hard network tripwire |
| R17 | Tutor history becomes skill/mastery evidence | Skill kinds prohibited; canonical snapshot and MNAR gates |

### Synthesis

The implementation must remain a small deterministic controller over a dedicated lifecycle store. Reusing open task/explanation JSON, adding model summarization, or treating CP0 traces as memory are stop conditions rather than shortcuts.

## 18. Owner decisions

### Decision 1 — authorized execution stage

- **A — authorize implementation, migration, full local evidence, scoped commit/push and default-off deployment; keep owner-live separate (recommended).**
- **B — authorize code/tests only, no migration deployment:** delays restore/production compatibility evidence.
- **C — enable owner flags or CP0 after deploy:** not covered; reject.

### Decision 2 — logical role

- **A — add deterministic `memory.manager`; keep model `memory.extractor` reserved disabled (recommended).**
- **B — reuse `profile.editor`:** conflates profile and memory authority.
- **C — activate model extractor:** violates approved F1 scope.

### Decision 3 — storage

- **A — migration 040 and five bounded tables in §5 (recommended).**
- **B — reuse tasks/explanations:** wrong schema, authority and lifecycle.
- **C — external/vector store:** outside F1/S5.

### Decision 4 — proposal trigger

- **A — explicit tap, seven-day named-adapter scan, ≤3 pending and zero provider calls (recommended).**
- **B — direct saves only:** safe but omits the approved proposal value.
- **C — mount/background/model generation:** reject.

### Decision 5 — API and context

- **A — closed first-party routes and one deterministic Continue query (recommended).**
- **B — storage UI without Continue query:** incomplete vertical slice.
- **C — inject memory into all mentor/external prompts:** outside consent/authority.

### Decision 6 — revoke/purge

- **A — synchronous bounded category/global purge with immediate fail-closed use (recommended).**
- **B — suppress only on consent revoke:** retains content after storage consent is withdrawn.
- **C — async best-effort without S4 job durability:** unsafe.

### Decision 7 — restore erasure

- **A — explicit content-free memory erasure journal and pre-restore replay (recommended).**
- **B — account journal only:** per-record delete can resurrect.
- **C — backup restore may restore deleted memory:** reject.

### Decision 8 — CP0 relationship

- **A — register F1 scenarios/content-safe codes but keep CP0 off; F1 evidence is independent (recommended).**
- **B — omit scenarios until a future CP0 window:** creates known parity debt before live launch.
- **C — enable CP0 for F1 engineering/live automatically:** reject.

### Decision 9 — evidence

- **A — §15 full gates, ≥10,000 local operations and zero external attempts (recommended).**
- **B — new unit smoke only:** insufficient for lifecycle/restore/canonical parity.
- **C — use owner-live/provider calls as engineering gate:** reject.

### Decision 10 — completion and next step

- **A — green gates + healthy default-off deploy may earn `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; live launch remains separate (recommended).**
- **B — green CI marks `OPERATIONALLY_COMPLETE`:** erases live-evidence distinction.
- **C — F1 completion automatically starts AA2/AA3:** separate contracts/authority still required.

## 19. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A/A**.

This authorizes the exact deterministic F1 implementation, migration 040, local/fixture/load/lifecycle evidence, scoped publication and default-off deployment. It authorizes no F1 or CP0 environment enablement, owner-live memory collection, LLM/provider use, AA2 code, OAuth/MCP connection or public cohort.

## 20. Stop conditions

Stop and return to the owner if:

- migration 040 or overlapping F1 work appears;
- unrelated tracked changes overlap target files;
- an exact source adapter requires retaining source content or fuzzy matching;
- the approved vertical needs a model, embedding, background job or external recipient;
- restore cannot prevent per-memory resurrection;
- consent revoke cannot synchronously block context and complete/visibly fail purge;
- a route can read/write a foreign user or accepts caller authority/source body;
- F1 changes `review_log`, FSRS, grading, profile truth, linguistic truth or consent outside explicit action;
- any content/secret enters operational audit/CP0/stdout;
- any real external network/provider attempt occurs in synthetic/load gates;
- default-off deployment cannot be completed without enabling F1 or CP0;
- S0 latency/lock/storage thresholds are breached.

## 21. Source map

Reconciled for this execution packet:

- owner-approved F1 decision packet and Wave 2 S0–S3 canon;
- Agent Access/Hermes packet for AA boundaries only;
- live migrations through 039 and migration runner;
- identity/consent/export/delete/backup/restore-erasure repositories and routes;
- learner log/projection, artifacts, tasks, explanations and scoped source readers;
- corpus sentence source, Mentor Home, locales, SW and current smoke harnesses;
- CP0 registry/contracts/evidence without enabling CP0.

No `.claude/PROD_OPS_PRIVATE.md`, production secret, private user content or external provider was accessed. Existing unrelated untracked paths remain untouched.
