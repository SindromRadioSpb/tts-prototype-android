# S-пакет: Hermes → личные тексты (S1 metadata + S2-standing content) — дизайн имплементации

Дата: 2026-07-18 · Статус: **SHIPPED — S1 v3.11.216 (75e6b3f) + S2 v3.11.217 (b544c7b), 2026-07-19; критика §5 интегрирована (§6)**. Owner live-verify S1 пройден; S2 — выдать грант в панели (секция 2c) → Hermes читает окно → revoke. · Канон: `LINGUISTPRO_AGENT_ACCESS_PERSONAL_CONTENT_BRIDGE_RECON_2026_07_18.md` §0.1 (решения владельца), §6 (staged rollout), §2.2 (R17-каналы). Предшественник выполнен: sync-hardening P0+P2+P1 SHIPPED v3.11.212–215 (`LINGUISTPRO_SYNC_HARDENING_P0P2_DESIGN_2026_07_18.md`) — prerequisites P1 (честный consent v2) и P2 (delete-семантика) закрыты, слим-артефакты ~50 КБ (parse-cost умер как проблема).
Роли: R15 (ведущая), R17, R14, R12, R16, R4.

## 0. Решения владельца, зафиксированные до дизайна (§0.1 канона + сессия 2026-07-18)

1. Грануляция — **сразу standing `*`** (S3-ступень): per-text гранты и kind `request_text_access` НЕ строятся; таблица `agent_text_grants` создаётся со строкой `text_key='*'`.
2. **PUT-time экстракция** bounded-метаданных в sidecar — одобрена (расширение single-parser доктрины: парсинг title/rows_count ДО агентских согласий, наружу без scope не отдаётся).
3. R17-канал (беседа с владельцем 2026-07-18): «кто учит — не сертифицирует»; ключи ≠ история; экспозиция = «нельзя доказать, что не мог видеть» → гашение затронутых заданий при выдаче гранта.

## 1. S1 — `personal.texts.metadata.read` + `list_personal_texts`

### 1.1 Sidecar метаданных (R12: derived-at-put, rebuildable — НЕ dual-write)

- Мигр. (следующий номер): `learner_artifact_meta(user_id REFERENCES users ON DELETE CASCADE, kind, artifact_key, title, rows_count, built_at, PRIMARY KEY(user_id,kind,artifact_key))`. **Backfill существующих 83 артефактов прямо в миграции чистым SQL**: `json_extract(payload_json,'$.library.texts[0].title')` + `json_array_length(...'$.library.texts[0].rows')` (пути идентичны в slim и fat формате).
- `learnerArtifactsRepo.put()` УЖЕ парсит payload для валидации — extraction реюзает тот же разбор (нулевая доп. стоимость): title → byteSlice 128 байт, rows_count. Upsert меты в той же операции.
- Каскады: `deleteArtifact`/`purgeAllForUser` удаляют мету; user_id → авто-покрытие GDPR-sweep. Rebuild-путь (R12-инвариант derived): одноразовый пересчёт из payload_json воспроизводит мету — оракул-смоук сверяет.
- LRU-кэш parsed-блобов из recon-§6 S1 **НЕ строим**: посылка (7,5 МБ блобы) умерла с P0 — слим ~50 КБ, parse-per-call дешевле кэш-инвалидации (R16-замер в смоуке).

### 1.2 Инструмент `list_personal_texts`

