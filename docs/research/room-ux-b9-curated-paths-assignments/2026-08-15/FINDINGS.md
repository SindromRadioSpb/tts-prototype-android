# Findings

Date: 2026-08-15
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at start; preserved.
Production: `https://linguistpro.kolosei.com/library.html`, served version `3.11.388`.
Evidence method: `CODE`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`, `EXTERNAL_PRIMARY`; no new accepted `ISOLATED_AUTOMATION`; prior B0–B8/Library closure is bounded `OWNER_REPORTED`.
Limitations: research-only; no schema/API/UI implementation, data mutation or narrow/RTL/AT physical execution.

## Confirmed facts

1. No Path/PathVersion/Assignment entity, writer, API or migration exists in current code.
2. Named Reading Lists are device-local mutable personal curation and are not synced/exported as an authority domain.
3. Group corpus order is catalog `position_no`; ACTIVE membership gates access. Neither is assignment truth.
4. `library-ui.js` passes `group_assignment:true` for every group-corpus work; Learning Compass converts that boolean to an “assigned” reason without any assigner/target/version record.
5. Reading last position and confirmed Finished have separate existing writers. B8/Journey is a projection, not a table.
6. Room grading has one atomic canonical writer into append-only `review_log`; reveal/navigation do not grade, and replay/sync already exist.
7. Current comprehension is provider-generated advisory content with ephemeral answer handling and no learning write.
8. Lesson Studio creates a bounded 24-hour browser artifact; it has no publish/version/teacher/assignment/completion contract.
9. Group owner management supports access and backup, but only OWNER/MEMBER membership roles exist; corpus editor/teacher B9 authority is absent.
10. Production L0, corpora, Reader and Lesson Studio have no distinct Paths/Assignments surface or resume context.
11. Official comparator products keep at least some separation between authored structure, target assignment, completion condition, scoped authority and backup; Google’s documented group assignments snapshot recipients.

## Recommendation

Adopt Option B as the canonical architecture and Hybrid D as the integration strategy:

- stable `CuratedPath`;
- mutable optimistic-lock draft;
- immutable content-hashed published `PathVersion`;
- typed ordered items;
- optional learner adoption separate from required `Assignment`;
- Assignment pinned to one version and to a learner or snapshot group recipients;
- capability-in-context authoring/assign authority;
- completion projection over existing Finished and `review_log`, plus narrowly justified B9 exception/evidence events;
- server authority with local offline cache/outbox and explicit export/read-back;
- human-only first slice; AI generation/default provider calls absent.

## Schema/data impact

**The researched mature B9 model would require a schema migration, but its execution authority is now suspended by the B9 freeze.** At the research baseline that implied an additive next server migration after `059` and an additive next OPFS migration after local migration `049`; neither number is reserved and both must be revalidated after any future explicit unfreeze.

Proposed server domains: path identity/draft/draft items/version/version items, scoped capability grants, optional adoptions, assignments, snapshot recipients, append-only assignment events, assignment-scoped evidence receipts and audit/export integration. Proposed local domains: immutable version/assignment cache, server cursor, offline event/evidence outbox and sync receipts. No current data needs mass backfill. Existing reading lists/corpus order can later be imported into drafts explicitly.

No migration was created or executed in this research/documentation session. The historical design acceptance and exact lifecycle values remain recorded in [ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md), while [the B9 freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md) is authoritative for current execution permission.

## Owner-approved resolutions

These decisions remain a future design baseline. They do not authorize implementation while B9 is frozen because no qualified curator-mentor operating authority is currently available.

- Group Assignment snapshots current active recipients; future members require an explicit add/reassign.
- Existing canonical Finished counts; reread-after-assignment is unsupported in slice 1.
- REVIEW completion uses explicit item keys and qualifying canonical `review_log` events at/after PathVersion publication.
- Comprehension is optional launch-only and receives no completion credit.
- Personal texts remain available for owner optional paths but cannot be teacher-assigned in slice 1.
- Minimal assignment-scoped Finished evidence receipts are allowed under the strict no-position/no-content/no-grade boundary.
- B9 retention v1 is exact: active references have no TTL; terminal assignment audit/events/evidence and left adoptions are retained 730 days; request/delivery metadata 30 days; erasure tombstones 180 days; deletion overrides normal retention.
- Corpus-editor and teacher authoring/assignment UI is mandatory in the first slice, not merely schema/API-ready.
- Guaranteed purge of already materialized protected group-corpus bytes is a separate approved `GROUP-CORPUS-CACHE-REVOCATION` program and blocks protected-item Assignment GA until closure.

## Evidence required only after a future unfreeze

- Live HE/RTL, 380×844, 200% reflow, physical keyboard/AT and offline/service-worker behavior for the future B9 UI.
- Additive server/OPFS migration dry-run, idempotent rerun, old-client compatibility, export/read-back and feature-off rollback.
- Sync conflict/replay and local-Finished evidence receipt recovery across reinstall.
- Production and owner-live evidence for editor/teacher/learner workflows.
- Separate research, threat model and closure evidence for `GROUP-CORPUS-CACHE-REVOCATION`.

## Recorded semantic gap, not fixed here

The current group-corpus Compass label visually states assignment without canonical assignment truth. This is concrete code+production evidence, but not evidence that B0–B8 or the closed Library/Corpus program should be broadly reopened. Any future re-approved B9 implementation should replace this one input boundary: typed Assignment drives “assigned”; membership/catalog drives neutral group-curation provenance. The presentational gap remains documented and is not fixed by this freeze.

## Research and owner-decision closure

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
