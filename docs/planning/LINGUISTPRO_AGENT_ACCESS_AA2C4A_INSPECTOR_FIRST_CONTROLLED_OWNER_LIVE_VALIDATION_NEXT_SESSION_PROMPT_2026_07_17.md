# Next-session prompt — autonomous AA2-C4A repair through the Hermes configuration boundary

Work in `E:\projects\tts-prototype-android`.

The former §16 approval for packet commit `5601aeac5108122242e20c39c47653b61ed9a21d` was consumed on 2026-07-17. The window stopped before consent, token issuance, MCP initialization or handler dispatch because Inspector `0.22.0` derived protected-resource metadata discovery from `/agent-access/mcp`, while production publishes the reviewed resource metadata for `/agent-access`. The single permitted pre-dispatch retry was exhausted.

Flag-first rollback completed: OAuth clients gate `0`, MCP gate `0`, owner allowlist removed, Inspector and Hermes `SUSPENDED`, exact production revision/package unchanged, lifecycle live authority `0`, isolated Inspector runtime/profile removed, and 15 one-minute health samples all `200`. Two bounded content-safe audit rows remain from the pre-dispatch failures; they are not live authority.

Read the execution evidence before planning anything:

`docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_EVIDENCE_2026_07_17.md`

The separate repair/revalidation packet is now prepared:

`docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_DISCOVERY_COMPATIBILITY_REPAIR_AND_REVALIDATION_PACKET_2026_07_17.md`

This prompt is a durable handoff, not execution authority by itself. Start only when the owner message names the exact commit containing that packet and grants its §13 authority. Once that exact approval is present, execute the whole packet as one continuous terminal goal without intermediate approval requests, except the single bounded first-party browser gesture allowed there when human login/consent is objectively required.

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
13. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_EVIDENCE_2026_07_17.md`
14. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_DISCOVERY_COMPATIBILITY_REPAIR_AND_REVALIDATION_PACKET_2026_07_17.md`

Read `.claude/PROD_OPS_PRIVATE.md` only after the new packet's exact §13 approval, and only after local engineering gates are green, locally for minimum operations coordinates. Never reproduce it.

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

The exact packet commit is supplied by the owner approval. The approved packet selects a standards-aligned path-scoped protected-resource metadata alias, package target `3.11.198`, exact engineering file allowlist, synthetic gates, one exact fast-forward main deploy, default-off observation, one C4A Inspector window, cleanup and a C4B planning handoff. Any production/main/package drift, unknown code delta, unexpected live-authority row or inability to prove rollback is a stop condition. Do not merge/rebase around drift.

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

## Autonomous terminal goal after exact approval

Follow the new packet exactly:

1. perform the complete preflight and create a scoped branch from exact `origin/main`;
2. implement only the exact PRM compatibility alias and tests inside the packet allowlist;
3. run all focused and adjacent synthetic gates, autonomously repairing only in-scope defects;
4. bump `3.11.197 -> 3.11.198`, prove lock/dependency parity, create one scoped engineering commit;
5. take one fresh backup, exact fast-forward that commit to main and observe normal production auto-deploy;
6. prove both PRM routes identical and the deployment fully default-off for 15 minutes;
7. execute the single preauthorized Inspector C4A window, pausing only for an unavoidable owner login/consent gesture;
8. revoke/delete, close clients first, suspend Inspector, remove owner allowlist, disable MCP and destroy isolated token residue;
9. prove zero live authority and stable health for 15 minutes;
10. commit content-safe evidence/status plus a separate C4B Hermes configuration approval packet/prompt only on a non-deploy branch;
11. stop before opening or changing Hermes.

Expected non-authoritative residue is permitted only as defined in packet §11: one opaque subject mapping, consent history, erasure/audit tombstone and bounded denial metadata. Do not delete it ad hoc and do not call it live authority.

## Immediate stop and rollback

On any mismatch or leak: set clients gate `0` and restart first; fail-close OAuth/MCP; suspend Inspector; revoke/delete the Inspector connection; clear the isolated profile; remove owner allowlist; disable/remove MCP; restart the same revision; verify zero live authority for 15 minutes. Restore the fresh backup only for DB integrity damage. Never touch Hermes or broaden scope to repair a failing gate.

## Required terminal status

The new session succeeds only as:

```text
INSPECTOR_DISCOVERY_COMPATIBILITY_REPAIRED /
DEFAULT_OFF_DEPLOYMENT_VERIFIED /
C4A_INSPECTOR_OWNER_WINDOW_PASS /
INSPECTOR_REVOKED_DELETED_SUSPENDED /
OWNER_ALLOWLIST_REMOVED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
HERMES_CONFIGURATION_PACKET_READY /
HERMES_UNTOUCHED
```

Do not call this Hermes integration/readiness, learning evidence or launch. C4B execution remains blocked. The session ends after the C4B packet/prompt non-deploy push; it does not install, configure, activate, authorize, contact or connect Hermes.
