# Invite beta packet state

Status: **LOCAL BINARY GATES PASS / DISTRIBUTION NOT OPEN**.

Intended bounded cohort: owner/personally trusted Windows 11 + NVIDIA CUDA + Chrome users
of the existing Companion. Browser exposure remains `LOCAL_MT_BETA_ENABLED=false` by
default and requires explicit session enrollment, pairing, license/resource/privacy/draft
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

Before this packet may open the bounded invite beta, the following still remain required:

1. create a post-commit final beta.4 build with clean runtime inputs and record its exact
   artifact SHA-256;
2. execute deployed-browser direct-loopback and save→reopen→export/import gates;
3. commit/push/deploy from the now unrestricted session after a fresh production
   disk/health cleanup has passed;
4. record engineering, production and owner-live outcomes separately.
