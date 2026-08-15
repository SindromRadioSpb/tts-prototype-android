# ROOM-CORPUS-DISCOVERY — approved corpus discovery and catalog contract

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-15 |
| Branch | `main` |
| Source commit | `8239d0a6ad8dcf28acee3ffd09df21dd1a694d13` |
| Upstream at approval | `origin/main@8239d0a6ad8dcf28acee3ffd09df21dd1a694d13` |
| Dirty tree | `DIRTY`: 34 pre-existing/unrelated porcelain entries; all remain outside this scope |
| Inspected production | `https://linguistpro.kolosei.com/library.html`, client/SW `3.11.386` |
| Evidence method | live source review; predecessor ROOM-LIBRARY-IA artifacts; owner-live read-only Kapture DOM/geometry; presentation-only sorting with default state restored |
| Evidence classes | `CODE`; `PRODUCTION`; `OWNER_LIVE_READ_ONLY` |
| Limitations | Kapture is desktop Chrome, not physical-device or assistive-technology evidence; no destructive owner action was executed |

## Successor status and owner approval

This is a bounded successor to the released ROOM-LIBRARY-IA contract. It does not
reopen B0-B8 and does not start B9 Curated Paths or assignments.

Owner approval, 2026-08-15:

> Утверждаю рекомендованый порядок. Формализуй и стартуй.

Normalized approval:

```text
APPROVE ROOM-CORPUS-DISCOVERY-IMPLEMENTATION:
ORDER=C_PROFILE_FIT_BEFORE_EXPLICIT_CATALOG;
CATALOG=B_SINGLE_STABLE_FILTERED_RESULT_REGION;
LABEL=B_PROFILE_FIT_NOT_NEXT;
BEN=B_KEEP_FIX_EXCLUSIONS_AND_COPY;
MYTEXTS=B_ADD_WHEN_RELIABLE_AND_NON_DUPLICATIVE;
STUDY_SONGS=B_SECONDARY_PROFILE_FIT_NO_ASSIGNMENT_SEMANTICS;
WRITER=NONE;
B9=NONE;
MIGRATION=NONE;
COMMIT=YES;
PUSH=YES;
DEPLOY=YES;
OWNER_LIVE_READ_ONLY=YES
```

The release authority inherits the already recorded bounded fix/redeploy loop in
`ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`: production
browser regressions and premium-contract failures may be repaired and redeployed,
while owner learner data, destructive list actions, migrations, B9 and unrelated
dirty-tree entries remain excluded.

## Confirmed regression evidence

1. Ben-Yehuda's `Сначала достоверно знакомые` sort mutates
   `corpusFilter.readyOnly=true`, switches the entire home body to results mode and
   removes both `Следующий для тебя` and `Готовы к чтению`.
2. Selecting `Сначала готовые` afterward does not clear that hidden filter; a second
   `Сбросить` action is required.
3. `По алфавиту` leaves the recommendation block visible but does not reorder the
   default 12-row Ready preview.
4. The old recommendation rail is only the descending recorded-familiarity order.
   It has no growth-zone threshold and production showed both Finished and Continue
   material inside it; the old `Следующий`/`зона роста` copy overstates its truth.
5. My Texts and protected group corpora already have the same typed familiarity
   readers and explicit familiarity sort. No new recommendation persistence is
   necessary.

## Approved information architecture

Every non-empty corpus uses this order:

```text
corpus identity
Continue / Start hero
optional bounded profile-fit projection
Catalog heading and explanatory scope copy
Search / filters / sort
Ready preview or filtered/search results
Periods or corpus management
```

In Ben-Yehuda the default catalog body shows ready material while search may cover
the wider corpus. The shared heading names the ownership boundary; controls update
only the catalog region below them.
The profile-fit projection remains mounted above that boundary during sorting,
filtering and search and changes only through its own disclosure control or a real
learner-truth refresh.

## Typed profile-fit contract

- User-facing title: `Подходит по вашему профилю слов` (localized RU/EN/HE).
- Copy describes a lower bound from recorded word-profile overlap and explicitly
  says it is not a comprehension estimate.
- Preview maximum: 4 rows; minimum: 2 distinct eligible alternatives.
- Exclude the material already owned by the corpus Continue/Start hero.
- Exclude confirmed Finished material.
- Preserve source-specific rows and actions; do not flatten Ben, My Text and group
  truth into one semantic item type.
- Use existing familiarity readers/caches only. No recommendation writer, feed,
  schema, migration or localStorage payload is added.
- A group profile-fit projection is secondary to curator order. `Следующее по
  программе` remains unavailable without later B9 assignment truth.

## Stable Ben catalog contract

- Default body remains a bounded Ready preview.
- Every sort mode reorders that visible preview.
- Search/facets replace only the catalog result body, not profile-fit or the corpus
  hero.
- Familiarity sort never activates a hidden Ready filter.
- Changing back to the default sort does not require `Сбросить`.
- `Показать все` remains the explicit transition from the 12-row preview to the
  48-row paged Ready result set.
- Search title/author results honor the visible sort; FTS subgroups retain their
  explicit search grouping.

## Role synthesis

- **R2 / R8:** one clear next action and bounded discovery precede the large browse
  surface without hiding the catalog.
- **R4:** controls have a visible, stable ownership boundary; no implicit second
  action is required to undo a sort.
- **R5 / R6:** shared section grammar does not erase corpus identity or curator
  order.
- **R11:** copy never turns word overlap into comprehension or an invented learning
  sequence.
- **R12:** all projections remain readers of existing truth; no dual writer is
  introduced.

## Implementation allowlist

- `public/js/library-ui.js`
- `public/library.html`
- `public/index.html` for the shared locale and client-version cache locks
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`
- `public/sw.js` and the matching `public/library.html` version label
- `tests/i18n.locale-version.lock.json`
- focused tests under `tests/` and `scripts/premium/`
- this approval and successor evidence under
  `docs/planning/` and
  `docs/research/room-library-surface-unification/2026-08-14/implementation/`

## Explicitly forbidden

- DB/schema/query adapter changes or migrations;
- progress, bookmarks, Finished, review log or reading-list writers;
- localStorage payload evolution;
- recommendation feed/state persistence;
- B9 assignment or curator-path implementation;
- group-corpus membership, ordering or management mutations;
- owner destructive actions;
- unrelated dirty-tree publication.

## Verification and rollback boundary

Required gates include source contracts, Learning Compass tests, Library IA browser
smoke, group-corpus smoke, B8/reader parity, i18n and memory-canon; then desktop RU,
380px RU and HE/RTL, reflow, keyboard/disclosure, sort/filter stability, reload and
no horizontal overflow. Automation is not physical-device evidence.

Rollback is the previous client/SW `3.11.386` and source commit
`8239d0a6ad8dcf28acee3ffd09df21dd1a694d13`. No data rollback is required because
this scope changes no canonical or presentation payload format.
