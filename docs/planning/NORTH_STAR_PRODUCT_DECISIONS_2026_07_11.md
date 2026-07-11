# North Star Product Decisions — owner packet

**Status:** DECISION REQUIRED · **Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6` · **Date:** 2026-07-11

Maximum seven decisions. Recommendations are proposals, not canon.

## D1 — Which A/B/D hierarchy?

- **Options:** Reading-first; Mentor-first; OS-first; Layered hybrid.
- **Analysis:** Reading-first is clearest but underuses continuity; Mentor-first has cold-start/category/cost risk; OS-first is abstract and broad; hybrid matches shipped asymmetry.
- **Recommendation:** Layered hybrid — A wedge/moat, B relationship, D platform/vision.
- **Consequences:** roadmap contracts follow D, acquisition message follows A, B earns permission from evidence.
- **Reversibility:** medium; positioning reversible, platform choices less so.
- **Dependencies:** none for research; D2–D7 follow.
- **Can proceed without it?** Only with reversible discovery, not product canon or UI reorganization.

## D2 — Which North Star promise?

- **Options:** (A) “Read real Hebrew and remember it”; (B) personal mentor promise; (C) all-in-one Hebrew system; (D) full sentence in strategy document.
- **Analysis:** A is clearest marketing shorthand; D preserves audience/outcome/differentiation; B/C overclaim current validation.
- **Recommendation:** adopt the full sentence in `11_STRATEGIC_RECOMMENDATION.md`; use “Read real Hebrew now—and remember what you learn from it” as ten-second copy.
- **Consequences:** prioritizes authentic material, delayed transfer and connected surfaces.
- **Reversibility:** high.
- **Dependencies:** D1, user message tests.
- **Can proceed without it?** No for onboarding/marketing changes.

## D3 — Primary first-use entry?

- **Options:** Studio; Reading Room; Mentor; Home chooser.
- **Analysis:** Studio fits urgent owned text but is blank-canvas; Room demonstrates value fastest; Mentor lacks cold-start evidence; Home chooser adds choice cost.
- **Recommendation:** default curated Reading Room fragment plus equally visible “Add my text” route; campaign deep-links may enter Studio.
- **Consequences:** requires a small curated starter set and a clean Studio→Room handoff.
- **Reversibility:** high; A/B testable.
- **Dependencies:** D6, starter content, activation instrumentation.
- **Can proceed without it?** No for a coherent activation experiment.

## D4 — Unified Home / Command Center?

- **Options:** none; full dashboard; minimal Today coordinator.
- **Analysis:** none leaves fragmented continuity; full dashboard violates mobile simplicity; minimal Today exposes one useful continuation.
- **Recommendation:** minimal Today/Home with one CTA, reason, progress proof, progressive disclosure; four destinations max.
- **Consequences:** consolidate projections/counters, do not duplicate surface operations.
- **Reversibility:** medium-high.
- **Dependencies:** D1/D5, UX proposal and 380px RTL test before implementation.
- **Can proceed without it?** Yes; direct Room remains valid, but cross-surface identity stays weaker.

## D5 — How is Mentor represented?

- **Options:** global chat tab; separate app; contextual layer only; contextual presence + optional full-screen Home.
- **Analysis:** chat invites generic behavior; separate app fragments state; contextual-only can hide plan/history; hybrid matches shipped Mentor Home and direct-action principle.
- **Recommendation:** contextual presence + optional full-screen Mentor Home; Telegram/MA are adapters.
- **Consequences:** closed tools, deep links and direct non-agent paths remain first-class.
- **Reversibility:** medium.
- **Dependencies:** D1, R17 and lifecycle gates.
- **Can proceed without it?** No for mentor expansion; existing owner-only operation can continue.

## D6 — Primary segment?

- **Options:** new immigrant; independent authentic-text learner; advanced output learner; teacher/author.
- **Analysis:** independent A2–B2 best matches mature capabilities and differentiation; immigrant is urgent secondary but needs scaffolding; output/teacher are premature.
- **Recommendation:** independent A2–B2 authentic-text learner; new immigrant/ulpan secondary.
- **Consequences:** acquisition, starter texts, terminology and metrics focus on authentic reading continuity.
- **Reversibility:** medium-high after cohort tests.
- **Dependencies:** recruitment and WTP interviews.
- **Can proceed without it?** No for market positioning or prioritized UX.

## D7 — North Star Metric?

- **Options:** confirmed contextual transfer; reading-to-recall weeks; multi-context/multimodal units; meaningful sessions.
- **Analysis:** transfer best reflects learning but is delayed/sparse; other candidates are supporting/leading metrics.
- **Recommendation:** weekly learners with ≥1 independently gradeable new-context transfer after ≥24h.
- **Consequences:** requires versioned identity, gold rubric, eligibility denominator and privacy-reviewed instrumentation.
- **Reversibility:** medium; metric history must remain interpretable.
- **Dependencies:** R3/R10/R11/R17 measurement gates.
- **Can proceed without it?** Discovery can proceed; claims, optimization and broad rollout should not.

## Decision record template

For each D1–D7 record: `ACCEPT / MODIFY / REJECT`, owner rationale, date, and affected canonical documents. Until recorded, all recommendations remain proposals.

## Facts / assumptions / unresolved / sources

**FACTS** and sources are in the research packet baseline; trade-offs in `06_HIERARCHY_OPTIONS.md`; risks in `10_ROLE_CRITIQUE.md`. **INFERENCE:** the seven decisions are coupled but remain separately reversible. **PROPOSAL:** record D1–D7 explicitly before changing canon. **ASSUMPTIONS** and **UNRESOLVED** questions are stated per packet. No implementation is authorized by this decision document.
