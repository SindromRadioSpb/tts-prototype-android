# BRR Phase-2 — Проклитики на тапе: RECON + дизайн системы (под sign-off владельца)

> **Это measure-before-code артефакт, НЕ код.** Заземлён на живой код (прод v3.11.65) + замер против Dicta-silver (1283 формы) + 5-линзовая адверсариальная роль-критика. **Инвариант R11/R1: код не приземляется, пока владелец не утвердит политику и пороги.** Доказательная база: `docs/research/epic-proclitic-phase2/2026-07-01/` (харнесс + находки + полные роль-критики).

## §0. TL;DR — что прошу одобрить
Тап по слову с приклеенной **проклитикой** (ה ו ב ל כ מ ש) должен показывать «Употребление» этой приставки (3b-store уже есть), НЕ ломая разбор слов, где буква — корневая (בַּיִת «дом», ביחוד «особенно», **משה** «Моисей»). Это задача **морфологической СЕГМЕНТАЦИИ** (где граница слова), а не дизамбигуации гомографа. Я провёл замер вариантов и спроектировал **двухуровневую систему с воздержанием**. **Прошу решить 6 вопросов §8** (политика фоссилий · вес по частоте · источник gold · bake-time Dicta · роль R12 · приоритет) — и только потом код.

## §1. Проблема (и почему «латание» не работает)
- `בַּבַּיִת` = ב+ה+בית «в (этом) доме» → надо показать **ב** (и слитный артикль **ה**).
- `בַּיִת` = «дом» → ב КОРНЕВАЯ → показывать приставку НЕЛЬЗЯ (do-no-harm R11 + фабрикация R1).
- Существующий резолвер (`functionGate`) уже знает эту ловушку и СОЗНАТЕЛЬНО снимает только безопасные ו/ש; ל/כ/ה не трогает («ל+gerund=לִהְיוֹת», «ה+noun=הַשֵּׁם»). Phase-2 = безопасно РАСШИРИТЬ это.
- **Корпус усугубляет:** Бен-Йехуда = литературно-библейский регистр → плотность имён (משה→מ+שה «из ягнёнка»!), нарративного вав-перевёртыша (ויאמר = ו+глагол, но это НЕ союз «и»), архаичных инфинитивов (לאמר). Эти ошибки садятся на САМЫЕ частые, заметные токены — равномерная «точность» их прячет.

## §2. Замер (measure-before-code, R10)
Оракул-silver: Dicta `word` vs `stem` (разница ведущих букв = проклитика), 1283 уникальных проклитико-начальных формы из baked-корпуса. **⚠ Известный шум:** ктив мале/хасер (היישוב≠ישוב) — silver занижает верные ה.

| Вариант | Precision | Recall | Вывод |
|---|---|---|---|
| Наивный (только Pealim-stem) | 90.7% | 70.1% | 56 ложных — пробелы покрытия Pealim (ביחוד/באמת/имя מיכה/לאמר) |
| **Слоёный whole-word guard** (hspell∪Pealim∪имена∪функц.) | 94.6% raw (~97% после ктив-шума) | 69.8% | residual = лексикализ. наречия + гомографы |

**⚠ Критично (роль-критика поймала):** «~97%» НЕДОПУСТИМ как метрика — он валидирует (будущий Dicta-tier) офлайн против Dicta-silver = **круговой оракул** (та же ловушка, что [[feedback_independent_oracle_gate]] / баг בקר→«скот»). + одностороннее ктив-де-шумление (учли только промахи silver, не ложные срабатывания детектора). **Вывод: до кода нужен независимый gold-set, метрика пересмотрена (§6).**

## §3. Сравнение вариантов реализации
- **A. Экспорт снятой проклитики из резолвера** (резолвер уже стрипает для скоринга). Дёшево, но наследует жадность резолвера → over-segment (משה).
- **B. Словарный lookup (whole-word vs stem)** — backbone, идея владельца «сравнить с Pealim». 90.7%→~97% со слоёным guard. **Операционный слой.**
- **C. Огласовка (בְּ/בַּ)** — НЕ детектор существования (בַּיִת несёт родной патах!), только **tiebreaker сабметки артикля** при уже доказанной границе; нет на 43% корпуса.
- **D. Dicta-сегментация** — авторитетный оракул. Runtime (opt-in) ИЛИ **bake-time per-work asset** (стратегический ключ — корпус уже baked).
→ **Не один вариант, а СЛОЙ:** B (операционный) + D-bake (стратегический) + C (уверенность) + воздержание.

