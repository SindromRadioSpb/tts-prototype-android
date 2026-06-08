# Ben-Yehuda Reading Room — Implementation Status & Audit Guide

**Дата:** 2026-06-08 · **Назначение:** as-built отчёт для аудита, тестирования и
выдачи рекомендаций/доработок владельцем. Описывает ФАКТ реализации (не план).
Источники канона: [strategy](strategy/BEN_YEHUDA_LIBRARY_READING_ROOM_STRATEGY.md) ·
[backlog](planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md) ·
[gap-matrix](research/BEN_YEHUDA_READING_ROOM_GAP_MATRIX.md) ·
[csv→schema mapping](planning/BEN_YEHUDA_PSEUDOCATALOGUE_MAPPING.md).

---

## 0. Сводка

| Тикет | Что | Статус | Commit | SW | Гейты |
|---|---|---|---|---|---|
| **P0-001** | Модель метаданных корпуса + bundle v2.1 | ✅ SHIPPED + PROD-LIVE | `9e1e765` | `v3.10.6-corpus-meta` (live) | `smoke:corpus` 54/54 |
| **P0-003** | Модель полок/коллекций (2 трека) | ✅ SHIPPED (деплоится) | `2e52df9` | `v3.10.7-shelves` | `smoke:shelves` 30/30 · `smoke:shelves-roundtrip` 17/17 |
| **P0-002** | Поверхность Читального зала (`library.html`) | ✅ SHIPPED | (room-commit) | `v3.10.8-room` | `smoke:room` 14/14 |
| **P0-002a** | Room-mode (чистое чтение из Зала; deep-link `?room=1`) | ✅ SHIPPED | (room-commit) | `v3.10.8-room` | `smoke:room-mode` 23/23 |

Регрессия по всему: `smoke:notes-roundtrip` 25/25, `test:api-smoke` OK. Прод-проверено: `curl …/sw.js` → `v3.10.6-corpus-meta`, `/healthz` 200.

**Архитектурный инвариант, найденный при реализации (важно для аудита):** живой стор пользователя = **клиентский OPFS** (`public/db/local-db.js`, своя миграц-система, теперь до **054**). Серверные `/api/library/texts*` — все `gone410`; серверный `migrations/` (макс 019) и `db/libraryRepo.js` — **легаси, не путь Зала**. Продюсер бандлов `build-notes-from-bundle.js` — файловый (JSZip, без серверной БД). → **серверных миграций в этом треке нет.**

---

## 1. BRR-P0-001 — модель метаданных корпуса (as-built)

**Решение по хранению — Option A (владелец):** версионированный объект `corpus` внутри существующей колонки `source_meta_json` (0 миграций БД, lossless round-trip — `source_meta` это pass-through поле бандла).

**Файлы:**
- `db/premium/corpusMeta.js` (НОВЫЙ) — единый контракт (Node-only). Экспорт: `CORPUS_SCHEMA_VERSION`, `CORPUS_META_VERSION`, `REVIEW_STATUS`, `AUDIO_STATUS`, `TRACK`, `REGISTER`, `ERA`, `CORPUS_FIELDS`, `FACET_FIELDS`, `authorSlug`, `normalizeForHash`, `computeContentHash`, `buildCorpus`, `validateCorpus`, `getCorpus`, `readFacet`, `filterByFacet`, `dedupeByContentHash`, `liftCorpusToBundle`, `mergeCorpusIntoSourceMeta`.
- `public/db/local-db.js` — export: top-level `corpus` + `corpus_meta_version:1` в `library.json`; import: `item.corpus` → `source_meta_json.corpus` (inline-зеркало контракта).
- `scripts/premium/build-notes-from-bundle.js` — продюсер: `getCorpus()` → fill `content_hash` → `validateCorpus()` (R1-гейт, `process.exit(3)` на ложь) → штамп `corpus_meta_version` → перезапись `library.json`.
- `scripts/premium/corpus-meta-smoke.js` (НОВЫЙ) + `npm run smoke:corpus`.
- `docs/planning/BEN_YEHUDA_PSEUDOCATALOGUE_MAPPING.md` (НОВЫЙ).

**Контракт `corpus` (объект в `source_meta_json.corpus`):**
поля = `schema · byehuda_id · content_hash · author · author_slug · translator · orig_language · era · genre · themes[] · register · track · difficulty · provenance{source,url,license,reviewer,reviewed_at} · attribution · review_status · audio_status`.
- Закрытые enum-честности (R1): `review_status ∈ {machine, machine_assisted, human_proofread}` (default `machine`), `audio_status ∈ {none, tts, human}` (default `tts`), `track ∈ {accessible, literary}`, `register ∈ {literary, spoken, archaic, poetic, mixed}`.
- `era` — рекомендуемый словарь (R7-расширяемый): unknown → warning.
- `difficulty` — integer 1..5 или null (Phase 2 / P1-007; сейчас null).
- `content_hash` — `sha256:<64hex>` над нормализ. консонантным he_plain (никуд-нечувствит.); пустой контент → **null** (не empty-SHA sentinel).

