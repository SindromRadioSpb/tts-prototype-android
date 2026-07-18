# SESSION PROMPT — Sync-hardening пакет P0+P1+P2 (слим-бандл · consent-честность · delete-семантика)

Дата: 2026-07-18 · Статус: READY (утверждён владельцем, см. решение §0.1 канона) · Приоритет: **СРОЧНО (P0 — тикающий отказ синка)**.
Канон READ FIRST: `docs/planning/LINGUISTPRO_AGENT_ACCESS_PERSONAL_CONTENT_BRIDGE_RECON_2026_07_18.md` (§0.1 решение, §1 карта кода, §2.3–2.5 находки, §3.4 замер, §4 V2a risk-register R13).
Роли: R13 (ведущая — lossless/dry-run/откат), R15 (consent/GDPR), R12 (структура), R11 (do-no-harm), R16 (диск/бэкапы). Норма проекта: **адверсариальная роле-критика каждого слайса ДО кода.**

## Зачем срочно (замер 2026-07-18, §3.4 канона)

83 артефакта × avg **7,54 МБ** при капе `MAX_PAYLOAD_BYTES` = 8 МБ (**92%**; min уже 84%, max 96%): каждый per-text бандл несёт полный review_log (6,2K), все 10,3K ②-заметок, word_status (5,3K), полки — 99,8% веса. Лог/заметки растут ежедневно И едут в каждом бандле → все артефакты упрутся в кап почти одновременно (горизонт — недели), синк текстов начнёт отказывать. Побочно: app.db 649 МБ, суточный бэкап 628 МБ, диск прод-хоста 83%.

## Слайс P0 — слим-бандл sync-пути

**Цель:** per-text артефакт несёт ТОЛЬКО данные этого текста; полное состояние — ОДИН отдельный артефакт.

- `exportBundle({textIds, slim:true})` (`public/db/local-db.js:4592` + `_buildAdvancedNotesPayload:4794`): в slim-режиме per-text бандл несёт текст/rows/inline-заметки/progress/**text-bound** notes_v2 (+versions/links/occurrences этих заметок, sentence_morph этого текста); НЕ несёт: text-независимые заметки, srs_cards*, events, review_log, word_status, study_day, anki_word_exports, translation_overrides, полки.
- Новый одиночный артефакт `kind='state_bundle'` (или `artifact_key='__state__'` в существующем kind — решить на критике; помнить PK `(user_id,kind,artifact_key)` мигр. 023 — новый kind = миграция CHECK? проверить, CHECK там только `kind IN ('text_bundle')` — да, `migrations/023:10` → нужна миграция) — несёт то, что выпало из per-text: text-независимые заметки + полки (+опц. translation_overrides). ⚠ review_log/word_status/study_day в state_bundle НЕ включать — у review_log уже есть СВОЙ канонический двусторонний синк (`/api/learner/ingest`), word_status derived, дублировать = R12 dual-write. Открытый вопрос на критику: судьба srs_cards*/events/anki_word_exports (не синкаются больше нигде; вероятно state_bundle, но взвесить размер/なужность).
- `syncArtifacts` (`public/js/cloud-sync.js:208`): PUT slim-бандлов + PUT state_bundle (LWW по max(updated_at) компонентов; single-flight); DOWN: state_bundle импортируется ПОСЛЕ текстов (заметки ссылаются на note_occurrences по text_key).
- **ZIP-экспорт НЕ трогать** — полный `exportBundle()` без slim остаётся как был (бэкап/portability/Android).

