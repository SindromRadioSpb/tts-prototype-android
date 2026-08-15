# ROOM-UX-B9 — Curated Paths & Assignments research-session prompt

> **Successor status · 2026-08-15:** this research session was completed and its
> design decisions were recorded, but B9 implementation and schema migration are
> now frozen because no qualified curator-mentor operating authority is
> available. Do not reuse this prompt as implementation authority. See
> [the controlling freeze record](./ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md).
> The next active lane is
> [ROOM-UX-VF — Visual Finishing research-only](./ROOM_UX_VISUAL_FINISHING_RESEARCH_SESSION_PROMPT_2026_08_15.md).

Скопируй следующий блок целиком в новую сессию.

---

Начни новый goal:

```text
ROOM-UX-B9 — Curated Paths & Assignments
MODE=RESEARCH_ONLY
DATE=2026-08-15
```

Рабочая директория:

```text
E:\projects\tts-prototype-android
```

## 1. Цель сессии

Проведи evidence-backed исследование B9 Curated Paths & Assignments и подготовь
полноценный owner decision packet до любого runtime-кода, CSS/HTML/i18n-изменения,
schema/migration, изменения данных, commit/push или production deploy.

Нужно определить зрелую продуктовую и truth-архитектуру для:

- human-authored curated paths;
- owner/editor/teacher authoring authority;
- optional learner paths и обязательных assignments;
- последовательности `текст → песня → повторение → optional comprehension`;
- learner completion и возобновления без второго progress/review writer;
- corpus-local, group-local и cross-corpus ownership;
- learner UI и curator/teacher UI;
- sync, recovery, export, access revocation и audit;
- AI-generated paths/content как отдельной default-off возможности.

После decision packet остановись и жди моего явного:

```text
APPROVE ROOM-UX-B9-R
```

Никакой реализации в research-сессии, даже если рекомендация очевидна.

## 2. Обязательное восстановление контекста

