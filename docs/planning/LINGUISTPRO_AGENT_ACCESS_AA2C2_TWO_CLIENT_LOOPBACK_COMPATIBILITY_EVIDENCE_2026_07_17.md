# LinguistPro Agent Access AA2-C2 two-client loopback compatibility evidence

**Date:** 2026-07-17

**Status:** `TWO_CLIENT_FIXTURE_PASS / STATIC_PUBLIC_CLIENT_PROVEN / NO_DCR / NO_PRODUCTION_CONNECTION`

**Scope:** local synthetic loopback compatibility only. This is not production MCP readiness, a production Hermes integration, live evidence, learning evidence or product-launch evidence.

## 1. Authority and immutable boundaries

The owner explicitly approved exact Hermes Agent `0.18.2` / release `v2026.7.7.2` and MCP Inspector `0.22.0` for local synthetic fixtures, content-safe token-store validation, the post-pass Inspector fixture bump, evidence and a scoped commit/push. Production environment/deploy/restart, production OAuth client rows, production OAuth/MCP gates, real credentials or tokens, private learner/F1/F2 payloads, provider calls and live connections remained forbidden and were not used.

`.claude/PROD_OPS_PRIVATE.md` and F1/F2 payloads were not read. Existing unrelated owner files were excluded from the C2 allowlist and commit.

## 2. Content-safe preflight

| Gate | Result |
|---|---|
| Candidate contains `d51bcf5` | PASS — starting `HEAD` and `origin/main` were exact `d51bcf58fb0f2d8a3b2cac1d5e54d18f2d770021` |
| Unknown Agent Access changes after C1 | PASS — no commits followed the C1 commit at preflight |
| Package baseline | PASS — `3.11.195` before C2 |
| MCP SDK | PASS — exact `@modelcontextprotocol/sdk@1.29.0` pin and lock integrity retained |
| Hermes target | PASS — official exact tag `v2026.7.7.2`, CLI identity `0.18.2`; frozen release lock used with its exact MCP extra |
| Inspector target | PASS — exact `0.22.0`; package integrity matched the pinned packet value; no floating `latest` |
| Runtime | PASS — Node `v22.22.1`, npm `11.12.0`; package engine requirements satisfied |
| Loopback-only routing | PASS — OAuth, callback, Inspector UI/proxy and MCP used only `127.0.0.1`/`localhost` |
| Safe fixture telemetry | PASS — route class/status/count only; no body, header, code or token values logged |
| Production coordinates | PASS — not loaded or required; production request count `0` |

## 3. Exact before/after identity

| Component | Before | After |
|---|---:|---:|
| Application package | `3.11.195` | `3.11.196` |
| Hermes local CLI | `0.16.0` | `0.18.2` (`v2026.7.7.2`) |
| Inspector local C2 scratch install | absent | exact `0.22.0` |
| Inspector static-client code fixture | `0.21.2` | `0.22.0` — changed only after the compatibility pass |
| MCP SDK | `1.29.0` | `1.29.0` |
| MCP protocol | `2025-11-25` | `2025-11-25` |

## 4. Two-client compatibility

Each client used a distinct synthetic principal, static public client ID, connection, authorization code, grant, token family and access token. Neither client sent a client secret.

| Client | Exact identity | Discovery + PKCE S256 + exact resource | `token_endpoint_auth_method=none` | initialize / tools/list | Five tools | Refresh/revoke | Result |
|---|---|---|---|---|---|---|---|
| Hermes Agent | `0.18.2`, tag `v2026.7.7.2` | PASS | PASS | `2025-11-25`; exact five closed tool schemas | PASS, 5/5 | rotation PASS; old-token reuse suspended only Hermes | PASS |
| MCP Inspector | `0.22.0` | PASS | PASS | `2025-11-25`; exact five closed tool schemas | PASS, 5/5 | remained active after Hermes reuse; explicit revoke denied only Inspector | PASS |

The five tools were `get_learning_brief`, `get_review_summary`, `search_public_reading_catalog`, `get_recent_explanation_metadata` and `get_agent_connection`. All responses came from bounded synthetic handlers; no learner or live data source was read.

## 5. Positive and negative gates

