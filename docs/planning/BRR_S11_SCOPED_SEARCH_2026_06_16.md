# BRR-S11 — Scoped search (recon-design, owner approval before code)

> Big brick of the approved S1–S19 search closure. «Искать в этом авторе / периоде / жанре» + сохранять запрос при drill
> (сейчас сбрасывается). Roles R6 (librarian — navigation) · R5 (market — Sefaria-class scope).

## What it is
Restrict the full-text + title search to a **scope** (one author / one era / one genre) instead of always-global, and **keep
the query when drilling** (today navigating Период→Автор clears `corpusFilter.q`).

## Data-feasibility (recon)
- Every corpus-search row carries `a` (author), `e` (era), `g` (genre). Scoping = a `passFilter`/`corpusApplyFilter`
  predicate on those fields — same mechanism as the existing genre/lang facets. FTS hits (`sr`) carry the same fields.
- Genre is ALREADY a global facet; S11 adds **author + era** scope, plus query persistence across the drill.

## Variants (role analysis)
- **V1 — contextual scope token (RECOMMENDED).** When the user is inside an author (L3) or era (L2) and searches, results
  are scoped to that context, shown as a removable «× в авторе: <name>» / «× в эпохе: <era>» token in the results summary.
  An explicit «🔍 искать у автора» / «искать в периоде» affordance on the L2/L3 header sets the scope. Reuses the S14 author
  link mental model. [R6 librarian · R4 clear provenance of scope]
- **V2 — scope <select> in the global filter bar.** Adds an author/era dropdown to the (already dense) bar. ✗ Author has
  ~thousands of values — a select is unusable; era is fine but the bar is full (R4 clutter).

## Recommended design (V1)
- **State:** `corpusFilter.scopeAuthor` + `corpusFilter.scopeEra` (+ existing genre as scope-genre). `corpusFilterActive`,
  `corpusApplyFilter`, the FTS `passFilter`, and `corpusFilterSummary` honor them (filter `sr.a`/`sr.e`). A scope token in the
  summary clears just the scope.
- **Query persistence:** `corpusNavTo` no longer wipes `corpusFilter.q`; an author/era drill that has an active query opens
  scoped results for that context. Drilling without a query → the normal author/era browse (unchanged).
- **Entry points:** «🔍 искать у этого автора» on the L3 author header; «🔍 искать в периоде» on the L2 era header. Both set
  the scope + focus the search input.
- **Honesty:** scope is shown explicitly («× в авторе: X»); clearing scope returns to global.

## Gates / norms
Extend `smoke:corpus-snippet` (or a small `smoke:corpus-scope`): scope predicate over a synthetic search table (author/era
filter + query persistence flag). index.html/reader-core untouched. i18n `room.corpus.scope.*`. SW bump. @380px e2e (search
inside an author → only that author's hits; clear scope → global; query survives a drill).

## Recommendation: **V1**. Approve to implement, or redirect.
