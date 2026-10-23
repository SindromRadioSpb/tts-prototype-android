# Reading Room: responsive long material opening

Date: 2026-10-23. Base revision: `e72ba44836be1689a56c80a99bbbdc62ab886b49`.
Evidence: isolated Chromium against a disposable local server, served-asset verification, and authorized read-only owner-profile observations. Production results and limitations appear below.
Exact numeric observations and tested asset hashes: [measurements.json](measurements.json).

## Latest complete acceptance run

The final complete run includes the additional short material with long paragraphs and stored contextual translations. All existing desktop/mobile/RTL, search, resume, cancellation, manual transliteration and replay-identity checks passed again. Five host-level VM regression tests execute the actual `applyDecorations` / `applyWordLayer` functions: contextual display starts after row hydration and before pending statuses/morphology decoration; superseded work cannot publish due statistics or coverage.

For the 2,500-row fixture: data 332.17 ms; table DOM paint 501.09 ms; first interactive visible Hebrew word 1911.30 ms; open completion 2173.00 ms; longest observed task 1016 ms. The interactive-word delay after data is **1579.13 ms**, so the one-second interaction goal remains unmet. DOM paint after data is 168.92 ms. Desktop resume reached the visible saved row at 2897.50 ms; mobile-viewport resume at 3206.76 ms. The profile-change probe took 710.25 ms, with a longest observed task of 77 ms.

The added generated fixture has 34 paragraphs of 100 Hebrew words, plus one unique final search word. Its 3,401 canonical pointed word spans have imported contextual glosses: 34 manual and 3,367 AI-labelled fixture entries. Both provenance and manual values survive lazy wrapping with generation disabled. The first stored contextual gloss appeared after 510.45 ms, the first visible one after 510.55 ms, and full coverage after 1448.97 ms. The row-zero word card displayed the correct Hebrew word and manual context; search reached paragraph 33 with its own manual value. No `/api/word-gloss-ctx` generation request was attempted. The fixture verifies display, preservation and scheduling; its synthetic strings are not linguistic-quality evidence.

After this browser checkpoint, two final race guards were added: contextual work invalidates on actual table replacement during a same-material rerender, and morphology clears only its own due tooltip while preserving contextual titles. The full unit run passed 2838/2838 tests; the final focused run passed 37/37, including the new guard regressions. The isolated browser flow was not rerun after these two guards; subsequent owner-profile observations used the final deployed code.

The browser and disposable server were stopped after this run. Latest screenshots are `.tmp/reader-performance/candidate-context-{desktopOpen,mobile-rtl,paragraph-card,paragraph-search}.png`. The JSON retains the latest run separately from the earlier paired checkpoint below. Its `testedAssets` hashes normalize CRLF to LF; `testedAssetsWorkingTree` preserves exact local-byte hashes. These hash snapshots were refreshed after the final two guards, so they identify the latest working tree rather than asserting that those guards were included in the preceding browser checkpoint. Production Git-blob and served-byte validation remains a separate release check.

## Earlier paired measurement checkpoint

The same generated 2,500-row Hebrew material was opened in fresh browser profiles. At this checkpoint, the baseline served the pre-change versions of six changed Reader/DB modules directly from the pinned Git revision; the runner now also pins `word-gloss.js`. The candidate served the working tree. Desktop viewport: 1280 × 1000. The paired baseline and checkpoint candidate were run sequentially, without concurrent project test suites, before the subsequent contextual-layer and long-paragraph changes.

| Desktop metric | Baseline | Earlier checkpoint candidate |
| --- | ---: | ---: |
| Data received | 445.27 ms | 559.87 ms |
| Table DOM paint after data | 257.49 ms | 209.15 ms |
| First visible interactive Hebrew word from open | 4135.11 ms | 2364.38 ms |
| First visible interactive Hebrew word after data | 3689.84 ms | 1804.51 ms |
| `openReader` complete | 4457.77 ms | 2621.26 ms |
| Longest observed main-thread task during opening | 2742 ms | 1232 ms |

In this pair, the first interactive word appears 42.8% sooner, completion takes 41.2% less time, and the longest main-thread task is 55.1% shorter. These are single observations, not percentiles or a guarantee for other devices. Earlier exploratory runs varied with concurrent CPU work and are not substituted for this pair.

At this checkpoint the original target of an interactive first screen within one second after data was **not yet met**: the first-word measurement was 1.80 seconds after data, with a 1.23-second main-thread task. The table's DOM paint marker met the one-second target, but that marker does not prove that an interactive frame has been presented. The first-word probe waits for a real animation frame and a visible `.rm-w` in the expected row. The latest residual is reported separately above.

## Behaviour verified

The earlier complete candidate flow passed before the equivalent-width comparison correction; a separate desktop run measured that correction. The latest full run repeated these checks after the additional contextual-layer fixes.

