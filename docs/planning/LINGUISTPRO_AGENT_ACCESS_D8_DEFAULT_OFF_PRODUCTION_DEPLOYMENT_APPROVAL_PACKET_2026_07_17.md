# LinguistPro Agent Access — D8 default-off production deployment approval packet

**Date:** 2026-07-17

**Status:** `PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`.

**Authority:** docs-only definition of a future production-readiness deployment. This packet does not itself authorize production secret generation/injection, configuration mutation, redeploy, database write, client registration, OAuth connection, MCP, Hermes/Inspector configuration, live authorization or learner-data access.

**Engineering baseline:** `main` commit `8bf2b92`; package `3.11.194`; AA2-B3/B3.1 is `ENGINEERING_COMPLETE / EXPLICIT_CLIENT_KILL_SWITCH / DEFAULT_OFF / FIXTURE_TWO_CLIENT / PRODUCTION_KEY_ABSENT / PRODUCTION_CLIENT_ABSENT / MCP_ABSENT`.

**Execution approval:** 2026-07-17 — the owner approved bounded D8 Option B execution and explicitly approved reconciling the two first-party boundary variables added in this revision. This does not expand D8 into client activation, OAuth authorization/token flow, MCP, Hermes/Inspector configuration, live connection, provider calls, CP0 live or F1/F2 reads.

**Canonical parents:**

- `LINGUISTPRO_AGENT_ACCESS_AA1_OAUTH_TOOL_SCHEMA_THREAT_MODEL_CONTRACT_2026_07_16.md`;
- `LINGUISTPRO_AGENT_ACCESS_AA2_READ_ONLY_EXECUTION_APPROVAL_PACKET_2026_07_17.md`;
- `LINGUISTPRO_AGENT_ACCESS_AA2B_OAUTH_PERSISTENCE_AUTHORIZATION_SERVER_EXECUTION_APPROVAL_PACKET_2026_07_17.md`;
- `LINGUISTPRO_AGENT_ACCESS_AA2B3_DEFAULT_OFF_OAUTH_DEPLOYMENT_EXECUTION_PACKET_2026_07_17.md`.

Private production coordinates remain only in `.claude/PROD_OPS_PRIVATE.md`. They must be read locally in the separately approved production session and must never be copied into this tracked packet, chat, command output or external provider.

## 1. Owner decision

Choose **Option B: staged metadata/JWKS-only production readiness**.

| Option | Production shape | Decision |
|---|---|---|
| A — leave every Agent Access flag off | No production runtime/key/proxy proof | Safe but proves nothing beyond local fixtures; retain as rollback state. |
| **B — metadata/JWKS readiness, clients independently off** | Inject keys, enable UI boundary and OAuth discovery, keep client activation exactly off and registry empty | **Recommended.** Proves key custody, issuer, proxy and public discovery without granting any external client authority. |
| C — register clients and run authorization/live connection | Metadata plus client flow, consent, tokens and external storage | Reject in D8. This is AA2-C/owner-live authority and requires a later packet. |

D8 is operational evidence, not product evidence. It proves only that the already implemented authorization-server shell can be deployed fail-closed behind the real proxy with durable secret custody and correct public metadata/JWKS. It does not prove Hermes usefulness, MCP compatibility, learning value, OAuth client continuity or vendor neutrality.

## 2. Approved decisions D8-1–D8-8

| ID | Approved decision | Exact D8 consequence |
|---|---|---|
| D8-1 | Explicit client kill switch | `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED` is present as exact `0`, never `1`. Authorization, interaction, token and revoke remain `404`. |
| D8-2 | Staged deployment | First production stage publishes only PRM/AS/OIDC metadata and JWKS. |
| D8-3 | One-hop private proxy | Verify one trusted Traefik hop, canonical Host/forwarded Host, HTTPS proto replacement and no public backend port before mutation. |
| D8-4 | Independent secret custody | ES256 private JWK set, provider cookie keys and audit HMAC key are independent managed secrets. |
| D8-5 | Key lifecycle | One active ES256 key; at most one previous key during planned rotation; 90-day cadence and 30-minute overlap. |
| D8-6 | No production clients | Zero production OAuth client rows before and after D8. No Hermes or Inspector registration. |
| D8-7 | Bounded validation | Health plus positive discovery and negative client/security probes; 30-minute observation; exact stop conditions below. |
| D8-8 | Flag-first rollback | Disable OAuth discovery first, restore prior config/image if required, retain migration 042, revoke families/epochs only if a key/token incident exists. |

