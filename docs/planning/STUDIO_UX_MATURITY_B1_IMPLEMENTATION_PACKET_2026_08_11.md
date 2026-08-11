# Studio UX Maturity — B1 implementation packet

Date: 2026-08-11

Owner decision: option **B** approved on 2026-08-11; this packet authorizes **B1 only**.

Source commit: `e08fbd9990cd6fb804abb498de842e0287243b54`

Production baseline: application/cache `v3.11.344`, DB migrations `48`.

## Objective

Make the current Studio path self-explanatory without replacing its canonical data or the closed P2/P3/P4 contracts. B1 adds a truthful source/status view, one recommended next action, modal focus safety, keyboard-operable file intake, honest draft wording and bounded mobile/RTL/a11y polish.

The temporary user term for browser-local, unpromoted workspaces is **Drafts / Черновики / טיוטות**. It is deliberately distinct from Import Center materials and may be revisited only in B3.

## In scope

1. Derive the visible source label from the current text-bound import passport or the existing exact media-context resolver.
2. Present one visually primary next-step control for the current phase: add material, build/rebuild the table, save, or open the saved material lifecycle.
3. Preserve all existing expert actions as secondary controls.
4. Trap focus in Add Material, support Escape, make its background inert, and return focus to the invoker.
5. Replace non-focusable label-based media/subtitle pickers with real buttons while retaining the same hidden file inputs and handlers.
6. Rename the local workspace count to Drafts and route it to the existing Add Material continuation shelf; keep Import Center separately and honestly named.
7. Fix the evidenced dark-theme navigation contrast, the MT accessible-name mismatch, the missing visible main landmark, and core mixed-language composed status strings.
8. Verify desktop RU and 380px RU/HE, keyboard, focus, overflow, tap targets, and source/status state transitions.

## Out of scope

- No P2/P3/P4 redesign, schema/store/table, catalog merge, provider-default or fallback change.
- No Reading Room redesign or new transition contract.
- No automatic ASR, translation, promotion, timing interpolation or mass rebinding.
- No YouTube downloader/acquisition replacement.
- No shared component extraction and no master-roadmap update.
- No production deploy and no claim of iPhone owner-live PASS.

## File allowlist

