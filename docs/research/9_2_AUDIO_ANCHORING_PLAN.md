# Direction 9 Phase 9.2 — Audio Anchoring Plan

**Branch:** `phase-9-2-audio-anchoring` (base = `main@da1d186` after 9.1.F deploy).
**Date:** 2026-05-11.
**Goal (M2):** A note can be pinned to a specific moment within a sentence's TTS audio, with persistence, replay-from-anchor, visual indicators, bundle preservation, dark mode, i18n, a11y, and tests — all at premium-product quality.

---

## What's already shipped (Foundation, Phase 9.1)

- `notes_v2.audio_anchor_ms INTEGER` column (migration 021) + partial index `ix_notes_v2_audio` on non-null.
- `createNote` / `updateNote` accept and round `audio_anchor_ms` as part of the patch.
- Bundle export/import roundtrip preserves it (`_buildAdvancedNotesPayload` / `_applyAdvancedNotesPayload`).
- Smart-collection `audioNoted` counts and filters notes with anchors (`getNotesSmartCollectionsSummary`, `getTextIdsForNotesSmartChip('audio-noted')`).
- Library smart-chip "📍 Audio-noted" wired in 9.1.C Stage E.

**Net:** the data layer is feature-complete; this phase is exclusively the UX layer + edge cases + tests.

---

## UX design

### Where the anchor lives

A new compact row inside `v3NotesMetaBar`, between the target/type segments and the body, shown **only when** `target_kind ∈ {sentence, word}` AND the modal has a row context (`v3NotesModalSentenceId`).

### Two states

**Unanchored** (`audio_anchor_ms == null`):

```
🎧 Аудио: [📍 Привязать к текущему моменту]
```

- Button disabled if Row TTS audio for this row is not loaded (paused or never played).
- Tooltip when disabled: "Сначала проиграйте аудио строки".
- On click: captures `rowAudioPlayer.currentTime`, rounds to ms, persists via `updateNote` (or creates note first if it doesn't exist yet, then sets anchor).

**Anchored** (`audio_anchor_ms != null`):

```
🎧 Аудио: [📍 0:04.5 ▶︎]  [✕]
```

- Timestamp chip is clickable — seeks rowAudio to `audio_anchor_ms` and plays. Uses HEAD pre-flight (same robustness as 9.1.F Row TTS fallback).
- "✕" clears the anchor (with confirm if user prefers — for v3.2 just immediate, anchors are cheap to recreate).

### Visual indicators on Row TTS / Notes badge

When a sentence's note has `audio_anchor_ms != null`, the row's notes badge gets a 📍 prefix and tooltip "Заметка с привязкой к 0:04.5". Existing `v3NotesUpdateButtonRow` already handles badge rendering; extend to pull anchor metadata.

### Premium polish

- Live current-time display in unanchored state when audio is actively playing for this row: button label updates each `timeupdate` event ("📍 Привязать к 0:01.3" → "0:01.4" → …). On click captures whichever moment was visible. Differentiates this from a static button — feels alive.
- After anchoring: toast "Привязано к 0:04.5". After clearing: "Привязка снята".
- Keyboard shortcut **Alt+A** sets/toggles the anchor while modal is focused (a11y).
- Dark mode: chip uses `--theme-bg-muted` + `--theme-text-primary` (per 9.1.F precedent).
- RTL: timestamp digit display uses tabular-nums + `direction: ltr` on the chip so "0:04.5" doesn't reverse in HE locale.

### Auto-save interaction

Setting/clearing an anchor is a discrete action — bypasses the 30s debounced body auto-save and persists immediately. If the note doesn't yet exist (modal opened for a fresh sentence-bound row, body still empty), set-anchor first creates the note (with empty body), then sets the anchor — body can be filled in later.

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| Anchor `ms` > audio duration on replay | Clamp to `duration - 0.1s` before seek; toast "Аудио короче привязки, играю с конца". |
| Set anchor when no body and target_kind=free | Hide anchor row; only sentence/word need it. |
| Imported bundle anchors a key that's missing from server cache | Replay uses 9.1.F HEAD pre-flight → falls through to fresh `/api/tts` regen, then seeks. |
| Audio not played yet for this row + user clicks anchor | Toast "Сначала проиграйте аудио строки" + offer "Play and anchor at start". Future enhancement; v3.2 just toast. |
| Multiple notes anchor different moments on same row | Allowed (one anchor per note; rows can have multiple notes). Badge sorts by timestamp asc. |

---

## Files to touch

| File | Change |
|------|--------|
| `public/index.html` | New anchor row HTML inside `v3NotesMetaBar`; `v3NotesAnchorSet/Clear/Play/UpdateUI` JS handlers; live-time timer when audio playing for this row; Alt+A hotkey; row badge prefix. |
| `public/index.html` (CSS) | `.v3-notes-anchor-row` + `.v3-notes-anchor-chip` + active/disabled states + dark-mode + RTL handling. |
| `public/db/notes-v2-test.html` | 3 new tests: setNote with anchor persists; updateNote can null it; bundle roundtrip preserves anchor. |
| `public/i18n/locales/{ru,en,he}.js` | 8 new keys × 3 locales. |
| `docs/PREMIUM_NOTES_PLAN_v3_2.md` | Flip 9.2 to `[x]` after closure. |
| `CHANGELOG.md` | Add 9.2 entry. |
| `docs/research/9_2_AUDIO_ANCHORING_REPORT.md` | Closure record (after impl). |

---

## Acceptance criteria

1. Open Notes modal for a sentence-bound row, audio played → anchor button shows live current-time.
2. Click anchor → note saved with `audio_anchor_ms = currentTime*1000`; chip flips to "📍 0:04.5 ▶︎". Toast confirms.
3. Close and reopen modal → anchor chip still shows the same timestamp.
4. Click chip → audio seeks to anchor and plays.
5. Click ✕ → anchor cleared; chip back to "Привязать к текущему моменту".
6. Export bundle → reimport → anchor preserved.
7. Smart-chip "📍 Audio-noted" in Library shows texts containing anchored notes.
8. Dark mode: chip readable. RU/EN/HE: all labels translated. RTL: digits LTR within chip.
9. **43/43 + N notes-v2** tests + **23/23** events + 0 new JS errors.
10. Remote smoke on Railway prod (same protocol as 9.1.F) — all pass.

---

## Estimated effort

2.5 days (per master plan ~2–3 d). Phase boundary: 9.2.A audit + plan (this doc) → 9.2.B impl → 9.2.C tests + docs → 9.2.D dogfood + report → merge to main + deploy.
