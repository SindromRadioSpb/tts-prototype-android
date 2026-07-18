# Sync-hardening P0+P1+P2 — дизайн имплементации (слим-бандл · consent-честность · delete-семантика)

Дата: 2026-07-18 · Статус: **КРИТИКА ПРОВЕДЕНА (2 независимых критика, §5) → дизайн РЕВИЗИРОВАН (§6) → импл.** · Канон-предок: `LINGUISTPRO_AGENT_ACCESS_PERSONAL_CONTENT_BRIDGE_RECON_2026_07_18.md` (§0.1 решение владельца, §3.4 замер).
Роли: R13 (ведущая), R15, R12, R11, R16.
⚠ Читать §1–§3 ВМЕСТЕ с §6 — ревизия §6 переопределяет узлы, сбитые критикой.

## 0. Факты разведки, уточняющие session-prompt

1. **Мигр. 023 НЕ содержит CHECK на `kind`** (`kind TEXT NOT NULL DEFAULT 'text_bundle'`, без CHECK — проверено по файлу). Новый `kind='state_bundle'` не требует миграции схемы `learner_artifacts`. Ограничение `kind` захардкожено только в repo-слое (`db/learnerArtifactsRepo.js` KIND-константа во всех SQL) и это как раз то, что расширяем.
2. **`word_study`-заметки (10 326 шт.) — text-НЕЗАВИСИМЫЕ** (канонические, `text_id IS NULL`, позиционируются через `note_occurrences`). Значит slim per-text бандл почти пуст от notes_v2 (text-bound = inline free/text-заметки), а весь вес заметок уходит в state_bundle (~5 МБ сегодня).
3. Пользовательские удаления текстов живут ТОЛЬКО в Студии (`index.html` ~24917 single, ~27926 bulk); Зал свои тексты не удаляет. `[wipe]`-флоу (28019) — локальный сброс устройства, облачную копию трогать НЕ должен (иначе wipe уничтожает бэкап в момент, когда он нужен).
4. `/api/auth/me` уже отдаёт `consents.current[key] = {granted, version, at}` — версия консента доступна клиенту без новых эндпоинтов.
5. DOWN-цикл сегодня на каждом fullSync ЗАГРУЖАЕТ полный 7,5 МБ артефакт каждого архивного текста (архивный отсутствует в `listOwnTextsForSync` → `loc` undefined → GET + importBundle-skip). Фикс архивных в P2 заодно убирает эту утечку трафика.

## 1. P0 — слим-бандл sync-пути

### 1.1 Разделение данных (complement by construction)

Правило: `TEXT_BOUND = target_kind ∈ {sentence,word,text} AND text_id IS NOT NULL` (тот же предикат, что в `_buildAdvancedNotesPayload._filterByText`).

**Slim per-text артефакт** (`exportBundle({textIds, slim:true})`, kind='text_bundle', key=text_key — формат НЕ меняется, только состав):
- текст + rows (+inline row.note) + progress + user-settings (как сейчас);
- notes_advanced СЛИМ: `notes` = только TEXT_BOUND этого текста; `versions`/`links` этих заметок; `sentence_morph` этого текста (уже скоуплен); `occurrences` НА этом тексте — для заметок бандла по note_id, для внешних канонических заметок по НОВОМУ полю `note_dedup_key` (JOIN gen_dedup_key; занимает ~10 КБ, нужен для LWW-replace-устойчивости §1.4);
- `roots` = только чьи my_note_id в notes бандла; `shelves: []`;
- НЕ несёт: text-независимые заметки, srs_cards/srs_review_events/srs_attempts/srs_card_exports, anki_word_exports, events, translation_overrides, review_log, word_status, study_day, полки.

