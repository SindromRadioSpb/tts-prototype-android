# LinguistPro Agent Access — Personal Content Bridge (RECON + PROPOSAL)

Дата: 2026-07-18 · Статус: **APPROVED владельцем 2026-07-18** (решения — §0.1) · Сессия: research-only, кода нет. Адверсариальная критика проведена (§7), правки внесены; замер S0 проведён (§3.4).
Предки: `LINGUISTPRO_AGENT_ACCESS_AA3_RICH_READ_PROPOSE_HANDOFF_2026_07_18.md` (§1 «НЕ server-readable», §6 «OPFS-мост вне scope»), `AI_MENTOR_RECON_2026_07_04.md` (классы данных A–D §410–416; single-parser доктрина §15.9), `LINGUISTPRO_AGENT_ACCESS_RUNTIME_CONTROL_PLANE_2026_07_18.md`.
Роли: R15 (ведущая — классы данных/consent), R17 (grader-independence), R14 (security), R12 (структура), R13 (миграции/lossless), R16 (стоимость), R4 (UX).

Вопрос: как дать агенту (Hermes, OAuth MCP `/agent-access/mcp`) доступ к client-only данным — личным текстам, ②-заметкам, полкам — не нарушая инварианты AA (W0-запрет, R17, consent-honesty, bounded/typed/fail-closed).

---

## 0. TL;DR

**Постановка задачи устарела в свою пользу.** Разведка по коду показала: мост OPFS→сервер для личных текстов **уже существует и живой** — class-B artifact-sync под consent `cloud_texts` (`public/js/cloud-sync.js:208–265` → `learner_artifacts`, мигр. 023). Первопартийный ментор уже читает эти данные: гейт `cloud_texts`+`agent_read_texts` (`agent/memory/sourceAdapters.js:40–48`), для digest/lesson-путей — третий durable-ключ `agent_read_texts_digest` (`db/agentSentenceRepo.js:161–183`). Строить транспорт не нужно — нужно **легализовать чтение для внешнего агента**: новые MCP-scope/инструменты поверх уже-синкованных артефактов, с честной consent-картой и extraction-only выходами через уже существующий единственный blob-парсер `db/agentSentenceRepo.js`.

**Рекомендация (детали §6): вариант V4 — metadata-first + подтверждаемый per-text доступ к телу**, поверх существующего синка; standing-грант «все тексты» — опциональная ступень. V1 (живой релей через вкладку) и V3 (ZIP-снапшоты) — отклонить как основной путь. ②-заметки/полки — отдельный пакет после замера.

**Но с двумя prerequisites (BLOCKER-находки критики §7):** (P1) consent-карта `cloud_texts` сегодня недоописывает передаваемое (§2.3) — легализовать агентское чтение поверх неинформированного consent нельзя, сначала коррекция карты; (P2) right-to-delete для отдельного текста фактически сломан (§2.4 — серверного удаления артефакта нет, «удалённые» тексты остаются server-readable) — до открытия каталога агенту нужна delete-семантика или честная семантика каталога.

---

## 0.1 РЕШЕНИЕ ВЛАДЕЛЬЦА (2026-07-18) — утверждено, включая порядок

1. **P0 слим-бандл — СРОЧНО, первым пакетом** (по замеру §3.4: синк на 92% капа).
2. **P1 честность consent `cloud_texts`** — подтверждено (вместе с P0: после слим-бандла карта описывает меньше).
3. **P2 — ПОЛНЫЙ фикс** delete-семантики (серверное удаление + tombstone + каскады), не минимум-вариант.
4. **Грануляция — сразу standing `*` (S3)**: «строгий режим уже раздражает». Следствия для плана: этап per-text грантов пропускается; таблица `agent_text_grants` всё равно создаётся (строка `text_key='*'`, статус PERSISTENT с отдельной revoke-кнопкой в панели ИЛИ TTL по выбору на выдаче); kind `request_text_access` в propose_action НЕ строится в первом слайсе (опциональное будущее уточнение, если появится потребность точечно ограничивать). ⚠ R17-следствие standing-гранта: challenge-cancel (§2.2b) применяется шире — пока грант активен, открытые cloze-челленджи из ЛЮБОГО личного текста считаются скомпрометированными: гасить на выдаче гранта все открытые личнотекстовые челленджи и не выпускать новые из personal-текстов, пока грант активен (или помечать их провенансом «агент мог видеть») — деталь на адверсариальную критику S-слайса.
5. **Single-parser доктрина — PUT-time экстракция** bounded-метаданных (title ≤128 байт, rows_count) в sidecar при приёме артефакта, до агентских согласий; наружу без scope не отдаётся.

Порядок исполнения: **P0 → P1 → P2 → S1 (metadata) → S2-standing (content)**. Execution-prompt первого пакета (P0+P1+P2): `LINGUISTPRO_SYNC_SLIM_BUNDLE_P0P2_SESSION_PROMPT_2026_07_18.md`.

---

## 1. Разведка: карта реальности (measure-before-code)

### 1.1 Что где живёт

