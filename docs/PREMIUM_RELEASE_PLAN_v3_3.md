# Premium Release Plan — v3.3 cycle (master plan)

> **Status.** Draft authored 2026-05-14 immediately after v3.3.0 ship (`637ff52`). Spans the v3.3 cycle — patch releases (`v3.3.1`, `v3.3.2`, …) up to v3.4 cut.
>
> **Anchor.** Builds on [`PREMIUM_RELEASE_PLAN_v3_2.md`](PREMIUM_RELEASE_PLAN_v3_2.md) §"Deferred → v3.3". The v3.2 master plan already enumerated the deferred candidates; this document sequences them and adds the two newly-user-requested directions (multicohort dashboard + calibrated quiz).
>
> **Predecessor releases.** v3.2.0 (mega-release, `32d8cb4`) · v3.2.1 (transparency preview patch, `becee17`) · v3.3.0 (Workstream A1 — 250K hspell dict, `637ff52`).

---

## 1. Strategic meta-decision (cycle framing)

v3.2 was a **scope expansion** release — four parallel directions shipped together (Premium Notes + Text-cards + Analytics + Research Mode). It exited with significant deferred backlog and an unrun pilot.

v3.3 should be a **scope consolidation + scientific-instrument hardening** cycle. Three commitments:

1. **Hardening for the eventual pilot.** Multicohort dashboard + calibrated quiz are diploma-research enablers: the pilot graduates from "one cohort, self-report scores" (v3.2) to "N cohorts, calibrated scores" (v3.3). This is the **research-thesis hardening track**.
2. **Premium delight without scope creep.** Knowledge-graph view + Cross-text "Где встречается" hub — both deferred from v3.2 as premium-tier visual delight. Targeted ship in v3.3.x.
3. **No major UX rewrite.** Index.html monolith code-split + Sherpa lazy-load are deferred to v3.4 unless dogfood evidence accumulates. v3.3 keeps the same shell.

**Out of scope for v3.3:** Premium SRS Epic (FSRS + Anki Connect) stays at v3.4. Cloud sync, A/B framework, push notifications, native mobile packaging — same won't-do list as v3.2.

---

## 2. Decisions log (tentative — confirm before phase kickoff)

| # | Decision | Why |
|---|---|---|
| D1 | **Cycle goal = research-thesis hardening + delight delivery.** Directions 12 (multicohort) + 13 (calibrated quiz) are first-priority because they unblock pilot scaling for the diploma. | Pilot will graduate to multi-cohort within months of first real participant; we don't want a refactor mid-pilot. |
| D2 | **v3.3.0 = morphology A1 (shipped).** v3.3.1 = small Workstream-A items (A2-A5). v3.3.2 = multicohort + cross-text hub. v3.3.3 = calibrated quiz. v3.3.4 = Knowledge-graph view. Premium SRS Epic stays at v3.4. | Granular shipping pace matches the v3.2.1 pattern; each patch is independently shippable. |
| D3 | **Multicohort: read-only compare for v3.3.** Write operations (cross-cohort student moves, merging) deferred to v3.4. | Read is enough for diploma analysis; write adds privacy + audit complexity. |
| D4 | **Calibrated quiz: parallel path, not replacement.** Self-report exam score remains as primary; quiz is opt-in additional outcome capture. | Both paths inform research; preserving self-report keeps comparability with v3.2 pilot data if any. |
| D5 | **No new consent_version bump required for any v3.3.x release.** All new opt-in features ride the existing `consent_version: 1.0` envelope; new fields are additive within the `metrics` object. | Re-consent prompts have UX cost; only bump when the wire surface materially changes (new collected fields, new retention rules). |
| D6 | **No new `/api/research/v1/*` endpoints unless absolutely required.** Multicohort dashboard reads existing per-cohort aggregates concurrently; calibrated quiz outcome submits via the existing `POST /api/research/v1/metrics` with extended `metrics.outcome` shape. | Architectural exception "aggregates only" stays as v3.2 D4 anchor invariant. |
| D7 | **Cycle window: 6-10 weeks calendar.** Realistic per-direction effort: 11 d (multicohort) + 8 d (calibrated quiz) + 6 d (Knowledge-graph) + 5 d (cross-text hub) + 4 d (Workstream A2-A5 combined) = ~34 dev-days. Allow 50 % buffer for QA + docs. | Matches v3.2's 7-9 weeks for 4 directions; v3.3 is narrower scope so a slightly shorter cycle is plausible. |

