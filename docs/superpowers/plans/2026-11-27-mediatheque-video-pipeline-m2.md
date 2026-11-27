# Конвейер видео Медиатеки, этап М2 «dot публикует» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель.** dot своим ключом редактора (`lpne_`, тот же, что в Новостях) берёт видео со статусом
«ASR готов», скачивает ASR-ZIP, собирает учебный архив и загружает его. Сервер сам публикует
материал в категорию «Видео дня», не трогая ваш неопубликованный черновик Медиатеки. Владелец
видит «Опубликовано» и может снять материал одной кнопкой.

**Архитектура.**
- Очередь М1 продолжается статусами `dot_taken → publishing → published`; конечные —
  `failed_publish`, `withdrawn`.
- Публикацию выполняет серверный оркестратор `mediaqueue/dailyPublisher.js`. Он проходит те же
  канонические шаги, что мастер владельца (`public/js/mediatheque-publisher.js`): подготовка →
  корпус → копия → права → проверка → публикация корпуса.
- Затем новая узкая функция `publishMediathequeDailyAddition` в `db/publicationRepo.js` применяет
  одну команду структуры сразу к опубликованному изданию и к черновику.
- Записи идут от имени владельца (канонические писатели требуют его роль). В аудите
  записывается редактор dot.

**Технологии.** Node + express + sqlite3, `node:test`, adm-zip; publicationRepo и
mediatheque-core как есть.

**Спек:** `docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md` §5.4, §5.5, §5.6,
§6, §7 М2.

## Общие ограничения

- **Категория «Видео дня»:** id `m_daily_video`, заголовок `Видео дня`. Создаётся при первой
  публикации и в издании, и в черновике. Корпус — slug
  `'media-' + sha256('m_daily_video').hex.slice(0,20)` (то же правило, что у клиента) и title
  `Видео дня`.
- **dot трогает только «Видео дня».** Узкая публикация не публикует ни одной другой правки
  черновика. Новое издание = текущее опубликованное + команды dot.
- **В «Видео дня» видны материалы за 30 дней:** при каждой публикации dot из категории
  убираются материалы, опубликованные dot раньше чем 30 дней назад. Корпус и сами материалы
  остаются.
- **Права:** `public_read_allowed`, `public_stream_allowed` и `package_download_allowed` = true;
  `basis = 'OWNER_ATTESTATION_MEDIA_<YYYY_MM_DD>'`.
- **Ключ dot** (`lpne_`, `news/newsEditorAuth.js`) получает доступ только к
  `/api/media-queue/editor/*`. Ключ ПК (`lpr_`) туда не проходит; сессия владельца проходит
  (просмотр).
- **dot берёт задание** скачиванием ASR-ZIP; задание закрепляется за ним на 4 часа. Если
  закрепление истекло, задание снова отдаётся с пометкой `retry:true`.
- **Ключи идемпотентности** канонических записей — `mq-<job_id>-<n>-<шаг>`, где `n` — номер
  загрузки архива. Повтор той же загрузки ничего не дублирует.
- **Строки интерфейса** — ключи `mediatheque.videoQueue.*` во всех трёх локалях. Выпуск —
  lockstep `?v=`, один коммит, один пуш, проверки прода до пуша.

## На что смотреть при проверке

1. **Черновик владельца с посторонними правками.** После публикации dot в черновике остаются и
   правки владельца, и новый материал; в публичном издании — только материал dot. Тест в
   Задаче 3.
2. **Повторная загрузка того же архива** (dot не дождался ответа). Один материал, а не два;
   ответ — тот же результат. Тест в Задаче 4.
3. **Архив не прошёл проверку** (`MATERIAL_ARCHIVE_*`). dot получает код, задание остаётся за
   dot, Медиатека не меняется. Тест в Задаче 4.
4. **Чужой ключ.** Ключ ПК не может взять или опубликовать; ключ dot не может ставить в очередь,
   снимать материал или ходить в `/worker/*`. Тест в Задаче 5.
