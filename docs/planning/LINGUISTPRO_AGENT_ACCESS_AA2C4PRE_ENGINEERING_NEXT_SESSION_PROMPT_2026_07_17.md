# Next-session prompt — LinguistPro Agent Access AA2-C4-PRE default-off production-handler engineering

> **Consumed 2026-07-17:** the authorized engineering completed on branch `aa2-c4pre-production-handlers`, package `3.11.197`. See `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_EVIDENCE_2026_07_17.md`. Do not reuse this prompt to deploy: the next possible step requires a separate exact-revision default-off production deployment approval, and C4A remains blocked.

Работаем в `E:\projects\tts-prototype-android`.

Это отдельная engineering-сессия AA2-C4-PRE. Реализуй только пять production-shaped read-only MCP handlers и exact-one owner allowlist contract на локальных synthetic fixtures. Не переходи к production deploy, C4A, Inspector/Hermes production configuration или live connection.

## Exact owner approval

> Утверждаю AA2-C4-PRE default-off production-handler engineering по packet от 2026-07-17 для baseline revision `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`. Разрешаю только scoped code/docs изменения из allowlist packet: реализовать пять thin read-only production handlers над указанными deterministic repositories/shipped public catalog artifacts, exact-one fail-closed `AGENT_ACCESS_OWNER_IDS` contract, user/client/connection isolation, synthetic temporary-DB/sidecar tests, zero-write/zero-provider/zero-network tripwires, package bump `3.11.196 -> 3.11.197`, content-safe evidence и scoped commit/push. Не разрешаю production runbook/production data access, config/env mutation, deploy/restart, production owner allowlist configuration, client activation, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, `AGENT_ACCESS_MCP_ENABLED=1`, authorization/consent/token/revoke flow, Inspector/Hermes production configuration, MCP/live connection, DCR/CIMD, client secret/shared bearer/token passthrough, реальные credentials/tokens, private learner/F1/F2 payload reads, canonical writes, provider/LLM/BYOK calls, migration/API/UI/scope/schema changes, unrelated repair или AA2-C4A/C4B.

Approval authorizes engineering only. A push may cause the normal docs/code auto-build behavior, but it does not authorize production env/config mutation, manual deploy/restart, flag changes or production verification beyond public read-only health/revision checks already allowed by repository convention. If push itself would initiate a production deployment whose safety cannot be bounded without production instructions, stop before push and request separate approval; do not read the private runbook as a workaround.

## Confirmed starting point

- expected local/origin `main`: `854411cd7069c6c0f8e3695cf295fc84e1d268ea`;
- expected package: `3.11.196`;
- C1: exact `@modelcontextprotocol/sdk@1.29.0`, protocol `2025-11-25`, stateless `/agent-access/mcp`, independent default-off MCP gate, 45-check fixture smoke;
- C2: exact Inspector `0.22.0` and Hermes Agent `0.18.2`, static public clients, synthetic two-client loopback pass, zero DCR;
- C3: two production rows exist as `SUSPENDED`; lifecycle counts were zero; no client was activated;
- current production wiring at the baseline still has `handlers: {}`;
- C4A is prepared but blocked until C4-PRE engineering and a later separately approved default-off deployment complete;
- current intended terminal status:

```text
FIVE_PRODUCTION_HANDLERS_ENGINEERING_COMPLETE /
OWNER_EXACT_ONE_FAIL_CLOSED /
DEFAULT_OFF /
NO_PRODUCTION_CONNECTION
```

## Read fully before mutation

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`
5. `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`
6. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA1_OAUTH_TOOL_SCHEMA_THREAT_MODEL_CONTRACT_2026_07_16.md`
7. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2_READ_ONLY_EXECUTION_APPROVAL_PACKET_2026_07_17.md`
8. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B_OAUTH_PERSISTENCE_AUTHORIZATION_SERVER_EXECUTION_APPROVAL_PACKET_2026_07_17.md`
9. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B2_FIRST_PARTY_CONSENT_RESOURCE_VALIDATOR_EXECUTION_PACKET_2026_07_17.md`
10. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2B3_DEFAULT_OFF_OAUTH_DEPLOYMENT_EXECUTION_PACKET_2026_07_17.md`
11. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md`
12. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C1_DEFAULT_OFF_MCP_ENGINEERING_EVIDENCE_2026_07_17.md`
13. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C2_TWO_CLIENT_LOOPBACK_COMPATIBILITY_EVIDENCE_2026_07_17.md`
14. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C3_PRODUCTION_REGISTRATION_STILL_DISABLED_EXECUTION_PACKET_2026_07_17.md`
15. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C3_PRODUCTION_REGISTRATION_STILL_DISABLED_EVIDENCE_2026_07_17.md`
16. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_PACKET_2026_07_17.md`
17. `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_PACKET_2026_07_17.md`

