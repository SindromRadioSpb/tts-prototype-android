# Ben-Yehuda learning publication candidate, 2026-10-05

Status: corrected local release candidate after the independent NO-GO on `871fc23e772e5a394350c3b17ce8d6723c2e5200`. No corpus upload, push, PR, merge or deployment has been performed. Baseline: `5f683507fd5bc993e468f9785648cdb070843ef2`, production `3.11.730`, catalog 7. Candidate: `3.11.731`, catalog 8. Production success requires a new exact-commit review and separate GO, fresh capacity measurement, upload verification, CI and production readback.

## Reconciliation

The owner's 84 ZIP inputs passed CRC, duplicate-entry and schema checks: 38 learning archives and 46 supporting evidence archives. Supporting evidence is used only for provenance. The explicit new 93-work edition takes priority over the earlier published edition. The unfinished AM batch is excluded.

| Measure | Verified result |
| --- | ---: |
| Incoming unique source work IDs | 688 |
| Incoming main learning rows | 39,394 |
| New works | 625 |
| Earlier public works receiving a new edition | 63 |
| Incoming unchanged editions | 0 |
| Earlier public works retained byte for byte | 733 |
| Published ready works, before / candidate | 796 / 1,421 |
| Published ready main rows, before / candidate | 76,952 / 106,375 |
| Discovery IDs, before / candidate | 26,455 / 26,455 |

Each incoming ID occurs once. Stored keys and independently recomputed keys each contain 688 unique values, with 689 distinct values in their union. Work 28026 is the single historical stored/recomputed-key exception. Its two keys remain attached to that source ID; there are no cross-work key matches. Edition replacement updates the existing discovery card rather than creating another material card.

All five reading fields in all 39,394 input rows match the input strings exactly. Machine-derived niqqud metadata is preserved separately in 23,458 rows, with only public provenance retained. Hebrew vowel/cantillation marks occur in 39,321 rows; translation and both transliterations are present in all 39,394 rows. These are structural coverage measurements, not expert linguistic certification.

Verified source snapshots provide a source period for 615 incoming works. The other 73 remain honestly unknown. Source classification and the application's author-based period heuristic are separate passport facts. Title, author, source translator, source URL/ID, original version/edition, learning revision date, measured layer coverage and source-reported rights are included where evidence exists. Machine limitations are stated. No CEFR level, human certification, legal clearance or audio is invented.

## Edition and release boundaries

The thin catalog and release manifest are committed. Work bodies, previews and FTS shards are volume-only. New bodies use a SHA-addressed namespace; old numeric bodies are never overwritten. Preview payloads contain four rows and remain below 128 KiB. The uploader accepts only the sealed 1,710-file allowlist; the working candidate directory can contain older, unreferenced build generations and must never be uploaded wholesale.

Docker already excludes generated work bodies. Two additional exclusions keep private `.tmp/` staging and generated FTS payloads out of any local build context. The corpus guard permits exactly these two appended exclusions and rejects other Docker changes.

