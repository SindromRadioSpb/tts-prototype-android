# Handoff

## State
CLG-P6 практически закрыт (v3.11.110): /plan + /explain sentence оба SHIPPED и
live-verified владельцем; P6.3 production hardening + P6.4 construct-id субстрат
отгружены по owner brief 2026-07-06.
- P6.3: client duplicate-tap guard (single-flight) + `smoke:agent-explain-burst` 19/19 —
  бьёт по РЕАЛЬНОМУ generateGemini-пути через preload-шим
  (scripts/premium/lib/agent-provider-shim.js, NODE_OPTIONS --require в спавнутый
  сервер): burst на последний кредит = ровно 1 provider-call; failed call освобождает
  бюджет; provider-ошибка с prompt+key внутри санитизируется; kill-switch = 0 вызовов.
- P6.4: agent/constructs.js — реестр (channel_gap ×3 + binyan ×7) + детекция;
  **construct_id назначает ТОЛЬКО сервер** (LLM видит titles); channel-gap по реальным
  каналам review_log; binyan только при утверждённом резолвером биньяне (bare-surface
  серверный резолв его почти не даёт — замерено); прошито в /plan (production_gap
  construct_ids) и /explain (ядро/ответ/facts_used/fallback).
- Гейты: agent-explain 41/41 · agent-plan 28/28 · agent-explain-burst 19/19 ·
  llm-provider 18/18 · auth 26/26 · learner-graph 14/14 · api-smoke.

## Next
1. **Owner live-verify P6.3/P6.4 на проде:** (а) слово с production-провалом →
   «🧭 План» → секция диктанта несёт construct_ids; (б) /explain предложения с
   таким словом → «Конструкция: …» в fallback/констракты в ответе; (в) дабл-тап 🤖 —
   второй запрос не уходит.
2. По owner brief дальше: НЕ включать sentence_plus_neighbors без измерений
   недостаточности sentence_only; НЕ начинать чат P7 до обкатки субстрата;
   record_review_answer держать disabled до гейтов 4.8. Кандидаты следующей фазы:
   misconception map поверх субстрата ИЛИ P7 после G-5 — решение владельца.

## Context
- Стрип-коллизия имён биньянов: без огласовок פעל = paal/pual/piel — матчить ТОЧНОЙ
  формой (BINYAN_NORM в agent/constructs.js), unknown → null.
- Ledger персистентен между бутами smoke — ассерты «до/после».
- Приватность-контракт /explain: docs/planning/AGENT_EXPLAIN_PRIVACY_DECISION_2026_07_06.md.
