# Phase 9.1.C — Premium Review Summary

**Date:** 2026-05-10
**Branch:** `worktree-agent-ad33453576637a27d`
**Final commit (premium polish):** `d785aac`
**Base:** `main@a6a570c`

---

## Scope

Post-implementation premium-quality review of Phase 9.1.C (Notes modal UI revamp). Phase 9.1.C was implemented by an autonomous worktree-isolated agent across Stages A → F (commits `949a932` → `e1af2d2`). This document records the gaps surfaced during interactive review and the patches applied.

## Review approach

1. Read agent's audit doc + final report.
2. Inspect each Stage's diff against the v3.1 polish baseline:
   - Theme variables consistency
   - Dark-mode visual quality
   - RTL-correctness (Hebrew + Russian mixing in diff view)
   - Mobile-responsive breakpoints
   - `prefers-reduced-motion` respect
   - A11y — touch targets, focus states, keyboard nav
   - i18n coverage (data-i18n attributes for new strings)
3. Run regression suite (events 23/23, notes-v2 38/38) at baseline.
4. Apply patches as a single coherent commit, preserving baselines after each iteration.
5. Verify dynamic title behaviour end-to-end via Playwright.

## Gaps found

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | High | Modal title hardcoded RU `"Заметка к строке (Ctrl+Enter — сохранить заметку)"`, stale for non-sentence target_kinds | Title split into label span (i18n key per target_kind) + hint span; new `v3NotesUpdateModalTitle()` keeps in sync with `target_kind`; verified across all 7 kinds via Playwright |
| 2 | High | `aria-label="Заметка к строке"` on modal hardcoded + stale | Switched to `aria-labelledby="v3NotesModalTitle"` so screen readers read the dynamic title |
| 3 | High | `<label>Note</label>` (English) + Save / Delete buttons + footer help + markdown legend + toolbar buttons (Список / Цитата / Ссылка / Preview) all hardcoded RU without `data-i18n` | Added `data-i18n` / `data-i18n-title` / `data-i18n-aria-label` attributes everywhere with RU defaults preserved. Markdown legend uses `data-i18n-html` (already supported). |
| 4 | Medium | History sidebar + close button + diff item actions had no `:focus-visible` state — keyboard a11y regression | Premium focus rings added: outline 2px solid `var(--theme-accent)` for normal items; on active filled buttons, outline switches to `var(--theme-text-primary)` for contrast |
| 5 | Medium | `body.theme-dark .v3-notes-seg-btn.active { color: #0f172a }` hardcoded hex breaks themability | Replaced with `var(--theme-bg-page, #0f172a)` — fallback preserved for safety, but theme variable resolves per-mode |
| 6 | Medium | Diff view added/removed lines used soft alpha tints (`.18` opacity) that washed out on slate-900 in dark mode | Bumped dark-mode alpha to `.28` (matches Direction 2 row-highlight token pattern) + added 3px coloured left-border for at-a-glance scanability |
| 7 | Low | `v3NotesFmtRelative` returned hardcoded English ("sec ago", "min ago", "h ago", "d ago") in an otherwise RU UI | Wrapped each unit label in `v3NotesT("notes.relSecAgo", "сек. назад")` etc. so Phase 9.1.E can promote to per-locale strings without touching the function |
| 8 | Low | "History" label visible in RU UI as English text inside `<span data-i18n="notes.history">History</span>` | Default text changed to RU "История" (matches the other sidebar labels) |

## Items intentionally NOT addressed

These would have been scope creep or premature optimisation:

- **Original 4 Library smart-chips** (recent / struggling / mastered / new) remain without count badges. The new 4 chips (Phase 9.1.C Stage E) have badges. Visual asymmetry is deliberate:
  - "recent" is sort-only with no count semantics — a badge would lie.
  - Adding badges to "struggling" / "mastered" / "new" requires new helper functions (count-by-tag), which is Direction 5 territory, not 9.1.C.
  - Flagged for v3.3 polish epic.
- **Per-line diff algorithm stays as set-intersection** (not Myers / LCS). Adequate for short notes; reordering shows as kept. Phase 9.4+ may upgrade if the diff view becomes a major UX surface.
- **Mobile responsive behaviour at < 600px** of the segmented controls (target picker has 7 buttons; type switcher has 5). Agent already has `flex-wrap: wrap` + `padding 6px 9px / font-size 12px` at 600px breakpoint. Verified visually that buttons wrap to 2 rows correctly. No further patch needed.
- **Pre-existing OPFS test-harness state pollution** (`memory access out of bounds` from wa-sqlite worker on repeat Playwright runs) — agent already documented this in the final report. Not caused by Phase 9.1.C; not addressed here.

