# CLG-P7.3d — reason-aware nudges (SKILL_GAP_AVAILABLE): RECON + SPEC (2026-07-09)

> Премиальная СОДЕРЖАТЕЛЬНАЯ причина нуджа поверх DUE_READY/RETURN_AFTER_GAP. Владелец 2026-07-09.
> ГЛАВНЫЙ ИНВАРИАНТ: **нудж не обещает того, что /review не сможет выдать** → SKILL_GAP считается ТЕМ ЖЕ
> eligibility-путём, что P7.2d selector (не упрощённой копией). Продолжение P7.3a/c (нудж LIVE, флаг ON).

## 0. Что уже есть (REUSE)

- P7.2d selector `agent/telegram/review.js::selectEligible` шаг 1 FLAGSHIP: слово due · readingStrong
  (channel_stats.receptive good≥2 && good>again+hard && last_grade≥3) · НИКОГДА не диктовал
  (hasDictateHistory itemRows+grade-policy, annul-исключён) · dictate-eligible (dictateFormForItemKey:
  омофон-безопасно + written≥3, computeDictateAssetKey + audioRepo.hasAsset, publicBaseUrl-https,
  !recentlyExposed) · !recentStruggle → dictate `reading_strong_close_dictation_gap` (review.js:110-160).
- P7.3c nudgeRepo: reason уже вычисляется (recentlyActive → DUE_READY : RETURN_AFTER_GAP), claim пишет
  реальный reason, reason decoupled от dedup-ключа (1 нудж/local_day).

## 1. Инвариант честности (нельзя ослаблять)

**НЕЛЬЗЯ** писать упрощённый SKILL_GAP-детект («есть слово без dictate-успеха → обещать диктант»). SKILL_GAP
= есть ≥1 due-item, проходящий ВЕСЬ flagship-eligibility (тот же путь, что вернёт selector). Гарантия по
ПОСТРОЕНИЮ: обе стороны зовут ОДНУ функцию.

**ФИКС-рефактор:** извлечь flagship-цикл из selectEligible в общий модуль `db/dictateGap.js`:
`firstFlagshipDictate(userId, { nowMs, items?, struggleSet? })` → дескриптор dictate ИЛИ null (getDue
withChannelStats + struggleSet + readingStrong + dictateEligible(мемо) + hasDictateHistory). selectEligible
шаг 1 → зовёт её (передаёт свои items/struggleSet — без двойного getDue). nudgeRepo SKILL_GAP → зовёт её
(без контекста → свои). ЕДИНАЯ истина «есть flagship-кандидат». Нудж НЕ создаёт exposure/challenge → кандидат
остаётся eligible для последующего /review (акцептанс).

## 2. Reason-приоритет (детерминированный, decoupled от dedup-ключа)

```
flagship = await dictateGap.firstFlagshipDictate(userId, {nowMs})   // дорого → ТОЛЬКО когда about-to-nudge
recentlyActive = engagedSince(now-7д)
reason = flagship ? SKILL_GAP_AVAILABLE
       : !recentlyActive ? RETURN_AFTER_GAP
       : DUE_READY
```
Приоритет **SKILL_GAP > RETURN_AFTER_GAP > DUE_READY** (owner-гипотеза — форк: перебивает ли SKILL_GAP
мягкий возврат для долго-отсутствовавшего). claim пишет реальный reason. Один нудж/local_day (dedup цел).

## 3. Класс-A текст (БЕЗ раскрытия целей)

