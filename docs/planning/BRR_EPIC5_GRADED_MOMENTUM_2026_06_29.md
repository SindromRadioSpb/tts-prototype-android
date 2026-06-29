# Эпик 5 — Импульс graded-reading: никаких тупиков, всегда «что дальше» · P1 / L · вед. R8 (R2/R7/R9/R4/R11)

**Дата:** 2026-06-29 · **Статус:** 🟢 ПЛАН утверждён владельцем (scope + первые развилки) → имплементация по компонентам.
**Родитель:** `BRR_UX_AUDIT_2026_06_25.md` §«ЭПИК 5» · `BRR_HANDOFF_NEXT_SESSION_2026_06_28.md` §«ЭПИК 5 — СТАРТ». Память [[project_brr_ux_audit]].
**Прод на старте:** v3.11.42 (`163cda3`); Эпик 4 + Phase D (D1–D7) завершены.

## Зачем
Эпики 3/4/5 = цикл `learn→recall→next-step` (моат LingQ/graded). Эпик 4 + Phase D закрыли **recall**; Эпик 5 — недостающий **next-step**: «никаких тупиков, всегда что дальше».

## Ключевой вывод measure-before-code (R10, прогон 2026-06-29, 6 агентов + независимая верификация)
**Это surfacing-эпик, не data-эпик.** Данные и движки ранжирования УЖЕ есть и отгружены; почти всё — вытащить наружу уже-вычисленный сигнал и убрать тупик. Низкий риск, Room-only, parity-safe.

**⚠ Stale-plan trap пойман (R10 / [[feedback_verify_stale_plan_vs_live_code]]):** handoff говорил, что `ez`/`archaica`/`loadFlag` лежат в `build-corpus-catalog.js` — НЕВЕРНО. `ez` считается в `build-corpus-vocab.js:171` (`headShare*matchedShare*lenShape(n)`), `loadFlag` считается КЛИЕНТСКИ в `corpus-vocab.js:71`, литерального поля **`archaica` НЕТ нигде** (это неформальное имя для fallback-доли m/n).

## Измеренная реальность по компонентам (grounded, file:line)
| # | Компонент | Реальность сегодня | Фикс (reuse) | Роли · усилие |
|---|---|---|---|---|
| **1** | continue-mark-read | Нет понятия «прочитано». `getContinueReading` (local-db.js:2781) фильтрует `last_row_idx>0` БЕЗ порога → 100%-текст висит вечно. `text_progress` = {text_id, last_row_idx, last_step_id, updated_at} (mig 003); `setProgress` UPSERT (2761) трогает только эти. `n_rows`+`continuePercent` («X% прочитано», reader-progress.js:34) уже есть. Уйти со полки можно только `is_archived=1`. | Аддит. миграция `finished_at TEXT` + узкий UPSERT (COALESCE-preserve) + `AND tp.finished_at IS NULL` + one-tap «✓ Прочитано» (авто-подсказка на последней строке). Зеркало `is_archived`. Нести в bundle export/import. | R8/R4/R11 · **S** |
| **2** | end-of-text-handoff | Конца текста НЕТ вовсе; `closeReader` (2326) сваливает в сетку. НО `CorpusVocab.pickPersonalRail` (corpus-vocab.js:100, отгружен) ранжирует 796 готовых работ gentlest-first; `injectCorpusRails` (3033) уже им рулит; single-flight `ensureWordStates` (566, без стампиды). Пул = **796 baked** (`corpus-index-v7.ready`), не 26K. | Детект конца (`ReaderProgress.topVisibleRowIdx==len-1`) → поднять рейл-движок inline-карточкой «🎯 Следующий для тебя», искл. текущий/прочитанные; fallback `buildColdStartSection` (ez) при пустом профиле (R8 без тупика). | R2/R8/R7 · **M** |
| **3** | difficulty-band | `ez` (intrinsic easiness, профиль-независим, build-time, детерм.) в сайдкаре для 796 baked: min .007 / median .582 / max .865; тертили ≈ **.30/.67**. `loadFlag` (имена/архаика = m/n, профиль-независим) true для 12.7%, но показан ТОЛЬКО за профиль-гейтом (`enhanceCardWithCoverage`, cov.knownDistinct>0, lib-ui:2763). `ez` потребляется в ОДНОМ месте (cold-start sort, 2798). Эпоха R9-derived (floruit=birth+35), ~89% работ. | Чистый client-классификатор `ez→3 бэнда` + отвязать `loadFlag` от профиль-гейта; провенанс «прибл. — по частотности лексики». **Без ребилда/DATA_REV** (только читает существующие поля). Для 25 659 не-baked — честно НЕТ бэнда. | R7/R9/R8 · **M** |
| **4** | in-text-coverage-chip | Карточный «≈N% знакомо» (`enhanceCardWithCoverage`, 2760) исчезает при открытии; в ридере только «Учить»+due-бейдж. Дефолт-открытие НЕ сканирует (color off + fade full → `decorateWords` early-return, reader-morph.js:1442). Ингредиенты есть: `roomVocabCoverageFor(id)` (corpus, 0 скан) ИЛИ `collectReviewItems` (user-текст, 1 скан). | Чип в шапке ридера: reuse `CFG.KNOWN_STATES`+`ZONE_LO/HI`+`statusKeyForCard` → число == карточка == краска (R11 кросс-поверхность). Sidecar-first для corpus, live-scan fallback для user. | R8/R2/R11 · **S** |
| **5** | niqqud-fade-graduation | ДВА kill-switch: (а) дефолт `niqqudMode='full'` (lib-ui:328), ноль кода `full→adaptive` по прогрессу (единств. сеттер — ручной select, 2199); (б) контрол закопан в «Аа», pulse гаснет с 1-го открытия, tip молчит. + cold-start: даже в adaptive `fadeDecision` (reader-morph.js:1419, строка 1478 `confident?raw:undefined`) на пустом профиле не гасит ничего. Чистый, smoke-gated. | Авто-graduation: флип ЭФФЕКТИВНОГО режима при пороге знакомых слов, persist «graduated», dismissible nudge — `fadeDecision`/`decorateWords` без изменений (меняется лишь `fadeMode`). 'full' = честный cold-дефолт; гейт уверенности НЕ ослаблять (R9/R11). | R8/R9/R4/R11 · **M** |

