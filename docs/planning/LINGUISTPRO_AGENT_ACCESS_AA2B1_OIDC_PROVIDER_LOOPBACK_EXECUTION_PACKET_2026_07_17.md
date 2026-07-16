# LinguistPro Agent Access — AA2-B1 certified authorization-server loopback execution packet

**Date:** 2026-07-17

**Status:** `LOOPBACK_ENGINEERING_COMPLETE / PRODUCTION_MOUNT_ABSENT / NO_LIVE_AUTHORITY`.

**Owner approval:** 2026-07-17 — “Утверждаю. Стартуй.” No additional owner data is required for B1 because every identity, client, redirect, key, connection, grant and token is disposable fixture data.

**Authority:** B1 may install exact `oidc-provider@9.8.2` and exact `jose@6.2.2`, create a localhost-only AS factory, an in-memory test adapter, ephemeral in-memory signing keys and a loopback smoke. It may not change `server.js`, expose a production route, write a real signing key/token/client/connection, use browser cookies/CSRF, connect Hermes/MCP, read private/F1/F2 data, call a model/provider, enable CP0 live capture, deploy a live AS or create a reusable credential.

**Baseline:** `main` / `f3ef984`; package `3.11.191`; AA2-B0 `ENGINEERING_COMPLETE / NO_OAUTH_ENDPOINT / LIVE_RUNTIME_ABSENT`.

## 1. Decision

Proceed with **Option B: certified library, fixture adapter, real protocol loopback**.

| Option | Shape | Decision |
|---|---|---|
| A — metadata/config inspection only | Import package and inspect discovery without completing a grant | Insufficient: does not prove PKCE, redirect, resource/audience or token validation. |
| **B — full localhost protocol loopback** | Real `/authorize` and `/token` requests through `oidc-provider`, fixture interaction, ephemeral key, JWT verification | **Approved.** Gives protocol evidence without production state or exposure. |
| C — mount provider in `server.js` | Default-off production route during spike | Rejected for B1; Host/Origin/CORS/proxy/consent/key operations are B2/B3 obligations. |

## 2. Exact pins and support boundary

```text
oidc-provider 9.8.2
sha512-Iu/VahRoAhgmzKdvqSX/4ZzrG11Zf6NHuhu1wLkoblBnMUIwud++D2lftK8jV/gLhRl3Fppa3RINYCf/675cjw==
jose 6.2.2 (exact direct pin for independent JWT/JWKS verification)
Node v22.22.1 loopback baseline
```

No caret, tilde, `latest`, prerelease or Git dependency. B1 records the installed lockfile integrity and `npm audit --omit=dev` result. Any relevant advisory or changed integrity stops the stage.

`oidc-provider` is an OpenID Certified implementation supporting RFC 8414 metadata, RFC 7009 revocation, RFC 7636 PKCE and RFC 8707 Resource Indicators. OAuth 2.1 remains draft 15, so B1 claims conformance only to the exact tested mechanisms—not “OAuth 2.1 certified.”