| Данные | Клиент (OPFS `app.db`) | Канал | Сервер | Server-readable сегодня? |
|---|---|---|---|---|
| Тела «Моих текстов» | `texts.source_text` (`public/db/migrations.js:15–33`) | `syncArtifacts` (consent `cloud_texts`), per-text LWW по `updated_at` | `learner_artifacts` payload_json (мигр. 023; cap 8 МБ/текст, 2000 шт.) | **ДА** (внутри blob) |
| Построчный контент (he/niqqud/translit/ru) | `sentences` (`migrations.js:34–48`) | в составе бандла | там же | **ДА** (внутри blob) |
| ②-заметки (`word_study` и др.) | `notes_v2` (`migrations.js:475–510`) | **едут в КАЖДОМ бандле** (text-независимые — всегда: `local-db.js:4794–4813`) | там же | **ДА** (внутри blob) — но НЕ нормализованы |
| srs_cards / word_status / review_log (клиентская копия) / study_day | свои таблицы | полностью в `notes_advanced` каждого бандла (`local-db.js:4894–4908`) | там же | **ДА** (внутри blob) — R17-опасно |
| Полки / закладки | `shelves`, `bookmarks` (`migrations.js:725–774`) | shelves — в бандле (`local-db.js:4774`); bookmarks — нет | частично | частично |
| review_log (канон) | `review_log` (`migrations.js:868–880`) | двусторонний sync `/api/learner/ingest` + `/log` | `review_log` (мигр. 021) + `srs_projections` (022) | ДА (уже в AA-инструментах) |

Ключевое различие: «server-readable» перестало быть бинарным. Фактические состояния: (a) нормализовано и уже в AA-инструментах (review_log/projections); (b) **на сервере в opaque-блобе** под первопартийным consent — тексты и, неожиданно, заметки+SRS-state; (c) только OPFS (bookmarks, sync_state).

### 1.2 Существующая инфраструктура (реюз)

- **Транспорт/консент:** `CloudSync.fullSync` → `syncArtifacts` (`cloud-sync.js:208–265`), гейт с двух сторон: клиент проверяет `session.consents.cloud_texts.granted`, сервер — `requireArtifactConsent` (`server.js:3297–3302`, 403). Per-item best-effort с `failed[]` (урок 2026-07-05). Corpus-работы исключены by construction (`listOwnTextsForSync`).
- **Хранилище:** `learner_artifacts` (user_id, kind='text_bundle', artifact_key=text_key, updated_at, payload_json) — R12: артефакты отделены от лога и проекций; repo-слой блобы не парсит (`db/learnerArtifactsRepo.js:3–7`).
- **Единственный blob-парсер УЖЕ существует:** `db/agentSentenceRepo.js` — назначенное владельцем (2026-07-06, single-parser доктрина, RECON §15.9) единственное место парсинга class-B блобов, с готовыми bounded-экстракторами: `getSentenceContext` (1 строка), `getSentenceWindow` (cap 5), `getTextDigest` (40 строк + title), `getLessonWindow`, defensive `ARTIFACT_UNREADABLE`. **Агентская экстракция обязана расширять ЭТОТ модуль, а не заводить второй парсер.** NB: парсит на каждый вызов, без кэша — терпимо для редких первопартийных вызовов, не для регулярных агентских (§6 S1).
- **Consent-механика:** `consent_records` append-only с версиями (мигр. 020); revoke-каскады `server.js:2003–2049` (в т.ч. гашение открытых cloze-челленджей при отзыве `cloud_texts`); ключи `cloud_texts`, `agent_read_texts`, `agent_read_texts_digest`. AA-консент отдельный: scope-гранты `agent_connection_grants` + consent-ceremony (`agent/access/consentCeremony.js`, `retention_tier: AGGREGATE|CONTENT`, fail-closed `AA_CONSENT_SCOPE_UNPRESENTED`).
- **GDPR:** структурный sweep по всем таблицам с `user_id` (`db/identityRepo.js:264–344`) — новые таблицы покрываются автоматически; deletion_journal + restore-erasure-replay. **Но:** per-text удаления артефакта нет вовсе (§2.4).
- **AA-паттерны:** closed-schemas + byte-caps (`contracts.js`), `byteSlice` (`productionHandlers.js:47–51`), typed `CLIENT_FAULT_CODES` (`service.js:15–20`), per-tool rate-limits (`mcpRateLimiter.js`), «не мутировать output-схему — только новые инструменты», W1 propose-then-confirm (мигр. 045) + handoff c work_id.
- **Пробуждение владельца:** Web Push инфра ЖИВАЯ (мигр. 024, `db/pushRepo.js`, SW `sw.js:466–488`, deep-link `/library.html`), унифицированный `nudgeCoordinator`. Фоновое чтение OPFS из SW технически не исключено (OPFS API в SW доступен, лок владельца держится только при открытой странице), но **практически нецелесообразно**: нет background-sync/periodic-sync хендлеров, iOS-краши async-VFS, хрупкость — push честно остаётся каналом «позвать владельца открыть вкладку».
- **Мультивкладка:** owner-election через Web Locks + follower-прокси BroadcastChannel (`local-db.js:46–266`).
- **Mini App (P8):** только серверные `/api/miniapp/*`, OPFS не видит — как релей-поверхность непригоден, как потребитель уже-синкованного — да.

### 1.3 Свежесть синка (фактор всех вариантов)

