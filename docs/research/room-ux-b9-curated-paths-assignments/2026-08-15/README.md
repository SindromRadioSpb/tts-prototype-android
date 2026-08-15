# ROOM-UX-B9 — Curated Paths & Assignments research index

Date: 2026-08-15
Mode: `RESEARCH_COMPLETE · EXECUTION FROZEN`
Source commit: `19cbb9ea835610261524d7da27f5ee355d6c2572`
Branch: `main`
Dirty tree: `DIRTY`, 34 pre-existing entries at research start; none was modified by B9 research.
Production: `https://linguistpro.kolosei.com/library.html`, inspected served version `3.11.388`.
Evidence method: `CODE`, `ISOLATED_AUTOMATION`, `PRODUCTION`, `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`; exact boundaries follow.
Limitations: research/documentation only; no runtime, schema, data, commit, push or deploy operation was part of the B9 research evidence.

## Evidence passport

- `CODE`: complete required context packet plus live code, migrations, API routes, locale contracts and relevant fixtures were inspected read-only. Code is primary where older plans differ.
- `ISOLATED_AUTOMATION`: no product test or destructive smoke was executed. Existing smoke/unit contracts were inspected. A requested Chrome viewport override did not change the actual viewport and is explicitly excluded from evidence.
- `PRODUCTION`: current served version and public/read-only surface structure were inspected.
- `OWNER_LIVE_READ_ONLY`: an existing authenticated production tab was used for route traversal and DOM/ARIA inspection only. No learner, corpus, group, invitation, lesson, provider or review mutation was performed.
- `OWNER_REPORTED`: the owner accepted the design questions, then froze B9 implementation/migration because no qualified curator-mentor with the required knowledge and specialization is currently available.
- `EXTERNAL_PRIMARY`: official Canvas, Moodle and Google Classroom documentation was checked on 2026-08-15. Transferable contracts are separated from inference.

## Research boundary and limitations

This packet contains no runtime code, CSS/HTML/i18n edit, migration, record creation, commit, push or deploy. Production validation covered desktop RU in the owner profile. HE/RTL, 380×844, 200% reflow and physical assistive-technology execution remain future implementation gates: the available isolated browser runtime was unavailable, and the Chrome viewport capability did not alter the actual viewport. Code and locale contracts were inspected, but they are not represented as live HE/RTL or physical-device evidence.

No private owner titles, provider credentials, contact identifiers, group member identifiers or corpus contents are reproduced here. Direct navigation to a protected group API was blocked by the browser client; the authenticated UI envelope and server route/code contracts were used instead.

## Outcome

The evidence supports **Option B with bounded adapters (Hybrid D)**:

1. `CuratedPath` has stable identity, a mutable draft and immutable published versions.
2. `Assignment` is a separate authority relation pinned to one published version.
3. Optional learner adoption is separate from required assignment.
4. Authored order, access, learner activity, completion projection, exceptions, recommendation and presentation state remain distinct.
5. Existing `Finished` and append-only `review_log` remain the only reading/review truths. B9 may store only assignment-scoped facts that cannot be represented there: acknowledgement, optional skip, authority waiver, due exception, withdrawal and a minimal idempotent evidence receipt required for cross-device recovery of local-only `Finished`.
6. AI path/content generation is default-off and outside the first implementation slice.

The currently rendered `group_assignment` Learning Compass reason is not backed by an assignment entity. It is a presentation inference from group-corpus membership/catalog presence and cannot be promoted to B9 authority truth.

This is now a frozen research architecture, not an implementation queue. The authoritative current state and re-entry conditions are in the [B9 freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).

## Artifact map

- [Current capability inventory](CURRENT_CAPABILITY_INVENTORY.md)
- [Live browser evidence](LIVE_BROWSER_EVIDENCE.md)
- [Truth/writer/reader map](TRUTH_WRITER_READER_MAP.md)
- [Authority and access model](AUTHORITY_AND_ACCESS_MODEL.md)
- [Path sequence and completion model](PATH_SEQUENCE_AND_COMPLETION_MODEL.md)
- [Surface and interaction matrix](SURFACE_AND_INTERACTION_MATRIX.md)
- [External benchmark](EXTERNAL_BENCHMARK.md)
- [Options and role synthesis](OPTIONS_AND_ROLE_SYNTHESIS.md)
- [Findings](FINDINGS.md)
- [Owner decision packet](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_DECISION_PACKET_2026_08_15.md)
- [Owner decisions and migration authorization](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_OWNER_DECISIONS_2026_08_15.md)
- [B9 freeze record](../../../planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md)
- [Next program: Visual Finishing research prompt](../../../planning/ROOM_UX_VISUAL_FINISHING_RESEARCH_SESSION_PROMPT_2026_08_15.md)

## Current gate

Research is complete, but implementation and migration are frozen. The design may be revisited only after the freeze record’s human curator-mentor operating-model gates are satisfied and the owner explicitly unfreezes B9. The next active program is bounded Visual Finishing research-only.

```text
OWNER_DECISION=FROZEN
B9_IMPLEMENTATION_SCOPE=SUSPENDED
SCHEMA_MIGRATION=SUSPENDED_NOT_EXECUTED
NEXT=ROOM-UX-VF_RESEARCH_ONLY
```
