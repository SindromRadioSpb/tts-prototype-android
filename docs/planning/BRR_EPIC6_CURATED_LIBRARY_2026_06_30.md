# BRR — Эпик 6: Curated Library (recon + Wave-план)

> **Step-0 measure-before-code recon.** Создан 2026-06-30, заземлён против живого кода на `HEAD d811c83` (прод v3.11.55). Канон бэклога — `docs/planning/BRR_UX_AUDIT_2026_06_25.md` §Эпик 6. Роли: **R6 (lead — куратор-библиотекарь)** · R9 (authority-control / honest provenance) · R7 (литературовед, для editorial-волны).

## §0. Цель эпика

Превратить «Корпус» из **metadata-dump** в **curated-библиотеку**: per-work source-атрибуция, реальная страница автора (era/QID), reader-header контекст (автор/эпоха/регистр), честный roadmap/offline-moat framing, editorial entry-points. Планка — Pealim/Reverso по честности провенанса (R9: derived≠asserted; никогда не фабриковать).

## §1. Что есть СЕЙЧАС (заземлено, не по памяти)

Открытая работа корпуса показывает в ридере **только заголовок** (`library.html #readerTitle`; `openReader` ставит лишь `titleEl.textContent`). Ни автора, ни эпохи, ни регистра, ни ссылки на источник. На карточках (rail/L3/поиск) — только текст автора + honesty-бейджи `rs`/`audio` (`corpusProvBadge` library-ui.js:3816); PC-9 этой сессии добавил **тап-ссылку на имя автора** → `corpusNavToAuthor` (это навигация в drill, НЕ атрибуция и НЕ landing). Source-атрибуция существует лишь как один глобальный футер-стринг (`room.footer.source`). L2-список авторов «голый» (имя + ✓ready + счётчик; `renderAuthorRow` ~4789); резолвнутый Wikidata-QID лежит в каталоге (`author_qid` / `authors[].qid`), но до строки не доезжает. «Позже» (не-ready) = голая пилюля (`room.corpus.later`) + ⏳, без roadmap-framing. Offline-moat в UI нигде не surfaced.

### Модель данных (источник истины — `db/premium/corpusMeta.js`)
Per-work метаданные живут в `source_meta_json.corpus` (versioned sub-object, R6 storage Option A — zero migration). Поля: `author`, `author_uri` (Wikidata QID URL), `era`, `register`, `genre`, `provenance{source,url,license,reviewer,reviewed_at}`, `attribution`, honesty-enums `review_status`/`audio_status`. Контролируемые словари: `REGISTER = [literary, spoken, archaic, poetic, mixed]`, `ERA = [biblical, rabbinic, medieval, haskalah, tehiya, mandate, modern, contemporary]` (era — suggested vocab, может быть `unknown`/null).

### ⚠ Корректировки over-claim'ов хэндоффа (поймано grep'ом)
1. **«QID via corpusMeta.js» — неверно.** `corpusMeta.js` (Node-only) лишь **валидирует** форму URI (`WIKIDATA_QID_RE`). QID извлекается продюсером (`build-corpus-catalog.js:qidNum` + `lib/benyehuda.js:firstQid`) и **шипается предвычисленным** как `author_qid` в карточке каталога и `authors[].qid` в индексе. Для UI это всё равно «уже-хранимые данные».
2. **`provenance.url` НЕ в лёгком каталоге/карточке.** Он в per-work бандле `works/<id>.json` → `source_meta.corpus.provenance.url` (и в OPFS `source_meta_json.corpus` после импорта), плюс **детерминированно** `https://benyehuda.org/read/<byehuda_id>` (`benyehuda.js:200`). Поэтому на карточке ссылку придётся **выводить из id** (честно — продюсер использует ровно этот шаблон), а в ридере — читать из `source_meta_json.corpus`.
3. **roadmap/offline-moat «copy» — это НОВЫЙ микрокопирайт**, не «хранимые данные». Дёшево и без sign-off, но технически новый контент (не pure-surfacing) — не смешивать в одну категорию с атрибуцией.

### 🔑 Ключевой рычаг
`readerCore.openText(textId)` **уже возвращает** `res.text.source_meta_json` (`getTextByIdLite` тащит все колонки кроме `source_text`). Значит **одна** новая поверхность (reader-subtitle) даёт **две** находки сразу (reader-header-context P2 + per-work source-attribution P1), для canon И corpus-открытий, с нулём новых данных и нулём sign-off.

