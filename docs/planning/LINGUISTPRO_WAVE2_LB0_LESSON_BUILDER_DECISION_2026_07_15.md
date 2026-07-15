# LinguistPro Wave 2 LB0 — selected-text Lesson Builder decision

**Date:** 2026-07-15

**Status:** `OWNER_APPROVED_IMPLEMENTED`; approved bundle `1A + 2A + 3A + 4A`, policy `lesson-builder-lb0-v1`, app `3.11.175`.

**Scope:** one editable lesson draft from one to three explicitly selected permitted text sources.

## Observed problem and live baseline

- **FACT:** LinguistPro already has user-scoped texts addressed by `text_key`, ready public-domain Ben-Yehuda works addressed by `work_id + text_key`, server-side sentence/window resolvers, deterministic Hebrew keying, coverage signals and eligible review targets.
- **FACT:** reading, sentence explanation, comprehension, retelling, role-play, constrained writing and review exist as separate bounded scenarios.
- **FACT:** there is no Lesson Builder controller, typed lesson-draft artifact, multi-source selection flow or learner edit/confirm boundary.
- **FACT:** existing agent paths keep resolver facts above LLM prose and do not grant explanatory/advisory LLM output authority over `review_log`, FSRS or mastery.
- **FACT:** LB0 does not require Postgres, object storage, embeddings, OCR, media ingestion or a persistent personal corpus.

## Pedagogical mechanism and visible behavior

The learner explicitly selects permitted reading material, a goal, explanation language, approximate level, duration and one bounded focus. Deterministic preparation extracts source windows, tokens, resolver facts, coverage and eligible review targets. The LLM may arrange and phrase a coherent lesson only over those facts. The result is an editable, attributable draft; no lesson becomes active without a separate learner confirmation.

The lesson must preserve a visible route back to every source window. It is a reading-first composition tool, not a generic worksheet generator.

## Owner decision 1 — eligible source types

### A. Existing in-product text sources — **recommended**

- One to three explicitly selected sources from:
  - the learner's existing LinguistPro texts that are already available to the authenticated user; and
  - ready Ben-Yehuda public-domain corpus texts.
- Reuse stable `text_key` and `work_id + text_key` provenance and existing source-return navigation.
- No new paste box, URL fetch, file upload, PDF, OCR, image, audio, video or subtitle ingestion in LB0.

**Trade-off:** strongest provenance, rights and implementation boundary; a learner must first have a text in LinguistPro rather than paste arbitrary material directly into the builder.

### B. Paste-only session input

- One to three pasted text blocks with learner declaration that use is permitted.
- Generate ephemeral source IDs for this draft; no external fetch or file parsing.

**Trade-off:** fastest arbitrary-text experience, but weaker attribution/return-to-reading behavior and a new rights, validation, consent and source-editor surface.

### C. Existing sources plus pasted text

- Union of A and B in the first release.

**Trade-off:** widest utility, but combines two provenance, lifecycle and UX contracts in the first slice and materially enlarges acceptance scope.

## Owner decision 2 — learner edit and activation point

### A. Draft editor, then explicit “Start lesson” — **recommended**

1. “Build draft” generates `status=draft`.
2. The learner may edit objectives, ordering, explanations and exercise wording; source anchors and resolver facts are read-only.
3. “Start lesson” validates the edited structure, creates a session snapshot and changes only the lesson-session status to `active`.
4. No card, grade, review event or mastery state is created by this action.

**Trade-off:** clear human authority and safe provenance. It adds one deliberate confirmation step.

### B. Preview, then “Accept as-is” with no editing

**Trade-off:** smaller UI but fails the intended editable-draft promise and gives the LLM too much practical authorship.

### C. Live block editor with per-section approval

**Trade-off:** strongest control for advanced users, but too much interaction and state complexity for LB0.

## Owner decision 3 — source and new-item limits

### A. Balanced bounded envelope — **recommended**

