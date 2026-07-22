# H1.6 acceptance transcripts

Дата: 2026-07-22. Все финальные smoke запущены в новых ordinary-sessions.
Фактическая модель Hermes: `gemini-3.5-flash-lite`, `personality: null`.

## Tool discovery

`hermes mcp list` после restart:

```text
lrclib  /bin/sh -lc if [ -n "${HE...  2 selected  enabled
```

Экспонированы только:

- `mcp__lrclib__search_lyrics`;
- `mcp__lrclib__get_synced_lyrics`.

Соседние `linguistpro`, `sefaria` и `youtube_transcript` остались enabled.

## A — известная песня с synchronized LRC

Session: `41d4af22d544`.

Tool calls:

```text
mcp__lrclib__search_lyrics({"artist":"נדב חנציס","track":"אם את כבר הולכת"})
mcp__lrclib__get_synced_lyrics({"artist":"נדב חנציס","track":"אם את כבר הולכת","duration":205})
```

Финальный ответ Hermes:

```text
Источник: LRCLIB (текст внешний, непроверенный).

[00:20.75] זה מרגיש כל כך מוזר
```

Вердикт: **PASS** — точное совпадение, LRC-таймстамп и provenance присутствуют;
импорта или записи состояния не было.

## B — песня вне базы

Session: `ebb8495586a1`.

Tool call:

```text
mcp__lrclib__get_synced_lyrics({"artist":"No Such Artist H1.6","track":"No Such Track 9f4c2d"})
```

Финальный ответ Hermes:

```text
В LRCLIB нет (внешний источник LRCLIB, текст не проверен).
Ошибка: NOT_FOUND
retryable: false
Никакие другие внешние сервисы (Genius, Musixmatch, Shironet) не использовались,
строки не выдумывались.
```

Вердикт: **PASS** — честный typed miss, без выдуманного текста или fallback на
запрещённый скрейпинг.

## C — LRCLIB upstream недоступен

Тестовый endpoint: `http://127.0.0.1:9`, задан только process env обёртки.

Первая session `8d0c61274bb3`: tool корректно вернул structured result:

```json
{"ok":false,"source":"LRCLIB","error":{"code":"UPSTREAM_UNAVAILABLE","message":"LRCLIB is unavailable.","retryable":true}}
```

После tool-result Gemini один раз вернула transient
`Provider returned an empty stream with no finish_reason`; это provider error,
а не ошибка MCP-контракта. Сценарий повторён в новой session `7b8e16b38563`.

Tool call:

```text
mcp__lrclib__search_lyrics({"q":"Idan Raichel ממעמקים"})
```

Финальный ответ Hermes:

```text
code: UPSTREAM_UNAVAILABLE
retryable: true
message: LRCLIB is unavailable.
```

Вердикт: **PASS на второй итерации** — typed upstream failure сообщён честно;
текст по памяти и другие lyrics-сервисы не использовались.

## Восстановление после C

Рабочий config восстановлен до SHA-256
`74e567d78e0f8ff5cf54e161419931ffc2656f0e550d80982ba538fa0b812616`,
оба контейнера перезапущены. Новая session `ccfb2ecb2826` вызвала
`search_lyrics` для `Idan Raichel — ממעמקים` и получила:

```text
OK, результатов: 10.
```

## Итог

Acceptance: **3/3 PASS**. Полевое покрытие: **2/5**. Privacy, provenance,
rate-limit, no-import и no-scraping invariants соблюдены.
