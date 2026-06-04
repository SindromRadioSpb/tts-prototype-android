# ②-Note Autogen — Stage 2 (Concept C UI) — Plan & Handoff

**Status:** ready to start in a fresh session. Stages 1.1–1.3 are DONE, pushed, PROD-deployed
(`v3.8.2-autogen-persist`), and PROD-verified. This doc is the single source for Stage 2 so the
work can be picked up without re-deriving context. **Start the new session with `EnterPlanMode`**,
confirm the two architectural forks (§4) by role-lens with the owner, then implement.

Related: design `~/.claude/plans/zippy-herding-puffin.md` · stage-1.2 plan
`~/.claude/plans/gleaming-plotting-quilt.md` · memory `project_autogen_notes` · parity logic
`scripts/premium/build-notes-from-bundle.js`.

---

## 1. What already exists (1.1–1.3) — the API Stage 2 builds on

- **Engine** `window.v3NotesAutoGenForText(textId, opts)` → `{ ok, candidates:[{ dedup_key, body,
  confidence, status, occurrences:[{text_id,sentence_id,word_offset,surface}] }], stats }`.
  Offline, deterministic, NO DB writes. `status` ∈ `ok|review` (review = «на проверку»: low
  confidence / empty meaning, R1-honest). `body` = word_study fields (word/niqqud_variant/root/
  lemma/pos/part_of_speech/binyan/meaning/pealim_id).
- **Persist** `window.v3NotesAutoGenPersist(candidates, {source:'curated'})` → `{ ok, new_words,
  new_roots, created, refreshed, occurrences_recorded, skipped }`. Dedup-upsert vs the whole base
  by `gen_dedup_key`; creates new sense-lemmas else adds occurrences; never clobbers `user_touched=1`.
- **ldb** (local-db.js): `createCanonicalNote`, `findNoteByDedupKey`, `addNoteOccurrence` (idempotent),
  `listNoteOccurrences`, `refreshCanonicalNoteBody`. Canonical notes: `target_kind='word'`,
  `target_id=gen_dedup_key`, **`text_id=NULL`**, provenance columns (source/confidence/model_version/
  user_touched), occurrences in `note_occurrences`.
- **Core** `public/js/notes-autogen.js` (`window.NotesAutoGen`, also Node `require`): pure resolver.
- **Gates** (npm): `audit:autogen-quality`, `smoke:autogen-parity`, `smoke:autogen-persist`.

---

## 2. Stage 2 scope (owner-locked: Concept C — curated batch + review queue)

A text-card action **«✨ Построить знания»** → run the engine → a **review queue** @380px RTL →
**review-first** (persist only accepted) → growth badge + map fills.

1. **Text-card button.** Add `data-act="buildkn"` next to the existing `«Обогатить (Dicta)»`
   (`data-act="enrich"`). Handler `v3ReviewQueueOpen(textId)`.
2. **Pre-flight.** If the text has no `sentence_morph` (user text), DON'T run — offer the existing
   `«Обогатить (Dicta)»` (`v3LibraryEnrichMorph(id)`) first (consent/BYOK). Bundle texts already
   have morph → run directly.
3. **Run + rank.** `v3NotesAutoGenForText(textId)` → candidates. Rank **novelty → i+1 → freq**:
   novelty = `findNoteByDedupKey(dedup_key)` miss (new sense) or new root vs base; i+1 = graph
   status (known/learning/new — approximate from kmap if available); freq = `occurrences.length`.
   Mark already-known candidates «уже в базе» (will only add an occurrence) so they don't flood.
4. **Review queue modal** (`.v3-modal`, scrollable). Per candidate card: word + niqqud, POS, root,
   meaning, **confidence badge**, **status** (`review`→«на проверку» amber), «уже в базе» chip.
   Actions: **Принять / Править / Пропустить**; header **«Принять все high-confidence»** + counts.
   «Править» = inline meaning edit (for `review`/empty) — sets the edited body.
5. **Accept → persist.** Collect accepted → `v3NotesAutoGenPersist(accepted, {source:'curated'})`.
   Show growth badge **«+N слов, +M корней»** from the return. Refresh reading-view note counts +
   rebuild the knowledge map (additive).
6. **i18n.** New keys `library.buildkn`/`buildknTitle` + a `review.*` family in ru/en/he
   (HE best-effort, flag for native review).

---

## 3. Exact integration anchors (verified file:line — 2026-06-04)

### 3a. Text-card button
- `public/index.html:23099–23108` — `.v3-lib-card-actions` button row. Add after the `enrich`
  button (`:23104`):
  `<button class="btn-secondary" data-act="buildkn" title="${t('library.buildknTitle')}">${t('library.buildkn')}</button>`
