# ROOM-UX-B9 — Curated Paths & Assignments owner decision packet

Date: 2026-08-15
Mode: `RESEARCH_COMPLETE · DESIGN RECORDED · EXECUTION FROZEN`
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree at research start: `DIRTY`, 34 pre-existing entries; preserved. Research adds documentation only.
Production inspected: `https://linguistpro.kolosei.com/library.html`, served version `3.11.388`.

## Evidence passport and limitations

- `CODE`: the required B0–B8/Library/Corpus canon, relevant Lesson Builder/SRS/group/recovery docs, current runtime, migrations, APIs, locales and fixtures were inspected. Current code wins over older roadmap language.
- `ISOLATED_AUTOMATION`: no new product test was executed. Existing fixtures were inspected. A Chrome viewport override that did not alter the actual viewport is excluded from evidence.
- `PRODUCTION`: served version and current production surfaces were inspected.
- `OWNER_LIVE_READ_ONLY`: authenticated desktop RU Library/L0, public corpus, My Texts, group corpus, Reader, Mentor and Lesson Studio were traversed without domain mutations/provider calls.
- `OWNER_REPORTED`: the owner first accepted the mature B9 design, then froze implementation and migration on 2026-08-15 because no qualified curator-mentor with the required knowledge and specialization is currently available.
- `EXTERNAL_PRIMARY`: official Canvas, Moodle and Google Classroom documents were checked 2026-08-15; inferences are labelled.

No private owner content or identifiers are reproduced. Live HE/RTL, 380×844, 200%, physical keyboard/screen reader, offline/reconnect and service-worker update remain implementation gates, not research passes.

## Owner approval recorded

The product decisions and former migration authorization are recorded in [ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md). That record remains authoritative for the frozen design values: snapshot recipients, existing Finished, canonical REVIEW completion, optional comprehension, private-text exclusion, the minimal evidence receipt, exact retention, first-slice editor/teacher UI and the separate protected-cache purge program. [The B9 freeze record](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md) supersedes it for all current execution and migration authority.

The later authoritative state is [ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md). D1–D10 remain a frozen design baseline, but no implementation or migration may proceed without satisfying the re-entry conditions and an explicit `UNFREEZE ROOM-UX-B9`.

## Executive decision

Choose **Option B as the canonical data architecture, with Hybrid D adapters**:

- a stable `CuratedPath` owns a mutable draft and immutable content-hashed published versions;
- optional learner adoption is distinct from an authority-bearing required Assignment;
- Assignment pins one published version and snapshots current group recipients;
- existing Finished and append-only `review_log` remain canonical learner truths;
- B9 completion is a deterministic projection, supplemented only by typed assignment exception events and a minimal assignment-scoped evidence receipt needed to recover local-only Finished across devices;
- reading lists, corpus order and human-reviewed Lesson drafts may seed a draft but never become competing writers;
- AI path/content generation and implicit provider calls are default-off and outside the first slice.

The current `group_assignment` Compass label is not backed by an assignment record. B9 must replace that presentation inference at the integration boundary; it does not justify reopening B0–B8 broadly.

## Closed decisions not reopened

B0–B8; Library/Corpus Surface Unification; Corpus Discovery & Catalog; Audio/TTS Indicator Parity; global Reading Journey; consolidated Reading Lists; last position/bookmarks/Finished separation; append-only `review_log`/FSRS; vertical bounded rows; shared disclosure/presentation state; derived profile-fit; and the ban on second writers all remain in force.

---

## D1 — Authoring authority

### Options

- **A — Owner only:** simplest, but blocks corpus editor/teacher workflows and encourages credential/ownership workarounds.
- **B — Broad role strings:** add `EDITOR`/`TEACHER` to group membership and infer all powers. Simple UI, but conflates material access, group membership, publish and assignment authority.
- **C — Scoped human capabilities:** owner/editor/teacher labels bundle a small capability set in a `USER`, `GROUP` or `CORPUS` context; underlying membership remains the access prerequisite.

### Evidence and roles

