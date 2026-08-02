# Studio Ingest P2 — Portable Learning Package v2 implementation packet

> **Date:** 2026-08-02
> **Status:** SHIPPED `v3.11.289` / `da30fdbaf79f6751bee74406f73b093be742e76b`;
> AUTOMATED PROD PASS / PARTIAL OWNER PASS
> **Production baseline before P2:** `v3.11.287` / `2e8f4bf355a2babc0de619bfca817d1fff74b44f`
> **Browser schema:** `MIGRATIONS.length=47`; v47 is receipt-only and v45/v46 indices are unchanged
> **Authority:** exact §27 implementation authority, four-file migration-count addendum and a
> later explicit production-deploy approval were supplied by the owner on 2026-08-02. Owner
> production data remains read-only unless separately authorized.

This packet closes the exact P2 entry gaps left by the Artifact Continuity plan. It does not
redefine caption, table or learning truth. It packages the immutable canon that already exists.

## 0. Decision in one screen

P2 is one browser-local, media-free portable object:

```text
existing immutable caption revisions
  + existing immutable table revisions and exact cue↔row mapping
  + portable material/text binding and rebuildable text-card projection
  → pure typed Artifact Graph
  → canonical, checksummed snapshot or archive ZIP
  → verify + no-write dry-run
  → explicit Apply under one SQLite SAVEPOINT
  → re-read/hash oracle + durable receipt
```

Frozen choices:

1. Artifact Graph is derived from existing stores. No artifact registry or edge table.
2. One additive v47 table stores committed import receipts and portable↔local ID maps only.
3. The package uses portable content identities, never local `text_id`/sentence UUID as identity.
4. Snapshot and archive are separate truthful modes.
5. Media bytes never enter the package; relink is exact SHA-256 only.
6. The importer is strict and fail-closed: no positional guess, overwrite, partial success,
   provider call or implicit fallback.
7. Compatibility `texts`/`sentences` and text-card are rebuilt projections, not imported truth.
8. P2 uses an explicit single-editor conflict policy. Same portable ID/different hash blocks the
   whole apply; branch/concurrent editing remains outside P2.
9. Full backup must embed P2 archives or fail visibly. It may not silently omit Studio canon.
10. No P2 code or migration starts until the exact owner sentence in §24 is supplied separately.

## 1. Grounded baseline and confirmed gaps

| Existing surface | Current contract | P2 consequence |
|---|---|---|
| `public/db/migrations.js` v45 | media packages, tracks, immutable caption revisions, text binding | reuse; do not copy caption truth into graph metadata |
| `public/db/migrations.js` v46 | materials, immutable table/row revisions, cue↔row mapping | reuse as table canon |
| `media-package-core.js` | deterministic caption hashes and semantic VTT oracle | preserve its existing revision hashes; do not re-hash with a competing rule |
| `media-package-repository.js` | transaction-per-operation, v1 snapshot import, ID/hash conflict | extend through P2 orchestration; v1 remains a separate format |
| `studio-media-package.js` | checksummed v1 ZIP, current raw/current corrected only | P2 is a new schema, not an in-place v1 mutation |
| `material-revision-core.js` | table content/mapping hashes, field authority/locks | package those hashes and exact rows |
| `material-revision-repository.js` | local material/table IDs derive partly from local UUIDs | add portable aliases in package/receipt; local IDs may remap |
| `text-card-format.js` | `text_key` portability and R9-preserving compatibility payload | emit as a projection/oracle only |
| `local-db.js::exportBundle/importBundle` | library backup and per-text SAVEPOINTs; tolerant partial import | do not use tolerant import as P2 authority; full backup needs explicit P2 coverage |
| full ZIP in `index.html` | writes library/audio/advanced notes, not Studio tables | add archive packages and a coverage index or abort the backup |

Confirmed gaps:

- no durable P2 receipt or portable↔local revision/row map exists;
- `material_id`, `table_revision_id` and legacy stable row UUIDs cannot be used as cross-device
  identity by themselves;
- v1 snapshot does not carry the immutable learning table or full revision history;
- current library backup does not enumerate or restore the eight v45/v46 Studio tables;
- current ZIP import extracts arbitrary entries before a P2-specific bomb/path/count policy;
- current tolerant `importBundle()` can report per-text errors and continue, which is forbidden
  for a composite P2 apply.

## 2. Canon and authority boundaries

| Class | Authority | Package behavior |
|---|---|---|
| media bytes | content-addressed local OPFS | absent; SHA/size/MIME/duration/codec reference only |
| raw/corrected caption content | `studio_caption_revisions` | immutable objects, existing canonical hash retained |
| track head and lineage | `studio_caption_tracks` + revision parents | serialized as typed refs; drafts excluded |
| learning content | `studio_table_revisions` + row versions | immutable objects, field authority and locks retained |
| exact mapping | table revision rows + bound caption revision/hash | serialized without positional fallback |
| local compatibility table | `texts` + `sentences` | rebuildable after authoritative import |
| text card | `text-card-v2` projection | parity oracle and interoperability view, never input truth |
| notes/bookmarks/progress/review memory | their existing stores | excluded from P2; existing full-library backup remains their canon path |
| Artifact Graph | pure deterministic refs/hashes | no copied transcript/table body and no mutable authority |
| receipt | v47 metadata table | IDs, hashes, counts, before-pointers and local remap only; no content copy |

