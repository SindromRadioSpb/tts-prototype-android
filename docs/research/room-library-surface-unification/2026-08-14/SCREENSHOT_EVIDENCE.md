# Owner screenshot evidence

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | owner URL `https://linguistpro.kolosei.com/library.html#room=benyehuda`; served `3.11.384` |
| Method | each supplied PNG opened at original resolution (`OWNER_SCREENSHOT`), then reconciled with production DOM and repository renderers (`OWNER_LIVE_READ_ONLY` + `CODE`) |
| Evidence separation | screenshot facts are not called live facts unless the same element was found in production; no isolated automation was run |
| Limitations | screenshots are point-in-time crops; collapsed blocks do not prove their hidden contents; hover, keyboard, focus, reload and destructive confirmation cannot be inferred from pixels |

## Input integrity

| File | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| `C:\Users\lletp\Downloads\1408\4.png` | 1093×568 | 40,251 | `90123CB023479F103E604A970FF357D894019EDB3FBD2B8D80ED3C0C91F09353` |
| `C:\Users\lletp\Downloads\1408\5.png` | 1165×751 | 92,790 | `F3A0F4E7BCF84A2175513BB7F90BA70078005F2A84E93091E7E09E62947C182A` |
| `C:\Users\lletp\Downloads\1408\6.png` | 1168×739 | 95,811 | `9BF71FE597C29759679778ED04498665E97E5BB0EFCF46F47F099F15E17A3BAD` |
| `C:\Users\lletp\Downloads\1408\7.png` | 1142×592 | 65,244 | `4F170A2DA2E1CDAAAD36B2D305B920D5DBAF3B6BC591C6D9FB2B5FFCC39AFB93` |

## 4.png — Ben-Yehuda, collapsed sections

- Route/surface: Ben-Yehuda corpus home, consistent with `#room=benyehuda`.
- Observed hierarchy: seven peer-level headers—Continue, Finished, Bookmarks, named list, Next, Ready `796`, Periods—with large inter-section whitespace because bodies are collapsed.
- Block types: learner progress projection; asserted finished projection; passage-pointer projection; user named collection; derived recommendation; baked ready inventory; corpus taxonomy.
- Material format: hidden in this crop; only section headers and disclosure controls are visible.
- Available actions: every section exposes “Развернуть”; the named list additionally exposes a bare `✕` beside its title.
- Cognitive noise: unrelated truth domains read as one flat stack; the list delete glyph sits in the same header band as disclosure and visually resembles ordinary close/collapse.
- Fact: the named list is a first-class top-level section in the captured interface.
- Hypothesis: the list was a fixture because its name contains “Тестовый”. This hypothesis is rejected by code/live evidence: the exact string is absent from repository code/tests/fixtures, and production rendered three owner-stored work items.
- DOM/code link: `injectBenHomeRails()` prepends the mixed blocks; `injectReadingListShelves()` creates one `section.shelf` per non-empty list; `.shelf-list-del` renders the bare `✕`; `attachRoomLongListDisclosure()` adds the adjacent typed disclosure.

## 5.png — My Texts

- Route/surface: My Texts corpus, consistent with `#room=mytexts`.
- Observed hierarchy: corpus identity/count; a single corpus Continue hero; dense search/scope/sort/filter area; “Учебные материалы”; “Добавление и управление текстами”.
- Block types: corpus identity; corpus-scoped progress projection; retrieval controls; personal catalog; secondary management boundary.
- Material format: vertical full-width rows under the materials section.
- Available actions: continue/start, search, choose scope/sort, activity/tag filters, expand/collapse materials, enter Studio add/manage paths.
- Cognitive noise: the control field is visually taller than the reading list; mixed technical English tag labels and many smart filters compete with the next reading action.
- Fact: global Finished/Bookmarks/Lists are absent, yet the corpus remains understandable.
- Hypothesis: adding all global journey shelves would improve discoverability. The screenshot and live hierarchy do not support it; it would push personal materials further down and duplicate L0.
- DOM/code link: `renderMyTextsCorpus()` + `listPersonalTextsPage()` produce a 48-row replace-page list; `corpusSecondaryDisclosure()` owns management; `renderMyTextCard()` already uses the target semantic row structure.

## 6.png — Study Songs

- Route/surface: protected group corpus, production route `#room=group%3Astudy-songs-pilot`.
- Observed hierarchy: corpus identity/count; one corpus Continue hero; search/status/audio/sort; personal smart filters/tags; “Учебные материалы”; “Управление корпусом”.
- Block types: protected corpus identity; corpus-scoped progress; retrieval controls; assigned material list; owner administration.
- Material format: vertical full-width rows.
- Available actions: continue/start, filter/sort/search, disclose materials, share a work, and owner-only membership/export/import actions inside management.
- Cognitive noise: management actions are numerous and potentially high-impact; they compete visually when expanded. Global learner shelves would make the page longer without strengthening corpus identity.
- Fact: administration is already separated from learning materials through a secondary disclosure.
- Hypothesis: the Russian name in an HE UI is a missing locale. Code shows it is the authorized server catalog’s `group.title`; localization policy for owner/group names remains unknown.
- DOM/code link: `renderGroupCorpus()` reads `/api/group-corpora/<id>/works`, joins local progress, renders `.group-work-card.room-text-row`, and puts owner actions in `.corpus-management`.

## 7.png — Next vs Ready expanded

- Route/surface: Ben-Yehuda corpus home.
- Observed hierarchy: “Следующий для тебя” above “Готовы к чтению”.
- Block types: derived recommendation collection versus baked catalog readiness collection.
- Material format: Next is a horizontal card rail with a visible scrollbar and a partially cut card at the edge; Ready is a vertical compact-row list with full-width scanning.
- Available actions: both open works and expose learning/readiness metadata; Ready also presents a typed add-to-list control. Next cards expose repeated author/length/learning/audio/open content.
- Cognitive noise: horizontal cards repeat chrome, show only a subset without a count-in-view, hide additional works behind side-scrolling, and create a nested scroll container. The partially cut card is an affordance but also a persistent “unfinished layout” signal.
- Fact: the two formats encode similar material collections with different scanning mechanics.
- Hypothesis: one identical renderer should erase their semantic differences. Rejected: Next must carry an honest recommendation reason, while Ready must carry readiness/provenance. Only structure and interaction should converge.
- DOM/code link: Next uses `buildRailSection()` → `.shelf-rail` → `renderCorpusCard()`; Ready uses `.corpus-work-list.room-preview-list` → `renderCorpusWorkRow(..., {compact:true})`.

## Cross-image conclusion

The screenshots support a vertical material-row grammar, not a universal component with universal copy. They also show that the corpus-local pattern is already coherent in My Texts and Study Songs. The outlier is Ben-Yehuda, where global/personal projections accumulated as peer shelves around corpus browse.
