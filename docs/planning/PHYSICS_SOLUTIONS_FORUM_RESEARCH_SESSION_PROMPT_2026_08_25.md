# New-session prompt — Physics solutions and forum research

Дата: 2026-08-25

Использовать как первый запрос новой Codex-сессии из корня
`E:\projects\tts-prototype-android`.

```text
Создай новый goal:

«Провести research-only программу “Физика — решения и форум” и подготовить
evidence-backed owner decision packet для продукта, который полезен одному
учащемуся с первого дня и способен безопасно вырасти в сообщество. Исследовать
пользовательские сценарии, feature set, truth/data architecture, авторизацию и
роли, неизменяемую привязку к редакции задачи, внешние ссылки, обсуждения,
уведомления, модерацию, безопасность, приватность, вложения, резервирование,
стоимость и масштабирование. До отдельного owner approval не писать runtime-код,
не создавать migrations и не менять production».

MODE=RESEARCH_ONLY
PROGRAM=PHYSICS_SOLUTIONS_FORUM
DATE=2026-08-25

Рабочая директория:

E:\projects\tts-prototype-android

## 1. Результат сессии

Подготовь не feature wishlist и не фиктивный “форум”, а проверяемую продуктовую
и архитектурную модель реального использования:

- одному человеку — быстро найти или сохранить решение, задать точный вопрос к
  конкретной задаче/подпункту, вернуться к ответу и не потерять контекст;
- небольшой учебной группе — совместно разбирать задачи без хаоса и дубликатов;
- открытому сообществу — публиковать качественные решения и обсуждения с
  понятным авторством, модерацией, поиском, уведомлениями и защитой от злоупотреблений;
- владельцу/модератору — управлять качеством, правами, жалобами, архивом,
  резервированием, квотами и стоимостью без ручного администрирования каждой записи.

Research-сессия должна завершиться owner decision packet с вариантами,
рекомендациями, измеримыми критериями и implementation-ready границей. После
этого остановись. Реализацию не начинай даже при очевидной рекомендации.

## 2. READ FIRST — обязательное восстановление контекста

Полностью прочитай и соблюдай в этом порядке:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/research/physics-corpus/2026-08-25/README.md`
5. `docs/research/physics-corpus/2026-08-24/README.md`
6. `docs/planning/LINGUISTPRO_MASS_ACCESS_PUBLIC_CORPORA_DECISION_PACKET_2026_08_19.md`
7. `docs/planning/LINGUISTPRO_MASS_ACCESS_PUBLIC_STUDY_SONGS_IMPLEMENTATION_AND_PRODUCTION_EVIDENCE_2026_08_20.md`
8. `docs/planning/LINGUISTPRO_MASS_ACCESS_P0_DETAILED_DESIGN_AND_RED_TEST_CONTRACT_2026_08_19.md`
9. `docs/planning/LINGUISTPRO_WAVE2_S1_ROLE_AUTHORITY_REGISTRY_DECISION_PACKET_2026_07_16.md`
10. `docs/planning/TELEGRAM_P7_1_PAIRING_SPEC_2026_07_07.md`
11. `docs/planning/TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md`
12. `docs/planning/GROUP_SONG_CORPUS_P0_2026_07_23.md`
13. `docs/planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md`
14. `docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md`

Найди и прочитай только действительно относящиеся свежие документы по:

- identity/session/auth/consent/audit/delete/export;
- publication domain и immutable public editions;
- public/group corpus access, invite, membership и revocation;
- Telegram pairing/webhook/Mini App security;
- notifications и rate limiting;
- backup/restore, production storage и quota policy;
- Reader/Public Corpus UI, RU/EN/HE, RTL и accessibility.

Живой код и schema первичны, если документы расходятся с реализацией. Не открывай
`.claude/PROD_OPS_PRIVATE.md`, пока read-only production recon действительно не
потребует конкретных production coordinates; не цитируй и не выноси его содержание.

Перед исследованием дай владельцу 5–10 строк восстановленного статуса: что уже
опубликовано, что owner-accepted, какие writers/истины закрыты, что является
новым scope и какие решения ещё не приняты.

## 3. Закрытая исходная база

Считать подтверждённым, но дешёво перепроверить на текущем HEAD:

- публичный корпус `physics-year1-problems` опубликован отдельной immutable
  edition 2: 74 карточки, построчное аудио, anonymous read/playback;
