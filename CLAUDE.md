# tts-prototype-android — TTS & Translator Dashboard

Несмотря на имя, это **Node.js-приложение** (PWA + сервер), не нативный Android. Последний документально подтверждённый production-релиз — v3.11.403 (2026-08-17; перед production-операциями перепроверять живую версию). Google Cloud Text-to-Speech + Gemini, билингвальные таблицы иврит↔русский, морфология, квизы.

## Роли проекта (применять ВСЕГДА для дизайн/качество-решений)

Для любого содержательного решения по продукту/коду (фича, UX, морфология, граф, качество данных, спорный trade-off) **автоматически применяй экспертные роли-линзы проекта R1–R17** — определения в **`docs/PROJECT_ROLES.md`**. Точечное решение → релевантная роль; кросс-режущее → все релевантные + синтез; развилка → варианты с разбором по ролям + рекомендация (пользователь решает). Это рабочая норма, не по напоминанию. Инвариант владельца: **бескомпромиссное качество, без заглушек.**
- **R1** ивритский лексикограф (корни/биньян, без выдуманных форм) · **R2** методист SLA (удержание, употребление>форм) · **R3** архитектор графа · **R4** премиум-UX (mobile-first RTL @380px, провенанс, без тупиков) · **R5** продукт/рынок (планка Pealim/Reverso, offline-first) · **R6** куратор-библиотекарь · **R7** литературовед-гебраист · **R8** дизайнер graded-reading · **R9** authority-control/LOD (derived≠asserted) · **R10** вычислительный морфолог (дизамбигуация+замер) · **R11** регрессолог-текстолог (do-no-harm: улучшение не портит верное; источник-истины > живой Dicta; кросс-поверхностная согласованность; независимость оракула) · **R12** cloud-platform архитектор (log/projections/artifacts разделены, без dual-write) · **R13** migration steward (OPFS→cloud lossless, dry-run, откат) · **R14** tenant isolation/security · **R15** data lifecycle/GDPR (классы A–D, opt-in, TTL, экспорт/удаление) · **R16** cost governor (лимиты LLM, degradation без LLM) · **R17** agent pedagogy/grader independence (агент учит, не болтает: 5 категорий действия, MNAR-неответ, D1 channel-aware грейд, reading-first моат; кто учит — не сертифицирует: детерминированный грейдер первым + grader-провенанс + анти-циркулярность метрик). R12–R17 — платформенные (Cloud Learner Graph, канон `docs/planning/AI_MENTOR_RECON_2026_07_04.md`).