- User-written Latin and Russian transliteration remain intact after profile changes.
- The table, audio button, and morphology word anchor retain their node identity after profile change and background completion.
- A replay control embedded in the transliteration cell retains its node and click listener when the Russian translation column is hidden and the transliteration profile changes. This uses a local injected control fixture, not real media playback.
- Hebrew search finds the unique word in row index 2491 and brings that row into view with interactive word spans.
- Saved progress at row index 1725 restores the expected visible row.
- A delayed material A load cannot replace the later material B.
- A 380 × 780 viewport restores reading position and shows interactive words. Switching the actual UI locale to Hebrew preserves visible reading position and RTL layout.
- No unhandled browser errors were recorded.

The earlier full-flow run measured desktop resume at 3256.63 ms to a visible interactive word and mobile-viewport resume at 3299.13 ms. These are functional checks with timing observations, not physical-device measurements. Profile change exposed the preserved user text after 771.79 ms; the longest observed task during that short measurement was 75 ms. Latest timings appear above.

## Reproduction and isolation

Run from the repository root:

```powershell
node scripts/premium/reader-responsive-smoke.js --baseline --baseline-ref=e72ba448 --out=.tmp/reader-performance/baseline.json
node scripts/premium/reader-responsive-smoke.js --out=.tmp/reader-performance/candidate-context.json
node scripts/premium/reader-responsive-smoke.js --desktop-only --out=.tmp/reader-performance/result-final.json
```

Optional CPU diagnosis:

```powershell
node scripts/premium/reader-responsive-smoke.js --profile --desktop-only --out=.tmp/reader-performance/profile.json
```

The profiler identified a forced full-table layout from an unconditional `getBoundingClientRect()` in column-width setup, followed by another layout before the first interactive frame. That finding drove the guarded width measurement and comparison correction. Cold morphology dictionary preparation also appears in the profile; it was not claimed eliminated.

The runner uses `smoke-server-env`, a fresh browser context and OPFS database, waits for canonical import completion, then seeds generated text through `importBundle`. It blocks external requests, API mutation requests and service workers. It does not access an owner profile, personal source material, paid APIs or production data. Its `finally` closes the browser and stops the disposable server. No server from these completed runs remains running. Screenshots and raw profiles are temporary diagnostics under `.tmp/reader-performance/`; this report and the cleaned numeric evidence are the durable record.

## Production

Version **3.11.813**, commit `e3fa8993`, finished deploying at 16:33:22 UTC. All 13 checked served assets matched their committed bytes; both shells, DB and migrations were ready. See [production.json](production.json).

The earlier eight-hour deployment of `e72ba44` was cancelled by the owner. Its log stopped at image unpacking. The previous successful runtime was `0f233bd`; the entire diff from that commit to `e72ba44` is a test locale-version lock, so the 3.11.812 runtime baseline was valid. The cause of the stuck unpack is not established (O-125).

Owner-profile observations on 3.11.813 (visible Chrome tab, 1866 × 992) are preserved in [owner-after.json](owner-after.json), with the original baseline in [owner-live.json](owner-live.json):

| Material | Earlier ready / full contextual pass | Warm 813 ready / full contextual pass | Longest task before → after |
| --- | --- | --- | --- |
| Hamam, 499 rows / 2193 stored AI glosses | 3.67 s / 7.95 s | 0.79 s / 3.08 s | 394 → 217 ms |
| Ben-Yehuda 66120, 34 long paragraphs / 3291 stored AI glosses | 0.77 s / 7.59 s | 0.73 s / 4.27 s | 267 → 88 ms |
| Largest local video text, 2477 rows | 4.77 s / not measured | 4.27 s / still pending at 45 s | 2213 → 1218 ms |

These are single observations, not controlled percentiles. The first Hamam sample after reload was slower: data 5.53 s, ready 9.03 s and contextual pass 11.97 s. Cold DB/worker latency remains variable. The large text's initial contextual and status passes completed around 56.28 s, then another background pass began; opening completion does not mean that every word layer has finished. This residual remains in O-124.

No paid contextual generation was invoked. Review-log count 11754 and its full hash remained identical. Final progress/word counts were 228/5169; their hashes differed while the owner used other tabs, so whole-session byte invariance of those two tables is **not established**. The diagnostic openings used presentation restoration without grading or saving learner state.

After 813, authorized cleanup removed only unused build cache (`docker builder prune -af`, reported 2.916 GB); physical free space increased from 3.4 to 5.6 GiB. All 13 images, 11 running containers and four active volumes remained, including active/rollback images. `disk_warn=true` remained (85% used). Before the next release, cache was again verified empty and free space 5.6 GiB.

## Refresh follow-up, 3.11.814

The owner reported refresh of Hamam showing the public corpus list. Reproduced on 813: boot called ordinary parent-corpus navigation before materialization completed, stripping `public_work` from the URL. A second refresh in this window made the parent list permanent. Commit `908f9973` keeps the material request URL while loading the parent public/group catalog; explicit corpus navigation still creates its normal route.

