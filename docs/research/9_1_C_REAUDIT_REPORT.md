# Phase 9.1.C — Re-audit Report (Stage 1 of hardening pass)

**Date:** 2026-05-11
**Branch:** `worktree-agent-ad33453576637a27d`
**Base commit:** `6c239a6` (Stage 0 doc sync)
**Audit method:** Code review of `public/index.html` + `public/db/local-db.js` + cross-reference with hardening plan DoD criteria.

---

## TL;DR

Phase 9.1.C **functionally works** — 38/38 tests pass, baselines preserved by polish pass. **However**, deeper review surfaces 8 issues:

- **1 High** — race condition in version snapshot under concurrent save.
- **5 Medium** — missing destructive-action confirmation, hardcoded UI strings bypassing i18n helper, stale smart-chip cache after mutation, self-loop in note-target picker, ~150 lines of dead code from pre-9.1.C modal rewrite.
- **2 Low** — diff algorithm tradeoff (already documented), per-keystroke autosave version inflation.

**Recommendation:** Hardening required. None of the issues are show-stopping, but a notes foundation that ships with a known race condition + missing confirm-dialog UX would be a premium-grade regression. Fix all High + Medium before Phase 9.1.D bundle compat depends on the same code paths.

---

## Issues found

### H1 — Race condition in `_appendNoteVersion` (HIGH)

**Location:** `public/db/local-db.js` ~ lines 580-590 (Phase 9.1.B implementation).

**Pattern:**
```js
const maxRow = await q('SELECT COALESCE(MAX(version), 0) AS m FROM note_versions WHERE note_id = ?', [noteId]);
const nextVer = Number(maxRow[0].m) + 1;
await r('INSERT INTO note_versions (note_id, version, body_json, edited_at) VALUES (?,?,?,...)', [noteId, nextVer, oldBody]);
```

**Failure mode:** Two concurrent `updateNote()` calls (e.g. fast autosave overlapping with explicit Save click) both SELECT `MAX(version)`, get the same value N, then both INSERT with version=N+1. Second INSERT violates `PRIMARY KEY (note_id, version)` → unhandled exception → user sees `toast.noteSaveFailed`.

**Probability:** Low in practice (30s autosave debounce ≫ typical save round-trip), but Stage 3 stress test in the hardening plan explicitly mandates 51-edit rapid stress — that path WILL hit it.

**Fix:** Retry-on-conflict pattern: catch UNIQUE constraint failure, re-query MAX, retry with incremented version. Cap retries at 3 to prevent infinite loop on persistent failure.

### M1 — Delete button has no confirmation dialog (MEDIUM)

**Location:** `v3NotesDelete` at `public/index.html:32341`.

**Failure mode:** User clicks "Удалить" → note is immediately deleted (legacy or polymorphic path). No `v3ConfirmModal` prompt. This violates Direction 6 baseline ("Premium feel — все destructive actions используют `v3ConfirmModal`") established in v3.1.0.

**Fix:** Wrap deletion in `v3ConfirmModal({ title, body, okText, cancelText, danger: true })` per the existing Direction 6 pattern.

### M2 — Hardcoded RU strings in `v3NotesSave` + `v3NotesDelete` (MEDIUM)

**Locations:**
- `v3NotesSave`: line 32142 (`"Заметка удалена."`), 32214 (`"Сохранено в ..."` / `"Сохранено."`), 32330 (same), 32371 (same).
- `v3NotesDelete`: line 32371, 32405 (`"Заметка удалена."`).
- `v3NotesUpdateButtonRow`: line 32078 (`"Заметка (есть)" / "Добавить заметку"`).

**Failure mode:** When Phase 9.1.E adds EN/HE locales, these strings stay RU. The premium polish pass added `data-i18n` everywhere it could see, but missed JS-side dynamic strings inside the save/delete flow.

**Fix:** Route through `v3NotesT(key, fallback)`. Inventory the keys for Phase 9.1.E. Keep current RU as fallback so visible behavior doesn't change in RU users until locale keys land.

### M3 — Smart-chip cache stale after note mutation (MEDIUM)

