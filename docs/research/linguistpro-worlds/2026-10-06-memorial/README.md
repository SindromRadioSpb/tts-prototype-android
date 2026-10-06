# Memorial three scenes integration — 2026-10-06

Source: `E:\World\День памяти\Remember-Three-Scenes-1.0.0.zip`; baseline origin/main `0095bf9508be6a01d973ff7788fdd8c2a4938be1`.
The ZIP contains README-RU.md and CODEX-INTEGRATION-RU.md, but no AGENTS.md. Both instructions were read before implementation. Owner requested production deployment and a new default, overriding the package instruction to keep the previous default.

## Runtime

Native JSON/PNG is copied unchanged into `public/worlds/memorial-three-scenes`. The registry entry matches integration/registry-entry.json. Original PNG SHA-256 is asserted in tests/memorialWorld.test.js. Reference engine/render files were never copied into the app. Current renderer is unchanged; engine has a narrow adapter-before-mount loader for activation and lazy picker previews.

`public/js/memorial-adapter.js` is the required app-owned adapter. Browser acceptance found two issues absent from the package CPU fixture:

- Later world CSS overrode header reservation; increased specificity only for Memorial.
- Current engine's reduced-motion staticPose removed background location props. Adapter restores the original background in the native pose without changing other worlds.

Controls are 44px, with a separate 104px panel; full image aspect 2048:683, maximum width 1152px. No crop, resampling of source files, mascot, sound, reward, network service, or telemetry is added by the world. Day/dusk/night retains original illustration pixels.

The new default is applied once through lp_world_memorial_trial_v1. Later user choices, including Classic, remain authoritative. Scene/manual/auto/pause/countdown persist via lp_memorial_three_v1.

## Activity

`world-activity.js` reads actual Room room-reading state and Studio learn phase, plus existing row speech UI state. It calls LPMemorialAdapter.setActivity symmetrically. Editing focus uses the supplied adapter. Detached row audio, MorphHost and SRS players register existing media through trackMedia; play/pause/ended/error/emptied update a source set. WebAudio sources, system speech and YouTube adapter callbacks publish their actual lifecycle through setAudio(source, boolean), including teardown. There is no second player or pipeline.

## Acceptance

- Final combined suite: 84 native/world/YouTube/speech/shell/cache/TTS/MorphHost tests pass.
- Release correction: 233 i18n smoke assertions and 27 affected release/world tests pass. Production visual review caught the old inline APP_VERSION/footer stamp; both now match final SW 3.11.737.
- Supplied archive adapter tests pass against the final adapter with its isolated reference engine; preview-flow and capture-engine also pass. This is CPU/DOM evidence only. The committed current native engine validates separately.
- Real Chromium matrix: 3 scenes × 3 surfaces × 3 widths (320/380/1280) × RU/HE/EN = 81 cases. Each has screenshot, actual control clicks, pixel comparison against decoded original PNG, image geometry and non-overlap assertions. RTL and live locale change pass. `browser-contact.png` is a contact sheet of actual browser screenshots.
- Keyboard Enter/Space, localized accessible names, 44px button bounds and picker state/geometry pass. Panel text uses #f6e5c0 on #182737; button text #f6e5c0 on #243c50; selected text #182737 on #d9c79e.
- Wall-clock auto >90s and manual >93s pass, without virtual clock. Pause, lighting while paused, reload, dynamic reduced motion, fade teardown and rapid latest-off commands pass.
- Actual Studio editing focus, existing detached row Audio with local WAV fixture, and actual Room text open/Back pass. Fixtures are in disposable browser profiles; no owner profile or paid provider used.
- Native hidden-tab acceptance uses a separately launched ordinary Chromium default context with connectOverCDP(noDefaults:true), avoiding Playwright focus emulation. Hidden tab stops countdown/native movement; return preserves scene without catchup.
- Existing Sukkot/Elections regression is run with the updated default marker; their native assets and current renderer remain unchanged.

Reproduce with scripts/worlds/memorial-browser-smoke.js, memorial-activity-smoke.js, memorial-visibility-smoke.js. AUDIT_BASE selects production; default local URL is recorded by the session's isolated smoke server. SKIP_LONG=1 skips wall-clock waits for bounded reruns; production acceptance uses full waits.

SW release v3.11.737 precaches version-pinned adapter/activity/audio hooks, with matching server shell integrity. Native pack assets use pack-pinned URLs and existing same-origin runtime cache. Existing-client update uses the current guarded SW update flow.

Production 3.11.737 converged at commit 52e05e8c71852b87c8548dc71040dd192fd8b4d0. All 167 served shell/runtime hashes match canonical Git blobs (including the three original PNG hashes). DB/migrations ready. Full final production browser suite passed all 81 matrix cases, nine picker/keyboard cases, real 90s auto / 93s manual holds, pause/lighting/reload/reduced-motion/latest-off checks. Activity suite also checks natural completion of the existing custom row Audio. Ordinary-browser hidden-tab acceptance passes; old production SW profile upgrades through the actual Update control to 3.11.737 with old caches removed and scene/pause preserved.

Evidence: [production.json](production.json), [production-browser.json](production-browser.json), [production-activity.json](production-activity.json), [SW before](sw-before.json), [SW intermediate](sw-intermediate.json), [SW final](sw-final.json), and production PNG screenshots at 320/380/1280px. Browser emulation is not physical-device or screen-reader acceptance.

Only explicitly approved build cache and two exact old unused images (40f9efb72492, 6c3ec82cb8e9) were removed. Current e7f34a59d2c4, immediate rollback 3afe2b515a58, prior 140254db42aa and all four volumes remain. Final root approximately 4G free / 90%; disk_warn=true remains recorded as O-047, independently of successful application acceptance.

Post-release evidence/test-runner refinements are pushed to feat/memorial-three-scenes without triggering another application build; deployed application source remains 52e05e8c on main.
