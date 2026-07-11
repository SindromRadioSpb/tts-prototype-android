# 19 — Agent control-plane technical design

**Status:** PROPOSED DETAILED DESIGN / OPEN SCHEMA, POLICY AND OWNER DECISIONS
**Date:** 2026-07-11
**Scope:** control plane for the existing LinguistPro Mentor; no production change is authorized by this document.
**Repository baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`; `agent/runtime.js`, `agent/tools.js`, `agent/llm.js`, `db/agentRepo.js`, `db/handoffRepo.js`, `db/txnLock.js`, identity/consent repositories and append-only `review_log`.
**Decision:** evolve the existing deterministic single-controller runtime. Do not introduce a general agent framework, shared autonomous memory, or an event-driven agent society. A specialist is admitted only through the promotion gate in §16.

## 1. Architectural decision and invariants

The control plane is an enforcement boundary around an already useful runtime:

```text
authenticated surface
  -> workflow controller (`agent/runtime.js` facade)
  -> policy authorization + minimized context pack
  -> model route OR deterministic degradation
  -> closed typed tool gateway (`agent/tools.js`)
  -> single-writer repository
  -> append-only truth / derived projections
```

The following are non-negotiable:

1. **R12 — one truth path.** `review_log` remains review truth; projections are replayable caches. The control plane may append an event through the existing reviewer path, never update SRS state directly.
2. **R14 — principal-derived tenancy.** `user_id` is taken only from authenticated `ctx`; its presence in model/tool arguments is a hard reject. Every database operation is user-scoped.
3. **R15 — action-time consent.** Authorization is repeated immediately before context read, provider egress and write. Revocation invalidates outstanding authorization and schedules derived-content purge.
4. **R16 — reserve before spend.** Every provider attempt belongs to one pre-call budget reservation. Missing key, kill switch, exhausted budget and provider failure degrade honestly.
5. **R17 — independent grading.** Planner/explainer output is never a grade. A deterministic grader acts first; LLM feedback cannot alone create a canonical review event. Missing response creates no review event.
6. Personal/provider text is untrusted data, never system instructions. No model chooses arbitrary tool names, principals, routes, scopes or approvals.
7. There is no direct SQLite import from workflow code. Existing/future repositories are the single writer. Every explicit multi-statement transaction uses `withTxnLock` while SQLite is a shared connection.
8. Sync request correctness must not depend on an in-memory queue. Durable queues are introduced only for background purge/evaluation/content work.

## 2. Concrete component boundaries

| Component | Responsibility | Forbidden |
|---|---|---|
| `runtime` | select registered workflow; create/cancel run; orchestrate fixed steps | SQL, ambient tools, provider fallback |
| workflow registry | immutable versioned policy manifest | executable user/provider content |
| policy engine | authorize principal, purpose, consent, data class, tool, route, budget | infer consent; expand scope on delegation |
| context builder | query bounded repositories, label/cite/minimize/redact | whole-account dump; instruction concatenation |
| model gateway | approved route, timeout, schema validation, telemetry | silent provider change; logging prompts |
| tool gateway | closed schema registry, capability validation, typed call | model-supplied `user_id`; direct DB handle |
| repositories | idempotent user-scoped persistence | dual writes to event and projection |
| worker | claim durable background jobs, renew lease, retry classified failures | canonical educational decisions |

The current `runtime.js` remains the server-facing facade. `tools.js` remains the sole tool gateway. `llm.js` is split conceptually into provider adapters plus a policy-aware gateway, but provider adapters retain their current no-prompt-logging rule. Existing `agentRepo.reserveLlmCall()` becomes a generalized usage reservation without weakening atomic check-and-reserve.

## 3. Workflow registry

Registry records are code-reviewed configuration, not mutable prompts in the database. Example:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "workflow_id": "mentor.explain_sentence",
  "version": "2.0.0",
  "owner": "product-owner",
  "purpose": "explain one anchored learner sentence",
  "execution": "sync",
  "allowed_data_classes": ["A", "B", "C", "D_TRANSIENT"],
  "required_consents": ["cloud_texts", "agent_read_texts", "provider_egress"],
  "allowed_tools": ["get_sentence_context_if_available", "create_explanation"],
  "write_scopes": ["agent_explanations:append"],
  "max_steps": 6,
  "deadline_ms": 12000,
  "model_timeout_ms": 8000,
  "max_input_bytes": 12000,
  "max_output_tokens": 512,
  "max_cost_usd_micros": 3000,
  "prompt_version": "explain-he-v4",
  "output_schema": "mentor.explanation.v2",
  "feature_flag": "AGENT_EXPLAIN_V2",
  "kill_switch": "AGENT_LLM_DISABLED"
}
```

