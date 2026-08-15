# Truth / writer / reader / source map

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, version `3.11.388`.
Evidence method: current `CODE`, read-only `PRODUCTION` and `OWNER_LIVE_READ_ONLY`; no new `ISOLATED_AUTOMATION`; prior closure is bounded `OWNER_REPORTED`; no `EXTERNAL_PRIMARY` claim in the map.
Limitations: proposed B9 rows are architecture options, not schema or executed migration.

## Existing canonical domains

| Block | Truth domain and writer | Reader/API | Identity / idempotency | Scope, sync, recovery | Access, revoke, audit, lifecycle | B9 reuse / missing truth |
|---|---|---|---|---|---|---|
| Named Reading Lists | `corpus_reading_lists_v1`; `library-ui.js` add/remove/rename/delete writes one localStorage blob | `getReadingLists()` and Library actions | list/item IDs are local random/time-derived; no cross-device idempotency | local browser only; no server sync; not in full OPFS bundle; eviction/reinstall can lose it | device possession only; no actor audit; delete is destructive local lifecycle | Import/fork adapter only. Missing authority, stable identity, version and durable recovery. |
| Group / corpus / membership | server SQLite `reading_groups`, `reading_group_members`, `group_corpora`; invite/member owner routes | `groupCorpusRepo`, `groupInviteRepo`, `/api/group-corpora*` | stable group/corpus/user/invite IDs; hashed single-use invite token | server/cross-device; group JSON/ZIP backup; membership checked on each read | owner/member roles; ACTIVE/REVOKED; owner operations audited | Reuse entitlement and owner scope. Membership is not assignment; editor/teacher grant is absent. |
| Curator catalog order | `group_corpus_works.position_no`, owner catalog import/backfill | listWorks/catalog UI/export | `(corpus_id,work_id)`, ordered by `position_no` | server; catalog export/import; reordering changes future catalog presentation | group membership read, owner write; catalog lifecycle follows corpus | Read/import as draft source only. Missing immutable authored sequence/version. |
| Personal text identity | OPFS `texts.id` runtime identity plus portable `text_key` and artifact/revision metadata | local DB APIs, Library/Reader | `text_id` local; `text_key` portable; import receipts/hashes for newer artifacts | local canonical; eligible personal text cloud artifact sync is separate; bundle export/import | owner device/account; delete cascades local content; provenance varies by source | Use stable typed `text_key` plus expected revision/hash. Teacher assignment of private text is disallowed without a grant. |
| Public corpus identity | catalog/work IDs, text key, catalog/content revision and provenance | corpus index/body APIs, Library/Reader | public `work_id`/`text_key` plus version/hash where exposed | public server/cache; corpus publish/release lifecycle | public entitlement; provenance required | Safe typed material ref when revision and availability policy are pinned. |
| Group material identity | `(corpus_id,work_id,text_key,bundle_sha256)` with protected body/audio | membership-gated group routes, local materialization | stable group/work refs plus hashes | server source; local cached material may remain after access loss; group backup exists | ACTIVE membership on server reads; revoke audited through member action; cached-byte erasure is not proven | Use only access-checked refs; never copy body into path. Surface unavailable on revoke. Cache leakage remains an explicit existing limitation. |
| Reading progress | `text_progress.last_row_idx/last_step_id`; explicit row interaction writer | Local DB / Reader / Journey projections | `text_id` row; no cross-device corpus key in current progress row | OPFS local; bundle export/import; personal artifact sync does not make all corpus progress cross-device | owner local; delete/eviction loses unless exported | Read for resume only. B9 may not write or mirror position. |
| Confirmed Finished | `text_progress.finished_at`; explicit `setTextFinished()` | Reader, Library/Journey, export/import | `text_id`; timestamp is canonical finish fact | OPFS local; bundle export/import; corpus Finished is not server-authoritative | owner action; independent from bookmark/list/path lifecycle | Read as text/song step completion. For cross-device B9, sync only a scoped evidence receipt, never another Finished bit. |
| Bookmarks / notes | separate local tables/APIs; bookmark uniqueness and re-anchoring; note domains | Reader/local DB/export | UUID + `(text_id,sentence_id)` and portable anchors | OPFS/local export/import; independent sync rules | owner only; explicit add/remove/edit | Context only; never completion or prerequisite. |
| `review_log`, SRS, Trainer | append-only `review_log`; Room `commitReviewAttempt()` is the canonical grade writer; FSRS/word status are projections | Room queue/Trainer, replay, sync cursor, exports | deterministic event ID; canonical `item_key`; insert-or-ignore replay | local plus dedicated log sync; bundle read-back; deterministic replay | owner grade action; no navigation/reveal write; append/annul semantics rather than destructive overwrite | B9 review step reads/query-launches only. No B9 grade/review writer. |
| Advisory comprehension | no durable learning truth; POST invokes bounded provider generation; client answer state is ephemeral | `/api/agent/comprehension`, Mentor UI | response keyed to request, no durable attempt ID | online/provider dependent; not exported or recoverable | auth, CSRF, consent, BYOK; no grade/audit learning record | Optional advisory launch only. Required completion is absent. |
| Lesson Builder artifact | sessionStorage schema v2 draft/active/discarded with 24h TTL | `lesson-artifact.js`, Lesson Studio | artifact ID/session scope; no published version ID | one browser/tab session; no server sync/export/recovery contract | learner/owner consent; no teacher/assign/revoke audit | Human-reviewed draft import later. Not a Path/Assignment. |
| Learning Compass/profile-fit | derived lexical ingredients/cache plus deterministic display reason | compass core/ingredients/UI | cache key + source/content/resolver/entitlement revisions | local derived cache; evictable/rebuildable | entitlement-filtered; no authority audit | Explain fit only. Never assignment/comprehension/recommendation-feed truth. |
| Current `group_assignment` reason | no truth domain; hardcoded UI input for every group work | `choosePrimaryReason()` label | none | presentation only | membership indirectly gates card visibility; no assignment actor/revoke/audit | Must not be reused. Future typed Assignment drives assigned label; group-only provenance gets neutral copy. |

