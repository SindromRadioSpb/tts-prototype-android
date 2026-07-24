# 05 — Горизонт 3: R&D-чартеры (НЕ roadmap, НЕ обещание фич)

Каждый чартер — отдельное исследование с собственными порогами успеха/провала и stop-условиями.
Owner decisions Д6-P/Д6-A от 2026-07-24 портфельно разрешают параллельный R&D C1–C5 и снимают
`G-H2-CLOSURE`, duration/data-volume/case-count thresholds как стартовые блокеры. Исходный порядок
C1→C5 остаётся priority/reporting order. Недостающая evidence maturity собирается параллельно;
вывод до целевого порога маркируется `UNDERPOWERED`, но исследование может начинаться. Hard
action-gates consent/privacy/exact cost cap/no-write и релевантный H2 stop condition не ослабляются.
Выход чартера — evidence-отчёт и рекомендация, не код в проде. Провал — валидный
результат. Production-планирование любой из тем возможно только ПОСЛЕ закрытия чартера с
положительным вердиктом и отдельного owner-решения.

## C1 — Hebrew pronunciation scoring (P1-B)

| | |
|---|---|
| Research question | Достижим ли на открытых компонентах (ivrit.ai ASR + forced alignment + Phonikud G2P) пословный фидбек о произношении с полезностью выше «ASR тебя не понял»? |
| Why now/not now | Now: готового для иврита не существует нигде (Azure/Speechace — нет иврита) — ниша. Not now: L-сложность, нужен корпус собственной речи владельца (появится из H2.6) |
| Start floor / recommended maturity | H2.5/H2.6 закрыты — start floor PASS. ≥60 мин реальной речи владельца с подтверждёнными транскриптами — recommended evidence target, набирается параллельно; до него вывод `UNDERPOWERED` |
| **Обязательное разделение осей** | ASR-correctness (что сказано) ≠ pronunciation quality (как) ≠ phoneme alignment ≠ ударение ≠ беглость ≠ грамматика ≠ семантика. Чартер оценивает ТОЛЬКО оси 2–4; смешение осей = провал дизайна |
| Benchmark | Эталон: владелец начитывает 50 предложений + 25 намеренно искажённых (сдвиг ударения, подмена гласной); скоринг должен отделить искажённые от нормальных |
| Success | ≥80% искажений детектированы при ≤20% ложных срабатываний на нормальных; фидбек указывает слово и тип искажения |
| Failure | Точность неотличима от случайной ИЛИ фидбек не локализуется до слова |
| Build-vs-buy | Buy невозможен (нет продукта); build: whisper-timestamped/stable-ts + CTC-aligner (torchaudio MMS_FA) + Phonikud IPA+ударение |
| Privacy | Записи владельца остаются локально; в отчёт — только агрегаты |
| Cost | Локально, 0 маржинальных; GPU опционален |
| Stop conditions | 3 недели без прохождения порога; alignment-качество на иврите фундаментально недостаточно; Phonikud-IPA расходится с реальностью на >10% эталона |
| Evidence до production | Закрытый чартер + повторение результата на свежих записях + owner-вердикт полезности фидбека |

## C2 — Realtime Hebrew voice (P1-C)

| | |
|---|---|
| Research question | Даёт ли realtime-диалог (Gemini Live, иврит поддержан) достаточный прирост над async-петлёй H2.6, чтобы оправдать websocket-пайплайн вне MCP и metered-затраты? |
| Why not now | Async-петля должна сначала показать usage; realtime — отдельный клиент (hermes-agent текстовый), R16-metered |
| Start floor / recommended maturity | H2.6 closed — start floor PASS. ≥4 недели регулярного async-voice evidence — recommended comparative baseline, набирается параллельно. Hard gate: точный R16-конверт и явное cloud-audio consent до первого live Gemini call |
| Benchmark | 3 сессии async vs 3 realtime: реплик юзера/мин, субъективная тревожность, стоимость |
| Success | Реплик/мин ≥×1.5 async при cost/сессию в пределах конверта, заданного владельцем до старта |
| Failure/Stop | Латентность/качество иврита ломают диалог; стоимость выходит из конверта; 2 недели без рабочего прототипа |
| Privacy | Аудио уходит в облако Google — ЯВНОЕ owner-согласие до первого теста; никаких личных текстов в системный промпт realtime-сессии |
| Cost | Metered (AGENT_GEMINI_API_KEY, строгий R16-конверт: лимит $/нед, установленный владельцем заранее) |

## C3 — MC-glosses в Читальном зале (P7)