Validation: 27 route/resilience tests and 233 i18n checks passed. `reader-refresh-link-smoke.js --expect-bug` reproduced the loss in an anonymous disposable production browser. `--candidate` preserved the exact work URL during an intentionally paused materialization, refreshed in that pause, and then opened all 499 rows without page errors. This runner blocks API mutations and external providers and never accesses the owner profile.

Production 814 finished at **16:49:40 UTC**. After rolling deployment completed, all 13 asset hashes matched, both shells served 814, and DB/migrations were ready ([production-814.json](production-814.json)). The actual production browser run, without local module substitution, passed refresh during paused materialization and opened all 499 rows with the work URL intact and no page errors ([refresh-checks.json](refresh-checks.json)). An earlier probe started during rollout timed out before the tested stage; it is not counted as a pass. All disposable browsers were closed.

Post-release inventory and cache-only cleanup retained all 14 images, 11 running containers and four volumes, including 814 runtime and 813 rollback. Available space increased 2.0 → 4.3 GiB (89% used); the capacity warning remains. See [cleanup-814.json](cleanup-814.json). The pre-deploy inventory/cleanup requirement is now recorded in the operations guide. Runtime changes and evidence are published to `main`; the evidence-only follow-up uses Coolify's supported `[skip cd]` commit marker to avoid another build.

## Cold-opening stabilization, S1 candidate 3.11.815

The owner authorized the [staged implementation](../../../planning/MATERIAL_COLD_OPEN_STABILITY.md). S1 adds one read-only worker operation returning metadata and ordered sentences from one SQLite snapshot. It preserves all source/provider/media metadata except the already deferred `source_text`, applies the existing niqqud projection, and respects caller-owned transactions, page-cache aborts and stale material identity. The new path serves Room, Studio Classic and IDE. Progress remains on its existing path. Catalog routing, Studio redraw and visible-row-first gloss work are subsequent stages, not changes in this release.

The isolated cold-read harness opens a new document/worker for every sample, initializes the existing fixture database, then times `MaterialOpen.load(sourceOnly:true)`. Routing disables HTTP cache and blocks external requests and non-GET requests; service workers are blocked. The comparison uses the same shipped facade, with the batch method hidden for the split baseline. Both paths return byte-identical JSON read models, verified by SHA-256. Every split sample issues three worker RPCs; every batch sample issues one. No review/progress rows are created. This measures the data phase after initialization, not full page startup or visible interaction.

OPFS medians (three alternating-order pairs per fixture), in milliseconds:

| Fixture | Split | Batch |
| --- | ---: | ---: |
| 40 rows | 48.7 | 22.9 |
| 499 rows, ~259 KB metadata | 81.1 | 57.2 |
| 34 long paragraphs | 58.3 | 35.0 |
| 2477 rows, ~1.67 MB metadata | 209.1 | 189.6 |

IDB small/medium fixtures also improved in the initial sample, but its large fixture varied: initial three-pair median 162.6→181.7 ms, follow-up seven-pair median 183.5→166.1 ms. These observations do not establish a stable percentage improvement on IDB. All 62 reads passed model equality and one-RPC checks. Full observations: [48 initial samples](cold-read-815.json), [14 IDB follow-up samples](cold-read-idb-large-815.json).

The [Classic/IDE/Room lifecycle smoke](cold-lifecycle-815.json) passed material identity, late open/close, resume and media lifecycle checks. Its delayed-DB injection now gates `getMaterialForOpen` as well as the legacy path. The [full 2500-row Reader smoke](cold-reader-815.json) passed manual transliteration, node/replay preservation, distant search, resume, rapid switching, mobile viewport/RTL and long-paragraph saved AI/manual context without generation. One desktop observation: data 180.09 ms, first visible interactive word 1367.19 ms, longest task 805 ms. The remaining ~1.19 s after data is still above the 1 s target; it is not claimed solved by S1. These are isolated desktop Chromium checks, not owner-profile or physical-device measurements.

Reproduce:

```powershell
node scripts/premium/material-read-cold-smoke.js
node scripts/premium/material-read-cold-smoke.js --backend=tts-opfs-idb --fixture=large --pairs=7
node scripts/multitab/material-opening-lifecycle-smoke.js --checks-only
node scripts/premium/reader-responsive-smoke.js
```

All 2848 unit tests and 233 i18n checks passed, including new SQLite snapshot/transaction ownership, worker startup/page-cache, shared read-model and shell/module identity coverage.

Pre-deploy inventory: 4.21 GiB available, no active build, 14 images/11 running containers/4 active volumes. Authorized build-cache cleanup reported 0 B. The existing disk warning was unresolved.

### S1 production verification

Runtime commit `0e05936418f94a3e3706a8a0f0a132c4beb936a9`, deployment **2929**, started 17:15:52 UTC and finished **17:20:24 UTC** (4m32s). [Verification after cleanup](production-815.json): version 3.11.815, 10/10 changed assets equal their committed Git blobs, both shells correct, health/DB/migrations ready. Reproduce with `python scripts/premium/verify-material-read-release.py --commit=0e059364 --out=.tmp/reader-performance/production-815.json`.