- **Двухслойный гейт (оба fail-closed)**: (1) первопартийный `cloud_texts` granted И version v2 (`hasConsentVersioned` — та же функция истины, что у sync-поверхности; согласие на СБОР не подменяет согласие на ЧТЕНИЕ агентом — слой (2)); (2) AA-scope `personal.texts.metadata.read` в гранте подключения.
- Ответ: items `{text_key, title, rows_count, content_updated_at (client-claimed updated_at), replica_ingested_at (server-set), is_deleted_tombstone? нет — tombstoned отсутствуют в списке}` + `authority: "OWNER_DEVICE_CANONICAL"` (константа: сервер = LWW-реплика, истина на устройстве) + cursor-пагинация (паттерн AA3-3a) + byte-cap 24576.
- Tri-state пустоты: нет consent → `AA_PERSONAL_TEXTS_CONSENT_REQUIRED`; consent есть, 0 артефактов → `AA_PERSONAL_TEXTS_NOT_SYNCED` (класс «состояние данных», retryable:false); ≥1 → нормальный список (может быть меньше локального — это заявлено в описании инструмента).
- Rate-limit: 6/мин, 120/день (recon §6).
- Consent-карта scope (PERSONAL-tier): явно называет раскрываемое множество — «названия ВСЕХ синкованных личных текстов + размер + свежесть»; направление «уходит стороннему LLM-провайдеру агента»; excludes `NO_GRADES_NO_SRS_NO_NOTES` истинны by construction (в sidecar этих полей нет физически).

### 1.3 Consent ceremony: градация PERSONAL (правки механики из recon F12/R15-2)

- enum-валидация `retention_tier` (сейчас принимает любую строку), порядок AGGREGATE < CONTENT < PERSONAL, PERSONAL-ветка downstream_retention, bump CONSENT_VERSION/RETENTION_NOTICE_VERSION. Точные строки — по карте разведки (consentCeremony.js:~142,152).

## 2. S2 — `agent_text_grants` (`*`) + `personal.texts.content.read` + `get_personal_text_content`

### 2.1 Таблица грантов (мигр. следующая)

`agent_text_grants(id TEXT PK, user_id REFERENCES users ON DELETE CASCADE, connection_id, text_key ('*'), granted_at, expires_at NULL=PERSISTENT, revoked_at NULL)`. Derivable-хэши НЕ заводить (strip-список identityRepo). Выдача — ИЗ ПАНЕЛИ agent-access.html (session+CSRF POST; выбор при выдаче: PERSISTENT с revoke-кнопкой ИЛИ TTL 30/90 дн — §0.1-4), НЕ через propose_action.

### 2.2 Гейт чтения тела (трёхслойный, fail-closed)

(1) `cloud_texts` v2 → `AA_PERSONAL_TEXTS_CONSENT_REQUIRED`; (2) AA-scope `personal.texts.content.read`; (3) живой грант: строка `text_key='*'`, `revoked_at IS NULL`, `expires_at` не истёк (lazy-expire по паттерну proposals), И **re-assert подключения ACTIVE/SCOPE_REDUCED на каждый вызов** (revoke подключения = status-флип, FK не спасает — паттерн agentProposalsRepo) → иначе `AA_TEXT_ACCESS_NOT_GRANTED` / `AA_TEXT_ACCESS_EXPIRED`.

### 2.3 Инструмент `get_personal_text_content`

- Экстракция ТОЛЬКО через `db/agentSentenceRepo` (single-parser доктрина): новый bounded-экстрактор окна: `{text_key, from_order_index?, limit ≤20}` → строки `{order_index, he, ru}` + title + `has_more` + поля свежести §1.2 + `AA_ARTIFACT_UNREADABLE` на битом блобе (класс «состояние данных»). Byte-cap 16384; rate-limit 6/мин 200/день (паритет дневного объёма с get_reading_content: текст в 500 строк прочитываем за день; per-min асимметрия = data-minimization).
- Output-схема БЕЗ полей grade/srs/state by construction; сырой артефакт/notes_advanced НЕ отдаются никогда.
- Не мутируем существующие схемы — только новые инструменты (инвариант AA).

### 2.4 R17: гашение и подавление личнотекстовых челленджей (§2.2 канона + беседа с владельцем)

- **На выдаче гранта**: гасятся открытые challenge'и, чей стимул из личных текстов (механизм cancelOpenForUser / его personal-scoped вариант — уточнить по коду: если существующий гасит ВСЕ, включая корпусные, — сузить или принять с оговоркой в карте, на критику).
- **Пока грант активен**: селектор challenge'ей НЕ выпускает новые из личных текстов (честный фолбэк на reverse/dictate уже существует — telegram-cloze смоук) — сертификационная чистота: «агент мог видеть» недоказуемо-отрицаемо.
- Альтернатива «двухрежимность» (практика с провенансом agent_exposed vs сертификация) — НЕ в этом слайсе: это D1/grading-pipeline фича, отдельное решение владельца; дверь оставлена (провенанс-поле можно добавить позже без ломки).
- Честная строка об остаточном риске в consent-карте гранта: «пока доступ активен, проверки по вашим текстам не выпускаются; открытые — отменены».