- `CODE`: membership currently has OWNER/MEMBER and protects content; no editor/teacher or B9 grant exists. Existing owner mutations are authenticated, CSRF-protected and audited.
- `PRODUCTION`: current group management exposes access and backup capabilities, not path publication or assignment.
- `OWNER_LIVE_READ_ONLY`: the authenticated owner shell showed owner/member authority and no editor/teacher grant or B9 authoring control; no management action was invoked.
- `EXTERNAL_PRIMARY`: Moodle models permission collections in context; Google distinguishes primary/co-teacher and group targeting.
- R4 needs visible authority; R6/R7 need curator/editor provenance; R9 needs stable asserted actor identity; R12/R14 require scope isolation; R15 requires durable audit; R17 forbids agent authority over grading/publication.

### Risks and failure modes

Owner-only cannot meet the product goal. Broad group roles create privilege escalation and a second meaning for membership. Capability sprawl is controlled by six named grants: `PATH_EDIT`, `PATH_PUBLISH`, `PATH_ASSIGN`, `ASSIGNMENT_WAIVE`, `PATH_ARCHIVE`, `PATH_EXPORT`.

### Recommendation and boundaries

Choose scoped human capabilities. A grant is effective only while underlying access/membership is ACTIVE. Every grant/revoke/publish/assign/waive action records actor, scope, timestamp, object/version hash and idempotency key. AI never receives a capability.

- Migration/data impact: new additive scoped-grant/audit rows; no membership backfill.
- Backward compatibility: current OWNER may be projected to all capabilities in its group by policy without rewriting member rows; MEMBER gets none by default.
- Rollback: disable B9 capability checks/routes and leave inert grants; existing group access stays unchanged.
- **Approval value:** `D1=SCOPED_HUMAN_CAPABILITIES`

## D2 — Path identity and lifecycle

### Options

- **A — Reading List extension:** mutable local list becomes the path.
- **B — One mutable Path:** server path exists but published content edits in place.
- **C — Stable Path + mutable draft + immutable published versions:** assignment pins a version; rename/archive/supersede are separate operations.

### Evidence and roles

- `CODE`: Reading Lists are local mutable blobs with destructive rename/delete and no version/audit. Corpus order also mutates independently.
- `PRODUCTION`: Reading Lists are visibly personal; no published version/history exists.
- `OWNER_LIVE_READ_ONLY`: the L0 Reading Lists module and corpus surfaces exposed current list/catalog lifecycle but no draft/publish/version boundary; no list action was invoked.
- `EXTERNAL_PRIMARY`: Canvas asks whether changed requirements should re-lock learners; this exposes the ambiguity of mutable published structure. Canvas/Moodle exports separate definitions from learner state.
- R6/R7/R9 require editorial provenance and stable IDs; R11 rejects retroactive truth change; R12 wants immutable event/projection boundaries; R13 requires rollback/idempotency; R15 requires archive/export.

### Risks and failure modes

Version sprawl and stale drafts are manageable with bounded history, archive and content hashes. Mutable publication would silently reorder assigned work and invalidate completion.

### Recommendation and boundaries

Choose C. `path_id` is stable; draft uses optimistic `draft_revision`; publish freezes header snapshot, items, provenance and hash into `path_version_id`. Existing assignments/adoptions never auto-upgrade. Hard delete is allowed only for never-published/unassigned drafts; otherwise archive.

- Migration/data impact: new Path, draft, draft-item, version and version-item domains.
- Backward compatibility: no reading-list/corpus mutation; explicit adapter may copy their current refs/order into a draft.
- Rollback: feature-off leaves immutable rows inert; no down-migration or loss of closed-domain data.
- **Approval value:** `D2=DRAFT_IMMUTABLE_PUBLISHED_VERSIONS`

## D3 — Typed sequence model

### Options

- **A — Generic material IDs:** one item kind plus flags.
- **B — Full LMS graph:** arbitrary branches, conditions, quizzes and scores.
- **C — Bounded typed linear sequence:** `TEXT`, `SONG`, `REVIEW`, `COMPREHENSION`; required/optional; earlier-item prerequisites; stable refs/provenance and explicit completion rules.

