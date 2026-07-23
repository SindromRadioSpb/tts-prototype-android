# 04 — Горизонт 2: архитектура и точные контракты (НЕ реализовывать до H1 closure + owner go)

## 0. Общие правила всех новых контрактов (наследуют живой стиль `agent/access/mcpSchemas.js`)

1. **Только новые инструменты.** Существующие input/output-схемы 16 инструментов НЕ расширяются
   (клиенты кешируют схемы с additionalProperties:false; урок v3.11.201). CAPABILITY_VERSION
   остаётся aa-v0.1 (Ф3).
2. **Схемы**: closedObject (additionalProperties:false), каждый output несёт
   `schema_version: "aa.<tool>.1.0.0"` (semver в строке; breaking → новый инструмент или 2.0.0
   под НОВЫМ именем инструмента `<tool>_v2`).
3. **Ошибки**: типизированные стабильные коды в стиле существующих (`AA_TEXT_ACCESS_NOT_GRANTED`);
   новые коды перечислены per-tool ниже + общие: `AA_SCOPE_NOT_GRANTED`, `AA_RATE_LIMITED`,
   `AA_WINDOW_CLOSED`, `AA_INVALID_INPUT`, `AA_UPSTREAM_UNAVAILABLE` (для инструментов с внешним
   бэкендом), `AA_NOT_FOUND`.
4. **Consent**: каждый инструмент = отдельная capability-запись в `capabilities.js`
   (scope, purpose, scenario_id, max_output_bytes) + per-scope церемония согласия (существующая
   механика классов A–D/PERSONAL). Granular revoke по scope обязателен.
5. **Rate limits**: по прецеденту личных текстов — read-инструменты 6/min·200/day;
   propose-инструменты 6/min·60/day (предложения дешевле генерировать, чем разгребать владельцу).
6. **Audit/provenance-поля** в каждом output: `generated_at`; для расчётных —
   версии входов (см. per-tool); для propose — `proposal_id` (аудит в существующем
   proposals-леджере `db/agentProposalsRepo.js`).
7. **Идемпотентность propose-семейства**: сервер derives ключ дедупликации из содержимого
   (как существующий propose_action — «no dedupe field, server derives idempotency»); повторный
   идентичный вызов возвращает тот же `proposal_id` со `status:"DUPLICATE"` — безопасный retry.
8. **Пагинация**: cursor-паттерн существующих инструментов (opaque cursor ≤256).
9. **Privacy**: ни один инструмент не возвращает answer-keys заданий, FSRS-параметры сырьём,
   или содержимое сверх своего scope.
10. **Миграции**: новые таблицы — `migrations/054+_*.sql`, один файл = одна транзакция, без
    явных BEGIN/COMMIT; UPSERT только `ON CONFLICT DO UPDATE SET`.

---

## 1. get_word_morphology (H2.1) — морфо-grounding агента

| | |
|---|---|
| Назначение | Агент СВЕРЯЕТ утверждения о формах, не генерирует их. LLM объясняет результат, но не создаёт морфологическую истину |
| Authoritative source | Офлайн Pealim-датасет `pealim-infl-v12` (9279 парадигм, уже shipped) + резолвер-логика `notes-autogen` (серверный запуск pure-core); Dicta НЕ вызывается на запрос (латентность/зависимость) |
| Scope / tier | `morphology.read` · STANDARD (словарные данные, не learner-данные) |

Storage note (owner-approved correction, 2026-07-23): live `agent_connection_grants.scope`
has a closed SQL CHECK, therefore H2.1 includes migration 054 widening that CHECK from 15 to 16
scopes. This is required for a real granular consent grant; reusing another scope is forbidden.

Input: `{ word: string(1..40, иврит-паттерн), context_sentence?: string(≤280) }` (required: word)
Output:
```
{ schema_version:"aa.word_morphology.1.0.0",
  resolution: "EXACT"|"AMBIGUOUS"|"UNRESOLVED",
  entries: [ { lemma, root?, pos, binyan?, mishkal?, gender?, number?, person?, tense?,
               niqqud_form?, gloss_ru?, confidence:"EXACT"|"PROBABLE"|"POSSIBLE",
               provenance:"PEALIM_OFFLINE_V12" } ] (≤5, отсортированы по confidence),
  unresolved_reason?: "NOT_IN_DICTIONARY"|"AMBIGUOUS_WITHOUT_CONTEXT"|"NON_HEBREW",
  resolver_version, dataset_version, generated_at }
```
- Гомографы → `AMBIGUOUS` + все варианты (зеркало инварианта честного резолвера Зала: «точно» только на решающих ячейках).
- `UNRESOLVED` — честный ответ; выдумывать парадигму запрещено серверно (нет LLM в этом пути вообще).
- Negative cases: пустое/не-иврит → AA_INVALID_INPUT; слово вне словаря → resolution:UNRESOLVED (НЕ ошибка).
- Acceptance: 5 тестов — точное слово; гомограф; проклитика-форма (כשתבוא); мусор; слово вне словаря. Плюс политика-тест: скилл-правило «морфо-утверждение без предшествующего вызова = нарушение» (проверяется сценарием H1.0-типа).

