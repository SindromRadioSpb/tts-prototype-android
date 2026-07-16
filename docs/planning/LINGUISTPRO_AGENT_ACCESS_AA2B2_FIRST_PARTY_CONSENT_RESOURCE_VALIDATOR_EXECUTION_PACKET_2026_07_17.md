# LinguistPro Agent Access — AA2-B2 first-party consent/revoke and resource-validator execution packet

**Date:** 2026-07-17

**Status:** `ENGINEERING_COMPLETE / DEFAULT_OFF / AS_UNMOUNTED / LIVE_CONNECTION_ABSENT`.

**Owner approval:** 2026-07-17 — “Стартуй.” This is a separate approval after AA2-B1 closure.

**Approval baseline:** `main` / `93a83fa`; package `3.11.192`; AA2-A and AA2-B0 engineering complete; AA2-B1 `LOOPBACK_ENGINEERING_COMPLETE / PRODUCTION_MOUNT_ABSENT`. Concurrent first-party work advanced the verification baseline to `bfda3df` / package `3.11.193`; B2 did not absorb those unrelated changes.

**Authority:** B2 may add a first-party mobile/RTL Agent Access page, a closed consent-ceremony controller, connection list/revoke/delete APIs, strict browser request-boundary validation and default-off route wiring. It may reuse the existing cookie session, CSRF gate, `consent_records`, B0 lifecycle repository and exact AA2 v0 scope registry. It may not mount the OAuth authorization/token server, mint or persist a key/token/code, register Hermes or another real client, add MCP, make a provider call, read tool/private/F1/F2 payloads, enable CP0 live capture, deploy, or create a live connection.

## 1. Decision

Choose **Option B: default-off first-party ceremony plus management surface, with an unmounted AS bridge**.

| Option | Shape | Decision |
|---|---|---|
| A — mount AS and consent together | Public `/oauth/*`, keys, registered client and live browser ceremony | Rejected for B2: combines UI, protocol, proxy, key and live-client risk. |
| **B — first-party B2 surface, default off** | Closed controller, authenticated management APIs, consent/revoke UI and strict boundary policy; authorization request enters only through an injected trusted bridge in fixtures | **Approved.** Proves informed consent and lifecycle without a credential or external connection. |
| C — defer all UI to B3 | Keep only B0/B1 fixtures | Rejected: consent comprehension, mobile/RTL and independent revoke would remain unproven. |

B2 is a real first-party product/control slice, but not an OAuth deployment. A future B3 AS interaction may call the controller only after it has validated client, redirect, PKCE, resource and scopes; browser fields never establish those facts.

## 2. Fixed and deferred coordinates

Fixed contract:

```text
resource = https://linguistpro.kolosei.com/agent-access
capability_version = aa-v0.1
consent_version = agent-access-consent-v1
retention_notice_version = downstream-retention-v1
```

Deferred to B3 owner approval:

- production issuer (recommended candidate: `https://linguistpro.kolosei.com/oauth`);
- exact Hermes and second-client redirect URI registrations;
- signing-key backend, key IDs, overlap and emergency-rotation runbook;
- production proxy topology and allowlisted forwarded hosts;
- any live client/connection allowlist.

B2 validators are parameterized and fixtures use `.invalid`/loopback coordinates. A candidate URL in this packet is not a deployed issuer or client registration.

## 3. First-party ceremony contract

Trusted AS-side input only:

```text
request_id
oauth_client_id
client_display_name
redirect_uri
resource_uri
requested_scopes[]
pkce_method = S256
connection_id
consent_version
capability_version
retention_notice_version
expires_at
```

The browser receives a closed preview without redirect URI, PKCE challenge, subject/user ID, token material or internal consent-record IDs. Every scope card shows:

- stable scope and capability label;
- exact purpose;
- exact data class and exclusions;
- whether data may be retained by the external recipient;
- independent checkbox, initially off;
- first-party action the agent can help open;
- explicit statement that external prose/memory is not mastery, grade or learner truth.

Approval requires all requested scopes individually selected, exact current versions and an unexpired server-held request. The browser submits only `request_id`, selected exact scopes and `decision=approve|deny`; it cannot submit client, user, connection, resource, purpose, retention version or redirect.

The controller writes consent only through the existing append-only `identityRepo.recordConsent` and activates the B0 pending connection only after every exact consent row exists. Denial writes no grants and leaves no active connection. Replaying a decided/expired request fails closed.

## 4. Connection management

First-party authenticated surface:

```text
GET    /api/agent-access/connections
POST   /api/agent-access/connections/:id/revoke
DELETE /api/agent-access/connections/:id
```

