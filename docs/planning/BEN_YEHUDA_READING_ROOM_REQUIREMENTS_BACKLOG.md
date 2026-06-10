# Бэклог требований: Читальный зал на корпусе Бен-Йехуда

> **Дата:** 2026-06-08 · ID `BRR-*` совпадают с `docs/research/BEN_YEHUDA_READING_ROOM_GAP_MATRIX.md`.
> Стратегия: `docs/strategy/BEN_YEHUDA_LIBRARY_READING_ROOM_STRATEGY.md`. Аудит конкурентов:
> `docs/research/COMPETITOR_READING_PRODUCTS_AUDIT.md`.
>
> **Surface:** Room (видно ученику в Зале) · Room? (опционально) · Studio · Backend · Admin/curator · Do-not-implement.
> **Это бэклог требований, НЕ план реализации кода.** Каждое требование исполнимо отдельным тикетом.

---

## P0 — блокеры публичной беты

### BRR-P0-001 — Модель метаданных корпуса ✅ DONE 2026-06-08
- **Status:** ✅ Реализовано (код) 2026-06-08. **Архит-находка:** live store = клиентский OPFS (`public/db/local-db.js`); серверные `texts` — `gone410`, `migrations/` легаси → **серверной миграции нет.** Owner выбрал **Option A**: versioned объект `corpus` внутри `source_meta_json` (0 миграций, lossless round-trip). Контракт `db/premium/corpusMeta.js` (buildCorpus/validateCorpus R1-гейт/computeContentHash/фасеты/дедуп) · bundle **v2.1** = аддитивный `corpus_meta_version` (`schema_version` остаётся 1) · продюсер `build-notes-from-bundle.js` валидирует+штампует+rewrite library.json · гейт `npm run smoke:corpus` **54/54** · mapping `docs/planning/BEN_YEHUDA_PSEUDOCATALOGUE_MAPPING.md`. Адверс-ревью (3 линзы) → 7 находок исправлены. SW `v3.10.6-corpus-meta`.
- **Source:** Sefaria (структурированные метаданные/провенанс) · R6
- **Observed:** Sefaria строит discovery на богатых per-work метаданных + источнике.
- **Current:** `texts.source/topic` — свободные строки; нет сущностей автор/переводчик/эпоха/жанр; нет content-hash текста; bundle v2 имеет content_hash только для аудио.
- **Gap:** нет структурной модели для фасетной навигации и дедупликации канона.
- **User story:** *Как читатель, я хочу находить тексты по автору/эпохе/жанру, чтобы ориентироваться в каноне; как куратор — чтобы импорт не дублировал произведения.*
- **Surface:** Backend · **Role:** R6, R3 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** med · **Moat value:** high
- **Impl:** partial reuse (расширить `source_meta_json` + поля/таблицы + bundle v2.1) · **Cx:** M
- **Dependencies:** — (пред-зависимость для 003/004/005/013/015) · **Risks:** low (аддитивная схема), content (маппинг `pseudocatalogue.csv`)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** поля author/era/genre/translator/orig_language/byehuda_id/content_hash сохраняются; import↔export round-trip без потерь; фасеты фильтруют; дедуп по content_hash.
- **DoD:** smoke round-trip; маппинг-таблица csv→schema; миграция аддитивна (обратная совместимость v2).
- **Notes:** schema-first — делать ПЕРВЫМ, иначе болезненная миграция (R6 red flag).

### BRR-P0-002 — Чистая страница Читального зала (`library.html`) ✅ SHIPPED 2026-06-08
- **Status:** ✅ Реализовано + закоммичено 2026-06-08 (SW `v3.10.8-room`). Макет **Variant A** (табы трека → стопка полок → карусели карточек). НОВЫЕ `public/library.html` + `public/js/library-ui.js` (Layout A, honest empty-states, dangling=disabled, карточка=семантич. `<a href>`) + namespace `room.*` (ru/en/he, HE черновик). Reader = **deep-link на index.html** (`?room=1#/t/<base64>`, кодировка проверена vs `v3DeeplinkBase64urlEncode`), НЕ embedded. Гейт `smoke:room` **14/14**; @380px RTL+LTR проверено. **Отклонения** (`IMPLEMENTATION_STATUS.md` §5): SW переиспользуется (отдельный sw-room.js → **P0-002b** defer); тема не синхронизирована с index.html (follow-up).

