# LinguistPro Wave 2 — F1 correctable continuity decision packet

**Date:** 2026-07-16
**Status:** `OWNER_APPROVED / CONTRACT_APPROVED`; Decisions 1–12 A/A/A/A/A/A/A/A/A/A/A/A approved 2026-07-16. Documentation and contract design only.
**Authority:** this packet authorizes no production code, migration, API/UI/config change, provider call, CP0 enablement, owner-live window, commit, push, deploy or production operation.
**Owner approval:** 2026-07-16 — Decisions 1–12: A/A/A/A/A/A/A/A/A/A/A/A. “Стартуй” authorizes preparation of the separate F1 execution approval packet defined here; it does not waive that packet's implementation gate.
**Repository baseline:** `main` / `ad9be2e`; package `3.11.184`; `origin/main` aligned at inspection.
**Predecessors:** owner-approved S0 B/B/B/B/B, S1 A/A/A/A/A/A/A/A/A, S2 A/A/A/A/A/A/A/A/A, and S3 CP0 `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` at commits `34a0c2e` and `ad9be2e`.
**Current routing:** F1 may proceed under a separate execution authority without waiting for S3-O. CP0 remains default-off and no owner-live collection is part of F1.
**Post-execution routing amendment:** 2026-07-16 — F1 subsequently reached `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` and an owner-only technically verified production path. The next pedagogical slice is a separately decided and approved **sufficient F2 shadow evidence chain**, not an expansion of F1 into skill, misconception or grading authority. AA1 documentation may proceed in parallel; AA2 remains separately gated and scheduled after F2 plus bounded preparation.
**Decision requested:** select the exact F1 product slice, memory authority/lifecycle, consent defaults, schema, UI, evidence and parallel AA0/AA1 boundaries.

## 1. Executive recommendation

Approve **Option A: bounded correctable continuity**.

F1 should let a learner deliberately preserve a small number of useful learning threads and declarations, see why each item exists, correct or stop using it, and resume one source-linked thread in the next session. It should not attempt to infer mastery, diagnose misconceptions, retain chat history, run a background model, or expose memory to an external agent.

The first complete learner path is:

```text
Mentor Home / selected explanation or task
  -> explicit memory opt-in or explicit “continue later” action
  -> user declaration or deterministic pending candidate
  -> evidence/source preview
  -> keep/edit/not true/delete + expiry
  -> active, source-linked continuity item
  -> next Mentor Home visit shows one “Continue” card with “Why this?”
  -> first-party source/task opens after live consent/source recheck
  -> resolve, correct, suppress, expire, annul or delete
```

F1 is useful with **zero LLM calls**. The existing model gateway is not part of candidate creation, context selection, correction or lifecycle. Synthetic gates install a hard external-network/provider tripwire.

Recommended owner resolution: **A/A/A/A/A/A/A/A/A/A/A/A** in §22.

## 2. Three product options

| Option | Product slice | Value | Main cost/risk | Decision |
|---|---|---|---|---|
| **A — bounded correctable continuity** | Explicit goals + source-linked unfinished threads + existing declared presentation preferences; deterministic pending proposals; Memory panel; one next-session Continue card; source/evidence/audit/lifecycle controls | Meaningful continuity with inspectable authority and no model dependence | Requires a real schema, lifecycle, UI and restore-erasure extension | **Recommended** |
| **B — resume-only bookmark** | One last-task/source pointer with dismiss/delete | Smaller implementation and privacy surface | Does not establish the correction, provenance, category, audit and export substrate required by F2 or later continuity | Acceptable fallback only if A is judged too broad |
| **C — hybrid semantic memory** | Automatic session summaries, inferred preferences/misconceptions, background LLM extraction, transcript/vector retrieval | Broader demo | Starts A2/S4/F2-like authority, retention, provider and deletion problems before F1 controls are proven | Defer; not F1 |

Option A is not “store everything but show little.” Its data collection is narrow by construction.

## 3. Reconciliation: live code, planning canon and research

### 3.1 Verified live substrate

| Capability | Live state | F1 use |
|---|---|---|
| Authenticated user scope | `users`, sessions, CSRF and principal-derived `user_id` are live | Every memory read/write remains user-scoped; caller/model cannot supply authority scope |
| Consent history | `consent_records` is append-only with versioned grant/revoke rows | Reuse the mechanism with F1-specific consent keys and action-time checks |
| Canonical learning truth | `review_log` is append-only; FSRS projections replay from it; annul exists | F1 may reference an event ID but never copy or reinterpret mastery/grade state |
| User-declared presentation settings | `agent_profiles` stores explicit language/depth choices | Display as existing declared settings; do not duplicate them into a second memory truth |
| Derived tasks and explanations | `agent_tasks` and `agent_explanations` are user-scoped; explanations carry `facts_used` and revoke tombstones | Eligible source artifacts only; they do not become memory automatically |
| Learner telemetry | `learner_events` has a closed content-free vocabulary and 2 KiB payload cap | May establish that an eligible action occurred; cannot become a semantic learner profile |
| Personal source sync | `learner_artifacts` is an opaque consented LWW bundle store | F1 stores a bounded anchor/digest only; historical exact replay remains unavailable on source drift |
| Export/delete | Dynamic `user_id` table discovery exports and deletes the whole account stream | New user-scoped F1 tables inherit account export/delete coverage |
| Restore erasure | S3 fixed restore to replay account `deletion_journal` from the pre-restore snapshot | F1 must extend the same proof to per-memory hard deletion |
| Mentor UI | Mentor Home already owns cloud status, consents, settings, tasks/history and mobile styles | Add one first-party Memory block; do not create a separate app or external surface |
| CP0 | Migration 039, bounded observer, 23-scenario registry and default-off flags are deployed | Leave off. F1 evidence does not require a live CP0 interval |