Asserted facts and derived facts are never mixed. Serialized graph edges are asserted by current
canon rows. Device availability, missing-media status and reuse suggestions are derived during
dry-run and live only in the plan/receipt, outside the semantic graph hash.

## 3. Exact Artifact Graph node contract

Every node has exactly:

```json
{
  "id": "<portable-id>",
  "type": "<enum>",
  "canonical_hash": "<64 lower-case hex>",
  "schema_version": 1,
  "canonical_ref": {"store": "<enum>", "source_id": "<optional diagnostic>"},
  "metadata": {}
}
```

`canonical_ref.source_id` is excluded from semantic identity and may be absent. Allowed node
types for P2 schema v2 are exactly:

1. `media_asset` — SHA-256, declared MIME/size/duration/codec; no bytes/path.
2. `media_package` — portable media-package identity and media reference.
3. `import_run` — allowlisted provenance/quality metadata already bound to caption canon.
4. `caption_track` — role/language/head refs; no duplicated segment content.
5. `caption_revision` — existing revision hash, role, parent and object entry ref.
6. `learning_material` — portable text key and selected table/caption binding refs.
7. `table_revision` — existing content/mapping hashes, parent/binding and object entry ref.
8. `learning_row_version` — portable row identity, row content hash and owning material ref.
9. `projection` — `vtt` or `text_card`, its semantic hash and source revision/material ref.
10. `portable_package` — mode, semantic content root and declared roots/exclusions.

Unknown node types hard-fail. Node metadata has a per-type allowlist; free-form content blobs,
titles and filenames never establish identity.

## 4. Exact relation contract and integrity rules

Every serialized edge has:

```json
{
  "from": "<node-id>",
  "relation": "<enum>",
  "to": "<node-id>",
  "to_fragment": "<optional caption/source segment id>",
  "source_hash": "<hash of the asserting canonical object>",
  "fact_kind": "asserted"
}
```

Allowed serialized relations are exactly:

- `references_media`
- `produced_from`
- `derived_from`
- `bound_to_revision`
- `contains`
- `maps_to_segment`
- `projection_of`
- `supersedes`
- `conflicts_with`
- `included_in`

`available_on_device`, `missing_media_for` and `reusable_as` are derived dry-run facts and are
forbidden in the serialized asserted edge set.

Integrity validator requirements:

- node IDs and `(from, relation, to, to_fragment)` edges are unique;
- both edge endpoints exist and their types are allowed for that relation;
- `to_fragment` exists in the referenced exact caption revision;
- every object entry hash matches its node `canonical_hash` or the node's declared existing-store
  hash, according to the per-type rule;
- parent/supersedes chains are acyclic and revision numbers are strictly increasing;
- each table revision belongs to one material and binds at most one exact caption revision/hash;
- a row is contained by its material/table closure and may map to zero or one caption segment;
  N rows may map to one segment; zero mapping stays zero and never guesses by order;
- all `source_segment_ids` resolve in the declared raw revision closure;
- selected heads resolve inside the package; omitted snapshot ancestors are listed only in
  `history.external_ancestors`, never represented as dangling edges;
- `fact_kind` is exactly `asserted`; authority/locks inside table objects remain unchanged;
- `conflicts_with` must be empty for an applicable P2 package. A non-empty conflict-head set is
  verifiable but Apply returns `CONCURRENT_HEADS_UNSUPPORTED`.

## 5. Portable identity independent of local UUID

All portable hashes use the canonical serialization in §8.

| Object | Portable ID |
|---|---|
| media asset | `media:sha256:<media_sha256>` |
| media package | `media-package:sha256:<hash(media SHA or unbound raw hash)>` |
| import run | `import-run:sha256:<hash(allowlisted provenance)>` |
| caption track | `caption-track:sha256:<hash(role, language, package ID, immutable root revision)>` |
| caption revision | `caption-revision:sha256:<existing canonical_sha256>` |
| learning material | `learning-material:sha256:<hash(text_key, media-package ID)>` |
| table revision | `table-revision:sha256:<hash(content_sha256, mapping_sha256, bound caption portable ID, portable parent)>` |
| row | `learning-row:sha256:<hash(material portable ID, first-seen portable table ID, first-seen order)>` |
| projection | `projection:<kind>:sha256:<semantic_hash>` |
| package | `portable-package:sha256:<hash(schema, mode, roots, history flags)>` |

Rules:

- `text_key` is mandatory, non-empty and byte-preserved; local `text_id` is diagnostic only.
- local material/table/sentence UUIDs may remap and never enter the content root.
- an exporter derives each native row's portable ID from the earliest included/source history
  occurrence. An imported row reuses the portable ID stored in its committed receipt map.