---

## 3. Structure of the cycle — six directions

### Direction 12 — Multi-cohort Teacher Dashboard *(diploma enabler, ~11 d)*

**Premise.** Today's `/teacher.html` (shipped in v3.2.0 Phase 11.5) authenticates per-cohort: one cohort code + one researcher token → one dashboard view. A diploma researcher running an ulpan with multiple groups (e.g. ULPAN-A, ULPAN-B) currently has to logout/login between groups.

**Scope (v3.3.2):**
- Persist **N cohort codes + their tokens** in `localStorage` (replace single-cohort keys with array).
- Login screen accepts **bulk credential paste** — newline-separated `<code> <token>` pairs — OR adds-one-at-a-time.
- Dashboard header gains a **cohort selector** (dropdown / chip strip) and an **"All cohorts (compare)" view**.
- "All cohorts" view renders **side-by-side summary tiles per cohort** + **overlaid charts** (engagement timeline, audio playback) with cohort-color legend. Per-student tables stay per-cohort (k-anonymity gate applies independently to each cohort).
- New CSV export: `cross_cohort_aggregates.csv` — cohort-grouped per-day rows for direct R/Python analysis of "ULPAN-A vs ULPAN-B vs … " across the same time window.
- Per-cohort smoke matrix already covers single-cohort cases. New 6-case smoke for the cross-cohort UX.

**Out of scope:**
- Cross-cohort student moves (would need write endpoints; D3 puts this at v3.4).
- Cohort-merge (audit trail complexity).
- Researcher-token rotation UI (Workstream A2 handles this via CLI).

**Server changes:**
- **Zero** — existing `GET /api/research/v1/cohort/<code>/aggregates` is called N times in parallel.

**Acceptance:**
- [ ] 3-cohort sample dashboard renders cleanly on desktop + tablet.
- [ ] k-anonymity gate still firing per-cohort (3 small + 1 ≥5 cohort case).
- [ ] CSV export round-trips through `read.csv(...)` in R without manual cleanup.
- [ ] No new consent prompts triggered.
- [ ] All 14 existing teacher-smoke cases still green.
- [ ] +6 cross-cohort smoke cases green.

---

### Direction 13 — Calibrated outcome quiz *(diploma enabler, ~8 d)*

**Premise.** v3.2 outcome capture (D3) settled on student self-report + teacher CSV upload. The deferred upgrade — "calibrated in-app diagnostic quiz" — would replace subjective self-report with a normalized score derived from a known instrument. Critical for thesis scientific validity claims.

**Scope (v3.3.3):**
- **Quiz authoring layer.** Static JSON in `public/quiz/ulpan_diagnostic_v1.json` — 15-25 multiple-choice items, calibrated by a domain expert (the ulpan teacher) on a 5-level CEFR-aligned scale (A1 / A2 / B1 / B2 / C1). Items in Hebrew with Russian/English glosses. Schema versioned (`format: "linguistpro-quiz-v1"`, `schema_version: 1`).
- **Delivery UI.** New modal "🎓 Калибровочная диагностика" reachable from the research panel (next to "Сдать экзамен"). Items presented one-at-a-time, time-bounded (~10 min target). Local progress so a refresh doesn't reset. Privacy: item-level responses never leave device; only the final percentile and CEFR placement go to the research payload.
- **Scoring.** Adaptive IRT (Item Response Theory) light — Rasch one-parameter model with pre-calibrated item difficulties baked into the JSON. Standard error bands shown to the student. Final score normalized 0-100 (linear map from CEFR mid-points to centiles) for compatibility with the existing `post_test_score` field.
- **Research integration.** New `metrics.outcome.{quiz_score_normalized, quiz_cefr_band, quiz_se, quiz_completed_at, quiz_version}` fields. `outcome_capture_method: "calibrated-quiz"` literal added to the existing enum. Teacher CSV upload still overrides quiz score (teacher authority preserved).
- **Documentation.** New `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` — item bank, difficulty calibration methodology, validity caveats. Item bank under CC BY-SA 4.0 so derivative ulpan groups can extend.

