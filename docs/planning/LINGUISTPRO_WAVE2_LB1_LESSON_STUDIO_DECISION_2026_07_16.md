# LinguistPro Wave 2 LB1 — Lesson Studio and premium lesson composition

**Date:** 2026-07-16

**Status:** `SHIPPED_PROD_VERIFIED`; superseded for AI-quality continuation by `LINGUISTPRO_WAVE2_LB2_AI_QUALITY_DECISION_2026_07_16.md`.

**Owner decision:** `1B + 1C + 2B + 3B + 3C-shadow + 4A`

**Predecessor:** `LINGUISTPRO_WAVE2_LB0_LESSON_BUILDER_DECISION_2026_07_15.md`
**Current baseline:** LB0 policy `lesson-builder-lb0-v1`, ephemeral browser artifact, app `3.11.177`.

**Implementation target:** policy `lesson-builder-lb1-v2`, schema 2, app `3.11.181`.

## 1. Observed problem

Owner live-check on the real profile established four product failures:

1. a 146-sentence source is presented as selectable, but the range control silently clamps the selection to 40 sentences;
2. All / My texts / Corpus exposes only the first small batch, leaving most eligible sources undiscoverable;
3. a schema-valid fallback can still be pedagogically empty: generic instructions, no exact anchors, no answers or criteria, grammar without a selected construction, and low-value vocabulary candidates;
4. the full builder inside Mentor Home competes with plan, writing, Telegram and settings, producing a noisy surface with weak text-to-lesson orientation.

This is an architectural LB0 ceiling, not a copy or styling defect.

## 2. Approved product contract

### 2.1 Full source scope plus bounded AI context — 1B + 1C

- The learner may select any contiguous range up to the entire eligible text.
- `scope` means the material the lesson is accountable to; it is not the prompt payload.
- The controller deterministically maps the scope into numbered chunks and exact sentence anchors.
- An **overview lesson** uses representative anchored windows from across the full scope.
- A **lesson series** produces a typed series plan and builds individual lessons lazily; no unbounded prompt and no silent truncation.
- Threshold policy for the first rollout:
  - `1–40` rows: direct bounded lesson;
  - `41–200` rows: deterministic map, learner chooses overview or series;
  - `>200` rows: series recommended; overview remains possible only from bounded representative windows.
- Server hard limits remain on AI input bytes, output tokens, model calls and exercise load, not on the user's visible source scope.

### 2.2 Full discoverable catalog — 2B

- All eligible personal and ready corpus sources are reachable through search and pagination/virtualization.
- Personal sources support title search, recent/title ordering and honest sentence counts.
- Corpus sources preserve author/work provenance and reuse the Reading Room's ready-work authority.
- The result contract is paged and typed: `{items,total,offset,limit,hasMore}`.
- Filtering happens before paging. A selected-source tray survives search, filter and page changes.
- The UI never describes unavailable/unprepared corpus works as selectable lesson sources.

### 2.3 Typed quality pipeline plus shadow specialists — 3B + 3C-shadow

The synchronous authority path remains one controller:

```text
authorized source scope
  -> deterministic structure map and fact pack
  -> pedagogical blueprint
  -> specialist-shaped exercise candidates
  -> deterministic quality validator
  -> at most one same-route repair
  -> premium draft OR honestly labelled basic plan
```

Logical roles are closed, typed functions at first: `scope_mapper`, `lesson_planner`, `exercise_writer`, `hebrew_fact_verifier`, `quality_validator`. They do not receive ambient tools, identity, secrets or write authority.

An independent critic or specialist model may run only in content-minimized shadow evaluation. Its output cannot alter the learner-visible draft, cards, `review_log`, FSRS or learner memory. Promotion requires an owner-approved independent gold, at least a practically meaningful measured quality gain, acceptable latency/cost, stable typed abstention and a useful single-controller fallback.

### 2.4 Lesson Studio logical route — 4A

