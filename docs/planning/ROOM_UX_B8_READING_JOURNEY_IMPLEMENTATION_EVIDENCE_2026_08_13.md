# Reading Room B8 — implementation and release evidence

Дата: 2026-08-13
Статус: **LOCAL PASS · PRODUCTION PREFLIGHT PASS · DEPLOYMENT PENDING**
Decision authority: `APPROVE B8-R` with D1–D6, `MIGRATION=NONE`, `SCOPE=IMMEDIATE_B8_ONLY`
Release target: `3.11.374`

## 1. Delivered contract

- Existing `text_progress.last_row_idx` is monotonic across reopen, earlier bookmark jumps,
  scroll, close and refresh. The winning `last_step_id` follows the winning row.
- Learning Home composes typed, read-only Bookmarks, Finished and With notes views from
  existing canonical stores. It creates no journey store and no migration.
- My Texts, Ben-Yehuda and authorized Study collections use one source-neutral work adapter;
  revoked Study content is excluded at the query boundary.
- Results are capped at 48 rows, paged, and filterable by source inside the disclosed view.
- Passage bookmark and Ben `Read later` remain visibly separate facts.
- Recovery copy states the existing consent/device boundary without promising corpus sync.
- Closing the projection destroys its result DOM; the hidden panel retains no 48-row packet.

No schema, migration, server sync, FSRS/grade policy, corpus body or media canon changed.

## 2. Local evidence

Primary evidence: `.tmp/room-b8-reading-journey/evidence.json`.

| Gate | Result |
|---|---:|
| B8/B6/B0–B5 static contracts | 27/27 PASS |
| synthetic corpus size / visible page | 5,000 / 48 |
| page 2 | 9 rows, `hasPrevious=true`, no hidden remainder |
| summary query cold | 5.985 ms (budget <=100 ms) |
| summary query warm p95 | 5.385 ms (budget <=50 ms) |
| stored progress after row-10 downgrade attempt | row 80, step `furthest` |
| `review_log` before/after journey flow | 0 / 0 |
| 20 disclosure cycles | DOM delta 0; retained heap +67,936 bytes |
| long tasks >=50 ms during journey interactions | 0 |
| RU 380 / HE 380 RTL | 0 horizontal overflow; 0 undersized WCAG targets |
| HE 320 + text-spacing override | 0 overflow; 0 clipped actions |
| 200% zoom | 0 overflow; 0 clipped actions |
| page errors / telemetry-RUM requests | 0 / 0 |

Adjacent release gates:

- Room B6: 24/24 unit + 45/45 browser PASS.
- Room B7: 50/50 unit + 161/161 browser PASS.
- Reader resume 45/45; bookmarks 11/11; finished guard 9/9.
- artifact sync 11/11; cloud sync 32/32; sync-slim 50/50.
- reader notes PASS; Room media PASS; reader word status PASS.
- Studio→Room canonical SRS 49/49; open/close writes zero events and one completed
  synthetic grade writes exactly one event.
- i18n/cache/version lock 233/233.

`npm test` is not globally green: 927/966 PASS, 39 pre-existing RED contracts in
Classic redesign and unimplemented Studio L3/P2/P4 migrations/package/import-center
programs. The failing runtime files are outside the B8 diff. They are recorded, not
silently re-scoped into `IMMEDIATE_B8_ONLY`.

## 3. Harness findings repaired

- `reader-notes-smoke`: waits for the current corpus entry path before opening My Texts.
- `room-media-smoke`: expects B7's canonical typed `no audio` state instead of absence.
- `artifact-sync-smoke` and `sync-slim-smoke`: named attempts, 60-second per-scene
  timeout, deterministic OPFS close/cleanup where applicable. Both now terminate and pass.

These are test-harness changes; runtime sync semantics did not change.

## 4. Production preflight

Before cleanup, production was healthy at app/DB/migrations level but root storage was
99% used with 551 MiB free. The bounded cleanup:

1. removed inactive Docker build cache;
2. retained the running LinguistPro image and newest unused rollback image;
3. removed exactly four older unreferenced LinguistPro images;
4. pruned build cache made unreferenced by those images;
5. reduced one runaway 5.9 GiB Coolify `laravel.log` to its newest 20 MiB after
   resolving and checking the exact path; other logs were left intact.

After cleanup: root 66% used / 13 GiB free; 12/12 containers and 3/3 volumes retained.
No user data, backup, volume, running container or media-service image was removed.

## 5. Evidence boundaries

- Automation is not owner-live, a physical iPhone run, VoiceOver, NVDA or TalkBack.
- Production verification will use guest/synthetic read-only paths; it will not grade,
  change status, create review events or mutate the owner's local profile.
- Migration remains **NONE**.
- Owner-live handoff is permitted only after served APP/CACHE/version/image/health and
  production responsive/RTL/keyboard checks pass.