## §4. Финальный дизайн (двухуровневая система)
**Tier 1 — ОФЛАЙН (операционный, всегда, настроен на ТОЧНОСТЬ, воздерживается при сомнении):**
1. **Stage-0 do-no-harm guard:** слово ∈ лексикон (ktiv-robust skeleton, не точная поверхность) → НЕ показывать приставку. Убивает בית/ביחוד/מורה.
2. **Stage-1 — упорядоченная FSA-грамматика приставок (НЕ жадный стрип):** легальный автомат `ו?` (внешний, не дублируется) → подчинит. блок `{ש|כש|לכש|מש}?` (лексич. юниты, НЕ ל+כ) → артикль `ה?` (внутренний, после него ничего) → РОВНО ОДИН предлог {ב,ל,כ,מ}. Инварианты: ו только внешний · ה не перед приставкой · **מ не сливает артикль**. Перебор легальных парсингов → max lexicon-score остатка-основы · **ничья → воздержание** · **глубина ≥3 → Tier-3/воздержание** (короткий остаток → коллизии взрываются).
3. **Stage-2 — огласовка ТОЛЬКО как уверенность** (не существование): tiebreaker сабметки артикля для בכ"ל, дагеш-форте во 2-м согласном; нет огласовки → воздержание от claim артикля.
4. **Курируемый abstain-стоплист (ПЕРЕД стрипом):** фоссилии (באמת ביחוד בעיקר בעצם בכלל כדי לפי מפני כמו כאשר לכן) · **нарративный вав** (ויאמר/ויהי → подавить «и» или «повеств. вав») · архаич. инфинитивы (לאמר) · **מ-bias-to-abstain** (mishkal/причастие מורה/מקום).

**Tier 2 — DICTA (стратегический):**
- **Phase 3 (приоритет): bake-time per-work asset** — предвычислить на каждую baked-работу карту proper-noun/non-segmented/prefix-segmentation → suppression+segmentation overlay. **Убивает проблему имён + трение согласия + делает «офлайн-уверенно» реально авторитетным.**
- **Phase 4 (условно): runtime Tier-3** (opt-in, `reader-dicta.js`) узко для **un-baked текста + слитного артикля на неогласованном**.

**Честность карточки (невидимо для метрики, ловит R1):**
- **Слитный артикль ה** — только при подтверждении огласовкой, тег провенанса **«слитный · восстановлен из огласовки»** (это не записанный глиф); на неогласованном — «определённость не показана».
- **Выбор смысла из POS основы или sense-general:** инфинитивный ל≠дативный ל; вопросит. הֲ≠артикль ה; ש релятив/комплементайзер/каузал. POS неясен → перечислить смыслы («ב — предлог: в / на / посредством»), не утверждать один.

**Рендер (R4 — честные пиксели):** приставка = морфологический каркас, **никогда не gloss-строка, никогда не рядом с «Употребление»** (это значит «всё слово — служебное»). Порядок: заголовок-слово → тонкая strip-сегментация → доминантный разбор основы → свёрнутый chip-ряд «Приставки» (вторичный тон) → Pealim/семья. In-word подсветка `[בַּ][בַּיִת]` только на границах кластеров, hit-box ≥44px, **тинт hard-gated на offline-confident/Dicta**; неуверенно → «возможно приставка בְּ? · уточнить»; воздержание → ничего. Мультиклитика → ОДИН RTL-ряд-счётчик «Приставки (4): ו · ל · כְּשֶׁ · ה ›». Переиспользовать бейдж-лексикон (точно/вероятно/возможно/Dicta).

**Стратегический реврейминг ценности (R2/R5):** ценность ОБРАТНО частоте. Голые ב=в/ל=к/ה=the осваиваются за неделю → **подавлять/сворачивать** (учим против banner-blindness). Заметность — на **неочевидном меньшинстве:** слитный артикль (огласовка), ש-релятив, мультиклитика, מ-ассимиляция. **Это растворяет спор о полноте** — высокая recall на тривиальном классе НЕ нужна.

