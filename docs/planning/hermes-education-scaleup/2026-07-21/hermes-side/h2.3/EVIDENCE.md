# H2.3 evidence

Status: IN_PROGRESS.

- Before snapshot: 21 tools, HEAD `fef12c7`, app `3.11.231`.
- Owner correction approved 2026-07-23: browser OPFS ticket+receipt for import/track; server goals.
- Migration: `061_agent_access_h2_w1.sql` (weekly goals, execution tickets, proposal/scopes widening).
- After local schema: 25 tools; only additions are `propose_import_text`, `propose_track_word`,
  `propose_goal`, `get_current_goal`; `CAPABILITY_VERSION` remains `aa-v0.1`.
- Migration copy run: PASS; SQLite integrity: PASS.
- Local gates so far: H2.3 25/25; domain 47; production handlers 61; OAuth 24; MCP 65;
  control plane 54; H2.1 acceptance 5/5; H2.2 acceptance 5/5; H2.G1 40; i18n 226;
  API smoke PASS. Full suite remains at its pre-existing baseline 269/278 (9 unrelated failures).
- Production deploy, four-scope consent, browser cards and fresh ordinary Hermes chat: PENDING.
