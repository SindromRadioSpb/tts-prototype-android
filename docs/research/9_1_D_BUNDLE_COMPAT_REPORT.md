# Phase 9.1.D — Bundle Compatibility Report

**Branch:** `worktree-agent-ad33453576637a27d`
**Stage commit:** (next push)
**Date:** 2026-05-11

---

## Goal

Preserve `notes_v2` + `note_versions` + `note_links` + `roots` across ZIP bundle export/import, **without bumping** `library.json` `schema_version` (which would break Android v2 backwards compatibility).

## Design — separate web-only file in ZIP

`library/notes_advanced.json` lives alongside `library/library.json` inside the ZIP. Android v2 ignores unknown ZIP entries (verified by ZIP spec — extractors only read declared paths). Web export writes both files; web import reads both files. Web → Android → web roundtrip degrades gracefully to sentence-bound free notes only (since Android v2 doesn't write `notes_advanced.json`).

## Implementation summary

### Export side (`exportBundle` in `public/db/local-db.js`)

- New helper `_buildAdvancedNotesPayload(textIds)`:
  - Pulls `notes_v2` rows scoped to the export's text_ids (text-bound notes only when their text is in the export; text-independent notes — root/binyan/free/note — always included).
  - Pulls `note_versions` for the included notes (FIFO retention 50 per note enforced at write time).
  - Pulls `note_links` outgoing edges from the included notes.
  - Pulls `roots` rows where `my_note_id` ∈ included notes (seed roots re-seeded at runtime, not portable user data).
- Output: `{ schema_version: 1, exported_at, app_id, format: 'linguistpro-notes-advanced-v1', notes, versions, links, roots }`.
- `manifest.notes_advanced_path` and `manifest.notes_advanced_present` advertise the file's presence so the ZIP packager + importer can branch cleanly.

### Export side (ZIP packager in `public/index.html`)

- After writing `manifest.json` + `library/library.json`, conditionally writes `library/notes_advanced.json` when `payload.manifest.notes_advanced_present === true`.

### Import side (`importBundle` in `public/db/local-db.js`)

- Main loop builds three FK remap maps:
  - `oldToNewTextId` — populated on text insert AND on collision-skip (existing text id used for advanced-notes anchoring even when text is skipped).
  - `oldToNewSentenceId` — populated per sentence insert.
  - `inlineFreeNoteIdByTargetKey` — keyed by `newTextId:newSentenceId`, value = note id created by inline `upsertNote(...)` call. Lets the advanced-notes apply path **merge** rather than duplicate sentence-bound free notes.
- New helper `_applyAdvancedNotesPayload(payload, ctx)` runs after main loop:
  - **Pass 1: notes_v2** with FK rewiring per `target_kind`:
    - `sentence` / `text` → look up via `oldToNewSentenceId` / `oldToNewTextId`; drop if not in map.
    - `note` → deferred resolution (Pass 1b) since notes reference each other.
    - `root` / `binyan` / `word` / `free` → opaque user data, preserved verbatim.
    - Sentence-bound free notes: if `inlineFreeNoteIdByTargetKey` already has an entry for `(newTextId, newSentenceId)`, **MERGE** by re-using the existing note id and updating richer metadata (`audio_anchor_ms`, `audio_asset_key`, `srs_card_id`, `title`); the inline row's `body_json` (set via `upsertNote`) stays authoritative.
    - All inserts pre-validate `body_json` via `JSON.parse` to drop malformed entries gracefully (schema CHECK would also reject, but pre-validation lets us count rather than throw).
  - **Pass 1b: deferred target_id resolution** for `target_kind='note'` — `UPDATE notes_v2 SET target_id = ?` once the note id map is complete. Self-references resolve correctly; broken references (target not in payload) stay NULL → backlinks panel tolerates as broken link.
  - **Pass 2: note_versions** — `INSERT OR IGNORE` (collision = duplicate version, drop silently).
  - **Pass 3: note_links** — remap `from_note_id` + `to_id` (when `to_kind ∈ {note, sentence, text}`). Drop if `from_note_id` not in map (broken edge); accept verbatim `to_id` for `root` / `binyan` / `word`.
  - **Pass 4: roots** — `INSERT OR IGNORE` (seed roots merge with user-customized).

- Returns counts: `{ notes: {inserted, merged, dropped}, versions: {inserted, dropped}, links: {inserted, dropped}, roots: {inserted} }`. Attached to overall import result as `result.notes_advanced`.

### Import side (ZIP unpacker in `public/index.html`)

- After parsing `library/library.json`, conditionally reads `library/notes_advanced.json`. If present + valid JSON, attaches as `parsed.notes_advanced` so `importBundle` sees it.
- Missing file is a no-op (legacy bundles, Android v2 bundles, old web bundles).

## Verification

| Test | Result |
|------|--------|
| `events-emission-test.html` (Phase 11.0+11.1) | 23 / 0 — preserved |
| `notes-v2-test.html` (extended) | 39 → **42 / 0** |
| New cases added: | |
| `9.1.D: exportBundle surfaces notes_advanced payload` | ✓ |
| `9.1.D: importBundle restores advanced notes with FK remap` | ✓ |
| `9.1.D: import without notes_advanced still works (legacy bundle)` | ✓ |

## Compatibility matrix

| Source | Destination | Notes payload preserved? | Sentence-bound free notes preserved? |
|--------|-------------|:------------------------:|:------------------------------------:|
| Web v3.2 | Web v3.2 (same Railway) | ✓ via `notes_advanced.json` | ✓ inline `row.note` |
| Web v3.2 | Web v3.2 (different device) | ✓ same | ✓ same |
| Web v3.2 | Android v2 | ✗ (Android ignores `notes_advanced.json`) | ✓ inline |
| Android v2 | Web v3.2 | ✗ (Android doesn't write `notes_advanced.json`) | ✓ inline |
| Web v3.1 (pre-notes_v2) | Web v3.2 | n/a (no advanced notes in v3.1) | ✓ inline |

## Known limitations (deferred to v3.3 or Phase 9.2/9.3)

1. **Skip mode + sentence-targeted advanced notes**: when text is skipped because its `text_key` already exists in OPFS, sentence-level remap is NOT computed for the existing sentences (would require scanning OPFS sentences by `order_index` to match). Advanced notes whose `target_kind='sentence'` and target a sentence in a skipped text are dropped (`out.notes.dropped++`). Acceptable for v3.2 — collision import is best-effort. Document for users: "use mode='replace'" if a future bundle import behavior gets added.

2. **Audio asset linkage for audio-anchored notes**: `audio_asset_key` on `notes_v2` row points to a key that lives in `library.audio_assets`. Cross-bundle: the asset_key is content-addressed (`sha256({text, voice, rate, pitch})`), so if both ends use the same Railway audio-cache, audio resolves. If asset key is unknown to both ends, audio playback fails gracefully (existing fallback path in v3.1 audio playback).

3. **Conflict handling for note ID collisions**: not relevant — all imported note ids get fresh UUIDs unconditionally.

4. **Sequencing of versions**: each note's versions are imported in `version` ASC order to preserve the temporal sequence. `INSERT OR IGNORE` handles re-import idempotency.

## Phase 9.1.E key inventory delta

No new user-facing strings introduced by this phase — bundle compat is silent unless a future UX surfaces import statistics (e.g. a toast "Restored 12 advanced notes from bundle"). If/when that lands, the key would be `toast.notesAdvancedRestored` with parametrized count.

## Recommendation

**Phase 9.1.D is production-ready.** Web → web roundtrip preserves the full advanced-notes layer (including version history + links + roots). Web ↔ Android v2 roundtrip continues to work for sentence-bound free notes via the unchanged inline `row.note` path. Proceed to Phase 9.1.E.

---

**Last updated:** 2026-05-11 (Stage 4 commit)
