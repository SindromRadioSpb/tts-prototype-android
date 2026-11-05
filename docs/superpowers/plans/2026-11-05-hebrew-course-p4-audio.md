# Курс иврита P4 — звук урока: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** записи реплик и абзацев урока голосами WaveNet C/D по огласованному тексту, локальная сверка
распознаванием, лист прослушивания для владельца и манифест урока **только из принятых владельцем записей**.
После этого у реплик в Зале появляется ▶ (плеер P3, `course-audio.js`).

**Architecture:** по образцу `scripts/atlas/atlas-tts.cjs` (inventory / bake / verify / index).
- Текст для речи даёт один модуль `public/js/course-speech.js`. Его используют и сборка звука, и проверки, поэтому показанное и озвученное совпадают по построению.
- Ключ записи — `computeAssetKey` из `db/premium/ttsAssetKey.js` (`assetType: 'row'`). Файлы ложатся в `audio-cache` на томе и отдаются существующим `GET /api/audio/:assetKey`.
- Манифест урока `audio/<lessonId>.json` = `{ "<turnId|paraId>": "<assetKey>" }`, формат P3.

**Tech Stack:** Node 22, `@google-cloud/text-to-speech` (уже в зависимостях; учётные данные — `GOOGLE_APPLICATION_CREDENTIALS` в окружении оператора), Python + `faster-whisper` для локальной сверки (вне `npm test`).

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` §3 (голоса), §4.7; замер голосов — `docs/research/hebrew-course/2026-11-05-cafe-audio/README.md`; плеер — P3 `public/js/course-audio.js`.

## Global Constraints

- Голоса — только `he-IL-Wavenet-[A-D]`; по умолчанию: роль `staff` → `he-IL-Wavenet-C`, остальные роли → `he-IL-Wavenet-D`, абзацы текста → `he-IL-Wavenet-C`. Chirp 3 HD запрещён (искажает огласовки, 4/16). Профиль: `{ language: 'he-IL', voiceName, speakingRate: 1.0, pitch: 0 }`, `PROFILE_ID = 'course-he-wavenet-v1'`.
- На вход синтеза — **всегда `he.niqqud`** той же строки, что показывается в уроке; `plain` в синтез не идёт.
- Ключи и учётные данные — только в окружении оператора. Ни в код, ни в отчёты, ни в журналы.
- Потолок на один запуск `bake` — 50 000 символов; выше — отказ до вызова Google.
- Аудио не отправляется в сторонние сервисы распознавания; сверка — локальной моделью `ivrit-ai--whisper-large-v3-turbo-ct2` из папки Компаньона.
- В манифест попадают только записи со статусом `ok` в файле прослушивания владельца. Нет файла — пустой манифест, ▶ нет.
- Ветка `feat/course-audio` от `origin/main` (после выпуска P3). Код не подключается к страницам, поэтому lockstep не нужен. Данные и записи на прод — отдельным шагом в Task 5, только с разрешения владельца.

## Review Focus

1. Реплику поправили после записи: новый ключ, старая запись в манифест не попадает, в инвентаре реплика видна как «нет записи» — тест в Task 1 и Task 4.
2. В файле прослушивания `ok` стоит для реплики, текст которой с тех пор изменился: такая отметка не действует — тест в Task 4.
3. Голос Chirp или незнакомый голос в `roles[].voice` — ошибка валидации, синтез не запускается — тест в Task 1.
4. Сбой Google на середине — уже готовые файлы сохраняются, повторный запуск досинтезирует только недостающие — тест в Task 2 (поддельный клиент).
5. Длина реплики больше 4 800 байт — отказ с указанием ref, а не тихая обрезка — тест в Task 1.

---

### Task 1: Текст для речи

**Files:** Create `public/js/course-speech.js`, `tests/courseSpeech.test.js`; Modify `public/js/course-format.js` (проверка `roles[].voice`), `docs/planning/course/COURSE_FORMAT_V1.md`

**Interfaces:**
- Produces (`CourseSpeech`):
  - `VOICE_RE = /^he-IL-Wavenet-[A-D]$/`;
  - `profileFor(voiceName) -> { language, voiceName, speakingRate: 1, pitch: 0 }`;
  - `speechItems(lesson) -> Array<{ ref: '<lessonId>/<id>', id, kind: 'turn'|'para', role, text, voiceName, bytes }>` — `text = he.niqqud`;
  - `checkItems(items) -> Issue[]` с кодами `VOICE_NOT_ALLOWED` и `TEXT_TOO_LONG` (> 4 800 байт UTF-8).
- `course-format.js`: `roles[].voice`, не подходящий под `VOICE_RE`, → error `VOICE_NOT_ALLOWED`.

- [ ] **Step 1: failing tests:**
  - фикстура `L001-cafe` → 8 элементов `turn`, у `staff` голос C, у `you` — D, `text` содержит огласовки (`/[ְ-ׇ]/`) и совпадает с `he.niqqud`;
  - `roles[0].voice = 'he-IL-Chirp3-HD-Kore'` → `VOICE_NOT_ALLOWED` и в `validateLesson`, и в `checkItems`;
  - строка 5 000 байт → `TEXT_TOO_LONG` с `ref`;
  - абзацы `text` урока L002 → `kind: 'para'`, голос C.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): speech items from vocalized lesson text`; push.