## Решения владельца (2026-06-29, AskUserQuestion)
1. **Scope/порядок:** ВСЕ 5 в рекоменд. порядке `1→2→3→4→5`.
2. **«Прочитано» (W1):** ручная отметка + **авто-подсказка** one-tap «✓ Прочитано» при `last_row_idx>=n_rows-1` (НЕ авто-set); хранилище `finished_at TEXT`; нести в bundle export/import.
3. **«Что дальше» (W2):** **i+1 gentlest-first** (`pickPersonalRail` как есть) + **inline-карточка в КОНЦЕ текста**; ez-cold-start fallback при пустом профиле.
4. **Бэнд сложности (W3):** **ez-тертиль + decoupled loadFlag, client-only** (без ребилда/DATA_REV); для не-baked — нет бэнда.
> Развилки W4 (метрика/источник чипа) и W5 (auto-vs-nudge graduation, порог) — поднять на старте их шага (norm: per-component plan+forks+measure → владелец решает).

## Последовательность (обоснование)
`W1 continue-mark-read` (кладёт общую `text_progress`-миграцию ОДИН раз + completion-derive; R8-ядро; S) → `W2 end-of-text-handoff` (reuse W1-completion + `pickPersonalRail`; R8/R2 «что дальше») → `W3 difficulty-band` (профиль-независим, R7/R9; питает cold-start/handoff) → `W4 coverage-chip` (in-reader продолжение карточного числа; reuse `classifyZone`) → `W5 niqqud-graduation` (самый дизайн-чувствительный, R11 do-no-harm, P2 — последним).

