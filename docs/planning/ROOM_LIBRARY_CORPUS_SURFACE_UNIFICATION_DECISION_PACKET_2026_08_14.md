# ROOM-LIBRARY-IA — Library & Corpus Surface Unification

> **CLOSED · OWNER ACCEPTED · 2026-08-15.** Consolidated closure:
> [`ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`](./ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md).

## Owner decision packet

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` baseline; approved local implementation addendum recorded below |
| Source commit | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` |
| Branch | `main` |
| Dirty tree | `DIRTY`: 34 pre-existing porcelain entries before research; all owner changes preserved; research artifacts and the approved implementation allowlist were added without touching unrelated entries |
| Production inspected | `https://linguistpro.kolosei.com/library.html#room=benyehuda` |
| Served version | `3.11.384`; matches repo Room/Studio/SW version triplet |
| Evidence method | required canon and relevant fresh-doc read; original inspection of owner screenshots 4–7; existing authenticated production tab read-only; source/query/CSS/locale/test review; approved isolated fixture automation and independent local DOM readback |
| Evidence classes | `CODE`, `OWNER_SCREENSHOT`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `LOCAL_BROWSER_READBACK` |
| Limitations | no owner storage extraction or owner-data write; no destructive production smoke; no post-change production deploy/readback; no physical iPhone or VoiceOver evidence |

## Owner approval — 2026-08-14

Status: `APPROVED_FOR_LOCAL_IMPLEMENTATION`.

Owner message: `Утверждаю Рекомендации. Формализуй и стартуй`.

The owner approved the complete recommended set below without substitutions. The normalized authority record is:

```text
APPROVE ROOM-LIBRARY-IA-R:
D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL;
D2=B_CONSOLIDATED_READING_LISTS_MODULE;
D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL;
D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL;
D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE;
D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION;
MIGRATION=NONE;
SCOPE=IMMEDIATE_SURFACE_ONLY
```

Authority boundary: local runtime/test/documentation implementation and isolated non-destructive verification may start. This approval does **not** authorize owner-profile mutations, schema/data/localStorage-format migration, B9 work, commit, push, production deploy, or destructive production smoke. Those release actions require a separate final gate after implementation evidence.

## Local implementation addendum — 2026-08-14

Status: `LOCAL_IMPLEMENTATION_COMPLETE_AWAITING_RELEASE_GATE`.

The approved D1–D6 set has been implemented locally within the allowlist and without schema or payload evolution. The durable verification record is [`IMPLEMENTATION_EVIDENCE.md`](../research/room-library-surface-unification/2026-08-14/implementation/IMPLEMENTATION_EVIDENCE.md).

Release remains stopped at this boundary:

```text
CODE=LOCAL_IMPLEMENTATION_COMPLETE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
COMMIT=NONE
PUSH=NONE
DEPLOY=NONE
```

## Approved decision set

Recommended set:

```text
D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL
D2=B_CONSOLIDATED_READING_LISTS_MODULE
D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL
D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL
D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE
D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION
MIGRATION=NONE
SCOPE=IMMEDIATE_SURFACE_ONLY
```

## Status and non-reopen boundary

B0–B7 and B8 Reading Journey are closed. The following remain accepted without new regression evidence:

- Continue means the last deliberately worked row, including backward study; it is not monotonic/furthest completion.
- Ordinary and media materials restore that working row through the existing canonical progress writer.
- Explicit passage bookmarks are a separate truth domain.
- The shared `Свернуть/Развернуть` control, persisted state across reload/tab reopen, typed first-row control placement and `aria-expanded/aria-controls` relationship remain the contract.
- The Room working-row highlight remains a projection under the playback overlay, not a writer.
- My Texts remains outside Ben-Yehuda.
- B9 remains reserved for Curated Paths and assignments.

This successor decides information architecture and repeated-material presentation only.

## Executive evidence

