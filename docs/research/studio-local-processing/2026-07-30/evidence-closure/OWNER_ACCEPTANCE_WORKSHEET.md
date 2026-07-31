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

## Separate Windows invite-beta acceptance (2026-07-31)

The Windows Companion and onboarding engineering slice is locally complete, but the beta quality
decision is not. Use
`docs/research/studio-local-processing/2026-07-31/windows-beta/OWNER_BLINDED_LISTEN_READ_WORKSHEET.md`.
Its required 12–15 minute/four-speaker independent human-gold source set is not yet frozen.

Owner decision on 2026-07-31: the human-gold check will be performed on production during the
trusted-cohort beta. This removes it as a pre-deploy blocker but does not mark it PASS; observations,
threshold, source provenance, and decision still belong in the blinded worksheet.

This smaller beta gate does not cancel, close, or silently revise the permanent
60-minute/12-speaker paired-Gemini gate. No Gemini comparison is authorized here.
