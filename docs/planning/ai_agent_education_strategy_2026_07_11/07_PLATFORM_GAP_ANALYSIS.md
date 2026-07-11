# 07 — Platform gap analysis

**Status:** PROPOSAL · **Date:** 2026-07-11

## Platform gap matrix

| Capability | Current status / reuse | Missing | Mature MVP | Scale-ready | Owner decision / dependency / gate / phase |
|---|---|---|---|---|---|
| Agent/workflow registry | partial scenario modules/flags | versions, identity, scopes, owners | static versioned registry | admin policy store | autonomy; tool schemas; contract test; NOW |
| Typed tool registry | closed router, 11 tools | JSON schemas, effects, errors, bounds | strict schemas + dynamic allowlist | signed capability tokens | scope policy; fuzz; NOW |
| Policy/approval engine | scattered consent/flags | central data-class/action decision | pure policy function + audit | policy-as-code/version rollout | privacy tier; deny suite; NOW |
| Execution identity/trace | partial audit/tasks | run/trace/command correlation | metadata spans | OTel-safe tracing | payload policy; sentinel leak test; NOW |
| Idempotent commands | strong review path | universal command keys/rollback | write command envelope | transactional outbox | write autonomy; crash/replay; NOW |
| Durable execution | absent; agent_tasks not workflow state | queue/checkpoint/DLQ/versioning | DB job table for one long workflow | Temporal-like engine | only when trigger met; replay; LATER |
| Context packs | scenario-specific partial | version/trust/TTL/redaction/injection | typed minimized pack | cache/dedup/policy retrieval | Class C policy; canary isolation; NOW |
| Model gateway | Gemini/OpenRouter/mock + daily quota | task routing, policy registry, cost/latency, breaker | approved route table + schema validation | adaptive routing/batch/cache | provider strategy; locked-gold noninferiority; NEXT |
| Knowledge-unit identity | lemma keys/construct registry partial | versioned sense/construct/modality unit | v1 identity contract | prerequisite/ontology governance | curriculum scope; collision audit; NOW |
| Hint/scaffold ledger | UI settings/events partial | availability/show/request/level | closed event taxonomy | calibrated policy | manual control; completeness; NOW |
| Transfer event/probes | absent | novelty, delay, eligibility, contamination | v1 rubric + scheduler | multi-window calibrated registry | NSM/cost cap; human gold; NOW |
| Misconception confidence | rudimentary constructs | repeated-pattern threshold/decay | shadow candidates | calibrated ontology | labeling policy; FP ceiling; NEXT |
| Experiment platform | research scripts partial | assignment/exposure/ITT/SRM | one-user-level RCT path | sequential/CUPED registry | experimentation policy; A/A; NOW |
| Gold registry/human queue | several fixtures | immutable metadata/splits/adjudication | v1 registry + double review | drift/active sampling | reviewer budget; leakage audit; NOW |
| Policy replay/shadow | FSRS replay strong | candidate/action snapshot | shadow decision log | counterfactual policy replay | telemetry consent; deterministic reproduction; NEXT |
| Security/privacy jobs | revoke/purge partial | durable cleanup status/retry | outbox + SLA/alerts | cross-processor deletion orchestration | external pilot; restore drill; NOW |
| Provider/data registry | absent/partial env config | tier/region/retention/ZDR/subprocessors | fail-closed approved route metadata | procurement automation | age/privacy decision; runtime refusal; NOW |
| Cost dashboard | quota ledger partial | input/output/audio/storage/human outcome cost | per-run/per-CCT ledger | anomaly/forecasting | acceptable cost/CCT; reconciliation; NEXT |
| Content approval manifest | manual staged pipeline | immutable semantic approvals | signed/hash allowlist | canary/rollback automation | publishing autonomy; release drill; NOW/NEXT |

## Build order

1. Transfer/knowledge/hint/missingness contracts and experiment/gold foundations.
2. Typed tools, policy, run identity, idempotency, privacy-safe audit/context.
3. Provider registry and model gateway with deterministic fallback.
4. Shadow planner/explainer/scaffold/next-text experiments.
5. Isolated content/evaluation agents and approved release manifest.
6. Durable workflow/protocol layers only when measured workload demands them.

**BLOCKER:** adding agent personas before steps 1–3 expands uncertainty and permissions without improving outcome evidence.
