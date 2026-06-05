# ②-Note Autogen — Stage 4 (Concept D) + Stage 5 (Concept B) — Plan & Handoff

**Status:** ready to start in a fresh session. Stages 1–3 + the user_touched fix + symmetric note
sections are DONE, pushed, PROD-deployed (`v3.8.6-notes-sections`, HEAD `39be4b8`) and PROD-verified.
This doc is the single source so the next session picks up the full context without re-deriving it.
**Start the new session with `EnterPlanMode`**, confirm the forks (§3/§4) by role-lens with the owner,
then implement. Mirrors the role-driven workflow that shipped Stages 2–3.

Related: design `~/.claude/plans/zippy-herding-puffin.md` (concepts A/B/C/D, R1–R5) · memory
`project_autogen_notes` (full state) · Stage-2 anchors `docs/AUTOGEN_NOTES_STAGE2_PLAN.md` · Knowledge
Map redesign `docs/KNOWLEDGE_MAP_REDESIGN_v3_8.md` (Phase 4 spec). Apply roles R1–R5. Owner norms:
verify on PROD `linguistpro.kolosei.com`; bump `public/sw.js` CACHE_VERSION on any shell/locale change;
@380px RTL Playwright screenshot before `git add`; agents for sweeps, mechanics by reading code.

---

## 1. What is SHIPPED (the API the next stages build on)

- **Engine** `window.v3NotesAutoGenForText(textId)` → `{ok, candidates:[{dedup_key, body, confidence,
  status('ok'|'review'), occurrences:[{text_id,sentence_id,word_offset,surface}]}], stats}`. Offline,
  deterministic, no DB writes. `body` = word_study fields incl. `pealim_id`, `meaning`, `root`, `lemma`, `pos`.
- **Persist** `window.v3NotesAutoGenPersist(cands, {source})` → `{ok, new_words, new_roots, created,
  refreshed, occurrences_recorded, skipped}`. Dedup-upsert by `gen_dedup_key`; never clobbers `user_touched=1`.
- **Canonical notes** (ldb, `public/db/local-db.js`): `createCanonicalNote` / `findNoteByDedupKey` /
  `addNoteOccurrence` / `listNoteOccurrences` / `refreshCanonicalNoteBody` (raw SQL, honours user_touched).
  Surfacing: `getRowNoteCountsWithCanonical` / `listNotesForRowWithCanonical` / `getNoteByOccurrence` /
  `searchWordNotesWithCanonical` (UNION + `note_occurrences` JOIN, text_id IS NULL).
- **Concept C UI** `v3ReviewQueueOpen(textId)` / `v3ReviewQueueOpenWith(textId, candidates)` — review queue
  @380px. **Concept A** setting `V3_NOTES_AUTOGEN_KEY` (off/conservative/aggressive),
  `v3NotesMaybeAutoBuild(textId)` (background, partition `v3NotesAutoBuildClassify`), per-text pending pill,
  provenance badges, symmetric «✍ Ваши»/«✨ Авто» sections (`v3NotesRowIndexRender`).
- **user_touched (R1):** `ldb.updateNote` auto-sets `user_touched=1` on a user BODY change → edits survive
  regeneration + provenance badge flips.
- **Map (FORK 2):** `knowledge-map-data.js` keys nodes by sense (`pid|pos`, mirror of gen_dedup_key);
  `_fetchNotes` extracts `pealim_id`/`meaning`.
- **Gates:** `smoke:autogen-eager` 21/21, `smoke:autogen-surfacing` 9/9, `smoke:autogen-parity`,
  `audit:autogen-quality`, `smoke:autogen-persist`, `smoke:conj` 17/17, `audit:note-fields` 0 R1.

---

## 2. Stage 5 — Concept B (read-and-collect) — ✅ SHIPPED (`v3.8.7-collect`, commit `d14d557`)

One-tap collect: tapping a word in the token picker saves a canonical ②-note in one tap (morphology
pre-filled), no editor round-trip, behind a per-reader toggle, with an undo toast. Owner-locked forks:
**tap + undo toast** (R4) · source **`'curated'`** (R1, a deliberate tap = intent).
- **Hook wired:** `v3NotesTokenPickerPick` (`index.html`) branches to `v3NotesCollectToken(slot, offset,
  niqqudTok, plainTok)` when `v3NotesCollectMode()==='on'`, else the editor (unchanged).
- **R1 make-or-break:** the per-unit resolve was extracted into `_v3AutoGenResolveItem(maps, ldb, unit,
  occurrences)` and is now SHARED by the per-text engine loop AND the single-token collect → bodies are
  byte-identical (proven by the `smoke:autogen-collect` parity assert vs the engine candidate).
- **Collect:** offline `v3MorphStoredResolve` → unit → `_v3AutoGenResolveItem` → `buildCandidates` →
  `v3NotesAutoGenPersist([cand], {source:'curated'})` → silent `v3NotesRowCountsPrime` + library refresh →
  undo toast. No stored morph → falls back to the editor (no fabrication, R1).
- **Plumbing:** setting `V3_NOTES_COLLECT_KEY` (off default) + toggle in the morph-status modal; `showToast`
  gained a generic `opts.action={label,onClick}` button + `opts.ttl`; `ldb.removeNoteOccurrence` (undo for
  the occurrence-only case; `deleteNoteById` covers the created-note case). i18n ru/en/he.
- **Gate:** `npm run smoke:autogen-collect` (18/18 — deterministic block + real end-to-end + R1 parity +
  undo-button wiring + no-morph fallback).