- caption/source segment IDs are preserved as immutable fragment identity inside their exact
  revision; they are not confused with row identity.
- timestamps, app version, hardware, local paths and ZIP filename never enter portable IDs.
- same portable ID + same canonical hash means reuse; same portable ID + different hash is a
  hard package conflict before any write.

## 6. Caption → table → material → text/card binding

The binding chain is mandatory and hash-closed:

```text
caption_revision(portable ID + existing canonical SHA)
  ← table_revision.bound_caption_revision_id/SHA
  ← learning_material.selected_table_revision
  ← required text_key
  → text_card projection(source_material_id + source_table_revision_id + semantic hash)
```

The table object carries exact ordered rows, `field_meta`, manual locks,
`caption_segment_id`, `source_segment_ids` and mapping metadata. The text-card file is generated
from that object through the existing compatibility rules. On import it is verified against an
independent projection oracle, then ignored as write authority; the importer writes immutable
table canon and rebuilds `texts`/`sentences` from it.

## 7. Snapshot and archive package

`snapshot` includes:

- the media ref and media-package descriptor;
- the immutable raw revision required by source IDs;
- one explicitly selected corrected revision;
- one explicitly selected table revision exactly bound to that corrected revision;
- material/binding, mapping, text-card and VTT projections;
- `caption_history_complete=false`, `table_history_complete=false` and explicit external
  ancestor IDs/hashes.

`archive` includes:

- the same roots;
- all reachable raw/corrected revisions and operations from the selected head;
- all reachable table revisions from the selected table head;
- all referenced row versions and exact mapping objects;
- `caption_history_complete=true`, `table_history_complete=true` after closure validation.

Drafts, provider candidates, device availability, notes, bookmarks, progress, review memory,
cloud state and media bytes are excluded in both modes. P2 supports one selected head; packages
with concurrent heads verify but do not Apply.

## 8. Canonical manifest, serialization and checksums

Internal ZIP paths are fixed ASCII and slash-separated:

```text
manifest.json
graph/artifacts.json
graph/edges.json
source/media-ref.json
provenance/import-run.json
provenance/export.json
quality/report.json
tracks/raw/track.json
tracks/raw/revisions/<64hex>.json
tracks/corrected/track.json
tracks/corrected/revisions/<64hex>.json
tracks/projections/<64hex>.vtt
learning/material.json
learning/table/revisions/<64hex>.json
learning/mapping/<64hex>.json
learning/text-card.json
README.txt
```

The manifest has exactly these top-level fields; additive unknown fields are rejected in schema 2:

```json
{
  "schema": "linguistpro-portable-learning-package",
  "schema_version": 2,
  "package_mode": "snapshot",
  "portable_package_id": "portable-package:sha256:<content-root>",
  "content_root_sha256": "<64hex>",
  "roots": {
    "media_package": "<id>",
    "caption_revision": "<id>",
    "learning_material": "<id>",
    "table_revision": "<id>"
  },
  "history": {
    "caption_complete": false,
    "table_complete": false,
    "external_ancestors": []
  },
  "media": {
    "included": false,
    "sha256": "<64hex-or-null>",
    "size_bytes": 0,
    "mime": "<string-or-null>",
    "duration_ms": 0,
    "codec_hint": "<string-or-null>"
  },
  "entries": [
    {"path": "graph/artifacts.json", "sha256": "<64hex>", "size_bytes": 0,
     "media_type": "application/json", "semantic": true}
  ],
  "privacy": {
    "included": ["caption-canon", "learning-table-canon", "compatibility-projections"],
    "excluded": ["media-bytes", "notes", "bookmarks", "progress", "review-memory",
      "cloud-state", "provider-secrets", "device-identifiers"]
  }
}
```

Canonical JSON rules:

1. UTF-8 without BOM, no insignificant whitespace.
2. Object keys sorted by Unicode code point; array order is semantic and preserved.
3. Values are null, booleans, strings, arrays, objects or finite safe integers only.
4. `undefined`, NaN, Infinity, floats, negative zero, duplicate keys and lone surrogates reject.
5. Content strings are byte/code-point preserved: no new NFC/NFKC normalization. This prevents
   the package layer from changing existing caption/table canon. Identity fields and hashes are
   validated as ASCII enums/lowercase hex.
6. Each entry SHA-256 hashes its exact uncompressed bytes.
7. `content_root_sha256` hashes the canonical ordered list
   `[path, sha256, size_bytes, media_type]` for entries with `semantic=true`.
8. `portable_package_id` is the package-node descriptor hash over schema, mode, portable roots
   and history flags; it excludes itself, entry hashes and provenance. This avoids a circular
   hash. `content_root_sha256` independently commits every semantic entry.
9. `provenance/export.json` contains export time/app/runtime and is `semantic=false`; repeated
   export may change manifest bytes but not the portable package ID/content root.
10. Receipt `manifest_sha256` hashes exact canonical `manifest.json` bytes. The manifest does
    not contain its own hash.