### Evidence and roles

- `CODE`: source identities differ across personal/public/group; review uses canonical item keys; comprehension and Lesson artifacts have different truth/lifecycle. A generic ID cannot resolve them honestly.
- `PRODUCTION`: corpora, Reader, Trainer and Lesson Studio are distinct surfaces with different authority and persistence.
- `OWNER_LIVE_READ_ONLY`: the sampled Reader, group/public catalogs and Lesson Studio confirmed distinct step affordances and provenance; no source selection, grading or provider action was invoked.
- `EXTERNAL_PRIMARY`: Canvas supports heterogeneous module items and type-specific completion but also illustrates LMS complexity.
- R2/R8 need a pedagogically meaningful path; R4 needs bounded vertical rendering; R6/R7/R9 require source/provenance; R11 rejects silent substitution; R16 rejects needless complexity; R17 preserves reading-first next steps and grader independence.

### Risks and failure modes

A generic model hides semantics; full branching invites gradebook/LMS scope. Missing/protected materials could silently collapse order unless blocked states are typed.

### Recommendation and boundaries

Choose C, maximum 48 items, linear first slice. A required unavailable item blocks until authority waiver/withdraw/reassign; optional may be explicitly skipped. Published positions cannot change. `COMPREHENSION` is optional launch-only in slice 1. `REVIEW` targets explicit canonical item keys and never auto-creates cards.

- Migration/data impact: typed version-item rows/JSON with checks and content hash.
- Backward compatibility: material adapters map stable refs; local `text_id` is never published as sole identity.
- Rollback: clients ignore disabled B9 refs; source materials remain untouched.
- **Approval value:** `D3=TYPED_LINEAR_SEQUENCE_V1`

## D4 — Assignment model

### Options

- **A — Required flag on a material/list:** no actor/version/target history.
- **B — Membership means assignment:** every group corpus item is “assigned.”
- **C — Version-pinned Assignment:** separate relation to learner or group; group assignment snapshots current active recipients; future members require explicit add/reassign.

### Evidence and roles

- `CODE`: current `group_assignment:true` is injected for every group item; there is no entity/writer. Membership and `position_no` are the only real facts.
- `PRODUCTION`: group cards visually look assigned without assigner/due/version; management has no assignment lifecycle.
- `OWNER_LIVE_READ_ONLY`: every sampled group-card reason carried the assigned wording while the same authenticated shell exposed only membership/catalog authority; no member/order action was invoked.
- `EXTERNAL_PRIMARY`: Google Classroom documents snapshot membership when group assignment is saved; later group edits do not silently change assignees.
- R4 needs explicit required/optional/authority; R9 stable relations; R11 immutable history; R12 event/projection separation; R14 target isolation; R15 audit/withdraw retention.

### Risks and failure modes

Snapshot groups require an explicit “assign to new members” action. Dynamic membership is convenient but creates retroactive obligations and ambiguous revocation. Corpus cannot be a learner target.

### Recommendation and boundaries

Choose C. Assignment records assigned version, actor, assigned time, optional due policy and target; recipient rows capture current learners transactionally. Corpus is an ownership/source scope, not assignment target. Optional path uses learner adoption, not `required=false` Assignment.

- Migration/data impact: assignment, recipient and lifecycle-event rows.
- Backward compatibility: existing group membership/order unchanged; current false-positive label becomes neutral unless a typed recipient exists.
- Rollback: withdraw/feature-off; retain audit and pinned versions.
- **Approval value:** `D4=VERSION_PINNED_ASSIGNMENT_SNAPSHOT_RECIPIENTS`

## D5 — Completion truth

### Options

- **A — B9 checkboxes/progress:** store per-step complete and grade from path UI.
- **B — Pure local projection only:** read Finished/review facts; no new B9 events/receipts.
- **C — Canonical-fact projection plus narrow typed B9 events/evidence:** no completion bit; explicit exceptions and cross-device evidence only.

