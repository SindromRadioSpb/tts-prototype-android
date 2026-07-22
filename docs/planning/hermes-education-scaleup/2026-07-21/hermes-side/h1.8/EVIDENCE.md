# H1.8 — Horizon 1 closure evidence

Дата аудита: 2026-07-23.

Исходный HEAD: `1b86050`; версия LinguistPro: `3.11.221`.

Итог: **G-H1-CLOSURE НЕ ПРОЙДЕН**. Инженерные артефакты H1.0–H1.7 и
качественные owner verdicts существуют, но обязательное двухнедельное окно,
числовые оценки 1–5 и часть ручных метрик не доказаны. H2 остаётся
заблокирован; запрос Д5 до закрытия H1 не формулируется как доступное решение.

## 1. Аудит слайсов

| Слайс | Канон + transcripts | Engineering | Owner evidence | Строгий verdict H1.8 | Рекомендация |
|---|---|---|---|---|---|
| H1.0 policy | PASS | reproduction + S1–S5 5/5 | 3 сценария, 5/5 | CLOSED | продолжать always-on |
| H1.1 conversation | PASS | A–C 3/3 | владелец сообщил об успехе; число/даты сессий, retry и оценка 1–5 не записаны | OWNER_LIVE | продолжать; дозаполнить окно |
| H1.2 writing WCF | PASS | A–C 3/3, EPHEMERAL | владелец сообщил об успехе; число циклов, revised drafts и оценка 1–5 не записаны | OWNER_LIVE | продолжать; дозаполнить окно |
| H1.3 weekly SRL | PASS | A–C 3/3 | владелец сообщил об успехе; две разные календарные недели и adherence не доказаны | OWNER_LIVE | продолжать; дождаться/зафиксировать вторую неделю |
| H1.4 Sefaria | PASS | A–C 3/3 | «завершено успешно», без оценки 1–5 | OWNER_LIVE | продолжать |
| H1.5 YouTube | PASS | A–C 3/3 | владелец подтвердил прежний успешный тест; видео/дата и оценка 1–5 не записаны | OWNER_LIVE | продолжать с маркировкой auto captions |
| H1.6 LRCLIB | PASS | A–C 3/3, coverage 2/5 | «Протестировано успешно», без оценки 1–5 | OWNER_LIVE | оставить как opportunistic источник |
| H1.7 Kaikki+wordfreq | PASS | A–C 3/3, offline; repair PASS | bounded retest `שקר`/`חלק` успешен, без оценки 1–5 | OWNER_LIVE | продолжать bounded free-tier flow |

Все заявленные `README.md` и `ACCEPTANCE_TRANSCRIPTS.md` для H1.0–H1.7
существуют. Коммиты слайсов присутствуют в `main` и были запушены.

## 2. Двухнедельное окно и метрики

Первый system-enforced H1.0 был завершён 2026-07-22 00:58 +03:00; H1.1–H1.7
были установлены 2026-07-22, последний repair H1.7 — 2026-07-23. На момент
аудита прошло менее двух календарных дней. Поэтому требование H1.8 «метрики за
≥2 недели» нельзя подтвердить задним числом.

| Метрика 08 §1 | Подтверждено | Недостаёт для closure |
|---|---|---|
| conversation sessions | qualitative PASS | даты, ≥2 реальных сессии, реплики/неделю |
| production minutes/week | нет надёжного ручного итога | минуты речи + письма за две недели |
| revised drafts/week | qualitative PASS | ≥2 WCF-ревизии и недельное распределение |
| weekly retrospectives | qualitative PASS | две даты в разных календарных неделях |
| goal adherence | нет | выбранная цель и доля дней исполнения |
| retry success | engineering A PASS | owner-window attempts/success |
| integrated song analysis | отдельные интеграции проверены | один реальный разбор с Sefaria + LRCLIB + YouTube + datasets вместе |
| owner usefulness | H1.0 = 5/5; остальные qualitative PASS | числовая оценка 1–5 по H1.1–H1.7 |
| cost | все H1-компоненты бесплатны; Gemini отвечал free-tier quota errors | явное owner/billing подтверждение факта `$0` |