## §2. Волновой план (split by sub-finding)

### Wave-1 — ship-now (чистый surfacing, БЕЗ sign-off/нового контента)
| # | Находка | P | Что показать | Где (живой код) | Данные |
|---|---|---|---|---|---|
| **W1-a** | reader-header-context **+** per-work source-attribution (combined) | P2+P1 | под `#readerTitle`: автор · era-chip · регистр · «Источник: Проект Бен-Иегуда ↗» | `library.html` (+`#readerSubtitle`) · `library-ui.js openReader` (~2595) | `res.text.source_meta_json.corpus` (уже возвращается) |
| W1-b | per-work attribution на карточке | P1 | дискретная source-ссылка | `renderCorpusWorkRow` ~4920 / `renderCorpusCard` ~271 / `renderWorkCard` ~197 | вывести `benyehuda.org/read/<id>` из `card.id` (gate: corpus-origin) |
| W1-c | author-row QID + era-chip | P2 | Wikidata-ссылка + эпоха на строке автора | `renderAuthorRow` ~4789 | `authors[].qid` (уже в индексе) |
| W1-d | roadmap-framing / offline-moat микрокопи | P3 | честный «перевод позже»-roadmap + offline-moat строка | `room.corpus.*` i18n | **новый** микрокопирайт (×3 локали), без sign-off |

### Wave-2 — deferred (нужен авторинг + R7-sign-off; НЕ этой сессии)
- `author-landing-page` (P2): offline-honest форма (имя + era-chip + counts + дискретная QID-ссылка) можно сейчас; **rich-форма** (life-dates) блокирована — нужен online Wikidata или новое producer-поле → даты defer.
- `editorial-entry-points` / `literary-reading-order` (P2/P3): ручной editorial-авторинг (R7/R6) на ~50–100 QID-якорей → контент владельца + sign-off (defer, как 3b).

## §3. Инварианты (симптом → guard)

- **R9 honest provenance:** показывать ТОЛЬКО присутствующие поля; `era=unknown`/`register=null` → честно скрыть (не печатать «unknown»). Source-link = «Проект Бен-Иегуда» (public-domain, хранится). era/register = derived/curatorial.
- **Parity-safe (R4):** reader-subtitle — sibling `#readerTitle` в post-render chrome, НЕ внутри parity-locked table-builder. `smoke:reader-parity` обязан остаться зелёным; `index.html` не трогать.
- **openReader общий для canon + corpus + personal:** гейт на наличие `corpus`-объекта → personal/non-corpus текст рендерит пустой subtitle (self-hide), без фабрикации.
- **Derive `benyehuda.org/read/<id>` ТОЛЬКО для corpus-origin карточек** — иначе peer/personal текст получит выдуманную source-ссылку.
- **Dark-mode gating:** субтитр стилизуется через theme-переменные (`--text-secondary`/`--bg-muted`/`--border-soft`), НЕ литеральные цвета → dark наследуется без отдельного блока (избегаем ungated-dark-течёт-в-light).
- **applyI18n glyph-strip:** субтитр строится динамически через `tt()` (не `data-i18n`-узел) → глиф ↗ впекаю в JS, re-apply его не трёт.
- **Logical line-break:** автор / эпоха / регистр / источник — каждый своя inline-группа → перенос между группами, не посреди фразы.

## §4. Гейты + version-triad

Pre-commit Room-набор (8): `smoke:reader-parity` · `smoke:i18n` · `smoke:reader-scaffold` · `smoke:reader-morph` · `smoke:reader-context` · `smoke:corpus-room` · `smoke:corpus-vocab` · `smoke:finished-guard`. W1 задевает i18n (новые ключи ×3 локали) и ридер-chrome → `smoke:i18n` + `smoke:reader-parity` критичны.
Version-triad (вместе): `package.json:3` + `public/sw.js:32` (CACHE_VERSION) + `public/library.html` `#roomFooterVersion`. Текущая v3.11.55 → следующий шип **v3.11.56**.

## §5. Этой сессией

