# Studio Ingest local ASR L1 — post-hardening owner decision packet

> **Date:** 2026-07-30
> **Code:** `33ba3f49129f72e7ce5f5d1eea90c4a674d93407`
> **Current decision:** bounded engineering/evidence PASS; permanent integration NO-GO.

> **Superseding owner decision — 2026-07-31:** owner listen/read, four-speaker human-gold, and the
> former 60-minute/12-speaker study are recommended evidence rather than mandatory blockers.
> Permanent integration remains `NO-GO` pending a separate explicit owner authorization, not these
> studies.

## What changed

The approved accelerated slice closed the three concrete engineering gates left by the limited
L1 implementation: a new frozen batch-20 ran through the public sidecar API, Chrome/Edge/Firefox
engine flows ran at 380×844 including failure behavior, and B+C identity/dedupe/round-trip debts
were fixed without a schema migration. No cloud request, production operation, push or deploy was
performed.

## Evidence summary

| Gate | Result |
|---|---|
| Sidecar batch-20 | PASS: 20/20; WER 2.597%; CER 0.926%; no retry/fallback |
| Chrome 150 / Edge 150 | PASS with installed system binaries |
| Firefox | PASS on Mozilla Playwright build 146; stock Firefox 153 remains unverified |
| Mobile/RTL and lifecycle | PASS: 380×844, pairing, progress, retry, cancel, delete, sidecar-down |
| B+C integrity | PASS: portable identity, explicit SHA dedupe, backup/text-card parity |
| Cloud boundary | PASS: zero Gemini requests/uploads; spend = 0 |

## Recommended evidence not yet proved

- owner listen/read acceptance and an owner-chosen absolute product-quality threshold;
- expanded independent human-gold population coverage;
- full paired Gemini comparison (requires explicit cloud-spend authorization);
- direct stock Firefox 153 ceremony;
- destructive live thermal/OOM testing (deterministic fault gates are PASS).

## Recommended owner decision

Accept this as **bounded L1 engineering/evidence closure** and retain permanent integration
`NO-GO`. If product-quality evidence is now desired, authorize a separate short, blinded
listen/read slice with an explicit time budget and acceptance rubric. Authorize Gemini only as a
separate decision with a call/spend ceiling and the same frozen set.

Exact approval text for the recommended decision:

> Утверждаю bounded L1 engineering/evidence closure. Permanent integration и provider defaults
> не разрешаю. Следующий acceptance или Gemini-spend slice требует отдельного packet и решения.

Worksheet: [`../research/studio-local-processing/2026-07-30/evidence-closure/OWNER_ACCEPTANCE_WORKSHEET.md`](../research/studio-local-processing/2026-07-30/evidence-closure/OWNER_ACCEPTANCE_WORKSHEET.md).