SKILL_GAP: «Есть слова, которые можно проверить на слух — короткая тренировка: /review». **ЗАПРЕЩЕНО:**
само слово/HE-форма/RU-перевод/предложение/item_key/**количество именно dictate-кандидатов** (раскрывает
профиль). Форк: показывать ли ОБЩИЙ due-count («N слов, некоторые на слух») или БЕЗ числа (owner склоняется
к без-числа). formatSkillGapNudge(lang) — ru/en, статично.

## 4. Акцептанс: нудж↔selector консистентны

sweep увидел SKILL_GAP → состояние НЕ изменилось (нудж не expos'ит) → следующий /review selectEligible
вернёт kind:'dictate' (та же firstFlagshipDictate → тот же кандидат). Гейт: сид flagship-профиль → нудж
reason=SKILL_GAP → /review → dictate:tg challenge. (Не гарантируем ПЕРВЫЙ prompt при изменившемся
состоянии, но на момент нуджа ≥1 честный кандидат существует.)

## 5. Инварианты (наследуют P7.3a/c)

SKILL_GAP по ТОМУ ЖЕ eligibility, что selector (общая функция) · класс A (без слов/форм/count-dictate) ·
reason detached от dedup (1/local_day) · claim пишет реальный reason · backoff/mute/quiet/window/consent/
GDPR как P7.3c · нудж не создаёт exposure/challenge (акцептанс цел) · детерминированный priority-pick.

## 6. Гейт `smoke:telegram-nudge` (расширить, независимо)

+кейсы: flagship-профиль (reading-strong+never-dictated+asset+base) → нудж reason=SKILL_GAP + текст класс-A
(без HE/count-dictate) + последующий /review → dictate:tg. · нет asset / dictate-history / reading-weak →
НЕ SKILL_GAP (падает на DUE_READY/RETURN — консистентно с selector: /review НЕ дал бы flagship). · priority:
flagship+long-gap → SKILL_GAP (по owner-решению). · нудж↔selector: reason=SKILL_GAP ⇒ selectEligible=dictate
(one-source). Регрессия P7.3a/c + selector 25.

## 7. Открытые форки (owner)

1. **Priority SKILL_GAP vs RETURN_AFTER_GAP**: SKILL_GAP > RETURN (owner-гипотеза; вернувшийся с gap
   получает слуховой вызов) vs RETURN > SKILL_GAP (мягкий возврат первым для долго-отсутствовавшего).
2. **SKILL_GAP copy**: БЕЗ числа («есть слова для проверки на слух») vs с ОБЩИМ due-count («N слов,
   некоторые на слух»). НИКОГДА не count-of-dictate-кандидатов.

### 7b. OWNER-РЕШЕНИЯ (2026-07-09)
1. **Priority SKILL_GAP > RETURN_AFTER_GAP > DUE_READY** (вернувшийся с реальным gap → SKILL_GAP, а не
   мягкий возврат). `reason = flagship ? SKILL_GAP : !recentlyActive ? RETURN_AFTER_GAP : DUE_READY`.
2. **SKILL_GAP copy С ОБЩИМ due-count**: «N слов готовы, некоторые можно проверить на слух — /review»
   (N = ОБЩЕЕ due, как DUE_READY; НИКОГДА не число dictate-кандидатов). `formatSkillGapNudge(count, lang)`.

## 8. После P7.3d — inline-кнопки (ОТДЕЛЬНАЯ security-спека ДО кода)

`[Начать][Не сегодня][Напомнить позже]` — callback_query = НОВЫЙ write-surface. ДО реализации отдельная
security-секция: from.id→link binding · private-chat-only · message_id-binding (старая кнопка под старым
нуджем/после revoke/re-pair/нового нуджа/TTL → «уже неактуально», НЕ повтор-эффект) · update dedup ·
consent recheck перед эффектом · per-from rate · answerCallbackQuery (иначе клиент «крутится»).

## 8e. АДЪЮДИКАЦИЯ дизайн-критики (wf_659f597a, 3 линзы, 2026-07-09) — 1 BLOCKER + reshape + 2 owner-развилки

Все 3 линзы КОНВЕРГИРОВАЛИ. Скорректированный дизайн (к подтверждению owner ДО кода):
- **[BLOCKER — getDue window]** «одна функция» НЕ гарантирует нудж==reality: результат зависит от getDue-
  ОКНА. selectEligible → limit:50; flagship-кандидаты LOW-lapse → ХВОСТ `lapses DESC` → при >50 due
  выпадают из топ-50. Если nudge firstFlagshipDictate использует ДРУГОЙ limit → находит кандидата на
  позиции 200, которого /review (limit 50) НИКОГДА не достигнет → нудж «на слух», /review не даст.
  **ФИКС:** firstFlagshipDictate ОБЯЗАН getDue({limit:50, withChannelStats:true, тот же nowMs}) — ОБЩАЯ
  константа FLAGSHIP_DUE_LIMIT. Гейт: >50 due, flagship на позиции 51+ → нудж↔/review согласны.
- **[MAJOR — withChannelStats]** readingStrong читает channel_stats.receptive; getDue даёт его ТОЛЬКО при
  withChannelStats. Забыт флаг → readingStrong всегда false → SKILL_GAP молча НИКОГДА. **ФИКС:**
  withChannelStats:true захардкожен ВНУТРИ firstFlagshipDictate (не опционально). Гейт: сид real
  channel_stats + драйв РЕАЛЬНОГО нудж-пути.
- **[MAJOR — dictCache/isExposed]** selectEligible шаги 1/3 делят ОДИН dictCache + ОДИН isExposed-снимок
  (review.js:105-107 «нет дрейфа»). Извлечение firstFlagshipDictate с приватным кэшем → шаг 3 пере-
  считывает O(N) + isExposed дрейфует в одном /review. **ФИКС:** selectEligible СТРОИТ dictCache+isExposed
  и ПЕРЕДАЁТ в firstFlagshipDictate (optional args). Гейт: dictateFormForItemKey/hasAsset ≤1 на item/вызов.
- **[MAJOR — cost 306MB в cron]** flagship-скан грузит keyingService (≈306MB, 0.8-2с) в фоновом sweep,
  контейнер 1536MB с TTS. **ФИКС:** flagship за ВСЕМИ дешёвыми гейтами (backoff/window/claimedToday/due —
  ≤1/юзер/день, уже так); переиспользовать items (getDue({limit:50,withChannelStats}) ОДИН раз, отдать в
  firstFlagshipDictate И в due>0-гейт — count из отдельного 500-скана/COUNT); подтвердить idle-unload RSS.
- **[MAJOR — гейт тавтологичен + temporal drift]** «reason=SKILL_GAP ⇒ selectEligible=dictate» (обе зовут
  одну fn) = «функция согласна с собой». Реальный break: между утренним нуджем и вечерним /review due-
  кольцо/struggleSet(24ч)/cooldown(30мин) сдвигаются → /review даёт cloze/reverse. **ФИКС:** гейт драйвит
  РЕАЛЬНЫЙ startReview→createChallenge→dictate:tg (не re-call fn) + state-drift кейс (инжект 2 провала /
  higher-lapse due между нуджем и /review); акцептанс = «консистентно НА МОМЕНТ нуджа» (не вечно).
- **[MINOR — copy]** «на слух» именует модальность, которая может не дожить до /review (drift). Owner
  выбрал «N слов, НЕКОТОРЫЕ можно проверить на слух» — «некоторые» хеджирует (момент-честно). Остаточный
  trade: премиум-повод vs редкий мис-промис. Принять хедж + документировать ИЛИ softer без модальности.

### ⚠ ДВЕ OWNER-РАЗВИЛКИ (критика дала НОВУЮ инфу — пере-решить):
1. **Priority (пере-решить):** owner выбрал SKILL_GAP>RETURN, НО readingStrong КУМУЛЯТИВЕН → у
   вернувшегося (≥7д) старое reading-strong слово выпадает due → SKILL_GAP фаерит на ВОЗВРАТЕ → холодный
   аудио-вызов churn-риск-юзеру; RETURN становится near-dead для своей аудитории. Критика (3 линзы):
   **RETURN > SKILL_GAP** (SKILL_GAP только для recentlyActive) — педагогически безопаснее + cost-win
   (не грузить keyingService для вернувшихся). Рекомендация: RETURN > SKILL_GAP.
2. **Строить сейчас vs отложить (measure-before-code):** dictate LIVE → каждый /review-диктант даёт
   dictate-history → слово НАВСЕГДА вне flagship-набора → пул САМО-ИСТОЩАЕТСЯ → SKILL_GAP при n=1 РЕДКО
   фаерит (в основном DUE_READY). Высокая сложность (общий модуль, рефактор selectEligible, keying-load,
   гейт) ради редко-срабатывающей причины. Критика: замерить частоту firstFlagshipDictate на профиле
   owner (неделя offline-replay) ДО кода; если редко — ОТЛОЖИТЬ до нетривиального пула.

## 9. Дисциплина

Существенный дизайн → adversarial-критика в ФОНЕ (3 линзы R17-честность/R2-R5-UX/R11-R16) ДО кода →
owner-форки → код → критика диффа → независимый гейт → регрессия → commit+push → live-verify.
