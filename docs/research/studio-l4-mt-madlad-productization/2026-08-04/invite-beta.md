# Invite beta packet state

Status: **NOT READY FOR DISTRIBUTION**.

Intended bounded cohort: owner/personally trusted Windows 11 + NVIDIA CUDA + Chrome users
of the existing Companion. Browser exposure remains `LOCAL_MT_BETA_ENABLED=false` by
default and requires explicit session enrollment, pairing, license/resource/privacy/draft
consent, model installation and explicit MADLAD selection.

Installer source coordinates:

- product/AppId: existing `LinguistPro Local ASR Companion` identity (in-place upgrade);
- source version: `0.3.0-beta.1`;
- expected internal filename: `LinguistProLocalAsrCompanion-0.3.0-beta.1-setup.exe`;
- install path and pairing-token store: unchanged from the existing Companion;
- binary status: unsigned internal build only; no public hosting/signing/general
  distribution is authorized.

Upgrade behavior is additive: Local ASR keeps its exact owner-approved model pin; Local MT
adds an independent capability and managed model directory. A browser must authenticate
the capability before showing ready. Local MT errors never select another provider.

Before this packet may open the invite beta, all of the following remain required:

1. run the full fresh download/conversion/activation and capture install/resume/cancel/delete/reinstall receipts;
2. build the exact installer and verify clean install plus in-place upgrade on the owner machine;
3. execute real ASR→MT→ASR swap, idle unload, restart and multi-tab contention gates;
4. execute production-origin direct-network and save→reopen→export/import gates;
5. resolve the production disk/health STOP without unauthorized cleanup;
6. record engineering, production and owner-live outcomes separately.