**W1-a (reader-subtitle) — SHIPPED v3.11.56.** Даёт обе находки P1+P2 одной поверхностью, ноль sign-off. Поверхность: `#readerSubtitle` (sibling `.reader-bar`) ← `setReaderSubtitle(res.text)` из `source_meta_json.corpus`: автор · era-chip · register-chip · «Источник: Проект Бен-Иегуда ↗». Гейты (8) зелёные; 380px light+dark верифицировано (автор RTL + 2 чипа + source-link, 0 pageerror).
**Adversarial-review (code-reviewer) поймал и пофикшено:**
- **HIGH:** `tt()` возвращает СЫРОЙ КЛЮЧ на промахе локали → `if(rl)`-гард не скипал out-of-enum register (corpusMeta хранит register как free-string → структурно достижимо). Fix: `REGISTER_ENUM.includes()`-гейт + miss-safe `lbl(key,fb)` (`v!==key`).
- **MEDIUM:** source-link fallback'и были мертвы по той же причине → `lbl()`.
- **LOW:** era мог печатать сырой slug при упавшем `corpusRoot` → скип `etitle===c.era`; + комментарий-точность.
**Deferred-polish (known-minor):** субтитр не ре-рендерится на live-смену языка (нет `data-i18n` → applyI18n его не трогает, что и защищает глиф ↗; но register/«Источник» остаются в старой локали до переоткрытия ридера). Низкая ценность (язык в сессии редко меняют mid-read), консистентно с прочими динамическими reader-элементами → defer.

Затем по согласию — W1-b (card-attribution) / W1-c (author-row QID+era) / W1-d (roadmap/moat copy) как отдельные adversarial-reviewed инкременты. Wave-2 (author bios/dates, editorial order) — отдельный sign-off-трек, не сейчас.

---

## §6. ПРЕМИУМ-СЕВЕР + BUILD-ONCE АРХИТЕКТУРА (role-lens investigation 2026-06-30)

> Запрос владельца: «довести до премиального состояния ОДИН раз, чтобы не возвращаться к полировке постоянно; стоит ли повторное ролевое исследование?» → проведён 4-агентный grounded role-lens прогон (R6+R9 authority · R4 surfaces · R5+R7 market/editorial → scope-discipline критик). Все claim'ы ИЗМЕРЕНЫ против живого кода. **Вердикт по исследованию: больше НЕ нужно** — три линзы сошлись на одном минимуме, прецеденты у проекта уже есть; дальнейший research только раздул бы бэклог (анти-цель). Вместо research — ~1-час producer-SPIKE (верификация, не исследование).

### §6.1. Север (что значит «премиально/готово»)
«Curated library» = **курируемый литературный imprint**, не дамп из 26 455 строк. Каждый автор/работа/коллекция — **стабильный УЗЕЛ по durable-id (QID)**; вся человеческая курация висит на узлах **как данные, не как код**. Открыл работу → byline-ссылка на реальную страницу автора (эпоха · даты · 1-строчная справка · Wikidata-якорь · «23 работы в Зале»), одинаковую из L2/поиска/ридера. Каждое курат-поле несёт provenance-тег **derived / asserted / curated** (планка честности Pealim/Reverso). **Offline-moat = дифференциатор**: весь editorial-слой запечён в shipped-файлы и работает офлайн в кармане — у Sefaria/LingQ/Yiddish-Book-Center всё online-only. «Готово» = imprint выглядит премиально на ЛЮБОМ покрытии курации (пустые слоты само-прячутся, паттерн W1-a `if(!any) hidden`) → 1% и 80% курации одинаково премиальны, контент только растёт.

### §6.2. Граница finishable ↔ perpetual (контейнер vs содержимое) — ключевой вывод
- **FINISHABLE (проектируется ОДИН раз, замораживается + гейтится → ОСТАётся готовым):** identity-модель (QID author/work/collection узлы) · curated/editorial DATA-схема + slot-контракт · merge-guard `curated>asserted>derived` · НАБОР поверхностей (один byline-renderer + author-landing + общий intro-слот) · authority build-gate.
- **PERPETUAL по природе (НЕЛЬЗЯ называть «готовым»):** биографии · «зачем читать»/significance · reading-orders · коллекции · темы · difficulty · era/date-правки · описания. Тысячи авторов × 26 455 работ — растёт вечно. **Единственное честное утверждение про контент:** «каждое добавление стоит как первое — одна data-строка, ноль кода, ноль re-gate, защищено guard'ом от re-bake» — НЕ «контент завершён».
- **Причина recurring-returns СТРУКТУРНА:** контент сейчас конфлантится с кодом — у курации нет id-стабильного дома, переживающего re-bake (продюсер регенерит весь каталог из CSV+era-map+эвристик; author-index keyed by **display-name**), а byline переписан INLINE на 4–5 поверхностях. Каждое добавление поля/правки → редактируешь каждую поверхность + re-screenshot 380px = «беговая дорожка полировки». Это тот же clobber-класс, что проект уже знает ([[feedback_shared_idempotency_key_equal_fidelity]] · [[feedback_upsert_preserve_columns]] · [[feedback_no_override_grounded_reading]] бекр→скот).

