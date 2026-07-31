# L1 post-hardening owner acceptance worksheet

> This worksheet does not authorize permanent integration, production, provider defaults or
> Gemini spend. It records the next owner decision after bounded engineering evidence.

## Evidence to review

- [ ] Confirm batch-20: 20/20 terminal, WER 2.597%, CER 0.926%, no retry/fallback.
- [ ] Review one default-off and one completed 380×844/RTL screenshot per browser.
- [ ] Confirm B+C behavior: new import cannot update a stale card; duplicate media requires an
  explicit choice; ordinary backup and text-card preserve row/audio/provenance fields.
- [ ] Accept the stock-Firefox limitation: Firefox engine 146 PASS, installed stock Firefox 153
  not directly automated.
- [ ] Confirm that no Gemini media upload/cloud spend occurred.

## Owner decision

- [ ] Accept bounded L1 engineering/evidence closure only; keep permanent integration NO-GO.
- [ ] Request a separate, time-boxed listen/read acceptance sample and define its size/strata.
- [ ] Separately authorize a full frozen-set Gemini paired comparison and its spend ceiling.
- [ ] Request stock Firefox 153 manual verification before any integration decision.

Decision: ____________________  Date: __________  Owner: ____________________

Notes / observed regressions:

______________________________________________________________________________

## Separate Windows invite-beta recommended evidence (2026-07-31)

The Windows Companion and onboarding engineering slice is locally complete. The worksheet remains
available as recommended evidence, not a beta blocker. Use
`docs/research/studio-local-processing/2026-07-31/windows-beta/OWNER_BLINDED_LISTEN_READ_WORKSHEET.md`.
Its optional 12–15 minute/four-speaker independent human-gold source set is not yet frozen.

Owner decision on 2026-07-31: the four-speaker human-gold check and ten Mia listen/read checkpoints
are recommended, not mandatory. This does not mark either PASS; any later observations, threshold,
source provenance, and decision still belong in the blinded worksheet.

The 30:05.82 Mia Schem production-origin Local run is retained for owner listen/read review and
passed engineering integrity. Its comparison target, `Заложница Миа. Интервью v2`, is Gemini ASR
of the same complete MP3 rather than an independent human-authored transcript, so its 13/13 semantic
anchor coverage and token disagreement must not be reported as WER/CER or human-gold quality PASS.

The owner subsequently completed the native Chrome file-to-card workflow. Exact offline comparison
of the exported Local and Gemini cards recorded `22.98%` normalized token disagreement, material
name/meaning errors, and Local row over-fragmentation. Current evidence therefore supports Local as
a fast first draft with mandatory review, not as an automatically publishable transcript. Review
the ten timestamp checkpoints in
`docs/research/studio-local-processing/2026-07-31/windows-beta/MIA_LOCAL_VS_GEMINI_COMPARISON.md`
if the owner elects to gather additional quality evidence.

The owner also reclassified the former permanent 60-minute/12-speaker paired-Gemini gate as
recommended rather than mandatory. The owner-provided offline Gemini-card comparison used no new
cloud request or spend. Permanent integration still requires a separate explicit owner decision.

## Production onboarding closure (2026-07-31)

The owner authorized the Chrome-only onboarding deployment. Production now serves `v3.11.276`
from `d445c7e89c85dcc889b973f838870bb0d13a3ba4` with the Local ASR beta runtime gate enabled.
Enrollment remains explicit per browser, Gemini remains default, Edge is not advertised, and no
installer URL is public. Chrome production-origin LTR and RTL onboarding checks passed without
horizontal overflow. No schema or production-data mutation occurred.

Operational note: deployment builds raised host disk use to 90% (3.7 GB free). No cleanup was
authorized or performed. Treat disk remediation/capacity approval as a stop boundary before the
next build or deploy, not as a Local ASR quality gate.
