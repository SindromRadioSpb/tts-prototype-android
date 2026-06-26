# tts-prototype-android — TTS & Translator Dashboard

Несмотря на имя, это **Node.js-приложение** (PWA + сервер), не нативный Android. v3.6.0. Google Cloud Text-to-Speech + Gemini, билингвальные таблицы иврит↔русский, морфология, квизы.

## Роли проекта (применять ВСЕГДА для дизайн/качество-решений)

Для любого содержательного решения по продукту/коду (фича, UX, морфология, граф, качество данных, спорный trade-off) **автоматически применяй экспертные роли-линзы проекта R1–R11** — определения в **`docs/PROJECT_ROLES.md`**. Точечное решение → релевантная роль; кросс-режущее → все релевантные + синтез; развилка → варианты с разбором по ролям + рекомендация (пользователь решает). Это рабочая норма, не по напоминанию. Инвариант владельца: **бескомпромиссное качество, без заглушек.**
- **R1** ивритский лексикограф (корни/биньян, без выдуманных форм) · **R2** методист SLA (удержание, употребление>форм) · **R3** архитектор графа · **R4** премиум-UX (mobile-first RTL @380px, провенанс, без тупиков) · **R5** продукт/рынок (планка Pealim/Reverso, offline-first) · **R6** куратор-библиотекарь · **R7** литературовед-гебраист · **R8** дизайнер graded-reading · **R9** authority-control/LOD (derived≠asserted) · **R10** вычислительный морфолог (дизамбигуация+замер) · **R11** регрессолог-текстолог (do-no-harm: улучшение не портит верное; источник-истины > живой Dicta; кросс-поверхностная согласованность; независимость оракула).

## Стек
- Node.js, `server.js` (entry, `npm start`)
- Своя БД с миграциями/бэкапами (`db/`)
- PWA-фронтенд, морфологический словарь, движок квизов
- Спряжение/склонение + перевод (Pealim) + bulk word-заметки (②): резолвер `db/premium/providers/pealim.js` (model `pealim-infl-v12` — stem-aware scoring: проклитика-слова כזאת→זאת через Dicta-стем, без угадывания); **офлайн-словарь** `public/data/inflection/pealim-infl-v12.json.gz` (9279 парадигм, 3.3МБ) — прод-сервер НЕ скрейпит Pealim, таблицы из shipped-датасета через OPFS (`scripts/premium/scrape-pealim-all.js` + `public/js/inflection-dict.js`); отчёт качества + извлечённые уроки + нерешённое → **`docs/WORDNOTE_CONJUGATION_QUALITY_REPORT_2026_06.md`** (≈99.4% корректность). Инструмент теста/генерации: `scripts/premium/build-notes-from-bundle.js`. **Полевая система ②-заметок** (цели по каждому полю word/niqqud/root/pos/binyan/meaning + инварианты R1) — канон `docs/NOTE_FIELDS_GOALS.md`; харнесс конформности `npm run audit:note-fields` (gate валит сборку при любом R1-нарушении). Бандл `Library/test-enriched.zip`: meaning 96.2%, R1-нарушений 0.
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
npm run pwa:icons                # генерация PWA-иконок
npm run tts:models:check         # проверка TTS-моделей/чексумм
```

## Конвенции
- Перед коммитом прогонять релевантные `smoke:*` наборы (morph/quiz/crosstext) и `test:api-smoke`.
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
