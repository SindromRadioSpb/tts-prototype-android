# PHYSICS-SOLUTION-DOCUMENTS-R2 — production rollout evidence

Date: 2026-08-26
Program: `PHYSICS_SOLUTIONS_FORUM` / `PHYSICS-SOLUTION-DOCUMENTS-R2`
Authority: owner-approved production deploy, real 74-PDF import and public enablement
Implementation commit: `ed386ccf929da939cf3d24889554bc097632fd2e`
Production checkpoint commit: `85a905298565d660ea2793e5b36d9aebaa0edc9a`
PDF viewer correction commit: `e845e32bef7dd78a2164226b1656cd4bfbc693b9`
Documentation checkpoint commit before this update: `2c4360348e07ac1637f119c620f5edb935108f22`
Branch: `main`; all three scoped commits pushed to `origin/main`
Dirty tree: `YES`; unrelated owner files were not staged or changed by the rollout
Evidence methods: `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `PRODUCTION_READ_ONLY`, `PRODUCTION_WRITE_OWNER_APPROVED`, `INFERENCE`
Inspected production version: `3.11.440`
Status: `CLOSED_PRODUCTION_ACCEPTED`

Owner acceptance: `OWNER_REPORTED` on 2026-08-26 — “Тестирование корпуса «Физика — задачник, 1 год» прошло успешно.” This closes the owner usability gate for the tested corpus. It does not reclassify unperformed physical-device or assistive-technology rows as tested.

## 1. Owner attestation and content review

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

`PII_REVIEW=PASS` follows a rendered visual inspection of all 74 PDFs / 145 pages. No names, contact details, account identifiers or other personal data were found. The 114,301,036 source bytes remain exact; no recompression was performed. Task 1.10 is explicitly `QUALITY_LIMITED`.

## 2. Preflight and implementation deploy

- local source `HEAD == origin/main == fd1aa7a99d76847c0248c49990eae995a859edc2` before the scoped commit;
- pre-deploy production: version `3.11.437`, health `ok`, DB ready, migrations ready, disk warning false;
- commit `ed386ccf` contained exactly 40 allowlisted physics implementation/research files;
- target container served `3.11.439`; health, DB and migration readiness stayed green;
- migration `064_physics_task_resources` was present with all five expected tables;
- with the flag absent, both new anonymous metadata routes returned indistinguishable `404 PUBLIC_MATERIAL_NOT_FOUND`.

## 3. Backup and isolated production-snapshot rehearsal

The normal production backup completed before import:

- artifact: `app-data-20260826-011054.tar.gz`;
- bytes: `942943033`;
- archive SHA-256: `afb6f87bca58eaed089c9e216739eba2d6d3af54598691b0dd82694bf3391fc8`;
- online SQLite snapshot bytes: `490442752`;
- online SQLite snapshot SHA-256: `3a91b94eb129fae4a1cc5930f903553f020562b2f0538f61191ec3686f6d4968`.

The source ZIP transferred to the host matched local/remote SHA-256 `d6500a9a592ea79bfeeaff435a685b656f78de7a949a2e7fd2f50f77ebf4f594`. Extraction produced exactly 32 condition+solution PDFs and 42 condition-only PDFs, totaling 114,301,036 bytes.

The first Node backup-handle attempt failed closed with `SQLITE_BUSY` during handle close; no importer ran and no production row changed. The incomplete temporary snapshot was removed only from the validated rehearsal directory. A consistent `VACUUM INTO` snapshot then passed `PRAGMA integrity_check=ok` and contained migration 064.

Real-batch rehearsal against that snapshot passed:

- 74 resources / 74 revisions / 148 independent rights facts / 74 events / 74 idempotency receipts;
- aggregate source SHA-256: `7043143a7e190a3480b5bdd6773bb0fdc145ea3b49b6bae48fc14aea893c78cb`;
- coordinated DB/file read-back: 74 revisions, 114,301,036 bytes, no missing/orphan file, DB integrity `ok`;
- rehearsal manifest SHA-256: `ae18d2b83bcb00ab3147f5d27e76a79df3252bd9e93101c9904ea5eb66290953`;
- importer proved learner/private/review fingerprint unchanged.

## 4. Production import checkpoint

The controlled owner CLI imported the real batch into the separate task-resource aggregate:

- 74 published resources and 74 immutable revisions;
- 32 `CONDITION_AND_SOLUTION`, 42 `CONDITION_ONLY`;
- 74 `PUBLIC_READ=YES` and 74 separately stored `AGENT_READ=YES` facts;
- exact bytes `114301036`; aggregate SHA-256 identical to rehearsal;
- live read-back manifest: `eae4bf6ef1c851a3b4381cae0c9b4792a7e23994724fc511e6512c767e814933`;
- SQLite integrity `ok`; importer fingerprint reported learner/private/review truth unchanged.

The persistent Coolify environment contains `PHYSICS_TASK_RESOURCES_PUBLIC_READ=1` for production and preview. An env-bearing redeploy activated anonymous read on version `3.11.439`; a later viewport correction deployed as version `3.11.440`. No corpus pointer, learner truth, group truth or `review_log` row was used as a task-resource writer.

## 5. Public API and target-version acceptance

Five consecutive no-cache probes returned only version `3.11.440` with `health.ok=true`, DB ready, migrations ready, disk `79%` and `disk_warn=false`.

Anonymous read-back returned:

- 9 sections with task counts `10, 3, 8, 14, 3, 12, 8, 5, 11`, total 74;
- 74 task resources: 32 condition+solution and 42 condition-only;
- no `Set-Cookie` on sections or resource-index reads;
- first PDF: `200`, 2,262,821 bytes, SHA-256 `1f294e463d312be114f7ef14267e9aae5565c38efc987c725c32275f6265fda0`, `application/pdf`, `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, ETag present;
- byte range `0-4` returned `206` and `%PDF-`; `If-None-Match` returned `304`; invalid range returned `416`.

