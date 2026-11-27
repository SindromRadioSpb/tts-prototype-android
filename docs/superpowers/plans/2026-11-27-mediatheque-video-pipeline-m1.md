# Конвейер видео Медиатеки, этап М1 «Очередь + ПК» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель.** Владелец вставляет ссылку YouTube в Медиатеке. Домашний ПК сам скачивает звук (yt-dlp),
делает ASR (windowed-review, CUDA) и кладёт ASR-ZIP на сервер. В Медиатеке видны статус каждого
видео и кнопка «Скачать ASR-ZIP». В М1 этот ZIP владелец ещё сам отдаёт dot; автоматическая
передача — этап М2.

**Архитектура.**
- На сервере новый модуль `mediaqueue/` (репозиторий очереди + маршруты) по образцу `news/`.
- Работник ПК — чистое ядро `mediaqueue/homeWorkerCore.js` с подменяемыми `exec`/`fetch`, плюс
  CLI-скрипт под Планировщиком Windows, как `scripts/news/harvest.js`.
- ПК входит существующим ключом `lpr_` (`news/newsRelayAuth.js`): один ключ на ПК.

**Технологии.** Node + express + sqlite3, `node:test`, adm-zip; yt-dlp (на ПК уже стоит через
winget); `F:\datasets_models\LinguistPro_ASR_Tool\asr_tool.py`.

**Спек:** `docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md` (§5.1, §5.3, §5.6,
§6, §7 М1).

## Общие ограничения

- Сервер ничего не скачивает с YouTube и не хранит звук и видео. Принимается только ASR-ZIP без
  аудиофайлов.
- Ссылки: Shorts в v1 не входят. Принимаются `www.youtube.com|youtube.com|m.youtube.com/watch?v=<11>` и
  `youtu.be/<11>`. `video_id` — `^[A-Za-z0-9_-]{11}$`. Плейлисты (`list=` игнорируется, берётся
  только `v`), каналы и прочие адреса отклоняются: `MEDIA_URL_INVALID`.
- Открытых заказов владельца одновременно — не больше 100, сверх — `MEDIA_QUEUE_FULL` (409).
  Дневного лимита нет. Видео длиннее 2 часов из заказа владельца принимается.
- Открытые статусы: `queued`, `acquiring`, `asr`. Конечные: `asr_ready`, `failed_acquire`,
  `failed_asr`, `failed_upload`, `cancelled`.
- Порядок выдачи ПК: `priority` по убыванию, затем `created_at`. Заказ владельца — `priority=100`.
- Аренда задания — 30 минут, каждое сообщение о шаге её продлевает. Истёкшая аренда возвращает
  задание в `queued`. После 3 неудачных попыток задание получает `failed_*`.
- yt-dlp — только звук, параметры зашиты в коде: без cookies браузера, без плейлистов, без прокси.
- ASR не меняется: `asr_tool.py --audio <файл> --profile windowed-review` с окружением из
  `ASR_WINDOWED_REVIEW.cmd`.
- Строки интерфейса — ключи `mediatheque.videoQueue.*` во всех трёх локалях (ru/en/he). Fallback
  `tt()` мёртв, его не используем.
- Выпуск: bump версии в lockstep (`?v=`, `CACHE_VERSION`, `--write-lock` локалей), один полный
  коммит, один пуш; перед пушем — проверки прода по `docs/architecture/AGENT_OPERATIONS_GUIDE.md`
  (df, coolify-db healthy, rmi предыдущего образа, builder prune).
- Python на Windows пишет CRLF: `server.js` правится только через Edit.

## На что смотреть при проверке

1. **Двойная отметка.** Владелец дважды вставляет ту же ссылку (вариант с `youtu.be`, вариант с
   `&t=30s`). Ожидается одно задание и ответ `existing:true`. Тест — в Задаче 2.
2. **ПК выключился посреди ASR.** Аренда истекла → задание снова `queued`, попытка засчитана, после
   третьей — `failed_asr`. Тест — в Задаче 2.
