# OPFS + SQLite WASM Migration Plan

## Implementation Status (2026-05-06)

**Feature flag `?localMode=1`** (или `localStorage.localMode = '1'`) — при включении весь stateful-доступ идёт в OPFS, минуя Railway.

| Фаза | Статус | Что сделано | Что осталось |
|------|--------|-------------|--------------|
| 0 — Инфраструктура | ✅ Done | `public/db/`: wa-sqlite (mjs+wasm), AccessHandlePoolVFS, sqlite-api, migrations (19 шт.), db-worker, local-db API shim, jszip. Тестовая страница `/db/db-init-test.html` — **12 проверок** (init, схема, CRUD текста/предложения/заметки/прогресса/события, OPFS persistence, save-as-new flow, reorder UNIQUE-конфликта, audio-asset link survival, **getAnalytics агрегаты**). COOP/COEP заголовки в server.js. | — |
| 1 — Чтение библиотеки | ✅ Done | listTexts, recentActivity, getTextById, getSentences (с JOIN на audio_assets), listNotes, search (texts/rows/notes), nav resolve (sentence+note), restore-saved-table. Все READ-fetch'и в `index.html` помечены LOCAL_MODE-веткой. | — |
| 2 — Запись | ✅ Done | Notes upsert/delete, createText, updateText, deleteText, archiveText, touchOpened, sentence CRUD (edit/reset/delete/add/move/dnd/bulk), pin/unpin, history events, JSON export/import, ZIP-bundle export/import. **Stateless `POST /api/export/docx`** + LOCAL_MODE branch в `v3IdeExportDocx`/Classic Word-button — DOCX теперь экспортируется в LOCAL_MODE. | — |
| 3 — Прогресс/поиск/аналитика | ✅ Done | progress GET+POST (с sendBeacon-bypass в LOCAL_MODE), v3LibraryRefresh + v3LibraryOpenText, dashboard refresh (lib + recent + activity), recent-rows derived из events, text meta save, search via local-db. **Локальная аналитика**: `getAnalytics({days, includeArchived})` агрегирует `plays/unique_rows/unique_texts/time_ms` по таблице `events` для period (7 дней) и all-time, мапится в shape `v3DashAnalytics`. Покрыто Test 12. | — |
| 4 — SRS | ✅ Done | templates, today/summary, createCard, reviewCard, sessions create/review/finish, trainer-view, attempts/check. **Anki премиум**: кастомная модель **`LinguistPro SRS Card v1`** (createModel idempotent, поля Hebrew/Niqqud/Translit/Russian/Note/Audio + CSS); audio attachments через `storeMediaFile` + `[sound:lp_<key>.mp3]`; `findNotes` + `notesInfo` + `changeDeck` для duplicate-resolution. **Fuzzy grading**: `v3FuzzyNormalize` (NFC, niqqud strip, punctuation, articles) + `v3LevenshteinAtMost` (budget = floor(len/8) или 1) — типичные опечатки и диакритика прощаются. | `.apkg`-генерация (offline без AnkiConnect) — отдельный TODO. |
| 5 — ZIP-bundle с аудио | ✅ Done | Export: ZIP в **unified Android-v2 формате** (`docs/ANDROID_V2_LIBRARY_EXPORT_SPEC.md`) — `manifest.json` (app_id=linguist-pro-web, export_schema_version=1) + `library/library.json` (поля `text_id`/`rows`/`hebrew_plain`/`audio_assets[]` с `provenance.ttsProfile`) + `audio/<asset_key>.mp3` + `metadata/missing_audio.json`. Import принимает оба layout'а (unified `library/library.json` + `audio/`, legacy web `library.json` + `audio-cache/`). Round-trip через `library-bundle-top100maco-150verb-150pril.zip` работает. Re-uploads MP3 в Railway audio-cache через `POST /api/audio/cache/upload`. `v3RowTtsTrackPlay` пишет audio_assets+sentence_audio в OPFS при каждом проигрывании. JSON export пишет `library.json`-shape (`schema_version`+`texts`+`audio_assets`) — структурно совпадает с library.json внутри ZIP. | — |
| 6 — Default-on + cleanup | ⏳ Pending | Документация актуализирована. **One-time migration helper**: кнопка «Импорт из облака» в Library toolbar (видна только в LOCAL_MODE при пустой OPFS-библиотеке) — выгружает данные с Railway через `/api/library/export` и применяет через `importBundle` (idempotent, mode=skip). | Включить `localMode` по умолчанию (требует dogfooding); удалить серверные library/SRS-routes (или перевести в опциональный sync); обновить публичные docs / changelog / onboarding. Финал DoD: e2e-проверка ZIP cross-device на двух устройствах. |

**Bug-fixes (2026-05-05):**
- `v3LibrarySaveCurrentCore` падал с "Не удалось сохранить" при «Сохранить как новый» в LOCAL_MODE: причина — INSERT в `texts` с NULL в `title` (NOT NULL column). Исправлено в `local-db.js#createText` (coerce null → ''). `addSentence` тоже получил defensive coercion для всех string-полей и JSON-стрингификацию для `meta_json`/`edit_meta_json`.
- Toast в `v3LibrarySaveCurrentCore`/`v3LibraryUpdateCurrentCore` теперь показывает первые 160 символов текста ошибки — раньше пользователь видел только "Не удалось сохранить" без деталей.
- `initLocalDB` теперь имеет отдельный `_initialized` флаг — раньше `isReady()` возвращал `true` даже если `_call('init')` упал (worker создан, но миграции не применены). `ensureLocalDB()` в `index.html` бросает читаемую ошибку, если init упал.
- `db-worker.js`: `sqlite3.open_v2(...)` использовал имя VFS `'opfs-ahp'`, тогда как `AccessHandlePoolVFS#name` возвращает `'AccessHandlePool'`. SQLite не находил VFS, init падал с «sqlite3_open_v2». Исправлено: `vfs.name` передаётся напрямую, плюс try/catch с диагностикой имени VFS и кода ошибки.
- `reorderSentences` падал с `UNIQUE constraint failed: sentences.text_id, sentences.order_index` при добавлении строки между существующими ИЛИ при перестановке (move/DnD): наивный последовательный UPDATE нарушал UNIQUE-индекс на промежуточных шагах. Решение: two-pass в одной транзакции — сначала все рядки этого текста парком на отрицательные значения, затем финальная расстановка 0..N-1. Покрыто Test 10 в `/db/db-init-test.html`.
- AnkiConnect health-check (`v3SrsAnkiCheckConnect`, `v3AnkiHealth`) при `LOCAL_MODE` теперь идёт напрямую из браузера к `http://127.0.0.1:8765`, минуя Railway-сервер. Если AnkiConnect блокирует CORS — показывается подсказка добавить `location.origin` в `webCorsOriginList`.
- `v3AnkiPushNow` («Экспортировать» в Anki-модалке) падал с `Ошибка экспорта: TEXT_NOT_FOUND (HTTP 404)` в LOCAL_MODE: текст лежит в OPFS, а POST шёл на `/api/library/texts/:id/push/anki`. Исправлено: новый `v3AnkiPushLocalMode(textId, opts)` читает text+sentences+notes из OPFS, idempotent создаёт deck, формирует ноты моделью **Basic** и шлёт `addNotes` через `v3AnkiConnectDirect`. Аудио-экспорт в Anki пока deferred.
- `v3LibraryExportBundle` в LOCAL_MODE теперь делает настоящий ZIP-with-audio: подтягивает каждый `audio_asset_key` из Railway audio-cache (concurrency=6, неудачи пишутся в `missing_audio.json`), пакует через JSZip. Импорт умеет распаковать ZIP (`library.json` внутри) или принять plain-JSON. `v3RowTtsTrackPlay` дополнительно линкует `audio_assets` ↔ `sentence_audio` в OPFS, чтобы будущие экспорты содержали аудио без серверного round-trip.

