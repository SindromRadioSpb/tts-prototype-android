# Automatic YouTube row playback — 3.11.508

Owner-requested follow-up to runtime `6ca306f6` and evidence `fff02af6`.
Source code is in this release commit; this document is engineering evidence,
not transcript/timestamp accuracy scoring. No owner exports are committed.

## Behavior

The confirmation checkbox is removed. A selected YouTube source uses existing
valid table timing without a metadata/settings visit. `unverified` remains
historical assertion provenance; runtime policy is `same-video-default`.
No owner confirmation is fabricated and opening/reloading performs no metadata
migration. Saving source settings records the current basis without a human claim.
Changed saved basis, absent/invalid timing, blind rows, detach and invalid offset
remain guarded. A full unchanged copy needs offset 0; edits/speed changes are not
repaired by this default. The same shared projection serves Studio and Room.

## Local gates

- Four red assertions on the old implementation became green.
- Full `npm test`: 1437 passed, zero failed.
- `npm run test:api-smoke`: passed.
- `youtube-inline-browser-smoke.cjs`: real YouTube and local WAV; no confirmation,
  three source-switch cycles, F5/reopen, per-row forward/back seek/stop, native
  player-to-row following, morphology pause/resume; Studio and Room; zero errors.
- `card-youtube-confirmed-smoke.cjs <private Nova JSON>` with
  `CARD_SYNC_SCREENSHOTS_ONLY=1`: RU/HE 380px source dialog screenshots inspected;
  no checkbox, no overflow. These screenshots do not prove video playback.

Reproduce with `STUDY_VIDEO_ORIGIN` set to the local server or production URL.
`card-media-owner-fixture-smoke.cjs <private Hadas JSON>` now tests the original
unverified card without any fixture-only confirmation, and asserts unchanged
source metadata, rows and review_log. `card-youtube-confirmed-smoke.cjs` accepts
both existing confirmed and default sources and checks five recorded intervals.
Physical Safari/VoiceOver and independently scored timestamp accuracy remain separate.
No user action is needed on these evidence files.