**Location:** `v3LibrarySmartCache` (line 19225) loaded only on Library open (`v3LibrarySmartLoadCache`). Not invalidated when `createNote/updateNote/deleteNoteById/upsertNote/deleteNote` succeed.

**Failure mode:** User opens Library → caches 4 smart-chip Sets (with-note / audio-noted / srs-noted / templated). User then opens a text, creates a note (any kind), closes the note modal, returns to Library. The chip badges still show old counts; chip filters still exclude/include the wrong texts.

**Fix:** Add a `v3LibrarySmartInvalidate()` call after note save / delete IF Library is currently open. Alternatively (cleaner): just call `v3LibrarySmartLoadCache()` after note mutations when `#v3LibraryModal` is visible. The cache refresh is fast (single COUNT query per chip).

### M4 — Note-target autocomplete can self-link (MEDIUM)

**Location:** `v3NotesNoteAutocomplete` at `public/index.html:31290`+.

**Failure mode:** When user is editing note A and switches `target_kind=note`, typing into the target_id field returns autocomplete results from `searchAllNotes(q, 10)`. The currently-edited note A is NOT filtered out. User can click A → set `target_id = note A's own id`. Saving creates a `note_links (from_note_id=A, to_kind=note, to_id=A)` row — a self-loop.

**Fix:** Filter out `v3NotesModalNoteId` from autocomplete results.

### M5 — Dead code from pre-9.1.C modal rewrite (MEDIUM — code hygiene)

**Locations:**
- Legacy `v3NotesForceClose` at line 30951 (overridden by line 31998 — never executes).
- `v3NotesBindHotkeysOnce` at line 30970 — never called.
- `v3NotesHotkeyHandler` state variable + binding logic — never wired up.

**Failure mode:** Future maintainers see two implementations of the same function, two parallel hotkey-handler state vars. High risk of accidentally re-wiring the dead path. ~150 lines of dead code.

**Fix:** Remove dead code. Keep only the new `v3NotesForceClose` (line 31998) + `v3NotesModalHotkeysHandler` system.

### L1 — Per-line diff is set-intersection, not Myers/LCS (LOW — documented tradeoff)

**Location:** `v3NotesComputeLineDiff` at `public/index.html:31494`.

**Failure mode:** Reordered identical lines show as `kept` on both sides. Acceptable for short notes; user might be surprised on long edits.

**Decision:** Already documented in `9_1_C_PREMIUM_REVIEW.md` § "Items intentionally NOT addressed". Keep deferred to v3.3 unless real diff complaints arise.

### L2 — Per-keystroke autosave version inflation (LOW)

**Location:** `v3NotesScheduleAutoSave` at line 31588.

**Failure mode:** User typing continuously with brief 30s pauses every minute → autosave fires per pause → creates note_versions row per autosave → 50-FIFO retention kicks in after ~25 minutes of editing. Each version is a full body snapshot (not delta). Versions for that one note can balloon to 50 × 64k = 3.2 MB. On a typical user with 10 actively-edited notes → 32 MB OPFS pressure.

**Mitigations available:** (a) increase debounce; (b) delta-versioning instead of full snapshot; (c) merge consecutive autosaves into one version row if no explicit Save between them.

**Decision:** v3.2 ships full-snapshot 50-FIFO per D6. Real-world impact unclear; defer optimization to v3.3 unless dogfood reveals quota pressure.

---

## Items intentionally NOT addressed in hardening

These reach scope creep or other-direction territory:

- **Smart-chip badges on original 4 chips** — Direction 5 territory, not 9.1.C. Already deferred in `9_1_C_PREMIUM_REVIEW.md`.
- **Mobile drawer animation for history sidebar** — current full-screen overlay at <780px is acceptable. Animation polish defers to v3.3.
- **Mid-edit conflict resolution** (two devices editing same note simultaneously) — out of scope; offline-first single-device.
- **Image / attachment support in notes** — explicit non-goal per master plan.

---

## Findings vs hardening plan DoD

