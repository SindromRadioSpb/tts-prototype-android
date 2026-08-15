# ROOM-UX-VF1 — implementation evidence

> Date: 2026-08-15
> Status: `VF1_PROD_PASS`
> Source commit: `721df7fa`
> Implementation commits: `80e869cd` (VF1), `fe8fa23d` (locale/icon/focus correction), `3745d3f5` (stale-client module URL correction)
> Branch: `main`
> Dirty status: mixed owner worktree; every tracked VF1 target was clean at preflight and unrelated changes were preserved
> Production URL/version: `https://linguistpro.kolosei.com/library.html` / `3.11.392` verified in the open owner tab
> Locale cache query: `166`
> Evidence classes: repository/code, automated tests, isolated automated browser, production read-only, owner-reported
> Limitations: physical mobile, screen reader and other assistive technology are `NOT_RUN`; isolated automation is not owner-live evidence

## 1. Authority and bounded result

The owner accepted VF0 in production with exact `VF0 PROD=PASS`. That closes VF0 and authorizes only serialized VF1: the Reading Room shell, Learning Home (L0), Ben-Yehuda/My Texts/group corpus identity and repeated Room/corpus affordances. VF1 does not change information architecture, corpus ownership, typed rows, learner truth, B0–B8, the closed Library/Corpus successor program, frozen B9, schema, persistence or provider behavior.

The implementation applies the approved **editorial calm, operational clarity** thesis:

- the already-shipped first-party/system SVG sprite progressively enhances visible Unicode fallbacks;
- text remains the primary hierarchy and accessible-name owner;
- RU/EN/HE use the existing UI/editorial font roles, Hebrew metadata and bidi isolation;
- shared state anatomy supplies icon + text + semantic tone while actions and copy remain surface-owned;
- focus, density and continuity use the VF0 contract, including reduced-motion and forced-colors equivalents.

## 2. Exact implementation surface

Runtime adoption is limited to:

- `public/library.html`;
- `public/js/library-ui.js`;
- `public/i18n/locales/ru.js`, `en.js`, `he.js`.

Serialized release-lock changes are limited to:

- `public/index.html`: `APP_VERSION=3.11.392` and locale query `166`;
- `public/sw.js`: `CACHE_VERSION=3.11.392`; no strategy or precache-membership change;
- `tests/i18n.locale-version.lock.json`: locale version/hash lock.

Contract/evidence changes are limited to:

- `tests/visualFinishingRoom.test.js`;
- `tests/visualFoundations.test.js` version expectation;
- `docs/planning/ROOM_UX_VISUAL_FINISHING_VF1_IMPLEMENTATION_PACKET_2026_08_15.md`;
- this evidence file.

No schema, migration, data, API writer, telemetry, recommendation, progress, Finished, bookmark, note, reading-list, review/FSRS, assignment or provider call was added.

## 3. Repository and automated gates

| Gate | Result | Evidence class |
|---|---:|---|
| `node --check public/js/library-ui.js` | PASS | automated local |
| `node --test tests/visualFinishingRoom.test.js tests/visualFoundations.test.js` | PASS 18/18 | automated local |
| `node tests/i18n.smoke.js` | PASS 233/233 | automated local |
| `node scripts/premium/room-b6-scale-resilience-smoke.js` | PASS 45/45 | isolated automated browser |
| `node scripts/premium/room-b7-learning-compass-smoke.js` | PASS 163/163 | isolated automated browser |
| `node scripts/premium/room-b8-reading-journey-smoke.js` | PASS | isolated automated browser |
| B8 write guard | zero `review_log` and RUM writes | isolated automated browser |
| `git diff --check` | PASS | repository |

The broader relevant Node batch previously returned 101/102. Its sole failure is pre-existing harness drift in `tests/roomLibrarySurfaceIa.test.js`: D1 searches for `async function injectBenHomeRails` and `async function injectCorpusRails`, while source commit `721df7fa` already has a synchronous `injectBenHomeRails` and no `injectCorpusRails`. VF1 does not edit that closed IA contract test. All other selected Room, corpus, audio, Reader/Morph, B6, B7 and B8 tests in that batch passed.

## 4. Isolated local browser evidence

Environment: Chrome DevTools automation against `http://127.0.0.1:8791/library.html`; local candidate reports `3.11.390`. This is automation, not a physical device, assistive-technology run or owner-live evidence.

