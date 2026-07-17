# LinguistPro Agent Access AA2-C4-PRE default-off production-handler engineering evidence

**Date:** 2026-07-17

**Status:** `FIVE_PRODUCTION_HANDLERS_ENGINEERING_COMPLETE / OWNER_EXACT_ONE_FAIL_CLOSED / DEFAULT_OFF / NO_PRODUCTION_CONNECTION`.

**Approved baseline:** `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`.

**Engineering deliverable:** branch `aa2-c4pre-production-handlers`, package `3.11.197`. The scoped commit containing this evidence is the durable revision identity; it is recorded in git history and the owner handoff rather than embedded recursively in its own content.

This is content-safe synthetic engineering evidence only. It is not production MCP readiness, Hermes integration, live evidence, learning evidence or product launch. No production runbook/data/config, owner value, credential, token, authorization code, cookie, learner payload, provider prompt or production coordinate was accessed or recorded.

## 1. Implemented projections

| Tool | Deterministic authority | Result |
|---|---|---|
| `get_learning_brief` | user-scoped non-ignored `srs_projections`, strict manual-status fold, newest open plan metadata and shipped catalog readability | exact counts, estimate, precedence, action mapping and 5-minute TTL pass |
| `get_review_summary` | the same injected aggregate snapshot and clock | exact due/urgent/estimate, both handoff flags false and 2-minute TTL pass |
| `search_public_reading_catalog` | `catalogVersion()` plus exact shipped root/search/index sidecars | Hebrew-only bounded metadata, exact ready join, v7 mappings, deterministic sort and request-bound cursor pass |
| `get_recent_explanation_metadata` | user-scoped SQLite metadata projection | four closed kinds, purge state, known constructs only, collision-safe timestamp boundary and body exclusion pass |
| `get_agent_connection` | exact current user-scoped connection reads plus validated principal expiry | user/client/connection binding, active closed grants and minimal current metadata pass |

Handlers receive only the frozen seven-field identity from the established service. They receive injected repositories/catalog/clock, never a raw DB handle. They do not invoke a planner, task writer, provider, LLM, BYOK gateway or network client.

## 2. Owner and default-off contract

| Case | Result |
|---|---|
| absent, empty, wildcard or malformed | rejected |
| duplicate, multiple or trailing-empty value | rejected |
| exactly one unique opaque value | accepted and frozen |
| content-safe proof | `owner_allowlist_count=1`, positive match true, negative match false |

The same frozen exact-one array is supplied to both the resource validator and service. Parsing remains below all four existing exact-`1` gates; with any gate off, owner parsing and handler construction do not occur. No environment/config value was set in production.

## 3. Synthetic and regression gates

| Command | Content-safe result |
|---|---|
| `npm run smoke:agent-access:production-handlers` | PASS, 27 checks, five tools, zero table deltas/calls/leaks |
| `npm run smoke:agent-access:mcp` | PASS, 45 checks, protocol `2025-11-25`, stateless, zero external/provider/live reads |
| `npm run smoke:agent-access:oauth` | PASS, lifecycle 24 checks plus restore/non-resurrection |
| `npm run smoke:agent-access` | PASS, 20 checks, five capabilities, zero network/provider/live reads |
| `npm run smoke:agent-access:oidc-loopback` | PASS, ephemeral loopback, 17 negative cases |
| `npm run smoke:agent-access:oauth-deployment` | PASS, default-off fixture, durable/ephemeral separation, trusted consent bridge |
| consent and boundary focused smokes | PASS, 10 consent checks plus strict default-off/CSP/origin denial |
| `npm run smoke:agent-access:two-client` | PASS, Hermes `0.18.2`, Inspector `0.22.0`, five tools each, zero registration or production requests |
| `npm run smoke:auth` | PASS, 29/29 |
| `npm run smoke:cp0` | PASS, observer/runtime/parity/lifecycle/restore/process-failure |
| `npm run test:api-smoke` | PASS, default-off OAuth surface remains 404 and API smoke is green |
| syntax, `git diff --check`, package/lock checks | PASS |

The C2 replay required restoring the exact public Hermes release fixture and installing its already-locked `mcp` extra in ignored scratch space. The first replay failed before client execution when that optional extra was absent; the exact frozen fixture setup repaired the test environment, and the unmodified two-client gate then passed. No product code was weakened and no production endpoint was contacted.

## 4. Adversarial proof

The focused smoke uses a temporary migrated SQLite DB, temporary sidecars and a fixed clock. It proves manual-ignore parity, the inclusive 24-hour urgent boundary, aggregate overflow rejection, every plan-action mapping, all actual shipped v7 era/genre mappings, Hebrew-mark query normalization, ready/audio/length honesty, all closed sorts and filters, cursor determinism, stale/tampered/request-mismatched cursor rejection, root/version/join corruption rejection, four explanation kinds, purge/construct filtering, timestamp-collision rejection, exact current-connection isolation, unknown input/output field/enum/ID/timestamp rejection, cardinality/byte limits and exact-one owner negatives.

Exact deltas are zero for the watched learner, task, explanation, subject, connection, grant, code, token-family, refresh-token, denial, consent, audit, erasure and usage-ledger tables during every five-tool happy-path call set. Instrumented counts are `network_calls=0`, `provider_calls=0`, `llm_calls=0`, `byok_calls=0`. Private-body/token sentinels occur zero times in returned output and stdout. Source scans reject handler imports of write/planner/provider/network/process seams and reject SQL writes.

## 5. R1-R17 disposition

- **R2/R5:** client/handler interoperability is transport proof only, not learning value, Hermes integration or launch evidence.
- **R9/R12:** external memory and MCP hold no business-logic authority; handlers are thin read-only projections with no dual-write.
- **R11/R17:** external prose, evaluator, grade and evidence authority remain absent.
- **R14:** owner/user/client/connection isolation is exact and fail closed.
- **R15:** outputs are metadata-minimized; deliberate subject, consent, audit and erasure residue remains governed by existing lifecycle authority.
- **R16:** there is no polling, provider or managed-LLM cost.
- **R1/R3/R4/R6/R7/R8/R10/R13:** deterministic authority, public-metadata honesty, accessibility/UI non-change, independent client boundaries, rollback and do-no-harm remain unchanged.

## 6. Changed-file boundary

Only the approved production-handler modules, two read-only repository additions, default-off server wiring, focused smoke, package/lock version fields, the four approved Agent Access planning documents and this evidence are part of the scoped commit. No migration, dependency, API route, UI, OAuth/MCP schema/scope, provider module, public body artifact or production runbook changed.

## 7. Deployment successor

C4A remains blocked. The separately approved exact-revision default-off production deployment completed for packet-carrier `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3`, with the independent OAuth-client/MCP authority gates off, no owner allowlist configuration, no client activation, no lifecycle flow and no live connection.

The deployment packet is `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`; content-safe execution proof is `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_EVIDENCE_2026_07_17.md`.

Production deploy/restart, production config/env mutation, production owner configuration, client activation, flag enablement, authorization/interaction/consent/token/refresh/revoke, Inspector/Hermes production configuration, any live MCP call, registration/DCR/CIMD, secret/shared-bearer/token passthrough, real credentials, private learner reads, canonical writes, provider/LLM/BYOK calls, polling/notification, AA2-C4A, AA2-C4B and launch claims remain prohibited.
