# P4 Import Center — owner-live packet template

> **Date opened:** 2026-08-02
> **Entry baseline:** `v3.11.296` / `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> **Entry browser schema:** `MIGRATIONS.length=47`
> **Status:** AUTOMATED PASS / OWNER LIVE NOT RUN / PUSH AND DEPLOY NOT AUTHORIZED
> **Implementation contract:**
> `docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`

This file is an evidence template. Empty fields and unchecked boxes are not PASS. Do not fill them
from synthetic automation when the row requires a real owner action or real iPhone evidence.

## 1. Authority ledger

- [x] exact P4 implementation sentence received in the 2026-08-02 session;
- [x] exact file allowlist confirmed against dirty worktree; only §16 files are staged/committed;
- [ ] separate push/deploy authority received;
- [ ] any post-deploy cleanup authority recorded separately;
- [x] no authority inferred for Option C, cloud sync, E2EE, Hermes, media transport or providers.

## 2. Implementation identity

| Field | Evidence |
|---|---|
| parent SHA | `c8d89e403ee14471fc0446608c9d8d7d222096f9` |
| scoped implementation SHA | this packet's local scoped commit; exact SHA is reported in the session handoff |
| pushed remote main SHA | NOT RECORDED |
| APP_VERSION | `3.11.296` (unchanged; no release authority) |
| CACHE_VERSION | `v3.11.296` (unchanged; no release authority) |
| browser migration count | `48`, verified from live module and repository harness |
| v48 shape | only append-only `studio_portable_export_receipts` plus scope/artifact indexes |
| deploy timestamp | NOT RECORDED |

## 3. Automated gates

| Gate | Result |
|---|---|
| red-before-fix lifecycle truth | PASS; missing core/v48 and missing repository methods failed before implementation |
| v48 migration shape/index preservation | PASS; total 48, v45/v46/v47 indices unchanged |
| Import Center pure/repository/UI suite | PASS, 43/43 |
| P2 Portable Learning Package regression | PASS, 46/46 + fresh Chromium round-trip + 514/2800 performance |
| Media Package regression | PASS, 52/52 + fresh Chromium |
| Material Revision regression | PASS, 17/17 + fresh Chromium |
| full backup/text-card compatibility | PASS; v48 provenance round-trip and text-card 35/35 |
| 100/500-material performance | PASS: derivation 0.87/2.50 ms; first 30 render projection 0.06/0.01 ms; filter p95 0.12/0.34 ms |
| desktop RU browser | PASS; bounded 30-card DOM, no overflow |
| 380 RU/LTR browser | PASS; no overflow |
| 380 HE/RTL browser | PASS; semantic rail order preserved, no overflow |
| accessibility/focus/text zoom | PASS; focus trap, Escape, live regions, reduced motion, 200% zoom no overflow |
| provider/model requests | PASS; 0 in P4, P2, Media and Material browser gates |
| page/console errors | PASS; 0 in browser gates |
| full `npm test` composition | 763 total / 754 pass / same 9 known unrelated failures (baseline 748/739/9) |

## 4. Required browser assertions

- [x] empty profile has a first-class Import Center entry;
- [x] Library, text-card and Workspace aliases route into the same Import Center/P2 repository;
- [x] continuity rail derives Source→Transcript→Table→Media→Backup correctly;
- [x] conflict/repair/stale/missing states fail closed and show the next safe action;
- [x] “package generated” differs from “owner confirmed saved”;
- [x] compatibility JSON never satisfies canonical backup freshness;
- [x] current revision changes make a prior confirmed backup visibly stale;
- [x] missing media preserves transcript/table and study-without-media;
- [x] exact SHA mismatch does not change the binding;
- [x] technical error code is available under Details without dominating the UI;
- [x] catalog remains usable with 100+ materials and bounded DOM;
- [x] no horizontal overflow or covered final action at 380 px/200% text;
- [x] RTL visual mirroring preserves semantic/assistive-tech order;
- [x] no automatic provider/network action occurs.

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

Current verdict: **AUTOMATED PASS / OWNER LIVE NOT RUN**.

Local synthetic evidence is in `screenshots/p4-desktop-ru.png`, `screenshots/p4-380-ru.png`,
`screenshots/p4-380-ru-200pct.png` and `screenshots/p4-380-he.png`. It contains no owner content.
Production and real-iPhone rows intentionally remain empty because push/deploy and owner-live were
not authorized in this slice.

Allowed final labels:

- `AUTOMATED PASS / OWNER LIVE NOT RUN`;
- `PARTIAL OWNER PASS` with exact missing steps;
- `OWNER LIVE PASS` only after the real owner task matrix;
- `FAIL` with reproducible evidence and rollback state.
