# 06 — Target agent platform

**Status:** PROPOSAL · **Date:** 2026-07-11

## Architecture

```text
Room / Studio / Mentor Home / Telegram / Mini App
             │ authenticated principal + explicit intent
             ▼
 deterministic workflow controller
             │
             ├─ policy engine: consent, data class, scopes, approvals, budgets
             ├─ context platform: minimized cited trust-labelled pack
             ├─ model gateway: route, schema, timeout, cost, version, abstain
             └─ typed tool gateway: bounded reads and idempotent commands
                         │
          artifacts ─ linguistic evidence ─ canonical event log
                         │
             replayable projections / independent grader

isolated backstage: content candidates | eval/research | governance/ops
```

## Control-plane contracts

- Registry: `agent/workflow_id`, versioned role/prompt, owner, purpose, allowed data classes/tools, max turns/time/tokens/cost, feature flag and kill switch.
- Tool schema: strict JSON input/output, `additionalProperties:false`, side-effect/data-class/idempotency/approval annotations, typed errors, row/byte/time bounds.
- Identity: principal-derived user/tenant; worker/agent identity distinct; delegation cannot expand scope.
- Execution: `run_id`, `trace_id`, `command_id`, deadlines, cancellation; retries only by classified idempotent activity; durable queue/DLQ only for background work.
- Writes: append-only command/candidate/event through a single repository; expected scope, audit, idempotency and annul/rollback required. No direct projection/DB access.

## Context platform

Every context pack is versioned, minimized, consent-aware, TTL-bound and source-cited. Fields carry trust (`asserted`, `curated`, `derived`, `probabilistic`, `untrusted user/provider content`). Redaction and dedup happen before egress. Personal text is data, never instructions. Context from another agent is re-authorized and treated as untrusted.

## Model gateway

Route by task and policy, not leaderboard: deterministic/local → cached approved artifact → small model → premium model when expected value justifies it → abstain. Validate structured output locally. Record provider/model/prompt/workflow/tool versions, tokens, latency, retries, route reason, privacy tier and estimated cost. Add circuit breakers, batch/cache support and provider policy registry; never silently fall through to a less-approved processor.

## Handoff envelope

`issuer, principal, tenant, purpose, task_id, data_classes, consent_snapshot, allowed_tools, write_scope, expires_at, nonce/idempotency_key, input_hash, schema_version, model/prompt version, parent_decision_id`.

Receiver re-authorizes; no ambient credentials, whole-chat inheritance or shared agent memory. MCP may expose tools after the internal contract is mature; A2A is reserved for external opaque agent boundaries.

## Educational invariants

Learner Graph is continuity center; `review_log` owns review truth; agent task/memory differs from SRS/learner state; LLM explanation differs from linguistic fact; planner proposes; grader is independent; missing response is missing data; consent is checked at action time; local/LLM-less core remains useful.