1. Library/L0 already has the only source-neutral Continue hero and bounded global Reading Journey readers.
2. Named reading lists are missing from L0 even though its copy distinguishes “Читать позже” from bookmarks.
3. Ben mixes a corpus Continue hero with a second 12-card Continue shelf, Ben-only Finished, global Bookmarks, device-local Ben lists, derived Next, baked Ready and Periods.
4. My Texts and Study Songs already demonstrate the clearer corpus grammar: one hero, retrieval controls, vertical materials, secondary management.
5. Owner screenshot 7 and live metrics show the horizontal rail hides most of 12 items (`341/1726px` at 380 HE), while Ready rows support direct scanning.
6. “Тестовый список для чтения” is not a fixture string in the repository. It is owner data with three real work records and must not be deleted or matched by name.
7. Named-list delete and item remove are visually the same bare `✕`; list deletion has no confirmation.
8. Current named-list storage has no rename/hide/archive/pin, sync, export or eviction recovery.
9. Two existing regressions were found: clipped My/Study controls at 380 HE and Russian disclosure labels in an HE UI. A third code-level risk is Ben’s unscoped global Bookmark reader. None is fixed in research-only mode.

Detailed evidence: [`docs/research/room-library-surface-unification/2026-08-14/README.md`](../research/room-library-surface-unification/2026-08-14/README.md).

## D1 — Surface ownership

### Options

- A — duplicate Continue, Finished, Bookmarks and Lists in Ben, My Texts and Study Songs.
- B — preserve current asymmetry, with learner projections only inside Ben.
- C — Library/L0 owns global Reading Journey; each corpus owns only a corpus-scoped hero, retrieval, honest corpus-specific Next when applicable, catalog/materials and management.

### Evidence

- L0’s `getLearningHomeContinue()` is source-neutral and authorization-aware for retained group works.
- L0’s B8 readers page global Bookmarks/Finished/Notes through existing canonical tables.
- Ben’s mixed stack uses three different scope rules; `getContinueReading/getFinishedTexts` are Ben-only, `listBookmarks(null)` is global, and named lists are device-local Ben work ids.
- My Texts and Study Songs remain understandable without global shelves.

### Role analysis

- R2/R8: one global next step plus one corpus-specific next step avoids overload and preserves “what next”.
- R4: eliminates five nested rails from the noisiest surface and avoids copying their RTL/mobile cost to two more surfaces.
- R5/R6: Library becomes the learner’s cross-corpus home; corpora remain identifiable collections.
- R11: retires a scope-inconsistent projection instead of cloning it.
- R12: reuses existing read-only projections and writers; no new journey truth.
- R15: recovery/sync copy can be stated once at L0.

### Risks

- Users accustomed to finding bookmarks/lists inside Ben need a clear L0 route and post-release communication.
- A corpus hero can point to the same work as the L0 hero, but never on the same page; labels must state corpus scope.
- Removing Ben’s Bookmark shelf must not remove the underlying bookmarks or B8 projection.

### Recommendation

`C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL`.

Target ownership:

| L0 global | Ben corpus-local | My Texts corpus-local | Study Songs corpus-local |
|---|---|---|---|
| one source-neutral Continue hero; Bookmarks; Finished; existing Notes; Reading Lists | one Ben Continue/start hero; search/filter; saved Ben searches; honest Next; Ready; Periods; about/data | one own-text Continue/start hero; search/filter/sort; materials; Studio management link | one group Continue/start hero; search/filter/sort; materials; protected management |

### Migration impact / rollback

`MIGRATION=NONE`. Move mount points and remove duplicate render calls only. Rollback is a scoped UI revert; canonical data remains untouched.

### Approval value

`D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL`

## D2 — Named reading lists

### Options

- A — retain one top-level shelf per non-empty list.
- B — one global “Списки для чтения” module with named-list summary rows and a bounded list detail.
- C — remove lists from home and expose them only on a dedicated route.

### Evidence

- Current `injectReadingListShelves()` promotes each list to a top-level Ben shelf and renders every item up to the 300-item storage cap.
- The owner list contains three real works; its name is not compiled code.
- List picker already exposes names and counts, proving summary rows can be built from the current payload.
- Delete and remove are visually identical bare glyphs; no confirmation exists.
- No rename/hide/archive/pin or recovery/sync path exists.

### Role analysis

- R2: collection-of-collections benefits from progressive disclosure.
- R4: visible action labels and confirmation remove ambiguity.
- R5/R6: named lists become a coherent library capability rather than arbitrary Ben page sections.
- R11/R12: one existing payload and one save writer remain canonical.
- R15: module copy must say device-local/no sync; delete scope must be explicit.

