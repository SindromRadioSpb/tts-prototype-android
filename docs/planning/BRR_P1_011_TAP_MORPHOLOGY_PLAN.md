# BRR-P1-011 — Тап-морфология в Читальном зале (учебный слой v1)

> **Канон-план (single source of truth, в репо).** Зеркало рабочего plan-mode файла
> `~/.claude/plans/linguistpro-node-js-pwa-playful-minsky.md`. Держать синхронно.
> **Дата:** 2026-06-11 · **Статус:** APPROVED, в работе · **Роли:** R1/R4/R5/R2/R8.
> Норма (owner 2026-06-11): планы/handoff — в `docs/planning/` (коммит), не только локально.

## Context (зачем)
Читальный зал (`library.html`) сейчас — **read-only** ридер + сильная корпус-навигация (A3),
но **учебного слоя нет вообще** (тап по слову = 0, морфология в Зал не загружается). Это
прямо противоречит заявленному **#1 моату** проекта — «глубокая морфология на тапе внутри
чтения» (стратегия `docs/strategy/BEN_YEHUDA_LIBRARY_READING_ROOM_STRATEGY.md`). Конкуренты
(LingQ/Readlang/Sefaria) дают tap-lookup мельче (headword/перевод), морфо-глубины нет ни у кого.
Этот слой закрывает моат и является **keystone**: резолв слово→лемма потом разблокирует
цвет-статус слова (BRR-P1-009) и «следующий для тебя» i+1 (BRR-P1-007). Выбран владельцем
2026-06-11 как Шаг 1 рекомендованной последовательности (morph → цвет-статус → i+1).

## Цель
Тап по ивритскому слову в ридере Зала → **лёгкая** карточка: слово+никуд · корень · биньян ·
POS · ru-глосса · **честный провенанс** · «Открыть на Pealim ↗» · «Подробнее → Студия».
Offline-first · additive к `reader-core` (parity-гейт зелёный) · `index.html` НЕ тронут.

## Ключевой инсайт (по реальному коду, 2026-06-11)
Honesty-graded резолвер `NotesAutoGen.resolveContentUnit` опирается на **огласованную форму**
через `formFirstResolve`/`formIdx` (decisive homograph-сигнал) и **работает даже с unit без
POS** (`pos===""` допускается). Baked-строки корпуса несут `he_niqqud`. Значит офлайн-спайн v1 =
токенизировать `he`+`he_niqqud` → `{surface, niqqud}` → `pickBaseParadigm` + `resolveContentUnit`
против датасета 9279 парадигм — **без Dicta и без MorphProvider**. Они — opt-in апгрейды:
- **MorphProvider** (hspell Tier-1) — лучше POS/lemma, когда form-first промахивается (опц.).
- **Dicta-cloud** — лучшая дизамбигуация, online, consent-gated (опц. «Уточнить»).
R1-честность: form-first НИКОГДА не фабрикует (неоднозначно → честный empty/«подобрано»).

## Архитектура (parity-safe)
**Make-or-break:** `smoke:reader-parity` гоняет САМ builder `buildBilingualTableHtml` против
golden. Поэтому word-tap **НЕ трогает builder**: оборачивание слов в span — **Room-only
пост-рендер-трансформ** (после `openText`), который гейт не инспектирует. Builder байт-идентичен.

### 1. NEW `public/js/reader-morph.js` (ES-module, ленивый)
- **Lazy-init на первый тап:** загрузка `inflection-dict.js` (`InflectionDict.ensureReady()` →
  `paradigms`) + один раз `buildResolverMaps(paradigms)` (кэш на сессию). Дикт 3.3МБ грузится
  ТОЛЬКО при первом тапе (НЕ precache). Спиннер на карточке во время первой загрузки.
- **Токенайзер + выравнивание:** разбить строку (ивр. буквы+никуд `א-ת`+`֑-ׇ`,
  гереш/гершаим, граница = пробел/пункт/maqaf `־`) на word-токены с offset’ами. Токенизировать
  `row.he` и `row.he_niqqud`, выровнять по индексу (fallback — по консонантному скелету
  `stripNiqqud`); на строку — массив `{surface, niqqud}`. Резолв берёт niqqud из data-модели
  независимо от видимости колонки.