### Evidence and roles

- `CODE`: last position, Finished, bookmarks and append-only `review_log` already have canonical writers. Current comprehension has no durable truth. Corpus Finished is local, while review log has dedicated sync.
- `PRODUCTION`: Journey/Trainer already project next actions; no B9 completion writer exists.
- `OWNER_LIVE_READ_ONLY`: Reader/Trainer/L0 inspection preserved current state and showed no path completion UI; no row, Finished, bookmark or grade action was performed.
- `EXTERNAL_PRIMARY`: Canvas/Moodle expose typed completion predicates and explicit authorized override; mere structure is not completion.
- R2 requires valid learning evidence; R11 protects established truth; R12 prohibits dual write; R13 needs idempotent replay; R15 limits data; R17 forbids LLM/agent grading and navigation-as-skip.

### Risks and failure modes

A creates forbidden second writers. B cannot honestly meet cross-device/reinstall assignment completion and cannot remember waiver/withdrawal. C risks becoming a shadow progress system unless payloads/readers are strictly bounded.

### Recommendation and boundaries

Choose C:

- text/song: canonical explicit Finished (“ever finished”); reread-after-assignment unsupported in slice 1;
- review: explicit item keys and canonical `review_log.kind='review'` event at/after pinned version publication;
- comprehension: no completion credit in slice 1;
- completion: deterministic “all required canonical predicates or exact authority waivers”; no stored completion bit;
- events: explicit `ACKNOWLEDGED`, `OPTIONAL_SKIPPED`, `REQUIRED_WAIVED`, `DUE_EXCEPTION_SET`, `WITHDRAWN`, `RECIPIENT_ADDED`;
- minimal Finished evidence receipt only for recipient/adoption recovery; contains no position/body/note/grade and is never read as global Finished.

- Migration/data impact: append-only events/evidence receipts and local outbox; no progress/review backfill.
- Backward compatibility: underlying learning facts remain valid if all B9 rows are deleted/disabled.
- Rollback: disable projector/sync; preserve existing Finished/review; export unsynced B9 outbox before local cache reset.
- **Approval value:** `D5=CANONICAL_FACT_PROJECTION_PLUS_TYPED_EVENTS`

## D6 — Surface ownership

### Options

- **A — Put paths inside Reading Lists/Journey:** minimal navigation but semantic overload.
- **B — Put paths inside each corpus/group only:** contextual but no cross-corpus owner.
- **C — Distinct L0 module + contextual adapters + Reader/Trainer context + scoped author workspace.**

### Evidence and roles

- `CODE`: L0, group access, Reader progress, Room grading and Lesson artifact ownership are separate contracts.
- `PRODUCTION`: the current UI keeps Today, Journey, Reading Lists, corpora, Reader and Lesson Studio as distinct regions.
- `OWNER_LIVE_READ_ONLY`: no current Paths/Assignments destination; expected resume is global, while source/provenance is contextual.
- `EXTERNAL_PRIMARY`: comparator products expose a learner work destination and separate author controls; accessible sequence/reorder needs explicit semantics.
- R4 demands mobile/RTL clarity; R5 product coherence; R6/R8 source and graded-reading context; R11 prevents owner conflicts; R17 keeps next action reading-first.

### Risks and failure modes

Too many L0 modules can clutter. Mitigate with one shared typed section/disclosure grammar and prioritize active assignments. Teacher authoring in cohort `teacher.html` would violate privacy/ownership.

### Recommendation and boundaries

Choose C. L0 owns the global list/resume/history. Corpus/group pages expose contextual path links and management entry. Reader shows a compact path context bar; Trainer gets return context only. A new same-document curator workspace owns draft/preview/publish/revise/archive/assign/withdraw.

- Migration/data impact: none beyond D1–D5; new UI/locale contracts.
- Backward compatibility: Journey/Lists/corpus surfaces retain existing ownership and vertical patterns.
- Rollback: feature flag hides all B9 entries/context bars; existing navigation unchanged.
- **Approval value:** `D6=L0_MODULE_CONTEXTUAL_READER_TRAINER_AUTHOR_WORKSPACE`

