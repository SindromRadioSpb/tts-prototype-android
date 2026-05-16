# Smart-Map / Knowledge-Graph Market Research (v3.5)

> **Purpose.** Owner asked, before deciding the v3.6 smart-graph
> scope, for a market scan of educational (and adjacent) tools that
> use "smart maps" / knowledge graphs, to harvest best practices.
> Companion to `SMART_GRAPH_REQUIREMENTS_v3_5.md` — this document
> refines the recommendation in light of what the market and the
> learning-science literature actually show.
>
> **Method.** Web research 2026-05-16 across four segments: PKM/note
> tools (Obsidian, Logseq, Roam, RemNote), AI-augmented notes
> (Smart Connections, Mem, Reflect, Heptabase, Napkin), literature-
> mapping tools (Connected Papers, ResearchRabbit, Litmaps), and the
> concept-mapping pedagogy literature (Novak; meta-analyses;
> retrieval-based concept mapping). Sources listed at the end.

---

## 1. Landscape — one transferable idea per tool

| Tool | Category | What it does well | The idea we can use |
|---|---|---|---|
| **Obsidian** | PKM, local-first | Global graph + **backlinks pane with "unlinked mentions"** (auto-detects where a note's title appears elsewhere, one-click to link) | *Unlinked mentions* is the canonical "minimal manual work" pattern. Our Hebrew analogue = the **same root/lemma recurring across texts** (we already compute this in `crosstext` rootIndex). |
| **Obsidian Smart Connections** | AI plugin | **Local on-device embeddings**, cosine similarity, "related notes **while you write**", offline after indexing, no API key needed for core | Proof that semantic similarity can be **private + offline**; and that the right surface is *suggestions in the editor*, not a graph mutation. |
| **RemNote** | Edu PKM + SRS | Flashcards live **inside** the note graph (concept/descriptor), bidirectional links, FSRS + SM-2 | Tie the graph to **spaced repetition** — cards in context, not isolated. We already have the SRS layer; the graph should connect to it. |
| **Connected Papers** | Lit-mapping | **Single-seed** auto-build; clusters papers by **bibliographic coupling / co-citation** (connects items that *share references* even with no direct link); fastest onboarding | "Single-seed" = open graph **focused on one note** (we have C2). "Bibliographic coupling" ≈ **shared-root coupling** (Option A2). Easiest map wins — keep onboarding trivial. |
| **ResearchRabbit** | Lit-mapping | **Iterative chaining** without clutter; simple UI; expand-from-here | Progressive expansion beats dumping everything. "Show neighbours, let me expand" > full hairball. |
| **Litmaps** | Lit-mapping | Adjustable **node size / axes by metric** (connectivity, recency, momentum) | Our A5 "activity overlay" (size/colour by SRS strength, quiz accuracy) is a validated pattern. |
| **LingQ** | Language learning | Tracks **known vs. unknown words** across all imported reading; vocabulary grows implicitly from real texts | A learner-state overlay on the graph: known / learning / new — language-domain-native, and we have the data. |
| **Anki shared decks / LingQ** | Language learning | Huge shared content… but "**most shared decks are pretty bad**" | If we ever do shared/imported maps: **curation & quality gate matter** (this echoes our v3.3.5 ulpan item-bank soft gate). |
| **Mem / Reflect / Heptabase / Napkin** | AI notes | Auto-organise / auto-diagram; "balance between control and automation" | Automation users like is *assistive*, reviewable — not silent restructuring of their data. |

---

## 2. Best practices (distilled, with evidence)

1. **Local/contextual graph beats the global "hairball."** The global
   graph is widely judged a "pretty but not useful" feature; the
   *local* graph (around the current note) is what people actually use
   (a 10k-note user: global graph used ~0, local ~monthly). → Lean
   into focus/isolate/expand, not a giant all-at-once view. *We
   already have isolate-cluster + C2 `focusNode` + U7 filters — this
   validates doubling down on the focused experience and treating the
   full graph as secondary.*

2. **"Unlinked mentions" is the highest-leverage low-effort feature.**
   The single most-praised Obsidian discovery mechanism: surface
   *latent* connections the system can already infer and make linking
   one click. Our exact analogue exists and is **already computed**
   (cross-text shared root/lemma index in `crosstext.js`). Strongly
   reinforces **Option A2**.

3. **Suggest in the editor; never auto-mutate.** Smart Connections
   surfaces related notes *while you write*; AI-notes tools that users
   trust keep automation *assistive and reviewable*. Matches our hard
   invariant (graph read-only) + FR-3 (suggestions accepted in the
   editor → only then a `note_links` row).

4. **On-device, offline, private semantic similarity is proven
   viable.** Smart Connections runs local embeddings, no data egress,
   offline after index. De-risks our **Option B** and confirms the
   privacy posture is competitive, not a compromise.

5. **Single-seed + iterative expansion onboarding.** The most-adopted
   lit-mapping tool (Connected Papers) wins on "fastest, easiest,
   one seed." Don't make the newcomer configure anything; open
   focused, let them expand. *Our v3.5 fixes (auto-text backbone,
   browse-on-`[[`, render-don't-blank) already move this way.*

6. **Connect by shared structure, not just explicit links.**
   Bibliographic coupling / co-citation connect items that *share
   references* even without citing each other. The pedagogical and
   product win for us is the same: connect notes/texts that **share a
   root, binyan, or lemma** — Option A2 is the domain-correct version
   of the technique the whole lit-mapping category is built on.

7. **PEDAGOGY (the educational differentiator).** Concept-mapping is
   one of the best-evidenced learning techniques — a meta-analysis of
   55 studies found higher retention & transfer vs. reading/lectures.
   But the crucial nuance from a 2024 retrieval-practice study:
   **constructing/confirming the map is what produces the learning
   gain — passively viewing a pre-made map does not.** "Construction
   before consolidation": learners who *built* connections first
   out-performed on delayed tests, even when their maps were
   low-quality, and mapping specifically improved *inferential*
   (relational) understanding. **Implication: a fully auto-built map
   that the learner only looks at is pedagogically the *weak* design.
   The strong design = the system proposes, the learner confirms/edits
   (that act of confirmation is retrieval practice), and the map is
   tied to active recall (SRS/quiz).**

---

## 3. Anti-patterns to avoid (observed in the market)

- **The hairball.** Connecting everything to everything → unreadable.
  Mitigate with caps, rarity-weighting (down-weight ubiquitous
  roots), per-kind filters (we have U7), and local/expand views.
- **Passive eye-candy graph.** A graph you only admire adds little
  learning value (pedagogy §7) and little PKM value (best-practice
  §1). It must be *actionable* (jump to note, confirm a suggested
  link, drive review).
- **Silent auto-organisation of the user's data.** Tools that
  restructure without consent erode trust; keep automation assistive
  + reviewable + reversible.
- **Quantity over curation** (Anki/LingQ shared decks "mostly bad").
  Auto-suggested links must be *good*, not merely numerous.
- **Configuration-heavy onboarding.** The market winners are the ones
  a newcomer can use in one click.

---

## 4. How this changes the v3.6 recommendation

The market + pedagogy evidence **sharpens** (does not overturn) the
`SMART_GRAPH_REQUIREMENTS_v3_5.md` recommendation:

- **Confirmed: Option A2 (shared-root/lemma edges from the existing
  cross-text index) is the right next step.** It is the
  domain-correct form of *unlinked mentions* (Obsidian's most-loved
  feature) and *bibliographic coupling* (the entire lit-mapping
  category) — using a signal we already compute. Best ROI, offline,
  private, deterministic.

- **Confirmed: Option A5 (activity overlay) is a validated pattern**
  (Litmaps node-metric encoding + LingQ known-words). Adds
  pedagogical signal at near-zero cost.

- **NEW emphasis — make it a *learning* loop, not a viewer
  (differentiator):** because constructing/confirming connections is
  what drives retention, the v3.6 editor "Предложенные связи" panel
  should be framed as **"confirm what you know"**: the system
  proposes shared-root / similar-note links; the learner *accepts or
  rejects* each (one tap) — that confirmation **is** retrieval
  practice, and accepted links can feed the SRS/quiz layer. This is
  the thing none of the PKM tools do and that an *educational*
  product should: marry the smart graph to active recall (the
  RemNote insight + the retrieval-practice evidence).

- **Refined sequencing for v3.6:** A2 (shared-root edges, capped &
  rarity-weighted) → "Предложенные связи / Confirm what you know"
  accept-panel in the editor (the retrieval-practice surface) → A5
  learner-state overlay (known/learning/new + SRS strength). All
  offline, private, no new dependency, graph stays read-only.

- **Option B (local embeddings)** remains a strong v3.7+ enrichment —
  Smart Connections proves it can be private/offline — but pedagogy
  says semantic *suggestions for the learner to confirm* matter more
  than an auto-drawn semantic web.

- **Option C (online AI)** unchanged: opt-in, consent-gated, suggest-
  only; the market shows users accept AI when it's assistive and
  reviewable, which is exactly the FR-3 model.

---

## 5. One-line decision summary for the owner

> The market says: build the **shared-root "unlinked-mentions"
> suggester** (A2) and surface it as a **learner-confirmed** panel in
> the editor (retrieval practice — the educational edge), with a
> known/learning activity overlay (A5). Keep it offline, private,
> read-only-graph, one-click onboarding. Local embeddings (B) and
> opt-in AI (C) are later enrichments, not the next step.

---

## Sources

- [Backlinks — Obsidian Help](https://help.obsidian.md/plugins/backlinks)
- [Internal Links and Graph View — DeepWiki/obsidian-help](https://deepwiki.com/obsidianmd/obsidian-help/4.2-internal-links-and-graph-view)
- [Smart Connections — GitHub (brianpetro/obsidian-smart-connections)](https://github.com/brianpetro/obsidian-smart-connections)
- [Smart Connections — related notes while you write](https://smartconnections.app/smart-connections/)
- [Smart Connections — Connections view](https://smartconnections.app/smart-connections/list-feature/)
- [From knowledge-management to knowledge-creation with RemNote — Ness Labs](https://nesslabs.com/remnote-featured-tool)
- [Understanding Spaced Repetition — RemNote Help](https://help.remnote.com/en/articles/9337171-understanding-spaced-repetition)
- [Litmaps vs ResearchRabbit vs Connected Papers — The Effortless Academic](https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025/)
- [3 new tools for literature mapping — Aaron Tay (Medium)](https://aarontay.medium.com/3-new-tools-to-try-for-literature-mapping-connected-papers-inciteful-and-litmaps-a399f27622a)
- [ResearchRabbit 2025 revamp: iterative chaining without the clutter — Aaron Tay](https://aarontay.substack.com/p/researchrabbits-2025-revamp-iterative)
- [What's the point of the graph view? — Obsidian Forum](https://forum.obsidian.md/t/whats-the-point-of-the-graph-view-how-are-you-using-it/71316)
- [Visualizing Connections: Graph Views in Obsidian, Tana, Anytype — Medium](https://medium.com/@ann_p/visualizing-connections-graph-views-in-obsidian-tana-and-anytype-3c767e08fe66)
- [The Theory Underlying Concept Maps (Novak & Cañas) — IHMC](https://cmap.ihmc.us/docs/theory-of-concept-maps)
- [The Effectiveness of Concept Maps for Students' Learning and Retention (APSA preprint)](https://preprints.apsanet.org/engage/api-gateway/apsa/assets/orp/resource/item/5e2211b6afc3ff0019673552/original/the-effectiveness-of-concept-maps-for-students-learning-and-retention.pdf)
- [Retrieval-based concept mapping makes a difference — Frontiers in Education (2024)](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1287744/full)
- [Concept Map research — Harvard ABLConnect](https://ablconnect.harvard.edu/concept-map-research)
- [Language learning apps & vocabulary retention — Taalhammer](https://www.taalhammer.com/what-language-learning-app-should-i-use-for-serious-long-term-vocabulary-retention-taalhammer-vs-anki-and-5-more-apps/)
- [Best Anki decks for language learning — PolyglotClub](https://polyglotclub.com/wiki/Language/Multiple-languages/Culture/Helpful-Anki-Shared-Decks)

*Authored 2026-05-16 by Claude Opus 4.7 (1M context). Market + learning-science scan to inform the v3.6 smart-graph decision.*
