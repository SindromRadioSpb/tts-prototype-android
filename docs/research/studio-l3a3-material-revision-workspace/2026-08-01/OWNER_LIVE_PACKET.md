# L3a.3 Material Revision Workspace — owner-live packet

Date: 2026-08-01

Scope: local browser/OPFS only

Implementation baseline: parent `743686ec4c05e89f20d31ceb76a9f43967e0f04a`

Implementation commit: the local commit containing this packet; resolve with `git log -1 --format=%H`

Deployed client: `3.11.287` / `2e8f4bf355a2babc0de619bfca817d1fff74b44f`

Browser migrations: `MIGRATIONS.length=46`; v46 is `MIGRATIONS[45]`

Subsequent P2 final recovery release: `v3.11.296` /
`ead4a550bfe3f1cff6b5980ddbfd9ce106442504`, browser migrations `47` with receipt-only v47.
P2 is COMPLETE / OWNER LIVE PASS and P3 real iPhone continuity is OWNER-ATTESTED COMPLETE; their
evidence is recorded in the P2 and P3 owner-live packets. The broader L3a.3 provider/fault/two-tab
ledger below remains independently scoped and is not silently upgraded by those closures.

## Status boundary

Automated implementation, local gates and production verification are complete through
`v3.11.287`. On 2026-08-02 the owner supplied real-material evidence
showing immutable table revision `v2`, enabled exact follow and the correct synchronized
learning row. This is a **partial owner-live PASS**, not a claim that every provider/fault/
two-tab ceremony below has run. Client `v3.11.287` adds only first-slot positioning and the
compact responsive header and passed the production-base ephemeral browser gate. No production/server schema or data
mutation, new server API, cloud sync, Hermes, L2/L4/L5/L6, or full-media ZIP is in scope.

The local implementation provides:

- one Material Workspace with separate Transcript and Learning Table layers;
- desktop side-by-side layout and explicit 380 px mobile tabs, RU/LTR and HE/RTL;
- first-class immutable material/table/row revisions in browser OPFS SQLite;
- idempotent lazy promotion of legacy `texts/sentences` without mass backfill;
- field authority (`source|provider|user|imported`), locked manual values, provider/model/profile/input SHA and `current|invalidated|conflict` status;
- deterministic caption timing/speaker/text/mapping/provider impact;
- zero-call local commit, targeted subset regeneration, and advanced full-new-version action;
- exact stale-base protection (`TABLE_BASE_STALE`) and atomic compatibility projection;
- fail-closed typed `sentences` CRUD after promotion (`MATERIAL_REVISION_REQUIRED`);
- immutable history selection and prior-version inspection.
- exact cue-to-row Playback Review follow for honest 0/1/N mappings, without guessed
  positional fallback;
- a restrained current/next review stream with the current row anchored as the first
  visible row, plus pause-on-manual-review and explicit resume;
- review presets for Hebrew, niqqud, Latin transliteration, Russian transliteration,
  translation, all fields, and a non-empty custom field set.
- adaptive compact rows: 1/2/3/4/5 visible fields use the full available width, with
  the Russian field spanning the remaining two tracks in the five-field desktop view;
- an explicit mixed legacy-mapping repair preview that distinguishes missing from
  conflicting links, blocks follow and row-to-player seeking until reconciliation,
  and commits one stale-base-protected immutable zero-model revision only after owner
  confirmation.
- a compact title → current state → history/revision header on desktop, with controlled
  two-row wrapping at 380 px and mirrored HE/RTL order.

## Automated evidence

Run from repository root:

```powershell
npm run smoke:material-revision
npm run smoke:material-revision:browser
npm run smoke:material-revision:perf
npm run smoke:media-package
npm run smoke:media-package:browser
npm run smoke:media-package:perf
npm run smoke:studio-chunks
npm run smoke:text-card
npm run smoke:captions-parse
npm run smoke:i18n
```

Observed results in the implementation slice:

- material core/repository/playback review: 17/17 pass;
- production-shaped pure mapping gate: 585/585 candidates, exactly 514 missing and
  71 conflicting legacy links, with byte-identical language fields and field authority;
