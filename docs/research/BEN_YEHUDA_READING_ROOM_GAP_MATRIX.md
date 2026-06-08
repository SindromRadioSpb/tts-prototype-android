# Gap-матрица: Читальный зал на корпусе Бен-Йехуда vs конкуренты

> **Дата:** 2026-06-08 · **Вход:** `docs/research/COMPETITOR_READING_PRODUCTS_AUDIT.md`
> (LingQ/Readlang/Beelinguapp/StoryHebrew/Sefaria) + read-only аудит кода (workflow
> `wj9pmz4yv`). **Стратегия:** `docs/strategy/BEN_YEHUDA_LIBRARY_READING_ROOM_STRATEGY.md`.
> **Бэклог (формат требований):** `docs/planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md`
> — те же ID `BRR-*` (этот документ = анализ/приоритеты; бэклог = исполнимые карточки).
>
> Роли: R1 лексикограф · R2 SLA · R3 граф · R4 premium-UX · R5 рынок · R6 куратор-
> библиотекарь · R7 литературовед · R8 graded-дизайнер.

---

## Executive summary

Наш движок чтения (A) и обучения (B) — **сильнее всех конкурентов по Hebrew-глубине**
(морфология на тапе, Pealim 9279, i+1 frontier, двойная транслитерация, конкорданс,
Anki-sync). Производство/Студия (D) — зрелое (bundle ZIP v2, 3-tier MT-кэш, BYOK,
enrich-script). **Провал — в discovery/библиотеке (C) и в самой поверхности Зала**
(её ещё нет) **+ честность/прозрачность UX (E)**.

**5 P0** (блокеры беты): нет `library.html`, нет полок/курации, нет модели метаданных
корпуса, нет конвейера ингестии, нет провенанса/атрибуции. **6 P1** (качество v1.0):
скаффолдинг-консоль, бейдж сложности+«next for you», audio-sync подсветка, in-reader
статус слов + лёгкий захват, cost-прозрачность+офлайн/PWA-cues, лёгкая морфо-на-тапе
для Зала + curated-перевод-пайплайн. **P2** — поиск/закладки/глубокие стеллажи/
пагинация/a11y/CI. **P3** — маршруты/шаринг/лёгкий прогресс/community/API.

**Главный strategic-risk:** Зал → «index.html lite» (потеря чистоты) + сваливание
неградуированного 20K-канона. Митигация встроена в P0 (two-surface + two-track + честные
метки регистра).

---

## Карта текущих возможностей (A–E)

| Группа | Состояние | Что есть (reuse) | Чего нет (gap) |
|---|---|---|---|
| **A. Чтение** | 🟢 сильно | `renderTable` 5-кол he/niqqud/translit/ru, пресеты колонок, 2 транслит-профиля, аудио/предложение (гибрид GCP+TTS), playlist, RTL-mobile, OPFS-офлайн, resume | tap-reveal перевода (только бинарный toggle); karaoke audio↔text подсветка |
| **B. Обучение** | 🟢 сильно | MorphProvider (hspell 34K/250K), Pealim 9279 stem-aware, Dicta niqqud, **i+1** `getTextLearningCoverage`, `rankRoots`, конкорданс, notes v2 + word-cards, **Anki двусторонний sync**, knowledge-map+quiz | inline sentence tap-gloss (есть только модал); лёгкая презентация морфо для Зала |
| **C. Discovery** | 🔴 слабо | free-text title/source/topic, level exact, tags AND | полки/коллекции, автор/переводчик/эпоха/жанр-фасеты, «next», закладки, бейдж сложности/покрытия, импорт метаданных Бен-Йехуда |
| **D. Студия** | 🟢 сильно | bundle ZIP v2, 3-tier MT-кэш+overrides, `ensureAudioAsset`+linking, BYOK (session, quota), `build-notes-from-bundle`, провенанс, override-repo | `library.html`, `/api/reading-room|shelves`, корпус-провенанс (автор/эпоха/издание/язык-ориг), MT-override UI, content-hash текста, офлайн-бандл метаданных |
| **E. UX-качество** | 🟡 частично | тема/тени/переходы, focus-visible, i18n ru/en/he, RTL bidi-isolate, empty/loading, PWA precache | BYOK-tour без JS, 0 cost/quota-прозрачности, нет PWA install CTA, нет офлайн-индикатора, тонкий error-recovery, 380px не в CI, нет arrow-nav, редкие aria-live |

