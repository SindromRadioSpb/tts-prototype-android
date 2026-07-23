# H2.3 evidence

Status: CLOSED — owner-live PASS 2026-07-23.

- Before snapshot: 21 tools, HEAD `fef12c7`, app `3.11.231`.
- Owner correction approved 2026-07-23: browser OPFS ticket+receipt for import/track; server goals.
- Migrations: `061_agent_access_h2_w1.sql` (weekly goals, execution tickets, proposal/scopes widening)
  and `062_agent_oauth_scope_payload.sql` (23-scope authorization-code payload cap 512→1024 bytes).
- After local schema: 25 tools; only additions are `propose_import_text`, `propose_track_word`,
  `propose_goal`, `get_current_goal`; `CAPABILITY_VERSION` remains `aa-v0.1`.
- Migration copy run: PASS; SQLite integrity: PASS.
- Local gates: H2.3 25/25; domain 50; production handlers 61; OAuth 24; MCP 65;
  control plane 54; H2.1 acceptance 5/5; H2.2 acceptance 5/5; H2.G1 40; i18n 226;
  API smoke PASS. Full suite remains at its pre-existing baseline 269/278 (9 unrelated failures).
- Production: final revision `de29d35`, app `3.11.236`, migrations ready, protected-resource
  metadata 23 scopes, Hermes OAuth token 23 scopes, 25 tools discovered after both containers restarted.
- Consent UI repair: owner-visible `Select all` + 23/23 counter in ru/en/he; Agent Access auth assets
  are network-only and deploy-versioned to prevent fresh HTML + stale JS.
- OAuth repair: exact 23-scope e2e consent→authorization code→access/refresh token PASS. The original
  512-byte cap rejected the canonical 545-byte scope JSON after consent with `server_error`.
- Browser owner-live receipts:
  - import `ap_03499bcacb8fae08ec737acb98ba969f`: ticket consumed; receipt has
    `type,text_id,text_key,rows_written`; proposal `CONFIRMED`.
  - track `ap_128ab67ea161bc827a9fc595ebcef70d`: ticket consumed; receipt has
    `type,item_key,status`; proposal `CONFIRMED`.
  - goal `ap_ac6110389c8b74c5e5e1953d831a4cdd`: proposal `CONFIRMED`; weekly goal ACTIVE,
    source `AGENT_PROPOSED_OWNER_CONFIRMED`.
- Fresh ordinary Hermes chat called `get_current_goal` and returned the exact ACTIVE PROCESS goal,
  start `2026-07-23`, anchor `Корпус «Учебные песни»`, and confirmed source. Owner-live PASS.
- Operational warning: production remained healthy after the final deploy, but disk health reported
  99%; no further cleanup was performed without a new bounded owner approval.
