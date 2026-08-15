# ROOM-UX-B9 — historical owner decisions and suspended migration authorization

Date: 2026-08-15
Status: `DESIGN_ACCEPTED · EXECUTION FROZEN`
Source commit at decision: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`; all pre-existing owner changes remain out of scope.
Production reference: `https://linguistpro.kolosei.com/library.html`, last research-inspected version `3.11.388`.
Parent packet: [ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_DECISION_PACKET_2026_08_15.md](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_DECISION_PACKET_2026_08_15.md)

> **Successor decision:** the owner subsequently froze B9 because no qualified
> curator-mentor with the required knowledge and specialization is currently
> available. All implementation and migration authority in this document is
> suspended by
> [ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).

## Evidence and authority passport

- `CODE`: this document does not alter runtime, schema or data. It resolves product decisions against the current code/truth map in the parent packet.
- `ISOLATED_AUTOMATION`: none executed for this documentation update.
- `PRODUCTION`: no production operation was executed; version `3.11.388` is the last read-only research baseline, not fresh release evidence.
- `OWNER_LIVE_READ_ONLY`: no owner profile was opened or mutated in this update.
- `OWNER_REPORTED`: the owner explicitly approved all nine formerly open B9 decisions and authorized the schema migration for a mature implementation on 2026-08-15.
- `EXTERNAL_PRIMARY`: no new external facts were added; the parent packet’s dated Canvas/Moodle/Google benchmark remains the research reference.

Limitations: this is an authority and product-contract record. It is not implementation, migration execution, commit, push, production deployment, beta acceptance or owner-live verification.

## Authoritative resolution

The owner accepts the parent packet’s recommended B9 architecture: Option B as canonical core with Hybrid D adapters, the recorded D1–D10 values, and the following exact resolutions. These choices no longer require another product decision before implementation. Engineering preflight, tests, migration safety and release gates remain mandatory execution controls.

### O1 — Group recipients

`APPROVED: SNAPSHOT_RECIPIENTS`

- A group Assignment materializes the currently ACTIVE eligible learners in the assignment transaction.
- Learners who join later are not assigned retroactively.
- Adding later members requires an explicit `RECIPIENT_ADDED` action or a new Assignment.
- Membership revoke blocks access and changes that recipient’s assignment projection; it does not rewrite the original cohort snapshot or erase audit history.
- Dynamic future-member assignment is outside slice 1.

### O2 — Existing Finished and reread

`APPROVED: ACCEPT_EXISTING_FINISHED`

- An existing canonical `text_progress.finished_at` satisfies a matching TEXT or SONG item.
- B9 never rewrites, clears or duplicates Finished.
- “Read again after assignment” is not supported in slice 1 because current Finished truth does not retain a repeat-reading event history.
- Adding reread requirements later requires a new separately designed canonical activity/event contract, not reinterpretation of Finished.

### O3 — REVIEW completion

`APPROVED: CANONICAL_REVIEW_LOG_EXPLICIT_ITEM_KEYS`

- A REVIEW item contains an explicit bounded set of canonical `item_key` values.
- Completion is projected only from canonical append-only `review_log.kind='review'` events matching those keys and the versioned time rule.
- Slice-1 time rule remains: qualifying event at or after the pinned PathVersion publication time.
- A review already completed through canonical `review_log` after that baseline is immediately projected complete.
- Path open, Trainer open, reveal, timeout, navigation and optional comprehension never synthesize review events.

### O4 — Comprehension

`APPROVED: OPTIONAL_NO_COMPLETION_CREDIT`

- COMPREHENSION is optional in slice 1.
- It may launch only after explicit learner action and existing consent/provider checks.
- It makes no implicit provider call on path open/resume.
- Generated prompt, answer choice and provider response do not count toward completion and do not write learner/review truth.
- Required/scored comprehension remains a separate future program with human-authored item identity and independent grading/privacy approval.

### O5 — Learner-private texts

`APPROVED: TEACHER_ASSIGNMENT_FORBIDDEN_IN_SLICE_1`

- The learner may use an owned private text in a personal optional Path.
- A teacher/editor/group owner cannot assign a learner-private text in slice 1.
- B9 does not infer permission from path membership, a title, a local `text_id` or teacher role.
- Any future use requires a separate explicit content grant, recipient-visible provenance, revoke/purge contract and owner approval.

