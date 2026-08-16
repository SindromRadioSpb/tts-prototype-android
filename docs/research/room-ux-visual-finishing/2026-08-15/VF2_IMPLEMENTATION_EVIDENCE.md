# ROOM-UX-VF2 — Reader, Morph and Mentor implementation evidence

> Date: 2026-08-15
> Status: `VF2_CLOSED_OWNER_ACCEPTED`
> Owner acceptance: successful production testing reported on 2026-08-16
> Source commit: `3745d3f5`
> Implementation commits: `60234bae`, production corrections `7cbf49df`, `463c4c0f`, `75cddc27`
> Branch: `main`
> Dirty status: mixed owner worktree; all VF2 runtime targets are committed and unrelated files remain unstaged
> Production URL/version: `https://linguistpro.kolosei.com/library.html` / `3.11.396`
> Evidence classes: repository/code, automated local, isolated automated browser, production public read-back, production open-owner-tab read-only
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

The final release is `3.11.396`. `APP_VERSION`, Room footer and `CACHE_VERSION` advance together. The VF2 assets remain under the byte-accurate URLs introduced by `3.11.394`:

- `/js/library-ui.js?v=394`;
- `/js/mentor-home.js?v=394`;
- `/css/reader-core.css?v=394`;
- `/css/reader-morph.css?v=394` on Room and Studio;
- changed RU/EN/HE locale bytes use `/i18n/locales/{ru,en,he}.js?v=167`.

The exact queried URLs are both precached and integrity-keyed. The server hashes their query-free filesystem path while retaining the query in the cache key. This closes the discovered failure where the `3.11.393` worker cached `/js/library-ui.js?v=393` but tried to verify `/js/library-ui.js`, rejected its own install and left the old shell active.

## 4. Automated evidence

| Gate | Result |
|---|---:|
| VF2 contract | PASS `6/6` |
| Combined VF0/VF1/VF2 + Reader/Morph contracts | PASS `44/44` |
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

## 5. Production corrections and compatibility

The production browser gate found and closed three bounded defects:

1. `3.11.394` aligns the service-worker integrity manifest with the exact cache-busted precache URLs, reports the loaded shell version rather than the server version, watches an already-installing worker and provides a safe network-reload fallback when versions differ.
2. `3.11.395` replaces the static Mentor-view emoji identity with the first-party Mentor mark plus localized text.
3. `3.11.396` removes the remaining emoji from `room.mentor.title` in RU/EN/HE and advances the locale cache key to `167`, so the accessibility tree now exposes `Наставник` / `Mentor` / `מנטור` without an emoji prefix.

- Old host + new Mentor: Unicode fallback remains complete.
- New host + old Mentor: the extra capability is ignored.
- Sprite unavailable: one visible fallback remains; no retry loop or blank icon-only control.
- Old/new SW: `3.11.394 → 3.11.395 → 3.11.396` each surfaced an explicit update prompt in the open owner tab; no automatic activation occurred.
- Rollback: active `75cddc27` plus `463c4c0f`, `7cbf49df` and `2aa29871` images are retained. No data rollback exists or is required.

## 6. Production read-only gate

`VF2 PROD=PASS` is supported by the following evidence:

1. Five consecutive public read-backs converged on API/HTML/SW `3.11.396`; exact locale `?v=167` and VF2 asset URLs were served.
2. The existing owner tab displayed the real Ben-Yehuda catalog (`26,455` works, real public Hebrew titles), SVG enhancement with no visible fallback, localized accessible control names, a three-pixel keyboard focus ring and zero page overflow.
3. Mentor was opened read-only. Its accessibility tree exposes heading `Наставник`, plan and reading actions without emoji-owned names; the mark is SVG and its fallback is `aria-hidden`. No action that writes, invokes a provider or changes learner truth was used.
4. Isolated, non-owner automation passed 380×844 RU and HE/RTL, 640 CSS px at DPR 2 reflow simulation, zero horizontal overflow, no page errors and no non-GET requests. Under `prefers-reduced-motion: reduce`, tested Room controls computed `transition-duration: 0s`, `animation-duration: 0s` and `transform: none`; Reader/Morph reduced-motion rules were present.
5. The owner-tab console contained no error or warning entries. HTTP health was `200`, DB ready, and active container commit `75cddc27` served `3.11.396`.
6. Post-build cleanup removed only unused build cache and six explicitly inventoried old, unreferenced LinguistPro images. It retained the active image plus three rollback images; no container, volume, DB, owner cache or production data was removed. Host disk moved from 89% to 75%; `/healthz` reported 76% and `disk_warn=false`.

The production owner Reader was deliberately not opened: opening a real owner text changes `last_opened`/progress and would violate the read-only gate. Reader/Morph interaction evidence therefore remains the isolated local browser PASS listed above; production proved the served assets, CSS rules and hidden DOM contract without claiming an owner-live Reader interaction.

Do not treat automated viewport or accessibility-tree inspection as physical mobile or assistive-technology evidence. The owner subsequently reported successful production testing on 2026-08-16; this closes the subjective gate without relabelling any automated row as physical-device or assistive-technology evidence.
