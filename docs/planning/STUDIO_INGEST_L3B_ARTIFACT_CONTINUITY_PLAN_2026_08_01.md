# Studio Ingest L3b — Artifact Continuity, Portable Learning Package, iPhone и Hermes

> **Дата:** 2026-08-01
> **Статус:** 🟢 `OWNER-APPROVED PLANNING DIRECTION`; implementation не начат
> **Baseline:** production/origin `v3.11.282`,
> `95bd37a3ac404bed9ec6faacdca1da15e2f56815`, actual `MIGRATIONS.length=45`
> **Research canon:**
> `docs/research/studio-ingest-artifact-continuity/2026-08-01/REPORT.md`
> **Предок:** L3a Correctable Media Package shipped; L2 остаётся
> `DEFERRED / DEMAND-TRIGGERED`
> **Authority:** утверждены цель, требования и порядок planning. Не разрешены code/schema,
> cloud/Hermes mutations, push/deploy или production operations без отдельной точной фразы.

## 0. Program decision

Следующая программа после L3a называется **L3b Artifact Continuity**. Она не строит новый
ASR/provider и не переоткрывает L2/L4/L5/L6. Она превращает уже созданный Correctable Media
Package в долговечный образовательный объект, который:

- имеет единый граф происхождения и производных;
- переносится как один проверяемый learning package;
- восстанавливает exact table/revision binding;
- работает на реальном iPhone через guided import + SHA relink;
- объясняет пользователю storage/privacy/status;
- позже получает conflict-safe device sync;
- позже становится безопасно доступен Hermes через metadata/handoff и отдельный bounded share.

Рекомендуемый executable order:

```text
P0 L3a owner-live/canon closure
  → P1A Artifact Graph + Material Revision contract
  → P1B Material Revision Workspace + targeted regeneration
  → P2 Portable Learning Package v2
  → P3 real iPhone manual continuity
  → P4 Import Center + educational continuity
  → G-AUTOSYNC owner decision
      → P5 E2EE package sync
      → P6 optional encrypted media transport (triggered)
  → G-HERMES owner decision
      → P7 Hermes metadata + handoff
      → P8 bounded corrected-content + propose bridge
  → P9 adversarial closure/owner-live packet
```

P0–P4 составляют ближайшую продуктовую программу. P5–P8 — отдельно gated расширения,
а не автоматическое следствие утверждения этого плана.

## 1. Инварианты программы

1. Raw track immutable; corrected отдельно.
2. `studio_caption_revisions` остаётся caption canon.
3. Saved table остаётся bound к exact revision/hash.
4. Artifact Graph хранит typed refs/hashes/availability, не копирует content truth.
5. `source_segment_id`, `caption_segment_id`, `source_line_index`, `sentence_index`,
   row UUID и portable `text_key` не смешиваются.
6. Generic Update/delete+recreate sentences запрещён для bound material.
7. Import/export/sync не запускают ASR, translation или LLM автоматически.
8. Local/Gemini defaults и no-implicit-fallback policy не меняются.
9. Manual portable path обязателен даже после появления cloud sync.
10. Media bytes local-only by default.
11. Package sync, media sync и Hermes share — разные consents.
12. Standalone VTT/SRT не обещают package identity/history parity.
13. OPFS означает `stored on this device`, а не `backed up`.
14. Cross-device corrected revisions не используют silent LWW.
15. Hermes не читает OPFS/SQL напрямую и не мутирует canonical rows.
16. Agent correction/note — proposal; execution first-party ticket+receipt.
17. Learning grades deterministic-first; correction progress не grade.
18. Dirty worktree сохраняется; staging только explicit allowlist.
19. Actual migration number определяется live preflight, не narrative label.
20. Любой UI слайс проходит RU/LTR+HE/RTL @380px и real desktop/mobile visual QA.
21. Material Workspace один, но caption source и learning projection остаются разными canon.
22. Save/edit/replay/compare создают zero provider calls.
23. Manual learning fields не перезаписываются targeted/full regeneration молча.
24. Coarse stale развивается в deterministic row/field impact; full rebuild остаётся explicit.

## 2. Owner-approved decisions D1–D18

