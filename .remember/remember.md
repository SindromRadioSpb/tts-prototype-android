# R1 gold + tail-fix sweep DONE → NEXT R2 (газеттир имён) — handoff 2026-06-26

**★ READ FIRST (в порядке):**
1. `docs/planning/BRR_RESOLVER_TAIL_FIXES_2026_06_26.md` — план tail-fix + СТАТУС (L1–L5 SHIPPED, L4 targeted, **R2 = NEXT**). Главный документ для продолжения.
2. `docs/research/reader-morph-gold/2026-06-25/README.md` — gold-эталон + результаты (control 97.2% / tail). Артефакты: worksheet (размечен), report.json, LEGEND, annotation-summary.
3. `docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md` — action-план R1→R3→R2; **§R2** (источники: Wikidata + IAHLTwiki-NER + **KIMA** 27K топонимов; лицензии).
4. `docs/research/HEBREW_MORPHOLOGY_RESOLVER_RESEARCH_2026_06_25.md` — доказательная база (трибанки/модели/лицензии, [ВЕРИФ]/[ОПРОВЕРГНУТО]).
5. `CLAUDE.md` (вкл. новую секцию **«## Artifact storage rule»**) · `docs/PROJECT_ROLES.md` (R1–R10 авто).
Память: [[project_resolver_quality_research]] · [[feedback_artifact_storage_rule]] · [[project_brr_ux_audit]] · [[feedback_headless_opfs_playwright]] · [[feedback_test_with_nonempty_profile]] · [[feedback_curl_utf8_egress_myth]] · [[feedback_commit_push_deploy_default]] · [[feedback_studio_live_source_inline]] · [[feedback_sw_cache_version_bump]] · [[feedback_plans_in_repo]].
Проект = LinguistPro (Node PWA, иврит↔рус), прод https://linguistpro.kolosei.com (Studio `/index.html`, Зал `/library.html`). Непрерывный деплой: push в `main` → Coolify.

## STATE — main HEAD `323e1e3`, прод **v3.11.2** (SW + Room-footer прод-верифицированы)

### Эта сессия закрыла (полностью отгружено + прод-верифицировано):
**ЭПИК «Качество ядра морфологии»: R1 (измерение) + tail-fix sweep L1–L5.**

1. **R1 — золотой eval-харнесс (measure-before-code).** Расширил `scripts/premium/reader-morph-audit.js`:
   - `--worksheet=N` (npm `gold:worksheet`) — детерм. **гомограф-взвешенный** продьюсер TSV из baked-Бен-Иегуды (вокализован) для ручной разметки. Producer-фикс `ctxWindow`: окно центрируется на токене (8 «skip» прошлого батча не повторятся).
   - `--gold=<file>` (npm `gold:score`) — скорер vs ЧЕЛОВЕЧЕСКИЙ gold (НЕ Dicta). Verb-citation-aware (инфинитив↔3мс-прош по корню, bidir-subsequence); function/numeral/**propernoun** = no-lemma-required. ambig/skip = first-class. coverage X/N.
   - **Владелец разметил 172/180** (8 skip = контекст обрывался, теперь починено; 0 ambig). Артефакты в `docs/research/reader-morph-gold/2026-06-25/` (ТРЕКАЮТСЯ в git — не .tmp; см. [[feedback_artifact_storage_rule]]).
   - **Истинная картина:** «точно» — **control 97.2% (чистые) / tail 26.5% (гомографы)**; Nakdan-silver↔gold **86.7%** (silver врёт ~13% на архаике → прежние silver-числа = с шумом). Утечка = вокализ.-гомографы в 1 Pealim-ячейку.

2. **`--regold=<file>` (npm `gold:regold`) — РЕГРЕСС-ГЕЙТ.** Re-resolve размеченных gold-токенов LIVE текущим резолвером + re-score + Δ-к-baseline. Инвариант каждого рычага: **control 97.2% не падает.** Переиспользуемый гейт для ЛЮБОЙ будущей правки резолвера.

3. **Tail-fix sweep L1–L5 (всё Room-only, `reader-morph.js`; gold-gated; v3.11.1+v3.11.2):**
   - **L1** предлоги+суффикс → «предлог» (functionGate `finalToMedial` + базы לקראת/בשביל + flat מעלי*/סביב*; over-trigger измерен пробой и обойдён).
   - **L2** числительные → numeral (NUM_GLOSS + `NUM_NOUN_HOMOGRAPH`-гард: הַמֵּאָה «век» ≠ сотня — поймал 1-токен регрессию до шипа).
   - **L3** наречия-гомографы → демоция «точно»→«вероятно»+alt (переиспользует `CONTEXT_GLOSS`; Tier-3 доразрешает по Dicta).
   - **L4** ОПРЕДЕЛЁННЫЕ причастия (артикль ה субстантивирует) → демоция (детект: article-strip + AP-*-cell-match через pidMap; **без parity-core**). Голый глагольный бейнони (כּוֹתֵב) держит «точно»; опред. сущ. (הַסֵּפֶר) не тронуты.
   - **L5** имена → propernoun honest-empty (seed-список `NAME_PROPER`; +1 проклитика).
   - **ИТОГ vs human gold: tail precision 26.5%→54.5% (+28pp), honest-recall 45.2%→79.2% (+34pp), control 97.2% ДЕРЖИТСЯ сквозь весь sweep.**