Existing caption `canonical_sha256` and table `content_sha256`/`mapping_sha256` are verified by
their existing algorithms plus the independent oracle; P2 does not replace those hashes.

The external filename is
`linguistpro-learning-<sanitized-title>-<root12>-<snapshot|archive>.lplp.zip`; MIME is
`application/zip`. Filename/title do not affect identity.

## 9. Supported schema and future versions

- P2 importer accepts only schema name above with integer `schema_version=2`.
- Version `>2` fails `PACKAGE_SCHEMA_FUTURE` before entry extraction or DB access.
- Version `<2`, including `linguistpro-media-package-v1`, is not upgraded implicitly; the
  existing v1 importer remains a separate explicit product.
- Unknown fields, node types, relations, path patterns or enum values fail closed.
- No best-effort downgrade, provider reconstruction or hidden fallback is allowed.

## 10. Exact security limits

Validate the central directory before decompressing any non-manifest entry:

- maximum archive size: `128 MiB` compressed;
- maximum total declared uncompressed size: `512 MiB`;
- maximum entries: `4096`, directory records included;
- maximum one entry: `64 MiB`; `manifest.json`: `1 MiB`; `README.txt`: `256 KiB`;
- maximum per-entry and aggregate compression ratio: `100:1`;
- maximum internal path: `240` UTF-8 bytes, depth `5`;
- only the exact paths/patterns in §8; no absolute path, drive prefix, backslash, NUL, empty
  component, `.`/`..`, percent-decoded alias, symlink or special-file flag;
- duplicate raw names and duplicates after UTF-8 decode are rejected;
- every manifest path appears exactly once in ZIP and ZIP contains no unmanifested file except
  directory records;
- CRC, declared size, actual size and SHA-256 must all agree;
- JSON parser rejects duplicate keys and excessive nesting (`64`) before schema validation.

The outer user-selected package filename and `original_name` metadata may contain valid Unicode,
Hebrew and RTL marks and must round-trip without becoming identity. Internal paths remain fixed
ASCII; an arbitrary Unicode/RTL internal entry is rejected as unmanifested, not normalized into
an allowlisted path. Missing/corrupt entries fail before OPFS writes.

## 11. No-write dry-run contract

`dryRun(files, localInventory)` is pure with respect to OPFS/server/provider state. The test
adapter must fail if it receives `dbRun`, `execRaw`, `MediaStore` or network calls.

The result is canonical and includes:

```text
package/schema/mode/content root
included and excluded privacy classes
new | reusable | rebindable | conflict counts by node type
text_key action
caption/table selected heads and history completeness
missing/exact/mismatched media state
local UUID remap preview
projected compatibility-row count
estimated write rows/bytes
blocking errors and non-blocking warnings
plan_sha256
```

Dry-run never changes a selected/current pointer. Apply requires an explicit user gesture over an
unchanged `plan_sha256`; any local-state drift requires a new dry-run.

## 12. Transactional OPFS import

P2 does not call tolerant `importBundle()` as the authoritative path. The repository composes
with the existing SQLite connection and runs exactly one named savepoint:

```sql
SAVEPOINT p2_portable_import;
-- insert/reuse immutable media package, tracks and caption revisions
-- insert/reuse text, material, table revisions and row versions
-- establish exact mappings and selected pointers
-- rebuild compatibility texts/sentences from the selected table revision
-- re-read every object and compare portable/existing hashes
-- insert durable receipt, including before-pointers and portable↔local map
RELEASE p2_portable_import;
```

On every error after SAVEPOINT:

```sql
ROLLBACK TO p2_portable_import;
RELEASE p2_portable_import;
```

No media file is written, so all P2 canonical writes are inside OPFS SQLite. Every write/rebind
stage has a fault-injection gate. Receipt insertion is the last write; a receipt can never claim
a rolled-back import.

## 13. Insert, reuse, rebind and collision semantics

Apply order is fixed: package → tracks → caption revisions → text/material → table/rows → exact
bindings → compatibility projection → re-read hashes → receipt.

- portable ID absent locally: insert immutable object and record local mapping;
- portable ID present with same hash: reuse, never duplicate;
- portable ID present with different hash: hard conflict, roll back all;
- same canonical hash under another local ID: reuse that object and map the portable ID;
- missing local `text_key`: create a new local text UUID and material mapping;
- same `text_key` and same selected table+mapping+binding hashes: reuse/rebind only;
- same `text_key` with any different selected hash: `TEXT_KEY_CONTENT_CONFLICT`; no replace,
  rename, fork or overwrite in P2;
- sentence/material/table local IDs may remap; portable IDs and segment fragments may not;
- selected pointers advance only for a new material or an exact same-base closure;
- field authority/manual locks are part of row hash and cannot be weakened during import;
- navigation/import generates zero revisions beyond those explicitly present in the package and
  makes zero provider/model requests.

## 14. Idempotent re-import and durable receipt

Additive migration v47 is necessary because no current table can durably preserve package-root
idempotency plus portable↔local maps without overloading content/projection tables.

Exact proposed migration:

```sql
CREATE TABLE IF NOT EXISTS studio_portable_import_receipts (
  receipt_id             TEXT PRIMARY KEY,
  portable_package_id    TEXT NOT NULL,
  content_root_sha256    TEXT NOT NULL,
  manifest_sha256        TEXT NOT NULL,
  schema_version         INTEGER NOT NULL CHECK(schema_version = 2),
  package_mode           TEXT NOT NULL CHECK(package_mode IN ('snapshot','archive')),
  status                 TEXT NOT NULL CHECK(status IN ('committed','rolled_back')),
  plan_sha256            TEXT NOT NULL,
  result_sha256          TEXT NOT NULL,
  counts_json            TEXT NOT NULL,
  id_map_json            TEXT NOT NULL,
  rollback_json          TEXT NOT NULL,
  missing_media_json     TEXT NOT NULL DEFAULT '[]',
  created_at             TEXT NOT NULL,
  rolled_back_at         TEXT,
  UNIQUE(portable_package_id, content_root_sha256)
);
CREATE INDEX IF NOT EXISTS ix_studio_portable_receipts_root
  ON studio_portable_import_receipts(content_root_sha256, status);
```

The JSON columns contain IDs, hashes, counts, created/reused flags and before-pointers only; no
caption/table/note content. A repeat with the same package ID/content root returns the committed
receipt after revalidating manifest/checksums and local referenced hashes: zero inserts, zero
rebinds, zero revisions. Same content root with different export provenance is still idempotent.

## 15. Full rollback and explicit undo

- Any Apply failure uses the savepoint and leaves pre-import row counts, hashes and pointers
  byte-equivalent.
- After a committed import, explicit Undo uses `rollback_json`: restore previous pointers first,
  delete only objects marked `created` and still unreferenced, never delete reused objects, then
  rebuild the prior compatibility projection and mark the receipt `rolled_back`.
- Undo itself is one transaction with fault injection and re-read/hash verification.
- If any created object gained a later external reference, Undo stops with a dry-run conflict;
  it never partially deletes.
- Migration rollback does not drop v47. Older code ignores the additive table; release rollback
  restores code while receipts stay inert and recoverable.

## 16. Full-backup coverage

Every ordinary local full ZIP backup must:

1. keep existing library/notes/audio/state behavior;
2. export one P2 `archive` for every promoted learning material;
3. write `learning-packages/index.json` with material portable ID, text key, content root,
   archive path and coverage status;
4. write each archive under `learning-packages/<content-root>.lplp.zip`;
5. record counts in the outer manifest;
6. abort the backup if any promoted material cannot be archived. `NOT_INCLUDED` is allowed only
   in a separately labelled legacy/compat export, never in a file called full backup.

Restore imports the library payload, then runs verify/dry-run/Apply for each embedded archive.
Each package is atomic and receipt-backed. The final restore report is PASS only if every indexed
content root is committed/reused and the semantic oracle matches. Notes/bookmarks/progress/review
memory remain covered once by the existing library backup, not duplicated inside every package.

## 17. Text-card/table compatibility

- `learning/text-card.json` uses existing `linguistpro-text-card-v2` shape and `text_key`.
- Its declared semantic hash covers portable display fields/provenance, not local IDs/export time.
- Import verifies it equals a projection independently generated from the selected immutable
  table revision.
- Writes always originate from table canon through the guarded compatibility projector.
- `he_norm`, `row_hash` and educational projections remain rebuildable; derived niqqud never
  becomes asserted; manual locks and field authority survive exactly.
- Existing `smoke:text-card`, legacy bundle and v1 Media Package gates remain mandatory.

## 18. Media relink without transport

Manifest always says `media.included=false`. Dry-run compares the expected SHA against local
content-addressed inventory without reading unrelated user files. Missing media is a usable-text
state with an explicit relink CTA. Relink:

1. runs only after a user-selected local file;
2. hashes bytes before any canonical pointer write;
3. requires exact SHA-256, then records MIME/size/name/local path;
4. never changes caption/table/package identity;
5. makes zero server/provider calls.

Mismatch leaves canon and OPFS unchanged.

## 19. Delete and GC semantics

- Deleting an exported ZIP never deletes local canon.
- Package/material delete first builds a read-only reverse-reference plan from real stores and
  committed receipts.
- Reused objects and any object reachable from a material, binding, selected head or another
  committed receipt are retained.
- Created immutable objects are deleted leaf-to-root only under one transaction and only after
  exact zero-ref proof.
- Unreferenced `studio_learning_row_versions` may be GC'd only by exact IDs after the transaction
  proves no `studio_table_revision_rows` reference.
- Media bytes use the existing last-reference policy; P2 package deletion alone never deletes
  media.
- Post-delete gates: `PRAGMA foreign_key_check`, pure graph rebuild, zero dangling edges, receipt
  with retained/deleted/eligible counts. Unknown references stop deletion.

## 20. Security, privacy and cost gates

