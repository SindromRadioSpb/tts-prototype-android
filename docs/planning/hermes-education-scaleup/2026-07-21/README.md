# hermes-education-scaleup — implementation-ready planning package (2026-07-21)

**Исходный статус направления: OWNER-APPROVED DIRECTION / PLANNING.** Пакет с тех пор исполняется;
никакой статус реализации нельзя выводить из этой исторической шапки. Живой леджер прогресса —
**STATUS.md** (единственный), а слайс получает статус только после соответствующих гейтов (10).

Базис: утверждённое исследование `docs/research/hermes-education-scaleup/2026-07-21/` (463abca).
Промт-источник пакета: `docs/research/hermes-education-scaleup/promt21072026.md`; принятые
корректировки промта: `docs/research/hermes-education-scaleup/PROMPT_CORRECTIONS_2026_07_21.md`.
Фактический базлайн планирования: HEAD 463abca, v3.11.221, 16 MCP-инструментов, миграции до 053.

## Утверждённое направление (кратко)

Замкнуть production-петли (речь, письмо) и SRL-цикл при вечных инвариантах W0 / W1
propose-then-confirm / «кто учит — не сертифицирует» / провенанс / R16 / R11.
Исходное секвенирование было: **H1 (Hermes-side, без кода LinguistPro) → closure → H2 (новые
MCP/W1-инструменты LinguistPro + голос) → closure → H3 (только R&D-чартеры)**. Owner amendment
Д6-P/Д6-A от 2026-07-24 разрешают параллельный H3 R&D C1–C5 до закрытия H2.7. Исходный порядок
C1→C5 сохраняется как priority/reporting order; longitudinal maturity targets набираются
параллельно и не блокируют старт. Consent/privacy/exact-cost/no-write gates и monitoring H2
остаются обязательными и могут остановить затронутый H3 path. P11 — отдельная опция вне очереди.
Более позднее owner-решение Д6-C3-D от 2026-07-25 переводит C3 в `DEFERRED / OWNER-BACKLOG`:
исследование не отвергнуто и не закрыто, но исключено из active queue до явного возобновления.

## Порядок чтения

| Файл | Что это |
|---|---|
| `00_OWNER_DECISION_AND_SCOPE.md` | Что утверждено; что осталось владельцу (Д1–Д7); defaults (Ф1–Ф6); что пакет НЕ разрешает |
| `01_TARGET_LEARNING_ARCHITECTURE.md` | Текущие/целевые петли (Mermaid), граница teach/certify, спецификация каждой петли |
| `02_PROGRAM_DEPENDENCY_AND_SEQUENCE.md` | DAG P1–P11×H1–H3, типы зависимостей, параллелизация, что блокировано |
| `03_HORIZON_1_EXECUTION_DESIGN.md` | 9 слайсов H1 с DoR/DoD/rollback/non-goals |
| `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` | Точные контракты новых инструментов (схемы, ошибки, идемпотентность, scopes) |
| `05_HORIZON_3_RND_CHARTERS.md` | 5 R&D-чартеров с порогами и stop-условиями |
| `06_SKILLS_AND_GUARDRAILS_CONTRACT.md` | Trainer policy (25 правил) + 3 state machines — канон поведения Hermes |
| `07_DATA_CONSENT_PROVENANCE_SECURITY.md` | Категории данных × owner/consent/retention/revoke; новые scopes |
| `08_MEASUREMENT_EXPERIMENT_ROLLOUT.md` | Метрики (не XP), per-slice рамки, rollback-пороги, no-go |
| `09_COST_CAPACITY_OPERATIONS.md` | Ресурсы/стоимость/fallback; 1/20/100 (20/100 — SPECULATIVE) |
| `10_ACCEPTANCE_GATES_AND_CLOSURE.md` | Гейты с проверяемыми артефактами |
| `11_HANDOFF_TO_CODEX_5_6_SOL.md` | Правила Codex-сессий, проектные ловушки, формат отчёта |
| `STATUS.md` | Живой леджер статусов (обновляется каждой сессией) |
| `prompts/` | 20 самодостаточных промтов (см. ниже) |
| `hermes-side/` | (создаётся слайсами) канонические копии Hermes-артефактов — G:\HERMES_AGENT не git |

## Как использовать prompts/ в Codex GPT-5.6 Sol

