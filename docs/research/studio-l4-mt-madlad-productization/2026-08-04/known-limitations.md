# Known limitations and blockers

1. Fresh FP16 conversion and activation are resolved as `@v2`, but the 22 GiB product
   RAM gate remains necessary. Two independent conversions reproduced SHA-256
   `281b...e97`; both below-gate diagnostic runs completed, but available physical RAM
   fell to 0.03 and 0.11 GiB. Lowering the exposed gate to 20.6 GiB would therefore be an
   unsafe promise. The predeclared frozen 128-row release subset passed every threshold,
   and isolated plus owner-managed activation both passed full SHA-256 verification. The
   former `@v1` owner runtime is retained as a local rollback backup, not active.
2. Managed v2 load, four real translations and final GPU unload passed on the RTX 3070.
   The earlier v1 ASR→MT→ASR exclusive residency smoke remains valid scheduler evidence,
   but its v2 repeat could not start because this restricted sandbox denies reads of the
   unchanged ASR `model.bin` (`WinError 5`). This is still required outside the sandbox.
3. The beta.4 internal installer now builds and passes in-place upgrade,
   delete/reinstall/resume, restart and production-Origin API contention. It is still
   unsigned and not authorized for public hosting, signing, general distribution, GA or
   default-on. A post-commit final build is required before bounded invite use.
4. Cold reopen plus export/import authority preservation is covered by existing repository
   paths and focused unit/smoke gates, but not yet exercised with a real local-MT save.
5. A predeclared 128-row frozen L4.0a representative release subset passed: macro chrF++
   improved 49.3464→49.6445, all per-direction chrF++/spBLEU bounds passed, and
   empty/truncated/critical flags remained zero. This is not the full 1012-row Stage A and
   does not replace owner-selected learning material. The synthetic meaning-risk example
   remains, so draft positioning is mandatory.
6. `npm test` retains one baseline failure unrelated to this slice:
   `classic mode keeps table fine-tuning in a secondary advanced area` expects
   `btnTableCustomizeToggle`, which is absent in both current HEAD and this working tree.
7. The production disk STOP is cleared: bounded owner-authorized cleanup improved root
   usage from 97%/1.4 GB free to 76%/8.8 GB free and fresh health reports
   `disk_warn=false`. Six unreferenced app images and unused build cache were removed;
   active/newest rollback images, containers, volumes, backups and data were preserved.
8. Production continues to serve `3.11.300`; local source `3.11.304` has not been deployed.
   This session has not pushed, triggered auto-deploy or verified a new served service worker.
9. No engineering-partial result in this directory is a production PASS, beta PASS,
   bilingual validation, GA claim or owner-live PASS.