## D7 — Sync, recovery and export

### Options

- **A — Local-only B9:** cheap/offline but no teacher authority, cross-device or revoke.
- **B — Server-only:** authority works, but offline/reconnect and current Reading Room value regress.
- **C — Server authority + immutable local cache + idempotent offline outbox + separated exports.**

### Evidence and roles

- `CODE`: group authority is server-side; learner reading is OPFS/local; `review_log` already demonstrates cursor/idempotent replay; bundle and group backup have distinct scopes.
- `PRODUCTION`: My Texts explicitly promises device-local; group access/backup is separate.
- `OWNER_LIVE_READ_ONLY`: the authenticated UI exposed device-local and group-backup boundaries without running export/import or sync mutations.
- `EXTERNAL_PRIMARY`: Canvas separates course definition export from grades/interactions; Moodle allows selective content/user/completion backup.
- R5 requires offline usefulness; R12 clear truth/cache/outbox boundaries; R13 replay/read-back; R14 scoped server reads; R15 export/delete; R16 bounded storage/no provider cost.

### Risks and failure modes

Offline draft conflict and unsynced events require visible state. A single mega-export risks leaking protected content or combining definition with learner evidence.

### Recommendation and boundaries

Choose C. Server is canonical for definitions, grants, versions, assignments, recipients, events and evidence. OPFS stores version-addressed read cache, cursor and explicit outbox. Draft mutation is online in slice 1 unless a conflict-resolution UI is implemented. Export separates Path definitions/versions, authority/assignment/audit and learner evidence; protected content bodies are never copied. Import performs schema/hash preview and idempotent read-back.

- Migration/data impact: server tables, local cache/outbox/cursor; additive account/group export integration.
- Backward compatibility: current bundle/review/group exports remain versioned; add new sections/files without changing old meaning.
- Rollback: disable sync/routes; preserve outbox export; keep additive tables and serve old client.
- **Approval value:** `D7=SERVER_AUTHORITY_LOCAL_CACHE_OUTBOX_EXPORT`

## D8 — Access, privacy and revocation

### Options

- **A — Trust cached path metadata/content:** best offline continuity, unacceptable leak risk.
- **B — Remove all history on revoke:** stronger concealment but destroys audit and cannot prove prior authority.
- **C — Fail closed for content, retain redacted authority history, recheck each protected item.**

### Evidence and roles

- `CODE`: group APIs check ACTIVE membership per read and audit owner access actions; group material can be locally materialized. Path definitions do not yet exist.
- `PRODUCTION`: private group scope and access-management affordances are visible; no B9 protected-ref boundary exists.
- `OWNER_LIVE_READ_ONLY`: path-like assigned wording lacked assigner/version provenance, and no revoke/destructive control was invoked.
- `EXTERNAL_PRIMARY`: Google removal withdraws assignment visibility while some historical artifacts remain; Moodle backups separate/anonymize sensitive user data.
- R4 requires clear blocked/revoked state; R9 provenance; R11 no silent substitution; R14 tenant isolation; R15 minimization/export/delete; R17 no learner-content telemetry.

### Risks and failure modes

Existing offline cached group bytes may remain after revoke; B9 cannot claim byte erasure it does not own. Audit can leak titles unless redacted. Content availability may diverge per recipient in cross-corpus paths.

### Recommendation and boundaries

Choose C. Path stores refs, not bodies. Every protected open rechecks entitlement; revoke makes the recipient blocked/revoked, removes active requirement and redacts protected metadata in history/export while retaining opaque IDs/actor/time. No learner text, notes, answers or row telemetry enters B9. The owner approved a separate `GROUP-CORPUS-CACHE-REVOCATION` program; GA for Assignments containing protected group-corpus items is blocked until that program closes.

