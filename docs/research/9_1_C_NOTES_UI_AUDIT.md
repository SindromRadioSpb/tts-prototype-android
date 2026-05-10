# Phase 9.1.C — Notes Modal UI Audit (Stage A)

**Date:** 2026-05-10
**Branch:** `worktree-agent-ad33453576637a27d` (Direction 9.1.C worktree, base = `main@a6a570c`)
**Scope:** Inventory current notes UI/state, map all entry points, surface integration plan + risks before Stage B (target picker).

---

## 1. DOM surface (current modal)

`#v3NotesModal` lives at `public/index.html:8338-8390`. Structure:

| Region | IDs / hooks | Purpose |
|--------|-------------|---------|
| Backdrop | inline `onclick="v3NotesClose()"` | Click-to-close |
| Header | `.v3-modal-title` (literal RU string) + `.btn-secondary` close | Static title — "Заметка к строке (Ctrl+Enter — сохранить)" |
| Status | `#v3NotesStatus` | "Сохранено в …" timestamp |
| Toolbar | 7 markdown buttons + `#v3NotesPreviewToggleBtn` | `v3NotesMdCmd('bold'|'italic'|'code'|'highlight'|'ul'|'quote'|'link')` + preview toggle |
| Editor | `<textarea id="v3NotesText" maxlength="16000">` | Free-form markdown body |
| Preview | `#v3NotesPreview` (hidden by default) | Sanitised HTML render via `v3NotesMdToSafeHtml` |
| Help | inline RU markdown legend | Static |
| Actions | `#v3NotesDeleteBtn`, `#v3NotesSaveBtn` | Save / Delete |

No `target_kind` / `note_type` selectors, no history affordance, no backlinks panel, no anchored-audio button. Cap is **16 000** chars — Phase 9.1.A bumped DB cap to **65 536** via D5, so the textarea attribute is stale.

## 2. JS state + helpers

**Module-level state (`public/index.html:10997-11017`)**

- `v3NotesActiveTextId` — current text in editor
- `v3NotesBySentenceId` — `{ [sentenceId]: { note, updatedAt } }` in-memory cache
- `v3NotesModalTextId / SentenceId / RowIdx / OriginalText / IsDirty / HotkeysHandler / OriginalValue` — modal-scoped open state
- `v3NotesPreviewVisible` — markdown preview toggle
- `v3NotesHotkeyHandler` (declared but unused in current build)

**Helpers — three clusters:**

- *Cache layer* (`v3NotesReset / Ingest / Has / Get / GetUpdatedAt / SetLocal / RefreshAllButtons`)
- *Modal lifecycle* (`v3NotesEl / IsOpen / Open / Close / ForceClose / Save / Delete / UpdateButtonRow / BindHotkeysOnce / Md*`)
- *Jump + search* (`v3NotesOpenForJump / EnsureFetchedForText / FindRowIdxBySentenceId / FlashRow / EnsureSentenceContext / SelectNeedleInTextarea / PickNeedle / FlashTextarea`)
- *Library/Dashboard notes search* (`v3NotesSearchSchedule / Now / Render / Hide / GetState / OnToggleChange / BindClicksOnce / MakeSnippet / Mark / ExtractNeedles / RegexEscape / SyncUi / TimerLib / TimerDash / LastKey* / ClicksBound*`)

## 3. Entry points (every place the modal opens)

| # | Caller | Path | Notes |
|---|--------|------|-------|
| 1 | Classic-table row button | delegated click handler at `30083-30108`, calls `v3NotesOpen(textId, sentenceId, rowIdx)` | Default 90% case |
| 2 | Library / Dashboard search "Перейти к строке" | `v3NavOnHitJump → v3NotesJumpStub → v3NotesOpenForJump` (`17555-17648`) | Highlights needle in textarea |
| 3 | Deep-link `note/sentence?...` (`12776-12798`) | `v3LibraryOpenText` then awaits 300 ms, then `v3NotesOpen` | Used by share-link / URL hash |
| 4 | Notes-modal close path (`v3NotesClose`) | confirms dirty, then `v3NotesForceClose` | Used by Escape / backdrop / Cancel |
| 5 | Cross-result back-nav (`12189-12196`) | closes modal before re-opening result list | Indirect; not a real open |
| 6 | **IDE inspector inline editor** (`9843-9905`) | NOT the modal — separate `<textarea id="v3IdeNoteEditor">` with onblur autosave via `v3IdeSaveNote` | Direct `upsertNote/deleteNote` and `v3NotesBySentenceId` mutation; bypasses modal entirely |

