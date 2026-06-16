# BRR Search & Discovery closure — implementation log (S1–S16)

> Implements the APPROVED canon `BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md` (S1–S19) in one pass, by phase
> P0(S1–S6) → P1(S7–S10) → P2(S11–S16). Big bricks (S8 KWIC · S11 scoped · S13 saved-lists · S15 in-reader-find)
> get their own recon-design `<TICKET>` doc + owner approval before code. Norms: reader-core builder + index.html
> NOT touched (`smoke:reader-parity`); reader features POST-render on Room mount; MEASURE before code (non-empty
> profile); gates green before push; SW `CACHE_VERSION` + `FTS_DATA_REV` bumped only on format change; @380px RTL light+dark.
> Roles R1–R10 applied (`docs/PROJECT_ROLES.md`).

## Recon synthesis (what made this feasible without new producers)
- **Snippet (S1)** has NO per-line text in the FTS index (offsets are a flat token stream). The bilingual snippet
  is built CLIENT-SIDE from the work BODY `works/<id>.json` — the very payload the reader opens — so a snippet is
  shown ONLY for **ready** hits (a non-ready hit has no body → honestly no preview, R4/R8). The matched line is
  located with the existing `CorpusFTS.firstPhraseRow` → `firstMatchRow` (re-tokenise each row), same primitives the
  FTS drill-in already uses. Lazy (IntersectionObserver) + single-flight body cache → a 60-row page never fans out
  60 fetches (the `[[feedback-test-with-nonempty-profile]]` stampede lesson).
- **No builder / volume / token changes for P0.** `phraseOnlySearch` (S3) reuses the existing positional EXACT
  shards; `markSegments` (S2) is a pure client fn; snippet bodies are already shipped. → no `FTS_DATA_REV` bump, no
  `AUDIO_UPLOAD_TOKEN`. Only shell assets changed → SW `CACHE_VERSION` bump.
- **S10 (Anki/notes) is NOT token-blocked** — `createNote` writes a `word_study` note with a new `body_json.context`
  field, fully client-side. The `AUDIO_UPLOAD_TOKEN` only gates prod-volume uploads (FTS/audio/works push) + repo
  publish + ③ corpus publish — surfaced to owner, but it does not block this block's code.

---

## ✅ P0 — finish «find» (category bar) — SHIPPED (SW v3.10.64-fts-snippet)

| # | What shipped | Where | Role |
|---|---|---|---|
| **S1** | Bilingual snippet of the matched line under each **ready** result row (he-niqqud + russian); lazy via `IntersectionObserver` (`getSnipObserver`, 250px) + single-flight body cache (`_workBodyCache`); matched line via `firstPhraseRow`→`firstMatchRow`; honest **no snippet** when the line can't be located (title/author-only match) or the hit is non-ready | `library-ui.js` (`loadWorkBodyRows`/`observeRowSnippet`/`fillRowSnippet`/`renderCorpusWorkRow`), `library.html` CSS | R4/R6 |
| **S2** | Niqqud-insensitive **`<mark>`** of the query in the title, author, and snippet — word-level (a word whose skeleton CONTAINS a query token, same rule as `firstMatchRow` → proclitic/substring), amber, no underline (никуд-safe), XSS-safe DOM nodes | `corpus-fts.js` `markSegments` (pure, gated) + `library-ui.js` `appendMarkedHebrew` | R4 |
| **S3** | **Progressive phrase group** — `CorpusFTS.phraseOnlySearch` resolves «Точная фраза» from the small EXACT prefix shards (~1.3MB) BEFORE the 6.5MB lemma layer loads; `appendFtsGroup` is two-stage (phrase painted, spinner kept below, then «Слова в тексте» fills). Phrase hit-set is identical to `phraseSearch` (same positional field) → no dupes | `corpus-fts.js` `phraseOnlySearch` + `library-ui.js` `appendFtsGroup` | R4/R5 |
| **S4** | Input polish — inline **✕ clear** (mouse/touch; `tabindex -1`), **Enter** = search now (skips the 200ms debounce), **Escape** = clear + keep focus, focus returned after ✕ | `library-ui.js` `buildCorpusFilterBar`, `library.html` CSS | R4 |
| **S5** | Relevance — already phrase>exact>lemma (`scoreHits` exactBoost + `phraseSearch` phrase-first sort, deterministic `a.w` tiebreak); the title/author group renders ABOVE the in-text groups (title-boost), then «Точная фраза», then «Слова» → stable order preserved by the two-stage render. (Optional readability-boost folded into S7.) | existing engine + render order | R5/R10 |
| **S6** | Count clarity — when there's a text query the summary count reads **«По названию: N · В тексте: M»** (`corpusCountLabel`, merged in after the async FTS resolves with a trailing «…») so a «0» can't read as «nothing found»; a filter-only view keeps the plain count | `library-ui.js` `renderResultsInto`/`appendFtsGroup`/`corpusCountLabel` | R4 |

