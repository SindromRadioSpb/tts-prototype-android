# Phase Plan — v3.3.6 (Direction 14 — Knowledge Graph View)

> **Status.** Plan only — no implementation. C0 commit opens only after user re-approves this gate.
>
> **Numbering.** Originally tagged v3.3.4 in `PREMIUM_RELEASE_PLAN_v3_3.md`; renumbered to v3.3.6 after the v3.3.3/v3.3.4 hotfix slots and v3.3.5 calibrated quiz. M8 source: `docs/PREMIUM_NOTES_PLAN_v3_2.md §M8`.
>
> **Hard constraints (locked by user 2026-05-15):**
> - No new `/api/research/v1/*` endpoints.
> - No new collected fields in `metrics.outcome` or anywhere in the research wire.
> - No telemetry of graph navigation (no events on node hover/click/expand).
> - Read-only graph: see-only + jump-to-target + hide/isolate cluster + hover metadata. Edit-from-graph is **out of scope** — explicit defer to v3.4+.
> - Lazy-load graph module. Classic-view startup time MUST NOT regress.
> - Mobile fallback = isolated-cluster view, not full force layout.
> - `CONSENT_VERSION` stays at `1.0` — graph reads local SQLite + morph dict, nothing leaves the device.
> - Out of v3.3.6 scope: Premium SRS Epic, graph editing, cloud sync, monolith code-split.
> - Baseline at planning time: 20 smoke suites, **290 cases ALL GREEN** (after quiz a11y polish 6ce539b).

---

## 1. Repo Audit Findings

### Data tables already on disk (per `public/db/migrations.js`)

| Table | Key columns | Owner phase | Used by |
|---|---|---|---|
| `texts` | `id`, `title`, `language_code` | Phase 6 | Library, cross-text, graph (nodes) |
| `sentences` | `id`, `text_id`, `order_index`, `he_plain`, `he_niqqud` | Phase 6 | Library, cross-text |
| `notes_v2` | `id`, `target_kind` (`sentence`|`text`|`root`|`word`|`binyan`), `target_id`, `text_id`, `note_type` (`free`|`word_study`|`grammar_rule`|`translation_discrepancy`|`pronunciation_note`), `body_json`, `title` | 9.1–9.3 | Notes UI, cross-text, graph (nodes) |
| `note_links` | `from_note_id`, `to_kind` (`note`|`word`|`root`|`binyan`|`text`|`sentence`), `to_id`, `link_alias` | 9.3 M4 | Bidirectional [[…]] references; graph (edges) |
| `roots` | `root_3letter`, `gloss`, `my_note_id` | 9.4 | Hebrew root reference; graph (nodes) |
| `srs_cards` | linked from `notes_v2.srs_card_id` for review | 9.3.C | Not consumed by graph (SRS is separate layer) |

**Note:** `note_links` is the load-bearing data source for v3.3.6 — every `[[Wiki-style]]` reference parsed at note save time becomes a row here with one of six `to_kind` values. Graph edges are this table read as-is.

### Existing JS modules graph will sit alongside

- `public/js/crosstext.js` (410 LOC) — already builds an in-memory inverted index of all sentences keyed by surface-form + `MorphProvider.analyze()`-derived `rootIndex: Map<rKey, Set<formKey>>`. Exposes `ensureIndex`, `findOccurrences`, `invalidate`, `getStats`. **Graph should reuse `MorphProvider.analyze()` for root resolution — don't duplicate root matching logic.**
- `public/js/crosstext-ui.js` (366 LOC) — side-panel pattern at z-index 10500/10501.
- `public/js/morph-provider.js` — `analyze(word)` returns `{root, analyses}` with multi-analysis preserved. Provider abstraction lets the graph stay backend-agnostic.
- `public/js/morph-normalize.js` — niqqud-insensitive normalization. **Reuse, don't reimplement.**
- `public/js/quiz-ui.js` (just shipped 6ce539b) — modal pattern with focus trap, aria-live, focus management on open/close. **Reuse this pattern wholesale for the graph overlay; the a11y plumbing is already audited.**

### Existing chart pipeline (for comparison only — graph is different)

- `public/js/teacher.js` (line 376+) hand-rolls SVG charts (`viewBox="0 0 ${W} ${H}"`, `preserveAspectRatio="none"`, `<g class="chart-grid">`). No d3 dependency. This pattern is fine for static line/bar charts but does NOT scale to interactive force layouts — graph needs its own rendering layer (decision in §5).

### Lazy-load infrastructure: NONE

- Every JS file loads via `<script src="/js/...">` at the bottom of `public/index.html` (see lines 10610+).
- No `import()` dynamic imports in production code.
- No code-split today.
- Service Worker caches everything in `public/sw.js` `MORPH_CACHE` and the default bucket.
- **v3.3.6 must establish the lazy-load pattern** — see §6.

### Cross-text overlap

- Both Cross-text hub (v3.3.2 D15) and Graph (v3.3.6) consume `notes_v2 + note_links + roots + texts + sentences + morph`. The risk is **divergent root-matching logic** — the user-flagged §11 concern.
- Mitigation: Graph reads via the same `MorphProvider.analyze()` + `morph-normalize` contracts. Where Graph needs the inverted index Cross-text already maintains, expose `crosstext.getIndex()` (new tiny addition) instead of duplicating the index build.

### Master plan reference