### Risks

- Pin/hide/archive semantics are not merely visual if persisted; adding fields silently would be payload evolution.
- Rename and delete act on real owner data and need isolated fixtures before any owner-live action.
- A dedicated detail route may eventually be preferable, but is not required to prove the module.

### Recommendation

`B_CONSOLIDATED_READING_LISTS_MODULE`.

Immediate behavior:

- one L0 module;
- honest scope copy: current list items are Ben-Yehuda catalog works on this device; moving the module does not make the payload cross-corpus and does not auto-add My Texts or Study Songs;
- summary row per named list: name, item count, ready/not-ready count, Open, More actions;
- Rename through the existing `name` property and sole list writer;
- item action visibly labelled “Убрать из списка”, with Undo if feasible;
- list action visibly labelled “Удалить список…”, destructive style, confirmation naming list and item count;
- no bare `✕`; no string-match deletion; no owner-list destructive test.

Backlog:

- Pin/show on home, Hide and Archive after a separate payload/lifecycle decision;
- cross-device sync/export/recovery after R12/R15 design;
- optional dedicated list-detail route after the in-place module is validated.

### Migration impact / rollback

No schema or payload-format migration. Existing `{id,name,items}` is read and written unchanged. Existing stable per-list disclosure keys should be retained as compatibility aliases. Rollback returns the old renderer without touching list data.

### Approval value

`D2=B_CONSOLIDATED_READING_LISTS_MODULE`

## D3 — Material presentation

### Options

- A — keep horizontal rails.
- B — every repeated collection of works uses full-width vertical compact rows.
- C — choose rail/row adaptively per collection.

### Evidence

- screenshot 7 directly compares Next’s clipped rail with Ready’s scannable rows;
- five Ben rail families overflow their containers on 380 HE while the page itself stays width-bounded;
- My Texts, Study Songs and Ready already have working vertical semantic-row renderers;
- rail cards duplicate badges/chrome and put keyboard focus into potentially off-screen items.

### Role analysis

- R2/R6: rows make title/author/reason/status comparisons faster.
- R4: one scroll axis, predictable 380/200%/RTL and visible actions.
- R5: calmer premium library, closer to an editorial ledger than a card carousel.
- R8: recommendation reason stays visible in the scan.
- R11: shared skeleton reduces renderer drift while preserving typed content.

### Risks

- A generic row could erase distinct truth domains.
- Dense metadata can still overflow; each kind needs a strict required/optional field budget.
- Hero and Today modules are intentionally not collection rows and should not be forced into this component.

### Recommendation

`B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL` for Continue, Finished, Bookmarks, Next, reading-list items and Ready. Share structure/interactions; keep typed copy and action semantics.

### Migration impact / rollback

DOM/CSS/renderer only. No data migration. Rollback restores prior renderers; data untouched.

### Approval value

`D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL`

## D4 — Density and bounds

### Options

- A — unbounded render or incremental append until the whole collection is mounted.
- B — bounded preview plus explicit Show all and replacement pagination/window.
- C — virtualized infinite scrolling.

### Evidence

- existing B1 policy already gates `ROOM_PREVIEW=12` and `ROOM_BROWSE_PAGE=48`;
- L0 intentionally renders four Ready rows;
- named lists currently render up to 300 and Ben/group “more” paths can accumulate full sets, including 796 Ready works;
- B8 journey replacement pages are already bounded to 48 and preserve typed source filters.

### Role analysis

- R2/R4: explicit totals and Show all are more discoverable than hidden scroll or endless append.
- R6: counts remain collection truth while DOM remains bounded.
- R11: reuse proven bounds; test empty/one/13/796 cases.
- R12: pagination state is presentation-only, not collection truth.

### Risks

- replacement pages need focus and Back/return-context handling;
- virtualization may later be needed for a different scale, but introduces AT complexity now.

### Recommendation

`B_BOUNDED_PREVIEW_PLUS_SHOW_ALL`:

- L0 Ready: 4;
- repeated collection preview: 12;
- Show all: replace-page 48;
- total count always visible;
- never mount all 796/300 through repeated append;
- no virtualization until measurement proves 48 rows insufficient.