- Add `#lesson-builder` as a full-screen logical view inside `library.html`.
- Do not create a second HTML page, browser tab or OPFS owner.
- Mentor Home keeps a compact launcher and last-draft status only.
- Desktop uses a calm two-pane workspace: source/catalog/context left, lesson setup/draft right.
- Mobile at 380 px uses explicit Source / Lesson steps with one primary action per viewport.
- Exact sentence anchors form the visual spine: every exercise can return to the cited source location.

## 3. Visual and interaction specification

**Subject:** an advanced Hebrew learner composing a grounded lesson from their own reading.
**Single job:** select accountable source material and turn it into a verifiable lesson draft.

**Visual thesis:** an editorial workbench over a living Hebrew text: quiet ink surfaces, one blue source-anchor line, dense typography, minimal chrome.

**Token direction:** reuse the Room theme variables; one accent only; no decorative gradients; no dashboard-card mosaic; dividers and columns express workflow state. Existing fonts remain to avoid a new download/offline dependency.

**Signature:** a persistent vertical anchor rail connecting selected source ranges to lesson tasks. It encodes provenance rather than decorating the screen.

**Motion:** one restrained view entrance, a short shared transition between mobile Source/Lesson steps, and focus/hover feedback on anchor links. `prefers-reduced-motion` removes all nonessential motion.

## 4. Pedagogical blueprint v2

```text
LessonBlueprintV2 = {
  schemaVersion: 2,
  mode: "single" | "overview" | "series",
  measurableOutcome: string,
  sourceScope: SourceScope[],
  anchorWindows: AnchorWindow[],
  targets: {
    vocabulary: VerifiedTarget[],
    constructs: VerifiedConstruct[]
  },
  sequence: ["notice", "understand", "controlled_apply", "independent_apply"],
  estimatedMinutes: 10 | 20 | 30,
  exercises: ExerciseV2[],
  quality: QualityReport,
  provenance: VersionedProvenance
}

ExerciseV2 = {
  id: string,
  type: "source_reading" | "vocabulary" | "grammar" | "writing" | "dialogue",
  purpose: string,
  instruction: string,
  anchorIds: string[1..n],
  prompt: string,
  expectedAnswer: string | string[] | null,
  hints: string[],
  successCriteria: string[],
  authority: "deterministic" | "resolver" | "advisory"
}
```

Premium-ready invariants:

- every exercise has at least one exact source anchor;
- every controlled task has an expected answer; open production has explicit success criteria;
- grammar focus requires one learner-selected, resolver-supported construct;
- vocabulary excludes known function words, unresolved/ambiguous readings, missing-gloss candidates and low-confidence candidates from authoritative presentation;
- task sequence moves from noticing to understanding to constrained application and then production when duration permits;
- no task may claim a grade or mastery change;
- generic instructions such as “find a construction” without a named target fail quality validation.

## 5. Deterministic, LLM and evaluator boundaries

- **Deterministic:** identity, authorization, consent, source retrieval, complete-scope map, chunk/window selection, locators, resolver fact precedence, known/due/weak reads, candidate exclusion, limits, schema validation, quality invariants, artifact TTL and status.
- **Resolver/curated authority:** Hebrew lemma/root/POS/binyan/gloss evidence and supported construct facts. Model prose cannot override it.
- **LLM advisory:** measurable outcome phrasing, sequencing, explanations and exercise wording over supplied anchors/facts.
- **Evaluator:** no learner-state authority. Shadow critic measures artifacts against an independent rubric only.
- **Learner authority:** selects sources, range, mode, goals, focuses and constructs; edits prose; explicitly starts or discards the lesson.
- **State authority:** LB1 writes no card, grade, `review_log`, FSRS, mastery, learner memory or publication state.

## 6. Privacy, lifecycle, rights and cost