### 3.2 Gaps that are still real

- No `learner_memory` record, revision, source-link, expiry, suppression, annul or per-record erasure model exists.
- No memory-specific consent or category default exists.
- No active/pending distinction prevents a derived statement from being used as a fact.
- No deterministic context-query contract records why an item was selected or excluded.
- No Memory UI exposes evidence, correction, source drift, “do not use,” expiry, export or delete.
- `agent_tasks` and `agent_explanations` have target TTLs in S1 but no general age purge.
- Private `learner_artifacts` overwrite by LWW and have no immutable revision ID; old private content cannot honestly be replayed.
- Whole-account restore protects account erasure, but there is no per-memory restore-erasure journal.
- CP0 manifests are operational references, not learner memory and not a source of learner truth.

### 3.3 Research/planning claims that must be narrowed

| Research/proposal wording | Reconciled F1 contract |
|---|---|
| “Semantic learner memory” | Only direct user declarations or user-confirmed candidates; no inferred profession, ability or stable trait |
| “Automatic session summary” | Not in F1; no background/model extraction and no full transcript |
| “Preference memory” | Existing explicit language/depth remains canonical in `agent_profiles`; F1 does not dual-write it |
| “Misconception/skill memory” | Deferred to F2; hypothesis/evidence/evaluation boundaries are absent |
| “Reproducible context” | Exact for retained public/versioned sources; authorized rebuild or honest `SOURCE_DRIFT` for private LWW sources; deletion outranks replay |
| “Export/delete from day one” | Whole-account functions exist; F1 still needs per-record export/delete and restore-without-resurrection evidence |
| “Memory extractor” | S1 role stays `RESERVED_DISABLED`; deterministic proposal rules do not activate a model role |

## 4. Exact F1 vertical slice

### 4.1 Included learner-visible behavior

1. Mentor Home gains a **Memory** block after current settings and before history.
2. A learner can add or edit a bounded current goal in a closed goal form.
3. Eligible first-party task/explanation/source surfaces can offer **Continue later**.
4. If category consent is enabled, a deterministic rule may place at most three source-linked items in **Proposals**; they remain inactive until kept.
5. Every card shows category, authority label, source/evidence link, created/review/expiry dates and current use state.
6. Actions are: `Keep`, `Edit`, `Not true`, `Stop using`, `Use again`, `Resolve`, `Delete`, and `Open source` where valid.
7. The next eligible Mentor Home visit may show exactly one deterministic **Continue** card selected from active unfinished threads.
8. “Why this?” shows the source link and selection reason code, never a hidden model rationale.
9. The learner can export memory-only JSON and delete all F1 memory without deleting `review_log`, FSRS state, texts, explanations or the account.
10. Existing account export/delete includes all F1 user-scoped rows automatically.

### 4.2 Proposal trigger and eligibility

Ordinary Mentor Home mount remains read-only. Deterministic proposals are generated only after the learner explicitly taps **Find possible continuations**, while `mentor_memory_candidates` consent and the candidate feature flag are both on.

The closed v1 scan looks back at most seven days and may return, in stable order:

1. the newest open `agent_task` whose kind/payload passes a named F1 adapter and contains a valid first-party action/source anchor;
2. the newest unpurged `agent_explanation` with a currently resolvable source anchor;
3. one currently selected first-party source/action supplied by the host through the same strict adapter.

An ordinary telemetry event, model text, free task JSON, stale/purged explanation or source without a valid typed adapter is ineligible. The scan copies no source body, emits no goal/preference claim, deduplicates by source+next-action, writes at most three pending candidates and makes zero provider calls.

### 4.3 Explicit exclusions

- No default or opt-in full transcript in F1.
- No raw role-play/writing/comprehension submission retention.
- No LLM summary, classification, embedding, semantic search or background A2 job.
- No misconception, skill, mastery, difficulty, proficiency or diagnostic label.
- No review item, grade, FSRS schedule, word status, resolver fact or consent mutation from memory.
- No automatic curriculum, notification, card creation, lesson publication or source ingestion.
- No external-agent read/write scope and no Hermes/MCP/OAuth connection.
- No teacher/organization/tenant sharing.

## 5. Memory categories and retention