| ID | Решение | Зафиксированный выбор |
|---|---|---|
| D1 | Следующий продуктовый слой | Artifact continuity, не L4/L5/L2 |
| D2 | Структура | Import Artifact Graph над существующими canon stores |
| D3 | Portable artifact | Composite Portable Learning Package v2 |
| D4 | Первый cross-device путь | Manual package + Files/iCloud media + SHA relink |
| D5 | Автоматический sync target | E2EE package vault после отдельного design/authority |
| D6 | Media default | Не входит; optional encrypted chunks только по trigger |
| D7 | Multi-device writes | Conflict branches либо explicit single-editor; silent LWW запрещён |
| D8 | Hermes order | Metadata → handoff → bounded corrected content → proposals |
| D9 | Справка | First-class Import Center, не только FAQ |
| D10 | Scope boundaries | L2/L4/L5/L6/server/full-media ZIP не включены автоматически |
| D11 | Editing surface | Единый Material Revision Workspace с двумя distinct layers |
| D12 | Caption/table relation | Separate immutable revisions + exact binding, не одна mutable форма |
| D13 | Default save | Zero provider/model calls; impact сохраняется отдельно |
| D14 | Invalidation | Deterministic affected row/field mask, не global rebuild by default |
| D15 | Manual authority | Manual field protected; overwrite только по явному выбору |
| D16 | Regeneration | Explicit affected-only subset with provider/cost preflight |
| D17 | Full rebuild | Rare advanced action; atomic new revision; old revision preserved |
| D18 | Sequence | Workspace/table revision contract до Portable Package v2 |

`OWNER-APPROVED PLANNING DIRECTION` означает утверждение этих решений как основы
design/sequence. Это не implementation authority.

Полный implementation-grade contract D11–D18, UX/state model, proposed v46 schema,
red-before-fix gates и следующий prompt находятся в
`docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`.

## 3. Target artifact contract

### 3.1 Canon stores

| Object | Canon | Примечание |
|---|---|---|
| media bytes | content-addressed OPFS / future encrypted blob | SHA-256 identity |
| raw/corrected captions | `studio_caption_revisions` | immutable revisions |
| track head/draft | `studio_caption_tracks` | draft mutable, revision immutable |
| legacy/unpromoted learning table | `texts` + `sentences` | remains usable; lazy promotion only |
| promoted bound learning table | immutable table/row revisions | canon introduced by Workspace contract; portable `text_key` required |
| compatibility table surface | `texts` + `sentences` projection | rebuildable for promoted material; never second truth |
| exact binding | `studio_text_media_bindings` | device-local FK + portable projection |
| memory | `review_log` | append-only, отдельно от package |
| notes/bookmarks | current first-class stores | перенос только по declared policy |
| graph | refs/hashes/edges/availability | no copied transcript/table content |
| exports/sync/Hermes | projections | revision/hash bound |

### 3.2 Artifact Graph schema design requirements

P1 design packet должен решить, нужен ли additive browser schema. Если нужен, вероятная
форма — registry/edges metadata only:

```text
studio_import_runs
studio_artifact_registry
studio_artifact_edges
studio_device_artifact_state        # только если device continuity хранится локально
```

Запрещено создавать `content_json` с копией raw/corrected/table. Registry fields:

- artifact_id/type;
- canonical_ref_type/id;
- canonical_hash;
- schema_version;
- created/updated/deleted;
- metadata_json с allowlisted non-content fields;
- availability/state derived from real stores.

Edges:

- from/to artifact ID;
- relation enum;
- source hash/revision;
- provenance/created_at;
- no free-text identity.

Если graph полностью детерминированно выводим из existing stores, предпочесть pure graph
builder + только `studio_import_runs`, а не лишние таблицы. Это отдельное D-schema решение P1.

### 3.3 Portable Learning Package v2 manifest

Обязательные поля:

```json
{
  "schema": "linguistpro-portable-learning-package",
  "schema_version": 2,
  "package_mode": "snapshot|archive",
  "exported_by_app_version": "...",
  "artifacts": [],
  "edges": [],
  "media": {
    "included": false,
    "sha256": "...",
    "size_bytes": 0,
    "mime": "...",
    "duration_ms": 0,
    "codec_hint": "..."
  },
  "selected_revision_id": "...",
  "selected_revision_sha256": "...",
  "learning_material_text_key": "...",
  "files": {"path": "sha256"},
  "privacy": {"classes": [], "excluded": []}
}
```