---

## 3. Stage 4 — Concept D (synthesis: SRS auto-seed + novelty/i+1/growth analytics) — the PREMIUM PEAK

The «all five roles ★★★» vision: generation = knowledge-base growth, with i+1 sequencing + SRS seeding +
growth analytics. **D pairs with Knowledge-Map Phase 4 (generative quiz + i+1 «learn next»), which is NOT
implemented** — `docs/KNOWLEDGE_MAP_REDESIGN_v3_8.md:187` specs `public/js/knowledge-map-quiz.js` as a NEW
file to create (it does NOT exist yet; there is no stub). So D has a **sequencing fork**.

### FORK D-0 (sequencing) — confirm with owner FIRST
- **Option A (rec):** ship **Knowledge-Map Phase 4** (the quiz/i+1 engine) first — it's the missing
  substrate D leans on — then layer D's autogen-fed analytics + SRS seed beside it. Cleaner, but two
  sub-stages.
- **Option B:** do the D pieces that DON'T need Phase 4 now (SRS auto-seed + per-text growth analytics),
  defer the i+1-quiz coupling until Phase 4 lands. Faster value, partial D.

### D building blocks (grounded primitives)
- **SRS auto-seed:** `ldb.createCardFromNote(noteId)` — `public/db/local-db.js:2480`. Idempotent (returns
  the existing card if `srs_card_id` set); inserts `srs_cards` with `entity_type='note'` + back-pointer;
  **word_study only** (free notes rejected — autogen notes ARE word_study, so eligible). Hook after
  accept/auto-persist. **Fork D-1 (R2):** seed ALL new notes vs only the **i+1 frontier** (roots at the
  known→learning edge) — rec **frontier-only** («употребление > формы», avoid SRS flood).
- **Growth analytics:** extend the «+N слов/+M корней» badge to per-text **known/learning/new** coverage +
  i+1 ratio. Read-only queries over `notes_v2` + `ldb.getLearningStateOverlay()` (same pattern as
  `ldb.getAnalytics`). The 3-state overlay + `KnowledgeMapData.rankRoots` already exist.
- **i+1 «learn next»:** depends on Phase 4 (the quiz reconstructs a cluster + logs SRS). Until then,
  approximate via `rankRoots` + overlay (as the review queue already does for ranking).

### Verify (D)
- Smoke: accepting/auto-persisting seeds an SRS card (word_study) idempotently; frontier-only policy picks
  the right set; growth analytics counts match a seeded fixture. Keep all Stage-1–3 gates green.
- If Phase 4 is built: its own smoke (reconstruct-cluster loop + SRS events) per the KM doc §235.

---

## 4. Open follow-ups (deferred, not blocking — fold into whichever stage touches them)
- Provenance badge on RICH word-cards (`wordCardRich_v1` path; the section header already groups them) +
  notes-SEARCH-hit badge in `v3NotesRender`.
- Global persisted review inbox (needs a migration; today pending is per-text in-memory
  `v3NotesAutoBuildPending`, lost on reload by design).

---

## 5. Discipline / tripwires (carry into the new session)
- Do NOT commit pre-existing untracked `docs/UX_AUDIT_2026_05_29.md`,
  `scripts/premium/conj-prefix-browser-check.js`.
- **Bash tool ≠ PowerShell:** commit via `git commit -F <msgfile>` — `@'...'@` here-strings leak `@` into
  the message in bash (bit us twice; had to `--amend`).
- Browser OPFS smoke: `newContext({serviceWorkers:'block'})` + await `__localDBInitPromise` + retry
  `ensureLocalDB`. Lexically-scoped page globals (e.g. `v3ReviewQueueState`): `window.X=` won't reach them
  — use `window.eval`. Dismiss the first-load onboarding overlay before screenshotting modals.
- A prior Explore agent hallucinated `/api/notes/autogen` and a quiz "stub" — **neither exists**. Verify
  agent claims by reading code (the engine is `window.v3NotesAutoGenForText`, fully client-side).

---

## 6. Session-start prompt (paste into the new session)

> Continue the ②-note autogen track. Stages 1–3 + user_touched fix + symmetric «✍ Ваши»/«✨ Авто» note
> sections are DONE + PROD-deployed (`v3.8.6-notes-sections`, commit 39be4b8) + verified. **Read first, in
> order:** `docs/AUTOGEN_NOTES_STAGE4_5_PLAN.md` (THE source — shipped API, Stage 4 D + Stage 5 B plans,
> forks with role analysis, anchors, verification), then memory `project_autogen_notes`, then design
> `~/.claude/plans/zippy-herding-puffin.md`. Apply roles R1–R5; owner invariant «бескомпромиссное
> качество, без заглушек»; verify on PROD `linguistpro.kolosei.com` (not just locally); bump `sw.js`
> CACHE_VERSION on shell/locale change; @380px RTL screenshot before git add; agents for sweeps, mechanics
> by reading code; commit via `git commit -F` (bash ≠ PowerShell). **Decide the next stage with the owner
> and start with `EnterPlanMode`:** Stage 5 (Concept B, read-and-collect — small, independent, hook
> `v3NotesTokenPickerPick` index.html:39292) OR Stage 4 (Concept D — premium peak, but pairs with
> Knowledge-Map Phase 4 which is NOT implemented; present FORK D-0 sequencing + FORK D-1 SRS-seed policy by
> role and let the owner choose). Don't commit the two pre-existing untracked files.
