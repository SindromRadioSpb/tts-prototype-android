# LinguistPro Agent Access — AA2-C MCP, static clients and live-connection decision/execution packet

**Date:** 2026-07-17

**Status:** `AA2_C2_TWO_CLIENT_FIXTURE_COMPLETE / STATIC_PUBLIC_CLIENT_PROVEN / NO_DCR / C3_SEPARATE_APPROVAL_REQUIRED`.

**C1 evidence:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C1_DEFAULT_OFF_MCP_ENGINEERING_EVIDENCE_2026_07_17.md`. C1 completion does not authorize or imply C2, production registration, client activation, OAuth lifecycle execution, Hermes/Inspector configuration or a live connection.

**C2 evidence:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C2_TWO_CLIENT_LOOPBACK_COMPATIBILITY_EVIDENCE_2026_07_17.md`. C2 proves only local synthetic two-client compatibility, static public clients and zero DCR; it does not authorize or imply C3/C4, production registration/activation/deploy or a live connection.

**Authority:** documentation-only successor to successful D8. This packet defines bounded AA2-C slices and the approvals each slice would require. It does not itself authorize an MCP dependency or endpoint, code/config/env change, production client row, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, authorization/consent/token lifecycle, Hermes/Inspector installation or configuration, live connection, credential/token export, provider call, CP0 live window, notification, F1/F2 payload read, canonical learner-state write, commit/push or deploy.

## 1. Starting truth

D8 completed with exact status:

```text
PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS /
ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION
```

Production revision `2976bd9d3ed5321caa416385117d0d1855c37fcd`, package `3.11.194`, exposes exact OAuth protected-resource/authorization-server/OIDC metadata and one public ES256 key while `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`. Authorization, interaction, token and revocation routes fail before runtime/consent dispatch. Every client, connection, grant, code and token-family count is zero.

This is metadata readiness only. It is not an OAuth client proof, MCP readiness, Hermes integration, live evidence, learning value or product launch.

## 2. Decision requested

Approve a staged AA2-C program whose first executable slice is default-off MCP engineering and whose later production/live slices remain independently gated.

Recommended topology:

```text
MCP client
  -> HTTPS Streamable HTTP /agent-access/mcp
  -> bearer resource validation and live connection/grant checks
  -> thin MCP adapter
  -> existing Agent Access Service
  -> allowlisted deterministic controllers
```

The OAuth resource identifier remains exactly:

```text
https://linguistpro.kolosei.com/agent-access
```

The recommended MCP transport URL is separately fixed as:

```text
https://linguistpro.kolosei.com/agent-access/mcp
```

The URL decision does not make the route exist. Protected-resource metadata must advertise the resource identifier and authorization server; the client connects to the transport URL supplied in its configuration. No alternate MCP path, per-client endpoint or discovery alias is allowed.

## 3. Protocol and exact dependency freeze

Compatibility recon on 2026-07-17 records:

| Component | Exact decision |
|---|---|
| MCP protocol | stable `2025-11-25` |
| Remote transport | HTTPS Streamable HTTP; POST and GET behavior per the stable transport contract |
| Server SDK | `@modelcontextprotocol/sdk@1.29.0`, exact lockfile integrity required |
| SDK integrity | `sha512-zo37mZA9hJWpULgkRpowewez1y6ML5GsXJPY8FI0tBBCd77HEvza4jDqRKOXgHNn867PVGCyTdzqpz0izu5ZjQ==` |
| Second client | `@modelcontextprotocol/inspector@0.22.0`, exact pin |
| Inspector integrity | `sha512-HUyvF+6C3e/sL3wZSc71Li1SkuWysixblFpVdm8csJKBOlT2kNG5kWP0AAgdXRiRWRZ27ZajNtagYgwoJ+QBpQ==` |
| Hermes required target | official `v0.18.2` / release tag `v2026.7.7.2` |
| Hermes current local inventory | `v0.16.0` / `2026.6.5`; insufficient for a compatibility claim |

No floating `latest`, caret, prerelease, git branch or SDK v2 pre-alpha is allowed. Refresh this table before implementation if more than seven days old, and again before live launch if more than 30 days old, a pinned version changes, a relevant advisory lands or the protocol revision changes.

## 4. Closed v0 surface

