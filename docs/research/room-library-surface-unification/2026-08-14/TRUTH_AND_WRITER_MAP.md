# Truth, writer and source map

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served `3.11.384` |
| Method | `CODE` query/writer/renderer trace reconciled with `OWNER_LIVE_READ_ONLY`; test harnesses inspected as `ISOLATED_AUTOMATION_CODE` only |
| Evidence separation | code proves possible behavior and storage boundaries; owner-live proves only the rendered profile state; no database/localStorage payload was extracted |
| Limitations | cloud-sync coverage is stated only where current UI/code/canon explicitly does so; no recovery operation or eviction was performed |

## Canonical map

| Block | Truth domain | Canonical writer | Reader/query | Scope | Current display / bound | Persistence | Recovery/export honesty | Safe to move without new truth? |
|---|---|---|---|---|---|---|---|---|
| Global Continue (L0) | last deliberately worked row of newest unfinished material | Reader `recordProgress()` / `flushReaderProgress()` → `localDb.setProgress()`; explicit row engagement, playback/navigation/bookmark jump | `getLearningHomeContinue()` source-neutral SQL over `texts + text_progress`, current group authorization checked | global/cross-corpus | one L0 hero | OPFS SQLite `text_progress` | personal bundles carry progress; L0 copy says Ben/group progress is device-local and My Texts syncs only with consent | yes: it is a read-only projection; retain one writer |
| Ben Continue | same progress truth, Ben subset | same progress writer | `getContinueReading(12)` with `CANON_ORIGIN`; `paintBenCorpusNext()` reads up to 50 for a corpus hero | corpus-local Ben | hero plus duplicated 12-card horizontal shelf | same OPFS truth | device-local unless included with material bundle; no separate shelf state | yes: remove the shelf and keep the corpus hero/query |
| Finished | explicit “finished” assertion, not inferred solely from scroll | `setTextFinished()` from explicit end/shelf action; `clearTextFinished()` to undo | L0 `getReadingJourneySummary/listReadingJourneyItems('finished')`; Ben `getFinishedTexts()` with `CANON_ORIGIN` | L0 global; Ben shelf corpus-local | L0 bounded 48-row panel; Ben up to 12 cards + all-sheet up to 500 | `text_progress.finished_at` in OPFS | included in library bundle progress import/export; My Texts sync only under the existing consent boundary | yes: keep L0 global projection; retire Ben duplicate; never synthesize status during navigation |
| Bookmarks | explicit passage pointer: text, sentence/order, snippet | Reader `toggleBookmark()` → `localDb.addBookmark/removeBookmark()` | L0 typed journey query with authorization; Ben `listBookmarks(null,16)` without corpus/auth scope | canonical data is global; current Ben display is globally mixed | L0 bounded 48-row list; Ben 16 horizontal cards | OPFS `bookmarks` table | carried by library bundle import/export; FK follows local text lifecycle; not the reading-list store | yes, and safer on L0 because its query enforces current group authorization |
| Named reading lists | user-curated set of Ben catalog work stubs | `createReadingList()`, `toggleItemInList()`, `removeItemFromList()`, `deleteReadingList()` → one `saveReadingLists()` writer | `getReadingLists()`; readiness is re-derived from live `corpusReadyMap()` | device-local user collection over Ben catalog | one top-level horizontal shelf per non-empty list; all items rendered, max 300/list | `localStorage.corpus_reading_lists_v1`; one-time read of legacy `corpus_reading_list_v1` | no bundle/export/sync reference; lost on storage eviction/reinstall/new device; no server recovery claim | yes: render a consolidated L0 module using the same reader/writer; no payload migration needed |
| Saved searches | saved Ben query/filter snapshot | `saveCurrentSearch()` / `removeSavedSearch()` via `_lsSet()` | `getSavedSearches()` / `restoreSavedSearch()` | corpus-local Ben | wrapped chips, max 20 | `localStorage.corpus_saved_searches_v1` | no bundle/export/sync; eviction/reinstall loss | only within Ben; moving to global would misstate corpus scope |
| Next for you | derived ordering/reason, not durable recommendation state | no feed writer; baked vocab/catalog producers write ingredients; existing word/review writers maintain learner inputs | `scoreReadyByRecordedFamiliarity()` + `CorpusVocab.coverageForWork/pickPersonalRail()`; L0 `buildNextTextPicks()` | corpus-local Ben, with one L0 featured projection | Ben 12 horizontal cards; L0 one hero when no Continue | derived in memory from baked sidecar + canonical known-word/profile truth | reproducible while ingredients/profile exist; no recommendation export or durable feed | yes as a projection; must keep scope and reason, never persist a second recommendation truth |
| Ready | published corpus readiness/provenance | corpus bake/publish pipeline, not Room UI | `corpusIndex.ready`; Ready map; result renderer | corpus-local Ben | L0 4 rows; Ben 12 rows; full result path appends 60 per click up to 796 | versioned static catalog/bodies/CDN/SW caches | corpus publication artifacts are recoverable from release assets; not owner learner state | yes as a catalog projection; bounds must stay independent of catalog size |
| My Texts | owner-created/imported personal texts plus attached metadata/media | Studio/local-db create/update/import writers | `_PERSONAL_TEXT_PREDICATE`, `getPersonalTextFacets()`, `listPersonalTextsPage()` | corpus-local personal | vertical rows, replace-page 48, query hard cap 96 | OPFS SQLite `texts/sentences/...` and related local media | Studio library bundle supports recovery; cloud sync only with existing opt-in/consent; no claim of automatic cross-device completeness | presentation may move, but the corpus must remain separate and management stays in Studio |
| Study Songs | membership-filtered server group catalog and shared audio; personal progress remains local learner truth | authorized group owner API/import for catalog; existing Reader writer for personal progress | `/api/group-corpora/<id>/works`, local join by `text_key`, `renderGroupCorpus()` | corpus-local protected | vertical rows, incremental chunks of 48; current 77 can all accumulate in DOM | server corpus catalog/assets plus local materialized text/progress | owner has catalog/ZIP export actions; personal progress/privacy is explicitly separate; entitlement is checked before exposure | corpus module can move only within authorized corpus surfaces; do not copy catalog or learner state into a global store |
| Disclosure state | presentation-only collapsed/open preference | `attachRoomLongListDisclosure()` → `persistRoomLongListState()` | same helper and stable `data-disclosure-key` | cross-surface presentation | shared header/control/region | `localStorage.room.longListDisclosure.v1`; bounded hashed cookie fallback | survives reload/tab reopen; content-free cookie fallback on quota failure; not learner data | yes, by reusing the existing helper/store and stable compatibility keys |

