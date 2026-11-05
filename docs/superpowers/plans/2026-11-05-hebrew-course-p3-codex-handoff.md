# Задание для Codex: курс иврита, P3 — урок в Зале

Выполнить `docs/superpowers/plans/2026-11-05-hebrew-course-p3-room.md` (Task 1–9, TDD). Опора — ваш отчёт разведки `docs/research/hebrew-course/2026-11-05-p3-recon.md`.

- Старт: `git fetch origin && git worktree add .worktrees/course-room -b feat/course-room origin/main && cd .worktrees/course-room && git merge origin/feat/course-evidence` (включает P1 и P2).
- Пуш `feat/course-room` после каждой задачи. В main не пушить, **в прод не выпускать**. Без новых зависимостей.
- Правила UI — `docs/architecture/AGENT_UI_GUIDE.md`; строки — только через локали `ru/en/he`.
- Неоднозначность → вариант, ближайший к спеке, запись в отчёт.
- Готово: `npm test` зелёный, smoke Task 9 пройден, отчёт `docs/research/hebrew-course/2026-11-05-p3-codex-report.md` и скриншоты в ветке.

Приёмку и решение о выпуске делают Claude и владелец.
