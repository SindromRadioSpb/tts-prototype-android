# VF5 bounded Room row-media regression correction

Artifact date: `2026-08-17`

## Evidence passport

- Baseline: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`, equal to
  local and remote `origin/main` at start; branch `main`.
- Baseline production/client: API/Studio/Room/SW and owner Chrome `3.11.399`.
- Final target: `3.11.403`.
- Production URLs: `https://linguistpro.kolosei.com/library.html`,
  `https://linguistpro.kolosei.com/index.html`.
- Dirty state: 34 pre-existing unrelated entries plus unrelated untracked work
  preserved; the scoped diff is enumerated below.
- Evidence classes: `OWNER_SUPPLIED_PRODUCTION_SCREENSHOT`, `CODE_CURRENT`,
  `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`, `PRODUCTION_CURRENT` and
  `OWNER_CLIENT_KAPTURE_READ_ONLY`.
- Limitations: no physical-device or screen-reader execution. Owner-live
  interaction that would change a reading row is not used as verification.
- Safety: no schema/migration/provider changes and no invented timing. The only
  owner-data action was the separately confirmed delete/reimport of the exact
  `Кфар Аза - 1` card through existing Import Center writers.

## Decision change

The `2026-08-16` VF5 `NO_GO_KEEP_PROGRAM_CLOSED` conclusion remains an accurate
historical decision. New owner production evidence on `2026-08-17` crosses the
re-entry threshold for exactly one `REGRESSION_CORRECTION_ONLY` slice:

```text
F1=REGRESSION_CORRECTION_ONLY
F2=ROOM_RESTORE_CANONICAL_MEDIA_IDENTITY_AND_REPAIR_OWNER_PACKAGE_BINDING
F3=MEDIA_HOST_PROJECTION_PLUS_ONE_OWNER_AUTHORIZED_CARD_REIMPORT
F4=NO_NEW_ICON_TYPOGRAPHY_LOCALE_OR_RTL_SEMANTICS
F5=RESTORE_EXISTING_ROW_REPLAY_AND_EXACT_ROW_SEEK
F6=SHARED_MEDIA_HOST_BEHAVIOR_OWNER
F7=3.11.403_CACHE_BUST_AND_STATIC_ROLLBACK
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
- The `3.11.400`–`3.11.402` owner-client gates proved that the specific old card
  was absent from Import Center and therefore had no canonical portable learning
  material/exact binding for Room to activate. Source-only positional fallbacks
  did not repair that missing ownership edge and were rejected.
- The owner then authorized deletion of only card
  `47452a86-f768-49ce-8b66-8073f42e8cff` and reimport of the named archive and
  MP4. Archive SHA was
  `2E28D783B445159D8B8E5F4B2B1AD439A3F30C36A895DBF3200A7D1D211F46AD`;
  MP4 SHA was
  `0E1FC51D042CC52BDF074AF0206CAA7C105ECAC013EAFE659BB41B3D82B21EDF`,
  exactly equal to the archive media reference.
- Import created card
  `text-portable:e126b2f417d47780cf8275333969e236c09c8e878e590ae10ef537255568db9a`
  and receipt
  `portable-receipt:8ec27a409c8bdf5337839892d27d93530344d8ae87377ec60ae80f311e9ae136`.
  History reports `complete`, `media_available=true`, `1.mp4` and the exact MP4
  SHA; therefore no manual relink button was correctly shown.

## Implementation boundary

Runtime behavior:

- Read the existing `_studio_source` identity without writing it.
- Resolve caption/source IDs and the SHA-bound `asrseg:<sha>:<line>` identity to
  exactly one canonical segment; ambiguous or contradictory identities fail closed.
- Preserve blind segments and missing marks as non-playable holes.
- Replace a weaker mapping only when the proven playable-row coverage is not lower.
- Feed the existing sparse timing builder and existing Room replay/row-seek owner.
- Keep repeat restore idempotent.
- The speculative `source_text` hydration and source-snapshot positional restore
  shipped in the rejected `3.11.401`/`3.11.402` candidates were removed before
  the final release. `3.11.403` retains only the canonical persisted-row-identity
  correction plus the existing exact-binding activation path.

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
- The discarded source-snapshot fixtures were removed with their runtime branch;
  final verification exercises only exact binding and persisted row identity.

## Verification

- `node --check public/js/media-host.js` — PASS.
- `node --check scripts/premium/room-media-smoke.js` — PASS.
- `node --test tests/mediaHost.test.js` — PASS `33/33`.
- VF0–VF4/release-lock targeted suite — PASS `42/42`.
- `node tests/i18n.smoke.js` — PASS `233/233`.
- `npm run smoke:room-media` — PASS, including new 10/12 replay and exact row seek.
- `npm run smoke:room-audio-indicator` — PASS unit `3/3`, browser `18/18`.
- `npm run smoke:reader-parity` — PASS.
- `npm run smoke:studio-media-progress` — PASS `4/4`.
- `npm run smoke:studio-ux-maturity` — PASS unit `9/9`, browser `92/92`.
- `npm run smoke:studio-chunks` — PASS all scenarios.
- `npm run smoke:reading-position-corpus` — PASS: Room maturity `17/17`, Studio
  media progress `4/4`, Room media including persisted identity, Room UX `99/99`.
- `npm run smoke:media-package` — relevant non-repository tests passed, but the
  aggregate reported 12 pre-existing repository harness failures because the test
  pins migration 48 while current untouched migrations are already at 49. This
  slice changes neither file and the failure occurs before media assertions.

Pre-final owner-client readback on production `3.11.402` after the authorized
reimport: Studio `544` rows / `544` active replay controls / one video; Room
`544` rows / `510` canonical playable replay controls / local video blob / empty
warning. Owner-live playback/tap-seek was not invoked because it would write the
reading position; isolated Room automation proves row 4 seeks to exact `0.48s`.

## Production and owner-client closure

- Runtime commit: `05586614da80ad47a7f30ec6524d453fb83f4f6e`.
- Coolify manual deployment: `Success`, started `2026-08-17 19:23:00 UTC`,
  ended `19:24:18 UTC`, duration `01m 18s`; active application commit matched
  `05586614da80ad47a7f30ec6524d453fb83f4f6e`.
- API `/api/client-config`, Studio, Room and SW converged on `3.11.403`.
- `/healthz`: `ok=true`, DB ready, migrations ready, disk `75%`,
  `disk_warn=false`; no cleanup was performed.
- The visible owner-client `Обновить` action was clicked. The connected owner
  Chrome/Kapture tab then reported footer `3.11.403`, no update action, 544
  indexed rows, 510 enabled replay controls, a local blob video, empty media
  warning, no horizontal overflow and zero active playback rows.
- A fresh Studio tab in the same owner profile reported `3.11.403`, the restored
  card, 544 indexed rows, 544 enabled replay controls, one video, no horizontal
  overflow and no console errors.
- Owner-live playback/tap-seek remained intentionally not run because it would
  write reading position. Isolated automation proves the shared event owner seeks
  row 4 to exact `0.48s`.
- Room console contained only pre-existing optional Ben-Yehuda sidecar 404s for
  `context/126.json` and `proclitic/126.json`; no error referenced the restored
  card, media blob, MediaHost or Import Center.
- The primary owner tab was returned to
  `https://linguistpro.kolosei.com/library.html#room=mytexts`; diagnostic tabs
  were closed.

## Compatibility and rollback

- Old HTML/new SW: the new worker precaches `/js/media-host.js?v=403` and
  `/js/library-ui.js?v=403`; an old
  unversioned request still resolves through the current worker/network fallback.
- New HTML/old SW: the `?v=403` URLs cannot match the old precache entries and therefore
  fetches the new deployed asset.
- Missing JS/asset: existing guards keep media controls absent rather than inventing
  row truth; text reading remains available.
- Static runtime rollback: revert the bounded correction commits, restore release
  `3.11.399`, redeploy and activate that worker. The separately imported card is
  canonical owner data and is not part of runtime rollback; deleting it again
  would require a new explicit owner instruction.
