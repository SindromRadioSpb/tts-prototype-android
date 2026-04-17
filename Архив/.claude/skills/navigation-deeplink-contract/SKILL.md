---
name: navigation-deeplink-contract
description: Premium Navigation governance — deep links, back-to-results, jump-to-sentence. Требует соблюдения docs/CONTRACTS_NAVIGATION.md и docs/SMOKE-CHECK.md.
---

# Navigation / Deep Link Contract (Project)

## Scope / Trigger
Этот skill обязателен, если изменяются файлы:
- public/**
- server.js
- любые файлы, содержащие: "deeplink", "nav", "navigation", "back to results", "jump", "anchor", "resolveTarget"
- любые API-роуты, которые открывают row/sentence/note по id

## Required Reading (must follow)
1) docs/CONTRACTS_NAVIGATION.md
2) docs/SMOKE-CHECK.md
3) docs/ROADMAP_PREMIUM.md (раздел P1)
4) docs/DB_SCHEMA.md (раздел IDs / navigation)

### Strict pre-flight (non-negotiable)
Перед тем как писать PLAN или предлагать изменения:
1) ОБЯЗАТЕЛЬНО выполнить Read(docs/CONTRACTS_NAVIGATION.md).
2) Явно перечислить (с указанием секций):
   - инварианты из секции 3.2
   - acceptance tests NAV-01..NAV-07
3) Если Read(docs/CONTRACTS_NAVIGATION.md) не выполнен — НЕ продолжать (остановиться и запросить доступ/уточнение).

## Non-negotiable Invariants
1) Любой Target должен резолвиться или возвращать контролируемую ошибку NOT_FOUND (без падения UI).
2) Deep link должен быть стабильным: type+id достаточно для открытия.
3) Jump-to-sentence должен работать одинаково из Rows и Notes:
   - единый механизм Target.type=sentence или Target.type=row + anchor.sentence_id.
4) Back-to-results должен восстанавливать q/lang/filters/sort/page (контекст).

## Large-file guardrail (mandatory)
Запрещено читать целиком большие файлы UI, особенно:
- public/index.html

Вместо этого:
1) Использовать только Search/Grep по конкретным паттернам (nav/deeplink/back.*results/jump/anchor/resolveTarget).
2) Если нужен контекст, получать его точечно через Search (output_mode=content) вокруг найденных совпадений.
3) PLAN должен ссылаться на найденные блоки/функции (по именам/паттернам), а не требовать полного Read файла.

## IDE-grade code intelligence (mandatory)
Цель: использовать возможности Claude Code на уровне IDE (repo-wide analysis), а не “угадывать”.

Перед PLAN выполнить разведку кода через инструменты Claude Code:
1) Repo-wide Search по JS/TS (не через Bash grep), минимум по наборам паттернов:
   - deeplink|deep link|hashchange|location.hash|base64|encode|decode
   - back.*result|back.*match|nav_stack|history|sessionStorage|scrollRestore
   - resolveTarget|Target|Context|anchor|jump|sentence_id
2) На основе результатов составить "Code Map":
   - entry points (DOMContentLoaded / hashchange / router)
   - state storage (sessionStorage/localStorage keys, структура nav/search session)
   - handlers (какие функции делают open/close/back/jump)
   - UI hooks (где кнопки/компоненты инициируют навигацию)
3) Для ключевых блоков разрешено Read только небольших участков/модулей;
   для больших файлов — только Search(output_mode=content) вокруг совпадений.
4) В PLAN обязательно указать:
   - какие найденные блоки/функции будут расширены
   - где будут добавлены новые функции (конкретный блок/секция, а не “где-то в файле”)
   - какие инварианты/Acceptance tests покрывает каждый этап

Запрещено:
- строить план без repo-wide Search
- ссылаться на “примерные места в коде” без evidence

## Required Deliverables in the patch
1) Обновить/подтвердить соответствие CONTRACTS_NAVIGATION.md, если:
   - изменены поля target/context
   - изменено поведение push/reset back-stack
   - изменён формат deep link
2) Добавить/обновить acceptance tests NAV-* при изменениях поведения.
3) Привязать изменения к минимальному набору сценариев (ручных) и записать, что проверено.

## Verification Checklist (mandatory)
1) Выполнить scripts/smoke-check.(ps1|sh)
2) Пройти acceptance tests из docs/CONTRACTS_NAVIGATION.md:
   - NAV-01..NAV-07 (минимум релевантные)
3) Убедиться, что “corrupt link” даёт контролируемую ошибку, а не crash.

## Output Format (assistant must produce)
- PLAN (файлы/риски/проверки)
- Changes (список файлов)
- Contract impact (что изменилось в контракте или “no contract change”)
- Tests run (smoke-check + NAV tests)
- Risk assessment (low/medium/high)
- Reading evidence (какие Read/Search были выполнены, минимум: Read(docs/CONTRACTS_NAVIGATION.md) + перечисление секций 3.2 и NAV-01..NAV-07)
- IDE evidence (обязательное):
- список выполненных Search-паттернов
- список файлов/блоков, где найдены entry points/state/handlers/UI hooks
