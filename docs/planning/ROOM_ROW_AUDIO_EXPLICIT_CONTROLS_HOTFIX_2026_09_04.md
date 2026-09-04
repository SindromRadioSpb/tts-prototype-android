# Reading Room explicit row-audio controls hotfix — 2026-09-04

## Status

Implemented for release `3.11.464`. Production and owner-live acceptance remain separate gates until the scoped release is deployed and the owner repeats the ordinary `Кфар Аза - 2` journey.

## Observed problem

In an open Reading Room text, clicking a translation or transliteration cell implicitly started row TTS. The same row can also contain an explicit original-media replay button in its final cell. A non-button cell therefore behaved as an unlabeled third audio control and made the playback source unpredictable.

## Decision

Rows and content cells are not audio controls. Playback has two explicit, source-specific actions:

1. the action-column `Озвучить строку` button plays row TTS;
2. the final-cell media replay button plays the exact attached media chunk.

Clicking text, whitespace, or another non-button part of a row starts neither source. Word morphology, selection, translation reveal, notes, bookmarks, row highlighting, continuous reading, and exact media timing keep their existing owners.

## Implementation

- Removed the delegated content-cell fallback from `reader-core.attachRowAudio`.
- Retained the delegated `button.row-tts-btn` route and all existing TTS state, cache, karaoke, and accessibility behavior.
- Retained the independent `.smk-row-replay` media route, which already stops event propagation and uses exact mapped timing.
- Removed obsolete per-column tap-to-hear configuration from Reading Room call sites.
- Added a unit contract and browser regression proving a translation-cell click is silent while the explicit TTS button still enters its named loading/playing states.
- Bumped the changed module URLs, shell-integrity manifest, page/service-worker version, and Reading Room footer in lockstep.

## Invariants

- No row, text, media, timing, learning-state, note, bookmark, review-log, or schema data is changed.
- No provider request is made from a content-cell click.
- Explicit TTS and original-media buttons remain separate controls with separate playback implementations.
- Continuous reading may still call the same TTS player programmatically; this hotfix changes pointer activation only.
- Existing unrelated worktree changes and generated screenshots stay outside the release allowlist.

## Verification

- Red contract: the new button-only unit test failed against the former content-cell fallback.
- `node --test tests/roomUxVf4ResidualA11y.test.js tests/visualFinishingLearningSurfaces.test.js tests/readerAudioIndicator.test.js` — 19/19 passed.
- `npm run smoke:room-audio-indicator` — 6/6 unit contracts and 19/19 browser checks passed, including zero TTS requests from a translation-cell click and explicit-button loading/playing states.
- `npm run smoke:room-media` — passed, including exact row seek, replay-control restoration, audio/video parity, and zero page errors.
- `npm run smoke:reader-karaoke` and `npm run smoke:reader-karaoke-words` — 9/9 and 18/18 passed.
- `npm run smoke:reader-parity` — 37 leaf checks and four builder parity cases passed.
- `npm run smoke:i18n` — 233/233 passed; page and service-worker versions agree.
- 380 px screenshot review — explicit TTS button remains visible and named; table has no horizontal overflow.
- Production verification remains pending deployment.

## Acceptance boundary

Automated and browser evidence can establish `TECHNICAL_PASS`. Owner acceptance requires a fresh ordinary production session: open `Кфар Аза - 2`, click Hebrew/transliteration/translation text and row whitespace and confirm silence; click the left TTS button and confirm TTS; click the right media button and confirm only the mapped original-media chunk.