**Server changes:**
- **Zero new endpoints.** Quiz uses the existing `POST /api/research/v1/metrics` with extended `metrics.outcome` shape. Server-side `validate.js` adds the new fields to `ALLOWED_METRIC_KEYS`.

**Acceptance:**
- [ ] Quiz JSON validates against schema; all items have pre-calibrated difficulty.
- [ ] Adaptive scoring matches reference R `mirt` package output ±0.05 SD on 100 simulated test runs.
- [ ] Final score lands in `metrics.outcome.quiz_score_normalized`; teacher dashboard renders it next to self-report (both visible when both exist).
- [ ] Privacy: item-level responses NEVER appear in any network payload (verified by smoke).
- [ ] +4 quiz smoke cases (server validate + client deliver + privacy + integration).
- [ ] No regression in existing 28-case client smoke.

**Companion doc decisions to lock before phase kickoff:**
- Quiz item count (15 / 20 / 25)
- CEFR ↔ 0-100 mapping function (linear vs polynomial)
- Time limit per item (none / 30 s / 60 s)
- Retake policy (one-shot vs unlimited with cooldown)

---

### Direction 14 — Knowledge-graph view (M8 from PREMIUM_NOTES_PLAN) *(delight tier, ~6 d)*

**Premise.** Already in PREMIUM_NOTES_PLAN_v3_2.md §M8 — visual force-layout of notes ↔ texts ↔ roots ↔ binyanim ↔ inter-note links. Deferred from v3.2 as "delight tier; not critical for premium positioning". Reopened in v3.3.x as the premium delight beat that exits v3.3 with a strong visual demo.

**Scope (v3.3.4):**
- **Lib choice (open question; D8).** Recommend `d3-force` (Apache-2.0, ~50 KB gzipped) over `sigma.js` or `cytoscape.js`. Same dep as the existing chart pipeline in `teacher.html`.
- **Node taxonomy.**
  - `Text` (blue) — library texts; size = sentence count.
  - `Note` (yellow) — premium notes; size = link degree.
  - `Root` (green) — 3-letter Hebrew roots; size = surface-form count.
  - `Binyan` (purple) — grammatical pattern; tiny fixed size.
  - `User` (single central node, grey) — anchors clusters that have no explicit binding.
- **Edge taxonomy.**
  - `text→sentence→note` chains for audio-anchored notes.
  - `note↔note` for explicit `linked` premium notes.
  - `root→binyan` from morphology dict.
  - `note→root` for word-study notes with explicit root field.
- **Interactions.** Hover = show full label + metadata. Click = open the underlying entity (text in classic view, note in inspector). Drag = stick the node. Right-click context menu = "hide cluster" / "isolate".
- **Performance.** Force simulation cold-starts on 200 nodes max for v3.3.4; larger libraries fall back to "show top-N nodes" (top by link degree). Background WebWorker for the layout iterations.

**Out of scope:**
- 3D rendering (overkill; 2D force layout is the established premium visual language).
- Cross-device sync of view state (offline-first invariant).
- Edit-from-graph (read-only view).

**Acceptance:**
- [ ] Graph renders for users with ≥50 notes within 500 ms cold-start (cached layout).
- [ ] No regression in classic view load time (lazy-load the graph module).
- [ ] Mobile fallback: lock to "isolated cluster" view; full graph requires landscape ≥ 1024 px wide.
- [ ] Light theme + dark theme parity (color tokens via existing theme vars).
- [ ] +3 visual regression captures (`Smoke-check/graph-view/`).

---

### Direction 15 — Cross-text "Где встречается" hub (Workstream E light MVP) *(navigation, ~5 d)*