Continuation evidence из 08 §3: **НЕ ДОКАЗАНО**. H1.0 имеет 5/5, но это
policy, а не регулярно используемая учебная петля; по H1.1–H1.7 нет
зафиксированного числового verdict ≥4/5 и использования ≥1 раз/нед в
двухнедельном окне. Owner override также не дан.

## 3. Consent, write-boundary и production diff

Live детерминированный вызов `get_agent_connection` 2026-07-23 вернул:

- `connection_status=ACTIVE`;
- `consent_version=agent-access-consent-v2`;
- `capability_version=aa-v0.1`;
- 15 уже существующих scopes: connection/explanations/brief/profile,
  personal-text metadata+content, public reading/search, review
  activity/items/summary, два handoff-create и `intent.propose`;
- downstream notice: `EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO`.

Дифф `722cddb..1b86050` содержит только `docs/`; production-код LinguistPro,
его MCP-схемы и `CAPABILITY_VERSION` не менялись. H1 config-изменения
добавляли только внешние/read-only MCP и не изменяли OAuth-секцию LinguistPro.
Таким образом, новых LinguistPro scopes/grants в H1 не вводилось.

По финальным acceptance-транскриптам минимум 32 сценарных наблюдения имеют
**0 unwanted writes**. Единственная state-adjacent операция — H1.3
`propose_action(kind=note)` после явного owner confirmation; результат остался
`PENDING`, approval не выполнялся. Это соответствует W1 и не является скрытой
записью. Для двухнедельного owner-window всё ещё требуется ручное подтверждение
`0 при N наблюдениях`.

## 4. Инцидент-журнал

| Класс | Наблюдение | Финальное состояние |
|---|---|---|
| grounding/hallucination | ранние H1.0 модели выдавали незаземлённую морфологию; H1.5 один раз заявил несуществующий `yt-dlp`; H1.7 первая frequency-итерация добавила переводы | исправлено policy/tool descriptions; финальные acceptance PASS |
| sycophancy | ранние H1.0 S5 давали пустую похвалу/comprehensive rewrite | global SOUL final S5 PASS |
| unwanted writes | 0 в документированных финальных сценариях; один явно подтверждённый pending proposal | W1 соблюдён |
| provider/operations | Gemini 429, один empty stream, H1.7 truncation | bounded flow/повторы помогли; quota остаётся внешним ограничением |
| upstream quality | YouTube auto captions, LRCLIB coverage 2/5, Kaikki non-canonical | честная маркировка и graceful degradation активны |

## 5. Что должен добавить владелец

После реального окна не менее двух недель заполнить одним сообщением:

```text
Период H1 owner-live: YYYY-MM-DD — YYYY-MM-DD.
H1.1: N разговорных сессий, M минут, retry X/Y, оценка K/5 — комментарий.
H1.2: N WCF-циклов, N ревизий, M минут, оценка K/5 — комментарий.
H1.3: ретро даты D1 и D2; цель; исполнено X/Y дней; оценка K/5 — комментарий.
H1.4: оценка K/5 — комментарий.
H1.5: видео/фрагмент; оценка K/5 — комментарий.
H1.6: песня; оценка K/5 — комментарий.
H1.7: оценка K/5 — комментарий.
Общий разбор песни: Sefaria + LRCLIB + YouTube + datasets — PASS/FAIL, ссылка/название.
Инциденты owner-window: hallucination N, sycophancy N, unwanted writes N при T сессиях.
Фактические затраты H1: $N.
```

После этого H1.8 повторно проверяет G-H1-CLOSURE. Только после реального
закрытия горизонта владелец получает отдельный запрос Д5: давать ли go на H2.
