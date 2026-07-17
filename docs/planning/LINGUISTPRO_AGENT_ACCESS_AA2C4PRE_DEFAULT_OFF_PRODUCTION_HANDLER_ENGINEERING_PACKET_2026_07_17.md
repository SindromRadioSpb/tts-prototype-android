# LinguistPro Agent Access AA2-C4-PRE default-off production-handler engineering packet

**Date:** 2026-07-17

**Packet status:** `OWNER_APPROVED / ENGINEERING_COMPLETE / DEFAULT_OFF_DEPLOYMENT_COMPLETE / ZERO_LIVE_AUTHORITY`.

**Baseline:** local `main = origin/main = 854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`.

**Intended engineering terminal status:** `FIVE_PRODUCTION_HANDLERS_ENGINEERING_COMPLETE / OWNER_EXACT_ONE_FAIL_CLOSED / DEFAULT_OFF / NO_PRODUCTION_CONNECTION`.

This packet is a predecessor to AA2-C4A. The owner approved the bounded engineering scope in §14 on 2026-07-17 and explicitly deferred execution to a fresh session. That approval authorizes only the local code/docs allowlist, synthetic tests, package bump, content-safe evidence and scoped commit/push described here. It does not authorize config/env mutation; deploy/restart; production data/runbook access; production owner configuration; client activation; OAuth/MCP flag enablement; authorization, consent or token flow; Inspector/Hermes production configuration; MCP/live calls; or AA2-C4A/C4B.

**Durable next-session prompt:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_ENGINEERING_NEXT_SESSION_PROMPT_2026_07_17.md`.

**Engineering evidence:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_ENGINEERING_EVIDENCE_2026_07_17.md`. Package `3.11.197`; C4A remains blocked pending separate Inspector-only approval.

**Deployment approval/evidence:** exact packet-carrier `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3` was approved and deployed default-off on 2026-07-17 under `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_APPROVAL_PACKET_2026_07_17.md`; content-safe proof is in `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA2C4PRE_DEFAULT_OFF_PRODUCTION_HANDLER_DEPLOYMENT_EVIDENCE_2026_07_17.md`.

## 1. Purpose and present blocker

AA2-C1 completed the stateless Streamable HTTP adapter, bearer/resource validator and five closed MCP tool contracts. AA2-C2 proved exact Inspector `0.22.0` and Hermes `0.18.2` interoperability against isolated synthetic handlers. AA2-C3 registered both reviewed static public clients in production as `SUSPENDED` while all lifecycle counts remained zero.

At the engineering baseline, production still constructed the service with `handlers: {}` and the owner parser did not require exact one. Those code blockers are now resolved and deployed, but production remains deliberately dormant: no owner allowlist, both clients suspended, clients gate `0`, MCP gate absent and zero lifecycle rows. C4A remains blocked by its separate approval boundary.

C4-PRE is limited to engineering five thin, deterministic, read-only projections and exact-one owner enforcement while all production access stays default-off. It is not Hermes integration, production MCP readiness, learning evidence or launch evidence.

## 2. Code-first findings that constrain the design

1. `db/learnerGraphRepo.js#getAgentContext()` already derives due state from `review_log`/`srs_projections`, but its `scheduled` count does not exclude manual `ignore`. It cannot be copied directly into the AA1 aggregate contract.
2. `agent/planner.js#buildPlanCore()` is deterministic only until `plan()` optionally invokes an LLM and writes an `agent_task`. MCP handlers must not call `plan()` or create a task.
3. `db/agentRepo.js#listExplanations()` returns full `body_json` and `facts_used_json`. Passing those rows through a handler would violate the metadata-only boundary even if the final object dropped the content.
4. the public Reading Room catalog is already shipped as immutable versioned artifacts: root, flat search and ready-card sidecars. No provider, private learner rank or corpus body is required.
5. `db/agentAccessOAuthRepo.js#loadConnection()` and `listConnectionsForUser()` are user-scoped reads and contain the authoritative connection/grant/client metadata needed for the current connection view.
6. `server.js#agentAccessOwnerIds()` rejects empty, wildcard and malformed values but not multiple or duplicate owners. C4-PRE requires exact one.

These are deliberate engineering seams, not permission to broaden schemas, add a migration or use private payloads.

## 3. Exact implementation allowlist proposed for the later engineering slice

Only the following tracked mutations are proposed:

| File | Exact purpose |
|---|---|
| `agent/access/productionHandlers.js` | compose the five closed handlers from injected deterministic reads and clock; no raw DB handle |
| `agent/access/publicReadingCatalog.js` | read/cache only shipped public catalog sidecars and implement bounded filter/sort/cursor projection |
| `db/learnerGraphRepo.js` | add one user-scoped read-only AA aggregate returning non-ignored scheduled/due/urgent counts |
| `db/agentRepo.js` | add one user-scoped metadata-only explanation projection; SQL returns no explanation/source body |
| `server.js` | wire the production handler factory and require exactly one valid owner ID only inside the existing four-flag MCP runtime |
| `scripts/premium/agent-access-production-handlers-smoke.js` | synthetic SQLite/public-sidecar positive, negative, isolation and no-write/provider gate |
| `package.json`, `package-lock.json` | add the focused smoke command and bump package `3.11.196 -> 3.11.197`; no dependency change |
| C4-PRE evidence and parent planning docs | content-safe results and exact next production decision |

No migration, API/UI route, OAuth schema, MCP input/output schema, capability, scope, provider module, public corpus body or production runbook change is allowed. If implementation requires another file or a schema change, stop for a revised packet.

## 4. Shared handler invariants

Every handler receives identity only through the frozen validated handler context:

```text
user_id, oauth_client_id, connection_id, external_actor_id,
request_id, purpose, scenario_id
```

No handler accepts user, subject, client, connection, token, resource, scope or owner IDs in tool arguments. Every learner-state query binds `context.user_id`; the connection query additionally binds `context.connection_id` and `context.oauth_client_id`. The existing service revalidates closed input/output schemas, scope, expiry and current-connection binding.

The factory is injected with repositories/artifacts and a clock so tests cannot touch live data. It exports only the five named functions. No catch-and-return-empty behavior is allowed for DB corruption, malformed JSON, catalog mismatch or unavailable authority; those conditions fail closed and never fabricate zero/empty truth.

## 5. Exact handler mappings

### 5.1 `get_learning_brief`

**Authority:** new read-only `learnerGraphRepo.getAgentAccessReviewAggregates(userId, { nowMs })`, using the existing `manualStatusMap()` semantics and `srs_projections`; new metadata-only `agentRepo.getLatestOpenPlanAction(userId)` over the existing `agent_tasks` authority; shipped Reading Room artifact availability. Neither repository method returns item keys or a plan payload to the handler.

The aggregate query returns only `{scheduled_total,due_total,urgent_total}`:

- `scheduled_total`: non-ignored projection rows with non-null `due`;
- `due_total`: their subset with `due <= generated_at`;
- `urgent_total`: their subset with `due <= generated_at - 24h`;
- `0 <= urgent_total <= due_total <= scheduled_total <= 100000`; overflow fails closed rather than truncating.

Derived fields are exact:

```text
estimated_minutes = min(120, ceil(due_total * 45 / 60))
priority_code = REVIEW_DUE                    when due_total > 0
              | READING_AVAILABLE             when the versioned public catalog is readable
              | MENTOR_AVAILABLE              when an approved deterministic mentor action exists
              | NO_CURRENT_ACTION
expires_at = generated_at + 5 minutes
```

`unfinished_action_code` is not inferred from counts. It is derived only from the newest valid open `agent_task kind='plan'` and its first closed section ID:

```text
fresh_struggles | production_gap | due -> REVIEW_AVAILABLE
read                                      -> READING_AVAILABLE
no open plan                              -> NONE
```

`MENTOR_AVAILABLE` remains a reserved enum and is not emitted by the current plan controller. Unknown/malformed task structure fails closed; the handler never reads item keys from the payload into its output and never calls `planner.plan()`, `llmGate`, a provider or `createTask()`.

### 5.2 `get_review_summary`

**Authority:** the same single aggregate snapshot and clock as §5.1. No second predicate is permitted.

Exact projection:

```text
due_total / urgent_total / estimated_minutes = §5.1
handoff_eligible = false
handoff_scope_available = false
expires_at = generated_at + 2 minutes
```

No item key, word, grade, answer, channel, modality, source or expected form is selected or returned.

### 5.3 `search_public_reading_catalog`

**Authority:** `agent/nextText.js#catalogVersion()` for the single version pin plus only:

```text
public/data/benyehuda/corpus-catalog-v<V>.json
public/data/benyehuda/corpus-search-v<V>.json
public/data/benyehuda/corpus-index-v<V>.json
```

The root must point to the exact search/index filenames and all three versions must agree. The flat sidecar is title/author/facet metadata; the ready index supplies ready-card `segments` and `audio_status`. No manifest body, work body, FTS body index, OPFS profile, coverage score, recent-opened state or external fetch is read.

Source-to-contract mapping is fixed:

