# Production release 3.11.528

Date: 2026-09-13. Owner explicitly authorized production publication in this session.

- PR: https://github.com/SindromRadioSpb/tts-prototype-android/pull/7 (merged).
- Released commit: `127c8f7696f27f0964133cb666f1f501f081bbc0`.
- Candidate head: `d8ad1d14028e5eeffb0f215fa5377d02f6d2833f`.
- Merge time: 2026-09-13 16:56:23 UTC; Coolify automatically built and replaced the application container.
- CI passed for both the candidate and merged main commit.
- Served version: **3.11.528** at https://linguistpro.kolosei.com.

## Published artifact verification

Three complete rounds of cache-busted, `Cache-Control: no-cache` requests each confirmed version 3.11.528 and all **84** `shellIntegrity` entries. For every entry, SHA-256 of the served response matched both the server manifest and the exact released Git blob; `/sw.js` also matched the released blob. Git blobs, not Windows checkout bytes, are the comparison source because checkout line endings can differ.

## Browser checks against the published site

Disposable Chromium contexts only. No owner profile, login, remote provider, server write, library migration or learner-data modification. Browser network routing allowed same-origin GET/HEAD and rejected other page requests. Synthetic local records/media were confined to the disposable browser profile.

| Check | Result |
|---|---|
| Eight tabs, real OPFS / AccessHandlePool | PASS, 10926 ms for the synthetic scenario. |
| Eight tabs, IndexedDB VFS | PASS, 9863 ms for the synthetic scenario. |
| Transaction exclusion, rollback, stale-editor conflict, close/reopen, seeded learner-state equality | PASS using the maintained operation-lease smoke scenarios with published database modules. |
| Two Studios + Mediatheque + Room | PASS: independent drafts and active identities, same-tab reload, peer-close continuity, catalogue invalidation. |
| Commit received while a dialog is open | PASS: catalogue refreshes after dialog closes. |
| Mediatheque → Room local MP4 | PASS: actual `play()` and increasing `currentTime`, not a screenshot-only assertion. |
| Frozen idle Studio | PASS: another tab reads the library; resumed draft remains intact. |
| Service Worker | PASS: controller active, `linguistpro-precache-v3.11.528`, all 84 integrity entries cached. |
| Offline Studio reload | PASS: input surface and ready local DB; zero pageerrors. |
| Full surface scenario | Zero pageerrors. |

Runtime and surface scenarios reuse `scripts/multitab/operation-lease-smoke.js` and `scripts/multitab/studio-surfaces-smoke.js`, replacing the disposable local server with the production origin. The runtime-only fixture is intercepted as a minimal same-origin HTML page; database assets come from production. The full surface scenario uses the actual served pages. Service Worker installation is tested in a separate context with workers enabled; the other browser gates disable service workers to test served assets directly.

[Production video fixture screenshot](production-video-playing-380.png).

## Operational state and outstanding device acceptance

`/healthz` returned `ok=true`. After the build it also returned `disk_warn=true`; read-only `df -h /` reported 83% used, approximately 6.2 GB available. No disk cleanup was performed. This warning is recorded separately from the successful release checks.

The owner's **Chrome on iPhone, iOS 26.6.2** has not been physically retested. Long iOS background suspension, the supplied original media scenario and VoiceOver remain unverified. Desktop Chromium freeze and offline checks are not physical-iPhone acceptance.

For the transition from 3.11.527, save work and update old open tabs once; old lifetime-owner code can otherwise retain its lock. Do not clear browser site data. Unsaved Studio drafts remain tab-scoped, with no new durable recovery guarantee after permanent tab closure.