| F1 category | Allowed content | Creation authority | Default lifecycle | May influence |
|---|---|---|---|---|
| `declared_goal` | One short goal enum plus optional learner text ≤280 UTF-8 chars | Direct first-party user action only | Review at 180d; expire at 365d without reconfirmation | Continue-card wording and first-party plan input only after later scenario approval |
| `unfinished_thread` | Task/explanation/public or permitted private source anchor plus closed next-action code | Direct “Continue later” or deterministic pending proposal | Active 30d; user may choose 7/30/90d; resolve or expire | One first-party Continue card |
| `declared_preference_ref` | Reference to existing `agent_profiles.language/depth`; no copied value row | Existing authenticated profile action | Account lifetime until edited/deleted | Existing rendering only |
| `agent_decision_trace` | Closed strategy/reason/alternative/outcome codes; no free rationale or prompt | Deterministic controller | 30d content-free context-query receipt, not learner memory | Explain “why”; never context ranking by itself |

The only stored F1 learner-memory record kinds are `declared_goal` and `unfinished_thread`. `declared_preference_ref` is a virtual view over the existing profile, and `agent_decision_trace` is the existing context-query receipt view; neither is copied into `learner_memory_records`.

Not F1 categories: `skill`, `mastery`, `misconception`, `trait`, `occupation inferred from behavior`, `sensitive profile`, `external-agent memory`, `material summary`, `chat summary` and `transcript`.

## 6. Authority and trust distinctions

### 6.1 Four non-interchangeable classes

| Class | Meaning | Storage/use rule |
|---|---|---|
| **Canonical truth** | `review_log` events; deterministic replay/projections; resolver/curated facts; consent history; identity | F1 may hold typed references only. Memory never overrides or duplicates this truth |
| **User-declared memory** | “The learner declared goal X” or explicitly chose “continue later” | Authoritative only as a record of the declaration/action, not proof of ability, mastery or external fact |
| **Derived candidate** | A bounded deterministic proposal inferred from an eligible open artifact | Status `PENDING`; excluded from every context query until explicit Keep/Edit; expires after 7d |
| **External-agent context** | Data supplied by Hermes or another future connected client | Request-scoped untrusted input only; never an F1 source or durable record unless the learner re-enters/reasserts it in first-party UI under a future approved contract |

`USER_CONFIRMED_DERIVED` remains distinguishable from `USER_DECLARED`: confirmation allows use but does not rewrite its origin as an independent declaration.

### 6.2 Precedence and conflict

1. Canonical deterministic/curated facts always outrank memory.
2. A current direct user declaration outranks a confirmed derived candidate of the same kind/scope.
3. Conflicting user declarations do not silently overwrite history; correction creates a revision and supersedes the old active value.
4. A conflict with review evidence never resolves into a skill label in F1.
5. A missing/drifted source suppresses source-dependent use; it does not trigger fuzzy re-anchoring.
6. External-agent prose has no precedence.

## 7. Evidence, provenance and source links

Every non-virtual record carries at least one source link except a direct goal declaration, whose evidence is the authenticated user action receipt.

Allowed source kinds:

| Source kind | Required locator | Authority/use |
|---|---|---|
| `USER_ACTION` | request/action ID, surface, timestamp and consent snapshot ref | Proves declaration/keep/edit, not truth of the content |
| `AGENT_TASK` | user-scoped task ID, kind and created timestamp | Derived artifact; open/done/dismissed rechecked |
| `AGENT_EXPLANATION` | user-scoped explanation ID, anchor and purge state | Derived; body is not copied into memory |
| `PUBLIC_CORPUS_ANCHOR` | corpus/work/text/order plus corpus revision/digest | Public/versioned source |
| `PERSONAL_TEXT_ANCHOR` | artifact key, `updated_at`, bounded row/order and per-user keyed selection digest | Consent-bound; rebuild only on digest equality; otherwise `SOURCE_DRIFT` |
| `PROFILE_FIELD` | profile row/version/field | Virtual preference only |
| `CANONICAL_EVENT_REF` | `review_log` event ID and policy/keyer version | Evidence reference only; cannot become a skill/mastery statement |

Source links expose learner-safe labels and first-party open actions. Raw private text, prompt packets, provider output, token/key material and global private-content hashes are prohibited.

## 8. Correction, suppression, expiry, annul and deletion

### 8.1 State model

```text
PENDING --keep/edit--> ACTIVE --correct--> ACTIVE(new revision)
    |                    |  |  |  |
    |                    |  |  |  +--delete--> PURGED + erasure journal
    |                    |  |  +-----annul/not true--> ANNULLED
    |                    |  +--------expire----------> EXPIRED
    |                    +-----------stop using------> SUPPRESSED --use again--> ACTIVE
    +--reject/ttl--------> ANNULLED or EXPIRED

ACTIVE unfinished thread --resolve--> RESOLVED
EXPIRED --reconfirm within retention grace--> ACTIVE(new revision)
```

### 8.2 Semantics

- **Correction:** the record concept remains, but a new immutable revision becomes current. Old content is excluded from retrieval and remains visible only in revision history until the record's purge horizon.
- **Suppression:** the learner says the record may be valid but must not be used. It is reversible and immediately excluded from context.
- **Expiry:** time-based invalidation. Query-time filtering is authoritative; cleanup timing cannot make an expired record active.
- **Annul / Not true:** the learner rejects the assertion or candidate. Content is removed from active use; a content-minimized lineage remains for duplicate suppression and audit.
- **Resolve:** an unfinished thread is complete; it stays in history until its retention horizon and cannot reappear as Continue.
- **Delete:** privacy hard deletion of record payload, revisions, source digests/anchors and query references. It is not an undo operation. A content-free erasure entry prevents old-backup resurrection.

