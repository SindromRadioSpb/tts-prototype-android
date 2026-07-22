# H1_09 — Слайс H1.8: Owner-live evaluation + закрытие Горизонта 1

## Роль и цель
Свести evidence всех H1-слайсов, провести/оформить owner-live окно, закрыть Горизонт 1 по гейту
G-H1-CLOSURE и подготовить решение Д5 (go/no-go H2) владельцу. Этот слайс — строго последний в H1.

## Рабочий каталог
`E:\projects\tts-prototype-android` (+ доступ к чат-истории Hermes для сверки, через владельца).

## Обязательное чтение
Пакет `docs/planning/hermes-education-scaleup/2026-07-21/`: `README.md`, `STATUS.md`,
`08_MEASUREMENT_EXPERIMENT_ROLLOUT.md` (§1–2 — метрики и рамки), `10_ACCEPTANCE_GATES_AND_CLOSURE.md`
(§2–3 — гейты, которые ты проверяешь), `03_HORIZON_1_EXECUTION_DESIGN.md` (H1.8),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`; все `hermes-side/h1.*/ACCEPTANCE_TRANSCRIPTS.md` и README.

## Предпроверки
STATUS: H1.0–H1.7 в CLOSED или SKIPPED/LOW_VALUE с owner-вердиктом. Любой слайс в ином статусе →
СТОП, верни диспетчеру (H1_00): закрывать горизонт рано.

## Пошаговая работа
1. Сверь каждый CLOSED-слайс с его гейтами (10 §1): артефакты по путям существуют, транскрипты
   есть, вердикты записаны. Дыра → слайс возвращается в OWNER_LIVE, горизонт не закрывается.
2. Если owner amendment переносит longitudinal window, зафиксируй qualitative
   owner PASS как closure evidence и создай обязательный 14-дневный parallel
   monitoring: ≥2 conversation, ≥2 WCF, ≥2 SRL, ≥1 общий разбор
   Sefaria+LRCLIB+YouTube+datasets, ratings/incidents/cost.
3. Собери доступный initial baseline 08 §1 и создай короткие paste-ready Hermes
   prompts; не выдумывай отсутствующие longitudinal метрики.
4. Напиши `hermes-side/h1.8/EVIDENCE.md`: таблица слайсов × owner verdicts;
   initial baseline; monitoring dates/prompts/stop-условия; per-loop
   recommendation; continuation evidence либо точный owner override.
5. Consent- и cost-верификация G-H1-CLOSURE: подтверди (grep/скриншот панели грантов), что за H1
   не появилось новых scopes/грантов и записей мимо W1; затраты = $0 или объяснение.
6. Обнови STATUS.md: слайсы → CLOSED; горизонт H1 → CLOSED; parallel monitoring
   → ACTIVE; журнал решений.
7. Сформулируй владельцу ЯВНЫЙ запрос Д5: «H1 закрыт, evidence такой-то; давать ли go на H2?»
   — цитатой в отчёте. НЕ начинай H2 сам ни при каких обстоятельствах.

## Acceptance
G-H1-CLOSURE (10 §2) — все чекбоксы с артефактами; при owner amendment
G-H1-PARALLEL-MONITOR спланирован и ACTIVE; EVIDENCE.md полон; STATUS обновлён.

## Rollback
Не применим (слайс ничего не устанавливает); отрицательный итог = горизонт не закрыт, дыры
перечислены, STATUS отражает реальность.

## Документация, коммит, отчёт
hermes-side/h1.8/EVIDENCE.md + STATUS; коммит `docs(hermes-scaleup): H1 closure evidence`; push;
отчёт по 11 §4 + отдельным блоком — запрос Д5 владельцу.
