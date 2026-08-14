# ROOM-LIBRARY-IA — research index

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` |
| Branch | `main` |
| Dirty tree | `DIRTY`: 34 pre-existing porcelain entries at the research baseline; all were treated as owner-owned and left untouched |
| Production inspected | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served footer version `3.11.384` |
| Source/prod parity | repo `APP_VERSION`, Room footer and service-worker cache version are also `3.11.384` |
| Evidence method | complete required-canon read; original-resolution inspection of four owner screenshots; read-only inspection of the existing authenticated production tab; static code/test/query review |
| Evidence classes | `CODE` = repository source; `OWNER_SCREENSHOT` = supplied captured UI; `OWNER_LIVE_READ_ONLY` = existing production profile without learner-data actions; `ISOLATED_AUTOMATION_CODE` = inspected harnesses only, not executed in this session |
| Research limitations | no owner storage payload was read; no destructive controls were invoked; no isolated browser fixture was run; physical iPhone, VoiceOver and post-change evidence do not exist; screenshots 4–7 do not expose every off-screen interaction state |

## Result

This folder is the evidence base for the owner decision packet
[`ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`](../../../planning/ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md).

Recommended decision set:

```text
D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL
D2=B_CONSOLIDATED_READING_LISTS_MODULE
D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL
D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL
D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE
D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION
```

This is a presentation and information-architecture recommendation. It does not create or replace truth for progress, bookmarks, finished state, reading lists, recommendations, or disclosure state.

## Approved implementation status

The owner approved the complete recommended D1–D6 set on 2026-08-14. Local implementation and isolated verification are complete; commit, push, deploy and post-change owner-live verification remain gated.

Durable implementation record: [implementation/IMPLEMENTATION_EVIDENCE.md](implementation/IMPLEMENTATION_EVIDENCE.md).

## Closed boundaries

- B0–B7 and B8 Reading Journey remain closed.
- Continue remains last-working-position, including backward study and media materials; it is not monotonic completion.
- Explicit bookmarks remain passage pointers, separate from Continue and reading lists.
- The accepted shared `Свернуть/Развернуть` disclosure contract, persistence across reload/tab reopen, typed first-row control slot, and working-row/playback overlay are preserved.
- My Texts remains a separate corpus and is not reinserted into Ben-Yehuda.
- B9 Curated Paths/assignments is out of scope.

## Artifacts

1. [CURRENT_SURFACE_INVENTORY.md](CURRENT_SURFACE_INVENTORY.md) — L0 and three corpus surfaces, including duplication and responsive findings.
2. [SCREENSHOT_EVIDENCE.md](SCREENSHOT_EVIDENCE.md) — per-image fact/hypothesis audit and linkage to live DOM/source.
3. [LIVE_BROWSER_EVIDENCE.md](LIVE_BROWSER_EVIDENCE.md) — production owner-live read-only evidence and regression records.
4. [TRUTH_AND_WRITER_MAP.md](TRUTH_AND_WRITER_MAP.md) — truth domains, canonical writers, readers, scope, persistence and move safety.
5. [SECTION_CONTRACT_MATRIX.md](SECTION_CONTRACT_MATRIX.md) — horizontal/vertical evaluation and the proposed semantic row/header grammar.
6. [OPTIONS_AND_ROLE_SYNTHESIS.md](OPTIONS_AND_ROLE_SYNTHESIS.md) — A/B/C decisions through R2/R4/R5/R6/R8/R11/R12/R15.
7. [FINDINGS.md](FINDINGS.md) — confirmed facts, hypotheses, unknowns, regressions and future verification matrix.

## Current boundary

`CODE=LOCAL_IMPLEMENTATION_COMPLETE; MIGRATION=NONE; OWNER_DATA_WRITES=NONE; COMMIT=NONE; PUSH=NONE; DEPLOY=NONE`.

Repository publication, production deploy and post-change owner-live readback require the separate release approval recorded in the decision packet.
