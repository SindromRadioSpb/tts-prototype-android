# Sukkot road route — production 3.11.714

Date: 2026-10-01. Deployed commit:
`4e84d72e5730c106cf020c351bc5057cc375b168`.
Evidence is automated production/browser verification in disposable contexts,
not owner-profile or physical-device acceptance.

The route is 196 × 46 CSS pixels, below the actors' ground anchor with 6 px
clearance. The next card reserves space for the panel without extending the
canvas or raising the scenery. Controls retain 44 px targets.

Verification:
- 140 served files match the deployed Git commit and shell-integrity hashes.
  Three fresh version/health probes confirm 3.11.714 and DB/migrations ready.
- Production browser smoke: 29 passing scenarios, including explicit route
  geometry checks at 380/768/1280 px in RU/HE/EN, no card/actor overlap, both
  motion settings, route navigation, lighting and lazy picker behavior.
  Command: set `AUDIT_BASE=https://linguistpro.kolosei.com` and run
  `node scripts/worlds/sukkot-browser-smoke.js`.
- A fresh browser is controlled by the service worker with the 3.11.714
  precache/runtime caches. Desktop and Hebrew mobile screenshots were inspected.
- Local world, shell wiring/integrity parity and i18n gates passed (233/233 i18n).

Approved cleanup:
- The user explicitly approved build-cache cleanup and the unused 3.11.711
  image `sha256:d168bbe30074ada822ebab593dbcba5dad976699338ae00be33a8d914e04e220`.
  Container references were rechecked before exact-ID deletion.
- Only that image was removed. Build cache was pruned before deployment and
  again after the build completed. No container, volume, backup or owner-data
  deletion was performed.
- Before cleanup: 97% used / 1.2 GB available. Before deployment: 89% / 4.0 GB.
  After deployment and cache cleanup: host df 93% / 2.9 GB available; health
  telemetry 92%, `disk_warn=true`. O-018 remains open.
- All 12 running containers and 4 volumes remain. The deployed 3.11.714 image
  and retained 3.11.713/3.11.712 images are present. Build cache is zero.

Raw verification, browser results, screenshots and post-cleanup inventory/health
are stored alongside this report. Documentation is pushed to the working branch;
production remains on the deployed commit above.