### Migration impact / rollback

Presentation state only. Reuse current limits; no schema/localStorage evolution. Rollback is renderer-only.

### Approval value

`D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL`

## D5 — Shared section grammar

### Options

- A — keep per-surface header/disclosure layouts.
- B — retain and extend one typed section header/disclosure contract.
- C — introduce a new framework/web-component abstraction.

### Evidence

- B8 already accepted and tested `attachRoomLongListDisclosure()` plus bounded `room.longListDisclosure.v1` and cookie fallback;
- CSS already defines typed grid positions for title/count/action/toggle;
- production found a dynamic-locale repaint defect, not a conceptual defect in the contract.

### Role analysis

- R2/R4: consistent progressive disclosure, 44px target and predictable focus.
- R5: one polished visual grammar.
- R11: one helper and one regression matrix.
- R12: existing presentation-only store, no second state.
- R15: content-free bounded fallback remains separate from learner data.

### Risks

- count, secondary action and disclosure must not collide in long RU/HE headings;
- locale switch must repaint visible and ARIA strings;
- changing stable keys would silently discard presentation preference.

### Recommendation

`B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE` with stable heading ids, separate count, optional secondary action, accepted first-row right disclosure, row-two explanation, `aria-expanded/controls`, predictable focus, RU/EN/HE/RTL and existing persisted state.

### Migration impact / rollback

No new persistence key or format. Keep existing helper/store and compatibility keys. Rollback is DOM/CSS/i18n only.

### Approval value

`D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE`

## D6 — Immediate scope

### Options

- A — broad IA, storage migration, sync/recovery and recommendation changes together.
- B — immediate surface-only implementation with no schema or localStorage-format migration.
- C — defer implementation entirely.

### Evidence

Every recommended behavior can be implemented by changing mount points, renderers, CSS, localized copy and tests while reusing current writers, readers and limits. Pin/hide/archive and cross-device lists cannot.

### Role analysis

- R4/R5: fixes the visible problem now.
- R11: strict allowlist, red tests and rollbackable commits.
- R12: no second writer or data copy.
- R15: no silent lifecycle promise.

### Risks

- touching DB/adapters or recommendation algorithms would expand authority beyond this packet;
- a broad CSS change could regress Studio/shared reader surfaces;
- version/SW skew could make production appear stale.

### Recommendation

`B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION`.

Immediate after approval:

1. red contract tests and isolated fixtures;
2. shared row/header/i18n contract, including IA-R1/IA-R2 regressions;
3. L0 journey ownership and consolidated reading-list renderer;
4. retire Ben duplicate shelves and convert Next/material projections to rows;
5. replace-page bounds for Ben/group/list details;
6. staged verification, version triplet bump and production evidence.

Backlog/out of scope:

- Pin/hide/archive payload metadata;
- list sync/export/recovery;
- B9 Curated Paths/assignments;
- recommendation algorithm/feed changes;
- corpus/group naming localization policy;
- general Visual Finishing beyond the affected surfaces;
- broad Studio or reader redesign.

### Migration impact / rollback

`SCHEMA_CHANGE=NONE`; `LOCALSTORAGE_FORMAT_EVOLUTION=NONE`; `MIGRATION=NONE`. Rollback is a versioned static-client revert; existing owner data remains readable by both versions.

### Approval value

`D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION`

## Implementation-ready boundary for the next session

### Proposed allowlist

The next implementation must reconfirm live paths and dirty state, then use this narrow allowlist:

- `public/js/library-ui.js` — mount/renderer/focus/pagination/i18n repaint glue only;
- `public/library.html` — Room-scoped CSS and Room footer version only;
- `public/i18n/locales/ru.js`;
- `public/i18n/locales/en.js`;
- `public/i18n/locales/he.js`;
- `tests/roomUxMaturity.test.js` — update existing structural contracts;
- `tests/roomLibrarySurfaceIa.test.js` — new pure/source-contract tests;
- `scripts/premium/room-library-surface-ia-browser-smoke.js` — new isolated fixture/browser matrix;
- `tests/i18n.locale-version.lock.json` — locale cache-bust lock only when approved locale files change;
- `public/index.html` and `public/sw.js` — version-string-only changes in the release commit;
- this decision packet plus a new implementation-evidence document.

