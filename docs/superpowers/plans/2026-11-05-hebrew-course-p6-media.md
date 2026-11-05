# Курс иврита P6 — картинки и анимация через dots: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** бесплатный путь обогащения урока медиа:
1. мы выгружаем пакет урока со списком медиа-мест и заданием на каждое;
2. dots (ChatGPT) заполняет места картинками и анимацией;
3. приёмщик проверяет пакет и импортирует его;
4. урок показывает медиа на своих местах. Без медиа урок работает как прежде.

**Architecture:**
- По образцу конвейера атласа «В контексте (ИИ)» (`scripts/atlas/export-context.cjs` / `import-context.cjs`).
- Пакет — папка (или её ZIP), которую владелец передаёт dots и получает обратно.
- Файлы медиа хранятся под именем-хешем (`<sha256-16>.<ext>`) в `<courseSrc>/media/`. Сборка данных (P3 Task 1) копирует их на том, маршрут `/data/course` отдаёт их с долгим кэшем.
- Показ — в `course-reader.js`.

**Tech Stack:** Node 22, `node:test`, `linkedom`; без новых зависимостей. Форматы — только то, что браузер показывает сам, без проигрывателей.

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` §4.2 п. 5, §4.8; формат — `docs/planning/course/COURSE_FORMAT_V1.md` (поле `media`).

## Global Constraints

- Медиа никогда не несёт ивритский текст внутри картинки: весь иврит — в DOM. dots обязан указать `containsText: false`; приёмщик собирает лист для глазной проверки (Task 2), авто-проверки текста на картинке нет.
- Разрешённые форматы:
  - `image` — `webp`, `png`, `jpg`;
  - `animation` — анимированный `webp` с обязательной статичной `poster` (`webp`/`png`);
  - `video` — `mp4` (H.264, без звука) с обязательной `poster`.
  
  SVG, GIF, HTML, JS, Lottie запрещены.
- Лимиты: картинка ≤ 400 КБ, анимация ≤ 1,5 МБ, видео ≤ 3 МБ; длинная сторона ≤ 1600 px.
- `prefers-reduced-motion` или пауза «Миров» → показывается `poster`, анимация и видео не запускаются сами.
- У каждого медиа есть `alt.ru`; без `alt` импорт отклоняется.
- Своих персонажей: на картинках нет Человека-паука, персонажей Marvel или Дины и Давида Лерера. dots получает это в задании; при глазной проверке это проверяется.
- Ветка `feat/course-media` от `origin/main` после слияния P7 (оба плана меняют `course-reader.js`). Выпуск — только после «да» владельца, место на проде ≥ 6 ГиБ.

## Review Focus

1. Файл с расширением `.webp`, но с содержимым PNG/HTML, отклоняется по сигнатуре байтов, а не по расширению — тест в Task 2.
2. Пакет, где медиа-место переименовано или урок изменился после выгрузки (другая `version`), импортируется только для совпадающих мест, остальные перечислены — тест в Task 2.
3. Повторный импорт того же пакета ничего не дублирует (имена-хеши) — тест в Task 2.
4. Медиа не загрузилось (404 или сеть) → место не показывается и не ломает разметку; `alt` не выводится как мусорный текст — тест в Task 3.
5. Включено «уменьшение движения» → анимация показывает `poster` — тест в Task 3.

---

### Task 1: Формат медиа-мест и выгрузка пакета

**Files:** Modify `public/js/course-format.js`, `docs/planning/course/COURSE_FORMAT_V1.md`; Create `scripts/course/export-media-pack.cjs`, `scripts/course/media-pack/README.dots.ru.md` (шаблон задания для dots), `tests/courseMediaPack.test.js`

**Interfaces:**
- Формат `lesson.media[]`: `{ id, kind: 'image'|'animation'|'video', target: 'lesson'|'scene/<turnId>'|'text/<paraId>'|'task/<taskId>', brief:{ru}, alt:{ru}, aspect: '16:9'|'4:3'|'1:1'|'3:4', src?: '<file>', poster?: '<file>', credits?: {ru} }`. Валидатор:
  - `target` указывает на существующий элемент;
  - `src`/`poster` есть в `media/`;
  - для `animation` и `video` `poster` обязателен, если есть `src`.
- `node scripts/course/export-media-pack.cjs <courseSrc> --lesson <id> --out <dir>` пишет:
  - `README.dots.ru.md` — что сделать, стиль, запреты из Global Constraints;
  - `pack.json` = `{ format: 'course-media-pack-v1', courseId, lessonId, lessonVersion, exportedAt, slots: [{ id, kind, target, brief, alt, aspect, maxBytes, maxSide, context: { he: niqqud-строка элемента, ru } }] }`;
  - `style.ru.md` — общий стиль курса из `<courseSrc>/media-style.ru.md`, если файл есть;
  - пустую `results/`.
- Ожидаемый ответ dots: `results/<slotId>.<ext>`, при необходимости `results/<slotId>.poster.<ext>` и `results/<slotId>.json` = `{ alt:{ru}, containsText: false, credits:{ru}, tool, prompt }`.

- [ ] **Step 1: failing tests:**
  - выгрузка на фикстуре с двумя медиа-местами → `pack.json` с двумя слотами, `context.he` огласован;
  - `README.dots.ru.md` содержит запрет текста на картинке и запрет чужих персонажей;
  - валидатор: `target` на несуществующую реплику → error; анимация без `poster` → error.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): media slots and dots pack export`; push.