**Bundle v2.1:** `schema_version` остаётся **1** (без ложного forward-compat-warning); маркер = аддитивный `corpus_meta_version:1`. Round-trip lossless (`corpus` ↔ `source_meta.corpus`, byte-identical).

**Гейт `smoke:corpus` (54/54) проверяет:** build/honest-defaults/field-set · content_hash детерминизм+никуд-нечувствительность+null-на-пустом · validateCorpus режет ложь (`вычитано`/`native`/translator+orig=he/bad-hash/empty-SHA/out-of-band-difficulty/human-claim-без-доказательств/non-ISO-lang) · bundle v2.1 round-trip · dedup by content_hash · facet filter · drift-pin браузерного транспорта.

**Адверс-ревью (3 линзы × verify) → 7 находок исправлено:** продюсер валидирует через `getCorpus` (каноничный home) · empty→null hash · human-claim warnings · orig_language ISO-check · исправлен ложный version-комментарий · difficulty band закреплён · transport drift-pin.

---

## 2. BRR-P0-003 — модель полок/коллекций (as-built)

**Решение по хранению — Option A (владелец):** новая OPFS-таблица `shelves` (клиентская **миграция 054**) + round-trip через бандл (`library.json.shelves[]`, аддитивный сиблинг). Член ссылается по **`text_key`** (единственный id, переживающий импорт; `id` пересоздаётся).

**Файлы:**
- `db/premium/shelfMeta.js` (НОВЫЙ) — контракт (Node-only). Экспорт: `SHELF_SCHEMA_VERSION`, `TRACK` (reuse из corpusMeta), `SHELF_FIELDS`, `slugify`, `normalizeItems`, `buildShelf`, `validateShelf`, `validateMembership`.
- `public/db/migrations.js` — миграция 054: `CREATE TABLE shelves (id, slug UNIQUE, title, track, era, genre, editorial_intro, items_json, order_index, schema_version, created_at, updated_at)` + индексы `ux_shelves_slug`, `ix_shelves_track_order`.
- `public/db/local-db.js` — `getShelves()` (l.459), `getShelfBySlug()` (l.469), `createShelf()` (l.475), `_upsertShelfFromBundle()`, `_exportShelves()`, `_validateShelfForImport()`. Export добавляет `shelves[]`; import апсертит по slug (skip/overwrite) **с валидацией на браузерном пути**.
- `scripts/premium/shelf-meta-smoke.js` (НОВЫЙ) + `npm run smoke:shelves`.
- `scripts/premium/shelf-roundtrip-smoke.js` (НОВЫЙ, real-OPFS) + `npm run smoke:shelves-roundtrip`.

**Контракт `shelf`:** `schema · slug · title · track · era · genre · editorial_intro · items[{text_key, order}] · order`.
- `slug` = портируемая идентичность (upsert-ключ); **НЕ фабрикуется** из не-latin текста (R6 — курация задаёт явный slug).
- `editorial_intro` отсутствует → warning (R8: полка = маршрут, не список); пустые items → honest empty-state warning.

**Браузерная валидация импорта (R1, ключевое):** `shelfMeta` — Node-only, поэтому `local-db.js` сам проверяет track-enum/slug/title на пути импорта (`_validateShelfForImport`). Невалидная полка → honest `{stage:'shelf', slug, error}` (UI-показуемо, как у других импортёров), **не** opaque SQLite-ошибка и **не** молчаливая невалидная строка. Dup-slug в бандле и dangling-member (R8 dead-end) → warn (не молча).

**Гейты:**
- `smoke:shelves` (30/30, Node-контракт): build/slug/items-normalize/dense-order · validateShelf errors+warnings · validateMembership (track-mismatch+missing) · TRACK reuse · source-pin браузерного плюминга + миграции 054.
- `smoke:shelves-roundtrip` (17/17, **real-OPFS browser**): createShelf→export→wipe→import→getShelves · items_json целостность (incl не-latin text_key) · skip-vs-overwrite · slug UNIQUE reject · multi-shelf ordering (track, COALESCE(order_index,999999), title) · invalid-shelf reject (no row) · dangling-member tolerate.