**state_bundle** (новая пара `exportStateBundle()`/`importStateBundle()`, kind='state_bundle', artifact_key='__state__', один на пользователя):
- `notes` = все text-НЕзависимые notes_v2 (дополнение TEXT_BOUND — вместе покрытие полное by construction) + их `versions`/`links`;
- `occurrences` этих заметок со **портируемыми якорями**: `{note_id, text_key, order_index, word_offset, surface}` (JOIN sentences/texts; sentence-id устройства не переносим);
- `roots` (user-customized, my_note_id в notes state), `shelves` (полные, как сейчас), `translation_overrides`, `anki_word_exports`;
- НЕ несёт: review_log/word_status/study_day (канонический двусторонний синк `/api/learner/ingest` — дублировать = R12 dual-write), srs_cards*/events (мёртвый overlay: srs_cards=0 на профиле владельца, FSRS живёт в review_log; events — девайс-локальная аналитика). ZIP-экспорт (без slim) продолжает нести ВСЁ — full-backup канал не деградирует.
- Обёртка: `{format:'linguistpro-state-v1', schema_version:1, state:{...}}` БЕЗ top-level `texts`/`shelves`/`notes_advanced` ключей → старый SW-кэшированный клиент, случайно скачавший state-артефакт, получает чистый no-op в importBundle (texts=[]).
- LWW `updated_at` = max(updated_at всех компонентов) — вычисляется в exportStateBundle.

### 1.2 Сервер

- `learnerArtifactsRepo`: `KINDS = {text_bundle, state_bundle}`; `list(userId, kind='text_bundle')`, `get(userId, key, kind)`, `put(..., kind)` с валидацией kind. **Back-compat:** `/api/learner/artifacts` без `?kind=` отдаёт ровно старый ответ (text_bundle) — старые клиенты не видят state-артефакт вовсе; новые передают `kind=state_bundle` явно.
- Кап по kind: text_bundle 8 МБ (как был), state_bundle 24 МБ + per-route bodyParser 32mb на `/api/learner/artifacts/put` (глобальный 10mb не менять). Предупреждение в ответе put при >75% капа (`warn:'NEAR_CAP'`) — клиент показывает в ☁-модале (тикающий отказ не должен повториться молча).
- `put(..., {replace_equal:true})`: принимает замену при `updated_at == existing` (СТРОГО равный; новее-существующий всё так же отвергается). Нужен для одноразовой миграции формата (см. 1.5) и merge-back state (1.4). LWW-безопасно: равный timestamp = тот же контентный момент, меняется только формат/полнота.
- Skew-guard (из risk-register §4): put отвергает `updated_at > server_now + 1h` typed-ошибкой `FUTURE_UPDATED_AT` → падает в failed[] клиента (видимо, не молча).

### 1.3 Клиент: syncArtifacts (cloud-sync.js)

Порядок цикла: (a) undelete-queue → (b) delete-queue [P2] → (c) GET list (+tombstones [P2], +state meta) → (d) применение tombstones [P2] → (e) UP текстов (slim) → (f) UP state (LWW по max-updated_at; `replace_equal` при merge-back) → (g) DOWN текстов (LWW-replace через importBundle mode:'replace' [P2]) → (h) DOWN state: если server-state новее ЛИБО были LWW-replace текстов (`updated>0`) — importStateBundle (merge идемпотентен); после merge — re-export, и если контент отличается от серверного (сравнение по каноническому хэшу полезной нагрузки) — PUT c updated_at=max(local,server)+replace_equal (сходимость двухдевайсного union).
- Slim-выключатель: `sync_state['sync_slim_disabled']='1'` → старое поведение (полный exportBundle, без state) — откат без редеплоя.
- Один негабарит/провал — как раньше per-item best-effort в failed[].

### 1.4 Восстановление и краевые сценарии

