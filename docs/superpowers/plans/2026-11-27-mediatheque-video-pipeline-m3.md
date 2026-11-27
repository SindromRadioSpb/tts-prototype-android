# Конвейер видео Медиатеки — М3 «Каналы» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец добавляет YouTube-каналы; сервер раз в час читает их RSS и собирает «Видео-кандидаты»; dot переводит заголовки и сам ставит в очередь до 5 видео в день до 2 часов; владелец ставит любое кандидат-видео в очередь одной кнопкой.

**Architecture:** Новый модуль `mediaqueue/mediaChannelsRepo.js` (каналы, разбор RSS, кандидаты, перевод) рядом с очередью М1/М2. Выбор dot — это `enqueue` с `source:'dot'`, дневной квотой по израильскому дню и низким приоритетом; предел 2 часа проверяет сервер на шаге метаданных ПК. Новые маршруты в `mediaQueueRoutes.js`, опрос — `setInterval` в server.js, интерфейс — вкладки в диалоге «Видео: очередь».

**Tech Stack:** Node/express, sqlite3, `node:test`, UMD-модуль интерфейса, локали ru/en/he.

**Spec:** `docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md` (§5.2, §5.6, §7 п.3).

## Global Constraints

- Замер 2026-11-27 (задача 0 спека выполнена до плана): RSS `youtube.com/feeds/videos.xml?channel_id=…` с прода — 3/3 ответа 200, 15 записей, как с ПК; страница `youtube.com/@имя` с прода отдаёт `<link rel="canonical" href="…/channel/UC…">`. Запасной маршрут через ПК в М3 не строится.
- Канал добавляется без отметки прав; основание прав пишет уже существующая публикация М2.
- dot: до 5 выборов в израильский день (`Asia/Jerusalem`), каждое видео до 2 часов (7200 с). Заказы владельца — без дневного лимита, приоритет выше, длина не ограничена.
- Кандидаты — видео за 7 дней по `published`; Shorts (`/shorts/` в ссылке записи) не берутся.
- Один ключ dot `lpne_`; ключ ПК `lpr_` к каналам доступа не получает.
- Все строки через локали ru/en/he; правка локали → `?v=` везде + `node tests/i18n.smoke.js --write-lock`; CACHE_VERSION + APP_VERSION + футер Зала вместе.
- Выпуск — один полный коммит, один пуш; перед пушем df + coolify healthy + rmi предыдущего образа + builder prune.

## Review Focus

- Чужой или битый RSS (не XML, огромный ответ, сущности `&quot;`/`&#39;`, пустой канал) — канал получает ошибку, остальные каналы опрашиваются.
- dot выбирает больше квоты одним запросом или двумя параллельными — сверх 5 в день не создаётся ни одного задания.
- Выбор dot длиннее 2 часов — задание закрывается `MEDIA_TOO_LONG`, ПК не скачивает звук, место в квоте возвращается.
- Ссылка канала в разных формах (`/channel/UC…`, `/@имя`, `/@имя/videos`, `m.youtube.com`, голый `@имя`) и не-каналы (видео, плейлист, чужой домен) — первые принимаются, вторые отклоняются.
- Удаление канала не трогает уже созданные задания; кандидаты без задания исчезают.

---

### Task 1: Каналы, разбор RSS и кандидаты

**Files:**
- Create: `migrations/101_media_channels.sql`, `migrations/down/101_media_channels.sql`, `mediaqueue/mediaChannelsRepo.js`
- Modify: `tests/helpers/newsDb.cjs` (MIGRATIONS + `'101_media_channels.sql'`)
- Test: `tests/mediaChannelsRepo.test.js`

**Interfaces:**
- Produces: `parseChannelInput(s) → {channel_id}|{handle}|null`; `parseChannelFeed(xml) → {title, entries:[{video_id,title,published_at,description}]}` (Shorts отброшены); `createChannels({db, fetchText, now}) → { add({input, actorId}), list(), remove(channelId), poll({force}), candidates({days}), translate(items, editorId), get(videoId) }`; `CHANNEL_LIMITS = { MAX_CHANNELS: 50, CANDIDATE_DAYS: 7, KEEP_DAYS: 14, POLL_MS: 55*60*1000 }`.
- `fetchText(url, {maxBytes, timeoutMs}) → {status, text}`; по умолчанию `httpFetchText` (global fetch, чтение потока с обрывом на `maxBytes`, `User-Agent: Mozilla/5.0`).

Схема: `media_channels(channel_id PK, title, handle, added_by, added_at, enabled, last_polled_at, last_ok_at, last_error, fail_count)`; `media_candidates(video_id PK, channel_id, title, description, published_at, first_seen_at, title_ru, title_ru_by, title_ru_at)` + индекс `(published_at)`; `ALTER TABLE media_jobs ADD COLUMN pick_day TEXT; ADD COLUMN channel_id TEXT`.

- [ ] **Step 1: Write the failing tests** — `parseChannelInput` принимает `https://www.youtube.com/channel/UCKEImtWikw9usC1pl_9m1nQ`, `https://m.youtube.com/@c14news/videos`, `@c14news`, голый `UC…`; отклоняет `watch?v=`, `playlist?list=`, `https://example.com/@x`. `parseChannelFeed` на фикстуре из двух записей + одной Shorts → 2 записи, `&quot;` раскодирован, `title` канала из `<author><name>`. `add` по `@имя` вызывает страницу и затем RSS, сохраняет title; RSS 404 → `MEDIA_CHANNEL_NOT_FOUND`; 51-й канал → `MEDIA_CHANNELS_FULL`; повтор → `{existing:true}`. `poll` пропускает недавно опрошенные, ошибку одного канала пишет в `last_error` и опрашивает следующий; запись старше 7 дней не попадает в кандидаты. `candidates()` отдаёт `job_status`/`job_source` последнего задания видео. `translate` пишет `title_ru` (≤300 символов) только существующим кандидатам. `remove` удаляет канал и его кандидатов без заданий.
- [ ] **Step 2:** `node --test tests/mediaChannelsRepo.test.js` → FAIL (module not found).
- [ ] **Step 3:** Миграция + модуль.
- [ ] **Step 4:** тот же запуск → PASS.

