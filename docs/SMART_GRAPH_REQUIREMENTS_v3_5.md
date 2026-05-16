# Smart Knowledge Graph — Requirements & Options (v3.5)

> **Status.** Requirements + options analysis for owner decision.
> Triggered by dogfood feedback (2026-05-16): "связи делать неудобно,
> неинтуитивно… невозможно найти органично… ожидаемо разработать
> умную карту, которая самостоятельно анализирует и строит карту".
>
> **Already shipped in this iteration (v3.5 prototype fixes — no
> decision needed, they just make it usable):** notes auto-attach to
> their source text (`auto_text` backbone), texts-with-notes become
> visible nodes, the graph renders even with zero `[[` links (teaching
> demoted to a dismissible banner), browse-on-`[[` shows recent texts.
> Verified against the user's real bundle
> (`scripts/notes-graph/bundle-data-smoke.js`, 5/5). This document is
> about the **deeper "self-analyzing" graph** beyond that prototype.

---

## 1. Hard invariants (apply to every option below)

These are non-negotiable and pre-decided by prior plans — every
option must respect them:

- **Local-first / offline.** The app is OPFS + wa-sqlite, works
  offline. Anything that *requires* the network can only be an
  *optional, opt-in enrichment*, never the default path.
- **Graph stays read-only.** The graph canvas never creates/edits
  `note_links`. "Smart" suggestions may *propose* links, but
  authoring happens in the note editor (the existing `[[` flow), and
  only on explicit user acceptance.
- **Privacy.** No new telemetry/events; no note body text leaves the
  device without explicit, scoped, opt-in consent; `CONSENT_VERSION`
  governs any new data flow. Auto-derived edges are computed from
  local data only.
- **Determinism where it matters.** Auto-edges that are always-on
  must be explainable and stable (same input → same graph), capped,
  and filterable (the U7 per-kind chips + the legend already do
  this). Probabilistic/AI suggestions must be visually distinct and
  never silently mutate data.
- **Performance budget.** Top-N-by-degree cap (200) + chunked force
  ticks are already in place; any new edge source must respect the
  cap and not produce a hairball.

---

## 2. What latent structure already exists (free signal)

Before adding anything, the app *already* has rich relational data we
are under-using:

| Signal | Where it lives | Today | Smart potential |
|---|---|---|---|
| Note → source text | `notes_v2.text_id` | **now used** (`auto_text`, v3.5) | backbone ✓ |
| Note → root/binyan/word | `body_json` json_extract | used (`derived_morph`) | shared-root clusters ✓ |
| **Cross-text shared lemma/root** | `crosstext.js` builds `rootIndex: Map<rootKey, Set<formKey>>` across ALL texts via `MorphProvider.analyze()` | computed for the cross-text panel, **not fed to the graph** | **huge** — every text-pair sharing a root is a derivable edge |
| Sentence ↔ words | table model rows (372 rows in the test bundle) | not in graph | co-occurrence edges |
| Note co-occurrence | notes on the same sentence/row | partial (anchor) | "studied together" edges |
| Quiz/SRS activity | quiz + srs tables | not in graph | "weak/strong" overlays |

**Key insight:** the single highest-value "smart" upgrade needs **no
AI and no network** — it's wiring the existing `crosstext` root index
into the graph as a tier of `auto_*` edges.

---

## 3. Implementation options (the menu)

### Option A — Programmatic heuristics (no AI, no network)

Deterministic edges synthesized from local data. Tiers, each a
toggleable edge kind (extends the v3.5 `auto_text` model):

| Tier | Edge | Rule | Cost | Risk |
|---|---|---|---|---|
| A1 ✅ done | `auto_text` | note ↔ its `text_id` | trivial | none |
| A2 | `auto_shared_root` | notes/texts sharing a root (reuse `crosstext` rootIndex) | low (index already computed) | hairball if a root is ubiquitous → cap edges/root, weight by rarity |
| A3 | `auto_cooccur` | notes on the same sentence/row; words co-occurring in a row | low | moderate density → threshold + cap |
| A4 | `auto_lexical` | same lemma across different texts (cross-text "you saw this word here too") | medium (needs per-row morphology) | depends on morph coverage |
| A5 | activity overlay | colour/size nodes by SRS strength / quiz accuracy | low | none (visual only) |

- **Pros:** offline, free, instant, private, deterministic,
  explainable ("соединено потому что общий корень שלם"), testable
  with smokes.
- **Cons:** "dumb" relevance — co-occurrence ≠ semantic relatedness;
  needs careful capping/weighting to avoid a hairball.
- **Effort:** A2 ≈ 1–2 d (the index exists), A3/A4 ≈ 2–3 d, A5 ≈ 1 d.
- **Recommendation:** **do A2 + A5 next.** A2 turns the map from
  "notes under texts" into "a real knowledge web" using a signal we
  already compute; A5 makes it pedagogically useful at near-zero cost.

### Option B — Local semantic similarity (embeddings, no network)

Embed note bodies (and/or text rows) with a small in-browser model
(e.g. a quantized multilingual MiniLM via `transformers.js`/ONNX
Runtime Web, WASM/WebGPU) → connect notes whose cosine similarity
exceeds a threshold (`auto_semantic`).