## Стек
- Node.js, `server.js` (entry, `npm start`)
- Своя БД с миграциями/бэкапами (`db/`)
- PWA-фронтенд, морфологический словарь, движок квизов
- Спряжение/склонение + перевод (Pealim) + bulk word-заметки (②): резолвер `db/premium/providers/pealim.js` (model `pealim-infl-v12` — stem-aware scoring: проклитика-слова כזאת→זאת через Dicta-стем, без угадывания); **офлайн-словарь** `public/data/inflection/pealim-infl-v12.json.gz` (9279 парадигм, 3.3МБ) — прод-сервер НЕ скрейпит Pealim, таблицы из shipped-датасета через OPFS (`scripts/premium/scrape-pealim-all.js` + `public/js/inflection-dict.js`); отчёт качества + извлечённые уроки + нерешённое → **`docs/WORDNOTE_CONJUGATION_QUALITY_REPORT_2026_06.md`** (≈99.4% корректность). Инструмент теста/генерации: `scripts/premium/build-notes-from-bundle.js`. **Полевая система ②-заметок** (цели по каждому полю word/niqqud/root/pos/binyan/meaning + инварианты R1) — канон `docs/NOTE_FIELDS_GOALS.md`; харнесс конформности `npm run audit:note-fields` (gate валит сборку при любом R1-нарушении). Бандл `Library/test-enriched.zip`: meaning 96.2%, R1-нарушений 0.
- **Retention/SRS-подсистема (продукт сам владеет петлёй повторения).** Единый движок **FSRS-6** `public/js/fsrs-core.js` (байт-парити vs ts-fsrs@5.4.1, гейт `smoke:fsrs`) для Зала И Студии — заменил SM2-lite/`computeSM2` (оставлен фолбэком). Истина о памяти слова = append-only **`review_log`** (мигр. 041), единый кейер `public/js/lemma-canon.js` (гейт `smoke:memory-canon`, independent-oracle `replay(log)==stored`); state (S/D/due) — производный кэш. **Reading-native retrieval** (моат): due-кольцо в живом чтении + reveal-then-grade карточка на тап (`reader-morph.js`). Anki = опциональный компаньон (экспорт .apkg + read-back слиянием логов, НЕ перезаписью). **Канон-док: `docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md`** (живой статус фаз P0–P6 сверху). Кросс-поверхностный континуитет due-петли (source-at-mark, serve-unsourced лестница с identity-гейтом, унификация счётчиков ПК↔Telegram, парадигмо-heal, all-surface стрик) — программа R1–R4 ЗАКРЫТА v3.11.143–151, канон `docs/planning/ROOM_DUE_CONTINUITY_2026_07_11.md`. Доктрина-предок `docs/SRS_STRATEGY_v3_2.md` частично superseded. ⚠ Новые UI-строки Зала через `tt(key, fallback)` ОБЯЗАНЫ попадать в все три локали `public/i18n/locales/{ru,en,he}.js` — fallback-аргумент недостижим при загруженном t() (+SW bump, локали precached). Инварианты: migrations.js single-writer (следующая метка = РЕАЛЬНОМУ индексу массива); два писателя `word_status.srs_*` (recall-путь + P4 `updateSrsState`) → gate-consumers-sweep.
- **Импорт контента в Студию** (Wave 1 SHIPPED v3.11.242; Wave 2: S4 аудио/видео→сегмент-караоке v3.11.246-248, S5a субтитры+YouTube-плеер v3.11.250-253, S12 длинные медиа v3.11.256): диалог «Импорт» (`#v3ImportModal`, `public/js/studio-import.js`, три вкладки Статья/Видео/Файл) принимает URL/файл/фото/аудио/видео/субтитры → текст+сегменты в поле ввода; серверные модули `ingest/` (S1 fetch-url анти-SSRF, S2 docx + S8 фото/PDF BYOK Gemini OCR); аудио/видео — браузер→Gemini Files API (BYOK, `gemini-files.js`), **потолок 3 часа**. **⚠ ASR длинных файлов режет САМ ЗВУК, а не промт (S12.5, v3.11.265): range-промт УБИТ как класс** — модель на глубоких офсетах возвращала чужой контент с подделанными in-range метками, и все метко-ключёванные гейты были слепы (потеря 47% таймлайна выглядела успехом). Теперь `public/js/mp3-slice.js` (фрейм-карта MPEG1/2/2.5 L3) нарезает mp3 на чанки окнами 15 мин (перекрытие 30с), КАЖДЫЙ чанк — отдельный аплоад + plain `ASR_PROMPT` без диапазона, абсолютное время = наш детерминированный офсет ⇒ подделка невозможна by construction; fallback `ranged-file` (видео/не-mp3) обвешан текстовым анти-реплей гейтом. Шов чанков — по тексту (`stitchWindowSegments`). Дыра покрытия ≠ сбитые метки: `runSpeechDensity`/`classifyGap` (S12.6) судят по ОБЪЁМУ текста окна против конкурирующей гипотезы потери; сводка прогона разделяет «текст отсутствует» (требует подтверждения при >5%) и «тайминг ненадёжен». Чанк-таблица по 120 сегментов (`table-chunks.js`, цикл `v3TranslateTableChunked` в index.html, прогрессивная отрисовка, серверный кэш куска = резюм) — стена одного вызова ≈287 строк (65к out-ток), замеры `docs/research/studio-ingest-longmedia/{2026-07-28,2026-07-29,2026-07-30}/`. Сегмент-караоке `studio-media-karaoke.js`; обратное направление `direction=any-he`. **⚠ Тайминг караоке: `segment_index` премиум-ответа `/api/translate-table-v2` — ОДНОФАМИЛЕЦ (номер предложения своего сегментатора), НЕ индекс ASR-сегмента; принимать индексы только через `validateRowSegMapping`, премиум-путь использует `source_line_index`** (канон `docs/planning/STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.md`). **⚠ Метки ВНУТРИ честно нарезанного чанка тоже подделываемы (S12.7, v3.11.270): модель бросает читать позицию в звуке и штампует постоянный шаг — 930с речи в 660с меток, караоке уехало на 4 мин на 57% таблицы при пустом `timingDropReason`. Дефект СТОХАСТИЧЕСКИЙ (повтор того же вызова: медиана ошибки 55с→0.58с). Гейт `classifyClockCompression` (размах меток против объёма текста, разрыв не нужен) → переспрос чанка → дробление по 310с → не помогло: записи помечаются `blind`, караоке там честно молчит. Маппинг «строка→сегмент» теперь ЕДИН для всех провайдеров — `alignRowsToSegments` по тексту, индекс провайдера лишь перекрёстная проверка** (канон `docs/planning/STUDIO_ASR_CLOCK_COMPRESSION_S12_7_2026_07_30.md`, замеры `docs/research/studio-karaoke-clock-drift/2026-07-30/`). Гейты: `smoke:ingest`, `smoke:studio-chunks`, `smoke:captions-parse`, `smoke:text-card`, live `ingest-longmedia-live-smoke.js` + `ingest-slice-live-smoke.js` (гейт закрытия длинного ASR: дубль-шинглы <3%, 0 нулевых корзин покрытия). История/решения: `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md`; **актуальный roadmap** (включая local GPU processing L0–L6, media-package, resume/batch, subtitle editor): `docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`.
- Доп. Python-часть (`pyproject.toml`) + `Makefile`
- Тесты: `node --test` + множество smoke-скриптов