### 2.5 Каскады отзыва (из V4-шага 3 канона, поправки критики FE3/F2/F4)

- Revoke ПОДКЛЮЧЕНИЯ (status-флип) → явный `UPDATE agent_text_grants SET revoked_at` в каскаде.
- Отзыв `cloud_texts` → отзыв всех грантов (добавить в существующий P2-каскад purge в /api/auth/consent — «воскресающий доступ» при повторном включении синка месяцы спустя запрещён).
- Re-connect = новый connection_id → гранты не переживают re-авторизацию by construction; в панели это названо словами.
- Физический DELETE строк — GDPR-sweep (авто по user_id).

### 2.6 Scope-механика

Новые scope в CHECK-констрейнт грантов подключений — по паттерну прошлых rebuild-миграций (точный номер/паттерн — по карте разведки). Lockstep: CAPABILITIES / TOOL_LIMITS / схемы / SCOPE_PRESENTATION (+ key-parity гейт). Consent-ceremony предъявляет новые scope (fail-closed AA_CONSENT_SCOPE_UNPRESENTED).

## 3. Гейты

- Новый `smoke:agent-personal-texts`: оракул-паритет list vs raw-SQL по learner_artifacts+meta (независимый оракул); sidecar-rebuild == PUT-time мета; двухслойный/трёхслойный гейты (typed-коды на каждом слое); tri-state пустоты; окно ≤20/byte-cap; грант: выдача→чтение→revoke подключения→NOT_GRANTED; cloud_texts revoke → грант отозван + purge; challenge-cancel на выдаче + не-выпуск новых личнотекстовых; expires TTL; пагинация; NO_GRADES by construction (grep-ассерт полей в ответах).
- Существующие: agent-access-* смоуки, api-smoke, sync-slim (sidecar не должен сломать put-путь).
- Прод-верифи: owner live-verify через Hermes (list + чтение окна) — как норма каждой стадии.

## 3.5 Lockstep-карта имплементации (по разведке 2026-07-18)

Файлы (все 13 — иначе key-parity смоук/UNKNOWN_TOOL): `agent/access/contracts.js` (SCOPES +2, input/output-валидаторы + регистрация; кап scopes=16 → после +2 будет 15/16 — влезает, отметить), `agent/access/oauthContracts.js` (SCOPES +2), `agent/access/capabilities.js` (+2 CAPABILITIES с уникальными scenario_id и max_output_bytes), `agent/access/mcpSchemas.js` (+2 INPUT/OUTPUT_SCHEMAS + DESCRIPTIONS), `agent/access/mcpRateLimiter.js` (+2 TOOL_LIMITS: list {6,120}, content {6,200} — числа канона §6), `agent/access/consentCeremony.js` (+2 SCOPE_PRESENTATION, PERSONAL-tier §1.3), `agent/access/productionHandlers.js` (+2 хендлера; личный repo — ТОЛЬКО инжект в фабрику, гард :70-79; W0-fence запрещает raw sqlite/fetch в хендлерах), `agent/access/service.js` (+CLIENT_FAULT_CODES: AA_PERSONAL_TEXTS_CONSENT_REQUIRED, AA_PERSONAL_TEXTS_NOT_SYNCED, AA_PERSONAL_TEXT_NOT_FOUND, AA_TEXT_ACCESS_NOT_GRANTED, AA_TEXT_ACCESS_EXPIRED, AA_ARTIFACT_UNREADABLE), `agent/controlPlane/scenarioRegistry.js` (+2 сценария: role agent_access.reader, surfaces ["external_agent"], capabilities repo:personal_texts_{metadata,content}_read — /_read$/-конвенция), миграция 049 (rebuild agent_connection_grants CHECK 13→15 по паттерну 044/046/047; S2-грант-таблица — миграция 050), `public/js/agent-access.js` (+2 SCOPE_NAMES ru/en/he; рендер только textContent — смоук запрещает innerHTML), `db/agentSentenceRepo.js` (+2 новых bounded-экстрактора), `scripts/premium/agent-access-domain-smoke.js` (+validArgs/fixtures).

