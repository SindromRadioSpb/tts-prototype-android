# Full atlas export release 3.11.872

Candidate: atlas-transfer-audit, based on origin/main eb5fad7c. Production verification is pending.

The owner download exports the active pinned 97001 edition and context, legacy 97002 and other atlas-reader corpora. PDF and editorial sources are required; missing or mismatched source provenance fails closed. Archives contain a standalone Python 3.12+ verifier/restorer/repacker and a Russian guide. Restore writes only a new directory; it never publishes or imports learner data.

Local verification: 3486 unit checks passed, 15 skipped, zero failures; seven export/API contracts including a generic future-atlas fixture; five Python archive and source-invalidation tests; API smoke; 233 i18n/version checks. Real local browser downloads for both atlases at 380/1280 pixels passed without page errors or learner-table changes. Independently restored and re-exported all 872 / 2517 material files with exact manifests. See accompanying JSON evidence.

AI source invalidation: changed text quarantines dependent section AI; changed PDF/image quarantines all AI, preserving source evidence. Covered by test_material_snapshot.py and source-invalidation.json. Checksums reject altered bytes in a material archive.

Production preparation: build-cache cleanup reclaimed 3.151 GB; images, containers and volumes retained (private inventory in the archive directory). Fresh free space before source upload: 12,444,741,632 bytes. No helper/build container active. Cold-build gate is >=6 GiB; source installation plus transient upload adds <1 GiB, leaving headroom. Full source packages were atomically installed in a new private atlas-sources directory and all 10 payload files checked against manifests. Active atlas roots and user tables were inventoried read-only for post-release comparison.

Private evidence and downloadable archives: E:/projects/tts-prototype-android/Архив/atlas-export-release-20261107/. Do not publish raw DB inventories or credentials.
