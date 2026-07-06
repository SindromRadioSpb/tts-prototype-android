# /explain sentence — приватность-решение владельца (2026-07-06)

> Контекст: CLG-P6 слайс 2 (AI_MENTOR_RECON_2026_07_04.md §9/§15.9). До этого решения
> сервер принципиально НЕ парсил содержимое учебных артефактов (opaque store, CLG-P5.5),
> а consent класса B (`cloud_texts`) обещал только «доступность на других устройствах».
> `/explain` — первая функция, где содержимое текста пользователя уходит в промпт
> внешнего LLM-провайдера. Норма «приватность ДО кода» (R15): развилка представлена
> владельцу, решение получено ДО включения инструмента. Реализовано в v3.11.109.

## Решение

**Consent: вариант 1 — отдельный durable consent.**

- Новый ключ `consent_records`: **`agent_read_texts`** (v1).
- Смыслы НЕ склеиваются: `cloud_texts` = «хранить/синхронизировать мои тексты»;
  `agent_read_texts` = «разрешить AI-наставнику читать текст и отправлять фрагмент
  внешнему LLM». Пользователь может иметь кросс-девайс синк БЕЗ чтения агентом.
- Серверное правило на КАЖДЫЙ запрос (fail-closed, не тихая деградация):
  `cloud_texts && agent_read_texts`, иначе 403 с точным кодом
  (`CLOUD_TEXTS_CONSENT_REQUIRED` / `AGENT_READ_TEXTS_CONSENT_REQUIRED`).
- UI: чекбокс «🤖 Разрешить наставнику читать мои тексты» в ☁-модале + **разовый
  first-use confirm** при первом /explain (situated consent; после подтверждения —
  durable запись, дальше без вопросов). Per-request confirm на каждый вызов ОТКЛОНЁН
  (убивает функцию, R4); расширение класса B до v2 ОТКЛОНЕНО (ломает гранулярность §5
  и инвалидирует существующее согласие ради одной функции).

**Отзыв consent — purge, не пометка.**

- Новые /explain → 403 fail-closed немедленно.
- Контентные поля УЖЕ сохранённых `agent_explanations` зануляются
  (`facts_used_json='[]'`, body → tombstone `{scope_level, purged_at,
  purge_reason:'consent_revoked'}`); остаются только технические поля
  (id/user_id/created_at/llm_model/sentence_id-якорь). Обоснование: facts_used
  цитирует предложение пользователя — «оставить, но пометить» недостаточно (§5 v3).
- Провал purge НЕ молчит: виден в ответе consent-эндпоинта и в audit_log.

**Scope: вариант 1 — только якорное предложение.**

- Контракт входа: `{ text_key, order_index, scope_level }`; сервер принимает ТОЛЬКО
  явный `scope_level='sentence_only'` — иное (в т.ч. отсутствие) → 400
  `UNSUPPORTED_EXPLAIN_SCOPE`. Enum заложен сразу, чтобы будущий
  `sentence_plus_neighbors` расширял контракт измеряемо, не ломая его.
- В LLM уходит: одно предложение (+перевод, если есть) + резолвер-морфология +
  уже раскрываемая в /plan плоскость класса A (леммы due/weak, production_gap).
- НЕ уходит: соседние предложения, абзац, название текста, user_id, сырые логи
  review_log, полная история ошибок. Извлечение одной строки — физическое свойство
  `db/agentSentenceRepo.js` (модуль не читает соседей вовсе).
- Расширение scope (соседи/абзац) — только после реальных сигналов нехватки контекста
  И отдельного решения + consent-копии.

## Гейт-лист владельца → smoke:agent-explain (33/33)

Consent: no session 401 · no CSRF 403 · cloud_texts=false 403 · agent_read_texts=false
403 · оба true 200 · revoked → 403. Scope: sentence_only allowed · neighbors/paragraph
400 · соседи отсутствуют в ответе/facts_used/stdout. Provenance: строка создана ·
facts_used {anchor, scope_level, morphology source=resolver/asserted, learner_state} ·
provider/model в body · export-sweep. Privacy: prompt/предложение/перевод не в stdout ·
ключи не текут. MNAR: review_log нетронут. Revoke: purge tombstone + контент отсутствует
в export. Kill-switch: LLM-less объяснение полезно (перевод+морфология) · ledger не
растёт (проверка ДО резерва).

## Провайдер-примечание (R15/R16)

Для /explain наружу уходит контент пользователя ⇒ провайдеры, чья карточка модели
разрешает тренировку на free-tier input (прецедент: отклонённый Poolside Laguna M.1),
для этого инструмента недопустимы. Текущие: Gemini (AGENT_GEMINI_API_KEY) и
OpenRouter/Nemotron (карточка без train-on-input оговорки, проверено 2026-07-06).
При смене AGENT_OPENROUTER_MODEL — перепроверять data-policy карточки.