## 6. Real-browser UX acceptance and discovered defect

`PRODUCTION_ANONYMOUS` real Chrome used a fresh isolated context, not the owner profile. Desktop `1440x1000`, mobile `380x844`, RU and HE/RTL all exposed the section-first navigation with 10 controls (All + 9 sections), localized counts, no horizontal overflow and version `3.11.440`.

The first production Chrome pass found that a normal PDF without a quality warning occupied only a 150 px iframe strip. Root cause: a three-row CSS grid had only two children, so the iframe landed in the `auto` row and the empty third row consumed the remaining height. Acceptance stopped. A red browser assertion reproduced `frameHeight=150`; commit `e845e32b` replaced the variable-child grid with a flex column and added exact viewport assertions.

After redeploy, the same real PDF on `380x844` measured:

- overlay/viewer: 844 px high;
- iframe: 774.75 px high below the 69.25 px header;
- `scrollWidth == clientWidth == 380`;
- semantic modal dialog, labelled iframe and Escape close with focus restored to the originating resource button.

Desktop measured a centered `1120x920` viewer with an 848.75 px PDF frame. Visual inspection confirmed the printed condition and handwritten solution use the available screen height and scroll naturally.

Durable screenshots:

- [RU desktop section navigation](implementation/production/screenshots/physics-sections-ru-desktop-production.png)
- [RU 380 px section navigation](implementation/production/screenshots/physics-sections-ru-380-production.png)
- [HE/RTL 380 px section navigation](implementation/production/screenshots/physics-sections-he-rtl-380-production.png)
- [RU 380 px full-height PDF viewer](implementation/production/screenshots/physics-resource-viewer-ru-380-production.png)

The existing isolated local Playwright acceptance is 7/7. A separate fresh headless production harness did not leave the generic Library loading state before issuing public-corpus requests; it was removed and is not counted as production evidence. Real Chrome, public API probes and local isolated automation remain explicitly separate.

## 7. Post-import backup and isolated restore read-back

The normal post-import backup completed successfully:

- artifact: `app-data-20260826-014914.tar.gz`;
- bytes: `1,056,635,541`;
- archive SHA-256: `c2ed18cac67a192ff704bcad5c31cfd120d48f76cc8eefbbc0d06f8dc89fa721`;
- online SQLite snapshot bytes: `490,442,752`;
- SQLite snapshot SHA-256: `498d7db3c85175d267918fd5f99c0b48893ecc60a6929e2d70a0355e32aa597f`.

