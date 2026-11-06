# Atlas 97001 — reviewed fixes, authorized partial release 3.11.864

2026-11-06. Actual PC WIN-5V7TAJ132KN; checkout `E:/projects/tts-prototype-android`, main. **Release preparation record. Exact final publication/commit/checks are in the results artifact release-verification.json. This is not full acceptance.**

All 346 observations have individual verdicts: **301 confirmed, 44 partially confirmed, 1 unresolved from the available source; 0 wholly refuted**. See [observation-ledger.json](observation-ledger.json) for original ID/report, page/fragment, supplied source coordinates, original observation, evidence, target, action and check. [registry.html](registry.html) is the readable view. Parts of otherwise valid observations are refuted explicitly.

## Source and preservation

The user-authorized private Drive transfer supplied the actual Windows file `C:/Users/lletp/attachments/05290c8e-df6f-4c1e-9e6d-aaac936b0e24/atlas97001-source-audit-2026-11-06.zip`: 7,490,072 bytes, SHA256 `911ea445d3957752f8af5c59a6a28d722883c797a13efb42a2100c64836d5e6c`, 45 entries, no CRC errors. Input Library ID: `libfile_a64ef3a9781481918a2e1529d35c73d6`.

Immutable source: `Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit/`. All 45 file hashes are recorded in [input-verification.json](input-verification.json) and rechecked by the packer. Original PDF: 203 pages. Initial runtime matched all 203 snapshot pages exactly, excluding archive-only section IDs. Actual full-page/native/rotated PDF pixels and source crops were inspected, not only extracted text. This does not certify complete rendered acceptance of all 203 pages.

Branch/status/worktrees and current origin/main were checked before work. Latest fetch still gives `70a89669ce0fcffba2de428d099f0e2bcb26eb86`, production 3.11.863 with the memory fix. No later changes were reverted. Old sessions/locks/worktrees, foreign untracked `docs/LinguistPro World/`, 97002, cafe B and the stopped course were not edited. Existing worktree data was only read to populate the missing root runtime. Supplier input was preserved. No user data, progress or manual overrides were uploaded/replaced; browser profiles are anonymous and isolated.

## Candidate

Canonical corrections: `scripts/atlas/corrections/a97001.json`, 250 tagged operations across 139 pages. Existing rebuild machinery applies them; production JSON was not hand-edited. Pointing, both transliterations and changed-formula MathML were regenerated consistently. Search and trainer banks were rebuilt with corrected section hashes.

Corrections include literal qualifiers/definitions, footnote anchors, Russian meanings, formula signs/indices/cancelled roots, worksheet and table cells, English originals, figure dimensions/scales and term links. Examples: p154 short-duration qualifier and definition links; SAE1035 hollow shafts (medium strength retained correctly); p171 reaction; p183 annealing caption; p200 applications. P160 now has all 32 row-specific stock/group mappings, with small uncertain legend text identified.

Report inaccuracies: p106 actually reads **R50**, not R60; p167 500 μm belongs to the adjacent micrograph; p83 already had its formula in Russian; empty errata did not prove that existing source-error explanations were absent. Scientific caveats remain separate from literal source wording.

The complete p169 scale exposed mobile caption overflow. `public/css/atlas-reader.css` now wraps long figure captions. Release version is 3.11.864. A reload regression also revealed that a background DB projection refresh consumed the one-shot anchor and returned the atlas to contents. The atlas now falls back to its preserved current position when remounted; final browser checks verify the restored page remains present.

## Open points and release gate

**20 observations retain source limits:**

- **P159-01:** 32 steel-grade rows × 22 positions absent in the structured layer. The tiny source raster cannot support reliable complete numerical transcription. This remains a confirmed unresolved omission.
- **M101-030, p116:** 118 atomic-mass slots absent; most original masses are unreadable in the native 505×326 raster. Readable carbon inset restored; current reference values were not substituted.
- **p170-F3:** peritectic 149?°C, A₂ 759/769°C, J/P/Q decimals and highest °F uncertified. **p170-F1/F2:** readable phases/letters/scales restored; confident 729°C withdrawn, 728/729 unresolved.
- **R157-F02/F03/F04; R160-F01/F04/F05/F06/F07/F11/F12/F15/F18; P159-05/P159-07; MATH-LATE-002:** readable portions fixed, small words, stock legend/6 mm qualifiers, source footnote wording or p198 fatigue subscript still uncertified. Exact scope is recorded per ID.