Startup validation rejects duplicate `(workflow_id, version)`, unknown tools/schemas, write tools without a declared write scope, class C without required consent, unbounded limits and a prompt hash mismatch. Registry versions are immutable; changing prompt, tools, schemas, purpose or policy creates a new version.

## 4. Run, step and command schemas

### 4.1 Run request

```json
{
  "$id": "mentor.run.request.v1",
  "type": "object",
  "required": ["workflow_id", "workflow_version", "intent", "request_id"],
  "additionalProperties": false,
  "properties": {
    "workflow_id": {"type": "string", "pattern": "^[a-z][a-z0-9_.-]{2,79}$"},
    "workflow_version": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"},
    "intent": {"type": "object", "additionalProperties": false},
    "request_id": {"type": "string", "minLength": 16, "maxLength": 80},
    "client_deadline_at": {"type": ["string", "null"], "format": "date-time"}
  }
}
```

Identity, device, channel and tenant are deliberately absent: the server adds them from validated session/channel context. Unknown intent fields fail validation rather than being passed to a prompt.

### 4.2 Persisted run envelope

```json
{
  "run_id": "ar_01K0...",
  "trace_id": "tr_01K0...",
  "parent_run_id": null,
  "workflow": {"id": "mentor.explain_sentence", "version": "2.0.0"},
  "principal": {"kind": "user", "user_ref": "HMAC(user_id)", "session_kind": "pwa"},
  "purpose": "explain one anchored learner sentence",
  "status": "RUNNING",
  "request_id": "req_...",
  "consent_snapshot_hash": "sha256:...",
  "policy_version": "2026-07-11.1",
  "context_pack_id": "cp_...",
  "deadline_at": "2026-07-11T12:00:12.000Z",
  "created_at": "2026-07-11T12:00:00.000Z"
}
```

Raw `user_id`, prompt, sentence and model response are not stored in operational run/audit rows. The database row remains user-scoped for export/delete; telemetry exports use keyed pseudonyms.

### 4.3 Tool invocation

```json
{
  "$id": "mentor.tool.call.v1",
  "type": "object",
  "required": ["command_id", "run_id", "tool", "tool_version", "args", "capability_token"],
  "additionalProperties": false,
  "properties": {
    "command_id": {"type": "string", "pattern": "^cmd_[A-Za-z0-9_-]{16,80}$"},
    "run_id": {"type": "string", "pattern": "^ar_"},
    "tool": {"type": "string"},
    "tool_version": {"type": "integer", "minimum": 1},
    "args": {"type": "object"},
    "capability_token": {"type": "string", "minLength": 32, "maxLength": 4096},
    "expected_scope_version": {"type": ["integer", "null"], "minimum": 0}
  }
}
```

Each tool has separate strict input and output schemas with `additionalProperties:false`, byte/row bounds and annotations: `side_effect`, `data_classes`, `approval`, `idempotency`, `timeout_ms`, `retry_policy`. Example registry entry:

```json
{
  "name": "create_explanation",
  "version": 2,
  "side_effect": "APPEND",
  "data_classes": ["A", "C_DERIVED"],
  "approval": "CONSENT_AT_CALL",
  "idempotency": "COMMAND_ID_REQUIRED",
  "timeout_ms": 1500,
  "retry_policy": "SAFE_SAME_COMMAND",
  "max_input_bytes": 20000,
  "output_schema": "mentor.create_explanation.result.v2"
}
```

Stable typed errors are `AUTH_REQUIRED`, `SCOPE_DENIED`, `CONSENT_REVOKED`, `CAPABILITY_EXPIRED`, `SCHEMA_INVALID`, `TOOL_DISABLED`, `BUDGET_EXHAUSTED`, `CONFLICT`, `DEADLINE_EXCEEDED`, `PROVIDER_UNAVAILABLE`, `OUTPUT_INVALID`, `DEPENDENCY_FAILED`, and `INTERNAL`. User-facing messages never include provider bodies, prompts, SQL or secrets.

## 5. Capability token and permission model

A capability is a short-lived server-minted, HMAC-signed envelope. It is never minted by a model and carries no ambient credential:

```json
{
  "v": 1,
  "jti": "cap_01K0...",
  "run_id": "ar_01K0...",
  "principal_hash": "hmac:...",
  "purpose": "explain_sentence",
  "tools": ["get_sentence_context_if_available@1", "create_explanation@2"],
  "write_scopes": ["agent_explanations:append"],
  "data_classes": ["A", "C", "D_TRANSIENT"],
  "consent_snapshot_hash": "sha256:...",
  "auth_context_version": 7,
  "max_calls": 3,
  "iat": 1783771200,
  "exp": 1783771212,
  "nonce": "..."
}
```

Verification checks signature/key id, expiry, run/principal/purpose match, tool/version, call count, current `auth_context_version`, live consent and feature flag. Delegation intersects scopes (`child = parent ∩ workflow ∩ current policy`); it can never add a tool, data class, lifetime, budget or write scope. Tokens are redacted from logs. For sync calls, replay is prevented by `(jti, command_id)` uniqueness. Background jobs store only an encrypted or re-mintable authorization reference, never a long-lived bearer token.

Approval levels are `AUTO_READ`, `CONSENT_AT_CALL`, `USER_CONFIRM_WRITE`, `HUMAN_REVIEW`, `PROHIBITED`. Canonical review append requires a bound challenge, deterministic-first grader provenance, feature flag and idempotency key; semantic publishing and account/consent changes are never model-authorized.

## 6. Run and step state machines

```text
RECEIVED -> VALIDATING -> AUTHORIZED -> CONTEXT_READY
  -> MODEL_PENDING -> MODEL_READY -> TOOL_PENDING -> COMMITTING -> SUCCEEDED

terminal from any nonterminal:
REJECTED | DEGRADED | CANCELLED | TIMED_OUT | FAILED
```

Allowed deviations: deterministic workflows go `CONTEXT_READY -> TOOL_PENDING`; advisory failure goes to `DEGRADED` with an explicit deterministic result. There is no transition out of a terminal state. A compare-and-set on `state_version` prevents two workers/controllers from advancing the same run.

Tool steps use `PENDING -> RUNNING -> SUCCEEDED|FAILED|TIMED_OUT|CANCELLED`. A retry creates a new attempt under the same `step_id` and `command_id`; it does not create a second logical command. Cancellation is cooperative before model/tool calls. Once an atomic append commits, cancellation may suppress downstream presentation but cannot erase truth; correction uses the domain annul path.

## 7. Context packs and prompt isolation

Context packs are ephemeral, cited, minimized documents. Example:

```json
{
  "schema": "mentor.context-pack.v1",
  "context_pack_id": "cp_...",
  "run_id": "ar_...",
  "purpose": "explain_sentence",
  "created_at": "...",
  "expires_at": "...+15m",
  "consent_snapshot_hash": "sha256:...",
  "items": [
    {
      "id": "ctx_1",
      "kind": "user_sentence",
      "value": "<one sentence>",
      "source": {"repo": "agentSentenceRepo", "text_key_hash": "sha256:...", "order_index": 42},
      "trust": "untrusted_user_content",
      "data_class": "C",
      "instructional": false
    },
    {
      "id": "ctx_2",
      "kind": "linguistic_evidence",
      "value": {"item_key": "...", "analysis_id": "..."},
      "source": {"resolver": "notes-autogen", "version": "..."},
      "trust": "derived",
      "data_class": "A",
      "instructional": false
    }
  ]
}
```

The provider receives a system template from the code registry and a separately serialized data block. Content is normalized, size-limited and stripped of control delimiters; this reduces but does not claim to solve prompt injection. Provider/model output is `probabilistic_untrusted` until schema and semantic validation. Packs are kept in memory for sync flows; if durable debugging is explicitly enabled, content is encrypted with ≤24-hour TTL and never written to stdout/audit. Default operational persistence stores only pack hash, item kinds, sizes, source/version and expiry.

## 8. Provider routing, validation and budgets

Routing order is explicit per workflow:

```text
deterministic implementation
 -> approved cached artifact
 -> approved small route
 -> approved premium route only if policy permits
 -> honest abstention/degradation
```

No automatic cross-provider fallback occurs merely because a provider failed. A fallback route must independently satisfy data class, region, retention/service tier, consent, budget and output-quality policy and must be listed in the workflow version. Route records include provider, model snapshot, adapter version, privacy policy version, region/tier, prompt hash, route reason and price snapshot.

Before egress: reserve request/cost/tokens atomically; re-check consent and deadline. After response: validate maximum bytes, UTF-8, JSON schema, enumerations, citations to available context IDs, forbidden claims/tool calls and scenario-specific quality rules. Invalid output may be retried once only with the same approved provider when deadline/budget permits; otherwise degrade. Finalize ledger with attempts, input/output units, latency and estimated/actual cost. A sweeper marks stale `reserved` entries `abandoned` after the maximum run duration; abandoned reservations remain observable and are reconciled, not silently deleted.

Circuit breaker key is `(provider, route, error_class)`: open after a configured rolling threshold, half-open with one probe, and never cause unapproved fallback. Existing `AGENT_LLM_DISABLED=1` remains the global immediate kill switch.

## 9. Timeout, retry, idempotency and transaction policy

| Operation | Deadline | Retries | Idempotency |
|---|---:|---:|---|
| bounded local read | 500–1500 ms | one transient retry | no side effect |
| provider call | workflow ≤8 s | one 429/503/network retry with jitter | one budget reservation; response may differ |
| append command | ≤1500 ms | same `command_id` only | required unique key |
| notification | ≤5 s | durable exponential, max 5 | provider message key |
| purge job | ≤30 s/chunk | durable until terminal/manual | `(user,purpose,consent_version)` |

Never retry validation, authorization, consent, 4xx credential/schema errors or non-idempotent operations without a command key. Backoff is bounded exponential with full jitter and must fit the run/job deadline.

`agent_commands(command_id, user_id, tool, input_hash, status, result_ref, created_at)` is inserted before an append. In one `withTxnLock` transaction the repository checks/claims the command, performs the domain append and marks command committed. Same ID + same hash returns the recorded result; same ID + different hash is `IDEMPOTENCY_CONFLICT`. Projection updates happen asynchronously/replayably from truth, not in a dual-write transaction.

## 10. Proposed database changes

All tables carrying learner/run data include `user_id`, so the existing dynamic export/delete sweep covers them. Migration order and actual next migration number must be determined from `db/migrate.js` at implementation time.

