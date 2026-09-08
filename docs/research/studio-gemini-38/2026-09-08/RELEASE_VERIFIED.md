# Gemini 3.8 Studio release verification

Verified: 2026-09-08

## Model migration

Production release: `3.11.495`
Code commit: `e9e89499fb9fa334330552a8e7e93f9915e668ec`

- Full unit suite: 1398/1398 passed.
- Focused migration/regression suite: 60/60 passed.
- API, ingest, i18n, and Studio chunk-recovery gates passed.
- A local owner-BYOK structured request was a `TECHNICAL_PASS` on
  `gemini-3.8-flash` with 2/2 segment coverage.
- Production health, configuration, running policy, and public Git-byte parity
  passed. An exact replay returned `fromCache=true`.

## Browser cache identity follow-up

Production release: `3.11.496`

Release commit: `fb385d1470f5affc6967c929b1a376deea6d6e31`
Code commit: `01b9cedfec86d50f8b7c11b946aee8784dff1ba2`

- Gemini browser table-cache reuse requires the exact pinned model.
- Durable long-table journals include the model in their signature, so a 3.7
  prefix cannot resume into a mixed 3.7/3.8 table.
- Full unit suite: 1400/1400 passed.
- OPFS reload browser gate passed with 121/121 segment coverage and explicitly
  rejected a 3.7-model resume; the 1440 px and 380 px recovery matrix passed.
- Two independent production probes returned health 200 and exact Git-byte
  parity for Studio, service worker, Room, download helper, and table journal.

The first follow-up deployment exhausted the root filesystem. After explicit
owner approval, only unused Docker build cache and images unreferenced by any
container were pruned. Containers, volumes, and application data were not
deleted. Space moved from 100% used (0 free) to 70% used (about 11 GB free);
after rebuilding and switching the release it was 76% used (about 8.8 GB free),
with no unhealthy containers.

## Boundaries

- This is `TECHNICAL_PASS`, not owner acceptance of a fresh ordinary Studio
  long-form workflow.
- Provider protocol and validation compatibility do not establish linguistic
  accuracy.
- Existing 3.7 caches and provenance were preserved, not rewritten.
- No key, request text, response text, raw model output, owner path, or private
  production coordinate is recorded in this evidence.
