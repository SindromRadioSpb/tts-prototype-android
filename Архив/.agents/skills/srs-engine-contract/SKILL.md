
# SRS Engine Contract (Project)

## Scope / Trigger
Skill обязателен, если изменяются:
- любые файлы, связанные с SRS: "srs", "review", "due", "today queue", "card"
- migrations/** (таблицы srs_cards/srs_reviews)
- db/** (репозитории/queries для SRS)
- server.js (эндпойнты SRS)
- public/** (UI Today / review)

## Required Reading (must follow)
1) docs/CONTRACTS_SRS.md
2) docs/CONTRACTS_ANALYTICS.md (event logging requirements)
3) docs/DB_SCHEMA.md (раздел SRS)
4) docs/SMOKE-CHECK.md
5) docs/ROADMAP_PREMIUM.md (раздел P3)

## Non-negotiable Invariants
1) Карточка привязана к entity_type + entity_id и уникальна.
2) Today queue: due_date <= today, исключить suspended.
3) Review rating ∈ {again, hard, good, easy}.
4) Любой review:
   - пишет в srs_reviews
   - обновляет srs_cards
   - логирует событие srs_review в events (если analytics включена)

## Required Deliverables in the patch
1) Обновить CONTRACTS_SRS.md при изменениях:
   - state model
   - scheduling rules
   - today queue sorting
2) Обновить CONTRACTS_ANALYTICS.md если меняется payload/logging.
3) Добавить/обновить acceptance tests SRS-*.

## Verification Checklist (mandatory)
1) scripts/smoke-check.(ps1|sh)
2) Пройти acceptance tests SRS-01..SRS-10 (релевантные)
3) Проверить, что review создаёт запись в events (AN-03 как минимум).

## Output Format (assistant must produce)
- PLAN (файлы/риски/проверки)
- Changes (список файлов)
- DB impact (миграции/индексы/нет изменений)
- Contract impact (что изменилось или “no contract change”)
- Tests run (smoke-check + SRS tests + events check)
- Risk assessment (low/medium/high)