No lifecycle action mutates `review_log`, FSRS, mastery, grading, linguistic truth or consent.

## 9. Consent and defaults

Recommended consent keys and defaults:

| Consent/policy | Default | Rule |
|---|---:|---|
| `mentor_memory_store` | Off | Required before any durable F1 record is created |
| `mentor_memory_unfinished` | Off | Category opt-in for source-linked unfinished threads |
| `mentor_memory_candidates` | Off | Allows deterministic pending proposals only; never model extraction |
| Per-record `use_enabled` | On only after explicit direct save/Keep | “Stop using” acts immediately without deleting history |
| Provider egress of F1 memory | Prohibited in F1 | Existing text/model consent does not silently authorize memory transmission |
| External-agent access | Prohibited in F1 | Requires later AA scope/recipient consent and downstream-retention copy |

Direct Save/Continue-later may combine a situated consent disclosure with the category grant, but it must write a versioned consent row. Declining leaves existing product behavior unchanged. Revocation blocks new reads/writes immediately, suppresses all active F1 context use synchronously, and starts bounded purge/reconciliation. A purge failure is visible and keeps context use fail-closed.

## 10. Context-query and audit contract

### 10.1 Closed first-party query

Conceptual call:

```text
queryMemoryContext({
  principal,
  purpose: MENTOR_HOME_CONTINUE,
  allowed_kinds: [unfinished_thread],
  limit: 1,
  max_bytes: 1024,
  now,
  policy_version
})
```

Rules:

1. `user_id` comes from the authenticated principal.
2. Purpose is a closed enum; F1 initially permits only `MENTOR_HOME_CONTINUE` and `MEMORY_MANAGEMENT_VIEW`.
3. Query excludes pending, suppressed, expired, annulled, resolved, purged and `use_enabled=0` records before ranking.
4. Live category consent and source availability/drift are rechecked.
5. Ranking is deterministic: direct user action over user-confirmed candidate; explicit priority; newest unresolved source action; stable record ID tie-break.
6. Maximum output is one Continue item, five management items/page, 1 KiB context payload and five source links/item.
7. No embeddings, free-text similarity, LLM reranking or cross-user cache.
8. Memory supplies continuity, never a grade, FSRS value, linguistic fact or mastery claim.

### 10.2 Content-safe audit

Each query writes a user-scoped content-free receipt with:

```text
query_id, user_id, purpose, surface, policy_version, consent_snapshot_ref,
eligible_count, selected_memory_ids, exclusion_reason_counts,
source_check_codes, generated_at, expires_at, terminal_code
```

No memory payload, source text, prompt, model output or free error string is stored. Query receipts expire after 30 days and appear in the record's “Used by” view while retained.

## 11. Bounded schema and migration contract

If implementation is later approved and no competing migration appears, the proposed next migration is **`040_f1_correctable_continuity.sql`**. Stop and renumber/reconcile if `040` already exists.

### 11.1 Tables

| Table | Purpose | Hard bounds/invariants |
|---|---|---|
| `learner_memory_records` | Current record identity, kind, authority, status, use/priority and lifecycle timestamps | `user_id` FK; closed enums; ≤100 non-purged/user; ≤20 active/kind; one current revision; indexed by user/status/kind/expiry |
| `learner_memory_revisions` | Immutable create/correct/confirm/suppress/resolve metadata and closed payload | `user_id` + record FK; ≤16 revisions/record; payload ≤2,048 UTF-8 bytes; unknown fields rejected in application validator |
| `learner_memory_source_links` | Revision-scoped evidence/provenance | ≤5 links/revision; closed source/relation/authority enums; anchor ≤1,024 bytes; per-user keyed digest only |
| `memory_context_queries` | Content-free query/audit receipt | selected IDs ≤5; manifest ≤3,072 bytes; 30d TTL; no payload/content |
| `memory_erasure_journal` | Per-memory restore-without-resurrection proof | Deliberate sweep exemption; memory ID/user ID/deleted time/reason only; no content/digest; retained at least beyond oldest allowed backup |

Pending deterministic candidates are capped at 10/user, three/session and seven days. Estimated bounded structured storage remains under 10 MB/user even at maximum records/revisions, before ordinary SQLite/index overhead; this is a design bound, not measured evidence.

### 11.2 Envelope and payload rules

- Opaque random server IDs; never private content-addressed IDs.
- Common S2-aligned envelope fields: schema, authority, status, policy/version, timestamps, source refs and retention.
- Closed per-kind payloads with `additionalProperties=false` in runtime validators.
- `declared_goal`: goal code, optional text ≤280 chars, optional language enum.
- `unfinished_thread`: next-action enum, label ≤160 chars and source-link IDs; no copied source body.
- Query receipts, not learner-memory revisions, carry strategy/reason/alternative/outcome codes.
- Stored schema versions are immutable; adapters cannot promote authority.
- Same idempotency key plus different canonical digest is `IDEMPOTENCY_CONFLICT`.