- Sources: 1–3.
- Per selected source window: 500–4,000 Unicode characters.
- Combined selected text: at most 8,000 Unicode characters.
- No silent truncation: the learner must narrow an oversized selection.
- Duration choices: 10, 20 or 30 minutes.
- Candidate new vocabulary/construct cap: 3 / 5 / 7 respectively.
- Exercises: at most 3 / 5 / 7 respectively, with at least one source-reading action.
- Resolver work is batched under existing per-call bounds; unresolved/ambiguous items remain explicitly non-authoritative.

**Trade-off:** enough material for a coherent lesson while keeping mobile editing, resolver cost and cognitive load bounded.

### B. Conservative pilot

- One source, at most 4,000 characters total, 10–20 minutes, at most three new items and three exercises.

**Trade-off:** easiest to validate, but does not test the approved multi-source value proposition.

### C. Broad envelope

- Up to three sources and 20,000 characters total, up to ten new items.

**Trade-off:** more content, but higher latency/cost, weak mobile reviewability and avoidable overload; not recommended for LB0.

## Owner decision 4 — retention after draft generation

### A. Reference-only sources and ephemeral draft — **recommended**

- LB0 never copies existing source text into a new durable store; it retains only source IDs and selected-window locators while the session is open.
- The editable draft and active lesson snapshot live in browser session state and are removed on explicit discard, sign-out or after a 24-hour local expiry.
- No server-side draft row, background job, embeddings or retrieval index.
- Existing user texts and corpus works keep their existing independent lifecycle; LB0 does not extend it.

**Trade-off:** no cross-device or long-term draft recovery, but it honestly remains non-durable LB0 and avoids creating a shadow personal corpus.

### B. User-scoped server draft with 24-hour TTL

- Persist typed draft plus source IDs, with deletion/export coverage and scheduled expiry; do not duplicate raw source bodies.

**Trade-off:** reload/cross-device recovery, but requires new durable schema, purge enforcement and privacy acceptance work.

### C. Persist until learner deletes

**Trade-off:** convenient library-like behavior, but crosses into durable derived artifacts/personal corpus and therefore requires S4–S7/M1 decisions; rejected for LB0.

## Proposed typed boundary

```text
LessonBuildRequest = {
  sourceRefs: SourceRef[1..3],
  selections: SourceWindow[1..3],
  goal: string,
  explanationLanguage: "ru" | "en" | "he",
  approximateLevel: "A1" | "A2" | "B1" | "B2" | "unknown",
  durationMinutes: 10 | 20 | 30,
  focus: "reading" | "vocabulary" | "grammar" | "writing" | "dialogue"
}

LessonDraft = {
  id: ephemeral UUID,
  status: "draft" | "active" | "discarded",
  sourceRefs: SourceRef[1..3],
  objective: string,
  sections: SourceLinkedSection[],
  exercises: ExerciseSpec[],
  candidateVocabulary: CandidateFact[],
  candidateConstructs: CandidateFact[],
  unresolved: NonAuthoritativeCandidate[],
  resolverVersion: string,
  modelVersion: string | null,
  policyVersion: "lesson-builder-lb0-v1",
  expiresAt: ISO timestamp
}
```

`SourceRef`, source locators, resolver facts and provenance are immutable in the editor. Learner-authored prose and LLM-authored phrasing are editable. Any later conversion of a candidate into a card/review target is outside LB0 and requires a separate explicit action and slice.

## Deterministic, LLM and authority boundary

- **Deterministic controller:** principal/source authorization, source-window retrieval, limits, tokenization, resolver/keying facts, ambiguity, coverage, available review targets, schema validation, provenance and expiry.
- **LLM:** sequences sections, phrases explanations and proposes exercises using only supplied facts. It cannot introduce authoritative morphology or hidden source material.
- **Evaluator:** none in LB0. Free output is not graded.
- **Autonomy:** A0/A1 bounded request-response only. No background build, autonomous publication or proactive action.
- **Learner-state authority:** none. No write to `review_log`, FSRS, projections, mastery, learner memory or automatic cards.

