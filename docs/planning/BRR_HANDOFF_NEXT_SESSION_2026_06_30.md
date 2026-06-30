# BRR — Handoff следующей сессии (Reading Room)

> **Снимок состояния верифицирован 2026-06-30** против живого кода на `HEAD d811c83`. Версия и карта кода — точные на эту дату; перепроверяй версию перед шипом.

---

## §0. CURRENT STATE (authoritative)

- **Прод:** `https://linguistpro.kolosei.com` · живёт **v3.11.59** · git **HEAD `a1005ff`** на `main` · рабочее дерево чистое (кроме служебного `.remember/remember.md`).
  - **2026-06-30 (code-wins, v3.11.59 `d4086e4`):** **Эпик 9 karaoke auto-scroll re-engage fix** (latch больше не умирает на сессию — резюмит центрирование когда playing-row вернулся в central-band, с hysteresis: re-arm только после того как row реально ПОКИНУЛ band → нет yank на peek-ahead; `library-ui.js` `onKaraokeRowChange`/`_karaokeRowFollowable`/`_karaokeLeftBand`) + **D7.1 study-day heatmap** (pure `ReaderMorph.studyHeatmap` fold over study_day ledger → GitHub-style grid по тапу на streak в train-summary; rest-days честно, future-excluded R11; `buildStudyHeatmap`+CSS+i18n `room.morph.study.heat*`×3; гейт reader-morph +11 asserts). Adversarial-review (H1 keyboard-activate toggle + M1 hysteresis applied). 380px light/dark, prod-verified.
  - **2026-06-30 (T6 draft, `a1005ff`):** **DRAFT canon-author bios** (11 фигур) на ревью владельца — `docs/research/epic6-author-bios/2026-06-30/draft-bios.json` (+README). НЕ в live-store (R1); validateEditorial ok 0/0, все QID→узлы. **Apply на approval:** перенести one_line/bio_md в `corpus-editorial-v1.json` + бамп `CORPUS_AUTHORS_DATA_REV` + гейты + deploy (zero UI). Render-slot (`buildAuthorHeader` one_line+bio_md) уже live. **🟢 Утверждённый порядок остатка (decision-pass workflow): T6-bios (draft готов→approve) → [3b recon — 2-й editorial ask, AFTER T6-loop] → W1-d copy (bundle с T6) → byline-renderer (opportunistic carrier для W1-b) → W1-b (conditional).**
  - **2026-06-30 (Increment 4, v3.11.58 `555c4dd`): ПОЛНЫЙ L2 collapse-by-QID + scoped-search by identity.** Снят блок W4: search-rows получили `q` (author-QID) → scoped-search по идентичности (ловит все name-варианты/co-authored) → L2-список схлопнут в ОДНУ строку на человека (`collapseEraAuthors`; Bialik 2→1 строка, 507 работ merged, ни одного «A; B» composite). Producer: `build-search-qid.js` (+`build:search-qid`) + native emit; UI `corpusFilter.scopeAuthorQid`/`corpusScopeAuthorPass`/`renderCorpusAuthors` async/`renderCorpusWorks` qid-filter; `CORPUS_SEARCH/AUTHORS_DATA_REV` cache-bust (offline-safe). Гейт `smoke:corpus-authority` 28/28 (+search-q + независимый manifest-oracle). Adversarial-review ship-ready (M1 oracle + L3 graduated-re-sort applied). 🎉 **Эпик-6 deferred item #1 (full-L2-collapse) ЗАКРЫТ.**
  - **2026-06-30 (ещё позже): 🎉 ЭПИК 6 BUILD-ONCE КВАРТЕТ ЗАШИПЛЕН (Increments 1–3, v3.11.55→57).** Spike-verified (`docs/research/epic6-authority-spike/2026-06-30/`) → Inc1 QID author-authority sidecar+gate (`20ad315`, `corpus-authors-v7.json` 846 узлов, Q0-excl, 96% дат, `db/premium/authorNodes.js`, `smoke:corpus-authority` 23) · Inc2 curated editorial namespace+precedence-guard (`ba7889e`, `db/premium/editorialMeta.js`, пустой `corpus-editorial-v1.json`, `smoke:corpus-editorial` 19) · Inc3 author-landing header (era·dates-BCE·QID·counts·intro-slot)+L2 life-years (`881dfdd`, `library-ui.js` `buildAuthorHeader`/`loadCorpusAuthors`/`decorateAuthorRows`). Каждый adversarial-review'нут (реальный баг в каждом, incl. M1 header-count-reconcile · Q0-merge · false-positive-co-author). **Payload:** добавить bio/collection = одна data-строка в `corpus-editorial-v1.json` (zero code/migration/re-gate). **ОТЛОЖЕНО (с причиной, см. план §7.2):** full-L2-collapse (блок W4 search-no-qid) · byline-renderer-консолидация (рефактор над полировкой) · W1-b/d · Wave-2 контент (под sign-off). План `docs/planning/BRR_EPIC6_CURATED_LIBRARY_2026_06_30.md §7`. **Version-triad теперь v3.11.57 → следующий v3.11.58.**
  - **2026-06-30 (ранее):** зашипован **Эпик 6 Wave-1 W1-a** — per-work reader-byline + source-attribution (`#readerSubtitle` ← `setReaderSubtitle` из `source_meta_json.corpus`: автор · era-chip · register-chip · «Источник ↗»). Закрывает per-work-attribution **P1**. Adversarial-reviewed (HIGH register-enum-gate + MEDIUM miss-safe label + LOW era-slug — пофикшено), 8 гейтов зелёные, 380px light+dark, prod-verified. План/состояние: `docs/planning/BRR_EPIC6_CURATED_LIBRARY_2026_06_30.md`. **Очередь Wave-1 (follow-ups, НЕ начаты):** W1-b card-attribution (⚠ взвесить против PC-2 de-noise — clutter-риск) · W1-c author-row QID-link (era-chip на author-row НЕ тривиален — era per-work, не per-author) · W1-d roadmap/moat микрокопи (новый контент → owner-eyes на формулировки).