### Desktop RU and real baked corpus fixture

- Direct Ben-Yehuda route loaded the existing baked corpus with 26,455 works.
- 58 adopted icon slots enhanced to the pinned sprite after the same-origin `image/svg+xml` read succeeded.
- The Room, Studio and Mentor marks and repeated search/settings/audio/list/status affordances use quiet SVG; control labels remain localized text.
- Studio, Mentor, sync, theme, language and tabs were traversed by keyboard; every sampled control matched `:focus-visible` and displayed the shared 3 px focus ring.
- Hebrew work titles in the RU shell retained `lang=he`, `dir=rtl` and bidi isolation.
- Observed application requests remained existing GETs plus the static sprite read; no new learner/provider write was introduced.

### 380×844 RU and HE/RTL

- RU: `scrollWidth=clientWidth=380`; no page-level horizontal overflow.
- HE: root `lang=he`, `dir=rtl`; `scrollWidth=clientWidth=380`; no overflow offender.
- HE control names were native and state-specific: `סטודיו`, `מנטור`, `סנכרון`, `ערכת נושא: אוטומטי`.
- Hebrew feature/work headings used the existing Frank Ruhl Libre editorial role and explicit Hebrew direction.
- The current L0 literary tab truncation remains the pre-existing frozen tab behavior; VF1 did not rewrite the tab IA.

### Reflow, long titles and system theme

- A 720 CSS-pixel viewport was used as the automated reflow equivalent of a 1440-pixel desktop at 200%; root `scrollWidth=clientWidth=705` and a transient long Hebrew title wrapped to multiple lines without page overflow.
- This is reflow automation, not a physical 200% owner run.
- At 380×844 with emulated dark system color scheme, the auto theme resolved to the existing dark palette, icons/text remained visible and `scrollWidth=clientWidth=380`. No new dark-theme program was added.

### Motion and accessibility structure

- Parsed CSS exposes VF0 durations of 120/140/160/180 ms with the approved easing.
- The loaded CSSOM contains the reduced-motion override that zeros VF0 motion tokens and removes the bounded VF1 lift transform; static information remains unchanged.
- The accessibility tree exposed a banner, one localized Room heading, named native link/buttons, a named language combobox, a tablist with selection state, main content, headings, regions, links and disclosure buttons.
- SVGs are `aria-hidden`; localized control text/attributes remain the accessible-name source.
- Physical screen-reader and forced-colors user runs remain `NOT_RUN`; source contracts cover forced-colors and status-not-by-color but automation is not represented as AT evidence.

## 5. Old-client/SW and failure compatibility

The icon helper is deliberately fallback-first:

1. HTML/JS emits visible Unicode fallback content.
2. It performs one pinned same-origin `fetch('/icons/linguistpro-ui.svg', { cache: 'force-cache', credentials: 'same-origin' })`.
3. It validates HTTP success and `image/svg+xml` before inserting an `aria-hidden` SVG.
4. Failure returns without retries or UI removal.

In a fresh isolated context, the sprite fetch was intentionally rejected before application startup. The Ben-Yehuda fixture still loaded 16 visible rows; all 58 icon slots remained Unicode fallbacks, `ready=0`, `svg=0`, the localized Room/Studio identity remained visible, and the page had no horizontal overflow. This covers new HTML/JS with an old or missing sprite/SW cache.

A hard offline reload of a cold localhost page without an existing controlling service worker produced Chrome's network error page. This is a harness limitation, not a claim about production offline behavior. A later manual attempt to install a local SW was abandoned after readiness did not resolve; no production cache or owner browser state was touched. Production stale/SW behavior must therefore be checked read-only after deploy, while complete offline/reconnect acceptance remains an owner/device row.

## 6. Evidence classification and remaining gates

- **Code/repository confirmed:** exact allowlist, fallback-first icon enhancement, state anatomy, font/bidi/numeric roles, motion/focus/forced-colors CSS, version/SW lock, zero new writers.
- **Automated local confirmed:** desktop RU corpus fixture, 380 RU and HE/RTL, keyboard focus, accessibility tree, dark/system, reflow equivalent, long title, sprite-failure fallback, B6–B8 regression smokes.
- **Production/open owner tab:** `3.11.392` passed the delegated mutation-safe browser gate.
- **Owner visual acceptance:** VF0 PASS only. The owner delegated the VF1 production-browser gate, which passed with authorized read-only traversal of real My Texts and corpus fixtures; final subjective owner review remains separate.
- **Not run:** physical mobile, physical 200%, VoiceOver/NVDA/JAWS, high-contrast user session, destructive cold-cache/offline test.

