# Knowledge-Map Market Research (2026-06) — premium mindmap + scalable rendering + language-learning graphs

> **Purpose.** Refresh of `SMART_GRAPH_MARKET_RESEARCH_v3_5.md` (2026-05-16),
> commissioned for the **from-scratch root-centric redesign** (see
> `KNOWLEDGE_MAP_REDESIGN_v3_8.md`). The v3.5 scan deliberately optimized for
> the *minimal* A2+A5 step; this refresh studies **premium, scalable,
> customizable** knowledge-map tools so the redesign borrows best practices
> rather than reinventing them.
>
> **Method.** Three parallel research passes (2026-06-03): (1) premium
> mindmap/graph UX & customization, (2) scalable in-browser graph rendering &
> layout/clustering, (3) language-learning graphs + Hebrew root pedagogy +
> learning science. Sources at the end.

---

## 1. Premium mindmap / knowledge-graph UX — transferable ideas

| Tool | Metaphor | Best idea to borrow | Apply to us (380px RTL, ~9K notes) |
|---|---|---|---|
| **TheBrain** (assoc. gold standard) | active thought centre + plex | **Dynamic focus**: only the active node's neighbourhood shows; click a neighbour recenters. First-class typed links with inherited color/icon. | Our default mode. Centre = current lemma/root; semantic axes (root up, siblings sides, forms/source texts down); tap recenters; never > 1–2 rings. |
| **Obsidian** | global + **local graph** | Local graph (depth N) stays useful at any vault size; color groups by query. | Local graph as default; **drop** the global graph (or hide behind an "explore" mode with a forced filter). Color groups → status/binyan. |
| **Kumu** | network + element profiles | **Focus / Filter / Cluster / Decoration / Metrics** as five separate levers. | Direct model for our facets: filter by binyan/pos/status; decoration size=frequency; cluster by root; saved views. Most transferable model of all. |
| **Heptabase / Obsidian Canvas** | spatial board + sections | Named sections + nested boards; a card lives in a library, a board is one of its views. | "Themed boards" as saved user views (e.g. "verbs of motion") while cards stay one note store — no data duplication. |
| **Tana** | outline + supertags (typed nodes) | Typed nodes → queryable graph, not amorphous. | Our nodes are already typed (root/lemma/form/text); make **edges typed** → user filters "show only root→lemma." |
| **Roam** | bidirectional links + linked refs | **Linked/unlinked references** as a *panel*, not a graph; navigation via list. | On 380px a textual "where this root/form also appears" panel beats a graph; graph is a complement. |
| **XMind / MindNode** | hierarchical tree | Few **layout presets** + flawless default; premium-feel via restraint and 60fps expand/collapse. | 2 presets only (radial root-centre / tree root→binyan→forms); spring expand animation; fewer features, buttery on mobile. |
| **Miro / Whimsical** | infinite canvas + smart layout | **Auto-layout** so the user never drags nodes. | Always auto-laid-out around focus (manual drag at 380px touch is painful). |
| **Milanote** | cards on a table | Rich preview cards. | Tap → preview card (lemma + niqqud + gloss + mini-paradigm) → full open. Progressive disclosure layer. |
| **Cambridge Intelligence / InfraNodus** (methodology) | graph as analysis tool | **"Hairball is fine in the data, never near the UI"**; render a derived view per workflow, not the raw model. | Core architectural principle: render a derived neighbourhood per task ("study a root", "review a binyan"), never the raw 9K DB. |

**Take:** focus + neighbourhood + progressive disclosure as default; semantic
axes (not free force physics); Kumu facets; typed edges; saved views.
**Don't take:** global 9K graph; force-physics as the base; manual drag on
mobile; 3D; layout/theme overload.

---

## 2. Scalable in-browser rendering (vanilla PWA, offline, mobile)

**Rendering thresholds (benchmarks):** SVG ~600–2K nodes @30fps; Canvas2D
~5–20K; WebGL ~7K–100K+. For ~9K, SVG is out, Canvas2D is borderline under
interaction, **WebGL is safe with ×5–50 headroom**.

