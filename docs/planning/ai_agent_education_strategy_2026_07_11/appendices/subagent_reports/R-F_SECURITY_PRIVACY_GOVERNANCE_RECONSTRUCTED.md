# R-F — Security, Privacy and Governance (reconstructed)

**Artifact class:** reconstructed secondary report; not verbatim; independence not auditable.
**Status:** PARTIAL RECONSTRUCTION / NOT PRIMARY EVIDENCE
**Reconstruction date:** 2026-07-11
**Source commits:** North Star `b426b1b`; phase-1 recon `a510b1e`; synthesis `d2d3c68`; phase-2 baseline `5f2a6f`
**Provenance limitation:** exact original prompt/output, run metadata, source ledger and hash are unavailable. Sources below were recovered from session findings/published synthesis and were not independently re-attributed to the original run. Assumptions and unresolved gaps are stated in the final paragraph.

## Findings

- **FACT:** current owner-live code has principal-derived identity, Mini App HMAC/freshness/replay, CSRF, closed tools, consent-gated class-B/C data, idempotent reviewer, export/delete/TTL, budgets and kill switches.
- **BLOCKER:** external pilot needs reconciled public privacy/cloud/Telegram/provider notice; provider/age/region/retention eligibility; off-host consistent backup; delete→restore→journal replay; secret rotation/incident/purge alerts; tenant and injection evidence.
- **MAJOR:** personal/agent/provider text is `UNTRUSTED_DATA`, never instruction. No arbitrary network/shell/browser/tool execution from learner content.
- **MAJOR:** provider registry is checked per request; class C fails closed if tier/region/retention route is unapproved. Revocation blocks future access immediately and creates durable cleanup work.
- **PROPOSAL:** every handoff is re-authorized; scopes cannot expand; no ambient credentials, shared cross-tenant memory or self-approval.

Tests: cross-user property suite; revoke races; indirect injection; delete/export/restore sentinel scan; auth vectors; TTL/purge alerts; log-hygiene sentinels; provider-route denial; backup/kill-switch/outage drills.

Rejected: autonomous writes, shared context, generic learner-text chat with tools, hidden uploads, unbounded loops and external readiness from unit tests alone. Sources: repository security paths, [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [OWASP excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), provider terms/data controls. Gap: no completed DPIA/procurement matrix.