- corrupt/missing/checksum/duplicate/future-schema/path/bomb failures occur before writes;
- no secrets, provider keys, device IDs, OPFS paths or server coordinates enter the package;
- provenance is allowlisted and content-minimized;
- package export/import/reimport/navigation/relink planning makes zero provider/model calls;
- no automatic media transport, cloud sync, E2EE, Hermes or network fallback;
- optional personal notes/memory are not silently bundled; their existing full-backup boundary is
  stated in UI and manifest;
- all UI is premium mobile-first, keyboard accessible, RU/LTR and HE/RTL safe at 380 px.

## 21. Exact performance and browser gates

Run on fresh Chromium with the same fixture content across modes. These are acceptance ceilings,
not claims of measurements. If red baseline cannot meet them, stop and return measurements;
do not silently relax them or add media bytes/worker/server scope.

| Fixture | Export snapshot/archive | Verify snapshot/archive | Dry-run snapshot/archive | First import snapshot/archive | Idempotent re-import |
|---|---:|---:|---:|---:|---:|
| 514 rows, 20 revisions | 2s / 6s | 1.5s / 4s | 1s / 2s | 5s / 15s | 3s |
| 2,800 rows, 20 revisions | 5s / 20s | 4s / 12s | 3s / 8s | 15s / 45s | 10s |

Additional gates:

- peak JS heap ≤`256 MiB` for 514 archive and ≤`512 MiB` for 2,800/20 archive;
- no media bytes loaded; compressed/uncompressed sizes remain under §10 caps;
- main-thread long task ≤`200 ms`; progress UI updates at least every `500 ms`;
- cancel before Apply writes nothing; cancel is disabled only inside the bounded SAVEPOINT and
  resolves after commit/rollback;
- 380 px RU/LTR and HE/RTL: no horizontal overflow, readable filename/privacy/conflict states,
  sticky Apply bar does not cover the plan, touch targets ≥44 px;
- fresh ephemeral profile export→import→cold reopen→re-export passes;
- provider request count `0`, page/console errors `0`.

## 22. Independent semantic/hash oracle

The acceptance oracle must not import production P2 modules. A Node script uses `node:crypto`,
its own strict JSON tokenizer/canonical encoder and its own graph/reference checks to compare:

- source vs imported portable node `(type,id,canonical_hash)` sets;
- asserted edge sets;
- caption revision existing hashes and VTT semantic tuples;
- table content/mapping hashes, field authority/locks and exact 0/1/N mappings;
- source vs re-export `content_root_sha256` while ignoring non-semantic export provenance;
- zero duplicate local immutable objects after re-import;
- pre/post fault row counts/hashes/pointers.

Production and oracle agreeing is necessary; source fixtures are never rewritten to make the
oracle pass.

## 23. Exact implementation allowlist and sequence

No file outside this allowlist may change without a new owner decision:

```text
public/db/migrations.js
public/js/portable-learning-package-core.js                         # new
public/js/portable-learning-package-repository.js                   # new
public/js/studio-portable-learning-package.js                       # new
public/js/media-package-repository.js                               # transaction-owned reuse hooks only
public/js/material-revision-repository.js                           # transaction-owned import/project hooks only
public/index.html                                                   # one export/import surface + full-backup integration
public/sw.js                                                        # precache entries; version bump only with release authority
public/i18n/locales/en.js
public/i18n/locales/ru.js
public/i18n/locales/he.js
package.json                                                        # P2 smoke commands; release version under later deploy authority
tests/portableLearningPackageCore.test.js                           # new
tests/portableLearningPackageRepository.test.js                     # new
tests/portableLearningPackageSecurity.test.js                       # new
tests/portableLearningPackageBackup.test.js                         # new
tests/portableLearningPackageUi.test.js                             # new
scripts/premium/portable-learning-package-browser-smoke.js          # new
scripts/premium/portable-learning-package-performance-smoke.js      # new
scripts/premium/portable-learning-package-oracle.js                 # new, independent
docs/research/studio-p2-portable-learning-package/2026-08-02/OWNER_LIVE_PACKET.md # new
docs/research/studio-p2-portable-learning-package/2026-08-02/screenshots/*       # new evidence only
this packet and the four canonical roadmap/continuity docs that link it
tests/mediaPackageRepository.test.js                                # addendum: count 46→47 only
tests/materialRevisionRepository.test.js                            # addendum: count 46→47 only
scripts/premium/media-package-performance-smoke.js                  # addendum: count 46→47 only
scripts/premium/material-revision-performance-smoke.js              # addendum: count 46→47 only
```

Sequence:

1. T0 re-check HEAD/origin/dirty tree/actual migration count and write red oracle/security tests.
2. T1 pure canonical serializer, node/edge builder and strict validator.
3. T2 v47 receipt migration and repository dry inventory.
4. T3 snapshot/archive writers and deterministic content root.
5. T4 strict central-directory/checksum/schema verifier and no-write dry-run.
6. T5 SAVEPOINT insert/reuse/rebind/project/receipt with fault injection at every write.
7. T6 re-import, explicit undo, delete/GC and full-backup coverage.
8. T7 one premium export/import UI and RU/HE 380 px accessibility.
9. T8 514 and 2,800/20 performance plus independent oracle.
10. T9 fresh-profile round-trip, cold reopen and owner-live packet.
11. Stop before push/deploy. Release version/SW cache bump and production authority are separate.