`roomCloudAutoSync` бежит на буте Зала + throttled-resync 90 c (`library-ui.js:2953–2981`). Студия держит cloud-sync.js **dormant** (`index.html:12231–12232`). Значит серверная реплика свежа ровно настолько, насколько недавно владелец открывал Зал с живой сессией. Любой агентский инструмент обязан отдавать оба таймстемпа — `content_updated_at` (client-claimed, уязвим к skew) и `replica_ingested_at` (server-set) — плюс константный маркер `authority: OWNER_DEVICE_CANONICAL`, и различать «пусто потому что не синкано» от «пусто реально» (feedback_silent_empty_vs_real_empty). Поля `synced_at` в схеме артефактов нет — есть `ingested_at` (`learnerArtifactsRepo.js:40–41`).

---

## 2. Следствия

### 2.1 Инвариант честности AA — уточнение формулировки

Было: «строим серверный tool только на реально server-readable данных». Уточнение по факту разведки: личные тексты **server-readable при выданном первопартийном consent `cloud_texts`** — это ровно тот случай, который AA3 §1 закладывал («только если синхронизированы под consent cloud_texts»). Инвариант не нарушается — он исполняется.

### 2.2 R17-ограничение: extraction-only + контентный канал

`payload_json` артефакта содержит `review_log` c grades, `word_status`, `srs_cards` — answer-key/grades-класс, запрещённый доктриной A×10 и consent-excludes `NO_GRADES`. Следствие-1: **ни один агентский инструмент не отдаёт сырой артефакт или notes_advanced** — только серверная экстракция bounded-полей через `agentSentenceRepo`, с output-валидатором, физически не имеющим полей grade/srs/state (паттерн get_progress_delta: excludes истинны by construction).

Следствие-2 (находка критики R17-1): excludes-by-construction закрывают утечку ПОЛЕЙ, но не контентный канал — открытые cloze-челленджи бланкуют слова из тех же личных предложений, которые отдаст `get_personal_text_content`; ru-строки окна = «ответ» reveal-карточек. Ответ пакета двухчастный: (a) сама грануляция V4 — владелец явно решает per-text, отдавать ли этот текст агенту (это и есть аргумент допуска контентного канала); (b) выдача text-гранта обязана **гасить открытые челленджи, чей стимул взят из этого текста** (механизм уже существует для revoke `cloud_texts`: `server.js:2030–2039` `cancelOpenForUser`) + честная строка об остаточном риске в карте гранта.

### 2.3 R15-находка: over-carry бандла → prerequisite P1

Каждый per-text артефакт несёт полный SRS/лог/заметки/полки (§0, `local-db.js:4894–4908`, `:4774`). Для бэкап-цели это честно (R-3.7 «bundle = полный бэкап»), но consent-карта `cloud_texts` говорит только «синхронизировать личные тексты». Критика (§7, F1) справедливо подняла это с «побочного замечания» до **BLOCKER**: нельзя легализовать агентское чтение поверх consent, который сам недоописан — второй слой не лечит неинформированный первый. **Prerequisite P1 (дёшев):** коррекция consent-copy `cloud_texts` — честное раскрытие full-state carry — ДО старта S1. Слим-бандл / отдельный `state_bundle` (структурный фикс дублирования) остаётся отдельным пакетом и S1 не блокирует.

### 2.4 R15-находка: right-to-delete сломан → prerequisite P2

Серверного пути удаления отдельного артефакта не существует: repo экспортирует только `hasConsent/list/get/put` (`learnerArtifactsRepo.js`), endpoint'а DELETE нет (`server.js:3304–3330`), tombstone-ветки в DOWN-цикле нет (`cloud-sync.js:248–262`). Следствия: (a) удалённый локально текст остаётся server-readable и **ресурректится** DOWN-циклом при следующем fullSync; (b) заархивированные тексты (`listOwnTextsForSync` фильтрует `is_archived=0`) замораживаются на сервере в стейл-версии; (c) отзыв `cloud_texts` — freeze, не delete (каскад `server.js:2033–2049` артефакты не трогает), тогда как канон для класса C требует deletion+`purged_at` (`AI_MENTOR_RECON:421–425`). Каталог `list_personal_texts` показывал бы агенту «призраки». **Prerequisite P2 (до S1):** per-text delete endpoint + tombstone против ресуррекции + каскад на `agent_text_grants`; минимально-честная альтернатива — явная семантика каталога («облачная реплика; может содержать удалённое локально») + delete-каскад грантов, но полная delete-семантика предпочтительна (заодно закрывает канон-долг класса C, см. §2.5).

### 2.5 Классы данных: постановление B vs C

Канон двусмыслен: класс B включает «созданные/обработанные тексты» (`AI_MENTOR_RECON:413`), класс C — «полные личные тексты» с гранулярными чекбоксами (`:414`); код везде маркирует store «класс B», AA3 §1 говорил «класс B», а по духу тела личных текстов = класс C. **Пакет постановляет (на утверждение владельцу): тела личных текстов = класс C; «B» в коде — дрейф ярлыка.** Три чекбокса класса C фактически уже реализованы ключами `cloud_texts` / `agent_read_texts` / `agent_read_texts_digest`. Следствие: отзыв `cloud_texts` должен получить deletion-семантику (связано с P2), и это фиксируется в consent-карте.

---

## 3. Замер (S0 — просьба к владельцу, до имплементации)

### 3.1 Снипет A — объём OPFS-профиля (консоль вкладки Зала/Студии, реальный Chrome; НЕ headless)

