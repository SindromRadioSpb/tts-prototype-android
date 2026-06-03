# tts-prototype-android — TTS & Translator Dashboard

Несмотря на имя, это **Node.js-приложение** (PWA + сервер), не нативный Android. v3.6.0. Google Cloud Text-to-Speech + Gemini, билингвальные таблицы иврит↔русский, морфология, квизы.

## Роли проекта (применять ВСЕГДА для дизайн/качество-решений)

Для любого содержательного решения по продукту/коду (фича, UX, морфология, граф, качество данных, спорный trade-off) **автоматически применяй экспертные роли-линзы проекта R1–R5** — определения в **`docs/PROJECT_ROLES.md`**. Точечное решение → релевантная роль; кросс-режущее → все пять + синтез; развилка → варианты с разбором по ролям + рекомендация (пользователь решает). Это рабочая норма, не по напоминанию. Инвариант владельца: **бескомпромиссное качество, без заглушек.**
- **R1** ивритский лексикограф (корни/биньян, без выдуманных форм) · **R2** методист SLA (удержание, употребление>форм) · **R3** архитектор графа · **R4** премиум-UX (mobile-first RTL @380px, провенанс, без тупиков) · **R5** продукт/рынок (планка Pealim/Reverso, offline-first).

## Стек
- Node.js, `server.js` (entry, `npm start`)
- Своя БД с миграциями/бэкапами (`db/`)
- PWA-фронтенд, морфологический словарь, движок квизов
- Спряжение/склонение + перевод (Pealim) + bulk word-заметки (②): резолвер `db/premium/providers/pealim.js` (model `pealim-infl-v12` — stem-aware scoring: проклитика-слова כזאת→זאת через Dicta-стем, без угадывания); отчёт качества + извлечённые уроки + нерешённое → **`docs/WORDNOTE_CONJUGATION_QUALITY_REPORT_2026_06.md`** (≈99.4% корректность). Инструмент теста/генерации: `scripts/premium/build-notes-from-bundle.js`.
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
npm run pwa:icons                # генерация PWA-иконок
npm run tts:models:check         # проверка TTS-моделей/чексумм
```

## Конвенции
- Перед коммитом прогонять релевантные `smoke:*` наборы (morph/quiz/crosstext) и `test:api-smoke`.
- БД: изменения схемы — только через `db:migrate`; перед рискованными операциями `db:backup`.
- Ключи Google Cloud / Gemini — в окружении/`.env`, не в коде.
- `Архив/`, `.tmp/`, `logs` — не коммитить.

## Замечания
Каталоги `.claude/`, `.playwright-mcp/`, `.external/`, `.kilo/` — служебные. Playwright уже используется для smoke — браузер ставится при первом запуске.

---

## Продакшн-деплой

**URL:** `https://linguistpro.kolosei.com`  
**Инфраструктура:** Hetzner CX23 (4 vCPU / 8 GB RAM, Falkenstein DE), Coolify 4.1.1, Traefik + Let's Encrypt  
**Деплой:** git push в `main` → GitHub webhook → Coolify автосборка Docker (Dockerfile в корне)  
**Данные:** Docker volume `glmw0wjd6nm70fntxgjy6fkp-linguistpro-data` → `/app/data` в контейнере  
**Бэкап:** `/opt/backup-linguistpro.sh` → `/opt/backups/linguistpro/` ежедневно в 03:00 UTC (14 дней)  
**Мониторинг:** UptimeRobot → `https://linguistpro.kolosei.com/healthz`, алерты на peter@kolosei.com  
**Ресурсы контейнера:** CPU 1.5 cores, RAM hard limit 1536 MB  
**SSH:** `ssh -i ~/.ssh/hetzner_kolosei peter@167.235.200.19`  
**Coolify UI:** `http://167.235.200.19:8000` (порт открыт)  

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
