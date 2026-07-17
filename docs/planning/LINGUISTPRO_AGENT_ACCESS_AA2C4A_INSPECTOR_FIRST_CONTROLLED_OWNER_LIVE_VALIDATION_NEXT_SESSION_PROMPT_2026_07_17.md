# Next-session prompt — AA2-C4A Inspector discovery-compatibility blocker

Work in `E:\projects\tts-prototype-android`.

The former §16 approval for packet commit `5601aeac5108122242e20c39c47653b61ed9a21d` was consumed on 2026-07-17. The window stopped before consent, token issuance, MCP initialization or handler dispatch because Inspector `0.22.0` derived protected-resource metadata discovery from `/agent-access/mcp`, while production publishes the reviewed resource metadata for `/agent-access`. The single permitted pre-dispatch retry was exhausted.

Flag-first rollback completed: OAuth clients gate `0`, MCP gate `0`, owner allowlist removed, Inspector and Hermes `SUSPENDED`, exact production revision/package unchanged, lifecycle live authority `0`, isolated Inspector runtime/profile removed, and 15 one-minute health samples all `200`. Two bounded content-safe audit rows remain from the pre-dispatch failures; they are not live authority.

Read the execution evidence before planning anything:

`docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_EVIDENCE_2026_07_17.md`

This prompt is not authority to retry C4A. Do not read the private production runbook, create a backup, mutate production config/data/client state, restart, configure Inspector, start OAuth, call MCP or touch Hermes. First prepare a separate default-off discovery-compatibility repair/validation packet and obtain exact owner approval.

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

## Historical exact window — consumed, not executable

The following was the consumed C4A sequence and must not be repeated under the old approval:

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

## Actual terminal status and next gate

The 2026-07-17 execution ended as:

```text
INSPECTOR_OWNER_WINDOW_STOPPED_PRE_DISPATCH /
OWNER_ALLOWLIST_REMOVED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
HERMES_UNTOUCHED
```

Do not call this production MCP readiness, five-handler live evidence, Hermes integration, learning evidence or launch. The next permissible planning artifact is a bounded Inspector discovery-compatibility repair/validation packet. It must choose and synthetically prove an exact metadata mechanism, obtain separate code/deployment authority if a route compatibility change is selected, and require a new owner approval for any later live window. AA2-C4B remains blocked.