| Source | MCP value |
|---|---|
| era `biblical` | `BIBLICAL` |
| era `medieval` | `MEDIEVAL` |
| era `haskalah`, `tehiya` | `REVIVAL` |
| era `mandate` | `MODERN` |
| era `modern` | `CONTEMPORARY` |
| era missing/`unknown` | `UNKNOWN` |
| genre `prose` | `PROSE` |
| genre `poetry` | `POETRY` |
| genre `article` | `ESSAY` |
| genre `drama` | `DRAMA` |
| genre `reference`, `lexicon` | `REFERENCE` |
| genre `fables`, `memoir`, `letters` | `OTHER` |
| unknown genre | `UNKNOWN` |

Only source language `he` is eligible. `READY` requires both flat `r=1` and an exact ready-card join; otherwise the row is `METADATA_ONLY`. A ready join mismatch is catalog corruption and fails closed. Ready rows use `segments` as `sentence_count` and `audio_status != "none"` as `audio_available`; metadata-only rows return `0` and `false` without implying a body exists. `first_party_path` is always the literal `/library.html`.

The optional query is normalized exactly like the first-party title search: remove Hebrew marks U+0591..U+05C7, lowercase and trim; it matches title or author only. It never performs corpus-body search. Filters are exact contract enums after the mapping table.

Sorts use total, locale-independent tie breaking ending in string `work_id`:

- `RELEVANCE`: exact/prefix/contains title, then exact/prefix/contains author, then ready-first; without a query, ready-first;
- `TITLE`: normalized title, normalized author, ID;
- `AUTHOR`: normalized author, normalized title, ID;
- `LENGTH_ASC|DESC`: known ready-card `segments` in requested order, unknown metadata-only lengths last, then title and ID.

The opaque base64url cursor binds catalog version plus a hash of normalized query/filters/sort and the next offset. A stale, malformed or mismatched cursor is rejected. At most `limit <= 20` rows and a 12,288-byte validated output are returned. The cached source artifacts are immutable process inputs; cache creation performs no network or writes.

### 5.4 `get_recent_explanation_metadata`

**Authority:** new `agentRepo.listExplanationMetadata(userId, {before,kinds,limit})` implemented as user-scoped SQLite JSON projection. SQL may return only row ID, creation time, normalized kind, purge marker and registry-valid construct IDs. It must not return `body_json`, `facts_used_json`, sentence/item anchors, prose, model/provider or source facts to the handler.

Exact mapping:

```text
body.kind absent          -> sentence
body.kind in closed set   -> same kind
body.purge_reason present -> PURGED
otherwise                 -> AVAILABLE
construct_ids             -> unique known IDs from facts kind='constructs', sorted, max 12
```

`DELETED` remains reserved and is not synthesized: physically deleted rows are absent, while existing content erasure is `PURGED`. Query order is `created_at DESC, id DESC`; `before` is an exclusive UTC boundary. A page boundary that would split equal `created_at` rows must fail closed rather than silently omit/duplicate history under the timestamp-only v0 cursor. Malformed JSON, unknown kind or unknown construct values are rejected or filtered according to the closed construct registry; no raw fragment enters logs/evidence.

### 5.5 `get_agent_connection`

**Authority:** `agentAccessOAuthRepo.loadConnection(context.user_id, context.connection_id)`, `listConnectionsForUser(context.user_id)` and the already validated principal expiry.

The handler requires one exact joined row whose `oauth_client_id` equals `context.oauth_client_id`. It returns:

- IDs from the validated context/current row;
- display name from the registered client join;
- current connection status, consent/capability versions from the connection row;
- only current `ACTIVE` grant scopes, sorted and checked against the five-scope registry;
- `access_expires_at` from the validated principal snapshot;
- literal downstream notice `EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO`.

Missing, duplicate, cross-user, cross-client, non-registry or binding-mismatched data fails closed. No token/code/hash, subject mapping, consent body, audit body or other connection is returned.

## 6. Exact-one owner allowlist contract

`AGENT_ACCESS_OWNER_IDS` remains a server-side env value, never an MCP argument or evidence value. The later code slice must enforce all of the following:

1. parse comma-separated trimmed values only after all four existing exact-`1` runtime flags pass;
2. require exactly one non-empty unique ID matching `^[A-Za-z0-9._:@/-]{1,128}$`;
3. reject absent, empty, wildcard, malformed, duplicate and multi-owner values with `AA_MCP_OWNER_ALLOWLIST_INVALID`;
4. pass the same one-element frozen allowlist to both token validator and service;
5. require token subject -> user mapping, validated principal `user_id`, connection owner and allowlisted owner to agree;
6. never log, print, hash into public evidence or return the owner ID; evidence records only `owner_allowlist_count=1` and `owner_match=true|false`;
7. no fallback to email, display name, session user, first DB user or client ID.