### 11.3 No dual-write

- `review_log` remains the only review/memory-of-word canon.
- `agent_profiles.language/depth` remain the only current presentation-preference values.
- F1 references `agent_tasks`, `agent_explanations`, sources and canonical events; it does not copy their truth bodies.
- Context-query receipts are audit artifacts, not another memory projection.

## 12. Export, delete and restore guarantees

### 12.1 Export

- Memory-only export returns versioned records, active/current values, revision history, learner-safe source links, statuses, consent versions and content-safe query history.
- Secret hashes, keyed digests, session/channel secrets and provider data are omitted.
- Whole-account export includes every user-scoped F1 table through structural discovery plus an explicit redacted erasure-history section where applicable.
- Export ordering and canonical JSON are deterministic so a second export can be diffed.

### 12.2 Delete

- Per-record Delete is synchronous and transactional for the current SQLite F1 slice.
- The operation removes record/revision/source content and rewrites retained query receipts to a non-content deleted reference or removes them.
- Delete appends a content-free `memory_erasure_journal` entry outside the normal user-table sweep.
- Delete-all-memory proves zero live F1 record/source/query references while preserving `review_log`, projections, texts, profile, consent history and unrelated agent artifacts.
- Account deletion explicitly removes per-memory journal rows after the account-level `deletion_journal` is safely written; the account journal then owns anti-resurrection.

### 12.3 Restore

- Correction/suppression is reversible only by an explicit new user action/revision; no silent rollback to an old value.
- Hard Delete is not restorable through the product.
- Database restore must replay both account erasures and still-retained memory erasures from the automatic pre-restore safety snapshot.
- Restore success requires integrity, schema, zero-resurrection and unaffected-user checks.
- An import of an old export, if ever added, creates newly declared records after preview; it never bypasses current consent or resurrects IDs. Import is not F1.

## 13. UI contract

### 13.1 Mentor Home Memory block

The block has four compact filters: `Active`, `Proposals`, `Hidden`, `History`. On 380 px these remain one logical control group and do not create a horizontal page scroll.

Each card shows:

- category and authority badge: `You said`, `You saved`, or `Suggested — not used`;
- concise value/next action;
- source label and `Open source` / honest `Source changed` state;
- “Why this?” evidence/provenance disclosure;
- use state and expiry/review date;
- only the actions valid for the current lifecycle state.

The header provides:

- memory/category opt-in switches with exact copy;
- `Export memory`;
- `Delete all memory` with typed confirmation;
- a short statement that word memory/FSRS, grades and Hebrew facts are separate and unaffected.

### 13.2 Interaction requirements

- Edit and Keep preview the exact stored fields before mutation.
- `Not true` is visually distinct from `Delete` and explains the retained audit difference.
- Suppression is immediate and reversible.
- No empty-state dead end: show how to save a goal or Continue-later item.
- All new strings exist in ru/en/he; RTL, keyboard/focus, reduced motion and 380×844 screenshot inspection are mandatory implementation gates.
- Dynamic text uses text nodes/textContent; no memory value enters HTML.

## 14. Feature flags, allowlist and rollback

Proposed configuration, all default-off:

| Variable | Default | Meaning |
|---|---:|---|
| `F1_MEMORY_ENABLED` | `0` | Global F1 API/UI/storage switch |
| `F1_MEMORY_OWNER_IDS` | empty | Exact server-principal allowlist; no wildcard in owner stage |
| `F1_MEMORY_CANDIDATES_ENABLED` | `0` | Deterministic pending proposals only |
| `F1_MEMORY_CONTEXT_USE_ENABLED` | `0` | Allows the first-party Continue-card query after storage/lifecycle gates |

Rules:

1. Migration/code may be deployed only with all flags off after separate approval.
2. No environment mutation or owner ID is part of an implementation commit.
3. CP0 flags remain unchanged/off; F1 launch does not start S3-O.
4. Owner-live enablement needs a separate launch packet naming the exact owner, flags, consent version and rollback.
5. Rollback is context-use off, candidates off, then global off. The migration remains; no incident rollback drops tables.
6. Flag-off blocks new F1 writes/queries but keeps export/delete available for already stored F1 data.
7. A privacy/isolation/authority failure forces context-use and candidate flags off immediately and blocks live promotion.

## 15. Deterministic evidence gates

All implementation gates use fixture/local databases and a hard outbound-network/provider denial. No Gemini, OpenRouter, Dicta, TTS, Translate, MCP or other external quota is consumed.