**Premise.** During Phase 9.4 morphology work, the "Где встречается" cross-text reference hub was scoped down because it would have delayed D9. Now opening as a thin slice in v3.3.x.

**Scope (v3.3.2 — bundled with Direction 12):**
- New "🔎 Где встречается" button in the word-study form (next to morphology auto-fill).
- Opens a side-panel listing all **library texts containing this root or surface form**, grouped by binyan if applicable, with a sentence-level snippet preview (≤80 chars context window around the match).
- Click on a snippet → opens that text at that sentence in the classic view.
- All-local query: walks `texts` table + `sentences` table + the existing morphology dict in-memory. No new server endpoint.

**Out of scope (defer to v3.3.3+ or v3.4):**
- Cross-app sharing of "Где встречается" results.
- Frequency heatmap visualization.
- Export to CSV / Anki.

**Acceptance:**
- [ ] First lookup completes in < 200 ms on a library of 100 texts.
- [ ] Subsequent lookups (same word) hit in-memory cache and complete in < 30 ms.
- [ ] Niqqud-insensitive matching (uses the same `MorphNormalize` invariant).
- [ ] +4 smoke cases.

---

### Direction 16 — Workstream A small tasks (operational maturity) *(~4 d total)*

**Premise.** Per `PARALLEL_WORK_PLAN_DURING_PILOT.md §3`, Workstream A holds zero-risk admin CLIs and docs formalization. Targeted for v3.3.1 as the **first patch release of the cycle** — fast wins that don't touch any user-facing surface.

**Scope (v3.3.1):**
- **A2 — `scripts/research/rotate_token.js` CLI.** Wraps the procedure documented in `RESEARCHER_GUIDE.md §2.1.1` (in-place hash rotation of `cohort_meta.json` `researcher_token_hash`). Atomic rewrite via `.tmp` + rename. New `RESEARCHER_GUIDE.md` example, "deferred to v3.3" note removed.
- **A3 — Manual multi-device student_id link.** A CLI for the student to **explicitly merge two anonymous student IDs** belonging to the same person (e.g. desktop + mobile PWA). Output: an audit-logged merge entry in `cohort/<code>/deletions.log`. Risk-controlled: requires a one-time-pass code displayed in both apps (no implicit linkage).
- **A4 — Q2 re-consent rule formalization.** Promote the informal "judgement call" from `ULPAN_RESEARCH_PLAN §14 Q2` into a structured decision tree in `docs/RESEARCH_CONSENT_RULE.md` (new file). Material vs cosmetic change matrix. Closes Q2.
- **A5 — `validate.js` lint CLI.** Standalone CLI that runs the schema validator from `research/validate.js` against any local JSON file, returning machine-readable diagnostics. Useful for ulpan teachers preparing a CSV upload.

**Acceptance for each:**
- [ ] One smoke case per CLI (a happy-path round-trip).
- [ ] One paragraph each in `RESEARCHER_GUIDE.md`.
- [ ] No runtime / wire-format changes.

---

### Direction 17 — HebMorph sidecar hardening *(operational maturity, lazy, ~3-4 d)*

**Premise.** PREMIUM_RELEASE_PLAN_v3_2 explicitly demoted YAP→WASM and HebMorph sidecar hardening from "v3.3 candidate" to "v3.3+ nice-to-have". v3.3.0 made the sidecar mostly irrelevant (full local 250K dict via the opt-in toggle); the sidecar remains only for users who want the absolute latest morphology updates from a server.

**Scope (v3.3.3, only if dogfood evidence emerges):**
- Tiered rate-limit (free vs paid tier proxies).
- Morphology cache layer (keyed by word hash) on the sidecar.
- Telemetry counters (Prometheus-style) for cache hit rate, p95 latency.

**Gate:** ship only if a Real Pilot reveals sidecar load issues. Otherwise let it sit at v3.4.

---

## 4. Recommended sequencing

