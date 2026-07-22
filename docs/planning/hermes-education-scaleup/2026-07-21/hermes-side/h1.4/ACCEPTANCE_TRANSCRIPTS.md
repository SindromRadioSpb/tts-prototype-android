# H1.4 acceptance transcripts

Дата: 2026-07-22

Модель: `gemini-3.6-flash` / provider `gemini`; новые ordinary WebUI sessions,
`personality: null`. Endpoint: официальный `https://mcp.sefaria.org/sse`.

## Preflight

- HEAD: `febf4a9`; package version: `3.11.221`.
- STATUS: H1.0 `CLOSED`, H1.4 `PLANNED` до начала работы.
- `hermes-agent` running; `hermes-webui` healthy.
- GET endpoint с `Accept: text/event-stream` с Windows-хоста и из
  `hermes-agent`: `HTTP 200`, `content-type: text/event-stream; charset=utf-8`.
  Curl завершён локальным timeout после получения SSE-заголовков, потому что
  корректный SSE-поток остаётся открытым.
- До установки в `mcp_servers` присутствовал только `linguistpro`; секция не
  изменялась и не удалялась.

## Tool registry: PASS

CLI после рестарта:

```text
linguistpro  https://linguistpro...       16 selected  enabled
sefaria      https://mcp.sefaria.org/sse  all          enabled
```

Session `e5fac88ee914` без tool-вызовов перечислил 15 зарегистрированных tools:

```text
clarify_name_argument, clarify_search_path_filter, english_semantic_search,
get_available_manuscripts, get_current_calendar, get_english_translations,
get_links_between_texts, get_manuscript_image, get_text,
get_text_catalogue_info, get_text_or_category_shape, get_topic_details,
search_in_book, search_in_dictionaries, text_search
```

Все зарегистрированы с namespace `mcp__sefaria__*`. **PASS**.

## A — цитата песни → точный стих: PASS

Session `9b9a05f0deac`. Наружу передана только короткая цитата.

```text
USER:
«גם כי אלך בגיא צלמוות» — найди точный стих через Sefaria.

TOOLS:
text_search({"query":"גם כי אלך בגיא צלמוות"})
text_search({"query":"בגיא צלמוות"})
get_text({"reference":"Psalms 23:4","version_language":"source"})

ASSISTANT:
Точная координата Sefaria: Psalms 23:4 (תהילים כג:ד).
Версия: Miqra according to the Masorah.
גַּ֤ם כִּֽי־אֵלֵ֨ךְ בְּגֵ֪יא צַלְמָ֡וֶת לֹא־אִ֘ירָ֤א רָ֗ע
כִּי־אַתָּ֥ה עִמָּדִ֑י שִׁבְטְךָ֥ וּ֝מִשְׁעַנְתֶּ֗ךָ הֵ֣מָּה יְנַֽחֲמֻֽנִי׃
```

Текст получен инструментом, координата и версия названы, объяснение отделено
от цитаты. Личные данные не передавались. **PASS**.

## B — Klein для одного due-слова без списка: PASS

Session `3a0896a6d1db`. Слово `ראשית` выбрано локально; LinguistPro не
вызывался, внешний запрос не содержал признака due или соседнего контекста.

```text
TOOL:
search_in_dictionaries({"query":"ראשית"})

ASSISTANT:
Klein Dictionary, רֵאשִׁית; f.n.
1. beginning; 2. first fruits; 3. choice, best part.
Образовано от רֹאשׁ с суффиксом ־ִית; названы также формы и сравнения,
реально возвращённые статьёй Klein.
```

В Sefaria ушло ровно одно слово. Конкретный словарь и headword названы по
результату, а не по догадке. **PASS**.

## C — несуществующий ресурс: PASS

Session `5fd420ada197`.

```text
TOOL:
get_text({"reference":"Definitely_Not_A_Sefaria_Book_987 1:1"})

RESULT:
Error fetching text: 404 Client Error: Not Found

ASSISTANT:
Ресурс в базе Sefaria отсутствует. Я не восстанавливаю текст, координаты или
содержание по памяти и не подменяю его похожей книгой.
```

Ошибка названа точно; выдуманного текста или альтернативной координаты нет.
**PASS**.

## Privacy/provenance и итог

- Во всех трёх sessions автоматически загружен `linguistpro-sefaria-policy`.
- Ни одного вызова LinguistPro, write/propose/approval или передачи личного
  текста, due-списка либо профиля.
- Config и policy пережили обязательный restart; WebUI healthy.

Engineering acceptance: **3/3 PASS**. Owner-live остаётся: один реальный разбор
песни с найденным интертекстом и вердикт владельца; до него `CLOSED` запрещён.
