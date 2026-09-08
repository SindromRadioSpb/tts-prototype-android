# Studio iPhone portable export canonical-number fix — 2026-09-08

> Status: PRODUCTION VERIFIED; physical-iPhone owner acceptance is pending and
> recorded separately below.
>
> Release: `v3.11.497` / `bd2c4a24`.

## Owner reproduction

The owner reproduced the same failure twice on a physical iPhone:

1. download a video on iPhone;
2. run Gemini ASR and build the Gemini learning table;
3. save the learning material;
4. open Import Center → Materials → Use on another device;
5. choose Download material copy;
6. observe fail-closed `CANONICAL_NUMBER_INVALID` and no partial change.

The equivalent PC flow passed. An archive exported on PC, imported on iPhone,
and then re-exported on iPhone also passed.

## Root cause

The mobile media-readiness gate records honest browser measurements in
`device_session_receipt`. Real `HTMLMediaElement.duration` and seek positions
are fractional seconds. The receipt is preserved under
`studio_media_packages.external_ref_json.compatibility`, then projected into
the portable package.

The P2 canonical JSON format deliberately permits only safe integer JSON
numbers. Before this fix, `source/media-ref.json` and `manifest.media` passed
the compatibility object directly to that strict serializer. Fresh iPhone
packages therefore failed on their fractional `duration`, `seek25`, or
`seek75`. Desktop packages did not enter the device-receipt branch, while an
already imported portable archive carried canonical strings and therefore
re-exported successfully.

## Fix and invariants

`buildPackageFiles` now applies the existing diagnostic normalizer once to the
compatibility projection and uses that same value in both `media-ref.json` and
the manifest. Finite non-integer diagnostic measurements are represented by
their shortest decimal strings; safe integers remain numbers.

The strict canonical serializer is unchanged and still rejects a standalone
float. The export does not mutate the saved package. No media, ASR, table,
caption, learner state, `review_log`, database schema, provider policy, or
provider call is changed.

## Verification evidence

- Red-before-fix: exact receipt values `1080.16907`, `270.0422675`, and
  `810.1268025` failed at `source/media-ref.json` with
  `CANONICAL_NUMBER_INVALID`.
- Targeted core/media/UI/version matrix: 72/72 PASS.
- i18n/cache/version gate: 233/233 PASS.
- P2 repository/security/backup/UI suite: 60/60 PASS.
- P2 514-row and 2,800-row/20-revision performance oracle: PASS, no ceiling
  failures.
- Full unit suite: 1400/1401 PASS. The one baseline failure is the unrelated
  pre-existing `iphoneDownloader.test.js` packaged-helper rebuild mismatch;
  this allowlist does not touch that helper or its sources.
- Focused Chromium Import Center flow: PASS. A stored raw fractional iPhone
  receipt was exported through the visible Download material copy action; the
  downloaded archive contained canonical strings, retry/import/duplicate and
  support-report checks passed, `review_log` was exactly unchanged, provider
  requests were 0, and page errors were 0.
- The older all-purpose P2 browser script remains stale against the current
  simplified Import Center DOM and stops before export on a removed element;
  it is not used as evidence for this fix.

## Production and owner-live boundary

- Production deployment: PASS at `v3.11.497` / `bd2c4a24`.
- Five consecutive production reload probes: PASS. Every probe returned
  `APP_VERSION=3.11.497`, `CACHE_VERSION=v3.11.497`, the expected core SHA-256
  `56401a1273a52af194c3c43125da08e77ce215525c9a45709d8219a3a234644b`,
  `health.ok`, DB ready, migrations ready, and zero page errors.
- Automated production Import Center export: PASS with the raw fractional
  iPhone receipt; downloaded archive values were canonical strings. Import,
  retry, duplicate, support-report, and exact `review_log` preservation checks
  passed with zero provider requests and zero page errors. Expected signed-out
  401s and cancelled background prefetch requests were classified separately.
- Physical iPhone repetition of the owner's original end-to-end flow:
  `OWNER_LIVE_PENDING`; it must not be inferred from Chromium.
