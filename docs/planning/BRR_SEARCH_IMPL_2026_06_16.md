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

## ⏳ P1 (S7–S10) · P2 (S11–S16) — in progress
Big bricks pending owner approval of their `<TICKET>` recon-designs: S8 KWIC, S11 scoped, S13 saved-lists, S15 in-reader-find.

## 🔑 OPEN (owner)
Rotate `AUDIO_UPLOAD_TOKEN` (leaked) + Gemini + old GCP — blocks repo publish + ③ corpus publish (NOT this block's code).