### Task 2: Приёмщик пакета и лист проверки

**Files:** Create `scripts/course/import-media-pack.cjs`, `tests/courseMediaPack.test.js` (дописать); Modify `scripts/course/build-course-data.cjs` (копировать `media/*`, включать в `manifest.json`)

**Interfaces:**
- `node scripts/course/import-media-pack.cjs <packDir> <courseSrc> [--dry-run]`:
  - проверяет `pack.json`: курс, урок, `lessonVersion`; при другой версии импортирует только слоты, у которых `id`, `kind` и `target` совпадают, остальные перечисляет;
  - по каждому файлу — сигнатура байтов (`RIFF....WEBP`, `\x89PNG`, `\xFF\xD8\xFF`, `ftyp` у mp4), размер, длинная сторона (из заголовков `webp`/`png`/`jpg` без внешних библиотек), наличие `poster`;
  - `results/<slotId>.json`: `containsText === false` и непустой `alt.ru`;
  - пишет файлы в `<courseSrc>/media/<sha256-16>.<ext>` (повтор ничего не дублирует) и проставляет `src`, `poster`, `alt`, `credits` в `lesson.media`;
  - выводит итог `accepted / rejected (причина) / skipped (stale)` и пишет `<packDir>/review.html` — лист для глазной проверки: картинка, `alt`, бриф, контекстная строка. Владелец или Claude смотрят его до выпуска.

- [ ] **Step 1: failing tests:**
  - PNG под именем `.webp` → rejected «формат не совпадает с содержимым» (Review Focus 1);
  - 600 КБ картинка → rejected;
  - анимация без `poster` → rejected;
  - пакет для `version: 1` при уроке `version: 2`, где одно место переименовано → одно skipped, остальные accepted (Review Focus 2);
  - повторный импорт → те же имена, число файлов в `media/` не растёт (Review Focus 3);
  - `--dry-run` ничего не пишет;
  - сборка данных копирует `media/*` и хеширует их в `manifest.json`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): media pack importer with byte-signature checks and review sheet`; push.

### Task 3: Показ медиа в уроке

**Files:** Modify `public/js/course-reader.js`, `public/css/course-reader.css`, `server.js` (для `/data/course/<id>/media/*` — `Cache-Control: public, max-age=31536000, immutable`, как PNG атласа), `tests/courseReader.test.js`, `tests/courseData.test.js`

**Interfaces:**
- Медиа рисуется у своего `target`:
  - `lesson` — над целью;
  - `scene/<turnId>` — над репликой;
  - `text/<paraId>` — над абзацем;
  - `task/<taskId>` — над заданием.
- Разметка: `<figure class="course-media" data-media="<id>">`:
  - `image` — `<img loading="lazy" decoding="async" alt=…>`;
  - `animation` — `<picture>` с `poster` при `prefers-reduced-motion: reduce` или при паузе мира;
  - `video` — `<video muted playsinline preload="none" poster=…>` с кнопкой ▶, без автозапуска.
- `aspect-ratio` из `aspect`, поэтому место зарезервировано и разметка не прыгает. Ошибка загрузки → `figure` скрывается (`hidden`), а не показывает `alt`-текст поверх урока.

- [ ] **Step 1: failing tests** (linkedom):
  - картинка на `scene/<turnId>` стоит перед этой репликой, у неё `alt` и `loading="lazy"`;
  - `reducedMotion: true` → у анимации `src` = `poster` (Review Focus 5);
  - событие `error` у `img` → `figure.hidden === true` (Review Focus 4);
  - урок без `media` рисуется как раньше (снимок числа строк);
  - маршрут: для `/data/course/…/media/` заголовок `immutable`.
- [ ] **Steps 2–4.** **Step 5:** commit `feat(course): lesson media rendering`; push.

### Task 4: Пилот на «Кафе» с dots, подключение, выпуск

- [ ] **Step 1:** В фикстуру `L001-cafe` добавить 3 медиа-места:
  - `lesson` — кафе, вид от стойки;
  - `scene/a1-03` — стаканы двух размеров;
  - `task/18b` — анимация: чашка чая сменяется чашкой кофе («вместо»).
  
  Выгрузить пакет в `.tmp/course-media/L001-cafe/` и передать владельцу с короткой инструкцией для dots.
- [ ] **Step 2:** Владелец отдаёт пакет dots и возвращает его с `results/`. Импорт, `review.html` — глазная проверка владельцем (нет текста на картинках, свои персонажи, соответствие брифу).
- [ ] **Step 3:** Подключение (lockstep, precache), `npm test`, smoke 390/1440 с медиа и с `reducedMotion`.
- [ ] **Step 4:** Отчёт `docs/research/hebrew-course/2026-11-05-p6-codex-report.md`. Выпуск — только после «да» владельца, место ≥ 6 ГиБ; доставка `media/` на том — тем же способом, что данные курса в P3/P4.
