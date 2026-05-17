# P2 Polish Backlog

> Status: **in progress** (v3.7 milestone)
> P0 + P1 shipped as `03f573f` (v3.6). These are cosmetic/UX items — no data model or API changes.

## P2-1 — Modal open animations

**What:** Smooth 150ms fade-in + scale-up on all modal overlays.
**Why:** Modals appear instantly today (bare `classList.remove("hidden")`), which feels abrupt.
**How:** Pure CSS — `@keyframes v3ModalIn` applied to `.v3-modal:not(.hidden)` and `[id$="Modal"]:not(.hidden)`. Respects `prefers-reduced-motion`.
**Status:** Done (v3.7)

---

## P2-2 — Accessibility: remaining icon-button aria-label gaps

**What:** Audit all `<button>` elements that are icon-only (no visible text) and verify each has a non-empty `aria-label` or `title`.
**Why:** 39 `data-i18n-aria-label` + 75 `data-i18n-title` instances already exist (v3.6), but a secondary audit may reveal stragglers in the library action bar, dashboard controls, and notes toolbar.
**How:** Add `data-i18n-aria-label="<key>"` where a suitable i18n key exists; add keys to all 3 locales only if necessary.
**Status:** Done (v3.7)

---

## P2-3 — Loading skeleton / spinner for "Собрать таблицу" and TTS

**What:** Show a themed shimmer skeleton while the table is being built and a spinner on the TTS Generate button during the audio fetch.
**Why:** Both operations can take 3–10 s with no visual feedback today.
**CSS:** `.v3-skeleton-pulse` with `background: linear-gradient(90deg, var(--theme-bg-card) 25%, var(--theme-border-soft) 50%, var(--theme-bg-card) 75%); background-size: 200%; animation: v3SkeletonSlide 1.2s infinite;`
**Status:** Done (v3.7)

---

## P2-4 — First-run onboarding tour

**What:** A dismissible 3-step modal tour shown once per browser-origin on first visit. Gated by `localStorage["v3OnboardingSeenV1"]`.
**Why:** New users have no guidance; the app has a non-obvious multi-panel layout.
**Steps:** (1) Welcome — what the app does, (2) Build your first table — input field, (3) Save to Library — Library icon. "Next" / "Got it" buttons; "Reset onboarding" in About/Settings.
**i18n:** All keys already exist (`onboarding.title`, `onboarding.tagline`, `onboarding.intro`, `onboarding.feature1–5`, `onboarding.demo`, `onboarding.reset`) in RU/EN/HE.
**Gate:** Skip in follower-tab mode (`window.__localDBFollower`).
**Status:** Done (v3.7)

---

## P2-5 — Research modal aggregate list

**What:** The Research consent/join modal should display a concrete bullet list of collected data types using `research.transparency.*` i18n keys.
**Why:** The current modal is text-only; users cannot see at a glance what is collected before consenting.
**How:** Add a `<ul>` of bullets in the modal body — purely additive, no backend changes.
**Status:** Done (v3.7)

---

## P2-6 — Terminology consistency audit

**What:** Confirm all `library.*` i18n keys are consistent across RU/EN/HE and that no hardcoded English "Library" strings appear in Russian-locale JS-rendered contexts.
**Why:** Dual branding "Библиотека" (classic) / "Library" (IDE) is intentional, but ad-hoc hardcoded strings bypass translation.
**Status:** Done (v3.7)

---

## P2-7 (external) — HE translate-review sign-off

**What:** Remove `// translate-review` markers from `public/i18n/locales/he.js` after a native Hebrew / ulpan-teacher review.
**Current markers:** Lines 3, 29, 187, 254, 784, 1401-1402.
**Blocked on:** Native speaker review (per Direction 11 plan §9.3 and `docs/HE_CONSENT_REVIEW_BRIEF.md`).
**Action:** Schedule review session with ulpan teacher before real-cohort research launch.
**Status:** Blocked — external dependency

---

## Future (P3 / not scoped)

- Full aria-live regions for dynamic content (library list, SRS card flip)
- Spotlight-style onboarding with element anchoring (requires more complex JS)
- Skeleton placeholders for Library list items on initial load
- Animation exit transitions (fade-out on modal close)
- First-run flow for Research mode specifically
