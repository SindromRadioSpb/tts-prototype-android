# PAS слайс A — «Компаньон для любого текста» (спека-дельта, v2 после критики)

**Дата:** 2026-07-11 → **v2 2026-07-12** (адъюдикация критики wf_35f46603: 39 находок, 3 BLOCKER / 17 MAJOR — ВСЕ приняты; ключевые развороты помечены ⚡). **Программа:** `PREMIUM_AGENT_SYSTEM_RECON_2026_07_11.md` §2-A. Порядок имплементации: **A1 → A4 → A2 → A3**, отдельные коммиты/гейты.

## A1 — Объяснение предложения из КОРПУСА

### Сервер
1. **Tool `get_corpus_sentence_context`** (закрытый реестр agent/tools.js):
   - args `{ corpus:'benyehuda', work_id, text_key, order_index }`. ⚡Якорь ОБЯЗАН нести `text_key` (критика-BLOCKER: многоглавные canon-работы делят один byehuda_id на несколько текстов — выбор элемента `texts[]` строго по `text_key`, БЕЗ фолбэка на `texts[0]`; промах = честный `CORPUS_SENTENCE_NOT_FOUND`).
   - валидация: corpus enum; `work_id` `/^\d{1,8}$/`; `text_key` `/^[a-f0-9]{16,64}$/`; `order_index` int ≥0 (⚡без верхнего cap — ряд ищется по равенству значения `rows[].order_index`, не по позиции).
   - ⚡читает `DATA_DIR/benyehuda/works/<work_id>.json` и разворачивает **`payload.library.texts`** (реальная форма бандла; `payload.texts` — только как legacy-фолбэк). Dev-фолбэк на `public/data/benyehuda/works` — за env `CORPUS_WORKS_DEV_FALLBACK=1` (в гейтах выключен).
   - stat-гард ≤8MB (реальный максимум сегодня 1.27MB) + ⚡bounded LRU распарсенных работ (8 слотов, ключ `work_id:mtime`).
   - returns `{ anchor:{corpus, work_id, text_key, order_index}, sentence:{he, he_niqqud, ru}, work:{title, author, era, license:'public-domain'} }`. Consent-гейта нет (public domain), но см. п.5 о раскрытии learner-состава.
2. **Explainer, corpus-ветка:** дискриминатор `args.source==='corpus'` → первая ступень ядра = corpus-tool; остальное ядро без изменений. ⚡`sentence_id` ОСТАЁТСЯ `text_key+'#'+order_index` (как личный путь) — история/openTextAt работают как есть (корпусные OPFS-тексты несут тот же text_key); корпус-идентичность живёт в `facts_used[0]`: `kind:'corpus_sentence', source:'corpus_artifact', license:'public-domain', anchor:{corpus, work_id, text_key, order_index}, text`. `runtime._explanationListItem` пробрасывает `kind` (клиент различает копию тостов/бейджей). Scenario леджера — `explain`.
3. **Endpoint `POST /api/agent/explain`:** ветка `source==='corpus'` требует work_id+text_key+order_index и ⚡реджектит смешанный body (одновременно text_key-личный контракт и work_id → 400 `BAD_SOURCE_MIX` — фактически: при source==='corpus' поле работает в corpus-смысле, при отсутствии source наличие work_id → 400). ⚡Маппинг новых кодов: not-found-класс → 404, `CORPUS_WORK_TOO_LARGE` → 413, валидация → 400 (не 500). ⚡Ответ несёт `usage:{user_llm_calls, limit}` (R16-видимость в точке трат). ⚡Same-day dedupe: свежее (сегодняшнее, тот же язык) объяснение того же sentence_id отдаётся из `agent_explanations` БЕЗ нового reserve, с метой «из истории».
4. **Purge-семантика (⚡):** revoke `agent_read_texts` тумбстоунит ТОЛЬКО строки с `facts_used[0].kind==='user_sentence'` (JS-фильтр в `purgeExplanationContent`) — корпус-объяснения не относились к этому consent (R9: ложный purge_reason запрещён). Telegram `/explain`-лента остаётся за consent как есть (over-restrict для corpus-only принят как fail-safe v1 — записано).

