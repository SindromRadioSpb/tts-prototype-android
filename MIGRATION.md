# Week 7.5 — MIGRATION.md (Runbook)
Ветка: `multiuser-foundation`  
Цель: добавить платформенный слой (Postgres + Sessions/Auth + Groups/Invites + /healthz) поверх Week 6/7 **без правок `public/index.html`** и без регрессий Row UX / single audio pipeline.

## 0) Гарантии и ограничения (обязательные)
1) `public/index.html` не меняем на этапе Week 7.5.
2) Старые API обязаны продолжать работать:
   - `POST /api/translate-table`
   - `POST /api/tts`
   - `POST /api/export-docx`
   - `GET  /api/usage`
3) Не добавляем новых подписок на `Audio().ended/error` (плеер остаётся единым и прежним).
4) Платформа монтируется из `server.js` одной строкой: `mountPlatform(app)`.
5) Платформу можно выключить флагом `REQUIRE_AUTH=0` без правки кода.

## 1) Предусловия
- Node.js: `>= 18`
- NPM установлен (идёт вместе с Node)
- Postgres доступен локально или в Railway

## 2) Быстрый старт (локально)
### 2.1 Клонировать и перейти на ветку
```bash
git fetch --all --tags
git checkout multiuser-foundation

## 20-12-25
## “Week 7.5 merged to main”
## тэг week7-5-stable
## Railway healthz ok
