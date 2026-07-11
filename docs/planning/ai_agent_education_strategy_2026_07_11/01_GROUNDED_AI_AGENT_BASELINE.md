# 01 — Grounded AI/agent baseline

**Status:** RESEARCH BASELINE · **Live commit:** `a510b1e` · **Date:** 2026-07-11

## Status reconciliation

**FACT:** the task reports v3.11.146, while live `package.json` and `CLAUDE.md` report v3.11.151. Git history from packet source `b426b1b` to recon HEAD contains only the North Star documentation commit `a510b1e`; the packet already reconciled production through v3.11.151. **INFERENCE:** the packet is a valid hypothesis baseline, but live code/tests remain authoritative.

Technical maturity scale: 0 absent; 1 prototype; 2 owner-live; 3 technically pilot-ready; 4 externally validated; 5 scalable production; 6 outcome-optimized. Educational outcome maturity is listed separately.

## Component inventory

| Component | Status / maturity | Inputs and reads | Outputs / writes | Provider/tools/fallback | Consent, provenance, limits, evaluation, failure |
|---|---|---|---|---|---|
| Planner | owner-live, technical 2; outcome 0 | due/weak projections, anchors, channel stats, constructs | bounded plan artifact; no projection write | deterministic core + optional Gemini/OpenRouter prose; LLM-less plan | principal scope, daily budgets, provenance; `smoke:agent-plan`; recommendation lift unknown |
| Explainer | owner-live 2; outcome 0 | selected sentence, resolver facts, due/weak evidence | expiring explanation artifact | resolver-backed core + LLM prose; deterministic fallback | double consent for personal text; facts_used; burst/provider gates; prose may mislead |
| Grader/reviewer | technical 3 for bounded word tasks; outcome 1 | challenge-bound expected form and answer | canonical review event or annul | deterministic only; no LLM import | D1/MNAR/provenance/idempotency; gold/review smokes; narrow construct validity |
| Selector/session composer | owner-live 2 | due projection, channel history, consented anchors | challenge candidate/state | deterministic priority ladder | bounded pool; Telegram/MA session gates; personalization effect unknown |
| Constructs | partial 1–2 | review patterns/channel gaps | derived construct IDs/summary | deterministic registry | derived, not fact; sparse-evidence false misconception risk |
| Context pack builder | partial 2 | scoped learner tools + optional sentence | in-memory minimized context | scenario-specific builder | no persisted raw context; no general versioned context envelope or injection trust labels |
| Telegram bot | owner-live 2 | paired principal, plan/due/challenge | messages, challenge events, prefs | API adapter; deep links; deterministic review | pairing + delivery consent + budgets; proactive disabled; ops/public gates open |
| Mini App | owner-live/partial 2 | signed initData/session, projections | same challenge/review canon | scoped server API | auth/replay protections and smokes; P8.6 operational proof incomplete |
| TTS/audio | shipped 3 for consumption; outcome 1 | text/SSML | cached audio/timing artifact | Google TTS + cache/degraded mode | text class and provider policy; quality/cost measured operationally, learning lift not established |
| Translation | shipped 3 | user/corpus text | derived translation/cache | Google/Gemini paths + stored/local artifacts | explicit outbound consent required; derived, not linguistic truth |
| Morphology resolver | shipped, quality-gated 3 | token, niqqud, context | lemma/root/binyan/sense evidence | offline Pealim/Dicta tiers; abstention | authoritative/provenanced; R1/R10/R11 gates; LLM forbidden as authority |
| Cloud sync / Learner Graph | owner-live 2 | append-only local/cloud events, artifacts under consent | server log and replayable projections | repos, identity and sync APIs | principal-derived user ID, isolation/lifecycle gates; external multi-profile proof incomplete |
| Nudges/notifications | code shipped, disabled 1–2 | due + cross-surface activity + prefs | ledger/message | deterministic scheduler/backoff | daily cross-channel budget, opt-out; fatigue/outcome unknown |
| Mentor Home | owner-live 2 | plan/explain/construct projections | optional action launch | API-only module + deterministic fallback | no forced open; technical smokes; activation/outcome unvalidated |
| Content/artifacts | shipped/partial 3 | BYOK/corpus/enrichment | local/cloud consented artifacts | OPFS + cloud artifact repo | artifact truth separate from events; curation/difficulty incomplete |
| Analytics/evaluation | partial 1 | logs, projections, smoke/gold fixtures | counters/reports | scripts and deterministic replay | no operational transfer event, cohort baseline or causal framework |

## Truth map

```text
artifact (asserted/curated)
  → linguistic evidence (resolver-asserted or derived, provenance required)
  → learner event (authoritative observation in review_log / closed telemetry)
  → projection (derived, replayable)
  → construct hypothesis (probabilistic/derived; abstain when sparse)
  → plan (advisory proposal)
  → challenge (bounded artifact)
  → grade (independent deterministic/human-verifiable)
  → new learner event (authoritative observation; annulable)
```

LLM prose is advisory at the explanation/plan/candidate layer. It never becomes morphology, learner state, grade or mastery by assertion. **UNKNOWN:** there is not yet enough data to establish curriculum quality, recommendation calibration, contextual transfer or PMF.

## Readiness conclusion

**INFERENCE:** LinguistPro is unusually strong in deterministic truth separation and cross-channel review semantics, but AI readiness is asymmetric: bounded components are owner-live; typed control-plane, evaluation and public governance are not pilot-complete. No component is maturity 4–6 educationally.