`docs/PREMIUM_RELEASE_PLAN_v3_3.md §3 Direction 14` already sketched the v3.3.6 shape: d3-force recommended, 200-node cold-start cap, mobile fallback to isolated-cluster, ~6 dev-days. This phase plan is the detailed expansion.

---

## 2. Existing Data Sources

### Source-of-truth SQL queries (read-only)

The graph layer issues these queries against the local SQLite via `window.__localDB.dbQuery` (same path Cross-text uses):

```sql
-- 1. All notes (sparse: most installs have < 200; graph caps at 200 anyway)
SELECT id, title, target_kind, target_id, text_id, note_type,
       json_extract(body_json, '$.word')   AS w_word,
       json_extract(body_json, '$.root')   AS w_root,
       updated_at
  FROM notes_v2
 WHERE deleted_at IS NULL OR deleted_at = ''
 ORDER BY updated_at DESC
 LIMIT 500;   -- generous fetch; top-N by degree applied client-side

-- 2. All note links (edges where source is a note)
SELECT from_note_id, to_kind, to_id, link_alias
  FROM note_links;

-- 3. All texts (lightweight — id + title only for node labels)
SELECT id, title FROM texts WHERE deleted_at IS NULL OR deleted_at = '';

-- 4. All seeded roots referenced by any link or note
--    (avoids loading the full HEBREW_COMMON_ROOTS_SEED.json — ~100 entries — into the node set if unreferenced)
SELECT r.root_3letter, r.gloss
  FROM roots r
 WHERE EXISTS (SELECT 1 FROM note_links WHERE to_kind = 'root' AND to_id = r.root_3letter)
    OR EXISTS (SELECT 1 FROM notes_v2 WHERE note_type IN ('word_study','grammar_rule')
                                        AND json_extract(body_json, '$.root') = r.root_3letter);
```

No raw text content (`he_plain`, `he_niqqud`, note body, search queries) reaches the rendering layer — only labels, ids, and link metadata. This is enforced in §10 privacy invariants.

### Derived inputs (computed in-memory, never persisted)

- **Inferred root edges.** When a `word_study` or `grammar_rule` note has `body_json.root = "שלם"`, Graph adds a synthetic edge `note → root`. These are NOT in `note_links` but logically belong on the graph. Synthesis happens at load time; no DB writes.
- **Inferred binyan edges.** When a `grammar_rule` note has `body_json.binyan = "PA'AL"`, Graph adds `note → binyan`. Same synthesis pattern.
- **Text-co-occurrence edges (optional, deferred to v3.4).** If notes A and B both target the same `text_id` but have no explicit `[[…]]` link, they could be visually grouped. **NOT in v1** — too noisy, would explode degree.

---

## 3. Node Taxonomy

Six node types, mirroring `note_links.to_kind` exactly (single source of truth for type ontology):