### §6.3. МИНИМУМ build-once архитектуры (квартет — единственное, что останавливает возвраты)
1. **Durable identity + curated DATA-дом (M):** промоутить УЖЕ вычисляемую QID-keyed запись автора в first-class sidecar `corpus-authors-v<N>.json` + поднять ОДИН curated/editorial namespace keyed by {author QID, work id/content_hash, collection-id} (зеркало versioned-additive паттерна `corpusMeta`). В том же шаге: id-join author-rows индекса **по QID** (схлопнуть измеренную **14-QID фрагментацию** — один человек = несколько «авторов»). UI биндить по QID, не по имени.
2. **Re-bake precedence guard (M):** `curated > asserted > derived` + per-ENTITY source-тег, enforced в продюсере. Механизм, делающий «переприменить правку» невозможным by-construction. Лифт собственного do-no-harm урока проекта (бекр→скот / LEAN-clobbers-RICH / UPSERT-preserve) на курацию. **ДОЛЖЕН быть ДО любого обогащения, иначе обогащение само и есть clobber.**
3. **ОДИН shared byline/intro-slot renderer + author-landing контейнер (M):** схлопнуть 4–5 inline byline-реализаций (`renderWorkCard`:179 · `renderCorpusCard`:271 · `setReaderSubtitle`:2597 · `corpusProvBadge`:3870 · `renderCorpusWorkRow`:4974) в ОДИН renderer + общий editorial-intro слот (обобщить `renderShelf`:232) + author-landing header (QID+era+dates+counts+intro-слот). Дальше новое поле/bio = одна data-правка через один путь. Room-only, parity-safe.
4. **Authority-consistency build-gate (S):** расширить существующий `lies→process.exit(1)` (build-corpus-catalog.js): каждый QID индекса → ровно один узел; нет фрагментации; precedence держится; per-entity source present. Дешёвый keystone, держащий пп.1–2 enforced (именно так 14-фрагментация накопилась незаметно).

