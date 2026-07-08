# CLG-P7.2d — premium modality selector: SPEC (к коду) 2026-07-08

> Делает выбор модальности **score-based по состоянию навыка** (не жёсткий порядок) + **объясняет
> выбор**. Инвариант R17: детерминированный селектор ВЫБИРАЕТ модальность и ПРИЧИНУ; объяснение —
> статичная строка по коду причины (LLM НЕ участвует в выборе). Продолжение P7.2a/b/c (reverse+cloze+
> dictate SHIPPED + owner live-verified). Prep: TELEGRAM_P7_2d_SELECTOR_PREP_2026_07_08.md.

## 0. Что меняется (delta над живым `agent/telegram/review.js::selectEligible`)

Сейчас — ФИКСИРОВАННЫЙ порядок: cloze → dictate(2-й проход) → reverse strictSafe → ничего.
P7.2d — тот же набор модальностей и гейтов eligibility, но **порядок выбирается политикой из сигналов
навыка** + к pick добавляется `select_reason` (код причины) → объяснение в prompt (класс A, i18n).

## 1. Сигналы навыка (grounded, дёшево — читаем существующее)

| Сигнал | Источник | Как получаю |
|---|---|---|
| `channel_stats` (receptive/production) | `srs_projections.channel_stats_json` | расширить `learnerGraphRepo.getDue` → парсить столбец в `it.channel_stats` (как `getWeakWords`) |
| recent struggle (24ч, ≥2 провала) | `learnerGraphRepo.getRecentStruggles` | 1 вызов → `Set(item_key)` |

**Важная семантика `channel_stats` (замерено в коде):** `channelStats()` (learnerProjectionRepo) ИСКЛЮЧАЕТ
context-supported строки (reverse=lexeme, cloze) из production (`isContextSupportedRow`). Значит:
- `channel_stats.receptive` = сила ЧТЕНИЯ (read/listen good/again/hard);
- `channel_stats.production` = сила ДИКТАНТА (unsupported cell) — reverse/cloze туда НЕ входят.

Профиль на due-item (из channel_stats + struggle-set):
- `readingStrong` = `cs.receptive.good ≥ 1` (есть успешное рецептивное свидетельство);
- `dictateProven` = `cs.production.good ≥ 1` (есть unsupported-dictate успех);
- `recentStruggle` = item ∈ getRecentStruggles(24ч, ≥2).
- `cs == null` (холодный item, нет обзоров) → все три false → политика деградирует в baseline (честно:
  нет сигнала — нет агрессивной перестановки).

## 2. Политика выбора (детерминированная; total-order через тир-лестницу + due-приоритет)

Due-items идут в порядке `getDue` (lapses DESC, due ASC = приоритет). Eligibility-гейты БЕЗ изменений:
cloze (двойной consent + найдена форма), dictate (form + asset-файл + омофон-фильтр + **written≥3** +
!exposed), reverse (strictSafe + !exposed). Cooldown/анти-старвация сохранены.