## 2. get_text_coverage (H2.2) — i+1 по расчёту

| | |
|---|---|
| Назначение | Детерминированное покрытие текста знанием ученика — для подбора материала 95–98% |
| Authoritative source | Серверный токенизатор + lemma-canon кейер (тот же `lemma-canon`, что и review_log) × learner-проекция (word_status/review_log sync). ⚠ Pre-check слайса: проверить, для каких текстов сервер РЕАЛЬНО имеет lemma-разметку; где нет — честный `COVERAGE_UNAVAILABLE`, никаких приблизительных процентов |
| Scope / tier | `learner.coverage.read` · PERSONAL (раскрывает состояние знания) |

**Owner-approved source invariant (2026-07-23):** Hermes and this tool support both complete
source classes: `work_id` is the full baked Project Ben-Yehuda work; `text_key` is the full synced
personal text after sync consent and the existing live connection-bound text grant.
`COVERAGE_UNAVAILABLE` is only a per-text honest result, never a blanket refusal of either class.

Storage note (owner-approved correction, 2026-07-23): live `agent_connection_grants.scope` has a
closed SQL CHECK, so migration 055 widens it from 16 to 17 scopes for the independently revocable
`learner.coverage.read` grant. No learner-state table or projection is added.

Input: `{ target: {work_id?|text_key?}, top_unknown_limit?: int(1..20) }` — ровно один идентификатор.
Output:
```
{ schema_version:"aa.text_coverage.1.0.0",
  status:"OK"|"COVERAGE_UNAVAILABLE", unavailable_reason?,
  token_total, token_known_pct, lemma_total, lemma_known_pct, content_word_known_pct,
  buckets: { known, learning, due_now, unknown, unresolved, proper_names },  // счётчики лемм
  top_unknown: [ { lemma, freq_in_text, gloss_ru? } ],
  recommendation_band: "COMFORT_95_98"|"STRETCH_90_95"|"FRUSTRATION_BELOW_90"|"TRIVIAL_ABOVE_98",
  learner_projection_version, tokenizer_version, resolver_version, generated_at }
```
- НЕ один непрозрачный процент: token- и lemma-уровни раздельно, content-words отдельно, proper names отдельно (имена не «незнание»).
- Negative: оба идентификатора/ни одного → AA_INVALID_INPUT; текст не найден → AA_NOT_FOUND; личный текст без гранта → AA_TEXT_ACCESS_NOT_GRANTED (существующий код).
- Acceptance: корпусный текст OK; личный текст с грантом; личный без гранта; текст без разметки → COVERAGE_UNAVAILABLE; проекция пуста (новый ученик) → все unknown, band FRUSTRATION.

### 2.1 Аддитивный restricted group-corpus add-on (owner-go 2026-07-23)

После закрытия серверного Group Song Corpus P0 добавляется отдельное семейство, не меняющее
контракт `get_text_coverage` и не снимающее `H2.3 DEFERRED`:

- `search_group_reading_catalog` + `get_group_reading_content` —
  `reading.group_corpus.read`, CONTENT, 6/min·200/day;
- `get_group_text_coverage` — `learner.group_coverage.read`, PERSONAL, 6/min·200/day;
- authoritative source: тот же membership-bound immutable work bundle, что Reading Room;
- ACTIVE membership проверяется на каждом вызове; недоступность сводится к `AA_NOT_FOUND`;
- content — максимум 20 строк; coverage — без тела/grades/raw FSRS, тот же deterministic resolver;
- существующие 18 input/output schemas byte-identical; новые schema versions:
  `aa.group_reading_search.1.0.0`, `aa.group_reading_content.1.0.0`,
  `aa.group_text_coverage.1.0.0`;
- migration 060 расширяет только consent-store scope CHECK 17→19;
  `CAPABILITY_VERSION` остаётся `aa-v0.1`.

Канон/skill rule/rollback/snapshot: `hermes-side/group-corpus/README.md`.

## 3. W1-семейство (H2.3): propose_import_text · propose_track_word · propose_goal · get_current_goal