5. **Снятие материала владельцем.** Материал исчезает из «Видео дня» и в издании, и в
   черновике; повторное снятие — 409. Тест в Задаче 3.

---

### Task 1: Колонки публикации в очереди

**Файлы:**
- Создать: `migrations/100_media_queue_publish.sql`, `migrations/down/100_media_queue_publish.sql`
- Изменить: `tests/helpers/newsDb.cjs` (добавить `100_media_queue_publish.sql`)
- Тест: `tests/mediaQueueRepo.test.js`

**Интерфейсы:**
- Производит колонки `media_jobs`: `dot_editor_id TEXT`, `dot_lease_until TEXT`,
  `upload_count INTEGER NOT NULL DEFAULT 0`, `archive_sha256 TEXT`, `published_slug TEXT`,
  `published_work_id TEXT`, `published_at TEXT`, `withdrawn_at TEXT`.

- [ ] **Шаг 1.** Тест `migration 100 adds publish columns` — все колонки есть в
  `PRAGMA table_info`.
- [ ] **Шаг 2.** Запустить → FAIL.
- [ ] **Шаг 3.** Миграция: `ALTER TABLE … ADD COLUMN` по одной; down через пересоздание таблицы
  без них. Если down в репозитории для `ADD COLUMN` не пишут — оставить комментарий-заглушку,
  как в соседних down.
- [ ] **Шаг 4.** Тест → PASS; `npm test` → без новых падений.
- [ ] **Шаг 5.** Коммит `feat(media-queue): migration 100 publish columns`.

### Task 2: Очередь для dot

**Файлы:**
- Изменить: `mediaqueue/mediaQueueRepo.js`
- Тест: `tests/mediaQueueRepo.test.js`

**Интерфейсы:**
- Производит методы `createMediaQueue`:
  - `nextForDot() -> job | null` — самое старое `asr_ready` (сначала заказы владельца по
    `priority`), иначе `dot_taken` с истёкшим `dot_lease_until`. У такого задания поле
    `retry: true`.
  - `takeForDot(jobId, editorId) -> job` — разрешено из `asr_ready`, из своего `dot_taken` или из
    чужого истёкшего. Ставит `dot_taken` и `dot_lease_until = now+4h`. Иначе
    `MEDIA_JOB_NOT_TAKEN`/409.
  - `beginPublish(jobId, editorId, archiveSha) -> { job, uploadNo }` — только из своего
    `dot_taken`. Ставит `publishing`, `upload_count+1`, `archive_sha256`. Повтор с тем же sha,
    пока идёт `publishing` или уже `published`, отдаёт `{ job, uploadNo, repeat:true }`.
  - `publishFailed(jobId, code, detail)` — обратно в `dot_taken` (dot может прислать
    исправленный архив), `error_code`/`error_detail` заполнены.
  - `markPublished(jobId, { slug, workId }) -> job` — `published`, `published_*`, ошибка
    очищена.
  - `dotFail(jobId, editorId, { reason }) -> job` — из своего `dot_taken` в `failed_publish`;
    `error_code='DOT_REFUSED'`, `error_detail = reason` (≤ 300 симв.).
  - `withdraw(jobId) -> job` — только из `published`: `withdrawn`, `withdrawn_at`.
  - `retireCandidates(beforeIso) -> [{ job_id, published_slug, published_work_id }]` — материалы
    dot, опубликованные раньше `beforeIso` и ещё не снятые.
- `retry()` из М1 теперь принимает и `failed_publish`: возвращает задание в `asr_ready`, если
  есть `asr_zip_sha256`. Иначе работает как в М1.

- [ ] **Шаг 1. Тесты:**
  - `nextForDot gives owner orders first, then expired dot leases with retry:true`;
  - `takeForDot leases 4 h; another editor cannot take a live lease`;
  - `beginPublish only from own dot_taken; same sha repeat returns repeat:true`;
  - `publishFailed returns to dot_taken with the code`;
  - `dotFail → failed_publish; owner retry → asr_ready`;
  - `withdraw only from published`;
  - `retireCandidates returns only dot publications older than the cut and not withdrawn`;
  - `list never exposes dot_editor_id`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать условными UPDATE, как в М1. `publicJob` скрывает `lease_key_id` и
  `dot_editor_id`.
