# ROOM-LIBRARY-IA — local implementation evidence

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Approved decisions | `D1=C`; `D2=B`; `D3=B`; `D4=B`; `D5=B`; `D6=B`; `MIGRATION=NONE`; `SCOPE=IMMEDIATE_SURFACE_ONLY` |
| Source commit | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` |
| Branch | `main` |
| Dirty tree | `DIRTY`: 34 pre-existing porcelain entries at the research baseline; unrelated owner files remain untouched; this implementation is confined to the packet allowlist |
| Production reference | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, pre-change served version `3.11.384` |
| Local candidate | `3.11.385` across app, Library footer, locale query and service-worker cache boundary |
| Evidence method | source-contract tests; isolated Playwright fixture/browser smoke; canonical B8 smoke; i18n smoke; independent local DOM/ARIA readback; visual inspection of stable screenshots |
| Evidence classes | `CODE`; `ISOLATED_AUTOMATION`; `LOCAL_BROWSER_READBACK`; predecessor-only `OWNER_SCREENSHOT` and `OWNER_LIVE_READ_ONLY` |
| Limitations | no post-change production deploy or owner-live verification; automation is not physical-device evidence; no iPhone, VoiceOver or real browser 200% zoom evidence; the IA smoke uses a 200%-reflow proxy and blocks service workers |

## Authority and boundary

The owner message `Утверждаю Рекомендации. Формализуй и стартуй` was normalized in the decision packet to the complete recommended D1–D6 approval. It authorizes this local implementation, not owner-profile writes, migration, B9, commit, push or deploy.

State at handoff:

```text
CODE=LOCAL_IMPLEMENTATION_COMPLETE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
COMMIT=NONE
PUSH=NONE
DEPLOY=NONE
```

## Implemented decisions

### D1 — global journey at L0, corpus-local browse below

- Library/L0 mounts the source-neutral Continue hero, Finished, Bookmarks, Notes and Reading Lists.
- Ben-Yehuda no longer mounts duplicate global Continue, Finished, Bookmarks or one shelf per named list.
- Ben retains its corpus hero, saved searches, recommendation projection, Ready/catalog and Periods.
- My Texts and Study Songs retain their own corpus hero, retrieval controls, material list and management path.
- No progress, bookmark, finished or recommendation writer changed.

### D2 — consolidated named reading lists

- L0 has one `Списки для чтения` module with a summary row per existing `{id,name,items}` list.
- List detail uses a bounded dialog; unavailable entries stay actionable for the explicitly labelled `Убрать из списка` operation.
- Rename writes the existing `name` property through the existing list save path.
- Remove offers Undo through the same writer.
- Delete is a typed destructive action with a confirmation naming the list and item count; the old ambiguous bare `✕` is not rendered.
- Pin, hide and archive remain backlog because they require a separate lifecycle/payload decision.

### D3/D4 — vertical rows and bounded replacement pages

- Affected material collections render full-width typed rows with `data-material-kind`; horizontal `.shelf-rail` material carousels are not mounted.
- Semantic distinctions remain visible: working position, bookmark target, finished status, recommendation reason, list membership/removal and Ready provenance are not collapsed into one truth.
- Preview/page policy remains `4 / 12 / 48` as approved.
- Reading-list details, author works and protected-corpus browse use replacement pages, so repeated navigation does not grow the DOM to 300/796 items.
- Focus moves predictably to the replacement page; material collections do not introduce a nested horizontal scroll container.

### D5 — shared typed section grammar

- The existing disclosure writer and storage key remain canonical.
- Header count/action/disclosure roles remain typed; the disclosure control keeps `aria-expanded` and `aria-controls` bound to an existing region.
- Locale switching now repaints visible and ARIA disclosure strings without replacing or clearing persisted state.
- RU/EN/HE strings cover list-module summary, management, pagination, recovery honesty and destructive safety.
- Room-scoped responsive CSS closes the observed 380px HE/RTL clipping in My Texts and Study Songs.

### D6 — surface-only implementation

- No schema, migration, DB adapter, progress writer, bookmark writer, finished writer, recommendation algorithm or storage payload version changed.
- The only versioned release-boundary edits are app/Library/SW `3.11.385` and locale cache-bust `163`.

## Implementation allowlist actually used

Runtime/presentation:

- `public/js/library-ui.js`
- `public/library.html`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`

Verification:

- `tests/roomLibrarySurfaceIa.test.js`
- `tests/roomUxMaturity.test.js`
- `scripts/premium/room-library-surface-ia-browser-smoke.js`

Release-boundary only:

- `public/index.html`
- `public/sw.js`
- `tests/i18n.locale-version.lock.json`

Documentation/evidence:

- `docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`
- `docs/research/room-library-surface-unification/2026-08-14/`