- **Pros:** genuine semantic relatedness ("эти две заметки про одно
  и то же" even with no shared root); still **offline + private**
  after the model is cached.
- **Cons:** model download is 20–90 MB (one-time, SW-cacheable but
  heavy for mobile); WASM inference is slow on low-end Android for
  large note sets; Hebrew embedding quality varies by model;
  adds a real dependency + build surface.
- **Effort:** ≈ 5–8 d (model selection + caching + worker + threshold
  tuning + perf budget on real Android).
- **Recommendation:** strong v3.6+ candidate **if** A2/A3 prove
  insufficient. Gate behind an explicit "Включить умные связи
  (загрузит модель ~N МБ)" opt-in. Must run in a Worker; precompute
  embeddings on save, not on graph open.

### Option C — AI by prompt (LLM suggests links from local context)

On demand ("Предложить связи"), send a *bounded, user-approved*
context (note titles + short snippets, NOT full corpus) to an LLM and
get back suggested `(from, to, reason)` triples the user reviews and
accepts. The repo already integrates `@google/generative-ai` (Gemini)
for translation — same key/pathway could be reused.

- **Pros:** highest-quality, explainable suggestions ("связать, т.к.
  обе про биньян פיעל"); no model hosting; reuses existing Gemini
  integration; suggestions are *proposals* → respects read-only +
  user-in-control.
- **Cons:** **requires network + sends note content to a third
  party** → hard opt-in, explicit consent screen, `CONSENT_VERSION`
  bump, redaction rules, cost per call, latency, non-deterministic
  (bad for always-on/smoke-pinned behavior). Conflicts with
  "offline-first" as a default.
- **Effort:** ≈ 3–5 d (consent UI + prompt design + suggestion-review
  UI + caching + redaction + tests with a mocked client).
- **Recommendation:** ship as an **explicitly opt-in "AI assist"
  button**, never automatic, never on body text without a consent
  gate. Good as a *complement* to A2, not a replacement.

### Option D — AI by API / batch (server-side enrichment)

A backend job (or the existing research pipeline pattern) computes
embeddings/links server-side and returns an enriched graph.

- **Pros:** heavy compute off-device; consistent quality.
- **Cons:** **breaks local-first**; the app deliberately retired
  stateful server endpoints (410 Gone, OPFS migration); reintroducing
  a server data path is a major architectural reversal and a privacy
  regression. **Not recommended** unless the product strategy changes.

### Option E — Hybrid (recommended end-state)

Layered, each layer a toggleable `auto_*` edge kind with a distinct
style + legend entry + U7 chip:

1. **Always-on, free, offline (A1✅ + A2 + A3 + A5):** the deterministic
   backbone + morphology web + activity overlay. This alone is a
   genuinely "smart" map for a beginner with zero manual work.
2. **Opt-in, offline (B):** local embeddings for semantic edges, for
   power users who accept the model download.
3. **Opt-in, online (C):** Gemini "suggest links" button for a
   curated boost, suggestions reviewed before any `note_links` write.

---

## 4. Functional requirements (for whichever options are chosen)

- **FR-1 Visual distinction.** Each auto/AI edge kind has its own
  dash/colour + legend row + U7 filter chip; the user can always tell
  *why* two things are connected and turn a layer off.
- **FR-2 Explainability.** Hover/detail rail states the reason
  ("общий корень אהב", "обе заметки в тексте X", "семантическая
  близость 0.82", "предложено ИИ").
- **FR-3 Read-only.** Auto/semantic edges are *views*. AI/semantic
  *suggestions* surface in the note editor's link panel as
  "Предложенные связи" the user accepts → only then a `note_links`
  row is written (reuses the C1/C2 plumbing).
- **FR-4 Caps & weighting.** Per-node and per-edge-kind caps;
  down-weight ubiquitous roots (TF-IDF-style) so a common root
  doesn't connect everything.
- **FR-5 Opt-in & consent.** Any model download or network call is
  behind an explicit toggle with a size/privacy disclosure;
  `CONSENT_VERSION` bump for any content egress (Option C/D).
- **FR-6 Performance.** Auto-edge computation respects the existing
  200-node cap and chunked-tick budget; embeddings precomputed on
  note save in a Worker, never on graph open.
- **FR-7 Determinism for tests.** Always-on tiers (A) are
  smoke-pinned with fixed fixtures (the bundle-data smoke pattern);
  probabilistic tiers (B/C) are pinned via mocked providers.
- **FR-8 Discoverability of linking (the original complaint).**
  Browse-on-`[[` (done) + a "Предложенные связи" section in the note
  editor (from A2/B/C) so the user rarely has to *search* for what to
  link — the system proposes.

---

## 5. Recommended path (for owner approval)

1. **v3.5 (done):** prototype fixes — usable map with zero manual
   work. ✅
2. **v3.6 — Option A2 + A5 (offline, free):** wire the existing
   `crosstext` root index into the graph as `auto_shared_root`
   (capped/weighted) + an SRS/quiz activity overlay. Biggest
   intelligence gain per effort, no new deps, no privacy change.
   Add a "Предложенные связи" panel in the editor fed by A2 (closes
   the original "неудобно находить связи" complaint).
3. **v3.7 — Option C (opt-in online):** Gemini "Suggest links" button
   reusing the existing integration, behind a consent gate; reviewed
   suggestions only.
4. **v3.8+ — Option B (opt-in offline embeddings):** if semantic
   quality beyond morphology is still wanted, add local embeddings as
   a downloadable enrichment.
5. **Option D:** explicitly *not* pursued (breaks local-first).

**Decision needed from owner:** confirm the v3.6 scope (A2 + A5 +
editor suggestions panel) and whether Option C (online AI assist) is
acceptable for v3.7 given it requires opt-in content egress.

---

*Authored 2026-05-16 by Claude Opus 4.7 (1M context). Grounded in the
shipped codebase (crosstext rootIndex, morph-provider, OPFS local-first,
read-only graph invariant) and the user's real test bundle.*
