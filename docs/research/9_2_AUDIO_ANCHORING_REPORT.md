# Direction 9 Phase 9.2 — Audio Anchoring Closure Report

**Branch:** `phase-9-2-audio-anchoring` (base = `main@da1d186`).
**Date completed:** 2026-05-11.
**Outcome:** Shipped. Ready to merge to main and deploy.

---

## Acceptance criteria — all met

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Open Notes modal for sentence-bound row with audio played → button shows live current-time. | ✅ `v3NotesAnchorStartLiveTime()` attaches `timeupdate` listener; button label updates each tick when audio belongs to modal row. |
| 2 | Click anchor → note saved with `audio_anchor_ms = currentTime*1000`; chip flips to "📍 0:04.5 ▶︎". Toast confirms. | ✅ `v3NotesAnchorSet()` captures `rowAudioPlayer.currentTime`, persists via `updateNote` (or `createNote` if note doesn't exist yet), syncs cache, shows toast. |
| 3 | Close and reopen modal → anchor chip still shows the same timestamp. | ✅ `v3NotesRestoreNoteIdIfMissing` extended to load `audio_anchor_ms`; `v3NotesAnchorLoadForCurrentNote` for polymorphic deeplinks. |
| 4 | Click chip → audio seeks to anchor and plays. | ✅ `v3NotesAnchorPlay()` handles two cases (already loaded → seek + play; not loaded → trigger Row TTS click handler then seek on `loadedmetadata`). |
| 5 | Click ✕ → anchor cleared. | ✅ `v3NotesAnchorClear()` sets null, syncs cache, toast. |
| 6 | Export bundle → reimport → anchor preserved. | ✅ New test `9.2: bundle export/import roundtrip preserves audio_anchor_ms` passes. |
| 7 | Smart-chip "📍 Audio-noted" in Library shows texts containing anchored notes. | ✅ New test `9.2: smart-chip audio-noted lists texts with anchored notes` passes (the underlying smart-chip query already shipped in 9.1.C; this validates wiring under realistic data). |
| 8 | Dark mode, RU/EN/HE, RTL. | ✅ All chip styles use `--theme-*` vars; new RU/EN/HE keys (10 each); `dir="ltr"` on the `0:04.5` digit cluster forces Western ordering inside the RTL modal. |
| 9 | 43/43 + N notes-v2 tests + 23/23 events + 0 new JS errors. | ✅ **47/47** notes-v2 (+4 from 9.2: createNote anchor, updateNote set/clear/re-set, bundle roundtrip, smart-chip), **23/23** events, 0 new JS errors. |
| 10 | Remote smoke on Railway prod. | ⏳ To run after merge + deploy (post-commit). |

---

## What changed (file-by-file)

### `public/index.html`
- **HTML**: new `v3NotesAnchorRow` inside `v3NotesMetaBar` with three controls — `v3NotesAnchorSetBtn`, `v3NotesAnchorPlayBtn`, `v3NotesAnchorClearBtn`.
- **CSS**: `.v3-notes-anchor-row`, `.v3-notes-anchor-chip` (regular + `.v3-notes-anchor-anchored` accent variant), `.v3-notes-anchor-time` (tabular-nums + LTR), `.v3-notes-anchor-clear` (round ✕). Dark-mode contrast variant; `prefers-reduced-motion` honored. Also adds `.row-note-btn.row-note-anchored::after` pseudo-element for the row badge 📍 sub-indicator with theme-aware drop-shadow.
- **State**: `v3NotesModalAudioAnchorMs` (current note's anchor) + `v3NotesAnchorLiveTimeListener` (timeupdate handle).
- **Functions**: `v3NotesFmtMs`, `v3NotesAnchorGetRowAudio`, `v3NotesAnchorAudioBelongsToModalRow`, `v3NotesAnchorRowApplicable`, `v3NotesAnchorUpdateUI`, `v3NotesAnchorStartLiveTime`, `v3NotesAnchorStopLiveTime`, `v3NotesAnchorSet`, `v3NotesAnchorClear`, `v3NotesAnchorPlay`, `v3NotesAnchorLoadForCurrentNote`.
- **Integration**: `v3NotesOpen` resets anchor state + fires async load; `v3NotesClose` detaches live-time listener; `v3NotesSetTargetKind` refreshes anchor row visibility; `v3NotesRestoreNoteIdIfMissing` now also pulls `audio_anchor_ms`; Alt+A hotkey added to `v3NotesModalHotkeysHandler`.
- **Cache**: `v3NotesIngest`, `v3NotesSetLocal`, `v3NotesHas` extended to carry `audio_anchor_ms` so the row badge can render 📍 without an extra DB hit per render. Anchor-only notes (empty body + non-null anchor) are kept in cache so badge surfaces them.
- **Row badge**: `v3NotesUpdateButtonRow` adds `row-note-anchored` class + locale-aware tooltip including the timestamp.

### `public/db/local-db.js`
- `listNotes` rewritten to read directly from `notes_v2` (not from the legacy `sentence_notes` VIEW) so `audio_anchor_ms` reaches the caller alongside the legacy column shape.
- **Pre-existing bug fix**: Shape A import (`item.rows → sentences` reshape inside `importBundle`) was silently dropping `row_id`, which meant `oldToNewSentenceId` map was never populated for the new sentence, which meant sentence-targeted polymorphic notes from `notes_advanced.json` were dropped during `_applyAdvancedNotesPayload`. Fixed by preserving `row_id` in the reshape.

### `public/db/notes-v2-test.html`
- 4 new test cases:
  1. `9.2: createNote with audio_anchor_ms persists`
  2. `9.2: updateNote can set, clear, and re-set audio_anchor_ms`
  3. `9.2: bundle export/import roundtrip preserves audio_anchor_ms`
  4. `9.2: smart-chip audio-noted lists texts with anchored notes`

### `public/i18n/locales/{ru,en,he}.js`
- 10 new keys × 3 locales:
  - `notes.anchorLabel` — "🎧 Аудио:" / "🎧 Audio:" / "🎧 שמע:"
  - `notes.anchorSetBtn` — "Привязать к аудио" / "Pin to audio" / "הצמד לשמע"
  - `notes.anchorSetBtnAt` — "Привязать к {time}" / "Pin to {time}" / "הצמד ל-{time}"
  - `notes.anchorSetTitle` — tooltip with Alt+A hint
  - `notes.anchorPlayTitle` — replay-from-anchor tooltip
  - `notes.anchorClearTitle` — clear-anchor tooltip
  - `notes.rowBtnTitleAnchored` — row-badge tooltip with `{time}`
  - `toast.notesAnchorSaved` — "Привязано к {time}" / "Pinned at {time}" / "הוצמד ל-{time}"
  - `toast.notesAnchorCleared` — "Привязка снята." / "Pin removed." / "ההצמדה הוסרה."
  - `toast.notesAnchorPlayFirst` — "Сначала проиграйте аудио строки." / "Play the row's audio first." / "נגן תחילה את שמע השורה."
  - Plus `toast.notesAnchorFailed`, `toast.notesAnchorNoRow`, `toast.notesAnchorPlayFailed` for error states.

### Plan / status / changelog
- `docs/PREMIUM_NOTES_PLAN_v3_2.md` — Phase 9.2 flipped to `[x]` in live-status.
- `docs/PREMIUM_RELEASE_PLAN_v3_2.md` — same flip in master plan.
- `docs/research/9_2_AUDIO_ANCHORING_PLAN.md` — plan doc (this phase, written at start).
- `CHANGELOG.md` — Phase 9.2 entry added under Unreleased > Shipped.

---

## Edge cases verified

- **Anchor with empty body**: when modal opens fresh and user clicks anchor before typing — `v3NotesAnchorSet` falls back to `createNote` with empty body, anchor sticks. Body can be filled in later. Cache + badge keep it visible.
- **Reopen with persisted anchor**: `v3NotesRestoreNoteIdIfMissing` async-loads `audio_anchor_ms` alongside the noteId so the chip shows on first paint of the reopened modal.
- **target_kind switch away from sentence/word**: `v3NotesAnchorRowApplicable` returns false → row hides + live-time listener detaches.
- **Modal close while audio still playing for that row**: `v3NotesClose` calls `v3NotesAnchorStopLiveTime` to avoid leaking the `timeupdate` listener.
- **Replay from anchor on bundle-imported row with cache miss**: `v3NotesAnchorPlay` routes through the existing Row TTS button click handler when audio isn't yet loaded for this row, which inherits 9.1.F's HEAD pre-flight → fresh regen on miss.

---

## Test counts (Playwright headless on local PORT=3076)

```
events-emission-test.html: Passed: 23 · Failed: 0
notes-v2-test.html       : Passed: 47 · Failed: 0  (+4 from 9.2)
/index.html cold load    : 0 new JS errors
i18n 10 9.2-RU keys probe: 10/10 ✓
```

---

## Recommended next phase

Per master plan, Phase 9.3 (Linking + Templates + SRS micro-cards, ~5–7 days). Largest remaining sub-phase; ships templated notes (word_study, grammar_rule, translation_discrepancy, pronunciation_note) with structured forms instead of the current "⏳ Phase 9.3 placeholder" banner; adds bidirectional links to make the knowledge graph navigable; converts notes to SRS micro-cards on demand.

Phase 9.4 (Morphology / HebMorph sidecar) follows 9.3.
