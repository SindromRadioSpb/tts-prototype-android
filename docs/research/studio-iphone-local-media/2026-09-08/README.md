# Production qualification page for iPhone + Chrome

Review `/iphone-media-check.html` in Chrome on the owner's iPhone.
It provides the App Store link, immutable ZIP, setup commands, native preflight,
rights-aware audio/video commands, Chrome return and manual file import instructions.
It does not claim physical-device acceptance or change the main importer.

Source baseline: `f9b8eb95` (main 3.11.488). Release candidate: 3.11.490.
Probe artifact source: feature commit `78dd8996`, SHA-256
`0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282`.
Source archive: `public/downloads/linguistpro-iphone-probe-0744253a.zip`.
Do not edit this generated ZIP; its build source lives on the feature branch.

## Evidence

`local/` and `production/`: generated browser reports and inspected screenshots.
They are desktop browser QA, **not iPhone-native or owner acceptance**. Source/rights
entries in UI tests are fixtures; no test commands are executed in a-Shell and no source
media is fetched by the browser harness. The ZIP itself is downloaded and SHA-verified.

Reproduce against a local isolated server on port 3298:

```powershell
node --test tests/iphoneMediaCheck.test.js
node scripts/premium/iphone-media-check-browser-smoke.js
npm test
npm run test:api-smoke
npm run smoke:ingest
```

Live, read-only page/download verification (isolated browser):

```powershell
$env:LP_IPHONE_CHECK_BASE='https://linguistpro.kolosei.com'
node scripts/premium/iphone-media-check-browser-smoke.js
```

Published v3.11.490, code/main/image `97dee98f`. Live hashes and release checks:
[production/RELEASE_VERIFIED.md](production/RELEASE_VERIFIED.md).
Evidence-only closure is on the release branch; main/deployed code remain `97dee98f`.
Canon: `docs/planning/STUDIO_IPHONE_CHECK_RELEASE_2026_09_08.md`.