## Consent, privacy, rights, trust and cost

- User texts require the existing authenticated ownership/access and the applicable agent text-reading consent before any text is sent to an external LLM.
- Public-domain corpus material retains corpus attribution. Personal text and corpus text must not be mixed into logs.
- Operational telemetry is content-free: counts, source classes, sizes, latency, policy/model versions, failure classes and status transitions only.
- Prompt-injection text is data. It cannot modify system policy, tools or requested output schema.
- Cost class: one bounded deterministic preparation plus one reserved LLM call per generated draft. Editing and source navigation do not spend another call; explicit regenerate does.
- Trust wording must say “draft”, “candidate” and “resolver could not determine” where applicable, never “mastered”, “correct” or “personalized curriculum”.

## Dependencies, flag and rollback

- Reuse authenticated user-text/corpus resolvers, `keyingService`, learner-graph read paths, LLM budget gate and ru/en/he infrastructure.
- Feature flag: `LESSON_BUILDER_LB0_ENABLED`, default off until acceptance is complete.
- Rollback disables entry points and build API. With recommended ephemeral retention there is no schema rollback or orphan cleanup.

## Acceptance and independent oracle

- Independent fixture matrix validates limits, source authorization, source-window integrity, provenance, ambiguity and candidate-load caps without importing the LLM composer.
- Contract fixture validates LLM output against a strict typed schema and rejects unknown source IDs, unsupported facts, excess items and missing return-to-source anchors.
- Prove no `review_log`, FSRS, mastery, card, learner-memory or durable source/draft mutation.
- Prove LLM-disabled and budget-exhausted honest fallback; no half-published lesson.
- Prove prompt-injection resistance and no content in logs/errors/telemetry.
- Prove user isolation, consent revoke, export/delete non-regression and source deletion/disappearance handling.
- Prove ru/en/he, RTL, keyboard editing, screen-reader names and 380×844 layout with a route back to source.
- Run API, auth, log-hygiene, i18n and existing agent/review regression gates.

## Five primary failure modes

1. **LLM invents linguistic truth.** Shield: resolver fact allowlist plus strict post-generation schema/provenance validation.
2. **A lesson mutates mastery/cards implicitly.** Shield: read-only learner dependencies and structural no-writer tests.
3. **Private/copyrighted text leaks or becomes a shadow corpus.** Shield: explicit source authorization, no content logs, no copied durable source, ephemeral draft.
4. **Oversized or overloaded lesson harms usability.** Shield: hard source/window/new-item/exercise caps and no silent truncation.
5. **Learner cannot distinguish draft from evaluated curriculum.** Shield: draft/candidate labels, explicit Start action, editable prose and source-return anchors.

## Adversarial R1–R17 critique

- **R1/R10/R11:** linguistic facts and eligible review targets are deterministic and versioned; LLM prose is not evidence or mastery.
- **R2/R4/R5:** bounded new-item load, duration envelope, reading-first section and mobile return-to-source protect pedagogy and UX.
- **R3/R6/R12/R13/R14:** one controller owns typed preparation; stable source IDs and immutable locators prevent dual truth and cross-user mixing.
- **R7/R8/R9:** consent, rights classes, content-free logs, LLM budget, feature flag and honest fallback bound operational risk.
- **R15/R16/R17:** no new durable personal corpus, no automatic state mutation, visible provenance and explicit learner activation preserve privacy and authority.

## Owner gate

Implementation may start only after the owner selects one option for each boundary:

1. eligible source types: A / B / C;
2. edit and activation point: A / B / C;
3. limits: A / B / C;
4. retention: A / B / C.

Recommended coherent bundle: **1A + 2A + 3A + 4A**.

## Approved owner decision and durable-library transition

