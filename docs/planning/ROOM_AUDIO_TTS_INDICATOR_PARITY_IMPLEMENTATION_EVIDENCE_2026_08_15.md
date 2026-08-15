# Reading Room row-audio indicator parity — implementation evidence

Status: **CLOSED · OWNER ACCEPTED · production 3.11.388**

Consolidated closure:
[`ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`](./ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md).

Date: 2026-08-15

Branch: `main`

Source commit: `adbec0ecfcdfd26b48aabac58131d8438b1e5188`

Source production version: `3.11.387`

Target version: `3.11.388`

Runtime release commit: `86916313df09b307c0c99e7289850b67eaf4294b`

Initial dirty tree: 34 unrelated tracked/untracked entries; all preserved and excluded from the scoped release.

## Outcome

The regression is a presentation/reader integration failure, not missing audio truth. Studio already painted the neutral table marker after render and updated it after successful TTS. Reading Room reused the same table DOM and CSS but never painted the marker. Its fresh-TTS path updated only the in-memory asset key and did not call the canonical browser persistence writer.

The selected repair keeps Studio's visual semantics:

- persisted usable audio → `state-ok` (green);
- no persisted audio → `state-missing` (neutral gray);
- a complete, different voice profile → `state-mismatch` (amber);
- successful fresh TTS repaints immediately and persists by calling the existing `upsertAudioAsset()` and `linkSentenceAudio()` truth writers;
- a reload reads the same default `sentence_audio` link and stays green;
- protected group-corpus audio keeps its protected route; a newly synthesized BYOK asset keeps its public-cache provenance for subsequent playback.

No database schema, migration, audio payload format, progress, bookmark, finished-state, review-log, or recommendation truth changed.

## Evidence separation

### Owner report

For `Position 1. אושר כהן - כולם גנבים`, Studio showed green indicators for every row. Reading Room showed neutral indicators even though playback worked, and fresh TTS did not repaint the marker.

### Owner-live production, read-only

Inspected the existing authorized production tab at `https://linguistpro.kolosei.com/library.html` without navigating destructive controls. Served version was `3.11.387`. A read-only LocalDB query found:

- title: `Position 1. אושר כהן - כולם גנבים`;
- 42 sentence rows;
- 42/42 default `audio_asset_key` values;
- 42/42 `audio_tts_profile_json` values;
- the text profile and sampled row profiles identify the existing Hebrew TTS voice/rate/pitch.

This proves that the gray Room markers were not an honest representation of stored audio truth. Owner data writes: none.

### Code evidence

- `reader-core.js` emits `<span class="row-audio-ind">` in the shared, parity-locked table builder.
- Studio's `v3AudioPrefetchUpdateMarkerForRow()` paints `state-ok`, `state-missing`, `state-mismatch`, and the Studio-only prefetch `state-too-long` state.
- Studio's fresh-TTS path updates the row model, paints immediately, and calls the LocalDB audio writers.
- Reading Room's `attachReaderAudio()` previously attached playback only; no marker painter or post-TTS persistence callback existed.
- Server-side TTS persistence is best-effort server truth and cannot replace the browser-owned OPFS `sentence_audio` link.
- The browser LocalDB conflict handlers were weaker than the existing server repository: an existing non-default sentence/audio link was not promoted, and missing asset profile metadata was not refreshed. The repair aligns those existing canonical writers without changing schema.

### Isolated automation

`npm run smoke:room-audio-indicator` uses fixture-only OPFS records and a mocked BYOK TTS response. It proves Studio reference state, initial Room state, post-TTS repaint, canonical writer read-back, reload persistence, accessible non-color text, 380px reflow, and no page errors. It is not owner-live or physical-device evidence.

Visual screenshots were inspected at 380×844 in RU/LTR and HE/RTL. The indicator remains in the established first service column; no CSS redesign or horizontal page overflow was introduced.

## Alternatives and role synthesis

| Option | R4 learner expectation | R11 truth/reliability | R12 ownership | Decision |
|---|---|---|---|---|
| Remove the Room indicator | Loses an already learned Studio affordance | Hides useful readiness truth | Avoids rather than repairs the reader | Rejected |
| Room-only `assetKey → green` painter | Fixes first render only | Fresh TTS/reload can still drift | Duplicates a partial contract | Rejected |
| Shared typed state + Room decorator + canonical writer callback | Predictable across surfaces | Immediate state and reload truth agree | One persistence API; no second writer | Selected |