Do not read `.claude/PROD_OPS_PRIVATE.md`; this is not a production operation. Do not read F1/F2/private learner payloads. Live code, migrations and shipped artifacts outrank planning prose if they differ.

## Mandatory preflight report before mutation

Report briefly:

1. exact local/origin `main`, package and clean/dirty state;
2. all unrelated owner files that will be excluded;
3. whether baseline `854411c` is present and whether unknown Agent Access changes exist after it;
4. exact SDK/protocol pins and existing C1/C2 smoke state;
5. current `handlers: {}` wiring and current owner allowlist parser behavior;
6. exact source functions/artifacts for each proposed handler;
7. exact files to be changed;
8. all discrepancies and stop conditions.

Do not print credentials, tokens, cookies, CSRF, authorization codes, owner ID, private storage paths or full request headers.

## Preserve the existing working tree

The previous docs session intentionally left these Agent Access files local and uncommitted; preserve and include them in the eventual scoped C4-PRE commit:

```text
docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C_MCP_STATIC_CLIENT_LIVE_CONNECTION_DECISION_EXECUTION_PACKET_2026_07_17.md
docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4A_INSPECTOR_FIRST_CONTROLLED_OWNER_LIVE_VALIDATION_PACKET_2026_07_17.md
docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_PACKET_2026_07_17.md
docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_ENGINEERING_NEXT_SESSION_PROMPT_2026_07_17.md
```

Known unrelated owner files must be excluded from staging and must not be read for payload content:

```text
.agents/
docs/planning/LINGUISTPRO_WAVE2_F1_CORRECTABLE_CONTINUITY_DECISION_PACKET_2026_07_16.md
docs/planning/LINGUISTPRO_WAVE2_F1_OWNER_LIVE_EXECUTION_PACKET_2026_07_16.md
docs/planning/LINGUISTPRO_WAVE2_REPLAN_DECISION_PACKET_2026_07_15.md
docs/planning/LINGUISTPRO_WAVE2_F2_EVIDENCE_CHAIN_DECISION_PACKET_PROMPT_2026_07_16.md
docs/planning/LINGUISTPRO_WAVE2_F2_SUFFICIENT_SHADOW_SEQUENCE_DECISION_2026_07_16.md
docs/research/edu-quality-agentic/
```

Do not use reset, checkout, clean or broad staging. If another unknown overlapping Agent Access modification exists, stop and report it.

## Exact implementation allowlist

Allowed tracked changes are only:

```text
agent/access/productionHandlers.js
agent/access/publicReadingCatalog.js
db/learnerGraphRepo.js
db/agentRepo.js
server.js
scripts/premium/agent-access-production-handlers-smoke.js
package.json
package-lock.json
the four Agent Access docs listed above
a new content-safe C4-PRE engineering evidence document
```

No dependency upgrade is approved. No migration, API/UI route, OAuth/MCP schema/scope, provider module, public corpus body or production runbook change is approved. If another file is genuinely required, stop and request a revised allowlist before editing it.

## Required handler implementation

Implement exactly the mappings in the C4-PRE packet:

1. `get_learning_brief`
   - non-ignored scheduled/due/24h-urgent aggregates from `srs_projections` plus existing manual-ignore semantics;
   - deterministic estimate, priority and 5-minute TTL;
   - metadata-only latest open plan action projection; never call `planner.plan()` or read item keys into the handler.
2. `get_review_summary`
   - same aggregate snapshot, fixed false handoff fields and 2-minute TTL.
3. `search_public_reading_catalog`
   - only exact versioned shipped root/search/index sidecars;
   - Hebrew public metadata only; exact era/genre map, ready/audio/length honesty, deterministic sorting and request-bound cursor;
   - no body, FTS-body index, OPFS profile, personalized rank or network fetch.
4. `get_recent_explanation_metadata`
   - user-scoped SQLite JSON metadata projection returning no body/source fields to application code;
   - closed kinds, known construct IDs and purge state; no silent timestamp-boundary loss.