The owner approved **1A + 2A + 3A + 4A** on 2026-07-15 and required the
implementation to anticipate the later mode “retain until the learner deletes”
without pretending that LB0 already provides a durable personal library.

LB0 therefore freezes a storage-independent typed artifact contract now:

- stable draft/artifact ID and stable source references;
- explicit `schemaVersion`, `policyVersion`, `createdAt`, `expiresAt` and status;
- source text remains outside the lesson artifact; the artifact carries locators
  and provenance rather than copied source bodies;
- the UI talks to a small lesson-artifact store interface, whose LB0 adapter is
  browser-session storage with a 24-hour expiry;
- no server schema, background job, embedding or retrieval-index dependency is
  allowed in the LB0 adapter.

Replacing that adapter with “retain until delete” is a later **M1 durable derived
artifact/personal-library slice**, not an LB0 flag flip. Before it may ship, the
owner must approve and the implementation must prove:

1. S4 durable job/outbox and crash-recovery lifecycle where background work exists;
2. S5 database/object-storage/index scale decision at 20/100/1,000/10,000 active users;
3. S6 rights-aware source revision, supersession and deletion lineage;
4. S7 tenant isolation, quota, budget, purge, audit and accountable ownership;
5. user-visible list/open/delete controls plus export/delete completeness;
6. source deletion cascade or explicit orphan/snapshot policy;
7. backup/restore, retention enforcement, zero-reference audit and cross-user negative tests.

This preserves a forward-compatible artifact shape while preventing premature
durability, dual-write or a shadow corpus in LB0.

## Implementation result

- One to three existing personal/public-domain sources are selected by stable identifiers and explicit row windows.
- Server policy enforces 500–4,000 characters per source, 8,000 total, 10/20/30-minute load caps and no silent truncation.
- Deterministic preparation supplies resolver versions, coverage, review-target overlap, candidate vocabulary and unresolved/ambiguous facts.
- The LLM produces only schema-validated objective/section/exercise phrasing; invalid, unavailable or over-budget output degrades to a deterministic reading-first draft.
- The shared `lesson-artifact` contract validates server output and backs the UI with a replaceable `session-ttl` store adapter.
- Draft prose is editable; source references and deterministic facts are not. “Start lesson” is a separate explicit activation and does not write learner truth.
- ru/en/he, RTL strings and a 380px single-column layout are included. Automated browser control was unavailable in the implementation session, so an interactive 380×844 screenshot check remains a manual release check rather than a claimed automated pass.
- Independent LB0 gate: 34/34, plus i18n 226/226, auth 29/29, API, log hygiene, agent/provider/keying and Studio regressions.

## Production hardening after owner smoke-check — 2026-07-16

Kapture reproduced the live `LESSON_BUILD_FAILED` response and isolated a
contract mismatch: `learnerGraphRepo.getKnownWords()` returns an item-keyed
object, while the builder and its smoke fixture assumed an array. The builder
now accepts the repository's real shape, and the fixture deliberately mirrors
production so this regression cannot be hidden by a convenient stub.

The same hardening pass resolves the owner-observed usability gaps:

- the source browser has explicit All / My texts / Corpus scopes and preserves
  provenance rather than presenting an opaque mixed list;
- both search results and selected-source cards show sentence counts;
- range selection uses human 1-based From/To values, live “N–M of total”
  feedback and Beginning/Middle/End/Whole/Custom presets;
- the primary learning goal is selected from stable typed presets, with a
  bounded custom-goal escape hatch;
- focus is a typed multi-selection: up to two areas for 10 minutes and up to
  three for 20/30 minutes; source reading remains the mandatory anchor;
- strict composition validation requires an exercise for every chosen focus;
  deterministic degradation remains useful and focus-complete;
- the build action is unavailable until a source is selected, and internal
  exception text is no longer returned to the browser.

This remains LB0: the premium setup experience does not introduce durable
storage, automatic cards, mastery writes, hidden source expansion or background
autonomy. The approved M1 durable-library transition above is unchanged.