**Решение (по убыванию приоритета):**
1. **FLAGSHIP — закрыть reading→dictation gap.** Первый due-item с `readingStrong && !dictateProven &&
   !recentStruggle`, который dictate-eligible → **dictate**, `select_reason='reading_strong_close_dictation_gap'`.
   ЕДИНСТВЕННОЕ место, где score перебивает «cloze-first» (fork #4=a). Моат: uncued production из
   слова, надёжно узнаваемого в чтении — ровно то, что channel_stats и мерит.
2. **cloze** (context-cued). Найден → **cloze**, reason = `recentStruggle(clozeItem) ?
   'recent_struggle_prefer_cued' : 'default_context'`. Дефолтный context-first И правильный cued-выбор
   при недавнем провале.
3. **dictate baseline** (2-й проход, анти-старвация): первый dictate-eligible с `!recentStruggle` →
   **dictate**, `default_dictation`. (Недавно-провальные слова пропускаем — не долбим самой сложной
   модальностью; их подхватит cued-reverse ниже.)
4. **reverse strictSafe**: первый eligible → **reverse**, reason = `recentStruggle ?
   'recent_struggle_prefer_cued' : 'default_recall'`.
5. **dictate last-resort** (анти-старвация): любой оставшийся dictate-eligible (включая recentStruggle)
   → **dictate**, `default_dictation`. Гарантия: due-слово, годное ТОЛЬКО для диктанта, не теряется
   (иначе тихий «нечего повторять» при живом due).
6. `null`.

Инвариант честности: шаг 5 не даёт «тихий 0». Шаги 1/3/5 — те же dictate-кандидаты, вычисленные ОДИН
раз за проход (мемоизация `dictateEligible(item_key)`), не 3× пересчёт.

## 3. Объяснение выбора (класс A, i18n, детерминированное — fork #2=a)

`format.selectExplanation(select_reason, kind, lang)` → одна строка, ПРЕПЕНДится к prompt новой строкой.
Строится ТОЛЬКО из статичного словаря по (reason × kind) — НИКОГДА item_key/pid/lemma/ответ/лог. R17:
LLM не генерит (нулевой токен-кост R16, нулевой leak-риск, полный контроль). Примеры (ru):
- `reading_strong_close_dictation_gap` (dictate): «Это слово ты уверенно узнаёшь при чтении — проверим,
  сможешь ли записать его на слух.»
- `recent_struggle_prefer_cued` × cloze: «Недавно это слово давалось трудно — потренируем его в контексте.»
- `recent_struggle_prefer_cued` × reverse: «Недавно давалось трудно — вспомним его по значению.»
- `default_context` (cloze): «Потренируем слово в контексте твоего текста.»
- `default_recall` (reverse): «Активное припоминание: значение → слово.»
- `default_dictation` (dictate): «Проверим написание на слух.»
en/he — параллельно. Неизвестный reason → пустая строка (fail-safe, prompt без объяснения, не падаем).

## 4. 2-буквенный / function фикс (fork #3 — measure-before-code выполнен)

Замер `scripts/premium/measure-dictate-length-pos.js` → `docs/research/telegram-p72d-selector/2026-07-08/
dictate-length-pos-measure.txt`. Из 6912 dictate-безопасных лемм:
- **written ≤2: 85 (1.23%)** — 74 content (של/בת/לב/**פן**), 11 function. Владельческий `פן` = **noun**.
- function-POS любой длины: 193 (2.8%), из них 182 — len≥3 (כה/כך/…).
- «min≥3» и «exclude function» почти НЕ пересекаются и лечат РАЗНОЕ; `פן` лечит ТОЛЬКО min≥3.

**Реализация (fork #3=a, рекомендация):** в `keyingService.dictateFormForItemKey` поднять порог
`written.length < 2` → `< 3` (строка :288). ЕДИНСТВЕННАЯ точка → сервер+bake+оракул-гейт согласованы ПО
ПОСТРОЕНИЮ (2-букв item → null обеими сторонами → «не выбран dictate» держится тавтологически-безопасно).
Прод-ассеты 2-букв остаются на томе (безвредно, просто не выбираются). Опция (b): + исключить
function-POS (`NA.FUNCTION_POS.has(p.pos)` → null) — ещё −182 (изолированные частицы/наречия — слабые
цели диктанта). Owner решает a vs b.

## 5. Инварианты (нельзя ослаблять)

Выбор ДЕТЕРМИНИРОВАН из состояния (LLM НЕ выбирает — объяснение статично) · запись challenge-bound +
webhook-trusted · dictate ТОЛЬКО при готовом ассете + омофон-фильтр + written≥3 · evidence_scope канон
(reverse=lexeme/cloze=cloze/dictate=cell, fail-closed) · D-4 modality-сегментация · near_miss dictate
ТЕРМИНАЛЕН · assetKey by construction · cooldown + анти-старвация (шаг 5 — без тихого 0) · privacy A/C ·
объяснение класс A (без PII/id/ответа) · оракул replay==stored.

## 6. Гейт `smoke:telegram-selector` (независимый — сид РАЗНЫХ профилей → assert политика+объяснение)

Переиспользовать harness telegram-dictate/cloze (stub, recv, startPrompt, seed). Профили:
- **A** reading-strong + dictate НЕ proven + asset + no struggle + due → dictate + reason=
  `reading_strong_close_dictation_gap`; prompt содержит объяснение; объяснение НЕ содержит item_key/pid.
- **B** recent struggle (2 провала <24ч) на слове + cloze доступен → cloze + `recent_struggle_prefer_cued`.
- **C** reading-strong + dictate УЖЕ proven (production.good≥1), cloze недоступен → dictate, reason=
  `default_dictation` (НЕ gap-reason: promotion-гейт уважает dictateProven).
- **D** 2-буквенное due-слово (напр. `פן`/`לב`) с asset → dictate НЕ выбран (written≥3); fallback.
- **explanation class-A**: объяснение present во всех prompt'ах + не содержит сырых id/леммы/ответа.
- Регрессия: dictate 30 · cloze 21 · review 32 · grade-policy 28 · agent-review 66 · pairing 33 ·
  content 15 · memory-canon 63 · server-keying 24 (9 наборов зелёные).

## 7. Файлы

- `db/keyingService.js` — written≥3 (+опц. function-POS) в dictateFormForItemKey.
- `db/learnerGraphRepo.js` — getDue возвращает parsed `channel_stats`.
- `agent/telegram/review.js` — selectEligible политика + select_reason + мемоизация dictateEligible.
- `agent/telegram/format.js` — selectExplanation(reason, kind, lang) + препенд в prompt-форматтеры.
- `scripts/premium/telegram-selector-smoke.js` + package.json `smoke:telegram-selector`.

## 8. Открытые форки (owner) → см. §2/§3/§4 + вопросы владельцу 2026-07-08

1. Форма политики: **тир-лестница из 2 skill-промоций над baseline** (rec) vs полный аддитивный score
   vs только объяснения-без-переупорядочивания.
2. Источник объяснения: **детерминированная канон-строка** (rec) vs LLM-проза.
3. 2-букв/function фикс: **min≥3** (rec, лечит פן) vs min≥3+exclude-function vs только-exclude-function
   (не лечит פн).
4. cloze-first override: **gap-dictate перебивает доступный cloze** (rec) vs cloze всегда первый.

---

## АДЪЮДИКАЦИЯ v1→v2 (owner-решения + 3-линзовая критика wf_58b7c1d6, 2026-07-08)

**Owner 2026-07-08** утвердил ВСЕ 4 рекомендации: (1) тир-лестница из 2 skill-промоций · (2)
детерминированная канон-строка · (3) min≥3 (БЕЗ exclude-function) · (4) gap-dictate перебивает cloze.

**Критика (3 линзы, grounded) нашла 2 MAJOR-контр-дизайна + доработки. Верифицировано и исправлено В
СПЕКЕ ДО кода:**

- **[MAJOR — R17, ВЕРИФИЦИРОВАНО] `channel_stats.production` ПОЛЛУЦИРОВАН, НЕ «диктант-only».** Клиент
  (`library-ui.js:1571-1643`) пишет ГОЛЫЕ каналы `reverse`/`dictate`/`cloze` (Studio/Зал-тренер) БЕЗ
  `evidence_scope` → `isContextSupportedRow`=false → они попадают в `channel_stats.production`. Значит
  `dictateProven` ИЗ `production.good` ложно защёлкивается клиентским reverse-успехом. **ФИКС:**
  `dictateProven`/history ТОЛЬКО через `itemRows` + `grade-policy.channelPrefix(ch)==='dictate' &&
  !isContextSupportedRow(r)` (modality-сегментировано, как D-4 hasProvenProduction — «диктант» ловит и
  `dictate:tg`, и клиентский `dictate`, но НЕ reverse/cloze). `readingStrong` остаётся дёшево из
  `channel_stats.receptive` (рецептив НЕ полосуется production'ом).
- **[MAJOR — R2/R17: инвертированная сложность.]** `reverse:tg` = UNCUED gloss→word = САМАЯ ТЯЖЁЛАЯ
  модальность (не «cued»). Правильный порядок сложности: **cloze (context-cued) < dictate (audio-cued)
  < reverse (uncued)**. Baseline cloze→dictate→reverse УЖЕ = легко→трудно. **ФИКС:** убрать «skip
  struggle из dictate → route to reverse». `recentStruggle` теперь ТОЛЬКО: (a) гейтит flagship (не
  гнать горящее слово вперёд мягкого cloze), (b) флейворит cloze-объяснение. reverse НИКОГДА не зовём
  «cued». `recent_struggle_prefer_cued` рендерится ТОЛЬКО для cloze.
- **[MAJOR — R2/R11: recentStruggle из ranked top-N (cap 20) неполон.]** `getRecentStruggles` усечён
  `Math.min(20)` → горящее due-слово за топ-20 молча не-struggle → ложно flagship-промотится. **ФИКС:**
  новый `learnerGraphRepo.recentStruggleKeySet(userId,{sinceMs,minFails})` — ПОЛНЫЙ Set (GROUP BY
  HAVING COUNT≥min, минус annulled), без cap. `getRecentStruggles` (ranked-display) не трогаем.
- **[MAJOR — R2: flagship на good≥1 + игнор dictate-fail loop.]** **ФИКС:** flagship-гейт =
  `readingStrong(receptive.good≥1 && good>again — НЕТТО-сильно) && !hasDictateHistory(rows) &&
  !recentStruggle`. `hasDictateHistory` («когда-либо диктовал») закрывает dictate-loop; NET-сильное
  чтение закрывает преждевременность. Копия смягчена: «уже знакомо при чтении» (не «уверенно узнаёшь»).
- **[MAJOR — R11: `select_reason` физически не доходит до prompt + теряется на recovery.]** prompt
  строится из `chal` (DB-строка), НЕ `pick`; recovery шлёт `open` challenge. **ФИКС:** миграция
  **031** `agent_challenges.select_reason TEXT`; `_capsFor` пишет; `_deliverPrompt`/`_deliverDictate`
  читают `chal.select_reason` → объяснение консистентно и на recovery. (класс A — enum-провенанс, не
  контент; переживает class-C purge как evidence_scope.)
- **[MAJOR — R11: flagship делает dictate-скан безусловным (cost).]** **ФИКС:** дёшево пре-фильтровать
  `readingStrong && !recentStruggle` (булевы из channel_stats/struggle-set) ДО дорогого
  `dictateFormForItemKey+hasAsset`; мемоизация `dictateEligible(item)` (один expensive-вызов на item,
  переиспользуется в шагах 1/3/5). Нет readingStrong-кандидатов → шаг 1 не платит ничего → cloze-first
  fast-path цел.
- **[MINOR] определённость порядка:** селектор-запрос due — `ORDER BY lapses DESC, due ASC, item_key
  ASC` (тотальный порядок). **[MINOR] fail-safe** `selectExplanation`: любой (reason×kind) вне таблицы
  → "" (не только неизвестный reason). **[MINOR] шум объяснений:** объяснение ТОЛЬКО для skill-reasons
  (flagship + cloze-struggle); default_* → без строки (премиум = редко+точно). **[MINOR] не расширять
  общий getDue:** `channel_stats` цепляется к строке ТОЛЬКО при `opts.withChannelStats` (селектор) →
  НЕ течёт в HTTP `/api/learner/due` и LLM-tool (getDue-sweep: 5 вызывателей проверены). **[MINOR]
  written≥3 baseline:** measure-doc отмечает eligible 6912→6827; оракул+bake оба через
  dictateFormForItemKey (согласованы). **[R2-defused]** struggle-слово только-dictate → шаг-3 даёт
  AUDIO-CUED dictate (средняя сложность, не «самая тяжёлая») — приемлемо, без queue-resting.

**Финальная политика (v2):** 1) flagship gap-dictate (readingStrong-net & !hasDictateHistory &
!struggle & dictate-eligible) → `reading_strong_close_dictation_gap`. 2) cloze → struggle?
`recent_struggle_prefer_cued` : `default_context`. 3) dictate любой eligible → `default_dictation`.
4) reverse strictSafe → `default_recall`. 5) null. Объяснение — ТОЛЬКО в 1) и cloze-struggle.

**Фикстуры гейта (verified):** flagship/dictate = `pid:1` לכתוב (len5, strictSafe); 2-букв профиль D =
`pid:2656` גן (len2, dictate-safe под старым предикатом, strictSafe → post-fix падает на reverse gloss
«сад» = НЕ audio, не тихий-0). Клиент-dictate history: review-строка channel `dictate:tg`.

**Язык объяснения:** ru/en как весь format.js (he→ru fallback surface-wide — избегаем mixed-language,
критика wf_72c44361).

---

## ДИФФ-КРИТИКА (3 линзы wf_8cd4658d, 2026-07-08) — NO BLOCKER/MAJOR-корректности; исправлено ДО коммита

Все 3 линзы: инварианты записи/грейда/evidence_scope/детерминизма/класс-A ЦЕЛЫ, LLM не выбирает,
select_reason challenge-bound. Найдены доработки (converged: readingStrong over-claim). **Исправлено:**

- **[MAJOR-converged R11, R2] readingStrong over-claim для DUE-слова.** Слово выбирается ПОТОМУ ЧТО due
  (частично забыто) — `good≥1 && good>again` (одиночный старый good, игнор `hard`) делал объяснение
  «уже знакомо при чтении» ложным. **ФИКС** (review.js:130): `good≥2 && good>(again+hard) &&
  last_grade≥3` (нетто-сильно + последний рецептив успешен = свежесть, консистентно с due). Копия уже
  смягчена. Гейт: профиль F (good=1 → НЕ flagship).
- **[MINOR R17] hasDictateHistory не исключал аннулированные dictate-строки** (единственный consumer,
  нарушавший системный инвариант; слово с ЕДИНСТВЕННЫМ аннулированным диктантом навсегда лишалось gap).
  **ФИКС** (review.js): `FC.collectAnnulled(rows)` по тем же per-item строкам, что channelStats.
- **[MINOR-teeth] гейт hand-build channel_stats** (config-string-match риск) → **ФИКС**: CS деривируется
  РЕАЛЬНЫМ продюсером `learnerProjectionRepo.channelStats(rows)` (pure). **[teeth] uncapped struggle не
  тестился** → профиль E (22 filler-слова с бОльшим #провалов → item вне ранж-топ-20, но uncapped
  struggleSet ловит → flagship suppressed). **[teeth] non-leak** → HTTP `/api/learner/due` assert без
  channel_stats. Гейт 19→**25/25**.

**Отложено (документировано, fail-safe edge):** (1) dictate near_miss не пишет историю → flagship может
переспросить (редко: reading-strong + без cloze/other + повторный ktiv-near_miss + истёкший cooldown;
fail-safe — переспрашивает валидную модальность; фикс = маркер попытки, сложно, отложен). (2)
recentStruggleKeySet считает grade≤2 (вкл. Hard(2)) — ИНТЕНЦИОНАЛЬНО (D1 маппит реальные production-
провалы в Hard; «давалось трудно» честно и для Hard). (3) dNoAsset ops-лог подавлен на flagship/cloze-
return — best-effort (owner запёк все 6912 ассетов → dNoAsset≈0).