With MCP or client flags off, an absent allowlist remains inert and the gate returns before parsing it. Default-off deployment may configure the one owner only under a separate production approval; configuration alone must not create authority.

## 7. Zero-provider, zero-write and privacy boundary

During every handler call, exact deltas must be zero for:

```text
review_log, srs_projections, agent_tasks, agent_explanations,
agent_subject_mappings, agent_connections, agent_connection_grants,
agent_authorization_codes, agent_token_families, agent_refresh_tokens,
agent_access_denials, identity consents/audit rows, erasure journal,
provider/LLM/BYOK ledgers and network call counters
```

Reads are restricted to user-scoped aggregate/metadata projections, current connection metadata and public shipped artifacts. The handler module must not import `llm`, `llmGate`, provider gateways, reviewer/write tools, identity consent writers, `fetch`, `http`, `https`, child processes or arbitrary SQLite execution.

The public catalog tool is open-world only with respect to already shipped public metadata, not network access. No F1/F2 table or payload, learner artifact body, explanation body, corpus body, prompt, grade, external memory or canonical write participates.

## 8. Synthetic/local validation matrix

The focused smoke must create a temporary synthetic SQLite database and temporary public sidecars, inject a fixed clock and instrument all writer/provider/network seams. It must prove:

| Gate | Required result |
|---|---|
| all five happy paths | exact closed outputs and TTLs |
| aggregate parity | non-ignored scheduled/due/24h-urgent predicates; annul/manual edge cases |
| overflow/malformed state | fail closed, never truncated/fabricated |
| unfinished plan mapping | exact section-code table; no task creation |
| catalog mappings | every era/genre, Hebrew-only, ready/audio/length honesty |
| catalog query/sorts/cursor | deterministic total order; cursor bound to version+request; stale/tampered reject |
| catalog integrity | root/index/search mismatch and ready-join mismatch reject |
| explanation metadata | four kinds, purge, construct registry, no bodies/anchors/models |
| timestamp collision | no silent pagination omission or duplication |
| connection view | exact current binding and active grants only |
| isolation | user A never reads/counts user B; wrong owner/client/connection reject |
| owner allowlist | absent/empty/wildcard/malformed/duplicate/multi reject; exact one passes |
| output poisoning/limits | unknown field, enum, ID, timestamp, cardinality and byte limits reject |
| write/provider/network tripwire | exact zero calls and exact zero table deltas |
| MCP regressions | C1 45-check smoke, C2 two-client smoke and neighboring OAuth suites remain green |

Tests may inspect synthetic values in-process but stdout/evidence prints only check names, counts and pass/fail. Synthetic sentinels for token/private body must have transcript/log occurrence count zero.

## 9. Deliberate lifecycle residue

C4-PRE creates no production lifecycle data. Future C4A must nevertheless preserve the existing lifecycle truth:

- an opaque subject mapping deliberately survives connection deletion;
- consent history is retained as accountability evidence;
- deletion writes an erasure-journal tombstone so restore cannot resurrect access;
- a bounded access-token denial/audit row may remain until expiry/purge.

These records are non-authoritative residue, not live access. The future terminal gate is exact zero live authority, not destructive deletion of deliberate privacy/audit records. Exact physical zero would require a separate lifecycle/schema decision and is not a C4-PRE workaround.

## 10. Default-off deployment gates for a later separate approval

Engineering completion does not authorize deployment. A later default-off deployment packet must pin one exact reviewed revision/package and prove before and after:

```text
Inspector row = SUSPENDED
Hermes row = SUSPENDED
AGENT_ACCESS_OAUTH_CLIENTS_ENABLED = 0
AGENT_ACCESS_MCP_ENABLED = absent or 0
subject/connection/grant/code/token-family/refresh/denial counts = 0
authorization/token/revoke/MCP client boundary = fail closed
production MCP dispatch count = 0
provider/LLM/BYOK count = 0
```

The deployment may exercise only startup/static/local synthetic self-checks; it may not call the production MCP route with a bearer, activate either client, run consent or configure Inspector/Hermes. Health, exact revision, proxy/private-backend invariants and a 15-minute zero-delta observation are mandatory. C4A must then be rebased to that exact deployed revision and separately approved.

## 11. Stop conditions

Stop without workaround if:

- any handler needs a provider, external network, write, private learner/body read or F1/F2 data;
- exact AA1 schema/TTL/scope cannot be met from the mapped deterministic authority;
- scheduled/due/urgent predicates diverge from the first-party non-ignored rule;
- explanation metadata cannot be selected without returning body/source content to application code;
- catalog enum mapping, version parity, ready join or deterministic cursor is ambiguous;
- exact-one owner cannot be proven without exposing the owner value;
- a migration, OAuth/MCP schema/scope change, UI/API route or unrelated repair becomes necessary;
- package/dependency integrity, tests or no-write/no-provider tripwires fail;
- production flags/clients/lifecycle state differ from the approved default-off pre-state;
- any client activation, OAuth lifecycle, MCP/live or Hermes/Inspector configuration becomes necessary.

Do not add DCR/CIMD, a client secret, shared bearer, token passthrough, fallback handler or synthetic production result.

## 12. Rollback

### Engineering rollback

Before deployment, rollback is the scoped revert of only the C4-PRE allowlist. No DB restore or migration rollback exists because no schema/data change is allowed. Re-run C1/C2 and OAuth regressions and confirm package/lock integrity.

### Future default-off deployment rollback

If a separately approved deployment fails: keep both clients `SUSPENDED`; keep client/MCP gates off; restore the prior exact revision/config; restart; verify `/healthz`, fail-closed routes, zero lifecycle deltas and zero dispatch/provider calls for 15 minutes. No token/connection cleanup should be necessary because their creation is prohibited. If any lifecycle row unexpectedly appears, stop and use a separate incident/recovery decision rather than deleting evidence ad hoc.

## 13. R1-R17 record

- **R1/R3/R6/R7/R8/R10/R13:** public metadata mappings and aggregates are deterministic, version-pinned, replayable and rollback-safe; no linguistic form or learner truth is invented.
- **R2/R5:** five handler responses and client interoperability are not learning value, Hermes product integration or launch evidence.
- **R4:** no UI changes occur; consent/mobile/RTL proof remains in the separately gated C4A ceremony.
- **R9/R12:** external memory and MCP business logic remain absent; handlers are thin projections over existing authorities and create no dual-write.
- **R11/R17:** no external prose, evaluator, grade, mastery or evidence authority exists; malformed/ambiguous authority fails closed.
- **R14:** user/client/connection/owner binding is exact, cross-user isolation is mandatory and no identity comes from arguments.
- **R15:** minimization, metadata-only reads, deliberate consent/subject/erasure residue and honest revoke limits remain explicit.
- **R16:** zero polling, provider/LLM/BYOK calls and managed-model cost; public artifacts are local and immutable.

## 14. Exact approved engineering wording

The owner approved this exact bounded scope on 2026-07-17; the wording is repeated in the next-session prompt so authority is explicit after handoff:

> Утверждаю AA2-C4-PRE default-off production-handler engineering по packet от 2026-07-17 для baseline revision `854411cd7069c6c0f8e3695cf295fc84e1d268ea`, package `3.11.196`. Разрешаю только scoped code/docs изменения из allowlist packet: реализовать пять thin read-only production handlers над указанными deterministic repositories/shipped public catalog artifacts, exact-one fail-closed `AGENT_ACCESS_OWNER_IDS` contract, user/client/connection isolation, synthetic temporary-DB/sidecar tests, zero-write/zero-provider/zero-network tripwires, package bump `3.11.196 -> 3.11.197`, content-safe evidence и scoped commit/push. Не разрешаю production runbook/production data access, config/env mutation, deploy/restart, production owner allowlist configuration, client activation, `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1`, `AGENT_ACCESS_MCP_ENABLED=1`, authorization/consent/token/revoke flow, Inspector/Hermes production configuration, MCP/live connection, DCR/CIMD, client secret/shared bearer/token passthrough, реальные credentials/tokens, private learner/F1/F2 payload reads, canonical writes, provider/LLM/BYOK calls, migration/API/UI/scope/schema changes, unrelated repair или AA2-C4A/C4B.

This authorizes engineering only. It does not authorize default-off production deployment. After successful engineering, the evidence must propose a separate exact-revision default-off deployment approval; only after that deployment may C4A be rebased and considered.

## 15. Still prohibited after successful C4-PRE engineering

Production deploy/restart or env mutation; owner allowlist configuration; activation of either static client; OAuth client/MCP flag enablement; authorization, consent, token, refresh or revoke execution; production Inspector/Hermes configuration; any MCP/live call; DCR/CIMD/registration; secret/shared-bearer/token passthrough; real credentials/tokens; private learner/F1/F2 reads; canonical writes; provider/LLM/BYOK calls; resources/prompts/sampling/elicitation/tasks; polling/cron/notification; client-wide rollout; C4A, C4B or product-launch claims.
