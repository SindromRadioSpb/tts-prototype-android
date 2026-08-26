# PHYSICS-SOLUTION-DOCUMENTS-R2 — production rollout evidence

Date: 2026-08-26
Program: `PHYSICS_SOLUTIONS_FORUM` / `PHYSICS-SOLUTION-DOCUMENTS-R2`
Authority: owner-approved production deploy, real 74-PDF import and public enablement
Implementation commit: `ed386ccf929da939cf3d24889554bc097632fd2e`
Branch: `main`; implementation commit pushed to `origin/main`
Dirty tree: `YES`; unrelated owner files were not staged or changed by the rollout
Evidence methods: `CODE`, `LOCAL_TEST`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `PRODUCTION_READ_ONLY`, `PRODUCTION_WRITE_OWNER_APPROVED`, `INFERENCE`
Status at this checkpoint: `DATA_IMPORTED_FLAG_PERSISTED_REDEPLOY_PENDING`

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

The persistent Coolify environment now contains `PHYSICS_TASK_RESOURCES_PUBLIC_READ=1` for production and preview. The currently active container remains default-off until the next target redeploy; therefore public UI/API acceptance is intentionally still pending at this checkpoint.

## 5. Remaining acceptance and rollback

Pending after the env-bearing redeploy:

1. repeated target-image/version/health probes;
2. anonymous sections `9`, task count `74`, resources `74`;
3. exact full/Range/ETag PDF checks;
4. fresh isolated browser plus real Chrome desktop/380/RU/HE/RTL/PDF-viewer checks;
5. post-import backup/read-back and production evidence closure.

Rollback remains: persistent flag `0` or removed -> redeploy -> anonymous routes return indistinguishable 404 -> preserve immutable rows/files and audit evidence. Corpus edition 2, publication pointers, learner truth, group truth and `review_log` are not rollback targets.