Общее: хранение в существующем proposals-леджере (новые kind), owner-preview UI по существующему
паттерну propose_action (карточка подтверждения в Студии/Mini App), TTL предложений 14 дней,
статусы `PENDING → CONFIRMED|REJECTED|EXPIRED`, полный аудит. По owner correction 2026-07-23
goal-store исполняется сервером, а OPFS-local `import_text`/`track_word` исполняются только
первым браузером LinguistPro: owner confirm → одноразовый server ticket (5 минут, user/proposal/
item/action-digest binding) → существующие `createText`/`addSentence`/`setWordStatus` → receipt.
`CONFIRMED` ставится только после валидной квитанции. Закрытая вкладка/ошибка оставляет proposal
неисполненным; сервер не создаёт вторую библиотеку и не пишет параллельный `word_status`.
Агент не касается исполнения. Никаких скрытых импортов/карточек/mastery-write.

### 3.1 propose_import_text — scope `intent.import_text.propose` · PERSONAL

Input:
```
{ source: { url?: string(≤500), title: string(≤200), author?: string(≤120),
            origin:"LRCLIB"|"YOUTUBE_TRANSCRIPT"|"SEFARIA"|"AGENT_COMPOSED"|"OWNER_SUPPLIED"|"OTHER" },
  body_preview: string(≤4000, raw),           // ровно то, что будет импортировано
  language:"he", niqqud_status:"NONE"|"PARTIAL"|"FULL"|"MACHINE_ADDED",
  transformation_disclosure?: string(≤500),    // что агент менял (обрезал куплет, добавил никуд…)
  reason: string(≤280) }
```
Output: `{ schema_version:"aa.propose_import_text.1.0.0", proposal_id, status:"PENDING"|"DUPLICATE", duplicate_of_text_key?, generated_at }`
- Сервер на приёме: дедуп по нормализованному телу против существующей библиотеки (`duplicate_of_text_key`), copyright-эвристика (origin+url обязательны для внешних), санитайзинг.
- Owner-preview показывает: источник+URL, полный body_preview, niqqud_status, transformation_disclosure, вердикт дедупа. Подтверждение → ticket-bound OPFS import существующими функциями Библиотеки; последующее обогащение текста использует обычные механизмы приложения. Провенанс `imported_via_agent_proposal:<id>` хранится на тексте.
- R11: MACHINE_ADDED никуд помечается на тексте как machine-generated (derived≠asserted), никогда не перезаписывает выверенный никуд.
- Negative: body>лимита → AA_INVALID_INPUT; повтор → DUPLICATE (не новая запись); внешний origin без url → AA_INVALID_INPUT.

### 3.2 propose_track_word — scope `intent.track_word.propose` · PERSONAL

Input:
```
{ items: [ { surface: string(≤40), lemma_hint?: string(≤40),
    evidence:"USER_PRODUCED_SPEECH"|"USER_PRODUCED_TEXT"|"AGENT_SHOWN_ONLY"|"USER_ASKED_ABOUT",
    caveat?: "POSSIBLE_ASR_ERROR"|"POSSIBLE_MORPH_AMBIGUITY"|"STYLE_SUGGESTION"|null,
    context_snippet?: string(≤200), reason: string(≤200) } ] (1..10) }
```
Output: `{ schema_version:"aa.propose_track_word.1.0.0", proposal_id, status, per_item:[{surface, resolution:"RESOLVED"|"UNRESOLVED_IN_DICTIONARY"}], generated_at }`
- `evidence` обязателен и различает произведено-юзером / только-показано-агентом (провенанс-инвариант); caveat честно помечает ASR/морфо-сомнения.
- Подтверждение владельцем (по-словно, не пакетом) → ticket-bound вызов существующего browser `setWordStatus`; синхронизация идёт обычным `review_log`-контуром. Никакого FSRS-состояния от агента: слово стартует как любое вручную затреканное.
- Negative: >10 слов → AA_INVALID_INPUT; не-иврит surface → per-item UNRESOLVED (не глобальная ошибка).

### 3.3 propose_goal + get_current_goal — scopes `intent.goal.propose` / `goal.read` · STANDARD

Goal-store: новая таблица (миграция 054+) `weekly_goals(id, week_start, statement ≤280,
goal_type:"PROCESS"|"OUTCOME", anchor ≤280, source:"OWNER"|"AGENT_PROPOSED_OWNER_CONFIRMED",
proposal_id?, status:"ACTIVE"|"COMPLETED_SELF_REPORT"|"DROPPED", created_at)`. Правки/закрытие —
только владелец в UI; класс A; экспорт/удаление в общем механизме.

propose_goal Input: `{ statement: string(≤280), goal_type:"PROCESS"|"OUTCOME", anchor?: string(≤280), period_days: int(7..14), reason: string(≤200) }`
- Сервер: OUTCOME-цели принимаются, но preview помечает «цель результата — рекомендованы цели процесса» (правило 06 §3.3 держит агент, сервер не цензурирует).
get_current_goal Output: `{ schema_version:"aa.current_goal.1.0.0", goal?: { statement, goal_type, anchor?, week_start, status, source }, generated_at }`
- Агент НЕ интерпретирует ACTIVE→COMPLETED: завершение — только self-report владельца в UI.
- Negative: period вне 7..14 → AA_INVALID_INPUT; нет активной цели → `goal:null` (не ошибка).

