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
   default-on. The final internal artifact is tied to commit `ce811de7`.
4. Real served-origin save, provider filter, metadata provenance, edit and cold reopen now
   pass. Chrome reported the text-card JSON downloaded, but the controlled browser did not
   expose the file path/download event; the owner must select the file and confirm the
   idempotent import preview before `PRODUCTION PASS` can be declared.
5. A predeclared 128-row frozen L4.0a representative release subset passed: macro chrF++
   improved 49.3464→49.6445, all per-direction chrF++/spBLEU bounds passed, and
   empty/truncated/critical flags remained zero. This is not the full 1012-row Stage A and
   does not replace owner-selected learning material. The synthetic meaning-risk example
   remains, so draft positioning is mandatory.
6. `npm test` retains one baseline failure unrelated to this slice:
   `classic mode keeps table fine-tuning in a secondary advanced area` expects
   `btnTableCustomizeToggle`, which is absent in both current HEAD and this working tree.
7. Production serves commit `015c0a05`, app/service worker `3.11.308`, with
   `LOCAL_MT_BETA_ENABLED=true`. Before activation a fresh 733,674,124-byte online backup
   passed SQLite integrity and archive read-back. The refreshed bounded cleanup improved
   root 92%/3.1 GB free to 76%/9.0 GB free. Active plus newest rollback, 10 containers,
   3 volumes, backups and data were preserved.
8. The real smoke exposed expected beta-quality variance: the longer learning sentence was
   translated coherently, while `שלום עולם` became `Мир во всем мире.` rather than the
   expected greeting. This is not hidden; machine-draft/correction UX remains mandatory.
9. A new smoke card inherited the active session's pre-existing media binding during save-as-new.
   The text-card share correctly reported no transferable source passport, but the synthetic
   card must be removed after the import receipt. This is outside MADLAD inference and does
   not authorize changes to the original material.
10. After a Companion restart the provider path recovered as ready, but the open onboarding
    model-state label stayed stale until the existing session token was explicitly submitted
    again. Invite instructions therefore retain explicit per-session pairing.
11. No result in this directory is yet a complete production PASS, beta PASS, bilingual
    validation, GA claim or owner-live PASS. File-picker import and real owner-live remain.