## 24. Rollback, Definition of Done and owner-live

Rollback procedure:

1. Before implementation, export a current full backup and record schema/count/hash inventory.
2. Migration v47 is additive and never dropped during rollback.
3. Failed import proves savepoint rollback by independent before/after oracle.
4. Successful test import is undone through its receipt; reused canon survives.
5. Code rollback restores the pre-P2 client; v47 receipts remain inert.
6. Any mismatch, dangling reference, receipt disagreement or provider request stops the slice.

Definition of Done:

- all node/relation/identity/manifest/security contracts above implemented exactly;
- snapshot/archive truth flags and closure verified;
- dry-run performs zero writes; Apply is one savepoint with complete fault coverage;
- receipt/id map durable across cold reopen; same package re-import creates zero duplicates;
- same-ID/different-hash and text-key/different-table block without mutation;
- full backup includes every promoted material archive or aborts honestly;
- text-card/table/VTT independent oracle passes;
- media missing/relink/delete/GC leave no dangling graph reference;
- required existing and new gates pass, including 514 and 2,800/20 ceilings;
- fresh Chromium desktop plus 380 px RU/LTR and HE/RTL pass with zero provider calls/errors;
- scoped local implementation commit and owner-live packet exist;
- no push/deploy or excluded scope occurred.

Owner-live procedure after engineering PASS:

1. Fresh ordinary Chromium profile; record browser/build/device and package hashes only.
2. Export snapshot and archive from a real owner material without changing it.
3. Review privacy/history/media statements and dry-run on a second fresh profile.
4. Apply, cold reopen, verify exact selected caption/table, 0/1/N mapping, manual locks and text
   card; relink an owner-selected exact-SHA media file if desired.
5. Re-import and confirm the same receipt/zero duplicates; re-export and compare semantic root.
6. Check desktop RU, 380 RU/LTR and 380 HE/RTL, zero provider calls/page errors.
7. Do not claim OWNER LIVE PASS from synthetic automation alone.

## 25. Gap matrix

| Requirement | Canonical source | Code anchor | State | Required decision/test |
|---|---|---|---|---|
| graph node types | L3b plan §3.2; REPORT §3.3 | `public/db/migrations.js` v45/v46 | resolved §3 | unknown type red test |
| relation/integrity | REPORT §3.4 | `public/js/media-package-repository.js`; `material-revision-repository.js` | resolved §4 | dangling/type/acyclic tests |
| portable identity | Workspace §6; REPORT §5.2 | `material-revision-repository.js::promoteLegacyText/insertRevision` | resolved §5 | local-UUID perturbation oracle |
| caption→table→material→card | Workspace §§6,9,12 | both repositories; `public/js/text-card-format.js` | resolved §6 | exact chain/hash test |
| snapshot/archive | L3b §§3.4,6 | `studio-media-package.js::snapshotForExport` | resolved §7 | closure/truth-flag tests |
| manifest | L3b §3.3; REPORT §5.1 | `studio-media-package.js::buildSlimPackageFiles` | resolved §8 | strict-schema golden fixture |
| serialization/checksums | L3a §11 | `media-package-core.js::canonicalJson`; `material-revision-core.js::stableStringify` | resolved §8 | independent byte oracle |
| future schema | L3b §6 faults | `studio-media-package.js::verifySlimPackageFiles` | resolved §9 | v3 rejection before writes |
| migration | L3b §3.2 | `public/db/migrations.js` entries 45/46 | resolved: v47 receipt only | migration collision/idempotency |
| dry-run | L3b §6 | no current P2 surface | resolved §11 | adapter write/network trap |
| transactional import | L3b §6 | repository `transaction`; `local-db.js::importBundle` SAVEPOINT precedent | resolved §12 | every-stage fault matrix |
| insert/reuse/rebind | REPORT §5.4 | `media-package-repository.js::importSnapshot/bindText` | resolved §13 | all action combinations |
| idempotent re-import | REPORT §5.4 | no durable P2 map | resolved §§13–14 | cold-reopen re-import |
| same ID/hash policy | L3a §11; L3b §6 | v1 ID conflict | resolved §13 | same/same and same/different |
| full rollback | R13; L3b §6 | `public/db/local-db.js::importBundle` SAVEPOINT/ROLLBACK | resolved §§12,15 | hash/count/pointer oracle |
| durable receipt | L3b §6 | absent | resolved: v47 | cold reopen/undo tests |
| full-backup coverage | REPORT §5.5 | `local-db.js::exportBundle`; `index.html::v3LibraryExportBundle` | resolved §16 | every-material index/restore |
| text-card/table compat | Workspace §12 | `text-card-format.js::buildCardPayload/cardToBundle`; material projector | resolved §17 | independent projection parity |
| SHA media relink | L3a §10 | `media-package-repository.js::relinkMedia`; `studio-media-package.js::verifyRelinkBytes` | resolved §18 | match/mismatch/no-write |
| delete/GC | L3a §13 | `studio-media-package.js::deletePackageAndGc` | resolved §19 | reverse-ref + FK/graph oracle |
| security limits | R14; L3b §6 | `studio-media-package.js::importSlimZipFile` lacks P2 caps | resolved §10 | bomb/path/count/corrupt corpus |
| 514 rows | Workspace owner fixture | `scripts/premium/material-revision-performance-smoke.js` | resolved ceiling §21 | measure red/green |
| 2,800/20 | L3b §6 | `scripts/premium/material-revision-performance-smoke.js` | resolved ceiling §21 | measure red/green |
| fresh Chromium round-trip | L3b §6 | `scripts/premium/material-revision-browser-smoke.js` pattern | resolved §§21,24 | export/import/cold/re-export |
| RU/HE 380 px | R4; roadmaps | locale files + material browser harness | resolved §21 | screenshots/overflow/a11y |
| semantic/hash oracle | R11 | existing cores are not independent | resolved §22 | separate Node oracle |
| exact allowlist | L3b §5 exit | live file inventory | resolved §23 | staged allowlist assertion |
| rollback procedure | R13 | `public/db/migrations.js`; repository transaction patterns | resolved §24 | code/import/undo drill |
| Definition of Done | L3b §6 exit | gates above | resolved §24 | all evidence in owner packet |
| owner-live | project process | prior owner-live packet pattern | resolved §24 | real owner ceremony; no overclaim |