On the actually served code, [Classic/IDE/Room lifecycle](production-lifecycle-815.json) and [16 fresh-worker fixture reads on OPFS/IDB](production-read-815.json) passed in disposable browsers, with only GET requests to production. The anonymous [Hamam refresh regression](production-refresh-815.json) also passed: refresh during paused materialization preserved the work URL and opened all 499 rows without page errors. These runs never accessed the owner's browser profile or wrote server learner data. All disposable browsers were closed.

[Owner read-only parity](owner-read-815.json) used the published 815 DB module in the existing hidden diagnostic tab, without navigating the owner's working tabs. The current library had 732 texts / 108996 sentences. Batch and split reads of Hamam (499), Ben-Yehuda 66120 (34) and the largest material (2477) produced equal full read-model hashes, including metadata and study fields. The review log retained all 11754 rows and its original SHA-256. These were individual read checks during normal owner activity, not controlled cold UI measurements or proof that unrelated progress was unchanged.

[Post-release cache-only cleanup](cleanup-815.json) reported 2.917 GB reclaimed; available space increased 0.64→2.85 GiB, with all 15 images, 11 running containers and four volumes retained, including current 815 and rollback 814. At one unpacking checkpoint available space was 0 while root free was 1.43 GiB. The historical 4 GiB preflight threshold did not preserve headroom; the next runtime push now requires a fresh capacity check with at least 6 GiB available for the current image, before starting another cold build. Disk warning remains at 92% used. Further image removal needs a separately agreed exact set; none was removed in this release. The evidence-only follow-up uses `[skip cd]`.

## Direct public opening, S2 candidate 3.11.816

Based on `35de9fdc` / production 815. An unambiguous public-work link now validates the current publication pointer and edition, then opens its canonical material before unrelated catalog/group/full-local-list startup. Concurrent callers share the entire catalog fetch/body/validation promise; failures clear that promise for a later retry. Navigation and material identities suppress stale opens and notices. Background canon joins the existing material-import queue, setting its write gate only when its turn starts. Source, learner state, publication rights and evidence-restoration policy are unchanged by the new routing code.

The [815 baseline](direct-public-baseline-815.json) was blocked before even requesting the desired public catalog when an unrelated startup response was held. The [candidate](direct-public-candidate-816.json) opened all 499 Hamam rows with visible interactive word spans while unrelated responses remained held, made one catalog request, and preserved the reader after background startup. Closing returned to the public parent without a second request. HTTP 503 followed by the visible retry succeeded on the second request. Navigating away during either catalog or snapshot loading prevented a late open. A real A→B switch opened 679 rows, then completed the shipped canon import without replacing B or deadlocking.

The [refresh check](direct-public-refresh-816.json) reloaded while materialization was deliberately paused, preserved the requested work URL, and opened 499 rows. These use disposable anonymous Chromium and production GETs with only the candidate Room module substituted; they are **not verification of a deployed 816** or an owner-profile benchmark. The delayed-dependency timings are incidental and do not establish a normal-network speedup percentage.

The independent [cold canon regression](cold-canon-816.json) passed: 79 texts, 6646 rows with exact expected digest, competing-tab write ordering, partial rollback and interrupted-transaction recovery after browser restart. It runs a disposable local server/profile and stops the server on completion. All **2864 unit tests** and **233 i18n checks** passed; shell, Room module, SW and integrity versions target 816, shared data modules remain 815.

```powershell
node scripts/premium/reader-direct-public-smoke.js --expect-blocked --out=.tmp/reader-performance/direct-public-baseline.json # production 815 only
node scripts/premium/reader-direct-public-smoke.js --candidate --out=.tmp/reader-performance/direct-public-candidate.json
node scripts/premium/reader-refresh-link-smoke.js --candidate
node scripts/multitab/cold-canon-smoke.js
npm test
node tests/i18n.smoke.js
```

Before owner approval, release waited for the capacity gate: 2.85 GiB available, no build cache, 15 images, 11 containers and four volumes. The proposed cleanup was limited to three unreferenced historical LinguistPro images `cf642b806a9e` (813), `8e1163320319` (812), and `ef80b72ad654` (`c3fa5172`), retaining current 815 `198bf2834490` and rollback 814 `7c1049974621`, plus every container/volume/data/backup. Its subsequently approved execution is recorded below. Group/baked routes, local-copy evidence restoration and first-screen layer/DOM costs remain outside S2.

### CI fixture correction during the approved release

GitHub runs for both 815 runtime and its evidence-only follow-up failed the Room discovery locale check. The privacy harness explicitly substituted catalog v7, then expected its seven retired app-era titles from current locale dictionaries. Since 811 the shipped catalog and dictionaries use six official Ben-Yehuda periods. This failure is reproducible from the old fixture, not evidence of a newly introduced S2 translation regression.