### Скорер-уроки (durable, в коде + LEGEND):
- Глагол: резолвер цитирует ИНФИНИТИВ (ללכת), gold — 3мс-прош (הלך) → сравнение по КОРНЮ (bidir-subsequence, weak-letter-толерант). Сняло 18 ложных минусов.
- Функц.-класс (предлог/частица/наречие/местоим./союз) + числит. + имя = НЕТ Pealim-леммы → lemma не требуется (иначе верный предлог/имя метятся «неверно»). Поправило baseline honest-recall 49→45.2% (был раздут).

## NEXT — R2: ПОЛНЫЙ газеттир имён собственных (рекомендован владельцем)

**Зачем:** имена частотны в литературе Бен-Иегуды; seed-`NAME_PROPER` (≈40 имён) ловит только очевидные (אֵירוֹפָּה/יַעֲקֹב). Полный газеттир закрывает целый класс хвоста (gold: 7 имён, seed взял 2; остаток = гомограф-имена + context-org).

**ЧТО (дата-задача, не правка алгоритма):**
1. **Источники (лицензионно-чистые):** Wikidata SPARQL (личные имена + гео, ивритские лейблы) · IAHLTwiki-NER (CC BY-SA, вложенный NER) · **KIMA** (открытый истор. ивр. газеттир: 27 239 топонимов / 94 650 вариантов / архаичные/библейские места — прямо про Бен-Иегуду). **НЕ ШИПИТЬ NEMO-данные** (нет лицензии).
2. **Сборка офлайн-списка:** выкачать → нормализовать (никуд-инсенситив, консонантный скелет) → дедуп → разделить на **UNAMBIGUOUS** (не общеслова → ассертить propernoun) vs **HOMOGRAPH** (שלום «мир»/Шалом, הלל «хвала»/Гилель, דוד «дядя»/Давид → ДЕМОЦИЯ «точно»→«вероятно»+«возможно: имя», как L3/L4, НЕ ассерт). Гард над общесловами обязателен (урок L1/L2: סביבה/המאה).
3. **Шип:** малый офлайн-список (как CONTEXT_GLOSS/seed) ИЛИ gz-датасет если крупный (как inflection-dict). Расширить `NAME_PROPER` (unambiguous) + новый механизм демоции для homograph-имён в `reader-morph.js`. Room-only.
4. **context-org имена** (הָעוֹבֵד газета, הַצּוֹפִים организация) — контекст-зависимы, СТАТИК не возьмёт надёжно → оставить Tier-3 или принять.

**ГЕЙТ:** каждый шаг через `npm run gold:regold` — **control 97.2% не падает**, имена в tail растут. Пробой потенциальных over-trigger (общеслова, омонимы-имена) ОБЯЗАТЕЛЕН (как в L1/L2/L4 — scratchpad probe.js по образцу этой сессии).
**Открытый вопрос (research, решить в начале R2):** покрывают ли CC-чистые источники архаичные/библейские ЛИЧНЫЕ имена (KIMA = топонимы; личные — Wikidata + возможно corpus-harvest)?

### Отложено (после R2 или параллельно):
- **Голые причастия-сущ.** (מְחַנֵּךְ «педагог», מַעֲצִיב) — без артикля офлайн неотличимы от глаг. бейнони → существующий **Tier-3 participle-soften** (Dicta-контекст). Править нечего.
- **R3 — спайк tiny-DictaBERT(45.2M)→ONNX→q4/q8→transformers.js Web Worker** = полностью офлайн контекст-разбор без сети/согласия. Decision-gated (влезает по размеру/латентности? кастомная multi-head арка не доказана). По плану был R1→R3→R2, но данные R1 сделали R2 дешевле/заметнее.
- **2-й gold-батч** (опц.) — producer уже чинён (ctxWindow); набрать ~150 строк на голые причастия/новые классы. Время владельца.

## НОРМЫ (рабочие)
Room-only: `index.html` + parity-locked `reader-core.js`-билдер НЕ трогать (`smoke:reader-parity`); резолвер = `notes-autogen.js` (pure core, lock-step с `build-notes-from-bundle.js`, гейт `autogen-parity`) + `reader-morph.js` (карточка/честный-лейбл/functionGate — Room-only, можно править). offline-first. **Artifact storage rule:** user-facing артефакты → ТРЕКАЕМЫЙ путь (`docs/research/<topic>/<date>/`), не только .tmp (CLAUDE.md). Прод-верифи Node-fetch no-store (НЕ Windows-curl). commit+push=деплой по умолчанию; **SW CACHE_VERSION + package.json version + оба футера (library.html ~823, index.html ~45416) бампить на любой shipped-правке reader-morph.js** (он в SW-precache, sw.js:96). measure-before/after-code (R10); развилка → варианты+рекомендация, владелец решает; volume-тест на большом профиле владельца.

## ГЕЙТЫ (зелёные сейчас)
`smoke:reader-morph` (+honest-empty propernoun) · `smoke:reader-context` · `smoke:autogen-parity --gate` · `smoke:reader-parity` · `npm run gold:regold` (control no-drop). Прогонять перед каждым push shipped-правки резолвера.

## КОМАНДЫ
`npm run gold:worksheet` (продьюсер N=180) · `gold:score` (скорер) · `gold:regold` (регресс-гейт) · `smoke:reader-morph` · `smoke:reader-morph:audit` (+`--tier3`).

---
Промпт для старта новой сессии (R2) — продублирован в ответе чата.