Approval of these decisions is not execution approval. The production session requires the exact phrase in §15.

## 3. Exact production state requested

The future operator may configure only these Agent Access variables:

```text
AGENT_ACCESS_UI_ENABLED=1
AGENT_ACCESS_CANONICAL_ORIGIN=https://linguistpro.kolosei.com
AGENT_ACCESS_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_ENABLED=1
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
AGENT_ACCESS_OAUTH_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_PRIVATE_JWKS_JSON=<managed secret>
AGENT_ACCESS_OAUTH_COOKIE_KEYS_JSON=<independent managed secret>
AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY=<independent managed secret>
```

Exact `1` is the only enabled value. Exact `0` is required for the client flag so the intended state is inspectable rather than dependent on absence. No tracked env/example/config file is changed.

`AGENT_ACCESS_UI_ENABLED=1` is currently a prerequisite for OAuth runtime construction. `AGENT_ACCESS_CANONICAL_ORIGIN` and `AGENT_ACCESS_TRUST_PROXY=1` are independently required by the existing first-party browser boundary; `AGENT_ACCESS_OAUTH_TRUST_PROXY=1` does not configure that boundary. Their bounded production effect must be acknowledged: the existing first-party Agent Access management surface becomes available behind the normal LinguistPro session/Origin/CSRF boundary and should show an empty connection state. This is not external-agent authorization. If an unauthenticated/cross-origin caller can read or mutate that surface, stop and roll back.

The deployment must contain no OAuth client row. An empty registry is a second control, not a substitute for `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`.

## 4. Secret and key custody contract

### 4.1 Separation

Generate and store three unrelated values:

1. an ES256/P-256 private JWK set accepted by the injected loader;
2. a JSON array of high-entropy provider cookie keys;
3. a high-entropy audit HMAC key.

Never derive one from another. Never use a LinguistPro password, session cookie, CSRF value, owner token, provider/BYOK key or shared bearer token.

### 4.2 Handling

- generate offline or through a local secure operator path;
- inject only through the existing Coolify managed-secret mechanism;
- do not place values in git, shell history, chat, screenshots, logs, database, persistent application volume or evidence documents;
- do not use commands that print secret values;
- if the agent cannot inject a value without displaying/capturing it, stop and ask the owner to enter it directly in the trusted UI;
- record only the public `kid`, public JWK thumbprint, algorithm, creation time and planned rotation date in a gitignored/private operations record.

Recommended non-secret `kid` shape: `lp-aa2-es256-YYYYqN-01`. It carries no hostname, user identity or secret material.

### 4.3 Rotation

Normal rotation: add one new active key, retain one previous public verification key for no more than 30 minutes, verify JWKS ordering/fingerprint, then remove the previous private key. Emergency rotation: disable OAuth, remove the compromised `kid`, rotate cookie/audit material if implicated, revoke token families and bump relevant epochs before any later client reactivation. D8 has no valid client/token, so any token evidence is itself a stop condition.

## 5. Proxy and network preflight

Before any configuration write, locally read `.claude/PROD_OPS_PRIVATE.md` and verify without reproducing its contents:

1. current service/revision and `main` commit are known;
2. Traefik is the only public reverse-proxy hop;
3. the application backend/listening port is not internet-reachable;
4. the proxy replaces untrusted inbound `X-Forwarded-Host` and `X-Forwarded-Proto` rather than preserving an attacker-controlled list;
5. the application receives one canonical forwarded host and `https` proto;
6. `AGENT_ACCESS_TRUST_PROXY=1` and `AGENT_ACCESS_OAUTH_TRUST_PROXY=1` therefore each represent the same exactly one verified hop for their separate first-party and OAuth boundaries, not a guess;
7. a current database/volume backup and rollback coordinates exist;
8. no unexpected Agent Access/OAuth production variables or client rows already exist.

Do not weaken the code to accommodate an ambiguous proxy. Stop if there are multiple/unverified hops, comma-valued forwarding, direct public backend access, alternate host/port acceptance or uncertainty about header replacement.

## 6. Deployment sequence

The separately approved production session must use this order:

1. read-first/repository reconciliation and report the exact baseline;
2. perform read-only production health, revision, proxy, config-name and zero-client preflight;
3. confirm backup/rollback readiness;
4. prepare independent secrets without printing them;
5. set the exact §3 variables with the client flag `0`;
6. trigger/redeploy only the already approved `8bf2b92`-or-descendant `main` containing no unreviewed Agent Access delta;
7. wait for `/healthz` with database and migrations ready;
8. verify public metadata/JWKS and public `kid`/thumbprint;
9. run the negative client, Origin/CORS, Host/proxy and forbidden-endpoint matrix;
10. verify zero OAuth clients, connections, grants, codes, token families and tokens/denials caused by D8;
11. observe health and content-safe logs for 30 minutes;
12. write a content-safe evidence result and stop. Do not proceed to client registration.

No code edit, package bump, migration creation, commit or push belongs in this production session. If the checked-out/released code is not the approved baseline, return to the owner rather than silently repairing production.

## 7. Positive validation contract

Expected public results after readiness deployment:

| Probe | Expected |
|---|---|
| `/healthz` | `200`; DB and migrations ready; no new disk warning |
| `/.well-known/oauth-protected-resource/agent-access` | `200`; exact resource and authorization-server reference |
| `/.well-known/oauth-authorization-server/oauth` | `200`; exact issuer/endpoints/scopes; no DCR/client-credentials/implicit/device surface |
| `/oauth/.well-known/openid-configuration` | `200`; exact issuer, ES256, PKCE S256 and approved grants only |
| `/oauth/jwks` | `200`; public EC signing key(s), unique expected `kid`, no private `d` material |
| first-party Agent Access management read | authenticated owner sees empty state; unauthenticated request is denied |

Cross-reference every URL to the canonical origin in code. Do not accept redirects to another host, issuer or scheme. Evidence stores status, schema/issuer/resource, public `kid`/thumbprint and timestamps only—never headers containing cookies or secret/config values.

## 8. Required negative matrix

With `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`:

- a realistic `/oauth/auth?...` request returns `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` before consent/provider dispatch;
- `/oauth/token` and `/oauth/token/revocation` return the same client-disabled `404` and never issue/rotate/revoke a token;
- interaction completion cannot be started;
- DCR/CIMD, registration, client credentials, password, implicit, hybrid, device, CIBA, PAR, token exchange, userinfo and introspection remain absent/not advertised;
- browser CORS preflight is rejected; non-interaction OAuth requests carrying `Origin` are rejected;
- malformed/comma/suffix/alternate Host or forwarded values cannot reach a permissive OAuth response when tested at the correct trusted boundary;
- token/cookie/CSRF/browser bearer passthrough is never accepted;
- the existing non-Agent-Access application health/auth/API smoke remains green.

Public proxy tests and direct application-boundary tests are distinct. Do not infer that a proxy-replaced malicious header was accepted by the app; verify replacement at the proxy and strict rejection at the private app boundary without exposing that boundary publicly.

## 9. Content-safe evidence and 30-minute observation

Allowed evidence:

```text
deployment revision/commit
start/end timestamps
health status and readiness booleans
route class and HTTP/result code
issuer/resource/schema versions
public kid and public thumbprint
client/connection/grant/code/token-family row counts (expected zero)
content-safe log event counts
rollback readiness/result
```

Forbidden evidence: private JWK/cookie/HMAC value, env dump, authorization header, session cookie, CSRF, bearer/code/refresh token, query containing a code, user payload, F1/F2 artifact, client secret, private source body or transcript.

The 30-minute window is a stability check, not CP0 live enablement and not learner/product evidence. CP0 remains default-off; no provider/LLM cost or notification is allowed.

## 10. Stop and rollback conditions

Stop immediately and execute flag-first rollback if any of the following occurs:

1. secret material appears in stdout, shell history, chat, screenshot, log, DB, response or tracked file;
2. production revision lacks `8bf2b92` or contains unreviewed Agent Access changes;
3. backup/rollback or exact service identity cannot be confirmed;
4. proxy hop/header replacement/direct-backend isolation is ambiguous;
5. health, DB or migration readiness regresses;
6. issuer/resource/Host/scheme/endpoint differs from the closed contract;
7. JWKS contains private material, unexpected algorithm, duplicate/unknown `kid` or more than active+one previous key;
8. any client row exists or any authorization/interaction/token/revoke route proceeds while the client flag is `0`;
9. any connection, grant, code, refresh family, token or unexpected consent/audit row is created;
10. unauthenticated or cross-origin Agent Access UI/API access succeeds;
11. DCR, wildcard redirect, shared secret, cookie/CSRF/bearer reuse, MCP or external connection is required;
12. content-safe validation cannot be completed without private/F1/F2/user data;
13. error rate, latency, memory, restart loop, disk or availability degrades during observation;
14. unrelated production repair/code change becomes necessary.

Rollback order:

1. set `AGENT_ACCESS_OAUTH_ENABLED=0` and keep `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`;
2. restore the prior Agent Access UI/config state;
3. redeploy/restart using the known prior config/image if health does not recover;
4. remove newly injected Agent Access secrets after the disabled service is stable if the deployment is abandoned or custody is suspect;
5. retain migration 042/tables—do not drop or down-migrate;
6. verify baseline OAuth/discovery paths return default-off `404` and application health/auth/API recover;
7. if any token/key incident occurred, revoke families/bump epochs and open an incident before later work.

## 11. Abuse, support and authority boundaries

- D8 has no client, polling, MCP tool, notification, provider call or managed LLM spend.
- LinguistPro remains the consent, identity, pedagogical truth, grade, mastery, FSRS and canonical-write authority.
- External prose/memory cannot become evidence or learner truth because nothing external is connected.
- F1/F2 payloads are neither read nor exported.
- No user-facing launch or vendor-neutrality claim follows from metadata availability.
- Support message, if the empty first-party UI becomes visible, must say Agent Access is not yet connectable; it must not invite credential/token sharing.

## 12. R1–R17 adversarial review

| Lens | D8 answer |
|---|---|
| R1 | No linguistic content or truth crosses the boundary. |
| R2 | No learning-value claim; D8 proves operational readiness only. |
| R3 | No learner artifact is read or inferred. |
| R4 | First-party UI is checked only for protected empty state and mobile regressions are not claimed. |
| R5 | Metadata is not generic-agent product value or vendor-neutral evidence. |
| R6 | Public corpus is not queried. |
| R7 | No external prose exists. |
| R8 | No lesson lifecycle is reachable. |
| R9 | External memory is absent and cannot become learner truth. |
| R10 | Public metadata evidence is distinguished from client/live evidence. |
| R11 | No evaluator, grade or evidence claim is accepted. |
| R12 | MCP/business handler is absent; only AS discovery is deployed. |
| R13 | Flags provide immediate rollback; migration 042 is retained. |
| R14 | Independent client kill switch plus empty registry prevent connection creation. |
| R15 | Consent is not invoked; downstream retention disclosure remains a later client gate. |
| R16 | No polling, external provider, SDK addition or managed LLM cost. |
| R17 | No answer/evaluation/mastery surface exists. |

## 13. Definition of done

D8 may be marked only:

`PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`

after every §5–§9 gate passes for the full observation window and content-safe evidence is recorded. Otherwise mark `ROLLED_BACK` or `BLOCKED`; do not reinterpret partial success as readiness.

D8 completion does not authorize AA2-C. The next packet must separately decide static production client registration, thin MCP resource-server adapter, current protocol/SDK/Hermes compatibility, Inspector/second-client proof, polling/load quotas, downstream retention and bounded owner-live connection.

## 14. Before / after

**Before D8:** OAuth/consent/lifecycle mechanics are fixture-verified and committed, but production has no injected signing material and no proof of its real proxy/issuer/JWKS boundary.

**After successful D8:** production serves correct public metadata/JWKS behind a verified proxy while external clients remain independently disabled and absent. No one can connect, obtain a token, call a tool or expose learner data.

## 15. Required separate execution approval

The owner must approve the production session with an exact bounded statement equivalent to:

> Утверждаю D8 Option B и execution packet. Разрешаю read-only production preflight, безопасное создание/ввод трёх независимых Agent Access secrets, изменение только перечисленных D8 env flags, default-off redeploy, metadata/JWKS и negative validation, 30-minute observation и flag-first rollback при stop condition. Не разрешаю production client rows, client activation, OAuth authorization/token flow, MCP, Hermes/Inspector configuration, live connection, provider calls, CP0 live, F1/F2 reads или иные production/code changes.

