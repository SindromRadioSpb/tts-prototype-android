# LinguistPro Agent Access AA2-C4A Inspector-first controlled owner-only live validation packet

**Date:** 2026-07-17

**Packet status:** `DOCS_ONLY_COMPLETE / C4_PRE_ENGINEERING_COMPLETE / DEFAULT_OFF_DEPLOYMENT_PACKET_PREPARED_AWAITING_OWNER_APPROVAL / C4A_EXECUTION_BLOCKED`

**Snapshot revision:** `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`.

**Intended future terminal status:** `INSPECTOR_OWNER_WINDOW_PASS / CLIENT_REVOKED_AND_SUSPENDED / CLIENTS_GATE_OFF / MCP_GATE_OFF / ZERO_LIVE_AUTHORITY / HERMES_UNTOUCHED`.

This packet does not authorize production mutation, backup creation, deploy/restart, owner-allowlist configuration, client activation, flag enablement, authorization, interaction, consent, token issuance/revocation, Inspector or Hermes production configuration, MCP/live calls, code or migration changes, commit/push or AA2-C4B.

## 1. Purpose

AA2-C4A is intended to be the first bounded production OAuth/MCP window. It validates only MCP Inspector `0.22.0` against one owner account. Hermes remains `SUSPENDED`, unconfigured and unused throughout. The window must prove consent, exact scope minimization, PKCE/resource binding, five read-only calls, token-safe handling, revoke, flag-first shutdown and zero remaining live authorization authority.

This is not Hermes integration, general production readiness, learning evidence or product launch. Successful C4A would only permit a later separately approved C4B Hermes packet.

## 2. Authority used in this docs-only session

Allowed and completed:

- private read-only use of the production runbook;
- read-only local/origin/production revision, package, health, flag-presence, secret-presence, owner-allowlist-presence and aggregate DB-count checks;
- read-only inspection of the exact runtime, consent, schema, lifecycle and rollback code;
- preparation of this packet and reconciliation of the parent AA2-C status.

Not allowed and not performed:

- production backup, DB/env/config mutation, deploy or restart;
- client status or flag change;
- authorization, consent, token, revoke or MCP execution;
- Inspector/Hermes production configuration;
- real credentials, tokens, learner payload reads, provider calls or canonical writes;
- code/migration/API/UI mutation, commit or push.

## 3. Content-safe production snapshot

| Gate | Observed state |
|---|---|
| Local / origin / production revision | exact `854411cd7069c6c0f8e3695cf295fc84e1d268ea` |
| Package | exact `3.11.196` |
| `/healthz` | HTTP `200` |
| OAuth UI/runtime flags | exact `1 / 1` |
| OAuth clients gate | exact `0` |
| MCP gate | absent, therefore fail-closed |
| Required OAuth signing/cookie/audit material | present; values not read or printed |
| MCP owner allowlist | absent; count `0` |
| Inspector row | `0.22.0`, `PUBLIC`, `SUSPENDED` |
| Hermes row | `0.18.2`, `PUBLIC`, `SUSPENDED` |
| Subject mappings | `0` |
| Connections / grants / codes | `0 / 0 / 0` |
| Token families / refresh tokens / denials | `0 / 0 / 0` |

Existing unrelated owner F1/F2/research and `.agents/` files remain outside this packet's allowlist.

## 4. Hard blocker discovered by code-first recon

The exact production runtime constructs the MCP service with:

```text
handlers: {}
```

This is an intentional C1 boundary: the transport, validator, schemas and fixture handlers were completed, but no production business-data handlers were mounted. `initialize` and `tools/list` can describe the five tools, but every production `tools/call` would return `CAPABILITY_UNAVAILABLE` after successful authorization.

The runtime also requires a non-empty exact owner allowlist before it can construct an enabled MCP resource runtime. Production currently has no owner allowlist configured.