No design decision in this matrix remains open. Empirical gate results, the exact future release
version, push/deploy permission and the owner's real-device ceremony remain execution evidence,
not design gaps.

## 26. Hard exclusions

- server/cloud sync, autosync, E2EE, Hermes or agent access;
- media bytes inside package or automatic media transport;
- concurrent multi-device editing or conflict-branch application;
- L2/L4/L5/L6;
- provider default/contract change, model call or implicit fallback;
- mutable `sentences`/text-card as a new authority;
- coarse mutable table cells in place of immutable revisions;
- migration other than the exact additive v47 receipt table;
- push, deploy or production changes without separate exact authority.

## 27. Paste-ready exact owner authorization sentence

The following sentence is a proposal only. Its presence here is not approval:

> **ОДОБРЯЮ реализацию P2 Portable Learning Package v2 строго по implementation packet 2026-08-02. Разрешаю один bounded browser-local engineering slice T0–T9: red-before-fix pure Artifact Graph и independent semantic/hash oracle; exact snapshot/archive canonical serializer и checksum/security verifier; additive browser migration v47 только с таблицей studio_portable_import_receipts после подтверждения MIGRATIONS.length=46; no-write dry-run; transactional OPFS-SQLite import/reuse/rebind под одним SAVEPOINT с полным rollback, durable receipt и idempotent re-import; full-backup coverage; text-card/table compatibility; SHA-only media relink; delete/GC integrity; 514-row и 2,800-row/20-revision performance gates; fresh Chromium desktop, RU/LTR и HE/RTL 380 px owner-live packet. Разрешаю только exact file allowlist из §23 и один локальный scoped implementation commit. Не разрешаю push/deploy, production/server schema или data mutations, cloud sync, E2EE, Hermes, media bytes/automatic media transport, concurrent multi-device editing, L2/L4/L5/L6, provider-default changes или implicit fallback. Остановись перед push/deploy.**

## 28. Implementation evidence — 2026-08-02

The owner supplied the exact §27 sentence, the four-file migration-count addendum, and later
approved the scoped production deploy and bounded post-deploy cache cleanup. The bounded
implementation is production-closed at `v3.11.289` after the scoped real-data
decimal-provenance fix; the durable evidence ledger is:

`docs/research/studio-p2-portable-learning-package/2026-08-02/OWNER_LIVE_PACKET.md`.

Current evidence:

- new pure/repository/security/backup/UI suite: 24/24 PASS;
- migration registry: 47; v45/v46 remain at indices 44/45;
- 514 and 2,800-row/20-revision performance ceilings: PASS;
- independent oracle and source→cold-reopen→re-export semantic root: PASS;
- fresh Chromium desktop RU, 380 RU/LTR and 380 HE/RTL: PASS;
- actually served APP/CACHE: `3.11.289` / `v3.11.289`; health, DB and migrations ready;
- real owner Chrome material: 472-row snapshot/archive build, strict verify and no-write dry-run
  PASS; inventories and receipt count unchanged;
- provider/model calls 0; app/page errors during the ceremony 0;
- post-deploy builder cleanup removed 11 unused cache records and reclaimed about 1.35 GiB;
  disk warning cleared at 79%, with containers, volumes, images and references unchanged;
- real Apply/relink/undo and iPhone ceremony were not authorized/run, so owner-live remains
  `PARTIAL OWNER PASS` rather than complete.