The archive was selectively extracted into a validated `mktemp` directory and mounted into a temporary container; the production volume was never mounted. Because the snapshot uses WAL journal mode, SQLite needed permission to create temporary sidecar files next to the restored copy even though the verifier itself uses `SQLITE_OPEN_READONLY`. After granting that permission only inside the disposable restore directory, verification passed:

- DB integrity `ok`;
- 74 revisions;
- exact resource bytes `114,301,036`;
- no missing or orphaned resource file;
- restored manifest SHA-256 `eae4bf6ef1c851a3b4381cae0c9b4792a7e23994724fc511e6512c767e814933`, equal to live read-back.

The temporary restore directory was deleted after verification. At the rollout checkpoint no backup archive had been deleted; the subsequent owner-approved bounded retention cleanup is recorded in §8.1.

## 8. Disk recovery and rollback

Build plus the new backup temporarily raised disk use to 86%/warning. The rollout removed only rebuildable artifacts:

- Docker builder cache: 967.4 MB;
- three explicitly identified unused application images with `CONTAINERS=0` (`ed386ccf`, `fd1aa7a`, `c00a4ac`).

The accepted `e845e32b` runtime image and previous `85a90529` rollback image were preserved through cleanup. Disk returned to 79%, warning false. Removed images/cache are recoverable by rebuilding the corresponding git commits; no production corpus file or backup was removed.

Rollback remains: persistent flag `0` or removed -> redeploy -> anonymous routes return indistinguishable 404 -> preserve immutable rows/files and audit evidence. Corpus edition 2, publication pointers, learner truth, group truth and `review_log` are not rollback targets.

### 8.1 Owner-approved backup retention cleanup

`PRODUCTION_READ_ONLY` preflight established that the normal job creates an online SQLite backup daily at 03:00 and was configured for 14 rolling days. The backup root contained 19 archives and host disk use was 76%.

`PRODUCTION_WRITE_OWNER_APPROVED` on 2026-08-26:

- rolling daily retention changed from 14 to 7 days; a root-owned mode-0600 pre-change configuration copy was retained for rollback;
- a mode-0700 milestone namespace was created inside the existing backup area;
- four manual/milestone archives were preserved there: `app-data-20260820-172727.tar.gz`, `app-data-20260825-014147.tar.gz`, Physics pre-import `app-data-20260826-011054.tar.gz` and Physics post-import `app-data-20260826-014914.tar.gz`;
- only nine confirmed scheduled 03:00 archives, 2026-08-11 through 2026-08-19 inclusive, were deleted;
- exact removed bytes: `6,710,191,713`;
- six rolling daily archives remained in the normal root (2026-08-20 through 2026-08-25), in addition to the four milestones;
- the moved Physics archive SHA-256 values remained `afb6f87bca58eaed089c9e216739eba2d6d3af54598691b0dd82694bf3391fc8` and `c2ed18cac67a192ff704bcad5c31cfd120d48f76cc8eefbbc0d06f8dc89fa721`;
- host `df` fell to 59%; the application health sample reported 60%, `disk_warn=false`, with health, DB and migrations ready.

The deleted rolling copies are not recoverable from this server. The four named milestones and the new seven-day rolling policy remain the recovery basis. No production corpus data, database row, application image or milestone backup was removed by this cleanup.

## 9. Final ledger

```text
CODE=IMPLEMENTED_AND_DEPLOYED
MIGRATION=064_APPLIED
OWNER_DATA_WRITES=74_TASK_RESOURCES_74_REVISIONS_148_RIGHTS_FACTS_74_EVENTS_74_IDEMPOTENCY_RECEIPTS
LEARNER_OR_REVIEW_WRITES=NONE
PRODUCTION_WRITES=OWNER_APPROVED_TASK_RESOURCE_IMPORT_AND_FLAG_ONLY
DEPLOY=3.11.440
PUBLIC_PDF_READ=ENABLED
COMMUNITY_WRITES=NONE
ATTACHMENTS_GENERIC_UPLOAD=NONE
MCP_REGISTRATION=NONE
OWNER_CORPUS_ACCEPTANCE=PASS_OWNER_REPORTED_2026_08_26
BACKUP_RETENTION=7_DAILY_PLUS_4_MILESTONES
BACKUP_BYTES_REMOVED=6710191713
```
