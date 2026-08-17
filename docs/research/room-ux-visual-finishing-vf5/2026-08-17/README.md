# ROOM-UX-VF5 regression correction evidence

Artifact date: `2026-08-17`

This directory records the first concrete post-closure regression evidence that
changes the `2026-08-16` VF5 research result. The earlier `NO_GO` was correct for
the evidence available then; the owner supplied new production evidence on
`2026-08-17` and explicitly requested a bounded correction.

## Evidence passport

- Baseline source: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`;
  local `HEAD`, local `origin/main` and remote `main` converged before the slice.
- Baseline production/client: API, Studio, Room and SW `3.11.399`; actual owner
  Chrome displayed `3.11.399` before implementation.
- Target release: `3.11.401`. Interim `3.11.400` was rejected by the required
  owner-client gate because the real legacy card had no portable row identity.
- Production URLs: `https://linguistpro.kolosei.com/library.html` and
  `https://linguistpro.kolosei.com/index.html`.
- Dirty state: the 34 pre-existing unrelated entries and unrelated untracked
  trees were preserved. Only the allowlisted regression files are in this slice.
- Evidence classes: `OWNER_SUPPLIED_PRODUCTION_SCREENSHOT`, `CODE_CURRENT`,
  `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`; production convergence and updated
  owner-client readback are recorded after deployment in the implementation evidence.
- Limitations: no physical-device or screen-reader claim; automation is not AT
  evidence. The owner material is not edited, graded or saved by this work.
- Owner-data safety: no text, row, progress, Finished, bookmark, note, list,
  review, group, presentation, provider, cache, schema or migration mutation;
  no TTS/ASR/MT/LLM invocation and no timing interpolation.

Primary record:

- [REGRESSION_CORRECTION_IMPLEMENTATION_EVIDENCE.md](REGRESSION_CORRECTION_IMPLEMENTATION_EVIDENCE.md)
- [screenshots/README.md](screenshots/README.md)