Forbidden DB, migration, corpus vocabulary, Reader/Studio writer and recommendation files were not changed.

## Writer and persistence safety

| Truth | Result |
|---|---|
| Continue/progress | existing reader/writer only; no new write path |
| Finished | existing projection only; no new writer |
| Bookmarks | existing projection only; no new writer |
| Named lists | existing `corpus_reading_lists_v1` and `{id,name,items}` payload; same save writer |
| Recommendation | existing derived inputs/ordering; presentation changed only |
| Disclosure | existing `room.longListDisclosure.v1` plus existing bounded cookie fallback |

The isolated smoke snapshots truth counters before and after navigation and fixture-only list actions: `progress 0→0`, `bookmarks 0→0`, `review_log 0→0`. List Remove/Rename/Undo occurs only in a fresh isolated origin seeded for this test, never on the owner profile.

## Verification ledger

| Gate | Result | Evidence class |
|---|---|---|
| Initial IA contract run | expected RED: 5/6 new tests failed before implementation; approval-record test passed | `CODE` |
| `node --check public/js/library-ui.js` | PASS | `CODE` |
| `node --test tests/roomLibrarySurfaceIa.test.js` | PASS 6/6 | `CODE` |
| targeted B0–B8 + Learning Compass suite | PASS 61/61 | `CODE` |
| `node scripts/premium/room-library-surface-ia-browser-smoke.js` | PASS 29/29 | `ISOLATED_AUTOMATION` |
| `npm run smoke:room-b8` | PASS: source 29/29 and browser matrix, including last-position/bookmark separation, typed corpora, 5k/48 bounds, 20-cycle stability, RU/HE/RTL/320/reflow/text-spacing, zero review/RUM writes | `ISOLATED_AUTOMATION` |
| `node tests/i18n.smoke.js` | PASS 233/233 after cache-bust bump | `CODE` |
| independent local DOM/ARIA readback | PASS: module title, expanded state, controls target, L0 ownership and zero document horizontal overflow | `LOCAL_BROWSER_READBACK` |
| `git diff --check` on tracked implementation files | PASS | `CODE` |
| repo-wide `npm test` | NOT GREEN: 935/974, 39 pre-existing out-of-scope contract failures; classification below | `CODE` |

### Repo-wide suite limitation

The 39 failures do not touch the IA implementation inputs:

- 34 failures come from material/media/portable-package tests hard-coding `MIGRATIONS.length === 48`, while unmodified `public/db/migrations.js` contains 49 migrations at the source commit;
- 5 failures are stale Studio Classic/portable/import UI source-contract expectations;
- `git diff --quiet` confirms the relevant migration, Studio implementation and failing test files are not part of this IA diff;
- all new IA tests and the complete B0–B8 Room gates pass.

These failures are recorded, not repaired or waived. Fixing them would cross the approved allowlist and reopen unrelated Studio/migration work.

## Stable visual evidence

- [Library/L0 desktop RU](screenshots/library-l0-desktop-ru.png)
- [Library/L0 380px HE/RTL](screenshots/library-l0-380-he-rtl.png)
- [Ben-Yehuda 380px HE/RTL](screenshots/ben-380-he-rtl.png)
- [My Texts 380px HE/RTL](screenshots/mytexts-380-he-rtl.png)

Visual inspection confirms the consolidated module reads as one collection-of-collections, Ben recommendation/catalog items use vertical rows, long HE controls wrap without clipped interactive rectangles, and the page has no material-driven horizontal overflow. These images are isolated automation, not owner-live or physical-device evidence.

## Release authority

The owner approved scoped commit, push, deploy, connected-Kapture read-only production verification, and bounded fix/redeploy loops on 2026-08-14. Owner learner-data mutations, destructive named-list actions, migration, B9 and unrelated dirty-tree publication remain forbidden.

## Remaining release gates

Before commit/push/deploy:

1. create scoped commits containing only this allowlist and preserve all unrelated dirty entries;
2. push and deploy with the normal version/SW procedure;
3. confirm production serves `3.11.385` and locale query `163`, then perform controlled reload without clearing owner storage;
4. run post-change production DOM/read-only owner checks only: L0 ownership, Ben duplicate absence, RU/HE/RTL, disclosure semantics and no document overflow;
5. do not invoke Rename, Remove, Undo or Delete against an owner list; do not change progress/bookmarks/finished/review data.

Satisfied release authority:

```text
APPROVE ROOM-LIBRARY-IA-RELEASE:
COMMIT=YES;
PUSH=YES;
DEPLOY=YES;
OWNER_LIVE_READ_ONLY=YES
```

Rollback remains a static-client/SW version revert. It must not clear localStorage, cookies, OPFS or owner keys; both old and new clients read the unchanged list payload and learner truth.