3. **ASR занят** (`runner.lock`, код выхода 3: владелец сам запустил `.cmd`). Задание возвращается
   в очередь **без** засчитанной попытки. Тест — в Задаче 4.
4. **Частичный ASR.** Рядом лежит только `*_ASR_partial.zip` → `failed_asr`, а не загрузка
   частичного архива. Тест — в Задаче 4.
5. **Чужой ключ.** Ключ редактора dot или сессия не владельца не может ни арендовать задание, ни
   заказывать, ни скачивать ZIP. Тест — в Задаче 3.

---

### Task 1: Таблица очереди

**Файлы:**
- Создать: `migrations/099_media_queue.sql`, `migrations/down/099_media_queue.sql`
- Изменить: `tests/helpers/newsDb.cjs` (добавить `099_media_queue.sql` в конец `MIGRATIONS`: тестам
  нужна таблица ключей `news_relay_keys`)
- Тест: `tests/mediaQueueRepo.test.js`

**Интерфейсы:**
- Производит: таблицу `media_jobs`:
  - `job_id TEXT PK` ('mj_' + 16 hex), `video_id TEXT NOT NULL`, `url TEXT NOT NULL`;
  - `source TEXT NOT NULL CHECK(source IN ('owner','dot','channel'))`;
  - `priority INTEGER NOT NULL`, `status TEXT NOT NULL`, `step_detail TEXT`, `progress REAL`;
  - `title TEXT`, `duration_sec INTEGER`, `channel_title TEXT`;
  - `attempts INTEGER NOT NULL DEFAULT 0`, `lease_key_id TEXT`, `lease_until TEXT`;
  - `error_code TEXT`, `error_detail TEXT`;
  - `asr_zip_sha256 TEXT`, `asr_zip_bytes INTEGER`;
  - `created_by TEXT`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`;
  - индексы `(status, priority DESC, created_at)`, `(video_id)`.

- [ ] **Шаг 1.** Тест `migration 099 creates media_jobs`: `openDb()` → `PRAGMA table_info(media_jobs)`
  содержит все колонки выше; вставка с `source='x'` падает с CHECK.
- [ ] **Шаг 2.** `node --test tests/mediaQueueRepo.test.js` → FAIL (так же запускается тест каждой задачи) (нет таблицы).
- [ ] **Шаг 3.** Написать миграцию и down (`DROP TABLE IF EXISTS media_jobs;`). Добавить файл в
  helper. Проверить, что миграционный раннер сервера подхватывает `099` сам по номеру.
- [ ] **Шаг 4.** Тест → PASS; `npm test` целиком → без новых падений.
- [ ] **Шаг 5.** Коммит `feat(media-queue): migration 099 media_jobs`.

### Task 2: Репозиторий очереди

**Файлы:**
- Создать: `mediaqueue/mediaQueueRepo.js`
- Тест: `tests/mediaQueueRepo.test.js`

**Интерфейсы:**
- Потребляет: `dbGet/dbAll/dbRun` из `db/newsRepo`, таблицу из Задачи 1.
- Производит:
  - `parseYoutubeUrl(s) -> { video_id, url } | null`. `url` нормализуется к
    `https://www.youtube.com/watch?v=<id>`.
  - `class MediaQueueError(code, status, detail)`.
  - `createMediaQueue({ db, dataDir, now }) -> { enqueue, list, get, lease, step, fail, acceptAsrZip, asrZipPath, retry, cancel }`.
  - `enqueue({ url, source:'owner', actorId }) -> { job, existing:boolean }`.
  - `list({ limit=200 }) -> job[]` — новые первыми, без `lease_key_id`.
  - `lease(keyId) -> job | null` — сначала возвращает истёкшие аренды, потом выдаёт одно задание.
  - `step(jobId, keyId, { status:'acquiring'|'asr', progress?, detail?, meta?:{title,duration_sec,channel_title} }) -> job`.
  - `fail(jobId, keyId, { code, detail, retryable:boolean, countAttempt:boolean }) -> job`.
  - `acceptAsrZip(jobId, keyId, bytes:Buffer) -> job`.
  - `asrZipPath(jobId) -> string` (абсолютный путь).
  - `retry(jobId)`, `cancel(jobId) -> job`.