### O6 — Minimal assignment-scoped Finished evidence receipt

`APPROVED: MINIMAL_EVIDENCE_RECEIPT`

The receipt is permitted because a corpus Finished fact is local while B9 promises assignment recovery across devices/reinstall. Its boundary is strict:

- written only after reading canonical local `finished_at`;
- keyed idempotently by recipient/adoption, pinned version item and opaque canonical fact key;
- contains source domain, opaque stable material key, canonical finish timestamp/hash, observation and sync time;
- contains no last row, text body, title snapshot, bookmark, note, answer, grade, playback telemetry or free text;
- may be read only by the B9 completion projector and B9 export/recovery;
- is never a global Finished writer and is never consumed by Reader, Reading Journey, Reading Lists or recommendation/profile-fit;
- UI distinguishes `COMPLETE_LOCAL_PENDING_SYNC` from `COMPLETE_EVIDENCE_SYNCED`.

### O7 — Exact retention and deletion policy

`APPROVED: B9_RETENTION_V1`

#### Normal retention

| Data | Exact retention |
|---|---|
| Active Path/PathVersion referenced by an active Adoption or Assignment | no TTL while referenced |
| Active Assignment/recipient and exception events | no TTL while active |
| Terminal Assignment authority/audit, recipient events and minimal evidence receipts | 730 days after `terminal_at` |
| Optional Adoption after explicit Leave | 730 days after `left_at` |
| Unreferenced archived PathVersion | 730 days after the last reference becomes terminal, then eligible for purge |
| Server request/idempotency delivery metadata | 30 days after confirmed response |
| Local delivered-outbox acknowledgement/receipt | 30 days after confirmed server acknowledgement |
| Anti-resurrection erasure tombstone | 180 days, with no content, learner text, material title or evidence payload |

`terminal_at` is set only by an explicit lifecycle event: `WITHDRAWN`, `CLOSED_BY_AUTHORITY`, recipient access revoke/removal, learner Leave for an optional Adoption, or account deletion. Completion projection alone does not silently terminate an Assignment.

#### Purge behavior

- A daily bounded sweep removes expired learner-scoped evidence, recipient events and expired audit according to the table above.
- Purge is idempotent and emits only aggregate operational counts; it creates no learner-content telemetry.
- A retained PathVersion survives only while another active/within-retention reference requires it.
- Before routine TTL purge, the affected user can export the still-retained B9 record.
- Expired evidence is shown as expired/unavailable in any retained non-personal shell; it is never reconstructed from recommendations, bookmarks or localStorage.

#### Right to delete and account deletion

- Access is denied immediately when deletion/revoke is accepted.
- Learner-scoped B9 recipient links, events and evidence are physically purged within 30 days, overriding the normal 730-day retention.
- Assignment/Path shells may remain only without learner identity, private material metadata or evidence payload.
- A content-free anti-resurrection tombstone may remain for 180 days and is then purged.
- Publisher/teacher identity is pseudonymized when that account is deleted unless an active security investigation or mandatory legal hold is separately documented; B9 itself defines no legal hold.

This policy is a product/data-lifecycle contract, not jurisdiction-specific legal advice. If production counsel imposes a shorter lawful period, the shorter period wins without changing learning truth.

### O8 — Editor and teacher UI in slice 1

`APPROVED: REQUIRED_IN_FIRST_SLICE`

A backend-only or owner-only B9 is not a mature first implementation. Slice 1 includes:

- editor/curator: create draft, add typed items, reorder accessibly, validate provenance/access, preview RU/EN/HE, publish immutable version, fork revision and archive;
- teacher/group authority: assign pinned version, preview recipient snapshot, set due date, withdraw, add explicit later recipient, waive exact required item, set due exception and inspect redacted audit/evidence status;
- combined-role user: one scoped workspace with capability-based controls, not duplicate UIs or broad membership inference;
- learner preview mode that creates no adoption, progress, Finished, review, acknowledgement or provider event.

Every authoring action requires visible scope/role/provenance. Drag-and-drop is optional; keyboard reorder controls are required.

### O9 — Separate protected-cache purge program

`APPROVED: SEPARATE_PROGRAM_REQUIRED`

A separate security/data-lifecycle program is required for guaranteed purge of already materialized group-corpus bytes after entitlement revoke. Working name:

```text
GROUP-CORPUS-CACHE-REVOCATION
```

Boundary:

- It owns entitlement epochs, OPFS/Cache Storage/SW protected-body inventory, offline-denial semantics, purge receipts, reconnect reconciliation and proof that revoked material is no longer readable.
- B9 owns only path/assignment refs, immediate server fail-closed behavior and redacted history. It must not silently expand into cache-engine surgery.
- The purge program requires its own research packet, threat model, migration/cache strategy and owner approval.
- B9 may reach isolated/public-content beta while group-protected assignment items remain feature-disabled.
- **GA for Assignments containing protected group-corpus items is blocked until this purge program is closed with production and owner-live evidence.**
- Public-corpus paths and personal owner-only optional paths are not blocked by this program.

## Historical schema migration authorization — suspended

`MIGRATION=SUSPENDED_BY_B9_FREEZE`

Before the freeze, the owner had authorized the additive schema work described by D1–D10 and O1–O9:

- next available server migration after current migration-number recheck;
- next available OPFS/local migration after current migration-number recheck;
- new Path/draft/version/item, capability, adoption, Assignment/recipient/event/evidence, retention and cache/outbox domains;
- additive export/delete/audit integration.

Constraints that remain binding:

- no historical migration edit;
- no mass backfill or reinterpretation of Reading Lists, group membership/order, progress, Finished, bookmarks/notes, `review_log`, recommendations or presentation state;
- backup/preflight, schema dry-run, old-client compatibility, idempotent re-run and rollback proof before production execution;
- migrations and APIs remain behind default-off `ROOM_PATHS_ENABLED` until their gates pass;
- rollback disables feature/client and preserves additive rows; no destructive production down-migration;
- production migration/deploy evidence is a later execution gate and was not performed by this documentation update.

The migration shape remains a design baseline, but it may not be implemented or executed while B9 is frozen. Re-entry requires every condition and the exact unfreeze token from the freeze record. Any new truth domain, private-text grant, required comprehension, reread event, dynamic group assignment or AI generation still requires a new owner decision.

## Before B9 and after a future re-approved B9

The “after” column is a product-model explanation, not a statement of shipped or currently authorized capability. B9 remains frozen until its human operating-model gates and exact unfreeze token are satisfied.

### Scenario map

| Scenario | Before B9 | After a future re-approved B9 implementation |
|---|---|---|
| Find the next learning action | L0 Today/Journey/Reading Lists and corpus-local next actions are independent projections | L0 adds a distinct Paths & Assignments module and can project one active assignment next step into Today without owning a new feed |
| Personal curation | Named Reading List is mutable and device-local | Reading Lists remain unchanged; learner may explicitly import/fork one into a durable draft Path |
| Group content | Membership grants access; `position_no` orders the catalog; current Compass wording can look assigned without authority truth | Group catalog remains catalog; only a typed Assignment with actor, target snapshot and pinned version says “assigned” |
| Start an optional program | No durable optional path identity or cross-device adoption | Learner explicitly adopts one immutable published version and receives honest resume/history |
| Teacher assigns work | No assignment entity, due date, recipient snapshot, waive/withdraw or audit | Teacher selects a published version, previews current eligible recipients and creates one idempotent Assignment |
| Read text/song | Reader owns last position and explicit Finished locally | Same Reader writers remain canonical; Path adds context/next-step only and reads Finished for completion |
| Already Finished material | Journey can show Finished, but no path semantics | Matching Path item is immediately complete; no forced reread and no duplicate Finished write |
| Review words | Learner enters canonical Room Trainer; grading appends `review_log` | REVIEW item launches the same Trainer with explicit keys; completion projects only canonical matching events |
| Comprehension | Explicit advisory provider flow, ephemeral answer, no learning truth | Optional explicit launch from a Path; still no completion credit or implicit call |
| Resume on another device | Group/public reading position and Finished may remain local; assignment does not exist | Definitions/Assignments sync from server; minimal evidence receipt restores B9 step completion, but exact last row remains local unless its existing domain later gains sync |
| Path is revised | No versioned path lifecycle | New immutable PathVersion; existing Assignment remains pinned until explicit reassignment |
| Member/access revoked | Server reads fail closed; already materialized offline bytes may remain | B9 immediately blocks/redacts Path access; separate purge program must erase protected cached bytes before protected-item GA |
| Export/recovery | Reading/SRS bundle and group backup are separate; Reading Lists have local limitations | B9 exports definitions, authority/audit and learner evidence as separate versioned sections with idempotent read-back |