- Migration/data impact: access class/provenance refs, event/audit retention fields; no protected-body copy.
- Backward compatibility: existing membership remains canonical; B9 only consumes it.
- Rollback: disable B9 views/routes; current group access rules continue.
- **Approval value:** `D8=FAIL_CLOSED_SCOPED_ACCESS_REDACTED_HISTORY`

## D9 — AI boundary

### Options

- **A — AI-generated/published paths:** fastest content scale, highest provenance/quality/privacy risk.
- **B — AI-assisted draft with mandatory human publish:** bounded future option behind consent/flag/audit.
- **C — Human-only immediate scope; AI/provider calls absent.**

### Evidence and roles

- `CODE`: current Lesson Builder and comprehension are explicit provider routes with consent/BYOK and bounded ephemeral semantics; neither is B9 truth.
- `PRODUCTION`: Lesson Studio clearly presents a learner-created temporary draft, not teacher publication.
- `OWNER_LIVE_READ_ONLY`: Lesson Studio was opened only to inspect its disabled pre-build state; no source was selected and no provider call occurred.
- `EXTERNAL_PRIMARY`: Google documents Gemini draft assistance while teacher performs assignment publication.
- R1/R2/R7/R8 require human linguistic/pedagogical judgment; R11 do-no-harm; R15 content consent; R16 cost/default-off; R17 prohibits AI grader/publisher authority.

### Risks and failure modes

Even draft assistance can leak protected/personal content, create ungrounded prerequisites and pressure human rubber-stamping.

### Recommendation and boundaries

Choose C for immediate implementation. Preserve B as a separately approved later program: default-off, explicit source consent, bounded context, provenance/model, mandatory human preview/publish, no automatic assignment and no completion/grade authority. A is rejected.

- Migration/data impact: none for AI in slice 1; do not precreate generated-content rows.
- Backward compatibility: Lesson Builder/comprehension unchanged and not called by B9 navigation.
- Rollback: no AI capability exists to roll back.
- **Approval value:** `D9=HUMAN_ONLY_AI_DEFAULT_OFF`

## D10 — Immediate scope and release slicing

### Options

- **A — Learner-only prototype on localStorage:** fast demo, repeats Reading List and cannot meet authority/recovery.
- **B — Full LMS:** all roles, scoring, dynamic cohorts, AI and analytics in one release; excessive risk.
- **C — Additive B9 core slice with serialized server/client rollout and strict follow-up exclusions.**

### Evidence and roles

- `CODE`: server/local truth split and SW/version contract demand staged compatibility; current repo has additive migration, feature flag and scoped smoke precedents.
- `PRODUCTION`: current version is `3.11.388`; closed surfaces are live and must remain unaffected.
- `OWNER_LIVE_READ_ONLY`: current entry points and authority gaps are known; no destructive B9 record exists.
- `EXTERNAL_PRIMARY`: comparator complexity confirms the need for a bounded, reading-first slice.
- R4/R5 demand coherent first value; R11/R13 require staged no-harm migration; R12/R14/R15 require server truth/security/lifecycle from day one; R16/R17 reject AI/analytics creep.

### Risks and failure modes

A local prototype would become disposable shadow truth. A full-LMS release would couple migration, authority, pedagogy, AI and analytics into one rollback boundary. Even the bounded core can regress cached clients unless server, client and SW are deployed in order behind a default-off flag; owner-live writes must wait for isolated schema/sync/export evidence.

### Recommendation: slice 1

Include:

1. additive server/local schema and repositories behind default-off `ROOM_PATHS_ENABLED`;
2. human scoped grants, draft validation, immutable publish and version read;
3. optional learner adoption and required learner/group-snapshot Assignment;
4. text/song Finished projection, explicit review-log projection, optional comprehension launch with no credit;
5. typed exception events and minimal evidence sync/outbox;
6. L0/detail/Reader/Trainer context plus owner/group-author workspace;
7. RU/EN/HE keys, vertical bounded layouts and accessible non-drag reorder;
8. definition/assignment/evidence export/import/read-back, audit, revoke/redaction;
9. replacement of hardcoded group “assigned” reason with typed Assignment input or neutral group-curated provenance;
10. version/SW bump and full future verification matrix.

