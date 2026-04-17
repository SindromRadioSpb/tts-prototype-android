
# Search / Hebrew Normalization Contract (Project)

## Scope / Trigger
Skill обязателен, если изменяются:
- любой код поиска (SQL/эндпойнты/функции поиска)
- public/** (поисковая UI-логика)
- server.js (поисковые API)
- db/** (queries для поиска)
- migrations/** (добавление hebrew_norm, индексов, FTS)
- любые файлы, содержащие: "search", "snippet", "highlight", "normalize", "hebrew_norm", "fts"

## Required Reading (must follow)
1) docs/CONTRACTS_SEARCH.md
2) docs/SMOKE-CHECK.md
3) docs/DB_SCHEMA.md (раздел Search index)
4) docs/ROADMAP_PREMIUM.md (раздел P2)

## Non-negotiable Invariants
1) Matching выполняется по norm_text vs query_norm.
2) Нормализация иврита обязана соответствовать правилам v1:
   - удаление никууда
   - нормализация конечных форм
   - нормализация разделителей
   - сжатие пробелов
3) Результат поиска обязан возвращать:
   - snippet (обязателен)
   - highlight (обязателен)
4) Auto language detect должен быть детерминированным и иметь fallback.

## Data / DB Requirements
Если вводится/используется hebrew_norm:
1) Должно быть ясно где он хранится (колонка или search_index).
2) Должен существовать индекс или FTS; иначе требуется явный комментарий о деградации.
3) Любые изменения схемы — только через migrations/*.sql.

## Required Deliverables in the patch
1) Обновить CONTRACTS_SEARCH.md, если изменены:
   - правила нормализации
   - правила auto-detect
   - правила snippet/highlight
2) Добавить/обновить acceptance tests SRCH-* (минимум релевантные).
3) Добавить/обновить fixtures, если они используются для тестов нормализации.

## Verification Checklist (mandatory)
1) scripts/smoke-check.(ps1|sh)
2) Пройти acceptance tests из docs/CONTRACTS_SEARCH.md:
   - SRCH-01..SRCH-10 (минимум релевантные)
3) Perf sanity:
   - убедиться, что запросы используют индекс/FTS (если заявлено в схеме).

## Output Format (assistant must produce)
- PLAN (файлы/риски/проверки)
- Changes (список файлов)
- DB impact (миграции/индексы/нет изменений)
- Contract impact (что изменилось или “no contract change”)
- Tests run (smoke-check + SRCH tests)
- Risk assessment (low/medium/high)

