# Gemini 3.8 Studio release verification

Verified: 2026-09-08

Production release: `3.11.495`

Code commit: `e9e89499fb9fa334330552a8e7e93f9915e668ec`

## Gates

- Full unit suite: 1398/1398 passed.
- Focused migration/regression suite: 60/60 passed.
- API smoke: passed.
- Ingest smoke: 22/22 passed.
- i18n: 233/233 passed.
- Studio chunk recovery: passed at 1440 px and 380 px for failures in
  chunk 1 and chunk 2, with no provider replay in the fixture.
- Local owner-BYOK structured request: `TECHNICAL_PASS`, model
  `gemini-3.8-flash`, 2/2 segments.

## Production

- `/healthz`: 200 in two independent probes.
- `/api/client-config`: `3.11.495` in two independent probes.
- Running image is bound to code commit `e9e89499...`.
- Running policy contains `gemini-3.8-flash` and thinking level `medium`.
- Exact live/Git SHA-256 parity:
  - `public/index.html`:
    `0cd49ad06c9ef866f4a18ce6fb2e35a54ba31119066cc10312393c8c766ef42c`
  - `public/sw.js`:
    `8cb93eea45d70dbc9a1475b38dd04eb4fb7933163ddf0551dc5291404fe26eb2`
  - `public/library.html`:
    `4351e7fa95c6d3d87f7569ce55d9feb7b65ffa8970368c475e9a5b52f6fe9e60`
  - `public/download-media.html`:
    `88bc9414c2f8f58942fae687c80fb8bd8e0492c6a001daba8d3a70c89d368664`
- Live owner-BYOK table request: 2 rows, `gemini-3.8-flash`, no semantic
  repair; exact replay returned `fromCache=true`.

No key, request text, response text, raw model output, owner path, or private
production coordinate is recorded in this evidence.

## Boundaries

- This is `TECHNICAL_PASS`, not owner acceptance of a fresh ordinary Studio
  long-form workflow.
- The provider smoke proves protocol and validation compatibility, not
  linguistic accuracy.
- Existing 3.7 caches/provenance were not rewritten.
- Production root disk was 99% used after deployment (about 669 MB free).
  Read-only inventory showed reclaimable unused images/build cache, but no
  cleanup was performed in this release.
