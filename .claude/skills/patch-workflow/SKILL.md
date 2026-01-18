---
name: patch-workflow
description: "Стандартная разработка патчами: PLAN -> minimal diff -> smoke-check -> отчёт -> commit message."
---

# Patch Workflow (Global)

## IDE-grade pre-change investigation (обязательно)
Перед PLAN и любыми правками ассистент обязан:
1) Выполнить repo-wide разведку через инструменты Claude Code (Read/Grep/Glob/Search), чтобы найти реальные точки изменения.
2) Составить короткий "Code Map":
   - entry points (DOMContentLoaded/hashchange/handlers)
   - state storage (sessionStorage/localStorage ключи)
   - handlers (open/close/back/jump/resolve)
   - UI hooks (кнопки/компоненты)
3) Записать IDE evidence:
   - какие паттерны искались
   - какие файлы/блоки найдены

Guardrail больших файлов:
- запрещено делать Read(public/index.html) целиком;
- использовать Search(output_mode=content) вокруг совпадений.

## Алгоритм
1) Сформулируй цель патча одной фразой.
2) IDE evidence (обязательно, 3–10 строк):
   - какие Search/Grep/Glob выполнены
   - какие файлы/блоки подтверждают выбор мест изменения
   - краткий Code Map (entry/state/handlers/UI hooks)
3) PLAN (3–7 пунктов):
   - файлы
   - риски
   - проверки
4) Реализуй изменения минимальным диффом.
5) Проверь:
   - git diff --stat
   - smoke-check проекта (если есть)
6) Сформируй отчёт:
   - изменённые файлы
   - что сделано
   - как проверено
7) Предложи commit message вида: PATCH-XX: <кратко>.

## Запрещено
- расширять объём работ без запроса
- делать “массовый рефакторинг”
- менять форматы данных без явного указания миграции/совместимости
- писать PLAN без repo-wide разведки и IDE evidence
