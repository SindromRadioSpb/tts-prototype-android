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

## Non-negotiable Invariants
1) Любой Target должен резолвиться или возвращать контролируемую ошибку NOT_FOUND (без падения UI).
2) Deep link должен быть стабильным: type+id достаточно для открытия.
3) Jump-to-sentence должен работать одинаково из Rows и Notes:
   - единый механизм Target.type=sentence или Target.type=row + anchor.sentence_id.
4) Back-to-results должен восстанавливать q/lang/filters/sort/page (контекст).

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