**Library verdict (MIT, no-bundler, mobile, offline):**
- **Sigma.js v3 + graphology** — RECOMMENDED for the overview. WebGL, MIT,
  UMD/ESM on CDN → SW-cacheable, built-in pan/zoom/**multitouch**;
  graphology gives **Louvain clustering + metrics offline**. 100K+ ceiling.
- **cosmos.gl** (MIT, GPU layout) — powerful but needs `OES_texture_float`,
  **absent on some Android** → disqualified as the mobile base (optional
  desktop turbo only).
- **Cosmograph** (CC-BY-NC) and **Ogma** (paid) — license-disqualified.
- **force-graph** (vanilla, MIT, Canvas2D) — fine mid-option, ~5–10K, tight
  at 9K interactive.
- **Cytoscape.js** — weak renderer at 9K but a good **headless layout engine**
  (fcose/cola/dagre).

**Layout:** the corpus is hierarchical (root → binyan → derived → notes), so
use **radial/hierarchical** per root + force only within clusters.
**Precompute layout offline** (Worker or build step), store `x,y` in OPFS →
runtime just draws static coords (zero simulation cost on mobile). This is
the industry pattern for large graphs.

**Anti-hairball at scale:** Louvain **cluster-collapse** (show ~50–300
community nodes, expand on tap) + **semantic zoom / LOD** (labels/edges by
zoom) + **focus+context** (full detail only around the selection) +
inter-cluster edges aggregated.

**Mobile:** Sigma gives gestures free; avoid float-texture libs; feature-
detect `getContext('webgl')` + fallback to the cluster list (we already have
one). On 380px the cluster-list + focus-graph-around-one-word is the right UX;
a full 9K overview is never the mobile default.

**Ceiling per approach (our hardware):** D3-SVG ~1–2K; force-graph Canvas2D
~5–10K; **Sigma WebGL + precomputed layout 50K+** (our 9K comfortable).

---

## 3. Language-learning graphs + Hebrew roots + learning science

| Source | Technique | Apply to us |
|---|---|---|
| **Traverse** | mind-map + connected notes + SRS in one surface, science-based chunking | Validates graph+notes+SRS as **one tool**; chunk by root/binyan. |
| **LingQ** | per-word status overlay new/learning/known | Identical 3-state coloring on nodes (and library words); the map shows the learner's knowledge frontier. |
| **AnkiMorphs / MorphMan** | known/unknown **morphs**, **i+1** sequencing, frequency ranking | Gate graph expansion + quiz selection by "one new morph"; frequency-rank roots/words. |
| **Glossika** | whole-sentence reconstruction + SRS | Link each word to example sentences from the learner's library; push quizzes toward production. |
| **Vocabulary.com** | adaptive difficulty + many item types per word | Adaptive difficulty keyed to learner model; node = launchpad to varied retrieval. |
| **Memrise / Quizlet** | recognition-heavy SRS | Cautionary: recognition is the weakest layer; climb to reconstruction. |
| **Pealim** | per-verb: all binyanim of the root + root-related nouns by mishkal, ±niqqud + translit | This **is** the root-cluster data model; we already scrape it (`pealim-infl-v11`) — render the family as the graph neighbourhood. |

**Hebrew roots (the spine, R1).** A 3-consonant root carries core meaning;
patterns project it: **binyanim** (7 verb stems) and **mishkalim** (noun/adj
patterns encoding agent/place/instrument/abstract). Same root + pattern =
predictably related meaning, letting learners decode unseen words. Edges must
be morphologically real: `root→binyan-form` (labelled by binyan),
`root→derived noun` (labelled by mishkal), `word→paradigm`, `word→example
sentences`. Interactive morphological family trees are essentially **absent**
in the market — our differentiation. Caveats (R1): loanwords/frozen/denominal
forms don't map cleanly → show provenance, never invent; don't dump the
7-binyan grid on beginners (progressive reveal).

**Learning science (implications):**
- **Generation effect / retrieval-based concept mapping** (Frontiers 2024):
  building the map *from memory* beats viewing it → learner must draw/confirm
  the link.
- **RP + concept mapping combined** (O'Day & Karpicke 2021) beats either →
  **quiz on the graph** (reconstruct from recall).
- **Concept maps (Novak):** hierarchy, not a flat hairball.
- **Spacing + interleaving:** SRS schedules which root resurfaces; interleave
  roots/binyanim.
- **Durability:** recognition < assisted recall < independent reconstruction
  → push to production.
- **i+1 comprehensible input:** ~one new element per step.
- **PKM graph ≠ instructional graph:** default view = the learner's frontier
  (a few known + one new), not the whole DB.

**Beginner vs advanced (R2/R4):** beginner = one root, 2–3 high-frequency
derived words, one binyan, status colors, one example; no 7-binyan grid.
Advanced = full cluster across binyanim/mishkalim + cross-root semantic links
+ paradigm tables + interleaved review.

---

## 4. Anti-patterns to avoid (with evidence)

1. **Hairball by default** — force-directed >200 nodes = pretty, useless.
2. **Flat "all links equal"** — no hub/leaf hierarchy; need size-by-metric +
   typed edges.
3. **Topology instead of operability** — Obsidian graph doesn't show what's
   learned/draft/stale; status must be encoded or the map is decorative.
4. **Encoding-channel overload** — color + size + shape + width at once is
   unreadable; max 2 active channels at 380px.
5. **Manual drag on mobile** — auto-layout mandatory.
6. **Navigation dead-ends** (R4) — every node leads somewhere (note/root/text).
7. **Lag on large data** — render only the visible neighbourhood, not 9K in
   the DOM/canvas.
8. **Mobile as a shrunk desktop** — design for 380px first.
9. **Recognition-only quizzing** — climb to reconstruction.

---

## 5. Sources

**Premium mindmap UX:**
- TheBrain 10 review — https://www.seriousinsights.net/review-thebrain-10/
- Kumu — Metrics & SNA — https://docs.kumu.io/guides/metrics · https://docs.kumu.io/disciplines/sna-network-mapping
- Heptabase first look — https://thesweetsetup.com/a-first-look-at-heptabase-a-pkm-app-for-research-and-learning/
- Obsidian Graph view — https://obsidian.md/help/plugins/graph · Extended Graph — https://www.obsidianstats.com/plugins/extended-graph
- "Obsidian's Graph View is beautiful and almost useless" — https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful
- Cambridge Intelligence — fixing data hairballs — https://cambridge-intelligence.com/blog/hairball-effect-in-graph-visualization/
- Graph views in Obsidian/Tana/Anytype — https://medium.com/@ann_p/visualizing-connections-graph-views-in-obsidian-tana-and-anytype-3c767e08fe66
- Semantic zoom — https://www.emergentmind.com/topics/semantic-zoom

**Scalable rendering:**
- Rendering bench (SVG/Canvas/WebGL, to 200K) — https://pmc.ncbi.nlm.nih.gov/articles/PMC12061801/
- Horak 2018, large-graph render perf — https://imld.de/cnt/uploads/Horak-2018-Graph-Performance.pdf
- Sigma.js — https://github.com/jacomyal/sigma.js/ · https://www.jsdelivr.com/package/npm/sigma
- cosmos.gl (Android float-texture limit) — https://github.com/cosmosgl/graph
- graphology-communities-louvain — https://graphology.github.io/standard-library/communities-louvain.html
- Cytoscape layouts (fcose) — https://blog.js.cytoscape.org/2020/05/11/layouts/ · fCoSE — https://yoksis.bilkent.edu.tr/pdf/files/15807.pdf
- Multi-scale community visualization — https://journals.sagepub.com/doi/full/10.1177/1473871616661195
- force-graph — https://github.com/vasturiano/react-force-graph · Louvain→Leiden — https://arxiv.org/pdf/1810.08473

**Language learning + Hebrew + science:**
- Traverse — https://traverse.link/
- LingQ vocabulary status — https://www.lingq.com/en/help/vocabulary/
- AnkiMorphs — https://mortii.github.io/anki-morphs/ · MorphMan — https://github.com/ianki/MorphMan21
- Pealim root family/mishkal — https://hebrewselfstudy.wordpress.com/2020/06/03/pealim-com-conjugations-and-inflections/
- Hebrew root system (shoresh) — https://talkpal.ai/culture/how-does-the-hebrew-root-system-shoresh-work/
- Roots & derived words (mishkalim) — https://biblicalhebrew.org/roots-and-derived-words-in-biblical-hebrew-uncovering-the-languages-generative-core.aspx
- Retrieval-based concept mapping (Frontiers 2024) — https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1287744/full
- O'Day & Karpicke 2021 — https://learninglab.psych.purdue.edu/downloads/2021/2021_ODay_Karpicke_JEDP.pdf
- Knowledge graphs in education (Heliyon 2024) — https://www.cell.com/heliyon/fulltext/S2405-8440(24)01414-2

*Authored 2026-06-03 (Claude Opus 4.8, 1M context). Three-pass market +
science scan to ground the root-centric Knowledge Map redesign.*