- **Surface:** «Читальный зал» (Ben-Yehuda Reading Room) — отдельная поверхность над общим OPFS-движком.
  - **Room-only зона правок:** `public/library.html` + `public/js/library-ui.js` + `public/db/local-db.js`.
  - **PARITY-LOCK (не трогать):** `public/index.html` + `public/js/reader-core.js` — байт-паритет к index.html, гейт **`smoke:reader-parity`**. Любой коммит, касающийся ридера, обязан прогнать этот гейт.
- **Старый handoff `docs/planning/BRR_HANDOFF_NEXT_SESSION_2026_06_28.md` — ШАПКА УСТАРЕЛА** (пишет v3.11.42, не верь его версии и не доверяй его «следующему шагу»). **НО его §0–§5 (durable code-map / invariants / gates / deploy-инфраструктура) по-прежнему валидны и переиспользуемы** — этот документ их НЕ дублирует (40КБ), а ссылается. Открывай §0–§5 за фундаментальной инфраструктурой; шапку и version-header игнорируй.

---

## §1. Что зашипано В ЭТУ СЕССИЮ (не переделывать)

Две премиум-полиш-программы над поверхностью «Корпус». Обе Room-only, parity-safe (`smoke:reader-parity` зелёный).

1. **Полиш КАРТОЧКИ корпуса — PC-1..12 SHIPPED** (v3.11.48–51). План: `docs/planning/BRR_CORPUS_CARD_PREMIUM_POLISH_2026_06_29.md`. Де-шум провенанса + labeled coverage + difficulty-outline + clean-title + геометрия/CLS + tap-focus + поэзия-тег + длина.
   - **DEFERRED P3:** PC-13 scroll-affordance, PC-14 save-to-list-on-rail, PC-15 desktop-verify.
2. **Полиш БЛОКА фильтра/сортировки + полка «✓ Прочитанные» — FB-1..21 ВСЕ SHIPPED** (v3.11.52–55). План: `docs/planning/BRR_CORPUS_FILTERBAR_POLISH_2026_06_29.md`. Все 21 пункта.

**Headline-запрос владельца этой сессии:** «нет user-friendly способа увидеть уже прочитанные тексты» → решено **DB-native полкой «✓ Прочитанные»**.
**ВАЖНАЯ архитектурная причина (записать, чтобы никто не «упростил» обратно в чип-фильтр):** «прочитано» НЕ может быть `corpusFilter`-чипом. Карточки корпуса ключуются по catalog `id`; БД ключуется по `text_id`/`text_key`; строки `corpusSearch` `{id,t,a,e,g,l,r}` НЕ несут `text_key`; `finished_at` живёт в OPFS-БД по `text_id`. Мост строится через `corpusReadyKeyMap()` (это **урок W4**). Поэтому полка отдельная, а не чип.

Прежние эпики (done + прод): **Эпики 1·2·3a·4(+Phase D D1–D7)·5(W1–W5 graded-momentum)·7·8.**

---

## §2. Карта кода новых компонентов (v3.11.48–55)

Все символы grep/Read-верифицированы на `HEAD d811c83`; имена точные. Файлы: `public/db/local-db.js` · `public/js/library-ui.js` · `public/library.html` · `scripts/premium/finished-texts-guard-smoke.js`.