Уточнённые решения по фактам разведки:
- **JSON-путь метаданных**: `$.texts[0].title` / `json_array_length($.texts[0].rows)` — первичный путь парсера agentSentenceRepo (`payload.texts[]`, НЕ `library.texts`); слим и fat несут оба зеркала.
- **Первопартийные ключи ментора НЕ переиспользуются** (анти-consent-drift): новые экстракторы в agentSentenceRepo гейтятся на `cloud_texts` **v2** (`hasConsentVersioned` — та же истина, что sync-поверхность; агентское чтение поверх v1-карты запрещено) и НЕ требуют `agent_read_texts*` — это ключи ПЕРВОПАРТИЙНОГО ментора с их собственной ceremony; у Hermes своё согласие = AA-scope ceremony + text-грант. Существующие тройные гейты ментора не трогаются.
- **retention_tier=PERSONAL для ОБОИХ scope** (названия класс-C текстов сами чувствительны — recon F8); roll-up-порядок AGGREGATE<CONTENT<PERSONAL; PERSONAL-ветка downstream_retention. Бамп CONSENT_VERSION/RETENTION_NOTICE_VERSION — проверить equality-гейт ceremony:103–105: если бамп рвёт существующее подключение Hermes на КАЖДОМ вызове — это принудительная re-ceremony (честно, новые scope всё равно требуют её), но нельзя молча сломать старые инструменты — деталь на критику.
- **Sidecar-таблица нужна** (разведка: меты нет; title живёт в payload; list из 83 блобов парсить per-call — против R16/R12) — §1.1 остаётся.
- Кап scope-claim в mcpResourceValidator (≤16) выдерживает 15 — проверено.

## 5. Адверсариальная критика (2 независимых критика, 2026-07-18) — интегрирована

**Критик R12/R13/R11/R16:** BLOCKER — SQL-backfill без `json_valid` заклинит миграционную цепочку (malformed JSON в SQLite = ERROR, не NULL; проверено на прод-SQLite 3.44.2). MAJOR: char-based усечение title (byte-slice ≠ SQL substr на иврите); НЕ транзакция, а artifact-first + best-effort мета + reconcile в opsSweepTick (`meta IS NULL OR built_at < ingested_at`) — «следующий put лечит» ложен (OLDER_OR_EQUAL не доходит до меты); композитный FK меты ON DELETE CASCADE (каскады by construction, ручных писателей нет); TEXT_KEY_RE — корпусный hex, личные ключи `text-<ts>-<rand>` им непроходимы → свой паттерн `^[A-Za-z0-9._:-]{1,200}$`; подавление челленджей — в agentClozeRepo (обе дороги: auto reviewSession + manual selectForModality + telegram) + sweep по `stimulus_source='synced-sentence'`; roll-up PERSONAL в ceremony:146–152 обязателен (иначе топ-левел карты ЗАНИЖАЕТ); title nullable в output-схеме; оракул = test-side JSON.parse (не репо); новые экстракторы БЕЗ `||texts[0]`-фолбэка (strict-match, иначе чужой title под произвольным ключом); lazy-expire грантов = read-предикат (без UPDATE); state_bundle недостижим при kind-фильтре.

