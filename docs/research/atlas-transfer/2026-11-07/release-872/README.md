# Full atlas export release 3.11.872

Candidate: atlas-transfer-audit, based on origin/main eb5fad7c. Production verification is pending.

The owner download exports the active pinned 97001 edition and context, legacy 97002 and other atlas-reader corpora. PDF and editorial sources are required; missing or mismatched source provenance fails closed. Archives contain a standalone Python 3.12+ verifier/restorer/repacker and a Russian guide. Restore writes only a new directory; it never publishes or imports learner data.

Local verification: 3486 unit checks passed, 15 skipped, zero failures; seven export/API contracts including a generic future-atlas fixture; five Python archive and source-invalidation tests; API smoke; 233 i18n/version checks. Real local browser downloads for both atlases at 380/1280 pixels passed without page errors or learner-table changes. Independently restored and re-exported all 872 / 2517 material files with exact manifests. See accompanying JSON evidence.

AI source invalidation: changed text quarantines dependent section AI; changed PDF/image quarantines all AI, preserving source evidence. Covered by test_material_snapshot.py and source-invalidation.json. Checksums reject altered bytes in a material archive.

Production preparation: build-cache cleanup reclaimed 3.151 GB; images, containers and volumes retained (private inventory in the archive directory). Fresh free space before source upload: 12,444,741,632 bytes. No helper/build container active. Cold-build gate is >=6 GiB; source installation plus transient upload adds <1 GiB, leaving headroom. Full source packages were atomically installed in a new private atlas-sources directory and all 10 payload files checked against manifests. Active atlas roots and user tables were inventoried read-only for post-release comparison.

Private evidence and downloadable archives: E:/projects/tts-prototype-android/Архив/atlas-export-release-20261107/. Do not publish raw DB inventories or credentials.

## Follow-up 3.11.873

Release 872 converged: 214 served resources matched local bytes and integrity; three DB/migration health checks passed; the 212-entry controlling SW cache and offline shells passed; CI succeeded. Full pre/post server atlas inventory and 15 learner tables were identical, including all 12064 review_log rows. Production browser downloaded the complete 97001 ZIP, which independently verifies, but the local test driver then exhausted external memory; that incomplete browser run is not acceptance of both atlases.

The final audit found the common verifier checked file hashes but did not check the separate AI dependency digest. Release 873 adds a required dependency-hash check: text/PDF/image edits fail even if their ordinary file checksums are manually updated. Six Python tests (including all three mutations), seven export/API contracts, API smoke and 233 i18n checks pass; both real existing atlas ZIPs pass the stricter verifier unchanged.

The browser harness excludes the GET-only ZIP route from CDP interception, allowing native streaming instead of buffering a large intercepted response in the driver. Production download/restore acceptance will be rerun against 873. Fresh cache-only cleanup was performed with no active build: all 14 images, all 9 containers and all 4 volumes retained, free space 9,905,217,536 bytes, health ready and disk_warn false.

## Final version-consistency correction

CI for 873 detected the Room footer still stamped 872 (eight contract failures from this single mismatch). Candidate 874 synchronizes the Room footer, Studio APP_VERSION and SW cache version; the complete local suite passes again (3486 pass, 15 skip, zero failures), API smoke passes and all 233 i18n/version checks pass. Export payload code is unchanged from 873.

A production viewport assertion initially ran before the responsive layout settled. The browser harness now waits two animation frames after resizing and records actual viewport/scroll widths and diagnostic elements on failure. The subsequent 873 run passed layout checks and streamed the archive; it was intentionally cancelled to verify the final 874 runtime instead. It is not counted as completed download acceptance.
