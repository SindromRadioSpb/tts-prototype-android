# H1_05 — Слайс H1.4: Sefaria MCP (hosted)

## Роль и цель
Инженер-исполнитель одного слайса. Цель: подключить официальный hosted Sefaria MCP
(`https://mcp.sefaria.org/sse`) к Hermes — словари (Klein/Jastrow), точные цитаты, интертексты
песен с Танахом.

## Рабочие каталоги
Репо-канон: `E:\projects\tts-prototype-android`; Hermes: `G:\HERMES_AGENT` (не git);
конфиг MCP: `~/.hermes/config.yaml → mcp_servers` внутри volume `hermex-hermes-home`.

## Обязательное чтение
Пакет `docs/planning/hermes-education-scaleup/2026-07-21/`: `README.md`, `STATUS.md`,
`03_HORIZON_1_EXECUTION_DESIGN.md` (H1.4 + §Общее — установка MCP, privacy-правило),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`; справочно
`docs/research/hermes-education-scaleup/2026-07-21/03_TECH_ENABLERS_MCP.md` §3.2.

## Инварианты
Privacy-правило H1: во внешние запросы — только цитаты/термины/названия, НИКОГДА содержимое
личных текстов, due-списки, профиль. Sefaria = справочный источник: агент цитирует с указанием
источника, не выдаёт за собственное знание (правило 12 политики). Никаких LinguistPro-изменений.

## Scope / Non-goals
Scope: секция config.yaml + restart + smoke + правило использования в политику-дополнение +
канон-копия + STATUS.
Non-goals: community-варианты Sefaria-серверов; кеширование (hosted); developer-API сервер
(`developers.sefaria.org/mcp`) — только если основной не работает, с фиксацией в отчёте.

## Предпроверки
1. HEAD/версия; STATUS: H1.0 CLOSED, H1.4 PLANNED.
2. Hermes-стек жив (`docker ps`); текущий config.yaml прочитан (снапшот «до» — в отчёт).
3. Доступность endpoint: проверь, что `https://mcp.sefaria.org/sse` отвечает (curl/Node fetch).
   ⚠ живой формат секции mcp_servers сверь с доками hermes-agent
   (https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) — НЕ угадывай синтаксис.

## Пошаговая работа
1. Добавь секцию Sefaria (SSE-транспорт) в `mcp_servers` config.yaml — аддитивно, ничего не удаляя.
2. ⚠ listChanged:false → `docker restart hermes-agent hermes-webui` + НОВАЯ сессия агента.
3. Проверь, что инструменты Sefaria видны агенту (попроси перечислить новые тулы).
4. Smoke (транскрипты в `hermes-side/h1.4/ACCEPTANCE_TRANSCRIPTS.md`):
   - A: поиск стиха по известной цитате из ивритской песни (например, строка из Псалмов) —
     точный текст получен с координатой;
   - B: словарная статья (Klein) для слова из текущих due-слов владельца — слово передаётся
     БЕЗ контекста списка (privacy-правило);
   - C: недоступность (временно убери секцию или спроси несуществующий ресурс) — агент честно
     сообщает, не выдумывает текст.
5. Канон-копия: `hermes-side/h1.4/README.md` (конфиг-фрагмент, установка, проверка, откат,
   снапшот «до/после» config.yaml — без секретов).

## Acceptance
3/3 smoke; тулы Sefaria в реестре агента; config-фрагмент воспроизводим.

## Owner-live
1 реальный разбор песни с найденным интертекстом; вердикт в STATUS.

## Rollback
Удалить секцию из config.yaml → restart → инструменты исчезли (проверить).

## Документация, коммит, отчёт
hermes-side/h1.4/ + STATUS; коммит `docs(hermes-scaleup): H1.4 Sefaria MCP`; push; отчёт по 11 §4.