**Bug-fixes (2026-05-06, batch 3):**
- Audio cache markers: после reload и повторной загрузки текста из библиотеки кружочки строк не зеленели даже когда `audio_assets`/`sentence_audio` уже хранили линки. Причина — `local-db.js#getSentences` возвращал только колонки таблицы `sentences`, без JOIN на `audio_assets`/`sentence_audio`, поэтому `s.audio_asset_key` всегда был `undefined`, и UI-mapping выставлял `_v3_audioAssetKey = ""`. Fix: `getSentences` теперь делает `LEFT JOIN sentence_audio ON … is_default=1 LEFT JOIN audio_assets`, и в каждой строке возвращает `audio_asset_key` + `audio_tts_profile_json` — то же, что отдаёт серверный `/api/library/texts/:id/sentences`. Артефакт: `db-init-test.html#TEST 11` создаёт текст с двумя предложениями, линкует mock-аудио через `upsertAudioAsset`+`linkSentenceAudio`, перечитывает и проверяет, что обе функции (`getSentences` и `getDefaultAudioMap`) возвращают `audio_asset_key` для каждого предложения.
- Anki Export в новый deck: `'cannot create note because it is a duplicate'` для всех нот, даже когда пользователь даёт новое имя deck'а. Причина — Anki дедуплицирует Notes на уровне *коллекции* (хэш первого поля уникален во всей DB), не на уровне deck'а. Поэтому `addNotes` отказывал, даже хотя deck новый. Fix: после `canAddNotes` preflight (с явным `duplicateScope: 'deck'` + `duplicateScopeOptions: { deckName, checkChildren: false, checkAllModels: false }`), для дубликатов `v3AnkiPushLocalMode` теперь:
  1. `findNotes` → ищет существующие Notes по `<frontField>:"<text>"` (с правильным экранированием).
  2. `notesInfo` → собирает `cards: [...]` для каждого найденного Note.
  3. `changeDeck` → переносит эти Cards в запрошенный deck.
  4. `addTags` → ставит тег `linguistpro <textTitle>` на эти Notes для будущей фильтрации.
  Toast теперь показывает «создано N, перенесено в этот deck M card(s), дубликатов Note K, не найдено в Anki L». Вместо «Ошибка» — реальная статистика.

**Bug-fixes (2026-05-06, batch 2):**
- Аудио-метки в Classic mode не зеленели:
  - **Single play → жёлтый**: `v3AudioPrefetchProfilesEqual` отказывал, если `voiceName` пустой (например, пользователь не успел выбрать голос — TTS прошёл с серверным fallback). Теперь `v3AudioPrefetchUpdateMarkerForRow` при неполном профиле (любая сторона возвращает null после нормализации) даёт `state-ok` если есть `assetKey` — лучше чем безосновательный жёлтый.
  - **Batch prefetch → серый**: после job.state="done" клиент звал `/api/library/texts/:id/sentences` чтобы узнать `audio_asset_key`, но в LOCAL_MODE сервер не имеет копии текста. Server теперь возвращает per-row `results: [{sentenceId, assetKey, fromCache}]` в `v3AudioPrefetchJobPublic`. Клиент в LOCAL_MODE использует их для (а) обновления `currentTableData[i]._v3_audioAssetKey`, (б) `upsertAudioAsset` + `linkSentenceAudio` в OPFS — чтобы reload показал зелёные метки.
  - **Reload → серый**: уже частично исправлено в предыдущей итерации (`v3ClassicEnrichSavedRows` зовёт `getDefaultAudioMap`); теперь работает end-to-end, потому что batch flow заполняет `audio_assets`/`sentence_audio` в OPFS.
- Anki Export Classic mode: «Ошибка экспорта: ['cannot create note because it is a duplicate', ...]». Причина — некоторые форки AnkiConnect (включая AnkiConnect Plus) возвращают per-note ошибки в `error: ['msg1', 'msg2', ...]` вместо `result: [null, null, ...]`. Старый `v3AnkiConnectDirect` делал `String(j.error)` → выдавал массив как строку, и пользователь видел "ошибку" даже когда экспорт был успешным (просто все были дубликатами). Fix: `v3AnkiConnectDirect` теперь ловит массив в `error` и кладёт его в `e.perNote` (плюс `e.result`); `v3AnkiPushLocalMode` сначала делает `canAddNotes` preflight, шлёт только non-duplicate notes, парсит per-note ошибки и считает «дубликат / пустой / прочая ошибка» отдельно. Toast теперь показывает корректную статистику без ложного "Ошибка".

