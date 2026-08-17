# VF5 bounded Room row-media regression correction

Artifact date: `2026-08-17`

## Evidence passport

- Baseline: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`, equal to
  local and remote `origin/main` at start; branch `main`.
- Baseline production/client: API/Studio/Room/SW and owner Chrome `3.11.399`.
- Target: `3.11.401`.
- Production URLs: `https://linguistpro.kolosei.com/library.html`,
  `https://linguistpro.kolosei.com/index.html`.
- Dirty state: 34 pre-existing unrelated entries plus unrelated untracked work
  preserved; the scoped diff is enumerated below.
- Evidence classes: `OWNER_SUPPLIED_PRODUCTION_SCREENSHOT`, `CODE_CURRENT`,
  `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`, with production/client evidence added
  after deployment.
- Limitations: no physical-device or screen-reader execution. Owner-live
  interaction that would change a reading row is not used as verification.
- Safety: projection-only restore; no data/schema/migration/provider/canonical
  writer changes and no invented timing.

## Decision change

The `2026-08-16` VF5 `NO_GO_KEEP_PROGRAM_CLOSED` conclusion remains an accurate
historical decision. New owner production evidence on `2026-08-17` crosses the
re-entry threshold for exactly one `REGRESSION_CORRECTION_ONLY` slice:

```text
F1=REGRESSION_CORRECTION_ONLY
F2=ROOM_RESTORE_PERSISTED_STUDIO_ROW_MEDIA_IDENTITY
F3=MEDIA_HOST_PROJECTION_AND_RELEASE_LOCK_ONLY
F4=NO_NEW_ICON_TYPOGRAPHY_LOCALE_OR_RTL_SEMANTICS
F5=RESTORE_EXISTING_ROW_REPLAY_AND_EXACT_ROW_SEEK
F6=SHARED_MEDIA_HOST_BEHAVIOR_OWNER
F7=3.11.401_CACHE_BUST_AND_STATIC_ROLLBACK
F8=SERIALIZED_IMPLEMENT_TEST_DEPLOY_OWNER_READBACK
```

This does not reopen VF0–VF4 generally.

## User-visible defect and root cause

Named workflow: open the owner’s Studio-created “Кфар Аза - 1” video material
in Reading Room, replay a row, or tap another row to seek the video.

- Room showed the player but only recovered `176/544` rows by textual alignment;
  it rendered no row media replay buttons and had no usable row seek mapping.
- Studio retained `510/544` exact playable rows for the same material.
- Studio already persists the asserted row/source identity in each sentence’s
  `edit_meta_json._studio_source` (`studio-row-source-v1/v2`).
- `MediaHost.restoreForRows` ignored that persisted identity in Room and retried
  text-only alignment after legitimate table edits. Both symptoms therefore had
  one canonical cause: missing restored row-to-segment projection.
- The first `3.11.400` owner-client gate proved that this specific card predates
  portable row identity. Room’s lite text query also intentionally omitted
  `source_text`, so the remaining exact source-snapshot proof never reached the
  media restore path. `3.11.400` was therefore rejected, not handed off.

## Implementation boundary

Runtime behavior:

- Read the existing `_studio_source` identity without writing it.
- Resolve caption/source IDs and the SHA-bound `asrseg:<sha>:<line>` identity to
  exactly one canonical segment; ambiguous or contradictory identities fail closed.
- Preserve blind segments and missing marks as non-playable holes.
- Replace a weaker mapping only when the proven playable-row coverage is not lower.
- Feed the existing sparse timing builder and existing Room replay/row-seek owner.
- Keep repeat restore idempotent.
- For legacy cards only, lazily read the existing immutable `source_text`; accept
  positional projection only when it matches every canonical segment line, all
  three cardinalities agree, and every independent text anchor already maps to
  the same ordinal. Any changed source snapshot or reordered anchor fails closed.

No CSS, icon, locale, DOM, data writer, schema, migration, provider, audio truth or
navigation behavior is added.

Exact implementation/release/test allowlist:

```text
public/js/media-host.js
public/js/library-ui.js
public/index.html
public/library.html
public/sw.js
server.js
tests/mediaHost.test.js
tests/roomUxVf4ResidualA11y.test.js
tests/visualFoundations.test.js
tests/visualFinishingRoom.test.js
tests/visualFinishingStudioShell.test.js
tests/visualFinishingLearningSurfaces.test.js
scripts/premium/room-media-smoke.js
docs/planning/ROOM_UX_VISUAL_FINISHING_VF5_REGRESSION_CORRECTION_2026_08_17.md
docs/research/room-ux-visual-finishing-vf5/2026-08-17/**
```

## Red/green contract

Red before the runtime change:

- New unit fixture shaped as the owner case expected `persisted-row-identity`
  and `510/544`; the old code left `timingSource` undefined.
- The prior Room browser suite had no saved-row-identity-without-binding case.

Green after the change:

- Unit fixture starts from the false `176/544` Room projection and restores
  `510/544`, refuses row 511, proves no neighbour interpolation, and is idempotent.
- A second unit fixture proves `null source_line_index` cannot become row zero.
- Isolated browser fixture persists 10/12 row identities without an exact binding:
  Room renders 10 replay buttons, clears the false divergence warning, binds the
  media player, and a tap on row 4 seeks to the exact `0.48s` mark.
- A legacy unit fixture reproduces the real `176/544` anchor set and restores
  `510/544` only from an exact source snapshot; changed snapshots and reordered
  anchors fail closed. Its browser twin restores 10/12 and seeks row 4 to `0.60s`.

## Verification

- `node --check public/js/media-host.js` — PASS.
- `node --check scripts/premium/room-media-smoke.js` — PASS.
- `node --test tests/mediaHost.test.js` — PASS `35/35`.
- VF0–VF4/release-lock targeted suite — PASS `74/74`.
- `node tests/i18n.smoke.js` — PASS `233/233`.
- `npm run smoke:room-media` — PASS, including new 10/12 replay and exact row seek.
- `npm run smoke:room-audio-indicator` — PASS unit `3/3`, browser `18/18`.
- `npm run smoke:reader-parity` — PASS.
- `npm run smoke:studio-media-progress` — PASS `4/4`.
- `npm run smoke:studio-ux-maturity` — PASS unit `9/9`, browser `92/92`.
- `npm run smoke:studio-chunks` — PASS all scenarios.
- `npm run smoke:reading-position-corpus` — PASS: Room maturity `17/17`, Studio
  media progress `4/4`, Room media including both new paths, Room UX `99/99`.
- `npm run smoke:media-package` — relevant non-repository tests passed, but the
  aggregate reported 12 pre-existing repository harness failures because the test
  pins migration 48 while current untouched migrations are already at 49. This
  slice changes neither file and the failure occurs before media assertions.

Production convergence, `/healthz`, DB/migration readiness, disk state and owner
client readback: `PENDING_DEPLOYMENT`.

## Compatibility and rollback

- Old HTML/new SW: the new worker precaches `/js/media-host.js?v=401` and
  `/js/library-ui.js?v=401`; an old
  unversioned request still resolves through the current worker/network fallback.
- New HTML/old SW: the `?v=401` URLs cannot match the old precache entries and therefore
  fetches the new deployed asset.
- Missing JS/asset: existing guards keep media controls absent rather than inventing
  row truth; text reading remains available.
- Static rollback: revert the bounded correction commits, restore release `3.11.399`, redeploy,
  and activate that worker. No data rollback is required because the correction
  performs no writes or migrations.