## Proposed B9 domains

Names are conceptual. They must be re-numbered/revalidated at implementation time and require a separate migration approval.

| Block | Proposed canonical writer | Reader/API | Identity / idempotency | Scope, sync, recovery | Access, revoke, audit, lifecycle |
|---|---|---|---|---|---|
| Path identity | scoped owner creates `curated_paths`; path header rename/archive actions use optimistic revision | list/get path, author workspace, export | UUID `path_id`; write key + expected revision | server authoritative; local read cache; export/import with schema/content hashes | owner scope `USER/GROUP/CORPUS`; archive preserves versions; hard delete only never-published/unassigned drafts |
| Draft | authorized editor mutates `curated_path_drafts` and typed draft items | draft read/preview/validate/publish | `draft_id`, monotonic `draft_revision`, request idempotency key | server authoritative; optional offline outbox only after conflict UI is implemented | EDIT capability; publish requires PUBLISH; every mutation actor/audit; discard is explicit |
| Published PathVersion | publish transaction freezes validated draft into `curated_path_versions` + items | learner version read, assignment pin, export | UUID `path_version_id`, `(path_id,version_no)`, canonical content hash | immutable server truth; local cache addressed by version/hash; full read-back export | cannot edit/delete while referenced; supersede/archive only; provenance/publisher/time retained |
| Optional adoption | learner explicitly starts/follows a published version | learner path list/resume | `(learner_id,path_version_id)`, idempotent start/leave event | server relation plus local cache/outbox | learner-owned; leave hides path but does not erase learning truth; not authority-bearing |
| Assignment authority | authorized teacher/owner creates assignment pinned to a version; group recipients materialized at assignment time | learner assignment list, authority dashboard, export | UUID `assignment_id`; request idempotency key; unique recipient IDs | server canonical; local offline cache; cursor sync and read-back export | ASSIGN capability; actor/target/due/policy visible; withdrawal and reassign are events, never in-place content edits |
| Assignment exception/event | explicit learner or authorized actor appends typed event | completion projector, history/audit | UUID/deterministic event ID plus client idempotency key | append-only server truth; offline outbox; merge by event ID | kinds and actor policy enforced; revoke/withdraw never deletes audit |
| Assignment-scoped completion evidence | client appends a minimal receipt only after reading canonical local Finished; server projects review items directly from `review_log` | path completion projector and teacher “evidence synced” status | `(recipient_or_adoption,item_id,source_domain,source_fact_key)` unique; no position/body | server receipt survives device loss; local outbox; export/import/read-back | no content or row position; receipt cannot alter Reader/Journey; delete path leaves underlying learning truth untouched |
| Completion | no completion-bit writer; deterministic projection over pinned items, canonical facts, evidence receipts and exception events | learner/teacher status query | projection version + input cursors/hashes | rebuildable; cache may be evicted; authoritative inputs survive according to their domains | access loss yields unavailable/blocked, not silent complete; history retains redacted authority facts |

## Non-collapsible axes

| Axis | Owner | Example | Must not be encoded as |
|---|---|---|---|
| Authored order | immutable PathVersion | item positions and prerequisites | corpus `position_no`, Reading List order |
| Assignment authority | Assignment + scoped grant | who assigned version V to whom and when | group membership, Compass reason |
| Learner activity | existing reading/retention domains | Finished, canonical review event | path item checkbox written on navigation |
| Completion projection | deterministic B9 query | all required predicates satisfied or waived | mutable `assignment.completed=true` writer |
| Acknowledgement/skip/exception | typed B9 event | explicit Start, optional Skip, teacher Waive | progress, bookmark, disclosure state |
| Recommendation/profile-fit | existing derived systems | lower-bound vocabulary fit | assignment requiredness or saved feed |
| Presentation/disclosure state | existing local UI contract | expanded/collapsed author section | acknowledgement or completion |

## Reinstall and eviction honesty

- A local-only Finished fact is recoverable only from a verified local export/import unless its assignment-scoped evidence receipt has synced.
- Reading position is not uploaded by B9 and may be lost across devices/reinstall for corpus material.
- A synced B9 receipt can restore “this assignment step was evidenced complete,” not the precise row or global Reading Journey state.
- Protected content is always re-authorized at open. A path cache stores references/metadata, not body/audio copies.
- If access is revoked offline, already materialized content may remain under the current group-corpus cache contract. B9 must not amplify that limitation and must recheck access on reconnect/open; a separate security program is needed if guaranteed offline byte erasure is required.
