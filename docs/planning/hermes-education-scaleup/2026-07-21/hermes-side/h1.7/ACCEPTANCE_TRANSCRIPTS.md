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
