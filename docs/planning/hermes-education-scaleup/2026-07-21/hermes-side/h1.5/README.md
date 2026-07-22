# H1.5 — local YouTube transcript MCP

Дата: 2026-07-22.

Исходный HEAD: `cb66e2e`; версия LinguistPro: `3.11.221`.

Слайс подключает к Hermes локальный stdio MCP для субтитров YouTube. Он не
скачивает аудио/видео, не импортирует транскрипты в LinguistPro и не меняет
production-код, MCP-схемы или `CAPABILITY_VERSION` LinguistPro.

## Выбор пакета

Выбран `@nadimtuhin/ytranscript@1.3.0` (MIT):

- npm: <https://www.npmjs.com/package/@nadimtuhin/ytranscript>;
- upstream: <https://github.com/nadimtuhin/ytranscript>;
- на дату проверки npm-релиз `1.3.0` опубликован 2026-05-19, GitHub-репозиторий
  не архивирован, последний проверенный commit —
  `efacc617602ead4a369cd4a13273a347818f9dde` от 2026-07-12;
- пакет установлен и запущен на Node `v22.22.3` (требование пакета: Node 18+).

Исходный пример из промта,
`@kimtaeyoon83/mcp-server-youtube-transcript@0.1.1`, не выбран: его последний
npm-релиз датирован 2024-11-29. У выбранного эквивалента свежее релиз и живая
upstream-активность; опубликованный tarball дополнительно просмотрен перед
установкой.

Из четырёх tools пакета разрешены только два одиночных read-only вызова:
`get_transcript_languages` и `get_transcript`. `get_transcripts_bulk` и
`extract_video_id` не экспонируются. Политика использования находится в
`YOUTUBE_TRANSCRIPT_POLICY_SKILL.md`.

## Канонические артефакты

- `YOUTUBE_TRANSCRIPT_MCP_CONFIG.yaml` — аддитивный config-фрагмент;
- `YOUTUBE_TRANSCRIPT_POLICY_SKILL.md` — privacy/provenance/state guardrails;
- `ACCEPTANCE_TRANSCRIPTS.md` — tool discovery и smoke A–C.

## Установка

Пакет установлен внутрь общего Hermes volume, а не в image контейнера:

```sh
mkdir -p /home/hermes/.hermes/npm-cache
npm_config_cache=/home/hermes/.hermes/npm-cache npm install \
  --prefix /home/hermes/.hermes/mcp-servers/ytranscript \
  --omit=dev --ignore-scripts --no-audit --no-fund \
  @nadimtuhin/ytranscript@1.3.0
```

Первый npm-вызов получил `EACCES` в `/home/hermes/.npm`. Вместо изменения
прав всего home был создан отдельный cache внутри `~/.hermes`; повторная
установка завершилась успешно (118 packages).

MCP фактически создаёт WebUI-процесс, но в image `hermes-webui` нет Node.
Поэтому совместимый бинарник Node `v22.22.3` из `hermes-agent` скопирован в
общий volume как `~/.hermes/mcp-runtimes/node`. Оба image — Debian 13; бинарник
успешно запускается из обоих контейнеров. SHA-256 runtime:
`e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2`.

1. Аддитивно смержить `YOUTUBE_TRANSCRIPT_MCP_CONFIG.yaml` в существующий
   `~/.hermes/config.yaml`; не заменять другие `mcp_servers`.
2. Установить policy skill:

```powershell
docker exec hermes-webui mkdir -p /home/hermeswebui/.hermes/skills/linguistpro-youtube-transcript-policy
docker cp YOUTUBE_TRANSCRIPT_POLICY_SKILL.md hermes-webui:/home/hermeswebui/.hermes/skills/linguistpro-youtube-transcript-policy/SKILL.md
```

3. Перезапустить оба контейнера из-за `listChanged:false`:

```powershell
docker restart hermes-agent hermes-webui
```

## Снимок config.yaml

Полный config содержит локальные секреты и не копируется в git.

До H1.5 SHA-256:
`a89244485501570aa2a89333ea38e3fc67b849ec6ffb290c040cba08e6b1c5f8`.

После H1.5 SHA-256:
`4159e73ea9457a920ad0e31339bdb890fb76d7a796d9dc57f50fd31ad799266c`.

Emergency backup до изменения находится только в Hermes volume:
`/home/hermes/.hermes/config.yaml.h1.5-before-20260722`.

## Проверка

```powershell
docker exec -u hermes -e HOME=/home/hermes hermes-agent /opt/hermes/.venv/bin/hermes mcp list
```

Ожидается `youtube_transcript ... 2 selected ... enabled`. В новой
ordinary-session (`model: gemini-3.6-flash`, `personality: null`) должны быть
видны только:

- `mcp__youtube_transcript__get_transcript_languages`;
- `mcp__youtube_transcript__get_transcript`.

Затем прогнать A–C из `ACCEPTANCE_TRANSCRIPTS.md`. Для каждого видео сначала
запрашивать список дорожек, затем точный возвращённый код и `format: segments`.
YouTube может обозначать иврит legacy-кодом `iw`.

Известное upstream-ограничение: `get_transcript_languages` использует отдельный
YouTube WEB-player endpoint и иногда ложно возвращает пустой inventory, хотя
основной fetcher видит дорожку. Policy разрешает для явно запрошенного иврита
ровно один direct fallback `language: iw`; без `he`, перебора языков или
повторного извлечения. Это поведение отдельно покрыто smoke B.

## Откат

1. Удалить только mapping `mcp_servers.youtube_transcript` из актуального
   config.yaml. Не восстанавливать полный backup поверх более новых изменений.
2. Удалить только policy skill, пакет и выделенный runtime:

```powershell
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/skills/linguistpro-youtube-transcript-policy
docker exec hermes-agent rm -rf /home/hermes/.hermes/mcp-servers/ytranscript /home/hermes/.hermes/mcp-runtimes/node /home/hermes/.hermes/npm-cache
docker restart hermes-agent hermes-webui
```

3. В новой ordinary-session проверить отсутствие `mcp__youtube_transcript__*`
   и сохранность LinguistPro, Sefaria и H1.0–H1.4.

## Owner-live

После engineering acceptance владелец выбирает одно реальное видео и проводит
один разбор фрагмента. До его вердикта H1.5 имеет максимум
`ENGINEERING_COMPLETE`.