### Клиент (Зал)
5. `openText`: `readerCorpusWorkId` — ⚡фолбэк-цепочка как у `loadProcliticOverlay` (`text.byehuda_id || meta.corpus.byehuda_id || digits(textId='by-…')`), присваивается БЕЗУСЛОВНО (null для не-корпуса), ⚡сбрасывается в `closeReader` (урок singleton-reset). Кнопка 🤖 на корпусе — ⚡только после разового HEAD-probe `/data/benyehuda/works/<id>.json` (кэш в памяти на текст; 404 = works-файл не опубликован — canon-тексты из zip! — кнопка не вешается, тупика нет).
6. Corpus-путь: ⚡обходит ОБА клиентских consent-pre-check'а (cloud_texts, agent_read_texts), но ⚡first-use confirm ОСТАЁТСЯ (одноразовый, свой флаг): «Предложение — public domain, но наставник учтёт ВАШИ слабые/просроченные слова и потратит 1 вызов из дневного лимита» (learner-леммы реально уходят в LLM — прецедент /plan; формулировка «ничего личного не читается» из v1 УДАЛЕНА как ложная).
7. Модал: провенанс «Источник: корпус Бен-Иегуды · public domain» + ⚡футер «AI сегодня: N/50» (из usage) + ⚡skeleton-сверка: вернувшееся `sentence.he` сравнивается с тапнутым рядом (stripNiqqud), расхождение → честная приписка «текст работы обновился — объяснение может не совпадать» (издание OPFS ≠ том). ⚡Offline/timeout: `navigator.onLine`/network-fail → «🤖 Наставник доступен онлайн»; клиентский таймаут 30с + AbortController на закрытие (вызов уже списан — сказать честно). ⚡Тост openTextAt при промахе для kind=corpus: «откройте работу в Корпусе» (не «синхронизируйте Мои тексты»); histEmpty-копия обновлена. Все строки tt() ×3 локали + SW bump.

### Гейт `smoke:agent-explain-corpus`
- hermetic temp-DATA_DIR; ⚡фикстура = усечённая КОПИЯ РЕАЛЬНОГО works-файла (с `library`-обёрткой, sha256 text_key, `_reniqqud`-ключом), id вне реального диапазона (90000077); dev-фолбэк выключен.
- happy-path на реальной форме (`library.texts`), facts_used[0].kind/anchor/license; morphology из резолвера; LLM-off → детерминированный фолбэк.
- teeth: traversal-id reject · несуществующий work → 404-класс · ⚡чужой text_key при верном work_id → NOT_FOUND (нет фолбэка texts[0]) · order_index-промах честен · corpus работает при ПУСТЫХ consent-строках И одновременно личный путь на том же сервере → 403 (гейты не смешаны) · ⚡revoke agent_read_texts: личная строка tombstone, корпусная нетронута · same-day dedupe: второй запрос без нового reserve · usage в ответе · ⚡LRU: повторный запрос не перечитывает файл (маркер mtime).
- ⚡`publish-corpus-batch.js` получает ассерт «позиция==значение order_index» для каждого текста (инвариант, на который опирается матчинг).

## A4 — «Объяснить это слово в этом предложении» (tap-карточка)

- ⚡UI-контракт: секция-аккордеон ПОСЛЕ rm-actions (не выше учебных действий); кнопка «🤖 Объяснить (наставник)» — формулировка/иконка отличается от «Уточнить чтение (Dicta)»; ответ textContent в раскрытой секции + провенанс-строка + деградация; свой in-flight guard (паттерн `_explainInFlight`); Playwright-скриншот 380px до коммита; `smoke:reader-morph` в регрессии слайса.
- Scenario `explain_word`; context-pack = resolver-факты слова + ⚡АКТИВНОЕ ЧТЕНИЕ КАРТОЧКИ `{lemma,root,binyan,pos,provenance:offline|dicta-context}` как asserted-факт (критика: серверный offline-резолв может противоречить Dicta-промоушену прямо под карточкой — промпт обязан подавать displayed-чтение как основное, расхождение → ambiguous) + ОДНО предложение (корпус — corpus-tool; личный текст — существующий consent-путь; ⚡403 на карточке → открыть explain-модал с consent-панелью, не тупик).
- Персист `create_explanation` с `body.kind='word'`; ⚡kind пробрасывается в историю (бейдж).
- Гейт: corpus- и личный пути; displayed-чтение не противоречит объяснению (mock-capture); фолбэк = resolver-факты.