- [ ] **Шаг 4.** → PASS.
- [ ] **Шаг 5.** Коммит `feat(media-queue): dot side of the queue (next, take, publish states, withdraw)`.

### Task 3: Узкая публикация в «Видео дня»

**Файлы:**
- Изменить: `db/publicationRepo.js` (рядом с `publishMediatheque`, ~стр. 979; экспорт в объекте
  возврата ~стр. 1278)
- Тест: `tests/mediathequeDailyAddition.test.js` — setup из `tests/mediathequeMaterialCommands.test.js`
  (миграции, users, `createPublicationRepo`), архив — `tests/helpers/mediathequeArchiveFixture.cjs`
  как в `archiveBytes`.

**Интерфейсы:**
- Производит `DAILY_VIDEO = { id: 'm_daily_video', title: 'Видео дня' }` (экспорт модуля) и методы
  репозитория:
  - `publishMediathequeDailyAddition(actor, { ref, retireKeys = [] }, opts) -> { edition_id, revision }`.
    `actor` — владелец (`mediathequeOwner`).
    1. Берёт опубликованную структуру (или `empty()`) и черновик (или опубликованную, если
       черновика нет).
    2. К **каждой** применяет: `category.create` (если нет `m_daily_video`) → `items.add`
       (`target:'category'`, `id:'m_daily_video'`, `references:[ref]`) → `items.remove` для
       `retireKeys`, которые ещё в категории.
    3. Пишет новое издание из опубликованной структуры + команд (как `publishMediatheque`:
       неиспользуемые ссылки забываются) и переводит указатель.
    4. Пишет черновик с `revision+1` и `undo_json=NULL`.
    Всё под `withIdempotency(actor,'MEDIATHEQUE_DAILY_ADD',opts,…)`.
  - `withdrawMediathequeDailyItem(actor, { key }, opts) -> { edition_id }` — `items.remove` ключа
    из `m_daily_video` в издании и черновике. Ключа нет в издании → `MEDIATHEQUE_REFERENCE_UNAVAILABLE`/409.

- [ ] **Шаг 1. Тесты:**
  - `daily addition publishes only the new item while the owner's draft edit stays unpublished`:
    1. Публикуется материал A владельцем (как `publishArchive`), он кладётся в тему «Тема»,
       издание публикуется.
    2. В черновик добавляется `category.create` «Неопубликованная» и сохраняется.
    3. Публикуется материал B в корпус «Видео дня» + `publishMediathequeDailyAddition`.
    Ожидается:
    - в публичной структуре есть `m_daily_video` с B, «Тема» с A и нет «Неопубликованной»;
    - в черновике есть «Неопубликованная», «Тема» и `m_daily_video` с B;
    - ревизия черновика выросла на 1.
  - `daily addition on an empty Mediatheque creates the category in both`;
  - `retireKeys leave the category but the material stays in the corpus`;
  - `same idempotency key twice → one edition`;
  - `withdraw removes from both; second withdraw → 409`;
  - `non-owner actor → PUBLISHER_FORBIDDEN`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** → PASS; `node --test tests/mediathequeMaterialCommands.test.js tests/mediathequePersistence.test.js`
  → зелёные.
- [ ] **Шаг 5.** Коммит `feat(mediatheque): narrow daily-video publication that leaves the owner's draft alone`.

### Task 4: Оркестратор публикации dot

**Файлы:**
- Создать: `mediaqueue/dailyPublisher.js`
- Тест: `tests/mediaDailyPublisher.test.js` (тот же setup + `media_jobs` из миграций 099/100)

