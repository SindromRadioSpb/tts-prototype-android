# PAS слайс B — Агент-редактор Студии (спека-дельта, v2 после критики)

**Дата:** 2026-07-12 → **v2** (адъюдикация критики wf_7f300c39: 14 находок, 3 BLOCKER / 7 MAJOR / 4 MINOR — ВСЕ приняты; развороты помечены ⚡). **Программа:** `PREMIUM_AGENT_SYSTEM_RECON_2026_07_11.md` §2-B. **Прод на старте:** v3.11.155. Порядок имплементации: **B0+B1 → B2 → B3**, отдельные коммиты/гейты (v3.11.156/157/158).

> **СТАТУС: СЛАЙС ЗАКРЫТ, live-verified на прод-профиле 2026-07-12 (kapture).** B0+B1 v3.11.156 (6b9319b) · B2 v3.11.157 (1c6f9e9) · B3 v3.11.158 (37d1736) · полировка v3.11.159 (baed731: тумблер отзыва digest-ключа в доме наставника + digest-revoke чистит study_summary). Гейты: smoke:studio-agent NEW 133+ (42 ключа ×3 локали) · smoke:agent-material NEW 47/47 · agent-explain 43/43 (+2 row_id) · corpus 27/27 · word 15/15 · followup 18/18 · comprehension 20/20 · api-smoke · log-hygiene (+второй SERVER_REGION /api/agent/*) · reader-parity.
> **Live-verify (прод, профиль владельца):** B1 — 🤖 на 58 рядах своего текста → объяснение (openrouter, usage в мете); B2 — sheet «Материал» → situated digest-consent → grounded-резюме с реальными слабыми/просроченными словами владельца; B3 — корпус-работа 101 → «Пересказ проще» → 5 огласованных строк he+ru → [Открыть в Студии] → ПОЛНЫЙ редактор (без room-mode), драфт с провенансом (source=agent_draft, scenario=draft_retell, derived_from=benyehuda:101); оба consent-тумблера в доме наставника. Демо-драфт «Черновик 🤖 · הַשַּׁחַר…» оставлен в библиотеке владельца (удаляется одним тапом).
> ⚠ Имплементационные отклонения от v2 (записаны): (1) эмиссия .row-agent-btn ПЕРЕЕХАЛА из renderTable в post-render-инъекцию studio-agent.js (byte-parity гейт reader-core golden; паттерн studio-karaoke; room-mode скип); (2) НОВЫЙ durable consent-ключ **agent_read_texts_digest** (B2 «что выучить» = весь текст; situated-выдача в Студии, отзыв в доме наставника, отзыв чистит советы) — довести до владельца.

## Grounded-факты разведки (2026-07-12, живой код)

- Студия: `renderTable` index.html:33456; action-cell собирается в `if (k==="action")` 33594–33631; ряды несут `_v3_sentenceId/_v3_textId`; `_v3_orderIndex` УЖЕ существует в маппере `v3MapSentenceApiRowToUiRow` (20889) — но ⚡критика: КЭШИРОВАННЫЙ индекс протухает на всех трёх путях реордера (↑↓ 34359, DnD 34608, мобильные 34706) и mid-insert (34419) — реордер переписывает DB order_index (local-db.js:1006-1031), не трогая кэш ряда → якорь НЕ кэшируем (см. B1).
- **index.html НЕ грузит cloud-sync.js** — `window.CloudSync` (`CS.me()`, `syncArtifacts`) есть только в Зале (library.html:1950). cloud-sync UMD, dormant, уже в SW precache.
- `text_key` — генерируемый id (`'text-'+Date.now()`); синк `syncArtifacts` шлёт `artifact_key=t.text_key`, payload=`exportBundle` c `rows[].order_index` = DB-значение И `row_id = s.id` (local-db.js:4645-4646). ⚡`texts.updated_at` НЕ бампается при updateSentence/reorderSentences (985-994, 1006-1031) → UP-ветка синка (`cloud-sync.js:230` `srvAt >= t.updated_at → upSkipped`) НИКОГДА не ре-аплоудит правки рядов — перманентный стейл.
- Сервер: `/api/agent/explain` (personal: text_key+order_index+scope sentence_only, двойной consent fail-closed), `/api/agent/explain/followup` (≤3), rlAgentExplain 40/мин; scenario = строка; tool = запись в REGISTRY. ⚡`purgeExplanationContent` (agentRepo.js:107-125) — **exclusion-list**: тумбстоунит ВСЁ, щадит ТОЛЬКО `facts[0].kind==='corpus_sentence'`, нечитаемый facts_used пуржится (fail-closed) — новые personal-kinds покрыты BY CONSTRUCTION, предикат МЕНЯТЬ НЕЛЬЗЯ. ⚡`createExplanation` сигнатура `{sentence_id,item_key,facts_used,llm_model,body}` — `kind`/`language` живут ВНУТРИ body (b.kind — дискриминатор dedupe, agentRepo.js:143).
- ⚡Consent-копии живые: agent_read_texts обещает «выбранное предложение … или до 5 предложений — НЕ весь текст» (ru.js:2010, mentor-home.js:106-108, library.html:1892-1898). Скоупы server-enforced поимённо (sentence_only / sentence_window_5, физический cap).
- ⚡log-hygiene гейт сканирует agent/*.js, db/agent*.js автоматически, но server.js — только miniapp-регион (2049–2314); блок /api/agent/* (1801–1891) ВНЕ скана.
- Драфт-субстрата НЕТ (grep agent/** = 0). Frontier-квиз engine-ready без лаунчера (`knowledge-map-quiz.js:298`, i18n `kmquiz.*` в ×3 локалях). Autogen ②: `v3ReviewQueueOpen(textId)` — живая кнопка ТОЛЬКО на карточке библиотеки (24453), в редакторе входа нет.
- Зал↔Студия: общий OPFS; library-ui.js импортирует `* as localDb` (:12); Студия — hash-роутер `#/t/` (17302). ⚡`deepLinkForText` (library-ui.js:204-208) ЖЁСТКО ставит `?room=1` → room-mode прячет `.classic-workflow-column` (перевод-пайплайн, index.html:9713) — для драфта НЕ годится. ⚡Переход Зал→Студия без `localDb.closeLocalDB()` = задокументированный SQLITE_CANTOPEN-race (`_roomStudioNavInit` library-ui.js:2762-2780 — обёрнуты только 2 статические ссылки).
- ⚡☁-модал Зала НЕ открывается по URL (только иконка в шапке; прецедент hash-триггера — #mentor, library-ui.js:2936-2952); логин = «Секрет владельца» (owner-only).
- CSRF `localStorage['cloud.csrf']`; сессия+consents `GET /api/auth/me`; `consent_records` версионируемы (`recordConsent(key, granted, version)`, server.js:1539-1547).

---

## B0 — Вынос agent-UI Студии в `public/js/studio-agent.js` (обязательный первый шаг, чартер §7.7)

Весь agent-UI Студии — в **новом файле** `public/js/studio-agent.js` (IIFE, `window.StudioAgent`). Точечные касания index.html (исчерпывающий список):

1. `<script src="/js/cloud-sync.js"></script>` + `<script src="/js/studio-agent.js"></script>` — в блок модулей после studio-karaoke.js (12210), ДО inline-скрипта 12221.
2. `renderTable` action-cell: одна конкатенация — `<button class="row-agent-btn" data-row-idx="…">🤖</button>` при `hasLibData` (sid && tid). Логика — только в studio-agent.js (делегированный listener).
3. ⚡Обогащение `_v3_orderIndex` НЕ используется как якорь (протухает) — п.3 из v1 УДАЛЁН; вместо него live-резолв на клике (B1). `v3ClassicEnrichSavedRows` не трогаем.
4. Host-bridge (~8 строк): `window.StudioAgentHost = { getRow:(i)=>currentTableData[i], ldb: ensureLocalDB }`.
5. ⚡local-db.js: `updateSentence`/`reorderSentences`/`addSentence`(к существующему тексту)/`deleteSentence`-путь бампают `texts.updated_at` (= new Date().toISOString()) — рут-фикс перманентного стейла облачной копии (иначе state-6 «не синкано» — ложь навсегда). Гейт-ассерт: правка ряда → текст становится re-upload-кандидатом.

CSS: studio-agent.js инжектирует `<style>` при init (поздний в каскаде; `#saExplainModal button, #saMaterialModal button {width:auto}` — ловушка №1; `.sa-modal[hidden]{display:none!important}` — ловушка [hidden]).
SW: `/js/studio-agent.js` в PRECACHE_URLS + CACHE_VERSION bump. `check_script.js` не трогаем.

## B1 — Per-row 🤖 «объяснить предложение» (Студия)

**Сервер: ⚡~5 строк** — `agentSentenceRepo._pickSentenceRow` принимает опциональный `row_id`: матч по `rows[].row_id === row_id` ПРИОРИТЕТНЕЕ order_index (backward-compatible; дубли-предложения и стейл-порядок перестают мис-якориться); endpoint `/api/agent/explain` пробрасывает опциональный `sentence_row_id` (валидация: строка ≤64). `sentence_id` объяснения ОСТАЁТСЯ `text_key#order_index` (order_index берётся из СМАТЧЕННОГО ряда bundle).

**Клиент (studio-agent.js):**
- Клик по `.row-agent-btn` → ⚡якорь LIVE: `ldb.getSentences(row._v3_textId)` → ряд по `s.id===row._v3_sentenceId` → его `order_index` (кэш индекса не используется вовсе) + `sentence_row_id = row._v3_sentenceId`; `text_key` из `ldb.getTextById(tid).text_key`.
- Модал `#saExplainModal` (JS-built, один на страницу): иврит-предложение (⚡контейнер `dir="rtl" lang="he"` — паттерн Зала), тело объяснения (textContent), constructs, мета-строка (🤖 provider·model | degraded | из истории | «AI сегодня: N/limit»), follow-up ≤3 (порт Зала: cap 500, счётчик N/3, деактивация), Escape/backdrop, 30с AbortController (+abort на закрытие), in-flight guard.
- **Лестница честных состояний:**
  1. offline → «наставник доступен онлайн»;
  2. нет сессии → «войдите в облако в Зале» + ⚡ссылка `/library.html#cloud` через `window.open(...,'_blank')` (Зал получает 5-строчный hash-триггер `#cloud` → открыть облако-модал, паттерн #mentor) + кнопка «Повторить» в модале Студии;
  3. нет `cloud_texts` → «включите синк Моих текстов в ☁ Зала» + та же ссылка + «Повторить»;
  4. нет `agent_read_texts` → situated consent-панель в модале (Allow → `POST /api/auth/consent`) → авто-повтор;
  5. 404 `TEXT_NOT_IN_CLOUD` → ⚡**адресный пуш одного текста**: `ldb.exportBundle({textIds:[tid]})` + `POST /api/learner/artifacts/put {artifact_key, updated_at, payload}` (секунды, без review-log side-effects, без fullSync) → авто-повтор explain; ошибка пуша — честно;
  6. ⚡404 `SENTENCE_NOT_FOUND` → та же кнопка адресного пуша («локальная версия новее облачной — обновить копию?») — теперь ЧЕСТНО транзиентен благодаря B0.5;
  7. skeleton-сверка: `stripNiqqud(sentence.he)` vs ряд → приписка ⚡«облачная копия текста отличается — нажмите "Обновить копию"» (не «не синкана» — диагноз точный, действие рядом).
- Мобайл 380px; Playwright-скриншот до коммита. i18n `studio.agent.*` ×3 локали; в studio-agent.js свой `tt()`.

**Гейт `smoke:studio-agent`** (node, explicit exit): `node --check`; index.html содержит оба script-тега + `row-agent-btn`-эмиссию + host-bridge; sw.js precaches studio-agent.js; CACHE_VERSION==package.json; locale-parity всех `studio.agent.*`-ключей ×3; ⚡рендер-дисциплина: единственный innerHTML — статический шаблон без `${`; ⚡ассерт «updated_at бампается при updateSentence/reorder» (node-прогон local-db на sql.js или прямой grep-структурный, решить при имплементации — предпочесть исполняемый); ⚡dir="rtl" присутствует в шаблоне модала.
**Регрессия:** smoke:agent-explain · smoke:agent-followup · api-smoke (+ существующие agent-гейты не задеты — `_pickSentenceRow` покрыт agent-explain-smoke).

## B2 — «Сделай из текста материал» (Студия)

**Entry-point: ⚡редактор активного текста** (НЕ карточка — там уже 9 кнопок и «Строю знания» дублировался бы): кнопка «🤖 Материал» в тулбаре классического редактора (точный анкер — при имплементации, скриншот-верифицируется; текст должен быть library-linked, иначе честный хинт «сохраните текст»). Открывает sheet `#saMaterialModal` с тремя действиями (в редакторе НИ ОДНО не дублирует видимую кнопку):
1. **② Заметки** — `v3ReviewQueueOpen(textId)` (детерминированный, офлайн).
2. **🎯 Квиз i+1** — `KnowledgeMapQuizLoader.open({mode:'frontier', textId})`; пустой frontier → честный `kmquiz.emptyFrontier`.
3. **🤖 Что стоит выучить** — LLM-advisory (лестница B1 + шаг digest-consent ниже).

**Сервер — endpoint `POST /api/agent/study-summary`:**
- ⚡**Новый durable consent-ключ `agent_read_texts_digest`** (BLOCKER ×3 линзы: существующая копия agent_read_texts обещает «не весь текст» — переиспользование = ложь; клиентский флаг ≠ enforcement). Иерархия fail-closed В ТУЛЕ: `cloud_texts` → `agent_read_texts` → `agent_read_texts_digest`; ключ добавляется в whitelist `/api/auth/consent`; собственная честная копия («наставник сможет отправлять AI-провайдеру ВЕСЬ текст (до 40 предложений + название) по вашему запросу "что выучить"») ×3 локали; situated-панель в sheet выдаёт его (паттерн B1-шага 4). Существующая копия agent_read_texts НЕ меняется (остаётся правдой для своего ключа).
- **Новый tool `get_text_digest_if_available`** (REGISTRY, readOnly, scope-строка `text_digest_40`): тройной consent → `learnerArtifactsRepo.get` → `{title, rows_total, rows: ≤40 × {he cap 200, ru cap 200}}`.
- Learner-факты: `get_weak_words`/`get_due_words` (cap 30 суммарно). `reserveLlmCall` scenario `study_summary`; prompt advisory + R1-guard; maxOutputTokens 512.
- Персист `create_explanation`: `sentence_id = text_key+'#summary'`, ⚡`kind:'study_summary'` и `language` — ВНУТРИ body (паттерн word-explain; b.kind = дискриминатор dedupe), `facts_used[0]={kind:'user_text_digest', source:'learner_artifact', anchor:{text_key}, scope:'text_digest_40'}`.
- ⚡**Purge: `purgeExplanationContent` НЕ МЕНЯЕТСЯ** — exclusion-list уже тумбстоунит user_text_digest by construction; фиксируется только teeth-тестом.
- ⚡Same-day dedupe (`getFreshExplanation` c `{language, kind:'study_summary'}`) — вызывается СТРОГО ПОСЛЕ успешного возврата digest-tool (consent уже прошёл; иначе revoke+failed-purge отдал бы контент из истории).
- LLM-off/фейл → честная деградация: `{ok, degraded_reason, text: топ-10 due/weak + счётчик рядов}`.
- ⚡Логика — в модуле agent/ (напр. `agent/material.js`, авто-скан log-hygiene); server.js-glue тонкий; ДОПОЛНИТЕЛЬНО log-hygiene гейт получает второй SERVER_REGION по структурным маркерам блока /api/agent/*.
- Ответ: `{ok, text, llm_used, provider, model, degraded_reason?, usage, explanation_id}`.

**Гейт `smoke:agent-material`** (hermetic, mock LLM): happy-path (3 consents + artifact → text+usage+ledger scenario=study_summary); 403 РАЗДЕЛЬНО по всем трём ключам; 404 нет артефакта; rows-cap (фикстура 60 → prompt-capture ≤40); dedupe: второй вызов без reserve И b.kind==='study_summary' в строке; ⚡dedupe-после-consent: revoke digest-ключа → повторный вызов 403 (не from_history); ⚡purge-teeth fail-closed: после revoke agent_read_texts строка study_summary тумбстоун, corpus-строка цела, И строка с НЕИЗВЕСТНЫМ facts[0].kind ('future_kind') тоже тумбстоун; R1-guard в system (байт-ассерт).
**Регрессия:** smoke:agent-explain-corpus · smoke:agent-explain · api-smoke · gate:log-hygiene.

## B3 — Draft «Упрощённый пересказ» → [Открыть в Студии]

Producer в Зале (R8: тяжёлый корпусный текст → простая версия для изучения), приёмник — Студия.

**Сервер — endpoint `POST /api/agent/draft-retell`** (логика в agent/material.js):
- **Corpus-only v1**: `{work_id, text_key, order_index}`; окно `getCorpusWindow(window=5)` (public domain, без consent-классов). Личные тексты — НЕ в v1 (записанное решение владельца: window_5 только для понимания).
- `reserveLlmCall` scenario `draft_retell`; ⚡prompt требует JSON-режим `{lines:[{he, ru}]}` — **ru-глосс каждой строки В ТОМ ЖЕ вызове** (нулевая доп. стоимость; снимает тупик «пустая ru-таблица» и дубликат-ловушку перевода целиком); 3–6 строк, he ≤200 симв.; maxOutputTokens 768; mock отдаёт фикстурный JSON.
- Выход-валидация: schema (3–8 строк, he/ru строки с cap), Hebrew-ratio ≥70% по he-строкам → иначе честный `DRAFT_INVALID` (502), без ретраев.
- ⚡**Персист** `create_explanation`: `sentence_id=text_key#order_index`, body `{kind:'draft_retell', language, lines, text: he-строки через '\n'}`, `facts_used[0]={kind:'corpus_sentence', …anchor}` (corpus-derived → переживает revoke по exclusion-list — корректно) → **same-day dedupe** (`{kind:'draft_retell'}`) — повторный тап не жжёт квоту; kind-дискриминация исключает коллизию с explain того же предложения.
- Ответ: `{ok, draft:{lines[]}, anchor, provider, model, usage, from_history?}`.

**Клиент (Зал, library-ui.js):**
- В `#roomExplainModal` на корпусном тексте — кнопка «✍️ Пересказ проще» (corpus-only, тот же corpus-ack). Результат: строки he+ru (⚡каждая he-строка `dir="rtl" lang="he"`, textContent) + провенанс + **[Открыть в Студии]**.
- [Открыть в Студии]: `localDb.createText({id: uuid, text_key: 'text-'+Date.now()+'-'+rand, title: 'Черновик 🤖 · '+work.title, source_text: he-строки, source: 'agent_draft', ⚡source_meta_json: JSON.stringify({agent:{scenario:'draft_retell',provider,model,anchor}, derived_from:'benyehuda:'+work_id})})` + `addSentence` на строку **{he_plain, ru}** (⚡перевод уже есть — текст сразу рабочий) → ⚡навигация: URL **БЕЗ `?room=1`** (`'/index.html#/t/'+b64url(...)`) и **`await localDb.closeLocalDB()` перед `location.href`** (паттерн _roomStudioNavInit; same-tab — редактор Студии). Никакого авто-review/заметок (R17).
- Драфт-текст создаётся ТОЛЬКО по явному тапу; закрытие модала без тапа — драфт доступен повторно same-day из dedupe (квота не сгорает зря).

**Гейт (draft-секция smoke:agent-material):** corpus-фикстура; teeth: personal-якорь → 400; Hebrew-ratio валит латиницу-мок → DRAFT_INVALID; >8 строк → DRAFT_INVALID; ledger scenario=draft_retell; ⚡персист+dedupe (второй вызов from_history без reserve); usage; ⚡client-side ассерты в smoke:studio-agent или отдельном узле: построенный URL БЕЗ 'room=1', source_meta_json парсится и `.agent.scenario==='draft_retell'`.
**Клиент-строки Зала ×3 локали; SW bump (library-ui.js precached).**

## Общее

- Телеметрия v1 = только ledger-сценарии (`study_summary`, `draft_retell`).
- Оба новых endpoint'а — `rlAgentExplain` + requireCsrf.
- Коммиты: B0+B1 → v3.11.156 · B2 → v3.11.157 · B3 → v3.11.158; каждый: гейты → SW bump → push → deploy-poll; финальный kapture live-verify обеих поверхностей на прод-профиле.
- Регрессия перед каждым push: smoke:agent-explain · smoke:agent-explain-corpus · smoke:agent-followup · api-smoke · gate:log-hygiene · smoke:reader-parity (B3 задевает library-ui) · smoke:studio-agent · smoke:agent-material.

## Журнал адъюдикации (все 14 находок приняты)

BLOCKER digest-consent (×3 линзы) → новый ключ `agent_read_texts_digest`, server-enforced в туле · MAJOR purge-whitelist-инверсия (×3) → предикат не трогаем + fail-closed teeth ('future_kind') · MAJOR dedupe-до-consent → dedupe строго после тула + revoke-тест · MAJOR якорь-дрейф → live-резолв по sid + row_id-матч в _pickSentenceRow + SENTENCE_NOT_FOUND в лестнице · MAJOR fullSync-комбайн → адресный пуш exportBundle({textIds})+artifacts/put · MAJOR updated_at-стейл → бамп в local-db.js (B0.5) · MAJOR room=1-тупик → ссылка без room=1 + closeLocalDB · MAJOR пустая ru-таблица/дубликат → ru-глосс в том же вызове + персист/dedupe драфта · MAJOR ☁-полутупик → hash `#cloud` в Зале + new-tab + «Повторить» · MINOR log-hygiene «автоматически» → логика в agent/ + второй SERVER_REGION · MINOR source_meta_json stringify → принято + ассерт · MINOR kind в body → паттерн word-explain · MINOR RTL dir/lang → принято + ассерт · MINOR entry-point/дубль «Заметок» → sheet в редактор.
