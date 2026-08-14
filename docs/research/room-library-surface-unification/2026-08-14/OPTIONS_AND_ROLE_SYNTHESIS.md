# Options and role synthesis

## Evidence passport

| Field | Value |
|---|---|
| Date | 2026-08-14 |
| Mode | `RESEARCH_ONLY` |
| Source commit / branch | `e66bdd88661a164baebf1ac1be9d2f5988fd63b6` / `main` |
| Dirty tree | `DIRTY`, 34 pre-existing porcelain entries at baseline; preserved |
| Production | `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served `3.11.384` |
| Method | synthesis of required canon, roles, screenshots, production DOM and source/query/test evidence |
| Evidence separation | recommendations are analysis, not production facts; no isolated automation or owner-destructive verification was executed |
| Limitations | future implementation cost is estimated from the current source; no implementation spike or performance trace was authorized |

## Role lens legend

- R2: progressive disclosure, learning value and a clear next step.
- R4: premium mobile-first/RTL interaction, no ambiguous labels or dead ends.
- R5: product coherence, offline-first value and competitive quality.
- R6: collection architecture, discoverability, metadata and per-work attribution.
- R8: graded-reading on-ramp and honest “what next”.
- R11: do-no-harm, source-of-truth consistency and regression protection.
- R12: no dual-write or competing projection truth.
- R15: honest lifecycle, export, deletion and consent boundaries.

## D1 — Surface ownership

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: duplicate Continue/Finished/Bookmarks/Lists in every corpus | R2/R4: long repetitive pages; R6: corpus taxonomy loses priority; R11: three component/query variants drift; R12: encourages duplicate projections; owner screenshot already shows overload in only one corpus | highest mobile/RTL/test cost; global and corpus Continue conflict | reject |
| B: preserve current asymmetry | cheapest; but source shows mixed accidental scopes in Ben, including global bookmarks beside Ben-only progress; R5/R6: hard to explain why Ben owns the learner’s global lists; R15: recovery labels stay obscure | historical accident becomes public IA; authorization risk remains | reject |
| C: global journey on L0, corpus-local browse/hero in every corpus | matches current source-neutral L0 and coherent My/Study pattern; R2/R8 keep one next step; R6 protects corpus identity; R11/R12 reuse writers/queries; R15 can state device/cloud boundaries once | requires rehoming lists and retiring Ben shelves; regression coverage needed | **recommend** |

Recommended value: `C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL`.

## D2 — Named reading lists

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: one top-level shelf per list | current behavior; owner list becomes peer to Ready/Periods; every list renders up to 300 cards; R4 sees ambiguous `✕`; R6 sees collection-of-collections flattened | page grows with list count; destructive scope unclear | reject |
| B: one consolidated “Списки для чтения” module | R2 progressive disclosure; R4 typed actions; R6 correct hierarchy and counts; R11/R12 same payload/writer; R15 explicit device-only/no-recovery copy | pin/hide/archive need a later payload decision | **recommend** |
| C: lists only on a separate route | clean corpus pages but weak L0 discoverability and one extra navigation level; R8 next-step access degrades | lists can feel hidden; more routing/focus work | reserve as future detail route, not top-level ownership |

Recommended value: `B_CONSOLIDATED_READING_LISTS_MODULE`. Immediate: consolidate, count, open, rename, labeled remove, confirmed labeled delete. Backlog: pin/hide/archive and cross-device recovery.

## D3 — Material presentation

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: horizontal rails | screenshot 7 and live metrics show hidden cards and nested scrolling; R2 scan suffers; R4/RTL cost high; R11 multiple renderers drift | partial card, keyboard off-screen focus, touch/wheel conflict | reject for repeated work collections |
| B: vertical compact rows | current Ready/My/Study already prove it; R2/R6 fast comparison; R4 reflow/RTL simpler; R8 reason/status can be explicit | needs semantic variants, not one generic copy block | **recommend** |
| C: adaptive mixed | appropriate for hero/editorial non-collections but ambiguous if each material shelf chooses differently | inconsistent navigation and larger test matrix | do not use for material collections; heroes remain an explicit exception |

Recommended value: `B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL`.

## D4 — Density and bounds

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: render/append all | named lists can reach 300; Ready can reach 796; current append-more grows DOM | unbounded memory, focus history and long pages | reject |
| B: bounded preview plus explicit Show all and replace-page | preserves existing 12/48 policies; R2 disclosure; R4 predictable focus; R11 measurable ceiling | requires pagination state and return-context tests | **recommend** |
| C: virtualized infinite list | strongest raw DOM bound but R4/AT/focus complexity and no measured need at 48 rows | high implementation/regression cost | backlog only if profiling proves page replacement insufficient |

Recommended value: `B_BOUNDED_PREVIEW_PLUS_SHOW_ALL`: L0 Ready 4; collection preview 12; replacement pages 48; counts always show total.

## D5 — Shared section grammar

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: keep per-surface headers | preserves current inconsistencies; Russian HE disclosure bug and action placement drift remain likely | duplicated CSS/ARIA logic | reject |
| B: shared typed header/disclosure | preserves accepted B8 disclosure writer; R4 consistent focus/RTL; R11 one regression surface; R12 presentation-only state | must support optional count/action without grid breakage | **recommend** |
| C: new framework/web component abstraction | can centralize behavior but expands surface and risks timing/i18n regressions without need | over-engineering; large rollback | reject for immediate scope |

Recommended value: `B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE`.

## D6 — Immediate scope

| Option | Evidence and role result | Risk | Verdict |
|---|---|---|---|
| A: IA plus DB/localStorage migration, sync and recommendation changes | violates the research stop list; R11/R12/R15 require separate migration/recovery decisions | dual-write, owner data loss, B9 leakage | reject |
| B: surface-only implementation over existing stores | all core changes are mount/DOM/CSS/i18n/test work; rename reuses existing name field; R11 rollback is clean | must hold a strict allowlist and version gate | **recommend** |
| C: documentation only / defer all implementation | zero risk now but leaves real ambiguity, unsafe glyphs and RTL regressions | continued user cost | reject after approval, but this research session itself stops here |

Recommended value: `B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION`.

## Cross-role scorecard

Scale: `+2` strongly supports, `+1` supports, `0` neutral/conditional, `-1` opposes, `-2` strongly opposes.

| Option set | R2 | R4 | R5 | R6 | R8 | R11 | R12 | R15 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Duplicate journey + rails + broad migration | -2 | -2 | -1 | -2 | -1 | -2 | -2 | -2 | -14 |
| Current asymmetry + current formats | -1 | -2 | -1 | -1 | 0 | -1 | -1 | -1 | -8 |
| **C/B/B/B/B/B recommendation** | +2 | +2 | +2 | +2 | +2 | +2 | +2 | +2 | **+16** |

## Recommendation

Choose C/B/B/B/B/B. This is the only set that explains ownership to the learner, preserves corpus identity, removes nested material scrolling, retains all established truth writers, and gives a migration-free rollback boundary.

Exact approval token:

```text
APPROVE ROOM-LIBRARY-IA-R: D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL; D2=B_CONSOLIDATED_READING_LISTS_MODULE; D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL; D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL; D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE; D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION; MIGRATION=NONE; SCOPE=IMMEDIATE_SURFACE_ONLY
```
