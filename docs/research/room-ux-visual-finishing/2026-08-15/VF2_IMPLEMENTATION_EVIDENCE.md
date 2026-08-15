# ROOM-UX-VF2 — Reader, Morph and Mentor implementation evidence

> Date: 2026-08-15
> Status: `VF2_LOCAL_PASS_DEPLOY_PENDING`
> Source commit: `3745d3f5`
> Implementation commit: `60234bae`
> Branch: `main`
> Dirty status: mixed owner worktree; all VF2 runtime targets were clean at preflight and unrelated files remain unstaged
> Production URL/version: `https://linguistpro.kolosei.com/library.html` / `3.11.392` baseline; `3.11.393` pending
> Evidence classes: repository/code, automated local, isolated automated browser, production baseline
> Limitations: physical mobile, physical 200% zoom, screen reader and other assistive technology are `NOT_RUN`; automation is not physical or owner-live evidence

## 1. Authority and boundary

The owner delegated the production VF1 browser gate and instructed that a passing result be recorded as `VF1 PROD=PASS` before continuing. Release `3.11.392` passed that exact gate in the authorized open owner tab; commit `61f238a6` records closure. VF2 therefore starts serially and does not reopen B0–B8, Library/Corpus ownership, learner truth, canonical writers, recommendation provenance, provider behavior, frozen B9 or `GROUP-CORPUS-CACHE-REVOCATION`.

No schema, migration, data, i18n, provider, recommendation, progress, assignment or telemetry contract changed. Reader table DOM/builders and `public/js/reader-core.js` remain unchanged.

## 2. Exact implementation

### Reader

- `public/css/reader-core.css` maps existing hover, continuity, disclosure and jump transitions to the VF0 `120/140/160/180 ms` tokens.
- TTS and note controls use the shared three-pixel focus ring.
- Reduced motion removes the working pulse and transforms while keeping static audio state, row rails and focus.
- Forced colors retains a system focus outline, audio borders and logical-start row rails.
- Existing action glyphs and builder markup remain parity-locked with Studio; no second table composition was introduced.

### Morph

- `public/css/reader-morph.css` replaces duplicated generic light/dark values with shared `--theme-*` aliases.
- Domain-owned `--ws-*`, `--prov-*`, due and active-word colors remain local.
- The bottom sheet uses the approved 180 ms overlay token; reduced motion opens it without a transform.
- Word, sheet, status, form, root-family, recall and consent controls share a bounded focus/forced-colors contract.
- `morph-host.js`, `reader-morph.js`, status writers and FSRS integrations are unchanged.

### Mentor

- `public/js/library-ui.js` exposes only `host.icon(symbol, fallback, className)`, reusing the validated Room sprite loader.
- `public/js/mentor-home.js` never fetches the sprite. It accepts the host capability, validates the returned element and otherwise renders a visible Unicode fallback.
- Icons are `aria-hidden`; localized text or existing `aria-label` remains the accessible name.
- Mentor identity, plan/read/why and evidence-audio affordances adopt the bounded SVG vocabulary. Existing API reads, explicit POST actions and provider-trigger boundaries remain unchanged.
- Room-local CSS owns Mentor composition, focus, motion, type and semantic state presentation.

## 3. Release and old-client contract

Release `3.11.393` advances `APP_VERSION`, Room footer and `CACHE_VERSION` together. Because VF1 proved that a stale controlling SW can reuse an unchanged static URL, every changed shared asset now has one exact versioned request and precache key:

- `/js/library-ui.js?v=393`;
- `/js/mentor-home.js?v=393`;
- `/css/reader-core.css?v=393`;
- `/css/reader-morph.css?v=393` on Room and Studio.

The service-worker strategy is unchanged. The exact queried URLs are precached, preserving first-install offline availability without duplicating the changed assets under unqueried keys.

## 4. Automated evidence

| Gate | Result |
|---|---:|
| VF2 contract | PASS `6/6` |
| Combined VF0/VF1/VF2 + Reader/Morph contracts | PASS `43/43` |
| RU/EN/HE symmetry, bidi and version lock | PASS `233/233` |
| Reader builder/leaf golden parity | PASS |
| Room audio indicator | PASS unit `2/2`, browser `11/11` |
| Reader karaoke / word karaoke | PASS `9/9`, `18/18` |
| Reader notes | PASS |
| Reader Morph / Studio Morph | PASS / PASS |
| Mentor server boundary | PASS `25/25` |
| B6 isolated browser | PASS `45/45` |
| B7 | PASS `163/163` |
| B8 | PASS; zero `review_log` and RUM writes |
| JS syntax / diff hygiene | PASS |

The first B6 browser attempt ran concurrently with other heavy browser fixtures and timed out at `waitForFunction` before assertions. The isolated rerun passed `45/45`; this is recorded as harness contention, not as a product pass from the failed attempt.

Targeted browser fixtures also confirmed no horizontal overflow at 380 px, non-colour audio labels, Hebrew direction, persisted audio readiness, Reader/Studio Morph writer parity and no page errors.

## 5. Compatibility and rollback

- Old host + new Mentor: Unicode fallback remains complete.
- New host + old Mentor: the extra capability is ignored.
- Sprite unavailable: one visible fallback remains; no retry loop or blank icon-only control.
- Old/new SW: changed HTML URLs cannot hit previous static cache keys; the new precache contains the exact URLs needed offline.
- Rollback: revert the VF2 runtime commit, advance APP/SW version and deploy. No data rollback exists or is required.

## 6. Production gate still required

Before `VF2 PROD=PASS`, deploy serially and verify read-only in the existing authorized production tab:

1. served `3.11.393`, exact asset query URLs and active worker/cache version;
2. Reader on a real Ben-Yehuda text: table parity, keyboard focus, Morph open/close and no write action;
3. Mentor RU and HE/RTL: SVG/fallback, accessible names, state layout, 380 px and no overflow;
4. reduced-motion computed durations and static audio/rail/focus equivalence;
5. console/page errors, health, active commit and rollback image.

Do not treat automated viewport or accessibility-tree inspection as physical mobile or assistive-technology evidence. Final subjective owner review remains a separate handoff after the production read-only gate.