AA2-C may project only the five already-implemented Agent Access capabilities:

| MCP tool | Required scope | Maximum output |
|---|---|---:|
| `get_learning_brief` | `learning.brief.read` | 1,024 bytes |
| `get_review_summary` | `review.summary.read` | 768 bytes |
| `search_public_reading_catalog` | `reading.public.search` | 12,288 bytes |
| `get_recent_explanation_metadata` | `explanations.metadata.read` | 8,192 bytes |
| `get_agent_connection` | `agent.connection.read` | 2,048 bytes |

The adapter owns only initialization/version negotiation, Streamable HTTP/session mechanics, protected-resource challenge integration, `tools/list`, `tools/call` decoding and structured result/error encoding. It contains no SQL, FSRS, grading, learner-state, notification, corpus-ranking, consent or OAuth business logic.

The server declares no MCP resources, prompts, sampling, elicitation or tasks. One request authorizes one tool call. A transport session ID is correlation only and never authority.

## 5. Static client decision

Dynamic client registration, CIMD and registration endpoints remain prohibited. The two exact public-client fixtures are:

```text
linguistpro-hermes-owner-v0
  token_endpoint_auth_method=none
  redirect_uri=http://127.0.0.1:8765/callback

linguistpro-mcp-inspector-v0
  token_endpoint_auth_method=none
  redirect_uri=http://localhost:6274/oauth/callback
  redirect_uri=http://localhost:6274/oauth/callback/debug
```

Both use authorization code + refresh token, exact redirect matching, PKCE `S256`, state and RFC 8707 resource indicator. They have no client secret. A loopback redirect is allowed only for the exact pre-registered localhost/127.0.0.1 URI and port.

The current code fixture identifies Inspector `0.21.2`. AA2-C engineering must update it to the pinned `0.22.0` only after compatibility tests prove its redirect and OAuth behavior. This is an implementation diff, not a documentation-only mutation.

### 5.1 Hermes compatibility stop condition

Current Hermes documentation emphasizes SDK-managed OAuth discovery and DCR. LinguistPro does not expose DCR. Before creating any production client row or enabling clients, pinned Hermes `0.18.2` must prove that a configured static public `client_id`, with no `client_secret`, performs PKCE authorization without any registration request.

If Hermes requires DCR, a secret-bearing confidential client, token/cookie passthrough or a redirect outside the exact fixture, stop. Do not add a registration endpoint, shared bearer, browser cookie, CSRF token or client secret as a workaround. Inspector may establish independent protocol compatibility, but it does not waive the Hermes-specific stop condition for a Hermes connection.

## 6. Required flags

Introduce one independent exact-`1` MCP resource gate:

```text
AGENT_ACCESS_MCP_ENABLED=0
```

The exact enable chain is:

```text
AGENT_ACCESS_UI_ENABLED=1
AND AGENT_ACCESS_OAUTH_ENABLED=1
AND AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1
AND AGENT_ACCESS_MCP_ENABLED=1
AND owner allowlisted
AND client active and allowlisted
AND connection/grant live
AND capability/tool enabled
```

Absent, empty, malformed or any value other than exact `1` is disabled. With MCP disabled, `/agent-access/mcp` returns content-safe `404` before bearer validation, session allocation, limiter, tool dispatch or audit lifecycle write. With clients disabled, OAuth client routes retain the proven D8 `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` behavior even if MCP code exists.

## 7. Staged execution authority

### AA2-C1 — default-off MCP engineering

Requires a new explicit owner approval. Allowed:

- exact SDK dependency and lockfile pin;
- thin `/agent-access/mcp` adapter behind `AGENT_ACCESS_MCP_ENABLED=0`;
- bearer resource validation wiring to the existing OAuth/connection/grant domain;
- fixture-only tests, protocol negatives, rates, audit codes and documentation;
- no production env change, client row, authorization, token or external client configuration.

Completion status: `ENGINEERING_COMPLETE / MCP_DEFAULT_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS`.

### AA2-C2 — two-client loopback and host compatibility

Requires a separate approval after C1 review. Allowed:

- upgrade owner-host Hermes to exact approved version without configuring a production connection;
- run Hermes and Inspector against local fixture servers and synthetic principals/data;
- verify discovery, PKCE, resource indicator, initialization, tool schemas, errors, refresh rotation/reuse, revoke and version negotiation;
- prove Hermes sends no DCR request and stores tokens only in its protected local token store;
- no production client row, production token or private learner payload.