Defer or route to a separate approved program:

- required/scored comprehension, reread-after-assignment, dynamic future-member assignment, arbitrary branching, gradebook/rubrics, teacher analytics, assignment of private learner texts, AI assistance/generation and Visual Finishing;
- guaranteed purge of pre-existing offline protected group-corpus bytes belongs to the separately approved `GROUP-CORPUS-CACHE-REVOCATION` program. Public-content B9 beta may proceed with protected group items feature-disabled; protected-item GA may not.

- Migration/data impact: required additive server + OPFS migrations, separate owner approval gate; no mass backfill.
- Backward compatibility: old clients ignore new tables/routes; new client handles feature-off/old server; existing reading/group/training histories unchanged.
- Rollback: flag off → client rollback → retain additive rows; no destructive down-migration. If evidence receipts have synced, they remain exportable/auditable but no closed-domain writer reads them.
- **Approval value:** `D10=ADDITIVE_B9_CORE_SERIALIZED_RELEASE`

---

## Migration decision

`MIGRATION=SUSPENDED_BY_B9_FREEZE`

At current HEAD, likely file positions are the next server migration after `migrations/059_group_member_invites.sql` and the next local migration after OPFS migration `049`. The numbers must be rechecked after rebase. No backfill or reinterpretation of Reading Lists, catalog order, membership, progress, Finished, bookmarks, notes or `review_log` is allowed.

Proposed entities are options pending approval, not schema created in this session:

- server: paths, drafts/items, immutable versions/items, scoped grants, adoptions, assignments, recipient snapshots, append-only events, evidence receipts and audit/export integration;
- local: immutable cache, server cursor, event/evidence outbox and sync receipt state.

Migration acceptance requires backup, schema dry-run, idempotent re-run, old-client compatibility, zero-row initial state, export/read-back and feature-off rollback proof before any owner-live write.

The owner previously accepted this additive server+OPFS migration shape, but the subsequent B9 freeze suspends execution authority. It remains unexecuted.

## Implementation-ready allowlist

Exact allowlist must be frozen after rebase/recon. Expected candidates:

- `migrations/<next>_room_ux_b9_paths_assignments.sql` — new only;
- new `db/curatedPathRepo.js`, `db/pathAssignmentRepo.js` and focused tests;
- `server.js` for gated API wiring only;
- `db/identityRepo.js` only if account export/delete integration requires it;
- `public/db/migrations.js`, `public/db/db-worker.js`, `public/db/local-db.js` only for B9 cache/outbox APIs, outside existing progress/review/list writer blocks;
- new `public/js/room-paths-core.js`, `public/js/room-paths-sync.js`, `public/js/room-path-authoring.js`;
- `public/js/library-ui.js`, `public/library.html` for B9 views/integration only;
- `public/i18n/locales/ru.js`, `en.js`, `he.js` in lockstep;
- focused unit/API/browser smoke fixtures under `tests/` and `scripts/premium/`;
- `public/sw.js`, `public/index.html`, `package.json` only in the release/version commit;
- B9 implementation/release evidence docs.

## Files and zones forbidden to touch

- Existing migrations `056`–`059` and any historical migration.
- `db/groupCorpusRepo.js`, `db/groupInviteRepo.js` and membership/catalog writers unless a new owner decision expands scope.
- `public/js/learning-compass-ingredients.js` and recommendation/profile-fit algorithms. The UI caller may pass typed assignment truth; the derived model is not changed.
- Reading-list key/schema/actions in `library-ui.js`, except a separately approved one-way draft-import adapter.
- Existing progress/Finished/bookmark/note writers in `public/db/local-db.js` and `library-ui.js`.
- `commitReviewAttempt`, `review_log` schema/writers, FSRS/replay/Trainer grading code.
- `agent/lessonBuilder.js`, `agent/lessonCompositionContract.js`, `/api/agent/comprehension` and provider/BYOK flows.
- Corpus data/shards, curator `position_no`, catalog metadata and source provenance.
- `.claude/PROD_OPS_PRIVATE.md`, owner databases/exports/backups and any owner records.
- Broad icon/typography/motion/Visual Finishing changes.

