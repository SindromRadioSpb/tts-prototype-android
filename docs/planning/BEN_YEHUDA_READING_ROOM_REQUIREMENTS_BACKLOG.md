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

### BRR-P1-007 — Бейдж сложности+покрытия + «следующий для тебя»
- **Source:** LingQ (оценка уровня) · StoryHebrew (CEFR-бейджи)
- **Observed:** уровень/сложность при discovery + ощущение прогресса.
- **Current:** `getTextLearningCoverage` + `rankRoots` есть, но не выведены как learner-бейдж; нет «next text».
- **Gap:** i+1-данные не превращены в дружелюбную рекомендацию.
- **User story:** *Как ученик, я хочу видеть, насколько текст мне по силам, и получать «следующий для тебя», чтобы не выбирать вслепую.*
- **Surface:** Room · **Role:** R2, R8, R3 · **Priority:** P1
- **Strategic fit:** high · **Learner value:** high · **Moat value:** high
- **Impl:** partial reuse (данные есть) · **Cx:** M
- **Dependencies:** BRR-P0-001, BRR-P0-003 · **Risks:** UX (без пугающего техжаргона сложности)
- **Offline:** yes · **BYOK:** n/a
- **Acceptance:** каждый текст показывает понятный индикатор (покрытие%/уровень, дружелюбно); «next» возвращает реально i+1-тексты по частотности.
- **DoD:** screenshot бейджа+ленты; sanity оценщика vs частотность; empty-state «next» честный.
- **Notes:** ключевая моат-фича (i+1 на подлинной литературе — нет ни у кого для иврита).

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
- **Фаза 1 (Зал + 2 полки):** P0-001, P0-002, P0-003, P0-004, P0-005, P2-016, P2-018.
- **Фаза 2 (Скаффолдинг + i+1):** P1-006, P1-007, P1-008, P1-009, P1-010, P1-011, P1-012, P2-014, P2-017, P2-020.
- **Фаза 3 (Глубокие стеллажи + BYOK):** P2-013, P2-015, P2-019.
- **Фаза 4 (Кураторские маршруты):** P3-021, P3-022, P3-023, P3-024, P3-025.

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
