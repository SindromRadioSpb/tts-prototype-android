# Задание для Codex: курс иврита, P2 — модель доказательств и прогресс

Выполнить `docs/superpowers/plans/2026-11-05-hebrew-course-p2-evidence.md` (Task 1–4, TDD).

- Старт: `git fetch origin && git worktree add .worktrees/course-evidence -b feat/course-evidence origin/main && cd .worktrees/course-evidence && git merge origin/feat/course-core`. P1 ещё не в main, поэтому P2 строится поверх него.
- Пуш `feat/course-evidence` после каждой задачи. В main не пушить. Страницы, `sw.js` и версии не трогать. Без новых зависимостей.
- Неоднозначность плана → выбрать вариант, ближайший к спеке, и записать в отчёт.
- Готово: `npm test` зелёный; новые тесты `courseEvidence`, `courseStore` проходят; отчёт `docs/research/hebrew-course/2026-11-05-p2-codex-report.md` в ветке.

Приёмку делает Claude.