- **`resolveWordLight(surface, niqqud)`** → `{word,niqqud,root,binyan,pos,meaning,pealim_id,
  channel,confidence,status,pealimUrl,pealimDirect}`. Оркестрация переиспользуемых pure-функций:
  - unit = `{pos:"",binyan:"",lemma:"",stem:"",root:null,niqqud,sampleWord:surface,kind:null}`;
  - `pickBaseParadigm(unit, InflectionDict.lookup)` → baseParadigm;
  - `resolveContentUnit(maps, unit, baseParadigm)` → meaning/pealim_id/trueRoot/channel/conf/status;
  - функц.слова: `PealimFunctionLinks.lookup/getForm` (standalone) → профиль + прямой линк;
  - линк: pealim_id → прямая Pealim-страница, иначе honest-search (порт `v3WordCardBestPealimUrl`-логики).
- **Провенанс-метки (R1):** channel `form-first`/conf≥0.85 → «точно»; conf 0.6–0.84 → «вероятно»;
  status `review`/conf<0.6/нет meaning → «подобрано»/«не определено офлайн» (никогда не угадываем);
  функц.слово → «служебное слово».
- **Опц. онлайн «Уточнить (Dicta)»** (S2): consent-gated серверный morph-вызов; дефолт офлайн.

### 2. Word-wrap трансформ (Room-only, пост-рендер)
В `reader-morph.attach(mount,{getRow})`: для каждой видимой `he`/`niqqud` ячейки перестроить
innerHTML, оборачивая word-токены в `<span class="rm-w" data-row-idx data-w-idx role="button"
tabindex="0">`, разделители — escapeHtml-текстом (**точный текст+RTL сохранены**, textContent
неизменён). Спаны — только хит-таргет; резолв-данные из row-модели.

### 3. Тап-семантика (R4) + конфликт с аудио
- `reader-core.attachRowAudio` получает опцию `tapToHearExcludeCols:['he','niqqud']` → he/niqqud
  ячейки больше НЕ играют строку (свободны под word-tap); ▶-кнопка + translit/ru = играют строку.
  (Изменение в attach-функции — НЕ в builder, НЕ parity-gated.)
- reader-morph: делегированный click/Enter на `.rm-w` → `resolveWordLight` → bottom-sheet карточка.
- **Дефолт:** тап ивр.слова = карточка; тап перевода/транслита/▶ = озвучка.

### 4. Карточка-UI (R4, mobile-first RTL @380px)
**bottom-sheet** (не popover — нет overflow): слово+никуд крупно · root · биньян · POS · ru ·
провенанс-бейдж · «Открыть на Pealim ↗» · «Подробнее → Студия» (deep-link `index.html`).
Закрытие: повторный тап / Esc / тап-вне / свайп-вниз. CSS-блок в `library.html` (380px RTL, dark).

### 5. i18n / SW
- i18n namespace `room.morph.*` (ru/en/he, HE best-effort).
- bump `public/sw.js` CACHE_VERSION (shell изменён). Precache — малые JS (`reader-morph.js`,
  `inflection-dict.js`, `notes-autogen.js`, `pealim-function-links.js`); **дикт .json.gz НЕ precache**.

## Файлы
- NEW `public/js/reader-morph.js`
- `public/js/library-ui.js` (после openReader → `readerMorph.attach`; `tapToHearExcludeCols`; lazy-load)
- `public/js/reader-core.js` (опция `tapToHearExcludeCols` в `attachRowAudio`; builder НЕ трогаем)
- `public/library.html` (CSS + `<script>` + i18n keys)
- `public/i18n/locales/{ru,en,he}.js` (`room.morph.*`)
- `public/sw.js` (CACHE_VERSION + precache)
- NEW `scripts/premium/reader-morph-smoke.js` + `package.json` (`smoke:reader-morph`)
- NEW `tests/premium/readerMorph.test.js` (Node-юнит S0)
- **index.html — НЕ ТРОГАТЬ.**

## Reuse (НЕ писать с нуля)
`inflection-dict.js` (ensureReady/lookup) · `notes-autogen.js` (`window.NotesAutoGen`:
buildResolverMaps/pickBaseParadigm/resolveContentUnit/formFirstResolve/offlineMeaningLookup/
resolveTrueRoot/stripNiqqud/normVowels — pure, dual-export Node) · `pealim-function-links.js`
(standalone) · `reader-core.attachRowAudio` (расширить опцией) · логика `v3WordCardBestPealimUrl`.