---

## Gap-матрица (at-a-glance)

Severity: critical/high/medium/small · Impl: reuse / partial-reuse / new / research · Cx: XS/S/M/L/XL
Surface: Room=Reading Room visible · Room?=Room optional · Studio · BE=Backend · Adm=Admin/curator

| ID | Practice / Requirement | Источник | Наше состояние | Sev | User | Moat | R-owner | Surface | Impl | Cx | Phase | Prio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BRR-P0-001 | Модель метаданных корпуса (автор/эпоха/жанр/переводчик/язык-ориг/провенанс + content-hash) | Sefaria, R6 | ✅ DONE (corpus v1 + bundle v2.1, Option A) | high | med | high | R6,R3 | BE | partial | M | 1 | P0 |
| BRR-P0-002 | Чистая страница Читального зала (`library.html`) | LingQ,Beelinguapp,StoryHebrew | ✅ done (browse + room-mode; embedded/sw-room → P0-002b) | critical | high | high | R4,R5 | Room | new | L | 1 | P0 |
| BRR-P0-003 | Полки/коллекции + 2 трека (Доступная/Литературная) | Sefaria,Beelinguapp | ✅ DONE (модель; OPFS+bundle, рендер=P0-002) | critical | high | high | R6,R8 | Room | new | M | 1 | P0 |
| BRR-P0-004 | Конвейер курации/ингестии Бен-Йехуда → бандлы | LingQ(import),Sefaria | partial (`build-notes`) | critical | high | high | R6,R1,R7 | Studio | partial | L | 1 | P0 |
| BRR-P0-005 | Провенанс per work + атрибуция + метки честности (вычитано/машинно/TTS) | Sefaria,R1 | partial (provenance в данных) | high | med | high | R1,R5,R7 | Room | partial | S | 1 | P0 |
| BRR-P1-006 | Консоль скаффолдинга (никуд fade / транслит / reveal перевода) | StoryHebrew,Beelinguapp | partial (бинарные toggle) | high | high | high | R8,R2,R4 | Room | partial | M | 2 | P1 |
| BRR-P1-007 | Бейдж сложности+покрытия + «следующий для тебя» | LingQ,StoryHebrew | missing (i+1 есть в данных) | high | high | high | R2,R8,R3 | Room | partial | M | 2 | P1 |
| BRR-P1-008 | Audio↔text karaoke-подсветка (RTL-safe) | Beelinguapp,LingQ | missing | high | high | med | R4,R2 | Room | new | M | 2 | P1 |
| BRR-P1-009 | In-reader статус слов (known/learning/new) + one-tap лёгкий захват | LingQ,Readlang | missing (overlay есть) | high | high | high | R2,R3,R4 | Room? | partial | M | 2 | P1 |
| BRR-P1-010 | Cost/quota-прозрачность + офлайн-индикатор + PWA install CTA + честные состояния | LingQ; R1/R5 | missing | high | med | med | R5,R4,R1 | Room | partial | M | 2 | P1 |
| BRR-P1-011 | Лёгкая морфология-на-тапе для Зала (root/биньян/парадигма) | (наш моат; нет ни у кого) | partial (тяжёлый модал) | medium | high | high | R1,R4,R2 | Room? | partial | M | 2 | P1 |
| BRR-P1-012 | Пайплайн вычитанного параллельного перевода + MT-override UI | Sefaria,Beelinguapp(анти) | partial (override-repo без UI) | high | med | high | R1,R7,R5 | Studio | partial | L | 2 | P1 |
| BRR-P2-013 | Full-text поиск (Hebrew + транслитерация) по корпусу | Sefaria,Readlang | partial (searchSentences) | medium | med | med | R6,R3 | Room | partial | M | 3 | P2 |
| BRR-P2-014 | Закладки + хайлайты внутри текста | LingQ,Readlang | missing (только resume) | medium | med | low | R4,R2 | Room | new | S | 2 | P2 |
| BRR-P2-015 | Глубокие стеллажи: каталог всего корпуса + enrich-on-open (BYOK) | LingQ(import),Sefaria | missing | medium | med | high | R6,R5 | Room?+Studio | new | L | 3 | P2 |
| BRR-P2-016 | Пагинация/lazy + разбивка по главам (анти-Sefaria) | Sefaria(анти) | partial (resume) | medium | med | low | R4 | Room | partial | S | 1 | P2 |
| BRR-P2-017 | Keyboard-nav (arrow-rows) + a11y (aria-live, RTL focus-order) | (стандарт) | partial | medium | med | low | R4 | Room | partial | M | 2 | P2 |
| BRR-P2-018 | 380px RTL visual regression в CI | (наша норма CLAUDE.md) | missing | medium | low | low | R4 | BE | new | S | 1 | P2 |
| BRR-P2-019 | Конкорданс «где ещё встречается слово» в Зале | Sefaria(links),наш crosstext | partial (`crosstext.js`) | small | med | med | R2,R3 | Room? | reuse | S | 3 | P2 |
| BRR-P2-020 | Лёгкий vocab-захват → опц. Anki/SRS (handoff в Студию) | Readlang,LingQ | partial (Anki в Студии) | small | med | med | R2,R5 | Room?→Studio | partial | S | 2 | P2 |
| BRR-P3-021 | Кураторские маршруты по авторам / темам | Sefaria(Collections) | missing | small | med | med | R7,R6,R8 | Room | new | M | 4 | P3 |
| BRR-P3-022 | Шаринг полок через ZIP (peer/curator) | Sefaria(Sheets) | partial (bundle export) | small | low | med | R6,R5 | Studio/Adm | partial | S | 4 | P3 |
| BRR-P3-023 | Лёгкий прогресс/стрик (опц., без давления) | Beelinguapp,LingQ | missing | small | low | low | R2,R4 | Room? | new | S | 4 | P3 |
| BRR-P3-024 | Community-аннотации / шаринг хайлайтов | Sefaria(Sheets) | missing | small | low | med | R5,R6 | Room?+BE | new | L | 4 | P3 |
| BRR-P3-025 | Открытый API для сторонних интеграций | Sefaria(API),Readlang(Anki) | missing | small | low | med | R5,R3 | BE | new | L | 4 | P3 |

