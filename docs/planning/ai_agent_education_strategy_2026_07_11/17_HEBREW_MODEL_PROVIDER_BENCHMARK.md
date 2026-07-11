# 17 — Hebrew model/provider benchmark

**Status:** BENCHMARK PROTOCOL / NOT YET EXECUTED ON LIVE PROVIDERS
**Repository baseline:** `5f2a6f378cc2eea77fe53c2597a15f0bd865e484`
**Protocol date:** 2026-07-11

## Decision boundary

**FACT:** current repository supports Gemini, OpenRouter and mock behind `agent/llm.js`; existing smoke tests validate routing, retries, kill switch, output-token extraction and sanitized errors with mocks. **FACT:** they do not measure live Hebrew quality, latency, structured-output reliability, ASR/TTS quality or educational effect. **UNKNOWN:** no approved API-key/provider matrix, independent Hebrew gold set or human panel was available for this planning session.

Therefore this document does not rank providers. It defines the benchmark required before procurement or model-default decisions and clearly separates measured repository conformance from unmeasured provider capability.

## Decisions the benchmark must support

1. Which route is acceptable for grounded sentence explanation?
2. Can a cheaper model be the default with premium escalation?
3. Which models reliably emit strict tool/JSON outputs under Hebrew input?
4. Which translation/OCR routes preserve Hebrew punctuation, niqqud and segment identity?
5. Which ASR routes handle native speech and representative learner errors without turning pronunciation assessment into transcription confidence?
6. Which TTS voices are intelligible, natural and pedagogically suitable across modern/literary/register cases?
7. Which provider/data tier is legally and operationally acceptable for class A/B/C/D data in the target region?

## Candidate route registry

The registry is versioned at execution time; aliases are forbidden in final comparisons.

| Route family | Snapshot required | Tasks | Data tier prerequisite | Fallback role |
|---|---|---|---|---|
| current Gemini paid route | exact model ID + API/SDK version | explanation, extraction, structured output, image/OCR | paid terms; region/retention/ZDR recorded | current comparison anchor |
| OpenAI text/vision route | exact model snapshot | explanation, structured tools, OCR | project region and retention controls recorded | independent premium/mini comparator |
| Anthropic route | exact model snapshot | explanation, critique, structured tools | contract/retention/region recorded | independent critic comparator |
| approved OpenRouter model | exact upstream model and route | cost/fallback only | every subprocessor/model policy approved | owner-only shadow until approved |
| local/open-weight | model hash, runtime, quantization and hardware | redaction/classification/extraction | local data path | degraded/private route |
| Google/OpenAI/other ASR | exact speech model/region | transcription only | audio consent and retention route | research comparator |
| Google/current/local TTS | exact voice/model/profile | synthesis | licence/region/cache policy | current and degraded comparison |

## Evaluation corpus and split governance

Gold authors and adjudicators must be independent of the generator/provider evaluation. Near-duplicate families remain in one split. Personal text is excluded from provider benchmarking unless separately consented.

| Suite | Minimum locked cases | Required strata | Gold method |
|---|---:|---|---|
| G1 grounded explanation | 200 | A2/B1/B2; modern/literary/everyday; homographs; proclitics; weak roots; sparse evidence | resolver/corpus facts + two Hebrew reviewers |
| G2 grammar/error feedback | 150 | morphology, syntax, register, valid variants, ambiguous/ungradable | reviewer rubric; multiple acceptable answers explicit |
| G3 structured/tool output | 500 calls per route | Hebrew/RTL strings, unknown fields, injection, long/empty input, schema boundary | deterministic JSON/schema oracle |
| G4 translation | 200 segments | niqqud/no-niqqud, named entities, idioms, literary/everyday, punctuation | two bilingual reviewers + adjudication |
| G5 OCR | 150 images | print, scan, phone photo, mixed RTL/LTR, niqqud, tables, blur | character/word transcription gold |
| G6 ASR | ≥10 speakers × 30 clips | native/learner; gender/age bands where consented; accents; background noise; read/spontaneous | human transcript; error taxonomy |
| G7 TTS | 120 passages × voices | prose/dialogue/poetry, niqqud, abbreviations, numbers, foreign names | blinded MOS + intelligibility/error marking |
| G8 agent/tool safety | 200 adversarial cases | indirect injection, cross-tenant canaries, tool escalation, fabricated citations | deterministic deny/allow oracle |

