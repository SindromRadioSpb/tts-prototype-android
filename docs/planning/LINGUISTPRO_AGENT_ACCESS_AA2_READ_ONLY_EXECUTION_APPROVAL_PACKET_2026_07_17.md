# LinguistPro Agent Access — AA2 read-only execution approval packet

**Date:** 2026-07-17

**Status:** `AA2-A ENGINEERING_COMPLETE / AA2-B0 COMPLETE IN SUCCESSOR / LIVE_RUNTIME_ABSENT / AA2-B1-C GATED`.

**Authority:** this packet authorizes only AA2-A: default-off closed contracts, capability registry, a transport-neutral Agent Access domain service, content-safe scenario registration and fixture/smoke validation. It does not authorize an OAuth authorization/resource endpoint, MCP endpoint/adapter/client, credential/token/client registration, connection persistence, migration, SDK dependency, UI/config/env change, provider call, live external connection, real private-data read, CP0 live window, AA3 action or public launch.

**Owner approval:** 2026-07-17 — start implementation after the approved AA0/AA1/AA2 documentation commit is pushed. The narrow AA2-R0 surface is a safe first increment, not the long-term product ceiling.

**Implementation baseline:** approved documentation commit `2cbc2fa`; implementation package checkpoint `3.11.190`; F2 `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`, deployed default-off.

**Canonical parents:**

- `LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`;
- `LINGUISTPRO_AGENT_ACCESS_AA0_NO_SECRET_EXECUTION_DECISION_2026_07_16.md`;
- `LINGUISTPRO_AGENT_ACCESS_AA1_OAUTH_TOOL_SCHEMA_THREAT_MODEL_CONTRACT_2026_07_16.md`.

## 1. Decision

Choose **Option B: staged domain-service-first implementation**.

| Option | Shape | Decision |
|---|---|---|
| A — build the remote OAuth/MCP stack now | AS/RS, persistence, adapter, clients and live wiring in one slice | Reject now: too much security and lifecycle surface before the business contract is executable. |
| **B — AA2-A domain service first** | Closed schemas, capability registry, trusted-principal checks, injected deterministic handlers and fixture gates; no transport or persistence | **Approved.** Proves the safe business boundary while remaining reversible and network-free. |
| C — keep planning only | No executable contract | Reject: owner approved starting implementation and contract drift would remain untested. |

AA2-A proves that a future external client can request one of five useful, bounded capabilities through a transport-neutral policy layer without receiving credentials, raw review data, F1/F2 payloads or write authority. It does not prove OAuth, MCP compatibility, production readiness or learning efficacy.

## 2. Capability surface

| Capability/tool | Scope | Purpose | AA2-A data source |
|---|---|---|---|
| `get_learning_brief` | `learning.brief.read` | `next_learning_action` | Fixture/injected handler only |
| `get_review_summary` | `review.summary.read` | `review_session_handoff` | Fixture/injected handler only |
| `search_public_reading_catalog` | `reading.public.search` | `public_reading_discovery` | Fixture/injected handler only |
| `get_recent_explanation_metadata` | `explanations.metadata.read` | `explanation_revisit` | Fixture/injected handler only |
| `get_agent_connection` | `agent.connection.read` | `connection_self_inspection` | Fixture/injected handler only |

No capability accepts `user_id`, `connection_id`, scope, principal, credential, token, SQL, URL callback, arbitrary filter object or prompt text in model-controlled arguments. Identity and grants come only from a future trusted adapter after token validation.

Reserved future `handoff.create` and `lesson.intent.create` are absent from the executable registry. AA2-R1/AA3/AA4 additions require versioned contract amendments; existing grants never widen silently.

## 3. Exact AA2-A files

Authorized additions/changes:

1. `agent/access/contracts.js` — closed input/output/error validation and byte/cardinality caps;
2. `agent/access/capabilities.js` — immutable tool/scope/purpose/scenario registry;
3. `agent/access/service.js` — default-off transport-neutral policy/service boundary with injected handlers;
4. `scripts/premium/agent-access-domain-smoke.js` — positive/negative fixture matrix and forbidden-import/network tripwire;
5. `agent/controlPlane/scenarioRegistry.js` and the minimum closed surface enum change, if required, for five content-safe external-agent scenarios;
6. `package.json`/lockfile — smoke command and normal package version checkpoint only; no dependency addition.

Explicitly forbidden in AA2-A:

- `server.js` route or any HTTP listener;
- database access, migration or persistent connection/grant/token record;
- OAuth metadata, authorization/token/revoke endpoint or signing key;
- MCP SDK, protocol transport or client configuration;
- browser cookie/CSRF/bearer parsing;
- import of review/FSRS/mastery/word-status/consent/delete writers;
- import of provider/model routing;
- reading production/private owner data;
- Hermes installation, upgrade, profile, skill, cron or channel mutation.

## 4. Service contract

The future trusted adapter supplies a principal containing:

```text
user_id
oauth_client_id
connection_id
external_actor_id
request_id
scopes
connection_status
access_expires_at
```

