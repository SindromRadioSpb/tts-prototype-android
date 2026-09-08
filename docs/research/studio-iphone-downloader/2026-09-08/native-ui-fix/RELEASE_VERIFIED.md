# 3.11.492 live verification

Code: `70b779d7513310db807ff88aeee6fbc6025be227`. Remote main, origin/main and
local main aligned. Existing deployment path only; no infrastructure/worker
configuration, owner data, global Python setup or ASR changes.

2026-09-08 02:23 UTC: config repeatedly 3.11.492, health 200. Fifteen live
assets compared by SHA256 to exact code-commit blobs: index/library/SW,
download page, CSS, four downloader JS files, three locales, helper archive,
unchanged studio-import.js and media-readiness.js. Shell integrity entries
matched live bytes.

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| download-media.html | 5006 | 272cff6d76e7f354b4078b7a923866315878a3d991d336e027181cc80b43105f |
| iphone-downloader-release.js | 3162 | 2f163d15c0ae5810b348e7ae6c77082d7ab859e0fcfe40ad4ef5dabf7f64ce0a |
| iphone-downloader-6a4996c9cb7a307f.pyz | 43097 | 6a4996c9cb7a307f128861a73eb20f49a38860503773e74dff17ae7af4f41c31 |
| studio-import.js (unchanged) | 188490 | b60fb7d7e80c51e5e3d68b016777f3b77b5026fd3730ce91e18a4054a7b54995 |
| media-readiness.js (unchanged) | 13371 | 976545f8e7e3c7f5f5af637ee3d429894180a45475da1321460a1f0506621c6d |

Two independent production browser runs: 13 groups PASS each, zero page errors,
zero provider/media/ASR calls from the downloader page, two reloads per run.
Actual served archive checked against launch hash. Native renderer consumed
through real Python HTTP transport; synthetic media and native app launcher
were explicitly fixtures. Production report file represents the second repeat.

Cache-upgrade evidence is separate:

- The first production-rollout run installed/cached 3.11.491, then timed out
  after 30 seconds waiting for a waiting worker during rollout. Its timeout
  argument was accidentally passed as a page-function argument rather than
  Playwright options; this has been corrected. That run is INCONCLUSIVE, not
  PASS; the reason the worker did not become waiting within that interval was
  not established. No production defect is inferred from that timeout alone.
- Exact-Git-release fixture: c91023c1 -> 70b779d7, real Chromium service workers,
  ordinary Update button, controller activation, target version and new helper
  SHA after two reloads: PASS. This is deterministic cache-migration evidence,
  not proof of a physical iPhone or the timing of the real production rollout.
- Main HTTP/DOM browser harness intentionally blocks service workers; these
  checks are not substituted for the separate enabled-worker upgrade check.

All new screenshots were inspected, including 380px RU startup error, local
native UI, HE dark and cache-upgraded page. Saved under stable repository paths.
No acceptance of corrected native app launch/source download is claimed yet.

Owner next: update Studio normally, confirm 3.11.492 at the downloader footer,
open the failed history job again, then check actual quality selection,
download, video with sound and return. No terminal commands or reinstall.

This evidence/test-only follow-up is pushed to the fix branch without another
production build. The original 3.11.491 native failure remains recorded.
