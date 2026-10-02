# Large-library transfer repair — 3.11.720

## Observed failure

Owner production tab at 3.11.719: prepare failed with `RangeError: Invalid string length` at `clone → libraryForPrivacy → build`. Read-only inventory has 644 texts, 85,404 rows, 65 learning packages and 76 workspaces. Canonical text JSON totals 262,605,410 UTF-8 bytes; audio metadata adds 4,090,451 bytes. The export wrapper repeats compatibility aliases of the canonical arrays. Whole-wrapper stringify cloned both copies and additionally serialized personal records even when excluded.

## Contract and implementation

- Copy canonical texts individually, keep output compatibility aliases pointing to the copied arrays, preserve source data and paid provenance. Strip private data only in the copy.
- Write each text as a separate SHA-verified `library/texts/<hash>.json` entry. `library/library.json` uses metadata schema 2 with an ordered `text_chunks` index. Older importers reject the new library version; they cannot silently import an empty index as a library.
- Reconstruct schema 1 for the existing canonical importer only after every archive payload passes integrity verification. Reject missing, repeated, mismatched and unreferenced chunks before any recipient write. Continue reading old schema-1 transfer archives.
- Preserve existing limits of 256 MiB per metadata entry and ZIP64 media streaming. Source-media and TTS choices remain independent. No TTS regeneration.

## Validation

- 15 transfer tests passed, including canonical-alias regression, nested source-copy isolation, chunk reconstruction/order, schema-1 compatibility and malformed chunk rejection.
- Shell precache/integrity parity: 2 tests passed.
- Owner scale preparation with private data, source media and TTS excluded: 644 texts / 85,404 rows / 65 packages / 76 workspaces; 644 text chunks; 334,517,036 total payload bytes; largest metadata entry 16,478,902 bytes. Original DB and original saved ZIP unchanged. Candidate functions were loaded into the existing tab without reload; this is owner candidate evidence, not deployed-production evidence.
- Owner archive write/read verification: PASS. Temporary ZIP64: 335,969,155 bytes; all payload CRC/SHA checks passed; restored metadata has 644 texts / 85,404 rows with original text order, identities and source text. Temporary file removed.
- Clean-profile browser playback/restore: PASS, including all source-media/TTS choices, repeated restore, foreign-account tutor consent, legacy media/YouTube alignment and real offline MP3/video decode. See `local/browser-evidence.json`. First run failed the aggregate no-write snapshot; diagnostic rerun passed, with unresolved transient documented as O-057.
- Production PASS: commit `9b56e4708ca9470d6f6525239e1b303f25a32440`, deployment queue 2593 finished 2026-10-02 19:20:32 UTC. Three no-cache version/health/exact asset SHA probes and separate clean-profile production restore/playback passed; see `production/served-assets.json` and `production/browser-evidence.json`.

Server preflight: 4.4G free (88% used), all 11 images referenced by 12 running containers, 4 active volumes, zero build cache. No pre-deploy cleanup targets.

Post-deploy authorized cleanup removed only unreferenced previous 3.11.719 image and unused build cache (2.485GB). Current runtime, all 12 running containers and all 4 data volumes retained. Final 4.4G free (88%), 11 active images, zero build cache; DB/migrations ready. See `production/cleanup.json`.

Owner actual UI prepare: PASS. Current selected choices preserved (MP3 enabled; all 70 source-media files and learner history excluded). Ready Save button: 644 texts / 85,404 rows / 65 packages / 76 workspaces; 9,124 MP3 asset bindings, 9,099 deduplicated payload files; 718,110,341 payload bytes. 121 MP3 could not be obtained and are explicitly listed as missing; therefore partial_backup is true. No TTS regeneration or paid provider calls were issued. See `owner-prepared-with-mp3.json`. Preparation in the existing tab used the same candidate code verified against deployed 3.11.720; the original page shell remains 3.11.719 because it was not reloaded during preparation. Temporary diagnostic references removed.

The new owner archive is prepared, not saved to disk: the user can press Save and choose a destination. The original saved ZIP remains unchanged. A temporary read/write transport-check archive is removed after verification.
