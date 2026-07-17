# LinguistPro Agent Access — AA2-C1 default-off MCP engineering evidence

**Date:** 2026-07-17

**Status:** `ENGINEERING_COMPLETE / MCP_DEFAULT_OFF / ZERO_PRODUCTION_CLIENT_MUTATIONS / NO_LIVE_CONNECTION`.

## 1. Authority and boundary

The owner approved only AA2-C1: exact `@modelcontextprotocol/sdk@1.29.0`, a thin stateless Streamable HTTP adapter at `/agent-access/mcp`, independent exact-`1` `AGENT_ACCESS_MCP_ENABLED`, bearer resource validation wiring, fixture-only tests, content-safe documentation and scoped commit/push.

No production env value, client row, OAuth authorization/interaction/consent/token/revoke lifecycle, Hermes/Inspector installation or configuration, live connection, provider call, notification, CP0 live window, F1/F2 payload or canonical learner state was read or mutated.

## 2. Exact engineering result

- package checkpoint: `3.11.194 -> 3.11.195`;
- SDK: exact `@modelcontextprotocol/sdk@1.29.0`;
- lockfile integrity: `sha512-zo37mZA9hJWpULgkRpowewez1y6ML5GsXJPY8FI0tBBCd77HEvza4jDqRKOXgHNn867PVGCyTdzqpz0izu5ZjQ==`;
- protocol: exact `2025-11-25`;
- endpoint: `/agent-access/mcp`;
- transport: one stateless SDK server and transport per POST, JSON response mode, no session ID, event store, reconnect state or background work;
- capabilities: exactly five tools; no resources, prompts, sampling, elicitation or tasks;
- production tool handlers: none added by C1; unavailable handlers fail closed;
- database: no migration and no schema change.

The global 10 MiB application JSON parser explicitly bypasses only the MCP path. The MCP gate therefore returns its disabled `404` before body parsing. When enabled in a fixture, the adapter applies a separate 16 KiB body cap after flag, boundary, runtime and bearer checks.

## 3. Enablement and authorization chain

The route requires all of:

```text
AGENT_ACCESS_UI_ENABLED=1
AGENT_ACCESS_OAUTH_ENABLED=1
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1
AGENT_ACCESS_MCP_ENABLED=1
non-wildcard AGENT_ACCESS_OWNER_IDS membership
allowlisted active public client
valid ES256 token for the exact issuer and resource audience
live subject/client/connection/security epochs/current grants/no JTI denial
tool-specific scope and enabled capability
```

Absent, empty, malformed or non-`1` MCP values produce `404 AGENT_ACCESS_MCP_DISABLED` before runtime acquisition, bearer validation, body read, limiter allocation, SDK transport construction, audit write or tool dispatch. With MCP on but OAuth clients off, the existing `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` boundary remains authoritative.

Bearer validation accepts only the Authorization header. It revalidates signature, `kid`, issuer, audience, expiry, subject, allowlisted client, connection, token and subject security epochs, current grant subset, capability version and the access-token JTI denylist. The raw token is not passed to the Agent Access Service or handlers.

## 4. Fixture-only evidence

| Gate | Result |
|---|---|
| MCP exact-`1` off ordering | PASS; zero runtime, validator, limiter and audit invocation |
| OAuth client kill switch ordering | PASS; client-disabled `404` before MCP runtime |
| initialize/version negotiation | PASS; exact `2025-11-25`, unsupported versions rejected |
| `tools/list` | PASS; exactly five closed input/output schemas |
| five positive tool calls | PASS with synthetic bounded fixtures |
| unknown tool/field and token-in-arguments sentinel | PASS, closed domain errors |
| missing scope | PASS, `INSUFFICIENT_SCOPE` |
| issuer/audience/signature/expiry/subject/client/connection negatives | PASS, content-safe bearer denial |
| security epoch, inactive connection and denied JTI | PASS |
| Origin/CORS/Host/forwarded/query/cookie/session/content/Accept/method boundaries | PASS |
| JSON batch and >16 KiB body | PASS, rejected |
| resources/prompts/tasks/sampling requests | PASS, absent/method-not-found |
| IP/client/connection/user/tool minute/day and auth-failure buckets | PASS |
| OAuth lifecycle denylist read helper and expiry | PASS |
| external network/provider/live-data reads | exactly zero |

Primary focused commands:

```text
npm run smoke:agent-access:mcp
npm run smoke:agent-access:oauth
```

The MCP smoke reports 45 checks, five tools, exact protocol, stateless transport, zero sessions, zero external network calls, zero provider calls and zero live-data reads. This is synthetic engineering evidence, not production client proof or live interoperability evidence.

## 5. R1-R17 disposition

- R1/R3/R6/R7/R8/R10/R13: adapter authority remains deterministic, read-only, replay-safe and isolated behind independent flags; no learning-state or evidence write is introduced.
- R2/R5: protocol and metadata engineering is not learning value, vendor-neutral interoperability evidence or product validation.
- R4: no UI or consent ceremony changed; required mobile/RTL checks remain for a later explicitly approved live slice.
- R9/R12: no external memory, MCP business logic, second learner-state authority, resources or prompts were introduced.
- R11/R17: no external prose, evaluator, grade, mastery or evidence authority exists.
- R14/R15: the client kill switch, explicit owner/client/connection/grant chain and zero-consent C1 boundary remain intact; no downstream delivery occurred.
- R16: no polling, task, provider, managed LLM, BYOK or notification cost path exists.

## 6. Still not authorized

C2 and later remain separate decisions. Not authorized: Hermes/Inspector installation or configuration, fixture-host compatibility execution, production client rows, production env/deploy mutation, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, `AGENT_ACCESS_MCP_ENABLED=1`, authorization/consent/token execution, live connection, DCR/CIMD/registration, private learner payload read, canonical write, provider call or product launch claim.

Recommended next decision is the separately bounded **AA2-C2 two-client loopback and host compatibility** approval. It must not be inferred from C1 completion.