### What does not change

- Reading Journey, Reading Lists, corpus catalog/order and profile-fit retain their current ownership.
- Last position, Finished, bookmarks/notes and `review_log` keep their current canonical writers.
- Browsing, opening, reloading, expanding a disclosure or returning to a Path writes no learning event.
- Learners can continue free Library/corpus browsing without adopting a Path.
- No AI or provider is required for the core Path/Assignment flow.

## Scaling unlocked by B9

### Product scale

- reusable human-authored curricula without duplicating source texts;
- cross-corpus sequences mixing text, song and canonical review;
- optional self-study tracks and authority-bearing group assignments in one coherent product;
- template/fork workflows for editors and teachers while published history remains immutable;
- future AI-assisted draft authoring behind a separate default-off human-publish gate;
- later deterministic comprehension or reread contracts without rewriting Path identity.

### User and organization scale

- scoped capabilities allow one owner/editor/teacher or separate people without changing membership truth;
- snapshot recipients make a group assignment deterministic at 20, 200 or 2,000 learners;
- recipient rows can be created in bounded transactional chunks with one assignment idempotency key;
- learner and teacher queries paginate by active status/due time rather than loading all content or all members;
- immutable versions are cached/deduplicated by content hash and reused by many recipients/devices.

### Device and recovery scale

- server authority supports multiple devices while version-addressed local cache remains offline-capable;
- append-only event/evidence outbox converges by ID instead of last-write-wins blobs;
- definition, authority and learner-evidence exports can evolve independently;
- old clients can ignore B9 tables and routes while the flag is off; new clients can fail honestly against an old/disabled server.

### Operational scale

- actor/scope/version audit makes support and rollback explainable;
- exact retention prevents indefinite learner-evidence growth;
- no text bodies in Assignment rows keeps storage and tenant-isolation risk bounded;
- no background LLM/provider call keeps marginal cost deterministic;
- protected-cache purge remains a separately measurable security program rather than an invisible B9 side effect.

## How the learning process changes

### Learner

Before B9 the learner chooses among useful but independent surfaces: library/corpus discovery, Reading Lists, Reader, Trainer and Mentor. The next educational sequence is mostly self-composed. Group membership may make material look assigned without a real obligation or teacher provenance.

After B9 the learner sees a bounded human-authored sequence:

```text
read text → study/listen to song → canonical review → optional comprehension
```

The product shows who authored/assigned it, why each item is present, which steps are required, what is already satisfied and where to resume. Existing Finished is respected, so the learner is not forced to repeat completed reading. Review remains real Room/FSRS work, not a path checkbox. Optional comprehension remains optional and ungraded. Access loss or unavailable material produces a clear blocked state instead of a silent skip.

### Teacher/editor

The teacher/editor moves from sending a corpus/list informally to a reproducible workflow:

```text
draft → provenance/access validation → learner preview → immutable publish
      → recipient snapshot → assignment → evidence/exception history
      → new version or withdrawal
```

They can revise future work without changing the sequence already assigned, waive an exact requirement, grant a due exception and explain an assignment later from audit. They do not gain access to learner-private texts, notes, bookmarks or arbitrary learner telemetry.

### Pedagogical effect

- less decision fatigue: one visible next step rather than an unstructured catalog;
- continuity across reading, music and spaced review without collapsing their truths;
- teacher intent becomes visible and accountable;
- prior learning is recognized through Finished/review projections;
- no mandatory quiz wall and no AI grader;
- free exploration remains available alongside structured study;
- progress is honest about offline/local evidence and access limitations.

## Execution status of this documentation turn

```text
OWNER_DECISION=FROZEN
B9_IMPLEMENTATION_SCOPE=FROZEN
SCHEMA_MIGRATION=SUSPENDED_NOT_EXECUTED
CODE=NONE
OWNER_DATA_WRITES=NONE
COMMIT=DOCS_ONLY_CLOSURE
PUSH=DOCS_ONLY_CLOSURE
DEPLOY=NONE
```
