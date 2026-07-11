# 21 — Executable 90-day evidence and design backlog

**Status:** PROPOSED BACKLOG / IMPLEMENTATION REQUIRES OWNER AND RACI ASSIGNMENT
**Planning baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`
**Date:** 2026-07-11

This backlog refines document `12`. It authorizes no production code by itself. Each epic begins with a design/measurement PR and preserves current P8/P9 operational gates. Effort is an engineering/research range, not a deadline commitment for one person.

## RACI and capacity assumptions

Roles, not named people: `PO` product owner/decision authority; `LS` learning scientist; `BE` backend/platform; `DE` data/evaluation; `HC` Hebrew curator/reviewer; `SP` security/privacy; `OPS` operations; `FE` frontend/accessibility when a learner surface is eventually authorized. Every row's accountable owner is assigned before work starts; until then the role shown below is proposed.

| Epic prefix | Accountable | Responsible/support | Primary stable artifact |
|---|---|---|---|
| NSAI / PH2 | PO | all leads | this packet / decision record |
| CCT | LS | DE, BE, HC, SP | `18_CONFIRMED_CONTEXTUAL_TRANSFER_SPEC.md` + later schema/test PR |
| EVAL / HEB | DE | LS, HC, BE | gold/benchmark manifest under stable research path |
| ACP / CTX / PROV | BE | SP, OPS, PO | `19_AGENT_CONTROL_PLANE_DESIGN.md` + later design PR |
| COST / CAP | OPS | BE, DE, PO | `20_AI_COST_AND_CAPACITY_MODEL.md` + redacted observed report |
| CNT | HC | LS, DE | work cards and curator-approved path manifest |
| SEC / PRIV / POL | SP | BE, OPS, PO | threat/privacy/drill evidence |
| PILOT | PO | LS, DE, HC, SP, OPS | preregistration, consent and rollout manifest |

Effort ranges below sum to roughly 77–124 person-days before contingency. They do not fit one person's 90 calendar days. Proposed parallel capacity is 1.0 BE/platform, 0.5 DE/LS combined, 0.25 HC, 0.2 SP/OPS and 0.2 PO/product operations (about 1.9 role-equivalents during peak slices). With a single owner-engineer, scope must stop after G2/G3 and the external-pilot track moves out; calendar dates never override gates.

Each implementation ticket derived from this backlog must add: accountable named owner, stable artifact path, exact symbol/module and source SHA, test command/expected result, rollout flag/environment, rollback command/path and capacity reservation. Generic anchors in this planning document are routing hints, not final ticket-level anchors.

## Critical path

`owner metric/privacy decisions → CCT/knowledge/missingness contracts → gold/assignment/probe design → control-plane/provider/cost observability → shadow evaluation → lifecycle/ops proof → preregistered pilot → delayed readout`.

## Slice 0 — Days 1–5: decisions and baselines

| ID | Deliverable / anchors | Dependency | Acceptance / DoD | Effort | Risk / rollback |
|---|---|---|---|---:|---|
| NSAI-001 | Record D1/D6/D11/D13/D14/D17 in `14_OWNER_DECISIONS.md` | owner | signed choice for autonomy, manual mode, experiment policy, cost/CCT, privacy and bet | 0.5–1d | unresolved → research only |
| NSAI-002 | Baseline manifest: HEAD, migrations, `agent/`, `db/`, smoke inventory, provider config names without secrets | none | reproducible manifest and conflict rules | 1d | drift → refresh |
| NSAI-003 | Export current `llm_usage_ledger`, `/api/usage`, audio-cache/storage and infrastructure invoice coverage | access approval | redacted baseline with missing-field coverage | 1–2d | no access → mark UNKNOWN |
| NSAI-004 | Freeze external source/provider policy snapshot | legal/privacy input | reviewed route registry; no class-C route silently assumed | 1d | provider ambiguity → deny |

Gate G0: decisions recorded; no secrets/personal text in artifacts; baseline gaps explicit.

## Slice 1 — Days 6–20: truth and evaluation contracts

| ID | Deliverable / code-doc anchors | Dependencies | Acceptance tests | Effort | Rollback/stop |
|---|---|---|---|---:|---|
| CCT-001 | versioned knowledge-unit/source/target/novelty spec; anchors `keyingService`, `lemma-canon`, artifacts | G0 | collision/adversarial table; same/different sense/form decisions deterministic | 3–5d | ambiguity → abstain |
| CCT-002 | transfer opportunity/attempt/outcome/missingness/annul schemas; anchors `review_log`, `learner_events` | CCT-001 | schema validation; no review facts duplicated; replay semantics | 4–6d | no migration until review |
| CCT-003 | eligibility/contamination/probe scheduler state machine and ITT queries | CCT-001/2 | frozen-time examples; duplicate/late/revoked cases | 4–6d | scheduler remains offline |
| EVAL-001 | gold registry, split/leakage/adjudication protocol | CCT-001 | immutable hashes, near-duplicate grouping, double-review workflow | 3–5d | insufficient reviewers → no efficacy claim |
| EVAL-002 | A/A, assignment/exposure/SRM/missingness analysis plan | D11 | simulated/A-A acceptance; preregistered SESOI/stop | 3–4d | failure → instrument only |

Gate G1: independent R2/R11/R17 and data/privacy review; no event/API implementation before schema sign-off.

## Slice 2 — Days 21–35: control-plane and context design

| ID | Deliverable / anchors | Dependencies | Acceptance tests | Effort | Stop rule |
|---|---|---|---|---:|---|
| ACP-001 | workflow/agent/tool registry and strict schemas; `agent/runtime.js`, `agent/tools.js` | G1 | unknown/userId/oversize/enum fuzz; default deny | 4–6d | any scope amplification |
| ACP-002 | policy decision contract for principal, consent, data class, tool, budget, approval | D1/D14 | cross-tenant and revoke-race matrices | 4–6d | policy ambiguity → deny |
| ACP-003 | run/step/command lifecycle, idempotency, retries, cancellation and audit | ACP-001 | crash before/after side-effect model; exactly-once effect | 4–7d | non-idempotent write blocked |
| CTX-001 | versioned trust-labelled context pack and injection boundaries | ACP-002 | canary isolation, indirect-injection and redaction suite | 3–5d | leakage → deterministic fallback |
| PROV-001 | provider route/retention/region/price registry and model gateway decision record | D14, NSAI-004 | class-C unapproved route refuses; snapshot pinned | 3–5d | no silent fallback |

Gate G2: security/privacy architecture review; no generic MCP/A2A or durable engine.

## Slice 3 — Days 36–50: benchmark and cost instrumentation design

| ID | Deliverable | Dependencies | Acceptance | Effort | Stop |
|---|---|---|---|---:|---|
| HEB-001 | G1/G3 explanation + structured-output locked gold v1 | EVAL-001 | independent labels and held-out split | 5–8d reviewer+engineering | inadequate gold → no provider ranking |
| HEB-002 | live provider benchmark runner/report schema, no production integration | HEB-001/PROV-001/API approval | reproducible snapshots, blinded outputs, cost/latency | 4–6d | policy/key unavailable → protocol only |
| COST-001 | cost-event schema and price cards; anchors `llm_usage_ledger`, `usage.json` | PROV-001 | no content leakage; invoice-reconcilable units | 3–5d | privacy leak blocks |
| COST-002 | TTS new/cache/disk and capacity baseline protocol | NSAI-003 | hit/miss measured prospectively, disk drills specified | 2–4d | do not infer from file count |
| OPS-001 | reviewer/support-time sampling form | staffing decision | ≥2 task categories and adjudication time captured | 1–2d | no fully loaded claim without sample |

Gate G3: owner reviews benchmark/cost coverage; no model selection from mocked smoke.

## Slice 4 — Days 51–65: shadow candidates and content path

| ID | Deliverable | Dependencies | Acceptance | Effort | Rollback |
|---|---|---|---|---:|---|
| SHD-001 | offline/shadow grounded-explanation comparison vs deterministic facts | HEB-001/2, CTX | fact/abstention/latency/cost report; zero learner writes | 4–6d | archive route on hard fail |
| SHD-002 | deterministic planner baseline + shadow reranker decision log spec | CCT/G2 | identical eligible pool; replayable candidates | 4–6d | deterministic remains served |
| CNT-001 | three curator-owned starter paths and work-card rubric | human R6–R8 | rights/provenance/manual comprehensibility complete | 5–10d | no auto-level/publish |
| EVAL-003 | transfer probe candidate queue and contamination audit | CCT/EVAL | generator cannot label/grade; locked target | 4–6d | contaminated item removed |

Gate G4: independent quality review; shadow does not establish efficacy.

## Slice 5 — Days 66–78: lifecycle and operational proof

| ID | Deliverable | Dependencies | Acceptance | Effort | Stop |
|---|---|---|---|---:|---|
| SEC-001 | tenant/tool/context property suite design and execution | G2 | zero cross-user access/write/canary | 3–5d | any leak closes pilot |
| PRIV-001 | consent revoke/delete/export/old-backup restore/replay drill | ops access | zero live residual outside documented tombstone/window | 4–7d | any residual closes pilot |
| OPS-002 | secret rotation, provider outage, billing kill, purge failure and rollback drill | runbooks | deterministic core remains usable; alerts fire | 3–5d | failed drill closes pilot |
| CAP-001 | 5× expected-pilot load/failure test plan and run | COST baseline | p95/error/idempotency limits pass | 3–5d | capacity failure → owner-only |
| POL-001 | reconciled public privacy/AI/Telegram notice draft | D14/legal | no local-only/cloud contradiction; situated consent | 2–4d | legal ambiguity closes pilot |

Gate G5: all BLOCKER drills pass with evidence; otherwise external pilot is explicitly `NO-GO`.

## Slice 6 — Days 79–90: pilot decision and preregistration

| ID | Deliverable | Dependencies | Acceptance | Effort | Rollback |
|---|---|---|---|---:|---|
| PILOT-001 | choose exactly one learner experiment (recommended grounded explanation before planner) | G1–G5 | null/arm/eligibility/SESOI/sample/missingness/stop/cost frozen | 2–3d | insufficient N → feasibility only |
| PILOT-002 | 20-adult-user recruitment/consent/support/withdrawal protocol | D12/D14 | inclusion, accessibility, support and delete paths reviewed | 2–4d | recruitment mismatch → pause |
| PILOT-003 | rollout manifest: flags, canary, monitoring, kill switch, rollback, owner | all | tabletop and owner sign-off | 2d | no sign-off → no launch |
| PH2-001 | phase-2 evidence review and updated decisions | all | claim ledger links every promotion/blocker; open gaps explicit | 2–3d | retain S1 deterministic baseline |

Gate G6: explicit owner `GO`; absence of a decision means no external exposure.

## Program definition of done

At day 90 the expected output is not proven educational effect: it is a reviewed CCT/control-plane design, independently governed gold and benchmark baseline, observed cost/capacity instrumentation, curated pilot content, passed lifecycle/ops evidence and a preregistered go/no-go packet. Delayed efficacy readout necessarily occurs after the pilot window and is not compressed to fit the calendar.