AA2-A validates the same boundary with fixtures. Execution is allowed only when:

1. the global service flag is true in the constructed test instance;
2. the principal is closed and every required identifier is present and bounded;
3. the owner is in the explicit owner allowlist;
4. the connection status is active and access has not expired;
5. the required capability scope is present;
6. the capability is enabled and its exact purpose is server-bound;
7. input schema and maximum serialized bytes pass;
8. an injected handler exists;
9. output schema and maximum serialized bytes pass.

The handler receives a frozen principal projection plus normalized input and purpose. It does not receive a bearer token. The service returns a closed success/error envelope. Unknown tools, fields, enums or oversized payloads fail closed.

MCP is not imported. A future MCP adapter may only translate protocol messages to this service and translate its result/error back; it may not query repositories, interpret learner state or construct pedagogical recommendations.

## 5. Content-safe CP0 mapping

Register one scenario ID per capability. Allowed observation dimensions remain metadata only:

```text
scenario_id
capability_id
scope_id
role_id
surface
status/error_code
latency_bucket
size_bucket
cardinality_bucket
request correlation hash
```

Never capture token, user text, search query, returned title/URL/body, counts, explanation IDs, F1/F2 fields, tool arguments/results or external prose. Scenario registration is not CP0 enablement and creates no live observation.

## 6. Required AA2-A gates

The smoke must prove:

1. global default-off rejection;
2. exact owner allowlist;
3. missing/unknown/expired/disabled connection rejection;
4. missing scope and unknown tool rejection;
5. closed principal, input, output and error envelopes;
6. rejection of identity/grant fields inside model-controlled arguments;
7. byte, string, array and result-cardinality caps;
8. all five valid fixture paths;
9. invalid handler output cannot escape;
10. capability registry and CP0 scenario parity;
11. no network/provider call and no forbidden business-writer/server/database import;
12. existing CP0 smoke and focused API/auth regression remain green.

The implementation is not complete merely because happy-path fixtures pass.

## 7. AA2-B and AA2-C gates

### AA2-B — B0 complete in successor; B1+ OAuth protocol/runtime gated

Persistence/lifecycle B0 is `ENGINEERING_COMPLETE / NO_OAUTH_ENDPOINT` under `LINGUISTPRO_AGENT_ACCESS_AA2B_OAUTH_PERSISTENCE_AUTHORIZATION_SERVER_EXECUTION_APPROVAL_PACKET_2026_07_17.md`. The certified-AS loopback, issuer/key/audience protocol layer, Origin/Host/CORS controls, rate limiters and every endpoint remain separately gated as B1+.

### AA2-C — thin MCP adapter and client proof, not authorized here

Requires the seven-day compatibility refresh, exact stable SDK/protocol pins, updated Hermes or an explicitly supported version, a second independent MCP client, loopback OAuth/MCP matrix, no-token-passthrough proof, load/polling tests and a separate default-off deployment/live-launch decision.

The installed owner-host Hermes `v0.16.0` is inventory, not compatibility evidence. No Hermes mutation is authorized by AA2-A.

## 8. F1/F2 and authority boundary

- AA2-A reads no real F1/F2 payload.
- F1 goals/threads and F2 shadow results are not external-agent truth.
- No F1/F2 field or artifact becomes a scope or fixture source.
- Future minimized advisory summaries require new consent/scope/schema/retention/authority amendments.
- External prose is not a grade, evaluator result, mastery claim, evidence record or canonical LinguistPro decision.
- Revocation will stop future access; it cannot promise deletion of data already delivered to external storage.

## 9. Threat checkpoint

| Threat class | AA2-A prevention/detection | Rollback/stop | Future accountable owner |
|---|---|---|---|
| Stolen token / token passthrough | No token exists or is accepted; static forbidden-token/import scan | Remove AA2-A module; stop if any token field reaches handler | Security/OAuth owner |
| Wrong user/client/connection / cross-profile | Closed trusted principal, allowlist, active/expiry/scope checks; negative fixtures | Global off; stop on any cross-binding acceptance | Identity/Agent Access owner |
| Prompt-injected call / scope escalation | Closed arguments cannot carry identity, scope or purpose; purpose is registry-bound | Disable capability; stop on unknown-field acceptance | Agent Access service owner |
| Tool-description poisoning | Registry is immutable code, not client prose; parity test | Pin/revert registry | MCP adapter owner |
| Replayed handoff | No handoff capability in AA2-A | Stop if handoff appears in registry | Handoff/security owner |
| Private transcript retention / chaining/exfiltration | Aggregate/metadata schemas, output caps, no body/F1/F2; sentinel fixtures | Disable capability; incident review on prohibited field | Privacy/support owner |
| Duplicate reminders | No delivery/reminder capability | Stop if service sends or schedules anything | Notification controller owner |
| External prose claiming mastery | Service emits structured canonical fields only; no prose ingestion | Disable offending capability/client | Pedagogy/truth owner |
| Polling/load/cost amplification | No endpoint/provider; bounded service payload; future rate gate remains mandatory | Keep transport absent | Reliability/economics owner |
| CP0/consent/controller bypass | No live data/controller access; scenario registry metadata only | Remove module/scenarios | Privacy/control-plane owner |

