# LinguistPro Agent Access — AA2-B1 certified authorization-server loopback execution packet

**Date:** 2026-07-17

**Status:** `OWNER_APPROVED / LOOPBACK_ONLY / NO_LIVE_AUTHORITY`.

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
