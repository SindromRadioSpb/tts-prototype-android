# Курс иврита P7 — синхронизация прогресса и возвращение к уроку: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- прогресс курса (P2 `Progress`) одинаков на телефоне и ПК у одного пользователя;
- через сутки после урока ученику предлагается «вернуться» на новом варианте ситуации.

FSRS для слов курса — отдельный P7b, позже. Слова, которые ученик явно сохраняет в «Мой словарь», уже идут в повторение Зала.

**Architecture:**
- Сервер: новый вид артефакта `course_progress` в существующем хранилище `db/learnerArtifactsRepo.js` (R§5: `KINDS` на строке 32, `get` на 97, `put` на 106), `artifact_key = <courseId>`. Действуют те же согласие и лимиты, что у `state_bundle`.
- Клиент: чистая функция слияния `mergeProgress` в `course-evidence.js` и модуль `public/js/course-sync.js` (скачать → слить → сохранить локально → отправить, если изменилось).
- Слияние детерминированное, коммутативное и идемпотентное, поэтому порядок устройств не важен. Отдельный журнал не нужен.

**Tech Stack:** Node 22, `node:test`, существующие `requireUser`/`requireCsrf`/лимиты сервера; без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` §4.2 п. 6, §4.4 п. 8 (отложенное возвращение), §4.8; разведка — `docs/research/hebrew-course/2026-11-05-p3-recon.md` §5–§6 («R§N»); P2 — `…-p2-evidence.md`.

## Global Constraints

- `Attempt` неизменяем. Слияние никогда не меняет и не удаляет попытку — только объединяет.
- `Attempt.id` глобально уникален: `fnv1a(taskKey + '|' + channel + '|' + at + '|' + input)` + `'-'` + 6 случайных символов `[a-z0-9]`. Старые P2-ID сохраняются как есть.
- `input` в попытке обрезается до 300 символов в момент записи. Это защищает лимит артефакта; полный ввод не нужен для доказательства.
- Без согласия пользователя на облачное хранение (тот же механизм, что у `state_bundle`) синхронизация не выполняется. В интерфейсе тогда остаётся «Данные на этом устройстве».
- Ошибки сети и сервера не ломают урок: локальный прогресс всегда записан раньше отправки.
- Ветка `feat/course-sync` от `origin/main` с влитой `origin/feat/course-audio` (её инструменты ещё не в main). Выпуск — с lockstep и только после «да» владельца; перед сборкой на проде должно быть ≥ 6 ГиБ (чистка кэша сборки и старых образов разрешена).

## Review Focus

1. Одна и та же попытка пришла с двух устройств → одна запись, а не две — тест в Task 1.
2. Телефон офлайн записал 3 попытки, ПК тем временем — 2 → после синхронизации на обоих 5 попыток в одинаковом порядке — тест в Task 1 и Task 3.
3. Выход из аккаунта и вход другим пользователем: чужой прогресс не скачивается и не сливается с локальным `anon` без явного действия — тест в Task 3.
4. Ответ сервера 413 (лимит), 401 или 503 → урок продолжает работать, статус «не синхронизировано», повтор позже — тест в Task 3.
5. Две вкладки одновременно: обе отправляют, ничего не теряется — тест в Task 3 (последовательные `put` с разными основаниями).

---

### Task 1: `mergeProgress` и уникальные ID попыток

**Files:** Modify `public/js/course-evidence.js`, `tests/courseEvidence.test.js`

**Interfaces:**
- Produces:
  - `mergeProgress(a: Progress, b: Progress) -> Progress`, правила:
    - `attempts` — объединение по `id`, сортировка по `(at, id)`;
    - `aids[taskKey]` — `hint` = максимум, булевы = ИЛИ;
    - `seen[fp]` и `firstMet[lexId]` — минимум времени;
    - `lessonVersions[id]` — максимум;
    - `courseId` должен совпадать, иначе бросается `Error('COURSE_MISMATCH')`;
  - `progressDigest(p) -> string` — FNV-1a канонического JSON. По нему видно, изменилось ли что-то после слияния.
- В `record`: новый формат `id` и обрезка `input` до 300 символов.

- [ ] **Step 1: failing tests:**
  - `merge(a,b)` глубоко равно `merge(b,a)`; `merge(a,a)` глубоко равно `a`; `merge(merge(a,b),c)` глубоко равно `merge(a,merge(b,c))` — на трёх сгенерированных прогрессах;
  - одинаковая попытка в `a` и `b` → одна;
  - 3 + 2 разные попытки → 5 в порядке `(at, id)` (Review Focus 1, 2);
  - `aids`: `{hint:1, model:false}` ⊕ `{hint:2, model:true}` → `{hint:2, model:true}`;
  - ввод 1 000 символов → в попытке 300;
  - разные `courseId` → `COURSE_MISMATCH`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): deterministic progress merge`; push.

### Task 2: Сервер — артефакт `course_progress`

**Files:**
- Modify: `db/learnerArtifactsRepo.js` (`KINDS`, валидация `artifact_key` — `/^[a-z0-9-]{1,40}$/`, свой лимит размера)
- Modify: маршрут артефактов, которым пользуется `cloud-sync.js` `_syncState` (R§5: `public/js/cloud-sync.js:536`); точное место найти по вызову `learnerArtifactsRepo.get/put` в `server.js`, а если маршрут закрыт под `state_bundle`, добавить рядом `GET/PUT /api/learner/course-progress/:courseId` с теми же `requireUser`, `requireCsrf`, проверкой согласия и лимитером
- Test: тест репозитория по образцу существующих тестов `learnerArtifactsRepo` (найти в `tests/`) + API-тест маршрута