| Gate | Evidence | Result |
|---|---|---|
| OAuth metadata, exact issuer/resource, PKCE S256 | independent browser/client authorization-code flows | PASS |
| ES256 issuer/audience/signature/expiry/binding | local generated fixture key and existing validator contract | PASS |
| Static public clients; no secret | exact static IDs; token endpoint asserted absence of `client_secret` | PASS |
| MCP initialize/list/call | both clients negotiated `2025-11-25`; exactly five tools; every tool called | PASS |
| Refresh rotation/reuse/revoke isolation | rotated Hermes family; reused old refresh; Inspector remained valid; then Inspector revoked | PASS |
| Unsupported protocol and token validation matrix | C1 MCP smoke, 45 checks | PASS |
| Owner/client/connection/cross-user isolation; JTI/epoch/revoke | MCP/OAuth lifecycle, adapter and restore smokes | PASS |
| Query/cookie/argument/session passthrough | rejected by 45-check MCP matrix | PASS |
| Host/forwarded/Origin/CORS/preflight | malformed, comma, suffix, null/invalid and cross-origin cases rejected | PASS |
| Method/content type/Accept/session ID; batch/oversize/unknown | rejected by 45-check MCP matrix | PASS |
| Resources/prompts/sampling/elicitation/tasks | absent/rejected | PASS |
| DCR/CIMD/registration | exact request counts `0 / 0 / 0` | PASS |
| External network during fixture execution | exact `0`; approved package retrieval completed before execution | PASS |
| Production/provider/live data | exact request/call/read counts `0 / 0 / 0` | PASS |

## 6. Token-store result

- Hermes token files were inspected without printing values. On Windows, each file passed an NTFS ACL gate rejecting broad allow entries for Everyone, Authenticated Users, built-in Users and Guests: `NTFS_ACL_PROTECTED`.
- Inspector held the OAuth token object in origin-scoped browser `sessionStorage`; the access token was absent from `localStorage`: `SESSION_STORAGE_ONLY`.
- Token values found in stdout/stderr/transcript: `0`. No token, cookie, authorization code, CSRF value, request header or private storage path is recorded here.
- Synthetic scratch token state was removed after the run.

## 7. Regression record

| Command/gate | Result |
|---|---|
| `smoke:agent-access:two-client` | PASS — exact status above |
| `smoke:agent-access:mcp` | PASS — 45 checks, five tools, zero sessions/network/provider/live reads |
| Agent Access domain | PASS — 20 checks |
| OAuth lifecycle + restore | PASS — 24 lifecycle checks; reuse-family revocation and restore isolation |
| OIDC loopback | PASS — PKCE S256, ES256/JWKS, 17 negative cases |
| OAuth deployment/B0/consent bridge | PASS |
| Consent + boundary | PASS — 10 + 3 checks |
| Auth + API | PASS — 29/29; default-off OAuth surface remained 404 |
| CP0 | PASS — synthetic/default-off suite |
| Existing F1/F2 synthetic regressions | PASS; payloads were not read or exported |
| Full `node --test` | BASELINE NON-C2 FAIL — 269/278 pass: one stale classic-mode assertion and eight tests requiring an absent GCP BYOK key; no repair authorized or attempted |

## 8. R1–R17 boundary record

- **R1/R3/R4/R6/R7/R8/R10/R13:** deterministic controllers, closed schemas, read-only minimization, explicit lifecycle, isolation, audit counts and rollback boundaries remain primary; the fixture creates no canonical write or truth authority.
- **R2/R5:** fixture interoperability is orchestration compatibility only, not learning value, mastery/learning evidence or product-launch evidence.
- **R9/R12:** external memory is absent; MCP is a thin adapter over existing business logic and does not become a second business-logic, memory or write authority.
- **R11/R17:** external prose, evaluator, grade and evidence authority are absent and cannot enter canonical review truth.
- **R14/R15:** production client registry, production consent and downstream delivery are absent; only isolated synthetic client/connection bindings and local revoke semantics were exercised.
- **R16:** production polling, provider/BYOK/managed-LLM calls and associated cost are exactly zero; sampling and tasks are absent.

## 9. Deviations, stop conditions and remaining prohibitions

No C2 stop condition fired. The exact Hermes release needed its declared frozen `mcp` extra to expose MCP support; it resolved only versions pinned by the release lock and did not require DCR, CIMD, a secret, a shared bearer, production coordinates or any workaround.

Still forbidden after C2: production env/config/deploy/restart; production OAuth client rows or registry activation; production `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1` or `AGENT_ACCESS_MCP_ENABLED=1`; production authorization/consent/token/revoke; any real-user or production connection; real credentials/tokens; DCR/CIMD/registration endpoint; shared bearer/client secret/token passthrough; private learner or F1/F2 payload use; canonical writes; provider/LLM/BYOK calls; polling/cron/notifications/CP0 live; MCP resources/prompts/sampling/elicitation/tasks; unrelated code/API/UI/migration/production repair.

Any AA2-C3 work requires a separate owner-approved **production-registration-still-disabled** decision/execution packet. This evidence proposes that packet only; it does not create or execute C3.