**Bug-fixes (2026-05-06):**
- Anki Export в Classic mode возвращал `cannot create note because it is empty` для большинства строк. Причина — модель «Basic» в локализованной (русской) Anki использует поля «Лицевая сторона»/«Тыльная сторона», а код жёстко слал `Front`/`Back`. AnkiConnect молча оставляет неизвестные поля пустыми, и Anki отвергает note c пустым первым полем. Fix: `v3AnkiPushLocalMode` теперь делает `modelNames` → выбирает Basic-подобную модель по подстроке (включая `базов`), затем `modelFieldNames` → берёт реальные имена полей. Плюс пропускаются строки, где и Front, и Back пустые. Плюс `canAddNotes` пред-флайт, чтобы toast различал «дубликаты» и «прочие ошибки».
- SRS Trainer не показывал карточки в LOCAL_MODE даже после «Add to SRS». Причина 1 — `srs.todaySummary()` отдавал `{ total, new_count, learning_count, review_count }`, а UI ждал `{ dueCount, byState: {...} }` → кнопка Start всегда disabled. Причина 2 — `getSessionNext` возвращал raw row с snake_case (`he_plain`, `template_code`), а UI рендерит `current.sentence.hePlain` и `current.card.template.code`. Fix: новый mapper `v3SrsTrainerMapLocalCard()` приводит локальные карточки в shape сервера, плюс `v3SrsTrainerRefresh`/`Start`/`Review`/`HydrateCurrent`/`CheckAnswer` обновлены для работы с этим shape.
- «Export to Anki» в SRS Trainer (IDE и Classic) показывал заглушку «не реализован». Fix: `v3SrsTrainerExportAnki` и `v3IdeSrsExportAnki` теперь резолвят `card.source_sentence_id → text_id` через `ldb.resolveSentence()` и зовут `v3AnkiPushLocalMode(textId, ...)`.
- Цветовой индикатор аудио-кэша не зеленел после Save-as-New в LOCAL_MODE. Причина — `getSentences()` в OPFS не возвращает `audio_asset_key` (живёт в JOIN'ах `audio_assets` ↔ `sentence_audio`). Fix: `v3ClassicEnrichSavedRows` в LOCAL_MODE дополнительно подтягивает `getDefaultAudioMap(textId)` и сливает asset_key'и в `currentTableData[i]._v3_audioAssetKey`.
- «Создать аудио» в batch-prefetch падал HTTP 403 на Railway. Причина — `v3AudioPrefetchIsAllowed()` пускал только локальные IP или `ALLOW_REMOTE_AUDIO_PREFETCH=1`. Fix: сервер теперь принимает заголовок `X-Local-Mode: 1` как soft-разрешение (равноценно клику Play в цикле — данные пользователя), браузер шлёт его автоматически в LOCAL_MODE через `v3AudioPrefetchHttpJson`. Пользователю не нужно менять переменные окружения.

**Известные ограничения LOCAL_MODE (по фазам):**

*Фазы 2-5: всё, что было в плане, реализовано.* Открытые пункты:

*Фаза 4 (Anki — нерешено):*
- `.apkg`-генерация (offline-экспорт без AnkiConnect) — отдельный TODO; пока экспорт идёт через AnkiConnect, что требует запущенного Anki Desktop.
- При первом экспорте в новый Anki-профиль `storeMediaFile` грузит MP3 по `location.origin/api/audio/<key>` — это работает, только если Railway audio-cache всё ещё хранит ассет. Если ассет потерян, [sound:…] ссылается на отсутствующий media-файл (Anki молча играет тишину).

*Фаза 6 (cleanup — частично):*
- `localMode` остаётся opt-in (`?localMode=1`) до полноценного dogfooding и e2e cross-device-проверки.
- Серверные library-routes (`/api/library/*`, `/api/srs/*`, `/api/progress/*`) пока работают параллельно — не удалены, не переведены в опциональный sync. Решение оставлено на пост-dogfooding-этап.

*Прочее:*
- `sendBeacon` при `pagehide` не используется — keepalive-fetch fallback пишет напрямую в OPFS.
- `time_ms` в локальной аналитике — оценка `plays * 4000` (мы не пишем длительность playback'а в `events`); для точных значений нужно расширить event payload duration_ms.

**Как проверить:**
1. Открыть `<host>/db/db-init-test.html` — должны пройти 9 тестов (включая полный save-as-new flow).
2. Открыть основное приложение с `?localMode=1`:
   - Сформировать таблицу из иврит-текста.
   - Нажать «Сохранить» → «Сохранить как новый» → должен появиться toast «Сохранено в библиотеку» (или «Сохранено как новый текст»).
   - Перезагрузить страницу с `?localMode=1` — карточка должна остаться в Library.
   - Перезагрузить БЕЗ `?localMode=1` — карточки в Railway-Library НЕ должно быть (доказательство, что данные на устройстве).
   - Вернуться на `?localMode=1` — карточка снова видна.

---

## Контекст и цель

**Проблема:** При работе через браузер (`https://tts-prototype-android-production1.up.railway.app/`) все данные библиотеки (тексты, предложения, заметки, прогресс, SRS) хранятся в SQLite-базе на сервере Railway, а не на устройстве пользователя. Это подтверждено тестами-артефактами в `tests/storage_location_audit.test.js`.

**Цель:** Перенести всё хранение данных библиотеки в браузер пользователя (ПК или мобильный телефон) с использованием SQLite, работающего через WebAssembly и хранящего данные в Origin Private File System (OPFS). Railway остаётся только для stateless-сервисов: TTS-синтез, перевод, генерация DOCX.

**Результат:** Пользователь открывает URL в браузере, все его данные живут только на его устройстве, Railway ничего не хранит.

---

## Технологический стек

### Выбранная библиотека: `wa-sqlite`

| Критерий | wa-sqlite | @sqlite.org/sqlite-wasm | sql.js |
|----------|-----------|------------------------|--------|
| Размер бандла | ~1.5 MB | ~5 MB | ~3 MB |
| OPFS поддержка | ✅ AccessHandlePool (лучшая) | ✅ OPFS + OPFS-worker | ❌ только memory |
| Web Worker | ✅ встроенная | ✅ | ❌ |
| Активная разработка | ✅ | ✅ | медленная |
| Лицензия | MIT | Apache-2.0 | MIT |

**Решение:** `wa-sqlite` с `OPFSCoopSyncVFS` (через `AccessHandlePool`) — данные хранятся в реальном файле `app.db` в Origin Private File System браузера.

### OPFS — что это

Origin Private File System — изолированная файловая система браузера, привязанная к конкретному origin (`tts-prototype-android-production1.up.railway.app`). Данные живут на устройстве пользователя в директории браузера (Chrome: `Chrome/User Data/Default/File System/`).

**Поддержка браузеров:**
- Chrome 102+ ✅
- Edge 102+ ✅
- Firefox 111+ ✅
- Safari 15.2+ ✅ (частично; `AccessHandlePool` только Chrome/Edge)
- Safari мобильный 15.2+ ✅ (с fallback на `IDBBatchAtomicVFS`)

---

## Архитектура после миграции

```
┌─────────────────────────────────────────────────────────┐
│                   Браузер пользователя                   │
│                                                         │
│  index.html (UI)                                        │
│      │                                                  │
│      │  postMessage()          ┌────────────────────┐   │
│      ├────────────────────────►│  db-worker.js      │   │
│      │                         │  (Web Worker)       │   │
│      │  { ok, rows, error }    │  wa-sqlite WASM     │   │
│      ◄────────────────────────┤  ↓                  │   │
│      │                         │  OPFS: app.db       │   │
│      │                         │  (файл на ПК/phone) │   │
│      │                         └────────────────────┘   │
│      │                                                  │
│      │  fetch() — только для внешних API               │
│      │                                                  │
└──────┼──────────────────────────────────────────────────┘
       │
       │  HTTPS (stateless)
       ▼
┌──────────────────────────────────────────────────────────┐
│              Railway (только вычислительные API)          │
│                                                          │
│  POST /api/tts              — Google Cloud TTS           │
│  POST /api/tts/hebrew-local — Hebrew TTS sidecar         │
│  POST /api/translate-table  — Gemini AI перевод          │
│  POST /api/niqqud           — Огласовка через Gemini     │
│  POST /api/export-docx      — Генерация DOCX             │
│  GET  /api/audio/:key       — Стриминг MP3 файлов        │
│  GET  /api/client-config    — Конфигурация клиента       │
│  GET  /api/usage            — Квоты TTS/Gemini           │
│  POST /api/library/texts/:id/push/anki — Anki sync       │
│                                                          │
│  НЕТ: хранение библиотеки, заметок, прогресса, SRS       │
└──────────────────────────────────────────────────────────┘
```

---

## Классификация API-маршрутов

### Маршруты, которые переходят в браузерный SQLite (OPFS)

| Маршрут | Метод | Действие |
|---------|-------|----------|
| `/api/library/texts` | GET | Список текстов → `localDB.listTexts()` |
| `/api/library/texts` | POST | Создать текст → `localDB.createText()` |
| `/api/library/texts/:id` | GET | Получить текст → `localDB.getTextById()` |
| `/api/library/texts/:id` | PUT | Обновить текст → `localDB.updateText()` |
| `/api/library/texts/:id` | DELETE | Удалить текст → `localDB.deleteText()` |
| `/api/library/texts/:id/archive` | POST | Архивировать → `localDB.archiveText()` |
| `/api/library/texts/:id/meta` | PATCH | Метаданные → `localDB.updateTextMeta()` |
| `/api/library/texts/:id/opened` | POST | Отметить открытие → `localDB.touchOpened()` |
| `/api/library/texts/:id/sentences` | GET | Предложения → `localDB.getSentences()` |
| `/api/library/texts/:id/sentences` | POST | Добавить → `localDB.addSentence()` |
| `/api/library/texts/:id/sentences/:sid` | PATCH | Редактировать → `localDB.updateSentence()` |
| `/api/library/texts/:id/sentences/:sid` | DELETE | Удалить → `localDB.deleteSentence()` |
| `/api/library/texts/:id/sentences/:sid/reset` | POST | Сброс → `localDB.resetSentence()` |
| `/api/library/texts/:id/sentences/reorder` | PATCH | Порядок → `localDB.reorderSentences()` |
| `/api/library/texts/:id/notes` | GET | Заметки → `localDB.listNotes()` |
| `/api/library/texts/:id/notes/:sid` | PUT | Сохранить заметку → `localDB.upsertNote()` |
| `/api/library/texts/:id/notes/:sid` | DELETE | Удалить заметку → `localDB.deleteNote()` |
| `/api/sentences/search` | GET | Поиск предложений → `localDB.searchSentences()` |
| `/api/notes/search` | GET | Поиск заметок → `localDB.searchNotes()` |
| `/api/nav/resolve` | GET | Навигация → `localDB.resolve()` |
| `/api/progress/:textId` | GET | Прогресс → `localDB.getProgress()` |
| `/api/progress/:textId` | POST | Сохранить прогресс → `localDB.setProgress()` |
| `/api/history/recent-activity` | GET | Активность → `localDB.recentActivity()` |
| `/api/history/event` | POST | Событие → `localDB.recordEvent()` |
| `/api/library/export/bundle` | GET | Экспорт ZIP → `localDB.exportBundle()` |
| `/api/library/import/bundle` | POST | Импорт ZIP → `localDB.importBundle()` |
| `/api/srs/*` | все | SRS → `localDB.srs.*()` |

**Итого: ~35 маршрутов переходят в браузер.**

### Маршруты, которые остаются на Railway

| Маршрут | Причина |
|---------|---------|
| `POST /api/tts` | Google Cloud TTS API — ключ только на сервере |
| `POST /api/tts/hebrew-local` | Sidecar-процесс Hebrew TTS |
| `POST /api/translate-table` | Gemini API — ключ только на сервере |
| `POST /api/niqqud` | Gemini API |
| `POST /api/export-docx` | Node.js `docx` библиотека |
| `GET /api/audio/:key` | Стриминг MP3 с диска сервера (с Range) |
| `POST /api/save-audio` | Сохранение MP3 на сервере |
| `GET /api/client-config` | Конфигурация бэкендов |
| `GET /api/usage` | Счётчики Gemini/TTS квот |
| `GET /api/tts/key` | Статус ключа TTS |
| `POST /api/tts/key` | Загрузка ключа TTS |
| `DELETE /api/tts/key` | Удаление ключа |
| `GET /api/premium/status` | Статус premium |
| `POST /api/library/texts/:id/push/anki` | Anki sync протокол |
| `GET /api/anki/health` | Anki health |
| `GET /healthz` | Серверный health |

**Итого: ~16 маршрутов остаются на сервере.**

---

## Структура новых файлов

```
public/
  db/
    db-worker.js          ← Web Worker: wa-sqlite + все SQL-операции
    local-db.js           ← API shim: вызывает Worker через promisified postMessage
    migrations.js         ← Все 19 миграций в виде JS-массива строк
  index.html              ← Изменения: замена fetch() на localDB.*()
```

---

## Фазы реализации

---

### ФАЗА 0: Инфраструктура (неделя 1)

**Цель:** wa-sqlite работает в браузере, создаёт OPFS-файл, прогоняет миграции.

#### Шаг 0.1: Установка wa-sqlite

```bash
npm install wa-sqlite
```

wa-sqlite поставляется с предсобранными WASM-файлами. Нужно скопировать их в `public/`:

```bash
# Скопировать WASM-файлы в static assets
cp node_modules/wa-sqlite/dist/wa-sqlite-async.wasm public/db/
cp node_modules/wa-sqlite/dist/wa-sqlite-async.js   public/db/
```

**Файлы для создания:**

#### `public/db/migrations.js`

```js
// Все 19 миграций как массив SQL-строк.
// Порядок критичен. Каждый элемент выполняется в отдельной транзакции.
export const MIGRATIONS = [
  // 001_v3_bootstrap
  `CREATE TABLE IF NOT EXISTS v3_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    created_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO v3_bootstrap (id, created_at) VALUES (1, datetime('now'));`,

  // 002_v3_library
  `CREATE TABLE IF NOT EXISTS texts (
    id TEXT PRIMARY KEY,
    text_key TEXT NOT NULL,
    title TEXT NOT NULL,
    level TEXT,
    tags_json TEXT,
    source_text TEXT NOT NULL,
    source_meta_json TEXT,
    tts_profile_json TEXT,
    table_model_meta_json TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    pin_order INTEGER,
    source TEXT,
    topic TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_opened_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_texts_text_key ON texts(text_key);
  CREATE INDEX IF NOT EXISTS ix_texts_archived_opened ON texts(is_archived, last_opened_at);
  CREATE INDEX IF NOT EXISTS ix_texts_created_at ON texts(created_at);

  CREATE TABLE IF NOT EXISTS sentences (
    id TEXT PRIMARY KEY,
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    he_plain TEXT,
    he_niqqud TEXT,
    translit TEXT,
    translit_ru TEXT,
    ru TEXT,
    row_hash TEXT,
    meta_json TEXT,
    edit_meta_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(text_id, order_index)
  );
  CREATE INDEX IF NOT EXISTS ix_sentences_text_order ON sentences(text_id, order_index);`,

  // 003_v3_progress
  `CREATE TABLE IF NOT EXISTS text_progress (
    text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    last_row_idx INTEGER,
    last_step_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 004_v3_audio_assets
  `CREATE TABLE IF NOT EXISTS audio_assets (
    id TEXT PRIMARY KEY,
    asset_key TEXT NOT NULL UNIQUE,
    asset_type TEXT,
    relative_path TEXT,
    mime TEXT DEFAULT 'audio/mpeg',
    duration_ms INTEGER,
    size_bytes INTEGER,
    tts_profile_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sentence_audio (
    sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
    is_default INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sentence_id, audio_id)
  );
  CREATE TABLE IF NOT EXISTS text_audio (
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
    is_default INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (text_id, audio_id)
  );`,

  // 005-008: dashboard meta, tags, sentence notes
  `CREATE TABLE IF NOT EXISTS sentence_notes (
    id TEXT PRIMARY KEY,
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(text_id, sentence_id)
  );
  CREATE INDEX IF NOT EXISTS ix_sentence_notes_text_id ON sentence_notes(text_id);
  CREATE INDEX IF NOT EXISTS ix_sentence_notes_sentence_id ON sentence_notes(sentence_id);`,

  // 009: hebrew_norm (FTS helpers — в браузере FTS пока заглушка)
  `SELECT 1;`, // placeholder

  // 010-016: SRS tables
  `CREATE TABLE IF NOT EXISTS srs_card_templates (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT,
    card_kind TEXT,
    prompt_lang TEXT,
    answer_lang TEXT,
    front_schema_json TEXT,
    back_schema_json TEXT,
    answer_mode TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS srs_cards (
    id TEXT PRIMARY KEY,
    entity_type TEXT,
    entity_id TEXT,
    template_id TEXT REFERENCES srs_card_templates(id),
    source_sentence_id TEXT REFERENCES sentences(id) ON DELETE SET NULL,
    source_note_id TEXT,
    meta_json TEXT,
    state TEXT NOT NULL DEFAULT 'new',
    due_date TEXT,
    interval_days REAL NOT NULL DEFAULT 1,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    lapses INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_review_at TEXT,
    UNIQUE(entity_type, entity_id, template_id)
  );
  CREATE TABLE IF NOT EXISTS srs_review_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    interval_before REAL,
    interval_after REAL,
    ease_before REAL,
    ease_after REAL,
    review_time_ms INTEGER,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS srs_session_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    mode TEXT,
    source TEXT,
    queue_json TEXT,
    current_index INTEGER NOT NULL DEFAULT 0,
    cards_total INTEGER NOT NULL DEFAULT 0,
    cards_seen INTEGER NOT NULL DEFAULT 0,
    reviews_done INTEGER NOT NULL DEFAULT 0,
    stats_json TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS srs_card_exports (
    id TEXT PRIMARY KEY,
    export_hash TEXT,
    data_json TEXT
  );`,

  // 015: events layer
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT,
    entity_type TEXT,
    entity_id TEXT,
    session_id TEXT,
    text_id TEXT,
    sentence_id TEXT,
    note_id TEXT,
    card_id TEXT,
    source TEXT,
    payload_json TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS ix_events_type ON events(event_type);`,

  // 017-019: translation cache, overrides, history, edits
  `CREATE TABLE IF NOT EXISTS translation_doc_cache (
    id TEXT PRIMARY KEY,
    doc_key TEXT NOT NULL UNIQUE,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS translation_segment_cache (
    id TEXT PRIMARY KEY,
    segment_key TEXT NOT NULL UNIQUE,
    translation TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS history_events (
    id TEXT PRIMARY KEY,
    event_type TEXT,
    text_id TEXT REFERENCES texts(id) ON DELETE CASCADE,
    sentence_id TEXT REFERENCES sentences(id) ON DELETE CASCADE,
    asset_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recent_texts (
    text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    last_seen_at TEXT,
    seen_count INTEGER NOT NULL DEFAULT 0,
    last_sentence_id TEXT,
    last_asset_key TEXT
  );
  CREATE TABLE IF NOT EXISTS recent_rows (
    text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
    sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    last_seen_at TEXT,
    seen_count INTEGER NOT NULL DEFAULT 0,
    last_asset_key TEXT,
    PRIMARY KEY (text_id, sentence_id)
  );`,

  // schema_migrations tracker (для браузера)
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
];
```

#### `public/db/db-worker.js`

Web Worker — единственный обладатель OPFS-файла. Синхронный OPFS API (`AccessHandlePool`) доступен только в Dedicated Worker.

```js
// public/db/db-worker.js
// Запускается как Dedicated Web Worker.
// Владеет единственным соединением с OPFS SQLite.

import { default as SQLiteInit } from "./wa-sqlite-async.js";
import * as SQLite from "wa-sqlite";
import { OPFSCoopSyncVFS } from "wa-sqlite/src/OPFSCoopSyncVFS.js";
import { MIGRATIONS } from "./migrations.js";

let db = null;

async function initDB() {
  const sqlite3 = await SQLiteInit();
  const vfs = new OPFSCoopSyncVFS("app.db");
  await vfs.isReady;

  SQLite.vfs_register(sqlite3, vfs, true);
  db = await SQLite.open_v2(sqlite3, "app.db");

  // PRAGMA
  await exec("PRAGMA journal_mode=WAL;");
  await exec("PRAGMA foreign_keys=ON;");

  // Run migrations
  await runMigrations();
}

async function exec(sql) { /* ... */ }
async function query(sql, params) { /* ... */ }
async function run(sql, params) { /* ... */ }

async function runMigrations() {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = await query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedSet = new Set(applied.map(r => r.version));

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (appliedSet.has(version)) continue;
    await exec("BEGIN");
    try {
      await exec(MIGRATIONS[i]);
      await run("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
      await exec("COMMIT");
    } catch (e) {
      await exec("ROLLBACK");
      throw new Error(`Migration ${version} failed: ${e.message}`);
    }
  }
}

// Message handler — все операции через postMessage
self.onmessage = async ({ data }) => {
  const { id, type, sql, params } = data;
  try {
    if (type === "init") {
      await initDB();
      self.postMessage({ id, ok: true });
    } else if (type === "query") {
      const rows = await query(sql, params);
      self.postMessage({ id, ok: true, rows });
    } else if (type === "run") {
      const result = await run(sql, params);
      self.postMessage({ id, ok: true, result });
    } else if (type === "exec") {
      await exec(sql);
      self.postMessage({ id, ok: true });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
```

#### `public/db/local-db.js`

API-shim для использования в `index.html` вместо `fetch()`.

```js
// public/db/local-db.js
// API shim: интерфейс идентичен серверным endpoint'ам.
// Под капотом — postMessage к db-worker.js.

let _worker = null;
let _ready = false;
let _pendingCalls = new Map();
let _seq = 0;

function _call(type, sql, params) {
  return new Promise((resolve, reject) => {
    const id = ++_seq;
    _pendingCalls.set(id, { resolve, reject });
    _worker.postMessage({ id, type, sql, params });
  });
}

export async function initLocalDB() {
  _worker = new Worker("/db/db-worker.js", { type: "module" });
  _worker.onmessage = ({ data }) => {
    const handler = _pendingCalls.get(data.id);
    if (!handler) return;
    _pendingCalls.delete(data.id);
    if (data.ok) handler.resolve(data.rows ?? data.result ?? data);
    else handler.reject(new Error(data.error));
  };
  await _call("init");
  _ready = true;
}

function q(sql, params) { return _call("query", sql, params); }
function r(sql, params) { return _call("run", sql, params); }
function x(sql)         { return _call("exec", sql); }

// ── Library ──────────────────────────────────────────────

export async function listTexts({ q: query, limit = 500, archived = false } = {}) {
  // эквивалент GET /api/library/texts
  if (query) {
    const like = `%${query}%`;
    return q(
      `SELECT * FROM texts WHERE is_archived = ? AND (title LIKE ? OR source_text LIKE ?)
       ORDER BY last_opened_at DESC LIMIT ?`,
      [archived ? 1 : 0, like, like, limit]
    );
  }
  return q(
    `SELECT * FROM texts WHERE is_archived = ? ORDER BY last_opened_at DESC LIMIT ?`,
    [archived ? 1 : 0, limit]
  );
}

export async function getTextById(id) {
  const rows = await q("SELECT * FROM texts WHERE id = ?", [id]);
  return rows[0] || null;
}

export async function createText({ id, text_key, title, source_text, level, tags_json, source, topic, tts_profile_json }) {
  const now = new Date().toISOString();
  await r(
    `INSERT INTO texts (id, text_key, title, source_text, level, tags_json, source, topic, tts_profile_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, text_key, title, source_text, level ?? null, tags_json ?? null, source ?? null, topic ?? null, tts_profile_json ?? null, now, now]
  );
  return getTextById(id);
}

export async function updateText(id, fields) {
  const allowed = ["title", "level", "tags_json", "source", "topic", "tts_profile_json",
                   "is_archived", "is_pinned", "pin_order", "table_model_meta_json"];
  const sets = Object.entries(fields)
    .filter(([k]) => allowed.includes(k))
    .map(([k]) => `${k} = ?`);
  const vals = Object.entries(fields)
    .filter(([k]) => allowed.includes(k))
    .map(([, v]) => v);
  if (!sets.length) return;
  await r(
    `UPDATE texts SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    [...vals, id]
  );
}

export async function deleteText(id) {
  await r("DELETE FROM texts WHERE id = ?", [id]);
}

export async function archiveText(id) {
  await r("UPDATE texts SET is_archived = 1, updated_at = datetime('now') WHERE id = ?", [id]);
}

export async function touchOpened(id) {
  await r("UPDATE texts SET last_opened_at = datetime('now') WHERE id = ?", [id]);
}

// ── Sentences ────────────────────────────────────────────

export async function getSentencesByTextId(textId) {
  return q("SELECT * FROM sentences WHERE text_id = ? ORDER BY order_index", [textId]);
}

export async function addSentence(textId, { id, he_plain, he_niqqud, translit, translit_ru, ru, meta_json }) {
  const maxRow = await q("SELECT COALESCE(MAX(order_index), -1) as m FROM sentences WHERE text_id = ?", [textId]);
  const order = maxRow[0].m + 1;
  const now = new Date().toISOString();
  await r(
    `INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, translit_ru, ru, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, textId, order, he_plain ?? "", he_niqqud ?? "", translit ?? "", translit_ru ?? "", ru ?? "", meta_json ?? null, now]
  );
}

export async function updateSentence(textId, sentenceId, fields) {
  const allowed = ["he_plain", "he_niqqud", "translit", "translit_ru", "ru", "meta_json", "edit_meta_json"];
  const sets = Object.entries(fields).filter(([k]) => allowed.includes(k)).map(([k]) => `${k} = ?`);
  const vals = Object.entries(fields).filter(([k]) => allowed.includes(k)).map(([, v]) => v);
  if (!sets.length) return;
  await r(`UPDATE sentences SET ${sets.join(", ")} WHERE id = ? AND text_id = ?`, [...vals, sentenceId, textId]);
}

export async function deleteSentence(textId, sentenceId) {
  await r("DELETE FROM sentences WHERE id = ? AND text_id = ?", [sentenceId, textId]);
}

export async function reorderSentences(textId, orderedIds) {
  await x("BEGIN");
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await r("UPDATE sentences SET order_index = ? WHERE id = ? AND text_id = ?", [i, orderedIds[i], textId]);
    }
    await x("COMMIT");
  } catch (e) {
    await x("ROLLBACK");
    throw e;
  }
}

export async function searchSentences(queryStr, limit = 20) {
  const like = `%${queryStr}%`;
  return q(
    `SELECT s.*, t.title as text_title FROM sentences s
     JOIN texts t ON s.text_id = t.id
     WHERE s.he_plain LIKE ? OR s.ru LIKE ? OR s.translit LIKE ?
     ORDER BY t.last_opened_at DESC LIMIT ?`,
    [like, like, like, limit]
  );
}

// ── Notes ────────────────────────────────────────────────

export async function listNotesByTextId(textId) {
  return q("SELECT * FROM sentence_notes WHERE text_id = ? ORDER BY updated_at DESC", [textId]);
}

export async function upsertNote(textId, sentenceId, note) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await r(
    `INSERT INTO sentence_notes (id, text_id, sentence_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(text_id, sentence_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    [id, textId, sentenceId, note, now, now]
  );
}

export async function deleteNote(textId, sentenceId) {
  await r("DELETE FROM sentence_notes WHERE text_id = ? AND sentence_id = ?", [textId, sentenceId]);
}

export async function searchNotes(queryStr, limit = 20) {
  const like = `%${queryStr}%`;
  return q(
    `SELECT n.*, t.title as text_title FROM sentence_notes n
     JOIN texts t ON n.text_id = t.id
     WHERE n.note LIKE ? ORDER BY n.updated_at DESC LIMIT ?`,
    [like, limit]
  );
}

// ── Progress ─────────────────────────────────────────────

export async function getProgress(textId) {
  const rows = await q("SELECT * FROM text_progress WHERE text_id = ?", [textId]);
  return rows[0] || null;
}

export async function setProgress(textId, { last_row_idx, last_step_id }) {
  const now = new Date().toISOString();
  await r(
    `INSERT INTO text_progress (text_id, last_row_idx, last_step_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(text_id) DO UPDATE SET last_row_idx = excluded.last_row_idx,
       last_step_id = excluded.last_step_id, updated_at = excluded.updated_at`,
    [textId, last_row_idx ?? null, last_step_id ?? null, now]
  );
}

// ── Events / History ─────────────────────────────────────

export async function recordEvent(payload) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await r(
    `INSERT INTO events (id, ts, event_type, entity_type, entity_id, text_id, sentence_id, note_id, card_id, source, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, now, payload.event_type, payload.entity_type ?? null, payload.entity_id ?? null,
     payload.text_id ?? null, payload.sentence_id ?? null, payload.note_id ?? null,
     payload.card_id ?? null, payload.source ?? null, payload.payload_json ?? null]
  );
}

export async function recentActivity(limit = 30) {
  return q(
    `SELECT e.*, t.title FROM events e
     LEFT JOIN texts t ON e.text_id = t.id
     ORDER BY e.ts DESC LIMIT ?`,
    [limit]
  );
}

// ── Export / Import ──────────────────────────────────────
// Реализованы в Фазе 5 — см. план ниже.
```

#### Шаг 0.2: Тест инициализации (Node.js не нужен — OPFS браузерный)

Создать `public/db/db-init-test.html` — тестовая страница, которая открывается в браузере:

```html
<!DOCTYPE html><html><body>
<div id="log"></div>
<script type="module">
import { initLocalDB, createText, listTexts } from "/db/local-db.js";
const log = s => document.getElementById("log").innerHTML += `<p>${s}</p>`;
try {
  await initLocalDB();
  log("✅ OPFS SQLite инициализирован");
  await createText({ id: crypto.randomUUID(), text_key: "test1", title: "Test", source_text: "Hello" });
  const texts = await listTexts();
  log(`✅ Создан и прочитан 1 текст. Всего: ${texts.length}`);
  log("✅ Данные сохранены в OPFS на вашем устройстве");
} catch(e) {
  log("❌ Error: " + e.message);
}
</script></body></html>
```

**DoD Фазы 0:**
- [ ] `npm install wa-sqlite` прошёл без ошибок
- [ ] `public/db/db-worker.js` запускается в браузере
- [ ] `db-init-test.html` показывает ✅ для обоих шагов
- [ ] Chrome DevTools → Application → Storage → OPFS показывает `app.db`

---

### ФАЗА 1: Флаг локального режима + чтение библиотеки (неделя 2)

**Цель:** Список текстов загружается из OPFS (не из Railway). Feature flag `?localMode=1` включает новый путь без риска.

#### Шаг 1.1: Feature flag в index.html

В начало `<script>` в `index.html` добавить:

```js
// Feature flag: ?localMode=1 или localStorage.getItem("localMode")
const LOCAL_MODE = new URLSearchParams(location.search).has("localMode") ||
                   localStorage.getItem("localMode") === "1";

let localDB = null;
if (LOCAL_MODE) {
  const mod = await import("/db/local-db.js");
  await mod.initLocalDB();
  localDB = mod;
}
```

#### Шаг 1.2: Замена fetch() для чтения текстов

**Было** (line ~1200 в index.html):
```js
const res = await fetch("/api/library/texts?limit=500");
const { texts } = await res.json();
```

**Стало:**
```js
const texts = LOCAL_MODE
  ? await localDB.listTexts({ limit: 500 })
  : await fetch("/api/library/texts?limit=500").then(r => r.json()).then(d => d.texts);
```

**Было:**
```js
const res = await fetch(`/api/library/texts/${textId}`);
const text = await res.json();
```

**Стало:**
```js
const text = LOCAL_MODE
  ? await localDB.getTextById(textId)
  : await fetch(`/api/library/texts/${textId}`).then(r => r.json());
```

Аналогично для `/api/library/texts/:id/sentences` и `/api/library/texts/:id/notes`.

#### Шаг 1.3: Вспомогательная функция apiOrLocal

Чтобы не дублировать if/else 35 раз, добавить helper:

```js
// В index.html, перед основным кодом:
async function apiCall(path, options, localFn) {
  if (LOCAL_MODE && typeof localFn === "function") {
    return localFn();
  }
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}
```

**DoD Фазы 1:**
- [ ] Открыть `/?localMode=1` → таблица показывает тексты из OPFS (пустая при первом запуске)
- [ ] Открыть `/` → таблица показывает тексты из Railway (как было)
- [ ] Оба режима работают параллельно

---

### ФАЗА 2: Запись данных — создание, редактирование, удаление (недели 3–4)

**Цель:** Все мутации (POST, PUT, PATCH, DELETE) данных библиотеки идут в OPFS.

#### Шаг 2.1: Создание текста

**Было:**
```js
const res = await fetch("/api/library/texts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title, source_text, level, ... })
});
const { text } = await res.json();
```

**Стало:**
```js
const textId = crypto.randomUUID();
const textKey = computeTextKey(sourceText); // уже есть в коде

if (LOCAL_MODE) {
  await localDB.createText({ id: textId, text_key: textKey, title, source_text, level, ... });
  // создать предложения отдельно
  for (const s of sentences) {
    await localDB.addSentence(textId, { id: crypto.randomUUID(), ...s });
  }
} else {
  // старый путь
}
```

#### Шаг 2.2: Редактирование предложений

Затронутые fetch() (index.html):
```js
// PATCH sentence
fetch("/api/library/texts/" + tid + "/sentences/" + sid, { method: "PATCH", body: ... })
// → localDB.updateSentence(tid, sid, fields)

// DELETE sentence
fetch("/api/library/texts/" + tid + "/sentences/" + sid, { method: "DELETE" })
// → localDB.deleteSentence(tid, sid)

// POST reset sentence
fetch("/api/library/texts/" + tid + "/sentences/" + sid + "/reset", { method: "POST" })
// → localDB.resetSentence(tid, sid)  [читает source_text и перепарсит]

// PATCH reorder
fetch("/api/library/texts/" + tid + "/sentences/reorder", { method: "PATCH", body: ... })
// → localDB.reorderSentences(tid, orderedIds)
```

#### Шаг 2.3: Заметки

```js
// PUT note
fetch(`/api/library/texts/${textId}/notes/${sentenceId}`, { method: "PUT", body: JSON.stringify({ note }) })
// → localDB.upsertNote(textId, sentenceId, note)

// DELETE note
fetch(`/api/library/texts/${textId}/notes/${sentenceId}`, { method: "DELETE" })
// → localDB.deleteNote(textId, sentenceId)
```

#### Шаг 2.4: Архивирование и удаление текстов

```js
// Archive
fetch(`/api/library/texts/${id}/archive`, { method: "POST" })
// → localDB.archiveText(id)

// Delete
fetch(`/api/library/texts/${id}`, { method: "DELETE" })
// → localDB.deleteText(id)

// Touch opened
fetch(`/api/library/texts/${id}/opened`, { method: "POST" })
// → localDB.touchOpened(id)
```

#### Шаг 2.5: Прогресс чтения

```js
// GET progress
fetch(`/api/progress/${textId}`)
// → localDB.getProgress(textId)

// POST progress
fetch(`/api/progress/${textId}`, { method: "POST", body: JSON.stringify({ last_row_idx, last_step_id }) })
// → localDB.setProgress(textId, { last_row_idx, last_step_id })
```

**DoD Фазы 2:**
- [ ] Создание текста через UI → текст появляется в OPFS (верифицировать через DevTools OPFS viewer)
- [ ] Редактирование предложения → изменения сохраняются локально
- [ ] Удаление текста → удаляется из OPFS, не из Railway
- [ ] `localStorage.clear()` + перезагрузка → данные из OPFS живы

---

### ФАЗА 3: Поиск, навигация, аналитика (неделя 5)

#### Шаг 3.1: Полнотекстовый поиск

Серверный поиск использует `LIKE` (не FTS5). В браузере аналогично:

```js
// GET /api/library/texts?q=...
// → localDB.listTexts({ q: query })  — уже реализован выше

// GET /api/sentences/search?q=...
// → localDB.searchSentences(query)

// GET /api/notes/search?q=...
// → localDB.searchNotes(query)
```

#### Шаг 3.2: Навигация

```js
// GET /api/nav/resolve?type=sentence&id=...
// → localDB.resolveSentence(id)
export async function resolveSentence(id) {
  const rows = await q(
    "SELECT s.*, t.title FROM sentences s JOIN texts t ON s.text_id = t.id WHERE s.id = ?",
    [id]
  );
  return rows[0] || null;
}
```

#### Шаг 3.3: История активности

```js
// GET /api/history/recent-activity
// → localDB.recentActivity()

// POST /api/history/event
// → localDB.recordEvent(payload)
```

**DoD Фазы 3:**
- [ ] Поиск по библиотеке работает в localMode
- [ ] История активности отображается из OPFS

---

### ФАЗА 4: SRS (Spaced Repetition System) (недели 5–6)

SRS — самая сложная часть: карточки, сессии, алгоритм SM-2, Anki-экспорт.

#### Шаг 4.1: Перенести SRS-логику в local-db.js

Серверная SRS-логика находится в `db/srsRepo.js`, `db/srsSessionRepo.js`, `db/srsAttemptRepo.js`.
Их нужно портировать как чистые функции, работающие с OPFS SQLite.

Критические функции:
```js
// SM-2 алгоритм — pure JS, не зависит от Node.js:
export function computeNewInterval(card, rating) {
  // Anki SM-2 implementation — перенести из srsRepo.js as-is
}

// Создание карточек
export async function generateCardsForSentence(sentenceId, templates) { ... }

// Следующая карточка в сессии
export async function getSessionNext(sessionId) { ... }

// Оценка карточки
export async function reviewCard(cardId, rating) { ... }
```

#### Шаг 4.2: SRS API-маршруты → localDB

```js
// GET /api/srs/cards         → localDB.srs.listCards()
// POST /api/srs/cards        → localDB.srs.createCard()
// POST /api/srs/cards/generate → localDB.srs.generateCards()
// POST /api/srs/review       → localDB.srs.reviewCard()
// GET /api/srs/today         → localDB.srs.listTodayCards()
// GET /api/srs/today/summary → localDB.srs.todaySummary()
// POST /api/srs/sessions     → localDB.srs.createSession()
// GET /api/srs/sessions/:id/next → localDB.srs.getSessionNext()
// POST /api/srs/sessions/:id/review → localDB.srs.reviewSessionNext()
// POST /api/srs/sessions/:id/finish → localDB.srs.finishSession()
```

**DoD Фазы 4:**
- [ ] Создание SRS карточки из предложения → карточка в OPFS
- [ ] Сессия запускается, показывает карточки
- [ ] Оценка карточки обновляет `due_date` и `interval_days`

---

### ФАЗА 5: Аудио и экспорт/импорт (неделя 6)

#### Шаг 5.1: Аудио-метаданные в OPFS

MP3-файлы генерирует сервер через Google Cloud TTS. После генерации:
- Метаданные (`audio_assets`) записываются в OPFS
- Сами MP3 остаются на сервере (стриминг через `GET /api/audio/:key`)

```js
// После успешного POST /api/tts:
if (LOCAL_MODE && response.asset_key) {
  await localDB.upsertAudioAsset({
    id: crypto.randomUUID(),
    asset_key: response.asset_key,
    asset_type: "cloud",
    mime: "audio/mpeg",
    tts_profile_json: JSON.stringify(ttsProfile),
  });
  await localDB.linkSentenceAudio(sentenceId, assetId);
}
```

**Важно:** В Phase 5 MP3 файлы ещё хранятся на Railway. Для полной локализации аудио нужна Phase 6.

#### Шаг 5.2: Экспорт ZIP из OPFS

```js
// public/db/local-db.js — экспорт
export async function exportBundle({ includeArchived = false } = {}) {
  const texts = await listTexts({ archived: includeArchived, limit: 10000 });
  const result = [];

  for (const text of texts) {
    const sentences = await getSentencesByTextId(text.id);
    const notes = await listNotesByTextId(text.id);
    result.push({ ...text, sentences, notes });
  }

  const manifest = {
    schema_version: 2,
    exported_at: new Date().toISOString(),
    texts_count: result.length,
    note_count: result.reduce((s, t) => s + t.notes.length, 0),
    source: "local-opfs",
  };

  // Собрать ZIP через jszip (добавить в dependencies)
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("library/library.json", JSON.stringify(result, null, 2));

  return zip.generateAsync({ type: "blob" });
}
```

#### Шаг 5.3: Импорт ZIP в OPFS

```js
export async function importBundle(zipBlob, { mode = "skip" } = {}) {
  const zip = await JSZip.loadAsync(zipBlob);
  const libraryFile = zip.file("library/library.json");
  if (!libraryFile) throw new Error("Invalid bundle: missing library/library.json");

  const library = JSON.parse(await libraryFile.async("text"));
  const results = { imported: 0, skipped: 0, errors: [] };

  for (const textData of library) {
    try {
      const existing = await q("SELECT id FROM texts WHERE text_key = ?", [textData.text_key]);
      if (existing.length > 0 && mode === "skip") {
        results.skipped++;
        continue;
      }

      const newTextId = crypto.randomUUID();
      await createText({ ...textData, id: newTextId });

      for (const s of (textData.sentences || [])) {
        const newSentenceId = crypto.randomUUID();
        await addSentence(newTextId, { ...s, id: newSentenceId });

        if (s.note) {
          await upsertNote(newTextId, newSentenceId, s.note);
        }
      }
      results.imported++;
    } catch (e) {
      results.errors.push({ title: textData.title, error: e.message });
    }
  }

  return results;
}
```

**DoD Фазы 5:**
- [ ] Кнопка "Экспорт" → ZIP скачивается на устройство пользователя
- [ ] Кнопка "Импорт" → ZIP из OPFS загружается в OPFS
- [ ] ZIP, экспортированный из Railway-режима, импортируется в OPFS-режим
- [ ] ZIP, экспортированный из OPFS-режима, импортируется обратно

---

### ФАЗА 6: Полное аудио в браузере + очистка сервера (неделя 7)

#### Шаг 6.1: Кэш аудио в Cache API браузера

MP3-файлы можно кэшировать в браузере через Cache API или OPFS:

```js
// После получения MP3 от сервера — сохранить в браузерный кэш
async function cacheAudio(assetKey, mp3Blob) {
  const cache = await caches.open("tts-audio-v1");
  await cache.put(`/api/audio/${assetKey}`, new Response(mp3Blob, {
    headers: { "Content-Type": "audio/mpeg" }
  }));
}

// При воспроизведении — сначала проверить кэш
async function getAudioUrl(assetKey) {
  const cache = await caches.open("tts-audio-v1");
  const cached = await cache.match(`/api/audio/${assetKey}`);
  if (cached) return URL.createObjectURL(await cached.blob());
  return `/api/audio/${assetKey}`; // fallback на сервер
}
```

Аудио-кэш привязан к браузеру (origin). При очистке браузера — теряется. Для постоянного хранения аудио нужно OPFS + ручное управление (объём может быть большим — несколько ГБ).

#### Шаг 6.2: Включение локального режима по умолчанию

После успешного прохождения Фаз 1-5:

1. Убрать feature flag, сделать localMode дефолтным
2. Добавить UI-переключатель "Локальный режим / Облако"
3. Добавить миграцию: при первом запуске в localMode предложить импорт из Railway

#### Шаг 6.3: Очистка серверного кода

Удалить из `server.js` эндпоинты, перенесённые в браузер:
- ~35 маршрутов (см. таблицу выше)
- Зависимости: `libraryRepo`, `notesRepo`, `progressRepo`, `srsRepo`, `eventsRepo`
- Оставить: TTS, translation, DOCX, audio streaming, config

**DoD Фазы 6:**
- [ ] Открыть приложение без `?localMode=1` — работает локально
- [ ] MP3 воспроизводится из браузерного кэша (без сетевых запросов после первого раза)
- [ ] Страница офлайн → все данные доступны (кроме TTS-синтеза новых)
- [ ] Railway `/api/library/*` возвращает 404 (маршруты удалены)

---

## Тестирование

### Для каждой фазы: сравнительный тест

```js
// tests/opfs_parity_*.test.js
// Паттерн: выполнить операцию в обоих режимах, сравнить результат

test("createText: localMode matches server API contract", async () => {
  // Создать текст через localDB
  const id = crypto.randomUUID();
  await localDB.createText({ id, text_key: "test-key", title: "Test", source_text: "Hello" });

  const text = await localDB.getTextById(id);
  assert.equal(text.id, id);
  assert.equal(text.title, "Test");
  assert.ok(text.created_at);
});
```

### Браузерный тест (Playwright)

```js
// tests/opfs_e2e.spec.js — Playwright
test("library persists in OPFS after page reload", async ({ page }) => {
  await page.goto("http://localhost:3000/?localMode=1");
  // Создать текст
  await page.fill("[data-testid=text-input]", "שלום עולם");
  await page.click("[data-testid=save-btn]");
  // Перезагрузить страницу
  await page.reload();
  // Данные должны остаться
  await expect(page.locator("[data-testid=library-item]")).toContainText("שלום עולם");
});

test("localStorage.clear() does NOT lose library data in localMode", async ({ page, context }) => {
  await page.goto("http://localhost:3000/?localMode=1");
  await page.fill("[data-testid=text-input]", "test text");
  await page.click("[data-testid=save-btn]");

  // Очистить localStorage (как делал другой ИИ в тестировании)
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Текст должен остаться (живёт в OPFS, не localStorage)
  await expect(page.locator("[data-testid=library-item]")).toContainText("test text");
});
```

---

## Риски и митигации

| Риск | Вероятность | Серьёзность | Митигация |
|------|-------------|-------------|-----------|
| OPFS недоступен в Safari ≤ 15.1 | средняя | средняя | Fallback на `IDBBatchAtomicVFS` (IndexedDB backend для wa-sqlite) |
| WASM-файлы не загружаются через CDN без CORS | высокая | высокая | Хостить WASM в `public/db/`, задать `Cross-Origin-Opener-Policy: same-origin` |
| Потеря данных при смене браузера/устройства | высокая (по дизайну) | средняя | ZIP-экспорт + автосохранение напоминание; задокументировать |
| wa-sqlite не поддерживает FTS5 в OPFS-режиме | низкая | низкая | Использовать LIKE-поиск (уже так на сервере) |
| `AccessHandlePool` требует `SharedArrayBuffer` → COOP/COEP заголовки | высокая | высокая | Добавить в Railway: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` |
| Размер WASM-файла (~1.5 MB) замедляет первую загрузку | средняя | низкая | Кэшировать в Service Worker, показывать прогресс |
| Конкурентный доступ к OPFS из нескольких вкладок | низкая | высокая | `OPFSCoopSyncVFS` блокирует — открыть только в одной вкладке; добавить lock guard |
| Данные из Railway не переносятся автоматически | высокая | высокая | Фаза 5: предложить "Импорт из облака" при первом запуске в localMode |

### Критический риск: COOP/COEP заголовки

`AccessHandlePool` (синхронный OPFS) требует `SharedArrayBuffer`, который требует `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. Это нужно добавить в Railway до начала тестирования.

В `server.js` добавить middleware:
```js
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

**Альтернатива без COOP/COEP:** использовать `OPFSCoopSyncVFS` в асинхронном режиме через `postMessage` (чуть медленнее, но не требует `SharedArrayBuffer`).

---

## Зависимости для установки

```bash
npm install wa-sqlite     # SQLite WASM с OPFS поддержкой
npm install jszip         # ZIP в браузере (для export/import)
```

`jszip` нужен для браузерного ZIP-экспорта/импорта (серверный код использовал `archiver`/`adm-zip`).

Разместить в `public/`:
```
public/db/
  wa-sqlite-async.js     (из node_modules/wa-sqlite/dist/)
  wa-sqlite-async.wasm   (из node_modules/wa-sqlite/dist/)
  OPFSCoopSyncVFS.js     (из node_modules/wa-sqlite/src/)
  db-worker.js           (новый)
  local-db.js            (новый)
  migrations.js          (новый)
public/lib/
  jszip.min.js           (из node_modules/jszip/dist/)
```

---

## Таймлайн (7 недель)

| Неделя | Фаза | Результат |
|--------|------|-----------|
| 1 | Фаза 0: Инфраструктура | wa-sqlite работает в браузере, миграции прошли |
| 2 | Фаза 1: Флаг + чтение | `?localMode=1` читает библиотеку из OPFS |
| 3-4 | Фаза 2: Запись данных | Создание/редактирование/удаление работает локально |
| 5 | Фаза 3: Поиск и аналитика | Поиск и история из OPFS |
| 5-6 | Фаза 4: SRS | Карточки и сессии в OPFS |
| 6 | Фаза 5: Export/Import | ZIP туда и обратно |
| 7 | Фаза 6: Включение по умолчанию + очистка | Финальный switchover |

---

## Definition of Done (весь проект)

- [ ] Пользователь открывает URL, работает с библиотекой — данные живут в OPFS его браузера
- [ ] `localStorage.clear()` + перезагрузка страницы → данные библиотеки живы (подтверждено тестом)
- [ ] Данные НЕ отправляются на Railway сервер (проверено DevTools → Network → нет POST/PUT/DELETE к `/api/library/*`)
- [ ] TTS-синтез продолжает работать (запрос к Railway только для генерации MP3)
- [ ] ZIP-экспорт скачивается на устройство пользователя
- [ ] ZIP-импорт загружает данные в OPFS
- [ ] Тест `tests/storage_location_audit.test.js` обновлён: ARTIFACT-1 "Railway тексты" → 0 (пустая база)
- [ ] Playwright e2e тест проходит: данные выживают перезагрузку и `localStorage.clear()`
- [ ] Задокументировано: данные живут в конкретном браузере, для переноса на другое устройство — ZIP-экспорт

---

## Связанные документы

- `docs/STORAGE_CONTRACT.md` — обновить: "LOCAL Workspace" теперь означает OPFS в браузере
- `docs/LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.md` — предшественник этого плана
- `tests/storage_location_audit.test.js` — артефакты, доказывающие исходную проблему
