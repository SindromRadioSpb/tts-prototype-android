# Reading Room current-state UX audit

> Date: 2026-08-11
>
> Baseline: repository `f3fc0643`, public Room `3.11.354`
>
> Scope: research only; no application or learner-data mutation

## 1. Executive diagnosis

The Reading Room is functionally much stronger than its visual presentation suggests. It already
contains offline morphology, context, full-text corpus search, personal activity filters,
difficulty estimates, known-word coverage, progress, notes, SRS signals, media, protected group
corpora, and mature reader behavior. The quality gap is therefore not “missing a prettier card.”
It is a mismatch between a sophisticated learning engine and a library shell that exposes its
capabilities as three independently evolved inventories.

The current experience has five systemic defects:

1. **No dominant learning action at L0.** The hub answers “which storage corpus?” before it answers
   “what is the best thing for me to learn now?”
2. **A declared uniform contract is not visually or behaviorally uniform.** Ben-Yehuda, My Texts,
   and Study Songs use different headers, navigation, filters, progress vocabulary, card geometry,
   and recommendation surfaces.
3. **Retrieval controls outrank content.** On mobile, search, selects, smart chips, facets, and
   owner tools occupy the first screen while the first text appears late or below the fold.
4. **Textual data is represented as large cards.** Sparse vertical panels waste space on desktop
   and mobile. Their borders are too subtle to group content, yet the repeated actions and chips
   make each panel noisy.
5. **The Ben-Yehuda home pays for the whole corpus at once.** It creates all 796 ready cards even
   though only a few are visible. The accessibility tree and tap-target defects expand with it.

The premium route is a unified **learning home + corpus lens + adaptive text row** system. Each
corpus keeps honest native capabilities, but all share placement and vocabulary for the learner's
next action, readiness, progress, saved state, and secondary controls.

## 2. Method and evidence quality

| Evidence | Environment | Confidence | Limit |
|---|---|---:|---|
| Repository/code inspection | current `main`, dirty owner tree preserved | high | shows implementation, not user perception |
| Public live audit | clean profile, production `3.11.354` | high for anonymous state | no owner content or protected corpus opened |
| My Texts smoke fixture | isolated seeded IndexedDB/local state | high for layout/contract | not owner-live or real 115-text distribution |
| Study Songs smoke fixture | isolated owner-role catalog | high for layout/controls | three seeded works, not real group data |
| Chrome performance trace | live hub → Ben-Yehuda, 380px | high for captured run | one run, not a statistical performance study |
| Lighthouse navigation snapshot | live Ben-Yehuda, 380px | high for automated checks | automated audits do not cover every UX issue |
| Visual inspection | 380px RU, HE/RTL; 1280px; light/dark where available | high for observed geometry | HE owner content was not mutated |

### Relation to existing canon

- [`BRR_MULTI_CORPUS_DESIGN_2026_07_02.md`](../../../planning/BRR_MULTI_CORPUS_DESIGN_2026_07_02.md)
  remains authoritative for the approved B+C model
  (hub-vitrine plus in-corpus lens). This research matures its learner-facing hierarchy; it does
  not revert to one undifferentiated corpus.
- [`BRR_MYTEXTS_EPICB_2026_07_02.md`](../../../planning/BRR_MYTEXTS_EPICB_2026_07_02.md) remains
  authoritative for LocalDb ownership and Studio versus
  Room responsibilities. Compact rows do not move editing or canonical management into the Room.
- [`ROOM_TRAINING_PREMIUM_RELEASE_IMPLEMENTATION_PACKET_2026_08_11.md`](../../../planning/ROOM_TRAINING_PREMIUM_RELEASE_IMPLEMENTATION_PACKET_2026_08_11.md)
  remains a separate delivered
  training program. The proposed Today/Review entry links to existing behavior; it does not create
  a second trainer.
- [`BRR_UX_AUDIT_2026_06_25.md`](../../../planning/BRR_UX_AUDIT_2026_06_25.md) is useful historical
  evidence but is not treated as proof of the
  current `3.11.354` surface. Findings here were reconciled against live code and production.
