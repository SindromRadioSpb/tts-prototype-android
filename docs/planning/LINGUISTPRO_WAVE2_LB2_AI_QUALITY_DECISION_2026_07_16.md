# LinguistPro Wave 2 — LB2 AI lesson quality decision

**Date:** 2026-07-16

**Status:** `OWNER_APPROVED_FOR_LB2_A_IMPLEMENTATION`

**Predecessor:** `LINGUISTPRO_WAVE2_LB1_LESSON_STUDIO_DECISION_2026_07_16.md`

**Production code baseline:** app `3.11.181`, policy `lesson-builder-lb1-v2`, schema 2, implementation commit `befa734`; the repository HEAD also includes the later documentation-only planning commit that publishes this decision.

**Next implementation prompt:** `LINGUISTPRO_WAVE2_LB2_AI_QUALITY_EXECUTION_PROMPT_2026_07_16.md`.

## 1. Observed problem

LB1 already invokes the LLM when the learner explicitly presses **Create draft**. In the owner production check, the endpoint returned HTTP 200 and the model route answered, but both the first candidate and the single bounded repair failed `validateComposition`. The server therefore returned a deterministic `basic_plan` with `degraded_reason=LLM_OUTPUT_INVALID`.

This was safe but insufficiently diagnosable:

- `validateComposition` collapses every rejection to `null`;
- the product cannot say which invariant failed;
- repair receives a generic failure statement rather than exact failure codes;
- first-pass and post-repair acceptance cannot be measured by cause;
- the existing rubric and adversarial fixtures protect hard structure, but there is no human-scored Hebrew-gold evidence for pedagogical or linguistic quality;
- the shadow critic exists behind a default-off flag, but has no approved promotion evidence.

The previous label “Basic plan without AI” was also misleading. Version 3.11.181 now distinguishes an unavailable AI route from an AI candidate rejected by the quality gate.

## 2. Product thesis

LB2 improves the probability that a model produces an admissible lesson without weakening the LB1 safety boundary.

The system must answer three different questions separately:

1. **Was a model invocation available and completed?** Provider/runtime fact.
2. **Did the candidate satisfy the typed publication contract?** Deterministic structural fact.
3. **Is the lesson linguistically and pedagogically excellent?** Human-gold evaluation first; shadow evaluator only after measured agreement.

Passing question 2 permits the label `premium_draft`; it does not certify question 3. The learner remains the editor.

## 3. Approved slice boundary

### LB2-A — implement now

1. Replace nullable validation with a typed detailed result while preserving a compatibility wrapper where needed.
2. Emit stable, content-free failure codes and stages for first attempt and repair.
3. Give the repair route only the exact failure codes, the frozen request/schema contract and the bounded invalid candidate already allowed by LB1.
4. Use provider-native structured output / JSON Schema when the existing provider adapter supports it without weakening BYOK or adding a second model authority. Otherwise retain strict JSON parsing and record `schema_mode=prompt_json` honestly.
5. Persist or return only content-free diagnostics needed for the ephemeral draft UI and aggregate measurement.
6. Add a localized “Why basic plan?” explanation that distinguishes provider unavailability, budget/key failure, invalid JSON and contract rejection.
7. Expand independent fixtures so each hard failure code has a positive and negative oracle.
8. Create the stable, unscored Hebrew-gold review packet and scoring instructions. Do not fabricate human scores.

### LB2-B — evidence collection, not automatic promotion

1. Run a declared model/prompt matrix over the approved non-sensitive fixture set.
2. Measure first-pass acceptance, repair recovery, latency, calls, output size and rejection-code distribution.
3. Obtain qualified human Hebrew/pedagogy scores using the frozen rubric.
4. Compare any shadow-critic output with human judgments. Shadow results remain advisory and invisible to the learner.

### Explicitly outside LB2-A

- enabling the shadow critic as a publication authority;
- allowing a critic to repair or select the learner-visible lesson;
- lowering hard structural gates to improve an acceptance percentage;
- automatic cards, `review_log`, FSRS, mastery or learner-memory writes;
- durable retain-until-delete lessons or background series generation;
- storing raw prompts, model candidates, source text or learner text in operational telemetry;
- introducing multiple autonomous agents, a generic orchestration platform or a new database.

## 4. Deterministic validation contract

The detailed validator returns one of:

```js
{ ok: true, value: TypedComposition, codes: [] }
{ ok: false, value: null, codes: ValidationCode[] }
```

Codes are stable, deduplicated and ordered by validation stage. The minimum approved vocabulary is:

| Code | Meaning |
|---|---|
| `INVALID_JSON` | Provider output cannot be parsed as one JSON object. |
| `MISSING_OBJECTIVE` | No non-empty bounded objective. |
| `MISSING_SECTION` | No admissible source-linked section remains. |
| `MISSING_SOURCE_ID` | A section/exercise has no source ID. |
| `FOREIGN_SOURCE_ID` | A source ID was not supplied by the controller. |
| `MISSING_ANCHOR` | A section/exercise has no exact anchor ID. |
| `FOREIGN_ANCHOR` | An anchor ID was not supplied by the controller. |
| `MISSING_FOCUS` | One or more selected focuses have no exercise. |
| `MISSING_PURPOSE` | An exercise has no concrete purpose. |
| `GENERIC_INSTRUCTION` | Instruction is absent or below the declared minimum specificity floor. |
| `MISSING_SUCCESS_CRITERIA` | Exercise has no usable success criterion. |
| `MISSING_EXPECTED_ANSWER` | Controlled vocabulary/grammar task has no expected answer. |
| `LOAD_EXCEEDED` | Candidate exceeds the duration-derived section/exercise load. |

Implementation may add a code only with a fixture, localized learner-facing grouping where relevant and documentation update. Codes never contain source text, model text, learner text, IDs that reveal content, or provider error bodies.

