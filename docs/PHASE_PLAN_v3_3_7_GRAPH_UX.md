# Phase Plan — v3.3.7 (Knowledge Graph UX/UX Quality Uplift)

> **Status.** Analysis + roadmap. The user (2026-05-16) requested a
> deep UX analysis and authorised proceeding to implementation of the
> bounded high-value subset this turn ("перейди к реализации").
>
> **Predecessor.** v3.3.6 Knowledge Graph (C0–C9 + interaction
> hardening, pushed `9fe04aa`). v3.3.6 C10/C11 (manual sanity + release
> tag) still pending and are NOT superseded by this plan.
>
> **Hard constraints (unchanged from v3.3.6):** read-only; no
> edit-from-graph; no telemetry / events / research-payload mutation;
> no new `/api/research/v1/*`; no `metrics.outcome` fields;
> `CONSENT_VERSION` = `1.0`; lazy-load preserved; mobile fallback =
> isolated-cluster cards; classic-view startup not regressed.

---

## 1. Deep UX audit — current state vs premium bar

Audited against the shipped code (`notes-graph.js`, `notes-graph-render.js`)
and the original plan §11 (which deferred the "detail rail").

| # | Gap / friction | Severity | Evidence |
|---|---|---|---|
| G1 | **No hover/focus metadata panel.** Original plan §11 specified a "detail rail" showing node kind, degree, neighbours, type metadata. Never built — only a legend + list exist. The user cannot inspect a node without navigating away. | High | `renderState('loaded')` has no detail region |
| G2 | **No neighbour emphasis.** Hovering/focusing a node does nothing visually; in a dense graph you can't see what a node connects to without isolating its whole cluster (too coarse). | High | only `isolateCluster` (whole component) exists |
| G3 | **No visible zoom / fit controls.** Zoom is wheel/pinch only. On a tablet/trackpad or when pinch is awkward there is no +/−/fit affordance. The mobile fallback sidesteps this but tablet-landscape (full graph) has the gap. | Med | toolbar has reset/filters/list/legend only |
| G4 | **Pinned state is invisible.** Drag-to-pin sets `data-pinned` but there is no visual badge — the user (this exact report) could not tell which nodes were pinned. | Med | `data-pinned` attr only; no marker element |
| G5 | **No in-graph node search (desktop).** Mobile cluster cards have search; the desktop full graph has only kind-filters. Finding a specific note among 200 nodes is hard. | Med | desktop toolbar has no search input |
| G6 | **Loading state is a bare spinner.** Premium apps show a skeleton / progress; a spinner with no progress feels slow on first lazy-load. | Low | `state==='loading'` = spinner only |
| G7 | **No "what am I looking at" affordance on empty/first use.** Empty states have copy but no one-click path to create the first `[[link]]`. | Low | empty states are copy + close/reset only |
| G8 | **Edge semantics not learnable in-context.** Legend explains dash styles, but a user mid-graph can't tell why a specific line exists without opening the legend and reasoning. | Low | legend is modal-ish, not contextual |
| G9 | **Filter UX is legend-click only.** Discoverable only by opening the legend; no explicit filter chips in the toolbar. | Low | filters via legend item click |
| G10 | **No keyboard shortcut to search/jump.** Keyboard nav is arrow-by-neighbour; no "/" to jump to a node by label. | Low | C5 keyboard map has no search |

## 2. Prioritised roadmap

**Tier 1 — implement this turn (high value, low risk, self-contained):**
- **U1 (G1)** Hover/focus **detail panel** — node kind, label, degree,
  in/out, top neighbours, type metadata; updates on pointer hover
  (200 ms debounce) and immediately on keyboard focus; `aria-live`
  polite so SR users hear it.
- **U2 (G2)** **Neighbour highlight** — on hover/focus, dim
  non-adjacent nodes/edges (reuse the isolate fade infra at a
  1-hop scope); clears on blur/mouseout. Distinct from cluster
  isolate (whole component, sticky).
- **U3 (G4)** **Pinned visual badge** — a small 📌 glyph + ring on
  pinned nodes so the pin state the user dragged is visible; the
  detail panel also states "pinned — double-click to release".