## Task-specific rubrics

### Grounded explanation

Hard fail if the answer asserts a conflicting lemma/root/binyan/sense, invents evidence, loses the source sentence, exposes disallowed context or grades the learner. Score factual support, useful contrast, level fit, concision, citation/provenance use, abstention and next-step appropriateness. Fluency cannot compensate for a hard fail.

### Structured/tool reliability

Run temperature/configuration fixed and repeat each case. Measure valid JSON, schema pass, correct tool, correct arguments, additional-field rate, refusal, invalid retry, semantic correctness and tool-call latency. Authorization is always enforced outside the model; this suite measures proposal reliability only.

### ASR and pronunciation boundary

Report WER/CER plus Hebrew-specific errors: clitic segmentation, matres lectionis, homophones, names, code-switching and optional niqqud normalization. ASR transcript accuracy is not pronunciation quality. Pronunciation feedback needs a separate human-scored phone/prosody/error rubric and calibration; until then status is `RESEARCH ONLY`.

### TTS

Measure word intelligibility, stress, vowel/niqqud realization, phrasing, abbreviation/number/name handling, latency, audio duration, cacheability and listener preference. Do not use the synthesizer or same provider model as sole judge.

## Operational measurements

Every call records `benchmark_run_id`, case/suite, route/snapshot, region, prompt/schema/tool version, input/output/cache tokens or audio units, client/server latency, retries, error class, refusal, cost, data tier and raw-output artifact hash. Raw class-C content is never placed in general traces.

Report median/p95/p99 latency, availability, schema success, critical-error rate, abstention calibration and cost per accepted result. For interactive explanation set a provisional p95 target only after measuring the current route; do not silently exclude retries/timeouts.

## Provider/privacy procurement matrix

For each route capture: training use; default abuse/log retention; application-state retention; ZDR eligibility and exclusions; region/storage/processing; subprocessors/router behavior; deletion controls; batch/cache implications; age/product restrictions; rate limits; SLA/support; snapshot lifetime; contract version and review date. A cheaper route that weakens the approved privacy tier is not a fallback.

## Experimental design and promotion

1. Freeze corpus, rubric, route snapshots and configuration.
2. Run deterministic/schema suites first; quarantine broken routes.
3. Blind provider identity for human review.
4. Use paired case-level comparisons and confidence intervals; correct multiplicity by decision family.
5. Predeclare noninferiority margins: suggested ≤1 percentage point critical-error and ≤2 points grounded-pass loss for cheaper routing, plus ≥30% variable cost reduction.
6. Evaluate strata and OOD separately; no aggregate promotion with a Hebrew risk-stratum breach.
7. Pilot only routes passing privacy, reliability and quality gates; educational transfer remains a separate randomized experiment.

## Current measured/not-measured ledger

| Claim | Status | Evidence / next action |
|---|---|---|
| provider allowlist/kill switch/retry path works in code | MEASURED BY MOCKED SMOKE — 18/18 on 2026-07-11 | `npm run smoke:agent-llm-provider` at `5f2a6f`; validates code contract, not live provider quality |
| current live provider Hebrew explanation quality | NOT MEASURED | execute G1 with locked gold |
| structured-output failure rate | NOT MEASURED | execute G3 ≥500 calls/route |
| model-specific Hebrew translation/OCR quality | NOT MEASURED | execute G4/G5 |
| Hebrew ASR/pronunciation suitability | NOT MEASURED | recruit consented speaker set; execute G6 |
| TTS pedagogical quality/cache economics | PARTIAL OPERATIONAL, NOT COMPARATIVE | export usage/cache baseline; execute G7 |
| provider improves delayed transfer | NOT MEASURED | only after route passes benchmark; use CCT experiment |

## Deliverables from an executed benchmark

`benchmark_manifest.json`, immutable inputs/gold hashes, raw provider outputs in access-controlled research storage, schema results, blinded human ratings, adjudication log, cost/latency export, privacy registry snapshot, analysis notebook/script, model card per route, recommendation and explicit rejected routes. Until these exist, no document may state that an optimal provider has been selected.
