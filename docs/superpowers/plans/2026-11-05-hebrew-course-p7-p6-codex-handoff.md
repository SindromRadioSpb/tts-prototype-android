# Задание для Codex: курс иврита, P7 (синхронизация), затем P6 (медиа через dots)

Порядок строгий: сначала P7, потом P6 — оба меняют `course-reader.js`.

## P7
Выполнить `docs/superpowers/plans/2026-11-05-hebrew-course-p7-sync.md` (Task 1–5, TDD).
- Старт: `git fetch origin && git worktree add .worktrees/course-sync -b feat/course-sync origin/main && cd .worktrees/course-sync && git merge origin/feat/course-audio`.
- Отчёт: `docs/research/hebrew-course/2026-11-05-p7-codex-report.md`.

## P6
После P7 (выпущенного или хотя бы влитого в свою ветку) выполнить `docs/superpowers/plans/2026-11-05-hebrew-course-p6-media.md` (Task 1–4).
- Старт: ветка `feat/course-media` от `origin/main`; если P7 ещё не в main — `git merge origin/feat/course-sync`.
- Task 4 Step 2 делают владелец и dots. Отчёт: `docs/research/hebrew-course/2026-11-05-p6-codex-report.md`.

## Для обоих
- Пуш ветки после каждой задачи. Выпуск в прод — только после «да» владельца; перед сборкой — место ≥ 6 ГиБ (чистка кэша сборки и старых образов разрешена владельцем).
- Без новых зависимостей; строки — через локали ru/en/he; UI — по `docs/architecture/AGENT_UI_GUIDE.md`.
- Неоднозначность плана → вариант, ближайший к спеке, запись в отчёт.

Приёмку делает Claude.
