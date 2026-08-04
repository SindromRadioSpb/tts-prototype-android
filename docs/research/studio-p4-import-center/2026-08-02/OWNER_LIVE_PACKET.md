# P4 Import Center — owner-live closure ledger

> **Date opened:** 2026-08-02
> **Entry baseline:** `v3.11.296` / `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> **Entry browser schema:** `MIGRATIONS.length=47`
> **Closure date:** 2026-08-04
> **Status:** **COMPLETE / PROD PASS / OWNER LIVE PASS**
> **Implementation contract:**
> `docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`

This file began as an evidence template and now records the closed result. Owner-only rows are
filled from the owner's explicit 2026-08-04 attestation; automated or live-read-only observations
are labelled separately and never substituted for a real owner action.

## 1. Authority ledger

- [x] exact P4 implementation sentence received in the 2026-08-02 session;
- [x] exact file allowlist confirmed against dirty worktree; only §16 files are staged/committed;
- [x] separate push/deploy authority received and exercised for the bounded P4 releases;
- [x] bounded Docker/disk cleanup authority was recorded and exercised separately;
- [x] no authority inferred for Option C, cloud sync, E2EE, Hermes, media transport or providers.

## 2. Implementation identity

| Field | Evidence |
|---|---|
| parent SHA | `c8d89e403ee14471fc0446608c9d8d7d222096f9` |
| scoped implementation SHA | `2d329085e7c800ea25b08349bcdb8d3206c1c63a` |
| pushed remote main SHA | `fef4d469b69101256b7268168c5f79f2ce82118e` (P4 plus owner-evidence fixes) |
| APP_VERSION | `3.11.300` |
| CACHE_VERSION | `v3.11.300` |
| browser migration count | `48`, verified from live module and repository harness |
| v48 shape | only append-only `studio_portable_export_receipts` plus scope/artifact indexes |
| deploy window | 2026-08-03; exact platform timestamp was not retained |

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
| owner-evidence action wiring | PASS after `526fc02d`; move-device, relink, diagnostics and Back actions work in production |
| canonical media row timing regression | PASS after `fef4d469`; 554/554 original-media replay controls, row→video seek and video→row follow verified on the real library |

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

- [x] scope choice understandable without knowing ZIP taxonomy;
- [x] preflight explains whether media bytes travel;
- [x] exact artifact hash and generated receipt recorded;
- [x] owner-saved assertion requires explicit confirmation;
- [x] Files/iCloud instructions lead to receiver import;
- [x] receiver verify/dry-run/Apply/relink/playback sequence succeeds.

### Restore

- [x] Full ZIP and `.lplp.zip` are routed to the correct existing importer;
- [x] reuse/restore/repair/conflict are distinct before Apply;
- [x] no-write dry-run inventory remains unchanged;
- [x] Apply remains one SAVEPOINT with complete rollback.

### Relink

- [x] expected SHA/type guidance shown before picker;
- [x] exact local match activates source playback;
- [x] mismatch and unsupported codec are different states;
- [x] no filename/duration fallback.

### Recovery

- [x] archived projection unarchives without re-import;
- [x] binding-only mismatch repairs without source ZIP;
- [x] missing projection rebuild uses exact verified source package;
- [x] missing canonical object/conflict stops without guessed repair;
- [x] UI never recommends repeat ASR when immutable history survives.

### Delete/export

- [x] export-before-delete shown;
- [x] referenced/reused objects preserved;
- [x] reverse-reference plan blocks unsafe deletion;
- [x] no dangling graph or receipt references;
- [x] browser never claims to delete an external Files/iCloud artifact.

## 6. Real owner closure

Record without personal content:

| Field | Evidence |
|---|---|
| browser/device/surface | production PC browser → real iPhone browser/PWA; exact browser builds were not retained |
| real material class | private media-backed learning material; no personal content recorded in this packet |
| catalog/material scale | real owner library; exact catalog count not retained; the inspected learning table had 554 rows |
| storage estimate/persist state | diagnostic UI reported 504.2 MB used / 10,744.2 MB available / persistence `false` during owner testing |
| PC→iPhone wizard | PASS — owner-attested 2026-08-04 |
| restore/relink/recovery | PASS — owner-attested 2026-08-04 |
| cold reopen | PASS — owner-attested 2026-08-04 |
| backup freshness / export-before-delete | PASS — owner gate and final ceremony completed successfully |
| RU/LTR | PASS in production owner flow |
| HE/RTL | PASS in automated fresh-browser gate; no separate HE owner ceremony claimed |
| provider calls | 0 for Import Center flows |
| page/console errors | 0 in the final production verification |
| owner verdict | **P4 COMPLETE / PROD PASS / OWNER LIVE PASS** |

## 7. Production evidence

| Field | Evidence |
|---|---|
| actually served APP/CACHE | `3.11.300` / `v3.11.300`; reconfirmed from public origin on 2026-08-04 |
| required JS/CSS assets | PASS; P4 core/repository/UI and v48 migration are present in the coherent served shell |
| health | `/healthz` 200 / `ok=true` on 2026-08-04 |
| DB/migrations | server DB and server migrations ready; browser schema is exactly 48 with receipt-only v48 |
| disk after deploy/cleanup | warning false; 79% in final P4 production verification, 74% at documentation closure recon |
| mixed old/new cache observation | converged; public client config, APP and Service Worker all report `3.11.300` |

Do not label deployment complete until the public origin consistently serves both intended APP and
CACHE versions. Do not label owner-live complete from the CI browser alone.

## 8. Rollback evidence

- [x] pre-P4 code can render the old Transfer & Backups surface over the same canon;
- [x] v48 remains inert and is not dropped;
- [x] P2 export/import/relink/recovery still works after rollback;
- [x] no canonical material mutation was used to repair a derived UI status;
- [x] external files were never tracked/deleted by path.

## 9. Final verdict

Current verdict: **P4 COMPLETE / PROD PASS / OWNER LIVE PASS**.

Local synthetic evidence is in `screenshots/p4-desktop-ru.png`, `screenshots/p4-380-ru.png`,
`screenshots/p4-380-ru-200pct.png` and `screenshots/p4-380-he.png`. It contains no owner content.
The owner subsequently authorized production, found two interaction regressions, and verified their
fixes in the real library. P4 shipped first as `v3.11.297`; entry routing, task action wiring and the
canonical media-row timing compatibility fix converged at `v3.11.300` / `fef4d469`. The final
PC→iPhone, recovery/relink, cold-open and export-before-delete ceremony and owner gate passed on
2026-08-04. Exact private content and browser build identifiers were intentionally not copied here.

Allowed final labels:

- `AUTOMATED PASS / OWNER LIVE NOT RUN`;
- `PARTIAL OWNER PASS` with exact missing steps;
- `OWNER LIVE PASS` only after the real owner task matrix;
- `FAIL` with reproducible evidence and rollback state.
