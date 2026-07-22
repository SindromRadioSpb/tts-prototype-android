# H1.8 — Horizon 1 closure evidence

Дата closure-аудита: 2026-07-23.

Исходный HEAD owner-amendment сессии: `c6dbcec`; версия LinguistPro: `3.11.221`.

Итог: **G-H1-CLOSURE ПРОЙДЕН ПО OWNER AMENDMENT У7**. Владелец явно решил,
что ждать блокирующее двухнедельное окно нельзя, и перенёс longitudinal
evidence в обязательный параллельный monitoring. Это не отменяет метрики:
окно 2026-07-23—2026-08-05, prompts и stop-условия зафиксированы, day-14
follow-up обязателен.

## 1. Owner decision и аудит слайсов

Цитата владельца 2026-07-23:

> «Утверждаю. Корректируем изменение канона. Ждать две недели принципиально
> нельзя. Двухнедельное наблюдение переносим в параллельный мониторинг.»

| Слайс | Engineering evidence | Owner verdict на closure | Статус | Рекомендация |
|---|---|---|---|---|
| H1.0 policy | reproduction + S1–S5 5/5 | 5/5, все ответы соответствовали ожиданиям | CLOSED | CONTINUE always-on |
| H1.1 conversation | A–C 3/3, personal-first | ранее протестировано успешно | CLOSED; rating в monitor | CONTINUE |
| H1.2 writing WCF | A–C 3/3, EPHEMERAL | ранее протестировано успешно | CLOSED; rating в monitor | CONTINUE |
| H1.3 weekly SRL | A–C 3/3, W1 proposal | ранее протестировано успешно | CLOSED; 2 датированных цикла в monitor | CONTINUE |
| H1.4 Sefaria | A–C 3/3, 15 tools | завершено успешно | CLOSED; rating в monitor | CONTINUE |
| H1.5 YouTube | A–C 3/3, caption warning | ранее протестировано успешно | CLOSED; rating в monitor | CONTINUE с quality label |
| H1.6 LRCLIB | A–C 3/3, coverage 2/5 | протестировано успешно | CLOSED; rating в monitor | CONTINUE opportunistically |
| H1.7 Kaikki+wordfreq | A–C 3/3, offline, repair | bounded retest успешен | CLOSED; rating в monitor | CONTINUE bounded flow |

Все `README.md` и `ACCEPTANCE_TRANSCRIPTS.md` H1.0–H1.7 существуют; коммиты
присутствуют в `main` и запушены.

## 2. Initial metrics и parallel monitoring

Initial owner smoke подтверждает работоспособность всех семи петель, но не
подменяет longitudinal результат. Monitoring использует короткие запросы из
`TWO_WEEK_MONITORING_PROMPTS.md` и собирает:

- ≥2 реальные conversation sessions: реплики, минуты, retry X/Y, rating;
- ≥2 WCF cycles: реальные revisions, минуты, исправления, rating;
- 2 SRL cycles в разных неделях: owner goal, anchor, adherence X/Y, rating;
- ≥1 общий разбор Sefaria + YouTube + LRCLIB + datasets;
- safety/consent/cost baseline и day-14 diff;
- CONTINUE/REPAIR/DISABLE per loop;
- критерий ≥1 loop с rating ≥4/5 и использованием ≥1 раз в каждую неделю.

Окно: **2026-07-23 — 2026-08-05 включительно**. Day-14 follow-up обновляет
этот файл и STATUS; он не блокирует H1 closure или H2 start после отдельного Д5.

## 3. Continuation override и stop-условия

Continuation evidence пока `PENDING_MONITORING`; owner decision У7 является
задокументированным override времени измерения для G-H2-START. Safety gates не
переносятся:

- unwanted write → немедленно остановить новые H2 mutation-paths;
- новый scope/consent drift → остановить затронутый путь и расследовать;
- metered cost >$0 без owner go → остановить cost-path;
- систематическая hallucination/sycophancy → REPAIR/DISABLE affected loop;
- day 14 без регулярной loop ≥4/5 → не начинать следующий ещё не начатый
  H2-слайс до owner решения CONTINUE/REPAIR/DISABLE.

## 4. Consent, W1, cost и production boundary

Live детерминированный `get_agent_connection` 2026-07-23:

- `connection_status=ACTIVE`;
- `consent_version=agent-access-consent-v2`;
- `capability_version=aa-v0.1`;
- 15 ранее существующих scopes; новых H1 scopes нет;
- retention notice: `EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO`.

Дифф H1 до closure содержит только `docs/`: production-код LinguistPro,
существующие MCP-схемы и `CAPABILITY_VERSION` не менялись. H1 config-добавления
были внешними/read-only и не меняли OAuth-секцию LinguistPro.

В документированных финальных сценариях минимум 32 наблюдения и **0 unwanted
writes**. H1.3 создал один явно подтверждённый `PENDING` proposal; approval не
выполнялся. Известная инкрементальная стоимость H1-интеграций — `$0`: Sefaria,
LRCLIB, datasets и YouTube wrapper бесплатны, Gemini фактически работал в free
tier и возвращал quota errors. Полный account-level cost diff повторяется в
monitoring; неизвестное не выдаётся за подтверждённый ноль.

## 5. Инцидент baseline

| Класс | Наблюдение | Состояние на closure |
|---|---|---|
| grounding | ранние H1.0 модели давали морфологию без источника; H1.7 добавлял переводы к frequency | final policy/tool contracts PASS |
| sycophancy | ранние H1.0 S5 давали пустую похвалу | global SOUL final S5 PASS |
| tool hallucination | ранняя H1.5 policy допустила заявление о `yt-dlp` | усилено; final PASS |
| unwanted writes | 0; один explicit pending proposal | W1 PASS |
| provider/operations | Gemini 429, empty stream, H1.7 truncation | bounded repair; quota остаётся внешним ограничением |
| upstream quality | auto captions, LRCLIB 2/5, Kaikki non-canonical | provenance/degradation PASS |

## 6. Closure checklist

- [x] H1.0–H1.7 CLOSED по engineering evidence + owner verdict; ratings
      H1.1–H1.7 назначены в monitor по У7.
- [x] Initial H1.8 evidence и incident baseline существуют.
- [x] Consent/W1 verification PASS; новых scopes/grants H1 не вводил.
- [x] Known incremental integration cost `$0`; account-level diff monitored.
- [x] 14-day monitoring dates, prompts и stop-условия существуют.
- [x] STATUS переводит H1 в CLOSED и monitoring в ACTIVE.

**G-H1-CLOSURE: PASS.**

## 7. Решение Д5

Запрос:

> «H1 закрыт по утверждённому переносу двухнедельного наблюдения в
> параллельный monitoring; давать ли go на H2?»

Ответ владельца 2026-07-23: **`Д5: GO H2`**. G-H2-START пройден; H2.1 открыт
как `PLANNED`. Обязательный H1 monitoring продолжается параллельно.