### Task 2: Выбор dot в очереди, квота и предел 2 часа

**Files:**
- Modify: `mediaqueue/mediaQueueRepo.js`, `mediaqueue/homeWorkerCore.js`
- Test: `tests/mediaQueueRepo.test.js`, `tests/mediaHomeWorker.test.js`

**Interfaces:**
- Consumes: `media_candidates` (Task 1) для заголовка/канала.
- Produces: `enqueue({url, source:'dot'|'owner', actorId})` — для `dot`: приоритет 10, `pick_day` = израильская дата, квота `LIMITS.DOT_DAILY = 5` (сверх → `MEDIA_DOT_DAILY_LIMIT` 409), заголовок и канал из кандидата; `dotQuota() → {limit, used, left, day, max_duration_sec}`; `lease` отдаёт `max_duration_sec` (7200 для dot, null для владельца); `step` с `meta.duration_sec > 7200` у dot-задания → `failed_acquire` + `MEDIA_TOO_LONG` (без попытки); в квоту не входят задания с `MEDIA_TOO_LONG`; `list()` добавляет `title_ru` кандидата.
- Работник: если ответ шага метаданных вернул статус не `acquiring`, звук не скачивается, `runOnce` → `'failed'`.

- [ ] **Step 1: Failing tests** — 6 выборов dot за день: 5 заданий + 409; два параллельных `enqueue` при used=4 → ровно одно задание; на следующий израильский день квота снова 5; выбор уже поставленного владельцем видео возвращает существующее и не тратит квоту; задание владельца и dot — владелец арендуется первым; шаг с duration 7201 у dot → `failed_acquire/MEDIA_TOO_LONG`, attempts не растёт, квота освобождается; у владельца 7201 — задание продолжает; работник после такого шага не вызывает скачивание.
- [ ] **Step 2:** RED; **Step 3:** реализация (квота — проверка и вставка внутри одной `BEGIN IMMEDIATE`… или сериализация промисом в процессе); **Step 4:** GREEN.

### Task 3: Маршруты, опрос и dot-инструкция

**Files:**
- Modify: `mediaqueue/mediaQueueRoutes.js`, `ser?er.js` (блок очереди), `mediaqueue/dotTask.md`
- Test: `tests/mediaQueueRoutes.test.js`

**Interfaces:**
- Владелец (сессия + CSRF + Origin): `GET /api/media-queue/channels`, `POST /api/media-queue/channels {url}`, `POST /api/media-queue/channels/:id/remove`, `GET /api/media-queue/candidates` (+ `quota`).
- dot (`lpne_`): `GET /api/media-queue/editor/candidates` → `{candidates, quota, task}`; `POST /api/media-queue/editor/candidates {translations:[{video_id,title_ru}], picks:[video_id]}` → `{translated, picks:[{video_id, ok, job|error}]}` (≤50 переводов, ≤5 выборов за запрос).
- Ключ ПК и анонимный запрос получают 401 на всех новых маршрутах; владелец на `editor/candidates` POST → 403 `EDITOR_ONLY`.
- server.js: `mediaChannels()` лениво; `setInterval(poll, 15 мин)` (сам `poll` пропускает каналы младше 55 мин) + первый запуск через 3 мин после старта; аудит `media_channel_added|removed`, `media_dot_picked`.
- Инструкция dot: раздел «Кандидаты» — перевести новые заголовки на русский, выбрать до `quota.left` по учебной ценности (живая речь, понятная тема, 3–40 минут предпочтительно), не больше 2 часов, затем обычный цикл заданий.

- [ ] **Step 1: Failing tests** маршрутов (права, квота через HTTP, частичный ответ выборов). **Step 2:** RED. **Step 3:** реализация. **Step 4:** GREEN.

### Task 4: Интерфейс владельца

**Files:**
- Modify: `public/js/mediatheque-video-queue.js`, `public/css/mediatheque.css`, `public/i18n/locales/{ru,en,he}.js`, версии (`?v=`, sw.js, server-список, APP_VERSION, футер Зала, lock)
- Test: `tests/mediathequeVideoQueue.test.js`

**Interfaces:**
- Вкладки диалога: «Очередь · Кандидаты · Каналы». Кандидат: заголовок (dir=auto), перевод dot, канал (`<bdi>`), дата; ★ если задание от dot; кнопка «В очередь» (через `POST /api/media-queue/jobs`) или статус задания. Каналы: поле ссылки + «Добавить», строка с последним опросом/ошибкой и «Убрать». Над кандидатами: «dot сегодня: N из 5».
- Экспорт: `candidateRowHtml(c, ctx)`, `channelRowHtml(ch, ctx)`.

- [ ] **Step 1: Failing tests** разметки (★ у выбора dot, кнопка только без задания, экранирование заголовка, ошибка канала видна). **Step 2–4.** Живая проверка в браузере на локальном сервере (`shots.js`), телефон 390 px и RTL.

### Task 5: Выпуск

- [ ] Полный `npm test`; живой прогон на локальном сервере с настоящим RSS C14; финальное ревью ветки; один коммит, пуш, проверка на проде (миграция 101, канал C14 добавлен, кандидаты видны).