Conditional only if a red test proves the existing presenter cannot express a required typed row:

- `public/js/corpus-item-presenter.js` and its direct unit test. No I/O, truth or algorithm may enter it.

### Forbidden files/domains

- `public/db/local-db.js`, `public/db/migrations.js`, every schema/migration file;
- `public/js/reader-progress.js`, shared Reader/Studio builders and progress/bookmark/finished writers;
- `public/js/corpus-vocab.js`, catalog/FTS assets and recommendation/bake algorithms;
- group-corpus server APIs, membership/assignment code and B9 files;
- `corpus_reading_lists_v1` structure/version, legacy migration semantics and disclosure store format;
- owner profile storage, owner named lists and all destructive owner actions;
- unrelated dirty files.

### Shared contracts

- one canonical writer each for progress, finished state, bookmarks, lists, recommendation inputs and disclosure state;
- one material-row skeleton with a mandatory `data-material-kind` and kind-specific content;
- one typed section header/disclosure helper and persisted presentation state;
- one global journey owner at L0; one corpus hero per corpus;
- one bounded page policy: 4 / 12 / 48 as specified;
- source/authorization labels remain visible and honest;
- navigation/filter/disclosure performs zero progress/bookmark/review writes.

### Possible DOM/CSS changes

- retire material use of `.shelf-rail` and `.work-card` on affected collection projections;
- extend/reuse `.room-text-row`, sibling primary/secondary controls and Learning Compass slots;
- introduce a lists-summary row and typed actions menu/dialog;
- make filter/smart controls wrap or use a deliberate visible inline scroller so 380 HE has no clipped interactive rects;
- keep Room CSS scoped to `library.html`; do not touch shared `#proTable`/Studio rules;
- ensure header grid holds long RU/HE title + count + optional action + disclosure without overlap.

### i18n keys

Reuse existing `room.home.journey*`, `room.corpus.lists.*`, `room.corpus.sectionExpand/Collapse`, `room.resume.*` and `room.bookmark.*`. Likely new RU/EN/HE keys:

```text
room.home.readingLists
room.home.readingListsDevice
room.corpus.lists.count
room.corpus.lists.readyCount
room.corpus.lists.open
room.corpus.lists.rename
room.corpus.lists.renameLabel
room.corpus.lists.moreActions
room.corpus.lists.removeItem
room.corpus.lists.deleteAction
room.corpus.lists.deleteConfirmTitle
room.corpus.lists.deleteConfirmBody
room.corpus.lists.deleteConfirmCancel
room.corpus.lists.deleteConfirmSubmit
room.corpus.lists.unavailableCount
```

Pin/hide/archive keys are not added in the immediate scope.

### Backward compatibility

- Existing `{id,name,items}` payloads render without rewrite.
- Legacy flat-list migration stays untouched.
- Existing list ids remain DOM/focus/disclosure identities; no name-based identity.
- Not-ready stubs continue to auto-upgrade from the live Ready map.
- Existing progress/bookmark/finished tables and bundle behavior remain byte/semantic compatible.
- Existing disclosure keys are reused or accepted as aliases; no owner preference clearing.

### Rollback plan

1. ship behind the normal versioned static release boundary, not a data flag;
2. if a regression appears, redeploy the previous client version and prior SW cache version;
3. do not clear localStorage, OPFS, cookies or owner keys;
4. verify old renderer reads all existing lists/progress/bookmarks unchanged;
5. document any presentation-only state loss separately—never call it learner-data loss.

### Version / service-worker strategy

- one version bump across `public/index.html`, `public/library.html` and `public/sw.js` in the final release commit;
- verify served footer and `/api/client-config`/SW activation after deploy;
- use controlled reload/update, not owner storage clearing;
- distinguish stale cache from product regression before rollback;
- offline/reconnect and old→new SW transition are required staging gates.

### Scoped commit order

1. `test(room): freeze library IA ownership, rows, bounds and destructive safety`;
2. `feat(room): unify typed material rows and section headers`;
3. `feat(room): move global journey and consolidate reading lists`;
4. `fix(room): close 380 RTL and dynamic-locale regressions`;
5. `test(room): add isolated RU/HE/zoom/offline/SW matrix`;
6. `release(room): bump version and record implementation evidence`.

