# Next-session prompt — AA2-C4-PRE default-off production-handler deployment

**Handoff status:** `CONSUMED / DEPLOYMENT_COMPLETE / DEFAULT_OFF / NO_PRODUCTION_CONNECTION` on 2026-07-17 for exact packet-carrier `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`, package `3.11.197`. Do not rerun this prompt. Continue only from a separately approved C4A packet.

Work in `E:\projects\tts-prototype-android`.

This prompt was the durable handoff for the completed production deployment session. It is retained as audit context, not execution authority. Its approval was consumed and grants no permission for another deploy, restart, production mutation or C4A/C4B action.

## Read fully before action

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`
5. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md`
6. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C3_PRODUCTION_REGISTRATION_STILL_DISABLED_EVIDENCE_2026_07_17.md`
7. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_PACKET_2026_07_17.md`
8. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_EVIDENCE_2026_07_17.md`
9. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`
10. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_PACKET_2026_07_17.md`

Read `.claude/PROD_OPS_PRIVATE.md` only after exact execution approval and only locally for the minimum deployment/rollback coordinates. Never reproduce its contents.

## Expected candidate

```text
reviewed handler revision = 57527403893b8291a1648d989eead743a349cb96
package                   = 3.11.197
protocol                  = 2025-11-25
MCP SDK                   = @modelcontextprotocol/sdk@1.29.0 exact
main baseline             = 854411cd7069c6c0f8e3695cf295fc84e1d268ea
```

The final packet-carrier commit will be a docs-only descendant of the reviewed handler revision and will be supplied in the owner handoff. Any code delta after `5752740`, `main` divergence or ambiguous ancestry is a stop condition.

Expected production pre-state must be refreshed, not assumed:

```text
OAuth UI/runtime flags = 1 / 1
OAuth clients gate     = 0
MCP gate               = absent or 0
static clients         = exactly 2, both SUSPENDED
owner allowlist        = absent/unconfigured
all lifecycle counts   = 0
```

## Preserve working tree

Known unrelated owner files and research directories must remain untouched and unstaged. Never use `git reset --hard`, `git checkout --`, `git clean`, broad `git add`, force-push or history rewriting.

If an unknown overlapping Agent Access change exists or the exact deployment commit cannot be isolated, stop.

## Preflight before mutation

Report:

1. exact HEAD/candidate remote/local main/origin main/package/lock;
2. clean/dirty state and excluded owner files;
3. exact ancestry and diff after `5752740`;
4. production revision/package/health;
5. flag presence and `0/1` only;
6. exactly two suspended reviewed clients and zero active clients;
7. subject/connection/grant/code/token/denial aggregate counts;
8. migration 042 and no candidate migration;
9. backup/prior-image/auto-deploy rollback readiness;
10. every discrepancy and stop condition.

Do not print any owner ID, secret, token, credential, cookie, private path, production coordinate or learner content.

## Required local gates

Run the full matrix in the deployment packet §6 on the exact candidate. Restore the frozen Hermes `0.18.2` MCP extra in ignored scratch if needed. All compatibility tests remain loopback/synthetic; do not contact production MCP.

Do not weaken tests, change code on `main` or expand scope to obtain green.

## Exact allowed execution

Only after the owner provides the exact §15 approval:

1. perform the approved read-only production preflight;
2. create one fresh content-safely verified backup;
3. require exact linear fast-forward ancestry;
4. push only the owner-named commit to `main`, triggering the normal auto-deploy;
5. make no env/config/secret/proxy/DB/client/status/flag change;
6. verify exact revision/package and consecutive healthy `/healthz`;
7. prove OAuth client routes remain `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED`;
8. prove `/agent-access/mcp` remains `404 AGENT_ACCESS_MCP_DISABLED` before runtime/owner parsing;
9. prove both clients remain `SUSPENDED`, owner allowlist remains unconfigured and all lifecycle counts remain zero;
10. observe for 15 minutes, write content-safe evidence, commit/push it only on a separate non-deploy branch and stop.

Do not configure Inspector or Hermes, activate a client, enable a flag, start OAuth, call MCP or proceed to C4A.

## Rollback

On any stop condition keep both gates off, cancel the failed deployment when applicable, restore the prior application image/revision, verify baseline health/default-off/zero-state and record content-safe evidence. Do not change DB rows or secrets. Do not reset or force-push git history.

## Terminal status

Successful deployment may be called only:

```text
FIVE_PRODUCTION_HANDLERS_DEPLOYED_DEFAULT_OFF /
TWO_STATIC_CLIENTS_SUSPENDED /
OWNER_ALLOWLIST_UNCONFIGURED /
CLIENTS_GATE_OFF /
MCP_GATE_OFF /
ZERO_LIVE_AUTHORITY /
NO_PRODUCTION_CONNECTION
```

After success, C4A is still not approved. Rebase its packet to the exact deployed revision and request a separate Inspector-only owner-live approval.
