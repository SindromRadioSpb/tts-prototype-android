# PHYSICS SOLUTION DOCUMENTS R2 — implementation evidence

Дата: 2026-08-26
Программа: `PHYSICS_SOLUTIONS_FORUM` / `PHYSICS-SOLUTION-DOCUMENTS-R2`
Authority: owner approval `APPROVE PHYSICS-SOLUTIONS-FORUM-R` + owner approval перейти к реализации R2
Source commit: `fd1aa7a99d76847c0248c49990eae995a859edc2`
Branch: `main`; source `HEAD == origin/main` перед изменениями
Dirty tree: `YES` до начала; несвязанные owner-файлы не изменялись намеренно и не включаются в scope
Inspected production version: `NONE`
Evidence method: `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `OWNER_APPROVED`, `INFERENCE`

## 1. Outcome

Локально реализован default-off first-party pilot для owner-curated PDF материалов:

`публичный корпус → оглавление из 9 разделов → задача → оригинальный PDF`

Он не создаёт форум, UGC attachment surface, регистрацию сообщества или второго writer для notes/progress/review. Реальные 74 PDF не импортированы. Production migration, flags, deploy и production data не менялись.

Рекомендация по исходным PDF формализована и реализована как контракт: сохранять исходные bytes без recompression. 114,301,036 bytes для 74 документов — bounded объём; потеря читаемости формул опаснее экономии десятков мегабайт. Delivery оптимизирован lazy open, `Range`, `ETag`, immutable response и network-only Service Worker policy.

## 2. Реальный source inventory

`LOCAL_TEST`, read-only inventory двух owner-папок:

| Факт | Значение |
|---|---:|
| PDF | 74 |
| условие + решение | 32 |
| только условие | 42 |
| bytes | 114,301,036 |
| уникальные SHA-256 | 74 |
| максимальный файл | 3,452,310 bytes |
| страницы | 145 |
| PDF magic valid | 74/74 |

Задача 1.10 имеет `QUALITY_LIMITED` evidence: исходник остаётся без повторного lossy-сжатия, а реальный import требует отдельного выбора `ACCEPT` или `RESCAN`.

Оглавление `G:\Andasa\📘 Учебная. 1 год\Физика\Оглавление задачника.PNG` сверено визуально. Его SHA-256: `234AB9F87E3ADDC2AAE104DFDE6F097ADD31084EDD7AAC335D813F019766E67E`. Runtime membership/counts берутся не из PNG, а из immutable edition snapshots. Подтверждённые counts: `10, 3, 8, 14, 3, 12, 8, 5, 11`, сумма 74.

## 3. Implemented truth boundary

`CODE`:

- migration 064 создаёт отдельные `physics_task_resources`, immutable revisions, append-only rights facts/events и idempotency receipts;
- stable task anchor: `corpus_id + edition_id + public_work_id + work_snapshot_sha256`;
- silent rebind к новой edition запрещён запросами public projection;
- единственный writer — `physicsTaskResourceRepo`;
- source PDF копируется exact-byte в отдельный content-addressed storage path и немедленно hash-read-back проверяется;
- owner CLI default — inventory-only dry run; `--apply` невозможен без всех rights/PII/public/agent/quality полей;
- generic upload/API отсутствует;
- `PUBLIC_READ` и `AGENT_READ` — разные append-only facts;
- withdraw/restore меняет только current visibility pointer и оставляет revisions/audit;
- anonymous routes feature-flagged default-off и не требуют/не создают session, consent или learner state;
- public PDF выдаётся с `application/pdf`, `nosniff`, restrictive CSP/CORP/XFO, `ETag`, `Accept-Ranges`, корректными `200/206/304/416`;
- PDF route исключён из Service Worker cache, чтобы partial `206` не стал ложным full response и документы не заняли PWA storage quota;
- coordinated DB + immutable-file verifier проверяет SQLite integrity, каждую длину/SHA-256 и отсутствие orphan files после restore.

Новые community сущности `solution/thread/comment/report/moderation/notification/attachment` не вводились.

## 4. Section-first premium UX

`CODE + ISOLATED_AUTOMATION`:

- оглавление является первой рабочей поверхностью после corpus header, перед optional sync/share chrome;
- 9 разделов и «Все задачи» показаны editorial table-of-contents, а не стеной карточек;
- каждая кнопка показывает локализованное название и точное количество задач;
- выбор reversible, `aria-pressed`, остаётся глобальный поиск; глава 4 показывает ровно 14 работ `4.x`;
- task cards используют semantic task number, resource rail честно разделяет `CONDITION_ONLY` и `CONDITION_AND_SOLUTION`;
- PDF открывается в same-product modal viewer, остаётся отдельная `noopener/no-referrer` fallback-ссылка;
- Reader получает exact-work resource rail;
- RU/EN/HE, RTL, keyboard button semantics, focus, reduced motion, 380 px, touch targets и no-overflow входят в contract;
- в ходе visual review исправлено: `role=listitem` был удалён с chapter buttons, чтобы они не теряли нативную button semantics;
- русские counts имеют формы `1 задача / 3 задачи / 10 задач / 74 задачи`.

Durable screenshots:

- [RU desktop](implementation/screenshots/physics-sections-ru-desktop.png)
- [RU 380 px](implementation/screenshots/physics-sections-ru-380.png)
- [HE RTL 380 px](implementation/screenshots/physics-sections-he-rtl-380.png)
- [PDF viewer RU 380 px](implementation/screenshots/physics-resource-viewer-ru-380.png)

## 5. AI-agent / MCP boundary

Взаимодействие с агентами имеет долгосрочную ценность: агент сможет перечислить доступные материалы по immutable task ID, получить конкретную revision, затем работать с ограниченной page/text derivative без неустойчивого screen scraping, повторного распознавания всего корпуса и путаницы редакций. Это создаёт основу для объяснения решения, сравнения метода, поиска похожих задач и provenance-aware tutoring.

В R2 MCP tool **не зарегистрирован**. `CODE recon` показал, что существующий `reading.corpus.read` consent/scope описывает другой public-text contract и не может молча разрешить owner-attested scans. Правильный следующий slice требует отдельного capability name, consent copy, identity/scope migration, revocation, bounded output и red tests. Сейчас реализованы только необходимые предпосылки: stable IDs, machine-readable public metadata/file URLs и независимый default-deny `AGENT_READ` fact.

Это защищает длинное плечо от двух ошибок: публичный браузерный доступ не становится автоматическим правом стороннего агента, а OCR/agent projections не становятся второй canonical truth. Будущий OCR должен быть versioned derivative с page coordinates, engine/version, confidence и provenance; оригинальный PDF остаётся canonical evidence.

## 6. Verification ledger

| Gate | Evidence | Result |
|---|---|---|
| migration 064 up/down/reapply | `LOCAL_TEST` | PASS |
| fresh empty temp DB migration runner through 064 | `LOCAL_TEST` | PASS, `integrity=ok` |
| exact bytes/hash/anchor/idempotency/immutability/fault cleanup | 8 domain tests | PASS |
| backup copy + isolated restore manifest parity | domain test | PASS |
| anonymous HTTP flag off/on, sections/index/work/file | isolated server | PASS |
| full PDF, `206` normal/suffix, `304`, invalid `416`, missing `404` | 10 HTTP checks | PASS |
| publication/physics/Room/cache regression set | Node test runner | 61/61 PASS |
| locale symmetry/cache/version lock | i18n smoke | 233/233 PASS |
| isolated anonymous browser | Playwright | 7/7 PASS, 4 screenshots |
| 380 px horizontal overflow | `scrollWidth == clientWidth == 380` | PASS |
| chapter touch targets | minimum 51.25 px | PASS |
| HE direction/arrow | `lang=he`, `dir=rtl`, mirrored transform | PASS |
| syntax | changed JS/server/scripts | PASS |
| whitespace | `git diff --check` | PASS (line-ending warnings only) |

One unrelated pre-existing test file, `tests/roomLibrarySurfaceIa.test.js`, remains 4/6: its D1 extractor searches the nonexistent literal `async function injectBenHomeRails`, while both source HEAD and current code define `function injectBenHomeRails`; its D5 exact `requestAnimationFrame(...)` expectation also does not match source HEAD. This was reproduced against `git show HEAD:public/js/library-ui.js`, is outside R2, and was not changed under this implementation authority.

## 7. Local incident and rollback truth

During CLI discovery, `node db/migrate-cli.js --help` treated `--help` as a normal migration invocation and transiently applied migration 064 to local `data/app.db`. Immediate response:

1. confirmed all new resource tables were empty;
2. applied down migration and removed version 64 from `schema_migrations` transactionally;
3. re-opened local DB read-only and confirmed `migration64=false`, resource tables `[]`, `PRAGMA integrity_check=ok`;
4. retained new pre-migration recovery backup `data/backups/app.2026-08-26T00-15-37.pre-migrate.db` (18,079,744 bytes).

The migrator's retention cleanup removed one older local backup. No owner content row or production state was created/modified. This side effect prevents the broader claim `OWNER_DATA_WRITES=NONE`; the exact ledger below is authoritative.

## 8. Gates before real batch or production

The owner supplied rollout authority and the exact batch attestation on 2026-08-26. Production migration, real import and the public-read flag are now authorized after backup and isolated rehearsal. MCP registration remains a separate later program and is not authorized by browser or `AGENT_READ` rights.

Required attestation:

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

`PII_REVIEW=PASS` is based on a fresh rendered-page inspection of all 145 pages. No names, contact details, account identifiers or other personal data were found. Dates, task numbers, lesson numbers and physics content are not treated as personal identifiers. Task 1.10 remains visibly labelled `QUALITY_LIMITED`; the original bytes are preserved.

Rollback for the implemented default-off slice: flags off → stop controlled writer → preserve rows/files → run DB+file verifier → corpus/publication and learner truth remain unchanged. Down migration is only for empty rehearsal DBs, never routine rollback after real import.

## 9. Final state

`CODE=LOCAL_IMPLEMENTATION_COMPLETE`
`REAL_PDF_IMPORT=NONE`
`MCP_TOOL_REGISTRATION=NONE`
`OWNER_CONTENT_WRITES=NONE`
`LOCAL_OWNER_DB_TRANSIENT_SCHEMA_WRITE=ROLLED_BACK`
`LOCAL_DB_INTEGRITY=OK`
`BACKUP_RETENTION_SIDE_EFFECT=ONE_OLD_BACKUP_REMOVED`
`PRODUCTION_MIGRATION=NONE`
`PRODUCTION_WRITES=NONE`
`DEPLOY=NONE`
`COMMIT=NONE`
`PUSH=NONE`
