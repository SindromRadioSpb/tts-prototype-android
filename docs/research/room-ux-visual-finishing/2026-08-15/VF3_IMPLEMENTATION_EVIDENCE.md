# ROOM-UX-VF3 — Studio shell implementation evidence

> Date: 2026-08-16
> Status: `VF3_PROD_CORRECTION_LOCAL_GREEN`
> Source commit: `48ef83e8`
> Implementation commits: `c1656c0b`; bounded motion correction pending
> Branch: `main`; `origin/main` matched the source commit at preflight
> Dirty status: mixed owner worktree; VF3 targets were clean at preflight, scoped changes are listed below, and unrelated files remain unstaged
> Production URL/version: `https://linguistpro.kolosei.com/` and `https://linguistpro.kolosei.com/library.html` / initial VF3 `3.11.397`; final correction `3.11.398` pending
> Evidence classes: repository/code, automated local, isolated automated browser, production public read-back; final open-owner-tab read-only is pending
> Limitations: physical mobile, physical 200% zoom, screen reader and other assistive technology are `NOT_RUN`; automation is not physical-device, AT or owner-live evidence

## 1. Authority and boundary

The owner reported successful VF2 production testing on 2026-08-16, so VF2 is closed. The approved `V9=SERIALIZED_VF0_VF3_ALLOWLIST` leaves VF3 as the only remaining implementation slice; no VF4 is authorized.

VF3 changes the existing Studio Classic/IDE shell presentation only. It does not change a workflow, table builder, import/media path, ASR/MT/provider call, storage key, learner truth, review writer, schema, migration, telemetry, B0–B9, Library/Corpus ownership or `GROUP-CORPUS-CACHE-REVOCATION`.

## 2. Exact implementation

- Existing Classic and IDE identity/navigation controls use the already-vendored bounded sprite through one fallback-first same-origin static GET.
- The helper validates the sprite response before replacing Unicode fallbacks, caches one promise, does not retry and has no data/provider/storage authority.
- Native controls retain localized visible text or localized accessible names; SVG and fallbacks are `aria-hidden`.
- Studio shell labels with separate icons are emoji-free and symmetric in RU/EN/HE.
- Existing buttons, language selectors and IDE mobile tabs adopt shared focus, motion, reduced-motion and forced-colors presentation.
- Existing next-step and unified-review writers remain canonical; `data-kind` is presentation-only.
- Final `APP_VERSION`, Room footer and SW cache advance together to `3.11.398`; locale bytes remain at `?v=168`, with the same keys in HTML, SW, integrity manifest and i18n lock.

## 3. Red/green and broad automated evidence

| Gate | Result |
|---|---:|
| VF3 pre-implementation contract | RED as intended: `1/7` pass, `6/7` fail |
| VF3 post-implementation contract | PASS `7/7` |
| Combined VF0–VF3 contracts | PASS `32/32` |
| RU/EN/HE symmetry, bidi and version lock | PASS `233/233` |
| Studio UX maturity unit + isolated browser | PASS `9/9`, `92/92` |
| Studio ↔ Room unified review | PASS `49/49`; opening/closing read-only appended zero `review_log` rows |
| Studio Morph | PASS |
| Reader builder/leaf golden parity | PASS |
| Ingest security/shape smoke | PASS |
| Long Studio chunk flow | PASS all scenarios |
| OPFS coverage/repair/reload contract | PASS unit `13/13` plus isolated browser |
| Diff hygiene | pending final pre-commit read-back |

The broad chunk gate initially failed at scenario 2a because its old assumption treated reload as a clean test boundary. The exact failure reproduced on untouched source commit `48ef83e8`: the product correctly restored the preceding completed OPFS journal and made zero duplicate provider calls. The verification-only fix clears the smoke-owned durable journal between independent scenarios, preserves the same-page resume scenario, and updates its expectations to the current coverage-gated contract. The corrected chunk smoke and the independent product-resume browser gate both pass.

## 4. Isolated visual/browser evidence

Fresh, non-owner Playwright Chromium contexts loaded local `3.11.397` with service workers blocked and reduced motion enabled.

| Fixture | Result |
|---|---|
| 380×844 RU/LTR | `overflow=0`; 24 SVG slots hydrated; 0 fallbacks left after success; keyboard focus visible; no page errors |
| 380×844 HE/RTL | `dir=rtl`; `overflow=0`; 24 SVG slots hydrated; 0 fallbacks left after success; no page errors |
| 1440×1000 RU/LTR | `overflow=0`; 24 SVG slots hydrated; 0 fallbacks left after success; no page errors |

The captures are indexed in `screenshots/README.md`. They prove automated layout and computed DOM state only, not physical mobile, actual browser-UI 200% zoom or assistive-technology behavior.

## 5. Initial production finding and bounded correction

Commit `c1656c0b` deployed as `3.11.397`. Five consecutive public read-backs converged on API/HTML/Room/SW `3.11.397`; RU/EN/HE locale assets and the sprite were byte-identical to the commit, with health/DB/migrations green.

Fresh production Classic automation passed at 380×844 RU, 380×844 HE/RTL and 1440×1000 RU: zero overflow, 24 hydrated SVG slots, visible three-pixel focus, reduced-motion `0s`, no page errors and no non-GET requests. The subsequent IDE-mode smoke exposed one bounded visual defect: `.v3-ide-header .btn-ide` had greater specificity than the generic VF3 selector and retained legacy `150 ms` motion.

The correction adds only a later shell-scoped selector; no component/workflow/data behavior changes. Local `3.11.398` computes exactly `120/120/120/140/140 ms` for both Classic and IDE shell controls, and `0/0/0/0/0 ms` under reduced motion. Combined VF contracts remain `32/32`, i18n `233/233`, and Studio UX `92/92`.

## 6. Compatibility and rollback

- Old HTML/new SW retains the prior complete emoji/text shell.
- New HTML/old SW can use the VF0 sprite; every consumer still has a visible Unicode fallback if the read/validation fails.
- New locale/old HTML remains understandable as text; old locale/new HTML retains hardcoded child-span fallbacks.
- Reduced motion removes transition/animation/transform without changing the end state; forced colors retains icon/currentColor and system outlines.
- Rollback is static: revert the VF3 runtime release, advance the version/SW lock, and serve the prior complete shell. There is no data rollback.

## 7. Pending release evidence

Before this record can become `VF3_PROD_PASS_HANDOFF`, VF3 still requires the scoped correction commit/push, converged API/HTML/SW `3.11.398`, a fresh isolated production motion smoke, and an open owner-tab read-only smoke. No owner content, progress, Finished, bookmark, note, reading list, review, presentation key, provider setting or cache may be mutated.
