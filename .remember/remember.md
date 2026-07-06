# Handoff

## State
CLG-P6 слайс 1 (`/plan`) SHIPPED + live-verified on owner's real profile (v3.11.108,
be4ff4c). Skeleton (agent/{runtime,tools,llm,planner}.js) + tool router + cost ledger
+ `/plan` scenario + UI button in ☁-modal. Hardened after live testing: pid→lemma
resolve (db/keyingService.js), LLM quality filter, retry-on-503/429, second provider
OpenRouter (nvidia/nemotron-3-super:free, needs reasoning:{enabled:false}). Confirmed
live: llm_used:true, clean Russian text, key_source:agent. Canon §9/§15 + memory
project_ai_mentor_cloud_graph.md fully updated. Working tree clean, all pushed to main.

## Next
1. CLG-P6 слайс 2 — `/explain sentence` (canon §9 "принятый план" 4.7).
2. **FIRST: privacy decision, not code** — db/learnerArtifactsRepo.js is opaque by
   design (server never parses text content); /explain requires the server to start
   parsing artifact payload_json to extract a sentence. Current class-B consent copy
   only promises "available on other devices" — says nothing about content reaching
   an LLM prompt. Ask the owner whether a new/extended consent is needed before
   wiring `get_sentence_context_if_available` (currently `disabled:
   OPAQUE_ARTIFACT_STORE` in agent/tools.js).
3. Then: sentence lookup by text_key+order_index, facts_used provenance per §7,
   write to agent_explanations via existing create_explanation tool.

## Context
- Gates: smoke:agent-plan (26/26), smoke:agent-llm-provider (18/18), smoke:server-keying
  (24/24) — all mock-based, no real network/keys needed.
- Google key gotcha: aistudio.google.com for Gemini keys, NOT console.cloud.google.com
  Agent Platform Studio (403s). See memory reference_google_api_key_consoles.md.
- OpenRouter free tier: 50 req/day, 20/min account-wide (not per-model).