| Gate | Required proof |
|---|---|
| Schema | Closed enums/JSON, byte/cardinality limits, FK/indexes, unknown-field rejection and migration idempotency |
| Authority | Pending/derived/external context never appears in active queries; canonical truth always wins |
| Lifecycle | Full transition matrix; query-time expiry; correction revision; suppression/restore; resolve; annul; hard delete |
| Source | Public revision exactness; private keyed-digest equality; drift/unavailable/revoke fail closed; no fuzzy re-anchor |
| Consent | Defaults off; category grants versioned; revoke blocks immediately; purge error visible and context fail-closed |
| Isolation | Guessed IDs, cross-user source links, query receipts, export, correction and delete all return zero foreign data |
| Canonical parity | Byte-identical `review_log` and replayed FSRS/projections before/after every F1 operation |
| Profile parity | Existing language/depth updates remain single-writer; virtual preference view cannot diverge |
| Export/delete | Deterministic redacted export; per-record and delete-all zero-reference reconciliation |
| Restore | Old backup cannot resurrect hard-deleted memory or account; unrelated user and canonical log survive |
| Concurrency/idempotency | Duplicate Keep/Edit/Delete and simultaneous expiry/query produce one logical outcome |
| Load | ≥10,000 mixed local lifecycle/query operations at the S0 5× 100-DAU profile; S0 latency/lock thresholds; zero external attempts |
| Content safety | Hebrew/Russian/English sentinels, secrets, email/IP/token patterns absent from audit/ops logs and query manifests |
| Flags | All defaults off; non-allowlisted user sees no F1 capability; delete/export remain reachable for existing data |
| UI | ru/en/he keys, RTL, keyboard/focus, 380×844 screenshots, source-drift/empty/offline/error/no-consent states |

No learner outcome claim is made by engineering gates. Later live evidence pre-registers eligible continuity opportunities, Continue-card opens, source resumes, resolves/corrections/suppressions/deletes and complaints; raw “more messages” is not success.

## 16. Evidence plan and completion states

Stable implementation evidence, if separately authorized, belongs under:

```text
docs/research/f1-correctable-continuity/2026-07-16/
```

Required artifacts:

- `README.md`: source commit, commands, raw/scored labels and limitations;
- bounded machine-readable gate metrics;
- schema/lifecycle/authority matrix;
- 10,000-operation zero-network evidence;
- export/delete/restore reconciliation summary;
- ru/en/he and 380×844 screenshot manifest;
- post-diff R1–R17 critique;
- remaining live-evidence debt.

Status ladder:

| Status | Meaning |
|---|---|
| `CONTRACT_APPROVED` | Owner selects §22 decisions; implementation packet may be prepared |
| `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` | Deterministic/fixture/load/lifecycle/UI gates green and deployed default-off under separate authority |
| `LIVE_READY` | Exact owner launch, consent copy, flags, rollback and critical remediation approved |
| `OPERATIONALLY_COMPLETE` | Owner reviews bounded live evidence; corrections/suppressions/deletes and zero authority/privacy incidents meet the predeclared window |

Engineering completion never enables a switch by itself. An unavailable live window does not block separately approved downstream default-off engineering, but critical findings block affected live promotion.

## 17. R1–R17 adversarial review

| Lens | Attack on F1 | Locked response |
|---|---|---|
| R1 | A memory says a root/form is correct and future prose repeats it | Linguistic claims cannot be F1 record kinds; resolver refs outrank memory |
| R2 | Continue cards optimize reopening instead of learning | Only an unfinished source-linked action; later efficacy uses resolved/resumed learning opportunities, not clicks alone |
| R3 | Source IDs become decorative/fake graph edges | Closed source/relation types, user scope, revision/digest and zero-orphan gate |
| R4 | Memory management becomes a settings maze or dead end | One Mentor Home block, progressive disclosure, honest drift/offline states and mobile/RTL proof |
| R5 | “AI remembers you” overclaims opaque personalization | Product copy says user-controlled continuity; no transcript, hidden trait or model memory |
| R6 | Personal text anchors imply a durable personal corpus | Anchor/digest only; current LWW source and consent gate; no ingestion/index |
| R7 | A generated paraphrase changes register or meaning | No model paraphrase in F1; user edits are stored as declarations with revision history |
| R8 | Persistent scaffolding prevents independent reading | Unfinished threads expire/resolve; one Continue card; always returns to source |
| R9 | Confirming a derived candidate turns it into canonical truth | Authority remains `USER_CONFIRMED_DERIVED`; lineage is non-transitive |
| R10 | A few kept cards are called successful personalization | Engineering evidence proves contracts only; live outcome denominators and correction harm are separate |
| R11 | Current source silently replaces historical source | Digest/revision check; drift fails closed; independent canonical snapshots guard no-harm |
| R12 | Memory becomes a second learner-state writer | Separate advisory store; references only; `review_log`/profiles retain their writers |
| R13 | Migration/restore resurrects deleted memories or blocks writes | Default-off migration, synchronous bounded delete, erasure replay and disable-only rollback |
| R14 | One user guesses another memory/source/query ID | Principal-derived scope on every repository call and negative tests across every table/action |
| R15 | Consent/revoke/delete are UI promises without purge teeth | Versioned category consent, immediate no-use, zero-reference reconciliation and restore anti-resurrection |
| R16 | Summaries/candidates create hidden provider or background spend | F1 is deterministic and synchronous; hard network tripwire; bounded rows/queries |
| R17 | Memory converts tutor interaction into mastery/grade | Skill/misconception excluded; no F1 path writes or interprets `review_log`; MNAR remains no-write |

