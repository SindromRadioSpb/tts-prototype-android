# ROOM-UX-VF1 — Room shell, L0 and corpora implementation packet

> Date: 2026-08-15
> Status: `VF1_CORRECTION_DEPLOY_PENDING`
> Source commit: `721df7fa`
> Branch: `main`
> Dirty status: mixed owner worktree; every tracked VF1 target was clean at preflight
> Implementation commits: `80e869cd` (VF1), `fe8fa23d` (bounded owner-browser correction)
> Production: `https://linguistpro.kolosei.com/library.html` / `3.11.390` baseline verified; `3.11.391` correction pending
> Evidence classes: repository/code, automated local browser, production read-only, owner-reported
> Limitations: physical mobile and assistive technology are `NOT_RUN`; automation must not be represented as either

## 1. Authority and predecessor gate

The owner approved the complete ROOM-UX-VF recommendation set with `Рекомендации утверждаю. Стартуй`. VF0 was deployed, verified read-only in production, and separately accepted by the owner as exact `VF0 PROD=PASS`. That acceptance closes VF0 and unlocks only the next serialized slice, VF1.

The approved values remain:

```text
V1=B_EDITORIAL_CALM;
V2=VENDORED_SVG_PLUS_FIRST_PARTY_MARKS;
V3=EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES;
V4=SEMANTIC_STATUS_TOKENS_V1;
V5=BOUNDED_EDITORIAL_DENSITY;
V6=MOTION_0_120_140_160_180;
V7=SHARED_STATE_ANATOMY_LOCAL_ACTIONS;
V8=FOUNDATIONS_SHARED_COMPONENTS_LOCAL;
V9=SERIALIZED_VF0_VF3_ALLOWLIST;
V10=VERSION_SW_LOCK_AND_VISUAL_ROLLBACK;
SCOPE=BOUNDED_VISUAL_FINISHING_ONLY;
```

## 2. VF1 visual thesis

VF1 applies **editorial calm, operational clarity** to the Reading Room shell, Learning Home and corpus surfaces. Text carries hierarchy; first-party marks identify Room/Studio/Mentor; quiet line SVGs identify repeated actions and operational states. Existing warm composition, vertical rows, information architecture, filters, learner truth and every writer stay unchanged.

## 3. Exact allowlist

### Runtime adoption

