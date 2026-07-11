# R-G — Cost, Scale and Operations (reconstructed)

**Artifact class:** reconstructed secondary report; not verbatim; independence not auditable.
**Status:** PARTIAL RECONSTRUCTION / NOT PRIMARY EVIDENCE
**Reconstruction date:** 2026-07-11
**Source commits:** North Star `b426b1b`; phase-1 recon `a510b1e`; synthesis `d2d3c68`; phase-2 baseline `5f2a6f`
**Provenance limitation:** exact original prompt/output, run metadata, source ledger and hash are unavailable. Sources below were recovered from session findings/published synthesis and were not independently re-attributed to the original run. Assumptions and unresolved gaps are stated in the final paragraph.

## Findings

- **FACT:** bounded LLM calls, quota reserve, kill switch and TTS content cache exist; current single-container/process-local controls are not 1,000-MAU scale evidence.
- **FACT:** published cost bands are assumptions. Current ledger lacks complete input/cache tokens, model price cards, action/CCT linkage, reviewer/support time and observed cache economics.
- **HYPOTHESIS:** TTS, human review, support/security/operations dominate bounded LLM inference through 1,000 MAU.
- **BLOCKER:** cost/CCT cannot be enforced until CCT and per-outcome ledger exist. No scale promise without durable queue/backpressure/idempotency/load/outage proof.
- **PROPOSAL:** deterministic/small-model-first; batch backstage work; premium escalation only on quality/value gate; no free-tier assumption in committed budget.

Initial provisional pilot gates recovered: ≤$100 technical cash/month and ≤$25 fully loaded/CCT; ≥95% billable actions linked; 5× expected peak before 100 MAU; no process-local correctness dependency before 1,000; TTS disk/quota degradation drill.

Measurements: tokens/action, escalation, cache/new TTS characters, retries/latency, reviewer minutes, support/incident time, transfer rate and invoice reconciliation. Biggest sensitivity is the denominator: halving confirmed transfers doubles cost/CCT.

Rejected: premium-always, inference-only economics, staffing/pricing from illustrative bands and local model inside the current constrained container without capacity proof. Gap addressed by measurement design `20`.