## 5. Structured generation contract

The controller, not the model, owns:

- allowed `source_id` and `anchor_id` values;
- selected focuses and duration-derived load;
- resolver facts and selected construct;
- language, approximate level and learner goal;
- schema/policy/model-route versions;
- the publication decision.

The model may sequence, phrase and explain only within that envelope.

Provider-native structured output is preferred when already supported by the routed provider. The same logical schema must be enforced after parsing, because provider schema compliance is not a linguistic or authority oracle. BYOK failure remains fail-closed with no managed-key fallback.

The repair request must include:

- the original typed request;
- exact allowlisted validation codes;
- the same allowed source/anchor IDs;
- the same resolver facts;
- the bounded invalid candidate;
- an instruction to change only what the codes require and add no facts.

There remains exactly one repair attempt in LB2-A.

## 6. Diagnostics and measurement

Allowed per-attempt diagnostics:

```json
{
  "stage": "first|repair",
  "outcome": "accepted|rejected|provider_unavailable",
  "validation_codes": ["MISSING_ANCHOR"],
  "schema_mode": "provider_json_schema|prompt_json",
  "provider": "allowlisted provider id or null",
  "model": "declared model id or null",
  "latency_bucket_ms": "0-2s|2-5s|5-10s|10s+",
  "output_size_bucket": "small|medium|large"
}
```

No raw prompt, source sentence, generated exercise, expected answer, learner identifier, key, cookie, provider response body or stack trace enters operational telemetry. User-scoped daily usage remains governed by the existing LLM gate and ledger.

The UI may display a localized summary of the code group, for example “missing exact source anchors”. It must not expose internal provider errors or imply that structural acceptance is expert certification.

## 7. Hebrew-gold packet

LB2-A creates a stable packet under:

`docs/research/lesson-quality/2026-07-16/`

Required files:

- `README.md` — provenance, commands, source commit, raw/preview/scored status and editing instructions;
- `cases.json` — versioned public-domain or synthetic cases; no private learner material;
- `rubric.json` — frozen dimensions and critical-failure definitions, linked to the LB1 rubric rather than silently diverging;
- `reviewer_worksheet.tsv` — blank human annotation sheet;
- `run_manifest.example.json` — content-free reproducibility fields and no claimed scores.

Minimum case coverage:

- short, 146-row overview and >200-row series scope;
- A1, A2, B1 and B2 requested levels;
- reading, vocabulary, grammar, writing and dialogue;
- modern and literary/public-domain Hebrew;
- ambiguous morphology and no-eligible-vocabulary cases;
- invalid anchors, invented construct, missing answer and generic-instruction adversarial cases;
- deterministic degradation when the model route is absent or rejected.

Human dimensions are linguistic correctness, naturalness, level fit, source grounding, answerability, pedagogical value and cognitive load. A human reviewer must record critical errors explicitly. Blank or unreviewed cells are `UNSCORED`, never zero.

## 8. Shadow critic promotion boundary

The existing shadow path remains default off. Enabling it for an evidence run requires an explicit run configuration and separate metering. It may return only an allowlisted score/failure-code artifact and cannot modify the draft.

Promotion requires a later owner decision based on:

- agreement with qualified human judgments;
- incremental detection of real critical errors;
- false-rejection rate;
- latency and cost;
- stability across levels, focuses and Hebrew registers;
- proof that the evaluator is not merely self-certifying the composer.

No fixed numerical threshold is silently approved here. LB2-B must report the measured distribution and present threshold options to the owner.

## 9. Acceptance gates for LB2-A

1. Every declared validation code has a deterministic fixture and no invalid adversarial case is accepted.
2. Existing valid LB1 artifacts remain readable; schema/policy compatibility is explicit.
3. First and repair attempts expose content-free diagnostics without changing LLM-call authority or daily limits.
4. Repair is code-directed, bounded to one attempt and cannot introduce foreign IDs/facts.
5. Provider-native schema mode is used only when verified through the existing adapter; fallback mode is labelled honestly.
6. UI explanations are localized in ru/en/he, accessible, RTL-safe and visually checked at 380x844.
7. Log-hygiene and sentinel tests prove no source/model/learner content enters logs or telemetry.
8. Hebrew-gold packet exists in a stable repository path and is explicitly unscored.
9. Shadow critic remains unable to alter the learner-visible draft.
10. Relevant lesson, agent, i18n, auth, log-hygiene and API gates pass; commit/push and production verification follow project protocol.

## 10. R1-R17 synthesis

- **R1/R10/R11:** resolver facts and foreign-ID rejection remain above model prose; human Hebrew gold is independent from the composer.
- **R2/R8/R17:** hard structure is separated from actual teaching quality; the tutor does not certify itself and MNAR remains untouched.
- **R4/R5:** the learner sees an actionable reason and a usable fallback, never a dead end or a false “AI not connected” claim.
- **R6/R7/R9:** literary register and provenance are explicit gold dimensions; derived evaluator opinion never becomes asserted linguistic truth.
- **R3/R12/R13:** detailed results extend the typed artifact/controller seam without a second writer, migration or dual truth.
- **R14/R15:** diagnostics are content-free and user scope/consent remain unchanged.
- **R16:** one repair, existing budgets, schema-mode telemetry and measured cost prevent an unbounded quality chase.

## 11. Owner gates remaining after LB2-A

1. Who is qualified to score Hebrew-gold and how disagreements are adjudicated.
2. Model/provider matrix and acceptable cost/latency ceiling for LB2-B.
3. Numerical human-quality and shadow-agreement promotion thresholds.
4. Whether a proven critic may block publication, request another repair or remain advisory only.
5. Durable lesson retention and background series generation, which remain part of the later M1/S4-S7 decision.
