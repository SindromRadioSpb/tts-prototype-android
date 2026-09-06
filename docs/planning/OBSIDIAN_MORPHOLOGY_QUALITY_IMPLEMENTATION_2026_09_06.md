# Morphology and Obsidian study package — approved implementation

Status: IMPLEMENTED / PRODUCTION_TECHNICAL_PASS (v3.11.484, code commit `93909911`). Approval: 2026-09-06, following the repository and vault research in this conversation. Baseline: `49729a79` / v3.11.483. Native Obsidian owner acceptance and independent linguistic scoring remain separate and unclaimed.

## Outcome and boundaries

Deliver faithful morphology decisions, richer source-grounded study data and safely updatable Obsidian materials. Retain shared paradigms, context cards, audio, phrase notebooks and Bases. LinguistPro owns append-only morphology decisions and FSRS; Obsidian owns personal writing outside the managed projection. No paid provider calls, source corpus mutation or changes to the owner's live vault are needed. Existing unrelated dirty files remain untouched. Production release is subject to project release gates; live vault installation and independent human linguistic acceptance remain separate.

## Evidence established before implementation

- P1: `LexicalResolutionService.hydrate` records a resolved analysis in audit/queue but leaves exported lexemes unchanged. In-memory correction: resolved=1, present in audit=true, in lexemes/cards=false. Root cause: lifecycle projection and educational projection diverge.
- P2: source `feats` and `prefix` are omitted from occurrence export. Existing source information is lost; this does not establish that every source feature is correct.
- P2: dictionary gloss is presented as a contextual meaning without evidence of contextual selection.
- P2: title-derived paths change on rename and collide for different texts with equal titles; ZIP extraction has no conflict-aware update protocol.
- P2: nested `.obsidian` configuration does not install snippets into the actual outer vault; two installation modes must be explicit.
- Baseline targeted checks: 39/39 tests passed, but receipt tests do not assert corrected Markdown content. The 77-song v3.11.481 snapshot has 14,301 tokens, 14,284 analyzed occurrences, 5,667 nonempty meanings and 1,212 unique review occurrences. Coverage is not accuracy.

## Architecture and role synthesis

R1/R10/R11: preserve grounded readings, unknowns and ambiguity; no guessed roots/forms or model accuracy claims. Apply valid decisions to exact occurrences, then regroup without merging distinct senses. R9/R12: separate raw evidence, effective analysis and rendered artifacts; retain actor/event provenance. R2/R17: context-first practice, no answer in the prompt, no competing repetition scheduler. R4/R6: readable stable locations and corpus-wide views, no mandatory community plugin. R13/R14/R15: validate paths, dry-run before writes, detect edits, backup and recover partial updates, never modify personal notes or owner state in tests. R16: offline enrichment first, no implicit external processing.

## Execution ledger

- [x] A. Regression-first effective occurrence projection: correction, confirmation, clear, stale, split senses, paradigm identity and verification provenance.
- [x] B. Preserve source grammar and prefix evidence; curated function usage with context guards; separate dictionary/context meaning.
- [x] C. Stable readable identity paths and versioned file manifest; local updater with dry-run, conflict detection, backups, repeatability and recovery tests. Legacy installation never auto-adopted by title alone.
- [x] D. Corpus-wide Bases, personal-note templates and explicit standalone/existing-vault setup; retain existing export capabilities.
- [x] E. Reproducible coverage/quality evaluation artifacts; unannotated independent-gold worksheet is not a passed accuracy gate.
- [x] F. Targeted and broad tests, applicable smoke/build/i18n checks, final diff review, browser verification for changed UI, scoped release and production verification.

## Acceptance gates

Tests must assert rendered corrected headword/meaning and occurrence conservation, not merely queue counts. Clearing or stale decisions restores raw projection; correcting one homograph never overwrites its neighbors. Unknown grammatical values remain absent. Gloss enrichment never changes grounded lexical identity. Updated archives retain stable identity across renames and distinct IDs across equal titles. Updater refuses traversal, symlinks/reparse escapes and unrecognized/conflicting files; failure preserves recoverability and never reports full success. Re-running unchanged input performs no managed-content changes. Real Obsidian rendering/links and owner learning acceptance are reported separately from filesystem validation.