**Интерфейсы:**
- Потребляет Задачи 2 и 3.
- Производит:
  ```
  createDailyPublisher({ repo, queue, ownerActor: () => Promise<{id, role:'owner'}>, now, log })
    -> { publish(jobId, editorId, archiveBytes) -> { job, material: { slug, workId, title } } }
  ```
  `publish` по шагам:
  1. `queue.beginPublish(...)`. Если `repeat` и задание уже `published` — вернуть сохранённый
     результат.
  2. `repo.prepareMediathequeArchive(owner, bytes, { mode:'youtube', youtubeUrl: job.url })`.
  3. Корпус «Видео дня»: найти по slug или `createCorpus`; черновик или `createRevisionDraft`.
  4. `copyMediathequeArchive`:
     - `title` — заголовок архива или `job.title`;
     - `creator` — `job.channel_title || 'YouTube'`;
     - `description` — пусто.
  5. `recordMaterialRights` (права из «Общих ограничений»).
  6. `validateDraft` → `publish` корпуса.
  7. Найти `item.ref` в `getPublicMediatheque().items`:
     `slug` + `workId = 'work-' + sha256('MY_TEXTS:local:' + source_work_id).hex.slice(0,24)`.
  8. `publishMediathequeDailyAddition(owner, { ref, retireKeys })`. `retireKeys` — из
     `queue.retireCandidates(now − 30 дней)`.
  9. `queue.markPublished`.

  Ошибка на шагах 2–8 → `queue.publishFailed(jobId, code, detail)` и выброс `MediaQueueError(code, 400|409)`.
  Если тот же архив уже скопирован в корпус (`SOURCE_ALREADY_COPIED`) — сбросить незавершённый
  импорт через `discardMediathequePendingImport` и повторить один раз. Так же делает мастер
  владельца (`mediatheque-publisher.js:82–86`).

- [ ] **Шаг 1. Тесты:**
  - `dot archive becomes a published material in «Видео дня»`: статус `published`, материал в
    публичной категории, права с `basis` по дате;
  - `repeat upload of the same archive returns the same material, no second item`;
  - `invalid archive → MATERIAL_ARCHIVE_* code, job back to dot_taken, Mediatheque unchanged`;
  - `materials older than 30 days leave «Видео дня» on the next publication`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** → PASS.
- [ ] **Шаг 5.** Коммит `feat(media-queue): dot's archive → canonical publication into «Видео дня»`.

### Task 5: Маршруты dot, снятие, инструкция для dot

**Файлы:**
- Изменить: `mediaqueue/mediaQueueRoutes.js`, `server.js` (подключение: `editorAuth` из news store,
  `dailyPublisher`, `ownerActor` = первый пользователь с `role='owner'`)
- Создать: `mediaqueue/dotTask.md`, `mediaqueue/mediaDotTask.js` (как `news/newsDotTask.js`: текст +
  версия = sha256 текста, 12 символов; адрес `/api/media-queue/dot-task.md`)
- Тест: `tests/mediaQueueRoutes.test.js`

**Маршруты (новые):**

| Метод и путь | Кто | Что |
|---|---|---|
| `GET /api/media-queue/dot-task.md` | все | инструкция, ETag = версия |
| `GET /api/media-queue/editor/jobs/next` | dot / владелец | `{ok, job|null, task:{version,updated,url}}`; у `job` есть `asr_zip`, `archive` (адреса) и `retry` |
| `GET /api/media-queue/editor/jobs/:id/asr-zip` | dot | `takeForDot` + файл `<video_id>_ASR.zip` |
| `POST /api/media-queue/editor/jobs/:id/archive` | dot, `application/zip` ≤ 512 МБ | `dailyPublisher.publish` → `{ok, job, material}` |
| `POST /api/media-queue/editor/jobs/:id/fail` | dot | `{reason}` → `dotFail` |
| `POST /api/media-queue/jobs/:id/withdraw` | владелец (CSRF + origin) | `withdrawMediathequeDailyItem` + `queue.withdraw` |

Права: dot — только `editor/*`; ключ ПК на `editor/*` → 401; ключ dot на `/jobs*` и `/worker/*` →
401. Аудит: `media_job_dot_taken`, `media_job_published` (с `editor`), `media_job_dot_refused`,
`media_job_withdrawn`.

