# BRR-S15 — In-reader find (recon-design, owner approval before code)

> Big brick of the approved S1–S19 search closure. «Поиск внутри открытого текста» — Kindle/Apple-Books table-stakes.
> Roles R5 (market — every serious reader has it) · R4 (premium UX, RTL) · R10 (niqqud-insensitive matching).

## What it is
A find-in-page for the OPEN work: a 🔍 in the reader bar opens a find input; matching words are highlighted across the text,
with next/prev navigation + a «k / N» counter, niqqud-insensitive.

## Data-feasibility (recon)
- `readerRows` (the in-memory UIRow[]) is already in hand; `firstMatchRow`/the skeleton normalizer already locate matches.
  Decoration is **POST-render on the Room mount** (the norm — the parity-locked builder is never touched; `smoke:reader-parity`
  stays green). Reuses `markSegments` (skeleton match) + `scrollToReaderRow`/`highlightReaderRow`.
- All matching is client-side over the already-rendered table; no index, no body fetch, no token.

## Variants (role analysis)
- **V1 — custom find bar (RECOMMENDED).** A reader-bar 🔍 toggles a find input; on input, collect all matching rows (skeleton
  contains the query token, niqqud-insensitive), `<mark>` the matched words in the `he`/`niqqud` cells, show «k / N», ↑/↓ step
  through matches (scroll + a current-match accent). Escape/✕ closes + clears marks. [R5 table-stakes · R4 RTL · R10 honest match]
- **V2 — rely on the browser's native Ctrl/Cmd-F.** ✗ Not niqqud-insensitive (won't match a voweled word by its skeleton),
  no in-app counter/affordance, absent on mobile — fails the premium bar.

## Recommended design (V1)
- **Engine:** a pure `CorpusFTS.findRows(rows, query)` (or reuse `markSegments` per row) → `[{rowIdx, wordOffsets}]` for all
  matching rows (skeleton-contains, like `firstMatchRow` but ALL rows + per-word offsets). Gate-testable.
- **UI (library-ui, POST-render):** a 🔍 button in `.reader-bar` → a find bar (input + «k / N» + ↑/↓ + ✕). On input (debounced):
  clear prior marks, decorate matched words in the rendered `he`/`niqqud` `td`s with `<mark class="rm-find">`, the current match
  gets `.rm-find-current`; ↑/↓ moves current + `scrollToReaderRow`. Marks are applied to the LIVE DOM cells (not the builder);
  cleared on close + on rerender (`rerenderReader` already rebuilds → re-run if the bar is open).
- **Distinct from FTS-jump:** find-current uses its own hue (not the amber `rm-row-jump`, which means «откуда я пришёл»). a11y:
  not-color-only (the «k / N» counter + scroll), no underline under niqqud.

## Gates / norms
`smoke:reader-parity` MUST stay green (decoration is post-render; builder untouched). New `smoke:reader-find` (pure `findRows`
over fixture rows: all-matches, niqqud-insensitivity, offsets, no-match). reader-core/index.html untouched. i18n
`room.reader.find.*`. SW bump. @380px e2e (open a text → 🔍 → type → marks + «k / N» + ↑/↓ steps + Esc clears, 0 console-errors).

## Recommendation: **V1**. Approve to implement, or redirect.