The owner explicitly changed the release criterion after this review: unreadable/unresolvable PDF fragments do **not** block publication of verified corrections and must remain recorded for independent repeat acceptance. This authorization includes p116/159/170. All 20 limits above remain open and are disclosed; no guesses were introduced. They prevent a claim of complete source fidelity, but no longer block this partial release. Functional failures and unreviewed observations are not waived.

## Checks

- Reader audit: **21 sections, 0 findings**. Correction `--check`: idempotent.
- Atlas JavaScript: **167 passed, 1 skipped**. Atlas Python: **192 passed, 12 skipped**. i18n: **233 passed**.
- Restricted temporary-folder failures were resolved by workspace TEMP/TMP; initial failed logs are retained.
- Full `npm test`: **3392 passed, 12 failed, 1 skipped**. Six failures concern EPERM creating links; five concern local HTTP/database readiness/fetch; one is the corpus guard for `public/data/benyehuda/context/10.json`. Those source files were unchanged by this task. A network-enabled rerun of the affected test files passed 77/78 tests: 11 original failures cleared; the remaining guard detects an existing gitignored payload. The guard passes against the exact tracked corpus export (115 sealed files, 796 ready works, 26455 catalog entries). No foreign payload was deleted or modified. Initial full-run failure remains recorded; final-commit checks are packaged separately.
- Search gold: **12 exact + 3 fragment queries**, recall@5 **1.0**, no misses. Trainer: **422 find items, 101 terms**; section hashes verified.
- Candidate Chromium, Russian interface, **390 and 1440 px**: restored p154 phrase, navigation, representative affected-page layout, scan overlay, word card, training stages 3/0, print renderer **38 sheets / 50 images**, rebuilt phrase search, reload and a local-storage sentinel. Exact final-commit checks are in the results artifact. No authenticated profile or server writes.
- Memory regression: all **38 steel pages** traversed at 390 px, peak **5 sourced images**, evicted scan loaded again. Existing 3.11.863 implementation and evidence preserved. This is emulation, not physical iPhone verification.
- Full final page-by-page UI acceptance, Hebrew interface, actual recorded speech playback, physical iPhone and a real printer are **not certified**. Local JSON assertions and sampled UI do not replace these checks.

Pre-release production readback: **v3.11.863**, https://linguistpro.kolosei.com/library.html#room=atlas%3Aa97001 . Production atlas data was backed up; all 203 pages and section metadata matched the audit baseline, so replacing the reviewed atlas files does not overwrite newer manual changes. User review/progress storage is outside this replacement. The server capacity check found 6.4 GiB free, no active build, no build cache, and current + previous app images retained. The actual released SHA, version, CI/deployment URL, live hashes and checks are recorded in the final artifact; do not infer successful publication from this preparation record.

The earlier documentation-only commit `a163223150c7d9bdb943b461c92b68812512e04a` was not pushed. Automatic approval review denied that standalone push; parent explicitly prohibited retrying it. It was not retried. Drive delivery later resolved intake. The Windows Library helper `os.setxattr` limitation remains a tooling issue, not the current audit blocker.

## Independent repeat acceptance

1. Verify result ZIP SHA/CRC and `candidate-manifest.json`; use its complete commit SHA. Verify original ZIP SHA above. Keep inspection separate from production deployment.
2. Review all 346 ledger rows against actual PDF pixels and exact targets, beginning with all 20 open IDs. Obtain clearer p116/157/159/160/170/198 details; do not certify using another reference table.
3. In an isolated copy, apply canonical correction JSON using `reader_corrections.py`; rebuild a97001 search/trainer banks and verify section hashes/idempotence. Preserve supplier inputs and user overrides separately. Historical `review-batch-*.py` scripts explain authoring and must not be rerun against already-corrected data.
4. Run reader/atlas/i18n/search/browser checks and investigate full-suite failures in a suitable environment. Review all 203 final rendered pages beside scans at desktop/mobile widths; test Hebrew UI, listening and actual devices/print as appropriate. State any explicitly authorized partial-release exclusions.
5. For the authorized partial release: refresh origin/main, preserve newer work, create final release commit/version, back up atlas volume, publish code/data using repository operations instructions, verify exact remote SHA/CI/live files, then independently inspect that published version. Refer to the final artifact for the observed publication result.

Artifact: `Архив/atlas97001-audit-results-2026-11-06.zip`, generated by [build-results.py](build-results.py). Contains ledger/readable registry, canonical correction JSON, candidate CSS, runtime sections/search/trainer data, exact-commit manifest, source-crop sheets and test/browser evidence. Source remains separate. This is a verified local artifact on the connected PC; no new Library ID is claimed.