Одна сессия = один промт = один слайс (11 §1). **Первый промт:
`prompts/H1_01_TRAINER_POLICY_AND_GUARDRAILS.md`.** Далее H1_02→04 (скиллы, параллелизуемы),
H1_05→08 (интеграции, параллелизуемы), H1_09 (closure). `H1_00`/`H2_00` — диспетчеры, не задания.
**Все H2-промты BLOCKED UNTIL H1 CLOSURE + owner go (Д5); H3 — один parametrized prompt,
portfolio research-go Д6-A исторически записан для C1–C5, но C3 отложен по Д6-C3-D и не runnable
без явного owner resume; остальные активные чартеры идут с исходным priority C1→C5;
P11 — вне цепи (Д3).** Нумерация промтов сдвинута на +1 от слайсов
(H1_01 = слайс H1.0).

## Что разрешено реализовывать сейчас

Живой источник — `STATUS.md`. После Д6-A разрешены отдельные параллельные H3 R&D-сессии через
`prompts/H3_RND_EVALUATION_PROMPT.md`; C3 исключён из active queue по Д6-C3-D до явного owner
resume, остальные запускать/сводить в исходном порядке. H2.7 consent, cost и
parallel-monitor evidence продолжаются независимо. После frozen C1 `DONE_NO_GO / UNDERPOWERED`
владелец отдельно разрешил C1-X Experimental Local Companion; его product-контракт и гейты живут
в `C1_EXPERIMENTAL_LOCAL_COMPANION_PLAN_2026_07_24.md`, 05 §C1-X, 10 §5.1 и отдельном prompt.

## Adversarial review пакета (проведён 2026-07-21, до коммита)

Чеклист промта-источника; вердикты и принятые меры:

| # | Проверка | Вердикт |
|---|---|---|
| 1 | Скрытый write-path у Hermes? | НЕТ: все записи — proposals+owner confirm; исполнение — детерминированные серверные пути; ASR-обёртка пишет только в свой Hermes-side лог |
| 2 | LLM стал источником морфо-истины? | НЕТ: в резолв-пути get_word_morphology LLM отсутствует; kaikki помечен «справка, не канон» (H1.7) |
| 3 | Второй scheduler? | НЕТ: goal-store — не расписание; Anki-MCP из research СОЗНАТЕЛЬНО не включён в слайсы; C3 не пишет review_log |
| 4 | Exposure смешан с mastery? | НЕТ: правило 15 политики; evidence-поле track_word различает произведено/показано; C3 explicit |
| 5 | ASR выдаётся за pronunciation scoring? | НЕТ: запрет в 04 §5, H2_05, 01 §4.4; оси разделены в C1 |
| 6 | H3 обещает готовые функции? | НЕТ: чартеры = research question + пороги; выход — отчёт, не код в проде |
| 7 | P11 смешан с образовательным roadmap? | НЕТ: отдельный промт вне цепи, запуск только по Д3; 02 §6 запрещает «заодно стандартизировать» |
| 8 | Schema-breaking расширения? | НЕТ: только новые инструменты (Ф2); снапшот-диф — гейт G-H2-CLOSURE и шаг каждого H2-промта |
| 9 | Скрытое хранение raw audio? | НЕТ: Д7 — удаление после ASR, проверяется smoke H2_05 |
| 10 | Автоимпорт copyrighted lyrics? | НЕТ: только W1-preview с источником/URL и подтверждением владельца; скрейпинг Shironet/Genius запрещён явно (H1_07, 03_TECH) |
| 11 | Метрики, которые агент рисует сам себе? | Контролируется: primary-метрики детерминированные + owner-вердикты (08 §1); retry success/повторные ошибки — вспомогательные наблюдения, НЕ гейт-метрики |
| 12 | Каждый Codex-промт исполним независимо? | ДА: роль/чтение/предпроверки/шаги/acceptance/rollback/отчёт в каждом; самодостаточность = пути+инварианты (PROMPT_CORRECTIONS §A2) |
| 13 | Rollback и no-go определены? | ДА: per-slice в 03/08 + в каждом промте; провал слайса — валидный исход (11 §5) |

Дополнительные находки ревью: (а) G:\HERMES_AGENT — не git → введён hermes-side/-канон (Ф1);
(б) закрытие «closure без леджера» → STATUS.md обязателен для каждой сессии; (в) первоначально
H1.3/H1.8 требовали блокирующее ≥2-недельное окно. Owner amendment 2026-07-23 перенёс его в
обязательный параллельный monitoring с day-14 follow-up и stop-условиями 08 §3.

## Провенанс пакета

Составлен Claude (Fable) в сессии 2026-07-21 по скорректированному промту владельца; корректировки
зафиксированы отдельным файлом (см. шапку). Документы — ручной синтез по живому коду и
утверждённому исследованию; субагенты для черновиков не использовались (когерентность контрактов).