```
v3.3.0  (DONE 2026-05-14)  Morphology A1 — opt-in 250K dict
                            └─ merge 637ff52 · tag v3.3.0

v3.3.1  (~4 d)              Workstream A small tasks
                            ├─ A2 rotate_token.js
                            ├─ A3 multi-device link
                            ├─ A4 re-consent rule formalization
                            └─ A5 validate.js lint CLI

v3.3.2  (~11+5 d = 16 d)    Multicohort + Cross-text hub
                            ├─ Direction 12 (multicohort dashboard)
                            └─ Direction 15 (Где встречается)

v3.3.3  (~8 d)              Calibrated quiz
                            └─ Direction 13

v3.3.4  (~6 d)              Knowledge-graph delight
                            └─ Direction 14

v3.4.0  (TBD, separate cycle)
                            ├─ Premium SRS Epic (FSRS + Anki Connect)
                            ├─ Multicohort write operations (D3)
                            ├─ DictaBERT transformers.js (Tier 3 morphology)
                            └─ Index.html monolith code-split
```

**Total v3.3.x cycle effort:** ~34 dev-days; with 50 % QA + docs buffer → **~50 calendar days** = **7-8 weeks**.

---

## 5. Cross-direction dependencies

| Dependency | What | Why |
|---|---|---|
| 12 → 11.5 | Multicohort dashboard extends existing teacher.html | Wire-compat (no breaking change) |
| 13 → 11.6 + 11.4 | Calibrated quiz reuses outcome submission path | No new endpoint |
| 14 → 9.4 + Notes | Graph reads from morphology dict + notes table | Read-only, no schema change |
| 15 → 9.4 + 10 | "Где встречается" walks texts + sentences + morph | Pure client-side, in-memory |
| 16 (A2-A5) | Tooling — no runtime touch | Zero-risk |
| 17 | Server-side sidecar — only runs if v3.3 dogfood demands | Optional |

**No cross-direction blockers detected.** Each direction can start independently once predecessor v3.3.x patch ships.

---

## 6. Quality gates (cycle-wide)

Per phase merge:
- All existing smoke matrices green (`npm run smoke:research`, `npm run smoke:morph`).
- New smoke cases added for any user-facing surface (CLI = 1 case; UI = ≥3 cases).
- Privacy audit if the touched code touches `research/**` or any consent-template field: explicit "no new collected fields" entry in CHANGELOG.

Per patch release tag:
- `package.json` version bumped (`3.3.0` → `3.3.1` → …).
- CHANGELOG `[Unreleased]` collapsed to `[3.3.x] — YYYY-MM-DD`.
- Annotated git tag pushed.
- GitHub release authored using a notes template that mirrors v3.3.0.

Per cycle close (v3.4 cut):
- Full re-run of all smokes + visual regression (`smoke-check/teacher-dashboard/` + `smoke-check/graph-view/`).
- `RESEARCHER_GUIDE.md §8 pre-deployment checklist` re-evaluated.
- Memory refresh: archive `project_v3_2_progress.md`, open `project_v3_3_progress.md`, refresh `project_v3_4_backlog.md`.

---

## 7. Open questions (to resolve before each phase opens)

| ID | Phase | Question | Default |
|---|---|---|---|
| D8 | 14 | Graph rendering library | `d3-force` (deps minimal, parity with existing charts) |
| D9 | 13 | Quiz item count | 20 (calibration robustness vs student fatigue trade-off) |
| D10 | 13 | CEFR ↔ percentile mapping | Linear (simpler; future v3.4 can re-curve from real data) |
| D11 | 13 | Retake policy | One-shot per cohort (preserves IRT validity) |
| D12 | 12 | Cross-cohort student moves | Defer to v3.4 (D3 already locks this) |
| D13 | 12 | Cohort selector UI | Chip strip (max 6 visible; overflow → dropdown) |
| D14 | 14 | Mobile-graph fallback | "Isolated cluster" view (no full layout) |
| D15 | cycle | v3.4 trigger date | Open-ended; gated on dogfood from real pilot |

---