## Фазировка
- **S0 — резолвер-ядро:** `reader-morph.js#{tokenize,alignTokens,resolveWordLight,provenanceLabel}`
  + Node-тест `tests/premium/readerMorph.test.js` (грузит реальный .gz датасет в Node, резолвит
  известные слова end-to-end: шалом→мир, гомограф→form-first, неоднозначн.→«подобрано»/null; +
  токенайзер/выравнивание/label — pure).
- **S1 — UI:** word-wrap + тап-вайринг + bottom-sheet + CSS + i18n; `attachRowAudio` exclude-cols.
  @380px RTL скрин (норма CLAUDE.md).
- **S2 — провенанс+онлайн:** полиш + opt-in «Уточнить (Dicta)» (consent) + гейт
  `smoke:reader-morph` (Playwright: тап→карточка, офлайн-резолв при блок-сети, R1-честность,
  @380px, 0 pageerror).
- **S3 — ship:** SW bump → commit → push (main→Coolify) → **PROD-верифи** linguistpro.kolosei.com.

## Гейты (зелёные перед push)
`smoke:reader-parity` (builder не тронут — ДОКАЗАТЕЛЬСТВО) · NEW `smoke:reader-morph` ·
`smoke:corpus-nav` 33 · `smoke:corpus-room` 18 · `smoke:room` 14 · `smoke:room-mode` 23 ·
`audit:autogen-quality` (резолвер не задет) · `test:api-smoke` · @380px RTL скрин · R1: 0 «точно» на угадке.

## Verification (e2e)
1. `node --test tests/premium/readerMorph.test.js` · `node scripts/premium/reader-morph-smoke.js`.
2. `npm run smoke:reader-parity` PASS (builder байт-идентичен).
3. Локально: library.html → Корпус → baked-работа → тап ивр.слова → карточка; тап перевода → озвучка.
   Playwright @380px RTL скрин до `git add`.
4. PROD после push: те же шаги на linguistpro.kolosei.com.

## Design-дефолты (рекоменд.)
Офлайн-first резолв (form-first спайн; MorphProvider+Dicta opt-in) · bottom-sheet @380px ·
he/niqqud=карточка, translit/ru/▶=озвучка · v1 read-only (БЕЗ vocab-save/SRS/цвет-статуса —
следующие шаги BRR-P1-009/007) · index.html не тронут.

## Статус-лог
- 2026-06-11: recon + дизайн утверждён; реальные API сверены; начат S0.
- 2026-06-11: **S0–S3 КОД ОТГРУЖЕН** (commit `6d1582f`, SW `v3.10.23-room-morph`, push→main).
  Гейты зелёные: `readerMorph.test` 14/14 · `smoke:reader-morph` PASS · `smoke:reader-parity`
  PASS (builder байт-идентичен) · corpus-nav 33 · corpus-room 18 · room 14 · room-mode 23 ·
  `audit:autogen-quality` 0 R1 · `test:api-smoke`. **Сверх плана:** определённый артикль הַ —
  strip артикля + gemination-dagesh (הַשַּׁחַר→«заря, рассвет» точно; הַמֶּלֶךְ→царь точно), вариант
  выигрывает ТОЛЬКО если решительнее (no false-strip: הָר/הָיָה корректны). Реал-Зал проверен
  локально (148 слов в 16 he-ячейках, тап→карточка, 0 pageerror).
- 2026-06-11: **PROD-ВЕРИФИЦИРОВАНО** на linguistpro.kolosei.com (SW `v3.10.23-room-morph`):
  тап `הַשַּׁחַר` на реальном тексте Зала → карточка «точно» / «заря, рассвет» / корень שחר /
  существительное / Pealim-линк; 0 pageerror; @380px RTL скрин снят. **BRR-P1-011 ЗАКРЫТ.**
  **NEXT (keystone разблокировал):** цвет-статус слова (BRR-P1-009) → «следующий для тебя» i+1
  (BRR-P1-007). Возможные полиши v1.1: opt-in «Уточнить (Dicta)» для proclitic/инфлектированных
  форм (напр. הָאָרֶץ сейчас «подобрано»); «Подробнее → Студия» deep-link; per-form audio в карточке.

## Параллельно / висит
Бейк (127/24641, пишет `.tmp`) — публикация baked-порции (d) фоном, без конфликта.
🔑 Security (висит): ротация AUDIO_UPLOAD_TOKEN + Gemini + старый GCP TTS-ключ.
