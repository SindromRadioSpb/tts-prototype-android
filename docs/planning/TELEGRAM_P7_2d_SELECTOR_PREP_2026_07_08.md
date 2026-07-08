# CLG-P7.2d — premium modality selector: дизайн-prep (2026-07-08)

> Стартовый бриф для НОВОЙ сессии. P7.2a reverse:tg · P7.2b cloze:tg · P7.2c dictate:tg — все три
> честные production-модальности SHIPPED и **owner live-verified на проде** (dictate 2026-07-08,
> AGENT_REVIEW_WRITE=1). Сейчас выбор модальности — ФИКСИРОВАННЫЙ порядок. P7.2d делает выбор
> **по состоянию навыка + объясняет выбор** («бот учит, не болтает» — R17).

## 0. Что уже есть (не переписывать)

- **3 модальности, единый challenge-механизм** (migration 028/029/030, agentChallengeRepo): reverse
  (RU-глосс→HE, evidence_scope=lexeme, класс A) · cloze (пропуск в своём тексте, expected=поверхность,
  evidence_scope=cloze, класс C, двойной consent) · dictate (аудио→написание, expected=письменная,
  evidence_scope='cell', класс A).
- **Селектор сейчас** — `agent/telegram/review.js::selectEligible`: жёсткий порядок
  **cloze → dictate (2-й проход по всем due) → reverse strictSafe → ничего**. Анти-старвация и
  cooldown (`tg_stimulus_exposure`, 30 мин) уже есть.
- **D-1/D-4 grade-policy** (`public/js/grade-policy.js`): production-провал на рецептивно-сильном →
  Hard(2); dictate-успех (cell, не context-supported) защёлкивает `hasProvenProduction` ТОЛЬКО для
  dictate-семьи (не сертифицирует reverse). `channelStats` (production/receptive: reps/again/hard/good/
  last per family) в `srs_projections.channel_stats_json`.

## 1. Готовые сигналы состояния навыка (grounded — использовать, не изобретать)

| Сигнал | Где | Что даёт |
|---|---|---|
| `channelStats` (production/receptive) | `learnerProjectionRepo` / `srs_projections.channel_stats_json` | reps/again/hard/good/last по семье канала для СЛОВА |
| `hasProvenProduction(rows, channel)` | `grade-policy.js` | доказана ли unsupported-production В СЕМЬЕ канала (modality-сегментировано) |
| `productionImbalance` | `agent/constructs.js` (planner) | reading-сильно ↔ production-слабо (prodFails=again+hard) |
| `channelGap` конструкты | `agent/constructs.js` | reading→dictation / reading→reverse / receptive→production разрывы |
| `getRecentStruggles` | `db/learnerGraphRepo.js` | ≥2 провала за 24ч учебного времени + канал провала |
| `evidence_scope` история | `review_log.meta_json` | чем УЖЕ доказано слово (lexeme/cloze/cell) → чего НЕ хватает |

## 2. Открытые дизайн-решения (для adversarial-критики + owner)

1. **Политика выбора модальности по навыку.** Каркас-гипотеза (обосновать/опровергнуть критикой):
   - reading-сильно + production-НЕ-доказано → предпочесть production-модальность;
   - reverse уже доказан (lexeme), dictate — нет → предпочесть **dictate** (сложнее, uncued, закрывает
     реальный gap; D-4 сегментация именно это и мерит);
   - недавние dictate-провалы (`getRecentStruggles` канал=dictate) → откатиться на **reverse** (cued
     смыслом) или **cloze** (cued контекстом) — не долбить самой сложной модальностью подряд;
   - cloze доступен И reading уже сильно → возможно НЕ приоритезировать cloze (сейчас он всегда первый —
     развилка: должен ли skill-state перебивать «cloze-first»?).
   Инвариант: cooldown по item_key + анти-старвация сохраняются; порядок становится score-based, не
   жёстким.
2. **Объяснение выбора** («почему это упражнение») — честное, класс A, без PII/id. Паттерн — mentor-
   home/format (textContent-only, i18n ru/en/he). Что показывать: модальность + причина из сигнала
   («ты хорошо узнаёшь это слово в чтении — проверим, сможешь ли воспроизвести на слух»). НЕ раскрывать
   ответ/сырой лог/construct_id.
3. **Dictate word-quality (вход из live-verify 2026-07-08).** 2-буквенные слова — плохие цели диктанта
   (85 items: פן/לא/של/פה…). Решение: мин. длина written **≥3** в `keyingService.dictateFormForItemKey`
   (замер −85 = 1.2%) и/или исключить function-POS. Прод-ассеты 2-букв остаются (безвредно, просто не
   выбираются). Owner решает точный порог.
4. **Приоритет при нескольких eligible** — сейчас cloze всегда побеждает. Должен ли score перевесить
   (напр. при reading-strong давать production-модальности вперёд cloze)?

## 3. Инварианты (нельзя ослаблять)

Запись ТОЛЬКО challenge-bound + webhook-trusted · выбор ДЕТЕРМИНИРОВАН из состояния (LLM НЕ выбирает
модальность — объясняет уже выбранное, R17: «кто учит — не сертифицирует») · dictate ТОЛЬКО при
готовом ассете + омофон-фильтр · evidence_scope канон по модальности (fail-closed EXPECTED_SCOPE) ·
D-4 modality-сегментация · privacy (класс A/C как есть) · cooldown + анти-старвация · оракул
replay==stored.

## 4. Гейт (независимый оракул, не тавтология)

Расширить/новый `smoke:telegram-selector`: сид РАЗНЫХ skill-профилей (reading-strong+prod-weak;
reverse-доказан+dictate-нет; недавние dictate-провалы) → assert выбранная модальность == политике +
объяснение присутствует и класс-безопасно + НЕТ регрессии старых гейтов. Переиспользовать harness
telegram-dictate/cloze. Плюс мин-длина: 2-буквенное due-слово НЕ выбирается как dictate.

## 5. Рабочая дисциплина (сработала 4× подряд)

Существенный дизайн → **adversarial-критика в ФОНЕ** (Workflow, 3 линзы R17/R2-R5/R11+R16, grounded
file:line) И на спеке ДО кода, И на ДИФФЕ до коммита · measure-before-code для сомнительного · гейт с
зубами (независимый оракул) · релевантные smoke:* · commit+push в main после зелёных.

## 6. Статус прода (важно для новой сессии)

**dictate LIVE на проде** (AGENT_REVIEW_WRITE=1 включён owner'ом 2026-07-08 → активирован ВЕСЬ P7.2
write-path: reverse+cloze+dictate пишут в review_log реального профиля владельца). Каноны: этот файл ·
TELEGRAM_P7_2c_DICTATE_SPEC (SHIPPED+live-verify в конце) · _2b_CLOZE_SPEC · _P7_2_REVIEW_SPEC_v3 ·
TELEGRAM_P7_DECISION_2026_07_06.md. Память: project_ai_mentor_cloud_graph.md §9.