- `public/index.html:23111–23130` — event binding block. Add:
  `const b=card.querySelector('button[data-act="buildkn"]'); if(b) b.addEventListener('click',()=>v3ReviewQueueOpen(id));`
- `public/index.html:4073–4087` — `.v3-lib-card-actions [data-act=…] { order: N }`. Add
  `[data-act="buildkn"] { order: 5.5 }` (between enrich=5 and archive=6).
- Existing enrich handler (pattern to mirror, incl. `getSentenceMorphCoverage`): `:23111` area;
  enrich fn `v3LibraryEnrichMorph(id,{force})`.

### 3b. Review-queue modal (reuse `.v3-modal`)
- Modal CSS/structure `:3607–3620` (`.v3-modal`/`.v3-modal-panel`); body scroll `:3687–3691`;
  **mobile button-trap exemption already present** `.v3-modal button{width:auto}` `:2220–2224`.
- Open/close pattern to copy: `v3LibraryOpen()` `:22219`, `v3LibraryClose()` `:22282`
  (`.classList.remove/add('hidden')`). Create `v3ReviewQueueOpen/Close` + a new
  `<div id="v3ReviewQueueModal" class="v3-modal hidden">` near the other modals.
- Bottom-sheet alternative (if preferred on mobile): `.v3-bottom-sheet` `:7569–7620`.
- After injecting dynamic content, call `applyI18n()`.

### 3c. i18n
- HTML `data-i18n` / JS `t(key)` or `v3NotesT(key,fallback)` (`:36372`). `applyI18n()` `i18n/index.js:65`;
  RTL auto via `appSetLocale('he')`→`dir="rtl"` (`i18n/index.js:43–52`).
- Locale files `public/i18n/locales/{ru,en,he}.js` — `library:` object ~`ru.js:332–391` (add
  `buildkn`,`buildknTitle`); add a `review:` block. **SW CACHE_VERSION bump** required (locale +
  shell change).

### 3d. Reading-view + editor (FORK 1 — see §4)
- Count badge prime: `v3NotesRowCountsPrime(textId)` `index.html:39541–39557` →
  `ldb.getRowNoteCounts` `local-db.js:1202–1219`.
- Per-row list (on row click): `v3NotesRowCacheRefresh` `index.html:39520–39535` →
  `ldb.listNotesForRow(textId,sentenceId)` `local-db.js:1183–1195`.
- Row button/count render: `v3NotesUpdateButtonRow` `index.html:42204–42258`.
- Word→note open-by-position: token-pick builds `target_id='<sid>:<offset>'`
  `v3NotesTokenPickerPick` `index.html:39248–39251`; open `v3NotesRowIndexOpenNote` `:41553–41567`;
  load `v3NotesLoadFullNoteIntoModal` `:38348–38429`; `getNoteById` `local-db.js:1222–1225`.
- Word-note search: `searchWordNotes` `local-db.js:1251–1277` (used at `index.html:~21127`).

### 3e. Knowledge map (FORK 2 — see §4)
- Feed query (reads ALL notes_v2, no source/text_id filter — canonical auto-appear):
  `_fetchNotes` `knowledge-map-data.js:90–99` (extracts root/binyan/word/pos; **NOT** pealim_id/meaning).
- Node key `var lk="word:"+lemma` `:147`; node build loop `:130–172`; root→lemma linkage `:163–171`;
  edges `:177–202`.
- Consumers: `_currentClusterLemmas` `knowledge-map-view.js:163–170` (filters by `root.lemmaKeys`/
  `lemma.id` — must stay key-consistent); edge label `:340–343`; preview fetch uses `noteIds[0]`
  (`:394–427`, key-independent → safe); saved views store only root keys (`:215–221`, safe). No
  quiz/i+1 dependency on lemma keys.

---

## 4. Architectural forks — confirm by role-lens in the new session's plan

### FORK 1 (R4 premium-UX) — surface canonical notes in reading-view + editor
**Problem:** canonical notes have `text_id=NULL` and positions only in `note_occurrences`, so the
current text/position queries can't see them → a built note would be invisible in the reading flow
(a dead-end — violates R4 «без тупиков»).

**Recommended (additive, low-risk):** add `note_occurrences`-aware variants and route the
reading-view through them:
- New `ldb.getRowNoteCountsWithCanonical(textId)` — UNION the current query with
  `notes_v2 n JOIN note_occurrences o ON o.note_id=n.id WHERE n.text_id IS NULL AND o.text_id=?`
  grouped by `o.sentence_id`.
