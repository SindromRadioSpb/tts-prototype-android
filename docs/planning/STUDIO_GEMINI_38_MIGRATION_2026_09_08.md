# Studio Gemini 3.8 Flash migration — implementation record (2026-09-08)

## Decision

LinguistPro Studio BYOK workflows use the stable `gemini-3.8-flash` model with
managed `medium` thinking and no automatic model fallback. The ordinary product
surface reports the active model and `BYOK`, but does not ask a learner to choose
among model IDs.

This applies to the central Studio scenarios `ocr`, `table-he-ru`,
`table-any-he`, `table-seg-he-ru`, and `retell`. The separate economy policy
remains `gemini-3.5-flash-lite`. Historical research/material-generation scripts
and saved provenance are not rewritten.

## Migration contract

- `GEMINI_STUDIO_MODEL` is `gemini-3.8-flash`.
- `thinkingConfig.thinkingLevel` is explicitly `medium`.
- `temperature`, `topP`, `topK`, `candidateCount`, and numeric
  `thinkingBudget` fail closed in the central configuration builder.
- No fallback or silent downgrade is allowed.
- Cache identity continues to include the exact model, prompt, schema, and
  content SHA-256. A 3.7 cache can therefore never satisfy a 3.8 request.
- The browser's optional table cache accepts Gemini rows only when its recorded
  model is the current pinned model. Model-less and 3.7 entries may still be
  displayed as historical local state, but an explicit rebuild cannot reuse
  them as a current 3.8 result.
- The durable long-table journal signature includes the exact model as well as
  source text, provider, chunk size, and segment identities. An unfinished 3.7
  prefix therefore cannot be resumed and mixed with newly generated 3.8 rows.
- Existing 3.7 raw and validated cache files remain immutable; the first 3.8
  request for existing content is a new paid/free-tier provider request.
- Archival corpus-repair tools stay pinned to the model recorded by their
  immutable evidence instead of borrowing Studio's moving current default.
- Model, requested model, returned model version, and cache identity remain in
  response provenance.

## Evidence

Google identifies `gemini-3.8-flash` as GA and production-ready, with structured
outputs and `low`, `medium`, and `high` thinking. Its migration checklist says to
remove sampling controls and use `thinking_level`; `medium` is the model default.

Primary sources:

- <https://ai.google.dev/gemini-api/docs/latest-model>
- <https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash>
- <https://ai.google.dev/gemini-api/docs/generate-content/thinking>
- <https://ai.google.dev/gemini-api/docs/pricing>

The installed `@google/genai` 2.18 API exposes
`config.thinkingConfig.thinkingLevel`, matching the production adapter.

## Product choice

Do not add a prominent model selector for ordinary learners. A selector would
create a support, cache, provenance, price, and quality choice that the product
can make more reliably. Keep a managed recommended default and show the exact
model read-only in usage/provenance.

If a real expert need appears later, an Advanced-only override may be designed
separately. It must use a small stable allowlist, state cost/latency/quality
trade-offs, include the model in confirmation and provenance, isolate caches,
probe key access, and never silently fall back.

## Verification gates

- policy/config/cache unit tests;
- browser-cache and durable-journal model-identity tests;
- OCR route and targeted table-repair route tests;
- one real owner-BYOK structured table request with no key or content logging;
- full repository test suite and focused API/ingest/i18n gates;
- scoped commit and production asset/config verification;
- fresh owner Studio request remains an owner acceptance gate.
