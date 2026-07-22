# H1.7 acceptance transcripts

Дата: 2026-07-22. Финальные ordinary-sessions: модель
`gemini-3.5-flash-lite`, `personality:null`.

## Preflight и discovery

- Dataset: 55 914 373 bytes, 17 395 JSONL lines, SHA-256
  `dc8d8f97975c59f1588ade5cf2e8a2e5a7deb9a99817bbe3a536df4331d8ee0f`.
- Full scan + exact `למד`: 1,530 s, то есть ниже SQLite-порога `>2s`.
- `wordfreq==3.1.1`: `he_supported:true`; `zipf_frequency("למד","he")=4.83`.
- `hermes mcp list`: `hebrew_offline ... 2 selected ... enabled`.
- Экспонированы только `mcp__hebrew_offline__kaikki_lookup` и
  `mcp__hebrew_offline__word_frequency`; существующие четыре MCP-сервера
  остались enabled.
- Canon/installed source SHA-256 совпадает:
  `83190da50fa69bf958fe9bb22fe0df5b5bedaced0df8f0a83532a266bf7f01aa`.

## Offline gate для A

Отдельный процесс запущен из того же WebUI image с `--network none` и теми же
volume mounts. Вывод:

```text
{'network_blocked': True, 'ok': True,
 'source': 'WIKTIONARY_VIA_KAIKKI',
 'attribution': 'по Викисловарю', 'entries': 3}
```

Вердикт offline gate: **PASS**.

## A — частое слово למד

Session: `3c233ca92198`.

```text
TOOL=mcp__hebrew_offline__kaikki_lookup ARGS={"lemma":"למד"}
```

Ответ Hermes:

```text
По Викисловарю:
Глосса: to learn, to study (учиться, изучать)
Форма и произношение: לָמַד (lamád), Modern Israeli Hebrew /laˈmad/.
Это справка по Викисловарю, а не канон морфологии LinguistPro/Pealim;
конфликт сам не разрешаю.
```

Вердикт: **PASS** — статья найдена offline, provenance и non-canonical boundary
явны.

## B — опечатка/отсутствующая лемма

Session: `239422e2400f`.

```text
TOOL=mcp__hebrew_offline__kaikki_lookup ARGS={"lemma":"למדדד_לא_קיים"}
```

Ответ Hermes:

```text
NOT_FOUND (retryable:false).
Точной статьи в локальном snapshot (по Викисловарю) нет.
Глоссы, формы и этимология отсутствуют.
```

Вердикт: **PASS** — честная деградация без выдумки.

## C — частоты пяти live due-слов

Due source session: `7ce74cb631b7`, live tool
`mcp__linguistpro__get_due_review_items({"limit":10})`. Выбраны пять разных
лемм: `שאת`, `נוסח`, `להבליח`, `יופי`, `לבוז`.

Первая C-session `73557b8f6a4a` правильно получила Zipf, но модель добавила
переводы, отсутствовавшие в tool-result; для омонимичного `שאת` это было
особенно ненадёжно. Итерация признана FAIL. Контракт усилен: tool description и
`content_scope` прямо запрещают выводить meanings/translations из частоты.

Финальная session: `f731dc2e6cc9`.

```text
TOOL=mcp__hebrew_offline__word_frequency
ARGS={"words":["שאת","נוסח","להבליח","יופי","לבוז"]}
```

Ответ Hermes:

```text
שאת: Zipf 5.52 — частое
נוסח: Zipf 4.62 — средней частотности
להבליח: Zipf 1.24 — редкое
יופי: Zipf 4.99 — средней частотности
לבוז: Zipf 3.01 — нечастое

Справочная выдача (exposure) не означает mastery и не вносит изменений
в расписание FSRS в LinguistPro.
```

Вердикт: **PASS на второй итерации** — один bounded вызов для пяти реальных
due-слов, численные значения/интерпретации адекватны, переводов и state mutation
нет.

## Итог

Acceptance: **3/3 PASS**; offline gate PASS; manifest completeness PASS.
Kaikki представлен как справка «по Викисловарю», wordfreq — advisory, не
mastery/canonical truth.

## Free-tier owner-live incident и repair — 2026-07-23

Owner-live session `952b25145fab` на `gemini-3.5-flash` трижды завершилась
`Error: Response truncated due to output length limit`. Трасса показывает:

- live due-read завершился (`5 659` символов tool-result);
- один `word_frequency` завершился (`4 025` символов tool-result);
- ни одного tool-result `kaikki_lookup` в сессии нет;
- перед вторым truncation модель текстом объявила пять Kaikki lookup, но не
  успела сформировать валидные tool calls;
- следующая попытка отдельно закончилась Gemini `HTTP 429
  RESOURCE_EXHAUSTED`.

Следовательно, первичный truncation возник на генерации нескольких tool calls,
а не после чтения большого Kaikki-result. Repair сочетает два ограничения:

1. tool description требует строго один lookup на model-ход и ожидание его
   результата;
2. free-tier due-flow ограничен двумя lookup на сессию, а каждый Kaikki-result
   сокращён с явными `*_truncated`/`limits` без потери provenance и
   non-canonical boundary.

Локальная проверка установленного repair:

```text
py_compile: PASS
word_frequency(5 real due lemmas): ok=true, results=5
kaikki_lookup("למד"): ok=true, 2012 JSON chars, entries=3
kaikki_lookup("נוסח"): ok=true, 1208 JSON chars, entries=1
kaikki_lookup("למדדד_לא_קיים"): NOT_FOUND, 242 JSON chars
canon SHA = agent SHA = WebUI SHA
2 tools selected, hebrew_offline enabled
```

Принудительный end-to-end rerun на `gemini-3.6-flash` не получил даже
минимальный одно-tool smoke из-за внешнего `HTTP 429 RESOURCE_EXHAUSTED`
(`generate_content_free_tier_requests`, reported limit 20). Вердикт repair:
**LOCAL/INSTALL PASS; MODEL E2E BLOCKED BY QUOTA; owner-live retest pending**.

## Owner-live repair retest — PASS

Дата: 2026-07-23. Владелец повторил bounded free-tier сценарий и сообщил
`готово`. Обработаны две due-леммы:

```text
שקר: Zipf 4.73 — средней частотности.
По Викисловарю: существительное שֶׁקֶר; множественное число שְׁקָרִים;
также отмечен глагольный вариант שִׁקֵּר.

חלק: Zipf 5.74 — частое.
По Викисловарю: многозначная лемма — חָלָק, חֵלֶק и חָלַק.

Данные частотности получены из WORDFREQ, лексическая справка —
по Викисловарю; справка не канон, состояние LinguistPro не изменялось,
exposure ≠ mastery.
```

Вердикт: **PASS** — последовательный двухлеммный маршрут завершился без
truncation; provenance, advisory/non-canonical boundary и W0/W1 соблюдены.
Владелец не указал числовую оценку, поэтому она не выдумывается. H1.7 закрыт.