## Verification log

Implementation and release results will be appended as gates complete. No changes to the live vault have been authorized by this plan.

### A — first implementation checkpoint (not release-ready)

- Added an end-to-end red test: original exporter failed `owner decision must reach educational projection` (28 pass / 1 fail).
- Implemented occurrence-scoped educational projection through the shared preview module; UI supplies the existing offline paradigm resolver. Changed identity cannot retain the old paradigm. Confirmed groups retain actor/event provenance; raw source remains explicit for repeat hydration and clear after serialization.
- Added coverage for decisions on occurrences outside the current uncertainty queue, and same-ID paradigm reuse. Shared reference paths remain PID-based rather than contextual-decision based.
- Targeted run of five original suites plus first regression: 40/40 passed. Subsequently expanded preview suite: 30/30 passed.
- Still required before closing A: corrected skipped-token projection, complete effective aggregate recomputation (including remaining group ambiguity/conflicts), same-PID multiple-context reference regression, confirmation/clear/stale transition matrix, bounded identity IDs rather than embedding analysis in IDs, and broad checks. No commit/deploy yet.

### A/B — second implementation checkpoint (not release-ready)

- Previous goal turn classified as progress: working code, formal plan and new regression evidence exist in the worktree. Revalidated HEAD and dirty-file scope before continuing.
- Implemented skipped-token recovery and conservation, SHA-256 bounded reviewed-group IDs, effective morphology aggregates and remaining-group ambiguity/conflict recomputation. Source counters remain available under `source_projection`.
- Added confirmation tests with two different context meanings sharing exactly one PID reference; clear after serialized hydration restores the machine source. Five-suite run: 43/43 passed.
- B started: exported occurrences preserve explicitly present source grammar, prefix and morph ID; TSV now includes grammar JSON, prefix JSON, source and decision provenance. No fabricated null/default grammar. Preview suite with source-evidence regression: 33/33 passed.
- Next: finish B's learner-visible grammar, dictionary/context separation and curated usage; audit source grammar visibility after a changed lexical decision; finish A broad transition/rejection and UI consumers checks. Then C–F remain in full scope. No live vault writes or deployment.

### B/D — third implementation checkpoint (not release-ready)

- Prior turn was progress; verified current diff and ledger. Added explicit `dictionary_meaning_ru`, `context_meaning_ru` and meaning provenance while retaining legacy `meaning_ru`. Dictionary gloss is no longer labelled as context-confirmed.
- Grammar appears per occurrence and in flattened Bases properties. A lexical owner decision preserves old grammar under source evidence but does not certify it; tested.
- Added offline curated usage projection to browser and public-corpus batch paths: exact form/lemma and context-POS match, no ambiguity/identity conflict, matching PID when present. Includes function, government, pitfalls, collocations, suffix examples and reference examples. It never fills a contextual gloss or changes lexical identity. Coverage gain must be measured as usage coverage, not meaning accuracy.
- Added global lexical Bases with source-text columns, verification/usage/grammar views, personal-study copy template inside managed assets, and separate existing-vault/standalone setup instructions. Removed answer leakage from recall prompt.
- Targeted five-suite gate: 46/46 passed; script syntax and diff whitespace checks passed. Native Obsidian/Bases visual acceptance and corpus-scale measurement still pending.
- C remains next major block: stable text identity/path mapping, versioned checksum manifest, safe local ZIP updater with preview/conflicts/backup/recovery and adversarial tests. Then complete D shared function references, E reproducible measurements/gold worksheet, F broad and release gates. Live vault and production untouched.

### C — initial updater implementation (not release-ready)

