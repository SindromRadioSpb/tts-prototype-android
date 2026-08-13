# Evidence ledger — B8 Reading Journey

Дата: 2026-08-13. Все product/runtime проверки read-only или synthetic. Owner profile не открывался.

## A. Baseline and production readback

| Evidence | Result | Classification |
|---|---|---|
| `git rev-parse HEAD` | `951302392c741a051faf1a95466ff494a2df3757` | code baseline |
| latest commit | `docs(room): close B7 and hand off B8 research` | B7 closed / B8 new program |
| local versions | `package.json`, `public/index.html`, `public/library.html`, `public/sw.js` = `3.11.373` | consistent local release baseline |
| dirty tree | unrelated owner docs/research/screenshots and `.remember` changes existed before B8 | preserve; B8 writes only packet/research files |
| public `/healthz` | HTTP 200, `ok:true`, DB ready, migrations ready | production runtime read-only PASS |
| public `/api/client-config` | HTTP 200, version `3.11.373`, shell integrity present | served-version readback PASS |
| public `/sw.js`, `/library.html` | HTTP 200 | shell readback PASS |
| production disk | `disk_pct_used:99`, `disk_warn:true` at `2026-08-13T07:13:52Z` | operational risk/blocker before any future deploy; not B8 UX regression; not remediated in research-only goal |

Production origin is deliberately represented as `${PUBLIC_ORIGIN}` in reproducible commands; private ops material was not needed or opened.

## B. Live-code anchors

| Claim | Evidence |
|---|---|
| progress/finish single store | `public/db/migrations.js:51–57`, `833`; `public/db/local-db.js:4276–4350` |
| passage bookmarks single store | `public/db/migrations.js:752–774`; `public/db/local-db.js:4354–4428` |
| note content and occurrence split | `public/db/migrations.js:475–507`, `670–697`; `public/db/local-db.js:2029–2126` |
| manual status/SRS split | `public/db/migrations.js:783–824`, `868–880`; `public/db/local-db.js:3076–3169`, `3347–3465` |
| My Text artifact excludes corpus | `public/db/local-db.js:3523–3535`; `public/js/cloud-sync.js:269–427` |
| learner log sync strips content metadata | `public/js/cloud-sync.js:3–19`, `37–101`, `164–230` |
| presentation state is bounded/pure | `public/js/room-b6-core.js:3–17`, `131–183`; `public/js/library-ui.js:699–779`, `11087–11139` |
| progress records per-session max only | `public/js/library-ui.js:4967–5038`; `public/js/reader-progress.js:34–50` |
| media setup has no playback-position store | `public/js/library-ui.js:4822–4934`; `public/db/migrations.js:929–995` |
| Ben saved lists are device local | `public/js/library-ui.js:855–912` |
| source-neutral Learning Home continue exists | `public/js/library-ui.js:9150–9170` |
| bookmarks discovery is not source-neutral | `public/js/library-ui.js:8307–8343`, injection call in Ben path |
| B6 budgets/privacy | `public/js/room-b6-core.js:8–17`, `25–33`, `202–236` |

## C. Synthetic gates run in this session

| Command | Result | Interpretation |
|---|---|---|
| `npm run smoke:reader-resume` | 45 passed, 0 failed | green for current tested resume contract; test does not disprove stored-progress downgrade gap found by code inspection |
| `npm run smoke:bookmarks` | 11 passed, 0 failed | add/idempotency/search/order/remove/cascade green |
| `npm run smoke:reader-word-status` | PASS | canonical manual-state overlay green |
| `npm run smoke:artifact-sync` | 11/11 | consent enforcement; My Text travels; corpus does not; fresh-device materialization; LWW artifact path green |
| `npm run smoke:cloud-sync` | 32/32 | append-only learner log, metadata stripping, multi-device union/manual-axis replay green |
| `npm run smoke:finished-guard` | 9 passed, 0 failed | Ben guard and manual-only finish green |
| `npm run smoke:room-media` | 1 assertion red: plain My Text expected no `.learning-media` | stale harness expectation: B7 intentionally presents typed `audio:none`; `tests/learningCompass.test.js:174–190`, `363` asserts that contract. Other 35 media/karaoke assertions green. Not product regression evidence |
| `npm run smoke:reader-notes` | timeout clicking hidden `#tabCorpus` | stale harness navigation: closed B0–B5 Learning Home hides legacy tab; failure occurs before note assertions. Harness uncertainty, not note product failure |
| `npm run smoke:sync-slim` | timed out twice with no assertion output, including isolated 180s run | harness uncertainty; do not claim PASS/FAIL. Timed-out child processes created by this research run were terminated |

No failed test was repaired because the goal is research-only. A future approved implementation must modernize the two stale browser smoke entry paths and diagnose `sync-slim` before claiming full gate closure.

## D. Closed baseline evidence inherited, not re-labelled owner-live

- B0–B5: production close through `3.11.359`.
- B6: `3.11.360`, 45/45; 5k exact total/window 5000/48; card payload 18,159 B; cold/warm/search p95 approximately 46.82/47.17/20.72 ms; retained heap +162,284 B; DOM +4; long task 0.
- B7: `3.11.373`, owner accepted the documented physical iPhone Safari/PC paths; VoiceOver/TalkBack/NVDA/Android/macOS remained explicitly NOT RUN exceptions and stay exceptions here.
- Historic owner `review_log=7315` evidence belongs to B7 closure only. It was not re-read and is not presented as current B8 evidence.

## E. Research-only mutation audit

Allowed writes in this goal:

- `docs/planning/ROOM_UX_B8_READING_JOURNEY_DECISION_PACKET_2026_08_13.md`
- `docs/research/room-ux-b8-reading-journey/2026-08-13/*.md`

Explicitly not changed: `public/**`, `server/**`, `db/**`, `tests/**`, `scripts/**`, `package.json`, service worker/version, production data/config. No commit, push or deploy is part of B8-R.
