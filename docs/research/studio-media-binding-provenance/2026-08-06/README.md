# Studio — media binding vs row provenance mismatch: evidence snapshot

> **Date:** 2026-08-06
> **Kind:** raw read-only measurement of a live owner profile (no mutation performed)
> **Surface:** production `https://linguistpro.kolosei.com`, `APP_VERSION=3.11.314`
> **How generated:** read-only `window.__localDB.dbQuery(...)` probes executed in the owner's
> browser tab through the Kapture MCP bridge, plus one local `Get-FileHash -Algorithm SHA256`
> over the owner-supplied source video. No `dbRun`, no `execRaw`, no export, no network call.
> **Related packet:** `docs/planning/STUDIO_MEDIA_BINDING_PROVENANCE_DECISION_PACKET_2026_08_06.md`

## Privacy

This repository is public. Card titles, transcript lines and local filesystem paths are **not**
reproduced here. Entities are anonymised; hashes are truncated to 8 hex characters, which is enough
to act on and carries no content. The owner holds the full mapping in the originating session.

| Label | What it is |
|---|---|
| `TEXT-A` | media-imported card, 432 rows, healthy |
| `TEXT-B` | the card under investigation, 561 rows, built 2026-08-05 |
| `TEXT-C` | archived earlier card over the same source as `TEXT-B`, 639 rows |
| `PKG-1` | media package `mpkg:af77ff0c…`, video/mp4, 136 814 028 B, 2 517 182 ms — the media of `TEXT-A` |
| `PKG-2` | media package `mpkg:00c088eb…`, the true source of `TEXT-B`/`TEXT-C` — **deleted from the profile** |

## Measured facts

### 1. `TEXT-B` is bound to the wrong media

| Fact | `TEXT-A` | `TEXT-B` |
|---|---|---|
| rows in `sentences` | 432 | 561 |
| `studio_text_media_bindings.package_id` | `PKG-1` | **`PKG-1`** |
| row provenance in `mapping_json` / `sentences.edit_meta_json` | `PKG-1` | **`asrseg:00c088eb…:N` × 561 (`PKG-2`)** |
| bound caption revision segment count | 432 | 432 (belongs to `PKG-1`) |
| rows carrying `caption_segment_id` | all | **0 / 561** |
| row in `studio_learning_materials` | present | **absent** |

`TEXT-B` and `TEXT-C` share identical leading source rows, confirming both derive from `PKG-2`.
`TEXT-A`'s bound transcript content is unrelated to `TEXT-B`'s rows.

### 2. `PKG-2` and its transcript no longer exist

- `studio_media_packages` holds 7 rows; `PKG-2` is not among them (hard delete, not `deleted_at`).
- `studio_caption_tracks`: 7 `raw_original` + 7 `user_corrected`, none for `PKG-2`.
- `studio_caption_revisions`: 18 rows, **0 dangling** — every revision belongs to a live track.
- `TEXT-C`'s learning material still stores `package_id = PKG-2` (dangling reference), and its table
  revision binds `rev:959bc9f7…`, which no longer exists.
- `TEXT-C`'s binding row was cascade-removed with the package; `TEXT-B`'s was not, because it points
  at `PKG-1`.

### 3. Timings are unrecoverable from the database

Checked every place a start/end could hide:

| Location | Content |
|---|---|
| `studio_table_revision_rows.mapping_meta_json` (`TEXT-C`) | `{}` for sampled rows |
| `studio_table_revision_rows.source_segment_ids_json` | `srcseg:00c088eb…` identifiers only |
| `sentences.edit_meta_json._studio_source` (`TEXT-C`) | ids + `source_line_index`, schema `studio-row-source-v2` |
| `sentences.edit_meta_json._studio_source` (`TEXT-B`) | ids + `source_line_index`, schema `studio-row-source-v1`, **no `caption_segment_id`** |

`start_ms`/`end_ms` live only in `studio_caption_revisions.segments_json`, which was deleted with
`PKG-2`. Re-deriving timing therefore requires a fresh transcript (ASR or imported subtitles);
row↔segment linkage must then come from text alignment, never from row index.

### 4. The source media is byte-identical to the deleted package

Owner supplied the original file. Local `Get-FileHash -Algorithm SHA256`:

```
size   : 125 282 942 bytes
sha256 : 00c088ebdcb235eebb1c7ee55e2bf2d37e6d2c656dcc6fb964cbfd0aff57a692
expected (deleted PKG-2 identity) : 00c088ebdcb235eebb1c7ee55e2bf2d37e6d2c656dcc6fb964cbfd0aff57a692
match  : true
```

Because a package's identity is `mpkg:` + `media_sha256`, re-importing this file reconstructs
`PKG-2`'s identity exactly and heals `TEXT-C`'s dangling `package_id` by construction.

### 5. Import Center visibility

Live `StudioPortableLearningPackage.getCatalog()` returned **5** materials. `TEXT-B` is absent —
the catalog is built `FROM studio_learning_materials JOIN texts`, and `TEXT-B` has no material row.
`StudioPortableLearningPackage.materialForText(TEXT-B)` returns `null`.

Live `listWorkspaces({limit:20})` returned **7** rows, each titled by media filename; none of them
represents `TEXT-B`, whose media is gone.

## What this evidence does and does not establish

- **Established:** the binding of `TEXT-B` contradicts its own row provenance; the contradiction was
  writable because no code compares the two; the true media is recoverable, the timings are not.
- **Not established:** the exact moment `PKG-2` was deleted relative to the 2026-08-05 build, and
  therefore whether the ambient workspace reference was stale or merely wrong. The fix does not
  depend on this distinction — either way the write must be gated on provenance.

## Files

This directory contains only this README. The measurements are reproduced inline above rather than
as dumps, because the raw query output contains the owner's private library content.