| DoD criterion | Status |
|---------------|--------|
| Functional flows for all (target_kind, note_type) | ✓ Confirmed via code review |
| Backwards-compat preserved | ✓ Confirmed (38/38 notes-v2 tests + 23/23 events) |
| Modal title accurate to target_kind | ✓ Confirmed (polish pass `d785aac`) |
| Body content preserved on switch | ✓ Confirmed via `v3NotesBodyStashByType` |
| Confirmation before destructive actions | ✗ **M1 — delete missing confirm** |
| Loading/empty/error/disabled states polished | ⚠ Empty (history empty state OK; smart-chip empty TBD via Stage 2 manual smoke) |
| Visual hierarchy / button placement | ✓ Confirmed |
| Keyboard navigation + focus rings | ✓ Confirmed (polish pass `d785aac`) |
| ARIA labels correct | ✓ Confirmed |
| Reduced-motion respect | ✓ Confirmed |
| 44px touch targets | ⚠ Verify in Stage 3 manual smoke at 390px |
| Mobile usable at 390px | ⚠ Verify in Stage 3 manual smoke |
| Hebrew RTL correct in body + diff | ✓ Confirmed via heuristic |
| Mixed Hebrew+Russian rendering | ⚠ Verify in Stage 3 manual smoke with real content |
| Niqqud preserved | ✓ Confirmed (no UI transform on body text) |
| Theme variables, no hardcoded hex | ✓ Confirmed (polish pass `d785aac`) |
| Active state ≥ 4.5:1 contrast | ✓ Confirmed |
| Diff readable in both themes | ✓ Confirmed (polish pass `d785aac`) |
| State management (no conflicting flags) | ✗ **M5 — dead code with parallel state vars** |
| Rapid switch sequence consistency | ⚠ Stress test in Stage 3 |
| Auto-save debounce correctly cancelled on close/delete | ✓ Confirmed |
| No invalid body_json path | ✓ Confirmed (json_valid CHECK + buildBodyJson) |
| Empty body delete handling | ✓ Confirmed |
| Note IDs preserved on edit | ✓ Confirmed |
| `noteId` populated in dataset for all saves | ✓ Confirmed (legacy path also captures dto.id) |
| Performance: modal open ≤ 200ms | ⚠ Measure in Stage 3 |
| Performance: smart-chip ≤ 500ms on 1000 texts | ⚠ Measure in Stage 3 |
| No `q()/r()` in render loops | ✓ Confirmed |
| Smart-chip cache invalidation | ✗ **M3 — not invalidated after mutation** |
| Note-target self-loop prevention | ✗ **M4 — not filtered** |
| Concurrent updateNote safety | ✗ **H1 — race condition** |
| All new strings via i18n hook | ✗ **M2 — save/delete flow still has hardcoded RU** |

---

## Required fixes for Stage 2 hardening

1. **H1 fix:** retry-on-UNIQUE-constraint in `_appendNoteVersion`. Add a unit test exercising the race.
2. **M1 fix:** wrap `v3NotesDelete` deletion in `v3ConfirmModal` per Direction 6 pattern.
3. **M2 fix:** route remaining hardcoded RU through `v3NotesT(key, fallback)`. Add to Phase 9.1.E key inventory.
4. **M3 fix:** invalidate smart-chip cache after note mutation when Library is visible.
5. **M4 fix:** filter `v3NotesModalNoteId` from `searchAllNotes` results in autocomplete.
6. **M5 fix:** remove dead code (legacy `v3NotesForceClose`, `v3NotesBindHotkeysOnce`, `v3NotesHotkeyHandler` var).

L1 and L2 accepted as v3.2 tradeoffs, deferred to v3.3 with documentation.

---

## Recommendation

**Implementation is NOT yet production-ready. Hardening required.** Specifically: fix H1 (race), M1 (confirm), M3 (cache invalidation), M4 (self-filter), then ship. M2 + M5 can be done in same pass at low marginal cost.

After Stage 2 (hardening) + Stage 3 (regression) → Phase 9.1.C is production-ready and Phase 9.1.D can build on solid foundation.

---

**Last updated:** 2026-05-11 (Stage 1 commit)
