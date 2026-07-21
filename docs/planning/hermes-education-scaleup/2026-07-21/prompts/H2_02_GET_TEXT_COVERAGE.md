# H2_02 — Слайс H2.2: get_text_coverage (i+1 по расчёту)

> **BLOCKED UNTIL H1 CLOSURE + owner go (Д5).** Проверь STATUS.md: G-H2-START пройден. Иначе СТОП.

## Роль и цель
Инженер-исполнитель одного слайса в `E:\projects\tts-prototype-android`. Цель: новый MCP
read-инструмент `get_text_coverage` — детерминированное покрытие текста знанием ученика
(token/lemma/content-word, buckets, band). Контракт — 04 §2 (канон).

## Обязательное чтение
Пакет: `README.md`, `STATUS.md`, `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` (§0+§2),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`. Живой код: AA-слой (файлы как в H2_01 §чтение-2);
`public/js/lemma-canon.js` (канонический кейер — покрытие ОБЯЗАНО считаться тем же кейером,
что review_log); серверные проекции learner-состояния (word_status/review_log sync — найди
фактические таблицы/репо); S1/S2-хендлеры личных текстов (`agent/access/productionHandlers.js`,
`db/agentTextGrantsRepo.js`) — грант-гейт переиспользуется.

## Инварианты
НЕ один непрозрачный процент — все поля контракта; proper names и unresolved считаются отдельно
(не «незнание»); версии learner_projection/tokenizer/resolver в каждом ответе; личный текст без
гранта → AA_TEXT_ACCESS_NOT_GRANTED; **нет разметки → честный COVERAGE_UNAVAILABLE с причиной,
НИКАКИХ приблизительных процентов**. Scope `learner.coverage.read`, tier PERSONAL (раскрывает
состояние знания), rate 6/min·200/day. Существующие схемы не мутировать.

## Scope / Non-goals
Scope: capability + схемы + серверный расчёт + consent-карточка PERSONAL (ru/en/he + SW bump) +
smoke + деплой + прод-верификация + правило в скиллы P3/P5 («материал подбираем по числу»).
Non-goals: рекомендательный тур по корпусу (scaffold-advisor не трогать); MC-глоссы (H3-C3);
изменение lemma-canon.

## Предпроверки (КРИТИЧЕСКИ: measure-before-code)
1. HEAD/версия; STATUS: H2.2 PLANNED (H2.1 желательно CLOSED — общий паттерн уже проложен).
2. Выясни ФАКТ: какие представления текстов сервер может токенизировать/лемматизировать:
   корпусные works (какая разметка запечена?), личные тексты (что есть в sidecar-мете S1?).
   Вывод — в отчёт; для непокрываемых классов текстов честно проектируй COVERAGE_UNAVAILABLE.
3. Выясни ФАКТ: из чего сервер строит learner-проекцию известных лемм (таблицы синка review_log/
   word_status; реальные имена полей — Object.keys, не предположения).
4. Снапшот схем «до».

## Пошаговая работа
1. capabilities.js + mcpSchemas.js по 04 §2 (аддитивно).
2. Серверный расчёт: токенизация выбранного текста → лемма-кейер (lemma-canon) → сопоставление
   с проекцией → buckets/pcts/band/top_unknown. Детерминированно, без LLM. Версионируй:
   learner_projection_version (например, max(updated_at) снапшота), tokenizer_version,
   resolver_version — константы кода.
3. Consent-карточка learner.coverage.read (PERSONAL-тон: «агент увидит, какие слова вы знаете»).
4. Smoke `scripts/premium/agent-text-coverage-smoke.js`: 5 кейсов из 04 §2 acceptance (корпусный
   OK; личный с грантом; личный без гранта; без разметки → UNAVAILABLE; пустая проекция → band
   FRUSTRATION). + существующие гейты.
5. Деплой → прод-верификация через Hermes (restart-ловушка) → транскрипт.
6. Скилл-дополнение (`hermes-side/h2.2/`): в разговорной/песенной подготовке материал выбирается
   по band/числам, число называется юзеру.

## Acceptance
Smoke 5/5; гейты зелёные; прод-вызов; диф схем только-добавление; церемония пройдена; STATUS.

## Owner-live
«Что почитать?» на реальном профиле: агент даёт ≥2 варианта с числами покрытия; вердикт в STATUS.

## Rollback
Отключение capability; миграций нет (расчёт по существующим данным); revert-коммит.

## Отчёт
По 11 §4 + факт-таблица предпроверки 2–3 (что покрываемо, что UNAVAILABLE и почему).