## 4. Dicta Nakdan integration (H2.4) — серверная, не MCP-инструмент

- Назначение: автоникуд текстов в import-preview (3.1) и по запросу владельца в Библиотеке.
- Путь: серверный вызов `nakdan-5-1.loadbalancer.dicta.org.il/api` (Modern) ТОЛЬКО в момент preview/по кнопке;
  результат кешируется рядом с текстом; провенанс `niqqud_provenance:"DICTA_NAKDAN_<date>"`.
- Endpoint скорректирован владельцем 2026-07-23 после measure-before-code: прежний
  `nakdan.dicta.org.il/api` фактически возвращает HTTP 404; Nakdan 5.1 вернул HTTP 200.
- R11 (жёстко): machine-никуд НИКОГДА не перезаписывает пользовательский/выверенный; отображение —
  как derived-слой; конфликт → пользовательский побеждает.
- R16: rate ≤1 req/s, только on-demand (никаких фоновых прогонов), таймаут 10s → честный отказ
  `NAKDAN_UNAVAILABLE`, текст остаётся без никуда (валидное состояние).
- Acceptance: preview с никудом; недоступность API (импорт работает без никуда); повторный вызов
  (кеш, не второй запрос); попытка перезаписи выверенного текста (отвергнута).

## 5. ivrit.ai ASR MCP (H2.5) — Hermes-side, локальный

- Что: faster-whisper + CT2-веса `ivrit-ai/whisper-large-v3-turbo`, FastMCP-обёртка, ставится на
  хост/в контейнер рядом с Hermes. LinguistPro-кода нет.
- Инструмент `transcribe_audio`: Input `{ file_path: string (внутри voice-inbox), language:"he" }` →
  Output `{ schema_version:"asr.transcribe.1.0.0", text, segments:[{start_s,end_s,text,avg_logprob}],
  confidence_note:"ASR_HYPOTHESIS_NOT_GROUND_TRUTH", model_version, generated_at }`.
- Инвариант: выход = гипотеза; произносительный скоринг НЕ вычисляется и не имитируется
  (H3-чартер C1); низкий confidence → сегмент помечается, агент спрашивает юзера.
- Файлы: только из `G:\HERMES_AGENT\voice-inbox\` (path-валидация, никаких произвольных путей);
  после транскрипции raw audio удаляется (Д7), transcript живёт в чате (ephemeral, Д1).
- Ресурсы: CPU-инференс large-v3-turbo CT2 int8 — порядок 1–2× реального времени на 4 ядрах;
  замер — часть слайса; GPU не предполагается (fallback: модель поменьше, честная пометка).
- Acceptance: чистая запись he (транскрипт+сегменты); шумная (низкий confidence помечен); пустой
  файл → типизированная ошибка; путь вне inbox → отказ; файл удалён после обработки.

## 6. Async voice session (H2.6) — протокол, не новый код LinguistPro

Композиция: voice-inbox (workspace) → transcribe_audio (H2.5) → transcript preview юзеру
(подтверждение/правка ОБЯЗАТЕЛЬНЫ до разбора — ASR-ошибка не должна стать «ошибкой ученика») →
разговорная сессия по скиллу H1.1 → отложенный разбор → опц. propose_track_word
(caveat:"POSSIBLE_ASR_ERROR" где применимо) → ответ текстом; TTS-ответ — существующим
продуктовым TTS (ссылка-handoff), НЕ новым каналом.
- Хранение: raw audio — нет (Д7); transcript — чат; в LinguistPro не попадает ничего без W1.
- Fallback: ASR недоступен → сессия продолжается текстом (петля деградирует, не ломается).
- Cost envelope: локальный ASR = 0 маржинальных затрат; облачный STT-fallback ЗАПРЕЩЁН по
  умолчанию (включается только отдельным owner-решением с R16-конвертом).
- Acceptance (owner-live): полный цикл голосовое→разбор; сессия с 1 правкой транскрипта;
  ASR выключен → текстовая деградация.

## 7. Порядок H2 и его гейт

Рекомендованный порядок сессий: H2.1 (morphology — снимает главный риск) → H2.2 (coverage) →
H2.3 (W1-семейство + миграция goal-store) → H2.4 (Nakdan) → H2.5 (ASR) → H2.6 (voice-протокол) →
H2.7 (owner-live + closure, гейт G-H2-CLOSURE). Каждый слайс: свой Codex-промт, свои smoke-тесты
(паттерн `scripts/premium/agent-*-smoke.js`), деплой по существующему Coolify-пути с
прод-верификацией, i18n-правило (три локали + SW bump) для всех UI-строк preview-карточек.