- каждая будущая solution/discussion сущность должна быть привязана к
  неизменяемому task anchor, а не только к отображаемому номеру `1.1`;
- публичное чтение не должно создавать learner/account state;
- source corpus, publication snapshot, learner truth, `review_log`, group truth
  и discussion truth — разные домены; второй writer запрещён;
- B9 Curated Paths & Assignments остаётся `FROZEN`; форум не является скрытым
  способом реализовать B9, assignments или teacher authority;
- owner attestation корпуса не является автоматическим правом на любой будущий
  пользовательский solution, attachment или внешний материал;
- существующая production identity модель может быть недостаточна для сообщества;
  не предполагай готовую регистрацию, роли или multi-tenant безопасность без recon.

Если любой пункт разошёлся с живым кодом/production, остановись перед выводами и
зафиксируй точное расхождение.

## 4. Исходные гипотезы — проверить, не принять заранее

1. Первый полезный slice может быть link-first: typed внешняя ссылка на решение
   или обсуждение в Google Drive/Telegram, с автором, языком, статусом проверки,
   immutable task anchor и безопасным открытием.
2. Server-hosted бинарные вложения разумно отложить до доказанного спроса,
   capacity/security model и moderation operations.
3. Обсуждение должно быть task-scoped; подпункт/строка/формула могут требовать
   более точного optional anchor, но не должны создавать хрупкую привязку к DOM.
4. Решение и комментарий — разные сущности: решение может иметь редакции,
   provenance и quality status; комментарий принадлежит thread и имеет свой
   moderation lifecycle.
5. Anonymous read может быть допустим, но любое создание/редактирование,
   подписка, жалоба или модерация требует доказанной identity/authorization модели.
6. Продукт для одного человека не должен зависеть от network effects: private
   solution links/notes, личная очередь “разобрать позже” или owner-curated
   решения могут дать ценность до появления сообщества — но не должны дублировать
   существующие notes, reading lists или learner writers.
7. Полноценный community forum может оказаться не лучшим первым решением.
   Рассмотреть reuse зрелой внешней discussion platform, hybrid architecture и
   собственный bounded discussion service как равноправные варианты.

Отклони или измени гипотезы, если evidence показывает лучший вариант.

## 5. Обязательный repo и live-code recon

Минимально исследуй:

- `db/publicationRepo.js` и public-corpus routes в `server.js`;
- `scripts/premium/publish-physics-corpus.js`;
- `public/js/library-ui.js`, public corpus adapter/presenter и Reader anchors;
- identity/session/consent/audit/export/delete repositories и routes;
- `db/groupCorpusRepo.js`, `db/groupInviteRepo.js`, membership/access schema;
- Telegram `channelLinkRepo`, router, webhook dedup, Mini App auth/session;
- notification preferences, nudge ledger и rate-limit patterns;
- migration runner, transaction lock/idempotency patterns;
- backup/restore tooling и published-corpus storage layout;
- existing share/link UI and URL handling;
- tests around publication, auth, CSRF, deletion, anonymous indistinguishability,
  range assets, group access and Telegram security.

Отдельно докажи отрицательный факт: существует ли сегодня canonical
solution/thread/comment/moderation/attachment domain. Совпадение слов `thread`,
`comment`, `assignment` или `note` в коде не считать доказательством форума.

Построй карту текущих возможностей и разрывов с exact file/function/schema
anchors. Не предлагай новую таблицу до доказательства, что существующий домен
нельзя безопасно переиспользовать.

## 6. Product discovery: реальные jobs-to-be-done

Исследуй и раздели минимум следующие персоны/режимы:

- solo learner;
- learner, который только читает готовые решения;
- learner, который задаёт вопрос;
- contributor/solution author;
- trusted reviewer/domain expert;
- moderator;
- corpus editor/owner;
- small private study group;
- anonymous public reader;
- потенциально несовершеннолетний пользователь — как отдельный safety/privacy risk,
  не как автоматически поддерживаемая аудитория.

Для каждого построй journey и failure journey:

`задача → попытка решить → открыть подсказку/решение → задать вопрос → получить
ответ → уточнить → принять/оценить полезность → вернуться позже → новая редакция
задачи → архив/удаление/жалоба`.

Ответь evidence-backed:

