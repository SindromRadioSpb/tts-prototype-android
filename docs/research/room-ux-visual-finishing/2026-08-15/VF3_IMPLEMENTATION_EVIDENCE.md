# ROOM-UX-VF3 — Studio shell implementation evidence

> Date: 2026-08-16
> Status: `VF3_CLOSED_OWNER_ACCEPTED`
> Source commit: `48ef83e8`
> Implementation commits: `c1656c0b`, `a71e37a8`
> Branch: `main`; `origin/main` matched the source commit at preflight
> Dirty status: mixed owner worktree; VF3 targets were clean at preflight, scoped changes are listed below, and unrelated files remain unstaged
> Production URL/version: `https://linguistpro.kolosei.com/` and `https://linguistpro.kolosei.com/library.html` / final VF3 `3.11.398`
> Evidence classes: repository/code, automated local, isolated automated browser, production public read-back, connected owner-Chrome read-only
> Limitations: physical mobile, physical 200% zoom, screen reader and other assistive technology are `NOT_RUN`; automation is not physical-device, AT or owner-live evidence

## 1. Authority and boundary

The owner reported successful VF2 production testing on 2026-08-16, so VF2 was closed. The approved `V9=SERIALIZED_VF0_VF3_ALLOWLIST` then left VF3 as the final implementation slice. VF3 is now also owner-accepted; no VF4 implementation was authorized by that decision.

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
| Diff hygiene | PASS; only the VF3 allowlist was staged in each implementation commit; unrelated owner files remained unstaged |

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

## 6. Final production evidence

Commit `a71e37a8` deployed as `3.11.398`. The first cutover sample honestly contained one normal mixed `3.11.397`/`3.11.398` observation followed by four consistent observations. A separate steady-state read-back then returned API, Studio HTML, Room footer and SW `3.11.398` five consecutive times. Health, DB and migrations were ready; disk use was 68% with `disk_warn=false`, so the conditional cache/image-cleanup authority was not needed.

| Production fixture | Result |
|---|---|
| Classic 380×844 RU, reduced motion | zero overflow; 24 SVG; zero fallback; 3 px focus; all VF3 motion `0s`; no page error/non-GET |
| Classic 380×844 HE/RTL, reduced motion | `dir=rtl`; otherwise the same green contract |
| IDE 380×844 RU and HE/RTL, reduced motion | zero overflow; 24 SVG; zero fallback; ten visible named shell controls; all VF3 motion `0s`; no page error/non-GET |
| Desktop RU Classic and IDE, normal motion | zero overflow; 24 SVG; zero fallback; approved `120/140 ms` only; no page error/non-GET |
| HE/RTL 640 CSS px at DPR 2 | zero overflow; 24 SVG; zero fallback; approved `120/140 ms`; automation reflow simulation, not actual browser zoom |

Keyboard-driven focus on 380 RU, 380 HE/RTL and desktop RU produced the expected `3 px` ring after the bounded transition settled. A fresh production service-worker context was controlled by `/sw.js` and had exact hits for `/index.html`, `/library.html`, the sprite and all RU/EN/HE `?v=168` locale URLs in the `3.11.398` precache. This is isolated automation, not physical-device or AT evidence.

The connected Chrome/Kapture read-only smoke found the owner's already-open real Library at `3.11.396` with its expected update banner, real Ben-Yehuda and My Texts surfaces, zero page overflow and no DOM error. It was left at the same URL; the update action, caches and all owner data/presentation keys remained untouched. A separate temporary owner-profile tab loaded Studio/Library `3.11.398`: Studio had 24 hydrated SVGs, zero visible fallback, zero unnamed VF3 shell controls, zero overflow and zero console error/warning; fresh Library exposed the current `3.11.398` footer and both real corpus surfaces. The temporary tab was closed and the owner tab released unchanged. Debug-only fallback lookup messages were present for pre-existing optional editor keys, but no raw key was visible in text, title, label or placeholder.

After the owner clicked the production update, a final real-client Kapture pass observed the same owner Library tab on `3.11.398` with no update banner. Its current real group-corpus URL remained unchanged, horizontal overflow was zero, 188 visible controls had accessible names, 23 sprite uses rendered, keyboard Tab exposed the 3 px focus ring, and console errors/warnings were `0/0`. A temporary tab in the same real profile loaded Studio Classic `3.11.398`: 24 SVG uses, zero fallback, ten named VF3 shell controls, `120/140 ms` motion, zero overflow, zero visible raw i18n keys, OPFS integrity `OK`, console errors/warnings `0/0`, and the required 3 px keyboard focus ring after the transition settled. No material, progress, review, list, provider or presentation value was changed; the temporary tab was closed.

## 7. Compatibility and rollback

- Old HTML/new SW retains the prior complete emoji/text shell.
- New HTML/old SW can use the VF0 sprite; every consumer still has a visible Unicode fallback if the read/validation fails.
- New locale/old HTML remains understandable as text; old locale/new HTML retains hardcoded child-span fallbacks.
- Reduced motion removes transition/animation/transform without changing the end state; forced colors retains icon/currentColor and system outlines.
- Rollback is static: revert the VF3 runtime release, advance the version/SW lock, and serve the prior complete shell. There is no data rollback.

## 8. Owner acceptance and closure

The owner reported exact acceptance `VF3 PROD=PASS` on 2026-08-16. VF3 is `CLOSED_OWNER_ACCEPTED`, and VF0–VF3 are complete. Physical mobile, actual browser-UI 200% zoom and assistive technology remain `NOT_RUN`; they are not inferred from automation or the connected desktop Chrome smoke. No VF4 implementation is authorized by this packet.