### (A) Полка «✓ Прочитанные» (read-texts shelf)
| символ | место | назначение |
|---|---|---|
| `getFinishedTexts(limit=12)` | local-db.js:2827 | DB-native список: JOIN text_progress WHERE finished_at IS NOT NULL ORDER BY finished_at DESC; **зеркалит guard'ы getContinueReading** (CANON_ORIGIN + is_archived=0 + last_row_idx>0) — это FB-2 anti-leak. |
| `setTextFinished` / `clearTextFinished` | local-db.js:2782 / 2795 | узкий UPSERT — трогает ТОЛЬКО `finished_at`+`updated_at` (UPSERT-preserve) / сбрасывает в NULL. **Manual-only** (FB-3). |
| `finishedReadBadge(item)` | library-ui.js:3302 | ≥95% → `✓ прочитано` (.finished-done); иначе `отмечено · N%` (.finished-partial). Честно, без overclaim. |
| `renderFinishedCard(item)` | library-ui.js:3310 | `.work-card.finished-card`; открывает по живому local id (resume); угол `↩ снять отметку` → clearTextFinished → обратно в «Продолжить». |
| `injectFinishedReading(body)` | library-ui.js:3345 | строит полку `.corpus-finished` из getFinishedTexts(RAIL+1); самоскрытие при пустоте; «Все» → openFinishedAllSheet. |
| `openFinishedAllSheet()` | library-ui.js:3373 | bottom-sheet полного списка (getFinishedTexts(500)) + бейдж + un-mark. |
| `injectHomeRails(body)` | library-ui.js:3580 | порядок: corpusRails → savedSearches → readingLists → bookmarks → **injectFinishedReading(3585) → injectContinueReading(3586)**; оба prepend → «Продолжить» сверху, «Прочитанные» прямо под ней. |
| Continue dismiss-✓ + undo | library-ui.js:3246–3276 | внутри рендера карточки «Продолжить»: кнопка `.continue-done` ✓ → setTextFinished + invalidateFinishedSet, убирает карточку (захватывает sib/sec/secSib); undo-замыкание clearTextFinished + re-home; через roomToast(...,«Отменить»,undo). |
| `roomToast(msg, actionLabel, actionFn)` | library-ui.js:1835 | FB-4: 2-арг = plain (2.2s), 3-арг = action-кнопка `.room-toast-action` (5s). |

### (B) Полиш фильтр-бара
| символ | место | назначение |
|---|---|---|
| `buildCorpusFilterBar()` | library-ui.js:4529 | FB-6: recents `.corpus-recents` смонтированы прямо под input, НАД фасетами (4557–4562); фасеты `.corpus-facets` получают `role=group` aria «Фильтры корпуса» (4564); advWrap role=group (4634). |
| `paintRecents()` | library-ui.js:4350 | FB-6 лейбл `🕘 Недавние запросы` (4357) vs «Популярные запросы»; clear-history c undo через roomToast. |
| `syncGear` (closure) | library-ui.js:4616 | читает **ЖИВОЙ** corpusFilter (exactForm+hasAudio+reviewed+genre+lang) → обновляет `⚙ N` + `.on` + aria; FB-8/FB-11; возвращает isActive (держит ряд открытым). |
| readable short label | library-ui.js:4590–4591 | FB-15: видимое `📖 Читаемые` (`room.corpus.facets.readableShort`); полное «Читаемые для меня» + i+1-хинт едут в aria-label/title. |
| `buildFacetSelect(key,labelKey,counts,labelFn,onChange)` | library-ui.js:4671 | native `<select>` фасет (genre/lang); опции = гистограмма desc со счётчиками; handler ставит corpusFilter[key], тоггл `.on`, refresh body, затем `onChange()` (=syncGear) (4679). |

### (C) L1 сортировка + счётчик + empty-state
| символ | место | назначение |
|---|---|---|
| `corpusL1Sort = 'ready'` | library-ui.js:135 | FB-9 порядок просмотра: 'ready'(ready-first+alpha) \| 'alpha' \| 'length'. |
| `corpusL1Len(h, readyMap)` / `corpusL1Comparator(mode, readyMap)` | library-ui.js:3943 / 3944 | ключ длины (сегменты из readyMap) / компаратор (ties по title localeCompare). |
| `buildL1SortControl()` | library-ui.js:3950 | `.corpus-sort` segmented control (`role=group`); кнопки `.corpus-sort-btn`; только для no-query browse с >1 хитом (3996). |
| `renderResultsInto(body)` «N из M» | library-ui.js:3967; countText 3989–3991 | FB-14: non-query фасет сужает un-scoped корпус → `N из M` (M=corpusSearch.length); иначе plain N / «По названию: N». |
| empty-state `emptyReadable` | library-ui.js:4036–4037 | FB-13: readableOnly && readableSet.size===0 → честный empty i+1 (`stateBoxNode(...,'🌱')`). |

### (D) Finished-бейдж на строках/карточках корпуса
| символ | место | назначение |
|---|---|---|
| `_finishedSet = null` | library-ui.js:3065 | single-flight кэш finished **catalog id**. |
| `ensureFinishedSet()` | library-ui.js:3066 | getFinishedTexts(500) → мост DB `text_key`→catalog id через **corpusReadyKeyMap()** (урок W4); non-ready → нет бейджа (честно). |
| `invalidateFinishedSet()` | def 3080; **6 call-sites:** 2219, 2227, 3256, 3267, 3332, 3397 | чистит кэш на каждом изменении finished-состояния. |
| `_finishedBadgeNode(node)` | library-ui.js:3084 | per-node покраска `.finished-read-badge` `✓ прочитано`, если data-work-id ∈ set; идемпотентно. |
| `decorateFinishedBadges(container)` | library-ui.js:3091 | post-pass по `.work-card[data-work-id], .corpus-work-row[data-work-id]`. |
| `renderCorpusWorkRow(card, openable, opts)` | library-ui.js:4920; data-work-id 4921 | строка результата корпуса несёт `data-work-id` (якорь бейджа). work-card тоже (renderWorkCard:279). |