The locale/RTL/keyboard portion now uses a separate disposable context with the actual shipped catalog, waits for the translated first title, and independently asserts all six HE/EN titles and Hebrew-only glosses. The v7 privacy, preview and learner-state fixtures retain their original checks. All eight browser groups pass locally, including fresh mobile/desktop first-screen checks and no query leakage. This changes test code only and ships with `[skip cd]` to avoid another runtime build; CI completion is recorded separately below.

### S2 production verification

The owner approved the exact three-image set. A fresh inventory confirmed no container references and no active deployment. [Pre-release cleanup](cleanup-pre-816.json) removed exactly those three images, retaining all 11 containers, four volumes, and both 815/814 images; available space increased **2.855→6.937 GiB**, satisfying the 6 GiB gate. Cache was empty. No data or backups were removed.

Runtime commit **`b6229421b1a5c18ea49230d9c7c885b08da306ab`**, deployment **2930**, started 17:50:44 UTC and finished **17:55:07 UTC** (4m23s). The lowest sampled available space during the build was 2.554 GiB; this is not a continuously measured minimum. Repeated [production verification](production-816.json) confirms **3.11.816**, **10/10 assets matching Git**, both shells, DB and migrations ready. The test-only follow-up `013e4661` did not create another Coolify deployment.

[Actual production direct-opening checks](direct-public-production-816.json), without local module substitution, passed all five scenarios: Hamam's 499 rows before held unrelated catalogs, retry after injected HTTP 503, no late open after catalog/snapshot navigation, and A→B (679 rows) followed by the real canon import without replacement. [Refresh during paused materialization](refresh-production-816.json) retained the work URL and opened 499 rows. These remain anonymous disposable-browser checks; no owner UI, learner profile or paid provider was used.

Three [earlier runs](early-timeouts-816.json) timed out: the first direct smoke before 499 visible rows (60 s), the first refresh before materialization (90 s), and the second refresh after reloading/releasing materialization but before 499 rows (90 s). Their cause was not captured. The successful reruns used the same runtime bytes and unchanged assertions/timeouts. They establish the exercised behavior, not that every cold opening is stable. O-130 records this unresolved observation; both runners now preserve HTTP/warning/DB/DOM diagnostics on failure. The first failed direct run's module hash also matched the committed candidate.

[Post-release cache-only cleanup](cleanup-post-816.json) reported **2.917 GB** reclaimed, available **3.363→5.576 GiB**. All 13 images, 11 running containers and four volumes remained. A later health sample reports 85% used / `disk_warn=true`; the next runtime build still needs a new ≥6 GiB capacity gate. The already approved three-image deletion is complete and does not authorize further image removal.

The [corrected discovery fixture](discovery-fixture-816.json) passed all eight groups locally. Runtime CI `39998410019` failed the inherited v7 locale assertion. Follow-up [CI 39998886577](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39998886577) passed that check, then exposed another stale test pin: the learning-target runner imported DB facade v812 in a dictionary already running v815, creating an uninitialized second module. The runner now reuses the single DB module URL actually loaded by the dictionary and asserts readiness; its local server also uses the standard isolated environment/ephemeral port. [Room and Studio learning-target checks](learning-targets-816.json) both pass, including parent-state preservation, scheduling, rollback, roundtrip and dictionary drill. These changes are test-only, published with `[skip cd]`; the new full CI result is recorded below when available.

### Final CI boundary: separate runtime defect remains

[CI 40001249190](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/40001249190), commit `d2b3f789`, passed unit/API/import/auth/FSRS, material identity/resume/tabs, memory canon, Room discovery and learning-target checks. It failed the next morphology gate in Room: the exact chosen `pid:5857` adverb was absent from `collectReviewItems`. Studio passed that scenario. The last SW preview step was consequently skipped; this is **not an all-green CI result**.

[Local diagnostic reproduction](morph-review-gap-816.json) confirms that the chosen occurrence is persisted and resolved correctly when supplied its sentence ID, but all 12 DOM word spans have no sentence place. The shared renderer only stamps `data-sentence-id` on the note button, which read-only Room omits; the DOM-based review scanner consequently loses occurrence-specific identity. Both `reader-core.js` and `reader-morph.js` are unchanged from 815. An older-runtime browser reproduction was not performed. The assertion remains intact, with richer failure diagnostics; O-131 records the separate renderer identity fix and parity acceptance needed. No further runtime deployment or image deletion was attempted. Production 816's direct-opening/refresh acceptance remains as documented above, with O-130 and O-131 explicitly open.

## Studio completion stability, S3 candidate 3.11.817

Base `ce0836c2`, production runtime remains 816 at this checkpoint. [Candidate check manifest](candidate-817-checks.json) records normalized runtime hashes, **2877 passing unit tests**, **233 i18n checks**, and six renderer parity cases / 37 leaf checks. The golden changed only by adding escaped sentence identity on each stored row; all pre-existing text, audio and controls remain byte-equivalent after removing that one expected attribute.

The candidate fixes O-131 by stamping sentence identity on the row in shared core and Classic, independent of edit controls. The original isolated Room morphology scenario now completes with chosen adverb `pid:5857`, review collection and portable reimport intact. Full CI/production confirmation is still required.