- Shared `reader-core.css`, morphology, media, LocalDb, and service-worker contracts are frozen
  during research and are stop-list items for the first presentation slice.

## 3. Current information architecture

```text
Читальный зал
└─ Библиотека / L0 hub
   ├─ Библиотека Бен-Иегуды
   │  ├─ global search + popular queries
   │  ├─ corpus facets + personal smart chips
   │  ├─ continue / personal / finished / saved rails when non-empty
   │  ├─ “С чего начать”
   │  ├─ “Готовы к чтению” — all 796 cards in one horizontal rail
   │  └─ period → author → work and search-result routes
   ├─ Мои тексты
   │  ├─ identity + capabilities + add/manage actions
   │  ├─ search scope + sort
   │  ├─ eight personal smart filters + level/tag facets
   │  └─ every matched text as a large vertical card
   └─ Учебные песни / protected group corpus
      ├─ independent breadcrumb (not the common corpus switcher)
      ├─ owner backup/access controls, if owner
      ├─ search + three selects
      ├─ eight personal smart filters + tag facets
      └─ every work as a full-width ledger card
```

The underlying architecture intentionally distinguishes a baked catalog, LocalDb material, and a
protected server corpus. That distinction is correct. The interface currently lets storage and
authority differences determine too much of the learner-facing shape.

## 4. Surface-by-surface findings

### 4.1 L0 Library hub

What works:

- Corpus identity, honest counts, and capability badges are visible.
- A cross-corpus Continue rail can appear above the corpus directory.
- My Texts has a clear import funnel.
- Empty personalized rails self-hide; anonymous users do not see dead sections.

What does not feel mature:

- With no active reading, the first meaningful choice is between two or three large white corpus
  cards. The page behaves like a storage selector, not the center of a study session.
- The cards dedicate large areas to descriptions and capability badges but do not answer
  “why this corpus now?” or “what will I achieve in ten minutes?”
- The “Скоро: тематические корпуса” teaser has the same visual grammar as real destinations and
  spends scarce hub attention on unavailable future value.
- At 1280px the two primary cards span a wide column while carrying little content, leaving a large
  empty lower page. Thin grey borders and emoji headers resemble an internal dashboard more than a
  deliberate reading environment.

Required product change: make L0 a **Today / Continue / Choose a text** surface. Corpus identity
becomes a compact switch and browse entry, not the hero decision.

### 4.2 Ben-Yehuda

What works:

- The richest discovery system: title/author and in-text search, period/genre/language facets,
  readiness, audio/review status, saved searches, concordance, author drill-down.
- Honest intrinsic difficulty and approximate personal familiar-word coverage.
- Cold-start recommendations avoid pretending an empty profile has meaningful percentages.
- Continue, finished, bookmarks/reading lists, My Texts shortcut, and personalized activity rails
  appear only when relevant.
- Search result lists already paginate by 60; author/work navigation is mature.

Observed quality problems:

- On 380px, breadcrumb/switcher, search, popular queries, facet buttons, and personal chips occupy
  roughly the first 350px before the first recommendation heading.
- The 132px horizontal cards expose only about 2.7 items. Hebrew titles, author action, length,
  difficulty, coverage, and CTA compete inside a very narrow column.
- “Готовы к чтению — 796 работ” creates all 796 cards. The live accessibility snapshot exposed
  808 `.work-card` elements (cold-start plus ready rail); most are far outside the viewport.
- A captured 380px interaction from hub to Ben-Yehuda produced INP `313ms` without CPU/network
  throttling. The trace contained about `6,097` DOM elements; the ready rail had `796` children;
  a layout update touched approximately `10,823` nodes and took about `54ms`, followed by about
  `55ms` style recalculation. This is a design/data-windowing defect, not only micro-optimization.
- Horizontal scrolling is the only way to traverse an unbounded collection, with no “see all”
  handoff or page window at the shelf level.

Required product change: keep short rails for curated and personal sets, but replace the complete
ready corpus rail with a compact preview and a paged/list browse view. A shelf is for 4–12 choices,
not 796.

### 4.3 My Texts

What works:

- Strong “PRO” retrieval: metadata, rows, notes, word notes, `#tag` syntax, ALL/ANY tag semantics,
  level facets, rich sort set, and shared personal smart filters.
- Truthful progress displays a row number when total length is unavailable instead of inventing a
  percentage.
- Media presence and text level are exposed; machine niqqud asks for explicit consent and preserves
  asserted/proofread layers.
- Management stays in Studio, which preserves the Reading Room as a learning surface.

Observed quality problems:

- At 380px, identity/capability copy, two management links, search, two selects, eight smart chips,
  and facets occupy roughly 600px. Only then does the first text begin.
- Every result is a large single-column card, even on desktop. At 115 texts this turns browsing into
  a long stream of mostly empty boxes.
- Every card repeats a prominent “Добавить никуд” button. It visually competes with “Читать /
  Продолжить” even though it is a conditional preparation action, not the core learning action.
- The card does not expose the same reading-readiness language as Ben-Yehuda: no familiar-word
  estimate, no intrinsic/derived difficulty explanation, no expected duration, no finished marker
  in the base rendering.
- Results render all matches at once from a query capped at 500 records. This is acceptable for the
  current owner count but is not a mature scale contract and can silently undercount beyond 500.
- The outer card is `role=button` and contains a real nested niqqud button. This creates competing
  interactive semantics and awkward keyboard/screen-reader behavior.

Required product change: default to compact rows (or a two-column compact grid on wide screens),
place one primary open/continue action on the row, move niqqud and management to an overflow/detail
disclosure, and derive readiness only where the required data exists.

### 4.4 Study Songs

What works:

- Honest protected-corpus boundary and role-specific access.
- Search by title/performer/tag; status, audio, and sort controls; tags; shared personal smart
  filters; exact audio coverage; per-work progress; continue/open/share actions.
- Owner export/import and membership tools exist and are explicit.
- The fixture passes 380/510/1280 functional and overflow smokes in light and dark themes.

Observed quality problems:

- For an owner on 380px, five administrative actions appear before search and learning content.
  The first work begins around the bottom of the first 844px viewport or later.
- At 1280px, each work occupies nearly the full content width while its information is sparse. The
  position number is isolated at one edge and the RTL title at the other, forcing a long eye travel.
- Repeated technical metadata such as `TTS r1` reads like an implementation console, not learner
  language. Audio coverage can remain, while revision provenance belongs in details.
- Three sample cards already fill most of a long page; all matched works are rendered without a
  paging/windowing contract.
- The corpus is not registered in the common `CORPORA` manifest. It enters through an independent
  group breadcrumb, while the common switcher only lists Ben-Yehuda and My Texts. This makes the
  declared multi-corpus model visibly incomplete.
- No common “start here,” familiar-word readiness, bookmarks/reading lists, or dedicated continue
  grouping is presented inside the corpus, although raw progress and personal sets exist.

Required product change: keep owner operations, but move them behind a compact “Управление
корпусом” disclosure. Register group corpora in the visible switching model and render works with
the same learner row contract as other corpora, extended by song-specific audio state.

## 5. Accessibility and semantic audit

Automated baseline on public Ben-Yehuda at 380px:

| Category | Score |
|---|---:|
| Accessibility | 0.93 |
| Best practices | 1.00 |
| SEO | 0.75 |
| Agentic browsing | 1.00 |

Specific failures and manual extensions:

- Contrast: “Популярные запросы” `2.36:1`; 11px card notes and period ranges `2.56:1`;
  “перевод позже” and the footer version `2.28:1`. Normal text needs `4.5:1` under
  [WCAG 2.2 contrast minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum).
