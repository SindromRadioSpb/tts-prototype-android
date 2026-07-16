# LinguistPro Agent Access — AA2-B3 default-off OAuth deployment execution packet

**Date:** 2026-07-17

**Status:** `ENGINEERING_COMPLETE / DEFAULT_OFF / FIXTURE_TWO_CLIENT / PRODUCTION_KEY_ABSENT / PRODUCTION_CLIENT_ABSENT / MCP_ABSENT / NO_DEPLOY / NO_LIVE_CLIENT`.

**Owner approval:** 2026-07-17 — “Утверждаю решения D1–D7 в AA2‑B3 packet. Разрешаю default-off B3 implementation и fixture validation. Не разрешаю production key/config, deploy, MCP, Hermes installation/configuration или live connection.” D1–D7 and the bounded B3 engineering slice are therefore approved; D8, deployment and every live/external action remain unapproved.

**Repository baseline:** implementation started from `main` / `dac5199`; package `3.11.194`; Node `v22.22.1`; AA2-A/B0 engineering complete; AA2-B1 `LOOPBACK_ENGINEERING_COMPLETE`; AA2-B2 `ENGINEERING_COMPLETE / DEFAULT_OFF`; B3 evidence and final commit are recorded in §19.

**Authority boundary:** the approved session may implement exact default-off OAuth routes, the B0/B2 adapter/interaction bridge and synthetic local fixtures. It may mint only ephemeral fixture codes/tokens/keys in scratch databases. It may not create or inject a production key/config/client, install/configure Hermes or Inspector, deploy, expose MCP, connect a real client, read private/F1/F2 payloads, call a model/provider or enable CP0 live capture.

## 1. Repo-grounded starting point

Already present:

- migration `042_agent_access_oauth_lifecycle.sql`: static public clients, opaque subjects, connections/grants, hashed authorization codes, refresh-token families, deny hashes and erasure journal;
- B0 repository enforcement for exact user/client/connection/scope/resource/consent binding, atomic code consumption, refresh rotation/reuse response, independent revoke, export/delete/restore and security epochs;
- pinned `oidc-provider@9.8.2` plus `jose@6.2.2` and a B1 loopback-only Authorization Code + PKCE S256 + ES256/JWKS proof;
- B2 default-off first-party consent/revoke UI, server-held trusted request ceremony, cookie/CSRF management routes and strict Agent Access browser boundary;
- five closed AA2 read-only capabilities and a resource identifier fixed at `https://linguistpro.kolosei.com/agent-access`.

Absent at the start of B3 (post-implementation reconciliation is in §19):

- production AS or protected-resource metadata route;
- production signing key, key loader, JWKS rotation or custody procedure;
- production provider adapter/mount, authorization/token/revocation endpoint or durable AS interaction bridge;
- registered real Hermes or second client;
- MCP endpoint/SDK/adapter, bearer-token resource-server middleware or live connection;
- production proxy proof, OAuth-specific multi-dimensional quotas, alerts or deploy evidence.

Important code/doc reconciliation:

1. `server.js` globally sets Express `trust proxy = 1`, while B2 deliberately validates the raw socket plus forwarded headers under an independent exact flag. B3 must preserve the B2 boundary and must not derive issuer/Host from `req.protocol` alone.
2. B1 proved `oidc-provider@9.8.2`, but upstream latest is now `9.9.1` (2026-07-07). B3 must not silently upgrade; the tested pin remains the implementation candidate until the compatibility gate in §12 passes.
3. Hermes now supports a fixed `oauth.redirect_port` and optional explicit HTTPS `oauth.redirect_uri`; it also caches downstream tokens outside LinguistPro. Therefore a static public-client pilot is possible without DCR, but downstream deletion remains impossible for LinguistPro.
4. B2 pending consent requests and B1 provider interactions are process-memory only. B3 can use that shape only for a single-instance, default-off engineering slice where restart invalidates the short interaction and the user retries. It is not yet a high-availability live contract.

## 2. A/B/C architecture decision