**Адверс-ревью (correctness/silent-failure/test-coverage × verify) → 12 находок исправлено:** валидация на пути импорта · honest error-shapes · dup-slug + dangling-member warns · логирование swallowed DB-ошибок в export-ридерах · и весь пробел real-OPFS-тестов (Node-смоук только симулировал).

---

## 3. BRR-P0-002 + P0-002a — поверхность Зала + room-mode (as-built, ✅ SHIPPED)

**Статус:** ✅ построено + проверено @380px (RTL+LTR) + гейты зелёные; визуальный ОК владельца получен (структура/поведение/гейты); SW `v3.10.8-room`.

**Макет — Variant A (выбор владельца):** табы трека → вертикальная стопка полок → горизонтальные карусели карточек-работ.

**Файлы:**
- `public/library.html` (НОВЫЙ) — статика как teacher.html; sub-brand header + lang-select + табы; фокус-тема (auto light/dark) + RTL (авто через i18n).
- `public/js/library-ui.js` (НОВЫЙ) — Layout A; `getShelves()` → группировка по треку → рендер; карточка-работа = семантический `<a href>` deep-link; honest empty-states; dangling-член = disabled-карточка.
- `public/i18n/locales/{ru,en,he}.js` — namespace **`room.*`** (+ `room.back`/`room.readingTitle`; HE — черновик, ждёт native-review).
- `scripts/premium/room-shot.js` / `room-mode-shot.js` (НОВЫЕ) — @380px скриншот-харнессы.
- `scripts/premium/room-smoke.js` + `room-mode-smoke.js` (НОВЫЕ) + `npm run smoke:room` / `smoke:room-mode`.

**Reader-handoff:** ридер **переиспользуется через deep-link на index.html** (`/index.html?room=1#/t/<base64url(JSON)>`), НЕ embedded. `?room=1` ДО `#` → base64-пейлоад байт-идентичен; кодировка проверена против `index.html#v3DeeplinkBase64urlEncode`.

**P0-002a room-mode (чистое чтение из Зала):** `?room=1` → `body.room-mode` (выставляется pre-paint, без FOUC; survives hash-clear т.к. `replaceState` хранит search; **без sessionStorage** — direct `/index.html` без room=1 = полная Студия, без утечки). Презентационный CSS-слой (`body.room-mode`, !important) скрывает: `.classic-shell-head` (nav), `.classic-workflow-column` (композер+TTS+перевод/translit-конфиг), `#classicStatusStrip` (биллинг), `#classicResultPanel` (save/export/provenance), `#classicExportHint`/`.export-actions`, `#tableEditToolbar`, `.row-note-btn`, IDE-хром. **Оставляет:** таблицу (he/никуд/транслит/ru) + ▶-аудио + тоггл-колонки (`#tableSettings`) + on-tap морфологию + back-bar «← В библиотеку» (`#roomReturnBar`, R4 не-тупик). **First-run-цепочка подавлена в room-mode (решение-а):** `v3Phase6PromptShouldShow`/`v3OnboardingShouldShow` (обе — 25562 + эффективная 44921 key `onboardingSeen_v1`)/`showGcpTtsKeyHintOnce`/`byokOnboardingShouldShow` — ранний `return` при `body.room-mode`, **флаги НЕ взводятся** (полное приложение позже всё ещё покажет миграцию/онбординг → нет потери данных/онбординга).

**Гейты:** `smoke:room` (14/14, library.html: полки/карусели/deep-link-href с `room=1`/empty-state). `smoke:room-mode` (23/23, real reader: Studio-хром скрыт, чтение+аудио+aids видимы, back-link, first-run-модалки НЕ видимы (getClientRects — fixed-aware) + seen-флаги unset, контра-кейс без утечки).

**Известная мелочь (полировка):** в шапке таблицы остаётся маленькая ✎-иконка (action-колонка) — кандидат на скрытие; ▶-аудио рядом обязателен.

---

## 4. Полный реестр тестов (как запускать)

```
npm run smoke:corpus              # P0-001 контракт + bundle v2.1            (54/54, Node)
npm run smoke:shelves             # P0-003 shelf-контракт                    (30/30, Node)
npm run smoke:shelves-roundtrip   # P0-003 real-OPFS round-trip              (17/17, browser)
npm run smoke:room                # P0-002 поверхность Зала                  (13/13, browser)
npm run smoke:notes-roundtrip     # регрессия bundle export/import           (25/25, browser)
npm run test:api-smoke            # серверный sanity + 410-tripwire          (OK)
node scripts/premium/room-shot.js # @380px RTL/LTR скриншоты → .tmp/room-shots/
```
Браузерные смоуки требуют Playwright (ставится при первом запуске). Все используют `serviceWorkers:'block'` + viewport 380×844.

