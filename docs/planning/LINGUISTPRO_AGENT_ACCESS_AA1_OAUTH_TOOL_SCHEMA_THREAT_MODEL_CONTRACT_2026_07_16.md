# LinguistPro Agent Access — AA1 OAuth, tool-schema and threat-model contract

**Date:** 2026-07-16

**Status:** `OWNER_APPROVED / CONTRACT_APPROVED / IMPLEMENTATION_STAGED`.

**Authority:** AA1 contract and capability-expansion policy. It does not itself authorize OAuth runtime, client registration, credentials/tokens, connection persistence, migration, MCP endpoint/adapter/client, SDK dependency or live external connection. The owner approval below authorizes a separate AA2 execution packet and its explicitly bounded default-off AA2-A domain-service slice; later AA2-B/AA2-C work remains separately gated.

**Owner approval:** 2026-07-17 — Option B, the principal/scopes/schemas/lifecycle/threat controls in this contract, and the extensible AA2-R1/AA3/AA4 horizon are approved. The initial narrow schemas are rollout contracts, not a permanent product ceiling. AA2-A may begin only under its separate execution packet and may not create an OAuth/MCP endpoint, credential, token, migration, live connection or provider egress.

**Repository baseline:** committed `main` / `ed3cf11`; package `3.11.189`. Existing unrelated owner changes are preserved. F2 is committed, deployed default-off and `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`.

**Predecessors:** owner-approved Agent Access direction A/A/A/A/A/A/A/A/A/A plus the 2026-07-17 expansion amendment; S0–S2 approved; S3 `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; F1 owner path technically verified; F2 engineering complete/default-off.

**Critical F1/F2 boundary:** no real F1/F2 payload was read for this packet. AA1 reserves only future vocabulary; AA2 v0 receives no F1/F2 records, hypotheses, attempts, evaluations, decisions, query receipts or private source bodies.

**What to review:** this file. It is a domain/security contract, not an implementation spec or launch approval.

## 1. Recommended architecture

Recommend **Option B: a vendor-neutral LinguistPro Agent Access Service, a separate logical OAuth authorization-server boundary, and MCP as one thin Streamable HTTP adapter**.

```text
Hermes / second MCP client / future native client
                 |
        HTTPS + OAuth access token
                 |
   MCP thin adapter or future REST adapter
                 |
  Agent Access Resource Server boundary
                 |
  LinguistPro Agent Access Service
     | policy | purpose | scopes | caps
     | consent | connection | audit | rate
                 |
 existing first-party deterministic controllers
                 |
 review_log / projections / corpus / agent metadata

Browser first-party session
                 |
 authorization + consent ceremony only
                 |
 dedicated logical Authorization Server
                 |
 short access token + rotated refresh-token family
