# Ulpan Journey — release 3.11.799

Base: `56c5b4de4ef09f4806586895136ff2cb1c7d4312`, fetched again 2026-10-20.
Release checkout: `E:/projects/tts-ulpan-release`; branch `release/ulpan-journey-799`.

Native integration uses the existing world picker, routes, pause, actor buttons and activity bridge across Studio, Reading Room and Mediatheque. Memorial remains the default; explicit choices persist. Pack 1.0.0 contains only JSON and unchanged PNG assets. Attribution is retained in ATTRIBUTION.md.

## Transfer and versioning

Applied the supplied text patch with `git apply --ignore-space-change` (the saved patch used CRLF context). All 31 source files were compared to integration-files.json before release version edits: PNG SHA-256 exact, text identical after CRLF/LF normalization. This manifest describes the incoming candidate, not the final release. Runtime changes carry pins 799, including the changed boot module; locale URL keys are 799 consistently across shells, SW and server integrity manifest. APP_VERSION, SW CACHE_VERSION and Room footer are 3.11.799. package.json retains its independent historical version per server contract.

The source builders and NATIVE_INTEGRATION.md are retained as historical provenance. Their snapshot defaults reference the original workspace and base; do not use them to overwrite a newer main. The acceptance runners in src support ULPAN_NATIVE_ROOT, ULPAN_NATIVE_OUT and ULPAN_NATIVE_BASE.

## Validation before push

- 60 unit checks passed: worldEngine, worldSignLayout, sukkotWorld, memorialWorld, shellIntegrityPrecacheParity, shellModuleWiring, ulpanWorld, staticVersionGuard.
- 35 real Chrome static-shell checks passed, including the 3 surfaces × 2 widths × 3 languages × 7 locations interaction matrix. Screenshots: reports/local.
- API smoke passed. First cold launch exceeded the existing 15-second smoke timeout; immediate retry passed all API boundaries without paid providers.
- reports/backend-local: isolated Node backend, fresh test database, 181 shell-integrity hashes, all pack bytes, actual SW install/activation and the same 35 browser checks passed.
- reports/backend-sw: stale 3.11.798 cache removed on activation, Memorial retained by default, explicit Ulpan choice retained after reload under SW control.
- Initial backend runner queried health before DB startup completed. The runner now waits for readiness; final checks passed without weakening assertions.
- Desktop/mobile screenshots inspected, including compact cinema sign. Physical phone, screen reader and independent linguistic review were not performed.

## Production

Before push: SSH works; root 7.7 GiB free / 79%, health reports 80% with disk_warn=true (threshold 80%), DB/migrations ready. This exceeds the historical 4 GiB single-build allowance. No cleanup performed. Capacity risk remains tracked as O-047; only an independent update in the release checkout was made, without copying the owner's dirty observations log.

Status: **deployed and verified on production**, 2026-10-20, release commit `030f2437e183eaddef093ae5072b0cab4f486843`.

Coolify built and replaced the previous container. Final runtime image: `sha256:e6f072e13bd97ae57e4ca0b292c348a9c13f5e142313f820481e9302e331f5e4`.

Production evidence:

- `reports/production/backend-acceptance.json`: version 3.11.799, healthy DB/migrations, 181 shell hashes compared to exact Git blobs, all 20 world-pack files exact; real Chrome SW installation, old precache removal, Memorial default, explicit Ulpan choice retained across reload.
- `reports/production/matrix/browser-qa.json`: 35 checks passed, zero page errors. All three actual application surfaces, 1280/380 px, RU/EN/HE, seven scenes, tap and Enter, NPC replies, pause/reduced motion, audio bridge, picker, cleanup and return to elections/Memorial/Classic.
- `reports/production/matrix`: 54 screenshots, including 12 unobscured sign screenshots. Both compact signs were visually inspected in production screenshots, including mobile Ulpan and desktop cinema. These are emulated mobile viewport checks, not physical-device acceptance.
- `reports/production/final-convergence.json`: three additional no-cache probes of version, health and seven key asset hashes after the interaction matrix.
- First production comparison exposed a runner EOL mistake for `.mjs`: Windows working-copy CRLF differed from production Git LF; served content matched its server integrity hash. The runner now compares directly to release Git blobs. A separate probe hit the prior version during rolling deployment. Both initial reports are retained; acceptance started again after four consecutive 3.11.799 probes.
- Final SSH disk sample: 4,623,433,728 bytes available (4.31 GiB), `df` 88%; health uses its own sample/accounting and reports 90%, `disk_warn=true`. DB/migrations ready, no cleanup performed. O-047 remains open; further deployments require another capacity preflight.

The release code is in main. Final production evidence and runner refinements are saved on `release/ulpan-journey-799` so saving the report does not trigger another unchanged application build. The root checkout and all its existing owner changes remain untouched.

Reproduce backend acceptance from the checkout root:

```powershell
$env:ULPAN_NATIVE_OUT = '<evidence-directory>'
node docs/research/linguistpro-worlds/2026-10-20-ulpan-release/src/backend_acceptance.cjs
# For production set ULPAN_NATIVE_BASE=https://linguistpro.kolosei.com
```

Production browser checks use disposable anonymous profiles. Existing owner storage is never opened or changed.
