# Studio Ingest P4 — Import Center implementation packet

> **Date:** 2026-08-02
> **Status:** **COMPLETE / PROD PASS / OWNER LIVE PASS** (closed 2026-08-04)
> **Entry production baseline:** `v3.11.296` /
> `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> **Browser schema baseline:** `MIGRATIONS.length=47`
> **Dependencies:** P2 Portable Learning Package v2 COMPLETE / OWNER LIVE PASS; P3 real iPhone
> manual continuity COMPLETE / OWNER-ATTESTED PASS
> **First P4 release:** `v3.11.297`; **closure release:** `v3.11.300` /
> `fef4d469b69101256b7268168c5f79f2ce82118e`; **browser schema:** `MIGRATIONS.length=48`
> **Scope:** browser-local Import Center UX, derived lifecycle inventory, explicit task wizards,
> honest storage/media/backup diagnostics and one additive export-receipt migration
> **Owner-live template:**
> `docs/research/studio-p4-import-center/2026-08-02/OWNER_LIVE_PACKET.md`
> **Historical authority boundary:** this packet did not itself authorize implementation, commit,
> push, deploy or production mutation; the owner supplied those authorities separately.

P4 is now closed. The complete automated, production and owner-attested evidence ledger is
`docs/research/studio-p4-import-center/2026-08-02/OWNER_LIVE_PACKET.md`. Closing P4 does not
authorize P5/P6 sync, P7/P8 Hermes, L2/L4/L5/L6 or any provider/server change.

## 0. Decision in one screen

P4 does not create a new importer or a second artifact registry. It turns the already shipped
portability capabilities into one comprehensible product surface:

```text
existing canonical material / captions / tables / mappings / media / import receipts
                              │
                              ▼
                    pure derived lifecycle model
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
           material catalog  guided tasks  diagnostics/help
                 │            │            │
                 └────────────┴────────────┘
                              │
                              ▼
                    existing P2/P3 operations
```

One additive v48 table records only export-generation and owner-saved assertions. It never stores
caption/table content, never becomes package truth and never claims a browser download exists after
the user has removed it.

P4's single user-facing job is:

> **Show what learning material exists, where its usable parts are, and the next safe action.**

## 1. Frozen dependencies and authority

P4 consumes, but must not redefine:

- immutable `studio_caption_revisions` and track roles;
- immutable `studio_table_revisions`, row versions and exact cue↔row mapping;
- `studio_learning_materials` heads and field-level authority;
- `studio_media_packages` identity by SHA-256 and OPFS path;
- `studio_text_media_bindings` exact revision/hash passport;
- pure P2 Artifact Graph and schema-v2 manifest;
- `studio_portable_import_receipts`, dry-run, SAVEPOINT Apply, Undo and recovery semantics;
- rebuildable `texts`/`sentences` compatibility projection;
- full-library ZIP and per-text ZIP integration;
- zero implicit provider fallback and zero automatic model calls.

Option C — material-owned identity independent of `texts` — remains a future architecture option.
P4 must not smuggle it into a UI slice or rename local UUIDs into portable identity.

## 2. Grounded current-state recon

### Existing product surface

`public/js/studio-portable-learning-package.js` already provides one modal with Library, One
material, Import and History views. It already exposes:

- empty-profile global import entry;
- full-library ZIP export/restore and compatibility JSON;
- snapshot/archive export for one material;
- strict ZIP verify, no-write dry-run and explicit Apply;
- exact-SHA relink;
- durable receipt history, Undo, archive restore and exact-binding repair;
- embedded P2 archives in full-library and text-card ZIPs;
- contextual format help.

`public/index.html` already routes three contexts into this surface:

- Library-level “Перенос и резервные копии”;
- global “Перенос / восстановление” entry visible without an active material;
- active Workspace/text-card “Переносимый пакет” / `openForText(textId)`.

### Canonical repository anchors

- `public/js/portable-learning-package-repository.js` — material inventory, import receipts,
  recovery, exact media lookup, snapshots and reverse-reference checks;
- `public/js/media-package-repository.js` — package/track/revision/binding/media truth;
- `public/js/material-revision-repository.js` — table head/history and exact revision binding;
- `public/db/local-db.js` — compatibility Library data and full backup import/export;
- `public/db/migrations.js` — current v47 receipt-only migration;
- `public/js/studio-media-package.js` — Workspace/relink/source-player activation.

### Real remaining gap

The operations work, but users still have to infer lifecycle state from separate tabs and entry
points. There is no material catalog that jointly explains:

- local canonical data versus rebuildable card projection;
- exact media present/missing/mismatched/unsupported;
- current versus stale table head;
- package generated versus confirmed saved elsewhere;
- imported receipt health and safe recovery action;
- which action continues correction, study, transfer or recovery.

P4 solves this presentation/orchestration gap. It does not replace the repositories.

## 3. UX direction

### Subject, audience and signature

The subject is a learner's local study material moving between PC and iPhone. The audience should
not need to understand OPFS, graph nodes or revision IDs. The signature interaction is a compact
**continuity rail**: Source → Transcript → Table → Media → Backup/device. Every stage is derived
from real state and opens the exact relevant task.

### Visual system

- verified teal `#0f766e` — complete and exact;
- local mist `#eef7f6` — present on this device;
- ink `#0f172a` — primary content;
- slate `#64748b` — neutral metadata;
- attention amber `#b45309` — usable but incomplete/stale;
- recovery red `#b42318` — blocked/conflict/destructive confirmation only.

