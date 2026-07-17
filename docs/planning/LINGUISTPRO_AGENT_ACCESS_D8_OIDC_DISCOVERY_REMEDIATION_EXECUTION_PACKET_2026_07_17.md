# LinguistPro Agent Access — D8 OIDC discovery remediation execution packet

**Date:** 2026-07-17

**Status:** `ENGINEERING_COMPLETE / CLOSED_HTTPS_METADATA / CLIENT_GATE_UNCHANGED / PRODUCTION_DEFAULT_OFF / NO_DEPLOY`.

**Owner approval:** 2026-07-17 — “Утверждаю. Стартуй.” Approval covers the bounded local engineering remediation defined here. It does not authorize a production flag change, secret read/rotation, redeploy, client row, authorization/token flow, MCP, Hermes/Inspector configuration, live connection, provider call, CP0 live window or F1/F2 read.

## 1. Trigger

D8 production readiness was rolled back before any client/live flow because the provider-generated OIDC compatibility document:

- generated `http://` authorization, token, revocation, JWKS and PAR URLs behind the real TLS-terminating Traefik hop;
- advertised PAR and DPoP defaults that were not approved;
- advertised secret/private-key client authentication methods although v0 clients are public PKCE clients using `none`;
- advertised provider-default scopes rather than the closed Agent Access registry.

The static RFC 8414 metadata and public JWKS were otherwise correct, the client kill switch held, and all OAuth lifecycle counts remained zero.

## 2. Decision

Implement a closed compatibility surface rather than publishing library defaults:

1. serve one exact static `/oauth/.well-known/openid-configuration` document from the deployment contract, but only after the runtime and injected keyset have loaded successfully;
2. classify only the four approved discovery/JWKS paths; alternate provider well-known paths remain `404`;
3. configure the underlying provider with PAR and DPoP disabled, public-client auth method `none`, and the closed Agent Access scopes;
4. let the underlying Koa provider trust forwarded scheme/host only when an explicit `trustProxy=true` is supplied by the already validated outer OAuth boundary configuration;
5. preserve the independent exact client kill switch before limiter, runtime, consent or provider dispatch.

This is not a generic OIDC conformance claim. The compatibility document exists for exact static-client discovery and advertises only the approved v0 surface.

## 3. Closed compatibility document

Required fields:

```text
issuer=https://linguistpro.kolosei.com/oauth
authorization_endpoint=https://linguistpro.kolosei.com/oauth/auth
token_endpoint=https://linguistpro.kolosei.com/oauth/token
revocation_endpoint=https://linguistpro.kolosei.com/oauth/token/revocation
jwks_uri=https://linguistpro.kolosei.com/oauth/jwks
response_types_supported=[code]
response_modes_supported=[query]
grant_types_supported=[authorization_code,refresh_token]
token_endpoint_auth_methods_supported=[none]
code_challenge_methods_supported=[S256]
scopes_supported=<exact five Agent Access scopes>
subject_types_supported=[public]
id_token_signing_alg_values_supported=[ES256]
claims_supported=[sub]
```

It must not contain registration, PAR, userinfo, introspection, device, CIBA, DPoP, token exchange, client credentials, password, implicit, hybrid, wildcard redirect or secret/private-key client-auth advertisement.

## 4. Exact engineering scope

Allowed files:

- `agent/access/oauthDeploymentContracts.js`;
- `agent/access/oauthDefaultOffGate.js`;
- `agent/access/oidcDeployment.mjs`;
- `agent/access/oauthRuntime.mjs`;
- `server.js` only for passing the exact already-existing proxy flag into runtime construction;
- Agent Access fixture/smoke scripts and this packet;
- D8 packet/prompt evidence reconciliation.

No schema, migration, API business handler, UI, learner-state, MCP or production configuration change is allowed.

## 5. Required gates

```text
npm run smoke:agent-access:oauth-deployment
npm run smoke:agent-access:oidc-loopback
npm run smoke:agent-access:oauth
npm run smoke:agent-access
npm run smoke:auth
node scripts/premium/agent-access-boundary-smoke.js
node scripts/api-smoke.js
node --check server.js
git diff --check
```