### Synthesis

The most dangerous shortcut is to reuse explanation/task JSON as “memory” and add a search box. That would preserve unclear authority, unbounded retention, private-source drift and no correction semantics. Option A deliberately pays for lifecycle and control before adding breadth.

## 18. Boundary with F2 and S4–S7

| Track | F1 may do | Explicit boundary |
|---|---|---|
| **F2 evidence requests** | Reference canonical event IDs and show an unfinished action | No hypothesis, misconception, evaluator, evidence request, state decision or skill label |
| **S4 durable jobs/outbox** | Synchronous user actions, query-time expiry and bounded in-process cleanup | No background model extraction, retry queue, distributed purge/index job or A2 preparation |
| **S5 DB/object/index transition** | Bounded SQLite owner/controlled-pilot tables under S0 thresholds | No Postgres selection, object storage, vector index or multi-process correctness |
| **S6 material lifecycle** | Current source refs with drift/revoke fail-closed | No immutable private revision store, ingestion, rights/trust corpus, chunks or derived-material cascade |
| **S7 tenancy/FinOps/ops** | Exact owner allowlist and existing user scope | No teacher/org grants, public cohort, billing tenant, external client lifecycle or commercial SLO claim |

F1 can proceed before S4–S7 only because the recommended slice is synchronous, model-free, bounded, first-party and owner-allowlisted. Any requirement for durable background extraction, private revision storage, external access, organization sharing or public-scale operations reopens the relevant S4–S7 gate before implementation.

## 19. AA0/AA1 parallelism and AA2 stop line

### 19.1 Safe parallel AA0 work

After its own execution approval, AA0 may prepare:

- a local no-secret Hermes skill describing LinguistPro system-of-record boundaries;
- first-party public/deep links from the approved allowlist;
- a duplicate-notification avoidance policy;
- a structured usability diary and retention/prune choice;
- packaging/security evidence that contains no LinguistPro credentials or private API calls.

AA0 must not read/write F1 memory, configure a live LinguistPro connection, export cookies/tokens, or label Hermes session memory as learner truth. Its deferred 14-day/20-use evidence does not block F1.

### 19.2 Safe parallel AA1 work

AA1 may remain documentation/schema/threat-model only and define:

- OAuth authorization/resource-server topology, PKCE, audience/client/connection binding and revoke;
- exact read-only tool schemas/scopes and stable error codes;
- recipient-specific consent/downstream-retention copy;
- CP0 mapping, rate/load, export/delete/restore, abuse/support and rollback contracts;
- fixture/loopback compatibility plan for Hermes plus a second MCP client.

AA1 must treat F1 memory scopes as **deferred/prohibited in AA2 v0**. It may reserve vocabulary but cannot assume access to memory payloads, context-query receipts or source bodies.

### 19.3 AA2 remains blocked

No AA2 code, SDK dependency, endpoint, migration, OAuth credential/client, live MCP server or external connection starts until all are separately owner-approved:

1. exact OAuth/resource-server contract;
2. exact tool/input/output schemas and scopes;
3. connected-agent consent and downstream-retention copy;
4. threat model and tenant/connection negative tests;
5. CP0 scenario mapping before live enablement;
6. default-off flags, owner allowlist, rollback and support/incident route;
7. separate AA2 implementation/deploy authority.

F1 does not weaken or substitute for any AA2 prerequisite.

## 20. Stop conditions

Stop F1 implementation planning/execution and return to the owner if:

- migration `040` or overlapping memory work appears;
- the slice requires full transcript, embedding, LLM extraction or a durable background job;
- an F1 record would copy or reinterpret grading/mastery/FSRS/resolver truth;
- private source use cannot fail closed on drift/revoke;
- per-record deletion cannot be protected across old-backup restore;
- a context query can include pending/suppressed/expired/annulled/external records;
- an audit path requires raw memory/source/provider content;
- flags cannot keep UI/API/storage/context use default-off and owner-allowlisted;
- deterministic gates attempt any real external network/provider call;
- unrelated tracked changes overlap target files;
- CP0 or an owner-live window would need to be enabled to finish engineering evidence.

## 21. Implementation workflow after a future execution approval

1. Re-read this packet and current S0–S3/AA canon; verify HEAD, package and next migration.
2. Produce an exact hook/source/consumer matrix before code.
3. Write failing independent schema, authority, lifecycle, isolation, restore and canonical-parity gates first.
4. Implement migration/repository/contracts with all flags off.
5. Add APIs and Mentor Home UI in small slices; keep profile/review/source writers unchanged.
6. Run 10,000 local operations under hard network denial and S0 thresholds.
7. Run export/delete/restore, sentinel, ru/en/he, RTL and 380×844 evidence.
8. Run post-diff R1–R17 critique and preserve stable evidence.
9. Return for implementation adjudication; commit/push/deploy require the separate authority explicitly withheld in this session.
10. After default-off engineering completion, request a distinct owner-live launch packet. Do not enable CP0 as part of that request.

## 22. Owner decisions

### Decision 1 — F1 product slice