## A2 — «Спросить дальше» (bounded follow-up, F3 = ≤3)

- ⚡Клиент шлёт ТОЛЬКО `{explanation_id, question}` (question — строка, cap 500 симв., 400 сверх). Context-pack ПЕРЕСОБИРАЕТСЯ СЕРВЕРОМ по якорю объяснения тем же первым шагом ядра (личный путь — consent-recheck НА КАЖДЫЙ ход; corpus — corpus-tool). Client-supplied pack не принимается (иначе LLM-прокси на серверном ключе).
- ⚡Лимит ходов enforce-ится СЕРВЕРОМ: счётчик в body_json объяснения (или COUNT по леджеру scenario='explain_followup' + ref) → 4-й ход = `FOLLOWUP_LIMIT`.
- ⚡Инъекция: чистая функция `buildFollowupPayload(core, explanationText, question) → {system, prompt}` экспортируется и гейтится unit-ассертами напрямую (канарейка в prompt-data, НЕ в system; system байт-стабилен); mock-echo ассерт признан беззубым и не используется. Вопрос не логируется (log-hygiene).
- UX @380px: ⚡input прижат к низу карточки, scrollIntoView на focus, прокрутка к последнему ходу; при исчерпанной квоте поле деактивировано с честной строкой ДО набора; скриншот 380×844 с фокусом.
- Ходы эфемерны (класс D); телеметрия — только ledger-scenario.

## A3 — «Проверь меня по абзацу» (advisory, ПОСЛЕДНИМ)

- ⚡**Corpus-only v1** (BLOCKER: окно >1 предложения по ЛИЧНОМУ тексту ломает физический sentence_only-контракт выданного consent — agentSentenceRepo.js:14-16; расширение на личные тексты = отдельный owner-форк: новый scope `sentence_window_5` + consent-копия v2). Corpus-tool получает window-параметр (cap 5, только corpus).
- JSON-режим `llm.generate({json:true})` (Gemini responseMimeType / openrouter response_format) + ⚡mock отдаёт валидный фикстурный JSON при json:true; схема-валидация: строки с cap (question ≤200, options ≤80), ⚡options попарно различны после normalize, correct_index целое 0..3; невалид → честное «не получилось» без цикла ретраев.
- ⚡Плашка «понимание · проверка наставником, не оценка» рендерится ВМЕСТЕ с вопросом (до ответа); выбор грейдится детерминированно по correct_index; НИКОГДА не пишет review_log; рендер textContent.

## Общее (⚡обновлено)

- ⚡Телеметрия v1 = ТОЛЬКО `llm_usage_ledger`-сценарии (explain/explain_word/explain_followup/comprehension дают usage/cost/degradation). `learner_events agent_ux` ОТЛОЖЕН: клиентского эмиттера learner_events не существует вовсе, EVENT_TYPES/PAYLOAD_ALLOW закрыты — строить весь пайплайн ради UX-событий сейчас = «тихий 0»-риск без потребителя; вернёмся отдельным слайсом.
- ⚡Каждый новый POST /api/agent/* = requireCsrf + ОТДЕЛЬНЫЙ limiter explain-семьи `rlAgentExplain` 40/мин (rlAgent 20/мин делится с Mentor Home GET'ами — интерактивная сессия чтения душилась бы, прецедент rlAgentReview).
- ⚡Провайдерский потолок задокументирован: OpenRouter free = 50 req/день на аккаунт (< глобальных 200); квота видима в точке трат (usage в ответах).
- Все сценарии — reserveLlmCall; деградация честная; локали ru/en/he; SW bump; log-hygiene скоуп покрывает agent/** автоматически.
- Регрессия перед каждым push: smoke:agent-explain · smoke:agent-plan · api-smoke · smoke:reader-parity · ⚡smoke:reader-morph (A4) · новый smoke:agent-explain-corpus.