| Option | Shape | Decision |
|---|---|---|
| A — delegated authorization server | External managed AS; LinguistPro remains resource server and consent/connection policy owner | Viable fallback, but adds vendor/region/export/support/key-custody decisions and does not reuse the proven B1 adapter. |
| **B — same deployment, separate logical AS/RS boundaries** | Pinned `oidc-provider`; `/oauth/*` AS, RFC 9728 resource metadata, first-party B2 interaction bridge; every route exact default-off | **Recommended for B3 engineering.** Smallest reversible continuation of B0–B2; no claim that the AS is a pedagogical service. |
| C — open/dynamic Agent platform now | DCR/CIMD, arbitrary clients, wildcard loopback redirects, MCP and live access together | Rejected. Expands SSRF, impersonation, protocol, consent and support surface before two-client proof. |

Choose **B**, with three later and independent approvals:

1. B3 implementation approval — code and fixture validation only;
2. default-off deployment approval — inject real key/config and verify public metadata while access remains unavailable;
3. AA2-C/live-owner approval — mount MCP and connect one exact owner client in a bounded window.

## 3. Proposed fixed coordinates

Recommended owner decision:

```text
issuer                         = https://linguistpro.kolosei.com/oauth
protected resource            = https://linguistpro.kolosei.com/agent-access
protected-resource metadata   = https://linguistpro.kolosei.com/.well-known/oauth-protected-resource/agent-access
AS metadata (RFC 8414)         = https://linguistpro.kolosei.com/.well-known/oauth-authorization-server/oauth
OIDC compatibility discovery  = https://linguistpro.kolosei.com/oauth/.well-known/openid-configuration
authorization endpoint        = https://linguistpro.kolosei.com/oauth/auth
token endpoint                = https://linguistpro.kolosei.com/oauth/token
revocation endpoint           = https://linguistpro.kolosei.com/oauth/token/revocation
JWKS                           = https://linguistpro.kolosei.com/oauth/jwks
```

Rationale:

- the issuer path keeps one TLS/domain/operator boundary but separates OAuth routes from first-party application APIs;
- RFC 9728 inserts the well-known suffix before the resource path, so `/agent-access` becomes `/.well-known/oauth-protected-resource/agent-access`;
- the RFC 8414 path-insertion form is served explicitly even if the provider's OIDC discovery also uses the path-appending form;
- metadata values are static configuration, never inferred from Host/forwarded headers;
- the protected resource stays the already approved AA2 identifier. A future MCP transport path does not silently change `aud`; any resource change requires a scope/compatibility amendment.

The protected-resource metadata is a closed JSON document:

```json
{
  "resource": "https://linguistpro.kolosei.com/agent-access",
  "authorization_servers": ["https://linguistpro.kolosei.com/oauth"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": [
    "learning.brief.read",
    "review.summary.read",
    "reading.public.search",
    "explanations.metadata.read",
    "agent.connection.read"
  ],
  "resource_name": "LinguistPro Agent Access"
}
```

No write/future scope, tool result, user identifier, client-specific value or provider prose enters discovery.

## 4. Static public-client decision

Dynamic client registration and Client ID Metadata Documents remain disabled in B3. Two exact engineering profiles are proposed:

### Hermes reference profile

```text
oauth_client_id       = linguistpro-hermes-owner-v0
client_type           = PUBLIC
software_id           = nousresearch-hermes-agent
compatibility version = Hermes Agent v0.18.2 (v2026.7.7.2)
redirect_uri          = http://127.0.0.1:8765/callback
token auth method     = none
grant                 = authorization_code
PKCE                  = S256 required
```

The fixed port is intentional: current Hermes supports `oauth.redirect_port`, while bare OAuth normally uses a local loopback port and stores tokens under `~/.hermes/mcp-tokens/`. B3 does not install/configure Hermes or write that token store. Before AA2-C, the exact installed Hermes version/config and callback behavior must be attested again.

### Independent second-client profile

```text
oauth_client_id       = linguistpro-mcp-inspector-v0
client_type           = PUBLIC
software_id           = modelcontextprotocol-inspector
compatibility version = @modelcontextprotocol/inspector 0.21.2
redirect_uris         = http://localhost:6274/oauth/callback
                        http://localhost:6274/oauth/callback/debug
token auth method     = none
grant                 = authorization_code
PKCE                  = S256 required
```

Inspector is a protocol/debugging client, not a product client and not proof of learner value. It provides an implementation independent of Hermes/Python SDK for vendor-neutral protocol validation. Inspector stays localhost-only with its own proxy authentication enabled; `DANGEROUSLY_OMIT_AUTH` is prohibited.

