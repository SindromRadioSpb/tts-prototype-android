# Known limitations and blockers

1. Fresh installation is unproven. The pinned upstream snapshot is 42,854,943,654 bytes
   before the 10,739,625,126-byte CT2 artifact and reserve space. The resumable downloader,
   exact source hashes, isolated converter and atomic activation are implemented and unit
   tested, but the full remote download→conversion→activation path was not executed.
2. The real ASR→MT→ASR residency ceremony is unrun because this checkout's managed ASR
   model directory is empty. Scheduler unit tests pass and real MADLAD load/unload passes,
   but that is not the MT-2 swap exit.
3. No new Companion installer artifact was built. Consequently, ready/install/busy/cancel,
   Companion restart, multi-tab contention and the direct production-origin network
   assertion are not yet browser-tested against the new binary.
4. Cold reopen plus export/import authority preservation is covered by existing repository
   paths and focused unit/smoke gates, but not yet exercised with a real local-MT save.
5. The frozen L4.0a release regression subset was not rerun after productization. The real
   synthetic runtime smoke found a meaning-risk example, so draft positioning remains
   mandatory and owner-selected learning material is still required.
6. `npm test` retains one baseline failure unrelated to this slice:
   `classic mode keeps table fine-tuning in a secondary advanced area` expects
   `btnTableCustomizeToggle`, which is absent in both current HEAD and this working tree.
7. Production preflight is a hard STOP: about 96% disk used and about 1.4 GB free. No
   destructive cleanup authority was granted, so no build/push/deploy was attempted.
8. Production continues to serve `3.11.300`; local source `3.11.302` has not been deployed.
9. No engineering-partial result in this directory is a production PASS, beta PASS,
   bilingual validation, GA claim or owner-live PASS.