Use the existing product typography and Hebrew font stack; do not introduce a new download. The
continuity rail, not decorative cards or gradients, is the one intentional visual signature.
Motion is limited to one stage transition after a completed task and must respect reduced motion.

### Desktop information architecture

```text
┌ Import Center ──────────────────────────────────────────────────────┐
│ Local · verified · no automatic provider calls       Storage 62%   │
│ [Overview] [Materials] [Tasks] [History] [Reference]                │
├─────────────────────────────────────────────────────────────────────┤
│ Needs attention (2)              Ready to study (18)                │
│                                                                   │
│ Material title · last opened                                      │
│ Source ✓ ─ Transcript v4 ✓ ─ Table v2 ✓ ─ Media on device ─ Backup !│
│ Continue study     Use on another device     More…                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 380 px mobile

```text
Import Center                 ×
Storage: enough · local only
[Overview] [Materials] [Tasks]

Material title
Source ✓  Transcript v4 ✓
Table v2 ✓ Media ✓ Backup !

[Continue study]
[Use on another device]
[More actions]
```

No horizontal rail scrolling is required to understand status. At 380 px stages wrap into two
semantic rows in LTR and mirror in RTL while retaining logical Source→Backup order for assistive
technology.

## 4. One surface, multiple intent aliases

All existing entry points remain discoverable but call the same API with an explicit intent:

```js
StudioPortableLearningPackage.open({
  view: 'overview|materials|tasks|history|reference',
  textId,
  materialId,
  intent: 'move-device|restore|relink|recover|backup|inspect'
})
```

Rules:

1. Empty profile opens Overview with Import and Restore as primary actions.
2. Library-level entry opens the complete catalog, never a separate legacy export modal.
3. Text-card “Share” opens the same material drawer with compatibility formats clearly secondary.
4. Workspace entry opens the exact material and current lifecycle stage.
5. Existing globals remain compatibility aliases during P4; no duplicated business logic.
6. Old JSON/ZIP buttons may remain reachable, but every label explains scope and lossiness.

## 5. Derived lifecycle model

Create pure `ImportCenterCore.buildCatalog(inventory, exportReceipts, capabilities, now)`.
It performs no SQL, OPFS, network, provider or DOM access.

### Required derived fields per material

| Field | Values | Canonical source |
|---|---|---|
| `projection_state` | present / archived / missing-rebuildable / conflict | material + text projection + receipt integrity |
| `caption_state` | raw-only / corrected-current / draft / missing | tracks/revisions/workspace |
| `table_state` | current / stale / conflict / missing | material head + exact base revision |
| `mapping_state` | exact / partial / zero / invalid | immutable table mapping |
| `media_state` | present / missing / sha-mismatch / unsupported-codec / unverified | package + OPFS + capability probe |
| `import_state` | native / imported-complete / repairable / archived / conflict | durable import receipt |
| `backup_state` | none / generated-unconfirmed / current / stale | v48 export events + current state hash |
| `continuity_state` | ready / needs-media / needs-backup / needs-recovery / blocked | pure priority rules below |
| `next_action` | exact action ID | pure priority rules below |

### Priority rules

1. conflict or invalid binding → inspect/recover; never guess;
2. missing rebuildable projection → restore/recover;
3. exact canon present but media missing → relink, while text/table remain usable;
4. table stale → create a new explicit table revision;
5. no confirmed current backup → create/confirm backup;
6. otherwise → continue study.

These are presentation decisions, not mutation authority. No action runs until the user chooses it.

### Asserted versus derived facts

- package hashes, revision heads, exact mapping and media presence are derived facts;
- “I saved this package in Files/iCloud” is an owner assertion;
- a generated browser Blob is not proof of external backup;
- an import receipt is proof of a committed import, not a hidden content copy;
- educational projections and labels never become authority.

## 6. Additive browser migration v48

P4 requires one new table because backup freshness cannot be derived honestly from import receipts or
download initiation. After confirming `MIGRATIONS.length=47`, append exactly one migration creating
only `studio_portable_export_receipts`:

```sql
CREATE TABLE IF NOT EXISTS studio_portable_export_receipts (
  receipt_id          TEXT PRIMARY KEY,
  event_kind         TEXT NOT NULL CHECK(event_kind IN ('generated','owner_saved')),
  parent_receipt_id  TEXT REFERENCES studio_portable_export_receipts(receipt_id),
  scope_kind         TEXT NOT NULL CHECK(scope_kind IN ('library','material','text_card')),
  portable_scope_id  TEXT NOT NULL,
  format_kind        TEXT NOT NULL CHECK(format_kind IN (
    'full_zip','archive_lplp','snapshot_lplp','text_zip','compatibility_json'
  )),
  source_state_sha256 TEXT NOT NULL,
  artifact_sha256    TEXT NOT NULL,
  size_bytes         INTEGER NOT NULL CHECK(size_bytes >= 0),
  destination_kind   TEXT CHECK(destination_kind IS NULL OR destination_kind IN (
    'files_icloud','files_local','share_sheet','other'
  )),
  app_version        TEXT NOT NULL,
  details_json       TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL,
  CHECK(
    (event_kind='generated' AND parent_receipt_id IS NULL AND destination_kind IS NULL) OR
    (event_kind='owner_saved' AND parent_receipt_id IS NOT NULL AND destination_kind IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_studio_portable_export_scope
  ON studio_portable_export_receipts(scope_kind, portable_scope_id, created_at);
CREATE INDEX IF NOT EXISTS ix_studio_portable_export_artifact
  ON studio_portable_export_receipts(artifact_sha256, event_kind);
```

Rules:

- rows are append-only;
- `generated` is written only after exact artifact bytes and SHA-256 exist;
- `owner_saved` requires an explicit user confirmation and references the generated row;
- the browser never records a filesystem path or filename;
- compatibility JSON never satisfies canonical backup freshness;
- `source_state_sha256` is a canonical hash of portable IDs and current revision/table/media hashes,
  not mutable display text;
- stale/current is derived by comparing the saved receipt hash to the current state hash;
- a full personal-data delete removes these receipts through the existing local reset/export policy;
- P2 packages do not include this table as graph truth; full-device backup includes it as local
  provenance metadata through the existing complete backup path;
- rollback leaves v48 inert and never drops it.

No other migration or table is allowed in P4.

## 7. Guided task contracts

Every wizard is a state machine with Back, Close and Resume-from-current-state. It must not keep a
parallel persisted draft; state is reconstructed from canon plus receipts.

### 7.1 Use on another device

1. Choose one material or full library.
2. Explain package scope and whether media bytes are included.
3. Preflight package validity, available storage and media identity.
4. Generate archive/full ZIP and exact artifact SHA.
5. Ask the user to confirm where it was saved; append owner assertion.
6. Show Files/iCloud transfer instructions specific to PC→iPhone.
7. On receiver: verify → dry-run → Apply → SHA relink → playback check.
8. Finish with cold-reopen and optional re-export verification checklist.

### 7.2 Restore backup

- choose Full ZIP or `.lplp.zip` based on what the user has;
- verification and dry-run remain no-write;
- distinguish reuse, restore, repair and conflict before Apply;
- never recommend resetting the Library to resolve an identity conflict;
- after Apply, route to media/replay verification.

### 7.3 Relink media

- display expected type, approximate size and SHA prefix before picker;
- hash selected bytes locally;
- exact match activates; mismatch preserves all existing data and gives corrective guidance;
- unsupported codec is separate from hash mismatch;
- no fuzzy filename/duration fallback.

### 7.4 Recover material

- complete → no action;
- archived projection → one-click unarchive;
- binding-only mismatch → one-click exact binding repair;
- missing projection with complete source package → verified rebuild under one SAVEPOINT;
- missing canonical node or conflict → stop and require exact source package/evidence;
- never repeat ASR merely because media or compatibility projection is missing.

### 7.5 Delete or export personal data

- preview canonical versus reused/referenced objects;
- export-before-delete CTA;
- preserve referenced canon and media;
- no dangling graph refs;
- Library Archive remains reversible for learning materials;
- permanent deletion requires the existing reverse-reference proof and explicit confirmation.

## 8. Storage and media diagnostics

Use existing browser-local capabilities only:

- `navigator.storage.estimate()` for usage/quota;
- `navigator.storage.persisted()` when supported;
- `navigator.storage.persist()` only behind an explicit user gesture and honest browser support;
- OPFS existence/readability through existing repository APIs;
- media MIME/codec probing without upload;
- SHA-256 locally, never filename matching.

User-facing states:

- “Stored on this device” is not “Backed up”.
- “Package created — confirm where you saved it” is not “Backup complete”.
- “Media is missing on this device; transcript and table are safe” is not “Material lost”.
- “This file is different” is used for SHA mismatch; technical code is available under Details.
- “This browser cannot play this codec” retains relink/export options.
- quota uncertainty is shown as unknown, not zero.

Diagnostics export is content-free by default: app/schema, capability booleans, counts, sizes, hash
prefixes, status/error codes and receipt IDs. No transcript/table content, secrets, filesystem paths,
full filenames or production coordinates.

## 9. Educational continuity

The material card primary action is determined by learning state, not portability implementation:

- Continue correction when a draft exists;
- Continue study when canon and table are current;
- Study without media when text/table exist but media is absent;
- Relink source for listening when exact media is missing;
- Create new table version when base is stale;
- Use on another device when continuity is the user's chosen task.

Import, reveal, correction and replay never imply a grade. Existing progress/SRS authority is not
changed. Exact revision anchors remain stable through every route.

## 10. Help and language contract

Four layers:

1. one-sentence contextual help beside state/action;
2. task wizard with the current step and why it is safe;
3. reference page for Full ZIP, archive, snapshot, compatibility JSON, storage, privacy and media;
4. content-free diagnostics for support.

Labels name user outcomes:

- “Use on another device”, not “Export Artifact Graph”;
- “Check package”, not “Run verifier”;
- “Apply checked package”, not “Commit SAVEPOINT”;
- “Repair media link”, not `EXACT_BINDING_TARGET_MISMATCH`;
- technical codes remain copyable under Details.

RU, EN and HE strings ship together. Do not reuse one term for a full-device backup and a media-free
material package.

## 11. Accessibility and responsive gates

- desktop RU at 1280×800;
- mobile RU/LTR and HE/RTL at 380×844;
- no horizontal document overflow;
- continuity rail logical DOM order is Source→Transcript→Table→Media→Backup in both directions;
- visual RTL mirroring does not reverse semantic progression;
- 44 px minimum primary touch targets;
- modal focus trap, Escape/Close, focus return and visible keyboard focus;
- `aria-current`, `aria-live` for task status, semantic headings and labelled technical Details;
- text zoom 200% without clipped primary action;
- reduced motion respected;
- sticky action area never covers the final material/task row;
- empty, loading, 100-item and error states have an actionable next step.

## 12. Security, privacy and cost gates

- reuse P2 ZIP count/size/ratio/traversal/duplicate/corruption/future-version protections;
- no writes before verified unchanged dry-run and user Apply;
- no remote URL ingestion in P4;
- no provider/model call from catalog, filters, help, export, verify, import, relink or recovery;
- no provider keys in packages, receipts, diagnostics or DOM;
- no automatic media upload/transport;
- no exact user content in logs or screenshots committed as fixtures;
- no server schema/API/data mutation;
- all destructive actions use current reverse-reference proof and full rollback;
- unsupported/unknown states fail closed without erasing usable text/table canon.

## 13. Performance gates

Deterministic fixtures:

| Fixture | Gate |
|---|---|
| 100 materials, 20 revisions each | inventory + lifecycle derivation ≤500 ms desktop |
| 100 materials | first 30 visible cards rendered ≤500 ms after inventory |
| 100 materials | filter/sort/attention-chip update ≤100 ms p95 |
| 500 materials | inventory + derivation ≤1,500 ms; DOM remains windowed/bounded |
| one 2,800-row/20-revision material | opening detail does not parse/render all row content |
| receipt history 500 rows | initial latest 30 ≤500 ms; progressive pagination |
| storage/media capability check | no OPFS media-byte read unless hashing selected relink file |

Measure separately on CI Chromium and record real-iPhone timings during owner-live. Performance
failures block release; ceilings are not silently relaxed after implementation.

## 14. Red-before-fix and fault matrix

Required pure/repository tests before UI implementation:

1. lifecycle derivation never treats text projection as material truth;
2. generated-unconfirmed is not current backup;
3. compatibility JSON never satisfies canonical backup;
4. stale current heads invalidate prior saved-state hash;
5. exact media missing preserves study-without-media;
6. SHA mismatch never replaces current binding;
7. import conflict has no guessed recovery action;
8. archived projection routes to unarchive, not re-import;
9. binding-only mismatch routes to exact repair without source ZIP;
10. no provider/network call in every catalog/wizard path;
11. v48 generated receipt writes only after artifact hash exists;
12. owner-saved assertion cannot reference a missing generated receipt;
13. fault after export-receipt write rolls back that receipt without affecting package canon;
14. full backup round-trip preserves v48 local provenance without making it graph truth;
15. delete/GC leaves no dangling receipt reference and does not delete externally referenced canon;
16. RU/HE empty/error/long-title layouts remain usable at 380 px.

## 15. Implementation order T0–T10

1. **T0:** freeze pure lifecycle types, priority rules and red tests.
2. **T1:** add v48 export-receipt migration and migration-shape tests.
3. **T2:** add repository inventory/source-state hash/export-event methods.
4. **T3:** build Overview/Materials catalog and continuity rail from pure view models.
5. **T4:** consolidate existing entry aliases and intent routing into the same modal.
6. **T5:** implement move-device, restore, relink and recovery wizards by composing existing APIs.
7. **T6:** add honest storage/media capability diagnostics and content-free export.
8. **T7:** add backup generation/owner-saved assertions for material, text-card and full ZIP flows.
9. **T8:** complete contextual help/reference and RU/EN/HE accessibility/RTL pass.
10. **T9:** run security/fault/performance/browser gates and full regression suite.
11. **T10:** scoped commit; separately authorized push/deploy; real owner desktop+iPhone closure.

Do not begin T1 before T0 red tests prove the intended contract.

## 16. Exact implementation allowlist

No file outside this list may change without a new owner decision:

```text
package.json
public/index.html
public/sw.js
public/db/migrations.js
public/js/import-center-core.js                                  # new pure module
public/js/portable-learning-package-repository.js
public/js/studio-portable-learning-package.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
tests/importCenterCore.test.js                                  # new
tests/portableLearningPackageRepository.test.js
tests/portableLearningPackageUi.test.js
tests/portableLearningPackageBackup.test.js
tests/libraryBundleExportImport.test.js
tests/mediaPackageRepository.test.js                            # migration count only if needed
tests/materialRevisionRepository.test.js                        # migration count only if needed
tests/i18n.locale-version.lock.json
scripts/premium/import-center-browser-smoke.js                  # new
scripts/premium/import-center-performance-smoke.js              # new
scripts/premium/media-package-performance-smoke.js              # migration count only if needed
scripts/premium/material-revision-performance-smoke.js          # migration count only if needed
docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md
docs/research/studio-p4-import-center/2026-08-02/OWNER_LIVE_PACKET.md
docs/research/studio-p4-import-center/2026-08-02/screenshots/         # generated allowlisted evidence only
```

Migration-count edits may change only the expected total from 47 to 48; v45/v46/v47 indices and
meaning must remain unchanged. Release/locale cache versions are bumped only under explicit release
authority.

## 17. Explicit exclusions

- Option C material/text decoupling;
- changes to P2 schema-v2 manifest or canonical serialization;
- media bytes inside `.lplp.zip`;
- automatic media transfer or cloud sync;
- server database/schema/API;
- E2EE, recovery keys or device vault;
- Hermes or Agent Access;
- concurrent-device editing/conflict merge;
- L2/L4/L5/L6;
- provider defaults, provider calls or implicit fallback;
- new ASR/translation/OCR/TTS behavior;
- mutable `texts`/`sentences` as material truth;
- file picker automation that bypasses a required user gesture.

## 18. Gates

Minimum commands after implementation:

```text
npm run smoke:import-center
npm run smoke:import-center:browser
npm run smoke:import-center:perf
npm run smoke:portable-learning-package
npm run smoke:portable-learning-package:browser
npm run smoke:portable-learning-package:perf
npm run smoke:media-package
npm run smoke:media-package:browser
npm run smoke:material-revision
npm run smoke:material-revision:browser
npm run smoke:i18n
npm run smoke:studio-chunks
npm run smoke:text-card
npm run smoke:captions-parse
npm test
```

Expected full-suite baseline before P4: 748 tests, 739 pass, nine known unrelated failures. Any new
failure blocks release.

Browser assertions:

- empty profile Import Center entry;
- 100-material catalog, attention filters and bounded DOM;
- every entry alias opens the same material identity;
- full library, one material, import, history and reference remain reachable;
- PC→iPhone wizard can be completed without knowing format names;
- generated versus owner-saved versus stale backup states remain distinct;
- exact media present/missing/mismatch/unsupported states;
- archive/recovery/binding repair/Undo routes;
- cold reopen state reconstruction from canon and receipts;
- desktop RU, 380 RU/LTR and 380 HE/RTL;
- provider requests 0, page errors 0, horizontal overflow 0.

## 19. Rollback

1. Revert P4 UI/core/repository code to the pre-P4 client.
2. Keep migration v48 and its rows inert; never drop or renumber it.
3. Existing P2/P3 export/import/relink paths remain functional after UI rollback.
4. A failed export receipt transaction rolls back only its event, not generated bytes already held
   in memory or any material canon.
5. Never delete external files: the browser does not own or track their paths.
6. If Import Center derives an impossible lifecycle state, show conflict and route to diagnostics;
   do not mutate canon as a repair shortcut.

## 20. Definition of Done

P4 is complete only when:

- one primary Import Center works from empty profile, Library and Workspace;
- all material cards are derived from canonical stores with no parallel truth;
- continuity rail and next action are deterministic and independently tested;
- v48 is the only migration and records honest append-only generated/saved assertions;
- move-device, restore, relink, recovery and delete/export wizards have no dead end;
- storage/media/backup language is truthful and actionable;
- P2/P3 round-trip and recovery contracts remain unchanged;
- 100/500-material performance gates pass;
- desktop RU, 380 RU/LTR and 380 HE/RTL accessibility gates pass;
- provider calls and server writes are zero;
- full regression composition matches the known baseline or improves only by scoped fixes;
- a fresh-profile browser round-trip and real owner iPhone task both pass;
- owner-live packet records actually served APP/CACHE, device/surface, health, disk, errors and
  screenshots without private content;
- code commit is scoped and push/deploy happen only under explicit authority.

## 21. Required adversarial review before code

- **R2/R17:** next action serves learning, not artifact administration for its own sake.
- **R4:** continuity rail and language work at 380 px/RTL and feel native to the current product.
- **R5:** the user can complete PC→iPhone without understanding ZIP taxonomy.
- **R9:** owner assertions and derived graph facts are visibly distinct.
- **R11:** no mutation is proposed from an uncertain lifecycle state.
- **R12:** existing repositories remain canonical; no hidden registry or dual-write status cache.
- **R13:** import/recovery retains dry-run, SAVEPOINT and rollback.
- **R14:** every file path retains P2 package security limits.
- **R15:** export/delete/privacy boundaries remain explicit and user-controlled.
- **R16:** zero unnecessary provider/model cost.

## 22. Paste-ready exact owner authorization sentence

The following sentence is a proposal, not authority merely because it appears here:

> **ОДОБРЯЮ реализацию P4 Import Center строго по implementation packet 2026-08-02. Разрешаю один bounded browser-local slice T0–T10: red-before-fix pure ImportCenterCore lifecycle model; один primary Import Center поверх существующих P2/P3 canonical repositories; guided move-device/restore/relink/recovery/delete-export tasks; honest storage/media/backup diagnostics; additive browser migration v48 только с append-only таблицей studio_portable_export_receipts после подтверждения MIGRATIONS.length=47; exact generated-versus-owner-saved receipts and stale-state hash; RU/EN/HE, desktop и 380 px RU/LTR+HE/RTL accessibility; 100/500-material performance, fault/security/full-regression gates; exact allowlist §16 и один локальный scoped implementation commit. Не разрешаю push/deploy, server schema/API/data, Option C material/text decoupling, cloud sync, E2EE, Hermes, media bytes в .lplp.zip, automatic media transport, concurrent-device editing, L2/L4/L5/L6, provider-default changes или implicit fallback. Остановись перед push/deploy и представь commit, gates и owner-live packet.**

## 23. Superseded implementation prompt and post-P4 handoff

The former paste-ready prompt in this section was an implementation entry point and is now
superseded: P4 must not be reimplemented or treated as `NEXT`. A new session starts with read-only
recon at `v3.11.300` / `fef4d469`, verifies `MIGRATIONS.length=48`, reads this packet together with
the owner-live closure, and selects exactly one separately authorized post-P4 direction from the
master roadmap. Candidate gates are:

1. `G-AUTOSYNC` → P5 E2EE package sync; P6 encrypted media transport remains usage-triggered.
2. `G-HERMES` → P7 metadata/handoff; P8 corrected-content/proposals remains separately bounded.
3. L4 local translation+nikud/S6 after scheduler and independent R1/R11 quality gates.
4. L5 diarization/alignment after speaker/timing human-gold acceptance.
5. EPUB + TXT/MD/HTML + HEIC ingest with real fixtures and mobile provenance gates.
6. L2 resumable jobs/batch only if reload-loss or regular 3–5+ file demand is demonstrated.

No candidate has implementation authority merely by being listed here. Option C, cloud sync,
E2EE, Hermes, automatic media transport, concurrent editing and provider-default changes remain
closed until the owner approves an exact implementation packet.
