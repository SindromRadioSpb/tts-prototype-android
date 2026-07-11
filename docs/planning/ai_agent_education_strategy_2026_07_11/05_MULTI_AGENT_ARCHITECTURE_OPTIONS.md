# 05 — Multi-agent architecture options

**Status:** PROPOSAL · **Date:** 2026-07-11

| Criterion | M-A one Mentor | M-B orchestrator + learner specialists | M-C learner + backstage planes | M-D event-driven platform |
|---|---|---|---|---|
| User value | high if one coherent action | potentially higher for narrow quality isolation | indirect + scalable curation/eval | indirect until workflows are long-lived |
| Coordination | low | medium/high | high | highest |
| Failure isolation | medium | high with typed boundaries | high across trust domains | high only with mature durability |
| Cost/latency | lowest agentic option | added calls/handoffs | mostly batch-controllable | queue/ops overhead |
| Observability/debug | simplest | needs run/step context | separate plane traces | requires replay/versioning/DLQ |
| Privacy/permissions | context pressure risk | handoff/context leakage risk | clearer isolation | event fan-out/standing authority risk |
| Vendor lock-in | low in custom controller | medium if SDK semantics leak | controllable by artifact contracts | workflow/protocol lock-in |
| Deterministic fallback | straightforward | must remain final kernel | per-plane | required per event/workflow |
| Team burden | low | medium | high | very high |
| Current readiness | strong | partial | partial backstage only | weak |
| 20/100/1,000 active users | adequate / adequate / needs gateway | unnecessary / selective / plausible | too early / selective / useful at scale | excessive / excessive / conditionally justified |

## Option judgments

- **M-A:** current reality is already a deterministic workflow controller with optional LLM, not an autonomous tutor. Keep it as transitional architecture. Prevent permission/context sprawl using scenario-specific packs and dynamic tool allowlists.
- **M-B:** add a specialist only if a controlled comparison shows ≥5 percentage-point independent quality gain without critical-harm increase and with acceptable cost/latency. Initial candidates: grounded explanation and next-text/modality ranking. Specialists return typed candidate artifacts; Mentor owns the learner-facing answer.
- **M-C:** appropriate later for content/evaluation/governance because independent trust domains matter. Backstage agents do not receive full learner context and cannot write learner state.
- **M-D:** condition-based future. Trigger only when at least three long-running workflows require pause/resume across deploys/provider callbacks or multiple teams/providers make durable orchestration cheaper than custom jobs.

## Recommendation

**PROPOSAL:** transitional `deterministic kernel + one Mentor + bounded model functions`; target `M-B thin learner plane + M-C isolated backstage planes`. M-D is not the target for the next 12 months.

Target is not many autonomous personas. It is a policy-controlled workflow platform in which model-driven specialists are replaceable typed steps, learner truth is canonical/replayable, and evaluation is independent.

## Promotion tests

Compare manager vs handoff vs plain typed function with identical model/tools/context budget; fuzz tool schemas and idempotency; inject cross-tenant canaries into prior context; crash/resume before and after each side effect; run premium-always vs router on locked gold; kill all models/protocols and verify due/manual/review/annul remain identical.
