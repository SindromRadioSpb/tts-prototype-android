# 03 — Educational opportunity map

**Status:** PROPOSAL · **Date:** 2026-07-11

## Opportunity matrix

| Problem / current workaround | AI advantage | Non-AI alternative | Educational/product effect and evidence | Complexity/risk | Recommendation |
|---|---|---|---|---|---|
| Learner does not know next action; checks due list manually | synthesize context/channel/goal and explain why | FSRS due + weakest-channel deterministic rank | possible action/transfer lift; unproven | M; false personalization | NOW shadow, then RCT |
| Help is fixed; learner toggles aids | recommend smallest scaffold and later fade | manual fixed modes | autonomy and unsupported comprehension; scaffolding evidence mixed | M; hint dependency | NEXT, preview + undo |
| Explanation requires switching to chat | grounded sentence-specific explanation | resolver/gloss panel | faster comprehension/application | M; hallucination | NOW bounded, independent probe |
| Morphology/syntax confusion | translate resolver facts into teachable contrast | authoritative morphology card | Hebrew-specific value | M; LLM fact invention | NOW only above resolver |
| Repeated errors are hard to interpret | cluster cross-context signatures | threshold rules/review queue | targeted practice; construct validity unknown | H | NEXT shadow; abstain |
| Next text chosen by browsing | combine interest, comprehensibility, recurrence | curated shelves + deterministic coverage | reading continuation/transfer | M–H | NEXT after curation metrics |
| Retrieval context becomes stale | select novel construct-matched context | deterministic corpus query | closest path to transfer | H | NOW design; NEXT pilot |
| Listening practice is disconnected | choose TTS/listening mode and targeted items | deterministic dictate queue | channel breadth | M cost | NEXT bounded |
| Pronunciation/speaking feedback | multimodal ASR/advisory feedback | tutor/human rubric | access/fluency hypothesis | H grading/bias | RESEARCH ONLY |
| Free writing feedback | contextual feedback candidates | checklist/human review | productive practice hypothesis | H construct validity | LATER, no certification |
| Photo/document friction | OCR and segment candidate text | manual paste | accessibility/urgent JTBD | M privacy | NEXT opt-in local-first |
| Conversation becomes disposable | extract candidate learning artifact | manual save | preserves meaningful context | H privacy/accuracy | LATER opt-in |
| Cold start lacks evidence | bounded diagnostic and curated starter | level/self-goal selection | faster fit | M false precision | NOW minimal deterministic-first |
| Return after gap is overwhelming | summarize state and offer one gentle action | due cap/reset controls | reactivation | L–M | NOW deterministic + optional prose |
| Modality choice is repetitive | recommend based on evidence and preferences | manual picker | flexibility | M accessibility | NEXT; override always |

## Learner-facing portfolio details

| Capability | Mechanism / learner / minimum evidence | User + deterministic role | AI role / expected improvement | Evaluation / risk | Prerequisite, cost, horizon |
|---|---|---|---|---|---|
| Planner/session composer | retrieval + interleaving, A2–B2; ≥3 eligible due plus channel stats | choose length/mode; FSRS controls eligibility/time | rank bounded candidates and explain | transfer per 30 min vs deterministic; cold-start bias | transfer contract, low–M, NOW |
| Scaffold controller | contingent support/fading; ≥2 unsupported and supported observations per aid | manual default/undo; rule caps | suggest aid/hint transition | delayed no-hint comprehension; hint/reading displacement | hint ledger, M, NEXT |
| Context explainer/tutor | elaboration/noticing; exact sentence + resolver provenance | request/close/alternative; resolver asserts facts | concise contrast/examples | apply in new sentence; hallucination | typed context, M, NOW |
| Misconception detector | error-pattern discrimination; ≥2–3 independent contexts | reject/correct label; threshold/decay | cluster/advisory hypothesis | human gold, calibration; false diagnosis | construct graph, H, NEXT |
| Curriculum/next text | comprehensible input + recurrence; goals, reading history, curated metadata | select/skip; deterministic filters | candidate ranking/path rationale | completion + transfer vs shelf baseline | difficulty/curation, H, NEXT/LATER |
| Cross-text transfer planner | varied retrieval; source + eligible novel probe | show reason/skip; strict novelty/grade rules | propose candidate contexts | 7/21-day independent transfer | transfer registry, H, NOW design |
| Listening coach | modality retrieval; receptive evidence + audio asset | speed/replay/transcript; deterministic item/grade | choose contrast/sequence | delayed listening recognition | audio ledger, M, NEXT |
| Speaking/role-play/writing | generation + output practice; sufficient receptive base | topic/length/stop; deterministic safety | simulate/feedback only | human-calibrated rubric, no self-grade | independent eval, high, RESEARCH/LATER |
| OCR/conversation artifact | meaningful-input capture; explicit user action | confirm/redact/edit; local OCR preferred | bounded extraction/segmentation | extraction gold + privacy | data-class pipeline, M, NEXT/LATER |
| Reflection/accessibility/multilingual | metacognition and access | user preference is authoritative | summarize evidence/suggest alternatives | agency/a11y task success | preference contract, low–M, NEXT |

## Priorities and anti-goals

- **NOW:** deterministic due control; grounded explanation; transfer schema/probes; cold-start two-lane entry; manual mode.
- **NEXT:** scaffold recommendations, next-text/cross-text ranking, listening and conservative misconception shadowing.
- **LATER:** curriculum orchestration, constrained writing and professional packs.
- **RESEARCH ONLY:** pronunciation scoring, controlled role-play and multi-agent pedagogical orchestration.
- **DO NOT BUILD:** generic chat, hidden personalization, unified mastery score, mental-state inference, non-response grading, unlimited exercises, LLM morphology/self-grading, speaking/writing certification.