```js
const m = await import('/db/local-db.js');
const q = (sql) => m.dbQuery(sql, []);
const one = async (sql) => (await q(sql))[0];
const est = await navigator.storage.estimate();
console.log(JSON.stringify({
  storage_mb: +(est.usage/1048576).toFixed(1),
  texts: await one("SELECT COUNT(*) n, SUM(LENGTH(CAST(source_text AS BLOB))) body_bytes FROM texts"),
  sentences: await one("SELECT COUNT(*) n FROM sentences"),
  notes_by_type: await q("SELECT note_type, COUNT(*) n FROM notes_v2 GROUP BY note_type"),
  srs_cards: await one("SELECT COUNT(*) n FROM srs_cards"),
  word_status: await one("SELECT COUNT(*) n FROM word_status"),
  review_log: await one("SELECT COUNT(*) n FROM review_log"),
  shelves: await one("SELECT COUNT(*) n FROM shelves"),
  bookmarks: await one("SELECT COUNT(*) n FROM bookmarks"),
}, null, 2));
```

(`CAST AS BLOB` — байты, не символы: иврит/кириллица в UTF-8 ≈ ×2.)

### 3.2 Снипет B — серверная реплика (та же вкладка, залогинен)

```js
const x = await fetch('/api/learner/artifacts', {credentials:'same-origin'});
const r = await x.json().catch(()=>({}));
console.log(x.status, r.ok ? ('artifacts: ' + r.rows.length +
  ' newest_ingested: ' + r.rows.map(a=>a.ingested_at).sort().slice(-1)[0])
  : ('НЕ ok: ' + (r.error || x.status) + ' — это НЕ «0 артефактов»'));
```

(Урок silent-empty: 403 CONSENT_REQUIRED обязан печататься как отказ, не как «0».)

### 3.3 Снипет C — вес блобов на проде (ops, SSH)

```
sqlite3 /app/data/app.db "SELECT COUNT(*), ROUND(SUM(LENGTH(payload_json))/1048576.0,1) AS mb, ROUND(AVG(LENGTH(payload_json))/1024.0,0) AS avg_kb FROM learner_artifacts;"
```

Ожидание по докам: ~81 текст, ~5400 событий лога (`AI_MENTOR_RECON:1008`) — замер уточнит и покажет, насколько over-carry (§2.3) раздул средний артефакт.

### 3.4 РЕЗУЛЬТАТЫ ЗАМЕРА (проведён 2026-07-18, реальный Chrome владельца + прод-SSH)

**A — OPFS-профиль** (замер шёл через follower-прокси — вторая вкладка держала БД; мультивкладочная механика подтверждена вживую): OPFS всего **172,7 МБ**; `texts` **189** (тела ~**1,03 МБ** суммарно); `sentences` 15 058; `notes_v2`: **word_study 10 326** + free 3; `srs_cards` **0** (overlay не используется — FSRS живёт в review_log/word_status); `word_status` 5 303; `review_log` **6 192**; полки 7; закладки 4.

**B — серверная реплика:** **83 артефакта** (200 ok; из 189 локальных текстов — остальное corpus-материализации и архив, исключённые из синка by construction); свежесть: newest ingested = сегодня (2026-07-18T13:29Z), oldest 2026-07-11.

**C — прод (внутри контейнера):** `learner_artifacts`: 83 шт., **611,2 МБ суммарно**, avg **7 540 КБ**, min 6 911 КБ, max 7,66 МБ. Серверный review_log 6 179, srs_projections 260. `app.db` = **649 МБ**; каждый суточный бэкап ~628 МБ; диск прод-хоста — **83%** (6,3 ГБ свободно).

**Выводы замера (меняют приоритеты):**
1. **Over-carry подтверждён количественно и хуже, чем предполагалось:** полезный per-text контент ≈ 12 КБ, артефакт ≈ 7,5 МБ → **99,8% веса — дублируемое состояние** (полный review_log + 10,3K заметок + word_status в каждом из 83 блобов). 611 МБ из 649 МБ app.db — это он.
2. **Тикающий отказ синка:** средний бандл на **92% капа** `MAX_PAYLOAD_BYTES` 8 МБ (min уже 84%, max 96%). review_log и заметки растут ежедневно и едут в КАЖДОМ бандле → в горизонте недель ВСЕ артефакты почти одновременно упрутся в кап, и синк текстов начнёт отказывать (per-item failed[] — видно только в ☁-модале). **Слим-бандл (§2.3 структурная часть) повышается из «отдельного пакета по желанию» в СРОЧНЫЙ prerequisite — P0**, раньше любого агентского слоя.
3. **Ops-эффект:** бэкапы дублируют 611 МБ блобов ежесуточно (14-дневная ретенция ≈ 8–9 ГБ); слим-бандл срежет app.db и бэкапы примерно на порядок.
4. Хорошие новости для агентского слоя: текстов немного (83), тел — ~1 МБ; metadata-sidecar и extraction тривиальны по объёму; PUT-time парсинг блоба ~7,5 МБ — ещё один аргумент против parse-per-call и за sidecar (§6 S1).

---

## 4. Варианты

### V1 — Client-side OPFS-релей (вкладка как живой мост)