Sources: [oidc-provider](https://github.com/panva/node-oidc-provider), [OpenID certified implementations](https://openid.net/certification/certified-openid-connect-implementations/), [OAuth 2.1 draft 15](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15), [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## 3. Loopback topology

```text
fixture public client
  -> http://127.0.0.1:<ephemeral>/oidc/auth
  -> fixture-only interaction handler
  -> exact http://127.0.0.1:<ephemeral-client>/callback
  -> /oidc/token with code_verifier + resource
  -> JWT verification from loopback JWKS
```

HTTP is permitted only because both AS and redirect are loopback localhost fixtures. Binding must be exactly `127.0.0.1` on an OS-assigned port. No `0.0.0.0`, LAN address, hostname alias, reverse proxy, tunnel or external callback.

Fixture identities:

- issuer is constructed from the bound ephemeral loopback port;
- public client has `token_endpoint_auth_method=none`;
- exact redirect URI is registered before provider construction;
- account/subject and connection are opaque constants unrelated to real users;
- signing key is generated per smoke process and never written;
- adapter state is process memory and destroyed at process exit.

## 4. Minimal enabled surface

Required:

- Authorization Code only;
- PKCE required, `S256` only;
- public client, exact redirect URI;
- RFC 8414/OIDC discovery sufficient for clients;
- RFC 8707 resource indicator with exact Agent Access resource URI;
- JWT access token with asymmetric signature, exact issuer/audience/subject/client/connection/scope/iat/exp/jti;
- short access-token fixture TTL;
- refresh token only if the library can prove rotation/reuse behavior without weakening B0; otherwise refresh remains disabled and B1 records a stop/follow-up.

Disabled/not advertised:

- implicit and hybrid responses;
- password, client credentials, device flow, CIBA and token exchange;
- dynamic client registration/management;
- userinfo, claims beyond the minimal subject/security binding, sessions/logout;
- PAR/JAR/JARM/DPoP/mTLS/FAPI experimental surface unless separately required;
- development interactions or arbitrary account lookup;
- wildcard scope, redirect or resource;
- opaque passthrough/upstream tokens.

## 5. Adapter boundary

The B1 in-memory adapter exists only to exercise provider protocol mechanics. It implements the provider's documented adapter interface and records only fixture entities. It must expose a model-name inventory so every created provider model is classified before B2:

| Provider model class | Future owner |
|---|---|
| Client | B0 `agent_oauth_clients`; B1 configured fixture plus adapter-backed negative lookup only |
| AuthorizationCode | B0 `agent_authorization_codes` via audited adapter mapping |
| RefreshToken | B0 token family/refresh rows |
| AccessToken | JWT issuance plus bounded deny hash/security epoch; no plaintext persistence |
| Grant | connection + current exact grants/consent version |
| Account/session/interaction artifacts | first-party browser ceremony with short TTL; never learner memory |
| Replay/session helpers | protocol-only short-lived adapter state with documented purge |

B1 does not claim the in-memory adapter is production storage. Any provider model with unclear lifecycle/export/delete/restore ownership blocks B2.

## 6. Required positive proof

1. exact package versions/integrities and zero unexpected direct dependency;
2. ESM import succeeds from the CommonJS project through a narrow `.mjs` boundary;
3. provider binds only to `127.0.0.1:<ephemeral>`;
4. discovery advertises `authorization_code`, PKCE `S256` and no prohibited response/grant surface;
5. authorization request includes exact client, redirect, state, PKCE challenge, scopes and `resource`;
6. fixture interaction supplies opaque account and server-side connection mapping;
7. redirect returns one code and the unchanged state;
8. token request includes the same redirect, verifier and resource;
9. access JWT verifies against loopback JWKS with exact algorithm, issuer and audience;
10. claims bind opaque subject, client, connection, exact scopes and bounded expiry;
11. authorization code cannot be redeemed twice;
12. provider and client close cleanly with zero reusable key/token artifact.

## 7. Mandatory adversarial negatives

- missing PKCE;
- `plain` PKCE;
- wrong verifier;
- wrong redirect URI;
- wrong resource URI and omitted resource when required;
- unregistered client;
- unsupported response/grant type;
- unauthorized scope;
- state mismatch detected by fixture client;
- reused authorization code;
- JWT verification with wrong issuer, audience and key;
- token sent as tool argument or forwarded downstream (static tripwire);
- adapter state/model inventory contains unexpected or unclassified entity;
- listener binds beyond loopback or remains open after smoke.

Errors and evidence must contain only codes/status/model names—never code, verifier, token, key or complete redirect query.

## 8. R1–R17 checkpoint

| Lens | B1 response |
|---|---|
| R1/R6/R7/R8/R10/R11 | No language, corpus, lesson or evaluator payload exists. |
| R2/R5 | Protocol proof is not learning-value evidence; it safely enables the already defined capabilities. |
| R3/R9 | Opaque subject/connection claims bind authority but never become learner truth. |
| R4 | Real consent UI remains B2; fixture interaction cannot be shipped. |
| R12 | Provider owns protocol; B0 owns lifecycle; AA2-A owns capability policy; MCP remains absent. |
| R13 | No production mount/data; removal is dependency/files revert. |
| R14 | Exact issuer/audience/client/connection/scope/redirect/PKCE negatives are the main gate. |
| R15 | Ephemeral fixture state, model inventory and no transcript/content establish the lifecycle boundary. |
| R16 | One local smoke, no polling/provider/model spend. |
| R17 | No grade, learner write or external prose. |

## 9. Stop conditions

Stop B1 and return to the owner if:

1. exact package integrity/advisory review fails;
2. provider requires a prohibited grant, dynamic registration, development interaction or ambient claim;
3. PKCE S256 or exact resource/audience cannot be required and negatively proven;
4. connection/client/scope claims cannot be server-bound without accepting model-controlled identity fields;
5. access token is opaque and cannot be independently audience/signature validated under the chosen configuration;
6. refresh behavior conflicts with B0 rotation/reuse authority;
7. any adapter model lacks explicit lifecycle/export/delete/restore ownership;
8. a key/token/code/verifier enters git, stdout, CP0, error evidence or persistent project storage;
9. implementation needs `server.js`, production config/env, real cookie/CSRF/user data, MCP or Hermes;
10. focused AA2-B0/AA2-A/auth/API regressions fail;
11. unrelated dirty files cannot be excluded from commit.

## 10. Definition of done and rollback

B1 is `LOOPBACK_ENGINEERING_COMPLETE / PRODUCTION_MOUNT_ABSENT` only when §§6–7 pass, dependency audit and model inventory are recorded, focused regressions remain green and only scoped files are committed/pushed.

Rollback removes the B1 factory/adapter/smoke and exact dependencies. Migration `042` and B0 lifecycle remain useful and unchanged. No token revocation, key rotation, user notice or external coordination is required because every B1 artifact dies with the smoke process.

B1 completion does not authorize B2 consent UI/resource validator, B3 deployment or AA2-C MCP/Hermes connection.

## 11. Execution evidence — 2026-07-17

Implementation result: `LOOPBACK_ENGINEERING_COMPLETE / PRODUCTION_MOUNT_ABSENT`.

Scoped implementation:

- `agent/access/oidcFixtureAdapter.mjs` — process-memory fixture adapter with TTL, consume, grant revoke, inventory and explicit purge;
- `agent/access/oidcLoopback.mjs` — narrow ESM AS factory, ephemeral ES256 signing/cookie keys, exact public client/redirect/resource/scope and fixture-only interaction;
- `scripts/premium/agent-access-oidc-loopback-smoke.mjs` — independent loopback public client/JWKS verifier and adversarial matrix;
- exact direct dependencies `oidc-provider@9.8.2` and `jose@6.2.2` plus `smoke:agent-access:oidc-loopback`.

Observed provider model inventory is exactly:

```text
AccessToken, AuthorizationCode, Client, Grant, Interaction, Session
```

No `RefreshToken`, `DeviceCode`, `RegistrationAccessToken` or unidentified model was created. The `Client` model appears only when the negative unregistered-client lookup reaches the configured adapter; its future durable owner is the existing B0 `agent_oauth_clients` registry. Fixture state is explicitly cleared and both AS/client listeners are proven closed.

Positive proof passed for a distinct AS and client listener, both bound to OS-assigned `127.0.0.1` ports: discovery, Authorization Code, exact redirect/state, PKCE S256, exact RFC 8707 resource, fixture login/consent, token exchange, no refresh token, and independent ES256/JWKS validation of `iss`, `aud`, `sub`, `client_id`, `connection_id`, scope, `iat`, `exp` and `jti`.

Observed protocol/library discrepancy: `oidc-provider` follows RFC 8707's allowance to infer the sole granted non-OpenID resource during code exchange, so `useGrantedResource=false` alone does **not** reject an omitted token-endpoint `resource`. MCP's stricter client contract requires that parameter on both requests. The B1 Node handler therefore applies a 56 KiB content-safe form preflight, rejects missing/wrong token resource before provider execution, then replays the unchanged body into the provider. This policy belongs above the thin provider protocol core and must be retained or equivalently proven in B2/B3.

Seventeen content-safe adversarial checks passed: missing/plain PKCE, wrong verifier, wrong resource plus resource omission at both authorization and token endpoints, wrong redirect, unauthorized scope, unregistered client, unsupported response and grant types, state mismatch, code replay, wrong JWT issuer/audience/key, token-as-tool-input rejection, exact adapter inventory and listener cleanup. The smoke prints no code, verifier, token, private key or redirect query.

Dependency evidence:

- `npm ls oidc-provider jose --depth=2` resolves only direct `jose@6.2.2` and `oidc-provider@9.8.2` with deduped `jose@6.2.2`;
- lockfile integrity for `oidc-provider@9.8.2` matches §2;
- `npm audit --omit=dev` reports 13 existing findings (2 low, 5 moderate, 6 high), none in `oidc-provider`, `jose` or their newly introduced dependency chain; the reported packages are the pre-existing `sqlite3`/npm-fetch and Google client paths. B1 does not claim a repository-wide zero-advisory state.

Regression evidence:

```text
smoke:agent-access                 PASS (20 checks; 0 network/provider/live-data calls)
smoke:agent-access:oauth           PASS (24 lifecycle checks + restore replay)
smoke:agent-access:oidc-loopback   PASS (positive flow + 17 negatives)
smoke:auth                         PASS (29/29)
test:api-smoke                     PASS
```

The first auth run exposed a pre-existing test drift: its independent enumeration excluded only `deletion_journal`, while production export/delete already exempts the durable memory/F2/Agent Access erasure journals. Commit `409f60f` corrected only that independent smoke classification; it did not change runtime, schema or erasure behavior.

Static boundary proof: `server.js` has no B1 import or route; no migration/config/env/UI/API production file was added; no Hermes/MCP/client connection, real user/payload, F1/F2 payload, browser cookie/CSRF, provider call or CP0 live path was used. Package version `3.11.192` arrived on `main` in the parallel F2 commit `2136539`; B1 did not claim or perform a production release.

Next authority remains a separate owner-approved **AA2-B2 execution packet** for first-party consent ceremony, production adapter mapping, issuer/Host/Origin/CORS/proxy policy and signing-key operations. This result does not authorize B2, B3, MCP, Hermes or live Agent Access.
