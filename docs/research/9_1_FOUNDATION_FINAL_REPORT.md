# Direction 9 Phase 9.1 — Foundation Final Report

**Branch:** `worktree-agent-ad33453576637a27d`
**Final commit:** (this push)
**Date completed:** 2026-05-11

---

## Summary

Phase 9.1 (Foundation) of Direction 9 — Premium Notes Redesign — is **complete on the worktree branch**. All five sub-phases shipped:

| Sub-phase | Scope | Status |
|-----------|-------|--------|
| 9.1.A | Schema migrations 021–025 | ✅ shipped (in main, commit `8da394e`) |
| 9.1.B | local-db.js polymorphic API | ✅ shipped (in main, commit `3a45833`) |
| 9.1.C | Notes modal UI revamp + premium hardening | ✅ shipped on branch (final hardening commit `a2d6efa`) |
| 9.1.D | Bundle compat — `library/notes_advanced.json` | ✅ shipped on branch (commit `d439683`) |
| 9.1.E | i18n finalization + final regression + this report | ✅ this commit |

---

## Full commit log on branch (oldest → newest)

| Commit | Stage |
|--------|-------|
| `949a932` | 9.1.C Stage A — Notes UI audit |
| `e756509` | 9.1.C Stage B — target picker + dataset wiring + 65k cap |
| `afa29db` | 9.1.C Stage C — note_type switcher polish |
| `9d0c504` | 9.1.C Stage D — history sidebar + diff view |
| `fb9fcd4` | 9.1.C Stage E — 4 new Library smart-chips |
| `e1af2d2` | 9.1.C Stage F — final summary (initial impl) |
| `d785aac` | 9.1.C premium polish — i18n stubs + a11y + dynamic title + dark-mode contrast |
| `a2fa06b` | 9.1.C premium polish review summary |
| `6c239a6` | 9.1.C hardening Stage 0 — plan + live-status |
| `a80c00d` | 9.1.C hardening Stage 1 — re-audit report (8 issues) |
| `a82bab2` | 9.1.C hardening Stage 2 — H1+M1+M2+M3+M4+M5 fixes |
| `a2d6efa` | 9.1.C hardening Stage 3 — verification report |
| `d439683` | 9.1.D — bundle compat (notes_advanced.json) |
| (next) | 9.1.E — i18n keys + final report |

---

## Tests (final state)

| Suite | Result |
|-------|--------|
| `events-emission-test.html` (Phase 11.0 + 11.1) | **23 / 0** ✓ preserved across all 14 commits |
| `notes-v2-test.html` (Phases 9.1.A + 9.1.B + hardening + 9.1.D) | **42 / 0** ✓ grew from 18 (9.1.A) → 38 (9.1.B) → 39 (hardening H1 race) → 42 (9.1.D bundle roundtrip) |
| Main app smoke load | **0 new JS errors** (excluding expected post-Phase-6 `410 Gone`) |

---

## What was implemented across Phase 9.1

### 9.1.A — Schema (migrations 021–025)

- `notes_v2` polymorphic table: target_kind ∈ {sentence, word, root, binyan, text, note, free}, note_type ∈ {free, word_study, grammar_rule, translation_discrepancy, pronunciation_note}, audio_anchor_ms, audio_asset_key, srs_card_id, body_json with 64k cap + json_valid CHECK.
- `note_versions`: composite PK (note_id, version), CASCADE from notes_v2.
- `note_links`: bidirectional + backlinks, CASCADE from source note.
- `roots`: reference table, ON DELETE SET NULL on my_note_id.
- Data migration: `sentence_notes` → `notes_v2` (target_kind='sentence', note_type='free', body_json wraps original `note` plaintext).
- VIEW shim: `sentence_notes` re-exposes legacy column shape for backwards-compat code.

### 9.1.B — Polymorphic API (local-db.js)