## Ключевые команды (npm)
```
npm start                # node server.js
npm run start:all        # scripts/start_all.ps1 (всё окружение)
npm test                 # node --test
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

## Конвенции
- Перед коммитом прогонять релевантные `smoke:*` наборы (morph/quiz/crosstext) и `test:api-smoke`.
- После завершения пользовательских research/planning-задач делать целевой commit и push, если пользователь явно не запретил публикацию.
- БД: изменения схемы — только через `db:migrate`; перед рискованными операциями `db:backup`.
- Ключи Google Cloud / Gemini — в окружении/`.env`, не в коде.
- `Архив/`, `.tmp/`, `logs` — не коммитить.

## Artifact storage rule — user-visible project artifacts

Never leave user-facing deliverables only in `.tmp`, cache, build, or other gitignored service folders.

`.tmp/` may be used only for scratch files, intermediate runs, caches, temporary previews, and disposable debug outputs. Any artifact that the user is expected to open, review, annotate, preserve, cite, or use as part of project decision-making must be copied or generated into a stable, user-visible repository path.

Default locations:

* Research artifacts: `docs/research/<topic>/<YYYY-MM-DD>/`
* Planning / decision documents: `docs/planning/`
* Test fixtures intended for automated tests: `scripts/premium/fixtures/<topic>/` or the existing project fixture directory
* User annotation worksheets / gold data: `docs/research/<topic>/<YYYY-MM-DD>/`
* Final reports: same folder as the related research artifact, unless there is an existing canonical report directory

For every user-facing artifact, include a short `README.md` or header documenting: what the artifact is; how it was generated; source command; source commit; whether it is raw, preview, manually annotated, or scored; which file the user should edit or review; which files are scratch/cache and should not be edited.

When reporting completion to the user, always provide the stable repository path first. Do not present `.tmp/...` as the main location for user work.

If an artifact starts in `.tmp`, the task is not complete until the final user-facing copy exists in a non-gitignored repository folder.

Do not commit secrets, API keys, local caches, large model downloads, transient logs, or service caches. If a file is needed for reproducibility but may be too large or sensitive, create a small manifest/README in the stable folder explaining where it is generated from and how to regenerate it.

## Замечания
Каталоги `.claude/`, `.playwright-mcp/`, `.external/`, `.kilo/` — служебные. Playwright уже используется для smoke — браузер ставится при первом запуске.

## Читальный зал (Ben-Yehuda Reading Room) — отдельная поверхность
Кроме Studio (`index.html`) есть **`public/library.html`** + **`public/js/library-ui.js`** — чистый «Читальный зал» над общим OPFS-движком (reader = `public/js/reader-core.js`, byte-parity к index.html, гейт `smoke:reader-parity`). Вкладка **«Корпус»** = навигация Период→Автор→Работа по ~26K публичных ивритских работ (каталог v<N>: `public/data/benyehuda/{corpus-catalog-v<N>.json, corpus-index-v<N>.json, corpus-search-v<N>.json, catalog/, works/}`; продюсер `scripts/premium/build-corpus-catalog.js --full`). **`index.html` не трогать** при работе над Залом (до Stage 2). Полное состояние/планы/гейты — **`docs/SESSION_STATE_BRR_2026_06_14.md` (READ FIRST, консолидированный)**. Бейк-раннер (наполнение перевода) — `scripts/premium/run-corpus-prebake.js` (`--status`/`--bake`/`--giant-pass`), леджер `.tmp/benyehuda/prebake-ledger.json`.
**Публикация порций перевода на прод (периодически)** — skill `publish-corpus-batch` + хелпер `scripts/premium/publish-corpus-batch.js` (`--dry-run`/`--apply`/`--verify-only`): снимок шардов → сборка каталога v(N+1) → авто-бамп версии (CORPUS_CATALOG_VERSION + SW) → гейты → печать ручных шагов (bodies-first пуш на том через `push-corpus-works.js` + AUDIO_UPLOAD_TOKEN → allowlist-коммит → прод-верифи). Тела работ — на прод-том, НЕ в git.

**Медиа-плеер учебных материалов в Зале (SHIPPED v3.11.305).** Медиа-импортированные материалы («Мои тексты») играют оригинал и в Зале: общий паспорт-пайплайн + DOM-хелперы **`public/js/media-host.js`** (K1-карантин/K3-довыравнивание/blind — ОДНА реализация со Студией, форк запрещён; Студия зовёт через тонкие `v3Media*`-обёртки), ядро `studio-media-karaoke.js` (хук `stopOtherAudio`), хост `roomMedia*` в `library-ui.js`: караоке-подсветка `.smk-row-active`, tap-seek по строке, per-row ▶︎ «оригинал-сегмент», взаимоисключение с TTS в обе стороны, честные состояния noTiming/fileMissing + «Открыть в Студии» (deep-link), 🎧/🎬-бейдж карточек; YouTube — karaoke+seek, per-row replay запрещён (async-seek ловушка). Спека `docs/superpowers/specs/2026-08-04-room-media-player-design.md`; гейт `npm run smoke:room-media`.

**Морфология-на-тапе (моат №1, Зал) — ЧЕСТНЫЙ резолвер (Эпик 1 SHIPPED).** Тап слова → лёгкая карточка корень/биньян/POS/глосс/провенанс: pure-core `public/js/notes-autogen.js` (lock-step с `scripts/premium/build-notes-from-bundle.js`, гейт `autogen-parity`) + браузер-карточка `public/js/reader-morph.js`. **Инвариант честности:** бейдж «точно» ТОЛЬКО на решающих ячейках; гомографы → «вероятно» + «возможно также»; content→function/participle→noun по Dicta-контексту → демоция; всё неуверенное → поиск-ссылка/«возможная парадигма»/семья скрыта. Tier-3 «точный режим» (Dicta-in-browser `reader-dicta.js`) = авто на тап после разового R5-согласия. **Гейт качества (measure-before-code, R10):** `npm run smoke:reader-morph:audit` (`scripts/premium/reader-morph-audit.js`, `--rows=N`/`--tier3`/`--no-oracle`) — выборка baked-работ → офлайн-резолв vs Dicta-silver, precision-«exact» + recall честной-деградации. Док `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md`. Программа UX Зала — `docs/planning/BRR_UX_AUDIT_2026_06_25.md` (9 эпиков; 1+7 done).

---

## Продакшн-деплой

**URL:** `https://linguistpro.kolosei.com`  
**Инфраструктура:** Hetzner CX23 (4 vCPU / 8 GB RAM, Falkenstein DE), Coolify, Traefik + Let's Encrypt  
**Деплой:** git push в `main` → GitHub webhook → Coolify автосборка Docker (Dockerfile в корне)  
**Данные:** Docker volume `<DOCKER_VOLUME>` → `/app/data` в контейнере  
**Бэкап:** `<BACKUP_SCRIPT>` → `<BACKUP_DIR>` ежедневно в 03:00 UTC (14 дней)  
**Мониторинг:** UptimeRobot → `https://linguistpro.kolosei.com/healthz`, алерты на `<OWNER_EMAIL>`  
**Ресурсы контейнера:** CPU 1.5 cores, RAM hard limit 1536 MB  
**SSH:** `ssh -i ~/.ssh/<SSH_KEY> <SSH_USER>@<PROD_IP>`  
**Coolify UI:** `http://<PROD_IP>:8000` — ⚠ ограничить VPN/allowlist + HTTPS  

