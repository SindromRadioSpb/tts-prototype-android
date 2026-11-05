# Курс иврита P3 — урок в Зале: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** корпус `course:ulpan` в Читальном зале. Видна только роли owner. Показывает список уроков со статусами и урок:
цель, сцена репликами, учебный текст, задания с проверкой (P1), учётом попыток и помощи (P2), экранной ивритской
клавиатурой, карточкой слова по касанию и ▶ у реплик, если есть проверенные записи. Телефон и ПК.

**Architecture:** по образцу атласа (разведка — `docs/research/hebrew-course/2026-11-05-p3-recon.md`, далее «R§N»):
- данные курса на томе (`DATA_DIR/course/<id>/`), их отдаёт публичный static-маршрут `/data/course`;
- собственный модуль `public/js/course-reader.js` с `mount → { home, openLesson, destroy }`;
- маршрут `#room=course:<id>&les=…&st=…` в `room-b6-core.js`, диспетчер в `library-ui.js`;
- строки урока — свои `.course-line[data-ref]` с общим `ReaderMorph` через `attachReaderMorph` (R§4);
- синхронизации нет: прогресс локальный (P2 `localStore`) и разделён по пользователю. P7 добавит облако.

**Tech Stack:** ванильный JS (IIFE + `module.exports`), `node:test` + `linkedom` для DOM-тестов, Playwright для браузерного smoke (как `scripts/atlas/atlas-browser-smoke.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` §4.1, §4.2 (п. 1, 2, 5, 7, 8), §4.4, §4.6, §6а; дефекты прототипа — `docs/research/hebrew-course/2026-11-05-cafe-review/REVIEW.md` (H2, H5, M3–M6, M8–M10); P1 — `…-p1-core.md`; P2 — `…-p2-evidence.md`.

## Global Constraints

- Ветка `feat/course-room` от `origin/main` с влитой `origin/feat/course-evidence` (она включает P1); рабочая копия `.worktrees/course-room`. Пуш ветки после каждой задачи.
- **Выпуск в прод — только по решению владельца.** Задача 9 готовит выпуск, но не деплоит.
- Корпус виден только при `CloudSync.me()?.role === 'owner'` (флаг реестра `ownerOnly: true`). Это ограничение интерфейса: данные `/data/course` публичны, как у атласа (R§7). Владелец принял это для пилота.
- Ученику — короткие человеческие сообщения. Подробности засчитывания — только в свёрнутом блоке «Как это засчитано» (M6).
- Полное письмо берётся из `plain`, огласовка — из `niqqud`, переключение — по `room.niqqudMode` (R§4). Огласовки никогда не снимаются в коде.
- Открытие урока, реплики или карточки слова не пишет ни материал, ни `review_log` (R§6).
- Нет клипа — нет ▶. Браузерный SpeechSynthesis для курса не используется.
- Все строки интерфейса — ключи `course.*` в `public/i18n/locales/{ru,en,he}.js` с одинаковым набором ключей (`tests/i18n.smoke.js`). Fallback в коде не заменяет запись в локаль.
- Lockstep версий (`CACHE_VERSION` в `public/sw.js`, `APP_VERSION` в `public/index.html`, footer `public/library.html`, `?v=` у изменённых файлов) — по `tests/helpers/releaseLock.js` (R§3).
- Проверки UI — по `docs/architecture/AGENT_UI_GUIDE.md`: 380 px и десктоп, RTL/LTR, scoped-стили, без горизонтальной прокрутки.

## Review Focus

1. Быстрое переключение корпусов во время загрузки урока: поздний ответ не перерисовывает новый корпус (render token, R§1) — тест в Task 5.
2. Перезагрузка посреди задания сохраняет ответ, помощь и позицию; кнопка Назад возвращает к списку уроков — тест в Task 4 (DOM) и Task 9 (браузер).
3. Смена пользователя на одном устройстве не показывает чужой прогресс — тест в Task 2.
4. «Проверка недоступна» (`unknown`) не запирает урок: «Сверить с образцом» записывает канал `self` и открывает «Дальше» (H2) — тест в Task 4.
5. Повтор с замедлением сохраняет скорость (H5); уход из урока останавливает звук — тест в Task 7.

---

### Task 1: Данные курса — сборка и маршрут

**Files:**
- Create: `scripts/course/build-course-data.cjs`, `tests/courseData.test.js`
- Modify: `server.js` — рядом с маршрутом `/data/atlas` (R§2, `server.js:700–706`)

**Interfaces:**
- Consumes: `scripts/course/validate-course.cjs` (P1) как модуль: вынести из CLI функцию `validateCourseDir(dir) -> Issue[]`, если её ещё нет.
- Produces: CLI `node scripts/course/build-course-data.cjs <srcDir> <outRoot>`. Он валидирует курс (есть ошибки → выход 1, ничего не пишет) и пишет `<outRoot>/<courseId>/course.json`, `lexicon.json`, `lessons/<id>.json` и `manifest.json` = `{ courseId, version, builtAt, files: { "<rel>": "<sha256>" } }`. Маршрут `app.use('/data/course', express.static(path.join(DATA_DIR, 'course'), { index: false, fallthrough: true, maxAge: '300s' }))` стоит до `express.static(public)`, заголовки — как у JSON атласа (`public, max-age=300, must-revalidate`).

- [ ] **Step 1: failing tests** — `build-course-data` на `tests/fixtures/course/mini` в `os.tmpdir()` → 4+ файла и `manifest.json`, в котором sha256 совпадает с файлами; сломанная копия (без `transfer`) → выход 1, каталог не создан; текстовая проверка `server.js` (как `tests/atlasReader.test.js:11–20`): маршрут `/data/course` объявлен раньше `express.static(path.join(__dirname, "public")`, в блоке есть `fallthrough: true` и `max-age=300`.
- [ ] **Step 2:** `node --test tests/courseData.test.js` → FAIL. **Step 3:** implement. **Step 4:** → PASS.
- [ ] **Step 5:** commit `feat(course): course data build and /data/course route`; push.

### Task 2: Прогресс по пользователю

**Files:** Modify `public/js/course-store.js`, `tests/courseStore.test.js`

**Interfaces:**
- Produces: `localStore(storage, { userKey })`; ключ записи — `lp.course.<userKey>.<courseId>.v1`; `userKey` = `String(me.id)` или `'anon'`. Старый ключ `lp.course.<courseId>.v1` (P2) читается один раз как источник для `'anon'` и переносится (копия + удаление старого после успешной записи).

- [ ] **Step 1: failing tests:**
  - пользователи `u1` и `u2` на одном `storage` видят каждый свой прогресс (Review Focus 3);
  - старый ключ переносится к `anon`;
  - сбой записи при переносе оставляет старый ключ на месте.
- [ ] **Steps 2–4:** fail → implement → pass. **Step 5:** commit `feat(course): per-user progress keys`; push.

### Task 3: Реестр и маршрут `course:`

**Files:**
- Modify: `public/js/corpus-registry.js` (запись рядом с `atlas:a97002`, R§1)
- Modify: `public/js/room-b6-core.js:140, 146, 196, 263, 328, 332` (R§1)
- Modify: `public/js/library-ui.js:13975` (`authorizedCorpusOptions` — фильтр `ownerOnly`)
- Modify: `public/i18n/locales/{ru,en,he}.js` (ключи `course.corpus.title`, `course.corpus.desc`)
- Test: `tests/roomPresentationRoutes.test.js` (дописать рядом с round trip атласа, строка 417)

**Interfaces:**
- Produces:
  - реестр: `{ id: 'course:ulpan', kind: 'course', ownerOnly: true, title: { key: 'course.corpus.title', fb: 'Курс иврита' }, desc: { key: 'course.corpus.desc', fb: 'Уроки ульпана: ситуации, тексты, задания' } }`;
  - `isCourse(value)` = `/^course:[a-z0-9-]{1,40}$/`;
  - якорь `{ lessonId: string, step: number }` ↔ параметры адреса `les`, `st`;
  - `authorizedCorpusOptions()` исключает `ownerOnly`, если `CloudSync.me()?.role !== 'owner'`.

- [ ] **Step 1: failing tests:**
  - round trip `#room=course:ulpan&les=L001-cafe&st=3` → `{ surface:'corpus', corpus:'course:ulpan', anchor:{ lessonId:'L001-cafe', step:3 } }` → тот же адрес;
  - `course:Ulpan!` не проходит;
  - `les` с недопустимыми символами отбрасывается;
  - атласные round trip не меняются.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course corpus registry entry and room route`; push.

### Task 4: `course-reader.js` — список уроков, урок, задания

**Files:**
- Create: `public/js/course-reader.js`, `public/css/course-reader.css`, `tests/courseReader.test.js`
- Modify: `public/i18n/locales/{ru,en,he}.js` (ключи `course.*` из этой задачи)
- Modify: `public/js/course-format.js`, `docs/planning/course/COURSE_FORMAT_V1.md` — необязательные поля урока `grammar: { "<ref>": { title:{ru}, body:{ru}, pattern?: [he] } }` и задания `grammarRef`; валидатор: неизвестный `grammarRef` → `REF_UNKNOWN`

**Interfaces:**
- Consumes: `CourseHebrew`, `CourseChecker.buildIndex/assess`, `CourseEvidence.*`, `CourseStore` (P1, P2, Task 2); данные Task 1.
- Produces:
  - `CourseReader.factory(document) -> R` для тестов;
  - `CourseReader.mount(container, opts) -> { home(), openLesson(lessonId, step), destroy() }`, где `opts = { courseId, base: '/data/course', T, layers: { niqqudMode, ruMode, translitOn }, store, now: () => number, onState(anchor), onWords(root, lesson) }`;
  - разметка строк для Task 5: `.course-line[data-ref="<lessonId>/<turnId|paraId>"] > [data-col="he"|"ru"]`, `data-col="he"` с `dir="rtl" lang="he"`.

Поведение:
- **Список уроков.** Название и статус `lessonSkill`. Статусы: «Не начат», «В процессе», «Пройден с опорой», «Пройден самостоятельно», «Нужен повтор». Сверху счётчик `courseCounts` по-человечески: «Введено N · Узнаёте M · Отвечаете сами K · Применили после перерыва J».
- **Урок — шаги:**
  1. цель;
  2. сцена: реплики «пузырями», роль слева/справа, перевод скрыт и открывается касанием — открытие записывается как помощь `translation` для заданий текущего шага;
  3. учебный текст, если есть;
  4. задания по одному, кнопки «Назад» и «Дальше».

  Шаг и ответы восстанавливаются из `store` и `anchor`.
- **Задания:**
  - `choice` — проверка при выборе, повторное событие не дублирует (P2);
  - `text` и `cloze` — поле ввода `dir=rtl` + кнопка «Проверить», клавиатура из Task 6 (подключается в Task 6);
  - `match` — пары касанием: выбрать левую, потом правую карточку; без `<select>` (M9);
  - `scene` — реплика собеседника + ответ.
- **Отзыв:**
  - `accepted` → «Смысл передан.»;
  - `form` / `partial` / `mismatch` → `message.ru` из P1;
  - первая ошибка в `choice` не раскрывает правильный ответ (M3);
  - `unknown` → «Проверка недоступна для этого варианта.» + кнопка «Сверить с образцом»: показывает образец, записывает попытку каналом `self` и открывает «Дальше» (H2).
- **Помощь:** «Подсказка» (до двух, `hint`), «Показать образец» / «Скрыть образец» (`model`, `aria-expanded`) — через `openAid`. Под заданием свёрнутый `<details>` «Как это засчитано» — канал, помощь, первая ли попытка.
- **Микрокарта грамматики:** если у задания `grammarRef`, кнопка «Правило» открывает карточку из `lesson.grammar[ref]`, не выше 70 vh, с прокруткой (M8).
- **destroy:** снимает обработчики, отменяет незавершённые `fetch` через `AbortController`, вызывает `stopAudio` из Task 7, если он есть.

- [ ] **Step 1: failing tests** (linkedom, фикстура Task 1 через поддельный `fetch`):
  - список показывает 2 урока со статусом «Не начат» и счётчик «Введено 0»;
  - `openLesson('L001-cafe', 0)` рисует цель и реплики сцены: `.course-line[data-ref="L001-cafe/<turnId>"]` × 8, у ивритской ячейки `dir="rtl"`;
  - `niqqudMode: 'off'` показывает `plain` (`קפה`), `'on'` — `niqqud` (`קָפֶה`);
  - ввод `תֵּה בְּלִי סֻכָּר` в задании `6` → «Смысл передан.», в `store` одна попытка `write_he`, `first: true`;
  - «Показать образец», затем верный ответ → в «Как это засчитано» видно «с опорой»; после повторного `mount` с тем же `store` — то же (Review Focus 2);
  - `unknown` → кнопка «Сверить с образцом» → попытка `self`, «Дальше» активна (Review Focus 4);
  - `match` — пары касанием, без `<select>`;
  - `destroy()` отменяет начатую загрузку: поздний ответ ничего не рисует.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course reader — lesson list, lesson steps, tasks, aids`; push.

### Task 5: Встройка в Зал

**Files:**
- Modify: `public/js/library-ui.js` — диспетчер рядом с `:12843`; новая `renderCourseCorpus(courseId, token)` по образцу `renderAtlasCorpus` (`:13187–13230`); `attachCourseWords` по образцу `attachAtlasWords` (`:13307–13346`); выход — рядом с `:12838` и в `leaveRoom` (`:5489–5493`)
- Test: `tests/courseRoom.test.js`

**Interfaces:**
- Consumes: `CourseReader.mount` (Task 4), `attachReaderMorph(mount, overrides)` (R§4), `roomCommitPresentation`, `corpusSwitcherBar`, `saveReaderCfg`.
- Produces:
  - `renderCourseCorpus`: проверка `token !== corpusRenderToken`, переключатель корпусов, `mount` со слоями из `readerCfg`, `onState` → `roomCommitPresentation`, восстановление якоря `les/st`;
  - `attachCourseWords`: `cellSelector: '.course-line[data-ref] > [data-col="he"]'`, `rowSelector: '.course-line[data-ref]'`, `rowIndexAttribute: 'data-ref'`, getters из пары урока; `source_kind: 'course_line'`; сохранение места выключено (передать `saveOccurrence: null` или эквивалент, найденный в `attachReaderMorph`); сохранение слова в «Мой словарь» работает;
  - при смене корпуса и в `leaveRoom` вызывается `courseReader.destroy()`.

- [ ] **Step 1: failing tests:**
  - текстовые проверки `library-ui.js`: диспетчер `course:` и вызов `destroy` при смене корпуса и в `leaveRoom`;
  - linkedom-тест `renderCourseCorpus`: два вызова подряд с разными токенами — рисует только последний (Review Focus 1);
  - не-owner не видит корпус в `authorizedCorpusOptions`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course corpus in the Reading Room`; push.

### Task 6: Ивритская экранная клавиатура

**Files:** Create `public/js/course-keyboard.js`, `tests/courseKeyboard.test.js`; Modify `public/js/course-reader.js` (подключение к полям `text`/`cloze`), `public/css/course-reader.css`

**Interfaces:**
- Produces: `CourseKeyboard.attach(input: HTMLTextAreaElement|HTMLInputElement, container) -> { detach() }`.
  - Раскладка — стандартная израильская SI-1452: 3 ряда букв `קראטוןםפ / שדגכעיחלךף / זסבהנמצתץ`, плюс пробел, ⌫ и «?».
  - Вставка — в позицию каретки (`selectionStart/End`), с заменой выделения. После вставки фокус и каретка остаются в поле, генерируется событие `input`.
  - Кнопки — `<button type="button">` с `aria-label` на русском («буква алеф» и т. д.), высота не менее 44 px. На 380 px нет горизонтальной прокрутки.
  - Свёрнута по умолчанию; кнопка «Клавиатура иврита» под полем.

- [ ] **Step 1: failing tests** (linkedom):
  - каретка в середине `תה|סוכר` → «ב» вставляется в позицию;
  - выделение заменяется;
  - ⌫ удаляет символ перед кареткой;
  - вставка генерирует `input`;
  - есть все 27 букв (22 + 5 конечных).
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): on-screen Hebrew keyboard`; push.

### Task 7: Звук урока

**Files:** Create `public/js/course-audio.js`, `tests/courseAudio.test.js`; Modify `public/js/course-reader.js`

**Interfaces:**
- Produces: `CourseAudio.create({ base, courseId, lessonId, AudioCtor = Audio, fetch }) -> { load(): Promise<void>, has(turnId): boolean, play(turnId), setRate(r: 1|0.85|0.75), stop() }`.
  - Манифест — `<base>/<courseId>/audio/<lessonId>.json` = `{ "<turnId>": "<audioKey>" }`, источник — `/api/audio/<audioKey>` (как атлас, R§4).
  - Нет манифеста или нет ключа → `has` = `false`, ▶ не рисуется.
  - Скорость хранится в объекте и применяется к каждому новому `Audio` и при каждом `play` (H5).
  - `stop()` ставит паузу и убирает `src`.
- В `course-reader`: ▶ у реплики при `has(turnId)`; выбор скорости 1 / 0,85 / 0,75; `destroy` вызывает `stop`. Прослушивание без открытого текста — канал `listen` для заданий «на слух» (`task.channel` включает `listen`).

- [ ] **Step 1: failing tests** (поддельные `Audio` и `fetch`):
  - `setRate(0.75)` → `play('t1')` → `play('t1')` снова → у обоих `Audio` `playbackRate === 0.75` (Review Focus 5);
  - без манифеста `has` = `false`;
  - `stop()` после `play` → `paused`, пустой `src`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): lesson audio host with persistent rate`; push.

### Task 8: Подключение, версии, локали

**Files:** Modify `public/library.html` (CSS в `<head>` рядом со строкой 38; скрипты после атласа, порядок: `course-hebrew`, `course-checker`, `course-format`, `course-evidence`, `course-store`, `course-keyboard`, `course-audio`, `course-reader`), `public/sw.js` (precache тех же URL с `?v=`), версии по lockstep, `public/i18n/locales/*.js` (`?v=` локалей в HTML), тесты lockstep.

- [ ] **Step 1: failing test** `tests/courseWiring.test.js`:
  - в `library.html` скрипты курса подключены после `atlas-train-ui.js` в указанном порядке;
  - каждый URL с `?v=` есть в precache `sw.js` (`assertPrecachedExactly`);
  - `lockstepVersion({ studio, room, sw })` проходит.
- [ ] **Step 2:** fail. **Step 3:** подключить и поднять версии (следующая после текущей в main: прочитать `APP_VERSION`, +1 в последней части). **Step 4:** `npm test` целиком → зелёный.
- [ ] **Step 5:** commit `chore(course): wire course modules into the Reading Room (<version>)`; push.

### Task 9: Браузерный smoke и подготовка выпуска

**Files:** Create `scripts/course/course-browser-smoke.cjs` (структура `scripts/atlas/atlas-browser-smoke.cjs`, R§10); отчёт `docs/research/hebrew-course/2026-11-05-p3-codex-report.md`

- [ ] **Step 1:** Подготовить данные:
  - `node scripts/course/build-course-data.cjs tests/fixtures/course/mini .tmp/course-smoke-data/course`;
  - сервер с изолированными настройками: `PORT=3399`, `DATA_DIR=.tmp/course-smoke-data`, без БД владельца.
- [ ] **Step 2:** smoke, RU × 390 и 1440, `serviceWorkers: 'block'`, вход под тестовым owner:
  - корпус в переключателе → список → урок → прямая ссылка `les/st` → reload → Back;
  - ответ → образец → повтор;
  - `unknown` → самопроверка → «Дальше»;
  - касание слова → карточка;
  - клавиатура вводит в каретку;
  - нет горизонтальной прокрутки, нет `pageerror`;
  - не-owner корпуса не видит;
  - в `review_log` и в материалах нет новых записей.
  
  Результат — `report.json` и скриншоты в `.tmp/course-smoke/`.
- [ ] **Step 3:** Отчёт с командами, итогами `npm test` и smoke, скриншотами 390/1440 (положить в `docs/research/hebrew-course/2026-11-05-p3-screens/`), отступлениями и непроверенным (физический телефон, офлайн PWA, звук — нет записей до P4).
- [ ] **Step 4:** commit `test(course): browser smoke and P3 report`; push. **В прод не выпускать** — выпуск после приёмки Claude и решения владельца.
