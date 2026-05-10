# Phase 9.1.C — Premium Hardening Plan

**Branch:** `worktree-agent-ad33453576637a27d`
**Base commit:** `a2fa06b` (premium polish review summary)
**Started:** 2026-05-11

---

## 1. Why this hardening pass

Phase 9.1.C shipped via 5 implementation commits (`949a932` → `e1af2d2`) plus an interactive premium polish pass (`d785aac` + review doc `a2fa06b`). The polish pass surfaced 8 gaps and patched them. **However**, the polish review was scoped to surface-level UX/i18n/a11y issues. It did NOT re-evaluate:

- **Architecture** of the modal save flow under polymorphic targets.
- **Data-integrity** edge cases (concurrent saves, dirty-state during target-kind swap, body_json validation invariants).
- **State-management** of the modal (multiple overlapping flags, race conditions on rapid switches).
- **Mobile UX** at <600px with the segmented controls + history sidebar.
- **RTL correctness** beyond per-line bidi heuristic.
- **Performance** of smart-chip caches under realistic library size.

Phase 9.1.C is the foundation for the entire Premium Notes system. **Bugs here propagate** to Phases 9.1.D (bundle compat), 9.1.E (i18n), 9.2 (audio anchoring), 9.3 (templates), 9.4 (morphology). A premium-grade foundation is non-negotiable.

This document is the contract for what the hardening pass must deliver.

---

## 2. Scope

### In scope
- Deep re-audit of Phase 9.1.C implementation (Stage 1 of this hardening).
- Premium hardening of all High + Medium issues found (Stage 2).
- Full regression + manual smoke (Stage 3).
- Documentation kept current throughout — not at the end.

### Explicit non-goals
- No Phase 9.2 (audio anchoring) work.
- No Phase 9.3 (full templated forms / link parser / note→SRS card) work.
- No Phase 9.4 (HebMorph sidecar) work.
- No new server endpoints.
- No merge to `main` until Phase 9.1.D + 9.1.E are also complete on this branch.

---

## 3. Product-quality criteria

The hardened Phase 9.1.C must satisfy **all** of:

### Functional
- All 7 target_kinds × 5 note_types are reachable from the modal without UI dead-ends.
- Save / Delete / Cancel flows correct for every (target_kind, note_type) combination.
- Backwards-compat preserved: `upsertNote / listNotes / deleteNote / searchNotes / resolveNote` continue working unchanged.
- All Phase 9.1.A migrations (021-025) still apply cleanly on a fresh DB AND on a pre-9.1.A DB with existing `sentence_notes` rows.
- All 38/38 notes-v2 tests + 23/23 events-emission tests stay green.

### Premium UX
- Modal title is always accurate to current `target_kind`.
- Body content never lost on target_kind / note_type switch.
- Confirmation dialog before destructive actions (delete, restore version, abandon dirty changes).
- Loading / empty / error / disabled states all polished.
- Layout breathes — adequate whitespace, no visual cramming at any viewport.
- Visual hierarchy obvious: primary action (Save) prominent, destructive (Delete) muted, target/type switchers scannable.

### Accessibility (a11y)
- Every interactive control reachable by keyboard.
- Visible focus indicator on every focusable element.
- Modal has correct `aria-labelledby` pointing to dynamic title.
- Buttons with icon-only content have `aria-label`.
- Sidebar toggle has correct `aria-expanded`.
- No keyboard traps.
- Screen-reader announcements correct for state changes (saved, deleted, restored).
- `prefers-reduced-motion` respected for all transitions.

### Mobile
- Modal usable at 390px width.
- Segmented controls wrap or scroll horizontally without breaking layout.
- History sidebar full-screen overlay below 780px (already implemented).
- Touch targets ≥ 44px.
- No horizontal scroll on body.

### RTL / Hebrew
- Hebrew content in body always rendered RTL.
- Mixed Hebrew + Russian content uses `<bdi>` or `dir="auto"` correctly.
- Diff view rows have per-line `dir` set (already implemented; verify against pathological mixed cases).
- Niqqud not stripped or mangled by any UI transformation.

### Dark mode
- All new UI elements use theme variables — no hardcoded `#hex` colors that break dark mode.
- Active states have ≥ 4.5:1 contrast in both modes.
- Diff added/removed rows readable on slate-900 (already bumped alpha; verify).
- Focus rings visible against both bg-page and bg-card.

### State management
- No conflicting flags between `v3NotesModalIsDirty / v3NotesModalOriginalText / v3NotesBodyStashByType`.
- Rapid switches (target → type → target → close) don't leave inconsistent state.
- Auto-save debounce correctly cancelled on close / delete.
- History list refresh doesn't fire excessive queries.

### Data integrity
- No path that can write invalid `body_json` (CHECK constraint protects, but UI must not surface a 500-style error).
- Empty body always treated as delete-or-skip — never silently saved as `""` markdown.
- Note IDs assigned correctly (UUID for new, preserved for edits).
- `noteId` populated in dataset for all saves so deep-links work.

### Performance
- Modal open ≤ 200ms on a typical OPFS DB.
- History sidebar opens ≤ 200ms on a 50-version note.
- Smart-chip cache builds ≤ 500ms on a 1000-text library.
- No `q()`/`r()` calls in render loops.

