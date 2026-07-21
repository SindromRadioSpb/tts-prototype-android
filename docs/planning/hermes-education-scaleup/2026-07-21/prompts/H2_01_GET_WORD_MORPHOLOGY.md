# H2_01 — Слайс H2.1: get_word_morphology (морфо-grounding агента)

> **BLOCKED UNTIL H1 CLOSURE + owner go (Д5).** Проверь STATUS.md: G-H2-START пройден. Иначе СТОП.

## Роль и цель
Инженер-исполнитель одного слайса в репо `E:\projects\tts-prototype-android`. Цель: новый MCP
read-инструмент №17 `get_word_morphology` — агент СВЕРЯЕТ утверждения о формах по офлайн-Pealim
датасету, не генерирует их. Контракт — 04 §1 (канон; отклонение = стоп и вопрос владельцу).

## Обязательное чтение
1. Пакет: `README.md`, `STATUS.md`, `04_HORIZON_2_ARCHITECTURE_AND_CONTRACTS.md` (§0 общие
   правила + §1 контракт), `11_HANDOFF_TO_CODEX_5_6_SOL.md`.
2. Живой код AA-слоя (паттерн для нового инструмента): `agent/access/capabilities.js`,
   `agent/access/mcpSchemas.js`, `agent/access/contracts.js`, `agent/access/productionHandlers.js`,
   `agent/access/mcpRateLimiter.js`, `agent/access/consentCeremony.js`.
3. Резолвер/датасет: `public/js/notes-autogen.js` (pure-core), `db/premium/providers/pealim.js`,
   `public/data/inflection/pealim-infl-v12.json.gz` — как сервер может резолвить офлайн.
4. Прецедент smoke: `scripts/premium/agent-access-domain-smoke.js` и соседние `agent-*-smoke.js`.

## Инварианты
НЕ мутировать существующие 16 схем; CAPABILITY_VERSION остаётся aa-v0.1; в резолв-пути НЕТ LLM
вообще (детерминированный код); гомографы → AMBIGUOUS со всеми вариантами; вне словаря →
UNRESOLVED (не ошибка, не выдумка); output несёт `schema_version:"aa.word_morphology.1.0.0"`,
resolver_version, dataset_version. Scope `morphology.read`, tier STANDARD, rate 6/min·200/day.

## Scope / Non-goals
Scope: capability + схемы + контракт-валидатор + handler + rate-limit + consent-карточка scope
(ru/en/he) + smoke + деплой + прод-верификация + скилл-правило.
Non-goals: Dicta-вызовы на запрос; изменение клиентского резолвера Зала; синтез отсутствующих
парадигм; get_text_coverage (следующий слайс).

## Предпроверки
1. HEAD/версия; STATUS: G-H2-START пройден, H2.1 PLANNED.
2. **Measure-before-code:** проверь, каким кодом сервер может читать pealim-infl-v12 (датасет
   shipped в public/ — сервер имеет к нему файловый доступ; распаковка gz, структура ключей —
   выведи реальные Object.keys образца, не предполагай).
3. Снапшот схем «до»: сохрани текущий tools/list (или INPUT_/OUTPUT_SCHEMAS дамп) — приложишь
   к отчёту диф «только добавление».

## Пошаговая работа
1. capabilities.js: запись get_word_morphology (scope morphology.read, purpose, scenario_id,
   max_output_bytes ~8192) — аддитивно.
2. mcpSchemas.js: input/output по 04 §1 в локальном стиле (closedObject, string(), integer()).
3. contracts.js/productionHandlers.js: серверный резолв по датасету (переиспользуй pure-core
   логику notes-autogen/pealim-провайдера, НЕ дублируй правила заново); confidence-градация
   зеркалит честный резолвер (EXACT только на решающих ячейках).
4. Rate-limiter: 6/min·200/day. Consent: карточка scope (ru/en/he локали + SW bump — ловушка i18n).
5. Smoke `scripts/premium/agent-word-morphology-smoke.js`: 5 кейсов из 04 §1 acceptance
   (точное слово; гомограф; проклитика כשתבוא; мусор → AA_INVALID_INPUT; вне словаря → UNRESOLVED).
6. Прогони также `npm run test:api-smoke` + доменные agent-smoke — ничего не сломано.
7. Коммит+push → Coolify-деплой → прод-верификация: инструмент виден и работает через живой
   Hermes (⚠ listChanged:false → restart hermes-контейнеров + новая сессия) — транскрипт вызова.
8. Скилл-дополнение (канон-копия в `hermes-side/h2.1/`): правило «морфо-утверждение — только
   после вызова get_word_morphology; UNRESOLVED → честное “не найдено, проверь в приложении”».

## Acceptance
Smoke 5/5 + существующие гейты зелёные (вывод приложен); прод-вызов через Hermes; диф схем =
только добавление; консент-церемония пройдена владельцем; STATUS обновлён.

## Owner-live
Владелец в реальном разборе спрашивает форму → агент вызывает инструмент и сверяет; вердикт в STATUS.

## Rollback
Capability можно отключить (убрать запись/скоуп) без влияния на остальные 16; миграций у слайса
нет; деплой отката — revert-коммит.

## Отчёт
По 11 §4 + диф схем «до/после».
