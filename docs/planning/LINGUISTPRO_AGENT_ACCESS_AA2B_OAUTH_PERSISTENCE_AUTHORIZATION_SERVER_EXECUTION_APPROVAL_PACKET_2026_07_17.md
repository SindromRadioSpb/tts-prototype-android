# LinguistPro Agent Access — AA2-B OAuth persistence and authorization-server execution packet

**Date:** 2026-07-17

**Status:** `AA2-B0 ENGINEERING_COMPLETE / NO_OAUTH_ENDPOINT / LIVE_RUNTIME_ABSENT / AA2-B1-B3 GATED`.

**Authority:** the owner's 2026-07-17 “Утверждаю. Стартуй.” authorizes the persistence-first AA2-B0 slice defined here after this packet is committed and pushed. AA2-B0 may add migration `042`, a default-off connection/grant/authorization-code/token-family lifecycle repository, export/delete/restore integration and fixture-only smokes. It may not add an HTTP route, authorization/resource endpoint, signing/JWKS key, plaintext credential/token, MCP SDK/adapter/client, Hermes mutation, live connection, real private-data read, provider call, CP0 live window or public UI.

**Implementation baseline:** approved packet commit `4138cac`; implementation package checkpoint `3.11.191`; AA2-A `ENGINEERING_COMPLETE / LIVE_RUNTIME_ABSENT`.

**Canonical parents:** AA1 OAuth/tool-schema/threat-model contract and AA2 read-only execution packet dated 2026-07-16/17.

## 1. Decision

Choose **Option B, staged**: LinguistPro-owned logical authorization-server/resource-server boundaries using the certified `oidc-provider` implementation if and only if its B1 loopback spike satisfies the exact MCP/OAuth contract. First implement B0 storage and lifecycle invariants without importing the AS package.

| Option | Architecture | Decision |
|---|---|---|
| A — delegated AS | Auth0/Keycloak/other standards AS; LinguistPro owns resource server, connection/consent mapping and downstream lifecycle | Approved fallback if B1 fails; requires a separate region/vendor/export/delete/support decision. |
| **B — LinguistPro logical AS using certified `oidc-provider`** | Same deployment may host separately mounted AS/RS boundaries; certified library owns protocol mechanics; LinguistPro adapter owns connection/consent/business policy | **Recommended**, conditional. Candidate pin `oidc-provider@9.8.2`, integrity `sha512-Iu/VahRoAhgmzKdvqSX/4ZzrG11Zf6NHuhu1wLkoblBnMUIwud++D2lftK8jV/gLhRl3Fppa3RINYCf/675cjw==`. |
| C — custom OAuth/token server | Hand-written authorization, token and discovery endpoints | Rejected. Domain storage may be custom; OAuth protocol and cryptographic machinery may not be. |

Why B is conditional: `oidc-provider` is OpenID Certified, supports RFC 8414, RFC 7009, RFC 7636 PKCE and RFC 8707 Resource Indicators, and current v9 receives security/bug support. It is also a powerful OIDC implementation maintained primarily by one author and must not be mounted before adapter, upgrade and incident ownership are proven. B0 is useful under either A or B and therefore does not lock the product to one vendor.

## 2. Current standards snapshot

- OAuth 2.1 remains Internet-Draft `draft-ietf-oauth-v2-1-15` (March 2026), not a final RFC; implementation must pin the concrete RFC/BCP requirements rather than claim final OAuth 2.1 certification.
- MCP authorization revision `2025-11-25` requires RFC 9728 Protected Resource Metadata, AS discovery, PKCE, resource indicators/audience binding, and prohibits accepting or transiting tokens intended for other resources.
- Candidate `oidc-provider@9.8.2` was released 2026-04-17 and is listed as OpenID Certified; its exact dependency tree and package integrity must be locked in B1.