```sql
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, trace_id TEXT NOT NULL,
  parent_run_id TEXT, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL,
  request_id TEXT NOT NULL, purpose TEXT NOT NULL, status TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 0,
  policy_version TEXT NOT NULL, consent_snapshot_hash TEXT,
  context_pack_hash TEXT, deadline_at TEXT NOT NULL,
  degraded_reason TEXT, error_code TEXT, created_at TEXT NOT NULL,
  started_at TEXT, finished_at TEXT,
  UNIQUE(user_id, workflow_id, request_id)
);

CREATE TABLE agent_run_steps (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0, command_id TEXT,
  input_hash TEXT, output_hash TEXT, error_code TEXT,
  started_at TEXT, finished_at TEXT,
  UNIQUE(run_id, ordinal), UNIQUE(command_id)
);

CREATE TABLE agent_commands (
  command_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL, tool_version INTEGER NOT NULL,
  input_hash TEXT NOT NULL, status TEXT NOT NULL,
  result_ref TEXT, error_code TEXT, created_at TEXT NOT NULL, committed_at TEXT
);

CREATE TABLE agent_model_calls (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL,
  step_id TEXT NOT NULL, reservation_id TEXT,
  provider TEXT NOT NULL, model TEXT NOT NULL, route_policy_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL, context_pack_hash TEXT,
  status TEXT NOT NULL, attempt_count INTEGER NOT NULL,
  input_units INTEGER, output_units INTEGER, latency_ms INTEGER,
  estimated_cost_usd_micros INTEGER, error_class TEXT,
  created_at TEXT NOT NULL, finished_at TEXT
);

CREATE TABLE agent_jobs (
  id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, dedup_key TEXT NOT NULL,
  payload_ref TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT,
  last_error_code TEXT, created_at TEXT NOT NULL, finished_at TEXT,
  UNIQUE(kind, dedup_key)
);
```

Add indexes on `(user_id, created_at)`, `(status, available_at)` and `(run_id, ordinal)`. Foreign keys are desirable only after verifying current SQLite FK policy and delete behavior; user erasure must not be blocked. `agent_audit` may be a new structured table or a versioned extension of existing `audit_log`; it stores action/code/hash/count, never prompt/context content. Do not store capability tokens, API keys, raw provider bodies or chain-of-thought.

## 11. Audit, privacy purge and restore behavior

Audit events: `RUN_ACCEPTED`, `POLICY_DENIED`, `CONTEXT_BUILT`, `MODEL_RESERVED`, `MODEL_FINALIZED`, `TOOL_AUTHORIZED`, `COMMAND_COMMITTED`, `RUN_DEGRADED`, `RUN_TERMINAL`, `CONSENT_REVOKED`, `PURGE_ENQUEUED`, `PURGE_COMPLETED`, `PURGE_FAILED`, `KILL_SWITCH_CHANGED`. Each includes timestamp, run/trace, workflow/version, pseudonymous actor, decision code, tool/route versions and hashes/counts; no content.

Consent revocation is two-phase and visible:

```text
revoke consent + bump auth_context_version
  -> access fails immediately
  -> idempotent purge job(user, purpose, revoked consent version)
  -> chunked purge/tombstone derived C content
  -> verify zero live content references
  -> PURGE_COMPLETED
```

Existing `purgeExplanationContent` tombstone semantics are retained. Ephemeral context blobs/provider payloads are destroyed; hashes and non-content accounting may remain under documented retention. Account deletion relies on the existing dynamic `user_id` sweep in one locked transaction and the deletion journal. Restore tests must replay deletion journal so deleted users/runs are not resurrected. Job/audit tables with user data must be included automatically or explicitly documented as the narrow erasure-record exemption.

## 12. Failure and sequence diagrams

### Successful bounded explanation

```text
PWA -> runtime: explain(intent, request_id)
runtime -> policy: authorize principal/purpose
policy -> consent repo: live snapshot
runtime -> context builder: one anchored sentence
context builder -> tool gateway: bounded read capability
runtime -> usage ledger: atomic reserve
runtime -> model gateway: approved route + data block
model gateway -> runtime: schema-valid candidate + provenance
runtime -> policy: re-authorize write at action time
runtime -> tool gateway: create_explanation(command_id)
tool gateway -> agentRepo: idempotent append
runtime -> audit: terminal metadata
runtime -> PWA: explanation or explicit degraded result
```

### Revocation during provider call

```text
provider call in flight
user revokes agent_read_texts -> auth_context_version++ -> purge queued
provider returns
runtime re-checks consent -> CONSENT_REVOKED
candidate is discarded; create_explanation is not called
run -> REJECTED/DEGRADED; reservation finalized; purge continues
```

### Crash after domain append

```text
transaction: claim command -> append explanation/review event -> mark COMMITTED
process crashes before HTTP response
client retries same request_id/command_id
repository sees same input_hash + COMMITTED -> returns result_ref
no duplicate append
```

### Specialist handoff (future gated M-B)

```text
controller -> policy: request child scope
policy: parent ∩ specialist manifest ∩ live consent
controller -> specialist: signed envelope + minimized cited inputs
specialist -> controller: typed candidate only
controller: validates; re-authorizes; decides whether to invoke a tool
```

The specialist never inherits chat history, API keys or direct tools. Conflicting specialist candidates are not voting truth: the controller applies a deterministic rule, abstains, or requests human review.

## 13. Migration path

1. **Inventory/golden baseline.** Freeze current `/plan`, `/explain`, `/review` contracts; add tenant, consent, kill-switch, no-prompt-log and duplicate-request regression tests.
2. **Observe-only envelope.** Add `agent_runs`/steps and workflow registry for current sync flows. Record hashes/statuses while existing logic remains authoritative. Gate: no behavior/output regression and bounded table growth.
3. **Strict schemas.** Add per-workflow intent/output and per-tool input/output validation. Initially report shadow mismatches; then fail closed after fixtures are clean. Preserve current `USER_ID_IN_ARGS` hard reject.
4. **Capability enforcement.** Mint internal short-lived capabilities and require them in the gateway. Shadow-decision parity precedes enforcement. Direct internal callers are migrated; no compatibility bypass remains.
5. **Idempotent commands.** Add `agent_commands`; migrate `create_explanation` and task writes, then canonical review append. Prove crash/retry gives one row and annul remains available.
6. **Policy-aware model gateway.** Wrap current Gemini/OpenRouter/mock adapters; add route registry, deadlines, schemas, circuit breaker and reconciled ledger. No new provider is enabled without privacy/region/retention approval.
7. **Durable jobs only where needed.** Introduce DB-backed jobs for purge and backstage evaluation/content candidates. Do not move interactive correctness to the queue.
8. **One specialist experiment.** Only after §16 promotion gate, implement a typed advisory specialist behind a flag; no write authority. Remove it if it fails quality/cost/latency gates.

Every stage has a feature flag, old-path parity period, rollback that leaves canonical logs intact, and a migration integrity check. Avoid a big-bang runtime rewrite.

## 14. Acceptance tests

### Identity and authorization

- User A cannot read/run/list/cancel User B's run, even with guessed run/command IDs.
- `user_id`/`userId` anywhere in tool args returns `USER_ID_IN_ARGS` before handler execution.
- PWA and Telegram Mini App audiences remain separated; revoked session/auth-context fails.
- Expired, altered, replayed or over-call capability fails; child scope never exceeds parent.

### Consent and privacy

- Class C context needs all declared live consents; missing repository/error is fail-closed.
- Revoke during model flight discards response and prevents write.
- Prompt/context/provider bodies never appear in stdout, audit or exception strings.
- Purge removes/tombstones derived sentence content, verifies no live references and is idempotent.
- Export includes every new user-scoped table but excludes secrets/tokens; delete then restore+journal replay leaves zero user rows.

### Reliability and correctness

