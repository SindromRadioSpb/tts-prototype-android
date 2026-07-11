# North Star Product Strategy — 2026-07-11

**Status:** PROPOSAL / owner sign-off required
**Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6`
**Date:** 2026-07-11

## Recommendation

LinguistPro should adopt a layered hybrid:

**Reading Intelligence is the wedge and domain moat → Personal Hebrew Mentor is the evidence-grounded continuity relationship → Hebrew Operating System is the mostly invisible platform architecture and long-term umbrella.**

North Star: **LinguistPro helps independent Hebrew learners turn the real texts they want to understand into knowledge they can remember and use later, by connecting focused reading, timely practice, and guidance grounded in their own learning history.**

Primary segment: independent A2–B2 learner already attempting authentic Hebrew and using a translator/dictionary plus notes, Anki or AI chat. Primary default entry: curated Reading Room fragment, with “Add my text” as an equally visible Studio route for intent-driven acquisition.

## Product architecture decision proposal

- Studio creates and edits learning artifacts; it ends at Read now.
- Reading Room is the flagship reading/daily surface; help and retrieval remain contextual and dismissible.
- Mentor is an optional contextual layer plus full-screen Mentor Home; it is not a generic chat or state owner.
- A minimal Today/Home coordinates one recommended action, reason and progress proof; maximum four destinations: Today, Read, Create, Library.
- Canonical learner observations are append-only events. FSRS, constructs and plans are projections/artifacts. Grader remains independent and deterministic-first. All channels are adapters to the same scoped graph.

## Strategic horizons

### NOW

Approve D1–D7; define and gold-validate contextual-transfer semantics; instrument baseline; complete P8.6 operational/lifecycle gates; align public privacy copy; propose/test the simple entry and Today coordination before UI implementation.

### NEXT

Strengthen curated graded progression and cross-text recommendations; cautiously expand construct/misconception evidence; test reason-aware nudges under a single budget; measure whether Mentor increases transfer versus deterministic next-due control.

### LATER

Productive speaking/writing after safe grading; personal curriculum engine; teacher/author workflows; native mobile shell; deeper integrations.

### NOT NOW

OS-first marketing, generic AI chat, complete beginner curriculum, certification, social feed, broad teacher dashboard, unbounded free-writing grade, automatic cloud upload.

### STOP / MERGE / SIMPLIFY

Stop reading historical roadmaps as current truth. Merge duplicate plans/counters into shared projections and a single Today CTA. Simplify SRS/card language under the authentic-reading loop. Keep Anki as companion/import-export, never a competing memory canon. Opportunity cost: each standalone dashboard or modality delays proof that the core reading→transfer loop works.

## Measurement

Recommended NSM: **weekly learners with at least one independently gradeable transfer in a new context after at least 24 hours**. Supporting outcome, product-health and guardrail metrics are specified in `docs/research/north-star-strategy/2026-07-11/09_METRICS_AND_EVALUATION.md`.

## Facts, inferences, assumptions, unresolved questions

- **FACT:** Reading/FSRS/morphology are production mature; CLG/Mentor/Telegram/MA are substantially shipped owner-live; public ops and outcome validation are incomplete.
- **INFERENCE:** reading-led acquisition with mentor continuity is clearer and safer than mentor-first or OS-first positioning.
- **PROPOSAL:** all strategic choices above.
- **ASSUMPTION:** authentic-reading learners are reachable, frequent and willing to pay for reduced tool fragmentation.
- **UNRESOLVED:** external activation/retention, WTP, consent acceptance, cost ceiling, curation quality and transfer rubric reliability.

## Sources

Full provenance and source classification: `docs/research/north-star-strategy/2026-07-11/README.md` and `01_CURRENT_PRODUCT_BASELINE.md`. Full recommendation: `11_STRATEGIC_RECOMMENDATION.md`. This document does not authorize implementation.