**Архитектура:** новый MCP-tool → сервер кладёт typed-запрос в очередь (`agent_content_requests`: request_id, user_id, connection_id, tool, args, status, TTL) → открытая владельческая вкладка long-poll'ит owner-endpoint (сессия+CSRF) → резолвит из OPFS по closed-allowlist запросов → POST bounded-ответа → ждущий MCP-вызов отдаёт результат или typed `AA_OWNER_DEVICE_OFFLINE` по таймауту (~10 c).

- **Wake-суб-варианты:** long-poll/SSE/WS работают только при открытой вкладке. Web Push не решает практически: SW-чтение OPFS-БД технически мыслимо (§1.2), но требует поднимать wa-sqlite в SW на push, background-sync хендлеров нет, iOS крашится — push честно деградирует в «позови владельца открыть вкладку», т.е. в асинхронный W1-подобный поток.
- **Деградации:** вкладка закрыта (типичное состояние; утренний брифинг Hermes — гарантированно мимо) → отказ; iPhone: фоновая PWA заморожена + известные async-VFS/OPFS-краши → отказ; мультивкладка: исполнять может только owner-tab (followers без БД).
- **Единственный плюс** перед синком: нет постоянной серверной копии. Обесценен фактом: копия текстов УЖЕ на сервере под `cloud_texts` (а без синка нет и continuity-фич).
- **Риски:** R14 — новая двунаправленная поверхность (очередь, поллинг, executor) — самая широкая из всех вариантов; R16 — латентность/сложность/поддержка; R11 — согласованность ответов вкладки с сервером не гарантирована.
- **Вердикт: ОТКЛОНИТЬ как основной путь.** Вернуться только если появится класс данных, который владелец принципиально откажется синкать, но захочет отдавать агенту live (противоречие почти by construction).

### V2 — Opt-in cloud-sync: легализация существующего (V2a) + расширение покрытия (V2b)

**V2a (тексты — синк уже есть):** новые read-инструменты поверх `learner_artifacts` с экстракцией **через `agentSentenceRepo`** (единственный парсер, §1.2):
- `list_personal_texts` (scope `personal.texts.metadata.read`) — text_key, title (byteSlice 128), rows_count, `content_updated_at`/`replica_ingested_at`, cursor-пагинация, byte-cap 24576;
- `get_personal_text_content` (scope `personal.texts.content.read`) — bounded-окно строк (he_plain/he_niqqud/ru; окно ≤20 строк, byte-cap 16384 — паритет с `get_reading_content`, обоснование в §6).

**Двухслойный гейт (оба fail-closed):** (1) первопартийный consent `cloud_texts` granted — иначе typed `AA_PERSONAL_TEXTS_CONSENT_REQUIRED`; (2) AA-scope в гранте подключения. Слой (1) обязателен: синк владелец мог включить «для себя» (бэкап/континуитет), это НЕ согласие на чтение агентом (иначе consent-drift, урок review.activity.read). Для ТЕЛА текста V4 добавляет третий слой — per-text грант (§V4), по силе ≥ durable-ключа `agent_read_texts_digest` ментора.

**Каталог-honesty (R15, F8):** карта scope `personal.texts.metadata.read` обязана явно называть раскрываемое множество — «названия ВСЕХ синкованных личных текстов» (у первопартийного ментора capability «перечислить все тексты» нет вовсе; названия класса C сами чувствительны). Опция data-minimization: деградированный режим «каталог без названий» (счётчики+ключи) при отказе владельца от полной карты.

**V2b (②-заметки/полки — синка нет как first-class):** нормализованный artifact kind `notes_bundle`/`shelves` или отдельные таблицы. НЕ в этом пакете: сначала замер, решение об over-carry §2.3, отдельный consent-класс (заметки — самый личный слой: свои формулировки смыслов).

- **Деградации:** честные — вкладка закрыта/офлайн/iPhone не влияют (сервер отвечает из реплики); staleness видимая (§1.3: оба таймстемпа + authority) + tri-state пустоты: CONSENT_REQUIRED / NOT_SYNCED / реально пусто. Ghost-артефакты (§2.4) закрывает P2.
- **R13 (честный risk-register вместо прежнего overclaim):** канон НЕ переезжает — OPFS остаётся истиной, сервер = LWW-реплика. НО текущий LWW несёт реальные риски: `updated_at` от клиентских часов → при skew возможна тихая потеря правки (UP отвечает `OLDER_OR_EQUAL` → клиент молча `upSkipped` → DOWN тем же циклом делает `deleteText`+import, `cloud-sync.js:231,237,254–262`); delete+import нетранзакционен (`catch(_)` — упавший import = локальная потеря); dry-run/отката у artifact-синка нет; delete-propagation нет (§2.4). Для агентского слоя это значит: реплика может и отставать, и «перегонять» устройство — honesty-поля §1.3 обязательны, а skew-guard (reject/warn при `updated_at > now()+ε`) и import-before-delete — рекомендованные фиксы синка (можно в P2-пакет).
- **R12:** артефакты отделены; extraction — read-only view поверх; **но list-инструмент без sidecar невозможен** (в `learner_artifacts` нет title/rows_count — `list()` отдаёт только key/updated_at/bytes): парсить N×8МБ блобов на каждый list — event-loop-столл (контейнер 1.5 CPU), на 2000 пользователях — секунды на вызов. Нужна PUT-time экстракция bounded-метаданных в колонки/sidecar-таблицу (derived-at-put, rebuild-able → не dual-write) + LRU-кэш parsed-блобов с ключом (user, key, updated_at) для content-пути. NB: PUT-time парсинг title происходит ДО выдачи агентских согласий — это расширение single-parser доктрины («парсинг только за double-consent»), требует явного решения владельца; альтернатива — lazy-построение индекса только при выданном agent-scope.
- **R15:** consent-ceremony: новая усиленная градация `PERSONAL` (выше CONTENT: «твои собственные тексты, их названия и содержимое»), direction: контент уходит стороннему LLM-провайдеру агента, retention-notice как у content-tier; excludes: `NO_GRADES_NO_SRS_NO_NOTES_STATE` — истинно by construction. **Механика ceremony требует правок** (F12/R15-2): fail-closed проверка tier сейчас принимает любую строку, roll-up захардкожен на `=== "CONTENT"` (`consentCeremony.js:142,152`) — нужны enum-валидация, порядок AGGREGATE<CONTENT<PERSONAL, PERSONAL-ветка downstream_retention, bump CONSENT_VERSION/RETENTION_NOTICE_VERSION.
- **R16:** стоимость ~нулевая (нет LLM, нет нового хранилища); sidecar-колонки — байты.
- **R17:** extraction-only + контентный канал (§2.2).
- **Стоимость:** низкая-средняя. Самый дешёвый путь к ценности.