Content-safe evidence is the named fixture result, error code, schema version, scenario parity and static/network tripwire result—never request/result content.

## 10. R1–R17 adversarial review

| Lens | AA2-A answer |
|---|---|
| R1 | No linguistic body/truth is exposed or generated. |
| R2 | Capabilities map to review, reading and explanation revisit; later evidence measures opened/completed first-party action, not tool volume. |
| R3 | Principal/request IDs are authorization and correlation inputs, never authority by existence. |
| R4 | No UI/deep-link mutation in this slice; mobile/RTL proof remains a later gate. |
| R5 | Architecture is vendor-neutral; no interoperability/product claim before two clients. |
| R6 | Public search remains public metadata only. |
| R7 | No external prose is canonicalized. |
| R8 | No lesson build, draft or persistent scaffolding. |
| R9 | External memory and F1/F2 remain outside learner truth. |
| R10 | Fixture success is not live-client evidence. |
| R11 | Handler output is schema-checked but never self-certified as grade/evidence. |
| R12 | Domain service owns policy; future MCP remains a thin adapter; no writer/repository import. |
| R13 | Additive files and default-off construction make rollback deletion/revert safe. |
| R14 | Principal/client/connection/scope isolation has mandatory negatives before transport. |
| R15 | No delivery occurs; future consent and downstream-retention disclosure remain mandatory. |
| R16 | No endpoint, polling task, SDK or managed LLM spend. |
| R17 | No answers, evaluator, grade, mastery or evidence write path exists. |

## 11. Exact stop conditions

Stop AA2-A and return to the owner if:

1. implementation requires an endpoint, cookie, CSRF value, bearer token, migration, OAuth/MCP dependency or live client;
2. a handler must import database repositories or canonical learner-state/consent/delete/provider writers;
3. any tool needs review items/answers, personal body, explanation body, F1/F2 payload or arbitrary prose;
4. identity, connection, scope or purpose can be supplied in tool arguments;
5. an unknown field or oversized input/output can pass;
6. output validation, owner isolation or default-off behavior fails;
7. audit/CP0 proof would require content, token or user-data capture;
8. a reminder/delivery, handoff or lesson intent becomes reachable;
9. existing CP0/auth/API focused regression fails;
10. unrelated dirty owner files cannot be preserved in a scoped commit.

## 12. Rollback

AA2-A has no schema, data or external state. Rollback is: keep the service unconstructed/off, remove the package smoke command and revert the additive `agent/access` modules/scenario entries. No token revocation, data repair or client coordination is required because none exists.

## 13. Definition of done and next approval packet

AA2-A is `ENGINEERING_COMPLETE / LIVE_RUNTIME_ABSENT` only after all §6 gates pass, code is reviewed under R1–R17, only scoped files are committed/pushed, and the packet records exact evidence. It must not be described as OAuth, MCP or Hermes integration.

The next separate packet is **AA2-B OAuth persistence and authorization-server execution approval**. It must include the complete items in §7 and AA1 §§12–18. Only after AA2-B fixture/loopback closure may an **AA2-C MCP adapter/client execution approval** be requested.

## 14. Before / after

**Before:** AA1 defines a secure, extensible Agent Access contract, but nothing executable enforces its tool/principal boundary.

**After AA2-A:** a default-off, network-free, transport-neutral service can execute five closed fixture capabilities through injected handlers and reject cross-scope/oversized/poisoned calls. No OAuth server, MCP endpoint, Hermes connection or private-data access exists.

## 15. Engineering evidence — 2026-07-17

Implemented exactly the additive AA2-A slice:

- five closed capability contracts and immutable scope/purpose/scenario registry;
- trusted-principal, owner-allowlist, status/expiry/scope/purpose and connection-binding checks;
- injected fixture-only handlers with closed output validation and content-safe error envelopes;
- five `external_agent` CP0 scenario registrations; observer remains default-off and no AA2 runtime hook exists;
- no route, migration, database/repository/provider import, dependency, OAuth/MCP token/client or Hermes mutation.

Gate results:

| Gate | Result |
|---|---|
| `npm run smoke:agent-access` | **PASS** — 20 checks, 5 capabilities, 0 network calls, 0 provider calls, 0 live-data reads |
| `npm run smoke:cp0` | **PASS** — observer/integration/parity/lifecycle/restore/process-failure; 40 registered scenarios, prior 35 expected scenarios preserved |
| `npm run test:api-smoke` | **PASS** — server/auth/owner-token/Mini App default-off regression green |
| `npm test` | **BASELINE DEBT, not AA2-A failure** — 269/278 pass; one stale classic-mode DOM expectation for `btnTableCustomizeToggle`, plus eight premium translation-pipeline tests requiring an absent GCP BYOK key |

No failing full-suite test imports or exercises `agent/access/*`. AA2-A's required focused gates are green. The unrelated nine-test baseline is recorded rather than repaired outside this authority.
