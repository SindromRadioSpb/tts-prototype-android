# Production verification — 3.11.491

Code commit: `c91023c10d728cde5ad1d7164f2c80424872334a`.
Verified: 2026-09-08 01:29 UTC. Main, origin/main and remote main were aligned
with this code commit. Normal main push triggered the existing deployment.
No extra infrastructure, worker configuration/restart or data migration.
Only the 42-file allowlist was committed; unrelated work was preserved.

Live `/api/client-config` repeatedly returned 3.11.491, `/healthz` returned 200.
15 responses were compared byte-for-byte (SHA256) to their `git show` code-commit
blobs: index, library, SW, new download HTML, new CSS, all four downloader JS
assets, all three locales, helper PYZ, and unchanged studio-import/media-readiness.
New shell integrity entries matched their live bytes.

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| download-media.html | 4952 | 8dfdafef3cc8746c3daee37d41ebb5377b4e91e29b69928dc0ee4b8224d40e71 |
| iphone-downloader-release.js | 3162 | d288244c22c856dbd1f22ec8a19e99cf6c89c7b8e0fe376b89b223ba1f74292a |
| iphone-downloader-e1e5906d9803b052.pyz | 40433 | e1e5906d9803b052899ed729e05fdc02b38284ddaaa6f55758c0dd54eec22000 |
| studio-import.js (unchanged) | 188490 | b60fb7d7e80c51e5e3d68b016777f3b77b5026fd3730ce91e18a4054a7b54995 |
| media-readiness.js (unchanged) | 13371 | 976545f8e7e3c7f5f5af637ee3d429894180a45475da1321460a1f0506621c6d |

Two independent fresh-browser production runs passed all 12 checks, each with
two reloads. Actual HTTP helper download SHA matched. Page errors: 0.
Downloader provider/media/ASR requests: 0. Screenshots in `production/` inspected
at 380px RU, HE, HE dark and desktop; actual Studio navigation checked.
The harness blocks service workers to isolate DOM/HTTP tests; this is not an
owner-browser cache activation claim. Live SW bytes/integrity were checked
separately, as above. The report file reflects the second repeat.

Native overlays, callback success fixtures and their displayed media facts are
TEST_FIXTURE_ONLY. Physical iPhone new-flow acceptance remains NOT_TESTED.
The owner's earlier real download, audio and Chrome play/seek reports apply to
the predecessor qualification route only. New helpers reuse that frozen engine
byte-for-byte, but that does not certify new app-switch/UI/share interactions.

Owner next action: follow the five steps in README using the production link.
Do not touch ASR or use terminal commands to bypass an unsuccessful new UI gate.
Browser history is HELPER_REPORTED, never an independent File/OPFS receipt.

This evidence-only follow-up is pushed to the feature branch without another
main deployment. Stable copies are available in the owner's primary checkout.