### V3 — Snapshot/ZIP-мост (периодический артефакт)

Реюз ZIP-экспорта (v3.10.80–82) как периодической выгрузки на сервер; агент читает срез. **ОТКЛОНИТЬ как агентский мост:** доминируется V2a по всем осям — свежесть хуже (снапшоты vs LWW-инкремент), over-carry по построению (полный бандл), новый серверный ZIP-парсер (второй blob-парсер — против single-parser доктрины) ради худшего результата. ZIP остаётся тем, чем был: portability/бэкап. Единственный сценарий-ниша — разовая ручная передача агенту без включения синка; не строить под это инфраструктуру.

### V4 — Metadata-first + подтверждаемый per-text доступ (РЕКОМЕНДУЕМЫЙ; = V2a + грануляция W1)

Механика V2a, но **тело текста — только по per-text гранту владельца**:

1. Standing-scope `personal.texts.metadata.read` → агент видит каталог («что есть»): названия, счётчики, свежесть. Уже полезно (агент: «у тебя 3 текста без прогресса, открыть X?»).
2. Агент хочет тело → `propose_action` **новый kind `request_text_access`** `{text_key, reason?}`. **Анти-спам (R14-1):** dedupe-ключ для этого kind = (connection, kind, **text_key**) — БЕЗ free-text `reason` (иначе вариация reason обходит дедуп и deny-cooldown); deny-cooldown тоже по text_key; per-kind sub-cap (напр. 3 живых PENDING этого kind) — общий PENDING-cap 10 нельзя давать выедать запросами доступа. **Анти-оракул (R14-2):** kind требует ОБА scope — `intent.propose` + `personal.texts.metadata.read` (иначе typed not-found из propose раскрывает существование текста без metadata-scope); `display_title` резолвится из metadata-sidecar (не blob-parse на propose). Retention `reason` наследует PROPOSAL_POLICY (PENDING 7д / DENIED+EXPIRED purge 90д / CONFIRMED-скелет 365д) — цифры в consent-карте.
3. Владелец подтверждает в `/agent-access.html` → строка в новой таблице `agent_text_grants` (user_id, connection_id, text_key, granted_at, expires_at = TTL, напр. 30 дн, revoked_at NULL). Lazy-expire по паттерну proposals. user_id → авто-покрытие GDPR-sweep и `/api/account/export` (это желаемое поведение; derivable-хэшей в таблице не заводить, чтобы не попасть в strip-список `identityRepo.js:290–306`). **Каскады (поправлено по критике, FE3/F2/F4):** revoke подключения — это status-флип, не DELETE → FK-cascade не защищает; защита = (a) read-path re-assert connection ACTIVE/SCOPE_REDUCED (паттерн `agentProposalsRepo.js:132–165`), (b) явный `UPDATE agent_text_grants SET revoked_at` в revoke-каскаде подключения, (c) отзыв `cloud_texts` также обязан отзывать все гранты (иначе «воскресающий доступ» при повторном включении синка месяцы спустя); физический DELETE — GDPR-sweep. Re-connect создаёт НОВЫЙ connection_id → гранты не переживают re-авторизацию by construction (правильно; UX-следствие — повторная выдача грантов после re-auth — назвать в панели).
4. **Выдача гранта гасит открытые cloze-челленджи из этого текста** (§2.2, механизм `cancelOpenForUser`).
5. `get_personal_text_content` (scope `personal.texts.content.read`) отдаёт окна ТОЛЬКО по granted text_key; иначе typed `AA_TEXT_ACCESS_NOT_GRANTED` / `AA_TEXT_ACCESS_EXPIRED`.
6. **Опциональная ступень (решение владельца):** standing-грант «все синкованные тексты» — строка `text_key='*'` с явной отдельной consent-строкой в панели (буквально class-C чекбокс «дать агенту видеть полный текст» из `AI_MENTOR_RECON:414`, применённый к внешнему агенту). Standing-грант тоже с TTL **или** явным статусом PERSISTENT с отдельной revoke-кнопкой (бессрочный молчаливый `*` противоречит R15-тезису «карта показывает TTL»).