All routes are default-off. Every route derives `user_id` from `lp_session`; mutations require `X-LP-CSRF`. IDs in body/query never select another user. Responses expose connection/client display metadata, exact grants, lifecycle timestamps/version labels and downstream-retention notice only—never subject IDs, hashes, challenges, codes, tokens or private/tool data.

Revoke is independent per connection, bumps the connection security epoch and revokes active codes/families through B0. Delete first revokes, then writes the existing content-free erasure journal and removes the connection. UI wording is honest: revoke stops future LinguistPro access but cannot delete data already delivered to an external client's transcript/session/provider storage.

## 5. Host, Origin, CORS and proxy boundary

B2 adds a pure fail-closed request policy used by every Agent Access browser/API route:

1. feature flag must be exactly enabled; default and malformed values are off;
2. effective protocol must be HTTPS outside explicit loopback fixture mode;
3. configured canonical host must match the normalized direct `Host` and, only when proxy trust is explicitly enabled, the single allowlisted `X-Forwarded-Host` value;
4. comma lists, userinfo, whitespace ambiguity, ports not in policy, hostname suffix/prefix tricks and forwarded-proto mismatch are rejected;
5. browser mutations require an exact canonical `Origin`, JSON content type, valid first-party session and CSRF;
6. absent Origin is rejected on browser ceremony mutations; it is not treated as a native/server client exception;
7. CORS is not enabled for ceremony/management routes; preflight receives no permissive ACAO/credentials header;
8. responses use `Cache-Control: no-store`, `frame-ancestors 'none'`, `form-action 'self'`, `Referrer-Policy: no-referrer`, no opener and no external script/font dependency.

The B2 policy must not reuse `requireSameOriginJson`, because that helper deliberately accepts absent Origin for stateless/native callers and reflects error inputs. Agent Access needs a stricter browser-only boundary and content-safe errors.

## 6. UI and accessibility acceptance

New standalone assets avoid the currently dirty main shell/locales:

- `public/agent-access.html`;
- `public/js/agent-access.js`;
- `public/css/agent-access.css`.

Requirements:

- responsive at `380x844`, no horizontal overflow;
- RU, EN and HE strings embedded in the bounded module; HE switches `dir=rtl` and logical CSS properties;
- semantic headings, lists, fieldsets/legends, labels and live status;
- visible focus, keyboard-only approval/revoke/delete, minimum 44px targets;
- no generic external-agent prose generation, markdown/HTML injection or remote asset;
- approve disabled until all exact scope checkboxes and retention acknowledgement are selected;
- revoke and delete have distinct confirmation language;
- failure codes are mapped to bounded first-party copy; server detail is never rendered as HTML.

Visual proof must use fixture data only in a local browser. No existing signed-in browser profile, cookie/local storage or production page is inspected.

## 7. Exact implementation scope

Authorized additions/changes:

1. this packet;
2. `agent/access/consentCeremony.js` — closed trusted-request registry/controller with injected B0/consent dependencies;
3. `agent/access/requestBoundary.js` — pure flag/Host/Origin/proxy/content-type policy;
4. `db/agentAccessOAuthRepo.js` — only bounded list/sanitized lifecycle helpers required by management;
5. `server.js` — default-off page/API gates and route wiring only; no `/oauth`, metadata, JWKS, token or MCP route;
6. the three standalone UI assets in §6;
7. `scripts/premium/agent-access-consent-smoke.js` plus a local visual fixture harness if necessary.

No migration or new package is authorized. Because `package.json`/lockfile currently contain unrelated parallel owner changes, B2 uses the direct smoke command and does not edit or stage those files.

## 8. Required fixture and adversarial proof

Positive:

1. trusted fixture request produces a minimized preview;
2. five permitted scopes render exact purpose/data/retention copy;
3. approval creates one exact consent row per requested scope then activates only that pending connection;
4. incremental consent cannot imply unrequested scopes;
5. list output is sanitized and scoped to the cookie user;
6. revoke affects one connection and blocks its validation while a sibling remains active;
7. delete writes/replays erasure authority and exports no secret-like field;
8. mobile RU/EN/HE and RTL/keyboard states pass local visual inspection.

Negative:

- default-off page/API;
- unauthenticated and bad CSRF;
- absent/wrong Origin, Host, scheme and forwarded-host/proto confusion;
- cross-user/cross-connection ID;
- unknown/duplicate/wildcard/future/prohibited scope;
- wrong client/redirect/resource/PKCE/version/expired request;
- partial checkbox approval;
- browser attempts to supply identity/client/connection/resource/purpose/retention;
- replayed decision and double revoke/delete;
- token/cookie/CSRF/hash/challenge/subject leakage in JSON, DOM, audit or stdout;
- permissive CORS/preflight;
- F1/F2 names or payload fields entering request, preview, consent or grant;
- any `/oauth`, `/.well-known`, `/mcp` or provider/model call becoming reachable.