Wiring: renderResultsInto добавляет строки с per-row `_finishedBadgeNode`, затем `ensureFinishedSet().then(decorateFinishedBadges)` (4022–4023, 4031) — FB-20 покрывает и пагинацию «показать ещё», и гонку async-set.

### (E) Гейт
`scripts/premium/finished-texts-guard-smoke.js` (60 строк, 8 тестов) — статический source-гейт (без браузера/OPFS; wa-sqlite headless-unsafe). FB-2 anti-leak (getFinishedTexts несёт CANON_ORIGIN + COALESCE(is_archived,0)=0 + last_row_idx>0 + finished_at IS NOT NULL + ORDER BY finished_at DESC — guard от утечки «150 Глаголов»); FB-3 manual-only (`readerAtEnd`/`maybeShowEndOfText` НЕ вызывают setTextFinished; всего call-sites setTextFinished === 2).
**Wired в pre-commit как `smoke:finished-guard`.**

### (F) CSS добавлено (library.html)
`.corpus-finished .shelf-head` 693 · `.finished-card`/.title 699–700 · `.finished-done`/`.finished-partial` 701/706 (dark 715/717) · `.finished-read-badge` 703 (dark 704–705) · `.room-toast-action` 973/977/980 · `.corpus-l1-controls` 528–530 · `.corpus-sort`/`-btn`/`.on` 519/520/525 · **`[hidden]` guard'ы** (`.corpus-facet-chip[hidden]` 369, `.corpus-facets-advanced[hidden]` 406, `.corpus-search-clear[hidden]` 425, `.corpus-recents[hidden]` 448) · `select.corpus-work-genre` chevron 536 (RTL flip 542, focus 400) · `.corpus-scope-chip .scope-x` 470 / `.scope-label` 471.

---

## §3. Гейты + деплой

### Pre-commit для Room-работы — owner-named обязательный набор (8):
```
npm run smoke:reader-parity && npm run smoke:i18n && npm run smoke:reader-scaffold && \
npm run smoke:reader-morph && npm run smoke:reader-context && npm run smoke:corpus-room && \
npm run smoke:corpus-vocab && npm run smoke:finished-guard
```
- `smoke:reader-parity` (**Browser**) — GOLDEN байт-паритет reader-core.js ↔ index.html. Падает → паритет сломан.
- `smoke:i18n` — симметрия локалей ru/en/he; ловит SW-locale-stale / raw-i18n-key.
- `smoke:reader-scaffold` — честность adaptive-niqqud-fade (только exact/likely в SAVED-состоянии, никогда unseen/guessed).
- `smoke:reader-morph` (**Browser @380px**) — офлайн-движок грузит 3.3МБ Pealim, form-first + гомограф-дизамбигуация, R1-честность.
- `smoke:reader-context` (**Browser, network**) — Tier-3 Dicta-бейдж + честная деградация; exit 0 (skip) если Dicta недоступна.
- `smoke:corpus-room` (**Browser**) — реальная library.html против shipped-каталога: вкладка «Корпус», openable-карточки `role=button`, честный провенанс, материализация в OPFS + warm-reader.
- `smoke:corpus-vocab` — i+1 sidecar lockstep с latest corpus-catalog-v<N>; JOIN-KEY `pid:<digits>` (R1 без выдуманных лемм).
- `smoke:finished-guard` — read-shelf FB-2/FB-3 (см. §2E).

**Доп. гейты — прогоняй те, что задевает твой diff:** `smoke:reader-word-status`, `smoke:reader-notes`, `smoke:reader-resume`, `smoke:bookmarks`, `smoke:corpus-nav`, `smoke:corpus-snippet`, `smoke:corpus-catalog`, `smoke:room`, `smoke:room-mode`, `smoke:reader-tier3-regression` (R11 do-no-harm, бекр→«скот» fix). Аудиты (не commit-гейт): `smoke:reader-morph:audit` (R10 precision vs Dicta-silver), `smoke:reader-cloze:audit`.
Browser-гейтам нужен свободный `localhost:3000` (сами поднимают сервер) + установка Playwright-браузера на первом прогоне.

### Деплой + version-bump ТРИАДА (двигать ВМЕСТЕ каждый шип):
1. `package.json:3` → `"version": "3.11.NN"`
2. `public/sw.js:32` → `const CACHE_VERSION = "v3.11.NN";` — **обязателен при ЛЮБОМ изменении shell/locale/index/library.html**, иначе SW отдаёт stale precache (сырые i18n-ключи). (`GRAPH_CACHE_VERSION` sw.js:60 — независим, не трогать.)
3. `public/library.html:1428` → `id="roomFooterVersion" ...>v3.11.NN`