- Prior turn is progress. Revalidated exporter/UI/batch paths against the worktree.
- Package sealing now hashes actual UTF-8 content and audio bytes; browser ZIP and batch ZIP paths include a versioned per-file SHA-256 manifest. Text directories have readable titles plus identity suffixes; previous per-text export receipts preserve assigned folders.
- Added standalone offline Node updater `public/tools/obsidian-update.cjs` for extracted packages outside an existing vault. Default operation is read-only preview. It validates paths/checksums, compares installed hashes, preserves installed text locations on rename, refuses user-edit conflicts and records backups before changes. Personal files are not scanned or written.
- Five new tests cover dry-run, repeated apply, personal-file preservation, rename mapping/backups, conflict refusal, tampering/unsafe paths and byte-accurate sealing. Updater + preview + public corpus + merge: 43/43 passed. Two old path assertions initially failed after approved identity suffix change; updated assertions retain human-name and stable-suffix requirements.
- **C still requires**: interrupted-transaction recovery/rollback command and incomplete-journal gate, live lock/stale-lock protocol, atomic state adoption for matching preexisting files, stricter manifest/state validation and reparse/race/adversarial tests, efficient remapping and scope-aware retirement, UI/download/setup integration and corpus export extraction verification. No claims of production readiness; no live vault writes or deploy.

### C/D/E — recovery and measured coverage checkpoint

- Added explicit preview/apply rollback, incomplete-journal refusal, live-lock refusal, verifiable stale-lock removal, fsynced atomic writes and transactional adoption of matching pre-extracted files. Recovery verifies backups and both before/after hashes, preserves post-failure owner edits, and refuses a newer install state. Added declared-text scope validation and efficient target lookup for retirement.
- Updater regression suite: 11/11 passed (including injected interruption, owner-edit recovery conflict, junction refusal, scope-aware retirement and rollback). Combined six-suite gate before the last two updater tests: 55/55 passed. `npm test -- --test-reporter=dot` completed with exit 0; no numerical full-suite count claimed from dot output. Scoped syntax/diff checks passed.
- Added shared function-word reference files (no Pealim ID required), linked from text cards; same reference data remains separate from occurrence meaning. Existing-vault setup documents updater, recovery and stale-lock commands.
- Added repeatable offline audit and a 400-row unannotated independent-review worksheet under `docs/research/linguistpro-obsidian/2026-09-06/`. Current measured usage coverage: 2,719/14,284 occurrences; no lexical identity/gloss changes with usage toggled. Nonempty supported grammar: 303; prefix evidence: 2,824. Dictionary meaning coverage unchanged at 5,667. No linguistic accuracy claim.
- Next release requirements remain: final updater/schema/path/link edge-case review, package-scale installation/repeated update/rollback, source-source-model provenance checks, native Obsidian or explicit acceptance limitation, browser 380px export smoke, i18n/SW version lockstep, required domain/API gates, final diff and scoped production release/verification. Live vault remains untouched.

### Package-scale and browser gates

- Added `scripts/premium/rehearse-obsidian-package.js`: builds the complete immutable 77-song snapshot with published titles and real audio; seals, installs, repeats and rolls back in an OS-temp vault. First run revealed the diagnostic link checker counted an inline-code example as a live link; fixed Markdown-code exclusion and aligned titles with the publication manifest. Final run passed: 11,784 package files (11,783 managed payloads + manifest), 2,155 audio assets, zero install conflicts, repeat=unchanged, rollback=rolled-back, personal note preserved, zero missing filesystem-relative targets. Evidence: `package-rehearsal.json`.
- Extended the existing browser smoke to click the actual export button, intercept download in a disposable profile, verify every ZIP SHA-256/byte count with browser WebCrypto, and require one owner-corrected contextual card. RU and HE at 380px passed: 30 payload files each, one corrected card. Screenshots inspected in `browser-380-{ru,he}.png`; UI label/target checks passed.
- `npm run test:api-smoke` passed. Isolated `smoke:morph` passed (9 tier + 13 settings + 6 full-dictionary checks), `smoke:quiz` passed, `smoke:crosstext` passed (14 checks). Additional `smoke:reader-morph` first failed to locate global Chromium; rerun using the existing project browser via `PLAYWRIGHT_BROWSERS_PATH=0` reported PASS. No provider keys used.
- Chrome DevTools CLI is absent; project Playwright smoke used as fallback. Computer Use initialized and inventoried available apps; Obsidian is installed but not running. No owner vault opened. Native Obsidian rendering/link acceptance is not yet claimed. Rehearsal temp source remains available for isolated acceptance at the location recorded in its report.
- Remaining: native validation or explicitly bounded limitation, final security/identity review, version/SW/i18n lockstep, final aggregate tests, scoped commit/push and production verification. Goal remains active.

