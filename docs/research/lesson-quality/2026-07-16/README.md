# LB2 Hebrew lesson-quality review packet

**Status:** `UNSCORED`; stable human-review packet, not promotion evidence.
**Prepared:** 2026-07-16.
**Source commit:** `6b2a123` (LB2 decision baseline; implementation is intentionally evaluated by a later declared run manifest).
**Inputs:** synthetic Hebrew and public-domain Ben-Yehuda source locators only; no private learner text.

## What to review

`cases.json` freezes the case matrix. `rubric.json` links to the existing LB1 rubric and adds no silent scoring semantics. Reviewers edit only `reviewer_worksheet.tsv`: replace `UNSCORED` with declared human ratings and record every critical error explicitly. Blank and unreviewed cells remain `UNSCORED`, never zero.

`run_manifest.example.json` is a content-free template for a later LB2-B generation run. It does not claim that a model, prompt, reviewer, threshold, or promotion decision has been approved. Raw prompts and outputs must not be copied into operational telemetry; any review artifacts produced later belong in a separately declared, access-appropriate research run.

## Reproduction

From the repository root:

```text
npm run smoke:lesson-builder
node --check agent/lessonCompositionContract.js
node --check agent/lessonBuilder.js
```

To prepare a later evidence run, copy `run_manifest.example.json`, fill only the declared configuration/provenance fields, generate artifacts from `cases.json`, and record artifact paths and hashes in the run folder. Do not overwrite this packet or pre-fill the worksheet with model judgments.

## Reviewer instructions

1. Verify the source locator and exact anchors before reading the lesson as pedagogy.
2. Score linguistic correctness, naturalness, level fit, source grounding, answerability, pedagogical value, and cognitive load independently.
3. Use the scale and critical-failure definitions in `rubric.json`; do not infer a zero from missing evidence.
4. In `critical_errors`, write `NONE` only after checking every declared critical category; otherwise record the category plus a concise human rationale.
5. Record uncertainty or adjudication needs in `reviewer_notes`. Do not use the composer or shadow critic as the final Hebrew oracle.
6. Keep the worksheet `UNSCORED` until an identified qualified reviewer has actually reviewed the generated artifact.

The packet itself is a review scaffold. It does not enable the shadow critic, grade a learner, change `review_log`, or authorize publication.

## LB2-B offline evidence run

The owner-authorized bounded run is declared in:

- `LB2B_RUN_PLAN.md` — matrix, credential boundary, reviewer/adjudicator workflow and commands;
- `LB2B_R1_R17_CRITIQUE.md` — adversarial resolutions;
- `lb2b-run-config.json` — USD 5 hard ceiling, two composer cells, two prompt variants and an offline-only critic;
- `scripts/premium/lesson-quality-lb2b.js` — generation, one repair, cost guard, blind packet and content-free metrics;
- `scripts/premium/lesson-quality-lb2b-analyze.js` — human/shadow/pairwise analysis and non-binding threshold scenarios.

Browser-stored BYOK is deliberately unavailable to these scripts. Dedicated CLI environment variables are read in memory and only presence booleans enter the manifest. Until the generated `reviewer_worksheet.tsv` and `adjudicator_worksheet.tsv` are completed by the declared humans, every quality result remains `UNSCORED` and promotion remains `NO_DECISION`.

## Provider-capability record

Verified 2026-07-16 against primary provider documentation and the installed adapter:

- Google documents structured JSON output plus mandatory application-side semantic validation. The installed legacy `@google/generative-ai` 0.19 type contract exposes `generationConfig.responseSchema`; LB2 projects the shared schema onto that SDK's supported OpenAPI subset and still runs the full deterministic validator. Source: <https://ai.google.dev/gemini-api/docs/structured-output>.
- OpenRouter documents strict `response_format.type=json_schema` and model capability discovery through `supported_parameters`. Its live Models API listed the current default `nvidia/nemotron-3-super-120b-a12b:free` route with both `response_format` and `structured_outputs`; LB2 also requests `require_parameters` so routing cannot silently discard the schema. Sources: <https://openrouter.ai/docs/guides/features/structured-outputs> and <https://openrouter.ai/api/v1/models>.
- If a future routed adapter cannot supply native schema, the contract requires honest `schema_mode=prompt_json`; no provider/model switch or fallback is authorized by this packet.