### i18n readiness
- Every new user-facing string has `data-i18n` / `data-i18n-title` / `data-i18n-aria-label` OR uses `v3NotesT(key, fallback)`.
- Inventory of i18n keys maintained in `9_1_C_PREMIUM_REVIEW.md` § "Phase 9.1.E follow-ups".
- No "Coming in Phase 9.3" copy that's untranslatable later.

---

## 4. Risk register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| H1 | UPSERT-via-update path on legacy free notes accidentally creates duplicate notes when legacy code uses `upsertNote(textId, sid, body)` while new code creates polymorphic note for same target_kind=sentence | High | Re-audit save flow with concurrent test; ensure UNIQUE (target_kind='sentence' + target_id + note_type='free' + text_id) holds |
| H2 | History auto-save creates excessive note_versions rows when user types continuously (debounce broken under rapid keystrokes) | High | Re-audit autosave timer + 50-FIFO retention triggers correctly; verify with stress test |
| H3 | Dirty-state warning lost when user switches target_kind from sentence to free with unsaved body | Medium | Re-audit `v3NotesModalIsDirty` propagation across switches |
| H4 | Restore note version doesn't update `v3NotesModalOriginalText`, leading to false-positive dirty state on next interaction | Medium | Verified in current code (line ~31506); confirm with test |
| M1 | History sidebar scrolling fails on mobile when sidebar covers full screen but list overflow + drag-to-close conflict | Medium | Verify scroll-within-sidebar works, document acceptable behavior |
| M2 | Smart-chip cache stale when notes mutate (create/delete) — chip badges show wrong counts until library reloaded | Medium | Add cache invalidation hook on `createNote / updateNote / deleteNoteById / upsertNote / deleteNote` |
| M3 | `searchAllNotes()` LIKE on body_json hits performance wall at 10k+ notes | Low | Document FTS5 upgrade path for v3.3; not blocking 9.1 |
| M4 | Note-target picker autocomplete (`v3NotesNoteAutocomplete`) doesn't filter out the currently-edited note → user can link a note to itself | Low | Filter out `v3NotesModalNoteId` from results |

---

## 5. Test plan

### Automated (Playwright headless on the worktree)
- `events-emission-test.html` — must remain 23/23.
- `notes-v2-test.html` — must remain 38/38 or grow (new cases for hardening).
- Main app smoke load — 0 new JS errors.
- New tests added to `notes-v2-test.html` for hardening:
  - Switching target_kind doesn't invalidate body_json.
  - 50-FIFO retention enforced under rapid edit stress (51 edits → 50 versions).
  - Smart-chip cache invalidation after mutation.
  - Note-target picker excludes self.
  - Dirty-state warning fires when switching target_kind with unsaved body.

### Manual smoke (recorded in hardening report)
1. Open note from row.
2. Edit body, switch target_kind → free, switch back → body preserved.
3. Edit body, switch note_type → word_study, switch back → body preserved.
4. Save 5 times → open History → verify 5 versions, newest first.
5. Click each version → diff renders.
6. Restore v1 → body reverts → new v6 created (snapshot of v5).
7. Close without saving → confirm dialog fires.
8. Switch all 7 target_kinds → title updates correctly.
9. Switch all 5 note_types → banner / placeholder updates correctly.
10. Open Library → click each new smart-chip → filter applies.
11. Clear filter → all texts return.
12. Resize to 390px width → modal usable.
13. Toggle dark theme → all elements readable.
14. Tab through modal → focus visible on every control.
15. Test with Hebrew body content → RTL correct.
16. Test diff view with mixed Hebrew + Russian → per-line dir correct.
17. Verify modal aria-labelledby reads correct title via screen-reader simulation (Playwright accessibility tree).

---

## 6. Definition of Done (DoD)

Phase 9.1.C hardening is **done** when:
- [ ] Stage 1 audit report committed (`9_1_C_REAUDIT_REPORT.md`).
- [ ] All High issues from the audit patched.
- [ ] All Medium issues either patched or explicitly deferred with rationale.
- [ ] Test counts ≥ baseline (23/23 events; 38+/38+ notes-v2).
- [ ] Manual smoke checklist ≥ 16/17 green (1 acceptable miss with documentation).
- [ ] No new JS errors in main app load.
- [ ] All new strings have i18n hooks (`data-i18n` or `v3NotesT(key, fallback)`).
- [ ] Hardening report committed (`9_1_C_PREMIUM_HARDENING_REPORT.md`).
- [ ] Plan docs updated to reflect "hardening complete; ready to proceed to 9.1.D".

---

## 7. Stage sequencing

| Stage | Description | Commit message |
|-------|-------------|----------------|
| 0 | Branch verification + doc sync + this plan | `docs(notes): update Phase 9.1.C hardening plan and live status` |
| 1 | Deep re-audit | `docs(notes): re-audit Phase 9.1.C premium UI implementation` |
| 2 | Premium hardening | `feat(notes): harden Phase 9.1.C premium notes modal UX` |
| 3 | Regression + smoke verification | `docs(notes): record Phase 9.1.C hardening verification` |
| 4 | Phase 9.1.D bundle compat | `feat(notes): add advanced notes bundle export import` |
| 5 | Phase 9.1.E i18n + close | `docs(notes): close Direction 9 Phase 9.1 foundation` |

---

**Last updated:** 2026-05-11 (Stage 0 commit)