- Backwards-compat preserved: `upsertNote / listNotes / deleteNote / searchNotes / resolveNote` work through the VIEW + new schema.
- New: `createNote / updateNote / deleteNoteById / getNoteById / listNotesByTarget / listAllNotesForText / searchAllNotes / listNoteVersions / restoreNoteVersion / setNoteLinks / listOutgoingLinks / listBacklinks / seedRoots / searchRootsAutocomplete / getNotesSmartCollectionsSummary / getTextIdsForNotesSmartChip`.
- `updateNote` auto-snapshots versions with `+N / -M` diff_summary, enforces 50-FIFO retention.
- `restoreNoteVersion` is itself versioned (snapshots current state before reverting).

### 9.1.C — Modal UI revamp (5-stage agent implementation + premium polish + hardening)

- **Stage A audit** mapped existing modal DOM + state + 6 entry points.
- **Stages B–E** implemented target picker (7 kinds), note type switcher (5 kinds), history sidebar with per-line diff view (RTL-aware), 4 new Library smart-chips with count badges.
- **Premium polish pass** added i18n stubs, a11y focus rings, dynamic modal title per target_kind, dark-mode contrast fixes for diff view.
- **Hardening pass** (this iteration) closed 1 High + 5 Medium issues:
  - **H1** race condition in `_appendNoteVersion` → retry-on-conflict loop with 5-attempt ceiling.
  - **M1** missing confirmation on Delete → `v3ConfirmModal({danger:true})` prompt.
  - **M2** 5 hardcoded RU status strings → routed through `v3NotesT(key, fallback)`.
  - **M3** stale Library smart-chip cache after note mutations → `v3NotesInvalidateLibrarySmartCache()` helper.
  - **M4** note-target self-loop → filter own note id from autocomplete.
  - **M5** ~150 lines of dead code from pre-9.1.C modal removed (legacy `v3NotesForceClose`, `v3NotesBindHotkeysOnce`, orphan state vars).

### 9.1.D — Bundle compat

- `library/notes_advanced.json` web-only file in ZIP (Android v2 ignores unknown entries; schema_version unchanged).
- `_buildAdvancedNotesPayload` gathers notes_v2 + 50-FIFO versions + outgoing links + user-customized roots.
- `_applyAdvancedNotesPayload` 4-pass import with FK rewiring (oldToNewTextId / oldToNewSentenceId / oldToNewNoteId maps); sentence-bound free notes MERGE with inline-created rows rather than duplicate.
- Manifest carries `notes_advanced_path` + `notes_advanced_present` flags.
- Skip-mode + sentence-targeted advanced notes for existing texts: dropped gracefully (documented limitation).

### 9.1.E — i18n finalization

- **~90 new keys** authored for `ru` / `en` / `he` locales:
  - `notes.*` namespace: modal title (per target_kind), close/save/delete buttons, body label, toolbar buttons + tooltips, segmented control labels (7 target kinds + 5 note types), template banner, target_id placeholders, history sidebar (toggle/title/empty/restore/view/prev/this), status messages (savedAt/saved/deleted), row-button tooltips, markdown legend, per-type body placeholders, relative-time labels, history error states.
  - `library.*`: 4 new smart-chip labels + titles (with-note / audio-noted / srs-noted / templated).
  - `confirms.*` (new namespace): notes delete + close-unsaved + history restore confirms.
  - `toast.*`: notesPolymorphicLocalOnly, notesEmptyBody, notesTargetMissing, notesHistoryRestored, notesHistoryRestoreFailed.
- Stale `noteTooLong` updated `16000` → `65,536` (matches Phase 9.1.A D5 schema cap).
- Hebrew translations are **machine-grade**: production deployment to ulpan diploma cohort (Direction 11) MUST get native review pass for tone + idiom (flagged in he.js comment).

---

## Fundamental changes during hardening

1. **Versioning is now race-safe.** `_appendNoteVersion` retries on UNIQUE constraint, so concurrent `updateNote()` calls (autosave + Save click, multi-tab edits) can no longer corrupt `note_versions`. Test `H1: concurrent updateNote calls do not throw (race retry)` exercises this directly.

