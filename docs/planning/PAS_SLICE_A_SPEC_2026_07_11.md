# PAS слайс A — «Компаньон для любого текста» (спека-дельта)

**Дата:** 2026-07-11 · **Программа:** `PREMIUM_AGENT_SYSTEM_RECON_2026_07_11.md` §2-A · **Статус:** к adversarial-критике до кода. Порядок имплементации: **A1 → A4 → A2 → A3** (отдельные коммиты/гейты).

## A1 — Объяснение предложения из КОРПУСА

### Сервер
1. **Новый read-only tool `get_corpus_sentence_context`** (agent/tools.js, закрытый реестр):
   - args `{ corpus:'benyehuda', work_id, order_index }`; валидация: corpus — enum (v1: только benyehuda); `work_id` строго `/^\d{1,8}$/` (анти-traversal); `order_index` int 0..50000.
   - читает `DATA_DIR/benyehuda/works/<work_id>.json` (прод-том; dev-фолбэк `public/data/benyehuda/works/`); stat-гард ≤15MB (giant-работы → честный `CORPUS_WORK_TOO_LARGE`); ряд по `rows[].order_index === N` (не по позиции — паттерн `_pickSentenceRow`).
   - returns `{ anchor:{corpus, work_id, order_index}, sentence:{he, he_niqqud, ru}, work:{title, author, era, license:'public-domain'} }`.
   - **БЕЗ consent-гейта**: public-domain = общий артефакт (чартер §3); личные данные в этом tool не участвуют.
2. **Generalization explainer:** `explain(ctx, args)` — дискриминатор `args.source==='corpus'` → первая ступень ядра берёт корпус-tool вместо `get_sentence_context_if_available`; ВСЁ остальное ядро (резолвер-морфология, due/weak-пересечение, конструкции, LLM-формулировка, фолбэк) — без изменений, source-агностично.
   - `facts_used[0]`: `kind:'corpus_sentence', source:'corpus_artifact', license:'public-domain', scope_level:'sentence_only', anchor:{corpus,work_id,order_index}, text` (R9-провенанс). `runtime.listExplanations` извлекает якорное предложение и из `corpus_sentence` (история объяснений едина).
   - `create_explanation.sentence_id = 'corpus:benyehuda:'+work_id+'#'+order_index`.
   - scenario леджера остаётся `explain` (та же квота; телеметрия различает по `agent_ux.feature`).
3. **Endpoint `POST /api/agent/explain`**: ветка `body.source==='corpus'` → требует `work_id`+`order_index`, БЕЗ consent-проверок; `scope_level==='sentence_only'` обязателен как раньше. Личный путь не тронут.

### Клиент (Зал, library-ui.js)
4. `openText`: рядом с `readerIsOwnText` — новый `readerCorpusWorkId = meta.corpus && meta.corpus.byehuda_id || null`.
5. `attachExplainButtons`: убрать early-return по `readerIsOwnText`; кнопка 🤖 вешается если `readerIsOwnText || readerCorpusWorkId`; corpus-путь шлёт `{source:'corpus', work_id, order_index}` и **пропускает** situated-consent (ничего личного не читается); первый-запуск-нота: «Наставник объяснит предложение (1 вызов из дневного лимита)».
6. Модал `#roomExplainModal`: для корпуса — провенанс-строка «Источник: корпус Бен-Иегуды · public domain» (+ существующая 🤖 provider·model мета). Все новые строки — tt() + ru/en/he + SW bump.

### Гейт `smoke:agent-explain-corpus` (расширение agent-explain-smoke или отдельный)
- hermetic temp-DATA_DIR с фикстурной работой `works/77.json` (мини-бандл того же shape);
- happy-path: объяснение собирается, facts_used[0].kind==='corpus_sentence', anchor верный, morphology из резолвера;
- **teeth:** work_id='../../etc/passwd' → reject; несуществующий work → 404-класс; order_index вне диапазона → честный NOT_FOUND; НЕТ consent-строк в DB → corpus-объяснение работает, а личный путь на том же сервере по-прежнему 403 (гейты не перепутаны); LLM-off → детерминированный фолбэк с переводом/морфологией; history отдаёт corpus-якорь.

## A4 — «Объяснить это слово в этом предложении» (tap-карточка)

- Новая секция `.rm-sheet-card`: кнопка «🤖 Объяснить в контексте» (только по тапу).
- Новый scenario `explain_word`: context-pack = слово (resolver-факты: лемма/корень/биньян/глосс/ambiguous) + ОДНО предложение (источник: корпус — без consent; личный текст — существующий двойной consent через `get_sentence_context_if_available`) + learner-флаги слова (due/weak/production_gap). LLM переформулирует; R1 — морфологию не перерешивает; прозовый вывод, textContent.
- Не персистится в agent_explanations? — НЕТ, персистится тем же `create_explanation` (история едина), `body.kind='word'`.
- Гейт: word-объяснение из корпус-предложения + личного; фолбэк без LLM = resolver-факты.

## A2 — «Спросить дальше» (bounded follow-up, форк F3 = ≤3 ходов)

- В модале объяснения: поле вопроса + счётчик «осталось N из 3». Каждый ход = scenario `explain_followup`, context-pack = исходный pack + текст объяснения + ВОПРОС ПОЛЬЗОВАТЕЛЯ (класс D, не персистится; вопрос НЕ логируется — log-hygiene скоуп покрывает).
- Системный промпт: отвечать ТОЛЬКО о данном предложении/словах из pack; вне темы → вежливый отказ-в-одну-фразу; морфологию не изобретать (R1). Прозовый вывод + isCleanProse.
- Ходы эфемерны (не в agent_explanations v1); телеметрия `agent_ux {feature:'followup', action}`.
- Инъекция через вопрос: LLM-вызов не имеет tools; вывод рендерится textContent; system-промпт инструктирует игнорировать команды в вопросе. Гейт: канарейка-инъекция в вопросе не меняет системное поведение (ассерт на отсутствие маркера в ответе mock-провайдера... mock: ассерт что вопрос попадает в prompt-секцию data, не system).

## A3 — «Проверь меня по абзацу» (advisory, ПОСЛЕДНИМ)

- По явному тапу: 1–2 MC-вопроса понимания по окну ≤5 предложений (корпус или свой текст с consent).
- Требует JSON-вывода → расширение `llm.generate({json:true})` (Gemini responseMimeType; openrouter response_format) + схема-валидация `{question, options[4], correct_index}`; невалид → честное «не получилось», без ретрая в цикле.
- **Честность:** ключ ответа = утверждение LLM → плашка «понимание · проверка наставником, не оценка»; НИКОГДА не пишет review_log/память (R17); грейд выбора детерминирован по correct_index.
- Телеметрия agent_ux; scenario `comprehension`.

## Общее

- Все сценарии — через `reserveLlmCall` (квоты/kill-switch наследуются); деградация честная.
- Телеметрия: `learner_events` новый закрытый type `agent_ux`, payload `{feature, action:'offered'|'accepted'|'dismissed'|'abandoned'|'degraded', latency_ms}` — идентификаторы, ноль контента. Не гейтит.
- Локали ru/en/he для всех строк; SW bump (library-ui precached); log-hygiene скоуп уже покрывает agent/** автоматически.
- Регрессия перед каждым push: smoke:agent-explain, smoke:agent-plan, api-smoke, smoke:reader-parity (таблица читалки не тронута), + новый гейт слайса.
