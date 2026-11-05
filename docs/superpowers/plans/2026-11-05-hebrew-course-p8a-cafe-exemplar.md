# Курс иврита P8а — образцовый урок «Кафе»: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** образцовый урок «Кафе» в курсе `course:ulpan`, движок курса, доделанный под него, и архив для dots (слепая проверка + места под медиа) с медиа Claude в стиле A.

**Architecture:**
- Урок описывается данными формата v1 с необязательными расширениями: `flow` (части и шаги), сцена-граф (`choices`), медиа-места, новые типы заданий.
- Ридер (`course-reader.js`) разбивается: типы заданий уходят в реестр `course-tasks.js`, сцена — в `course-scene.js`, медиа — в `course-media.js`.
- Старые уроки без новых полей рисуются как раньше.
- Исходник урока — `content/course/ulpan/`, собственный текст Claude, коммитится. Сборка кладёт данные на том, как в P3.

**Tech Stack:** Node 22, `node:test`, `linkedom`, Playwright (уже в devDependencies) для рендера иллюстраций и smoke; без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-p8a-cafe-exemplar-design.md` (далее «дизайн»); спека курса `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md`; формат `docs/planning/course/COURSE_FORMAT_V1.md`; рецензия наброска `docs/research/hebrew-course/2026-11-05-cafe-review/REVIEW.md`.

## Global Constraints

- Каждая ивритская строка — пара `{niqqud, plain}`; plain не получается удалением огласовок; TTS получает только `niqqud`.
- Голоса только `he-IL-Wavenet-C` (Тамар, абзацы текста) и `he-IL-Wavenet-D` (Ори); роль ученика не озвучивается.
- Внутри картинок нет ивритского текста; запрещены Marvel, Дина и Давид Лерера; запрещены SVG, GIF, HTML, JS и Lottie как файлы медиа. Лимиты: картинка ≤ 400 КБ, анимация ≤ 1,5 МБ, длинная сторона ≤ 1600 px, у каждого медиа `alt.ru`.
- Стиль A: 5–6 цветов палитры LinguistPro, мягкий свет сверху слева, без чёрных контуров, крупные формы, один главный предмет на кадр, светлая подложка со скруглением.
- `prefers-reduced-motion: reduce` → неподвижный кадр. Медиа не загрузилось → урок полностью проходим.
- Строки интерфейса — ключи `course.*` в `ru`, `en`, `he` (fallback `tt()` мёртв).
- Экран ученика не показывает служебные формулировки; подробности засчитывания только в свёрнутом «Как это засчитано».
- Лерер — только структура и правила; его тексты, диалоги и упражнения не копируются.
- Существующие тесты курса (84 на 2026-11-05) остаются зелёными; отпечатки заданий без новых полей не меняются.
- Выпуск: lockstep `APP_VERSION` + `CACHE_VERSION` + `?v=` + `SHELL_INTEGRITY_PATHS`; место на проде ≥ 6 ГиБ; только после «да» владельца. MP3 и архивы dots не коммитятся.
- Рабочая копия — `.worktrees/course-cafe`, ветка `feat/course-cafe` от `origin/main`.

## Review Focus

1. Владелец с 3 старыми попытками урока P3 открывает новую версию `L001-cafe` → урок открывается, старые попытки не удалены, по изменённым заданиям успехи не засчитаны — тест в Task 3.
2. Ученик выбрал ветку в сцене, закрыл вкладку посреди сцены → после перезагрузки он на той же реплике с тем же выбором — тест в Task 4.
3. Картинка карточки заказа не загрузилась (404) → вместо неё запасная карточка значками и словами, задание проверяется как обычно — тест в Task 6.
4. Экран 320 px: плитки сборки переносятся по строкам RTL, у страницы нет горизонтальной прокрутки — smoke в Task 13.
5. Режим «сначала на слух» без звука (нет манифеста или офлайн) → сцена честно показывается текстом, канал `listen` не засчитывается — тест в Task 4.

---

### Task 1: Формат v1 с расширениями P8а и исходник курса

**Files:**
- Modify: `public/js/course-format.js`, `docs/planning/course/COURSE_FORMAT_V1.md`, `scripts/course/build-course-data.cjs` (копирует `media/*` в выдачу и в `manifest.json`)
- Create: `content/course/ulpan/course.json`, `content/course/ulpan/lexicon.json`, `content/course/ulpan/lessons/L001-cafe.json` (временно — копия фикстуры P3 с `version` +1, чтобы конвейер работал до Task 9)
- Test: `tests/courseFormat.test.js`, `tests/courseData.test.js`

**Interfaces:**
- Produces (поля урока, все необязательные):
  - `flow: [{id, title:{ru}, steps:[Step]}]`, где `Step` = `{kind:'scene', mode:'listen'|'read'}` | `{kind:'text'}` | `{kind:'task', ref:taskId}` | `{kind:'grammar', ref:grammarId}` | `{kind:'summary'}`;
  - `scene.turns[].choices: [{id, he, ru:{ru}, next:turnId, verdict:'ok'|'repair'}]` — у реплики роли `learner`; `scene.image?: mediaId`;
  - `media: [{id, kind:'image'|'sequence', target, purpose:{ru}, brief:{ru}, alt:{ru}, aspect:'16:9'|'4:3'|'1:1'|'3:4', src?, frames?:[file], fallback:{ru:{ru}, icons?:[string]}}]` — `sequence` = 2–4 неподвижных кадра, браузер сменяет их сам (замена анимированного webp, без проигрывателей);
  - `grammar[id].line?: {he, slots:[{from:int, to:int, label:{ru}}]}` — микрокарта; `from/to` — индексы токенов `he.plain`;
  - `skills: [{id, label:{ru}, tasks:[taskId]}]`;
  - типы заданий `tiles` (`tiles:[he]`, `distractors?:[he]`) и `order` (`card:{slotId:key}`, `cardMedia:mediaId`); у `match` — `pairs[].media?: mediaId` вместо `label`.
- Валидатор: новые коды ошибок `FLOW_REF_UNKNOWN`, `SCENE_NEXT_UNKNOWN`, `SCENE_UNREACHABLE`, `SCENE_CYCLE`, `MEDIA_FALLBACK_MISSING`, `GRAMMAR_SLOT_RANGE`, `SKILL_TASK_UNKNOWN`.
- `fingerprint` (`course-evidence.js`) добавляет `tiles`, `distractors`, `card`, `cardMedia` в список необязательных семантических ключей.

- [ ] **Step 1: failing tests** — `validateLesson` на уроке с `flow` на несуществующее задание → `FLOW_REF_UNKNOWN`; `choices[].next` на неизвестную реплику → `SCENE_NEXT_UNKNOWN`; недостижимая реплика → `SCENE_UNREACHABLE`; цикл → `SCENE_CYCLE`; медиа без `fallback.ru` → `MEDIA_FALLBACK_MISSING`; `slots.to` за концом строки → `GRAMMAR_SLOT_RANGE`; урок фикстуры mini без новых полей → ни одной новой ошибки; `fingerprint` задания без новых полей равен значению до изменения (зафиксировать строку из текущего кода); `buildCourseData` копирует `media/a.png` и кладёт его SHA-256 в `manifest.files['media/a.png']`.
- [ ] **Step 2:** запустить `node --test tests/courseFormat.test.js tests/courseData.test.js` → FAIL.
- [ ] **Step 3:** реализовать валидацию в `course-format.js`, копирование медиа в `build-course-data.cjs`, ключи отпечатка; дописать раздел «P8а» в `COURSE_FORMAT_V1.md`; создать `content/course/ulpan/`.
- [ ] **Step 4:** тесты + `npm run course:validate -- content/course/ulpan` → PASS, 0 ошибок.
- [ ] **Step 5:** commit `feat(course): P8a format extensions and course source`; push.

### Task 2: Реестр типов заданий

**Files:**
- Create: `public/js/course-tasks.js`
- Modify: `public/js/course-reader.js` (`renderTask` вызывает реестр), `public/library.html` (подключение перед `course-reader.js`), `public/sw.js` (precache)
- Test: `tests/courseTasks.test.js`, существующий `tests/courseReader.test.js`

**Interfaces:**
- Produces: `CourseTasks.register(type, { render(ctx) })`, `CourseTasks.get(type)`; `ctx = { body, task, ui, el, button, hebrewElement, hebrewButton, submit(value, channel, custom?), persist(), T, media }`.
- Перенести без изменения поведения: `choice`, `match`, `text`, `cloze`, `scene`.

- [ ] **Step 1: failing test** — `CourseTasks.get('choice')` возвращает объект с `render`; неизвестный тип → `null`, ридер показывает «Задание этого типа не поддерживается» и не падает.
- [ ] **Step 2:** FAIL. **Step 3:** вынести рендеры в реестр. **Step 4:** все тесты курса (`node --test tests/course*.test.js`) PASS без правки их ожиданий.
- [ ] **Step 5:** commit `refactor(course): task type registry`; push.

### Task 3: Части урока, точка продолжения, итог по умениям (E8, E9)

**Files:** Modify `public/js/course-reader.js`, `public/js/course-evidence.js` (`skillSummary`), локали; Test `tests/courseReader.test.js`, `tests/courseEvidence.test.js`

**Interfaces:**
- Produces: `E.skillSummary(progress, lesson) -> [{id, label, level:'independent'|'supported'|'not_yet'}]`; уровень умения — худший `attemptLevel` по последним принятым попыткам его заданий.
- Ридер: при наличии `flow` шаги берутся из него, заголовок показывает «Часть N из M · название»; без `flow` — прежний порядок (сцена, текст, задания). `readerState().position = {lessonId, part, step}`; старое `{lessonId, step}` читается как часть 0.
- Шаг `summary`: список умений человеческими фразами («Заказываете напиток — сами»), затем свёрнутое «Как это засчитано».

- [ ] **Step 1: failing tests** — урок с `flow` из 2 частей: «Дальше» на последнем шаге части 1 открывает часть 2; перезагрузка возвращает на сохранённый шаг части 2; `skillSummary` с одной самостоятельной и одной попыткой с подсказкой → `independent` и `supported`; **Review Focus 1:** прогресс с 3 попытками старого `L001-cafe` (версия 1) и урок версии 2 → открытие без исключения, `progress.attempts.length === 3`, задание с изменённым отпечатком не считается пройденным.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(course): lesson parts, resume and skill summary`; push.

### Task 4: Сцена — граф, «сначала на слух», проигрыватель (E1, E2)

**Files:** Create `public/js/course-scene.js`; Modify `public/js/course-reader.js`, `public/js/course-audio.js` (`playSequence(turnIds, {onTurn})`), `public/css/course-reader.css`, локали; Test `tests/courseScene.test.js`

**Interfaces:**
- Produces: `CourseScene.path(scene, choicesMade: {turnId: choiceId}) -> turnId[]` — путь от первой реплики по `next` и выбранным веткам до первой реплики с невыбранной веткой или до конца; `CourseScene.render(ctx, {mode})`.
- Режим `listen`: текст реплик скрыт, кнопка «Слушать сцену» играет путь подряд, у говорящего подсветка; на реплике ученика — варианты ответа кнопками **по-русски** (смысл, не иврит); выбор сохраняется в `ui.choices`; «Показать текст» = помощь `transcript` для заданий части.
- Режим `read`: те же реплики строками Зала (касание слова, ▶, огласовки, транслит, перевод по касанию); варианты ученика — ивритом.
- Ветка `verdict:'repair'` ведёт к реплике-ремонту Ори; итог сцены не засчитывается как доказательство (сцена — показ, доказательства дают задания).
- Без звука режим `listen` показывает текст и пометку «Запись недоступна — читаем».

- [ ] **Step 1: failing tests** — `path` линейной сцены = все реплики; после выбора `repair` путь проходит через реплику ремонта; **Review Focus 2:** выбор сохранён, повторный `mount` с тем же `Progress.reader` показывает ту же реплику и выбор; **Review Focus 5:** без аудио-манифеста режим `listen` рисует текст, попытки заданий части получают канал не `listen`; `playSequence` вызывает `onTurn` по порядку и останавливается на `stop()`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(course): branching scene with listen-first player`; push.

### Task 5: Плитки и сопоставление с картинками (E3, E4)

**Files:** Modify `public/js/course-tasks.js`, `public/css/course-reader.css`, локали; Test `tests/courseTasks.test.js`

**Interfaces:**
- `tiles`: плитки в банке и строка ответа RTL, касание переносит плитку; «Проверить» отправляет плитки через пробел в `C.assess` с каналом `cards`; порядок банка детерминированно перемешан по `task.id`; черновик в `ui.tiles`.
- `match`: правая колонка рисует `pairs[].media` картинкой (через `CourseMedia.figure`, Task 6), иначе `label`.

- [ ] **Step 1: failing tests** — плитки `['קָפֶה','גָּדוֹל']` в верном порядке → `accepted`; `['גָּדוֹל','קָפֶה']` → `mismatch` с сообщением о порядке из `orderRules`; повторный `mount` восстанавливает собранную строку; `match` с `media` рисует `<img>` с `alt` из медиа.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(course): tile building and picture matching`; push.

### Task 6: Медиа, карточка заказа, микрокарта (E5, E6, E7 — показ)

**Files:** Create `public/js/course-media.js`; Modify `public/js/course-tasks.js` (тип `order`), `public/js/course-reader.js` (медиа у `target`, кнопка «Правило» открывает микрокарту), `server.js` (`/data/course/*/media/*` → `Cache-Control: public, max-age=31536000, immutable`), `public/css/course-reader.css`; Test `tests/courseMedia.test.js`, `tests/courseData.test.js`

**Interfaces:**
- Produces: `CourseMedia.figure(media, {base, reducedMotion, el}) -> HTMLElement` — `<figure class="course-media" data-media>` с `aspect-ratio`, `<img loading="lazy" decoding="async">`; `sequence` сменяет кадры каждые 1,2 с один раз и останавливается на последнем; `reducedMotion` → сразу последний кадр; `error` у картинки → figure заменяется запасной карточкой `fallback` (значки + текст), `alt` не выводится текстом.
- `order`: карточка заказа (`cardMedia` или запасная карточка из `card` и подписей слотов урока) + поле ответа/клавиатура; проверка через `C.assess` со `spec` задания.
- Микрокарта: строка `grammar.line.he` в RTL, токены слотов подсвечены, подписи ролей под строкой; помещается в 360×640 без прокрутки.

- [ ] **Step 1: failing tests** — **Review Focus 3:** событие `error` у картинки `order` → видна запасная карточка, ответ `אֶפְשָׁר תֵּה גָּדוֹל בְּלִי סֻכָּר לָקַחַת` → `accepted`; `reducedMotion:true` у `sequence` → один `img` с последним кадром; медиа с `target:'task/6'` стоит перед заголовком задания 6; маршрут медиа отдаёт `immutable`; микрокарта с 2 слотами рисует 2 подсвеченные группы.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(course): lesson media, order card and grammar micro-card`; push.

### Task 7: Архив для dots и приёмщик (E7 — конвейер)

**Files:** Create `scripts/course/export-dots-pack.cjs`, `scripts/course/import-dots-pack.cjs`, `scripts/course/dots-pack/README.dots.ru.md`, `scripts/course/dots-pack/review-form.ru.md`, `scripts/course/lesson-to-text.cjs`; Test `tests/courseDotsPack.test.js`

**Interfaces:**
- `node scripts/course/export-dots-pack.cjs <courseSrc> --lesson <id> --out <dir>` пишет `README.dots.ru.md`, `lesson.ru-he.md` (из `lesson-to-text.cjs`: части, сцена с ветками, текст, задания с ответами, грамматика), `lesson.json`, `review/form.ru.md`, `media/pack.json` = `{format:'course-dots-pack-v1', courseId, lessonId, lessonVersion, exportedAt, slots:[{id, kind, target, purpose, brief, alt, aspect, maxBytes, maxSide, context:{he, ru}}]}`, `media/style.ru.md`, `media/examples/<slotId>.*` (версии Claude), `media/characters.png` (лист персонажей), пустую `results/`.
- `node scripts/course/import-dots-pack.cjs <packDir> <courseSrc> [--dry-run]`: сигнатура байтов (`RIFF....WEBP`, `\x89PNG`, `\xFF\xD8\xFF`), размер, длинная сторона из заголовка, `results/<slot>.json` с `containsText:false` и `alt.ru`; файлы → `<courseSrc>/media/<sha256-16>.<ext>`; при другой `lessonVersion` принимаются только слоты с совпадающими `id/kind/target`; итог `accepted / rejected (причина) / skipped`; `review.html` — лист: версия Claude и версия dots рядом, бриф, `purpose`, контекстная строка, переключатель «выбрать».

- [ ] **Step 1: failing tests** — PNG под именем `.webp` → rejected «формат не совпадает с содержимым»; 600 КБ → rejected; `sequence` с одним кадром → rejected; пакет версии 1 при уроке версии 2 с переименованным слотом → один skipped; повторный импорт не добавляет файлов; `--dry-run` ничего не пишет; `lesson.ru-he.md` содержит каждую реплику сцены и каждый ответ-образец; README содержит запрет текста на картинке и чужих персонажей.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(course): dots pack export and importer`; push.

### Task 8: Инструменты качества иврита и пробы проверки

**Files:** Create `scripts/course/verify-hebrew.cjs`, `tests/courseProbes.test.js`; Test fixtures inline

**Interfaces:**
- `node scripts/course/verify-hebrew.cjs <courseSrc> --lesson <id> [--dicta]`: каждое слово всех пар сравнивается с `public/data/inflection/pealim-infl-v12.json.gz` (огласованная форма и полное письмо); с `--dicta` — второе мнение Dicta Nakdan последовательно, с паузой ≥ 1 с, с кешем в `.tmp/course-dicta-cache.json`; отчёт `content/course/ulpan/journal/<id>.verify.json`: `{word, niqqud, plain, pealim:'match'|'differs'|'absent', dicta?, note}`.
- `content/course/ulpan/probes/<lessonId>.json` = `[{taskId, input, expect:'accepted'|'mismatch'|'unknown', why}]`; `tests/courseProbes.test.js` прогоняет все пробы через `C.assess` и падает на расхождении.

- [ ] **Step 1: failing tests** — `verify-hebrew` на фикстуре: `סֻכָּר/סוכר` → `match`, придуманное слово → `absent`; probe-тест на фикстуре с одной намеренно неверной пробой → FAIL с её `why`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS (неверную пробу убрать).
- [ ] **Step 5:** commit `feat(course): hebrew verification and checker probes`; push.

### Task 9: Содержание урока «Кафе»

**Files:** Modify `content/course/ulpan/lexicon.json`, `content/course/ulpan/lessons/L001-cafe.json`; Create `content/course/ulpan/probes/L001-cafe.json`, `content/course/ulpan/journal/L001-cafe.md`

Это авторская работа Claude по дизайну §5; формат и проверки уже есть.

- [ ] **Step 1:** Перечитать у Лерера («Иврит! Большой понятный самоучитель») разделы о роде существительных и прилагательных, порядке «существительное + прилагательное», `יש/אין`; записать в журнал, какие правила и схемы взяты (без цитат).
- [ ] **Step 2:** Написать урок по дизайну §5.4:
  - 4 части `flow`;
  - сцена-граф: 2–3 развилки, ремонт;
  - ≥ 3 задания «только слух»;
  - учебный текст 40–60 слов;
  - ≥ 6 типов заданий;
  - перенос + 3 варианта возвращения;
  - 4 микрокарты, `skills`;
  - ~8 медиа-мест с `purpose` и `fallback`;
  - оба рода в образцах.
- [ ] **Step 3:** `node scripts/course/verify-hebrew.cjs content/course/ulpan --lesson L001-cafe --dicta`; каждое `differs/absent` разобрать в журнале (принято / исправлено / «учебная конструкция»).
- [ ] **Step 4:** Естественность ключевых фраз: поиск по субтитрам Медиатеки на проде (только чтение) и по израильским сайтам кафе; итог — таблица в журнале.
- [ ] **Step 5:** Пробы ≥ 60 (H1–H4, M1–M3 рецензии, оба рода, огласованный и неогласованный ввод, `עוֹד פַּעַם?`, согласие с неверным подтверждением). `node --test tests/courseProbes.test.js` → PASS; `npm run course:validate -- content/course/ulpan` → 0 ошибок; проверки графа без ошибок.
- [ ] **Step 6:** В журнал — таблица рубрики §7 «пункт → где выполнен».
- [ ] **Step 7:** commit `content(course): Cafe exemplar lesson`; push.

### Task 10: Медиа Claude в стиле A

**Files:** Create `scripts/course/illustrations/` (исходники-рисунки как JS-модули, возвращающие SVG-строку), `scripts/course/render-illustrations.cjs`; Output `content/course/ulpan/media/*.png`, `.tmp/course-dots/characters.png`

**Interfaces:**
- `node scripts/course/render-illustrations.cjs <courseSrc> --lesson <id>` рендерит каждый исходник через Playwright в PNG нужного `aspect` (длинная сторона 1200 px), проверяет ≤ 400 КБ и прописывает `src`/`frames` в `lesson.media`.

- [ ] **Step 1:** Лист персонажей: Ори, Тамар, ученик (два варианта рода) и Тимсах в стиле A. **Ворота: показать владельцу артефактом и получить «да» до Step 2.**
- [ ] **Step 2:** Нарисовать все места урока, включая `sequence` «чай вместо кофе» (3 кадра).
- [ ] **Step 3:** Рендер и проверка: 0 нарушений лимитов, ни одного текста в рисунках (только фигуры).
- [ ] **Step 4:** commit `content(course): Cafe illustrations, style A`; push.

### Task 11: Звук

**Files:** через инструменты P4 (`scripts/course/course-tts.cjs`, `course-asr-check.py`, `course-audio-manifest.cjs`), `content/course/ulpan/audio-review/L001-cafe.json`

- [ ] **Step 1:** Инвентарь реплик и абзацев (`inventory`); оценка символов; запуск синтеза WaveNet C/D с ключом из `.env` (локально).
- [ ] **Step 2:** Локальная сверка ivrit-ai по всем клипам; расхождения — в журнал; переозвучка по необходимости.
- [ ] **Step 3:** Лист прослушивания владельцу (`courseListeningSheet`). **Ворота: «да» владельца; только принятые клипы попадают в манифест.**
- [ ] **Step 4:** commit `content(course): Cafe audio review`; push (MP3 не коммитятся).

### Task 12: Архив dots и сравнение

- [ ] **Step 1:** `node scripts/course/export-dots-pack.cjs content/course/ulpan --lesson L001-cafe --out .tmp/course-dots/L001-cafe` + ZIP; передать владельцу путь и короткую инструкцию.
- [ ] **Step 2:** Владелец отдаёт архив dots и возвращает его с `results/` и `review/answers.md`.
- [ ] **Step 3:** `import-dots-pack.cjs --dry-run`, затем импорт; `review.html` — владелец выбирает по каждому месту. Ответы слепой проверки — в журнал с решением по каждому пункту.
- [ ] **Step 4:** commit `content(course): dots review and media choice`; push.

Если dots ещё не ответил, Task 13 выходит с медиа Claude, а Task 12 становится следующим выпуском данных (без кода).

### Task 13: Подключение, smoke, выпуск

- [ ] **Step 1:** Подключить `course-tasks.js`, `course-scene.js`, `course-media.js` в `library.html` и precache `sw.js`; lockstep версий; `npm test` → 0 ошибок.
- [ ] **Step 2:** Smoke `scripts/course/course-cafe-smoke.cjs` (Playwright): урок целиком на 320, 390 и 1440 px; с медиа, без медиа (404) и с `reducedMotion`; **Review Focus 4:** `document.documentElement.scrollWidth <= innerWidth` на каждом шаге 320 px; 0 ошибок JS.
- [ ] **Step 3:** Отчёт `docs/research/hebrew-course/2026-11-05-p8a-report.md`: что сделано, журнал качества, рубрика, открытые вопросы.
- [ ] **Step 4:** Выпуск — только после «да» владельца: место ≥ 6 ГиБ, сборка, данные курса и медиа на том, `/healthz`, SHA-256 опубликованных файлов. Владелец проходит урок на телефоне и ПК; перенос через 1–3 дня.