Without that approval, the next session may only reconcile and report; it must not mutate production.

## 16. Production execution evidence — 2026-07-17

**Result:** `ROLLED_BACK / WRONG_OIDC_DISCOVERY_SCHEME / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`.

The owner supplied the separate bounded §15 execution approval and manually injected the approved independent secrets through the trusted Coolify UI. Production remained on revision `b9fd3593c6162046567567fa09caf6c3a9bead84`, package `3.11.194`; migration 042 was already applied; the preflight client, connection, grant, code, token-family, refresh-token and denial counts were zero.

The readiness restart produced healthy DB/migration state and the static protected-resource and RFC 8414 metadata used the closed HTTPS coordinates. The public JWKS contained one public P-256/ES256 signing key, the expected `kid` `lp-aa2-es256-2026q3-01`, no private `d`, and public thumbprint `euxjU4GvmFXKRvdGgA8P_ZGbVbmhlLHeniGKNP5Z40I` (planned rotation due 2026-10-15).

The deployment hit immediate stop conditions before client registration or any live flow: `/oauth/.well-known/openid-configuration` returned provider-generated authorization, token, revocation, JWKS and PAR endpoint coordinates with `http://` rather than the required canonical `https://`; it also advertised a forbidden PAR endpoint and client-secret/private-key token authentication methods, while its scopes list did not match the closed Agent Access scope registry. The static AS metadata was not accepted as a substitute for the inconsistent OIDC compatibility document. Authorization remained client-disabled and no client authority was activated. The full negative matrix and 30-minute observation were not continued after these positive-contract failures.

Flag-first rollback set `AGENT_ACCESS_OAUTH_ENABLED=0`, retained `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0`, restored `AGENT_ACCESS_UI_ENABLED=0`, and redeployed the same revision. Post-rollback evidence:

- `/healthz` returned `200`, DB and migrations ready, disk warning false;
- metadata, discovery, JWKS, authorization, token and revocation returned baseline `404 AGENT_ACCESS_OAUTH_DISABLED`;
- first-party Agent Access page/API returned baseline `404 AGENT_ACCESS_DISABLED`;
- OAuth clients, connections, grants, authorization codes, token families, refresh tokens, token denials, Agent Access consent rows and OAuth audit rows were all zero;
- ordinary unauthenticated auth behavior remained `401 UNAUTHENTICATED`.

D8 is not production-ready. A separate engineering decision/execution slice must reconcile the provider-generated OIDC endpoint scheme behind the verified single Traefik hop without deriving authority from hostile headers or weakening the existing exact Host/proxy boundary, rerun the local deployment/loopback/boundary gates, and only then request a new bounded D8 deployment window. AA2-C, production client rows, client activation, MCP, Hermes/Inspector configuration and live connection remain prohibited.

**Successor engineering closure:** the separately owner-approved `LINGUISTPRO_AGENT_ACCESS_D8_OIDC_DISCOVERY_REMEDIATION_EXECUTION_PACKET_2026_07_17.md` is `ENGINEERING_COMPLETE`. It adds closed HTTPS compatibility metadata, exact discovery-route allowlisting, PAR/DPoP/auth-method closure and a real-`server.js` one-hop regression gate. This does not change the rolled-back production state or authorize a second D8 deployment; a new bounded production approval remains required.

## 17. Successful remediated D8 evidence — 2026-07-17

**Final result:** `PRODUCTION_METADATA_READY / CLIENTS_EXPLICITLY_OFF / ZERO_CLIENTS / ZERO_CONNECTIONS / ZERO_TOKENS / NO_MCP / NO_LIVE_CONNECTION`.

The owner separately approved the remediated D8 rerun, the allowlisted `a6300db` and `2976bd9` push, the key-identity correction, content-safe evidence recording and the scoped tracked commit/push. Production deployed exact revision `2976bd9d3ed5321caa416385117d0d1855c37fcd`, package `3.11.194`, with:

```text
AGENT_ACCESS_UI_ENABLED=1
AGENT_ACCESS_CANONICAL_ORIGIN=https://linguistpro.kolosei.com
AGENT_ACCESS_TRUST_PROXY=1
AGENT_ACCESS_OAUTH_ENABLED=1
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=0
AGENT_ACCESS_OAUTH_TRUST_PROXY=1
```