The marker also receives a localized accessible name in RU/EN/HE, so readiness is not communicated by color alone. This is a non-visual premium/a11y completion; Studio's existing core audio behavior did not require redesign.

## Verification

PASS:

- syntax checks: `reader-core.js`, `library-ui.js`, `local-db.js`, focused smoke;
- `tests/readerAudioIndicator.test.js`: 2/2;
- `scripts/premium/room-audio-indicator-smoke.js`: 11/11 RU and 11/11 HE/RTL;
- `tests/i18n.smoke.js`: 233/233;
- `tests/roomUxMaturity.test.js`: 17/17 plus focused tests (19/19 combined);
- `reader-parity-smoke.js`: shared builder golden PASS;
- `room-media-smoke.js`: PASS;
- `group-corpus-ui-smoke.js`: PASS at 380/510/1280;
- `group-song-corpus-smoke.js`: PASS;
- 380×844 RU/LTR and HE/RTL screenshots: visually inspected, no page overflow.

The legacy full `room-study-smoke.js` is not a release gate for this slice: its indicator-adjacent resize/service-column phases passed, but later repeat-entry/layout assertions use a pre-Library-IA navigation/geometry assumption and are already stale. The file was left unchanged. The focused regression gate covers the changed contract directly.

### Production and owner-live verification

PASS after the production rollout of `3.11.388`:

- `/healthz` reported the application, database, and migrations ready;
- `/api/client-config` and the Library footer both reported `3.11.388`;
- GitHub `main`, local `main`, and the runtime release commit matched `86916313df09b307c0c99e7289850b67eaf4294b` before this evidence-only follow-up;
- the waiting service worker was activated without using the reader update action, avoiding its progress-flush path;
- after a normal reload the authorized tab restored `Position 1. אושר כהן - כולם גנבים`;
- all 42 row markers were `row-audio-ind state-ok`; none were `state-missing`;
- the first marker exposed `role="img"` and the localized accessible label `Аудио готово • he-IL / he-IL-Standard-A • rate 0.8 • pitch 2.5`;
- a Kapture screenshot visually confirmed the green marker in the established first service column;
- page width was 1905px of 1905px: no horizontal page overflow;
- no new JavaScript exception was observed. Two existing optional Ben-Yehuda shard requests (`context/2.json` and `proclitic/2.json`) returned 404 and were not introduced by this slice.

Owner-data read-back was identical immediately before and after service-worker activation and reload:

- `text_progress`: row `0`, no step, unfinished, `updated_at=2026-08-15T12:15:07.680Z`;
- total `review_log`: `7319`;
- target-text bookmarks: `0`;
- target-text default audio links: `42`.

No owner TTS action was invoked in production. The state-changing fresh-TTS callback was verified only in isolated automation; owner-live verification remained read-only with respect to learning and audio data.

### Owner acceptance and closure

The owner subsequently performed the state-changing production scenario and
reported PASS on all three requested observations:

- every marker for `Position 1. אושר כהן - כולם גנבים` is green;
- after fresh TTS, a gray marker becomes green immediately;
- the green state survives reload.

This is owner-reported production evidence. Exact device/browser/AT metadata was
not supplied, so it does not broaden the existing physical-device or assistive-
technology claims. The owner explicitly directed documentary closure on
2026-08-15; this slice is closed.

## Release boundary

Runtime:

- `public/js/reader-core.js`
- `public/js/library-ui.js`
- `public/db/local-db.js`
- `public/i18n/locales/{ru,en,he}.js`
- `public/index.html`
- `public/library.html`
- `public/sw.js`

Verification:

- `tests/readerAudioIndicator.test.js`
- `scripts/premium/room-audio-indicator-smoke.js`
- `tests/i18n.locale-version.lock.json`
- `package.json` (focused smoke command only)

Evidence: this file.

Rollback is one scoped commit. No down-migration or data repair is needed: new audio links use the pre-existing tables and are backward compatible. A rollback leaves already valid audio metadata intact.
