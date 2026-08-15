# ROOM-UX-B9 — Curated Paths & Assignments freeze record

Date: 2026-08-15
Status: `FROZEN · NO IMPLEMENTATION · NO MIGRATION`
Source commit at decision: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`; unrelated owner changes remain outside this record.
Production reference: `https://linguistpro.kolosei.com/library.html`, last B9 research-inspected version `3.11.388`.

## Evidence and authority passport

- `CODE`: no runtime or schema change was made. The completed B9 research packet remains an architecture record only.
- `ISOLATED_AUTOMATION`: none executed for this freeze decision.
- `PRODUCTION`: no production operation or fresh verification was performed.
- `OWNER_LIVE_READ_ONLY`: no owner profile was opened or changed.
- `OWNER_REPORTED`: on 2026-08-15 the owner froze B9 because the current product is operated for self-study and no qualified curator-mentor with the required knowledge and specialization is available.
- `EXTERNAL_PRIMARY`: no new external research was required for the freeze.

Limitations: this record closes the current B9 execution lane. It does not invalidate the research architecture, prove implementation readiness or authorize adjacent runtime work.

## Owner decision

The mature B9 design is technically coherent, but its value and safety depend on a real human authoring authority. LinguistPro currently serves self-study, while no qualified curator-mentor is available to own curriculum selection, source judgment, pedagogical sequencing, publication, maintenance and learner exceptions.

Implementing Path/Assignment infrastructure without that operating role would create an empty or owner-simulated authority domain, pressure the product toward generic automation/AI curation and add schema/sync/security cost before trustworthy content operations exist. Therefore:

```text
ROOM_UX_B9=FROZEN
B9_IMPLEMENTATION_AUTHORITY=SUSPENDED
B9_SCHEMA_MIGRATION_AUTHORITY=SUSPENDED
B9_PRODUCTION_RELEASE=NOT_AUTHORIZED
B9_OWNER_DATA_CREATION=NOT_AUTHORIZED
```

The earlier architecture and migration approval is retained as historical design acceptance, but it is superseded for execution by this freeze. No agent may treat `APPROVED_FOR_MATURE_IMPLEMENTATION` or the proposed migration entities as current permission while this record is active.

## What remains valid

- Option B canonical core + Hybrid D adapter recommendation.
- D1–D10 and O1–O9 truth/authority/lifecycle decisions as a future baseline.
- Existing Finished and append-only `review_log` writer boundaries.
- Snapshot-recipient, immutable-version, evidence-receipt, retention and access models as research conclusions.
- Separate `GROUP-CORPUS-CACHE-REVOCATION` requirement before any future protected group-item Assignment GA.

These are frozen design artifacts, not shipped capability and not an active migration plan.

## Re-entry conditions

B9 may be reconsidered only after all of the following are true:

1. A named/accountable human curator-mentor role exists with demonstrated Hebrew, SLA/graded-reading, editorial/provenance and learner-support competence appropriate to the target materials.
2. The owner approves that role’s authority, availability, review capacity, conflict/escalation path and replacement/continuity plan.
3. At least one real bounded human-authored pilot path and maintenance rubric exists; AI-generated content cannot substitute for this gate.
4. The intended audience and operating model are revalidated: self-study optional paths, teacher-led assignments, or both.
5. Current code, production version, group access/cache behavior, migration numbers and data-lifecycle requirements are re-researched.
6. Protected group items remain disabled unless `GROUP-CORPUS-CACHE-REVOCATION` is closed.
7. The owner explicitly issues:

```text
UNFREEZE ROOM-UX-B9
```

Until then, no Path/Assignment schema, API, UI, locale, data, migration, AI content, commit or deployment may be created under B9 scope.

## Canonical artifacts

- [Research index](../research/room-ux-b9-curated-paths-assignments/2026-08-15/README.md)
- [Decision packet](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_DECISION_PACKET_2026_08_15.md)
- [Owner decisions and former migration authorization](ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md)

## Next planned program

The next item in the canonical B6–B9 + Visual Finishing program is the bounded, surface-local **ROOM-UX-VF — Visual Finishing** research lane. It must not absorb B9 entities, authoring, assignments, migration or the protected-cache purge program.

Start from:

- [ROOM_UX_VISUAL_FINISHING_RESEARCH_SESSION_PROMPT_2026_08_15.md](ROOM_UX_VISUAL_FINISHING_RESEARCH_SESSION_PROMPT_2026_08_15.md)
- [ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md](ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md)

## Freeze-turn execution record

```text
CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
COMMIT=DOCS_ONLY_CLOSURE
PUSH=DOCS_ONLY_CLOSURE
DEPLOY=NONE
```