### Final local release candidate — v3.11.484

- Final path review fixed Obsidian wikilink metacharacters in text folder names and a newly introduced updater rewrite cascade when a retained path contains the new path as a prefix. Added exact regression checks; updater suite 12/12 passed. Existing title-renaming receipt behavior is now explicitly tested.
- Full `npm test -- --test-reporter=tap`: **1,357 passed, 0 failed**, no skipped/cancelled tests. Intermediate run had 1,355 pass / 2 fail because two release-lock tests still expected v3.11.483; updated only their literal version expectations, then reran the complete suite. `npm run smoke:i18n`: **233 passed, 0 failed**.
- APP_VERSION, Room footer, SW cache and changed JS URL versions moved together to v3.11.484. Browser export smoke repeated for RU/HE at 380px: PASS, each 30 payload files and one corrected contextual card; screenshots inspected before staging.
- Native Obsidian acceptance remains **NOT_RUN**: installed application is not running, and the available Windows launch API cannot pass a verified isolated profile. Opening the default profile risks automatically opening the owner's vault. No claims about native Bases rendering or owner learning acceptance; filesystem links and package/update/recovery gates are passed separately.
- Read-only pre-release production checks: `/healthz` HTTP 200, database and migrations ready; `/api/client-config` v3.11.483. Existing disk warning: 85% used. No cleanup, volume mutation or user-data migration authorized/performed. HEAD and remote main both `49729a79` before release.
- Production Dockerfile build from the exact staged Git tree in an isolated temp directory: PASS (`linguistpro-obsidian:3.11.484`). Disposable container with `--network none` and tmpfs `/app/data`: health HTTP 200, version 3.11.484, updater route HTTP 200. Container stopped/auto-removed; no persistent volume used. Final focused exporter/updater/corpus/merge tests: 49/49 passed; syntax and staged whitespace checks passed.
- Push and post-deploy verification still pending at this checkpoint.

### Production verification — 2026-09-06

- Scoped code commit `93909911797c54d3a54cc007518bf5c31b6da601` pushed to main. GitHub `smoke-check` run `34005369703`: SUCCESS, including Linux unit/contracts, API/migrations, ingest/recovery, authenticated tenant isolation, independent FSRS vectors and memory canon browser/persistence gates.
- Production v3.11.484 observed at 02:04:12 UTC. Four actual response-body SHA-256 hashes match the committed bytes: `obsidian-lexical-preview.js`, `lexical-resolution-service.js`, `lexical-resolution-ui.js`, `tools/obsidian-update.cjs` (HTTP 200 each).
- Actual production-origin browser export smoke passed at 380px for RU and HE in disposable profiles: 30 payload files each, all byte counts and SHA-256 verified, one corrected owner-confirmed contextual card. Saved screenshots are byte-identical to the inspected local release screenshots. Fixtures mock owner storage; no live profile events or reviews were written.
- Three health/version probes at 02:04:54, 02:05:05 and 02:05:15 UTC: HTTP 200, `ok=true`, DB/migrations ready, version 3.11.484, increasing uptime. Disk warning persists at 90% after build (85% before); not a morphology defect and no unapproved production cleanup performed. Capacity review is a separate operational follow-up, not evidence of current unavailability.
- No personal vault changes, source republishing, paid providers, SRS mutations or linguistic gold certification. Coverage gain is the measured availability of curated usage references, not a claimed gain in linguistic accuracy. Native Obsidian rendering and the owner's learning workflow still require owner acceptance; the available environment did not provide a verified profile-isolated native launch.
- All scoped code is committed; unrelated dirty files remain preserved. This closes the approved implementation/release scope, not an assertion that all product defects have been eliminated.