## 8. Risk register (cycle-level)

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Pilot kicks off mid-v3.3 cycle → freeze conflict | Medium | High | Apply the same `PARALLEL_WORK_PLAN` pattern: pin Railway to last shipped tag for pilot users; develop on a separate branch |
| Calibrated quiz item bank lacks expert calibration | Medium | Medium | Item bank doc-locked behind D-decision; phase doesn't kick off until ulpan teacher signs off on initial 20 items |
| Graph view evicts shell cache on iOS Safari | Low | Medium | Apply same `MORPH_QUOTA_THRESHOLD = 0.80` guard from v3.3.0 SW work |
| Multicohort UX overwhelms teachers with N>3 cohorts | Low | Low | Chip strip overflow design + "max 6 visible" rule |
| Premium SRS Epic scope creep into v3.3 | Medium | Medium | Hard rule: stays at v3.4 unless cycle ends 2+ weeks early |

---

## 9. Diploma research narrative — how v3.3 lands

After v3.3 cycle, the diploma thesis can claim:
- **Anonymous opt-in research data collection** (v3.2.0).
- **Privacy invariants formally audited** (v3.2.0 §B1 fix).
- **Multi-cohort comparative design** (v3.3.2 → enables ulpan A vs ulpan B comparison).
- **Calibrated outcome measurement** (v3.3.3 → replaces self-report subjectivity).
- **Premium tooling demo** (v3.3.4 graph view → visual aid for thesis defense).

The thesis methodological contribution (privacy-preserving opt-in research mode) was complete at v3.2. v3.3 contribution is to **scaling and measurement validity**, not architectural novelty.

---

## 10. Live status (will be updated as patches ship)

| Patch | Direction(s) | Status | Anchor |
|---|---|---|---|
| v3.3.0 | Workstream A1 — 250K dict | ✅ shipped 2026-05-14 | `637ff52` |
| v3.3.1 | Workstream A2-A5 | ⏳ planned | TBD |
| v3.3.2 | Direction 12 + 15 | ⏳ planned | TBD |
| v3.3.3 | Direction 13 + (opt. 17) | ⏳ planned | TBD |
| v3.3.4 | Direction 14 | ⏳ planned | TBD |

---

## 11. Cross-references

- v3.2 master plan: [`PREMIUM_RELEASE_PLAN_v3_2.md`](PREMIUM_RELEASE_PLAN_v3_2.md) — predecessor; §"Deferred → v3.3" is the source of most candidates here.
- Notes plan (M8 graph source): [`PREMIUM_NOTES_PLAN_v3_2.md`](PREMIUM_NOTES_PLAN_v3_2.md).
- Research master plan (D3 quiz, multi-cohort source): [`ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md).
- Roadmap (P1-P6 epics, FSRS lineage): [`ROADMAP_PREMIUM.md`](ROADMAP_PREMIUM.md).
- SRS strategy (Premium SRS Epic deferred): [`SRS_STRATEGY_v3_2.md`](SRS_STRATEGY_v3_2.md).
- Pilot debrief (closes v3.2 freeze window): [`PILOT_DEBRIEF_v3_2_to_v3_3.md`](PILOT_DEBRIEF_v3_2_to_v3_3.md).
- Parallel work plan (Workstream A definitions): [`PARALLEL_WORK_PLAN_DURING_PILOT.md`](PARALLEL_WORK_PLAN_DURING_PILOT.md).
- HE consent review brief: [`HE_CONSENT_REVIEW_BRIEF.md`](HE_CONSENT_REVIEW_BRIEF.md).

---

## 12. Approval workflow

This document is a **proposed master plan**. Before any v3.3.x phase kickoff:

1. User reviews this document end-to-end.
2. User confirms or rebuts each D1-D15 decision (table §2 + §7).
3. User picks the **next patch** (default: v3.3.1 small tasks).
4. A focused phase plan is authored (analog to `ULPAN_RESEARCH_PLAN_v3_2.md`'s per-phase sections).
5. Phase ships under the same quality gates as v3.3.0.

—  *signed,* draft prepared by Claude Opus 4.7 (1M context) on 2026-05-14 immediately after v3.3.0 release.