> Reject-практики — отдельным разделом ниже (не в матрице, т.к. их severity = «не нужно»).

---

## P0 — блокеры публичной беты Зала

Для каждого: что конкурент делает хорошо · наше состояние · suggested requirement · why now · acceptance · evidence-needed · deps · risk.

**BRR-P0-001 — Модель метаданных корпуса.**
- *Конкурент:* Sefaria — структурированные метаданные + провенанс per work как основа discovery.
- *Наше:* `texts.source/topic` — свободные строки; нет сущностей автор/переводчик/эпоха/жанр, нет content-hash текста.
- *Suggested:* расширить `source_meta_json` + новые поля/таблицы (author, era, genre, translator, orig_language, byehuda_id, content_hash) + bump bundle schema → v2.1 (обратно-совместимо).
- *Why now:* schema-first, иначе болезненная миграция после набора корпуса (R6 red flag).
- *Acceptance:* импорт сохраняет все поля; экспорт round-trip без потерь; фасеты фильтруют по author/era/genre; дедуп по content_hash.
- *Evidence:* `pseudocatalogue.csv` маппинг-таблица; smoke round-trip import/export.
- *Deps:* — · *Risk:* low (аддитивная схема).

**BRR-P0-002 — Чистая страница Читального зала.**
- *Конкурент:* LingQ/Beelinguapp/StoryHebrew — отдельная чистая читалка как сам продукт.
- *Наше:* нет `library.html`; всё в `index.html` (40K строк, «нагромождённый интерфейс»).
- *Suggested:* `public/library.html` + `public/js/library-ui.js`, отдельный лёгкий SW-precache (без морфо/граф/квиз-чанков), i18n namespace `room.*`; reuse `renderTable`/`v3LibraryOpenText`/тема/OPFS; **скрыты** Студия-функции.
- *Why now:* без поверхности нет продукта; чистота — суть стратегии D.
- *Acceptance:* `/library` грузится офлайн, рендерит полку→текст→чтение+аудио; @380px RTL без overflow; не тянет тяжёлые чанки (проверка bundle-size).
- *Evidence:* screenshot @380px RTL; Lighthouse/asset-аудит precache.
- *Deps:* BRR-P0-003 (что показывать) · *Risk:* medium (дисциплина «не тянуть Студию»).