2. **Delete is now safe by default.** Previous behavior silently deleted on click; new behavior surfaces `v3ConfirmModal` prompt, matching Direction 6 baseline.

3. **Library smart-chip cache is now consistent.** Note mutations refresh the cache when Library is visible, so badge counts and filter Sets always reflect current state.

4. **Polymorphic notes roundtrip via ZIP.** Previously web-to-web ZIP roundtrip lost any note that wasn't `target_kind='sentence' AND note_type='free'`. Now full notes_v2 + history + links + roots cross devices.

---

## Test counts evolution

| Commit milestone | events-emission | notes-v2 |
|------------------|:---------------:|:--------:|
| Phase 9.1.A (schema) | 23/0 | 18/0 |
| Phase 9.1.B (API) | 23/0 | 38/0 (+20) |
| Phase 9.1.C initial (agent) | 23/0 | 38/0 |
| 9.1.C premium polish | 23/0 | 38/0 |
| 9.1.C hardening | 23/0 | **39/0** (+1 H1 race) |
| 9.1.D bundle compat | 23/0 | **42/0** (+3 roundtrip) |
| 9.1.E i18n finalization | **23/0** | **42/0** |

---

## Manual smoke

Per hardening plan § 5 — verified through code review during hardening pass + final automated test run. Full visual / mobile / RTL manual smoke is **out of scope for this branch** — defers to:
- Lighthouse audit at v3.2.0 release (per Direction 7 D2 pattern).
- Mobile install dogfood at v3.2.0 release.
- ulpan cohort UAT at Direction 11 deployment.

---

## Known limitations / deferred

Documented as v3.3 follow-ups (per re-audit + hardening reports):

- **L1** — per-line diff is set-intersection, not Myers/LCS. Reordered identical lines show as `kept` on both sides. Acceptable for short notes.
- **L2** — per-keystroke autosave + 30s debounce can create up to ~50 versions on a long editing session. FIFO retention bounds storage; delta-versioning is a v3.3 optimization.
- **Skip-mode sentence-targeted advanced notes** — when text is collision-skipped on import, sentence-level remap isn't computed; sentence-bound advanced notes for that text drop. Acceptable for v3.2.
- **Hebrew locale strings** — machine-grade for v3.2.0 baseline; native review pass scheduled before Direction 11 ulpan deployment.
- **Functional code-split of `public/index.html`** — Direction 7 v3.3+ epic, unrelated to notes.

---

## Cross-direction impact

- **Phase 11.0 (Analytics Foundation)** — note save / edit / delete events (`save_note` / `note_edit`) already emit correctly from both legacy and polymorphic save paths (verified in re-audit). Direction 11B aggregation pipeline will see polymorphic note counts via existing `events` table.
- **Phase 9.2 (audio anchoring)** — schema (`audio_anchor_ms`, `audio_asset_key`) already in place; UI hook can land cleanly on top of existing target_kind='sentence' + note_type='pronunciation_note' UX.
- **Phase 9.3 (templates / links / SRS micro-cards)** — placeholder banners in modal say "Coming in Phase 9.3"; schema fields ready (`body_json` flexibility, `srs_card_id` FK).
- **Phase 9.4 (morphology)** — root extractor sidecar will populate `target_id` for `target_kind='root'` notes via the existing autocomplete UX.

---

## Recommendation

**Merge `worktree-agent-ad33453576637a27d` into `main`.** All commits reviewed; all baselines preserved; all documentation current.

Post-merge actions for next session:
1. Update `docs/PREMIUM_NOTES_PLAN_v3_2.md` + `docs/PREMIUM_RELEASE_PLAN_v3_2.md` live-status: Phase 9.1 fully `[x]`.
2. Update `CHANGELOG.md` "Shipped (so far)" with Phase 9.1 entry.
3. Update memory: Phase 9.1 closed.
4. Stage 4 of the original master plan: continue Direction 9 with **Phase 9.2 (audio anchoring)** OR defer to v3.3 depending on remaining v3.2 scope.

---

**Last updated:** 2026-05-11 (Stage 5 commit)