Classic and IDE now patch only transliteration text nodes after background derivation. The job yields after an 8 ms processing slice, checks its table/material/profile/row ownership, skips active editors and selected text, retains replay nodes/listeners and never changes the models. An early candidate read browser selection after every cell mutation; isolated Chromium exposed forced layouts and unfinished long-table patches. Reading the selection once before each slice removed that implementation defect; the regression test locks the read count. No timeout increase was used to make the final check pass. Linux CI then exposed 4.515625 px of accumulated row-layout drift in the 380px Classic case, despite unchanged scroll position and editor/row height. The final candidate reads a visible editor anchor before and after the entire patch and corrects residual drift in its scroll container; wheel, touch, pointer, key input or a superseded material cancels this correction. It does not read geometry between slices. Three additional unit cases cover correction, user scrolling and cancellation. Updated desktop/mobile observations below use this final code; the Linux rerun is pending.

The controlled comparison holds derivation until an editor and replay fixture are mounted, then lets the real local engine complete. The unrelated morphology status boundary is deliberately held, so these are completion-phase observations, **not a full-startup or normal-network benchmark**. One desktop observation per surface:

| Surface | 816 completion / longest task | Candidate completion / longest task | Table renders |
| --- | --- | --- | --- |
| Classic, 2500 rows | 3261.86 / 1063 ms | 2731.71 / 71 ms | 2 → 1 |
| IDE, 2500 rows | 3016.71 / 1094 ms | 2172.01 / 61 ms | 2 → 1 |

[Baseline](studio-translit-baseline-816.json) loses the editor, focus and replay node on its second render. [Candidate desktop](studio-translit-candidate-817.json) retains all of them, caret selection 4–9, manual Latin text, source-model equality and the visible row (0 px shift), and suppresses a late fill after a new mount. [380px Hebrew/RTL viewport](studio-translit-mobile-817.json) passes the same invariants; these are viewport checks, not a physical-device measurement. No percentile or general percentage gain is claimed.

Saved word layers now start before full status painting. The shared host binds to the active Classic/IDE container, detaches old listeners on mode changes, and gives status/gloss passes material/mount/revision guards. IDE now labels all cell columns for the shared resolver. If the Russian column is hidden, the contextual row key uses its bound canonical source translation rather than becoming empty; paid results and occurrence-specific manual corrections retain their identity, while changed source content still invalidates an old result.

The [Classic context fixture](studio-context-classic-817.json) and [IDE context fixture](studio-context-ide-817.json) each use 34 paragraphs × 60 words. Both confirm B's saved manual glosses appear while A's status pass is still held, A's late completion cannot paint B, hiding RU preserves context, the mobile RTL card shows the saved manual meaning, and switching modes preserves the canonical word card. Paid requests and review-log rows are both zero. No owner profile was used, and no linguistic-accuracy claim is made from synthetic text.

Reproduce from the worktree:

```powershell
node scripts/premium/studio-translit-responsive-smoke.js --baseline --ref=ce0836c2 --out=.tmp/reader-performance/studio-translit-baseline-816.json
node scripts/premium/studio-translit-responsive-smoke.js --out=.tmp/reader-performance/studio-translit-final-817.json
node scripts/premium/studio-translit-responsive-smoke.js --mobile --out=.tmp/reader-performance/studio-translit-mobile-final-817.json
node scripts/premium/studio-saved-context-smoke.js
node scripts/premium/studio-saved-context-smoke.js --ide
node scripts/premium/reader-parity-smoke.js
npm test
node tests/i18n.smoke.js
```

Preflight is **5.576 GiB available / cache 0 B**, below the required 6 GiB for the next cold build. Unreferenced 814 image `7c1049974621` is a candidate only; it has not been deleted or approved for deletion. Current 816 `3f6ed6b9e6db` and rollback 815 `198bf2834490`, containers, volumes, data and backups must be retained. Runtime push waits for the complete candidate CI and the exact cleanup decision. O-130's earlier cold-open timeouts remain unresolved; this stage does not claim to have diagnosed them. S4/S5 remain subsequent stages.


## S3 production 3.11.817 and the remaining cold-open race

Owner-approved cleanup removed only unused 814 image `7c1049974621`, retaining 816/815, all 11 containers and four volumes; [available space rose 5.575 to 6.936 GiB](cleanup-pre-817.json). Runtime `a0621a7161668325b088759fdecfad5ad6d38767`, [deployment 2931](deployment-817.json), ran 19:57:58–20:02:24 UTC (4m26s). The lowest discrete available-space sample was 2.778 GiB, not a continuous minimum. [Repeated production verification](production-817.json) matched 14/14 assets, both shells and the dictionary context pin; DB and migrations are ready. [Cache-only cleanup](cleanup-post-817.json) reclaimed 2.917 GB, 3.360→5.574 GiB, preserving all 13 images, 11 containers and four volumes. Later health still reports 85% used / disk_warn=true; another build requires a fresh ≥6 GiB gate.

