# ROOM-LIBRARY-IA — production release evidence

> **CLOSED · OWNER ACCEPTED · 2026-08-15.** This release evidence is frozen by
> [`ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`](../../../../planning/ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md).

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Branch | `main` |
| Implementation commit | `e1d95f063e424b169962c26f9210f5a016c4266a` |
| Production hotfix commit / source commit | `24736188df06e989eb6962754f870fd612397adf` |
| Dirty tree | `DIRTY`: 34 unrelated/pre-existing porcelain entries remain outside both scoped release commits |
| Inspected production URL | `https://linguistpro.kolosei.com/library.html` with explicit `#room=hub`, `#room=benyehuda`, `#room=mytexts` and `#room=group%3Astudy-songs-pilot` routes |
| Served version | `3.11.386`; service worker active with no waiting worker after the controlled owner update |
| Evidence method | public health/config readback; served container/version observation; connected owner Chrome tab through Kapture; DOM/ARIA/geometry evaluation; Kapture screenshots; console readback; isolated Playwright regression smoke |
| Evidence classes | `CODE`; `ISOLATED_AUTOMATION`; `PRODUCTION`; `OWNER_LIVE_READ_ONLY` |
| Limitations | Kapture evidence is desktop Chrome, not physical iPhone or assistive-technology evidence; 380px and 200%-reflow rows are isolated automation; destructive owner-list actions and learner-state mutations were deliberately not executed |

## Release authority and invariants

The owner explicitly authorized commit, push, deploy, connected-Kapture production verification and bounded fix/redeploy loops. The following remained out of scope throughout:

- schema, migration, DB/query truth and localStorage payload evolution;
- owner progress, bookmarks, finished state, reading-list membership and review events;
- Rename, Remove or Delete against an owner reading list;
- B9, recommendation algorithms and production data cleanup.

The only owner-live presentation interactions were normal route navigation, a controlled service-worker update, HE then RU locale selection, and expand then collapse of the Study Songs material section. Locale and disclosure were restored to their observed RU/collapsed state.

## Release sequence

1. `e1d95f063e424b169962c26f9210f5a016c4266a` shipped the approved D1–D6 surface unification as `3.11.385`.
2. Production health, DB and migration readiness stayed green. The open owner tab initially retained the previous service worker; its typed `Обновить` action activated `3.11.385` without clearing browser storage.
3. Kapture then reproduced one regression: an explicit `#room=hub` load could be overridden by stale Ben-Yehuda history/session presentation state.
4. Two regression contracts were added first and observed RED. The fix moved hash parsing into the pure B6 contract and accepts history/session detail only when its route matches the explicit hash.
5. `24736188df06e989eb6962754f870fd612397adf` shipped that bounded fix as `3.11.386`; no persistence or learner writer changed.
6. The owner tab activated the waiting worker through the typed update control. Public config, footer and the active shell then all reported `3.11.386`.

## Verification ledger

| Gate | Result | Evidence class |
|---|---|---|
| Explicit-hash unit/source regressions | expected RED 2 failures before the fix; PASS 16/16 after the fix | `CODE` |
| Scoped B6/B7/B8/IA contract set | PASS 20/20 | `CODE` |
| `node scripts/premium/room-library-surface-ia-browser-smoke.js` | PASS 31/31; stale Ben history/session cannot replace `#room=hub`; isolated `progress/bookmarks/review_log` remain `0→0` | `ISOLATED_AUTOMATION` |
| `npm run smoke:reader-parity` | PASS | `CODE` |
| `npm run smoke:room-b8` | PASS source 30/30 and browser matrix | `ISOLATED_AUTOMATION` |
| `npm run smoke:i18n` | PASS 233/233 | `CODE` |
| `npm run smoke:memory-canon` | PASS 79/79 | `CODE` |
| Production served identity | PASS: public config/footer `3.11.386`, deployed source `24736188…`, active SW and no waiting worker | `PRODUCTION` |
| Production console | PASS: no error-level Kapture entries after route and locale checks | `OWNER_LIVE_READ_ONLY` |