Neither profile is inserted into a production database in the packet or B3 implementation session. B3 fixtures register them only in scratch storage. Production registration requires the default-off deployment approval.

## 5. Authorization and consent flow

1. Client discovers RFC 9728 metadata, then exact AS metadata.
2. Client sends `response_type=code`, exact static `client_id`, exact redirect, `code_challenge_method=S256`, state, five-or-fewer exact scopes and the exact `resource` at the authorization endpoint.
3. AS validates all protocol fields before any B2 request exists. Unknown client/scope/resource/redirect or absent/wrong PKCE fails content-safely.
4. Browser must hold a valid first-party `lp_session`. The browser presents only the opaque provider interaction handle; the server re-reads all trusted AS details and derives `user_id` from the cookie.
5. The bridge creates/reuses one `PENDING_AUTH` connection, binds an opaque subject and stages the existing B2 request. Browser cannot set client, connection, subject, resource, scopes, redirect, purpose or retention version.
6. B2 preview shows recipient/scopes/exclusions/downstream retention. Exact checkboxes plus acknowledgement approve; deny produces OAuth `access_denied` and no active grant.
7. Approval writes exact append-only consents, activates only that connection and resumes the provider interaction once.
8. Authorization code is single-use, hashed at rest, TTL five minutes and bound to user/subject/client/connection/redirect/resource/scopes/PKCE.
9. Token request must repeat the exact resource and verifier. B1's content-safe body preflight remains mandatory because upstream otherwise permits sole-resource inference.
10. Access token is accepted only after signature, issuer, audience, time, client, subject, connection, security epoch, scope and revoke-state validation. It is never passed to another service.

Interaction registry limits: ten-minute absolute TTL, maximum 100 global, 3 open per user and 10 open per client/IP pair. Process restart invalidates every open interaction and returns a retryable first-party error; it never reconstructs authority from browser parameters.

## 6. Token policy decision

Recommended B3 policy:

```text
authorization code TTL      = 5 minutes, single-use
access token TTL            = 10 minutes
clock skew                  = <= 60 seconds
refresh token               = rotating public-client family
refresh idle expiry         = 30 days
refresh absolute expiry     = 90 days
reuse response              = revoke whole family + suspend connection + bump epoch
access-token format         = ES256 JWT, unique jti
token transport             = Authorization: Bearer only
```

Why refresh is included: current Hermes persists and refreshes OAuth tokens; the current MCP authorization specification requires rotation for public clients. A no-refresh B3 would repeat B1 but would not validate realistic client continuity. Refresh issuance is nevertheless fixture-only until deploy/live approvals.

No ID token, userinfo, password, implicit, hybrid, client-credentials, device, CIBA, PAR, DPoP, token exchange or upstream token passthrough is enabled in v0. `offline_access` is not a LinguistPro data scope and is not accepted as an arbitrary requested scope; refresh eligibility is server policy for an approved connection.

## 7. Signing-key and rotation decision

Recommended architecture:

- algorithm: ES256 only; token header requires a known non-empty `kid` and exact `alg`;
- private JWKS: injected at process start from a platform-managed encrypted secret, parsed into process memory, never stored in git/SQLite/log/export/browser or returned by an endpoint;
- public JWKS: active public key plus a bounded previous verification key during planned overlap;
- regular rotation: every 90 days;
- planned overlap: at least access-token TTL + clock skew, fixed operational window 30 minutes;
- emergency rotation: immediately remove compromised public key, replace active key, revoke all active token families and bump connection/subject epochs before re-enable;
- startup: fail closed if key missing, malformed, duplicate `kid`, non-EC/P-256, private material appears in public JWKS, or configured issuer/resource mismatch;
- custody: owner/security operator generates and installs the secret during the later default-off deployment approval; B3 implementation uses ephemeral fixture keys only.

The concrete hosting secret name/path is intentionally not fixed in a public planning document. It belongs in the gitignored production operations record. No implementation may create a durable key automatically on boot: restart must not silently change issuer identity.

## 8. Provider adapter ownership