- `package.json`
- `public/index.html`
- `public/sw.js`
- `public/js/studio-import.js`
- `public/js/studio-media-package.js`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`
- `tests/i18n.locale-version.lock.json`
- `tests/i18n.smoke.js`
- `tests/studioUxMaturity.test.js`
- `scripts/premium/studio-ux-maturity-browser-smoke.js`
- `docs/planning/STUDIO_UX_MATURITY_B1_IMPLEMENTATION_PACKET_2026_08_11.md`

## Shared-file stop list

- `public/js/import-center-core.js`
- `public/js/studio-portable-learning-package.js`
- `public/js/media-host.js`
- `public/js/media-readiness.js`
- `public/js/local-asr-client.js`
- `public/js/local-asr-normalizer.js`
- `public/js/local-asr-onboarding.js`
- `public/library.html`
- `public/db/**`, `db/**`, `ingest/**`, `media-acquisition/**`
- `server.js`, `migrations/**`
- master Studio roadmaps

Stop and return to the owner if implementation needs any file above, changes the meaning of canonical save/read-back, introduces a second list/source of truth, or changes provider/acquisition defaults.

## State and data constraints

- Source/status is a read-only projection. It must perform no save, ASR, translation, bind, migration or network action.
- An import passport is valid only while its normalized `textSnapshot` exactly matches the current composer text.
- Cold restoration may reuse the existing exact `v3ResolveMediaContext()` path; no heuristic text matching or derived timing is allowed.
- Canonical save success remains separate from optional-cache failure; completed writes must never be presented as needing repetition.
- Draft count comes from the existing workspace repository. Import Center remains the P4 lifecycle surface for promoted/saved materials.

## Red-to-green gates

1. Static/unit contract test: source passport exactness, event-driven resync, single next-step control, Draft terminology/routing, modal focus contract, button-based file pickers, main landmark and locale keys.
2. Existing i18n smoke and locale-version lock.
3. Existing Studio unit/regression suites touching import, media package, save/read-back and Import Center.
4. Browser smoke at desktop RU, 380x844 RU and 380x844 HE/RTL; light/dark where supported.
5. Browser assertions: one visible primary recommendation, no horizontal overflow, minimum 44px targets (48px primary), modal Tab containment/Escape/focus return, current-language strings and correct source transitions.
6. Git proof: only allowlisted files staged; stop-list and owner-dirty files unchanged.
7. Production proof: served revision/version unchanged; no push/deploy.

## Acceptance criteria

- Manual text, article/file import, captions/media import, cache and Library restoration never receive a false source label.
- Each core phase has exactly one visually primary recommended action and all pre-existing actions remain reachable.
- Add Material contains keyboard focus, closes with Escape/backdrop, and returns focus to its invoker.
- Media and subtitle file selection is keyboard-operable with native buttons.
- `Черновики N` opens the continuation shelf where the counted draft is visible; Import Center is not presented as that draft list.
- At 380px RU and HE/RTL there is no page/dialog horizontal overflow; primary control height is at least 48px and other tested targets are at least 44px.
- Dark navigation labels meet WCAG AA contrast and the MT control's accessible name contains its visible label.
- One visible `main` landmark exists in the classic Studio surface.
- Application code, data/schema, versions, production configuration and production revision are unchanged except for the separately required static asset version bump after all gates pass.

## Owner-live pending after the commit

On the owner's iPhone: open/close/focus-return with the software keyboard, choose downloaded media after returning from Downr, cancel midway, background/foreground recovery, 380-ish portrait RU and HE/RTL, and successful save/reopen. Automation is supporting evidence only and must not be called owner-live PASS.

## Implementation result

Status: implemented locally; not pushed or deployed. Local application/cache version is `v3.11.345`; public production was re-read after implementation and remains `v3.11.344` with healthy DB/migrations.

Delivered:

- one phase-derived primary CTA (`add`, `correct`, `table`, `save`, `library`) while the existing controls remain available as secondary actions;
- exact-text-gated source projection for article/file, YouTube captions, subtitle file, device media, cache and Library;
- Add Material focus containment, inert background, Escape/backdrop close and focus return;
- native keyboard-operable media/subtitle picker buttons;
- temporary Drafts terminology and routing to the existing continuation shelf, with Import Center separately named;
- RU/EN/HE dynamic strings, visible classic `main`, MT accessible name, dark navigation/footer contrast and 48px key targets;
- locale cache-bust `140` and application/service-worker cache version `v3.11.345`.

Verification evidence:

- `npm run smoke:i18n`: **233/233 PASS**;
- `npm run smoke:studio-ux-maturity`: static contracts **6/6 PASS**, browser desktop RU + 380 RU/HE dark **58/58 PASS**;
- Studio/media/save/provider regression selection: **113/113 PASS**;
- Import Center/portable canon/security plus Reading Room morphology boundary: **65/65 PASS**;
- existing Downr handoff browser smoke: **27/27 PASS**;
- Chrome DevTools 380x844 HE/RTL dark: `overflow=0`, CTA `48px`, one visible `main`; Lighthouse clean main surface Accessibility/Best Practices/SEO/Agentic Browsing **100/100/100/100**.

Two broader static suites contain assertions already false at source commit `e08fbd99` (`btnTableCustomizeToggle` in `classicModeRedesign.test.js`, `studio-exact-binding` in `portableLearningPackageUi.test.js`). Neither marker existed at the B1 baseline, neither file is in this slice, and the relevant live replacement contracts are covered by the green gates above.

Remaining gates:

- owner-live iPhone scenarios listed above;
- explicit owner approval before any B2-B5 implementation;
- separate deploy authorization. No production mutation occurred in B1.
