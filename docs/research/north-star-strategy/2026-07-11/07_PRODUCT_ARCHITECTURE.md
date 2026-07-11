# 07 — Product architecture

**Status:** PROPOSAL · **Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6` · **Date:** 2026-07-11

## Surface map

```text
                Home: one recommended continuation
                   /            |             \
      Studio: make material  Reading Room: read  Mentor: continue/coach
                   \            |             /
                    canonical learner events
                              ↓
     evidence → FSRS projections → constructs → planner → independent grader
                              ↓
             Telegram / Mini App / future mobile adapters
```

The Mentor does not sit between user and every surface. Studio and Room remain directly usable. The Learner Graph, not the agent, is the continuity center.

## Surface contracts

| Surface | Reads | Writes | Forbidden | Handoff/continuity |
|---|---|---|---|---|
| Studio | local/content artifacts, linguistic services, relevant projection | artifact edits; explicit learning events | daily dashboard, direct projection write, silent cloud upload | “Read now” to Room; selected draft back from Mentor |
| Reading Room | artifacts/corpus, progress, due projection, anchors | progress, marks, grader-provenanced reviews | bulk authoring, intrusive training, LLM morphology | exact sentence to Mentor; next work; Studio edit |
| Mentor Home | API projections, plan/explanations/construct summary, consent/limits | plan/explanation artifacts; actions only through tools/log | free chat, direct state mutation, auto-open | launches Room/Studio/short practice with reason |
| Home | current continuation, one progress proof, degraded state | explicit CTA choice/preferences | dashboard overload, hidden state change | routes to correct surface |
| Telegram | paired scoped API, plans/due/anchors | challenge events through grader; notification prefs | raw state ownership, unbounded prompts | deep-link to Room/Mini App |
| Mini App/future mobile | scoped API session/challenges | same canonical review log | separate memory model | handoff with stable anchor; sync down to web |
| Admin/research | consented aggregate/evaluation data | curated/evaluation artifacts only | learner-state edits, tenant crossover | no learner-facing navigation now |

## Platform layers and truth

1. Content/artifacts (text, sentence anchors, corpus metadata).
2. Linguistic intelligence (niqqud, translation, form/lemma/sense/construct with provenance).
3. Audio assets/timing.
4. Append-only learner event stream — canonical observations.
5. Learner evidence model — asserted/derived/curated separated.
6. FSRS/memory projections — replayable derived cache.
7. Construct/misconception projection — limited today, never LLM assertion alone.
8. Planner — proposes bounded actions; no state mutation.
9. Independent grader — deterministic first, provenance, D1/MNAR/annul.
10. Agent orchestration — closed tools and abstention.
11. Channel adapters — identity-scoped, no second truth.
12. Analytics/evaluation, consent/lifecycle, security and cost governance across all layers.

## Home and navigation proposal

Use four conceptual destinations at most: **Today, Read, Create, Library**. Mentor is contextual presence and a panel within Today/Room, not a fifth always-on chat tab. “Today” shows one primary CTA, a one-line reason, one progress proof and “see plan” disclosure. Library lives under Read. Daily review is an action, not a destination.

At 380px RTL: one dominant action; thumb-reachable back/close; no side-by-side dense panels; explicit online/offline/cloud/consent state; stable focus and screen-reader labels; skeleton or deterministic fallback under latency; no dead-end empty states.

Never automatic: content upload, grading from non-response, LLM explanation, starting audio, enabling notifications, changing a word status, or opening Mentor. Automatic only after consent and with visible effect: local enrichment/cache, projection replay, safe due count refresh.

## Facts / proposals / unresolved / sources

**FACT:** most contracts already exist in code; Home is fragmented between Room/Mentor/MA. **INFERENCE:** a thin coordinator can expose continuity without turning the product into a dashboard. **PROPOSAL:** unify coordination without merging task surfaces. **ASSUMPTION:** users can distinguish Read from Create after one guided example. **UNRESOLVED:** whether Today improves activation versus direct Room entry. Sources: CLG recon, Mentor Home decision, Studio/Room compatibility, current modules and migrations.