Полностью прочитай в указанном порядке:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/SESSION_STATE_BRR_2026_06_14.md`
5. `docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`
6. `docs/planning/ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md`
7. `docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`
8. `docs/planning/ROOM_UX_B8_READING_JOURNEY_DECISION_PACKET_2026_08_13.md`
9. `docs/planning/ROOM_UX_B8_READING_JOURNEY_IMPLEMENTATION_EVIDENCE_2026_08_13.md`
10. `docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`
11. `docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`
12. `docs/research/room-library-surface-unification/2026-08-14/implementation/PRODUCTION_RELEASE_EVIDENCE.md`
13. `docs/planning/ROOM_CORPUS_DISCOVERY_CATALOG_CONTRACT_APPROVAL_2026_08_15.md`
14. `docs/research/room-library-surface-unification/2026-08-14/implementation/discovery-catalog-2026-08-15/RELEASE_EVIDENCE.md`
15. `docs/planning/ROOM_AUDIO_TTS_INDICATOR_PARITY_IMPLEMENTATION_EVIDENCE_2026_08_15.md`
16. `docs/planning/BRR_EPIC6_CURATED_LIBRARY_2026_06_30.md`
17. `docs/planning/GROUP_SONG_CORPUS_P0_2026_07_23.md`

Также найди и прочитай только действительно относящиеся к B9 свежие документы
по Lesson Builder, group corpus membership/access, comprehension, Trainer/SRS,
reading lists, editorial provenance, export/recovery и teacher surfaces. Не
подменяй актуальный код старыми roadmap-утверждениями. Живой код первичен.

Перед исследованием кратко, в 5–10 строках, перескажи:

- что закрыто в B0–B8 и Library/Corpus successor program;
- какие truth domains и UI contracts уже заморожены;
- что именно является новым B9 scope;
- какие решения нельзя переоткрывать без regression evidence;
- какие вопросы пока действительно требуют owner decision.

## 3. Закрытые границы

Считать принятыми и не переоткрывать без конкретного regression evidence:

- B0–B8;
- Library/Corpus Surface Unification;
- Corpus Discovery & Catalog;
- Audio/TTS Indicator Parity;
- global Reading Journey на Library/L0 и corpus-local browse;
- consolidated Reading Lists module;
- last-working-position, отдельность bookmarks и confirmed Finished;
- append-only `review_log` и существующий FSRS/trainer truth;
- typed vertical material rows, bounded previews и отсутствие horizontal rails;
- shared typed section/disclosure grammar и persisted presentation state;
- optional profile-fit как derived lower-bound projection, а не comprehension,
  assignment или сохранённый recommendation feed;
- отсутствие второго writer для progress, bookmarks, Finished, reading lists,
  recommendation state, disclosure state и audio state.

B9 — новый продуктовый домен. Он не должен маскироваться под расширение reading
list, Learning Compass или group-corpus ordering без доказательства equivalence.

Visual Finishing не включать в B9, кроме минимально необходимого контракта новых
B9-поверхностей. Общий icon/typography/motion polish остаётся отдельным lane.

## 4. Исходные гипотезы — проверить, а не принять заранее

Основной кандидат:

- Curated Path — отдельная versioned human-authored сущность, а не renamed
  reading list.
- Path содержит ordered typed items с provenance и optional/required semantics.
- Assignment — отдельная authority-bearing связь между опубликованной версией
  path и learner/group, а не флаг на материале.
- Learner activity продолжает писать только в существующие canonical progress,
  Finished и `review_log` domains; B9 completion по возможности является
  projection над ними.
- Если требуется явное состояние `skipped`, acknowledgement, due-date exception
  или assignment completion, оно должно быть доказано как новый typed truth
  domain, а не спрятано в progress, reading list или localStorage.
- Human-authored paths — immediate candidate; AI-generated paths/content —
  отдельное решение, default-off и вне первой реализации.

Отклони или скорректируй любую гипотезу, если code, owner-live или role evidence
показывает более зрелый вариант.

## 5. Обязательный code recon

Минимально исследуй:

- `public/library.html`
- `public/js/library-ui.js`
- `public/js/reader-core.js`
- `public/db/local-db.js`
- `public/db/db-worker.js`
- `public/js/learning-compass-core.js`
- `public/js/learning-compass-ingredients.js`
- `db/groupCorpusRepo.js`
- `db/groupInviteRepo.js`
- group-corpus routes в `server.js`
- `migrations/056_group_song_corpus_p0.sql`
- `migrations/057_group_corpus_audio_revisions.sql`
- `migrations/058_group_corpus_catalog_metadata.sql`
- `migrations/059_group_member_invites.sql`
- `public/js/lesson-artifact.js`
- `agent/lessonBuilder.js`
- `agent/lessonCompositionContract.js`
- текущие Lesson Builder/mentor surfaces в `library-ui.js`
- `/api/agent/comprehension` и его runtime/read/write semantics;
- Trainer/SRS writers/readers и `review_log` replay;
- `corpus_reading_lists_v1`, `getReadingLists()` и существующие list actions;
- RU/EN/HE locale contracts;
- связанные unit/smoke fixtures и production API contracts.

Особенно докажи, что означает текущий `group_assignment`:

- `choosePrimaryReason({ group_assignment: true, ... })` в
  `learning-compass-core.js`;
- места, где `library-ui.js` передаёт `group_assignment:true` для group corpus;
- есть ли за этим реальная assignment entity/writer либо это presentation
  inference из membership/curator order;
- может ли этот флаг честно использоваться B9 или обязан быть заменён typed
  authority truth.

Не считать существующий group corpus, reading list, Lesson Builder artifact,
comprehension response или hardcoded provenance полноценным assignment/path
только из-за похожего пользовательского смысла.

## 6. Truth/writer/reader/source map

Построй карту минимум для:

- named reading lists;
- group, corpus и membership/access;
- group corpus curator ordering;
- personal and corpus text identity;
- reading progress и Finished;
- bookmarks/notes;
- `review_log`, SRS cards и Trainer session projection;
- advisory comprehension;
- Lesson Builder artifacts;
- Learning Compass/profile-fit и `group_assignment` reason;
- proposed Path identity/version;
- proposed Assignment identity/authority;
- proposed path/assignment completion projection или event truth.

Для каждого блока укажи:

- truth domain;
- canonical writer;
- reader/query/API;
- identity и idempotency key;
- local/server/cross-device scope;
- persistence и sync;
- export/recovery/eviction/reinstall honesty;
- access control, revocation и audit;
- delete/archive lifecycle;
- можно ли безопасно переиспользовать его в B9;
- какие новые истины действительно отсутствуют.

Отдельно различай:

- authored order;
- assignment authority;
- learner activity;
- completion projection;
- explicit acknowledgement/skip/exception;
- recommendation/profile-fit;
- presentation/disclosure state.

Они не должны сливаться в один флаг или второй writer.

## 7. Обязательный live-browser recon

Используй подключённый Kapture/Chrome/Browser MCP, предпочтительно существующую
авторизованную production-вкладку:

```text
https://linguistpro.kolosei.com/library.html
```

Owner profile — строго read-only:

- не создавать/удалять/переименовывать reading lists;
- не добавлять и не удалять материалы;
- не менять progress, Finished, bookmarks, notes или review state;
- не запускать Trainer grading;
- не создавать group, corpus, invite, member, lesson, path или assignment;
- не менять curator ordering/catalog metadata;
- не запускать comprehension/provider calls;
- не очищать localStorage/OPFS и не удалять owner keys;
- не тестировать destructive controls.

Допускается:

- DOM/accessibility/ARIA inspection;
- read-only route traversal;
- чтение served version и доступных API shapes без mutation;
- визуальная проверка Library/L0, Ben-Yehuda, My Texts, Study Songs, Reader,
  Mentor/Lesson и доступной teacher/management shell;
- исследование visible authority/provenance/corpus-order affordances.

Отдельно зафиксируй:

- где пользователь ожидает найти Paths и Assignments;
- можно ли отличить path от reading list и catalog order;
- что сегодня визуально выглядит как `назначено`, хотя canonical assignment
  truth не доказан;
- где должен жить resume/next-step entry point;
- где teacher/editor может авторить, preview, publish, revise, archive и revoke;
- RU/HE/RTL, keyboard, narrow layout и disclosure implications.

Production, isolated automation и owner-reported evidence не смешивать.

## 8. Продуктовые варианты

Исследуй минимум три верхнеуровневые модели.

### Вариант A — Reading Lists Plus

Расширить named reading lists order/metadata и использовать их как paths и
assignments.

Проверь простоту, migration cost и риск смешать personal curation, authority,
versioning, completion и destructive list lifecycle.

### Вариант B — Path как отдельная сущность, Assignment как отдельная связь

Human-authored versioned Path содержит ordered typed items; Assignment связывает
immutable published version с learner/group и authority metadata.

Проверь сложность schema/API, draft/publish/version lifecycle, reuse existing
activity truth, rollback и export.

### Вариант C — Corpus order как путь

Считать curator order group corpus готовым path, а membership — assignment.

Проверь применимость к cross-corpus sequence, личным текстам, review/comprehension,
optional steps, version pinning, reordering after assignment и честность текущего
`group_assignment` reason.

Допускается hybrid D, если evidence показывает, что B лучше как canonical core,
а existing reading lists/corpus order должны быть import/view adapters, но не
конкурирующими writers.

Сравни варианты через роли R1–R17, особенно R2, R4, R5, R6, R7, R8, R9, R11,
R12, R15, R16 и R17. Дай однозначную рекомендацию.

## 9. Обязательные решения packet

Packet должен представить options, evidence, риски и рекомендацию минимум по
D1–D10.

### D1 — Authoring authority

Кто создаёт и публикует path: owner, corpus editor, teacher/group owner; можно ли
совмещать роли; какой audit/provenance обязателен.

### D2 — Path identity and lifecycle

Reading-list extension, отдельный mutable Path либо draft + immutable published
versions; rename/fork/archive/delete и ссылки на уже назначенную версию.

### D3 — Typed sequence model

Контракт item для text, song, review и optional comprehension; order, required,
optional, prerequisite, reason/source/level и unavailable material behavior.

### D4 — Assignment model

Optional path против required assignment; learner, group или corpus target;
assigned_by, assigned_at, due date, withdraw/reassign и authority visibility.

### D5 — Completion truth

Что вычисляется из progress/Finished/`review_log`, что требует явного typed event,
как обрабатываются skip/waive/optional/reordered/versioned steps; запрет второго
progress или review writer.

### D6 — Surface ownership

Library/L0, corpus, group home, Reader, Trainer и teacher/editor surfaces; entry,
resume, next step, history и separation от Reading Journey/Reading Lists.

### D7 — Sync, recovery and export

Local/server authority, offline reads/writes, cross-device convergence,
reinstall/eviction, export/import, idempotency, conflict policy и rollback.

### D8 — Access, privacy and revocation

Owner/editor/teacher permissions, membership change, assignment withdrawal,
private/protected material, content leakage, audit и retention.

### D9 — AI boundary

Human-only immediate scope, AI-assisted draft с mandatory human publish либо
AI-generated paths. По умолчанию AI generation и provider calls должны оставаться
default-off и не входить в immediate implementation без отдельного approval.

### D10 — Immediate scope and release slicing

Что входит в первый implementation slice; что уходит в follow-up, Visual
Finishing или отдельный AI/content program; migrations, allowlist, rollback,
version/SW strategy и serialized deploy order.

Для каждого решения дай:

- варианты A/B/C;
- code/production/owner-live/external evidence;
- role analysis;
- риски и failure modes;
- рекомендацию;
- migration/data impact;
- backward compatibility;
- rollback boundary;
- точный approval value.

## 10. External benchmark

Проведи ограниченное актуальное исследование официальных/primary источников для
3–5 релевантных продуктов с curated paths, reading sequences или teacher
assignments. Сравни только переносимые контракты:

- authoring/publish/versioning;
- optional path versus required assignment;
- learner resume/completion;
- provenance/authority;
- mobile/RTL/accessibility;
- export/recovery и access revocation.

Не копируй generic LMS complexity и не превращай benchmark в feature checklist.
Факты датируй и снабжай прямыми ссылками; inference отмечай отдельно.

## 11. Research artifacts

Создай стабильную папку:

```text
docs/research/room-ux-b9-curated-paths-assignments/2026-08-15/
```

Минимальный комплект:

1. `README.md`
2. `CURRENT_CAPABILITY_INVENTORY.md`
3. `LIVE_BROWSER_EVIDENCE.md`
4. `TRUTH_WRITER_READER_MAP.md`
5. `AUTHORITY_AND_ACCESS_MODEL.md`
6. `PATH_SEQUENCE_AND_COMPLETION_MODEL.md`
7. `SURFACE_AND_INTERACTION_MATRIX.md`
8. `EXTERNAL_BENCHMARK.md`
9. `OPTIONS_AND_ROLE_SYNTHESIS.md`
10. `FINDINGS.md`

Decision packet:

```text
docs/planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_DECISION_PACKET_2026_08_15.md
```

Каждый документ должен содержать:

- дату;
- source commit;
- branch;
- dirty-tree status;
- inspected production URL/version;
- метод evidence;
- разделение `CODE`, `ISOLATED_AUTOMATION`, `PRODUCTION`,
  `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`;
- ограничения исследования.

Никакие значимые артефакты не оставлять только в `.tmp`.

## 12. Implementation-ready boundary

Хотя код запрещён, packet должен подготовить следующий этап:

- предполагаемый allowlist файлов;
- files forbidden to touch;
- shared contracts и ownership;
- proposed API/DB entities только как options, не migration;
- idempotency, versioning и writer rules;
- UI/DOM/CSS и RU/EN/HE keys;
- backward compatibility с reading lists, group corpus order и existing learner
  history;
- rollback plan;
- version/SW strategy;
- порядок scoped commits и serialized deployments;
- production verification plan;
- отдельный migration approval gate, если migration действительно необходима.

Не создавать второй writer для:

- progress/last position;
- Finished;
- bookmarks/notes;
- `review_log`/SRS;
- reading lists;
- recommendation/profile-fit;
- group membership/corpus ordering;
- presentation/disclosure state.

## 13. Verification matrix для будущей реализации

Подготовь, но не запускай destructive owner tests:

- desktop RU;
- desktop HE/RTL;
- 380×844 RU;
- 380×844 HE/RTL;
- 200% zoom/reflow;
- keyboard-only;
- screen-reader DOM/ARIA semantics;
- reload и close/reopen tab;
- offline/reconnect;
- service-worker update;
- empty path;
- один item;
- mixed text/song/review/comprehension path;
- optional и required items;
- unavailable/removed/protected material;
- path version updated after assignment;
- assignment withdrawn/member revoked;
- multiple paths and assignments;
- long RU/Hebrew titles;
- bounded large path;
- cross-corpus path;
- no-progress and partial-progress learner;
- already-Finished text;
- due review already completed through canonical `review_log`;
- sync conflict/replay/idempotency;
- export/import/read-back;
- no learner-content telemetry;
- no implicit provider/LLM call;
- no navigation-triggered progress/bookmark/review writes;
- no horizontal page overflow.

Automation не называть physical-device или owner-live evidence.

## 14. Stop list

До `APPROVE ROOM-UX-B9-R` запрещено:

- писать или менять runtime-код;
- менять CSS/HTML/locales;
- менять schema, DB или migrations;
- создавать Path/Assignment records;
- менять owner progress, bookmarks, Finished, notes или `review_log`;
- создавать/удалять/переименовывать reading lists;
- создавать/revoke invites или менять group membership;
- менять group corpus order/catalog metadata;
- запускать comprehension, LLM или BYOK calls;
- создавать AI-generated paths/content;
- менять recommendation algorithm/feed;
- переоткрывать B0–B8 или закрытую Library/Corpus программу без regression
  evidence;
- коммитить или пушить;
- делать production deploy;
- проводить destructive smoke на owner profile.

Если обнаружен regression, зафиксируй его отдельно с evidence, но не исправляй
внутри research-only сессии.

## 15. Условие завершения research-сессии

В финале:

1. Дай ссылки на все research artifacts и decision packet.
2. Кратко перечисли подтверждённые факты.
3. Отдельно перечисли гипотезы и неизвестные.
4. Представь D1–D10 с вариантами и однозначной рекомендацией.
5. Укажи, требуется ли schema/data migration; не считать `NONE` заранее.
6. Дай точный предлагаемый approval string.
7. Подтверди:

```text
CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
COMMIT=NONE
PUSH=NONE
DEPLOY=NONE
```

8. После этого остановись.

Не переходи к реализации без моего явного полного решения:

```text
APPROVE ROOM-UX-B9-R:
D1=...;
D2=...;
D3=...;
D4=...;
D5=...;
D6=...;
D7=...;
D8=...;
D9=...;
D10=...;
MIGRATION=...;
SCOPE=...;
```

---