## Verification (post-polish)

- `/db/events-emission-test.html` (Phase 11.0 + 11.1): **23 / 0** — preserved.
- `/db/notes-v2-test.html` (Phase 9.1.A + 9.1.B): **38 / 0** — preserved.
- Main app smoke load: **0 new JS errors** (excluding expected post-Phase-6 410 Gone responses).
- Dynamic title verified live: opening modal with `v3NotesOpen('fake-text', 'fake-sentence', 0)` and switching through all 7 `v3NotesSetTargetKind(k)` values produces the correct localized title for each kind.

## Recommendation

**Merge `worktree-agent-ad33453576637a27d` into `main`.** All commits on this branch are reviewed and tested:

| Commit | Stage | Reviewed |
|--------|-------|----------|
| `949a932` | A — Audit doc | ✓ Read; structure clean; matches reality verified by code grep |
| `e756509` | B — Target picker + dataset wiring + 65k cap | ✓ Reviewed; covered by polish patch (i18n, a11y) |
| `afa29db` | C — Note type switcher | ✓ Reviewed; banner copy verified per type |
| `9d0c504` | D — History sidebar + diff view | ✓ Reviewed; covered by polish (a11y, contrast); set-intersection diff acknowledged as tradeoff |
| `fb9fcd4` | E — 4 new Library smart-chips | ✓ Reviewed; original-chips-no-badges asymmetry documented |
| `e1af2d2` | F — Final summary | ✓ Read; agent's findings match my review |
| `d785aac` | Premium polish | ✓ This review pass |

## Known follow-ups for Phase 9.1.D + 9.1.E

- **9.1.D (Bundle compat):** `library/notes_advanced.json` export/import path. Should preserve sentence-bound free notes inline (Android v2 compat) and add advanced notes (target_kind ≠ sentence OR note_type ≠ free OR audio_anchor OR links OR versions) to the new file.
- **9.1.E (i18n):** promote all the RU-default strings introduced in this Phase to actual ru/en/he locale keys. Specific keys to add (deduplicated from this review + agent's stubs):
  - `notes.modalTitle.{sentence,word,root,binyan,text,note,free}` + `notes.modalTitleHint`
  - `notes.{closeBtn,saveBtn,deleteBtn,bodyLabel,history,historyToggleTitle,historyTitle,historyEmpty,historyAriaLabel,historyCloseTitle,historyView,historyRestore,historyNeedsSave,historyLocalOnly,historyError,historyPrev,historyThis,historyRestoredStatus,emptyNoteHelp,toolbarAriaLabel}`
  - `notes.{md{Bold,Italic,Code,Highlight,List,Quote,Link,Preview}{Title,Btn},mdLegend}`
  - `notes.{relSecAgo,relMinAgo,relHourAgo,relDayAgo}`
  - `notes.{targetLabel,targetIdLabel,typeLabel,target{Sentence,Word,Root,Binyan,Text,Note,Free},type{Free,WordStudy,Grammar,Translation,Pronunciation},templateBanner,target{Root,Binyan,Word,Note}{Label,Placeholder},titlePlaceholder,placeholder.{free,word_study,grammar_rule,translation_discrepancy,pronunciation_note},template.{word_study,grammar_rule,translation_discrepancy,pronunciation_note}.{title,fields,body}}`
  - `library.{smartWithNote,smartAudioNoted,smartSrsNoted,smartTemplated}{,Title}`
  - `confirms.{notesHistoryRestoreTitle,notesHistoryRestoreBody,notesHistoryRestoreOk,cancelBtn}`
  - `toast.{notesHistoryRestored,notesHistoryRestoreFailed,notesPolymorphicLocalOnly}`

- The `v3NotesT(key, fallback)` helper already returns `fallback` when the key isn't present in any locale, so Phase 9.1.E is purely additive — no code changes, only locale file additions.

---

**Bottom line:** Phase 9.1.C is **production-ready**. The agent shipped 5 stages with all baselines green; this review pass added 8 premium-polish patches (i18n stubs + a11y + dynamic title + contrast bumps) without breaking anything. Ready for merge to main once Phase 9.1.D + 9.1.E land on the same branch.