### §6.4. GOLD-PLATING — что НЕ делать (это и есть защита от «бесконечной полировки»)
- ✂️ **CUT: Wikidata SPARQL bulk-import.** ⚠ **Корректирует stale-claim §2 этого дока** («даты блокированы — нужен online Wikidata/новое producer-поле»): даты УЖЕ В РЕПО — `public/data/benyehuda/author-era-map-v1.json` несёт `{era,birth,death,floruit,confidence,source}` для **847/847 авторов (100%)**, keyed by QID, а `build-corpus-catalog.js:149-152` читает только `.era` и **выбрасывает остальное**. Author-landing с датами = почти-бесплатный «промоутить, что уже считаем», а НЕ deferred online-зависимость. (Опц. описания/occupations — позже, additive, после guard'а.)
- ⏸ **DEFER: work_uri / work-QID** — нет консьюмера; спекулятивный future-graph. Не пинить identity, которую не к чему валидировать.
- ⏸ **DEFER в perpetual: collections[] поле + shelfMeta-curated-collection/series TOC + reader chapter-handoff SURFACE** — это net-new L-capability, НЕ останавливает churn; reader-handoff пересекается с Эпиком 5 (пусть Эпик 5 владеет).
- ✂️ **CUT: desktop master-detail IA** — чистое surface-gold-plating для этой цели; width-clamp адекватен.
- ✂️ **Mostly CUT: рендер difficulty/theme scaffolding СЕЙЧАС** — типы запинены+валидны, но 0/796 заполнено; рендерить когда данные появятся.
- ✂️ **TRIM: полная per-FIELD provenance+confidence матрица** → entity-level source-тег + горстка реально-override-имых полей (era/register/author/bio) достаточно.
- 📝 **NOTE: W1-d roadmap/moat микрокопи** = одноразовый NEW-content copy-drop (×3 локали), НЕ build-once архитектура — шипать дёшево отдельно.

### §6.5. Секвенция (lock-the-architecture, потом контент течёт additively)
1. **HOME:** bump `CORPUS_SCHEMA_VERSION` + поднять QID-keyed curated/editorial sidecar namespace (зеркало corpusMeta versioned-additive + validateCorpus-style honesty-gate).
2. **IDENTITY (до любого import):** промоутить author-era-map → first-class authors-sidecar; id-join индекса по QID; схлопнуть 14-фрагментацию. Узел стабилен ДО того, как что-то к нему крепится.
3. **GUARD + POLICE (до любого контента/обогащения):** precedence-merge + per-entity source в build-corpus-catalog.js + расширить `lies→exit(1)` authority-инвариантами.
4. **SURFACE CONTRACT:** ОДИН shared byline/intro renderer; ретрофит 5 поверхностей + author-landing на него. Гейт `smoke:reader-parity` + `smoke:i18n` + 380px light/dark; index.html не трогать. **Здесь W1-b/W1-c приземляются как ЧАСТЬ контракта** (не bolt-on inline).
5. **THEN контент течёт additively, вечно, без кода/re-gate:** bio на ~50–100 canon-QID · why-read на ~796 ready-works first · reading-orders/collections как sidecar-строки · themes/difficulty батчем · era/date-правки как curated-override под guard'ом.

### §6.6. ⚠ Расширение скоупа за пределы Room-only
Квартет (особенно пп.1,2,4) трогает **producer/publish-слой** (`build-corpus-catalog.js`, `corpusMeta.js`, `shelfMeta.js`, re-publish над 26K, `publish-corpus-batch` skill), а не только Room-UI. Это больше прошлых Room-only инкрементов. Pre-flight = **~1-час producer-SPIKE** (верификация, не research): эмитнуть authors-sidecar + прогнать precedence-merge + новый authority-gate над полным 26K → подтвердить ноль фрагментации + ноль clobber на реальных данных, ДО UI.

### §6.7. Один-строкой (вердикт критика)
**Да — расширять Эпик 6, но построив ОДНУ вещь первой:** QID-keyed curated-data слой (author/work/collection sidecar) + re-bake precedence guard `curated>asserted>derived` + authority build-gate + один shared byline/slot renderer; промоутить даты авторов, которые УЖЕ есть офлайн (не тащить из Wikidata), и дальше каждый bio/intro/order растёт как защищённые данные. **Этот квартет — единственное, что останавливает возвраты к полировке; всё остальное — perpetual-контент, который нельзя называть «готовым».**

---

## §7. ЗАШИПЛЕНО — build-once квартет (Increments 1–3, v3.11.55→57, 2026-06-30)

> Spike (verification) `docs/research/epic6-authority-spike/2026-06-30/` подтвердил blueprint на реальных 26K (фрагментация 14, **95.9% дат офлайн**, Q0-мердж 7 людей) → построен квартет, каждый инкремент adversarial-review'нут субагентом (поймал реальный баг в каждом), все гейты зелёные, prod-verified.

### Increment 1 — QID author authority node + gate (v3.11.56 prod-side, `20ad315`)
- **`db/premium/authorNodes.js`** (pure) — `buildAuthorNodes(index, eraMap)` схлопывает name-keyed per-era индекс в ОДИН узел на Wikidata-QID: промоутит даты из era-map (которые build:150 выбрасывал), **исключает Q0-sentinel** (мерджил 7 разных людей), co-author только по `;` (vav/comma = 44 false-positive surname'а, измерено), per-field prov `derived/asserted/partial`. `validateAuthorNodes` с **независимым works/ready/refs-оракулом** (зубы гейта — рег­рессия агрегации не пройдёт даже если lockstep совпал).
- **`scripts/premium/build-author-nodes.js`** — standalone эмиттер `corpus-authors-v7.json` (846 узлов, 96% дат, из shipped-индекса, без полного ребилда) + нативная эмиссия в `build-corpus-catalog.js` (lockstep, root `authors_file`).
- **Гейт `smoke:corpus-authority` (23)**. Бонус: починен stale `corpus-nav-smoke` (FB-волна).

### Increment 2 — curated editorial namespace + precedence guard (`ba7889e`)
- **`db/premium/editorialMeta.js`** — отдельный committed curated-store keyed by стабильный id; merge на derived authority с precedence `curated>asserted>derived` + per-field source; **anti-clobber by construction** (store не ре-деривится → re-bake не затрёт). `corpus-editorial-v1.json` ШИПИТСЯ ПУСТЫМ (контент — под sign-off). **Гейт `smoke:corpus-editorial` (19)** (validate-зубы + precedence + pure no-mutation + honest-null + no-op-on-empty).

### Increment 3 — author-landing surface + L2 life-years (v3.11.57, `881dfdd`)
- **`library-ui.js`** — `loadCorpusAuthors()` (lazy qid→merged-node Map, single-flight, retry-on-fail) + L3 **author-landing header** (`buildAuthorHeader`: display · era-chip · life-years BCE-aware · counts · self-hiding curated intro-slot · discreet Wikidata-link) + L2 per-row life-years (`decorateAuthorRows`). Parity-safe (post-render chrome). i18n `room.corpus.author.*` ×3.
- **Adversarial-fix M1:** header-count из КЛИКНУТОЙ L2-строки (= что листает страница), НЕ из QID-агрегата (Bialik 500 не 507 — не обещать недостижимое); +retry-on-transient-fetch; +nowrap; +UI-direction-name. Все 8 гейтов + 380px light/dark + prod-verify.

### §7.1. Payload (build-once достигнут)
Добавить bio/one_line/entry_points/why-read/collection/era-override = **одна data-строка в `corpus-editorial-v1.json`** (keyed by QID/id) под R1/R7-sign-off → рендерится через готовый slot, защищён precedence-guard'ом от re-bake. **Ноль кода, ноль миграций, ноль re-gate, ноль re-polish.** Это и есть «не возвращаться».

### Increment 4 — full L2 collapse-by-QID + scoped-search by identity (v3.11.58, `555c4dd`)
Снят блок W4. **Producer:** search-rows получили `q` (author-QID, Q0-filtered) — `build-corpus-catalog` emit + standalone `scripts/premium/build-search-qid.js` (derive в shipped `corpus-search-v7` через (era,name)→index-qid join, 90% rows, без полного ребилда; native+standalone дают идентичный q). **UI:** `corpusFilter.scopeAuthorQid` + `corpusScopeAuthorPass` (scoped-search по QID → ловит ВСЕ name-варианты/co-authored, name-fallback); `collapseEraAuthors` схлопывает index-rows по реальному QID (works/ready-сумма, blocks-union, display из узла; Q0/name-only отдельно); `renderCorpusAuthors` async (awaits sidecar→collapsed list, graduated re-sort по merged-totals); `renderCorpusWorks` фильтр по `w.author_qid`; `corpusNavToAuthor`→collapsed-entry. `CORPUS_SEARCH/AUTHORS_DATA_REV` бьют force-cache на content-change внутри v7 (offline-safe → нет stale-empty). **Adversarial-review:** ship-ready; применён M1 (НЕЗАВИСИМЫЙ manifest-`author_qid` oracle в гейте — не index-join деривера; locks by-name↔by-qid reconciliation) + L3 (graduated re-sort). **Live-verify:** Bialik (Q359705) 2 строки→1 (507 работ merged), НИ ОДНОГО «A; B» composite в списке, L3 листает все 507 by-QID (header reconcile), 0 pageerror, 380px light+dark. Гейт `smoke:corpus-authority` 28/28 (+search-q coverage/validity/index-lockstep/manifest-oracle).

### §7.2. Сознательно ОТЛОЖЕНО (отдельные инкременты, с причиной — НЕ забытое)
1. ✅ **СДЕЛАНО (Increment 4, выше):** полный L2-list collapse-by-QID — был блокирован W4 (`corpus-search` без qid); снят добавлением `q` в search-sidecar + scoped-search/collapse по QID.
2. **Shared-byline-renderer консолидация** (свести 5 inline-byline'ов `renderWorkCard`/`renderCorpusCard`/`renderCorpusWorkRow`/`setReaderSubtitle`/`corpusProvBadge` в один) — maintainability-рефактор НАД только что отполированными (PC-1..12 + FB-1..21) поверхностями; риск регресса полировки без user-visible выигрыша → отдельный аккуратный инкремент (поверхности по отдельности уже премиальны — user-facing долга нет).
3. **W1-b** (source-link на карточке) — clutter-риск vs PC-2 de-noise (W1-a уже даёт per-work атрибуцию в ридере) → hold. **W1-d** roadmap/moat микрокопи — отдельный content-drop.
4. **Wave-2 контент** (author bios/life-dates-prose, why-read, editorial collections/reading-orders) — perpetual; HOME + slots готовы → дропается как данные под sign-off.