- `public/library.html`
- `public/js/library-ui.js`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`

### Serialized release lock required by V10

- `public/index.html` — `APP_VERSION` and the three locale query versions only
- `public/sw.js` — `CACHE_VERSION` only; the VF0 CSS/SVG precache entries remain unchanged

### Contracts and evidence

- `tests/visualFinishingRoom.test.js`
- `tests/visualFoundations.test.js` — expected version only
- `tests/i18n.locale-version.lock.json` — exact locale hash/version lock
- this packet
- `docs/research/room-ux-visual-finishing/2026-08-15/VF1_IMPLEMENTATION_EVIDENCE.md`
- bounded screenshots/evidence under the existing research directory when produced

Anything else is out of scope and stops the slice.

## 4. Exact component adoption

1. Room header and footer Studio identity, Mentor, sync, theme and modal-close controls.
2. L0 Today actions, journey bookmark/finished/note controls and corpus doors.
3. Ben-Yehuda, My Texts and authorized-group corpus identity in the existing shell and switcher.
4. Repeated Room/corpus search, settings, audio, reviewed, reading-list and global state affordances where an allowlisted VF0 symbol exists.
5. RU/EN/HE UI and editorial font roles, Hebrew `lang` + `dir`, bidi isolation for mixed owner/corpus titles, app-locale numeric formatting.
6. Existing focusable controls opt into the shared focus contract without changing DOM order or keyboard behavior.
7. Existing hover/disclosure continuity adopts the approved duration/easing tokens; no animation communicates truth.
8. Existing generic Room states adopt shared visual anatomy while the existing state keys, calls and surface actions remain authoritative.

Rare specialist/decorative emoji, Reader/Morph/Trainer/Mentor content and Studio content remain backlog or later serialized slices.

## 5. Compatibility contract

- Icons are progressively enhanced from a visible Unicode fallback only after the same-origin, inert VF0 sprite is confirmed available.
- Old HTML + new JS remains usable because JS can rebuild a named control from its fallback.
- New HTML + old JS remains usable because every static icon slot contains visible fallback text; legacy theme JS may replace the theme slot with its existing glyph.
- A missing/old SW cannot blank a control. Failure keeps fallback visible and performs no retry loop.
- Icon SVG is always `aria-hidden`; the native control or adjacent localized text owns the accessible name.
- Locale cache query advances once because RU/EN/HE source changes.
- Rollback is static: revert this slice and its version lock; there is no schema/data rollback.

## 6. Frozen behavior and stop list

VF1 must not change:

- B0–B8, Library/Corpus successor behavior, Audio/TTS parity or frozen B9;
- Room/L0 versus corpus-local ownership, typed rows, preview bounds, disclosure persistence or presentation keys;
- recommendation, familiarity, progress, Finished, bookmark, note, reading-list, review/FSRS, group or provider truth;
- any database, localStorage/OPFS/IndexedDB, API mutation, telemetry, provider or cache-clearing behavior;
- Reader/Morph/Trainer/Mentor-content or Studio composition;
- service-worker strategies, precache membership or schema.

## 7. Red-to-green gates

1. Target preflight is clean and unrelated dirty files are preserved.
2. The red contract fails before runtime adoption and passes afterward.
3. Header names remain localized in RU/EN/HE; decorative icons are silent.
4. Sprite failure leaves a visible Unicode fallback; enhancement uses only the pinned same-origin asset.
5. State anatomy distinguishes neutral/info/warning/error visually and by icon + text, without focus theft or new actions.
6. 380×844 RU and HE/RTL, desktop RU/EN/HE, 200% reflow and long mixed titles have no page overflow.
7. Keyboard focus is visible; DOM/ARIA roles and names remain correct.
8. Light/dark/auto, reduced motion and forced colors preserve equivalent static information.
9. Existing Room B6/B7/B8, i18n, Reader parity and relevant corpus tests remain green.
10. Versions lock to `3.11.391`; locales remain at `?v=166` because the correction does not change locale bytes.
11. Production deploy is serialized, then API/footer/SW/assets and real owner fixtures are inspected read-only.
12. Owner acceptance is a separate final gate; physical/AT evidence remains explicit.

## 8. Role synthesis

- **R4/R5/R7:** preserve the editorial L0 thesis and vertical scan; reduce multicolor UI noise.
- **R6:** explicit Hebrew font, language, direction and bidi isolation; localized control names.
- **R8/R17:** states remain truthful and actions stay user-initiated.
- **R11/R15:** progressive enhancement, exact allowlist and static rollback contain compatibility risk.
- **R14:** the only new request is a static same-origin sprite read; no learner/provider/network write.
- **R16:** use the already-shipped sprite/fonts and a single locale/SW version step.

## 9. Handoff condition

After local gates, commit/push/deploy and production read-only smoke, stop and hand VF1 to the owner. The owner subsequently delegated browser acceptance with: test the open production tab, fix any defects, and if none remain record `VF1 PROD=PASS` and start the next slice. VF2 therefore remains blocked until the `3.11.391` correction passes that delegated production-browser gate.

## 10. Owner-browser correction

The open owner production tab exposed one bounded VF1 defect on the real due-review CTA:

- changing RU to HE correctly changed the document language/direction, but the already-rendered dynamic CTA retained its Russian label;
- the CTA still used emoji identity and the browser-default focus outline instead of the adopted VF1 SVG/focus contract.

The correction is limited to the existing VF1 shell allowlist. Locale change now repaints the CTA; its label remains sourced from the existing `room.morph.study.due` RU/EN/HE key, its count uses the existing localized number formatter, and its train/directional affordances use the already-shipped sprite with visible fallbacks. No locale file, writer, persistence key, API or SW strategy changes.

Local correction gates are green: VF contracts `18/18`, i18n `233/233`, B6 `45/45`, B7 `163/163`, and B8 PASS with zero review-log/RUM writes. Production acceptance remains pending until served version `3.11.391` and the same real CTA pass RU/EN/HE, focus and 380 px checks in the open owner tab.