- Personal sources retain the existing cloud-text plus agent-read consent gates at action time.
- Public corpus sources retain work attribution and public-domain provenance.
- Prompt content is class-D transient; operational telemetry stores only counts, hashes, versions, timings and failure classes.
- Source text is not copied into the session artifact. Locators, selected-scope metadata and generated prose expire with the existing 24-hour browser-session store.
- “Keep until I delete” remains the later M1 durable personal-library contract and requires S4–S7; LB1 stays forward-compatible but must not imply durability.
- One visible build request reserves one bounded model route. One repair maximum. Shadow evaluation uses a separately metered flag and never piggybacks invisibly on the learner's call.
- BYOK remains fail-closed; no silent managed-provider fallback.

## 7. Rollout slices

### LB1.1 — workspace and discovery

- logical `#lesson-builder` view in `library.html`;
- compact Mentor launcher;
- paged complete eligible-source browser and persistent selection tray;
- 380×844 Source/Lesson step layout.

### LB1.2 — full source scope

- remove the user-visible 40-row clamp;
- add `scope_row_count`, mode and deterministic map/anchor windows;
- preserve bounded provider input and exact return-to-source anchors;
- overview/series choice for long sources.

### LB1.3 — premium blueprint

- v2 typed artifact and exercise contract;
- explicit grammar-target discovery/selection;
- vocabulary eligibility filter;
- anchors, answers, hints and success criteria;
- honest `basic_plan` status when premium validation fails.

### LB1.4 — measurement and shadow

- versioned independent rubric and representative Hebrew fixtures;
- deterministic validator plus one repair;
- shadow critic behind a separate flag and ledger;
- promotion/no-go evidence packet.

## 8. Acceptance evidence

1. A real 146-row source can select `1–146`; request scope preserves all 146 while provider context remains bounded and traceable.
2. A catalog with more than one page exposes every eligible item exactly once under the relevant filter; counts and paging remain correct after search.
3. Grammar cannot build a premium draft without a named verified construct.
4. Every premium exercise has anchors and either expected answers or success criteria; generic empty tasks fail closed to `basic_plan`.
5. No LLM output changes learner truth; no new writer to cards/review/FSRS/memory exists.
6. Personal-source consent revoke fails closed; no content enters logs/errors/telemetry.
7. ru/en/he, RTL, keyboard navigation and screen-reader labels pass; 380×844 has no horizontal overflow or hidden primary action.
8. Existing LB0 session artifacts load or expire safely; rollback hides the route without schema/data cleanup.

## 9. Primary failure modes and controls

1. **Full scope becomes an unbounded prompt.** Separate `scope` from `anchorWindows`; hard provider byte/token caps.
2. **Pagination recreates a blind zone or duplicates results.** Filter-before-page contract plus fixture cardinality/uniqueness tests.
3. **Model invents grammar or gloss.** Resolver allowlist, typed target IDs, abstention and post-generation validation.
4. **A polished generic worksheet passes as premium.** Minimum blueprint rubric, named targets, anchors, answers/criteria and explicit `basic_plan` degradation.
5. **New route creates a second OPFS/database owner.** Same-document logical view only; host adapter remains the single data capability.
6. **Long-text series silently becomes durable curriculum.** Ephemeral typed series plan only until M1/S4–S7 approval.
7. **Shadow specialist leaks authority or doubles cost.** Separate flag/ledger, content-minimized input, no learner-visible branch, promotion gate.

## 10. Adversarial R1–R17 synthesis

- **R1/R10/R11:** named resolver-supported targets, source precedence and independent fixtures prevent confident Hebrew fabrication and regressions.
- **R2/R8/R17:** measurable outcome, staged practice, duration load and reading anchors replace generic task lists; no tutor self-certification.
- **R4/R5:** full-workspace hierarchy, exact source return, mobile steps and honest degradation meet a premium floor without hiding limitations.
- **R6/R7/R9:** complete discoverability, author/work attribution and register-aware source provenance prevent a flat corpus dump.
- **R3/R12/R13:** typed artifacts and one host/controller avoid dual truth; v2 is forward-compatible without prematurely migrating storage.
- **R14/R15:** authenticated scope, action-time consent, transient content and deletion/expiry boundaries remain fail-closed.
- **R16:** bounded windows, one repair and separately metered shadow work cap cost and latency.

