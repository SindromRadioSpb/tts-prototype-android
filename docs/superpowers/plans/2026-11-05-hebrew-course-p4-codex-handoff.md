# Задание для Codex: курс иврита, P4 — звук урока

**Начинать после выпуска P3** (отчёт `docs/research/hebrew-course/2026-11-05-p3-release.md` в main).

Выполнить `docs/superpowers/plans/2026-11-05-hebrew-course-p4-audio.md`: Task 1–4 — TDD, Task 5 — пилот с владельцем.

- Старт: `git fetch origin && git worktree add .worktrees/course-audio -b feat/course-audio origin/main`.
- Пуш `feat/course-audio` после каждой задачи. Страницы и версии не трогать.
- Синтез (Task 5) — только голоса WaveNet C/D и только текст с огласовками. Учётные данные Google — из окружения, никогда в файлы и отчёты. Аудио — только в локальное распознавание.
- Task 5: Step 3 делает владелец (прослушивание), Step 4 — только с его «да».
- Готово: `npm test` зелёный, отчёт `docs/research/hebrew-course/2026-11-05-p4-codex-report.md` (ветка; итог Task 5 — в main с `[skip cd]`).

Приёмку делает Claude.