### 3.4 Snapshot versus archive

`snapshot`:

- raw canonical revision;
- one selected corrected revision;
- exact table bound to that revision;
- mapping/provenance/quality;
- явное `history_included:false`.

`archive`:

- raw;
- all reachable corrected revisions and operations;
- current/conflicting heads;
- all bound learning-material versions included by user choice;
- `history_included:true`.

### 3.5 Portable binding

Package v2 не полагается на local UUID:

- `text_key` — portable material identity;
- `text_id` — optional source-device diagnostic only;
- sentence UUID remap allowed;
- row mapping — `caption_segment_id/source_segment_ids + order_index`;
- import сначала ищет exact text key/hash;
- same key/same hash → reuse/rebind;
- same key/different hash → explicit conflict, не overwrite.

## 4. Phase P0 — L3a owner-live and canon closure

### Цель

Формально закрыть то, что уже shipped, не смешивая acceptance с новой разработкой.

### Работы

1. Выполнить owner-live sequence на production v3.11.282 с real 36:17 video/Mia media.
2. Записать PASS/FAIL по current owner packet без transcript content.
3. Закрыть либо завести scoped defects:
   - ten substantive corrections;
   - split/merge/offset/replay;
   - save/reload/raw unchanged;
   - stale table;
   - VTT/SRT parity;
   - fresh-profile slim import/relink/mismatch;
   - real video;
   - dirty-close/process kill;
   - quota-full.
4. Актуализировать L3a design/roadmaps с shipped/accepted state.
5. Отдельно оставить nine unrelated npm baseline failures; они не маскируются, но не
   переименовываются в L3a defect без evidence.

### Exit

- owner-live record с exact browser/device/version/IDs/hashes;
- known failures classified;
- canon headers no longer claim local candidate;
- no new feature code required unless live defect found and separately authorized.

## 5. Phase P1A/P1B — Artifact Graph contract и Material Revision Workspace

### Цель

Сначала заморозить identity, graph, table-revision, impact и package-v2 semantics; затем
реализовать Material Revision Workspace и targeted regeneration до сериализации Portable
Learning Package v2. Package не должен закрепить coarse stale/mutable-cell модель.

### Обязательный recon

- actual `MIGRATIONS.length`;
- all readers/writers of package/revision/text binding;
- full backup/text-card/cloud-slim allowlists;
- notes/bookmarks/audio anchors/progress portability;
- current package size on 514 and 2,800 cues;
- actual `text_key` collision/import behavior;
- i18n/SW consumers;
- legal/privacy class map;
- real owner fixtures by hashes only.
- every direct `texts`/`sentences`/`currentTableData` writer and compatibility consumer;
- field-level manual provenance currently stored in `edit_meta_json`;
- actual subset/provider request contracts and request-count observability.

### Design decisions

1. Derived graph versus additive metadata tables.
2. `import_run` first-class schema.
3. Snapshot/archive revision closure.
4. Portable table/text binding.
5. Notes/bookmarks inclusion modes.
6. Package filename/extension/MIME.
7. Import conflict policy.
8. Backup integration.
9. Receipts/diagnostics.
10. Rollback/migration.
11. First-class immutable table revision canon and compatibility projection.
12. Deterministic caption-change → row/field impact.
13. Manual field authority/locks and explicit back-propagation.
14. Targeted provider subset validation/cost preflight/no-fallback.
15. Desktop/mobile two-layer Workspace and version/compare UX.

### Red-before-fix pure gates specification

- canonical graph deterministic;
- no content duplication in registry;
- export time/hardware excluded from identity hash;
- every edge points to existing artifact/hash;
- unknown type/relation/schema hard fails;
- snapshot/archive truth flags;
- same ID/different hash conflict;
- portable key binding independent from local UUID;
- corrupt/missing file fails before mutation.

### Exit

Отдельный owner-approved design packet с D-schema/D-package/D-import/D-backup решениями,
exact migration proposal и implementation allowlist.

### P1B implementation dependency

После отдельного implementation approval выполнить T0–T10 из Material Revision Workspace
packet. Exit P1B:

- one saved-material Workspace CTA;
- source/learning layers synchronized but authority-separated;
- zero-call save;
- affected-only impact/regeneration;
- manual fields protected;
- immutable table revisions and rollback;
- compatibility projection guarded/rebuildable;
- owner-live on 514 cues and 380 px.

## 6. Phase P2 — Portable Learning Package v2 implementation

### Scope

- pure graph builder/contracts;
- snapshot/archive exporter;
- dry-run verifier/importer;
- transactional OPFS import;
- table/text-card inclusion;
- portable rebind;
- receipts;
- backup coverage report;
- local browser gates.

### Out of scope

- server/cloud sync;
- media bytes inside package;
- E2EE;
- Hermes tools;
- concurrent device editing;
- L2/L4/L5/L6.

### Import transaction

1. Read package headers under size/file-count caps.
2. Validate schema and all checksums.
3. Validate graph referential integrity.
4. Compute dry-run plan.
5. Show privacy/inclusion/conflicts/missing media.
6. User confirms.
7. SAVEPOINT insert/reuse package/tracks/revisions.
8. Import/reuse text/table.
9. Rebind portable mapping.
10. Re-read canon and compare hashes.
11. Commit and generate receipt.
12. Any failure rolls back all new rows.

### Required fault gates

- failure at every step 7–10;
- disk/quota write failure;
- duplicate exact package;
- same IDs/different hashes;
- missing table file;
- invalid VTT projection with valid JSON revision;
- binding target conflict;
- unsupported future schema;
- package ZIP bomb/file-count/path traversal caps;
- Unicode/RTL/path filename adversaries.

### Performance gates

Measure before freezing ceilings:

- 514 cues snapshot/archive;
- 2,800 cues with at least 20 revisions;
- export time/peak JS heap/package bytes;
- verify/dry-run/import/commit;
- 380px first-interactive;
- no full media bytes in memory.

### Exit

- fresh Chromium profile round-trip;
- semantic and identity oracle equals source;
- table/revision binding restored;
- reimport zero duplicates;
- delete/GC leaves no dangling graph refs;
- owner packet ready; stop before push/deploy without authority.

## 7. Phase P3 — real iPhone manual continuity

### Цель

Доказать practical PC→iPhone continuity без cloud Media Package sync.

### Product flow

1. `Использовать на другом устройстве` на ПК.
2. Package preflight and export.
3. Copy package + original media through Files/iCloud.
4. Import in supported iPhone surface.
5. Dry-run/receipt.
6. SHA relink media.
7. Player/cue/row check.
8. Cold reopen.
9. Optional correction on iPhone only if editing policy allows.
10. Re-export and compare.

### Support matrix decision

Первый gate должен назвать одну supported surface:

- Safari tab; или
- installed Home Screen PWA.

Нельзя обещать shared OPFS между ними. Рекомендация: installed PWA для persistent product
use, Safari only as documented import/onboarding route if transfer between stores solved.

### Required device evidence

- iPhone model, iOS/WebKit, free disk;
- exact app/PWA launch mode;
- storage estimate/persist result;
- package/media size/hash/codec;
- import timings;
- foreground/background/lock/reload/process kill;
- RU/LTR and HE/RTL screenshots;
- player tag/seek/replay/row highlight;
- export/download/share result;
- console/remote-inspector errors where available.

### Honest degradation

- unsupported codec → text remains usable, transcode guidance, no fake missing-media;
- quota insufficient → no partial package canon, cleanup receipt;
- media absent → correction/table work, replay disabled + relink;
- storage not persistent → warning + portable backup CTA;
- package already exists → reuse, not duplicate.

### Exit

Один real owner material проходит PC export → iPhone import/relink → study → cold reopen →
re-export semantic parity. Это закрывает manual cross-device, но не automatic sync.

## 8. Phase P4 — Import Center and educational continuity

### 8.1 Import Center

Одна primary surface показывает все imported materials и graph status.

Card fields:

- source/media identity;
- provider/model/import time;
- raw/corrected revisions/draft;
- bound table versions/stale;
- media availability;
- backup freshness;
- device/cloud status;
- Hermes share;
- quality warnings;
- last integrity receipt.

Primary actions:

- Continue correction;
- Study with source;
- Create new table version;
- Use on another device;
- Create/verify backup;
- Relink media;
- Export VTT/SRT;
- Delete/export data;
- Agent access (only when feature exists).

### 8.2 Help contour

- contextual explanations;
- PC→iPhone wizard;
- restore/relink/stale/conflict/delete wizards;
- reference page for formats/artifacts/storage/privacy;
- content-free diagnostics export;
- demo public/licensed fixture.

### 8.3 Educational continuity

Minimum modes:

1. Correct transcript.
2. Study with source.
3. Listen first / reveal / self-assess or deterministic drill.

State:

- last cue/row/media time;
- bookmarks/chapters;
- timestamp notes;
- exact revision anchor;
- no implicit grade from correction/reveal.

### UX gates

- stage rail understandable without docs;
- no action dead end;
- `saved locally`, `backed up`, `synced`, `media present` visually distinct;
- missing media does not look like lost transcript;
- backup stale state;
- 380px RU/HE;
- keyboard/screen reader/contrast;
- 100+ package catalog performance;
- no hidden model/network calls.

### Exit

Owner can answer from UI: what exists, where stored, which revision/table, whether backup
exists, how to use on iPhone, what Hermes can see and how to delete it.

## 9. Gate G-AUTOSYNC — separate owner decision

Automatic device sync starts only if P3 dogfood records repeated friction or owner declares it
core product value. Required decision packet compares:

- manual package sufficient;
- existing server-readable artifact sync;
- E2EE device vault;
- read-only secondary versus multi-editor;
- transcript-only versus media bytes;
- cost/storage/recovery-key UX.

Recommended choice: E2EE package/revision vault, no media bytes first.

Exact approval must authorize, separately:

- browser crypto/key store;
- server schema/API/object persistence;
- production migration/data class;
- consent copy/version;
- device management/recovery;
- deployment/live validation.

## 10. Phase P5 — E2EE package sync, conditionally planned

### Architecture

- client-generated account/device key hierarchy;
- encrypted immutable revision objects;
- content-addressed ciphertext blobs;
- server stores minimal routing metadata;
- head pointers/conflict set separate from revisions;
- authenticated user/tenant/device context;
- resumable/idempotent transfer;
- export/recovery key and device revoke;
- no plaintext transcript in server logs/metrics.

### Conflict policy

- commit includes base revision;
- concurrent heads survive;
- UI compare/choose/merge;
- no silent LWW;
- first release may enforce explicit single-editor with secondary read-only.

### Lifecycle

- sync consent separate from `cloud_texts`;
- revoke stops future sync and follows declared purge semantics;
- delete creates tombstone/receipt;
- account export includes encrypted archive + recovery instructions;
- account delete purges ciphertext/routing metadata;
- device revoke rotates/wraps future keys; limitations of already-copied offline data stated.

### Gates

- two-user isolation;
- two-device union/conflict;
- offline edit/reconnect;
- wrong key/corrupt ciphertext;
- revoke/rekey/recovery;
- size/cap/rate/DoS;
- server evidence contains no plaintext;
- fresh-device restore oracle.

## 11. Phase P6 — optional encrypted media transport, demand-triggered

Trigger: repeated owner/user friction from Files/iCloud relink or need for seamless playback.

Requirements:

- media sync separate opt-in and quota;
- chunked/resumable encrypted upload/download;
- SHA identity of plaintext verified client-side;
- ciphertext chunk hashes;
- pause/resume/cancel;
- Wi-Fi/cellular policy;
- storage/egress cost estimate before transfer;
- per-device cache/GC;
- codec honesty;
- no server yt-dlp/transcode implicit path;
- no full-media ZIP as primary transport.

Exit: interrupted 300MB transfer resumes without duplicate bytes; iPhone streams/downloads or
honestly says local download required; revoke/delete receipts pass.

## 12. Gate G-HERMES — separate owner decision

Hermes work may begin after stable Artifact Graph identity. It does not require media byte sync.

Decision packet must choose:

- metadata only versus corrected-content share;
- live browser handoff versus server-readable TTL projection;
- per-package versus standing grant;
- raw access default NO;
- downstream LLM retention notice;
- asynchronous access requirement;
- proposal types.

Recommended initial authorization: metadata + handoff only.

## 13. Phase P7 — Hermes metadata and handoff