| | |
|---|---|
| Research question | Поднимают ли multiple-choice глоссы целевых слов (evidence: ×1.7 к выучиванию) вовлечённость/удержание в Зале, не ломая чтение? |
| Why not now | Это код UI Зала (LinguistPro), конкурирует за слоты с H2; эффект зависит от плотности due-слов в читаемом |
| Start floor / recommended maturity | H2.2 closed; `get_text_coverage` жив; H2.7 не имеет active stop condition, затрагивающего coverage/Reading Room — PASS |
| Benchmark | A/B на себе: 2 нед чтения с MC-глоссами vs 2 без; retention целевых слов по review_log (детерминированно) |
| Success | Заметный прирост retention целевых слов без падения минут чтения |
| Failure/Stop | Чтение фрагментируется (минуты падают >20%); глоссы игнорируются (<30% открытий) |
| Инварианты | Грейд MC-выбора НЕ пишется в review_log как review (это exposure, не retrieval! письмо только через существующие детерминированные пути); R17 |

## C4 — S4: агент видит ②-заметки владельца

| | |
|---|---|
| Research question | Улучшает ли доступ агента к личным формулировкам смыслов (②-заметки, 10K+) качество разборов настолько, чтобы оправдать PERSONAL-scope на самый личный корпус? |
| Why not now | Самые чувствительные данные; ценность не доказана; сначала пусть петли H1/H2 покажут, чего агенту реально не хватает |
| Start floor / recommended maturity | H1/H2 учебные петли закрыты на уровне слайсов — start floor PASS. Накопленные случаи «агент объяснил хуже, чем моя заметка» — recommended benchmark target, собирается параллельно. Hard gate: новый scope + consent + note-exposure provenance до первого чтения заметки |
| Benchmark | 20 слов с заметками: разбор без доступа vs с доступом; слепая оценка владельцем |
| Success | Владелец предпочитает «с заметками» в ≥70% пар |
| Privacy | Новый scope `personal.notes.read` + отдельная церемония + exposure-леджер РАСШИРЯЕТСЯ на заметки до первого чтения (провенанс прежде доступа — урок S2) |
| Stop | Ценность <70%; или owner отзывает интерес |

## C5 — Phase-2: взвешивание по agent_exposed меткам

| | |
|---|---|
| Research question | Накопив точечные exposure-метки (леджер 053), можно ли честно взвешивать модальности/полу-экспонированные признаки — например, cloze по агентом-читанному предложению чуть дисконтировать в аналитике честности? |
| Why not now | Данных мало (леджер живёт с v3.11.221); любое взвешивание раньше данных = карго-культ |
| Start floor / recommended maturity | Текущий ledger доступен для preliminary offline/read-only анализа. ≥8 недель и ≥200 `agent_exposed` review events — recommended power target, набирается параллельно; до него только `UNDERPOWERED`, без предложения production-весов |
| Benchmark | Ретроспективный анализ review_log: отличается ли recall на exposed vs non-exposed стимулах статистически |
| Success | Обнаружен и квантифицирован эффект → предложение веса владельцу (решение — его) |
| Failure (тоже ценно) | Эффекта нет → провенанс остаётся честностью-меткой, веса не нужны — закрыть тему |
| Инварианты | FSRS-расписание НЕ меняется в рамках чартера вообще (анализ offline); R17 анти-циркулярность: метрики честности не должны опираться на суждения самого агента |

## Общее правило запуска

Каждый чартер стартует отдельной чистой сессией через `prompts/H3_RND_EVALUATION_PROMPT.md` с
подставленным идентификатором. Д6-A даёт research-go всем C1–C5; сессии могут идти параллельно,
приоритет и сводная отчётность сохраняют порядок C1→C5. Никакой чартер не наследует cost envelope,
privacy ceremony, action-gate или положительный verdict другого.

## Readiness после Д6-A, 2026-07-24

| Чартер | Статус | Фактическая причина |
|---|---|---|
| C1 | PLANNED / RUNNABLE #1 | Старт на доступных 3.421 мин; ≥60 мин набираются параллельно, ранний вывод `UNDERPOWERED` |
| C2 | PLANNED / RUNNABLE #2 | Architecture/mock work разрешён; ≥4 недели async baseline параллельно; live cloud call ждёт exact cost cap + consent |
| C3 | PLANNED / RUNNABLE #3 | H2.2 CLOSED; production `get_text_coverage` жив; H2.7 не фиксирует active stop condition |
| C4 | PLANNED / RUNNABLE #4 | Contract/prototype разрешён; cases набираются параллельно; чтение заметок ждёт scope/consent/provenance |
| C5 | PLANNED / RUNNABLE #5 | Preliminary offline analysis разрешён; ≥8 недель/≥200 events параллельно; FSRS/review scheduling immutable |
