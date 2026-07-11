# R-C — Agent Architecture (reconstructed)

**Artifact class:** reconstructed secondary report; not verbatim; independence not auditable.
**Status:** PARTIAL RECONSTRUCTION / NOT PRIMARY EVIDENCE
**Reconstruction date:** 2026-07-11
**Source commits:** North Star `b426b1b`; phase-1 recon `a510b1e`; synthesis `d2d3c68`; phase-2 baseline `5f2a6f`
**Provenance limitation:** exact original prompt/output, run metadata, source ledger and hash are unavailable. Sources below were recovered from session findings/published synthesis and were not independently re-attributed to the original run. Assumptions and unresolved gaps are stated in the final paragraph.

## Findings

- **FACT:** current runtime is an in-process deterministic scenario controller; planner/grader own decisions and LLM mostly rewrites/explains. Closed tools reject client `user_id`; repos own writes.
- **BLOCKER:** default architecture is deterministic kernel + one Mentor/controller + typed functions. Specialist promotion requires controlled advantage, proposed ≥5pp independent quality/CCT gain without critical-harm increase and acceptable cost/latency.
- **BLOCKER:** handoff cannot inherit full chat/tools. Delegation intersects scopes; receiver re-authorizes principal, tenant, consent, data classes, purpose and expiry.
- **MAJOR:** add strict tool schemas, run/trace/command IDs, idempotency, classified timeouts/retries, privacy-safe context packs, provider registry and audit. No direct DB/projection writes.
- **PROPOSAL:** M-D/durable event platform waits for ≥3 genuinely long workflows or organizational/scale need. MCP/A2A are interoperability protocols, not permission systems.

Tests: same model/tools/budget single vs specialist; schema/userId/oversize fuzz; cross-tenant context canaries; crash before/after side effect; degraded-mode removal of every model/provider; routing noninferiority.

Rejected: shared agent memory, consensus-as-truth, ambient credentials, internal A2A/MCP for appearance, general durable engine now. Sources recovered: live `agent/`/repos, [MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [A2A](https://a2a-protocol.org/), OpenAI Agents orchestration docs. Gap addressed by technical design `19`.
