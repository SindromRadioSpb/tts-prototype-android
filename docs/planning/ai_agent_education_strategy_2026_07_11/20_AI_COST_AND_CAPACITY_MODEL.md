# 20 — AI cost and capacity model

**Status:** BOTTOM-UP MEASUREMENT DESIGN; CURRENT DATA INCOMPLETE
**Repository baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`
**Date:** 2026-07-11

## Confirmed current instrumentation

**FACT:** `llm_usage_ledger` records user, UTC day, scenario, provider, reservation/final state and `actual_units`; live code currently uses it primarily for call quotas and output units. **FACT:** legacy `usage.json` records aggregate TTS characters/cost and Gemini request counters. **FACT:** audio is content-addressed and cache hits avoid synthesis. **UNKNOWN:** input/cache tokens, full dollar cost, latency, retry counts, action/experiment/CCT linkage, new-vs-cached TTS characters, reviewer minutes, support time and fully loaded infrastructure allocation are not available as one reliable ledger.

Consequently, earlier dollar bands remain planning hypotheses. This model defines how to replace them with observed unit economics.

## Cost event schema

Each billable or human activity produces a metadata-only record:

```json
{
  "cost_event_id": "uuid",
  "occurred_at": "RFC3339",
  "principal_id": "server-derived",
  "feature": "agent_explain",
  "scenario": "explain",
  "action_id": "opaque",
  "experiment_assignment_id": null,
  "transfer_opportunity_id": null,
  "provider": "gemini",
  "model_snapshot": "exact-id",
  "region": "approved-region",
  "price_card_version": "2026-07-11",
  "units": {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0, "audio_seconds": 0, "tts_chars_new": 0, "tts_chars_cached": 0},
  "latency_ms": 0,
  "retry_count": 0,
  "status": "success|abstain|error|cancelled",
  "estimated_cost_usd": 0,
  "privacy_class": "A",
  "trace_id": "opaque"
}
```

No prompts, answers, sentences, Telegram identifiers or secrets belong in this ledger. Price cards are versioned reference data; historical events are never repriced silently.

Human events record task type, artifact/case hash, role, minutes, outcome and hourly cost assumption. Support and incident hours remain separate from content-review minutes.

## Required metrics

Per feature and profile: eligible users/actions; calls/action; tokens/call; premium escalation; cache hit; retries/errors/abstention; p50/p95 latency; TTS new/cached characters; storage/egress; reviewer minutes/approved unit; support/incident minutes; completed recommended action; eligible/attempted/confirmed CCT.

Primary equations:

```text
inference cost = Σ(unit × effective price-card rate)
technical variable cost/user = LLM + ASR + TTS + embeddings + storage + bandwidth + queue/observability allocation
fully loaded feature cost = technical + human review + support + attributed operations
cost/CCT = fully loaded eligible-cohort cost / independently confirmed transfers
cost/approved content unit = generation + validation + critic + review + publishing allocation
```

Missing transfer outcomes remain in cohort cost. Do not divide only by responders or attribute zero cost to failed/abandoned opportunities.

## Baseline extraction

The first report should query counts by day/scenario/provider/status from `llm_usage_ledger`, export `/api/usage` aggregates, scan audio-cache size/file count and derive new/cache synthesis only where logs support it. Never infer cache hit rate from file count alone.

Illustrative SQL against the current ledger:

```sql
SELECT day_utc, scenario, provider, status,
       COUNT(*) AS calls,
       SUM(COALESCE(actual_units,0)) AS output_units
FROM llm_usage_ledger
GROUP BY day_utc, scenario, provider, status
ORDER BY day_utc, scenario, provider;
```

This does not produce full cost because input tokens/model snapshots/price cards are missing. The report must show coverage percentage for every required field.

## Capacity model

Capacity is a bottleneck model, not monthly token arithmetic:

| Layer | Demand unit | Capacity evidence needed | Failure mode |
|---|---|---|---|
| Node/API | concurrent bounded actions, requests/sec | CPU/RAM/event-loop/p95 under 1×/5× peak | timeout/cascade |
| SQLite/current locks | write transactions/sec and duration | contention, busy errors, duplicate/idempotency | lost/blocked writes |
| provider | RPM/TPM/concurrency | approved tier limits and 429 recovery | degraded experience/cost burst |
| queue/background | jobs, age, retries | durable replay/DLQ/backpressure | duplicate/stale work |
| TTS cache/disk | new chars/files/GB/day | hit rate, eviction, disk 80/90% drill | host outage |
| human review | minutes/artifact and arrival rate | reviewer capacity/SLA/disagreement | backlog or unsafe shortcuts |
| support/ops | incidents/tickets per 100 MAU | response hours and runbook load | hidden negative margin |

Before 100 MAU run 5× expected-peak load with provider latency/failure injection. Before 1,000 MAU remove correctness dependence on process-local locks/limiters, separate background workers, prove durable idempotency/backpressure and establish managed backup/recovery.

## Measurement cohorts

Define low/medium/active from observed quantiles after four weeks; do not permanently use the illustrative 8/40/120-call profiles. Report owner, 20, 100 and 1,000 MAU with a workload mix, not three impossible all-low/all-active worlds only. Separate fixed platform cash, variable technical cost and labor.

## Sensitivity grid

At minimum vary transfer rate, active-user share, output verbosity, premium escalation, TTS new-character ratio/cache hit, provider rates, retry rate, reviewer minutes and hourly rate, support tickets and peak concurrency. Present tornado/break-even tables. Biggest risks receive measurement priority; current hypothesis is that transfer rate, review time and new TTS volume dominate bounded LLM tokens.

## Pricing and investment gates

- No subscription/pricing decision from illustrative bands.
- No provider purchase until `17` supplies route quality/privacy and observed units.
- No content automation ROI claim until reviewer time falls ≥30% with noninferior error.
- No feature promotion if p90 active-user variable cost exceeds the owner-set share of plausible ARPU or fully loaded cost/CCT exceeds the owner cap for two cohorts.
- AI kill switch stops new variable spend while deterministic learning remains useful.

## Definition of done

Four-week observed ledger with ≥95% billable-call linkage to feature/action, exact model and price card; TTS new/cache measurement; latency/retry/error distributions; reviewer/support time sample; CCT denominator linkage where applicable; reconciled invoice variance; workload/capacity test; sensitivity and break-even report. Until then status remains `MEASUREMENT DESIGN`, not validated unit economics.
