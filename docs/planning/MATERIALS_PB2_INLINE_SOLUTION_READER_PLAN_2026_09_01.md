# MATERIALS PB2 — inline solution in the Reading Room

Status: `SHIPPED_PRODUCTION_3.11.455`

Date: 2026-09-01

## Decision

Inside an already open Materials task, `Open solution` must expand the reviewed
solution in the Reading Room instead of opening a second full-screen reader.
The catalog-card action may retain the standalone printable viewer because no
Reading Room context exists there yet.

The inline solution inherits the existing Reading Room controls. It does not
introduce another settings toolbar:

- Hebrew, vocalized Hebrew, transliteration and Russian visibility;
- transliteration profile and translation reveal mode;
- word-status and adaptive-vocalization decoration;
- service-column mode and the current column widths;
- the shared morphology card and exact reviewed-solution occurrence anchor;
- cached row playback and continuous solution playback.

## Truth and writer boundary

- Condition rows remain the immutable public source snapshot.
- Solution rows remain the exact-edition reviewed derivative.
- An inline solution word keeps its derivative `row_id` and never receives the
  condition text key.
- Opening, closing, changing reader settings and playing solution audio do not
  write `review_log` or condition reading progress.
- No second `ReaderMorph`, `MorphHost`, settings store, audio asset store or
  solution copy is introduced.

## Mobile contract

At 380 CSS px the learner sees one reader header and one `Aa` settings surface.
The inline solution follows the condition table in the same page flow. The
standalone title, print header, content-mode selector and study/exam selector
are absent from the inline path. The expand button becomes `Hide solution`,
retains `aria-expanded`/`aria-controls`, and restores focus when collapsed.

## Gates

1. Reader action expands an inline region and creates no modal dialog.
2. Catalog action still opens the standalone printable viewer.
3. Every visible inline column is derived from the current `readerCfg`.
4. One ReaderMorph attachment covers condition and solution cells.
5. Solution TTS is cached-only and mutually exclusive with condition/word audio.
6. Solution rows never enter condition progress, bookmarks or `review_log`.
7. Settings rerender preserves the expanded solution and exact row anchors.
8. Desktop, 380 px RU, 380 px HE RTL and 200% reflow have no page overflow.
9. Keyboard focus, Escape, collapse focus return and 44 px primary controls pass.

## Local verification

- Contract tests: `9/9` in `tests/materialsPb2LearningSupportUi.test.js`, including
  all 1,919 reviewed rows and 14,941 Hebrew word anchors.
- Shared Room regression slice: `52/52`; locale/cache lock: `233/233`.
- Real browser fixture: one inline table, 31 Task 1 solution rows, exact Reader
  column set and widths, cached TTS, morphology, zero `review_log` delta.
- Reflow: desktop, 380 px RU, 380 px HE RTL and 380 px at 200% all have no
  document overflow. Evidence is under
  `docs/research/materials-science-problem-solutions/2026-09-01/inline-reader/`.
- The complete `npm test` run reached 1,249/1,260 passing. The six remaining
  failing assertions after release-specific fixes are unrelated pre-existing
  baselines: three `classicModeRedesign`, one `remoteMediaAcquisition`, and two
  `roomLibrarySurfaceIa` assertions.

## Production verification

- Release `3.11.455` reached a stable 10/10 healthy probe streak on 2026-09-01;
  database and migrations remained ready throughout the accepted streak.
- On the ordinary public corpus route at a 380 x 845 CSS px mobile viewport,
  the task condition and 31 reviewed solution rows render in one Reading Room
  flow. The solution deep-link restores expanded state without a dialog and the
  document remains exactly 380 CSS px wide.
- The condition and solution use the same five Reader column proportions.
  Toggling transliteration in the existing `Aa` surface changes both tables and
  leaves the solution expanded; every inline control checked is at least 44 px.
- A solution-word tap opens the shared morphology sheet. Cached solution-row
  playback completed the expected `HEAD 200`, timing `200`, and media `206`
  requests without console errors.
- Lighthouse mobile snapshot: accessibility 95, best practices 100, SEO 100,
  agentic browsing 100. The two remaining accessibility findings are inherited
  Reading Room debt outside this change: the 4.39:1 provenance-note contrast
  and the document-wide missing `main` landmark.
- Physical iPhone and assistive-technology acceptance remain owner-only and are
  not inferred from Chrome mobile emulation.

## Release boundary

Allow only the plan, Room HTML/JS, shared reader-core changes required by the
inline table contract, all three locales, cache/version integrity files and
directly related tests/evidence. Preserve all unrelated dirty files.