Completion status: `TWO_CLIENT_FIXTURE_PASS / STATIC_PUBLIC_CLIENT_PROVEN / NO_PRODUCTION_CONNECTION`.

### AA2-C3 — production registration, still disabled

Requires a bounded production approval. Allowed:

- create exactly the reviewed public client row(s), initially suspended/inactive;
- preserve `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0` and `AGENT_ACCESS_MCP_ENABLED=0`;
- redeploy only the approved revision and verify metadata, registry contents and zero connection/token state;
- no authorization, consent, token issuance or client configuration.

Registration is not activation. Any unexpected row or nonzero connection/grant/code/token count is a stop condition.

### AA2-C4 — controlled owner-only live window

Requires a final, separately worded approval naming client, scopes, time window and rollback. Recommended order:

1. activate only Inspector and enable clients/MCP for an owner-only synthetic/minimized validation;
2. prove revoke and flag-first shutdown;
3. only after Inspector closure, activate Hermes in a separate window;
4. authorize one owner connection with the minimum selected scopes;
5. execute only allowlisted calls, observe, revoke and return to the approved steady state.

This is the first slice that may create authorization code, token family, connection, grant or consent rows. It must never be inferred from approval of C1–C3.

## 8. Transport and security contract

- exact canonical Host and trusted single-hop forwarded boundary remain mandatory;
- invalid or disallowed `Origin` returns `403`; absent Origin is handled only as permitted by the stable non-browser client contract;
- no permissive CORS and no browser credentials on MCP;
- Authorization accepts only a bearer access token for the exact resource audience;
- tokens in query, cookie, MCP arguments or session ID are rejected;
- every call revalidates issuer, signature, audience, subject, client, connection, scope, expiry, security epoch, revoke state and current grant;
- GET/POST/DELETE transport semantics, content types, Accept negotiation, session IDs and protocol versions are closed and tested;
- hostile forwarded values are replaced at Traefik and rejected at the private boundary when malformed;
- error envelopes contain no token claim, user ID, SQL, path, private content or exception message.

## 9. Rates, caching and zero-cost boundary

Every request passes IP, client, connection, user and per-tool buckets. The initial owner-only envelope remains AA1 §11, including connection `60/minute`, user `120/minute`, tool-specific limits and bounded caches/expiry. Rate keys derive only from trusted network/token/server state.

Hard tripwires:

```text
external_provider_calls_total=0
managed_llm_reservations_total=0
byok_calls_total=0
MCP sampling/tasks/background polling=0
```

Hermes may render data with its own model, but that output and cost are external, non-canonical and not LinguistPro learning evidence.

## 10. Mandatory C1/C2 validation matrix

1. MCP initialize/version negotiation for exact protocol and rejection of unsupported versions.
2. `tools/list` contains exactly five tools, exact schemas and no resources/prompts/sampling/tasks.
3. Every tool positive, unknown-field, oversize, cardinality, wrong-scope, revoked and unavailable case.
4. Missing/malformed/wrong issuer/signature/key/audience/subject/client/connection/scope/expiry tokens.
5. Cross-user/client/connection guessed IDs and cache-key isolation.
6. POST/GET/DELETE, content-type, Accept, session and reconnect negatives.
7. Origin/Host/CORS/DNS-rebinding/forwarded-header negatives.
8. Token passthrough sentinels in query, cookie, arguments and session headers.
9. Rate/polling/load, output-byte caps and zero-provider tripwire.
10. Refresh rotation/reuse, revoke, security-epoch and export/delete/restore zero-resurrection.
11. Hermes `0.18.2` plus Inspector `0.22.0`, with captured proof of no DCR request.
12. Content/secret/F1/F2 sentinel scans using synthetic fixtures only.

No real F1/F2 payload is needed or permitted for these gates.

## 11. Production preflight for C3/C4

Before any production mutation report:

- local/origin main, package and production revision;
- clean/dirty state and exact excluded owner files;
- relevant flags only as present/absent and `0/1`;
- client/connection/grant/code/token-family counts only;
- `/healthz`, migration 042, backup and rollback readiness;
- backend-public-access and single-Traefik-hop proof;
- exact candidate Agent Access diffs after the last approved revision;
- pinned client versions, redirect URIs and compatibility evidence age;
- exact requested mutations and every discrepancy/stop condition.