Therefore revision `854411c` is not executable for AA2-C4A. Enabling flags or activating Inspector on this revision would create OAuth/live state without the ability to complete the approved five-call validation. That is an immediate stop condition, not a reason to weaken the matrix.

## 5. Mandatory predecessor: AA2-C4-PRE default-off handler engineering

The separate docs-only packet is now prepared at `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_PACKET_2026_07_17.md`. Its preparation authorizes no engineering or production action; the exact approval in that packet is still required.

A separate owner-approved engineering/deployment slice is required before C4A can be rebased and approved. It must:

1. implement exactly five production read-only handlers over existing deterministic first-party repositories/services;
2. preserve every existing closed input/output schema and byte/cardinality/TTL bound;
3. return aggregate/public/metadata-only fields exactly as contracted;
4. perform no canonical learner write, grading, schedule mutation, provider/LLM/BYOK call, polling or external memory operation;
5. derive user/client/connection authority only from the validated principal, never from tool arguments;
6. retain `get_agent_connection` binding checks;
7. add fixture and local synthetic tests for each real handler, cross-user isolation, unavailable state, output poisoning, byte limits and zero provider calls;
8. add an exact-one-owner allowlist configuration plan without exposing the owner ID in evidence;
9. resolve post-window residual semantics in §11 without deleting deliberate privacy/audit records by improvisation;
10. deploy a new exact revision with both production clients still `SUSPENDED`, OAuth clients gate `0`, MCP gate absent/exact `0`, and all lifecycle counts `0`;
11. record content-safe default-off evidence and then rebase this C4A packet onto that exact revision.

This predecessor is specified but not authorized by the present packet.

## 6. Intended exact Inspector scopes after prerequisites pass

C4A requests all five scopes only because its bounded purpose is to validate each of the five v0 tools exactly once:

```text
learning.brief.read
review.summary.read
reading.public.search
explanations.metadata.read
agent.connection.read
```

No offline access extension, wildcard, additional scope or Hermes scope is allowed. The scopes are not evidence of learning value and must be revoked at window close.

## 7. Intended exact MCP call allowlist

After `initialize` with exact protocol `2025-11-25` and one `tools/list`, permit only:

```text
get_learning_brief
  arguments = {}

get_review_summary
  arguments = {}

search_public_reading_catalog
  arguments = { language:"he", audio:"ANY", ready:"ANY", sort:"RELEVANCE", limit:1 }

get_recent_explanation_metadata
  arguments = { kinds:["word"], limit:1 }

get_agent_connection
  arguments = {}
```

Each tool may be called once, plus at most one retry only for a documented transport failure that occurred before tool dispatch. No arbitrary query, cursor continuation, other explanation kind, resources, prompts, sampling, elicitation, tasks, batch request or unknown method is allowed.

Tool results must be validated in memory and summarized only as schema/status/size/count. Learning aggregates, construct IDs, explanation IDs, titles, authors, connection IDs and token material must not enter chat, screenshots or evidence.

## 8. Intended consent ceremony

After the predecessor and a new exact execution approval:

1. Inspector `0.22.0` starts authorization code flow with its reviewed static public client ID, exact loopback redirect, PKCE `S256`, exact resource and the five scopes in §6.
2. No DCR/CIMD, client secret, shared bearer or browser credential passthrough is permitted.
3. The existing authenticated owner session completes first-party login binding; credentials, session cookie and CSRF never leave the browser boundary or evidence.
4. The provider creates one opaque subject mapping and one `PENDING_AUTH` Inspector connection.
5. The owner opens the first-party consent page and verifies exact Inspector display name, five scope presentations, explicit exclusions, first-party action links and external-retention warning.
6. The owner checks exactly the five scopes, explicitly acknowledges downstream retention and approves once.
7. Consent activates exactly one Inspector connection/grant set. No Hermes row or connection changes.
8. Validate the consent page at desktop plus `380×844` in RU and HE/RTL before approval. Screenshots may contain only the public client name/scope prose; no owner identifiers, cookies, codes, tokens or learner results.
9. Redirect returns only to the exact Inspector loopback callback. Inspector stores tokens only in origin/session-scoped protected local storage and never logs their values.