### Additive capabilities

`list_media_learning_packages`

- bounded catalog metadata;
- revision/table/stale/media coarse states;
- authority/freshness;
- no transcript/media/notes/grades.

`create_media_handoff`

- package/revision/cue/time;
- one-time canonical-origin ticket;
- owner click opens first-party browser;
- receipt confirms open/consume, not learning completion.

### Required boundaries

- new scopes and consent presentation;
- no existing output-schema mutation;
- per-tool limits/byte caps;
- tenant isolation;
- content-free audit;
- feature flag/control plane;
- Hermes `tools.include` update only after production tool exists;
- fresh ordinary chat final acceptance.

## 14. Phase P8 — Hermes bounded content and proposals

### `get_media_transcript_window`

- exact corrected revision;
- 1–20 cues/byte cap;
- separate content grant;
- raw excluded unless separately approved;
- timestamps/speaker only if included in consent;
- revision hash/authority/freshness;
- TTL/revoke/purge;
- no notes/grades/SRS/media bytes.

### `propose_timestamp_note`

- cue/revision anchor;
- proposal body and provenance;
- no direct write;
- owner browser confirms and writes OPFS;
- ticket single-use, receipt content-minimized.

### Future `propose_caption_correction`

Не входит в первый Hermes content slice. До него нужны:

- diff UI;
- authority per field;
- stale base conflict;
- deterministic identity;
- owner confirmation;
- raw mutation impossible;
- audit/annul/correction semantics.

### R17 gate

Hermes может объяснять и предлагать, но не сертифицирует transcript/learning grade.

## 15. Phase P9 — final adversarial closure

Проверка всей программы по ролям R2/R4/R5/R9/R11/R12–R17:

- education outcome and no grade confusion;
- no UX dead ends;
- one canon per artifact;
- migration/restore rollback;
- tenant/device boundaries;
- consent/export/delete;
- cost/quota;
- agent propose-first;
- real-profile/device evidence.

Owner-live packet должен разделять:

- local correction closure;
- portable artifact closure;
- educational closure;
- manual iPhone closure;
- automatic sync closure;
- Hermes closure.

Нельзя одним `PASS` скрыть незавершённые уровни.

## 16. Program gate matrix

| Gate | P0 | P1–P2 | P3 | P4 | P5 | P7–P8 |
|---|---:|---:|---:|---:|---:|---:|
| raw immutable | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| revision/table binding | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| fresh-profile restore | — | ✓ | ✓ | — | ✓ | — |
| real iPhone | — | — | ✓ | ✓ | ✓ | handoff |
| conflict-safe | local | import | single-device | UI | multi-device | stale grant |
| export/delete receipt | package | ✓ | ✓ | ✓ | ✓ | share/grant |
| 380px RU/HE | ✓ | import UI | ✓ | ✓ | device UI | consent/handoff |
| no model call | ✓ | ✓ | ✓ | ✓ | ✓ | tool-specific |
| privacy consent | local | explicit export | local | visible | separate | separate |
| ordinary Hermes chat | — | — | — | — | — | required |

## 17. Stable artifacts required per phase

Каждая engineering/design сессия оставляет:

1. stable README;
2. exact source commit/version/migration count;
3. decision table;
4. fixture manifest/hashes/licence;
5. raw gate output or bounded metrics;
6. screenshots where UI changes;
7. fault/performance report;
8. known failures/non-goals;
9. rollback;
10. owner-live prompt;
11. paste-ready next-session prompt;
12. explicit push/deploy authority state.

User media/transcripts/keys remain outside git. Committed evidence uses hashes and sanitized
fixtures.

## 18. Stop conditions

Остановиться и запросить отдельное решение, если:

- P1 требует content-duplicating graph store;
- portable binding нельзя сделать без destructive rewrite existing text;
- iPhone требует media transcoding/server upload;
- browser package import exceeds measured memory/quota ceilings;
- automatic sync requires plaintext server storage contrary to chosen E2EE direction;
- multi-device conflict semantics unresolved;
- consent copy cannot truthfully explain retention/delete;
- Hermes tool needs direct OPFS/SQL or raw access;
- scope expands to L2/L4/L5/L6/full-media ZIP/server yt-dlp;
- production/server schema/deploy needed without exact authority.

