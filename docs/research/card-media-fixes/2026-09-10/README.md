# Card media source fixes — 2026-09-10

Target release: 3.11.506. Predecessor: ac9abd35 / 3.11.505.

## Scope and causes

- First switch left both players because refresh compared the new ambient passport,
  not the previously rendered source. Pending YouTube creation also survived teardown.
- Local selection was an in-memory flag; it now persists per text, per device, across
  reloads and between Studio and Reading Room. It does not rewrite source provenance.
- Source inspection activated a package and changed ambient workspace/player state.
  It now reads the exact binding without activation. Studio uses that same projection
  as the confirmation dialog, not the composer's potentially different positional map.
- Background composer resolution could replace a restored passport without refreshing
  its player. Those replacements now refresh the source projection.
- Row replay now checks source identity after asynchronous work, cancels stale seeks,
  and reports playback failures visibly. Unconfirmed/changed timing remains fail-closed.
- Library now offers “Including archive”, a restore action, and immediate archive undo.
  Restore changes `is_archived` through the existing local repository; no schema change.

## Local evidence

- `npm test`: 1435 passed, 0 failed.
- `npm run test:api-smoke`: passed, including shell-integrity and removed-route checks.
- Existing reader parity, room media, Studio chunks, media karaoke, Studio karaoke
  gates passed during this change (before the final read-only source resolver refinement).
- `youtube-inline-browser-smoke.cjs`: final local pass after that refinement; real
  YouTube and real local WAV, three switches, local F5/reopen, forward/backward row
  replay with stop boundaries, native playback follow, morphology pause/resume,
  Studio and Room, zero page errors. RU/HE 380px screenshots in `local/` inspected.
- `card-archive-browser-smoke.cjs`: immediate undo and filter/restore passed;
  fixture sentences and `review_log` unchanged. RU/HE 380px screenshots inspected.
- `card-media-owner-fixture-smoke.cjs <local JSON>`: isolated copy, 438 rows,
  425 playable timed rows, unverified binding explained, local F5 persists.
- `card-media-portable-fixture-smoke.cjs <local ZIP>`: verified real Nova import,
  424 rows, 393 playable timed rows; repeated switches and local F5/reopen pass.
  Imported owner-confirmed timing has a different current basis and is honestly
  reported as changed. No confirmation is silently migrated or fabricated.

Both owner-material fixtures explicitly confirm only their isolated test copies to
exercise row controls. Their real videos returned YouTube error 150 in headless Chrome;
this is denial-handling evidence, NOT successful replay of these videos. Real replay
passed separately on the public test video. Owner exports/media are not committed.
No owner `review_log` equality claim: exact equality was checked only in test profiles.

## Release acceptance

3.11.506 / cdd18564 was deployed and repeatedly verified: 71/71 served integrity
assets match; the production inline YouTube/local fixture and archive test passed.
In the owner's profile Hadas first switch showed only the local video; F5 retained
that selection and 425/438 timing. Nova was restored from archive through the new UI.
The original release commit preceded these production checks; this paragraph updates it.

Follow-up: [existing/new-table synchronization plan](../../../planning/YOUTUBE_SYNC_EXISTING_AND_NEW_TABLES_2026_09_10.md).
The fresh Nova JSON differs from the old ZIP: its existing confirmation survives
opening and F5, and real production replay/follow/stop passed on five early/middle/late
intervals without rewriting confirmation. See `sync-source/nova-production.json`.
The owner explicitly confirmed both local videos are full unchanged YouTube copies.
3.11.507 clarifies that source-confirmation route in RU/EN/HE and fixes the source
dialog's mobile border-box sizing; screenshots in `sync-source/` were inspected.
Physical iPhone/VoiceOver acceptance is not claimed.
