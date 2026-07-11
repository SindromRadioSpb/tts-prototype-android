# AI and agent education strategy — 2026-07-11

**Status:** PHASE 1 STRATEGIC SYNTHESIS COMPLETE; PHASE 2 EVIDENCE / IMPLEMENTATION DESIGN IN PROGRESS
**Research date:** 2026-07-11
**Live source commit:** `a510b1e1ce5378702987f6a244d79b2782199430`
**North Star packet source:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6`

## Task and method

This packet's original `01`–`15` documents are a compact strategic synthesis and owner decision layer. They answer which educational decisions may become better with AI, which must remain deterministic, and which platform contracts are required. They are not a completed provider benchmark, implementation specification, validated economic model or external-pilot authorization. Phase 2 adds the evidence and implementation layer in `16`–`21` and `appendices/`.

Method: ordered reading of the North Star packet; live recon of `agent/`, `db/`, migrations, relevant `public/js/`, smoke inventory and history; current external research checked on 2026-07-11; eight separately tasked lenses (learning science, learner product, architecture, content, evaluation, governance, economics/operations and adversarial refutation); cross-lens adjudication under R1–R17. Their primary run artifacts were not persisted, so independence is not auditable post hoc; the appendix is explicitly reconstructed.

Evidence labels used throughout:

- **FACT** — live repository, test/migration, official source or measurement.
- **INFERENCE** — reasoned implication of facts.
- **HYPOTHESIS** — falsifiable claim awaiting experiment.
- **PROPOSAL** — recommended choice, not canon.
- **UNKNOWN** — insufficient evidence.

## Executive answer

**PROPOSAL:** preserve a reading-led deterministic learning kernel and evolve the current Mentor into a policy-controlled orchestrator. Use bounded model calls for grounded explanation and candidate generation. Add specialist agents only where independent evaluation or measured quality isolation beats a plain function/single-agent control. Never make agent memory, prose or self-grading educational truth.

Formula:

`real text → authoritative evidence → explicit learner attempt → deterministic scheduling/grading → optional AI recommendation/explanation → delayed novel-context probe → independently confirmed transfer`

## Reading order

1. `15_EXECUTIVE_RECOMMENDATION.md`
2. `01_GROUNDED_AI_AGENT_BASELINE.md`
3. `03_EDUCATIONAL_OPPORTUNITY_MAP.md`
4. `05_MULTI_AGENT_ARCHITECTURE_OPTIONS.md`
5. `06_TARGET_AGENT_PLATFORM.md` and `07_PLATFORM_GAP_ANALYSIS.md`
6. `08_PEDAGOGICAL_MODEL_AND_USER_CONTROL.md` and `09_EVALUATION_AND_EXPERIMENTS.md`
7. `10_SECURITY_PRIVACY_COST_GOVERNANCE.md`
8. `11_STRATEGIC_SCENARIOS_AND_ROADMAP.md` and `12_OPERATIONAL_PLAN.md`
9. `13_ADVERSARIAL_CRITIQUE.md`
10. `14_OWNER_DECISIONS.md`
11. `16_EVIDENCE_LEDGER.md` and `appendices/subagent_reports/` — partial claim traceability and reconstructed lens archive; primary artifacts unavailable.
12. `17_HEBREW_MODEL_PROVIDER_BENCHMARK.md` — benchmark protocol and measured/not-measured ledger.
13. `18_CONFIRMED_CONTEXTUAL_TRANSFER_SPEC.md` and `19_AGENT_CONTROL_PLANE_DESIGN.md` — implementation specifications.
14. `20_AI_COST_AND_CAPACITY_MODEL.md` and `21_90_DAY_EXECUTION_BACKLOG.md` — bottom-up measurement design and proposed execution backlog pending owner/RACI assignment.

## Constraints

No production code, API, migration, UI, environment or production configuration was changed. Provider/model/pricing facts are snapshots, not permanent procurement decisions. Owner-live verification is technical evidence only; no external learning effect, PMF, W1/W4 retention or willingness-to-pay is claimed.

## Principal external sources

Primary/official sources include [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint), [OpenAI models](https://developers.openai.com/api/docs/models), [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Google Speech pricing](https://cloud.google.com/speech-to-text/pricing), [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [A2A specification](https://a2a-protocol.org/), [UNESCO learner-rights guidance](https://www.unesco.org/en/articles/ai-and-education-protecting-rights-learners), and the research cited in documents 02, 08 and 09.
