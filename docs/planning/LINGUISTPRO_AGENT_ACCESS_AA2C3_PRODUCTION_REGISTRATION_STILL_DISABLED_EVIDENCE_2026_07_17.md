# LinguistPro Agent Access AA2-C3 production-registration-still-disabled evidence

**Date:** 2026-07-17

**Observation completed:** `2026-07-17T04:06:14Z`

**Status:** `TWO_STATIC_PUBLIC_CLIENTS_SUSPENDED / CLIENTS_GATE_OFF / MCP_GATE_OFF / ZERO_CONNECTIONS / ZERO_TOKENS / NO_LIVE_CONNECTION`

This is production registry/default-off evidence only. It is not client activation, production MCP readiness, Hermes integration, a live connection, learning evidence or product-launch evidence.

## 1. Authority and scope

The owner separately approved exact AA2-C3 execution for production revision `5d34eb3c71c1cee6545aa15f5eeab95b19480c60`, package `3.11.196`: one fresh backup, one atomic transaction creating exactly the reviewed Inspector `0.22.0` and Hermes `0.18.2` static public rows initially as `SUSPENDED`, content-safe checks, a 15-minute zero-delta observation, rollback if required and docs-only evidence.

The approval prohibited deploy/restart, client/MCP gate enablement, activation, subject/connection/grant/code/token/denial creation, authorization/consent/token/revoke, external-client production configuration, MCP/live calls, DCR/CIMD, secrets, private learner/F1/F2 reads, canonical writes, provider calls, code/migration/API/UI changes and AA2-C4.

No prohibited action was performed.

## 2. Exact preflight

| Gate | Result |
|---|---|
| Local/origin/production revision | exact `5d34eb3c71c1cee6545aa15f5eeab95b19480c60` |
| Local/production package | exact `3.11.196` |
| `/healthz` | HTTP `200`; DB and migrations ready |
| Migration 042 | present |
| Direct backend bindings | `0` |
| OAuth UI/runtime flags | exact `1 / 1` |
| OAuth clients gate | exact `0` |
| MCP gate | absent, therefore fail-closed |
| First-party/OAuth proxy flags | exact `1 / 1` |
| Clients / subject mappings | `0 / 0` |
| Connections / grants / codes | `0 / 0 / 0` |
| Token families / refresh tokens / denials | `0 / 0 / 0` |

Production was already on the exact candidate before C3. C3 performed no deploy, restart, env change or image mutation.

## 3. Backup evidence

The approved production backup mechanism completed successfully before the registry transaction:

- non-empty backup count changed `8 -> 9`;
- the new artifact was non-empty;
- content-safe verification observed the newest artifact age as approximately `0.1` seconds;
- no backup path, database path, infrastructure coordinate or private content was recorded.

## 4. Atomic registration evidence

The existing `registerClientFixture` helper was not used because it creates an initially `ACTIVE` row. One `BEGIN IMMEDIATE` transaction instead:

1. loaded the exact two profiles from the deployed contract;
2. validated both through the existing OAuth client contract;
3. rechecked exact-zero registry and dependent counts inside the transaction;
4. inserted both rows directly as literal `SUSPENDED` with parameterized values;
5. reread every reviewed public field and all dependent counts;
6. committed only after every assertion passed.

Transaction result:

| Client | Version | Type | Status | Redirect count | Registration version |
|---|---:|---|---|---:|---|
| `linguistpro-mcp-inspector-v0` | `0.22.0` | `PUBLIC` | `SUSPENDED` | `2` | `aa2-c3-static-v1` |
| `linguistpro-hermes-owner-v0` | `0.18.2` | `PUBLIC` | `SUSPENDED` | `1` | `aa2-c3-static-v1` |

The production client table has no client-secret column. No secret, bearer, credential or token material was supplied or stored.

## 5. Independent post-check

| Gate | Result |
|---|---|
| Production revision | unchanged exact candidate |
| OAuth clients gate | exact `0` |
| MCP gate | absent |
| Registry | exactly two reviewed rows; both `SUSPENDED` |
| Subject mappings | `0` |
| Connections / grants | `0 / 0` |
| Authorization codes | `0` |
| Token families / refresh tokens | `0 / 0` |
| Access-token denials | `0` |
| Health | HTTP `200` |
| Protected-resource / AS metadata / JWKS | HTTP `200 / 200 / 200` |
| MCP without bearer | HTTP `404` before runtime dispatch |

No authorization, interaction, consent, token or revoke route was invoked. No Hermes or Inspector production client was configured.

## 6. Fifteen-minute zero-delta observation

Sixteen content-safe probes ran at minute `0` through minute `15`. Every probe returned:

- production revision exact: `true`;
- health: HTTP `200`;
- OAuth clients gate: `0`;
- MCP gate: absent;
- client rows: exactly `2`;
- client status distribution: exactly `{SUSPENDED: 2}`;
- subject mappings, connections, grants, codes, token families, refresh tokens and denials: all exact `0`.

Observed lifecycle delta: exact zero. No rollback condition fired.

## 7. Local regression evidence

| Gate | Result |
|---|---|
| Agent Access domain | PASS — 20 checks, five capabilities, zero network/provider/live reads |
| OAuth lifecycle + restore | PASS — 24 lifecycle checks; zero raw/exported secrets; restore isolation |
| OAuth deployment/B0/consent bridge | PASS |
| MCP | PASS — 45 checks, five tools, exact `2025-11-25`, zero sessions/network/provider/live reads |

No application code, migration, API or UI changed in C3.

## 8. Exact zero and absence record

| Prohibited surface | Observed count/state |
|---|---|
| Client activation | `0` active clients |
| Subject/connection/grant/code/token/denial rows | all `0` |
| Authorization/interaction/consent/token/revoke execution | `0` |
| MCP/live calls | `0`; MCP stayed `404` |
| DCR/CIMD/registration HTTP requests | `0` |
| Hermes/Inspector production configuration | absent |
| Client secret/shared bearer/token passthrough | absent |
| Provider/LLM/BYOK calls | `0` |
| Private learner/F1/F2 reads | `0` |
| Canonical learner writes | `0` |
| Deploy/restart/env mutation | `0` |

## 9. R1–R17 boundary record

- **R1/R3/R6/R7/R8/R13:** exact revision, deterministic validation, atomic DB transaction, closed metadata, aggregate evidence and delete-only rollback remain authoritative.
- **R2/R5:** suspended registry rows create no learning value, mastery evidence, product validation or launch evidence.
- **R4:** no consent/live UI occurred; mobile/RTL evidence remains a C4 prerequisite.
- **R9/R12:** no external memory or second MCP/business-logic authority was introduced.
- **R10:** the two clients remain independently activatable later; neither is active now.
- **R11/R17:** external prose/evaluator/grade/evidence authority remains absent.
- **R14/R15:** production registry metadata exists, but production consent, connections and downstream delivery remain absent.
- **R16:** zero polling, provider, BYOK, managed-LLM and MCP execution cost.

## 10. Stop, rollback and next boundary

No stop condition fired; the fresh backup and delete-only rollback were not used after registration.

AA2-C4 remains separately prohibited. A future packet/approval must name exactly one client, scopes, owner boundary, time window, activation and flag sequence, allowlisted calls, observation and rollback. Inspector must be activated, validated, revoked and returned to the approved state before a separate Hermes live window is considered.

The approved docs-only publication must not cause a production deploy/restart. Because the production runbook states that a push to auto-deployed `main` triggers a build/deploy, the evidence may be committed locally but must not be pushed to `main` under the present no-deploy authority unless the owner separately resolves that conflict.
