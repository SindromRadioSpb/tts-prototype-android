# ROOM-UX-VF1 — implementation evidence

> Date: 2026-08-15
> Status: `VF1_LOCAL_GATES_PASS_DEPLOY_PENDING`
> Source commit: `721df7fa`
> Branch: `main`
> Dirty status: mixed owner worktree; every tracked VF1 target was clean at preflight and unrelated changes were preserved
> Production URL/version at local gate: `https://linguistpro.kolosei.com/library.html` / `3.11.389`
> Candidate version: `3.11.390`; locale cache query: `166`
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

- `public/index.html`: `APP_VERSION=3.11.390` and locale query `166`;
- `public/sw.js`: `CACHE_VERSION=3.11.390`; no strategy or precache-membership change;
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
- **Production read-only:** pending deployment of `3.11.390`.
- **Owner-live:** VF0 PASS only. VF1 owner review is pending; real owner My Texts visual composition must be checked by the owner or in a separately authorized mutation-safe flow because navigating the owner tab may change presentation state.
- **Not run:** physical mobile, physical 200%, VoiceOver/NVDA/JAWS, high-contrast user session, destructive cold-cache/offline test.

Rollback is static: revert the VF1 implementation/evidence commit and advance the release version again. No data or schema rollback exists or is required.

## 7. Production evidence placeholder

After the scoped commit is pushed and auto-deploy completes, record here:

- deployed commit and served `client-config` version;
- footer/SW/HTML/JS/locale integrity;
- isolated production desktop/380 RU/HE smoke;
- Kapture read-only evidence on the already-open real Ben-Yehuda owner fixture;
- console/network limitations and the exact owner-review handoff state.

Do not mark VF1 owner-accepted or begin VF2 from automated production evidence.
