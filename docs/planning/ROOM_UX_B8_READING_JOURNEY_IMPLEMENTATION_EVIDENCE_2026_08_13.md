# Reading Room B8 — implementation and release evidence

Дата: 2026-08-13
Статус: **B8 OWNER-LIVE PASS EXCEPT D2 · D2 CORRECTION LOCAL PASS · PRODUCTION PENDING**
Decision authority: `APPROVE B8-R` with D1–D6, `MIGRATION=NONE`, `SCOPE=IMMEDIATE_B8_ONLY`
Release target: `3.11.376`

## 1. Delivered contract

- Owner-live correction: `text_progress.last_row_idx` is the latest genuine working row,
  so deliberate backward study changes the next Continue position. `last_step_id` follows
  that write or clears when the Reader has no matching step.
- Session furthest is ephemeral and used only for the end-of-text prompt. It is not a
  second store and does not override the latest working position.
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
| summary query cold | 9.220 ms (budget <=100 ms) |
| summary query warm p95 | 9.120 ms (budget <=50 ms) |
| direct writer `80 → 10` | row 10, step `behind` |
| bookmark 10 → close → reload → Continue | row 10; bookmark still present |
| `review_log` before/after journey flow | 0 / 0 |
| first-row quick close | row 0 replaces a stale deeper anchor; Continue is then honestly omitted |
| long media material | followed row 12 → manual backward scroll → visible/stored row 2 |
| 20 disclosure cycles | DOM delta 0; retained heap +54,024 bytes |
| long tasks >=50 ms during journey interactions | 0 |
| RU 380 / HE 380 RTL | 0 horizontal overflow; 0 undersized WCAG targets |
| HE 320 + text-spacing override | 0 overflow; 0 clipped actions |
| 200% zoom | 0 overflow; 0 clipped actions |
| page errors / telemetry-RUM requests | 0 / 0 |

Adjacent release gates:

- Room B6: 24/24 unit + 45/45 browser PASS.
- Room B7: 50/50 unit + 161/161 browser PASS.
- Reader resume 50/50; bookmarks 11/11; finished guard 9/9.
- artifact sync 11/11; cloud sync 32/32; sync-slim 50/50.
- notes roundtrip 25/25; reader notes PASS; Room media PASS; reader word status PASS;
  reader parity PASS.
- Studio→Room canonical SRS 49/49; open/close writes zero events and one completed
  synthetic grade writes exactly one event.
- i18n/cache/version lock 233/233.

`npm test` is not globally green: 927/966 PASS, 39 pre-existing RED contracts in
Classic redesign and unimplemented Studio L3/P2/P4 migrations/package/import-center
programs. The failing runtime files are outside the B8 diff. They are recorded, not
silently re-scoped into `IMMEDIATE_B8_ONLY`.

## 3. D2 correctness and harness findings repaired

- A real local browser race was reproduced before release: opening explicit bookmark row
  10 initiated smooth scrolling; an immediate Back click was incorrectly treated as user
  scroll takeover, so a settling scroll event overwrote the exact target with row 4. The
  runtime now suppresses programmatic settling for a bounded interval and clears that guard
  only on genuine scroll gestures/keys inside the reading flow. The browser gate proves
  bookmark 10 → immediate close → reload → actual Continue 10.
- `flushReaderProgress()` now accepts row 0 as a real latest position. A quick close on the
  first row therefore cannot retain a stale deeper Continue anchor.
- The media table's own scroll container is wired into the same canonical writer. Its gate
  proves that a learner can follow forward to row 12, manually return to an earlier visible
  row, and persist that earlier row without creating a second store.

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

The first production cutover (`3.11.374`, commit `06823365`) exposed a shell-specific stale-cache path:
`library.html` still requested all locale bundles with `?v=83`, while `index.html` and
the committed locale lock were already at `?v=161`. A fresh isolated browser received
the new labels, but an existing cached Reading Room shell was not guaranteed to do so.
The corrective release aligns both shells at `?v=161`, extends the i18n gate to cover
both entry points, and advances APP/CACHE/footer/package version to `3.11.375` so the
service worker update cannot remain at the first cutover's cache generation.

Corrective production cutover (`3.11.375`, commit `7d32686d`) was verified against the
served site, not inferred from the repository:

| Production readback | Result |
|---|---:|
| `/api/client-config` / `window.APP_VERSION` / Room footer | `3.11.375` / `3.11.375` / `3.11.375` |
| service-worker cache generation | `v3.11.375` precache + runtime |
| Room locale network requests | RU/EN/HE `?v=161`, all HTTP 200 |
| corrective runtime image | commit `7d32686d` |
| `/healthz` | app, DB and migrations ready; disk 76%; warning false |
| RU 380 / HE 380 RTL | 0 overflow; 0 clipped; 0 undersized WCAG 24 px targets |
| HE 320 + text spacing / 200% | 0 overflow; 0 clipped; 0 undersized WCAG 24 px targets |
| Journey keyboard close | `Escape` closes disclosure, clears result DOM, returns focus |
| isolated guest `review_log` | absent/0 before and after; no grade/review request |

The only browser console/resource errors were expected guest HTTP 401 responses from
owner/auth/group endpoints. They did not affect the Reading Journey or static assets.

- Automation is not owner-live, a physical iPhone run, VoiceOver, NVDA or TalkBack.
- Production verification used a fresh isolated guest profile and read-only paths; it
  did not grade, change status, create review events or touch the owner's local profile.
- Migration remains **NONE**.
- Served APP/CACHE/version/image/health and production responsive/RTL/keyboard checks
  passed. Owner-live handoff is now permitted; it remains distinct from automation.