Инструкция для dot (`mediaqueue/dotTask.md`) по-русски, по образцу `news/harvest/dotTask.md`:
- адреса и цикл: next → asr-zip → собрать архив → archive;
- архив собирается **так же, как dot уже делает для Медиатеки**: LPLP v2 с `content_root_sha256`
  и хэшами файлов; в строках `he_plain`, `he_niqqud`, `translit`, `translit_ru`, `ru` (`en`
  желательно) с `field_meta`; слой `learning/word-gloss-ai.json` (`word-gloss-ai-layer-v1`);
  `quality/report.json`; источник воспроизведения — YouTube-ссылка задания; тайминг — из
  ASR-ZIP;
- что делать при ошибке проверки (код в ответе → исправить и прислать снова) и когда отказаться
  (`fail` с причиной: речь не на иврите, ASR непригоден);
- лимит dot по спеку — до 5 своих видео в день (вступит в силу с каналами М3); заказы владельца
  — все.

- [ ] **Шаг 1. Тесты:**
  - `dot takes the next job and downloads the ASR zip`;
  - `dot uploads an archive and the job is published` (публикатор подменён заглушкой);
  - `withdraw by the owner calls the repo and marks the job`;
  - `relay key cannot reach editor routes; editor key cannot reach owner and worker routes`;
  - `dot-task.md is public, versioned, 304 on If-None-Match`;
  - `next carries task.version`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать и подключить в `server.js` через Edit.
- [ ] **Шаг 4.** → PASS; `npm test` зелёный.
- [ ] **Шаг 5.** Коммит `feat(media-queue): dot routes, owner withdraw, dot task at /api/media-queue/dot-task.md`.

### Task 6: Экран: опубликовано, снять

**Файлы:**
- Изменить: `public/js/mediatheque-video-queue.js`, `public/i18n/locales/{ru,en,he}.js`
- Тест: `tests/mediathequeVideoQueue.test.js`

**Что меняется:**
- Статусы `dot_taken` («Готовит dot»), `publishing` («Публикуется»), `published` («Опубликовано в
  «Видео дня»»), `failed_publish` («dot не смог подготовить»), `withdrawn` («Снято»).
- У `published` — ссылка «Открыть в Медиатеке»
  (`/mediatheque.html?section=catalog&category=m_daily_video`) и кнопка «Снять».
- У `failed_publish` — «Повторить» и подсказка из `error_detail`.
- У `asr_ready` кнопка «Скачать ASR-ZIP» остаётся.
- Подсказка `DOT_REFUSED` («dot отказался: {detail}»), коды публикации — общая подсказка
  `PUBLISH_FAILED` с кодом.
- Отмена доступна и в `asr_ready` (dot ещё не взял).

- [ ] **Шаг 1. Тесты:**
  - `new statuses have labels`;
  - `withdraw only for published`;
  - `open link only for published`;
  - `cancel allowed for asr_ready`;
  - строки в трёх локалях.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** → PASS; снимки `shots.js`: десктоп ru и 380 px he.
- [ ] **Шаг 5.** Коммит `feat(mediatheque): queue shows dot's publication and lets the owner withdraw`.

### Task 7: Выпуск М2

- [ ] **Шаг 1.** Bump: `?v=`, `CACHE_VERSION`, `APP_VERSION`, футер Зала, замок локалей — до
  squash.
- [ ] **Шаг 2.** `npm test` зелёный.
- [ ] **Шаг 3.** Финальное ревью ветки, исправления.
- [ ] **Шаг 4.** Проверки прода (df, coolify healthy, rmi предыдущего образа, prune) → один пуш
  → проверить живую версию и миграцию 100.
- [ ] **Шаг 5.** На проде:
  - `GET /api/media-queue/dot-task.md` → 200;
  - `GET /api/media-queue/editor/jobs/next` с ключом dot → задание `z4NTzVuLp9U`.
  Ссылку на инструкцию передать владельцу для dot. Обновить спек и память.