## Owner-live surface matrix

| Surface | Confirmed production facts |
|---|---|
| Library/L0 | Explicit `#room=hub` survives reload; global journey and one consolidated Reading Lists module are present; two existing named-list summaries remain intact; no bare list `×`; 0 rails, 0 work cards, 0px page overflow |
| Ben-Yehuda | Corpus identity, corpus continuation, Next, Ready (`796` total) and Periods are present; duplicate global Continue/Finished/Bookmarks/Lists count is `0`; 24 bounded material rows; 0 rails/cards; no row or page overflow |
| My Texts | Direct route survives reload; corpus identity, continuation, search/filter/sort and Study Materials remain corpus-local; 48-row DOM window; 0 rails/cards; no clipped desktop controls or page overflow |
| Study Songs | Direct group route survives reload; corpus identity, continuation, search/filter/sort, 48-row replacement window and management remain corpus-local; collapsed state survives; 0 rails/cards; no clipped desktop controls or page overflow |
| HE/RTL | `lang=he`, `dir=rtl`; disclosure copy repaints to Hebrew; `aria-expanded` and `aria-controls` target stay valid; no clipped desktop controls or horizontal page overflow; RU was restored afterward |

The named owner list detail was opened read-only on `3.11.385` to inspect semantics: it contained three real rows, including an unavailable material whose independent `Убрать из списка` control remained available. The dialog had `role=dialog`, `aria-modal=true`, an `aria-labelledby` target and a typed close button. No Remove, Rename or Delete action was invoked. The `3.11.386` hotfix changed routing only; its post-deploy L0 readback again confirmed two unchanged list summaries and no bare destructive glyph.

## Operational observation and bounded cleanup

Both automatic Coolify builds temporarily consumed the server's remaining filesystem headroom. The final `3.11.386` application container stayed running and public health continued to report `ok=true`, DB ready and migrations ready, but the filesystem reached `100%` used with `disk_warn=true`.

The owner then explicitly approved this narrow cleanup boundary:

```text
DOCKER_BUILDER_PRUNE=YES
DOCKER_IMAGE_PRUNE=NO
VOLUMES=NO
BACKUPS=NO
OWNER_DATA=NO
FINAL_EVIDENCE_PUSH=YES
```

Pre-cleanup readback showed the exact `24736188…` application container active, 3 active volumes and `3.765GB` reclaimable build cache. `docker builder prune -f` reclaimed `3.722GB`; filesystem headroom moved from `0` to `3.4GB` and usage from `100%` to `91%`. Post-cleanup readback confirmed:

- the same production application container remained active;
- image count stayed `20` and container count stayed `12`;
- volume count stayed `3` and active volume size stayed `2.18GB`;
- public version remained `3.11.386`;
- health, DB and migration readiness remained green;
- no image prune, volume operation, backup operation or owner-data operation occurred.

The server still emits `disk_warn=true` at `91%`; this is a capacity warning rather than the prior zero-headroom condition. Publishing this evidence commit triggers the normal main-branch rollout and may recreate build cache. The same approved build-cache-only cleanup is therefore repeated after that rollout before final handoff; images, volumes, backups and owner data remain excluded.

## Current state

```text
CODE=DEPLOYED_3.11.386
MIGRATION=NONE
OWNER_LEARNER_DATA_WRITES=NONE
COMMIT=e1d95f063e424b169962c26f9210f5a016c4266a,24736188df06e989eb6962754f870fd612397adf
PUSH=origin/main@24736188df06e989eb6962754f870fd612397adf
DEPLOY=PASS
KAPTURE_OWNER_LIVE=PASS
PROD_BUILD_CACHE_CLEANUP=3.722GB_RECLAIMED
PROD_DISK=91_PERCENT_USED_3.4GB_FREE_WARN
```