Все три = **v3.11.59** сейчас; следующий шип = `3.11.60` / `v3.11.60`. (Гейты Эпика 6: `smoke:corpus-authority` [+search-qid+manifest-oracle], `smoke:corpus-editorial`; producer `npm run build:author-nodes` + `build:search-qid` после правок `authorNodes.js`/индекса/`q`. При изменении content `corpus-editorial-v1.json`/`corpus-authors`/`corpus-search` ВНУТРИ catalog-v7 → бамп `CORPUS_*_DATA_REV` в library-ui.js, иначе force-cache отдаст stale.)

**Flow:** `git add -A && git commit -m "<msg>" && git push origin main` → GitHub webhook → Coolify авто-собирает Docker (root Dockerfile) → live (~1–3 мин). Ручного шага Coolify нет.

**Prod-verify = Node fetch с no-store (НЕ curl — Windows curl коверкает иврит → ложные провалы):**
```
node -e "const u='https://linguistpro.kolosei.com';(async()=>{for(const p of ['/sw.js','/library.html']){const r=await fetch(u+p,{cache:'no-store',headers:{'Cache-Control':'no-store'}});const t=await r.text();const m=t.match(/v3\.11\.\d+/);console.log(p,r.status,m&&m[0]);}})()"
```
Жди завершения Coolify-сборки перед верификацией. Ждём 200 + v3.11.NN на обоих.

**Норма:** verified-fix + зелёные гейты → commit AND push to main по умолчанию (Coolify авто-деплой), prod-verify после. Планы зеркалить в `docs/planning/`.

---

## §4. Инварианты и ловушки (симптом → guard)

