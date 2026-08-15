# ROOM Corpus Discovery & Catalog — implementation and release evidence

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-15 |
| Branch | `main` |
| Baseline source commit | `8239d0a6ad8dcf28acee3ffd09df21dd1a694d13` |
| Release commit | Pending scoped commit |
| Baseline production | `https://linguistpro.kolosei.com/library.html`, client/SW `3.11.386` |
| Target client/SW | `3.11.387` |
| Dirty tree | `DIRTY`: 34 pre-existing/unrelated entries at start; none are part of this release |
| Evidence methods | source contracts; Node tests; isolated Playwright automation; rendered screenshot inspection; production health/version preflight |
| Evidence classes | `CODE`; `ISOLATED_AUTOMATION`; `RENDERED_VISUAL`; production/Kapture rows pending deployment |
| Limitations | Automation is not physical-device, assistive-technology, or owner-live evidence. The isolated IA smoke deliberately uses fixture reading-list writes and one fixture word-status capability marker; these never touch the owner profile. |

## Approved contract implemented

The owner-approved order is now consistent across Ben-Yehuda, My Texts and the
protected Study Songs corpus:

```text
corpus identity
Continue / Start hero
optional profile-fit projection (2–4 typed vertical rows)
Catalog heading and scope copy
Search / filters / sorting
bounded Ready or catalog results
Periods / management
```

`Подходит по вашему профилю слов` is a read-only projection over the existing
Learning Compass readers and caches. It excludes the hero item and confirmed
Finished material, carries no assignment semantics, and is absent when there are
fewer than two reliable alternatives. It does not add a recommendation writer,
feed, schema, migration or persistence format.

The catalog region is explicit in the DOM and owns the controls plus the result
list. In Ben-Yehuda, every sort now reorders the visible bounded Ready preview;
sorting no longer activates `readyOnly`, changes result mode, hides profile-fit,
or requires a second Reset action.

## Red-to-green evidence and repairs

1. The new source contract began red on all four assertions: stable Ben sorting,
   bounded profile-fit reader, three-corpus ownership/order and RU/EN/HE copy.
2. The first isolated IA browser run found that Ben profile-fit was started before
   its host was connected to the DOM. The guarded painter therefore returned
   without rendering. The call now occurs after `main.appendChild(wrap)`, with a
   dedicated regression assertion.
3. The first Learning Compass rerun exposed a selector coupled to the retired
   horizontal `.work-card` rail. The smoke now targets the typed vertical
   `.corpus-work-row`; no runtime compatibility shim was added.
4. The first cross-surface source run exposed an outdated direct-`ready.slice`
   assertion. It now verifies the sorted bounded helper. The i18n gate required
   locale cache-bust `164` plus client/SW `3.11.387`; both locks were advanced.

## Local and isolated verification

| Gate | Result |
|---|---|
| `node --check public/js/library-ui.js` | PASS |
| `tests/roomCorpusDiscoveryContract.test.js` | PASS 4/4 |
| `tests/learningCompass.test.js` + Room maturity/contracts | PASS 47/47 |
| Library IA isolated browser smoke | PASS 36/36; `progress=0`, `bookmarks=0`, `review_log=0` before and after |
| Group corpus browser smoke | PASS at 380/510/1280; profile-fit 2 rows; hero excluded; no page overflow |
| Learning Compass browser smoke | PASS 163/163; My Texts profile-fit 4 rows; canonical learner truth unchanged |
| B8 Reading Journey + scale browser smoke | PASS; last-working-position and typed journey unchanged |
| Reader parity | PASS |
| Room media | PASS |
| i18n | PASS 233/233; locale cache-bust lock `164` |
| memory-canon | PASS 79/79 |
| `git diff --check` | PASS |

The IA smoke also proves that changing Ben sorting leaves both profile-fit and
Ready mounted, does not expose a hidden Reset chip, and produces no horizontal
overflow at 380 px HE/RTL. Long result lists remain replacement-windowed at 48
rows; the Ben home preview remains bounded at 12.

## Durable rendered evidence

- [Ben-Yehuda, 380 px HE/RTL](screenshots/ben-380-he-rtl.png)
- [My Texts with reliable profile-fit, 380 px RU](screenshots/mytexts-380-ru-profile-fit.png)
- [My Texts honest one-item/absent-fit state, 380 px HE/RTL](screenshots/mytexts-380-he-rtl.png)
- [Study Songs with profile-fit before catalog, 380 px RU](screenshots/study-songs-380-ru.png)
- [Library/L0, desktop RU](screenshots/library-l0-desktop-ru.png)
- [Library/L0, 380 px HE/RTL](screenshots/library-l0-380-he-rtl.png)

## Truth, persistence and rollback

- Canonical writers added: `NONE`.
- DB/schema/migrations: `NONE`.
- localStorage payload evolution: `NONE`.
- Recommendation or assignment state: `NONE`.
- B9: `NONE`.
- Existing derived Learning Compass cache behavior is reused; no second writer is
  introduced.
- Rollback is the previous source commit
  `8239d0a6ad8dcf28acee3ffd09df21dd1a694d13` and client/SW `3.11.386`.
  No data rollback is required.

## Production and owner-live evidence

Pending scoped commit/push and automatic deployment. Production verification will
be appended after the served version reaches `3.11.387`. Kapture inspection is
strictly read-only for learner truth and destructive controls; presentation-only
route, locale, sort and disclosure checks will be restored to the owner's default
state before handoff.
