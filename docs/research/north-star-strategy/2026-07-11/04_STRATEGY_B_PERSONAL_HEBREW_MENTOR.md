# 04 — Strategy B: Personal Hebrew Mentor

**Status:** PROPOSAL · **Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6` · **Date:** 2026-07-11

## Canvas

- **Target/problem:** returning learner with accumulated evidence who does not know the single best next action.
- **Promise:** continue the learner's unfinished loop with one explainable, bounded action grounded in their texts and history.
- **First value:** a recommendation cites the actual sentence/skill gap and launches the action directly.
- **Repeat loop:** evidence gap → plan/mission → deterministic-first response → event/projection → return to text.
- **Long-term value/moat:** increasing precision from longitudinal cross-channel evidence, not chatbot personality.
- **Dependencies:** mature Learner Graph, anchors, planner, independent grader, consent/lifecycle, budgets. Therefore it cannot be the first layer built or the only first-use surface.
- **Competitive archetype:** AI tutor/coach, differentiated by personal real-text evidence and safe grading.
- **Cost:** high build/security/evaluation; variable LLM/TTS operation; useful deterministic fallback is mandatory.
- **Success:** recommended actions are accepted, completed, and followed by delayed/contextual improvement—not message volume.
- **Kill criterion:** recommendations do not outperform a deterministic due/next-text rule, or LLM cost per meaningful outcome exceeds the product margin.

## Organic integration contract

The mentor may explain a selected Room error, continue an unfinished loop, create a short post-reading session, recommend a specific text/fragment, and state why. It must abstain when evidence/consent/confidence is insufficient. It must not directly mutate learner state, invent morphology, grade itself, duplicate Studio/Room operations, auto-open, or require chat for routine reading/import/review.

Representation: **contextual presence plus an optional full-screen Mentor Home**, not a primary global chat tab. Telegram is a continuity adapter; Mini App is a focused action surface. Direct non-agent use remains first-class.

## User loop and flywheel

`due/error/unfinished reading → one reasoned CTA → micro-action in original context → grader-provenanced event → projection/planner refresh → next text or later return`

Consumes consented projections, sentence anchors, construct ids, cost/notification budgets. Produces plan artifacts, explanations, acceptance/decline signals and graded events through the canonical log. Do not collect free-chat history as learner truth, infer mental state from non-response, or retain raw LLM context indefinitely.

## Failure modes

Generic AI chat; notification bot; random drill generator; costly prose layer; second learner-state brain. Hard gates: closed tool router; five action categories; deterministic-first grading; MNAR; provenance and annul; cross-channel daily budget; LLM-less `/plan`, due, deep links and review remain useful.

## Fact / inference / proposal

**FACT:** Mentor Home, plan/explain, deterministic grader, Telegram review and Mini App are shipped owner-live; nudges/public ops remain gated. **INFERENCE:** technical maturity exceeds market validation. **PROPOSAL:** make Mentor the relationship/continuity layer, not the acquisition wedge.

## Sources / assumptions / unresolved

AI Mentor recon; rollout handoff; Mentor Home decision; Telegram/Mini App specs; privacy decision; R12–R17. Unresolved: external trust, recommendation lift, fatigue, cost/outcome, construct validity and consent acceptance.