## 11. Rollback and owner gates

- Existing `LESSON_BUILDER_LB0_ENABLED` remains the immediate server kill switch; the LB1 UI route must also disappear when the capability is unavailable.
- No database migration is part of LB1.1–LB1.3.
- Owner decisions already closed: scope/mode, catalog, single-controller pipeline with shadow specialists and same-document Studio route.
- Still separate future owner gates: durable retain-until-delete M1/S4–S7, shadow evaluator gold/promotion threshold, actual cost ceiling and any autonomous/background publication.

## 12. Implementation result — 2026-07-16

- `#lesson-builder` is a full-screen logical view inside `library.html`; Mentor Home now contains only a compact launcher/status entry.
- Desktop uses the approved two-pane source/lesson workbench. At 380×844 the panes become explicit `Sources / Lesson` steps; the verified screenshot has no horizontal overflow.
- Source discovery now filters before paging and returns `{items,total,offset,limit,hasMore}` without the former 15-personal/30-total hard stops. The live-size local fixture shows `1–20 of 100`.
- A 146-row selection is accepted as 146 rows. The controller creates eight content-free 20-row chunks and three bounded exact anchor windows; provider context remains under per-source and total character caps.
- `single / overview / series` is typed. Series mode returns an ephemeral plan covering every chunk; it does not claim durable curriculum storage.
- Artifact schema 2 carries `sourceMap`, exact anchor IDs, mode/series plan, quality tier, selected grammar target, answers, hints and success criteria. The session adapter still reads a prior schema-1 LB0 draft.
- Composition validation rejects foreign/missing anchors, missing selected-focus exercises, missing criteria and controlled vocabulary/grammar without expected answers. One same-route repair is allowed; a second failure becomes an explicitly labelled `basic_plan`.
- The deterministic basic plan cites exact sentence ranges and never claims premium readiness.
- Vocabulary eligibility excludes common function words, ambiguous/low-confidence facts and missing glosses.
- Grammar focus first performs resolver-only discovery. No LLM budget is spent until the learner selects one registry-known construction found in the chosen scope; no confirmed construct means no grammar lesson.
- Shadow critic plumbing is present behind `LESSON_BUILDER_SHADOW_CRITIC_ENABLED` (default off). It receives a typed draft, emits only allowlisted quality codes/score, is metered separately and cannot alter the learner-visible artifact.
- Independent fixtures live in `scripts/premium/fixtures/lesson-builder-lb1/`: a versioned rubric plus valid/adversarial composition cases. Current targeted gate: `71/71`.

Remaining outside this implementation result: durable retain-until-delete library, background generation of each series lesson, human-scored Hebrew gold, and promotion of the shadow critic. Those remain governed by the owner gates above.

## 13. Production closeout and LB2 handoff

- Production `3.11.181` closes the `lesson -> source anchor -> lesson` navigation loop and distinguishes an unavailable AI route from an AI candidate rejected by the quality gate.
- Owner live verification showed that AI generation is already connected: the build endpoint returned HTTP 200, but first and repair candidates collapsed to `LLM_OUTPUT_INVALID`, after which the deterministic plan was shown.
- The remaining quality problem is therefore acceptance diagnostics and measured generation quality, not initial AI connectivity.
- `validateComposition` currently returns a value or `null`; it cannot identify the failed invariant or direct a precise repair.
- The approved next slice is LB2-A in `LINGUISTPRO_WAVE2_LB2_AI_QUALITY_DECISION_2026_07_16.md`. Shadow promotion, numeric human-quality thresholds and durable lesson storage remain separate owner gates.