Each commit receives an explicit allowlist diff check. No commit/push is authorized in this research session.

## Required verification for the future implementation

The complete planned matrix is in [`FINDINGS.md`](../research/room-library-surface-unification/2026-08-14/FINDINGS.md). Required gates include:

- desktop RU and HE/RTL;
- 380×844 RU and HE/RTL;
- 200% zoom/reflow;
- keyboard-only and DOM/ARIA semantics;
- reload and close/reopen tab;
- offline/reconnect and service-worker update;
- empty/one/13-item states;
- 796+ Ready works;
- multiple named lists, long list name, long Hebrew titles and unavailable work;
- existing quota fallback only for disclosure state;
- disposable-fixture destructive safety;
- zero progress/bookmark/review-log writes from navigation;
- zero horizontal overflow for document and material lists.

Automation is not physical-device or owner-live evidence. Owner production verification remains read-only for real lists and learner state; destructive confirmation is tested only on disposable isolated fixtures.

## Research artifacts

- [`README.md`](../research/room-library-surface-unification/2026-08-14/README.md)
- [`CURRENT_SURFACE_INVENTORY.md`](../research/room-library-surface-unification/2026-08-14/CURRENT_SURFACE_INVENTORY.md)
- [`SCREENSHOT_EVIDENCE.md`](../research/room-library-surface-unification/2026-08-14/SCREENSHOT_EVIDENCE.md)
- [`LIVE_BROWSER_EVIDENCE.md`](../research/room-library-surface-unification/2026-08-14/LIVE_BROWSER_EVIDENCE.md)
- [`TRUTH_AND_WRITER_MAP.md`](../research/room-library-surface-unification/2026-08-14/TRUTH_AND_WRITER_MAP.md)
- [`SECTION_CONTRACT_MATRIX.md`](../research/room-library-surface-unification/2026-08-14/SECTION_CONTRACT_MATRIX.md)
- [`OPTIONS_AND_ROLE_SYNTHESIS.md`](../research/room-library-surface-unification/2026-08-14/OPTIONS_AND_ROLE_SYNTHESIS.md)
- [`FINDINGS.md`](../research/room-library-surface-unification/2026-08-14/FINDINGS.md)

## Exact owner approval

```text
APPROVE ROOM-LIBRARY-IA-R: D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL; D2=B_CONSOLIDATED_READING_LISTS_MODULE; D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL; D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL; D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE; D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION; MIGRATION=NONE; SCOPE=IMMEDIATE_SURFACE_ONLY
```

The owner approval above satisfied the research stop gate. A separate release gate is now required before repository publication or production work:

```text
APPROVE ROOM-LIBRARY-IA-RELEASE:
COMMIT=YES;
PUSH=YES;
DEPLOY=YES;
OWNER_LIVE_READ_ONLY=YES
```

Current boundary:

```text
CODE=LOCAL_IMPLEMENTATION_COMPLETE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
COMMIT=NONE
PUSH=NONE
DEPLOY=NONE
```

## Owner release approval — 2026-08-14

Status: `APPROVED_FOR_SCOPED_COMMIT_PUSH_DEPLOY_AND_OWNER_LIVE_READ_ONLY`.

Owner message:

> подтверждаю. стартуй. по факту выката на деплой проведи тестирование. в случае обнаружения багов и несоответствий пользовательского премиального ожидания и подобных причин - устрани и сделай повторный деплой и тестирование в браузере. затем передай мне на проверку.

The owner additionally requested the connected Kapture production tab for the post-deploy browser check. This is normalized as:

```text
APPROVE ROOM-LIBRARY-IA-RELEASE:
COMMIT=YES;
PUSH=YES;
DEPLOY=YES;
OWNER_LIVE_READ_ONLY=YES
```

The authority includes scoped product fixes and repeat deploy/browser-verification loops when the released surface has a regression or fails the approved premium UX contract. It does not authorize owner learner-data mutations, destructive list actions, schema/data migration, production data cleanup, B9, or unrelated dirty-tree publication.
