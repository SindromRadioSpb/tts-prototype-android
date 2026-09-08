# Release verification — iPhone preview fix

2026-09-08, approximately 10:44–10:47 UTC. **DEPLOYED_TECHNICAL_PASS**.

Production: https://linguistpro.kolosei.com/download-media.html
Version: **3.11.493**, locale cache version **211**.
Code commit: `756555be6a89f7a9013bf7c647d433b4a00bd87a`.
At verification, local `main`, `origin/main` and remote `main` matched this hash.
Read-only Docker inventory confirmed the app image tagged with this exact hash;
the existing media-acquisition worker remained on its prior image, healthy.

## Verified

- `/healthz` and client config recovered to HTTP 200; application, DB and
  migrations ready; repeated client config returned 3.11.493.
- All 11 files in [production/assets.json](production/assets.json) matched exact
  Git blobs, including the download page, launch manifest, immutable helper,
  Studio/Room shells, service worker, three locales and untouched ASR entry files.
  Matching integrity-manifest entries were checked against actual served hashes.
- Two independent fresh production browser runs passed all 14 grouped checks,
  with two page reloads per run and the actual published archive/hash. Reports:
  [first](production/browser-report-run-1.json), [second](production/browser-report.json).
- Real loopback HTTP/native UI renderer test retained READY, filename and SHA-256
  during a failed preview, retained the warning across reload, and cleared it on
  successful retry without another download. Fixture media and native action
  results are explicitly TEST_FIXTURE_ONLY; this is not an iPhone share-sheet test.
- New warning screenshots inspected at 380px in light and dark mode, including
  the enabled retry button and preserved SHA alongside the action error.
- 30 Python tests PASS; full Node 1377/1377 PASS; API smoke PASS; ingest 22/22
  PASS; i18n 233 PASS. Red tests reproduced the original defects before correction.

## Upgrade evidence boundary

[Exact-release fixture](upgrade-fixture/report.json): PASS, actual service worker,
492-to-493 transition through the ordinary Update button and two reloads. No
physical iPhone execution or media download was performed by this test.

The separate live-rollout probe established a real cached 492 baseline, then
aborted when a transient HTTP 502 response was parsed as JSON during deployment.
It therefore did **not** complete the update click and is **INCONCLUSIVE**, not
PASS. Later live asset checks, health checks and both browser runs passed. The
production browser runs intentionally block service workers; they do not replace
the cache-upgrade evidence or claim physical iPhone update acceptance.

## Unchanged scope and remaining acceptance

`studio-import.js` remained SHA-256
`b60fb7d7e80c51e5e3d68b016777f3b77b5026fd3730ce91e18a4054a7b54995`;
`media-readiness.js` remained SHA-256
`976545f8e7e3c7f5f5af637ee3d429894180a45475da1321460a1f0506621c6d`.
No ASR/provider calls, source media transfer, owner-device filesystem mutation, saved-file
rename/delete, global helper reinstall, server-media change or infrastructure
configuration change was made. Unrelated dirty files were excluded from commits.
Production disk usage reported 89–90%; no cleanup was authorized or performed.

Earlier owner-reported quality selection, download and compatibility PASS stand.
Corrected Open/Share on the physical iPhone remains **OWNER_CHECK_PENDING**.
Use the existing history entry and saved file; a new download is unnecessary.

This document is a generated-work handoff, not owner acceptance or an annotation
worksheet. README.md contains the short owner check. The final evidence is kept
under this stable repository directory, not only in a temporary worktree.