The `v3DeeplinkGetCurrentContext` reader (`12454-12463`) checks `notesModal.dataset.noteId/textId/sentenceId` — but these dataset keys are **never set** by the current `v3NotesOpen`. Dead read; safe to remove or wire properly during Stage B.

## 4. Save flow + new polymorphic API

Current `v3NotesSave` (`30875-30991`) hard-codes URL `/api/library/texts/<tid>/notes/<sid>` and uses `ldb.upsertNote(textId, sentenceId, note)` in LOCAL_MODE. After Phase 9.1.B, this still works — `upsertNote` is preserved as a back-compat shim over `notes_v2 (target_kind='sentence', note_type='free')`.

Stage B/C/D will route saves through the new polymorphic API only when needed:

- **target_kind=sentence + note_type=free + new note** → keep `upsertNote` (zero churn for the 90% case).
- **target_kind=sentence + note_type=free + editing existing note** → still `upsertNote` (same row update).
- **Anything else** (target_kind ≠ sentence OR note_type ≠ free) → `createNote()` for new, `updateNote(id, patch)` for edits. Versioning kicks in automatically.

Polymorphic helpers already exported from `public/db/local-db.js`: `createNote / updateNote / deleteNoteById / getNoteById / listNotesByTarget / listAllNotesForText / searchAllNotes / listNoteVersions / restoreNoteVersion / setNoteLinks / listOutgoingLinks / listBacklinks / seedRoots / searchRootsAutocomplete / getNotesSmartCollectionsSummary / getTextIdsForNotesSmartChip`.

## 5. Smart-chips current shape

`#v3LibrarySmartChips` (`public/index.html:7779-7785`) renders 4 chips: `recent / struggling / mastered / new` driven by `v3LibrarySetSmartChip(kind)` + URL-hash sync (`#smart=…`) + on-toggle re-cache via `v3LibrarySmartLoadCache`. Filter is applied in `v3LibrarySmartFilter` (`18818-18824`). Cache shape `{ struggling: Set, mastered: Set, new: Set }` — `recent` is a sort-only mode, no Set.

Stage E will add 4 chips (`with-note / audio-noted / srs-noted / templated`) sourced from `getTextIdsForNotesSmartChip(kind)` and counts from `getNotesSmartCollectionsSummary()`. The shape will extend the cache without breaking existing chips. Hash sync continues to use the same `#smart=<kind>` slot (single-chip-at-a-time UX preserved).

## 6. Integration plan (Stages B → E)

**Stage B — Target picker.**
- Insert segmented control in modal header (above status row): 7 buttons `📍 Sentence / 🔤 Word / 🌳 Root / 🧬 Binyan / 📄 Text / 🔗 Note / ✍ Free`.
- Bind to new state var `v3NotesModalTargetKind` (default `"sentence"` when opened from row, `"free"` when opened from Library/Dashboard "New note").
- Update `v3NotesSave` to dispatch to `createNote/updateNote` when `target_kind !== 'sentence'` OR `note_type !== 'free'`.
- IDE inspector inline editor stays on legacy `upsertNote/deleteNote` (no target picker there).

**Stage C — Note type switcher.**
- Second segmented row right under target picker, 5 buttons: `Free / Word study / Grammar rule / Translation discrepancy / Pronunciation note`.
- Non-free options render a "Phase 9.3 coming" placeholder body + a hidden body-stash so swapping back to Free restores text. Body-stash kept in a closure scoped to the modal open session, not persisted in DB.
- `body_json` template `{}` for non-free types still satisfies json_valid CHECK in `notes_v2`.

