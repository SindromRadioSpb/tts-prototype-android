# 16 — Evidence ledger

**Status:** PARTIAL EVIDENCE INDEX / NOT YET COMPLETE CLAIM-LEVEL TRACEABILITY
**Research date:** 2026-07-11
**North Star source:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6`
**Phase-1 recon:** `a510b1e1ce5378702987f6a244d79b2782199430`
**Phase-1 synthesis:** `d2d3c68fc0bc50f2082091252796b1d34d9c4147`
**Phase-2 baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`

## Limitation and evidence rules

The original eight agent outputs were returned during the research session but were not persisted as immutable repository artifacts with prompts, run IDs, timestamps, model versions, tool logs and hashes. The appendix is therefore an edited reconstruction from the session findings and published synthesis, not a verbatim or independently auditable archive.

A `FACT` needs a direct repository/official/measurement anchor. Absence claims name the inspected scope. Repeating an inference does not upgrade it to fact. Provider/pricing facts expire after 30 days. External sources require access date. A correction appends/supersedes; it does not silently rewrite the decision history.

## Claim ledger

| ID | Claim | Type | Repository / external evidence | Freshness and limiting evidence | Confidence | Decision / validation |
|---|---|---|---|---|---|---|
| E01 | Product is a Node/PWA server application, not native Android | FACT | `CLAUDE.md`; `package.json`; `server.js` @ phase-2 baseline | current HEAD; name remains misleading | high | baseline |
| E02 | `review_log` owns append-only review semantics; FSRS projections are derived/rebuildable | FACT | `RETENTION_PROGRAM_RECON_2026_07_02.md`; `db/learnerLogRepo.js`; `db/learnerProjectionRepo.js`; `public/js/fsrs-core.js` | code/current docs; does not prove transfer | high | D1, D2; replay oracle |
| E03 | Bounded word-task grader is deterministic and LLM is structurally excluded | FACT | `agent/grader.js`; `agent/reviewer.js`; `smoke:grader-gold` | narrow channels/gold only; no free writing/speaking validity | high | D4, D11; expand independent gold |
| E04 | Personal sentence explanation and cloud/channel actions have identity/consent gates | FACT | `agent/explainer.js`; `agent/tools.js`; identity/channel/artifact repos and auth/Telegram smokes | owner-live; public lifecycle/restore evidence separate | high technical | D7, D14; external drills |
| E05 | Planner, explainer, Mentor Home, Telegram and Mini App are technically implemented/owner-live | FACT | `AI_MENTOR_RECON_2026_07_04.md`; live `agent/`, `db/`, smokes | feature existence is not educational efficacy | high technical | baseline |
| E06 | External learning effect, PMF, W1/W4, switching and WTP are not established in the inspected packet/repo | UNKNOWN | phase-1 README constraints; no named prospective external outcome report found in required sources | absence limited to inspected repository and date | medium-high | D12, D13, D15; external cohort |
| E07 | No AI component merits educational maturity 4–6 | INFERENCE | E02–E06 | depends on maturity rubric | medium-high | S1 roadmap |
| E08a | `ez` is a derived repository difficulty proxy rather than a CEFR label | FACT | corpus catalog/build implementation and provenance surfaced in Room; docs `04`, `07` | exact symbol/blob anchor must be added during implementation recon | high | D5; work-card calibration |
| E08b | A large discovery corpus is not by itself a validated graded curriculum | INFERENCE | E08a; work/editorial coverage; CEFR/ERF official guidance | requires learner comprehensibility calibration | medium-high | D5; work-card calibration |
| E09 | Retrieval practice can support transfer, conditional on task/response/elaboration and initial success | FACT | Pan & Rickard meta-analysis, [PMID 29733621](https://pubmed.ncbi.nlm.nih.gov/29733621/), accessed 2026-07-11; Butler [PMID 20804289](https://pubmed.ncbi.nlm.nih.gov/20804289/) | general research; not Hebrew/product proof | medium-high | CCT/eval design |
| E10 | GenAI language-learning evidence is heterogeneous and often short-term/writing-heavy | FACT | [2025 systematic review](https://www.tandfonline.com/doi/full/10.1080/10494820.2025.2498537), accessed 2026-07-11 | review scope/publication bias | medium | strategy caution |
| E11 | Optimize delayed, novel, unassisted construct-matched transfer, not interaction volume | PROPOSAL | docs `08`, `09`; E09/E10 | construct not operationally validated | medium | D11; implement `18` |
| E12 | Grounded explanation improves 7–14-day CCT vs approved/local explanation | HYPOTHESIS | doc `09` experiment | no live benchmark or RCT | unknown | experiment 2 |
| E13 | Bounded planner beats deterministic due/weak-channel ordering | HYPOTHESIS | doc `09` experiment; live planner baseline | sparse evidence, cold start, MNAR | unknown | experiment 1 |
| E14 | Previewable adaptive scaffolding improves no-hint transfer without reading/accessibility harm | HYPOTHESIS | docs `08`, `09`; scaffolding review | fading evidence mixed | unknown | experiment 3 |
| E15 | Least-agentic solution is preferred; thin M-B only after measured gain | PROPOSAL | docs `05`, `13`; current deterministic runtime | ≥5pp threshold is owner policy, not scientific fact | medium | D2; single-vs-specialist test |
| E16 | Commercial tool use, structured output, multimodal/realtime/ASR/TTS and protocols exist | FACT | official provider/MCP/A2A sources in doc `02`, accessed 2026-07-11 | existence says nothing about Hebrew task quality | high existence | D8; benchmark `17` |
| E17 | Hebrew provider explanation, OCR, ASR, pronunciation, TTS and structured-output reliability are not measured here | UNKNOWN | doc `02`; no locked live-provider benchmark artifact | mocked smokes only | high unknown | BLOCKER for model selection; execute `17` |
| E18 | Typed policy/context/model/tool control plane with no ambient credentials is required before broader autonomy | PROPOSAL | docs `06`, `10`; OWASP/MCP/A2A; live tool-router gaps | design not implemented | medium-high safety | D1, D2, D14; spec `19` |
| E19 | Published phase-1 cost bands are illustrative rather than invoice/ledger-derived | FACT | doc `10` labels; current `llm_usage_ledger`/`usage.json` gaps | current ledger incomplete | high | D13; implement measurement `20` |
| E20 | Human review/support/ops may dominate inference through 1,000 MAU | HYPOTHESIS | R-G reconstruction; doc `10` | reviewer time, WTP and workload mix absent | low-medium | D9, D13; observed ledger/time study |
| E21 | Semantic publication should require human approval bound to immutable artifact hash | PROPOSAL | docs `04`, `10`; R6–R11/R15 | throughput trade-off unmeasured | medium-high safety | D9, D10 |
| E22 | Hebrew speaking/free-writing certification validity is unavailable | UNKNOWN | docs `03`, `08`; no independent end-to-end grader/gold | ASR availability is not validity | high unknown | D4; research only |
| E23 | Fund S1 Reading-led; S3 is `DO NOT BUILD` for 12 months | PROPOSAL | docs `11`, `13`, `15`; E06/E15/E17–E20 | strategic choice, not outcome fact | medium | D17 |
| E24 | The published phase-1 package does not contain the eight primary reports | FACT | repository search at phase-2 baseline; only summaries/claims | raw session transcript is not a committed artifact | high | reproducibility remediation |
| E25 | Independence of the original eight runs cannot be audited post hoc | UNKNOWN | missing raw prompts/context allowlists/run IDs/timestamps/hashes | reconstructed findings exist | high unknown | future provenance protocol |

## Decision-to-evidence map

| Decision | Primary evidence | Material unknown / reopening condition |
|---|---|---|
| D1 autonomy | E02–E04, E18 | safe bounded autonomy with lower harm/CCT gain |
| D2 target architecture | E15, E18, E23 | specialist ≥5pp gain and acceptable cost/latency |
| D3 learner/backstage | E06, E08, E11 | measured activation bottleneck shifts to curation |
| D4 speaking/writing | E03, E17, E22 | independent Hebrew productive-skill validity |
| D5 curriculum | E08, E14 | calibrated work cards/ontology/path RCT |
| D6 manual control | E10, E14, E18 | evidence that override itself causes net harm |
| D7 cloud/local | E04, E18 | public lifecycle, consent and switching evidence |
| D8 routing | E16, E17, E19 | locked benchmark + route privacy + observed units |
| D9 human review | E17, E20, E21 | calibrated near-zero critical error and reviewer economics |
| D10 publishing autonomy | E08, E21 | repeated safe canary/rollback plus owner approval |
| D11 experiments | E06, E09–E14 | operational CCT and eligible sample |
| D12 pilot size | E04, E06, E17–E20 | lifecycle/ops and feasibility baseline |
| D13 cost/CCT | E11, E19, E20 | observed CCT/ledger/WTP/margin |
| D14 privacy | E04, E16–E18 | approved route/region/retention/legal review |
| D15 positioning | E06, E10, E23 | message/activation/WTP test |
| D16 teacher horizon | E06, E08, E20 | proven learner wedge and institutional demand |
| D17 12-month bet | E11–E15, E23 | no transfer/tool-replacement lift |

## Update protocol

This initial ledger intentionally remains partial: several rows bundle material assertions and use path-level rather than blob/symbol/line anchors. Before an implementation or pilot decision relies on a row, split it to one falsifiable claim and add repository blob SHA plus exact symbol/section/line, external title/URL/access date, contradicting evidence, artifact hash, method/sample and limitation. Provider snapshots are refreshed before procurement. Future independent reports are saved before synthesis with exact prompt, context allowlist, model/version, run ID, UTC times, tool/source ledger and SHA-256; agents cannot see sibling outputs until immutable save. Synthesis cites finding IDs such as `RA-F01`.