If any item cannot be proved safely, do not mutate production.

## 12. Stop and rollback

Immediate stop conditions include:

- unknown revision, missing backup, ambiguous proxy or public backend;
- secret/token/cookie/private payload in output or log;
- DCR request or need for client secret/token passthrough;
- unapproved route, tool, resource, prompt, sampling, task or scope;
- wrong resource/audience/issuer/redirect/origin behavior;
- any client/connection/grant/code/token row before its approved slice;
- cross-user/connection access, schema leak, F1/F2 read or canonical write;
- provider call, background polling, rate/load/health regression;
- auth/CSRF/CORS/session/Telegram/Mini App/account-lifecycle regression.

Rollback order:

```text
AGENT_ACCESS_MCP_ENABLED=0
-> AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
-> suspend affected client
-> AGENT_ACCESS_OAUTH_ENABLED=0 when required
-> revoke affected token families/security epochs
-> restore prior approved revision/config
-> verify baseline health, OAuth 404 behavior and zero unintended state
```

Do not drop migration 042 or erase audit/incident evidence.

## 13. R1–R17 decision record

- **R1/R3/R6/R7/R8/R13:** existing deterministic controllers, schema contracts, lifecycle and test evidence remain primary; MCP adds no truth authority.
- **R2/R5/R10:** a connected agent is orchestration convenience, not learning value, mastery evidence or launch proof.
- **R4:** consent/error/revoke flows require 380×844 and RTL checks before live approval.
- **R9/R12:** external transcript is not memory; the MCP adapter is thin and never a second business-logic or write authority.
- **R11/R17:** external prose/evaluator/grade/evidence is non-canonical and cannot enter review truth.
- **R14:** issuer/audience/client/connection/scope/epoch binding and independent kill switches prevent boundary collapse.
- **R15:** recipient consent, minimization, visible downstream-retention warning and honest revoke limits are mandatory.
- **R16:** no sampling/tasks/polling/provider call; rates, caches and zero-cost tripwires are hard gates.

## 14. Evidence and commit discipline

Evidence may contain versions, public endpoints, public client IDs, public signing `kid`/thumbprint, route classes, status/error codes, counts, digests and timestamps. It must not contain secrets, tokens, cookies, CSRF, authorization codes, private ops coordinates, complete headers, connection strings, private learner payload or external transcript.

Each slice uses a scoped allowlist commit. Unrelated owner files are excluded. Production evidence is committed/pushed only with separate owner approval.

## 15. Approval wording for the next executable slice

To authorize only AA2-C1, the owner may state:

> Утверждаю AA2-C1 default-off MCP engineering по packet от 2026-07-17. Разрешаю exact pin `@modelcontextprotocol/sdk@1.29.0`, thin Streamable HTTP adapter `/agent-access/mcp`, независимый exact-`1` gate `AGENT_ACCESS_MCP_ENABLED`, fixture-only tests, content-safe docs и scoped commit/push. Не разрешаю production env/deploy, client rows, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, authorization/consent/token flow, Hermes/Inspector installation/configuration, live connection, provider calls, F1/F2 payload read или canonical learner-state write.

Approval of this packet or C1 does not authorize C2, C3 or C4.

## 16. Source map

Repository authority inspected:

- `agent/access/service.js`, `capabilities.js`, `contracts.js`, `oauthContracts.js` and `oauthDeploymentContracts.js`;
- AA1 and AA2-A/B/B2/B3 contracts plus the successful D8 evidence packet;
- `package.json` and `package-lock.json`, which contain no MCP SDK at this decision point;
- local Hermes version inventory only; no profile, token store or configuration was opened or changed.

Official compatibility sources refreshed on 2026-07-17:

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization);
- [MCP Streamable HTTP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports);
- [MCP 2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog);
- [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk);
- [official MCP Inspector releases](https://github.com/modelcontextprotocol/inspector/releases);
- [Hermes releases](https://github.com/NousResearch/hermes-agent/releases), [MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/) and [MCP configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference/).

No private production operations file, F1/F2 payload, OAuth credential/token or live external connection was opened for this packet.
