# Smart Learning Graph — Roadmap v3.6 (planning-only)

> **Status.** APPROVED WITH REFINEMENTS (owner, 2026-05-16) — see
> §11 "Approved decisions". Phases 0–1 in execution. Refinements:
> (a) **export** carries `confirmed` by default; `rejected` only
> under a *full learning-state* export profile; `pending`/`later`
> never exported. (b) **Phase 6** = candidate records only — **no UI
> for creating real SRS cards in v3.6** (hard, not "only if
> trivial"). (c) **Confirm panel** uses pedagogical wording
> («Подтвердите связи» / «Что ты уже узнаёшь?»; buttons «Я понимаю
> связь» / «Не связано» / «Позже»), never technical "Accept/Reject".
>
> Implementation-ready engineering plan, executed phase-by-phase.
> Companion to `SMART_GRAPH_REQUIREMENTS_v3_5.md` (options) and
> `SMART_GRAPH_MARKET_RESEARCH_v3_5.md` (best practices). Every claim
> below is grounded in a repo audit (file:line evidence in §2).
>
> **Grounding fixture (used everywhere):** the user's real bundle
> `.external/testbundle/` (gitignored) — **5 notes** (3 `word_study`
> with root/binyan/word in `body_json`, 2 `free`), **1** note_link,
> **4 texts** (only 3 have notes), **372 rows**. Already replayed by
> `scripts/notes-graph/bundle-data-smoke.js`.

---

## 1. Executive summary

The **Smart Learning Graph** is *not* an automatic graph the learner
passively views. It is an **auto-suggested, learner-confirmed**
connection system:

1. The app **discovers candidate connections from local data only**
   (shared root/lemma/binyan, source text, co-occurrence, SRS state).
2. The **Notes editor** shows a *"Подтвердите связи / Confirm what
   you know"* panel of the top candidates.
3. The learner **confirms / rejects / defers** each with one tap.
4. **Confirmation is retrieval practice** (learning-science finding,
   `SMART_GRAPH_MARKET_RESEARCH_v3_5.md §2.7`): constructing/confirming
   relations drives retention; passively viewing a pre-made map does
   not.
5. Confirmed candidates become **durable links**; confirmed/rejected/
   later decisions are **remembered** so the learner is never
   re-nagged.
6. The **read-only graph** visualises manual links, confirmed links,
   view-only auto edges, and a learning-state overlay — **local/
   focused first, never a global hairball**.

Why this is stronger than a fully automatic graph: a graph that
builds itself and is only looked at is the *pedagogically weak*
design; the confirmation tap is the learning event and the bridge to
SRS. This is the differentiator no PKM tool (Obsidian, Logseq,
RemNote) ships.

**Recommended v3.6 scope: A2 + Confirm Panel + A5** (validated by the
audit below — all prerequisites exist locally; no AI, no network, no
telemetry, no new consent, no graph-canvas authoring).

---

## 2. Current repo audit

Format: **Finding / Evidence / Impact / Recommendation / Files**.

### 2.1 Cross-text root/lemma index (A2 prerequisite)

- **Finding:** A cross-text morphology index exists but its
  `rootIndex` is **closure-private**, not exposed.
- **Evidence:** `public/js/crosstext.js:96` `_buildIndex()` builds
  `const rootIndex = new Map()` (line 155) `Map<rootKey, Set<formKey>>`;
  `window.CrossText` exposes only `findOccurrences, invalidate,
  getStats, _ensureIndex` (`crosstext.js:400-408`) — **`rootIndex`
  is NOT in the contract**.
- **Impact:** A2 **MUST NOT** depend on crosstext's private index
  (matches the pre-existing architectural decision in
  `SMART_GRAPH_REQUIREMENTS_v3_5.md §1.2`: graph & crosstext *share
  contracts, build separate indexes*).
- **Recommendation:** A2 builds its **own** note/text root index from
  `notes_v2.body_json` via the existing read-only `json_extract`
  projection already used by the graph (`_fetchRaw`, see 2.5), plus
  `window.MorphProvider.analyze()` for lemma. It MAY reuse
  `window.CrossText.findOccurrences(word)` for the *text↔text*
  shared-lemma signal (public contract), but MUST tolerate it being
  empty (offline / morph not ready).
- **Files:** `public/js/crosstext.js` (read-only reuse via public
  API), new `public/js/notes-graph-suggest.js` (A2 generator).

### 2.2 Hebrew morphology provider (A2 lemma/binyan)

- **Finding:** A local, offline morphology chain exists.
- **Evidence:** `public/js/morph-provider.js:21-22`
  `window.MorphProvider.ensureReady()` / `.analyze(word) →
  Promise<Analysis[]>`; Analysis carries `{ r, l, b, p, ... }`
  (root/lemma/binyan/part) — Tier 1 hspell, Tier 2 seed dict
  (`morph-provider.js:158,185-200`). Fully local.
- **Impact:** shared-root/lemma/binyan candidates are computable
  **offline, deterministically**, from data the app already has.
- **Recommendation:** A2 uses `MorphProvider.analyze` only as an
  enrichment for free-text notes; `word_study` notes already carry
  `root/binyan/word` in `body_json` (see 2.4) so the **primary**
  signal needs no morphology call at all.
- **Files:** `public/js/morph-provider.js` (read-only reuse).

### 2.3 notes_v2 schema & source-text linkage

- **Finding:** `notes_v2.text_id` exists; `body_json` holds
  structured `word_study` metadata.
- **Evidence:** `public/db/migrations.js:475-510` — `notes_v2(id,
  target_kind, target_id, text_id, note_type, title, body_json,
  srs_card_id, created_at, updated_at)`, `body_json` JSON-validated,
  FK `text_id → texts(id)`. Bundle sample: `body_json =
  {"kind":"word_study","word":"לגור","root":"לבש","binyan":"paal"}`.
- **Impact:** the `auto_text` backbone (already shipped, v3.5) and
  A2 root extraction are both grounded in real columns.
- **Recommendation:** no schema change to `notes_v2`.
- **Files:** `public/db/migrations.js`.

### 2.4 note_links — durable link mechanism (no lifecycle state)

- **Finding:** `note_links` is the durable manual-link table and has
  **no state/origin column**; PK blocks per-pair lifecycle.
- **Evidence:** `public/db/migrations.js:533-543` —
  `note_links(from_note_id, to_kind, to_id, link_alias, created_at)`,
  `PRIMARY KEY (from_note_id, to_kind, to_id)`, `CHECK to_kind IN
  (...)`. `local-db.js:962 addNoteLink` is `INSERT OR IGNORE`
  (idempotent); `943 setNoteLinks`, `982 listOutgoingLinks`,
  `992 listBacklinks`.
- **Impact:** suggestion lifecycle (pending/confirmed/rejected/later)
  **MUST NOT** be crammed into `note_links` — it would pollute
  backlinks and the graph's `explicit_link` semantics, and the PK
  cannot distinguish a rejected pair from an absent one.
- **Recommendation:** add a **separate** `note_link_suggestions`
  table (§5). On *confirm*, additionally write the durable
  `note_links` row via the existing idempotent `addNoteLink`
  (reuses the shipped C1 save path).
- **Files:** `public/db/migrations.js` (append one migration),
  `public/db/local-db.js` (new suggestion CRUD).

### 2.5 Graph: read-only guard, edge kinds, caps, filters, legend

- **Finding:** the graph is strictly read-only, already has an
  extensible edge-kind + filter + legend system and a degree cap.
- **Evidence:** `public/js/notes-graph.js:41` `_READONLY_RE` /
  `_FORBIDDEN_RE` SQL guard; `:27 MAX_NODES = 200` top-N-by-degree;
  `:28 NODE_KINDS` (6); `:34 EDGE_KINDS = [explicit_link,
  target_anchor, derived_morph, auto_text]`; `:353 FILTER_SS_KEY
  "graphFilters_v1"`, `:416 loadFilters`; per-kind chips
  `[data-graph-filter-chip]` (`:670,:836`); legend
  `graph.legend.edges.*` (`:1158`); sparse banner
  `[data-graph-sparse-banner]` (`:740`); C2 `focusNode` + isolate;
  `EDGE_STYLE` map in `public/js/notes-graph-render.js:35-40`.
- **Impact:** A2 view-only edges + a `suggested` edge kind + an A5
  overlay can be added **by extending existing arrays/maps**, not
  re-architecting. The read-only guard structurally prevents canvas
  authoring.
- **Recommendation:** extend `EDGE_KINDS`, `EDGE_STYLE`, the legend
  i18n subtree, and the U7 chip set. **Do not** touch `_q`/the
  read-only guard.
- **Files:** `public/js/notes-graph.js`,
  `public/js/notes-graph-render.js`,
  `public/i18n/locales/{ru,en,he}.js`.

### 2.6 Notes editor — Links panel mount point

- **Finding:** a saved-note-only Links panel exists; it is the
  natural, already-gated mount for the Confirm panel.
- **Evidence:** `public/index.html:10587 #v3NotesLinksPanel`
  (`display:none` until a `noteId` exists) → `#v3NotesLinksToggleBtn`,
  `#v3NotesLinksBadge`, `#v3NotesOpenGraphBtn` (C2),
  `#v3NotesLinksBody` (`#v3NotesLinksOutgoingList`, add-row).
  `window.NotesLinkAutocomplete = {attach, reset, collect, _state}`
  (`notes-link-autocomplete.js:357`); save-hook materialises `[[`
  tokens via `addNoteLink`.
- **Impact:** the Confirm panel is a **new section inside
  `#v3NotesLinksPanel`** — inherits the saved-only gating for free,
  reuses the C1 accept→`addNoteLink` plumbing.
- **Recommendation:** add `#v3NotesSuggestPanel` as a sibling block
  in `#v3NotesLinksPanel`; reuse `v3NotesLinksRefresh` lifecycle.
- **Files:** `public/index.html`, new
  `public/js/notes-link-suggest-ui.js`.

### 2.7 SRS / quiz data (A5 overlay + future SRS feed)

- **Finding:** SRS state + attempts exist; only one activity
  aggregate is exposed.
- **Evidence:** `migrations.js:249 srs_cards(... state, due_date,
  source_note_id, source_sentence_id, entity_type, entity_id ...)`,
  `:304 srs_attempts(card_id, is_correct, attempt_type, created_at)`,
  `:193 srs_review_events`; `local-db.js:1517 getStrugglingTexts(...)`
  is the **only** struggling/activity aggregate.
- **Impact:** A5 needs a **new read-only aggregate** (e.g.
  per-note/per-root learning state from `srs_cards.state` +
  `srs_attempts`). No schema change; additive query only.
- **Recommendation:** add a read-only `getLearningStateOverlay()`
  to `local-db.js`; A5 consumes it as a node attribute, not an edge.
  SRS *generation from confirmed links* is **OUT OF SCOPE for v3.6**
  (Phase 6 is "produce candidates", not change the SRS engine).
- **Files:** `public/db/local-db.js`, `public/js/notes-graph.js`.

### 2.8 Privacy / consent / telemetry

- **Finding:** consent + telemetry surfaces are well-isolated and
  smoke-pinned; nothing in v3.6 needs to touch them.
- **Evidence:** `research.js:50 CONSENT_VERSION = '1.0'`; `events`
  table (`migrations.js:323`) is the telemetry surface;
  `scripts/notes-graph/privacy-smoke.js` asserts `events` delta == 0
  and an allow-list of graph network requests; graph `_q` read-only.
- **Impact:** v3.6 (offline, local, deterministic) requires **no
  consent bump, no telemetry, no network**.
- **Recommendation:** privacy-smoke MUST be extended to also assert
  the suggestion/confirm flow emits **zero `events` rows** and makes
  **zero network calls**.
- **Files:** `scripts/notes-graph/privacy-smoke.js` (extend).

### 2.9 Smoke + visual-regression conventions

- **Finding:** consistent harness + naming; the user bundle is
  already a fixture; visuals are all-or-nothing baseline-mode.
- **Evidence:** `scripts/notes-graph/*-smoke.js` (build-data,
  bundle-data, graph-tier2, graph-ux, interaction, lazyload,
  mobile-fallback, perf, privacy, render-a11y) + `visual-regression.js`;
  `scripts/notes-ui/*-smoke.js` (autosave-entry, graph-loop,
  link-autocomplete, mobile-notes, onboarding-empty, type-switch);
  `__fixtures__/lazyload-baseline.json`; `bundle-data-smoke.js`
  encodes the 5/1/4 bundle; `Smoke-check/graph-view/baseline/01..10*.png`
  + `index.json`, verify ≤1%, regenerate all-or-nothing; chained by
  `scripts/research/all-smoke.js`; `package.json` `smoke:graph:*` /
  `smoke:notes:*` / `smoke:research:fast`.
- **Impact:** new smokes MUST follow `scripts/<area>/<kebab>-smoke.js`
  and wire into `all-smoke.js` + `package.json`.
- **Recommendation:** new test names (see §8) align to this pattern;
  baselines regenerated **only** if graph DOM intentionally changes
  (Phase 5/7), then verified.
- **Files:** `scripts/notes-graph/`, `scripts/notes-ui/`,
  `scripts/research/all-smoke.js`, `package.json`.

### 2.10 Migration application model

- **Finding:** migrations are an append-only ordered array tracked by
  `schema_migrations`; idempotent `CREATE ... IF NOT EXISTS`.
- **Evidence:** `migrations.js:2-5` "Каждый элемент = одна
  транзакция. Порядок критичен. schema_migrations tracker";
  `MIGRATIONS = [ ... ]`; `local-db.js` tracks applied versions
  (`schema_migrations`, ref `local-db.js:2807`).
- **Impact:** a new table is added safely by **appending one new
  string** to `MIGRATIONS` — backward compatible, forward-only.
- **Recommendation:** Phase 4 appends exactly one migration; never
  edits an existing element.
- **Files:** `public/db/migrations.js`.

### 2.11 Gaps & unknowns (to resolve in Phase 0)

- `MorphProvider.analyze` coverage on the real bundle's free-text
  notes is unmeasured → Phase 0 measures it; A2 MUST degrade
  gracefully when morphology returns nothing (the `word_study`
  body_json signal carries v3.6 alone).
- Export/import: `local-db.js:2079 export_schema_version: 1` bundles
  notes/versions/links/roots. Whether to export suggestion decisions
  is a **decision item** (§5, §11).
- No existing "learning state per note/root" query — A5 needs a new
  additive read-only aggregate (2.7).
- Bundle has only 1 link and sparse morphology overlap (roots: לבש,
  אהב×2, paal×3) — A2 ranking/caps MUST be validated on *this*
  small, realistic shape, not only synthetic large fixtures.

### 2.11.a Phase 0 RESOLVED (2026-05-16)

- **Morph-coverage baseline (measured & frozen):** the bundle needs
  **0 `MorphProvider.analyze` calls** for A2. `notes-graph _fetchRaw`
  projects only `json_extract(body_json,'$.root|$.binyan|$.word')`
  (privacy); free notes (N4, N5) → all `NULL`, contributing **zero**
  root/lemma/binyan signal in v3.6. The `word_study` notes
  (N1/N2/N3) already carry root/binyan/word. **Conclusion:**
  `MorphProvider` is NOT a Phase 1 dependency; it is an OPTIONAL
  later enrichment for free-text bodies. A2 MUST degrade to "fewer
  candidates", never error, when morphology is absent.
- **Frozen contract:** the deterministic note→note candidate set for
  the real bundle is locked in
  `scripts/notes-graph/__fixtures__/suggest-bundle-fixture.json`
  (14 expected candidates across N1–N4; **N5 isolated → 0**; **0
  `shared_lemma`** — all `j_word` distinct, guarding false lemma
  matches; `note→text` link correctly does **not** suppress the
  `N4↔N1/N3` `same_text` candidates — the exact bug class that
  originally broke the graph). Independently re-derived & pinned by
  `scripts/notes-graph/suggest-fixture-smoke.js` (6/6, pure Node).
  Phase 1's generator MUST reproduce this set on this bundle.

---

## 3. Unified product concept

### 3.1 Definition

> **Smart Learning Graph** = a local, deterministic candidate-
> connection engine + a learner-confirmation surface in the Notes
> editor + a read-only, focus-first graph that layers manual,
> confirmed, suggested and learning-state information — designed so
> the *confirmation act is the learning event*.

### 3.2 Core loop

`create/read → suggest → confirm → remember → visualize → review`

1. **create/read** — learner writes a note / reads a text (existing).
2. **suggest** — on note open/save, A2 computes top-K candidates
   (shared root/lemma/binyan/source-text) for that note, ranked,
   rarity-weighted, capped.
3. **confirm** — `#v3NotesSuggestPanel` shows them: «Я понимаю
   связь» / «Не связано» / «Позже».
4. **remember** — decision persisted in `note_link_suggestions`;
   *confirm* also writes durable `note_links`; *reject*/*later*
   suppress re-prompting.
5. **visualize** — graph shows manual + confirmed (`explicit_link`),
   view-only `auto_*`, a distinct `suggested` layer, and an A5
   learning-state node overlay; filter chips per layer; focus/local
   first.
6. **review** — confirmed connections become **SRS/quiz candidates**
   (Phase 6 produces candidate records only; engine integration is a
   later, separately-gated step).

### 3.3 UX surfaces

- **Confirm panel** (editor, in `#v3NotesLinksPanel`): top-K cards,
  each = target label + **explanation chip** ("общий корень למד" /
  "тот же текст" / "биньян פיעל") + 3 actions. Keyboard + ARIA;
  aria-live count. Empty/збалансированный state when no candidates.
- **Suggested-connections** read-out: same data also visible as a
  `suggested` edge layer on the graph (view-only) with its own legend
  row + U7 chip; clicking a suggested edge opens the source note's
  Confirm panel (the only place authoring happens).
- **Graph overlays:** node ring/colour for known/learning/new/weak/
  stale (A5); explainability in the existing detail rail.
- **Mobile:** Confirm panel reflows to a single-column stack at
  ≤640 px (reuse the v3.4 C6 responsive pattern); graph keeps the
  isolated-cluster fallback; suggestion compute is debounced + capped
  so mid-range Android stays responsive.

---

## 4. Architecture proposal

### 4.1 Modules

| Module | New/Modify | Responsibility |
|---|---|---|
| `public/js/notes-graph-suggest.js` | **NEW** | A2 candidate generator + scoring/ranking (pure, read-only, deterministic). Exposes `window.NotesGraphSuggest.candidatesForNote(noteId, opts) → [{to_kind,to_id,reason_code,score,evidence}]`. |
| `public/js/notes-link-suggest-ui.js` | **NEW** | Confirm panel rendering + accept/reject/later wiring; mounts in `#v3NotesLinksPanel`. |
| `public/db/local-db.js` | MODIFY | `note_link_suggestions` CRUD; `getLearningStateOverlay()` (A5). |
| `public/db/migrations.js` | MODIFY | append one migration: `note_link_suggestions` table. |
| `public/js/notes-graph.js` | MODIFY | add `suggested` + `auto_shared_root`/`auto_shared_lemma` edge kinds; consume suggestions + A5 overlay; legend/chips. |
| `public/js/notes-graph-render.js` | MODIFY | `EDGE_STYLE` entries; node overlay attribute. |
| `public/index.html` | MODIFY | `#v3NotesSuggestPanel` block; load `notes-graph-suggest.js` + `notes-link-suggest-ui.js`. |
| `public/i18n/locales/{ru,en,he}.js` | MODIFY | suggest/confirm + legend strings. |

### 4.2 Data-model options (recommendation in §5)

- **(R) Separate `note_link_suggestions` table + reuse `note_links`
  on confirm** — RECOMMENDED. Clean separation; `note_links` stays
  the single durable link truth; lifecycle lives where it belongs.
- (Alt-1) Add `origin`/`state` columns to `note_links` — REJECTED:
  PK can't represent a rejected pair; pollutes backlinks/`explicit_link`.
- (Alt-2) Both (suggestions table + `note_links.origin` column) —
  MAY be revisited if the graph must visually distinguish
  "manually typed" vs "confirmed-from-suggestion"; deferred (the
  suggestion table already records provenance).

### 4.3 Edge-kind lifecycle

| Kind | Source | Durable? | On graph | Authoring |
|---|---|---|---|---|
| `explicit_link` | `note_links` (manual `[[` **or** confirmed suggestion) | yes | solid | editor only |
| `auto_text` (shipped) | `notes_v2.text_id` | no (synthesized) | long-dash | n/a (view) |
| `auto_shared_root` / `auto_shared_lemma` (A2) | computed | no (synthesized) | dotted variants | n/a (view) |
| `suggested` | `note_link_suggestions` state=pending | no | distinct dashed + dimmed | confirm in editor |
| (overlay) learning state (A5) | `srs_*` aggregate | n/a | node ring/colour | n/a (view) |

`rejected`/`later` suggestions render **nothing** on the graph
(suppressed) but persist so they don't recur.

### 4.4 Scoring & density control (deterministic)

- `score = base(reason) × rarity_weight(token) × recency_factor`
  where `rarity_weight = 1 / (1 + log(1 + corpusFreq(token)))` so a
  ubiquitous root (e.g. היה) is heavily down-weighted.
- Caps: **≤ N edges per root/lemma token** (default N=8), **≤ K
  suggestions per note** in the panel (default K=7), global graph
  still bounded by existing `MAX_NODES=200` top-N-by-degree.
- Deterministic tiebreak: `score desc, to_kind asc, to_id asc` (same
  pattern as the existing top-N cap in `notes-graph.js`).
- Same input → identical output (no RNG, no time-of-day) → smoke-able.

### 4.5 Explainability model

Each candidate carries `reason_code ∈ {shared_root, shared_lemma,
shared_binyan, same_text, cooccur}` + `evidence` (the shared token /
text id). UI maps `reason_code` → i18n template + the literal token
(e.g. `graph.suggest.reason.sharedRoot` → "общий корень {root}").

---

## 5. Data-model recommendation

**Append one migration** to `public/db/migrations.js` (forward-only,
idempotent, backward compatible — §2.10):

```sql
CREATE TABLE IF NOT EXISTS note_link_suggestions (
  from_note_id  TEXT NOT NULL,
  to_kind       TEXT NOT NULL CHECK (to_kind IN
                  ('note','word','root','binyan','text','sentence')),
  to_id         TEXT NOT NULL,
  reason_code   TEXT NOT NULL CHECK (reason_code IN
                  ('shared_root','shared_lemma','shared_binyan',
                   'same_text','cooccur')),
  evidence      TEXT,                       -- the shared token / id
  score         REAL NOT NULL DEFAULT 0,
  state         TEXT NOT NULL DEFAULT 'pending' CHECK (state IN
                  ('pending','confirmed','rejected','later')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at    TEXT,
  PRIMARY KEY (from_note_id, to_kind, to_id, reason_code),
  FOREIGN KEY (from_note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_nls_from   ON note_link_suggestions(from_note_id);
CREATE INDEX IF NOT EXISTS ix_nls_state  ON note_link_suggestions(state);
```

- **PK includes `reason_code`** so the same pair can be suggested for
  different reasons and decided independently.
- **On confirm:** set `state='confirmed', decided_at=now` **and**
  `addNoteLink(from_note_id,{to_kind,to_id,link_alias})` (existing
  idempotent path → durable `note_links`).
- **On reject/later:** set `state` accordingly; the generator
  **MUST** exclude `rejected` forever and `later` until a cooldown
  (e.g. not before next session / N days) so the learner is not
  re-nagged.
- **Backward compatibility:** additive table; old data untouched;
  `note_links` semantics unchanged.
- **Export/import (APPROVED with refinement, owner 2026-05-16):**
  `local-db.js:2079 export_schema_version: 1` currently bundles
  notes/versions/links/roots. Approved rules:
  - `confirmed` → **exported by default** (additive optional array;
    importer tolerant of absence).
  - `rejected` → exported **only** under a *full learning-state*
    export profile (a rejection is learning-context-bound; it MUST
    NOT silently suppress a link that could be useful in a different
    bundle).
  - `pending` → **never exported** (regenerable from local data).
  - `later` → **never exported** (cooldown is session/context local).
  - **No `export_schema_version` bump** (additive only).

---

## 6. Implementation roadmap (phase-by-phase)

> Each phase ships independently behind the per-commit green
> discipline (smoke + push). Phases 0–1 are the next executable unit.

### Phase 0 — Repo audit lock + fixture & coverage baseline

- **Problem closed:** unknowns in §2.11 (morphology coverage,
  ranking behaviour on the *real* sparse bundle) could make A2
  produce noise or nothing.
- **Builds on:** `scripts/notes-graph/bundle-data-smoke.js`,
  `MorphProvider`, `crosstext`.
- **Steps:** (a) measure `MorphProvider.analyze` hit-rate on the
  bundle's free-text notes; (b) enumerate the latent A2 candidates
  the bundle *should* produce (root לבש, root אהב×2, binyan paal×3,
  same-text groupings) and freeze them as the expected fixture; (c)
  confirm `CrossText.findOccurrences` behaviour offline.
- **UX:** none.
- **Privacy:** none (read-only inspection).
- **Perf:** none.
- **Tests:** new `scripts/notes-graph/suggest-fixture-smoke.js`
  (asserts the bundle's expected candidate set is well-defined &
  stable; no generator yet — pins the *contract*).
- **DoD:** documented coverage numbers appended to this file's §2.11;
  fixture committed under `scripts/notes-graph/__fixtures__/`.
- **Commit:** `test(graph): lock v3.6 suggestion fixture + morph coverage baseline`

### Phase 1 — A2 candidate generator (pure, offline, deterministic)

- **Problem closed:** "невозможно найти органично, с чем связать" —
  the system now *finds* candidates from local data.
- **Builds on:** `notes-graph.js _fetchRaw`/`_q` read-only pattern
  (2.5), `MorphProvider.analyze` (2.2), `body_json` json_extract
  (2.3).
- **Steps:** new `public/js/notes-graph-suggest.js` exposing
  `window.NotesGraphSuggest.candidatesForNote(noteId,{cap,k})` —
  read-only SELECTs only, builds its own root/lemma/binyan/text
  index, applies §4.4 scoring/caps/rarity, returns deterministic
  ranked `[{to_kind,to_id,reason_code,evidence,score}]`. No DOM, no
  writes, no network.
- **UX:** none yet (headless module).
- **Privacy:** read-only local; **MUST** route all SQL through the
  graph's `_q`-style guard (or reuse it) — no writes, no telemetry.
- **Perf:** index built once per open, chunkable; MUST respect caps;
  MUST NOT run on graph open (only on note open/save, debounced).
- **Tests:** `scripts/notes-graph/suggest-generator-smoke.js` (unit-
  style via page eval: determinism — same input twice → identical;
  rarity down-weighting; caps; **bundle case** → expected set from
  Phase 0).
- **DoD:** generator green on the real bundle; deterministic;
  read-only proven.
- **Commit:** `feat(graph): A2 offline shared-root/lemma suggestion generator`

### Phase 2 — Scoring/ranking hardening + cooldown contract

- **Problem closed:** hairball / annoyance risk; "later" recurrence.
- **Builds on:** Phase 1 module.
- **Steps:** finalize rarity weighting, per-token & per-note caps,
  deterministic tiebreak; define the `rejected`=never /
  `later`=cooldown exclusion contract (pure function over a supplied
  decision set — DB wired in Phase 4).
- **UX:** none.
- **Privacy/Perf:** unchanged; add a perf assertion (≤ budget ms for
  the bundle + a synthetic 200-note fixture).
- **Tests:** extend `suggest-generator-smoke.js` (cap respected,
  ubiquitous-root suppressed, rejected excluded, later-cooldown
  honoured) + a perf case in the existing `perf-smoke.js` style.
- **DoD:** no configuration produces > caps; suppression verified.
- **Commit:** `feat(graph): A2 ranking, rarity weighting + suppression contract`

### Phase 3 — "Confirm what you know" panel (editor UI)

- **Problem closed:** passive graph → active, learner-confirmed
  (the pedagogical core).
- **Builds on:** `#v3NotesLinksPanel` (2.6), C1 autocomplete/save
  plumbing, C2 patterns.
- **Steps:** new `public/js/notes-link-suggest-ui.js`; add
  `#v3NotesSuggestPanel` inside `#v3NotesLinksPanel` in
  `public/index.html`; render top-K cards (label + explanation chip
  + 3 buttons). **Pedagogical wording (APPROVED, MUST):** panel
  heading «Подтвердите связи» (or «Что ты уже узнаёшь?»); buttons
  «Я понимаю связь» / «Не связано» / «Позже» — NEVER technical
  "Suggested links / Accept / Reject / Later". i18n ru/en/he with
  the same learner-facing framing. keyboard/ARIA/aria-live.
  **Decisions in-memory only this phase** (durability = Phase 4) so
  UI is testable in isolation.
- **UX:** the new panel; saved-note-gated (inherits panel gating);
  ≤640 px single-column reflow (reuse C6 CSS pattern).
- **Privacy:** no network, no telemetry, no `events` writes.
- **Perf:** render top-K only; suggestion call debounced off note
  open/save, never graph open.
- **Tests:** `scripts/notes-ui/suggest-panel-smoke.js` (panel
  appears for a saved note with candidates; 3 actions update UI;
  ARIA; mobile reflow; no pageerror) + extend
  `scripts/notes-ui/mobile-notes-smoke.js` for the 414 px case.
- **DoD:** panel works on the bundle note set; no graph-canvas
  authoring; no telemetry.
- **Commit:** `feat(notes): C-confirm panel — learner-confirmed connection suggestions`

### Phase 4 — Durable accept/reject/later state

- **Problem closed:** decisions must persist; confirm → durable link;
  no re-nagging.
- **Builds on:** §5 schema, `local-db.js addNoteLink`, migration
  model (2.10).
- **Steps:** append `note_link_suggestions` migration; add
  `local-db.js` CRUD (`upsertSuggestion`, `setSuggestionState`,
  `listSuggestions(noteId)`); wire Phase 3 panel actions →
  persistence; **confirm also calls existing `addNoteLink`**
  (durable `note_links`); generator (Phase 2 contract) now reads the
  decision set to suppress.
- **UX:** decisions survive reopen; confirmed appears in the
  existing outgoing-links list + backlinks.
- **Privacy:** local DB only; **no** `events`/telemetry; **no**
  consent change (audit 2.8 confirms no data egress).
- **Perf:** indexed table; negligible.
- **Tests:** `scripts/notes-graph/suggest-persist-smoke.js`
  (confirm→`note_links` row + state=confirmed; reject→excluded
  forever; later→cooldown; reopen survives; migration idempotent)
  + extend `privacy-smoke.js` (zero `events`, zero network across
  the full confirm flow).
- **DoD:** bundle: confirming the root-אהב suggestion creates a real
  link, visible as `explicit_link`; rejecting suppresses
  permanently; privacy-smoke extended & green.
- **Commit:** `feat(db): note_link_suggestions table + durable confirm/reject/later`

### Phase 5 — Graph layer integration + filters + explainability

- **Problem closed:** the graph must distinguish manual / confirmed /
  suggested / auto and stay focus-first, not a hairball.
- **Builds on:** `EDGE_KINDS`/`EDGE_STYLE`/legend/U7 chips (2.5),
  C2 `focusNode`.
- **Steps:** add `suggested`, `auto_shared_root`,
  `auto_shared_lemma` edge kinds + `EDGE_STYLE` + legend i18n + U7
  chips; `suggested` edges view-only & dimmed; clicking a
  `suggested` edge opens that note's Confirm panel (authoring stays
  in editor); detail-rail explainability strings; suggested layer
  default-on but capped & chip-toggleable.
- **UX:** new layers + legend rows + chips; focus/local emphasized.
- **Privacy:** unchanged (render only).
- **Perf:** respect `MAX_NODES`; suggested edges included in the cap;
  no hairball (per-token cap from Phase 2).
- **Tests:** `scripts/notes-graph/suggest-graph-smoke.js` (layers
  present + distinct + chip-filterable; suggested-edge click → editor
  panel; read-only invariant: no `note_links` write from canvas) +
  **regenerate visual baselines** (intentional DOM change) and
  re-verify 31/31; update `bundle-data-smoke.js` expectations if the
  bundle's rendered layer set changes.
- **DoD:** four edge classes visually distinct & filterable on the
  bundle; canvas still read-only; visuals re-baselined & verify-green.
- **Commit:** `feat(graph): suggested + shared-root/lemma layers, filters, explainability`

### Phase 6 — SRS/quiz **candidate** integration (records only)

- **Problem closed:** confirmation becomes retrieval practice — a
  confirmed link can seed a review item ("Why are למדתי & תלמיד
  linked? → root למד").
- **Builds on:** confirmed `note_link_suggestions`, `srs_*` schema
  (2.7). **Scope-bounded (APPROVED, hardened 2026-05-16):** Phase 6
  **produces candidate objects ONLY**. It MUST NOT modify the SRS
  scheduling engine AND MUST NOT add any UI for creating real SRS
  cards in v3.6. Real card creation is OUT OF SCOPE for v3.6
  (deferred to a later, separately-gated release).
- **Steps:** read-only generator of quiz/SRS *candidate* objects
  from confirmed links (in-memory list only). **No "сделать
  карточкой" UI, no write into `srs_*`.**
- **UX:** none in v3.6 (candidate objects are produced for a future
  release; not surfaced as card-creation actions).
- **Privacy/Perf:** local only; negligible.
- **Tests:** `scripts/notes-ui/suggest-srs-candidate-smoke.js`
  (confirmed link → well-formed candidate object; no SRS engine
  mutation; no telemetry).
- **DoD:** candidate objects correct on the bundle; SRS engine
  untouched.
- **Commit:** `feat(notes): SRS/quiz candidate records from confirmed connections`

### Phase 7 — A5 learning-state overlay

- **Problem closed:** the graph should show what's known/weak, not
  just structure.
- **Builds on:** new read-only `getLearningStateOverlay()` (2.7),
  graph node attributes.
- **Steps:** additive `local-db.js` aggregate (srs_cards.state +
  srs_attempts → per-note/per-root state ∈ known/learning/new/weak/
  stale); graph applies it as a **node ring/colour overlay**
  (non-destructive), chip-toggleable, legend row, detail-rail text.
- **UX:** overlay + legend + chip.
- **Privacy:** local read-only.
- **Perf:** one aggregate query per open; cached.
- **Tests:** `scripts/notes-graph/activity-overlay-smoke.js` +
  visual re-baseline (intentional) & re-verify.
- **DoD:** overlay correct on a seeded SRS fixture; no edge created;
  visuals re-baselined.
- **Commit:** `feat(graph): A5 learning-state node overlay`

### Phase 8 — Mobile / performance / privacy hardening

- **Problem closed:** mid-range Android usability + invariant
  enforcement.
- **Builds on:** all prior; v3.4 C6 responsive pattern;
  `mobile-fallback-smoke.js`.
- **Steps:** debounce + cap suggestion compute; ensure no work on
  graph open; Confirm panel 414 px pass; chunk the A2 index build;
  privacy-smoke hardened to cover suggest+confirm+overlay (zero
  `events`, zero network, read-only canvas).
- **Tests:** extend `mobile-notes-smoke.js`,
  `mobile-fallback-smoke.js`, `privacy-smoke.js`, `perf-smoke.js`.
- **DoD:** budgets met on the 200-note synthetic + the real bundle;
  privacy invariants smoke-pinned.
- **Commit:** `perf(graph): v3.6 mobile + privacy hardening for suggestions`

### Phase 9 — Docs, full smoke, baselines, pilot gate

- **Steps:** update CHANGELOG `[Unreleased]`→`[3.6.0]`; update
  `PILOT_READINESS_GATE`-style gate doc with v3.6 DoD; wire all new
  suites into `scripts/research/all-smoke.js` + `package.json`;
  regenerate & verify visual baselines; final `smoke:research:fast`
  green; version bump.
- **DoD:** gate checklist all-green; release tag **only on explicit
  owner instruction** (per established v3.3.5/v3.4 soft-gate pattern).
- **Commit:** `chore(release): v3.6 Smart Learning Graph` (+ tag on instruction)

---

## 7. (per-phase fields are inlined in §6)

Every Phase in §6 states: problem closed · builds-on · steps · UX ·
privacy · perf · tests · DoD · commit message — as required.

---

## 8. Testing plan

New suites (named per the audited convention §2.9 —
`scripts/<area>/<kebab>-smoke.js`):

- `scripts/notes-graph/suggest-fixture-smoke.js` (Phase 0)
- `scripts/notes-graph/suggest-generator-smoke.js` (Phase 1–2)
- `scripts/notes-ui/suggest-panel-smoke.js` (Phase 3)
- `scripts/notes-graph/suggest-persist-smoke.js` (Phase 4)
- `scripts/notes-graph/suggest-graph-smoke.js` (Phase 5)
- `scripts/notes-ui/suggest-srs-candidate-smoke.js` (Phase 6)
- `scripts/notes-graph/activity-overlay-smoke.js` (Phase 7)

Extend existing: `bundle-data-smoke.js` (real 5/1/4 bundle —
candidate + layer expectations), `privacy-smoke.js` (zero `events`,
zero network across suggest/confirm/overlay), `mobile-notes-smoke.js`
& `mobile-fallback-smoke.js` (414 px), `perf-smoke.js` (suggestion
budget), `visual-regression.js` (re-baseline on Phase 5/7 only),
chain all into `scripts/research/all-smoke.js` + `package.json`
`smoke:graph:*` / `smoke:notes:*`.

**No-regression assertions (every relevant smoke MUST keep):**
graph canvas read-only (no `note_links` write from canvas), zero
`events` rows, zero network in graph/suggest/autocomplete modules,
offline behaviour intact, `MAX_NODES`/per-token caps hold (no
hairball), no automatic durable mutation without a confirm action.

---

## 9. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hairball from shared-root edges | High if unweighted | rarity weight + per-token cap (≤8) + per-note K (≤7) + existing `MAX_NODES=200` + chip toggle; smoke-pinned |
| Bad/false-positive suggestions | Med | confirm-before-durable (nothing auto-written); reason shown; reject = permanent suppress |
| Overwhelming the learner | Med | top-K only; `later` cooldown; panel collapsed by default within the already-gated Links panel |
| Hebrew morphology coverage gaps | Med | primary signal = `word_study` `body_json` (no morph call); morph used only as enrichment; A2 degrades to "fewer suggestions", never errors (Phase 0 measures) |
| Mid-range Android perf | Med | compute off note open/save (not graph open), debounced, chunked, capped; Phase 8 budgets |
| Migration risk | Low | append-only, idempotent `CREATE IF NOT EXISTS`, additive table, `note_links` untouched (2.10) |
| SRS scope creep | Med | Phase 6 produces **candidate records only**; SRS engine OUT OF SCOPE for v3.6 |
| Future-AI privacy | N/A v3.6 | v3.6 has no network/AI; consent untouched; gates documented for v3.7 (§10) |
| Suggested/confirmed/manual confusion | Med | distinct edge styles + legend rows + per-layer chips + detail-rail explainability + market-validated focus-first UX |
| Accidental scope drift to AI/server/telemetry/hairball/canvas-edit | — | §11 hard "OUT OF SCOPE" list + no-regression smokes make each structurally impossible |

---

## 10. Future roadmap (NOT v3.6 — later enrichments)

- **v3.7 — opt-in online AI assist (Option C):** Gemini "предложить
  связи" button reusing the existing `@google/generative-ai`
  integration; explicit consent gate; sends only bounded
  snippets/metadata; suggestions feed the **same Confirm panel**
  (never auto-written); likely `CONSENT_VERSION` bump. OUT OF SCOPE
  for v3.6.
- **v3.8 — local embeddings (Option B):** in-browser quantized
  multilingual model (Transformers.js / ONNX Runtime Web, Worker,
  cached), opt-in due to size; `auto_semantic` candidate layer
  feeding the Confirm panel. OUT OF SCOPE for v3.6.
- **v3.9 — Learning Path Graph:** sequence/prerequisite ordering over
  confirmed connections + SRS state (a guided study path). OUT OF
  SCOPE for v3.6.

---

## 11. Approved decisions (owner, 2026-05-16)

**APPROVED WITH REFINEMENTS — locked for implementation:**

1. ✅ v3.6 scope = **A2 + Confirm Panel + A5** (Phases 0–9 above).
2. ✅ Data model = **new `note_link_suggestions` table + reuse
   `note_links` on confirm** (§5, option R).
3. ✅ Export (refined): **`confirmed` exported by default**;
   **`rejected` only under a full learning-state export profile**;
   **`pending`/`later` never exported**; **no `export_schema_version`
   bump** (§5).
4. ✅ Phase 6 = **candidate records ONLY** — SRS engine untouched
   **and no real-card-creation UI in v3.6** (hardened from "only if
   trivial").
5. ✅ **No AI, no embeddings, no telemetry, no consent bump, no
   graph-canvas authoring** in v3.6.
6. ✅ Confirm panel uses **pedagogical wording** («Подтвердите связи»
   / «Что ты уже узнаёшь?»; «Я понимаю связь» / «Не связано» /
   «Позже»), not technical labels.
7. ✅ Proceed with **Phase 0–1 only** (this execution unit).

Guiding intent: *v3.6 makes the graph locally smart but not passive —
the system proposes, the learner confirms, and the confirmation
becomes the learning.*

**MAY be deferred (decide later, not blocking Phase 0–1):**

- Whether `suggested` edges are default-on or default-off on the
  graph (Phase 5).
- Default cap constants N (per-token) and K (per-note) — tune on the
  bundle in Phase 2.
- `later`-cooldown duration (session vs N days).

**OUT OF SCOPE for v3.6 (hard — enforced by §8 no-regression smokes):**

- Any online AI / Gemini call.
- Any local embedding model / new heavy dependency.
- Any new telemetry or `events` writes.
- Any `CONSENT_VERSION` change (unless audit reveals a data-flow
  reason — it did **not**, §2.8).
- Server-side enrichment of any kind.
- Graph-canvas link authoring / any durable mutation from the canvas.
- Making the global graph the primary UX (focus/local-first only).
- Auto-creating durable links without an explicit learner confirm.

---

*Authored 2026-05-16 by Claude Opus 4.7 (1M context). Planning-only;
grounded in a repo audit (file:line evidence in §2) and the user's
real bundle. No code, no commit, no push this turn.*