#### BRR-P0-002a — Room-mode (чистое чтение из Зала) ✅ SHIPPED 2026-06-08
- **Status:** ✅ Путь A. `?room=1` → `body.room-mode` (pre-paint, без FOUC, без sessionStorage — контра-кейс без утечки). Презентационный CSS-слой прячет весь персистентный Studio-хром (.classic-shell-head/.classic-workflow-column/#classicStatusStrip/#classicResultPanel/export/edit/.row-note-btn/IDE), оставляет таблицу+▶аудио+тоггл-колонки+on-tap+back-bar «← В библиотеку». **First-run-цепочка подавлена в room-mode (решение-а):** Phase-6/онбординг(×2, key onboardingSeen_v1)/BYOK-hint/BYOK-онбординг — ранний return при room-mode, **флаги НЕ взводятся** (полное приложение позже всё ещё промптит → нет потери данных). Гейт `smoke:room-mode` **23/23** (Studio скрыт · чтение+аудио+aids видимы · back-link · first-run НЕ виден (getClientRects fixed-aware) + seen-флаги unset · контра без утечки).
- **Follow-ups:** **P1-006** перенести `#translitProfileSelect` из `#classicTranslationCard` в ридинг-аиды (#tableSettings) → переключатель схемы в Зале чисто. **P1-009** заменить скрытую 📝 лёгким one-tap-захватом. **P0-002b** (DEFER/P2): embedded-reader в library.html + отдельный лёгкий `sw-room.js` (сейчас deep-link-reuse → ридер тянет тяжёлый index.html-shell — осознанный v1-trade-off). Мелочь: скрыть ✎-иконку в шапке таблицы.
- **Source:** LingQ / Beelinguapp / StoryHebrew (отдельная чистая читалка = продукт)
- **Observed:** конкуренты дают сфокусированную читалку без «нагромождённого интерфейса».
- **Current:** `public/library.html` не существует; всё в `index.html` (40K строк).
- **Gap:** нет чистой поверхности Зала; нельзя «попасть просто в библиотеку».
- **User story:** *Как ученик, я хочу открыть чистую двуязычную аудио-библиотеку без технического интерфейса, чтобы просто читать и слушать.*
- **Surface:** Room · **Role:** R4, R5 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** new (page+`library-ui.js`), reuse `renderTable`/`v3LibraryOpenText`/тема/OPFS/i18n · **Cx:** L
- **Dependencies:** BRR-P0-003 · **Risks:** UX (дисциплина «не тянуть Студию»), tech (SW precache раздувание)
- **Offline:** yes · **BYOK:** n/a (контент pre-baked)
- **Acceptance:** `/library` грузится офлайн; полка→текст→чтение+аудио; @380px RTL без overflow; **скрыты** морфо-редактор/квизы/граф/Anki/SRS/bulk-import; bundle Зала не содержит морфо/граф/квиз-чанков.
- **DoD:** screenshot @380px RTL (полка + читалка); asset-аудит precache; keyboard-path полка→текст→play.
- **Notes:** отдельный лёгкий SW-precache; **не бампать** основной `CACHE_VERSION` без нужды; i18n namespace `room.*`.

### BRR-P0-003 — Полки/коллекции + два трека ✅ DONE (модель) 2026-06-08
- **Status:** ✅ Модель реализована (код) 2026-06-08. Storage **Option A** (owner): OPFS-таблица `shelves` (миграция 054) + round-trip через bundle (`library.json.shelves[]`, аддитивный сиблинг). Контракт `db/premium/shelfMeta.js` (buildShelf/validateShelf/validateMembership; член по `text_key`; `TRACK` reuse из corpusMeta; slug = портируемый id, без фабрикации из не-latin). `local-db.js`: getShelves/getShelfBySlug/createShelf + import-upsert (валидация track-enum+slug+title на браузерном пути, honest `{stage,error}`, dup-slug/dangling-member warns) + export. Гейты: `smoke:shelves` 30/30 (Node-контракт), `smoke:shelves-roundtrip` **17/17** (real-OPFS: items_json-целостность/skip-vs-overwrite/UNIQUE-slug/ordering/invalid-reject/dangling-tolerate), notes-roundtrip 25/25. Адверс-ревью (3 линзы × verify) → 12 находок исправлены. SW `v3.10.7-shelves`. **Рендер полок (поверхность) = BRR-P0-002.**
- **Source:** Sefaria (Collections, редакторский голос) · Beelinguapp (жанр/уровень-полки)
- **Observed:** кураторские коллекции с интро + полки по жанру/уровню.
- **Current:** нет модели полок; только tags/level → плоский список.
- **Gap:** discovery как «свалка»; нет on-ramp/литературного разделения.
- **User story:** *Как новичок, я хочу «Доступную» полку с лёгкими текстами; как продвинутый — «Литературную» полку канона, чтобы начать с подходящего уровня.*
- **Surface:** Room (курация — Studio/Admin) · **Role:** R6, R8 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** new (модель shelf/collection: id/title/track/order/items/editorial_intro) · **Cx:** M
- **Dependencies:** BRR-P0-001 · **Risks:** low; content (нужна курация R7)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** ≥2 трека (Доступная/Литературная), каждый ≥1 полка с упорядоченными произведениями + интро; навигация полка↔текст↔назад сохраняет позицию.
- **DoD:** screenshot обоих треков @380px RTL; smoke навигации; empty-state полки честный.
- **Notes:** полка = педагогический маршрут, не просто список (R8).

### BRR-P0-004 — Конвейер курации/ингестии Бен-Йехуда
- **Status:** ✅ **ОТГРУЖЕНО + ЗАДЕПЛОЕНО НА ПРОД 2026-06-08** (SW v3.10.12-canon-v2-chapters). Producer (Gemini-2.5-flash + Dicta-cloud-никуд) + manifest-курация + **A-главы** (длинные → полки-оглавления) + батчинг импорта (~101с→~4с) + ship-as-asset (авто-публикация при 1-м заходе). Канон **`canon-v2.zip`: 79 текстов / 7 полок / R1 79 PASS**. Bulk-решения владельца ЗАФИКСИРОВАНЫ (Gemini / machine / canon-manifest ~55 / auto). **Полная картина: IMPLEMENTATION_STATUS §10.** Next=P0-002b; C на потом.
- **Source:** LingQ (import) · Sefaria (структурный ingest)
- **Observed:** масштабный, но структурированный ingest подлинного контента.
- **Current:** `build-notes-from-bundle.js` (морфо-enrich) есть; нет парсера Бен-Йехуда (`pseudocatalogue.csv`+`txt/`)→сегментация→перевод+никуд+транслит+TTS→bundle.
- **Gap:** нет пути из сырого корпуса в shipped-бандлы.
- **User story:** *Как куратор, я хочу из файлов Бен-Йехуда собрать вычитанные двуязычные+аудио бандлы, чтобы наполнить полки.*
- **Surface:** Studio · **Role:** R6, R1, R7 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high (опосредованно) · **Moat value:** high
- **Impl:** partial reuse (`pipeline.translateTable` + `ensureAudioAsset` + `createTextWithSentences` + `build-notes`) · **Cx:** L
- **Dependencies:** BRR-P0-001 · **Risks:** content (MT/TTS на архаике), cost (BYOK/precompute граница)
- **Offline:** yes (выход — офлайн-бандлы) · **BYOK:** yes (генерация на ключах владельца/куратора)
- **Acceptance:** стартовые ~50–150 произведений (2 трека) импортируются; 0 R1-нарушений (`audit:note-fields`); каждое имеет провенанс+метки+уровень.
- **DoD:** QA-отчёт по классам (PASS/SUSPECT/FAIL); пилот 10–20 → import → render офлайн @380px.
- **Notes:** вычитка R7/R1 для curated-полок; deep-stacks (P2-015) — позже, on-open.

### BRR-P0-005 — Провенанс + атрибуция + метки честности
- **Status:** ✅ **ОТГРУЖЕНО + ЗАДЕПЛОЕНО 2026-06-08** (карточки Зала: автор + бейджи review/audio; ридер room-mode: бейджи + ссылка-источник `benyehuda.org/read/<ID>` + attribution+издание; провенанс-url scheme-allowlisted; i18n `room.prov.*` ru/en/he [HE черновик→native-review]; визуально @380px RTL). См. IMPLEMENTATION_STATUS §10.
- **Source:** Sefaria (источник/издание/дата) · R1-инвариант
- **Observed:** видимый источник/провенанс перевода.
- **Current:** провенанс в данных (`_sources`, provider), но не выведен в Зале; нет per-work атрибуции Бен-Йехуда; нет меток «вычитано/машинно/TTS».
- **Gap:** нет видимого доверия; риск выдать MT за вычитанный, TTS за native.
- **User story:** *Как ученик, я хочу видеть источник текста и честный статус перевода/аудио, чтобы доверять материалу.*
- **Surface:** Room · **Role:** R1, R5, R7 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** med · **Moat value:** high
- **Impl:** partial reuse (данные есть; нужен UI-слой) · **Cx:** S
- **Dependencies:** BRR-P0-001 · **Risks:** low (но критично для честности)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** каждое произведение показывает автор/источник/public-domain + бейджи «✅ вычитано»/«⚙ машинно-ассистировано»/«🔊 TTS»/«эпоха·регистр»; **ни один MT-перевод не помечен «вычитано» без вычитки; TTS не зовётся «native».**
- **DoD:** screenshot карточки+читалки с метками; чек-лист «метка ↔ реальные данные».
- **Notes:** прямой R1/R5 invariant; см. REJ-03.

### BRR-P0-002b — Лёгкий ридер-шелл (embedded reader + `sw-room.js`) 🔜 NEXT (утверждён)
- **Status:** 🔜 NEXT (утверждён владельцем). Реализуется первым в продолжении.
- **Source:** производный (наш v1 trade-off; аудит 2026-06-08).
- **Observed:** конкуренты дают сфокусированную лёгкую читалку.
- **Current:** ридер = deep-link `/index.html?room=1#/t/<b64>` (room-mode прячет хром, НО грузит весь 39K Studio-шелл + heavy `sw.js`); открытие ~1.3с (замер `measure-reader-render.js`: 486 строк = 74мс → рычаг = вес шелла, не строки; B-виртуализация ЗАКРЫТА).
- **Gap:** медленное открытие; отложенный lightweight-SW инвариант стратегии не выполнен.
- **User story:** *Как ученик, хочу открывать текст быстро в чистой лёгкой читалке.*
- **Surface:** Room · **Role:** R4, R5, R6 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high · **Moat value:** med
- **Impl:** new (встроить `renderTable`+аудио+тогглы колонок+on-tap в `library.html` ИЛИ slim room-shell) + `sw-room.js` · **Cx:** L
- **Dependencies:** BRR-P0-002 · **Risks:** tech (извлечение `renderTable` из 50+ глобалов `index.html` — главный риск), UX
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** открытие текста <~300мс (vs ~1.3с); ПАРИТЕТ с deep-link (двуязычная таблица + ▶аудио + тогглы niqqud/translit/ru + on-tap морфология + честные empty/error/loading); @380px RTL; отдельный `sw-room.js` precache БЕЗ морфо/граф/квиз-чанков; deep-link fallback держать до паритета.
- **DoD:** замер открытия до/после (`measure-reader-render.js`); screenshot @380px RTL; `smoke:room` расширить на embedded-ридер; 0 регрессий.
- **Notes:** recon-first дизайн на утверждение. Закрывает отложенный «отдельный лёгкий SW» инвариант.

### BRR-P0-008 — Версионный update/dedup shipped-контента ✅ DONE 2026-06-08
- **Status:** ✅ SHIPPED + PROD-LIVE 2026-06-08 (`0ac17bb`, SW v3.10.14-canon-versioned-dedup). Пререквизит пред-прогона ВЫПОЛНЕН.
- **Реализовано:** `library-ui.js` — ключ `benyehuda_canon_version`; при бампе `library.canon_version` import-side reconcile дропает canon-origin orphans прошлой edition; **user-контент не трогается**. Gate `smoke:canon-version` 18/18. (Ниже — описание исходного бага, который это закрывает.)
- **Source:** аудит 2026-06-08 (R1/R6).
- **Observed:** shipped-канон версионируется (`canon-vN.zip`), авто-импорт при 1-м заходе.
- **Current:** `autoImportCanon` (`mode:'skip'` + sentinel) ДОБАВЛЯЕТ новое поверх старого: vN→vN+1 у апгрейдящегося юзера оставляет superseded-тексты (монолитный #413 v1 дублит главы v2), старые полки по slug не обновляются. Fresh-install — чисто.
- **Gap:** дубли у апгрейдящихся; рекуррентно на КАЖДОМ бампе; БЛОКИРУЕТ масштабную доставку пред-прогона.
- **User story:** *Как пользователь, при обновлении канона хочу актуальный набор без дублей; мои созданные тексты не трогаются.*
- **Surface:** Backend (`library-ui.js`/`local-db.js`) · **Role:** R6, R1 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** med · **Moat value:** med
- **Impl:** partial reuse · **Cx:** M
- **Dependencies:** BRR-P0-003, BRR-P0-004 · **Risks:** НЕ удалить user-контент (только canon-origin)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** при бампе `canon_version` удаляются canon-origin тексты/полки, отсутствующие в новом манифесте (метка `origin:'benyehuda-ingest'` + `canon_version`), затем импорт; **user-созданный контент НЕ затрагивается**; апгрейд v1→v2 даёт 0 дублей (#413); fresh == upgraded.
- **DoD:** smoke: v1→v2 апгрейд → 0 дублей + user-контент цел; replace идемпотентен.
- **Notes:** caveat зафиксирован в IMPLEMENTATION_STATUS §10.

### BRR-P0-009 — Локальный никуд-sidecar `/nakdan` (foreign-responder guard + порт) ✅ DONE 2026-06-08
- **Status:** ✅ SHIPPED + PROD-LIVE 2026-06-08 (`c917bcd`, в составе SW v3.10.14). Пререквизит пред-прогона ВЫПОЛНЕН.
- **Source:** аудит 2026-06-08 (R1/R5).
- **Observed:** никуд = Dicta CLOUD (точный, с backoff).
- **⚠ ИСПРАВЛЕНА ДИАГНОСТИКА (не переоткрывать по-старому):** прежний диагноз «`pythonClient` шлёт `{texts}`, sidecar ждёт `{action}`-конверт» — **МИСДИАГНОЗ**. Реальная причина: дефолт-порт sidecar (8765) совпал с **AnkiConnect**, его HTTP-200 принимался за ответ никуда → локальный путь молча работал неверно.
- **Что сделано:** (1) `niqqudGateway.js` foreign-responder guard (HTTP-ok-но-нет-`results[]` ⇒ честный fallback на cloud, не порча); (2) дефолт-порт sidecar **8765→8799** (`pythonClient.js:12`, override `AI_LOCAL_PORT`). Gate `niqqudGateway.test` 10/10.
- **Gap:** 26K-прогон через Dicta-cloud = rate-limit/стоимость/доступность + внешняя зависимость для «безключевой» библиотеки.
- **User story:** *Как владелец, хочу прогнать никуд по всему корпусу локально, без облачного throttle/стоимости.*
- **Surface:** Backend (`niqqudGateway`/`pythonClient` + `ai-local` sidecar) · **Role:** R1, R5 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** low (опосредованно) · **Moat value:** med
- **Impl:** partial reuse (foreign-responder guard + дефолт-порт 8765→8799; конверт НЕ менялся — `{action}` был мисдиагнозом) · **Cx:** S–M
- **Dependencies:** — · **Risks:** точность локального vs cloud (сверить на выборке)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** локальный `/nakdan` отдаёт корректный никуд (паритет с cloud на выборке); продюсер по умолчанию использует локальный путь; cloud = fallback.
- **DoD:** смоук-сверка локальный vs cloud; пред-прогон не зависит от Dicta-cloud.
- **Notes:** caveat §10.

### BRR-P0-006 — Раннер полного пред-прогона корпуса (keyless) 🟢 IN PROGRESS — ГЛАВНОЕ направление
- **Status:** 🟢 IN PROGRESS (выбрано главным направлением 2026-06-09 после отгрузки P0-010; пререквизиты P0-008/009 ✅). **Планирование ПЕРВЫМ:** no-code отчёт замера (объём×цена×время) + дизайн раннера (work-ledger / daily-quota stop / 429-detect / per-work chunking / резюмируемость) + R7 QA-сэмплинг по эпохам → утверждение владельцем ДО длинного прогона. Аудио-доставка 26K = computed asset-key (BRR-P0-011 фикс B), встроена в дизайн доставки. Owner-priority (2026-06-08). **Замер ✅ (sample 800): 24 641 originals + 1814 переводов; ~141K Gemini-reqs ≈ ~95 дней free-tier $0; аудио full pre-bake НЕВОЗМОЖЕН ≈288 ГБ → on-demand. Решения A–D зафиксированы; key-safety проверена. План + замер: `docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md`.** **Реализовано:** `lib/corpusLedger.js`+test 6/6, `--plan` (тиринг known-era-first+ETA), `measure-corpus-prerun.js`, **bake-loop** (`lib/ingestCore.js` zero-drift + `--bake` quota-stop/429-detect/per-shard/giant-defer) — закоммичено `6da7db7`/`00c8037`. **2026-06-10 (см. RUNNER_PLAN §4b):** Gemini PILOT выполнен (ledger done 100 / 0 fail / 7 шардов, $0); раннер ЗАХАРДЕН (watchdog/durable-flush/seq-shards — uncommitted); верификатор `verify-bake-shards.js` (ru 100%/niqqud 98.6%/R1-чисто); QA-жюри 35-выборка → 7 confirmed (coverage≠correctness, MAJOR ~8.6%); full-79 jury-аудит ОТМЕНЁН (нет доверенного confirmed[]); авария-выключение — reconcile, потерь нет. **2026-06-10 (продолжение):** hardening + верификатор + recovery-доки ЗАКОММИЧЕНЫ (`c627589`); **GIANT-PASS (Проход-2) SHIPPED** — `--giant-pass` + `chapterizeGiant` (cap-инвариант: каждая часть ≤ `--giant-segments`; канон-контракт series/`by-<id>-c<N>`/TOC-полка `by-work-<id>`; атомарная эмиссия, незавершённый гигант остаётся deferred); гейты `smoke:giant-pass` 30/30 офлайн · 39/39 `--real` (реальные романы 413/49/95 → 5/3/17 глав как в каноне) · ledger-tests 8/8. **Next = resume bake work 101+ (`--bake --limit 250/500`) → niqqud-probe 20–50 rest works перед rest-tier.**
- **Source:** решение владельца — «испечь всё» = универсальная keyless-библиотека.
- **Observed:** продюсер кэширует+резюмирует на диск (`.tmp/benyehuda/`).
- **Current:** курируется ~55 работ (`benyehuda-canon-manifest.json`); полный корпус (~26 455) не прогнан.
- **Gap:** хвост корпуса недоступен без BYOK.
- **User story:** *Как любой пользователь без ключей, хочу читать любой текст канона (перевод+никуд готовы заранее).*
- **Surface:** Studio/Backend (раннер) · **Role:** R6, R1, R5 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (`ingest-benyehuda.js` + резюм-кэш) · **Cx:** L
- **Dependencies:** BRR-P0-008, BRR-P0-009 · **Risks:** cost/quota (Gemini free ~1500/день ≈ месяц), время, качество на масштабе
- **Offline:** yes (выход) · **BYOK:** yes (генерация на ключе владельца)
- **Acceptance:** инкрементальный резюмируемый обход всего `pseudocatalogue.csv`, режим «N работ/день, продолжай завтра», провайдер gemini, никуд локальный (P0-009); ДО старта — фактический замер объёма×цены×времени (отчёт владельцу); R7 QA-сэмплинг по эпохам; всё `review_status=machine`.
- **DoD:** отчёт замера до старта; резюм-прогон переживает рестарт; QA-сэмпл по эпохам зелёный.
- **Notes:** длительный ленивый прогон; параллелен P0-002b.

### BRR-P0-007 — Аудио-предбейк канона + доставка keyless 🟡 ЧАСТИЧНО SHIPPED 2026-06-09
- **Status:** 🟡 PARTIAL. **Аудио-предбейк курируемого канона = SHIPPED + PROD** (`a9659c7`+`a038862`, SW `v3.10.18-canon-audio-fastlink`). Доставка для ПОЛНОГО 26K (per-work served + OPFS-паки) — ещё PLANNED (с BRR-P0-006).
- **As-built (audio-prebake, D1 server-cache streaming):** GCP WaveNet `he-IL-Wavenet-A` для всех 79 текстов (6 446 клипов / 617 921 знак / **$0** free-tier / 0 сбоев). `db/premium/ttsAssetKey.js` (извлечён из server.js = единый источник ключа) + `scripts/premium/{bake-voice-sample,bake-canon-audio,build-canon-v3,push-canon-audio,audio-prebake-smoke}.js` + `lib/{ttsBake,stampCanon}.js`. `canon-v3.zip` штампует `audio_asset_key` на строку + `audio_assets[]` (метаданные, без MP3-байт) + `audio_status:'tts'` (R1, никогда `human`) + P0-008 shelf `origin`/`canon_version:3`. MP3 запушены в prod-кэш `/app/data/audio` (через `/api/audio/cache/upload` + `X-Local-Mode`). reader-core tier-1 (`HEAD`→`GET 206`) стримит keyless — прод-верифицировано @380px. Гейт `smoke:audio-prebake` 26/26; ротация ключа после прогона; idempotent re-bake (content-addressed).
- **⚠ Mobile caveat (открыто → BRR-P0-011):** первый импорт canon-v3 (6 646 строк + 6 446 аудио-линков) ~17-21с на desktop-OPFS; на не-OPFS/медленном Safari (старый iOS) импорт зависает → "Не удалось загрузить библиотеку". Фикс v3.10.18 убрал избыточный reconcile (85с→17с fresh / 74с→4с upgrade), но импорт всё ещё тяжёл для mobile → нужен lighten-first-load (BRR-P0-011).
- **Open (full-corpus delivery):** **Дизайн закрыт (D1–D5, 2026-06-10).** **Проход-3 Срезы 1+2 SHIPPED+PROD 2026-06-10:** Срез 1 (`9ccf6b1`) producer `build-corpus-catalog.js` → `corpus-catalog-v1.json` (38КБ) + `works/<id>.json` (100, Shape A); Срез 2 (`67443ad`, SW v3.10.19) library.html вкладка «Корпус» + served-on-open (тап → fetch work → importBundle → тёплый ридер; re-open из OPFS). 100 работ haskalah+tehiya на проде, ОТДЕЛЬНО от канона (R8). Гейты `smoke:corpus-catalog` 27/27 + `smoke:corpus-room` 16/16; прод-верифицировано @380px. **Решения владельца 2026-06-10 (Путь А APPROVED):** (а) OPFS LRU отложен (нет нагрузки); (б) owner-key аудио НЕ предбейкаем — BYOK/браузер сейчас, выборочная публикация клипов позже; (в) Gemini-MT принят как стандарт, R7-сэмплинг НЕ делаем. **Дальше = coverage-aware полный каталог** → `BRR-P1-007/014/015` + `DELIVERY_26K_PLAN` «Coverage-модель».
- **Source:** решение владельца 2026-06-08.
- **Observed:** канон сейчас = один shipped-бандл (canon-v3 ~2.8МБ) авто-импортом.
- **Current:** один бандл/precache не масштабируется на ~26K × ~27КБ ≈ сотни МБ.
- **Gap:** нет масштабируемой доставки пред-прогона.
- **User story:** *Как пользователь без ключей, открываю любую работу — её ассеты подгружаются и кэшируются офлайн.*
- **Surface:** Room? + Backend · **Role:** R5, R6, R4 · **Priority:** P0
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** new · **Cx:** L
- **Dependencies:** BRR-P0-006, BRR-P0-008 · **Risks:** OPFS-лимиты устройства/эвикция, доставка/CDN
- **Offline:** partial (после открытия/пака) · **BYOK:** n/a (keyless)
- **Acceptance:** РЕШЕНИЕ владельца по архитектуре (рекоменд.: per-work served-on-open без ключа + OPFS-кэш с LRU-эвикцией; ± офлайн-паки по эпохам); curated-полки остаются; honest online/offline-state; не раздувает first-visit/OPFS.
- **DoD:** дизайн на утверждение; прототип на подвыборке; OPFS-cap/эвикция протестированы.
- **Notes:** BYOK-on-open вторично (мгновенный доступ к ещё-не-испечённому).

### BRR-P0-011 — iOS/mobile: облегчить первый импорт канона 🟢 MITIGATED v3.10.18 (опт. остаётся)
- **Status:** 🟢 MITIGATED — owner-iPhone грузится нормально на v3.10.18 (после retry). Баг «Не удалось загрузить библиотеку» был на v3.10.17 (85с импорт → iOS убивал длинную задачу). Perf-fix `a038862` (85с→17с) решил для owner-устройства. **Облегчение-импорта (computed-key) остаётся как оптимизация** для старых/медленных устройств + масштаб Track C (не срочно).
- **Observed (WebKit-репро, iPhone-профиль):** на не-OPFS Safari (`navigator.storage.getDirectory` отсутствует → AccessHandlePool VFS падает → медленный fallback) импорт canon-v3 **не завершается за 90-160с** → Зал висит на "Готовим библиотеку" / эвентуально error. v3.10.17 (85с) iOS вероятно убивал длинную задачу → error. v3.10.18 быстрее (17-21с на desktop-OPFS), но импорт 6 646 строк + 6 446 аудио-линков всё ещё тяжёл для mobile.
- **Caveat репро:** Playwright-WebKit-Windows НЕ имеет OPFS (в отличие от реального iOS 17+) → репро = не-OPFS путь, не зеркалит iOS-17+-с-OPFS. Нужны: версия iOS владельца + (идеально) Safari-консоль + retry на v3.10.18.
- **User story:** *Как пользователь на iPhone, открываю Зал и он грузится без зависания/ошибки.*
- **Surface:** Room/Backend · **Role:** R4, R5, R6 · **Priority:** P0 (mobile = ключевой surface)
- **Impl:** new · **Cx:** M · **Dependencies:** BRR-P0-007
- **Кандидат-фиксы (на выбор):** (A) **lazy-per-text audio-link** — импортить канон БЕЗ аудио (вес = canon-v2), линковать аудио строки при открытии текста (idempotent, дёшево); (B) **computed asset-key в reader-core** — не хранить/линковать аудио вовсе; tier-1 вычисляет ключ из текста строки + известного canon-профиля (SHA-256 via crypto.subtle) → HEAD `/api/audio/<key>` (масштабируется на 26K, идеально для P0-006); (C) **defer + render-first** — лёгкий импорт текстов → рендер полок → фоновая линковка (риск: незавершённость при version-gate). **Реком.: B** (убирает весь storage/linking-cost, чинит mobile, готовит Track C).
- **Acceptance:** Зал грузится <~10с на mobile Safari (OPFS и не-OPFS); НИКОГДА не висит вечно (timeout → честное состояние + retry); tier-1 keyless-аудио работает; @380px RTL.
- **DoD:** WebKit-репро зелёный; прод-верификация на iPhone владельца; never-hang safety.

### BRR-P0-010 — Lock down `/api/audio/cache/upload` (X-Local-Mode bypass) ✅ DONE 2026-06-09
- **Status:** ✅ SHIPPED-as-code 2026-06-09 (gates green; **no SW bump** — server/script/docs only). Owner-token gate `requireAudioUploadAuth` replaces `v3AudioPrefetchIsAllowed` on the upload route. Decision logic = pure unit-tested `db/premium/audioUploadAuth.js`; `AUDIO_UPLOAD_TOKEN` env, header `X-Audio-Upload-Token`, constant-time compare (`timingSafeStrEqual`). **Token SET → only a matching token authorizes (even from loopback → kills the `trust proxy`/`X-Forwarded-For:127.0.0.1` spoof bypass the adversarial review found); UNSET → loopback-only (dev), remote 503 fail-closed.** `X-Local-Mode` + `ALLOW_REMOTE_AUDIO_PREFETCH` no longer authorize this write. Added a tight failed-auth limiter (20/10min/IP) on top of `rlAudioUpload`. `push-canon-audio.js` sends the token + aborts if unset (atomic with the gate, so the owner's push doesn't break). `.env.example` documents `AUDIO_UPLOAD_TOKEN` (≥32 random bytes). Gates: **`audioUploadAuth.test` (node --test) + `test:api-smoke` extended** (no-token→403, X-Local-Mode→403, valid-token→reaches validation). **`sha256(mp3)==assetKey` verify = N/A** (the key is over the TTS *request payload*, not the MP3 bytes — proven infeasible by design; the optional MP3 magic-byte check was DROPPED to avoid false-rejecting legit GCP clips). **⚠ Rollout (ops): set `AUDIO_UPLOAD_TOKEN` in Coolify env FIRST → then deploy → then push; GCP-key rotation is INDEPENDENT.** **Residual (P1):** `/api/audio/prefetch/start` is a second, BYOK-self-funded write into the same cache, still `X-Local-Mode`-reachable → **BRR-P1-013**. **Collateral (Stage-2):** in prod, a user importing their OWN audio-embedded ZIP now 403s on repopulation (canon auto-import carries **zero** MP3 bytes → unaffected; verified); audio still plays via tier-2/3, but the `index.html` toast `zipImportAudioRetry` ("will finish caching next time") becomes inaccurate — `index.html` is frozen until Stage 2, so the i18n copy fix is queued for Stage 2.
- **Observed:** `POST /api/audio/cache/upload {assetKey, mp3Base64}` гейтится `v3AudioPrefetchIsAllowed`, который пропускает по заголовку `X-Local-Mode: 1` → **любой** может писать в prod audio-cache (cap 20МБ/файл, sha256-keyshape, НЕ верифицирует что MP3 совпадает с ключом). Pre-existing (не введено P0-007; использовано для push канона).
- **Risk:** cache-poisoning / disk-fill чужими MP3 под валидными ключами; tier-1 отдаст их keyless.
- **User story:** *Как владелец, хочу чтобы только я мог пополнять prod audio-cache.*
- **Surface:** Backend · **Role:** R5/ops · **Priority:** P0 (security) · **Cx:** S
- **Кандидат-фиксы:** owner-token-гейт (env `AUDIO_UPLOAD_TOKEN` + заголовок) на `/api/audio/cache/upload` (и пересмотреть, нужен ли `X-Local-Mode`-bypass на write-путях вообще); push-скрипт шлёт токен из env. Опц.: верифицировать `sha256(mp3)==assetKey` для row/text-ассетов.
- **Acceptance:** аноним (без токена) → 403; push с токеном → 200; гейт прод-верифицирован; `X-Local-Mode` не даёт write на upload.
- **DoD:** токен-гейт + тест; push-скрипт обновлён; docs.

---

## P1 — качество v1.0

### BRR-P1-006 — Консоль скаффолдинга (никуд-fade / транслит / reveal перевода)
- **Source:** StoryHebrew (никуд full/partial/off) · Beelinguapp (параллель) · Sefaria (огласовка toggle)
- **Observed:** регулируемая огласовка + выбор формы двуязычия.
- **Current:** бинарные column-toggle (ru on/off, niqqud-профиль); нет sentence-level reveal, нет graceful никуд-fade.
- **Gap:** один текст не «дышит» от A2 до C2.
- **User story:** *Как ученик, я хочу убавлять никуд/транслит и раскрывать перевод по мере роста, чтобы один текст рос вместе со мной.*
- **Surface:** Room · **Role:** R8, R2, R4 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (данные Dicta niqqud + 2 транслит-профиля есть) · **Cx:** M
- **Dependencies:** BRR-P0-002 · **Risks:** UX (RTL reveal-анимация — opacity/scale, не left-slide)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** никуд full/partial/off + транслит on/off + reveal hidden→предложение→всё; мгновенно, persistent; per-row reveal; @380px RTL без каши.
- **DoD:** screenshot всех состояний @380px RTL; keyboard-доступ к toggle; prefers-reduced-motion.
- **Notes:** **самая быстрая премиум-победа** (данные есть, чистый UX).

### BRR-P1-007 — Coverage-aware каталог: фильтры/поиск + бейдж покрытия + «следующий для тебя» 🟢 APPROVED Путь А (2026-06-10)
- **РАСШИРЕНО 2026-06-10 (владелец утвердил Путь А):** из «бейдж сложности» в **центральную фичу качества v1.0** — coverage-aware каталог. Спайн = `coverage{text,niqqud,translation,audio,era_known,tier}` (см. `DELIVERY_26K_PLAN` «Coverage-модель»). Слайсы A1 (coverage в producer/catalog) → A2 (полный каталог из `pseudocatalogue.csv`, шардинг по эпохам) → A3 (фильтры эпоха/автор/жанр + перевод/озвучка + градуированный дефолт + честный «перевод позже»).
- **Source:** LingQ (оценка уровня) · StoryHebrew (CEFR-бейджи) · Sefaria/HathiTrust (coverage-aware каталог).
- **Observed:** уровень/сложность при discovery + ощущение прогресса; владелец хочет листить весь перечень + фильтровать по покрытию.
- **Current:** `getTextLearningCoverage` + `rankRoots` есть; Проход-3 Срезы 1+2 (каталог + Корпус-вкладка) SHIPPED; coverage-флаги ещё не выведены, фильтров/поиска нет, листятся только baked-100.
- **Gap:** каталог не покрывает весь перечень; нет coverage-фильтров; i+1-данные не превращены в дружелюбную рекомендацию.
- **User story:** *Как ученик — вижу, что текст мне по силам и переведён/озвучен, фильтрую библиотеку, получаю «следующий».* *Как владелец — вижу покрытие и выборочно наполняю перевод/озвучку.*
- **Surface:** Room (+ Studio для fill-queue) · **Role:** R2, R8, R6, R4, R3, R1 · **Priority:** P1 (v1.0 качество)
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (Проход-3 + данные есть) · **Cx:** L (мульти-слайс A1–A5)
- **Dependencies:** BRR-P0-007 (Проход-3), BRR-P1-014 (works→том), BRR-P1-015 (fill-queue) · **Risks:** UX (без техжаргона; не «свалить» хвост → градуированный дефолт), масштаб каталога (шардинг)
- **Offline:** yes · **BYOK:** v1.1 (перевод на лету)
- **Acceptance:** каталог листит весь перечень coverage-aware; фильтры перевод/озвучка/эпоха/автор/жанр; дефолт градуированный (переведённые+канон сверху); честные бейджи (R1); «next» = реальные i+1 по частотности.
- **DoD:** screenshot фильтров+бейджей @380px; coverage-гейт зелёный; empty-state/«перевод позже» честные.
- **Notes:** ключевая моат-фича (i+1 на подлинной литературе — нет ни у кого для иврита). Перевод-стандарт = Gemini-MT (решение владельца 2026-06-10, R7-сэмплинг не делаем). Аудио — BYOK/браузер сейчас; выборочная публикация owner-key клипов позже.

### BRR-P1-014 — Полный каталог (весь перечень ~26K) + шардинг 🟢 APPROVED (2026-06-10)
- **A0 РЕШЕНО 2026-06-10 (см. `DELIVERY_26K_PLAN` §«IA Зала — РЕШЕНО»):** IA = **Вариант 2** (Период→Автор→
  Работа + фасеты жанр/язык/coverage); шардинг = **era-primary + автор-блок** (корневой индекс + per-era
  манифесты, переполненная эпоха → автор-блоки cap ~2–3К); эпоха = **Wikidata-батч** (author QID 90.2% → даты
  жизни → бакет; пред-шаг A2, гейт перед нарезкой по эпохам); остаток = `era="unknown"` (честная полка).
- **Source:** решение владельца «загрузить весь перечень» (Путь А).
- **Observed:** метаданные всех 26 455 работ есть в `pseudocatalogue.csv` (бесплатно) → можно листить весь канон сразу, обогащая coverage во времени.
- **Current:** каталог листит только 100 baked (Проход-3 Срез 1).
- **Gap:** producer не читает CSV для unprocessed-карточек; один JSON-массив не масштабируется (26K × ~150Б ≈ 4МБ).
- **Surface:** producer + Room · **Role:** R6, R5, R3 · **Priority:** P1
- **Acceptance:** `build-corpus-catalog.js` мёржит CSV (весь перечень) + shards (coverage) → тонкий индекс + shard-манифесты по эпохам/автор-префиксу (D1); unprocessed-карточки честные (tier=unprocessed, «перевод позже»).
- **DoD:** гейт на coverage-мёрж + размер шардов; @380px дефолт градуированный.
- **Notes:** 1 814 переводов (translators set, orig_language≠he) — отдельный фасет, отдельная курация.

### BRR-P1-015 — Миграция works → прод-том + fill-queue (выборочное покрытие) 🟢 APPROVED (2026-06-10)
- **A4 (works→том) SHIPPED-as-code 2026-06-10:** `POST /api/benyehuda/works/upload` (owner-token гейт —
  reuse `AUDIO_UPLOAD_TOKEN` + `X-Audio-Upload-Token`, паттерн P0-010; id-валидация + path-guard + атомарная
  перезапись) + статик-маунт тома `/data/benyehuda/works` ПЕРЕД public-static (тот же клиентский URL → без
  правки library-ui/SW; volume-first, git-fallback, честный 404) + push-скрипт `scripts/premium/
  push-corpus-works.js` (зеркало push-canon-audio: header-токен, 403/503 fatal, резюм через `--skip-existing`).
  Гейты: `test:api-smoke` расширен (no-token→403 · X-Local-Mode→403 · traversal→400 · payload→400 · valid→200
  + GET из тома) + audioUploadAuth 9/9; corpus/room регрессия зелёная. **Догфуд-push 100 на ПРОД-том + удаление
  из git = owner-действие** (нужен `AUDIO_UPLOAD_TOKEN`; делать вместе с/после ротации ключей). Fill-queue (A5) ниже.
- **Source:** решение владельца (хранилище на масштабе + выборочное наполнение перевод/озвучка).
- **Observed:** 100 loose-JSON в git = 7МБ (ок); 26K ≈ 1.5–2 ГБ — в git нельзя.
- **Current:** works в git (`public/data/benyehuda/works/`); раздаются статикой.
- **Gap:** нет push-эндпоинта на том; нет coverage-дашборда/таргетинга.
- **Surface:** Backend + Studio · **Role:** R5, R3 · **Priority:** P1
- **Acceptance:** тела works на `/app/data/benyehuda/works/` (статика + owner-token push, паттерн BRR-P0-010); индекс каталога остаётся в git; coverage-отчёт «что не покрыто» + таргетинг раннера/аудио по эпохе/id.
- **DoD:** push-эндпоинт owner-token-gated (smoke); coverage-отчёт; works НЕ в git на масштабе.
- **Notes:** предусловие реального 26K-наполнения. niqqud-probe rest-тира (20–50 works → Dicta backoff vs sidecar) = гейт широкого бейка (см. BRR-P0-006 §4b).

### BRR-P1-008 — Audio↔text karaoke-подсветка (RTL-safe)
- **Source:** Beelinguapp, LingQ (karaoke highlight)
- **Observed:** подсветка по мере воспроизведения связывает звук и текст.
- **Current:** аудио по предложению есть; sync-подсветки нет.
- **Gap:** чтение+слушание не один loop.
- **User story:** *Как слушатель, я хочу видеть подсвеченное предложение/слово при воспроизведении, чтобы связать звук с письмом.*
- **Surface:** Room · **Role:** R4, R2 · **Priority:** P1
- **Strategic fit:** med · **Learner value:** high · **Moat value:** med
- **Impl:** new (подсветка на уровне предложения как минимум) · **Cx:** M
- **Dependencies:** BRR-P0-002 · **Risks:** UX (RTL — opacity/scale; рассинхрон как у Beelinguapp — избегать)
- **Offline:** yes (для pre-baked аудио) · **BYOK:** n/a
- **Acceptance:** активное предложение подсвечено синхронно; RTL-safe; prefers-reduced-motion; нет дрейфа на уровне предложения.
- **DoD:** screenshot/запись подсветки @380px RTL; тест на длинном тексте.
- **Notes:** начать с sentence-level (надёжно), word-level — позже.

### BRR-P1-009 — In-reader статус слов + one-tap лёгкий захват
- **Source:** LingQ (corpus-wide статус) · Readlang (авто-захват)
- **Observed:** видимый статус new/learning/known + захват в карточку из чтения.
- **Current:** `getLearningStateOverlay` есть; не показан в чтении; захват тяжёлый (word-card модал).
- **Gap:** ученик не видит свой прогресс прямо в тексте; захват с трением.
- **User story:** *Как ученик, я хочу видеть незнакомые/учимые слова в тексте и одним тапом их сохранять, не уходя в тяжёлый редактор.*
- **Surface:** Room? (опционально, не перегружать) · **Role:** R2, R3, R4 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (overlay есть; нужен лёгкий UX) · **Cx:** M
- **Dependencies:** BRR-P0-002 · **Risks:** UX (не превратить Зал в IDE — toggle «подсвечивать статус»)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** цвет known/learning/new корректен и офлайн; one-tap захват идемпотентен; статус-подсветку можно выключить.
- **DoD:** screenshot статус-цветов @380px RTL; smoke идемпотентности захвата.
- **Notes:** тяжёлый SRS/Anki остаётся в Студии; здесь — только лёгкий захват.

### BRR-P1-010 — Cost/quota-прозрачность + офлайн-индикатор + PWA install + честные состояния
- **Source:** LingQ (видимые лимиты) · R1/R5 (честность)
- **Observed:** metered-продукты показывают расход/лимиты.
- **Current:** **0 cost-прозрачности** (BYOK тратится молча); BYOK-tour CSS без JS; нет PWA install-CTA; нет офлайн-индикатора; тонкий error-recovery.
- **Gap:** пользователь слеп к своему расходу; нет доверия/контроля.
- **User story:** *Как BYOK-пользователь, я хочу видеть расход ключей и статус офлайн/онлайн, чтобы контролировать траты и понимать поведение приложения.*
- **Surface:** Room (расход — Room?/Backend) · **Role:** R5, R4, R1 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** med · **Moat value:** med
- **Impl:** partial reuse (quota metered серверно) · **Cx:** M
- **Dependencies:** — · **Risks:** low
- **Offline:** yes (индикатор) · **BYOK:** yes (счётчик расхода)
- **Acceptance:** расход BYOK виден до/после онлайн-операции; офлайн-бейдж; PWA «Установить» CTA; каждый error даёт действие (retry/настройки/clear-cache).
- **DoD:** screenshot cost-метра+офлайн-бейджа+install-CTA; проверка error→action; оживить или удалить мёртвый BYOK-tour.
- **Notes:** deep-stacks (P2-015) обогащаются на BYOK → cost-прозрачность здесь обязательна.

### BRR-P1-011 — Лёгкая морфология-на-тапе для Зала
- **Source:** наш моат (нет ни у кого для иврита на learner-tap)
- **Observed:** конкуренты дают max headword (Sefaria) — глубже нет ни у кого.
- **Current:** морфология есть, но «тяжёлый» модал (Студия-grade).
- **Gap:** нет чистой лёгкой презентации для Зала.
- **User story:** *Как ученик, я хочу тапнуть слово и увидеть корень/перевод/форму чисто и быстро, с переходом «подробнее» при желании.*
- **Surface:** Room? · **Role:** R1, R4, R2 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (MorphProvider/Pealim) · **Cx:** M
- **Dependencies:** BRR-P0-002 · **Risks:** UX (не перегрузить карточку — прогрессивное раскрытие)
- **Offline:** yes (Pealim офлайн 9279) · **BYOK:** n/a (офлайн); Dicta-онлайн опц.
- **Acceptance:** tap → лёгкая карточка (корень/перевод/форма + «подробнее→Студия»); офлайн; провенанс (match vs подобрано); функц-слова — употребление, не выдуманные формы (R1/R2).
- **DoD:** screenshot карточки @380px RTL; R1-чек (нет выдуманных форм/корней для служебных).
- **Notes:** граница Room↔Studio: лёгкое здесь, полные таблицы/редактор — в Студии.

### BRR-P1-012 — Curated-перевод-пайплайн + MT-override UI
- **Source:** Sefaria (curated переводы) · Beelinguapp (анти: MT-ошибки)
- **Observed:** вычитанные канонические переводы > сырой MT.
- **Current:** `translationOverridesRepo` есть, **UI нет** (только скрипт).
- **Gap:** нет интерфейса вычитки канона; метки «вычитано» нельзя обеспечить честно без процесса.
- **User story:** *Как куратор, я хочу править перевод/никуд/транслит по сегментам и помечать «вычитано», чтобы curated-полки были честно высокого качества.*
- **Surface:** Studio · **Role:** R1, R7, R5 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** med (опосредованно) · **Moat value:** high
- **Impl:** partial reuse (repo есть; нужен UI + статус-флаг) · **Cx:** L
- **Dependencies:** BRR-P0-004, BRR-P0-005 · **Risks:** content (трудозатраты вычитки)
- **Offline:** n/a (Студия) · **BYOK:** yes (MT на ключах)
- **Acceptance:** редактор правит he_niqqud/translit/ru per-segment; override побеждает кэш; «вычитано» ставится только после вычитки; провенанс обновляется.
- **DoD:** smoke override→render; чек-лист статусов; не ломает 3-tier кэш.
- **Notes:** питает честные метки P0-005.

### BRR-P1-013 — Gate `/api/audio/prefetch/start` (second self-funded write path) 🟠 OPEN (security follow-up)
- **Status:** 🟠 OPEN (surfaced by the BRR-P0-010 adversarial review 2026-06-09).
- **Observed:** `/api/audio/prefetch/start` (+`/status`,`/cancel`) still gate only on `v3AudioPrefetchIsAllowed`, which honors `X-Local-Mode: 1` from **any** remote client. The job runner calls `ensureAudioAsset → writeMp3IfNotExists` into the **same** content-addressed `audio-cache/<key>.mp3` directory as `/upload`. Synthesis is **BYOK-only** (`synthesizeMp3Buffer` throws `TTS_KEY_REQUIRED` without a server key) — so it is NOT an anonymous server-cost path — but an attacker supplying **their own** GCP key can still write attacker-text MP3s under server-computed keys (self-funded poisoning / disk-fill). Bounded by `wx`-create no-overwrite (can't replace existing canon).
- **Gap:** P0-010 closed the *cheap, anonymous, arbitrary-bytes* path (`/upload`); this BYOK-funded residual remains. The cheapest poisoning vector is gone, but the ticket's risk statement isn't fully discharged.
- **Why deferred to P1 (not folded into P0-010):** the prefetch endpoints back the **legitimate** in-browser localMode self-prefetch flow (a user pre-caching *their own* library with *their own* key) — that browser has no owner token, so an owner-token gate would break it. Needs a different control (e.g. per-session/BYOK-scoped quota, or a write-cap-per-IP on prefetch, or binding writes to the requesting session) rather than the owner-token used for `/upload`.
- **Surface:** Backend · **Role:** R5/ops, R1 · **Priority:** P1 · **Cx:** M · **Dependencies:** BRR-P0-010
- **Acceptance:** prefetch-start can no longer be driven by an anonymous remote `X-Local-Mode` caller to write arbitrary keys at scale; the legit in-browser self-prefetch still works; honest 4xx on refusal.
- **DoD:** control chosen + test; doc the trust model; do NOT break localMode prefetch.

---

## P2 — дифференциаторы (после доказательства core-loop)

### BRR-P2-013 — Full-text поиск (Hebrew + транслитерация, никуд-insensitive)
Source: Sefaria/Readlang · Current: `searchSentences` есть, library-поиск только title/source/topic/tags · Gap: нет sentence-level cross-text поиска в UI Зала · **User story:** *как ученик, найти текст/фразу по ивриту или транслитерации* · Surface: Room · Role: R6,R3 · Impl: partial reuse · Cx: M · Offline: yes · BYOK: n/a · **Acceptance:** поиск находит по he/niqqud-insensitive/translit; пустой результат честен · **DoD:** smoke поиска; @380px.

### BRR-P2-014 — Закладки + хайлайты внутри текста
Source: LingQ/Readlang · Current: только resume (last_row_idx) · Gap: нет промежуточных закладок/хайлайтов · **User story:** *отметить место/фразу, чтобы вернуться* · Surface: Room · Role: R4,R2 · Impl: new · Cx: S · Offline: yes · BYOK: n/a · **Acceptance:** закладка/хайлайт сохраняется офлайн, переживает reload · **DoD:** smoke persist; @380px.

### BRR-P2-015 — Глубокие стеллажи: каталог всего корпуса + enrich-on-open (BYOK)
Source: LingQ(import)/Sefaria · Current: missing · Gap: нет доступа ко всему ~20K за пределами curated-полок · **User story:** *как продвинутый, открыть любой текст канона, обогатив его своими ключами* · Surface: Room? + Studio · Role: R6,R5 · Impl: new · Cx: L · Offline: partial (после обогащения) · BYOK: yes · **Acceptance:** каталог из `pseudocatalogue.csv`; открытие → enrich-on-open; honest online/BYOK-state; метка «машинно-ассистировано» · **DoD:** smoke enrich-on-open; cost-прозрачность (P1-010). · **Phase 3.**

### BRR-P2-016 — Пагинация/lazy + разбивка по главам
Source: Sefaria(анти infinite-scroll) · Current: resume есть · Gap: длинные тексты без пагинации рискуют тормозами · **User story:** *читать длинный текст плавно на слабом телефоне* · Surface: Room · Role: R4 · Impl: partial reuse · Cx: S · Offline: yes · BYOK: n/a · **Acceptance:** длинный текст не тормозит на слабом устройстве; явные разрывы глав · **DoD:** perf-проверка на длинном тексте @380px.

### BRR-P2-017 — Keyboard-nav + a11y (aria-live, RTL focus-order, RTL-кавычки/скобки)
Source: стандарт a11y · Current: focus-visible есть, arrow-nav/aria-live тонко · Gap: неполная клавиатурная навигация и озвучка состояний · **User story:** *как клавиатурный/скринридер-пользователь, навигировать чтение* · Surface: Room · Role: R4 · Impl: partial reuse · Cx: M · Offline: yes · BYOK: n/a · **Acceptance:** arrow-nav по строкам; aria-live на async-загрузках; RTL focus-order корректен; `[[ ]]`/кавычки в RTL не ломаются · **DoD:** keyboard-path; a11y-smoke; RTL-рендер тест.

### BRR-P2-018 — 380px RTL visual regression в CI
Source: наша норма (CLAUDE.md) · Current: ручной скриншот, не в CI · Gap: нет авто-защиты от overflow · Surface: Backend · Role: R4 · Impl: new · Cx: S · **Acceptance:** CI падает при overflow/каше @380px RTL на ключевых экранах Зала · **DoD:** Playwright visual-regression в pipeline.

### BRR-P2-019 — Конкорданс в Зале («где ещё встречается слово»)
Source: Sefaria(links)/наш `crosstext.js` · Current: модуль есть, не в Зале · **User story:** *увидеть употребление слова по всему канону* · Surface: Room? · Role: R2,R3 · Impl: reuse · Cx: S · Offline: yes · BYOK: n/a · **Acceptance:** tap→«ещё N вхождений» из `crosstext.findOccurrences`, офлайн · **DoD:** smoke; @380px.

### BRR-P2-020 — Лёгкий vocab-захват → опц. Anki/SRS (handoff в Студию)
Source: Readlang/LingQ · Current: Anki в Студии · Gap: нет лёгкого моста из Зала · **User story:** *сохранить слово из чтения и потом повторить в Anki* · Surface: Room?→Studio · Role: R2,R5 · Impl: partial reuse · Cx: S · Offline: yes · BYOK: n/a · **Acceptance:** захват из Зала появляется в Студия/Anki-экспорте; идемпотентно · **DoD:** smoke handoff.

---

## P3 — на будущее (рост / сообщество / power-user)

### BRR-P3-021 — Кураторские маршруты по авторам/темам
Source: Sefaria(Collections) · Surface: Room (курация Studio/Admin) · Role: R7,R6,R8 · Impl: new · Cx: M · **User story:** *пройти «путешествие по Бялику» как маршрут* · **Acceptance:** маршрут = упорядоченная последовательность с интро и прогрессом · **Notes:** Фаза 4.

### BRR-P3-022 — Шаринг полок через ZIP (peer/curator)
Source: Sefaria(Sheets) · Surface: Studio/Admin · Role: R6,R5 · Impl: partial reuse (bundle export) · Cx: S · **User story:** *поделиться кураторской полкой* · **Acceptance:** полка экспортируется/импортируется через ZIP без потерь.

### BRR-P3-023 — Лёгкий прогресс/стрик (опц., без давления)
Source: Beelinguapp/LingQ · Surface: Room? · Role: R2,R4 · Impl: new · Cx: S · **User story:** *видеть мягкий прогресс без геймификации-давления* · **Acceptance:** опционально, выключаемо, без блокирующих модалов · **Notes:** избегать dark patterns (REJ-06).

### BRR-P3-024 — Community-аннотации / шаринг хайлайтов  *(DEFER, не reject)*
Source: Sefaria(Sheets) · Surface: Room? + Backend · Role: R5,R6 · Impl: new · Cx: L · **Notes:** литературное чтение сольно; отложено до доказательства core-loop.

### BRR-P3-025 — Открытый API для интеграций
Source: Sefaria(API)/Readlang(Anki) · Surface: Backend · Role: R5,R3 · Impl: new · Cx: L · **Notes:** платформенный ход; после зрелости контента.

---

## Группировки

### По surface
- **Reading Room visible:** P0-002, P0-003, P0-005, P1-006, P1-007, P1-008, P1-010, P2-013, P2-014, P2-016, P2-017, P3-021, P3-023.
- **Reading Room optional:** P1-009, P1-011, P2-015 (часть), P2-019, P2-020, P3-024.
- **Studio only:** P0-004, P1-012, P3-022.
- **Backend only:** P0-001, P2-018, P3-025.
- **Admin/curator:** курация в P0-003/P0-004, P3-021/P3-022.
- **Do-not-implement (Reject):** REJ-01…07 (см. gap-матрицу).

### Content/editorial требования (R1/R6/R7)
- Вычитка curated-полок (перевод/никуд) + честные метки (P0-005, P1-012).
- Метаданные per work: автор/эпоха/жанр/переводчик/язык-оригинала/public-domain атрибуция (P0-001).
- Метки регистра/эпохи; «доступная» vs «литературная» классификация (P0-003).
- Редакторские интро к полкам/авторам (P0-003, P3-021).
- 0 R1-нарушений в морфо-enrich (`audit:note-fields`) (P0-004).

### UI/UX DoD checklist (для каждого Room-требования)
- [ ] Screenshot @380px **RTL** (HE-locale) — нет overflow/каши, нет фикс-высот, длинный контент скроллится.
- [ ] Keyboard-path (Tab/Enter/Arrow) до основного действия; focus-states видимы.
- [ ] Empty-state: говорит что произошло и что делать.
- [ ] Loading-state: честный (skeleton/spinner, prefers-reduced-motion).
- [ ] Error-state: actionable (retry/настройки/clear-cache).
- [ ] Offline/online/BYOK-state понятен.
- [ ] RTL/LTR: явные `dir` там, где смешиваются иврит/рус/англ; пунктуация не ломается (bidi-isolate).
- [ ] aria-label/понятный текст для иконок; aria-live для async.
- [ ] Провенанс/метки честности там, где есть перевод/аудио/морфология.

### Phase-mapping
- **Фаза 1 (Зал + 2 полки):** P0-001 ✅, P0-002 ✅, P0-003 ✅, P0-004 ✅, P0-005 ✅, **P0-002b Stage 1 ✅ (SW v3.10.16-embed-default; Stage 2 = миграция index.html отложена)**, P2-016, P2-018.
- **Фаза 2 (Скаффолдинг + i+1):** P1-006, P1-007, P1-008, P1-009, P1-010, P1-011, P1-012, P2-014, P2-017, P2-020.
- **Фаза 3 (Глубокие стеллажи + BYOK + ПРЕД-ПРОГОН):** **P0-008 + P0-009 (пререквизиты)** → **P0-006 (раннер)** → **P0-007 (доставка keyless)**, P2-013, P2-015, P2-019.
- **Фаза 4 (Кураторские маршруты):** P3-021, P3-022, P3-023, P3-024, P3-025.

### Статус и порядок (аудит 2026-06-08)
**DONE + PROD-LIVE (SW v3.10.12-canon-v2-chapters, main @ 8d3c3ed):** P0-001, P0-002, P0-002a, P0-003,
P0-004, P0-005 (+ сверх плана: батчинг импорта, ship-as-asset авто-импорт канона, A-главы; canon-v2 =
79 текстов / 7 полок / R1 79 PASS). Решения: перевод = Gemini `gemini-2.5-flash`; никуд = Dicta-cloud;
`review_status=machine`. Все 8 гейтов зелёные (проверено аудитом).
**СЛЕДУЮЩИЙ ПОРЯДОК:** (1) **P0-002b Stage 1 ✅ SHIPPED+PROD 2026-06-09** (embedded warm-reader, SW
v3.10.16; warm-open ~24мс; `reader-core.*` + parity-гейт; P1-006 закрыт) → остаётся **Stage 2** (миграция
index.html на reader-core, отложена) ∥ (2) пред-прогон-трек: **P0-008 ✅ → P0-009 ✅ → P0-006 (раннер) →
P0-007 (доставка keyless + аудио-предбейк — снимет browser-speech-fallback)** ∥ (3) полировка (**P1-006 ✅**
в Зале / P1-009 + бейдж эпоха·регистр + HE-native-review). Полный as-built —
`docs/BEN_YEHUDA_READING_ROOM_IMPLEMENTATION_STATUS.md` §10.

### Рекомендуемые первые 10 тикетов (порядок)
1. **BRR-P0-001** Схема метаданных корпуса + bundle v2.1 (schema-first).
2. **BRR-P0-002** `library.html` scaffold + route + лёгкий SW-precache + i18n `room.*`.
3. **BRR-P0-003** Модель полок + UI двух треков.
4. **BRR-P0-004** Конвейер курации/ингестии → стартовые бандлы.
5. **BRR-P0-005** Провенанс + атрибуция + метки честности.
6. **BRR-P1-006** Консоль скаффолдинга (никуд-fade/транслит/reveal).
7. **BRR-P1-007** Бейдж сложности+покрытия + «следующий для тебя».
8. **BRR-P1-008** Audio↔text karaoke-подсветка.
9. **BRR-P1-009** Цвет-статус слов + one-tap захват.
10. **BRR-P1-010** Cost-прозрачность + офлайн/PWA-cues + честные состояния.