- **Плюсы:** R15 класс C «гранулярный opt-in» исполняется буквально; data-minimization; R17-safe (два аргумента §2.2); полный реюз живого W1-конвейера; честные typed-деградации; работает при закрытой вкладке (подтверждение асинхронно, push/бейдж «Предложения агента» уже есть).
- **Минусы:** UX-трение per-text (снимается ступенью 6 по желанию); чуть больше движущихся частей, чем голый V2a.

---

## 5. Сравнение

| Критерий | V1 релей | V2a sync-standing | V3 ZIP | V4 metadata+грант |
|---|---|---|---|---|
| Доступность (вкладка закрыта/iPhone) | ✗ отказ | ✓ | ✓ (stale) | ✓ (metadata сразу; тело после confirm) |
| Свежесть | live (когда работает) | ≤ последний визит в Зал | снапшот | = V2a |
| Data-minimization (R15) | per-request | стоящий доступ ко всем телам | полный бандл ✗ | **per-text грант ✓** |
| Постоянная серверная копия | нет (транзит) | уже есть (cloud_texts) | да + дубль | уже есть (cloud_texts) |
| Новая R14-поверхность | максимальная | минимальная | средняя (ZIP-парсер) | минимальная+1 таблица |
| Сложность/стоимость | высокая | низкая | средняя | низкая-средняя |
| R17-риск | extraction-only нужен так же | так же | выше (сырой бандл рядом) | так же + грануляция + challenge-cancel |
| Реюз живого кода | малый | максимальный | средний | максимальный (+W1 +agentSentenceRepo) |
| Мультиюзер-готовность | слабая (device-bound) | by construction | слабая | by construction |

**Замечание к альтернативе «синк только для владельца-разработчика»:** спец-режим не нужен — identity/consent/sweep уже multi-tenant по построению (user_id везде, consent per-user, изоляция B2 `server.js:2150–2158`). Рекомендуемый путь автоматически применим к любому будущему пользователю, включившему `cloud_texts` и выдавшему scope своему агенту.

---

## 6. Рекомендация: staged rollout

- **S0 — замер: ✅ ПРОВЕДЁН 2026-07-18** (результаты §3.4; consent `cloud_texts` фактически granted — 83 артефакта живые, синк свежий).
- **P0 (НОВЫЙ по итогам замера — СРОЧНЫЙ, раньше любого агентского слоя) — слим-бандл синка:** средний артефакт на 92% капа 8 МБ, 99,8% веса — дублируемое состояние; синк текстов откажет в горизонте недель без фикса. Форма: `exportBundle({slim:true})` для sync-пути (без notes_advanced-state) + отдельный одиночный `state_bundle`-артефакт для бэкап-полноты; R13-аккуратно (lossless-паритет для восстановления, dry-run на копии, откат = старый формат читается всегда). Заодно решает диск/бэкап-давление (§3.4 п.3).
- **P1 (prerequisite, блокирует S1) — честность consent `cloud_texts`:** коррекция consent-copy (раскрытие full-state carry §2.3) + постановление класса C (§2.5). Дёшево: текст карты + версия консента.
- **P2 (prerequisite, блокирует S1) — delete-семантика артефактов:** per-text DELETE endpoint + клиентский вызов при deleteText + tombstone против DOWN-ресуррекции + каскад на `agent_text_grants`; в идеале + skew-guard и import-before-delete (R13 risk-register §4 V2a). Минимум-вариант (если владелец отложит полный фикс): честная семантика каталога в consent-карте и в описании инструмента.
- **S1 — `personal.texts.metadata.read` + `list_personal_texts`.** PUT-time metadata-sidecar (title byteSlice 128, rows_count — решение владельца о расширении single-parser доктрины ИЛИ lazy-индекс при выданном scope) + LRU-кэш parsed-блобов (user, key, updated_at); consent-градация PERSONAL с правками ceremony-механики (enum tier, roll-up порядок, PERSONAL-ветка downstream, bump версий); карта называет раскрываемое множество (все названия) + опция «каталог без названий»; tri-state пустоты; поля свежести §1.3; byte-cap 24576, rate-limit 6/мин 120/день. Гейт: смоук с независимым оракулом (сверка списка с raw-SQL по learner_artifacts).
- **S2 — `request_text_access` + `agent_text_grants` + `personal.texts.content.read` + `get_personal_text_content`** (extraction через agentSentenceRepo, окно ≤20 строк, byte-cap 16384, лимит 6/мин 200/день — паритет дневного объёма с `get_reading_content` 20/400, обоснование: текст в 500 строк должен быть прочитываем за день; асимметрия per-min оставлена как data-minimization). Миграции: (a) `agent_text_grants` (новая), (b) **rebuild `agent_proposals`** — kind-CHECK не расширяется ALTER'ом; copy-rebuild с сохранением partial-unique dedupe-индекса и композитного FK (PENDING-строки живут 7 дней — не drop-empty), (c) rebuild grants-CHECK **от набора миграции 047** (уже закоммичена, 13 scope — координация с параллельной сессией разрешена). Lockstep: PROPOSAL_KINDS (`contracts.js:248`), `proposalPolicy.js`, CAPABILITIES/TOOL_LIMITS/схемы/SCOPE_PRESENTATION (key-parity гейт уже есть). Challenge-cancel на выдаче гранта. Панель: секция грантов (выдать/отозвать/TTL).
- **S3 (опция, отдельное решение владельца) — standing-грант `*`** отдельной consent-строкой, TTL или явный PERSISTENT.
- **S4 (отдельный пакет) — ②-заметки/полки + структурный фикс over-carry:** после замера; вероятная форма — слим per-text бандлы + отдельный `state_bundle`/`notes_bundle` kind с собственным consent.
- **Каждая стадия:** адверсариальная критика до кода (норма проекта) + owner live-verify через Hermes.