**BRR-P0-003 — Полки/коллекции + два трека.**
- *Конкурент:* Sefaria Collections (редакторский голос); Beelinguapp жанр/уровень-полки.
- *Наше:* нет модели полок; только tags/level. Discovery = плоский список.
- *Suggested:* модель shelf/collection (id, title, track∈{accessible,literary}, order, items[], editorial_intro) + UI двух треков; курируется в Студии.
- *Why now:* discovery — главный пробел; без полок Зал = свалка.
- *Acceptance:* ≥2 трека с ≥1 полкой; полка показывает упорядоченные произведения + интро; навигация полка↔текст↔назад сохраняет позицию.
- *Evidence:* screenshot обоих треков @380px; smoke навигации.
- *Deps:* BRR-P0-001 · *Risk:* low.

**BRR-P0-004 — Конвейер курации/ингестии.**
- *Конкурент:* LingQ import; Sefaria структурированный ingest.
- *Наше:* `build-notes-from-bundle.js` (морфо-enrich) есть, но нет парсера Бен-Йехуда (`pseudocatalogue.csv` + `txt/`) → сегментация → перевод+никуд+транслит+TTS → bundle.
- *Suggested:* CLI-конвейер: csv+txt → `pipeline.translateTable` + `ensureAudioAsset` + `createTextWithSentences` → ZIP v2.1; курация ~50–150 произведений в 2 трека; метки level/era/register/genre; R1/R7 вычитка.
- *Why now:* без контента нет беты; гибрид требует pre-baked полок.
- *Acceptance:* стартовые бандлы (~50–150) импортируются; 0 R1-нарушений в morpho-enrich (gate `audit:note-fields`); каждое произведение имеет провенанс+метки.
- *Evidence:* QA-отчёт конвейера (PASS/SUSPECT/FAIL по классам); пилот 10–20 текстов → import → render офлайн.
- *Deps:* BRR-P0-001 · *Risk:* medium (качество MT/TTS на архаике — митигация: вычитка + честные метки).

**BRR-P0-005 — Провенанс + атрибуция + метки честности.**
- *Конкурент:* Sefaria — источник/издание/дата видимы; R1-инвариант проекта.
- *Наше:* провенанс есть в данных (`_sources`, provider), но не выведен в Зале; нет per-work атрибуции Бен-Йехуда; нет меток «вычитано/машинно/TTS».
- *Suggested:* на карточке+в читалке: автор/источник/public-domain + бейджи «✅ вычитано» / «⚙ машинно-ассистировано» / «🔊 TTS» / «эпоха/регистр».
- *Why now:* доверие = фича (R1/R5); нельзя метить MT как вычитанный, TTS как native.
- *Acceptance:* каждое произведение показывает источник+статус перевода+статус аудио; ни один MT-перевод не помечен «вычитано» без вычитки.
- *Evidence:* screenshot карточки+читалки с метками; чек-лист соответствия меток данным.
- *Deps:* BRR-P0-001 · *Risk:* low.

## P1 — качество v1.0

**BRR-P1-006 Консоль скаффолдинга** — *Sefaria/StoryHebrew/Beelinguapp.* Никуд full/partial/off (данные Dicta), транслит on/off (2 профиля), reveal перевода hidden→предложение→всё (сейчас бинарный column). *Acceptance:* каждый toggle мгновенно меняет рендер, persistent; reveal работает per-row; @380px RTL без каши. *Why now:* самая быстрая премиум-победа, данные есть. *Cx M · Room.*

**BRR-P1-007 Бейдж сложности+покрытия + «next for you»** — *LingQ/StoryHebrew.* Превратить `getTextLearningCoverage`+`rankRoots` в дружелюбный бейдж (покрытие% / уровень) + ленту «следующий для тебя» (i+1). *Acceptance:* каждый текст показывает понятный индикатор (без техжаргона); «next» возвращает реально i+1-тексты. *Why now:* моат (никто для иврита). *Cx M · Room.*