## Инварианты / нормы (как везде)
- **Room-only / parity:** `index.html` + `reader-core.js` НЕ трогать (`smoke:reader-parity`). `#appFooterVersion`@index.html — это **Студия**, НЕ трогать. Деплой-бамп = `package.json` + `sw.js CACHE_VERSION` + `#roomFooterVersion` (library.html).
- **UPSERT-preserve (инв #2):** только ОДИН узкий писатель на `text_progress.finished_at`; не клоббить `last_row_idx` (800ms scroll-writer). [[feedback_upsert_preserve_columns]].
- **Key-parity (инв #1):** chip-счёт keyed через `statusKeyForCard`/`getKnownWordStates` == краска == «Учить».
- **Детерминизм (инв #5):** `ez`-бэнд / `fadeDecision` / completion-helper — чистые, Node-smoke; без `Math.random`/`Date.now` в чистом пути.
- **derived≠asserted (R9):** бэнд/эпоха с честным провенансом, не CEFR; для не-baked — нет бэнда (не фабриковать).
- **R11 do-no-harm:** «прочитано»/handoff не понижают `last_row_idx`; авто-graduation не «огласовывает назад» заслуженный fade.
- **i18n:** room.* (ВЛОЖЕННЫЙ объект) в ru/en/he; SW-бамп на изменение локалей.
- **@380px** свет+тёмная (RTL) ДО `git add`; глобальный `button{width:100%}` → явные `width:auto` исключения (CSS-ловушка #1).
- **Цикл:** зелёные гейты → bump → push → Coolify → prod-verify Node no-store → live-verify на ОДНОРАЗОВОМ тексте/движок-eval ([[feedback_live_verify_training_throwaway_text]]). После содержательной правки — adversarial code-review субагентом.

## Прослеживаемость (заполнять по мере отгрузки)
| W | Компонент | Версия | Коммит | Гейт | Статус |
|---|---|---|---|---|---|
| W1 | continue-mark-read | v3.11.43 | _(текущий)_ | reader-resume(45/0, +atTextEnd/lastRowVisible) · reader-word-status(mig 061 + finished round-trip + UPSERT-preserve обе стороны) | ✅ SHIPPED |
| W2 | end-of-text-handoff | v3.11.44 | _(текущий)_ | corpus-vocab(pickPersonalRail) · scaffold 234 · i18n 226 · parity · node 265/9 | ✅ SHIPPED |
| W3 | difficulty-band | v3.11.45 | _(текущий)_ | corpus-vocab 25/0 (+difficultyBand/loadFlagFor + real-sidecar) · scaffold 234 · i18n 226 · parity | ✅ SHIPPED |
| W4 | in-text-coverage-chip | v3.11.46 | _(текущий)_ | reader-morph · scaffold 234 · i18n 226 · context/parity | ✅ SHIPPED |
| W5 | niqqud-fade-graduation | — | — | reader-scaffold | ⏳ |

### W1 — ✅ SHIPPED (v3.11.43)
**continue-mark-read.** Решения владельца: ручная отметка + авто-подсказка; `finished_at`; bundle round-trip.
- **Миграция 061** — `text_progress` += `finished_at TEXT` (аддит., nullable).
- **`local-db`:** `setTextFinished`/`clearTextFinished` (узкий UPSERT — трогает ТОЛЬКО `finished_at`); `getContinueReading` += `AND tp.finished_at IS NULL`; export/import несут `finished_at` (R9 портативность).
- **Движок (PURE, reader-progress):** `atTextEnd(lastIdx,nRows)` + `lastRowVisible(rows,vh,margin)` (детерм., Node-тест; гейт reader-resume 45/0).
- **`library-ui`:** end-of-text карточка `renderEndOfTextCard`/`maybeShowEndOfText`/`readerAtEnd`/`resetEndCard` — авто-«✓ Прочитано» при достижении конца (НИКОГДА не авто-set, R4); reset на open/close; dismiss-✓ на continue-карточке. **Это mount-точка W2-handoff.**
- **i18n** ru/en/he (`room.resume.endOfText/markRead/readDone/unmark/markedRead/markReadTip`); CSS `.reader-end*`/`.continue-done` (auto-width escape global `button{100%}`); @380px свет+тёмная + RTL-карточка проверены.
- **Adversarial review pass** — поймал 1 Important: авто-карточка НЕ всплывала при обычном скролл-чтении (`topVisibleRowIdx==n-1` достигается только когда последняя строка УШЛА за бар, чего низ документа не даёт; замер: на 40-строчном тексте `topVisibleRowIdx@низ=33`, не 39). Фикс: триггер = «последняя строка видна» (`lastRowVisible`), не «прокручена за бар». Эмпирически подтверждено в реальной раскладке браузера (false@верх→true@низ).
- **Гейты:** reader-resume 45/0 · reader-word-status (mig 061 + finished-фильтр + UPSERT-preserve обе стороны) · reader-scaffold 234 · reader-morph/context/parity/i18n 226 · node --test 265/9 (==baseline) · api-smoke. ⚠ Прод/live-verify скролл-триггера — на реальном длинном baked-тексте (Kapture).

### W2 — ✅ SHIPPED (v3.11.44)
**end-of-text-handoff.** Решения владельца: i+1 gentlest-first inline-в-конце · **+«🔁 Повторить слова» CTA** · **топ-3** next-карты. Конца текста не было (`closeReader` сваливал в сетку); движок `pickPersonalRail` (796 ready) уже отгружён.
- **library-ui (reuse, без нового движка):** `buildHandoffPicks(excludeTextKey)` — поднимает scored-цикл из `injectCorpusRails` (`coverageForWork` vs single-flight `ensureWordStates`, искл. текущий `text_key`) → `pickPersonalRail` → топ-3; fallback `ez` cold-start (top-3, author-cap). `appendHandoffPicks` — async-секция «🎯 Следующий для тебя»/🔥/🌱 (3× `renderCorpusCard` → tap=`openCorpusWork`); guard `readerTextId!==tid || !card.isConnected` + идемпотентность. `renderEndOfTextCard` += «🔁 Повторить слова» CTA → `startTextReviewFromHandoff` (открыть study-sheet в train-mode + `startTraining` по открытому тексту — reuse, та же in-text cloze).
- **i18n** `room.resume.reviewWords` ×3 (заголовки переиспользуют `room.corpus.{next,challenge,coldStart}Title`); CSS `.reader-end-review`/`.reader-end-next*` (next-карты в колонку, @380px). **Без миграций, без правок движка/parity.**
- **Adversarial review pass** — поймал 1 Important: заголовок-эмодзи 🎯/🔥/🌱 стирался `applyI18n` (`data-i18n` на элементе с emoji-текстом → перезапись на emoji-less ключ; ровно паттерн, который home-rail избегает). Фикс: emoji = текст-нода + заголовок = дочерний `[data-i18n]` span (эмодзи переживает + live-релокализация). **Эмпирически подтверждено против реального `applyI18n`:** fixed=«🎯 Следующий для тебя», buggy=«Следующий для тебя». Остальная поверхность (async-гонка/sheet-setup/exclusion/empty/стампида/parity/i18n/card-reuse) — чисто.
- **Гейты:** corpus-vocab 15/0 · scaffold 234 · i18n 226 · reader-morph/context/parity · word-status · node 265/9 (==baseline) · api-smoke. @380px свет+тёмная (mark+review+3 next-карты, RTL). ⚠ live-verify за владельцем на реальном/одноразовом тексте (next-веер + «Повторить слова»).
- **СЛЕДУЮЩЕЕ = W3 difficulty-band** (ez-тертиль .30/.67 + decoupled loadFlag, client-only, без ребилда).

### W3 — ✅ SHIPPED (v3.11.45)
**difficulty-signal.** Решения владельца: абсолют .30/.67 (3 бэнда) · **отдельная строка сложности** · ez-тертиль + decoupled loadFlag, client-only. Stale-plan trap (ez в vocab-сайдкаре, не catalog; нет `archaica`-поля) учтён.
- **corpus-vocab (PURE, без ребилда/DATA_REV — только читает существующий `ez`/`m`/`n`):** `difficultyBand(ez)` (ez≥.67→easy/легче · .30–.67→mid/средне · <.30→hard/сложнее · нет/невалид→null=честно нет бэнда, R1/R9) + `loadFlagFor(work)` (профиль-FREE `m/n`, та же формула что coverageForWork.loadFlag). Гейт `smoke:corpus-vocab` +10 ассертов (детерм. пороги + реальный 796-сайдкар: каждый baked бандится, распределение non-degenerate) → **25/0**.
- **library-ui:** `appendDifficultyRow(node,card)` — лениво из `enhanceCardWithCoverage` (видимые карты, observer; reuse cached single-flight `loadCorpusVocab`, **0 DB-fan-out**), профиль-FREE, идемпотент, не-baked→нет строки. **«много имён/архаики» ПЕРЕНЕСЁН** с профиль-гейтнутого coverage-пути в эту профиль-free строку (R7 archaica=свойство ТЕКСТА; без дубля). Provenance-title «прибл. — по частотности лексики» (R9, не CEFR); отдельный сигнал от coverage-бейджа (R11 не смешивать).
- **i18n** `room.corpus.diff.{easy,mid,hard,prov}` ×3; CSS `.work-card-difficulty`/`.diff-band/.diff-{easy,mid,hard}/.diff-archaica` (свет+тёмная).
- **Adversarial review pass** — поймал 1 Important: строка сложности **мис-плейсилась на S7 search-RESULT-ROW** (`.corpus-work-row` горизонтальный flex, нет `.work-card-cta` → `appendChild` кидал бэнд справа от ▶, теснил заголовок @380px). Фикс: surface-aware placement — `.corpus-work-col` (result row → внутрь колонки под meta) иначе before `.work-card-cta` (card). +`node.isConnected` guard (W2-консистентность) + убран лишний per-card `applyI18n` (tt() уже локализует). Нит-комментарий smoke поправлен. **Скрин @380px подтвердил оба surface** (rail-карта + result-row).
- **Гейты:** corpus-vocab 25/0 · scaffold 234 · i18n 226 · reader-morph/context/parity. @380px свет+тёмная (rail-карты: легче/средне/сложнее+архаика; result-row: стек в колонке). ⚠ live-verify бэнда на проде — на реальных corpus-картах.
- **СЛЕДУЮЩЕЕ = W4 in-text-coverage-chip** (sidecar-first `roomVocabCoverageFor` 0-скан для corpus / live `collectReviewItems` для user; reuse `CFG.KNOWN_STATES`+`classifyZone`+`statusKeyForCard` → chip==карта==краска, R11).

### W4 — ✅ SHIPPED (v3.11.46)
**in-text-coverage-chip.** Решения владельца: «≈X% знакомо · N новых» · sidecar-corpus / live-scan-user. Карточный «≈N% знакомо» исчезал при открытии.
- **library-ui:** `refreshCovChip()` — CORPUS → `roomVocabCoverageFor` (sidecar, 0 скан, % byte-identical карточному бейджу, R11) через `corpusReadyKeyMap()` (text_key→card→catalog-id→sidecar); USER → один `collectReviewItems` fold по `CFG.KNOWN_STATES`. Пустой профиль → только «N новых» (без вводящего в заблуждение «≈0% знакомо», зеркало badge-hide). Чип = full-width 2-я строка sticky reader-bar (`flex-basis:100%`), tap → `roomOpenStudyList` («Учить» — «N новых» в один тап от изучения). Hook в `applyDecorations` (open+status+config); `clearCovChip` на open/close.
- **i18n** `room.corpus.cov.{familiar,newShort,chipAria}` ×3; CSS `.reader-bar{flex-wrap}` + `.reader-cov-chip` (+зоны cov-in/easy/hard, свет+тёмная).
- **Adversarial review поймал 1 CRITICAL + 2 Important:** **(C)** corpus-ветка = МЁРТВЫЙ код — `corpusReadyMap` keyed by `id` (мал. int), но `readerTextKey`=64-hex `text_key` → `.get()` всегда undefined → каждая corpus-работа молча падала в live-scan fallback (ломая R11-паритет И 0-скан). Фикс: `corpusReadyKeyMap()` keyed by text_key (data-chain verified: key→card→id→sidecar 10/10). **(I)** scan на каждом repaint вкл. config-toggle → memoize user-fold по (tid, statesRef) (config-toggle = тот же profile-ref = cache-hit, без скана). **(I)** busy-guard ронял concurrent refresh без trailing re-run → dirty-flag coalesce.
- **Гейты:** reader-morph · scaffold 234 · i18n 226 · context/parity. @380px свет+тёмная (known-state «≈87% знакомо · 12 новых» cov-in + empty «📖 N новых» honest). ⚠ live-verify на проде: chip% == card% на реальной corpus-работе.
- **СЛЕДУЮЩЕЕ = W5 niqqud-fade-graduation** (последний; auto-graduation full→adaptive по порогу знакомых слов; fadeDecision/decorateWords без изменений, лишь fadeMode; 'full' остаётся честным cold-дефолтом; R11 do-no-harm — не «огласовывать назад» заслуженный fade).

## Источник измерений
Полный grounded-прогон (6 агентов, file:line, реальные распределения) — рабочий артефакт сессии; ключевые факты сведены в таблицу выше. Независимо подтверждено: niqqud-дефолт `'full'`, `ez`@build-corpus-vocab.js:171 (нет `archaica`), `getContinueReading` без порога, `ready`=796.