| B1 provider model | B3 owner | Rule |
|---|---|---|
| `Client` | `agent_oauth_clients` | Static registry only; no provider-created/DCR client. |
| `AuthorizationCode` | `agent_authorization_codes` | Hashed, exact bindings, five-minute single-use. |
| `Grant` | `agent_connections` + `agent_connection_grants` + consent records | Provider cannot widen; domain controller owns activation/reduction. |
| `AccessToken` | Self-contained short JWT + bounded `agent_access_token_denials` | Raw token is never persisted; RS revalidates DB security epochs/grants. |
| `Interaction` | B3 bounded in-process registry linked to B2 opaque request | Ten-minute fail-closed/retry-on-restart; no private payload. |
| `Session` | Existing first-party `lp_session` plus bounded provider session handle | Provider session cannot become learner identity or outlive first-party session authority. |
| `RefreshToken` (new in B3) | `agent_token_families` + `agent_refresh_tokens` | Hash only, rotate every use, family revoke on reuse. |

No generic provider JSON blob table is approved. If `oidc-provider` creates an unlisted model or requires private/unbounded payload persistence, stop and return to the owner; do not serialize it opportunistically.

## 9. Host, proxy, CORS and browser contract

1. issuer/resource/endpoint URLs come only from fixed configuration;
2. raw `Host` must equal `linguistpro.kolosei.com`; no suffix matching, comma list, userinfo or alternate port;
3. direct socket is HTTPS, or exactly one explicitly trusted reverse-proxy hop supplies `X-Forwarded-Proto: https` and the same canonical forwarded host;
4. B3 must not rely on the global Express `trust proxy = 1` for its verdict;
5. trusted proxy identity/topology is a deploy gate verified from private infrastructure coordinates, not assumed in code;
6. discovery/JWKS are public GET, immutable in content for a key/version window and never credentialed CORS APIs;
7. authorization/interaction is first-party navigation only; consent mutations keep exact Origin + cookie + CSRF;
8. token/revocation are server/client form POSTs, never browser-cookie authenticated, and accept no CORS credentials;
9. no wildcard ACAO; no reflected Origin; OPTIONS does not create an alternate protocol path;
10. cookies, CSRF and LinguistPro browser bearer material never enter OAuth client/token responses.

## 10. Exact rate limits and capacity caps

All dimensions apply together; the strictest exhausted bucket wins. Limits are initial engineering values, content-safe `429` responses, no managed LLM spend:

| Surface | IP | Client | User/connection | Additional cap |
|---|---:|---:|---:|---|
| discovery/JWKS | 300/min | n/a | n/a | CDN/proxy cache allowed; ETag, no private data |
| authorization start | 30/10 min | 60/10 min | user 10/10 min | 100 open global; 3/user |
| interaction/consent bridge | 30/10 min | 60/10 min | user 20/10 min | exact session+CSRF on mutation |
| token | 120/min | 60/min | connection 20/min | body <=56 KiB; one code/refresh transition |
| revocation | 60/10 min | 60/10 min | user 20/10 min | idempotent terminal response |
| protected-resource validation | 300/min | 120/min | connection 60/min; user 120/min | no tool execution in B3 |

Buckets are bounded and periodically swept. Production-scale/shared-store limits are not claimed; multiple replicas are prohibited until a later scale packet replaces per-process buckets and interactions.

## 11. Content-safe audit, incident and rollback

Permitted audit fields:

```text
event schema/version
route class
result/error code
oauth_client_id (registered global ID)
scope IDs (never returned content)
connection/request/jti keyed digest, never raw value
security epoch
rate-limit dimension
key kid (public identifier)
timestamp / deployment revision
```

Prohibited audit content: token/code/verifier/challenge, cookie/CSRF, private key/JWK `d`, redirect query, subject/user ID, tool arguments/results, prompts, F1/F2 fields, source/explanation bodies or external transcript.

Rollback order:

1. set OAuth and Agent Access flags off;
2. stop new authorization/token/RS traffic;
3. revoke affected client/connection/family or all families as incident scope requires;
4. remove compromised `kid` for emergency key incidents;
5. revert B3 mount/adapter while keeping B0 lifecycle and B2 management available only if independently safe;
6. never drop migration `042` or erasure authority during operational rollback.

Support copy must state that revoke stops future LinguistPro access but cannot erase data already delivered to Hermes/Inspector/provider/session storage.

## 12. Compatibility-refresh gate

Run immediately before B3 implementation freeze and again within seven days of any deploy/live window:

1. MCP protocol revision must still be exactly `2025-11-25`, or every authorization/metadata/resource/scope delta is reviewed and fixtures updated;
2. OAuth 2.1 is still an Internet-Draft; exact requirements are pinned to draft 15 plus RFC 9700/7636/8252/8414/8707/9728 rather than claiming final OAuth 2.1 certification;
3. `oidc-provider@9.8.2` remains the tested pin. Upstream `9.9.1` is newer; implementation may stay on 9.8.2 only after advisory review confirms no relevant security fix is being skipped. Upgrading requires re-running B1 positive flow, all 17 negatives, model inventory, dependency integrity/license/audit and B3 adapter fixtures;
4. `jose@6.2.2` must resolve exactly and pass independent ES256/JWKS negative verification;
5. Hermes must be attested at v0.18.2 or a newly reviewed version, and its fixed redirect/resource/PKCE/token-refresh behavior must be recorded without exposing its token store;
6. Inspector must be attested at 0.21.2 or a newly reviewed stable version, with both exact callback paths and proxy authentication enabled;
7. the official TypeScript SDK v2 remains pre-alpha until its announced stable release; no B3/AA2-C server dependency may switch to v2 before a stable release plus compatibility packet. Current stable v1 remains the reference for future AA2-C only.

Observed current sources:

- [MCP authorization specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization);
- [RFC 9728 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html);
- [RFC 9700 OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html);
- [OAuth 2.1 draft 15 history](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/history/);
- [`oidc-provider` upstream and supported versions](https://github.com/panva/node-oidc-provider);
- [`oidc-provider` v9.9.1 release](https://github.com/panva/node-oidc-provider/releases/tag/v9.9.1);
- [Hermes remote MCP/OAuth documentation](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md);
- [Hermes v0.18.2 release](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.7.2);
- [MCP Inspector upstream](https://github.com/modelcontextprotocol/inspector) and [0.21.2 release](https://github.com/modelcontextprotocol/inspector/releases/tag/0.21.2-hotfix-3);
- [official MCP TypeScript SDK status](https://github.com/modelcontextprotocol/typescript-sdk).

## 13. Threat model

| Threat | Prevention | Detection/audit evidence | Rollback/revoke | Stop condition | Future owner |
|---|---|---|---|---|---|
| Stolen signing/token store | Managed secret, process-memory key, short AT, hashed rotating RT | Unknown `kid`, signature failures, refresh reuse counters | Emergency key replace; family/global revoke; epoch bump | Private/raw material in DB/log/export | Security/OAuth |
| Wrong user/client/connection binding | Exact AS interaction + cookie user + B0 composite re-read | Binding error code and keyed IDs only | Revoke connection/client | Any cross-user or sibling success | Identity/Agent Access |
| Cross-profile confusion | One visible recipient/connection; opaque subject; exact client label/version | Two-user/two-connection matrix | Suspend affected connection | Displayed and actual client differ | Consent/product |
| Prompt-injected authorization/tool call | B3 exposes no tool execution; OAuth cannot be called with agent prose as authority | Route class and rejected shape | Disable OAuth | Any prompt/tool payload reaches AS policy | Agent Access |
| Tool-description/annotation poisoning | No MCP/tool descriptions in B3 | Static import/route tripwire | Revert B3 | MCP metadata appears | AA2-C owner |
| Replayed interaction/code/handoff | Single-use provider interaction and code; TTL/state/PKCE | Replay code only, no artifact | Suspend/retry connection | Replay succeeds or creates second grant | OAuth |
| Scope escalation | Closed five scopes; exact consent; token scope subset; no wildcard/DCR | Requested/granted scope IDs | Revoke grant/family | Unknown/implied scope accepted | Consent/service |
| Token passthrough/confused deputy | Exact resource/audience; no upstream bearer forwarding | Wrong-aud/resource negatives | Disable RS; revoke family | Token for another resource accepted/forwarded | Resource server |
| External transcript retention | Minimal data classes; visible disclosure; independent revoke | Consent/notice versions | Stop future access; support notice | Product promises downstream erasure | Privacy/support |
| Tool chaining/exfiltration | No MCP in B3; later tools remain closed/capped | Zero tool-call counter | Keep AA2-C off | Tool endpoint becomes reachable | AA2-C owner |
| Duplicate reminders | No cron/notification/nudge write in OAuth | Static dependency tripwire | Revert | Notification path imported | Notification owner |
| External prose claims mastery | No external prose/grade/evidence in OAuth | Zero content/evaluator counter | Disable later client | OAuth result treated as learner truth | Pedagogy/evaluation |
| Polling/load/cost amplification | Multi-dimensional quotas, bounded registries, no LLM | 429 counters by safe dimension | Flag off/client suspend | Unbounded state or budget | Reliability/economics |
| Proxy/Host spoofing | Fixed URLs, raw socket + exact host/forwarded policy | Host/proto error code | Flag off/proxy rollback | Issuer derived from request or ambiguity accepted | Platform/security |
| JWKS rotation/cache confusion | Unique kid, active+previous overlap, exact alg/key curve | Unknown kid/old-key verification matrix | Restore prior safe JWKS or emergency replace | Duplicate kid/old key accepted beyond window | Security/OAuth |
| DCR/CIMD SSRF or impersonation | DCR/CIMD endpoints absent; static clients only | 404/static route scan | Keep disabled | Server fetches client metadata URL | Security/OAuth |
| Bypass of CP0/consent/controller | Thin AS bridge; B0/B2 own policy; no direct grant writes | Lifecycle transition and consent-version audit | Revoke/delete connection | Provider creates grant independently | Agent Access/consent |

## 14. R1–R17 adversarial review

| Lens | B3 decision |
|---|---|
| R1/R6/R7/R8 | OAuth carries no linguistic/corpus/lesson/private body and creates no artifact. |
| R2/R5 | B3 is security enablement, not claimed learning value; value remains the five concrete AA2-A reads and later measured owner use. |
| R3/R9 | OAuth subject, connection and external memory are never learner truth; provider adapter has no business logic. |
| R4 | B2 mobile/RTL consent remains the only first-party ceremony; OAuth errors cannot replace accessible copy. |
| R10/R11/R17 | Authorization/token success is not evidence, evaluator output, grade, mastery or answer correctness. |
| R12 | `oidc-provider` owns mechanics; B0/B2/service own lifecycle/consent/capabilities; future MCP remains a thin adapter. |
| R13 | Exact default-off flags, static clients, short tokens, independent revoke, epochs and revertable mount bound rollback. |
| R14 | User/client/subject/connection/resource/scope/redirect/key binding and two-client isolation are mandatory gates. |
| R15 | Incremental consent, independent revoke, downstream-retention disclosure and export/delete/restore remain first-party authority. |
| R16 | No polling/tool/LLM in B3; quotas and bounded state are exact; infrastructure cost is small and measurable. |

## 15. B3 implementation approval scope

Owner decisions recorded by the 2026-07-17 implementation approval:

| ID | Recommended decision | State after this packet |
|---|---|---|
| D1 | Option B; issuer/resource/endpoints exactly as §3 | **Approved and implemented default-off.** |
| D2 | Static public clients only: Hermes v0.18.2/fixed port 8765 plus Inspector 0.21.2/ports 6274 callbacks | **Approved for fixtures; both pass locally; no production registration.** |
| D3 | ES256; managed-secret injection; 90-day rotation; 30-minute planned overlap | **Approved; injected-loader and active+previous verification implemented; production secret/fingerprint absent.** |
| D4 | 5-minute code, 10-minute access token, rotating refresh with 30-day idle/90-day absolute lifetime | **Approved and fixture-verified.** |
| D5 | Process-memory short interaction/session, fail-closed on restart; single instance only | **Approved and implemented for B3; still not HA/live.** |
| D6 | Exact quotas in §10 and content-safe audit in §11 | **Approved; bounded multi-dimensional limiter and closed audit schema implemented.** |
| D7 | No DCR/CIMD, no client secret, no upstream token passthrough, no MCP | **Approved and enforced.** |
| D8 | Private proxy topology/secret custody/public key fingerprint | Deliberately deferred to separate default-off deployment approval. |

No password, cookie, key, Hermes token store, redirect result or user payload is requested from the owner for the B3 implementation packet. Before a deploy/live window, the owner must provide or approve only the private infrastructure coordinates described by D8.

The approved implementation completed the following bounded work:

1. add a production-shaped but default-off AS factory and B0/B2 adapter;
2. add exact discovery/PRM/JWKS/authorization/token/revocation mounts behind `AGENT_ACCESS_OAUTH_ENABLED=1` plus the existing Agent Access flag;
3. add an injected key-loader interface and use only ephemeral fixture keys in tests;
4. add the exact two static fixture clients from §4 in scratch DB only;
5. implement rotating refresh-family mapping, content-safe audit/CP0 hooks and limits from §§6/10;
6. add loopback two-client, restart, load, proxy, rotation, revoke, export/delete/restore and adversarial fixtures;
7. reuse the already pinned dependencies; no upgrade without §12 evidence.

Implementation may not:

- inject/generate a production key or secret;
- add DCR/CIMD, MCP endpoint/SDK/server/client or tool handler;
- install/configure Hermes or Inspector;
- create a real client/connection/token or read private/F1/F2 data;
- enable CP0 live capture, provider/LLM calls, notifications or learner writes;
- deploy or change production config/proxy/DNS;
- claim vendor neutrality from fixtures alone.

## 16. Required implementation gates

Positive:

1. exact PRM and both discovery forms cross-reference issuer/resource/endpoints;
2. Hermes-profile and Inspector-profile loopback Authorization Code + PKCE + resource flows;
3. B2 consent bridge cannot be staged from browser-supplied authority;
4. ES256/JWKS validation plus planned rotation overlap;
5. ten-minute AT and rotating RT continuity; reuse revokes family and suspends only bound connection;
6. restart invalidates open interaction but not durable consent/revoke/tombstone authority;
7. two users/two clients/two connections remain isolated;
8. export/delete/restore contain lifecycle metadata and zero secret/subject/challenge/raw token;
9. exact quota dimensions and bounded cleanup;
10. all B0–B2/auth/API/CP0 regressions pass.

Negative:

- default-off and malformed flag;
- wrong/absent resource at authorize and token;
- wrong issuer/audience/signature/kid/alg/subject/client/connection/scope/epoch/expiry;
- missing/plain/reused PKCE, state mismatch, redirect variation/open redirect;
- DCR/CIMD/userinfo/introspection/implicit/hybrid/password/device/CIBA endpoints;
- raw token/code/verifier/key/cookie/CSRF/query leakage;
- proxy/Host/forwarded comma/suffix/proto confusion and permissive CORS;
- interaction/code/refresh replay and concurrent double exchange;
- unknown provider model or generic JSON persistence;
- F1/F2/tool/private body/audit content;
- load above caps without 429/circuit evidence;
- any real external connection or provider call.

## 17. Stop conditions

Stop B3 implementation and return to the owner if:

1. current upstream/advisory review requires an unproven dependency upgrade;
2. exact Hermes or Inspector callback behavior differs from §4;
3. production behavior requires DCR, wildcard redirect, client secret in a public client or metadata URL fetching;
4. provider mechanics cannot map to §8 without a generic/private artifact store;
5. restart or concurrency can grant/replay authority rather than fail closed;
6. raw secret/token/code/verifier/key/cookie/CSRF/private content reaches storage, log, audit, DOM or stdout;
7. issuer/resource/redirect/Host/origin/proxy ambiguity is accepted;
8. an external agent can write consent, grant, grade, mastery, learner state or canonical truth;
9. MCP/tool/provider/notification/F1/F2 path is required;
10. exact quotas cannot be enforced or memory/storage is unbounded;
11. regressions fail or unrelated dirty files cannot be excluded;
12. a production key/config/deploy/live connection is needed to complete engineering proof.

## 18. Definition of done and later approvals

B3 is `ENGINEERING_COMPLETE / DEFAULT_OFF / FIXTURE_TWO_CLIENT / PRODUCTION_KEY_ABSENT / PRODUCTION_CLIENT_ABSENT / MCP_ABSENT` after the evidence in §19 and the scoped commit/push accompanying this record.

That status still does not authorize deployment. A separate default-off deployment packet must privately record secret custody, exact proxy topology and production key fingerprint/public `kid`, then verify metadata/JWKS with OAuth disabled for clients. A later AA2-C packet must add the thin MCP resource-server adapter and revalidate Hermes plus Inspector. A final bounded owner-live approval is required before one real connection.

## 19. B3 implementation record — 2026-07-17

Implemented, still exact default-off:

- `server.js` mounts the exact PRM/RFC 8414/OIDC `/oauth` coordinates behind both `AGENT_ACCESS_OAUTH_ENABLED=1` and the existing Agent Access flag. Baseline and malformed flags return content-safe `404`; enabled-without-complete injected runtime returns `503`.
- `oauthRuntime.mjs` and `oidcDeployment.mjs` provide the production-shaped AS factory, Authorization Code + PKCE S256, exact resource, ES256/JWKS, 5-minute code, 10-minute access token, 30-day idle/90-day absolute rotating refresh, same-client revocation policy and a 56 KiB form cap. No ID token/userinfo/DCR/CIMD/introspection/device/CIBA/PAR/token exchange is enabled.
- `oidcB0Adapter.mjs` maps `Client`, `Grant`, `AuthorizationCode` and `RefreshToken` to migration 042 domain rows; JWT access tokens are never persisted; only `Interaction` and `Session` are bounded process memory. Unknown provider models and unexpected model fields fail closed. No generic provider JSON table or migration was added.
- The B2 bridge derives the first-party user from `lp_session`, stages only server-read provider parameters, generates opaque subject/connection/request IDs server-side, and resumes through a single-use same-session continuation after the existing CSRF-protected consent decision. The browser cannot supply client, scope, resource, redirect, connection, subject or grant authority.
- signing keys, provider cookies and audit HMAC are injection-only interfaces. No durable key is generated on boot and no production value or fingerprint exists in the repository/session.
- quotas are bounded in memory and applied at the raw socket/IP gate plus client/user/connection protocol points. OAuth audit accepts a closed allowlist, HMAC-digests connection/request/JTI identifiers, rejects raw secret fields and is explicitly `cp0_eligible=false`; B3 performs no tool/LLM/CP0 observation.
- public consent completion redirects only to the existing provider interaction; no cookie, CSRF, token, verifier, challenge, subject or private payload enters the URL, DOM, export or audit.

Fixture evidence:

```text
npm run smoke:agent-access:oauth-deployment
  PASS two static clients, Authorization Code + PKCE S256, exact resource
  PASS ES256 active signing plus previous-key overlap verification
  PASS rotating refresh; old-token replay revokes/suspends only its bound connection
  PASS wrong-client revocation isolation and explicit bound-connection revoke
  PASS exact B0 durable adapter; restart finds durable refresh state
  PASS B2 trusted interaction/consent/one-time continuation
  PASS bounded quotas, forbidden endpoints absent, zero generic JSON persistence
  PASS zero external connection, MCP, provider/model call or private/F1/F2 read
```

Regression evidence passed:

```text
npm run smoke:agent-access
npm run smoke:agent-access:oauth
npm run smoke:agent-access:oidc-loopback
node scripts/premium/agent-access-consent-smoke.js
node scripts/premium/agent-access-boundary-smoke.js
npm run smoke:auth
npm run test:api-smoke
npm run smoke:cp0
node --check server.js
git diff --check
```

The API smoke explicitly verifies all five public OAuth/discovery paths return `404 AGENT_ACCESS_OAUTH_DISABLED` in the normal baseline. `npm audit --omit=dev` reports 13 pre-existing dependency-tree advisories, but none is attributed to `oidc-provider@9.8.2` or `jose@6.2.2`; no dependency was changed. The newer upstream `oidc-provider@9.9.1` therefore remains a later compatibility refresh, not an unreviewed B3 upgrade.

The repository-wide `npm test` is not a green baseline: 269/278 pass, with one pre-existing `classicModeRedesign` assertion for absent `btnTableCustomizeToggle` and eight pre-existing `tests/premium/pipeline.test.js` GCP/quota fixture failures. B3 changes neither `index.html`, those tests nor the provider pipeline; both failing files reproduce independently. This packet does not hide or repair those unrelated failures. Every Agent Access/auth/API/CP0 gate listed above is green.

R1–R17 closure remains as §14 states: B3 adds security mechanics, not learning value or evidence; external memory/prose is not learner truth, grade or evaluation; domain controllers retain consent/lifecycle authority; no managed LLM spend, notification path, learner write, F1/F2 field, tool or MCP handler exists.

Still absent and prohibited without a separate owner approval: D8 proxy/secret/fingerprint coordinates, production client rows, production key/config injection, deployment, public metadata/JWKS verification, Hermes/Inspector installation/configuration, MCP/resource-server tools, live connection and AA2-C owner evidence.
