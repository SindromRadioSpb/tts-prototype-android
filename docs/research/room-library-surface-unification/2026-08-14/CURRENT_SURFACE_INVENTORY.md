# Current surface inventory

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, version `3.11.384` |
| Method | `OWNER_SCREENSHOT` + `OWNER_LIVE_READ_ONLY` DOM/ARIA/geometry + `CODE` renderer/query review |
| Evidence separation | no isolated automation was executed; existing smoke code is cited only as `ISOLATED_AUTOMATION_CODE` |
| Limitations | owner learner data was not mutated or exported; no physical-device/AT claim; exact visual state can vary with the current profile and collapsed-state preference |

## Surface map

| Surface | Current hierarchy | Material presentation | Primary truth readers | Current bounds | IA finding |
|---|---|---|---|---|---|
| Library / L0 `#room=hub` | one global Continue hero; Today; “Сохранённое и завершённое”; four Ready rows; all libraries | hero + compact vertical rows + corpus-door rows | source-neutral `text_progress`; `getReadingJourneySummary()` / `listReadingJourneyItems()`; Ben ready catalog; authorized corpora | Ready `4`; journey page `48` | already behaves as global learning home, but named reading lists are described in copy and absent from the global module |
| Ben-Yehuda `#room=benyehuda` | corpus shell; corpus-local Continue hero; search/filter; Continue shelf; Finished; Bookmarks; one shelf per non-empty named list; Next; Ready; Periods | hero + five horizontal `shelf-rail` families + vertical Ready rows + period grid | mixed: Ben-only progress/finished, global bookmarks, device-local Ben lists, derived recommendation, baked catalog | Continue `12`; Finished `12`; Bookmarks `16`; Next `12`; Ready preview `12`; full results append `60` at a time | surface mixes corpus browse with learner projections of different scopes and repeats Continue on the same page |
| My Texts `#room=mytexts` | corpus shell; corpus-local Continue/start hero; search scope; filters/sorts; “Учебные материалы”; management disclosure | vertical `.room-text-row` list | LocalDb personal-text query and exact facets | replace-page window `48`, DB hard cap `96` | corpus identity is coherent; control density and 380px RTL clipping are the main problems, not missing global shelves |
| Study Songs `#room=group:study-songs-pilot` | protected corpus shell; corpus-local Continue/start hero; search/status/audio/sort; smart/tag filters; “Учебные материалы”; owner management | vertical `.group-work-card.room-text-row` list | authorized server group catalog + local materialized progress | incremental `48`; DOM grows on each “Показать ещё” | corpus identity is coherent; global shelves would add noise, while management should stay secondary |

## Library / L0 details

Live RU evidence showed:

- heading “Продолжим с нужного места” and one Continue hero pointing to the newest source-neutral unfinished material;
- Today actions derived from actual due/short/authorized-corpus availability;
- “Сохранённое и завершённое” counts: Bookmarks `4`, Finished `1`, With notes `106` on the inspected owner profile;
- a four-row “Готово к чтению” preview;
- corpus doors for Ben-Yehuda, My Texts (`115`) and Study Songs (`77`).

`renderCorpusHub()` builds this hierarchy. `getLearningHomeContinue()` directly queries `texts + text_progress` across My Texts, Ben-Yehuda and currently authorized group corpora. `learningHomeJourney()` reads bounded canonical projections for bookmark/finished/note, but has no reading-lists view. The existing copy nevertheless says that “Читать позже” is a separate device-local list. This is an IA omission, not missing storage.

## Ben-Yehuda details

The inspected production DOM contained these peer sections:

1. corpus-local Continue hero;
2. “Продолжить чтение”, 12 horizontal cards;
3. “Прочитанные”, one card;
4. “Закладки”, four cards;
5. “Тестовый список для чтения”, three real work cards, one not yet ready;
6. “Следующий для тебя”, 12 horizontal cards;
7. “Готовы к чтению — 796 работ”, 12 compact vertical rows plus “Показать все 796”;
8. “Периоды”.

The source comment above `injectBenHomeRails()` calls these reading-life projections cross-corpus, but the actual queries are mixed:

- `getContinueReading()` and `getFinishedTexts()` are explicitly Ben-only via `source_meta_json.origin = CANON_ORIGIN`;
- `listBookmarks(null, 16)` is global across every non-archived local text and does not apply the authorized-group filter used by B8 L0;
- named reading lists and saved searches are Ben-catalog localStorage data;
- Next and Ready are Ben-only derived/catalog projections.

Therefore the present asymmetry is not one deliberate scope model; it is a stack of historical projections. The bookmark query also creates a code-level authorization risk: a retained bookmark to a formerly authorized group work could be projected on Ben after entitlement loss. No actual owner-data leak was observed; this is a query-boundary finding.

## My Texts details

The production owner profile had 115 personal texts. `renderMyTextsCorpus()` reads exact facets and a one-row newest page for the hero, then renders search scope, sort, activity filters, levels/tags, a 48-row replace-page list, and a separate management disclosure linking to Studio. There are no global Finished/Bookmarks/Lists shelves.

At 380×844 HE/RTL the document itself remained `scrollWidth === clientWidth`, but the search-scope field and smart/tag controls had negative viewport coordinates down to approximately `-412px`. `.corpus-nav { overflow-x: clip; }` hides the off-canvas content. The cascade is consistent with this result: the group search field is made full-width at `max-width:760px`, then reset to `grid-column:auto` at `max-width:480px`; horizontal `.corpus-sort` groups do not receive a safe inline overflow/wrap contract here.

## Study Songs details

The production catalog had 77 works. `renderGroupCorpus()` reads an authorization-filtered server catalog, joins locally materialized progress, chooses a corpus-scoped hero, renders search/status/audio/sort plus smart/tag filters, then a vertical list. Owner-only backup/access/import controls sit in a secondary management disclosure.

At 380×844 HE/RTL the page also had no document-level horizontal scrollbar, but several smart-filter buttons extended to about `-325px`, clipped by the corpus shell. The corpus title “Учебные песни” remained Russian because the authorized group title is a server-provided identity string (`group.title`), not a locale key. Whether group identities should be localized is a product/content-policy question, not proof of an i18n lookup bug.

## Duplication and ownership conclusion

The strongest duplication is not “L0 and corpus pages both have Continue” in isolation: those are different routes and a corpus-scoped hero remains useful. The harmful duplication is within Ben itself—one corpus Continue hero plus a separate 12-card Continue shelf—followed by Finished, global Bookmarks and top-level named lists mixed into corpus discovery. My Texts and Study Songs demonstrate the cleaner grammar: corpus hero, retrieval controls, bounded materials, secondary management.

This supports moving global Reading Journey ownership to L0 while preserving one corpus-local hero per corpus. It does not require a new database, a new progress writer, or a new recommendation feed.
