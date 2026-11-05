# Задание для Codex: курс иврита, P1 — ядро данных

Порядок работы владельца: Claude пишет план → Codex реализует → Claude принимает.

## Что сделать
Выполнить по шагам `docs/superpowers/plans/2026-11-05-hebrew-course-p1-core.md` (Task 1–5, TDD: сначала падающий тест, потом код).
Спека — `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md`; дефекты, которые нужно закрыть, — `docs/research/hebrew-course/2026-11-05-cafe-review/REVIEW.md` (H1, H3, H4, M1, M2).

## Правила
- Начать от свежего `origin/main`: `git fetch origin && git worktree add .worktrees/course-core -b feat/course-core origin/main`. Работать только там; основная папка остаётся на `main`.
- После каждой задачи — коммит и `git push origin feat/course-core`. В main не пушить: код пойдёт в main с выпуском P3.
- Не трогать `public/library.html`, `public/index.html`, `public/sw.js`, `APP_VERSION`, `CACHE_VERSION`: в P1 модули не подключаются к страницам.
- Без новых зависимостей. Регэкспы с невидимыми символами — только через `\uXXXX`.
- Если план противоречит коду или неоднозначен — выбрать вариант, ближайший к спеке, и записать его в отчёт, а не молча менять смысл теста.

## Готово, когда
- `npm test` зелёный целиком; 5 новых файлов тестов курса проходят.
- `npm run course:validate -- tests/fixtures/course/mini` → выход 0; сломанная копия → выход 1.
- Ветка `feat/course-core` запушена.

## Отчёт для приёмки
Положить `docs/research/hebrew-course/2026-11-05-p1-codex-report.md` в ветку:
- список коммитов;
- вывод `npm test` (итоговые числа) и `course:validate`;
- отступления от плана и почему;
- что осталось непроверенным.

Владелец передаёт отчёт Claude на приёмку.
