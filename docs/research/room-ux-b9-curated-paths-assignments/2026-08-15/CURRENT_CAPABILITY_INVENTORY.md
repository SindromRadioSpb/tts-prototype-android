# Current capability inventory

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; B9 research did not modify them.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: `CODE` read-only audit, current `PRODUCTION` DOM inspection, `OWNER_LIVE_READ_ONLY` route traversal; no new `ISOLATED_AUTOMATION`; prior closures remain `OWNER_REPORTED` only at their stated boundaries; no `EXTERNAL_PRIMARY` claim is used in this inventory.
Limitations: no writes, provider calls, narrow/RTL physical run or destructive recovery exercise.

## Capability verdict

The repository has mature source, reading, retention, access and bounded lesson-advice domains. It has **no canonical Path, PathVersion, Assignment, AssignmentRecipient or assignment-event entity**. Similar-looking objects are not equivalent.

| Existing capability | Current contract | B9 reuse verdict |
|---|---|---|
| Named Reading Lists | Browser-local `corpus_reading_lists_v1`; `{id,name,items}`; random/time-based IDs; overwrite-style list writer; 300-item cap; no authority, version, audit, sync or included bundle export | Reuse only as an explicit “import/fork into draft” adapter. Never the Path or Assignment writer. |
| Global Reading Journey | Derived Library/L0 projection over reading truth; no journey table | May show a B9 next-step projection, but cannot own path membership, assignment or completion. |
| Corpus-local catalog/order | `group_corpus_works.position_no`; catalog search/filter and bounded vertical rows | May be imported into a draft or exposed as a source collection. Reordering cannot mutate a published/assigned path. |
| Group membership/access | Server-side ACTIVE membership checked on every protected read; roles currently `OWNER`/`MEMBER`; invite lifecycle and owner audit exist | Reuse as the access prerequisite. It does not prove assignment authority and lacks editor/teacher delegation. |
| Personal/public/group material identity | Local ephemeral `text_id`; stable `text_key`; public/group work IDs and group bundle/content hashes | Reuse typed stable refs. A published item must pin expected source/revision/provenance; never pin only local `text_id`. |
| Last working position | `text_progress.last_row_idx/last_step_id`, written from explicit reader interaction | Read-only completion/resume input. Path navigation must not write it. |
| Confirmed Finished | `text_progress.finished_at`, narrow explicit writer | Canonical text/song completion fact. B9 must not create another Finished writer. |
| Bookmarks and notes | Separate local tables and APIs; bookmarks re-anchor by stable identity/order | Context only. Never a prerequisite or completion proxy. |
| Trainer/SRS | Room `commitReviewAttempt()` atomically appends canonical `review_log` and updates projections; reveal/navigation do not grade; replay is deterministic | B9 review items launch the existing Room trainer and read `review_log`; they never grade or write review state. |
| Learning Compass/profile-fit | Derived lower-bound lexical projection; deterministic primary-reason ladder | May explain suitability. It is not assignment, comprehension or recommendation-feed truth. |
| Advisory comprehension | Authenticated/CSRF/BYOK LLM route; 1–2 multiple-choice prompts; ephemeral answer handling; explicitly not a grade; no persistence or `review_log` write | Optional launch only in first slice, with no completion credit. Required comprehension needs a separately approved deterministic content/answer domain. |
| Lesson Builder artifact | Schema v2, 1–3 sources, sessionStorage, 24h TTL, draft/active/discarded; no server publish/version/teacher/assignment/completion truth | Later human-reviewed draft-import adapter only. It cannot be a Path or Assignment. |
| Teacher surface | `teacher.html` is a bounded research-cohort aggregate dashboard; group owner shell manages invites/members/export/import | Do not repurpose the cohort dashboard. B9 needs a scoped curator/teacher workspace and authority model. |
| Export/recovery | Full local bundle covers reading/SRS facts; group owner has JSON catalog and ZIP backup; account export covers server user data | Extend additively with Path definitions, versions, assignments, audit and evidence receipts. Reading Lists remain an explicitly separate local limitation unless separately approved. |

## Code evidence anchors

- `public/js/learning-compass-core.js:215-220`: `choosePrimaryReason()` treats a boolean `group_assignment` as a display reason.
- `public/js/library-ui.js:9468`: every group-corpus work supplies `group_assignment:true`.
- `public/js/library-ui.js:889-944`: named reading lists are a browser-local list blob.
- `public/db/local-db.js:3380-3451`: one atomic Room grade writer for `review_log` plus projection.
- `public/db/local-db.js:4406-4433`: last position and Finished have distinct writers.
- `public/js/library-ui.js:5615` and `server.js:2752-2829`: comprehension is an advisory provider call and not a durable learning fact.
- `public/js/lesson-artifact.js`, `agent/lessonBuilder.js`, `agent/lessonCompositionContract.js`: bounded ephemeral lesson draft and source anchors, not publication/assignment.
- `db/groupCorpusRepo.js:5-78`: membership is required on each group-corpus read; catalog order is returned as catalog data.
- `db/groupInviteRepo.js:65-114`: join/redeem/revoke/member lifecycle; no assignment entity.
- `server.js:3812-4019`: group catalog, access, export/import and asset routes; no path/assignment route.
- `migrations/056_group_song_corpus_p0.sql` through `059_group_member_invites.sql`: group, member, catalog, audio, metadata and invite tables only.

## The `group_assignment` proof

1. The flag is not loaded from a table or API field.
2. `library-ui.js` injects it unconditionally while adapting every group-corpus work to Learning Compass.
3. `choosePrimaryReason()` merely selects the label when the boolean is present.
4. Repository-wide code/schema/route search found no matching assignment identity, writer, target, actor, due date, version pin, revoke or audit record.
5. Production renders the label on each sampled group-corpus card, even though only membership and curator order are known.

Therefore its honest meaning today is “shown from a group-curated corpus,” not “assigned by an authority.” It must not be used as the B9 assignment predicate. In an approved B9 implementation the label should be driven by typed assignment truth; group-only cards should use neutral group-curation provenance.

## Missing truths B9 must add

- Stable Path identity, mutable draft, immutable published version and content hash.
- Typed ordered version items with stable material/review refs, provenance and required/optional semantics.
- Scope-bound authoring/publish/assign capabilities beyond current owner/member membership.
- Optional learner adoption distinct from a required assignment.
- Assignment identity pinned to a published version; actor, target snapshot, due/withdraw/reassign lifecycle and audit.
- Typed acknowledgement/optional-skip/authority-waiver/due-exception/withdrawal events where the product promises them.
- An assignment-scoped, idempotent evidence receipt for a local-only canonical Finished fact when cross-device/reinstall completion must survive. This receipt is not reading progress or Finished truth.
- Path/assignment export, import/read-back, recovery cursor and access-redaction rules.

## Explicit non-equivalences

- Reading-list membership is personal curation, not authored learning order or authority.
- Corpus `position_no` is catalog order, not a version-pinned mixed learning sequence.
- Group membership is entitlement, not assignment.
- Lesson Builder activation is a 24-hour session artifact, not publication.
- An LLM comprehension response is advice, not an assessable result.
- Profile-fit/recommendation reason is a derived explanation, not assignment or completion.
- A disclosure’s expanded state is presentation state, not learner acknowledgement.
