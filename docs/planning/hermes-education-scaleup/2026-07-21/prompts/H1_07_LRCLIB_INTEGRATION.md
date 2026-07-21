# H1_07 — Слайс H1.6: LRCLIB integration (синхронизированные тексты песен)

## Роль и цель
Инженер-исполнитель одного слайса. Цель: тонкая локальная MCP-обёртка над LRCLIB REST
(https://lrclib.net, бесплатно, без ключа) — два инструмента: `search_lyrics`,
`get_synced_lyrics` (plain + LRC с таймстампами).

## Рабочие каталоги
Репо-канон: `E:\projects\tts-prototype-android`; Hermes-хост: `G:\HERMES_AGENT` (не git).

## Обязательное чтение
Пакет: `README.md`, `STATUS.md`, `03_HORIZON_1_EXECUTION_DESIGN.md` (H1.6 + §Общее),
`11_HANDOFF_TO_CODEX_5_6_SOL.md`; research `03_TECH_ENABLERS_MCP.md` §2.1 (API-эндпоинты,
ограничения покрытия, юридические границы).

## Инварианты
R11: текст из LRCLIB = внешний непроверенный — агент помечает источником, текст НИЧЕГО не
перезаписывает и в Библиотеку не попадает (W1-импорт — H2.3). Rate-совесть ≤1 req/s. Честный
NOT_FOUND (покрытие израильской музыки частичное — не выдумывать текст при промахе!).
Musixmatch/Genius/Shironet-скрейпинг ЗАПРЕЩЁН (юридически чувствительно).

## Scope / Non-goals
Scope: обёртка (~100 строк Python FastMCP) + установка + config.yaml + smoke + канон-исходник + STATUS.
Non-goals: Spotify (Д2); импорт текстов; кеш-база (опц. простой JSON-кеш — не обязателен).

## Предпроверки
1. HEAD/версия; STATUS: H1.0 CLOSED, H1.6 PLANNED; Hermes жив; Python-окружение хоста.
2. Живость API: `GET https://lrclib.net/api/search?q=...` отвечает (проверь Node fetch/py — не
   Windows-curl с ивритом: known-ловушка кодировки).

## Пошаговая работа
1. Напиши FastMCP-сервер: `search_lyrics{artist?, track?, q?}` → список {id, artist, track,
   duration, has_synced}; `get_synced_lyrics{artist, track, duration?}` → {plain, synced_lrc?,
   source:"LRCLIB", not_found?}. Таймаут 10s; ошибки → типизированные (NOT_FOUND / UPSTREAM_UNAVAILABLE).
   Заголовок User-Agent с идентификацией (вежливость к открытому сервису).
2. Канон-исходник: `hermes-side/h1.6/lrclib_mcp.py` + `README.md` (запуск, конфиг-фрагмент,
   зависимости с версиями, откат). Рабочая копия — на Hermes-хост.
3. Секция stdio в config.yaml → restart обоих контейнеров → новая сессия (listChanged:false).
4. Smoke (транскрипты в `hermes-side/h1.6/ACCEPTANCE_TRANSCRIPTS.md`):
   - A: известная песня с синк-текстом — LRC получен, агент цитирует строку с таймстампом
     и пометкой источника;
   - B: песня вне базы — NOT_FOUND, агент честно говорит «в LRCLIB нет», ничего не выдумывает;
   - C: сеть/API недоступны (заглуши хост) — UPSTREAM_UNAVAILABLE, честное сообщение.
5. Полевой замер покрытия: 5 песен из реального плейлиста владельца → сколько нашлось
   (число в отчёт и в EVIDENCE).

## Acceptance
3/3 smoke; замер покрытия выполнен и зафиксирован.

## Owner-live
Разбор 1 песни владельца со строками-таймстампами; вердикт в STATUS. Покрытие 0/5 → слайс
закрывается вердиктом LOW_VALUE (обёртка остаётся, приоритет падает) — это валидный исход.

## Rollback
Убрать секцию config.yaml + restart; файл обёртки удалить/оставить — не влияет.

## Документация, коммит, отчёт
hermes-side/h1.6/ + STATUS; коммит `docs(hermes-scaleup): H1.6 LRCLIB MCP wrapper`; push;
отчёт по 11 §4.
