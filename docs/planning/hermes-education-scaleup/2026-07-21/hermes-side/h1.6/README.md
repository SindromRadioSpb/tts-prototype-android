# H1.6 — local LRCLIB MCP wrapper

Дата: 2026-07-22.

Исходный HEAD: `470da79`; версия LinguistPro: `3.11.221`.

Слайс добавляет в Hermes два локальных read-only инструмента над открытым
LRCLIB REST API: поиск текстов и получение plain/LRC для точного совпадения.
Production-код LinguistPro, его MCP-схемы и `CAPABILITY_VERSION` не менялись.

## Канонические артефакты

- `lrclib_mcp.py` — FastMCP-обёртка;
- `LRCLIB_MCP_CONFIG.yaml` — аддитивный config-фрагмент;
- `ACCEPTANCE_TRANSCRIPTS.md` — tool inventory и smoke A–C;
- `EVIDENCE.md` — полевой замер покрытия пяти песен владельца.

Источник API: <https://lrclib.net/docs>. На 2026-07-22 официальный API открыт
без ключа, требует идентифицирующий `User-Agent`, `/api/search` возвращает до
20 записей вместе с `plainLyrics`/`syncedLyrics`.

Обёртка использует `/api/search` и для `get_synced_lyrics`: официальный
`/api/get` требует обязательные album и duration, тогда как утверждённый MCP
контракт принимает только artist, track и опциональный duration. После поиска
обёртка сама требует точное Unicode-normalized совпадение artist+track; при
переданном duration допускается отклонение не более ±2 секунд. Это исключает
подстановку текста другой версии песни и не создаёт второй HTTP-запрос.

## Контракт и guardrails

- `search_lyrics{artist?, track?, q?}` возвращает максимум 10 кратких записей:
  `id`, `artist`, `track`, `duration`, `has_synced`;
- `get_synced_lyrics{artist, track, duration?}` возвращает `plain`,
  `synced_lrc`, `source: LRCLIB`, `external_unverified: true`;
- ошибки типизированы: `INVALID_ARGUMENT`, `NOT_FOUND` (`retryable:false`) и
  `UPSTREAM_UNAVAILABLE` (`retryable:true`);
- HTTP timeout — 10 секунд;
- глобальный rate limiter допускает старт не чаще одного запроса в секунду;
- `User-Agent`:
  `LinguistPro-Hermes-LRCLIB/1.0 (+https://github.com/SindromRadioSpb/tts-prototype-android)`;
- наружу передаются только публичные artist/track/q; никакие personal-text
  bodies, due-списки или профиль не отправляются;
- текст помечается внешним непроверенным, не импортируется и не меняет
  состояние LinguistPro;
- Genius, Musixmatch и Shironet не используются и не скрейпятся.

## Окружение и установка

Hermes agent: Python `3.13.5`, `mcp==1.26.0` уже входит в
`/opt/hermes/.venv`. WebUI создаёт stdio MCP, но его Python `3.12.13` не имел
`mcp`; поэтому воспроизводимая рабочая зависимость установлена в общий volume:

```powershell
docker exec -u hermeswebui hermes-webui sh -lc `
  'mkdir -p /home/hermeswebui/.hermes/mcp-runtimes/lrclib-py312 && `
   python -m pip install --target /home/hermeswebui/.hermes/mcp-runtimes/lrclib-py312 `
   --no-cache-dir mcp==1.26.0'
```

Размер runtime с транзитивными зависимостями — 41 MiB.

Установить сервер в общий Hermes volume:

```powershell
docker exec hermes-agent mkdir -p /home/hermes/.hermes/mcp-servers/lrclib
docker cp lrclib_mcp.py hermes-agent:/home/hermes/.hermes/mcp-servers/lrclib/lrclib_mcp.py
```

Canon/installed SHA-256:
`d3f7fafee7564e92919b73b6faa51b9085f6984ae09ae5ba39ac67139159cd29`.

Аддитивно смержить `LRCLIB_MCP_CONFIG.yaml` в `~/.hermes/config.yaml`, не
заменяя существующие `mcp_servers`, затем выполнить:

```powershell
docker restart hermes-agent hermes-webui
docker exec -u hermes -e HOME=/home/hermes hermes-agent /opt/hermes/.venv/bin/hermes mcp list
```

Ожидается `lrclib ... 2 selected ... enabled`. Новая ordinary-session должна
видеть только `mcp__lrclib__search_lyrics` и
`mcp__lrclib__get_synced_lyrics`.

## Снимок config.yaml

Полный config содержит локальные секреты и не копируется в git. Перед H1.6 он
уже отличался от H1.5-снимка из-за последующих настроек Hermes; актуальный
preflight принят за источник истины.

- До H1.6 SHA-256:
  `77fe8fc76edc6e20fea87aa511b068b7a49e33fd71776b1cd90507ca90ebb0ee`.
- После H1.6 SHA-256:
  `74e567d78e0f8ff5cf54e161419931ffc2656f0e550d80982ba538fa0b812616`.
- Emergency backup только в volume:
  `/home/hermes/.hermes/config.yaml.h1.6-before-20260722`.

## Проверка недоступности

Для smoke C только LRCLIB command временно запускался с
`LRCLIB_BASE_URL=http://127.0.0.1:9`. После проверки исходный config был
восстановлен до точного SHA-256 `74e567...`, оба контейнера перезапущены, а
post-restore ordinary-session снова получила живой ответ LRCLIB.

## Откат

1. Удалить только mapping `mcp_servers.lrclib` из актуального config.yaml.
2. Удалить только H1.6 working copies:

```powershell
docker exec hermes-agent rm -rf /home/hermes/.hermes/mcp-servers/lrclib
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/mcp-runtimes/lrclib-py312
docker restart hermes-agent hermes-webui
```

3. В новой ordinary-session проверить отсутствие `mcp__lrclib__*` и
сохранность LinguistPro, Sefaria и YouTube tools.

Не восстанавливать полный emergency backup поверх более новых изменений
config. Он предназначен только для аварийного восстановления непосредственно
после H1.6.

## Owner-live

Владелец выбирает одну реальную песню и разбирает строку по LRC-таймстампу,
затем ставит вердикт 1–5 с комментарием. Полевое покрытие — 2/5, поэтому
автоматический итог `LOW_VALUE` для 0/5 не применяется. До owner-live статус
слайса — максимум `ENGINEERING_COMPLETE`.
