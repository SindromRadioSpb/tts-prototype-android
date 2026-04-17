
# Analytics / Events Contract (Project)

## Scope / Trigger
Skill обязателен, если изменяются:
- любые файлы, содержащие: "events", "analytics", "time_spent", "heartbeat", "session", "cohort"
- migrations/** (таблица events, индексы, агрегаты)
- db/** (queries/репозитории по events/analytics)
- server.js (эндпойнты аналитики)
- public/** (dashboard analytics)

## Required Reading (must follow)
1) docs/CONTRACTS_ANALYTICS.md
2) docs/DB_SCHEMA.md (раздел Events + индексы)
3) docs/SMOKE-CHECK.md
4) docs/ROADMAP_PREMIUM.md (раздел P4)

## Non-negotiable Invariants
1) Событийная таблица events — источник истины для analytics.
2) Time-spent считается server-side по start/heartbeat/end, с cutoff по max_gap.
3) Payload:
   - ограничен по размеру
   - не содержит секретов и длинных текстов
4) Любые изменения event_type или payload должны быть отражены в контракте.

## Required Deliverables in the patch
1) Обновить CONTRACTS_ANALYTICS.md если меняются:
   - event schema
   - event_type перечень
   - правила расчёта time-spent
2) Обновить DB_SCHEMA.md при изменениях таблиц/индексов.
3) Добавить/обновить acceptance tests AN-*.

## Verification Checklist (mandatory)
1) scripts/smoke-check.(ps1|sh)
2) Пройти acceptance tests AN-01..AN-06 (релевантные)
3) Privacy sanity:
   - убедиться, что events payload не содержит секретов/ключей.

## Output Format (assistant must produce)
- PLAN (файлы/риски/проверки)
- Changes (список файлов)
- DB impact (миграции/индексы/нет изменений)
- Contract impact (что изменилось или “no contract change”)
- Tests run (smoke-check + AN tests)
- Risk assessment (low/medium/high)

