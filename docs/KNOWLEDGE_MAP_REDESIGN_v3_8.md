# Knowledge Map Redesign v3.8 — root-centric learning graph

> **Status.** APPROVED (owner, 2026-06-03). From-scratch redesign of the
> Smart Learning Graph into a **root-centric, uncompromising learning
> tool** — not a decorative PKM graph. Living implementation document:
> updated after every phase (working norm #3). Companion plan (private):
> `~/.claude/plans/parsed-foraging-anchor.md`. Market research:
> `docs/SMART_GRAPH_MARKET_RESEARCH_2026_06.md`. Supersedes the minimal
> v3.6 A2+A5 direction in `SMART_GRAPH_REQUIREMENTS_v3_5.md` /
> `SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`.
>
> Applies project role-lenses (`docs/PROJECT_ROLES.md`): **R1** lexicographer ·
> **R2** SLA methodist · **R3** graph architect · **R4** premium-UX · **R5** market.

---

## 0. Why a redesign (problem statement)

The shipped v3.6 graph is **note-centric** (organizing unit = a note),
renders a force-directed layout on D3/SVG (cap 200 nodes), and is
fundamentally a *viewer*. Three structural problems:

1. **Wrong spine.** Hebrew is generative from **roots (שורש)**: a
   3-consonant root projects into words via **binyanim** (verb stems) and
   **mishkalim** (noun/adjective patterns). The learnable unit is the
   *root family*, not the note. A note-centric graph cannot express the
   morphology that makes the language learnable.
2. **Passive = pedagogically weak.** Learning-science evidence
   (generation effect; retrieval-based concept mapping, Frontiers 2024;
   O'Day & Karpicke 2021) shows the gain comes from the learner
   *constructing/reconstructing* the connection, not viewing a pre-made
   map. A viewer adds little learning value.
3. **Doesn't scale or guide.** D3/SVG caps ~200; top-by-degree reduction
   on a real 9K-note corpus surfaces giant text hubs (a hairball), not
   teaching clusters. No known/learning/new state, no "what to learn
   next."

**Goal:** a root-centric, status-aware, generative, customizable map that
is the *uncompromising help tool* a serious learner needs.

---

## 1. Locked decisions (owner, 2026-06-03)

1. **Spine = root-centric.** Atomic unit = the root family:
   `root → binyanim/mishkalim → derived words → example sentences from the
   learner's own texts`. This is the R1/R5 differentiator — Pealim/Reverso/
   Morfix *list* families; nobody renders them as a navigable, status-aware
   learning graph.
2. **v1 scope = all four:**
   - **(a) Status overlay known/learning/new** as the *primary* visual
     channel (LingQ model), wired to SRS.
   - **(b) Generative quiz on the graph** — reconstructing the cluster *is*
     retrieval practice (the strongest learning-science finding).
   - **(c) Customization facets** (Kumu model: filter / decoration /
     cluster / saved views).
   - **(d) i+1 + frequency** (AnkiMorphs: expand/select by "one new
     morpheme"; rank roots by corpus frequency).
3. **Rendering = hybrid with a perf gate.**
   - Phase 1: **focus-core on the current D3** (≤~100 nodes on screen, no
     new dependency).
   - Phase 6 (post-pilot): **WebGL whole-corpus overview** — only behind a
     **mandatory perf gate**: offline-precomputed layout stored in OPFS +
     Louvain cluster-aggregation (top level ~50–300 community nodes,
     expand on tap) + WebGL feature-detect + fallback to the cluster list.
     A perf spike on real Android **before** building the overview.

---

## 2. Role analysis (synthesis of market + science + morphology)

- **R1 (lexicographer):** graph axes = real morphology (root → binyan/
  mishkal → form), never invented "similarity." Pealim enrichment shows
  only really-scraped forms with provenance; **no synthesized forms.**
- **R2 (SLA methodist):** value is in the learner *building/reconstructing*
  the link (generation effect + retrieval practice), not passive viewing.
  Learning status is a mandatory channel. Quiz happens *on* the graph.
  Graph + notes + SRS = one surface (Traverse).
- **R3 (architect):** raw 9K graph → derived neighbourhood view; render
  only the visible; scale via OPFS + focus + cluster-collapse, never "dump
  9K." Layout is an offline step, not a runtime cost.
- **R4 (premium-UX):** default = focus + 1 ring, auto-layout (no manual
  drag at 380px RTL), smooth recenter (MindNode bar), progressive
  disclosure (tap → preview card → note/paradigm), no dead-ends, max 2
  active encoding channels on mobile.
- **R5 (market):** bar = TheBrain plex (association) + Kumu (facet control)
  + Pealim (root-family data), but in a mobile-first execution none of them
  ship. That is the differentiation.

---

## 3. Architecture

### 3.1 Keep vs rebuild (honest "from scratch")

**Keep (reuse the foundation):**
- Privacy projection `_fetchRaw` — reads only `json_extract($.root|
  $.binyan|$.word)` + title (`public/js/notes-graph.js`). Never the body.
- Read-only SQL guard `_READONLY_RE` / `_FORBIDDEN_RE` (both modules).
- SRS tables + `getLearningStateOverlay()` (`public/db/local-db.js`) —
  basis for the status overlay.
- The pedagogical "confirm = retrieval" model (`note_link_suggestions` +
  confirm panel) — extends naturally into the generative quiz.
- Data providers: `public/js/morph-provider.js` (root/lemma/binyan/pos),
  `public/js/crosstext.js` (rootIndex), `db/premium/providers/pealim.js`
  (root family + mishkal + gloss, `pealim-infl-v11`).
- Smoke conventions (`scripts/notes-graph/*-smoke.js`, privacy/perf/visual)
  and the append-only migration model.

**Rebuild (the redesign):**
- Organizing model: note-centric → **root-centric** (new builder producing
  root clusters with morphological edges). The note-centric default view is
  retired; reusable render/guard infra is salvaged.
- Default view: **focus-first root-radial** (root centre, words radial,
  edges labelled binyan/mishkal) replacing the note force-graph.
- New interactions: generative quiz, customization facets, saved views,
  i+1 recommendation, status as the primary channel.

### 3.2 Data model (v1 — offline, read-only, deterministic)

- **Root source v1 = the learner's own corpus** (≈9K word_study notes from
  block ②: `notes_v2.body_json` root/binyan/word/pos/meaning). Group by
  root → clusters; edges `root→word` (label binyan/mishkal),
  `word→source-text/sentence`, `word→paradigm` (existing Layout-B tables).
- **Graph node = distinct lemma, not note occurrence** (Phase-0 finding §9):
  a lemma is one node; its **frequency = occurrence count** (drives node size
  + ranking). This keeps a focus cluster ≤ ~29 nodes (real corpus max) — no
  collapse needed in the focus core; the old `SHARED_SKIP_OVER=24` cap is
  **not** inherited.
- **Frequency** — from the corpus (node size + root ranking).
- **Status** — from `getLearningStateOverlay()` (srs_cards.state +
  srs_attempts) → known/learning/new per node.
- **Pealim root-family enrichment** — Phase 5 (post-pilot), lazy, per-root,
  with provenance, marking forms "not yet in your texts." **No invented
  forms (R1).**
- **Words with no root** (≈46% of corpus — function words): degrade, don't
  error; shown via their source text, outside root clusters.

### 3.3 Modules

| Module | New/Modify | Responsibility |
|---|---|---|
| `public/js/knowledge-map-data.js` | NEW | root-cluster builder (read-only, deterministic, capped), frequency, status overlay. `window.KnowledgeMap.build(...)`. |
| `public/js/knowledge-map-view.js` | NEW | D3 root-radial focus view + mobile cluster-list + facets render. |
| `public/js/knowledge-map-quiz.js` | NEW | generative reconstruct-cluster retrieval; logs SRS via engine. |
| `public/db/local-db.js` | MODIFY | frequency aggregate; saved-views CRUD; reuse `getLearningStateOverlay`. |
| `public/db/migrations.js` | MODIFY | (opt.) `kmap_saved_views` append-only migration. |
| `public/index.html` | MODIFY | mount + module load (behind feature flag). |
| `public/i18n/locales/{ru,en,he}.js` | MODIFY | map strings (RTL HE). |
| `db/premium/providers/pealim.js` | MODIFY (Phase 5) | root-family enrichment. |

---

## 4. Phased delivery

> Per-phase green discipline: independently runnable; relevant `smoke:*`
> green; live browser test (desktop + 380px RTL) for UI phases; doc +
> CHANGELOG + memory updated; `CACHE_VERSION` bump on shipped-asset change.
> New view ships **behind a feature flag** (pattern: `wordCardRich_v1`); the
> old note-graph stays until acceptance → instant rollback by flag.

- **Phase 0 — Spec + data spike.** This doc + market-research doc + memory
  (done). Data spike `scripts/notes-graph/kmap-corpus-spike.js`: measure
  root distribution on the real 9K corpus (root count, family sizes,
  frequency, %with-root, binyan distribution, status coverage) → calibrate
  cluster sizes, ranking, i+1 feasibility. Self-skips if
  `.tmp/test-enriched.zip` is absent.
- **Phase 1 — Root-centric data layer** (`knowledge-map-data.js`):
  read-only, deterministic, capped; morpho-labelled edges; frequency;
  status overlay. Smoke `kmap-data-smoke.js` + real-corpus run.
- **Phase 2 — Focus view** (D3 root-radial) + status overlay primary +
  mobile cluster-list. Color=status, size=frequency, recenter on tap,
  progressive disclosure; ≤~100 on screen; 380px RTL cluster-list primary;
  theme inherit (v3.7 dark-theme trap). Live browser test + screenshots.
- **Phase 3 — Customization facets** (Kumu): filter (pos/binyan/status/
  text), decoration (size/color), cluster-by-root, saved views, 2 layout
  presets (radial/tree), focus depth, pin/collapse; max 2 channels on
  mobile. Persistence: `kmap_saved_views` migration or OPFS key (decided in
  Phase 0/3).
- **Phase 4 — Generative quiz + i+1/frequency** (`knowledge-map-quiz.js`):
  reconstruct cluster (place word→root / guess binyan / recall meaning →
  reveal); log SRS review/attempt via the engine (canvas stays read-only).
  i+1 "learn next" recommendation + frequency ranking.
- **Phase 5 (post-pilot) — Pealim root-family enrichment.** Lazy, per-root,
  provenance, no invented forms; cached like the conjugation accordion.
- **Phase 6 (post-pilot) — WebGL overview (Sigma.js)** behind the perf gate
  (§1.3): offline layout in OPFS + Louvain aggregation + feature-detect +
  fallback; Android spike before building. Sigma.js v3 + graphology (MIT,
  UMD→SW-precache, **CACHE_VERSION bump**); semantic zoom/LOD; aggregated
  inter-cluster edges only.
- **Phase 7 — Regression, docs, gate.** Smoke suites, visual baselines,
  privacy-smoke extended (zero events/network), perf-smoke ceilings,
  package.json scripts, CHANGELOG, version v3.8, CLAUDE.md pointer. Release/
  tag on explicit owner instruction.

---

## 5. Hard invariants (every phase)

- **Read-only canvas** — the graph never writes `note_links`; authoring is
  in the editor. The quiz writes only SRS events via the engine (not links).
- **Privacy projection** `_fetchRaw` unchanged (only root/binyan/word/
  title); `privacy-smoke` pins it — do not weaken.
- **Offline-first** — any WebGL lib in SW precache; **bump `CACHE_VERSION`**
  on any shipped JS/index/locale change (`feedback_sw_cache_version_bump`).
- **Consent/telemetry** — zero network/events from the view; the Phase-5
  Pealim fetch is a dictionary lookup (like the shipped conjugation
  accordion), not user-data egress → no consent bump.
- **R1** — no invented forms; root families only from real data / Pealim
  with provenance.
- **Determinism** for always-on tiers; smoke-pinned. Append-only migrations.

---

## 6. Verification

1. Data spike: `node scripts/notes-graph/kmap-corpus-spike.js` → root/
   frequency/status distribution on the real 9K.
2. Data layer: `kmap-data-smoke.js` green on the real corpus; determinism;
   read-only (SELECT only); degrades on root-less words.
3. Focus view: Playwright import `.tmp/test-enriched.zip` → open the Map →
   desktop 1440×900 + mobile 380×820 RTL screenshots; meaningful root
   clusters, status colors, no hairball, no dead-ends.
4. Customization/quiz: smoke on facets/saved-views/generative loop; SRS
   events written; canvas stays read-only.
5. Regression: `npm run smoke:graph` + privacy-smoke + perf-smoke green;
   visual baselines refreshed deliberately.
6. WebGL overview: Android perf spike **before** building; feature-detect/
   fallback confirmed.
7. Deploy on owner instruction: git push → Coolify; `CACHE_VERSION` bumped.

---

## 7. Risks / rollback

- **WebGL overview perf** — neutralized by the perf gate (offline layout +
  cluster aggregation + fallback); the v1 core (Phases 0–4) doesn't depend
  on it.
- **Scope vs pilot date** — Phases 0–4 core before B4 (~mid-July 2026);
  Phases 5–6 post-pilot. If the core slips, Phase 2 focus view + status is
  the minimal valuable slice.
- **Root coverage** (≈46% root-less) — degrade, don't error.
- **Rollback** — new view behind a feature flag; the old note-graph stays
  until acceptance; clearing the flag = instant rollback.

---

## 9. Phase 0 findings — data spike (2026-06-03)

Measured on the real corpus (`.tmp/test-enriched.zip`, 9037 word_study notes)
via `scripts/notes-graph/kmap-corpus-spike.js`. Numbers that shape the design:

| Metric | Value | Design implication |
|---|---|---|
| with root | 53.6% (root-less 46.4%) | Spine covers ~half; root-less (prep/pron/adverb/particle) attach to source-text / stand alone — degrade, don't error. |
| distinct roots | 1199 | — |
| **teachable roots (≥2 distinct lemmas)** | **473** (726 singletons) | The root-cluster view is rich for ~473 roots; singletons are leaf nodes on their source text. |
| **family size (distinct lemmas/root)** | median 1, p90 6, **max 29** | **Node = distinct lemma** → focus cluster ≤ ~29 nodes; **no collapse needed in the focus core.** |
| roots > old SHARED_SKIP_OVER(24) | 3 | Confirms the old cap drops top teaching roots — root-centric must not inherit it. |
| top roots (by notes) | בוא 66, הלך 61, ראי 54, עשי 54, ידע 52, אמר 51 | Classic high-frequency teaching roots — exactly what to surface first. |
| top lemmas (raw freq) | לא 70, את 66, לי 64, אני 63 … | All **function words** (root-less) → "learn-next"/ranking must weight **content** words, else particles dominate. |
| binyan | paal 1503 ≫ hifil 429, piel 371 … | paal ubiquitous → good as an edge label, poor as a grouping/encoding channel. |
| source texts | 80, max **725** notes/text | Text hubs are huge — avoided by design (text = secondary edge `word→text`, never the spine/hub). |

**Locked from Phase 0:** (1) node = distinct lemma, size = frequency; (2) no
`SHARED_SKIP_OVER` inheritance; (3) frequency ranking weights content POS;
(4) root-less words route to source-text, never error; (5) status overlay
reads live SRS at runtime (absent from the static artifact).

## 10. Phase 2 integration points (mapped 2026-06-03)

Exact hooks for wiring the new view behind a flag (instant rollback):
- **Open flow / button:** `#btnGraph` (`index.html:~10202`) → `window.LinguistProGraph.open()`
  (`public/js/notes-graph-loader.js`, lazy-loads chunks `vendor/d3-graph.min.js`,
  `notes-graph-render.js`, `notes-graph.js`). New view = new chunk
  `knowledge-map-view.js`; route to it from the loader/open when the flag is on.
- **Shell/state machine:** `public/js/notes-graph.js` — `notesGraphOverlay`/
  `notesGraphPanel`, `data-graph-state` (loading|empty*|error*|fallback_mobile|
  loaded), `buildShell()` (~526), `open()` (~1319). Reuse shell + states.
- **Feature flag:** mirror `v3WordCardRichEnabled()` (`index.html:~39704`,
  `localStorage "wordCardRich_v1"`, default-on) → add `v3KnowledgeMapV1Enabled()`
  reading `"knowledgeMapV1"`.
- **i18n:** `window.t(key)` + `applyI18n()` (`public/i18n/index.js`); add a
  `knowledgeMap:{…}` block beside `graph:{…}` in `public/i18n/locales/{ru,en,he}.js`
  (`graph` block ~ru.js:2037; he = RTL).
- **Theme:** CSS vars `--theme-bg/-text/-accent/-border` (`index.html:~37–174`,
  `:root` + `@media prefers-color-scheme:dark` + `body.theme-dark`); use
  `var(--theme-*, fallback)` inline (graph pattern). v3.7 dark trap: inline styles
  must carry theme vars, not hardcoded colors.
- **Mobile:** `isFullGraphAllowed()` (`notes-graph.js:~482`, ≥1024px + landscape)
  → `fallback_mobile` cluster cards (`data-graph-cluster-*`, render ~1087). Reuse
  the cluster-list pattern as the 380px primary view.
- **CSS button trap:** add `#<kmapPanelId> button { width:auto; }` near the
  exceptions block (`index.html:~2212–2224`) — global `button{width:100%}` at
  `@media(max-width:600px)`.
- **SW:** chunks load lazily → cache via the graph pattern; bump `GRAPH_CACHE_VERSION`
  (`sw.js:~52`, `GRAPH_CHUNK_RE`) when adding kmap chunks (and `CACHE_VERSION`
  `sw.js:30` if any precached shell asset changes).

## 8. Revision history

| Date | Change |
|---|---|
| 2026-06-03 | Doc created. Phase 0: spec + market-research formalized; data spike run on real 9K corpus (§9 findings); node=distinct-lemma locked. |
| 2026-06-03 | **Phase 1 DONE.** `public/js/knowledge-map-data.js` (read-only root-centric data layer: build/rootCluster/rankRoots; status overlay 5→3 state; root-less excluded+counted; text never a node). Smoke `scripts/notes-graph/kmap-data-smoke.js` 6/6; wired `smoke:graph:kmap-data` into the `smoke:graph` chain + `smoke:graph:kmap-spike` (manual). |
| 2026-06-03 | **Phase 2 DONE (v1 focus view).** `public/js/knowledge-map-view.js` — dependency-free SVG root-radial (root centre, radial lemmas, color=status, size=frequency, binyan/pos edge labels, progressive-disclosure preview with lazy gloss/niqqud) + ranked root list + 380px RTL cluster-list + root-sheet radial. Integrated behind flag `knowledgeMapV1` (helper `v3KnowledgeMapV1Enabled`, `🌳 #btnKnowledgeMap`, module `<script>`s, i18n `knowledgeMap.*` ru/en/he, SW `CACHE_VERSION`→`v3.6.0-kmap-phase2` + precache). **Live browser tested:** desktop + 380px RTL (fixture + REAL 9042-note corpus, build+render 1181 ms, no pageerrors); boot-check 3/3 (`smoke:graph:kmap-boot`); dev tools `smoke:graph:kmap-shot|kmap-real`. Next: Phase 3 facets. |