- что делает продукт полезным при 1, 10, 100, 1 000 и 10 000 активных людях;
- какие функции нужны сразу, а какие создают пустую “социальную декорацию”;
- как избежать пустых веток, повторных вопросов, низкокачественных ответов и
  захвата интерфейса самыми активными участниками;
- нужны ли Q&A, chronological discussion, structured solutions, annotations или
  комбинация, и где границы каждой модели;
- какие действия должны быть reversible, appealable и audited;
- какие метрики измеряют реальную учебную пользу без content surveillance.

## 7. Варианты верхнего уровня

Сравни минимум четыре модели.

### A — External link registry

LinguistPro хранит task-bound metadata и безопасные ссылки на Google Drive,
Telegram или другую платформу; контент/обсуждение живёт снаружи.

Проверь value для solo use, access rot, link death, permissions, unsafe redirects,
moderation split, privacy leakage, searchability, export и vendor lock-in.

### B — Embedded external community

Использовать зрелый внешний форум/Q&A/discussion provider, а LinguistPro хранит
immutable task mapping, deep links и минимальные projections.

Проверь SSO/identity mapping, moderation ownership, API/export, availability,
cost, deletion, data portability, mobile embedding и CSP/privacy.

### C — Native bounded solutions + comments

Собственный structured solution domain и task-scoped threads/comments без
бинарных вложений в первом slice.

Проверь schema/API/security/moderation complexity, operational burden, abuse,
search, notification fan-out, backup/restore и migration cost.

### D — Hybrid staged model

Native typed solution/link metadata + external content initially; native text
solutions/comments только после evidence gate; server attachments последними.

Проверь, не превращается ли hybrid в двойную истину, и сформулируй один
canonical writer для каждой сущности.

Допускается `NO_GO` или reuse existing platform как рекомендация. Не выбирать
native build ради ощущения “полноценности”.

## 8. Обязательные решения D1–D16

Для каждого решения представь варианты, evidence, роли R1–R17, failure modes,
рекомендацию, compatibility, data/migration impact, rollback и точное approval value.

- D1 Product shape: registry, Q&A, forum, structured solutions или hybrid.
- D2 Task anchor: corpus/edition/work/subpart identity и поведение при новой edition.
- D3 Solution model: external link, native text, revisions, provenance, language,
  verification/quality status и accepted/canonical semantics.
- D4 Discussion model: один thread на task, несколько тематических threads,
  Q&A answers/comments, quoting, mentions, edit/delete history и archival rules.
- D5 Solo-first value: private links/notes/queue/owner-curated content без второго
  notes/list/progress writer и без зависимости от community activity.
- D6 Identity and onboarding: anonymous read, account creation, verification,
  pseudonymity, session security, consent and recovery.
- D7 Roles and authorization: learner, contributor, reviewer, moderator,
  corpus editor, owner; least privilege, separation of duties and audit.
- D8 Moderation and trust: report, hide/quarantine, edit lock, appeal, spam and
  vandalism handling, reputation/signals, reviewer conflicts and transparency.
- D9 External links: supported providers, URL normalization, permission state,
  redirect/malware/phishing controls, link health, previews and dead-link lifecycle.
- D10 Attachments: no attachments, constrained types, object storage, scanning,
  quotas, retention, orphan GC, legal takedown and backup. Server attachments
  remain deferred unless evidence explicitly justifies them.
- D11 Notifications: in-app/email/Telegram options, subscriptions, mention/reply
  rules, digest, quiet hours, unsubscribe, dedup, fan-out and abuse limits.
- D12 Search/discovery: task-local overview, duplicate detection, full-text search,
  language handling, ranking, pagination and bounded index strategy.
- D13 Privacy/safety/legal: public/private boundaries, PII minimization, minors,
  consent, export/delete, retention, copyright per solution/attachment and takedown.
- D14 Scale/reliability/cost: traffic/storage models, rate limits, queueing,
  caching, indexes, hot threads, backup/read-back, restore drill, observability,
  SLOs and cost ceilings at explicit scale bands.
- D15 UX/accessibility: task→solutions→thread hierarchy, Reader integration,
  mobile 380 px, RU/EN/HE, RTL, keyboard, screen reader, 200% reflow, loading,
  empty/error/offline/moderation states and no horizontal overflow.
- D16 Release slicing: smallest useful pilot, feature flags, allowlist, red tests,
  migration gate, production rollout, owner/community acceptance and rollback.

