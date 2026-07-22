# H1.7 datasets manifest

Дата установки: 2026-07-22. Обновление — только вручную, не чаще одного раза
в квартал.

## Kaikki Hebrew

| Поле | Значение |
|---|---|
| Источник | <https://kaikki.org/dictionary/Hebrew/kaikki.org-dictionary-Hebrew.jsonl> |
| Страница набора | <https://kaikki.org/dictionary/Hebrew/index.html> |
| Локальный файл | `G:\HERMES_AGENT\datasets\kaikki\kaikki.org-dictionary-Hebrew-2026-07-20.jsonl` |
| Путь в WebUI | `/workspace/datasets/kaikki/kaikki.org-dictionary-Hebrew-2026-07-20.jsonl` |
| Дата extraction snapshot | 2026-07-20 |
| Enwiktionary dump | 2026-07-06 |
| HTTP Last-Modified | `Mon, 20 Jul 2026 12:22:58 GMT` |
| HTTP ETag | `"6a5e1322-3552f85"` |
| Размер | 55 914 373 bytes (53.32 MiB) |
| Строк JSONL | 17 395 |
| SHA-256 | `dc8d8f97975c59f1588ade5cf2e8a2e5a7deb9a99817bbe3a536df4331d8ee0f` |
| Лицензия/атрибуция | Wiktionary data, CC BY-SA; ответы: «по Викисловарю» |

Страница Kaikki сообщает, что snapshot построен из English Wiktionary через
wiktextract. Данные являются внешней справкой, не каноном морфологии
LinguistPro/Pealim.

## wordfreq

| Поле | Значение |
|---|---|
| Пакет | `wordfreq==3.1.1` |
| Источник | <https://pypi.org/project/wordfreq/3.1.1/> |
| Проверенная language key | `he` |
| Лицензия кода | Apache-2.0 |
| Лицензия включённых redistributable data | CC BY-SA 4.0 и перечисленные upstream-лицензии |
| WebUI runtime | `~/.hermes/mcp-runtimes/offline-py312` (110 MiB вместе с `mcp==1.26.0`) |
| Agent runtime | `~/.hermes/mcp-runtimes/offline-py313` (66 MiB) |

## Решение об индексе

Первый полный scan свежим Python-процессом одновременно посчитал строки и
нашёл `למד` за **1,530 секунды**. Порог промта — строить SQLite только при
`>2s`; поэтому SQLite-индекс намеренно не создан. Mini-MCP выполняет точный
Unicode NFKC scan JSONL. Это сохраняет простую процедуру обновления без второго
артефакта, который мог бы рассинхронизироваться.

## Процедура ручного обновления

1. Не выполнять чаще одного раза в квартал.
2. Скачать официальный JSONL во временное имя рядом с текущим файлом.
3. Зафиксировать страницу snapshot: extraction date, dump date,
   `Last-Modified`, `ETag`.
4. Посчитать bytes, строки и SHA-256; проверить, что каждая строка — JSON object.
5. Измерить полный lookup `למד`. Если scan стал `>2s`, построить и отдельно
   документировать SQLite lemma-index; не менять lookup молча.
6. Прогнать `למד`, заведомый miss и wordfreq smoke.
7. Только после PASS заменить активное имя файла, обновить путь config/README и
   этот манифест, затем перезапустить оба Hermes-контейнера.

Старый snapshot удалять только после проверки новой ordinary-session. Сами
JSONL/wordfreq data в git не добавлять.
