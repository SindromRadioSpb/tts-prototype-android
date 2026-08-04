# Known limitations and blockers

1. Fresh conversion/activation is blocked, not untested. Cancel at 117,518,238 bytes kept
   the resumable partial; resume completed and exact-hashed all 42,854,943,654 upstream
   bytes. The isolated CT2 converter then exited with Windows access violation
   `-1073741819` while only about 6 GiB physical RAM was available. It activated nothing.
   Source cache is retained for a non-destructive retry. A new fail-early gate requires
   at least 24 GiB currently available physical RAM, but the retry under that condition
   has not yet been run.
2. Exact existing-runtime adoption, real managed-model translation, ASR→MT→ASR switching,
   and final no-resident unload pass on the RTX 3070. This does not waive the failed fresh
   conversion gate for a new invite-beta machine.
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
8. Production continues to serve `3.11.300`; local source `3.11.303` has not been deployed.
9. No engineering-partial result in this directory is a production PASS, beta PASS,
   bilingual validation, GA claim or owner-live PASS.