```

The existing `lp_session` cookie may authenticate the owner during the browser authorization ceremony. It is never an access token, never delivered to the external client, and never accepted by the Agent Access resource endpoint. The future authorization-server implementation must use an audited OAuth implementation or delegated standards product; ad-hoc cryptography or a static-token emulation fails this contract.

## 2. A/B/C architecture options

| Option | Topology | Advantages | Decision |
|---|---|---|---|
| **A — delegated external authorization server** | Standards AS/IdP issues Agent Access tokens; LinguistPro is resource server and owns connection/consent mapping. | Less OAuth protocol code; stronger mature security operations. Identity reconciliation, provider lifecycle and privacy/vendor dependence become new obligations. | Acceptable fallback after an explicit provider/region/export/delete/incident decision. |
| **B — dedicated logical LinguistPro authorization server + separate resource server (recommended)** | Same product deployment may host both logical boundaries, but token endpoints/keys/audience/store are separate from PWA sessions; browser session is used only for first-party login/consent ceremony. | Preserves first-party user/consent continuity and independent connection revoke without outsourcing identity. | **Recommend**, conditional on an audited library/product and all negative/rotation/restore gates. |
| **C — permanent API key, shared bearer or browser session reuse** | Static token in Hermes config or cookie/CSRF forwarding. | Superficially simple. No adequate audience, incremental scope, connection isolation, rotation or revoke. | Reject. |

If Option B cannot satisfy the authorization-server security gates with a maintained audited component, AA2 stops and returns to the owner for an Option A bake-off. It does not fall back to Option C.

## 3. Live repository reconciliation

### 3.1 Reusable substrate

| Area | Live fact | Allowed reuse |
|---|---|---|
| Identity | Owner bootstrap, HttpOnly `lp_session`, hashed secret, principal-derived `user_id`, session/device revoke. PWA and Mini App session audiences are separated by `session_kind`. | User authentication for the first-party authorization/consent ceremony; never remote bearer reuse. |
| CSRF | Cookie-authenticated mutations require `X-LP-CSRF`. | Authorization/consent UI mutations keep first-party CSRF. MCP bearer requests do not use or expose CSRF. |
| Consent | `consent_records` is append-only history with versions and action-time checks in sensitive flows. | Pattern for append-only external-recipient consent; current keys/copy do not authorize Agent Access. |
| Connection-like lifecycle | Devices/sessions, Telegram `channel_links`, pairing tokens, Push subscriptions and Mini App structural revoke exist. | Lifecycle patterns only. None is an OAuth client/connection/grant. |
| Handoff | Reading handoff is hashed, user-bound, single-use, five-minute TTL. | Security pattern for a future closed app handoff; current token/action schema is not reusable as arbitrary Agent Access capability. |
| Notification | `nudge_ledger` owns one first-party cross-channel daily claim. | External delivery remains absent in v0; future delivery must join this controller. |
| Data lifecycle | Dynamic user-table export/delete plus deletion-journal restore replay; F1 adds per-record erasure replay. | Agent Access tables must join export/delete and get anti-resurrection proof. |
| CP0 | Dedicated content-free observation store and 28-scenario registry, default-off. | Add external scenarios before live AA2; never copy tokens, arguments or results. |
| Public corpus | Browser/static catalog and FTS shards; server can read a bounded exact public sentence/window. | Build a new bounded public metadata search service for Agent Access; do not wrap private OPFS search. |
| Lesson Builder | Typed draft, selected 1–3 sources, server build, browser-only `sessionStorage` ≤24h. | Future lesson intent may open first-party confirmation; no remote build/status/provider call. |

### 3.2 Missing runtime

- no OAuth authorization-server or protected-resource metadata;
- no client registry, redirect URI registry, signing/JWKS keys, access/refresh token family or grant store;
- no `connection_id`, external actor or independent connection revoke;
- no Agent Access scopes/recipient consent/capability version;
- no Agent Access Service, remote public-search controller or bounded aggregate contract;
- no MCP endpoint, adapter or SDK dependency;
- no Origin/Host/CORS policy for a remote MCP endpoint;
- no Agent Access CP0 scenarios, rate buckets, support UI or incident runbook.

### 3.3 Explicit discrepancies

- Live committed baseline inspected for this contract is `ed3cf11` / `3.11.189`; the older `CLAUDE.md` product-version line may lag and is not used as runtime evidence.
- Live CP0 registry has 28 scenarios; earlier Agent Access prose references 23.
- Existing consent keys are arbitrary bounded strings at the repository boundary. AA2 requires a closed Agent Access consent/scope registry and versioned public copy.
- Public corpus search is not currently a server tool. `reading.public.search` therefore requires new deterministic business logic behind the Agent Access Service, not a mechanical endpoint wrapper.
- Existing account export loads user-scoped rows into memory and restore replay covers current journals; Agent Access token/connection rows need explicit stripping and anti-resurrection additions before implementation.

## 4. Domain boundary and adapter rule

### 4.1 Agent Access Service owns

- authenticated principal and connection binding;
- purpose, scope, consent, capability-version, flag and budget decisions;
- closed input/output/error schemas and byte/cardinality limits;
- calls to allowlisted high-level deterministic controllers;
- content-safe CP0/audit facts;
- rate, idempotency and handoff policy;
- stable domain errors independent of transport.

### 4.2 MCP adapter owns only

- MCP initialization/version negotiation;
- Streamable HTTP transport and session protocol details;
- protected-resource challenge/discovery integration;
- `tools/list` projection from already-authorized capability metadata;
- `tools/call` decode → Agent Access Service → encode;
- MCP structured result/error mapping.

MCP handlers contain no SQL, FSRS, grading, learner-state, notification, corpus-ranking or lesson logic. A future native/REST adapter must call the same Agent Access Service.

No MCP resources, prompts, sampling or task capability are exposed in AA2 v0. Tools only. This avoids ambient enumeration, client-owned prompt authority and polling/task lifecycle before their product value and authorization are proven.

## 5. OAuth topology and exact validation contract

### 5.1 Standards flow

1. MCP resource endpoint uses HTTPS Streamable HTTP.
2. Resource server publishes OAuth Protected Resource Metadata and returns a correct `WWW-Authenticate` challenge.
3. Client discovers the authorization server from resource metadata.
4. Authorization server publishes RFC 8414 and/or OIDC discovery metadata, including `S256` PKCE support.
5. Client sends Authorization Code request with PKCE `S256`, exact registered redirect URI, `state`, requested scopes and the RFC 8707 `resource` indicator.
6. First-party browser authenticates the user and presents versioned incremental consent for one `oauth_client_id` and one prospective `connection_id`.
7. Authorization server issues a short-lived audience-bound access token and, only when approved, a rotated refresh-token family.
8. Resource server validates the token and live connection/grant state for every call.

The current MCP authorization specification requires protected-resource discovery, resource indicators/audience binding and PKCE; token passthrough is forbidden ([MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)).

### 5.2 Every-request token validation

All checks are mandatory; failure is fail-closed and content-free:

| Check | Required rule | Error |
|---|---|---|
| Issuer | Exact configured `iss`; discovery metadata pinned for the approved AS | `AUTH_ISSUER_INVALID` |
| Signature | Approved asymmetric algorithm only; current `kid`; JWKS cache with bounded refresh; reject `none`, symmetric confusion and unknown key | `AUTH_SIGNATURE_INVALID` |
| Audience/resource | Exact canonical Agent Access resource URI in `aud`; no browser/API/provider audience accepted | `AUTH_AUDIENCE_INVALID` |
| Subject | Non-empty stable AS subject mapped server-side to exactly one live LinguistPro `user_id` | `AUTH_SUBJECT_INVALID` |
| Client | `client_id`/authorized-party claim equals registered `oauth_client_id`; token grant and redirect registration match | `AUTH_CLIENT_INVALID` |
| Connection | Token carries opaque `connection_id`; live row matches user, client, scopes and security epoch; not revoked/deleted | `CONNECTION_INVALID` |
| Scope | Required tool scope is present in both token and current grant; no wildcard or implication | `SCOPE_DENIED` |
| Time | `exp`, `iat`, optional `nbf` within configured skew; access TTL not exceeded | `TOKEN_EXPIRED` / `TOKEN_TIME_INVALID` |
| Revocation | Token family, connection, client, user security epoch and global feature state all active | `TOKEN_REVOKED` |
| Request | Unique server `request_id`; replay/idempotency rules for future mutations | `REQUEST_REPLAYED` |

`user_id` is never accepted as a tool argument. A valid token for one connection cannot name or access another connection.

### 5.3 Token lifecycle

- access-token target TTL: **10 minutes**;
- refresh-token target inactivity TTL: **30 days**, absolute family TTL **90 days** for owner-only AA2; owner may shorten before execution;
- refresh tokens rotate on every use; reuse revokes the entire family and connection pending review;
- signing keys have versioned rotation, overlap and emergency revoke procedures;
- connection revoke immediately prevents refresh and causes resource-server deny through live connection/security-epoch check; residual self-contained access-token exposure is bounded by TTL and, for high-risk incident revoke, a token-family deny entry;
- client revoke disables every connection for that client without affecting PWA/Telegram sessions;
- no provider/upstream token is accepted, stored in tool args or forwarded downstream;
- no access/refresh token appears in URL query, CP0, audit detail, error body, stdout or export.

## 6. Connected-agent principal model

Every request context contains server-derived values:

```json
{
  "user_id": "u_server_principal",
  "oauth_client_id": "client_registered",
  "connection_id": "conn_opaque",
  "external_actor_id": "actor_content_safe",
  "request_id": "req_opaque",
  "handoff_id": null
}
```

| Field | Rule |
|---|---|
| `user_id` | Derived from subject mapping; never serialized to MCP output/audit aggregate. |
| `oauth_client_id` | Identifies registered software, not a user or model persona. |
| `connection_id` | One user-approved installation/profile. A Hermes profile name is display metadata only. |
| `external_actor_id` | Content-safe audit pseudonym derived from connection/security epoch; cannot authorize. |
| `request_id` | Server-generated for each call and CP0 correlation. |
| `handoff_id` | Present only for a separately gated future handoff call; never reused as bearer access token. |

Effective authority is the intersection:

```text
user subject mapping
AND registered client
AND live connection
AND token scopes
AND current consent grant/version
AND purpose/tool binding
AND S1 role + S2 artifact contract
AND live flags/allowlist/rates/budget
```

No element delegates or widens another.

## 7. Consent and connection lifecycle

### 7.1 Incremental consent

- New consent namespace: `external_agent_access` plus versioned per-scope grants bound to `(user_id, oauth_client_id, connection_id)`.
- The screen names the client, profile/display label, exact scopes, data categories, purpose, expiry and downstream recipient/storage warning.
- Adding a scope creates a new authorization/consent event; existing refresh credentials do not silently gain it.
- Removing a scope immediately blocks that scope and rotates/reissues narrower credentials if the connection remains.
- `consent.write` is permanently prohibited: only the first-party authenticated browser ceremony can grant/revoke.
- Existing `cloud_texts`, `agent_read_texts`, F1 or Telegram consent never implies connected-agent consent.

### 7.2 Independent connection lifecycle

```text
PENDING_AUTH -> ACTIVE -> SCOPE_REDUCED | SUSPENDED -> REVOKED -> DELETED
```

- one user may have multiple connections; each has independent scopes, refresh family, display metadata, last-used timestamp and revoke;
- revoking an Agent Access connection does not revoke PWA/Telegram/Mini App sessions;
- revoking a browser session does not silently revoke every Agent Access connection unless the user chooses the account-wide security action;
- client-wide security incident may suspend all its connections;
- deletion removes secrets/token hashes/grants and preserves only approved content-free erasure/security evidence.

### 7.3 Downstream-retention disclosure

Consent copy must state:

> The connected agent, its model provider and its session/backups may retain tool results outside LinguistPro. Revoking this connection stops future access but cannot guarantee deletion of data already delivered. Use the agent's own session deletion/pruning controls as well.

Hermes currently persists full session messages and tool calls/results in `state.db`, with auto-prune off by default ([Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/)). Server minimization is therefore mandatory even for read-only tools.

## 8. Exact scope registry

### 8.1 AA2 v0 read-only scopes

| Scope | Exact authority | Explicit exclusions |
|---|---|---|
| `learning.brief.read` | One bounded deterministic aggregate with counts/codes/expiry | Items, answers, personal text, F1/F2 payload, mastery/grade prose |
| `review.summary.read` | Counts, estimated duration and handoff eligibility only | Item list, expected answer, grade, write, review history dump |
| `reading.public.search` | Public Ben-Yehuda metadata search with bounded result/page | Personal library, private bodies, learner-specific recommendation |
| `explanations.metadata.read` | IDs, dates, kinds, construct IDs and purge state | Explanation body, `facts_used`, sentence/source body |
| `agent.connection.read` | This connection's client/scopes/expiry/capability version and retention notice | Other connections, tokens, secrets or user ID |

### 8.2 Separately gated future scopes

| Scope | Future authority | Required later gate |
|---|---|---|
| `handoff.create` | Create a short-lived single-use first-party app handoff for a closed target | Separate AA2/AA3 decision; idempotency, target allowlist, CP0, rate and browser re-auth proof |
| `lesson.intent.create` | Create bounded intent/source references for first-party confirmation | AA3; no lesson body/build/provider call; source/consent recheck in app |

These scope names may be reserved in the registry but are not granted or advertised in AA2 read-only launch v0.

### 8.3 Future advisory vocabulary only

`advisory_evidence_summary` may be reserved as an ungrantable future schema name. It is not a scope and has no payload until a separate amendment decides whether minimized F2-derived information may leave LinguistPro.

### 8.4 Permanently prohibited external scopes

```text
review_log.write
grade.execute_as_agent
fsrs.write
mastery.write
word_status.write
linguistic_truth.write
consent.write
profile.write_silently
sql.execute
server_command.execute
user_data.delete
purge.execute
provider_route.override
```

Account deletion/purge remains a first-party authenticated flow and is never an agent tool.

## 9. Closed tool contracts

All wire schemas use JSON Schema 2020-12 semantics, `type: object`, `additionalProperties: false`, explicit `required`, bounded strings/arrays and ASCII enum/ID formats. `additionalProperties:false` applies recursively to every nested object and result item; every array has `maxItems` and `uniqueItems` where identity is meaningful. UTF-8 byte limits are checked after parsing; JSON character counts are not sufficient. Outputs contain no free-form model prose. The examples below are readable projections of those mandatory closed schemas, not permission to emit extra fields.

### 9.1 Common request rules

- maximum HTTP request body: **16 KiB**; tool argument object maximum **4 KiB**;
- one tool call per MCP request in v0; parallel execution disabled server-side regardless of client hint;
- no client `user_id`, `connection_id`, `scope`, `purpose`, URL, SQL, prompt or arbitrary metadata;
- purpose is server-bound by tool name; it is not model-supplied prose;
- unknown tool/field/enum fails closed.

### 9.2 `get_learning_brief`

Scope: `learning.brief.read`. Purpose: `EXPLICIT_CURRENT_LEARNING_BRIEF`.

Input:

```json
{"type":"object","additionalProperties":false,"properties":{},"required":[]}
```

Output, ≤1 KiB:

```json
{
  "schema_version": "aa.learning_brief.1.0.0",
  "due_total": 12,
  "urgent_total": 4,
  "scheduled_total": 31,
  "estimated_minutes": 8,
  "priority_code": "REVIEW_DUE",
  "unfinished_action_code": "READING_AVAILABLE",
  "generated_at": "UTC timestamp",
  "expires_at": "UTC timestamp"
}
```

Closed enums:

- `priority_code`: `REVIEW_DUE|READING_AVAILABLE|MENTOR_AVAILABLE|NO_CURRENT_ACTION`;
- `unfinished_action_code`: `READING_AVAILABLE|REVIEW_AVAILABLE|MENTOR_AVAILABLE|NONE`.

Counts are integers `0..100000`; `estimated_minutes` is `0..120`. This contract must be derived only from canonical bounded aggregate controllers approved at AA2 execution. It does not include F1 goals/threads or F2 results in v0.

Exact aggregate semantics for v0:

- `due_total`: current non-ignored scheduled items with `due_at <= generated_at` under the same deterministic predicate as the first-party due controller;
- `urgent_total`: the subset overdue by at least 24 hours; never a model-derived urgency label;
- `scheduled_total`: current non-ignored scheduled projection rows, including due rows;
- `estimated_minutes`: `min(120, ceil(due_total * 45 / 60))`; this is a planning estimate, not measured study time;
- `priority_code` precedence: `REVIEW_DUE` when `due_total>0`, else `READING_AVAILABLE` when the public Reading Room is available, else `MENTOR_AVAILABLE` when the first-party mentor surface is available, else `NO_CURRENT_ACTION`;
- `expires_at = generated_at + 5 minutes`; no client may treat an expired brief as current truth.

### 9.3 `get_review_summary`

Scope: `review.summary.read`. Purpose: `EXPLICIT_REVIEW_AVAILABILITY`.

Input: empty closed object.

Output, ≤768 bytes:

```json
{
  "schema_version": "aa.review_summary.1.0.0",
  "due_total": 12,
  "urgent_total": 4,
  "estimated_minutes": 8,
  "handoff_eligible": false,
  "handoff_scope_available": false,
  "generated_at": "UTC timestamp",
  "expires_at": "UTC timestamp"
}
```

No item key, surface, word, answer, modality, expected form or grade appears. `handoff_eligible` remains false until the separate future scope/gate is live.

`due_total`, `urgent_total` and `estimated_minutes` use the same definitions as §9.2; `expires_at = generated_at + 2 minutes`. `handoff_scope_available` reports only whether the separately gated scope is grantable in the current capability version; it is false throughout read-only AA2 v0.

### 9.4 `search_public_reading_catalog`

Scope: `reading.public.search`. Purpose: `EXPLICIT_PUBLIC_CATALOG_SEARCH`.

Input, ≤2 KiB:

```json
{
  "query": "optional UTF-8 <=160 bytes",
  "era": "optional enum",
  "genre": "optional enum",
  "language": "he",
  "audio": "ANY|AVAILABLE|UNAVAILABLE",
  "ready": "ANY|READY|METADATA_ONLY",
  "sort": "RELEVANCE|TITLE|AUTHOR|LENGTH_ASC|LENGTH_DESC",
  "cursor": "optional opaque <=256 bytes",
  "limit": 10
}
```

Required: `language`, `audio`, `ready`, `sort`, `limit`; `additionalProperties=false`. `limit=1..20`. Era/genre values come from a versioned public registry; no arbitrary facet string.

Output, ≤12 KiB and ≤20 results:

```json
{
  "schema_version": "aa.public_reading_search.1.0.0",
  "catalog_version": "opaque version",
  "results": [
    {
      "work_id": "public opaque ID",
      "title": "<=240 bytes",
      "author": "<=200 bytes",
      "era": "closed enum",
      "genre": "closed enum or UNKNOWN",
      "language": "he",
      "sentence_count": 120,
      "audio_available": false,
      "ready_state": "READY|METADATA_ONLY",
      "first_party_path": "/library.html"
    }
  ],
  "next_cursor": null,
  "generated_at": "UTC timestamp"
}
```

No corpus body, snippet, private progress, coverage score or learner-specific rank. `first_party_path` is server-generated from a fixed allowlist, never arbitrary URL input.

### 9.5 `get_recent_explanation_metadata`

Scope: `explanations.metadata.read`. Purpose: `EXPLICIT_EXPLANATION_HISTORY_METADATA`.

Input, ≤1 KiB:

```json
{
  "before": "optional UTC timestamp",
  "kinds": ["sentence|word|study_summary|draft_retell"],
  "limit": 10
}
```

`kinds` unique, max 4; `limit=1..20`; unknown kinds rejected.

Output, ≤8 KiB and ≤20 rows:

```json
{
  "schema_version": "aa.explanation_metadata.1.0.0",
  "items": [
    {
      "explanation_id": "opaque",
      "created_at": "UTC timestamp",
      "kind": "sentence|word|study_summary|draft_retell",
      "construct_ids": ["closed registry ID"],
      "purge_state": "AVAILABLE|PURGED|DELETED"
    }
  ],
  "next_before": null,
  "generated_at": "UTC timestamp"
}
```

`construct_ids` max 12; no body, facts, title, word, sentence, source anchor or model prose.

### 9.6 `get_agent_connection`

Scope: `agent.connection.read`. Purpose: `EXPLICIT_CONNECTION_STATUS`.

Input: empty closed object.

Output, ≤2 KiB:

```json
{
  "schema_version": "aa.connection.1.0.0",
  "connection_id": "this connection opaque ID",
  "oauth_client_id": "registered public client ID",
  "client_display_name": "<=120 bytes",
  "connection_status": "ACTIVE|SCOPE_REDUCED|SUSPENDED|REVOKED",
  "granted_scopes": ["closed scopes"],
  "access_expires_at": "UTC timestamp",
  "consent_version": "opaque version",
  "capability_version": "aa-v0.1",
  "downstream_retention_notice": "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO",
  "generated_at": "UTC timestamp"
}
```

No refresh expiry/token, user ID, other connection or secret.

### 9.7 Reserved future `create_app_handoff`

Not advertised/granted in read-only AA2 v0. Future scope `handoff.create`.

Input: `target` enum `OPEN_REVIEW|OPEN_PUBLIC_READING|OPEN_MENTOR|OPEN_LESSON_BUILDER`, optional public `work_id`, idempotency key 16–128 ASCII bytes; no URL/prompt. Output: opaque `handoff_id`, fixed first-party path, `expires_at`, `single_use=true`. Target-specific source revalidation and browser re-auth occur at redeem. Maximum TTL five minutes.

### 9.8 Reserved future `create_lesson_intent_handoff`

Not advertised/granted in read-only AA2 v0. Future scope `lesson.intent.create`.

Input: 1–3 already permitted public source refs only for the first future slice, closed `goal_code`, duration `10|20|30`, 1–3 focus enums and idempotency key; total ≤4 KiB. Output is a five-minute first-party handoff only. It creates no lesson draft/body, invokes no provider and does not persist personal source text.

## 10. Closed error schema

Every domain failure maps to one content-safe error object, ≤1 KiB:

```json
{
  "schema_version": "aa.error.1.0.0",
  "request_id": "req_opaque",
  "code": "SCOPE_DENIED",
  "retryable": false,
  "retry_after_seconds": null,
  "support_ref": "opaque content-safe ref"
}
```

Closed codes:

```text
UNAUTHENTICATED
AUTH_ISSUER_INVALID
AUTH_SIGNATURE_INVALID
AUTH_AUDIENCE_INVALID
AUTH_SUBJECT_INVALID
AUTH_CLIENT_INVALID
CONNECTION_INVALID
TOKEN_EXPIRED
TOKEN_REVOKED
SCOPE_DENIED
CONSENT_REQUIRED
PURPOSE_DENIED
TOOL_NOT_FOUND
SCHEMA_INVALID
INPUT_TOO_LARGE
OUTPUT_TOO_LARGE
RATE_LIMITED
CAPABILITY_VERSION_UNSUPPORTED
REQUEST_REPLAYED
SOURCE_UNAVAILABLE
SOURCE_DRIFT
FEATURE_DISABLED
DEPENDENCY_UNAVAILABLE
INTERNAL_ERROR
```

No exception message, SQL, path, token claim, user ID, source content or provider response is returned. MCP transport errors are mapped without changing the domain code.

## 11. Purpose binding, caps, caching and rate limits

### 11.1 Purpose binding

- purpose is statically mapped from tool+schema version;
- scope permits only that purpose, not ambient account browsing;
- Agent Access Service requests only the minimum controller projection;
- returned fields are allowlisted at construction time, then schema-validated;
- a tool result cannot be supplied back as authority for another tool; every call reauthorizes from server state.

### 11.2 Proposed AA2 owner-only rate envelope

Every call must pass **all** applicable buckets:

| Bucket | Limit |
|---|---:|
| IP | 300 requests/minute; auth-failure bucket 10/10 minutes |
| OAuth client | 600/minute, 10,000/day across owner allowlist |
| Connection | 60/minute, 2,000/day |
| User | 120/minute, 3,000/day across connections |
| `get_learning_brief` | 12/minute, 240/day; cache/expiry 5 minutes |
| `get_review_summary` | 12/minute, 240/day; cache/expiry 2 minutes |
| `search_public_reading_catalog` | 30/minute, 1,000/day; page max 20 |
| `get_recent_explanation_metadata` | 12/minute, 240/day |
| `get_agent_connection` | 30/minute, 500/day |
| future `create_app_handoff` | 6/minute, 20/day, one live/target |
| future `create_lesson_intent_handoff` | 3/minute, 5/day, one live intent |

These are `PROPOSED_CONTRACT` values to validate under S0/AA2 load. Rate keys come from trusted network/token/server state, never model args. `429` returns bounded `Retry-After`. Repeated polling after fresh `expires_at`, high cache-miss ratio or fan-out across connections triggers suspension/stop review.

### 11.3 Cost boundary

- all AA2 v0 tools are deterministic and provider-free;
- `external_provider_calls_total == 0`, `managed_llm_reservations_total == 0` and `byok_calls_total == 0` are hard gates;
- Hermes may use its own model to render the result, but that cost/output is outside LinguistPro and never canonical;
- no tool polling/background task/sampling capability in v0.

## 12. Content-safe audit and CP0 mapping

### 12.1 Reserved CP0 scenarios

Before live AA2, add separately approved scenarios:

```text
agent_access.learning_brief
agent_access.review_summary
agent_access.public_reading_search
agent_access.explanation_metadata
agent_access.connection_read
agent_access.handoff_create          # future/off
agent_access.lesson_intent_create    # future/off
```

### 12.2 Content-safe fields

| CP0/audit field | Rule |
|---|---|
| request/run IDs | Opaque server IDs |
| actor | `external_actor_id`, `oauth_client_id`, `connection_id` as scoped opaque refs |
| authorization | scope code, consent version, capability version, token audience code, allow/deny code |
| tool | tool/schema version and purpose enum |
| input | byte/cardinality buckets and per-connection keyed digest; no values |
| output | schema version, byte/cardinality buckets and keyed digest; no results |
| rate | bucket class and allow/deny code; no IP in CP0 payload |
| handoff | opaque handoff ID/target enum only for future tools |
| lifecycle | connection/token-family/security-epoch action codes |
| status | stable domain error/terminal code and latency bucket |

Never persist access/refresh tokens, authorization codes, PKCE verifier, cookie/CSRF, raw claims, query, corpus metadata/result, explanation ID list, private body, prompt or tool result. CP0 remains diagnostic and fail-open for allowed read responses; missing CP0 evidence makes the interval promotion-ineligible.

## 13. Export, delete, restore and external retention

### 13.1 Export

First-party account export must include learner-safe connection metadata, client/display name, granted-scope history, consent history, created/last-used/revoked times and content-safe action codes. It must strip:

- access/refresh token values and hashes;
- authorization codes, PKCE/state/nonces;
- signing/encryption keys and raw token claims;
- keyed input/output digests not meaningful to the user;
- IP/security internals.

### 13.2 Delete and revoke

- connection revoke synchronously blocks future calls and refresh before returning success;
- connection delete removes connection-scoped grants/token families and writes a content-free erasure journal before cascade;
- account delete includes every Agent Access user-scoped table in the structural sweep;
- client security revoke is independent of user account deletion;
- external recipient data already delivered is outside LinguistPro deletion control and the UI/export must not imply otherwise.

### 13.3 Restore

- pre-restore connection/account erasure and revoke journals are replayed against the restored DB;
- restored access/refresh/authorization credentials are invalidated by a post-restore security epoch/key rotation unless explicitly proven current and non-erased;
- deleted/revoked connections cannot become active from an old backup;
- unaffected PWA/Telegram sessions and unrelated user data remain intact;
- restore proof includes zero cross-connection resurrection and zero accepted pre-restore revoked token.

## 14. Origin, Host and CORS controls

- canonical resource origin and MCP path are exact configuration values; Host must match the approved public host after trusted-proxy normalization;
- reject unrecognized `Host`, forwarded host/proto chains and absolute-form request targets;
- validate every present `Origin`; allow only the exact approved first-party authorization UI origin where browser traffic is intended; reject `null` and all other origins;
- non-browser MCP clients may omit `Origin`; absence is not converted into a wildcard browser permission;
- MCP endpoint returns no permissive CORS headers and never `Access-Control-Allow-Origin: *`; browser credentials are not accepted there;
- authorization UI uses exact-origin CORS/CSRF/session controls separately;
- TLS required; redirect URIs exact-match registered HTTPS or approved loopback URIs;
- Streamable HTTP session identifiers are transport correlation only, never authorization.

MCP Streamable HTTP requires Origin validation to prevent DNS rebinding and recommends authentication on all connections ([MCP Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)).

## 15. Threat model

| Threat | Prevention | Detection | Content-safe audit evidence | Rollback/revoke | Stop condition | Accountable future owner |
|---|---|---|---|---|---|---|
| Stolen token store | 10m access TTL; secure client storage guidance; rotated refresh family; audience/client/connection binding | Refresh reuse, unusual IP/rate/client fingerprint, failed binding | connection/client refs, token-family action code, reason, time bucket | Revoke family+connection; suspend client; rotate keys if needed | Any stolen token accesses data or refresh reuse is accepted | Platform/security |
| Wrong user/client/connection binding | Server subject mapping; exact client and live connection intersection; no IDs in args | Negative isolation tests; binding mismatch counters | request/client/connection refs + deny code | Disable Agent Access; revoke affected client/connections | One cross-user or wrong-connection response | Platform/security |
| Cross-profile confusion | One connection per approved installation/profile; profile name is display only | Connection status display; client/profile mismatch reports | connection/client/display-label hash + action code | Revoke ambiguous connection; reauthorize explicitly | Owner cannot identify which profile is connected or another profile uses it | Product + platform/security |
| Prompt-injected tool call | Server scope/purpose/schema/caps; no model authority; outputs minimized | Denied purpose/schema patterns; client/tool-chain incident reports | tool/purpose/deny code, byte buckets | Suspend connection/tool; preserve first-party state | Injection causes broader result, mutation or private disclosure | Platform/security |
| Tool-description/annotation poisoning | Static signed/server-owned tool descriptions; annotations are hints only; adapter generated from registry | Compatibility diff/hash and unexpected `tools/list` change | registry/tool description version/digest | Freeze tool list; disable adapter | Description/annotation changes effective authority or scope | Platform/security |
| Replayed handoff | Future only: server ID, 5m TTL, single-use conditional consume, user/connection/target binding, idempotency | Duplicate consume/replay counters | handoff/target/connection refs + terminal code | Revoke handoff/connection; disable future scope | Replay succeeds or wrong user/target opens | Platform/security |
| Scope escalation | Closed scopes, incremental consent, no wildcard/implication, token+grant intersection | Requested-vs-granted mismatch; consent/version drift | scope codes, grant version, deny code | Reduce/revoke grant and refresh family | Old token gains new scope or prohibited scope appears | Privacy/lifecycle + platform/security |
| Token passthrough | Exact audience validation; separate downstream credentials; no provider token fields | Claim/audience tests; outbound header sentinel | audience decision code; zero token material | Disable resource server; revoke client; rotate affected credentials | Inbound token is forwarded or wrong-audience token accepted | Platform/security |
| Private data retained in external transcript | Aggregate/metadata-only outputs; separate recipient consent/disclosure; bodies/F1/F2 excluded | Output-schema scans; owner incident report; sentinel tests | output schema/bytes/digest and scope code only | Revoke connection; guide external session deletion; narrow schema | Any prohibited body/item/answer/F1/F2 payload leaves LinguistPro | Privacy/lifecycle |
| Tool chaining/exfiltration | Minimum outputs; no resources/prompts/sampling; one call/request; independent reauth; host warning | Correlated polling/chaining/rate anomalies; second-client abuse fixtures | tool sequence codes, buckets, connection ref | Rate-limit/suspend connection/client | Chaining bypasses purpose/caps or leaks private data | Platform/security |
| Duplicate reminders | No notification/delivery scope in v0; future delivery joins `nudge_ledger` claim | Cross-channel claim/delivery reconciliation | reason/channel/claim refs only | Disable future delivery scope and client | One duplicate official notification or second daily claim | Product + platform/security |
| External prose claiming mastery | Outputs are counts/codes; external-prose disclaimer; no write scope | User report; content contract review; no inbound prose accepted as evidence | output schema/version only | Revoke connection if repeated harmful claims; client guidance | Prose is presented as LinguistPro grade/mastery/evidence or influences canon | Education quality + product |
| Polling/load/cost amplification | Per-tool/client/connection/user/IP limits; TTL/cache; no tasks/sampling/provider calls | Rate/cache-miss/latency/DB queue metrics | rate bucket/deny/latency/size codes | Throttle/suspend tool/connection/client; global flag off | S0 thresholds breach, provider call occurs or persistent polling ignores expiry | Cost/platform |
| Bypass of CP0, consent or first-party controller | Agent Access Service is sole business boundary; action-time consent; CP0 required for promotion; future handoff revalidates in app | Import/call graph gates, CP0 coverage, negative controller bypass tests | scenario/role/capability/consent/controller codes | Global disable; revoke tokens; restore no canonical change | Any external handler calls DB/business writer directly or live interval lacks required coverage | Platform/security |
| OAuth authorization-code injection/open redirect | PKCE S256, state, exact redirect registry, one-time code, resource parameter | State/redirect/code-reuse failures | client/redirect class/deny code, no code value | Revoke grant/family/client; rotate secrets if confidential | Code redeemed by wrong client/redirect or open redirect exists | Platform/security |
| External client compromised/abusive | Client registration lifecycle, owner allowlist, per-client rates, capability pin, incident contact | Abuse patterns, security advisories, second-client differential tests | client/version/action/rate codes | Suspend client globally while preserving PWA/Telegram | Known critical compromise without containment or support owner | Platform/security + support |

MCP tool annotations are explicitly hints, not authorization, and tool results are untrusted cross-tool input ([MCP Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [MCP Client Best Practices](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices)).

## 16. Abuse, support, incident and rollback contracts

### 16.1 Abuse

- exact owner allowlist; no wildcard clients/users;
- client registration requires exact redirect URIs, owner/contact, software/version and security policy;
- rates in §11 plus failed-auth and guessed-ID buckets;
- no dynamic client registration in the first owner-only AA2 unless separately threat-modeled; pre-registration is safer for the reference matrix;
- automated scope/tool enumeration beyond the authorized connection is denied and monitored.

### 16.2 Support

User-visible connection page must show client, connection label, scopes, consent version, created/last-used/expiry, revoke button, downstream-retention warning, capability version and content-safe recent action codes. Support receives a `support_ref`, never a token or payload. Required owner functions: product, platform/security, privacy/lifecycle, education quality and support/incident.

### 16.3 Incident

Severity-zero-budget incidents: cross-user response, token passthrough, prohibited private/F1/F2 data egress, canonical write, consent bypass, restore resurrection or secret in logs. Response order:

1. global Agent Access flag off;
2. stop token issuance/refresh;
3. revoke affected connection/client/family or signing key;
4. preserve content-safe evidence only;
5. prove first-party PWA/Telegram/canonical paths unchanged;
6. notify owner and affected users under approved policy;
7. fix, rerun full affected gates and require fresh launch approval.

### 16.4 Rollback

Rollback is disable/revoke, never schema drop or canonical-state edit:

```text
future mutation-like scopes off
-> affected read tool off
-> client suspended
-> Agent Access global off
-> token issue/refresh off and families revoked
-> preserve export/revoke/delete UI
-> verify first-party sessions and canonical data unchanged
```

## 17. Fixture/loopback validation and vendor-neutrality

Before any live connection, AA2 must prove without real user data or provider spend:

1. loopback authorization server/resource server/client fixtures for code+PKCE, discovery, resource indicator, refresh rotation/reuse and revoke;
2. malformed/expired/not-yet-valid/wrong issuer/signature/key/audience/subject/client/connection/scope tokens;
3. cross-user/client/connection guessed IDs and cache-key isolation;
4. every closed tool positive/negative/unknown-field/oversize/cardinality/error case;
5. Origin/Host/CORS, redirect and proxy-header negatives;
6. CP0 content/secret/F1/F2 sentinel scans;
7. export/delete/revoke/restore zero-resurrection;
8. rate/polling/load under the S0 thresholds;
9. network tripwire proving zero model/provider calls;
10. Hermes reference client plus **at least one second independent MCP client** passing initialization, discovery, OAuth, tool schemas, errors, revoke and version negotiation.

Hermes alone can support a reference-client claim. A vendor-neutrality claim requires the second client and direct Agent Access Service contract tests that do not import Hermes code.

## 18. Exact compatibility-refresh gate

Current official snapshot on 2026-07-16:

- stable MCP protocol used by this contract: `2025-11-25` authorization semantics; Streamable HTTP transport remains the remote transport baseline;
- official TypeScript SDK `main` is v2 pre-alpha and states v1.x remains the production recommendation until stable v2/new-spec release;
- latest official Hermes release found: `v0.18.2` (`v2026.7.7.2`).
- installed owner-host Hermes snapshot: `v0.16.0` (`2026.6.5`), profiles `default` and `hebrew_library`, gateways stopped. This is inventory only; no profile/configuration was changed.

Sources: [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Hermes releases](https://github.com/NousResearch/hermes-agent/releases).

AA2 may not use floating `main`, `latest`, caret or prerelease dependencies. **Within seven days before AA2 implementation freeze**, the execution packet must:

1. record the then-current stable MCP protocol revision and diff authorization/transport/tools changes against this packet;
2. record the latest non-prerelease supported SDK line and exact package version/integrity; if v2 is still prerelease, use the latest maintained v1.x unless owner explicitly approves a different stable implementation;
3. record exact installed and latest stable Hermes versions and verify OAuth/tool behavior from its official docs/release notes;
4. select and pin the exact second MCP client/version;
5. run the full two-client loopback matrix and save results;
6. update schemas/adapter only through an owner-reviewed compatibility amendment if semantics changed.

Refresh again before live launch if the freeze is older than 30 days, any pinned component/version changes, a relevant security advisory lands, or the MCP protocol revision changes. Compatibility failure keeps the live flag off; it does not permit token/cookie fallback.

The installed Hermes version is behind the current official release snapshot. It cannot support a current Hermes compatibility claim or live AA2 connection until a separately approved upgrade/configuration step and the complete pinned loopback matrix pass.

## 18.1 Owner-approved capability expansion policy

The five AA2-v0 tools are the first wire surface, not the complete Agent Access product. The architecture must permit additive, separately consented capabilities without widening an existing grant or moving business logic into MCP:

1. **AA2-R1 richer reads:** server/device-parity next-reading recommendations, personal-library metadata, selected explanation bodies, and minimized F1/F2 advisory summaries only after separate scope/schema/retention/authority amendments;
2. **AA3-P0 proposals:** reading-session intent, lesson intent, plan-change proposal, reminder proposal and calendar-aware intent, all requiring first-party confirmation where they can affect state;
3. **AA3-P1 controlled orchestration:** approved lesson-draft lifecycle/status and official delivery routed through the existing notification controller rather than a second reminder authority;
4. **AA4 product:** user-managed connections, granular consent, audit, revoke, support, quotas and commercial policy.

Every addition requires a new explicit scope or versioned capability, closed schemas, purpose binding, minimization, rate/audit/retention rules, negative tests and an owner-approved execution amendment. Existing grants never acquire it silently. The permanent prohibited scopes in §8.4 remain prohibited; this policy expands useful orchestration, not canonical learner-state authority.

## 19. F1/F2 boundary

- AA1 may reserve future advisory evidence vocabulary only.
- AA2 v0 receives no F1 payload, source link, revision, query receipt, goal/thread body or candidate.
- AA2 v0 receives no F2 observation, hypothesis, request, attempt, missingness, evaluation, evidence, shadow decision, outcome, query receipt or private/public source body.
- F1 goals/threads are user-declared continuity, not external-agent truth.
- F2 shadow results are advisory artifacts, not grade/mastery/external-agent truth.
- No F1/F2 artifact becomes an OAuth scope through this packet.
- A future amendment must define exact minimization, recipient consent, retention, purpose, schema, authority label and revocation behavior before any such egress.
- Revocation stops future access; it cannot promise deletion from Hermes/model/provider/session/backups after delivery.

AA1 does not need real F1/F2 payloads because OAuth topology, connection isolation, scope semantics, closed schemas, lifecycle and threats are determined by the existing identity/controller/consent/CP0/lifecycle boundaries. Reading payloads would add privacy risk and bias schemas toward unapproved authority.

## 20. R1–R17 adversarial review

| Lens | Attack | Locked response |
|---|---|---|
| R1 | External prose or metadata becomes Hebrew truth. | No linguistic facts/body in v0; resolver and first-party sources retain authority. |
| R2 | Integration exposes activity counts without real learning value. | Five tools lead only to bounded review/reading/mentor actions; AA2 evidence measures first-party action, not tool volume. |
| R3 | Connection/request IDs form decorative lineage. | Typed principal/connection/request/handoff relations and CP0 correlation; IDs confer no authority. |
| R4 | OAuth/errors/deep links create mobile dead ends. | First-party connection/revoke/error UI and future handoff require separate 380×844/RTL proof. |
| R5 | “Any agent” marketing exceeds a thin owner-only surface. | Vendor-neutral architecture claim only after second client; no public/product readiness claim. |
| R6 | Public search becomes private ingestion. | Public metadata only; no personal library/source body or ambient resource surface. |
| R7 | Client/model wording alters register invisibly. | LinguistPro returns codes/metadata; external rendering is labelled and non-authoritative. |
| R8 | Lesson intent creates persistent scaffolding. | Future intent only, five-minute handoff, first-party confirmation, no build/body/provider call. |
| R9 | External memory/F1/F2 becomes learner truth. | No F1/F2 v0 scope; external transcript has zero learner-state authority. |
| R10 | One Hermes success is called vendor-neutral/safe. | Second client plus independent contract/security fixtures mandatory. |
| R11 | Service and adapter self-certify output. | Independent raw-source/controller fixtures; CP0 proves lineage, not educational correctness. |
| R12 | MCP handler contains business logic or becomes second writer. | Thin adapter; Agent Access Service calls existing controllers; no canonical write scopes. |
| R13 | OAuth tables/restore resurrect revoked access or break sessions. | Additive/default-off rollout, security epochs, erasure replay, disable-only rollback, first-party parity. |
| R14 | Token/profile/client crosses users/connections. | Issuer/audience/subject/client/connection/scope binding and exhaustive negatives. |
| R15 | Read-only data remains forever outside product. | Separate recipient consent, minimized schemas, downstream-retention warning and honest revoke limit. |
| R16 | Polling and agent rendering amplify load/model spend. | Multi-dimensional rates, TTL/cache, no MCP tasks/sampling/provider spend, S0 load gates. |
| R17 | External prose becomes evaluator/grade/evidence. | No items/answers/grade/write; external output never enters `review_log`, F2 or projections. |

## 21. Exact stop conditions

Stop AA1/AA2 preparation and return to the owner if any occurs:

1. audited AS/RS topology cannot be selected without custom ad-hoc token security;
2. browser cookie/CSRF/shared/admin/research/provider token reuse is proposed;
3. issuer/signature/audience/subject/client/connection/scope/expiry/revoke cannot all be validated;
4. token passthrough or upstream-provider credential forwarding appears;
5. a schema needs personal text, review items/answers, explanation bodies or F1/F2 payloads;
6. MCP handlers require direct DB/repository/business-writer access;
7. any prohibited external scope or canonical/consent/profile/delete write becomes reachable;
8. incremental consent or independent connection revoke cannot be made fail-closed;
9. export/delete/restore can resurrect a connection/token or omits an Agent Access table;
10. content/secret/cross-user data can enter CP0, audit, logs, errors or support artifacts;
11. Origin/Host/CORS/redirect/proxy boundaries cannot be pinned and negatively tested;
12. zero-provider tripwire or S0 load/rate thresholds fail;
13. Hermes plus a second client cannot pass the pinned contract;
14. compatibility snapshot is stale or requires a prerelease/floating dependency without explicit amendment;
15. live AA2, migration, SDK, OAuth/MCP runtime or connection begins without its separate execution approval.

## 22. Owner decisions

1. **Topology:** A delegated AS / **B dedicated logical LinguistPro AS+RS (recommended)** / C static/browser credential reuse (reject).
2. **Implementation safety:** approve audited AS library/product requirement and Option A fallback if B cannot meet gates.
3. **Principal model:** approve exact six fields and non-transitive intersection in §6.
4. **Scopes:** approve five AA2 read-only scopes; reserve but do not grant/advertise `handoff.create` and `lesson.intent.create`.
5. **Permanent prohibitions:** approve §8.4 without exceptions.
6. **Tools/schemas/errors:** approve §§9–10 and exact byte/cardinality bounds.
7. **Token lifecycle:** approve 10m access, 30d inactivity/90d absolute refresh family, rotation/reuse revoke and security epochs, or choose shorter values.
8. **Consent/retention:** approve separate connected-recipient consent and the downstream-retention/revoke limitation copy.
9. **Rates/cost:** approve §11 owner-only envelope and zero LinguistPro provider/model spend.
10. **Lifecycle:** approve connection export/delete/restore/anti-resurrection and independent revoke.
11. **Network boundary:** approve Origin/Host/CORS/redirect/proxy controls.
12. **Threat/ownership:** approve §15 controls and named accountable functions.
13. **Vendor neutrality:** require Hermes plus one pinned second client before the claim.
14. **Compatibility:** approve the seven-day freeze, 30-day/live refresh and no floating/prerelease default.
15. **F1/F2:** approve no payload/scope access in AA2 v0 and future amendment requirement.
16. **Next packet:** approved — create the AA2 execution packet and start only its AA2-A default-off closed-contract/domain-service slice after the documentation commit is pushed. AA2-B persistence/OAuth and AA2-C MCP/client/live work remain gated.

**Owner resolution (2026-07-17):** recommended Option B and decisions 2–16 are approved as written, including the 10m/30d/90d token targets as future implementation defaults subject to the compatibility/security bake-off. This approval does not create or broaden a live grant.

## 23. Separate AA2 execution approval packet plan

The approved next artifact is `LINGUISTPRO_AGENT_ACCESS_AA2_READ_ONLY_EXECUTION_APPROVAL_PACKET_2026_07_17.md`. It must stage the program rather than authorize all of it at once:

1. exact AS implementation/provider bake-off and threat review;
2. proposed migration DDL for clients, connections, grants, token families, security epochs and erasure journal;
3. exact files/modules and proof Agent Access Service owns business logic;
4. complete JSON Schemas/error mapping and generated contract fixtures;
5. exact OAuth metadata/endpoints/keys/redirect/resource/audience/rotation/revoke plan;
6. connection/consent/revoke/export/delete/restore UI and lifecycle implementation;
7. CP0 scenario/allowlist/hooks plus secret/content sentinel matrix;
8. IP/client/connection/user/tool limiters, cache and S0 load plan;
9. pinned compatibility matrix from §18 and two-client loopback evidence;
10. flags: global off, exact owner/client/connection allowlists, per-tool switches and rollback;
11. complete regression commands for auth, sessions, Telegram, Mini App, review, F1, CP0 and account lifecycle;
12. explicit post-diff R1–R17 critique;
13. default-off deploy plan and a separate later live-launch approval request;
14. explicit exclusions: F1/F2 payloads, provider calls, CP0 live window, AA3 mutation-like scopes, S7/public cohort.

AA2-A may proceed in parallel with bounded next-session/weekly preparation because it has no endpoint, token, external connection, private payload read, provider call or learner-state write. Promotion of personalized capabilities, AA2-B/AA2-C and every live connection remain behind their stated sequence and separate approvals.

## 24. Before / after

**Before AA1:** LinguistPro has strong first-party session, consent, connection-like, handoff, notification, lifecycle and CP0 primitives, but no external principal, OAuth audience/scope/connection contract, remote tool schema or external threat/incident boundary.

**After this packet:** the recommended vendor-neutral service topology, five read-only scopes/tools, future handoff stop line, OAuth validations, lifecycle, rates, audit mapping, threats, two-client proof and compatibility gate are decision-ready. No OAuth/MCP/runtime/schema/dependency or live connection exists yet.

## 25. Source map

Repository sources inspected:

- `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md` and every planning document mandated by the AA0/AA1 session prompt.
- Live `server.js` identity/session/CSRF/consent/account/agent/learner/Mini App/Telegram/handoff/corpus routes.
- `migrations/020`, `023`, `024`, `027`, `032`, `033`, `034`, `038`, `039`, `040` and corresponding repositories.
- Live Agent tools/runtime, Lesson Builder/session storage, public corpus catalog/FTS, notification claim, CP0 scenario registry and restore-erasure replay.
- `package.json`, `package-lock.json` and repo-wide runtime scan confirming no OAuth/MCP SDK or external-client runtime.

Official external sources refreshed on 2026-07-16:

- [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
- [MCP Streamable HTTP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).
- [MCP Client Best Practices](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices).
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- [Hermes MCP/OAuth guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/), [Hermes releases](https://github.com/NousResearch/hermes-agent/releases).

No private production operations file, real F1/F2 payload, browser credential, provider secret or live external connection was opened.