> 🔒 Конкретные координаты прод-хоста (IP, SSH-ключ, имя volume, slug, admin-URL) — в `.claude/PROD_OPS_PRIVATE.md` (gitignored, не публикуется).  

> ⚠ Данные пользователей (библиотека, прогресс) хранятся в браузере (OPFS), не на сервере.  
> На сервере только research-когорты (`/app/data/research/`) и TTS audio-кэш (`/app/data/audio/`).

---

## UI-разработка: обязательный workflow

**Перед любым UI-коммитом** — скриншот в Playwright на 380px:
```js
// Открыть нужный экран, затем:
await page.setViewportSize({ width: 380, height: 844 });
await page.screenshot({ path: 'check.png' });
```
Через MCP: `browser_resize(380, 844)` → `browser_take_screenshot`. Смотреть скриншот перед `git add`.

---

## CSS-ловушки `public/index.html` (39K строк)

### 1. Глобальный `button { width: 100% }` на mobile

В `@media (max-width: 600px)` около строки 2117 есть:
```css
button.btn-primary, button.btn-secondary { width: 100%; }
```
**Каждый новый контейнер с кнопками** требует явного исключения. Паттерн:
```css
#myNewPanel button { width: auto; }          /* ID — всегда побеждает */
.my-new-modal button { width: auto !important; }  /* класс — нужен !important */
```
Уже добавлены исключения для: `.v3-modal`, `#v3AboutPanel`, `.v3-lib-card-actions`, `.v3-lib-toolbar`.