Additional assertions:

- exact HTTPS compatibility discovery behind synthetic one-hop forwarding;
- no alternate provider well-known/PAR route;
- no PAR/DPoP/auth-method/scope over-advertisement;
- malformed/comma/hostile forwarding still fails before provider dispatch;
- missing runtime/key remains `503`, not a static false-ready `200`;
- client routes remain `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` with the flag absent or `0`.

## 6. R1–R17 adversarial decision

- **R2/R5/R10:** metadata correctness remains operational evidence only, not learning or vendor-neutral proof.
- **R9/R11/R17:** no external memory, evaluator, grade, prose or learner evidence is introduced.
- **R12:** the change stays in AS discovery/proxy configuration; no MCP/business logic or second authority appears.
- **R13:** production remains rolled back; the patch is reversible code/configuration only and migration 042 is unchanged.
- **R14:** the exact outer Host/proxy boundary remains authoritative; provider proxy trust is downstream of that verdict and the client kill switch remains first.
- **R15:** no consent or downstream delivery is reachable.
- **R16:** no polling/provider/LLM cost.

## 7. Stop conditions

Stop if the fix requires trusting forwarded input before the outer exact boundary, changing issuer/resource, enabling a new provider feature, weakening the client gate, adding a schema/migration, reading private/F1/F2 data, or touching production. A new D8 deployment requires a separate approval after all local gates and evidence are complete.

## 8. Definition of done

`OIDC_DISCOVERY_REMEDIATION_ENGINEERING_COMPLETE / CLOSED_HTTPS_METADATA / CLIENT_GATE_UNCHANGED / PRODUCTION_DEFAULT_OFF / NO_DEPLOY / NO_MCP / NO_LIVE_CONNECTION`.

## 9. Engineering evidence — 2026-07-17

Implemented from repository baseline `b9fd359` / package `3.11.194`. Production remained rolled back with OAuth/UI/client flags exact `0`; no production configuration, secret, deployment, client, connection or token state changed in this engineering slice.

The remediation:

- serves a closed static OIDC compatibility document only after successful runtime/keyset construction;
- limits discovery classification to the two canonical metadata routes, exact OIDC compatibility route and exact JWKS route;
- leaves alternate provider discovery, PAR and suffix routes at `404`;
- disables provider PAR and DPoP defaults and limits provider client authentication to `none`;
- passes the exact OAuth trust-proxy flag into Koa only downstream of the outer canonical Host/forwarded-header verdict;
- preserves resource-indicator scopes as resource scopes rather than converting them into provider-global OIDC scopes.

`smoke:agent-access:oauth-deployment` now boots the real `server.js` with an ephemeral DB/keyset and production-like canonical Host plus one synthetic forwarded HTTPS hop. It proves exact HTTPS compatibility metadata, public-only JWKS, alternate discovery `404` and client-disabled authorization before running the existing two-client lifecycle.

All required gates pass:

```text
npm run smoke:agent-access:oauth-deployment  PASS
npm run smoke:agent-access:oidc-loopback     PASS (17 negative cases)
npm run smoke:agent-access:oauth             PASS
npm run smoke:agent-access                   PASS
npm run smoke:auth                           PASS (29/29)
node scripts/premium/agent-access-boundary-smoke.js PASS
node scripts/api-smoke.js                    PASS
node --check server.js and changed JS/MJS    PASS
git diff --check                             PASS
```

Post-implementation R1–R17 conclusion: no learning, linguistic, memory, grading, consent, MCP or cost surface changed. R12 remains single-authority and transport-separated; R13 retains flag-first rollback and migration 042; R14 is strengthened by exact route allowlisting and downstream-only proxy trust; R15/R16/R17 remain dormant. A new D8 production deployment still requires separate bounded approval and must repeat zero-state, backup/proxy, positive/negative and 30-minute observation gates.