**Критик R14/R15/R17:** MAJOR — (1) карта гранта не должна overclaim'ить «проверки не выпускаются»: Room-reveal-петля (самооценочные грейды в Зале) продолжает работать и не гасится — формулировка «серверные challenge-проверки по вашим текстам не выпускаются; повторение в Зале продолжает работать (самооценочное)»; (2) re-auth Hermes оставляет ЗОМБИ-подключение (activate не suspend'ит прежние ACTIVE того же (client,user), refresh-токены живы) → авто-supersede при активации; (3) CAPABILITY_VERSION НЕ бампится (пин-литерал в mcpResourceValidator:56 и mcpSchemas:107 — наивный бамп кладёт либо новые подключения, либо Hermes; AA3/AA4 добавляли 9 инструментов без бампа) — литерал заменить импортом константы; (4) sidecar-upsert ТОЛЬКО после stored:true, best-effort, kind='text_bundle' (иначе мета отвергнутого payload'а); (5) карта `*`-гранта обязана называть «все нынешние И БУДУЩИЕ тексты, пока грант активен» + TTL как рекомендованный дефолт. MINOR: код AA_PERSONAL_TEXTS_RECONSENT_REQUIRED отдельно от CONSENT_REQUIRED (различие «включи синк» vs «подтверди карту»); content-карта признаёт «включая названия» (title в окне при `*`); manual-cloze при подавлении — типизированный `none:'agent_grant_active'`, не голый null; порядок INSERT-грант → cancelOpenForUser (TOCTOU); per-row byte-slice + адаптивное сужение окна (иначе гигант-строка делает окно перманентно нечитаемым); backfill = разовый эквивалент PUT-time экстракции (покрыт §0.1-5, названо явно); панельный downstream_retention_notice — из max-tier грантов подключения.

**Подтверждено обоими:** бамп CONSENT/RETENTION-версий НЕ рвёт живое подключение Hermes (equality — только approve-time); миграция CHECK-rebuild безопасна для 13 живых грантов; scope-кап 15/16 влезает; NO_GRADES физически в sidecar; DoS-профиль тривиален post-P0.

## 6. Ревизированный порядок имплементации

**S1 (commit 1):** мигр. 049 — rebuild CHECK grants 13→15 (ОБА scope сразу — одна re-auth Hermes; сверка PRAGMA table_info); мигр. 050 — learner_artifact_meta (композитный FK CASCADE) + SQL-backfill ПОСЛЕДНИМ стейтментом (`json_valid`-guard + kind-фильтр + NULL-терпимость + char-substr); repo: put→stored:true→best-effort мета (char-slice 128), listWithMeta, reconcile в opsSweepTick; contracts/oauthContracts SCOPES +2, personal-key паттерн, list-валидаторы (title nullable); capability/schema/limits {6,120}/scenario — только list-инструмент; ceremony: enum tier + PERSONAL roll-up + обе SCOPE_PRESENTATION (PERSONAL; content-карта «включая названия», metadata-карта «названия ВСЕХ синкованных»; бамп CONSENT_VERSION+RETENTION_NOTICE_VERSION); CAPABILITY_VERSION не трогается + литерал→константа; supersede-on-activate; CLIENT_FAULT_CODES (все новые, вкл. RECONSENT_REQUIRED); панель SCOPE_NAMES ru/en/he; смоук agent-personal-texts (S1-сцены) + domain-smoke parity + регресс sync-slim/agent-access.
**S2 (commit 2):** мигр. 051 agent_text_grants; grant-эндпоинты панели (issue TTL 30/90/PERSISTENT + revoke; карта: будущие тексты, Room-петля, challenge-подавление); get_personal_text_content (aa-экстрактор в agentSentenceRepo: strict-match, per-row slice, адаптивное окно ≤20, cap 16384, {6,200}); трёхслойный гейт + re-assert; каскады (connection revoke → UPDATE grants; cloud_texts revoke → revoke grants на server.js:2063-TODO); подавление в agentClozeRepo (typed none:'agent_grant_active') + порядок INSERT→cancel; смоук S2-сцены; owner live-verify через Hermes (re-auth с supersede → list → грант → окно).

## 4. Инварианты (повтор из канона §6)

W0 запрещён навсегда; extraction-only через agentSentenceRepo; выходы без grade/srs/state; consent-drift запрещён (первопартийные ключи НЕ переиспользуются как агентские — новые scope + многослойный гейт); bounded/closed/rate-limited/fail-closed; серверной персистенции контента в AA-слое нет (audit контент-свободен by construction); не трогаем ZIP/Anki/review_log-синк.