The three independent managed secrets are present but are not recorded here. The active public signing identity is:

```text
kid=lp-aa2-es256-2026q3-03
RFC7638 thumbprint=t9lj866YWIL-AqEXsy8oAogKl79q0cJkIcUKqM60vpk
rotation due=2026-10-15
```

The public JWKS contains exactly one EC P-256 signing key with `alg=ES256`, `use=sig`, the expected `kid` and no private `d` member. The private JWKS passed the exact production loader and real `oidc-provider` construction locally before injection.

### 17.1 Corrective deviations

The first remediated rerun stopped because the public key under `lp-aa2-es256-2026q3-01` did not match the previously approved thumbprint. Flag-first rollback restored UI/OAuth/client flags to `0/0/0` with health and zero-state intact. The next generated key `lp-aa2-es256-2026q3-02` included the otherwise standard JWK member `key_ops`; the closed production loader correctly rejected that unapproved field as `AA_OAUTH_KEY_FIELD_INVALID`, producing metadata `503`. OAuth and clients were disabled and redeployed before correction. No client, connection, grant, code, token, consent or audit row was created in either stopped attempt.

The final key `lp-aa2-es256-2026q3-03` omits `key_ops`, uses only the closed field set `kty/crv/x/y/d/use/alg/kid`, and passed both loader and provider construction before the successful production deployment. The superseded q3-01/q3-02 identities must not be reused.

### 17.2 Positive and negative proof

The final public suite passed 30/30 checks:

- `/healthz` returned `200` with DB and migrations ready and disk warning false;
- protected-resource, authorization-server, closed OIDC compatibility metadata and JWKS returned exact `200` documents with canonical HTTPS coordinates;
- OIDC metadata advertises only code/query, authorization-code plus refresh, public `none` client authentication, S256, the five closed Agent Access scopes, public subject and ES256; it advertises no PAR, DPoP, registration, userinfo, introspection, device, CIBA, token exchange or secret/private-key client authentication;
- realistic authorization, form token, form revocation and interaction requests returned `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED` before client/runtime/consent dispatch;
- browser preflight and non-interaction Origin failed closed without permissive CORS;
- synthetic cookie, CSRF and bearer sentinels were not accepted;
- alternate/suffix discovery and every prohibited endpoint remained `404`;
- hostile public forwarded input was replaced by the single Traefik hop, while real alternate Host failed closed at the public boundary;
- direct private-app tests passed 7/7: one canonical forwarded hop was accepted, while comma/suffix/alternate Host, malformed forwarded proto and missing trusted forwarding were rejected with exact boundary errors;
- authenticated owner management read showed an empty connection state; unauthenticated read returned `401` and cross-origin mutation returned `403`.

The backend has zero host-bound ports and remains reachable publicly only through Traefik.

### 17.3 Zero-state and observation

After all validation and at each observation checkpoint:

```text
agent_oauth_clients=0
agent_connections=0
agent_connection_grants=0
agent_authorization_codes=0
agent_token_families=0
agent_refresh_tokens=0
agent_access_token_denials=0
Agent Access consent rows=0
OAuth audit rows=0
```

The content-safe observation ran from `2026-07-17T01:36:36Z` through `2026-07-17T02:07:17Z` (30.7 minutes). All 34 health samples were ready; uptime increased monotonically; restart count remained `0`; memory remained approximately 56–58 MiB; disk warning remained false. The 10-, 20- and 30-minute checkpoints each returned metadata/JWKS `200`, client-disabled authorization `404`, exact flags `1/1/0` and the full zero-state above. No secret/error leakage, polling client, provider/LLM call, notification, CP0 live evidence or learner-data read occurred.

### 17.4 Authority conclusion

R2/R5/R10 remain operational-only: metadata deployment is not learning value, product launch or vendor-neutral integration evidence. R9/R12 retain no external memory, MCP or second business authority. R11/R17 retain no external prose, evaluator, grade or evidence. R14/R15 retain the independent client kill switch, zero registry and no consent/downstream delivery. R16 retains zero client polling, provider call or managed LLM cost.

D8 does not authorize AA2-C. Production client rows, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, authorization/token lifecycle, MCP endpoint/SDK, Hermes/Inspector configuration and live connection require a separate owner-approved AA2-C decision/execution packet.