- [ ] **Шаг 1. Тесты** (каждый — отдельный `test(...)`):
  - `parseYoutubeUrl accepts watch, youtu.be, m., &t= and list= (keeps v only)`: все пять вариантов
    → `video_id:'dQw4w9WgXcQ'`.
  - `parseYoutubeUrl rejects`: `/playlist?list=…`, `/@kan11`, `/shorts/…`, `https://example.com/watch?v=dQw4w9WgXcQ`,
    id из 10 символов → `null`.
  - `enqueue same video twice returns existing`: `youtu.be/ID` и потом `watch?v=ID&t=30s` →
    второй ответ `existing:true`, тот же `job_id`, в таблице одна строка.
  - `enqueue after failed or cancelled creates a new job`.
  - `owner limit 100 open jobs` → сотый проходит, сто первый — `MEDIA_QUEUE_FULL`/409; после
    `cancel` одного задания снова проходит.
  - `lease gives highest priority oldest first and sets lease_until = now+30min`: повторный
    `lease` того же ключа при одном задании → `null`.
  - `step extends lease and records meta`.
  - `expired lease returns job to queued and counts attempt; third expiry → failed_asr` (если
    падение было на `asr`) или `failed_acquire` (если на `acquiring`); `error_code='LEASE_EXPIRED'`.
  - `step/fail/accept by a different key → MEDIA_JOB_NOT_LEASED`/409`.
  - `fail retryable without countAttempt keeps attempts and status queued` (случай «ASR занят»).
  - `acceptAsrZip`:
    - правильный ZIP (`manifest.json` с `completed:true` + `raw/segments.json`) → `asr_ready`,
      файл лежит в `<dataDir>/media-queue/asr/<sha256>.zip`, аренда снята;
    - ZIP с `a.wav`/`x.m4a`/`../evil`/`completed:false`/не-ZIP/больше 50 МБ →
      `MEDIA_ASR_ZIP_INVALID`/400 с `detail`, статус не меняется.
  - `retry failed job → queued, attempts reset to 0; retry of open job → MEDIA_JOB_STATE`/409`.
- [ ] **Шаг 2.** Запустить → FAIL.
- [ ] **Шаг 3.** Реализовать.
  - Время — ISO-строки через `now()`.
  - В `lease` возврат истёкших аренд и выдача делаются в одной транзакции
    (`BEGIN IMMEDIATE`…`COMMIT`).
  - ZIP читается adm-zip. Запрещены расширения `.wav .mp3 .m4a .aac .opus .ogg .webm .flac .mp4 .pcm`,
    абсолютные пути и `..`.
  - Файл пишется с `{flag:'wx'}`; `EEXIST` допустим.
- [ ] **Шаг 4.** Тесты → PASS.
- [ ] **Шаг 5.** Коммит `feat(media-queue): queue repository (enqueue, lease, steps, ASR zip intake)`.

### Task 3: Маршруты и подключение к серверу

**Файлы:**
- Создать: `mediaqueue/mediaQueueRoutes.js`
- Изменить: `server.js` — рядом с `mountNewsRoutes` (~строка 4640) создать
  `createMediaQueue({ db, dataDir: DATA_DIR })` и вызвать `mountMediaQueueRoutes`; `relayAuth`
  передать тот же `lazyMember(s => s.relayAuth)`.
- Тест: `tests/mediaQueueRoutes.test.js` (express-приложение в тесте, как в
  `tests/newsRelay.test.js`).

**Интерфейсы:**
- Потребляет: Задачу 2; `relayAuth.resolve(req) -> {key_id}|null`.
- Производит: `mountMediaQueueRoutes(app, { queue, relayAuth, resolveOwner, audit, readLimiter, writeLimiter, workerLimiter })`.
  `resolveOwner(req) -> {id}|null` — в `server.js` это `requireUser` + `role==='owner'`.

