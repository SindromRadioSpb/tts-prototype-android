# Команды и production-навигация

Перенесено из CLAUDE.md 2026-09-13. Открывай команды для нужной проверки, production-раздел — только при подготовке или проверке разрешённого релиза. Описание инфраструктуры является снимком; живое состояние нужно проверять перед операцией.

## Ключевые команды (npm)
```
npm start                # node server.js
npm run start:all        # scripts/start_all.ps1 (всё окружение)
npm test                 # scripts/test-unit.js: все tests/*.test.* рекурсивно, изолированное хранилище
npm run test:api-smoke           # smoke API
npm run test:tts-browser-smoke   # smoke TTS в браузере
npm run db:migrate / db:backup / db:restore / db:integrity
npm run build:morphology[:basic|:full]   # сборка морфологии
npm run smoke:morph / smoke:quiz / smoke:crosstext  # доменные smoke-наборы
npm run smoke:reader-morph        # Зал: морфология-на-тапе (honesty/homograph-gate)
npm run smoke:reader-morph:audit  # Зал: precision-аудит резолвера vs Dicta-silver (R10 measure-before-code)
npm run smoke:ingest              # Студия: инжест-эндпоинты (SSRF-guard/валидация, детерминированный офлайн-гейт)
npm run smoke:studio-chunks       # Студия: чанк-таблица + тайминг караоке (10 сценариев, fault-инъекция)
npm run smoke:text-card           # Экспорт/импорт карточки text-card-v1/v2 (33 проверки против живой БД)
npm run smoke:ingest-slice-live   # ЖИВОЙ гейт длинного ASR (--file=<mp3> [--subs=<эталон>] [--dry]); ключ INGEST_SMOKE_GEMINI_KEY
npm run pwa:icons                # генерация PWA-иконок
npm run tts:models:check         # проверка TTS-моделей/чексумм
```


## Продакшн-деплой

**URL:** `https://linguistpro.kolosei.com`\
**Инфраструктура:** Hetzner CX23 (4 vCPU / 8 GB RAM, Falkenstein DE), Coolify, Traefik + Let's Encrypt\
**Деплой:** git push в `main` → GitHub webhook → Coolify автосборка Docker (Dockerfile в корне)\
**Данные:** Docker volume `<DOCKER_VOLUME>` → `/app/data` в контейнере\
**Бэкап:** `<BACKUP_SCRIPT>` → `<BACKUP_DIR>` ежедневно в 03:00 UTC (14 дней)\
**Мониторинг:** UptimeRobot → `https://linguistpro.kolosei.com/healthz`, алерты на `<OWNER_EMAIL>`\
**Ресурсы контейнера:** CPU 1.5 cores, RAM hard limit 1536 MB\
**SSH:** `ssh -i ~/.ssh/<SSH_KEY> <SSH_USER>@<PROD_IP>`\
**Coolify UI:** `http://<PROD_IP>:8000` — ⚠ ограничить VPN/allowlist + HTTPS\

> 🔒 Конкретные координаты прод-хоста (IP, SSH-ключ, имя volume, slug, admin-URL) — в `.claude/PROD_OPS_PRIVATE.md` (gitignored, не публикуется).\

> ⚠ Данные пользователей (библиотека, прогресс) хранятся в браузере (OPFS), не на сервере.\
> На сервере только research-когорты (`/app/data/research/`) и TTS audio-кэш (`/app/data/audio/`).
