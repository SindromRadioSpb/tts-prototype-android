# Production live-browser evidence

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, footer `v3.11.384` |
| Method | existing authenticated Chrome tab, claimed and inspected through DOM/accessibility-backed browser controls; safe route and locale switching only |
| Evidence class | all observations below are `OWNER_LIVE_READ_ONLY`; no isolated automation results are represented as production or owner-live evidence |
| Limitations | no owner localStorage payload inspection, no DB/review-log query, no destructive control, no material open, no progress/bookmark/finished/list action, no physical iPhone or screen reader |

## Read-only protocol and handback

Allowed observations were limited to visible content, roles, labels, `aria-expanded`, `aria-controls`, class/geometry, route, direction and served version. Corpus switcher and language were used only to expose the requested surfaces. The tab was returned to:

```text
route=https://linguistpro.kolosei.com/library.html#room=benyehuda
locale=ru
direction=ltr
viewport=1920x855
```

No delete, add-to-list, remove, bookmark, finish, grade, import/export, material-open or management action was invoked. Temporary locale/viewport presentation changes were restored and are not learner-data writes.

## Inventory observed on the owner profile

| Surface | Observed content | Page overflow |
|---|---|---|
| Library/L0 | global Continue hero; Today; Bookmarks `4`; Finished `1`; With notes `106`; Ready preview `4`; Ben, My Texts `115`, Study Songs `77` | desktop and 380×844 RU/HE: document `scrollWidth === clientWidth` |
| Ben-Yehuda | corpus Continue hero; Continue `12`; Finished `1`; Bookmarks `4`; “Тестовый список для чтения” `3`; Next `12`; Ready `796` with 12-row preview; Periods | desktop and 380×844 HE: no document overflow; horizontal shelves have nested overflow |
| My Texts | corpus Continue hero; search/scope/sort; smart filters/tags; Materials; management | desktop no document overflow; 380 HE contains clipped off-canvas controls despite no document scrollbar |
| Study Songs | corpus Continue hero; search/status/audio/sort; smart filters/tags; Materials; owner management | desktop no document overflow; 380 HE contains clipped off-canvas smart-filter controls |

## Horizontal rails

At desktop Ben-Yehuda the 12-card rail measured approximately `clientWidth=1088`, `scrollWidth=1726`. At 380×844 HE/RTL:

| Rail | Cards | Client width | Scroll width | Direction | Initial `scrollLeft` |
|---|---:|---:|---:|---|---:|
| Continue | 12 | 341 | 1726 | rtl | -16 |
| Finished | 1 | 341 | 341 | rtl | 0 |
| Bookmarks | 4 | 341 | 590 | rtl | -16 |
| Named list | 3 | 341 | 448 | rtl | -16 |
| Next | 12 | 341 | 1726 | rtl | -16 |

This is nested scrolling rather than page-level overflow. The CSS hides the scrollbar on mobile and restores a thin scrollbar only at `min-width:1024px`. Mouse wheel support for a horizontal-only container is not explicit; touch/trackpad can pan, while keyboard discovery depends on tabbing into off-screen children. No horizontal scrolling was performed on the owner tab.

## Named-list destructive semantics

The production DOM distinguishes the controls programmatically but not strongly visually:

| Action | DOM | Accessible label RU / HE | Visible mark | Confirmation |
|---|---|---|---|---|
| collapse/expand section | `button.room-section-toggle` | “Свернуть/Развернуть: <section>” | `⌃/⌄` plus text | not destructive |
| delete entire list | `button.shelf-list-del` | “Удалить список” / “מחיקת רשימה” | bare `✕` | none in source |
| remove work from list | `button.readinglist-rm` | “Убрать” / “הסרה” | bare `✕` | none in source |

The two `✕` controls and an ordinary disclosure live in the same header/card ecosystem. A sighted user must infer scope from placement, while an assistive-technology user receives better labels. This fails the premium requirement that destructive scope be equally clear in visual and semantic channels.

## “Тестовый список для чтения”

Production rendered the string as the title of a named-list section with three actual `.readinglist-card` work records; one carried the honest not-ready state. Repository-wide exact-string search across code, tests, scripts, fixtures and relevant docs returned `NO_MATCH`. The source creates arbitrary user names through `createReadingList(name)` and renders `L.name` verbatim.

Therefore:

- fact: it is consistent with owner-created localStorage data, not a compiled fixture or built-in placeholder;
- fact: it contains real displayed works and is not empty;
- fact: deleting it would immediately rewrite the owner’s list payload;
- unknown: who created it and for what purpose;
- prohibited inference: the word “Тестовый” is not authority to delete or hide it.

## RU/HE/RTL observations

- L0 at 380×844 was directionally correct and had no document overflow in both RU and HE.
- Ben rails inherited `direction:rtl`; the page itself did not overflow.
- The server-provided group name “Учебные песни” remained Russian in the HE switcher and heading. This is a content/identity localization gap, not proof of a missing locale key.
- Every live long-list disclosure on HE showed Russian visible text and Russian `aria-label` (“Свернуть”), even though `he.js` contains `sectionExpand: "פתיחה"` and `sectionCollapse: "סגירה"`. The buttons are generated without `data-i18n`, so locale changes can leave their initial fallback text stale. This is a confirmed dynamic-locale regression.
- At 380 HE, My Texts search-scope/smart/tag elements extended left to roughly `-412px`; Study Songs smart controls extended to roughly `-325px`. The document remained width-bounded because `.corpus-nav` clips overflow, making content unavailable rather than scrollable. This is a confirmed responsive/RTL regression.

## Regression records (research-only)

### IA-R1 — clipped 380px RTL retrieval controls

- Evidence: live bounding rectangles outside the viewport on My Texts and Study Songs; no page scrollbar; source cascade and non-wrapping `.corpus-sort` support the observation.
- Impact: filters exist in DOM but cannot all be seen or predictably reached visually; keyboard focus may move to clipped controls.
- Scope: existing B3/B7 responsive implementation, discovered during successor research.
- Action here: recorded only. No CSS or runtime fix.

### IA-R2 — stale Russian disclosure copy after HE switch

- Evidence: live visible/ARIA copy remained Russian on HE routes; all three locale files contain the appropriate keys; generated control lacks an i18n binding/repaint subscription.
- Impact: mixed-language UI and incorrect accessible-name locale.
- Scope: accepted disclosure contract implementation detail, not a reason to reopen the contract itself.
- Action here: recorded only. The next approved surface implementation should add a regression test and repaint path.

### IA-R3 — Ben global-bookmark authorization boundary risk

- Evidence: `injectBookmarksShelf()` calls unscoped `listBookmarks(null,16)`; its query filters archived texts but not current group authorization. B8 L0 uses `_readingJourneyVisibleSql()` and authorized group ids.
- Impact: a locally retained protected-work bookmark could remain visible on Ben after entitlement loss.
- Observed leak: none. This is a source-level risk, not owner-data evidence.
- Action here: rehome Bookmarks to the B8 L0 projection and retire the Ben shelf; do not create a second filter/query writer.

## Evidence boundary

The repository contains isolated smokes for 380px RU/HE, disclosure persistence, B8 bounded journey pages, 200% zoom and zero `review_log` writes. They were inspected but not run. Their historical PASS status is not evidence for the current owner tab or for the proposed future implementation.