- New `ldb.listNotesForRowWithCanonical(textId,sentenceId)` — UNION current with
  `… JOIN note_occurrences o … WHERE n.text_id IS NULL AND o.sentence_id=?`.
- Editor open-by-position: when a tapped word has no legacy positional note, look up
  `note_occurrences` by `(sentence_id, word_offset)` → `note_id` → open the canonical note via
  `getNoteById`. Legacy `sid:offset` notes keep working (check both).
- Optionally extend `searchWordNotes` to LEFT JOIN occurrences so canonical notes are searchable.
Update call sites `v3NotesRowCountsPrime` / `v3NotesRowCacheRefresh` to the new methods.
**Trade-off:** touches shipped reading-view hot paths → guard with the existing reading-view smokes
+ a new occurrence-visibility check. R2/R5: notes must be visible where the user reads → required.

### FORK 2 (R3 graph architect) — homograph sense-collapse in the map
**Problem:** map keys nodes by `"word:"+norm(word)`; canonical notes split senses by `pid/pos`
→ two senses collapse into one node (status/freq/binyan averaged across senses — R3/R2 wrong).
Three options (full blast-radius in §3e — the boundary is clean: only the key formula + root
linkage matter; preview uses noteIds, saved views use root keys):
- **A — keep word-form key + sense badges.** Zero breakage; homographs still collapse. Cheapest.
- **B — split by pos** (`"word:"+lemma+"#"+pos`). Homographs separate; per-sense status/binyan; no
  new data (pos already extracted). Moderate.
- **C — split by pid|pos** (`pid?"word:pid:"+pid:"word:"+lemma+"#"+pos`) — **aligns EXACTLY with the
  canonical `gen_dedup_key`**; future sense-level SRS/i+1; add `pealim_id`+`meaning` to `_fetchNotes`.
  Highest value, moderate complexity, more nodes (mitigate: label=lemma + sense chip).
**Recommendation: Option C** (degrade to pos when no pid) — it makes the map a true mirror of the
canonical note base and unlocks i+1/quiz on senses (Knowledge-Map Phase 4). Confirm with owner;
if homographs are deemed rare/low-value now, B is the safe interim. **Do this atomically** (key
formula + `root.lemmaKeys` in one change) to avoid silent root→lemma mismatch.

---

## 5. Verification

- `smoke:autogen-parity`, `audit:autogen-quality`, `smoke:autogen-persist` stay green.
- New: occurrence-visibility smoke — build knowledge from a bundle text, assert the canonical notes
  appear in `listNotesForRowWithCanonical` + the per-row count badge, and the editor opens the
  canonical note from a word tap.
- Knowledge-map smoke — after Fork 2, a known homograph root renders separate sense nodes (or badges
  per chosen option) with per-sense status; root→lemma edges intact (`_edgeLabelFor` non-empty).
- Browser @380px RTL screenshots of the review queue (accept/edit/skip, «принять все high-conf»,
  growth badge, «уже в базе», «на проверку» amber). Watch the `button{width:100%}` trap (exempt via
  `.v3-modal`).
- `smoke:conj` 17/17 no pageerror; `audit:note-fields` 0 R1.
- **SW CACHE_VERSION bump** (shell + locale changes). Push → Coolify → wait for prod version → PROD
  check (warm InflectionDict, build-knowledge end-to-end on a real text).

---

## 6. Session-start prompt (paste into the new session)

> Continue the ②-note autogen feature — **Stage 2 (Concept C UI)**. Stages 1.1–1.3 are DONE +
> PROD-deployed (`v3.8.2-autogen-persist`); the engine (`window.v3NotesAutoGenForText`) and persist
> (`window.v3NotesAutoGenPersist`) + ldb canonical methods are live but **dormant (no UI)**. Read
> **`docs/AUTOGEN_NOTES_STAGE2_PLAN.md` first** (full scope, exact integration anchors, the two
> architectural forks with role analysis), then memory `project_autogen_notes`. Apply R1–R5; owner
> invariant «бескомпромиссное качество, без заглушек»; verify on PROD linguistpro.kolosei.com (not
> just locally); bump `sw.js` CACHE_VERSION on shell/locale change; agents for sweeps, mechanics by
> reading code. **Start with `EnterPlanMode`:** present the review-queue UI plan + the two forks
> (R4 reading-view/editor `note_occurrences` JOIN; R3 knowledge-map sense key — options A/B/C, rec C)
> with a recommendation, and ask the owner to confirm before implementing. Don't commit unrelated
> working-tree changes (pre-existing untracked: `docs/UX_AUDIT_2026_05_29.md`,
> `scripts/premium/conj-prefix-browser-check.js`).