**BRR-P1-008 Audio↔text karaoke-подсветка** — *Beelinguapp/LingQ.* Подсветка активного предложения (мин.) / слова при воспроизведении, RTL-safe (opacity/scale, не left-slide). *Acceptance:* подсветка синхронна (±, на уровне предложения), не ломает RTL, prefers-reduced-motion. *Cx M · Room.*

**BRR-P1-009 In-reader статус слов + лёгкий захват** — *LingQ/Readlang.* Цвет known/learning/new из `getLearningStateOverlay`; one-tap «сохранить/глосса» (тяжёлый SRS — в Студии). *Acceptance:* статус-цвет корректен и офлайн; tap-захват идемпотентен; не превращает Зал в IDE. *Cx M · Room optional.*

**BRR-P1-010 Cost-прозрачность + офлайн/PWA-cues** — *LingQ + R1/R5.* Счётчик BYOK-расхода/квоты; офлайн-индикатор; PWA «Установить» CTA; честные empty/error (retry/clear-cache) — оживить мёртвый BYOK-tour CSS или удалить. *Acceptance:* пользователь видит расход до/после онлайн-операции; офлайн-бейдж; install-CTA; error даёт действие. *Cx M · Room.*

**BRR-P1-011 Лёгкая морфо-на-тапе для Зала** — *наш моат.* Чистая презентация root/биньян/парадигма (reuse MorphProvider/Pealim), но «Room optional», не тяжёлый модал. *Acceptance:* tap слова → лёгкая карточка (корень/перевод/форма + «подробнее→Студия»); офлайн; провенанс (match vs подобрано). *Cx M · Room optional.*

**BRR-P1-012 Curated-перевод-пайплайн + MT-override UI** — *Sefaria; Beelinguapp(анти).* UI-редактор overrides (есть repo, нет UI) для вычитки канона; метки «вычитано». *Acceptance:* куратор правит he_niqqud/translit/ru per-segment; override побеждает кэш; помеченное «вычитано» действительно вычитано. *Cx L · Studio.*

## P2 — важные дифференциаторы (после доказательства core-loop)
- **BRR-P2-013** Full-text поиск (Hebrew+транслит, никуд-insensitive) по корпусу — *reuse searchSentences*. *Cx M.*
- **BRR-P2-014** Закладки/хайлайты внутри текста — *new*. *Cx S.*
- **BRR-P2-015** Глубокие стеллажи (каталог всего корпуса + enrich-on-open BYOK) — Фаза 3. *Cx L.*
- **BRR-P2-016** Пагинация/lazy + разбивка по главам (анти-Sefaria infinite-scroll) — *Cx S.*
- **BRR-P2-017** Keyboard-nav + a11y (aria-live, RTL focus-order, RTL-кавычки/скобки) — *Cx M.*
- **BRR-P2-018** 380px RTL visual regression в CI — *Cx S.*
- **BRR-P2-019** Конкорданс в Зале (reuse `crosstext.js`) — *Cx S.*
- **BRR-P2-020** Лёгкий vocab-захват → опц. Anki/SRS handoff — *Cx S.*

## P3 — на будущее (рост/сообщество/power-user)
- **BRR-P3-021** Кураторские маршруты по авторам/темам.
- **BRR-P3-022** Шаринг полок через ZIP.
- **BRR-P3-023** Лёгкий прогресс/стрик (опц., без давления).
- **BRR-P3-024** Community-аннотации (Sefaria Sheets-like).
- **BRR-P3-025** Открытый API для интеграций.

