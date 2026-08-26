# PHYSICS SOLUTION DOCUMENTS R2 — implementation packet

**Дата:** 2026-08-26
**Программа:** `PHYSICS_SOLUTIONS_FORUM` / `PHYSICS-SOLUTION-DOCUMENTS-R2`
**Режим:** owner-approved implementation, local/temp/isolated only
**Source commit:** `fd1aa7a99d76847c0248c49990eae995a859edc2`
**Branch at approval:** `main` (`HEAD == origin/main`)
**Dirty tree:** `YES`, содержит несвязанные owner-изменения; действует строгий allowlist
**Production inspected this session:** `NO`
**Evidence:** `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `OWNER_APPROVED`, `INFERENCE`

## 1. Owner authority received

Владелец утвердил packet `PHYSICS-SOLUTIONS-FORUM-R` со значениями D1–D16 и 2026-08-26 отдельно утвердил рекомендации R2: first-party immutable PDF resources, сохранение оригинального качества, section-first UX и bounded read-only доступ для будущих AI-агентов. Разрешена реализация после формализации.

Позднее 2026-08-26 владелец отдельно разрешил production rollout, публичное включение реального 74-PDF batch и подтвердил право на публикацию. Полный exact attestation зафиксирован в §14; технический PII review выполнен по всем 145 отрендеренным страницам. Это разрешение не открывает generic upload/UGC attachment surface и не регистрирует MCP capability.

## 2. Подтверждённая исходная модель

- `physics-year1-problems` опубликован как отдельная immutable edition 2, 74 работы, anonymous read/playback. `[CODE + prior PRODUCTION_ANONYMOUS evidence]`
- Группировка задач уже существует в canonical snapshot: `chapter`, `chapter_heading`, `task_number`; PNG оглавления — evidence, но не runtime truth. `[CODE + OWNER_REPORTED]`
- Девять разделов содержат соответственно `10, 3, 8, 14, 3, 12, 8, 5, 11` задач. `[CODE]`
- Подготовлено 74 PDF: 32 «условие + решение», 42 «только условие», 145 страниц, около 109.01 MiB. Почти все страницы raster-only; повторное lossy-сжатие ухудшит формулы и рукописный текст. `[LOCAL_TEST]`
- Canonical solution/thread/comment/moderation/attachment domain на текущем HEAD отсутствует. `[CODE]`
- Publication snapshot, learner truth, `review_log`, group truth и task resources остаются разными доменами с разными writers. `[CODE + OWNER_APPROVED]`

## 3. Принятое решение R2

### 3.1 Product shape

Первый полезный продукт — не форум и не ссылка на облачный диск. Это first-party **task resource library**:

`корпус → раздел → задача → опубликованные материалы`

Для каждой задачи Reader показывает:

- открыть условие в существующем структурированном Reader;
- открыть оригинальный PDF внутри продукта;
- честный тип: `CONDITION_ONLY` или `CONDITION_AND_SOLUTION`;
- качество и доступность: `ORIGINAL`, при необходимости `QUALITY_LIMITED`;
- неизменяемую привязку к `corpus_id + edition_id + public_work_id + snapshot_sha256`;
- источник, язык, редакцию ресурса и статус проверки без смешивания разных truth dimensions.

### 3.2 Почему оригиналы остаются без recompression

109 MiB на 74 задачи — bounded объём (примерно 1.47 MiB на задачу). Экономия десятков мегабайт не оправдывает необратимую потерю читаемости формул. Сервер хранит ровно исходные bytes и SHA-256. Оптимизация доставки выполняется HTTP Range, immutable caching и lazy open. Любая будущая производная версия (`OCR`, thumbnail, accessible text) — отдельная revision/derivative с собственной provenance и никогда не подменяет оригинал.

### 3.3 Почему first-party лучше ссылки для этого owner-curated batch

- один task anchor и одна политика доступности;
- отсутствие permission rot, tracking-переходов и vendor UI;
- стабильные Range/ETag URLs для браузера и агентов;
- проверяемые backup/read-back/restore;
- controlled extraction для будущего MCP без скачивания всего PDF в prompt.

External links остаются допустимым вторым resource kind для будущих материалов, но не заменяют owner-curated scan batch.

## 4. Canonical truth и one-writer contract

Новый writer: `physicsTaskResourceRepo` и только он.

| Truth | Writer | Правило |
|---|---|---|
| public corpus edition/work snapshot | `publicationRepo` | read-only для task-resource domain |
| task anchor | task-resource writer | immutable pin на конкретную edition/work/hash |
| resource logical identity | task-resource writer | stable ID, mutable только pointer/status через transaction |
| resource revision | task-resource writer | immutable bytes/hash/metadata, append-only |
| rights fact | task-resource writer | append-only, отдельное утверждение на каждый resource revision |
| lifecycle event | task-resource writer | append-only, idempotent operation receipt |
| learner progress/notes/bookmarks/review | существующие writers | новый домен не читает и не пишет их |
| future OCR/extraction | отдельный derivative writer | versioned non-canonical projection, не входит в первый pilot |

`chapter` не становится новой таблицей истины: section projection извлекается из pinned immutable work snapshots. PNG оглавления используется только для сверки порядка и названий.

## 5. Proposed implemented schema (additive migration 064)

- `physics_task_resources`: stable logical resource, visibility/status/current revision pointer.
- `physics_task_resource_revisions`: immutable revision pinned to corpus edition/work/snapshot; kind, content kind, language, title, storage path, bytes, SHA-256, MIME, quality and provenance.
- `physics_task_resource_rights_facts`: append-only `PUBLIC_READ`/`AGENT_READ` facts with basis and actor.
- `physics_task_resource_events`: append-only publication/withdraw/restore events.
- `physics_task_resource_idempotency`: request digest and immutable result.

No `solution`, `thread`, `comment`, `subscription`, `notification`, `report`, `attachment`, `OCR text` or personal queue tables are created.

## 6. API contract

Browser publication remains independently default-off:

- `PHYSICS_TASK_RESOURCES_PUBLIC_READ=1` exposes public metadata/file reads.

Anonymous browser:

- `GET /api/public-corpora/:slug/sections` — immutable section projection for the active edition.
- `GET /api/public-corpora/:slug/works/:workId/resources` — only approved/current resource revisions pinned to that exact active edition/work.
- `GET /api/public-corpora/:slug/resources/:resourceRevisionId/file` — same-origin PDF, `nosniff`, restrictive CSP/sandbox disposition, `ETag`, `Accept-Ranges`, immutable cache.

Publication is a controlled owner CLI only in the pilot. There is no generic upload endpoint and therefore no UGC attachment surface.

Future Agent Access (designed, **not implemented in R2**):

- `list_physics_task_resources` returns task/section/resource metadata and immutable identifiers;
- `get_physics_task_resource` returns metadata plus a same-origin immutable file URL and, only when a future reviewed derivative exists, a bounded page/text window;
- no whole-PDF base64, arbitrary filesystem path, OCR-on-demand, write, note/progress access, or automatic external model call.

Recon found that the current `reading.corpus.read` consent/scope is tied to the existing public-text contract and cannot silently authorize owner-attested scans. Registering these MCP tools therefore requires a separate owner-approved capability, consent copy, identity/scope migration and red tests. R2 only preserves stable immutable IDs, machine-readable HTTP metadata and an independent `AGENT_READ` rights fact; no MCP handler or agent-visible route is registered.

## 7. UX design plan

**Aesthetic:** «редакторский задачник»: спокойная книжная поверхность, номер главы как крупный навигационный маркер, тонкая цветная rail вместо dashboard-карточек.
**Palette:** существующие semantic tokens (`--bg-card`, `--bg-muted`, `--text-*`, `--border-soft`, `--accent`) — без нового независимого theme writer.
**Typography:** существующая типографика Room; заголовок на языке интерфейса, Hebrew source title отдельной строкой с `dir=rtl`.
**Layout:** компактный hero → сетка/список девяти chapter buttons с точным task count → выбранная глава → задачи → resource status.
**Signature detail:** вертикальный chapter index и тонкая «книжная закладка»-rail, которая остаётся понятной без цвета.
**Intentional risk:** на desktop глава получает крупный номер как типографический якорь; на 380 px он сворачивается в компактный label, чтобы не отнимать рабочую ширину.

Пользователь не получает сразу стену из 74 карточек. Поиск остаётся глобальным, а chapter selection — reversible filter. Ссылка на конкретную работу продолжает открывать её напрямую. Состояния: loading, empty chapter, resource unavailable, quality-limited, withdrawn, offline metadata, PDF open failure.

Acceptance: RU/EN/HE, RTL, keyboard, visible focus, semantic headings/buttons, `aria-current`, live result count, 380 px без horizontal overflow, 200% reflow, reduced motion, touch target 44 px.

## 8. Roles R1–R17

- **R1 Product:** solo value появляется с первой опубликованной задачей, без network effects.
- **R2 UX:** section-first progressive disclosure, прямой task deep link не ломается.
- **R3 Architecture:** additive bounded aggregate, no dual writer.
- **R4 Data:** immutable revision and hash; active edition pin is explicit.
- **R5 Security:** no upload API, no remote fetch/preview, strict path containment and MIME.
- **R6 Privacy:** public curated content only; no learner/account state on anonymous read.
- **R7 Auth:** CLI publication requires explicit owner identity; anonymous endpoints are read-only.
- **R8 Authorization:** public and agent rights are separate facts; default deny.
- **R9 Moderation:** owner can withdraw/restore pointer; old revision remains auditable.
- **R10 Reliability:** transactional pointer change, read-back hash, idempotency, Range delivery.
- **R11 Operations:** separate storage root, backup inventory, orphan detection, restore drill.
- **R12 One writer:** no reuse of publication events, notes, lists, groups or review log.
- **R13 Cost:** original 109 MiB is bounded; measured thresholds precede object storage/CDN.
- **R14 QA:** red-first migration/repo/API/UI/agent tests and temporary DB.
- **R15 Accessibility/i18n:** RU/EN/HE/RTL/380 px/200%/keyboard/screen-reader contracts.
- **R16 Legal/content:** separate exact rights/PII attestation before real import.
- **R17 Owner:** production import/deploy and wider agent exposure remain separate approvals.

## 9. Red-test-first matrix

1. Migration up/down/reapply; FK and triggers.
2. Reject revision whose edition/work/hash tuple does not exist in immutable publication truth.
3. Reject cross-edition silent rebind and mismatched source bytes/hash/MIME/size.
4. Idempotent retry returns same receipt; same key/different request fails.
5. Failure before/after pointer switch leaves no visible partial publication or orphan file.
6. Immutable revisions/rights/events reject update/delete.
7. Anonymous flag-off indistinguishability; flag-on only approved exact-edition resources.
8. File path containment, `nosniff`, Range, 304, invalid range 416.
9. Withdraw/restore changes visibility without mutating corpus or learner truth.
10. Section counts/order and no duplicate/lost tasks; task deep links preserved.
11. RU/EN/HE/RTL/mobile/keyboard/200% screenshots and DOM assertions.
12. No MCP registration under an existing scope; `AGENT_READ` remains independently default-deny and reserved for a later consented capability.
13. Backup inventory/hash/read-back and isolated restore with resource visibility parity.

## 10. Local implementation allowlist

- `migrations/064_physics_task_resources.sql`
- `migrations/down/064_physics_task_resources.sql`
- `db/physicsTaskResourceRepo.js`
- `scripts/premium/publish-physics-task-resources.js`
- `server.js`
- `public/js/library-ui.js`
- `public/js/public-corpus-adapter.js`
- `public/library.html`
- exact related i18n/version/cache files only if tests prove required
- new exact tests/smokes and this packet/evidence artifacts

Forbidden: public corpus edition/pointer/assets; production DB/config; learner, notes, progress, reading-list, group, `review_log`, Telegram, B9, generic attachment/upload and community discussion writers.

## 11. Rollout, rollback and measured evolution gates

Stages: synthetic fixture → temp DB migration → isolated server/browser → owner-only private import rehearsal → owner-reviewed real batch → bounded anonymous pilot → optional Agent Access pilot. This implementation session stops before the owner-reviewed real batch and production stages.

Rollback: flags off → stop CLI writer → preserve rows/files → verify corpus/learner truth unchanged. Down migration is rehearsal-only before any real data; after real data it is not a routine rollback.

Keep SQLite/single process while p95 resource metadata read <150 ms, file delivery is I/O-bound, write contention remains negligible, backup/read-back fits the maintenance window, and storage remains under the owner ceiling. Consider object storage/CDN after measured bandwidth or disk pressure; queue after durable background derivatives/notifications exist; search service only after bounded SQLite FTS fails measured latency/index budgets.

## 12. Explicit non-goals

Community writes, native text solutions, Q&A/comments, notifications, reputation, server UGC attachments, OCR-on-request, semantic/LLM search, agent writes, auto-solving, assignments/teacher authority and B9 are not implemented.

## 13. Implementation acceptance

The implementation is complete only when local tests, migration rehearsal, isolated browser/a11y evidence and rollback proof pass. The truthful session ledger is:

`OWNER_CONTENT_WRITES=NONE`
`LOCAL_OWNER_DB_TRANSIENT_SCHEMA_WRITE=ROLLED_BACK`
`LOCAL_DB_INTEGRITY=OK`
`BACKUP_RETENTION_SIDE_EFFECT=ONE_OLD_BACKUP_REMOVED`
`PRODUCTION_WRITES=NONE`
`PRODUCTION_MIGRATION=NONE`
`DEPLOY=NONE`

The transient local event occurred when `node db/migrate-cli.js --help` was used for CLI discovery: that CLI treats unknown arguments as a normal migration invocation. Migration 064 was immediately rolled back transactionally and removed from `schema_migrations`; all new tables were confirmed absent and `PRAGMA integrity_check=ok`. No owner content rows were created or modified. The migrator's normal retention cleanup removed one old local backup and left a new pre-migration backup at `data/backups/app.2026-08-26T00-15-37.pre-migrate.db`. This is recorded rather than being collapsed into a false `OWNER_DATA_WRITES=NONE` claim.

## 14. Owner attestation received for the real 74-PDF batch

```text
ATTEST PHYSICS-TASK-RESOURCES-BATCH-2026-08-26:
RIGHTS_BASIS=OWNER_ATTESTATION_PHYSICS_TASK_RESOURCES_PUBLICATION_RIGHTS_2026_08_26;
I_HAVE_THE_RIGHT_TO_PUBLISH=YES;
PII_REVIEW=PASS;
PUBLIC_READ=YES;
AGENT_READ=YES;
QUALITY_EXCEPTION_1_10=ACCEPT;
PRODUCTION_IMPORT=YES;
```

Evidence basis: owner messages on 2026-08-26; visual review of all 74 PDFs / 145 pages; prior accepted exact-byte recommendation. Production apply still requires successful target-commit deploy, backup, isolated rehearsal against a production DB snapshot, read-back verification and feature-flag rollback readiness.