Consent denial, replay, timeout, wrong owner, wrong redirect/resource/PKCE and scope-injection cases must remain fail-closed and may use synthetic/local tests rather than creating extra production connections.

## 9. Intended activation and flag sequence

The following sequence is non-operative until §5 passes and a new exact revision is approved.

### Preparation while fully off

1. Content-safe production preflight and fresh backup.
2. Confirm exactly two suspended clients and zero lifecycle rows.
3. Confirm Hermes remains `SUSPENDED` and unconfigured.
4. Confirm the new revision has five real handlers and exact-one owner allowlist readiness.
5. Activate only the Inspector registry row while OAuth clients gate remains `0` and MCP remains absent/exact `0`.
6. Configure the exact-one owner allowlist and set MCP exact `1` while OAuth clients gate remains exact `0`; restart the approved revision.
7. Verify authorization remains `404 AGENT_ACCESS_OAUTH_CLIENTS_DISABLED`, MCP remains `404` at the client boundary, and lifecycle counts remain zero.

### Open the bounded window

8. Set only `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1` and restart the same approved revision.
9. Verify health, exact revision, Inspector `ACTIVE`, Hermes `SUSPENDED`, and zero pre-flow lifecycle rows.
10. Execute the single consent ceremony, one initialize, one tools/list and five calls from §§7–8.
11. Perform one refresh rotation; prove the prior refresh token is no longer current without reusing it in production.
12. Revoke the Inspector token/connection through the approved first-party/revocation path and prove the access token is rejected without printing it.

### Flag-first close

13. Set OAuth clients gate back to exact `0` and restart first.
14. Verify authorization/token/revoke and MCP are fail-closed before cleanup.
15. Set Inspector row back to `SUSPENDED`; Hermes remains unchanged.
16. Revoke and delete the Inspector connection through existing lifecycle APIs; clear Inspector session storage and close its isolated browser profile.
17. Set MCP gate to exact `0` or remove it, retain clients gate `0`, and restart the same revision.
18. Run the zero-live-authority matrix, observe for 15 minutes, and stop. Do not enter C4B.

No step may combine Inspector and Hermes activation.

## 10. Token-safe evidence contract

Allowed evidence:

- exact versions/revision and public client ID;
- flag presence and `0/1` only;
- route class/status/result code and aggregate count;
- PKCE method `S256`, exact-resource match boolean and static-public-client boolean;
- MCP negotiated version, tool names, output schema version, serialized byte size and item/count cardinality;
- token-store protection/status, rotation/revoke booleans and token-value leak count;
- aggregate lifecycle counts and timestamps.

Forbidden evidence:

- credentials, token/code/PKCE/state/cookie/CSRF values;
- Authorization or full request headers;
- private storage paths, owner/user/subject/connection/grant/token IDs;
- learning counts/results, explanation/construct IDs, catalog titles/authors or any private learner payload;
- screenshots containing browser storage, network headers, consent continuation URLs or tool results.

## 11. Zero-residual-state decision

Exact physical zero across every Agent Access-related table is not compatible with the current deliberate lifecycle/privacy design:

- the opaque subject mapping survives connection deletion;
- first-party consent history remains authoritative;
- connection deletion writes an erasure-journal tombstone so restore cannot resurrect deleted access;
- a bounded access-token denial may remain until token expiry/purge.

C4A must therefore distinguish:

### Required exact zero live authority

```text
ACTIVE clients                 = 0
connections with live access   = 0
ACTIVE grants                  = 0
ACTIVE authorization codes     = 0
ACTIVE token families          = 0
ACTIVE refresh tokens          = 0
usable access tokens           = 0
open consent interactions      = 0
Inspector token-store values   = 0 after cleanup
```