## §5. Роль-система + вердикт по R12
5 линз (R11 регрессия · R10 морфолог · R1 лексикограф · R4 UX · R2/R5 ценность) — все вернули **FIX-FIRST** (спина верна, заблокировано на метрике+грамматике+честности карточки).
- **R12 «морфо-сегментатор» — ВЕРДИКТ: СВЕРНУТЬ в R10, НЕ плодить пир-роль.** Каждая ценность R12 уже чья-то: грамматика/стэкинг/seg-precision → R10 (measure-before-code = буквально это); boundary-hallucination tripwire + независимость оракула → R11; «ב=в — лицензированная форма» + какая карточка → R1. Более тонкий лингв. УРОВЕНЬ ≠ другая ЛИНЗА при тех же методах. Минтить = анти-паттерн размножения ролей; норма [[feedback_propose_new_role_first]] → reject-as-peer. **Действие:** +1 пункт в R10 (клитический граничный анализ + политика воздержания) · R11 владеет never-segment tripwire · R1 — смысл/фоссилии · R4 — вето на surfacing уверенности. (Энклитики ЯВНО вне scope.)

## §6. Стратегия анти-регрессии + гейт `smoke:reader-proclitic`
- **Метрика (раздельно, не один скаляр):** existence-precision (показали клитику ∧ граница реально есть) **≥99%** (do-no-harm) · labeled-seg-precision (полная упоряд. последовательность + метки) **≥95%** · recall = негейтящий SLO ~65-70% (Tier-3/bake закрывают). **Recall НИКОГДА не давит на existence-планку.**
- **Независимый gold (блокирующее):** замороженный R1-выверенный ~300-500 токенов, niqqud-stripped под прод, стратифицирован (имена/вав/фоссилии/контент/архаика/глубина-стэка). Dicta-silver → только dev/recall. RAW + skeleton-normalized рядом (симметрично!).
- **Гейт-ассерты:** (1) **хард-негативная zero-tolerance fixture** — {בית ביחוד באמת בעצם בכלל בערך מיכה **משה מרים לאה לבן** מים שמן כלב לאמר כדי לפי מפני כמו כאשר לכן} → НОЛЬ приставок; (2) **top-200-частотный бэнд == 100%**; (3) **per-category полы:** имена ≥99.5% · функц/наречия ≥99% · контент ≥97%; (4) **аддитивность byte-parity** — разбор основы (root/binyan/pos/gloss/status/**paint-key**) идентичен с детектором on/off; (5) **split-rejoin parity** — textContent сабспанов == исходная поверхность; (6) **вав-перевёртыш suppress**; (7) **niqqud-absent abstain**; (8) **abstain-rate стабильность** (±X — ловит recall-chasing); (9) **CI oracle-independence** — silver-билдер и Tier-2-runtime не импортируют общий модуль.

## §7. Фазировка
- **Phase 0 — зависимость 3b «Употребление» ЗАШИПЛЕНА** (v3.11.64-65) ✅ — рендер переиспользует её store.
- **Phase 1 — независимый gold (~300-500, R1-выверен) + заморозить ктив-правило.** Никакой claim точности до этого.
- **Phase 2 — Офлайн MVP (даёт ценность):** Stage-0 ktiv-robust + FSA-грамматика + abstain-стоплист + огласовка-как-уверенность · **value-weighted abstain-heavy рендер** (заметно для слитн.артикля/ש/стэка, подавлено для голых частых предлогов) · in-word тинт gated на confident · гейт `smoke:reader-proclitic` (все ассерты §6). **Без runtime Dicta, без R12.**
- **Phase 3 — bake-time Dicta per-work overlay** (убивает имена, снимает согласие, «офлайн-уверенно»=авторитетно — высший рычаг).
- **Phase 4 — условный runtime Dicta Tier-3** (opt-in) узко для un-baked + слитн.артикль на неогласованном. Шип только если метрики Phase-2 заслужат.

## §8. Развилки (владелец решает)
1. **Политика фоссилий:** подавлять лексикализ. наречия (באמת/בעיקר/כמו/כדי) полностью, ИЛИ отдельная карточка «устойчивое выражение»? *Реко: отдельная мягкая карточка — честнее, объясняет.*
2. **Вес по частоте vs полнота:** принять R2/R5-реврейминг (голые ב=в/ל=к/ה=the сворачивать/подавлять), ИЛИ равномерно покрывать все 7? *Реко: вес по частоте — растворяет recall-спор, премиальнее.*
3. **Источник gold:** ин-хаус R1-выверка ~300-500 (ваше время), ИЛИ кросс-сорс с другим сегментатором (YAP/UDPipe-HE, дешевле/слабее)? *Реко: гибрид — авто-черновик кросс-сорсом → ваша/R1 выверка спорных.*
4. **Bake-time Dicta (Phase 3):** авторизовать предвычисление per-work overlay сейчас (front-load фикса имён, +build-asset+bake-runner), ИЛИ отложить на runtime opt-in? *Реко: да, authorize — это убивает класс имён надёжнее всего.*
5. **R12:** подтвердить **свернуть-в-R10 + R11-owns-tripwire** (рекомендация всех линз), ИЛИ узкая пир-роль? *Реко: свернуть в R10.*
6. **Приоритет:** синтез отмечает скромную ценность/высокую error-surface → советует ПОСЛЕ byline/W1-b/Wave-2. Вы явно выбрали Phase-2 сейчас — подтверждаете, или сначала независимый gold (Phase 1) как дешёвый де-риск, затем решение по объёму? *Реко: Phase 1 (gold) сейчас — дёшево, разблокирует честный замер; объём Phase-2 решим по числам.*

---
**Канон имплементера:** `reader-morph.js` (рендер+бейджи) · `notes-autogen.js`+`build-notes-from-bundle.js` (lock-step pure-core) · `reader-dicta.js` (Tier-3) · `reader-morph-audit.js` (расширить под гейт) · `BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (UX честности) · `function-usage.v1.json` (store «Употребление»).

---

## §9. СОСТОЯНИЕ + ТОЧКА ВХОДА СЛЕДУЮЩЕЙ СЕССИИ (обновлено 2026-07-01)

**Решения владелца ЗАФИКСИРОВАНЫ (AskUserQuestion 2026-07-01):** (1) gold-first · (2) **R12 свёрнут в R10** (+R11 tripwire +R1 смысл; канон `docs/PROJECT_ROLES.md` R10 уже обновлён) · (3) **вес ОБРАТНО частоте** (голые ב/ל/ה сворачивать; заметность слитн.артиклю/ש/стэку/מ) · (4) **bake-time Dicta авторизован** (Phase 3). Фоссилии→«устойчивое выражение» карточка. Gold-источник→гибрид. Владелец выбрал ЧЕКПОЙНТ (Вариант B) — продолжить в новой сессии.

**СДЕЛАНО:**
- **Phase-0** — зависимость 3b «Употребление» ЗАШИПЛЕНА (v3.11.64-65, store `public/data/usage/function-usage.v1.json`). Рендер проклитик переиспользует её.
- **Phase-1 — gold ЗАМОРОЖЕН + R1-выверен владельцем.** `docs/research/epic-proclitic-phase2/2026-07-01/gold-frozen.json` (332 строки: 251 проклитика / 81 «-»). Источник: `manual/gold-worksheet.r1-verified.tsv` + `manual/R1_PROCLITIC_GOLD_REVIEW_NOTES.md` (policy-вызовы помечены: vav-consecutive=ו но «нарратив не и»; инфинитивный ל non-dative; слитн.артикль בה/לה/וה где огласовка лицензирует). Producer `scripts/premium/build-proclitic-gold.js` (`build:proclitic-gold`; context-поле санитизируется — был TSV-quote-баг съедал 22 id, читать TSV как QUOTE_NONE/tab-split). **Замороженное ктив-skeleton правило:** niqqud-strip → finals-norm (ך→כ) → doubled-mater collapse (וו→ו, יי→י) — для membership/compare, не для показа.
- **Офлайн FSA-детектор ПРОТОТИПИРОВАН + ЗАМЕРЕН** vs gold: `detector-proto-v3.js` + `DETECTOR_FINDINGS.md`. **existence-precision 94.9% · labeled-seg 94.6% · recall 22.3%** (gold hard-weighted). **Do-no-harm ПРОХОДИТ:** имена/фоссилии/вав — 0 ложных приставок; בית/משה/מורה воздерживаются. Слитный артикль из огласовки (בַּ patach/qamatz→+ה) РАБОТАЕТ. **3 остаточных FP** (מתולעים/מסובלת причастия + לבינים) + низкая recall = **ПОКРЫТИЕ ЛЕКСИКОНА** (Pealim неполон; hspell-basic `public/morph/heb_morphology.bin` — это JSON но разрежен 34755, нет причастий; full-tier 87МБ), НЕ алгоритм.

**АЛГОРИТМ детектора (валиден, переносить):** skeleton → fossil-guard → **whole-word lexeme-guard** (lemmas ∪ names ∪ FUNCTION_GLOSS ∪ **verb/adjective-cells** — последнее ловит מ-mishkal/ה-binyan) → упоряд. FSA-peel `ו? → {לכש|כש|מש|ש}? → {ב|ל|כ|מ}? → ה?` с residual∈content + **воздержание** → слитн.артикль из niqqud (prep-vowel patach/qamatz → +ה). Verdict = строка приставок (напр. `בה`, `ולכשה`). Ключевой урок: whole-word guard на ВСЕХ Pealim-cells over-abstain (84 coincidental cell-collisions בזה/בים); только lemmas+verb/adj-cells.

**🔵 NEXT (Phase 3 — UNLOCK до ≥99, владелец авторизовал):** **bake-time Dicta per-work overlay producer.** Прогнать Dicta (`reader-dicta.js` ReaderDicta.analyzeSentence, как `reader-morph-audit.js`) по baked-работам (bake-runner типа `scripts/premium/run-corpus-prebake.js`) → на каждую работу карта `{token → {proper_noun?, prefix_segmentation, non_segmented?}}` → shipped per-work overlay (как audio/прочие per-work sidecars; НЕ в git, на том). Детектор: offline-FSA + overlay-lookup → overlay авторитетен (убивает FP-имена/причастия, поднимает recall до ≥99 existence). **Затем:** формализовать детектор как pure-модуль (новый `public/js/proclitic-segment.js` или в notes-autogen, lock-step) + гейт `smoke:reader-proclitic` (хард-негатив zero-tolerance fixture + top-200==100% + per-category полы + аддитивность byte-parity stem-reading + split-rejoin parity + вав-suppress + oracle-independence CI; метрика existence≥99/labeled-seg≥95/recall негейтящий) + рендер в `reader-morph.js` (вторичный chip-ряд «Приставки», вес-обратно-частоте, in-word тинт только confident, мультиклитика 1 RTL-ряд, переиспользовать бейдж-лексикон + 3b usage-store для ссылок) + i18n + CSS. **Render-инвариант:** детектор АДДИТИВНЫЙ — НЕ меняет разбор основы (byte-parity gate).

**Файлы (всё закоммичено, прод чист):** recon (этот) · `docs/research/epic-proclitic-phase2/2026-07-01/` (gold-frozen.json · manual/ · detector-proto-v3.js · DETECTOR_FINDINGS.md · role-lens-critiques.md · measure-*.js · README.md) · `scripts/premium/build-proclitic-gold.js` · `docs/PROJECT_ROLES.md` (R10 обновлён). Dicta-silver кэш (для измерений): `.tmp/benyehuda/reader-morph-audit-dicta-cache.json` (регенер. `npm run smoke:reader-morph:audit`).

---

## §10. PHASE-3 ЗАШИПЛЕН (v3.11.66, 2026-07-01) — движок+продюсер+гейт+рендер, НЕ ЗАПУШЕН

**Коммиты `1b74064` + `e8d85f0` на main (локально, не запушено).** Всё под гейтом, прод-код тапкарты нетронут до активации оверлеев.

**СДЕЛАНО:**
- **Движок** `public/js/proclitic-segment.js` (pure dual-export, lock-step). Tier-1 офлайн FSA (enumerate-parses → longest known-residual, residual-must-be-content, abstain; HEDGED). Tier-2 bake-Dicta overlay: `pre` из pipe-сегментации Dicta → SUPPRESS(whole-word/proper-noun) + CONFIRM(known-stem)→confident; НЕ ассертит unknown-stem (Dicta дрейфит на архаике). Слитн.артикль реконструируется из огласовки ТОЛЬКО перед НОМИНАЛОМ (не указат./инфинитив). **Замер vs frozen R1-gold: confident existence-precision 100% (52/0), core-labeled-seg 100%, все per-category полы. Реал-корпус: 30% confident на work 105.**
- **Продюсер** `scripts/premium/build-proclitic-overlay.js`: Node-fetch Dicta (reader-dicta.js в Node, новое поле `prefixes`) → per-work overlay `{skeleton→{pre,pn,v,conf}}` на том (gitignored `public/data/benyehuda/proclitic/`, как works/). `--gold-fixture` (frozen `overlay-fixture.json` для гейта) · `--bake` · `--status`. Cache+ledger+resume.
- **Гейт** `smoke:reader-proclitic` (47 ассертов, HERMETIC — frozen gold + frozen Dicta-fixture, без live Dicta). Включает: hard-negative zero-tolerance · confident≥99 · per-category полы · core-seg≥95 · split-rejoin · niqqud-absent abstain · additive-purity · recall-band+offline-precision · **over-peel zero-tolerance** · **morpheme-label tripwire** (fabricated article/narrative-vav/interrogative) · **fossil-collision** · oracle-independence.
- **Рендер** `reader-morph.js`+`library.html`+`library-ui.js`: АДДИТИВНЫЙ chip-ряд «Приставки» под разбором основы (byte-parity основы нетронута, reader-parity зелён), вес-обратно-частоте, тап-чип→«Употребление» проклитики (3b store), overlay грузится per-work (best-effort). **Гейт: только CONFIDENT (overlay-confirmed) surface'ится** — офлайн-tier hedge'ит на ~22% слов (замерено work 105) → слишком шумно, не показываем; фича активируется по-работно по мере bake+push оверлеев. `card.procliticsRaw` хранит офлайн-hedge для будущего opt-in.
- **Адверсариальная роль-критика (R11/R10/R1) ДО коммита** поймала 6 do-no-harm багов — все исправлены + гейт-teeth добавлены: over-peel past Dicta-pre (ומסורק→ומ) · narrative-vav на сущ. (וַעֲבוֹדָה) · слитн.артикль на указат. (כָּזֶה→כה) · interrogative ה как артикль (הֲיָדַעְתָּ) · בקרב fossil vs gold.

**✅ ЗАДЕПЛОЕНО + АКТИВИРОВАНО НА ПРОД (2026-07-01):** v3.11.66 задеплоен (коммиты `1b74064`…`ac15b99`; прод sw=v3.11.66, proclitic-segment.js 200), rollout-плюминг ЗАШИПЛЕН (`push-proclitic-overlay.js` + route `POST /api/benyehuda/proclitic/upload` + static-mount `/data/benyehuda/proclitic` в server.js, клон works/ + `push:corpus-proclitic`), **44 работы забейканы+запушены на том** (21365 entries, 0 fail; overlays отдаются, un-baked→graceful 404). Деплой был застрял 3ч на СТАРОМ коммите 72b4552 (rolling-update hung) → отменён через Coolify UI (Kapture) → очередь пошла на ac15b99. Первые 5 push-фейлов = rolling-update окно (2 контейнера) → re-push --skip-existing закрыл. **Фича ЖИВАЯ на 44 работах.**

**✅ PRODUCT LEVERS РЕШЕНЫ (замер, 2026-07-01):**
- **Lever 1 (rich offline-hedge) — ОТКЛОНЁН, оставлен confident-only.** Замер rich-минорити (fused/ש/מ/subord/multi) офлайн vs gold: **95.0% precision, 89.5% core-seg** — честно, но с FP+label-ошибками, а полный bake покрывает корпус overlay'ем → hedge нужен только на un-baked/imported. Не стоит шума. `card.procliticsRaw` оставлен для будущего.
- **Lever 2 (Dicta-attested-word recall boost) — ЗАШИПЛЕН + gated.** Продюсер `--attested` агрегирует Dicta-whole-words (prefixes="") из bake-кэша → `public/data/inflection/corpus-attested-words-v1.json.gz` (POS-routed: nominal=noun/adj для арт-гейта, content=+verb для residual-stop). `buildLexicon(…, {attested})` расширяет residual-stop. reader-morph грузит lazy (DecompressionStream) + гейт читает shipped-артефакт. **Замер: confident recall 20.7%→27.9% (+35% относит.), precision 100% (0 FP), artFP 0.** Растёт с полным корпус-кэшем. Gate 47/47.

**🔵 ОСТАЛОСЬ (владелец, периодически):**
1. **Bake полного корпуса ИДЁТ** (`--bake --concurrency=5`, ~752 работы, resume-able) → `push:corpus-proclitic --skip-existing`. Каждая новая работа активирует чип-ряд. После bake: пересобрать `--attested` из полного кэша → артефакт больше → recall выше.
2. **Опц. wire в `publish-corpus-batch.js`** (bake+attested produce-step + push-line) — сейчас decoupled (как FTS-push), достаточно.

**Инварианты соблюдены:** детектор АДДИТИВНЫЙ (byte-parity основы) · метрика vs НЕЗАВИСИМЫЙ frozen human-gold (не Dicta-vs-Dicta) · index.html нетронут · commit сделан, push — под решение владельца (outward-facing новая фича).