| `kind` | Source | Label | Visual hint | Hover metadata |
|---|---|---|---|---|
| `note` | `notes_v2.id` | `notes_v2.title` (truncated to 32 chars) | Color A (e.g. blue) · circle | `note_type`, `target_kind`, `updated_at`, link count in/out |
| `text` | `texts.id` | `texts.title` | Color B (e.g. green) · rectangle | `language_code`, # of notes targeting it |
| `sentence` | `sentences.id` | first 24 chars of `he_plain` | Color C (e.g. teal) · small rectangle | parent `text_id`, `order_index` |
| `root` | `roots.root_3letter` | the 3-letter root (RTL) | Color D (e.g. orange) · diamond | `gloss`, # of notes referring to it |
| `word` | normalized surface form | the word (RTL) | Color E (e.g. purple) · small circle | links from notes via `to_kind='word'` |
| `binyan` | `body_json.binyan` value | binyan name (PA'AL etc.) | Color F (e.g. red) · hexagon | # of grammar_rule notes referring to it |

**Total ontology = 6 node kinds** — matches `note_links.to_kind` CHECK constraint. Don't add a 7th in v1.

**ID stability:** node id = `${kind}:${rawId}` for routing (e.g. `note:abc-123`, `root:שלם`). This is the only mutation of raw ids and only happens at the graph-rendering layer.

---

## 4. Edge Taxonomy

Three edge sources, each with a stable `edge_kind`:

| `edge_kind` | From | To | Source | Direction |
|---|---|---|---|---|
| `explicit_link` | `note` | any of `note`/`word`/`root`/`binyan`/`text`/`sentence` | `note_links` table verbatim | Directed (source → target) |
| `target_anchor` | `note` | `text`/`sentence` | `notes_v2.target_kind` + `target_id` | Directed (note → its anchor) |
| `derived_morph` | `note` (`word_study`/`grammar_rule`) | `root` or `binyan` | parsed from `body_json.root` / `body_json.binyan` | Directed (note → derived attribute) |

**Edge styling.** Each `edge_kind` gets a different stroke style (`solid` / `dashed` / `dotted`) so colorblind users distinguish edge types without relying on color. Per §9 accessibility — don't rely solely on color.

**De-duplication.** When `target_anchor` and `explicit_link` would draw the same `note → text` pair (note targets text X and also has `[[Text X]]` link), keep ONE edge with `edge_kind=explicit_link` (richer metadata) and tag with `also_target=true` in hover metadata.

---

## 5. Layout Strategy and Library Choice

### Decision: ship **d3-force** (Apache-2.0, MIT-compatible) as a new dev dependency

**Why d3-force vs alternatives:**

| Option | Bundle (gz) | Pros | Cons | Verdict |
|---|---|---|---|---|
| Custom force impl | ~3 KB | No deps, full control | Maintenance burden, edge cases (cooling, jitter) | Reject — bike-shedding |
| `d3-force` (standalone) | ~12 KB | Industry standard, minimal API, no rendering tied | Need our own SVG/canvas render layer | **Pick** |
| `d3-force` + `d3-selection` + `d3-zoom` | ~35 KB | Pan/zoom out of the box | Tied to D3 selections pattern | Pick zoom-only; skip selections |
| `force-graph` (Vasturiano) | ~150 KB | Full feature set | Heavy; canvas-only by default | Reject — too heavy |
| `cytoscape.js` | ~280 KB | Excellent a11y, list view built-in | Way overscoped for 200 nodes | Reject |
| `sigma.js` | ~100 KB | Webgl perf | Overkill for our scale | Reject |

**Final stack:**
- `d3-force@^3` — force simulation only
- `d3-zoom@^3` — pan/zoom + optional pinch
- Custom **SVG renderer** in `public/js/notes-graph-render.js` (~200 LOC) — full a11y control, matches existing teacher-dashboard SVG pattern.

**Why SVG over Canvas:**
- 200-node cap fits comfortably in SVG without perf issues.
- SVG nodes are individually focusable (`<g tabindex="0">`) — keyboard nav (§9) trivial.
- Screen readers can walk SVG node structure; canvas is opaque to AT.
- Matches existing chart pipeline (no two rendering systems to maintain).

### Simulation parameters

```js
const sim = d3.forceSimulation(nodes)
  .force("link",   d3.forceLink(edges).id((d) => d.id).distance(80))
  .force("charge", d3.forceManyBody().strength(-180))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collide", d3.forceCollide(28))
  .alphaDecay(0.05)   // converge faster than default 0.0228
  .alphaMin(0.05);
```

Run for ≤ 300 ticks or until `alpha < 0.05`, whichever first. With 200 nodes + 500 edges this completes in **< 100 ms on M1, < 250 ms on a 2017 mid-range Android Chrome** (preliminary back-of-envelope from d3-force benchmark data; verified in §13 visual regression captures).

### Pan/zoom UX

- Mouse wheel + pinch → zoom (d3-zoom with `scaleExtent([0.25, 4])`)
- Drag empty area → pan
- Drag a node → free-position that node (release pins it; double-click unpins)
- "Reset view" button in toolbar resets transform + unpins all

---

## 6. Lazy-Load / Bundle Strategy

### Acceptance — directly from user directive

- Classic view load time does NOT regress.
- Graph code loads only when the user opens Knowledge Graph for the first time in a session.

### Implementation pattern

Establish a new pattern in the codebase: **dynamic `<script>` injection on first user intent**.

```js
// public/js/notes-graph-loader.js — tiny shim, eagerly loaded (~1 KB)
window.LinguistProGraph = {
  async open() {
    if (!this._loaded) {
      await this._loadOnce();
      this._loaded = true;
    }
    window.NotesGraph.open();   // actual module API
  },
  async _loadOnce() {
    await this._loadScript("/js/notes-graph-render.js");
    await this._loadScript("/vendor/d3-force.min.js");
    await this._loadScript("/vendor/d3-zoom.min.js");
    await this._loadScript("/js/notes-graph.js");
    // notes-graph.js sets window.NotesGraph synchronously after the
    // other 3 scripts have loaded (browser script tag order guarantees).
  },
  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  },
};
```

The shim is the only graph-related script tag eagerly added to `public/index.html`. Everything else loads on first `LinguistProGraph.open()` call.

### Total deferred-load weight

| File | Size (gz est.) |
|---|---|
| `/vendor/d3-force.min.js` | ~12 KB |
| `/vendor/d3-zoom.min.js` | ~5 KB |
| `/js/notes-graph.js` | ~6 KB |
| `/js/notes-graph-render.js` | ~5 KB |
| **Total deferred** | **~28 KB gz** (loaded once per session, then SW-cached) |

### Service Worker bucket

Add `GRAPH_CACHE` bucket to `public/sw.js` for the 4 files above. First load over network → install in `GRAPH_CACHE` → subsequent loads served from cache. Cache version bumps with each Graph release; old cache entries deleted on SW activate.

### Acceptance smoke (C0-pre check)

`scripts/quiz/ui-smoke.js` already records `pageerror` for the entire flow. Add a new `notes-graph-lazyload-smoke.js` case that:
1. Navigates to `/index.html`.
2. Measures `performance.timing.domContentLoadedEventEnd - navigationStart`.
3. Asserts it's within 200 ms of the pre-Graph baseline (captured in the smoke fixture once at v3.3.6 C0).
4. Asserts `window.NotesGraph === undefined` BEFORE any Graph open.
5. Calls `LinguistProGraph.open()`, waits for first node render, then asserts `window.NotesGraph` exists.

---

## 7. Performance Budget

Hard limits enforced by smoke matrix:

| Metric | Limit | Rationale | Smoke case |
|---|---|---|---|
| Classic-view DOMContentLoaded | ≤ baseline + 200 ms | User constraint | `notes-graph-lazyload-smoke.js` case 1 |
| Cold render (50 notes, 30 texts, 20 roots) | ≤ 500 ms | User constraint | `notes-graph-perf-smoke.js` case 1 |
| Cold render (200-node cap) | ≤ 1500 ms | 3× the 50-note budget | `notes-graph-perf-smoke.js` case 2 |
| Per-frame main-thread block | ≤ 50 ms | User constraint; avoids jank | `notes-graph-perf-smoke.js` case 3 (via long-task observer) |
| Initial bundle on classic page | +0 KB | Shim is in eager bundle, rest deferred | Bundle-size diff in CI (manual for v3.3.6) |
| Memory after 60 s idle | ≤ 25 MB heap | Force sim should release | `notes-graph-perf-smoke.js` case 4 |

### Top-N fallback for large libraries

When the node count would exceed 200, Graph applies **top-N by link degree**:

```
1. Compute degree(node) = in-edges + out-edges for every candidate node.
2. Sort by degree desc.
3. Keep the top-200; drop the rest.
4. Show a toast: "Graph reduced to 200 most-connected items (out of N). See list view for full inventory."
```

Edge case: a low-degree note linked to a high-degree note still appears (the high-degree node pulls it in). Acceptable — low-degree islands disappearing is the design.

### Force simulation off the main thread

Per user directive ("worker or chunked layout"):

- **Phase 1 (v3.3.6 v1):** Chunked main-thread simulation — run 5 force ticks, `requestAnimationFrame` (yield), 5 more ticks, until convergence. Verified ≤ 50 ms / chunk by smoke case 3. Simpler than worker, no Sherpa-style worker boilerplate.
- **Phase 2 (deferred to v3.4):** Move to a Web Worker if real-world usage shows jank. Worker would clone the simulation, postMessage tick positions back to the main thread for SVG transform. The d3-force API supports this cleanly because `forceSimulation` has no DOM dependencies.

---

## 8. Mobile Fallback

### Trigger condition

```js
const isFullGraphAllowed =
  window.matchMedia("(min-width: 1024px)").matches &&
  window.matchMedia("(orientation: landscape)").matches;
```

Both conditions must hold. Phones in landscape on a 480×800 screen still get the fallback.

### Isolated-cluster view (fallback)

When `!isFullGraphAllowed`:

1. Show a **list of clusters** instead of a force graph. A cluster = a connected subgraph (BFS from any unvisited node, follow all edge kinds).
2. Each cluster is a collapsible card showing:
   - Header: cluster size (`5 nodes, 7 edges`), dominant node kind label (e.g. "around root שלם")
   - Tap to expand → renders THAT cluster as a small force graph (50-node cap, scaled to viewport width)
   - "Open in full graph" link — disabled on mobile (only enables on landscape ≥ 1024)
3. Search bar at top: filter clusters by node label or root.
4. Same a11y rules as the full graph (§9) — keyboard nav between cluster cards, focus trap inside the expanded cluster view.

### Switch behavior

On orientation change or window resize crossing the 1024 threshold:
- If currently viewing the full graph and we cross BELOW threshold → fall back to isolated-cluster view, preserving the "expanded cluster" if exactly one node is currently focused.
- If currently viewing isolated-cluster view and we cross ABOVE threshold → toast "Full graph available" with action button to upgrade. Don't auto-switch (jarring).

---

## 9. Accessibility Model

Standard set after the quiz a11y pass (commit 6ce539b) — same patterns reused.

### Screen-reader fallback: structured list

The graph container has a sibling element with `aria-hidden="false"` and the same data presented as a `<table>` and a `<ul>`. The graph SVG itself is `aria-hidden="true"` for AT (visual users get the graph; AT users get the table/list).

Table columns: kind, label, degree, top-3 neighbors. Rendered once on open, updated on filter/zoom-to-node actions.

Above the table: a `role="status" aria-live="polite"` summary div with `"N notes, M texts, K roots, P binyanim, Q sentences, R words; T edges total"`. Updates on filter changes.

### Keyboard navigation

- **Tab into graph:** focus moves to the first node (degree-sorted, deterministic order). Each node is `<g tabindex="0" role="button" aria-label="<kind>: <label>, degree <N>, click to navigate">`.
- **Arrow keys:** move between neighboring nodes (Up/Down/Left/Right pick the neighbor closest to that direction in the rendered layout). If no neighbor in that direction, no-op + brief screen-reader announcement "no neighbor in this direction".
- **Enter / Space on focused node:** trigger primary action (navigate to that text/note/root — see §11 UI/UX flow).
- **`H` key:** hide/isolate cluster containing the focused node (toggles).
- **`R` key:** reset view (unpin all, recenter).
- **Esc:** close the graph modal.
- **`?` key:** open keyboard-shortcut help overlay.

### Focus ring

- Every node has `:focus-visible` style with a 3px ring in `currentColor` + 2px white inner ring (works on any background color including the colored node fills).
- Focus ring respects `prefers-reduced-motion` — no animation.
- Focus ring respects `forced-colors` mode — uses CSS system colors.

### Color independence

- 6 node kinds: each gets a distinct color AND a distinct shape (circle / rect / small-rect / diamond / small-circle / hexagon — see §3).
- 3 edge kinds: each gets a distinct stroke style (solid / dashed / dotted — see §4).
- Colorblind-safe palette: passes WCAG AA on text labels; passes Coblis simulation for deuteranopia/protanopia/tritanopia.

### aria-label policy

- Graph container: `<div role="application" aria-label="Knowledge graph: <N> nodes, <M> edges. Use arrow keys to navigate, Enter to open.">` — uses `role="application"` so AT passes arrow keys through.
- Each node: `aria-label="<kind>: <label>, degree <N>, <inDegree> incoming, <outDegree> outgoing"`.
- Each edge (only when keyboard-focused via a yet-to-design edge tab order, skipped in v1): `aria-label="<kind>: <from> to <to>"`.
- Hover-metadata tooltip: `role="tooltip"` + `aria-live="polite"`.

### Reduced-motion

Force-simulation animation respects `prefers-reduced-motion: reduce`:
- Simulation still runs (positions still settle), but transitions are not animated — final positions painted in one frame.
- Toast says "Layout settled" instead of showing the visual transition.

---

## 10. Privacy Invariants

| Invariant | Enforcement | Smoke case |
|---|---|---|
| No graph data leaves the device | Graph module never calls `fetch()` except for its own JS chunks at lazy-load time. Strict assertion in `notes-graph-privacy-smoke.js`. | New smoke case |
| No navigation telemetry | No event emitted on node hover, click, drag, focus, or open. `events` table receives ZERO new event types. | Smoke case scans `events` after a full graph session |
| No new collected fields | `metrics.outcome` schema unchanged. `research/validate.js` has no edits. | Existing `quiz-validator-smoke.js` continues to pass; no new validator entry |
| No new endpoints | No `/api/research/v1/graph*` or similar. Static asset reads only. | Confirmed by `network audit` smoke case (page.on('request') filter) |
| No raw text content read into graph layer | Queries return only ids/titles/labels — never `he_plain`, `he_niqqud`, note `body_json` beyond fields explicitly listed in §2 | Smoke inspects in-memory `graph.nodes[].metadata` for forbidden keys |
| Consent unchanged | `CONSENT_VERSION` stays at `1.0`; `RESEARCH_CONSENT_RULE.md` Example E unchanged | No edits to consent template or version |

**Worth pinning:** graph navigation is the kind of feature that would WANT telemetry ("which roots do users explore most?"). The v3.3.6 hard rule is **no telemetry**, full stop. If future research interest demands it, the consent rule and template both need a fresh audit first (Example F: graph navigation events, sample-size considerations, k-anonymity implications).

---

## 11. UI/UX Flow

### Entry point: research-panel launcher button

Add a new button to `public/js/research-ui.js` panel actions, paired with `📝 Сдать диагностику` and `🎓 Сдать экзамен`:

```
🕸 Карта знаний       (RU)
🕸 Knowledge graph    (EN)
🕸 מפת ידע            (HE)
```

Click → `window.LinguistProGraph.open()` → lazy-load → modal opens.

**Also surface from Notes UI:** a small `🕸` button in the notes list header that opens the graph filtered to the currently-open text. (Same lazy-load path.)

### Modal anatomy

```
┌──────────────────────────────────────────────────────────┐
│ [×]  Карта знаний (143 узла, 287 рёбер)         [⌨ ?]   │  ← header
├──────────────────────────────────────────────────────────┤
│ [filter ▼] [highlight: notes ▼] [reset view] [list view]│  ← toolbar
├──────────────────────────────────────────────────────────┤
│                                                          │
│                   <SVG force graph here>                 │  ← main canvas
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Hover/focus node → metadata panel                        │  ← detail rail
│   шלם (root)  ·  3 notes refer to this  ·  gloss "..."  │
│   [Open root in Notes →]                                 │
└──────────────────────────────────────────────────────────┘
```

### Toolbar actions

| Control | Behavior |
|---|---|
| `filter ▼` | Show/hide node kinds — checklist of 6 kinds, defaults: all on |
| `highlight ▼` | Highlight one node kind in a brighter color, dim others |
| `reset view` | Recenter + unpin all + clear filters |
| `list view` | Toggle to AT-friendly list view (also auto-engaged on mobile) |

### Click/Enter on a node

| Node kind | Action |
|---|---|
| `note` | Open the note in the Notes UI (existing `openNote(noteId)` flow) → closes graph modal |
| `text` | Navigate to that text in the Library v3 view → closes graph modal |
| `sentence` | Navigate to that sentence (deep link to parent text + sentence anchor) → closes graph modal |
| `root` | Open the Cross-text "Где встречается" hub filtered to that root → keeps graph modal open (Cross-text is a side-panel) |
| `word` | Same as root — Cross-text filtered to surface form |
| `binyan` | Open notes filtered by binyan (existing notes-search query path) → closes graph modal |

Read-only contract: no node-context-menu offers "edit note", "delete note", "create new link from here". Edit-from-graph is explicitly v3.4+.

### Hide/isolate cluster

- Right-click node → "Isolate cluster" → shows only the connected subgraph containing this node; everything else hidden (faded, not removed — so layout doesn't reflow violently).
- `H` keyboard shortcut on focused node does the same.
- "Show all" link appears in toolbar when cluster is isolated.

### Hover metadata

- Mouse hover or keyboard focus on a node → details panel updates with the node's metadata (per §3 table).
- 200 ms debounce on hover to avoid flicker.
- Keyboard focus updates immediately (no debounce — keyboard users expect snappy response).

---

## 12. Files Likely to Change

### New files

```
public/js/notes-graph-loader.js          ~30 LOC   — eager loader shim
public/js/notes-graph.js                ~250 LOC   — main module: data fetch, graph build, modal mgmt, UI/UX wiring
public/js/notes-graph-render.js         ~200 LOC   — SVG renderer + force tick → SVG attr binding + zoom integration
public/vendor/d3-force.min.js           ~12 KB gz  — pinned d3-force@^3 minified bundle (single function: forceSimulation)
public/vendor/d3-zoom.min.js            ~5 KB gz   — pinned d3-zoom@^3 minified bundle
public/vendor/README.md                              — provenance / version / license notes for vendored chunks

scripts/notes-graph/build-data-smoke.js  ~100 LOC  — node/edge ontology test (4 cases)
scripts/notes-graph/lazyload-smoke.js    ~120 LOC  — lazy-load + classic-startup regression (5 cases)
scripts/notes-graph/perf-smoke.js        ~100 LOC  — cold-render + main-thread-block budgets (4 cases)
scripts/notes-graph/render-a11y-smoke.js ~150 LOC  — focus trap, arrow nav, aria-label coverage, focus ring (6 cases)
scripts/notes-graph/mobile-fallback-smoke.js ~80 LOC — isolated-cluster trigger at < 1024px (3 cases)
scripts/notes-graph/privacy-smoke.js     ~100 LOC  — network audit, telemetry-free, validator unchanged (4 cases)
scripts/notes-graph/visual-regression.js ~80 LOC   — Playwright screenshot at 3 viewports
```

### Modified files

```
public/index.html                       +2 lines    — eager script tag for notes-graph-loader.js + button entry point
public/js/research-ui.js                ~10 lines   — add "🕸 Knowledge graph" launcher button
public/sw.js                            ~20 lines   — GRAPH_CACHE bucket + lazy-load asset patterns
public/i18n/locales/{ru,en,he}.js       ~15 keys × 3 — graph.* i18n keys
public/js/crosstext.js                  +5 lines    — expose getIndex() so graph can reuse rootIndex
package.json                            +2 entries  — smoke:graph + smoke:graph:* shortcuts; +d3-force, d3-zoom as devDeps (vendored, not at runtime)
scripts/research/all-smoke.js           +6 rows     — wire the 6 new suites
CHANGELOG.md                            entry       — [3.3.6] section
docs/RESEARCHER_GUIDE.md                +0 (graph not researcher-facing)
docs/PREMIUM_RELEASE_PLAN_v3_3.md       §4 + §10    — mark v3.3.6 SHIPPED on close
```

### Total surface

~1000 LOC of new JS + ~17 KB gz of vendored d3-force + d3-zoom + ~50 LOC of modifications to existing files. Smoke matrix grows by 6 suites + 26 cases (290 → 316).

---

## 13. Smoke Matrix

### 6 new suites

| Suite | Cases | What it pins |
|---|---|---|
| `notes-graph-build-data-smoke.js` | 4 | (1) all 6 node kinds enumerable from a seeded DB; (2) edge kinds populated correctly; (3) target-anchor + explicit-link dedup; (4) derived-morph edges synthesized from `body_json.root` |
| `notes-graph-lazyload-smoke.js` | 5 | (1) classic-view DOMContentLoaded within +200 ms of baseline; (2) `window.NotesGraph === undefined` pre-open; (3) `LinguistProGraph.open()` triggers script loads; (4) `window.NotesGraph` defined post-open; (5) SW cache populated after first open |
| `notes-graph-perf-smoke.js` | 4 | (1) 50-node cold render ≤ 500 ms; (2) 200-node cold render ≤ 1500 ms; (3) no main-thread block > 50 ms (PerformanceObserver `longtask`); (4) heap ≤ 25 MB after 60s idle (`performance.memory`) |
| `notes-graph-render-a11y-smoke.js` | 6 | (1) graph container has `role="application"` + non-empty aria-label; (2) every node has `tabindex="0"` + `aria-label`; (3) Tab into graph lands on first node; (4) arrow keys move focus between neighbors; (5) Enter on focused node triggers navigation handler; (6) list-view sibling has aria-hidden="false" + `<table>` + role=status summary |
| `notes-graph-mobile-fallback-smoke.js` | 3 | (1) at 480×800 viewport, full graph NOT rendered, isolated-cluster list IS rendered; (2) at 1280×720 landscape, full graph rendered; (3) crossing the threshold mid-session falls back without losing focus |
| `notes-graph-privacy-smoke.js` | 4 | (1) graph session emits zero events to the `events` table; (2) no `fetch()` calls during a graph session except for SW-cached chunk loads; (3) `metrics.outcome` validator continues to reject `graph_*` keys (negative test); (4) consent template + CONSENT_VERSION unchanged |

### Visual regression (3 captures)

Captured by `scripts/notes-graph/visual-regression.js` via Playwright, saved to `Smoke-check/graph-view/<ts>/`:

1. Desktop landscape 1440×900 — full graph, 80-node seeded fixture
2. Tablet portrait 768×1024 — full graph (just above the 1024 cutoff in landscape; portrait here triggers fallback) — capture both states
3. Mobile portrait 414×896 — isolated-cluster view, 3 clusters expanded

### Total smoke matrix at v3.3.6 close

20 suites + 6 new = **26 suites · 316 cases · ALL GREEN target**.

---

## 14. Visual Regression Captures

Output directory: `Smoke-check/graph-view/<YYYY-MM-DD-HH-MM>/`. Same pattern as `Smoke-check/teacher-dashboard/`.

Captures per viewport:

| File | Viewport | Content |
|---|---|---|
| `01-desktop-full-graph.png` | 1440×900 | All 80 fixture nodes settled, no isolation, default highlight |
| `02-desktop-isolated-cluster.png` | 1440×900 | Cluster around root שלם isolated, rest faded |
| `03-tablet-landscape.png` | 1280×800 | Full graph; tablet landscape just qualifies |
| `04-tablet-portrait-fallback.png` | 768×1024 | Isolated-cluster list view, all clusters collapsed |
| `05-mobile-fallback.png` | 414×896 | Isolated-cluster list, 3 clusters expanded |
| `06-keyboard-focus-ring.png` | 1440×900 | One node keyboard-focused, focus ring visible |
| `07-screen-reader-list-view.png` | 1440×900 | List-view toggle on, table visible |
| `08-reduced-motion.png` | 1440×900 | Capture with `Emulation.setEmulatedMedia(prefers-reduced-motion: reduce)` |

8 captures total. Diff against baseline at each v3.3.6.x patch via pixelmatch (same harness teacher-dashboard uses).

---

## 15. Patch Sequence

```
C0  docs(graph): wire-up scaffolding only — eager loader shim,
                 vendor README placeholder, smoke runner stubs
    + public/js/notes-graph-loader.js                  (~30 LOC)
    + public/vendor/README.md
    + scripts/notes-graph/.gitkeep
    smoke: lazyload-smoke case 1 (DOMContentLoaded budget) passes;
           pre-open assertion `window.NotesGraph === undefined` passes

C1  feat(graph): vendored d3-force + d3-zoom pinned bundles
    + public/vendor/d3-force.min.js
    + public/vendor/d3-zoom.min.js
    + provenance documented in public/vendor/README.md
    smoke: lazyload-smoke cases 3+4 pass after manual stub of NotesGraph

C2  feat(graph): data layer — SQL queries + node/edge taxonomy
    + public/js/notes-graph.js (data module only — no UI yet)
    + scripts/notes-graph/build-data-smoke.js  (4 cases)
    smoke: 4/4 data cases green

C3  feat(graph): SVG renderer + d3-force integration
    + public/js/notes-graph-render.js
    + chunked tick scheduler (5 ticks / RAF)
    smoke: perf-smoke cases 1+2 (cold render budgets) pass on fixture

C4  feat(graph): modal shell + toolbar + lazy-load wiring complete
    Reuses quiz modal a11y plumbing (focus trap, aria-modal, restore on close)
    + research-ui.js launcher button
    + i18n keys (~15 × 3 locales)
    smoke: lazyload-smoke 5/5 + render-a11y cases 1+2 pass

C5  feat(graph): keyboard navigation + screen-reader list view
    + arrow-key node nav (geometric neighbor)
    + Tab/Shift+Tab focus trap inherits from modal pattern
    + sibling list view with role=status summary
    smoke: render-a11y cases 3-6 pass

C6  feat(graph): mobile fallback — isolated-cluster view
    + matchMedia threshold logic
    + cluster card collapsible UI
    smoke: mobile-fallback 3/3 green

C7  feat(graph): privacy hardening + audit smoke
    + assertions in notes-graph.js (defensive: refuse to call fetch for
      anything not in the vendored chunks list)
    + scripts/notes-graph/privacy-smoke.js (4 cases)
    smoke: privacy 4/4 green; existing quiz-validator-smoke unchanged

C8  feat(graph): perf budgets + long-task observer
    + scripts/notes-graph/perf-smoke.js cases 3+4
    smoke: perf 4/4 green

C9  test(graph): visual regression captures
    + scripts/notes-graph/visual-regression.js (8 captures)
    + baseline images committed to Smoke-check/graph-view/baseline/
    smoke: visual diff vs baseline ≤ 1% pixel mismatch

C10 docs(graph): RESEARCHER_GUIDE pointer (graph is not researcher-
    facing but mention exists for completeness) + ULPAN_RESEARCH_PLAN
    pointer + master plan §4 + §10 status flip
    smoke: ALL GREEN final regression — 26 suites / 316 cases

C11 chore(release): v3.3.6 — bump package.json + CHANGELOG entry
    + annotated git tag + GitHub release with notes template
```

11 commits, ~6-7 dev-days realistic. Smoke matrix at close: 26 suites / 316 cases ALL GREEN.

---

## 16. Definition of Done

For v3.3.6 to ship:

- [ ] All 17 plan sections in this doc have a corresponding implementation slice in C0-C11.
- [ ] 26 smoke suites green; 316 cases pass.
- [ ] 8 visual regression captures committed + pixel-diff vs baseline ≤ 1%.
- [ ] Classic-view DOMContentLoaded measured pre-v3.3.6 and post-v3.3.6 — regression ≤ 200 ms.
- [ ] `window.NotesGraph === undefined` BEFORE any user interaction with the Graph button (lazy-load proof).
- [ ] Mobile fallback verified on a real mid-range Android device (Pixel 5a or similar) — not just emulated viewport.
- [ ] Screen-reader sanity check on macOS VoiceOver + Windows NVDA — graph container is navigable, node labels coherent, focus ring visible.
- [ ] Privacy audit checklist (from `docs/RESEARCH_CONSENT_RULE.md`) re-walked — no new collected fields, no new endpoints, no new event types. `CONSENT_VERSION` stays at `1.0`.
- [ ] `package.json` version bumped `3.3.5` → `3.3.6`.
- [ ] CHANGELOG `[Unreleased]` collapsed to `[3.3.6] — YYYY-MM-DD`.
- [ ] Annotated git tag `v3.3.6` pushed.
- [ ] GitHub release authored with feature highlights + visual capture grid.
- [ ] Master plan §4 + §10 updated to mark v3.3.6 SHIPPED.
- [ ] Memory entry `project_v3_3_backlog.md` reflects closure.

---

## 17. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| d3-force performance worse than expected on real notes corpora | Medium | High | Top-N degree cap at 200 nodes; chunked tick scheduler; perf smoke with hard limits; worker fallback path documented for v3.4 |
| Lazy-load pattern silently inflates classic-view bundle (e.g. eager shim grows unbounded) | Low | Medium | Smoke case asserts classic DOMContentLoaded budget; bundle-size delta documented in CHANGELOG per patch |
| Mobile fallback feels too different from the desktop graph (UX inconsistency) | Medium | Medium | List view ships on BOTH platforms (toggle on desktop, default on mobile); same data, same node/edge ontology |
| Screen-reader experience uneven across NVDA/VoiceOver/JAWS | Medium | High | Test on 2+ readers before close; structured-list fallback is the AT-canonical path; SVG is `aria-hidden`; arrow-key nav is the only graph-specific AT API |
| d3-force MIT-compat license issue | Low | Low | License files vendored alongside the bundles; provenance in `public/vendor/README.md` |
| Bundle vendoring drift (someone runs `npm install d3-force` and ships unminified) | Low | Medium | Vendored bundles are CHECKED IN; `package.json` lists d3-force + d3-zoom only as devDependencies and only for re-minifying the bundle; never at runtime |
| Graph reveals previously-uncomputed surface (e.g. orphan notes) and user wants to "fix from here" → scope creep into edit-from-graph | High | Medium | DoD includes explicit "read-only" sign-off; toolbar has NO edit buttons; right-click menu has NO edit options; commit message C0 hard-codes "no edit-from-graph"; Risk section refers v3.4+ explicitly |
| Cross-text and Graph duplicate root-matching logic → divergent results | Medium | High | Both modules call `MorphProvider.analyze()` + `morph-normalize`; Graph imports Cross-text's `getIndex()` (new tiny export, see §1) instead of building its own |
| Service Worker GRAPH_CACHE causes stale loads after a graph patch | Low | Medium | Cache version bumps with each Graph release; old version evicted on SW activate; existing `MORPH_CACHE` pattern is the template |
| Visual regression captures become flaky on CI due to subtle font/anti-aliasing changes | Medium | Low | Pixel-diff tolerance ≤ 1%; captures use a single font (system-ui); CI runs on consistent Chromium build pinned by Playwright |
| User attempts graph on a real ulpan cohort and graph feature ends up implicitly counting as a "telemetry surface" in IRB review | Low | High | Privacy smoke pins ZERO events; no telemetry; if a researcher later wants graph-navigation data, this is a SEPARATE plan with fresh consent audit (Example F) — NOT folded in |

---

## Appendix A. Open questions to resolve before C0

1. **Right-click menu on touch devices.** Long-press is the touch analog. Should we ship long-press for "Isolate cluster" in v1, or defer? Recommendation: defer (touch users have the cluster-card UI which does the same thing).
2. **Pin/unpin convention.** Drag-and-release pins automatically? Or explicit "pin this node" affordance? Recommendation: drag-pins, double-click unpins. Match Roam / Obsidian convention.
3. **Zoom default level.** Fit-to-content on open? Or fixed 1.0 scale? Recommendation: fit-to-content with a 10% margin.
4. **Edge labels.** Show `link_alias` on hover/focus? Recommendation: hover only (visual noise on focus).
5. **Persistent layout.** Should node positions persist across sessions? Recommendation: NO — re-simulate each open. Persistence adds state surface; lazy-load + perf budget makes re-sim cheap enough.

These need a sign-off pass before C0 opens.

---

## Appendix B. Out-of-scope confirmation list (HARD)

Explicitly NOT in v3.3.6:

- [ ] Editing notes/links from the graph (DnD to create edges, right-click "delete link", etc.)
- [ ] Creating new notes from the graph
- [ ] Cloud sync of graph state
- [ ] Multi-user graph (shared with another LinguistPro user)
- [ ] Telemetry on graph navigation
- [ ] New `metrics.outcome.graph_*` fields
- [ ] New `/api/research/v1/graph*` endpoints
- [ ] Premium SRS Epic touch
- [ ] DictaBERT Tier-3 morphology touch
- [ ] Index.html monolith code-split (the graph lazy-load pattern is a precursor, not the split itself)

If any of these surface as user requests during v3.3.6 implementation: escalate, do NOT silently fold in. Each item has its own scope discussion needed.

---

**Plan authored 2026-05-15 by Claude Opus 4.7 (1M context) on behalf of the project owner. Implementation does not start until user re-approves this gate.**
