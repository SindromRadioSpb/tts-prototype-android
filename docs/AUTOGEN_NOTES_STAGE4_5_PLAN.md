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

## 3. Stage 4 — Concept D (Option B) — ✅ SHIPPED (`v3.9.0-srs-seed`, commit `c1b4804`)

Synthesis rung «generation = knowledge growth», kept in the **locked SRS lane** (memory
`project_srs_strategy`: creation+linkage; review → Anki; in-app Trainer = stub; SRS epic → v3.4).
Owner forks: **D-0 = B** (seed + analytics now; **Phase-4 quiz DEFERRED** as a separate decision because
an in-app quiz/review re-opens the Anki-review stance), **D-1 scope = i+1 frontier**, **D-1 trigger =
explicit / opt-in**. Plan `~/.claude/plans/glistening-noodling-puffin.md`. Shipped:
- **Coverage (read-only, no migration):** `ldb.getTextLearningCoverage(textId)` (`local-db.js`) → per-text
  `{known,learning,weak,new, i1_ratio, frontier:[noteId…]}` over canonical word_study notes via
  `note_occurrences` + `getLearningStateOverlay()`. **i+1 frontier** = uncarded note whose root family has
  a non-`new` sibling (you've started this root — next sense); cold-start roots excluded (no SRS flood).
- **Seed (creation only):** `v3NotesSeedFrontierToSrs(textId)` (`index.html`) → `ldb.srs.createCardFromNote`
  per frontier note. **NOTE: it's `ldb.srs.createCardFromNote`, NOT `ldb.createCardFromNote`** (method of the
  `export const srs = {…}` object). Idempotent, word_study, per-note try/catch.
- **Trigger:** setting `V3_NOTES_SRS_SEED_KEY` (off default) in `morph-settings-ui.js`; explicit one-tap
  seed via the review-commit toast action button (`showToast` opts.action); opt-in auto-seed on
  review-commit + eager build when the setting is on. Toast reinforces Anki export.
- **Growth surface:** `v3NotesCoverageLine(cov)` «📚 {t} · ✅{k} 🔄{l} 🆕{n} · i+1 {p}%» in the commit toast.
- **Gate** `npm run smoke:autogen-srs` 13/13 (buckets + i+1% + frontier selection + cold-start exclusion +
  idempotent seed + setting). All prior gates green.

### DEFERRED — Knowledge-Map Phase 4 (generative quiz + i+1 «learn next»), a SEPARATE owner decision
`public/js/knowledge-map-quiz.js` (does NOT exist) — KM doc `docs/KNOWLEDGE_MAP_REDESIGN_v3_8.md:187`.
An in-app generative quiz overlaps the locked «review → Anki / Trainer = stub» strategy, so it needs an
explicit strategic go-ahead before building (it is NOT just the next mechanical step).

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