[Runtime CI 40013512908](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/40013512908), main runtime CI 40015524868, and [test follow-up CI 40016702838](ci-followup-817.json) passed. [Linux Studio evidence](studio-ci-817.json) includes the corrected 4.515625→-0.484375 px mobile drift. Test-only `4f1c45fa` adds an explicit fully-visible-editor assertion after the replay fixture has changed layout and expands bootstrap failure diagnostics; it did not trigger another deployment. All runtime bytes remain `a0621a71`.

Actual served-code checks passed for [desktop](studio-translit-production-817.json) and [mobile RTL](studio-translit-mobile-production-817.json): a single table render, preserved editor/caret/replay/manual text/model, fully visible editor before and after, and suppressed late work. [Classic](studio-context-classic-production-817.json) and [IDE](studio-context-ide-production-817.json) retained saved context before status, manual evidence with hidden RU, mobile word cards and mode switching. [Room occurrence correction](morph-production-817.json) retained `pid:5857` through review/export; production GET-only network guard and disposable synthetic OPFS were used. No owner profile or paid generation was involved.

The [first Studio context run](early-timeouts-817.json) timed out at DB/module readiness; Classic/IDE reruns passed with unchanged runtime and timeout, after adding diagnostics. Its cause remains unknown. The [direct Hamam check failed](direct-public-first-failure-817.json) despite HTTP 200 catalog/snapshot and DB ready: no Reader rows, parent catalogue visible. A controlled [baseline reproduction](refresh-during-open-baseline-817.json) holds initial DB change notifications until the snapshot request, then dispatches one real localdb:changed event: epoch stays 1, corpusRenderToken changes 1→2, the requested material is cancelled and rows stay 0. The same request with a candidate that defers external projection refresh while the initial material route is current opens 499 rows with token unchanged. Navigation cancellation must remain active. O-130 is therefore still open, now with a confirmed Room mechanism and a separate unexplained Studio readiness timeout. S3's Studio acceptance passed; full cold-open acceptance is not claimed.


## Initial public opening: candidate 3.11.818

The change records the current initial public-open operation while it awaits live publication, catalogue and snapshot/materialization. `refreshExternalLibrary` still records dirty domains, but defers its catalogue projection while that operation's existing epoch/render-token predicate is current. A `finally` clears only the operation it owns; A's late completion cannot clear B. Explicit navigation keeps invalidating the route through the existing guards, and later refresh consumes the retained dirty flags. No source/learner data, permissions, publication validation or schema changes are involved.

[Candidate manifest](candidate-818-checks.json): 2879 unit tests and 233 i18n checks passed. [Baseline isolated browser](initial-refresh-baseline-817.json) on runtime 817 deterministically changes token 1→2 and ends with 0 rows. [The same browser pipeline on the candidate](initial-refresh-candidate-818.json) holds the publication, catalogue and snapshot boundaries separately, releases one real localdb:changed event and opens both fixture rows with unchanged token and retained dirty domains. Initial setup notifications are explicitly held in this fixture to make the event timing deterministic. Unit tests additionally cover deferred refresh consumption and A/B ownership. This regression is now a CI step.

[Actual public data with only the candidate Reader module substituted](direct-public-candidate-818.json) passed Hamam's 499 rows before unrelated dependencies, HTTP 503 retry, catalog/snapshot navigation cancellation and A→B to 679 rows followed by the real background canon import. [Refresh during paused materialization](refresh-candidate-818.json) retains the URL and opens 499 rows. These are candidate-module checks, not production 818 acceptance or a full-startup timing benchmark. A [separate controlled public-data event injection](refresh-during-open-candidate-818.json) also opens 499 rows without changing token. The unexplained Studio bootstrap timeout remains open.

Production remains 817. Full candidate CI is pending. Current preflight: about 5.574 GiB available, cache 0 B, no active deployments. Unreferenced 815 image `198bf2834490` (`0e059364`) is only a proposed cleanup candidate; its removal has not been approved. Keep current 817 `c139122a8def` and rollback 816 `3f6ed6b9e6db`, every container/volume and all data/backups. A fresh ≥6 GiB gate is required before another runtime push.


## Production 3.11.818: initial material opening survives DB refresh

After the owner's exact approval, [cleanup removed only unused 815 image `198bf2834490`](cleanup-pre-818.json). Current 817 and rollback 816, all 11 containers and four volumes remained; available space rose **5.573→6.935 GiB** and no other deployment was active. Runtime **`0d8a88497dd8ba145f7bb09ccf279e2acd164218`**, [deployment 2932](deployment-818.json), ran **20:37:12–20:41:28 UTC (4m16s)**. The lowest discrete release sample was 3.359 GiB (3.438 while status was in progress), not a continuously measured build minimum.