For shared files, the forbidden zones override the file-level allowlist.

## Writer and idempotency rules

- One writer per existing truth remains unchanged.
- Draft mutation: authenticated scoped editor + expected revision.
- Publish: one transaction, canonical content hash, immutable rows, idempotency key.
- Assign: pinned version + capability/access preview + snapshot recipients in one transaction.
- Event/evidence: append-only, deterministic/UUID event ID, unique client key; same key/different payload fails.
- Completion: query/projection only; caches are evictable and rebuildable.
- No open/resume/back/next/reload/disclosure action writes progress, bookmark, review or acknowledgement.

## Serialized commits and deployments

Proposed scoped commit order after approval:

1. schema/repositories/API contracts and tests, feature default-off;
2. local cache/outbox/projector core and replay tests;
3. author workspace + RU/EN/HE + accessibility tests;
4. learner L0/detail/Reader/Trainer integration and typed group-assignment label boundary;
5. export/recovery/revocation gates and complete smoke matrix;
6. release version/SW bump and evidence docs.

Deployment order:

1. production health/DB/schema/backup preflight;
2. additive migration + server with flag off;
3. verify old client and zero-impact routes;
4. deploy client/version/SW while flag remains off;
5. isolated automation and cache/update gates;
6. enable only for explicit owner allowlist;
7. bounded owner-live script with enumerated writes/rollback after separate approval;
8. wider beta only after evidence; production/owner-live/GA labels remain distinct.

Rollback: disable flag first, restore prior client/SW, leave additive tables/data intact and exportable. Never roll back by deleting B9 rows or rewriting existing learner truth.

## Production verification plan

The approved implementation must execute the complete matrix in [SURFACE_AND_INTERACTION_MATRIX.md](../research/room-ux-b9-curated-paths-assignments/2026-08-15/SURFACE_AND_INTERACTION_MATRIX.md), including desktop RU/HE, 380×844 RU/HE RTL, 200%, keyboard, screen-reader DOM, reload/reopen, offline/reconnect, SW update, all path shapes/access/version/history/sync/export/privacy cases, and explicit proof of zero navigation-triggered learner writes and zero implicit provider calls.

No automated run may be called physical-device, assistive-technology or owner-live evidence.

## Recorded design values — frozen

```text
APPROVE ROOM-UX-B9-R:
D1=SCOPED_HUMAN_CAPABILITIES;
D2=DRAFT_IMMUTABLE_PUBLISHED_VERSIONS;
D3=TYPED_LINEAR_SEQUENCE_V1;
D4=VERSION_PINNED_ASSIGNMENT_SNAPSHOT_RECIPIENTS;
D5=CANONICAL_FACT_PROJECTION_PLUS_TYPED_EVENTS;
D6=L0_MODULE_CONTEXTUAL_READER_TRAINER_AUTHOR_WORKSPACE;
D7=SERVER_AUTHORITY_LOCAL_CACHE_OUTBOX_EXPORT;
D8=FAIL_CLOSED_SCOPED_ACCESS_REDACTED_HISTORY;
D9=HUMAN_ONLY_AI_DEFAULT_OFF;
D10=ADDITIVE_B9_CORE_SERIALIZED_RELEASE;
MIGRATION=SUSPENDED_BY_B9_FREEZE;
SCOPE=B9_CORE_NO_AI_NO_SCORED_COMPREHENSION_NO_DYNAMIC_GROUPS;
```

The owner’s design decision preserves these values and O1–O9 for possible future re-entry. The current execution state is:

```text
OWNER_DECISION=FROZEN
B9_IMPLEMENTATION_SCOPE=SUSPENDED
SCHEMA_MIGRATION=SUSPENDED_NOT_EXECUTED
CODE=NONE
OWNER_DATA_WRITES=NONE
COMMIT=NONE
PUSH=NONE
DEPLOY=NONE
```