- desktop + 380 px material browser gate: RU + HE, previous/current/next context,
  first-slot active offset approximately 0.1%, following row visible, compact header
  center-aligned, no horizontal overflow, no page errors,
  zero `/api/translate-table*` calls during open/manual/caption-zero-call saves;
- exact 0/1/N mapping, focused-field follow pause, explicit resume, and translation
  preset all preserve the same revision-history length until an explicit save;
- mixed browser fixture shows `1` missing and `2` conflicts, suppresses false playback
  highlight/seek before confirmation, advances history from v1 to v2 after confirmation,
  and then restores exact `1:N` follow;
- two-field desktop review uses approximately 49.1% + 49.1% of the compact row and the
  five-field Russian cell uses approximately 66.1%, with no unused third-column void;
- compatibility projection retained `stable-s1/stable-s2`, manual RU survived a
  transcript edit, and affected transliteration became `invalidated`;
- material performance: 514-row snapshot ~11 ms, promote ~84 ms, commit ~90 ms,
  2,800-row snapshot ~15 ms, impact ~4 ms, mapping ~10 ms (all below frozen ceilings);
- existing L3a browser/performance, Studio chunks, text-card and captions gates pass;
- full `npm test`: 703 total, 694 pass, 9 fail — the same known baseline class:
  one pre-existing `classicModeRedesign` assertion for absent
  `btnTableCustomizeToggle`, plus eight GCP/provider tests requiring their external
  test configuration. No new material-revision test fails.

Screenshots:

- `screenshots/material-workspace-380-ru.png`
- `screenshots/material-workspace-380-he.png`
- `screenshots/material-workspace-380-he-affected.png`
- `screenshots/material-workspace-desktop-ru.png`

## Owner-live procedure

Use the owner's real 36:17 / 514-row material. Do not use a synthetic fixture as the
final verdict.

1. After deployment, record `git log -1 --format=%H`, verify the actually served version
   `3.11.287`, and verify actual `MIGRATIONS.length=46`.
2. Back up the browser-local library through the existing product backup/export path.
3. Open the saved media material and choose **Редактирование материала**. Confirm that
   open performs no model/provider request and creates exactly one lazy v1 material
   revision. Close/reopen/reload: the same material/revision IDs must remain.
4. At desktop width confirm Transcript and Learning Table are simultaneous layers with
   the player/navigation kept visible. At 380×844 confirm explicit tabs, sticky table
   actions, no horizontal overflow, and usable row fields in RU and HE locales.
5. On the owner's existing real material, first verify the repair preview reports
   `585/585`, `без связи: 514`, `конфликтов: 71`, `локально · 0 вызовов модели`.
   Before confirmation, follow must be disabled, no row may be marked as playing, and
   clicking a legacy-conflicting row must not seek the player. Select **Исправить связи**
   once; confirm history advances from v1 to v2 while all five language fields and their
   manual locks remain byte-identical. Reload and confirm the preview no longer appears.
6. Enable **Следовать за аудио** and play through cues with 1, N and 0 mapped rows.
   Confirm exact mapped rows are highlighted, the selected/current row is the first
   visible row with following context visible, and 0 mapping shows an
   explicit add-row action rather than selecting a guessed row.
7. Focus a field or manually scroll the Learning Table. Confirm automatic follow pauses,
   the field being edited does not jump, and **Вернуться к реплике** resumes exact follow.
   Check every review preset and a custom non-empty field selection.
8. Change one manual RU value and select **Сохранить без модели**. Confirm the network
   log has zero provider calls, history advances by one, reload preserves the value,
   and notes/SRS/audio references attached to unchanged sentence IDs remain intact.
9. Make timing-only and speaker-only transcript edits. Confirm affected-row count is
   zero and a zero-call revision can bind the exact new caption revision.
10. Change text in one mapped caption. Confirm only mapped rows are listed, source-owned
   Hebrew updates, locked manual fields remain unchanged, other affected provider fields
   read **Требует обновления**, and the zero-call save keeps those values without
   pretending they are current.