**R13-требования (жёсткие):**
1. **Lossless-паритет:** оракул-смоук: полный профиль → slim-артефакты + state_bundle → restore на чистую БД → сравнение с restore из старого full-бандла (канонические ключи: text_key, note dedup-key, shelf). Независимый оракул, не повторный вызов билдера.
2. **Dry-run:** прогон на копии реального профиля владельца (или §3.4-масштаба фикстуре) до включения.
3. **Откат:** старый формат ЧИТАЕТСЯ всегда (importBundle принимает оба); DOWN-совместимость: серверные старые full-артефакты корректно импортируются после включения slim; переключатель slim — клиентский, отключение возвращает старое поведение.
4. Миграция серверного состояния: одноразовый re-sync владельца перезальёт артефакты слимами (LWW: клиентский updated_at не меняется! → PUT будет skipped по `OLDER_OR_EQUAL` — нужен force-режим или bump; деталь на критику — НЕ терять §4-risk-register: skew, upSkipped-молчание).
5. Смоук размера: slim per-text бандл владельца < 200 КБ; суммарный вес артефактов после re-sync < 30 МБ (оба числа проверить на dry-run).

## Слайс P1 — честность consent `cloud_texts` (+класс C)

- Переписать consent-copy (клиентский тумблер `library-ui.js:2917` + карта в ☁-модале, i18n ru/en/he + SW bump): честно перечислить, что едет (после P0 — «тексты со своими заметками + отдельно: text-независимые заметки и полки»), retention («хранится до удаления текста/аккаунта»), направление.
- Bump `consent_version` (сейчас 'v1' — новая 'v2'); существующий грант НЕ переносить молча: при первом синке после апдейта показать re-consent (append-only `consent_records` это поддерживает by construction).
- Зафиксировать в тексте карты постановление: тела личных текстов = **класс C** (канон-дрейф «B» в комментариях кода поправить по пути: `learnerArtifactsRepo.js:3`, `server.js:3289`).

## Слайс P2 — delete-семантика (ПОЛНЫЙ фикс, выбор владельца)

- Сервер: `POST /api/learner/artifacts/delete {artifact_key}` (session+CSRF, consent-гейт) + **tombstone** (таблица `artifact_tombstones(user_id, kind, artifact_key, deleted_at)` или status-колонка — на критику): DOWN-цикл не ресурректит удалённое; повторный PUT тем же ключом снимает tombstone (пользователь пере-импортировал текст).
- Клиент: `deleteText` (и удаление из Зала/Студии) → fire-and-forget delete-вызов при живой сессии + очередь на следующий fullSync при офлайне (идемпотентно).
- Архивные тексты: сейчас `listOwnTextsForSync` фильтрует `is_archived=0` (`local-db.js:2714`) → серверная копия замораживается стейлом. Фикс: синкать И архивные (флаг едет в бандле) — честнее, чем замороженный призрак; на критику.
- Отзыв `cloud_texts` → **deletion-семантика класса C**: purge артефактов (+tombstones) вместо нынешнего freeze (`server.js:2033–2049` расширить каскад; `purged_at` в consent_records). GDPR-канон `AI_MENTOR_RECON:421–425`.
- Из risk-register §4 канона (включить сюда): server-side **skew-guard** (reject/log при `updated_at > now()+ε`), **import-before-delete** в DOWN-ветке LWW-replace (`cloud-sync.js:254–262` — сейчас deleteText до importBundle, сбой = потеря).
- Будущее-совместимость: delete/purge каскадно отзывает строки `agent_text_grants`, КОГДА таблица появится (S-пакет) — оставить TODO-маркер, не строить сейчас.

## Гейты и порядок

Каждый слайс: адверсариальная критика (R13+R15+R12/R11) до кода → импл → смоуки → owner live-verify → commit+push (гейты зелёные). Смоук-набор: новый `smoke:sync-slim` (оракул-паритет + размер + tombstone + откат) + существующие `test:api-smoke`, cloud-sync смоуки. Прод-верифи P0: снипет C канона §3.3 до/после re-sync (611 МБ → ожидание <30 МБ) + `df -h`. Не трогать: `agent/access/*` (S-пакет позже), ZIP-экспорт, Anki-пути.

После этого пакета — S1/S2-standing (agent-слой) отдельным prompt'ом по канону §0.1/§6.
