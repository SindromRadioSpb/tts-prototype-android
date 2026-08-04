# Invite beta packet state

Status: **PRODUCTION ACTIVATED / BROWSER ROUND-TRIP PARTIAL / OWNER-LIVE PENDING / DISTRIBUTION NOT OPEN**.

Intended bounded cohort: owner/personally trusted Windows 11 + NVIDIA CUDA + Chrome users
of the existing Companion. Production exposure is enabled for the invite flow, while the
source default remains `LOCAL_MT_BETA_ENABLED=false`; use still requires explicit session enrollment, pairing, license/resource/privacy/draft
consent, model installation and explicit MADLAD selection.

Installer source coordinates:

- product/AppId: existing `LinguistPro Local ASR Companion` identity (in-place upgrade);
- source version: `0.3.0-beta.4`;
- expected internal filename: `LinguistProLocalAsrCompanion-0.3.0-beta.4-unsigned-internal.exe`;
- install path and pairing-token store: unchanged from the existing Companion;
- binary status: unsigned internal build only; no public hosting/signing/general
  distribution is authorized.

Upgrade behavior is additive: Local ASR keeps its exact owner-approved model pin; Local MT
adds an independent capability and managed model directory. A browser must authenticate
the capability before showing ready. Local MT errors never select another provider.

Completed on the owner machine:

1. exact beta.4 build with frozen Torch `2.5.1+cpu`, Accelerate `1.13.0`, converter
   import, isolated start/health/stop and one-artifact report;
2. in-place beta.2→beta.4 upgrade with pairing and exact ASR revision preserved;
3. model delete→absence→remote exact-revision reinstall, including fail-closed network
   interruption, retained-partial resume, conversion, atomic activation and full rehash;
4. real blank/whitespace/duplicate mapping, concurrent production-Origin he→ru and
   ru→he jobs, Companion restart, cold job and final unload.

Production activation completed on 2026-08-05:

1. served app/service worker `3.11.308`, health/DB/migrations green and
   `disk_warn=false` after a fresh verified backup and bounded cleanup;
2. real production Chrome pairing, exact `@v2` model readiness and he→ru job PASS;
3. save→MADLAD provider filter→metadata provenance→edit→cold reopen PASS;
4. Companion-off remains selected MADLAD, disables the path and preserves the stale
   local result without invoking another provider; restart plus explicit re-pair returns ready;
5. text-card export UI reports `JSON downloaded`.

Before the bounded invite beta may be called complete, the following remain required:

1. owner selects the exported JSON in Library import, verifies the text-card preview and
   completes the idempotent `mode=skip` import receipt;
2. owner performs the real learning-text ceremony and confirms the semantic draft is
   usable/correctable; synthetic smoke is not owner-live;
3. remove the exact synthetic smoke card after receipts are captured;
4. record `PRODUCTION PASS` and `OWNER-LIVE PASS` separately. Public hosting, signing,
   general distribution, GA and default-on remain closed.