- **U4 (G3)** **Visible zoom controls** — `＋ / − / ⤢ fit` button
  group in the toolbar; `⤢` calls the existing fit (re-arms
  `_pendingFit`); keyboard `+`/`-`/`0` shortcuts; touch-friendly hit
  targets (≥ 40 px).

**Tier 2 — v3.3.7 follow-up (deferred, documented here):**
- U5 (G5/G10) desktop in-graph node search + `/` shortcut + jump-to.
- U6 (G6) loading skeleton with chunk-progress.
- U7 (G9) explicit toolbar filter chips mirroring the legend.
- U8 (G7) empty-state "how to add [[links]]" inline help.

**Out of scope (still, hard line):** edit-from-graph, node creation,
telemetry, persistence of layout, new endpoints.

## 3. Tier-1 acceptance

- Detail panel shows correct kind/label/degree/neighbours for the
  hovered/focused node; empty when nothing focused; `role=status`
  `aria-live=polite`.
- Hover/focus highlights exactly the 1-hop neighbourhood; blur/mouseout
  restores full opacity; does not interfere with sticky cluster
  isolate (H) or drag.
- Pinned nodes show a visible badge; unpinning (dbl-click) removes it;
  badge state matches `data-pinned`.
- Zoom controls: `＋`/`−` change scale within `[0.2, 4]`; `⤢` refits;
  keyboard `+`/`-`/`0` mirror; all keep d3-zoom transform in sync
  (no snap-back).
- All v3.3.6 hard constraints hold; `smoke:research:fast` stays ALL
  GREEN; new `graph-ux-smoke.js` green; visual-regression
  re-baselined (Tier-1 changes the loaded-state DOM, so baseline 01/
  02/03/06/07/10 are expected to change — regenerate + recommit).
- No classic-startup regression; lazy-load intact; no pageerror.

## 4. Files

- `public/js/notes-graph-render.js` — neighbour-highlight API
  (`highlightNeighbours(id)`/`clearHighlight()`), pinned badge in the
  node `<g>`, hover/focus → emit node-detail callback, zoom-by-step
  API (`zoomBy(factor)`), keyboard `+`/`-`/`0`.
- `public/js/notes-graph.js` — detail-panel DOM in the loaded state +
  `onNodeDetail` wiring; toolbar zoom-control group; i18n keys.
- `public/i18n/locales/{ru,en,he}.js` — `graph.detail.*`,
  `graph.toolbar.zoomIn/zoomOut/fit`, `graph.detail.pinnedHint`.
- `scripts/notes-graph/graph-ux-smoke.js` — Tier-1 smoke
  (detail panel, neighbour highlight, pinned badge, zoom controls).
- `scripts/notes-graph/visual-regression.js` baselines — regenerate.
- `package.json` / `scripts/research/all-smoke.js` — wire the suite.
- `CHANGELOG.md` — v3.3.7 entry.

## 5. Patch sequence (this turn)

```
U-C1 feat(graph): hover/focus detail panel + neighbour highlight (U1+U2)
U-C2 feat(graph): pinned-node badge + visible zoom controls (U3+U4)
U-C3 test(graph): graph-ux smoke + regenerate visual baselines
U-C4 docs(graph): v3.3.7 plan + CHANGELOG; wire smoke
```
(Bundled into ≤2 commits in practice; pushed per the user's standing
"push to main for Railway" instruction this session.)

## 6. Risks

| Risk | Mitigation |
|---|---|
| Neighbour-highlight fights cluster-isolate (both mutate opacity) | Highlight is transient (hover/focus scoped) + records/restores prior opacity; isolate stays authoritative when active (highlight no-ops while `isIsolated()`) |
| Detail-panel pointer hover thrash on dense graphs | 200 ms debounce on pointer; immediate only on keyboard focus |
| Visual baselines drift > 1% (Tier-1 changes loaded DOM) | Regenerate baselines in U-C3; document the intended change; verify re-run 31/31 |
| Zoom-by-step desync with d3-zoom internal transform | Route every programmatic zoom through `_syncZoomTransform()` (same latch the drag fix introduced) |

---

**Authored 2026-05-16 by Claude Opus 4.7 (1M context). Tier-1 implemented same turn per user directive; Tier-2 documented for follow-up.**