## Important source corrections

### Required renderer/query anchors inspected

| Anchor | Current responsibility | Finding for this decision |
|---|---|---|
| `injectContinueReading()` | mounts the 12-item Ben Continue shelf using the shared builder | redundant with `paintBenCorpusNext()` on the same route; retire the shelf, not the progress truth |
| `injectFinishedReading()` | mounts up to 12 Ben-only finished cards and an up-to-500 sheet | global Finished already has a bounded L0 B8 reader; do not clone this into other corpora |
| `injectBookmarksShelf()` | mounts 16 newest global local bookmarks on Ben | scope/authorization mismatch; global projection belongs at L0 |
| `injectReadingListShelves()` | mounts one top-level shelf per non-empty named list | replace only the mount/renderer with one L0 module; keep `getReadingLists()` and its writer |
| `injectBenHomeRails()` | orders Next/saved searches/lists/bookmarks/finished/continue through repeated prepends | historical mixed-scope coordinator; narrow it to corpus-local discovery only |
| `injectCorpusRails()` | derives and mounts Ben Next/cold-start from current catalog/profile ingredients | keep the derivation and reason; switch its material renderer to vertical rows |
| `renderHomeInto()` | mounts Ben Ready preview and Periods, then invokes the mixed coordinator | retain Ready/Periods and corpus-local projections only |
| `renderCorpusWorkRow()` | current vertical Ready/search row | primary structural basis for unified material rows |
| `ROOM_PREVIEW` | hard preview bound `12` | retain for collection previews |
| `.shelf-rail` | horizontal flex/scroller used by Continue/Finished/Bookmarks/Lists/Next | remove from repeated material collections; do not remove unrelated hero/action layouts |

### `public/js/local-db.js` does not exist

The requested path is absent at this commit. The actual adapter is `public/db/local-db.js`; schema is in `public/db/migrations.js`. No alternate JS writer was found at the requested path.

### Continue is not one query

`getLearningHomeContinue()` is genuinely source-neutral. `getContinueReading()` is Ben-only despite a nearby `buildContinueRailSection()` comment describing Continue as cross-corpus. Any implementation must follow the SQL, not the stale comment.

### Ben bookmarks are not corpus-local

The Ben shelf uses `listBookmarks(null,16)`, which is global and lacks B8’s current-group authorization predicate. It cannot be honestly relabelled “Ben bookmarks” without a query change, and a new corpus bookmark query is unnecessary if global Bookmarks live only on L0.

## Named reading-list proof

Current payload contract:

```text
corpus_reading_lists_v1 = [
  { id, name, items: [{ id, text_key, file, title, author, r, era, genre }] }
]
```

- `getReadingLists()` reads the array and only migrates a non-empty legacy flat `corpus_reading_list_v1` into a default list.
- `createReadingList()` accepts arbitrary owner text and writes a generated id.
- `toggleItemInList()` is bounded to 300 items/list and stores authoritative readiness from the current render context.
- `renderReadingListCard()` re-checks a formerly not-ready item against the live Ready map, so it can become openable without payload migration.
- `injectReadingListShelves()` renders each non-empty list as a separate top-level shelf.
- There is no rename, hide, archive or pin implementation.
- `deleteReadingList()` has no confirmation and is wired directly to a bare header `✕`.
- `removeItemFromList()` has no confirmation/undo and is wired to a bare per-card `✕`.
- No export, cloud-sync, backup or recovery integration references `corpus_reading_lists_v1`.

The exact owner list name is absent from repository code/tests/fixtures. The production DOM contained three work cards, one not-ready. It is therefore user data and must never be selected for deletion by string match.

## Move-safety rule

A block is safe to move only when the next implementation changes its renderer/mount point and leaves its canonical writer and query boundary intact. If moving it would require copying rows into a new table, mirroring localStorage into SQLite, persisting a recommendation feed, or maintaining two disclosure stores, it is out of the recommended scope.