- **A — bounded correctable continuity in §4 (recommended).**
- **B — one resume-only bookmark:** smaller but does not establish the required memory foundation.
- **C — hybrid automatic semantic memory:** starts A2/F2/S4-like risk; defer.

### Decision 2 — categories and authority

- **A — declared goal, unfinished thread, virtual existing preference and audit-only decision trace; strict four-class authority split (recommended).**
- **B — unfinished thread only:** safer but materially weaker continuity.
- **C — include skill/misconception/traits:** crosses into F2 and inferred-profile risk.

### Decision 3 — candidates

- **A — deterministic, source-linked, pending, inactive, ≤3/session and 7d TTL; explicit Keep/Edit required (recommended).**
- **B — no proposals; direct user saves only:** valid fallback with lower discovery value.
- **C — LLM session summaries/candidates:** requires separate A2/provider/transcript contract.

### Decision 4 — consent

- **A — global store plus per-category/candidate opt-in, all off; no provider/external egress (recommended).**
- **B — one blanket memory consent:** simpler but less granular and weaker correction control.
- **C — memory on by default:** reject.

### Decision 5 — lifecycle and TTL

- **A — §5/§8 TTLs, revision correction, reversible suppression, expiry, annul, resolve and hard delete (recommended).**
- **B — edit/delete only:** omits stale-use and “valid but do not use” controls.
- **C — indefinite active memory:** reject.

### Decision 6 — schema

- **A — proposed migration 040 with five bounded tables and S2-aligned closed envelopes (recommended).**
- **B — reuse `agent_tasks`/`agent_explanations`:** preserves open payloads and wrong retention/authority semantics.
- **C — vector database/document store:** unnecessary and outside S5/S6.

### Decision 7 — context use and audit

- **A — first-party deterministic Continue query only, one item, content-free 30d receipt (recommended).**
- **B — storage/UI only, no context use:** controls are proven but vertical learner value is incomplete.
- **C — ambient use in every mentor prompt/external agent:** excessive scope and egress.

### Decision 8 — UI

- **A — Mentor Home Memory block with Active/Proposals/Hidden/History, evidence and full controls (recommended).**
- **B — settings-only toggles plus one card:** hides correction/source history.
- **C — separate memory application/dashboard:** unnecessary navigation and implementation burden.

### Decision 9 — export/delete/restore

- **A — memory-only export/delete, structural account coverage and per-memory restore-erasure journal (recommended).**
- **B — rely on account delete only:** fails the requested per-record control.
- **C — allow backup/import to resurrect deleted IDs:** reject.

### Decision 10 — rollout

- **A — four default-off flags, exact owner allowlist, delete/export available under flag-off, disable-only rollback (recommended).**
- **B — one global flag:** simpler but candidates/context cannot be isolated during remediation.
- **C — deploy enabled or start CP0/owner-live automatically:** reject.

### Decision 11 — evidence

- **A — full deterministic matrix plus ≥10,000 local 5× operations and zero external attempts (recommended).**
- **B — unit/schema smoke only:** insufficient for lifecycle, restore and canonical no-harm.
- **C — live owner evidence instead of fixture gates:** unsafe and unavailable.

### Decision 12 — AA parallel boundary

- **A — AA0 no-secret packaging/diary and AA1 docs/contracts may proceed separately; F1 memory stays absent from AA2 v0; AA2 waits for all §19.3 approvals (recommended).**
- **B — freeze AA0/AA1 until F1 live evidence:** unnecessary serialization.
- **C — start AA2 or expose F1 memory before OAuth/tool-schema/threat-model approval:** reject.

## 23. Recommended owner resolution

Approve **A/A/A/A/A/A/A/A/A/A/A/A**.

This selects a model-free, first-party, source-linked and fully correctable F1 slice; category opt-in; inactive deterministic proposals; bounded migration 040 design; Mentor Home management UI; deterministic context query/audit; per-record export/delete/restore guarantees; default-off owner allowlist; zero-provider evidence; and safe parallel AA0/AA1 documentation/package work while keeping AA2 blocked.

Approval of this packet would establish `CONTRACT_APPROVED` only. It would permit preparation of a separate F1 execution approval packet. It would not authorize code, migration creation/execution, flags, UI/API changes, tests that call external providers, commit/push/deploy, CP0 enablement or owner-live collection.

## 24. Source map

Read and reconciled:

- `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`.
- `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`, local `.remember` history and available Claude project-memory index.
- Wave 2 replan plus owner-approved S0, S1, S2 and S3 design/execution/evidence canon.
- `docs/research/cp0/2026-07-16/README.md`.
- `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`.
- Research files `03`, `07`, `10`, `11`, `12` and `13` under `docs/research/edu-quality-agentic/2026-07-13/`.
- Live migrations 020, 021, 023, 026 and 039.
- Live identity, learner-log, artifact, agent, consent, export/delete, backup/restore-erasure, CP0 contracts/registry and Mentor Home paths.

No `.claude/PROD_OPS_PRIVATE.md`, production secret, private user content or external provider was accessed. Existing untracked `.agents/` and `docs/research/edu-quality-agentic/` were read but not modified.