- **Fresh device DOWN:** тексты (slim) → канонические occurrences по dedup_key пока дропаются (заметок ещё нет) → затем state (заметки + ВСЕ их occurrences по text_key/order_index) → позиции восстановлены. Итоговое множество = полному.
- **LWW-replace текста** (delete+reimport): CASCADE сносит occurrences канонических заметок на нём; slim-бандл сам несёт свои occurrences (note_dedup_key-резолв через findNoteByDedupKey) → восстановлены в том же импорте; плюс state re-apply (правило (h)).
- **Occurrences на corpus/архивных текстах**: state несёт их с text_key-якорями; резолв если работа материализована локально, иначе счётный drop (сегодня они дропаются ВСЕГДА — строго не хуже).
- **Известные bounded-отклонения от сегодняшнего поведения** (в оракул-смоуке проверяются счётно): note-links через границу множеств (text-bound ↔ independent) резолвятся через to_dedup_key-фолбэк для канонических целей; ссылка на text-bound заметку из другого артефакта не резолвится (сегодня резолвилась, т.к. все заметки ехали в каждом бандле) — таблица links на профиле владельца ~пуста, замерить в dry-run.
- Удалённая заметка может воскреснуть из state-merge другого устройства — ЭТО ПОВЕДЕНИЕ СЕГОДНЯШНЕГО СИНКА (заметки едут в каждом бандле и re-insert'ятся), не регресс; первоклассный notes-синк с tombstone'ами = S4-пакет.

### 1.5 Одноразовая миграция серверного состояния

Первый slim-синк (флаг `sync_state['slim_migrated']` пуст): UP-цикл шлёт `replace_equal:true` → равные updated_at перезаписываются слимами; после полного прохода без failed — флаг ставится, дальше обычный LWW. DOWN в этом цикле не срабатывает (клиент ≥ сервера по updated_at). Старый клиент, всплывший ПОСЛЕ миграции со СВЕЖЕЙ правкой текста, зальёт fat-бандл этого текста (LWW-честно); он останется fat до следующей правки на новом клиенте — bounded, самоизлечивается. Ops-хвост: после re-sync владельца — `VACUUM` на проде (611 МБ не вернутся ОС без него) + `df -h` (снипет C канона: до/после).

### 1.6 Гейты P0

`smoke:sync-slim` (Playwright-паттерн artifact-sync-smoke):
1. **Оракул-паритет restore** (независимый оракул, не повторный вызов билдера): профиль-фикстура (тексты + канонические word-заметки с occurrences + text-bound заметки + полки + overrides + anki_word_exports) → путь A: full-бандлы (старый формат) → чистая БД; путь B: slim-артефакты + state_bundle → чистая БД; сравнение канонических множеств RAW-SQL-запросами по обеим БД (text_key/rows, note dedup-key+body, occurrences (text_key,order_index,offset), shelves slug+items, overrides, anki-links). Известные отклонения §1.4 — только счётно-ожидаемые.
2. Размер: slim per-text < 200 КБ на фикстуре §3.4-масштаба; state < капа.
3. Откат: старый full-бандл импортируется новым клиентом; slim-выключатель возвращает старый состав PUT.
4. Миграция: fat-артефакт на сервере + равный updated_at → первый slim-синк заменяет слимом (replace_equal), повторный — обычный skip.
Плюс существующие: `smoke:artifact-sync`, `test:api-smoke`, cloud-sync смоуки.

## 2. P1 — честность consent `cloud_texts` (+класс C)

- **Версия v2** (константа `CloudSync.CLOUD_TEXTS_CONSENT_VERSION='v2'` — единственный источник, library-ui читает её же; урок config-string-match-by-construction).
- **Сервер fail-closed:** `hasConsent` для cloud_texts требует granted И version ≥ 'v2' → старый грант v1 = 403 CONSENT_REQUIRED (не переносится молча). Gate-consumers sweep: все читатели consent'а cloud_texts (sourceAdapters, agentSentenceRepo-пути, server-эндпоинты) обязаны видеть ОДНУ функцию истины.
- **Клиент:** ☁-модал: если session.consents.cloud_texts.granted && version < v2 → чекбокс снят + амбер-строка «Описание синхронизации обновлено — прочитайте и подтвердите заново» + новая карта; artifact-sync до re-consent честно скипается (`skipped:'reconsent_required'`, строка в статусе).
- **Новая карта (copy, ru/en/he + SW bump):** что едет ПОСЛЕ P0 — «тексты из "Мои тексты" (корпус — никогда) вместе с их заметками и позицией чтения; отдельно: ваши словарные заметки, полки, ручные переводы и Anki-связки»; направление (устройство ↔ сервер, читают только ваши устройства; первопартийный наставник — по отдельным ключам agent_read_texts*); retention «хранится до удаления текста, отзыва согласия или удаления аккаунта; отзыв = немедленное удаление с сервера [P2]»; НЕ едет: журнал повторений отдельным каналом синка событий (уже описан строкой «События памяти»).
- **Класс C:** комментарии `learnerArtifactsRepo.js:3` и server.js §3289 «класс B» → «класс C (постановление 2026-07-18, RECON §2.5)»; мигр. 023 не редактируется (применённая история).

## 3. P2 — delete-семантика

### 3.1 Сервер

- Мигр. `048_artifact_tombstones.sql`: `artifact_tombstones(user_id REFERENCES users(id) ON DELETE CASCADE, kind, artifact_key, deleted_at, PRIMARY KEY(user_id,kind,artifact_key))` (отдельная таблица, не status-колонка: артефакт-строка физически удаляется — байты освобождаются, tombstone = маркер события; R12). + `ALTER TABLE consent_records ADD COLUMN purged_at TEXT` (GDPR-канон `AI_MENTOR_RECON:421–425`).
- `POST /api/learner/artifacts/delete {artifact_key, kind?, deleted_at?, restore?}` (session+CSRF+consent-гейт): DELETE строки артефакта + UPSERT tombstone (`deleted_at` = клиентский, clamp к server-now при будущем >1h); `restore:true` → снять tombstone (для пере-импорта). Идемпотентен.
- `list()` ответ: `rows` + `tombstones:[{artifact_key, deleted_at}]` (только для text_bundle).
- `put()` при живом tombstone: `updated_at > deleted_at` → принять + снять tombstone («правка воскрешает» — LWW); иначе `{stored:false, reason:'DELETED_NEWER', deleted_at}`.
- **Отзыв `cloud_texts` → purge класса C:** каскад в `/api/auth/consent` (рядом с cancelOpenForUser): DELETE все learner_artifacts (оба kind) + все tombstones пользователя; `UPDATE consent_records SET purged_at=now` на revoke-строке; audit `artifacts_purge`. Re-grant → следующий fullSync загружает всё заново (server map пуст). TODO-маркер: когда появится `agent_text_grants` (S-пакет) — сюда же каскад отзыва грантов.

### 3.2 Клиент

- Очереди в `sync_state`: `artifact_delete_queue` / `artifact_undelete_queue` (JSON-массивы `{key, deleted_at}` / `{key}`), идемпотентные хелперы в local-db (`queueArtifactDelete(textId|key)` — ловит text_key ДО удаления строки).
- Студия: single- и bulk-delete энкьюят + fire-and-forget POST при живой сессии (Студия обычно без cloud-сессии — тогда только очередь, дренаж на следующем синке Зала). Wipe — НЕ энкьюит.
- Undo-тост / ручной ZIP-импорт: `importBundle(..., {userRestore:true})` (только пользовательские call-sites; cloud-sync и canon-автоимпорт НЕ передают) → энкьюит undelete для импортированных text_key.
- syncArtifacts: дренаж undelete → delete → применение серверных tombstones ЛОКАЛЬНО (текст существует && `updated_at <= deleted_at` → deleteText; новее → жив, его UP снимет tombstone) — СТРОГО ДО UP-цикла (иначе UP воскрешает удалённое раньше, чем узнает об удалении); на `DELETED_NEWER` в UP — локальное удаление (LWW deletion-wins).
- **Import-before-delete фикс** (`cloud-sync.js:254–262`): вместо `deleteText → importBundle` — `importBundle(payload, {mode:'replace'})`: в importBundle режим 'replace' удаляет существующий текст ВНУТРИ sp_text-SAVEPOINT перед вставкой → сбой импорта атомарно откатывает и старый текст остаётся (сегодня сбой = локальная потеря).
- **Архивные тексты синкаются:** `listOwnTextsForSync` перестаёт фильтровать is_archived (corpus-фильтр остаётся); is_archived уже едет в бандле и восстанавливается. Заодно исчезает паразитный DOWN-GET архивных артефактов каждый цикл (§0.5).

### 3.3 Гейты P2

В `smoke:sync-slim` добавляются сцены: удаление на A → tombstone → B локально удаляет (не ресурректит); правка на B ПОСЛЕ удаления → текст воскресает на обоих; re-import через userRestore → undelete → текст снова в облаке; отзыв consent → артефакты + tombstones удалены (purged_at установлен) → re-grant → полный re-upload; FUTURE_UPDATED_AT отвергается видимо; mode:'replace' при инжектированном сбое импорта сохраняет старый текст.

## 4. Порядок и не-цели

Импл. порядок: см. §6.11 (P0 → P2 → P1 — переставлено критикой F2-6). Прод-верифи: снипет C до/после + VACUUM + df -h; owner live-verify обеих поверхностей.
Не трогаем: `agent/access/*`, ZIP-экспорт (полный exportBundle без slim; slim-код только ДОБАВЛЯЕТ секцию bookmarks в полный бандл), Anki-пути, review_log-синк, `index.html` вне delete-call-sites (+SW bump по правилу).

## 5. Адверсариальная критика (проведена 2026-07-18, 2 независимых критика по коду)

**Критик 1 (R13/R11):** 2 BLOCKER — (F1-1) `createText` затирает `updated_at` бандла штампом «сейчас» (`local-db.js:601–608`), пост-инсерт restore (5216–5225) его не возвращает → вся LWW/tombstone-математика на фиктивных штампах; сегодняшний синк УЖЕ пинг-понгует полные 7,5-МБ артефакты между устройствами (объясняет «свежесть» всех 83 артефактов в замере §3.4 канона); (F1-2) merge state через `_applyAdvancedNotesPayload`-семантику union-by-ignore не проносит правки (didMerge не трогает body, 5405–5434; overrides OR IGNORE; anki OR REPLACE старым; полки без timestamps) и merge-back под replace_equal публикует СТАРЫЙ контент под свежим ts. MAJOR: max(updated_at) слеп к occurrence-only действиям (addNoteOccurrence не бампает, 1592–1605 — а это самый частый флоу); delete-endpoint без LWW-guard уничтожает более новый артефакт; порядок undelete→delete ломает Undo; «CASCADE снесёт occurrences» — фактическая ошибка, FK на text/sentence НЕТ → dangling-утечка на каждый replace; bookmarks гибнут при replace (CASCADE есть, в бандле их нет — «re-anchor pattern» в комментарии cloud-sync никогда не существовал); оракул A-vs-B слеп к общим багам обоих путей + нет merge-сцен. MINOR: якоря через JOIN sentences (не o.text_id); RMW-гонка JSON-очередей в мультивкладке; размер slim не доказан по распределению (sentence_morph!); purge fail-visible; версия v2 — точное равенство от одной константы; slow-clock edit-loss из risk-register.

**Критик 2 (R15/R12/R16/R14):** 3 BLOCKER — (F2-1) `ALTER consent_records ADD purged_at` упадёт: колонка существует с мигр. 020:58; (F2-2) кап state 24 МБ недостижим — глобальный bodyParser 10mb стоит ДО роутов (server.js:175–176), per-route 32mb мёртв; путь обязан войти в skip-list с auth-гейтами ДО тяжёлого парсера (инвариант самого репо); (F2-3) очереди: Студия-офлайн delete + Undo → следующий синк удаляет восстановленный текст с обеих сторон. MAJOR: (F2-4) исключение study_day из state опирается на ложную посылку — ingest принимает ТОЛЬКО review_log+learner_events, study_day НЕ существует на сервере вообще (grep 0), `available` из лога не выводимо → исключение = регресс all-surface-стрика; (F2-5) равные ts + whole-blob LWW → клоббер union / вечная стейл-копия без контент-детекции; (F2-6) v2-карта обещает «отзыв = удаление» ДО существования P2 — порядок деплоя P1 после P2; (F2-7) sourceAdapters держит вторую инлайн-«истину» consent'а без версии; (F2-8) tombstones без капа = мусорный рост + self-DoS list; (F2-9) горячий путь: каждый тап-заметка → полный state-PUT каждые 90 c, GET парсит блоб на 1.5 vCPU; (F2-10) delete за v2-гейтом = right-to-delete заперт за новым согласием; (F2-11) purge-каскад: сосед-паттерн проглатывает, purged_at некуда ставить (id revoke-строки выбрасывается server.js:2000 — а recordConsent его ВОЗВРАЩАЕТ). MINOR: occurrences не имеют updated_at (перечислить per-component колонки); future-ts липко травит max → клампить; копия «корпус — никогда» полуправдива (occurrences корпусных текстов = следы чтения); /api/auth/consent без rate-limit; restore 83 GET vs лимит 120/мин; rollbackImportedTexts не постановлён; строковое ≥'v2' ломается на v10.

Оба вердикта: направление верное (комплемент slim/state by construction, tombstone-отдельно, opaque-blob, откат-выключатель), но имплементация в исходном виде запрещена. Всё интегрировано в §6.

## 6. РЕВИЗИЯ (обязательные переопределения; финальная спецификация = §1–§3 минус узлы, переписанные здесь)

### 6.1 Временна́я основа LWW (F1-1) — первый фикс пакета
importBundle сохраняет `created_at`/`updated_at` бандла: пост-инсерт UPDATE (R-3.7-блок) расширяется этими полями. Гейт: roundtrip-инвариантность updated_at (export→import→export) в smoke:sync-slim. Побочный выигрыш: гасится существующий пинг-понг полных артефактов.

### 6.2 state_bundle: идентичность, merge, изменение-детекция (F1-2, F2-5, F1-3, F2-12, F2-13)
- **Идентичность строк:** state-заметки едут со СВОИМИ id (UUID глобально уникальны; state не проходит text-remap) → import: сначала dedup-merge по gen_dedup_key (канонические), затем по id; INSERT при отсутствии.
- **Per-row LWW merge** (паттерн Pass 15 word_status): notes — UPDATE body_json/title/audio*/confidence/model_version/user_touched/updated_at WHERE excluded.updated_at > existing; translation_overrides — upsert newer-wins по updated_at; anki_word_exports — newer-wins по updated_at (НЕ безусловный REPLACE); shelves — экспорт С updated_at (колонка есть, migrations.js:737; _exportShelves больше её не вырезает для state) + per-slug newer-wins; roots — OR IGNORE (нет timestamps — паритет, отмечено); study_day — per-day MAX (существующий SQL); versions/links/occurrences — идемпотентные вставки (occurrences — existence-check с NULL-safe сравнением word_offset, НЕ полагаться на ux_note_occ с NULL).
- **state_ts** = max по колонкам: notes_v2.updated_at · note_occurrences.created_at · shelves.updated_at · translation_overrides.updated_at · anki_word_exports.updated_at · study_day.updated_at, **клампится к now** (future-ts не травит навсегда).
- **Change-signal вместо слепого ts:** дешёвый агрегат-вектор (max-ts + counts всех компонентов) в sync_state; UP только при изменении сигнала с последнего успешного PUT; DOWN при serverTs ≠ запомненного серверного ts (ловит равный-ts-новый-контент). **Merge-back**: после DOWN-merge re-export; если канонический payload ≠ серверному → PUT с ts = max(localTs, serverTs(+1ms при равенстве)) — строго-новее, другие устройства детектируют; replace_equal для merge-back НЕ используется (F1-2), остаётся только для одноразовой миграции формата per-text артефактов.
- **Троттлинг state-UP** (F2-9): авто-циклы — не чаще 1/10 мин (сегодня правка заметки не уезжает ВООБЩЕ до правки текста — строго лучше); ручной «Синхронизировать» — немедленно.
- **Данные state** (уточнение): + study_day (F2-4: канала ingest у него НЕТ — посылка session-prompt опровергнута кодом); occurrences НА corpus-текстах ИСКЛЮЧЕНЫ из экспорта (сегодня всё равно всегда дропались на импорте = паритет; плюс честность «корпус — никогда» F2-14 и data-minimization). Якоря — JOIN через sentences (o.sentence_id→s.text_id→t.text_key), НЕ через o.text_id (бывает NULL by design); неякорируемое — счётно в отчёт экспорта.

### 6.3 Сервер: парсер, капы, GET (F2-2, F2-9, F2-16)
`/api/learner/artifacts/put` уходит в skip-list глобального 10mb-парсера; на роуте: rate-limit → auth (requireUser-мидлвар) → CSRF (заголовок, тело не нужно) → consent → bodyParser 32mb → хендлер. Капы: text_bundle 8 МБ, state_bundle 24 МБ + `warn:'NEAR_CAP'` при >75% (клиент показывает). GET get — raw-passthrough `payload_json` (конверт собирается строкой, без JSON.parse 5-МБ блоба на 1.5 vCPU; payload валиден с PUT-времени). rlLearnerArtifacts 120→240/мин (fresh-restore 83+ GET). list: ответ + additive-поля `state:{updated_at,bytes}|null` и `tombstones:[...]` (старые клиенты игнорируют; rows остаётся чистым text_bundle).

### 6.4 Delete/tombstone LWW (F1-4, F2-8)
delete: если `existing.updated_at > deleted_at` → отказ `DELETED_OLDER` (без удаления и tombstone; клиент дропает интент — сервер держит более новую версию, следующий DOWN её принесёт). Tombstone ставится ТОЛЬКО если артефакт реально удалён (changes>0) — фантомные ключи не тombstонятся (кап мусора by construction); повторный delete уже-удалённого — идемпотентный ok. put при живом tombstone: `updated_at > deleted_at` → принять + снять tombstone; иначе `DELETED_NEWER` (клиент применяет локальное удаление). deleted_at — клиентский, clamp к server-now при future >1h. Прюнинг tombstones >180 дней — в opsSweepTick (+строка о TTL в consent-карте).

### 6.5 Клиентская очередь интентов (F1-5, F1-10, F2-3)
НЕ JSON в sync_state, а OPFS-таблица `artifact_sync_intents(id INTEGER PK AUTOINCREMENT, op TEXT CHECK(op IN ('delete','undelete')), artifact_key TEXT, deleted_at TEXT, created_at)` (клиентская миграция, метка = реальному индексу массива). **Last-intent-wins per key:** enqueue любого op сначала удаляет ВСЕ pending-интенты этого ключа (Undo снимает delete до дренажа — F2-3 закрыт by construction). Дренаж: по id, удаление обработанных по id (без RMW-гонки мультивкладки — все записи через owner-tab worker FIFO).

### 6.6 mode:'replace' + гигиена occurrences + bookmarks (F1-6, F1-7)
mode:'replace' в importBundle: DELETE существующего текста ВНУТРИ sp_text + в том же SAVEPOINT — `DELETE FROM note_occurrences WHERE text_id=? OR sentence_id IN (SELECT id FROM sentences WHERE text_id=?)` (FK на text/sentence у occurrences НЕТ — иначе dangling-утечка на каждый replace). Разовый boot-heal накопленных dangles (sync_state-флаг). Slim-бандл несёт `bookmarks` этого текста (order_index-якорь; колонки есть) — ДОБАВЛЯЕТСЯ и в полный exportBundle (additive; закрывает старую молчаливую гибель закладок при LWW-replace); import: re-anchor по order_index, OR IGNORE по ux_bookmarks_pos.

### 6.7 Consent v2: границы гейта (F2-7, F2-10, F1-13)
Требование `version === CLOUD_TEXTS_CONSENT_VERSION` ('v2', ТОЧНОЕ равенство — не ≥) для list/get/put; **delete/restore — под грантом ЛЮБОЙ версии** (right-to-delete не запирается за новым согласием); дренаж интентов в syncArtifacts идёт ДО list (работает в v1-окне). Константа — ЕДИНСТВЕННАЯ: `public/js/cloud-sync.js` (UMD → сервер её require'ит; никаких второй копии строки). Gate-consumers sweep: sourceAdapters:42 (инлайн-SQL → learnerArtifactsRepo.hasConsent), agentSentenceRepo ×4, agentClozeRepo ×2, library-ui (грант пишет версию из константы, не 'v1'-литерал), studio-agent (проверить гейты лестницы). Первопартийные mentor-пути в re-consent-окне: fail-closed typed (видимо) — приемлемо, окно короткое (owner re-consents сразу).

### 6.8 Purge при отзыве — fail-visible (F1-12, F2-11)
Каскад в /api/auth/consent: захватить `id` из recordConsent (возвращается — identityRepo.js:238); DELETE артефактов (оба kind) + tombstones; `UPDATE consent_records SET purged_at WHERE id=?`; провал → 500 `PURGE_FAILED` (паттерн F1/F2-memory, НЕ сосед-glotok) + audit. Reconcile в opsSweepTick: последний cloud_texts = revoke && артефакты существуют → допурж. `/api/auth/consent` получает rate-limiter (10/мин) — F2-15.
Мигр. 048: ТОЛЬКО artifact_tombstones (БЕЗ ALTER consent_records — purged_at существует с 020:58; F2-1).

### 6.9 Slow-clock страховка (F1-14)
Перед каждым LWW-replace — слим-снапшот старого текста в capped-таблицу `lww_replace_backups(text_key, payload_json, created_at)` (последние 20; та же клиентская миграция). Без UI — recovery через консоль; закрывает «отставшие часы съели правку» невосстановимой потерей.

### 6.10 Оракул и dry-run (F1-8, F1-11)
smoke:sync-slim: сравнение slim-restored БД против **ИСХОДНОЙ фикстуры** (raw-SQL канонические множества), не только A-vs-B; + merge-сцены (правка body на A → B; occurrence-only add; полка; override; study_day MAX; Undo-vs-delete; DELETED_OLDER/NEWER; roundtrip-инвариантность updated_at). Dry-run масштаба — `scripts/premium/sync-slim-dryrun.js` на `Library/test-enriched.zip` (80 текстов / ~9K заметок): гистограмма slim-размеров, размер state, счётные потери. Порог 200 КБ/текст утверждается по dry-run, не по вере.

### 6.11 Порядок деплоя (F2-6)
**P0 → P2 → P1.** Consent-копия v2 обещает «отзыв = немедленное удаление» — она деплоится ПОСЛЕ существования delete-семантики (P2), иначе P1 сам становится нечестным consent'ом. rollbackImportedTexts НЕ энкьюит delete-интенты (облако = last-known-good при откате миграции; F2-17). Wipe — не энкьюит (§0.3).