Official references: [OAuth 2.1 draft 15](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15), [MCP Authorization 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [oidc-provider](https://github.com/panva/node-oidc-provider), [OpenID certified implementations](https://openid.net/certification/certified-openid-connect-implementations/).

Refresh this snapshot within seven days before B1 freeze and again before any live launch.

## 3. Staged execution

### AA2-B0 — persistence/lifecycle substrate, authorized now

Authorized:

1. additive migration `042_agent_access_oauth_lifecycle.sql`;
2. closed domain constants/validators for clients, connections, scopes, grants, authorization-code records, token families and access-token deny hashes;
3. repository operations with one process transaction lock;
4. integration with structural account export/delete and restore-erasure replay;
5. fixture-only tests for tenant isolation, exact redirect/resource/PKCE metadata storage, scope reduction, rotation/reuse family revoke, independent connection revoke, secret stripping, account deletion and restore non-resurrection;
6. package version/smoke command only; no new dependency.

### AA2-B1 — certified AS loopback adapter, not authorized by B0

Requires a post-B0 approval checkpoint and:

- exact `oidc-provider@9.8.2` lock/integrity/license/advisory review;
- ESM/CommonJS boundary proof on Node `v22.22.1`;
- fixture adapter mapping every provider model to a documented table/lifecycle owner;
- localhost-only authorization code + PKCE S256 + `resource` flow;
- exact redirect URI and public-client policy; dynamic registration disabled;
- no development interaction UI, implicit/hybrid/password/device/CIBA grants or unneeded OIDC claims;
- issuer/signature/audience/client/subject/connection/scope/expiry/revoke negatives;
- no `server.js`/production mount.

### AA2-B2 — first-party consent/revoke UI and resource validator, gated

Requires mobile/RTL UI, cookie+CSRF only for the browser ceremony, independent connection revoke, recipient-retention disclosure, export/delete proof, Host/Origin/CORS/proxy controls and default-off route review.

### AA2-B3 — default-off deployment/loopback clients, gated

Requires protected-resource metadata, pinned keys/rotation runbook, rate limiters, CP0 hooks, full security/load matrix and separate deploy/live approvals. No Hermes connection until AA2-C.

## 4. Exact B0 schema

All time values are UTC ISO strings; all IDs are opaque bounded ASCII; every secret-like artifact is stored only as a keyed/cryptographic digest supplied by a future audited adapter. B0 never mints a credential.

### `agent_oauth_clients`

Global registered software, not a learner row:

```text
oauth_client_id PK
display_name
software_id
software_version
client_type = PUBLIC
redirect_uris_json (closed array, <=8, localhost or HTTPS)
status = ACTIVE|SUSPENDED|REVOKED
registration_version
created_at / updated_at / revoked_at
```

No client secret column exists in owner-only v0; no dynamic registration.

### `agent_subject_mappings`

```text
subject_id PK
user_id UNIQUE FK users ON DELETE CASCADE
subject_version
security_epoch >=1
created_at / updated_at
```

The external subject never equals or exposes `user_id` by contract.

### `agent_connections`

```text
connection_id PK
user_id FK users ON DELETE CASCADE
oauth_client_id FK agent_oauth_clients
display_label
status = PENDING_AUTH|ACTIVE|SCOPE_REDUCED|SUSPENDED|REVOKED|DELETED
consent_version / capability_version / retention_notice_version
security_epoch >=1
created_at / activated_at / updated_at / last_used_at / revoked_at / deleted_at
```

Uniqueness is connection identity, not profile display label. Multiple connections per user/client are allowed and isolated.

### `agent_connection_grants`

```text
grant_id PK
user_id
connection_id FK connection ON DELETE CASCADE
scope (closed AA2 registry)
status = ACTIVE|REVOKED
consent_record_id FK consent_records
consent_version
created_at / updated_at / revoked_at
UNIQUE(connection_id, scope)
```

Scope reduction revokes rows and bumps connection security epoch; it never widens a token.

### `agent_authorization_codes`

```text
authorization_code_id PK
user_id / oauth_client_id / connection_id
code_hash UNIQUE
redirect_uri
resource_uri
pkce_method = S256
pkce_challenge
scopes_json
status = ACTIVE|CONSUMED|REVOKED|EXPIRED
issued_at / expires_at / consumed_at / revoked_at
```

TTL maximum ten minutes. No plaintext code, cookie, CSRF value or browser session token.

### `agent_token_families`

```text
token_family_id PK
user_id / oauth_client_id / connection_id
status = ACTIVE|REVOKED|REUSE_DETECTED|EXPIRED
security_epoch
created_at / last_rotated_at / idle_expires_at / absolute_expires_at
revoked_at / reuse_detected_at / revoke_reason
```

### `agent_refresh_tokens`

```text
refresh_token_id PK
user_id / connection_id / token_family_id
token_hash UNIQUE
status = ACTIVE|ROTATED|REVOKED|REUSE_DETECTED|EXPIRED
issued_at / expires_at / used_at / replaced_by_id / revoked_at
```

At most one ACTIVE refresh token per family. Presenting any non-ACTIVE known hash causes atomic family and connection suspension/revoke according to incident policy; no second token is issued.

### `agent_access_token_denials`

```text
denial_id PK
user_id / connection_id / token_family_id
jti_hash UNIQUE
reason_code
created_at / expires_at
```

This bounded table supports emergency deny before a self-contained token's short expiry. Expired rows are purged.

### `agent_access_erasure_journal`

Content-free restore authority outside connection FKs:

```text
user_id
connection_id
deleted_at
reason_code
PRIMARY KEY(user_id, connection_id, deleted_at)
```

Per-connection deletion writes the journal before cascade deletion. Account deletion removes this per-connection journal after the global `deletion_journal` assumes authority. Restore replay deletes resurrected connection/token/grant/code rows and reinstates the content-free journal.

## 5. B0 repository contract

Permitted fixture/domain operations:

```text
registerClientFixture
createSubjectMapping
createPendingConnection
activateConnectionWithGrants
reduceConnectionScopes
suspendConnection
revokeConnection
storeAuthorizationCodeHash
consumeAuthorizationCodeHash
createTokenFamily
rotateRefreshTokenHash
denyAccessTokenHash
validateConnectionSnapshot
exportAgentAccess
deleteConnection
purgeExpiredSecurityArtifacts
```

Rules:

1. every user operation includes `user_id` in lookup/update predicates;
2. connection/client/subject/grant bindings are re-read inside the same transaction;
3. state transitions are closed and compare current state;
4. authorization code consume and refresh rotation are atomic single-use operations;
5. refresh reuse revokes the whole family and suspends the connection; no token material is logged or returned;
6. current grants are an exact set intersection; wildcard/prefix/implied scopes do not exist;
7. B0 stores only caller-supplied fixture hashes and never accepts raw token/code names in public APIs;
8. export strips every code/token/JTI hash, PKCE challenge and internal subject ID;
9. deletion and restore cannot reactivate a connection or family;
10. no repository function grants consent; activation requires an existing append-only `consent_records` row for the exact connection/scope consent key/version.

## 6. Consent encoding

B0 uses closed consent keys:

```text
external_agent_access:<connection_id>:<scope>
```

The key is created only through the existing first-party `recordConsent` mechanism in fixtures. Repository activation verifies latest row is granted and exact version matches. A future UI must show one recipient, connection, scope, purpose/data class and downstream-retention warning. Existing cloud/F1/F2/Telegram consent never implies it.

## 7. Export/delete/restore

- Structural export includes user-scoped rows but `identityRepo.exportUserData` must strip `code_hash`, `token_hash`, `jti_hash`, `pkce_challenge`, `subject_id` and any internal digest.
- Dynamic account delete removes all user-scoped Agent Access rows and then removes `agent_access_erasure_journal`; global client registry survives.
- `countUserRows` includes the exempt Agent Access erasure journal so completeness remains honest.
- Restore replay reads the pre-restore Agent Access journal, deletes resurrected connections and their dependent rows for non-deleted accounts, and re-inserts tombstones.
- Global account deletion continues to dominate every per-connection tombstone.

## 8. Required B0 fixture matrix

1. migration idempotence and FK/check/unique constraints;
2. exact redirect URI/resource/PKCE/scopes shape rejection;
3. two users, same client: zero cross-user read/update/revoke;
4. two connections, same user: independent grants/revoke;
5. activation without exact latest consent fails;
6. incremental scope addition fails until new consent exists;
7. scope reduction bumps epoch and invalidates old snapshot;
8. authorization-code hash consumes once; expired/wrong binding fails;
9. refresh rotates once; replay of rotated hash marks family `REUSE_DETECTED` and suspends connection;
10. family/connection/client revoke prevents validation;
11. export contains lifecycle metadata but zero secret/hash/challenge/internal-subject fields;
12. per-connection delete writes journal and removes dependent rows;
13. old-backup restore cannot resurrect deleted connection;
14. account delete leaves zero user rows and no per-connection journal;
15. expiry purge removes only terminal security artifacts after expiry;
16. static import tripwire proves no HTTP/MCP/provider/business-writer dependency.

## 9. Threat model checkpoint

| Threat | Prevention/detection in B0 | Rollback/stop | Accountable future owner |
|---|---|---|---|
| Stolen token store | Digests only, no raw mint/log/export; secret-field sentinel | Remove migration/repo before live use; incident if raw material appears | Security/OAuth |
| Wrong binding/cross-profile | Composite user/client/connection predicates and two-user/two-connection negatives | Global off; stop on any cross-row mutation | Identity/Agent Access |
| Replay | Atomic code consume and refresh rotation; reuse family state | Revoke/suspend family+connection | Security/OAuth |
| Scope escalation | Closed registry, exact consent row, exact set grants, epoch bump | Revoke added grant; stop on implicit scope | Consent/service |
| Restore resurrection | Content-free connection tombstone replay | Disable Agent Access and replay deletion | Lifecycle |
| Token passthrough | B0 accepts hashes only and has no upstream calls | Stop on raw/bearer field or network import | Resource-server |
| Private transcript retention | No tool result or user content in B0 | Delete connection; no delivered data exists | Privacy/support |
| Polling/cost | No endpoint/provider in B0 | Keep B1/B2 off | Reliability/economics |

## 10. R1–R17 adversarial review

| Lens | B0 answer |
|---|---|
| R1/R7/R10/R11 | No linguistic content, generation or evaluator exists. |
| R2/R5 | Persistence alone is not claimed as learning value; it enables independently revocable useful capabilities from AA2-A. |
| R3/R9 | IDs and external memory never become learner truth. |
| R4 | Consent/revoke mobile UI is explicitly deferred to B2 and blocks live use. |
| R6/R8 | No corpus body or lesson artifact path. |
| R12 | OAuth lifecycle is a separate security/control substrate; MCP and business logic remain outside it. |
| R13 | Additive migration, default-off modules, tombstones and restore replay preserve rollback/non-resurrection. |
| R14 | User/client/connection/grant isolation is the main acceptance matrix. |
| R15 | Consent version, export stripping, deletion and downstream-retention boundary are structural requirements. |
| R16 | No endpoint, polling or managed LLM spend; storage caps and purge are mandatory. |
| R17 | No grade, review item, learner write or external prose. |

## 11. Exact stop conditions

Stop and return to the owner if:

1. a custom protocol/crypto implementation is needed to replace an audited AS;
2. any raw code, access token, refresh token, cookie, CSRF value, signing key or provider credential reaches B0 storage/log/export;
3. a row can be read or mutated without exact user/client/connection binding;
4. consent can be inferred, written by the external client or silently widened;
5. authorization-code consume or refresh rotation is non-atomic;
6. token reuse does not revoke the family and block future validation;
7. export/delete/restore resurrects or exports secret-like material;
8. B0 requires an HTTP route, MCP/AS dependency, live connection or real F1/F2/private payload;
9. focused auth/CP0/API/account lifecycle regressions fail because of B0;
10. unrelated dirty owner files cannot be excluded from commit.

## 12. Rollback

Before any live use, rollback is code/migration rollback on a disposable or default-off database. After migration reaches production default-off, rollback is disable-only plus code revert; do not drop security tables until a separately reviewed data-retention migration proves no records and no restore authority are needed. B0 creates no live credentials or external coordination.

## 13. Definition of done

AA2-B0 becomes `ENGINEERING_COMPLETE / NO_OAUTH_ENDPOINT / LIVE_RUNTIME_ABSENT` only when all §8 fixtures and existing focused auth/CP0/API/account lifecycle gates pass, evidence is recorded here, scoped changes are committed/pushed and no unrelated worktree file is included.

The next decision is a B1 loopback approval after reviewing B0 evidence and the refreshed pinned `oidc-provider` dependency/advisory surface. B0 completion does not authorize installing that dependency or mounting a route.

## 14. Engineering evidence — 2026-07-17

Implemented B0 only:

- migration `042_agent_access_oauth_lifecycle.sql` with public-client registry, opaque subject mapping, isolated connections/grants, single-use authorization-code hashes, refresh-token families, access-token deny hashes and content-free connection tombstones;
- pure OAuth lifecycle validators with exact public redirect/resource/scope/PKCE/hash bounds;
- transaction-locked repository for incremental consent, activation/scope reduction, authorization-code consume, refresh rotation/reuse response, connection/client/account security revoke, export, delete and TTL purge;
- structural account export strips subject/code/token/JTI/PKCE values; account delete and row-count completeness include the exempt Agent Access journal;
- restore replay removes a resurrected connection and its cascaded security rows while preserving the other user;
- no AS/MCP dependency, endpoint, key, plaintext credential, live data handler, Hermes mutation or provider call.

Repository reconciliation found one concrete design constraint: existing `identityRepo.recordConsent` bounds `consent_key` to 80 characters. B0 therefore caps `connection_id` at 24 safe ASCII characters, which keeps the canonical `external_agent_access:<connection_id>:<scope>` key complete and non-truncated for every v0 scope. This is now an enforced contract, not an assumption.

Gate results:

| Gate | Result |
|---|---|
| `npm run smoke:agent-access:oauth` | **PASS** — 24 lifecycle/isolation checks plus restore; 0 cross-user leaks, 0 exported secret values, refresh reuse family revoked, 0 endpoints/provider calls |
| `npm run smoke:agent-access` | **PASS** — 20 closed capability checks, 0 network/provider/live-data calls |
| `npm run smoke:cp0` | **PASS** — observer/integration/parity/lifecycle/restore/process-failure |
| `npm run smoke:f1` | **PASS** — contract/lifecycle/isolation/restore/UI |
| `npm run smoke:f2` | **PASS** — contract/observation/target/evaluator/lifecycle/isolation/restore/UI; Agent Access replay count remains zero in the F2 fixture |
| `npm run test:api-smoke` | **PASS** |
| `npm test` | **UNCHANGED BASELINE DEBT** — 269/278 pass; the same stale classic-mode DOM expectation and eight GCP pipeline tests without BYOK key |

### Post-implementation R1–R17 conclusion

- **R2/R5:** B0 is not marketed as learner value; it is independent revoke/consent infrastructure for the already bounded AA2 capabilities.
- **R9/R12/R17:** no learner truth, business logic, grade/evidence or external prose enters OAuth storage.
- **R14:** two-user and two-connection negatives, security epochs, exact client/resource/scope bindings and atomic single-use transitions are executable.
- **R15:** secret stripping, per-connection tombstone, account deletion and restore non-resurrection are executable.
- **R16:** no route, polling, SDK or managed-model spend exists.

AA2-B0 is complete. AA2-B1 remains a new authority boundary: installing `oidc-provider`, running loopback authorization or mounting any AS handler still requires the separate post-B0 approval stated in §3.