**Новые typed-коды (retryable:false):** `AA_PERSONAL_TEXTS_CONSENT_REQUIRED`, `AA_PERSONAL_TEXTS_NOT_SYNCED`, `AA_PERSONAL_TEXT_NOT_FOUND`, `AA_TEXT_ACCESS_NOT_GRANTED`, `AA_TEXT_ACCESS_EXPIRED`, `AA_ARTIFACT_UNREADABLE` (последний — класс «текущее состояние данных» по норме v3.11.207: не вина клиента, но не outage и не ретраится).

**Инварианты (повторить в каждом слайсе):** W0 навсегда запрещён; extraction-only через единственный парсер agentSentenceRepo (§2.2, single-parser доктрина); output-валидаторы без полей grade/srs/state by construction; не мутировать существующие output-схемы — только новые инструменты; consent-drift запрещён (первопартийные `cloud_texts`/`agent_read_texts` НЕ переиспользуются как агентские — новые scope + многослойный гейт); bounded/closed/rate-limited/fail-closed; серверной персистенции контента в AA-слое нет (audit контент-свободен by construction — allowlist `oauthAudit.js:21–22`; выходы инструментов не сохраняются) — класс D в AA-слое отсутствует, заявить это в consent-карте.

---

## 7. Адверсариальная критика (проведена, 2 независимых критика по коду)

**Критик 1 — R15/R13/R12:** 2 BLOCKER (F1 → P1: consent-copy `cloud_texts` как prerequisite; F2 → P2: right-to-delete/ghost-артефакты), 5 MAJOR (класс B/C постановление §2.5; каскад cloud_texts→гранты; PUT-time sidecar обязателен; LWW clock-skew тихая потеря — подтверждён сценарий; retention/`reason`/export-заявления), 3 MINOR (поля свежести `content_updated_at`+`replica_ingested_at`+authority; снипеты — silent-empty и байты/символы; PERSONAL-tier механика ceremony), 3 FACT-ERROR в драфте (««тройной consent» у sourceAdapters» — там два ключа; «lossless/dry-run/откат отработаны» — overclaim, заменён risk-register'ом; «FK-cascade при revoke» — revoke это status-флип). Вердикт: V4 выдерживает с правками.

**Критик 2 — R14/R17:** MAJOR: existence-оракул через propose без metadata-scope; спам PENDING-очереди и обход dedupe через free-text reason; CPU-DoS list-инструмента без sidecar (event-loop-столл на N×8МБ JSON.parse); challenge-cancel как единственный существенный R17-контент-канал (cloze-стимулы из личных предложений); PERSONAL-tier ломает roll-up ceremony молча; ghost-артефакты (независимо подтверждён F2). Плюс: указал существующий единственный blob-парсер `agentSentenceRepo` с готовыми bounded-экстракторами (драфт ошибочно представлял extraction как гринфилд), rebuild kind-CHECK `agent_proposals`, миграция 047 уже закоммичена (координация разрешена), «SW не может OPFS» смягчено до «практически нецелесообразно» (вердикт V1 не меняется). Вердикт: V4 выдерживает с правками.

Все находки интегрированы в §2–§6 (prerequisites P1/P2, анти-спам/анти-оракул в V4-шаге 2, sidecar+LRU в S1, challenge-cancel, каскады, risk-register R13, ceremony-механика, лимиты).

**Что рефьют НЕ опроверг:** сам факт over-carry (точные ссылки подтверждены); двусторонний consent-гейт; corpus-исключение; модель свежести; структурный GDPR-sweep; caps 8МБ/2000; отклонение V1/V3; extraction-only как R17-защита; выбор V4.

---

## 8. Открытые вопросы владельцу — ✅ ВСЕ ЗАКРЫТЫ решением §0.1

1. ~~Замер~~ — ✅ проведён, цифры в §3.4.
2. **P0 слим-бандл:** подтвердить срочный запуск (по замеру — синк откажет в горизонте недель; это теперь первоочередной пакет, до агентского слоя).
3. **Prerequisites:** подтвердить P1 (коррекция consent-copy `cloud_texts` + класс C §2.5) и P2 (delete-семантика артефактов: полный фикс или минимум-вариант «честный каталог»).
4. **Грануляция:** начать с per-text грантов (S2) и добавить standing `*` (S3) позже — ок? Или сразу standing?
5. **Single-parser доктрина:** разрешить PUT-time экстракцию bounded-метаданных (title/rows_count) в sidecar до агентских согласий — или lazy-индекс только при выданном scope?
6. **②-заметки:** ждать S4-пакета или включить metadata-уровень заметок раньше?