[Repeated served-release verification](production-818.json) confirms **14/14 assets matching Git**, both shells at 3.11.818, the dictionary's shared context pin, and DB/migrations ready. [Runtime PR CI 40018736303](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/40018736303), runtime main CI 40020625999 and [test follow-up CI 40021305977](ci-followup-818.json) all passed. Test-only `58ae10b3` adds an exact-version remote mode to the regression runner; it did not create another deployment. Production remains the runtime commit above.

The [served-production boundary check](initial-refresh-production-818.json) uses synthetic publications at the production origin and actual served code, without a local runtime substitution. At publication, catalogue and snapshot boundaries, one real localdb:changed event retains dirty flags without changing the route token, and the requested Reader opens. [Actual public-work checks](direct-public-production-818.json) pass all five scenarios: Hamam's **499 rows** before held unrelated dependencies, HTTP 503 retry, catalog/snapshot navigation cancellation, and A→B to **679 rows** followed by the real background canon import. [Refresh during paused materialization](refresh-production-818.json) retains the selected work URL and opens 499 rows. The tested Reader hash equals the committed candidate manifest. These are behavior gates, not a claim that all cold starts are under one second or a full-startup speed percentage.

Both [Classic](studio-context-classic-production-818.json) and [IDE](studio-context-ide-production-818.json) saved-context production checks also pass on 34 long paragraphs: context before status, late-A suppression, hidden RU, manual evidence, mobile RTL cards and mode switching. Paid requests and review-log rows are zero in these disposable fixtures; the owner profile was not opened or mutated. The earlier unexplained Studio readiness timeout remains **O-132**. O-130 is closed for the specifically reproduced Room cancellation; this does not retrospectively attribute every earlier undiagnosed timeout to that cause.

[Post-release cache-only cleanup](cleanup-post-818.json) reclaimed **2.917 GB**, increasing available space **3.351→5.565 GiB** while retaining all **13 images, 11 containers and four volumes**, including both rollback images. The later health sample is 85% used / disk_warn=true; a future runtime build still requires a fresh ≥6 GiB capacity gate. No further image removal, data or backup cleanup was performed.

Reproduce the served-code regression with disposable synthetic storage:

```powershell
node scripts/premium/reader-initial-refresh-smoke.js --base=https://linguistpro.kolosei.com --version=3.11.818 --out=.tmp/reader-performance/initial-refresh-production-818.json
node scripts/premium/reader-direct-public-smoke.js --out=.tmp/reader-performance/direct-public-production-818.json
node scripts/premium/reader-refresh-link-smoke.js
python scripts/premium/verify-material-read-release.py --commit=0d8a8849 --version=3.11.818 --out=.tmp/reader-performance/production-818.json
```

## Studio startup: O-132 checked before S4

The owner prioritized the unexplained Studio readiness timeout before visible-row scheduling. [Twelve sequential production 818 starts](studio-startup-818.json) passed: six fresh disposable OPFS profiles and six same-profile document reloads. Cold-profile DB/module readiness was **2.77–3.32 s** (median 2.91 s); reload was **1.99–4.37 s** (median 3.13 s). The probe samples readiness every 50 ms and at capture. There were no pageerrors, denied application writes or paid requests. Routing disables HTTP cache, service workers are blocked, and the content-free DB phase journal is enabled. These are empty-profile startup observations, not owner-database timings, material-open timings, an optimization comparison or proof that an intermittent failure is fixed.

The new `studio-startup-diagnostic.cjs` captures individual DB-module, DB-ready, StudioMorph and WordGlossAI transitions, worker lifetime, init errors, completed resource timings, failed HTTP/network requests and the bounded content-free DB phase journal **before retry**. Pending network requests are also captured by the completed probe. Three isolated local faults validate different diagnoses: [blocked WordGlossAI module](studio-startup-fault-module.json) leaves the DB ready and gloss absent; [blocked worker entry](studio-startup-fault-worker.json) records `DB_WORKER_CRASHED`; [held WASM module import](studio-startup-fault-wasm.json) leaves the DB unready with a pending import and `loading-wasm-sync-module` phase. Injected faults use a five-second observation window; the real startup timeout remains **60 seconds**. These are diagnostic checks, not reproductions of the original cause.

The original saved-context runner now enables and retains the same DB journal/init-error evidence on failure as well as success. [Classic and IDE regression checks](studio-startup-context-checks.json) still pass: saved manual context, status independence, late-A suppression, hidden translation, mobile RTL cards and mode switching, with no paid calls or review rows. No application runtime, database schema, owner profile or production deployment changed. **O-132 remains open because the original cause did not recur.** Its bounded diagnostic investigation precedes S4; independent S4 work may now continue, with the original-failure evidence preserved for a recurrence.

Reproduce without an owner profile:

```powershell
node scripts/premium/studio-startup-diagnostic.cjs --base=https://linguistpro.kolosei.com --version=3.11.818 --rounds=6
node scripts/premium/studio-startup-diagnostic.cjs --fault=module --rounds=1
node scripts/premium/studio-startup-diagnostic.cjs --fault=worker --rounds=1
node scripts/premium/studio-startup-diagnostic.cjs --fault=wasm --rounds=1
```