5. `get_agent_connection`
   - only the current validated user/client/connection and active grants;
   - exact binding and no token/subject/other-connection leakage.

Wire the factory in `server.js` only inside the existing four exact-`1` MCP runtime gate. With flags off, no handler, DB read, catalog load, owner parsing, audit or runtime construction may occur.

## Exact-one owner contract

`AGENT_ACCESS_OWNER_IDS` must accept exactly one unique valid opaque ID and reject absent, empty, wildcard, malformed, duplicate or multiple values. Pass the same frozen one-element allowlist to validator and service. Evidence may state only `owner_allowlist_count=1` and match booleans; never print the ID. Do not derive an owner from email, session, DB order or client ID.

## Required validation

Use only temporary synthetic SQLite state and temporary synthetic public sidecars. Add and run the focused production-handler smoke plus:

```text
npm run smoke:agent-access:mcp
npm run smoke:agent-access:oauth
```

Run the C2 two-client smoke and all directly neighboring Agent Access contract/consent/deployment tests discovered in `package.json`. Prove:

- all five exact outputs and TTLs;
- non-ignored aggregate parity and overflow fail-closed behavior;
- every actual shipped v7 era/genre mapping;
- deterministic total order and stale/tampered cursor rejection;
- metadata-only explanation reads, purge and timestamp-collision handling;
- exact current-connection binding;
- cross-user/client/connection isolation;
- owner absent/wildcard/malformed/duplicate/multi rejection;
- output poisoning/byte/cardinality rejection;
- exact zero external network/provider/LLM/BYOK calls;
- exact zero deltas in learner, OAuth, consent, audit and erasure tables;
- no raw token/private-body sentinel in stdout, logs or evidence.

Do not invoke external clients or any production route during fixture execution.

## Stop conditions

Stop without workaround if:

- local/origin baseline, package, SDK or protocol pin differs unexpectedly;
- a handler requires provider/network/write/private learner/F1/F2 data;
- exact schema/TTL/scope cannot be met from the mapped deterministic authority;
- metadata cannot be projected without returning explanation/source bodies to application code;
- catalog mapping/version/join/cursor is ambiguous;
- exact-one owner cannot be proven content-safely;
- any migration, API/UI/scope/schema/dependency or unrelated change is required;
- any test, no-write, no-provider or isolation gate fails;
- production access, private runbook, owner value, client activation, flag change, OAuth flow or live MCP call becomes necessary.

Do not add DCR/CIMD, registration endpoint, client secret, shared bearer, token passthrough, fallback handler or synthetic production result.

## R1-R17 disposition

Record explicitly:

- R2/R5: handler/client interoperability is not learning value, Hermes integration or launch evidence;
- R9/R12: external memory and MCP business-logic authority remain absent; handlers are thin projections with no dual-write;
- R11/R17: external prose/evaluator/grade/evidence authority remains absent;
- R14: exact owner/user/client/connection isolation and argument-independent identity;
- R15: metadata minimization plus deliberate subject/consent/erasure residue;
- R16: zero polling/provider/managed-LLM cost;
- other roles retain deterministic, public-metadata honesty, rollback and do-no-harm boundaries.

## Evidence, commit and terminal handoff

After all gates pass:

1. bump package exactly `3.11.196 -> 3.11.197` with lock parity;
2. create a content-safe C4-PRE engineering evidence document;
3. stage only the explicit allowlist and show the scoped diff/status;
4. commit with an AA2-C4-PRE-specific message;
5. before push, apply the push/auto-deploy boundary in the approval above; if unsafe or ambiguous, stop with the local commit and request approval;
6. if push is authorized and safe, push only the scoped commit;
7. stop. Do not perform production deploy/config/restart, default-off production verification, C4A or C4B.

Return:

- exact before/after revision and package;
- five-handler mapping/result table;
- owner allowlist positive/negative table;
- synthetic and regression commands/results;
- zero-write/provider/network proof;
- changed files and scoped commit/push status;
- deviations/stop conditions;
- exact actions still prohibited;
- a proposed separate default-off production deployment approval packet, without executing it.

Successful engineering status:

```text
FIVE_PRODUCTION_HANDLERS_ENGINEERING_COMPLETE /
OWNER_EXACT_ONE_FAIL_CLOSED /
DEFAULT_OFF /
NO_PRODUCTION_CONNECTION
```

Do not call this production MCP readiness, Hermes integration, live evidence, learning evidence or product launch.