Evidence records only route, status/error code, lifecycle state, scope IDs and pass/fail—not consent cookies, CSRF, request contents, user IDs or returned data.

## 9. R1–R17 adversarial review

| Lens | B2 answer |
|---|---|
| R1/R6/R7/R8 | No linguistic body, corpus body, lesson build or generated prose crosses B2. |
| R2/R5 | Scope cards name concrete learning actions; B2 still does not claim efficacy or vendor neutrality. |
| R3/R9 | External memory/prose and connection IDs are never learner truth. |
| R4 | Mobile, keyboard and HE RTL are explicit gates. |
| R10/R11/R17 | Consent/fixture success is not evidence, grade, mastery or evaluator output. |
| R12 | Controller owns consent policy; future AS/MCP adapters remain thin and cannot grant directly. |
| R13 | Default-off routes, append-only consent, independent revoke/delete and no credentials keep rollback bounded. |
| R14 | Cookie user + CSRF + exact Origin/Host/client/connection/scope/version binding are the principal gate. |
| R15 | Recipient, data classes, downstream retention, revoke limitation, export/delete are visible and testable. |
| R16 | No polling, LLM/provider call, MCP client or managed-model spend. |

## 10. Stop conditions

Stop B2 and return to the owner if:

1. consent must trust any browser-supplied client, connection, resource, redirect, scope purpose or identity;
2. existing session/CSRF cannot bind every mutation to one first-party user;
3. one connection can read/revoke/delete another user or sibling connection;
4. UI cannot disclose recipient/downstream retention and revoke limitation before approval;
5. activation can occur without exact append-only consent rows and versions;
6. Host/Origin/proxy/CORS rules require permissive wildcard, suffix matching or absent-Origin acceptance;
7. an OAuth/JWKS/MCP endpoint, real key/client/token/connection or external call is needed;
8. a migration, new dependency, main-shell/locales conflict or F1/F2 payload read is needed;
9. secret/private content is required for evidence or appears in output/log/DOM;
10. auth, Agent Access lifecycle, restore, CP0 or API regressions fail;
11. unrelated dirty owner files cannot be excluded from commits.

## 11. Rollback and definition of done

Rollback is the default-off flag plus revert of B2 controller/routes/assets/repository helpers. Any fixture connection lives only in scratch DB and is destroyed. There is no client coordination, token/key revoke, data migration or production cleanup.

B2 is `ENGINEERING_COMPLETE / DEFAULT_OFF / AS_UNMOUNTED / LIVE_CONNECTION_ABSENT`: packet-first approval is pushed; the controller, UI, route boundary and lifecycle APIs pass §8 fixture and regression gates; local mobile/RTL proof is complete. The scoped implementation commit/push is the final publication step. This does not authorize B3 deployment, OAuth mount/keys, AA2-C MCP/Hermes, AA3 propose-first or a live owner connection.

### Completion evidence — 2026-07-17

- consent/connection fixture: 10 checks; minimized preview, exact append-only consents, cross-user isolation, independent revoke/delete, secret-free export; zero external connection, OAuth/MCP endpoint or provider call;
- real-server boundary fixture: default-off page/API, enforced CSP/no-store/frame deny, unauthenticated denial, exact cross-origin rejection and fail-closed OPTIONS with no CORS allow-origin;
- mobile visual fixture at the narrow viewport: RU and HE RTL, five closed scope cards, downstream-retention disclosure, 48px controls, no horizontal overflow and language-correct independent revoke/delete actions;
- regressions: Agent Access domain 20 checks; OAuth lifecycle/restore 24 checks plus restore; OIDC loopback Authorization Code + PKCE and 17 negative cases; auth 29/29; API smoke; complete CP0 observer/runtime/parity/lifecycle/restore/process-failure suite;
- no live/private/F1/F2 payload read, provider call, production connection, OAuth/MCP mount, dependency, migration, deploy or production operation occurred.

## 12. Separate B3 execution packet plan

B3 must decide and authorize:

1. exact production issuer, canonical/proxy hosts and protected-resource metadata URL;
2. encrypted signing-key backend, key generation custody, JWKS overlap/rotation/emergency revoke;
3. audited provider adapter/storage mapping for every B1 model;
4. exact registered Hermes plus second-client redirect URIs and software versions;
5. authorization/token/revoke endpoints, rate limits and content-safe CP0 hooks;
6. full fixture/two-client/load/security matrix;
7. default-off deploy followed by a separate live owner-window approval.

No B3 item is implied by B2 completion.