### 2. Порядок CSS-каскада: mobile-overrides ДО компонентного CSS

Mobile `@media` блок: ~строки 2115–2272.  
Компонентный CSS: ~строки 3000–9000.

Одинаковая специфичность → **позднее в файле = побеждает**. Если mobile-override не применяется — добавить `!important` к `display`:
```css
/* В @media блоке строки ~2200 */
.my-component { display: grid !important; }   /* без !important проиграет */
```

### 3. Inline `style=` побеждает любой CSS-класс

Если у элемента `style="display:flex; ..."` — никакой класс это не перебьёт.  
Решение — только `!important` в CSS или удаление inline-style из HTML.

### 4. `#v3AboutModal` ≠ `.v3-modal`

About-модал использует собственные ID-стили, а не класс `.v3-modal`.  
Исключения для `.v3-modal button` на него **не распространяются**.  
Добавлено: `#v3AboutPanel button { width: auto; }`.

### 5. PWA Service Worker кеширует `index.html` и локали

При тестировании в браузере старый SW отдаёт закешированный файл.  
Использовать cache-bust URL: `http://localhost:3000/?v=N` (инкрементировать N).  
Локальные файлы локалей (`.../i18n/locales/*.js`) кешируются отдельно — в dev могут не обновиться без hard-reload.