Маршруты (все с `Cache-Control: no-store`):

| Метод и путь | Кто | Тело / ответ |
|---|---|---|
| `POST /api/media-queue/jobs` | владелец, `requireStrictSameOriginJson` | `{url}` → `{ok,job,existing}` |
| `GET /api/media-queue/jobs` | владелец | `{ok,jobs}` |
| `POST /api/media-queue/jobs/:id/retry` и `/cancel` | владелец, same-origin | `{ok,job}` |
| `GET /api/media-queue/jobs/:id/asr-zip` | владелец | файл `<video_id>_ASR.zip` |
| `POST /api/media-queue/worker/lease` | ключ `lpr_` | `{ok,job|null}` |
| `POST /api/media-queue/worker/jobs/:id/step` | ключ `lpr_` | тело `step` → `{ok,job}` |
| `POST /api/media-queue/worker/jobs/:id/fail` | ключ `lpr_` | тело `fail` → `{ok,job}` |
| `PUT /api/media-queue/worker/jobs/:id/asr-zip` | ключ `lpr_`, `express.raw({type:'application/zip',limit:'50mb'})` | `{ok,job}` |

Аудит: `media_job_enqueued`, `media_job_retry`, `media_job_cancel`, `media_job_asr_ready`.

- [ ] **Шаг 1. Тесты:**
  - `owner enqueues and lists`;
  - `worker routes need a relay key`: без ключа → 401; ключ редактора `lpne_` → 401; сессия
    владельца на `/worker/*` → 401;
  - `owner routes refuse relay key and editor key` → 401/403;
  - `cross-site POST refused`;
  - `asr-zip download streams the stored file with attachment name`;
  - `MediaQueueError maps to its status and code`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать маршруты. Подключить в `server.js` через Edit: лимитер работника
  `makeRateLimiter({windowMs:60_000,max:120,name:'media-worker'})`, запись —
  `max:30,name:'media-queue-write'`.
- [ ] **Шаг 4.** Тесты → PASS; `npm test` целиком зелёный.
- [ ] **Шаг 5.** Коммит `feat(media-queue): routes for owner and home PC`.

### Task 4: Ядро работника ПК

**Файлы:**
- Создать: `mediaqueue/homeWorkerCore.js`
- Тест: `tests/mediaHomeWorker.test.js` (`exec` и `fetch` подменены; настоящие yt-dlp и CUDA в
  тестах не запускаются)

**Интерфейсы:**
- Потребляет: маршруты `/api/media-queue/worker/*` из Задачи 3.
- Производит:
  - `asrEnv(asrRoot, baseEnv) -> env`. Ровно переменные из `ASR_WINDOWED_REVIEW.cmd`:
    `LINGUIST_ASR_ROOT`, `TEMP`/`TMP=<root>\runtime\tmp`, `HF_HOME`, `HUGGINGFACE_HUB_CACHE`,
    `TORCH_HOME`, `PIP_CACHE_DIR`, `XDG_CACHE_HOME`, `UV_CACHE_DIR`, `PYTHONPYCACHEPREFIX`,
    `CUDA_CACHE_PATH`, `HF_HUB_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`, `PYTHONUTF8=1`,
    `PYTHONDONTWRITEBYTECODE=1`.
  - `asrPython(asrRoot, readFile) -> path`: `local_config.json`.venv + `Scripts\python.exe`.
  - `ytDlpArgs(url, outDir) -> string[]`. Метаданные:
    `['-J','--no-playlist','--no-warnings',url]`. Скачивание:
    `['-f','bestaudio[ext=m4a]/bestaudio','--no-playlist','--no-progress','--restrict-filenames','-o',<outDir>\%(id)s.%(ext)s','--print','after_move:filepath',url]`.
  - `findAsrZip(dir, stem, readdir) -> { zip } | { partial:true } | null`: ищет
    `<stem>_ASR*.zip` без `_partial`; если есть только `_partial.zip` → `{partial:true}`.
  - `runOnce({ origin, key, workDir, asrRoot, exec, fetch, fs, log }) -> 'idle'|'done'|'failed'|'busy'`.