**i18n:** `room.corpus.search.byTitle` + `clearInput` (ru/en/he). **Gate:** new `smoke:corpus-snippet` (18 checks:
markSegments lossless/niqqud/substring/fold/degrade · phraseOnlySearch adjacency/no-lemma/single-token/non-positional ·
firstPhraseRow/firstMatchRow on raw body rows). **SW** `CACHE_VERSION=v3.10.64-fts-snippet`.

### P0 verification
- Gates green: `smoke:corpus-snippet` 18/0 · `smoke:corpus-fts` 48/0 · `smoke:corpus-fts-parity` 30/0 ·
  `smoke:reader-parity` PASS · `smoke:i18n` 226/0. ESM/UMD syntax checks pass.
- Browser @380px (local fresh code, real FTS shards + 796 bodies), light **+ dark**, 0 console errors:
  phrase «אל תקלליני» → «🔎 Точная фраза (2)», work 297 «למרים» shows the matched line «נָא אַל תְּקַלְלִינִי אָז»
  («אַל תְּקַלְלִינִי» amber-marked) + «Тогда молю: не проклинай меня,»; non-ready hit honestly shows no snippet;
  count «По названию: 0 · В тексте: 3»; ✕/Enter/Escape all work.

### Lessons (P0)
- **Row opts carry the query at `opts.openOpts.ftsQuery`, not `opts.ftsQuery`** — `appendPagedWorkRows` merges
  `{openOpts:{ftsQuery}}` into the row opts so the open handler can thread it; the mark/snippet path must read the
  same nested location. (Caught only in the browser — the unit gates don't exercise the row-opts plumbing.)
- The voweled display string has niqqud BETWEEN consonants, so a literal `/word/` regex over display text fails;
  match on the **skeleton** (`normalizeToken`), never the raw voweled string.
- A global-flag regex (`/…/g`) is unsafe for `.test()` in a char loop (lastIndex state) → added a non-global
  `NIQQUD_ONE` twin in corpus-fts.js for `markSegments`.

---

## ✅ P1 (non-big: S7 · S9 · S10) — SHIPPED (SW v3.10.65-fts-discovery)

| # | What shipped | Where | Role |
|---|---|---|---|
| **S7** | **Readability-aware search** — «📖 Читаемые для меня» filter chip (i+1 zone in/easy vs the LIVE profile) + a lazy **«≈N%»** coverage badge on ready result rows. The readable-set is built ONCE from the vocab sidecar + a SINGLE `ensureWordStates` snapshot (`ensureReadableSet`, anti-stampede — never a per-row DB query), cached + invalidated on word-save. Badge reuses `observeCardCoverage`/`enhanceCardWithCoverage` (now targets `.work-card-meta, .corpus-work-meta`). Honest: empty profile → no readable hits, no badge | `library-ui.js` (`ensureReadableSet`/`corpusFilter.readableOnly`/`corpusApplyFilter`/`appendFtsGroup` passFilter/`renderCorpusWorkRow`/`buildCorpusFilterBar`), `CorpusVocabRoom.refresh` | R8/R2 |
| **S9** | **Root/lemma vs exact-form mode** — the default search is already lemma-tolerant («по корню» — all forms of the root); added a **«🔤 Точная форма»** toggle that restricts the in-text «слова» group to the literal consonantal form (engine `phraseSearch`/`search` gain `exactOnly` — skip the lemma layer). Group relabels «Точная форма в тексте» | `corpus-fts.js` (`exactOnly`), `library-ui.js` (`corpusFilter.exactForm` + chip + `appendFtsGroup`) | R10/R1 |
| **S10** | **Search→study hook** — «💾 В заметки» on each ready snippet saves the matched line as a study artifact: a SINGLE-word query → a `word_study` note for that word grounded in the authoritative Pealim pid (`CorpusFTS.pidForToken` → folds to `pid:<id>`, joins i+1 coverage + the Anki word export) with the bilingual line as `body.context` (no fabricated morphology — empty, enriched later in the reader); a PHRASE → a `free` example note. Client-side `createNote` — **NOT token-gated** | `corpus-fts.js` (`pidForToken`), `library-ui.js` (`saveSnippetToNotes` + snippet action), `library.html` CSS | R2 |

**i18n:** `room.corpus.facets.readable` · `room.corpus.search.{exactForm,exactFormHint,exactWords,saveToNotes,savedToNotes,saveFailed}` (ru/en/he). **Gate:** `smoke:corpus-snippet` extended to 22 (exactOnly subset + pidForToken). SW `CACHE_VERSION=v3.10.65-fts-discovery`.

### P1 verification
- Gates: `smoke:corpus-snippet` 22/0 · `smoke:corpus-fts` 48/0 · `smoke:corpus-fts-parity` 30/0 · `smoke:corpus-vocab-engine` 37/0 · `smoke:reader-parity` PASS · `smoke:i18n` 226/0.
- Browser @380px, 0 console errors: **S7** with a REAL seeded profile (learn one short work's lemmas → it reaches zone easy/100%) → «📖 Читаемые» narrows to readable works + «≈100%» badge renders («много имён/архаики» load-flag too). **S9** «מלך» all-forms count ≥ exact-form count, group relabels. **S10** «💾» writes a `word_study` note to `notes_v2` with `context` + `pealim_id` (DB-verified).

### Lessons (P1)
- **Headless OPFS does not durably persist across reload** in a Playwright context (lock/flush race) — a returning-user profile can't be verified via seed→reload. Verify the live session instead: seed via `localDb.createNote`, then drop the boot-cached snapshot (`CorpusVocabRoom.refresh`) so the live page re-reads. (`refresh()` is also a genuine API for external profile changes.)
- A word saved from search must carry its **`pealim_id`** to fold to `pid:<id>` — without it the note keys on `norm#pos` and never joins the pid-keyed corpus-vocab (S7 coverage wouldn't update). `lemmamap` (already loaded by search) provides the pid cheaply.

## ✅ P2 (non-big: S12 · S14 · S16) — SHIPPED (SW v3.10.66-fts-discovery2)

| # | What shipped | Where | Role |
|---|---|---|---|
| **S12** | **Recent searches + cold-start suggestions** — a chips row under the filter bar (home only): recents from `localStorage` (prefix-collapsed so a typing progression keeps only the refined query; max 8) with a ✕ clear-history; an empty history falls back to honest «Попробуйте» high-frequency prompts. A chip sets the query + warms shards | `library-ui.js` (`getRecentSearches`/`pushRecentSearch`/`paintRecents`/`setSearchQueryFromChip`; recorded in `applyQuery`; toggled in `corpusRefreshL1Body`), `library.html` CSS | R5 |
| **S14** | **Related / «ещё у автора»** — the author under a result row is a tappable link → the author's full works drill (`corpusNavToAuthor` → existing Период→Автор→Работа; robust to a missing era by scanning the author index). stopPropagation so it never opens the work | `library-ui.js` (`corpusNavToAuthor` + `renderCorpusWorkRow`), `library.html` CSS | R6 |
| **S16** | **Advanced filters (provenance)** — «🔊 С аудио» + «✍ Проверено» chips (`hasAudio`/`reviewed`), joined from the ready card (`audio_status` / `review_status`) so they imply readable works (a non-ready row has no card → excluded honestly). **Length** deferred (the L3 already has a length sort); **niqqud-ratio** deferred (needs a new corpus-search field + token-gated push — documented, not faked) | `library-ui.js` (`corpusAdvOk`/`corpusApplyFilter`/`appendFtsGroup`/chips), i18n | R6/R9 |

**i18n:** `room.corpus.search.{recent,try,clearRecent,moreByAuthor}` · `room.corpus.facets.{hasAudio,reviewed}` (ru/en/he). SW `CACHE_VERSION=v3.10.66-fts-discovery2`.

### P2 non-big verification
- Browser @380px, 0 console errors: **S12** home shows «Попробуйте» + suggestion chips → click runs the query → after clearing, it appears under «Недавние». **S14** the author link on a result row navigates to that author's L3 works. **S16** «🔊 С аудио»/«✍ Проверено» chips toggle + name themselves in the summary. `smoke:i18n` 226/0, syntax OK.
- R4 note: the filter bar now wraps to ~4 rows of chips @380px — dense but clean; a future polish could collapse the advanced/provenance chips behind a «⚙» disclosure.

## ✅ BIG BRICKS — owner-APPROVED 2026-06-16 (all V1 recommended). Design docs `docs/planning/BRR_S{8,11,13,15}_*.md`.

### S15 in-reader find — SHIPPED (SW v3.10.67-fts-find)
A 🔍 in the reader bar opens a find bar (input + «k / N» + ↑/↓ + ✕) over the OPEN text: niqqud-insensitive
matches highlight in a distinct GREEN (jump=amber, playback=blue), current-match row accented + scrolled.
POST-render on the Room mount (class-toggle on rendered rows + morph `.rm-w` spans — the builder is
untouched, `smoke:reader-parity` green). Engine `CorpusFTS.findRows(rows,q)` (all rows containing ALL query
tokens, AND, skeleton-substring). i18n `room.reader.find.*`. Gate: `smoke:corpus-snippet` +5 (findRows = 27).
**Verification:** findRows gate (logic) + find-bar plumbing smoke (button→bar→runFind→counter→Escape, 0
errors) + reader-parity. The live marking/navigation e2e is the owner's on-device smoke-check — opening a
work uses `importBundle`, which crashes wa-sqlite in HEADLESS Chromium (a harness limit; reader-open is
prod-proven daily). [R5 table-stakes · R4 RTL/a11y · R10 honest match]

### S11 scoped search — SHIPPED (SW v3.10.68)
Search inside an author (L3) / period (L2) via a «🔍 искать у автора / в периоде» entry on the header →
results scoped (predicate on `sr.a`/`sr.e` in `corpusApplyFilter` + the FTS `passFilter`), shown as a
removable «✕ в авторе/периоде: X» chip; the query persists across the drill. i18n `room.corpus.scope.*`.
Verified @380px: drill → scope → results restricted to one author → clear → global, 0 errors. [R6/R5]

### S8 KWIC / concordance — SHIPPED (SW v3.10.68)
«📑 Все вхождения» entry on a Hebrew search → a concordance view: corpus-wide frequency + per-work counts
(engine `CorpusFTS.concordance` = `search` reused; exact tf + lemma tf, ranked) with lazy KWIC context
LINES for READY works (body-fetch + `findRows`, keyword `<mark>`-centred, tap → open at the line);
non-ready works honest count-only «перевод позже». Generic lazy observer (anti-stampede). i18n
`room.corpus.concordance.*`. Gate `smoke:corpus-snippet` +1 concordance (30). Verified @380px («תקלליני»
→ header freq/texts + counts + KWIC lines + marks + back-nav, 0 errors). [R7/R10/R9]

### S13 saved searches + reading list — SHIPPED (SW v3.10.68)
«⭐ Сохранить поиск» → persists {query + all filters} to localStorage, surfaced as «⭐ Сохранённые поиски»
chips on home (tap re-runs/restores all filters; ✕ deletes). «➕ В список» on a snippet → toggles the work
into a «📚 Читать позже» reading list (localStorage), shown as a home shelf (opens ready items via the
corpus card flow; non-ready honest «перевод позже»; ✕ removes). i18n `room.corpus.{saved,lists}.*`.
**Design refinement (documented):** the approval said «reuse the shelves table», but a corpus work is
served-on-open (NOT an OPFS text) → the shelf renderer would mark it «unavailable»; localStorage + the
corpus card flow renders + opens it correctly, no migration, no headless-write crash. v1 ships ONE
reading list + multiple saved searches; multiple NAMED lists = a small documented follow-up. Verified
@380px: save→restore→delete a search; add→shelf→remove a work, 0 errors. [R6/R4]

## ✅ ALL S1–S16 SHIPPED + verified.

## ✅ P3 polish — «⚙» filter collapse + multiple named reading lists — SHIPPED (SW v3.10.69-fts-p3polish)
- **«⚙» collapsible filters:** the primary chips (Готовые/Читаемые) stay in the lean main row; the advanced
  ones (Точная форма · С аудио · Проверено · Жанр · Язык) collapse behind a gear (persisted
  `corpus_filters_expanded`; AUTO-expands when an advanced filter is active; gear shows «•»). Tames the dense
  @380px bar (default now ~2 rows). [R4]
- **Multiple named reading lists** (completes S13): storage `corpus_reading_lists_v1` = `[{id,name,items}]`
  (migrates the v1 flat «Читать позже»); «➕ В список» opens a bottom-sheet picker (toggle membership across
  lists + «+ Новый список» inline); home shows one «📚 <list>» shelf per non-empty list (per-card ✕ + per-list
  ✕). localStorage (corpus works are served-on-open, not OPFS texts). [R6]
- Verified @380px (gear collapse/expand/persist; picker add + inline-create a 2nd list; multi-shelf home;
  delete-list), 0 console-errors. i18n `room.corpus.facets.more` + `room.corpus.lists.{defaultName,addTo,newName,create,done,deleteList,untitled}`.

## ✅ S18 translit helper рус→иврит — SHIPPED (owner-approved authoritative path; SW v3.10.70-fts-translit)
A non-Hebrew (cyrillic) query → a «Возможно, вы искали: <иврит>» banner with authoritative Hebrew candidates.
**Producer** `scripts/premium/build-translit-index.js` (`build:translit`): word-aligns each body row's
`hebrew_plain` ↔ `translit_ru`, folds the translit to a coarse phonetic skeleton (`foldCyr` — collapses
ё/э→е, drops signs, collapses doubles), keeps the top-3 Hebrew surface forms by frequency (≥2), strips
punctuation from candidates. Output `public/data/benyehuda/translit-ru-v7.json` (41.5K keys, 1.3MB; committed
to git, immutable-cached, **lazy** — loaded only on a cyrillic query; **NO token**). **Client** (library-ui):
`loadTranslitIndex` (single-flight) + `foldCyrLib` (**byte-parity with the producer `foldCyr`**) +
`maybeTranslitSuggest` (banner in `renderResultsInto` for a cyrillic query; single word → top-3 chips,
multi-word → joined Hebrew phrase; a chip runs the Hebrew search). v1 = cyrillic only (SBL-latin is
digraph-mismatched → documented follow-up). Gate `smoke:translit` (15: fold parity + buildIndex
alignment/MIN_COUNT/clean/top-K). i18n `room.corpus.translit.maybe`. Verified @380px («шалом»→שלום→search;
«мелех адам»→מלך אדם), 0 console-errors. [R5/R2 · R1 honest (real transliterations, not a guessed map)]

## ⏳ P3 DEFERRED (owner-confirmed 2026-06-16 — documented, not built)
- **S17 inflection-tolerant PHRASE** — index-level needs POSITIONAL lemma data (breaks the 6.5MB always-loaded
  mobile budget R4/R5) + a token push; client ready-only re-scan is marginal (firstPhraseRow already does it on
  drill-in). DEFERRED. Cheap alternative if revisited: a `slop` gap-tolerance toggle on «Точная фраза» (phraseHit
  already takes `slop`, exact positions exist — no token, no budget hit).
- **S19 Knowledge-Map link (root→graph)** — KM (`window.KnowledgeMap`) is Studio-only (not in `library.html`); a
  root-focus deep-link would touch `index.html` (canon forbids) or load the full KM into the lean Room. DEFERRED
  to a Stage-2 decision.
- **FTS coverage → 26K** — mechanical (`fetch:corpus-bodies`→`build:corpus-fts`→`push`), but the push needs
  `AUDIO_UPLOAD_TOKEN` (LEAKED, pending owner rotation — reusing it would deepen the leak). BLOCKED until rotation.
- **S18 latin/SBL input** + **non-ready add-to-reading-list** — small follow-ups.

## 🔑 OPEN (owner)
Rotate `AUDIO_UPLOAD_TOKEN` (leaked) + Gemini + old GCP — blocks repo publish + ③ corpus publish (NOT this block's code; P0–P2-non-big shipped without it).

## 🔑 OPEN (owner)
Rotate `AUDIO_UPLOAD_TOKEN` (leaked) + Gemini + old GCP — blocks repo publish + ③ corpus publish (NOT this block's code).
