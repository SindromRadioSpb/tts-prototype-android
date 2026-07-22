# H1.7 — offline Kaikki + wordfreq mini-MCP

Дата: 2026-07-22.

Исходный HEAD: `4b0f45e`; версия LinguistPro: `3.11.221`.

Слайс добавляет Hermes два полностью локальных read-only инструмента:

- `kaikki_lookup{lemma}` — точный lookup Hebrew Wiktionary snapshot;
- `word_frequency{words[]}` — Zipf-частоты `wordfreq`, максимум 20 слов.

Production-код LinguistPro, его MCP-схемы и `CAPABILITY_VERSION` не менялись.

## Архитектурное решение

Выбран отдельный mini-MCP, а не расширение H1.6 LRCLIB. Причины: разные
источники и лицензии, полностью offline lifecycle и независимый rollback.
Выключение H1.7 не должно затрагивать работающий LRCLIB.

Канонические артефакты:

- `offline_lexicon_mcp.py` — исходник FastMCP;
- `OFFLINE_LEXICON_MCP_CONFIG.yaml` — аддитивный config-фрагмент;
- `DATASETS_MANIFEST.md` — воспроизводимый snapshot/versions/checksums;
- `ACCEPTANCE_TRANSCRIPTS.md` — offline proof и smoke A–C.

Kaikki всегда возвращается с `source: WIKTIONARY_VIA_KAIKKI`, атрибуцией
«по Викисловарю», `canonical:false` и правилом сообщать конфликт с
LinguistPro/Pealim. wordfreq возвращает только частоту: tool description и
`content_scope` запрещают модели придумывать переводы по частотной выдаче.

## Установка данных

```powershell
New-Item -ItemType Directory -Force G:\HERMES_AGENT\datasets\kaikki
curl.exe -L --fail --retry 3 `
  --output G:\HERMES_AGENT\datasets\kaikki\kaikki.org-dictionary-Hebrew-2026-07-20.jsonl `
  https://kaikki.org/dictionary/Hebrew/kaikki.org-dictionary-Hebrew.jsonl
```

Проверить файл по `DATASETS_MANIFEST.md`. Датасет не добавлять в git.

## Установка Python runtime

WebUI (`Python 3.12.13`) запускает ordinary-chat stdio MCP:

```powershell
docker exec -u hermeswebui hermes-webui sh -lc `
  'mkdir -p /home/hermeswebui/.hermes/mcp-runtimes/offline-py312 && `
   python -m pip install --target /home/hermeswebui/.hermes/mcp-runtimes/offline-py312 `
   --no-cache-dir mcp==1.26.0 wordfreq==3.1.1'
```

Agent CLI (`Python 3.13.5`) уже имеет `mcp`; для tool discovery нужен отдельный
wordfreq target. В agent venv нет pip, поэтому используется установленный `uv`:

```powershell
docker exec -u hermes hermes-agent sh -lc `
  'uv pip install --target /home/hermes/.hermes/mcp-runtimes/offline-py313 wordfreq==3.1.1'
```

Установить исходник в общий volume:

```powershell
docker exec hermes-agent mkdir -p /home/hermes/.hermes/mcp-servers/offline-lexicon
docker cp offline_lexicon_mcp.py hermes-agent:/home/hermes/.hermes/mcp-servers/offline-lexicon/offline_lexicon_mcp.py
```

Canon/installed SHA-256 после free-tier repair 2026-07-23:
`2ea36a2c80e443a5ef0ed4da0c15dfa72b9a2ce2e703d75c5a30e56b0a3cf145`.

## Config и запуск

Аддитивно смержить `OFFLINE_LEXICON_MCP_CONFIG.yaml` в актуальный
`~/.hermes/config.yaml`, не заменяя другие `mcp_servers`, затем:

```powershell
docker restart hermes-agent hermes-webui
docker exec -u hermes -e HOME=/home/hermes hermes-agent /opt/hermes/.venv/bin/hermes mcp list
```

Ожидается `hebrew_offline ... 2 selected ... enabled`. В live topology только
WebUI имеет `/workspace`; поэтому ordinary-chat lookup читает dataset по
`/workspace/datasets/...`. Agent CLI может зарегистрировать схемы и выполнить
wordfreq, но его контейнер не имеет dataset bind mount — это не поверхность
ordinary chat и не основание дублировать 53 MiB в Hermes volume.

## Снимок config.yaml

Полный config содержит секреты и не копируется в git. Перед H1.7 он отличался
от H1.6-снимка из-за последующих пользовательских настроек Hermes; live config
принят за источник истины.

- До H1.7:
  `61d1aacd034ecd2932c7c185f77f7154ca340a19c4c018ec1f818d939a571300`.
- После H1.7:
  `f1aaab3f594a9c7cd156347035712336b24167a7acbabdb1f918dcd509988852`.
- Emergency backup только в volume:
  `/home/hermes/.hermes/config.yaml.h1.7-before-20260722`.

## Offline-проверка

Acceptance A дополнительно выполнен в одноразовом контейнере с
`--network none --volumes-from hermes-webui`. Проверка соединения дала
`network_blocked:true`, после чего `kaikki_lookup("למד")` вернул три записи и
атрибуцию «по Викисловарю». Ни один инструмент mini-MCP не содержит сетевого
клиента.

## Откат

1. Удалить только mapping `mcp_servers.hebrew_offline` из актуального config.
2. Удалить только H1.7 working copies/runtime; dataset можно оставить для
   повторной установки либо удалить после проверки точного пути:

```powershell
docker exec hermes-agent rm -rf /home/hermes/.hermes/mcp-servers/offline-lexicon
docker exec hermes-agent rm -rf /home/hermes/.hermes/mcp-runtimes/offline-py313
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/mcp-runtimes/offline-py312
docker restart hermes-agent hermes-webui
```

Опциональное удаление dataset выполнять только для файла, указанного в
`DATASETS_MANIFEST.md`; он восстанавливается по URL+SHA. Не восстанавливать
полный emergency config поверх более новых изменений и не затрагивать H1.6.

## Owner-live

Одна реальная сессия: выбрать до 20 слов из плейлиста/текста, получить
wordfreq-приоритет и только для нужных лемм — Kaikki-глоссы с атрибуцией.
На Gemini free tier цепочка с чтением due-набора ограничена двумя
`kaikki_lookup` за сессию: каждый lookup выполняется отдельным ходом, следующий
начинается только после результата предыдущего. Это укладывает маршрут
`due → word_frequency → lookup 1 → lookup 2 → итог` в пять model-запросов.
Не просить модель сгенерировать несколько lookup-вызовов одним ходом.

Ответ `kaikki_lookup` также ограничен тремя словарными статьями, тремя senses,
восемью формами и тремя вариантами произношения на статью. Поля
`*_truncated`, `entries_total` и `limits` делают сокращение явным; полная
статья не маскируется под возвращённую.

Рекомендуемый owner-live prompt:

```text
Возьми до 20 слов из моего текущего due-набора. Одним вызовом word_frequency
оцени их частотность. Выбери ровно 2 полезные леммы и вызови kaikki_lookup
строго последовательно: один lookup за ход, дождись результата, затем второй.
Дай компактный итог по-русски с Zipf, атрибуцией «по Викисловарю» и пометкой,
что справка не канон. Не меняй состояние LinguistPro; exposure ≠ mastery.
```

Частота advisory, exposure ≠ mastery, FSRS не меняется. После сессии владелец
ставит вердикт 1–5 с комментарием; до этого максимум
`ENGINEERING_COMPLETE`.