## 9. Truth, identity and lifecycle map

Для proposed entities `solution`, `solution_revision`, `external_resource`,
`thread`, `post/comment`, `subscription`, `notification`, `report`,
`moderation_action`, `attachment` и `task_anchor` определи — не обязательно
вводя каждую сущность:

- зачем она нужна и можно ли обойтись без неё;
- canonical writer и readers;
- stable ID и idempotency key;
- mutable/append-only/immutable части;
- task edition pinning;
- author/role/provenance;
- visibility and access policy;
- state machine;
- edit/delete/redaction/tombstone semantics;
- audit and appeal;
- export, backup, restore and retention;
- indexes/pagination/cursors;
- concurrency/conflict behavior;
- cache invalidation;
- abuse/rate/quota controls;
- relationship to public corpus, group corpus, learner truth and `review_log`.

Не объединяй в один флаг:

- “автор утверждает”;
- “эксперт проверил”;
- “сообщество считает полезным”;
- “модератор разрешил публикацию”;
- “это официальное решение корпуса”.

## 10. Security and abuse threat model

Составь threat model минимум для:

- spam/flood/duplicate posts;
- vandalism and mass edits/deletes;
- account takeover/session fixation/CSRF;
- IDOR и обход private/group access;
- privilege escalation и moderator abuse;
- unsafe links, open redirects, phishing and tracking URLs;
- malicious or oversized attachments, MIME confusion and decompression bombs;
- stored XSS/Markdown/LaTeX rendering hazards;
- scraping, enumeration and notification amplification;
- brigading, harassment and report abuse;
- PII leakage and accidental public posting;
- immutable-edition confusion and answers attached to the wrong task;
- backup corruption, partial restore and orphaned storage;
- race conditions in edit/moderate/restore flows.

Для каждой угрозы укажи prevention, detection, response, audit, recovery и
остаточный риск. Не считать “только один пользователь сейчас” защитой будущей
community architecture.

## 11. Масштабирование и экономика

Подготовь количественную модель минимум для 1 / 10 / 100 / 1k / 10k MAU и
отдельно burst на популярной задаче. Не придумывай точность без данных:
покажи assumptions и диапазоны.

Оцени:

- solutions, posts, reads and searches per day;
- notification fan-out;
- DB rows/index growth;
- text and attachment storage;
- bandwidth and cacheability;
- moderation queue and human workload;
- backup size/window, RPO/RTO and restore verification;
- rate/quota budgets;
- operational alerts and cost ceilings;
- когда SQLite/один process остаются разумными и какие measured triggers, а не
  абстрактный страх, требуют queue/object storage/search service/DB evolution.

Архитектура должна иметь простой bounded путь для одного человека и честный
evolution path; не строить распределённую систему заранее и не оставлять
неопределёнными критические migration triggers.

## 12. External research

Проведи актуальное исследование по официальным/primary источникам. Минимум:

- 3–5 зрелых Q&A/forum/discussion продуктов или протоколов;
- Google Drive и Telegram link/access/export ограничения для link-first модели;
- OWASP guidance по authorization, input handling, file upload и abuse controls;
- WCAG/WAI guidance для discussion forms, errors, dynamic notifications and RTL;
- применимые platform/provider limits, pricing and data portability.

Сравни переносимые product/architecture contracts, а не внешний вид и не
feature count. Все изменчивые факты датируй и снабжай прямыми ссылками на
официальные источники. Явно отделяй source fact, inference и рекомендацию.

## 13. Read-only production and user-data boundary

Если live production inspection действительно нужен:

- сначала сравни local HEAD, `origin/main`, served version, health, migrations,
  active physics edition and current disk warning;
- anonymous surface проверяй в чистом профиле;
- owner profile — только read-only;
- не создавать аккаунты, посты, links, groups, invites, subscriptions, reports,
  notifications или moderation records;
- не менять task/corpus/publication pointers;
- не проигрывать rollback drill повторно без отдельной необходимости;
- не менять progress, notes, bookmarks, `review_log`, consent or Telegram link;
- не вызывать платные providers;
- доказать before/after отсутствие owner-data writes, если owner profile открыт.

Automation, production anonymous, owner-live и physical-device/AT evidence
фиксировать раздельно.

## 14. Research artifacts

Создай папку:

`docs/research/physics-solutions-forum/2026-08-25/`

Минимальный комплект:

1. `README.md`
2. `CURRENT_CAPABILITY_AND_GAP_INVENTORY.md`
3. `USER_JOURNEYS_AND_JOBS.md`
4. `EXTERNAL_PRODUCT_AND_PLATFORM_RESEARCH.md`
5. `OPTIONS_AND_ROLE_SYNTHESIS.md`
6. `TRUTH_IDENTITY_LIFECYCLE_MAP.md`
7. `AUTH_ROLES_AND_MODERATION_MODEL.md`
8. `SECURITY_PRIVACY_AND_ABUSE_THREAT_MODEL.md`
9. `LINKS_ATTACHMENTS_AND_CONTENT_SAFETY.md`
10. `SCALE_COST_BACKUP_AND_OPERATIONS_MODEL.md`
11. `UX_ACCESSIBILITY_AND_SURFACE_MATRIX.md`
12. `FINDINGS.md`

Decision packet:

`docs/planning/PHYSICS_SOLUTIONS_FORUM_DECISION_PACKET_2026_08_25.md`

Каждый artifact должен указывать дату, source commit, branch, dirty-tree status,
метод evidence, inspected production version и чётко различать `CODE`,
`LOCAL_TEST`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`,
`OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`.

Значимые данные не оставлять только в terminal output или `.tmp`.

## 15. Implementation-ready boundary

Decision packet обязан подготовить, но не выполнять:

- recommended phased architecture;
- exact first-pilot scope и explicit non-goals;
- proposed schema/API/entities как options;
- one-writer/transaction/idempotency rules;
- auth/CSRF/access/rate/moderation contracts;
- exact likely file allowlist и files forbidden to touch;
- red-test-first matrix;
- migration rehearsal and rollback plan;
- backup/read-back/restore drill;
- version/SW/cache strategy;
- RU/EN/HE keys and mobile/a11y acceptance;
- production rollout stages: local fixture → temporary DB → isolated browser →
  owner-only/private pilot → bounded community pilot → wider availability;
- telemetry limited to content-free aggregates;
- measurable GO/NO_GO thresholds for native comments and later attachments.

Отдельно предложи минимальный value slice, который остаётся полезным при одном
пользователе, и критерии, при которых community features действительно нужны.

## 16. Жёсткий stop-list

До полного `APPROVE PHYSICS-SOLUTIONS-FORUM-R` запрещено:

- писать runtime/API/UI/CSS/i18n код;
- создавать или менять migration/schema;
- создавать discussion/solution/auth/moderation data;
- менять production configuration, flags or deployment;
- менять public corpus editions/pointers/assets;
- менять identity/session/consent/Telegram behavior;
- внедрять server attachments/object storage;
- добавлять external provider/SSO/LLM calls;
- переиспользовать notes, reading lists, group membership, `review_log` или
  publication events как скрытый forum writer;
- размораживать B9;
- считать owner attestation корпуса правами на user-generated content;
- проектировать только happy path или только текущего owner пользователя;
- коммитить или пушить research artifacts до owner review, если владелец явно
  не разрешил docs publication в этой новой сессии;
- исправлять найденные runtime defects внутри research-only goal: оформить
  отдельный blocker/evidence item.

## 17. Условие завершения новой research-сессии

В финале:

1. Дай ссылки на все artifacts и decision packet.
2. Перечисли подтверждённые факты, неизвестные и assumptions.
3. Представь D1–D16 с вариантами и однозначной рекомендацией.
4. Покажи solo-first product, community evolution path и scale/cost triggers.
5. Укажи, требуется ли migration; `NONE` не считать заранее.
6. Предложи smallest useful pilot, stop-list и rollback.
7. Дай точную approval-строку.
8. Подтверди:

`CODE=NONE`
`MIGRATION=NONE_EXECUTED`
`OWNER_DATA_WRITES=NONE`
`PRODUCTION_WRITES=NONE`
`DEPLOY=NONE`

9. Остановись и жди решения владельца.

Формат будущего approval:

APPROVE PHYSICS-SOLUTIONS-FORUM-R:
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
D11=...;
D12=...;
D13=...;
D14=...;
D15=...;
D16=...;
MIGRATION=...;
PILOT_SCOPE=...;
ATTACHMENTS=...;
ROLLBACK=...;
```