### Task 2: CLI `course-tts` — inventory и bake

**Files:** Create `scripts/course/course-tts.cjs`, `tests/courseTts.test.js`

**Interfaces:**
- Consumes: `CourseSpeech`, `computeAssetKey` (`db/premium/ttsAssetKey.js`), `validateCourseDir` (P1/P3).
- Produces:
  - `node scripts/course/course-tts.cjs inventory <courseSrcDir> [--lesson id] [--out report.json]` — без сети. По каждому элементу: `ref, voiceName, chars, assetKey, haveFile` (есть ли `<outDir>/<key>.mp3`); итог `chars` и `missingChars`;
  - `node scripts/course/course-tts.cjs bake <courseSrcDir> [--lesson id] [--out .tmp/course-tts] [--concurrency 2]` — синтезирует только отсутствующие файлы, по одному на элемент, MP3 24 кГц. Атомарная запись: `.part`, затем переименование. Журнал `bake-log.json`: `ref, key, voice, bytes, sha256`;
  - экспорт `bakeItems(items, { client, outDir, ceiling }) -> { made, skipped, failed }` для тестов; `client` — объект с `synthesizeSpeech(request)`.

- [ ] **Step 1: failing tests** (поддельный клиент, без сети):
  - inventory на фикстуре — 8 элементов, `missingChars` = сумма `chars`;
  - `bakeItems` с клиентом, падающим на 3-м вызове → 2 файла есть, 1 в `failed`, повторный запуск делает остальные и не трогает первые два (Review Focus 4);
  - потолок 10 символов → отказ до первого вызова клиента;
  - запрос клиента содержит `voice.name` из элемента и `input.text` с огласовками.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): course-tts inventory and resumable bake`; push.

### Task 3: Локальная сверка и лист прослушивания

**Files:** Create `scripts/course/course-asr-check.py` (обобщение `docs/research/hebrew-course/2026-11-05-cafe-audio/asr-check.py`), `scripts/course/course-tts.cjs` (команда `sheet`), `tests/courseTts.test.js`

**Interfaces:**
- `python -I scripts/course/course-asr-check.py <outDir> <inventory.json> [--model <path>]` — подача PCM через ffmpeg (без PyAV), CPU int8 по умолчанию, `--device cuda` по желанию. Пишет `<outDir>/asr-check.json`: `{ ref, key, expected(plain), asr, exact, durationSec, tailSilenceDb }`; сравнение после удаления огласовок и пунктуации. Ключ сравнения `plain` строки — из данных урока.
- `node scripts/course/course-tts.cjs sheet <courseSrcDir> --lesson id [--out …]` пишет `<outDir>/listen-<lessonId>.html` — самостоятельную страницу со списком реплик:
  - огласованный текст, ▶ (относительный путь к MP3), строка ASR;
  - переключатель «годится / проблема» и поле заметки;
  - кнопка «Скачать отметки», которая отдаёт JSON `{ lessonId, reviewedAt, items: { "<ref>": { key, status: "ok"|"bad", note } } }`.

- [ ] **Step 1: failing test** (только `sheet`, без Python): на фикстуре HTML содержит 8 `<audio>`, `dir="rtl"` у ивритского текста, у каждой строки `data-ref` и `data-key`, а скачанный JSON (функция страницы, вызванная через linkedom) содержит `key` каждой строки.
- [ ] **Step 2–4.** Скрипт Python проверяется вручную в Task 5, тестов `npm` для него нет.
- [ ] **Step 5:** commit `feat(course): local ASR check and listening sheet`; push.

### Task 4: Манифест из принятых записей

**Files:** Modify `scripts/course/course-tts.cjs` (команда `manifest`), `scripts/course/build-course-data.cjs` (копировать `audio/*.json`), `tests/courseTts.test.js`, `tests/courseData.test.js`

**Interfaces:**
- `node scripts/course/course-tts.cjs manifest <courseSrcDir> --lesson id --review <file.json>` пишет `<courseSrcDir>/audio/<lessonId>.json = { "<turnId|paraId>": "<key>" }` только для элементов, у которых:
  - в отметках `status: 'ok'`;
  - `key` отметки совпадает с текущим ключом элемента — то есть текст и голос не менялись после прослушивания.
  
  Отметки сохраняются рядом: `<courseSrcDir>/audio-review/<lessonId>.json`.
- `build-course-data.cjs` копирует `audio/*.json` в выход и включает их в `manifest.json` с sha256.

- [ ] **Step 1: failing tests:**
  - отметки: 7 `ok`, 1 `bad` → манифест из 7;
  - у одной `ok` устаревший `key` → она пропущена и названа в выводе (Review Focus 2);
  - реплику в уроке изменили после манифеста → `inventory` показывает её `haveFile: false` с новым ключом (Review Focus 1);
  - сборка данных копирует `audio/L001-cafe.json`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): audio manifest from owner-approved recordings`; push.

### Task 5: Пилот на «Кафе» и доставка (оператор + владелец)

- [ ] **Step 1:** `inventory` на `tests/fixtures/course/mini --lesson L001-cafe` — показать владельцу число символов (~300).
- [ ] **Step 2:** `bake` (учётные данные — окружение оператора; если их нет, остановиться и попросить владельца задать `GOOGLE_APPLICATION_CREDENTIALS` в своём окружении), затем `course-asr-check.py`, затем `sheet`.
- [ ] **Step 3:** **Владелец** слушает `listen-L001-cafe.html` и скачивает отметки → `manifest` → `build-course-data`.
- [ ] **Step 4:** Доставка на прод — только по «да» владельца:
  - MP3 из `.tmp/course-tts/` — в `audio-cache` тома;
  - `course/ulpan/` — новые данные.
  
  Способ — тот же, что у атласа (`scripts/atlas/atlas-tts.cjs`, выгрузка записей атласа; узнать по `docs/research/engineering-atlas/` и `scripts/premium/bake-and-push-timing.js`). Если запись на сервер требует прав владельца — подготовить скрипт для запуска через `!`.
- [ ] **Step 5:** Проверка на проде:
  - `GET /api/audio/<key>` → 200 audio/mpeg для всех ключей манифеста;
  - в уроке «Кафе» у 8 реплик есть ▶;
  - 0,75× сохраняется при повторе;
  - уход из урока останавливает звук.
  
  Отчёт `docs/research/hebrew-course/2026-11-05-p4-codex-report.md` в main с `[skip cd]`.
