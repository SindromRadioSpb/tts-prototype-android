# D-HNR-9 — MADLAD provider provenance in Library v3

**Date:** 2026-08-04
**Scope:** bounded provenance/Library UX slice after L4.0a; not full L4 integration.

## Owner decision

MADLAD-400 is approved as the local MT provider. This does not enable it by default,
does not authorize an implicit MADLAD↔Gemini fallback, and does not change the pinned
production ASR path. Gemini remains the measured cloud-quality ceiling; MADLAD is the
best local candidate under the limited-evidence L4.0a verdict.

## Contract implemented

- `sentences.translation_provider` is the primary provenance authority;
- local save and update persist provider plus compact translation metadata per row;
- text/table metadata is a legacy fallback only;
- Text Metadata shows read-only provider/model/date and a translation-scoped local note;
- Library cards show provider badges and compose provider filtering with corpus/query/
  level/smart filters;
- mixed and unknown cards remain explicit rather than being relabelled as MADLAD;
- strings ship in RU/EN/HE with cache-bust `108`; application version is `3.11.301`.

## Verification

Run from repository root:

```text
npm run smoke:translation-provider
npm run smoke:text-card
npm run smoke:i18n
```

The fresh-Chromium gate seeds four cards (MADLAD, Gemini, mixed, legacy unknown),
checks exact filter results, provider-field generation for save, read-only metadata,
RU/HE 380 px layouts, zero horizontal page overflow, zero page errors, and zero external
translation requests. Stable screenshots:

- `screenshots/translation-provider-library-380-ru.png`
- `screenshots/translation-provider-meta-380-ru.png`
- `screenshots/translation-provider-meta-380-he.png`

## Remaining boundary

Existing legacy cards without sentence or table provenance remain `unknown`; no
backfill guesses their provider. The research ledger continues with L4.0c, then L4.0b,
before a full L4 design packet.
