# 12 — Operational plan

**Status:** PROPOSAL · **Date:** 2026-07-11

## 90-day slices

| Weeks | Goal / deliverable | Dependency | Acceptance / stop | Model/agent | Cost |
|---|---|---|---|---|---|
| 1–2 | reconcile baseline; approve CCT, knowledge unit, novelty, missingness and hint taxonomies | owner metric choices | independent reviewer agreement; no schema ambiguity | none | low |
| 3–4 | gold registry v1, transfer probes, A/A/assignment design, cost attribution specification | week 1–2 | locked splits, contamination manifest, SRM/A/A pass | research/eval backstage candidate only | low–M |
| 5–6 | typed tool/policy/context/provider registry design; privacy/provider-age/public-policy fork | governance decision | userId injection/tenant/injection threat tests specified; external pilot stays closed if unresolved | architecture/security agents offline | M |
| 7–8 | shadow grounded-explainer and deterministic-control planner evaluation; three curated starter paths | gold/context/work cards | fact pass/abstention/cost/latency; no learner writes | bounded model + content copilot | M |
| 9–10 | prototype one randomized comparison and delayed probe scheduler in planning/spec environment; operations drills | assignment/consent/cost | delete→restore, secret rotation, provider outage, billing kill, 5× load plan | no autonomous loop | M |
| 11–12 | owner-live shadow then external pilot readiness review | all blockers | go only if privacy/isolation/lifecycle/eval/cost pass; otherwise stop and document | one bounded treatment | M |
| 13 | freeze preregistration, owner decisions and pilot manifest | owner sign-off | immutable protocol, cap and rollback | selected route | low |

## Six-month epics and critical path

`truth contracts → gold/assignment/probes → policy/context/provider controls → shadow quality → ops/lifecycle proof → one external randomized experiment → delayed readout`.

Epics: E1 CCT/evidence model; E2 independent eval; E3 typed control plane; E4 provider/cost gateway; E5 curated work cards/paths; E6 grounded explanation/planner experiment; E7 public privacy/security/ops; E8 product activation and W1/W4 baseline.

## Capability dependency graph

```text
knowledge-unit + source anchors ─┬─ transfer rubric ─ probe scheduler ─ CCT/experiments
                                └─ work cards ─ curated paths ─ next-text experiment
consent/data classes ─ policy ─ context packs ─ provider registry ─ model routes
typed tools ─ idempotency/audit ─ shadow ─ bounded writes
gold + human queue ─ grader/recommender calibration ─ promotion
cost ledger + CCT ─ cost/outcome gate ─ scale decision
all above + long-workload evidence ─ durable execution / specialist agents
```

## Build / buy / partner

| Layer | Choice |
|---|---|
| learner graph, truth, CCT, policies, Hebrew resolver, work cards | build internally — core moat/governance |
| frontier LLM/ASR/TTS | provider, replaceable through gateway |
| workflow durability/observability | open source/managed buy after trigger, not custom generic platform now |
| scientific/human Hebrew gold and curation | internal ownership plus contracted/partner reviewers |
| general model safety/privacy legal review | specialist partner where needed |
| MCP/A2A | postpone until external interoperability exists |

## Team operating model

Owner/20 pilot role-equivalents: product owner; 0.2 backend/SRE; 0.1 data/eval; 0.1 Hebrew learning/content reviewer; periodic privacy/security review. At 100: 0.5 platform, 0.25 data/eval, 0.25 content/learning, 0.1 security/privacy, 0.25 product/support. At 1,000: roughly 1 platform/SRE, 0.5 data/eval, 0.5–1 content/review, 0.2 security/privacy, 0.5 support/ops plus product/frontend capacity.

Weekly: CCT funnel/missingness, false grade/annul, reading/hint guardrails, provider cost/latency, queue/cache/disk, consent/deletion failures. Monthly: model/prompt/gold drift, pricing, restore/delete sample, cohort economics and capability kill review.
