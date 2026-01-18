# tts-prototype-android — Project Blueprint for Claude Code

## 0) Цель репозитория
Это сервер + локальная база (SQLite) для “Программа изучение иврита (ии, голос, комп.зрение)”.
Ключевые свойства:
- стабильная схема БД через миграции
- корректная работа слоёв Library / Progress / History / Notes / Audio
- детерминированные кэши и отсутствие “мусора” в git
- устойчивые форматы экспортов (если/когда добавим DOCX/Anki)

## 1) Фактическая структура (ориентиры)
- server.js — основной сервер
- public/index.html — UI (статический)
- data/app.db — SQLite база
- db/*.js — репозитории и миграция:
  - migrate.js / migrate-cli.js / sqlite.js
  - libraryRepo.js, progressRepo.js, historyRepo.js, notesRepo.js, audioRepo.js
- migrations/*.sql — миграции схемы
- tools/step8_2-db-check.js — проверка целостности/состояния БД
- audio/, audio-cache/, gemini-cache/ — артефакты и кэши (НЕ ДОЛЖНЫ храниться в git в “чистом” состоянии)

## 2) Definition of Done (DoD) для любого PATCH
1) Минимальный дифф, без расширения объёма.
2) Если менялась БД:
   - новая миграция в migrations/
   - migrate-cli прогнан на чистой БД (или подтверждённо на копии)
   - инструменты проверки БД (tools/step8_2-db-check.js) выполнены
3) Если менялись репозитории db/*.js:
   - негативные кейсы (пустые данные, неверные параметры) не падают
4) Если менялся сервер/API:
   - ручной smoke (запуск сервера + 1-2 сценария)
5) Если менялась обработка аудио:
   - нет дубликатов/рассинхрона, кэши детерминированы
6) Всегда: scripts/smoke-check.(ps1|sh) зелёный или дан отчёт почему шаг пропущен.

## 3) Команды проекта (приоритет)
Предпочтительно использовать npm scripts, но smoke-check умеет работать и без них.
Рекомендуемые scripts (если добавите в package.json):
- npm run dev        -> запуск сервера
- npm run db:migrate -> запуск миграций (через db/migrate-cli.js)
- npm run db:check   -> node tools/step8_2-db-check.js
- npm run test       -> (если есть)
- npm run lint       -> (если есть)

## 4) Жёсткие правила (важно для этого репо)
1) Никогда не коммитить:
   - node_modules/
   - data/app.db
   - audio-cache/, gemini-cache/
   - большие *.mp3
2) Любые изменения схемы SQLite — только через migrations/*.sql
3) Валидация входов в API обязательна (в server.js и в db/*Repo.js)
4) Не менять форматы экспортов/JSON без явного PATCH и fixtures.

## 5) Рекомендуемый стиль работы (проверено на вашем workflow)
- Один PATCH = один чат
- После 15–20 итераций: /clear
- Использовать subagents:
  implementer -> изменения
  db-migrator -> миграции
  exporter -> экспорт/форматы/fixtures
  qa-reviewer -> финальное ревью