- Tap targets: a live geometry scan found `818` visible targets below `24px` in width or height.
  Most were 15px-tall author actions repeated across the 796-card ready rail. Important touch
  controls should target 44–48px; [WCAG 2.2 target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
  establishes 24px or sufficient spacing as a floor.
- Nested interactions: every Ben-Yehuda card is a `role=button` and contains another
  `role=button` for the author. My Texts similarly places a real niqqud button inside a button-like
  card. A text row should have a real primary link plus sibling secondary actions.
- Browser issue: form controls without `id` or `name`; the visible corpus search is included.
- Several modal/form inputs rely on placeholders rather than persistent labels; hidden controls
  still need correct semantics when surfaced.
- Document language, title, viewport, and primary header/main/nav/footer landmarks are present.
- The Lighthouse SEO failure is a missing meta description. It is not a learning blocker, but a
  premium public product should describe its main surface.

## 6. Current-state defect register

Severity meanings: P0 data/security/trust stop; P1 release-blocking learner/access/performance
problem; P2 premium maturity gap; P3 later enhancement. No P0 was found in this research pass.

| ID | Priority | Finding | Evidence | Acceptance direction |
|---|---:|---|---|---|
| RRM-001 | P1 | 796-card ready rail creates a 6k-element page and poor interaction cost | live DOM/trace; code loop | curated preview ≤12 + paged/windowed browse; bounded DOM gate |
| RRM-002 | P1 | repeated author targets are 15px high and nested inside button-like cards | live geometry + semantics | real row link, sibling author link, ≥24px floor/44px preferred |
| RRM-003 | P1 | verified contrast failures down to 2.28:1 | Lighthouse JSON | WCAG AA contrast for text in light/dark RU/HE |
| RRM-004 | P1 | My Texts and Study Songs place retrieval/admin chrome before first learning item | 380px fixtures | next action/content above fold; advanced controls collapsed |
| RRM-005 | P1 | Study Songs bypasses the common corpus registry/switcher | registry + render path | dynamic corpus manifest/adapter without second learner truth |
| RRM-006 | P1 | three corpora lack a shared readiness/progress/continue contract | parity matrix | common normalized presentation with honest unavailable states |
| RRM-007 | P2 | My Texts renders all matches and caps source at 500 | code path | page/window rows; true count semantics |
| RRM-008 | P2 | Study Songs renders all matches as wide ledger cards | code + fixtures | dense list/grid with page/window contract |
| RRM-009 | P2 | repeated niqqud action competes with reading on every My Text card | fixture + card renderer | overflow/detail action; one primary action |
| RRM-010 | P2 | `TTS rN` and infrastructure wording pollute learner metadata | Study Songs cards | outcome language first; provenance disclosure |
| RRM-011 | P2 | L0 is a storage directory rather than a study home | live/fixture visual audit | Today/Continue/Recommended before Browse corpora |
| RRM-012 | P2 | visual separation is simultaneously weak and noisy | all screenshots | structured row states, quiet elevation, accent edge by state |
| RRM-013 | P2 | missing persistent labels/id/name on several form fields | Chrome issue/manual scan | label/name/id audit green in all surfaced states |
| RRM-014 | P2 | missing public meta description and small footer links | Lighthouse | description + target spacing; no search claim inflation |
| RRM-015 | P3 | hub teaser spends prime attention on unavailable future corpora | hub | move to secondary roadmap/help area or remove |

## 7. What must be preserved

- One learner truth: LocalDb progress, notes, vocabulary, and SRS semantics remain canonical.
- Honest missing-data states: no fabricated familiar-word percentage, duration, progress, audio,
  review, or translation quality.
- Baked versus live context/provenance remains explicit where it affects trust.
- Protected group access, export/import, and role authority remain intact; they simply move out of
  the default study hierarchy.
- Studio remains the management/editing surface for My Texts.
- Reader resume, bookmarks, notes, highlights, media, trainer, and offline behavior remain stable.
- Existing period/author/search/concordance depth in Ben-Yehuda is retained behind the new shell.
- RU, HE/RTL, dark mode, keyboard, reduced motion, and 380px are release gates, not polish backlog.

## 8. Why passing smokes do not contradict the findings

The current smokes correctly pass because they test route success, visibility, actions, and
overflow. A 160px-high card can be fully visible and still be too sparse; a page can avoid
horizontal overflow while delaying content below 800px of controls; a 796-item rail can function
and still be unnecessarily expensive. The next release should keep those gates and add measurable
quality gates for first useful content, DOM bounds, row density, target size, contrast, semantic
nesting, and cross-corpus parity.
