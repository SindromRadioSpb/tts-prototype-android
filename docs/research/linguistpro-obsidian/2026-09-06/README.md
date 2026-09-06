# Morphology and Obsidian implementation evidence

Status: **PRODUCTION_TECHNICAL_PASS**, v3.11.484, code commit `93909911`. Plan and full gate/release log: `docs/planning/OBSIDIAN_MORPHOLOGY_QUALITY_IMPLEMENTATION_2026_09_06.md`. Source baseline for measurements is recorded in `quality/coverage.json`; these measurements were generated from the implementation worktree subsequently committed as `93909911`. Native Obsidian acceptance and independent linguistic scoring are not claimed.

## Reproducible coverage

`quality/coverage.json` is a generated diagnostic artifact over the owner's existing immutable 77-song public-corpus ZIP (v3.11.481 snapshot). It includes the source SHA-256, per-work counts and aggregate counts. The source ZIP is read-only and is not copied into this repository.

```powershell
node scripts/premium/audit-obsidian-quality.js --source-zip "PATH_TO_SOURCE_CORPUS_ZIP" --output "NEW_OUTPUT_DIRECTORY"
```

The tool refuses to replace existing coverage/annotation files. Do not edit `coverage.json`; regenerate into a new directory when code or source changes.

Measured: 77 texts, 14,301 tokens, 14,284 analyzed occurrences, 17 skipped, 5,667 nonempty dictionary meanings, 1,212 uncertain occurrences. New guarded usage references are available for **2,719 occurrences** without changing any tested lexical identity/gloss fields compared with usage disabled. **303 occurrences** have nonempty supported grammar values, and **2,824** preserve prefix evidence. The earlier research count of 538 `feats` objects was object presence, not nonempty usable fields. No model/provider was called.

These are coverage and software-conservation measurements, **not linguistic accuracy**. Source-snapshot context-confirmed meanings are zero; this does not imply that the live owner's browser has no manual decisions. Manual-decision fidelity is separately exercised by regression tests.

## Independent annotation worksheet

`quality/gold-worksheet.json` is the file to annotate. It contains 400 deterministically selected source occurrences, balanced by round-robin sampling of source POS/uncertainty strata. Selection uses source tags, but predictions are not displayed to the annotator. Each item has exact source/row/offset identity and Hebrew context. Fill expected fields, annotator and status only after independent linguistic review. Empty values mean unannotated, not accepted missing morphology.

Current status: **UNANNOTATED_NOT_SCORED**. No independent human-gold gate or measured improvement in accuracy is claimed. Do not use the same morphology provider as its own accuracy oracle.

## Offline package updater

Implementation: `public/tools/obsidian-update.cjs` (Node.js built-ins only). The generated setup guide contains download and execution instructions. Default mode is preview:

```powershell
node public/tools/obsidian-update.cjs --package "EXTRACTED_NEW_PACKAGE" --vault "TEST_VAULT"
```

`--apply` explicitly applies an inspected package. Packages must be extracted outside the target vault. Close Obsidian and pause file synchronization while applying. Changes are backed up under `_LinguistPro/.updates`; conflicting owner edits block writes. `--recover TRANSACTION_ID` previews rollback, and adding `--apply` executes it. Recovery refuses edits made after the transaction. `--unlock-stale --apply` refuses to remove a lock belonging to a live local process.

The owner's live vault has **not** been installed, migrated, styled or modified during implementation. Tests use disposable vaults. Legacy packages without a checksum manifest are not silently adopted by title alone. Native Obsidian visual/link acceptance remains separate from filesystem tests.
