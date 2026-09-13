# LinguistPro — PWA и Node.js

Несмотря на имя репозитория, это PWA с Node.js-сервером (`server.js`), а не нативный Android.
Студия — `public/index.html`; Читальный зал — `public/library.html` и `public/js/library-ui.js`.

Общие постоянные правила: [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md).
Повторно используй уже прочитанный актуальный контекст.

Открывай справочники по задаче:

- [Домены, компоненты и предшественники](docs/architecture/AGENT_DOMAIN_GUIDE.md) — границы модулей, SRS, морфология, ingest, Зал.
- [Роли R1–R17](docs/PROJECT_ROLES.md) — релевантные критерии продуктовых и кодовых решений.
- [UI и CSS](docs/architecture/AGENT_UI_GUIDE.md) — видимые изменения, mobile/RTL и ловушки каскада.
- [Команды и production](docs/architecture/AGENT_OPERATIONS_GUIDE.md) — нужный тест или подготовка разрешённого релиза.
- `docs/planning/` — тематический канон; ищи по задаче, сверяй устаревшие статусы с кодом.
- `.agents/skills/` — сборка корпуса, проверенные решения, публикация готовой порции корпуса.

Исторические версии находятся в тематических документах. Перед production-операциями проверяй живую версию.