Rollback is static: revert the VF1 implementation/evidence commit and advance the release version again. No data or schema rollback exists or is required.

## 7. Production read-only evidence

Implementation commit `80e869cd` was pushed to `origin/main`. The production API remained at `3.11.389` during the first 17 polls and changed to `3.11.390` on the next bounded poll; the smoke began only after the served version advanced.

### Artifact and SW integrity

Direct no-cache reads confirmed:

| Surface | Production SHA-256 = commit bytes | Production SHA-256 = `client-config.shellIntegrity` |
|---|---:|---:|
| `/library.html` | PASS | PASS |
| `/js/library-ui.js` | PASS | PASS |
| `/i18n/locales/ru.js` | PASS | PASS |
| `/i18n/locales/en.js` | PASS | PASS |
| `/i18n/locales/he.js` | PASS | PASS |

The served HTML contains footer `3.11.390` and three locale queries at `166`. The served worker contains `CACHE_VERSION=v3.11.390` and still precaches the VF0 foundations CSS and sprite. The sprite returned `200`, `image/svg+xml`, 5,161 bytes.

### Fresh isolated production client

- Desktop RU loaded the real baked Ben-Yehuda catalog and reported `26 455 работ`.
- Candidate footer was `3.11.390`; all 50 rendered icon slots enhanced successfully, with no visible fallback after sprite confirmation.
- Desktop root `scrollWidth=clientWidth=1440`; 380×844 RU root `scrollWidth=clientWidth=380` with no visible overflow offender.
- 380×844 HE used `lang=he`, `dir=rtl`, native names `סטודיו`, `מנטור`, `סנכרון`, `ערכת נושא: אוטומטי`, Hebrew editorial font roles and no page overflow.
- The production accessibility tree retained the named banner, controls, tablist, navigation, headings, links, regions, disclosures, searchbox, comboboxes and live status.
- All 76 observed startup/corpus requests were GET. No learner, provider or telemetry write was observed.

This is isolated automation, not owner-live, a physical mobile run or assistive-technology evidence.

### Existing owner Kapture tab and real fixtures

Kapture tab `43664135` was inspected read-only. Although its connector listing initially retained the user-provided Ben-Yehuda URL, the live page itself was already at `#room=group%3Astudy-songs-pilot`; VF1 did not navigate or alter that hash.

A normal reload preserved the route and exposed the intended stale-client contract:

- `client-config` and the dynamically stamped footer reported `3.11.390`;
- the controlling SW still served the old shell/locales (`?v=165`), so the page retained old emoji markup;
- the existing connection status explicitly said that an update was loaded and awaited owner confirmation;
- the waiting worker was not activated, no cache was cleared, and no owner presentation key was changed.

The live owner corpus contained 77 authorized group texts and 48 rendered rows in the current view. Read-only LocalDb SELECT APIs confirmed 115 active personal texts in **My Texts**; the first eight metadata rows included both Hebrew and non-Hebrew titles, including a 58-character fixture. Their content and titles were not copied into evidence. The owner was not navigated to My Texts because that could change presentation state, so final My Texts composition remains an explicit owner-review row.

Kapture network monitoring recorded 94 requests, all GET. No owner content, progress, Finished, bookmark, note, reading list, review, group, provider or cache mutation was performed. `review_log` was read once as 7,357 rows only to establish that real state was present; there is no before/after comparison, so this is not claimed as a review-log invariance proof. The isolated B8 gate supplies the zero-write automation evidence.

## 8. Handoff and remaining acceptance

Deployment and automated/read-only production smoke are PASS. Owner acceptance remains separate:

1. accept/apply the update offered in the current Room tab, then confirm footer `3.11.390`;
2. inspect the current real group corpus, Ben-Yehuda and My Texts compositions without changing learner truth;
3. check desktop/380 or the devices the owner actually chooses to run;
4. return exact `VF1 PROD=PASS` or a bounded defect list.

VF1 is accepted as `VF1 PROD=PASS`; the serialized VF2 slice is unlocked.

## 9. Open owner-tab defect and bounded correction

The owner explicitly authorized testing in the already-open production tab and called out real Ben-Yehuda, **My Texts** and corpus fixtures. Mutation-safe traversal found:

