# H1.4 — official hosted Sefaria MCP

Дата: 2026-07-22

Исходный HEAD: `febf4a9`; версия LinguistPro: `3.11.221`.

Источник интеграции: официальный Sefaria Texts MCP
`https://mcp.sefaria.org/sse`. Формат Hermes проверен по официальной
документации Nous Research и живому клиентскому коду: legacy SSE требует
`url` вместе с `transport: sse`.

Слайс добавляет hosted read-only источник текстов, точных координат,
интертекстов и словарей Sefaria. Production LinguistPro, его MCP-схемы и
`CAPABILITY_VERSION` не изменялись.

## Канонические артефакты

- `SEFARIA_MCP_CONFIG.yaml` — воспроизводимый аддитивный фрагмент конфига.
- `SEFARIA_USAGE_POLICY_SKILL.md` — privacy/provenance-дополнение к H1.0.
- `ACCEPTANCE_TRANSCRIPTS.md` — tool inventory и smoke A–C.

## Снимок config.yaml до и после

Полный `config.yaml` содержит чувствительную конфигурацию и намеренно не
копируется в git. Ниже — санитизированная структурная дельта.

До:

```yaml
mcp_servers:
  linguistpro:
    # существующая OAuth-конфигурация и 16 selected tools; без изменений
```

SHA-256 полного файла до:
`8c5433ec96e6d79ef14e345fe27c406fbde45318f3bcae61d436d697620acd8c`.

После:

```yaml
mcp_servers:
  linguistpro:
    # существующая секция без изменений
  sefaria:
    url: https://mcp.sefaria.org/sse
    transport: sse
    enabled: true
    supports_parallel_tool_calls: false
    timeout: 120
    connect_timeout: 30
    tools:
      resources: false
      prompts: false
```

SHA-256 полного файла после:
`a89244485501570aa2a89333ea38e3fc67b849ec6ffb290c040cba08e6b1c5f8`.

Emergency backup «до» хранится только в Hermes volume:
`/home/hermes/.hermes/config.yaml.h1.4-before-20260722`. Он содержит полный
локальный config и никогда не должен попадать в репозиторий или внешний лог.

## Установка

1. Аддитивно смержить `SEFARIA_MCP_CONFIG.yaml` в существующий
   `~/.hermes/config.yaml`; не заменять весь `mcp_servers`.
2. Установить policy skill:

```powershell
docker exec hermes-webui mkdir -p /home/hermeswebui/.hermes/skills/linguistpro-sefaria-policy
docker cp SEFARIA_USAGE_POLICY_SKILL.md hermes-webui:/home/hermeswebui/.hermes/skills/linguistpro-sefaria-policy/SKILL.md
```

3. Из-за Hermes `listChanged:false` перезапустить оба контейнера:

```powershell
docker restart hermes-agent hermes-webui
```

4. Дождаться health=`healthy` и открыть новую ordinary-session
   (`personality: null`).

## Проверка

```powershell
docker exec -u hermes -e HOME=/home/hermes hermes-agent /opt/hermes/.venv/bin/hermes mcp list
```

Ожидается `sefaria ... all ... enabled`. В новой сессии должны быть видны 15
tools с префиксом `mcp__sefaria__`, включая `get_text`, `text_search`,
`search_in_dictionaries` и `get_links_between_texts`.

Далее прогнать A–C из `ACCEPTANCE_TRANSCRIPTS.md`. Проверить, что Sefaria
получает только короткую публичную цитату или одно слово и что ответы содержат
точный источник.

## Откат

1. Удалить только mapping `mcp_servers.sefaria` из актуального config.yaml.
   Не восстанавливать старый полный backup, если после H1.4 появились другие
   изменения конфига.
2. Удалить только каталог policy skill:

```powershell
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/skills/linguistpro-sefaria-policy
docker restart hermes-agent hermes-webui
```

3. В новой ordinary-session проверить, что `mcp__sefaria__*` отсутствуют, а
   LinguistPro и H1.0–H1.3 остались доступны.

Emergency-only: если конфиг повреждён до появления последующих изменений,
восстановить volume-backup, затем перезапустить оба контейнера.

## Результат

Официальный hosted MCP подключён; 15 tools видны ordinary-session. Smoke A–C
дал 3/3, policy skill автоматически загружался, его канонический и установленный
SHA-256 совпадает:
`3b9a5f774a028061d302a12a319f0e563aee9abaff573296dcd155c23638ea35`.

Статус — `ENGINEERING_COMPLETE`. До `CLOSED` владелец проводит один реальный
разбор песни с найденным интертекстом и ставит вердикт в STATUS.