`build-context.json` records a static ordered-rule check: all 36 required runtime paths, including the manifest and every thin asset, remain included; four private/volume canaries are excluded. The local Docker daemon is unavailable, so this is not an image-build claim. Actual image contents must be checked during CI/deployment and production readback. Context exclusion semantics are described in the [Docker build-context documentation](https://docs.docker.com/build/concepts/context/#dockerignore-files).

Each learning edition has its own local text key. Stored archive keys, recomputed canonical keys and earlier published keys are aliases bound to the same source work ID. The build rejects cross-work alias ownership; the client verifies the local source ID before alias reuse and rejects a conflicting publisher key. An existing client opens its earlier copy by default and reports the actual device row count. Cold arrival offers the saved resume without replaying a row write that clears the saved step. The explicit "Open the new edition separately" action imports a separate copy with skip semantics. It does not invoke destructive replace, canon reconciliation or row projection. Notes, user locks, bookmarks, row/step progress, review history and OPFS media remain with the earlier copy. Work-only server metadata and coverage describe the current publication; exact old and new text-key sentence/lesson requests retain separate anchors.

The review found that cold public routes still looked up numeric bodies and that newly public cards omitted native ZIP keys. The corrected SSR and sitemap now use the same sealed current body as the card and verify its hash, source ID, publisher key, row count and edition ID. All 1,421 ready works have readable projections and unique sitemap entries. Native archive import followed by ordinary card Read and reload now reuses the verified same-work local edition without creating a publisher copy. Work 28026 retains both historical keys, and a foreign source ID with the same key cannot be reused.

[PUBLICATION_CONTRACT.md](PUBLICATION_CONTRACT.md), [publication-contract.json](publication-contract.json) and [publication-fixtures.json](publication-fixtures.json) define the existing ZIP format, the four identities, ID-bound aliases, immutable fields, actual card fields and learner boundary. The identity checks cover all 688 inputs; machine-readable examples cover new 24249, replacement 3557 and historical 28026. This candidate contract also requires independent review before adoption by the future generator. Producing these documents does not establish that the production generator has changed.

Bodies and shards must be uploaded and their GET hashes verified while the active application still uses catalog 7. Only then may the reviewed application image activate catalog 8. The release manifest hashes the index, search, authors, era manifests, vocabulary and FTS references. The client verifies manifest/assets/bodies/previews before accepting them; the server verifies the current body hash. Rolling old/new application instances refer to distinct catalog and volume namespaces.

The publication skill normally excludes `public/index.html` and requires bodies before any catalog commit. The owner's task explicitly requires a local committed candidate before upload and independent review before deployment. The owner also explicitly approved the sole `APP_VERSION` line change from 730 to 731 in `public/index.html`, to keep shell, SW and version-lock contracts consistent. That is the entire index diff; Studio behavior is unchanged. Live catalog activation still requires bodies first.

## Seal and rollback

| Artifact | SHA-256 |
| --- | --- |
| Release manifest | `4fbe403e77daf05b589fb9472084e2ab752b19da3991cbd0eb57450917a43d04` |
| Catalog root | `5ec79aadb6e2175ce804afc9d35a9766c0db31dacc3a7974ce9e3746a7d18983` |
| Private inventory receipt | `914afa363cd829c53a313e64942a18364b2d10d20b33a7073661fba4ada7ea3a` |
| Earlier publication rollback ZIP | `b2ec3de6eef3f4c065a23cb17c6bdd66f41f3d96f35ffdc2c6bfa7927954dc63` |

The ZIP contains the independently downloaded old publication and is retained locally outside git. A restore exercise checked all 1,159 files / 273,125,213 bytes and the 796-ready catalog against the download. ZIP size: 98,808,122 bytes. Old bodies, old catalog assets and the baseline application image remain available. Rollback uses the baseline image/catalog without deleting new immutable files or learner copies; the old application may not provide server explanations for a newly imported edition key.

The current seal needs 274,674,697 uncompressed volume bytes and 96,145,528 compressed API request bytes. The largest file is 8,383,707 bytes, below the upload limit. The earlier read-only remote check found all 1,710 new immutable paths absent, with no conflicting files; zero uploads occurred. [revision-equivalence.json](revision-equivalence.json) proves that all 1,710 immutable paths and hashes are identical between the reviewed 871fc23 candidate and this corrected seal. The earlier remote receipt remains marked with its original seal; active-catalog and collision checks must run again after GO.

The owner's separately authorized, exact-object Docker cleanup preserved the active and rollback images, all ten containers, all four volumes and backups. Actual free-space increase measured by `df`: 2,213,761,024 bytes. At 22:13:17 UTC, 5,635,940,352 bytes were available against a conservative requirement of 5,046,104,563 bytes, including 4 GiB for the build workspace; spare capacity was 589,835,789 bytes. This snapshot is evidence, not permission to deploy later. Before upload, regenerate the same-manifest capacity gate from a read-only measurement less than ten minutes old. The capacity risk remains tracked in O-047. The 22:13:08 UTC production readback still showed version 730, catalog 7, 796 ready works and health `ok: true`.

## Validation and evidence

`evidence.json` contains sanitized counts, seals, representative mappings and gate results. `browser.json` records the actual catalog-8 browser checks; `screen-parity.json` records the same-profile baseline/candidate comparison. Screenshots are from disposable local profiles, not a production or owner-device acceptance.

- Full unit suite after corrections: 2,457 passed, zero failed/skipped.
- Edition policy and server boundary tests: 7 passed; corpus discovery contract: 8 passed.
- Corpus metadata / catalog / authority / FTS / vocabulary / explain: 64 / 34 / 28 / 30 / 37 / 27 passed.
- Corpus Room / navigation: 20 / 35 passed, including explicit Explore search/filter/author grouping and lazy loading.
- Discovery browser: eight checks passed at desktop/mobile sizes and across themes/locales. Its CI-only streamed bodies use the retained catalog-7 fixture; actual catalog-8 data has a separate real-body gate.
- Actual service-worker bounded preview: six checks passed, including cancellation, no preview cache write and ordinary full-body offline caching.
- Full service-worker update gate completed with exit 0: nine PASS scenarios and three recognized O-015 cases, across Studio, Room and Mediatheque. The known cases confirm that plain reload can retain a waiting release; the explicit update toast delivers it. No known-case assertion was weakened.
- The existing niqqud probe passed on all 38 selected learning archives (688 works / 39,394 Hebrew rows), with 99.82% coverage under its legacy range definition. Supporting archives are excluded from the aggregate. This coverage check does not certify the linguistic readings.
- Actual catalog-8 browser: eight checks passed. Seeded old rows, notes, bookmarks, progress, reviews, audio links and OPFS media remain intact across preview, old opening, separate new import and reload. New work 54646 opens all 157 rows. RU/EN/HE passports, mixed scripts and HTML escaping pass, with no page errors.
- Cold public links: six checks passed, covering every ready body and sitemap ID, actual HTTP/canonical JSON-LD/current excerpt/client refresh for new 24249, replacement 3557 and retained 10, and invalid/unknown IDs. Browser fixtures append a read-only reader observer to the served module; they use disposable profiles, block service workers and external traffic, and do not modify the application handler.
- Native keys: five checks passed using exact work records selected from freshly SHA/CRC-verified real owner ZIPs. Native import, actual card Read, reload and explicit separate-edition opt-in preserve local text identity, user locks, notes and row/step progress for new 24249, replacement 3557 and both keys of 28026. A deliberately foreign source ID is ignored. The fixture adds a reader observer and invokes the application's author-navigation function; it does not use an owner profile or make external calls.
- Same-profile mobile first card: baseline and candidate both end at 744.39 px, above the usable bottom of 792 px. Both have no update toast or horizontal overflow. The earlier inconsistent version suffix caused the transient measurement failure; no CSS change was required.
- Independent archive validator: all 688 identities, 39,394 rows, body/preview/asset hashes, links, discovery ordinal IDs, 733 retained bodies and public metadata whitelist passed.

The reverse Cyrillic transliteration index skips 525 rows whose word alignment is ambiguous. Their reading text remains exact and readable; no alignment or missing linguistic evidence is fabricated. This partial search coverage is recorded in O-075.

The selected-work fixtures establish edition continuity. They do not establish whole-archive import throughput: sending the full 159 MB native 93-work JSON through the browser automation bridge did not complete before a bounded stop. The stage responsible (bridge transfer or DB import) has not been isolated. This unresolved experiment is recorded in O-076; owner ZIPs and learner data were not changed.

Reproduction uses the inventory, snapshot, comparison, build, FTS update, vocabulary/transliteration build, finalize, independent validation and upload dry-run scripts in `scripts/premium/`. Owner source paths, private ledgers, raw evidence, credentials, operational coordinates and cleanup receipts stay outside git and public assets. Use the owner's input root as an argument rather than publishing its path.
