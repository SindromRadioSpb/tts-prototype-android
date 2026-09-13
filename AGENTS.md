# AGENTS.md — Codex и другие агенты

Общие постоянные правила: [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md).
Используй уже загруженную актуальную копию; подробности открывай по задаче.

Навигация по стеку и тематическим справочникам: [CLAUDE.md](CLAUDE.md).
Этот файл не требует полного чтения всех справочников или журналов перед каждой правкой.

Перед первой правкой проверь `git branch --show-current`, `git status --short`
и `git worktree list`: имя каталога не доказывает ветку. Production-исправления
начинай от актуального `origin/main` после `git fetch origin main` и проверки
`git rev-list --left-right --count HEAD...origin/main`. Если `main` занят другим
worktree, используй его; не переключай и не очищай checkout с чужими изменениями.
