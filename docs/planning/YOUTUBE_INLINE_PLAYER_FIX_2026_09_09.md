# YouTube inside the full Studio and Reading Room — owner workflow correction

Status: implementation verified locally; production 3.11.499 pending verification.

## Owner case and concrete causes

The owner uses a saved material with a local video, synchronized rows and word morphology. Rebinding it to YouTube should keep that exact working surface: play → follow rows → pause → inspect a word → resume. The owner supplied `https://www.youtube.com/watch?v=PngchpnAS5E` and a zero offset.

Read-only Kapture inspection of the saved source form confirmed the supplied URL, offset 0 and an already checked timing-confirmation field. No owner record was edited. The failure was not a missed confirmation:

1. Both player hosts preferred available local bytes and consulted the editable source only when bytes were absent.
2. The 3.11.498 source-opening action navigated to a reduced text projection instead of the full morphology table.
3. Session/cache restoration could repaint a table without reconnecting its playback source.
4. A YouTube seek with an unknown last-segment end converted `null` to 0 and waited for an impossible clock condition.
5. Separately, the owner's particular URL returns YouTube error 150 in live embedding tests. This restriction cannot be fixed by changing the application player.

## Implemented contract

- `PlaybackSource.playbackAudio` selects the explicit per-card source into a runtime-only passport. It never overwrites the original local-media passport, original clock, rows, manual corrections or SRS history. Explicit detach suppresses legacy YouTube resurrection.
- Studio and Room use their existing full tables and the shared media clock. Confirmed timing uses the selected offset; unconfirmed or changed timing is explained and cannot produce synchronized highlighting/replay.
- Saving a source refreshes the open host. A local-file button provides a reversible, per-session return to the original media; it does not delete or rewrite the saved YouTube binding. The learner can switch back to YouTube.
- The ordinary play button, native YouTube controls, pause, word morphology, row seek and asynchronous row replay stay in the full working surface. Switching cards/sources destroys the old player. Background/page-hide pauses invalidate pending seek intent.
- The source-opening action stays in Studio/Room. The small read-only screen remains an explicit source audition tool, not the normal learner route. Redundant Room video-opening chrome is hidden once the normal media bar exists.
- Chromium keeps its working credentialless embed. Browsers without that capability navigate to `/study-studio.html` or `/study-library.html`: server aliases of the same HTML bytes, with ordinary iframe-compatible headers. They use the same origin, same AccessHandlePool database and same leader/proxy mechanism. There is no database migration or alternate copy of the learner profile.
- The compatible shells and SQLite glue/WASM are hash-covered in the service-worker precache. Main Studio/Room isolation headers remain unchanged. Live isolated → compatible → offline-reload tests retain the same card and VFS.
- YouTube errors have visible recovery: retry, open on YouTube, or use available local media. No embedding-policy workaround or paid transcription was introduced.

Roles applied: R4/R5 retain the existing learner flow and visible recovery; R9 separates timing confirmation from URL storage; R11 preserves full-table morphology and local playback; R12 uses a runtime projection over one source record; R13 keeps the same database and verifies reload/offline preservation; R14 keeps same-origin storage and frame-deny on compatible shells; R16 adds no provider cost.

## Verification

- Red→green source-priority/preservation regression, plus unknown-end seek regression.
- Full unit suite: 1428 tests passed before final release checks; final run recorded with release evidence.
- `youtube-inline-browser-smoke.cjs`: actual OPFS local WAV coexists with the selected YouTube source; source UI pending→confirmed refresh; full Studio and Room real YouTube clock; forwards/backwards row replay; morphology on pause; local/YouTube switching; automatic compatible-shell handoff and saved-session restore; RU/HE at 380 px; zero page errors. This is clock/UI evidence, not transcript-quality certification.
- The same browser runner with `STUDY_VIDEO_ID=PngchpnAS5E` and `STUDY_VIDEO_EXPECT_DENIED=1`: live embed denial and local fallback in both hosts; unchanged rows, manual edit metadata, saved source and `review_log`.
- `youtube-inline-offline-smoke.cjs`: real service-worker install, compatible Studio/Room offline reload, same AccessHandlePool database and exact saved card/rows.
- Existing task/import/package/public-reader browser gate passes with full-table inline playback. Source offset and revision survive clean-profile import and immutable publication projection.
- `smoke:room-media` passes its local-video, exact/partial timing, replay, morphology/scroll and reload regressions. Its harness now reuses the page's initialized DB module instead of importing a second uninitialized module instance; Playwright timeout options use the correct argument position.
- `smoke:reader-parity`, API smoke and 39 release/style lock checks passed. No parity-locked table builder was changed.

Physical iPhone/Safari/PWA/VoiceOver acceptance remains pending. No owner profile write, paid-provider request or owner-content publication is part of this correction.

## Production verification

Pending deployment convergence and live checks. Stable evidence will be recorded under `docs/research/youtube-inline/2026-09-09/`.