**Interfaces:**
- Produces:
  - `GET /api/learner/course-progress/:courseId` → `200 { payload: Progress, digest, updatedAt }` | `404` | `401` | `403` (нет согласия);
  - `PUT /api/learner/course-progress/:courseId`, тело `{ payload, baseDigest }` → `200 { digest, updatedAt }`. Если `baseDigest` не совпадает с текущим → `409 { payload, digest }`: клиент сливает и повторяет. Превышение лимита → `413`.
  - Лимит размера `course_progress` — 2 МБ JSON.

- [ ] **Step 1: failing tests:**
  - неизвестный вид по-прежнему `BAD_KIND`;
  - `course_progress` с ключом `ulpan` сохраняется и читается только своим пользователем;
  - `PUT` с устаревшим `baseDigest` → 409 с текущим содержимым;
  - тело больше 2 МБ → 413;
  - без согласия → 403.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course_progress learner artifact and API`; push.

### Task 3: Клиент — `course-sync.js`

**Files:** Create `public/js/course-sync.js`, `tests/courseSync.test.js`; Modify `public/js/library-ui.js` (`renderCourseCorpus` — запуск синхронизации), `public/js/course-reader.js` (строка статуса)

**Interfaces:**
- Consumes: `mergeProgress`, `progressDigest`, `CourseStore` (P2/P3), `CloudSync.me()` и признак согласия (как у `_syncState`).
- Produces:
  - `CourseSync.create({ store, courseId, me, consent, fetch, now }) -> { syncNow(): Promise<Status>, schedule(), dispose() }`;
  - `Status = 'synced' | 'local_only' | 'pending' | 'error'`.
- Порядок `syncNow`:
  1. local = `store.load`;
  2. `GET`; 404 → remote пуст;
  3. merged = `merge(local, remote)`;
  4. `store.save(merged)`;
  5. если `digest(merged) !== remoteDigest` → `PUT` с `baseDigest = remoteDigest`; на 409 — слить с присланным и повторить один раз.
- Когда запускается:
  - при открытии корпуса;
  - через 5 с после последней записи попытки (`schedule`, debounce);
  - при `visibilitychange → hidden` (`fetch` с `keepalive: true`);
  - после возвращения в сеть (`online`).
- Нет пользователя или согласия → `local_only`. Смена пользователя (`me.id` изменился) → `dispose` и новый экземпляр со своим `userKey`. Прогресс `anon` с чужим не сливается.
- Строка статуса в уроке и списке: «Сохранено в облаке», «Данные на этом устройстве», «Ждёт синхронизации», «Не удалось синхронизировать — повторим позже». Ключи `course.sync.*` во всех трёх локалях.

- [ ] **Step 1: failing tests** (поддельные `fetch`, `store`, часы):
  - сценарий «телефон офлайн + ПК» → оба получают 5 попыток (Review Focus 2);
  - 409 → слияние и повторный `PUT` (Review Focus 5);
  - 413, 401, 503 → `error` или `local_only`, локальный прогресс цел, урок не трогается (Review Focus 4);
  - смена `me.id` → чужой `GET` не вызывается для `anon` (Review Focus 3);
  - нет согласия → ни одного сетевого вызова.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course progress sync client`; push.

### Task 4: Возвращение к уроку через сутки

**Files:** Modify `public/js/course-evidence.js` (`dueReturns`), `public/js/course-reader.js` (блок на списке уроков), `tests/courseEvidence.test.js`, `tests/courseReader.test.js`, локали

**Interfaces:**
- Produces:
  - `dueReturns(progress, lessons, now) -> Array<{ lessonId, dueAt, reason: 'scheduled'|'needs_review' }>`;
  - урок с `lessonSkill ∈ { independent, supported }` должен вернуться в `t + 24 ч`, где `t` — время последней transfer-попытки;
  - `needs_review` должен вернуться сразу;
  - после transfer-попытки по **новому** отпечатку (другой вариант) возвращение закрыто до следующего цикла, то есть через ещё 3 дня;
  - список сортируется по `dueAt`.
- Формат урока (дописать в `COURSE_FORMAT_V1.md` и валидатор): у задания необязательное `variants: [{ id, prompt:{ru}, spec, model? }]`. Вариант подменяет `prompt`, `spec` и `model` задания; ID вариантов уникальны в задании. Отпечаток попытки считается с `variant = { id }`.
- Список уроков: блок «Вернуться» с кнопкой «Новый вариант ситуации» открывает урок на transfer-задании с новым вариантом (`variant` = следующий по счётчику). Если вариантов в данных урока нет, кнопка открывает урок без обещания «нового варианта» с текстом «Повторить урок».

- [ ] **Step 1: failing tests:**
  - урок пройден в `t` → в `t + 23 ч` не показан, в `t + 25 ч` показан;
  - после попытки по новому варианту — скрыт до `+3 дня`;
  - `needs_review` — сразу;
  - без вариантов — текст «Повторить урок».
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): next-day return to a lesson`; push.

### Task 5: Подключение, smoke, выпуск

- [ ] **Step 1:** Подключить `course-sync.js` в `library.html` после `course-store.js`, обновить precache `sw.js`, lockstep. `npm test` целиком → зелёный.
- [ ] **Step 2:** Smoke (структура P3 Task 9) с двумя браузерными контекстами одного тестового пользователя:
  - попытка в A → через синхронизацию видна в B;
  - офлайн в A → попытка → онлайн → видна в B;
  - другой пользователь не видит.
- [ ] **Step 3:** Отчёт `docs/research/hebrew-course/2026-11-05-p7-codex-report.md`. Выпуск — только после «да» владельца, место на проде ≥ 6 ГиБ. На проде проверить своим owner-входом: прогресс урока «Кафе» одинаков на ПК и телефоне (это проверяет владелец).