## 19. Recommended bounded session split

### Session A — P0 acceptance/canon

Owner-live evidence + docs closure. No feature code unless a real defect is separately approved.

### Session B — P1A adversarial design packet

Docs/recon only. Freeze graph/table-revision/impact/package/import/backup schema and gates.

### Session C — P1B Material Revision Workspace foundation

Pure impact/table-revision core, migration/repository/promotion and zero-call Workspace shell;
requires exact separate implementation authority.

### Session D — P1B targeted regeneration and closure

Learning-row editor, affected-only provider subset, version compare/reconcile, compatibility and
owner-live packet; stop before push/deploy.

### Session D2 — P2 Portable Learning Package core/UI

Serializers/verifiers, transactional import/rebind/receipts and 380px gates over the frozen
Material Revision contract.

### Session E — P3 iPhone owner-live

Production-like/manual transfer, real device, no automatic cloud sync.

### Session F — P4 Import Center/education

Catalog/status/help/modes; no cloud/Hermes mutation.

### Session G — autosync design only

Starts only after G-AUTOSYNC owner decision.

### Session H — Hermes design/implementation

Starts only after G-HERMES owner decision; metadata/handoff before content.

## 20. Paste-ready next-session prompt: P1 design packet

```text
Работай в E:\projects\tts-prototype-android.

READ FIRST полностью и в порядке:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md
5. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
6. docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md
7. docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md
8. docs/research/studio-ingest-artifact-continuity/2026-08-01/REPORT.md
9. docs/planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md
10. docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md
11. docs/planning/LINGUISTPRO_SYNC_HARDENING_P0P2_DESIGN_2026_07_18.md
12. docs/planning/LINGUISTPRO_AGENT_ACCESS_PERSONAL_CONTENT_BRIDGE_RECON_2026_07_18.md

Baseline at planning time: production/origin v3.11.282 / 95bd37a3;
actual browser MIGRATIONS.length=45. Re-check live state; do not assume it is unchanged.
L2 remains demand-triggered. L4/L5/L6 are out of scope.

Owner-approved direction: L3b Artifact Continuity = Import Artifact Graph over existing canon
stores + Portable Learning Package v2 + later real-iPhone manual transfer and Import Center.
Manual portable path remains mandatory; media bytes local-only by default; automatic package
sync target is E2EE but is NOT authorized; Hermes work is NOT authorized.

Owner-approved Material Revision decision: before Package v2, introduce one premium Workspace
with distinct corrected-transcript and learning-projection layers; zero-call save; deterministic
affected row/field impact; manual-field protection; explicit targeted regeneration; full rebuild
rare, advanced and versioned. Use the separate Material Revision packet as normative contract.

This session is adversarial DESIGN/RECON ONLY. Do not change product code, migrations, server,
cloud sync, Hermes config, package/provider defaults or production. Preserve dirty worktree.

Prepare a detailed owner decision packet that freezes:
- derived graph vs additive metadata schema;
- import_run contract;
- snapshot/archive package-v2 manifest;
- portable text/table binding independent of local UUID;
- full revision-history policy;
- notes/bookmarks/progress inclusion;
- transactional import/idempotency/conflicts/receipts;
- full-backup coverage;
- size/performance/fault/security gates;
- exact future implementation allowlist and rollback.

Apply R2/R4/R5/R9/R11/R12–R17 adversarially before recommendation. Leave stable research,
exact file/symbol anchors, D-decisions, known unknowns, and a paste-ready implementation prompt.
Stop before code/push/deploy until separately authorized.
```

## 21. Current planning conclusion

Ближайший practically meaningful chain — P0→P1A→P1B→P2→P3→P4. Она закрывает нынешний
реальный пробел без batch, новых models или автоматической отправки personal media в cloud.

P1B теперь является обязательным maturity bridge: Portable Package v2 не начинается поверх
coarse global stale и mutable inline-cell workflow. Сначала таблица получает immutable revisions,
field authority и affected-only update semantics; затем эта модель переносится между devices.

P5/P6 и P7/P8 остаются важными архитектурными направлениями, но начинаются только после
отдельных owner gates. Это удерживает один активный продуктовый слайс и не превращает
artifact continuity в бесконечную платформенную программу.
