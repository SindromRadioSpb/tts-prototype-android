# BRR-S8 — KWIC / Concordance (recon-design, owner approval before code)

> Big brick of the approved S1–S19 search closure. «Все вхождения слова/фразы по корпусу с контекст-строкой + частота».
> Roles R7 (literary scholar — concordance is a scholar tool) · R10 (morphology — what counts as an occurrence) · R4 (UX).

## What it is
A concordance view: for a queried word/phrase, list **every occurrence** as a KWIC line (keyword-in-context: the matched
word centred, ±N words on each side), grouped by work, with a **total frequency** and per-work counts. The scholar's «где и
как употребляется это слово во всём каноне».

## Data-feasibility (recon)
- **Frequency across ALL indexed works** is free: the lemma/exact posting lists already carry per-work counts (`tf`) +
  positions. Sum → total occurrences; per-work `c`/`pos.length` → per-work frequency. Covers all 10,229 indexed works.
- **The context LINE needs the body** (`works/<id>.json`) → available only for **ready** works on the client (snippets reuse
  this). Non-ready works: we honestly know the count + that they contain it, but cannot render the context line (no body).
- `MAX_POS=16` caps stored offsets per (token, work) → KWIC shows up to the first 16 occurrences per work (honest note).

## Variants (role analysis)
- **V1 — ready-context KWIC (RECOMMENDED).** Frequency + per-work counts across ALL works (from the index); context KWIC
  lines rendered for **ready** works (lazy body-fetch, same path as S1). Non-ready works listed with count only («N вхождений ·
  перевод позже»). Honest, DATA-FEASIBLE now, no builder/token. [R7 scholar value · R4 no-second-class · R9 honest coverage]
- **V2 — full KWIC via a builder snippet field.** Emit a per-occurrence context window into the FTS build. Breaks the compact
  «no per-line text» index (size ↑, token-push), and still only ready works have a bilingual line. ✗ Not worth it.

## Recommended design (V1)
- **Entry point:** on a SINGLE-word (or phrase) search, a «📑 Конкорданс (N)» affordance above the in-text groups → opens a
  concordance view. (Concordance is most meaningful for one word/phrase, not an AND query.)
- **Engine:** new `CorpusFTS.concordance(query)` → `{ total, perWork:[{w, count, positions}] }` from the loaded posting lists
  (exact ∪ lemma positions, deduped per work). Pure-ish (uses the lazy loader); gate-testable via injected shards.
- **View:** `renderConcordance(query)` (Room-only, library-ui): a header («слово · N вхождений в M текстах»), then per-work
  cards — ready works lazy-fetch the body, map each position→row (cumulative token count per row), render the KWIC line
  (he ±N words, keyword `<mark>`-centred; + the ru line under it), tap → opens the work AT that row (reuse openCorpusWork +
  ftsQuery jump). Non-ready works: count-only row, honest «перевод позже». Lazy + single-flight (snippet discipline).
- **Honesty:** «контекст показан для готовых текстов»; MAX_POS note when count > shown.

## Gates / norms
New `smoke:corpus-concordance` (engine `concordance` over injected shards: total + per-work counts + dedup; position→row
mapping helper). reader-core/index.html untouched. SW `CACHE_VERSION` + i18n `room.corpus.concordance.*`. @380px RTL light+dark
+ browser e2e (a frequent word → concordance view, KWIC lines on ready works, count-only on non-ready, 0 console-errors).

## Recommendation: **V1**. Approve to implement, or redirect.