Шаги `runOnce`:
1. lease;
2. step `acquiring` + meta из `-J`;
3. скачивание в `<workDir>\<video_id>\a<attempts+1>\`;
4. step `asr`. Пока идёт ASR, каждые 120 с отправляется step-heartbeat; `exec` отдаёт процесс с
   `onExit`;
5. по коду выхода:
   - `3` → `fail{code:'ASR_BUSY',retryable:true,countAttempt:false}` → `'busy'`;
   - не-0 → `fail{code:'ASR_FAILED',retryable:true,countAttempt:true}`;
6. `findAsrZip`:
   - `partial` → `fail{code:'ASR_PARTIAL',retryable:false}`;
   - zip → PUT;
7. ошибка yt-dlp → `fail{code:'ACQUIRE_FAILED',detail:<последняя строка stderr, ≤300 симв.>,retryable:true,countAttempt:true}`.

Если stderr yt-dlp содержит `Sign in to confirm`, `Private video` или `Video unavailable`, то
`retryable:false` с этим кодом в `detail`. Обходить отказ не пытаемся.

- [ ] **Шаг 1. Тесты:**
  - `asrEnv matches the .cmd variables`;
  - `ytDlpArgs never contains cookies or playlist flags` (`--cookies*`, `--yes-playlist`,
    `--proxy` отсутствуют);
  - `findAsrZip picks _ASR.zip and _ASR_2.zip, reports partial`;
  - `runOnce happy path: lease→step acquiring(meta)→step asr→PUT zip` (последовательность вызовов
    fetch);
  - `runOnce exit 3 → ASR_BUSY without attempt`;
  - `runOnce partial → ASR_PARTIAL not retryable, nothing uploaded`;
  - `runOnce Sign in to confirm → not retryable`;
  - `runOnce idle when lease returns null`.
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** → PASS.
- [ ] **Шаг 5.** Коммит `feat(media-queue): home PC worker core (yt-dlp audio + windowed ASR)`.

### Task 5: CLI работника и установка в Планировщик

**Файлы:**
- Создать: `scripts/media/home-worker.js`, `scripts/media/install-home-media-worker.ps1`

**Интерфейсы:**
- Потребляет: `runOnce` из Задачи 4.
- CLI: `node scripts/media/home-worker.js --push <origin> --key-file <файл lpr_> --work <папка> --asr-root F:\datasets_models\LinguistPro_ASR_Tool [--max-jobs 20]`.
  Вызывает `runOnce` в цикле, пока не вернётся `'idle'`/`'busy'` или не наберётся `--max-jobs`.
  Код выхода — 1, если был хоть один `'failed'`.
- PS-скрипт — по образцу `scripts/news/install-home-harvest.ps1`:
  - параметры `-KeyFile` (обяз.), `-WorkDir` (по умолчанию `F:\LinguistPro_MediaQueue`), `-AsrRoot`,
    `-Origin`, `-TaskName 'LinguistPro media worker'`;
  - запуск каждые 10 минут, `-MultipleInstances IgnoreNew`, `-ExecutionTimeLimit 6h`;
  - лог `<WorkDir>\worker.log`.

- [ ] **Шаг 1.** `node --check scripts/media/home-worker.js`. PS-скрипт:
  `powershell -NoProfile -Command "[ScriptBlock]::Create((Get-Content -Raw scripts/media/install-home-media-worker.ps1))|Out-Null"`
  → без ошибок.
- [ ] **Шаг 2.** Ручной прогон на ПК против локального сервера (`npm start`), видео ≤ 2 минут:
  - ключ выпускается в `/news-editor.html` → «Сбор с ПК»;
  - заказ — через `POST /api/media-queue/jobs`.
  Ожидается: в логе шаги `acquiring` → `asr` → `asr_ready`; ZIP скачивается и открывается;
  внутри нет аудио.
- [ ] **Шаг 3.** Коммит `feat(media-queue): home PC worker CLI and scheduler install`.

### Task 6: Экран «Видео: очередь» в Медиатеке

**Файлы:**
- Создать: `public/js/mediatheque-video-queue.js` (диалог, без зависимостей кроме `api()` из
  `mediatheque-api.js`)
- Изменить: `public/js/mediatheque-ui.js:636` — рядом с кнопкой `publish-material` добавить кнопку
  владельца `button('video-queue', t('videoQueue.open'))` и её обработчик;
  `public/mediatheque.html` — подключить скрипт с `?v=`;
  `public/i18n/locales/{ru,en,he}.js`.
- Тест: `tests/mediathequeVideoQueue.test.js` — чистые функции `statusLabelKey(job)`,
  `hintKey(job)`, `canRetry(job)`, `canCancel(job)` экспортируются из модуля для node.

**Интерфейсы:**
- Потребляет: маршруты владельца из Задачи 3.

Что видит владелец:

```
Видео: очередь                                  [ссылка YouTube…        ] [В очередь]
● «Сюжет о …» · Kan 11 · 12 мин        — Распознаётся на ПК · 40%        [Отменить]
✓ «…» · N12 · 6 мин                    — ASR готов           [Скачать ASR-ZIP]
✕ «…»                                  — YouTube требует вход — это видео не скачать
⏸ youtu.be/…                           — Ждёт ПК                          [Отменить]
```

- Статусы и подсказки (ключи `mediatheque.videoQueue.status.<status>`,
  `mediatheque.videoQueue.hint.<error_code>`) для:
  - `ACQUIRE_FAILED`, `ASR_FAILED`, `ASR_PARTIAL`, `ASR_BUSY`, `LEASE_EXPIRED`;
  - `MEDIA_URL_INVALID`, `MEDIA_QUEUE_FULL`;
  - отказов YouTube: `Sign in`, `Private`, `Unavailable`.
- Пока диалог открыт, список опрашивается каждые 15 с.

- [ ] **Шаг 1. Тесты:**
  - `statusLabelKey covers every status`;
  - `retry only for failed_*`;
  - `cancel only for queued/acquiring/asr`;
  - `every key used exists in ru, en and he` (сверка с объектами локалей).
- [ ] **Шаг 2.** → FAIL.
- [ ] **Шаг 3.** Реализовать модуль, кнопку и строки трёх локалей. Для he — RTL через `dir="auto"`
  на строках.
- [ ] **Шаг 4.** → PASS. Проверка глазами через `shots.js` (локальный `public/`): 380 px и
  десктоп, ru и he, светлая и тёмная тема.
- [ ] **Шаг 5.** Коммит `feat(mediatheque): video queue dialog for the owner`.

### Task 7: Выпуск М1

**Файлы:** версии и локали по правилам lockstep (`docs/architecture/AGENT_OPERATIONS_GUIDE.md`),
`CHANGELOG.md`.

- [ ] **Шаг 1.** Bump версии (`?v=`, `CACHE_VERSION`, `--write-lock`) и коммит bump **до**
  squash/merge.
- [ ] **Шаг 2.** `npm test` → все зелёные. Записать число тестов.
- [ ] **Шаг 3.** Проверки прода перед пушем: df, coolify-db healthy, rmi предыдущего образа,
  builder prune. Затем один пуш и ожидание деплоя.
- [ ] **Шаг 4.** На проде:
  - `GET /api/version` = новая версия;
  - миграция 099 применена;
  - установить задание Планировщика на ПК;
  - вставить в Медиатеке ссылку на короткое видео → статус доходит до «ASR готов» →
    ZIP скачивается.
- [ ] **Шаг 5.** Обновить статус спека (М1 SHIPPED + версия) и память проекта.
