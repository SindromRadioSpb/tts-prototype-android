# Sukkot switch and route contrast — production verification

Date: 2026-10-01. Deployed version: **3.11.713**. Production commit:
`d187804ea5acbc2d78b87895a23970ca950fa5f0`.

Evidence is automated production verification in disposable browser contexts,
without owner account access or physical-device acceptance.

- Reproduced the black stage locally before the fix: remounting an offscreen
  Elections stage as Sukkot retained stale visibility in reduced-motion mode.
  Reset mount visibility and repaint on intersection; the regression now passes.
- Route icons retain full colour on an opaque dark-green pixel panel. Current
  Studio step has an underline; Timsah's location has a filled background.
- `production-verification.json`: 140 served files match the deployed Git
  commit; all server shell-integrity hashes match. Three fresh version/health
  probes report 3.11.713, DB ready and migrations ready.
- `production-browser-results.json`: 24 passing scenarios. Studio, Room and
  Mediatheque; RU/HE/EN at 380/768/1280 px; day/dusk/night; picker persistence,
  pause, Classic, lazy previews and stale-load cancellation. Elections-to-Sukkot
  switch without reload passes with normal and reduced motion, plus mouse and
  keyboard route navigation. Command: `AUDIT_BASE=https://linguistpro.kolosei.com
  node scripts/worlds/sukkot-browser-smoke.js` (set the environment variable
  using the active shell's syntax).
- `production-sw.json` and `production-desktop.png`: a fresh browser is
  controlled by the installed service worker with the 3.11.713 precache/runtime
  caches; Sukkot paints after picker selection and the new route skin is served.
- Local release gates passed: world contracts, shell wiring/integrity parity
  and i18n (233/233).

Rollout converged to a single running application container using the above
commit. Existing capacity concern O-018 remains open: peak 99%, then 97% disk
used / 1.2 GB free; `disk_warn=true`. No cleanup was performed.