11. Select each configured provider contract (`gcp`, `madlad`, `google-free`, `gemini`)
   one at a time. Before confirming, record the cost preview, exact row/field count and
   `fallback: OFF`. Confirm only when billing/credentials are intentionally available.
   The response must match every stable request/source index exactly; any cardinality,
   duplicate, missing field or index mismatch must fail without advancing canon.
12. Exercise split and merge. Confirm Workspace shows `MAPPING_REVIEW_REQUIRED` and does
   not enable targeted regeneration until mapping is resolved. Verify honest 0/1/N
   badges; do not accept guessed mappings.
13. Open the same promoted material in two tabs. Commit in tab A, then attempt a commit
    from the old base in tab B. Tab B must show stale-base recovery and must not alter
    the head or compatibility projection.
14. Use **Полная новая версия** only from the advanced disclosure. Confirm explicit cost
    preview, no fallback, one new immutable revision, and that all prior revisions remain
    selectable/readable.
15. Reopen Library/Reader/notes/SRS/Anki/audio surfaces for the material. Confirm no
    orphaned sentence references and that the table player still uses the canonical OPFS
    media binding.

## Stop and report

Stop without workaround if any of the following occurs:

- a new server endpoint/schema/data mutation appears necessary;
- open or local save causes any model/provider call;
- a locked manual field changes without an explicit user edit;
- stable sentence IDs are replaced during an ordinary revision;
- a fault or stale tab advances material head/projection partially;
- targeted regeneration returns a different subset/cardinality or attempts fallback;
- migration count is not exactly 46 before owner-live begins;
- horizontal overflow or unusable controls appear at 380 px or HE/RTL.

## Completion record

Automated production closure:

- Deployed commit: `2e8f4bf355a2babc0de619bfca817d1fff74b44f`
- Container start: `2026-08-02 02:19:01 +03:00`
- Served versions: `APP_VERSION=3.11.287`; `CACHE_VERSION=v3.11.287`
- Health: HTTP 200; app/database/migrations ready
- Disk: `97% / 1.16 GiB free` before cleanup; `77% / 8.42 GiB free` after
  pre-deploy cleanup; `83% / 6.34 GiB free` after deploy; `79% / 7.69 GiB free`
  after separately approved post-deploy cache cleanup; `disk_warn=false`
- Cleanup: 43 pre-deploy and 15 post-deploy unused build-cache records removed;
  Docker reported `7.237 GB + 1.742 GB`; three exact older unreferenced app images
  removed before deploy. Active and newest prior rollback preserved; containers, volumes,
  DB, OPFS and user data untouched.
- Browser/profile: ephemeral Chromium `148.0.7778.96`, Playwright `1.60.0`,
  service workers blocked, synthetic fixture confined to the temporary profile
- Desktop RU: PASS; compact single-line header, active offset approximately `0.07%`,
  following row visible, full context values
- 380 RU/LTR: PASS; no horizontal overflow, controlled header wrap, usable controls
- 380 HE/RTL: PASS; mirrored semantic order, field directions preserved, no overflow
- Sync semantics: exact 0/1/N, manual pause, explicit resume and exact cue seek PASS
- Provider calls: `0`; page errors: `0`
- Verdict: `AUTOMATED PROD PASS`; no release defect/fix commit

Partial owner evidence already recorded:

- Owner-live date/time: 2026-08-02, screenshot evidence
- Browser/device: owner production browser; exact build/device string not recorded
- Revision sequence observed: repaired/current table revision `v2`
- Mapping/follow result: exact follow enabled; synchronized learning row visible
- Verdict: `PARTIAL OWNER PASS`; full provider/fault/two-tab matrix remains open

Complete the remaining fields when the owner performs the full procedure:

- Owner-live date/time:
- Browser/device:
- Real material identity/hash:
- Revision sequence observed:
- Provider subset(s) explicitly confirmed:
- Network request count and request IDs:
- Notes/SRS/audio continuity result:
- Verdict: `PASS | FAIL | BLOCKED`
- Evidence paths:
- Notes:
