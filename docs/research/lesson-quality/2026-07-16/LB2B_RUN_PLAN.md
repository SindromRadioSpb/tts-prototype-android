# LB2-B offline evidence run

**Status:** `READY_FOR_BOUNDED_RUN`; human judgments remain `UNSCORED`.

## Owner mandate

- Total provider budget: at most USD 5.
- Existing Gemini and OpenRouter routes only; no new provider.
- Raw artifacts may contain only synthetic or public-domain source material.
- Shadow critic is offline, advisory, separately metered and unable to edit, repair, select or publish.
- One qualified human reviewer and one adjudicator are declared.
- No production behavior, learner state, lesson durability, grading, `review_log`, FSRS or promotion policy changes.

## Declared matrix

The minimal factorial matrix is two composer cells by two prompt variants across all 13 frozen cases: 52 candidate slots before provider failures. There are no stochastic repetitions in this USD 5 pilot. The direct Gemini cells use the currently listed `gemini-3-flash-preview` and lower-cost stable `gemini-3.1-flash-lite`, allowing the run to test whether the pipeline helps a smaller model. The baseline prompt is reconstructed from the shipped LB2-A composer and hashes its contract. The instruction-engineered variant adds a bounded pre-emission checklist without requesting or storing chain-of-thought.

The offline shadow evaluator uses `gemini-3.5-flash` on a deterministic stratified sample of exactly one candidate per case (13 maximum), distributed across the four composer/prompt combinations. It is not the same model as either composer, but it remains in the same provider/model family; this correlation is an explicit limitation and cannot prove independent certification. Missing keys produce `NOT_RUN_NO_CLI_KEY`, never a fallback to another credential. The existing OpenRouter route was verified but no valid dedicated CLI key was available, so it is not silently borrowed into this primary run.

The first attempted run on 2026-07-16 produced no model candidates: all 44 composer calls ended at the provider boundary (`17` final `404`, `27` final `429`) and all 13 sampled shadow calls ended `429`. It is excluded from quality evidence. Current official Gemini documentation lists Gemini 3.x models and recommends using the model-list endpoint; the revised runner therefore verifies every declared model and performs a schema canary before creating a run packet. A completed packet with zero successful provider responses is forbidden.

## Credential boundary

Browser BYOK storage is intentionally isolated from command-line research scripts. Set dedicated environment variables locally, never in arguments, files or chat:

```powershell
$env:LB2B_GEMINI_KEY = '<set locally>'
```

The preferred Windows launcher avoids command history and clears its temporary child-process credential after the run:

```text
powershell -ExecutionPolicy Bypass -File scripts/premium/run-lb2b-with-gemini.ps1
```

The runner records only whether each variable was present. It never serializes a key. A missing variable skips only its declared cell.

## Commands

Validate the complete packet without provider calls:

```text
node scripts/premium/lesson-quality-lb2b.js --dry-run --out .tmp/lb2b-dry-run
```

Run the declared matrix:

```text
node scripts/premium/lesson-quality-lb2b.js
```

Use `--resume` only after inspecting an interrupted run. Never overwrite a completed run silently.

## Cost and latency

The runner refuses budgets above USD 5 and checks a conservative per-call upper bound before every provider call. The bound treats UTF-8 bytes plus framing reserve as an input-token ceiling and the full requested output limit as billable output, so it also covers unexposed thinking tokens. A separate non-thinking token estimate is informational only; neither number is provider-billed truth. Declared standard rates are USD 0.50/M input and USD 3/M output for Gemini 3 Flash Preview, USD 0.25/M and USD 1.50/M for Gemini 3.1 Flash-Lite, and USD 1.50/M and USD 9/M for the separately metered Gemini 3.5 Flash critic.

The existing adapter enforces a 30-second provider-attempt timeout. LB2-B reports p50/p90/p95/max first; latency threshold options are derived only from the measured distribution.

## Human protocol

1. Give the reviewer `blind/*.json`, `reviewer_worksheet.tsv`, `pairwise_worksheet.tsv` and the frozen rubric, but not `blind-key.json`, raw filenames, metrics or shadow output.
2. Lock the reviewer worksheet before unsealing model/prompt identity.
3. Send every declared critical error, every `UNSCORED` dimension and any reviewer uncertainty to the adjudicator.
4. The adjudicator records a decision but does not rewrite the original reviewer score.
5. Shadow-human agreement is calculated only after both human files are locked.

The pairwise sheet adds one baseline model comparison and one prompt comparison per case when both candidates exist. `preferred_candidate` accepts only the displayed blind ID, `TIE` or `UNSCORED`. Pairwise preference never overrides a critical failure.

With one reviewer, this is pilot evidence rather than inter-rater reliability evidence. No Cohen kappa, Krippendorff alpha or production promotion claim is valid from this run.

## External Hebrew oracles

Non-commercial status is compatible with some resources but does not waive licenses or service terms. This run records oracle feasibility rather than silently scraping web tools. Dicta exposes public morphology tools and open downloadable models; MILA is reported as GPLv3/free for non-commercial use but its hosted analyzer may be unavailable; Pealim has no verified public bulk API in the controlling sources. An oracle may be added to a later declared run only through a reproducible licensed interface with provenance and no private learner text.