**Stage D — Versioning sidebar.**
- New collapsible `<aside id="v3NotesHistorySidebar">` inside modal panel, anchored right; trigger button `🕒 History` in toolbar (next to Preview).
- Renders `listNoteVersions(noteId)` newest-first with `vN · relative time · +ΔA / −ΔR`.
- Click → diff view (side-by-side; `dir="rtl"` on Hebrew rows via Unicode bidi heuristic).
- Restore → `restoreNoteVersion(id, ver)` then reload body via `getNoteById`.
- Auto-save: debounce 30 s after last keystroke OR explicit Save; both go through `updateNote()` which auto-snapshots into `note_versions`.

**Stage E — Smart-chips (Library).**
- Append 4 buttons inside `#v3LibrarySmartChips` after the existing 4.
- Extend `v3LibrarySmartLoadCache` to populate Sets for `withNote / audioNoted / srsNoted / templated` via `getTextIdsForNotesSmartChip(kind)`.
- Render badge counts from `getNotesSmartCollectionsSummary()`.

## 7. Risk surface

1. **Dead `notesModal.dataset.noteId` read** in deep-link context resolver — easy fix, but if Stage B forgets to set the dataset for new polymorphic notes, share-links will silently degrade. Resolution: set `modal.dataset.noteId` (when known) and `target_kind` on each `v3NotesOpen`.
2. **IDE inspector inline editor** (`#v3IdeNoteEditor`, line 9843) bypasses the modal entirely. It writes through `upsertNote/deleteNote` and mutates `v3NotesBySentenceId` directly. **Stage B–D must leave it alone** — no target picker, no versioning trigger there. We accept this as the legacy fast-path for in-line classic editing.
3. **`v3NotesBySentenceId` cache** is keyed by `sentenceId` only — fine for sentence-bound notes, but will not represent root/binyan/free notes. Stage E may need a second cache (or just rely on direct queries) for the new smart-chips. No data-loss risk; the cache is purely a render perf hint.
4. **`maxlength="16000"` attribute** on textarea is stale (D5 cap = 65 536). Stage B should bump or remove; otherwise users hit a hard cap silently.
5. **Hotkey scope** — current `v3NotesModalHotkeysHandler` catches Esc/Ctrl+Enter only when focus is inside the modal. The new sidebar inputs (history, target picker buttons) will inherit this — no work needed, but worth testing for IME/RTL keyboard quirks.
6. **i18n** — modal currently has hardcoded RU strings ("Заметка к строке", "Сохранить", "Удалить", "Закрыть", "Markdown:", "Сохранено в …"). Stage B introduces `t('notes.target.*')` etc. with stub fallbacks; full ru/en/he keys land in Phase 9.1.E.
7. **`v3NotesIngest` shape** — uses legacy `{sentenceId, note, updatedAt}` projection. Phase 9.1.B's `listNotes(textId)` returns the same shape via the `sentence_notes` VIEW, so no churn for non-polymorphic notes. Polymorphic notes will need a separate listing path.
8. **Test coverage** — events-emission-test (23 cases) and notes-v2-test (38 cases) are the only invariants we must preserve. Both should stay green after every Stage commit; manual smoke covers UI-only changes.

## 8. Out of scope (Phase 9.1.C)

- Audio anchoring (Phase 9.2).
- Template forms beyond placeholders (Phase 9.3).
- Bidirectional links + backlinks panel (Phase 9.3).
- Root/binyan extractor (Phase 9.4).
- Bundle export/import of advanced notes (Phase 9.1.D).
- New ru/en/he keys (Phase 9.1.E).
- Server-side endpoints (Direction 9.1.C is purely client-side).

---

**Conclusion.** Foundation is clean: Phase 9.1.B's polymorphic API + back-compat shims cover every existing flow; the modal needs additive UI (target picker, type switcher, history sidebar) without breaking the row-button or IDE-inspector paths. Implementation can proceed in Stages B → E with confidence.
