# H3 — R&D evaluation prompt (единый для всех чартеров; НЕ production delivery)

> Post-result note for C1 only: this prompt remains the immutable research-session contract.
> After C1 closed `DONE_NO_GO / UNDERPOWERED`, the owner separately authorized C1-X experimental
> productization. C1-X executes only through `H3_C1_EXPERIMENTAL_LOCAL_COMPANION_PROMPT.md`; that
> exception does not retroactively weaken this prompt or the frozen benchmark.

> **Post-priority note for C3:** owner decision Д6-C3-D от 2026-07-25 переводит C3 в
> `DEFERRED / OWNER-BACKLOG`, поскольку MC-glosses сейчас создадут больше продуктового шума, чем
> пользы. Это не `NO-GO` и не `CLOSED`. Не запускай `ЧАРТЕР=C3` без нового явного owner-решения о
> возобновлении.

> **Owner research-go:** Д6-A на параллельный портфель C1–C5 зафиксирован 2026-07-24.
> `ЧАРТЕР = C1 | C2 | C3 | C4 | C5` остаётся полным историческим перечнем; текущий запуск разрешён
> для активных чартеров согласно `STATUS.md`, а C3 отложен по Д6-C3-D. Исходный priority/reporting
> order C1→C5 сохраняется. `G-H2-CLOSURE` и longitudinal maturity thresholds не блокируют
> старт; evidence набирается параллельно, а ранний вывод маркируется `UNDERPOWERED`. H2.7 и оба
> parallel monitor продолжаются; active stop condition блокирует затронутый charter path.

## Роль и цель
Исследователь-прототипист ОДНОГО чартера. Цель — ответить на research question чартера
экспериментом и дать go/no-go рекомендацию. НЕ обещать и НЕ поставлять production-функцию:
выход = evidence-отчёт + одноразовые прототипы. Провал порогов — валидный, полезный результат.

## Обязательное чтение
1. `docs/planning/hermes-education-scaleup/2026-07-21/05_HORIZON_3_RND_CHARTERS.md` — раздел
   твоего чартера: research question, пороги успеха/провала, stop conditions, prerequisites,
   privacy/cost-рамки. Это КОНТРАКТ исследования; пороги не ослабляются изнутри сессии.
2. `STATUS.md`, `README.md` пакета, `11_HANDOFF_TO_CODEX_5_6_SOL.md` (правила сессий).
3. Для C1 дополнительно: `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` §5 (ASR-контракт) и
   research `03_TECH_ENABLERS_MCP.md` §1.
4. Для C5 дополнительно: `migrations/053_agent_text_exposures.sql` + `db/agentTextExposureRepo.js`
   (живой леджер) — анализ строго offline/read-only.

## Жёсткие рамки (все чартеры)
- Никакого кода в прод LinguistPro; никаких изменений FSRS/review_log/расписаний; прототипы —
  в `docs/research/hermes-education-scaleup/rnd-<чартер>-<дата>/` + scratch.
- C1: оси разделены (ASR-correctness ≠ pronunciation quality ≠ alignment ≠ ударение ≠ беглость ≠
  грамматика ≠ семантика) — смешение осей = провал дизайна; ASR-транскрипция сама по себе НЕ
  является оценкой произношения.
- C2: metered (Gemini Live) — конверт $/нед задан владельцем ДО первого вызова; аудио в облако —
  только после явного согласия владельца; личные тексты в системный промпт не попадают.
- C3: MC-выбор глоссы — это exposure, НЕ retrieval: в review_log не пишется ничего.
- C4: до первого чтения заметок — расширение exposure-леджера на заметки (провенанс прежде
  доступа); scope не выдаётся «на постоянно» ради эксперимента — временная выдача, отзыв после.
- C5: FSRS не трогается вообще; выход — статистический отчёт + предложение весов владельцу.
- Privacy: записи/данные владельца остаются локально; в отчёт — агрегаты.
- Stop conditions чартера соблюдаются по календарю: срок вышел → честная фиксация неуспеха.

## Пошаговая работа
1. Предпроверки: STATUS (Д6-A записан; чартер PLANNED), текущий объём evidence измерен живыми
   данными и помечен `MATURE|UNDERPOWERED`, active H1/H2 stop conditions для path отсутствуют.
   Недостаток recommended maturity не блокирует prototype/research work.
2. Спроектируй эксперимент СТРОГО под benchmark чартера (05); опиши протокол ДО прогона
   (pre-registration стиль — в отчёт).
3. Собери прототип минимальной сложности, достаточной для замера.
4. Прогони benchmark; посчитай метрики против порогов успеха/провала.
5. Отчёт `docs/research/hermes-education-scaleup/rnd-<чартер>-<дата>/REPORT.md`: протокол,
   данные (агрегаты), результат vs пороги, ограничения, рекомендация GO/NO-GO/ITERATE,
   что потребуется для production-планирования (если GO).
6. STATUS.md: строка чартера → DONE_GO / DONE_NO_GO / STOPPED (+ссылка на отчёт). Коммит+push
   (`docs(hermes-scaleup): R&D <чартер> report`).

## Запреты финала
Не начинать production-планирование внутри сессии даже при ярком успехе — это отдельное
owner-решение. Не удалять неудачные результаты (они и есть ценность).

## Отчёт сессии
По 11 §4 + вердикт по порогам чартера.