**Прод-проверка:** `curl -s https://linguistpro.kolosei.com/sw.js | grep CACHE_VERSION` (ожид. `v3.10.6-corpus-meta`; после деплоя P0-003 → `v3.10.7-shelves`). `/healthz` → 200.

---

## 5. Отклонения от стратегии/плана (для аудита — каждое с обоснованием)

| Стратегия говорила | Реализовано | Почему |
|---|---|---|
| «расширить `texts` + поля/таблицы» | corpus в `source_meta_json` (0 миграций для P0-001) | live-стор = OPFS; серверный `texts` 410'd; Option A владельца — миграция-без-боли через версионированный контракт |
| Reader = reuse `renderTable`/`v3LibraryOpenText` (подразумевалось embedded) | **deep-link на index.html** (room-mode позже) | embed = риск извлечения из 50+ глобалов index.html; deep-link переиспользует движок целиком, low-risk |
| «Зал — ОТДЕЛЬНЫЙ лёгкий precache (sw-room.js)» | **переиспользуем `sw.js`** (scope `/` уже покрывает library.html) | т.к. ридер = index.html, отдельный SW даёт мало; Room-shell добавится в общий precache. **⚠ Это отклонение от инварианта стратегии — кандидат на ваш пересмотр** |
| Тема Зала | auto `prefers-color-scheme` | НЕ синхронизирована с явным toggle index.html (localStorage) — см. caveats |

---

## 6. Известные caveats / отложенное → кандидаты на доработку

**P0-002 (поверхность):**
- 🟡 НЕ закоммичено — ждёт вашего визуального ОК.
- ✅ **room-mode в index.html** РЕАЛИЗОВАН (BRR-P0-002a, см. §3): `?room=1` → `body.room-mode` прячет весь Studio-хром + подавляет first-run-цепочку (без взвода флагов). Остаётся мелочь: ✎-иконка в шапке таблицы (полировка).
- **HE i18n `room.*`** — черновик Claude, ждёт native/ulpan-review.
- **Тема не синхронизирована** с index.html (Зал — авто-тема, не читает localStorage-toggle index.html).
- Полировка: fade-градиент на краю карусели (scroll-affordance); badges провенанса/сложности на карточках — это P0-005/P1-007.
- Reader deep-link E2E с РЕАЛЬНЫМ открытием текста (с предложениями) не прогонялся в смоуке (фикстура без sentences); кодировка/маршрут проверены.

**P0-001/P0-003 (модели):**
- `author`/`translator` НЕ нормализованы в entity-таблицы (R3 defer; `author_slug` кладёт ID-фундамент).
- `difficulty` — не вычисляется (Phase 2 / P1-007).
- **`pseudocatalogue.csv` header не верифицирован** против живого файла — обязательная пред-работа P0-004 (tripwire в mapping-доке).
- corpus same-POS / прочие — вне scope P0-001.

**Стратегические:** отклонение по SW (см. §5) — если инвариант «отдельный лёгкий precache» критичен, нужен отдельный тикет на sw-room.js + (вероятно) embedded-ридер.

---

## 7. Открытые решения, ждущие владельца

1. **P0-002: визуальный ОК** макета (или правки) → разблокирует SW-bump+commit+push (`v3.10.8-room`).
2. **Reader-стратегия:** принять deep-link-reuse (+ отдельный тикет на room-mode index.html) ИЛИ требовать embedded-ридер (бóльший рефактор).
3. **SW-стратегия:** принять reuse `sw.js` ИЛИ требовать отдельный `sw-room.js` (инвариант стратегии).
4. **Следующий тикет:** P0-004 (ингестия pseudocatalogue.csv → бандлы, наполняет corpus+shelves) или P0-005 (провенанс/честные метки). Оба зависят от уже готовых схем.

---

## 8. Чек-лист аудита (предлагаемый)

- [ ] Прогнать все гейты §4 — зелёные?
- [ ] R1-честность: `validateCorpus`/`validateShelf` реально режут ложь (см. assertions в смоуках)?
- [ ] Schema-first: контракты `corpus`/`shelf` версионированы и аддитивно-расширяемы (нет «болезненной миграции»)?
- [ ] Bundle v2.1 обратно-совместим (старые импортёры игнорируют `corpus`/`shelves`/`corpus_meta_version`)?
- [ ] Дедуп: corpus по `content_hash`; полки по `slug` UNIQUE — честные ключи?
- [ ] @380px RTL (HE): скриншоты Зала без overflow/каши; honest empty-state?
- [ ] Прод: `v3.10.6` live; после P0-003 деплоя — `v3.10.7`.
- [ ] Отклонения §5 — приемлемы или нужен пересмотр?
- [ ] Дать задачи на доработку по §6/§7.