## Reject-список (не копировать — с обоснованием)
| ID | Практика | Источник | Почему reject |
|---|---|---|---|
| REJ-01 | AI-генерация «graded» рассказов | Beelinguapp | Подлинный канон = моат; AI-контент с ошибками подрывает доверие/престиж (R1/R7) |
| REJ-02 | Агрессивные lookup-paywalls / дневные лимиты | LingQ | Public-domain контент бесплатно; монетизация Студии/BYOK (R5) |
| REJ-03 | Браузерный TTS как основной / метка «native» для TTS | Readlang/Beelinguapp | Честность (R1): TTS метить как TTS; human-нарратив/HQ + импорт человеческого аудио |
| REJ-04 | Infinite-scroll memory-heavy читалка | Sefaria | Тормоза/краши; нам — пагинация/lazy + главы (→ BRR-P2-016) |
| REJ-05 | 10 конкурирующих переводов | Sefaria | Паралич выбора; нам — 1–2 помеченных параллельных (R8) |
| REJ-06 | Тяжёлая геймификация/стрики как core | LingQ/Beelinguapp | Чистый Зал; лёгкое опц. → BRR-P3-023 |
| REJ-07 | Mobile/desktop неравенство | Sefaria (Android) | Нам — паритет (обязательство, не фича) |
| DEFER-01 | Community/social как core v1 | Sefaria/LingQ | Литературное чтение сольно; отложено → BRR-P3-024 (не reject, defer) |

## Ownership ролей R1–R8
- **R1 (лексикограф):** P0-005, P1-011, P1-012, REJ-03 (честность форм/перевода/аудио, провенанс).
- **R2 (SLA):** P1-006/007/009, P2-019/020 (понятность, i+1, retention, anti-тупик).
- **R3 (граф):** P0-001 (сущности/связи), P1-007/009, P2-013 (честная структура/ID).
- **R4 (premium-UX):** P0-002, P1-006/008/010, P2-014/016/017/018 (чистота, 380px RTL, состояния, a11y).
- **R5 (рынок):** P0-002/005, P1-010/012, P2-015, P3-022/024/025, REJ-02 (моат, монетизация, offline-first).
- **R6 (куратор-библиотекарь):** P0-001/003/004, P2-013/015, P3-021/022 (комплектование, метаданные, discovery, атрибуция).
- **R7 (литературовед):** P0-004/005, P1-012, P3-021, REJ-01/05 (канон, регистр, интро, честная архаика).
- **R8 (graded-дизайнер):** P0-003, P1-006/007, REJ-05 (грейдинг, скаффолдинг-fade, on-ramp, «next»).

## Сложность / зависимости (заметки)
- **Schema-first критично:** BRR-P0-001 — пред-зависимость для 003/004/005/013/015. Сделать первым.
- **P0-002 зависит от P0-003** (поверхность нуждается в полках, чтобы не быть пустой).
- **Большинство P1 — partial-reuse:** данные/движок есть (overlay, coverage, niqqud, морфо), нужен
  только learner-facing UX в чистом Зале. Это снижает риск и ускоряет.
- **P1-012 (L)** и **P2-015 (L)**, **P3-024/025 (L)** — самые тяжёлые; не в первой фазе.
- **Reuse-as-is:** `renderTable`, `v3LibraryOpenText`, OPFS local-db, `crosstext.js`, Pealim/Dicta,
  bundle import/export, i18n, тема — фундамент Зала готов.

## Риски (сводно)
- **Strategic:** Зал → «index.html lite»; сваливание неградуированного 20K → P0 митигирует (two-surface, two-track, метки).
- **Content/editorial (R1/R7):** MT на поэзии слаб; архаичный регистр; OCR-сомнения → вычитка curated + честные метки + «машинно-ассистировано» на deep-stacks.
- **Cost (R5):** TTS/MT на масштабе → граница precompute/BYOK.
- **UX (R4):** RTL/LTR каша, фикс-высоты, 380px overflow → DoD-чек @380px + bidi-isolate + пагинация.
- **Trust (R1/R5):** непрозрачный BYOK-расход → P1-010.

## План валидации
1. Пилот-полка 10–20 текстов (оба трека) через конвейер P0-004 → import → `renderTable` офлайн @380px RTL.
2. Оценщик сложности (P1-007): sanity на размеченной выборке vs частотность/i+1.
3. Провенанс/метки (P0-005): чек-лист «метка ↔ реальные данные» (0 ложных «вычитано»/«native»).
4. Schema round-trip (P0-001): import→export→import без потерь; дедуп по content_hash.
5. Каждый P0/P1 имеет acceptance + DoD (screenshot @380px RTL, keyboard-path, empty/error/loading, a11y) — см. бэклог.