- **UPSERT-preserve:** multi-path записи → узкий `ON CONFLICT DO UPDATE SET <owned cols>`; `INSERT OR REPLACE` стирает колонки чужих путей. Полка использует это (setTextFinished трогает только finished_at). + preserve-smoke.
- **[hidden]-vs-display:** author `display:inline-flex/flex/grid` на классе бьёт UA `[hidden]{display:none}` (author>UA) → элемент остаётся виден. Guard: `.cls[hidden]{display:none}` + assert COMPUTED display в smoke. (Уже добавлены 4 guard'а — §2F; ловится только 380px-скриншотом.)
- **Dark-mode gating:** dark-оверрайды ТОЛЬКО внутри `@media(prefers-color-scheme:dark)` И `body.theme-dark`; default-unset тема следует за OS → ungated dark CSS течёт в light.
- **applyI18n glyph-strip:** applyI18n перезаписывает `[data-i18n]` textContent → эмодзи/✓/глиф ВПЕКАЙ в i18n-VALUE либо снимай `data-i18n` с узла, иначе глиф исчезнет на re-apply локали.
- **Глобальный `button{width:100%}`** (mobile `@media max-width:600px` ~стр.2117 index.html): каждый новый контейнер кнопок → явное `width:auto` (ID побеждает; класс нужен `!important`).
- **Inline `style=` бьёт любой класс**; mobile `@media`-оверрайды нужен `!important` на `display`, т.к. компонентный CSS позже в файле выигрывает при равной специфичности.
- **headless-OPFS limit:** `importBundle` крашит wa-sqlite headless (мелкие записи ок) → ридер-фичи верифицируй logic-gate + parity + 380px-скриншот + owner-device live, НЕ headless full-bundle import. OPFS не персистится через reload → seed in-session.
- **corpus-id ↔ text_key мост (урок W4):** карточки по catalog `id`, БД по `text_id`/`text_key`, `corpusSearch` строки без text_key, `finished_at` в OPFS по `text_id` → мост через `corpusReadyKeyMap`. Поэтому «прочитано» НЕ может быть corpusFilter-чипом (архитектурно).
- **Logical line-break + i18n premium-UI:** любой новый strip/hint ломать на ЛОГИЧЕСКОЙ границе группы (per-line i18n-ключи + block-spans), никогда free-wrap посреди фразы.

---

## §5. Live-verify предостережения

- Тренинг/ридер-флоу (cloze/teach/MC/skip) live-verify на **ОДНОРАЗОВОМ baked-тексте** или engine-eval — НИКОГДА на реальном профиле владельца (skip/ответ пишут в SRS → soft-demote реальных слов).
- OPFS-зависимая верификация (read-shelf, finished_at, библиотека) — на **устройстве владельца / реальном непустом профиле**; empty-profile маскирует volume-jam регрессии (нужны single-flight + lazy fan-out).
- **Multi-tab read-lock:** OPFS-БД = single-writer; параллельные вкладки могут залочиться — верифицируй в одной вкладке.
- **Browser-freshness:** PWA SW precaches shell → unregister+reload не всегда свежо; дожми тост «Обновить»/hard-reload + проба свежести (SW auto-skipWaiting с v3.11.37 → first-reload pickup).

---

## §6. Session-specific подводные камни (recover full detail из планов §1)

Три бага этой сессии, пойманные на 380px/ревью. Полные write-up'ы — в `BRR_CORPUS_CARD_PREMIUM_POLISH_*.md` / `BRR_CORPUS_FILTERBAR_POLISH_*.md`; ниже — триггер→причина→fix→guard, чтобы не передиагностировать.

- **Поэзия-band reversal** (fix-коммит `10c5389`, v3.11.51): difficulty-band/сигнал для поэзии рисовался инвертированно (поэзия выпадала из шкалы легче/средне/сложнее, как проза). Fix: поэзию загнали В ТУ ЖЕ рамку легче/средне/сложнее. Guard: 380px-скриншот карточки + проверка direction-маппинга. Деталь — PC-план (difficulty-outline/поэзия-тег).
- **Chevron-class-collision** (FB): native genre/lang фасет-`<select>` получил кастомный chevron через background-image. Коллизия direction/позиционирования → выделенный селектор `select.corpus-work-genre` (library.html:536) + RTL flip background-position влево (542) + focus (400). Disambiguation = именно dedicated-селектор, не общий disclosure-класс.
- **Gear-stale-snapshot** (FB-8/FB-11): `⚙ N`-индикатор раньше читал кэш-снимок и устаревал при смене состояния фильтра. Fix: `syncGear` closure (library-ui.js:4616) читает **ЖИВОЙ** corpusFilter на каждом вызове и зовётся из `buildFacetSelect.onChange` (4679) — это паттерн **singleton-reset-on-entity-change** (сбрасывай loaded-state на смене состояния).

---

## §7. APPROVED-NEXT бэклог (порядок владельца)

**3b function-usage (P2) → Эпик 6 curated-library (P1) → Эпик 9 karaoke-UX (P2); опц. D7.1 (P3) + deferred PC-13/14/15.** Все — Room-only / parity-safe. Канон: `docs/planning/BRR_UX_AUDIT_2026_06_25.md`.

### 1) 3b — «Употребление» служебных слов (`card-function-usage`) · P2 · #1 по владельцу
R2(lead)·R1(sign-off)·R4·R9. Цель: служебные (של/את/ב/ל/מ/ש/על/עם…) несут curated *usage* (управление/падеж, коллокации, позиция), не голый глосс — планка Pealim/Reverso.
**HARD-blocker:** контента НЕ существует в коде — `reader-morph.js:288 functionGate()` отдаёт лишь честный глосс; `public/js/pealim-function-links.js` = только `{id,pos}`. Поэтому единственный безопасный первый шаг = **data-design recon → R1-авторская выборка ~10 образцов → sign-off владельца**. Код не приземляется до апрува (R1 curated≠fabricated).
**Measure-before-code (grep+read FIRST):** `docs/planning/BRR_EPIC3_PREMIUM_CARD_2026_06_26.md` §«Фаза 3b» (gating-вопросы) · `reader-morph.js` functionGate (~288, export ~1928) · `public/js/notes-autogen.js` FUNCTION_POS · `public/js/pealim-function-links.js` (текущий `{id,pos}`) · решить storage: curated `public/data/…` JSON (R9 provenance=curated) vs inline; частотный рейтинг top-N → `scripts/premium/build-corpus-vocab.js`.
**Stale-check:** план предшествует Phase D + Epic 5, НО его load-bearing claim («данных нет», functionGate=honest-gloss-only, links={id,pos}) **ВСЁ ЕЩЁ ИСТИНЕН в живом коде** — не stale, можно брать как есть.

### 2) Эпик 6 — curated library · P1 (наивысшая ценность набора)
R6(lead)·R9·R7. Цель: из metadata-dump в curated-библиотеку — per-work source-атрибуция, реальная страница автора (era/QID), reader-header контекст (автор/эпоха/регистр), честный roadmap/offline-moat framing, editorial entry-points.
**Split by sub-finding** (дешёвые честные wins кодируются СРАЗУ, без sign-off/нового контента — данные уже хранятся, не surfaced):
- `per-work-attribution` (P1) — `corpus.provenance.url` уже в каталоге/`corpusMeta.js`, показан лишь глобальный footer.
- `reader-header-context` (P2), `non-ready-roadmap-framing`/`offline-moat-surfacing` (P3 copy) — чистый surfacing/i18n.
- `author-landing-page` (P2) — QID резолвится для ~90% авторов в продюсере → offline-honest форма (имя + era-chip + counts + дискретная QID-ссылка). Blocker rich-формы: life-dates нужен online Wikidata / новое producer-поле → шипай offline-honest сейчас, даты defer.
- `editorial-entry-points`/`literary-reading-order` (P2/P3) — нужен ручной editorial-авторинг (R7/R6) на ~50–100 QID-якорей → контент владельца + sign-off (defer, как 3b).
**Measure-before-code:** `library-ui.js` renderAuthorRow(~4789), corpusNavToAuthor(~4384), L2 author-list(~4727 «lean: name+✓ready+count» = gap), per-card provenance(~197/304/3814 corpusProvBadge) · `db/premium/corpusMeta.js` · `scripts/premium/build-corpus-catalog.js` (ERA_META ~56–73, qidNum/firstQid ~129–150) · `public/data/benyehuda/corpus-index-v7.json` (какие per-work поля шипятся).
**GAP / Step-0:** ✅ ЗАВЕРШЕНО. Recon + **build-once АРХИТЕКТУРА (квартет) ЗАШИПЛЕНА** (Increments 1–3, v3.11.55→57; см. план §6 blueprint + §7 shipped, и §0-врезку выше). QID author-authority sidecar + curated editorial namespace + precedence-guard + author-landing surface + authority build-gate — всё live+prod-verified. **W1-a + W1-c (author-authority в ридере + L2/landing) поглощены квартетом.** **Остаётся (с причиной, план §7.2):** (1) ✅ **full-L2-collapse-by-QID — СДЕЛАНО (Increment 4, v3.11.58)**; (2) **shared-byline-renderer консолидация** (5 поверхностей) — maintainability-рефактор над свежей PC/FB-полировкой, без user-visible-выигрыша → отдельный инкремент; (3) **W1-b** card-source-link (clutter-hold) · **W1-d** roadmap-copy; (4) **Wave-2 контент** (bios/why-read/collections/reading-orders) — perpetual, HOME+slots готовы → дроп как данные под R1/R7-sign-off (бамп `CORPUS_AUTHORS_DATA_REV` при правке `corpus-editorial-v1.json`).

### 3) Эпик 9 — read-aloud / karaoke UX · P2
R4(lead)·R8·R10-a11y. Цель: сверх уже зашипованного непрерывного караоке — тап ЛЮБОЙ строки → сделать её current + replay-only-it + показать перевод; auto-scroll держит активную строку в центральной полосе (re-engage после того как пользователь устаканился); spotlight/dim неактивных.
**Blocker:** внешних нет — self-contained, без контента/sign-off. **База непрерывного караоке уже зашипована — не переделывать.**
**Measure-before-code:** `reader-core.js` playAll(~636), onRowChange/notifyRow(~427–431), nextPlayableIdx — движок **уже есть** · `library-ui.js` auto-scroll latch: karaokeUserScrolled/karaokeActive(~2018), onKaraokeRowChange+center-scroll(~2029–2042), toggleReadAloud(~2048), setReadAloudBtn(~2020).
**Подтверждённый ЖИВОЙ баг (аудит):** ~2042 `pause=()=>{if(karaokeActive)karaokeUserScrolled=true;}` + ~2035 `if(!karaokeActive||karaokeUserScrolled)return;` → как только пользователь скроллит, auto-scroll **больше не re-engage'ится** в рамках сессии (сброс только на toggle-start ~2049). Tap-to-activate + spotlight кода НЕТ. Требования: `docs/planning/BRR_READING_UX_REQUIREMENTS_2026_06_15.md` P1#7/P1#9/P2#12.
**STALE-FLAG:** `docs/planning/BRR_P1_008_KARAOKE_2026_06_14.md` как build-план **УСТАРЕЛ** — D1–D4 (playAll/stop/onRowChange/nextPlayableIdx, Read-Aloud button, auto-scroll, `.row-playing`) **уже зашипованы**. Берущий Эпик 9 НЕ переделывает BRR_P1_008 — только residual (tap-row / scroll-re-engage / spotlight). Аналогично REQUIREMENTS P0#4 и #11(mark-finished) уже done (FB-1 + Epic 5).

### 4) D7.1 — heatmap study-day активности · P3 (опц., в любой момент)
R5. Цель: месячный heatmap habit-loop из существующего `study_day`-леджера. **Blocker: нет — данные уже собираются**, чистый render, низший риск.
**Measure-before-code:** `public/db/local-db.js` getStudyDays/recordRecall/noteAvailable (rows ≈ `{day,recalls,available}`), миграция 059 study_day в `public/db/migrations.js` · `public/js/reader-morph.js` streakView/streakFromDays (уже фолдят те же rows — переиспользовать data-path). Stale: нет, определён как опция в `BRR_UX_AUDIT_2026_06_25.md` §Эпик 4.

### 5) Deferred PC-13/14/15 · P3 (отложены этой сессией)
Источник: `docs/planning/BRR_CORPUS_CARD_PREMIUM_POLISH_2026_06_29.md`. PC-13 scroll-affordance (R4; rail 796 работ нечитаем, `scrollbar-width:none` → стабильный peek/soft-edge fade или «Все 796 →»; anchor library.html:133–135 `.shelf-rail`, buildRailSection ~3092–3104). PC-14 save-to-list на rail-карточке (R6; renderCorpusCard ~268 + openListPicker ~4508; взвесить против ≤3-чип лимита PC-1). PC-15 desktop-verify @1024/1920 (нужен desktop-screenshot harness — Kapture не resize'ит, owner-device/Playwright).

### 🟢 Рекомендация (одним лучшим следующим шагом)
**Старт 3b — но первый deliverable = data-design recon + R1-авторская выборка → sign-off владельца, НЕ код.** Владелец ранжировал #1, и единственный безопасный вход = именно этот measure-before-code артефакт (scope top-N служебных, предложить curated-JSON схему, hand-author ~10 образцов под R1-ревью). Этот recon И ЕСТЬ то, на чём 3b заблокирован → делает его — разблокирует эпик. Честно про blocker сразу: сессия выдаёт recon+sample, но **код не приземляется до sign-off контента** (R1 curated≠fabricated). Не обещать same-session ship.
**Параллельный/fallback код-трек (если владелец не хочет авторить контент сейчас):** **Эпик 6 Wave-1 дешёвые честные wins** — `per-work-attribution`(P1) + `reader-header-context` + roadmap/moat copy: чистый surfacing уже хранящихся данных (`corpus.provenance.url`, QID через corpusMeta.js/build-corpus-catalog.js), без нового контента и sign-off, премиум-ценность сразу (их Step-0 = создать недостающий `BRR_EPIC6_*.md`). Эпик 9 и D7.1 тоже полностью разблокированы, если хочется low-friction код-таски. **Эпик 9 не бери «как план», пока мысленно не дисконтировал stale `BRR_P1_008` до residual'а.**

---

## §8. Рабочие нормы (держать планку)

- **Роли-линзы R1–R11 — АВТО** для любого продукт/качество-решения (канон `docs/PROJECT_ROLES.md`); новую роль — ПРЕДЛОЖИТЬ владельцу до внедрения.
- **Measure-before-code (R10):** сперва замер → план + развилки → владелец решает. Не кодить fix до аудита. Проверить stale-план vs живой код: grep/Read названный файл/ключ ПЕРВЫМ.
- **Adversarial-review КАЖДЫЙ компонент** через `pr-review-toolkit:code-reviewer` (или `/code-review`) ПЕРЕД commit — ревью этой сессии ловили реальные баги (incl. CRITICAL), не опционально.
- **380px-скриншот, light И dark**, перед любым UI-commit (Playwright `setViewportSize(380,844)` / MCP `browser_resize`) — СМОТРЕТЬ картинку до `git add`.
- **R11 do-no-harm / oracle-independence:** улучшение не перезаписывает верное grounded-чтение менее надёжным источником и не валидируется тем же источником, которому доверяет (Dicta-feature ≠ Dicta-oracle).
- **commit+push+prod-verify по умолчанию** после зелёных гейтов; планы → `docs/planning/`.

---

## §9. Открывать доки в этом порядке
1. **ЭТОТ handoff** (current state).
2. `docs/SESSION_STATE_BRR_2026_06_14.md` (консолидированное Room-состояние/гейты).
3. `docs/planning/BRR_UX_AUDIT_2026_06_25.md` (9-эпик программа).
4. Два плана этой сессии: `docs/planning/BRR_CORPUS_CARD_PREMIUM_POLISH_2026_06_29.md` + `docs/planning/BRR_CORPUS_FILTERBAR_POLISH_2026_06_29.md`.
5. Старый `docs/planning/BRR_HANDOFF_NEXT_SESSION_2026_06_28.md` **§0–§5** (durable code-map/инфра; **version-header УСТАРЕЛ — игнорировать**).
6. Под выбранный эпик — его план: 3b → `BRR_EPIC3_PREMIUM_CARD_2026_06_26.md` §Фаза 3b; Эпик 6 → создать `BRR_EPIC6_*.md` (recon, Step-0); Эпик 9 → `BRR_READING_UX_REQUIREMENTS_2026_06_15.md` (НЕ `BRR_P1_008`, он stale).

---

## §10. Прочее (cross-cutting, легко забыть)
- **Каталог корпуса:** тела работ — на прод-томе (НЕ в git); публикация baked-партии = skill **`publish-corpus-batch`** (snapshot→каталог v(N+1)→version-bump→гейты→bodies-first push→allowlist-commit→prod-verify). Текущая версия каталога — **v7** (`public/data/benyehuda/corpus-index-v7.json`) — чтобы публикация не двойнула bump.
- **Данные пользователя — в браузере (OPFS), НЕ на сервере.** read-state/прогресс на хосте не искать. На сервере только research-когорты + TTS-кэш.
- **Секреты** (`AUDIO_UPLOAD_TOKEN` / Gemini / GCP) — в env/`.env`, не в коде. (Открытый пункт из ранних аудитов: ротация AUDIO_UPLOAD_TOKEN — проверить статус.)
- Доменные не-Room гейты при необходимости: `npm run smoke:morph/quiz/crosstext`, `npm run test:api-smoke`, `npm run audit:note-fields` (R1-gate полей ②-заметок).