### Expected non-authoritative privacy/audit residue

```text
opaque subject mapping         = 1 unless separately engineered otherwise
consent history                = retained
erasure-journal tombstone      = retained after connection deletion
expired denial/audit metadata  = bounded by existing TTL/purge policy
```

These retained records grant no access and contain no token value. Deleting them solely to make a counter read zero would weaken consent accountability and restore non-resurrection. If the owner instead requires exact physical zero, a separate lifecycle engineering decision is mandatory before C4A.

## 12. Immediate stop conditions

Stop before activation if:

- the exact revision still has empty/missing production handlers;
- the owner allowlist is absent, wildcarded, multi-owner or cannot be verified content-safely;
- local/origin/production revision or package differs from the newly approved handler revision;
- health, backup, proxy/private-backend, key identity or rollback readiness is uncertain;
- Inspector/Hermes row metadata or status differs from the expected pre-state;
- any lifecycle row exists before the window;
- production handlers require private bodies, F1/F2 reads, provider calls, canonical writes or new scope;
- token-safe storage or verification is impossible without disclosure;
- DCR/CIMD, client secret, shared bearer or token passthrough is required;
- consent UI cannot be verified at desktop and `380×844` RU/HE;
- any tool is unavailable, schema-invalid, oversized or leaks disallowed content;
- Hermes is contacted/configured or any unapproved method/call occurs;
- flag-first shutdown, revoke, delete or zero-live-authority proof fails;
- an unrelated production repair or broader code/migration/UI change becomes necessary.

Do not activate Inspector as a workaround for missing handler evidence.

## 13. Rollback

At any stop condition after the window begins:

1. set OAuth clients gate to exact `0` and restart first;
2. verify OAuth lifecycle and MCP access are fail-closed;
3. suspend the Inspector client row; Hermes remains `SUSPENDED`;
4. revoke the connection and all active credentials using existing first-party lifecycle authority;
5. delete the Inspector connection, preserving the erasure journal;
6. clear Inspector session storage and destroy the isolated profile;
7. set MCP gate exact `0`/absent and restart the exact approved revision;
8. verify zero live authority and stable health for 15 minutes.

Restore from the fresh backup only for DB integrity damage under a separate recovery decision. Normal OAuth rollback uses revoke/delete, not database restore.

## 14. R1–R17 record

- **R1/R3/R6/R7/R8/R13:** handler outputs must be deterministic, schema-closed, bounded, independently verified and rollback-safe.
- **R2/R5:** Inspector interoperability is not learning value, mastery evidence or product-launch evidence.
- **R4:** consent requires desktop plus `380×844`, RU and HE/RTL validation.
- **R9/R12:** no external memory and no second business-logic/write authority; handlers remain thin read-only projections.
- **R10:** Inspector and Hermes are independently activated; Hermes remains untouched in C4A.
- **R11/R17:** external prose/evaluator/grade/evidence authority remains absent.
- **R14/R15:** exact owner consent, scope minimization, downstream-retention warning, revoke and deliberate privacy/audit residue are mandatory.
- **R16:** zero polling, provider/LLM/BYOK calls and managed cost.

## 15. Approval boundary and current predecessor

No valid C4A execution approval can name revision `854411c`, because that revision lacks production handlers and owner-allowlist readiness. C4A execution wording is intentionally withheld until the predecessor is engineered, independently reviewed, deployed under a separate default-off approval, and this packet is rebased onto that exact revision.

The C4-PRE bounded local engineering completed on 2026-07-17 with package `3.11.197`; content-safe proof is in `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_EVIDENCE_2026_07_17.md`.

The separate docs-only deployment approval packet is now `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`. It awaits exact owner approval and has not changed production.

That engineering approval still does not authorize production deployment or any C4A action. Only a separately approved default-off deployment may produce a new exact-revision C4A execution approval.
