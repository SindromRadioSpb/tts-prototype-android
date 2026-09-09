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

## Production 3.11.508

Runtime `53d7292c3ebaf23a17ce37e6148f1124ce65272a` served and verified: 71 shell
hashes plus three repeated no-cache version probes. An initial rolling-cutover
hash mismatch was not accepted; the stable retry passed.
`production.json` records five real YouTube replay/follow/stop intervals for each
owner-exported card. Hadas uses its original unverified JSON with no settings save
or confirmation; Nova retains its existing confirmation. Source metadata, rows and
review_log are unchanged in both isolated profiles, including F5. Coverage remains
425/438 and 423/424; no missing timestamps were guessed.
The owner's ordinary browser loaded v508, showed the new playback note and a row
replay button after reload; no owner metadata was modified in this follow-up.
The broader inline production test's first attempt encountered HTTP 502 asset
loads and consequently a missing MediaHost on navigation; it is not counted as a
pass. The runtime container showed zero restarts and OOMKilled=false afterward.
The independent complete retry passed with zero page errors: real player/row
following, forward/back replay, local switching, F5/reopen, repeated compatible
and isolated shell navigation, and Room. See `production-inline.json`.
