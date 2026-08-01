# L3a.3 Material Revision Workspace — owner-live packet

Date: 2026-08-01

Scope: local browser/OPFS only

Implementation baseline: parent `743686ec4c05e89f20d31ceb76a9f43967e0f04a`

Implementation commit: the local commit containing this packet; resolve with `git log -1 --format=%H`

Client version: `3.11.284`

Browser migrations: `MIGRATIONS.length=46`; v46 is `MIGRATIONS[45]`

## Status boundary

Automated implementation and local gates are complete. The owner authorized deployment
and production verification on 2026-08-01; deployment evidence is recorded separately
after the actually served client reaches this version. Real-material owner-live is
**not** claimed by the synthetic browser gate. No production/server schema or data
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
- a restrained previous/current/next review context with the current row anchored near
  the second visible slot, plus pause-on-manual-review and explicit resume;
- review presets for Hebrew, niqqud, Latin transliteration, Russian transliteration,
  translation, all fields, and a non-empty custom field set.

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

- material core/repository/playback review: 12/12 pass;
- desktop + 380 px material browser gate: RU + HE, previous/current/next context,
  no horizontal overflow, no page errors,
  zero `/api/translate-table*` calls during open/manual/caption-zero-call saves;
- exact 0/1/N mapping, focused-field follow pause, explicit resume, and translation
  preset all preserve the same revision-history length until an explicit save;
- compatibility projection retained `stable-s1/stable-s2`, manual RU survived a
  transcript edit, and affected transliteration became `invalidated`;
- material performance: 514-row promote ~138 ms, 514-row commit ~122 ms,
  2,800-row snapshot ~16 ms, 2,800-row impact ~5 ms (all below frozen ceilings);
- existing L3a browser/performance, Studio chunks, text-card and captions gates pass;
- full `npm test`: 698 total, 689 pass, 9 fail — the same known baseline class
  after adding three green Playback Review pure tests:
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

1. Before opening the app, record `git log -1 --format=%H`, verify version
   `3.11.284`, and verify actual `MIGRATIONS.length=46`.
2. Back up the browser-local library through the existing product backup/export path.
3. Open the saved media material and choose **Редактирование материала**. Confirm that
   open performs no model/provider request and creates exactly one lazy v1 material
   revision. Close/reopen/reload: the same material/revision IDs must remain.
4. At desktop width confirm Transcript and Learning Table are simultaneous layers with
   the player/navigation kept visible. At 380×844 confirm explicit tabs, sticky table
   actions, no horizontal overflow, and usable row fields in RU and HE locales.
5. Enable **Следовать за аудио** and play through cues with 1, N and 0 mapped rows.
   Confirm exact mapped rows are highlighted, the selected/current row sits near the
   second visible slot with previous and next context visible, and 0 mapping shows an
   explicit add-row action rather than selecting a guessed row.
6. Focus a field or manually scroll the Learning Table. Confirm automatic follow pauses,
   the field being edited does not jump, and **Вернуться к реплике** resumes exact follow.
   Check every review preset and a custom non-empty field selection.
7. Change one manual RU value and select **Сохранить без модели**. Confirm the network
   log has zero provider calls, history advances by one, reload preserves the value,
   and notes/SRS/audio references attached to unchanged sentence IDs remain intact.
8. Make timing-only and speaker-only transcript edits. Confirm affected-row count is
   zero and a zero-call revision can bind the exact new caption revision.
9. Change text in one mapped caption. Confirm only mapped rows are listed, source-owned
   Hebrew updates, locked manual fields remain unchanged, other affected provider fields
   read **Требует обновления**, and the zero-call save keeps those values without
   pretending they are current.
10. Select each configured provider contract (`gcp`, `madlad`, `google-free`, `gemini`)
   one at a time. Before confirming, record the cost preview, exact row/field count and
   `fallback: OFF`. Confirm only when billing/credentials are intentionally available.
   The response must match every stable request/source index exactly; any cardinality,
   duplicate, missing field or index mismatch must fail without advancing canon.
11. Exercise split and merge. Confirm Workspace shows `MAPPING_REVIEW_REQUIRED` and does
   not enable targeted regeneration until mapping is resolved. Verify honest 0/1/N
   badges; do not accept guessed mappings.
12. Open the same promoted material in two tabs. Commit in tab A, then attempt a commit
    from the old base in tab B. Tab B must show stale-base recovery and must not alter
    the head or compatibility projection.
13. Use **Полная новая версия** only from the advanced disclosure. Confirm explicit cost
    preview, no fallback, one new immutable revision, and that all prior revisions remain
    selectable/readable.
14. Reopen Library/Reader/notes/SRS/Anki/audio surfaces for the material. Confirm no
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

Leave blank until the owner performs the procedure:

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
