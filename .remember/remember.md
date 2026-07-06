# Handoff

## State
CLG-P6 закрыт функционально + начата эволюция UI наставника (owner-решение: P6.5 → P9).
- v3.11.109: /explain sentence (consent agent_read_texts + scope sentence_only,
  контракт docs/planning/AGENT_EXPLAIN_PRIVACY_DECISION_2026_07_06.md) — live-verified.
- v3.11.110: P6.3 burst-гейт real-provider пути + dup-tap guard; P6.4 construct-id
  субстрат (agent/constructs.js; id назначает ТОЛЬКО сервер).
- v3.11.111: фикс productionImbalance (D1 пишет провал диктанта как Hard(2) →
  считать again+hard) + UI-серфейс констрактов (⚙-строки в /explain-модале и плане).
- v3.11.112: кейс טוב (owner live-verify: провал в чтении И диктанте не попадал
  НИКУДА) → секция fresh_struggles ПЕРВОЙ (getRecentStruggles: ≥2 провала за 24ч
  учебного времени, prod_fails → канал; дедуп с gap/due). Re-verify владельцем ✓.
- v3.11.113: P6.5 исполняемый план — «▶ Начать» на секциях 'тренировать' →
  кросс-текстовый тренер ПО item_keys секции (общий _buildDueSourcedItems;
  пул getDueWithSource с горизонтом-в-будущее; без якорей — честный skip;
  канал через trainChannelSet) + «▶ В Зал».

## Gates
agent-plan 30/30 · agent-explain 42/42 · agent-explain-burst 19/19 (preload-шим
lib/agent-provider-shim.js) · llm-provider 18/18 · auth 26/26 · learner-graph 14/14 ·
i18n 226 · api-smoke. Всё на проде.

## Next
0. ✅ Live-verify P6.5 ПРОЙДЕН владельцем 2026-07-06 → **CLG-P6 закрыт целиком**
   (все 5 слайсов live-verified).
1. **P9 «дом наставника» — РЕШЕНИЯ ВЛАДЕЛЬЦА ПРИНЯТЫ 2026-07-06, канон =
   docs/planning/MENTOR_HOME_P9_DECISION_2026_07_06.md (READ FIRST):**
   форм-фактор = полноэкранный вид ВНУТРИ Зала (🤖 в шапке, hash #mentor, паттерн
   roomContent↔roomReader; НЕ страница/drawer — DB-teardown урок v3.11.101);
   модуль mentor-home.js API-only (без OPFS) + host-adapter действий → скелет
   Mini App P8; MVP = ВСЕ 4 блока: план+действия (переезд из ☁) · история
   объяснений (новый GET /api/agent/explanations, purge-aware) · статус/лимиты +
   consent-переезд · зачаток misconception-блока (GET /api/agent/constructs/summary
   из facts_used+plan-tasks). Никакого автооткрытия (этикет §2.3), Tier 1 — честная
   заглушка «нужен облачный аккаунт».
3. По owner brief: НЕ sentence_plus_neighbors без измерений; НЕ чат P7 до обкатки;
   record_review_answer disabled до гейтов 4.8.

## Context
- Контракт /plan семантический (category-R17/recommended_channel/item_keys/
  construct_id/constructs-titles) — P9/P8 НЕ меняют сервер, только рендереры.
- /explain bare-surface server-key может не совпасть с клиентским ключом тренировки →
  learner.weak_in_sentence пуст (известное ограничение; выравнивание — кандидат в P9).
- Биньян-имена: матчить точной формой с огласовками (стрип-коллизия פעל).
- Ledger персистентен между smoke-бутами — ассерты «до/после».