- Same `(request_id, command_id, input_hash)` under concurrent retry creates exactly one domain row.
- Same command ID with different hash returns `IDEMPOTENCY_CONFLICT`.
- Two concurrent explicit transactions do not produce nested `BEGIN`; all use `withTxnLock`.
- Crash at each boundary (before claim, after claim, after append, after commit) converges to one terminal result.
- Timeout/cancel never converts missing learner response into review/skip; canonical correction uses annul.
- Projection replay from append-only log equals stored projection after agent review.

### Provider/cost

- Reserve occurs before egress; simultaneous last-credit requests cannot oversubscribe.
- 429/503/network retry uses one logical reservation and bounded attempts; 400/401/schema failures do not retry.
- Stale reservations reconcile visibly; kill switch prevents all provider egress while deterministic plan/due remains useful.
- An unapproved provider/region/retention tier cannot be selected as fallback.
- Invalid JSON, unknown citation, oversized or unsafe output is rejected and not persisted as fact.

### Operations and performance

- Sync `/plan` and deterministic degradation meet agreed p95 under container limit (1.5 CPU/1536 MB).
- 5× proposed pilot peak proves bounded DB/queue latency, disk growth and circuit-breaker behavior.
- A leased worker crash makes the job reclaimable; DLQ entry contains codes/hashes, not content.
- Feature rollback disables the new controller without deleting or rewriting canonical learner events.

## 15. Observability and SLO proposal

Metrics: runs by workflow/status/degraded reason; policy denials; consent revocations; tool latency/errors; provider calls/tokens/cost/route/error; schema rejection; idempotency replay/conflict; reservation age; queue depth/oldest age; purge age/completion; DB size and lock wait. Labels must be low-cardinality and content-free.

Pilot targets are proposals requiring owner sign-off: ≥99.5% control-plane availability excluding provider; zero cross-tenant/unauthorized writes; 100% model calls with reservation and route provenance; 100% canonical agent grades with grader provenance; p95 deterministic plan <1 s, bounded explanation <12 s; purge access block immediate and cleanup p95 <24 h; zero prompt/context in operational logs.

## 16. Gate for moving from single controller to thin M-B

A specialist is allowed only for a named workflow after all are true:

- locked independent gold shows a practically meaningful improvement over deterministic/single-controller baseline;
- gain survives latency, cost, missingness and Hebrew error analysis;
- typed input/output and abstention boundary are stable;
- scope is advisory and non-expanding; controller re-authorizes every tool/write;
- injection, tenant isolation, retry/idempotency and purge tests pass;
- trace identifies which component changed the decision;
- deterministic/one-controller fallback remains useful;
- owner approves the additional operational burden.

The default remains **do not build a general multi-agent platform**. MCP is only a future adapter over the closed internal tool contract; A2A is reserved for a genuinely external opaque boundary, not internal role-play.

## 17. Open decisions before implementation

1. Exact public data policy and approved provider route matrix by data class, region, service tier and retention.
2. Whether sync context packs remain memory-only (recommended) or encrypted debug capture is enabled for a tightly controlled evaluation cohort.
3. Pilot SLOs, purge deadline and alert receiver.
4. Whether structured audit extends `audit_log` or uses a dedicated table; either choice must preserve export/delete and content-free constraints.
5. Price snapshot ownership and hard micro-dollar ceilings per workflow.
6. First candidate specialist, if any; recommendation is none until CCT and Hebrew benchmark evidence exists.

## 18. Definition of done

The control plane design becomes implementation-ready only when registry/schemas are code-reviewed, open decisions are resolved, migrations pass backup/restore/integrity, all §14 gates run in CI, current behavior has shadow parity, live policy/provider contracts are approved, operational dashboards/alerts exist, kill-switch and deletion drills are witnessed, and owner explicitly enables each write/provider route. Passing unit tests alone is not authorization for pilot autonomy.
