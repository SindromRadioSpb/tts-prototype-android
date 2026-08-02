# P4 Import Center — owner-live packet template

> **Date opened:** 2026-08-02
> **Entry baseline:** `v3.11.296` / `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> **Entry browser schema:** `MIGRATIONS.length=47`
> **Status:** NOT IMPLEMENTED / OWNER-GATED / OWNER-LIVE NOT RUN
> **Implementation contract:**
> `docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`

This file is an evidence template. Empty fields and unchecked boxes are not PASS. Do not fill them
from synthetic automation when the row requires a real owner action or real iPhone evidence.

## 1. Authority ledger

- [ ] exact P4 implementation sentence received;
- [ ] exact file allowlist confirmed against dirty worktree;
- [ ] separate push/deploy authority received;
- [ ] any post-deploy cleanup authority recorded separately;
- [ ] no authority inferred for Option C, cloud sync, E2EE, Hermes, media transport or providers.

## 2. Implementation identity

| Field | Evidence |
|---|---|
| parent SHA | NOT RECORDED |
| scoped implementation SHA | NOT RECORDED |
| pushed remote main SHA | NOT RECORDED |
| APP_VERSION | NOT RECORDED |
| CACHE_VERSION | NOT RECORDED |
| browser migration count | expected 48 only after approved v48 |
| v48 shape | expected export-receipt table only; NOT VERIFIED |
| deploy timestamp | NOT RECORDED |

## 3. Automated gates

| Gate | Result |
|---|---|
| red-before-fix lifecycle truth | NOT RUN |
| v48 migration shape/index preservation | NOT RUN |
| Import Center pure/repository/UI suite | NOT RUN |
| P2 Portable Learning Package regression | NOT RUN |
| Media Package regression | NOT RUN |
| Material Revision regression | NOT RUN |
| full backup/text-card compatibility | NOT RUN |
| 100/500-material performance | NOT RUN |
| desktop RU browser | NOT RUN |
| 380 RU/LTR browser | NOT RUN |
| 380 HE/RTL browser | NOT RUN |
| accessibility/focus/text zoom | NOT RUN |
| provider/model requests | NOT RUN |
| page/console errors | NOT RUN |
| full `npm test` composition | NOT RUN |

## 4. Required browser assertions

- [ ] empty profile has a first-class Import Center entry;
- [ ] Library, text-card and Workspace aliases open the same material identity;
- [ ] continuity rail derives Source→Transcript→Table→Media→Backup correctly;
- [ ] conflict/repair/stale/missing states fail closed and show the next safe action;
- [ ] “package generated” differs from “owner confirmed saved”;
- [ ] compatibility JSON never satisfies canonical backup freshness;
- [ ] current revision changes make a prior confirmed backup visibly stale;
- [ ] missing media preserves transcript/table and study-without-media;
- [ ] exact SHA mismatch does not change the binding;
- [ ] technical error code is available under Details without dominating the UI;
- [ ] catalog remains usable with 100+ materials and bounded DOM;
- [ ] no horizontal overflow or covered final action at 380 px;
- [ ] RTL visual mirroring preserves semantic/assistive-tech order;
- [ ] no automatic provider/network action occurs.

## 5. Guided task evidence

### Use on another device

- [ ] scope choice understandable without knowing ZIP taxonomy;
- [ ] preflight explains whether media bytes travel;
- [ ] exact artifact hash and generated receipt recorded;
- [ ] owner-saved assertion requires explicit confirmation;
- [ ] Files/iCloud instructions lead to receiver import;
- [ ] receiver verify/dry-run/Apply/relink/playback sequence succeeds.

### Restore

- [ ] Full ZIP and `.lplp.zip` are routed to the correct existing importer;
- [ ] reuse/restore/repair/conflict are distinct before Apply;
- [ ] no-write dry-run inventory remains unchanged;
- [ ] Apply remains one SAVEPOINT with complete rollback.

### Relink

- [ ] expected SHA/type guidance shown before picker;
- [ ] exact local match activates source playback;
- [ ] mismatch and unsupported codec are different states;
- [ ] no filename/duration fallback.

### Recovery

- [ ] archived projection unarchives without re-import;
- [ ] binding-only mismatch repairs without source ZIP;
- [ ] missing projection rebuild uses exact verified source package;
- [ ] missing canonical object/conflict stops without guessed repair;
- [ ] UI never recommends repeat ASR when immutable history survives.

### Delete/export

- [ ] export-before-delete shown;
- [ ] referenced/reused objects preserved;
- [ ] reverse-reference plan blocks unsafe deletion;
- [ ] no dangling graph or receipt references;
- [ ] browser never claims to delete an external Files/iCloud artifact.

## 6. Real owner closure

Record without personal content:

| Field | Evidence |
|---|---|
| browser/device/surface | NOT RECORDED |
| real material class | NOT RECORDED |
| catalog material count | NOT RECORDED |
| storage estimate/persist state | NOT RECORDED |
| PC→iPhone wizard | NOT RUN |
| restore/relink/recovery | NOT RUN |
| cold reopen | NOT RUN |
| backup freshness after new revision | NOT RUN |
| RU/LTR | NOT RUN |
| HE/RTL | NOT RUN |
| provider calls | NOT RECORDED |
| page/console errors | NOT RECORDED |
| owner verdict | NOT RECORDED |

## 7. Production evidence

| Field | Evidence |
|---|---|
| actually served APP/CACHE | NOT RECORDED |
| required JS/CSS assets | NOT RECORDED |
| health | NOT RECORDED |
| DB/migrations | NOT RECORDED |
| disk before/after deploy | NOT RECORDED |
| mixed old/new cache observation | NOT RECORDED |

Do not label deployment complete until the public origin consistently serves both intended APP and
CACHE versions. Do not label owner-live complete from the CI browser alone.

## 8. Rollback evidence

- [ ] pre-P4 code can render the old Transfer & Backups surface over the same canon;
- [ ] v48 remains inert and is not dropped;
- [ ] P2 export/import/relink/recovery still works after rollback;
- [ ] no canonical material mutation was used to repair a derived UI status;
- [ ] external files were never tracked/deleted by path.

## 9. Final verdict

Current verdict: **NOT RUN**.

Allowed final labels:

- `AUTOMATED PASS / OWNER LIVE NOT RUN`;
- `PARTIAL OWNER PASS` with exact missing steps;
- `OWNER LIVE PASS` only after the real owner task matrix;
- `FAIL` with reproducible evidence and rollback state.