- desktop RU Ben-Yehuda: 59/59 rendered icon slots enhanced, no visible fallback, no page overflow and no console error;
- 380×844 RU and HE/RTL Ben-Yehuda: no page overflow, native HE shell names and expected Hebrew editorial font role;
- real **My Texts**: 115 texts, 48 rendered rows, mixed Hebrew/Russian/Latin and long-title fixtures without page overflow;
- real authorized group corpus: 77 texts, 48 rendered rows and no page overflow.

One VF1 defect was reproduced: after the in-page RU→HE locale change, the dynamic due-review CTA retained Russian text. It also retained emoji-only action identity and the browser-default focus outline. The defect is caused by `wireChrome()` repainting disclosure copy but not the separately rendered `_paintDueCTA()` content.

Commit `fe8fa23d` corrects only this existing control:

- the locale handler repaints `_paintDueCTA()`;
- existing RU/EN/HE key `room.morph.study.due` remains the copy owner;
- the count uses `roomNumber()`;
- existing `lp-icon-train` and directional chevron symbols progressively replace visible fallbacks;
- `room-vf1-focus` supplies the shared keyboard focus contract;
- release surfaces advance from `3.11.390` to `3.11.391`; locale bytes/query and SW strategy do not change.

Correction gates: `node --check` PASS; VF/VF0 contracts `18/18`; i18n `233/233`; B6 `45/45`; B7 `163/163`; B8 PASS with zero review-log/RUM writes; `git diff --check` PASS.

The first correction webhook failed because the host root was full and the Coolify PostgreSQL container was in recovery. Bounded infrastructure recovery removed 3.863 GB of unused build cache, then nine exact unreferenced old LinguistPro images while retaining the active image and three newest rollback images, and finally 4.411 GB of newly unreferenced build cache. Root usage fell from 100% to 71% before rebuilds; application data, volumes, active containers and rollback set were preserved. Coolify/PostgreSQL returned healthy. A stale completed deploy record/helper was closed through Coolify's own queue-cleanup commands before the clean deploy retry.

### 3.11.392 stale-client correction

The `3.11.391` owner-tab retest found the shell version stamp updated while the CTA still used the old emoji/Russian module implementation. Served JS already contained the correction; the owner client was controlled by the previous SW and `library.html` still requested the unversioned `/js/library-ui.js`, allowing reuse of the previous precache URL.

Commit `3745d3f5` adds the exact old-client contract test and changes only the Room module URL plus release locks:

- `library.html` requests `/js/library-ui.js?v=392`;
- `APP_VERSION`, Room footer and `CACHE_VERSION` advance together to `3.11.392`;
- the SW still precaches the canonical unqueried module, and no fetch strategy/cache clearing is added.

All local gates remained green: VF/VF0 `18/18`, i18n `233/233`, B6 `45/45`, B7 `163/163`, B8 PASS with zero review-log/RUM writes, and `git diff --check` PASS.

### Final production and open owner-tab gate

- Coolify deployment `1476` finished on commit `3745d3f5`; the active container served `3.11.392`, the versioned module URL and the corrected due-render function. Coolify/PostgreSQL were healthy; root usage was 75% after both rebuilds.
- In the same stale owner tab, a normal client lifecycle (navigate away and return) activated the waiting worker without cache clearing. The returned HTML requested `/js/library-ui.js?v=392`.
- RU, EN and HE produced `К повторению: 231`, `Due: 231` and `לחזרה: 231`; all used two enhanced SVGs. The accessibility snapshot named the control `К повторению: 231` without emoji.
- Keyboard-only Tab traversal reached `#roomDueCta`, which carries the shared `room-vf1-focus` class.
- 380 px RU and HE/RTL screenshots showed the CTA, corpus controls and long real text rows without visible horizontal page overflow or lost actions.
- Real My Texts showed 115 texts and 48 rendered rows; the authorized group showed 77 texts and 48 rendered rows. No text, learner truth, list, review or provider action was opened or written.
- Console history contained no warning/error entry during the gate; existing debug-only empty-i18n-key messages remain non-blocking pre-existing noise.
- The tab was restored to desktop RU at `#room=benyehuda` for owner handoff.

Result: exact `VF1 PROD=PASS`. Physical mobile and assistive-technology rows remain `NOT_RUN` and are not implied by this browser automation.
