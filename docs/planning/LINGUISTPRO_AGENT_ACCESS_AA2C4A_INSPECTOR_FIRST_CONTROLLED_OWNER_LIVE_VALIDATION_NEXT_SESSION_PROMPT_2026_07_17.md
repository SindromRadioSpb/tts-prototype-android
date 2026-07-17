# Next-session prompt — AA2-C4A Inspector-first controlled owner-only live validation

Work in `E:\projects\tts-prototype-android`.

This is a durable handoff for a separately approved C4A production window. It is not execution authority. Do not read the private production runbook, create a backup, change production config/data/client state, restart, configure Inspector, start OAuth or call MCP until the owner supplies the exact approval in the C4A packet §16 naming the final packet commit.

## Read fully before action

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`
5. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA1_OAUTH_TOOL_SCHEMA_THREAT_MODEL_CONTRACT_2026_07_16.md`
6. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2_READ_ONLY_EXECUTION_APPROVAL_PACKET_2026_07_17.md`
7. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md`
8. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C2_TWO_CLIENT_LOOPBACK_COMPATIBILITY_EVIDENCE_2026_07_17.md`
9. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C3_PRODUCTION_REGISTRATION_STILL_DISABLED_EVIDENCE_2026_07_17.md`
10. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_EVIDENCE_2026_07_17.md`
11. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_EVIDENCE_2026_07_17.md`
12. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_PACKET_2026_07_17.md`

Read `.claude/PROD_OPS_PRIVATE.md` only after the exact §16 approval and only locally for minimum operations coordinates. Never reproduce it.

## Frozen execution identity

```text
production revision = e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3
package             = 3.11.197
handler revision    = 57527403893b8291a1648d989eead743a349cb96
protocol            = 2025-11-25
MCP SDK             = @modelcontextprotocol/sdk@1.29.0 exact
Inspector           = 0.22.0
Inspector client    = linguistpro-mcp-inspector-v0
Hermes client       = linguistpro-hermes-owner-v0, always SUSPENDED
```

The final packet commit is supplied by the owner approval. Any production/main/package drift, code delta, unexpected lifecycle row or inability to prove rollback is a stop condition. Do not merge/rebase around drift.

## Preflight before any mutation

Report content-safely:

1. exact packet commit, branch, production/main revision and package;
2. clean scoped state and exclusion of unrelated owner files;
3. all required local Agent Access/OAuth/MCP/consent/boundary/two-client/auth/API gates green;
4. health, DB and migrations ready;
5. OAuth UI/runtime `1/1`, clients gate `0`, MCP absent/exact `0`, owner allowlist absent;
6. exact two reviewed clients, both `SUSPENDED`;
7. subject/connection/grant/code/family/refresh/denial counts all `0`;
8. exact production-handler artifact identity and prior-image/backup readiness;
9. isolated Inspector `0.22.0` readiness with no stored token/profile residue;
10. all discrepancies and stop conditions.

Do not print the owner ID, environment values, production coordinates, credentials, tokens, cookies, headers, connection IDs or learner metadata.

## Exact window

Follow C4A packet §§6–9 literally:

1. take one fresh verified backup;
2. activate only Inspector while both gates remain off;
3. configure one exact owner allowlist plus MCP gate `1`, restart and prove OAuth clients still off;
4. set clients gate `1`, restart the same revision and prove Hermes remains suspended and lifecycle pre-state zero;
5. pause only for the owner’s first-party login/consent interaction if interactive input is required;
6. execute one authorization, one consent, one `initialize`, one `tools/list`, and exactly one call to each of the five allowlisted tools;
7. retain only booleans/schema versions/status/byte and cardinality counts; never capture result values, IDs, titles/authors or learner aggregates;
8. perform one refresh rotation without reuse, then revoke;
9. close clients gate first and restart before cleanup;
10. suspend Inspector, revoke/delete its connection, clear/destroy Inspector token store/profile;
11. remove owner allowlist, disable/remove MCP gate, retain clients gate `0`, restart;
12. verify exact zero live authority and observe for 15 minutes; write content-safe evidence on a non-deploy branch and stop.

Expected non-authoritative residue is permitted only as defined in packet §11: one opaque subject mapping, consent history, erasure/audit tombstone and bounded denial metadata. Do not delete it ad hoc and do not call it live authority.

## Immediate stop and rollback

On any mismatch or leak: set clients gate `0` and restart first; fail-close OAuth/MCP; suspend Inspector; revoke/delete the Inspector connection; clear the isolated profile; remove owner allowlist; disable/remove MCP; restart the same revision; verify zero live authority for 15 minutes. Restore the fresh backup only for DB integrity damage. Never touch Hermes or broaden scope to repair a failing gate.

## Terminal status

Only a fully successful window may be called:

```text
INSPECTOR_OWNER_WINDOW_PASS /
INSPECTOR_REVOKED_DELETED_SUSPENDED /
OWNER_ALLOWLIST_REMOVED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
HERMES_UNTOUCHED
```

This is not production MCP readiness, Hermes integration, learning evidence or launch. After success, stop and prepare a separate AA2-C4B Hermes decision packet; do not execute it.
